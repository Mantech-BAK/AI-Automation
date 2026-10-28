import { useEffect, useState } from 'react';
import { AlertTriangle, BarChart3, Calculator, ChevronRight, FileText, LogOut, Lock, TrendingUp, Truck, Wrench, type LucideIcon } from 'lucide-react';
import { type ModuleId } from '../lib/modules';
import { apiFetch } from '../lib/api';

interface ModuleSelectPageProps {
  // Modules the signed-in user may open (based on their allowed item types).
  accessibleModules: ModuleId[];
  onSelectModule: (module: ModuleId) => void;
  onSignOut: () => void;
  user: { name: string; role: string };
}

// Tile order on this page (differs from MODULE_ORDER, which the sidebar / routing use).
const TILE_ORDER: ModuleId[] = ['equipment', 'documents', 'vehicles', 'projects', 'costing'];

const TILES: Record<ModuleId, { name: string; subtitle: string; icon: LucideIcon; from: string; to: string }> = {
  equipment: { name: 'Equipment', subtitle: 'Maintenance & assets', icon: Wrench, from: '#3B82F6', to: '#6366F1' },
  documents: { name: 'Documents', subtitle: 'Licences & compliance', icon: FileText, from: '#F97316', to: '#F59E0B' },
  vehicles: { name: 'Vehicles', subtitle: 'Fleet & service', icon: Truck, from: '#14B8A6', to: '#06B6D4' },
  projects: { name: 'Projects', subtitle: 'Delivery tracking', icon: BarChart3, from: '#A855F7', to: '#EC4899' },
  costing: { name: 'Costing Sheet', subtitle: 'Enquiries & quotations', icon: Calculator, from: '#22C55E', to: '#10B981' },
};

type Tone = 'good' | 'warn' | 'bad';
const TONE_TEXT: Record<Tone, string> = { good: 'text-emerald-400', warn: 'text-orange-400', bad: 'text-red-400' };

// One stat tile: its endpoint, label and how the number is described underneath.
interface StatDef {
  key: string;
  label: string;
  url: string;
  describe: (value: number) => { text: string; tone: Tone };
}

const none = (zero: string, some: string, tone: Tone) => (value: number) => (value === 0 ? { text: zero, tone: 'good' as Tone } : { text: some, tone });

const STATS: Record<ModuleId, [StatDef, StatDef]> = {
  equipment: [
    { key: 'eq-active', label: 'Active Work Orders', url: '/api/equipment/active-work-orders', describe: (v) => ({ text: v === 0 ? 'Nothing open' : 'In progress', tone: 'good' }) },
    { key: 'eq-overdue', label: 'Overdue Inspections', url: '/api/equipment/overdue', describe: none('None overdue', 'Needs attention', 'bad') },
  ],
  documents: [
    { key: 'doc-expiring', label: 'Expiring Soon (60 days)', url: '/api/documents/expiring-soon?days=60', describe: none('Nothing expiring', 'Renew soon', 'warn') },
    { key: 'doc-filed', label: 'Filed This Month', url: '/api/documents/filed-this-month', describe: (v) => ({ text: v === 0 ? 'None yet' : 'Processed this month', tone: 'good' }) },
  ],
  vehicles: [
    { key: 'veh-service', label: 'In Service', url: '/api/vehicles/in-service', describe: (v) => ({ text: v === 0 ? 'No vehicles' : 'In the fleet', tone: 'good' }) },
    { key: 'veh-due', label: 'Service Due Soon', url: '/api/vehicles/due-soon?days=30', describe: none('Nothing due', 'Due in 30 days', 'warn') },
  ],
  projects: [
    { key: 'prj-ok', label: 'On-Track', url: '/api/projects/on-track', describe: (v) => ({ text: v === 0 ? 'None' : 'Healthy projects', tone: 'good' }) },
    { key: 'prj-risk', label: 'At-Risk', url: '/api/projects/at-risk', describe: none('No risks flagged', 'Needs attention', 'bad') },
  ],
  costing: [
    { key: 'cst-await', label: 'Awaiting Approval', url: '/api/costing/sheets/awaiting-approval', describe: none('Nothing waiting', 'Needs review', 'warn') },
    { key: 'cst-approved', label: 'Approved This Month', url: '/api/costing/sheets/approved-this-month', describe: (v) => ({ text: v === 0 ? 'None yet' : 'Signed off', tone: 'good' }) },
  ],
};

// A count that could not be loaded counts as 0 (failed = true, so the tile can say "No data" instead of a description).
interface Count {
  value: number;
  failed: boolean;
}

async function fetchCount(url: string): Promise<Count> {
  try {
    const response = await apiFetch(url);
    if (!response.ok) return { value: 0, failed: true };
    const json = await response.json();
    return typeof json?.count === 'number' ? { value: json.count, failed: false } : { value: 0, failed: true };
  } catch {
    return { value: 0, failed: true };
  }
}

function bahrainDateLabel(): string {
  return new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Bahrain', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date());
}

const initialsOf = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || '?';

const roleLabel = (role: string) => (role ? role.charAt(0).toUpperCase() + role.slice(1) : '');

export default function ModuleSelectPage({ accessibleModules, onSelectModule, onSignOut, user }: ModuleSelectPageProps) {
  // key -> count; undefined = still loading
  const [counts, setCounts] = useState<Record<string, Count | undefined>>({});

  useEffect(() => {
    let cancelled = false;
    // One call per tile: a failing endpoint leaves only its own tile as a dash.
    for (const def of TILE_ORDER.flatMap((id) => STATS[id])) {
      fetchCount(def.url).then((value) => {
        if (!cancelled) setCounts((current) => ({ ...current, [def.key]: value }));
      });
    }
    return () => {
      cancelled = true;
    };
  }, []);

  const statTile = (def: StatDef) => {
    const count = counts[def.key];
    const described = count && !count.failed ? def.describe(count.value) : null;
    const warning = described !== null && described.tone !== 'good';
    const Icon = warning ? AlertTriangle : TrendingUp;
    return (
      <div key={def.key} className="rounded-2xl bg-[#1e293b] border border-white/10 px-4 py-3 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <p className="text-[11px] text-slate-400 leading-snug">{def.label}</p>
          <Icon size={14} className={`flex-shrink-0 ${warning ? 'text-orange-400' : count?.failed ? 'text-slate-500' : 'text-emerald-400'}`} />
        </div>
        {count === undefined ? (
          <div className="h-7 w-10 rounded bg-white/10 animate-pulse mt-2" />
        ) : (
          <p className="text-3xl font-bold text-white leading-none mt-2">{count.value}</p>
        )}
        <p className={`text-[11px] mt-2 ${described ? TONE_TEXT[described.tone] : 'text-slate-500'}`}>{described ? described.text : count?.failed ? 'No data' : ' '}</p>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-[#0f172a] text-white flex flex-col">
      {/* Top bar */}
      <header className="border-b border-white/10">
        <div className="max-w-7xl mx-auto px-6 lg:px-8 h-20 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <img src="/bak-logo.png" alt="BAK Group" className="h-10 w-auto rounded bg-white p-0.5 flex-shrink-0" />
            <div className="min-w-0">
              <p className="font-bold text-lg leading-tight">BAK Group</p>
              <p className="text-xs text-slate-400 truncate">
                Maintenance Automation System <span className="hidden sm:inline">&middot; {bahrainDateLabel()}</span>
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 flex-shrink-0">
            <div className="hidden sm:block text-right leading-tight">
              <p className="font-bold text-sm">{user.name}</p>
              <p className="text-xs text-slate-400">{roleLabel(user.role)}</p>
            </div>
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-sm font-bold" title={user.name}>
              {initialsOf(user.name)}
            </div>
            <button
              onClick={onSignOut}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-slate-300 border border-white/10 hover:bg-red-500/20 hover:text-red-300 hover:border-red-500/30 transition-colors"
            >
              <LogOut size={16} />
              <span className="hidden sm:inline">Sign Out</span>
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl w-full mx-auto px-6 lg:px-8 py-10 space-y-5">
        {/* Module tiles */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-5">
          {TILE_ORDER.map((id) => {
            const tile = TILES[id];
            const Icon = tile.icon;
            const allowed = accessibleModules.includes(id);
            return (
              <button
                key={id}
                type="button"
                disabled={!allowed}
                onClick={() => onSelectModule(id)}
                title={allowed ? tile.name : `${tile.name} - no access`}
                style={{ backgroundImage: `linear-gradient(135deg, ${tile.from}, ${tile.to})`, borderRadius: 16 }}
                className={`relative h-44 p-5 flex flex-col justify-between text-left text-white shadow-lg transition-all duration-200 ${
                  allowed ? 'hover:-translate-y-1 hover:shadow-2xl hover:brightness-110 active:scale-[0.98]' : 'opacity-50 cursor-not-allowed'
                }`}
              >
                <div className="flex items-start justify-between">
                  <Icon size={36} strokeWidth={1.75} />
                  {allowed ? <ChevronRight size={22} className="opacity-90" /> : <Lock size={18} className="opacity-90" />}
                </div>
                <div>
                  <p className="text-2xl font-bold leading-tight">{tile.name}</p>
                  <p className="text-sm text-white/75 mt-0.5">{tile.subtitle}</p>
                </div>
              </button>
            );
          })}
        </div>

        {/* Stat tiles: one pair per module, in the same column as its module tile (a separate section, 56px below the tiles) */}
        <div className="pt-9 space-y-5">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-5">{TILE_ORDER.map((id) => statTile(STATS[id][0]))}</div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-5">{TILE_ORDER.map((id) => statTile(STATS[id][1]))}</div>
        </div>
      </main>
    </div>
  );
}
