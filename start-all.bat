@echo off
echo ========================================================
echo   Launching Location-Aware Smart QR Attendance System
echo ========================================================
echo.
echo Starting Backend Express & Socket.IO server on http://localhost:5000 ...
start "Backend Server" cmd /k "cd /d %~dp0backend && npm start"

echo.
echo Starting Frontend Vite server on http://localhost:5173 ...
start "Frontend Vite App" cmd /k "cd /d %~dp0frontend && npm run dev"

echo.
echo ========================================================
echo Backend and Frontend servers launched in new windows!
echo Faculty Portal & Student Scanner: http://localhost:5173
echo Backend API Endpoint: http://localhost:5000/api/attendance/verify
echo ========================================================
