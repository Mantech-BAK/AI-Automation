import { useState } from 'react';
import { BarChart3, Table2 } from 'lucide-react';
import type { NavFilter } from '../../App';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { EmptyState, ErrorState, Panel, TableHead, useJson } from '../../components/dashboard/parts';
import { Amt, AsOfDateFilter, SkeletonBlock, SummaryCard } from '../../components/projects/shared';
import { bhd, compact, pct, sharePct, todayISO, type Project, type ProjectsSummary } from '../../lib/projects';

interface Props {
  // Opens the dashboard for one project (a row click).
  onNavigate: (page: string, filter?: NavFilter) => void;
}

export default function Financials({ onNavigate }: Props) {
  // Projects that had started by the As of Date (their data runs from the start up to it).
  const [asOfDate, setAsOfDate] = useState(todayISO());
  const summary = useJson<ProjectsSummary>(`/api/projects/summary${asOfDate ? `?as_of=${asOfDate}` : ''}`);
  const projects = useJson<Project[]>(`/api/projects${asOfDate ? `?as_of=${asOfDate}` : ''}`);
  const s = summary.data;
  const rows = projects.data ?? [];
  const sumOf = (pick: (project: Project) => number) => rows.reduce((total, project) => total + pick(project), 0);
  const totals = {
    so: sumOf((p) => p.so_value_bhd),
    invoiced: sumOf((p) => p.net_invoiced_bhd),
    collected: sumOf((p) => p.collections_bhd),
    ar: sumOf((p) => p.outstanding_ar_bhd),
    actual: sumOf((p) => p.actual_cost_bhd),
    exposure: sumOf((p) => p.total_cost_exposure_bhd),
    margin: sumOf((p) => p.forecast_margin_bhd),
  };
  // Tooltip share: each series against its own portfolio total.
  const seriesTotal: Record<string, number> = { 'SO Value': s?.totalSOValue ?? 0, Invoiced: s?.totalInvoiced ?? 0, Collected: s?.totalCollected ?? 0 };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Financials</h1>
        <p className="text-slate-500 mt-1">Portfolio billing, collections and margin</p>
      </div>

      <AsOfDateFilter value={asOfDate} onChange={setAsOfDate} />

      {summary.error && <ErrorState message={summary.error} />}

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <SummaryCard label="Total SO Value" value={s ? <Amt value={s.totalSOValue} total={s.totalSOValue} format={bhd} /> : '...'} tone="text-blue-600" />
        <SummaryCard label="Total Invoiced" value={s ? <Amt value={s.totalInvoiced} total={s.totalSOValue} format={bhd} /> : '...'} tone="text-teal-600" />
        <SummaryCard label="Total Collected" value={s ? <Amt value={s.totalCollected} total={s.totalSOValue} format={bhd} /> : '...'} tone="text-purple-600" />
        <SummaryCard label="Outstanding AR" value={s ? <Amt value={s.outstandingAR} total={s.totalSOValue} format={bhd} /> : '...'} tone="text-orange-600" />
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
                <Tooltip formatter={(value, name) => `${bhd(Number(value))} (${sharePct(Number(value), seriesTotal[String(name)])})`} />
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
                  <tr
                    key={project.project_id}
                    onClick={() => onNavigate('dashboard', { projectId: project.project_id })}
                    title={`Open ${project.project_id} on the dashboard`}
                    className="hover:bg-teal-50/60 cursor-pointer"
                  >
                    <td className="px-5 py-2.5 font-medium text-slate-800 whitespace-nowrap">{project.project_id}</td>
                    <td className="px-5 py-2.5 text-slate-600 whitespace-nowrap">{project.customer}</td>
                    <td className="px-5 py-2.5 text-slate-700 text-right whitespace-nowrap"><Amt value={project.so_value_bhd} total={totals.so} /></td>
                    <td className="px-5 py-2.5 text-slate-700 text-right whitespace-nowrap"><Amt value={project.net_invoiced_bhd} total={totals.invoiced} /></td>
                    <td className="px-5 py-2.5 text-slate-700 text-right whitespace-nowrap"><Amt value={project.collections_bhd} total={totals.collected} /></td>
                    <td className="px-5 py-2.5 text-slate-700 text-right whitespace-nowrap"><Amt value={project.outstanding_ar_bhd} total={totals.ar} /></td>
                    <td className="px-5 py-2.5 text-slate-700 text-right whitespace-nowrap"><Amt value={project.actual_cost_bhd} total={totals.actual} /></td>
                    <td className="px-5 py-2.5 text-slate-700 text-right whitespace-nowrap"><Amt value={project.total_cost_exposure_bhd} total={totals.exposure} /></td>
                    <td className="px-5 py-2.5 text-slate-700 text-right whitespace-nowrap"><Amt value={project.forecast_margin_bhd} total={totals.margin} /></td>
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
