import { BrowserRouter, Routes, Route, NavLink, useLocation, Navigate } from 'react-router-dom'
import { ToastProvider } from './components/Toast'
import { AuthProvider, useAuth } from './lib/AuthContext'
import LoginPage from './pages/LoginPage'
import HomePage from './pages/HomePage'
import ItemsPage from './pages/ItemsPage'
import ScanPage from './pages/ScanPage'
import DashboardPage from './pages/DashboardPage'

// Loading spinner shown while session is being fetched
function LoadingScreen() {
  return (
    <div style={{
      minHeight: '100vh', background: 'var(--ink)',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', gap: '16px',
    }}>
      <div style={{
        width: 56, height: 56,
        background: 'linear-gradient(135deg, var(--teal), #00a88c)',
        borderRadius: '16px',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: '1.6rem',
        boxShadow: '0 8px 24px rgba(0,201,167,0.3)',
        animation: 'pulse 1.4s ease-in-out infinite',
      }}>🌶️</div>
      <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.85rem' }}>Loading Mayur Masala…</div>
      <style>{`@keyframes pulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.7;transform:scale(0.95)} }`}</style>
    </div>
  )
}

// Requires auth — redirects to /login if not signed in
function ProtectedRoute({ children }) {
  const { session, loading } = useAuth()
  if (loading) return <LoadingScreen />
  if (!session) return <Navigate to="/login" replace />
  return children
}

// Redirect already-authed users away from /login
function PublicRoute({ children }) {
  const { session, loading } = useAuth()
  if (loading) return <LoadingScreen />
  if (session) return <Navigate to="/" replace />
  return children
}

function Nav() {
  const location = useLocation()
  const { user, signOut } = useAuth()

  // Full-screen scanner — no nav
  if (location.pathname === '/scan') return null

  return (
    <nav className="nav">
      <NavLink to="/" className="nav-logo">
        <span style={{ fontSize: '1.1rem' }}>🌶️</span>
        Mayur <span>Masala</span>
      </NavLink>

      <div className="nav-links">
        <NavLink to="/" end className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
          Home
        </NavLink>
        <NavLink to="/items" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
          Items
        </NavLink>
        <NavLink to="/scan" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
          📷 Scan
        </NavLink>
        <NavLink to="/dashboard" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
          Dashboard
        </NavLink>

        {/* User menu */}
        <div style={{ display: 'flex', alignItems: 'center', marginLeft: '8px', paddingLeft: '12px', borderLeft: '1px solid rgba(255,255,255,0.12)', gap: '8px' }}>
          <span style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.4)', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {user?.email}
          </span>
          <button
            onClick={signOut}
            className="nav-link"
            style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.8rem', padding: '6px 10px' }}
          >
            Sign out
          </button>
        </div>
      </div>
    </nav>
  )
}

function AppShell() {
  return (
    <div className="app-shell">
      <Nav />
      <Routes>
        {/* Public */}
        <Route path="/login" element={<PublicRoute><LoginPage /></PublicRoute>} />

        {/* Protected */}
        <Route path="/" element={<ProtectedRoute><HomePage /></ProtectedRoute>} />
        <Route path="/items" element={<ProtectedRoute><ItemsPage /></ProtectedRoute>} />
        <Route path="/scan" element={<ProtectedRoute><ScanPage /></ProtectedRoute>} />
        <Route path="/dashboard" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <AppShell />
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}
