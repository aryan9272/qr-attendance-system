const crypto = require('crypto');

// Utility to normalize key to 32 bytes
function getKeyBuffer(secret) {
  const envSecret = secret || process.env.AES_SECRET_KEY || 'default-secret-key-must-be-32-chars-long!';
  if (/^[0-9a-fA-F]{64}$/.test(envSecret)) {
    return Buffer.from(envSecret, 'hex');
  }
  return crypto.createHash('sha256').update(String(envSecret)).digest();
}

/**
 * Encrypts compact attendance payload using AES-256-CBC
 * @param {Object} payload 
 * @param {String} secretKey 
 * @returns {String} Encrypted token string formatted as "ivHex.encryptedHex"
 */
function encryptToken(payload, secretKey) {
  const key = getKeyBuffer(secretKey);
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  
  // Compact payload keys to minimize encrypted QR token length & block density
  const compactPayload = JSON.stringify({
    e: payload.eventId || payload.e || 'CS101-LECTURE',
    t: payload.timestamp || payload.t || Date.now(),
    n: crypto.randomBytes(4).toString('hex'), // 4-byte compact nonce
  });

  let encrypted = cipher.update(compactPayload, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  return `${iv.toString('hex')}.${encrypted}`;
}

/**
 * Decrypts AES-256-CBC token and verifies timestamp freshness (< 60s)
 * @param {String} token 
 * @param {Number} maxAgeSeconds 
 * @param {String} secretKey 
 * @returns {Object} { isValid: boolean, payload: Object|null, error: string|null, ageSeconds: number }
 */
function decryptToken(token, maxAgeSeconds = 60, secretKey) {
  try {
    if (!token || typeof token !== 'string' || !token.includes('.')) {
      return { isValid: false, payload: null, error: 'Invalid token format. Must be formatted as iv.ciphertext', ageSeconds: 0 };
    }

    const [ivHex, encryptedHex] = token.split('.');
    if (!ivHex || !encryptedHex) {
      return { isValid: false, payload: null, error: 'Malformed encrypted payload structure', ageSeconds: 0 };
    }

    const key = getKeyBuffer(secretKey);
    const iv = Buffer.from(ivHex, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);

    let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    const rawPayload = JSON.parse(decrypted);

    // Normalize compact keys (e -> eventId, t -> timestamp)
    const payload = {
      ...rawPayload,
      eventId: rawPayload.e || rawPayload.eventId,
      timestamp: rawPayload.t || rawPayload.timestamp,
    };

    if (!payload.timestamp || typeof payload.timestamp !== 'number') {
      return { isValid: false, payload: null, error: 'Missing timestamp in decrypted token payload', ageSeconds: 0 };
    }

    const now = Date.now();
    const ageMs = now - payload.timestamp;
    const ageSeconds = Math.floor(ageMs / 1000);

    if (ageMs < -5000) {
      return { isValid: false, payload, error: 'Invalid token timestamp (future timestamp detected)', ageSeconds };
    }

    if (ageSeconds > maxAgeSeconds) {
      return { 
        isValid: false, 
        payload, 
        error: `Token expired! Generated ${ageSeconds}s ago (Maximum allowed is ${maxAgeSeconds}s to prevent photo-sharing fraud).`, 
        ageSeconds 
      };
    }

    return { isValid: true, payload, error: null, ageSeconds };
  } catch (err) {
    return { isValid: false, payload: null, error: `Decryption failed: ${err.message}`, ageSeconds: 0 };
  }
}

module.exports = {
  encryptToken,
  decryptToken,
  getKeyBuffer
};
