import { useState } from 'react';
import { Scale } from 'lucide-react';
import { EmptyState, ErrorState, Panel, TableHead, useJson } from '../../components/dashboard/parts';
import { Amt, AsOfDateFilter, LedgerFilters, RowCount, SkeletonBlock, SummaryCard, applyLedgerFilters, emptyLedgerValues, type LedgerFilterDef, PageShell, PANEL_FILL, TABLE_SCROLL } from '../../components/projects/shared';
import { CREDIT_TYPES, amount2, bhd, formatDMY, todayISO, type AdjustmentRow } from '../../lib/projects';

const TYPE_STYLES: Record<string, string> = {
  'Credit Note': 'bg-emerald-50 text-emerald-700',
  Discount: 'bg-sky-50 text-sky-700',
  'Write-off': 'bg-red-50 text-red-700',
  'Debit Note': 'bg-amber-50 text-amber-700',
};

const FILTERS: LedgerFilterDef<AdjustmentRow>[] = [
  { key: 'customer', allLabel: 'All Customers', pick: (row) => row.customer, resets: ['project'] },
  { key: 'project', allLabel: 'All Projects', pick: (row) => row.project_id },
  { key: 'type', allLabel: 'All Document Types', pick: (row) => row.adjustment_type, order: ['Credit Note', 'Debit Note'] },
];

// Adjustments: credit notes, discounts and write-offs (credits) against debit notes (debits).
export default function Adjustments() {
  const adjustments = useJson<AdjustmentRow[]>('/api/projects/adjustments');
  const [asOfDate, setAsOfDate] = useState(todayISO());
  const [filters, setFilters] = useState(emptyLedgerValues(FILTERS));

  // Everything up to and including the As of Date.
  const all = adjustments.data ?? [];
  const dated = all.filter((row) => !asOfDate || !row.date || row.date <= asOfDate);
  const rows = applyLedgerFilters(dated, FILTERS, filters);
  const sumOf = (pick: (row: AdjustmentRow) => boolean) => rows.filter(pick).reduce((sum, row) => sum + (row.amount_bhd ?? 0), 0);
  const credits = sumOf((row) => CREDIT_TYPES.includes(row.adjustment_type ?? ''));
  const debits = sumOf((row) => !CREDIT_TYPES.includes(row.adjustment_type ?? ''));
  const gross = credits + debits;

  return (
    <PageShell title="Adjustments" subtitle="Credit notes, debit notes, write-offs and discounts" header={<>
      <LedgerFilters rows={dated} defs={FILTERS} values={filters} onChange={setFilters} extra={<AsOfDateFilter value={asOfDate} onChange={setAsOfDate} />} />
      {adjustments.data && <RowCount shown={rows.length} total={all.length} />}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <SummaryCard label="Total Credits" value={adjustments.loading ? '...' : <Amt value={credits} total={gross} format={bhd} />} tone="text-emerald-600" />
        <SummaryCard label="Total Debits" value={adjustments.loading ? '...' : <Amt value={debits} total={gross} format={bhd} />} tone="text-amber-600" />
        <SummaryCard
          label="Net (Debits - Credits)"
          value={adjustments.loading ? '...' : bhd(debits - credits)}
          tone={debits - credits >= 0 ? 'text-slate-800' : 'text-rose-600'}
        />
      </div>

      </>}>
      <Panel title={`Adjustments${adjustments.data ? ` (${rows.length})` : ''}`} icon={Scale}>
        {adjustments.loading ? (
          <SkeletonBlock height="h-64" />
        ) : adjustments.error ? (
          <ErrorState message={adjustments.error} />
        ) : rows.length === 0 ? (
          <EmptyState icon={Scale} message="No adjustments found" hint="Try clearing the filters." />
        ) : (
          <div className={TABLE_SCROLL}>
            <table className="w-full text-sm">
              <TableHead columns={['Date', 'Project ID', 'Customer', 'Reference', 'Type', 'Description', 'Amount (BHD)']} />
              <tbody className="divide-y divide-slate-100">
                {rows.map((row) => (
                  <tr key={row.id} className="hover:bg-slate-50">
                    <td className="px-5 py-2.5 text-slate-600 whitespace-nowrap">{formatDMY(row.date)}</td>
                    <td className="px-5 py-2.5 font-medium text-slate-800 whitespace-nowrap">{row.project_id}</td>
                    <td className="px-5 py-2.5 text-slate-600">{row.customer || '-'}</td>
                    <td className="px-5 py-2.5 text-slate-600 whitespace-nowrap">{row.reference || '-'}</td>
                    <td className="px-5 py-2.5 whitespace-nowrap">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${TYPE_STYLES[row.adjustment_type ?? ''] ?? 'bg-slate-100 text-slate-600'}`}>
                        {row.adjustment_type || '-'}
                      </span>
                    </td>
                    <td className="px-5 py-2.5 text-slate-600">{row.description || '-'}</td>
                    <td className="px-5 py-2.5 text-slate-700 text-right whitespace-nowrap">
                      <Amt value={row.amount_bhd} total={gross} format={amount2} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </PageShell>
  );
}
