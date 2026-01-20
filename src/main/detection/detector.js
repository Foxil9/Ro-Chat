const { EventEmitter } = require('events');
const processWatcher = require('./processWatcher');
const logMonitor = require('./logMonitor');
const memoryReader = require('./memoryReader');
const logger = require('../logging/logger');

class Detector extends EventEmitter {
  constructor() {
    super();
    this.currentServer = null; // { placeId, jobId, timestamp }
    this.lastLogUpdate = null;
    this.memoryFallbackTimeout = null;
    this.isRunning = false;
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

    // Stop all watchers
    processWatcher.stopWatching();
    logMonitor.stopMonitoring();

    // Clear any pending timeouts
    if (this.memoryFallbackTimeout) {
      clearTimeout(this.memoryFallbackTimeout);
      this.memoryFallbackTimeout = null;
    }
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

    // Set up memory fallback timeout (10 seconds)
    // If no log update within 10 seconds, try memory reading
    this.memoryFallbackTimeout = setTimeout(() => {
      this.tryMemoryFallback();
    }, 10000);

    // Emit server changed with null
    this.emit('serverChanged', null);
  }

  /**
   * Handle Roblox process stopped
   */
  handleProcessStopped() {
    // Stop log monitoring
    logMonitor.stopMonitoring();

    // Clear memory fallback timeout
    if (this.memoryFallbackTimeout) {
      clearTimeout(this.memoryFallbackTimeout);
      this.memoryFallbackTimeout = null;
    }

    // Clear current server if set
    const previousServer = this.currentServer;
    this.currentServer = null;
    this.lastLogUpdate = null;

    // Emit server changed with null
    if (previousServer) {
      this.emit('serverChanged', null);
    }
  }

  /**
   * Handle server detected from logs
   */
  handleServerDetected(serverInfo, source) {
    // Clear memory fallback timeout
    if (this.memoryFallbackTimeout) {
      clearTimeout(this.memoryFallbackTimeout);
      this.memoryFallbackTimeout = null;
    }

    // Update last log update time
    if (source === 'log') {
      this.lastLogUpdate = Date.now();
    }

    // Check if server changed
    if (!this.currentServer || 
        this.currentServer.placeId !== serverInfo.placeId || 
        this.currentServer.jobId !== serverInfo.jobId) {
      
      logger.info('Server changed', { 
        placeId: serverInfo.placeId, 
        jobId: serverInfo.jobId,
        source 
      });
      
      this.currentServer = serverInfo;
      this.emit('serverChanged', serverInfo);
    }
  }

  /**
   * Try memory reading as fallback
   */
  async tryMemoryFallback() {
    logger.info('Log timeout reached, trying memory fallback');

    try {
      const serverInfo = await memoryReader.readServerFromMemory();

      if (serverInfo && serverInfo.placeId && serverInfo.jobId) {
        // Compare with log monitor results if available
        const logServer = logMonitor.getCurrentServer();
        
        if (logServer) {
          if (logServer.placeId === serverInfo.placeId && logServer.jobId === serverInfo.jobId) {
            // Results match, use log result
            logger.info('Memory and log results match, using log result');
            this.handleServerDetected(logServer, 'log');
          } else {
            // Results differ, prefer log, log warning
            logger.warn('Memory and log results differ', {
              log: logServer,
              memory: serverInfo
            });
            this.handleServerDetected(logServer, 'log');
          }
        } else {
          // No log data, use memory result
          logger.info('No log data, using memory result');
          this.handleServerDetected(serverInfo, 'memory');
        }
      } else {
        logger.warn('Memory reading failed to find server');
      }
    } catch (error) {
      logger.error('Memory fallback failed', { error: error.message });
    }
  }

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
