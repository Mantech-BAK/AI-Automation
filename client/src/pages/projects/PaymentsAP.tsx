import { CreditCard } from 'lucide-react';
import { ErrorState, Panel, TableHead, useJson } from '../../components/dashboard/parts';
import { Amt, SkeletonBlock } from '../../components/projects/shared';
import { amount2, formatDMY, type ArTransaction } from '../../lib/projects';

// Payments & AP: the invoices that have been paid.
export default function PaymentsAP() {
  const transactions = useJson<ArTransaction[]>('/api/projects/ar-transactions');

  const rows = (transactions.data ?? []).filter((row) => row.status === 'Paid');
  const total = rows.reduce((sum, row) => sum + (row.amount_bhd ?? 0), 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Payments &amp; AP</h1>
        <p className="text-slate-500 mt-1">Invoices that have been paid</p>
      </div>

      <Panel title={`Payments${transactions.data ? ` (${rows.length})` : ''}`} icon={CreditCard}>
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
                      <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700">{row.status}</span>
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
