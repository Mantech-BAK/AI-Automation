import { useState } from 'react';
import { Scale } from 'lucide-react';
import { EmptyState, ErrorState, Panel, TableHead, useJson } from '../../components/dashboard/parts';
import { Amt, DateRangeFilter, SkeletonBlock, SummaryCard } from '../../components/projects/shared';
import { CREDIT_TYPES, amount2, bhd, formatDMY, type AdjustmentRow } from '../../lib/projects';

const TYPE_STYLES: Record<string, string> = {
  'Credit Note': 'bg-emerald-50 text-emerald-700',
  Discount: 'bg-sky-50 text-sky-700',
  'Write-off': 'bg-red-50 text-red-700',
  'Debit Note': 'bg-amber-50 text-amber-700',
};

// Adjustments: credit notes, discounts and write-offs (credits) against debit notes (debits).
export default function Adjustments() {
  const adjustments = useJson<AdjustmentRow[]>('/api/projects/adjustments');
  const [range, setRange] = useState({ from: '', to: '' });

  const rows = (adjustments.data ?? []).filter(
    (row) => (!range.from || (row.date ?? '') >= range.from) && (!range.to || (row.date ?? '') <= range.to)
  );
  const sumOf = (pick: (row: AdjustmentRow) => boolean) => rows.filter(pick).reduce((sum, row) => sum + (row.amount_bhd ?? 0), 0);
  const credits = sumOf((row) => CREDIT_TYPES.includes(row.adjustment_type ?? ''));
  const debits = sumOf((row) => !CREDIT_TYPES.includes(row.adjustment_type ?? ''));
  const gross = credits + debits;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Adjustments</h1>
        <p className="text-slate-500 mt-1">Credit notes, debit notes, write-offs and discounts</p>
      </div>

      <DateRangeFilter from={range.from} to={range.to} onChange={setRange} />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <SummaryCard label="Total Credits" value={adjustments.loading ? '...' : <Amt value={credits} total={gross} format={bhd} />} tone="text-emerald-600" />
        <SummaryCard label="Total Debits" value={adjustments.loading ? '...' : <Amt value={debits} total={gross} format={bhd} />} tone="text-amber-600" />
        <SummaryCard
          label="Net (Debits - Credits)"
          value={adjustments.loading ? '...' : bhd(debits - credits)}
          tone={debits - credits >= 0 ? 'text-slate-800' : 'text-rose-600'}
        />
      </div>

      <Panel title={`Adjustments${adjustments.data ? ` (${rows.length})` : ''}`} icon={Scale}>
        {adjustments.loading ? (
          <SkeletonBlock height="h-64" />
        ) : adjustments.error ? (
          <ErrorState message={adjustments.error} />
        ) : rows.length === 0 ? (
          <EmptyState icon={Scale} message="No adjustments found" hint="Try clearing the dates." />
        ) : (
          <div className="overflow-x-auto">
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
    </div>
  );
}
