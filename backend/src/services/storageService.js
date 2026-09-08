const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '../../data');
const SESSIONS_FILE = path.join(DATA_DIR, 'sessions_store.json');
const ATTENDANCE_FILE = path.join(DATA_DIR, 'attendance_store.json');

// Genuine storage store (no dummy data)
const DUMMY_SESSION_IDS = ['CS202-A81F', 'DSA-7C4E', 'CN301-5B9D'];
const DEFAULT_SEED_SESSIONS = [];
const DEFAULT_SEED_ATTENDANCE = [];

function ensureDataDirectory() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
  } catch (err) {
    console.warn('[StorageService] Error creating data directory:', err.message);
  }
}

function loadSessions() {
  ensureDataDirectory();
  try {
    if (!fs.existsSync(SESSIONS_FILE)) {
      saveSessions([]);
      return [];
    }
    const raw = fs.readFileSync(SESSIONS_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      saveSessions([]);
      return [];
    }
    // Filter out any legacy dummy seeds
    const genuine = parsed.filter((s) => s && s.sessionId && !DUMMY_SESSION_IDS.includes(String(s.sessionId).toUpperCase()));
    if (genuine.length !== parsed.length) {
      saveSessions(genuine);
    }
    return genuine;
  } catch (err) {
    console.warn('[StorageService] Error loading sessions file:', err.message);
    return [];
  }
}

function saveSessions(sessions) {
  ensureDataDirectory();
  try {
    fs.writeFileSync(SESSIONS_FILE, JSON.stringify(sessions, null, 2), 'utf8');
    return true;
  } catch (err) {
    console.error('[StorageService] Error writing sessions file:', err.message);
    return false;
  }
}

function saveSession(session) {
  if (!session || !session.sessionId) return;
  const sessions = loadSessions();
  const index = sessions.findIndex((s) => s.sessionId === session.sessionId);
  if (index >= 0) {
    sessions[index] = { ...sessions[index], ...session };
  } else {
    sessions.unshift(session);
  }
  saveSessions(sessions);
}

function updateSession(sessionId, updates) {
  if (!sessionId) return null;
  const cleanId = sessionId.toUpperCase();
  const sessions = loadSessions();
  const index = sessions.findIndex((s) => s.sessionId === cleanId);
  if (index >= 0) {
    sessions[index] = { ...sessions[index], ...updates };
    saveSessions(sessions);
    return sessions[index];
  }
  return null;
}

function deleteSession(sessionId) {
  if (!sessionId) return false;
  const cleanId = sessionId.toUpperCase();
  const sessions = loadSessions();
  const filtered = sessions.filter((s) => s.sessionId !== cleanId);
  saveSessions(filtered);

  // Also delete associated attendance records
  const allAtt = loadAttendance();
  const filteredAtt = allAtt.filter((a) => a.sessionId !== cleanId);
  saveAttendanceList(filteredAtt);
  return true;
}

function loadAttendance() {
  ensureDataDirectory();
  try {
    if (!fs.existsSync(ATTENDANCE_FILE)) {
      saveAttendanceList([]);
      return [];
    }
    const raw = fs.readFileSync(ATTENDANCE_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      saveAttendanceList([]);
      return [];
    }
    const genuine = parsed.filter((a) => a && a.sessionId && !DUMMY_SESSION_IDS.includes(String(a.sessionId).toUpperCase()));
    if (genuine.length !== parsed.length) {
      saveAttendanceList(genuine);
    }
    return genuine;
  } catch (err) {
    console.warn('[StorageService] Error loading attendance file:', err.message);
    return [];
  }
}

function saveAttendanceList(records) {
  ensureDataDirectory();
  try {
    fs.writeFileSync(ATTENDANCE_FILE, JSON.stringify(records, null, 2), 'utf8');
    return true;
  } catch (err) {
    console.error('[StorageService] Error writing attendance file:', err.message);
    return false;
  }
}

function saveAttendance(record) {
  if (!record || !record.sessionId) return;
  const list = loadAttendance();
  const cleanRegNo = (record.regNo || record.studentId || '').toUpperCase();
  const existingIdx = list.findIndex(
    (item) =>
      item.sessionId === record.sessionId &&
      ((item.regNo && item.regNo.toUpperCase() === cleanRegNo) ||
        (item.email && item.email.toLowerCase() === (record.email || '').toLowerCase()))
  );

  const newRecord = {
    _id: record._id || `att_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    ...record,
    timestamp: record.timestamp || new Date().toISOString(),
  };

  if (existingIdx >= 0) {
    list[existingIdx] = { ...list[existingIdx], ...newRecord };
  } else {
    list.unshift(newRecord);
  }
  saveAttendanceList(list);
  return newRecord;
}

function getAttendanceBySession(sessionId) {
  if (!sessionId) return [];
  const cleanId = sessionId.toUpperCase();
  const list = loadAttendance();
  return list.filter((item) => (item.sessionId || '').toUpperCase() === cleanId);
}

function updateAttendeeRecord(recordId, updates) {
  const list = loadAttendance();
  const idx = list.findIndex((a) => a._id === recordId || String(a._id) === String(recordId));
  if (idx >= 0) {
    list[idx] = { ...list[idx], ...updates };
    saveAttendanceList(list);
    return list[idx];
  }
  return null;
}

/**
 * Initialize storage and preload saved sessions into memory
 */
function init(activeSessionsMap) {
  ensureDataDirectory();
  const sessions = loadSessions();
  const attendance = loadAttendance();

  console.log(`[StorageService] Initialized with ${sessions.length} sessions and ${attendance.length} attendance records.`);

  if (activeSessionsMap) {
    sessions.forEach((s) => {
      if (!activeSessionsMap.has(s.sessionId)) {
        activeSessionsMap.set(s.sessionId, {
          sessionId: s.sessionId,
          labIdentifier: s.labIdentifier,
          title: s.title,
          proctorName: s.proctorName,
          presenterName: s.presenterName,
          latitude: typeof s.latitude === 'number' ? s.latitude : null,
          longitude: typeof s.longitude === 'number' ? s.longitude : null,
          isCalibrated: !!s.isCalibrated,
          geofenceEnabled: s.geofenceEnabled !== false,
          allowedRadiusMeters: s.allowedRadiusMeters || 50,
          tokenValiditySeconds: 60,
          currentCountdown: 60,
          currentToken: null,
          previousToken: null,
          qrUrl: null,
          tokenCreatedAt: Date.now(),
          status: s.status || 'TERMINATED',
          isEnded: !!s.isEnded,
          endedAt: s.endedAt,
          terminatedAt: s.terminatedAt,
          createdAt: s.createdAt,
          customFields: s.customFields || { requireMobileNumber: false, requireWifiVerification: false },
        });
      }
    });
  }

  return { sessions, attendance };
}

module.exports = {
  loadSessions,
  saveSessions,
  saveSession,
  updateSession,
  deleteSession,
  loadAttendance,
  saveAttendance,
  saveAttendanceList,
  getAttendanceBySession,
  updateAttendeeRecord,
  init,
  DEFAULT_SEED_SESSIONS,
  DEFAULT_SEED_ATTENDANCE,
};
