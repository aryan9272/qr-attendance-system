const os = require('os');
const { encryptToken } = require('./cryptoService');

function getLocalNetworkIp() {
  if (process.env.SERVER_IP) return process.env.SERVER_IP;
  const interfaces = os.networkInterfaces();
  let wifiIp = null;
  let preferredIp = null;

  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        if (iface.address.startsWith('10.70.41.')) {
          return iface.address;
        }
        if (iface.address.startsWith('10.')) {
          preferredIp = iface.address;
        }
        if (/wi-fi|wifi|wlan|ethernet/i.test(name)) {
          wifiIp = iface.address;
        }
      }
    }
  }
  return wifiIp || preferredIp || '10.70.41.236';
}

const activeNetworkIp = getLocalNetworkIp();
const frontendPort = 5173;

// Active sessions Map tracking multi-stop status ('active' | 'paused' | 'ended')
const activeSessions = new Map();

function initSocketService(io) {
  if (!activeSessions.has('CS101-LECTURE')) {
    activeSessions.set('CS101-LECTURE', {
      eventId: 'CS101-LECTURE',
      eventName: 'CS101: Data Structures & Algorithms',
      latitude: 28.6139,
      longitude: 77.2090,
      allowedRadiusMeters: 50,
      tokenValiditySeconds: 60,
      currentCountdown: 60,
      currentToken: null,
      qrUrl: null,
      tokenCreatedAt: Date.now(),
      status: 'paused', // Default idle until faculty clicks "Start Session"
      isEnded: false,
      customFields: {
        requireMobileNumber: false,
      },
    });
  }

  // Master timer interval running every second to count down and rotate tokens smoothly
  setInterval(() => {
    activeSessions.forEach((session, eventId) => {
      if (session.status !== 'active') return;

      session.currentCountdown -= 1;

      io.to(`event:${eventId}`).emit('qr-tick', {
        eventId,
        remainingSeconds: session.currentCountdown,
        totalSeconds: session.tokenValiditySeconds,
        currentToken: session.currentToken,
        qrUrl: session.qrUrl,
        createdAt: session.tokenCreatedAt,
        status: session.status,
        isEnded: false,
        customFields: session.customFields,
      });

      if (session.currentCountdown <= 0) {
        rotateToken(io, eventId);
      }
    });
  }, 1000);

  io.on('connection', (socket) => {
    console.log(`[Socket.IO] Client connected: ${socket.id}`);

    socket.on('join-event', (data) => {
      const eventId = typeof data === 'string' ? data : data?.eventId || 'CS101-LECTURE';
      socket.join(`event:${eventId}`);

      let session = activeSessions.get(eventId);
      if (!session) {
        session = {
          eventId,
          eventName: data?.eventName || `Event ${eventId}`,
          latitude: data?.latitude ?? 28.6139,
          longitude: data?.longitude ?? 77.2090,
          allowedRadiusMeters: data?.allowedRadiusMeters ?? 50,
          tokenValiditySeconds: 60,
          currentCountdown: 60,
          currentToken: null,
          qrUrl: null,
          tokenCreatedAt: Date.now(),
          status: 'paused',
          isEnded: false,
          customFields: data?.customFields || { requireMobileNumber: false },
        };
        activeSessions.set(eventId, session);
      }

      socket.emit('qr-update', {
        eventId: session.eventId,
        token: session.currentToken,
        qrUrl: session.qrUrl,
        remainingSeconds: session.currentCountdown,
        totalSeconds: session.tokenValiditySeconds,
        createdAt: session.tokenCreatedAt,
        latitude: session.latitude,
        longitude: session.longitude,
        allowedRadiusMeters: session.allowedRadiusMeters,
        status: session.status,
        isEnded: session.status !== 'active',
        customFields: session.customFields,
      });
    });

    socket.on('start-session', ({ eventId }) => {
      const targetId = eventId || 'CS101-LECTURE';
      startSession(io, targetId);
    });

    socket.on('end-session', ({ eventId }) => {
      const targetId = eventId || 'CS101-LECTURE';
      pauseSession(io, targetId);
    });

    socket.on('force-rotate-qr', ({ eventId }) => {
      const targetId = eventId || 'CS101-LECTURE';
      rotateToken(io, targetId);
    });

    socket.on('disconnect', () => {
      console.log(`[Socket.IO] Client disconnected: ${socket.id}`);
    });
  });
}

function startSession(io, eventId) {
  let session = activeSessions.get(eventId);
  if (!session) return;

  session.status = 'active';
  session.isEnded = false;
  console.log(`[Socket.IO] SESSION STARTED / RESUMED for ${eventId}`);

  rotateToken(io, eventId);
}

function pauseSession(io, eventId) {
  let session = activeSessions.get(eventId);
  if (!session) return;

  session.status = 'paused';
  session.isEnded = true;
  session.currentToken = null;
  session.qrUrl = null;

  console.log(`[Socket.IO] SESSION PAUSED for ${eventId}`);

  io.to(`event:${eventId}`).emit('session-ended', {
    eventId,
    message: 'Session is currently paused by the faculty instructor.',
    status: 'paused',
    isEnded: true,
  });

  io.to(`event:${eventId}`).emit('qr-update', {
    eventId: session.eventId,
    token: null,
    qrUrl: null,
    remainingSeconds: 0,
    status: 'paused',
    isEnded: true,
    customFields: session.customFields,
  });
}

function rotateToken(io, eventId) {
  let session = activeSessions.get(eventId);
  if (!session || session.status !== 'active') return;

  const now = Date.now();
  const payload = {
    eventId: session.eventId,
    eventName: session.eventName,
    latitude: session.latitude,
    longitude: session.longitude,
    allowedRadiusMeters: session.allowedRadiusMeters,
    timestamp: now,
  };

  const token = encryptToken(payload);
  session.currentToken = token;
  session.currentCountdown = session.tokenValiditySeconds;
  session.tokenCreatedAt = now;

  const hostDomain = process.env.PUBLIC_FRONTEND_URL || `http://${activeNetworkIp}:${frontendPort}`;
  session.qrUrl = `${hostDomain}/scan?token=${encodeURIComponent(token)}`;

  io.to(`event:${eventId}`).emit('qr-update', {
    eventId: session.eventId,
    token: session.currentToken,
    qrUrl: session.qrUrl,
    remainingSeconds: session.currentCountdown,
    totalSeconds: session.tokenValiditySeconds,
    createdAt: session.tokenCreatedAt,
    latitude: session.latitude,
    longitude: session.longitude,
    allowedRadiusMeters: session.allowedRadiusMeters,
    status: 'active',
    isEnded: false,
    customFields: session.customFields,
  });
}

module.exports = {
  initSocketService,
  rotateToken,
  startSession,
  pauseSession,
  endSession: pauseSession,
  activeSessions,
  getLocalNetworkIp,
};
