import { ReactNode } from 'react';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { FLAG_ORDER, flagColor, unique, type Project, type ProjectFilters } from '../../lib/projects';

export function FlagDot({ flag }: { flag?: string | null }) {
  return (
    <span className="inline-flex items-center gap-1.5" title={flag || 'No flag'}>
      <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: flagColor(flag) }} />
    </span>
  );
}

export function FlagBadge({ flag }: { flag?: string | null }) {
  const color = flagColor(flag);
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap"
      style={{ backgroundColor: `${color}1a`, color }}
    >
      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
      {flag || 'No flag'}
    </span>
  );
}

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`rounded bg-slate-200 animate-pulse ${className}`} />;
}

export function SkeletonBlock({ height = 'h-56' }: { height?: string }) {
  return (
    <div className={`${height} px-5 py-4 flex flex-col gap-3`}>
      <Skeleton className="h-4 w-1/3" />
      <Skeleton className="flex-1" />
    </div>
  );
}

// Customer / project type / management flag dropdowns used by the dashboard and
// the All Projects page.
export function FilterBar({
  projects,
  filters,
  onChange,
}: {
  projects: Project[];
  filters: ProjectFilters;
  onChange: (filters: ProjectFilters) => void;
}) {
  const selectClass =
    'px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white text-slate-600 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent';
  const flags = unique([...FLAG_ORDER, ...projects.map((project) => project.management_flag)]);

  return (
    <div className="flex flex-wrap items-center gap-3">
      <select value={filters.customer} onChange={(e) => onChange({ ...filters, customer: e.target.value })} className={selectClass}>
        <option value="">All Customers</option>
        {unique(projects.map((project) => project.customer)).map((customer) => (
          <option key={customer} value={customer}>{customer}</option>
        ))}
      </select>
      <select value={filters.type} onChange={(e) => onChange({ ...filters, type: e.target.value })} className={selectClass}>
        <option value="">All Project Types</option>
        {unique(projects.map((project) => project.project_type)).map((type) => (
          <option key={type} value={type}>{type}</option>
        ))}
      </select>
      <select value={filters.flag} onChange={(e) => onChange({ ...filters, flag: e.target.value })} className={selectClass}>
        <option value="">All Management Flags</option>
        {flags.map((flag) => (
          <option key={flag} value={flag}>{flag}</option>
        ))}
      </select>
      {(filters.customer || filters.type || filters.flag) && (
        <button
          type="button"
          onClick={() => onChange({ customer: '', type: '', flag: '' })}
          className="text-sm font-medium text-teal-600 hover:underline"
        >
          Clear filters
        </button>
      )}
    </div>
  );
}

// Colour-banded headline figure (the six KPI tiles on the dashboard).
export function KpiTile({ label, value, band, loading }: { label: string; value: string; band: string; loading?: boolean }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      <div className={`${band} px-4 py-2 text-xs font-semibold text-white tracking-wide`}>{label}</div>
      <div className="px-4 py-4">
        {loading ? <Skeleton className="h-7 w-32" /> : <p className="text-xl font-bold text-slate-800 whitespace-nowrap">{value}</p>}
      </div>
    </div>
  );
}

export function SummaryCard({ label, value, tone = 'text-slate-800' }: { label: string; value: ReactNode; tone?: string }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-5 py-4">
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`text-xl font-bold mt-1 ${tone}`}>{value}</p>
    </div>
  );
}

// Estimated Material / Subcontract / Labour / Other split. These percentages are
// illustrative - the app does not hold procurement data yet.
export const PROCUREMENT_SPLIT = [
  { name: 'Material', value: 52, color: '#0d9488' },
  { name: 'Subcontract', value: 22, color: '#2563eb' },
  { name: 'Labour', value: 15, color: '#f59e0b' },
  { name: 'Other', value: 11, color: '#94a3b8' },
];

export function ProcurementDonut({ height = 'h-52' }: { height?: string }) {
  return (
    <div className="px-5 py-4">
      <div className={`${height} relative`}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={PROCUREMENT_SPLIT} dataKey="value" nameKey="name" innerRadius="58%" outerRadius="85%" paddingAngle={2} stroke="none">
              {PROCUREMENT_SPLIT.map((slice) => (
                <Cell key={slice.name} fill={slice.color} />
              ))}
            </Pie>
            <Tooltip formatter={(value) => `${value}%`} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 mt-3">
        {PROCUREMENT_SPLIT.map((slice) => (
          <div key={slice.name} className="flex items-center justify-between text-xs">
            <span className="flex items-center gap-2 text-slate-600">
              <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: slice.color }} />
              {slice.name}
            </span>
            <span className="font-semibold text-slate-800">{slice.value}%</span>
          </div>
        ))}
      </div>
      <p className="text-[11px] text-slate-400 mt-3">Illustrative split - procurement data is not tracked yet.</p>
    </div>
  );
}
