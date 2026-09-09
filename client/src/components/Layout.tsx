import { ReactNode, useState } from 'react';
import {
  LayoutDashboard,
  Wrench,
  Calendar,
  Cog,
  MapPin,
  Building2,
  Users,
  Contact,
  CalendarDays,
  Mail,
  Bell,
  Settings,
  UserCog,
  LogOut,
  Menu,
  X,
  ChevronRight,
} from 'lucide-react';

interface LayoutProps {
  children: ReactNode;
  currentPage: string;
  onNavigate: (page: string) => void;
  onSignOut?: () => void;
  role?: string;
  allowedItemTypes?: string[];
}

// Nav items that only make sense for users with Equipment access - vehicles
// live inside this page's own Vehicles tab (there's no standalone vehicles
// nav item any more). An empty allowedItemTypes means "no restriction"
// (matches routes/dashboard.js's buildPermissionConditions), so this stays
// visible unless the user has been scoped down to Document only.
const EQUIPMENT_GATED_NAV_ITEMS = new Set(['equipment']);

function hasEquipmentAccess(allowedItemTypes: string[]): boolean {
  if (allowedItemTypes.length === 0) return true;
  return allowedItemTypes.includes('Equipment');
}

const navItems = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'equipment', label: 'Asset Information', icon: Cog },
  { id: 'departments', label: 'Departments', icon: Building2 },
  { id: 'employees', label: 'Employee Master', icon: Contact },
  { id: 'technicians', label: 'Technicians', icon: Users },
  { id: 'sites', label: 'Sites', icon: MapPin },
  { id: 'tasks', label: 'Maintenance Tasks', icon: Wrench },
  { id: 'schedules', label: 'Schedule Meeting', icon: Calendar },
  { id: 'email', label: 'Email Processing', icon: Mail },
  { id: 'calendar', label: 'Calendar', icon: CalendarDays },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'settings', label: 'Settings', icon: Settings },
  { id: 'users', label: 'Users', icon: UserCog },
];

export default function Layout({ children, currentPage, onNavigate, onSignOut, role, allowedItemTypes = [] }: LayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const visibleNavItems = navItems.filter((item) => {
    if (role === 'admin') return true;
    if (item.id === 'users') return false;
    if (EQUIPMENT_GATED_NAV_ITEMS.has(item.id)) return hasEquipmentAccess(allowedItemTypes);
    return true;
  });

  const pageTitle = navItems.find((item) => item.id === currentPage)?.label
    || currentPage.charAt(0).toUpperCase() + currentPage.slice(1);

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Mobile menu button */}
      <button
        onClick={() => setSidebarOpen(true)}
        className="lg:hidden fixed top-4 left-4 z-50 p-2 bg-[#0f172a] text-white rounded-lg shadow-lg"
      >
        <Menu size={24} />
      </button>

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black/50 z-40"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`
          fixed top-0 left-0 h-full w-56 bg-gradient-to-b from-slate-900 to-slate-800 text-white z-50
          transform transition-transform duration-300 ease-in-out
          lg:translate-x-0
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
        `}
      >
        {/* Logo */}
        <div className="flex items-center justify-between h-16 px-5 border-b border-slate-700">
          <div className="flex items-center gap-2 min-w-0">
            <img src="/bak-logo.png" alt="BAK Group" className="h-8 w-auto flex-shrink-0" />
            <span className="font-semibold text-base tracking-tight truncate">BAK Group</span>
          </div>
          <button
            onClick={() => setSidebarOpen(false)}
            className="lg:hidden p-1 hover:bg-slate-700 rounded"
          >
            <X size={20} />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-2.5 py-5 overflow-y-auto">
          <ul className="space-y-2">
            {visibleNavItems.map((item) => {
              const Icon = item.icon;
              const isActive = currentPage === item.id;
              return (
                <li key={item.id}>
                  <button
                    onClick={() => {
                      onNavigate(item.id);
                      setSidebarOpen(false);
                    }}
                    className={`
                      w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg
                      transition-all duration-200 group
                      ${isActive
                        ? 'bg-gradient-to-r from-cyan-500/20 to-blue-500/20 text-cyan-400 border-l-2 border-cyan-400'
                        : 'text-slate-300 hover:bg-white/5 hover:text-white'
                      }
                    `}
                  >
                    <Icon size={18} className={isActive ? 'text-cyan-400' : 'text-slate-400 group-hover:text-slate-200'} />
                    <span className="font-medium text-sm truncate">{item.label}</span>
                    {isActive && <ChevronRight size={16} className="ml-auto text-cyan-400 flex-shrink-0" />}
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* Sign Out */}
        <div className="px-2.5 py-4 border-t border-slate-700">
          <button
            onClick={onSignOut}
            className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-slate-300 hover:bg-red-500/20 hover:text-red-400 transition-colors"
          >
            <LogOut size={18} />
            <span className="font-medium text-sm">Sign Out</span>
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="lg:ml-56 min-h-screen flex flex-col">
        {/* Topbar */}
        <header className="sticky top-0 z-30 bg-white border-b border-slate-200 shadow-sm px-4 lg:px-8 h-16 flex items-center flex-shrink-0">
          <h1 className="text-lg font-semibold text-slate-800 pl-16 lg:pl-0">{pageTitle}</h1>
        </header>

        <div
          className="flex-1 p-4 lg:p-8"
          style={{ background: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)' }}
        >
          {children}
        </div>
      </main>
    </div>
  );
}
