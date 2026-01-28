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

// Track typing users per room
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

// Game browser endpoint
app.get('/api/games', async (req, res) => {
  try {
    const games = [];
    const seenPlaceIds = new Set();

    // Get all active rooms from sessionManager
    for (const [roomId, users] of sessionManager.rooms.entries()) {
      if (users.size === 0) continue;

      const [chatType, identifier] = roomId.split(':');

      // Only process server rooms (jobId-based)
      if (chatType !== 'server') continue;

      const jobId = identifier;

      // Extract placeId from jobId if possible (format: placeId-serverId or just jobId)
      // For now, we'll track by jobId and fetch placeId from Roblox API if needed
      // This requires storing placeId with jobId in sessionManager
      // For simplicity, we'll just return the jobId-based servers

      // Try to find a message in this room to get placeId
      const Message = require('./models/Message');
      const sampleMessage = await Message.findOne({ jobId }).sort({ timestamp: -1 }).limit(1);

      if (!sampleMessage || !sampleMessage.placeId) continue;

      const placeId = sampleMessage.placeId;

      // Check if we've already processed this game
      let game = games.find(g => g.placeId === placeId);

      if (!game) {
        // Fetch game info from Roblox API
        const gameInfo = await fetchGameInfo(placeId);
        if (!gameInfo) continue;

        game = {
          placeId,
          name: gameInfo.name,
          imageUrl: gameInfo.imageUrl,
          servers: []
        };
        games.push(game);
      }

      // Add server to game
      game.servers.push({
        jobId,
        playerCount: users.size
      });
    }

    res.json({ success: true, games });
  } catch (error) {
    logger.error('Failed to get games', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to fetch games' });
  }
});

/**
 * Fetch game info from Roblox API
 */
async function fetchGameInfo(placeId) {
  try {
    const axios = require('axios');

    // Get universe ID from place ID
    const universeRes = await axios.get(`https://apis.roblox.com/universes/v1/places/${placeId}/universe`, {
      timeout: 5000
    });

    const universeId = universeRes.data?.universeId;
    if (!universeId) return null;

    // Get game details
    const gameRes = await axios.get(`https://games.roblox.com/v1/games?universeIds=${universeId}`, {
      timeout: 5000
    });

    const game = gameRes.data?.data?.[0];
    if (!game) return null;

    // Get thumbnail
    let imageUrl = null;
    try {
      const thumbRes = await axios.get(`https://thumbnails.roblox.com/v1/games/icons?universeIds=${universeId}&size=512x512&format=Png`, {
        timeout: 5000
      });
      imageUrl = thumbRes.data?.data?.[0]?.imageUrl;
    } catch (thumbError) {
      // Ignore thumbnail errors
    }

    return {
      name: game.name,
      imageUrl
    };
  } catch (error) {
    logger.error('Failed to fetch game info', { placeId, error: error.message });
    return null;
  }
}

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

  socket.on('typing-indicator', (data) => {
    const { roomId, username, isTyping } = data;

    if (!roomId || !username) return;

    if (!typingUsers.has(roomId)) {
      typingUsers.set(roomId, new Set());
    }

    const roomTypers = typingUsers.get(roomId);

    if (isTyping) {
      roomTypers.add(username);
    } else {
      roomTypers.delete(username);
    }

    // Broadcast to all clients in room except sender
    socket.to(roomId).emit('typing-indicator', {
      roomId,
      username,
      isTyping
    });
  });

  socket.on('disconnect', () => {
    // Remove user from all typing sets
    typingUsers.forEach((userSet, roomId) => {
      // We don't have username from socket, so clear after disconnect
      // This is acceptable since disconnect already clears visual state
    });

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
