const { io } = require('socket.io-client');
const logger = require('../logging/logger');
const { sanitizeError } = require('../utils/sanitizer');

/**
 * Socket.io Client Manager
 * Manages connection to backend server and room subscriptions
 */
class SocketClient {
  constructor() {
    this.socket = null;
    this.connected = false;
    this.currentRooms = new Set(); // Track joined rooms
    this.BACKEND_URL = 'https://ro-chat-zqks.onrender.com';
  }

  /**
   * Connect to Socket.io server
   */
  connect() {
    if (this.socket && this.connected) {
      logger.info('Socket already connected');
      return;
    }

    logger.info('Connecting to Socket.io server', { url: this.BACKEND_URL });

    this.socket = io(this.BACKEND_URL, {
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: Infinity
    });

    this.socket.on('connect', () => {
      this.connected = true;
      logger.info('Socket connected', { socketId: this.socket.id });

      // Rejoin all previously joined rooms
      this.rejoinRooms();
    });

    this.socket.on('disconnect', (reason) => {
      this.connected = false;
      logger.info('Socket disconnected', { reason });
    });

    this.socket.on('connect_error', (error) => {
      logger.error('Socket connection error', sanitizeError({ error: error.message }));
    });

    this.socket.on('message', (data) => {
      logger.info('Message received from server', { data });
    });

    this.socket.on('typing-indicator', (data) => {
      logger.info('Typing indicator received', { data });
    });
  }

  /**
   * Disconnect from Socket.io server
   */
  disconnect() {
    if (this.socket) {
      logger.info('Disconnecting socket');
      this.currentRooms.clear();
      this.socket.disconnect();
      this.socket = null;
      this.connected = false;
    }
  }

  /**
   * Join a room (server or global chat)
   */
  joinRoom(jobId, placeId) {
    if (!this.socket || !this.connected) {
      logger.warn('Cannot join room - socket not connected');
      return;
    }

    // Leave old rooms first
    this.leaveAllRooms();

    // Join both server and global rooms for current game
    const serverRoom = `server:${jobId}`;
    const globalRoom = `global:${placeId}`;

    this.socket.emit('join-room', serverRoom);
    this.socket.emit('join-room', globalRoom);

    this.currentRooms.add(serverRoom);
    this.currentRooms.add(globalRoom);

    logger.info('Joined rooms');
  }

  /**
   * Leave all rooms
   */
  leaveAllRooms() {
    if (!this.socket) return;

    for (const roomId of this.currentRooms) {
      this.socket.emit('leave-room', roomId);
    }

    if (this.currentRooms.size > 0) {
      logger.info('Left all rooms');
    }

    this.currentRooms.clear();
  }

  /**
   * Rejoin rooms after reconnection
   */
  rejoinRooms() {
    if (!this.socket || !this.connected) return;

    const rooms = Array.from(this.currentRooms);
    if (rooms.length === 0) return;

    logger.info('Rejoining rooms after reconnection');

    for (const roomId of rooms) {
      this.socket.emit('join-room', roomId);
    }
  }

  /**
   * Check if socket is connected
   */
  isConnected() {
    return this.connected;
  }

  /**
   * Emit typing indicator
   */
  emitTyping(roomId, username, isTyping) {
    if (!this.socket || !this.connected) {
      return;
    }

    this.socket.emit('typing-indicator', {
      roomId,
      username,
      isTyping
    });
  }

  /**
   * Get list of active games/servers
   */
  async getGames() {
    try {
      const axios = require('axios');
      const response = await axios.get(`${this.BACKEND_URL}/api/games`, {
        timeout: 10000
      });

      if (response.data.success) {
        return response.data.games;
      }

      return [];
    } catch (error) {
      logger.error('Failed to get games', sanitizeError({ error: error.message }));
      return [];
    }
  }
}

// Export singleton instance
module.exports = new SocketClient();
