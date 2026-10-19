import { useState } from 'react';
import { CreditCard } from 'lucide-react';
import { ErrorState, Panel, TableHead, useJson } from '../../components/dashboard/parts';
import {
  Amt,
  AsOfDateFilter,
  KpiTile,
  LedgerFilters,
  RowCount,
  SkeletonBlock,
  applyLedgerFilters,
  emptyLedgerValues,
  type LedgerFilterDef,
} from '../../components/projects/shared';
import { amount2, bhd, formatDMY, sharePct, todayISO, type VendorPayment } from '../../lib/projects';

const FILTERS: LedgerFilterDef<VendorPayment>[] = [
  { key: 'customer', allLabel: 'All Customers', pick: (row) => row.customer, resets: ['project'] },
  { key: 'project', allLabel: 'All Projects', pick: (row) => row.project_id },
];

// Payments: outgoing vendor payments, each applied to an AP invoice (from vendor payments.xlsx).
export default function Payments() {
  const payments = useJson<VendorPayment[]>('/api/projects/vendor-payments');
  const [asOfDate, setAsOfDate] = useState(todayISO());
  const [filters, setFilters] = useState(emptyLedgerValues(FILTERS));

  const all = payments.data ?? [];
  // Everything up to and including the As of Date.
  const dated = all.filter((row) => !asOfDate || !row.payment_date || row.payment_date <= asOfDate);
  const rows = applyLedgerFilters(dated, FILTERS, filters);
  const total = rows.reduce((sum, row) => sum + (row.amount_bhd ?? 0), 0);
  const invoiceTotal = rows.reduce((sum, row) => sum + (row.ap_invoice_amount_bhd ?? 0), 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Payments</h1>
        <p className="text-slate-500 mt-1">Payments made to vendors against AP invoices</p>
      </div>

      {/* Percentage = share of the AP invoices these payments are applied to. */}
      <div className="grid grid-cols-1 sm:grid-cols-3 xl:grid-cols-5 gap-2">
        <KpiTile label="Total Payments" band="bg-slate-600" value={bhd(total)} percent={sharePct(total, invoiceTotal)} loading={payments.loading} />
      </div>

      <LedgerFilters rows={dated} defs={FILTERS} values={filters} onChange={setFilters} extra={<AsOfDateFilter value={asOfDate} onChange={setAsOfDate} />} />
      {payments.data && <RowCount shown={rows.length} total={all.length} />}

      <Panel title={`Payments${payments.data ? ` (${rows.length})` : ''}`} icon={CreditCard}>
        {payments.loading ? (
          <SkeletonBlock height="h-64" />
        ) : payments.error ? (
          <ErrorState message={payments.error} />
        ) : rows.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-slate-500">No payments found</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <TableHead columns={['Payment No', 'Project', 'Customer', 'Date', 'Amount (BHD)', 'Applied AP Invoice', 'AP Invoice Amount (BHD)']} />
              <tbody className="divide-y divide-slate-100">
                {rows.map((row) => (
                  <tr key={row.id} className="hover:bg-slate-50">
                    <td className="px-5 py-2.5 font-medium text-slate-800 whitespace-nowrap">{row.payment_no || '-'}</td>
                    <td className="px-5 py-2.5 text-slate-700 whitespace-nowrap">{row.project_id}</td>
                    <td className="px-5 py-2.5 text-slate-600">{row.customer || '-'}</td>
                    <td className="px-5 py-2.5 text-slate-600 whitespace-nowrap">{formatDMY(row.payment_date)}</td>
                    <td className="px-5 py-2.5 text-slate-700 text-right whitespace-nowrap">
                      <Amt value={row.amount_bhd} total={total} format={amount2} />
                    </td>
                    <td className="px-5 py-2.5 text-slate-600 whitespace-nowrap">{row.applied_ap_invoice_no || '-'}</td>
                    <td className="px-5 py-2.5 text-slate-700 text-right whitespace-nowrap">
                      <Amt value={row.ap_invoice_amount_bhd} total={invoiceTotal} format={amount2} />
                    </td>
                  </tr>
                ))}
                <tr className="bg-teal-50">
                  <td colSpan={4} className="px-5 py-3 text-sm font-bold text-slate-700 text-right">Total</td>
                  <td className="px-5 py-3 text-right font-bold text-slate-900 whitespace-nowrap">
                    <Amt value={total} total={total} format={amount2} />
                  </td>
                  <td />
                  <td className="px-5 py-3 text-right font-bold text-slate-900 whitespace-nowrap">
                    <Amt value={invoiceTotal} total={invoiceTotal} format={amount2} />
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
