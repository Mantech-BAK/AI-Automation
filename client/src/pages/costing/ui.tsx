import type { ReactNode } from 'react';
import { STATUS_STYLES, statusLabel } from '../../lib/costing';

export const inputCls =
  'w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent disabled:bg-slate-50 disabled:text-slate-500';
export const selectCls =
  'px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white text-slate-600 focus:outline-none focus:ring-2 focus:ring-teal-500';
export const primaryBtn =
  'inline-flex items-center gap-2 px-4 py-2 text-sm font-medium bg-gradient-to-r from-cyan-500 to-blue-600 text-white rounded-lg hover:shadow-lg transition-shadow disabled:opacity-50';
export const secondaryBtn =
  'inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50';

export function Badge({ status }: { status: string }) {
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${STATUS_STYLES[status] ?? STATUS_STYLES.open}`}>{statusLabel(status)}</span>
  );
}

// The page title is shown in the top bar, so pages do not repeat it: this row holds just the page actions.
// `keepTitle` (record pages only) adds a compact identity line - the enquiry / quotation number and its status -
// because that is not shown anywhere else.
export function PageHeader({ title, subtitle, actions, keepTitle }: { title?: ReactNode; subtitle?: ReactNode; actions?: ReactNode; keepTitle?: boolean }) {
  if (!actions && !keepTitle) return null;
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      {keepTitle ? (
        <div className="min-w-0">
          <h1 className="text-base font-semibold text-slate-800 flex flex-wrap items-center gap-2">{title}</h1>
          {subtitle && <p className="text-slate-500 text-xs mt-0.5">{subtitle}</p>}
        </div>
      ) : (
        <div />
      )}
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Card({ title, children, right }: { title: string; children: ReactNode; right?: ReactNode }) {
  return (
    <section className="bg-white rounded-xl border border-slate-200 shadow-sm">
      <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-slate-100">
        <h2 className="text-sm font-semibold text-slate-800">{title}</h2>
        {right}
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

export function ErrorBanner({ message, onDismiss }: { message: string; onDismiss?: () => void }) {
  return (
    <div role="alert" className="flex items-start justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
      <span>{message}</span>
      {onDismiss && (
        <button onClick={onDismiss} className="text-red-500 hover:text-red-700 font-medium flex-shrink-0">
          Dismiss
        </button>
      )}
    </div>
  );
}

export function Field({ label, required, children }: { label: string; required?: boolean; children: ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 mb-1">
        {label}
        {required && ' *'}
      </label>
      {children}
    </div>
  );
}

export function Loading() {
  return <p className="px-5 py-8 text-center text-sm text-slate-400">Loading...</p>;
}

export const thCls = 'px-5 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap bg-slate-50';
export const tdCls = 'px-5 py-2.5';
