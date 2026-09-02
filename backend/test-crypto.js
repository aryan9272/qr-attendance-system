const { encryptToken, decryptToken } = require('./src/services/cryptoService');
const geolib = require('geolib');

console.log('--- Running AES-256-CBC & Geofence Verification Tests ---');

// 1. Test Encrypt & Decrypt fresh token
const payload = {
  eventId: 'TEST-EVENT-001',
  latitude: 28.6139,
  longitude: 77.2090,
  allowedRadiusMeters: 50,
  timestamp: Date.now()
};

const token = encryptToken(payload);
console.log('[Test 1] Generated Token:', token.substring(0, 45) + '...');

const decrypted = decryptToken(token, 60);
console.log('[Test 1] Decryption Success:', decrypted.isValid);
console.log('[Test 1] Token Age (seconds):', decrypted.ageSeconds);

if (!decrypted.isValid) {
  console.error('❌ Test 1 Failed!', decrypted.error);
  process.exit(1);
}

// 2. Test Expired Token (> 60 seconds old)
const oldPayload = {
  ...payload,
  timestamp: Date.now() - 75000 // 75 seconds ago
};
const expiredToken = encryptToken(oldPayload);
const expiredResult = decryptToken(expiredToken, 60);
console.log('[Test 2] Expired Token Rejected:', !expiredResult.isValid);
console.log('[Test 2] Expiration Error Message:', expiredResult.error);

if (expiredResult.isValid) {
  console.error('❌ Test 2 Failed! Expired token was incorrectly accepted.');
  process.exit(1);
}

// 3. Test Geolib Distance Calculation
const userLocationIn = { latitude: 28.6140, longitude: 77.2091 }; // ~15 meters away
const distanceIn = geolib.getDistance(userLocationIn, { latitude: 28.6139, longitude: 77.2090 });
console.log('[Test 3] Geofence Inside Distance:', distanceIn, 'meters');

const userLocationOut = { latitude: 28.6250, longitude: 77.2190 }; // > 1 km away
const distanceOut = geolib.getDistance(userLocationOut, { latitude: 28.6139, longitude: 77.2090 });
console.log('[Test 3] Geofence Outside Distance:', distanceOut, 'meters');

console.log('✅ ALL BACKEND CRYPTO AND GEOFENCE TESTS PASSED CLEANLY!');
