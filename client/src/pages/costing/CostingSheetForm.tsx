import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ArrowLeft, CheckCircle2, Copy, FileText, Lock, Paperclip, Plus, Save, Search, Trash2, Undo2, Upload } from 'lucide-react';
import { apiFetch } from '../../lib/api';
import {
  CURRENCY_RATES,
  DEPARTMENTS,
  SECTION_TITLES,
  STATUS_STYLES,
  bd,
  calcSheet,
  costingApi,
  emptyLine,
  formatDMY,
  formatDateTime,
  jsonInit,
  lineFromRow,
  lineToPayload,
  pct1,
  type LineItem,
  type LinkedDocument,
  type Revision,
  type Section,
  type SheetData,
  type SheetFile,
  type SheetHeader,
} from '../../lib/costing';

const input = 'w-full px-2 py-1.5 text-sm border border-slate-200 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent disabled:bg-slate-50 disabled:text-slate-500';
const numInput = `${input} text-right`;
const th = 'px-2 py-2 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap bg-slate-50';
const td = 'px-1.5 py-1 align-middle';
const calcCell = 'px-2 py-1 text-right text-sm text-slate-700 bg-slate-50/70 whitespace-nowrap';

interface HeaderForm {
  project_name: string;
  client: string;
  quotation_ref_no: string;
  consultant: string;
  date: string;
  main_contractor: string;
  department: string;
  prepared_by: string;
  reviewed_by: string;
  payment_terms: string;
  validity: string;
  delivery_time: string;
  warranty: string;
  terms_notes: string;
}

const toHeaderForm = (sheet: SheetHeader): HeaderForm => ({
  project_name: sheet.project_name ?? '',
  client: sheet.client ?? '',
  quotation_ref_no: sheet.quotation_ref_no,
  consultant: sheet.consultant ?? '',
  date: sheet.date?.slice(0, 10) ?? '',
  main_contractor: sheet.main_contractor ?? '',
  department: sheet.department,
  prepared_by: sheet.prepared_by ?? '',
  reviewed_by: sheet.reviewed_by ?? '',
  payment_terms: sheet.payment_terms ?? '',
  validity: sheet.validity ?? '',
  delivery_time: sheet.delivery_time ?? '',
  warranty: sheet.warranty ?? '',
  terms_notes: sheet.terms_notes ?? '',
});

function Card({ title, children, right }: { title: string; children: ReactNode; right?: ReactNode }) {
  return (
    <section className="bg-white rounded-xl border border-slate-200 shadow-sm">
      <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-slate-100">
        <h2 className="text-sm font-semibold text-slate-800">{title}</h2>
        {right}
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

export default function CostingSheetForm({ sheetId, onNavigate }: { sheetId: number; onNavigate: (path: string) => void }) {
  const [data, setData] = useState<SheetData | null>(null);
  const [header, setHeader] = useState<HeaderForm | null>(null);
  const [lines, setLines] = useState<LineItem[]>([]);
  const [documents, setDocuments] = useState<LinkedDocument[]>([]);
  const [files, setFiles] = useState<SheetFile[]>([]);
  const [revisions, setRevisions] = useState<Revision[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [docQuery, setDocQuery] = useState('');
  const [docResults, setDocResults] = useState<{ id: number; document_name: string; document_type: string | null; company_name: string | null; expiry_date: string | null }[]>([]);
  const fileInput = useRef<HTMLInputElement>(null);

  const hydrate = useCallback((next: SheetData) => {
    setData(next);
    setHeader(toHeaderForm(next.sheet));
    setLines(next.lines.map(lineFromRow));
    setDocuments(next.documents);
    setFiles(next.files);
    setRevisions(next.revisions);
    setDirty(false);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    costingApi<SheetData>(`/sheets/${sheetId}`)
      .then((next) => {
        if (!cancelled) {
          hydrate(next);
          setError(null);
        }
      })
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : 'Failed to load costing sheet'))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [sheetId, hydrate]);

  const { results, summary } = useMemo(() => calcSheet(lines), [lines]);

  // Shared-document search (debounced).
  useEffect(() => {
    if (!docQuery.trim()) {
      setDocResults([]);
      return undefined;
    }
    const timer = setTimeout(() => {
      costingApi<typeof docResults>(`/documents/search?q=${encodeURIComponent(docQuery.trim())}`)
        .then(setDocResults)
        .catch(() => setDocResults([]));
    }, 300);
    return () => clearTimeout(timer);
  }, [docQuery]);

  if (loading) return <p className="text-sm text-slate-400">Loading...</p>;
  if (error || !data || !header) {
    return (
      <div className="space-y-3">
        <button onClick={() => onNavigate('/costing/enquiries')} className="text-sm text-teal-600 hover:underline">Back to enquiries</button>
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error || 'Costing sheet not found'}</div>
      </div>
    );
  }

  const sheet = data.sheet;
  const locked = sheet.locked;

  // Functional updates, so several quick edits in a row never overwrite each other.
  const setH = (patch: Partial<HeaderForm>) => {
    setHeader((current) => (current ? { ...current, ...patch } : current));
    setDirty(true);
  };
  const setLine = (key: string, patch: Partial<LineItem>) => {
    setLines((current) => current.map((line) => (line.key === key ? { ...line, ...patch } : line)));
    setDirty(true);
  };
  const addLine = (section: Section) => {
    setLines((current) => [...current, emptyLine(section)]);
    setDirty(true);
  };
  const removeLine = (key: string) => {
    setLines((current) => current.filter((line) => line.key !== key));
    setDirty(true);
  };

  const save = async (): Promise<boolean> => {
    setSaving(true);
    setError(null);
    try {
      const counters: Record<string, number> = {};
      const payload = {
        ...header,
        lines: lines.map((line) => {
          counters[line.section] = (counters[line.section] ?? 0) + 1;
          return lineToPayload(line, counters[line.section]);
        }),
      };
      hydrate(await costingApi<SheetData>(`/sheets/${sheet.id}`, jsonInit('PUT', payload)));
      setNotice('Saved');
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save');
      return false;
    } finally {
      setSaving(false);
    }
  };

  const approve = async (step: 'gm' | 'director', undo = false) => {
    if (dirty && !(await save())) return;
    try {
      hydrate(await costingApi<SheetData>(`/sheets/${sheet.id}/approve`, jsonInit('POST', { step, undo })));
      setNotice(undo ? 'Approval removed' : 'Approved');
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update approval');
    }
  };

  const revise = async () => {
    if (dirty && !(await save())) return;
    if (!window.confirm(`Create a new revision of ${sheet.quotation_ref_no}? The current sheet is kept as it is, read-only.`)) return;
    try {
      const result = await costingApi<{ sheet_id: number }>(`/sheets/${sheet.id}/revise`, { method: 'POST' });
      onNavigate(`/costing/sheet/${result.sheet_id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create revision');
    }
  };

  const linkDocument = async (documentId: number) => {
    try {
      const next = await costingApi<SheetData>(`/sheets/${sheet.id}/documents`, jsonInit('POST', { document_id: documentId }));
      setDocuments(next.documents);
      setDocQuery('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to link document');
    }
  };
  const unlinkDocument = async (linkId: number) => {
    try {
      setDocuments((await costingApi<SheetData>(`/sheets/${sheet.id}/documents/${linkId}`, { method: 'DELETE' })).documents);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to remove document');
    }
  };
  const uploadFile = async (file: File) => {
    try {
      const response = await apiFetch(`/api/costing/sheets/${sheet.id}/files?name=${encodeURIComponent(file.name)}&type=${encodeURIComponent(file.type || 'application/octet-stream')}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/octet-stream' },
        body: file,
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error || `${response.status} ${response.statusText}`);
      setFiles((body as SheetData).files);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to upload file');
    } finally {
      if (fileInput.current) fileInput.current.value = '';
    }
  };
  const deleteFile = async (fileId: number) => {
    try {
      setFiles((await costingApi<SheetData>(`/sheets/${sheet.id}/files/${fileId}`, { method: 'DELETE' })).files);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete file');
    }
  };

  const sectionLines = (section: Section) => lines.map((line, index) => ({ line, result: results[index], index })).filter(({ line }) => line.section === section);

  const text = (line: LineItem, key: keyof LineItem, extra = '') => (
    <input value={line[key]} disabled={locked} onChange={(e) => setLine(line.key, { [key]: e.target.value } as Partial<LineItem>)} className={`${input} ${extra}`} />
  );
  const number = (line: LineItem, key: keyof LineItem, width = 'w-20') => (
    <input type="number" step="any" value={line[key]} disabled={locked} onChange={(e) => setLine(line.key, { [key]: e.target.value } as Partial<LineItem>)} className={`${numInput} ${width}`} />
  );
  const removeCell = (line: LineItem) =>
    !locked && (
      <td className={td}>
        <button type="button" onClick={() => removeLine(line.key)} className="p-1 text-slate-400 hover:text-red-600" aria-label="Remove row">
          <Trash2 size={15} />
        </button>
      </td>
    );
  const addButton = (section: Section) =>
    !locked && (
      <button type="button" onClick={() => addLine(section)} className="flex items-center gap-1.5 text-sm font-medium text-teal-600 hover:underline">
        <Plus size={15} /> Add row
      </button>
    );
  const headerField = (label: string, key: keyof HeaderForm, type = 'text') => (
    <div>
      <label className="block text-xs font-medium text-slate-500 mb-1">{label}</label>
      <input type={type} value={header[key]} disabled={locked} onChange={(e) => setH({ [key]: e.target.value } as Partial<HeaderForm>)} className={`${input} py-2`} />
    </div>
  );

  const approvalBlock = (label: string, step: 'gm' | 'director', name: string | null, at: string | null) => (
    <div className="rounded-lg border border-slate-200 p-3">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      {name ? (
        <div className="mt-1.5 flex items-center justify-between gap-2">
          <div className="text-sm">
            <p className="font-medium text-emerald-700 flex items-center gap-1.5"><CheckCircle2 size={15} /> {name}</p>
            <p className="text-xs text-slate-500">{formatDateTime(at)}</p>
          </div>
          {sheet.is_latest && (
            <button type="button" onClick={() => approve(step, true)} className="flex items-center gap-1 text-xs text-slate-500 hover:text-red-600">
              <Undo2 size={13} /> Undo
            </button>
          )}
        </div>
      ) : (
        <button
          type="button"
          disabled={!sheet.is_latest}
          onClick={() => approve(step)}
          className="mt-1.5 px-3 py-1.5 text-sm font-medium bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50"
        >
          Approve
        </button>
      )}
    </div>
  );

  const stat = (label: string, value: string, strong = false) => (
    <div className={`flex items-center justify-between py-1.5 ${strong ? 'border-t border-slate-300 mt-1 pt-2.5 font-bold text-slate-900' : 'text-slate-700'}`}>
      <span className="text-sm">{label}</span>
      <span className="text-sm tabular-nums">{value}</span>
    </div>
  );

  return (
    <div className="space-y-5 max-w-[1500px]">
      {/* Title bar */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <button onClick={() => onNavigate('/costing/enquiries')} className="flex items-center gap-1 text-sm text-teal-600 hover:underline mb-1">
            <ArrowLeft size={14} /> Enquiries
          </button>
          <h1 className="text-2xl font-bold text-slate-800 flex flex-wrap items-center gap-2">
            Costing Sheet
            <span className="text-slate-500 font-semibold text-lg">{sheet.quotation_ref_no}</span>
            <span className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${STATUS_STYLES[sheet.status] ?? STATUS_STYLES.draft}`}>{sheet.status}</span>
            {sheet.revision_no > 0 && <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-violet-100 text-violet-700">Revision {sheet.revision_no}</span>}
            {locked && <Lock size={16} className="text-slate-400" aria-label="Read-only" />}
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            {sheet.enquiry_no} &middot; {sheet.customer_name}
            {!sheet.is_latest && ' - superseded revision (read-only)'}
            {sheet.is_latest && sheet.status === 'approved' && ' - approved (read-only); use Revise to change it'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {revisions.length > 1 && (
            <select value={sheet.id} onChange={(e) => onNavigate(`/costing/sheet/${e.target.value}`)} className="px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white" aria-label="Revisions">
              {revisions.map((revision) => (
                <option key={revision.id} value={revision.id}>
                  {revision.quotation_ref_no}
                  {revision.is_latest ? ' (latest)' : ''}
                </option>
              ))}
            </select>
          )}
          <button onClick={() => onNavigate(`/costing/quotation/${sheet.id}`)} className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50">
            <FileText size={15} /> Quotation
          </button>
          {sheet.is_latest && (
            <button onClick={revise} className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-violet-700 border border-violet-200 rounded-lg hover:bg-violet-50">
              <Copy size={15} /> Revise
            </button>
          )}
          {!locked && (
            <button
              onClick={save}
              disabled={saving || !dirty}
              className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-gradient-to-r from-cyan-500 to-blue-600 text-white rounded-lg hover:shadow-lg disabled:opacity-50"
            >
              <Save size={15} /> {saving ? 'Saving...' : dirty ? 'Save' : 'Saved'}
            </button>
          )}
        </div>
      </div>

      {error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
      {notice && !error && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-700 flex justify-between">
          <span>{notice}</span>
          <button onClick={() => setNotice(null)} className="text-emerald-600 hover:underline">Dismiss</button>
        </div>
      )}

      {/* Header */}
      <Card title="Project Details">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {headerField('Project Name', 'project_name')}
          {headerField('Client', 'client')}
          {headerField('Quotation Ref No', 'quotation_ref_no')}
          {headerField('Consultant', 'consultant')}
          {headerField('Date', 'date', 'date')}
          {headerField('Main Contractor', 'main_contractor')}
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Department</label>
            <select value={header.department} disabled={locked} onChange={(e) => setH({ department: e.target.value })} className={`${input} py-2`}>
              {DEPARTMENTS.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </div>
        </div>
      </Card>

      {/* ST1 */}
      <Card title={SECTION_TITLES.ST1} right={addButton('ST1')}>
        <div className="overflow-x-auto -mx-2">
          <table className="w-full text-sm min-w-[1500px]">
            <thead>
              <tr>
                {['SL#', 'Qty', 'Unit', 'Model#', 'Description', 'Unit Cost EXW', 'Cur.', 'Supp. Disc %', 'Unit Rate Disc.', 'BD Rate', 'Unit Rate BD', 'Total Cost BD', 'Ship & Duty %', 'Total Landing BD', 'Margin %', 'Unit Rate Selling', 'Selling Total BD', ''].map((c) => (
                  <th key={c} className={th}>{c}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sectionLines('ST1').length === 0 && (
                <tr><td colSpan={18} className="px-3 py-4 text-center text-slate-400 text-sm">No rows yet</td></tr>
              )}
              {sectionLines('ST1').map(({ line, result }, i) => (
                <tr key={line.key}>
                  <td className={`${td} text-slate-500 text-center`}>{i + 1}</td>
                  <td className={td}>{number(line, 'qty', 'w-16')}</td>
                  <td className={td}>{text(line, 'unit', 'w-16')}</td>
                  <td className={td}>{text(line, 'model_no', 'w-28')}</td>
                  <td className={td}>{text(line, 'description', 'min-w-[220px]')}</td>
                  <td className={td}>{number(line, 'unit_cost_exw', 'w-24')}</td>
                  <td className={td}>
                    <select value={line.currency} disabled={locked} onChange={(e) => setLine(line.key, { currency: e.target.value, bd_conversion_rate: '' })} className={`${input} w-[72px]`}>
                      {Object.keys(CURRENCY_RATES).map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </td>
                  <td className={td}>{number(line, 'supplier_discount_pct', 'w-16')}</td>
                  <td className={calcCell}>{bd(result.unit_rate_discounted)}</td>
                  <td className={td}>
                    <input type="number" step="any" value={line.bd_conversion_rate} placeholder={String(CURRENCY_RATES[line.currency] ?? 1)} disabled={locked} onChange={(e) => setLine(line.key, { bd_conversion_rate: e.target.value })} className={`${numInput} w-20`} />
                  </td>
                  <td className={calcCell}>{bd(result.unit_rate_bd)}</td>
                  <td className={calcCell}>{bd(result.total_cost_bd)}</td>
                  <td className={td}>{number(line, 'shipping_duty', 'w-16')}</td>
                  <td className={calcCell}>{bd(result.total_landing_cost_bd)}</td>
                  <td className={td}>{number(line, 'margin_pct', 'w-16')}</td>
                  <td className={calcCell}>{bd(result.unit_rate_selling)}</td>
                  <td className={`${calcCell} font-medium`}>{bd(result.selling_total_bd)}</td>
                  {removeCell(line)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* ST2 */}
      <Card title={SECTION_TITLES.ST2} right={addButton('ST2')}>
        <div className="overflow-x-auto -mx-2">
          <table className="w-full text-sm min-w-[900px]">
            <thead>
              <tr>
                {['SL#', 'Qty', 'Unit', 'Description', 'Unit Cost BD', 'Total Cost BD', 'Margin %', 'Selling Total BD', ''].map((c) => (
                  <th key={c} className={th}>{c}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sectionLines('ST2').length === 0 && (
                <tr><td colSpan={9} className="px-3 py-4 text-center text-slate-400 text-sm">No rows yet</td></tr>
              )}
              {sectionLines('ST2').map(({ line, result }, i) => (
                <tr key={line.key}>
                  <td className={`${td} text-slate-500 text-center`}>{i + 1}</td>
                  <td className={td}>{number(line, 'qty', 'w-16')}</td>
                  <td className={td}>{text(line, 'unit', 'w-16')}</td>
                  <td className={td}>{text(line, 'description', 'min-w-[260px]')}</td>
                  <td className={td}>{number(line, 'unit_rate_bd', 'w-28')}</td>
                  <td className={calcCell}>{bd(result.total_cost_bd)}</td>
                  <td className={td}>{number(line, 'margin_pct', 'w-16')}</td>
                  <td className={`${calcCell} font-medium`}>{bd(result.selling_total_bd)}</td>
                  {removeCell(line)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* ST3 */}
      <Card title={SECTION_TITLES.ST3} right={addButton('ST3')}>
        <div className="overflow-x-auto -mx-2">
          <table className="w-full text-sm min-w-[900px]">
            <thead>
              <tr>
                {['Nos', 'Month', 'Days', 'Role', 'Salary / Month', 'Per Day Rate', 'OH %', 'Total Cost', ''].map((c) => (
                  <th key={c} className={th}>{c}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sectionLines('ST3').length === 0 && (
                <tr><td colSpan={9} className="px-3 py-4 text-center text-slate-400 text-sm">No rows yet</td></tr>
              )}
              {sectionLines('ST3').map(({ line, result }) => (
                <tr key={line.key}>
                  <td className={td}>{number(line, 'qty', 'w-16')}</td>
                  <td className={td}>{number(line, 'months', 'w-16')}</td>
                  <td className={td}>{number(line, 'days', 'w-16')}</td>
                  <td className={td}>{text(line, 'role', 'min-w-[200px]')}</td>
                  <td className={td}>{number(line, 'salary_per_month', 'w-28')}</td>
                  <td className={calcCell}>{bd(result.per_day_rate)}</td>
                  <td className={td}>{number(line, 'oh_pct', 'w-16')}</td>
                  <td className={`${calcCell} font-medium`}>{bd(result.total_cost_bd)}</td>
                  {removeCell(line)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-slate-400 mt-2">Total cost = nos x (months x 30 + days) x per-day rate (salary / 30). Overhead is added in the summary.</p>
      </Card>

      {/* ST4 */}
      <Card title={SECTION_TITLES.ST4} right={addButton('ST4')}>
        <div className="overflow-x-auto -mx-2">
          <table className="w-full text-sm min-w-[600px]">
            <thead>
              <tr>
                {['Description', 'Amount BD', ''].map((c) => (
                  <th key={c} className={th}>{c}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sectionLines('ST4').length === 0 && (
                <tr><td colSpan={3} className="px-3 py-4 text-center text-slate-400 text-sm">No rows yet</td></tr>
              )}
              {sectionLines('ST4').map(({ line }) => (
                <tr key={line.key}>
                  <td className={td}>{text(line, 'description', 'min-w-[320px]')}</td>
                  <td className={td}>{number(line, 'amount', 'w-32')}</td>
                  {removeCell(line)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Summary + approvals */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Card title="Summary">
          {stat('Material Cost (ST1)', bd(summary.material_cost))}
          {stat('Local Materials (ST2)', bd(summary.local_materials))}
          {stat('Installation / SC Cost (ST3)', bd(summary.installation_cost))}
          {stat('OH Charges 35% on ST3', bd(summary.oh_charges))}
          {stat('Bank Charges (ST4)', bd(summary.bank_charges))}
          {stat('TOTAL NET COST', bd(summary.total_net_cost), true)}
          {stat('TOTAL SELLING AMOUNT', bd(summary.total_selling_amount), true)}
          {stat('PROFIT % ON COST', pct1(summary.profit_pct_on_cost))}
          {stat('PROFIT % ON SELLING', pct1(summary.profit_pct_on_selling))}
          <p className="text-xs text-slate-400 mt-2">All amounts in BHD. Figures update as you type; they are recalculated and stored when you save.</p>
        </Card>

        <Card title="Approval">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Prepared By (Estimator / Engineer)</label>
              <input value={header.prepared_by} disabled={locked} onChange={(e) => setH({ prepared_by: e.target.value })} className={`${input} py-2`} />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Reviewed By (Sales Engineer / Manager)</label>
              <input value={header.reviewed_by} disabled={locked} onChange={(e) => setH({ reviewed_by: e.target.value })} className={`${input} py-2`} />
            </div>
            {approvalBlock('Approved By: General Manager', 'gm', sheet.approved_by_gm, sheet.approved_by_gm_at)}
            {approvalBlock('Approved By: Director', 'director', sheet.approved_by_director, sheet.approved_by_director_at)}
          </div>
          <p className="text-xs text-slate-400 mt-3">The sheet is approved, and becomes read-only, once both the General Manager and the Director have approved it.</p>
        </Card>
      </div>

      {/* Quotation terms */}
      <Card title="Quotation Terms">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {(
            [
              ['Payment terms', 'payment_terms'],
              ['Validity', 'validity'],
              ['Delivery time', 'delivery_time'],
              ['Warranty', 'warranty'],
            ] as [string, keyof HeaderForm][]
          ).map(([label, key]) => (
            <div key={key}>
              <label className="block text-xs font-medium text-slate-500 mb-1">{label}</label>
              <textarea value={header[key]} disabled={locked} rows={2} onChange={(e) => setH({ [key]: e.target.value } as Partial<HeaderForm>)} className={`${input} py-2`} />
            </div>
          ))}
          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-slate-500 mb-1">Additional notes / exclusions</label>
            <textarea value={header.terms_notes} disabled={locked} rows={2} onChange={(e) => setH({ terms_notes: e.target.value })} className={`${input} py-2`} />
          </div>
        </div>
      </Card>

      {/* Documents */}
      <Card title="Documents">
        <div className="space-y-4">
          {!locked && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Attach from the Documents module</label>
                <div className="relative">
                  <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input value={docQuery} onChange={(e) => setDocQuery(e.target.value)} placeholder="Search by document name, type or company" className={`${input} py-2 pl-9`} />
                </div>
                {docQuery.trim() && (
                  <ul className="mt-2 border border-slate-200 rounded-lg divide-y divide-slate-100 max-h-56 overflow-y-auto">
                    {docResults.length === 0 && <li className="px-3 py-2 text-sm text-slate-400">No matching documents</li>}
                    {docResults.map((doc) => (
                      <li key={doc.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                        <span className="min-w-0">
                          <span className="font-medium text-slate-800">{doc.document_name}</span>
                          <span className="block text-xs text-slate-500 truncate">{[doc.document_type, doc.company_name, doc.expiry_date ? `exp. ${formatDMY(doc.expiry_date)}` : ''].filter(Boolean).join(' · ')}</span>
                        </span>
                        <button type="button" disabled={documents.some((d) => d.document_id === doc.id)} onClick={() => linkDocument(doc.id)} className="px-2.5 py-1 text-xs font-medium bg-blue-50 text-blue-600 rounded-md hover:bg-blue-100 disabled:opacity-40">
                          {documents.some((d) => d.document_id === doc.id) ? 'Linked' : 'Link'}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Upload a supporting file (max 10 MB)</label>
                <input ref={fileInput} type="file" onChange={(e) => e.target.files?.[0] && uploadFile(e.target.files[0])} className="block w-full text-sm text-slate-600 file:mr-3 file:px-3 file:py-2 file:rounded-lg file:border-0 file:bg-blue-50 file:text-blue-600 file:font-medium" />
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div>
              <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Linked documents ({documents.length})</h3>
              {documents.length === 0 ? (
                <p className="text-sm text-slate-400">None linked</p>
              ) : (
                <ul className="divide-y divide-slate-100 border border-slate-200 rounded-lg">
                  {documents.map((doc) => (
                    <li key={doc.link_id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                      <span className="min-w-0 flex items-center gap-2">
                        <FileText size={15} className="text-purple-500 flex-shrink-0" />
                        <span className="min-w-0">
                          <span className="font-medium text-slate-800 block truncate">{doc.document_name}</span>
                          <span className="block text-xs text-slate-500 truncate">{[doc.document_type, doc.company_name].filter(Boolean).join(' · ')}</span>
                        </span>
                      </span>
                      <span className="flex items-center gap-2 flex-shrink-0">
                        {doc.onedrive_url && (
                          <a href={doc.onedrive_url} target="_blank" rel="noopener noreferrer" className="px-2.5 py-1 text-xs font-medium bg-blue-50 text-blue-600 rounded-md hover:bg-blue-100">View</a>
                        )}
                        {!locked && (
                          <button type="button" onClick={() => unlinkDocument(doc.link_id)} className="p-1 text-slate-400 hover:text-red-600" aria-label="Remove document"><Trash2 size={15} /></button>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Uploaded files ({files.length})</h3>
              {files.length === 0 ? (
                <p className="text-sm text-slate-400">No files uploaded</p>
              ) : (
                <ul className="divide-y divide-slate-100 border border-slate-200 rounded-lg">
                  {files.map((file) => (
                    <li key={file.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                      <span className="min-w-0 flex items-center gap-2">
                        <Paperclip size={15} className="text-slate-400 flex-shrink-0" />
                        <span className="truncate text-slate-800">{file.file_name}</span>
                        <span className="text-xs text-slate-400 flex-shrink-0">{(file.size_bytes / 1024).toFixed(0)} KB</span>
                      </span>
                      <span className="flex items-center gap-2 flex-shrink-0">
                        <a href={`${import.meta.env.VITE_API_URL ?? ''}/api/costing/files/${file.id}`} className="px-2.5 py-1 text-xs font-medium bg-blue-50 text-blue-600 rounded-md hover:bg-blue-100 flex items-center gap-1">
                          <Upload size={12} className="rotate-180" /> Download
                        </a>
                        {!locked && (
                          <button type="button" onClick={() => deleteFile(file.id)} className="p-1 text-slate-400 hover:text-red-600" aria-label="Delete file"><Trash2 size={15} /></button>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
