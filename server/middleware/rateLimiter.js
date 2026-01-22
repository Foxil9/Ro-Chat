// Rate limiting middleware for spam protection
// Server-side enforcement - cannot be bypassed by client

const logger = require('../logging/logger');

// Store user message timestamps in memory
// Key: userId, Value: array of timestamps
const userMessageTimes = new Map();

// Rate limit configuration
const RATE_LIMIT = {
  MAX_MESSAGES: 10,
  WINDOW_MS: 60000, // 1 minute
  CLEANUP_INTERVAL: 300000 // Clean up old data every 5 minutes
};

/**
 * Clean up old message timestamps
 */
function cleanupOldTimestamps() {
  const now = Date.now();
  const cutoff = now - RATE_LIMIT.WINDOW_MS;

  for (const [userId, timestamps] of userMessageTimes.entries()) {
    // Filter out old timestamps
    const recentTimestamps = timestamps.filter(time => time > cutoff);

    if (recentTimestamps.length === 0) {
      // Remove user entry if no recent messages
      userMessageTimes.delete(userId);
    } else {
      // Update with filtered timestamps
      userMessageTimes.set(userId, recentTimestamps);
    }
  }

  logger.debug('Rate limiter cleanup completed', {
    activeUsers: userMessageTimes.size
  });
}

// Run cleanup periodically
setInterval(cleanupOldTimestamps, RATE_LIMIT.CLEANUP_INTERVAL);

/**
 * Rate limiting middleware
 */
function rateLimiter(req, res, next) {
  try {
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized'
      });
    }

    const now = Date.now();
    const windowStart = now - RATE_LIMIT.WINDOW_MS;

    // Get user's recent message timestamps
    let timestamps = userMessageTimes.get(userId) || [];

    // Filter to only recent messages within the time window
    timestamps = timestamps.filter(time => time > windowStart);

    // Check if user exceeded rate limit
    if (timestamps.length >= RATE_LIMIT.MAX_MESSAGES) {
      const oldestTimestamp = timestamps[0];
      const waitTimeMs = RATE_LIMIT.WINDOW_MS - (now - oldestTimestamp);
      const waitTimeSec = Math.ceil(waitTimeMs / 1000);

      logger.warn('Rate limit exceeded', {
        userId,
        messageCount: timestamps.length,
        waitTimeSec
      });

      return res.status(429).json({
        success: false,
        error: `Slow down! Please wait ${waitTimeSec} seconds before sending another message.`,
        retryAfter: waitTimeSec
      });
    }

    // Add current timestamp
    timestamps.push(now);
    userMessageTimes.set(userId, timestamps);

    // Continue to next middleware
    next();
  } catch (error) {
    logger.error('Rate limiter error', { error: error.message });
    // Don't block request on rate limiter error
    next();
  }
}

/**
 * Get rate limit status for a user
 */
function getRateLimitStatus(userId) {
  const now = Date.now();
  const windowStart = now - RATE_LIMIT.WINDOW_MS;

  let timestamps = userMessageTimes.get(userId) || [];
  timestamps = timestamps.filter(time => time > windowStart);

  return {
    messageCount: timestamps.length,
    maxMessages: RATE_LIMIT.MAX_MESSAGES,
    remaining: Math.max(0, RATE_LIMIT.MAX_MESSAGES - timestamps.length),
    resetIn: timestamps.length > 0
      ? Math.ceil((timestamps[0] + RATE_LIMIT.WINDOW_MS - now) / 1000)
      : 0
  };
}

/**
 * Clear rate limit for a user (e.g., for testing or admin actions)
 */
function clearRateLimit(userId) {
  userMessageTimes.delete(userId);
  logger.info('Rate limit cleared for user', { userId });
}

module.exports = {
  rateLimiter,
  getRateLimitStatus,
  clearRateLimit
};
