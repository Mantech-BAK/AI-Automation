import { useEffect, useState } from 'react';
import Layout from './components/Layout';
import Dashboard from './components/Dashboard';
import EmailProcessing from './components/EmailProcessing';
import SitesPage from './components/SitesPage';
import EquipmentPage from './components/EquipmentPage';
import TechniciansPage from './components/TechniciansPage';
import MaintenanceTasksPage from './components/MaintenanceTasksPage';
import SchedulesPage from './components/SchedulesPage';
import NotificationsPage from './components/NotificationsPage';
import CalendarPage from './components/CalendarPage';
import SettingsPage from './components/SettingsPage';
import LoginPage from './pages/LoginPage';

interface SessionUser {
  id: number;
  email: string;
  name: string;
  role: string;
}

function App() {
  const [currentPage, setCurrentPage] = useState('dashboard');
  const [authChecked, setAuthChecked] = useState(false);
  const [user, setUser] = useState<SessionUser | null>(null);

  useEffect(() => {
    let cancelled = false;

    fetch('/api/auth/me')
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (!cancelled) {
          setUser(data?.user ?? null);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setUser(null);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setAuthChecked(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const handleLoginSuccess = (loggedInUser: SessionUser) => {
    setUser(loggedInUser);
    setCurrentPage('dashboard');
  };

  const handleSignOut = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } finally {
      setUser(null);
    }
  };

  if (!authChecked) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-[#0f172a]">
        <span className="text-slate-300 text-sm">Loading...</span>
      </div>
    );
  }

  if (!user) {
    return <LoginPage onLoginSuccess={handleLoginSuccess} />;
  }

  const renderPage = () => {
    switch (currentPage) {
      case 'dashboard':
        return <Dashboard onNavigate={setCurrentPage} />;
      case 'email':
        return <EmailProcessing />;
      case 'sites':
        return <SitesPage />;
      case 'equipment':
        return <EquipmentPage />;
      case 'technicians':
        return <TechniciansPage />;
      case 'tasks':
        return <MaintenanceTasksPage />;
      case 'schedules':
        return <SchedulesPage />;
      case 'notifications':
        return <NotificationsPage />;
      case 'calendar':
        return <CalendarPage />;
      case 'settings':
        return <SettingsPage />;
      default:
        return <Dashboard onNavigate={setCurrentPage} />;
    }
  };

  return (
    <Layout currentPage={currentPage} onNavigate={setCurrentPage} onSignOut={handleSignOut}>
      {renderPage()}
    </Layout>
  );
}

export default App;
