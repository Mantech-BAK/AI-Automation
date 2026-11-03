import { ReactNode, useState } from 'react';
import { ChevronRight, Home, LogOut, Menu, X } from 'lucide-react';
import { MODULES, SYSTEM_NAV, type ModuleId, type ModuleNavItem } from '../lib/modules';

interface LayoutProps {
  children: ReactNode;
  module: ModuleId;
  activeNavId: string;
  onNavigate: (navId: string) => void;
  // Back to the module selection screen (logo / "All Modules" button).
  onHome: () => void;
  onSignOut?: () => void;
  role?: string;
  // Costing Sheet: the selected costing user's role level (filters the sidebar) and content for the right of the top bar (bell).
  costingLevel?: number;
  topbarExtra?: ReactNode;
}

export default function Layout({ children, module, activeNavId, onNavigate, onHome, onSignOut, role, costingLevel, topbarExtra }: LayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const definition = MODULES[module];
  const ModuleIcon = definition.icon;

  const moduleItems = definition.nav.filter((item) => !item.minRoleLevel || (costingLevel ?? 0) >= item.minRoleLevel);
  // Users is admin-only; Settings is open to everyone, as before.
  const systemItems = SYSTEM_NAV.filter((item) => item.id !== 'users' || role === 'admin');

  // Project Tracking has no title bar on any page (the dashboard opens with a greeting instead).
  const hideTopbar = module === 'projects';

  const pageTitle = [...moduleItems, ...SYSTEM_NAV].find((item) => item.id === activeNavId)?.label || definition.label;

  const signOutButton = (
    <button
      onClick={onSignOut}
      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-sm whitespace-nowrap flex-shrink-0 text-slate-600 border border-slate-200 bg-white hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition-colors"
    >
      <LogOut size={15} />
      Sign Out
    </button>
  );

  const renderItem = (item: ModuleNavItem) => {
    const Icon = item.icon;
    const isActive = activeNavId === item.id;
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
  };

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
          flex flex-col
          transform transition-transform duration-300 ease-in-out
          lg:translate-x-0
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
        `}
      >
        {/* Logo - click to return to the module selection screen */}
        <div className="flex items-center justify-between h-16 px-5 border-b border-slate-700 flex-shrink-0">
          <button
            onClick={onHome}
            title="Back to all modules"
            className="flex items-center gap-2 min-w-0 text-left hover:opacity-80 transition-opacity"
          >
            <img src="/bak-logo.png" alt="BAK Group" className="h-8 w-auto flex-shrink-0" />
            <span className="font-semibold text-base tracking-tight truncate">BAK Group</span>
          </button>
          <button
            onClick={() => setSidebarOpen(false)}
            className="lg:hidden p-1 hover:bg-slate-700 rounded"
          >
            <X size={20} />
          </button>
        </div>

        {/* Current module */}
        <div className="px-2.5 pt-4 flex-shrink-0">
          <div className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg bg-gradient-to-r ${definition.gradient}`}>
            <ModuleIcon size={18} className="text-white flex-shrink-0" />
            <span className="font-semibold text-sm truncate">{definition.label}</span>
          </div>
          <button
            onClick={onHome}
            className="mt-2 w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs text-slate-300 hover:bg-white/5 hover:text-white transition-colors"
          >
            <Home size={16} className="text-slate-400" />
            All Modules
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-2.5 py-4 overflow-y-auto">
          <ul className="space-y-2">{moduleItems.map(renderItem)}</ul>
          <div className="mt-4 pt-4 border-t border-slate-700">
            <ul className="space-y-2">{systemItems.map(renderItem)}</ul>
          </div>
        </nav>

      </aside>

      {/* Main content */}
      <main className="lg:ml-56 min-h-screen flex flex-col">
        {/* Topbar */}
        {!hideTopbar && (
        <header className="sticky top-0 z-30 bg-white border-b border-slate-200 shadow-sm px-4 lg:px-8 h-16 flex items-center gap-3 flex-shrink-0">
          <h1 className="text-lg font-semibold text-slate-800 pl-16 lg:pl-0 min-w-0 truncate">{pageTitle}</h1>
          {/* Project Tracking pages show just their own title, without the module name. */}
          {module !== 'projects' && (
            <span className="hidden sm:inline text-xs font-medium text-slate-400 uppercase tracking-wide">{definition.label}</span>
          )}
          <div className="ml-auto flex items-center gap-3">
            {topbarExtra}
            {signOutButton}
          </div>
        </header>
        )}
        {/* Project Tracking has no top bar, so its Sign Out floats in the top-right corner. */}
        {hideTopbar && <div className="fixed top-1 right-3 z-30 [&>button]:py-1 [&>button]:text-xs">{signOutButton}</div>}

        <div
          className={`flex-1 p-4 lg:p-8 ${hideTopbar && activeNavId === 'settings' ? 'pt-16 lg:pt-8' : ''}`}
          style={{ background: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)' }}
        >
          {children}
        </div>
      </main>
    </div>
  );
}
