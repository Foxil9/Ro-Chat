const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const { app, BrowserWindow } = require('electron');
const logger = require('./logging/logger');
const { registerHandlers, setMainWindow, setupDetectorEvents, setupSocketEvents } = require('./ipc/handlers');
const detector = require('./detection/detector');
const secureStore = require('./storage/secureStore');
const { setupAutoUpdater } = require('./updater');
const socketClient = require('./socket/socketClient');

let mainWindow;

// Configure app-wide command line switches before app is ready
// These help with SSL/TLS connections and CORS
app.commandLine.appendSwitch('disable-features', 'OutOfBlinkCors');

// Disable hardware acceleration if SSL issues persist
// Uncomment the line below if you continue to experience SSL errors
// app.disableHardwareAcceleration();

/**
 * Create main browser window
 */
function createWindow() {
  logger.info('Creating main window');

  // Get screen dimensions for dynamic max size
  const { screen } = require('electron');
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize;
  const maxWidth = Math.floor(screenWidth * 0.9);
  const maxHeight = Math.floor(screenHeight * 0.9);

  mainWindow = new BrowserWindow({
    width: 380,
    height: 600,
    minWidth: 320,
    minHeight: 450,
    maxWidth: maxWidth,
    maxHeight: maxHeight,
    show: false,
    frame: false,
    transparent: false,
    alwaysOnTop: false, // Start disabled, enable after login
    resizable: true,
    backgroundColor: '#0a0c14',
    roundedCorners: true,
    center: true,
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
    // Ensure window is centered on startup
    mainWindow.center();
    mainWindow.show();
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
  // MongoDB is required for server
  // The client doesn't need DB_URL, but server does
  if (process.env.NODE_ENV !== 'production') {
    logger.info('Running in development mode');
  }
}

/**
 * Initialize application
 */
app.whenReady().then(() => {
  // Validate environment variables
  validateEnvironment();
  logger.info('App started');

  // Handle certificate errors globally (for development/debugging)
  app.on('certificate-error', (event, webContents, url, error, certificate, callback) => {
    // Log the certificate error
    logger.warn('Global certificate error', { url, error });

    // For development, we'll allow self-signed certificates for localhost
    if (url.startsWith('https://localhost') || url.startsWith('https://127.0.0.1')) {
      event.preventDefault();
      callback(true);
    } else {
      // For production sites like Roblox, use default behavior
      // This will be handled by the BrowserWindow-specific handler
      callback(false);
    }
  });

  // Register IPC handlers
  registerHandlers();

  // Setup detector events forwarding
  setupDetectorEvents();

  // Setup socket events forwarding callback (will be called when socket connects)
  socketClient.setOnConnectedCallback(setupSocketEvents);

  // Create main window
  createWindow();

  // Setup auto-updater
  setupAutoUpdater(mainWindow);

  // Check if user is authenticated
  const checkAuthAndStart = async () => {
    try {
      // Try to get a valid access token (this will auto-refresh if needed)
      const auth = secureStore.getAuth();
      if (auth && auth.refreshToken) {
        logger.info('Attempting to restore session with refresh token');
        try {
          const robloxAuth = require('./auth/robloxAuth');
          await robloxAuth.getAccessToken(); // This will refresh if expired
          logger.info('Session restored successfully, starting detector');

          // Enable always-on-top for authenticated users with screen-saver level
          if (mainWindow) {
            mainWindow.setAlwaysOnTop(true, 'screen-saver');
          }
          detector.start();
          return;
        } catch (refreshError) {
          logger.warn('Failed to refresh token on startup', { error: refreshError.message });
          secureStore.clearAuth();
        }
      } else if (secureStore.isAuthenticated()) {
        logger.info('User is authenticated, starting detector');
        // Enable always-on-top for authenticated users with screen-saver level
        if (mainWindow) {
          mainWindow.setAlwaysOnTop(true, 'screen-saver');
        }
        detector.start();
        return;
      }

      logger.info('User not authenticated, showing login view');
    } catch (error) {
      logger.error('Error checking authentication', { error: error.message });
      logger.info('Showing login view due to error');
    }
  };

  checkAuthAndStart();

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
