import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  formatTimestamp,
  formatTime,
  sleep,
  debounce,
  throttle,
  deepClone,
  isEmpty,
  sanitizeHtml,
  truncate,
  generateId,
  retry,
  getRobloxLogsPath,
  parseJobId,
  parsePlaceId,
  isValidJobId,
  isValidPlaceId,
} from '../../src/shared/utils.js';

describe('utils.js - Shared Utilities', () => {
  describe('formatTimestamp', () => {
    it('should format a timestamp to a readable string', () => {
      const timestamp = new Date('2026-01-15T10:30:00Z').getTime();
      const result = formatTimestamp(timestamp);
      expect(result).toContain('2026');
      expect(typeof result).toBe('string');
    });

    it('should handle epoch timestamp (0)', () => {
      const result = formatTimestamp(0);
      expect(result).toContain('1970');
    });

    it('should handle current timestamp', () => {
      const now = Date.now();
      const result = formatTimestamp(now);
      expect(result).toBeTruthy();
      expect(typeof result).toBe('string');
    });
  });

  describe('formatTime', () => {
    it('should format a timestamp to time only (HH:MM:SS format)', () => {
      const timestamp = new Date('2026-01-15T10:30:45Z').getTime();
      const result = formatTime(timestamp);
      expect(result).toMatch(/\d{1,2}:\d{2}/); // Matches time format
      expect(typeof result).toBe('string');
    });

    it('should handle midnight timestamp', () => {
      const midnight = new Date('2026-01-15T00:00:00Z').getTime();
      const result = formatTime(midnight);
      expect(result).toBeTruthy();
    });
  });

  describe('sleep', () => {
    it('should delay execution for specified milliseconds', async () => {
      const start = Date.now();
      await sleep(100);
      const duration = Date.now() - start;
      expect(duration).toBeGreaterThanOrEqual(95); // Allow 5ms tolerance
      expect(duration).toBeLessThan(150); // Not too long
    });

    it('should resolve without value', async () => {
      const result = await sleep(10);
      expect(result).toBeUndefined();
    });

    it('should handle zero delay', async () => {
      const start = Date.now();
      await sleep(0);
      const duration = Date.now() - start;
      expect(duration).toBeLessThan(50);
    });
  });

  describe('debounce', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('should call function only once after rapid calls', () => {
      const mockFn = vi.fn();
      const debouncedFn = debounce(mockFn, 100);

      debouncedFn();
      debouncedFn();
      debouncedFn();

      expect(mockFn).not.toHaveBeenCalled();

      vi.advanceTimersByTime(100);
      expect(mockFn).toHaveBeenCalledTimes(1);
    });

    it('should pass correct arguments to debounced function', () => {
      const mockFn = vi.fn();
      const debouncedFn = debounce(mockFn, 50);

      debouncedFn('arg1', 'arg2');
      vi.advanceTimersByTime(50);

      expect(mockFn).toHaveBeenCalledWith('arg1', 'arg2');
    });

    it('should reset timer on subsequent calls', () => {
      const mockFn = vi.fn();
      const debouncedFn = debounce(mockFn, 100);

      debouncedFn();
      vi.advanceTimersByTime(50);
      debouncedFn();
      vi.advanceTimersByTime(50);

      expect(mockFn).not.toHaveBeenCalled();

      vi.advanceTimersByTime(50);
      expect(mockFn).toHaveBeenCalledTimes(1);
    });
  });

  describe('throttle', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('should call function immediately on first call', () => {
      const mockFn = vi.fn();
      const throttledFn = throttle(mockFn, 100);

      throttledFn();
      expect(mockFn).toHaveBeenCalledTimes(1);
    });

    it('should ignore calls within throttle window', () => {
      const mockFn = vi.fn();
      const throttledFn = throttle(mockFn, 100);

      throttledFn();
      throttledFn();
      throttledFn();

      expect(mockFn).toHaveBeenCalledTimes(1);
    });

    it('should allow call after throttle window expires', () => {
      const mockFn = vi.fn();
      const throttledFn = throttle(mockFn, 100);

      throttledFn();
      expect(mockFn).toHaveBeenCalledTimes(1);

      vi.advanceTimersByTime(100);
      throttledFn();
      expect(mockFn).toHaveBeenCalledTimes(2);
    });

    it('should preserve this context', () => {
      const obj = {
        value: 42,
        method: vi.fn(function () {
          return this.value;
        }),
      };
      obj.throttledMethod = throttle(obj.method, 100);

      obj.throttledMethod();
      expect(obj.method).toHaveBeenCalled();
    });
  });

  describe('deepClone', () => {
    it('should create a deep copy of an object', () => {
      const original = { a: 1, b: { c: 2 } };
      const cloned = deepClone(original);

      expect(cloned).toEqual(original);
      expect(cloned).not.toBe(original);
      expect(cloned.b).not.toBe(original.b);
    });

    it('should clone arrays', () => {
      const original = [1, 2, [3, 4]];
      const cloned = deepClone(original);

      expect(cloned).toEqual(original);
      expect(cloned).not.toBe(original);
      expect(cloned[2]).not.toBe(original[2]);
    });

    it('should handle nested structures', () => {
      const original = {
        user: {
          name: 'Test',
          settings: {
            theme: 'dark',
            notifications: true,
          },
        },
        messages: [1, 2, 3],
      };
      const cloned = deepClone(original);

      cloned.user.settings.theme = 'light';
      expect(original.user.settings.theme).toBe('dark');
    });

    it('should handle primitives', () => {
      expect(deepClone(42)).toBe(42);
      expect(deepClone('test')).toBe('test');
      expect(deepClone(null)).toBe(null);
    });
  });

  describe('isEmpty', () => {
    it.each([
      [null, true],
      [undefined, true],
      ['', true],
      [[], true],
      [{}, true],
      ['text', false],
      [[1], false],
      [{ key: 'value' }, false],
      [0, false],
      [false, false],
    ])('should check if %s is empty: %s', (value, expected) => {
      expect(isEmpty(value)).toBe(expected);
    });
  });

  describe('sanitizeHtml', () => {
    it.each([
      ['<script>alert("xss")</script>', '<script>alert("xss")</script>'],
      ["<img src=x onerror='alert(1)'>", '<img src=x onerror=&#039;alert(1)&#039;>'],
      ['Hello & goodbye', 'Hello & goodbye'],
      ['<div>"quoted"</div>', '<div>"quoted"</div>'],
      ["it's a test", 'it&#039;s a test'],
      ['normal text', 'normal text'],
    ])('should sanitize %s to %s', (input, expected) => {
      expect(sanitizeHtml(input)).toBe(expected);
    });

    it('should prevent XSS attacks', () => {
      const malicious = '<script>document.cookie</script>';
      const sanitized = sanitizeHtml(malicious);
      expect(sanitized).not.toContain('<script>');
      expect(sanitized).toContain('<');
      expect(sanitized).toContain('>');
    });
  });

  describe('truncate', () => {
    it('should truncate long strings', () => {
      const long = 'This is a very long string that needs truncation';
      const result = truncate(long, 20);
      expect(result).toBe('This is a very lo...');
      expect(result.length).toBe(20);
    });

    it('should not truncate short strings', () => {
      const short = 'Short';
      expect(truncate(short, 20)).toBe('Short');
    });

    it('should use custom suffix', () => {
      const text = 'Long text here';
      const result = truncate(text, 10, '…');
      expect(result).toBe('Long text…');
    });

    it('should handle exact length match', () => {
      const text = 'Exactly 10';
      expect(truncate(text, 10)).toBe('Exactly 10');
    });

    it('should use default suffix when not provided', () => {
      const result = truncate('Very long string', 10);
      expect(result).toContain('...');
    });
  });

  describe('generateId', () => {
    it('should generate unique IDs', () => {
      const id1 = generateId();
      const id2 = generateId();
      expect(id1).not.toBe(id2);
    });

    it('should return string', () => {
      const id = generateId();
      expect(typeof id).toBe('string');
      expect(id.length).toBeGreaterThan(0);
    });

    it('should generate IDs without spaces', () => {
      const id = generateId();
      expect(id).not.toContain(' ');
    });
  });

  describe('retry', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('should return result on first successful attempt', async () => {
      const fn = vi.fn().mockResolvedValue('success');
      const promise = retry(fn, 3, 100);

      await vi.runAllTimersAsync();
      const result = await promise;

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should retry on failure and succeed', async () => {
      const fn = vi
        .fn()
        .mockRejectedValueOnce(new Error('fail 1'))
        .mockRejectedValueOnce(new Error('fail 2'))
        .mockResolvedValue('success');

      const promise = retry(fn, 3, 100);
      await vi.runAllTimersAsync();
      const result = await promise;

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(3);
    });

    it('should throw error after max retries exhausted', async () => {
      const error = new Error('persistent failure');
      const fn = vi.fn().mockRejectedValue(error);

      const promise = retry(fn, 3, 100);
      await vi.runAllTimersAsync();

      await expect(promise).rejects.toThrow('persistent failure');
      expect(fn).toHaveBeenCalledTimes(3);
    });

    it('should use exponential backoff delays', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('fail'));
      const promise = retry(fn, 3, 100);

      // First attempt
      expect(fn).toHaveBeenCalledTimes(1);

      // Wait for 1st backoff (100ms)
      await vi.advanceTimersByTimeAsync(100);
      expect(fn).toHaveBeenCalledTimes(2);

      // Wait for 2nd backoff (200ms)
      await vi.advanceTimersByTimeAsync(200);
      expect(fn).toHaveBeenCalledTimes(3);
    });
  });

  describe('getRobloxLogsPath', () => {
    it('should return Windows path when platform is win32', () => {
      vi.spyOn(process, 'platform', 'get').mockReturnValue('win32');
      const originalLocalAppData = process.env.LOCALAPPDATA;
      process.env.LOCALAPPDATA = 'C:\\Users\\Test\\AppData\\Local';

      const result = getRobloxLogsPath();
      expect(result).toContain('Roblox');
      expect(result).toContain('Logs');

      process.env.LOCALAPPDATA = originalLocalAppData;
    });

    it('should return macOS path when platform is darwin', () => {
      vi.spyOn(process, 'platform', 'get').mockReturnValue('darwin');
      const result = getRobloxLogsPath();
      expect(result).toContain('Library');
      expect(result).toContain('Logs');
      expect(result).toContain('Roblox');
    });

    it('should return Linux path when platform is linux', () => {
      vi.spyOn(process, 'platform', 'get').mockReturnValue('linux');
      const result = getRobloxLogsPath();
      expect(result).toContain('.local');
      expect(result).toContain('share');
      expect(result).toContain('Roblox');
    });
  });

  describe('parseJobId', () => {
    it('should extract valid JobId from string', () => {
      const input = 'Joining game jobId=5466ec25-6697-4d46-816c-9258976b693a place';
      const result = parseJobId(input);
      expect(result).toBe('5466ec25-6697-4d46-816c-9258976b693a');
    });

    it('should handle uppercase UUID', () => {
      const input = 'jobId=ABCD1234-ABCD-ABCD-ABCD-ABCDEF123456';
      const result = parseJobId(input);
      expect(result).toBe('ABCD1234-ABCD-ABCD-ABCD-ABCDEF123456');
    });

    it('should return null if no JobId found', () => {
      const result = parseJobId('no job id here');
      expect(result).toBeNull();
    });

    it('should return null for malformed JobId', () => {
      const result = parseJobId('jobId=invalid-format');
      expect(result).toBeNull();
    });
  });

  describe('parsePlaceId', () => {
    it('should extract valid PlaceId from string', () => {
      const input = 'Joining game place PlaceId=123456789';
      const result = parsePlaceId(input);
      expect(result).toBe('123456789');
    });

    it('should handle different cases', () => {
      const input = 'placeid=987654321';
      const result = parsePlaceId(input);
      expect(result).toBe('987654321');
    });

    it('should return null if no PlaceId found', () => {
      const result = parsePlaceId('no place id here');
      expect(result).toBeNull();
    });

    it('should return null for non-numeric PlaceId', () => {
      const result = parsePlaceId('PlaceId=abc123');
      expect(result).toBeNull();
    });
  });

  describe('isValidJobId', () => {
    it.each([
      ['5466ec25-6697-4d46-816c-9258976b693a', true],
      ['ABCD1234-ABCD-ABCD-ABCD-ABCDEF123456', true],
      ['abcd1234-abcd-abcd-abcd-abcdef123456', true],
      ['invalid-job-id', false],
      ['', false],
      ['5466ec25-6697-4d46-816c', false], // Too short
      ['5466ec25-6697-4d46-816c-9258976b693a-extra', false], // Too long
      ['5466ec25_6697_4d46_816c_9258976b693a', false], // Wrong separator
    ])('should validate JobId %s as %s', (jobId, expected) => {
      expect(isValidJobId(jobId)).toBe(expected);
    });
  });

  describe('isValidPlaceId', () => {
    it.each([
      ['123456789', true],
      ['1', true],
      ['999999999999', true],
      ['', false],
      ['abc123', false],
      ['12.34', false],
      ['-123', false],
      ['123abc', false],
    ])('should validate PlaceId %s as %s', (placeId, expected) => {
      expect(isValidPlaceId(placeId)).toBe(expected);
    });
  });
});
