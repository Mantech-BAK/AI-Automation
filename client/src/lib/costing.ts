import { apiFetch } from './api';

// Costing Sheet: types, live calculation (mirrors utils/costing.js - the server recomputes on save) and helpers.

export const DEFAULT_OH_PCT = 35;
const WORKING_DAYS_PER_MONTH = 26;

export type Section = 'ST1' | 'ST2' | 'ST3' | 'ST4';
export const SECTION_TITLES: Record<Section, string> = {
  ST1: 'ST1 - Foreign Materials',
  ST2: 'ST2 - Local Materials / Subcontract',
  ST3: 'ST3 - Installation / Labour',
  ST4: 'ST4 - Bank Charges',
};

export const ENQUIRY_STATUS_LABELS: Record<string, string> = {
  open: 'Open',
  in_progress: 'In Progress',
  costing_done: 'Costing Done',
  approved: 'Approved',
  rejected: 'Rejected',
  closed: 'Closed',
};
export const ENQUIRY_STATUSES = Object.keys(ENQUIRY_STATUS_LABELS);

export const STATUS_STYLES: Record<string, string> = {
  open: 'bg-slate-100 text-slate-700',
  in_progress: 'bg-blue-100 text-blue-700',
  costing_done: 'bg-violet-100 text-violet-700',
  approved: 'bg-emerald-100 text-emerald-700',
  rejected: 'bg-red-100 text-red-700',
  closed: 'bg-slate-200 text-slate-600',
  draft: 'bg-slate-100 text-slate-700',
  submitted: 'bg-amber-100 text-amber-800',
  pending: 'bg-slate-100 text-slate-700',
  completed: 'bg-emerald-100 text-emerald-700',
};

export const statusLabel = (status: string): string =>
  ENQUIRY_STATUS_LABELS[status] ?? status.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());

export interface MasUser {
  id: number;
  name: string;
  email: string | null;
  role_id: number;
  department_id: number | null;
  manager_id: number | null;
  is_active: boolean;
  role_name: string;
  role_level: number;
  department_name: string | null;
  manager_name: string | null;
}

export interface Department {
  id: number;
  name: string;
}

export interface Enquiry {
  id: number;
  enquiry_no: string;
  client_name: string;
  project_name: string;
  project_location: string | null;
  consultant: string | null;
  main_contractor: string | null;
  department_id: number | null;
  department_name: string | null;
  assigned_to: number | null;
  assigned_to_name: string | null;
  salesman_id: number | null;
  salesman_name: string | null;
  submission_date: string | null;
  estimated_value: number | string | null;
  status: string;
  notes: string | null;
  created_by_name: string | null;
  latest_sheet_id: number | null;
  latest_sheet_status: string | null;
}

export interface Task {
  id: number;
  enquiry_id: number;
  enquiry_no: string;
  project_name: string;
  client_name: string;
  assigned_to: number | null;
  assigned_to_name: string | null;
  task_title: string;
  description: string | null;
  due_date: string | null;
  status: string;
}

export interface Sheet {
  id: number;
  enquiry_id: number;
  enquiry_no: string;
  quotation_ref_no: string;
  revision_no: number;
  is_latest: boolean;
  project_name: string | null;
  client: string | null;
  consultant: string | null;
  main_contractor: string | null;
  date: string;
  department_id: number | null;
  department_name: string | null;
  prepared_by: number | null;
  prepared_by_name: string | null;
  preparer_manager_name: string | null;
  status: string;
  rejection_comment: string | null;
  reviewed_by_name: string | null;
  reviewed_at: string | null;
  total_net_cost: number | string;
  total_selling_amount: number | string;
  can_edit: boolean;
  can_review: boolean;
}

export interface Revision {
  id: number;
  quotation_ref_no: string;
  revision_no: number;
  status: string;
  is_latest: boolean;
}

// Form values are strings while typing; numbers are parsed on calculation.
export interface LineItem {
  key: string;
  section: Section;
  // A heading row is a label between groups of items: only `description` is used.
  is_heading: boolean;
  sl_no: string;
  qty: string;
  unit: string;
  model_no: string;
  description: string;
  unit_cost_exw: string;
  bd_conversion_rate: string;
  supplier_discount_pct: string;
  shipping_duty_pct: string;
  margin_pct: string;
  unit_cost_bd: string;
  nos: string;
  months: string;
  days: string;
  role_name: string;
  salary_per_month: string;
  oh_pct: string;
  amount: string;
}

const num = (value: unknown): number => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

export interface LineResult {
  unit_rate_discounted?: number;
  unit_rate_with_cf?: number;
  unit_rate_bd?: number;
  total_cost_bd?: number;
  total_landing_cost_bd?: number;
  unit_rate_selling?: number;
  selling_total_bd?: number;
  per_day_rate?: number;
  total_cost?: number;
  cost: number;
  selling: number;
  oh: number;
}

export function calcLine(line: LineItem): LineResult {
  if (line.is_heading) return { cost: 0, selling: 0, oh: 0 };
  const qty = num(line.qty);

  if (line.section === 'ST1') {
    // Same chain as the Excel template: discount -> BD conversion -> + shipping & duty -> + margin (blank conversion = 1).
    const rate = line.bd_conversion_rate === '' ? 1 : num(line.bd_conversion_rate);
    const discounted = num(line.unit_cost_exw) * (1 - num(line.supplier_discount_pct) / 100);
    const unitBd = discounted * rate;
    const withCf = unitBd * (1 + num(line.shipping_duty_pct) / 100);
    const unitSelling = withCf * (1 + num(line.margin_pct) / 100);
    return {
      unit_rate_discounted: discounted,
      unit_rate_bd: unitBd,
      total_cost_bd: unitBd * qty,
      unit_rate_with_cf: withCf,
      total_landing_cost_bd: withCf * qty,
      unit_rate_selling: unitSelling,
      selling_total_bd: unitSelling * qty,
      cost: withCf * qty,
      selling: unitSelling * qty,
      oh: 0,
    };
  }

  if (line.section === 'ST2') {
    const total = qty * num(line.unit_cost_bd);
    const selling = total * (1 + num(line.margin_pct) / 100);
    return { total_cost_bd: total, selling_total_bd: selling, cost: total, selling, oh: 0 };
  }

  if (line.section === 'ST3') {
    const perDay = num(line.salary_per_month) / WORKING_DAYS_PER_MONTH;
    const base = num(line.nos) * (num(line.months) * WORKING_DAYS_PER_MONTH + num(line.days)) * perDay;
    const ohPct = line.oh_pct === '' ? DEFAULT_OH_PCT : num(line.oh_pct);
    const oh = (base * ohPct) / 100;
    return { per_day_rate: perDay, total_cost: base + oh, cost: base, selling: base + oh, oh };
  }

  const amount = num(line.amount);
  return { cost: amount, selling: amount, oh: 0 };
}

export interface Summary {
  st1_total_landing_cost: number;
  st2_total_cost: number;
  st3_total_cost: number;
  oh_charges: number;
  st4_bank_charges: number;
  total_net_cost: number;
  total_selling_amount: number;
  profit_pct_on_cost: number;
  profit_pct_on_selling: number;
}

export function calcSheet(lines: LineItem[]): { results: LineResult[]; summary: Summary } {
  const sums: Record<Section, { cost: number; selling: number }> = {
    ST1: { cost: 0, selling: 0 },
    ST2: { cost: 0, selling: 0 },
    ST3: { cost: 0, selling: 0 },
    ST4: { cost: 0, selling: 0 },
  };
  let oh = 0;
  const results = lines.map((line) => {
    const result = calcLine(line);
    sums[line.section].cost += result.cost;
    sums[line.section].selling += result.selling;
    oh += result.oh;
    return result;
  });

  const net = sums.ST1.cost + sums.ST2.cost + sums.ST3.cost + oh + sums.ST4.cost;
  const selling = sums.ST1.selling + sums.ST2.selling + sums.ST3.selling + sums.ST4.selling;
  const profit = selling - net;
  return {
    results,
    summary: {
      st1_total_landing_cost: sums.ST1.cost,
      st2_total_cost: sums.ST2.cost,
      st3_total_cost: sums.ST3.cost,
      oh_charges: oh,
      st4_bank_charges: sums.ST4.cost,
      total_net_cost: net,
      total_selling_amount: selling,
      profit_pct_on_cost: net ? (profit / net) * 100 : 0,
      profit_pct_on_selling: selling ? (profit / selling) * 100 : 0,
    },
  };
}

let keyCounter = 0;
export const newKey = () => `l${Date.now().toString(36)}${keyCounter++}`;

export function emptyLine(section: Section, slNo = ''): LineItem {
  return {
    key: newKey(),
    section,
    is_heading: false,
    sl_no: slNo,
    qty: section === 'ST1' || section === 'ST2' ? '1' : '',
    unit: section === 'ST3' || section === 'ST4' ? '' : 'nos',
    model_no: '',
    description: '',
    unit_cost_exw: '',
    bd_conversion_rate: '1',
    supplier_discount_pct: '0',
    shipping_duty_pct: '0',
    margin_pct: '0',
    unit_cost_bd: '',
    nos: '1',
    months: '0',
    days: '0',
    role_name: '',
    salary_per_month: '',
    oh_pct: String(DEFAULT_OH_PCT),
    amount: '',
  };
}

const text = (value: unknown) => (value === null || value === undefined ? '' : String(value));

export function emptyHeading(section: Section): LineItem {
  return { ...emptyLine(section), is_heading: true, qty: '', unit: '', nos: '', months: '', days: '', oh_pct: '', bd_conversion_rate: '', supplier_discount_pct: '', shipping_duty_pct: '', margin_pct: '' };
}

export function lineFromRow(row: Record<string, unknown>): LineItem {
  const blank = emptyLine(row.section as Section);
  if (row.is_heading) return { ...emptyHeading(row.section as Section), description: text(row.description) };
  return {
    ...blank,
    sl_no: text(row.sl_no),
    qty: text(row.qty),
    unit: text(row.unit),
    model_no: text(row.model_no),
    description: text(row.description),
    unit_cost_exw: text(row.unit_cost_exw),
    bd_conversion_rate: text(row.bd_conversion_rate),
    supplier_discount_pct: text(row.supplier_discount_pct),
    shipping_duty_pct: text(row.shipping_duty_pct),
    margin_pct: text(row.margin_pct),
    unit_cost_bd: text(row.unit_cost_bd),
    nos: text(row.nos),
    months: text(row.months),
    days: text(row.days),
    role_name: text(row.role_name),
    salary_per_month: text(row.salary_per_month),
    oh_pct: text(row.oh_pct),
    amount: text(row.amount),
  };
}

// What the server expects. SL# is the user's own number (blank = none); headings carry only their text.
export function lineToPayload(line: LineItem) {
  const { key, ...rest } = line;
  void key;
  return line.is_heading ? { section: line.section, is_heading: true, description: line.description } : rest;
}

// BHD to 3 decimals, thousands separated.
export const bd = (value: unknown): string => num(value).toLocaleString('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
export const pct1 = (value: unknown): string => `${num(value).toFixed(1)}%`;

export function formatDMY(value?: string | null): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value || '');
  return match ? `${match[3]}/${match[2]}/${match[1]}` : '-';
}

export function formatDateTime(value?: string | null): string {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Bahrain', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })
      .formatToParts(date)
      .map((part) => [part.type, part.value])
  );
  return `${parts.day}/${parts.month}/${parts.year} ${parts.hour === '24' ? '00' : parts.hour}:${parts.minute}`;
}

export const todayBahrain = (): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bahrain', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

export const isOverdue = (dueDate: string | null, status: string): boolean => Boolean(dueDate) && status !== 'completed' && (dueDate as string).slice(0, 10) < todayBahrain();

// JSON call to /api/costing/...; throws the server's error message on failure.
export class CostingApiError extends Error {
  status: number;
  needsLogin: boolean;
  constructor(message: string, status: number, needsLogin: boolean) {
    super(message);
    this.status = status;
    this.needsLogin = needsLogin;
  }
}

export async function costingApi<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await apiFetch(`/api/costing${path}`, init);
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new CostingApiError(body?.error || `${response.status} ${response.statusText}`, response.status, Boolean(body?.needsLogin));
  return body as T;
}

export const jsonInit = (method: string, body: unknown = {}): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

export const errorText = (error: unknown, fallback: string): string => (error instanceof Error ? error.message : fallback);
