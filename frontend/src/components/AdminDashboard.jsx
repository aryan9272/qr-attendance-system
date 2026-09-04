import React, { useState, useEffect } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import * as XLSX from 'xlsx';
import {
  ShieldCheck,
  Radio,
  Clock,
  Play,
  Pause,
  RotateCw,
  Maximize,
  Minimize,
  Download,
  Users,
  Search,
  Filter,
  Plus,
  Pencil,
  X,
  MapPin,
  Sparkles,
  AlertTriangle,
  CheckCircle2,
  FileSpreadsheet,
  Layers,
  History,
  Phone,
  User,
  Hash,
  Mail,
  GraduationCap,
  BookOpen,
} from 'lucide-react';
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

const OVERRIDE_REASONS = [
  'Battery Dead',
  'Camera Broken',
  'Severe GPS Drift',
  'No Mobile Data',
  'Wi-Fi Disconnected',
  'Other Administrative Reason',
];

export default function AdminDashboard() {
  const {
    connected,
    qrData,
    countdown,
    currentSessionId,
    backendUrl,
    joinSession,
    forceRotateQR,
    updateGeofenceRadius,
  } = useSocket();

  // Active Top Navigation Tab: 'active' | 'roster' | 'history'
  const [activeTab, setActiveTab] = useState('active');

  // Sessions & Attendees Roster State
  const [sessionsList, setSessionsList] = useState([]);
  const [selectedSessionId, setSelectedSessionId] = useState(currentSessionId || 'LAB101-X7K9');
  const [attendeesRoster, setAttendeesRoster] = useState([]);
  const [totalCount, setTotalCount] = useState(0);

  // Geofence Radius Slider (30m, 60m, 120m)
  const [geofenceRadius, setGeofenceRadius] = useState(50);

  // Fullscreen Projector Overlay Mode State
  const [isProjectorMode, setIsProjectorMode] = useState(false);

  // Roster Fuzzy Search & Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('ALL');
  const [yearFilter, setYearFilter] = useState('ALL');
  const [verificationFilter, setVerificationFilter] = useState('ALL');

  // Modals Control
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isTerminateModalOpen, setIsTerminateModalOpen] = useState(false);
  const [isManualModalOpen, setIsManualModalOpen] = useState(false);
  const [editingAttendee, setEditingAttendee] = useState(null);

  // Create Session Form State
  const [newLabIdentifier, setNewLabIdentifier] = useState('Lab 101');
  const [newTitle, setNewTitle] = useState('CS202: Advanced Operating Systems Lab');
  const [newProctorName, setNewProctorName] = useState('Prof. Alan Turing');
  const [requireMobile, setRequireMobile] = useState(false);

  // Emergency Manual Intake Form State
  const [manualName, setManualName] = useState('');
  const [manualRegNo, setManualRegNo] = useState('');
  const [manualEmail, setManualEmail] = useState('');
  const [manualYear, setManualYear] = useState(YEARS[0]);
  const [manualBranch, setManualBranch] = useState(DEPARTMENTS[0]);
  const [manualPhone, setManualPhone] = useState('');
  const [manualReason, setManualReason] = useState(OVERRIDE_REASONS[0]);

  // Edit Attendee Form State
  const [editName, setEditName] = useState('');
  const [editRegNo, setEditRegNo] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editYear, setEditYear] = useState('');
  const [editBranch, setEditBranch] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editReason, setEditReason] = useState('');

  // Fetch Sessions and Roster Stats
  const fetchSessions = async () => {
    try {
      const token = localStorage.getItem('admin_token');
      const res = await fetch(`${backendUrl}/api/attendance/events`, {
        headers: { Authorization: `Bearer ${token}`, 'x-admin-token': token },
      });
      const data = await res.json();
      if (data?.success && Array.isArray(data.events)) {
        setSessionsList(data.events);
      }
    } catch (e) {
      console.warn('[AdminDashboard] Fetch sessions error:', e);
    }
  };

  const fetchRoster = async (sessionId) => {
    try {
      const sid = (sessionId || selectedSessionId).toUpperCase();
      const token = localStorage.getItem('admin_token');
      const res = await fetch(`${backendUrl}/api/attendance/stats/${sid}`, {
        headers: { Authorization: `Bearer ${token}`, 'x-admin-token': token },
      });
      const data = await res.json();
      if (data?.success && data?.stats) {
        setAttendeesRoster(data.stats.recent || []);
        setTotalCount(data.stats.count || 0);
      }
    } catch (e) {
      console.warn('[AdminDashboard] Fetch roster error:', e);
    }
  };

  useEffect(() => {
    fetchSessions();
    fetchRoster(selectedSessionId);
  }, [selectedSessionId, backendUrl]);

  // Sync Geofence radius slider with qrData
  useEffect(() => {
    if (qrData?.allowedRadiusMeters) {
      setGeofenceRadius(qrData.allowedRadiusMeters);
    }
  }, [qrData]);

  // Listen to Socket.IO real-time attendee additions and edits
  useEffect(() => {
    if (!useSocket().socket) return;
    const socket = useSocket().socket;

    const handleNewAttendee = (data) => {
      if (data.sessionId?.toUpperCase() === selectedSessionId.toUpperCase()) {
        setAttendeesRoster((prev) => [data.record, ...prev.filter((r) => r._id !== data.record._id)]);
        setTotalCount((prev) => prev + 1);
      }
    };

    const handleAttendeeUpdated = (data) => {
      if (data.sessionId?.toUpperCase() === selectedSessionId.toUpperCase()) {
        setAttendeesRoster((prev) =>
          prev.map((item) => (item._id === data.record._id ? data.record : item))
        );
      }
    };

    socket.on('new_attendee', handleNewAttendee);
    socket.on('attendee_updated', handleAttendeeUpdated);

    return () => {
      socket.off('new_attendee', handleNewAttendee);
      socket.off('attendee_updated', handleAttendeeUpdated);
    };
  }, [selectedSessionId, useSocket]);

  // Handle Session Switch
  const handleSelectSession = (sid) => {
    const cleanId = sid.toUpperCase();
    setSelectedSessionId(cleanId);
    joinSession(cleanId);
    fetchRoster(cleanId);
  };

  // Create Session Submit
  const handleCreateSession = async (e) => {
    e.preventDefault();
    try {
      const token = localStorage.getItem('admin_token');
      const res = await fetch(`${backendUrl}/api/admin/sessions/create`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          'x-admin-token': token,
        },
        body: JSON.stringify({
          labIdentifier: newLabIdentifier,
          title: newTitle,
          proctorName: newProctorName,
          customFields: { requireMobileNumber: requireMobile },
        }),
      });

      const data = await res.json();
      if (data?.success && data?.session) {
        setIsCreateModalOpen(false);
        fetchSessions();
        handleSelectSession(data.session.sessionId);
      } else {
        alert(data.message || 'Failed to create session.');
      }
    } catch (err) {
      alert('Error creating session: ' + err.message);
    }
  };

  // Start / Resume Session
  const handleStartSession = async () => {
    try {
      const token = localStorage.getItem('admin_token');
      await fetch(`${backendUrl}/api/admin/sessions/start`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          'x-admin-token': token,
        },
        body: JSON.stringify({ sessionId: selectedSessionId }),
      });
    } catch (e) {}
  };

  // Pause Session
  const handlePauseSession = async () => {
    try {
      const token = localStorage.getItem('admin_token');
      await fetch(`${backendUrl}/api/admin/sessions/pause`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          'x-admin-token': token,
        },
        body: JSON.stringify({ sessionId: selectedSessionId }),
      });
    } catch (e) {}
  };

  // Terminate Session (Double Check Permanently End)
  const handleTerminateSessionSubmit = async () => {
    try {
      const token = localStorage.getItem('admin_token');
      await fetch(`${backendUrl}/api/admin/sessions/terminate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          'x-admin-token': token,
        },
        body: JSON.stringify({ sessionId: selectedSessionId }),
      });
      setIsTerminateModalOpen(false);
      fetchSessions();
      setActiveTab('history');
    } catch (e) {
      alert('Error ending session: ' + e.message);
    }
  };

  // Manual Intake Submit
  const handleManualIntakeSubmit = async (e) => {
    e.preventDefault();
    try {
      const token = localStorage.getItem('admin_token');
      const res = await fetch(`${backendUrl}/api/admin/manual-intake`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          'x-admin-token': token,
        },
        body: JSON.stringify({
          sessionId: selectedSessionId,
          studentName: manualName,
          regNo: manualRegNo,
          email: manualEmail,
          year: manualYear,
          branch: manualBranch,
          mobileNumber: manualPhone,
          overrideReason: manualReason,
        }),
      });

      const data = await res.json();
      if (data?.success) {
        setIsManualModalOpen(false);
        setManualName('');
        setManualRegNo('');
        setManualEmail('');
        fetchRoster(selectedSessionId);
      } else {
        alert(data.message || 'Manual intake failed.');
      }
    } catch (err) {
      alert('Error during manual intake: ' + err.message);
    }
  };

  // Open Edit Attendee Modal
  const openEditModal = (attendee) => {
    setEditingAttendee(attendee);
    setEditName(attendee.studentName || '');
    setEditRegNo(attendee.regNo || '');
    setEditEmail(attendee.email || '');
    setEditYear(attendee.year || '');
    setEditBranch(attendee.branch || '');
    setEditPhone(attendee.mobileNumber || '');
    setEditReason('');
  };

  // Submit Edit Attendee
  const handleEditAttendeeSubmit = async (e) => {
    e.preventDefault();
    if (!editReason.trim()) {
      alert('Mandatory Edit Reason is required.');
      return;
    }

    try {
      const token = localStorage.getItem('admin_token');
      const res = await fetch(`${backendUrl}/api/admin/attendee/${editingAttendee._id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          'x-admin-token': token,
        },
        body: JSON.stringify({
          studentName: editName,
          regNo: editRegNo,
          email: editEmail,
          year: editYear,
          branch: editBranch,
          mobileNumber: editPhone,
          editReason: editReason,
        }),
      });

      const data = await res.json();
      if (data?.success) {
        setEditingAttendee(null);
        fetchRoster(selectedSessionId);
      } else {
        alert(data.message || 'Update failed.');
      }
    } catch (err) {
      alert('Error updating record: ' + err.message);
    }
  };

  // Export SheetJS Excel File with Audit Log
  const handleExportExcel = () => {
    if (attendeesRoster.length === 0) {
      alert('No verified attendees recorded for this session yet.');
      return;
    }

    const exportData = attendeesRoster.map((item, index) => ({
      'S.No': index + 1,
      'Session ID': item.sessionId,
      'Student Name': item.studentName,
      'Registration No / PRN': item.regNo,
      'Email Address': item.email,
      'Academic Year': item.year || 'N/A',
      'Branch / Major': item.branch || 'N/A',
      'Mobile Phone': item.mobileNumber || 'N/A',
      'Verification Mode': item.verificationMode,
      'Override Reason': item.overrideReason || 'N/A',
      'Distance (Meters)': item.distanceFromTargetMeters || 0,
      'Last Edited By': item.editedBy || 'N/A',
      'Timestamp': new Date(item.timestamp).toLocaleString(),
    }));

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, `Session_${selectedSessionId}`);

    const filename = `ProxyQr_Roster_${selectedSessionId}_${new Date().toISOString().slice(0, 10)}.xlsx`;
    XLSX.writeFile(workbook, filename);
  };

  // Dynamic QR URL Calculation for Vercel / Production
  const getAppBaseUrl = () => {
    if (import.meta.env.VITE_APP_URL) {
      return import.meta.env.VITE_APP_URL.replace(/\/$/, '');
    }
    if (typeof window !== 'undefined' && window.location?.origin) {
      return window.location.origin;
    }
    return '';
  };

  const isSessionActive = qrData?.status === 'ACTIVE';

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

  // Filter Roster
  const filteredRoster = attendeesRoster.filter((item) => {
    const q = searchQuery.toLowerCase().trim();
    const matchesQuery =
      !q ||
      item.studentName?.toLowerCase().includes(q) ||
      item.regNo?.toLowerCase().includes(q) ||
      item.email?.toLowerCase().includes(q);

    const matchesDept = departmentFilter === 'ALL' || item.branch === departmentFilter;
    const matchesYear = yearFilter === 'ALL' || item.year === yearFilter;
    const matchesVer = verificationFilter === 'ALL' || item.verificationMode === verificationFilter;

    return matchesQuery && matchesDept && matchesYear && matchesVer;
  });

  return (
    <div className="space-y-6 pt-4 pb-12 select-none">
      {/* Top 3-Tab Glassmorphism Navigation Bar */}
      <div className="glass-panel p-2 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-3 border border-slate-800">
        <div className="flex p-1 rounded-xl bg-slate-950/80 border border-slate-800 text-xs font-mono w-full sm:w-auto">
          <button
            onClick={() => setActiveTab('active')}
            className={`flex-1 sm:flex-initial px-5 py-2.5 rounded-lg font-bold transition-all cursor-pointer flex items-center justify-center gap-2 ${
              activeTab === 'active'
                ? 'bg-cyan-500 text-slate-950 shadow-[0_0_15px_rgba(6,182,212,0.4)]'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Radio className="w-4 h-4" />
            <span>[ Active Session ]</span>
          </button>

          <button
            onClick={() => setActiveTab('roster')}
            className={`flex-1 sm:flex-initial px-5 py-2.5 rounded-lg font-bold transition-all cursor-pointer flex items-center justify-center gap-2 ${
              activeTab === 'roster'
                ? 'bg-cyan-500 text-slate-950 shadow-[0_0_15px_rgba(6,182,212,0.4)]'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>[ Attendees Roster & Intake ]</span>
          </button>

          <button
            onClick={() => setActiveTab('history')}
            className={`flex-1 sm:flex-initial px-5 py-2.5 rounded-lg font-bold transition-all cursor-pointer flex items-center justify-center gap-2 ${
              activeTab === 'history'
                ? 'bg-cyan-500 text-slate-950 shadow-[0_0_15px_rgba(6,182,212,0.4)]'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <History className="w-4 h-4" />
            <span>[ Session History ]</span>
          </button>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
          <button
            onClick={() => setIsCreateModalOpen(true)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 text-xs font-mono font-bold transition-all cursor-pointer shadow-[0_0_15px_rgba(6,182,212,0.15)]"
          >
            <Plus className="w-4 h-4" />
            <span>New Session</span>
          </button>

          <button
            onClick={handleExportExcel}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-xs font-mono font-bold transition-all cursor-pointer shadow-[0_0_15px_rgba(16,185,129,0.15)]"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>Download Excel</span>
          </button>
        </div>
      </div>

      {/* TAB 1: ACTIVE SESSION VIEWPORT */}
      {activeTab === 'active' && (
        <div className="space-y-6 animate-fadeIn">
          {/* Active Session Info Header */}
          <div className="glass-panel p-5 rounded-3xl flex flex-col md:flex-row md:items-center justify-between gap-4 border-l-4 border-l-cyan-500">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-xs font-mono text-cyan-400">
                <span className="font-bold text-white uppercase">{selectedSessionId}</span>
                <span>•</span>
                <span>{qrData?.labIdentifier || 'Lab 101'}</span>
                <span>•</span>
                <span>{qrData?.proctorName || 'Admin In-Charge'}</span>
              </div>
              <h2 className="font-display font-extrabold text-xl sm:text-2xl text-white">
                {qrData?.title || 'CS202: Advanced Operating Systems Lab'}
              </h2>
            </div>

            {/* Session Lifecycle Buttons */}
            <div className="flex items-center gap-3">
              {!isSessionActive ? (
                <button
                  onClick={handleStartSession}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-display font-extrabold text-xs shadow-[0_0_25px_rgba(16,185,129,0.4)] transition-all cursor-pointer active:scale-95"
                >
                  <Play className="w-4 h-4 fill-slate-950" />
                  <span>Start Session</span>
                </button>
              ) : (
                <button
                  onClick={handlePauseSession}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-display font-extrabold text-xs shadow-[0_0_25px_rgba(245,158,11,0.4)] transition-all cursor-pointer active:scale-95"
                >
                  <Pause className="w-4 h-4 fill-slate-950" />
                  <span>Pause Session</span>
                </button>
              )}

              <button
                onClick={() => setIsTerminateModalOpen(true)}
                className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40 font-mono text-xs font-bold transition-all cursor-pointer"
              >
                <X className="w-4 h-4 text-rose-400" />
                <span>End Session</span>
              </button>
            </div>
          </div>

          {/* Main Grid: QR Viewport + Live Stats & Controls */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* QR Projector Viewport */}
            <div className="lg:col-span-7 glass-panel-glow p-6 lg:p-8 rounded-3xl flex flex-col items-center justify-between text-center relative overflow-hidden space-y-4">
              <div className="w-full flex items-center justify-between mb-2 font-mono text-xs">
                <div className="flex items-center gap-2">
                  <span className={`w-2.5 h-2.5 rounded-full ${!isSessionActive ? 'bg-amber-400' : 'bg-emerald-400 animate-ping'}`}></span>
                  <span className="font-bold tracking-wider text-cyan-400 uppercase">
                    {!isSessionActive ? 'Session Paused' : 'ProxyQr 60s Dynamic Rotation'}
                  </span>
                </div>

                <button
                  onClick={() => forceRotateQR(selectedSessionId)}
                  disabled={!isSessionActive}
                  className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 text-xs font-mono font-bold transition-all cursor-pointer disabled:opacity-40"
                  title="Force Immediate QR Token Rotation"
                >
                  <RotateCw className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Refresh QR</span>
                </button>
              </div>

              {/* QR Code Container */}
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
                  <span>ProxyQr Admin Sentinel</span>
                </div>
              </div>

              {/* Fullscreen Projector Mode Trigger */}
              <button
                onClick={() => setIsProjectorMode(true)}
                disabled={!isSessionActive}
                className="w-full py-3 rounded-2xl text-xs font-bold bg-indigo-600/30 hover:bg-indigo-600/40 text-indigo-200 border border-indigo-500/50 shadow-[0_0_20px_rgba(99,102,241,0.3)] transition-all cursor-pointer flex items-center justify-center gap-2 disabled:opacity-40"
              >
                <Maximize className="w-4 h-4 text-indigo-400" />
                <span>Fullscreen Projector Mode</span>
              </button>

              {/* Countdown Progress Ring */}
              <div className="w-full space-y-2 my-2">
                <div className="flex items-center justify-between text-xs font-mono">
                  <span className="text-slate-400 flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5 text-cyan-400" /> Time Remaining (20s Grace Period Enabled)
                  </span>
                  <span className={`font-bold text-sm ${safeCountdown <= 10 && isSessionActive ? 'text-rose-400 animate-pulse' : 'text-cyan-400'}`}>
                    {!isSessionActive ? 'PAUSED' : `${safeCountdown}s`}
                  </span>
                </div>

                <div className="w-full h-3 bg-slate-950 rounded-full overflow-hidden p-0.5 border border-slate-800">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-blue-600 shadow-[0_0_12px_rgba(6,182,212,0.8)] transition-all"
                    style={{ width: `${progressPercent}%` }}
                  ></div>
                </div>
              </div>
            </div>

            {/* Live Stats & Dynamic Geofence Controls */}
            <div className="lg:col-span-5 space-y-6">
              {/* Geofence Slider Card */}
              <div className="glass-panel p-5 rounded-3xl space-y-4 border-l-4 border-l-cyan-500">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-cyan-400 font-display font-semibold text-sm">
                    <MapPin className="w-4 h-4" />
                    <span>Dynamic Geofence Slider</span>
                  </div>
                  <span className="text-xs font-mono font-bold px-3 py-1 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                    {geofenceRadius}m RADIUS
                  </span>
                </div>

                <div className="space-y-3 font-mono text-xs">
                  <input
                    type="range"
                    min="30"
                    max="120"
                    step="10"
                    value={geofenceRadius}
                    onChange={(e) => {
                      const r = Number(e.target.value);
                      setGeofenceRadius(r);
                      updateGeofenceRadius(selectedSessionId, r);
                    }}
                    className="w-full h-2 bg-slate-900 rounded-lg appearance-none cursor-pointer accent-cyan-400"
                  />

                  <div className="flex justify-between text-[10px] text-slate-400 font-mono">
                    <span>30m (Lab)</span>
                    <span>60m (Lecture Hall)</span>
                    <span>120m (Auditorium)</span>
                  </div>
                </div>
              </div>

              {/* Attendance Roster Counter Card */}
              <div className="glass-panel p-6 rounded-3xl space-y-4 text-center border-t-4 border-t-emerald-500">
                <div className="p-3 rounded-2xl bg-emerald-500/10 text-emerald-400 inline-block">
                  <Users className="w-8 h-8" />
                </div>
                <div>
                  <div className="font-display font-black text-4xl text-white">{totalCount}</div>
                  <div className="text-xs font-mono text-slate-400 mt-1">Verified Real-Time Attendees</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: ATTENDEES ROSTER & INTAKE */}
      {activeTab === 'roster' && (
        <div className="space-y-6 animate-fadeIn">
          {/* Search Bar + Filters + Manual Intake Trigger */}
          <div className="glass-panel p-5 rounded-3xl space-y-4">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
              {/* Fuzzy Search Field */}
              <div className="relative w-full sm:w-80">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Fuzzy Search Name, PRN, Email..."
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl glass-input text-xs font-mono"
                />
              </div>

              {/* Action Button: Emergency Manual Intake */}
              <button
                onClick={() => setIsManualModalOpen(true)}
                className="w-full sm:w-auto flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 text-slate-950 font-display font-bold text-xs shadow-[0_0_20px_rgba(245,158,11,0.3)] transition-all cursor-pointer"
              >
                <Plus className="w-4 h-4 fill-slate-950" />
                <span>+ Add Student Manually</span>
              </button>
            </div>

            {/* Filter Bar */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-slate-800 text-xs font-mono">
              <div>
                <label className="text-slate-400 block mb-1">Department / Branch</label>
                <select
                  value={departmentFilter}
                  onChange={(e) => setDepartmentFilter(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl glass-input text-slate-200"
                >
                  <option value="ALL">All Departments</option>
                  {DEPARTMENTS.map((dept) => (
                    <option key={dept} value={dept}>
                      {dept}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-slate-400 block mb-1">Academic Year</label>
                <select
                  value={yearFilter}
                  onChange={(e) => setYearFilter(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl glass-input text-slate-200"
                >
                  <option value="ALL">All Academic Years</option>
                  {YEARS.map((yr) => (
                    <option key={yr} value={yr}>
                      {yr}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-slate-400 block mb-1">Verification Mode</label>
                <select
                  value={verificationFilter}
                  onChange={(e) => setVerificationFilter(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl glass-input text-slate-200"
                >
                  <option value="ALL">All Verification Modes</option>
                  <option value="GPS_VERIFIED">GPS Verified</option>
                  <option value="ADMIN_MANUAL_OVERRIDE">Admin Manual Pass</option>
                  <option value="SUSPICIOUS_PROXY">Suspicious Proxy</option>
                </select>
              </div>
            </div>
          </div>

          {/* Roster Table */}
          <div className="glass-panel rounded-3xl overflow-hidden border border-slate-800">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs font-mono">
                <thead>
                  <tr className="bg-slate-900/90 text-slate-400 border-b border-slate-800">
                    <th className="p-4">#</th>
                    <th className="p-4">Student Name</th>
                    <th className="p-4">PRN / Reg No</th>
                    <th className="p-4">Email</th>
                    <th className="p-4">Year & Branch</th>
                    <th className="p-4">Distance</th>
                    <th className="p-4">Verification</th>
                    <th className="p-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {filteredRoster.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="p-8 text-center text-slate-500 font-mono">
                        No attendee records matching active filters.
                      </td>
                    </tr>
                  ) : (
                    filteredRoster.map((item, idx) => (
                      <tr key={item._id || idx} className="hover:bg-slate-900/40 transition-colors">
                        <td className="p-4 text-slate-500 font-bold">{idx + 1}</td>
                        <td className="p-4 font-bold text-white font-sans">{item.studentName}</td>
                        <td className="p-4 font-bold text-cyan-300">{item.regNo}</td>
                        <td className="p-4 text-slate-300">{item.email}</td>
                        <td className="p-4 text-slate-400">
                          {item.year || 'N/A'} • {item.branch || 'N/A'}
                        </td>
                        <td className="p-4 text-slate-300">{item.distanceFromTargetMeters || 0}m</td>
                        <td className="p-4">
                          {item.verificationMode === 'ADMIN_MANUAL_OVERRIDE' ? (
                            <span className="px-2.5 py-1 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[10px] font-bold">
                              Manual Pass ({item.overrideReason})
                            </span>
                          ) : item.verificationMode === 'SUSPICIOUS_PROXY' ? (
                            <span className="px-2.5 py-1 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/30 text-[10px] font-bold">
                              Suspicious Proxy
                            </span>
                          ) : (
                            <span className="px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[10px] font-bold">
                              GPS Verified
                            </span>
                          )}
                        </td>
                        <td className="p-4 text-right">
                          <button
                            onClick={() => openEditModal(item)}
                            className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-cyan-300 border border-slate-800 transition-colors cursor-pointer"
                            title="Edit Student Record"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: SESSION HISTORY */}
      {activeTab === 'history' && (
        <div className="space-y-6 animate-fadeIn">
          <div className="glass-panel p-6 rounded-3xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div className="flex items-center gap-2 font-display font-bold text-lg text-white">
                <History className="w-5 h-5 text-cyan-400" />
                <span>Historical ProxyQr Sessions Archive</span>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs font-mono">
                <thead>
                  <tr className="bg-slate-900/90 text-slate-400 border-b border-slate-800">
                    <th className="p-4">Session ID</th>
                    <th className="p-4">Lab / Room</th>
                    <th className="p-4">Title</th>
                    <th className="p-4">Proctor</th>
                    <th className="p-4">Total Attendees</th>
                    <th className="p-4">Status</th>
                    <th className="p-4 text-right">Date Created</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {sessionsList.map((sess) => (
                    <tr key={sess.sessionId} className="hover:bg-slate-900/40 transition-colors">
                      <td className="p-4 font-bold text-cyan-300">{sess.sessionId}</td>
                      <td className="p-4 text-slate-200">{sess.labIdentifier}</td>
                      <td className="p-4 font-bold text-white font-sans">{sess.title}</td>
                      <td className="p-4 text-slate-400">{sess.proctorName}</td>
                      <td className="p-4 font-bold text-emerald-400">{sess.totalAttendees || 0}</td>
                      <td className="p-4">
                        <span
                          className={`px-2.5 py-1 rounded-full text-[10px] font-bold border ${
                            sess.status === 'TERMINATED'
                              ? 'bg-slate-800 text-slate-400 border-slate-700'
                              : sess.status === 'ACTIVE'
                              ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                              : 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                          }`}
                        >
                          {sess.status}
                        </span>
                      </td>
                      <td className="p-4 text-right text-slate-400">
                        {new Date(sess.createdAt).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* FULLSCREEN PROJECTOR OVERLAY MODE */}
      {isProjectorMode && (
        <div className="fixed inset-0 z-[99999] bg-slate-950 flex flex-col items-center justify-center p-8 select-none">
          <button
            onClick={() => setIsProjectorMode(false)}
            className="absolute top-6 right-6 p-3 rounded-2xl bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 transition-colors cursor-pointer"
          >
            <Minimize className="w-6 h-6" />
          </button>

          <div className="space-y-6 text-center max-w-2xl w-full">
            <div className="space-y-1">
              <span className="text-xs font-mono font-bold text-cyan-400 tracking-wider uppercase">
                {selectedSessionId} • {qrData?.labIdentifier || 'Lab 101'}
              </span>
              <h1 className="font-display font-black text-3xl sm:text-4xl text-white">
                {qrData?.title || 'CS202: Advanced Operating Systems Lab'}
              </h1>
            </div>

            <div className="bg-white p-8 rounded-3xl shadow-[0_0_80px_rgba(6,182,212,0.4)] inline-block border-4 border-cyan-400">
              <QRCodeSVG value={qrCodeValue} size={380} level="H" includeMargin={true} />
            </div>

            <div className="text-cyan-400 font-mono font-bold text-base tracking-widest">
              <span>SCAN WITH GOOGLE LENS OR PHONE CAMERA</span>
            </div>

            <div className="max-w-md mx-auto space-y-2 font-mono">
              <div className="flex justify-between text-sm text-cyan-300">
                <span>Auto-Rotating Token</span>
                <span>{safeCountdown}s</span>
              </div>
              <div className="w-full h-4 bg-slate-900 rounded-full overflow-hidden p-0.5 border border-slate-800">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-blue-600 shadow-[0_0_20px_rgba(6,182,212,0.9)]"
                  style={{ width: `${progressPercent}%` }}
                ></div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* CREATE NEW SESSION MODAL */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-[99990] bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 animate-fadeIn">
          <div className="glass-panel p-6 sm:p-8 rounded-3xl max-w-lg w-full space-y-5 border-cyan-500/40 shadow-[0_0_50px_rgba(6,182,212,0.2)]">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2 font-display font-bold text-lg text-white">
                <Plus className="w-5 h-5 text-cyan-400" />
                <span>Create New ProxyQr Session</span>
              </div>
              <button
                onClick={() => setIsCreateModalOpen(false)}
                className="p-1 rounded-xl bg-slate-900 text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateSession} className="space-y-4 text-xs font-mono">
              <div className="space-y-1.5">
                <label className="text-slate-300 font-semibold block">Lab / Room Identifier</label>
                <input
                  type="text"
                  value={newLabIdentifier}
                  onChange={(e) => setNewLabIdentifier(e.target.value)}
                  placeholder="e.g. Lab 101, Audi-2"
                  required
                  className="w-full px-4 py-2.5 rounded-xl glass-input text-cyan-300 font-mono"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-slate-300 font-semibold block">Session / Event Title</label>
                <input
                  type="text"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="e.g. CS202 Lab, TCS Aptitude Mock"
                  required
                  className="w-full px-4 py-2.5 rounded-xl glass-input text-slate-200 font-sans"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-slate-300 font-semibold block">Proctor / In-Charge Name</label>
                <input
                  type="text"
                  value={newProctorName}
                  onChange={(e) => setNewProctorName(e.target.value)}
                  placeholder="Prof. Alan Turing"
                  className="w-full px-4 py-2.5 rounded-xl glass-input text-slate-200 font-sans"
                />
              </div>

              <div className="pt-3 border-t border-slate-800">
                <label className="flex items-center justify-between p-3 rounded-xl bg-slate-900/80 border border-slate-800 cursor-pointer">
                  <span className="text-slate-200">Require Mobile Phone Number</span>
                  <input
                    type="checkbox"
                    checked={requireMobile}
                    onChange={(e) => setRequireMobile(e.target.checked)}
                    className="w-4 h-4 rounded text-cyan-500 bg-slate-950 border-slate-700"
                  />
                </label>
              </div>

              <div className="pt-4 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-900 text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-bold font-display shadow-[0_0_20px_rgba(6,182,212,0.4)]"
                >
                  Initialize Session
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DOUBLE CHECK TERMINATE MODAL */}
      {isTerminateModalOpen && (
        <div className="fixed inset-0 z-[99990] bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 animate-fadeIn">
          <div className="glass-panel p-6 sm:p-8 rounded-3xl max-w-md w-full space-y-5 border-rose-500/40 shadow-[0_0_50px_rgba(244,63,94,0.3)]">
            <div className="flex items-center gap-3 text-rose-400 font-display font-bold text-lg border-b border-slate-800 pb-3">
              <AlertTriangle className="w-6 h-6 animate-bounce" />
              <span>Permanently End Session?</span>
            </div>

            <p className="text-xs font-mono text-slate-300 leading-relaxed">
              Are you sure you want to permanently end session <strong className="text-rose-400">[{selectedSessionId}]</strong>? Once terminated, no further student submissions can be recorded.
            </p>

            <div className="pt-2 flex items-center justify-end gap-3 font-mono text-xs">
              <button
                onClick={() => setIsTerminateModalOpen(false)}
                className="px-4 py-2.5 rounded-xl bg-slate-900 text-slate-300 hover:text-white"
              >
                Cancel
              </button>

              <button
                onClick={handleTerminateSessionSubmit}
                className="px-6 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 font-bold text-white shadow-[0_0_20px_rgba(244,63,94,0.4)]"
              >
                Terminate Session Permanently
              </button>
            </div>
          </div>
        </div>
      )}

      {/* EMERGENCY MANUAL INTAKE MODAL */}
      {isManualModalOpen && (
        <div className="fixed inset-0 z-[99990] bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 animate-fadeIn">
          <div className="glass-panel p-6 sm:p-8 rounded-3xl max-w-lg w-full space-y-5 border-amber-500/40 shadow-[0_0_50px_rgba(245,158,11,0.3)]">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2 font-display font-bold text-lg text-amber-400">
                <Plus className="w-5 h-5" />
                <span>Emergency Manual Attendance Pass</span>
              </div>
              <button
                onClick={() => setIsManualModalOpen(false)}
                className="p-1 rounded-xl bg-slate-900 text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleManualIntakeSubmit} className="space-y-4 text-xs font-mono">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-slate-300 font-semibold block">Full Name</label>
                  <input
                    type="text"
                    value={manualName}
                    onChange={(e) => setManualName(e.target.value)}
                    placeholder="Aryan Kale"
                    required
                    className="w-full px-3 py-2 rounded-xl glass-input text-slate-200"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-slate-300 font-semibold block">PRN / Reg No</label>
                  <input
                    type="text"
                    value={manualRegNo}
                    onChange={(e) => setManualRegNo(e.target.value)}
                    placeholder="2024BIT020"
                    required
                    className="w-full px-3 py-2 rounded-xl glass-input text-cyan-300 font-mono"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-slate-300 font-semibold block">Student Email Address</label>
                <input
                  type="email"
                  value={manualEmail}
                  onChange={(e) => setManualEmail(e.target.value)}
                  placeholder="2024bit020@sggs.ac.in"
                  required
                  className="w-full px-3 py-2 rounded-xl glass-input text-slate-200"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-slate-300 font-semibold block">Academic Year</label>
                  <select
                    value={manualYear}
                    onChange={(e) => setManualYear(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl glass-input text-slate-200"
                  >
                    {YEARS.map((yr) => (
                      <option key={yr} value={yr}>
                        {yr}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-slate-300 font-semibold block">Branch / Major</label>
                  <select
                    value={manualBranch}
                    onChange={(e) => setManualBranch(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl glass-input text-slate-200"
                  >
                    {DEPARTMENTS.map((dept) => (
                      <option key={dept} value={dept}>
                        {dept}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-slate-300 font-semibold block">Override Reason</label>
                <select
                  value={manualReason}
                  onChange={(e) => setManualReason(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl glass-input text-amber-300 font-bold"
                >
                  {OVERRIDE_REASONS.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>

              <div className="pt-3 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsManualModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-900 text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-6 py-2 rounded-xl bg-amber-500 text-slate-950 font-bold font-display shadow-[0_0_20px_rgba(245,158,11,0.4)]"
                >
                  Record Manual Pass
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EDIT ATTENDEE MODAL */}
      {editingAttendee && (
        <div className="fixed inset-0 z-[99990] bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 animate-fadeIn">
          <div className="glass-panel p-6 sm:p-8 rounded-3xl max-w-lg w-full space-y-5 border-cyan-500/40 shadow-[0_0_50px_rgba(6,182,212,0.2)]">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2 font-display font-bold text-lg text-cyan-400">
                <Pencil className="w-5 h-5" />
                <span>Edit Student Attendance Record</span>
              </div>
              <button
                onClick={() => setEditingAttendee(null)}
                className="p-1 rounded-xl bg-slate-900 text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleEditAttendeeSubmit} className="space-y-4 text-xs font-mono">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-slate-300 font-semibold block">Full Name</label>
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    required
                    className="w-full px-3 py-2 rounded-xl glass-input text-slate-200"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-slate-300 font-semibold block">PRN / Reg No</label>
                  <input
                    type="text"
                    value={editRegNo}
                    onChange={(e) => setEditRegNo(e.target.value)}
                    required
                    className="w-full px-3 py-2 rounded-xl glass-input text-cyan-300 font-mono"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-slate-300 font-semibold block">Email Address</label>
                <input
                  type="email"
                  value={editEmail}
                  onChange={(e) => setEditEmail(e.target.value)}
                  required
                  className="w-full px-3 py-2 rounded-xl glass-input text-slate-200"
                />
              </div>

              <div className="space-y-1">
                <label className="text-slate-300 font-semibold block">Mandatory Edit Reason</label>
                <input
                  type="text"
                  value={editReason}
                  onChange={(e) => setEditReason(e.target.value)}
                  placeholder="e.g. Typo in PRN, Wrong Department Selected"
                  required
                  className="w-full px-3 py-2 rounded-xl glass-input text-amber-300 font-bold"
                />
              </div>

              <div className="pt-3 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setEditingAttendee(null)}
                  className="px-4 py-2 rounded-xl bg-slate-900 text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-6 py-2 rounded-xl bg-cyan-500 text-slate-950 font-bold font-display shadow-[0_0_20px_rgba(6,182,212,0.4)]"
                >
                  Save Record Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
