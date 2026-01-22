/**
 * Application constants
 */

// Roblox Paths
const ROBLOX_PATHS = {
  LOCAL_APP_DATA: process.env.LOCALAPPDATA || '',
  ROBLOX_LOGS: '', // Will be set dynamically
  ROBLOX_PLAYER: 'RobloxPlayerBeta.exe',
  ROBLOX_STUDIO: 'RobloxStudioBeta.exe'
};

// Roblox Log Patterns
const LOG_PATTERNS = {
  GAME_ID: /GameId=(\d+)/i,
  JOB_ID: /jobId=([a-f0-9-]{36})/i,
  PLACE_ID: /PlaceId=(\d+)/i
};

// Server Detection
const DETECTION = {
  PROCESS_NAME: 'RobloxPlayerBeta.exe',
  LOG_CHECK_INTERVAL: 1000, // 1 second
  MEMORY_FALLBACK_TIMEOUT: 10000, // 10 seconds
  LOG_PATTERN: /init:.*jobId=([a-f0-9-]{36})/i
};

// API Endpoints
const API = {
  ROBLOX: {
    BASE_URL: 'https://www.roblox.com',
    USERS: 'https://users.roblox.com',
    AUTH: 'https://auth.roblox.com',
    GAMES: 'https://games.roblox.com',
    CHAT: 'https://chat.roblox.com/v2'
  },
  SERVER: 'https://ro-chat-zqks.onrender.com'
};

// Storage Keys
const STORAGE = {
  AUTH: 'auth',
  TOKEN: 'token',
  SETTINGS: 'settings',
  USER_ID: 'userId',
  USERNAME: 'username'
};

// IPC Channels
const IPC = {
  AUTH: {
    LOGIN: 'auth:login',
    LOGOUT: 'auth:logout',
    GET_STATUS: 'auth:getStatus'
  },
  DETECTION: {
    GET_SERVER: 'detection:getServer',
    START: 'detection:start',
    STOP: 'detection:stop',
    SERVER_CHANGED: 'detection:serverChanged'
  }
};

// Events
const EVENTS = {
  // Detection Events
  PROCESS_STARTED: 'processStarted',
  PROCESS_STOPPED: 'processStopped',
  SERVER_CHANGED: 'serverChanged',
  LOG_UPDATED: 'logUpdated',
  
  // Auth Events
  LOGIN_SUCCESS: 'loginSuccess',
  LOGIN_FAILURE: 'loginFailure',
  LOGOUT: 'logout',
  
  // Chat Events
  MESSAGE_RECEIVED: 'messageReceived',
  MESSAGE_SENT: 'messageSent'
};

// Socket.io Events
const SOCKET = {
  CONNECTION: 'connection',
  DISCONNECT: 'disconnect',
  JOIN_ROOM: 'join-room',
  LEAVE_ROOM: 'leave-room',
  MESSAGE: 'message'
};

// Timeouts
const TIMEOUTS = {
  API_REQUEST: 30000, // 30 seconds
  DETECTION_START: 5000, // 5 seconds
  LOG_PARSE: 2000 // 2 seconds
};

// Limits
const LIMITS = {
  MAX_MESSAGE_LENGTH: 200,
  MAX_CHAT_HISTORY: 100,
  MAX_RETRY_ATTEMPTS: 3
};

// Error Codes
const ERROR_CODES = {
  AUTH_FAILED: 'AUTH_FAILED',
  INVALID_TOKEN: 'INVALID_TOKEN',
  SERVER_NOT_FOUND: 'SERVER_NOT_FOUND',
  PROCESS_NOT_FOUND: 'PROCESS_NOT_FOUND',
  NETWORK_ERROR: 'NETWORK_ERROR',
  TIMEOUT: 'TIMEOUT'
};

module.exports = {
  ROBLOX_PATHS,
  LOG_PATTERNS,
  DETECTION,
  API,
  STORAGE,
  IPC,
  EVENTS,
  SOCKET,
  TIMEOUTS,
  LIMITS,
  ERROR_CODES
};
