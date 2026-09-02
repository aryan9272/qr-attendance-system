import React, { Component } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Navbar from './components/Navbar';
import FacultyQRDisplay from './components/FacultyQRDisplay';
import StudentScanner from './components/StudentScanner';
import FacultyAuth from './components/FacultyAuth';
import { SocketProvider } from './context/SocketContext';
import { ThemeProvider } from './context/ThemeContext';

/**
 * Global Error Boundary to catch any unexpected runtime component crashes
 * and silently recover directly to the Faculty Authentication form.
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
      localStorage.clear();
      sessionStorage.clear();
    } catch (e) {
      // Ignore
    }
  }

  render() {
    if (this.state.hasError) {
      return <FacultyAuth />;
    }
    return this.props.children;
  }
}

/**
 * Protected Route Wrapper for Faculty Dashboard
 */
function ProtectedFacultyRoute({ children }) {
  try {
    const token = localStorage.getItem('faculty_token');
    if (!token || token === 'undefined' || token === 'null' || token === 'token_faculty_direct_access') {
      localStorage.removeItem('faculty_token');
      localStorage.removeItem('faculty_user');
      return <Navigate to="/faculty/login" replace />;
    }
    return children;
  } catch (err) {
    console.warn('[ProtectedFacultyRoute] Token verification error:', err);
    try {
      localStorage.clear();
      sessionStorage.clear();
    } catch (e) {}
    return <Navigate to="/faculty/login" replace />;
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
                  <Route path="/faculty/login" element={<FacultyAuth />} />

                  <Route
                    path="/"
                    element={
                      <ProtectedFacultyRoute>
                        <FacultyQRDisplay />
                      </ProtectedFacultyRoute>
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
