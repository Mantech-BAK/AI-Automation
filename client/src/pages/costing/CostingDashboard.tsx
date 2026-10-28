import { useEffect, useState } from 'react';
import { CheckCircle2, ClipboardList, Clock, ListTodo, ShieldCheck } from 'lucide-react';
import { costingApi, errorText, formatDMY, isOverdue, type Enquiry, type MasUser, type Task } from '../../lib/costing';
import { Badge, Card, ErrorBanner, Loading, PageHeader, tdCls, thCls } from './ui';

interface DashboardData {
  total_enquiries: number;
  pending_my_action: number;
  pending_breakdown: { open_tasks: number; to_approve: number; rejected: number };
  awaiting_approval: number;
  approved_this_month: number;
  recent_enquiries: Enquiry[];
  my_tasks: Task[];
}

export default function CostingDashboard({ me, onNavigate }: { me: MasUser; onNavigate: (path: string) => void }) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    costingApi<DashboardData>('/dashboard').then(setData).catch((e) => setError(errorText(e, 'Failed to load the dashboard')));
  }, []);

  const breakdown = data?.pending_breakdown;
  const tiles = [
    { label: 'Total Enquiries', value: data?.total_enquiries, icon: ClipboardList, tone: 'text-blue-600 bg-blue-100', hint: me.role_level >= 4 ? 'All departments' : me.role_level === 3 ? 'You and your team' : 'Yours' },
    {
      label: 'Pending My Action',
      value: data?.pending_my_action,
      icon: ListTodo,
      tone: 'text-amber-600 bg-amber-100',
      hint: breakdown ? `${breakdown.open_tasks} tasks - ${breakdown.to_approve} to approve - ${breakdown.rejected} rejected` : '',
    },
    { label: 'Sheets Awaiting Approval', value: data?.awaiting_approval, icon: Clock, tone: 'text-violet-600 bg-violet-100', hint: 'Submitted, not yet reviewed' },
    { label: 'Approved This Month', value: data?.approved_this_month, icon: CheckCircle2, tone: 'text-emerald-600 bg-emerald-100', hint: 'Costing sheets' },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="Costing Sheet" subtitle={`${me.name} - ${me.role_name}${me.department_name ? ` (${me.department_name})` : ''}`} />
      {error && <ErrorBanner message={error} />}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {tiles.map((tile) => {
          const Icon = tile.icon;
          return (
            <div key={tile.label} className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 flex items-start gap-3">
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${tile.tone}`}>
                <Icon size={20} />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-slate-500 leading-tight">{tile.label}</p>
                <p className="text-2xl font-bold text-slate-800">{tile.value === undefined ? '...' : tile.value}</p>
                <p className="text-[11px] text-slate-400 leading-tight">{tile.hint}</p>
              </div>
            </div>
          );
        })}
      </div>

      <Card title="My Tasks" right={<button onClick={() => onNavigate('/costing/tasks')} className="text-xs font-medium text-cyan-600 hover:underline">View all</button>}>
        {!data ? (
          <Loading />
        ) : data.my_tasks.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-4">Nothing assigned to you right now</p>
        ) : (
          <div className="overflow-x-auto -mx-5 -mb-5">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  {['Task', 'Enquiry', 'Project', 'Due', 'Status'].map((c) => (
                    <th key={c} className={thCls}>{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.my_tasks.map((task) => {
                  const overdue = isOverdue(task.due_date, task.status);
                  return (
                    <tr key={task.id} onClick={() => onNavigate(`/costing/enquiries/${task.enquiry_id}`)} className={`cursor-pointer ${overdue ? 'bg-red-50 text-red-700 hover:bg-red-100' : 'hover:bg-slate-50'}`}>
                      <td className={`${tdCls} font-medium`}>{task.task_title}</td>
                      <td className={`${tdCls} whitespace-nowrap`}>{task.enquiry_no}</td>
                      <td className={tdCls}>{task.project_name}</td>
                      <td className={`${tdCls} whitespace-nowrap`}>
                        {formatDMY(task.due_date)}
                        {overdue && <span className="ml-2 text-xs font-semibold">Overdue</span>}
                      </td>
                      <td className={tdCls}><Badge status={task.status} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title="Recent Enquiries" right={<button onClick={() => onNavigate('/costing/enquiries')} className="text-xs font-medium text-cyan-600 hover:underline">View all</button>}>
        {!data ? (
          <Loading />
        ) : data.recent_enquiries.length === 0 ? (
          <div className="text-center py-4 space-y-2">
            <ShieldCheck className="mx-auto text-slate-300" />
            <p className="text-sm text-slate-400">No enquiries yet</p>
          </div>
        ) : (
          <div className="overflow-x-auto -mx-5 -mb-5">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  {['Enquiry No', 'Client', 'Project', 'Department', 'Assigned To', 'Status'].map((c) => (
                    <th key={c} className={thCls}>{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.recent_enquiries.map((enquiry) => (
                  <tr key={enquiry.id} onClick={() => onNavigate(`/costing/enquiries/${enquiry.id}`)} className="hover:bg-teal-50/50 cursor-pointer">
                    <td className={`${tdCls} font-medium text-slate-800 whitespace-nowrap`}>{enquiry.enquiry_no}</td>
                    <td className={`${tdCls} text-slate-700`}>{enquiry.client_name}</td>
                    <td className={`${tdCls} text-slate-700`}>{enquiry.project_name}</td>
                    <td className={`${tdCls} text-slate-600`}>{enquiry.department_name || '-'}</td>
                    <td className={`${tdCls} text-slate-600`}>{enquiry.assigned_to_name || '-'}</td>
                    <td className={tdCls}><Badge status={enquiry.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
