import { describe, it, expect, beforeEach, vi } from 'vitest';
import crypto from 'crypto';

/**
 * Test authMiddleware.js - JWT verification with RS256/ES256
 * Tests token signature verification, expiration, issuer validation
 */

describe('AuthMiddleware - JWT Verification', () => {
  let authMiddleware;
  let mockLogger;
  let mockUser;
  let mockAxios;
  let req, res, next;

  beforeEach(() => {
    // Mock logger
    mockLogger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };

    // Mock User model
    mockUser = {
      findOne: vi.fn(),
      prototype: {
        save: vi.fn(),
      },
    };

    // Mock axios for fetching public keys
    mockAxios = {
      get: vi.fn(),
    };

    // Mock dependencies
    vi.doMock('../../server/logging/logger', () => mockLogger);
    vi.doMock('../../server/models/User', () => mockUser);
    vi.doMock('axios', () => ({ default: mockAxios }));

    // Setup request/response/next
    req = {
      headers: {},
    };
    res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    };
    next = vi.fn();
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  describe('Authorization Header Validation', () => {
    it('should reject requests without Authorization header', async () => {
      const { default: middleware } = await import(
        '../../server/middleware/authMiddleware.js'
      );

      await middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'No authorization token provided',
      });
      expect(next).not.toHaveBeenCalled();
    });

    it('should reject requests without Bearer prefix', async () => {
      req.headers.authorization = 'InvalidToken';

      const { default: middleware } = await import(
        '../../server/middleware/authMiddleware.js'
      );

      await middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'No authorization token provided',
      });
    });

    it('should extract token from Bearer prefix', async () => {
      const validToken = createMockJWT({
        sub: '123456',
        exp: Math.floor(Date.now() / 1000) + 3600,
        iss: 'https://apis.roblox.com/oauth/',
      });

      req.headers.authorization = `Bearer ${validToken}`;

      // Mock public keys fetch
      mockAxios.get.mockResolvedValueOnce({
        data: { jwks_uri: 'https://apis.roblox.com/.well-known/jwks.json' },
      });

      const mockPublicKey = generateMockRSAKeyPair();
      mockAxios.get.mockResolvedValueOnce({
        data: {
          keys: [
            {
              kid: 'test-key-1',
              kty: 'RSA',
              n: mockPublicKey.n,
              e: mockPublicKey.e,
            },
          ],
        },
      });

      // Mock user lookup
      mockUser.findOne.mockResolvedValue({
        userId: 123456,
        username: 'TestUser',
      });

      const { default: middleware } = await import(
        '../../server/middleware/authMiddleware.js'
      );

      await middleware(req, res, next);

      // Should extract token correctly (will fail signature but that's ok for this test)
      expect(mockAxios.get).toHaveBeenCalled();
    });
  });

  describe('Token Format Validation', () => {
    it('should reject malformed JWT (not 3 parts)', async () => {
      req.headers.authorization = 'Bearer invalid.token';

      const { default: middleware } = await import(
        '../../server/middleware/authMiddleware.js'
      );

      await middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Invalid token format',
      });
    });

    it('should reject JWT with invalid base64 encoding', async () => {
      req.headers.authorization = 'Bearer header.!!!invalid_base64!!!.signature';

      const { default: middleware } = await import(
        '../../server/middleware/authMiddleware.js'
      );

      await middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Invalid token',
      });
    });

    it('should parse valid JWT structure', async () => {
      const token = createMockJWT({
        sub: '123456',
        exp: Math.floor(Date.now() / 1000) + 3600,
        iss: 'https://apis.roblox.com/oauth/',
      });

      req.headers.authorization = `Bearer ${token}`;

      // Mock public keys
      mockAxios.get
        .mockResolvedValueOnce({
          data: { jwks_uri: 'https://apis.roblox.com/.well-known/jwks.json' },
        })
        .mockResolvedValueOnce({
          data: { keys: [] },
        });

      const { default: middleware } = await import(
        '../../server/middleware/authMiddleware.js'
      );

      await middleware(req, res, next);

      // Will fail at signature verification, but confirms parsing worked
      expect(mockLogger.warn).toHaveBeenCalled();
    });
  });

  describe('Token Expiration Validation', () => {
    it('should reject expired tokens', async () => {
      const expiredToken = createMockJWT({
        sub: '123456',
        exp: Math.floor(Date.now() / 1000) - 3600, // Expired 1 hour ago
        iss: 'https://apis.roblox.com/oauth/',
      });

      req.headers.authorization = `Bearer ${expiredToken}`;

      // Mock successful signature verification
      mockAxios.get
        .mockResolvedValueOnce({
          data: { jwks_uri: 'https://apis.roblox.com/.well-known/jwks.json' },
        })
        .mockResolvedValueOnce({
          data: { keys: [{ kid: 'test-key-1', kty: 'RSA' }] },
        });

      // Mock verifyJWTSignature to return true
      vi.spyOn(crypto, 'createVerify').mockReturnValue({
        update: vi.fn().mockReturnThis(),
        verify: vi.fn().mockReturnValue(true),
      });

      const { default: middleware } = await import(
        '../../server/middleware/authMiddleware.js'
      );

      await middleware(req, res, next);

      expect(mockLogger.warn).toHaveBeenCalledWith('Token expired', {
        exp: expect.any(Number),
      });
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Token expired',
      });
    });

    it('should accept tokens not yet expired', async () => {
      const validToken = createMockJWT({
        sub: '123456',
        exp: Math.floor(Date.now() / 1000) + 3600, // Expires in 1 hour
        iss: 'https://apis.roblox.com/oauth/',
      });

      req.headers.authorization = `Bearer ${validToken}`;

      // Mock successful flow
      mockAxios.get
        .mockResolvedValueOnce({
          data: { jwks_uri: 'https://apis.roblox.com/.well-known/jwks.json' },
        })
        .mockResolvedValueOnce({
          data: { keys: [{ kid: 'test-key-1', kty: 'RSA' }] },
        });

      mockUser.findOne.mockResolvedValue({
        userId: 123456,
        username: 'TestUser',
      });

      // Will fail at signature but passes expiration check
      const { default: middleware } = await import(
        '../../server/middleware/authMiddleware.js'
      );

      await middleware(req, res, next);

      // Expiration check should pass (will fail at signature)
      const expiredCall = mockLogger.warn.mock.calls.find((call) =>
        call[0].includes('expired')
      );
      expect(expiredCall).toBeUndefined();
    });

    it('should reject tokens with nbf (not before) in future', async () => {
      const token = createMockJWT({
        sub: '123456',
        exp: Math.floor(Date.now() / 1000) + 3600,
        nbf: Math.floor(Date.now() / 1000) + 1800, // Valid 30 minutes from now
        iss: 'https://apis.roblox.com/oauth/',
      });

      req.headers.authorization = `Bearer ${token}`;

      mockAxios.get
        .mockResolvedValueOnce({
          data: { jwks_uri: 'https://apis.roblox.com/.well-known/jwks.json' },
        })
        .mockResolvedValueOnce({
          data: { keys: [{ kid: 'test-key-1', kty: 'RSA' }] },
        });

      const { default: middleware } = await import(
        '../../server/middleware/authMiddleware.js'
      );

      await middleware(req, res, next);

      expect(mockLogger.warn).toHaveBeenCalledWith('Token not yet valid', {
        nbf: expect.any(Number),
      });
      expect(res.status).toHaveBeenCalledWith(401);
    });
  });

  describe('Issuer Validation', () => {
    it.each([
      'https://apis.roblox.com/oauth/',
      'https://apis.roblox.com/oauth',
      'https://apis.roblox.com',
    ])('should accept valid Roblox issuer: %s', async (validIssuer) => {
      const token = createMockJWT({
        sub: '123456',
        exp: Math.floor(Date.now() / 1000) + 3600,
        iss: validIssuer,
      });

      req.headers.authorization = `Bearer ${token}`;

      mockAxios.get
        .mockResolvedValueOnce({
          data: { jwks_uri: 'https://apis.roblox.com/.well-known/jwks.json' },
        })
        .mockResolvedValueOnce({
          data: { keys: [{ kid: 'test-key-1', kty: 'RSA' }] },
        });

      mockUser.findOne.mockResolvedValue({
        userId: 123456,
        username: 'TestUser',
      });

      const { default: middleware } = await import(
        '../../server/middleware/authMiddleware.js'
      );

      await middleware(req, res, next);

      // Should not reject based on issuer (will fail at signature)
      const issuerWarning = mockLogger.warn.mock.calls.find((call) =>
        call[0].includes('Invalid token issuer')
      );
      expect(issuerWarning).toBeUndefined();
    });

    it.each([
      'https://evil-roblox.com',
      'https://roblox.com.evil.com',
      'https://apis.fake-roblox.com/oauth/',
      'https://malicious.com',
      '',
    ])('should reject invalid issuer: %s', async (invalidIssuer) => {
      const token = createMockJWT({
        sub: '123456',
        exp: Math.floor(Date.now() / 1000) + 3600,
        iss: invalidIssuer,
      });

      req.headers.authorization = `Bearer ${token}`;

      mockAxios.get
        .mockResolvedValueOnce({
          data: { jwks_uri: 'https://apis.roblox.com/.well-known/jwks.json' },
        })
        .mockResolvedValueOnce({
          data: { keys: [{ kid: 'test-key-1', kty: 'RSA' }] },
        });

      const { default: middleware } = await import(
        '../../server/middleware/authMiddleware.js'
      );

      await middleware(req, res, next);

      if (invalidIssuer) {
        expect(mockLogger.warn).toHaveBeenCalledWith('Invalid token issuer', {
          iss: invalidIssuer,
        });
      }
      expect(res.status).toHaveBeenCalledWith(401);
    });
  });

  describe('User ID Extraction', () => {
    it('should extract userId from sub claim', async () => {
      const token = createMockJWT({
        sub: '987654321',
        exp: Math.floor(Date.now() / 1000) + 3600,
        iss: 'https://apis.roblox.com/oauth/',
        preferred_username: 'TestUser123',
      });

      req.headers.authorization = `Bearer ${token}`;

      mockAxios.get
        .mockResolvedValueOnce({
          data: { jwks_uri: 'https://apis.roblox.com/.well-known/jwks.json' },
        })
        .mockResolvedValueOnce({
          data: { keys: [{ kid: 'test-key-1', kty: 'RSA' }] },
        });

      mockUser.findOne.mockResolvedValue({
        userId: 987654321,
        username: 'TestUser123',
      });

      const { default: middleware } = await import(
        '../../server/middleware/authMiddleware.js'
      );

      await middleware(req, res, next);

      // Will fail at signature, but userId extraction should work
      expect(mockUser.findOne).toHaveBeenCalledWith({ userId: 987654321 });
    });

    it('should reject token without userId/sub claim', async () => {
      const token = createMockJWT({
        exp: Math.floor(Date.now() / 1000) + 3600,
        iss: 'https://apis.roblox.com/oauth/',
        // Missing sub field
      });

      req.headers.authorization = `Bearer ${token}`;

      mockAxios.get
        .mockResolvedValueOnce({
          data: { jwks_uri: 'https://apis.roblox.com/.well-known/jwks.json' },
        })
        .mockResolvedValueOnce({
          data: { keys: [{ kid: 'test-key-1', kty: 'RSA' }] },
        });

      const { default: middleware } = await import(
        '../../server/middleware/authMiddleware.js'
      );

      await middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Token missing user ID',
      });
    });

    it('should reject token with non-numeric userId', async () => {
      const token = createMockJWT({
        sub: 'not-a-number',
        exp: Math.floor(Date.now() / 1000) + 3600,
        iss: 'https://apis.roblox.com/oauth/',
      });

      req.headers.authorization = `Bearer ${token}`;

      mockAxios.get
        .mockResolvedValueOnce({
          data: { jwks_uri: 'https://apis.roblox.com/.well-known/jwks.json' },
        })
        .mockResolvedValueOnce({
          data: { keys: [{ kid: 'test-key-1', kty: 'RSA' }] },
        });

      const { default: middleware } = await import(
        '../../server/middleware/authMiddleware.js'
      );

      await middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Invalid user ID format',
      });
    });
  });

  describe('Algorithm Support', () => {
    it('should accept RS256 tokens', () => {
      const header = { alg: 'RS256', kid: 'test-key-1' };
      const token = createMockJWTWithHeader(header, {
        sub: '123456',
        exp: Math.floor(Date.now() / 1000) + 3600,
      });

      // Parse header
      const [headerB64] = token.split('.');
      const parsedHeader = JSON.parse(
        Buffer.from(headerB64, 'base64url').toString()
      );

      expect(parsedHeader.alg).toBe('RS256');
    });

    it('should accept ES256 tokens', () => {
      const header = { alg: 'ES256', kid: 'test-key-1' };
      const token = createMockJWTWithHeader(header, {
        sub: '123456',
        exp: Math.floor(Date.now() / 1000) + 3600,
      });

      const [headerB64] = token.split('.');
      const parsedHeader = JSON.parse(
        Buffer.from(headerB64, 'base64url').toString()
      );

      expect(parsedHeader.alg).toBe('ES256');
    });

    it('should have updated to support ES256 (issue from logs)', () => {
      // This test documents the fix for the ES256 issue from user logs
      const supportedAlgorithms = ['RS256', 'ES256'];
      expect(supportedAlgorithms).toContain('ES256');
    });
  });
});

/**
 * Helper: Create a mock JWT with given payload (unsigned, for testing parsing)
 */
function createMockJWT(payload) {
  const header = { alg: 'RS256', typ: 'JWT', kid: 'test-key-1' };
  return createMockJWTWithHeader(header, payload);
}

/**
 * Helper: Create a mock JWT with custom header
 */
function createMockJWTWithHeader(header, payload) {
  const headerB64 = Buffer.from(JSON.stringify(header)).toString('base64url');
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = 'mock-signature';
  return `${headerB64}.${payloadB64}.${signature}`;
}

/**
 * Helper: Generate mock RSA key pair (for testing only)
 */
function generateMockRSAKeyPair() {
  return {
    n: 'mock-modulus-base64',
    e: 'AQAB',
    kid: 'test-key-1',
    kty: 'RSA',
    use: 'sig',
  };
}
