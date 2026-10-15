import { BarChart3, Table2 } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { EmptyState, ErrorState, Panel, TableHead, useJson } from '../../components/dashboard/parts';
import { SkeletonBlock, SummaryCard } from '../../components/projects/shared';
import { amount, bhd, compact, pct, type Project, type ProjectsSummary } from '../../lib/projects';

export default function Financials() {
  const summary = useJson<ProjectsSummary>('/api/projects/summary');
  const projects = useJson<Project[]>('/api/projects');
  const s = summary.data;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Financials</h1>
        <p className="text-slate-500 mt-1">Portfolio billing, collections and margin</p>
      </div>

      {summary.error && <ErrorState message={summary.error} />}

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <SummaryCard label="Total SO Value" value={s ? bhd(s.totalSOValue) : '...'} tone="text-blue-600" />
        <SummaryCard label="Total Invoiced" value={s ? bhd(s.totalInvoiced) : '...'} tone="text-teal-600" />
        <SummaryCard label="Total Collected" value={s ? bhd(s.totalCollected) : '...'} tone="text-purple-600" />
        <SummaryCard label="Outstanding AR" value={s ? bhd(s.outstandingAR) : '...'} tone="text-orange-600" />
        <SummaryCard label="Forecast Margin" value={s ? pct(s.forecastMarginPct) : '...'} tone="text-emerald-600" />
      </div>

      <Panel title="SO Value vs Invoiced vs Collected by Customer" icon={BarChart3}>
        {summary.loading ? (
          <SkeletonBlock height="h-80" />
        ) : !s || s.byCustomer.length === 0 ? (
          <EmptyState icon={BarChart3} message="No financial data yet" />
        ) : (
          <div className="h-80 px-3 pt-4 pb-2">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={s.byCustomer} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="customer" tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} interval={0} angle={-20} textAnchor="end" height={60} />
                <YAxis tickFormatter={compact} tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                <Tooltip formatter={(value) => bhd(Number(value))} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="soValue" name="SO Value" fill="#2563eb" radius={[4, 4, 0, 0]} />
                <Bar dataKey="invoiced" name="Invoiced" fill="#0d9488" radius={[4, 4, 0, 0]} />
                <Bar dataKey="collected" name="Collected" fill="#7c3aed" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </Panel>

      <Panel title="Project Financials" icon={Table2}>
        {projects.loading ? (
          <SkeletonBlock height="h-80" />
        ) : projects.error ? (
          <ErrorState message={projects.error} />
        ) : (projects.data ?? []).length === 0 ? (
          <EmptyState icon={Table2} message="No projects found" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <TableHead
                columns={['Project ID', 'Customer', 'SO Value', 'Invoiced', 'Collected', 'Outstanding AR', 'Actual Cost', 'Cost Exposure', 'Forecast Margin', 'Margin %']}
              />
              <tbody className="divide-y divide-slate-100">
                {(projects.data ?? []).map((project) => (
                  <tr key={project.project_id} className="hover:bg-slate-50">
                    <td className="px-5 py-2.5 font-medium text-slate-800 whitespace-nowrap">{project.project_id}</td>
                    <td className="px-5 py-2.5 text-slate-600 whitespace-nowrap">{project.customer}</td>
                    <td className="px-5 py-2.5 text-slate-700 text-right">{amount(project.so_value_bhd)}</td>
                    <td className="px-5 py-2.5 text-slate-700 text-right">{amount(project.net_invoiced_bhd)}</td>
                    <td className="px-5 py-2.5 text-slate-700 text-right">{amount(project.collections_bhd)}</td>
                    <td className="px-5 py-2.5 text-slate-700 text-right">{amount(project.outstanding_ar_bhd)}</td>
                    <td className="px-5 py-2.5 text-slate-700 text-right">{amount(project.actual_cost_bhd)}</td>
                    <td className="px-5 py-2.5 text-slate-700 text-right">{amount(project.total_cost_exposure_bhd)}</td>
                    <td className="px-5 py-2.5 text-slate-700 text-right">{amount(project.forecast_margin_bhd)}</td>
                    <td className="px-5 py-2.5 text-slate-700 text-right">{pct(project.forecast_margin_pct)}</td>
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
