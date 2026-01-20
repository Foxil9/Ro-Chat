const Store = require('electron-store');
const { app } = require('electron');
const logger = require('../logging/logger');

// Initialize Store with encryption
const secureStore = new Store({
  name: 'rochat-auth',
  encryptionKey: 'rochat-secure-storage-key', // In production, use a more secure key
  defaults: {
    auth: null
  }
});

// Save authentication data
function saveAuth(authData) {
  try {
    logger.info('Saving authentication data', { username: authData.username });
    secureStore.set('auth', {
      robloxToken: authData.robloxToken,
      userId: authData.userId,
      username: authData.username,
      expiresAt: authData.expiresAt,
      refreshToken: authData.refreshToken
    });
    return true;
  } catch (error) {
    logger.error('Failed to save authentication data', { error: error.message });
    return false;
  }
}

// Get authentication data
function getAuth() {
  try {
    const auth = secureStore.get('auth');
    
    if (!auth) {
      return null;
    }
    
    // Check if token is expired
    if (Date.now() >= auth.expiresAt) {
      logger.warn('Authentication token expired', { expiresAt: auth.expiresAt });
      return null;
    }
    
    return auth;
  } catch (error) {
    logger.error('Failed to get authentication data', { error: error.message });
    return null;
  }
}

// Clear all authentication data
function clearAuth() {
  try {
    logger.info('Clearing authentication data');
    secureStore.delete('auth');
    return true;
  } catch (error) {
    logger.error('Failed to clear authentication data', { error: error.message });
    return false;
  }
}

// Check if user is authenticated
function isAuthenticated() {
  const auth = getAuth();
  const isAuth = auth !== null;
  logger.debug('Authentication status check', { isAuthenticated: isAuth });
  return isAuth;
}

module.exports = {
  saveAuth,
  getAuth,
  clearAuth,
  isAuthenticated
};
