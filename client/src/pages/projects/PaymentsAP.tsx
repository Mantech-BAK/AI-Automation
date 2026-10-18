import { useState } from 'react';
import { CreditCard } from 'lucide-react';
import { ErrorState, Panel, TableHead, useJson } from '../../components/dashboard/parts';
import { Amt, SkeletonBlock } from '../../components/projects/shared';
import { AR_INVOICE, INCOMING_PAYMENT, amount2, formatDMY, type ArTransaction } from '../../lib/projects';

type Tab = 'payments' | 'invoices';

const TABS: { id: Tab; label: string; type: string; title: string }[] = [
  { id: 'payments', label: 'Incoming Payments', type: INCOMING_PAYMENT, title: 'Incoming Payments' },
  { id: 'invoices', label: 'AR Invoices', type: AR_INVOICE, title: 'AR Invoices' },
];

const STATUS_STYLES: Record<string, string> = {
  Paid: 'bg-emerald-50 text-emerald-700',
  Open: 'bg-sky-50 text-sky-700',
};

// Payments & AP: money received from customers, and the AR invoices raised.
export default function PaymentsAP() {
  const [tab, setTab] = useState<Tab>('payments');
  const active = TABS.find((item) => item.id === tab) ?? TABS[0];
  const transactions = useJson<ArTransaction[]>(`/api/projects/ar-transactions?type=${encodeURIComponent(active.type)}`);

  const rows = transactions.data ?? [];
  const total = rows.reduce((sum, row) => sum + (row.amount_bhd ?? 0), 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Payments &amp; AP</h1>
        <p className="text-slate-500 mt-1">Incoming payments received and AR invoices raised</p>
      </div>

      <div className="flex gap-2">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
              tab === item.id ? 'bg-teal-600 text-white' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      <Panel title={`${active.title}${transactions.data ? ` (${rows.length})` : ''}`} icon={CreditCard}>
        {transactions.loading ? (
          <SkeletonBlock height="h-64" />
        ) : transactions.error ? (
          <ErrorState message={transactions.error} />
        ) : rows.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-slate-500">No transactions found</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <TableHead columns={['Project ID', 'Customer', 'Document No', 'Date', 'Amount (BHD)', 'Status']} />
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
                  <td />
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}
