import { ShieldCheck } from 'lucide-react';
import { EmptyState, ErrorState, Panel, TableHead, useJson } from '../../components/dashboard/parts';
import { Amt, SkeletonBlock, SummaryCard } from '../../components/projects/shared';
import { amount2, bhd, pct, type RetentionRow } from '../../lib/projects';

export default function Retention() {
  const retention = useJson<RetentionRow[]>('/api/projects/retention');
  const rows = retention.data ?? [];
  const total = rows.reduce((sum, row) => sum + (row.retention_amount_bhd ?? 0), 0);
  const soTotal = rows.reduce((sum, row) => sum + (row.so_value_bhd ?? 0), 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Retention</h1>
        <p className="text-slate-500 mt-1">Amounts withheld by customers until the release conditions are met</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <SummaryCard label="Total Retained" value={retention.loading ? '...' : <Amt value={total} total={soTotal} format={bhd} />} tone="text-rose-600" />
        <SummaryCard label="Projects With Retention" value={retention.loading ? '...' : rows.filter((row) => (row.retention_amount_bhd ?? 0) > 0).length} />
        <SummaryCard label="Projects Tracked" value={retention.loading ? '...' : rows.length} />
      </div>

      <Panel title="Retention by Project" icon={ShieldCheck}>
        {retention.loading ? (
          <SkeletonBlock height="h-72" />
        ) : retention.error ? (
          <ErrorState message={retention.error} />
        ) : rows.length === 0 ? (
          <EmptyState icon={ShieldCheck} message="No retention records" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <TableHead columns={['Project ID', 'Customer', 'SO No', 'SO Value', 'Retention Rate', 'Retention Amount', 'Release Rule', 'Collection Treatment']} />
              <tbody className="divide-y divide-slate-100">
                {rows.map((row) => (
                  <tr key={row.id} className="hover:bg-slate-50">
                    <td className="px-5 py-2.5 font-medium text-slate-800">{row.project_id}</td>
                    <td className="px-5 py-2.5 text-slate-600">{row.customer || '-'}</td>
                    <td className="px-5 py-2.5 text-slate-600 whitespace-nowrap">{row.so_no || '-'}</td>
                    <td className="px-5 py-2.5 text-slate-700 text-right whitespace-nowrap"><Amt value={row.so_value_bhd} total={soTotal} /></td>
                    <td className="px-5 py-2.5 text-slate-700 text-right">{pct(row.retention_rate, 0)}</td>
                    <td className="px-5 py-2.5 text-slate-800 text-right font-medium whitespace-nowrap"><Amt value={row.retention_amount_bhd} total={total} format={amount2} /></td>
                    <td className="px-5 py-2.5 text-slate-600">{row.release_rule || '-'}</td>
                    <td className="px-5 py-2.5 text-slate-600">{row.collection_treatment || '-'}</td>
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
