import { ReactNode } from 'react';
import { ArrowLeft, LogOut } from 'lucide-react';

interface ToolLayoutProps {
  title: string;
  children: ReactNode;
  onHome: () => void;
  onSignOut: () => void;
}

// Frame for the pages that belong to no module (Email Processing, Meeting Schedule, Users): a top bar with the way
// back to the home page, no sidebar.
export default function ToolLayout({ title, children, onHome, onSignOut }: ToolLayoutProps) {
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <header className="sticky top-0 z-30 bg-white border-b border-slate-200 shadow-sm px-4 lg:px-8 h-16 flex items-center gap-3 flex-shrink-0">
        <button
          onClick={onHome}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-sm whitespace-nowrap flex-shrink-0 text-slate-600 border border-slate-200 bg-white hover:bg-slate-100 transition-colors"
        >
          <ArrowLeft size={15} />
          All Modules
        </button>
        <h1 className="text-lg font-semibold text-slate-800 min-w-0 truncate">{title}</h1>
        <button
          onClick={onSignOut}
          className="ml-auto flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-sm whitespace-nowrap flex-shrink-0 text-slate-600 border border-slate-200 bg-white hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition-colors"
        >
          <LogOut size={15} />
          Sign Out
        </button>
      </header>
      <div className="flex-1 p-4 lg:p-8" style={{ background: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)' }}>
        {children}
      </div>
    </div>
  );
}
