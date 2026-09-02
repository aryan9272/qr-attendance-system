const express = require('express');
const router = express.Router();
const facultyController = require('../controllers/facultyController');
const { verifyFacultyToken } = require('../middleware/authMiddleware');

// Google OAuth Verification & Authorization Gate
router.post('/auth/google', facultyController.googleAuth);

// Get Current Faculty Profile (Protected)
router.get('/me', verifyFacultyToken, facultyController.getMe);

module.exports = router;
