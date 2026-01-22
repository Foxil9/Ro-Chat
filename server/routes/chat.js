const express = require('express');
const router = express.Router();
const logger = require('../logging/logger');
const Message = require('../models/Message');
const axios = require('axios');
const { rateLimiter } = require('../middleware/rateLimiter');
const { validateMessage, sanitizeMessage } = require('../utils/messageValidator');

/**
 * Send a chat message
 * Rate limiting applied via middleware
 */
router.post('/send', rateLimiter, async (req, res) => {
  try {
    const { jobId, placeId, chatType, message } = req.body;
    const { userId, username } = req.user;

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
      jobId,
      placeId,
      chatType,
      userId,
      username,
      message: sanitizedMessage,
      timestamp: newMessage.createdAt
    });

    // Send message to Roblox (TODO - need to implement)
    // This would send the message through Roblox's chat API
    if (chatType === 'server') {
      await sendToRoblox(jobId, message, req.user.robloxToken);
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

    res.json({
      success: true,
      messages: messages.reverse() // Return in chronological order
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
 * Send message to Roblox
 * TODO: Implement actual Roblox chat API integration
 */
async function sendToRoblox(jobId, message, token) {
  try {
    // This is a placeholder - implement actual Roblox chat sending
    // Roblox doesn't provide a public API for sending chat messages
    // This would require a more complex approach (e.g., memory injection, etc.)
    
    logger.info('Sending to Roblox (placeholder)', { jobId, message });
    
    // For now, just log - actual implementation would be complex
    // and may require research into Roblox's internal systems
    
    return true;
  } catch (error) {
    logger.error('Failed to send to Roblox', { error: error.message });
    return false;
  }
}

module.exports = router;
