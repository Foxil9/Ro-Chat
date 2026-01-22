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
      // Create regex to match whole word with word boundaries
      const regex = new RegExp(`\\b${swear}\\b`, 'i');

      if (regex.test(lowerMessage)) {
        return {
          valid: false,
          error: `Message contains inappropriate language: "${swear}"`,
          highlightWord: swear
        };
      }

      // Also check for variations with numbers/special chars
      const variation = swear.split('').join('[^a-z]*');
      const variationRegex = new RegExp(variation, 'i');

      if (variationRegex.test(lowerMessage)) {
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
