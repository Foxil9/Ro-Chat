const { app, BrowserWindow } = require('electron');
const path = require('path');
const logger = require('./logging/logger');
const { registerHandlers, setMainWindow, setupDetectorEvents } = require('./ipc/handlers');
const detector = require('./detection/detector');
const secureStore = require('./storage/secureStore');
require('dotenv').config();

let mainWindow;

/**
 * Create main browser window
 */
function createWindow() {
  logger.info('Creating main window');

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true
    }
  });

  // Load renderer index.html
  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));

  // Show window when ready
  mainWindow.once('ready-to-show', () => {
    logger.info('Window ready to show');
    mainWindow.show();
    
    // Show DevTools in development
    if (process.env.NODE_ENV !== 'production') {
      mainWindow.webContents.openDevTools();
    }
  });

  // Handle window closed
  mainWindow.on('closed', () => {
    logger.info('Window closed');
    mainWindow = null;
  });

  // Handle navigation errors
  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
    logger.error('Failed to load page', { errorCode, errorDescription });
  });

  // Set window reference for IPC handlers
  setMainWindow(mainWindow);
}

/**
 * Validate environment variables
 */
function validateEnvironment() {
  const requiredEnvVars = [];
  
  // MongoDB is required for server
  // The client doesn't need DB_URL, but server does
  if (process.env.NODE_ENV !== 'production') {
    logger.info('Running in development mode');
  }
  
  // Warn if server URL not configured
  if (!process.env.SERVER_URL) {
    logger.warn('SERVER_URL not set, using default: http://localhost:3000');
  }
}

/**
 * Initialize application
 */
app.whenReady().then(() => {
  // Validate environment variables
  validateEnvironment();
  logger.info('App started');
  
  // Register IPC handlers
  registerHandlers();
  
  // Setup detector events forwarding
  setupDetectorEvents();
  
  // Create main window
  createWindow();
  
  // Check if user is authenticated
  if (secureStore.isAuthenticated()) {
    logger.info('User is authenticated, starting detector');
    detector.start();
  } else {
    logger.info('User not authenticated, showing login view');
  }
  
  // Handle macOS dock icon click
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

/**
 * Handle all windows closed
 */
app.on('window-all-closed', () => {
  logger.info('All windows closed');
  
  // On macOS, keep app running until explicitly quit
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

/**
 * Handle app quit
 */
app.on('before-quit', () => {
  logger.info('App quitting');
  
  // Stop detector
  if (detector.isActive()) {
    logger.info('Stopping detector');
    detector.stop();
  }
});

/**
 * Handle app will quit
 */
app.on('will-quit', (event) => {
  logger.info('App will quit');
});

/**
 * Handle uncaught exceptions
 */
process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception', { error: error.message, stack: error.stack });
});

/**
 * Handle unhandled promise rejections
 */
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled promise rejection', { reason });
});
