import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { QrCode, Radio, LogOut } from 'lucide-react';
import { useSocket } from '../context/SocketContext';

export default function Navbar() {
  const { connected } = useSocket();
  const location = useLocation();

  const isStudentView = location.pathname.startsWith('/scan');
  const isFacultyLoginPage = location.pathname === '/faculty/login';
  const [facultyUser, setFacultyUser] = useState(null);

  useEffect(() => {
    const saved = localStorage.getItem('faculty_user');
    if (saved) {
      try {
        setFacultyUser(JSON.parse(saved));
      } catch (e) {
        setFacultyUser(null);
      }
    } else {
      setFacultyUser(null);
    }
  }, [location.pathname]);

  const handleFacultyLogout = () => {
    try {
      localStorage.clear();
      sessionStorage.clear();
    } catch (e) {
      console.warn('Error clearing storage on logout:', e);
    }
    window.location.href = '/faculty/login';
  };

  return (
    <header className="border-b border-slate-800/80 bg-slate-950/80 backdrop-blur-xl sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 lg:px-8 h-16 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="p-2 rounded-xl bg-gradient-to-tr from-cyan-500 to-indigo-600 shadow-[0_0_15px_rgba(6,182,212,0.4)]">
            <QrCode className="w-5 h-5 text-slate-950 stroke-[2.5]" />
          </div>
          <div>
            <h1 className="font-display font-bold text-lg tracking-tight text-white flex items-center gap-2">
              ProxyQr
              {isStudentView ? (
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/30">
                  STUDENT PORTAL
                </span>
              ) : isFacultyLoginPage ? (
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/30">
                  FACULTY AUTH
                </span>
              ) : (
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/30">
                  FACULTY ADMIN
                </span>
              )}
            </h1>
          </div>
        </div>

        <div className="flex items-center space-x-3">
          {!isFacultyLoginPage && (
            <div
              className={`flex items-center space-x-1.5 px-3 py-1 rounded-full text-xs font-mono border transition-all ${
                connected
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.2)]'
                  : 'bg-rose-500/10 border-rose-500/30 text-rose-400'
              }`}
            >
              <Radio className={`w-3.5 h-3.5 ${connected ? 'animate-pulse' : ''}`} />
              <span className="font-semibold uppercase tracking-wider text-[11px]">
                {connected ? 'SOCKET ONLINE' : 'DISCONNECTED'}
              </span>
            </div>
          )}

          {!isFacultyLoginPage && !isStudentView && facultyUser && (
            <div className="flex items-center space-x-3 pl-2 border-l border-slate-800">
              <div className="flex items-center space-x-2">
                {facultyUser.avatarUrl ? (
                  <img
                    src={facultyUser.avatarUrl}
                    alt={facultyUser.name}
                    className="w-8 h-8 rounded-full border border-cyan-500/40 object-cover"
                  />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-cyan-500/20 border border-cyan-500/40 flex items-center justify-center font-bold text-xs text-cyan-300">
                    {facultyUser.name ? facultyUser.name.charAt(0) : 'A'}
                  </div>
                )}
                <span className="hidden md:inline text-xs font-semibold text-slate-200">
                  {facultyUser.name || 'Aryan Kale'}
                </span>
              </div>

              <button
                onClick={handleFacultyLogout}
                className="flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs font-mono bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 transition-all cursor-pointer"
                title="Log out of Faculty Session"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Logout</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
