import { useEffect, useState } from 'react';
import {
  Car,
  Loader2,
  Plus,
  Pencil,
  Trash2,
  CheckCircle2,
  Search,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import Modal from './Modal';

interface Vehicle {
  id: number;
  vehicle_no: string;
  vehicle_name: string;
  vehicle_type?: string | null;
  model?: string | null;
  cr_no?: string | null;
  department?: string | null;
  site_location?: string | null;
  incharge?: string | null;
  remarks?: string | null;
  total_tasks: number;
  expired_tasks: number;
  expiring_tasks: number;
}

interface VehicleTask {
  id: number;
  vehicle_id: number;
  task_name: string;
  task_type: string;
  expiry_date?: string | null;
  registration_date?: string | null;
  reminder_days?: number | null;
  frequency_days?: number | null;
  status: string;
  planner_task_id?: string | null;
  completed_at?: string | null;
  notes?: string | null;
  created_at?: string;
}

interface VehiclesPageProps {
  initialSelectedVehicleId?: number | null;
  readOnly?: boolean;
}

const TASK_TYPES = ['Insurance', 'Registration', 'Third Party Insurance', 'BAPCO Badge', 'Service', 'Mulkiya', 'Passing', 'Other'];

const emptyVehicleForm = {
  vehicle_no: '',
  vehicle_name: '',
  vehicle_type: '',
  model: '',
  cr_no: '',
  department: '',
  site_location: '',
  incharge: '',
  remarks: '',
};

const emptyTaskForm = {
  task_name: '',
  task_type: TASK_TYPES[0],
  registration_date: '',
  expiry_date: '',
  reminder_days: '30',
  frequency_days: '365',
};

function daysUntil(dateStr?: string | null): number | null {
  if (!dateStr) return null;
  const due = new Date(dateStr);
  if (Number.isNaN(due.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

function getExpiryColorClass(dateStr?: string | null): string {
  const days = daysUntil(dateStr);
  if (days === null) return 'text-slate-500';
  if (days < 0) return 'text-red-600 font-semibold';
  if (days <= 30) return 'text-orange-600 font-medium';
  return 'text-emerald-600 font-medium';
}

function getStatusBadge(task: VehicleTask): { label: string; className: string } {
  if (task.status === 'completed') return { label: 'Completed', className: 'bg-emerald-100 text-emerald-700' };
  const days = daysUntil(task.expiry_date);
  if (days !== null && days < 0) return { label: 'Expired', className: 'bg-red-100 text-red-700' };
  if (days !== null && days <= 30) return { label: 'Expiring Soon', className: 'bg-orange-100 text-orange-700' };
  return { label: 'Active', className: 'bg-slate-100 text-slate-600' };
}

export default function VehiclesPage({ initialSelectedVehicleId, readOnly = false }: VehiclesPageProps) {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('all');

  const [expandedVehicleId, setExpandedVehicleId] = useState<number | null>(initialSelectedVehicleId ?? null);
  const [tasksByVehicle, setTasksByVehicle] = useState<Record<number, VehicleTask[]>>({});
  const [tasksLoading, setTasksLoading] = useState<number | null>(null);

  const [addVehicleModalOpen, setAddVehicleModalOpen] = useState(false);
  const [vehicleForm, setVehicleForm] = useState(emptyVehicleForm);
  const [savingVehicle, setSavingVehicle] = useState(false);
  const [vehicleFormError, setVehicleFormError] = useState<string | null>(null);

  const [addTaskVehicleId, setAddTaskVehicleId] = useState<number | null>(null);
  const [taskForm, setTaskForm] = useState(emptyTaskForm);
  const [savingTask, setSavingTask] = useState(false);
  const [taskFormError, setTaskFormError] = useState<string | null>(null);

  const [editingTask, setEditingTask] = useState<VehicleTask | null>(null);
  const [editTaskForm, setEditTaskForm] = useState({ registration_date: '', expiry_date: '', reminder_days: '30', frequency_days: '365' });
  const [savingEditTask, setSavingEditTask] = useState(false);

  const [busyTaskId, setBusyTaskId] = useState<number | null>(null);

  useEffect(() => {
    fetchVehicles();
  }, []);

  useEffect(() => {
    if (initialSelectedVehicleId) {
      fetchTasksForVehicle(initialSelectedVehicleId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialSelectedVehicleId]);

  async function fetchVehicles() {
    setLoading(true);
    try {
      const response = await fetch('/api/vehicles');
      if (!response.ok) throw new Error(`Failed to load vehicles: ${response.statusText}`);
      const json: Vehicle[] = await response.json();
      setVehicles(json);
      setError(null);
    } catch (fetchError) {
      const message = fetchError instanceof Error ? fetchError.message : 'Unknown error';
      console.error('Error fetching vehicles:', fetchError);
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  async function fetchTasksForVehicle(vehicleId: number) {
    setTasksLoading(vehicleId);
    try {
      const response = await fetch(`/api/vehicles/${vehicleId}/tasks`);
      if (!response.ok) throw new Error(`Failed to load tasks: ${response.statusText}`);
      const json: VehicleTask[] = await response.json();
      setTasksByVehicle((prev) => ({ ...prev, [vehicleId]: json }));
    } catch (fetchError) {
      console.error('Error fetching vehicle tasks:', fetchError);
    } finally {
      setTasksLoading(null);
    }
  }

  function toggleVehicle(vehicle: Vehicle) {
    if (expandedVehicleId === vehicle.id) {
      setExpandedVehicleId(null);
      return;
    }
    setExpandedVehicleId(vehicle.id);
    fetchTasksForVehicle(vehicle.id);
  }

  async function handleAddVehicle() {
    if (!vehicleForm.vehicle_no.trim() || !vehicleForm.vehicle_name.trim()) {
      setVehicleFormError('Vehicle number and vehicle name are required');
      return;
    }
    setSavingVehicle(true);
    setVehicleFormError(null);
    try {
      const response = await fetch('/api/vehicles/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(vehicleForm),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json?.error || 'Failed to add vehicle');
      setAddVehicleModalOpen(false);
      setVehicleForm(emptyVehicleForm);
      await fetchVehicles();
    } catch (submitError) {
      setVehicleFormError(submitError instanceof Error ? submitError.message : 'Failed to add vehicle');
    } finally {
      setSavingVehicle(false);
    }
  }

  async function handleDeleteVehicle(vehicle: Vehicle) {
    if (!window.confirm(`Delete vehicle ${vehicle.vehicle_no} - ${vehicle.vehicle_name}? This removes all its tasks too.`)) {
      return;
    }
    try {
      const response = await fetch(`/api/vehicles/${vehicle.id}`, { method: 'DELETE' });
      const json = await response.json();
      if (!response.ok) throw new Error(json?.error || 'Failed to delete vehicle');
      if (expandedVehicleId === vehicle.id) setExpandedVehicleId(null);
      await fetchVehicles();
    } catch (deleteError) {
      window.alert(deleteError instanceof Error ? deleteError.message : 'Failed to delete vehicle');
    }
  }

  async function handleAddTask() {
    if (!addTaskVehicleId) return;
    if (!taskForm.task_name.trim()) {
      setTaskFormError('Task name is required');
      return;
    }
    setSavingTask(true);
    setTaskFormError(null);
    try {
      const response = await fetch(`/api/vehicles/${addTaskVehicleId}/tasks/add`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(taskForm),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json?.error || 'Failed to add task');
      setAddTaskVehicleId(null);
      setTaskForm(emptyTaskForm);
      await fetchTasksForVehicle(addTaskVehicleId);
      await fetchVehicles();
    } catch (submitError) {
      setTaskFormError(submitError instanceof Error ? submitError.message : 'Failed to add task');
    } finally {
      setSavingTask(false);
    }
  }

  function openEditTask(task: VehicleTask) {
    setEditingTask(task);
    setEditTaskForm({
      registration_date: task.registration_date ? task.registration_date.slice(0, 10) : '',
      expiry_date: task.expiry_date ? task.expiry_date.slice(0, 10) : '',
      reminder_days: String(task.reminder_days ?? 30),
      frequency_days: String(task.frequency_days ?? 365),
    });
  }

  async function handleSaveEditTask() {
    if (!editingTask) return;
    setSavingEditTask(true);
    try {
      const response = await fetch(`/api/vehicles/tasks/${editingTask.id}/update`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          registration_date: editTaskForm.registration_date || null,
          expiry_date: editTaskForm.expiry_date || null,
          reminder_days: Number(editTaskForm.reminder_days) || 30,
          frequency_days: Number(editTaskForm.frequency_days) || 365,
        }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json?.error || 'Failed to update task');
      setEditingTask(null);
      await fetchTasksForVehicle(editingTask.vehicle_id);
      await fetchVehicles();
    } catch (updateError) {
      window.alert(updateError instanceof Error ? updateError.message : 'Failed to update task');
    } finally {
      setSavingEditTask(false);
    }
  }

  async function handleCompleteTask(task: VehicleTask) {
    setBusyTaskId(task.id);
    try {
      const response = await fetch(`/api/vehicles/tasks/${task.id}/complete`, { method: 'PUT' });
      const json = await response.json();
      if (!response.ok) throw new Error(json?.error || 'Failed to renew task');
      await fetchTasksForVehicle(task.vehicle_id);
      await fetchVehicles();
    } catch (completeError) {
      window.alert(completeError instanceof Error ? completeError.message : 'Failed to renew task');
    } finally {
      setBusyTaskId(null);
    }
  }

  async function handleDeleteTask(task: VehicleTask) {
    if (!window.confirm(`Delete task "${task.task_name}"?`)) return;
    setBusyTaskId(task.id);
    try {
      const response = await fetch(`/api/vehicles/tasks/${task.id}`, { method: 'DELETE' });
      const json = await response.json();
      if (!response.ok) throw new Error(json?.error || 'Failed to delete task');
      await fetchTasksForVehicle(task.vehicle_id);
      await fetchVehicles();
    } catch (deleteError) {
      window.alert(deleteError instanceof Error ? deleteError.message : 'Failed to delete task');
    } finally {
      setBusyTaskId(null);
    }
  }

  const departmentOptions = [...new Set(vehicles.map((v) => v.department).filter((d): d is string => Boolean(d)))].sort();

  const filteredVehicles = vehicles.filter((vehicle) => {
    if (departmentFilter !== 'all' && vehicle.department !== departmentFilter) return false;
    if (search.trim()) {
      const term = search.trim().toLowerCase();
      const matchesNo = vehicle.vehicle_no?.toLowerCase().includes(term);
      const matchesName = vehicle.vehicle_name?.toLowerCase().includes(term);
      if (!matchesNo && !matchesName) return false;
    }
    return true;
  });

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
          <p className="font-semibold">Failed to load vehicles</p>
          <p className="text-sm mt-2">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Vehicles</h1>
          <p className="text-slate-500 mt-1">Track vehicle documents, insurance, and service renewals</p>
        </div>
        {!readOnly && (
          <button
            onClick={() => {
              setVehicleForm(emptyVehicleForm);
              setVehicleFormError(null);
              setAddVehicleModalOpen(true);
            }}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg font-medium text-sm bg-gradient-to-r from-cyan-500 to-blue-600 text-white hover:shadow-lg transition-shadow"
          >
            <Plus size={18} />
            Add Vehicle
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <select
          value={departmentFilter}
          onChange={(e) => setDepartmentFilter(e.target.value)}
          className="px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white text-slate-600 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
        >
          <option value="all">All Departments</option>
          {departmentOptions.map((dept) => (
            <option key={dept} value={dept}>{dept}</option>
          ))}
        </select>
        <div className="relative sm:w-72">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by vehicle number or name..."
            className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
          />
        </div>
      </div>

      {/* Vehicle cards */}
      {filteredVehicles.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-64 bg-white rounded-xl shadow-sm border border-slate-200">
          <Car size={40} className="text-slate-300 mb-3" />
          <p className="text-slate-500">No vehicles found</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredVehicles.map((vehicle) => {
            const isExpanded = expandedVehicleId === vehicle.id;
            const tasks = tasksByVehicle[vehicle.id] || [];
            return (
              <div key={vehicle.id} className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <button
                  type="button"
                  onClick={() => toggleVehicle(vehicle)}
                  className="w-full flex items-center justify-between gap-4 p-5 text-left hover:bg-slate-50 transition-colors"
                >
                  <div className="flex items-center gap-4 min-w-0">
                    <div className="w-10 h-10 rounded-lg bg-cyan-500/10 flex items-center justify-center flex-shrink-0">
                      <Car size={18} className="text-cyan-600" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-bold text-slate-800">{vehicle.vehicle_no}</p>
                      <p className="text-sm text-slate-600 truncate">
                        {vehicle.vehicle_name} {vehicle.vehicle_type ? `· ${vehicle.vehicle_type}` : ''}
                      </p>
                      <p className="text-xs text-slate-400 mt-0.5">
                        {vehicle.department || 'No department'} {vehicle.incharge ? `· Incharge: ${vehicle.incharge}` : ''}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 flex-shrink-0">
                    <div className="text-right text-xs text-slate-500 hidden sm:block">
                      <p>{vehicle.total_tasks} task{vehicle.total_tasks === 1 ? '' : 's'}</p>
                      <p className="text-orange-600">{vehicle.expiring_tasks} expiring soon</p>
                      <p className="text-red-600">{vehicle.expired_tasks} overdue</p>
                    </div>
                    {!readOnly && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteVehicle(vehicle);
                        }}
                        className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        title="Delete vehicle"
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
                    {isExpanded ? <ChevronUp size={18} className="text-slate-400" /> : <ChevronDown size={18} className="text-slate-400" />}
                  </div>
                </button>

                {isExpanded && (
                  <div className="border-t border-slate-200 p-5 space-y-4">
                    {!readOnly && (
                      <div className="flex justify-end">
                        <button
                          onClick={() => {
                            setAddTaskVehicleId(vehicle.id);
                            setTaskForm(emptyTaskForm);
                            setTaskFormError(null);
                          }}
                          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition-colors"
                        >
                          <Plus size={14} />
                          Add Task
                        </button>
                      </div>
                    )}

                    {tasksLoading === vehicle.id ? (
                      <div className="flex items-center justify-center py-8">
                        <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
                      </div>
                    ) : tasks.length === 0 ? (
                      <p className="text-sm text-slate-500 text-center py-4">No tasks yet for this vehicle.</p>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="bg-slate-50 border-b border-slate-200">
                              <th className="text-left px-4 py-2 text-xs font-semibold text-slate-500 uppercase">Task Type</th>
                              <th className="text-left px-4 py-2 text-xs font-semibold text-slate-500 uppercase">Registration</th>
                              <th className="text-left px-4 py-2 text-xs font-semibold text-slate-500 uppercase">Expiry</th>
                              <th className="text-left px-4 py-2 text-xs font-semibold text-slate-500 uppercase">Reminder</th>
                              <th className="text-left px-4 py-2 text-xs font-semibold text-slate-500 uppercase">Status</th>
                              {!readOnly && <th className="text-left px-4 py-2 text-xs font-semibold text-slate-500 uppercase">Actions</th>}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {tasks.map((task) => {
                              const badge = getStatusBadge(task);
                              return (
                                <tr key={task.id}>
                                  <td className="px-4 py-3">
                                    <p className="font-medium text-slate-800">{task.task_type}</p>
                                    {task.task_name !== task.task_type && (
                                      <p className="text-xs text-slate-400">{task.task_name}</p>
                                    )}
                                  </td>
                                  <td className="px-4 py-3 text-slate-600">
                                    {task.registration_date ? new Date(task.registration_date).toLocaleDateString() : '-'}
                                  </td>
                                  <td className={`px-4 py-3 ${getExpiryColorClass(task.expiry_date)}`}>
                                    {task.expiry_date ? new Date(task.expiry_date).toLocaleDateString() : '-'}
                                  </td>
                                  <td className="px-4 py-3 text-slate-600">{task.reminder_days ?? '-'} days</td>
                                  <td className="px-4 py-3">
                                    <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${badge.className}`}>
                                      {badge.label}
                                    </span>
                                  </td>
                                  {!readOnly && (
                                    <td className="px-4 py-3">
                                      <div className="flex items-center gap-1.5">
                                        <button
                                          onClick={() => openEditTask(task)}
                                          className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
                                          title="Edit dates"
                                        >
                                          <Pencil size={14} />
                                        </button>
                                        {task.status !== 'completed' && (
                                          <button
                                            onClick={() => handleCompleteTask(task)}
                                            disabled={busyTaskId === task.id}
                                            className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors disabled:opacity-50"
                                            title="Mark renewed"
                                          >
                                            {busyTaskId === task.id ? (
                                              <Loader2 size={14} className="animate-spin" />
                                            ) : (
                                              <CheckCircle2 size={14} />
                                            )}
                                          </button>
                                        )}
                                        <button
                                          onClick={() => handleDeleteTask(task)}
                                          disabled={busyTaskId === task.id}
                                          className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                                          title="Delete task"
                                        >
                                          <Trash2 size={14} />
                                        </button>
                                      </div>
                                    </td>
                                  )}
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Add Vehicle Modal */}
      <Modal isOpen={addVehicleModalOpen} onClose={() => setAddVehicleModalOpen(false)} title="Add Vehicle" size="lg">
        <div className="space-y-4">
          {vehicleFormError && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{vehicleFormError}</div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Vehicle No</label>
              <input
                type="text"
                value={vehicleForm.vehicle_no}
                onChange={(e) => setVehicleForm({ ...vehicleForm, vehicle_no: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Vehicle Name</label>
              <input
                type="text"
                value={vehicleForm.vehicle_name}
                onChange={(e) => setVehicleForm({ ...vehicleForm, vehicle_name: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Vehicle Type</label>
              <input
                type="text"
                value={vehicleForm.vehicle_type}
                onChange={(e) => setVehicleForm({ ...vehicleForm, vehicle_type: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Model</label>
              <input
                type="text"
                value={vehicleForm.model}
                onChange={(e) => setVehicleForm({ ...vehicleForm, model: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">CR No</label>
              <input
                type="text"
                value={vehicleForm.cr_no}
                onChange={(e) => setVehicleForm({ ...vehicleForm, cr_no: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Department</label>
              <input
                type="text"
                value={vehicleForm.department}
                onChange={(e) => setVehicleForm({ ...vehicleForm, department: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Site Location</label>
              <input
                type="text"
                value={vehicleForm.site_location}
                onChange={(e) => setVehicleForm({ ...vehicleForm, site_location: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Incharge</label>
              <input
                type="text"
                value={vehicleForm.incharge}
                onChange={(e) => setVehicleForm({ ...vehicleForm, incharge: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-1">Remarks</label>
              <textarea
                value={vehicleForm.remarks}
                onChange={(e) => setVehicleForm({ ...vehicleForm, remarks: e.target.value })}
                rows={2}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              onClick={() => setAddVehicleModalOpen(false)}
              className="px-4 py-2 text-sm font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleAddVehicle}
              disabled={savingVehicle}
              className="flex items-center gap-2 px-4 py-2 bg-[#0f172a] text-white text-sm font-medium rounded-lg hover:bg-slate-800 transition-colors disabled:opacity-50"
            >
              {savingVehicle && <Loader2 size={14} className="animate-spin" />}
              Add Vehicle
            </button>
          </div>
        </div>
      </Modal>

      {/* Add Task Modal */}
      <Modal isOpen={addTaskVehicleId !== null} onClose={() => setAddTaskVehicleId(null)} title="Add Task">
        <div className="space-y-4">
          {taskFormError && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{taskFormError}</div>
          )}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Task Type</label>
            <select
              value={taskForm.task_type}
              onChange={(e) => setTaskForm({ ...taskForm, task_type: e.target.value, task_name: e.target.value })}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
            >
              {TASK_TYPES.map((type) => (
                <option key={type} value={type}>{type}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Task Name</label>
            <input
              type="text"
              value={taskForm.task_name}
              onChange={(e) => setTaskForm({ ...taskForm, task_name: e.target.value })}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Registration Date</label>
              <input
                type="date"
                value={taskForm.registration_date}
                onChange={(e) => setTaskForm({ ...taskForm, registration_date: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Expiry Date</label>
              <input
                type="date"
                value={taskForm.expiry_date}
                onChange={(e) => setTaskForm({ ...taskForm, expiry_date: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Reminder Days Before Expiry</label>
            <input
              type="number"
              value={taskForm.reminder_days}
              onChange={(e) => setTaskForm({ ...taskForm, reminder_days: e.target.value })}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Frequency (days)</label>
            <input
              type="number"
              value={taskForm.frequency_days}
              onChange={(e) => setTaskForm({ ...taskForm, frequency_days: e.target.value })}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
              placeholder="365"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              onClick={() => setAddTaskVehicleId(null)}
              className="px-4 py-2 text-sm font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleAddTask}
              disabled={savingTask}
              className="flex items-center gap-2 px-4 py-2 bg-[#0f172a] text-white text-sm font-medium rounded-lg hover:bg-slate-800 transition-colors disabled:opacity-50"
            >
              {savingTask && <Loader2 size={14} className="animate-spin" />}
              Add Task
            </button>
          </div>
        </div>
      </Modal>

      {/* Edit Task Dates Modal */}
      <Modal isOpen={editingTask !== null} onClose={() => setEditingTask(null)} title="Edit Task Dates">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Registration Date</label>
              <input
                type="date"
                value={editTaskForm.registration_date}
                onChange={(e) => setEditTaskForm({ ...editTaskForm, registration_date: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Expiry Date</label>
              <input
                type="date"
                value={editTaskForm.expiry_date}
                onChange={(e) => setEditTaskForm({ ...editTaskForm, expiry_date: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Reminder Days Before Expiry</label>
            <input
              type="number"
              value={editTaskForm.reminder_days}
              onChange={(e) => setEditTaskForm({ ...editTaskForm, reminder_days: e.target.value })}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Frequency (days)</label>
            <input
              type="number"
              value={editTaskForm.frequency_days}
              onChange={(e) => setEditTaskForm({ ...editTaskForm, frequency_days: e.target.value })}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
              placeholder="365"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              onClick={() => setEditingTask(null)}
              className="px-4 py-2 text-sm font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSaveEditTask}
              disabled={savingEditTask}
              className="flex items-center gap-2 px-4 py-2 bg-[#0f172a] text-white text-sm font-medium rounded-lg hover:bg-slate-800 transition-colors disabled:opacity-50"
            >
              {savingEditTask && <Loader2 size={14} className="animate-spin" />}
              Save
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
