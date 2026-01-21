const logger = require('../logging/logger');
const User = require('../models/User');

/**
 * Verify Roblox token and authenticate user
 */
async function authMiddleware(req, res, next) {
  try {
    // Get token from Authorization header
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ 
        success: false, 
        error: 'No authorization token provided' 
      });
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    // TODO: Verify Roblox token
    // For now, we'll just extract userId from token payload
    // In production, you would verify the token with Roblox API
    
    // Parse Roblox OAuth2 idToken (JWT)
    let payload;
    try {
      const tokenParts = token.split('.');
      if (tokenParts.length === 3) {
        // Decode JWT payload (base64url encoded)
        const base64 = tokenParts[1].replace(/-/g, '+').replace(/_/g, '/');
        payload = JSON.parse(Buffer.from(base64, 'base64').toString());
      } else {
        return res.status(401).json({
          success: false,
          error: 'Invalid token format'
        });
      }
    } catch (error) {
      logger.error('Failed to parse token', { error: error.message });
      return res.status(401).json({
        success: false,
        error: 'Invalid token'
      });
    }

    // Extract userId from token (Roblox uses 'sub' field for user ID)
    const userIdStr = payload.sub || payload.userId;
    const username = payload.preferred_username || payload.username;

    if (!userIdStr) {
      return res.status(401).json({
        success: false,
        error: 'Token missing user ID'
      });
    }

    // Convert userId to number (Roblox user IDs are numeric)
    const userId = parseInt(userIdStr);
    if (isNaN(userId)) {
      return res.status(401).json({
        success: false,
        error: 'Invalid user ID format'
      });
    }

    // Find user by userId, create if not exists (auto-register)
    let user = await User.findOne({ userId: userId });

    if (!user) {
      // Auto-register user from valid token
      user = new User({
        userId: userId,
        username: username || `User${userId}`,
        displayName: payload.name || payload.nickname || username
      });
      await user.save();
      logger.info('Auto-registered user from token', { userId, username });
    }

    // Attach user to request
    req.user = user;
    next();
  } catch (error) {
    logger.error('Auth middleware error', { error: error.message });
    return res.status(500).json({ 
      success: false, 
      error: 'Authentication failed' 
    });
  }
}

module.exports = authMiddleware;
