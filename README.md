# Location-Aware Smart QR Attendance System

A production-ready, location-aware QR attendance system built with Node.js, Express, Socket.IO, Mongoose, Geolib, React (Vite), and Tailwind CSS in a modern futuristic Glassmorphic Dark UI theme.

---

## Key Features

1. **AES-256-CBC Dynamic Token Encryption & Expiry**:
   - Backend continuously generates dynamic encrypted tokens containing event metadata and high-precision timestamps.
   - Tokens expire strictly after **60 seconds** to prevent photo-sharing and attendance fraud.

2. **Geofencing Verification via Geolib**:
   - Compares student's browser GPS coordinates `[latitude, longitude]` against the target classroom coordinates.
   - Rejects submissions outside the allowed radius threshold (e.g. 50 meters).

3. **Unique Database Constraints**:
   - Mongoose `Attendance` schema includes compound unique index `{ user: 1, event: 1 }` preventing double-marking / duplicate entries.

4. **Real-time WebSockets (Socket.IO)**:
   - Synchronous token rotation and countdown timer ticks every second across connected clients.
   - Real-time attendee counter and scan log feed update automatically as students verify.

5. **Futuristic Glassmorphic Dark UI**:
   - Built using React, Vite, and Tailwind CSS.
   - **Faculty Portal (`FacultyQRDisplay.jsx`)**: Large dynamic QR display with visual progress bar, stats counter, and event switcher.
   - **Student Scanner (`StudentScanner.jsx`)**: Browser Geolocation API capture, live camera scanner with text paste fallback, and desktop location simulator.

---

## Directory Architecture

```
qr-attendance-system/
├── backend/
│   ├── src/
│   │   ├── config/db.js             # Mongoose connection & fallback mode
│   │   ├── controllers/
│   │   │   └── attendanceController.js # Verification logic & geofence checks
│   │   ├── models/
│   │   │   ├── Attendance.js       # Unique (user, event) index schema
│   │   │   └── Event.js            # Event metadata schema
│   │   ├── routes/
│   │   │   └── attendanceRoutes.js # REST routes
│   │   ├── services/
│   │   │   ├── cryptoService.js    # AES-256-CBC token encryption/decryption
│   │   │   └── socketService.js    # Socket.IO 60s rotation loop
│   │   └── server.js               # Express & Socket.IO server
│   ├── .env                        # AES secret key & Mongo URI
│   ├── package.json
│   └── test-crypto.js              # Unit verification test script
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── FacultyQRDisplay.jsx # Live QR display & countdown bar
│   │   │   ├── StudentScanner.jsx   # GPS capture & QR camera scanner
│   │   │   ├── VerificationResultModal.jsx # Feedback modal
│   │   │   └── Navbar.jsx           # View switcher
│   │   ├── context/SocketContext.jsx# Socket.IO context hook
│   │   ├── App.jsx
│   │   ├── index.css
│   │   └── main.jsx
│   ├── vite.config.js
│   ├── tailwind.config.js
│   └── package.json
├── start-all.bat                   # Windows one-click batch launcher
└── README.md
```

---

## Quick Start Guide

### Option A: Launching via Batch Script (Windows)
Double-click `start-all.bat` or run:
```cmd
start-all.bat
```

### Option B: Manual Terminal Execution

1. **Start Backend Server**:
   ```bash
   cd backend
   npm start
   ```
   *Runs on `http://localhost:5000`*

2. **Start Frontend Vite Server**:
   ```bash
   cd frontend
   npm run dev
   ```
   *Runs on `http://localhost:5173`*

---

## Verification & Testing API Endpoint

### `POST /api/attendance/verify`
```json
{
  "token": "<AES_256_CBC_ENCRYPTED_STRING>",
  "studentId": "STU2026-1042",
  "studentName": "Alex Rivera",
  "userLocation": {
    "latitude": 28.6139,
    "longitude": 77.2090
  },
  "eventId": "CS101-LECTURE"
}
```
