import { apiFetch } from './api';

// Costing Sheet: types, live calculation (mirrors utils/costing.js - the server recomputes on save) and helpers.

export const DEPARTMENTS = ['ELV', 'ELC', 'FS', 'MECH', 'IT'] as const;
export const ENQUIRY_STATUSES = ['draft', 'submitted', 'approved', 'rejected'] as const;
export const CURRENCY_RATES: Record<string, number> = { BD: 1, USD: 0.376, EUR: 0.41 };
export const DEFAULT_OH_PCT = 35;
const DAYS_PER_MONTH = 30;

export type Section = 'ST1' | 'ST2' | 'ST3' | 'ST4';
export const SECTION_TITLES: Record<Section, string> = {
  ST1: 'ST1 - Foreign Materials',
  ST2: 'ST2 - Local Materials / Subcontract',
  ST3: 'ST3 - Installation / Labour',
  ST4: 'ST4 - Bank Charges',
};

export interface Enquiry {
  id: number;
  enquiry_no: string;
  customer_name: string;
  project_name: string;
  client: string | null;
  consultant: string | null;
  main_contractor: string | null;
  department: string;
  date: string;
  status: string;
  created_by: string | null;
  latest_sheet_id: number | null;
}

// Form values are strings while typing; numbers are parsed on calculation.
export interface LineItem {
  key: string;
  section: Section;
  qty: string;
  unit: string;
  model_no: string;
  description: string;
  unit_cost_exw: string;
  currency: string;
  supplier_discount_pct: string;
  bd_conversion_rate: string;
  unit_rate_bd: string;
  shipping_duty: string;
  margin_pct: string;
  months: string;
  days: string;
  role: string;
  salary_per_month: string;
  oh_pct: string;
  amount: string;
}

export interface SheetHeader {
  id: number;
  enquiry_id: number;
  enquiry_no: string;
  quotation_ref_no: string;
  revision_no: number;
  is_latest: boolean;
  locked: boolean;
  department: string;
  project_name: string | null;
  client: string | null;
  consultant: string | null;
  main_contractor: string | null;
  date: string;
  status: string;
  prepared_by: string | null;
  reviewed_by: string | null;
  approved_by_gm: string | null;
  approved_by_gm_at: string | null;
  approved_by_director: string | null;
  approved_by_director_at: string | null;
  total_net_cost: number | string;
  total_selling_amount: number | string;
  payment_terms: string | null;
  validity: string | null;
  delivery_time: string | null;
  warranty: string | null;
  terms_notes: string | null;
  customer_name: string;
}

export interface LinkedDocument {
  link_id: number;
  document_id: number;
  document_name: string;
  document_type: string | null;
  company_name: string | null;
  expiry_date: string | null;
  onedrive_url: string | null;
}

export interface SheetFile {
  id: number;
  file_name: string;
  size_bytes: number;
  uploaded_by: string | null;
}

export interface Revision {
  id: number;
  quotation_ref_no: string;
  revision_no: number;
  status: string;
  is_latest: boolean;
}

export interface SheetData {
  sheet: SheetHeader;
  lines: Record<string, unknown>[];
  documents: LinkedDocument[];
  files: SheetFile[];
  revisions: Revision[];
}

const num = (value: unknown): number => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

export interface LineResult {
  unit_rate_discounted?: number;
  unit_rate_bd?: number;
  total_cost_bd: number;
  unit_rate_with_cf?: number;
  total_landing_cost_bd?: number;
  unit_rate_selling?: number;
  selling_total_bd?: number;
  per_day_rate?: number;
  oh?: number;
  cost: number;
  selling: number;
}

export function calcLine(line: LineItem): LineResult {
  const qty = num(line.qty);

  if (line.section === 'ST1') {
    const discounted = num(line.unit_cost_exw) * (1 - num(line.supplier_discount_pct) / 100);
    const rate = num(line.bd_conversion_rate) || CURRENCY_RATES[line.currency] || 1;
    const unitBd = discounted * rate;
    const withCf = unitBd * (1 + num(line.shipping_duty) / 100);
    const landing = qty * withCf;
    const unitSelling = withCf * (1 + num(line.margin_pct) / 100);
    return {
      unit_rate_discounted: discounted,
      unit_rate_bd: unitBd,
      total_cost_bd: qty * unitBd,
      unit_rate_with_cf: withCf,
      total_landing_cost_bd: landing,
      unit_rate_selling: unitSelling,
      selling_total_bd: qty * unitSelling,
      cost: landing,
      selling: qty * unitSelling,
    };
  }

  if (line.section === 'ST2') {
    const total = qty * num(line.unit_rate_bd);
    const selling = total * (1 + num(line.margin_pct) / 100);
    return { total_cost_bd: total, total_landing_cost_bd: total, unit_rate_selling: qty ? selling / qty : 0, selling_total_bd: selling, cost: total, selling };
  }

  if (line.section === 'ST3') {
    const perDay = num(line.salary_per_month) / DAYS_PER_MONTH;
    const total = qty * perDay * (num(line.months) * DAYS_PER_MONTH + num(line.days));
    const ohPct = line.oh_pct === '' ? DEFAULT_OH_PCT : num(line.oh_pct);
    const oh = (total * ohPct) / 100;
    return { per_day_rate: perDay, total_cost_bd: total, oh, cost: total, selling: total + oh };
  }

  const amount = num(line.amount);
  return { total_cost_bd: amount, cost: amount, selling: amount };
}

export interface Summary {
  material_cost: number;
  local_materials: number;
  installation_cost: number;
  oh_charges: number;
  bank_charges: number;
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
    if (line.section === 'ST3') oh += result.oh ?? 0;
    return result;
  });

  const net = sums.ST1.cost + sums.ST2.cost + sums.ST3.cost + oh + sums.ST4.cost;
  const selling = sums.ST1.selling + sums.ST2.selling + sums.ST3.selling + sums.ST4.selling;
  const profit = selling - net;
  return {
    results,
    summary: {
      material_cost: sums.ST1.cost,
      local_materials: sums.ST2.cost,
      installation_cost: sums.ST3.cost,
      oh_charges: oh,
      bank_charges: sums.ST4.cost,
      total_net_cost: net,
      total_selling_amount: selling,
      profit_pct_on_cost: net ? (profit / net) * 100 : 0,
      profit_pct_on_selling: selling ? (profit / selling) * 100 : 0,
    },
  };
}

let keyCounter = 0;
export const newKey = () => `l${Date.now().toString(36)}${keyCounter++}`;

export function emptyLine(section: Section): LineItem {
  return {
    key: newKey(),
    section,
    qty: '1',
    unit: section === 'ST3' ? '' : 'nos',
    model_no: '',
    description: '',
    unit_cost_exw: '',
    currency: 'USD',
    supplier_discount_pct: '0',
    bd_conversion_rate: '',
    unit_rate_bd: '',
    shipping_duty: '0',
    margin_pct: '0',
    months: '0',
    days: '0',
    role: '',
    salary_per_month: '',
    oh_pct: String(DEFAULT_OH_PCT),
    amount: '',
  };
}

const text = (value: unknown) => (value === null || value === undefined ? '' : String(value));

export function lineFromRow(row: Record<string, unknown>): LineItem {
  return {
    key: newKey(),
    section: row.section as Section,
    qty: text(row.qty),
    unit: text(row.unit),
    model_no: text(row.model_no),
    description: text(row.description),
    unit_cost_exw: text(row.unit_cost_exw),
    currency: text(row.currency) || 'USD',
    supplier_discount_pct: text(row.supplier_discount_pct),
    bd_conversion_rate: text(row.bd_conversion_rate),
    unit_rate_bd: row.section === 'ST2' ? text(row.unit_rate_bd) : '',
    shipping_duty: text(row.shipping_duty),
    margin_pct: text(row.margin_pct),
    months: text(row.months),
    days: text(row.days),
    role: text(row.role),
    salary_per_month: text(row.salary_per_month),
    oh_pct: text(row.oh_pct),
    amount: text(row.amount),
  };
}

// What the server expects: section + the typed inputs (derived columns are recomputed there).
export function lineToPayload(line: LineItem, slNo: number) {
  const { key, ...rest } = line;
  void key;
  return { ...rest, sl_no: slNo };
}

// BHD to 3 decimals, thousands separated.
export const bd = (value: unknown): string =>
  num(value).toLocaleString('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
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

export const STATUS_STYLES: Record<string, string> = {
  draft: 'bg-slate-100 text-slate-700',
  submitted: 'bg-blue-100 text-blue-700',
  approved: 'bg-emerald-100 text-emerald-700',
  rejected: 'bg-red-100 text-red-700',
};

// The quotation's priced rows: ST1 + ST2 lines one by one, installation/labour and bank charges as lump sums.
export interface QuotationRow {
  qty: string;
  unit: string;
  description: string;
  unitPrice: number | null;
  total: number;
}

export function quotationRows(lines: LineItem[]): QuotationRow[] {
  const { results, summary } = calcSheet(lines);
  const rows: QuotationRow[] = [];
  lines.forEach((line, index) => {
    if (line.section !== 'ST1' && line.section !== 'ST2') return;
    const r = results[index];
    const label = [line.model_no, line.description].filter(Boolean).join(' - ') || '(item)';
    rows.push({ qty: line.qty, unit: line.unit, description: label, unitPrice: r.unit_rate_selling ?? 0, total: r.selling_total_bd ?? 0 });
  });
  const labour = lines.reduce((sum, line, index) => sum + (line.section === 'ST3' ? results[index].selling : 0), 0);
  const bank = summary.bank_charges;
  if (labour > 0) rows.push({ qty: '1', unit: 'lot', description: 'Installation, testing and commissioning', unitPrice: null, total: labour });
  if (bank > 0) rows.push({ qty: '1', unit: 'lot', description: 'Bank charges', unitPrice: null, total: bank });
  return rows;
}

// JSON call to /api/costing/...; throws the server's error message on failure.
export async function costingApi<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await apiFetch(`/api/costing${path}`, init);
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(body?.error || `${response.status} ${response.statusText}`);
  return body as T;
}

export const jsonInit = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});
