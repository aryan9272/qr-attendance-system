const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '../../data');
const SESSIONS_FILE = path.join(DATA_DIR, 'sessions_store.json');
const ATTENDANCE_FILE = path.join(DATA_DIR, 'attendance_store.json');

// Yesterday's default seed sessions (2026-09-06)
const DEFAULT_SEED_SESSIONS = [
  {
    sessionId: 'CS202-A81F',
    labIdentifier: 'OS-LAB',
    title: 'CS202: Advanced Operating Systems Lab',
    proctorName: 'Prof. Sharma',
    presenterName: 'Prof. Sharma',
    status: 'TERMINATED',
    isEnded: true,
    allowedRadiusMeters: 50,
    customFields: { requireMobileNumber: true, requireWifiVerification: false },
    createdAt: '2026-09-06T14:30:00.000Z',
    endedAt: '2026-09-06T16:30:00.000Z',
    terminatedAt: '2026-09-06T16:30:00.000Z',
  },
  {
    sessionId: 'DSA-7C4E',
    labIdentifier: 'DSA-LAB',
    title: 'Data Structures and Algorithms Practical',
    proctorName: 'Dr. Verma',
    presenterName: 'Dr. Verma',
    status: 'TERMINATED',
    isEnded: true,
    allowedRadiusMeters: 50,
    customFields: { requireMobileNumber: false, requireWifiVerification: false },
    createdAt: '2026-09-06T11:00:00.000Z',
    endedAt: '2026-09-06T12:45:00.000Z',
    terminatedAt: '2026-09-06T12:45:00.000Z',
  },
  {
    sessionId: 'CN301-5B9D',
    labIdentifier: 'CN-LAB',
    title: 'Computer Networks Lab Session',
    proctorName: 'Faculty In-Charge',
    presenterName: 'Faculty In-Charge',
    status: 'TERMINATED',
    isEnded: true,
    allowedRadiusMeters: 60,
    customFields: { requireMobileNumber: false, requireWifiVerification: false },
    createdAt: '2026-09-06T09:15:00.000Z',
    endedAt: '2026-09-06T10:45:00.000Z',
    terminatedAt: '2026-09-06T10:45:00.000Z',
  },
];

// Seed attendance records for yesterday's sessions
const DEFAULT_SEED_ATTENDANCE = [
  {
    _id: 'att_seed_01',
    sessionId: 'CS202-A81F',
    studentId: '21BCE1042',
    regNo: '21BCE1042',
    studentName: 'Aarav Patel',
    email: 'aarav.patel@college.edu',
    year: '3rd Year',
    branch: 'Computer Science and Engineering',
    mobileNumber: '+91 9876543210',
    verificationMode: 'GPS_VERIFIED',
    distanceFromTargetMeters: 12,
    timestamp: '2026-09-06T14:35:10.000Z',
  },
  {
    _id: 'att_seed_02',
    sessionId: 'CS202-A81F',
    studentId: '21BCE1088',
    regNo: '21BCE1088',
    studentName: 'Sneha Kulkarni',
    email: 'sneha.k@college.edu',
    year: '3rd Year',
    branch: 'Computer Science and Engineering',
    mobileNumber: '+91 9876543211',
    verificationMode: 'GPS_VERIFIED',
    distanceFromTargetMeters: 8,
    timestamp: '2026-09-06T14:36:40.000Z',
  },
  {
    _id: 'att_seed_03',
    sessionId: 'CS202-A81F',
    studentId: '21BCE1104',
    regNo: '21BCE1104',
    studentName: 'Rohan Deshmukh',
    email: 'rohan.d@college.edu',
    year: '3rd Year',
    branch: 'Computer Science and Engineering',
    mobileNumber: '+91 9876543212',
    verificationMode: 'ADMIN_MANUAL_OVERRIDE',
    overrideReason: 'GPS drift inside basement lab',
    distanceFromTargetMeters: 0,
    timestamp: '2026-09-06T14:40:15.000Z',
  },
  {
    _id: 'att_seed_04',
    sessionId: 'DSA-7C4E',
    studentId: '22BCE2015',
    regNo: '22BCE2015',
    studentName: 'Ananya Sharma',
    email: 'ananya.s@college.edu',
    year: '2nd Year',
    branch: 'Information Technology',
    mobileNumber: '+91 9876543213',
    verificationMode: 'GPS_VERIFIED',
    distanceFromTargetMeters: 15,
    timestamp: '2026-09-06T11:05:22.000Z',
  },
  {
    _id: 'att_seed_05',
    sessionId: 'DSA-7C4E',
    studentId: '22BCE2033',
    regNo: '22BCE2033',
    studentName: 'Vikram Joshi',
    email: 'vikram.j@college.edu',
    year: '2nd Year',
    branch: 'Information Technology',
    mobileNumber: '+91 9876543214',
    verificationMode: 'GPS_VERIFIED',
    distanceFromTargetMeters: 18,
    timestamp: '2026-09-06T11:08:50.000Z',
  },
  {
    _id: 'att_seed_06',
    sessionId: 'CN301-5B9D',
    studentId: '21ECE3001',
    regNo: '21ECE3001',
    studentName: 'Pooja Nair',
    email: 'pooja.n@college.edu',
    year: '3rd Year',
    branch: 'Electronics and Communication',
    mobileNumber: '+91 9876543215',
    verificationMode: 'GPS_VERIFIED',
    distanceFromTargetMeters: 22,
    timestamp: '2026-09-06T09:20:18.000Z',
  },
];

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
      saveSessions(DEFAULT_SEED_SESSIONS);
      return [...DEFAULT_SEED_SESSIONS];
    }
    const raw = fs.readFileSync(SESSIONS_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) {
      saveSessions(DEFAULT_SEED_SESSIONS);
      return [...DEFAULT_SEED_SESSIONS];
    }
    return parsed;
  } catch (err) {
    console.warn('[StorageService] Error loading sessions file, using fallback seeds:', err.message);
    return [...DEFAULT_SEED_SESSIONS];
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
      saveAttendanceList(DEFAULT_SEED_ATTENDANCE);
      return [...DEFAULT_SEED_ATTENDANCE];
    }
    const raw = fs.readFileSync(ATTENDANCE_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) {
      saveAttendanceList(DEFAULT_SEED_ATTENDANCE);
      return [...DEFAULT_SEED_ATTENDANCE];
    }
    return parsed;
  } catch (err) {
    console.warn('[StorageService] Error loading attendance file:', err.message);
    return [...DEFAULT_SEED_ATTENDANCE];
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
