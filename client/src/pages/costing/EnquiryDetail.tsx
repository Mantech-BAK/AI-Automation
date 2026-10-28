import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, Copy, FilePlus2, Pencil, Plus } from 'lucide-react';
import { bd, costingApi, errorText, formatDMY, isOverdue, jsonInit, type Enquiry, type MasUser, type Task } from '../../lib/costing';
import { Badge, Card, ErrorBanner, Loading, PageHeader, inputCls, primaryBtn, secondaryBtn, tdCls, thCls } from './ui';

interface SheetSummary {
  id: number;
  quotation_ref_no: string;
  revision_no: number;
  is_latest: boolean;
  status: string;
  rejection_comment: string | null;
  total_selling_amount: number | string;
  prepared_by_name: string | null;
}

interface Detail {
  enquiry: Enquiry;
  tasks: Task[];
  sheets: SheetSummary[];
}

const TASK_NEXT: Record<string, string> = { pending: 'in_progress', in_progress: 'completed', completed: 'pending' };
const TASK_ACTION: Record<string, string> = { pending: 'Start', in_progress: 'Complete', completed: 'Reopen' };

export default function EnquiryDetail({ me, enquiryId, onNavigate }: { me: MasUser; enquiryId: number; onNavigate: (path: string) => void }) {
  const [data, setData] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [newTask, setNewTask] = useState({ task_title: '', due_date: '', description: '' });
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await costingApi<Detail>(`/enquiries/${enquiryId}`));
      setError(null);
    } catch (e) {
      setError(errorText(e, 'Failed to load the enquiry'));
    }
  }, [enquiryId]);

  useEffect(() => {
    load();
  }, [load]);

  if (!data) return error ? <ErrorBanner message={error} /> : <Loading />;

  const { enquiry, tasks, sheets } = data;
  const latest = sheets.find((s) => s.is_latest) ?? null;
  const field = (label: string, value: string | null | undefined) => (
    <div>
      <dt className="text-xs font-medium text-slate-500">{label}</dt>
      <dd className="text-sm text-slate-800 mt-0.5">{value || '-'}</dd>
    </div>
  );

  const changeTask = async (task: Task) => {
    try {
      await costingApi<Task>(`/tasks/${task.id}`, jsonInit('PUT', { status: TASK_NEXT[task.status] }));
      await load();
    } catch (e) {
      setError(errorText(e, 'Failed to update the task'));
    }
  };

  const addTask = async () => {
    setBusy(true);
    try {
      await costingApi<Task>(`/enquiries/${enquiry.id}/tasks`, jsonInit('POST', newTask));
      setNewTask({ task_title: '', due_date: '', description: '' });
      setAdding(false);
      await load();
    } catch (e) {
      setError(errorText(e, 'Failed to add the task'));
    } finally {
      setBusy(false);
    }
  };

  const createRevision = async () => {
    if (!latest) return;
    try {
      const result = await costingApi<{ id: number }>(`/sheets/${latest.id}/revise`, { method: 'POST' });
      onNavigate(`/costing/sheet/${result.id}/edit`);
    } catch (e) {
      setError(errorText(e, 'Failed to create the revision'));
    }
  };

  const remove = async () => {
    if (!window.confirm(`Delete enquiry ${enquiry.enquiry_no} and its tasks?`)) return;
    try {
      await costingApi(`/enquiries/${enquiry.id}`, { method: 'DELETE' });
      onNavigate('/costing/enquiries');
    } catch (e) {
      setError(errorText(e, 'Failed to delete the enquiry'));
    }
  };

  return (
    <div className="space-y-5 max-w-5xl">
      <div>
        <button onClick={() => onNavigate('/costing/enquiries')} className="flex items-center gap-1 text-sm text-teal-600 hover:underline mb-1">
          <ArrowLeft size={14} /> Enquiries
        </button>
        <PageHeader
          keepTitle
          title={
            <>
              {enquiry.enquiry_no} <Badge status={enquiry.status} />
            </>
          }
          subtitle={`${enquiry.project_name} - ${enquiry.client_name}`}
          actions={
            <>
              <button onClick={() => onNavigate(`/costing/enquiries/${enquiry.id}/edit`)} className={secondaryBtn}>
                <Pencil size={15} /> Edit
              </button>
              {me.role_level >= 3 && !sheets.some((s) => ['submitted', 'approved'].includes(s.status)) && (
                <button onClick={remove} className="px-3 py-2 text-sm text-red-600 hover:underline">Delete</button>
              )}
            </>
          }
        />
      </div>
      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}

      <Card title="Enquiry details">
        <dl className="grid grid-cols-1 sm:grid-cols-3 gap-x-6 gap-y-4">
          {field('Client', enquiry.client_name)}
          {field('Project', enquiry.project_name)}
          {field('Project Location', enquiry.project_location)}
          {field('Consultant', enquiry.consultant)}
          {field('Main Contractor', enquiry.main_contractor)}
          {field('Department', enquiry.department_name)}
          {field('Assigned To', enquiry.assigned_to_name)}
          {field('Salesman', enquiry.salesman_name)}
          {field('Submission Deadline', formatDMY(enquiry.submission_date))}
          {field('Estimated Value', enquiry.estimated_value === null ? '-' : `BHD ${bd(enquiry.estimated_value)}`)}
          {field('Created By', enquiry.created_by_name)}
          <div className="sm:col-span-3">{field('Notes', enquiry.notes)}</div>
        </dl>
      </Card>

      <Card
        title="Costing sheet"
        right={
          !latest ? (
            <button onClick={() => onNavigate(`/costing/sheet/new?enquiry=${enquiry.id}`)} className={primaryBtn}>
              <FilePlus2 size={15} /> Create Costing Sheet
            </button>
          ) : latest.status === 'rejected' ? (
            <button onClick={createRevision} className={primaryBtn}>
              <Copy size={15} /> Create Revision
            </button>
          ) : undefined
        }
      >
        {sheets.length === 0 ? (
          <p className="text-sm text-slate-400">No costing sheet has been prepared for this enquiry yet.</p>
        ) : (
          <div className="space-y-3">
            {latest?.status === 'rejected' && latest.rejection_comment && (
              <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                <span className="font-semibold">Rejected:</span> {latest.rejection_comment}
              </div>
            )}
            <div className="overflow-x-auto -mx-5">
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    {['Quotation Ref', 'Rev', 'Prepared By', 'Selling (BHD)', 'Status', ''].map((c) => (
                      <th key={c} className={thCls}>{c}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {sheets.map((sheet) => (
                    <tr key={sheet.id} className="hover:bg-slate-50">
                      <td className={`${tdCls} font-medium text-slate-800 whitespace-nowrap`}>{sheet.quotation_ref_no}</td>
                      <td className={`${tdCls} text-slate-600`}>R{sheet.revision_no}{!sheet.is_latest && <span className="ml-1 text-xs text-slate-400">(old)</span>}</td>
                      <td className={`${tdCls} text-slate-600`}>{sheet.prepared_by_name || '-'}</td>
                      <td className={`${tdCls} text-right text-slate-700`}>{bd(sheet.total_selling_amount)}</td>
                      <td className={tdCls}><Badge status={sheet.status} /></td>
                      <td className={`${tdCls} text-right whitespace-nowrap`}>
                        <button onClick={() => onNavigate(`/costing/sheet/${sheet.id}`)} className="text-sm font-medium text-teal-600 hover:underline">View</button>
                        {sheet.is_latest && ['draft', 'rejected'].includes(sheet.status) && (
                          <button onClick={() => onNavigate(`/costing/sheet/${sheet.id}/edit`)} className="ml-3 text-sm font-medium text-teal-600 hover:underline">
                            {sheet.status === 'rejected' ? 'Edit & resubmit' : 'Edit'}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Card>

      <Card
        title={`Tasks (${tasks.length})`}
        right={
          <button onClick={() => setAdding((v) => !v)} className="inline-flex items-center gap-1 text-sm font-medium text-teal-600 hover:underline">
            <Plus size={15} /> Add Task
          </button>
        }
      >
        {adding && (
          <div className="grid grid-cols-1 sm:grid-cols-[2fr_1fr_auto] gap-3 mb-4 p-3 bg-slate-50 rounded-lg">
            <input value={newTask.task_title} onChange={(e) => setNewTask({ ...newTask, task_title: e.target.value })} placeholder="Task title" className={inputCls} />
            <input type="date" value={newTask.due_date} onChange={(e) => setNewTask({ ...newTask, due_date: e.target.value })} className={inputCls} aria-label="Due date" />
            <button onClick={addTask} disabled={busy || !newTask.task_title.trim()} className={primaryBtn}>Add</button>
          </div>
        )}
        {tasks.length === 0 ? (
          <p className="text-sm text-slate-400">No tasks</p>
        ) : (
          <div className="overflow-x-auto -mx-5">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  {['Task', 'Assigned To', 'Due', 'Status', ''].map((c) => (
                    <th key={c} className={thCls}>{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {tasks.map((task) => {
                  const overdue = isOverdue(task.due_date, task.status);
                  return (
                    <tr key={task.id} className={overdue ? 'bg-red-50 text-red-700' : ''}>
                      <td className={`${tdCls} font-medium`}>{task.task_title}</td>
                      <td className={tdCls}>{task.assigned_to_name || '-'}</td>
                      <td className={`${tdCls} whitespace-nowrap`}>
                        {formatDMY(task.due_date)}
                        {overdue && <span className="ml-2 text-xs font-semibold">Overdue</span>}
                      </td>
                      <td className={tdCls}><Badge status={task.status} /></td>
                      <td className={`${tdCls} text-right`}>
                        <button onClick={() => changeTask(task)} className="text-sm font-medium text-teal-600 hover:underline">{TASK_ACTION[task.status]}</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
