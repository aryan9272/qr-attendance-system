import React, { useState, useEffect } from 'react';
import {
  QrCode,
  ShieldCheck,
  Mail,
  Lock,
  User,
  ArrowRight,
  Sparkles,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
} from 'lucide-react';

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

// Dynamic API Resolver (Ensures Localhost & Mobile Wi-Fi both work 100% of the time)
const getApiBaseEndpoints = () => {
  const endpoints = [];
  if (typeof window !== 'undefined' && window.location) {
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
      endpoints.push('http://localhost:5000');
    } else {
      endpoints.push(`http://${window.location.hostname}:5000`);
    }
  }
  if (import.meta.env.VITE_API_BASE_URL) endpoints.push(import.meta.env.VITE_API_BASE_URL);
  if (import.meta.env.VITE_BACKEND_URL) endpoints.push(import.meta.env.VITE_BACKEND_URL);
  endpoints.push('http://localhost:5000');

  return [...new Set(endpoints)];
};

export default function FacultyAuth() {
  const [activeTab, setActiveTab] = useState('login'); // 'login' | 'signup'
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');

  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successState, setSuccessState] = useState(false);

  // Always clear stale session tokens on visiting login page so NO automatic redirect happens!
  useEffect(() => {
    try {
      localStorage.removeItem('faculty_token');
      localStorage.removeItem('faculty_user');
      sessionStorage.clear();
    } catch (e) {
      console.warn('Session clear note:', e);
    }
  }, []);

  // Dynamically load Official Google Identity Services SDK if not preloaded
  useEffect(() => {
    const loadGsi = () => {
      if (window.google?.accounts?.id || window.google?.accounts?.oauth2) return;
      const script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.defer = true;
      document.body.appendChild(script);
    };
    loadGsi();
  }, []);

  // Check for implicit token returned in URL hash after OAuth redirect
  useEffect(() => {
    if (window.location.hash && window.location.hash.includes('access_token=')) {
      const params = new URLSearchParams(window.location.hash.replace('#', '?'));
      const accessToken = params.get('access_token');
      if (accessToken) {
        window.history.replaceState(null, '', window.location.pathname);
        setIsLoading(true);
        fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
          headers: { Authorization: `Bearer ${accessToken}` },
        })
          .then((res) => res.json())
          .then((userInfo) => {
            if (userInfo && userInfo.email) {
              authorizeFacultySession(userInfo.email, userInfo.name || userInfo.email.split('@')[0], accessToken);
            } else {
              setIsLoading(false);
            }
          })
          .catch(() => setIsLoading(false));
      }
    }
  }, []);

  // TRIGGER REAL NATIVE GOOGLE OAUTH POPUP DIRECTLY FROM GOOGLE (STRICT: NO AUTO-LOGIN ON CANCEL/CLOSE)
  const handleGoogleSignInClick = () => {
    setErrorMessage('');
    setIsLoading(true);

    const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID || DEFAULT_GOOGLE_CLIENT_ID;

    if (window.google?.accounts?.oauth2) {
      try {
        const client = window.google.accounts.oauth2.initTokenClient({
          client_id: googleClientId,
          scope: 'email profile',
          callback: async (tokenResponse) => {
            if (tokenResponse && tokenResponse.access_token) {
              try {
                // Fetch authenticated user profile directly from Google's UserInfo API (<100ms)
                const userInfoRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
                  headers: { Authorization: `Bearer ${tokenResponse.access_token}` },
                });
                const userInfo = await userInfoRes.json();
                if (userInfo && userInfo.email) {
                  authorizeFacultySession(userInfo.email, userInfo.name || userInfo.email.split('@')[0], tokenResponse.access_token);
                  return;
                }
              } catch (fetchErr) {
                console.warn('Google UserInfo API fetch error:', fetchErr);
              }
            }
            setIsLoading(false);
            setErrorMessage('Google authentication was not completed. Please select a Google account.');
          },
          error_callback: (err) => {
            console.warn('Google Sign-In error:', err);
            setIsLoading(false);
            setErrorMessage('Google Sign-In window was closed or cancelled. Please select an account.');
          },
        });
        client.requestAccessToken();
        return;
      } catch (e) {
        console.warn('Token client init note:', e);
      }
    }

    setIsLoading(false);
    setErrorMessage('Google Identity Services SDK initializing. Please click "Continue with Google" again.');
  };

  // Ultra-Fast Backend Verification Guard with Resilient Endpoint Failover
  const authorizeFacultySession = async (targetEmail, targetName, googleToken = '') => {
    setIsLoading(true);
    setErrorMessage('');

    const payload = {
      email: targetEmail.trim().toLowerCase(),
      name: targetName,
      googleToken,
      avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=150',
      mode: activeTab,
      department: 'Information Technology',
    };

    const endpoints = getApiBaseEndpoints();
    let lastError = null;

    for (const baseUrl of endpoints) {
      try {
        const response = await fetch(`${baseUrl}/api/faculty/auth/google`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        const data = await response.json();

        if (!response.ok || response.status !== 200 || !data.success || !data.token) {
          setErrorMessage(data.message || data.error || 'Unauthorized Faculty Account. Access Denied.');
          setIsLoading(false);
          return;
        }

        localStorage.setItem('faculty_token', data.token);
        localStorage.setItem('faculty_user', JSON.stringify(data.faculty));

        setIsLoading(false);
        setSuccessState(true);

        setTimeout(() => {
          window.location.href = '/';
        }, 1000);
        return;
      } catch (err) {
        lastError = err;
        console.warn(`Attempt failed for ${baseUrl}:`, err.message);
      }
    }

    setErrorMessage(`Network error connecting to backend auth server: ${lastError ? lastError.message : 'Backend server unreachable'}. Please make sure backend server is running.`);
    setIsLoading(false);
  };

  // Manual Form Submit Handler with Resilient Endpoint Failover
  const handleAuthSubmit = async (e) => {
    if (e) e.preventDefault();
    setErrorMessage('');

    if (!email.trim()) {
      setErrorMessage('Please enter your Email Address.');
      return;
    }

    const cleanEmail = email.trim().toLowerCase();
    const cleanName = fullName || (activeTab === 'signup' ? 'Faculty User' : '');

    if (!cleanEmail.includes('@')) {
      setErrorMessage(`Invalid email address: "${cleanEmail}".`);
      return;
    }

    setIsLoading(true);

    const payload = {
      email: cleanEmail,
      name: cleanName,
      password: password || 'default-faculty-pass',
      mode: activeTab,
      department: 'Information Technology',
      avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=150',
    };

    const endpoints = getApiBaseEndpoints();
    let lastError = null;

    for (const baseUrl of endpoints) {
      try {
        const response = await fetch(`${baseUrl}/api/faculty/auth/google`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        const data = await response.json();

        if (!response.ok || response.status !== 200 || !data.success || !data.token) {
          setErrorMessage(data.message || data.error || 'Authentication failed. Please verify your credentials.');
          setIsLoading(false);
          return;
        }

        localStorage.setItem('faculty_token', data.token);
        localStorage.setItem('faculty_user', JSON.stringify(data.faculty));

        setIsLoading(false);
        setSuccessState(true);

        setTimeout(() => {
          window.location.href = '/';
        }, 1000);
        return;
      } catch (err) {
        lastError = err;
        console.warn(`Attempt failed for ${baseUrl}:`, err.message);
      }
    }

    setErrorMessage(`Network error connecting to auth server: ${lastError ? lastError.message : 'Backend server unreachable'}. Please make sure backend server is running.`);
    setIsLoading(false);
  };

  // SUCCESS FEEDBACK SCREEN
  if (successState) {
    return (
      <div className="min-h-[85vh] flex flex-col items-center justify-center px-4 py-8 relative select-none font-sans bg-transparent">
        <div className="glass-panel-glow p-8 lg:p-10 rounded-3xl max-w-md w-full text-center space-y-6 animate-fadeIn border border-emerald-500/40 shadow-[0_0_50px_rgba(16,185,129,0.3)]">
          <div className="inline-flex p-4 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 shadow-[0_0_25px_rgba(16,185,129,0.4)] animate-bounce">
            <CheckCircle2 className="w-12 h-12 text-emerald-400" />
          </div>

          <div className="space-y-2">
            <h2 className="font-display text-2xl font-extrabold text-white tracking-tight">
              Success!
            </h2>
            <p className="text-sm font-mono text-emerald-400 font-semibold">
              Successfully logged into ProxyQr Admin
            </p>
            <p className="text-xs font-mono text-slate-400">
              Redirecting in 1s...
            </p>
          </div>

          <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
            <div className="bg-emerald-500 h-full w-full animate-pulse"></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[85vh] flex flex-col items-center justify-between px-4 py-8 relative select-none font-sans bg-transparent">
      {/* Main Login Screen */}
      <div className="my-auto glass-panel-glow p-8 lg:p-10 rounded-3xl max-w-md w-full space-y-6 relative overflow-hidden animate-fadeIn border border-slate-800 shadow-[0_0_50px_rgba(6,182,212,0.15)]">
        
        <div className="text-center space-y-2">
          <div className="inline-flex p-3.5 rounded-2xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 shadow-[0_0_20px_rgba(6,182,212,0.25)]">
            <QrCode className="w-9 h-9 animate-pulse" />
          </div>
          <h1 className="font-display text-2xl lg:text-3xl font-extrabold tracking-tight text-white">
            ProxyQr Faculty Portal
          </h1>
        </div>

        {/* Sign In vs Sign Up Toggle Switch */}
        <div className="flex p-1 rounded-2xl bg-slate-900/90 border border-slate-800 text-xs font-mono">
          <button
            type="button"
            onClick={() => {
              setActiveTab('login');
              setErrorMessage('');
            }}
            className={`flex-1 py-2.5 rounded-xl font-bold transition-all cursor-pointer ${
              activeTab === 'login'
                ? 'bg-cyan-500 text-slate-950 shadow-[0_0_15px_rgba(6,182,212,0.4)]'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab('signup');
              setErrorMessage('');
            }}
            className={`flex-1 py-2.5 rounded-xl font-bold transition-all cursor-pointer ${
              activeTab === 'signup'
                ? 'bg-cyan-500 text-slate-950 shadow-[0_0_15px_rgba(6,182,212,0.4)]'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Sign Up
          </button>
        </div>

        {/* Error Banner */}
        {errorMessage && (
          <div className="p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/40 text-xs font-mono text-rose-300 space-y-1.5 animate-fadeIn">
            <div className="flex items-center gap-2 font-bold text-rose-400">
              <AlertTriangle className="w-4 h-4" />
              <span>Authentication Error</span>
            </div>
            <p className="leading-relaxed text-[11px] font-semibold">{errorMessage}</p>

            {errorMessage.includes('Account not found') && (
              <button
                type="button"
                onClick={() => {
                  setActiveTab('signup');
                  setErrorMessage('');
                }}
                className="mt-1 px-3 py-1.5 rounded-xl bg-cyan-500 text-slate-950 font-bold text-[11px] hover:bg-cyan-400 transition-colors w-full cursor-pointer"
              >
                Switch to Sign-Up Tab Now →
              </button>
            )}
          </div>
        )}

        {/* Form Controls */}
        <form onSubmit={handleAuthSubmit} className="space-y-4 text-xs font-mono" autoComplete="off">
          {activeTab === 'signup' && (
            <div className="space-y-1.5 animate-fadeIn">
              <label className="font-semibold flex items-center gap-1.5 text-slate-300">
                <User className="w-3.5 h-3.5 text-cyan-400" />
                Faculty Full Name
              </label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Enter full name..."
                autoComplete="off"
                required={activeTab === 'signup'}
                className="w-full px-4 py-3 rounded-xl glass-input font-sans text-slate-200 placeholder:text-slate-500 focus:border-cyan-500"
              />
            </div>
          )}

          <div className="space-y-1.5">
            <label className="font-semibold flex items-center justify-between text-slate-300">
              <span className="flex items-center gap-1.5">
                <Mail className="w-3.5 h-3.5 text-cyan-400" />
                Email Address
              </span>
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Enter email address..."
              autoComplete="off"
              required
              className="w-full px-4 py-3 rounded-xl glass-input font-mono text-cyan-300 placeholder:text-slate-500 focus:border-cyan-500"
            />
          </div>

          <div className="space-y-1.5">
            <label className="font-semibold flex items-center gap-1.5 text-slate-300">
              <Lock className="w-3.5 h-3.5 text-cyan-400" />
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password..."
              autoComplete="new-password"
              required
              className="w-full px-4 py-3 rounded-xl glass-input font-mono text-slate-200 placeholder:text-slate-500 focus:border-cyan-500"
            />
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-cyan-500 via-blue-600 to-indigo-600 text-white font-display font-bold text-sm shadow-[0_0_25px_rgba(6,182,212,0.4)] hover:shadow-[0_0_35px_rgba(6,182,212,0.6)] transition-all active:scale-[0.99] disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
          >
            <span>{isLoading ? 'Authenticating...' : activeTab === 'signup' ? 'Create Faculty Account' : 'Sign In to Dashboard'}</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>

        <div className="relative flex py-1 items-center">
          <div className="flex-grow border-t border-slate-800"></div>
          <span className="flex-shrink mx-3 text-[11px] font-mono text-slate-500 uppercase">OR GOOGLE OAUTH</span>
          <div className="flex-grow border-t border-slate-800"></div>
        </div>

        {/* ONE-CLICK "CONTINUE WITH GOOGLE" BUTTON */}
        <div className="space-y-3">
          <button
            type="button"
            onClick={handleGoogleSignInClick}
            disabled={isLoading}
            className="w-full py-3.5 px-6 rounded-2xl bg-[#18181b] hover:bg-[#27272a] active:scale-[0.98] border border-slate-700/80 text-white font-sans font-medium text-xs shadow-xl transition-all disabled:opacity-50 flex items-center justify-center gap-3 cursor-pointer"
          >
            {isLoading ? <RefreshCw className="w-5 h-5 animate-spin text-cyan-400" /> : <GoogleGIcon />}
            <span>{isLoading ? 'Connecting to Google OAuth...' : 'Continue with Google'}</span>
          </button>
        </div>
      </div>

      {/* Footer Signature */}
      <footer className="pt-6 pb-2 text-center text-xs font-mono text-slate-400 tracking-wider">
        <span>By Aryan Kale</span>
      </footer>
    </div>
  );
}
