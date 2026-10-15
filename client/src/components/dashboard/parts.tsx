import { ReactNode, useEffect, useState } from 'react';
import { Loader2, type LucideIcon } from 'lucide-react';

// ---------- data helpers ----------

export interface FetchState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

// Loads a JSON endpoint once (and again if the url changes). Errors are kept
// in state so a failing list shows a message instead of crashing the page.
export function useJson<T>(url: string): FetchState<T> {
  const [state, setState] = useState<FetchState<T>>({ data: null, loading: true, error: null });

  useEffect(() => {
    let cancelled = false;
    setState({ data: null, loading: true, error: null });

    fetch(url)
      .then(async (response) => {
        if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
        return (await response.json()) as T;
      })
      .then((data) => {
        if (!cancelled) setState({ data, loading: false, error: null });
      })
      .catch((error: unknown) => {
        console.error(`Dashboard request failed (${url}):`, error);
        if (!cancelled) setState({ data: null, loading: false, error: error instanceof Error ? error.message : 'Unknown error' });
      });

    return () => {
      cancelled = true;
    };
  }, [url]);

  return state;
}

export function num(value: unknown): number {
  return Number(value) || 0;
}

// Whole days from today to a 'YYYY-MM-DD' (or ISO) date; negative = past.
export function daysUntil(dateStr?: string | null): number | null {
  if (!dateStr) return null;
  const due = new Date(dateStr);
  if (Number.isNaN(due.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

export function formatDMY(value?: string | null): string {
  if (!value) return '-';
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (match) return `${match[3]}/${match[2]}/${match[1]}`;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`;
}

export function titleCase(value: string): string {
  return value
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

// ---------- greeting ----------

function bahrainHour(): number {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Bahrain', hour: 'numeric', hour12: false }).formatToParts(new Date());
  const hour = Number(parts.find((part) => part.type === 'hour')?.value);
  return Number.isFinite(hour) ? hour % 24 : new Date().getHours();
}

function greeting(name: string): string {
  const hour = bahrainHour();
  const period = hour >= 5 && hour < 12 ? 'Good morning' : hour >= 12 && hour < 17 ? 'Good afternoon' : 'Good evening';
  return `${period}, ${name}`;
}

function dateLabel(): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Bahrain',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date());
}

export function DashboardBanner({ moduleLabel, gradient }: { moduleLabel: string; gradient: string }) {
  const [name, setName] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/auth/me')
      .then((response) => (response.ok ? response.json() : null))
      .then((json) => {
        if (!cancelled) setName(json?.user?.name || null);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className={`rounded-2xl bg-gradient-to-r ${gradient} px-6 py-7 shadow-md`}>
      <h1 className="text-2xl lg:text-3xl font-bold text-white">{greeting(name || 'there')}</h1>
      <p className="text-white/80 mt-1.5">
        {moduleLabel} &middot; {dateLabel()}
      </p>
    </div>
  );
}

// ---------- stat tiles ----------

export interface StatTileDef {
  key: string;
  label: string;
  value: number | null;
  icon: LucideIcon;
  tone: string;
  onClick?: () => void;
}

export function StatTiles({ tiles, loading }: { tiles: StatTileDef[]; loading: boolean }) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {tiles.map((tile) => {
        const Icon = tile.icon;
        const content = (
          <>
            <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${tile.tone}`}>
              <Icon size={22} />
            </div>
            <div className="min-w-0">
              {loading || tile.value === null ? (
                <div className="h-7 w-12 rounded bg-slate-200 animate-pulse" />
              ) : (
                <p className="text-2xl font-bold text-slate-800 leading-tight">{tile.value}</p>
              )}
              <p className="text-xs text-slate-500 leading-tight mt-0.5">{tile.label}</p>
            </div>
          </>
        );
        const className =
          'flex items-center gap-3.5 bg-white rounded-xl border border-slate-200 shadow-sm px-4 py-4 text-left transition-all duration-200';
        return tile.onClick ? (
          <button key={tile.key} type="button" onClick={tile.onClick} className={`${className} hover:shadow-md hover:-translate-y-0.5`}>
            {content}
          </button>
        ) : (
          <div key={tile.key} className={className}>
            {content}
          </div>
        );
      })}
    </div>
  );
}

// ---------- panels & empty states ----------

export function Panel({
  title,
  icon: Icon,
  action,
  children,
  className = '',
  iconClassName = 'text-slate-400',
}: {
  title: string;
  icon: LucideIcon;
  action?: { label: string; onClick: () => void };
  children: ReactNode;
  // e.g. 'flex-1' so a card stretches to fill the rest of a flex column.
  className?: string;
  iconClassName?: string;
}) {
  return (
    <section className={`bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col ${className}`}>
      <div className="flex items-center justify-between gap-3 px-5 py-3.5 border-b border-slate-100">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-800">
          <Icon size={16} className={iconClassName} />
          {title}
        </h2>
        {action && (
          <button type="button" onClick={action.onClick} className="text-xs font-medium text-cyan-600 hover:text-cyan-700 hover:underline">
            {action.label}
          </button>
        )}
      </div>
      {children}
    </section>
  );
}

export function EmptyState({ icon: Icon, message, hint }: { icon: LucideIcon; message: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-10 px-4">
      <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mb-3">
        <Icon size={22} className="text-slate-400" />
      </div>
      <p className="text-sm font-medium text-slate-600">{message}</p>
      {hint && <p className="text-xs text-slate-400 mt-1">{hint}</p>}
    </div>
  );
}

export function LoadingState() {
  return (
    <div className="flex items-center justify-center py-10">
      <Loader2 className="w-6 h-6 animate-spin text-slate-300" />
    </div>
  );
}

export function ErrorState({ message }: { message: string }) {
  return <p className="text-sm text-red-600 bg-red-50 border-t border-red-100 px-5 py-4">Could not load this section ({message}).</p>;
}

// Standard table shell used by the dashboard lists.
export function TableHead({ columns }: { columns: string[] }) {
  return (
    <thead>
      <tr className="bg-slate-50 border-b border-slate-200">
        {columns.map((column) => (
          <th key={column} className="text-left px-5 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">
            {column}
          </th>
        ))}
      </tr>
    </thead>
  );
}
