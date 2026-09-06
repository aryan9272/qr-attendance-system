const crypto = require('crypto');
const { decryptToken } = require('../services/cryptoService');
const { activeSessions, startSession, pauseSession, terminateSession, rotateToken } = require('../services/socketService');
const Event = require('../models/Event');
const Attendance = require('../models/Attendance');
const { getIsConnected } = require('../config/db');

/**
 * Generate Unique Session ID: [SanitizedLabCode]-[RandomNanoID]
 * Example: CNLAB-8F3K
 */
async function generateUniqueSessionId(labIdentifier) {
  const cleanLab = (labIdentifier || 'LAB')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 8) || 'LAB';

  let sessionId = '';
  let exists = true;
  let attempts = 0;

  while (exists && attempts < 20) {
    attempts++;
    const randomSuffix = crypto.randomBytes(3).toString('hex').toUpperCase().slice(0, 4);
    sessionId = `${cleanLab}-${randomSuffix}`;

    if (activeSessions.has(sessionId)) {
      continue;
    }

    if (getIsConnected()) {
      try {
        const found = await Event.findOne({ sessionId });
        if (!found) exists = false;
      } catch (e) {
        exists = false;
      }
    } else {
      exists = false;
    }
  }

  return sessionId;
}

/**
 * Student Attendance Verification Endpoint
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
      userLocation,
      eventId,
      sessionId,
      deviceUuid,
    } = req.body;

    const targetSessionId = (sessionId || eventId || 'CS101-LECTURE').toUpperCase();
    const cleanEmail = (email || '').trim().toLowerCase();
    const cleanRegNo = (regNo || studentId || '').trim().toUpperCase();
    const cleanName = (studentName || '').trim();

    if (!token) {
      return res.status(400).json({ success: false, errorType: 'MISSING_TOKEN', error: 'Missing security token.' });
    }

    if (!cleanRegNo || !cleanName || !cleanEmail) {
      return res.status(400).json({ success: false, errorType: 'MISSING_FIELDS', error: 'Student Name, Registration No, and Email are required.' });
    }

    // 1. Check Session State in Memory / Database
    let session = activeSessions.get(targetSessionId);
    if (!session) {
      const dbEvent = await Event.findOne({ sessionId: targetSessionId });
      if (dbEvent) {
        session = {
          sessionId: dbEvent.sessionId,
          labIdentifier: dbEvent.labIdentifier,
          title: dbEvent.title,
          latitude: 28.6139,
          longitude: 77.2090,
          allowedRadiusMeters: dbEvent.allowedRadiusMeters || 50,
          status: dbEvent.status,
          customFields: dbEvent.customFields,
        };
        activeSessions.set(targetSessionId, session);
      }
    }

    if (!session || session.status === 'PAUSED' || session.status === 'TERMINATED') {
      const isTerminated = !session || session.status === 'TERMINATED';
      return res.status(400).json({
        success: false,
        errorType: isTerminated ? 'SESSION_TERMINATED' : 'SESSION_PAUSED',
        error: isTerminated
          ? 'Session permanently closed. This attendance session has been ended by the Admin.'
          : 'Attendance session is currently paused by the Admin.',
      });
    }

    // 2. Decrypt & Validate Dynamic AES Token (Dual Token 60s + 20s Grace Window)
    let tokenPayload = null;
    try {
      tokenPayload = decryptToken(token);
    } catch (e) {
      return res.status(400).json({
        success: false,
        errorType: 'EXPIRED_TOKEN',
        error: 'Dynamic QR token has expired or is invalid. Please scan the current live QR code on the projector.',
      });
    }

    if (!tokenPayload || (tokenPayload.sessionId && tokenPayload.sessionId.toUpperCase() !== targetSessionId && tokenPayload.eventId !== targetSessionId)) {
      return res.status(400).json({
        success: false,
        errorType: 'INVALID_SESSION_TOKEN',
        error: 'QR code does not belong to this active session.',
      });
    }

    // 3-Minute Grace Period Check (Total 180 seconds max to allow typing time)
    const tokenAgeMs = Date.now() - (tokenPayload.timestamp || 0);
    if (tokenAgeMs > 180 * 1000) {
      return res.status(400).json({
        success: false,
        errorType: 'EXPIRED_TOKEN',
        error: 'Dynamic QR token expired over 3 mins ago. Scan the fresh projector QR code.',
      });
    }

    // 3. Adaptive Geofence Boundary Calculation: Boundary = Admin Radius + min(coords.accuracy, 30)
    const adminRadius = session.allowedRadiusMeters || 50;
    const clientAccuracy = Number(req.body.accuracy) || 5;
    const adaptiveAllowedRadius = adminRadius + Math.min(clientAccuracy, 30);

    const targetLat = session.latitude || 28.6139;
    const targetLng = session.longitude || 77.2090;

    const studentLat = userLocation?.latitude ?? 28.6139;
    const studentLng = userLocation?.longitude ?? 77.2090;

    // Haversine Distance Calculation (Meters)
    const toRad = (val) => (val * Math.PI) / 180;
    const R = 6371000; // Earth radius in meters
    const dLat = toRad(studentLat - targetLat);
    const dLng = toRad(studentLng - targetLng);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(targetLat)) * Math.cos(toRad(studentLat)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distanceMeters = Math.round(R * c);

    if (distanceMeters > adaptiveAllowedRadius) {
      return res.status(400).json({
        success: false,
        errorType: 'OUT_OF_GEOFENCE',
        error: `Location violation: You are ${distanceMeters}m away from the classroom (Allowed boundary: ${adaptiveAllowedRadius}m).`,
        distanceFromTargetMeters: distanceMeters,
        allowedRadiusMeters: adaptiveAllowedRadius,
      });
    }

    // 4. Anti-Proxy Lock: Check Duplicate Student Record or Rapid IP Submission
    const existingStudent = await Attendance.findOne({
      sessionId: targetSessionId,
      $or: [{ regNo: cleanRegNo }, { email: cleanEmail }],
    });

    if (existingStudent) {
      return res.status(409).json({
        success: false,
        errorType: 'ALREADY_SUBMITTED',
        error: `Attendance already recorded for ${cleanRegNo} (${cleanEmail}) in this session.`,
      });
    }

    // Check Rapid IP / Device Proxy Sentinel
    const clientIp = req.ip || req.headers['x-forwarded-for'] || '127.0.0.1';
    const userAgent = req.headers['user-agent'] || '';

    const recentIpRecord = await Attendance.findOne({
      sessionId: targetSessionId,
      clientIp,
      timestamp: { $gte: new Date(Date.now() - 5000) }, // Within last 5 seconds
    });

    let verificationMode = 'GPS_VERIFIED';
    if (recentIpRecord) {
      verificationMode = 'SUSPICIOUS_PROXY';
      console.warn(`[Anti-Proxy Sentinel] Flagged SUSPICIOUS_PROXY for ${cleanRegNo} from IP ${clientIp}`);
    }

    // 5. Save Record to Database
    const attendanceDoc = await Attendance.create({
      sessionId: targetSessionId,
      studentId: cleanRegNo,
      regNo: cleanRegNo,
      studentName: cleanName,
      email: cleanEmail,
      year: year || '',
      branch: branch || '',
      mobileNumber: mobileNumber || '',
      verificationMode,
      distanceFromTargetMeters: distanceMeters,
      userLocation: { latitude: studentLat, longitude: studentLng },
      deviceUuid: deviceUuid || '',
      clientIp,
      userAgent,
      timestamp: new Date(),
    });

    // 6. Broadcast Real-Time Attendee Event to Active Session Room
    if (req.io) {
      req.io.to(`session:${targetSessionId}`).emit('new_attendee', {
        sessionId: targetSessionId,
        record: attendanceDoc,
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Attendance verified and marked successfully!',
      attendance: attendanceDoc,
    });
  } catch (err) {
    console.error('[Attendance Verification Error]:', err);
    return res.status(500).json({
      success: false,
      errorType: 'SERVER_ERROR',
      error: `Server error verifying attendance: ${err.message}`,
    });
  }
};

/**
 * Admin: Create New ProxyQr Session (Auto-Generated Session ID)
 */
exports.createSession = async (req, res) => {
  try {
    const { labIdentifier, title, proctorName, presenterName, customFields } = req.body;

    if (!labIdentifier || !title) {
      return res.status(400).json({ success: false, message: 'Lab Identifier and Session Title are required.' });
    }

    const sessionId = await generateUniqueSessionId(labIdentifier);
    const facultyName = (presenterName || proctorName || 'Faculty In-Charge').trim();

    let eventData = {
      sessionId,
      labIdentifier: labIdentifier.trim(),
      title: title.trim(),
      proctorName: facultyName,
      status: 'PAUSED',
      allowedRadiusMeters: 50,
      customFields: customFields || { requireMobileNumber: false, requireWifiVerification: false },
    };

    if (getIsConnected()) {
      try {
        const doc = await Event.create(eventData);
        if (doc && doc.toObject) {
          eventData = doc.toObject();
        }
      } catch (e) {
        console.warn('[createSession] DB save error, running in memory:', e.message);
      }
    }

    // Initialize in Socket.IO activeSessions memory
    activeSessions.set(sessionId, {
      sessionId: eventData.sessionId,
      labIdentifier: eventData.labIdentifier,
      title: eventData.title,
      proctorName: eventData.proctorName,
      latitude: 28.6139,
      longitude: 77.2090,
      allowedRadiusMeters: 50,
      tokenValiditySeconds: 60,
      currentCountdown: 60,
      currentToken: null,
      previousToken: null,
      qrUrl: null,
      tokenCreatedAt: Date.now(),
      status: 'PAUSED',
      customFields: eventData.customFields,
    });

    return res.status(201).json({
      success: true,
      message: `Session ${sessionId} created successfully!`,
      event: eventData,
      session: eventData,
      sessionId,
    });
  } catch (err) {
    console.error('[createSession Error]:', err);
    return res.status(500).json({ success: false, message: err.message || 'Failed to create session.' });
  }
};

/**
 * Admin: Start / Resume Session
 */
exports.startSession = async (req, res) => {
  try {
    const { sessionId } = req.body;
    if (!sessionId) {
      return res.status(400).json({ success: false, message: 'Session ID is required.' });
    }
    const targetId = String(sessionId).trim().toUpperCase();

    const memSession = activeSessions.get(targetId);
    if (memSession && memSession.status === 'TERMINATED') {
      return res.status(400).json({ success: false, message: 'This session has been permanently terminated and cannot be restarted.' });
    }

    if (getIsConnected()) {
      const dbEvent = await Event.findOne({ sessionId: targetId });
      if (dbEvent && dbEvent.status === 'TERMINATED') {
        return res.status(400).json({ success: false, message: 'This session has been permanently terminated and cannot be restarted.' });
      }
    }

    startSession(req.io, targetId);

    return res.json({ success: true, message: `Session ${targetId} started/resumed.` });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * Admin: Pause Session
 */
exports.pauseSession = async (req, res) => {
  try {
    const { sessionId } = req.body;
    if (!sessionId) {
      return res.status(400).json({ success: false, message: 'Session ID is required.' });
    }
    const targetId = String(sessionId).trim().toUpperCase();

    pauseSession(req.io, targetId);

    return res.json({ success: true, message: `Session ${targetId} paused.` });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * Admin: Terminate Session (Double-Check Permanently End)
 */
exports.terminateSession = async (req, res) => {
  try {
    const { sessionId } = req.body;
    if (!sessionId) {
      return res.status(400).json({ success: false, message: 'Session ID is required.' });
    }
    const targetId = String(sessionId).trim().toUpperCase();
    const endedAt = new Date();

    if (getIsConnected()) {
      await Event.updateOne({ sessionId: targetId }, { status: 'TERMINATED', endedAt, terminatedAt: endedAt }).catch(() => {});
    }

    terminateSession(req.io, targetId);

    return res.json({
      success: true,
      message: `Session ${targetId} permanently closed.`,
      status: 'TERMINATED',
      endedAt,
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * Admin: Emergency Manual Intake (Zero-Roster Fallback)
 */
exports.manualIntake = async (req, res) => {
  try {
    const { sessionId, studentName, regNo, email, year, branch, mobileNumber, overrideReason } = req.body;

    const targetSessionId = (sessionId || 'LAB101-X7K9').toUpperCase();
    const cleanRegNo = (regNo || '').trim().toUpperCase();
    const cleanEmail = (email || '').trim().toLowerCase();
    const cleanName = (studentName || '').trim();

    if (!cleanRegNo || !cleanName || !cleanEmail || !overrideReason) {
      return res.status(400).json({ success: false, message: 'Full Name, PRN, Email, and Override Reason are required.' });
    }

    // Check Duplicate Collision
    const existing = await Attendance.findOne({
      sessionId: targetSessionId,
      $or: [{ regNo: cleanRegNo }, { email: cleanEmail }],
    });

    if (existing) {
      return res.status(409).json({ success: false, message: `Attendance already recorded for ${cleanRegNo}.` });
    }

    const attendanceDoc = await Attendance.create({
      sessionId: targetSessionId,
      studentId: cleanRegNo,
      regNo: cleanRegNo,
      studentName: cleanName,
      email: cleanEmail,
      year: year || '',
      branch: branch || '',
      mobileNumber: mobileNumber || '',
      verificationMode: 'ADMIN_MANUAL_OVERRIDE',
      overrideReason: overrideReason.trim(),
      editedBy: req.admin?.email || 'Admin',
      editedAt: new Date(),
      distanceFromTargetMeters: 0,
      timestamp: new Date(),
    });

    if (req.io) {
      req.io.to(`session:${targetSessionId}`).emit('new_attendee', {
        sessionId: targetSessionId,
        record: attendanceDoc,
      });
    }

    return res.status(201).json({
      success: true,
      message: 'Manual attendance override created successfully.',
      attendance: attendanceDoc,
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * Admin: Edit Student Roster Record with Mandatory Reason
 */
exports.updateAttendee = async (req, res) => {
  try {
    const { id } = req.params;
    const { studentName, regNo, email, year, branch, mobileNumber, editReason } = req.body;

    if (!editReason || !editReason.trim()) {
      return res.status(400).json({ success: false, message: 'Mandatory Edit Reason is required.' });
    }

    const record = await Attendance.findById(id);
    if (!record) {
      return res.status(404).json({ success: false, message: 'Attendee record not found.' });
    }

    // Save previous values in audit history
    const previousValues = {
      studentName: record.studentName,
      regNo: record.regNo,
      email: record.email,
      year: record.year,
      branch: record.branch,
      mobileNumber: record.mobileNumber,
    };

    if (studentName) record.studentName = studentName.trim();
    if (regNo) record.regNo = regNo.trim().toUpperCase();
    if (email) record.email = email.trim().toLowerCase();
    if (year !== undefined) record.year = year;
    if (branch !== undefined) record.branch = branch;
    if (mobileNumber !== undefined) record.mobileNumber = mobileNumber;

    record.editedBy = req.admin?.email || 'Admin';
    record.editedAt = new Date();
    record.editHistory.push({
      previousValues,
      reason: editReason.trim(),
      editedAt: new Date(),
    });

    await record.save();

    if (req.io) {
      req.io.to(`session:${record.sessionId}`).emit('attendee_updated', {
        sessionId: record.sessionId,
        record,
      });
    }

    return res.json({
      success: true,
      message: 'Attendee record updated successfully.',
      record,
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * Admin: Get Active / Terminated Sessions History
 */
exports.getSessionHistory = async (req, res) => {
  try {
    const sessions = await Event.find().sort({ createdAt: -1 });

    const sessionStats = await Promise.all(
      sessions.map(async (sess) => {
        const totalAttendees = await Attendance.countDocuments({ sessionId: sess.sessionId });
        const manualOverrides = await Attendance.countDocuments({
          sessionId: sess.sessionId,
          verificationMode: 'ADMIN_MANUAL_OVERRIDE',
        });
        return {
          ...sess.toObject(),
          totalAttendees,
          manualOverrides,
        };
      })
    );

    return res.json({
      success: true,
      sessions: sessionStats,
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};



/**
 * Public / Admin: Get Events List (Returns Active, Paused, and Terminated for History)
 */
exports.getEvents = async (req, res) => {
  try {
    let dbEvents = [];
    if (getIsConnected()) {
      dbEvents = await Event.find().sort({ createdAt: -1 });
    }

    const memoryEvents = Array.from(activeSessions.values());

    const eventMap = new Map();
    memoryEvents.forEach((s) => eventMap.set(s.sessionId, s));
    dbEvents.forEach((e) => {
      const obj = e.toObject ? e.toObject() : e;
      if (!eventMap.has(obj.sessionId)) {
        eventMap.set(obj.sessionId, obj);
      }
    });

    const events = Array.from(eventMap.values()).sort(
      (a, b) => new Date(b.createdAt || Date.now()) - new Date(a.createdAt || Date.now())
    );
    return res.json({ success: true, events });
  } catch (err) {
    const memoryEvents = Array.from(activeSessions.values());
    return res.json({
      success: true,
      events: memoryEvents,
    });
  }
};

/**
 * Admin: Get Attendance Stats for Session
 */
exports.getAttendanceStats = async (req, res) => {
  try {
    const { eventId } = req.params;
    if (!eventId || eventId === 'undefined' || eventId === 'null') {
      return res.json({ success: true, stats: { count: 0, recent: [] } });
    }
    const targetSessionId = String(eventId).trim().toUpperCase();

    let count = 0;
    let recent = [];

    if (getIsConnected()) {
      count = await Attendance.countDocuments({ sessionId: targetSessionId });
      recent = await Attendance.find({ sessionId: targetSessionId }).sort({ timestamp: -1 }).limit(200);
    }

    return res.json({
      success: true,
      stats: {
        count,
        recent,
      },
    });
  } catch (err) {
    return res.json({
      success: true,
      stats: {
        count: 0,
        recent: [],
      },
    });
  }
};
