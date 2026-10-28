import { FileSpreadsheet, FileText } from 'lucide-react';
import { useState } from 'react';
import { EmptyState, ErrorState, Panel, TableHead, useJson } from '../../components/dashboard/parts';
import { DEPARTMENTS, STATUS_STYLES, bd, formatDMY, pct1 } from '../../lib/costing';

interface SheetRow {
  id: number;
  quotation_ref_no: string;
  revision_no: number;
  is_latest: boolean;
  enquiry_no: string;
  project_name: string | null;
  client: string | null;
  department: string;
  date: string;
  status: string;
  total_net_cost: number | string;
  total_selling_amount: number | string;
  profit_pct_on_cost: number | string;
}

const filterClass = 'px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white text-slate-600 focus:outline-none focus:ring-2 focus:ring-teal-500';

// "sheets": every costing sheet (all revisions) -> opens the form.  "quotations": approved sheets -> opens the quotation.
export default function SheetsList({ mode, onNavigate }: { mode: 'sheets' | 'quotations'; onNavigate: (path: string) => void }) {
  const [department, setDepartment] = useState('');
  const [status, setStatus] = useState('');
  const effectiveStatus = mode === 'quotations' ? 'approved' : status;
  const params = new URLSearchParams();
  if (department) params.set('department', department);
  if (effectiveStatus) params.set('status', effectiveStatus);
  const sheets = useJson<SheetRow[]>(`/api/costing/sheets?${params.toString()}`);
  const rows = sheets.data ?? [];

  const title = mode === 'sheets' ? 'Costing Sheets' : 'Quotations';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">{title}</h1>
        <p className="text-slate-500 mt-1">
          {mode === 'sheets' ? 'All costing sheets, including earlier revisions' : 'Approved costing sheets - open one to view or print its quotation'}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <select value={department} onChange={(e) => setDepartment(e.target.value)} className={filterClass} aria-label="Department">
          <option value="">All Departments</option>
          {DEPARTMENTS.map((d) => (
            <option key={d} value={d}>{d}</option>
          ))}
        </select>
        {mode === 'sheets' && (
          <select value={status} onChange={(e) => setStatus(e.target.value)} className={filterClass} aria-label="Status">
            <option value="">All Statuses</option>
            <option value="draft">Draft</option>
            <option value="approved">Approved</option>
          </select>
        )}
      </div>

      {sheets.error && <ErrorState message={sheets.error} />}

      <Panel title={`${title} (${rows.length})`} icon={mode === 'sheets' ? FileSpreadsheet : FileText}>
        {sheets.loading ? (
          <p className="px-5 py-8 text-center text-sm text-slate-400">Loading...</p>
        ) : rows.length === 0 ? (
          <EmptyState icon={FileSpreadsheet} message={mode === 'sheets' ? 'No costing sheets found' : 'No approved quotations yet'} hint={mode === 'quotations' ? 'A quotation is available once the GM and Director have approved the costing sheet.' : undefined} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <TableHead columns={['Quotation Ref', 'Rev', 'Enquiry', 'Project', 'Client', 'Dept', 'Date', 'Status', 'Net Cost (BHD)', 'Selling (BHD)', 'Profit on Cost']} />
              <tbody className="divide-y divide-slate-100">
                {rows.map((row) => (
                  <tr
                    key={row.id}
                    onClick={() => onNavigate(mode === 'sheets' ? `/costing/sheet/${row.id}` : `/costing/quotation/${row.id}`)}
                    className="hover:bg-teal-50/50 cursor-pointer"
                  >
                    <td className="px-5 py-2.5 font-medium text-slate-800 whitespace-nowrap">{row.quotation_ref_no}</td>
                    <td className="px-5 py-2.5 text-slate-600">
                      R{row.revision_no}
                      {!row.is_latest && <span className="ml-1 text-xs text-slate-400">(old)</span>}
                    </td>
                    <td className="px-5 py-2.5 text-slate-600 whitespace-nowrap">{row.enquiry_no}</td>
                    <td className="px-5 py-2.5 text-slate-700">{row.project_name || '-'}</td>
                    <td className="px-5 py-2.5 text-slate-600">{row.client || '-'}</td>
                    <td className="px-5 py-2.5 text-slate-600">{row.department}</td>
                    <td className="px-5 py-2.5 text-slate-600 whitespace-nowrap">{formatDMY(row.date)}</td>
                    <td className="px-5 py-2.5">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium capitalize ${STATUS_STYLES[row.status] ?? STATUS_STYLES.draft}`}>{row.status}</span>
                    </td>
                    <td className="px-5 py-2.5 text-right text-slate-700 whitespace-nowrap">{bd(row.total_net_cost)}</td>
                    <td className="px-5 py-2.5 text-right text-slate-800 font-medium whitespace-nowrap">{bd(row.total_selling_amount)}</td>
                    <td className="px-5 py-2.5 text-right text-slate-600">{pct1(row.profit_pct_on_cost)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}
