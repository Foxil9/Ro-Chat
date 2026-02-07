const { EventEmitter } = require("events");
const { exec } = require("child_process");
const { promisify } = require("util");
const logger = require("../logging/logger");

const execAsync = promisify(exec);

// Process name to watch (Windows)
const ROBLOX_PROCESS = "RobloxPlayerBeta.exe";

class ProcessWatcher extends EventEmitter {
  constructor() {
    super();
    this.isWatching = false;
    this.checkInterval = null;
    this.wasRunning = false;
  }

  /**
   * Start watching for Roblox process
   * Checks every 2 seconds
   */
  startWatching() {
    if (this.isWatching) {
      logger.warn("Process watcher already running");
      return;
    }

    logger.info("Starting process watcher");
    this.isWatching = true;

    // Initial check
    this.checkProcess();

    // Set up interval to check every 2 seconds
    this.checkInterval = setInterval(() => {
      this.checkProcess();
    }, 2000);
  }

  /**
   * Stop watching for Roblox process
   */
  stopWatching() {
    if (!this.isWatching) {
      logger.warn("Process watcher not running");
      return;
    }

    logger.info("Stopping process watcher");
    this.isWatching = false;

    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  }

  /**
   * Check if Roblox is running and emit events on state change
   */
  async checkProcess() {
    try {
      const isRunning = await this.isRobloxRunning();

      // Emit events only when state changes
      if (isRunning && !this.wasRunning) {
        logger.info("Roblox process started");
        this.emit("processStarted");
      } else if (!isRunning && this.wasRunning) {
        logger.info("Roblox process stopped");
        this.emit("processStopped");
      }

      this.wasRunning = isRunning;
    } catch (error) {
      logger.error("Error checking Roblox process", { error: error.message });
    }
  }

  /**
   * Check if Roblox process is currently running
   */
  async isRobloxRunning() {
    try {
      const platform = process.platform;
      let command;

      if (platform === "win32") {
        // Windows: Use PowerShell Get-Process which is more reliable
        command = `powershell -Command "Get-Process -Name 'RobloxPlayerBeta' -ErrorAction SilentlyContinue | Select-Object -First 1"`;
      } else if (platform === "darwin") {
        // macOS: Use ps
        command = `ps aux | grep -i "${ROBLOX_PROCESS}" | grep -v grep`;
      } else {
        // Linux: Use pgrep
        command = `pgrep -f "${ROBLOX_PROCESS}"`;
      }

      const { stdout } = await execAsync(command);

      // Check if process name appears in output
      // PowerShell will return process info if found, empty if not
      return (
        stdout.trim().length > 0 && stdout.toLowerCase().includes("roblox")
      );
    } catch (error) {
      // If command fails, assume process not running
      logger.debug("Process check failed, assuming not running", {
        error: error.message,
      });
      return false;
    }
  }

  /**
   * Get current running status
   */
  isRunning() {
    return this.wasRunning;
  }
}

module.exports = new ProcessWatcher();
