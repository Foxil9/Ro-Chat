const { EventEmitter } = require('events');
const processWatcher = require('./processWatcher');
const logMonitor = require('./logMonitor');
// REMOVED UNSAFE MEMORY READER
const logger = require('../logging/logger');
const socketClient = require('../socket/socketClient');
const { sanitizeError } = require('../utils/sanitizer');

class Detector extends EventEmitter {
  constructor() {
    super();
    this.currentServer = null; // { placeId, jobId, timestamp }
    this.lastLogUpdate = null;
    // REMOVED UNSAFE MEMORY READER
    this.isRunning = false;
    this.lastStateChangeTime = 0;
  }

  /**
   * Start the detector
   * Watches for Roblox process and monitors logs
   */
  start() {
    if (this.isRunning) {
      logger.warn('Detector already running');
      return;
    }

    logger.info('Starting detector');
    this.isRunning = true;

    // Connect to Socket.io server
    socketClient.connect();

    // Start process watcher
    processWatcher.startWatching();

    // Listen for process events
    processWatcher.on('processStarted', () => {
      logger.info('Roblox process started, starting log monitor');
      this.handleProcessStarted();
    });

    processWatcher.on('processStopped', () => {
      logger.info('Roblox process stopped');
      this.handleProcessStopped();
    });

    // Listen for log monitor events
    logMonitor.on('serverDetected', (serverInfo) => {
      this.handleServerDetected(serverInfo, 'log');
    });

    // Listen for disconnect events from logs
    logMonitor.on('disconnected', () => {
      this.handleDisconnected();
    });
  }

  /**
   * Stop the detector
   */
  stop() {
    if (!this.isRunning) {
      logger.warn('Detector not running');
      return;
    }

    logger.info('Stopping detector');
    this.isRunning = false;

    // Disconnect from Socket.io server
    socketClient.disconnect();

    processWatcher.removeAllListeners('processStarted');
    processWatcher.removeAllListeners('processStopped');
    logMonitor.removeAllListeners('serverDetected');
    logMonitor.removeAllListeners('disconnected');

    // Stop all watchers
    processWatcher.stopWatching();
    logMonitor.stopMonitoring();

    // REMOVED UNSAFE MEMORY READER
  }

  /**
   * Handle Roblox process started
   */
  handleProcessStarted() {
    // Clear current server
    this.currentServer = null;
    this.lastLogUpdate = Date.now();

    // Start log monitoring
    logMonitor.startMonitoring();

    // REMOVED UNSAFE MEMORY READER - Rely 100% on logs

    // Emit server changed with null
    this.emit('serverChanged', null);
  }

  /**
   * Handle Roblox process stopped
   */
  handleProcessStopped() {
    // Stop log monitoring
    logMonitor.stopMonitoring();

    // REMOVED UNSAFE MEMORY READER

    // Clear current server if set
    const previousServer = this.currentServer;
    this.currentServer = null;
    this.lastLogUpdate = null;

    // Leave all Socket.io rooms
    socketClient.leaveAllRooms();

    // Emit server changed with null
    if (previousServer) {
      this.emit('serverChanged', null);
    }
  }

  /**
   * Handle disconnect detected from logs
   */
  handleDisconnected() {
    if (!this.currentServer) {
      return; // Not in a server, nothing to disconnect from
    }

    logger.info('User disconnected from game');
    const previousServer = this.currentServer;
    this.currentServer = null;
    this.lastLogUpdate = null;

    // Leave all Socket.io rooms
    socketClient.leaveAllRooms();

    this.emit('serverChanged', null);
  }

  /**
   * Handle server detected from logs
   */
  handleServerDetected(serverInfo, source) {
    // REMOVED UNSAFE MEMORY READER

    // Update last log update time
    if (source === 'log') {
      this.lastLogUpdate = Date.now();
    }

    // Check if server changed
    if (!this.currentServer ||
        this.currentServer.placeId !== serverInfo.placeId ||
        this.currentServer.jobId !== serverInfo.jobId) {

      const now = Date.now();
      const timeSinceLastChange = now - this.lastStateChangeTime;
      if (timeSinceLastChange < 2000) {
        logger.debug('Server change debounced, too soon since last change');
        return;
      }
      this.lastStateChangeTime = now;

      logger.info('Server changed', { source });

      this.currentServer = serverInfo;

      // Join Socket.io rooms for this server
      try {
        socketClient.joinRoom(serverInfo.jobId, serverInfo.placeId);
      } catch (error) {
        logger.error('Failed to join socket room', sanitizeError({ error: error.message }));
      }

      this.emit('serverChanged', serverInfo);
    }
  }

  // REMOVED UNSAFE MEMORY READER - tryMemoryFallback() deleted

  /**
   * Get current server information
   */
  getCurrentServer() {
    return this.currentServer;
  }

  /**
   * Check if detector is running
   */
  isActive() {
    return this.isRunning;
  }
}

// Export singleton instance
module.exports = new Detector();
