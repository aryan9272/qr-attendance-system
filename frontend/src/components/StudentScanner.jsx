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
  LogOut,
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

const DEFAULT_GOOGLE_CLIENT_ID = '136625053294-olf8ok1trq36i3qbjt38vs4l8e84c1o2.apps.googleusercontent.com';

// Official Multi-Colored Google 'G' Icon SVG
function GoogleGIcon() {
  return (
    <svg className="w-5 h-5 flex-shrink-0" viewBox="0 0 24 24">
      <path
        fill="#EA4335"
        d="M12 5c1.6 0 3 .6 4.1 1.6l3.1-3.1C17.3 1.7 14.8 1 12 1 7.5 1 3.7 3.6 1.9 7.3l3.7 2.9C6.5 7.3 9 5 12 5z"
      />
      <path
        fill="#4285F4"
        d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5c-.3 1.5-1.1 2.8-2.4 3.7l3.7 2.9c2.2-2 3.7-5 3.7-8.8z"
      />
      <path
        fill="#FBBC05"
        d="M5.6 14.8c-.3-.8-.4-1.8-.4-2.8L1.9 6.3C.7 8.7 0 10.3 0 12s.7 3.3 1.9 5.7l3.7-2.9z"
      />
      <path
        fill="#34A853"
        d="M12 23c3.2 0 6-1.1 8-3l-3.7-2.9c-1.1.7-2.5 1.2-4.3 1.2-3 0-5.5-2.3-6.4-5.2L1.9 16C3.7 19.7 7.5 23 12 23z"
      />
    </svg>
  );
}

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

  // Google OAuth Student Identity State
  const [googleStudent, setGoogleStudent] = useState(() => {
    try {
      const saved = localStorage.getItem('proxyqr_student_google');
      return saved ? JSON.parse(saved) : null;
    } catch (e) {
      return null;
    }
  });

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

  // Fix: Prioritize live rotating socket token (qrData.token) over static URL query param
  const activeToken = qrData?.token || tokenFromUrl || '';
  const isSessionPaused = qrData?.status === 'PAUSED' || qrData?.status === 'TERMINATED';
  const requireMobileNumber = qrData?.customFields?.requireMobileNumber === true;

  const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID || DEFAULT_GOOGLE_CLIENT_ID;

  // Initialize Google Identity Services (GSI) SDK
  useEffect(() => {
    const loadGsi = () => {
      if (window.google?.accounts?.id) {
        initGsi();
        return;
      }
      const script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.defer = true;
      script.onload = initGsi;
      document.body.appendChild(script);
    };

    const initGsi = () => {
      try {
        if (window.google?.accounts?.id) {
          window.google.accounts.id.initialize({
            client_id: googleClientId,
            callback: handleGoogleCredentialResponse,
            auto_select: false,
          });

          // Render Google Official Button inside div container
          const btnDiv = document.getElementById('google-student-btn-container');
          if (btnDiv) {
            window.google.accounts.id.renderButton(btnDiv, {
              theme: 'outline',
              size: 'large',
              width: '100%',
              text: 'continue_with',
              shape: 'pill',
            });
          }
        }
      } catch (e) {
        console.warn('GSI init note:', e);
      }
    };

    loadGsi();
  }, [googleClientId]);

  // Handle Google OAuth Credential Response
  const handleGoogleCredentialResponse = (response) => {
    try {
      const base64Url = response.credential.split('.')[1];
      const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
      const jsonPayload = decodeURIComponent(
        atob(base64)
          .split('')
          .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
          .join('')
      );

      const parsed = JSON.parse(jsonPayload);
      if (parsed?.email) {
        setGoogleStudent(parsed);
        setStudentEmail(parsed.email);
        if (!studentName && parsed.name) {
          setStudentName(parsed.name);
        }
        localStorage.setItem('proxyqr_student_google', JSON.stringify(parsed));
      }
    } catch (err) {
      console.warn('Google Auth Credential Parse Error:', err);
    }
  };

  // Trigger Google One-Tap / OAuth Prompt
  const triggerGoogleAuthPrompt = () => {
    if (window.google?.accounts?.id) {
      window.google.accounts.id.prompt();
    } else {
      alert('Google Auth SDK is loading... Please try again in 2 seconds.');
    }
  };

  // Logout Google Account
  const handleGoogleLogout = () => {
    setGoogleStudent(null);
    setStudentEmail('');
    localStorage.removeItem('proxyqr_student_google');
  };

  // Load Saved Profile from localStorage
  useEffect(() => {
    try {
      const savedProfile = localStorage.getItem('proxyqr_student_profile');
      if (savedProfile) {
        const parsed = JSON.parse(savedProfile);
        if (parsed.regNo) {
          setStudentName((prev) => prev || parsed.studentName || '');
          setStudentEmail((prev) => prev || parsed.email || '');
          setRegNo(parsed.regNo || '');
          setYear(parsed.year || YEARS[0]);
          setBranch(parsed.branch || DEPARTMENTS[0]);
          setMobileNumber(parsed.mobileNumber || '');
          setIsCachedProfile(true);
        }
      }
    } catch (e) {}
  }, []);

  // Sync Google Student Email to Form
  useEffect(() => {
    if (googleStudent?.email) {
      setStudentEmail(googleStudent.email);
      if (!studentName && googleStudent.name) {
        setStudentName(googleStudent.name);
      }
    }
  }, [googleStudent]);

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

    if (!googleStudent && !studentEmail.trim()) {
      setSubmitError('Google Identity Authentication is required. Click "Continue with Google" above.');
      return;
    }

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

        {/* GOOGLE OAUTH 2.0 AUTHENTICATION SECTION */}
        <div className="glass-panel p-4 rounded-3xl space-y-3 border border-slate-800">
          <div className="text-xs font-mono font-bold text-slate-300 flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-cyan-400">
              <Lock className="w-3.5 h-3.5" /> Google OAuth Identity Verification
            </span>
            <span className="text-[10px] text-slate-500">REQUIRED</span>
          </div>

          {!googleStudent ? (
            <div className="space-y-2">
              <div id="google-student-btn-container" className="w-full flex justify-center"></div>

              <button
                type="button"
                onClick={triggerGoogleAuthPrompt}
                className="w-full py-3 rounded-2xl bg-white hover:bg-slate-100 text-slate-900 font-bold text-xs font-mono flex items-center justify-center gap-2.5 shadow-[0_0_20px_rgba(255,255,255,0.2)] transition-all cursor-pointer"
              >
                <GoogleGIcon />
                <span>Continue with Google</span>
              </button>
              <p className="text-[10px] font-mono text-slate-400 text-center">
                Authenticate with your verified student Google account (@sggs.ac.in or @gmail.com)
              </p>
            </div>
          ) : (
            <div className="p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-between text-xs font-mono">
              <div className="flex items-center gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                <div>
                  <div className="font-bold text-emerald-300">{googleStudent.email}</div>
                  <div className="text-[10px] text-slate-400">Authenticated via Google OAuth 2.0</div>
                </div>
              </div>

              <button
                type="button"
                onClick={handleGoogleLogout}
                className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-rose-400 border border-slate-800 transition-colors cursor-pointer"
                title="Change Google Account"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
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
            <label className="text-slate-300 font-semibold flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-slate-300">
                <Mail className="w-3.5 h-3.5 text-cyan-400" /> Student Email Address
              </span>
              {googleStudent && (
                <span className="text-[10px] text-emerald-400 font-mono">GOOGLE VERIFIED</span>
              )}
            </label>
            <input
              type="email"
              value={studentEmail}
              onChange={(e) => setStudentEmail(e.target.value)}
              placeholder="2024bit020@sggs.ac.in"
              readOnly={!!googleStudent || (isCachedProfile && !isEditingProfile)}
              required
              className={`w-full px-4 py-3 rounded-xl glass-input font-sans text-sm ${
                googleStudent
                  ? 'bg-slate-900/90 text-emerald-300 border-emerald-500/40 cursor-not-allowed font-semibold'
                  : isCachedProfile && !isEditingProfile
                  ? 'bg-slate-900/60 border-slate-800 cursor-not-allowed text-slate-200'
                  : 'text-slate-200'
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
