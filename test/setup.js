import { vi } from 'vitest';

/**
 * Test setup file - runs before each test
 * Mocks Electron APIs and other dependencies used across the app
 */

// Mock Electron module for main process tests
vi.mock('electron', () => ({
  app: {
    getPath: vi.fn((name) => {
      if (name === 'userData') return '/mock/userData';
      if (name === 'logs') return '/mock/logs';
      return '/mock/path';
    }),
    getName: vi.fn(() => 'RoChat'),
    getVersion: vi.fn(() => '1.0.0'),
    quit: vi.fn(),
    on: vi.fn(),
    whenReady: vi.fn(() => Promise.resolve()),
  },
  BrowserWindow: vi.fn(() => ({
    loadFile: vi.fn(),
    on: vi.fn(),
    webContents: {
      send: vi.fn(),
      openDevTools: vi.fn(),
    },
    show: vi.fn(),
    minimize: vi.fn(),
    maximize: vi.fn(),
    close: vi.fn(),
    setAlwaysOnTop: vi.fn(),
    setOpacity: vi.fn(),
    setBounds: vi.fn(),
  })),
  ipcMain: {
    handle: vi.fn(),
    on: vi.fn(),
    removeHandler: vi.fn(),
  },
  shell: {
    openExternal: vi.fn(),
  },
  dialog: {
    showMessageBox: vi.fn(() => Promise.resolve({ response: 0 })),
    showErrorBox: vi.fn(),
  },
  protocol: {
    registerFileProtocol: vi.fn(),
  },
  contextBridge: {
    exposeInMainWorld: vi.fn(),
  },
  ipcRenderer: {
    invoke: vi.fn(),
    on: vi.fn(),
    send: vi.fn(),
    removeListener: vi.fn(),
  },
}));

// Mock electron-store for main process tests
vi.mock('electron-store', () => {
  return {
    default: vi.fn(() => ({
      get: vi.fn(),
      set: vi.fn(),
      delete: vi.fn(),
      clear: vi.fn(),
      has: vi.fn(),
      store: {},
    })),
  };
});

// Mock winston logger for main process tests
vi.mock('winston', () => ({
  createLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  })),
  format: {
    combine: vi.fn(),
    timestamp: vi.fn(),
    printf: vi.fn(),
    colorize: vi.fn(),
    json: vi.fn(),
  },
  transports: {
    Console: vi.fn(),
    File: vi.fn(),
  },
}));

// Mock socket.io-client for main process tests
vi.mock('socket.io-client', () => ({
  io: vi.fn(() => ({
    on: vi.fn(),
    emit: vi.fn(),
    off: vi.fn(),
    connect: vi.fn(),
    disconnect: vi.fn(),
    connected: false,
  })),
}));

// Mock axios for HTTP requests
vi.mock('axios', () => ({
  default: {
    create: vi.fn(() => ({
      get: vi.fn(() => Promise.resolve({ data: {} })),
      post: vi.fn(() => Promise.resolve({ data: {} })),
      put: vi.fn(() => Promise.resolve({ data: {} })),
      delete: vi.fn(() => Promise.resolve({ data: {} })),
    })),
    get: vi.fn(() => Promise.resolve({ data: {} })),
    post: vi.fn(() => Promise.resolve({ data: {} })),
  },
}));

/**
 * Mock window.electronAPI (exposed by preload script)
 * Available in renderer process tests (JSDOM environment)
 */
const mockElectronAPI = {
  // Auth methods
  auth: {
    login: vi.fn(() => Promise.resolve({ success: true })),
    logout: vi.fn(() => Promise.resolve({ success: true })),
    getStatus: vi.fn(() =>
      Promise.resolve({
        isAuthenticated: false,
        user: null,
      })
    ),
  },

  // Detection methods
  detection: {
    getServer: vi.fn(() => Promise.resolve(null)),
    start: vi.fn(() => Promise.resolve()),
    stop: vi.fn(() => Promise.resolve()),
    onServerChanged: vi.fn(() => vi.fn()), // Returns unsubscribe function
  },

  // Chat methods
  chat: {
    sendMessage: vi.fn(() => Promise.resolve({ success: true })),
    loadHistory: vi.fn(() => Promise.resolve({ messages: [] })),
    emitTyping: vi.fn(() => Promise.resolve()),
  },

  // Event listeners
  onServerChanged: vi.fn(() => vi.fn()),
  onThemeChanged: vi.fn(() => vi.fn()),
  onAutoHideHeaderChanged: vi.fn(() => vi.fn()),
  onAutoHideFooterChanged: vi.fn(() => vi.fn()),
  onFocusChat: vi.fn(() => vi.fn()),
  onLogout: vi.fn(() => vi.fn()),
  onTypingIndicator: vi.fn(() => vi.fn()),
  onMessage: vi.fn(() => vi.fn()),
  onMessageEditError: vi.fn(() => vi.fn()),
  onMessageDeleteError: vi.fn(() => vi.fn()),
  onMessageEdited: vi.fn(() => vi.fn()),
  onMessageDeleted: vi.fn(() => vi.fn()),

  // Window controls
  window: {
    minimize: vi.fn(() => Promise.resolve()),
    maximize: vi.fn(() => Promise.resolve()),
    close: vi.fn(() => Promise.resolve()),
    setAlwaysOnTop: vi.fn(() => Promise.resolve()),
    setOpacity: vi.fn(() => Promise.resolve()),
    openSettings: vi.fn(() => Promise.resolve()),
  },

  // Settings
  settings: {
    applyTheme: vi.fn(() => Promise.resolve()),
    resetPosition: vi.fn(() => Promise.resolve()),
    registerKeybind: vi.fn(() => Promise.resolve()),
    setMessageOpacity: vi.fn(),
    setAutoHideHeader: vi.fn(() => Promise.resolve()),
    setAutoHideFooter: vi.fn(() => Promise.resolve()),
  },

  // Shell methods
  shell: {
    openExternal: vi.fn(() => Promise.resolve()),
  },
};

/**
 * Mock window.electron (legacy API used by chat.js)
 */
const mockElectron = {
  logout: vi.fn(() => Promise.resolve({ success: true })),
  getAuthStatus: vi.fn(() =>
    Promise.resolve({
      isAuthenticated: false,
      user: null,
    })
  ),
  sendMessage: vi.fn(() => Promise.resolve({ success: true })),
  loadHistory: vi.fn(() => Promise.resolve({ messages: [] })),
  emitTyping: vi.fn(() => Promise.resolve()),
  editMessage: vi.fn(() => Promise.resolve({ success: true })),
  deleteMessage: vi.fn(() => Promise.resolve({ success: true })),
  onServerChanged: vi.fn(() => vi.fn()),
  onTypingIndicator: vi.fn(() => vi.fn()),
  onMessage: vi.fn(() => vi.fn()),
  onMessageEdited: vi.fn(() => vi.fn()),
  onMessageDeleted: vi.fn(() => vi.fn()),
  startDetection: vi.fn(() => Promise.resolve()),
  openExternal: vi.fn(() => Promise.resolve()),
};

// Expose mocks on global for all tests
global.electronAPI = mockElectronAPI;
global.electron = mockElectron;

// Make available on window for renderer tests (JSDOM)
if (typeof window !== 'undefined') {
  window.electronAPI = mockElectronAPI;
  window.electron = mockElectron;
}

// Mock localStorage for renderer tests
if (typeof window !== 'undefined' && !window.localStorage) {
  const localStorageMock = {
    getItem: vi.fn((key) => localStorageMock.store[key] || null),
    setItem: vi.fn((key, value) => {
      localStorageMock.store[key] = value.toString();
    }),
    removeItem: vi.fn((key) => {
      delete localStorageMock.store[key];
    }),
    clear: vi.fn(() => {
      localStorageMock.store = {};
    }),
    store: {},
  };
  window.localStorage = localStorageMock;
}

// Reset all mocks before each test
beforeEach(() => {
  vi.clearAllMocks();
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.clear();
  }
});
