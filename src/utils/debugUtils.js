/**
 * Debug Utilities for Production-Safe Logging
 *
 * Controls whether debug logs are shown based on environment
 * In production, only errors are logged
 */

// Check if we're in development mode
const isDevelopment = () => {
  // Check multiple conditions
  if (typeof process !== 'undefined' && process.env) {
    return process.env.NODE_ENV === 'development';
  }

  // Fallback: check hostname for localhost
  if (typeof window !== 'undefined') {
    const hostname = window.location.hostname;
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname.includes('192.168.');
  }

  return false;
};

// Check if debug mode is explicitly enabled via URL param
const isDebugEnabled = () => {
  if (typeof window !== 'undefined') {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('debug') === 'true' || urlParams.get('debugMode') === 'true';
  }
  return false;
};

// Master debug flag
export const DEBUG_MODE = isDevelopment() || isDebugEnabled();

/**
 * Safe console.log that only logs in development or when debug=true
 */
export const debugLog = (...args) => {
  if (DEBUG_MODE) {
    console.log(...args);
  }
};

/**
 * Safe console.warn that only logs in development or when debug=true
 */
export const debugWarn = (...args) => {
  if (DEBUG_MODE) {
    console.warn(...args);
  }
};

/**
 * Safe console.error - ALWAYS logs (errors should always be visible)
 */
export const debugError = (...args) => {
  console.error(...args);
};

/**
 * Safe console.info that only logs in development or when debug=true
 */
export const debugInfo = (...args) => {
  if (DEBUG_MODE) {
    console.info(...args);
  }
};

/**
 * Sanitize object for logging (remove sensitive data)
 */
export const sanitizeForLog = (obj) => {
  if (!obj || typeof obj !== 'object') return obj;

  const sanitized = { ...obj };
  const sensitiveKeys = [
    'apiKey',
    'apiSecret',
    'api_key',
    'api_secret',
    'x-api-key',
    'x-api-secret',
    'authorization',
    'password',
    'privateKey',
    'private_key',
    'mnemonic',
    'seed'
  ];

  // Remove sensitive keys
  sensitiveKeys.forEach(key => {
    if (sanitized[key]) {
      sanitized[key] = '[REDACTED]';
    }
    // Also check lowercase
    const lowerKey = key.toLowerCase();
    if (sanitized[lowerKey]) {
      sanitized[lowerKey] = '[REDACTED]';
    }
  });

  return sanitized;
};

/**
 * Log object safely (sanitizes sensitive data)
 */
export const debugLogObject = (label, obj) => {
  if (DEBUG_MODE) {
    console.log(label, sanitizeForLog(obj));
  }
};

export default {
  DEBUG_MODE,
  debugLog,
  debugWarn,
  debugError,
  debugInfo,
  debugLogObject,
  sanitizeForLog
};
