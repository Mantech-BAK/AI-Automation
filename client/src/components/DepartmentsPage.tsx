import { useEffect, useState } from 'react';
import {
  Building2,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  Cog,
  FileText,
  Loader2,
} from 'lucide-react';

interface DepartmentSummary {
  name: string;
  document_count: number;
}

interface DepartmentTask {
  id: string;
  asset_id?: string | number | null;
  task_type?: string | null;
  equipment_name?: string | null;
  document_name?: string | null;
  site_location?: string | null;
  department?: string | null;
  status?: string;
  due_date?: string | null;
  expiry_date?: string | null;
  days_overdue?: number;
}

function getStatusBadgeColor(task: DepartmentTask) {
  const overdue = Boolean(task.days_overdue && task.days_overdue > 0) && task.status !== 'completed';
  if (task.status === 'completed') return 'bg-emerald-100 text-emerald-700';
  if (overdue) return 'bg-red-100 text-red-700';
  return 'bg-amber-100 text-amber-700';
}

function getStatusLabel(task: DepartmentTask) {
  const overdue = Boolean(task.days_overdue && task.days_overdue > 0) && task.status !== 'completed';
  if (task.status === 'completed') return 'Completed';
  if (overdue) return 'Overdue';
  return 'Open';
}

export default function DepartmentsPage() {
  const [departments, setDepartments] = useState<DepartmentSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [expanded, setExpanded] = useState<string | null>(null);
  const [tasksByDepartment, setTasksByDepartment] = useState<Record<string, DepartmentTask[]>>({});
  const [tasksLoading, setTasksLoading] = useState<Record<string, boolean>>({});
  const [tasksError, setTasksError] = useState<Record<string, string>>({});
  const [completingId, setCompletingId] = useState<string | null>(null);

  useEffect(() => {
    fetchDepartments();
  }, []);

  async function fetchDepartments() {
    setLoading(true);
    try {
      const response = await fetch('/api/dashboard/departments/list');
      if (!response.ok) {
        throw new Error(`Failed to load departments: ${response.statusText}`);
      }
      const json: DepartmentSummary[] = await response.json();
      setDepartments(json);
    } catch (fetchError) {
      const message = fetchError instanceof Error ? fetchError.message : 'Unknown error';
      console.error('Error fetching departments:', fetchError);
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  async function fetchDepartmentTasks(name: string) {
    setTasksLoading((prev) => ({ ...prev, [name]: true }));
    setTasksError((prev) => {
      const next = { ...prev };
      delete next[name];
      return next;
    });
    try {
      const response = await fetch(`/api/dashboard/departments/${encodeURIComponent(name)}/tasks`);
      if (!response.ok) {
        throw new Error(`Failed to load tasks: ${response.statusText}`);
      }
      const json: DepartmentTask[] = await response.json();
      setTasksByDepartment((prev) => ({ ...prev, [name]: json }));
    } catch (fetchError) {
      const message = fetchError instanceof Error ? fetchError.message : 'Unknown error';
      console.error(`Error fetching tasks for ${name}:`, fetchError);
      setTasksError((prev) => ({ ...prev, [name]: message }));
    } finally {
      setTasksLoading((prev) => ({ ...prev, [name]: false }));
    }
  }

  function toggleExpanded(name: string) {
    if (expanded === name) {
      setExpanded(null);
      return;
    }
    setExpanded(name);
    if (!tasksByDepartment[name]) {
      fetchDepartmentTasks(name);
    }
  }

  async function handleComplete(name: string, taskId: string) {
    setCompletingId(taskId);
    try {
      const response = await fetch(`/api/workorders/${taskId}/complete`, { method: 'POST' });
      if (!response.ok) {
        throw new Error(`Failed to complete task: ${response.statusText}`);
      }
      await fetchDepartmentTasks(name);
      window.dispatchEvent(new Event('technician-data-updated'));
    } catch (fetchError) {
      console.error('Error completing task:', fetchError);
    } finally {
      setCompletingId(null);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-red-600 bg-red-50 border border-red-200 rounded-xl p-6">
          <p className="font-semibold">Failed to load departments</p>
          <p className="text-sm mt-2">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Departments</h1>
        <p className="text-slate-500 mt-1">Equipment and document tasks grouped by department</p>
      </div>

      {/* Departments List */}
      <div className="space-y-3">
        {departments.length === 0 ? (
          <div className="bg-white rounded-xl p-12 text-center border border-slate-200">
            <Building2 size={40} className="mx-auto text-slate-300 mb-2" />
            <p className="text-slate-500">No departments found.</p>
          </div>
        ) : (
          departments.map((dept) => {
            const isOpen = expanded === dept.name;
            const tasks = tasksByDepartment[dept.name] || [];
            const equipmentTasks = tasks.filter((t) => t.task_type !== 'document');
            const documentTasks = tasks.filter((t) => t.task_type === 'document');

            return (
              <div key={dept.name} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                <button
                  type="button"
                  onClick={() => toggleExpanded(dept.name)}
                  className="w-full flex items-center justify-between gap-3 px-5 py-4 hover:bg-slate-50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-teal-500/10 flex items-center justify-center flex-shrink-0">
                      <Building2 size={18} className="text-teal-600" />
                    </div>
                    <span className="font-semibold text-slate-800">{dept.name}</span>
                    <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-cyan-100 text-cyan-700">
                      {dept.document_count} document{dept.document_count === 1 ? '' : 's'}
                    </span>
                  </div>
                  {isOpen ? (
                    <ChevronDown size={18} className="text-slate-400 flex-shrink-0" />
                  ) : (
                    <ChevronRight size={18} className="text-slate-400 flex-shrink-0" />
                  )}
                </button>

                {isOpen && (
                  <div className="border-t border-slate-100 p-5 space-y-6">
                    {tasksLoading[dept.name] ? (
                      <div className="flex items-center justify-center py-8">
                        <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
                      </div>
                    ) : tasksError[dept.name] ? (
                      <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                        {tasksError[dept.name]}
                      </p>
                    ) : (
                      <>
                        {/* Equipment tasks */}
                        <div>
                          <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-700 mb-3">
                            <Cog size={16} className="text-indigo-500" />
                            Equipment Tasks
                          </h3>
                          {equipmentTasks.length === 0 ? (
                            <p className="text-sm text-slate-400">No equipment tasks for this department.</p>
                          ) : (
                            <div className="space-y-2">
                              {equipmentTasks.map((task) => (
                                <div
                                  key={task.id}
                                  className="flex items-center justify-between gap-3 p-3 rounded-lg border border-slate-200"
                                >
                                  <div className="min-w-0">
                                    <p className="font-medium text-slate-800 text-sm truncate">{task.equipment_name || 'Untitled'}</p>
                                    <p className="text-xs text-slate-500 mt-0.5">
                                      {task.due_date ? new Date(task.due_date).toLocaleDateString() : 'No due date'}
                                    </p>
                                  </div>
                                  <div className="flex items-center gap-2 flex-shrink-0">
                                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusBadgeColor(task)}`}>
                                      {getStatusLabel(task)}
                                    </span>
                                    {task.status !== 'completed' && (
                                      <button
                                        onClick={() => handleComplete(dept.name, task.id)}
                                        disabled={completingId === task.id}
                                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-emerald-50 text-emerald-700 rounded-lg hover:bg-emerald-100 transition-colors disabled:opacity-50"
                                      >
                                        {completingId === task.id ? (
                                          <Loader2 size={14} className="animate-spin" />
                                        ) : (
                                          <CheckCircle2 size={14} />
                                        )}
                                        Complete
                                      </button>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Document tasks */}
                        <div>
                          <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-700 mb-3">
                            <FileText size={16} className="text-cyan-500" />
                            Document Tasks
                          </h3>
                          {documentTasks.length === 0 ? (
                            <p className="text-sm text-slate-400">No document tasks for this department.</p>
                          ) : (
                            <div className="space-y-2">
                              {documentTasks.map((task) => (
                                <div
                                  key={task.id}
                                  className="flex items-center justify-between gap-3 p-3 rounded-lg border border-slate-200"
                                >
                                  <div className="min-w-0">
                                    <p className="font-medium text-slate-800 text-sm truncate">{task.document_name || task.equipment_name || 'Untitled'}</p>
                                    <p className="text-xs text-slate-500 mt-0.5">
                                      Expires {task.expiry_date ? new Date(task.expiry_date).toLocaleDateString() : '-'}
                                    </p>
                                  </div>
                                  <div className="flex items-center gap-2 flex-shrink-0">
                                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusBadgeColor(task)}`}>
                                      {getStatusLabel(task)}
                                    </span>
                                    {task.status !== 'completed' && (
                                      <button
                                        onClick={() => handleComplete(dept.name, task.id)}
                                        disabled={completingId === task.id}
                                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-emerald-50 text-emerald-700 rounded-lg hover:bg-emerald-100 transition-colors disabled:opacity-50"
                                      >
                                        {completingId === task.id ? (
                                          <Loader2 size={14} className="animate-spin" />
                                        ) : (
                                          <CheckCircle2 size={14} />
                                        )}
                                        Document Renewed
                                      </button>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
