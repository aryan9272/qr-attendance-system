import React, { useState, useEffect } from 'react';
import {
  CheckCircle2,
  AlertTriangle,
  User,
  Hash,
  Send,
  RefreshCw,
  Sparkles,
  Lock,
  Mail,
  ShieldCheck,
  BookOpen,
  GraduationCap,
  Phone,
  Pause,
  Edit2,
  Check,
} from 'lucide-react';
import VerificationResultModal from './VerificationResultModal';
import { useSocket } from '../context/SocketContext';

const DEPARTMENTS = [
  'Information Technology',
  'Electronics and Telecommunication Engineering',
  'Computer Science and Engineering',
  'Instrumentation Engineering',
  'Production Engineering',
  'Civil and Water Management Engineering',
  'Mechanical Engineering',
  'Textile Engineering',
  'Chemical Technology/Engineering',
  'Electrical Engineering',
];

const YEARS = [
  'B.Tech - 1st Year',
  'B.Tech - 2nd Year',
  'B.Tech - 3rd Year',
  'B.Tech - 4th Year',
  'M.Tech - 1st Year',
  'M.Tech - 2nd Year',
  'Ph.D',
];

// Helper to generate or retrieve persistent Device UUID (Anti-Proxy Lock)
function getOrCreateDeviceUuid() {
  try {
    let uuid = localStorage.getItem('proxyqr_device_uuid');
    if (!uuid) {
      uuid = 'DEV-' + Math.random().toString(36).substring(2, 11) + '-' + Date.now();
      localStorage.setItem('proxyqr_device_uuid', uuid);
      document.cookie = `proxyqr_device_uuid=${uuid}; path=/; max-age=31536000; SameSite=Lax`;
    }
    return uuid;
  } catch (e) {
    return 'DEV-UNKNOWN-' + Date.now();
  }
}

export default function StudentScanner() {
  const { qrData, backendUrl } = useSocket();

  // Extract AES token directly from URL query params
  const [tokenFromUrl, setTokenFromUrl] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('token') || '';
  });

  const deviceUuid = getOrCreateDeviceUuid();

  // Cached Profile State
  const [isCachedProfile, setIsCachedProfile] = useState(false);
  const [isEditingProfile, setIsEditingProfile] = useState(false);

  // Form Field States
  const [studentName, setStudentName] = useState('');
  const [studentEmail, setStudentEmail] = useState('');
  const [regNo, setRegNo] = useState('');
  const [year, setYear] = useState(YEARS[0]);
  const [branch, setBranch] = useState(DEPARTMENTS[0]);
  const [mobileNumber, setMobileNumber] = useState('');
  const [sessionId, setSessionId] = useState('LAB101-X7K9');

  // Silent Geolocation & GPS Accuracy State
  const [userLocation, setUserLocation] = useState({ latitude: 28.6139, longitude: 77.2090 });
  const [gpsAccuracy, setGpsAccuracy] = useState(5);
  const [gpsWarning, setGpsWarning] = useState('');

  // Submission & Result Modal State
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [verificationResult, setVerificationResult] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [submitError, setSubmitError] = useState('');

  const activeToken = tokenFromUrl || qrData?.token || '';
  const isSessionPaused = qrData?.status === 'PAUSED' || qrData?.status === 'TERMINATED';
  const requireMobileNumber = qrData?.customFields?.requireMobileNumber === true;

  // Load Saved Profile from localStorage & indexedDB
  useEffect(() => {
    try {
      const savedProfile = localStorage.getItem('proxyqr_student_profile');
      if (savedProfile) {
        const parsed = JSON.parse(savedProfile);
        if (parsed.regNo && parsed.email) {
          setStudentName(parsed.studentName || '');
          setStudentEmail(parsed.email || '');
          setRegNo(parsed.regNo || '');
          setYear(parsed.year || YEARS[0]);
          setBranch(parsed.branch || DEPARTMENTS[0]);
          setMobileNumber(parsed.mobileNumber || '');
          setIsCachedProfile(true);
        }
      }
    } catch (e) {}
  }, []);

  // Update session ID if available in socket qrData
  useEffect(() => {
    if (qrData?.sessionId) {
      setSessionId(qrData.sessionId);
    }
  }, [qrData]);

  // Request High Accuracy Geolocation
  useEffect(() => {
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setUserLocation({
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
          });
          setGpsAccuracy(pos.coords.accuracy || 5);
          if (pos.coords.accuracy > 50) {
            setGpsWarning('Weak indoor GPS fix. Ensure Wi-Fi is toggled on to refine triangulation.');
          } else {
            setGpsWarning('');
          }
        },
        () => {},
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
      );
    }
  }, []);

  // Anti-Proxy Device Lock Check
  const checkAntiProxyDeviceLock = (inputRegNo, inputEmail) => {
    try {
      const submittedDeviceHistory = localStorage.getItem('proxyqr_device_submissions');
      if (submittedDeviceHistory) {
        const history = JSON.parse(submittedDeviceHistory);
        const currentSid = (sessionId || 'LAB101-X7K9').toUpperCase();

        const matchForSession = history.find(
          (h) => h.sessionId === currentSid && (h.regNo !== inputRegNo || h.email !== inputEmail)
        );

        if (matchForSession) {
          return true; // Proxy Lock Violation Detected!
        }
      }
    } catch (e) {}
    return false;
  };

  // Submit Attendance Handler (< 1.5s Latency)
  const handleSubmitAttendance = async (e) => {
    e.preventDefault();
    setSubmitError('');

    if (!studentName.trim() || !regNo.trim() || !studentEmail.trim()) {
      setSubmitError('Please complete Name, Registration No, and Email fields.');
      return;
    }

    if (requireMobileNumber && !mobileNumber.trim()) {
      setSubmitError('Mobile Phone Number is required for this session.');
      return;
    }

    if (!activeToken) {
      setSubmitError('No active QR security token found. Please scan the current projector QR code.');
      return;
    }

    const cleanRegNo = regNo.trim().toUpperCase();
    const cleanEmail = studentEmail.trim().toLowerCase();

    // Check Anti-Proxy Device Lock
    if (checkAntiProxyDeviceLock(cleanRegNo, cleanEmail)) {
      setSubmitError('Anti-Proxy Lock: Multiple student submissions from the same device are prohibited.');
      return;
    }

    setIsSubmitting(true);

    const payload = {
      token: activeToken,
      studentId: cleanRegNo,
      regNo: cleanRegNo,
      studentName: studentName.trim(),
      email: cleanEmail,
      year,
      branch,
      mobileNumber: mobileNumber.trim(),
      userLocation,
      accuracy: gpsAccuracy,
      sessionId: sessionId.toUpperCase(),
      deviceUuid,
    };

    try {
      const res = await fetch(`${backendUrl}/api/attendance/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      setIsSubmitting(false);

      if (res.ok && data.success) {
        // Save Profile for 1-Tap Future Submissions
        const profile = {
          studentName: studentName.trim(),
          email: cleanEmail,
          regNo: cleanRegNo,
          year,
          branch,
          mobileNumber: mobileNumber.trim(),
        };
        localStorage.setItem('proxyqr_student_profile', JSON.stringify(profile));

        // Save Device Submission History
        try {
          const existing = JSON.parse(localStorage.getItem('proxyqr_device_submissions') || '[]');
          existing.push({ sessionId: sessionId.toUpperCase(), regNo: cleanRegNo, email: cleanEmail, timestamp: Date.now() });
          localStorage.setItem('proxyqr_device_submissions', JSON.stringify(existing));
        } catch (e) {}

        setVerificationResult(data.attendance || { status: 'VERIFIED', studentName: studentName.trim(), regNo: cleanRegNo });
        setModalOpen(true);
      } else {
        setSubmitError(data.error || 'Attendance verification failed.');
      }
    } catch (err) {
      setIsSubmitting(false);
      setSubmitError(err.message || 'Network error verifying attendance.');
    }
  };

  return (
    <div className="min-h-[90vh] flex flex-col items-center justify-between px-4 py-6 relative select-none font-sans bg-transparent">
      {/* Session Header Card */}
      <div className="w-full max-w-md space-y-4 animate-fadeIn">
        <div className="glass-panel p-5 rounded-3xl space-y-2 text-center border-b-4 border-b-cyan-500 shadow-[0_0_40px_rgba(6,182,212,0.15)]">
          <div className="inline-flex items-center gap-2 text-xs font-mono font-bold text-cyan-400 uppercase tracking-wider">
            <ShieldCheck className="w-4 h-4" />
            <span>ProxyQr Student Intake Portal</span>
          </div>

          <h2 className="font-display font-extrabold text-xl text-white">
            {qrData?.title || 'CS202: Advanced Operating Systems Lab'}
          </h2>

          <div className="flex items-center justify-center gap-2 text-xs font-mono text-slate-400">
            <span>Session: <strong className="text-cyan-300">{sessionId}</strong></span>
            <span>•</span>
            <span>{qrData?.labIdentifier || 'Lab 101'}</span>
          </div>
        </div>

        {/* Paused Session Notice */}
        {isSessionPaused && (
          <div className="p-4 rounded-2xl bg-amber-500/15 border border-amber-500/30 text-amber-200 text-xs font-mono flex items-center gap-3 animate-pulse">
            <Pause className="w-5 h-5 text-amber-400 flex-shrink-0" />
            <div>
              <div className="font-bold">SESSION CURRENTLY PAUSED</div>
              <div className="text-[11px] text-amber-300/80">Wait for the Admin to start/resume the 60s rotation loop.</div>
            </div>
          </div>
        )}

        {/* GPS Weak Accuracy Warning */}
        {gpsWarning && (
          <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-mono flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
            <span>{gpsWarning}</span>
          </div>
        )}

        {/* Submit Error Alert */}
        {submitError && (
          <div className="p-4 rounded-2xl bg-rose-500/15 border border-rose-500/40 text-rose-300 text-xs font-mono flex items-start gap-2.5 animate-fadeIn">
            <AlertTriangle className="w-4 h-4 text-rose-400 flex-shrink-0 mt-0.5" />
            <span>{submitError}</span>
          </div>
        )}

        {/* Profile Auto-Fill Banner & 1-Tap Toggle */}
        {isCachedProfile && (
          <div className="p-3.5 rounded-2xl bg-slate-900/90 border border-slate-800 flex items-center justify-between text-xs font-mono">
            <div className="flex items-center gap-2 text-emerald-400 font-semibold">
              <Check className="w-4 h-4" />
              <span>Saved Profile Loaded (1-Tap Mode)</span>
            </div>
            <button
              type="button"
              onClick={() => setIsEditingProfile(!isEditingProfile)}
              className="text-cyan-400 hover:underline text-[11px] flex items-center gap-1 cursor-pointer"
            >
              <Edit2 className="w-3 h-3" />
              <span>{isEditingProfile ? 'Lock Profile' : 'Edit Details'}</span>
            </button>
          </div>
        )}

        {/* Student Intake Form */}
        <form onSubmit={handleSubmitAttendance} className="glass-panel p-6 rounded-3xl space-y-4 border border-slate-800 text-xs font-mono">
          <div className="space-y-1.5">
            <label className="text-slate-300 font-semibold flex items-center gap-1.5">
              <User className="w-3.5 h-3.5 text-cyan-400" />
              Full Name
            </label>
            <input
              type="text"
              value={studentName}
              onChange={(e) => setStudentName(e.target.value)}
              placeholder="Aryan Kale"
              readOnly={isCachedProfile && !isEditingProfile}
              required
              className={`w-full px-4 py-3 rounded-xl glass-input text-slate-200 font-sans text-sm ${
                isCachedProfile && !isEditingProfile ? 'bg-slate-900/60 border-slate-800 cursor-not-allowed' : ''
              }`}
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-slate-300 font-semibold flex items-center gap-1.5">
              <Hash className="w-3.5 h-3.5 text-cyan-400" />
              Registration Number / PRN
            </label>
            <input
              type="text"
              value={regNo}
              onChange={(e) => setRegNo(e.target.value.toUpperCase())}
              placeholder="2024BIT020"
              readOnly={isCachedProfile && !isEditingProfile}
              required
              className={`w-full px-4 py-3 rounded-xl glass-input text-cyan-300 font-mono font-bold text-sm ${
                isCachedProfile && !isEditingProfile ? 'bg-slate-900/60 border-slate-800 cursor-not-allowed' : ''
              }`}
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-slate-300 font-semibold flex items-center gap-1.5">
              <Mail className="w-3.5 h-3.5 text-cyan-400" />
              Student Email Address
            </label>
            <input
              type="email"
              value={studentEmail}
              onChange={(e) => setStudentEmail(e.target.value)}
              placeholder="2024bit020@sggs.ac.in"
              readOnly={isCachedProfile && !isEditingProfile}
              required
              className={`w-full px-4 py-3 rounded-xl glass-input text-slate-200 font-sans text-sm ${
                isCachedProfile && !isEditingProfile ? 'bg-slate-900/60 border-slate-800 cursor-not-allowed' : ''
              }`}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-slate-300 font-semibold flex items-center gap-1.5">
                <GraduationCap className="w-3.5 h-3.5 text-cyan-400" />
                Academic Year
              </label>
              <select
                value={year}
                onChange={(e) => setYear(e.target.value)}
                disabled={isCachedProfile && !isEditingProfile}
                className="w-full px-3 py-3 rounded-xl glass-input text-slate-200"
              >
                {YEARS.map((yr) => (
                  <option key={yr} value={yr}>
                    {yr}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-slate-300 font-semibold flex items-center gap-1.5">
                <BookOpen className="w-3.5 h-3.5 text-cyan-400" />
                Branch / Major
              </label>
              <select
                value={branch}
                onChange={(e) => setBranch(e.target.value)}
                disabled={isCachedProfile && !isEditingProfile}
                className="w-full px-3 py-3 rounded-xl glass-input text-slate-200"
              >
                {DEPARTMENTS.map((dept) => (
                  <option key={dept} value={dept}>
                    {dept}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {requireMobileNumber && (
            <div className="space-y-1.5">
              <label className="text-slate-300 font-semibold flex items-center gap-1.5">
                <Phone className="w-3.5 h-3.5 text-cyan-400" />
                Mobile Phone Number
              </label>
              <input
                type="tel"
                value={mobileNumber}
                onChange={(e) => setMobileNumber(e.target.value)}
                placeholder="9876543210"
                readOnly={isCachedProfile && !isEditingProfile}
                required={requireMobileNumber}
                className="w-full px-4 py-3 rounded-xl glass-input text-slate-200"
              />
            </div>
          )}

          {/* 1-Tap Attendance Confirmation Button */}
          <button
            type="submit"
            disabled={isSubmitting || isSessionPaused || !activeToken}
            className="w-full py-4 rounded-2xl bg-gradient-to-r from-cyan-500 via-blue-600 to-indigo-600 text-white font-display font-extrabold text-sm shadow-[0_0_25px_rgba(6,182,212,0.4)] hover:shadow-[0_0_35px_rgba(6,182,212,0.6)] transition-all active:scale-[0.99] disabled:opacity-40 flex items-center justify-center gap-2 cursor-pointer mt-4"
          >
            {isSubmitting ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Verifying GPS & Security Token...</span>
              </>
            ) : (
              <>
                <Send className="w-4 h-4" />
                <span>Confirm & Mark Attendance</span>
              </>
            )}
          </button>
        </form>
      </div>

      <footer className="pt-6 text-center text-[11px] font-mono text-slate-400">
        <span>ProxyQr Sentinel • Dynamic Anti-Proxy Verification</span>
      </footer>

      {/* Verification Result Modal */}
      {modalOpen && (
        <VerificationResultModal
          isOpen={modalOpen}
          onClose={() => setModalOpen(false)}
          result={verificationResult}
        />
      )}
    </div>
  );
}
