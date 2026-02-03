// Load environment variables from .env file
require('dotenv').config();

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const logger = require('./logging/logger');
const connectDatabase = require('./config/database');
const authRoutes = require('./routes/auth');
const chatRoutes = require('./routes/chat');
const oauthRoutes = require('./routes/oauth');
const authMiddleware = require('./middleware/authMiddleware');
const sessionManager = require('./utils/sessionManager');
const { validateMessage, sanitizeMessage } = require('./utils/messageValidator');

const app = express();
const server = http.createServer(app);

// Allowed origins for CORS - restrict to known clients only
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '').split(',').filter(Boolean);

// Initialize Socket.io with restricted CORS
const io = new Server(server, {
  cors: {
    origin: function (origin, callback) {
      // Allow requests with no origin (desktop/Electron clients, server-to-server)
      if (!origin) {
        return callback(null, true);
      }
      // Allow configured origins
      if (ALLOWED_ORIGINS.length > 0 && ALLOWED_ORIGINS.includes(origin)) {
        return callback(null, true);
      }
      // Allow file:// protocol (Electron renderer)
      if (origin === 'file://') {
        return callback(null, true);
      }
      // Allow localhost for development
      if (origin.startsWith('http://localhost:') || origin.startsWith('https://localhost:')) {
        return callback(null, true);
      }
      logger.warn('CORS blocked origin', { origin });
      callback(new Error('CORS origin not allowed'));
    },
    methods: ['GET', 'POST']
  }
});

// Track typing users per room: Map<roomId, Set<username>>
const typingUsers = new Map();

// Socket rate limiting: track event counts per socket
const socketRateLimits = new Map();
const SOCKET_RATE_CONFIG = {
  typing: { maxPerWindow: 10, windowMs: 5000 },
  edit: { maxPerWindow: 5, windowMs: 10000 },
  delete: { maxPerWindow: 5, windowMs: 10000 },
  joinRoom: { maxPerWindow: 10, windowMs: 10000 }
};

/**
 * Check socket rate limit for a given event type
 * Returns true if request is allowed, false if rate limited
 */
function checkSocketRateLimit(socketId, eventType) {
  const config = SOCKET_RATE_CONFIG[eventType];
  if (!config) return true;

  const key = socketId + ':' + eventType;
  const now = Date.now();
  let entry = socketRateLimits.get(key);

  if (!entry || now - entry.windowStart > config.windowMs) {
    socketRateLimits.set(key, { windowStart: now, count: 1 });
    return true;
  }

  entry.count++;
  if (entry.count > config.maxPerWindow) {
    return false;
  }
  return true;
}

// Clean up socket rate limits and empty typing rooms every 60 seconds
setInterval(() => {
  const now = Date.now();

  // Clean rate limit entries older than 30 seconds
  for (const [key, entry] of socketRateLimits.entries()) {
    if (now - entry.windowStart > 30000) {
      socketRateLimits.delete(key);
    }
  }

  // Clean empty typing rooms
  for (const [roomId, typers] of typingUsers.entries()) {
    if (typers.size === 0) {
      typingUsers.delete(roomId);
    }
  }
}, 60000);

// Middleware
app.use(express.json({ limit: '16kb' }));
app.use(express.urlencoded({ extended: true, limit: '16kb' }));

// Make io available to routes
app.set('io', io);

// Import IP-based rate limiter for unauthenticated routes
const { ipRateLimiter } = require('./middleware/rateLimiter');

// Routes - auth and oauth are public but IP-rate-limited
app.use('/api/auth', ipRateLimiter, authRoutes);
app.use('/api/oauth', ipRateLimiter, oauthRoutes);
app.use('/api/chat', authMiddleware, chatRoutes);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: Date.now() });
});

// REMOVED GAME BROWSER FEATURE
// The game browser feature violates RoChat's core principle of being a lightweight overlay
// that syncs to your current game rather than a game browser. Removed to save bandwidth.

// Socket.io connection handling
io.on('connection', (socket) => {
  logger.info('Client connected', { socketId: socket.id });

  socket.on('join-room', (roomId) => {
    // Validate roomId format: must be "server:<uuid>" or "global:<digits>"
    if (!roomId || typeof roomId !== 'string' || roomId.length > 100) {
      return;
    }
    if (!/^(server:[0-9a-f-]+|global:\d+)$/i.test(roomId)) {
      logger.warn('Invalid room ID format rejected', { socketId: socket.id });
      return;
    }
    if (!checkSocketRateLimit(socket.id, 'joinRoom')) {
      return;
    }
    socket.join(roomId);
    sessionManager.joinRoom(socket.id, roomId);
    logger.info('Client joined room', { socketId: socket.id, roomId });
  });

  socket.on('leave-room', (roomId) => {
    if (!roomId || typeof roomId !== 'string' || roomId.length > 100) {
      return;
    }
    socket.leave(roomId);
    sessionManager.leaveRoom(socket.id, roomId);
    logger.info('Client left room', { socketId: socket.id, roomId });
  });

  socket.on('notifyTyping', (data) => {
    if (!data || typeof data !== 'object') return;

    const { jobId, username, isTyping } = data;

    // Validate input types and lengths
    if (!jobId || typeof jobId !== 'string' || jobId.length > 100) return;
    if (!username || typeof username !== 'string' || username.length > 50) return;
    if (typeof isTyping !== 'boolean') return;

    // Rate limit typing events
    if (!checkSocketRateLimit(socket.id, 'typing')) return;

    // Sanitize username - strip anything that isn't alphanumeric or underscore
    const safeUsername = username.replace(/[^a-zA-Z0-9_]/g, '').substring(0, 50);
    if (!safeUsername) return;

    const roomId = `server:${jobId}`;

    if (!typingUsers.has(roomId)) {
      typingUsers.set(roomId, new Set());
    }

    const roomTypers = typingUsers.get(roomId);

    if (isTyping) {
      roomTypers.add(safeUsername);
    } else {
      roomTypers.delete(safeUsername);
    }

    socket.currentUsername = safeUsername;
    socket.currentRoomId = roomId;

    io.to(roomId).emit('typingIndicator', {
      typingUsers: Array.from(roomTypers)
    });
  });

  socket.on('disconnect', () => {
    if (socket.currentUsername && socket.currentRoomId) {
      const roomTypers = typingUsers.get(socket.currentRoomId);
      if (roomTypers) {
        roomTypers.delete(socket.currentUsername);
        io.to(socket.currentRoomId).emit('typingIndicator', {
          typingUsers: Array.from(roomTypers)
        });
      }
    }

    sessionManager.handleDisconnect(socket.id);
    logger.info('Client disconnected', { socketId: socket.id });
  });
  socket.on('editMessage', async (data) => {
    try {
      if (!data || typeof data !== 'object') return;

      const { messageId, userId, newContent } = data;

      // Validate messageId format (MongoDB ObjectId = 24 hex chars)
      if (!messageId || typeof messageId !== 'string' || !/^[0-9a-fA-F]{24}$/.test(messageId)) {
        socket.emit('messageEditError', { error: 'Invalid message ID' });
        return;
      }

      // Validate userId
      if (!userId || typeof userId !== 'string' || userId.length > 50) {
        socket.emit('messageEditError', { error: 'Invalid user ID' });
        return;
      }

      // Validate and sanitize newContent using the same rules as /send
      if (!newContent || typeof newContent !== 'string') {
        socket.emit('messageEditError', { error: 'Message content required' });
        return;
      }

      const validation = validateMessage(newContent);
      if (!validation.valid) {
        socket.emit('messageEditError', { error: validation.error });
        return;
      }

      const sanitizedContent = sanitizeMessage(newContent);

      // Rate limit edit events
      if (!checkSocketRateLimit(socket.id, 'edit')) {
        socket.emit('messageEditError', { error: 'Too many edits. Please wait.' });
        return;
      }

      // Find and update message in database
      const Message = require('./models/Message');
      const message = await Message.findById(messageId);

      if (!message) {
        socket.emit('messageEditError', { error: 'Message not found' });
        return;
      }

      // Verify user owns the message
      if (message.userId !== userId) {
        socket.emit('messageEditError', { error: 'Unauthorized' });
        return;
      }

      // Update message with sanitized content
      message.message = sanitizedContent;
      message.editedAt = new Date();
      await message.save();

      // Broadcast to all users in the room
      const roomId = message.chatType === 'server'
        ? `server:${message.jobId}`
        : `global:${message.placeId}`;

      io.to(roomId).emit('messageEdited', {
        messageId,
        newContent: sanitizedContent,
        editedAt: message.editedAt
      });

      logger.info('Message edited', { messageId });
    } catch (error) {
      logger.error('Failed to edit message', { error: error.message });
      socket.emit('messageEditError', { error: 'Failed to edit message' });
    }
  });
  
  socket.on('deleteMessage', async (data) => {
    try {
      if (!data || typeof data !== 'object') return;

      const { messageId, userId } = data;

      // Validate messageId format (MongoDB ObjectId = 24 hex chars)
      if (!messageId || typeof messageId !== 'string' || !/^[0-9a-fA-F]{24}$/.test(messageId)) {
        socket.emit('messageDeleteError', { error: 'Invalid message ID' });
        return;
      }

      // Validate userId
      if (!userId || typeof userId !== 'string' || userId.length > 50) {
        socket.emit('messageDeleteError', { error: 'Invalid user ID' });
        return;
      }

      // Rate limit delete events
      if (!checkSocketRateLimit(socket.id, 'delete')) {
        socket.emit('messageDeleteError', { error: 'Too many deletes. Please wait.' });
        return;
      }

      // Find message in database
      const Message = require('./models/Message');
      const message = await Message.findById(messageId);

      if (!message) {
        socket.emit('messageDeleteError', { error: 'Message not found' });
        return;
      }

      // Verify user owns the message
      if (message.userId !== userId) {
        socket.emit('messageDeleteError', { error: 'Unauthorized' });
        return;
      }

      // Get room before deleting
      const roomId = message.chatType === 'server'
        ? `server:${message.jobId}`
        : `global:${message.placeId}`;

      // Delete message from database
      await Message.findByIdAndDelete(messageId);

      // Broadcast to all users in the room
      io.to(roomId).emit('messageDeleted', { messageId });

      logger.info('Message deleted', { messageId });
    } catch (error) {
      logger.error('Failed to delete message', { error: error.message });
      socket.emit('messageDeleteError', { error: 'Failed to delete message' });
    }
  });
});

// Export io for use in routes
module.exports.io = io;

const PORT = process.env.PORT || 3000;

// Connect to database and start server
connectDatabase().then(() => {
  server.listen(PORT, '0.0.0.0', () => {
    logger.info(`Server listening on port ${PORT} on 0.0.0.0`);
  });
}).catch((error) => {
  logger.error('Failed to start server', { error: error.message });
  process.exit(1);
});
