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

  socket.on('disconnect', () => {
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
