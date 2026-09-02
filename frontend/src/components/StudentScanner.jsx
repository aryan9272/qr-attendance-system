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
  LogOut,
} from 'lucide-react';
import VerificationResultModal from './VerificationResultModal';
import { useSocket } from '../context/SocketContext';

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

const DEFAULT_GOOGLE_CLIENT_ID = '136625053294-olf8ok1trq36i3qbjt38vs4l8e84c1o2.apps.googleusercontent.com';

export default function StudentScanner() {
  const { qrData, backendUrl } = useSocket();

  // Extract AES token directly from URL query params (Google Lens / Phone Camera landing)
  const [tokenFromUrl, setTokenFromUrl] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('token') || '';
  });

  // Google OAuth Auth State (Null = Form Strictly Locked & Hidden)
  const [googleUser, setGoogleUser] = useState(() => {
    const saved = localStorage.getItem('student_google_user');
    return saved ? JSON.parse(saved) : null;
  });

  const [authErrorMessage, setAuthErrorMessage] = useState('');
  const [isAuthLoading, setIsAuthLoading] = useState(false);

  // BLANK INTAKE FORM STATES (Only Email is locked after Google Auth)
  const [studentName, setStudentName] = useState('');
  const [studentEmail, setStudentEmail] = useState('');
  const [regNo, setRegNo] = useState('');
  const [year, setYear] = useState('');
  const [branch, setBranch] = useState('');
  const [mobileNumber, setMobileNumber] = useState('');
  const [eventId, setEventId] = useState('CS101-LECTURE');

  // Silent Geolocation State
  const [userLocation, setUserLocation] = useState({
    latitude: 28.6139,
    longitude: 77.2090,
  });

  // Verification Submission State
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [verificationResult, setVerificationResult] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);

  const activeToken = tokenFromUrl || qrData?.token || '';
  const isSessionPaused = qrData?.status === 'paused' || qrData?.isEnded === true;
  const requireMobileNumber = qrData?.customFields?.requireMobileNumber === true;

  // Initialize Official Google Identity Services SDK
  useEffect(() => {
    const loadGsiScript = () => {
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
      if (window.google?.accounts?.id) {
        try {
          window.google.accounts.id.initialize({
            client_id: import.meta.env.VITE_GOOGLE_CLIENT_ID || DEFAULT_GOOGLE_CLIENT_ID,
            callback: handleGsiCredentialResponse,
            auto_select: false,
          });
        } catch (e) {
          console.warn('GIS init note:', e);
        }
      }
    };

    loadGsiScript();
  }, []);

  useEffect(() => {
    if (googleUser) {
      setStudentEmail(googleUser.email || '');
      fetchGeolocation();
    }
  }, [googleUser]);

  // Handle Google Credential Response
  const handleGsiCredentialResponse = (response) => {
    setAuthErrorMessage('');
    setIsAuthLoading(false);
    try {
      if (response && response.credential) {
        const base64Url = response.credential.split('.')[1];
        const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        const jsonPayload = decodeURIComponent(
          atob(base64)
            .split('')
            .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
            .join('')
        );

        const payload = JSON.parse(jsonPayload);
        const email = (payload.email || '').trim().toLowerCase();

        if (email && email.includes('@')) {
          onGoogleAuthSuccess(email, payload.name);
          return;
        }
      }
    } catch (err) {
      console.warn('GIS credential decode note:', err);
    }
    setIsAuthLoading(false);
    setAuthErrorMessage('Authentication failed. Please try again.');
  };

  // GOOGLE SIGN-IN ACTION: REQUIRES GENUINE GOOGLE RESPONSE TO UNLOCK
  const handleGoogleSignIn = () => {
    setAuthErrorMessage('');
    setIsAuthLoading(true);

    const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID || DEFAULT_GOOGLE_CLIENT_ID;

    // Trigger Official Google OAuth Token Client (In-Page Popup)
    if (window.google?.accounts?.oauth2) {
      try {
        const client = window.google.accounts.oauth2.initTokenClient({
          client_id: googleClientId,
          scope: 'email profile',
          callback: async (tokenResponse) => {
            if (tokenResponse && tokenResponse.access_token) {
              try {
                const userInfoRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
                  headers: { Authorization: `Bearer ${tokenResponse.access_token}` },
                });
                const userInfo = await userInfoRes.json();
                if (userInfo && userInfo.email) {
                  onGoogleAuthSuccess(userInfo.email, userInfo.name);
                  return;
                }
              } catch (fetchErr) {
                console.warn('UserInfo fetch note:', fetchErr);
              }
            }
            setIsAuthLoading(false);
            setAuthErrorMessage('Google sign-in was cancelled or failed. Please try again.');
          },
          error_callback: (err) => {
            setIsAuthLoading(false);
            console.warn('Google Sign-In error:', err);
            setAuthErrorMessage('Google Sign-In window was closed or cancelled. Please try again.');
          },
        });
        client.requestAccessToken();
        return;
      } catch (e) {
        console.warn('Token client init note:', e);
      }
    }

    if (window.google?.accounts?.id) {
      try {
        window.google.accounts.id.prompt((notification) => {
          if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
            setIsAuthLoading(false);
            setAuthErrorMessage('Google Sign-In prompt closed. Please tap "Continue with Google" again.');
          }
        });
        return;
      } catch (e) {
        console.warn('GIS prompt note:', e);
      }
    }

    setIsAuthLoading(false);
    setAuthErrorMessage('Initializing Google SDK. Please tap again in a moment.');
  };

  const onGoogleAuthSuccess = (email, name) => {
    setIsAuthLoading(false);
    const profile = {
      email: email || '',
      name: name || 'Student',
    };

    localStorage.setItem('student_google_user', JSON.stringify(profile));
    setGoogleUser(profile);
    setStudentEmail(profile.email);
  };

  // Sign Out Handler (Wipes Memory & Returns to Locked Initial State)
  const handleSignOut = () => {
    localStorage.removeItem('student_google_user');
    setGoogleUser(null);
    setStudentEmail('');
    setStudentName('');
    setRegNo('');
    setYear('');
    setBranch('');
    setMobileNumber('');
  };

  // Silent Spatial Geolocation Routine
  const fetchGeolocation = () => {
    if (!navigator.geolocation) {
      setUserLocation({ latitude: 28.6139, longitude: 77.2090 });
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setUserLocation({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
      },
      (err) => {
        console.warn('Geolocation fallback activated:', err.message);
        setUserLocation({
          latitude: 28.6139,
          longitude: 77.2090,
        });
      },
      {
        enableHighAccuracy: true,
        timeout: 5000,
        maximumAge: 0,
      }
    );
  };

  const handleVerify = async (e) => {
    e.preventDefault();

    if (!activeToken) {
      alert('Missing QR security token! Please scan the projector QR code with Google Lens or your phone camera.');
      return;
    }

    if (isSessionPaused) {
      alert('Session is currently paused by the faculty instructor. Submissions are temporarily blocked.');
      return;
    }

    if (!googleUser) {
      alert('Please sign in with Google first!');
      return;
    }

    if (!studentName.trim()) {
      alert('Please enter your Student Full Name!');
      return;
    }

    if (!regNo.trim()) {
      alert('Please enter your Registration Number!');
      return;
    }

    if (!year) {
      alert('Please select your Academic Year!');
      return;
    }

    if (!branch) {
      alert('Please select your Branch / Major Name!');
      return;
    }

    if (requireMobileNumber && !mobileNumber.trim()) {
      alert('Mobile Number is required for this session!');
      return;
    }

    setIsSubmitting(true);
    setVerificationResult(null);

    try {
      const targetBase = backendUrl || (typeof window !== 'undefined' && window.location ? `http://${window.location.hostname}:5000` : 'http://localhost:5000');
      const verifyEndpoint = `${targetBase}/api/attendance/verify`;

      const response = await fetch(verifyEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          token: activeToken.trim(),
          studentId: regNo.trim(),
          studentName: studentName.trim(),
          email: studentEmail.trim(),
          regNo: regNo.trim(),
          year: year.trim(),
          branch: branch.trim(),
          mobileNumber: mobileNumber.trim(),
          userLocation: userLocation || { latitude: 28.6139, longitude: 77.2090 },
          eventId,
        }),
      });

      const data = await response.json();
      setVerificationResult({
        httpStatus: response.status,
        ...data,
      });
      setModalOpen(true);
    } catch (err) {
      setVerificationResult({
        httpStatus: 500,
        success: false,
        errorType: 'NETWORK_ERROR',
        error: `Failed to connect to backend server: ${err.message}`,
      });
      setModalOpen(true);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isSessionPaused) {
    return (
      <div className="max-w-xl mx-auto px-4 py-12 text-center">
        <div className="glass-panel-glow p-8 rounded-3xl space-y-4 border-amber-500/40">
          <div className="inline-flex p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-400">
            <Pause className="w-12 h-12 animate-pulse" />
          </div>
          <h2 className="font-display text-2xl font-extrabold text-white">Session Paused / Stopped</h2>
          <p className="text-sm text-slate-400 font-mono">
            Session is currently paused by the faculty instructor. Submissions are temporarily blocked.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto px-4 py-4 space-y-6 select-none font-sans">
      {/* INITIAL STATE (LOCKED) - FORM HIDES ENTIRELY, ONLY WELCOME HEADER + DARK GOOGLE BUTTON */}
      {!googleUser && (
        <div className="min-h-[70vh] flex flex-col items-center justify-center text-center space-y-8 my-auto px-4 py-8 animate-fadeIn">
          {/* Welcome Brand Logo / Icon */}
          <div className="space-y-4 flex flex-col items-center">
            <div className="w-20 h-20 rounded-3xl bg-gradient-to-tr from-cyan-500/20 via-blue-500/20 to-indigo-500/20 border border-cyan-500/40 flex items-center justify-center shadow-[0_0_40px_rgba(6,182,212,0.3)]">
              <ShieldCheck className="w-10 h-10 text-cyan-400" />
            </div>

            <div className="space-y-2">
              <h1 className="font-display text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
                Welcome to ProxyQr
              </h1>
              <p className="text-xs sm:text-sm text-slate-400 font-mono max-w-xs mx-auto leading-relaxed">
                Smart Location-Aware Student Attendance Verification Portal
              </p>
            </div>
          </div>

          {authErrorMessage && (
            <div className="w-full max-w-sm p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/40 text-xs font-mono text-rose-300 animate-fadeIn">
              {authErrorMessage}
            </div>
          )}

          {/* DARK THEME NATIVE-LOOKING "CONTINUE WITH GOOGLE" BUTTON */}
          <div className="w-full max-w-xs space-y-3 pt-4">
            <button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={isAuthLoading}
              className="w-full py-3.5 px-6 rounded-2xl bg-[#18181b] hover:bg-[#27272a] active:scale-[0.98] border border-slate-700/80 text-white font-sans font-medium text-sm shadow-xl transition-all flex items-center justify-center gap-3 cursor-pointer"
            >
              {isAuthLoading ? <RefreshCw className="w-5 h-5 animate-spin text-cyan-400" /> : <GoogleGIcon />}
              <span>{isAuthLoading ? 'Authenticating...' : 'Continue with Google'}</span>
            </button>

            <p className="text-[11px] font-mono text-slate-500">
              Authenticates any Google domain (@gmail.com)
            </p>
          </div>
        </div>
      )}

      {/* UNLOCKED STATE - DYNAMICALLY DISPLAYS SINGLE-COLUMN STACKED ATTENDANCE INTAKE FORM */}
      {googleUser && (
        <div className="glass-panel-glow p-6 sm:p-8 rounded-3xl space-y-6 relative overflow-hidden animate-fadeIn border border-cyan-500/30 shadow-[0_0_50px_rgba(6,182,212,0.2)]">
          {/* Header Banner with Verified Email & Sign Out Action */}
          <div className="flex items-center justify-between pb-4 border-b border-slate-800">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-2xl bg-cyan-500/20 border border-cyan-500/40 flex items-center justify-center font-bold text-cyan-300 text-sm shadow-[0_0_15px_rgba(6,182,212,0.3)]">
                <ShieldCheck className="w-5 h-5 text-cyan-400" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="flex items-center gap-1 text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                    <CheckCircle2 className="w-3 h-3" /> VERIFIED GOOGLE IDENTITY
                  </span>
                </div>
                <p className="text-xs font-mono text-cyan-300 mt-0.5">{googleUser.email}</p>
              </div>
            </div>

            {/* Sign Out Button */}
            <button
              type="button"
              onClick={handleSignOut}
              className="p-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-rose-400 border border-slate-800 transition-colors cursor-pointer flex items-center gap-1 text-[11px] font-mono"
              title="Sign Out"
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline">Sign Out</span>
            </button>
          </div>

          <form onSubmit={handleVerify} className="space-y-5">
            <div className="space-y-4 bg-slate-950/80 p-5 rounded-2xl border border-slate-800">
              <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                <div className="flex items-center gap-2 font-display font-bold text-sm text-cyan-400">
                  <GraduationCap className="w-4 h-4" />
                  <span>Student Academic Profile Intake</span>
                </div>
              </div>

              {/* SINGLE-COLUMN VERTICAL STACK FOR OPTIMAL MOBILE PRESENTATION */}
              <div className="flex flex-col gap-4 font-mono text-xs">
                {/* 1. Verified Email Address (READ-ONLY & LOCKED WITH GOOGLE OAUTH EMAIL) */}
                <div className="space-y-1.5">
                  <label className="text-slate-300 font-semibold flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <Mail className="w-3.5 h-3.5 text-cyan-400" />
                      Verified Email Address
                    </span>
                    <span className="text-[10px] text-cyan-400 flex items-center gap-1">
                      <Lock className="w-3 h-3" /> LOCKED (GOOGLE AUTH)
                    </span>
                  </label>
                  <input
                    type="email"
                    value={studentEmail}
                    readOnly
                    placeholder="2024bit020@sggs.ac.in"
                    className="w-full px-4 py-3 rounded-xl glass-input text-cyan-300 font-mono bg-slate-950/90 border-cyan-500/40 cursor-not-allowed shadow-[0_0_10px_rgba(6,182,212,0.15)] placeholder:text-slate-500"
                  />
                </div>

                {/* 2. Student Full Name (COMPLETELY BLANK WITH PLACEHOLDER "Aryan Kale") */}
                <div className="space-y-1.5">
                  <label className="text-slate-300 font-semibold flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5 text-cyan-400" />
                    Student Full Name <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="text"
                    value={studentName}
                    onChange={(e) => setStudentName(e.target.value)}
                    required
                    placeholder="Aryan Kale"
                    autoComplete="off"
                    className="w-full px-4 py-3 rounded-xl glass-input text-slate-200 font-sans focus:border-cyan-500 placeholder:text-slate-500"
                  />
                </div>

                {/* 3. Registration No (COMPLETELY BLANK WITH PLACEHOLDER "2024BIT020") */}
                <div className="space-y-1.5">
                  <label className="text-slate-300 font-semibold flex items-center gap-1.5">
                    <Hash className="w-3.5 h-3.5 text-cyan-400" />
                    Registration No <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="text"
                    value={regNo}
                    onChange={(e) => setRegNo(e.target.value)}
                    required
                    placeholder="2024BIT020"
                    autoComplete="off"
                    className="w-full px-4 py-3 rounded-xl glass-input text-cyan-300 font-mono focus:border-cyan-500 placeholder:text-slate-500"
                  />
                </div>

                {/* 4. Academic Year (EDITABLE DROPDOWN) */}
                <div className="space-y-1.5">
                  <label className="text-slate-300 font-semibold flex items-center gap-1.5">
                    <GraduationCap className="w-3.5 h-3.5 text-cyan-400" />
                    Academic Year <span className="text-rose-400">*</span>
                  </label>
                  <select
                    value={year}
                    onChange={(e) => setYear(e.target.value)}
                    required
                    className="w-full px-4 py-3 rounded-xl glass-input text-slate-200 font-sans bg-slate-900/90 border-slate-700 focus:border-cyan-500"
                  >
                    <option value="">-- Select Academic Year --</option>
                    <option value="B.Tech - 1st Year">B.Tech - 1st Year</option>
                    <option value="B.Tech - 2nd Year">B.Tech - 2nd Year</option>
                    <option value="B.Tech - 3rd Year">B.Tech - 3rd Year</option>
                    <option value="B.Tech - 4th Year">B.Tech - 4th Year</option>
                    <option value="M.Tech - 1st Year">M.Tech - 1st Year</option>
                    <option value="M.Tech - 2nd Year">M.Tech - 2nd Year</option>
                    <option value="Ph.D">Ph.D</option>
                  </select>
                </div>

                {/* 5. Branch / Department (UPDATED WITH ALL 10 OFFICIAL BRANCHES) */}
                <div className="space-y-1.5">
                  <label className="text-slate-300 font-semibold flex items-center gap-1.5">
                    <BookOpen className="w-3.5 h-3.5 text-cyan-400" />
                    Branch / Major Name <span className="text-rose-400">*</span>
                  </label>
                  <select
                    value={branch}
                    onChange={(e) => setBranch(e.target.value)}
                    required
                    className="w-full px-4 py-3 rounded-xl glass-input text-slate-200 font-sans bg-slate-900/90 border-slate-700 focus:border-cyan-500"
                  >
                    <option value="">-- Select Branch / Major --</option>
                    <option value="Information Technology">Information Technology</option>
                    <option value="Electronics and Telecommunication Engineering">Electronics and Telecommunication Engineering</option>
                    <option value="Computer Science and Engineering">Computer Science and Engineering</option>
                    <option value="Instrumentation Engineering">Instrumentation Engineering</option>
                    <option value="Production Engineering">Production Engineering</option>
                    <option value="Civil and Water Management Engineering">Civil and Water Management Engineering</option>
                    <option value="Mechanical Engineering">Mechanical Engineering</option>
                    <option value="Textile Engineering">Textile Engineering</option>
                    <option value="Chemical Technology/Engineering">Chemical Technology/Engineering</option>
                    <option value="Electrical Engineering">Electrical Engineering</option>
                  </select>
                </div>

                {/* Mobile Phone Number */}
                <div className="space-y-1.5 animate-fadeIn">
                  <label className="text-slate-300 font-semibold flex items-center gap-1.5">
                    <Phone className="w-3.5 h-3.5 text-cyan-400" />
                    Mobile Phone Number {requireMobileNumber && <span className="text-rose-400">*</span>}
                  </label>
                  <input
                    type="tel"
                    value={mobileNumber}
                    onChange={(e) => setMobileNumber(e.target.value)}
                    required={requireMobileNumber}
                    autoComplete="off"
                    className="w-full px-4 py-3 rounded-xl glass-input text-amber-200 font-mono border-slate-700 focus:border-cyan-500 placeholder:text-slate-500"
                    placeholder="+91 98765 43210"
                  />
                </div>
              </div>
            </div>

            {/* Submission Action Button */}
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-4 rounded-2xl bg-gradient-to-r from-cyan-500 via-blue-600 to-indigo-600 text-white font-display font-bold text-base shadow-[0_0_30px_rgba(6,182,212,0.4)] hover:shadow-[0_0_40px_rgba(6,182,212,0.6)] active:scale-[0.99] transition-all disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
            >
              {isSubmitting ? (
                <>
                  <RefreshCw className="w-5 h-5 animate-spin" />
                  <span>Validating GPS & Submitting Attendance...</span>
                </>
              ) : (
                <>
                  <Send className="w-5 h-5" />
                  <span>Verify & Mark Attendance Now</span>
                </>
              )}
            </button>
          </form>
        </div>
      )}

      {/* Verification Result Modal */}
      <VerificationResultModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        result={verificationResult}
      />
    </div>
  );
}
