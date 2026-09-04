const { verifyJwt } = require('../services/adminAuthService');

/**
 * Middleware to verify Admin JWT from HttpOnly cookie, Authorization header, or x-admin-token header
 */
async function verifyAdminToken(req, res, next) {
  try {
    let token = null;

    // 1. Check HttpOnly cookie
    if (req.cookies && req.cookies.admin_session) {
      token = req.cookies.admin_session;
    }

    // 2. Check Authorization Header (Bearer <token>)
    if (!token && req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
      token = req.headers.authorization.split(' ')[1];
    }

    // 3. Check x-admin-token / x-faculty-token Header
    if (!token && req.headers['x-admin-token']) {
      token = req.headers['x-admin-token'];
    }
    if (!token && req.headers['x-faculty-token']) {
      token = req.headers['x-faculty-token'];
    }

    if (!token || token === 'null' || token === 'undefined') {
      return res.status(401).json({
        success: false,
        error: 'UNAUTHORIZED_ACCESS',
        message: 'Admin authentication required. Please log in to access the Admin Console.',
      });
    }

    const { decoded, admin } = await verifyJwt(token);

    req.admin = admin;
    req.adminSession = decoded;
    next();
  } catch (err) {
    return res.status(401).json({
      success: false,
      error: 'INVALID_SESSION',
      message: err.message || 'Session expired or invalidated. Please log in again.',
    });
  }
}

module.exports = {
  verifyAdminToken,
  verifyFacultyToken: verifyAdminToken, // Backward compatibility alias
};
