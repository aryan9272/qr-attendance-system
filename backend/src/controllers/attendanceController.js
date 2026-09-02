const geolib = require('geolib');
const Attendance = require('../models/Attendance');
const Event = require('../models/Event');
const { decryptToken } = require('../services/cryptoService');
const { activeSessions, startSession, pauseSession } = require('../services/socketService');

const DEFAULT_TARGET = {
  latitude: 28.6139,
  longitude: 77.2090,
  allowedRadiusMeters: 50,
};

const inMemoryAttendanceStore = [];
const customEventsStore = new Map();

/**
 * Handles student attendance verification request (Scan -> Authenticate -> Fill Details -> Submit)
 * Endpoint: POST /api/attendance/verify
 */
exports.verifyAttendance = async (req, res) => {
  try {
    const {
      token,
      studentId,
      studentName,
      email,
      regNo,
      year,
      branch,
      mobileNumber,
      customData,
      userLocation,
      eventId = 'CS101-LECTURE',
    } = req.body;

    if (!token || !userLocation || !userLocation.latitude || !userLocation.longitude) {
      return res.status(400).json({
        success: false,
        errorType: 'MISSING_PARAMETERS',
        error: 'Missing required parameters: token, userLocation (latitude, longitude) are mandatory.',
      });
    }

    // Universal Email Check (Allows any valid Google Account Domain)
    if (email) {
      const cleanEmail = email.trim().toLowerCase();
      if (!cleanEmail.includes('@') || cleanEmail.length < 5) {
        return res.status(400).json({
          success: false,
          errorType: 'INVALID_EMAIL_FORMAT',
          error: `Invalid email address format: "${cleanEmail}".`,
        });
      }
    }

    const socketSession = activeSessions.get(eventId);
    let dbEvent = await Event.findOne({ eventId }).catch(() => null);

    const isSessionActive = socketSession
      ? socketSession.status === 'active'
      : (dbEvent && dbEvent.status === 'active');

    if (!isSessionActive) {
      return res.status(403).json({
        success: false,
        errorType: 'SESSION_PAUSED',
        error: 'Session is currently paused by the faculty instructor. Submissions are temporarily blocked.',
      });
    }

    const requireMobile = socketSession?.customFields?.requireMobileNumber || dbEvent?.customFields?.requireMobileNumber;
    if (requireMobile && (!mobileNumber || !mobileNumber.trim())) {
      return res.status(400).json({
        success: false,
        errorType: 'MISSING_CUSTOM_FIELD',
        error: 'Mobile Number is required for this session.',
      });
    }

    const decryptionResult = decryptToken(token, 60);

    if (!decryptionResult.isValid) {
      return res.status(400).json({
        success: false,
        errorType: 'EXPIRED_OR_INVALID_TOKEN',
        error: decryptionResult.error,
        ageSeconds: decryptionResult.ageSeconds,
      });
    }

    const { payload } = decryptionResult;

    const targetCoords = {
      latitude: payload.latitude || dbEvent?.latitude || DEFAULT_TARGET.latitude,
      longitude: payload.longitude || dbEvent?.longitude || DEFAULT_TARGET.longitude,
    };

    const maxRadiusMeters = payload.allowedRadiusMeters || dbEvent?.allowedRadiusMeters || DEFAULT_TARGET.allowedRadiusMeters;

    const studentCoords = {
      latitude: Number(userLocation.latitude),
      longitude: Number(userLocation.longitude),
    };

    const distanceFromTarget = geolib.getDistance(studentCoords, targetCoords);
    const isWithinGeofence = distanceFromTarget <= maxRadiusMeters;

    const userId = (regNo || studentId || email || 'UNKNOWN_STUDENT').trim();
    const displayName = (studentName || 'Student').trim();

    if (!isWithinGeofence) {
      return res.status(403).json({
        success: false,
        errorType: 'GEOFENCE_VIOLATION',
        error: `Geofence check failed! You are ${distanceFromTarget} meters away from target classroom coordinates (Maximum allowed radius is ${maxRadiusMeters} meters).`,
        distanceFromTargetMeters: distanceFromTarget,
        allowedRadiusMeters: maxRadiusMeters,
        userLocation: studentCoords,
        targetLocation: targetCoords,
      });
    }

    const attendanceRecord = {
      user: userId,
      userName: displayName,
      email: email || '',
      regNo: regNo || userId,
      year: year || '',
      branch: branch || '',
      mobileNumber: mobileNumber || '',
      customData: customData || {},
      event: eventId,
      location: studentCoords,
      distanceFromTargetMeters: distanceFromTarget,
      status: 'VERIFIED',
      timestamp: new Date(),
    };

    try {
      const newAttendance = new Attendance(attendanceRecord);
      await newAttendance.save();
    } catch (dbErr) {
      if (dbErr.code === 11000) {
        return res.status(409).json({
          success: false,
          errorType: 'DUPLICATE_ENTRY',
          error: `Attendance already marked! Student ID "${userId}" has already submitted attendance for event "${eventId}".`,
        });
      }
      
      const duplicateInMemory = inMemoryAttendanceStore.find(
        (rec) => rec.user === userId && rec.event === eventId
      );
      if (duplicateInMemory) {
        return res.status(409).json({
          success: false,
          errorType: 'DUPLICATE_ENTRY',
          error: `Attendance already marked! Student ID "${userId}" has already submitted attendance for event "${eventId}".`,
        });
      }
      inMemoryAttendanceStore.push(attendanceRecord);
    }

    if (req.io) {
      req.io.to(`event:${eventId}`).emit('attendance-marked', {
        eventId,
        attendance: attendanceRecord,
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Attendance successfully verified and recorded!',
      details: {
        eventId,
        userId,
        studentName: displayName,
        email: email || '',
        regNo: regNo || userId,
        year: year || '',
        branch: branch || '',
        mobileNumber: mobileNumber || '',
        distanceFromTargetMeters: distanceFromTarget,
        allowedRadiusMeters: maxRadiusMeters,
        timestamp: attendanceRecord.timestamp,
        tokenAgeSeconds: decryptionResult.ageSeconds,
      },
    });
  } catch (err) {
    console.error('Verify Attendance Exception:', err);
    return res.status(500).json({
      success: false,
      errorType: 'SERVER_ERROR',
      error: `An error occurred during verification: ${err.message}`,
    });
  }
};

/**
 * Faculty Start Session
 * Endpoint: POST /api/attendance/events/start
 */
exports.startSession = async (req, res) => {
  try {
    const { eventId } = req.body;
    if (!eventId) {
      return res.status(400).json({ success: false, error: 'eventId is required' });
    }

    const targetId = eventId.trim().toUpperCase();

    await Event.findOneAndUpdate(
      { eventId: targetId },
      { status: 'active', isEnded: false }
    ).catch(() => null);

    startSession(req.io, targetId);

    return res.status(200).json({
      success: true,
      message: `Session "${targetId}" started successfully!`,
      eventId: targetId,
      status: 'active',
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: `Failed to start session: ${err.message}`,
    });
  }
};

/**
 * Faculty Stop / Pause Session
 * Endpoint: POST /api/attendance/events/end
 */
exports.endSession = async (req, res) => {
  try {
    const { eventId } = req.body;
    if (!eventId) {
      return res.status(400).json({ success: false, error: 'eventId is required' });
    }

    const targetId = eventId.trim().toUpperCase();

    await Event.findOneAndUpdate(
      { eventId: targetId },
      { status: 'paused', isEnded: true }
    ).catch(() => null);

    pauseSession(req.io, targetId);

    return res.status(200).json({
      success: true,
      message: `Session "${targetId}" has been paused.`,
      eventId: targetId,
      status: 'paused',
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: `Failed to pause session: ${err.message}`,
    });
  }
};

/**
 * Faculty Create New Session
 * Endpoint: POST /api/attendance/events/create
 */
exports.createEvent = async (req, res) => {
  try {
    const {
      eventId,
      title,
      description,
      facultyName,
      latitude = DEFAULT_TARGET.latitude,
      longitude = DEFAULT_TARGET.longitude,
      allowedRadiusMeters = 50,
      customFields = { requireMobileNumber: false },
    } = req.body;

    if (!eventId || !title) {
      return res.status(400).json({
        success: false,
        error: 'eventId and title are required fields.',
      });
    }

    const eventData = {
      eventId: eventId.trim().toUpperCase(),
      title: title.trim(),
      description: description || '',
      facultyName: facultyName || 'Faculty Instructor',
      latitude: Number(latitude),
      longitude: Number(longitude),
      allowedRadiusMeters: Number(allowedRadiusMeters),
      status: 'paused',
      isEnded: true,
      customFields: {
        requireMobileNumber: Boolean(customFields?.requireMobileNumber),
      },
    };

    try {
      const newEvent = new Event(eventData);
      await newEvent.save();
    } catch (dbErr) {
      customEventsStore.set(eventData.eventId, eventData);
    }

    activeSessions.set(eventData.eventId, {
      ...eventData,
      eventName: eventData.title,
      tokenValiditySeconds: 60,
      currentCountdown: 60,
      currentToken: null,
      qrUrl: null,
      tokenCreatedAt: Date.now(),
    });

    return res.status(201).json({
      success: true,
      message: 'New faculty session created successfully!',
      event: eventData,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: `Failed to create session: ${err.message}`,
    });
  }
};

/**
 * Requirement 3: Faculty Edit / Update Session Metadata
 * Endpoint: PUT /api/attendance/events/:id
 */
exports.updateEvent = async (req, res) => {
  try {
    const { id } = req.params;
    const { title, facultyName, customFields } = req.body;

    if (!id) {
      return res.status(400).json({ success: false, error: 'Session Event ID is required.' });
    }

    const targetId = id.trim().toUpperCase();

    const updateFields = {};
    if (title) updateFields.title = title.trim();
    if (facultyName) updateFields.facultyName = facultyName.trim();
    if (customFields) {
      updateFields.customFields = {
        requireMobileNumber: Boolean(customFields.requireMobileNumber),
      };
    }

    let updatedEvent = await Event.findOneAndUpdate(
      { eventId: targetId },
      { $set: updateFields },
      { new: true }
    ).catch(() => null);

    if (!updatedEvent) {
      let memoryEvent = customEventsStore.get(targetId) || { eventId: targetId };
      memoryEvent = { ...memoryEvent, ...updateFields };
      customEventsStore.set(targetId, memoryEvent);
      updatedEvent = memoryEvent;
    }

    // Update active socket session state
    const socketSession = activeSessions.get(targetId);
    if (socketSession) {
      if (title) socketSession.eventName = title.trim();
      if (customFields) socketSession.customFields = updateFields.customFields;
    }

    return res.status(200).json({
      success: true,
      message: `Session "${targetId}" updated successfully!`,
      event: updatedEvent,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: `Failed to update session: ${err.message}`,
    });
  }
};

/**
 * Requirement 3: Faculty Delete / Purge Session
 * Endpoint: DELETE /api/attendance/events/:id
 */
exports.deleteEvent = async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) {
      return res.status(400).json({ success: false, error: 'Session Event ID is required.' });
    }

    const targetId = id.trim().toUpperCase();

    // Purge from MongoDB
    await Event.deleteOne({ eventId: targetId }).catch(() => null);

    // Purge from in-memory maps & socket session map
    customEventsStore.delete(targetId);
    activeSessions.delete(targetId);

    return res.status(200).json({
      success: true,
      message: `Session "${targetId}" deleted successfully.`,
      eventId: targetId,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: `Failed to delete session: ${err.message}`,
    });
  }
};

/**
 * Fetch available events
 * Endpoint: GET /api/attendance/events
 */
exports.getEvents = async (req, res) => {
  try {
    let events = await Event.find().sort({ createdAt: -1 }).catch(() => []);
    if (!events || events.length === 0) {
      events = [
        {
          eventId: 'CS101-LECTURE',
          title: 'CS101: Data Structures & Algorithms',
          latitude: DEFAULT_TARGET.latitude,
          longitude: DEFAULT_TARGET.longitude,
          allowedRadiusMeters: DEFAULT_TARGET.allowedRadiusMeters,
          status: 'paused',
          isEnded: true,
          customFields: { requireMobileNumber: false },
        },
        ...Array.from(customEventsStore.values()),
      ];
    }
    return res.status(200).json({ success: true, events });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
};

/**
 * Fetch session stats & recent verifications
 * Endpoint: GET /api/attendance/stats/:eventId
 */
exports.getAttendanceStats = async (req, res) => {
  try {
    const { eventId } = req.params;

    let dbRecords = await Attendance.find({ event: eventId, status: 'VERIFIED' })
      .sort({ timestamp: -1 })
      .catch(() => []);

    if (!dbRecords || dbRecords.length === 0) {
      dbRecords = inMemoryAttendanceStore.filter(
        (rec) => rec.event === eventId && rec.status === 'VERIFIED'
      );
    }

    return res.status(200).json({
      success: true,
      stats: {
        eventId,
        count: dbRecords.length,
        recent: dbRecords,
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
};
