const logger = require('../logging/logger');
const secureStore = require('../storage/secureStore');

/**
 * Logout user by clearing authentication data
 */
function logout() {
  try {
    logger.info('Logging out user');
    secureStore.clearAuth();
    return true;
  } catch (error) {
    logger.error('Logout failed', { error: error.message });
    return false;
  }
}

/**
 * Get valid token from storage
 * Roblox cookies don't have refresh tokens
 */
function getValidToken() {
  const auth = secureStore.getAuth();
  
  if (!auth) {
    return null;
  }
  
  // Cookies are long-lived, just check if expired
  if (Date.now() >= auth.expiresAt) {
    logger.info('Token expired, user must re-login');
    secureStore.clearAuth();
    return null;
  }
  
  return auth.robloxToken;
}

/**
 * Check if user has a valid token
 */
function hasValidToken() {
  const auth = secureStore.getAuth();
  
  if (!auth) {
    return false;
  }
  
  // Check if token is expired
  if (Date.now() >= auth.expiresAt) {
    return false;
  }
  
  return true;
}

module.exports = {
  logout,
  getValidToken,
  hasValidToken
};
