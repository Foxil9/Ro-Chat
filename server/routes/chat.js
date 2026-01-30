const express = require('express');
const router = express.Router();
const logger = require('../logging/logger');
const Message = require('../models/Message');
const axios = require('axios');
const { rateLimiter } = require('../middleware/rateLimiter');
const { validateMessage, sanitizeMessage } = require('../utils/messageValidator');

// Track last global message time per user for high-traffic cooldown
const userGlobalMessageTimes = new Map();

/**
 * Send a chat message
 * Rate limiting applied via middleware
 */
router.post('/send', rateLimiter, async (req, res) => {
  try {
    const { jobId, placeId, chatType, message } = req.body;
    const { userId, username } = req.user;

    // Additional global chat cooldown for high-traffic scenarios (100+ users)
    if (chatType === 'global' && placeId) {
      const io = req.app.get('io');
      const globalRoom = `global:${placeId}`;
      const roomSize = io.sockets.adapter.rooms.get(globalRoom)?.size || 0;

      // If 100+ users, enforce 10-second cooldown
      if (roomSize >= 100) {
        const userKey = `${userId}_${placeId}`;
        const lastGlobalMessage = userGlobalMessageTimes.get(userKey) || 0;
        const now = Date.now();
        const timeSinceLastMessage = now - lastGlobalMessage;
        const GLOBAL_COOLDOWN_MS = 10000; // 10 seconds

        if (timeSinceLastMessage < GLOBAL_COOLDOWN_MS) {
          const remainingSeconds = Math.ceil((GLOBAL_COOLDOWN_MS - timeSinceLastMessage) / 1000);
          logger.warn('Global chat cooldown active', { userId, roomSize, remainingSeconds });
          return res.status(429).json({
            success: false,
            error: `High traffic! Please wait ${remainingSeconds} seconds before sending another message.`,
            retryAfter: remainingSeconds
          });
        }

        // Update last message time
        userGlobalMessageTimes.set(userKey, now);

        // Cleanup old entries (older than 1 hour)
        if (userGlobalMessageTimes.size > 10000) {
          const oneHourAgo = now - 3600000;
          for (const [key, time] of userGlobalMessageTimes.entries()) {
            if (time < oneHourAgo) {
              userGlobalMessageTimes.delete(key);
            }
          }
        }
      }
    }

    if (!message) {
      return res.status(400).json({
        success: false,
        error: 'Message is required'
      });
    }

    if (!chatType || (chatType !== 'server' && chatType !== 'global')) {
      return res.status(400).json({
        success: false,
        error: 'Invalid chatType (must be server or global)'
      });
    }

    if (chatType === 'server' && !jobId) {
      return res.status(400).json({
        success: false,
        error: 'JobId is required for server chat'
      });
    }

    if (chatType === 'global' && !placeId) {
      return res.status(400).json({
        success: false,
        error: 'PlaceId is required for global chat'
      });
    }

    // Server-side validation (cannot be bypassed)
    const validation = validateMessage(message);
    if (!validation.valid) {
      logger.warn('Message validation failed', {
        userId,
        error: validation.error
      });
      return res.status(400).json({
        success: false,
        error: validation.error
      });
    }

    // Sanitize message
    const sanitizedMessage = sanitizeMessage(message);

    // Save message to database (use sanitized message)
    const newMessage = new Message({
      jobId: chatType === 'server' ? jobId : undefined,
      placeId: chatType === 'global' ? placeId : undefined,
      chatType,
      userId,
      username,
      message: sanitizedMessage
    });
    await newMessage.save();

    // Enforce 50 message limit - delete oldest messages
    await enforceMessageLimit(chatType, jobId, placeId);

    // Get Socket.io instance from app
    const io = req.app.get('io');

    // Broadcast message to all clients in the appropriate room
    const roomId = chatType === 'server' ? `server:${jobId}` : `global:${placeId}`;
    io.to(roomId).emit('message', {
      messageId: newMessage._id.toString(),
      jobId,
      placeId,
      chatType,
      userId,
      username,
      message: sanitizedMessage,
      timestamp: newMessage.createdAt
    });

    // Send message to Roblox in-game chat
    // This notifies the Roblox client to display the message
    if (chatType === 'server') {
      await sendToRoblox(jobId, sanitizedMessage, username);
    }

    logger.info('Message sent', { chatType, jobId, placeId, userId, username });

    res.json({
      success: true,
      message: {
        jobId,
        placeId,
        chatType,
        userId,
        username,
        message: sanitizedMessage,
        timestamp: newMessage.createdAt
      }
    });
  } catch (error) {
    logger.error('Failed to send message', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to send message'
    });
  }
});

/**
 * Enforce message limit (delete oldest messages if over 50)
 */
async function enforceMessageLimit(chatType, jobId, placeId) {
  try {
    const query = { chatType };
    if (chatType === 'server') {
      query.jobId = jobId;
    } else {
      query.placeId = placeId;
    }

    const messageCount = await Message.countDocuments(query);

    if (messageCount > 50) {
      const toDelete = messageCount - 50;

      // Find oldest messages
      const oldMessages = await Message.find(query)
        .sort({ createdAt: 1 })
        .limit(toDelete)
        .select('_id');

      const idsToDelete = oldMessages.map(msg => msg._id);

      // Delete them
      await Message.deleteMany({ _id: { $in: idsToDelete } });

      logger.info('Deleted old messages', { chatType, count: toDelete });
    }
  } catch (error) {
    logger.error('Failed to enforce message limit', { error: error.message });
  }
}

/**
 * Get chat history for a JobId or PlaceId
 */
router.get('/history', async (req, res) => {
  try {
    const { jobId, placeId, chatType, limit = 50, before } = req.query;

    if (!chatType || (chatType !== 'server' && chatType !== 'global')) {
      return res.status(400).json({
        success: false,
        error: 'Invalid chatType (must be server or global)'
      });
    }

    if (chatType === 'server' && !jobId) {
      return res.status(400).json({
        success: false,
        error: 'JobId is required for server chat'
      });
    }

    if (chatType === 'global' && !placeId) {
      return res.status(400).json({
        success: false,
        error: 'PlaceId is required for global chat'
      });
    }

    const query = { chatType };
    if (chatType === 'server') {
      query.jobId = jobId;
    } else {
      query.placeId = placeId;
    }

    if (before) {
      query.createdAt = { $lt: new Date(before) };
    }

    const messages = await Message.find(query)
      .sort({ createdAt: -1 })
      .limit(parseInt(limit));

    const formattedMessages = messages.reverse().map(msg => ({
      messageId: msg._id.toString(),
      jobId: msg.jobId,
      placeId: msg.placeId,
      chatType: msg.chatType,
      userId: msg.userId,
      username: msg.username,
      message: msg.message,
      timestamp: msg.createdAt,
      editedAt: msg.editedAt,
      deletedAt: msg.deletedAt
    }));

    res.json({
      success: true,
      messages: formattedMessages
    });
  } catch (error) {
    logger.error('Failed to get chat history', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to get chat history'
    });
  }
});

/**
 * Receive chat message from Roblox
 * This endpoint would be called by a script running in Roblox
 * or by monitoring Roblox logs (would be in main process)
 */
router.post('/receive', async (req, res) => {
  try {
    const { jobId, userId, username, message, timestamp } = req.body;

    if (!jobId || !userId || !username || !message) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing required fields' 
      });
    }

    // Save message to database
    const newMessage = new Message({
      jobId,
      userId,
      username,
      message,
      createdAt: timestamp ? new Date(timestamp) : new Date()
    });
    await newMessage.save();

    // Get Socket.io instance from app
    const io = req.app.get('io');

    // Broadcast message to all clients in the room
    io.to(jobId).emit('message', {
      jobId,
      userId,
      username,
      message,
      timestamp: newMessage.createdAt
    });

    logger.info('Message received', { jobId, userId, username });

    res.json({ success: true });
  } catch (error) {
    logger.error('Failed to receive message', { error: error.message });
    res.status(500).json({ 
      success: false, 
      error: 'Failed to receive message' 
    });
  }
});

/**
 * Send message to Roblox in-game chat
 * 
 * Implementation approach:
 * Since Roblox doesn't provide a public API for sending chat messages directly,
 * this function uses a webhook/signal approach where:
 * 1. The message is broadcast via Socket.io to all connected clients in the server
 * 2. Clients running the Roblox game with the RoChat integration script receive the message
 * 3. The Roblox client-side script displays the message in-game
 * 
 * Alternative implementation options (for future consideration):
 * - Memory injection (advanced, requires deep OS integration)
 * - Roblox Studio API (limited to test environments)
 * - Custom Roblox game integration via HttpService
 */
async function sendToRoblox(jobId, message, username) {
  try {
    // Log the message being sent to Roblox
    logger.info('Routing message to Roblox clients', { 
      jobId, 
      message: message.substring(0, 50), // Log first 50 chars only
      username 
    });

    // The actual delivery happens via Socket.io broadcast (already done in the /send endpoint)
    // Any Roblox clients connected to this jobId's socket room will receive the message
    // and display it in-game via their client-side script
    
    // Future enhancement: Send HTTP request to custom Roblox game endpoint if game has HttpService enabled
    // This would require the game developer to implement a server-side handler
    // Example:
    // const gameWebhookUrl = process.env.ROBLOX_GAME_WEBHOOK_URL;
    // if (gameWebhookUrl) {
    //   await axios.post(`${gameWebhookUrl}/chat`, {
    //     jobId,
    //     username,
    //     message
    //   }, { timeout: 3000 });
    // }
    
    return true;
  } catch (error) {
    logger.error('Failed to send to Roblox', { error: error.message });
    return false;
  }
}

module.exports = router;