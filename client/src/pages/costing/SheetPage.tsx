import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ArrowLeft, CheckCircle2, Clock, Copy, Lock, Pencil, Plus, Save, Send, Trash2, XCircle } from 'lucide-react';
import Modal from '../../components/Modal';
import {
  SECTION_TITLES,
  bd,
  calcSheet,
  costingApi,
  emptyHeading,
  emptyLine,
  errorText,
  formatDMY,
  formatDateTime,
  jsonInit,
  lineFromRow,
  lineToPayload,
  pct1,
  todayBahrain,
  type Enquiry,
  type LineItem,
  type MasUser,
  type Revision,
  type Section,
  type Sheet,
} from '../../lib/costing';
import { Badge, Card, ErrorBanner, Loading, PageHeader, inputCls, primaryBtn, secondaryBtn } from './ui';

const cellInput = 'w-full px-2 py-1.5 text-sm border border-slate-200 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent disabled:bg-slate-50 disabled:text-slate-600';
const th = 'px-2 py-2 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap bg-slate-50';
const td = 'px-1.5 py-1 align-middle';
// Calculated cells are plain cells (not inputs): grey, not editable, updated live from the input cells.
const calcCell = 'px-2 py-1 text-right text-sm text-slate-500 bg-slate-200/70 cursor-not-allowed select-none whitespace-nowrap border-x border-white';

interface Header {
  quotation_ref_no: string;
  project_name: string;
  client: string;
  consultant: string;
  main_contractor: string;
  date: string;
}

interface Props {
  // 'new' = /costing/sheet/new?enquiry=ID, 'edit' = /costing/sheet/:id/edit, 'view' = /costing/sheet/:id
  mode: 'new' | 'edit' | 'view';
  me: MasUser;
  sheetId?: number;
  enquiryId?: number;
  onNavigate: (path: string) => void;
}

export default function SheetPage({ mode, me, sheetId, enquiryId, onNavigate }: Props) {
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [enquiry, setEnquiry] = useState<Enquiry | null>(null);
  const [revisions, setRevisions] = useState<Revision[]>([]);
  const [header, setHeader] = useState<Header>({ quotation_ref_no: '', project_name: '', client: '', consultant: '', main_contractor: '', date: todayBahrain() });
  const [lines, setLines] = useState<LineItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [comment, setComment] = useState('');

  const hydrate = useCallback((next: { sheet: Sheet; lines: Record<string, unknown>[]; revisions: Revision[]; enquiry: Enquiry }) => {
    setSheet(next.sheet);
    setEnquiry(next.enquiry);
    setRevisions(next.revisions);
    setHeader({
      quotation_ref_no: next.sheet.quotation_ref_no,
      project_name: next.sheet.project_name ?? '',
      client: next.sheet.client ?? '',
      consultant: next.sheet.consultant ?? '',
      main_contractor: next.sheet.main_contractor ?? '',
      date: next.sheet.date?.slice(0, 10) ?? todayBahrain(),
    });
    setLines(next.lines.map(lineFromRow));
    setDirty(false);
  }, []);

  const load = useCallback(async () => {
    try {
      if (mode === 'new') {
        const { enquiry: e } = await costingApi<{ enquiry: Enquiry }>(`/enquiries/${enquiryId}`);
        setEnquiry(e);
        setHeader({ quotation_ref_no: '', project_name: e.project_name, client: e.client_name, consultant: e.consultant ?? '', main_contractor: e.main_contractor ?? '', date: todayBahrain() });
        setLines([]);
      } else {
        hydrate(await costingApi(`/sheets/${sheetId}`));
      }
      setError(null);
    } catch (e) {
      setError(errorText(e, 'Failed to load the costing sheet'));
    } finally {
      setLoading(false);
    }
  }, [mode, enquiryId, sheetId, hydrate]);

  useEffect(() => {
    load();
  }, [load]);

  const { results, summary } = useMemo(() => calcSheet(lines), [lines]);

  if (loading) return <Loading />;
  if (!enquiry || (mode !== 'new' && !sheet)) {
    return (
      <div className="space-y-3">
        <button onClick={() => onNavigate('/costing/enquiries')} className="text-sm text-teal-600 hover:underline">Back to enquiries</button>
        <ErrorBanner message={error || 'Costing sheet not found'} />
      </div>
    );
  }

  // Editable only on the edit/new pages, and only while the server says this user may edit the sheet (draft or rejected).
  const editing = mode === 'new' || (mode === 'edit' && Boolean(sheet?.can_edit));
  const status = sheet?.status ?? 'draft';
  const readOnly = !editing;

  const setH = (patch: Partial<Header>) => {
    setHeader((current) => ({ ...current, ...patch }));
    setDirty(true);
  };
  const setLine = (key: string, patch: Partial<LineItem>) => {
    setLines((current) => current.map((line) => (line.key === key ? { ...line, ...patch } : line)));
    setDirty(true);
  };
  // New data rows get the next SL# of their section (editable, like the Excel); headings are labels and are not numbered.
  const addLine = (section: Section) => {
    setLines((current) => [...current, emptyLine(section, section === 'ST1' || section === 'ST2' ? String(current.filter((l) => l.section === section && !l.is_heading).length + 1) : '')]);
    setDirty(true);
  };
  const addHeading = (section: Section) => {
    setLines((current) => [...current, emptyHeading(section)]);
    setDirty(true);
  };
  const removeLine = (key: string) => {
    setLines((current) => current.filter((line) => line.key !== key));
    setDirty(true);
  };

  const payload = () => {
    return {
      ...header,
      quotation_ref_no: header.quotation_ref_no || undefined,
      lines: lines.map(lineToPayload),
    };
  };

  // Saves as a draft. A new sheet is created on the first save (that is when its quotation number is generated).
  const saveDraft = async (): Promise<number | null> => {
    setBusy(true);
    setError(null);
    try {
      if (mode === 'new') {
        const created = await costingApi<{ id: number }>('/sheets', jsonInit('POST', { enquiry_id: enquiry.id, ...payload() }));
        setNotice('Saved as draft');
        onNavigate(`/costing/sheet/${created.id}/edit`);
        return created.id;
      }
      await costingApi(`/sheets/${sheet!.id}`, jsonInit('PUT', payload()));
      hydrate(await costingApi(`/sheets/${sheet!.id}`));
      setNotice('Saved as draft');
      return sheet!.id;
    } catch (e) {
      setError(errorText(e, 'Failed to save the costing sheet'));
      return null;
    } finally {
      setBusy(false);
    }
  };

  const submit = async () => {
    const id = dirty || mode === 'new' ? await saveDraft() : sheet!.id;
    if (!id) return;
    setBusy(true);
    try {
      await costingApi(`/sheets/${id}/submit`, { method: 'POST' });
      onNavigate(`/costing/sheet/${id}`);
    } catch (e) {
      setError(errorText(e, 'Failed to submit the costing sheet'));
    } finally {
      setBusy(false);
    }
  };

  const approve = async () => {
    setBusy(true);
    try {
      await costingApi(`/sheets/${sheet!.id}/approve`, { method: 'POST' });
      await load();
      setNotice('Approved - the costing sheet is now locked');
    } catch (e) {
      setError(errorText(e, 'Failed to approve'));
    } finally {
      setBusy(false);
    }
  };

  const reject = async () => {
    setBusy(true);
    try {
      await costingApi(`/sheets/${sheet!.id}/reject`, jsonInit('POST', { comment }));
      setRejecting(false);
      setComment('');
      await load();
      setNotice('Rejected - the preparer has been notified');
    } catch (e) {
      setError(errorText(e, 'Failed to reject'));
    } finally {
      setBusy(false);
    }
  };

  const createRevision = async () => {
    try {
      const result = await costingApi<{ id: number }>(`/sheets/${sheet!.id}/revise`, { method: 'POST' });
      onNavigate(`/costing/sheet/${result.id}/edit`);
    } catch (e) {
      setError(errorText(e, 'Failed to create the revision'));
    }
  };

  const removeDraft = async () => {
    if (!window.confirm('Delete this draft costing sheet?')) return;
    try {
      await costingApi(`/sheets/${sheet!.id}`, { method: 'DELETE' });
      onNavigate(`/costing/enquiries/${enquiry.id}`);
    } catch (e) {
      setError(errorText(e, 'Failed to delete the draft'));
    }
  };

  const sectionLines = (section: Section) => lines.map((line, index) => ({ line, result: results[index] })).filter(({ line }) => line.section === section);
  const text = (line: LineItem, key: keyof LineItem, extra = '') => (
    <input value={line[key]} disabled={readOnly} onChange={(e) => setLine(line.key, { [key]: e.target.value } as Partial<LineItem>)} className={`${cellInput} ${extra}`} />
  );
  const number = (line: LineItem, key: keyof LineItem, width = 'w-20') => (
    <input type="number" step="any" value={line[key]} disabled={readOnly} onChange={(e) => setLine(line.key, { [key]: e.target.value } as Partial<LineItem>)} className={`${cellInput} text-right ${width}`} />
  );
  const removeCell = (line: LineItem) =>
    !readOnly && (
      <td className={td}>
        <button type="button" onClick={() => removeLine(line.key)} className="p-1 text-slate-400 hover:text-red-600" aria-label="Remove row"><Trash2 size={15} /></button>
      </td>
    );
  const addButton = (section: Section) =>
    !readOnly && (
      <div className="flex items-center gap-4">
        <button type="button" onClick={() => addLine(section)} className="flex items-center gap-1.5 text-sm font-medium text-teal-600 hover:underline">
          <Plus size={15} /> Add row
        </button>
        <button type="button" onClick={() => addHeading(section)} className="flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:underline">
          <Plus size={15} /> Add heading
        </button>
      </div>
    );
  const headerField = (label: string, key: keyof Header, opts: { type?: string; placeholder?: string } = {}) => (
    <div>
      <label className="block text-xs font-medium text-slate-500 mb-1">{label}</label>
      <input type={opts.type ?? 'text'} value={header[key]} placeholder={opts.placeholder} disabled={readOnly} onChange={(e) => setH({ [key]: e.target.value } as Partial<Header>)} className={`${cellInput} py-2`} />
    </div>
  );
  const stat = (label: string, value: string, strong = false) => (
    <div className={`flex items-center justify-between py-1.5 ${strong ? 'border-t border-slate-300 mt-1 pt-2.5 font-bold text-slate-900' : 'text-slate-700'}`}>
      <span className="text-sm">{label}</span>
      <span className="text-sm tabular-nums">{value}</span>
    </div>
  );
  const ohPct = summary.st3_total_cost > 0 ? Math.round((summary.oh_charges / summary.st3_total_cost) * 100) : 35;

  // A heading is a full-width, grey, bold label between groups of items - no SL#, quantities or costs.
  const headingRow = (line: LineItem, columns: number) => (
    <tr key={line.key} data-heading="true" className="bg-slate-200">
      <td colSpan={columns} className="px-3 py-1.5">
        <input
          value={line.description}
          disabled={readOnly}
          placeholder="Heading (e.g. FIRE ALARM SYSTEM)"
          onChange={(e) => setLine(line.key, { description: e.target.value })}
          className="w-full bg-transparent font-bold text-slate-800 uppercase tracking-wide px-1 py-1 focus:outline-none focus:bg-white/70 rounded disabled:text-slate-800"
          aria-label="Heading"
        />
      </td>
      {!readOnly && (
        <td className="px-1.5 bg-slate-200">
          <button type="button" onClick={() => removeLine(line.key)} className="p-1 text-slate-500 hover:text-red-600" aria-label="Remove heading"><Trash2 size={15} /></button>
        </td>
      )}
    </tr>
  );

  const table = (
    section: Section,
    columns: { label: string; calc?: boolean }[],
    minWidth: string,
    renderRow: (line: LineItem, result: ReturnType<typeof calcSheet>['results'][number], index: number) => JSX.Element
  ) => (
    <Card title={SECTION_TITLES[section]} right={addButton(section)}>
      <div className="overflow-x-auto -mx-2">
        <table className={`w-full text-sm ${minWidth}`}>
          <thead>
            <tr>
              {columns.map((c, i) => (
                <th key={`${c.label}${i}`} className={c.calc ? `${th} bg-slate-200 text-slate-600` : th} title={c.calc ? 'Calculated automatically' : undefined}>{c.label}</th>
              ))}
              {!readOnly && <th className={th} />}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {sectionLines(section).length === 0 && (
              <tr><td colSpan={columns.length + 1} className="px-3 py-4 text-center text-slate-400 text-sm">No rows</td></tr>
            )}
            {sectionLines(section).map(({ line, result }, index) => (line.is_heading ? headingRow(line, columns.length) : renderRow(line, result, index)))}
          </tbody>
        </table>
      </div>
    </Card>
  );

  return (
    <div className="space-y-5 max-w-[1500px]">
      <div>
        <button onClick={() => onNavigate(`/costing/enquiries/${enquiry.id}`)} className="flex items-center gap-1 text-sm text-teal-600 hover:underline mb-1">
          <ArrowLeft size={14} /> {enquiry.enquiry_no}
        </button>
        <PageHeader
          title={
            <>
              Costing Sheet
              {sheet && <span className="text-slate-500 font-semibold text-lg">{sheet.quotation_ref_no}</span>}
              {mode === 'new' ? <Badge status="draft" /> : <Badge status={status} />}
              {sheet && sheet.revision_no > 0 && <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-violet-100 text-violet-700">Revision {sheet.revision_no}</span>}
              {readOnly && mode !== 'new' && <Lock size={16} className="text-slate-400" aria-label="Read-only" />}
            </>
          }
          subtitle={`${enquiry.enquiry_no} - ${enquiry.project_name}${sheet?.prepared_by_name ? ` - prepared by ${sheet.prepared_by_name}` : ''}`}
          actions={
            <>
              {revisions.length > 1 && (
                <select value={sheet?.id} onChange={(e) => onNavigate(`/costing/sheet/${e.target.value}`)} className="px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white" aria-label="Revisions">
                  {revisions.map((revision) => (
                    <option key={revision.id} value={revision.id}>{revision.quotation_ref_no}{revision.is_latest ? ' (latest)' : ''}</option>
                  ))}
                </select>
              )}
              {mode === 'view' && sheet?.can_edit && (
                <button onClick={() => onNavigate(`/costing/sheet/${sheet.id}/edit`)} className={secondaryBtn}><Pencil size={15} /> Edit</button>
              )}
              {mode === 'view' && sheet?.is_latest && status === 'rejected' && sheet.can_edit && (
                <button onClick={createRevision} className={secondaryBtn}><Copy size={15} /> Create Revision</button>
              )}
            </>
          }
        />
      </div>

      {/* Status banners */}
      {status === 'rejected' && sheet?.rejection_comment && (
        <div role="alert" className="flex items-start gap-3 rounded-xl border border-red-300 bg-red-50 px-5 py-4 text-red-800">
          <XCircle className="flex-shrink-0 mt-0.5" size={20} />
          <div>
            <p className="font-semibold">Rejected{sheet.reviewed_by_name ? ` by ${sheet.reviewed_by_name}` : ''}{sheet.reviewed_at ? ` on ${formatDateTime(sheet.reviewed_at)}` : ''}</p>
            <p className="mt-0.5">{sheet.rejection_comment}</p>
            {sheet.can_edit && mode !== 'edit' && <p className="text-sm mt-1 text-red-700">Make the changes and resubmit.</p>}
          </div>
        </div>
      )}
      {status === 'submitted' && (
        <div className="flex items-center gap-3 rounded-xl border border-amber-300 bg-amber-50 px-5 py-3 text-amber-800">
          <Clock size={20} />
          <p className="font-semibold">Awaiting Manager Approval{sheet?.preparer_manager_name ? ` (${sheet.preparer_manager_name})` : ''}</p>
        </div>
      )}
      {status === 'approved' && (
        <div className="flex items-center gap-3 rounded-xl border border-emerald-300 bg-emerald-50 px-5 py-3 text-emerald-800">
          <CheckCircle2 size={20} />
          <p className="font-semibold">Approved{sheet?.reviewed_by_name ? ` by ${sheet.reviewed_by_name}` : ''}{sheet?.reviewed_at ? ` on ${formatDateTime(sheet.reviewed_at)}` : ''} - this costing sheet is locked</p>
        </div>
      )}
      {mode === 'edit' && sheet && !sheet.can_edit && (
        <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-5 py-3 text-slate-700">
          <AlertTriangle size={18} /> This costing sheet can't be edited in its current state.
        </div>
      )}

      {/* Manager actions */}
      {mode === 'view' && sheet?.can_review && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
          <p className="text-sm text-slate-700"><span className="font-semibold">{sheet.prepared_by_name}</span> submitted this costing sheet for your approval.</p>
          <div className="flex gap-3">
            <button onClick={approve} disabled={busy} className="px-5 py-2 text-sm font-medium bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50">Approve</button>
            <button onClick={() => setRejecting(true)} disabled={busy} className="px-5 py-2 text-sm font-medium bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50">Reject</button>
          </div>
        </div>
      )}

      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}
      {notice && !error && (
        <div className="flex justify-between rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-700">
          <span>{notice}</span>
          <button onClick={() => setNotice(null)} className="hover:underline">Dismiss</button>
        </div>
      )}

      <Card title="Project Details">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {headerField('Project Name', 'project_name')}
          {headerField('Client', 'client')}
          {headerField('Quotation Ref No', 'quotation_ref_no', { placeholder: mode === 'new' ? 'Generated when you save' : undefined })}
          {headerField('Consultant', 'consultant')}
          {headerField('Date', 'date', { type: 'date' })}
          {headerField('Main Contractor', 'main_contractor')}
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Department</label>
            <input value={sheet?.department_name ?? enquiry.department_name ?? ''} disabled className={`${cellInput} py-2`} />
          </div>
          {sheet && sheet.revision_no > 0 && (
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Revision No</label>
              <input value={sheet.revision_no} disabled className={`${cellInput} py-2`} />
            </div>
          )}
        </div>
      </Card>

      {table(
        'ST1',
        [
          { label: 'SL#' }, { label: 'Qty' }, { label: 'Unit' }, { label: 'Model#' }, { label: 'Description' }, { label: 'Unit Cost EXW' },
          { label: 'Supplier Disc %' }, { label: 'Unit Rate with Disc.', calc: true }, { label: 'BD Conv. Rate' }, { label: 'Unit Rate in BD', calc: true },
          { label: 'Total Cost BD', calc: true }, { label: 'Ship & Duty %' }, { label: 'Unit Rate BD (C&F)', calc: true }, { label: 'Total Landing BD', calc: true },
          { label: 'Margin %' }, { label: 'Unit Rate Selling', calc: true }, { label: 'Selling Total BD', calc: true },
        ],
        'min-w-[1700px]',
        (line, result) => (
          <tr key={line.key}>
            <td className={td}>{text(line, 'sl_no', 'w-14 text-center')}</td>
            <td className={td}>{number(line, 'qty', 'w-16')}</td>
            <td className={td}>{text(line, 'unit', 'w-16')}</td>
            <td className={td}>{text(line, 'model_no', 'w-28')}</td>
            <td className={td}>{text(line, 'description', 'min-w-[220px]')}</td>
            <td className={td}>{number(line, 'unit_cost_exw', 'w-24')}</td>
            <td className={td}>{number(line, 'supplier_discount_pct', 'w-16')}</td>
            <td className={calcCell}>{bd(result.unit_rate_discounted)}</td>
            <td className={td}>{number(line, 'bd_conversion_rate', 'w-20')}</td>
            <td className={calcCell}>{bd(result.unit_rate_bd)}</td>
            <td className={calcCell}>{bd(result.total_cost_bd)}</td>
            <td className={td}>{number(line, 'shipping_duty_pct', 'w-16')}</td>
            <td className={calcCell}>{bd(result.unit_rate_with_cf)}</td>
            <td className={calcCell}>{bd(result.total_landing_cost_bd)}</td>
            <td className={td}>{number(line, 'margin_pct', 'w-16')}</td>
            <td className={calcCell}>{bd(result.unit_rate_selling)}</td>
            <td className={`${calcCell} font-medium`}>{bd(result.selling_total_bd)}</td>
            {removeCell(line)}
          </tr>
        )
      )}

      {table(
        'ST2',
        [{ label: 'SL#' }, { label: 'Qty' }, { label: 'Unit' }, { label: 'Description' }, { label: 'Unit Cost BD' }, { label: 'Total Cost BD', calc: true }, { label: 'Margin %' }, { label: 'Selling Total BD', calc: true }],
        'min-w-[900px]',
        (line, result) => (
          <tr key={line.key}>
            <td className={td}>{text(line, 'sl_no', 'w-14 text-center')}</td>
            <td className={td}>{number(line, 'qty', 'w-16')}</td>
            <td className={td}>{text(line, 'unit', 'w-16')}</td>
            <td className={td}>{text(line, 'description', 'min-w-[260px]')}</td>
            <td className={td}>{number(line, 'unit_cost_bd', 'w-28')}</td>
            <td className={calcCell}>{bd(result.total_cost_bd)}</td>
            <td className={td}>{number(line, 'margin_pct', 'w-16')}</td>
            <td className={`${calcCell} font-medium`}>{bd(result.selling_total_bd)}</td>
            {removeCell(line)}
          </tr>
        )
      )}

      {table(
        'ST3',
        [{ label: 'Nos' }, { label: 'Month' }, { label: 'Days' }, { label: 'Role / Designation' }, { label: 'Salary / Month (BD)' }, { label: 'Per Day Rate', calc: true }, { label: 'OH %' }, { label: 'Total Cost BD', calc: true }],
        'min-w-[900px]',
        (line, result) => (
          <tr key={line.key}>
            <td className={td}>{number(line, 'nos', 'w-16')}</td>
            <td className={td}>{number(line, 'months', 'w-16')}</td>
            <td className={td}>{number(line, 'days', 'w-16')}</td>
            <td className={td}>{text(line, 'role_name', 'min-w-[200px]')}</td>
            <td className={td}>{number(line, 'salary_per_month', 'w-28')}</td>
            <td className={calcCell}>{bd(result.per_day_rate)}</td>
            <td className={td}>{number(line, 'oh_pct', 'w-16')}</td>
            <td className={`${calcCell} font-medium`}>{bd(result.total_cost)}</td>
            {removeCell(line)}
          </tr>
        )
      )}
      <p className="text-xs text-slate-400 -mt-3 px-1">ST3: per day = salary / 26; total = nos x days x per day x (1 + OH %), where days = month x 26 + days.</p>

      {table('ST4', [{ label: 'Description' }, { label: 'Amount (BD)' }], 'min-w-[600px]', (line) => (
        <tr key={line.key}>
          <td className={td}>{text(line, 'description', 'min-w-[320px]')}</td>
          <td className={td}>{number(line, 'amount', 'w-32')}</td>
          {removeCell(line)}
        </tr>
      ))}

      <div className="max-w-xl">
        <Card title="Summary">
          {stat('ST1 Total Landing Cost', bd(summary.st1_total_landing_cost))}
          {stat('ST2 Total Cost', bd(summary.st2_total_cost))}
          {stat('ST3 Total Cost', bd(summary.st3_total_cost))}
          {stat(`OH Charges (${ohPct}% of ST3)`, bd(summary.oh_charges))}
          {stat('ST4 Bank Charges', bd(summary.st4_bank_charges))}
          {stat('TOTAL NET COST', bd(summary.total_net_cost), true)}
          {stat('TOTAL SELLING AMOUNT', bd(summary.total_selling_amount), true)}
          {stat('PROFIT % ON COST', pct1(summary.profit_pct_on_cost))}
          {stat('PROFIT % ON SELLING', pct1(summary.profit_pct_on_selling))}
          <p className="text-xs text-slate-400 mt-2">All amounts in BHD. Figures update as you type and are recalculated by the server when you save.</p>
        </Card>
      </div>

      {/* Bottom actions */}
      {editing && (
        <div className="flex flex-wrap justify-end gap-3 pb-6">
          {mode === 'edit' && status === 'draft' && (
            <button onClick={removeDraft} className="px-3 py-2 text-sm text-red-600 hover:underline mr-auto">Delete draft</button>
          )}
          <button onClick={() => saveDraft()} disabled={busy || (!dirty && mode !== 'new')} className={secondaryBtn}>
            <Save size={15} /> Save as Draft
          </button>
          <button onClick={submit} disabled={busy || lines.length === 0} className={primaryBtn}>
            <Send size={15} /> {status === 'rejected' ? 'Resubmit' : 'Submit for Approval'}
          </button>
        </div>
      )}
      {mode === 'view' && sheet && (
        <p className="text-xs text-slate-400">Created {formatDMY(sheet.date)}{sheet.prepared_by_name ? ` by ${sheet.prepared_by_name}` : ''}. Signed in as {me.name}.</p>
      )}

      <Modal isOpen={rejecting} onClose={() => setRejecting(false)} title="Reject costing sheet" size="md">
        <div className="space-y-4">
          <p className="text-sm text-slate-600">Tell {sheet?.prepared_by_name || 'the preparer'} what needs to change. They will see this comment and can edit and resubmit.</p>
          <textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={4} placeholder="Rejection comment (required)" className={inputCls} aria-label="Rejection comment" />
          <div className="flex justify-end gap-3">
            <button onClick={() => setRejecting(false)} className={secondaryBtn}>Cancel</button>
            <button onClick={reject} disabled={busy || !comment.trim()} className="px-4 py-2 text-sm font-medium bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50">Reject</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
