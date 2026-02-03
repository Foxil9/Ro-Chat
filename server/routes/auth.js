const express = require('express');
const router = express.Router();
const logger = require('../logging/logger');
const User = require('../models/User');
const axios = require('axios');

/**
 * Verify Roblox token and return user info
 */
router.post('/verify', async (req, res) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({ 
        success: false, 
        error: 'Token is required' 
      });
    }

    // Verify token with Roblox API
    const userResponse = await axios.get('https://users.roblox.com/v1/users/authenticated', {
      headers: {
        'Authorization': `Bearer ${token}`,
        'User-Agent': 'RoChat/1.0'
      }
    });

    if (userResponse.status !== 200 || !userResponse.data) {
      return res.status(401).json({ 
        success: false, 
        error: 'Invalid token' 
      });
    }

    const { id, name, displayName } = userResponse.data;

    // Find or create user - never store raw tokens in the database
    let user = await User.findOne({ userId: id });

    if (!user) {
      user = new User({
        userId: id,
        username: name,
        displayName: displayName
      });
      await user.save();
      logger.info('New user created', { userId: id, username: name });
    } else {
      // Update user info (no token storage)
      user.username = name;
      user.displayName = displayName;
      await user.save();
      logger.info('User updated', { userId: id, username: name });
    }

    res.json({
      success: true,
      user: {
        userId: user.userId,
        username: user.username,
        displayName: user.displayName
      }
    });
  } catch (error) {
    logger.error('Auth verification failed', { error: error.message });

    if (error.response && error.response.status === 401) {
      return res.status(401).json({ 
        success: false, 
        error: 'Invalid Roblox token' 
      });
    }

    res.status(500).json({ 
      success: false, 
      error: 'Verification failed' 
    });
  }
});

/**
 * Get user info by ID
 * Requires valid Bearer token to prevent unauthenticated user enumeration
 */
router.get('/user', async (req, res) => {
  try {
    // Require Authorization header to prevent open enumeration
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: 'Authorization required'
      });
    }

    const { userId } = req.query;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'User ID is required'
      });
    }

    // Validate userId is numeric
    const parsedId = parseInt(userId);
    if (isNaN(parsedId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid user ID format'
      });
    }

    const user = await User.findOne({ userId: parsedId });

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    res.json({
      success: true,
      user: {
        userId: user.userId,
        username: user.username,
        displayName: user.displayName
      }
    });
  } catch (error) {
    logger.error('Failed to get user', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to get user'
    });
  }
});

module.exports = router;
