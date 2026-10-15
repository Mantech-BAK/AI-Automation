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
}

export const NO_FILTERS: ProjectFilters = { customer: '', type: '', flag: '' };

export function filterProjects(projects: Project[], filters: ProjectFilters): Project[] {
  return projects.filter(
    (project) =>
      (!filters.customer || project.customer === filters.customer) &&
      (!filters.type || project.project_type === filters.type) &&
      (!filters.flag || project.management_flag === filters.flag)
  );
}

export function filterQuery(filters: ProjectFilters): string {
  const params = new URLSearchParams();
  if (filters.customer) params.set('customer', filters.customer);
  if (filters.type) params.set('type', filters.type);
  if (filters.flag) params.set('flag', filters.flag);
  const query = params.toString();
  return query ? `?${query}` : '';
}

export const unique = (values: (string | null | undefined)[]): string[] =>
  [...new Set(values.filter((value): value is string => Boolean(value)))].sort();
