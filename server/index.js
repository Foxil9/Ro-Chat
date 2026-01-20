const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const logger = require('./logging/logger');
const authRoutes = require('./routes/auth');
const chatRoutes = require('./routes/chat');
const authMiddleware = require('./middleware/authMiddleware');

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
app.use('/api/chat', authMiddleware, chatRoutes);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: Date.now() });
});

// Socket.io connection handling
io.on('connection', (socket) => {
  logger.info('Client connected', { socketId: socket.id });

  socket.on('join-room', (jobId) => {
    socket.join(jobId);
    logger.info('Client joined room', { socketId: socket.id, jobId });
  });

  socket.on('leave-room', (jobId) => {
    socket.leave(jobId);
    logger.info('Client left room', { socketId: socket.id, jobId });
  });

  socket.on('disconnect', () => {
    logger.info('Client disconnected', { socketId: socket.id });
  });
});

// Export io for use in routes
module.exports.io = io;

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  logger.info(`Server listening on port ${PORT}`);
});
