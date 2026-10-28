import { useEffect, useState } from 'react';
import { CheckCircle2, ClipboardList, Cog, FileText, FileWarning, Inbox, ListChecks, LogOut, Lock, Truck, type LucideIcon } from 'lucide-react';
import { MODULE_ORDER, MODULES, type ModuleId } from '../lib/modules';
import { apiFetch } from '../lib/api';

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

// Each module tile is one solid colour (inline style so it always applies).
const TILE_COLOR: Record<ModuleId, string> = {
  equipment: '#2563EB',
  vehicles: '#16A34A',
  documents: '#7C3AED',
  projects: '#EA580C',
  costing: '#0D9488',
};

interface StatTile {
  key: string;
  label: string;
  value: number | null;
  icon: LucideIcon;
  // Category colours: icon chip, border and number.
  tone: { chip: string; border: string };
}

const TONES = {
  equipment: { chip: 'bg-blue-100 text-blue-600', border: 'border-l-blue-500' },
  vehicles: { chip: 'bg-green-100 text-green-600', border: 'border-l-green-500' },
  documents: { chip: 'bg-purple-100 text-purple-600', border: 'border-l-purple-500' },
  costing: { chip: 'bg-teal-100 text-teal-600', border: 'border-l-teal-500' },
  amber: { chip: 'bg-orange-100 text-orange-600', border: 'border-l-orange-500' },
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
      <div key={tile.key} className={`flex items-center gap-3 bg-white rounded-xl border border-slate-200 border-l-[6px] ${tile.tone.border} shadow-sm px-4 py-3.5`}>
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${tile.tone.chip}`}>
          <Icon size={20} />
        </div>
        <div className="min-w-0">
          {stats === null ? (
            <div className="h-6 w-10 rounded bg-slate-200 animate-pulse" />
          ) : (
            <p className="text-2xl font-bold text-slate-800 leading-none" title={tile.value === null ? 'Could not be loaded' : undefined}>
              {tile.value === null ? '\u2013' : tile.value}
            </p>
          )}
          <p className="text-xs text-slate-500 leading-tight mt-1.5">{tile.label}</p>
        </div>
      </div>
    );
  };

  const sectionLabel = (label: string) => (
    <div className="flex items-center gap-4">
      <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-widest whitespace-nowrap">{label}</h2>
      <div className="h-px flex-1 bg-slate-300/70" />
    </div>
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-slate-100 to-slate-200 flex flex-col">
      {/* Header band */}
      <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white">
        <div className="max-w-6xl mx-auto px-6 lg:px-8">
          <div className="flex items-center justify-between h-16 border-b border-white/10">
            <div className="flex items-center gap-2.5">
              <img src="/bak-logo.png" alt="BAK Group" className="h-8 w-auto" />
              <span className="font-semibold tracking-tight">BAK Group</span>
            </div>
            <div className="flex items-center gap-4">
              <button
                onClick={onSignOut}
                className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-slate-300 hover:bg-red-500/20 hover:text-red-300 transition-colors"
              >
                <LogOut size={16} />
                Sign Out
              </button>
            </div>
          </div>

          <div className="pt-10 pb-28 text-center">
            <h1 className="text-3xl lg:text-4xl font-semibold tracking-tight">Maintenance Automation System</h1>
            <p className="text-slate-400 mt-2 text-sm">Select a module to get started</p>
          </div>
        </div>
      </div>

      <main className="flex-1 max-w-6xl w-full mx-auto px-6 lg:px-8 -mt-16 pb-16">
        {/* Module cards: one row when they fit, otherwise 3 + 2 centred */}
        <div className="flex flex-wrap justify-center gap-4">
          {MODULE_ORDER.map((id) => {
            const module = MODULES[id];
            const Icon = module.icon;
            const allowed = accessibleModules.includes(id);

            return (
              <button
                key={id}
                type="button"
                disabled={!allowed}
                onClick={() => onSelectModule(id)}
                title={allowed ? module.label : `${module.label} - no access`}
                style={{ backgroundColor: TILE_COLOR[id], width: 150, height: 130, borderRadius: 12 }}
                className={`relative w-[150px] h-[130px] flex flex-col items-center justify-center gap-2 px-2 rounded-xl text-white shadow-md transition-all duration-200 ${
                  allowed
                    ? 'hover:-translate-y-1 hover:shadow-[0_10px_24px_-4px_rgba(15,23,42,0.35),0_0_0_4px_rgba(255,255,255,0.55)] active:scale-95'
                    : 'opacity-60 cursor-not-allowed'
                }`}
              >
                <Icon size={40} className="text-white" strokeWidth={1.75} />
                <h2 className="h-9 flex items-center justify-center text-sm font-bold text-white text-center leading-tight">{module.label}</h2>
                {!allowed && <Lock size={14} className="absolute top-2.5 right-2.5 text-white/80" />}
              </button>
            );
          })}
        </div>

        {/* Live summary */}
        <section className="mt-16 space-y-10">
          <div className="space-y-5">
            {sectionLabel('At a glance')}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">{row1.map(statTile)}</div>
          </div>
          <div className="space-y-5">
            {sectionLabel('Costing snapshot')}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">{row2.map(statTile)}</div>
          </div>
        </section>
      </main>
    </div>
  );
}
