import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
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
  Eye,
  Calendar,
  Trash2,
  RefreshCw,
} from 'lucide-react';
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

const OVERRIDE_REASONS = [
  'Battery Dead',
  'Camera Broken',
  'Severe GPS Drift',
  'No Mobile Data',
  'Wi-Fi Disconnected',
  'Other Administrative Reason',
];

const DUMMY_SESSION_IDS = ['CS202-A81F', 'DSA-7C4E', 'CN301-5B9D'];

export default function AdminDashboard() {
  const {
    connected,
    socket,
    qrData,
    countdown,
    currentSessionId,
    backendUrl,
    joinSession,
    clearSession,
    forceRotateQR,
    updateGeofence,
    updateGeofenceRadius,
  } = useSocket();

  // Active Top Navigation Tab: 'active' | 'roster' | 'history'
  const [activeTab, setActiveTab] = useState('active');

  // Sessions & Attendees Roster State (Backed by localStorage for zero-latency offline persistence)
  const [sessionsList, setSessionsList] = useState(() => {
    try {
      const cached = localStorage.getItem('proxyqr_persisted_sessions');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const genuine = parsed.filter(
            (s) => s && s.sessionId && !DUMMY_SESSION_IDS.includes(String(s.sessionId).toUpperCase())
          );
          if (genuine.length !== parsed.length) {
            try {
              localStorage.setItem('proxyqr_persisted_sessions', JSON.stringify(genuine));
            } catch (e) {}
          }
          return genuine;
        }
      }
    } catch (e) {}
    return [];
  });

  // Helper to update sessionsList and write-through to localStorage
  const updatePersistedSessions = (updater) => {
    setSessionsList((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      try {
        localStorage.setItem('proxyqr_persisted_sessions', JSON.stringify(next));
      } catch (e) {}
      return next;
    });
  };

  const [selectedSessionId, setSelectedSessionId] = useState(currentSessionId || null);
  const setActiveSession = (sid) => setSelectedSessionId(sid);
  const [attendeesRoster, setAttendeesRoster] = useState([]);
  const [totalCount, setTotalCount] = useState(0);

  // Geofence Radius & Calibration State
  const [geofenceRadius, setGeofenceRadius] = useState(50);
  const [isGeofenceEnabled, setIsGeofenceEnabled] = useState(true);
  const [isCalibratingLocation, setIsCalibratingLocation] = useState(false);
  const updateGeofenceTimerRef = useRef(null);
  const isDraggingRadiusRef = useRef(false);

  // Fullscreen Projector Overlay Mode State
  const [isProjectorMode, setIsProjectorMode] = useState(false);

  // Roster Fuzzy Search & Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('ALL');
  const [yearFilter, setYearFilter] = useState('ALL');
  const [verificationFilter, setVerificationFilter] = useState('ALL');

  // Session History Search, Status & Date Filter
  const [historySearchQuery, setHistorySearchQuery] = useState('');
  const [historyStatusFilter, setHistoryStatusFilter] = useState('ALL');
  const [historyDateFilter, setHistoryDateFilter] = useState('');

  // Modals Control
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isTerminateModalOpen, setIsTerminateModalOpen] = useState(false);
  const [isManualModalOpen, setIsManualModalOpen] = useState(false);
  const [editingAttendee, setEditingAttendee] = useState(null);

  // Create Session Form State (Initialized empty with clean placeholders)
  const [newLabIdentifier, setNewLabIdentifier] = useState('');
  const [newTitle, setNewTitle] = useState('');
  const [newPresenterName, setNewPresenterName] = useState('');
  const [requireMobile, setRequireMobile] = useState(false);
  const [isCreatingSession, setIsCreatingSession] = useState(false);

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

  // Fetch active session from strictly filtered endpoint
  const fetchActiveSession = async () => {
    try {
      const token = localStorage.getItem('admin_token');
      const { res, data } = await fetchWithFailover('/api/session/active', {
        headers: { Authorization: `Bearer ${token}`, 'x-admin-token': token },
      });
      if (data?.success && data.session && data.session.status !== 'TERMINATED' && !data.session.isEnded) {
        setSelectedSessionId(data.session.sessionId);
        joinSession(data.session.sessionId);
      } else {
        setSelectedSessionId(null);
        clearSession();
      }
    } catch (e) {
      console.warn('[AdminDashboard] Fetch active session error:', e);
    }
  };

  // Fetch Sessions and Roster Stats (Merges with localStorage cache so no sessions vanish)
  const fetchSessions = async (options = {}) => {
    try {
      const token = localStorage.getItem('admin_token');
      const { res, data } = await fetchWithFailover('/api/attendance/events', {
        headers: { Authorization: `Bearer ${token}`, 'x-admin-token': token },
      });
      if (data?.success && Array.isArray(data.events)) {
        updatePersistedSessions((prev) => {
          const map = new Map();
          // 1. Keep all previously persisted / seeded sessions
          prev.forEach((s) => map.set(s.sessionId, s));
          // 2. Overlay backend events
          data.events.forEach((s) => {
            const existing = map.get(s.sessionId);
            map.set(s.sessionId, { ...existing, ...s });
          });
          return Array.from(map.values());
        });

        if (options.preventAutoSelect) {
          setSelectedSessionId(null);
          return;
        }

        setSelectedSessionId((prev) => {
          if (!prev) return null;
          const prevEv = data.events.find((e) => e.sessionId === prev);
          if (prevEv && prevEv.status !== 'TERMINATED' && !prevEv.isEnded) {
            return prev;
          }
          return null;
        });
      }
    } catch (e) {
      console.warn('[AdminDashboard] Fetch sessions error, keeping local cache:', e);
    }
  };

  const fetchRoster = async (sessionId) => {
    if (!sessionId) {
      setAttendeesRoster([]);
      setTotalCount(0);
      return;
    }
    const sid = String(sessionId).trim().toUpperCase();
    try {
      const token = localStorage.getItem('admin_token');
      const { res, data } = await fetchWithFailover(`/api/attendance/stats/${sid}`, {
        headers: { Authorization: `Bearer ${token}`, 'x-admin-token': token },
      });
      if (data?.success && data?.stats) {
        const recent = Array.isArray(data.stats.recent) ? data.stats.recent : [];
        if (recent.length > 0) {
          setAttendeesRoster(recent);
          setTotalCount(data.stats.count || recent.length);
          return;
        }
      }
    } catch (e) {
      console.warn('[AdminDashboard] Fetch roster error:', e);
    }

    setAttendeesRoster([]);
    setTotalCount(0);
  };

  useEffect(() => {
    fetchActiveSession();
    fetchSessions();
  }, [backendUrl]);

  useEffect(() => {
    fetchRoster(selectedSessionId);
  }, [selectedSessionId, backendUrl]);

  // Sync Geofence radius slider and bypass toggle with qrData (ignore while user is dragging)
  useEffect(() => {
    if (qrData?.allowedRadiusMeters && !isDraggingRadiusRef.current) {
      setGeofenceRadius(qrData.allowedRadiusMeters);
    }
    if (typeof qrData?.geofenceEnabled === 'boolean') {
      setIsGeofenceEnabled(qrData.geofenceEnabled);
    }
  }, [qrData]);

  const commitGeofenceRadius = (newRadius) => {
    if (updateGeofenceTimerRef.current) {
      clearTimeout(updateGeofenceTimerRef.current);
      updateGeofenceTimerRef.current = null;
    }
    const r = Math.min(500, Math.max(15, Number(newRadius) || 50));
    updateGeofence({
      sessionId: selectedSessionId,
      allowedRadiusMeters: r,
      geofenceEnabled: isGeofenceEnabled,
    });
  };

  const handleRadiusChange = (newRadius) => {
    const raw = Number(newRadius);
    if (isNaN(raw)) return;
    const clamped = Math.min(500, Math.max(15, raw));
    isDraggingRadiusRef.current = true;
    setGeofenceRadius(clamped);

    // Debounce live socket update so slider is ultra-smooth with 0 network jitter
    if (updateGeofenceTimerRef.current) {
      clearTimeout(updateGeofenceTimerRef.current);
    }
    updateGeofenceTimerRef.current = setTimeout(() => {
      commitGeofenceRadius(clamped);
      isDraggingRadiusRef.current = false;
    }, 150);
  };

  const handleRadiusCommit = () => {
    isDraggingRadiusRef.current = false;
    commitGeofenceRadius(geofenceRadius);
  };

  // Calibrate Classroom GPS using current admin device position
  const handleCalibrateLocation = () => {
    if (!navigator.geolocation) {
      alert('Geolocation is not supported by your browser.');
      return;
    }
    setIsCalibratingLocation(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        updateGeofence({
          sessionId: selectedSessionId,
          latitude,
          longitude,
          allowedRadiusMeters: geofenceRadius,
          geofenceEnabled: isGeofenceEnabled,
        });
        setIsCalibratingLocation(false);
        alert(`Classroom GPS calibrated successfully!\nCoordinates: ${latitude.toFixed(5)}, ${longitude.toFixed(5)}`);
      },
      (err) => {
        setIsCalibratingLocation(false);
        alert(`Failed to get device location: ${err.message}. Ensure location permissions are granted.`);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  // Toggle Geofence Enforcement On/Off
  const handleToggleGeofence = () => {
    const nextState = !isGeofenceEnabled;
    setIsGeofenceEnabled(nextState);
    updateGeofence({
      sessionId: selectedSessionId,
      allowedRadiusMeters: geofenceRadius,
      geofenceEnabled: nextState,
    });
  };

  // Listen to Socket.IO real-time attendee additions and edits
  useEffect(() => {
    if (!socket) return;

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
  }, [selectedSessionId, socket]);

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
    if (isCreatingSession) return;
    if (!newLabIdentifier.trim() || !newTitle.trim()) {
      alert('Lab Identifier and Session Title are required.');
      return;
    }
    setIsCreatingSession(true);
    try {
      // Opportunistically query device coordinates to seed classroom location
      let deviceCoords = null;
      if (navigator.geolocation) {
        try {
          deviceCoords = await new Promise((resolve) => {
            navigator.geolocation.getCurrentPosition(
              (pos) => resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
              () => resolve(null),
              { enableHighAccuracy: true, timeout: 2500 }
            );
          });
        } catch (e) {
          // non-blocking
        }
      }

      const token = localStorage.getItem('admin_token');
      const { res, data } = await fetchWithFailover('/api/admin/sessions/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          'x-admin-token': token,
        },
        body: JSON.stringify({
          labIdentifier: newLabIdentifier.trim(),
          title: newTitle.trim(),
          proctorName: (newPresenterName || 'Faculty In-Charge').trim(),
          presenterName: (newPresenterName || 'Faculty In-Charge').trim(),
          customFields: { requireMobileNumber: requireMobile },
          latitude: deviceCoords?.latitude || null,
          longitude: deviceCoords?.longitude || null,
          allowedRadiusMeters: geofenceRadius || 50,
          geofenceEnabled: true,
        }),
      });

      if (data?.success) {
        const createdId = data.sessionId || data.session?.sessionId || data.event?.sessionId;
        const createdSession = data.session || data.event || {
          sessionId: createdId,
          labIdentifier: newLabIdentifier.trim(),
          title: newTitle.trim(),
          proctorName: (newPresenterName || 'Faculty In-Charge').trim(),
          status: 'PAUSED',
        };

        setIsCreateModalOpen(false);
        setNewLabIdentifier('');
        setNewTitle('');
        setNewPresenterName('');
        setRequireMobile(false);

        if (createdId) {
          updatePersistedSessions((prev) => [createdSession, ...prev.filter((s) => s.sessionId !== createdId)]);
          handleSelectSession(createdId);
        }
        await fetchSessions();
      } else {
        alert(data?.message || 'Failed to create session.');
      }
    } catch (err) {
      alert('Error creating session: ' + err.message);
    } finally {
      setIsCreatingSession(false);
    }
  };

  // Delete Session (from History)
  const handleDeleteSession = async (sessionId, sessionTitle) => {
    if (!sessionId) return;
    const cleanId = sessionId.toUpperCase();
    const confirmed = window.confirm(
      `Are you sure you want to permanently delete session ${cleanId} (${sessionTitle || 'Session'})?\n\nAll recorded attendance entries for this session will be permanently deleted.`
    );
    if (!confirmed) return;

    try {
      const token = localStorage.getItem('admin_token');
      const { data } = await fetchWithFailover(`/api/admin/sessions/${cleanId}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
          'x-admin-token': token,
        },
      });

      if (data?.success) {
        updatePersistedSessions((prev) => prev.filter((s) => s.sessionId !== cleanId));
        if (selectedSessionId === cleanId) {
          setSelectedSessionId('');
          setAttendeesRoster([]);
        }
        await fetchSessions();
      } else {
        alert(data?.message || 'Failed to delete session.');
      }
    } catch (err) {
      alert('Error deleting session: ' + err.message);
    }
  };

  // Switch to attendance roster of a historical session
  const handleViewHistoricalSession = (sessionId) => {
    if (!sessionId) return;
    const cleanId = sessionId.toUpperCase();
    setSelectedSessionId(cleanId);
    fetchRoster(cleanId);
    joinSession(cleanId);
    setActiveTab('roster');
  };

  // Export Clean, Auto-Formatted SheetJS Excel File
  const handleExportExcel = async (targetSessionId = null) => {
    try {
      const rawTarget = targetSessionId || selectedSessionId;
      if (!rawTarget) {
        alert('Please select or specify a session to export attendance.');
        return;
      }
      const sid = String(rawTarget).trim().toUpperCase();
      let rosterData = [];

      const isCurrentSelected = selectedSessionId && String(selectedSessionId).trim().toUpperCase() === sid;

      // If exporting currently selected session and roster is already in state, use it
      if (isCurrentSelected && Array.isArray(attendeesRoster) && attendeesRoster.length > 0) {
        rosterData = attendeesRoster;
      }

      // If rosterData is empty or we are exporting a different session from history tab, fetch its roster
      if (!rosterData || rosterData.length === 0) {
        try {
          const token = localStorage.getItem('admin_token');
          const { data } = await fetchWithFailover(`/api/attendance/stats/${sid}`, {
            headers: { Authorization: `Bearer ${token}`, 'x-admin-token': token },
          });
          if (data?.success && data?.stats?.recent && Array.isArray(data.stats.recent) && data.stats.recent.length > 0) {
            rosterData = data.stats.recent;
          }
        } catch (fetchErr) {
          console.warn(`[handleExportExcel] Fetch failed for session ${sid}:`, fetchErr);
        }
      }

      if (!rosterData || rosterData.length === 0) {
        alert(`No verified attendee records found for session ${sid}.`);
        return;
      }

      const exportData = rosterData.map((item, index) => ({
        'S.No': index + 1,
        'Session ID': item.sessionId || sid,
        'Student Name': item.studentName || 'N/A',
        'Registration No': item.regNo || item.studentId || 'N/A',
        'Email Address': item.email || 'N/A',
        'Academic Year': item.year || 'N/A',
        'Branch / Department': item.branch || 'N/A',
        'Mobile Number': item.mobileNumber || 'N/A',
        'Verification Status': item.verificationMode === 'ADMIN_MANUAL_OVERRIDE'
          ? `Manual Pass (${item.overrideReason || 'Admin Approved'})`
          : item.verificationMode === 'SUSPICIOUS_PROXY'
          ? 'Suspicious Proxy'
          : 'GPS Verified',
        'GPS Distance': `${item.distanceFromTargetMeters || 0} meters`,
        'Attendance Date & Time': new Date(item.timestamp || Date.now()).toLocaleString('en-IN', {
          dateStyle: 'medium',
          timeStyle: 'medium',
        }),
      }));

      const worksheet = XLSX.utils.json_to_sheet(exportData);

      // Auto-fit Column Widths for Readable & Formatted Excel Output
      worksheet['!cols'] = [
        { wch: 6 },  // S.No
        { wch: 16 }, // Session ID
        { wch: 24 }, // Student Name
        { wch: 22 }, // Registration No
        { wch: 32 }, // Email Address
        { wch: 16 }, // Academic Year
        { wch: 26 }, // Branch / Department
        { wch: 16 }, // Mobile Number
        { wch: 28 }, // Verification Status
        { wch: 16 }, // GPS Distance
        { wch: 26 }, // Attendance Date & Time
      ];

      const workbook = XLSX.utils.book_new();
      const cleanSheetName = `Att_${sid}`.slice(0, 31);
      XLSX.utils.book_append_sheet(workbook, worksheet, cleanSheetName);

      const dateStr = new Date().toISOString().slice(0, 10);
      const filename = `Attendance_Report_${sid}_${dateStr}.xlsx`;
      XLSX.writeFile(workbook, filename);
    } catch (err) {
      console.error('[Export Excel Error]:', err);
      alert('Error exporting Excel report: ' + err.message);
    }
  };

  // Start / Resume Session
  const handleStartSession = async () => {
    try {
      const token = localStorage.getItem('admin_token');
      await fetchWithFailover('/api/admin/sessions/start', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          'x-admin-token': token,
        },
        body: JSON.stringify({ sessionId: selectedSessionId }),
      });
      if (socket) {
        socket.emit('start-session', { sessionId: selectedSessionId });
      }
      fetchSessions();
    } catch (e) {
      console.warn('Start session error:', e);
    }
  };

  // Pause Session
  const handlePauseSession = async () => {
    try {
      const token = localStorage.getItem('admin_token');
      await fetchWithFailover('/api/admin/sessions/pause', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          'x-admin-token': token,
        },
        body: JSON.stringify({ sessionId: selectedSessionId }),
      });
      if (socket) {
        socket.emit('pause-session', { sessionId: selectedSessionId });
      }
      fetchSessions();
    } catch (e) {
      console.warn('Pause session error:', e);
    }
  };

  // Terminate Session (Double Check Permanently End)
  const handleTerminateSessionSubmit = async () => {
    const sessionToTerminate = selectedSessionId;
    try {
      const token = localStorage.getItem('admin_token');
      // 1. Await the API call to terminate the session
      await fetchWithFailover('/api/admin/sessions/terminate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          'x-admin-token': token,
        },
        body: JSON.stringify({ sessionId: sessionToTerminate }),
      });

      // Notify socket of termination (NEVER emit pause-session!)
      if (socket && sessionToTerminate) {
        socket.emit('terminate-session', { sessionId: sessionToTerminate });
      }

      // 2. Clear active session state
      setActiveSession(null);
      clearSession();

      // 3. Remove any cached session ID from localStorage/sessionStorage
      localStorage.removeItem('proxyqr_active_session');
      localStorage.removeItem('selected_session_id');
      localStorage.removeItem('active_session_id');
      sessionStorage.removeItem('proxyqr_active_session');
      sessionStorage.removeItem('selected_session_id');
      sessionStorage.removeItem('active_session_id');

      // 4. Force view to remain on the "No Active Session Running" screen
      setIsTerminateModalOpen(false);
      setActiveTab('active');

      // 5. Update local cache immediately to mark this session TERMINATED
      if (sessionToTerminate) {
        updatePersistedSessions((prev) =>
          prev.map((s) =>
            s.sessionId === sessionToTerminate
              ? {
                  ...s,
                  status: 'TERMINATED',
                  isEnded: true,
                  endedAt: new Date().toISOString(),
                  terminatedAt: new Date().toISOString(),
                }
              : s
          )
        );
      }

      // Update sessions history list without re-selecting any terminated session
      await fetchSessions({ preventAutoSelect: true });
    } catch (e) {
      alert('Error ending session: ' + e.message);
    }
  };

  // Manual Intake Submit
  const handleManualIntakeSubmit = async (e) => {
    e.preventDefault();
    try {
      const token = localStorage.getItem('admin_token');
      const { res, data } = await fetchWithFailover('/api/admin/manual-intake', {
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
    setEditRegNo(attendee.regNo || attendee.studentId || '');
    setEditEmail(attendee.email || '');
    setEditYear(attendee.year || YEARS[0]);
    setEditBranch(attendee.branch || DEPARTMENTS[0]);
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
      const { res, data } = await fetchWithFailover(`/api/admin/attendee/${editingAttendee._id}`, {
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
  const activeSessionObj = sessionsList.find((s) => s.sessionId === selectedSessionId) || qrData;
  const isSessionTerminated = activeSessionObj?.status === 'TERMINATED' || qrData?.status === 'TERMINATED';

  // Fullscreen Projector Mode Handlers & Controls
  const enterProjectorMode = async () => {
    setIsProjectorMode(true);
    try {
      if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
        await document.documentElement.requestFullscreen().catch(() => {});
      }
    } catch (e) {}
  };

  const exitProjectorMode = async () => {
    setIsProjectorMode(false);
    try {
      if (document.fullscreenElement && document.exitFullscreen) {
        await document.exitFullscreen().catch(() => {});
      }
    } catch (e) {}
  };

  // Keyboard shortcut listener: Press 'F' to toggle fullscreen, 'Esc' to exit
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Ignore shortcut if user is typing in inputs or forms
      const activeTag = document.activeElement?.tagName?.toLowerCase();
      const isInput =
        ['input', 'textarea', 'select'].includes(activeTag) ||
        document.activeElement?.isContentEditable;
      if (isInput) return;

      if (e.key === 'f' || e.key === 'F') {
        e.preventDefault();
        if (isProjectorMode) {
          exitProjectorMode();
        } else if (isSessionActive && !isSessionTerminated) {
          enterProjectorMode();
        }
      } else if (e.key === 'Escape') {
        if (isProjectorMode) {
          e.preventDefault();
          exitProjectorMode();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isProjectorMode, isSessionActive, isSessionTerminated]);

  // Sync state if user exits via browser ESC or native browser controls
  useEffect(() => {
    const handleFullscreenChange = () => {
      if (!document.fullscreenElement && isProjectorMode) {
        setIsProjectorMode(false);
      }
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
    };
  }, [isProjectorMode]);

  // Hide headers, navbars and prevent scrolling while in projector mode
  useEffect(() => {
    if (isProjectorMode) {
      document.body.classList.add('projector-mode-active');
      document.body.style.overflow = 'hidden';
    } else {
      document.body.classList.remove('projector-mode-active');
      document.body.style.overflow = '';
    }
    return () => {
      document.body.classList.remove('projector-mode-active');
      document.body.style.overflow = '';
    };
  }, [isProjectorMode]);

  const getDynamicQrCodeValue = () => {
    if (!isSessionActive) return 'SESSION_PAUSED';

    const baseUrl = getAppBaseUrl();
    const sid = (selectedSessionId || qrData?.sessionId || '').toUpperCase();

    if (qrData?.token) {
      return `${baseUrl}/scan?token=${encodeURIComponent(qrData.token)}${sid ? `&sessionId=${encodeURIComponent(sid)}` : ''}`;
    }

    if (qrData?.qrUrl) {
      try {
        const urlObj = new URL(qrData.qrUrl);
        if (sid && !urlObj.searchParams.has('sessionId')) {
          urlObj.searchParams.set('sessionId', sid);
        }
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

  // Session Timestamp helper (extracts createdAt or MongoDB ObjectId timestamp)
  const getSessionTimestamp = (sess) => {
    if (!sess) return 0;
    if (sess.createdAt) {
      const t = new Date(sess.createdAt).getTime();
      if (!isNaN(t) && t > 0) return t;
    }
    if (sess._id) {
      try {
        const hex = String(sess._id).substring(0, 8);
        const t = parseInt(hex, 16) * 1000;
        if (!isNaN(t) && t > 0) return t;
      } catch (e) {}
    }
    return 0;
  };

  const getFormattedDateStarted = (sess) => {
    const ts = getSessionTimestamp(sess);
    if (ts && ts > 0) {
      return new Date(ts).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
    }
    return 'N/A';
  };

  const getTerminationTimestamp = (sess) => {
    if (!sess) return 0;
    if (sess.endedAt) {
      const t = new Date(sess.endedAt).getTime();
      if (!isNaN(t) && t > 0) return t;
    }
    if (sess.terminatedAt) {
      const t = new Date(sess.terminatedAt).getTime();
      if (!isNaN(t) && t > 0) return t;
    }
    return getSessionTimestamp(sess);
  };

  const getSessionDateString = (timestamp) => {
    if (!timestamp) return null;
    const d = new Date(timestamp);
    if (isNaN(d.getTime())) return null;
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  // Filter and Sort Historical Sessions:
  // 1. Live/active sessions are at the very top
  // 2. Terminated sessions follow, ordered by "terminated lastly at top" (most recently ended at top)
  const sortedAndFilteredHistory = sessionsList
    .map((sess) => ({
      ...sess,
      _timestamp: getSessionTimestamp(sess),
      _terminationTimestamp: getTerminationTimestamp(sess),
      _isTerminated: sess.status === 'TERMINATED' || sess.isEnded || !!sess.endedAt,
    }))
    .sort((a, b) => {
      // 1. If 1 is active and 1 is terminated: active is at the top
      if (!a._isTerminated && b._isTerminated) return -1;
      if (a._isTerminated && !b._isTerminated) return 1;

      // 2. If both are active/in-progress: sort by newest start time
      if (!a._isTerminated && !b._isTerminated) {
        return b._timestamp - a._timestamp;
      }

      // 3. If both are terminated: the session terminated lastly should be at top
      const termDiff = b._terminationTimestamp - a._terminationTimestamp;
      if (termDiff !== 0) return termDiff;

      return b._timestamp - a._timestamp;
    })
    .filter((sess) => {
      // Filter by Status: 'ALL' | 'ACTIVE' | 'PAUSED' | 'TERMINATED'
      if (historyStatusFilter !== 'ALL') {
        const effectiveStatus = sess._isTerminated ? 'TERMINATED' : (sess.status || 'PAUSED');
        if (effectiveStatus !== historyStatusFilter) {
          return false;
        }
      }

      // Filter by Specific Date (YYYY-MM-DD)
      if (historyDateFilter) {
        const startDateStr = getSessionDateString(sess._timestamp);
        const endDateStr = getSessionDateString(sess.endedAt || sess.terminatedAt);
        const matchesDate = startDateStr === historyDateFilter || endDateStr === historyDateFilter;
        if (!matchesDate) {
          return false;
        }
      }

      // Search by Session ID, Name / Title, Lab / Room, Faculty / Instructor, or Date
      if (!historySearchQuery.trim()) return true;
      const q = historySearchQuery.toLowerCase().trim();
      const matchId = sess.sessionId?.toLowerCase().includes(q);
      const matchTitle = sess.title?.toLowerCase().includes(q);
      const matchLab = sess.labIdentifier?.toLowerCase().includes(q);
      const matchProctor = (sess.proctorName || sess.presenterName || '').toLowerCase().includes(q);
      const matchDateStr = getFormattedDateStarted(sess).toLowerCase().includes(q);

      return matchId || matchTitle || matchLab || matchProctor || matchDateStr;
    });

  return (
    <div className="space-y-6 pt-4 pb-12 select-none">
      {/* Top 3-Tab Glassmorphism Navigation Bar */}
      <div className="glass-panel p-2 rounded-2xl flex flex-col sm:flex-row items-center justify-start gap-3 border border-slate-800">
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
            <span>[ Current QR Session ]</span>
          </button>

          <button
            onClick={() => {
              setActiveTab('roster');
              if (selectedSessionId) {
                fetchRoster(selectedSessionId);
              }
            }}
            className={`flex-1 sm:flex-initial px-5 py-2.5 rounded-lg font-bold transition-all cursor-pointer flex items-center justify-center gap-2 ${
              activeTab === 'roster'
                ? 'bg-cyan-500 text-slate-950 shadow-[0_0_15px_rgba(6,182,212,0.4)]'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>[ Current Session Attendance ]</span>
          </button>

          <button
            onClick={() => {
              setActiveTab('history');
              fetchSessions({ preventAutoSelect: true });
            }}
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
      </div>

      {/* TAB 1: ACTIVE SESSION VIEWPORT */}
      {activeTab === 'active' && (
        (!selectedSessionId || isSessionTerminated) ? (
          <div className="glass-panel p-8 sm:p-12 rounded-3xl text-center space-y-4 border border-cyan-500/30 my-6 animate-fadeIn">
            <div className="p-4 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 w-16 h-16 mx-auto flex items-center justify-center shadow-[0_0_25px_rgba(6,182,212,0.2)]">
              <Radio className="w-8 h-8 animate-pulse" />
            </div>
            <div className="space-y-2">
              <h3 className="text-xl sm:text-2xl font-bold font-display text-white">No Active Session Running</h3>
              <p className="text-slate-400 font-mono text-xs max-w-md mx-auto">
                No attendance session is currently active. Please click "+ Create New Session" to initialize a lab or lecture session, then start QR rotation.
              </p>
            </div>
            <button
              onClick={() => {
                setNewLabIdentifier('');
                setNewTitle('');
                setNewPresenterName('');
                setRequireMobile(false);
                setIsCreateModalOpen(true);
              }}
              className="px-6 py-3 rounded-2xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-extrabold text-xs font-mono shadow-[0_0_20px_rgba(6,182,212,0.4)] transition-all cursor-pointer inline-flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              <span>+ Create New Session</span>
            </button>
          </div>
        ) : (
          <div className="space-y-6 animate-fadeIn">
            {/* Active Session Info Header */}
            <div className="glass-panel p-5 rounded-3xl flex flex-col md:flex-row md:items-center justify-between gap-4 border-l-4 border-l-cyan-500">
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-xs font-mono text-cyan-400">
                  <span className="font-bold text-white uppercase">{selectedSessionId}</span>
                  <span>•</span>
                  <span>{activeSessionObj?.labIdentifier || qrData?.labIdentifier || 'Lab Room'}</span>
                  <span>•</span>
                  <span>{activeSessionObj?.proctorName || qrData?.proctorName || 'Faculty In-Charge'}</span>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <h2 className="font-display font-extrabold text-xl sm:text-2xl text-white">
                    {activeSessionObj?.title || qrData?.title || 'Attendance Session'}
                  </h2>
                  {isSessionTerminated && (
                    <span className="px-3 py-1 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/30 text-xs font-mono font-bold">
                      TERMINATED (READ-ONLY)
                    </span>
                  )}
                </div>
                {activeSessionObj?.createdAt && (
                  <div className="text-[11px] font-mono text-slate-400">
                    Session Held: {new Date(activeSessionObj.createdAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
                  </div>
                )}
              </div>

              {/* Session Lifecycle Buttons */}
              <div className="flex items-center gap-3">
                {isSessionTerminated ? (
                  <div className="px-4 py-2.5 rounded-2xl bg-slate-900 border border-slate-800 text-rose-300 font-mono text-xs font-bold flex items-center gap-2 shadow-sm">
                    <X className="w-4 h-4 text-rose-400" />
                    <span>Session Ended (Archived)</span>
                  </div>
                ) : (
                  <>
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
                  </>
                )}
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
              <div className="relative w-full max-w-md p-5 sm:p-6 bg-slate-950/90 rounded-3xl border-2 border-cyan-500/40 shadow-[0_0_45px_rgba(6,182,212,0.28)] flex flex-col items-center justify-center transition-transform hover:scale-[1.01]">
                <div className="scanline"></div>

                {!isSessionActive ? (
                  <div className="w-[280px] h-[280px] sm:w-[340px] sm:h-[340px] bg-slate-900 rounded-2xl flex flex-col items-center justify-center p-6 text-center space-y-3 border border-amber-500/30">
                    <Pause className="w-12 h-12 text-amber-400 animate-pulse" />
                    <h4 className="font-bold text-amber-300 font-display">SESSION PAUSED</h4>
                    <p className="text-[11px] text-slate-400 font-mono">Click "Start Session" above to activate 60s rotation loop.</p>
                  </div>
                ) : (
                  <div className="bg-white p-4 sm:p-5 rounded-3xl shadow-inner border-2 border-white flex items-center justify-center">
                    <QRCodeSVG
                      value={qrCodeValue}
                      size={340}
                      level="L"
                      includeMargin={true}
                      className="w-[280px] h-[280px] sm:w-[340px] sm:h-[340px] max-w-full aspect-square block"
                    />
                  </div>
                )}

                <div className="mt-3 flex flex-col items-center justify-center gap-1">
                  <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-900/90 border border-cyan-500/30 text-xs font-mono shadow-[0_0_12px_rgba(6,182,212,0.15)]">
                    <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse"></span>
                    <span className="text-slate-400 font-sans">By</span>
                    <span className="text-cyan-300 font-bold tracking-wide">Aryan Kale</span>
                  </div>
                </div>
              </div>

              {/* Fullscreen Projector Mode Trigger */}
              <button
                onClick={enterProjectorMode}
                disabled={!isSessionActive || isSessionTerminated}
                className="w-full py-3 rounded-2xl text-xs font-bold bg-indigo-600/30 hover:bg-indigo-600/40 text-indigo-200 border border-indigo-500/50 shadow-[0_0_20px_rgba(99,102,241,0.3)] transition-all cursor-pointer flex items-center justify-center gap-2 disabled:opacity-40 group"
                title="Open Projector Mode (Press 'F')"
              >
                <Maximize className="w-4 h-4 text-indigo-400 group-hover:scale-110 transition-transform" />
                <span>Fullscreen Projector Mode</span>
                <kbd className="hidden sm:inline-block px-1.5 py-0.5 rounded bg-indigo-950/80 border border-indigo-500/40 text-[10px] font-mono text-indigo-300 font-semibold shadow-inner">
                  F
                </kbd>
              </button>

              {/* Countdown Progress Ring */}
              <div className="w-full space-y-2 my-2">
                <div className="flex items-center justify-between text-xs font-mono">
                  <span className="text-slate-400 flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5 text-cyan-400" /> Time Remaining
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
              {/* Classroom Geofence & GPS Controls Card */}
              <div className="glass-panel p-5 rounded-3xl space-y-4 border-l-4 border-l-cyan-500">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2 text-cyan-400 font-display font-semibold text-sm">
                    <MapPin className="w-4 h-4" />
                    <span>Classroom Geofence & GPS</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleToggleGeofence}
                      className={`text-[11px] font-mono font-bold px-3 py-1 rounded-full border transition-all ${
                        isGeofenceEnabled
                          ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 hover:bg-emerald-500/30'
                          : 'bg-amber-500/20 text-amber-300 border-amber-500/40 hover:bg-amber-500/30'
                      }`}
                    >
                      {isGeofenceEnabled ? '🛡️ ENFORCED' : '🌐 BYPASS ANYWHERE'}
                    </button>
                    <span className="text-xs font-mono font-bold px-3 py-1 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                      {geofenceRadius}m RADIUS
                    </span>
                  </div>
                </div>

                {/* Status and Calibration Button */}
                <div className="bg-slate-950/60 rounded-2xl p-3 border border-slate-800 space-y-2.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-400 font-mono text-[11px]">Classroom Anchor:</span>
                    {qrData?.isCalibrated || (qrData?.latitude && qrData?.latitude !== 28.6139) ? (
                      <span className="text-[10px] font-mono text-emerald-400 flex items-center gap-1 font-semibold">
                        <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                        {qrData?.latitude ? `${Number(qrData.latitude).toFixed(4)}, ${Number(qrData.longitude).toFixed(4)}` : 'Calibrated'}
                      </span>
                    ) : (
                      <span className="text-[10px] font-mono text-cyan-400 flex items-center gap-1">
                        <Sparkles className="w-3 h-3 text-cyan-400" />
                        Auto-anchors on first scan
                      </span>
                    )}
                  </div>

                  <button
                    type="button"
                    disabled={isCalibratingLocation || !selectedSessionId}
                    onClick={handleCalibrateLocation}
                    className="w-full py-2 px-3 rounded-xl bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 text-cyan-300 font-mono text-xs flex items-center justify-center gap-2 transition-all active:scale-[0.98] disabled:opacity-50"
                  >
                    {isCalibratingLocation ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin text-cyan-400" />
                        <span>Locking Device GPS...</span>
                      </>
                    ) : (
                      <>
                        <MapPin className="w-3.5 h-3.5 text-cyan-400" />
                        <span>📍 Calibrate Classroom GPS</span>
                      </>
                    )}
                  </button>
                </div>

                {/* Slider */}
                <div className="space-y-3 font-mono text-xs">
                  <div className="flex justify-between items-center text-slate-300 text-[11px]">
                    <span className="font-semibold">Allowed Distance Boundary</span>
                    <div className="flex items-center gap-1.5 bg-slate-900/90 px-2.5 py-1 rounded-xl border border-slate-800 focus-within:border-cyan-500/60 transition-all shadow-sm">
                      <input
                        type="number"
                        min="15"
                        max="500"
                        step="5"
                        value={geofenceRadius}
                        disabled={!isGeofenceEnabled}
                        onChange={(e) => handleRadiusChange(e.target.value)}
                        onBlur={handleRadiusCommit}
                        className="w-12 bg-transparent text-cyan-400 font-bold font-mono text-xs text-right outline-none disabled:opacity-50"
                      />
                      <span className="text-cyan-400/80 font-mono text-xs font-semibold">meters</span>
                    </div>
                  </div>

                  {/* Range Slider with dynamic filled gradient track */}
                  <div className="relative py-1">
                    <input
                      type="range"
                      min="15"
                      max="500"
                      step="5"
                      value={geofenceRadius}
                      disabled={!isGeofenceEnabled}
                      onChange={(e) => handleRadiusChange(e.target.value)}
                      onPointerUp={handleRadiusCommit}
                      onMouseUp={handleRadiusCommit}
                      onTouchEnd={handleRadiusCommit}
                      style={{
                        background: isGeofenceEnabled
                          ? `linear-gradient(to right, #06b6d4 0%, #06b6d4 ${Math.min(100, Math.max(0, ((geofenceRadius - 15) / 485) * 100))}%, #1e293b ${Math.min(100, Math.max(0, ((geofenceRadius - 15) / 485) * 100))}%, #1e293b 100%)`
                          : '#1e293b',
                      }}
                      className={`geofence-slider ${
                        isGeofenceEnabled ? '' : 'opacity-40 cursor-not-allowed'
                      }`}
                    />
                  </div>

                  {/* Quick Select Preset Chips */}
                  <div className="grid grid-cols-5 gap-1.5 pt-1">
                    {[
                      { val: 15, label: '15m', desc: 'Lab' },
                      { val: 30, label: '30m', desc: 'Room' },
                      { val: 75, label: '75m', desc: 'Hall' },
                      { val: 200, label: '200m', desc: 'Wing' },
                      { val: 500, label: '500m', desc: 'Campus' },
                    ].map((preset) => {
                      const isSelected = geofenceRadius === preset.val;
                      return (
                        <button
                          key={preset.val}
                          type="button"
                          disabled={!isGeofenceEnabled}
                          onClick={() => {
                            handleRadiusChange(preset.val);
                            commitGeofenceRadius(preset.val);
                          }}
                          className={`py-1.5 px-0.5 rounded-xl text-[10px] font-mono border transition-all text-center cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                            isSelected
                              ? 'bg-cyan-500/25 border-cyan-400 text-cyan-200 font-bold shadow-[0_0_12px_rgba(6,182,212,0.3)] scale-[1.02]'
                              : 'bg-slate-900/80 hover:bg-slate-800 border-slate-800 text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          <span className="font-bold">{preset.label}</span>
                          <span className="text-[8px] opacity-75 ml-0.5">({preset.desc})</span>
                        </button>
                      );
                    })}
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
      )
    )}

      {/* TAB 2: CURRENT SESSION ATTENDANCE */}
      {activeTab === 'roster' && (
        !selectedSessionId ? (
          <div className="glass-panel p-8 sm:p-12 rounded-3xl text-center space-y-4 border border-cyan-500/30 my-6 animate-fadeIn">
            <div className="p-4 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 w-16 h-16 mx-auto flex items-center justify-center shadow-[0_0_25px_rgba(6,182,212,0.2)]">
              <Users className="w-8 h-8" />
            </div>
            <div className="space-y-2">
              <h3 className="text-xl sm:text-2xl font-bold font-display text-white">No Attendance Roster Selected</h3>
              <p className="text-slate-400 font-mono text-xs max-w-md mx-auto">
                No active or historical session is currently selected. Please create a new session or choose one from Session History.
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-6 animate-fadeIn">
            {/* Active Session Attendance Banner & Selector */}
            <div className="glass-panel p-5 rounded-3xl flex flex-col md:flex-row md:items-center justify-between gap-4 border-l-4 border-l-cyan-500">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-2xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
                  <Users className="w-5 h-5" />
                </div>
                <div className="space-y-0.5">
                  <div className="text-xs font-mono text-cyan-400 font-bold flex items-center gap-2">
                    <span className="bg-slate-900 px-2 py-0.5 rounded border border-slate-800 text-white">{selectedSessionId}</span>
                    <span>•</span>
                    <span>{activeSessionObj?.labIdentifier || qrData?.labIdentifier || 'Lab Room'}</span>
                  </div>
                  <h3 className="text-lg font-bold text-white font-display">
                    {activeSessionObj?.title || qrData?.title || 'Current Session Attendance Roster'}
                  </h3>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row items-center gap-3 w-full md:w-auto">
                <div className="w-full sm:w-auto flex items-center gap-2">
                  <span className="text-xs font-mono text-slate-400 whitespace-nowrap">Session:</span>
                  <select
                    value={selectedSessionId}
                    onChange={(e) => handleSelectSession(e.target.value)}
                    className="w-full sm:w-auto px-3.5 py-2 rounded-xl glass-input text-xs font-mono text-cyan-300 bg-slate-900 border border-slate-700"
                  >
                    {sessionsList.map((s) => (
                      <option key={s.sessionId} value={s.sessionId}>
                        {s.sessionId} — {s.labIdentifier} ({s.title})
                      </option>
                    ))}
                  </select>
                </div>

                <button
                  onClick={() => handleExportExcel(selectedSessionId)}
                  className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-xs font-mono font-bold transition-all cursor-pointer shadow-[0_0_15px_rgba(16,185,129,0.15)]"
                >
                  <FileSpreadsheet className="w-4 h-4" />
                  <span>Download Excel</span>
                </button>
              </div>
            </div>

            {/* Search Bar + Filters + Manual Intake Trigger */}
            <div className="glass-panel p-5 rounded-3xl space-y-4">
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
                <div className="relative w-full sm:w-80">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search Name, Reg No, Email..."
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
                    <th className="p-4">Reg No</th>
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
      )
    )}

      {/* TAB 3: SESSION HISTORY */}
      {activeTab === 'history' && (
        <div className="space-y-6 animate-fadeIn">
          <div className="glass-panel p-6 rounded-3xl space-y-5">
            {/* Header with Title & Stats Count */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-4">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
                  <History className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-display font-bold text-lg text-white">Session History</h3>
                  <p className="text-slate-400 text-xs font-mono">
                    Complete chronological log of all lecture & lab attendance sessions
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs font-mono px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-300">
                  Showing <strong className="text-cyan-400">{sortedAndFilteredHistory.length}</strong> of {sessionsList.length} sessions
                </span>
              </div>
            </div>

            {/* Search, Date & Status Filter Controls */}
            <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3 font-mono text-xs">
              {/* Search Input */}
              <div className="relative flex-1 max-w-sm">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                <input
                  type="text"
                  value={historySearchQuery}
                  onChange={(e) => setHistorySearchQuery(e.target.value)}
                  placeholder="Search Session ID, Title, Room, Date..."
                  className="w-full pl-10 pr-8 py-2.5 rounded-xl glass-input text-xs font-mono text-slate-200"
                />
                {historySearchQuery && (
                  <button
                    onClick={() => setHistorySearchQuery('')}
                    className="absolute right-2.5 top-2.5 p-0.5 rounded text-slate-400 hover:text-white cursor-pointer"
                    title="Clear search"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Filters: Date Picker + Status Filter + Reset */}
              <div className="flex flex-wrap items-center gap-2.5 justify-start lg:justify-end">
                {/* Date Filter */}
                <div className="flex items-center gap-1.5 bg-slate-900 border border-slate-700 rounded-xl px-2.5 py-1.5 text-slate-300">
                  <Calendar className="w-3.5 h-3.5 text-cyan-400" />
                  <span className="text-[11px] text-slate-400">Date:</span>
                  <input
                    type="date"
                    value={historyDateFilter}
                    onChange={(e) => setHistoryDateFilter(e.target.value)}
                    className="bg-transparent text-xs text-slate-200 font-mono outline-none cursor-pointer"
                  />
                  {historyDateFilter && (
                    <button
                      onClick={() => setHistoryDateFilter('')}
                      className="p-0.5 rounded text-slate-400 hover:text-white cursor-pointer"
                      title="Clear date filter"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {/* Status Filter */}
                <div className="flex items-center gap-1.5">
                  <select
                    value={historyStatusFilter}
                    onChange={(e) => setHistoryStatusFilter(e.target.value)}
                    className="px-3.5 py-2.5 rounded-xl glass-input text-xs font-mono text-slate-200 bg-slate-900 border border-slate-700 cursor-pointer"
                  >
                    <option value="ALL">All Statuses ({sessionsList.length})</option>
                    <option value="ACTIVE">Active Sessions</option>
                    <option value="PAUSED">Paused Sessions</option>
                    <option value="TERMINATED">Terminated Sessions</option>
                  </select>
                </div>

                {/* Reset Filters */}
                {(historySearchQuery || historyDateFilter || historyStatusFilter !== 'ALL') && (
                  <button
                    onClick={() => {
                      setHistorySearchQuery('');
                      setHistoryDateFilter('');
                      setHistoryStatusFilter('ALL');
                    }}
                    className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-cyan-400 border border-slate-700 text-xs font-mono font-semibold cursor-pointer transition-colors"
                  >
                    Reset
                  </button>
                )}
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs font-mono">
                <thead>
                  <tr className="bg-slate-900/90 text-slate-400 border-b border-slate-800">
                    <th className="p-4">Session ID</th>
                    <th className="p-4">Lab / Room</th>
                    <th className="p-4">Session Title</th>
                    <th className="p-4">Faculty / Instructor</th>
                    <th className="p-4">Total Attendees</th>
                    <th className="p-4">Status</th>
                    <th className="p-4">Date Started</th>
                    <th className="p-4">Date Ended</th>
                    <th className="p-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {sortedAndFilteredHistory.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="p-8 text-center text-slate-500 font-mono">
                        No sessions found matching the search or filter criteria.
                      </td>
                    </tr>
                  ) : (
                    sortedAndFilteredHistory.map((sess) => (
                      <tr
                        key={sess.sessionId}
                        onClick={() => handleViewHistoricalSession(sess.sessionId)}
                        className="hover:bg-slate-900/60 transition-colors cursor-pointer group"
                      >
                        <td className="p-4 font-bold text-cyan-300 font-mono group-hover:text-cyan-200">
                          {sess.sessionId}
                        </td>
                        <td className="p-4 text-slate-200 font-mono">{sess.labIdentifier}</td>
                        <td className="p-4 font-bold text-white font-sans">{sess.title}</td>
                        <td className="p-4 text-slate-300 font-sans">{sess.proctorName || sess.presenterName || 'Faculty In-Charge'}</td>
                        <td className="p-4 font-bold text-emerald-400">{sess.totalAttendees || 0}</td>
                        <td className="p-4">
                          <span
                            className={`px-2.5 py-1 rounded-full text-[10px] font-bold border ${
                              sess._isTerminated
                                ? 'bg-rose-500/15 text-rose-300 border-rose-500/30'
                                : sess.status === 'ACTIVE'
                                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                                : 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                            }`}
                          >
                            {sess._isTerminated ? 'TERMINATED' : sess.status}
                          </span>
                        </td>
                        <td className="p-4 text-slate-400">
                          {getFormattedDateStarted(sess)}
                        </td>
                        <td className="p-4 text-slate-400">
                          {sess.endedAt || sess.terminatedAt
                            ? new Date(sess.endedAt || sess.terminatedAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })
                            : sess._isTerminated
                            ? 'Terminated'
                            : 'Active / In Progress'}
                        </td>
                        <td className="p-4 text-right" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => handleViewHistoricalSession(sess.sessionId)}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 text-xs font-mono font-semibold transition-all cursor-pointer shadow-sm"
                              title="View Session Attendance Dashboard"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              <span>View Attendance</span>
                            </button>
                            <button
                              onClick={() => handleExportExcel(sess.sessionId)}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-xs font-mono font-semibold transition-all cursor-pointer shadow-sm"
                              title="Download Formatted Excel Attendance Sheet"
                            >
                              <FileSpreadsheet className="w-3.5 h-3.5" />
                              <span>Download Sheet</span>
                            </button>
                            <button
                              onClick={() => handleDeleteSession(sess.sessionId, sess.title)}
                              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/25 text-rose-400 hover:text-rose-300 border border-rose-500/30 text-xs font-mono font-semibold transition-all cursor-pointer shadow-sm"
                              title="Permanently Delete Session & Attendance"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              <span className="hidden sm:inline">Delete</span>
                            </button>
                          </div>
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

      {/* FULLSCREEN PROJECTOR OVERLAY MODE */}
      {isProjectorMode && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[999999] w-screen h-screen bg-slate-950 text-white flex flex-col justify-between p-4 sm:p-6 lg:p-8 select-none overflow-hidden animate-fadeIn">
          {/* Subtle ambient glow backdrop */}
          <div className="absolute -top-32 -left-32 w-80 h-80 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none"></div>
          <div className="absolute -bottom-32 -right-32 w-80 h-80 bg-blue-500/10 rounded-full blur-3xl pointer-events-none"></div>

          {/* Top Bar: Session Info & Controls */}
          <div className="w-full max-w-7xl mx-auto flex items-center justify-between gap-4 z-10">
            <div className="flex items-center gap-3">
              <div className="p-2 sm:p-2.5 rounded-2xl bg-cyan-500/15 border border-cyan-500/30 text-cyan-400">
                <Radio className="w-5 h-5 animate-pulse" />
              </div>
              <div>
                <div className="flex items-center gap-2 text-xs font-mono text-cyan-400">
                  <span className="font-bold text-white tracking-wider uppercase">{selectedSessionId}</span>
                  {activeSessionObj?.labIdentifier && (
                    <>
                      <span>•</span>
                      <span className="text-slate-300">{activeSessionObj.labIdentifier}</span>
                    </>
                  )}
                  {activeSessionObj?.proctorName && (
                    <>
                      <span className="hidden sm:inline">•</span>
                      <span className="text-slate-400 hidden sm:inline">{activeSessionObj.proctorName}</span>
                    </>
                  )}
                </div>
                <h1 className="font-display font-extrabold text-base sm:text-xl text-white tracking-tight">
                  {activeSessionObj?.title || qrData?.title || selectedSessionId || 'Attendance Session'}
                </h1>
              </div>
            </div>

            <div className="flex items-center gap-2 sm:gap-3">
              <button
                type="button"
                onClick={forceRotateQR}
                disabled={!isSessionActive}
                className="px-3 py-2 rounded-xl bg-slate-900/90 hover:bg-slate-800 text-slate-300 border border-slate-800 text-xs font-mono flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-40"
                title="Force New QR Rotation"
              >
                <RotateCw className="w-3.5 h-3.5 text-cyan-400" />
                <span className="hidden sm:inline">Rotate QR</span>
              </button>

              <button
                type="button"
                onClick={exitProjectorMode}
                className="px-3.5 py-2 rounded-xl bg-slate-900/90 hover:bg-rose-500/20 hover:text-rose-300 hover:border-rose-500/30 text-slate-300 border border-slate-800 text-xs font-mono font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-lg"
                title="Exit Fullscreen (Esc)"
              >
                <Minimize className="w-4 h-4 text-rose-400" />
                <span>Exit Fullscreen</span>
                <kbd className="hidden sm:inline px-1 py-0.5 rounded bg-slate-950 text-[10px] text-slate-400 border border-slate-700">ESC</kbd>
              </button>
            </div>
          </div>

          {/* Center Hero Stage: BIGGEST QR CODE & CIRCULAR 60S LOOP COUNTDOWN */}
          <div className="flex-1 flex flex-col lg:flex-row items-center justify-center gap-8 lg:gap-14 my-auto w-full max-w-7xl mx-auto z-10 px-2">
            {/* BIGGEST QR CODE CONTAINER */}
            <div className="bg-white p-4 sm:p-7 rounded-[32px] sm:rounded-[44px] shadow-[0_0_100px_rgba(6,182,212,0.4)] border-4 sm:border-8 border-white flex items-center justify-center max-w-[85vw] max-h-[76vh] aspect-square transition-transform hover:scale-[1.008]">
              {!isSessionActive ? (
                <div className="w-[60vmin] h-[60vmin] max-w-[520px] max-h-[520px] bg-slate-900 rounded-3xl flex flex-col items-center justify-center p-8 text-center space-y-4">
                  <Pause className="w-16 h-16 text-amber-400 animate-pulse" />
                  <h3 className="font-display font-bold text-2xl text-amber-300">SESSION PAUSED</h3>
                  <p className="text-xs font-mono text-slate-400">QR code rotation is paused.</p>
                </div>
              ) : (
                <QRCodeSVG
                  value={qrCodeValue}
                  size={640}
                  level="L"
                  includeMargin={false}
                  className="w-full h-full max-w-[72vh] max-h-[72vh] aspect-square block"
                />
              )}
            </div>

            {/* CIRCULAR LOOP 60-SECOND COUNTDOWN TIMER */}
            <div className="flex flex-col items-center justify-center space-y-4 flex-shrink-0">
              {/* Circular Progress Ring */}
              <div className="relative flex items-center justify-center">
                <svg className="w-36 h-36 sm:w-44 sm:h-44 -rotate-90 transform" viewBox="0 0 120 120">
                  {/* Background Track */}
                  <circle
                    cx="60"
                    cy="60"
                    r="50"
                    className="stroke-slate-800"
                    strokeWidth="8"
                    fill="transparent"
                  />
                  {/* Glowing 60s Animated Circular Loop */}
                  <circle
                    cx="60"
                    cy="60"
                    r="50"
                    className={`transition-all duration-1000 ease-linear ${
                      safeCountdown <= 10
                        ? 'stroke-rose-500 drop-shadow-[0_0_15px_rgba(244,63,94,0.9)]'
                        : 'stroke-cyan-400 drop-shadow-[0_0_15px_rgba(6,182,212,0.85)]'
                    }`}
                    strokeWidth="8"
                    strokeDasharray={314.16}
                    strokeDashoffset={314.16 * (1 - Math.max(0, Math.min(60, safeCountdown)) / 60)}
                    strokeLinecap="round"
                    fill="transparent"
                  />
                </svg>

                {/* Center Countdown Display */}
                <div className="absolute flex flex-col items-center justify-center text-center">
                  <span
                    className={`font-mono font-black text-4xl sm:text-5xl tracking-tighter ${
                      safeCountdown <= 10 ? 'text-rose-400 animate-pulse' : 'text-cyan-400'
                    }`}
                  >
                    {!isSessionActive ? 'PAUSED' : safeCountdown}
                  </span>
                  {isSessionActive && (
                    <span className="text-[10px] sm:text-xs font-mono text-slate-400 uppercase tracking-widest font-bold">
                      SEC
                    </span>
                  )}
                </div>
              </div>

              {/* Status Details */}
              <div className="text-center space-y-1">
                <div className="text-xs sm:text-sm font-mono font-bold text-cyan-300 tracking-wider uppercase">
                  60s Auto-Rotate Loop
                </div>
                <div className="text-[11px] font-mono text-slate-400">
                  1 Device • 1 Submission
                </div>
              </div>

              {/* Aryan Kale signature badge */}
              <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-900/90 border border-cyan-500/30 text-xs font-mono shadow-[0_0_12px_rgba(6,182,212,0.15)]">
                <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse"></span>
                <span className="text-slate-400 font-sans">By</span>
                <span className="text-cyan-300 font-bold tracking-wide">Aryan Kale</span>
              </div>
            </div>
          </div>

          {/* Bottom Bar: Instructions & Attendees Count */}
          <div className="w-full max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2 border-t border-slate-800/80 pt-3 text-xs font-mono text-slate-400 z-10">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
              <span className="text-emerald-400 font-semibold">LIVE ATTENDANCE ACTIVE</span>
              <span>•</span>
              <span>{attendeesRoster.length} recorded</span>
            </div>
            <div className="text-[11px] text-slate-500">
              Point phone camera at the QR code • Press <kbd className="px-1 py-0.5 rounded bg-slate-900 border border-slate-700 text-slate-300">F</kbd> or <kbd className="px-1 py-0.5 rounded bg-slate-900 border border-slate-700 text-slate-300">Esc</kbd> to exit fullscreen
            </div>
          </div>
        </div>,
        document.body
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
                  placeholder="e.g. CN Lab, Lab 101, Audi-2"
                  required
                  className="w-full px-4 py-2.5 rounded-xl glass-input text-cyan-300 font-mono"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-slate-300 font-semibold block">Session / Course Title</label>
                <input
                  type="text"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="e.g. Computer Networks Practical, CS301 Lecture"
                  required
                  className="w-full px-4 py-2.5 rounded-xl glass-input text-slate-200 font-sans"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-slate-300 font-semibold block">Faculty / Instructor Name</label>
                <input
                  type="text"
                  value={newPresenterName}
                  onChange={(e) => setNewPresenterName(e.target.value)}
                  placeholder="e.g. Dr. Alan Turing / Prof. Smith"
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
                  disabled={isCreatingSession}
                  className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-bold font-display shadow-[0_0_20px_rgba(6,182,212,0.4)] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer flex items-center gap-2"
                >
                  {isCreatingSession ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Creating Session...</span>
                    </>
                  ) : (
                    <span>Initialize Session</span>
                  )}
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
              <span>Confirm End Session</span>
            </div>

            <p className="text-xs font-mono text-slate-300 leading-relaxed">
              Are you sure you want to end this session? Once terminated, it cannot be resumed or reopened.
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
                className="px-6 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 font-bold text-white shadow-[0_0_20px_rgba(244,63,94,0.4)] cursor-pointer"
              >
                End Session
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
                  <label className="text-slate-300 font-semibold block">Reg No</label>
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
                  <label className="text-slate-300 font-semibold block">Reg No</label>
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

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-slate-300 font-semibold block">Academic Year</label>
                  <select
                    value={editYear}
                    onChange={(e) => setEditYear(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl glass-input text-slate-200"
                  >
                    {!YEARS.includes(editYear) && editYear && (
                      <option value={editYear}>{editYear}</option>
                    )}
                    {YEARS.map((yr) => (
                      <option key={yr} value={yr}>
                        {yr}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-slate-300 font-semibold block">Department Name</label>
                  <select
                    value={editBranch}
                    onChange={(e) => setEditBranch(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl glass-input text-slate-200"
                  >
                    {!DEPARTMENTS.includes(editBranch) && editBranch && (
                      <option value={editBranch}>{editBranch}</option>
                    )}
                    {DEPARTMENTS.map((dept) => (
                      <option key={dept} value={dept}>
                        {dept}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-slate-300 font-semibold block">Mandatory Edit Reason</label>
                <input
                  type="text"
                  value={editReason}
                  onChange={(e) => setEditReason(e.target.value)}
                  placeholder="e.g. Typo in Reg No, Wrong Department Selected"
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
