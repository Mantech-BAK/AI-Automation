import { useEffect, useState } from 'react';
import { CheckCircle2, ClipboardList, Cog, FileText, FileWarning, Inbox, ListChecks, LogOut, Lock, Truck, type LucideIcon } from 'lucide-react';
import { MODULE_ORDER, MODULES, type ModuleId } from '../lib/modules';
import { apiFetch } from '../lib/api';
import { useSavedName } from '../components/dashboard/parts';

interface ModuleSelectPageProps {
  // Modules the signed-in user may open (based on their allowed item types).
  accessibleModules: ModuleId[];
  onSelectModule: (module: ModuleId) => void;
  onSignOut: () => void;
}

// null = that figure could not be loaded (shown as a dash).
interface HomeStats {
  equipmentDue: number | null;
  vehiclesDue: number | null;
  documentsExpiring: number | null;
  openEnquiries: number | null;
  myPendingTasks: number | null;
  awaitingApproval: number | null;
  approvedThisMonth: number | null;
}

// Per-card visuals: a distinct accent for each module, matching the colours
// the module dashboards already use (blue / orange / purple).
const CARD_STYLE: Record<ModuleId, { accentText: string; accentBg: string; ring: string }> = {
  equipment: { accentText: 'text-blue-600', accentBg: 'bg-blue-50', ring: 'hover:shadow-blue-200/70' },
  vehicles: { accentText: 'text-orange-600', accentBg: 'bg-orange-50', ring: 'hover:shadow-orange-200/70' },
  documents: { accentText: 'text-purple-600', accentBg: 'bg-purple-50', ring: 'hover:shadow-purple-200/70' },
  projects: { accentText: 'text-teal-600', accentBg: 'bg-teal-50', ring: 'hover:shadow-teal-200/70' },
  costing: { accentText: 'text-indigo-600', accentBg: 'bg-indigo-50', ring: 'hover:shadow-indigo-200/70' },
};

function bahrainDateLabel(): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Bahrain',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date());
}

interface StatTile {
  key: string;
  label: string;
  value: number | null;
  icon: LucideIcon;
  // Category colours: icon chip, border and number.
  tone: { chip: string; border: string };
}

const TONES = {
  equipment: { chip: 'bg-blue-100 text-blue-600', border: 'border-blue-200' },
  vehicles: { chip: 'bg-orange-100 text-orange-600', border: 'border-orange-200' },
  documents: { chip: 'bg-green-100 text-green-600', border: 'border-green-200' },
  costing: { chip: 'bg-indigo-100 text-indigo-600', border: 'border-indigo-200' },
  amber: { chip: 'bg-amber-100 text-amber-600', border: 'border-amber-200' },
};

const num = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) ? value : null);

async function fetchJson(url: string): Promise<Record<string, unknown> | null> {
  try {
    const response = await apiFetch(url);
    return response.ok ? await response.json() : null;
  } catch {
    return null;
  }
}

export default function ModuleSelectPage({ accessibleModules, onSelectModule, onSignOut }: ModuleSelectPageProps) {
  const name = useSavedName();
  const [stats, setStats] = useState<HomeStats | null>(null);

  useEffect(() => {
    let cancelled = false;
    // Independent calls: one failing leaves only its own tiles as a dash.
    Promise.all([fetchJson('/api/dashboard/home-stats'), fetchJson('/api/costing/dashboard')]).then(([home, costing]) => {
      if (cancelled) return;
      setStats({
        equipmentDue: num(home?.equipment_due),
        vehiclesDue: num(home?.vehicles_due),
        documentsExpiring: num(home?.documents_expiring),
        openEnquiries: num(costing?.open_enquiries),
        myPendingTasks: num((costing?.pending_breakdown as Record<string, unknown> | undefined)?.open_tasks),
        awaitingApproval: num(costing?.awaiting_approval),
        approvedThisMonth: num(costing?.approved_this_month),
      });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const row1: StatTile[] = [
    { key: 'equipment', label: 'Equipment due for maintenance (30 days)', value: stats?.equipmentDue ?? null, icon: Cog, tone: TONES.equipment },
    { key: 'vehicles', label: 'Vehicles due for service (30 days)', value: stats?.vehiclesDue ?? null, icon: Truck, tone: TONES.vehicles },
    { key: 'documents', label: 'Documents expiring soon (60 days)', value: stats?.documentsExpiring ?? null, icon: FileWarning, tone: TONES.documents },
    { key: 'enquiries', label: 'Open enquiries', value: stats?.openEnquiries ?? null, icon: Inbox, tone: TONES.costing },
  ];
  const row2: StatTile[] = [
    { key: 'tasks', label: 'My pending tasks', value: stats?.myPendingTasks ?? null, icon: ListChecks, tone: TONES.costing },
    { key: 'approval', label: 'Costing sheets awaiting approval', value: stats?.awaitingApproval ?? null, icon: ClipboardList, tone: TONES.amber },
    { key: 'approved', label: 'Approved this month', value: stats?.approvedThisMonth ?? null, icon: CheckCircle2, tone: TONES.documents },
  ];

  const statTile = (tile: StatTile) => {
    const Icon = tile.icon;
    return (
      <div key={tile.key} className={`flex items-center gap-4 bg-white rounded-xl border ${tile.tone.border} shadow-sm px-5 py-4`}>
        <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${tile.tone.chip}`}>
          <Icon size={24} />
        </div>
        <div className="min-w-0">
          {stats === null ? (
            <div className="h-8 w-12 rounded bg-slate-200 animate-pulse" />
          ) : (
            <p className="text-3xl font-bold text-slate-800 leading-tight" title={tile.value === null ? 'Could not be loaded' : undefined}>
              {tile.value === null ? '–' : tile.value}
            </p>
          )}
          <p className="text-xs text-slate-500 leading-tight mt-1">{tile.label}</p>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Header band */}
      <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white">
        <div className="max-w-6xl mx-auto px-6 lg:px-8">
          <div className="flex items-center justify-between h-16 border-b border-white/10">
            <div className="flex items-center gap-2.5">
              <img src="/bak-logo.png" alt="BAK Group" className="h-8 w-auto" />
              <span className="font-semibold tracking-tight">BAK Group</span>
            </div>
            <button
              onClick={onSignOut}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-slate-300 hover:bg-red-500/20 hover:text-red-300 transition-colors"
            >
              <LogOut size={16} />
              Sign Out
            </button>
          </div>

          <div className="pt-10 pb-24">
            <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
              <h1 className="text-3xl lg:text-4xl font-bold tracking-tight">{name ? `Welcome back, ${name}` : 'Welcome back'}</h1>
              <p className="text-slate-300">{bahrainDateLabel()}</p>
            </div>
          </div>
        </div>
      </div>

      <main className="flex-1 max-w-6xl w-full mx-auto px-6 lg:px-8 -mt-16 pb-12">
        {/* Module cards */}
        <div className="flex flex-nowrap justify-center gap-3 sm:gap-4">
          {MODULE_ORDER.map((id) => {
            const module = MODULES[id];
            const style = CARD_STYLE[id];
            const Icon = module.icon;
            const allowed = accessibleModules.includes(id);

            return (
              <button
                key={id}
                type="button"
                disabled={!allowed}
                onClick={() => onSelectModule(id)}
                title={allowed ? module.label : `${module.label} - no access`}
                className={`group relative flex-1 min-w-0 max-w-[10rem] rounded-xl overflow-hidden bg-white border border-slate-200 shadow-md transition-all duration-200 ${
                  allowed ? `hover:-translate-y-1 hover:shadow-xl ${style.ring}` : 'opacity-60 cursor-not-allowed'
                }`}
              >
                <div className={`relative bg-gradient-to-br ${module.gradient} py-4 flex items-center justify-center`}>
                  <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
                    <Icon size={22} className="text-white" />
                  </div>
                  {!allowed && <Lock size={14} className="absolute top-2 right-2 text-white/80" />}
                </div>
                <div className="px-2 py-2.5">
                  <h2 className="text-xs sm:text-sm font-semibold text-slate-800 text-center leading-tight">{module.label}</h2>
                </div>
              </button>
            );
          })}
        </div>

        {/* Live summary */}
        <section className="mt-10 space-y-4">
          <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wide">At a glance</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">{row1.map(statTile)}</div>
          <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wide pt-2">Costing snapshot</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">{row2.map(statTile)}</div>
        </section>
      </main>
    </div>
  );
}
