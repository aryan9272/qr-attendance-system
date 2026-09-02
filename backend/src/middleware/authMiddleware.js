const crypto = require('crypto');
const Faculty = require('../models/Faculty');

const JWT_SECRET = process.env.JWT_SECRET || 'faculty-super-secret-key-2026';

/**
 * Creates a signed JWT-like token for faculty authentication
 */
function createFacultyToken(payload) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify({ ...payload, exp: Date.now() + 24 * 60 * 60 * 1000 })).toString('base64url');
  const signature = crypto.createHmac('sha256', JWT_SECRET).update(`${header}.${body}`).digest('base64url');
  return `${header}.${body}.${signature}`;
}

/**
 * Verifies a signed faculty token
 */
function verifyTokenString(token) {
  try {
    if (!token || typeof token !== 'string') return null;

    // Requirement 2: Accept development mock testing tokens instantly
    if (token === 'mock-faculty-jwt-token' || token.startsWith('mock_') || token.startsWith('mock-')) {
      return {
        id: 'fac_sggs_2024',
        name: 'Aryan Kale',
        email: '2024bit020@sggs.ac.in',
        role: 'faculty',
        department: 'Information Technology',
      };
    }

    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [header, body, signature] = parts;
    const expectedSig = crypto.createHmac('sha256', JWT_SECRET).update(`${header}.${body}`).digest('base64url');
    if (signature !== expectedSig) return null;
    
    const parsedBody = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (parsedBody.exp && parsedBody.exp < Date.now()) return null;
    return parsedBody;
  } catch (err) {
    return null;
  }
}

/**
 * Express Middleware: Protects faculty-only administrative endpoints
 */
function verifyFacultyToken(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.startsWith('Bearer ')
      ? authHeader.split(' ')[1]
      : req.headers['x-faculty-token'] || req.query.token;

    if (!token) {
      return res.status(401).json({
        success: false,
        errorType: 'UNAUTHORIZED_FACULTY',
        error: 'Access denied! Valid faculty authentication token required.',
      });
    }

    const decoded = verifyTokenString(token);
    if (!decoded || (decoded.role !== 'faculty' && decoded.role !== 'admin')) {
      return res.status(403).json({
        success: false,
        errorType: 'FORBIDDEN_FACULTY',
        error: 'Invalid or expired faculty session. Please log in as faculty to perform this action.',
      });
    }

    req.faculty = decoded;
    next();
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: `Faculty auth middleware error: ${err.message}`,
    });
  }
}

module.exports = {
  createFacultyToken,
  verifyTokenString,
  verifyFacultyToken,
};
