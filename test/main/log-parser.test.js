import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

// You'll implement this
import { parseRobloxLog } from '../../src/main/log-parser.js';

describe('parseRobloxLog', () => {
  it('should extract chat messages from log', () => {
    // Read real fixture file
    const sampleLog = readFileSync(
      join(__dirname, '../fixtures/roblox-logs/sample.log'),
      'utf-8'
    );
    
    const messages = parseRobloxLog(sampleLog);
    
    expect(messages).toEqual([
      {
        user: 'Player1',
        content: 'Hello!',
        timestamp: expect.any(Number)
      }
    ]);
  });

  it('should return empty array for invalid log', () => {
    const messages = parseRobloxLog('invalid data');
    expect(messages).toEqual([]);
  });
});