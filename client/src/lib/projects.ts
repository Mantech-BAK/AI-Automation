// Shared types, colours and formatters for the Project Tracking module.

export interface Project {
  project_id: string;
  so_no: string | null;
  customer: string | null;
  project_type: string | null;
  start_date: string | null;
  expected_end_date: string | null;
  so_value_bhd: number;
  retention_rate: number;
  net_invoiced_bhd: number;
  collections_bhd: number;
  actual_cost_bhd: number;
  committed_cost_bhd: number;
  total_cost_exposure_bhd: number;
  outstanding_ar_bhd: number;
  unbilled_so_balance_bhd: number;
  forecast_margin_bhd: number;
  forecast_margin_pct: number;
  billing_pct: number;
  collection_pct_of_invoiced: number;
  project_status: string | null;
  completion_pct: number;
  planned_progress_pct: number;
  progress_variance_pct: number;
  management_flag: string | null;
}

export interface ProjectsSummary {
  projectCount: number;
  totalSOValue: number;
  totalInvoiced: number;
  totalCollected: number;
  outstandingAR: number;
  totalCostExposure: number;
  totalActualCost: number;
  retentionHeld: number;
  forecastMarginPct: number;
  flagCounts: Record<string, number>;
  flagValues: Record<string, number>;
  byType: { type: string; soValue: number; invoiced: number; forecastMarginPct: number }[];
  byCustomer: { customer: string; soValue: number; invoiced: number; collected: number }[];
  // Set when the summary was requested for a single project (?project_id=).
  project?: { project_id: string; customer: string | null; project_type: string | null } | null;
}

export interface RetentionRow {
  id: number;
  project_id: string;
  customer: string | null;
  so_no: string | null;
  so_value_bhd: number | null;
  retention_rate: number | null;
  retention_amount_bhd: number | null;
  release_rule: string | null;
  collection_treatment: string | null;
}

export interface ArTransaction {
  id: number;
  project_id: string;
  customer: string | null;
  transaction_ref: string | null;
  so_no: string | null;
  transaction_type: string | null;
  transaction_date: string | null;
  amount_bhd: number | null;
  description: string | null;
  due_date: string | null;
  // Paid, Pending or Overdue.
  status: string | null;
}

// Management flag colours, shared by the dots, badges and the status donut.
export const FLAG_ORDER = ['On Track', 'Collection Risk', 'Margin Risk', 'Behind Plan'];
export const FLAG_COLORS: Record<string, string> = {
  'On Track': '#16a34a',
  'Collection Risk': '#ea580c',
  'Margin Risk': '#dc2626',
  'Behind Plan': '#6b7280',
};
export const flagColor = (flag?: string | null): string => (flag && FLAG_COLORS[flag]) || '#6b7280';

export const TYPE_COLORS: Record<string, string> = {
  Implementation: '#2563eb',
  'Supply & Installation': '#0d9488',
  Maintenance: '#7c3aed',
  Telematics: '#ea580c',
  Infrastructure: '#e11d48',
};
export const typeColor = (type?: string | null): string => (type && TYPE_COLORS[type]) || '#64748b';

const wholeNumber = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
const twoDecimals = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// "BHD 5,581,200" for headline figures.
export const bhd = (value?: number | null): string => `BHD ${wholeNumber.format(Number(value) || 0)}`;
// Plain grouped number for table cells (the column header says BHD).
export const amount = (value?: number | null): string => wholeNumber.format(Number(value) || 0);
export const amount2 = (value?: number | null): string => twoDecimals.format(Number(value) || 0);
// Stored fractions (0.2744) shown as a percentage.
export const pct = (fraction?: number | null, digits = 1): string => `${((Number(fraction) || 0) * 100).toFixed(digits)}%`;

// Compact axis labels: 1,200,000 -> 1.2M
export function compact(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (abs >= 1_000) return `${(value / 1_000).toFixed(0)}K`;
  return String(value);
}

export function formatDMY(value?: string | null): string {
  if (!value) return '-';
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : '-';
}

export interface ProjectFilters {
  customer: string;
  type: string;
  flag: string;
  // Single-project view (dashboard only); '' = whole portfolio.
  project?: string;
  // Date range (YYYY-MM-DD), dashboard only; '' = open-ended.
  dateFrom?: string;
  dateTo?: string;
}

export const NO_FILTERS: ProjectFilters = { customer: '', type: '', flag: '', project: '', dateFrom: '', dateTo: '' };

type FacetKey = 'customer' | 'type' | 'flag' | 'project';

// A project is inside the date range when its start..expected-end window
// overlaps it (projects without dates are never excluded).
function inDateRange(project: Project, filters: ProjectFilters): boolean {
  if (filters.dateFrom && project.expected_end_date && project.expected_end_date < filters.dateFrom) return false;
  if (filters.dateTo && project.start_date && project.start_date > filters.dateTo) return false;
  return true;
}

// Applies every filter except `skip` - used to build cascading dropdowns, where
// each dropdown only offers values that still fit all the OTHER filters.
export function filterProjects(projects: Project[], filters: ProjectFilters, skip?: FacetKey): Project[] {
  return projects.filter(
    (project) =>
      (skip === 'project' || !filters.project || project.project_id === filters.project) &&
      (skip === 'customer' || !filters.customer || project.customer === filters.customer) &&
      (skip === 'type' || !filters.type || project.project_type === filters.type) &&
      (skip === 'flag' || !filters.flag || project.management_flag === filters.flag) &&
      inDateRange(project, filters)
  );
}

// Values a dropdown can offer: those present in the projects that match every other filter.
export function facetOptions(projects: Project[], filters: ProjectFilters, key: FacetKey): string[] {
  const rows = filterProjects(projects, filters, key);
  const pick = (project: Project) =>
    key === 'customer' ? project.customer : key === 'type' ? project.project_type : key === 'flag' ? project.management_flag : project.project_id;
  return unique(rows.map(pick));
}

// After a change, drops any selection that no longer fits the others (e.g. a
// project outside the new date range), so the dropdowns never contradict each other.
export function normalizeFilters(projects: Project[], filters: ProjectFilters): ProjectFilters {
  let next = filters;
  for (let pass = 0; pass < 4; pass += 1) {
    let changed = false;
    for (const key of ['project', 'customer', 'type', 'flag'] as FacetKey[]) {
      const value = next[key];
      if (value && !facetOptions(projects, next, key).includes(value)) {
        next = { ...next, [key]: '' };
        changed = true;
      }
    }
    if (!changed) break;
  }
  return next;
}

export function filterQuery(filters: ProjectFilters): string {
  const params = new URLSearchParams();
  if (filters.project) params.set('project_id', filters.project);
  if (filters.customer) params.set('customer', filters.customer);
  if (filters.type) params.set('type', filters.type);
  if (filters.flag) params.set('flag', filters.flag);
  if (filters.dateFrom) params.set('date_from', filters.dateFrom);
  if (filters.dateTo) params.set('date_to', filters.dateTo);
  const query = params.toString();
  return query ? `?${query}` : '';
}

// "18.2%" - a value's share of a total (0 when the total is 0).
export const sharePct = (value?: number | null, total?: number | null): string =>
  `${total ? (((Number(value) || 0) / total) * 100).toFixed(1) : '0.0'}%`;

export const unique = (values: (string | null | undefined)[]): string[] =>
  [...new Set(values.filter((value): value is string => Boolean(value)))].sort();
