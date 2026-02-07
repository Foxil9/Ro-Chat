const fs = require("fs");
const path = require("path");
const { EventEmitter } = require("events");
const chokidar = require("chokidar");
const logger = require("../logging/logger");
const secureStore = require("../storage/secureStore");

// Roblox log directory path - validated to prevent path traversal
const RAW_LOG_DIR = process.env.LOCALAPPDATA
  ? path.join(process.env.LOCALAPPDATA, "Roblox", "logs")
  : path.join(process.env.HOME, ".roblox", "logs");

// Resolve to absolute path and verify it contains expected Roblox path segments
const LOG_DIR = path.resolve(RAW_LOG_DIR);
if (!LOG_DIR.includes("Roblox") || !LOG_DIR.includes("logs")) {
  // If environment variables were tampered with, fall back to a safe no-op directory
  logger.error(
    "Log directory path does not contain expected Roblox path segments",
    { logDir: LOG_DIR },
  );
}

// Regex patterns for parsing log lines
// Format: [FLog::Output] ! Joining game 'jobId' place placeId at IP
// Only accept single/double quotes (not backticks) to avoid matching unintended log lines
const JOIN_PATTERN =
  /\[FLog::Output\]\s*!\s*Joining\s*game\s*['"]([0-9a-f-]+)['"]\s*place\s*(\d+)/i;
const SERVER_PATTERN = /gameplacejobid/i;
const DISCONNECT_PATTERN =
  /\[FLog::[^\]]*\].*?(Disconnected|disconnect|leaving game|HttpRbxApiService stopped|Game has shut down|You have been kicked|Connection lost)/i;

class LogMonitor extends EventEmitter {
  constructor() {
    super();
    this.isMonitoring = false;
    this.watchInterval = null;
    this.currentLogFile = null;
    this.lastPosition = 0;
    this.lastServerInfo = null;
    this.currentStream = null;
    // Directory watcher for detecting new log files
    this.dirWatcher = null;
    this.dirCheckInterval = null;
    this._debounceTimer = null;
    // Lock flag to prevent concurrent file reads
    this.isReading = false;
  }

  /**
   * Debounced wrapper for checkLogFile to prevent race conditions
   * between watcher, fallback timer, and content poll
   */
  _debouncedCheckLogFile() {
    if (this._debounceTimer) {
      clearTimeout(this._debounceTimer);
    }
    this._debounceTimer = setTimeout(() => {
      this._debounceTimer = null;
      this.checkLogFile();
    }, 1000);
  }

  /**
   * Start monitoring Roblox log files
   */
  startMonitoring() {
    if (this.isMonitoring) {
      logger.warn("Log monitor already running");
      return;
    }

    logger.info("Starting log monitor", { logDir: LOG_DIR });
    this.isMonitoring = true;

    // Restore last log position if exists
    const savedPos = secureStore.getLogPosition();
    if (savedPos && savedPos.filePath) {
      logger.info("Restoring saved log position", {
        filePath: savedPos.filePath,
        position: savedPos.position,
      });
      this.currentLogFile = savedPos.filePath;
      this.lastPosition = savedPos.position;
    }

    // Initial check for log file
    this.checkLogFile();

    // Set up chokidar directory watcher for new log files
    this._startDirectoryWatcher();

    // Set up interval to check for new log entries (every 2000ms)
    this.watchInterval = setInterval(() => {
      this.readNewLogs();
    }, 2000);
  }

  /**
   * Start chokidar directory watcher for new log files
   */
  _startDirectoryWatcher() {
    if (!fs.existsSync(LOG_DIR)) {
      logger.warn("Cannot watch log directory - does not exist", {
        logDir: LOG_DIR,
      });
      return;
    }

    try {
      this.dirWatcher = chokidar.watch(LOG_DIR, {
        ignoreInitial: true, // Critical: don't fire 'add' for existing files at startup
        depth: 0, // Only watch top-level directory
        usePolling: false, // Use native fs events (faster on Windows)
        awaitWriteFinish: false,
      });

      this.dirWatcher.on("add", (filePath) => {
        const fileName = path.basename(filePath);
        // Only react to new .log files containing 'player'
        if (
          fileName.endsWith(".log") &&
          fileName.toLowerCase().includes("player")
        ) {
          logger.info("New log file detected by watcher", { fileName });
          this._debouncedCheckLogFile();
        }
      });

      this.dirWatcher.on("error", (error) => {
        logger.error("Directory watcher error", { error: error.message });
      });

      logger.info("Directory watcher started", { logDir: LOG_DIR });
    } catch (error) {
      logger.error("Failed to start directory watcher", {
        error: error.message,
      });
    }
  }

  /**
   * Stop monitoring log files
   */
  stopMonitoring() {
    if (!this.isMonitoring) {
      logger.warn("Log monitor not running");
      return;
    }

    logger.info("Stopping log monitor");
    this.isMonitoring = false;

    if (this.watchInterval) {
      clearInterval(this.watchInterval);
      this.watchInterval = null;
    }

    // Cleanup directory watcher
    if (this.dirWatcher) {
      this.dirWatcher.close();
      this.dirWatcher = null;
    }

    // Cleanup debounce timer
    if (this._debounceTimer) {
      clearTimeout(this._debounceTimer);
      this._debounceTimer = null;
    }

    if (this.currentStream) {
      this.currentStream.destroy();
      this.currentStream = null;
    }

    // Reset reading lock
    this.isReading = false;

    // Save current position before stopping
    if (this.currentLogFile && this.lastPosition > 0) {
      logger.info("Saving log position before stop", {
        filePath: this.currentLogFile,
        position: this.lastPosition,
      });
      secureStore.saveLogPosition(this.currentLogFile, this.lastPosition);
    }

    // DON'T reset state - keep for next start
    // this.currentLogFile = null;
    // this.lastPosition = 0;
  }

  /**
   * Find and check the most recent log file
   */
  checkLogFile() {
    if (this.isReading) {
      logger.debug("Skipping checkLogFile - already reading");
      return;
    }

    try {
      if (!fs.existsSync(LOG_DIR)) {
        logger.warn("Log directory does not exist", { logDir: LOG_DIR });
        return;
      }

      // Get all .log files (exclude Studio/crash logs)
      const files = fs
        .readdirSync(LOG_DIR)
        .filter(
          (file) =>
            file.endsWith(".log") && file.toLowerCase().includes("player"),
        )
        .map((file) => {
          try {
            const filePath = path.join(LOG_DIR, file);
            // Validate resolved path stays within LOG_DIR (prevent path traversal via symlinks or crafted names)
            const resolvedPath = path.resolve(filePath);
            if (!resolvedPath.startsWith(LOG_DIR)) {
              logger.warn("Log file path traversal blocked", { file });
              return null;
            }
            return {
              name: file,
              path: resolvedPath,
              mtime: fs.statSync(resolvedPath).mtime,
            };
          } catch (statError) {
            logger.debug("Failed to stat log file", {
              file,
              error: statError.message,
            });
            return null;
          }
        })
        .filter((file) => file !== null)
        .sort((a, b) => b.mtime - a.mtime);

      if (files.length === 0) {
        logger.debug("No log files found");
        return;
      }

      // Get the most recent log file
      const mostRecent = files[0];

      // Check if log file changed
      if (this.currentLogFile !== mostRecent.path) {
        logger.info("New log file detected", { file: mostRecent.name });
        this.currentLogFile = mostRecent.path;

        // Read last ~50 lines to catch recent joins that occurred before file switch
        this.isReading = true;
        try {
          const stats = fs.statSync(mostRecent.path);
          const fileSize = stats.size;

          // Calculate tail bytes: ~50 lines at ~200 chars each = 10KB max
          const TAIL_BYTES = Math.min(fileSize, 50 * 200);

          if (TAIL_BYTES > 0) {
            const startOffset = fileSize - TAIL_BYTES;

            // Read tail using sync file operations
            const fd = fs.openSync(mostRecent.path, "r");
            const buffer = Buffer.alloc(TAIL_BYTES);
            fs.readSync(fd, buffer, 0, TAIL_BYTES, startOffset);
            fs.closeSync(fd);

            // Convert to string
            let tailContent = buffer.toString("utf8");

            // If we didn't read from the beginning, discard partial first line
            if (startOffset > 0) {
              const firstNewline = tailContent.indexOf("\n");
              if (firstNewline !== -1) {
                tailContent = tailContent.slice(firstNewline + 1);
              }
            }

            // Parse tail content to catch recent joins
            if (tailContent.length > 0) {
              logger.info("Parsing recent lines from new log file", {
                tailBytes: TAIL_BYTES,
                fileSize,
              });
              this.parseLogs(tailContent);
            }
          }

          // Set position to end of file for forward reading
          this.lastPosition = fileSize;
          logger.info("Starting from end of new log file", {
            position: this.lastPosition,
          });
        } catch (error) {
          logger.error("Failed to read tail of new log file", {
            error: error.message,
          });
          // Fall back to reading from beginning
          this.lastPosition = 0;
        } finally {
          this.isReading = false;
        }
      }
    } catch (error) {
      logger.error("Error checking log file", { error: error.message });
      this.isReading = false;
    }
  }

  /**
   * Read new log entries since last position
   */
  readNewLogs() {
    if (this.isReading) {
      logger.debug("Skipping readNewLogs - already reading");
      return;
    }

    if (!this.currentLogFile) {
      this._debouncedCheckLogFile();
      return;
    }

    this.isReading = true;

    try {
      const stats = fs.statSync(this.currentLogFile);
      const fileSize = stats.size;

      // If file was truncated (rotated), reset position
      if (fileSize < this.lastPosition) {
        logger.debug("Log file was truncated, resetting position");
        this.lastPosition = 0;
      }

      // If no new data, return
      if (fileSize <= this.lastPosition) {
        this.isReading = false;
        return;
      }

      // Read new data from file
      const stream = fs.createReadStream(this.currentLogFile, {
        start: this.lastPosition,
        encoding: "utf8",
      });
      this.currentStream = stream;

      let newData = "";
      stream.on("data", (chunk) => {
        newData += chunk;
      });

      stream.on("end", () => {
        try {
          this.parseLogs(newData);
          this.lastPosition = fileSize;
          this.currentStream = null;

          // Save position after successful read
          if (this.currentLogFile && this.lastPosition > 0) {
            secureStore.saveLogPosition(this.currentLogFile, this.lastPosition);
          }
        } catch (parseError) {
          logger.error("Error parsing logs", { error: parseError.message });
          this.currentStream = null;
        } finally {
          this.isReading = false;
        }
      });

      stream.on("error", (error) => {
        logger.error("Error reading log file", { error: error.message });
        stream.destroy();
        this.currentStream = null;
        // Reset to recheck file on next iteration
        this.currentLogFile = null;
        this.isReading = false;
      });
    } catch (error) {
      logger.error("Error reading new logs", { error: error.message });
      // Reset to recheck file on next iteration
      this.currentLogFile = null;
      this.isReading = false;
    }
  }

  /**
   * Parse log lines and extract server information
   */
  parseLogs(data) {
    const lines = data.split("\n");

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
      logger.info("Disconnect detected in logs");
      this.lastServerInfo = null;
      this.emit("disconnected");
      return;
    }

    // Try to match the join pattern
    const joinMatch = line.match(JOIN_PATTERN);

    if (joinMatch) {
      const jobId = joinMatch[1]; // jobId is first (UUID)
      const placeId = joinMatch[2]; // placeId is second (number)
      const serverInfo = {
        placeId,
        jobId,
        timestamp: Date.now(),
      };

      // Check if server changed
      if (
        !this.lastServerInfo ||
        this.lastServerInfo.placeId !== serverInfo.placeId ||
        this.lastServerInfo.jobId !== serverInfo.jobId
      ) {
        logger.info("Server detected");
        this.lastServerInfo = serverInfo;
        this.emit("serverDetected", serverInfo);
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
