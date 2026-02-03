const crypto = require('crypto');
const logger = require('../logging/logger');
const User = require('../models/User');
const axios = require('axios');

// Cache for Roblox public keys (refresh every 24 hours)
let robloxPublicKeys = null;
let publicKeysLastFetch = 0;
const PUBLIC_KEYS_CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Fetch Roblox's public keys for JWT verification
 */
async function fetchRobloxPublicKeys() {
  try {
    const now = Date.now();
    
    // Return cached keys if still valid
    if (robloxPublicKeys && (now - publicKeysLastFetch) < PUBLIC_KEYS_CACHE_DURATION) {
      return robloxPublicKeys;
    }

    // Fetch from Roblox's JWKS endpoint
    const response = await axios.get('https://apis.roblox.com/oauth/.well-known/openid-configuration', {
      timeout: 5000
    });

    if (response.data && response.data.jwks_uri) {
      const jwksResponse = await axios.get(response.data.jwks_uri, {
        timeout: 5000
      });
      
      robloxPublicKeys = jwksResponse.data.keys;
      publicKeysLastFetch = now;
      logger.info('Fetched Roblox public keys for JWT verification');
      return robloxPublicKeys;
    }

    throw new Error('Failed to fetch JWKS URI');
  } catch (error) {
    logger.error('Failed to fetch Roblox public keys', { error: error.message });
    // Return cached keys if available, even if expired
    if (robloxPublicKeys) {
      logger.warn('Using expired public keys cache');
      return robloxPublicKeys;
    }
    return null;
  }
}

/**
 * Verify JWT signature using Roblox public keys
 * Uses Node.js built-in crypto for RS256/ES256 verification - no external JWT library needed
 */
async function verifyJWTSignature(token) {
  try {
    const publicKeys = await fetchRobloxPublicKeys();
    if (!publicKeys || publicKeys.length === 0) {
      logger.warn('No public keys available for JWT verification');
      return false;
    }

    const parts = token.split('.');
    if (parts.length !== 3) {
      logger.warn('JWT does not have 3 parts');
      return false;
    }

    const [headerB64, payloadB64, signatureB64] = parts;

    // Decode header to get kid and algorithm
    const header = JSON.parse(Buffer.from(headerB64.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString());

    const kid = header.kid;
    const alg = header.alg;

    if (!kid) {
      logger.warn('JWT missing kid in header');
      return false;
    }

    // Only accept RS256 and ES256 - reject weaker or unexpected algorithms
    const SUPPORTED_ALGS = {
      'RS256': 'RSA-SHA256',
      'ES256': 'SHA256',
    };
    if (!SUPPORTED_ALGS[alg]) {
      logger.warn('Unsupported JWT algorithm', { alg });
      return false;
    }

    // Find matching public key
    const matchingKey = publicKeys.find(key => key.kid === kid);
    if (!matchingKey) {
      logger.warn('No matching public key found for kid', { kid });
      return false;
    }

    // Convert JWK to Node.js KeyObject for cryptographic verification
    const publicKey = crypto.createPublicKey({ key: matchingKey, format: 'jwk' });

    // Verify signature against the signed data (header.payload)
    const signedData = headerB64 + '.' + payloadB64;
    const signature = Buffer.from(signatureB64.replace(/-/g, '+').replace(/_/g, '/'), 'base64');

    const verifier = crypto.createVerify(SUPPORTED_ALGS[alg]);
    verifier.update(signedData);

    const verifyOptions = alg === 'ES256'
      ? { dsaEncoding: 'ieee-p1363' }
      : undefined;

    const isValid = verifier.verify(publicKey, signature, verifyOptions);

    if (!isValid) {
      logger.warn('JWT signature cryptographic verification failed', { kid });
    }

    return isValid;
  } catch (error) {
    logger.error('JWT signature verification error', { error: error.message });
    return false;
  }
}

/**
 * Verify Roblox token and authenticate user
 */
async function authMiddleware(req, res, next) {
  try {
    // Get token from Authorization header
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ 
        success: false, 
        error: 'No authorization token provided' 
      });
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    // Parse Roblox OAuth2 idToken (JWT)
    let payload;
    try {
      const tokenParts = token.split('.');
      if (tokenParts.length === 3) {
        // Decode JWT payload (base64url encoded)
        const base64 = tokenParts[1].replace(/-/g, '+').replace(/_/g, '/');
        payload = JSON.parse(Buffer.from(base64, 'base64').toString());
      } else {
        return res.status(401).json({
          success: false,
          error: 'Invalid token format'
        });
      }
    } catch (error) {
      logger.error('Failed to parse token', { error: error.message });
      return res.status(401).json({
        success: false,
        error: 'Invalid token'
      });
    }

    // Verify token signature with Roblox's public keys
    const isValidSignature = await verifyJWTSignature(token);
    if (!isValidSignature) {
      logger.warn('Token signature verification failed');
      return res.status(401).json({
        success: false,
        error: 'Invalid token signature'
      });
    }

    // Verify token expiration
    if (payload.exp && Date.now() >= payload.exp * 1000) {
      logger.warn('Token expired', { exp: payload.exp });
      return res.status(401).json({
        success: false,
        error: 'Token expired'
      });
    }

    // Verify token not used before its valid time
    if (payload.nbf && Date.now() < payload.nbf * 1000) {
      logger.warn('Token not yet valid', { nbf: payload.nbf });
      return res.status(401).json({
        success: false,
        error: 'Token not yet valid'
      });
    }

    // Verify issuer is Roblox - use exact match to prevent spoofed issuers
    // e.g. "evil-roblox.com" or "roblox.com.evil.com" would pass an includes() check
    const VALID_ISSUERS = [
      'https://apis.roblox.com/oauth/',
      'https://apis.roblox.com/oauth',
      'https://apis.roblox.com'
    ];
    if (payload.iss && !VALID_ISSUERS.includes(payload.iss)) {
      logger.warn('Invalid token issuer', { iss: payload.iss });
      return res.status(401).json({
        success: false,
        error: 'Invalid token issuer'
      });
    }

    // Extract userId from token (Roblox uses 'sub' field for user ID)
    const userIdStr = payload.sub || payload.userId;
    const username = payload.preferred_username || payload.username;

    if (!userIdStr) {
      return res.status(401).json({
        success: false,
        error: 'Token missing user ID'
      });
    }

    // Convert userId to number (Roblox user IDs are numeric)
    const userId = parseInt(userIdStr);
    if (isNaN(userId)) {
      return res.status(401).json({
        success: false,
        error: 'Invalid user ID format'
      });
    }

    // Find user by userId, create if not exists (auto-register)
    let user = await User.findOne({ userId: userId });

    if (!user) {
      // Auto-register user from valid token
      user = new User({
        userId: userId,
        username: username || `User${userId}`,
        displayName: payload.name || payload.nickname || username
      });
      await user.save();
      logger.info('Auto-registered user from token', { userId, username });
    }

    // Attach user to request
    req.user = user;
    next();
  } catch (error) {
    logger.error('Auth middleware error', { error: error.message });
    return res.status(500).json({ 
      success: false, 
      error: 'Authentication failed' 
    });
  }
}

module.exports = authMiddleware;