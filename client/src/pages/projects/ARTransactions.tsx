import { Fragment } from 'react';
import { Receipt } from 'lucide-react';
import { EmptyState, ErrorState, Panel, TableHead, useJson } from '../../components/dashboard/parts';
import { Amt, SkeletonBlock } from '../../components/projects/shared';
import { AR_INVOICE, amount2, bhd, formatDMY, type ArTransaction } from '../../lib/projects';

// Collections & AR: every AR transaction, grouped by project with a subtotal.
export default function ARTransactions() {
  const transactions = useJson<ArTransaction[]>(`/api/projects/ar-transactions?type=${encodeURIComponent(AR_INVOICE)}`);

  const groups = new Map<string, ArTransaction[]>();
  for (const row of transactions.data ?? []) {
    if (!groups.has(row.project_id)) groups.set(row.project_id, []);
    groups.get(row.project_id)!.push(row);
  }
  const total = (transactions.data ?? []).reduce((sum, row) => sum + (row.amount_bhd ?? 0), 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Collections &amp; AR</h1>
        <p className="text-slate-500 mt-1">Receivable transactions grouped by project</p>
      </div>

      <Panel title={`AR Transactions${transactions.data ? ` (${transactions.data.length})` : ''}`} icon={Receipt}>
        {transactions.loading ? (
          <SkeletonBlock height="h-64" />
        ) : transactions.error ? (
          <ErrorState message={transactions.error} />
        ) : groups.size === 0 ? (
          <EmptyState icon={Receipt} message="No AR transactions yet" hint="Invoices and receipts will be listed here once they are recorded." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <TableHead columns={['Project ID', 'Customer', 'Transaction Ref', 'Type', 'Date', 'Amount BHD', 'Description']} />
              <tbody>
                {[...groups.entries()].map(([projectId, rows]) => (
                  <Fragment key={projectId}>
                    {rows.map((row) => (
                      <tr key={row.id} className="border-b border-slate-100 hover:bg-slate-50">
                        <td className="px-5 py-2.5 font-medium text-slate-800">{row.project_id}</td>
                        <td className="px-5 py-2.5 text-slate-600">{row.customer || '-'}</td>
                        <td className="px-5 py-2.5 text-slate-600">{row.transaction_ref || '-'}</td>
                        <td className="px-5 py-2.5 text-slate-600">{row.transaction_type || '-'}</td>
                        <td className="px-5 py-2.5 text-slate-600 whitespace-nowrap">{formatDMY(row.transaction_date)}</td>
                        <td className="px-5 py-2.5 text-slate-700 text-right whitespace-nowrap"><Amt value={row.amount_bhd} total={total} format={amount2} /></td>
                        <td className="px-5 py-2.5 text-slate-600">{row.description || '-'}</td>
                      </tr>
                    ))}
                    <tr className="bg-slate-50 border-b border-slate-200">
                      <td colSpan={5} className="px-5 py-2 text-xs font-semibold text-slate-500 uppercase text-right">
                        Subtotal {projectId}
                      </td>
                      <td className="px-5 py-2 text-right font-semibold text-slate-800">
                        <Amt value={rows.reduce((sum, row) => sum + (row.amount_bhd ?? 0), 0)} total={total} format={amount2} />
                      </td>
                      <td />
                    </tr>
                  </Fragment>
                ))}
                <tr className="bg-teal-50">
                  <td colSpan={5} className="px-5 py-3 text-sm font-bold text-slate-700 text-right">Total</td>
                  <td className="px-5 py-3 text-right font-bold text-slate-900"><Amt value={total} total={total} format={bhd} /></td>
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
