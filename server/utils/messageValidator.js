// Server-side message validation with advanced profanity detection
// Cannot be bypassed by client modifications
// Uses 'obscenity' library to catch censored/obfuscated profanity

const logger = require('../logging/logger');
const {
  RegExpMatcher,
  TextCensor,
  englishDataset,
  englishRecommendedTransformers
} = require('obscenity');

// Initialize profanity matcher with comprehensive transformers
// This catches: f*ck, fvck, f u c k, fu©k, f.u.c.k, etc.
const profanityMatcher = new RegExpMatcher({
  ...englishDataset.build(),
  ...englishRecommendedTransformers,
});

// Additional custom regex patterns to catch spacing/special char bypasses
// Word boundaries (\b) prevent matching substrings (e.g., "hello" won't match "hell")
const customPatterns = [
  // fuck variations: f u c k, f.u.c.k, f-u-c-k, f_u_c_k, f**k, phuck
  /\bf+[\s.*\-_]*u+[\s.*\-_]*c+[\s.*\-_]*k+\b/gi,
  /\bp+h+[\s.*\-_]*u+[\s.*\-_]*c+[\s.*\-_]*k+\b/gi,

  // shit variations: s h i t, s.h.i.t, s-h-i-t, s_h_i_t, sh*t
  /\bs+[\s.*\-_]*h+[\s.*\-_]*i+[\s.*\-_]*t+\b/gi,

  // bitch variations: b i t c h, b.i.t.c.h
  /\bb+[\s.*\-_]*i+[\s.*\-_]*t+[\s.*\-_]*c+[\s.*\-_]*h+\b/gi,

  // ass variations: a s s, a.s.s (but not "class", "pass", etc.)
  /\ba+[\s.*\-_]*s+[\s.*\-_]*s+\b/gi,

  // damn variations: d a m n, d.a.m.n
  /\bd+[\s.*\-_]*a+[\s.*\-_]*m+[\s.*\-_]*n+\b/gi,

  // hell variations: h e l l, h.e.l.l (but not "hello", "shell")
  /\bh+[\s.*\-_]*e+[\s.*\-_]*l+[\s.*\-_]*l+\b/gi,

  // crap variations: c r a p, c.r.a.p
  /\bc+[\s.*\-_]*r+[\s.*\-_]*a+[\s.*\-_]*p+\b/gi,

  // dick variations: d i c k, d.i.c.k
  /\bd+[\s.*\-_]*i+[\s.*\-_]*c+[\s.*\-_]*k+\b/gi,

  // pussy variations: p u s s y, p.u.s.s.y
  /\bp+[\s.*\-_]*u+[\s.*\-_]*s+[\s.*\-_]*s+[\s.*\-_]*y+\b/gi,

  // cock variations: c o c k, c.o.c.k
  /\bc+[\s.*\-_]*o+[\s.*\-_]*c+[\s.*\-_]*k+\b/gi,
];

// Initialize text censor for replacement (if needed later)
const profanityCensor = new TextCensor();

// Allowed domains for links (whitelist)
const ALLOWED_DOMAINS = [
  'roblox.com',
  'rbxcdn.com',
  'roblox.dev',
  'create.roblox.com',
  'devforum.roblox.com',
  'ro.chat',
  'youtube.com',
  'youtu.be',
  'discord.gg',
  'discord.com',
  'twitter.com',
  'x.com',
  'github.com',
  'buymeacoffee.com'
];

// Message constraints
const MESSAGE_CONSTRAINTS = {
  MIN_LENGTH: 1,
  MAX_LENGTH: 200
};

/**
 * Validate message content
 * Returns { valid: boolean, error: string }
 */
function validateMessage(message) {
  // Check length
  if (!message || typeof message !== 'string') {
    return { valid: false, error: 'Message cannot be empty' };
  }

  const trimmed = message.trim();

  if (trimmed.length < MESSAGE_CONSTRAINTS.MIN_LENGTH) {
    return { valid: false, error: 'Message cannot be empty' };
  }

  if (trimmed.length > MESSAGE_CONSTRAINTS.MAX_LENGTH) {
    return {
      valid: false,
      error: `Message too long (max ${MESSAGE_CONSTRAINTS.MAX_LENGTH} characters)`
    };
  }

  // Check for profanity using obscenity library
  const profanityCheck = checkProfanity(trimmed);
  if (!profanityCheck.valid) {
    return profanityCheck;
  }

  // Check for unauthorized links
  const linkCheck = checkLinks(trimmed);
  if (!linkCheck.valid) {
    return linkCheck;
  }

  return { valid: true, error: null };
}

/**
 * Check for profanity in message using obscenity library + custom patterns
 * Catches: f*ck, fvck, f u c k, fuc|<, phuck, f.u.c.k, f-u-c-k, etc.
 */
function checkProfanity(message) {
  // First check with obscenity matcher
  const matches = profanityMatcher.getAllMatches(message);

  if (matches.length > 0) {
    const firstMatch = matches[0];
    const matchedText = message.substring(firstMatch.startIndex, firstMatch.endIndex);

    logger.warn('Profanity detected by obscenity', {
      matchedText,
      startIndex: firstMatch.startIndex,
      endIndex: firstMatch.endIndex,
      totalMatches: matches.length
    });

    return {
      valid: false,
      error: `Message contains inappropriate language. Please keep chat friendly.`
    };
  }

  // Check custom patterns for spacing/special char bypass attempts
  for (let i = 0; i < customPatterns.length; i++) {
    const customPattern = customPatterns[i];
    const customMatch = message.match(customPattern);

    if (customMatch) {
      logger.warn('Profanity detected by custom pattern', {
        matchedText: customMatch[0],
        patternIndex: i,
        pattern: customPattern.source
      });

      return {
        valid: false,
        error: `Message contains inappropriate language. Please keep chat friendly.`
      };
    }
  }

  return { valid: true, error: null };
}

/**
 * Check for unauthorized links
 */
function checkLinks(message) {
  // URL regex pattern
  const urlRegex = /https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)/gi;
  const urls = message.match(urlRegex);

  if (urls && urls.length > 0) {
    for (const url of urls) {
      try {
        const urlObj = new URL(url);
        const hostname = urlObj.hostname.toLowerCase().replace('www.', '');

        // Check if domain is in whitelist
        const isAllowed = ALLOWED_DOMAINS.some(domain =>
          hostname === domain || hostname.endsWith('.' + domain)
        );

        if (!isAllowed) {
          logger.warn('Unauthorized link detected', { hostname, url });
          return {
            valid: false,
            error: `Unknown or unsafe link detected: ${hostname}. Only trusted domains are allowed.`
          };
        }
      } catch (e) {
        logger.warn('Invalid URL detected', { url });
        return {
          valid: false,
          error: 'Invalid URL detected'
        };
      }
    }
  }

  return { valid: true, error: null };
}

/**
 * Sanitize message (remove/escape dangerous content)
 */
function sanitizeMessage(message) {
  // Trim whitespace
  let sanitized = message.trim();

  // Remove null bytes
  sanitized = sanitized.replace(/\0/g, '');

  // Normalize whitespace
  sanitized = sanitized.replace(/\s+/g, ' ');

  return sanitized;
}

/**
 * Censor profanity in a message (replace with asterisks)
 * Useful for logging or display purposes
 */
function censorProfanity(message) {
  const matches = profanityMatcher.getAllMatches(message);
  return profanityCensor.applyTo(message, matches);
}

module.exports = {
  validateMessage,
  sanitizeMessage,
  censorProfanity,
  MESSAGE_CONSTRAINTS
};
