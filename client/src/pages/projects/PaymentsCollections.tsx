import { useState } from 'react';
import { CreditCard } from 'lucide-react';
import { ErrorState, Panel, TableHead, useJson } from '../../components/dashboard/parts';
import { Amt, SkeletonBlock } from '../../components/projects/shared';
import { amount2, formatDMY, type ArTransaction } from '../../lib/projects';

type Tab = 'payments' | 'ar';

const STATUS_STYLES: Record<string, string> = {
  Paid: 'bg-emerald-50 text-emerald-700',
  Pending: 'bg-amber-50 text-amber-700',
  Overdue: 'bg-red-50 text-red-700',
};

const TABS: { id: Tab; label: string; empty: string }[] = [
  { id: 'payments', label: 'Payments', empty: 'No transactions found' },
  { id: 'ar', label: 'AR & Collections', empty: 'No transactions found' },
];

// Payments = invoices already paid; AR & Collections = invoices still to collect
// (pending or overdue).
export default function PaymentsCollections() {
  const [tab, setTab] = useState<Tab>('payments');
  const transactions = useJson<ArTransaction[]>('/api/projects/ar-transactions');

  const all = transactions.data ?? [];
  const rows = all.filter((row) => (tab === 'payments' ? row.status === 'Paid' : row.status !== 'Paid'));
  const total = rows.reduce((sum, row) => sum + (row.amount_bhd ?? 0), 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Payments &amp; Collections</h1>
        <p className="text-slate-500 mt-1">Invoices received and receivables still to be collected</p>
      </div>

      <div className="flex gap-2">
        {TABS.map((item) => {
          const count = all.filter((row) => (item.id === 'payments' ? row.status === 'Paid' : row.status !== 'Paid')).length;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                tab === item.id ? 'bg-teal-600 text-white' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
              }`}
            >
              {item.label}
              {transactions.data && <span className={`ml-2 text-xs ${tab === item.id ? 'text-teal-100' : 'text-slate-400'}`}>{count}</span>}
            </button>
          );
        })}
      </div>

      <Panel title={tab === 'payments' ? 'Payments' : 'AR & Collections'} icon={CreditCard}>
        {transactions.loading ? (
          <SkeletonBlock height="h-64" />
        ) : transactions.error ? (
          <ErrorState message={transactions.error} />
        ) : rows.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-slate-500">No transactions found</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <TableHead columns={['Project ID', 'Customer', 'Invoice No', 'Amount (BHD)', 'Due Date', 'Status']} />
              <tbody className="divide-y divide-slate-100">
                {rows.map((row) => (
                  <tr key={row.id} className="hover:bg-slate-50">
                    <td className="px-5 py-2.5 font-medium text-slate-800 whitespace-nowrap">{row.project_id}</td>
                    <td className="px-5 py-2.5 text-slate-600">{row.customer || '-'}</td>
                    <td className="px-5 py-2.5 text-slate-600 whitespace-nowrap">{row.transaction_ref || '-'}</td>
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
                  <td colSpan={3} className="px-5 py-3 text-sm font-bold text-slate-700 text-right">Total</td>
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
