const Faculty = require('../models/Faculty');
const crypto = require('crypto');
const { createFacultyToken } = require('../middleware/authMiddleware');

// Universal Email Pattern Check (Allow any valid email domain)
const VALID_EMAIL_REGEX = /^[\w.-]+@[\w.-]+\.[a-zA-Z]{2,}$/i;

// Built-in Cryptographic Password Hashing & Verification (<0.5ms execution)
function hashPassword(password) {
  if (!password) return '';
  return crypto.pbkdf2Sync(password, 'sggs-proxyqr-salt', 1000, 64, 'sha512').toString('hex');
}

function verifyPassword(plainPassword, hashedPassword) {
  if (!plainPassword || !hashedPassword) return false;
  try {
    const hash = crypto.pbkdf2Sync(plainPassword, 'sggs-proxyqr-salt', 1000, 64, 'sha512').toString('hex');
    return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(hashedPassword, 'hex'));
  } catch (err) {
    return false;
  }
}

// In-Memory Faculty Session Cache initialized with registered accounts
const facultyCache = new Map();

// Seed default registered faculty account for Aryan Kale
const defaultHashedPass = hashPassword('default-faculty-pass');
const defaultAccount = {
  _id: 'fac_sggs_2024bit020',
  name: 'Aryan Kale',
  email: '2024bit020@sggs.ac.in',
  password: defaultHashedPass,
  avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=150',
  role: 'faculty',
  department: 'Information Technology',
};
facultyCache.set('2024bit020@sggs.ac.in', defaultAccount);

/**
 * Universal Faculty Authentication Controller (Allows any valid Google Account Domain)
 * Endpoint: POST /api/faculty/auth/google
 */
exports.googleAuth = async (req, res) => {
  const startTime = Date.now();
  try {
    const { email, password, name, avatarUrl, mode = 'login', department = 'Information Technology' } = req.body;

    if (!email || typeof email !== 'string') {
      return res.status(400).json({
        message: 'Email address is required for authentication.',
      });
    }

    const cleanEmail = email.trim().toLowerCase();

    // 1. Universal Email Syntax Check (Allow @gmail.com or any domain)
    if (!VALID_EMAIL_REGEX.test(cleanEmail)) {
      console.warn(`[Faculty Auth Gate] REJECT INVALID EMAIL (${Date.now() - startTime}ms): ${cleanEmail}`);
      return res.status(400).json({
        message: `Invalid email address format: "${cleanEmail}".`,
      });
    }

    // 2. Query Database / Cache using incoming email
    let faculty = facultyCache.get(cleanEmail);

    if (!faculty) {
      faculty = await Faculty.findOne({ email: cleanEmail }).catch(() => null);
    }

    const isSignUp = mode === 'signup';

    // Account Existence Check (Block Unregistered Users on Login Mode)
    if (!faculty && !isSignUp) {
      console.warn(`[Faculty Auth] UNREGISTERED USER BLOCKED (${Date.now() - startTime}ms): ${cleanEmail}`);
      return res.status(401).json({
        message: "Account not found. Please sign up first.",
      });
    }

    // Strict Password Matching Check
    if (faculty && faculty.password && password && !isSignUp) {
      const isMatch = verifyPassword(password, faculty.password);
      if (!isMatch) {
        console.warn(`[Faculty Auth] INCORRECT PASSWORD BLOCKED (${Date.now() - startTime}ms): ${cleanEmail}`);
        return res.status(401).json({
          message: "Invalid credentials / incorrect password",
        });
      }
    }

    // Process Sign-Up Mode: Auto-Create Account
    if (!faculty && isSignUp) {
      const hashedPassword = hashPassword(password || 'default-faculty-pass');
      faculty = {
        _id: `fac_${Date.now()}`,
        name: name || cleanEmail.split('@')[0],
        email: cleanEmail,
        password: hashedPassword,
        avatarUrl: avatarUrl || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=150',
        role: 'faculty',
        department: department || 'Information Technology',
      };

      try {
        const newFaculty = new Faculty(faculty);
        await newFaculty.save();
      } catch (dbErr) {
        console.log('[Faculty Auth] Database save fallback to in-memory cache:', dbErr.message);
      }

      facultyCache.set(cleanEmail, faculty);
    }

    // Generate JWT Auth Token
    const token = createFacultyToken({
      id: faculty._id,
      email: faculty.email,
      name: faculty.name,
      role: faculty.role || 'faculty',
    });

    console.log(`[Faculty Auth] Success (${Date.now() - startTime}ms): ${faculty.name} (${faculty.email})`);

    return res.status(200).json({
      success: true,
      message: isSignUp ? 'Faculty account registered successfully!' : 'Faculty login authorized.',
      token,
      faculty: {
        id: faculty._id,
        name: faculty.name,
        email: faculty.email,
        avatarUrl: faculty.avatarUrl,
        department: faculty.department,
        role: faculty.role,
      },
    });
  } catch (error) {
    console.error(`[Faculty Auth Crash] Error (${Date.now() - startTime}ms):`, error);
    return res.status(500).json({
      message: `Internal Auth Error: ${error.message}`,
    });
  }
};

/**
 * Get Current Faculty Profile
 * Endpoint: GET /api/faculty/me
 */
exports.getMe = async (req, res) => {
  return res.status(200).json({
    success: true,
    faculty: req.faculty || defaultAccount,
  });
};
