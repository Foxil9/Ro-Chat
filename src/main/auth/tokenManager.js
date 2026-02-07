const logger = require("../logging/logger");
const secureStore = require("../storage/secureStore");

/**
 * Logout user by clearing authentication data
 */
function logout() {
  try {
    logger.info("Logging out user");
    secureStore.clearAuth();
    return true;
  } catch (error) {
    logger.error("Logout failed", { error: error.message });
    return false;
  }
}

/**
 * Get valid token from storage
 * Returns idToken (JWT) for authentication with backend
 */
function getValidToken() {
  const auth = secureStore.getAuth();

  if (!auth) {
    return null;
  }

  // Check if token is expired with 60-second buffer (consistent with robloxAuth.js:388)
  if (Date.now() >= auth.expiresAt - 60000) {
    logger.info("Token expired or about to expire, user must re-login");
    secureStore.clearAuth();
    return null;
  }

  // Return idToken (JWT with user identity) for authentication
  return auth.idToken;
}

/**
 * Check if user has a valid token
 */
function hasValidToken() {
  const auth = secureStore.getAuth();

  if (!auth) {
    return false;
  }

  // Check if token is expired with 60-second buffer (consistent with robloxAuth.js:388)
  if (Date.now() >= auth.expiresAt - 60000) {
    return false;
  }

  return true;
}

module.exports = {
  logout,
  getValidToken,
  hasValidToken,
};
