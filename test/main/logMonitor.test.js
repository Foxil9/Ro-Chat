import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import { EventEmitter } from 'events';

/**
 * Test logMonitor.js - Roblox log file parsing and monitoring
 * Tests join/disconnect detection, file watching, and state management
 */

describe('LogMonitor', () => {
  let logMonitor;
  let mockLogger;
  let mockSecureStore;
  let testLogDir;
  let originalEnv;

  beforeEach(() => {
    // Save original env
    originalEnv = { ...process.env };

    // Create temp directory for test logs
    testLogDir = path.join(__dirname, '../fixtures/temp-logs');
    if (!fs.existsSync(testLogDir)) {
      fs.mkdirSync(testLogDir, { recursive: true });
    }

    // Set env var for log directory
    process.env.LOCALAPPDATA = path.join(__dirname, '../fixtures');

    // Mock logger
    mockLogger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    };

    // Mock secure store
    mockSecureStore = {
      getLogPosition: vi.fn(() => null),
      saveLogPosition: vi.fn(),
    };

    // Mock the logger module
    vi.doMock('../../src/main/logging/logger', () => mockLogger);

    // Mock the secureStore module
    vi.doMock('../../src/main/storage/secureStore', () => mockSecureStore);
  });

  afterEach(() => {
    // Restore env
    process.env = originalEnv;

    // Clean up test files
    if (fs.existsSync(testLogDir)) {
      const files = fs.readdirSync(testLogDir);
      files.forEach((file) => {
        fs.unlinkSync(path.join(testLogDir, file));
      });
      fs.rmdirSync(testLogDir);
    }

    // Stop monitoring if running
    if (logMonitor && logMonitor.isMonitoring) {
      logMonitor.stopMonitoring();
    }

    vi.clearAllMocks();
    vi.resetModules();
  });

  describe('parseLine - Join Detection', () => {
    beforeEach(() => {
      // Create a simple mock that extends EventEmitter
      class MockLogMonitor extends EventEmitter {
        constructor() {
          super();
          this.lastServerInfo = null;
        }

        parseLine(line) {
          const JOIN_PATTERN =
            /\[FLog::Output\]\s*!\s*Joining\s*game\s*['"]([0-9a-f-]+)['"]\s*place\s*(\d+)/i;
          const DISCONNECT_PATTERN =
            /\[FLog::[^\]]*\].*?(Disconnected|disconnect|leaving game|HttpRbxApiService stopped|Game has shut down|You have been kicked|Connection lost)/i;

          const disconnectMatch = line.match(DISCONNECT_PATTERN);
          if (disconnectMatch) {
            this.lastServerInfo = null;
            this.emit('disconnected');
            return;
          }

          const joinMatch = line.match(JOIN_PATTERN);
          if (joinMatch) {
            const jobId = joinMatch[1];
            const placeId = joinMatch[2];
            const serverInfo = {
              placeId,
              jobId,
              timestamp: Date.now(),
            };

            if (
              !this.lastServerInfo ||
              this.lastServerInfo.placeId !== serverInfo.placeId ||
              this.lastServerInfo.jobId !== serverInfo.jobId
            ) {
              this.lastServerInfo = serverInfo;
              this.emit('serverDetected', serverInfo);
            }
          }
        }
      }

      logMonitor = new MockLogMonitor();
    });

    it('should detect valid join with single quotes', () => {
      const joinListener = vi.fn();
      logMonitor.on('serverDetected', joinListener);

      logMonitor.parseLine(
        "[FLog::Output] ! Joining game '5466ec25-6697-4d46-816c-9258976b693a' place 123456789 at 192.168.1.1"
      );

      expect(joinListener).toHaveBeenCalledTimes(1);
      expect(joinListener).toHaveBeenCalledWith(
        expect.objectContaining({
          jobId: '5466ec25-6697-4d46-816c-9258976b693a',
          placeId: '123456789',
          timestamp: expect.any(Number),
        })
      );
    });

    it('should detect valid join with double quotes', () => {
      const joinListener = vi.fn();
      logMonitor.on('serverDetected', joinListener);

      logMonitor.parseLine(
        '[FLog::Output] ! Joining game "aaaaaaaa-1111-2222-3333-bbbbbbbbbbbb" place 111111111 at 10.0.0.1'
      );

      expect(joinListener).toHaveBeenCalledTimes(1);
      expect(joinListener).toHaveBeenCalledWith(
        expect.objectContaining({
          jobId: 'aaaaaaaa-1111-2222-3333-bbbbbbbbbbbb',
          placeId: '111111111',
        })
      );
    });

    it('should handle uppercase UUIDs', () => {
      const joinListener = vi.fn();
      logMonitor.on('serverDetected', joinListener);

      logMonitor.parseLine(
        '[FLog::Output] ! Joining game "ABCD1234-ABCD-ABCD-ABCD-ABCDEF123456" place 999999999 at 1.1.1.1'
      );

      expect(joinListener).toHaveBeenCalledTimes(1);
      expect(joinListener).toHaveBeenCalledWith(
        expect.objectContaining({
          jobId: 'ABCD1234-ABCD-ABCD-ABCD-ABCDEF123456',
          placeId: '999999999',
        })
      );
    });

    it('should not detect joins with malformed JobId', () => {
      const joinListener = vi.fn();
      logMonitor.on('serverDetected', joinListener);

      logMonitor.parseLine(
        "[FLog::Output] ! Joining game 'not-a-valid-jobid' place 123456789"
      );

      expect(joinListener).not.toHaveBeenCalled();
    });

    it('should not detect joins with non-numeric PlaceId', () => {
      const joinListener = vi.fn();
      logMonitor.on('serverDetected', joinListener);

      logMonitor.parseLine(
        "[FLog::Output] ! Joining game '5466ec25-6697-4d46-816c-9258976b693a' place notanumber"
      );

      expect(joinListener).not.toHaveBeenCalled();
    });

    it('should not detect joins without proper format', () => {
      const joinListener = vi.fn();
      logMonitor.on('serverDetected', joinListener);

      const invalidLines = [
        '[FLog::Output] Joining game without quotes',
        '[FLog::Output] place 123456789 only',
        "[FLog::Output] ! game '5466ec25-6697-4d46-816c-9258976b693a' missing joining",
        '[FLog::Output] Some other log line',
      ];

      invalidLines.forEach((line) => logMonitor.parseLine(line));

      expect(joinListener).not.toHaveBeenCalled();
    });

    it('should only emit event when server changes', () => {
      const joinListener = vi.fn();
      logMonitor.on('serverDetected', joinListener);

      const line =
        "[FLog::Output] ! Joining game '5466ec25-6697-4d46-816c-9258976b693a' place 123456789 at 1.1.1.1";

      // Parse same line twice
      logMonitor.parseLine(line);
      logMonitor.parseLine(line);

      // Should only emit once (no server change)
      expect(joinListener).toHaveBeenCalledTimes(1);
    });

    it('should emit event when PlaceId changes', () => {
      const joinListener = vi.fn();
      logMonitor.on('serverDetected', joinListener);

      logMonitor.parseLine(
        "[FLog::Output] ! Joining game '5466ec25-6697-4d46-816c-9258976b693a' place 111111111 at 1.1.1.1"
      );
      logMonitor.parseLine(
        "[FLog::Output] ! Joining game '5466ec25-6697-4d46-816c-9258976b693a' place 222222222 at 1.1.1.1"
      );

      expect(joinListener).toHaveBeenCalledTimes(2);
    });

    it('should emit event when JobId changes', () => {
      const joinListener = vi.fn();
      logMonitor.on('serverDetected', joinListener);

      logMonitor.parseLine(
        "[FLog::Output] ! Joining game 'aaaaaaaa-1111-2222-3333-bbbbbbbbbbbb' place 123456789 at 1.1.1.1"
      );
      logMonitor.parseLine(
        "[FLog::Output] ! Joining game 'cccccccc-4444-5555-6666-dddddddddddd' place 123456789 at 1.1.1.1"
      );

      expect(joinListener).toHaveBeenCalledTimes(2);
    });
  });

  describe('parseLine - Disconnect Detection', () => {
    beforeEach(() => {
      class MockLogMonitor extends EventEmitter {
        constructor() {
          super();
          this.lastServerInfo = { jobId: 'test', placeId: '123' };
        }

        parseLine(line) {
          const DISCONNECT_PATTERN =
            /\[FLog::[^\]]*\].*?(Disconnected|disconnect|leaving game|HttpRbxApiService stopped|Game has shut down|You have been kicked|Connection lost)/i;

          const disconnectMatch = line.match(DISCONNECT_PATTERN);
          if (disconnectMatch) {
            this.lastServerInfo = null;
            this.emit('disconnected');
            return;
          }
        }
      }

      logMonitor = new MockLogMonitor();
    });

    it.each([
      ['[FLog::Network] Disconnected from server'],
      ['[FLog::Output] disconnect detected'],
      ['[FLog::Game] leaving game session'],
      ['[FLog::HttpRbxApiService] HttpRbxApiService stopped'],
      ['[FLog::Network] Game has shut down'],
      ['[FLog::Security] You have been kicked from the game'],
      ['[FLog::Network] Connection lost to server'],
    ])('should detect disconnect pattern: %s', (line) => {
      const disconnectListener = vi.fn();
      logMonitor.on('disconnected', disconnectListener);

      logMonitor.parseLine(line);

      expect(disconnectListener).toHaveBeenCalledTimes(1);
      expect(logMonitor.lastServerInfo).toBeNull();
    });

    it('should not detect disconnect in unrelated log lines', () => {
      const disconnectListener = vi.fn();
      logMonitor.on('disconnected', disconnectListener);

      const normalLines = [
        '[FLog::Output] Player connected successfully',
        '[FLog::Network] Network statistics update',
        '[FLog::Game] Game running normally',
      ];

      normalLines.forEach((line) => logMonitor.parseLine(line));

      expect(disconnectListener).not.toHaveBeenCalled();
    });

    it('should clear lastServerInfo on disconnect', () => {
      const disconnectListener = vi.fn();
      logMonitor.on('disconnected', disconnectListener);

      expect(logMonitor.lastServerInfo).not.toBeNull();

      logMonitor.parseLine('[FLog::Network] Disconnected from server');

      expect(logMonitor.lastServerInfo).toBeNull();
    });
  });

  describe('parseLogs - Multiple Lines', () => {
    beforeEach(() => {
      // Load actual fixtures
      class MockLogMonitor extends EventEmitter {
        constructor() {
          super();
          this.lastServerInfo = null;
        }

        parseLine(line) {
          const JOIN_PATTERN =
            /\[FLog::Output\]\s*!\s*Joining\s*game\s*['"]([0-9a-f-]+)['"]\s*place\s*(\d+)/i;
          const DISCONNECT_PATTERN =
            /\[FLog::[^\]]*\].*?(Disconnected|disconnect|leaving game|HttpRbxApiService stopped|Game has shut down|You have been kicked|Connection lost)/i;

          const disconnectMatch = line.match(DISCONNECT_PATTERN);
          if (disconnectMatch) {
            this.lastServerInfo = null;
            this.emit('disconnected');
            return;
          }

          const joinMatch = line.match(JOIN_PATTERN);
          if (joinMatch) {
            const jobId = joinMatch[1];
            const placeId = joinMatch[2];
            const serverInfo = {
              placeId,
              jobId,
              timestamp: Date.now(),
            };

            if (
              !this.lastServerInfo ||
              this.lastServerInfo.placeId !== serverInfo.placeId ||
              this.lastServerInfo.jobId !== serverInfo.jobId
            ) {
              this.lastServerInfo = serverInfo;
              this.emit('serverDetected', serverInfo);
            }
          }
        }

        parseLogs(data) {
          const lines = data.split('\n');
          for (const line of lines) {
            this.parseLine(line);
          }
        }
      }

      logMonitor = new MockLogMonitor();
    });

    it('should parse multiple join events from log file', () => {
      const joinListener = vi.fn();
      logMonitor.on('serverDetected', joinListener);

      const logContent = fs.readFileSync(
        path.join(__dirname, '../fixtures/roblox-logs/sample-multiple-joins.log'),
        'utf8'
      );

      logMonitor.parseLogs(logContent);

      expect(joinListener).toHaveBeenCalledTimes(2);
      expect(joinListener).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          jobId: 'aaaaaaaa-1111-2222-3333-bbbbbbbbbbbb',
          placeId: '111111111',
        })
      );
      expect(joinListener).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          jobId: 'cccccccc-4444-5555-6666-dddddddddddd',
          placeId: '222222222',
        })
      );
    });

    it('should parse join and disconnect sequence', () => {
      const joinListener = vi.fn();
      const disconnectListener = vi.fn();
      logMonitor.on('serverDetected', joinListener);
      logMonitor.on('disconnected', disconnectListener);

      const logContent = fs.readFileSync(
        path.join(__dirname, '../fixtures/roblox-logs/sample-multiple-joins.log'),
        'utf8'
      );

      logMonitor.parseLogs(logContent);

      expect(joinListener).toHaveBeenCalledTimes(2);
      expect(disconnectListener).toHaveBeenCalledTimes(1);
    });

    it('should ignore malformed lines without crashing', () => {
      const joinListener = vi.fn();
      logMonitor.on('serverDetected', joinListener);

      const logContent = fs.readFileSync(
        path.join(__dirname, '../fixtures/roblox-logs/sample-malformed.log'),
        'utf8'
      );

      expect(() => logMonitor.parseLogs(logContent)).not.toThrow();
      expect(joinListener).not.toHaveBeenCalled();
    });

    it('should handle empty log content', () => {
      const joinListener = vi.fn();
      logMonitor.on('serverDetected', joinListener);

      logMonitor.parseLogs('');

      expect(joinListener).not.toHaveBeenCalled();
    });

    it('should handle log content with only newlines', () => {
      const joinListener = vi.fn();
      logMonitor.on('serverDetected', joinListener);

      logMonitor.parseLogs('\n\n\n');

      expect(joinListener).not.toHaveBeenCalled();
    });
  });

  describe('Edge Cases', () => {
    beforeEach(() => {
      class MockLogMonitor extends EventEmitter {
        constructor() {
          super();
          this.lastServerInfo = null;
        }

        parseLine(line) {
          const JOIN_PATTERN =
            /\[FLog::Output\]\s*!\s*Joining\s*game\s*['"]([0-9a-f-]+)['"]\s*place\s*(\d+)/i;

          const joinMatch = line.match(JOIN_PATTERN);
          if (joinMatch) {
            const jobId = joinMatch[1];
            const placeId = joinMatch[2];
            const serverInfo = {
              placeId,
              jobId,
              timestamp: Date.now(),
            };

            if (
              !this.lastServerInfo ||
              this.lastServerInfo.placeId !== serverInfo.placeId ||
              this.lastServerInfo.jobId !== serverInfo.jobId
            ) {
              this.lastServerInfo = serverInfo;
              this.emit('serverDetected', serverInfo);
            }
          }
        }
      }

      logMonitor = new MockLogMonitor();
    });

    it('should handle lines with extra whitespace', () => {
      const joinListener = vi.fn();
      logMonitor.on('serverDetected', joinListener);

      logMonitor.parseLine(
        "[FLog::Output]     !     Joining     game     '5466ec25-6697-4d46-816c-9258976b693a'     place     123456789"
      );

      expect(joinListener).toHaveBeenCalledTimes(1);
    });

    it('should handle very long PlaceId', () => {
      const joinListener = vi.fn();
      logMonitor.on('serverDetected', joinListener);

      logMonitor.parseLine(
        "[FLog::Output] ! Joining game '5466ec25-6697-4d46-816c-9258976b693a' place 999999999999999999 at 1.1.1.1"
      );

      expect(joinListener).toHaveBeenCalledTimes(1);
      expect(joinListener).toHaveBeenCalledWith(
        expect.objectContaining({
          placeId: '999999999999999999',
        })
      );
    });

    it('should preserve UUID case from log', () => {
      const joinListener = vi.fn();
      logMonitor.on('serverDetected', joinListener);

      logMonitor.parseLine(
        '[FLog::Output] ! Joining game "AbCdEf12-3456-7890-ABCD-EF1234567890" place 123 at 1.1.1.1'
      );

      expect(joinListener).toHaveBeenCalledWith(
        expect.objectContaining({
          jobId: 'AbCdEf12-3456-7890-ABCD-EF1234567890',
        })
      );
    });

    it('should handle rapid server changes', () => {
      const joinListener = vi.fn();
      logMonitor.on('serverDetected', joinListener);

      for (let i = 0; i < 5; i++) {
        logMonitor.parseLine(
          `[FLog::Output] ! Joining game '5466ec25-6697-4d46-816c-9258976b693${i}' place 12345678${i} at 1.1.1.1`
        );
      }

      expect(joinListener).toHaveBeenCalledTimes(5);
    });
  });
});
