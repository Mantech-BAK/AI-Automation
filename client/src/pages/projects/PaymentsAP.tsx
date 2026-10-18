import { useState } from 'react';
import { CreditCard } from 'lucide-react';
import { EmptyState, ErrorState, Panel, TableHead, useJson } from '../../components/dashboard/parts';
import { Amt, AsOfDateFilter, LedgerFilters, RowCount, SkeletonBlock, applyLedgerFilters, emptyLedgerValues, type LedgerFilterDef } from '../../components/projects/shared';
import { INCOMING_PAYMENT, amount2, formatDMY, todayISO, type ArTransaction } from '../../lib/projects';

type Tab = 'collections' | 'payments';

const TABS: { id: Tab; label: string }[] = [
  { id: 'collections', label: 'Collections' },
  { id: 'payments', label: 'Payments' },
];

const FILTERS: LedgerFilterDef<ArTransaction>[] = [
  { key: 'customer', allLabel: 'All Customers', pick: (row) => row.customer, resets: ['project'] },
  { key: 'project', allLabel: 'All Projects', pick: (row) => row.project_id },
];

// Payments & AP. Collections = the workbook's Collections sheet (incoming payments
// received from customers). Payments (money paid out) has no source data yet, so it is empty.
export default function PaymentsAP() {
  const [tab, setTab] = useState<Tab>('collections');
  const [asOfDate, setAsOfDate] = useState(todayISO());
  const [filters, setFilters] = useState(emptyLedgerValues(FILTERS));
  const collections = useJson<ArTransaction[]>(`/api/projects/ar-transactions?type=${encodeURIComponent(INCOMING_PAYMENT)}`);

  // Everything up to and including the As of Date.
  const all = collections.data ?? [];
  const dated = all.filter((row) => !asOfDate || !row.transaction_date || row.transaction_date <= asOfDate);
  const rows = applyLedgerFilters(dated, FILTERS, filters);
  const total = rows.reduce((sum, row) => sum + (row.amount_bhd ?? 0), 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Payments &amp; AP</h1>
        <p className="text-slate-500 mt-1">Collections received from customers and payments made</p>
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

      {tab === 'collections' && (
        <>
          <LedgerFilters rows={dated} defs={FILTERS} values={filters} onChange={setFilters} extra={<AsOfDateFilter value={asOfDate} onChange={setAsOfDate} />} />
          {collections.data && <RowCount shown={rows.length} total={all.length} />}
        </>
      )}

      {tab === 'payments' ? (
        <Panel title="Payments" icon={CreditCard}>
          <EmptyState icon={CreditCard} message="No payments recorded" />
        </Panel>
      ) : (
        <Panel title={`Collections${collections.data ? ` (${rows.length})` : ''}`} icon={CreditCard}>
          {collections.loading ? (
            <SkeletonBlock height="h-64" />
          ) : collections.error ? (
            <ErrorState message={collections.error} />
          ) : rows.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-slate-500">No transactions found</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <TableHead columns={['Receipt No', 'Receipt Date', 'Project ID', 'Customer', 'SO No', 'Amount (BHD)']} />
                <tbody className="divide-y divide-slate-100">
                  {rows.map((row) => (
                    <tr key={row.id} className="hover:bg-slate-50">
                      <td className="px-5 py-2.5 font-medium text-slate-800 whitespace-nowrap">{row.transaction_ref || '-'}</td>
                      <td className="px-5 py-2.5 text-slate-600 whitespace-nowrap">{formatDMY(row.transaction_date)}</td>
                      <td className="px-5 py-2.5 text-slate-700 whitespace-nowrap">{row.project_id}</td>
                      <td className="px-5 py-2.5 text-slate-600">{row.customer || '-'}</td>
                      <td className="px-5 py-2.5 text-slate-600 whitespace-nowrap">{row.so_no || '-'}</td>
                      <td className="px-5 py-2.5 text-slate-700 text-right whitespace-nowrap">
                        <Amt value={row.amount_bhd} total={total} format={amount2} />
                      </td>
                    </tr>
                  ))}
                  <tr className="bg-teal-50">
                    <td colSpan={5} className="px-5 py-3 text-sm font-bold text-slate-700 text-right">Total</td>
                    <td className="px-5 py-3 text-right font-bold text-slate-900 whitespace-nowrap">
                      <Amt value={total} total={total} format={amount2} />
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      )}
    </div>
  );
}
