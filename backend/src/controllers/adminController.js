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
 * Change Master Password
 */
exports.changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ success: false, message: 'Current and new password are required.' });
    }

    await updateMasterPassword(currentPassword, newPassword);

    // Issue fresh cookie with updated token version
    const admin = req.admin;
    admin.tokenVersion += 1;
    const { token } = generateAdminJwt(admin, false);

    res.cookie('admin_session', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    return res.json({
      success: true,
      message: 'Master password updated successfully. All other sessions invalidated.',
      token,
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
