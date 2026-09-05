const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const attendanceController = require('../controllers/attendanceController');
const { verifyAdminToken } = require('../middleware/authMiddleware');

// Public Admin Auth Routes
router.post('/auth/login', adminController.loginMaster);
router.post('/auth/request-otp', adminController.requestOtp);
router.post('/auth/verify-otp', adminController.verifyOtp);
router.post('/auth/request-reset-otp', adminController.requestResetPasswordOtp);
router.post('/auth/reset-password-with-otp', adminController.resetPasswordWithOtp);

// Protected Admin Auth Routes
router.get('/me', verifyAdminToken, adminController.getMe);
router.post('/auth/request-change-password-otp', verifyAdminToken, adminController.requestChangePasswordOtp);
router.post('/auth/change-password', verifyAdminToken, adminController.changePassword);
router.post('/auth/logout-all', verifyAdminToken, adminController.logoutAll);
router.post('/auth/logout', adminController.logout);

// Protected Session Lifecycle Routes (/api/admin/sessions/*)
router.post('/sessions/create', verifyAdminToken, attendanceController.createSession);
router.post('/sessions/start', verifyAdminToken, attendanceController.startSession);
router.post('/sessions/pause', verifyAdminToken, attendanceController.pauseSession);
router.post('/sessions/terminate', verifyAdminToken, attendanceController.terminateSession);
router.get('/sessions/history', verifyAdminToken, attendanceController.getSessionHistory);

// Protected Roster Management & Overrides (/api/admin/*)
router.patch('/attendee/:id', verifyAdminToken, attendanceController.updateAttendee);
router.post('/manual-intake', verifyAdminToken, attendanceController.manualIntake);
router.get('/stats/:eventId', verifyAdminToken, attendanceController.getAttendanceStats);
router.get('/events', attendanceController.getEvents);

module.exports = router;
