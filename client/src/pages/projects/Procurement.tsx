import { useState } from 'react';
import { ShoppingCart } from 'lucide-react';
import { EmptyState, ErrorState, Panel, TableHead, useJson } from '../../components/dashboard/parts';
import { Amt, AsOfDateFilter, LedgerFilters, RowCount, SkeletonBlock, SummaryCard, applyLedgerFilters, emptyLedgerValues, type LedgerFilterDef } from '../../components/projects/shared';
import { amount2, bhd, formatDMY, todayISO, type ProcurementRow } from '../../lib/projects';

// Purchase orders are commitments; AP invoices are the cost actually incurred.
const STATUS_COLORS: Record<string, string> = {
  Committed: '#2563eb',
  'Actual Cost': '#0d9488',
};
const statusColor = (status?: string | null) => (status && STATUS_COLORS[status]) || '#94a3b8';

const FILTERS: LedgerFilterDef<ProcurementRow>[] = [
  { key: 'customer', allLabel: 'All Customers', pick: (row) => row.customer, resets: ['project'] },
  { key: 'project', allLabel: 'All Projects', pick: (row) => row.project_id },
  { key: 'type', allLabel: 'All Document Types', pick: (row) => row.document_type, order: ['Purchase Order', 'AP Invoice'] },
  { key: 'status', allLabel: 'All Cost Statuses', pick: (row) => row.cost_status, order: ['Committed', 'Actual Cost'] },
];

export default function Procurement() {
  const procurement = useJson<ProcurementRow[]>('/api/projects/procurement');
  const [asOfDate, setAsOfDate] = useState(todayISO());
  // Everything up to and including the As of Date.
  const [filters, setFilters] = useState(emptyLedgerValues(FILTERS));
  const all = procurement.data ?? [];
  const dated = all.filter((row) => !asOfDate || !row.date || row.date <= asOfDate);
  const rows = applyLedgerFilters(dated, FILTERS, filters);

  const totalOf = (status: string) => rows.filter((row) => row.cost_status === status).reduce((sum, row) => sum + (row.amount_bhd ?? 0), 0);
  const committed = totalOf('Committed');
  const actual = totalOf('Actual Cost');
  const total = committed + actual;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Purchases</h1>
        <p className="text-slate-500 mt-1">Purchase orders (committed) and AP invoices (actual cost) by project</p>
      </div>

      <LedgerFilters rows={dated} defs={FILTERS} values={filters} onChange={setFilters} extra={<AsOfDateFilter value={asOfDate} onChange={setAsOfDate} />} />
      {procurement.data && <RowCount shown={rows.length} total={all.length} />}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <SummaryCard label="Purchase Orders (Committed)" value={procurement.loading ? '...' : <Amt value={committed} total={total} format={bhd} />} tone="text-blue-600" />
        <SummaryCard label="AP Invoices (Actual Cost)" value={procurement.loading ? '...' : <Amt value={actual} total={total} format={bhd} />} tone="text-teal-600" />
        <SummaryCard label="Documents" value={procurement.loading ? '...' : rows.length} />
      </div>

      <div>
        <Panel title={`Procurement Documents${procurement.data ? ` (${rows.length})` : ''}`} icon={ShoppingCart}>
          {procurement.loading ? (
            <SkeletonBlock height="h-72" />
          ) : procurement.error ? (
            <ErrorState message={procurement.error} />
          ) : rows.length === 0 ? (
            <EmptyState icon={ShoppingCart} message="No procurement records" hint="Purchase orders and AP invoices will be listed here once they are recorded." />
          ) : (
            <div className="overflow-x-auto max-h-[36rem] overflow-y-auto">
              <table className="w-full text-sm">
                <TableHead columns={['Date', 'Project ID', 'Customer', 'Document No', 'Type', 'Cost Status', 'Amount (BHD)']} />
                <tbody className="divide-y divide-slate-100">
                  {rows.map((row) => (
                    <tr key={row.id} className="hover:bg-slate-50">
                      <td className="px-5 py-2.5 text-slate-600 whitespace-nowrap">{formatDMY(row.date)}</td>
                      <td className="px-5 py-2.5 font-medium text-slate-800 whitespace-nowrap">{row.project_id}</td>
                      <td className="px-5 py-2.5 text-slate-600">{row.customer || '-'}</td>
                      <td className="px-5 py-2.5 text-slate-700 whitespace-nowrap">{row.document_no || '-'}</td>
                      <td className="px-5 py-2.5 text-slate-600 whitespace-nowrap">{row.document_type || '-'}</td>
                      <td className="px-5 py-2.5 whitespace-nowrap">
                        <span className="inline-flex items-center gap-1.5 text-slate-600">
                          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: statusColor(row.cost_status) }} />
                          {row.cost_status || '-'}
                        </span>
                      </td>
                      <td className="px-5 py-2.5 text-slate-700 text-right whitespace-nowrap">
                        <Amt value={row.amount_bhd} total={total} format={amount2} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}
