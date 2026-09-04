import React, { Component } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Navbar from './components/Navbar';
import AdminDashboard from './components/AdminDashboard';
import StudentScanner from './components/StudentScanner';
import AdminAuth from './components/AdminAuth';
import { SocketProvider } from './context/SocketContext';
import { ThemeProvider } from './context/ThemeContext';

/**
 * Global Error Boundary to catch any unexpected runtime component crashes
 * and silently recover directly to the Admin Authentication portal.
 */
class GlobalErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    console.error('[GlobalErrorBoundary] Caught rendering error:', error, errorInfo);
    try {
      localStorage.removeItem('admin_token');
      localStorage.removeItem('admin_user');
      sessionStorage.clear();
    } catch (e) {}
  }

  render() {
    if (this.state.hasError) {
      return <AdminAuth />;
    }
    return this.props.children;
  }
}

/**
 * Protected Route Wrapper for Admin Console Dashboard
 */
function ProtectedAdminRoute({ children }) {
  try {
    const token = localStorage.getItem('admin_token');
    if (!token || token === 'undefined' || token === 'null' || token === 'token_faculty_direct_access') {
      localStorage.removeItem('admin_token');
      localStorage.removeItem('admin_user');
      return <Navigate to="/admin/login" replace />;
    }
    return children;
  } catch (err) {
    console.warn('[ProtectedAdminRoute] Token verification error:', err);
    try {
      localStorage.removeItem('admin_token');
      localStorage.removeItem('admin_user');
      sessionStorage.clear();
    } catch (e) {}
    return <Navigate to="/admin/login" replace />;
  }
}

export default function App() {
  return (
    <GlobalErrorBoundary>
      <ThemeProvider>
        <SocketProvider>
          <Router>
            <div className="min-h-screen bg-slate-950 text-slate-100 font-sans selection:bg-cyan-500 selection:text-slate-950 transition-colors">
              <Navbar />

              <main className="container mx-auto pb-12">
                <Routes>
                  <Route path="/admin/login" element={<AdminAuth />} />
                  <Route path="/faculty/login" element={<Navigate to="/admin/login" replace />} />

                  <Route
                    path="/"
                    element={
                      <ProtectedAdminRoute>
                        <AdminDashboard />
                      </ProtectedAdminRoute>
                    }
                  />

                  <Route
                    path="/admin"
                    element={
                      <ProtectedAdminRoute>
                        <AdminDashboard />
                      </ProtectedAdminRoute>
                    }
                  />

                  <Route path="/scan" element={<StudentScanner />} />

                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
              </main>
            </div>
          </Router>
        </SocketProvider>
      </ThemeProvider>
    </GlobalErrorBoundary>
  );
}
