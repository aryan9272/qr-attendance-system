const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const dotenv = require('dotenv');

dotenv.config();

const { connectDB } = require('./config/db');
const attendanceRoutes = require('./routes/attendanceRoutes');
const facultyRoutes = require('./routes/facultyRoutes');
const { initSocketService, getLocalNetworkIp } = require('./services/socketService');

const app = express();
const server = http.createServer(app);

// Initialize Socket.IO with CORS
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    credentials: true,
  },
});

// =========================================================================
// REQUIREMENT 3 & 4: CORS and Body Parser Middleware Placed ABOVE Routes
// =========================================================================
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps, curl, postman) or any frontend origin
      callback(null, true);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-faculty-token'],
  })
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Attach Socket.IO instance to HTTP requests
app.use((req, res, next) => {
  req.io = io;
  next();
});

// API Routes
app.use('/api/attendance', attendanceRoutes);
app.use('/api/faculty', facultyRoutes);

// Root Health Check Route
app.get('/api/health', (req, res) => {
  res.json({
    status: 'online',
    system: 'Smart QR Attendance System Backend',
    serverIp: getLocalNetworkIp(),
    timestamp: new Date(),
  });
});

// Initialize Socket.IO dynamic QR loops
initSocketService(io);

// Start Server & Database
const PORT = process.env.PORT || 5000;
const localIp = getLocalNetworkIp();

connectDB().then(() => {
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`====================================================`);
    console.log(`🚀 Smart QR Attendance Backend Server running!`);
    console.log(`📍 Localhost API:   http://localhost:${PORT}/api/attendance/verify`);
    console.log(`🌐 Network API:     http://${localIp}:${PORT}/api/attendance/verify`);
    console.log(`🔒 Faculty Auth:    http://${localIp}:${PORT}/api/faculty/auth/google`);
    console.log(`⚡ WebSocket Server: ws://${localIp}:${PORT}`);
    console.log(`====================================================`);
  });
});

module.exports = { app, server, io };
