import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ShieldCheck,
  Lock,
  KeyRound,
  ArrowRight,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
} from 'lucide-react';
import { fetchWithFailover } from '../utils/apiResolver';

export default function AdminAuth() {
  const navigate = useNavigate();

  // Form States
  const [masterPassword, setMasterPassword] = useState('');

  // UI Status States
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successState, setSuccessState] = useState(false);

  // Clear stale sessions when visiting login page
  useEffect(() => {
    try {
      localStorage.removeItem('admin_token');
      localStorage.removeItem('admin_user');
      sessionStorage.clear();
    } catch (e) {}
  }, []);

  // Handle Master Password Login
  const handleMasterLoginSubmit = async (e) => {
    e.preventDefault();
    setErrorMessage('');

    if (!masterPassword) {
      setErrorMessage('Please enter the Master Admin Password.');
      return;
    }

    setIsLoading(true);

    try {
      const { res, data } = await fetchWithFailover('/api/admin/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: masterPassword }),
      });

      if (!res.ok || !data.success || !data.token) {
        setErrorMessage(data.message || 'Invalid Master Password. Access Denied.');
        setIsLoading(false);
        return;
      }

      localStorage.setItem('admin_token', data.token);
      localStorage.setItem('admin_user', JSON.stringify(data.admin));

      setIsLoading(false);
      setSuccessState(true);

      setTimeout(() => {
        navigate('/');
      }, 800);
    } catch (err) {
      setErrorMessage(err.message || 'Network error connecting to Admin Auth server.');
      setIsLoading(false);
    }
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
              Authentication Success
            </h2>
            <p className="text-sm font-mono text-emerald-400 font-semibold">
              Authorized into ProxyQr Admin Console
            </p>
            <p className="text-xs font-mono text-slate-400">
              Redirecting to Admin Portal...
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
      <div className="my-auto glass-panel-glow p-8 lg:p-10 rounded-3xl max-w-md w-full space-y-6 relative overflow-hidden animate-fadeIn border border-slate-800 shadow-[0_0_50px_rgba(6,182,212,0.15)]">
        {/* Brand Header */}
        <div className="text-center space-y-2">
          <div className="inline-flex p-3.5 rounded-2xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 shadow-[0_0_20px_rgba(6,182,212,0.25)]">
            <ShieldCheck className="w-9 h-9 animate-pulse" />
          </div>
          <h1 className="font-display text-2xl lg:text-3xl font-extrabold tracking-tight text-white">
            ProxyQr Admin Security
          </h1>
          <p className="text-xs text-slate-400 font-mono">
            Master Administrator Portal Authentication
          </p>
        </div>

        {/* Alerts & Feedback */}
        {errorMessage && (
          <div className="p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/40 text-xs font-mono text-rose-300 space-y-1 animate-fadeIn">
            <div className="flex items-center gap-2 font-bold text-rose-400">
              <AlertTriangle className="w-4 h-4" />
              <span>Authentication Error</span>
            </div>
            <p className="leading-relaxed text-[11px]">{errorMessage}</p>
          </div>
        )}

        {/* MASTER PASSWORD LOGIN FORM */}
        <form onSubmit={handleMasterLoginSubmit} className="space-y-4 text-xs font-mono">
          <div className="space-y-1.5">
            <label className="font-semibold flex items-center gap-1.5 text-slate-300">
              <KeyRound className="w-3.5 h-3.5 text-cyan-400" />
              Master Admin Password
            </label>
            <input
              type="password"
              value={masterPassword}
              onChange={(e) => setMasterPassword(e.target.value)}
              placeholder="Enter master password..."
              autoComplete="current-password"
              required
              className="w-full px-4 py-3.5 rounded-xl glass-input font-mono text-slate-200 placeholder:text-slate-500 focus:border-cyan-500 text-sm"
            />
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-4 rounded-2xl bg-gradient-to-r from-cyan-500 via-blue-600 to-indigo-600 text-white font-display font-bold text-sm shadow-[0_0_25px_rgba(6,182,212,0.4)] hover:shadow-[0_0_35px_rgba(6,182,212,0.6)] transition-all active:scale-[0.99] disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
          >
            {isLoading ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Verifying Master Password...</span>
              </>
            ) : (
              <>
                <span>Authenticate Admin</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>
      </div>

      <footer className="pt-6 pb-2 text-center text-xs font-mono text-slate-400 tracking-wider">
        <span>ProxyQr Admin Security • Multi-Lab Attendance System</span>
      </footer>
    </div>
  );
}

