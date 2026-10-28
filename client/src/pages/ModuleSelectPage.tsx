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

// Per-module icon colours (solid chip behind the icon) and hover glow.
const CARD_STYLE: Record<ModuleId, { chip: string; ring: string }> = {
  equipment: { chip: 'bg-blue-500', ring: 'hover:shadow-blue-200' },
  vehicles: { chip: 'bg-green-500', ring: 'hover:shadow-green-200' },
  documents: { chip: 'bg-purple-500', ring: 'hover:shadow-purple-200' },
  projects: { chip: 'bg-orange-500', ring: 'hover:shadow-orange-200' },
  costing: { chip: 'bg-teal-500', ring: 'hover:shadow-teal-200' },
};

// One card look shared by the module tiles and the stat tiles.
const CARD = 'bg-white rounded-2xl border shadow-md';

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
  equipment: { chip: 'bg-blue-100 text-blue-600', border: 'border-blue-300' },
  vehicles: { chip: 'bg-green-100 text-green-600', border: 'border-green-300' },
  documents: { chip: 'bg-purple-100 text-purple-600', border: 'border-purple-300' },
  costing: { chip: 'bg-teal-100 text-teal-600', border: 'border-teal-300' },
  amber: { chip: 'bg-orange-100 text-orange-600', border: 'border-orange-300' },
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
    // One call per tile: a failing endpoint leaves only its own tile as a dash.
    const urls = [
      '/api/equipment/due-soon?days=30',
      '/api/vehicles/due-soon?days=30',
      '/api/documents/expiring-soon?days=60',
      '/api/costing/enquiries/open-count',
      '/api/costing/tasks/my-pending',
      '/api/costing/sheets/awaiting-approval',
      '/api/costing/sheets/approved-this-month',
    ];
    Promise.all(urls.map(fetchJson)).then(([equipment, vehicles, documents, enquiries, tasks, awaiting, approved]) => {
      if (cancelled) return;
      setStats({
        equipmentDue: num(equipment?.count),
        vehiclesDue: num(vehicles?.count),
        documentsExpiring: num(documents?.count),
        openEnquiries: num(enquiries?.count),
        myPendingTasks: num(tasks?.count),
        awaitingApproval: num(awaiting?.count),
        approvedThisMonth: num(approved?.count),
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
    { key: 'approved', label: 'Approved this month', value: stats?.approvedThisMonth ?? null, icon: CheckCircle2, tone: TONES.vehicles },
  ];

  const statTile = (tile: StatTile) => {
    const Icon = tile.icon;
    return (
      <div key={tile.key} className={`flex items-center gap-4 ${CARD} ${tile.tone.border} px-5 py-5`}>
        <div className={`w-14 h-14 rounded-xl flex items-center justify-center flex-shrink-0 ${tile.tone.chip}`}>
          <Icon size={28} />
        </div>
        <div className="min-w-0">
          {stats === null ? (
            <div className="h-9 w-14 rounded bg-slate-200 animate-pulse" />
          ) : (
            <p className="text-4xl font-bold text-slate-800 leading-none" title={tile.value === null ? 'Could not be loaded' : undefined}>
              {tile.value === null ? '–' : tile.value}
            </p>
          )}
          <p className="text-sm text-slate-500 leading-tight mt-2">{tile.label}</p>
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

      <main className="flex-1 max-w-6xl w-full mx-auto px-6 lg:px-8 -mt-16 pb-14">
        {/* Module cards */}
        <div className="grid grid-cols-5 gap-3 sm:gap-5">
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
                className={`relative h-40 sm:h-44 min-w-0 flex flex-col items-center justify-center gap-3 sm:gap-4 px-2 border-slate-200 ${CARD} transition-all duration-200 ${
                  allowed ? `hover:scale-[1.04] hover:shadow-xl ${style.ring}` : 'opacity-60 cursor-not-allowed'
                }`}
              >
                <div className={`w-14 h-14 sm:w-16 sm:h-16 rounded-2xl flex items-center justify-center shadow-sm ${style.chip}`}>
                  <Icon size={30} className="text-white" />
                </div>
                <h2 className="text-sm sm:text-base font-semibold text-slate-800 text-center leading-tight">{module.label}</h2>
                {!allowed && <Lock size={14} className="absolute top-3 right-3 text-slate-400" />}
              </button>
            );
          })}
        </div>

        {/* Live summary */}
        <section className="mt-12 pt-10 border-t border-slate-200 space-y-5">
          <h2 className="text-base font-bold text-slate-700 uppercase tracking-wider">At a glance</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">{row1.map(statTile)}</div>
          <h2 className="text-base font-bold text-slate-700 uppercase tracking-wider pt-5">Costing snapshot</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">{row2.map(statTile)}</div>
        </section>
      </main>
    </div>
  );
}
