'use strict';

/**
 * We HR — Cryptographic Password Hashing & Session Token (JWT) Security Module
 * Uses Node.js built-in `node:crypto` with scrypt and timingSafeEqual.
 */

const crypto = require('node:crypto');

const DEFAULT_SECRET =
  process.env.JWT_SECRET || 'we-hr-local-dev-secret-change-in-production-9f8e7d6c5b4a3210';
const DEFAULT_EXPIRES_IN_SEC = Number(process.env.JWT_EXPIRES_IN_SECONDS || 28800); // 8 hours

/**
 * Hashes a plaintext password using scrypt with a random 16-byte salt.
 * @param {string} password
 * @returns {string} Format: "scrypt:<saltHex>:<hashHex>"
 */
function hashPassword(password) {
  if (typeof password !== 'string' || password.length < 6) {
    throw new Error('Password must be at least 6 characters long');
  }
  const salt = crypto.randomBytes(16).toString('hex');
  const derivedKey = crypto.scryptSync(password, salt, 64).toString('hex');
  return `scrypt:${salt}:${derivedKey}`;
}

/**
 * Verifies a plaintext password against a stored scrypt hash using timingSafeEqual.
 * @param {string} password
 * @param {string} storedHash
 * @returns {boolean}
 */
function verifyPassword(password, storedHash) {
  if (!password || !storedHash || typeof storedHash !== 'string') {
    return false;
  }
  const parts = storedHash.split(':');
  if (parts.length !== 3 || parts[0] !== 'scrypt') {
    return false;
  }
  const [, salt, originalHex] = parts;
  const derivedBuffer = crypto.scryptSync(password, salt, 64);
  const originalBuffer = Buffer.from(originalHex, 'hex');
  if (derivedBuffer.length !== originalBuffer.length) {
    return false;
  }
  return crypto.timingSafeEqual(derivedBuffer, originalBuffer);
}

/**
 * Base64URL encodes a buffer or string.
 * @param {Buffer|string} input
 * @returns {string}
 */
function base64UrlEncode(input) {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(String(input), 'utf8');
  return buf
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

/**
 * Base64URL decodes a string to UTF-8.
 * @param {string} str
 * @returns {string}
 */
function base64UrlDecode(str) {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4 !== 0) {
    base64 += '=';
  }
  return Buffer.from(base64, 'base64').toString('utf8');
}

/**
 * Signs a JWT token using HMAC-SHA256.
 * @param {Object} payload
 * @param {Object} [options]
 * @param {number} [options.expiresInSeconds]
 * @param {string} [options.secret]
 * @param {number} [options.nowSeconds]
 * @returns {string}
 */
function signJwt(payload, options = {}) {
  const secret = options.secret || DEFAULT_SECRET;
  const nowSec = options.nowSeconds ?? Math.floor(Date.now() / 1000);
  const expiresIn = options.expiresInSeconds ?? DEFAULT_EXPIRES_IN_SEC;

  const header = { alg: 'HS256', typ: 'JWT' };
  const fullPayload = {
    ...payload,
    iat: nowSec,
    exp: nowSec + expiresIn,
  };

  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(fullPayload));
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const signature = crypto
    .createHmac('sha256', secret)
    .update(signingInput)
    .digest();

  return `${signingInput}.${base64UrlEncode(signature)}`;
}

/**
 * Verifies a JWT token signature and expiration.
 * @param {string} token
 * @param {Object} [options]
 * @param {string} [options.secret]
 * @param {number} [options.nowSeconds]
 * @returns {{ valid: boolean, payload?: Object, reason?: string }}
 */
function verifyJwt(token, options = {}) {
  if (!token || typeof token !== 'string') {
    return { valid: false, reason: 'MISSING_TOKEN' };
  }
  const parts = token.split('.');
  if (parts.length !== 3) {
    return { valid: false, reason: 'MALFORMED_TOKEN' };
  }

  const secret = options.secret || DEFAULT_SECRET;
  const nowSec = options.nowSeconds ?? Math.floor(Date.now() / 1000);
  const [encodedHeader, encodedPayload, encodedSig] = parts;
  const signingInput = `${encodedHeader}.${encodedPayload}`;

  const expectedSig = base64UrlEncode(
    crypto.createHmac('sha256', secret).update(signingInput).digest()
  );

  const sigBufA = Buffer.from(encodedSig, 'utf8');
  const sigBufB = Buffer.from(expectedSig, 'utf8');
  if (sigBufA.length !== sigBufB.length || !crypto.timingSafeEqual(sigBufA, sigBufB)) {
    return { valid: false, reason: 'INVALID_SIGNATURE' };
  }

  try {
    const payload = JSON.parse(base64UrlDecode(encodedPayload));
    if (typeof payload.exp === 'number' && nowSec >= payload.exp) {
      return { valid: false, reason: 'TOKEN_EXPIRED' };
    }
    return { valid: true, payload };
  } catch {
    return { valid: false, reason: 'INVALID_PAYLOAD_JSON' };
  }
}

module.exports = {
  hashPassword,
  verifyPassword,
  signJwt,
  verifyJwt,
};
