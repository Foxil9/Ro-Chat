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
async function fetchRobloxPublicKeys(retryCount = 0) {
  try {
    const now = Date.now();

    // Return cached keys if still valid
    if (robloxPublicKeys && (now - publicKeysLastFetch) < PUBLIC_KEYS_CACHE_DURATION) {
      return robloxPublicKeys;
    }

    // Fetch from Roblox's JWKS endpoint with longer timeout and retry
    const response = await axios.get('https://apis.roblox.com/oauth/.well-known/openid-configuration', {
      timeout: 10000  // Increased to 10 seconds
    });

    if (response.data && response.data.jwks_uri) {
      const jwksResponse = await axios.get(response.data.jwks_uri, {
        timeout: 10000  // Increased to 10 seconds
      });

      robloxPublicKeys = jwksResponse.data.keys;
      publicKeysLastFetch = now;
      logger.info('Fetched Roblox public keys for JWT verification', { keyCount: robloxPublicKeys.length });
      return robloxPublicKeys;
    }

    throw new Error('Failed to fetch JWKS URI');
  } catch (error) {
    logger.error('Failed to fetch Roblox public keys', { error: error.message, retryCount });

    // Retry once if first attempt fails
    if (retryCount === 0) {
      logger.info('Retrying public key fetch...');
      await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second before retry
      return fetchRobloxPublicKeys(1);
    }

    // Return cached keys if available, even if expired
    if (robloxPublicKeys) {
      logger.warn('Using expired public keys cache', { age: now - publicKeysLastFetch });
      return robloxPublicKeys;
    }
    return null;
  }
}

/**
 * Decode base64url string (handles missing padding)
 */
function base64urlDecode(str) {
  // Replace URL-safe characters
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');

  // Add padding if needed
  const padding = base64.length % 4;
  if (padding === 2) {
    base64 += '==';
  } else if (padding === 3) {
    base64 += '=';
  }

  return Buffer.from(base64, 'base64');
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
      return { valid: false, reason: 'No public keys available' };
    }

    const parts = token.split('.');
    if (parts.length !== 3) {
      logger.warn('JWT does not have 3 parts');
      return { valid: false, reason: 'Invalid JWT format' };
    }

    const [headerB64, payloadB64, signatureB64] = parts;

    // Decode header to get kid and algorithm
    const headerBuffer = base64urlDecode(headerB64);
    const header = JSON.parse(headerBuffer.toString('utf8'));

    const kid = header.kid;
    const alg = header.alg;

    logger.info('Verifying JWT', { kid, alg, keyCount: publicKeys.length });

    if (!kid) {
      logger.warn('JWT missing kid in header');
      return { valid: false, reason: 'Missing key ID in token' };
    }

    // Only accept RS256 and ES256 - reject weaker or unexpected algorithms
    const SUPPORTED_ALGS = {
      'RS256': 'RSA-SHA256',
      'ES256': 'sha256',  // For ECDSA, use lowercase hash name
    };
    if (!SUPPORTED_ALGS[alg]) {
      logger.warn('Unsupported JWT algorithm', { alg });
      return { valid: false, reason: `Unsupported algorithm: ${alg}` };
    }

    // Find matching public key
    const matchingKey = publicKeys.find(key => key.kid === kid);
    if (!matchingKey) {
      logger.warn('No matching public key found for kid', { kid, availableKids: publicKeys.map(k => k.kid) });
      // Try to refresh keys in case they've been rotated
      robloxPublicKeys = null;
      publicKeysLastFetch = 0;
      return { valid: false, reason: 'Key not found - try logging in again' };
    }

    logger.info('Found matching key', { kid, keyType: matchingKey.kty, use: matchingKey.use });

    // Convert JWK to Node.js KeyObject for cryptographic verification
    let publicKey;
    try {
      publicKey = crypto.createPublicKey({ key: matchingKey, format: 'jwk' });
      logger.info('Successfully created public key from JWK', {
        keyType: matchingKey.kty,
        curve: matchingKey.crv
      });
    } catch (keyError) {
      logger.error('Failed to create public key from JWK', {
        error: keyError.message,
        keyType: matchingKey.kty
      });
      return { valid: false, reason: `Key creation failed: ${keyError.message}` };
    }

    // Verify signature against the signed data (header.payload)
    const signedData = headerB64 + '.' + payloadB64;
    const signature = base64urlDecode(signatureB64);

    logger.info('Signature details', {
      signedDataLength: signedData.length,
      signatureLength: signature.length,
      alg,
      signatureHex: signature.toString('hex').substring(0, 32) + '...'
    });

    const verifier = crypto.createVerify(SUPPORTED_ALGS[alg]);
    verifier.update(signedData);

    // For ES256, we need to specify the signature encoding
    let isValid;
    try {
      if (alg === 'ES256') {
        // ES256 signatures in JWT use IEEE P1363 format (raw R||S concatenation)
        logger.info('Attempting ES256 verification with ieee-p1363 encoding');
        isValid = verifier.verify(publicKey, signature, { dsaEncoding: 'ieee-p1363' });
        logger.info('ES256 verification result', { isValid });
      } else {
        // RS256 uses standard PKCS#1 v1.5 signature format
        logger.info('Attempting RS256 verification');
        isValid = verifier.verify(publicKey, signature);
        logger.info('RS256 verification result', { isValid });
      }
    } catch (verifyError) {
      logger.error('Signature verification threw error', {
        error: verifyError.message,
        stack: verifyError.stack,
        alg,
        kid
      });
      return { valid: false, reason: `Verification failed: ${verifyError.message}` };
    }

    if (!isValid) {
      logger.warn('JWT signature cryptographic verification failed', {
        kid,
        alg,
        signatureLength: signature.length
      });
      return { valid: false, reason: 'Signature verification failed - try logging in again' };
    }

    logger.info('✅ JWT signature verified successfully', { kid, alg });
    return { valid: true };
  } catch (error) {
    logger.error('JWT signature verification error', {
      error: error.message,
      stack: error.stack
    });
    return { valid: false, reason: `Verification error: ${error.message}` };
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
        const payloadBuffer = base64urlDecode(tokenParts[1]);
        payload = JSON.parse(payloadBuffer.toString('utf8'));

        logger.info('Token payload decoded', {
          iss: payload.iss,
          sub: payload.sub,
          exp: payload.exp,
          iat: payload.iat,
          hasExp: !!payload.exp,
          isExpired: payload.exp ? Date.now() >= payload.exp * 1000 : false
        });
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
    const signatureResult = await verifyJWTSignature(token);
    if (!signatureResult.valid) {
      logger.warn('Token signature verification failed', { reason: signatureResult.reason });
      return res.status(401).json({
        success: false,
        error: signatureResult.reason || 'Invalid token signature'
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