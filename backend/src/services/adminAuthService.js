const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Admin = require('../models/Admin');
const { sendProctorOtpEmail, sendSecurityOtpEmail } = require('./mailer');

const JWT_SECRET = process.env.JWT_SECRET || 'proxyqr-super-secret-jwt-key-2026';
const DEFAULT_MASTER_PASS = '2024BIT020@2026';

const DATA_DIR = path.join(__dirname, '../../data');
const ADMIN_STORE_FILE = path.join(DATA_DIR, 'admin_store.json');

function ensureDataDir() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
  } catch (e) {}
}

function loadAdminFromDisk() {
  ensureDataDir();
  try {
    if (!fs.existsSync(ADMIN_STORE_FILE)) return null;
    const raw = fs.readFileSync(ADMIN_STORE_FILE, 'utf8');
    const data = JSON.parse(raw);
    if (data && data.passwordHash) return data;
  } catch (e) {
    console.warn('[AdminAuth] Error reading admin_store.json:', e.message);
  }
  return null;
}

function saveAdminToDisk(data) {
  ensureDataDir();
  try {
    const payload = {
      email: (data.email || 'voyager9579@gmail.com').toLowerCase().trim(),
      passwordHash: data.passwordHash,
      tokenVersion: typeof data.tokenVersion === 'number' ? data.tokenVersion : 0,
      updatedAt: data.updatedAt || new Date().toISOString(),
    };
    fs.writeFileSync(ADMIN_STORE_FILE, JSON.stringify(payload, null, 2), 'utf8');
    return true;
  } catch (e) {
    console.error('[AdminAuth] Error writing admin_store.json:', e.message);
    return false;
  }
}

// In-Memory OTP Store with Rate-Limiting Sentinel
// Key: 'owner_otp' -> { code, type, expiresAt, attempts, requests: [timestamps], lockedUntil }
const otpStore = {
  code: null,
  type: null,
  expiresAt: 0,
  failedAttempts: 0,
  lockedUntil: 0,
  requestTimestamps: [],
};

const { getIsConnected } = require('../config/db');

// In-Memory Admin Fallback Store (Backed by admin_store.json disk persistence)
const inMemoryAdmin = {
  _id: 'in-memory-admin-id',
  email: (process.env.ADMIN_OWNER_EMAIL || 'voyager9579@gmail.com').toLowerCase().trim(),
  passwordHash: '',
  tokenVersion: 0,
  save: async function () {
    saveAdminToDisk({
      email: this.email,
      passwordHash: this.passwordHash,
      tokenVersion: this.tokenVersion,
      updatedAt: new Date().toISOString(),
    });
    return this;
  },
};

/**
 * Ensure single Admin document exists in DB with hashed password (or disk-persisted fallback)
 */
async function getOrInitAdmin() {
  const ownerEmail = (process.env.ADMIN_OWNER_EMAIL || 'voyager9579@gmail.com').toLowerCase().trim();

  // 1. Try loading from persistent disk storage first
  const diskData = loadAdminFromDisk();
  if (diskData && diskData.passwordHash) {
    inMemoryAdmin.email = diskData.email || ownerEmail;
    inMemoryAdmin.passwordHash = diskData.passwordHash;
    inMemoryAdmin.tokenVersion = typeof diskData.tokenVersion === 'number' ? diskData.tokenVersion : 0;
  } else if (!inMemoryAdmin.passwordHash) {
    const salt = await bcrypt.genSalt(10);
    inMemoryAdmin.passwordHash = await bcrypt.hash(process.env.ADMIN_PASSWORD_INIT || DEFAULT_MASTER_PASS, salt);
    saveAdminToDisk({
      email: ownerEmail,
      passwordHash: inMemoryAdmin.passwordHash,
      tokenVersion: inMemoryAdmin.tokenVersion,
      updatedAt: new Date().toISOString(),
    });
  }

  if (!getIsConnected()) {
    return inMemoryAdmin;
  }

  try {
    let admin = await Admin.findOne({ email: ownerEmail });

    if (!admin) {
      // Check if any admin exists
      admin = await Admin.findOne();
    }

    if (!admin) {
      admin = await Admin.create({
        email: ownerEmail,
        passwordHash: inMemoryAdmin.passwordHash,
        tokenVersion: inMemoryAdmin.tokenVersion || 0,
      });
      console.log(`[Admin Security] Created initial Master Admin account for: ${ownerEmail}`);
    } else {
      // Keep DB and Disk synchronized
      if (diskData && diskData.updatedAt && (!admin.updatedAt || new Date(diskData.updatedAt) > new Date(admin.updatedAt))) {
        admin.passwordHash = diskData.passwordHash;
        admin.tokenVersion = diskData.tokenVersion || 0;
        await admin.save();
      } else if (admin.passwordHash && admin.passwordHash !== inMemoryAdmin.passwordHash) {
        inMemoryAdmin.passwordHash = admin.passwordHash;
        inMemoryAdmin.tokenVersion = admin.tokenVersion || 0;
        saveAdminToDisk({
          email: admin.email,
          passwordHash: admin.passwordHash,
          tokenVersion: admin.tokenVersion || 0,
          updatedAt: admin.updatedAt ? admin.updatedAt.toISOString() : new Date().toISOString(),
        });
      }
    }

    return admin;
  } catch (err) {
    console.warn('[Admin Auth] MongoDB query error, falling back to disk/in-memory admin:', err.message);
    return inMemoryAdmin;
  }
}

/**
 * Verify Master Password
 */
async function verifyMasterPassword(passwordInput) {
  const admin = await getOrInitAdmin();
  
  // Also check environment bcrypt hash if provided directly in ADMIN_PASSWORD_HASH
  if (process.env.ADMIN_PASSWORD_HASH && process.env.ADMIN_PASSWORD_HASH.startsWith('$2')) {
    const matchEnv = await bcrypt.compare(passwordInput, process.env.ADMIN_PASSWORD_HASH);
    if (matchEnv) return admin;
  }

  const isMatch = await bcrypt.compare(passwordInput, admin.passwordHash);
  if (!isMatch) return null;

  return admin;
}

/**
 * Update Master Password (Direct)
 */
async function updateMasterPassword(currentPassword, newPassword) {
  const admin = await verifyMasterPassword(currentPassword);
  if (!admin) {
    throw new Error('Current master password is incorrect.');
  }

  if (!newPassword || newPassword.length < 8) {
    throw new Error('New master password must be at least 8 characters long.');
  }

  const salt = await bcrypt.genSalt(10);
  const newHash = await bcrypt.hash(newPassword, salt);

  admin.passwordHash = newHash;
  admin.tokenVersion = (typeof admin.tokenVersion === 'number' ? admin.tokenVersion : 0) + 1; // Invalidate all active sessions
  await admin.save();

  // Persist directly to disk store so restarts never revert to default password
  saveAdminToDisk({
    email: admin.email,
    passwordHash: newHash,
    tokenVersion: admin.tokenVersion,
    updatedAt: new Date().toISOString(),
  });
  inMemoryAdmin.passwordHash = newHash;
  inMemoryAdmin.tokenVersion = admin.tokenVersion;

  return admin;
}

/**
 * Request Security OTP (CHANGE_PASSWORD | RESET_PASSWORD | PROCTOR_ACCESS)
 */
async function requestSecurityOtp(type = 'CHANGE_PASSWORD') {
  const now = Date.now();

  // Check 30-minute Lockout
  if (otpStore.lockedUntil > now) {
    const remainingMins = Math.ceil((otpStore.lockedUntil - now) / 60000);
    throw new Error(`OTP verification is temporarily locked due to failed attempts. Try again in ${remainingMins} minutes.`);
  }

  // Rate Limiting: Max 3 OTP requests per 15-minute window
  otpStore.requestTimestamps = otpStore.requestTimestamps.filter((ts) => now - ts < 15 * 60 * 1000);
  if (otpStore.requestTimestamps.length >= 3) {
    throw new Error('Too many OTP requests. Maximum 3 requests allowed per 15 minutes.');
  }

  // Generate Cryptographically Secure 6-Digit Numeric OTP
  const numericOtp = crypto.randomInt(100000, 999999).toString();

  otpStore.code = numericOtp;
  otpStore.type = type;
  otpStore.expiresAt = now + 5 * 60 * 1000; // 5 Minutes Expiry
  otpStore.failedAttempts = 0;
  otpStore.requestTimestamps.push(now);

  // Dispatch Email via SMTP or Console Fallback
  const mailResult = await sendSecurityOtpEmail(numericOtp, type);

  const isDevConsole = !!mailResult.isDevConsole;
  const devMode = !!mailResult.devMode || isDevConsole;
  const msg = mailResult.message || 'OTP sent successfully to your email. Please check your inbox and spam folder.';

  return { success: true, message: msg, isDevConsole: false, devMode: false };
}

/**
 * Verify Security OTP
 */
function verifySecurityOtpInternal(otpInput, expectedType = null) {
  const now = Date.now();

  if (otpStore.lockedUntil > now) {
    const remainingMins = Math.ceil((otpStore.lockedUntil - now) / 60000);
    throw new Error(`OTP verification is locked. Try again in ${remainingMins} minutes.`);
  }

  if (!otpStore.code || otpStore.expiresAt < now) {
    throw new Error('OTP has expired or has not been requested. Please request a new OTP code.');
  }

  if (expectedType && otpStore.type !== expectedType) {
    throw new Error('Invalid OTP request context. Please request a new OTP code.');
  }

  if (otpInput.trim() !== otpStore.code) {
    otpStore.failedAttempts += 1;
    if (otpStore.failedAttempts >= 5) {
      otpStore.lockedUntil = now + 30 * 60 * 1000; // 30 Minute Lockout
      otpStore.code = null;
      throw new Error('Maximum failed attempts reached. OTP verification locked for 30 minutes.');
    }
    throw new Error(`Invalid 6-digit OTP code. ${5 - otpStore.failedAttempts} attempt(s) remaining.`);
  }

  // Single-Use: Invalidate OTP immediately upon success
  otpStore.code = null;
  otpStore.type = null;
  otpStore.expiresAt = 0;
  otpStore.failedAttempts = 0;
}

/**
 * Update Master Password WITH Required Email OTP
 */
async function updateMasterPasswordWithOtp(currentPassword, newPassword, otpInput) {
  // 1. Verify Current Password
  const admin = await verifyMasterPassword(currentPassword);
  if (!admin) {
    throw new Error('Current master password is incorrect.');
  }

  // 2. Verify Email OTP
  if (!otpInput) {
    throw new Error('Security OTP code is required to change password.');
  }
  verifySecurityOtpInternal(otpInput, 'CHANGE_PASSWORD');

  if (!newPassword || newPassword.length < 8) {
    throw new Error('New master password must be at least 8 characters long.');
  }

  const salt = await bcrypt.genSalt(10);
  const newHash = await bcrypt.hash(newPassword, salt);

  admin.passwordHash = newHash;
  admin.tokenVersion = (typeof admin.tokenVersion === 'number' ? admin.tokenVersion : 0) + 1; // Revokes all active sessions across devices
  await admin.save();

  // Persist directly to disk store so restarts never revert to default password
  saveAdminToDisk({
    email: admin.email,
    passwordHash: newHash,
    tokenVersion: admin.tokenVersion,
    updatedAt: new Date().toISOString(),
  });
  inMemoryAdmin.passwordHash = newHash;
  inMemoryAdmin.tokenVersion = admin.tokenVersion;

  return admin;
}

/**
 * Reset Master Password via Email OTP (Forgot Password Recovery)
 */
async function resetMasterPasswordWithOtp(otpInput, newPassword) {
  if (!otpInput) {
    throw new Error('Recovery OTP code is required.');
  }

  // 1. Verify OTP
  verifySecurityOtpInternal(otpInput, 'RESET_PASSWORD');

  if (!newPassword || newPassword.length < 8) {
    throw new Error('New password must be at least 8 characters long.');
  }

  const admin = await getOrInitAdmin();
  const salt = await bcrypt.genSalt(10);
  const newHash = await bcrypt.hash(newPassword, salt);

  admin.passwordHash = newHash;
  admin.tokenVersion = (typeof admin.tokenVersion === 'number' ? admin.tokenVersion : 0) + 1; // Invalidate all existing sessions
  await admin.save();

  // Persist directly to disk store so restarts never revert to default password
  saveAdminToDisk({
    email: admin.email,
    passwordHash: newHash,
    tokenVersion: admin.tokenVersion,
    updatedAt: new Date().toISOString(),
  });
  inMemoryAdmin.passwordHash = newHash;
  inMemoryAdmin.tokenVersion = admin.tokenVersion;

  return admin;
}

/**
 * Increment token version (Logout All Devices)
 */
async function incrementTokenVersion() {
  const admin = await getOrInitAdmin();
  admin.tokenVersion = (typeof admin.tokenVersion === 'number' ? admin.tokenVersion : 0) + 1;
  await admin.save();

  saveAdminToDisk({
    email: admin.email,
    passwordHash: admin.passwordHash,
    tokenVersion: admin.tokenVersion,
    updatedAt: new Date().toISOString(),
  });
  inMemoryAdmin.tokenVersion = admin.tokenVersion;

  return admin.tokenVersion;
}

/**
 * Request Delegated Proctor OTP
 */
async function requestProctorOtp() {
  return requestSecurityOtp('PROCTOR_ACCESS');
}

/**
 * Verify Delegated Proctor OTP
 */
async function verifyProctorOtp(otpInput) {
  verifySecurityOtpInternal(otpInput, 'PROCTOR_ACCESS');
  const admin = await getOrInitAdmin();
  return admin;
}

/**
 * Sign JWT Payload
 */
function generateAdminJwt(admin, isOtp = false) {
  const expiresIn = isOtp ? '90m' : '7d';
  const expiresAtMs = Date.now() + (isOtp ? 90 * 60 * 1000 : 7 * 24 * 60 * 60 * 1000);

  const payload = {
    adminId: admin._id,
    email: admin.email,
    tokenVersion: admin.tokenVersion,
    isOtp,
    expiresAtMs,
  };

  const token = jwt.sign(payload, JWT_SECRET, { expiresIn });
  return { token, payload, expiresIn };
}

/**
 * Verify Admin JWT
 */
async function verifyJwt(tokenStr) {
  try {
    const decoded = jwt.verify(tokenStr, JWT_SECRET);
    const admin = await getOrInitAdmin();

    if (decoded.tokenVersion === undefined || decoded.tokenVersion !== admin.tokenVersion) {
      throw new Error('Session invalidated by admin. Please log in again.');
    }

    return { decoded, admin };
  } catch (err) {
    throw new Error(err.message || 'Invalid or expired token.');
  }
}

module.exports = {
  getOrInitAdmin,
  verifyMasterPassword,
  updateMasterPassword,
  requestSecurityOtp,
  updateMasterPasswordWithOtp,
  resetMasterPasswordWithOtp,
  incrementTokenVersion,
  requestProctorOtp,
  verifyProctorOtp,
  generateAdminJwt,
  verifyJwt,
  JWT_SECRET,
};

