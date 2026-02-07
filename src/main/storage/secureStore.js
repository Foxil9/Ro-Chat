const Store = require("electron-store");
const { app } = require("electron");
const crypto = require("crypto");
const os = require("os");
const fs = require("fs");
const path = require("path");
const logger = require("../logging/logger");
const { sanitizeError } = require("../utils/sanitizer");

// Derive a machine-specific encryption key so stored tokens
// are not decryptable with a single hardcoded key shared across all installs
function deriveEncryptionKey() {
  const machineId = [
    os.hostname(),
    os.userInfo().username,
    os.homedir(),
    "rochat-v1-secure",
  ].join(":");
  return crypto.createHash("sha256").update(machineId).digest("hex");
}

function createStore() {
  return new Store({
    name: "rochat-auth",
    encryptionKey: deriveEncryptionKey(),
    defaults: {
      auth: null,
      logPosition: null,
    },
  });
}

// Initialize Store. If the existing file was encrypted with the old hardcoded key,
// it cannot be decrypted with the new machine-derived key.
// Delete the stale file and start fresh — user re-authenticates once.
let secureStore;
try {
  secureStore = createStore();
} catch (initError) {
  try {
    const userData = app.getPath("userData");
    const storeFile = path.join(userData, "rochat-auth.json");
    if (fs.existsSync(storeFile)) {
      fs.unlinkSync(storeFile);
    }
  } catch (e) {
    // ignore cleanup errors
  }
  secureStore = createStore();
}

// Save authentication data
function saveAuth(authData) {
  try {
    if (!authData || !authData.accessToken) {
      logger.error("Invalid auth data provided to saveAuth");
      return false;
    }

    logger.info("Saving authentication data", { username: authData.username });
    secureStore.set("auth", {
      // OAuth2 tokens
      accessToken: authData.accessToken,
      refreshToken: authData.refreshToken,
      idToken: authData.idToken,
      tokenType: authData.tokenType,
      // User info
      userId: authData.userId,
      username: authData.username,
      displayName: authData.displayName,
      picture: authData.picture,
      // Expiry
      expiresAt: authData.expiresAt,
    });
    return true;
  } catch (error) {
    logger.error(
      "Failed to save authentication data",
      sanitizeError({ error: error.message }),
    );
    return false;
  }
}

// Get authentication data
function getAuth() {
  try {
    const auth = secureStore.get("auth");

    if (!auth) {
      return null;
    }

    // Validate auth structure
    if (!auth.accessToken || !auth.userId) {
      logger.warn("Auth data is corrupted, clearing");
      clearAuth();
      return null;
    }

    // Return auth data (expiry checking is handled by robloxAuth.js with refresh logic)
    return auth;
  } catch (error) {
    logger.error(
      "Failed to get authentication data",
      sanitizeError({ error: error.message }),
    );
    return null;
  }
}

// Clear all authentication data
function clearAuth() {
  try {
    logger.info("Clearing authentication data");
    secureStore.delete("auth");
    return true;
  } catch (error) {
    logger.error(
      "Failed to clear authentication data",
      sanitizeError({ error: error.message }),
    );
    return false;
  }
}

// Check if user is authenticated
function isAuthenticated() {
  const auth = getAuth();
  const isAuth = auth !== null;
  logger.debug("Authentication status check", { isAuthenticated: isAuth });
  return isAuth;
}

// Save log file position
function saveLogPosition(filePath, position) {
  try {
    secureStore.set("logPosition", { filePath, position, savedAt: Date.now() });
    logger.debug("Saved log position", { filePath, position });
    return true;
  } catch (error) {
    logger.error(
      "Failed to save log position",
      sanitizeError({ error: error.message }),
    );
    return false;
  }
}

// Get log file position
function getLogPosition() {
  try {
    const logPos = secureStore.get("logPosition");
    if (logPos) {
      logger.debug("Retrieved log position", {
        filePath: logPos.filePath,
        position: logPos.position,
      });
    }
    return logPos;
  } catch (error) {
    logger.error(
      "Failed to get log position",
      sanitizeError({ error: error.message }),
    );
    return null;
  }
}

// Clear log position
function clearLogPosition() {
  try {
    secureStore.delete("logPosition");
    return true;
  } catch (error) {
    logger.error(
      "Failed to clear log position",
      sanitizeError({ error: error.message }),
    );
    return false;
  }
}

module.exports = {
  saveAuth,
  getAuth,
  clearAuth,
  isAuthenticated,
  saveLogPosition,
  getLogPosition,
  clearLogPosition,
};
