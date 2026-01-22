const express = require('express');
const router = express.Router();
const axios = require('axios');
const logger = require('../logging/logger');

// OAuth2 Configuration
const OAUTH_BASE_URL = 'https://apis.roblox.com/oauth';
const CLIENT_ID = process.env.ROBLOX_CLIENT_ID;
const CLIENT_SECRET = process.env.ROBLOX_CLIENT_SECRET;
const REDIRECT_URI = process.env.OAUTH_REDIRECT_URI || 'http://localhost:3333/callback';

/**
 * Exchange authorization code for tokens
 * This endpoint is called by the Electron client after receiving the auth code
 * The client secret stays secure on the server
 */
router.post('/exchange', async (req, res) => {
  try {
    const { code, codeVerifier } = req.body;

    if (!code || !codeVerifier) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameters: code and codeVerifier'
      });
    }

    if (!CLIENT_ID || !CLIENT_SECRET) {
      logger.error('OAuth2 credentials not configured');
      return res.status(500).json({
        success: false,
        error: 'OAuth2 not configured on server'
      });
    }

    logger.info('Exchanging authorization code for token');

    // Exchange code for tokens with Roblox
    const tokenResponse = await axios.post(
      `${OAUTH_BASE_URL}/v1/token`,
      new URLSearchParams({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        grant_type: 'authorization_code',
        code: code,
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

    // Return tokens to client
    res.json({
      success: true,
      tokens: {
        accessToken: tokenResponse.data.access_token,
        refreshToken: tokenResponse.data.refresh_token,
        idToken: tokenResponse.data.id_token,
        expiresIn: tokenResponse.data.expires_in,
        tokenType: tokenResponse.data.token_type
      }
    });

  } catch (error) {
    logger.error('Token exchange failed', {
      error: error.message,
      response: error.response?.data
    });

    res.status(error.response?.status || 500).json({
      success: false,
      error: error.response?.data?.error || 'Token exchange failed',
      errorDescription: error.response?.data?.error_description
    });
  }
});

/**
 * Refresh access token
 * This endpoint is called by the Electron client to refresh expired tokens
 */
router.post('/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameter: refreshToken'
      });
    }

    if (!CLIENT_ID || !CLIENT_SECRET) {
      logger.error('OAuth2 credentials not configured');
      return res.status(500).json({
        success: false,
        error: 'OAuth2 not configured on server'
      });
    }

    logger.info('Refreshing access token');

    // Refresh token with Roblox
    const tokenResponse = await axios.post(
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

    // Return new tokens to client
    res.json({
      success: true,
      tokens: {
        accessToken: tokenResponse.data.access_token,
        refreshToken: tokenResponse.data.refresh_token,
        idToken: tokenResponse.data.id_token,
        expiresIn: tokenResponse.data.expires_in,
        tokenType: tokenResponse.data.token_type
      }
    });

  } catch (error) {
    logger.error('Token refresh failed', {
      error: error.message,
      response: error.response?.data
    });

    res.status(error.response?.status || 500).json({
      success: false,
      error: error.response?.data?.error || 'Token refresh failed',
      errorDescription: error.response?.data?.error_description
    });
  }
});

module.exports = router;
