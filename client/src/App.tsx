import { useEffect, useState } from 'react';
import Layout from './components/Layout';
import Dashboard from './components/Dashboard';
import EmailProcessing from './components/EmailProcessing';
import SitesPage from './components/SitesPage';
import DepartmentsPage from './components/DepartmentsPage';
import EquipmentPage from './components/EquipmentPage';
import TechniciansPage from './components/TechniciansPage';
import EmployeesPage from './components/EmployeesPage';
import MaintenanceTasksPage from './components/MaintenanceTasksPage';
import SchedulesPage from './components/SchedulesPage';
import NotificationsPage from './components/NotificationsPage';
import CalendarPage from './components/CalendarPage';
import SettingsPage from './components/SettingsPage';
import UsersPage from './components/UsersPage';
import LoginPage from './pages/LoginPage';

interface SessionUser {
  id: number;
  email: string;
  name: string;
  role: string;
  allowed_departments: string[];
  allowed_item_types: string[];
  allowed_categories: string[];
}

export type DocExpiryTile = 'all' | 'expired' | 'expiring7' | 'expiring30' | 'expiring90' | 'notSoon';

export interface NavFilter {
  tab?: 'equipment' | 'documents' | 'vehicles';
  docExpiryTile?: DocExpiryTile;
  taskDayTile?: string;
  taskDocTile?: string;
  taskStatus?: string;
  vehicleId?: number;
}

// Pages gated by item type - any page not listed here is open to every
// logged-in user regardless of permissions. 'users' is admin-only. Vehicles
// live inside the 'equipment' page's own Vehicles tab (there's no standalone
// vehicles page/route any more), so no separate entry is needed for them.
// An empty allowed_item_types means "no restriction" (matches
// routes/dashboard.js's buildPermissionConditions).
const ITEM_TYPE_GATED_PAGES: Record<string, string> = {
  equipment: 'Equipment',
};

function hasPageAccess(page: string, user: SessionUser): boolean {
  if (user.role === 'admin') return true;
  if (page === 'users') return false;
  const requiredItemType = ITEM_TYPE_GATED_PAGES[page];
  if (!requiredItemType) return true;
  const allowedItemTypes = user.allowed_item_types || [];
  if (allowedItemTypes.length === 0) return true;
  return allowedItemTypes.includes(requiredItemType);
}

function App() {
  const [currentPage, setCurrentPage] = useState('dashboard');
  const [authChecked, setAuthChecked] = useState(false);
  const [user, setUser] = useState<SessionUser | null>(null);
  const [employeeFilter, setEmployeeFilter] = useState('');
  const [navFilter, setNavFilter] = useState<NavFilter | null>(null);
  const [accessDeniedMessage, setAccessDeniedMessage] = useState<string | null>(null);

  const handleViewEmployee = (empId: string) => {
    setEmployeeFilter(empId);
    setCurrentPage('employees');
  };

  const handleNavigate = (page: string, filter?: NavFilter) => {
    if (user && !hasPageAccess(page, user)) {
      setCurrentPage('dashboard');
      setNavFilter(null);
      setAccessDeniedMessage("You don't have permission to access that page.");
      return;
    }
    setCurrentPage(page);
    setNavFilter(filter ?? null);
    setAccessDeniedMessage(null);
  };

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
        return <Dashboard onNavigate={handleNavigate} />;
      case 'email':
        return <EmailProcessing />;
      case 'sites':
        return <SitesPage />;
      case 'departments':
        return <DepartmentsPage />;
      case 'equipment':
        return (
          <EquipmentPage
            initialTab={navFilter?.tab}
            initialDocExpiryTile={navFilter?.docExpiryTile}
            initialVehicleId={navFilter?.vehicleId ?? null}
          />
        );
      case 'technicians':
        return <TechniciansPage onViewEmployee={handleViewEmployee} />;
      case 'employees':
        return <EmployeesPage initialSearch={employeeFilter} />;
      case 'tasks':
        return <MaintenanceTasksPage initialFilter={navFilter} onNavigate={handleNavigate} />;
      case 'schedules':
        return <SchedulesPage />;
      case 'notifications':
        return <NotificationsPage />;
      case 'calendar':
        return <CalendarPage />;
      case 'settings':
        return <SettingsPage />;
      case 'users':
        return <UsersPage />;
      default:
        return <Dashboard onNavigate={handleNavigate} />;
    }
  };

  return (
    <Layout
      currentPage={currentPage}
      onNavigate={(page) => handleNavigate(page)}
      onSignOut={handleSignOut}
      role={user.role}
      allowedItemTypes={user.allowed_item_types || []}
    >
      {accessDeniedMessage && (
        <div className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <span>{accessDeniedMessage}</span>
          <button
            onClick={() => setAccessDeniedMessage(null)}
            className="text-red-500 hover:text-red-700 font-medium"
          >
            Dismiss
          </button>
        </div>
      )}
      {renderPage()}
    </Layout>
  );
}

export default App;
