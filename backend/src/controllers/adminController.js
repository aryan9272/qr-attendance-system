const {
  verifyMasterPassword,
  updateMasterPassword,
  incrementTokenVersion,
  requestProctorOtp,
  verifyProctorOtp,
  generateAdminJwt,
} = require('../services/adminAuthService');
const Event = require('../models/Event');

/**
 * Mode 1: Master Password Login
 */
exports.loginMaster = async (req, res) => {
  try {
    const { password } = req.body;

    if (!password) {
      return res.status(400).json({ success: false, message: 'Master Admin password is required.' });
    }

    const admin = await verifyMasterPassword(password);
    if (!admin) {
      return res.status(401).json({ success: false, message: 'Invalid Master Password. Access Denied.' });
    }

    const { token, payload, expiresIn } = generateAdminJwt(admin, false);

    // Set HttpOnly, Secure, SameSite=Strict cookie
    res.cookie('admin_session', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    return res.json({
      success: true,
      message: 'Master Admin authentication successful.',
      token,
      admin: {
        email: admin.email,
        mode: 'MASTER_ADMIN',
        tokenVersion: admin.tokenVersion,
      },
      expiresIn,
    });
  } catch (err) {
    console.error('[AdminController] Master Login Error:', err);
    return res.status(500).json({ success: false, message: err.message || 'Server error during login.' });
  }
};

/**
 * Mode 2: Request Delegated Proctor OTP (Brevo SMTP)
 */
exports.requestOtp = async (req, res) => {
  try {
    const result = await requestProctorOtp();
    return res.json({
      success: true,
      message: result.message,
    });
  } catch (err) {
    console.warn('[AdminController] OTP Request Warning:', err.message);
    return res.status(400).json({
      success: false,
      message: err.message || 'Failed to dispatch Proctor OTP.',
    });
  }
};

/**
 * Mode 2: Verify Delegated Proctor OTP
 */
exports.verifyOtp = async (req, res) => {
  try {
    const { otp } = req.body;
    if (!otp) {
      return res.status(400).json({ success: false, message: 'OTP code is required.' });
    }

    const admin = await verifyProctorOtp(otp);
    const { token, payload, expiresIn } = generateAdminJwt(admin, true); // 90-minute OTP JWT

    res.cookie('admin_session', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 90 * 60 * 1000, // 90 minutes
    });

    return res.json({
      success: true,
      message: 'Proctor OTP verification successful. Temporary session granted (90 mins).',
      token,
      admin: {
        email: admin.email,
        mode: 'PROCTOR_OTP',
        isOtp: true,
        tokenVersion: admin.tokenVersion,
        expiresAtMs: payload.expiresAtMs,
      },
      expiresIn,
    });
  } catch (err) {
    return res.status(400).json({ success: false, message: err.message || 'OTP verification failed.' });
  }
};

/**
 * Request OTP to Change Master Password
 */
exports.requestChangePasswordOtp = async (req, res) => {
  try {
    const { requestSecurityOtp } = require('../services/adminAuthService');
    const result = await requestSecurityOtp('CHANGE_PASSWORD');
    return res.json({
      success: true,
      message: result.message,
      isDevConsole: result.isDevConsole,
    });
  } catch (err) {
    return res.status(400).json({ success: false, message: err.message });
  }
};

/**
 * Change Master Password (WITH Email OTP)
 */
exports.changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword, otp } = req.body;
    const { updateMasterPasswordWithOtp, generateAdminJwt } = require('../services/adminAuthService');

    if (!currentPassword || !newPassword || !otp) {
      return res.status(400).json({ success: false, message: 'Current password, new password, and email OTP are required.' });
    }

    const admin = await updateMasterPasswordWithOtp(currentPassword, newPassword, otp);

    const { token } = generateAdminJwt(admin, false);

    res.cookie('admin_session', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    return res.json({
      success: true,
      message: 'Master password updated successfully. All other active sessions have been revoked.',
      token,
    });
  } catch (err) {
    return res.status(400).json({ success: false, message: err.message });
  }
};

/**
 * Request OTP to Reset Master Password (Forgot Password Recovery)
 */
exports.requestResetPasswordOtp = async (req, res) => {
  try {
    const { requestSecurityOtp } = require('../services/adminAuthService');
    const result = await requestSecurityOtp('RESET_PASSWORD');
    return res.json({
      success: true,
      message: result.message,
      isDevConsole: result.isDevConsole,
    });
  } catch (err) {
    return res.status(400).json({ success: false, message: err.message });
  }
};

/**
 * Reset Master Password via Email OTP (Forgot Password Recovery)
 */
exports.resetPasswordWithOtp = async (req, res) => {
  try {
    const { otp, newPassword } = req.body;
    const { resetMasterPasswordWithOtp, generateAdminJwt } = require('../services/adminAuthService');

    if (!otp || !newPassword) {
      return res.status(400).json({ success: false, message: 'Recovery OTP code and new password are required.' });
    }

    const admin = await resetMasterPasswordWithOtp(otp, newPassword);

    const { token } = generateAdminJwt(admin, false);

    res.cookie('admin_session', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    return res.json({
      success: true,
      message: 'Master password reset successfully! All unauthorized sessions revoked.',
      token,
      admin: {
        email: admin.email,
        mode: 'MASTER_ADMIN',
        tokenVersion: admin.tokenVersion,
      },
    });
  } catch (err) {
    return res.status(400).json({ success: false, message: err.message });
  }
};

/**
 * Logout From All Devices (Increments tokenVersion in DB)
 */
exports.logoutAll = async (req, res) => {
  try {
    const newVersion = await incrementTokenVersion();
    res.clearCookie('admin_session');

    return res.json({
      success: true,
      message: `All active sessions revoked successfully. (Token Version: ${newVersion})`,
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * Logout current device
 */
exports.logout = async (req, res) => {
  res.clearCookie('admin_session');
  return res.json({ success: true, message: 'Logged out successfully.' });
};

/**
 * Get Current Admin Profile + Detect unterminated sessions (Crash Guard)
 */
exports.getMe = async (req, res) => {
  try {
    const admin = req.admin;
    const isOtp = req.adminSession?.isOtp || false;

    // Detect any active or paused unterminated sessions for crash recovery banner
    const unterminatedSessions = await Event.find({ status: { $ne: 'TERMINATED' } })
      .sort({ updatedAt: -1 })
      .limit(5);

    return res.json({
      success: true,
      admin: {
        email: admin.email,
        mode: isOtp ? 'PROCTOR_OTP' : 'MASTER_ADMIN',
        isOtp,
        tokenVersion: admin.tokenVersion,
        expiresAtMs: req.adminSession?.expiresAtMs,
      },
      unterminatedSessions,
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};
