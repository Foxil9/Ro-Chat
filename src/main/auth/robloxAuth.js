const { shell } = require('electron');
const axios = require('axios');
const crypto = require('crypto');
const http = require('http');
const url = require('url');
const logger = require('../logging/logger');
const secureStore = require('../storage/secureStore');

// OAuth2 Configuration
const OAUTH_BASE_URL = 'https://apis.roblox.com/oauth';
const CLIENT_ID = process.env.ROBLOX_CLIENT_ID;
const CLIENT_SECRET = process.env.ROBLOX_CLIENT_SECRET;
const REDIRECT_URI = process.env.OAUTH_REDIRECT_URI || 'http://localhost:3333/callback';
const CALLBACK_PORT = parseInt(process.env.OAUTH_CALLBACK_PORT || '3333');
const SCOPES = 'openid profile';

// Store PKCE verifier temporarily during auth flow
let currentCodeVerifier = null;
let callbackServer = null;

/**
 * Generate random string for PKCE
 */
function generateRandomString(length) {
  return crypto.randomBytes(length).toString('base64url');
}

/**
 * Generate PKCE code verifier and challenge
 */
function generatePKCE() {
  const codeVerifier = generateRandomString(32); // 43-128 characters
  const codeChallenge = crypto
    .createHash('sha256')
    .update(codeVerifier)
    .digest('base64url');

  return {
    codeVerifier,
    codeChallenge,
    codeChallengeMethod: 'S256'
  };
}

/**
 * Create local HTTP server to handle OAuth2 callback
 */
function createCallbackServer() {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const parsedUrl = url.parse(req.url, true);

      if (parsedUrl.pathname === '/callback') {
        const { code, error, error_description } = parsedUrl.query;

        if (error) {
          logger.error('OAuth2 authorization error', { error, error_description });
          res.writeHead(400, { 'Content-Type': 'text/html' });
          res.end(`
            <html>
              <head><title>Login Failed</title></head>
              <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
                <h1>❌ Login Failed</h1>
                <p>Error: ${error}</p>
                <p>${error_description || ''}</p>
                <p>You can close this window and try again.</p>
              </body>
            </html>
          `);
          reject(new Error(error_description || error));
          server.close();
          return;
        }

        if (code) {
          logger.info('OAuth2 authorization code received');
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(`
            <html>
              <head><title>Login Successful</title></head>
              <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
                <h1>✓ Login Successful!</h1>
                <p>You can now close this window and return to RoChat.</p>
                <script>window.close();</script>
              </body>
            </html>
          `);
          resolve(code);
          // Close server after a short delay to ensure response is sent
          setTimeout(() => server.close(), 1000);
        } else {
          res.writeHead(400, { 'Content-Type': 'text/html' });
          res.end(`
            <html>
              <head><title>Invalid Request</title></head>
              <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
                <h1>Invalid Request</h1>
                <p>No authorization code received.</p>
              </body>
            </html>
          `);
          reject(new Error('No authorization code received'));
          server.close();
        }
      } else {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not Found');
      }
    });

    server.listen(CALLBACK_PORT, () => {
      logger.info('OAuth2 callback server started', { port: CALLBACK_PORT });
    });

    server.on('error', (error) => {
      logger.error('Callback server error', { error: error.message });
      reject(error);
    });

    callbackServer = server;
  });
}

/**
 * Exchange authorization code for access token
 */
async function exchangeCodeForToken(authCode, codeVerifier) {
  try {
    logger.info('Exchanging authorization code for token');

    const response = await axios.post(
      `${OAUTH_BASE_URL}/v1/token`,
      new URLSearchParams({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        grant_type: 'authorization_code',
        code: authCode,
        redirect_uri: REDIRECT_URI,
        code_verifier: codeVerifier
      }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        timeout: 10000
      }
    );

    logger.info('Token exchange successful');
    return {
      accessToken: response.data.access_token,
      refreshToken: response.data.refresh_token,
      idToken: response.data.id_token,
      expiresIn: response.data.expires_in,
      tokenType: response.data.token_type
    };
  } catch (error) {
    logger.error('Token exchange failed', {
      error: error.message,
      status: error.response?.status,
      data: error.response?.data
    });

    if (error.response?.status === 400) {
      throw new Error('Invalid authorization code or PKCE verifier');
    } else if (error.code === 'ECONNRESET' || error.code === 'ENOTFOUND') {
      throw new Error('Network connection failed. Please check your internet connection.');
    } else {
      throw new Error(`Token exchange failed: ${error.message}`);
    }
  }
}

/**
 * Get user information using access token
 */
async function getUserInfo(accessToken) {
  try {
    logger.info('Fetching user information');

    const response = await axios.get(`${OAUTH_BASE_URL}/v1/userinfo`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      timeout: 10000
    });

    logger.info('User info retrieved successfully', { userId: response.data.sub });
    return {
      id: response.data.sub,
      username: response.data.preferred_username,
      displayName: response.data.name || response.data.nickname,
      picture: response.data.picture,
      createdAt: response.data.created_at
    };
  } catch (error) {
    logger.error('Failed to get user info', {
      error: error.message,
      status: error.response?.status
    });

    if (error.response?.status === 401) {
      throw new Error('Invalid or expired access token');
    } else {
      throw new Error(`Failed to get user info: ${error.message}`);
    }
  }
}

/**
 * Refresh access token using refresh token
 */
async function refreshAccessToken(refreshToken) {
  try {
    logger.info('Refreshing access token');

    const response = await axios.post(
      `${OAUTH_BASE_URL}/v1/token`,
      new URLSearchParams({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        grant_type: 'refresh_token',
        refresh_token: refreshToken
      }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        timeout: 10000
      }
    );

    logger.info('Token refresh successful');
    return {
      accessToken: response.data.access_token,
      refreshToken: response.data.refresh_token || refreshToken,
      expiresIn: response.data.expires_in
    };
  } catch (error) {
    logger.error('Token refresh failed', {
      error: error.message,
      status: error.response?.status
    });

    // If refresh fails, user needs to log in again
    secureStore.clearAuth();
    throw new Error('Session expired. Please log in again.');
  }
}

/**
 * Initiate OAuth2 login flow with PKCE
 */
async function initiateLogin() {
  try {
    // Validate environment variables
    if (!CLIENT_ID || !CLIENT_SECRET) {
      throw new Error('OAuth2 credentials not configured. Please set ROBLOX_CLIENT_ID and ROBLOX_CLIENT_SECRET in .env file');
    }

    logger.info('Initiating OAuth2 login with PKCE');

    // Generate PKCE challenge
    const { codeVerifier, codeChallenge, codeChallengeMethod } = generatePKCE();
    currentCodeVerifier = codeVerifier;

    // Generate state for CSRF protection
    const state = generateRandomString(16);

    // Build authorization URL
    const authUrl = new URL(`${OAUTH_BASE_URL}/v1/authorize`);
    authUrl.searchParams.append('client_id', CLIENT_ID);
    authUrl.searchParams.append('redirect_uri', REDIRECT_URI);
    authUrl.searchParams.append('scope', SCOPES);
    authUrl.searchParams.append('response_type', 'code');
    authUrl.searchParams.append('state', state);
    authUrl.searchParams.append('code_challenge', codeChallenge);
    authUrl.searchParams.append('code_challenge_method', codeChallengeMethod);

    logger.info('Opening authorization URL in browser', { url: authUrl.toString() });

    // Start local callback server
    const authCodePromise = createCallbackServer();

    // Open authorization URL in default browser
    await shell.openExternal(authUrl.toString());

    // Wait for authorization code from callback
    const authCode = await authCodePromise;

    // Exchange authorization code for tokens
    const tokens = await exchangeCodeForToken(authCode, codeVerifier);

    // Get user information
    const userInfo = await getUserInfo(tokens.accessToken);

    // Save auth data
    const authData = {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      idToken: tokens.idToken,
      tokenType: tokens.tokenType,
      userId: userInfo.id,
      username: userInfo.username,
      displayName: userInfo.displayName,
      picture: userInfo.picture,
      expiresAt: Date.now() + (tokens.expiresIn * 1000)
    };

    secureStore.saveAuth(authData);
    logger.info('OAuth2 login successful', { username: userInfo.username });

    // Clear temporary data
    currentCodeVerifier = null;

    return userInfo;
  } catch (error) {
    // Cleanup
    currentCodeVerifier = null;
    if (callbackServer) {
      callbackServer.close();
      callbackServer = null;
    }

    logger.error('OAuth2 login failed', { error: error.message });
    throw error;
  }
}

/**
 * Check if user is authenticated
 */
function isAuthenticated() {
  const auth = secureStore.getAuth();

  if (!auth || !auth.accessToken) {
    return false;
  }

  // Check if token is expired (with 1 minute buffer)
  if (Date.now() >= (auth.expiresAt - 60000)) {
    logger.info('Access token expired or about to expire');

    // Try to refresh token if we have a refresh token
    if (auth.refreshToken) {
      // This will be handled by the auto-refresh mechanism
      return true;
    }

    logger.info('No refresh token available');
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

  if (!auth || !auth.accessToken) {
    return null;
  }

  return {
    userId: auth.userId,
    username: auth.username,
    displayName: auth.displayName,
    picture: auth.picture
  };
}

/**
 * Get valid access token (auto-refresh if needed)
 */
async function getAccessToken() {
  const auth = secureStore.getAuth();

  if (!auth || !auth.accessToken) {
    throw new Error('Not authenticated');
  }

  // Check if token is expired or about to expire (within 1 minute)
  if (Date.now() >= (auth.expiresAt - 60000)) {
    logger.info('Access token expired, refreshing');

    if (!auth.refreshToken) {
      throw new Error('No refresh token available');
    }

    // Refresh the token
    const newTokens = await refreshAccessToken(auth.refreshToken);

    // Update stored auth data
    const updatedAuth = {
      ...auth,
      accessToken: newTokens.accessToken,
      refreshToken: newTokens.refreshToken,
      expiresAt: Date.now() + (newTokens.expiresIn * 1000)
    };

    secureStore.saveAuth(updatedAuth);
    return newTokens.accessToken;
  }

  return auth.accessToken;
}

module.exports = {
  initiateLogin,
  isAuthenticated,
  getCurrentUser,
  getAccessToken,
  refreshAccessToken
};
