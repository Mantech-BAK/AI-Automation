import { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { ENQUIRY_STATUSES, costingApi, errorText, formatDMY, statusLabel, type Department, type Enquiry, type MasUser } from '../../lib/costing';
import { Badge, ErrorBanner, Loading, PageHeader, primaryBtn, selectCls, tdCls, thCls } from './ui';

interface Lookup {
  departments: Department[];
  assignable: MasUser[];
}

export default function EnquiriesList({ onNavigate }: { onNavigate: (path: string) => void }) {
  const [rows, setRows] = useState<Enquiry[]>([]);
  const [lookup, setLookup] = useState<Lookup>({ departments: [], assignable: [] });
  const [status, setStatus] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [assignedTo, setAssignedTo] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    costingApi<Lookup>('/lookup').then(setLookup).catch(() => undefined);
  }, []);

  useEffect(() => {
    const params = new URLSearchParams();
    if (status) params.set('status', status);
    if (departmentId) params.set('department_id', departmentId);
    if (assignedTo) params.set('assigned_to', assignedTo);
    setLoading(true);
    costingApi<Enquiry[]>(`/enquiries?${params.toString()}`)
      .then((data) => {
        setRows(data);
        setError(null);
      })
      .catch((e) => setError(errorText(e, 'Failed to load enquiries')))
      .finally(() => setLoading(false));
  }, [status, departmentId, assignedTo]);

  // Managers see their team in the Assigned To filter; everyone else just themselves.
  const filtersActive = status || departmentId || assignedTo;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Enquiries"
        subtitle="Click an enquiry to see its tasks and costing sheet"
        actions={
          <button onClick={() => onNavigate('/costing/enquiries/new')} className={primaryBtn}>
            <Plus size={16} /> New Enquiry
          </button>
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        <select value={status} onChange={(e) => setStatus(e.target.value)} className={selectCls} aria-label="Status">
          <option value="">All Statuses</option>
          {ENQUIRY_STATUSES.map((s) => (
            <option key={s} value={s}>{statusLabel(s)}</option>
          ))}
        </select>
        <select value={departmentId} onChange={(e) => setDepartmentId(e.target.value)} className={selectCls} aria-label="Department">
          <option value="">All Departments</option>
          {lookup.departments.map((d) => (
            <option key={d.id} value={d.id}>{d.name}</option>
          ))}
        </select>
        <select value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)} className={selectCls} aria-label="Assigned To">
          <option value="">All Assignees</option>
          {lookup.assignable.map((u) => (
            <option key={u.id} value={u.id}>{u.name}</option>
          ))}
        </select>
        {filtersActive && (
          <button
            type="button"
            onClick={() => {
              setStatus('');
              setDepartmentId('');
              setAssignedTo('');
            }}
            className="text-sm font-medium text-teal-600 hover:underline"
          >
            Clear filters
          </button>
        )}
      </div>

      {error && <ErrorBanner message={error} />}

      <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-100 text-sm font-semibold text-slate-800">Enquiries ({rows.length})</div>
        {loading ? (
          <Loading />
        ) : rows.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-slate-400">No enquiries found</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  {['Enquiry No', 'Client', 'Project', 'Department', 'Assigned To', 'Submission Date', 'Status'].map((c) => (
                    <th key={c} className={thCls}>{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((row) => (
                  <tr key={row.id} onClick={() => onNavigate(`/costing/enquiries/${row.id}`)} className="hover:bg-teal-50/50 cursor-pointer">
                    <td className={`${tdCls} font-medium text-slate-800 whitespace-nowrap`}>{row.enquiry_no}</td>
                    <td className={`${tdCls} text-slate-700`}>{row.client_name}</td>
                    <td className={`${tdCls} text-slate-700`}>{row.project_name}</td>
                    <td className={`${tdCls} text-slate-600`}>{row.department_name || '-'}</td>
                    <td className={`${tdCls} text-slate-600`}>{row.assigned_to_name || '-'}</td>
                    <td className={`${tdCls} text-slate-600 whitespace-nowrap`}>{formatDMY(row.submission_date)}</td>
                    <td className={tdCls}><Badge status={row.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
