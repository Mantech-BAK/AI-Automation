import { useState } from 'react';
import { ArrowDown, ArrowUp, FolderOpen, X } from 'lucide-react';
import { EmptyState, ErrorState, Panel, useJson } from '../../components/dashboard/parts';
import { Amt, FilterBar, FlagBadge, SkeletonBlock, PageShell, PANEL_FILL, TABLE_SCROLL } from '../../components/projects/shared';
import { NO_FILTERS, amount2, filterProjects, formatDMY, pct, type Project, type ProjectFilters } from '../../lib/projects';

type SortKey = keyof Project;

type Totals = Record<'so' | 'invoiced' | 'collected' | 'ar', number>;

const COLUMNS: { key: SortKey; label: string; align?: 'right'; render: (project: Project, totals: Totals) => React.ReactNode }[] = [
  { key: 'project_id', label: 'Project ID', render: (p) => <span className="font-medium text-slate-800">{p.project_id}</span> },
  { key: 'customer', label: 'Customer', render: (p) => p.customer },
  { key: 'project_type', label: 'Project Type', render: (p) => p.project_type },
  { key: 'so_value_bhd', label: 'SO Value BHD', align: 'right', render: (p, t) => <Amt value={p.so_value_bhd} total={t.so} /> },
  { key: 'net_invoiced_bhd', label: 'Net Invoiced BHD', align: 'right', render: (p, t) => <Amt value={p.net_invoiced_bhd} total={t.invoiced} /> },
  { key: 'collections_bhd', label: 'Collections BHD', align: 'right', render: (p, t) => <Amt value={p.collections_bhd} total={t.collected} /> },
  { key: 'outstanding_ar_bhd', label: 'Outstanding AR BHD', align: 'right', render: (p, t) => <Amt value={p.outstanding_ar_bhd} total={t.ar} /> },
  { key: 'completion_pct', label: 'Completion %', align: 'right', render: (p) => pct(p.completion_pct) },
  { key: 'billing_pct', label: 'Billing %', align: 'right', render: (p) => pct(p.billing_pct) },
  { key: 'collection_pct_of_invoiced', label: 'Collection %', align: 'right', render: (p) => pct(p.collection_pct_of_invoiced) },
  { key: 'forecast_margin_pct', label: 'Forecast Margin %', align: 'right', render: (p) => pct(p.forecast_margin_pct) },
  { key: 'management_flag', label: 'Management Flag', render: (p) => <FlagBadge flag={p.management_flag} /> },
];

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2 border-b border-slate-100 last:border-0">
      <dt className="text-sm text-slate-500">{label}</dt>
      <dd className="text-sm font-medium text-slate-800 text-right">{value ?? '-'}</dd>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">{title}</h3>
      <dl>{children}</dl>
    </section>
  );
}

// Slide-over with every field of one project. The list row is shown straight away
// and replaced by the full record once GET /api/projects/:id answers.
function ProjectPanel({ row, onClose }: { row: Project; onClose: () => void }) {
  const detail = useJson<Project>(`/api/projects/${encodeURIComponent(row.project_id)}`);
  const p = detail.data ?? row;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="fixed inset-0 bg-black/40" onClick={onClose} />
      <aside className="relative w-full max-w-md bg-white shadow-2xl h-full overflow-y-auto">
        <div className="sticky top-0 flex items-center justify-between px-6 py-4 bg-gradient-to-r from-teal-600 to-cyan-600 text-white">
          <h2 className="text-lg font-semibold">
            {p.project_id} <span className="font-normal opacity-90">&middot; {p.customer}</span>
          </h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-white/20" aria-label="Close">
            <X size={20} />
          </button>
        </div>

        <div className="px-6 py-5 space-y-6">
          {detail.error && <ErrorState message={detail.error} />}

          <Section title="Overview">
            <Field label="Project ID" value={p.project_id} />
            <Field label="SO No" value={p.so_no} />
            <Field label="Customer" value={p.customer} />
            <Field label="Project Type" value={p.project_type} />
            <Field label="Start Date" value={formatDMY(p.start_date)} />
            <Field label="Expected End Date" value={formatDMY(p.expected_end_date)} />
            <Field label="Project Status" value={p.project_status} />
            <Field label="Management Flag" value={<FlagBadge flag={p.management_flag} />} />
          </Section>

          <Section title="Financial Summary">
            <Field label="SO Value (BHD)" value={amount2(p.so_value_bhd)} />
            <Field label="Retention Rate" value={pct(p.retention_rate, 0)} />
            <Field label="Net Invoiced (BHD)" value={<Amt value={p.net_invoiced_bhd} total={p.so_value_bhd} format={amount2} />} />
            <Field label="Collections (BHD)" value={<Amt value={p.collections_bhd} total={p.so_value_bhd} format={amount2} />} />
            <Field label="Actual Cost (BHD)" value={<Amt value={p.actual_cost_bhd} total={p.so_value_bhd} format={amount2} />} />
            <Field label="Committed Cost (BHD)" value={<Amt value={p.committed_cost_bhd} total={p.so_value_bhd} format={amount2} />} />
            <Field label="Total Cost Exposure (BHD)" value={<Amt value={p.total_cost_exposure_bhd} total={p.so_value_bhd} format={amount2} />} />
            <Field label="Outstanding AR (BHD)" value={<Amt value={p.outstanding_ar_bhd} total={p.so_value_bhd} format={amount2} />} />
            <Field label="Unbilled SO Balance (BHD)" value={<Amt value={p.unbilled_so_balance_bhd} total={p.so_value_bhd} format={amount2} />} />
            <Field label="Forecast Margin (BHD)" value={<Amt value={p.forecast_margin_bhd} total={p.so_value_bhd} format={amount2} />} />
            <Field label="Forecast Margin %" value={pct(p.forecast_margin_pct, 2)} />
          </Section>

          <Section title="Progress Metrics">
            <Field label="Completion %" value={pct(p.completion_pct, 2)} />
            <Field label="Planned Progress %" value={pct(p.planned_progress_pct, 2)} />
            <Field label="Progress Variance %" value={pct(p.progress_variance_pct, 2)} />
            <Field label="Billing %" value={pct(p.billing_pct, 2)} />
            <Field label="Collection % of Invoiced" value={pct(p.collection_pct_of_invoiced, 2)} />
          </Section>
        </div>
      </aside>
    </div>
  );
}

export default function AllProjects() {
  const projects = useJson<Project[]>('/api/projects');
  const [filters, setFilters] = useState<ProjectFilters>(NO_FILTERS);
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'project_id', dir: 'asc' });
  const [selected, setSelected] = useState<Project | null>(null);

  const rows = filterProjects(projects.data ?? [], filters).sort((a, b) => {
    const av = a[sort.key];
    const bv = b[sort.key];
    const order = typeof av === 'number' && typeof bv === 'number' ? av - bv : String(av ?? '').localeCompare(String(bv ?? ''), undefined, { numeric: true });
    return sort.dir === 'asc' ? order : -order;
  });

  const totals: Totals = {
    so: rows.reduce((sum, p) => sum + p.so_value_bhd, 0),
    invoiced: rows.reduce((sum, p) => sum + p.net_invoiced_bhd, 0),
    collected: rows.reduce((sum, p) => sum + p.collections_bhd, 0),
    ar: rows.reduce((sum, p) => sum + p.outstanding_ar_bhd, 0),
  };

  const toggleSort = (key: SortKey) =>
    setSort((current) => (current.key === key ? { key, dir: current.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }));

  return (
    <PageShell
      title="All Projects"
      subtitle={
        <>
          {projects.data ? `${rows.length} of ${projects.data.length} projects` : 'Every project in the portfolio'} &middot; click a row for full details
        </>
      }
      header={<FilterBar projects={projects.data ?? []} filters={filters} onChange={setFilters} />}
    >
      <Panel title="Projects" icon={FolderOpen} className={PANEL_FILL}>
        {projects.loading ? (
          <SkeletonBlock height="h-96" />
        ) : projects.error ? (
          <ErrorState message={projects.error} />
        ) : rows.length === 0 ? (
          <EmptyState icon={FolderOpen} message="No projects found" hint="Try clearing the filters." />
        ) : (
          <div className={TABLE_SCROLL}>
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  {COLUMNS.map((column) => (
                    <th
                      key={column.key}
                      onClick={() => toggleSort(column.key)}
                      className={`sticky top-0 z-10 bg-slate-50 px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap cursor-pointer select-none hover:text-slate-800 ${column.align === 'right' ? 'text-right' : 'text-left'}`}
                    >
                      <span className="inline-flex items-center gap-1">
                        {column.label}
                        {sort.key === column.key && (sort.dir === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((project) => (
                  <tr key={project.project_id} onClick={() => setSelected(project)} className="hover:bg-teal-50/50 cursor-pointer">
                    {COLUMNS.map((column) => (
                      <td key={column.key} className={`px-4 py-2.5 text-slate-600 whitespace-nowrap ${column.align === 'right' ? 'text-right' : ''}`}>
                        {column.render(project, totals)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {selected && <ProjectPanel row={selected} onClose={() => setSelected(null)} />}
    </PageShell>
  );
}
