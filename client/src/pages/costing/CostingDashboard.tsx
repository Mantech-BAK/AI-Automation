import { CheckCircle2, ClipboardList, Clock, Coins, FileSpreadsheet } from 'lucide-react';
import { EmptyState, ErrorState, Panel, TableHead, useJson } from '../../components/dashboard/parts';
import { STATUS_STYLES, bd, formatDMY } from '../../lib/costing';

interface RecentSheet {
  id: number;
  quotation_ref_no: string;
  enquiry_no: string;
  project_name: string | null;
  client: string | null;
  department: string;
  status: string;
  is_latest: boolean;
  total_selling_amount: number | string;
  updated_at: string;
}

interface CostingSummary {
  total_enquiries: number;
  pending_approval: number;
  approved_this_month: number;
  total_quoted_value: number;
  recent: RecentSheet[];
}

export default function CostingDashboard({ onNavigate }: { onNavigate: (path: string) => void }) {
  const summary = useJson<CostingSummary>('/api/costing/summary');
  const s = summary.data;
  const loading = summary.loading;

  const tiles = [
    { label: 'Total Enquiries', value: s ? String(s.total_enquiries) : '...', icon: ClipboardList, tone: 'text-blue-600 bg-blue-100' },
    { label: 'Pending Approval', value: s ? String(s.pending_approval) : '...', icon: Clock, tone: 'text-amber-600 bg-amber-100' },
    { label: 'Approved This Month', value: s ? String(s.approved_this_month) : '...', icon: CheckCircle2, tone: 'text-emerald-600 bg-emerald-100' },
    { label: 'Total Quoted Value (BHD)', value: s ? bd(s.total_quoted_value) : '...', icon: Coins, tone: 'text-indigo-600 bg-indigo-100' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Costing Sheet</h1>
        <p className="text-slate-500 mt-1">Enquiries, costing sheets and quotations</p>
      </div>

      {summary.error && <ErrorState message={summary.error} />}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {tiles.map((tile) => {
          const Icon = tile.icon;
          return (
            <div key={tile.label} className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 flex items-center gap-3">
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${tile.tone}`}>
                <Icon size={20} />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-slate-500 leading-tight">{tile.label}</p>
                <p className="text-xl font-bold text-slate-800 truncate">{tile.value}</p>
              </div>
            </div>
          );
        })}
      </div>

      <Panel title="Recent Costing Sheets" icon={FileSpreadsheet} action={{ label: 'View all', onClick: () => onNavigate('/costing/sheets') }}>
        {loading ? (
          <p className="px-5 py-8 text-center text-sm text-slate-400">Loading...</p>
        ) : !s || s.recent.length === 0 ? (
          <EmptyState icon={FileSpreadsheet} message="No costing sheets yet" hint="Create an enquiry to start your first costing sheet." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <TableHead columns={['Quotation Ref', 'Enquiry', 'Project', 'Client', 'Dept', 'Status', 'Selling (BHD)', 'Updated']} />
              <tbody className="divide-y divide-slate-100">
                {s.recent.map((sheet) => (
                  <tr key={sheet.id} onClick={() => onNavigate(`/costing/sheet/${sheet.id}`)} className="hover:bg-teal-50/50 cursor-pointer">
                    <td className="px-5 py-2.5 font-medium text-slate-800 whitespace-nowrap">{sheet.quotation_ref_no}</td>
                    <td className="px-5 py-2.5 text-slate-600 whitespace-nowrap">{sheet.enquiry_no}</td>
                    <td className="px-5 py-2.5 text-slate-700">{sheet.project_name || '-'}</td>
                    <td className="px-5 py-2.5 text-slate-600">{sheet.client || '-'}</td>
                    <td className="px-5 py-2.5 text-slate-600">{sheet.department}</td>
                    <td className="px-5 py-2.5">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium capitalize ${STATUS_STYLES[sheet.status] ?? STATUS_STYLES.draft}`}>{sheet.status}</span>
                    </td>
                    <td className="px-5 py-2.5 text-right text-slate-700 whitespace-nowrap">{bd(sheet.total_selling_amount)}</td>
                    <td className="px-5 py-2.5 text-slate-500 whitespace-nowrap">{formatDMY(sheet.updated_at)}</td>
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
