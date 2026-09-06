const express = require('express');
const router = express.Router();
const attendanceController = require('../controllers/attendanceController');
const { verifyAdminToken } = require('../middleware/authMiddleware');

// Public Student & Session Status Endpoints
router.post('/verify', attendanceController.verifyAttendance);
router.get('/events', attendanceController.getEvents);
router.get('/sessions/active', attendanceController.getActiveSession);
router.get('/session/active', attendanceController.getActiveSession);
router.get('/sessions/current', attendanceController.getActiveSession);
router.get('/session/current', attendanceController.getActiveSession);
router.get('/events/active', attendanceController.getActiveSession);
router.get('/events/current', attendanceController.getActiveSession);

// Protected Admin Administrative Endpoints
router.post('/sessions/create', verifyAdminToken, attendanceController.createSession);
router.post('/sessions/start', verifyAdminToken, attendanceController.startSession);
router.post('/sessions/pause', verifyAdminToken, attendanceController.pauseSession);
router.post('/sessions/terminate', verifyAdminToken, attendanceController.terminateSession);
router.post('/sessions/end', verifyAdminToken, attendanceController.terminateSession);
router.post('/sessions/:id/end', verifyAdminToken, attendanceController.terminateSession);
router.post('/sessions/:id/terminate', verifyAdminToken, attendanceController.terminateSession);
router.patch('/sessions/:id/end', verifyAdminToken, attendanceController.terminateSession);
router.patch('/sessions/:id/terminate', verifyAdminToken, attendanceController.terminateSession);
router.get('/sessions/history', verifyAdminToken, attendanceController.getSessionHistory);

// Roster Management & Overrides
router.patch('/attendee/:id', verifyAdminToken, attendanceController.updateAttendee);
router.post('/manual-intake', verifyAdminToken, attendanceController.manualIntake);
router.get('/stats/:eventId', verifyAdminToken, attendanceController.getAttendanceStats);

// Legacy aliases for backward compatibility
router.post('/events/start', verifyAdminToken, attendanceController.startSession);
router.post('/events/create', verifyAdminToken, attendanceController.createSession);
router.post('/events/end', verifyAdminToken, attendanceController.terminateSession);
router.post('/events/:id/end', verifyAdminToken, attendanceController.terminateSession);

module.exports = router;
