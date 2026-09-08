const crypto = require('crypto');
const { decryptToken } = require('../services/cryptoService');
const { activeSessions, startSession, pauseSession, terminateSession, rotateToken } = require('../services/socketService');
const Event = require('../models/Event');
const Attendance = require('../models/Attendance');
const { getIsConnected } = require('../config/db');
const storageService = require('../services/storageService');

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
  const storedSessions = storageService.loadSessions();

  while (exists && attempts < 20) {
    attempts++;
    const randomSuffix = crypto.randomBytes(3).toString('hex').toUpperCase().slice(0, 4);
    sessionId = `${cleanLab}-${randomSuffix}`;

    if (activeSessions.has(sessionId)) {
      continue;
    }

    if (storedSessions.some((s) => s.sessionId === sessionId)) {
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

    if (!token) {
      return res.status(400).json({ success: false, errorType: 'MISSING_TOKEN', error: 'Missing security token.' });
    }

    const cleanEmail = (email || '').trim().toLowerCase();
    const cleanRegNo = (regNo || studentId || '').trim().toUpperCase();
    const cleanName = (studentName || '').trim();

    if (!cleanRegNo || !cleanName || !cleanEmail) {
      return res.status(400).json({ success: false, errorType: 'MISSING_FIELDS', error: 'Student Name, Registration No, and Email are required.' });
    }

    // 1. Decrypt & Validate Dynamic AES Token (120s validity window)
    let tokenPayload = null;
    try {
      const decResult = decryptToken(token, 120);
      if (!decResult || !decResult.isValid || !decResult.payload) {
        return res.status(400).json({
          success: false,
          errorType: 'EXPIRED_TOKEN',
          error: 'QR code has expired. Please scan the current QR code on the screen.',
        });
      }
      tokenPayload = decResult.payload;
    } catch (e) {
      return res.status(400).json({
        success: false,
        errorType: 'EXPIRED_TOKEN',
        error: 'QR code has expired. Please scan the current QR code on the screen.',
      });
    }

    // Resolve authoritative Target Session ID from Token or Request
    const tokenSessionId = (tokenPayload.sessionId || tokenPayload.eventId || tokenPayload.e || '').toUpperCase();
    let targetSessionId = (sessionId || eventId || '').toUpperCase();

    if (!targetSessionId || targetSessionId === 'CS101-LECTURE') {
      targetSessionId = tokenSessionId || 'CS101-LECTURE';
    }

    if (tokenSessionId && targetSessionId && tokenSessionId !== targetSessionId) {
      return res.status(400).json({
        success: false,
        errorType: 'INVALID_SESSION_TOKEN',
        error: `QR code belongs to session ${tokenSessionId}, not ${targetSessionId}.`,
      });
    }

    // 2. Check Session State in Memory / Database / Local File Storage
    let session = activeSessions.get(targetSessionId);
    if (!session && getIsConnected()) {
      try {
        const dbEvent = await Event.findOne({ sessionId: targetSessionId });
        if (dbEvent) {
          session = {
            sessionId: dbEvent.sessionId,
            labIdentifier: dbEvent.labIdentifier,
            title: dbEvent.title,
            proctorName: dbEvent.proctorName,
            presenterName: dbEvent.presenterName,
            latitude: dbEvent.latitude !== undefined && dbEvent.latitude !== null ? dbEvent.latitude : null,
            longitude: dbEvent.longitude !== undefined && dbEvent.longitude !== null ? dbEvent.longitude : null,
            isCalibrated: !!dbEvent.isCalibrated,
            allowedRadiusMeters: dbEvent.allowedRadiusMeters || 50,
            status: dbEvent.status,
            isEnded: dbEvent.isEnded,
            customFields: dbEvent.customFields,
          };
          activeSessions.set(targetSessionId, session);
        }
      } catch (e) {}
    }

    if (!session) {
      const stored = storageService.loadSessions().find((s) => s.sessionId === targetSessionId);
      if (stored) {
        session = {
          sessionId: stored.sessionId,
          labIdentifier: stored.labIdentifier,
          title: stored.title,
          proctorName: stored.proctorName,
          presenterName: stored.presenterName,
          latitude: stored.latitude !== undefined && stored.latitude !== null ? stored.latitude : null,
          longitude: stored.longitude !== undefined && stored.longitude !== null ? stored.longitude : null,
          isCalibrated: !!stored.isCalibrated,
          allowedRadiusMeters: stored.allowedRadiusMeters || 50,
          status: stored.status,
          isEnded: stored.isEnded,
          customFields: stored.customFields,
        };
        activeSessions.set(targetSessionId, session);
      }
    }

    if (!session || session.status === 'PAUSED' || session.status === 'TERMINATED' || session.isEnded) {
      const isTerminated = !session || session.status === 'TERMINATED' || session.isEnded;
      return res.status(400).json({
        success: false,
        errorType: isTerminated ? 'SESSION_TERMINATED' : 'SESSION_PAUSED',
        error: isTerminated
          ? 'Session permanently closed. This attendance session has been ended by the Admin.'
          : 'Attendance session is currently paused by the Admin.',
      });
    }

    // 3. Adaptive Geofence Boundary Calculation: Boundary = Admin Radius + max(clientAccuracy, 30)
    const adminRadius = session.allowedRadiusMeters || 50;
    const clientAccuracy = Math.min(Math.max(Number(req.body.accuracy) || 5, 5), 75);
    const adaptiveAllowedRadius = adminRadius + Math.max(clientAccuracy, 30);
    const isGeofenceEnabled = session.geofenceEnabled !== false;

    const studentLat = userLocation?.latitude;
    const studentLng = userLocation?.longitude;

    let distanceMeters = 0;

    if (isGeofenceEnabled) {
      // Check if session coordinates are still uncalibrated placeholder (e.g. dummy Delhi coordinates 28.6139, 77.2090 or null)
      const isPlaceholderCoords =
        !session.latitude ||
        !session.longitude ||
        session.isCalibrated === false ||
        (session.latitude === 28.6139 && session.longitude === 77.2090);

      if (isPlaceholderCoords) {
        // Teacher has not calibrated a specific GPS coordinate for this classroom yet.
        // Auto-anchor the classroom coordinates to this first real device scan!
        if (
          typeof studentLat === 'number' &&
          typeof studentLng === 'number' &&
          !(studentLat === 28.6139 && studentLng === 77.2090)
        ) {
          session.latitude = studentLat;
          session.longitude = studentLng;
          session.isCalibrated = true;
          storageService.updateSession(targetSessionId, {
            latitude: studentLat,
            longitude: studentLng,
            isCalibrated: true,
          });
          if (getIsConnected()) {
            Event.updateOne(
              { sessionId: targetSessionId },
              { latitude: studentLat, longitude: studentLng, isCalibrated: true }
            ).catch(() => {});
          }
          console.log(`[Geofence Auto-Anchor] Anchored classroom ${targetSessionId} to student fix: ${studentLat}, ${studentLng}`);
          distanceMeters = 0;
        }
      } else if (typeof studentLat === 'number' && typeof studentLng === 'number') {
        const targetLat = session.latitude;
        const targetLng = session.longitude;

        const isStudentPlaceholder = studentLat === 28.6139 && studentLng === 77.2090;
        const isTargetPlaceholderCoord = targetLat === 28.6139 && targetLng === 77.2090;

        if (isStudentPlaceholder || isTargetPlaceholderCoord) {
          distanceMeters = 0;
        } else {
          // Haversine Distance Calculation (Meters)
          const toRad = (val) => (val * Math.PI) / 180;
          const R = 6371000; // Earth radius in meters
          const dLat = toRad(studentLat - targetLat);
          const dLng = toRad(studentLng - targetLng);
          const a =
            Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(toRad(targetLat)) * Math.cos(toRad(studentLat)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
          const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
          distanceMeters = Math.round(R * c);

          if (distanceMeters > adaptiveAllowedRadius) {
            return res.status(400).json({
              success: false,
              errorType: 'OUT_OF_GEOFENCE',
              error: `Location violation: You are ${distanceMeters}m away from the classroom (Allowed boundary: ${adaptiveAllowedRadius}m).`,
              distanceFromTargetMeters: distanceMeters,
              allowedRadiusMeters: adaptiveAllowedRadius,
            });
          }
        }
      }
    }

    // 4. Anti-Proxy Lock: Check Duplicate Student Record or Rapid IP Submission
    let existingStudent = null;
    if (getIsConnected()) {
      try {
        existingStudent = await Attendance.findOne({
          sessionId: targetSessionId,
          $or: [{ regNo: cleanRegNo }, { email: cleanEmail }],
        });
      } catch (e) {}
    }

    if (!existingStudent) {
      const storedAtt = storageService.getAttendanceBySession(targetSessionId);
      existingStudent = storedAtt.find(
        (a) =>
          (a.regNo && a.regNo.toUpperCase() === cleanRegNo) ||
          (a.email && a.email.toLowerCase() === cleanEmail)
      );
    }

    if (existingStudent) {
      return res.status(409).json({
        success: false,
        errorType: 'ALREADY_SUBMITTED',
        error: `Attendance already recorded for ${cleanRegNo} (${cleanEmail}) in this session.`,
      });
    }

    // 4.1 Anti-Proxy Lock: Verify Single Device Policy (Block device collision for different students)
    if (deviceUuid && typeof deviceUuid === 'string' && !deviceUuid.includes('DEV-UNKNOWN')) {
      let deviceCollision = null;
      if (getIsConnected()) {
        try {
          deviceCollision = await Attendance.findOne({
            sessionId: targetSessionId,
            deviceUuid,
            $or: [
              { regNo: { $ne: cleanRegNo } },
              { email: { $ne: cleanEmail } },
            ],
          });
        } catch (e) {}
      }

      if (!deviceCollision) {
        const storedAtt = storageService.getAttendanceBySession(targetSessionId);
        deviceCollision = storedAtt.find(
          (a) =>
            a.deviceUuid === deviceUuid &&
            ((a.regNo && a.regNo.toUpperCase() !== cleanRegNo) ||
              (a.email && a.email.toLowerCase() !== cleanEmail))
        );
      }

      if (deviceCollision) {
        return res.status(403).json({
          success: false,
          errorType: 'ANTI_PROXY_DEVICE_LOCK',
          error: 'One submission per device allowed. This device has already recorded attendance for this session.',
          originalStudent: deviceCollision.studentName || deviceCollision.regNo,
          originalRegNo: deviceCollision.regNo,
          originalEmail: deviceCollision.email,
        });
      }
    }

    // Check Rapid IP / Device Proxy Sentinel
    const clientIp = req.ip || req.headers['x-forwarded-for'] || '127.0.0.1';
    const userAgent = req.headers['user-agent'] || '';

    let recentIpRecord = null;
    if (getIsConnected()) {
      try {
        recentIpRecord = await Attendance.findOne({
          sessionId: targetSessionId,
          clientIp,
          timestamp: { $gte: new Date(Date.now() - 5000) },
        });
      } catch (e) {}
    }

    let verificationMode = 'GPS_VERIFIED';
    if (recentIpRecord) {
      verificationMode = 'SUSPICIOUS_PROXY';
      console.warn(`[Anti-Proxy Sentinel] Flagged SUSPICIOUS_PROXY for ${cleanRegNo} from IP ${clientIp}`);
    }

    // 5. Save Record to Database and Local File Storage
    const attData = {
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
      timestamp: new Date().toISOString(),
    };

    let attendanceDoc = null;
    if (getIsConnected()) {
      try {
        attendanceDoc = await Attendance.create(attData);
      } catch (e) {
        console.warn('[verifyAttendance] DB save error, saving to file storage:', e.message);
      }
    }

    if (!attendanceDoc) {
      attendanceDoc = storageService.saveAttendance(attData);
    } else {
      storageService.saveAttendance(attendanceDoc.toObject ? attendanceDoc.toObject() : attendanceDoc);
    }

    // 6. Broadcast Real-Time Attendee Event to Active Session Room
    if (req.io) {
      req.io.to(`session:${targetSessionId}`).emit('new_attendee', {
        sessionId: targetSessionId,
        record: attendanceDoc,
      });
    }

    const tokenAgeSeconds = Math.max(0, Math.floor((Date.now() - (tokenPayload.timestamp || Date.now())) / 1000));

    return res.status(200).json({
      success: true,
      message: 'Attendance verified and marked successfully!',
      attendance: attendanceDoc,
      data: {
        user: cleanRegNo,
        userName: cleanName,
        event: session.title || targetSessionId,
        sessionId: targetSessionId,
        sessionTitle: session.title || targetSessionId,
        labIdentifier: session.labIdentifier || '',
        distanceMeters,
        allowedRadiusMeters: adaptiveAllowedRadius,
        tokenAgeSeconds,
        timestamp: attendanceDoc.timestamp,
      },
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
 * Admin: Create New ProxyQr Session (Auto-Generated Session ID with Deduplication)
 */
exports.createSession = async (req, res) => {
  try {
    const {
      labIdentifier,
      title,
      proctorName,
      presenterName,
      customFields,
      latitude,
      longitude,
      allowedRadiusMeters,
      geofenceEnabled,
    } = req.body;

    if (!labIdentifier || !title) {
      return res.status(400).json({ success: false, message: 'Lab Identifier and Session Title are required.' });
    }

    const cleanLab = labIdentifier.trim();
    const cleanTitle = title.trim();
    const facultyName = (presenterName || proctorName || 'Faculty In-Charge').trim();
    const hasAdminCoords = typeof latitude === 'number' && typeof longitude === 'number';
    const isGeofenceActive = geofenceEnabled !== false;
    const radius = Number(allowedRadiusMeters) || 50;

    // 1. Anti-Duplicate Check: If an unstarted session with the same lab & title was created within 15s, return it
    if (getIsConnected()) {
      const fifteenSecondsAgo = new Date(Date.now() - 15000);
      const recentDup = await Event.findOne({
        labIdentifier: cleanLab,
        title: cleanTitle,
        status: 'PAUSED',
        createdAt: { $gte: fifteenSecondsAgo },
      }).sort({ createdAt: -1 });

      if (recentDup) {
        return res.status(200).json({
          success: true,
          message: `Session ${recentDup.sessionId} already initialized.`,
          event: recentDup,
          session: recentDup,
          sessionId: recentDup.sessionId,
        });
      }

      // Auto-cleanup any unstarted duplicate PAUSED sessions with 0 attendees for this same lab & title
      const staleDuplicates = await Event.find({
        labIdentifier: cleanLab,
        title: cleanTitle,
        status: 'PAUSED',
      });

      for (const stale of staleDuplicates) {
        const attendeeCount = await Attendance.countDocuments({ sessionId: stale.sessionId });
        if (attendeeCount === 0) {
          await Event.deleteOne({ _id: stale._id });
          activeSessions.delete(stale.sessionId);
        }
      }
    }

    const sessionId = await generateUniqueSessionId(cleanLab);

    let eventData = {
      sessionId,
      labIdentifier: cleanLab,
      title: cleanTitle,
      proctorName: facultyName,
      presenterName: facultyName,
      status: 'PAUSED',
      latitude: hasAdminCoords ? latitude : null,
      longitude: hasAdminCoords ? longitude : null,
      isCalibrated: hasAdminCoords,
      allowedRadiusMeters: radius,
      geofenceEnabled: isGeofenceActive,
      createdAt: new Date().toISOString(),
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

    // Always persist to local file storage!
    storageService.saveSession(eventData);

    // Initialize in Socket.IO activeSessions memory
    activeSessions.set(sessionId, {
      sessionId: eventData.sessionId,
      labIdentifier: eventData.labIdentifier,
      title: eventData.title,
      proctorName: eventData.proctorName,
      presenterName: eventData.presenterName,
      latitude: eventData.latitude,
      longitude: eventData.longitude,
      isCalibrated: eventData.isCalibrated,
      allowedRadiusMeters: eventData.allowedRadiusMeters,
      geofenceEnabled: eventData.geofenceEnabled,
      tokenValiditySeconds: 60,
      currentCountdown: 60,
      currentToken: null,
      previousToken: null,
      qrUrl: null,
      tokenCreatedAt: Date.now(),
      status: 'PAUSED',
      createdAt: eventData.createdAt,
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
 * Admin: Delete Session and Associated Attendance Records
 */
exports.deleteSession = async (req, res) => {
  try {
    const sessionId = (req.params.sessionId || req.params.id || req.body.sessionId || '').trim().toUpperCase();
    if (!sessionId) {
      return res.status(400).json({ success: false, message: 'Session ID is required.' });
    }

    if (getIsConnected()) {
      try {
        await Event.deleteOne({ sessionId });
        await Attendance.deleteMany({ sessionId });
      } catch (e) {}
    }
    activeSessions.delete(sessionId);
    storageService.deleteSession(sessionId);

    return res.json({
      success: true,
      message: `Session ${sessionId} and associated attendance records deleted successfully.`,
      sessionId,
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
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
      try {
        const dbEvent = await Event.findOne({ sessionId: targetId });
        if (dbEvent && dbEvent.status === 'TERMINATED') {
          return res.status(400).json({ success: false, message: 'This session has been permanently terminated and cannot be restarted.' });
        }
      } catch (e) {}
    }

    storageService.updateSession(targetId, { status: 'ACTIVE' });
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

    storageService.updateSession(targetId, { status: 'PAUSED' });
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
    const sessionId = req.body.sessionId || req.body.eventId || req.params.id;
    if (!sessionId) {
      return res.status(400).json({ success: false, message: 'Session ID is required.' });
    }
    const targetId = String(sessionId).trim().toUpperCase();
    const endedAt = new Date();

    if (getIsConnected()) {
      try {
        await Event.updateOne(
          { sessionId: targetId },
          {
            $set: {
              status: 'TERMINATED',
              isEnded: true,
              endedAt: endedAt,
              terminatedAt: endedAt,
            },
          }
        );
      } catch (err) {
        console.warn('Mongo terminate update warning:', err);
      }
    }

    storageService.updateSession(targetId, {
      status: 'TERMINATED',
      isEnded: true,
      endedAt: endedAt.toISOString(),
      terminatedAt: endedAt.toISOString(),
    });

    terminateSession(req.io, targetId);

    return res.json({
      success: true,
      message: `Session ${targetId} permanently closed.`,
      status: 'TERMINATED',
      isEnded: true,
      endedAt,
      session: null,
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
      return res.status(400).json({ success: false, message: 'Full Name, Reg No, Email, and Override Reason are required.' });
    }

    // Check Duplicate Collision
    let existing = null;
    if (getIsConnected()) {
      try {
        existing = await Attendance.findOne({
          sessionId: targetSessionId,
          $or: [{ regNo: cleanRegNo }, { email: cleanEmail }],
        });
      } catch (e) {}
    }

    if (!existing) {
      const storedAtt = storageService.getAttendanceBySession(targetSessionId);
      existing = storedAtt.find(
        (a) =>
          (a.regNo && a.regNo.toUpperCase() === cleanRegNo) ||
          (a.email && a.email.toLowerCase() === cleanEmail)
      );
    }

    if (existing) {
      return res.status(409).json({ success: false, message: `Attendance already recorded for ${cleanRegNo}.` });
    }

    const attData = {
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
      timestamp: new Date().toISOString(),
    };

    let attendanceDoc = null;
    if (getIsConnected()) {
      try {
        attendanceDoc = await Attendance.create(attData);
      } catch (e) {}
    }

    if (!attendanceDoc) {
      attendanceDoc = storageService.saveAttendance(attData);
    } else {
      storageService.saveAttendance(attendanceDoc.toObject ? attendanceDoc.toObject() : attendanceDoc);
    }

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

    let record = null;
    if (getIsConnected()) {
      try {
        record = await Attendance.findById(id);
      } catch (e) {}
    }

    if (record) {
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
      if (!Array.isArray(record.editHistory)) record.editHistory = [];
      record.editHistory.push({
        previousValues,
        reason: editReason.trim(),
        editedAt: new Date(),
      });

      await record.save();
      storageService.updateAttendeeRecord(id, record.toObject ? record.toObject() : record);
    } else {
      // Update in storageService
      record = storageService.updateAttendeeRecord(id, {
        ...(studentName ? { studentName: studentName.trim() } : {}),
        ...(regNo ? { regNo: regNo.trim().toUpperCase(), studentId: regNo.trim().toUpperCase() } : {}),
        ...(email ? { email: email.trim().toLowerCase() } : {}),
        ...(year !== undefined ? { year } : {}),
        ...(branch !== undefined ? { branch } : {}),
        ...(mobileNumber !== undefined ? { mobileNumber } : {}),
        editedBy: req.admin?.email || 'Admin',
        editedAt: new Date().toISOString(),
        editReason: editReason.trim(),
      });
    }

    if (!record) {
      return res.status(404).json({ success: false, message: 'Attendee record not found.' });
    }

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
    let dbEvents = [];
    if (getIsConnected()) {
      try {
        dbEvents = await Event.find().sort({ createdAt: -1 });
      } catch (e) {}
    }

    const storedSessions = storageService.loadSessions();
    const eventMap = new Map();
    storedSessions.forEach((s) => eventMap.set(s.sessionId, s));
    dbEvents.forEach((e) => {
      const obj = e.toObject ? e.toObject() : e;
      eventMap.set(obj.sessionId, { ...eventMap.get(obj.sessionId), ...obj });
    });

    const sessions = Array.from(eventMap.values());

    const sessionStats = await Promise.all(
      sessions.map(async (sess) => {
        let totalAttendees = 0;
        let manualOverrides = 0;
        const cleanSessId = String(sess.sessionId).trim();
        const escId = cleanSessId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

        if (getIsConnected()) {
          try {
            const query = { sessionId: new RegExp(`^${escId}$`, 'i') };
            totalAttendees = await Attendance.countDocuments(query);
            manualOverrides = await Attendance.countDocuments({
              ...query,
              verificationMode: 'ADMIN_MANUAL_OVERRIDE',
            });
          } catch (e) {}
        }

        const fileAtt = storageService.getAttendanceBySession(cleanSessId);
        if (totalAttendees === 0) {
          totalAttendees = fileAtt.length;
          manualOverrides = fileAtt.filter((a) => a.verificationMode === 'ADMIN_MANUAL_OVERRIDE').length;
        } else if (fileAtt.length > 0) {
          totalAttendees = Math.max(totalAttendees, fileAtt.length);
        }

        return {
          ...sess,
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
 * Public / Admin: Get Current Active Session
 * Strictly filters by active/paused non-ended status.
 * If no session matches or latest is TERMINATED / isEnded, returns { session: null }.
 */
exports.getActiveSession = async (req, res) => {
  try {
    let session = null;

    if (getIsConnected()) {
      try {
        const dbSession = await Event.findOne({
          status: { $in: ['ACTIVE', 'PAUSED'] },
          isEnded: { $ne: true },
        }).sort({ createdAt: -1 });

        if (dbSession && dbSession.status !== 'TERMINATED' && !dbSession.isEnded) {
          session = dbSession.toObject ? dbSession.toObject() : dbSession;
        }
      } catch (e) {}
    }

    // In-memory fallback if DB not connected or no DB session
    if (!session) {
      const memSessions = Array.from(activeSessions.values()).filter(
        (s) => (s.status === 'ACTIVE' || s.status === 'PAUSED') && !s.isEnded && s.status !== 'TERMINATED'
      );
      if (memSessions.length > 0) {
        memSessions.sort(
          (a, b) => new Date(b.createdAt || Date.now()) - new Date(a.createdAt || Date.now())
        );
        session = memSessions[0];
      }
    }

    // StorageService fallback
    if (!session) {
      const stored = storageService.loadSessions().filter(
        (s) => (s.status === 'ACTIVE' || s.status === 'PAUSED') && !s.isEnded && s.status !== 'TERMINATED'
      );
      if (stored.length > 0) {
        session = stored[0];
      }
    }

    if (!session || session.status === 'TERMINATED' || session.isEnded) {
      return res.json({ success: true, session: null });
    }

    return res.json({ success: true, session });
  } catch (err) {
    return res.status(500).json({ success: false, session: null, message: err.message });
  }
};

/**
 * Public / Admin: Get Events List (Returns Active, Paused, and Terminated for History)
 */
exports.getEvents = async (req, res) => {
  try {
    let dbEvents = [];
    if (getIsConnected()) {
      try {
        dbEvents = await Event.find().sort({ createdAt: -1 });
      } catch (e) {
        console.warn('DB getEvents error:', e.message);
      }
    }

    // Load file-stored sessions (includes yesterday's 2026-09-06 seeds and all created sessions)
    const storedSessions = storageService.loadSessions();
    const memoryEvents = Array.from(activeSessions.values());

    const eventMap = new Map();

    // 1. Put stored sessions into map first
    storedSessions.forEach((s) => {
      eventMap.set(s.sessionId, s);
    });

    // 2. Overlay DB events if any
    dbEvents.forEach((e) => {
      const obj = e.toObject ? e.toObject() : e;
      eventMap.set(obj.sessionId, { ...eventMap.get(obj.sessionId), ...obj });
    });

    // 3. Merge memory events, ensuring TERMINATED/isEnded in DB or storage is never overwritten with PAUSED
    memoryEvents.forEach((s) => {
      if (!eventMap.has(s.sessionId)) {
        eventMap.set(s.sessionId, s);
      } else {
        const existing = eventMap.get(s.sessionId);
        if (existing.status === 'TERMINATED' || existing.isEnded) {
          s.status = 'TERMINATED';
          s.isEnded = true;
          eventMap.set(s.sessionId, { ...s, ...existing, status: 'TERMINATED', isEnded: true });
        } else {
          eventMap.set(s.sessionId, { ...existing, ...s });
        }
      }
    });

    const getTs = (item) => {
      if (item.createdAt) {
        const t = new Date(item.createdAt).getTime();
        if (!isNaN(t) && t > 0) return t;
      }
      if (item._id) {
        try {
          const hex = String(item._id).substring(0, 8);
          const t = parseInt(hex, 16) * 1000;
          if (!isNaN(t) && t > 0) return t;
        } catch (e) {}
      }
      return 0;
    };

    const allEvents = Array.from(eventMap.values());

    // Calculate totalAttendees for each event so history tab displays attendee count accurately
    const events = await Promise.all(
      allEvents.map(async (item) => {
        const ts = getTs(item);
        let totalAttendees = 0;
        const cleanSessId = String(item.sessionId).trim();
        const escId = cleanSessId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

        if (getIsConnected()) {
          try {
            const query = { sessionId: new RegExp(`^${escId}$`, 'i') };
            totalAttendees = await Attendance.countDocuments(query);
          } catch (e) {}
        }

        const fileAtt = storageService.getAttendanceBySession(cleanSessId);
        if (totalAttendees === 0) {
          totalAttendees = fileAtt.length;
        } else if (fileAtt.length > 0) {
          totalAttendees = Math.max(totalAttendees, fileAtt.length);
        }

        return {
          ...item,
          totalAttendees,
          createdAt: item.createdAt || (ts > 0 ? new Date(ts).toISOString() : new Date().toISOString()),
        };
      })
    );

    events.sort((a, b) => getTs(b) - getTs(a));

    return res.json({ success: true, events });
  } catch (err) {
    const fallback = storageService.loadSessions();
    return res.json({
      success: true,
      events: fallback,
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
    const escapedSessionId = targetSessionId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    let count = 0;
    let recent = [];

    if (getIsConnected()) {
      try {
        const query = { sessionId: new RegExp(`^${escapedSessionId}$`, 'i') };
        count = await Attendance.countDocuments(query);
        const docs = await Attendance.find(query).sort({ timestamp: -1 }).limit(500);
        recent = docs.map((d) => (d.toObject ? d.toObject() : d));
      } catch (e) {}
    }

    const fileAtt = storageService.getAttendanceBySession(targetSessionId);
    if (!recent || recent.length === 0) {
      count = fileAtt.length;
      recent = fileAtt.slice(0, 500);
    } else if (fileAtt.length > 0) {
      const seen = new Set(recent.map((r) => String(r.regNo || r.studentId || r.email || r._id).toUpperCase()));
      for (const item of fileAtt) {
        const key = String(item.regNo || item.studentId || item.email || item._id).toUpperCase();
        if (!seen.has(key)) {
          seen.add(key);
          recent.push(item);
        }
      }
      count = recent.length;
    }

    return res.json({
      success: true,
      stats: {
        count: count || recent.length,
        recent,
      },
    });
  } catch (err) {
    const fileAtt = storageService.getAttendanceBySession(req.params.eventId);
    return res.json({
      success: true,
      stats: {
        count: fileAtt.length,
        recent: fileAtt.slice(0, 500),
      },
    });
  }
};

/**
 * Check Scanned Token Status & Remaining Validity
 * Endpoint: GET /api/attendance/token-status?token=...
 */
exports.checkTokenStatus = (req, res) => {
  try {
    const token = req.query.token || req.body?.token;
    if (!token || typeof token !== 'string') {
      return res.status(200).json({ valid: false, expired: true, remainingSeconds: 0, error: 'No QR code token provided.' });
    }

    const result = decryptToken(token, 120);
    if (!result || !result.isValid || !result.payload) {
      return res.status(200).json({
        valid: false,
        expired: true,
        remainingSeconds: 0,
        ageSeconds: result?.ageSeconds || 121,
        error: 'QR code has expired. Please scan the current QR code on the screen.',
      });
    }

    const remainingSeconds = Math.max(0, 120 - result.ageSeconds);
    return res.status(200).json({
      valid: true,
      expired: false,
      remainingSeconds,
      ageSeconds: result.ageSeconds,
      sessionId: result.payload.sessionId || result.payload.eventId || '',
    });
  } catch (e) {
    return res.status(200).json({ valid: false, expired: true, remainingSeconds: 0, error: 'Invalid QR code.' });
  }
};
