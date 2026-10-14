import { useEffect, useState } from 'react';
import { ArrowRight, CalendarClock, Cog, FileText, LogOut, Lock, Truck, type LucideIcon } from 'lucide-react';
import { MODULE_ORDER, MODULES, type ModuleId } from '../lib/modules';

interface ModuleSelectPageProps {
  userName: string;
  // Modules the signed-in user may open (based on their allowed item types).
  accessibleModules: ModuleId[];
  onSelectModule: (module: ModuleId) => void;
  onSignOut: () => void;
}

interface SummaryNumbers {
  total_equipment: number;
  equipment_due_7days: number;
  document_due_7days: number;
  expiring_documents: number;
  total_vehicles: number;
}

// Per-card visuals: a distinct accent for each module, matching the colours
// the module dashboards already use (blue / orange / purple).
const CARD_STYLE: Record<ModuleId, { accentText: string; accentBg: string; ring: string; watermark: LucideIcon }> = {
  equipment: { accentText: 'text-blue-600', accentBg: 'bg-blue-50', ring: 'hover:shadow-blue-200/70', watermark: Cog },
  vehicles: { accentText: 'text-orange-600', accentBg: 'bg-orange-50', ring: 'hover:shadow-orange-200/70', watermark: Truck },
  documents: { accentText: 'text-purple-600', accentBg: 'bg-purple-50', ring: 'hover:shadow-purple-200/70', watermark: FileText },
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
  tone: string;
  // The module whose access this number belongs to.
  module: ModuleId;
}

export default function ModuleSelectPage({ userName, accessibleModules, onSelectModule, onSignOut }: ModuleSelectPageProps) {
  const [summary, setSummary] = useState<SummaryNumbers | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    fetch('/api/dashboard/summary')
      .then((response) => (response.ok ? response.json() : null))
      .then((json) => {
        if (cancelled || !json) return;
        const num = (value: unknown) => Number(value) || 0;
        setSummary({
          total_equipment: num(json.total_equipment),
          equipment_due_7days: num(json.equipment_due_7days),
          document_due_7days: num(json.document_due_7days),
          expiring_documents: num(json.expiring_documents),
          total_vehicles: num(json.total_vehicles),
        });
      })
      .catch(() => {
        // The stats row is a nicety - the cards still work without it.
      })
      .finally(() => {
        if (!cancelled) setSummaryLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const allStats: StatTile[] = [
    { key: 'assets', label: 'Active assets', value: summary?.total_equipment ?? null, icon: Cog, tone: 'text-blue-600 bg-blue-100', module: 'equipment' },
    {
      key: 'tasks',
      label: 'Tasks due this week',
      value: summary ? summary.equipment_due_7days + summary.document_due_7days : null,
      icon: CalendarClock,
      tone: 'text-amber-600 bg-amber-100',
      module: 'equipment',
    },
    { key: 'documents', label: 'Documents expiring in 30 days', value: summary?.expiring_documents ?? null, icon: FileText, tone: 'text-purple-600 bg-purple-100', module: 'documents' },
    { key: 'vehicles', label: 'Total vehicles', value: summary?.total_vehicles ?? null, icon: Truck, tone: 'text-orange-600 bg-orange-100', module: 'vehicles' },
  ];
  const stats = allStats.filter((tile) => accessibleModules.includes(tile.module));

  const showStats = stats.length > 0 && (summaryLoading || summary !== null);

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
            <h1 className="text-3xl lg:text-4xl font-bold tracking-tight">
              Welcome back{userName ? `, ${userName}` : ''}
            </h1>
            <p className="text-slate-300 mt-2">{bahrainDateLabel()}</p>
          </div>
        </div>
      </div>

      <main className="flex-1 max-w-6xl w-full mx-auto px-6 lg:px-8 -mt-16 pb-12">
        {/* Module cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {MODULE_ORDER.map((id) => {
            const module = MODULES[id];
            const style = CARD_STYLE[id];
            const Icon = module.icon;
            const Watermark = style.watermark;
            const allowed = accessibleModules.includes(id);

            return (
              <button
                key={id}
                type="button"
                disabled={!allowed}
                onClick={() => onSelectModule(id)}
                className={`group relative text-left rounded-2xl overflow-hidden bg-white border border-slate-200 shadow-md transition-all duration-200 ${
                  allowed ? `hover:-translate-y-1.5 hover:shadow-2xl ${style.ring}` : 'opacity-60 cursor-not-allowed'
                }`}
              >
                <div className={`relative bg-gradient-to-br ${module.gradient} px-7 pt-8 pb-10 overflow-hidden`}>
                  <Watermark size={150} className="absolute -right-6 -bottom-8 text-white/10" strokeWidth={1.25} />
                  <div className="relative w-16 h-16 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center shadow-inner">
                    <Icon size={34} className="text-white" />
                  </div>
                  {!allowed && <Lock size={20} className="absolute top-5 right-5 text-white/80" />}
                </div>

                <div className="px-7 py-6">
                  <h2 className="text-xl font-bold text-slate-800">{module.label}</h2>
                  <p className="text-sm text-slate-500 mt-2 leading-relaxed min-h-[2.75rem]">{module.description}</p>
                  <span
                    className={`mt-5 inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-semibold ${
                      allowed ? `${style.accentBg} ${style.accentText}` : 'bg-slate-100 text-slate-500'
                    }`}
                  >
                    {allowed ? 'Open module' : 'No access'}
                    {allowed && <ArrowRight size={16} className="transition-transform group-hover:translate-x-1" />}
                  </span>
                </div>
              </button>
            );
          })}
        </div>

        {/* Quick stats */}
        {showStats && (
          <section className="mt-10">
            <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-3">At a glance</h2>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {stats.map((tile) => {
                const Icon = tile.icon;
                return (
                  <div key={tile.key} className="flex items-center gap-3 bg-white rounded-xl border border-slate-200 shadow-sm px-4 py-3.5">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${tile.tone}`}>
                      <Icon size={20} />
                    </div>
                    <div className="min-w-0">
                      {tile.value === null ? (
                        <div className="h-6 w-10 rounded bg-slate-200 animate-pulse" />
                      ) : (
                        <p className="text-2xl font-bold text-slate-800 leading-tight">{tile.value}</p>
                      )}
                      <p className="text-xs text-slate-500 leading-tight mt-0.5">{tile.label}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
