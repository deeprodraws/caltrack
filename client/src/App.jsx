import { useEffect } from 'react';
import { Routes, Route, NavLink } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import FoodLog from './pages/FoodLog';
import Library from './pages/Library';
import Workout from './pages/Workout';
import Physique from './pages/Physique';
import Settings from './pages/Settings';
import Stats from './pages/Stats';

const IconDashboard = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
    <rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
  </svg>
);

const IconLog = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
    <polyline points="14,2 14,8 20,8"/>
    <line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
  </svg>
);

const IconWorkout = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="10" width="2.5" height="4" rx="0.5"/>
    <rect x="19.5" y="10" width="2.5" height="4" rx="0.5"/>
    <rect x="4.5" y="7.5" width="3" height="9" rx="0.5"/>
    <rect x="16.5" y="7.5" width="3" height="9" rx="0.5"/>
    <line x1="7.5" y1="12" x2="16.5" y2="12"/>
  </svg>
);

const IconPhysique = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
    <circle cx="12" cy="13" r="4"/>
  </svg>
);

const IconLibrary = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
    <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
  </svg>
);

const IconStats = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="20" x2="18" y2="10"/>
    <line x1="12" y1="20" x2="12" y2="4"/>
    <line x1="6" y1="20" x2="6" y2="14"/>
    <line x1="3" y1="20" x2="21" y2="20"/>
  </svg>
);

const IconSettings = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3"/>
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
  </svg>
);

// mobileHidden: shown in desktop sidebar but not in mobile bottom nav
const navItems = [
  { to: '/',          end: true, icon: <IconDashboard />, label: 'Home' },
  { to: '/log',                  icon: <IconLog />,       label: 'Log' },
  { to: '/workout',              icon: <IconWorkout />,   label: 'Workout' },
  { to: '/physique',             icon: <IconPhysique />,  label: 'Physique' },
  { to: '/library',              icon: <IconLibrary />,   label: 'Library' },
  { to: '/stats',                icon: <IconStats />,     label: 'Stats' },
  { to: '/settings',             icon: <IconSettings />,  label: 'Settings', mobileHidden: true },
];

export default function App() {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js').catch(() => {});
      });
    }
  }, []);

  return (
    <div className="app-shell">
      {/* Desktop sidebar — shows all items including Settings */}
      <nav className="sidebar">
        <div className="sidebar-logo">
          CalTrack
          <span>Nutrition Tracker</span>
        </div>
        {navItems.map(({ to, end, icon, label }) => (
          <NavLink key={to} to={to} end={end}
            className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
            {icon} {label}
          </NavLink>
        ))}
      </nav>

      <main className="main-content">
        <Routes>
          <Route path="/"         element={<Dashboard />} />
          <Route path="/log"      element={<FoodLog />} />
          <Route path="/workout"  element={<Workout />} />
          <Route path="/physique" element={<Physique />} />
          <Route path="/library"  element={<Library />} />
          <Route path="/stats"    element={<Stats />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </main>

      {/* Mobile bottom nav — 4 items, Settings excluded */}
      <nav className="bottom-nav">
        {navItems.filter(item => !item.mobileHidden).map(({ to, end, icon, label }) => (
          <NavLink key={to} to={to} end={end}
            className={({ isActive }) => `bottom-nav-item ${isActive ? 'active' : ''}`}>
            <span className="bottom-nav-icon">{icon}</span>
            <span className="bottom-nav-label">{label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
