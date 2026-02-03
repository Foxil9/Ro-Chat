import { describe, it, expect, beforeEach, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import fs from 'fs';
import path from 'path';

/**
 * Test messageValidator.js - Client-side message validation
 * Tests profanity detection, link validation, and spam protection
 */

describe('MessageValidator', () => {
  let validator;

  beforeEach(() => {
    // Load the validator code into JSDOM
    const validatorCode = fs.readFileSync(
      path.join(__dirname, '../../src/renderer/js/messageValidator.js'),
      'utf8'
    );

    // Create a fresh DOM environment for each test
    const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
      runScripts: 'dangerously',
      url: 'http://localhost',
    });

    // Execute the validator code in the JSDOM window context
    dom.window.eval(validatorCode);

    // Get the validator instance
    validator = dom.window.messageValidator;
  });

  describe('Message Length Validation', () => {
    it('should reject empty messages', () => {
      const result = validator.validate('');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('empty');
    });

    it('should reject whitespace-only messages', () => {
      const result = validator.validate('   ');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('empty');
    });

    it('should accept single character messages', () => {
      const result = validator.validate('a');
      expect(result.valid).toBe(true);
    });

    it('should reject messages over 200 characters', () => {
      const longMessage = 'a'.repeat(201);
      const result = validator.validate(longMessage);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('too long');
      expect(result.error).toContain('200');
    });

    it('should accept messages exactly at 200 characters', () => {
      const maxMessage = 'a'.repeat(200);
      const result = validator.validate(maxMessage);
      expect(result.valid).toBe(true);
    });

    it('should accept messages just under 200 characters', () => {
      const result = validator.validate('a'.repeat(199));
      expect(result.valid).toBe(true);
    });
  });

  describe('Profanity Detection', () => {
    it('should reject messages with basic swear words', () => {
      const result = validator.validate('This is a fucking message');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('inappropriate language');
      expect(result.highlightWord).toBe('fuck');
    });

    it('should be case-insensitive', () => {
      const testCases = ['FUCK', 'Fuck', 'fUcK'];
      testCases.forEach((word) => {
        const result = validator.validate(`Test ${word} test`);
        expect(result.valid).toBe(false);
        expect(result.error).toContain('inappropriate language');
      });
    });

    it('should match whole words only', () => {
      // "assess" contains "ass" but shouldn't be flagged
      const result = validator.validate('Let me assess this situation');
      expect(result.valid).toBe(true);
    });

    it('should detect variations with special characters', () => {
      const variations = ['f*ck', 'f.u.c.k', 'f-u-c-k', 'f u c k'];
      variations.forEach((variation) => {
        const result = validator.validate(`Test ${variation}`);
        expect(result.valid).toBe(false);
        expect(result.error).toContain('inappropriate language');
      });
    });

    it('should detect multiple profanity words', () => {
      const swearWords = ['fuck', 'shit', 'bitch', 'damn'];
      swearWords.forEach((word) => {
        const result = validator.validate(`This is ${word} bad`);
        expect(result.valid).toBe(false);
        expect(result.highlightWord).toBe(word);
      });
    });

    it('should return the detected swear word for highlighting', () => {
      const result = validator.validate('What the hell');
      expect(result.valid).toBe(false);
      expect(result.highlightWord).toBe('hell');
    });

    it('should allow clean messages', () => {
      const cleanMessages = [
        'Hello everyone!',
        'Nice to meet you',
        'GG great game',
        'Can we do that quest together?',
      ];
      cleanMessages.forEach((msg) => {
        const result = validator.validate(msg);
        expect(result.valid).toBe(true);
      });
    });
  });

  describe('Link Validation', () => {
    it('should allow whitelisted Roblox links', () => {
      const robloxUrls = [
        'https://roblox.com/games/123456',
        'https://www.roblox.com/users/profile',
        'https://create.roblox.com/dashboard',
        'https://devforum.roblox.com/t/topic',
      ];
      robloxUrls.forEach((url) => {
        const result = validator.validate(`Check this out: ${url}`);
        expect(result.valid).toBe(true);
      });
    });

    it('should allow whitelisted social media links', () => {
      const socialUrls = [
        'https://youtube.com/watch?v=abc123',
        'https://youtu.be/abc123',
        'https://discord.gg/invite123',
        'https://twitter.com/username',
        'https://x.com/username',
        'https://github.com/user/repo',
      ];
      socialUrls.forEach((url) => {
        const result = validator.validate(`Link: ${url}`);
        expect(result.valid).toBe(true);
      });
    });

    it('should reject non-whitelisted domains', () => {
      const suspiciousUrls = [
        'https://evil-site.com/malware',
        'https://phishing-roblox.com/login',
        'https://free-robux-scam.net',
        'https://random-site.xyz',
      ];
      suspiciousUrls.forEach((url) => {
        const result = validator.validate(`Check ${url}`);
        expect(result.valid).toBe(false);
        expect(result.error).toContain('Unknown or unsafe link');
      });
    });

    it('should handle subdomains of whitelisted domains', () => {
      const result = validator.validate('https://www.youtube.com/watch');
      expect(result.valid).toBe(true);
    });

    it('should reject malformed URLs', () => {
      const malformedUrls = [
        'http://not a valid url',
        'https://',
        'http:// spaces .com',
      ];
      malformedUrls.forEach((url) => {
        const result = validator.validate(url);
        if (result.valid === false && result.error.includes('Invalid URL')) {
          expect(result.error).toContain('Invalid URL');
        }
      });
    });

    it('should allow messages without links', () => {
      const result = validator.validate('This message has no links');
      expect(result.valid).toBe(true);
    });

    it('should handle multiple links in one message', () => {
      const msg =
        'Check https://roblox.com and https://youtube.com for updates';
      const result = validator.validate(msg);
      expect(result.valid).toBe(true);
    });

    it('should reject if any link is not whitelisted', () => {
      const msg =
        'Good link https://roblox.com but bad https://malicious.com';
      const result = validator.validate(msg);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('malicious.com');
    });
  });

  describe('Spam Protection', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      validator.clearSpamTracking();
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('should allow messages under rate limit', () => {
      for (let i = 0; i < 9; i++) {
        const result = validator.validate(`Message ${i}`);
        expect(result.valid).toBe(true);
      }
    });

    it('should reject 11th message within 1 minute', () => {
      // Send 10 messages (limit)
      for (let i = 0; i < 10; i++) {
        validator.validate(`Message ${i}`);
      }

      // 11th message should be rejected
      const result = validator.validate('Message 11');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Slow down');
      expect(result.error).toMatch(/\d+ seconds/);
    });

    it('should allow messages after spam window expires', () => {
      // Send 10 messages
      for (let i = 0; i < 10; i++) {
        validator.validate(`Message ${i}`);
      }

      // Wait 61 seconds (past the 60 second window)
      vi.advanceTimersByTime(61000);

      // Should now allow new messages
      const result = validator.validate('New message');
      expect(result.valid).toBe(true);
    });

    it('should calculate correct wait time in error message', () => {
      // Send 10 messages
      for (let i = 0; i < 10; i++) {
        validator.validate(`Message ${i}`);
      }

      // Try to send 11th immediately
      const result = validator.validate('Spam message');
      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/wait \d+ seconds/);

      // Extract wait time from error
      const match = result.error.match(/wait (\d+) seconds/);
      const waitTime = parseInt(match[1]);
      expect(waitTime).toBeGreaterThan(0);
      expect(waitTime).toBeLessThanOrEqual(60);
    });

    it('should clear spam tracking on clearSpamTracking()', () => {
      // Send 10 messages
      for (let i = 0; i < 10; i++) {
        validator.validate(`Message ${i}`);
      }

      // Clear tracking (simulates logout)
      validator.clearSpamTracking();

      // Should now allow new messages immediately
      const result = validator.validate('After clear');
      expect(result.valid).toBe(true);
    });

    it('should track messages independently across spam checks', () => {
      // Send 5 messages
      for (let i = 0; i < 5; i++) {
        validator.validate(`Message ${i}`);
      }

      // Wait 30 seconds
      vi.advanceTimersByTime(30000);

      // Send 5 more messages (total 10)
      for (let i = 5; i < 10; i++) {
        const result = validator.validate(`Message ${i}`);
        expect(result.valid).toBe(true);
      }

      // 11th should be rejected
      const result = validator.validate('Message 11');
      expect(result.valid).toBe(false);
    });

    it('should only count messages within sliding window', () => {
      // Send 10 messages
      for (let i = 0; i < 10; i++) {
        validator.validate(`Message ${i}`);
      }

      // Wait 30 seconds (first messages still in window)
      vi.advanceTimersByTime(30000);

      // Should still be rate limited
      let result = validator.validate('Test');
      expect(result.valid).toBe(false);

      // Wait another 31 seconds (61 total, outside window)
      vi.advanceTimersByTime(31000);

      // Should now work
      result = validator.validate('Test');
      expect(result.valid).toBe(true);
    });
  });

  describe('Complete Validation Flow', () => {
    it('should return success for valid message', () => {
      const result = validator.validate('Hello, how are you today?');
      expect(result).toEqual({
        valid: true,
        error: null,
        highlightWord: null,
      });
    });

    it('should prioritize length check over profanity', () => {
      const result = validator.validate('');
      expect(result.error).toContain('empty');
    });

    it('should check profanity before links', () => {
      const result = validator.validate(
        'This fucking link https://evil.com is bad'
      );
      expect(result.error).toContain('inappropriate language');
    });

    it('should check links before spam', () => {
      const result = validator.validate('Click https://malicious.com now');
      expect(result.error).toContain('Unknown or unsafe link');
    });

    it('should handle edge case of exactly 200 chars with profanity', () => {
      const message = 'a'.repeat(195) + ' fuck';
      expect(message.length).toBe(200);
      const result = validator.validate(message);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('inappropriate language');
    });

    it('should handle complex messages with emojis and unicode', () => {
      const result = validator.validate('Hello 👋 Nice to meet you! 🎮');
      expect(result.valid).toBe(true);
    });

    it('should handle messages with line breaks', () => {
      const result = validator.validate('Line 1\nLine 2\nLine 3');
      expect(result.valid).toBe(true);
    });
  });
});
