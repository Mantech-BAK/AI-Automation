import { useState } from 'react';
import { TrendingUp } from 'lucide-react';
import { ErrorState, Panel, TableHead, useJson } from '../../components/dashboard/parts';
import { Amt, DateRangeFilter, SkeletonBlock } from '../../components/projects/shared';
import { amount2, formatDMY, type ArTransaction } from '../../lib/projects';

const STATUS_STYLES: Record<string, string> = {
  Paid: 'bg-emerald-50 text-emerald-700',
  Pending: 'bg-amber-50 text-amber-700',
  Overdue: 'bg-red-50 text-red-700',
};

// Sales: every AR invoice, filterable by transaction date.
export default function Sales() {
  const transactions = useJson<ArTransaction[]>('/api/projects/ar-transactions');
  const [range, setRange] = useState({ from: '', to: '' });

  const rows = (transactions.data ?? []).filter(
    (row) => (!range.from || (row.transaction_date ?? '') >= range.from) && (!range.to || (row.transaction_date ?? '') <= range.to)
  );
  const total = rows.reduce((sum, row) => sum + (row.amount_bhd ?? 0), 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Sales</h1>
        <p className="text-slate-500 mt-1">All invoices raised against projects</p>
      </div>

      <DateRangeFilter from={range.from} to={range.to} onChange={setRange} />

      <Panel title={`Invoices${transactions.data ? ` (${rows.length})` : ''}`} icon={TrendingUp}>
        {transactions.loading ? (
          <SkeletonBlock height="h-64" />
        ) : transactions.error ? (
          <ErrorState message={transactions.error} />
        ) : rows.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-slate-500">No transactions found</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <TableHead columns={['Project ID', 'Customer', 'Invoice No', 'Transaction Date', 'Amount (BHD)', 'Due Date', 'Status']} />
              <tbody className="divide-y divide-slate-100">
                {rows.map((row) => (
                  <tr key={row.id} className="hover:bg-slate-50">
                    <td className="px-5 py-2.5 font-medium text-slate-800 whitespace-nowrap">{row.project_id}</td>
                    <td className="px-5 py-2.5 text-slate-600">{row.customer || '-'}</td>
                    <td className="px-5 py-2.5 text-slate-600 whitespace-nowrap">{row.transaction_ref || '-'}</td>
                    <td className="px-5 py-2.5 text-slate-600 whitespace-nowrap">{formatDMY(row.transaction_date)}</td>
                    <td className="px-5 py-2.5 text-slate-700 text-right whitespace-nowrap">
                      <Amt value={row.amount_bhd} total={total} format={amount2} />
                    </td>
                    <td className="px-5 py-2.5 text-slate-600 whitespace-nowrap">{formatDMY(row.due_date)}</td>
                    <td className="px-5 py-2.5">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLES[row.status ?? ''] ?? 'bg-slate-100 text-slate-600'}`}>
                        {row.status || '-'}
                      </span>
                    </td>
                  </tr>
                ))}
                <tr className="bg-teal-50">
                  <td colSpan={4} className="px-5 py-3 text-sm font-bold text-slate-700 text-right">Total</td>
                  <td className="px-5 py-3 text-right font-bold text-slate-900 whitespace-nowrap">
                    <Amt value={total} total={total} format={amount2} />
                  </td>
                  <td colSpan={2} />
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}
