import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import { io } from 'socket.io-client';

export const getBackendUrl = () => {
  if (import.meta.env.VITE_BACKEND_URL) {
    return import.meta.env.VITE_BACKEND_URL.replace(/\/$/, '');
  }
  if (import.meta.env.VITE_API_BASE_URL) {
    return import.meta.env.VITE_API_BASE_URL.replace(/\/$/, '');
  }
  if (typeof window !== 'undefined' && window.location && window.location.hostname) {
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
      return 'http://localhost:5000';
    }
    return `http://${window.location.hostname}:5000`;
  }
  return 'http://localhost:5000';
};

export const PUBLIC_BACKEND_URL = getBackendUrl();

const SocketContext = createContext({
  socket: null,
  connected: false,
  qrData: null,
  countdown: 60,
  currentSessionId: null,
  backendUrl: PUBLIC_BACKEND_URL,
  joinSession: () => {},
  forceRotateQR: () => {},
  updateGeofenceRadius: () => {},
});

export const SocketProvider = ({ children }) => {
  const [socket, setSocket] = useState(null);
  const [connected, setConnected] = useState(false);
  const [qrData, setQrData] = useState(null);
  const [countdown, setCountdown] = useState(60);
  const [currentSessionId, setCurrentSessionId] = useState(null);
  const currentSessionIdRef = useRef(currentSessionId);
  const backendUrl = getBackendUrl();

  useEffect(() => {
    currentSessionIdRef.current = currentSessionId;
  }, [currentSessionId]);

  useEffect(() => {
    console.log('[Socket.IO Frontend] Connecting to backend server:', backendUrl);
    const newSocket = io(backendUrl, {
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 20,
      reconnectionDelay: 1000,
      withCredentials: true,
    });

    newSocket.on('connect', () => {
      console.log('[Socket.IO Frontend] Connected successfully:', newSocket.id);
      setConnected(true);
      if (currentSessionIdRef.current) {
        newSocket.emit('join-session', { sessionId: currentSessionIdRef.current });
      }
    });

    newSocket.on('disconnect', () => {
      console.log('[Socket.IO Frontend] Disconnected from server');
      setConnected(false);
    });

    newSocket.on('qr-update', (data) => {
      console.log('[Socket.IO Frontend] QR Token Updated for session:', data.sessionId);
      setQrData(data);
      if (typeof data.remainingSeconds === 'number') {
        setCountdown(data.remainingSeconds);
      }
    });

    newSocket.on('qr-tick', (data) => {
      if (typeof data.remainingSeconds === 'number') {
        setCountdown(data.remainingSeconds);
      }
      if (data.currentToken) {
        setQrData((prev) => (prev ? { ...prev, ...data } : data));
      }
    });

    newSocket.on('geofence_updated', (data) => {
      setQrData((prev) => (prev ? { ...prev, allowedRadiusMeters: data.allowedRadiusMeters } : prev));
    });

    newSocket.on('session_status_changed', (data) => {
      setQrData((prev) => (prev ? { ...prev, status: data.status } : prev));
    });

    newSocket.on('force_admin_logout', () => {
      console.warn('[Socket.IO Frontend] Received force_admin_logout event from server.');
      localStorage.removeItem('admin_token');
      localStorage.removeItem('admin_user');
      sessionStorage.clear();
      sessionStorage.setItem('logout_alert_msg', 'This session has been terminated by an administrator.');
      if (typeof window !== 'undefined' && window.location.pathname !== '/admin/login' && window.location.pathname !== '/scan') {
        window.location.href = '/admin/login';
      }
    });

    setSocket(newSocket);

    return () => {
      newSocket.disconnect();
    };
  }, [backendUrl]);

  const joinSession = (sessionId) => {
    if (!sessionId) return;
    const cleanId = String(sessionId).trim().toUpperCase();
    setCurrentSessionId(cleanId);
    currentSessionIdRef.current = cleanId;
    if (socket && connected) {
      socket.emit('join-session', { sessionId: cleanId });
    }
  };

  const forceRotateQR = (sessionId) => {
    const cleanId = (sessionId || currentSessionId).toUpperCase();
    if (socket && connected) {
      socket.emit('force-rotate-qr', { sessionId: cleanId });
    }
  };

  const updateGeofenceRadius = (sessionId, allowedRadiusMeters) => {
    const cleanId = (sessionId || currentSessionId).toUpperCase();
    if (socket && connected) {
      socket.emit('update-geofence-radius', { sessionId: cleanId, allowedRadiusMeters });
    }
  };

  return (
    <SocketContext.Provider
      value={{
        socket,
        connected,
        qrData,
        countdown,
        currentSessionId,
        backendUrl,
        joinSession,
        joinEvent: joinSession, // Backward compatibility alias
        forceRotateQR,
        updateGeofenceRadius,
      }}
    >
      {children}
    </SocketContext.Provider>
  );
};

export const useSocket = () => useContext(SocketContext);
