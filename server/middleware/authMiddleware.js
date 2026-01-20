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
    
    // Simplified token parsing (JWT-like)
    let payload;
    try {
      // This is a placeholder - implement proper token verification
      const tokenParts = token.split('.');
      if (tokenParts.length === 3) {
        payload = JSON.parse(Buffer.from(tokenParts[1], 'base64').toString());
      } else {
        // For non-JWT tokens, we'd need a different approach
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

    // Find user by userId
    const user = await User.findOne({ userId: payload.userId });
    
    if (!user) {
      return res.status(401).json({ 
        success: false, 
        error: 'User not found' 
      });
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
