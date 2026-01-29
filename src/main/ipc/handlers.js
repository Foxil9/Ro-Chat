const { ipcMain, shell } = require('electron');
const axios = require('axios');
const robloxAuth = require('../auth/robloxAuth');
const tokenManager = require('../auth/tokenManager');
const detector = require('../detection/detector');
const secureStore = require('../storage/secureStore');
const logger = require('../logging/logger');
const { sanitizeError } = require('../utils/sanitizer');
const socketClient = require('../socket/socketClient');

// Backend server configuration
const BACKEND_URL = 'https://ro-chat-zqks.onrender.com';

// Store reference to main window for sending events
let mainWindow = null;
let settingsWindow = null;

/**
 * Set the main window reference
 */
function setMainWindow(window) {
  mainWindow = window;
  logger.info('Main window set for IPC handlers');
}

/**
 * Forward detector events to renderer
 */
function setupDetectorEvents() {
  detector.on('serverChanged', (serverInfo) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('detection:serverChanged', serverInfo);
    }
  });
}

/**
 * Setup socket client event forwarding to renderer
 * This must be called AFTER the socket is connected
 */
function setupSocketEvents() {
  if (!socketClient.socket) {
    logger.warn('setupSocketEvents called but socket not initialized yet');
    return;
  }

  logger.info('Setting up socket event listeners');

  socketClient.socket.on('typingIndicator', (data) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('socket:typingIndicator', data);
    }
  });

  socketClient.socket.on('message', (data) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('socket:message', data);
    }
  });

  socketClient.socket.on('messageUpdated', (data) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('socket:messageUpdated', data);
    }
  });

  socketClient.socket.on('messageEditError', (data) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('socket:messageEditError', data);
    }
  });

  socketClient.socket.on('messageDeleteError', (data) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('socket:messageDeleteError', data);
    }
  });
}

/**
 * Register all IPC handlers
 */
function registerHandlers() {
  logger.info('Registering IPC handlers');

  // Auth handlers
  ipcMain.handle('auth:login', handleLogin);
  ipcMain.handle('auth:logout', handleLogout);
  ipcMain.handle('auth:getStatus', handleGetStatus);

  // Detection handlers
  ipcMain.handle('detection:getServer', handleGetServer);
  ipcMain.handle('detection:start', handleStartDetection);
  ipcMain.handle('detection:stop', handleStopDetection);

  // Chat handlers
  ipcMain.handle('chat:send', handleSendMessage);
  ipcMain.handle('chat:history', handleLoadHistory);
  ipcMain.handle('chat:emitTyping', handleEmitTyping);
  ipcMain.handle('chat:editMessage', handleEditMessage);
  ipcMain.handle('chat:deleteMessage', handleDeleteMessage);
  // REMOVED GAME BROWSER FEATURE - chat:getGames handler removed

  // Window control handlers
  ipcMain.handle('window:minimize', handleMinimize);
  ipcMain.handle('window:maximize', handleMaximize);
  ipcMain.handle('window:close', handleClose);
  ipcMain.handle('window:setAlwaysOnTop', handleSetAlwaysOnTop);
  ipcMain.handle('window:setOpacity', handleSetOpacity);
  ipcMain.handle('window:openSettings', handleOpenSettings);

  // Settings handlers
  ipcMain.handle('settings:applyTheme', handleApplyTheme);
  ipcMain.handle('settings:resetPosition', handleResetPosition);
  ipcMain.handle('settings:registerKeybind', handleRegisterKeybind);
  ipcMain.on('settings:setMessageOpacity', handleSetMessageOpacity);
  ipcMain.handle('settings:setAutoHideHeader', handleSetAutoHideHeader);
  ipcMain.handle('settings:setAutoHideFooter', handleSetAutoHideFooter);

  // Shell handlers
  ipcMain.handle('shell:openExternal', handleOpenExternal);

  logger.info('IPC handlers registered successfully');
}

// ==================== AUTH HANDLERS ====================

/**
 * Handle login request
 */
async function handleLogin(event) {
  try {
    logger.info('Login requested');
    const userInfo = await robloxAuth.initiateLogin();

    // Enable always-on-top after successful login with screen-saver level
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.setAlwaysOnTop(true, 'screen-saver');
      logger.info('Always-on-top enabled after login');
    }

    return { success: true, user: userInfo };
  } catch (error) {
    logger.error('Login failed', sanitizeError({ error: error.message }));
    return { success: false, error: error.message };
  }
}

/**
 * Handle logout request
 */
async function handleLogout(event) {
  try {
    logger.info('Logout requested');

    // Stop detector if running
    if (detector.isActive()) {
      detector.stop();
      logger.info('Detector stopped');
    }

    // Clear authentication
    const result = tokenManager.logout();

    // Reset window state for login screen
    if (mainWindow && !mainWindow.isDestroyed()) {
      // Disable always-on-top when logging out
      mainWindow.setAlwaysOnTop(false);
      logger.info('Always-on-top disabled after logout');

      // Reset window position to center
      mainWindow.center();
      logger.info('Window position reset to center');

      // Notify main window to show login view
      mainWindow.webContents.send('auth:logout');
    }

    return { success: result };
  } catch (error) {
    logger.error('Logout failed', sanitizeError({ error: error.message }));
    return { success: false, error: error.message };
  }
}

/**
 * Handle get authentication status request
 */
async function handleGetStatus(event) {
  try {
    const isAuthenticated = robloxAuth.isAuthenticated();
    const user = robloxAuth.getCurrentUser();

    return {
      success: true,
      authenticated: isAuthenticated,
      user
    };
  } catch (error) {
    logger.error('Failed to get auth status', sanitizeError({ error: error.message }));
    return { success: false, error: error.message };
  }
}

// ==================== DETECTION HANDLERS ====================

/**
 * Handle get current server request
 */
async function handleGetServer(event) {
  try {
    const server = detector.getCurrentServer();
    return { success: true, server };
  } catch (error) {
    logger.error('Failed to get server', sanitizeError({ error: error.message }));
    return { success: false, error: error.message };
  }
}

/**
 * Handle start detection request
 */
async function handleStartDetection(event) {
  try {
    logger.info('Start detection requested');
    detector.start();
    return { success: true };
  } catch (error) {
    logger.error('Failed to start detection', sanitizeError({ error: error.message }));
    return { success: false, error: error.message };
  }
}

/**
 * Handle stop detection request
 */
async function handleStopDetection(event) {
  try {
    logger.info('Stop detection requested');
    detector.stop();
    return { success: true };
  } catch (error) {
    logger.error('Failed to stop detection', sanitizeError({ error: error.message }));
    return { success: false, error: error.message };
  }
}

// ==================== CHAT HANDLERS ====================

/**
 * Handle send message request
 * Sends message to backend server which then broadcasts via Socket.io
 */
async function handleSendMessage(event, { jobId, placeId, chatType, message }) {
  try {
    logger.info('Send message requested', { chatType, messageLength: message?.length });

    // Get current user info
    const user = robloxAuth.getCurrentUser();
    if (!user) {
      logger.error('User not authenticated - getCurrentUser returned null');
      return { success: false, error: 'Not authenticated. Please log in again.' };
    }

    // Get auth token
    const token = tokenManager.getValidToken();
    if (!token) {
      logger.error('No valid token - getValidToken returned null');
      return { success: false, error: 'No valid auth token. Please log in again.' };
    }

    logger.info('Sending message with auth', { hasToken: !!token });

    // Send to backend server
    const response = await axios.post(`${BACKEND_URL}/api/chat/send`, {
      jobId,
      placeId,
      chatType,
      message,
      userId: user.userId,
      username: user.username
    }, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      timeout: 10000
    });

    logger.info('Message sent successfully', { chatType });
    return { success: true };
  } catch (error) {
    // Extract error message from response
    let errorMessage = 'Failed to send message';
    let errorReason = 'Unknown error';

    if (error.response?.data?.error) {
      errorMessage = error.response.data.error;
      errorReason = `Server rejected: ${errorMessage}`;
    } else if (error.response?.status === 429) {
      errorMessage = 'Slow down! Please wait before sending another message.';
      errorReason = `Rate limited (HTTP ${error.response?.status}): ${errorMessage}`;
    } else if (error.response?.status) {
      errorReason = `HTTP ${error.response?.status}: ${error.response?.statusText || 'Server error'}`;
    } else if (error.code === 'ECONNREFUSED') {
      errorReason = 'Connection refused - server may be down';
    } else if (error.code === 'ETIMEDOUT') {
      errorReason = 'Connection timed out - check your network';
    } else {
      errorReason = error.message || 'Unknown error';
    }

    logger.error('Message NOT sent', sanitizeError({
      error: error.message,
      status: error.response?.status,
      responseData: error.response?.data,
      chatType,
      backendUrl: BACKEND_URL,
      reason: errorReason
    }));

    return {
      success: false,
      error: errorMessage,
      status: error.response?.status
    };
  }
}

/**
 * Handle load chat history request
 * Fetches messages from backend server for a specific JobId or PlaceId
 */
async function handleLoadHistory(event, { jobId, placeId, chatType }) {
  try {
    logger.info('Load history requested', { chatType });

    // Get auth token
    const token = tokenManager.getValidToken();
    if (!token) {
      return { success: false, error: 'No valid auth token', messages: [] };
    }

    // Fetch from backend server
    const response = await axios.get(`${BACKEND_URL}/api/chat/history`, {
      params: { jobId, placeId, chatType, limit: 50 },
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      timeout: 10000
    });

    logger.info('History loaded successfully', {
      chatType,
      messageCount: response.data.messages?.length || 0
    });

    return {
      success: true,
      messages: response.data.messages || []
    };
  } catch (error) {
    logger.error('Failed to load history', sanitizeError({
      error: error.message,
      chatType,
      backendUrl: BACKEND_URL
    }));
    return {
      success: false,
      error: error.response?.data?.error || 'Failed to load history',
      messages: []
    };
  }
}

// REMOVED GAME BROWSER FEATURE
// handleGetGames() function removed - violates RoChat's overlay-only design

// ==================== WINDOW CONTROL HANDLERS ====================

/**
 * Handle window minimize - minimize to small tab
 */
function handleMinimize(event) {
  if (mainWindow) {
    const bounds = mainWindow.getBounds();

    // Store original bounds and resizable state
    if (!mainWindow.originalBounds) {
      mainWindow.originalBounds = { ...bounds };
      mainWindow.isMinimizedTab = false;
    }

    // Toggle between minimized tab and normal
    if (mainWindow.isMinimizedTab) {
      // Get current position (in case tab was moved)
      const currentBounds = mainWindow.getBounds();

      // Restore to original size but at current position
      mainWindow.setResizable(true);
      mainWindow.setBounds({
        width: mainWindow.originalBounds.width,
        height: mainWindow.originalBounds.height,
        x: currentBounds.x,
        y: currentBounds.y
      }, true);
      mainWindow.setMinimumSize(320, 450);
      mainWindow.setMaximumSize(800, 1200);
      mainWindow.isMinimizedTab = false;

      // Remove move listener
      if (mainWindow.moveListener) {
        mainWindow.removeListener('move', mainWindow.moveListener);
        mainWindow.moveListener = null;
      }
    } else {
      // Save current bounds before minimizing
      mainWindow.originalBounds = { ...bounds };

      // Minimize to small tab - keep width, only change height
      mainWindow.setResizable(false);
      mainWindow.setMinimumSize(bounds.width, 55);
      mainWindow.setMaximumSize(bounds.width, 55);
      mainWindow.setBounds({
        width: bounds.width,
        height: 55,
        x: bounds.x,
        y: bounds.y
      }, true);
      mainWindow.isMinimizedTab = true;

      // Track position changes while minimized
      mainWindow.moveListener = () => {
        // Position is automatically tracked by Electron
        // No action needed - we'll get current position on restore
      };
      mainWindow.on('move', mainWindow.moveListener);
    }
  }
  return { success: true, isMinimized: mainWindow?.isMinimizedTab || false };
}

/**
 * Handle window maximize/restore
 */
function handleMaximize(event) {
  if (mainWindow) {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
  }
  return { success: true };
}

/**
 * Handle window close
 */
function handleClose(event) {
  if (mainWindow) {
    mainWindow.close();
  }
  return { success: true };
}

/**
 * Handle set always on top
 * Only applies if user is authenticated
 */
function handleSetAlwaysOnTop(event, flag) {
  if (mainWindow) {
    // Only allow always-on-top if user is authenticated
    const isAuth = secureStore.isAuthenticated();
    if (isAuth) {
      // Use 'screen-saver' level for more forceful always-on-top on Windows
      mainWindow.setAlwaysOnTop(flag, 'screen-saver');
      logger.info('Always-on-top set to', flag);
    } else {
      // For login screen, always keep it false
      mainWindow.setAlwaysOnTop(false);
      logger.info('Always-on-top disabled (not authenticated)');
    }
  }
  return { success: true };
}

/**
 * Handle set opacity
 */
function handleSetOpacity(event, opacity) {
  if (mainWindow) {
    mainWindow.setOpacity(opacity);
  }
  return { success: true };
}

/**
 * Handle open settings window
 */
function handleOpenSettings(event) {
  const { BrowserWindow } = require('electron');
  const path = require('path');

  // If settings window already exists, focus it
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.focus();
    return { success: true };
  }

  // Create new settings window
  settingsWindow = new BrowserWindow({
    width: 500,
    height: 600,
    resizable: false,
    frame: false,
    backgroundColor: '#0a0c14',
    parent: mainWindow,
    modal: false,
    show: false, // Don't show until positioned
    webPreferences: {
      preload: path.join(__dirname, '../../preload/preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true
    }
  });

  settingsWindow.loadFile(path.join(__dirname, '../../renderer/views/settings.html'));

  // Position window slightly to the left of center once ready to show
  settingsWindow.once('ready-to-show', () => {
    const { screen } = require('electron');
    const primaryDisplay = screen.getPrimaryDisplay();
    const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize;

    const windowBounds = settingsWindow.getBounds();

    // Calculate center position
    const x = Math.floor((screenWidth - windowBounds.width) / 2);
    const y = Math.floor((screenHeight - windowBounds.height) / 2);

    // Offset to the left by 150 pixels
    settingsWindow.setPosition(x - 150, y);
    settingsWindow.show();
  });

  settingsWindow.on('closed', () => {
    settingsWindow = null;
  });

  return { success: true };
}

/**
 * Handle reset window positions
 */
function handleResetPosition(event) {
  // Reset main window
  if (mainWindow) {
    mainWindow.setBounds({
      width: 380,
      height: 600,
      x: undefined,
      y: undefined
    });
    mainWindow.center();
    mainWindow.originalBounds = null;
    mainWindow.isMinimizedTab = false;
  }

  // Reset settings window
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.center();
  }

  return { success: true };
}

/**
 * Handle apply theme - sends theme to main window
 */
function handleApplyTheme(event, theme) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('theme:changed', theme);
  }
  return { success: true };
}

/**
 * Handle register keybind
 */
function handleRegisterKeybind(event, keybind) {
  const { globalShortcut } = require('electron');

  // Unregister previous shortcut
  globalShortcut.unregisterAll();

  if (keybind) {
    try {
      globalShortcut.register(keybind, () => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('keybind:focus-chat');
        }
      });
      logger.info('Keybind registered', { keybind });
    } catch (error) {
      logger.error('Failed to register keybind', { error: error.message });
    }
  }

  return { success: true };
}

/**
 * Handle message opacity setting
 */
function handleSetMessageOpacity(event, opacity) {
  // Forward to main window
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('settings:messageOpacityChanged', opacity);
  }
}

/**
 * Handle auto-hide header setting
 * Forward setting to main window via IPC
 */
function handleSetAutoHideHeader(event, enabled) {
  // Forward to main window using IPC event system
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('settings:autoHideHeaderChanged', enabled);
    logger.info('Auto-hide header setting applied', { enabled });
  }
  return { success: true };
}

/**
 * Handle auto-hide footer setting
 * CSS FIX: Forward setting to main window via IPC per Electron IPC documentation
 */
function handleSetAutoHideFooter(event, enabled) {
  // Forward to main window using IPC event system
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('settings:autoHideFooterChanged', enabled);
    logger.info('Auto-hide footer setting applied', { enabled });
  }
  return { success: true };
}

/**
 * Handle emit typing indicator request
 */
async function handleEmitTyping(event, { jobId, username, isTyping }) {
  try {
    socketClient.emitTyping(jobId, username, isTyping);
    return { success: true };
  } catch (error) {
    logger.error('Failed to emit typing', sanitizeError({ error: error.message }));
    return { success: false, error: error.message };
  }
}

/**
 * Handle edit message request
 */
async function handleEditMessage(event, { messageId, newContent }) {
  try {
    const user = robloxAuth.getCurrentUser();
    if (!user) {
      return { success: false, error: 'Not authenticated' };
    }

    socketClient.emitEditMessage(messageId, user.userId, newContent);
    return { success: true };
  } catch (error) {
    logger.error('Failed to emit edit message', sanitizeError({ error: error.message }));
    return { success: false, error: error.message };
  }
}

/**
 * Handle delete message request
 */
async function handleDeleteMessage(event, { messageId }) {
  try {
    const user = robloxAuth.getCurrentUser();
    if (!user) {
      return { success: false, error: 'Not authenticated' };
    }

    socketClient.emitDeleteMessage(messageId, user.userId);
    return { success: true };
  } catch (error) {
    logger.error('Failed to emit delete message', sanitizeError({ error: error.message }));
    return { success: false, error: error.message };
  }
}

// ==================== SHELL HANDLERS ====================

/**
 * Handle opening external URL
 */
async function handleOpenExternal(event, url) {
  try {
    logger.info('Opening external URL');
    await shell.openExternal(url);
    return { success: true };
  } catch (error) {
    logger.error('Failed to open external URL', sanitizeError({ error: error.message }));
    return { success: false, error: error.message };
  }
}

module.exports = {
  setMainWindow,
  registerHandlers,
  setupDetectorEvents,
  setupSocketEvents
};
