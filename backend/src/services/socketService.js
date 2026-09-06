const os = require('os');
const { encryptToken } = require('./cryptoService');
const Event = require('../models/Event');
const Attendance = require('../models/Attendance');

const { getIsConnected } = require('../config/db');

function getLocalNetworkIp() {
  if (process.env.SERVER_IP) return process.env.SERVER_IP;
  const interfaces = os.networkInterfaces();
  let wifiIp = null;
  let preferredIp = null;

  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        if (iface.address.startsWith('10.')) {
          preferredIp = iface.address;
        }
        if (/wi-fi|wifi|wlan|ethernet/i.test(name)) {
          wifiIp = iface.address;
        }
      }
    }
  }
  return wifiIp || preferredIp || '127.0.0.1';
}

const activeNetworkIp = getLocalNetworkIp();
const frontendPort = 5173;

// Active Sessions Map tracking multi-lab isolation by sessionId
// Key: sessionId (e.g. 'LAB101-X7K9')
const activeSessions = new Map();

function initSocketService(io) {
  // Master timer interval running every second to count down and rotate tokens smoothly
  setInterval(() => {
    activeSessions.forEach((session, sessionId) => {
      if (session.status !== 'ACTIVE') return;

      session.currentCountdown -= 1;

      io.to(`session:${sessionId}`).emit('qr-tick', {
        sessionId,
        remainingSeconds: session.currentCountdown,
        totalSeconds: session.tokenValiditySeconds,
        currentToken: session.currentToken,
        previousToken: session.previousToken,
        qrUrl: session.qrUrl,
        createdAt: session.tokenCreatedAt,
        status: session.status,
        allowedRadiusMeters: session.allowedRadiusMeters,
        customFields: session.customFields,
      });

      if (session.currentCountdown <= 0) {
        rotateToken(io, sessionId);
      }
    });
  }, 1000);

  io.on('connection', (socket) => {
    console.log(`[Socket.IO] Client connected: ${socket.id}`);

    // Join isolated session room
    socket.on('join-session', async (data) => {
      const sessionId = typeof data === 'string'
        ? data.trim().toUpperCase()
        : (data?.sessionId ? String(data.sessionId).trim().toUpperCase() : null);

      if (!sessionId) {
        socket.emit('qr-update', {
          sessionId: null,
          status: 'NO_ACTIVE_SESSION',
          message: 'No session specified.',
        });
        return;
      }

      socket.join(`session:${sessionId}`);

      let session = activeSessions.get(sessionId);

      // If not in memory, try loading from MongoDB if connected
      if (!session && getIsConnected()) {
        try {
          const dbEvent = await Event.findOne({ sessionId });
          if (dbEvent && dbEvent.status !== 'TERMINATED') {
            session = {
              sessionId: dbEvent.sessionId,
              labIdentifier: dbEvent.labIdentifier,
              title: dbEvent.title,
              proctorName: dbEvent.proctorName,
              latitude: 28.6139,
              longitude: 77.2090,
              allowedRadiusMeters: dbEvent.allowedRadiusMeters || 50,
              tokenValiditySeconds: 60,
              currentCountdown: 60,
              currentToken: null,
              previousToken: null,
              qrUrl: null,
              tokenCreatedAt: Date.now(),
              status: dbEvent.status || 'PAUSED',
              customFields: dbEvent.customFields || { requireMobileNumber: false, requireWifiVerification: false },
            };
            activeSessions.set(sessionId, session);
          }
        } catch (e) {}
      }

      // If session does not exist, return NO_ACTIVE_SESSION
      if (!session) {
        socket.emit('qr-update', {
          sessionId,
          status: 'NO_ACTIVE_SESSION',
          message: 'Session not found or has been terminated.',
        });
        return;
      }

      socket.emit('qr-update', {
        sessionId: session.sessionId,
        labIdentifier: session.labIdentifier,
        title: session.title,
        proctorName: session.proctorName,
        token: session.currentToken,
        previousToken: session.previousToken,
        qrUrl: session.qrUrl,
        remainingSeconds: session.currentCountdown,
        totalSeconds: session.tokenValiditySeconds,
        createdAt: session.tokenCreatedAt,
        allowedRadiusMeters: session.allowedRadiusMeters,
        status: session.status,
        customFields: session.customFields,
      });
    });

    // Backward compatibility alias for join-event
    socket.on('join-event', (data) => {
      const sid = typeof data === 'string' ? data : data?.eventId || data?.sessionId;
      if (sid) {
        socket.emit('join-session', { sessionId: sid });
      }
    });

    // Admin Geofence Radius Slider Update
    socket.on('update-geofence-radius', ({ sessionId, allowedRadiusMeters }) => {
      if (!sessionId) return;
      const targetId = String(sessionId).trim().toUpperCase();
      const radius = Number(allowedRadiusMeters) || 50;

      let session = activeSessions.get(targetId);
      if (session) {
        session.allowedRadiusMeters = radius;
      }

      if (getIsConnected()) {
        Event.updateOne({ sessionId: targetId }, { allowedRadiusMeters: radius }).catch(() => {});
      }

      io.to(`session:${targetId}`).emit('geofence_updated', {
        sessionId: targetId,
        allowedRadiusMeters: radius,
      });
    });

    socket.on('start-session', ({ sessionId }) => {
      if (!sessionId) return;
      const targetId = String(sessionId).trim().toUpperCase();
      startSession(io, targetId);
    });

    socket.on('pause-session', ({ sessionId }) => {
      if (!sessionId) return;
      const targetId = String(sessionId).trim().toUpperCase();
      pauseSession(io, targetId);
    });

    socket.on('force-rotate-qr', ({ sessionId }) => {
      if (!sessionId) return;
      const targetId = String(sessionId).trim().toUpperCase();
      rotateToken(io, targetId);
    });

    socket.on('disconnect', () => {
      console.log(`[Socket.IO] Client disconnected: ${socket.id}`);
    });
  });
}

function startSession(io, sessionId) {
  let session = activeSessions.get(sessionId);
  if (!session) return;

  session.status = 'ACTIVE';
  console.log(`[Socket.IO] SESSION STARTED for ${sessionId}`);

  Event.updateOne({ sessionId }, { status: 'ACTIVE' }).catch(() => {});

  io.to(`session:${sessionId}`).emit('session_status_changed', {
    sessionId,
    status: 'ACTIVE',
  });

  rotateToken(io, sessionId);
}

function pauseSession(io, sessionId) {
  let session = activeSessions.get(sessionId);
  if (!session) return;

  session.status = 'PAUSED';
  console.log(`[Socket.IO] SESSION PAUSED for ${sessionId}`);

  Event.updateOne({ sessionId }, { status: 'PAUSED' }).catch(() => {});

  io.to(`session:${sessionId}`).emit('session_status_changed', {
    sessionId,
    status: 'PAUSED',
  });

  io.to(`session:${sessionId}`).emit('qr-update', {
    sessionId: session.sessionId,
    token: null,
    previousToken: null,
    qrUrl: null,
    remainingSeconds: 0,
    status: 'PAUSED',
    customFields: session.customFields,
  });
}

function terminateSession(io, sessionId) {
  let session = activeSessions.get(sessionId);
  if (session) {
    session.status = 'TERMINATED';
    session.currentToken = null;
    session.previousToken = null;
    session.qrUrl = null;
  }

  Event.updateOne({ sessionId }, { status: 'TERMINATED', terminatedAt: new Date() }).catch(() => {});

  io.to(`session:${sessionId}`).emit('session_status_changed', {
    sessionId,
    status: 'TERMINATED',
  });

  io.to(`session:${sessionId}`).emit('qr-update', {
    sessionId,
    token: null,
    previousToken: null,
    qrUrl: null,
    remainingSeconds: 0,
    status: 'TERMINATED',
  });
}

function rotateToken(io, sessionId) {
  let session = activeSessions.get(sessionId);
  if (!session || session.status !== 'ACTIVE') return;

  const now = Date.now();
  const payload = {
    sessionId: session.sessionId,
    labIdentifier: session.labIdentifier,
    latitude: session.latitude,
    longitude: session.longitude,
    allowedRadiusMeters: session.allowedRadiusMeters,
    timestamp: now,
  };

  // Shift current token to previousToken for 20s Grace Period
  session.previousToken = session.currentToken;
  session.currentToken = encryptToken(payload);
  session.currentCountdown = session.tokenValiditySeconds;
  session.tokenCreatedAt = now;

  const hostDomain = process.env.PUBLIC_FRONTEND_URL || process.env.VITE_APP_URL || `http://${activeNetworkIp}:${frontendPort}`;
  session.qrUrl = `${hostDomain}/scan?token=${encodeURIComponent(session.currentToken)}`;

  io.to(`session:${sessionId}`).emit('qr-update', {
    sessionId: session.sessionId,
    token: session.currentToken,
    previousToken: session.previousToken,
    qrUrl: session.qrUrl,
    remainingSeconds: session.currentCountdown,
    totalSeconds: session.tokenValiditySeconds,
    createdAt: session.tokenCreatedAt,
    allowedRadiusMeters: session.allowedRadiusMeters,
    status: 'ACTIVE',
    customFields: session.customFields,
  });
}

module.exports = {
  initSocketService,
  rotateToken,
  startSession,
  pauseSession,
  terminateSession,
  activeSessions,
  getLocalNetworkIp,
};
