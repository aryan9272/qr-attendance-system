import React, { useState, useEffect } from 'react';
import {
  CheckCircle2,
  AlertTriangle,
  User,
  Hash,
  Send,
  RefreshCw,
  Mail,
  BookOpen,
  GraduationCap,
  Phone,
  Pause,
  MapPin,
  CheckCheck,
  Clock,
  X,
  Lock,
} from 'lucide-react';
import VerificationResultModal from './VerificationResultModal';
import { useSocket } from '../context/SocketContext';
import { fetchWithFailover } from '../utils/apiResolver';

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

// Persistent Device UUID for single-device policy
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
  const { qrData, backendUrl, joinSession } = useSocket();

  // Extract token and session ID strictly from URL query params
  const [tokenFromUrl] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('token') || '';
  });

  const [sessionId, setSessionId] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return (params.get('sessionId') || params.get('session') || params.get('eventId') || '').toUpperCase();
  });

  const deviceUuid = getOrCreateDeviceUuid();

  // Compulsory authentication on every scan: ALWAYS start null, do not auto-restore
  const [googleStudent, setGoogleStudent] = useState(null);
  const [isOAuthLoading, setIsOAuthLoading] = useState(false);
  const [oauthError, setOauthError] = useState('');

  // Token Timing State (70s max window from generation)
  const [remainingSeconds, setRemainingSeconds] = useState(70);
  const [isQrExpired, setIsQrExpired] = useState(false);

  // Duplicate Submission Modal State (1 submission per device)
  const [isDuplicateModalOpen, setIsDuplicateModalOpen] = useState(false);

  // Form Field States
  const [studentName, setStudentName] = useState('');
  const [studentEmail, setStudentEmail] = useState('');
  const [regNo, setRegNo] = useState('');
  const [year, setYear] = useState(YEARS[0]);
  const [branch, setBranch] = useState(DEPARTMENTS[0]);
  const [mobileNumber, setMobileNumber] = useState('');

  // Geolocation State (Initialized to null to prevent false 1,000km Delhi offset)
  const [userLocation, setUserLocation] = useState(null);
  const [gpsAccuracy, setGpsAccuracy] = useState(5);
  const [isRefreshingGps, setIsRefreshingGps] = useState(false);

  // Submission & Result Modal State
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [verificationResult, setVerificationResult] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [submitError, setSubmitError] = useState('');

  // Already Marked Present State for this Session
  const [isAlreadyMarked, setIsAlreadyMarked] = useState(false);
  const [markedDetails, setMarkedDetails] = useState(null);

  const currentSessionId = (sessionId || qrData?.sessionId || 'SESSION').toUpperCase();
  const isSessionTerminated = qrData?.status === 'TERMINATED';
  const isSessionPaused = qrData?.status === 'PAUSED';
  const requireMobileNumber = qrData?.customFields?.requireMobileNumber === true;

  const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID || DEFAULT_GOOGLE_CLIENT_ID;

  // Clear any cached authentication on mount so every scan requires fresh auth
  useEffect(() => {
    localStorage.removeItem('proxyqr_student_google');
  }, []);

  // Join session socket room
  useEffect(() => {
    if (currentSessionId && typeof joinSession === 'function') {
      joinSession(currentSessionId);
    }
  }, [currentSessionId, joinSession]);

  // Check if this device already submitted attendance for this session
  useEffect(() => {
    try {
      const history = JSON.parse(localStorage.getItem('proxyqr_device_submissions') || '[]');
      if (currentSessionId) {
        const found = history.find((h) => h.sessionId === currentSessionId);
        if (found) {
          setIsAlreadyMarked(true);
          setMarkedDetails(found);
        } else {
          setIsAlreadyMarked(false);
          setMarkedDetails(null);
        }
      }
    } catch (e) {}
  }, [currentSessionId]);

  // Query token status and start strict countdown for the scanned QR code
  useEffect(() => {
    if (!tokenFromUrl) {
      setIsQrExpired(true);
      return;
    }

    let isMounted = true;

    // Check with server when token was generated
    const checkToken = async () => {
      try {
        const { res, data } = await fetchWithFailover(
          `/api/attendance/token-status?token=${encodeURIComponent(tokenFromUrl)}`
        );
        if (!isMounted) return;

        if (data?.expired || !data?.valid || data?.remainingSeconds <= 0) {
          setIsQrExpired(true);
          setRemainingSeconds(0);
        } else {
          setRemainingSeconds(Math.max(0, data.remainingSeconds));
          setIsQrExpired(false);
        }
      } catch (err) {
        // Fallback to default 70s if network check fails
        if (isMounted) setRemainingSeconds(70);
      }
    };

    checkToken();

    // 1-second countdown interval
    const interval = setInterval(() => {
      setRemainingSeconds((prev) => {
        if (prev <= 1) {
          setIsQrExpired(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [tokenFromUrl]);

  // Request Geolocation with fast network fallback and continuous refinement
  const requestGpsFix = () => {
    if (!('geolocation' in navigator)) return;
    setIsRefreshingGps(true);

    // Fast-path: Rapid network/Wi-Fi fix (5s timeout)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserLocation({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
        });
        setGpsAccuracy(Math.round(pos.coords.accuracy || 10));
        setIsRefreshingGps(false);
      },
      () => {
        // Fallback: Low accuracy network triangulation (works reliably indoors)
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            setUserLocation({
              latitude: pos.coords.latitude,
              longitude: pos.coords.longitude,
            });
            setGpsAccuracy(Math.round(pos.coords.accuracy || 20));
            setIsRefreshingGps(false);
          },
          (err) => {
            console.warn('Geolocation fallback note:', err.message);
            setIsRefreshingGps(false);
          },
          { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 }
        );
      },
      { enableHighAccuracy: true, timeout: 5000, maximumAge: 60000 }
    );
  };

  useEffect(() => {
    requestGpsFix();
    // Continuous watch to refine GPS coordinates as hardware fixes
    let watchId = null;
    if ('geolocation' in navigator) {
      try {
        watchId = navigator.geolocation.watchPosition(
          (pos) => {
            setUserLocation({
              latitude: pos.coords.latitude,
              longitude: pos.coords.longitude,
            });
            setGpsAccuracy(Math.round(pos.coords.accuracy || 10));
          },
          () => {},
          { enableHighAccuracy: false, maximumAge: 60000, timeout: 15000 }
        );
      } catch (e) {}
    }
    return () => {
      if (watchId !== null && 'geolocation' in navigator) {
        navigator.geolocation.clearWatch(watchId);
      }
    };
  }, []);

  // Calculate live Haversine Distance
  const calculateHaversine = (lat1, lon1, lat2, lon2) => {
    const toRad = (v) => (v * Math.PI) / 180;
    const R = 6371000;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return Math.round(R * c);
  };

  const targetLat = qrData?.latitude;
  const targetLng = qrData?.longitude;
  const isTargetPlaceholder =
    !targetLat ||
    !targetLng ||
    qrData?.isCalibrated === false ||
    (targetLat === 28.6139 && targetLng === 77.2090);
  const isGeofenceActive = qrData?.geofenceEnabled !== false;

  let liveDistanceMeters = null;
  if (!isTargetPlaceholder && userLocation && typeof userLocation.latitude === 'number' && typeof userLocation.longitude === 'number') {
    // Only calculate distance if coordinates are not dummy Delhi placeholders
    if (!(userLocation.latitude === 28.6139 && userLocation.longitude === 77.2090)) {
      liveDistanceMeters = calculateHaversine(
        userLocation.latitude,
        userLocation.longitude,
        targetLat,
        targetLng
      );
    }
  }

  const adminRadius = qrData?.allowedRadiusMeters || 50;
  const effectiveBoundary = adminRadius + Math.min(gpsAccuracy, 30);
  const isInsideGeofence =
    !isGeofenceActive ||
    isTargetPlaceholder ||
    liveDistanceMeters === null ||
    liveDistanceMeters <= effectiveBoundary;

  // Initialize Google OAuth & Auto-Trigger Account Chooser
  useEffect(() => {
    let client = null;

    const setupGoogleAuth = () => {
      try {
        if (window.google?.accounts?.oauth2) {
          client = window.google.accounts.oauth2.initTokenClient({
            client_id: googleClientId,
            scope: 'email profile',
            callback: async (tokenResponse) => {
              if (tokenResponse?.access_token) {
                try {
                  setIsOAuthLoading(true);
                  const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
                    headers: { Authorization: `Bearer ${tokenResponse.access_token}` },
                  });
                  const profile = await res.json();
                  if (profile?.email) {
                    setGoogleStudent(profile);
                    setStudentEmail(profile.email);
                    if (profile.name) {
                      setStudentName(profile.name);
                    }
                    setOauthError('');
                  }
                } catch (e) {
                  setOauthError('Failed to fetch Google profile. Please try again.');
                } finally {
                  setIsOAuthLoading(false);
                }
              } else if (tokenResponse?.error) {
                setIsOAuthLoading(false);
                setOauthError('Google sign-in was cancelled or encountered an error.');
              }
            },
            error_callback: () => {
              setIsOAuthLoading(false);
            },
          });
          window._googleTokenClient = client;

          // Auto-trigger Account Chooser immediately on scan
          if (!googleStudent) {
            try {
              client.requestAccessToken({ prompt: 'select_account' });
            } catch (e) {}
          }
        }
      } catch (err) {
        console.warn('Google Auth setup error:', err);
      }
    };

    if (window.google?.accounts) {
      setupGoogleAuth();
    } else {
      const script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.defer = true;
      script.onload = setupGoogleAuth;
      document.body.appendChild(script);
    }
  }, [googleClientId]);

  // Manual Trigger for Google Sign-In button
  const handleGoogleSignInClick = () => {
    setOauthError('');
    setIsOAuthLoading(true);

    if (window._googleTokenClient) {
      try {
        window._googleTokenClient.requestAccessToken({ prompt: 'select_account' });
        return;
      } catch (e) {}
    }

    setIsOAuthLoading(false);
    setOauthError('Google Sign-In is initializing. Please tap "Sign in with Google" again.');
  };

  // Submit Attendance Handler
  const handleSubmitAttendance = async (e) => {
    e.preventDefault();
    setSubmitError('');

    if (isQrExpired || remainingSeconds <= 0) {
      setIsQrExpired(true);
      return;
    }

    if (!googleStudent) {
      setSubmitError('Please sign in with Google first.');
      return;
    }

    if (!studentName.trim() || !regNo.trim() || !studentEmail.trim()) {
      setSubmitError('Please complete Name, Registration Number, and Email fields.');
      return;
    }

    if (requireMobileNumber && !mobileNumber.trim()) {
      setSubmitError('Mobile Phone Number is required for this session.');
      return;
    }

    if (!tokenFromUrl) {
      setSubmitError('No active QR code token found. Please scan the current QR code on the screen.');
      return;
    }

    const cleanRegNo = regNo.trim().toUpperCase();
    const cleanEmail = studentEmail.trim().toLowerCase();

    // Check Client-Side Device Lock
    try {
      const history = JSON.parse(localStorage.getItem('proxyqr_device_submissions') || '[]');
      const match = history.find(
        (h) => h.sessionId === currentSessionId && (h.regNo !== cleanRegNo || h.email !== cleanEmail)
      );
      if (match) {
        setIsDuplicateModalOpen(true);
        return;
      }
    } catch (e) {}

    setIsSubmitting(true);

    const payload = {
      token: tokenFromUrl,
      studentId: cleanRegNo,
      regNo: cleanRegNo,
      studentName: studentName.trim(),
      email: cleanEmail,
      year,
      branch,
      mobileNumber: mobileNumber.trim(),
      userLocation,
      accuracy: gpsAccuracy,
      sessionId: currentSessionId,
      deviceUuid,
    };

    try {
      const { res, data } = await fetchWithFailover('/api/attendance/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      setIsSubmitting(false);

      if (res.ok && data?.success) {
        // Save Device Submission Record
        try {
          const existing = JSON.parse(localStorage.getItem('proxyqr_device_submissions') || '[]');
          const newEntry = {
            sessionId: currentSessionId,
            regNo: cleanRegNo,
            email: cleanEmail,
            studentName: studentName.trim(),
            timestamp: Date.now(),
          };
          existing.push(newEntry);
          localStorage.setItem('proxyqr_device_submissions', JSON.stringify(existing));
          setIsAlreadyMarked(true);
          setMarkedDetails(newEntry);
        } catch (e) {}

        setVerificationResult({
          success: true,
          message: data.message || 'Attendance marked successfully!',
          data: data.data || {
            user: cleanRegNo,
            userName: studentName.trim(),
            event: qrData?.title || currentSessionId,
            sessionTitle: qrData?.title || currentSessionId,
            distanceMeters: data.attendance?.distanceFromTargetMeters ?? liveDistanceMeters,
            allowedRadiusMeters: data.attendance?.allowedRadiusMeters ?? effectiveBoundary,
            timestamp: data.attendance?.timestamp || new Date(),
          },
          attendance: data.attendance,
        });
        setModalOpen(true);
      } else {
        const errMsg = data?.error || data?.message || 'Attendance verification failed.';
        setSubmitError(errMsg);

        if (data?.errorType === 'ANTI_PROXY_DEVICE_LOCK') {
          setIsDuplicateModalOpen(true);
          return;
        }

        if (data?.errorType === 'EXPIRED_TOKEN') {
          setIsQrExpired(true);
          return;
        }

        setVerificationResult({
          success: false,
          error: errMsg,
          errorType: data?.errorType || 'VERIFICATION_FAILED',
          distanceMeters: data?.distanceFromTargetMeters ?? liveDistanceMeters,
          allowedRadiusMeters: data?.allowedRadiusMeters ?? effectiveBoundary,
        });
        setModalOpen(true);
      }
    } catch (err) {
      setIsSubmitting(false);
      const errMsg = err.message || 'Network error verifying attendance.';
      setSubmitError(errMsg);
      setVerificationResult({
        success: false,
        error: errMsg,
        errorType: 'NETWORK_ERROR',
      });
      setModalOpen(true);
    }
  };

  return (
    <div className="min-h-[90vh] flex flex-col items-center justify-between px-4 py-6 relative select-none font-sans bg-transparent">
      <div className="w-full max-w-md space-y-4">
        {/* SESSION HEADER CARD */}
        <div className="glass-panel p-5 rounded-3xl space-y-2 text-center border border-slate-800 shadow-lg">
          <h2 className="font-display font-bold text-xl sm:text-2xl text-white">
            {qrData?.title || 'Attendance'}
          </h2>

          <div className="flex items-center justify-center gap-2 text-xs font-mono text-slate-300">
            <span className="px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-800 font-semibold">
              {currentSessionId}
            </span>
            {qrData?.labIdentifier && (
              <span className="px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-800 text-slate-400">
                {qrData.labIdentifier}
              </span>
            )}
            <span
              className={`px-2.5 py-1 rounded-lg font-bold border ${
                isSessionTerminated
                  ? 'bg-rose-500/15 text-rose-300 border-rose-500/30'
                  : isSessionPaused
                  ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                  : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
              }`}
            >
              {isSessionTerminated ? 'CLOSED' : isSessionPaused ? 'PAUSED' : 'ACTIVE'}
            </span>
          </div>
        </div>

        {/* ALREADY SUBMITTED BANNER */}
        {isAlreadyMarked && (
          <div className="p-4 rounded-2xl bg-emerald-500/15 border border-emerald-500/40 text-emerald-200 text-xs space-y-2">
            <div className="flex items-center gap-2 font-bold text-sm text-emerald-300">
              <CheckCheck className="w-5 h-5 text-emerald-400 flex-shrink-0" />
              <span>Attendance Already Marked</span>
            </div>
            <p className="text-[12px] text-emerald-300/90">
              Your attendance was recorded for <strong>{markedDetails?.regNo || regNo}</strong>.
            </p>
          </div>
        )}

        {/* PAUSED OR TERMINATED NOTICE */}
        {isSessionTerminated && (
          <div className="p-4 rounded-2xl bg-rose-500/15 border border-rose-500/30 text-rose-200 text-xs flex items-center gap-3">
            <Pause className="w-5 h-5 text-rose-400 flex-shrink-0" />
            <div>
              <div className="font-bold">Session Closed</div>
              <div className="text-[11px] text-rose-300/80">This attendance session has ended.</div>
            </div>
          </div>
        )}

        {isSessionPaused && !isSessionTerminated && (
          <div className="p-4 rounded-2xl bg-amber-500/15 border border-amber-500/30 text-amber-200 text-xs flex items-center gap-3">
            <Pause className="w-5 h-5 text-amber-400 flex-shrink-0" />
            <div>
              <div className="font-bold">Session Paused</div>
              <div className="text-[11px] text-amber-300/80">Please wait for the instructor to resume.</div>
            </div>
          </div>
        )}

        {/* SUBMIT ERROR ALERT */}
        {submitError && (
          <div className="p-3.5 rounded-2xl bg-rose-500/15 border border-rose-500/40 text-rose-300 text-xs flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 text-rose-400 flex-shrink-0 mt-0.5" />
            <span>{submitError}</span>
          </div>
        )}

        {/* ========================================================================= */}
        {/* STEP 1: GOOGLE AUTHENTICATION (PHOTO 1 -> PHOTO 2 DIRECT TRIGGER)         */}
        {/* ========================================================================= */}
        {!googleStudent ? (
          <div className="glass-panel p-6 rounded-3xl space-y-4 border border-slate-800 text-center">
            <div className="space-y-1.5">
              <h3 className="font-display font-bold text-xl text-white">
                Sign in with Google
              </h3>
              <p className="text-xs text-slate-400">
                Please authenticate using your Google account to mark attendance.
              </p>
            </div>

            {oauthError && (
              <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs text-left">
                {oauthError}
              </div>
            )}

            <button
              type="button"
              disabled={isOAuthLoading}
              onClick={handleGoogleSignInClick}
              className="w-full py-3.5 rounded-2xl bg-white hover:bg-slate-100 text-slate-900 font-bold text-sm flex items-center justify-center gap-3 shadow-md transition-all active:scale-[0.98] cursor-pointer disabled:opacity-50"
            >
              {isOAuthLoading ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin text-slate-900" />
                  <span>Connecting to Google...</span>
                </>
              ) : (
                <>
                  <GoogleGIcon />
                  <span>Sign in with Google</span>
                </>
              )}
            </button>
          </div>
        ) : (
          /* ========================================================================= */
          /* STEP 2: MINIMAL INTAKE FORM (COMPONENTS STREAMLINED & ABSTRACTED)        */
          /* ========================================================================= */
          <div className="space-y-4">
            {/* Real-time Countdown Banner */}
            <div className="flex items-center justify-between p-3.5 rounded-2xl bg-slate-900 border border-slate-800 text-xs font-mono">
              <span className="flex items-center gap-1.5 text-slate-400">
                <Clock className="w-4 h-4 text-cyan-400" />
                <span>Time remaining:</span>
              </span>
              <span className={`font-bold text-sm ${remainingSeconds <= 15 ? 'text-rose-400 animate-pulse' : 'text-cyan-400'}`}>
                {remainingSeconds}s
              </span>
            </div>

            {/* Simple Proximity Card */}
            <div className="glass-panel p-3.5 rounded-2xl border border-slate-800 flex items-center justify-between text-xs">
              <div className="flex items-center gap-2 text-slate-300">
                <MapPin className="w-4 h-4 text-cyan-400" />
                <span>Location:</span>
                <span className="font-semibold text-white">
                  {!isGeofenceActive
                    ? 'Bypassed'
                    : isTargetPlaceholder
                    ? 'Classroom'
                    : liveDistanceMeters === null
                    ? (isRefreshingGps ? 'Locating...' : 'Classroom')
                    : `~${liveDistanceMeters}m`}
                </span>
              </div>
              <span
                className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${
                  isInsideGeofence
                    ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                    : 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                }`}
              >
                {isInsideGeofence ? 'In Range' : 'Out of Range'}
              </span>
            </div>

            {/* Student Intake Form */}
            <form onSubmit={handleSubmitAttendance} className="glass-panel p-6 rounded-3xl space-y-4 border border-slate-800 text-xs">
              <div className="space-y-1.5">
                <label className="text-slate-300 font-semibold flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5 text-cyan-400" />
                  Full Name
                </label>
                <input
                  type="text"
                  value={studentName}
                  onChange={(e) => setStudentName(e.target.value)}
                  placeholder="Your Full Name"
                  required
                  className="w-full px-4 py-3 rounded-xl glass-input text-slate-100 text-sm"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-slate-300 font-semibold flex items-center gap-1.5">
                  <Hash className="w-3.5 h-3.5 text-cyan-400" />
                  Registration Number (Reg No)
                </label>
                <input
                  type="text"
                  value={regNo}
                  onChange={(e) => setRegNo(e.target.value.toUpperCase())}
                  placeholder="e.g. 2024BIT020"
                  required
                  className="w-full px-4 py-3 rounded-xl glass-input text-cyan-300 font-mono font-bold text-sm"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-slate-300 font-semibold flex items-center gap-1.5">
                  <Mail className="w-3.5 h-3.5 text-cyan-400" />
                  Email
                </label>
                <input
                  type="email"
                  value={studentEmail}
                  readOnly
                  disabled
                  required
                  className="w-full px-4 py-3 rounded-xl glass-input text-slate-300 text-sm bg-slate-900/80 cursor-not-allowed border-slate-800 font-medium"
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
                    Department
                  </label>
                  <select
                    value={branch}
                    onChange={(e) => setBranch(e.target.value)}
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
                    Mobile Number
                  </label>
                  <input
                    type="tel"
                    value={mobileNumber}
                    onChange={(e) => setMobileNumber(e.target.value)}
                    placeholder="9876543210"
                    required={requireMobileNumber}
                    className="w-full px-4 py-3 rounded-xl glass-input text-slate-200"
                  />
                </div>
              )}

              {/* Submit Attendance Button */}
              <button
                type="submit"
                disabled={isSubmitting || isSessionPaused || isSessionTerminated || isQrExpired}
                className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-bold text-sm shadow-md transition-all active:scale-[0.99] disabled:opacity-40 flex items-center justify-center gap-2 cursor-pointer mt-4"
              >
                {isSubmitting ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Verifying...</span>
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    <span>Mark Attendance</span>
                  </>
                )}
              </button>
            </form>
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* 1 SUBMISSION PER DEVICE POPUP MODAL                                       */}
      {/* ========================================================================= */}
      {isDuplicateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fadeIn">
          <div className="relative w-full max-w-sm glass-panel p-6 rounded-3xl border border-slate-700 shadow-xl space-y-4 text-center">
            <button
              type="button"
              onClick={() => setIsDuplicateModalOpen(false)}
              className="absolute top-4 right-4 p-1.5 rounded-full bg-slate-900 text-slate-400 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="inline-flex p-3 rounded-full bg-rose-500/20 text-rose-400 border border-rose-500/30">
              <Lock className="w-8 h-8" />
            </div>

            <h3 className="font-display text-lg font-bold text-white">
              One submission per device allowed
            </h3>

            <p className="text-xs text-slate-300 leading-relaxed">
              This device has already recorded attendance for this session. Each student must mark attendance from their own device.
            </p>

            <button
              type="button"
              onClick={() => setIsDuplicateModalOpen(false)}
              className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* QR CODE EXPIRED POPUP MODAL                                               */}
      {/* ========================================================================= */}
      {isQrExpired && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fadeIn">
          <div className="relative w-full max-w-sm glass-panel p-6 rounded-3xl border border-amber-500/40 shadow-xl space-y-4 text-center">
            <div className="inline-flex p-3 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30">
              <Clock className="w-8 h-8" />
            </div>

            <h3 className="font-display text-lg font-bold text-white">
              QR Code Expired
            </h3>

            <p className="text-xs text-slate-300 leading-relaxed">
              The time to mark attendance for this QR code has expired. Please scan the current QR code on the screen.
            </p>

            <button
              type="button"
              onClick={() => window.location.reload()}
              className="w-full py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs transition-colors cursor-pointer"
            >
              Scan Again
            </button>
          </div>
        </div>
      )}

      {/* VERIFICATION RECEIPT MODAL */}
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
