const express = require('express');
const router = express.Router();
const logger = require('../logging/logger');
const Message = require('../models/Message');
const axios = require('axios');

/**
 * Send a chat message
 */
router.post('/send', async (req, res) => {
  try {
    const { jobId, message } = req.body;
    const { userId, username } = req.user;

    if (!jobId || !message) {
      return res.status(400).json({ 
        success: false, 
        error: 'JobId and message are required' 
      });
    }

    if (message.length > 200) {
      return res.status(400).json({ 
        success: false, 
        error: 'Message too long (max 200 characters)' 
      });
    }

    // Save message to database
    const newMessage = new Message({
      jobId,
      userId,
      username,
      message
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

    // Send message to Roblox (TODO - need to implement)
    // This would send the message through Roblox's chat API
    await sendToRoblox(jobId, message, req.user.robloxToken);

    logger.info('Message sent', { jobId, userId, username });

    res.json({
      success: true,
      message: {
        jobId,
        userId,
        username,
        message,
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
 * Get chat history for a JobId
 */
router.get('/history', async (req, res) => {
  try {
    const { jobId, limit = 50, before } = req.query;

    if (!jobId) {
      return res.status(400).json({ 
        success: false, 
        error: 'JobId is required' 
      });
    }

    const query = { jobId };
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
