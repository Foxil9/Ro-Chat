const { BrowserWindow } = require('electron');
const axios = require('axios');
const logger = require('../logging/logger');
const secureStore = require('../storage/secureStore');

/**
 * Initiate Roblox login using cookie-based authentication
 */
async function initiateLogin() {
  return new Promise((resolve, reject) => {
    logger.info('Initiating Roblox cookie login');
    
    const loginWindow = new BrowserWindow({
      width: 800,
      height: 600,
      show: false,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        partition: 'persist:roblox' // Separate cookie store for Roblox
      }
    });
    
    loginWindow.loadURL('https://www.roblox.com/login');
    
    // Show window when loaded
    loginWindow.once('ready-to-show', () => {
      loginWindow.show();
    });
    
    // Check for successful login every 2 seconds
    const checkLogin = setInterval(async () => {
      try {
        const cookies = await loginWindow.webContents.session.cookies.get({
          url: 'https://www.roblox.com',
          name: '.ROBLOSECURITY'
        });
        
        if (cookies.length > 0) {
          clearInterval(checkLogin);
          const token = cookies[0].value;
          
          // Get user info with cookie
          const userInfo = await getUserInfoWithCookie(token);
          
          // Save auth data
          const authData = {
            robloxToken: token,
            userId: userInfo.id,
            username: userInfo.name,
            displayName: userInfo.displayName,
            expiresAt: Date.now() + (365 * 24 * 60 * 60 * 1000) // 1 year
          };
          
          secureStore.saveAuth(authData);
          loginWindow.close();
          
          logger.info('Login successful', { username: userInfo.name });
          resolve(userInfo);
        }
      } catch (error) {
        logger.error('Error checking login', { error: error.message });
      }
    }, 2000);
    
    // Handle login window closed
    loginWindow.on('closed', () => {
      clearInterval(checkLogin);
      reject(new Error('Login cancelled'));
    });
  });
}

/**
 * Get user information using cookie
 */
async function getUserInfoWithCookie(cookie) {
  const response = await axios.get('https://users.roblox.com/v1/users/authenticated', {
    headers: {
      'Cookie': `.ROBLOSECURITY=${cookie}`,
      'User-Agent': 'RoChat/1.0'
    }
  });
  
  return {
    id: response.data.id,
    name: response.data.name,
    displayName: response.data.displayName
  };
}

/**
 * Check if user is authenticated
 */
function isAuthenticated() {
  const auth = secureStore.getAuth();
  
  if (!auth) {
    return false;
  }
  
  // Check if token is expired
  if (Date.now() >= auth.expiresAt) {
    logger.info('Token expired');
    secureStore.clearAuth();
    return false;
  }
  
  return true;
}

/**
 * Get current user info
 */
function getCurrentUser() {
  const auth = secureStore.getAuth();
  
  if (!auth || Date.now() >= auth.expiresAt) {
    return null;
  }
  
  return {
    userId: auth.userId,
    username: auth.username,
    displayName: auth.displayName
  };
}

module.exports = {
  initiateLogin,
  isAuthenticated,
  getCurrentUser
};
