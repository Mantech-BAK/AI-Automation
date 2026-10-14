import { useCallback, useEffect, useState } from 'react';
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
import ModuleSelectPage from './pages/ModuleSelectPage';
import { MODULE_ORDER, allNavItems, isModuleId, type ModuleId } from './lib/modules';

interface SessionUser {
  id: number;
  email: string;
  name: string;
  role: string;
  allowed_departments: string[];
  allowed_item_types: string[];
  allowed_categories: string[];
}

export type DocExpiryTile = 'all' | 'expired' | 'expiring0' | 'expiring7' | 'expiring30' | 'expiring90' | 'notSoon';

// Used by MaintenanceTasksPage.tsx's Equipment tab (its work orders' due
// dates).
export type DayTileFilter = 'overdue' | 'today' | '7' | '15' | '30' | 'all';
// Used by MaintenanceTasksPage.tsx's Documents tab (its work orders' due
// dates, not the underlying document asset's own expiry_date - that's
// docExpiryTile above, used by EquipmentPage.tsx's Documents tab instead).
export type DocTileFilter = 'expired' | 'today' | '7' | '15' | '30' | 'all';
// Used by MaintenanceTasksPage.tsx's Vehicles tab - a vehicle "task" is
// really its own or its documents' due/expiry date, so this reuses the same
// expired/today/7/15/30/all shape as DocTileFilter under its own name for
// clarity at Dashboard.tsx call sites.
export type VehicleTileFilter = DocTileFilter;

export interface NavFilter {
  tab?: 'equipment' | 'documents' | 'vehicles';
  docExpiryTile?: DocExpiryTile;
  taskDayTile?: DayTileFilter;
  taskDocTile?: DocTileFilter;
  vehicleFilter?: VehicleTileFilter;
  taskStatus?: string;
  vehicleId?: number;
  // Pre-seeds EquipmentPage.tsx's site/department filter dropdown (its
  // Equipment and Documents tabs both filter by assets.site_location) - used
  // by SitesPage.tsx and DepartmentsPage.tsx card clicks. Department names
  // are matched against site_location too, same as the existing
  // GET /api/dashboard/departments/:name/tasks endpoint already does.
  site?: string;
}

// Module access follows the user's allowed item types. Vehicles live under the
// Equipment item type (as they did when they were a tab of the Asset page); the
// Documents module needs the Document type. An empty allowed_item_types means
// "no restriction" (matches routes/dashboard.js's buildPermissionConditions).
function hasModuleAccess(module: ModuleId, user: SessionUser): boolean {
  if (user.role === 'admin') return true;
  const allowedItemTypes = user.allowed_item_types || [];
  if (allowedItemTypes.length === 0) return true;
  return allowedItemTypes.includes(module === 'documents' ? 'Document' : 'Equipment');
}

// 'users' is admin-only; every other page is open once its module is.
function hasPageAccess(page: string, user: SessionUser): boolean {
  if (user.role === 'admin') return true;
  return page !== 'users';
}

// URLs: "/" is the module selection screen, "/<module>" a module's dashboard
// and "/<module>/<nav id>" one of its pages (e.g. /documents/tasks).
function parsePath(pathname: string): { module: ModuleId | null; navId: string } {
  const [first, second] = pathname.split('/').filter(Boolean);
  if (!isModuleId(first)) return { module: null, navId: 'dashboard' };
  const known = allNavItems(first).some((item) => item.id === second);
  return { module: first, navId: known ? second : 'dashboard' };
}

function buildPath(module: ModuleId | null, navId: string): string {
  if (!module) return '/';
  return navId === 'dashboard' ? `/${module}` : `/${module}/${navId}`;
}

function App() {
  const initialRoute = parsePath(window.location.pathname);
  const [activeModule, setActiveModule] = useState<ModuleId | null>(initialRoute.module);
  const [activeNavId, setActiveNavId] = useState(initialRoute.navId);
  const [authChecked, setAuthChecked] = useState(false);
  const [user, setUser] = useState<SessionUser | null>(null);
  const [employeeFilter, setEmployeeFilter] = useState('');
  const [navFilter, setNavFilter] = useState<NavFilter | null>(null);
  const [accessDeniedMessage, setAccessDeniedMessage] = useState<string | null>(null);

  const currentItem = activeModule ? allNavItems(activeModule).find((item) => item.id === activeNavId) : undefined;
  const currentPage = currentItem?.page ?? activeNavId;

  const pushRoute = useCallback((module: ModuleId | null, navId: string) => {
    const path = buildPath(module, navId);
    if (window.location.pathname !== path) {
      window.history.pushState(null, '', path);
    }
  }, []);

  // Opens a page of a module. Pages that are shared, tabbed components (Asset
  // Information, Tasks, Technicians) are pinned to the module's own tab by
  // the nav item itself.
  const goToNavItem = (module: ModuleId, navId: string, filter?: NavFilter | null) => {
    setActiveModule(module);
    setActiveNavId(navId);
    setNavFilter(filter ?? null);
    setAccessDeniedMessage(null);
    pushRoute(module, navId);
  };

  const handleSelectModule = (module: ModuleId) => {
    if (user && !hasModuleAccess(module, user)) {
      setAccessDeniedMessage("You don't have permission to open that module.");
      return;
    }
    goToNavItem(module, 'dashboard');
  };

  const handleHome = () => {
    setActiveModule(null);
    setActiveNavId('dashboard');
    setNavFilter(null);
    setAccessDeniedMessage(null);
    pushRoute(null, 'dashboard');
  };

  // Called by pages and dashboard tiles with a page id + optional filter. The
  // page is mapped back to the active module's matching nav item so the
  // sidebar highlights it; pages the module has no entry for (e.g. Employees,
  // opened from a Technicians row) still render, with nothing highlighted.
  const handleNavigate = (page: string, filter?: NavFilter) => {
    if (!activeModule) return;
    if (user && !hasPageAccess(page, user)) {
      goToNavItem(activeModule, 'dashboard');
      setAccessDeniedMessage("You don't have permission to access that page.");
      return;
    }
    const items = allNavItems(activeModule);
    const match =
      items.find((item) => item.page === page && (item.tab === undefined || item.tab === filter?.tab)) ??
      items.find((item) => item.page === page);
    goToNavItem(activeModule, match?.id ?? page, filter);
  };

  const handleViewEmployee = (empId: string) => {
    setEmployeeFilter(empId);
    handleNavigate('employees');
  };

  // Browser back / forward.
  useEffect(() => {
    const onPopState = () => {
      const route = parsePath(window.location.pathname);
      setActiveModule(route.module);
      setActiveNavId(route.navId);
      setNavFilter(null);
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

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
    // After login the user lands on the module selection screen.
    handleHome();
  };

  const handleSignOut = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } finally {
      setUser(null);
      handleHome();
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

  const accessibleModules = MODULE_ORDER.filter((id) => hasModuleAccess(id, user));

  // No module chosen yet - or a link/reload straight into one the user can't open.
  if (!activeModule || !accessibleModules.includes(activeModule)) {
    return (
      <>
        {accessDeniedMessage && (
          <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 shadow-lg">
            <span>{accessDeniedMessage}</span>
            <button onClick={() => setAccessDeniedMessage(null)} className="text-red-500 hover:text-red-700 font-medium">
              Dismiss
            </button>
          </div>
        )}
        <ModuleSelectPage
          userName={user.name}
          accessibleModules={accessibleModules}
          onSelectModule={handleSelectModule}
          onSignOut={handleSignOut}
        />
      </>
    );
  }

  const lockedTab = currentItem?.tab;

  const renderPage = () => {
    switch (currentPage) {
      case 'dashboard':
        return <Dashboard module={activeModule} onNavigate={handleNavigate} />;
      case 'email':
        return <EmailProcessing onNavigate={handleNavigate} />;
      case 'sites':
        return <SitesPage onNavigate={handleNavigate} />;
      case 'departments':
        return <DepartmentsPage onNavigate={handleNavigate} />;
      case 'equipment':
        return (
          <EquipmentPage
            lockedTab={lockedTab}
            initialTab={navFilter?.tab}
            initialDocExpiryTile={navFilter?.docExpiryTile}
            initialVehicleId={navFilter?.vehicleId ?? null}
            initialSite={navFilter?.site}
          />
        );
      case 'technicians':
        return <TechniciansPage lockedTab={currentItem?.technicianTab} onViewEmployee={handleViewEmployee} />;
      case 'employees':
        return <EmployeesPage initialSearch={employeeFilter} />;
      case 'tasks':
        return <MaintenanceTasksPage lockedTab={lockedTab} initialFilter={navFilter} onNavigate={handleNavigate} />;
      case 'schedules':
        return <SchedulesPage />;
      case 'notifications':
        return <NotificationsPage module={activeModule} onNavigate={handleNavigate} />;
      case 'calendar':
        return <CalendarPage />;
      case 'settings':
        return <SettingsPage />;
      case 'users':
        return <UsersPage />;
      default:
        return <Dashboard module={activeModule} onNavigate={handleNavigate} />;
    }
  };

  return (
    <Layout
      module={activeModule}
      activeNavId={activeNavId}
      onNavigate={(navId) => goToNavItem(activeModule, navId)}
      onHome={handleHome}
      onSignOut={handleSignOut}
      role={user.role}
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
      {/* Keyed so moving between modules or pages always starts a page fresh. */}
      <div key={`${activeModule}:${activeNavId}`}>{renderPage()}</div>
    </Layout>
  );
}

export default App;
