// Rate limiting middleware for spam protection
// Server-side enforcement - cannot be bypassed by client

const logger = require('../logging/logger');

// Store user message timestamps in memory
// Key: userId, Value: array of timestamps
const userMessageTimes = new Map();

// Multi-tier rate limit configuration
// Focus on burst detection (fast sending) rather than volume
const RATE_LIMIT = {
  // Tier 1: Rapid-fire detection (most aggressive)
  BURST_FAST: {
    MAX_MESSAGES: 3,
    WINDOW_MS: 3000,    // 3 seconds
    COOLDOWN_MS: 10000  // 10 second cooldown
  },
  // Tier 2: Medium burst detection
  BURST_MEDIUM: {
    MAX_MESSAGES: 5,
    WINDOW_MS: 5000,    // 5 seconds
    COOLDOWN_MS: 15000  // 15 second cooldown
  },
  // Tier 3: Sustained spam protection
  SUSTAINED: {
    MAX_MESSAGES: 10,
    WINDOW_MS: 60000,   // 60 seconds
    COOLDOWN_MS: 30000  // 30 second cooldown
  },
  CLEANUP_INTERVAL: 300000 // Clean up old data every 5 minutes
};

/**
 * Clean up old message timestamps
 */
function cleanupOldTimestamps() {
  const now = Date.now();
  const cutoff = now - RATE_LIMIT.SUSTAINED.WINDOW_MS;

  for (const [userId, timestamps] of userMessageTimes.entries()) {
    // Filter out old timestamps (older than 60 seconds)
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

    // Filter to only recent messages (keep last 60 seconds)
    timestamps = timestamps.filter(time => time > now - RATE_LIMIT.SUSTAINED.WINDOW_MS);

    // Check Tier 1: Rapid-fire burst (3 messages in 3 seconds)
    const recentFast = timestamps.filter(time => time > now - RATE_LIMIT.BURST_FAST.WINDOW_MS);
    if (recentFast.length >= RATE_LIMIT.BURST_FAST.MAX_MESSAGES) {
      const waitTimeSec = Math.ceil(RATE_LIMIT.BURST_FAST.COOLDOWN_MS / 1000);

      logger.warn('Rapid-fire burst detected', {
        userId,
        messageCount: recentFast.length,
        windowMs: RATE_LIMIT.BURST_FAST.WINDOW_MS,
        cooldownSec: waitTimeSec
      });

      return res.status(429).json({
        success: false,
        error: `CHILL OUT! You're sending too fast. Wait ${waitTimeSec} seconds.`,
        retryAfter: waitTimeSec
      });
    }

    // Check Tier 2: Medium burst (5 messages in 5 seconds)
    const recentMedium = timestamps.filter(time => time > now - RATE_LIMIT.BURST_MEDIUM.WINDOW_MS);
    if (recentMedium.length >= RATE_LIMIT.BURST_MEDIUM.MAX_MESSAGES) {
      const waitTimeSec = Math.ceil(RATE_LIMIT.BURST_MEDIUM.COOLDOWN_MS / 1000);

      logger.warn('Medium burst detected', {
        userId,
        messageCount: recentMedium.length,
        windowMs: RATE_LIMIT.BURST_MEDIUM.WINDOW_MS,
        cooldownSec: waitTimeSec
      });

      return res.status(429).json({
        success: false,
        error: `Slow down! You're sending too many messages. Wait ${waitTimeSec} seconds.`,
        retryAfter: waitTimeSec
      });
    }

    // Check Tier 3: Sustained spam (10 messages in 60 seconds)
    const recentSustained = timestamps.filter(time => time > now - RATE_LIMIT.SUSTAINED.WINDOW_MS);
    if (recentSustained.length >= RATE_LIMIT.SUSTAINED.MAX_MESSAGES) {
      const waitTimeSec = Math.ceil(RATE_LIMIT.SUSTAINED.COOLDOWN_MS / 1000);

      logger.warn('Sustained spam detected', {
        userId,
        messageCount: recentSustained.length,
        windowMs: RATE_LIMIT.SUSTAINED.WINDOW_MS,
        cooldownSec: waitTimeSec
      });

      return res.status(429).json({
        success: false,
        error: `You're spamming! Take a break for ${waitTimeSec} seconds.`,
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
  timestamps = timestamps.filter(time => time > now - RATE_LIMIT.SUSTAINED.WINDOW_MS);

  const recentFast = timestamps.filter(time => time > now - RATE_LIMIT.BURST_FAST.WINDOW_MS);
  const recentMedium = timestamps.filter(time => time > now - RATE_LIMIT.BURST_MEDIUM.WINDOW_MS);
  const recentSustained = timestamps;

  return {
    burstFast: {
      count: recentFast.length,
      max: RATE_LIMIT.BURST_FAST.MAX_MESSAGES,
      remaining: Math.max(0, RATE_LIMIT.BURST_FAST.MAX_MESSAGES - recentFast.length),
      windowSec: RATE_LIMIT.BURST_FAST.WINDOW_MS / 1000
    },
    burstMedium: {
      count: recentMedium.length,
      max: RATE_LIMIT.BURST_MEDIUM.MAX_MESSAGES,
      remaining: Math.max(0, RATE_LIMIT.BURST_MEDIUM.MAX_MESSAGES - recentMedium.length),
      windowSec: RATE_LIMIT.BURST_MEDIUM.WINDOW_MS / 1000
    },
    sustained: {
      count: recentSustained.length,
      max: RATE_LIMIT.SUSTAINED.MAX_MESSAGES,
      remaining: Math.max(0, RATE_LIMIT.SUSTAINED.MAX_MESSAGES - recentSustained.length),
      windowSec: RATE_LIMIT.SUSTAINED.WINDOW_MS / 1000
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

module.exports = {
  rateLimiter,
  getRateLimitStatus,
  clearRateLimit
};
