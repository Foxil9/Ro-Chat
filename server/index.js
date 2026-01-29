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

const app = express();
const server = http.createServer(app);

// Initialize Socket.io
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// Track typing users per room: Map<roomId, Set<username>>
const typingUsers = new Map();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Make io available to routes
app.set('io', io);

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/oauth', oauthRoutes);
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
    socket.join(roomId);
    sessionManager.joinRoom(socket.id, roomId);
    logger.info('Client joined room', { socketId: socket.id, roomId });
  });

  socket.on('leave-room', (roomId) => {
    socket.leave(roomId);
    sessionManager.leaveRoom(socket.id, roomId);
    logger.info('Client left room', { socketId: socket.id, roomId });
  });

  socket.on('notifyTyping', (data) => {
    const { jobId, username, isTyping } = data;

    if (!jobId || !username) return;

    const roomId = `server:${jobId}`;

    if (!typingUsers.has(roomId)) {
      typingUsers.set(roomId, new Set());
    }

    const roomTypers = typingUsers.get(roomId);

    if (isTyping) {
      roomTypers.add(username);
    } else {
      roomTypers.delete(username);
    }

    // Store username on socket for cleanup on disconnect
    socket.currentUsername = username;
    socket.currentRoomId = roomId;

    // Broadcast current list of typing users to all clients in room
    io.to(roomId).emit('typingIndicator', {
      typingUsers: Array.from(roomTypers)
    });
  });

  socket.on('editMessage', async (data) => {
    const { messageId, userId, newContent } = data;

    if (!messageId || !userId || !newContent) {
      socket.emit('messageEditError', { error: 'Missing required fields' });
      return;
    }

    try {
      const Message = require('./models/Message');
      const message = await Message.findById(messageId);

      if (!message) {
        socket.emit('messageEditError', { error: 'Message not found' });
        return;
      }

      if (message.userId !== userId) {
        socket.emit('messageEditError', { error: 'Unauthorized' });
        return;
      }

      message.message = newContent;
      message.editedAt = new Date();
      await message.save();

      const roomId = message.chatType === 'server'
        ? `server:${message.jobId}`
        : `global:${message.placeId}`;

      io.to(roomId).emit('messageUpdated', {
        messageId: message._id.toString(),
        message: message.message,
        editedAt: message.editedAt,
        deletedAt: message.deletedAt
      });

      logger.info('Message edited', { messageId, userId });
    } catch (error) {
      logger.error('Failed to edit message', { error: error.message, messageId, userId });
      socket.emit('messageEditError', { error: 'Failed to edit message' });
    }
  });

  socket.on('deleteMessage', async (data) => {
    const { messageId, userId } = data;

    if (!messageId || !userId) {
      socket.emit('messageDeleteError', { error: 'Missing required fields' });
      return;
    }

    try {
      const Message = require('./models/Message');
      const message = await Message.findById(messageId);

      if (!message) {
        socket.emit('messageDeleteError', { error: 'Message not found' });
        return;
      }

      if (message.userId !== userId) {
        socket.emit('messageDeleteError', { error: 'Unauthorized' });
        return;
      }

      message.message = '[deleted]';
      message.deletedAt = new Date();
      await message.save();

      const roomId = message.chatType === 'server'
        ? `server:${message.jobId}`
        : `global:${message.placeId}`;

      io.to(roomId).emit('messageUpdated', {
        messageId: message._id.toString(),
        message: message.message,
        editedAt: message.editedAt,
        deletedAt: message.deletedAt
      });

      logger.info('Message deleted', { messageId, userId });
    } catch (error) {
      logger.error('Failed to delete message', { error: error.message, messageId, userId });
      socket.emit('messageDeleteError', { error: 'Failed to delete message' });
    }
  });

  socket.on('disconnect', () => {
    // Remove user from typing state if they were typing
    if (socket.currentUsername && socket.currentRoomId) {
      const roomTypers = typingUsers.get(socket.currentRoomId);
      if (roomTypers) {
        roomTypers.delete(socket.currentUsername);

        // Broadcast updated typing list to room
        io.to(socket.currentRoomId).emit('typingIndicator', {
          typingUsers: Array.from(roomTypers)
        });
      }
    }

    sessionManager.handleDisconnect(socket.id);
    logger.info('Client disconnected', { socketId: socket.id });
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
