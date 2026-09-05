import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  ShieldCheck,
  Radio,
  Lock,
  LogOut,
  KeyRound,
  UserCheck,
  AlertTriangle,
  X,
  Play,
  Clock,
  Sparkles,
  Eye,
  EyeOff,
} from 'lucide-react';
import { useSocket } from '../context/SocketContext';

export default function Navbar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { connected, backendUrl, joinSession } = useSocket();

  const [adminUser, setAdminUser] = useState(null);
  const [unterminatedSessions, setUnterminatedSessions] = useState([]);
  const [isChangePasswordModalOpen, setIsChangePasswordModalOpen] = useState(false);

  const [currentPassword, setCurrentPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isAdminRoute = location.pathname.startsWith('/admin') || location.pathname === '/';
  const isLoginPage = location.pathname === '/admin/login';

  const checkAdminSession = async () => {
    try {
      const stored = localStorage.getItem('admin_user');
      if (stored) {
        setAdminUser(JSON.parse(stored));
      }

      // Fetch fresh session state and unterminated sessions from backend
      const token = localStorage.getItem('admin_token');
      if (token) {
        const res = await fetch(`${backendUrl}/api/admin/me`, {
          headers: {
            Authorization: `Bearer ${token}`,
            'x-admin-token': token,
          },
        });
        const data = await res.json();
        if (data?.success && data?.admin) {
          setAdminUser(data.admin);
          localStorage.setItem('admin_user', JSON.stringify(data.admin));
          if (Array.isArray(data.unterminatedSessions)) {
            setUnterminatedSessions(data.unterminatedSessions.filter((s) => s.status !== 'TERMINATED'));
          }
        }
      }
    } catch (e) {
      console.warn('[Navbar] Session check error:', e);
    }
  };

  useEffect(() => {
    checkAdminSession();
  }, [location.pathname, backendUrl]);

  const handleLogout = async () => {
    try {
      const token = localStorage.getItem('admin_token');
      await fetch(`${backendUrl}/api/admin/auth/logout`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'x-admin-token': token },
      }).catch(() => {});
    } catch (e) {}

    localStorage.removeItem('admin_token');
    localStorage.removeItem('admin_user');
    sessionStorage.clear();
    setAdminUser(null);
    navigate('/admin/login');
  };

  const handleLogoutAll = async () => {
    if (!window.confirm('Are you sure you want to revoke all active sessions across all devices?')) return;

    try {
      const token = localStorage.getItem('admin_token');
      await fetch(`${backendUrl}/api/admin/auth/logout-all`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'x-admin-token': token },
      });
      alert('All active admin sessions have been revoked.');
    } catch (e) {
      alert('Error revoking sessions: ' + e.message);
    }

    handleLogout();
  };

  const [otpCode, setOtpCode] = useState('');
  const [isSendingOtp, setIsSendingOtp] = useState(false);
  const [otpSentMessage, setOtpSentMessage] = useState('');
  const [cooldown, setCooldown] = useState(0);
  const [isDevConsole, setIsDevConsole] = useState(false);

  useEffect(() => {
    let timer;
    if (cooldown > 0) {
      timer = setInterval(() => {
        setCooldown((prev) => prev - 1);
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [cooldown]);

  const handleRequestChangeOtp = async () => {
    if (cooldown > 0) return;
    setPasswordError('');
    setOtpSentMessage('');
    setIsDevConsole(false);

    const token = localStorage.getItem('admin_token');
    if (!token) {
      setPasswordError('Session expired or not logged in. Please log in first, or click "Forgot Password?" on the login page.');
      return;
    }

    setIsSendingOtp(true);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    try {
      const res = await fetch(`${backendUrl}/api/admin/auth/request-change-password-otp`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'x-admin-token': token,
        },
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      const data = await res.json();
      if (!res.ok || !data.success) {
        setPasswordError(data.message || 'Failed to send OTP to owner email.');
        setIsSendingOtp(false);
        return;
      }

      setIsDevConsole(!!data.isDevConsole);
      setOtpSentMessage(data.message || 'OTP sent! Please check your inbox and spam folder.');
      setCooldown(30);
    } catch (err) {
      clearTimeout(timeoutId);
      if (err.name === 'AbortError') {
        setPasswordError('Request timed out (server was spinning up). Please click "Send OTP to Owner Email" again.');
      } else {
        setPasswordError(err.message || 'Network error requesting OTP.');
      }
    } finally {
      setIsSendingOtp(false);
    }
  };

  const handleChangePasswordSubmit = async (e) => {
    e.preventDefault();
    setPasswordError('');
    setPasswordSuccess('');

    const token = localStorage.getItem('admin_token');
    if (!token) {
      setPasswordError('Session expired or not logged in. Please log in first, or click "Forgot Password?" on the login page.');
      return;
    }

    if (!currentPassword || !newPassword || !otpCode) {
      setPasswordError('Please fill in current password, new password, and the 6-digit email OTP.');
      return;
    }

    if (newPassword.length < 8) {
      setPasswordError('New password must be at least 8 characters long.');
      return;
    }

    setIsSubmitting(true);

    try {
      const token = localStorage.getItem('admin_token');
      const res = await fetch(`${backendUrl}/api/admin/auth/change-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          'x-admin-token': token,
        },
        body: JSON.stringify({ currentPassword, newPassword, otp: otpCode.trim() }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setPasswordError(data.message || 'Failed to update master password.');
        setIsSubmitting(false);
        return;
      }

      if (data.token) {
        localStorage.setItem('admin_token', data.token);
      }

      setPasswordSuccess('Master password updated successfully! All other sessions revoked.');
      setTimeout(() => {
        setIsChangePasswordModalOpen(false);
        setCurrentPassword('');
        setNewPassword('');
        setOtpCode('');
        setOtpSentMessage('');
        setPasswordSuccess('');
      }, 1200);
    } catch (err) {
      setPasswordError(err.message || 'Network error updating password.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const resumePausedSession = (sessionId) => {
    joinSession(sessionId);
    setUnterminatedSessions((prev) => prev.filter((s) => s.sessionId !== sessionId));
  };

  return (
    <>
      <header className="sticky top-0 z-50 bg-slate-950/80 backdrop-blur-xl border-b border-slate-800/80 select-none">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16 sm:h-20">
            {/* Logo + Role Pill */}
            <div className="flex items-center space-x-3">
              <div className="p-2 sm:p-2.5 rounded-2xl bg-gradient-to-tr from-cyan-500/20 via-blue-500/20 to-indigo-500/20 border border-cyan-500/40 text-cyan-400 shadow-[0_0_20px_rgba(6,182,212,0.3)]">
                <ShieldCheck className="w-5 h-5 sm:w-6 sm:h-6" />
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center sm:gap-3">
                <span className="font-display font-black text-lg sm:text-xl tracking-tight text-white">
                  ProxyQr
                </span>
                <span className="inline-flex items-center text-[10px] font-mono font-bold px-2.5 py-0.5 rounded-full bg-slate-900 text-cyan-300 border border-cyan-500/30 shadow-[0_0_10px_rgba(6,182,212,0.15)]">
                  ADMIN CONSOLE
                </span>
              </div>
            </div>

            {/* Status Indicator + Session Mode + Account Actions */}
            <div className="flex items-center space-x-3 sm:space-x-4">
              {/* Socket.IO Connection Dot */}
              <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-900/90 border border-slate-800 text-xs font-mono">
                <span className={`w-2 h-2 rounded-full ${connected ? 'bg-emerald-400 animate-pulse' : 'bg-rose-500'}`}></span>
                <span className={connected ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>
                  {connected ? 'SOCKET ONLINE' : 'SOCKET OFFLINE'}
                </span>
              </div>

              {/* Admin Mode Badge */}
              {adminUser && !isLoginPage && (
                <div className="hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-xs font-mono text-cyan-300">
                  <UserCheck className="w-3.5 h-3.5 text-cyan-400" />
                  <span>
                    {adminUser.isOtp ? '[Proctor Session (90m)]' : '[Master Admin]'}
                  </span>
                </div>
              )}

              {/* Account Controls */}
              {adminUser && !isLoginPage && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setIsChangePasswordModalOpen(true)}
                    className="p-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-cyan-300 border border-slate-800 transition-colors cursor-pointer"
                    title="Change Master Password"
                  >
                    <KeyRound className="w-4 h-4" />
                  </button>

                  <button
                    onClick={handleLogoutAll}
                    className="hidden sm:flex items-center gap-1 px-3 py-1.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 text-xs font-mono font-bold transition-colors cursor-pointer"
                    title="Revoke all active sessions across devices"
                  >
                    <Lock className="w-3 h-3" />
                    <span>Logout All</span>
                  </button>

                  <button
                    onClick={handleLogout}
                    className="p-2 sm:px-3 sm:py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-rose-400 border border-slate-800 text-xs font-mono transition-colors cursor-pointer flex items-center gap-1.5"
                    title="Log Out"
                  >
                    <LogOut className="w-4 h-4" />
                    <span className="hidden sm:inline">Logout</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Crash Guard Banner: Unterminated Paused Sessions Detected */}
      {unterminatedSessions.length > 0 && !isLoginPage && (
        <div className="bg-amber-500/15 border-b border-amber-500/30 px-4 py-2.5 text-xs font-mono text-amber-200 animate-fadeIn">
          <div className="container mx-auto flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-400 animate-bounce" />
              <span className="font-bold">
                Paused Session Detected: [{unterminatedSessions[0].sessionId}] ({unterminatedSessions[0].title})
              </span>
            </div>

            <button
              onClick={() => resumePausedSession(unterminatedSessions[0].sessionId)}
              className="flex items-center gap-1 px-3 py-1 rounded-xl bg-amber-500 text-slate-950 font-bold hover:bg-amber-400 transition-all cursor-pointer"
            >
              <Play className="w-3 h-3 fill-slate-950" />
              <span>Resume Session</span>
            </button>
          </div>
        </div>
      )}

      {/* Change Password Modal */}
      {isChangePasswordModalOpen && (
        <div className="fixed inset-0 z-[99990] bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 animate-fadeIn">
          <div className="glass-panel p-6 sm:p-8 rounded-3xl max-w-md w-full space-y-5 border-cyan-500/40 shadow-[0_0_50px_rgba(6,182,212,0.2)]">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2 text-white font-display font-bold">
                <KeyRound className="w-5 h-5 text-cyan-400" />
                <span>Change Master Admin Password</span>
              </div>
              <button
                onClick={() => setIsChangePasswordModalOpen(false)}
                className="p-1 rounded-xl bg-slate-900 text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {passwordError && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs font-mono">
                {passwordError}
              </div>
            )}

            {otpSentMessage && (
              <div className="p-3 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 text-xs font-mono font-bold">
                {otpSentMessage}
              </div>
            )}

            {passwordSuccess && (
              <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs font-mono font-bold">
                {passwordSuccess}
              </div>
            )}

            <form onSubmit={handleChangePasswordSubmit} className="space-y-4 text-xs font-mono">
              <div className="space-y-1.5">
                <label className="text-slate-300 font-semibold block">Current Master Password</label>
                <div className="relative">
                  <input
                    type={showCurrentPassword ? 'text' : 'password'}
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder="Enter current password..."
                    required
                    className="w-full pl-4 pr-11 py-3 rounded-xl glass-input text-slate-200"
                  />
                  <button
                    type="button"
                    onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-cyan-300 transition-colors p-1 cursor-pointer"
                    title={showCurrentPassword ? 'Hide password' : 'Show password'}
                  >
                    {showCurrentPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-slate-300 font-semibold block">New Master Password (Min 8 chars)</label>
                <div className="relative">
                  <input
                    type={showNewPassword ? 'text' : 'password'}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Enter new master password..."
                    required
                    className="w-full pl-4 pr-11 py-3 rounded-xl glass-input text-slate-200"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-cyan-300 transition-colors p-1 cursor-pointer"
                    title={showNewPassword ? 'Hide password' : 'Show password'}
                  >
                    {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-slate-300 font-semibold block">Owner Security OTP (6 Digits)</label>
                  <button
                    type="button"
                    onClick={handleRequestChangeOtp}
                    disabled={isSendingOtp || cooldown > 0}
                    className="text-[11px] text-cyan-400 hover:underline font-bold disabled:opacity-50"
                  >
                    {isSendingOtp
                      ? 'Sending...'
                      : cooldown > 0
                      ? `Resend OTP (${cooldown}s)`
                      : 'Send OTP to Owner Email'}
                  </button>
                </div>
                <input
                  type="text"
                  maxLength={6}
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ''))}
                  placeholder="Enter 6-digit OTP..."
                  required
                  className="w-full px-4 py-3 rounded-xl glass-input text-cyan-300 font-bold tracking-[4px]"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsChangePasswordModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl bg-slate-900 text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 font-bold text-white shadow-[0_0_20px_rgba(6,182,212,0.4)]"
                >
                  {isSubmitting ? 'Updating...' : 'Update Password'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

