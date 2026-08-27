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
];

export default function Layout({ children, currentPage, onNavigate, onSignOut }: LayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

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
          fixed top-0 left-0 h-full w-64 bg-[#0f172a] text-white z-50
          transform transition-transform duration-300 ease-in-out
          lg:translate-x-0
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
        `}
      >
        {/* Logo */}
        <div className="flex items-center justify-between h-16 px-6 border-b border-slate-700">
          <div className="flex items-center gap-2 min-w-0">
            <img src="/bak-logo.png" alt="BAK Group" className="h-8 w-auto flex-shrink-0" />
            <span className="font-semibold text-lg tracking-tight truncate">BAK Group</span>
          </div>
          <button
            onClick={() => setSidebarOpen(false)}
            className="lg:hidden p-1 hover:bg-slate-700 rounded"
          >
            <X size={20} />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-4 overflow-y-auto">
          <ul className="space-y-1">
            {navItems.map((item) => {
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
                      w-full flex items-center gap-3 px-3 py-2.5 rounded-lg
                      transition-all duration-200 group
                      ${isActive
                        ? 'bg-gradient-to-r from-cyan-500/20 to-blue-500/20 text-cyan-400 border-l-2 border-cyan-400'
                        : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                      }
                    `}
                  >
                    <Icon size={20} className={isActive ? 'text-cyan-400' : 'text-slate-400 group-hover:text-slate-200'} />
                    <span className="font-medium text-sm">{item.label}</span>
                    {isActive && <ChevronRight size={16} className="ml-auto text-cyan-400" />}
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* Sign Out */}
        <div className="px-3 py-4 border-t border-slate-700">
          <button
            onClick={onSignOut}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-slate-300 hover:bg-red-500/20 hover:text-red-400 transition-colors"
          >
            <LogOut size={20} />
            <span className="font-medium text-sm">Sign Out</span>
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="lg:ml-64 min-h-screen">
        <div className="p-4 lg:p-8 pt-16 lg:pt-8">
          {children}
        </div>
      </main>
    </div>
  );
}
