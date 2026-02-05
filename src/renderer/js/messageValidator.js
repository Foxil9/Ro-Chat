// Message validation utilities for RoChat
// NOTE: This is CLIENT-SIDE validation for immediate UX feedback only
// The server performs the REAL validation that cannot be bypassed

class MessageValidator {
  constructor() {
    // Swear words list (basic English profanity)
    this.swearWords = [
      'fuck', 'shit', 'bitch', 'ass', 'damn', 'hell', 'crap',
      'bastard', 'dick', 'pussy', 'cock', 'fag', 'retard',
      'nigger', 'nigga', 'whore', 'slut', 'cunt'
    ];

    // Allowed domains for links (whitelist approach)
    this.allowedDomains = [
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
      'github.com'
    ];

    // Message length limits
    this.MAX_MESSAGE_LENGTH = 200;
    this.MIN_MESSAGE_LENGTH = 1;

    // Spam protection
    this.messageTimes = [];
    this.MAX_MESSAGES_PER_MINUTE = 10;
    this.SPAM_WINDOW_MS = 60000; // 1 minute
  }

  /**
   * Validate message before sending
   * Returns { valid: boolean, error: string, highlightWord: string }
   */
  validate(message) {
    // Check message length
    if (!message || message.trim().length < this.MIN_MESSAGE_LENGTH) {
      return { valid: false, error: 'Message cannot be empty', highlightWord: null };
    }

    if (message.length > this.MAX_MESSAGE_LENGTH) {
      return {
        valid: false,
        error: `Message too long (max ${this.MAX_MESSAGE_LENGTH} characters)`,
        highlightWord: null
      };
    }

    // Check for swear words
    const swearCheck = this.checkSwearWords(message);
    if (!swearCheck.valid) {
      return swearCheck;
    }

    // Check for links
    const linkCheck = this.checkLinks(message);
    if (!linkCheck.valid) {
      return linkCheck;
    }

    // Check spam protection
    const spamCheck = this.checkSpam();
    if (!spamCheck.valid) {
      return spamCheck;
    }

    return { valid: true, error: null, highlightWord: null };
  }

  /**
   * Check for swear words
   */
  checkSwearWords(message) {
    const lowerMessage = message.toLowerCase();

    for (const swear of this.swearWords) {
      // Match exact word or word with common suffixes (ing, ed, er, s, es, y)
      // This catches "fuck", "fucking", "fucked", "fucker", "fucks" but not "hello" for "hell"
      const regex = new RegExp(`\\b${swear}(ing|ed|er|s|es|y)?\\b`, 'i');

      if (regex.test(lowerMessage)) {
        return {
          valid: false,
          error: `Message contains inappropriate language: "${swear}"`,
          highlightWord: swear
        };
      }

      // Variation check - catch obfuscated versions like "f*ck", "f.u.c.k", "f-u-c-k"
      // Pattern 1: All letters present with separators (f.u.c.k, f-u-c-k, f u c k)
      const allLettersPattern = swear.split('').join('[^a-z]+');
      const allLettersRegex = new RegExp(allLettersPattern, 'i');

      // Pattern 2: Optional middle letters with special chars (f*ck, fck, f**k)
      // Makes middle letters optional: f[^a-z]*u?[^a-z]*c?[^a-z]*k
      // This catches cases where letters are replaced with symbols
      if (swear.length >= 3) {
        const firstLetter = swear[0];
        const lastLetter = swear[swear.length - 1];
        const middleLetters = swear.slice(1, -1);

        // Create pattern where middle letters are optional but separated by non-letters
        const middlePattern = middleLetters.split('').map(letter => `${letter}?[^a-z]*`).join('');
        const optionalPattern = `${firstLetter}[^a-z]*${middlePattern}${lastLetter}`;

        // Only match if the overall match contains at least one non-letter character
        // This prevents matching normal words like "fork" for "fuck"
        const optionalRegex = new RegExp(optionalPattern, 'i');
        const match = lowerMessage.match(optionalRegex);

        if (match && match[0].match(/[^a-z]/)) {
          // Verify it's not just the normal word AND doesn't span across words
          // Prevent matches with spaces (which would span multiple words like "s t" for "shit")
          const matchedText = match[0].toLowerCase();
          const hasSpace = matchedText.includes(' ');
          const isDifferent = matchedText !== swear;

          // Check if match is embedded in a longer alphanumeric sequence (like "https://")
          // Find the match position and check chars before/after
          const matchIndex = lowerMessage.indexOf(matchedText);
          const charBefore = matchIndex > 0 ? lowerMessage[matchIndex - 1] : ' ';
          const charAfter = matchIndex + matchedText.length < lowerMessage.length
            ? lowerMessage[matchIndex + matchedText.length]
            : ' ';

          // Match is valid only if it's not embedded (surrounded by letters/numbers)
          const isEmbedded = /[a-z0-9]/.test(charBefore) && /[a-z0-9]/.test(charAfter);

          // Only flag if it has special chars, no spaces, and not embedded
          if (isDifferent && !hasSpace && !isEmbedded) {
            return {
              valid: false,
              error: `Message contains inappropriate language`,
              highlightWord: swear
            };
          }
        }
      }

      if (allLettersRegex.test(lowerMessage)) {
        return {
          valid: false,
          error: `Message contains inappropriate language`,
          highlightWord: swear
        };
      }
    }

    return { valid: true, error: null, highlightWord: null };
  }

  /**
   * Check for links and validate against whitelist
   */
  checkLinks(message) {
    // URL regex pattern
    const urlRegex = /https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)/gi;
    const urls = message.match(urlRegex);

    if (urls && urls.length > 0) {
      for (const url of urls) {
        try {
          const urlObj = new URL(url);
          const hostname = urlObj.hostname.toLowerCase().replace('www.', '');

          // Check if domain is in whitelist
          const isAllowed = this.allowedDomains.some(domain =>
            hostname === domain || hostname.endsWith('.' + domain)
          );

          if (!isAllowed) {
            return {
              valid: false,
              error: `Unknown or unsafe link detected: ${hostname}. Only trusted domains are allowed.`,
              highlightWord: null
            };
          }
        } catch (e) {
          return {
            valid: false,
            error: 'Invalid URL detected',
            highlightWord: null
          };
        }
      }
    }

    return { valid: true, error: null, highlightWord: null };
  }

  /**
   * Check spam (rate limiting)
   */
  checkSpam() {
    const now = Date.now();

    // Remove messages outside the spam window
    this.messageTimes = this.messageTimes.filter(time =>
      now - time < this.SPAM_WINDOW_MS
    );

    // Check if user exceeded rate limit
    if (this.messageTimes.length >= this.MAX_MESSAGES_PER_MINUTE) {
      const oldestMessage = this.messageTimes[0];
      const waitTime = Math.ceil((this.SPAM_WINDOW_MS - (now - oldestMessage)) / 1000);

      return {
        valid: false,
        error: `Slow down! Please wait ${waitTime} seconds before sending another message.`,
        highlightWord: null
      };
    }

    // Add current message time
    this.messageTimes.push(now);

    return { valid: true, error: null, highlightWord: null };
  }

  /**
   * Clear spam tracking (e.g., on logout)
   */
  clearSpamTracking() {
    this.messageTimes = [];
  }
}

// Export singleton instance
window.messageValidator = new MessageValidator();
