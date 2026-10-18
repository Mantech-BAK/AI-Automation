import { PieChart as PieChartIcon, ShoppingCart } from 'lucide-react';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { EmptyState, ErrorState, Panel, TableHead, useJson } from '../../components/dashboard/parts';
import { Amt, SkeletonBlock, SummaryCard } from '../../components/projects/shared';
import { amount2, bhd, formatDMY, sharePct, type ProcurementRow } from '../../lib/projects';

const CATEGORY_COLORS: Record<string, string> = {
  Materials: '#0d9488',
  Subcontract: '#2563eb',
  Labour: '#f59e0b',
  Equipment: '#7c3aed',
};
const categoryColor = (category?: string | null) => (category && CATEGORY_COLORS[category]) || '#94a3b8';

export default function Procurement() {
  const procurement = useJson<ProcurementRow[]>('/api/projects/procurement');
  const rows = procurement.data ?? [];
  const total = rows.reduce((sum, row) => sum + (row.amount_bhd ?? 0), 0);

  const categories = [...new Set(rows.map((row) => row.category || 'Other'))]
    .map((name) => ({
      name,
      value: rows.filter((row) => (row.category || 'Other') === name).reduce((sum, row) => sum + (row.amount_bhd ?? 0), 0),
    }))
    .sort((a, b) => b.value - a.value);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Procurement</h1>
        <p className="text-slate-500 mt-1">Purchasing and cost breakdown by vendor and category</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <SummaryCard label="Total Procurement" value={procurement.loading ? '...' : <Amt value={total} total={total} format={bhd} />} tone="text-teal-600" />
        {['Materials', 'Subcontract', 'Labour', 'Equipment'].map((category) => {
          const value = categories.find((item) => item.name === category)?.value ?? 0;
          return <SummaryCard key={category} label={category} value={procurement.loading ? '...' : <Amt value={value} total={total} format={bhd} />} />;
        })}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[3fr_1.2fr] gap-6 items-start">
        <Panel title={`Purchases${procurement.data ? ` (${rows.length})` : ''}`} icon={ShoppingCart}>
          {procurement.loading ? (
            <SkeletonBlock height="h-72" />
          ) : procurement.error ? (
            <ErrorState message={procurement.error} />
          ) : rows.length === 0 ? (
            <EmptyState icon={ShoppingCart} message="No procurement records" hint="Purchases will be listed here once they are recorded." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <TableHead columns={['Date', 'Project ID', 'Customer', 'Vendor', 'Description', 'Category', 'Amount (BHD)']} />
                <tbody className="divide-y divide-slate-100">
                  {rows.map((row) => (
                    <tr key={row.id} className="hover:bg-slate-50">
                      <td className="px-5 py-2.5 text-slate-600 whitespace-nowrap">{formatDMY(row.date)}</td>
                      <td className="px-5 py-2.5 font-medium text-slate-800 whitespace-nowrap">{row.project_id}</td>
                      <td className="px-5 py-2.5 text-slate-600">{row.customer || '-'}</td>
                      <td className="px-5 py-2.5 text-slate-700">{row.vendor || '-'}</td>
                      <td className="px-5 py-2.5 text-slate-600">{row.description || '-'}</td>
                      <td className="px-5 py-2.5 whitespace-nowrap">
                        <span className="inline-flex items-center gap-1.5 text-slate-600">
                          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: categoryColor(row.category) }} />
                          {row.category || '-'}
                        </span>
                      </td>
                      <td className="px-5 py-2.5 text-slate-700 text-right whitespace-nowrap">
                        <Amt value={row.amount_bhd} total={total} format={amount2} />
                      </td>
                    </tr>
                  ))}
                  <tr className="bg-teal-50">
                    <td colSpan={6} className="px-5 py-3 text-sm font-bold text-slate-700 text-right">Total</td>
                    <td className="px-5 py-3 text-right font-bold text-slate-900 whitespace-nowrap">
                      <Amt value={total} total={total} format={amount2} />
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        <Panel title="Spend by Category" icon={PieChartIcon}>
          {procurement.loading ? (
            <SkeletonBlock height="h-64" />
          ) : categories.length === 0 ? (
            <EmptyState icon={PieChartIcon} message="No spend to show" />
          ) : (
            <div className="px-5 py-4">
              <div className="h-52">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={categories} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius="58%" outerRadius="88%" paddingAngle={2} stroke="none">
                      {categories.map((item) => (
                        <Cell key={item.name} fill={categoryColor(item.name)} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value, name) => [`${bhd(Number(value))} (${sharePct(Number(value), total)})`, String(name)]} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-3 space-y-1.5">
                {categories.map((item) => (
                  <div key={item.name} className="flex items-center justify-between text-xs">
                    <span className="flex items-center gap-2 text-slate-600">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: categoryColor(item.name) }} />
                      {item.name}
                    </span>
                    <span className="font-semibold text-slate-800">
                      <Amt value={item.value} total={total} />
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}
