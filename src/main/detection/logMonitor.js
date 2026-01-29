const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');
const logger = require('../logging/logger');

// Roblox log directory path
const LOG_DIR = process.env.LOCALAPPDATA 
  ? path.join(process.env.LOCALAPPDATA, 'Roblox', 'logs')
  : path.join(process.env.HOME, '.roblox', 'logs');

// Regex patterns for parsing log lines
// Format: [FLog::Output] ! Joining game 'jobId' place placeId at IP
const JOIN_PATTERN = /\[FLog::Output\]\s*!\s*Joining\s*game\s*['"`]([0-9a-f-]+)['"`]\s*place\s*(\d+)/i;
const SERVER_PATTERN = /gameplacejobid/i;
const DISCONNECT_PATTERN = /\[FLog::[^\]]*\].*?(Disconnected|disconnect|leaving game|HttpRbxApiService stopped|Game has shut down|You have been kicked|Connection lost)/i;

class LogMonitor extends EventEmitter {
  constructor() {
    super();
    this.isMonitoring = false;
    this.watchInterval = null;
    this.currentLogFile = null;
    this.lastPosition = 0;
    this.lastServerInfo = null;
    this.currentStream = null;
  }

  /**
   * Start monitoring Roblox log files
   */
  startMonitoring() {
    if (this.isMonitoring) {
      logger.warn('Log monitor already running');
      return;
    }

    logger.info('Starting log monitor', { logDir: LOG_DIR });
    this.isMonitoring = true;

    // Initial check for log file
    this.checkLogFile();

    // Set up interval to check for new log entries (every 5000ms)
    this.watchInterval = setInterval(() => {
      this.readNewLogs();
    }, 5000);
  }

  /**
   * Stop monitoring log files
   */
  stopMonitoring() {
    if (!this.isMonitoring) {
      logger.warn('Log monitor not running');
      return;
    }

    logger.info('Stopping log monitor');
    this.isMonitoring = false;

    if (this.watchInterval) {
      clearInterval(this.watchInterval);
      this.watchInterval = null;
    }

    if (this.currentStream) {
      this.currentStream.destroy();
      this.currentStream = null;
    }

    // Reset state
    this.currentLogFile = null;
    this.lastPosition = 0;
  }

  /**
   * Find and check the most recent log file
   */
  checkLogFile() {
    try {
      if (!fs.existsSync(LOG_DIR)) {
        logger.warn('Log directory does not exist', { logDir: LOG_DIR });
        return;
      }

      // Get all .log files (exclude Studio/crash logs)
      const files = fs.readdirSync(LOG_DIR)
        .filter(file => file.endsWith('.log') && file.toLowerCase().includes('player'))
        .map(file => {
          try {
            return {
              name: file,
              path: path.join(LOG_DIR, file),
              mtime: fs.statSync(path.join(LOG_DIR, file)).mtime
            };
          } catch (statError) {
            logger.debug('Failed to stat log file', { file, error: statError.message });
            return null;
          }
        })
        .filter(file => file !== null)
        .sort((a, b) => b.mtime - a.mtime);

      if (files.length === 0) {
        logger.debug('No log files found');
        return;
      }

      // Get the most recent log file
      const mostRecent = files[0];

      // Check if log file changed
      if (this.currentLogFile !== mostRecent.path) {
        logger.info('New log file detected', { file: mostRecent.name });
        this.currentLogFile = mostRecent.path;
        this.lastPosition = 0; // Reset position for new file
      }
    } catch (error) {
      logger.error('Error checking log file', { error: error.message });
    }
  }

  /**
   * Read new log entries since last position
   */
  readNewLogs() {
    if (!this.currentLogFile) {
      this.checkLogFile();
      return;
    }

    try {
      const stats = fs.statSync(this.currentLogFile);
      const fileSize = stats.size;

      // If file was truncated (rotated), reset position
      if (fileSize < this.lastPosition) {
        logger.debug('Log file was truncated, resetting position');
        this.lastPosition = 0;
      }

      // If no new data, return
      if (fileSize <= this.lastPosition) {
        return;
      }

      // Read new data from file
      const stream = fs.createReadStream(this.currentLogFile, {
        start: this.lastPosition,
        encoding: 'utf8'
      });
      this.currentStream = stream;

      let newData = '';
      stream.on('data', (chunk) => {
        newData += chunk;
      });

      stream.on('end', () => {
        try {
          this.parseLogs(newData);
          this.lastPosition = fileSize;
          this.currentStream = null;
        } catch (parseError) {
          logger.error('Error parsing logs', { error: parseError.message });
          this.currentStream = null;
        }
      });

      stream.on('error', (error) => {
        logger.error('Error reading log file', { error: error.message });
        stream.destroy();
        this.currentStream = null;
        // Reset to recheck file on next iteration
        this.currentLogFile = null;
      });
    } catch (error) {
      logger.error('Error reading new logs', { error: error.message });
      // Reset to recheck file on next iteration
      this.currentLogFile = null;
    }
  }

  /**
   * Parse log lines and extract server information
   */
  parseLogs(data) {
    const lines = data.split('\n');

    for (const line of lines) {
      this.parseLine(line);
    }
  }

  /**
   * Parse a single log line and emit events
   */
  parseLine(line) {
    // Check for disconnect patterns first
    const disconnectMatch = line.match(DISCONNECT_PATTERN);
    if (disconnectMatch) {
      logger.info('Disconnect detected in logs');
      this.lastServerInfo = null;
      this.emit('disconnected');
      return;
    }

    // Try to match the join pattern
    const joinMatch = line.match(JOIN_PATTERN);

    if (joinMatch) {
      const jobId = joinMatch[1];      // jobId is first (UUID)
      const placeId = joinMatch[2];    // placeId is second (number)
      const serverInfo = {
        placeId,
        jobId,
        timestamp: Date.now()
      };

      // Check if server changed
      if (!this.lastServerInfo ||
          this.lastServerInfo.placeId !== serverInfo.placeId ||
          this.lastServerInfo.jobId !== serverInfo.jobId) {

        logger.info('Server detected');
        this.lastServerInfo = serverInfo;
        this.emit('serverDetected', serverInfo);
      }
    }
  }

  /**
   * Get current server information
   */
  getCurrentServer() {
    return this.lastServerInfo;
  }
}

module.exports = new LogMonitor();
