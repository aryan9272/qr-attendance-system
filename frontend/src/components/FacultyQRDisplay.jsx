import React, { useState, useEffect } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import * as XLSX from 'xlsx';
import {
  Clock,
  RotateCw,
  MapPin,
  Users,
  Radio,
  Maximize,
  Minimize,
  Globe,
  Plus,
  OctagonAlert,
  FileSpreadsheet,
  X,
  Phone,
  Play,
  Pause,
  Sparkles,
  Pencil,
  Trash2,
} from 'lucide-react';
import { useSocket } from '../context/SocketContext';

const DEFAULT_INITIAL_EVENTS = [
  {
    eventId: 'CS101-LECTURE',
    title: 'CS101: Data Structures & Algorithms',
    status: 'paused',
    isEnded: true,
    customFields: { requireMobileNumber: false },
  },
];

export default function FacultyQRDisplay() {
  const socketContext = useSocket() || {};
  const {
    qrData = null,
    countdown = 60,
    forceRotateQR = () => {},
    joinEvent = () => {},
    backendUrl = 'http://10.70.41.236:5000',
    socket = null,
  } = socketContext;

  const [selectedEventId, setSelectedEventId] = useState('CS101-LECTURE');
  const [eventsList, setEventsList] = useState(DEFAULT_INITIAL_EVENTS);
  const [stats, setStats] = useState({ count: 0, recent: [] });

  // Immersive Projector Overlay State
  const [isProjectorOverlayOpen, setIsProjectorOverlayOpen] = useState(false);

  // Create Session Modal State
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [newEventId, setNewEventId] = useState('');
  const [newEventTitle, setNewEventTitle] = useState('');
  const [newEventFaculty, setNewEventFaculty] = useState('Prof. Alan Turing');
  const [requireMobile, setRequireMobile] = useState(false);

  // Edit Session Modal State
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingEventId, setEditingEventId] = useState('');
  const [editTitle, setEditTitle] = useState('');
  const [editFacultyName, setEditFacultyName] = useState('');
  const [editRequireMobile, setEditRequireMobile] = useState(false);

  const getAuthHeaders = () => {
    const token = localStorage.getItem('faculty_token') || 'mock-faculty-jwt-token';
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      'x-faculty-token': token,
    };
  };

  useEffect(() => {
    const handleFullscreenChange = () => {
      if (!document.fullscreenElement) {
        // State sync
      }
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, []);

  const openProjectorMode = () => {
    setIsProjectorOverlayOpen(true);
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    }
  };

  const closeProjectorMode = () => {
    setIsProjectorOverlayOpen(false);
    if (document.exitFullscreen && document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    }
  };

  useEffect(() => {
    fetchEvents();
    fetchStats(selectedEventId);

    const interval = setInterval(() => {
      fetchStats(selectedEventId);
    }, 3000);

    return () => clearInterval(interval);
  }, [selectedEventId, backendUrl]);

  const fetchEvents = async () => {
    try {
      const targetUrl = backendUrl ? `${backendUrl}/api/attendance/events` : '/api/attendance/events';
      const res = await fetch(targetUrl);
      const data = await res.json();
      if (data?.success && Array.isArray(data?.events) && data.events.length > 0) {
        setEventsList(data.events);
      }
    } catch (err) {
      console.warn('Could not fetch events:', err);
    }
  };

  const fetchStats = async (eventId) => {
    try {
      const targetUrl = backendUrl ? `${backendUrl}/api/attendance/stats/${eventId}` : `/api/attendance/stats/${eventId}`;
      const res = await fetch(targetUrl, {
        headers: getAuthHeaders(),
      });
      const data = await res.json();
      if (data?.success && data?.stats) {
        setStats({
          count: data.stats.count || 0,
          recent: Array.isArray(data.stats.recent) ? data.stats.recent : [],
        });
      }
    } catch (err) {
      console.warn('Could not fetch stats:', err);
    }
  };

  const handleEventChange = (e) => {
    const newId = e.target.value;
    setSelectedEventId(newId);
    if (typeof joinEvent === 'function') joinEvent(newId);
    fetchStats(newId);
  };

  // Requirement 2 & 3: Optimistic Start Session (<10ms UI latency)
  const handleStartSession = async () => {
    setEventsList(prev =>
      (prev || []).map(ev => (ev?.eventId === selectedEventId ? { ...ev, status: 'active', isEnded: false } : ev))
    );

    if (socket) {
      socket.emit('start-session', { eventId: selectedEventId });
    }

    try {
      const targetUrl = backendUrl ? `${backendUrl}/api/attendance/events/start` : '/api/attendance/events/start';
      fetch(targetUrl, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ eventId: selectedEventId }),
      }).catch(err => console.warn('Background start request error:', err));
    } catch (err) {
      console.warn('Background start error:', err);
    }
  };

  // Requirement 2 & 3: Optimistic End / Pause Session (<10ms UI latency)
  const handleEndSession = async () => {
    if (!window.confirm(`Are you sure you want to pause session "${selectedEventId}"? Submissions will be blocked.`)) {
      return;
    }

    setEventsList(prev =>
      (prev || []).map(ev => (ev?.eventId === selectedEventId ? { ...ev, status: 'paused', isEnded: true } : ev))
    );

    if (socket) {
      socket.emit('end-session', { eventId: selectedEventId });
    }

    try {
      const targetUrl = backendUrl ? `${backendUrl}/api/attendance/events/end` : '/api/attendance/events/end';
      fetch(targetUrl, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ eventId: selectedEventId }),
      }).catch(err => console.warn('Background end request error:', err));
    } catch (err) {
      console.warn('Background end error:', err);
    }
  };

  // Requirement 2: Optimistic Create Session (<10ms UI latency)
  const handleCreateSession = async (e) => {
    e.preventDefault();
    if (!newEventId.trim() || !newEventTitle.trim()) {
      alert('Session ID and Title are required!');
      return;
    }

    const targetId = newEventId.trim().toUpperCase();
    const newSessionObject = {
      eventId: targetId,
      title: newEventTitle.trim(),
      facultyName: newEventFaculty.trim(),
      status: 'paused',
      isEnded: true,
      customFields: {
        requireMobileNumber: requireMobile,
      },
    };

    setEventsList(prev => [newSessionObject, ...(prev || [])]);
    setSelectedEventId(targetId);
    if (typeof joinEvent === 'function') joinEvent(targetId);
    setIsCreateModalOpen(false);

    setNewEventId('');
    setNewEventTitle('');
    setRequireMobile(false);

    try {
      const targetUrl = backendUrl ? `${backendUrl}/api/attendance/events/create` : '/api/attendance/events/create';
      fetch(targetUrl, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(newSessionObject),
      }).catch(err => console.warn('Background create request error:', err));
    } catch (err) {
      console.warn('Background create error:', err);
    }
  };

  // Open Edit Session Modal
  const openEditModal = (ev) => {
    const targetEvent = ev || (eventsList || []).find(e => e?.eventId === selectedEventId);
    if (!targetEvent) return;

    setEditingEventId(targetEvent.eventId);
    setEditTitle(targetEvent.title || '');
    setEditFacultyName(targetEvent.facultyName || 'Prof. Alan Turing');
    setEditRequireMobile(Boolean(targetEvent.customFields?.requireMobileNumber));
    setIsEditModalOpen(true);
  };

  // Requirement 2: Optimistic Update Session (<10ms UI latency)
  const handleUpdateSession = async (e) => {
    e.preventDefault();
    if (!editTitle.trim()) {
      alert('Session Title is required!');
      return;
    }

    const updatedTitle = editTitle.trim();
    const updatedFaculty = editFacultyName.trim();

    setEventsList(prev =>
      (prev || []).map(ev =>
        ev?.eventId === editingEventId
          ? {
              ...ev,
              title: updatedTitle,
              facultyName: updatedFaculty,
              customFields: { requireMobileNumber: editRequireMobile },
            }
          : ev
      )
    );

    setIsEditModalOpen(false);

    try {
      const targetUrl = backendUrl ? `${backendUrl}/api/attendance/events/${editingEventId}` : `/api/attendance/events/${editingEventId}`;
      fetch(targetUrl, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          title: updatedTitle,
          facultyName: updatedFaculty,
          customFields: { requireMobileNumber: editRequireMobile },
        }),
      }).catch(err => console.warn('Background update request error:', err));
    } catch (err) {
      console.warn('Background update error:', err);
    }
  };

  // Requirement 2: Optimistic Delete Session (<50ms UI latency)
  const handleDeleteSession = async (eventIdToDelete) => {
    const targetId = eventIdToDelete || selectedEventId;
    if (!window.confirm(`Are you sure you want to permanently delete session "${targetId}"?`)) {
      return;
    }

    const remaining = (eventsList || []).filter(e => e?.eventId !== targetId);
    setEventsList(remaining);

    if (selectedEventId === targetId && remaining.length > 0) {
      setSelectedEventId(remaining[0].eventId);
      if (typeof joinEvent === 'function') joinEvent(remaining[0].eventId);
    }

    try {
      const targetUrl = backendUrl ? `${backendUrl}/api/attendance/events/${targetId}` : `/api/attendance/events/${targetId}`;
      fetch(targetUrl, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      }).catch(err => console.warn('Background delete request error:', err));
    } catch (err) {
      console.warn('Background delete error:', err);
    }
  };

  const exportToExcel = () => {
    const safeRecent = stats?.recent || [];
    if (safeRecent.length === 0) {
      alert('No attendance data available to export for this session.');
      return;
    }

    const excelRows = safeRecent.map((rec, idx) => ({
      'S.No': idx + 1,
      'Student Name': rec?.userName || 'N/A',
      'Email ID': rec?.email || 'N/A',
      'Registration No': rec?.regNo || rec?.user || 'N/A',
      'Academic Year': rec?.year || 'N/A',
      'Branch': rec?.branch || 'N/A',
      'Mobile Number': rec?.mobileNumber || 'N/A',
      'Distance (Meters)': rec?.distanceFromTargetMeters || 0,
      'Status': rec?.status || 'VERIFIED',
      'Timestamp': rec?.timestamp ? new Date(rec.timestamp).toLocaleString() : new Date().toLocaleString(),
    }));

    const worksheet = XLSX.utils.json_to_sheet(excelRows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Attendance Roster');

    const max_width = excelRows.reduce((w, r) => Math.max(w, String(r['Student Name']).length), 10);
    worksheet['!cols'] = [
      { wch: 6 },
      { wch: max_width + 5 },
      { wch: 28 },
      { wch: 18 },
      { wch: 12 },
      { wch: 25 },
      { wch: 16 },
      { wch: 18 },
      { wch: 12 },
      { wch: 22 },
    ];

    const filename = `ProxyQr_Attendance_${selectedEventId}_${new Date().toISOString().split('T')[0]}.xlsx`;
    XLSX.writeFile(workbook, filename);
  };

  // Requirement 2: Strict Defensive Checks with Fallbacks & Dynamic Vercel Deployment Base URL
  const currentEvent = (eventsList || []).find(ev => ev?.eventId === selectedEventId) || {
    title: 'CS101: Data Structures & Algorithms',
    eventId: selectedEventId,
    status: 'paused',
  };

  const localEventStatus = currentEvent?.status || 'paused';
  const isSessionActive = (localEventStatus === 'active') || (qrData?.status === 'active' && !qrData?.isEnded);

  const getAppBaseUrl = () => {
    if (import.meta.env.VITE_APP_URL) {
      return import.meta.env.VITE_APP_URL.replace(/\/$/, '');
    }
    if (typeof window !== 'undefined' && window.location?.origin) {
      return window.location.origin;
    }
    return '';
  };

  const getDynamicQrCodeValue = () => {
    if (!isSessionActive) return 'SESSION_PAUSED';

    const baseUrl = getAppBaseUrl();

    if (qrData?.token) {
      return `${baseUrl}/scan?token=${encodeURIComponent(qrData.token)}`;
    }

    if (qrData?.qrUrl) {
      try {
        const urlObj = new URL(qrData.qrUrl);
        return `${baseUrl}${urlObj.pathname}${urlObj.search}`;
      } catch (e) {
        return qrData.qrUrl;
      }
    }

    return 'SESSION_PAUSED';
  };

  const qrCodeValue = getDynamicQrCodeValue();

  const safeCountdown = typeof countdown === 'number' ? countdown : 60;
  const progressPercent = isSessionActive ? Math.max(0, Math.min(100, (safeCountdown / 60) * 100)) : 0;

  const getProgressColor = () => {
    if (safeCountdown > 30) return 'from-cyan-500 to-blue-500';
    if (safeCountdown > 10) return 'from-amber-500 to-orange-500';
    return 'from-rose-500 to-red-600';
  };

  return (
    <div className="max-w-7xl mx-auto px-4 lg:px-8 py-4 space-y-6">
      {/* IMMERSIVE FULL-WINDOW PROJECTOR OVERLAY */}
      {isProjectorOverlayOpen && (
        <div className="fixed inset-0 z-[99999] bg-slate-950 flex flex-col justify-between p-6 md:p-10 select-none overflow-hidden animate-fadeIn">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[700px] bg-cyan-500/10 rounded-full blur-[140px] pointer-events-none"></div>

          <div className="relative z-10 w-full flex flex-col sm:flex-row items-center justify-between gap-4 border-b border-slate-800/80 pb-4">
            <div className="flex items-center space-x-3">
              <div className="p-3 rounded-2xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
                <Radio className="w-6 h-6 animate-pulse" />
              </div>
              <div>
                <h1 className="font-display text-xl sm:text-2xl font-bold text-white tracking-tight">
                  {currentEvent?.title || 'CS101: Data Structures & Algorithms'}
                </h1>
                <p className="text-xs font-mono text-cyan-400 flex items-center gap-2">
                  <span>SESSION: {selectedEventId}</span>
                  <span>•</span>
                  <span className="text-emerald-400 font-bold">PROXYQR PROJECTOR MODE</span>
                </p>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 px-4 py-2 rounded-2xl bg-slate-900 border border-slate-800 text-sm font-mono text-slate-300">
                <Users className="w-4 h-4 text-cyan-400" />
                <span>Verified:</span>
                <span className="font-bold text-cyan-300 text-base">{stats?.count ?? 0}</span>
              </div>

              <button
                onClick={closeProjectorMode}
                className="flex items-center gap-2 px-5 py-2.5 rounded-2xl text-xs font-bold bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/50 shadow-[0_0_20px_rgba(244,63,94,0.3)] transition-all active:scale-95 cursor-pointer"
              >
                <Minimize className="w-4 h-4" />
                <span>Exit Projector Mode</span>
              </button>
            </div>
          </div>

          <div className="relative z-10 my-auto flex flex-col items-center justify-center">
            <div className="relative p-8 sm:p-12 bg-slate-900/90 rounded-3xl border-4 border-cyan-500/50 shadow-[0_0_80px_rgba(6,182,212,0.35)] flex flex-col items-center justify-center transition-transform hover:scale-[1.01]">
              <div className="scanline"></div>

              {!isSessionActive ? (
                <div className="w-[300px] h-[300px] sm:w-[380px] sm:h-[380px] bg-slate-950 rounded-3xl flex flex-col items-center justify-center p-6 text-center space-y-4 border border-amber-500/40">
                  <Pause className="w-16 h-16 text-amber-400 animate-pulse" />
                  <h3 className="text-xl font-bold text-amber-300 font-display">SESSION PAUSED</h3>
                  <p className="text-xs text-slate-400 font-mono">Click "Start Session" in control panel to activate rotation loop.</p>
                </div>
              ) : (
                <div className="bg-white p-6 rounded-3xl shadow-2xl border-4 border-white">
                  <QRCodeSVG
                    value={qrCodeValue}
                    size={window.innerWidth < 640 ? 280 : 380}
                    level="H"
                    includeMargin={true}
                  />
                </div>
              )}

              <div className="mt-4 text-cyan-400 font-mono font-extrabold text-sm sm:text-base tracking-wider flex items-center justify-center gap-1.5">
                <span>ProxyQR-By Aryan</span>
              </div>

              <div className="mt-4 flex items-center gap-2 text-sm font-mono text-cyan-300 bg-slate-950/80 px-5 py-2 rounded-full border border-cyan-500/30">
                <Sparkles className="w-4 h-4 text-cyan-400" />
                <span>ProxyQr: Scan with Google Lens or Phone Camera to Open Web Portal</span>
              </div>
            </div>
          </div>

          <div className="relative z-10 w-full max-w-4xl mx-auto space-y-3 pt-4 border-t border-slate-800/80">
            <div className="flex items-center justify-between font-mono">
              <span className="text-slate-400 text-sm flex items-center gap-2">
                <Clock className="w-4 h-4 text-cyan-400" /> Auto-Rotating Token Countdown
              </span>
              <span
                className={`font-bold text-xl sm:text-2xl ${
                  safeCountdown <= 10 && isSessionActive ? 'text-rose-400 animate-pulse' : 'text-cyan-400'
                }`}
              >
                {!isSessionActive ? 'PAUSED' : `${safeCountdown}s`}
              </span>
            </div>

            <div className="w-full h-4 bg-slate-900 rounded-full overflow-hidden p-0.5 border border-slate-800">
              <div
                className={`h-full rounded-full bg-gradient-to-r ${getProgressColor()} progress-bar-fill shadow-[0_0_20px_rgba(6,182,212,0.9)]`}
                style={{ width: `${progressPercent}%` }}
              ></div>
            </div>
          </div>
        </div>
      )}

      {/* CREATE NEW SESSION MODAL */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-[99990] bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 animate-fadeIn">
          <div className="glass-panel p-6 sm:p-8 rounded-3xl max-w-lg w-full space-y-6 relative border-cyan-500/40 shadow-[0_0_50px_rgba(6,182,212,0.2)]">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div className="flex items-center space-x-3">
                <div className="p-2.5 rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/30">
                  <Plus className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-display text-lg font-bold text-white">Create New ProxyQr Session</h3>
                  <p className="text-xs text-slate-400">Configure attendance parameters and custom fields</p>
                </div>
              </div>

              <button
                onClick={() => setIsCreateModalOpen(false)}
                className="p-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateSession} className="space-y-4 text-xs font-mono">
              <div className="space-y-1.5">
                <label className="text-slate-300 font-semibold block">Session Event ID (e.g. CS202-LAB)</label>
                <input
                  type="text"
                  value={newEventId}
                  onChange={(e) => setNewEventId(e.target.value)}
                  placeholder="CS202-LAB"
                  required
                  className="w-full px-4 py-2.5 rounded-xl glass-input text-cyan-300 font-mono"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-slate-300 font-semibold block">Session Title</label>
                <input
                  type="text"
                  value={newEventTitle}
                  onChange={(e) => setNewEventTitle(e.target.value)}
                  placeholder="CS202: Advanced Operating Systems Lab"
                  required
                  className="w-full px-4 py-2.5 rounded-xl glass-input text-slate-200 font-sans"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-slate-300 font-semibold block">Faculty Instructor Name</label>
                <input
                  type="text"
                  value={newEventFaculty}
                  onChange={(e) => setNewEventFaculty(e.target.value)}
                  placeholder="Prof. Alan Turing"
                  className="w-full px-4 py-2.5 rounded-xl glass-input text-slate-200 font-sans"
                />
              </div>

              <div className="pt-2 border-t border-slate-800 space-y-3">
                <div className="text-slate-300 font-semibold flex items-center justify-between">
                  <span>Custom Student Intake Fields</span>
                  <span className="text-[10px] text-cyan-400 font-mono">OPTIONAL TOGGLES</span>
                </div>

                <label className="flex items-center justify-between p-3 rounded-xl bg-slate-900/80 border border-slate-800 cursor-pointer hover:border-cyan-500/40 transition-colors">
                  <div className="flex items-center gap-2.5 text-slate-200">
                    <Phone className="w-4 h-4 text-cyan-400" />
                    <span>Require Mobile Phone Number</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={requireMobile}
                    onChange={(e) => setRequireMobile(e.target.checked)}
                    className="w-4 h-4 rounded text-cyan-500 focus:ring-cyan-500 bg-slate-950 border-slate-700"
                  />
                </label>
              </div>

              <div className="pt-4 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-900 text-slate-300 hover:bg-slate-800 transition-colors"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-bold font-display shadow-[0_0_20px_rgba(6,182,212,0.4)] hover:shadow-[0_0_30px_rgba(6,182,212,0.6)] transition-all"
                >
                  Initialize Session
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EDIT EXISTING SESSION MODAL */}
      {isEditModalOpen && (
        <div className="fixed inset-0 z-[99990] bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 animate-fadeIn">
          <div className="glass-panel p-6 sm:p-8 rounded-3xl max-w-lg w-full space-y-6 relative border-indigo-500/40 shadow-[0_0_50px_rgba(99,102,241,0.2)]">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div className="flex items-center space-x-3">
                <div className="p-2.5 rounded-xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/30">
                  <Pencil className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-display text-lg font-bold text-white">Edit Session: {editingEventId}</h3>
                  <p className="text-xs text-slate-400">Update session configuration and custom field toggles</p>
                </div>
              </div>

              <button
                onClick={() => setIsEditModalOpen(false)}
                className="p-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleUpdateSession} className="space-y-4 text-xs font-mono">
              <div className="space-y-1.5">
                <label className="text-slate-300 font-semibold block">Session Title</label>
                <input
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  placeholder="e.g. CS101: Data Structures & Algorithms"
                  required
                  className="w-full px-4 py-2.5 rounded-xl glass-input text-slate-200 font-sans"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-slate-300 font-semibold block">Faculty Instructor Name</label>
                <input
                  type="text"
                  value={editFacultyName}
                  onChange={(e) => setEditFacultyName(e.target.value)}
                  placeholder="Prof. Alan Turing"
                  className="w-full px-4 py-2.5 rounded-xl glass-input text-slate-200 font-sans"
                />
              </div>

              <div className="pt-2 border-t border-slate-800 space-y-3">
                <div className="text-slate-300 font-semibold flex items-center justify-between">
                  <span>Custom Student Intake Fields</span>
                  <span className="text-[10px] text-cyan-400 font-mono">OPTIONAL TOGGLES</span>
                </div>

                <label className="flex items-center justify-between p-3 rounded-xl bg-slate-900/80 border border-slate-800 cursor-pointer hover:border-indigo-500/40 transition-colors">
                  <div className="flex items-center gap-2.5 text-slate-200">
                    <Phone className="w-4 h-4 text-indigo-400" />
                    <span>Require Mobile Phone Number</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={editRequireMobile}
                    onChange={(e) => setEditRequireMobile(e.target.checked)}
                    className="w-4 h-4 rounded text-indigo-500 focus:ring-indigo-500 bg-slate-950 border-slate-700"
                  />
                </label>
              </div>

              <div className="pt-4 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsEditModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-900 text-slate-300 hover:bg-slate-800 transition-colors"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-indigo-500 to-cyan-600 text-white font-bold font-display shadow-[0_0_20px_rgba(99,102,241,0.4)] hover:shadow-[0_0_30px_rgba(99,102,241,0.6)] transition-all"
                >
                  Save Session Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DASHBOARD HEADER CONTROL PANEL */}
      <div className="glass-panel p-5 rounded-2xl flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center space-x-3 w-full md:w-auto">
          <div className="p-3 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
            <Radio className="w-6 h-6 animate-pulse" />
          </div>
          <div>
            <h2 className="font-display text-lg font-bold text-white">ProxyQr Active Session Control</h2>
            <p className="text-xs text-slate-400 font-mono">
              Dynamic External QR Pipeline
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          <button
            onClick={() => setIsCreateModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 transition-all shadow-[0_0_15px_rgba(6,182,212,0.2)] active:scale-95 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Create Session</span>
          </button>

          {/* Session Selector with Safe Fallback Mapping */}
          <div className="flex items-center gap-2 bg-slate-900/90 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-slate-300">
            <Users className="w-4 h-4 text-cyan-400" />
            <select
              value={selectedEventId}
              onChange={handleEventChange}
              className="bg-slate-800 text-cyan-300 font-semibold rounded-md px-2 py-1 border border-slate-700 focus:outline-none focus:border-cyan-500"
            >
              {(eventsList || []).length > 0 ? (
                (eventsList || []).map((ev) => (
                  <option key={ev?.eventId || 'CS101'} value={ev?.eventId}>
                    {ev?.title || ev?.eventId} ({ev?.eventId}) {ev?.status === 'paused' || ev?.isEnded ? ' [PAUSED]' : ' [ACTIVE]'}
                  </option>
                ))
              ) : (
                <option value="CS101-LECTURE">CS101: Data Structures & Algorithms</option>
              )}
            </select>

            <div className="flex items-center gap-1 pl-1 border-l border-slate-800">
              <button
                type="button"
                onClick={() => openEditModal()}
                className="p-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-indigo-300 hover:text-indigo-200 transition-colors cursor-pointer"
                title={`Edit Session ${selectedEventId}`}
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => handleDeleteSession(selectedEventId)}
                className="p-1 rounded-lg bg-slate-800 hover:bg-rose-900/40 text-rose-400 hover:text-rose-300 transition-colors cursor-pointer"
                title={`Delete Session ${selectedEventId}`}
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Green "Start Session" Button */}
          <button
            onClick={handleStartSession}
            disabled={isSessionActive}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/50 shadow-[0_0_15px_rgba(16,185,129,0.3)] transition-all active:scale-95 disabled:opacity-40 cursor-pointer"
          >
            <Play className="w-4 h-4 fill-emerald-400 text-emerald-400" />
            <span>Start Session</span>
          </button>

          {/* Red "End Session" Button */}
          <button
            onClick={handleEndSession}
            disabled={!isSessionActive}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/50 shadow-[0_0_15px_rgba(244,63,94,0.3)] transition-all active:scale-95 disabled:opacity-40 cursor-pointer"
          >
            <OctagonAlert className="w-4 h-4" />
            <span>End Session</span>
          </button>
        </div>
      </div>

      {/* Main Grid: QR Display Card + Stats Dashboard */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Live QR Code Display */}
        <div className="lg:col-span-7 glass-panel-glow p-6 lg:p-8 rounded-3xl flex flex-col items-center justify-between text-center relative overflow-hidden space-y-4">
          <div className="absolute -top-24 -left-24 w-60 h-60 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none"></div>
          <div className="absolute -bottom-24 -right-24 w-60 h-60 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none"></div>

          <div className="w-full flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <span className={`inline-block w-2.5 h-2.5 rounded-full ${!isSessionActive ? 'bg-amber-400' : 'bg-emerald-400 animate-ping'}`}></span>
              <span className="text-xs font-mono font-bold tracking-wider text-cyan-400 uppercase">
                {!isSessionActive ? 'Session Paused / Stopped' : 'ProxyQr Active Rotation Loop'}
              </span>
            </div>

            {/* Requirement 4: Repositioned Refresh QR Button in Status Slot */}
            <button
              onClick={() => typeof forceRotateQR === 'function' && forceRotateQR(selectedEventId)}
              disabled={!isSessionActive}
              className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 text-xs font-mono font-bold transition-all shadow-[0_0_15px_rgba(6,182,212,0.2)] active:scale-95 disabled:opacity-40 cursor-pointer"
              title="Force Immediate QR Token Rotation"
            >
              <RotateCw className="w-3.5 h-3.5 text-cyan-400" />
              <span>Refresh QR</span>
            </button>
          </div>

          <div className="relative w-full max-w-sm p-6 bg-slate-950/90 rounded-3xl border-2 border-cyan-500/40 shadow-[0_0_40px_rgba(6,182,212,0.25)] flex flex-col items-center justify-center transition-transform hover:scale-[1.01]">
            <div className="scanline"></div>

            {!isSessionActive ? (
              <div className="w-[260px] h-[260px] bg-slate-900 rounded-2xl flex flex-col items-center justify-center p-6 text-center space-y-3 border border-amber-500/30">
                <Pause className="w-12 h-12 text-amber-400 animate-pulse" />
                <h4 className="font-bold text-amber-300 font-display">SESSION PAUSED</h4>
                <p className="text-[11px] text-slate-400 font-mono">Click "Start Session" above to activate 60s rotation loop.</p>
              </div>
            ) : (
              <div className="bg-white p-4 rounded-2xl shadow-inner border border-white">
                <QRCodeSVG
                  value={qrCodeValue}
                  size={260}
                  level="H"
                  includeMargin={true}
                />
              </div>
            )}

            <div className="mt-3 text-cyan-400 font-mono font-bold text-xs tracking-wider flex items-center justify-center gap-1">
              <span>ProxyQR-By Aryan</span>
            </div>

            <div className="mt-3 flex items-center gap-2 text-xs font-mono text-slate-400">
              <Globe className="w-3.5 h-3.5 text-cyan-400" />
              <span>ProxyQr: Scan with Google Lens or Camera</span>
            </div>
          </div>

          <div className="w-full pt-2">
            <button
              onClick={openProjectorMode}
              disabled={!isSessionActive}
              className="w-full py-3 rounded-2xl text-xs font-bold bg-indigo-600/30 hover:bg-indigo-600/40 text-indigo-200 border border-indigo-500/50 shadow-[0_0_20px_rgba(99,102,241,0.3)] transition-all active:scale-[0.99] disabled:opacity-40 cursor-pointer flex items-center justify-center gap-2"
              title="Enter Fullscreen Projector Mode"
            >
              <Maximize className="w-4 h-4 text-indigo-400" />
              <span>Fullscreen Projector Mode</span>
            </button>
          </div>

          <div className="w-full space-y-2 my-2">
            <div className="flex items-center justify-between text-xs font-mono">
              <span className="text-slate-400 flex items-center gap-1">
                <Clock className="w-3.5 h-3.5 text-cyan-400" /> Time Remaining
              </span>
              <span
                className={`font-bold text-sm ${
                  safeCountdown <= 10 && isSessionActive ? 'text-rose-400 animate-pulse' : 'text-cyan-400'
                }`}
              >
                {!isSessionActive ? 'PAUSED' : `${safeCountdown}s`}
              </span>
            </div>

            <div className="w-full h-3 bg-slate-950 rounded-full overflow-hidden p-0.5 border border-slate-800">
              <div
                className={`h-full rounded-full bg-gradient-to-r ${getProgressColor()} progress-bar-fill shadow-[0_0_12px_rgba(6,182,212,0.8)]`}
                style={{ width: `${progressPercent}%` }}
              ></div>
            </div>
          </div>
        </div>

        {/* Right Column: Attendance Statistics & Excel Export */}
        <div className="lg:col-span-5 space-y-6">
          <div className="glass-panel p-5 rounded-2xl space-y-3 border-l-4 border-l-cyan-500">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-cyan-400 font-display font-semibold text-sm">
                <MapPin className="w-4 h-4" />
                <span>Geofence Parameters</span>
              </div>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-300 border border-cyan-500/20">
                ACTIVE
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-1 text-xs">
              <div className="bg-slate-900/60 p-2.5 rounded-xl border border-slate-800">
                <div className="text-slate-400 font-mono text-[10px]">Target Latitude</div>
                <div className="font-mono text-slate-200 font-semibold">
                  {qrData?.latitude || 28.6139}° N
                </div>
              </div>
              <div className="bg-slate-900/60 p-2.5 rounded-xl border border-slate-800">
                <div className="text-slate-400 font-mono text-[10px]">Target Longitude</div>
                <div className="font-mono text-slate-200 font-semibold">
                  {qrData?.longitude || 77.2090}° E
                </div>
              </div>
            </div>
          </div>

          <div className="glass-panel p-5 rounded-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
              <div>
                <div className="flex items-center gap-2 text-white font-display font-bold text-base">
                  <Users className="w-5 h-5 text-cyan-400" />
                  <span>Verified Attendees Roster</span>
                </div>
                <p className="text-[11px] text-slate-400 font-mono">Consolidated Session: {selectedEventId}</p>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xl font-mono font-extrabold text-cyan-400 bg-slate-900 px-3 py-1 rounded-xl border border-slate-800">
                  {stats?.count ?? 0}
                </span>

                <button
                  onClick={exportToExcel}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 shadow-[0_0_15px_rgba(16,185,129,0.25)] transition-all active:scale-95 cursor-pointer"
                  title="Export Consolidated Session Attendance Roster to Excel (.xlsx)"
                >
                  <FileSpreadsheet className="w-4 h-4" />
                  <span>Export Excel</span>
                </button>
              </div>
            </div>

            <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
              {Array.isArray(stats?.recent) && (stats?.recent || []).length > 0 ? (
                (stats?.recent || []).map((rec, idx) => (
                  <div
                    key={rec?._id || idx}
                    className="p-3 rounded-xl bg-slate-900/80 border border-slate-800 text-xs hover:border-cyan-500/30 transition-colors space-y-1.5"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-lg bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center font-mono font-bold text-cyan-300">
                          {rec?.userName ? rec.userName.charAt(0) : 'S'}
                        </div>
                        <div>
                          <div className="font-semibold text-slate-200">{rec?.userName || 'Student'}</div>
                          <div className="text-[10px] font-mono text-slate-400">{rec?.email || ''}</div>
                        </div>
                      </div>

                      <div className="text-right">
                        <span className="px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                          VERIFIED
                        </span>
                        <div className="text-[9px] font-mono text-slate-400 mt-0.5">
                          {rec?.timestamp ? new Date(rec.timestamp).toLocaleTimeString() : ''}
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-[10px] font-mono pt-1 border-t border-slate-800/60 text-slate-400">
                      <div>Reg: <span className="text-slate-200 font-semibold">{rec?.regNo || rec?.user || 'N/A'}</span></div>
                      <div>Year: <span className="text-slate-200 font-semibold">{rec?.year || 'N/A'}</span></div>
                      <div>Branch: <span className="text-slate-200 font-semibold">{rec?.branch || 'N/A'}</span></div>
                      {rec?.mobileNumber && (
                        <div className="text-amber-300">Mobile: <span className="font-semibold">{rec.mobileNumber}</span></div>
                      )}
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-8 text-xs text-slate-500 font-mono border border-dashed border-slate-800 rounded-xl space-y-2">
                  <FileSpreadsheet className="w-8 h-8 text-slate-600 mx-auto" />
                  <p>No student attendance recorded yet for session "{selectedEventId}".</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Footer Signature */}
      <footer className="pt-8 pb-2 text-center text-xs font-mono text-slate-400 tracking-wider">
        <span>By Aryan Kale</span>
      </footer>
    </div>
  );
}
