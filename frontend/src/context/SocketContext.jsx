import React, { createContext, useContext, useEffect, useState } from 'react';
import { io } from 'socket.io-client';

export const getBackendUrl = () => {
  if (typeof window !== 'undefined' && window.location && window.location.hostname) {
    return `http://${window.location.hostname}:5000`;
  }
  return import.meta.env.VITE_BACKEND_URL || import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000';
};

export const PUBLIC_BACKEND_URL = getBackendUrl();

const SocketContext = createContext({
  socket: null,
  connected: false,
  qrData: null,
  countdown: 60,
  backendUrl: PUBLIC_BACKEND_URL,
  joinEvent: () => {},
  forceRotateQR: () => {},
});

export const SocketProvider = ({ children }) => {
  const [socket, setSocket] = useState(null);
  const [connected, setConnected] = useState(false);
  const [qrData, setQrData] = useState(null);
  const [countdown, setCountdown] = useState(60);
  const backendUrl = getBackendUrl();

  useEffect(() => {
    console.log('[Socket.IO Frontend] Connecting to backend server:', backendUrl);
    const newSocket = io(backendUrl, {
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 20,
      reconnectionDelay: 1000,
    });

    newSocket.on('connect', () => {
      console.log('[Socket.IO Frontend] Connected successfully:', newSocket.id);
      setConnected(true);
      newSocket.emit('join-event', { eventId: 'CS101-LECTURE' });
    });

    newSocket.on('disconnect', () => {
      console.log('[Socket.IO Frontend] Disconnected from server');
      setConnected(false);
    });

    newSocket.on('qr-update', (data) => {
      console.log('[Socket.IO Frontend] QR Token Updated for event:', data.eventId);
      setQrData(data);
      if (typeof data.remainingSeconds === 'number') {
        setCountdown(data.remainingSeconds);
      }
    });

    newSocket.on('qr-tick', (data) => {
      if (typeof data.remainingSeconds === 'number') {
        setCountdown(data.remainingSeconds);
      }
    });

    setSocket(newSocket);

    return () => {
      newSocket.disconnect();
    };
  }, [backendUrl]);

  const joinEvent = (eventId) => {
    if (socket && connected) {
      socket.emit('join-event', { eventId });
    }
  };

  const forceRotateQR = (eventId) => {
    if (socket && connected) {
      socket.emit('force-rotate-qr', { eventId });
    }
  };

  return (
    <SocketContext.Provider
      value={{
        socket,
        connected,
        qrData,
        countdown,
        backendUrl,
        joinEvent,
        forceRotateQR,
      }}
    >
      {children}
    </SocketContext.Provider>
  );
};

export const useSocket = () => useContext(SocketContext);
