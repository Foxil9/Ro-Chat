/**
 * Utility functions
 */

const path = require('path');
const os = require('os');

/**
 * Format a timestamp to a readable string
 */
function formatTimestamp(timestamp) {
  const date = new Date(timestamp);
  return date.toLocaleString();
}

/**
 * Format a timestamp to time only (HH:MM:SS)
 */
function formatTime(timestamp) {
  const date = new Date(timestamp);
  return date.toLocaleTimeString();
}

/**
 * Sleep/delay for a specified number of milliseconds
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Debounce a function
 */
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

/**
 * Throttle a function
 */
function throttle(func, limit) {
  let inThrottle;
  return function(...args) {
    if (!inThrottle) {
      func.apply(this, args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
}

/**
 * Deep clone an object
 */
function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

/**
 * Check if a value is empty (null, undefined, empty string, empty array, empty object)
 */
function isEmpty(value) {
  if (value == null) return true;
  if (typeof value === 'string' || Array.isArray(value)) return value.length === 0;
  if (typeof value === 'object') return Object.keys(value).length === 0;
  return false;
}

/**
 * Sanitize a string to prevent XSS
 */
function sanitizeHtml(str) {
  const map = {
    '&': '&',
    '<': '<',
    '>': '>',
    '"': '"',
    "'": '&#039;'
  };
  return str.replace(/[&<>"']/g, m => map[m]);
}

/**
 * Truncate a string to a maximum length
 */
function truncate(str, maxLength = 50, suffix = '...') {
  if (str.length <= maxLength) return str;
  return str.substring(0, maxLength - suffix.length) + suffix;
}

/**
 * Generate a random ID
 */
function generateId() {
  return Math.random().toString(36).substring(2) + Date.now().toString(36);
}

/**
 * Retry a function with exponential backoff
 */
async function retry(fn, maxRetries = 3, delay = 1000) {
  let lastError;
  
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (i < maxRetries - 1) {
        await sleep(delay * Math.pow(2, i));
      }
    }
  }
  
  throw lastError;
}

/**
 * Get Roblox log directory path
 */
function getRobloxLogsPath() {
  const platform = os.platform();
  
  if (platform === 'win32') {
    return path.join(
      process.env.LOCALAPPDATA,
      'Roblox',
      'Logs'
    );
  } else if (platform === 'darwin') {
    return path.join(
      os.homedir(),
      'Library',
      'Logs',
      'Roblox'
    );
  } else {
    return path.join(
      os.homedir(),
      '.local',
      'share',
      'Roblox',
      'Logs'
    );
  }
}

/**
 * Check if Roblox is installed
 */
function isRobloxInstalled() {
  const logsPath = getRobloxLogsPath();
  const fs = require('fs');
  
  try {
    return fs.existsSync(logsPath);
  } catch (error) {
    return false;
  }
}

/**
 * Get the latest log file from Roblox logs directory
 */
function getLatestLogFile() {
  const fs = require('fs');
  const logsPath = getRobloxLogsPath();
  
  try {
    const files = fs.readdirSync(logsPath);
    const logFiles = files.filter(f => f.endsWith('.log'));
    
    if (logFiles.length === 0) return null;
    
    // Sort by modification time, get latest
    logFiles.sort((a, b) => {
      const statA = fs.statSync(path.join(logsPath, a));
      const statB = fs.statSync(path.join(logsPath, b));
      return statB.mtime - statA.mtime;
    });
    
    return path.join(logsPath, logFiles[0]);
  } catch (error) {
    return null;
  }
}

/**
 * Parse JobId from string
 */
function parseJobId(str) {
  const jobIdRegex = /jobId=([a-f0-9-]{36})/i;
  const match = str.match(jobIdRegex);
  return match ? match[1] : null;
}

/**
 * Parse PlaceId from string
 */
function parsePlaceId(str) {
  const placeIdRegex = /PlaceId=(\d+)/i;
  const match = str.match(placeIdRegex);
  return match ? match[1] : null;
}

/**
 * Validate JobId format
 */
function isValidJobId(jobId) {
  return /^[a-f0-9-]{36}$/i.test(jobId);
}

/**
 * Validate PlaceId format
 */
function isValidPlaceId(placeId) {
  return /^\d+$/.test(placeId);
}

module.exports = {
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
  isRobloxInstalled,
  getLatestLogFile,
  parseJobId,
  parsePlaceId,
  isValidJobId,
  isValidPlaceId
};
