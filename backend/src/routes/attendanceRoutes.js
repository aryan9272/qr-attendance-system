const express = require('express');
const router = express.Router();
const attendanceController = require('../controllers/attendanceController');
const { verifyFacultyToken } = require('../middleware/authMiddleware');

// Public Student Endpoints
router.post('/verify', attendanceController.verifyAttendance);
router.get('/events', attendanceController.getEvents);

// Protected Faculty Administrative Endpoints
router.post('/events/start', verifyFacultyToken, attendanceController.startSession);
router.post('/events/create', verifyFacultyToken, attendanceController.createEvent);
router.post('/events/end', verifyFacultyToken, attendanceController.endSession);
router.put('/events/:id', verifyFacultyToken, attendanceController.updateEvent);
router.delete('/events/:id', verifyFacultyToken, attendanceController.deleteEvent);
router.get('/stats/:eventId', verifyFacultyToken, attendanceController.getAttendanceStats);

module.exports = router;
