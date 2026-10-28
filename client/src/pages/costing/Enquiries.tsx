import { useCallback, useEffect, useState } from 'react';
import { ClipboardList, Plus } from 'lucide-react';
import { EmptyState, ErrorState, Panel, TableHead } from '../../components/dashboard/parts';
import Modal from '../../components/Modal';
import { DEPARTMENTS, ENQUIRY_STATUSES, STATUS_STYLES, costingApi, formatDMY, jsonInit, todayBahrain, type Enquiry } from '../../lib/costing';

const inputClass = 'w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent';
const filterClass = 'px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white text-slate-600 focus:outline-none focus:ring-2 focus:ring-teal-500';

const emptyForm = { customer_name: '', project_name: '', client: '', consultant: '', main_contractor: '', department: 'ELV', date: todayBahrain() };

export default function Enquiries({ onNavigate }: { onNavigate: (path: string) => void }) {
  const [rows, setRows] = useState<Enquiry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [department, setDepartment] = useState('');
  const [status, setStatus] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (department) params.set('department', department);
      if (status) params.set('status', status);
      if (from) params.set('from', from);
      if (to) params.set('to', to);
      setRows(await costingApi<Enquiry[]>(`/enquiries?${params.toString()}`));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load enquiries');
    } finally {
      setLoading(false);
    }
  }, [department, status, from, to]);

  useEffect(() => {
    load();
  }, [load]);

  const create = async () => {
    setSaving(true);
    setFormError(null);
    try {
      const result = await costingApi<{ sheet_id: number }>('/enquiries', jsonInit('POST', form));
      setOpen(false);
      setForm({ ...emptyForm, date: todayBahrain() });
      onNavigate(`/costing/sheet/${result.sheet_id}`);
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Failed to create enquiry');
    } finally {
      setSaving(false);
    }
  };

  const field = (label: string, key: keyof typeof emptyForm, required = false, type = 'text') => (
    <div>
      <label className="block text-sm font-medium text-slate-700 mb-1">
        {label}
        {required && ' *'}
      </label>
      <input type={type} value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} className={inputClass} />
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Enquiries</h1>
          <p className="text-slate-500 mt-1">Click an enquiry to open its costing sheet</p>
        </div>
        <button
          onClick={() => {
            setFormError(null);
            setOpen(true);
          }}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-gradient-to-r from-cyan-500 to-blue-600 text-white rounded-lg hover:shadow-lg transition-shadow"
        >
          <Plus size={16} /> New Enquiry
        </button>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <select value={department} onChange={(e) => setDepartment(e.target.value)} className={filterClass} aria-label="Department">
          <option value="">All Departments</option>
          {DEPARTMENTS.map((d) => (
            <option key={d} value={d}>{d}</option>
          ))}
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value)} className={filterClass} aria-label="Status">
          <option value="">All Statuses</option>
          {ENQUIRY_STATUSES.map((st) => (
            <option key={st} value={st} className="capitalize">{st}</option>
          ))}
        </select>
        <label className="flex flex-col text-[11px] font-medium text-slate-400 leading-tight">
          From
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={`${filterClass} w-36`} />
        </label>
        <label className="flex flex-col text-[11px] font-medium text-slate-400 leading-tight">
          To
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={`${filterClass} w-36`} />
        </label>
        {(department || status || from || to) && (
          <button
            type="button"
            onClick={() => {
              setDepartment('');
              setStatus('');
              setFrom('');
              setTo('');
            }}
            className="pb-2 text-sm font-medium text-teal-600 hover:underline"
          >
            Clear filters
          </button>
        )}
      </div>

      {error && <ErrorState message={error} />}

      <Panel title={`Enquiries (${rows.length})`} icon={ClipboardList}>
        {loading ? (
          <p className="px-5 py-8 text-center text-sm text-slate-400">Loading...</p>
        ) : rows.length === 0 ? (
          <EmptyState icon={ClipboardList} message="No enquiries found" hint="Create one with the New Enquiry button." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <TableHead columns={['Enquiry No', 'Customer', 'Project Name', 'Department', 'Date', 'Status']} />
              <tbody className="divide-y divide-slate-100">
                {rows.map((row) => (
                  <tr
                    key={row.id}
                    onClick={() => row.latest_sheet_id && onNavigate(`/costing/sheet/${row.latest_sheet_id}`)}
                    className="hover:bg-teal-50/50 cursor-pointer"
                  >
                    <td className="px-5 py-2.5 font-medium text-slate-800 whitespace-nowrap">{row.enquiry_no}</td>
                    <td className="px-5 py-2.5 text-slate-700">{row.customer_name}</td>
                    <td className="px-5 py-2.5 text-slate-700">{row.project_name}</td>
                    <td className="px-5 py-2.5 text-slate-600">{row.department}</td>
                    <td className="px-5 py-2.5 text-slate-600 whitespace-nowrap">{formatDMY(row.date)}</td>
                    <td className="px-5 py-2.5">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium capitalize ${STATUS_STYLES[row.status] ?? STATUS_STYLES.draft}`}>{row.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Modal isOpen={open} onClose={() => setOpen(false)} title="New Enquiry" size="lg">
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {field('Customer Name', 'customer_name', true)}
            {field('Project Name', 'project_name', true)}
            {field('Client', 'client')}
            {field('Consultant', 'consultant')}
            {field('Main Contractor', 'main_contractor')}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Department *</label>
              <select value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} className={inputClass}>
                {DEPARTMENTS.map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>
            {field('Date', 'date', false, 'date')}
          </div>
          {formError && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{formError}</div>}
          <div className="flex justify-end gap-3 pt-2">
            <button onClick={() => setOpen(false)} className="px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 rounded-lg">Cancel</button>
            <button
              onClick={create}
              disabled={saving || !form.customer_name.trim() || !form.project_name.trim()}
              className="px-4 py-2 text-sm font-medium bg-gradient-to-r from-cyan-500 to-blue-600 text-white rounded-lg hover:shadow-lg disabled:opacity-50"
            >
              {saving ? 'Creating...' : 'Create & open costing sheet'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
