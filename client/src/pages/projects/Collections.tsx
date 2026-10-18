import { useState } from 'react';
import { HandCoins } from 'lucide-react';
import { ErrorState, Panel, TableHead, useJson } from '../../components/dashboard/parts';
import { Amt, AsOfDateFilter, LedgerFilters, RowCount, SkeletonBlock, applyLedgerFilters, emptyLedgerValues, type LedgerFilterDef } from '../../components/projects/shared';
import { amount2, formatDMY, todayISO, type ArTransaction } from '../../lib/projects';

const FILTERS: LedgerFilterDef<ArTransaction>[] = [
  { key: 'customer', allLabel: 'All Customers', pick: (row) => row.customer, resets: ['project'] },
  { key: 'project', allLabel: 'All Projects', pick: (row) => row.project_id },
];

// Collections: the incoming payments (receipts) received from customers, straight
// from the workbook's Collections sheet.
export default function Collections() {
  const collections = useJson<ArTransaction[]>('/api/projects/collections');
  const [asOfDate, setAsOfDate] = useState(todayISO());
  const [filters, setFilters] = useState(emptyLedgerValues(FILTERS));

  const all = collections.data ?? [];
  // Everything up to and including the As of Date.
  const dated = all.filter((row) => !asOfDate || !row.transaction_date || row.transaction_date <= asOfDate);
  const rows = applyLedgerFilters(dated, FILTERS, filters);
  const total = rows.reduce((sum, row) => sum + (row.amount_bhd ?? 0), 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Collections</h1>
        <p className="text-slate-500 mt-1">Payments received from customers</p>
      </div>

      <LedgerFilters rows={dated} defs={FILTERS} values={filters} onChange={setFilters} extra={<AsOfDateFilter value={asOfDate} onChange={setAsOfDate} />} />
      {collections.data && <RowCount shown={rows.length} total={all.length} />}

      <Panel title={`Collections${collections.data ? ` (${rows.length})` : ''}`} icon={HandCoins}>
        {collections.loading ? (
          <SkeletonBlock height="h-64" />
        ) : collections.error ? (
          <ErrorState message={collections.error} />
        ) : rows.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-slate-500">No transactions found</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <TableHead columns={['Receipt No', 'Project', 'Customer', 'Date', 'Amount (BHD)']} />
              <tbody className="divide-y divide-slate-100">
                {rows.map((row) => (
                  <tr key={row.id} className="hover:bg-slate-50">
                    <td className="px-5 py-2.5 font-medium text-slate-800 whitespace-nowrap">{row.transaction_ref || '-'}</td>
                    <td className="px-5 py-2.5 text-slate-700 whitespace-nowrap">{row.project_id}</td>
                    <td className="px-5 py-2.5 text-slate-600">{row.customer || '-'}</td>
                    <td className="px-5 py-2.5 text-slate-600 whitespace-nowrap">{formatDMY(row.transaction_date)}</td>
                    <td className="px-5 py-2.5 text-slate-700 text-right whitespace-nowrap">
                      <Amt value={row.amount_bhd} total={total} format={amount2} />
                    </td>
                  </tr>
                ))}
                <tr className="bg-teal-50">
                  <td colSpan={4} className="px-5 py-3 text-sm font-bold text-slate-700 text-right">Total</td>
                  <td className="px-5 py-3 text-right font-bold text-slate-900 whitespace-nowrap">
                    <Amt value={total} total={total} format={amount2} />
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}
