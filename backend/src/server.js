const express = require('express');
const http = require('http');
const dns = require('dns');

// Force IPv4 resolution across Node.js process to fix IPv6 ENETUNREACH cloud errors on Render
if (dns.setDefaultResultOrder) {
  dns.setDefaultResultOrder('ipv4first');
}

const { Server } = require('socket.io');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const dotenv = require('dotenv');
const path = require('path');

// Load environment variables from both root and backend directory
dotenv.config();
dotenv.config({ path: path.join(__dirname, '../.env') });
dotenv.config({ path: path.join(__dirname, '../../.env') });

const { connectDB } = require('./config/db');
const attendanceRoutes = require('./routes/attendanceRoutes');
const adminRoutes = require('./routes/adminRoutes');
const { initSocketService, getLocalNetworkIp } = require('./services/socketService');

const app = express();
const server = http.createServer(app);

// Initialize Socket.IO with CORS
const io = new Server(server, {
  cors: {
    origin: (origin, callback) => callback(null, true),
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    credentials: true,
  },
});

// Middleware Configuration
app.use(
  cors({
    origin: (origin, callback) => callback(null, true),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-admin-token', 'x-faculty-token'],
  })
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Attach Socket.IO instance to HTTP requests
app.use((req, res, next) => {
  req.io = io;
  next();
});

// API Routes
app.use('/api/attendance', attendanceRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/faculty', adminRoutes); // Alias for backward compatibility
app.use('/api/session', attendanceRoutes); // Direct session endpoints
app.use('/api/sessions', attendanceRoutes); // Direct plural sessions endpoints

// Health Check Route
app.get('/api/health', (req, res) => {
  res.json({
    status: 'online',
    system: 'ProxyQr Admin Security & Attendance Portal Server',
    serverIp: getLocalNetworkIp(),
    timestamp: new Date(),
  });
});

// Initialize Socket.IO dynamic session rooms
initSocketService(io);

// Start Server & Database Connection
const PORT = process.env.PORT || 5000;
const localIp = getLocalNetworkIp();

connectDB().then(() => {
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`====================================================`);
    console.log(`🚀 ProxyQr Admin Backend Server running!`);
    console.log(`📍 Localhost API:   http://localhost:${PORT}/api/attendance/verify`);
    console.log(`🌐 Network API:     http://${localIp}:${PORT}/api/attendance/verify`);
    console.log(`🔒 Admin Auth:      http://${localIp}:${PORT}/api/admin/auth/login`);
    console.log(`⚡ WebSocket Server: ws://${localIp}:${PORT}`);
    console.log(`====================================================`);
  });
});

module.exports = { app, server, io };
