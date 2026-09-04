const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const { verifyAdminToken } = require('../middleware/authMiddleware');

// Public Admin Auth Routes
router.post('/auth/login', adminController.loginMaster);
router.post('/auth/request-otp', adminController.requestOtp);
router.post('/auth/verify-otp', adminController.verifyOtp);

// Protected Admin Auth & Session Management Routes
router.get('/me', verifyAdminToken, adminController.getMe);
router.post('/auth/change-password', verifyAdminToken, adminController.changePassword);
router.post('/auth/logout-all', verifyAdminToken, adminController.logoutAll);
router.post('/auth/logout', adminController.logout);

module.exports = router;
