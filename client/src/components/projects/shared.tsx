import { ReactNode } from 'react';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { FLAG_ORDER, amount, facetOptions, flagColor, normalizeFilters, sharePct, todayISO, type Project, type ProjectFilters } from '../../lib/projects';

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

// A money value followed by its share of a total, e.g. "119,408 (18.2%)".
export function Amt({ value, total, format = amount }: { value?: number | null; total?: number | null; format?: (value?: number | null) => string }) {
  return (
    <>
      {format(value)} <span className="text-gray-400 text-xs font-normal">({sharePct(value, total)})</span>
    </>
  );
}

// Customer / project type / management flag dropdowns used by the dashboard and
// the All Projects page. The dropdowns cascade: each one only offers values that
// still fit the other selections (and the date range), and "All" re-expands the others.
export function FilterBar({
  projects,
  filters,
  onChange,
  showProjectFilter = false,
  showDateFilter = false,
}: {
  projects: Project[];
  filters: ProjectFilters;
  onChange: (filters: ProjectFilters) => void;
  // Adds the "All Projects" single-project dropdown (used by the dashboard).
  showProjectFilter?: boolean;
  // Adds the single "As of Date" input and its reset-to-today button (used by the dashboard).
  showDateFilter?: boolean;
}) {
  const selectClass =
    'px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white text-slate-600 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent';
  const inputClass = `${selectClass} w-36`;

  const change = (patch: Partial<ProjectFilters>) => onChange(normalizeFilters(projects, { ...filters, ...patch }));

  const customers = facetOptions(projects, filters, 'customer');
  const types = facetOptions(projects, filters, 'type');
  const availableFlags = facetOptions(projects, filters, 'flag');
  const flags = [...FLAG_ORDER.filter((flag) => availableFlags.includes(flag)), ...availableFlags.filter((flag) => !FLAG_ORDER.includes(flag))];
  const projectIds = facetOptions(projects, filters, 'project').sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  const customerOf = (id: string) => projects.find((project) => project.project_id === id)?.customer;

  const hasFilters = filters.customer || filters.type || filters.flag || filters.project;

  return (
    <div className="flex flex-wrap items-end gap-3">
      {showProjectFilter && (
        <select
          value={filters.project || ''}
          onChange={(e) => change({ project: e.target.value })}
          aria-label="Project"
          className={`${selectClass} ${filters.project ? 'border-teal-500 ring-1 ring-teal-500 text-teal-700 font-medium' : ''}`}
        >
          <option value="">All Projects</option>
          {projectIds.map((id) => (
            <option key={id} value={id}>
              {id} — {customerOf(id)}
            </option>
          ))}
        </select>
      )}
      <select value={filters.customer} onChange={(e) => change({ customer: e.target.value, project: '' })} aria-label="Customer" className={selectClass}>
        <option value="">All Customers</option>
        {customers.map((customer) => (
          <option key={customer} value={customer}>{customer}</option>
        ))}
      </select>
      <select value={filters.type} onChange={(e) => change({ type: e.target.value })} aria-label="Project type" className={selectClass}>
        <option value="">All Project Types</option>
        {types.map((type) => (
          <option key={type} value={type}>{type}</option>
        ))}
      </select>
      <select value={filters.flag} onChange={(e) => change({ flag: e.target.value })} aria-label="Management flag" className={selectClass}>
        <option value="">All Management Flags</option>
        {flags.map((flag) => (
          <option key={flag} value={flag}>{flag}</option>
        ))}
      </select>

      {showDateFilter && (
        <>
          <label className="flex flex-col text-[11px] font-medium text-slate-400 leading-tight">
            As of Date
            <input type="date" value={filters.asOf || ''} onChange={(e) => change({ asOf: e.target.value })} className={inputClass} />
          </label>
          {filters.asOf !== todayISO() && (
            <button type="button" onClick={() => change({ asOf: todayISO() })} className="pb-2 text-sm font-medium text-teal-600 hover:underline">
              Reset to today
            </button>
          )}
        </>
      )}

      {hasFilters && (
        <button
          type="button"
          onClick={() => onChange({ ...filters, customer: '', type: '', flag: '', project: '' })}
          className="pb-2 text-sm font-medium text-teal-600 hover:underline"
        >
          Clear filters
        </button>
      )}
    </div>
  );
}

// Colour-banded headline figure (the KPI tiles on the dashboard): coloured band with the
// heading and its percentage in brackets, the amount underneath. Compact, fixed height.
export function KpiTile({
  label,
  value,
  percent,
  band,
  loading,
}: {
  label: string;
  value: string;
  // Share shown in the heading, e.g. "65.8%".
  percent: string;
  band: string;
  loading?: boolean;
}) {
  return (
    <div className="h-24 min-w-0 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
      {/* Fixed-height band: a long heading wraps onto a second line instead of being cut off. */}
      <div className={`${band} h-10 px-2 min-[1500px]:px-3 flex items-center text-xs font-semibold text-white leading-tight`}>
        <span>
          {label} <span className="font-normal text-white/70">({percent})</span>
        </span>
      </div>
      <div className="flex-1 px-2 min-[1500px]:px-3 flex items-center min-w-0">
        {loading ? <Skeleton className="h-6 w-24" /> : <p className="text-xs min-[1360px]:text-sm min-[1560px]:text-base font-bold text-slate-800 whitespace-nowrap">{value}</p>}
      </div>
    </div>
  );
}

// ---------- dropdown filters for the transaction lists (Sales, Payments, Procurement, Adjustments) ----------

export interface LedgerFilterDef<T> {
  key: string;
  // First option, e.g. "All Customers".
  allLabel: string;
  pick: (row: T) => string | null | undefined;
  // Filters cleared whenever this one changes (customer -> project).
  resets?: string[];
  // Fixed order for the options (e.g. document types); anything else is sorted A-Z.
  order?: string[];
}

export type LedgerFilterValues = Record<string, string>;

export const emptyLedgerValues = <T,>(defs: LedgerFilterDef<T>[]): LedgerFilterValues => Object.fromEntries(defs.map((def) => [def.key, '']));

// Rows that satisfy every selected filter, optionally ignoring one (for cascading options).
export function applyLedgerFilters<T>(rows: T[], defs: LedgerFilterDef<T>[], values: LedgerFilterValues, skip?: string): T[] {
  return rows.filter((row) => defs.every((def) => def.key === skip || !values[def.key] || def.pick(row) === values[def.key]));
}

// Options for one dropdown come from the rows that match all the OTHER filters, so
// choosing a customer narrows the project list and "All" widens everything again.
function ledgerOptions<T>(rows: T[], defs: LedgerFilterDef<T>[], values: LedgerFilterValues, def: LedgerFilterDef<T>): string[] {
  const found = [...new Set(applyLedgerFilters(rows, defs, values, def.key).map(def.pick).filter((v): v is string => Boolean(v)))];
  const first = def.order ? def.order.filter((v) => found.includes(v)) : [];
  return [...first, ...found.filter((v) => !first.includes(v)).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))];
}

export function LedgerFilters<T>({
  rows,
  defs,
  values,
  onChange,
  extra,
}: {
  // The full (unfiltered by dropdowns) data the options are derived from.
  rows: T[];
  defs: LedgerFilterDef<T>[];
  values: LedgerFilterValues;
  onChange: (values: LedgerFilterValues) => void;
  // Extra controls on the same row (the As of Date picker).
  extra?: ReactNode;
}) {
  const selectClass =
    'px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white text-slate-600 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent';

  const change = (def: LedgerFilterDef<T>, value: string) => {
    let next: LedgerFilterValues = { ...values, [def.key]: value };
    for (const key of def.resets ?? []) next[key] = '';
    // Drop any other selection that no longer fits (keeps the dropdowns consistent).
    for (let pass = 0; pass < defs.length; pass += 1) {
      let changed = false;
      for (const other of defs) {
        if (next[other.key] && !ledgerOptions(rows, defs, next, other).includes(next[other.key])) {
          next = { ...next, [other.key]: '' };
          changed = true;
        }
      }
      if (!changed) break;
    }
    onChange(next);
  };

  const active = defs.some((def) => values[def.key]);

  return (
    <div className="flex flex-wrap items-end gap-3">
      {defs.map((def) => (
        <select key={def.key} value={values[def.key]} onChange={(e) => change(def, e.target.value)} aria-label={def.allLabel.replace(/^All /, '')} className={selectClass}>
          <option value="">{def.allLabel}</option>
          {ledgerOptions(rows, defs, values, def).map((option) => (
            <option key={option} value={option}>{option}</option>
          ))}
        </select>
      ))}
      {extra}
      {active && (
        <button type="button" onClick={() => onChange(emptyLedgerValues(defs))} className="pb-2 text-sm font-medium text-teal-600 hover:underline">
          Clear filters
        </button>
      )}
    </div>
  );
}

// "Showing 12 of 60 rows"
export function RowCount({ shown, total, noun = 'rows' }: { shown: number; total: number; noun?: string }) {
  return (
    <p className="text-xs text-slate-500">
      Showing <span className="font-semibold text-slate-700">{shown}</span> of {total} {noun}
    </p>
  );
}

// Single "As of Date" input for the pages: rows from the start up to this date are shown.
export function AsOfDateFilter({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const today = todayISO();
  return (
    <div className="flex flex-wrap items-end gap-3">
      <label className="flex flex-col text-[11px] font-medium text-slate-400 leading-tight">
        As of Date
        <input
          type="date"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-36 px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white text-slate-600 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
        />
      </label>
      {value !== today && (
        <button type="button" onClick={() => onChange(today)} className="pb-2 text-sm font-medium text-teal-600 hover:underline">
          Today
        </button>
      )}
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
      <div className={`${height} relative flex justify-center`}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
            <Pie data={PROCUREMENT_SPLIT} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius="58%" outerRadius="85%" paddingAngle={2} stroke="none">
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

export interface RateSlice {
  name: string;
  // Percentage (0-100) - also the slice size.
  value: number;
  color: string;
}

// Donut whose slices are rates (billing %, collection %), with a centre label
// and a legend underneath (name and percentage for every slice).
export function RateDonut({
  slices,
  centerLabel,
  centerValue,
}: {
  slices: RateSlice[];
  centerLabel: string;
  centerValue: string;
}) {
  return (
    <div className="px-5 py-4">
      <div className="h-64 relative">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
            <Pie data={slices} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius="58%" outerRadius="85%" paddingAngle={2} stroke="none" label={false} labelLine={false}>
              {slices.map((slice) => (
                <Cell key={slice.name} fill={slice.color} />
              ))}
            </Pie>
            <Tooltip formatter={(value, name) => [`${Number(value).toFixed(1)}%`, String(name)]} />
          </PieChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <span className="text-[11px] text-slate-400 font-medium uppercase tracking-wide">{centerLabel}</span>
          <span className="text-2xl font-extrabold text-slate-800">{centerValue}</span>
        </div>
      </div>
      <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5">
        {slices.map((slice) => (
          <div key={slice.name} className="flex items-center justify-between gap-3 text-xs">
            <span className="flex items-center gap-2 text-slate-600 min-w-0">
              <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: slice.color }} />
              <span className="truncate">{slice.name}</span>
            </span>
            <span className="font-semibold text-slate-800 flex-shrink-0">{slice.value.toFixed(1)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// Shared layout for the Project Tracking sidebar pages: the title + filters (+ summary cards) stay
// frozen at the top and only the data below scrolls. Fills the viewport minus the main-area padding
// (1rem on small screens, 2rem on large); there is no title bar in this module. Pair the body with `ScrollBody`
// (or a Panel + `PANEL_FILL`/`TABLE_SCROLL` classes) so the table header row freezes as well.
// `title` / `subtitle` are still accepted from callers but not drawn: pages open straight with their filters.
export function PageShell({ header, children }: { title?: string; subtitle?: ReactNode; header?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-4 h-[calc(100vh-2rem)] lg:h-[calc(100vh-4rem)] min-h-[26rem]">
      {header && <div className="shrink-0 space-y-4 pt-10 lg:pt-0">{header}</div>}
      <div className="flex-1 min-h-0 flex flex-col gap-4">{children}</div>
    </div>
  );
}

// Panel fills the rest of the page; the table wrapper inside scrolls and its <thead> sticks to the top of it.
export const PANEL_FILL = 'flex-1 min-h-0';
export const TABLE_SCROLL = 'flex-1 min-h-0 overflow-auto';
