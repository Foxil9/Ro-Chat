const { ipcMain } = require('electron');
const robloxAuth = require('../auth/robloxAuth');
const tokenManager = require('../auth/tokenManager');
const detector = require('../detection/detector');
const secureStore = require('../storage/secureStore');
const logger = require('../logging/logger');

// Store reference to main window for sending events
let mainWindow = null;

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
    return { success: true, user: userInfo };
  } catch (error) {
    logger.error('Login failed', { error: error.message });
    return { success: false, error: error.message };
  }
}

/**
 * Handle logout request
 */
async function handleLogout(event) {
  try {
    logger.info('Logout requested');
    const result = tokenManager.logout();
    return { success: result };
  } catch (error) {
    logger.error('Logout failed', { error: error.message });
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
    logger.error('Failed to get auth status', { error: error.message });
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
    logger.error('Failed to get server', { error: error.message });
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
    logger.error('Failed to start detection', { error: error.message });
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
    logger.error('Failed to stop detection', { error: error.message });
    return { success: false, error: error.message };
  }
}

module.exports = {
  setMainWindow,
  registerHandlers,
  setupDetectorEvents
};
