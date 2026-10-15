import { useState } from 'react';
import { AlertTriangle, BarChart3, Lightbulb, LineChart as LineChartIcon, PieChart as PieChartIcon, ShieldCheck, Table2 } from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  LabelList,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { NavFilter } from '../App';
import { DashboardBanner, EmptyState, ErrorState, Panel, TableHead, useJson } from '../components/dashboard/parts';
import { FilterBar, FlagBadge, FlagDot, KpiTile, ProcurementDonut, RateDonut, Skeleton, SkeletonBlock, type RateSlice } from '../components/projects/shared';
import {
  FLAG_ORDER,
  NO_FILTERS,
  amount,
  bhd,
  compact,
  filterProjects,
  filterQuery,
  flagColor,
  pct,
  typeColor,
  type Project,
  type ProjectFilters,
  type ProjectsSummary,
  type RetentionRow,
} from '../lib/projects';

interface Props {
  onNavigate: (page: string, filter?: NavFilter) => void;
}

// Share of the portfolio totals reached in each month Jan-Jun 2026. The app does
// not store monthly history, so the trend is an illustrative growth curve.
const TREND_MONTHS = [
  { month: 'Jan', factor: 0.55 },
  { month: 'Feb', factor: 0.65 },
  { month: 'Mar', factor: 0.75 },
  { month: 'Apr', factor: 0.84 },
  { month: 'May', factor: 0.93 },
  { month: 'Jun', factor: 1 },
];

// The retention released share is an estimate until release dates are tracked.
const RELEASED_SHARE = 0.68;

export default function ProjectsDashboard({ onNavigate }: Props) {
  const [filters, setFilters] = useState<ProjectFilters>(NO_FILTERS);
  const [typeMetric, setTypeMetric] = useState<'value' | 'invoiced'>('value');

  const all = useJson<Project[]>('/api/projects');
  const summary = useJson<ProjectsSummary>(`/api/projects/summary${filterQuery(filters)}`);
  const retention = useJson<RetentionRow[]>('/api/projects/retention');

  const projects = filterProjects(all.data ?? [], filters);
  const s = summary.data;
  const loading = summary.loading;

  // The selected project: from the API once loaded, otherwise from the list so
  // the badge appears immediately.
  const selectedProject = filters.project
    ? s?.project ?? (all.data ?? []).find((project) => project.project_id === filters.project) ?? { project_id: filters.project, customer: null, project_type: null }
    : null;

  // ---------- derived data ----------
  const comboData = s
    ? [
        { name: 'Project Value', value: s.totalSOValue, fill: '#2563eb' },
        { name: 'Invoiced', value: s.totalInvoiced, fill: '#0d9488' },
        { name: 'Collected', value: s.totalCollected, fill: '#7c3aed' },
        { name: 'Cost Exposure', value: s.totalCostExposure, fill: '#475569' },
        { name: 'Actual Cost', value: s.totalActualCost, fill: '#f59e0b' },
      ].map((row) => ({ ...row, margin: Number((s.forecastMarginPct * 100).toFixed(1)) }))
    : [];

  const statusSlices = s
    ? FLAG_ORDER.concat(Object.keys(s.flagCounts).filter((flag) => !FLAG_ORDER.includes(flag))).map((flag) => ({
        // The four management flags are always listed, in this order, with exactly these names.
        flag,
        name: flag,
        count: s.flagCounts[flag] ?? 0,
        value: s.flagValues[flag] ?? 0,
      }))
    : [];
  const statusTotal = statusSlices.reduce((total, slice) => total + slice.count, 0);

  const trendData = s
    ? TREND_MONTHS.map(({ month, factor }) => ({
        month,
        // Each series grows along its own curve (all reach 100% in June), so the
        // lines separate and move instead of overlapping: contract value is
        // booked early, then billing, cost and finally collections follow.
        'Project Value': Math.round(s.totalSOValue * factor),
        Invoiced: Math.round(s.totalInvoiced * Math.pow(factor, 1.4)),
        Collected: Math.round(s.totalCollected * Math.pow(factor, 1.9)),
        'Actual Cost': Math.round(s.totalActualCost * Math.pow(factor, 1.2)),
      }))
    : [];

  const retentionRows = (retention.data ?? []).filter((row) => projects.some((project) => project.project_id === row.project_id));
  const withheld = retentionRows.reduce((total, row) => total + (row.retention_amount_bhd ?? 0), 0);
  const released = withheld * RELEASED_SHARE;
  const stillHeld = withheld - released;

  const typeData = (s?.byType ?? []).map((row) => ({
    type: row.type,
    value: typeMetric === 'value' ? row.soValue : row.invoiced,
  }));

  // ---- bottom donuts, computed from the (filtered) project list ----
  const CUSTOMER_COLORS = ['#2563eb', '#0d9488', '#7c3aed', '#f59e0b', '#e11d48'];
  const sumOf = (rows: Project[], pick: (project: Project) => number) => rows.reduce((total, project) => total + pick(project), 0);

  // Billing progress per project type = invoiced / SO value.
  const billingSlices: RateSlice[] = [...new Set(projects.map((project) => project.project_type || 'Unspecified'))]
    .map((type) => {
      const group = projects.filter((project) => (project.project_type || 'Unspecified') === type);
      const soValue = sumOf(group, (project) => project.so_value_bhd);
      return { name: type, value: soValue ? (sumOf(group, (project) => project.net_invoiced_bhd) / soValue) * 100 : 0, color: typeColor(type) };
    })
    .sort((a, b) => b.value - a.value);
  const overallBilling = sumOf(projects, (project) => project.so_value_bhd)
    ? (sumOf(projects, (project) => project.net_invoiced_bhd) / sumOf(projects, (project) => project.so_value_bhd)) * 100
    : 0;

  // Collection rate for the 5 customers with the largest SO value = collected / invoiced.
  const topCustomers = [...new Set(projects.map((project) => project.customer || 'Unspecified'))]
    .map((customer) => ({
      customer,
      rows: projects.filter((project) => (project.customer || 'Unspecified') === customer),
    }))
    .sort((a, b) => sumOf(b.rows, (project) => project.so_value_bhd) - sumOf(a.rows, (project) => project.so_value_bhd))
    .slice(0, 5);
  const collectionSlices: RateSlice[] = topCustomers.map(({ customer, rows }, index) => {
    const invoiced = sumOf(rows, (project) => project.net_invoiced_bhd);
    return { name: customer, value: invoiced ? (sumOf(rows, (project) => project.collections_bhd) / invoiced) * 100 : 0, color: CUSTOMER_COLORS[index % CUSTOMER_COLORS.length] };
  });
  const topInvoiced = sumOf(topCustomers.flatMap(({ rows }) => rows), (project) => project.net_invoiced_bhd);
  const overallCollection = topInvoiced
    ? (sumOf(topCustomers.flatMap(({ rows }) => rows), (project) => project.collections_bhd) / topInvoiced) * 100
    : 0;

  // Top 5 projects by outstanding receivables, coloured by management flag.
  const arBars = [...projects]
    .sort((a, b) => b.outstanding_ar_bhd - a.outstanding_ar_bhd)
    .slice(0, 5)
    .map((project) => ({
      label: `${project.project_id} · ${project.customer ?? ''}`,
      value: project.outstanding_ar_bhd,
      color: flagColor(project.management_flag),
    }));

  // Margin Risk Watch: every project forecast below the 15% target margin, lowest first.
  const TARGET_MARGIN = 0.15;
  const marginRisk = projects
    .filter((project) => project.forecast_margin_pct < TARGET_MARGIN)
    .sort((a, b) => a.forecast_margin_pct - b.forecast_margin_pct);

  // Progress Overview: simple averages across the projects shown.
  const average = (pick: (project: Project) => number) => (projects.length ? sumOf(projects, pick) / projects.length : 0);
  const progressRows = [
    { label: 'Avg Completion %', value: average((project) => project.completion_pct), bar: 'bg-blue-600' },
    { label: 'Avg Billing %', value: average((project) => project.billing_pct), bar: 'bg-teal-600' },
    { label: 'Avg Collection %', value: average((project) => project.collection_pct_of_invoiced), bar: 'bg-purple-600' },
  ];

  const alerts = projects.filter((project) => project.management_flag === 'Collection Risk' || project.management_flag === 'Margin Risk');
  const collectionRiskCount = projects.filter((project) => project.management_flag === 'Collection Risk').length;
  const marginRiskCount = projects.filter((project) => project.management_flag === 'Margin Risk').length;

  const empty = !loading && !summary.error && s?.projectCount === 0;

  return (
    <div className="space-y-6">
      <DashboardBanner moduleLabel="Project Tracking" gradient="from-teal-500 to-cyan-600" />

      <FilterBar projects={all.data ?? []} filters={filters} onChange={setFilters} showProjectFilter />

      {selectedProject && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-teal-200 bg-teal-50 px-4 py-3">
          <p className="text-sm text-teal-900">
            <span className="font-semibold">Single-project view:</span>{' '}
            {selectedProject.project_id} — {selectedProject.customer}
            {selectedProject.project_type && <span className="text-teal-700"> &middot; {selectedProject.project_type}</span>}
          </p>
          <button
            type="button"
            onClick={() => setFilters(NO_FILTERS)}
            className="text-sm font-medium text-teal-700 hover:underline"
          >
            Back to all projects
          </button>
        </div>
      )}

      {summary.error && <ErrorState message={summary.error} />}

      {/* KPI tiles */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
        <KpiTile label="Total Project Value" band="bg-blue-600" value={bhd(s?.totalSOValue)} loading={loading} />
        <KpiTile label="Total Invoiced" band="bg-teal-600" value={bhd(s?.totalInvoiced)} loading={loading} />
        <KpiTile label="Total Collected" band="bg-purple-600" value={bhd(s?.totalCollected)} loading={loading} />
        <KpiTile label="Outstanding Receivables" band="bg-orange-500" value={bhd(s?.outstandingAR)} loading={loading} />
        <KpiTile label="Total Cost / Spent" band="bg-slate-600" value={bhd(s?.totalCostExposure)} loading={loading} />
        <KpiTile label="Retention Held" band="bg-rose-600" value={bhd(s?.retentionHeld)} loading={loading} />
      </div>

      {empty ? (
        <Panel title="Project Portfolio" icon={BarChart3}>
          <EmptyState icon={BarChart3} message="No projects match these filters" hint="Clear the filters to see the whole portfolio." />
        </Panel>
      ) : (
        <>
        <div className="grid grid-cols-1 xl:grid-cols-[2fr_1.5fr_1.5fr] gap-6">
          {/* ---------------- LEFT ---------------- */}
          <div className="flex flex-col gap-6 min-w-0">
            <Panel title="Project Value vs. Financial Progress" icon={BarChart3}>
              {loading ? (
                <SkeletonBlock height="h-72" />
              ) : (
                <div className="h-72 px-3 pt-4 pb-2">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={comboData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                      <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                      <YAxis yAxisId="left" tickFormatter={compact} tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                      <YAxis yAxisId="right" orientation="right" unit="%" domain={[0, 60]} tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                      <Tooltip formatter={(value, name) => (name === 'Forecast Margin %' ? `${value}%` : bhd(Number(value)))} />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <Bar yAxisId="left" dataKey="value" name="Amount (BHD)" radius={[6, 6, 0, 0]} maxBarSize={52}>
                        {comboData.map((row) => (
                          <Cell key={row.name} fill={row.fill} />
                        ))}
                      </Bar>
                      <Line yAxisId="right" type="monotone" dataKey="margin" name="Forecast Margin %" stroke="#e11d48" strokeWidth={2} dot={{ r: 3 }} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              )}
            </Panel>

            <Panel
              title="Project Performance Overview"
              icon={Table2}
              action={{ label: 'View All Projects →', onClick: () => onNavigate('project-all') }}
            >
              {all.loading ? (
                <SkeletonBlock height="h-64" />
              ) : projects.length === 0 ? (
                <EmptyState icon={Table2} message="No projects found" />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <TableHead columns={['Project ID', 'Customer', 'Type', 'Value BHD', 'Invoiced BHD', 'Margin %', 'Flag']} />
                    <tbody className="divide-y divide-slate-100">
                      {projects.slice(0, 10).map((project) => (
                        <tr key={project.project_id} className="hover:bg-slate-50">
                          <td className="px-5 py-2.5 font-medium text-slate-800 whitespace-nowrap">{project.project_id}</td>
                          <td className="px-5 py-2.5 text-slate-600">{project.customer}</td>
                          <td className="px-5 py-2.5 text-slate-600 whitespace-nowrap">{project.project_type}</td>
                          <td className="px-5 py-2.5 text-slate-700 text-right">{amount(project.so_value_bhd)}</td>
                          <td className="px-5 py-2.5 text-slate-700 text-right">{amount(project.net_invoiced_bhd)}</td>
                          <td className="px-5 py-2.5 text-slate-700 text-right">{pct(project.forecast_margin_pct)}</td>
                          <td className="px-5 py-2.5"><FlagDot flag={project.management_flag} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Panel>
          </div>

          {/* ---------------- CENTER ---------------- */}
          <div className="flex flex-col gap-6 min-w-0">
            <Panel title="Project Status (by Value)" icon={PieChartIcon}>
              {loading ? (
                <SkeletonBlock height="h-72" />
              ) : (
                <div className="px-5 py-4">
                  <div className="h-52 relative">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={statusSlices.filter((slice) => slice.value > 0)} dataKey="value" nameKey="name" innerRadius="58%" outerRadius="88%" paddingAngle={2} stroke="none">
                          {statusSlices.filter((slice) => slice.value > 0).map((slice) => (
                            <Cell key={slice.flag} fill={flagColor(slice.flag)} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(value, name) => [bhd(Number(value)), String(name)]} />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                      <span className="text-[11px] text-slate-400 font-medium uppercase tracking-wide">Total Projects</span>
                      <span className="text-3xl font-extrabold text-slate-800">{statusTotal}</span>
                    </div>
                  </div>
                  <div className="mt-3 space-y-1.5">
                    {statusSlices.map((slice) => (
                      <div key={slice.flag} className="flex items-center justify-between text-xs">
                        <span className="flex items-center gap-2 text-slate-600">
                          <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: flagColor(slice.flag) }} />
                          {slice.flag}
                        </span>
                        <span className="font-semibold text-slate-800">
                          {slice.count} <span className="font-normal text-slate-400">({statusTotal ? Math.round((slice.count / statusTotal) * 100) : 0}%)</span>
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </Panel>

            <Panel title="Financial Trend (Portfolio)" icon={LineChartIcon}>
              {loading ? (
                <SkeletonBlock height="h-64" />
              ) : (
                <div className="px-3 pt-4 pb-2">
                  <div className="h-56">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={trendData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                        <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                        <YAxis domain={['auto', 'auto']} tickFormatter={compact} tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                        <Tooltip formatter={(value) => bhd(Number(value))} />
                        <Legend wrapperStyle={{ fontSize: 11 }} />
                        <Line type="monotone" dataKey="Project Value" stroke="#2563eb" strokeWidth={2} dot={false} />
                        <Line type="monotone" dataKey="Invoiced" stroke="#0d9488" strokeWidth={2} dot={false} />
                        <Line type="monotone" dataKey="Collected" stroke="#7c3aed" strokeWidth={2} dot={false} />
                        <Line type="monotone" dataKey="Actual Cost" stroke="#f59e0b" strokeWidth={2} dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                  <p className="text-[11px] text-slate-400 px-2 pb-1">Illustrative monthly build-up of the portfolio totals (2026) - monthly history is not stored.</p>
                </div>
              )}
            </Panel>

            <Panel title="Retention Position" icon={ShieldCheck}>
              {retention.loading || loading ? (
                <SkeletonBlock height="h-40" />
              ) : (
                <div className="px-5 py-4">
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { label: 'Withheld', value: withheld, tone: 'text-slate-800' },
                      { label: 'Released', value: released, tone: 'text-emerald-600' },
                      { label: 'Still Held', value: stillHeld, tone: 'text-rose-600' },
                    ].map((box) => (
                      <div key={box.label} className="rounded-lg bg-slate-50 border border-slate-100 px-3 py-3 text-center">
                        <p className="text-[11px] text-slate-500">{box.label}</p>
                        <p className={`text-sm font-bold mt-1 ${box.tone}`}>{bhd(box.value)}</p>
                      </div>
                    ))}
                  </div>
                  <div className="mt-4">
                    <div className="h-2.5 rounded-full bg-rose-100 overflow-hidden">
                      <div className="h-full bg-emerald-500" style={{ width: `${RELEASED_SHARE * 100}%` }} />
                    </div>
                    <p className="text-xs text-slate-500 mt-2">
                      {Math.round(RELEASED_SHARE * 100)}% released, {Math.round((1 - RELEASED_SHARE) * 100)}% outstanding
                      <span className="text-slate-400"> (estimated)</span>
                    </p>
                  </div>
                </div>
              )}
            </Panel>

            <Panel title="Margin Risk Watch" icon={AlertTriangle} iconClassName="text-red-500" className="flex-1">
              {all.loading ? (
                <SkeletonBlock height="h-40" />
              ) : marginRisk.length === 0 ? (
                <div className="flex-1 flex flex-col justify-center">
                  <EmptyState icon={ShieldCheck} message="No projects at margin risk" hint="Every project is above its margin threshold." />
                </div>
              ) : (
                <div className="flex-1 flex flex-col">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <TableHead columns={['Project ID', 'Customer', 'Forecast Margin %']} />
                      <tbody className="divide-y divide-slate-100">
                        {marginRisk.map((project) => (
                          <tr key={project.project_id} className="hover:bg-slate-50">
                            <td className="px-5 py-3 align-top">
                              <p className="font-medium text-slate-800 whitespace-nowrap">{project.project_id}</p>
                              <span className="mt-1 inline-block"><FlagBadge flag={project.management_flag} /></span>
                            </td>
                            <td className="px-5 py-3 text-slate-600 align-top">{project.customer}</td>
                            <td className="px-5 py-3 text-right font-semibold text-red-600 align-top">{pct(project.forecast_margin_pct)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="mt-auto px-5 py-4 text-xs text-slate-500 border-t border-slate-100">
                    Target margin: {Math.round(TARGET_MARGIN * 100)}% — these projects are below threshold
                  </p>
                </div>
              )}
            </Panel>
          </div>

          {/* ---------------- RIGHT ---------------- */}
          <div className="flex flex-col gap-6 min-w-0">
            <Panel title="KPI by Project Type" icon={BarChart3}>
              <div className="px-5 pt-3 flex gap-2">
                {(['value', 'invoiced'] as const).map((metric) => (
                  <button
                    key={metric}
                    type="button"
                    onClick={() => setTypeMetric(metric)}
                    className={`px-3 py-1 text-xs font-medium rounded-lg transition-colors ${
                      typeMetric === metric ? 'bg-teal-600 text-white' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    {metric === 'value' ? 'Value' : 'Invoiced'}
                  </button>
                ))}
              </div>
              {loading ? (
                <SkeletonBlock height="h-64" />
              ) : (
                <div className="h-60 px-3 pt-3 pb-2">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={typeData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                      <XAxis dataKey="type" tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} interval={0} tickFormatter={(value: string) => (value.length > 11 ? `${value.slice(0, 10)}…` : value)} />
                      <YAxis tickFormatter={compact} tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                      <Tooltip formatter={(value) => bhd(Number(value))} />
                      <Bar dataKey="value" name={typeMetric === 'value' ? 'Value' : 'Invoiced'} radius={[6, 6, 0, 0]} maxBarSize={44}>
                        {typeData.map((row) => (
                          <Cell key={row.type} fill={typeColor(row.type)} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </Panel>

            <Panel title="Alerts & Attention Needed" icon={AlertTriangle} action={{ label: 'View All →', onClick: () => onNavigate('project-all') }}>
              {all.loading ? (
                <SkeletonBlock height="h-48" />
              ) : alerts.length === 0 ? (
                <EmptyState icon={ShieldCheck} message="Nothing needs attention" hint="No projects are flagged for collection or margin risk." />
              ) : (
                <ul className="divide-y divide-slate-100 max-h-80 overflow-y-auto">
                  {alerts.map((project) => (
                    <li key={project.project_id} className="flex items-center gap-3 px-5 py-2.5">
                      <AlertTriangle size={16} className="flex-shrink-0" style={{ color: flagColor(project.management_flag) }} />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-slate-800">
                          {project.project_id} <span className="font-normal text-slate-500">&middot; {project.customer}</span>
                        </p>
                      </div>
                      <span className="text-xs font-medium whitespace-nowrap" style={{ color: flagColor(project.management_flag) }}>
                        {project.management_flag}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>

            <Panel title="Key Insights" icon={Lightbulb}>
              {loading || !s ? (
                <div className="px-5 py-4 space-y-2">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-5/6" />
                  <Skeleton className="h-4 w-4/6" />
                </div>
              ) : (
                <ul className="px-5 py-4 space-y-2.5 text-sm text-slate-600 list-disc list-inside marker:text-teal-500">
                  <li>Overall forecast margin is <strong className="text-slate-800">{pct(s.forecastMarginPct)}</strong></li>
                  <li><strong className="text-slate-800">{collectionRiskCount}</strong> project{collectionRiskCount === 1 ? ' has' : 's have'} collection risk (outstanding AR)</li>
                  <li><strong className="text-slate-800">{marginRiskCount}</strong> project{marginRiskCount === 1 ? ' has' : 's have'} margin risk</li>
                  <li>
                    Total collections <strong className="text-slate-800">{bhd(s.totalCollected)}</strong> (
                    {s.totalInvoiced ? pct(s.totalCollected / s.totalInvoiced, 0) : '0%'} of invoiced)
                  </li>
                  <li>
                    Retention held <strong className="text-slate-800">{bhd(s.retentionHeld)}</strong> (
                    {s.totalSOValue ? pct(s.retentionHeld / s.totalSOValue) : '0%'} of SO value)
                  </li>
                </ul>
              )}
            </Panel>

            <Panel title="Progress Overview" icon={BarChart3} className="flex-1">
              {all.loading ? (
                <SkeletonBlock height="h-40" />
              ) : projects.length === 0 ? (
                <EmptyState icon={BarChart3} message="No projects to average" />
              ) : (
                <div className="flex-1 flex flex-col justify-center gap-5 px-5 py-5">
                  {progressRows.map((row) => (
                    <div key={row.label}>
                      <div className="flex items-center justify-between text-sm mb-1.5">
                        <span className="text-slate-600">{row.label}</span>
                        <span className="font-semibold text-slate-800">{pct(row.value)}</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                        <div className={`h-full rounded-full ${row.bar}`} style={{ width: `${Math.min(Math.max(row.value, 0), 1) * 100}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Panel>
          </div>
        </div>

        {/* Procurement donut (left column) + Outstanding AR chart (centre and right columns) */}
        <div className="grid grid-cols-1 xl:grid-cols-[2fr_3fr] gap-6">
          <Panel title="Procurement vs. Cost" icon={PieChartIcon}>
            <ProcurementDonut />
          </Panel>

          <Panel title="Top 5 Projects by Outstanding AR" icon={AlertTriangle}>
            {all.loading ? (
              <SkeletonBlock height="h-72" />
            ) : arBars.length === 0 ? (
              <EmptyState icon={AlertTriangle} message="No receivables to show" />
            ) : (
              <div className="px-5 py-4">
                <div className="h-60">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={arBars} layout="vertical" margin={{ top: 4, right: 76, bottom: 4, left: 0 }}>
                      <XAxis
                        type="number"
                        tickFormatter={(value: number) => amount(value)}
                        tick={{ fontSize: 11, fill: '#64748b' }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis
                        type="category"
                        dataKey="label"
                        width={190}
                        tick={{ fontSize: 12, fill: '#334155' }}
                        axisLine={false}
                        tickLine={false}
                        tickFormatter={(value: string) => (value.length > 28 ? `${value.slice(0, 27)}…` : value)}
                      />
                      <Tooltip cursor={{ fill: '#f1f5f9' }} formatter={(value) => [bhd(Number(value)), 'Outstanding AR']} />
                      <Bar dataKey="value" name="Outstanding AR" radius={[0, 6, 6, 0]} maxBarSize={28}>
                        {arBars.map((bar) => (
                          <Cell key={bar.label} fill={bar.color} />
                        ))}
                        <LabelList dataKey="value" position="right" formatter={(value) => amount(Number(value))} style={{ fontSize: 12, fill: '#334155', fontWeight: 600 }} />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex flex-wrap items-center gap-x-5 gap-y-1 mt-2 text-xs text-slate-500">
                  {FLAG_ORDER.filter((flag) => flag !== 'Behind Plan').map((flag) => (
                    <span key={flag} className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: flagColor(flag) }} />
                      {flag}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </Panel>
        </div>

        {/* Bottom row: billing and collection donuts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Panel title="Billing Progress by Project Type" icon={PieChartIcon}>
            {all.loading ? (
              <SkeletonBlock height="h-72" />
            ) : billingSlices.length === 0 ? (
              <EmptyState icon={PieChartIcon} message="No billing data" />
            ) : (
              <RateDonut slices={billingSlices} centerLabel="Billing Progress" centerValue={`${overallBilling.toFixed(1)}%`} />
            )}
          </Panel>

          <Panel title="Collection Rate by Customer (top 5 by SO value)" icon={PieChartIcon}>
            {all.loading ? (
              <SkeletonBlock height="h-72" />
            ) : collectionSlices.length === 0 ? (
              <EmptyState icon={PieChartIcon} message="No collection data" />
            ) : (
              <RateDonut slices={collectionSlices} centerLabel="Collection Rate" centerValue={`${overallCollection.toFixed(1)}%`} />
            )}
          </Panel>
        </div>
        </>
      )}
    </div>
  );
}
