// Rate limiting middleware for spam protection
// Server-side enforcement - cannot be bypassed by client

const logger = require('../logging/logger');

// Store user message timestamps in memory
// Key: userId, Value: array of timestamps
const userMessageTimes = new Map();

// Rate limit configuration
// 10 messages in less than 5 seconds
const RATE_LIMIT = {
  // Burst detection
  BURST: {
    MAX_MESSAGES: 10,
    WINDOW_MS: 5000,    // 5 seconds
    COOLDOWN_MS: 10000  // 10 second cooldown
  },
  CLEANUP_INTERVAL: 300000 // Clean up old data every 5 minutes
};

/**
 * Clean up old message timestamps
 */
function cleanupOldTimestamps() {
  const now = Date.now();
  const cutoff = now - RATE_LIMIT.BURST.WINDOW_MS;

  for (const [userId, timestamps] of userMessageTimes.entries()) {
    // Filter out old timestamps (older than 3 seconds)
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
 * Rate limiting middleware with multi-tier burst detection
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

    // Get user's recent message timestamps
    let timestamps = userMessageTimes.get(userId) || [];

    // Filter to only recent messages (keep last 3 seconds)
    timestamps = timestamps.filter(time => time > now - RATE_LIMIT.BURST.WINDOW_MS);

    // Check for rapid-fire burst (3 messages in 3 seconds)
    const recentMessages = timestamps.filter(time => time > now - RATE_LIMIT.BURST.WINDOW_MS);
    if (recentMessages.length >= RATE_LIMIT.BURST.MAX_MESSAGES) {
      const waitTimeSec = Math.ceil(RATE_LIMIT.BURST.COOLDOWN_MS / 1000);

      logger.warn('Rapid-fire burst detected', {
        userId,
        messageCount: recentMessages.length,
        windowMs: RATE_LIMIT.BURST.WINDOW_MS,
        cooldownSec: waitTimeSec
      });

      return res.status(429).json({
        success: false,
        error: `CHILL OUT! You're sending too fast. Wait ${waitTimeSec} seconds.`,
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
 * Get rate limit status for a user (all tiers)
 */
function getRateLimitStatus(userId) {
  const now = Date.now();

  let timestamps = userMessageTimes.get(userId) || [];
  timestamps = timestamps.filter(time => time > now - RATE_LIMIT.BURST.WINDOW_MS);

  const recentMessages = timestamps;

  return {
    burst: {
      count: recentMessages.length,
      max: RATE_LIMIT.BURST.MAX_MESSAGES,
      remaining: Math.max(0, RATE_LIMIT.BURST.MAX_MESSAGES - recentMessages.length),
      windowSec: RATE_LIMIT.BURST.WINDOW_MS / 1000
    }
  };
}

/**
 * Clear rate limit for a user (e.g., for testing or admin actions)
 */
function clearRateLimit(userId) {
  userMessageTimes.delete(userId);
  logger.info('Rate limit cleared for user', { userId });
}

/**
 * IP-based rate limiter for unauthenticated routes (auth, oauth)
 * Prevents brute-force attacks on login/token endpoints
 */
const ipRequestTimes = new Map();
const IP_RATE_LIMIT = {
  MAX_REQUESTS: 15,
  WINDOW_MS: 60000 // 1 minute
};

function ipRateLimiter(req, res, next) {
  try {
    const ip = req.ip || req.connection.remoteAddress || 'unknown';
    const now = Date.now();

    let timestamps = ipRequestTimes.get(ip) || [];
    timestamps = timestamps.filter(time => time > now - IP_RATE_LIMIT.WINDOW_MS);

    if (timestamps.length >= IP_RATE_LIMIT.MAX_REQUESTS) {
      logger.warn('IP rate limit hit', { ip, count: timestamps.length });
      return res.status(429).json({
        success: false,
        error: 'Too many requests. Please try again later.',
        retryAfter: Math.ceil(IP_RATE_LIMIT.WINDOW_MS / 1000)
      });
    }

    timestamps.push(now);
    ipRequestTimes.set(ip, timestamps);
    next();
  } catch (error) {
    logger.error('IP rate limiter error', { error: error.message });
    next();
  }
}

// Clean up IP rate limit entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [ip, timestamps] of ipRequestTimes.entries()) {
    const recent = timestamps.filter(t => t > now - IP_RATE_LIMIT.WINDOW_MS);
    if (recent.length === 0) {
      ipRequestTimes.delete(ip);
    } else {
      ipRequestTimes.set(ip, recent);
    }
  }
}, 300000);

module.exports = {
  rateLimiter,
  ipRateLimiter,
  getRateLimitStatus,
  clearRateLimit
};
