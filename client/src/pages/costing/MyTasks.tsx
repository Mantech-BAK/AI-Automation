import { useCallback, useEffect, useState } from 'react';
import { costingApi, errorText, formatDMY, isOverdue, jsonInit, type Task } from '../../lib/costing';
import { Badge, ErrorBanner, Loading, PageHeader, tdCls, thCls } from './ui';

const NEXT: Record<string, string> = { pending: 'in_progress', in_progress: 'completed', completed: 'pending' };
const ACTION: Record<string, string> = { pending: 'Start', in_progress: 'Complete', completed: 'Reopen' };

export default function MyTasks({ onNavigate }: { onNavigate: (path: string) => void }) {
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    costingApi<Task[]>('/my-tasks')
      .then(setTasks)
      .catch((e) => setError(errorText(e, 'Failed to load your tasks')));
  }, []);

  useEffect(load, [load]);

  const advance = async (task: Task) => {
    try {
      await costingApi(`/tasks/${task.id}`, jsonInit('PUT', { status: NEXT[task.status] }));
      load();
    } catch (e) {
      setError(errorText(e, 'Failed to update the task'));
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader title="My Tasks" subtitle="Tasks from your enquiries - overdue ones are shown in red" />
      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}
      <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {!tasks ? (
          <Loading />
        ) : tasks.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-slate-400">No tasks assigned to you</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  {['Task', 'Enquiry', 'Project', 'Client', 'Due', 'Status', ''].map((c) => (
                    <th key={c} className={thCls}>{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {tasks.map((task) => {
                  const overdue = isOverdue(task.due_date, task.status);
                  return (
                    <tr key={task.id} className={overdue ? 'bg-red-50 text-red-700' : 'hover:bg-slate-50'}>
                      <td className={`${tdCls} font-medium`}>{task.task_title}</td>
                      <td className={`${tdCls} whitespace-nowrap`}>
                        <button onClick={() => onNavigate(`/costing/enquiries/${task.enquiry_id}`)} className="font-medium hover:underline">{task.enquiry_no}</button>
                      </td>
                      <td className={tdCls}>{task.project_name}</td>
                      <td className={tdCls}>{task.client_name}</td>
                      <td className={`${tdCls} whitespace-nowrap`}>
                        {formatDMY(task.due_date)}
                        {overdue && <span className="ml-2 text-xs font-semibold">Overdue</span>}
                      </td>
                      <td className={tdCls}><Badge status={task.status} /></td>
                      <td className={`${tdCls} text-right`}>
                        <button onClick={() => advance(task)} className="text-sm font-medium text-teal-600 hover:underline">{ACTION[task.status]}</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
