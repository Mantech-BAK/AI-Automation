import { BarChart3, CalendarClock, Package, Wrench } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { NavFilter } from '../../App';
import ModuleOverview from './ModuleOverview';
import {
  EmptyState,
  ErrorState,
  LoadingState,
  Panel,
  TableHead,
  daysUntil,
  formatDMY,
  titleCase,
  useJson,
} from './parts';

interface Task {
  id: number | string;
  equipment_name?: string | null;
  type_of_service?: string | null;
  due_date?: string | null;
  technician_name?: string | null;
  status?: string | null;
}

interface RecentAsset {
  id: number | string;
  equipment_name: string;
  site_location?: string | null;
  category_name?: string | null;
  updated_at?: string | null;
}

// Fixed colours for the statuses the app knows; anything else falls back to grey.
const STATUS_ORDER = ['open', 'pending', 'approved', 'in_progress', 'completed', 'rejected'];
const STATUS_COLORS: Record<string, string> = {
  open: '#f97316',
  pending: '#f59e0b',
  approved: '#06b6d4',
  in_progress: '#3b82f6',
  completed: '#10b981',
  rejected: '#94a3b8',
};

interface Props {
  onNavigate: (page: string, filter?: NavFilter) => void;
}

export default function EquipmentDashboard({ onNavigate }: Props) {
  const tasks = useJson<Task[]>('/api/dashboard/tasks?task_type=equipment');
  const recent = useJson<RecentAsset[]>('/api/dashboard/assets?type=Equipment&sort=recent&limit=5');

  // Tasks by whatever statuses exist in the data.
  const counts = new Map<string, number>();
  for (const task of tasks.data ?? []) {
    const status = (task.status || 'open').toLowerCase();
    counts.set(status, (counts.get(status) ?? 0) + 1);
  }
  const chartData = [...counts.entries()]
    .sort(([a], [b]) => {
      const ia = STATUS_ORDER.indexOf(a);
      const ib = STATUS_ORDER.indexOf(b);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    })
    .map(([status, count]) => ({ status, label: titleCase(status), count }));

  // Not-finished tasks due in the next 7 days, soonest first.
  const upcoming = (tasks.data ?? [])
    .filter((task) => {
      const days = daysUntil(task.due_date);
      return days !== null && days >= 0 && days <= 7 && !['completed', 'rejected'].includes((task.status || '').toLowerCase());
    })
    .sort((a, b) => String(a.due_date).localeCompare(String(b.due_date)))
    .slice(0, 8);

  return (
    <div className="space-y-6">

      {/* Original donut chart and stat tiles */}
      <ModuleOverview module="equipment" onNavigate={onNavigate} />

      <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">
        <div className="xl:col-span-2">
          <Panel title="Tasks by Status" icon={BarChart3}>
            {tasks.loading ? (
              <LoadingState />
            ) : tasks.error ? (
              <ErrorState message={tasks.error} />
            ) : chartData.length === 0 ? (
              <EmptyState icon={BarChart3} message="No tasks yet" hint="Maintenance tasks will be charted here by status." />
            ) : (
              <div className="h-64 px-3 pt-4 pb-2">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 8, right: 12, left: -16, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                    <XAxis dataKey="label" tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
                    <Tooltip cursor={{ fill: '#f1f5f9' }} />
                    <Bar dataKey="count" name="Tasks" radius={[6, 6, 0, 0]} maxBarSize={56}>
                      {chartData.map((entry) => (
                        <Cell key={entry.status} fill={STATUS_COLORS[entry.status] ?? '#64748b'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </Panel>
        </div>

        <div className="xl:col-span-3">
          <Panel
            title="Upcoming Maintenance Tasks (next 7 days)"
            icon={CalendarClock}
            action={{ label: 'View all tasks', onClick: () => onNavigate('tasks', { tab: 'equipment' }) }}
          >
            {tasks.loading ? (
              <LoadingState />
            ) : tasks.error ? (
              <ErrorState message={tasks.error} />
            ) : upcoming.length === 0 ? (
              <EmptyState icon={CalendarClock} message="No upcoming tasks" hint="Nothing is due in the next 7 days." />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <TableHead columns={['Asset Name', 'Task Type', 'Due Date', 'Technician']} />
                  <tbody className="divide-y divide-slate-100">
                    {upcoming.map((task) => (
                      <tr key={task.id} className="hover:bg-slate-50">
                        <td className="px-5 py-3 font-medium text-slate-800">{task.equipment_name || '-'}</td>
                        <td className="px-5 py-3 text-slate-600">{task.type_of_service ? titleCase(task.type_of_service) : '-'}</td>
                        <td className="px-5 py-3 text-slate-600 whitespace-nowrap">{formatDMY(task.due_date)}</td>
                        <td className="px-5 py-3 text-slate-600">{task.technician_name || 'Unassigned'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        </div>
      </div>

      <Panel
        title="Recently Updated Assets"
        icon={Wrench}
        action={{ label: 'View all assets', onClick: () => onNavigate('equipment', { tab: 'equipment' }) }}
      >
        {recent.loading ? (
          <LoadingState />
        ) : recent.error ? (
          <ErrorState message={recent.error} />
        ) : (recent.data ?? []).length === 0 ? (
          <EmptyState icon={Package} message="No assets yet" hint="Add equipment from Asset Information to see it here." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <TableHead columns={['Asset Name', 'Category', 'Site', 'Last Updated']} />
              <tbody className="divide-y divide-slate-100">
                {(recent.data ?? []).map((asset) => (
                  <tr key={asset.id} className="hover:bg-slate-50">
                    <td className="px-5 py-3 font-medium text-slate-800">{asset.equipment_name}</td>
                    <td className="px-5 py-3 text-slate-600">{asset.category_name || '-'}</td>
                    <td className="px-5 py-3 text-slate-600">{asset.site_location || '-'}</td>
                    <td className="px-5 py-3 text-slate-600 whitespace-nowrap">{formatDMY(asset.updated_at)}</td>
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
