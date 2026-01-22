const logger = require('../logging/logger');
const Message = require('../models/Message');

/**
 * Session Manager
 * Tracks active users in each chat session and cleans up empty sessions
 */
class SessionManager {
  constructor() {
    // Track active users per room: { roomId: Set<socketId> }
    this.rooms = new Map();

    // Track cleanup timers per room: { roomId: timeoutId }
    this.cleanupTimers = new Map();

    // Cleanup delay: 1 minute (60000ms)
    this.CLEANUP_DELAY = 60000;
  }

  /**
   * Join a room
   */
  joinRoom(socketId, roomId) {
    // Cancel cleanup timer if exists
    if (this.cleanupTimers.has(roomId)) {
      clearTimeout(this.cleanupTimers.get(roomId));
      this.cleanupTimers.delete(roomId);
      logger.info('Cleanup timer cancelled - user rejoined', { roomId });
    }

    // Add user to room
    if (!this.rooms.has(roomId)) {
      this.rooms.set(roomId, new Set());
    }
    this.rooms.get(roomId).add(socketId);

    logger.info('User joined room', {
      socketId,
      roomId,
      activeUsers: this.rooms.get(roomId).size
    });
  }

  /**
   * Leave a room
   */
  leaveRoom(socketId, roomId) {
    if (!this.rooms.has(roomId)) {
      return;
    }

    // Remove user from room
    this.rooms.get(roomId).delete(socketId);
    const activeUsers = this.rooms.get(roomId).size;

    logger.info('User left room', { socketId, roomId, activeUsers });

    // If room is empty, start cleanup timer
    if (activeUsers === 0) {
      this.startCleanupTimer(roomId);
    }
  }

  /**
   * Handle socket disconnect - remove from all rooms
   */
  handleDisconnect(socketId) {
    for (const [roomId, users] of this.rooms.entries()) {
      if (users.has(socketId)) {
        this.leaveRoom(socketId, roomId);
      }
    }
  }

  /**
   * Start cleanup timer for empty room
   */
  startCleanupTimer(roomId) {
    logger.info('Starting cleanup timer for empty room', {
      roomId,
      delayMs: this.CLEANUP_DELAY
    });

    const timerId = setTimeout(async () => {
      await this.cleanupRoom(roomId);
    }, this.CLEANUP_DELAY);

    this.cleanupTimers.set(roomId, timerId);
  }

  /**
   * Clean up room - delete all messages
   */
  async cleanupRoom(roomId) {
    try {
      // Double-check room is still empty
      const activeUsers = this.rooms.get(roomId)?.size || 0;
      if (activeUsers > 0) {
        logger.info('Room no longer empty, skipping cleanup', {
          roomId,
          activeUsers
        });
        return;
      }

      // Parse roomId to get chatType and identifier
      // Format: "server:jobId" or "global:placeId"
      const [chatType, identifier] = roomId.split(':');

      if (!chatType || !identifier) {
        logger.error('Invalid roomId format', { roomId });
        return;
      }

      // Build query
      const query = { chatType };
      if (chatType === 'server') {
        query.jobId = identifier;
      } else if (chatType === 'global') {
        query.placeId = identifier;
      } else {
        logger.error('Unknown chatType', { chatType, roomId });
        return;
      }

      // Delete all messages for this session
      const result = await Message.deleteMany(query);

      logger.info('Room cleaned up - messages deleted', {
        roomId,
        chatType,
        identifier,
        deletedCount: result.deletedCount
      });

      // Remove room from tracking
      this.rooms.delete(roomId);
      this.cleanupTimers.delete(roomId);

    } catch (error) {
      logger.error('Failed to cleanup room', {
        roomId,
        error: error.message
      });
    }
  }

  /**
   * Get active users count for a room
   */
  getRoomUserCount(roomId) {
    return this.rooms.get(roomId)?.size || 0;
  }
}

// Export singleton instance
module.exports = new SessionManager();
