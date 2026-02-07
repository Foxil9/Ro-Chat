/**
 * Sanitizer for sensitive data in logs and error messages
 * Prevents leaking tokens, cookies, and server identifiers
 */

/**
 * Sanitize error objects and strings to remove sensitive data
 * @param {Error|Object|string} input - The error or data to sanitize
 * @returns {Object|string} - Sanitized version safe for logging
 */
function sanitizeError(input) {
  if (!input) return input;

  let sanitized;

  // Handle Error objects
  if (input instanceof Error) {
    sanitized = {
      message: sanitizeString(input.message),
      name: input.name,
      stack: input.stack ? sanitizeString(input.stack) : undefined,
    };
  }
  // Handle plain objects
  else if (typeof input === "object") {
    sanitized = {};
    for (const [key, value] of Object.entries(input)) {
      // Skip sensitive keys entirely
      if (isSensitiveKey(key)) {
        sanitized[key] = "[REDACTED]";
      } else if (typeof value === "string") {
        sanitized[key] = sanitizeString(value);
      } else if (typeof value === "object" && value !== null) {
        sanitized[key] = sanitizeError(value); // Recursive
      } else {
        sanitized[key] = value;
      }
    }
  }
  // Handle strings
  else if (typeof input === "string") {
    sanitized = sanitizeString(input);
  } else {
    sanitized = input;
  }

  return sanitized;
}

/**
 * Check if a key name contains sensitive information
 * @param {string} key
 * @returns {boolean}
 */
function isSensitiveKey(key) {
  const sensitiveKeys = [
    "token",
    "accesstoken",
    "refreshtoken",
    "idtoken",
    "cookie",
    "authorization",
    "auth",
    "password",
    "secret",
    "key",
  ];

  const lowerKey = key.toLowerCase();
  return sensitiveKeys.some((sensitive) => lowerKey.includes(sensitive));
}

/**
 * Sanitize a string by removing sensitive patterns
 * @param {string} str
 * @returns {string}
 */
function sanitizeString(str) {
  if (typeof str !== "string") return str;

  let sanitized = str;

  // Pattern: Bearer tokens (JWT or OAuth)
  sanitized = sanitized.replace(
    /Bearer\s+[A-Za-z0-9_\-\.]+/gi,
    "Bearer [REDACTED]",
  );

  // Pattern: JWT tokens (three base64 segments separated by dots)
  sanitized = sanitized.replace(
    /eyJ[A-Za-z0-9_\-]+\.eyJ[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+/g,
    "[JWT_REDACTED]",
  );

  // Pattern: UUID (JobId format: 8-4-4-4-12)
  sanitized = sanitized.replace(
    /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi,
    "[JOB_ID_REDACTED]",
  );

  // Pattern: Long numeric IDs (PlaceId, UserId - 10+ digits)
  sanitized = sanitized.replace(/\b\d{10,}\b/g, "[ID_REDACTED]");

  // Pattern: Cookie values
  sanitized = sanitized.replace(
    /\.(ROBLOSECURITY|ROBLOXID)=[^;]+/gi,
    ".$1=[REDACTED]",
  );

  // Pattern: Access tokens in URLs or query strings
  sanitized = sanitized.replace(
    /([?&])(access_token|token|auth)=([^&\s]+)/gi,
    "$1$2=[REDACTED]",
  );

  return sanitized;
}

module.exports = {
  sanitizeError,
  sanitizeString,
};
