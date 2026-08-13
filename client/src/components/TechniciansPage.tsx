import { useEffect, useState } from 'react';
import {
  Users,
  Loader2,
  Plus,
  Save,
  Mail,
  MapPin,
  ClipboardList,
  CheckCircle2,
  Wrench,
} from 'lucide-react';
import Modal from './Modal';

interface Technician {
  id: string;
  name: string;
  email?: string | null;
  type_of_service: string;
  open_task_count?: number;
  completed_task_count?: number;
  current_site?: string | null;
  current_task?: string | null;
}

interface TechnicianTask {
  id: string;
  equipment_name?: string | null;
  site_location?: string | null;
  technician_name?: string | null;
  status?: string;
  due_date?: string | null;
}

type TaskModalStatus = 'open' | 'completed';

function getTaskStatusColor(status?: string) {
  switch (status) {
    case 'completed': return 'bg-emerald-100 text-emerald-700';
    case 'open': return 'bg-amber-100 text-amber-700';
    case 'pending': return 'bg-amber-100 text-amber-700';
    case 'approved': return 'bg-cyan-100 text-cyan-700';
    case 'rejected': return 'bg-red-100 text-red-700';
    default: return 'bg-slate-100 text-slate-600';
  }
}

export default function TechniciansPage() {
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    type_of_service: '',
  });

  const [taskModalOpen, setTaskModalOpen] = useState(false);
  const [taskModalTechnician, setTaskModalTechnician] = useState<Technician | null>(null);
  const [taskModalStatus, setTaskModalStatus] = useState<TaskModalStatus>('open');
  const [taskModalTasks, setTaskModalTasks] = useState<TechnicianTask[]>([]);
  const [taskModalLoading, setTaskModalLoading] = useState(false);
  const [taskModalError, setTaskModalError] = useState<string | null>(null);

  useEffect(() => {
    fetchTechnicians();
  }, []);

  useEffect(() => {
    function handleTechnicianDataUpdated() {
      fetchTechnicians();
    }
    window.addEventListener('technician-data-updated', handleTechnicianDataUpdated);
    return () => {
      window.removeEventListener('technician-data-updated', handleTechnicianDataUpdated);
    };
  }, []);

  async function fetchTechnicians() {
    try {
      const response = await fetch('/api/dashboard/technicians');
      if (!response.ok) {
        throw new Error(`Failed to load technicians: ${response.statusText}`);
      }
      const json: Technician[] = await response.json();
      setTechnicians(json);
    } catch (fetchError) {
      const message = fetchError instanceof Error ? fetchError.message : 'Unknown error';
      console.error('Error fetching technicians:', fetchError);
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  async function handleShowTasks(tech: Technician, status: TaskModalStatus) {
    setTaskModalTechnician(tech);
    setTaskModalStatus(status);
    setTaskModalOpen(true);
    setTaskModalLoading(true);
    setTaskModalError(null);
    setTaskModalTasks([]);
    try {
      const response = await fetch(`/api/dashboard/tasks?technician_id=${tech.id}`);
      if (!response.ok) {
        throw new Error(`Failed to load tasks: ${response.statusText}`);
      }
      const json: TechnicianTask[] = await response.json();
      setTaskModalTasks(json.filter((task) => task.status === status));
    } catch (fetchError) {
      const message = fetchError instanceof Error ? fetchError.message : 'Unknown error';
      console.error('Error fetching technician tasks:', fetchError);
      setTaskModalError(message);
    } finally {
      setTaskModalLoading(false);
    }
  }

  async function handleSave() {
    if (!formData.name.trim() || !formData.email.trim() || !formData.type_of_service.trim()) return;

    setSaving(true);
    try {
      const data = {
        name: formData.name,
        email: formData.email,
        type_of_service: formData.type_of_service,
      };

      const response = await fetch('/api/dashboard/technicians/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!response.ok) {
        throw new Error(`Failed to save technician: ${response.statusText}`);
      }

      setAddModalOpen(false);
      resetForm();
      fetchTechnicians();
    } catch (fetchError) {
      console.error('Error saving technician:', fetchError);
    } finally {
      setSaving(false);
    }
  }

  function resetForm() {
    setFormData({
      name: '',
      email: '',
      type_of_service: '',
    });
  }

  const isAvailable = (tech: Technician) => !tech.current_site;

  const getLocationBadgeColor = (tech: Technician) =>
    isAvailable(tech) ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700';

  const getLocationLabel = (tech: Technician) => (isAvailable(tech) ? 'Available' : tech.current_site);

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
          <p className="font-semibold">Failed to load technicians</p>
          <p className="text-sm mt-2">{error}</p>
        </div>
      </div>
    );
  }

  const assignedCount = technicians.filter((t) => !isAvailable(t)).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Technicians</h1>
          <p className="text-slate-500 mt-1">Manage your maintenance staff</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => {
              resetForm();
              setAddModalOpen(true);
            }}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg font-medium text-sm bg-gradient-to-r from-cyan-500 to-blue-600 text-white hover:shadow-lg transition-shadow"
          >
            <Plus size={18} />
            Add Technician
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl p-4 border border-slate-200">
          <p className="text-sm text-slate-500">Total Technicians</p>
          <p className="text-2xl font-bold text-slate-800">{technicians.length}</p>
        </div>
        <div className="bg-white rounded-xl p-4 border border-slate-200">
          <p className="text-sm text-slate-500">Currently Assigned</p>
          <p className="text-2xl font-bold text-cyan-600">{assignedCount}</p>
        </div>
      </div>

      {/* Technicians Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {technicians.length === 0 ? (
          <div className="col-span-full bg-white rounded-xl p-12 text-center border border-slate-200">
            <Users size={40} className="mx-auto text-slate-300 mb-2" />
            <p className="text-slate-500">No technicians found. Add your first technician to get started.</p>
          </div>
        ) : (
          technicians.map((tech) => (
            <div key={tech.id} className="bg-white rounded-xl p-5 border border-slate-200 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-gradient-to-br from-cyan-400 to-blue-500 flex items-center justify-center text-white font-semibold text-lg">
                    {tech.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                  </div>
                  <div>
                    <h3 className="font-semibold text-slate-800">{tech.name}</h3>
                    {tech.type_of_service && (
                      <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-cyan-100 text-cyan-700 capitalize">
                        {tech.type_of_service}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="space-y-2 text-sm text-slate-500 mt-3 pt-3 border-t border-slate-100">
                {tech.email && (
                  <div className="flex items-center gap-2">
                    <Mail size={14} />
                    <span className="truncate">{tech.email}</span>
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <MapPin size={14} />
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getLocationBadgeColor(tech)}`}>
                    {getLocationLabel(tech)}
                  </span>
                </div>
                {tech.current_task && (
                  <div className="text-xs text-slate-500 pl-6">
                    Working on: {tech.current_task}
                  </div>
                )}
                <div className="flex items-center gap-2 flex-wrap">
                  <ClipboardList size={14} />
                  <button
                    type="button"
                    onClick={() => handleShowTasks(tech, 'open')}
                    className="px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700 hover:bg-amber-200 transition-colors"
                  >
                    {tech.open_task_count ?? 0} open task{tech.open_task_count === 1 ? '' : 's'}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleShowTasks(tech, 'completed')}
                    className="px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700 hover:bg-emerald-200 transition-colors"
                  >
                    {tech.completed_task_count ?? 0} completed
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Add Modal */}
      <Modal
        isOpen={addModalOpen}
        onClose={() => setAddModalOpen(false)}
        title="Add New Technician"
        size="md"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Name *</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
              placeholder="Enter technician name"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Email *</label>
            <input
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
              placeholder="Enter email"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Type of Service *</label>
            <input
              type="text"
              value={formData.type_of_service}
              onChange={(e) => setFormData({ ...formData, type_of_service: e.target.value })}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
              placeholder="e.g., Electrical, Mechanical, General"
            />
          </div>
          <div className="flex justify-end gap-3 pt-4">
            <button
              onClick={() => setAddModalOpen(false)}
              className="px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={!formData.name.trim() || !formData.email.trim() || !formData.type_of_service.trim() || saving}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-gradient-to-r from-cyan-500 to-blue-600 text-white rounded-lg hover:shadow-lg transition-shadow disabled:opacity-50"
            >
              {saving ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save size={16} />
                  Save
                </>
              )}
            </button>
          </div>
        </div>
      </Modal>

      {/* Technician Tasks Modal */}
      <Modal
        isOpen={taskModalOpen}
        onClose={() => setTaskModalOpen(false)}
        title={`${taskModalTechnician?.name || 'Technician'} - ${taskModalStatus === 'open' ? 'Open' : 'Completed'} Tasks`}
        size="lg"
      >
        <div className="space-y-3">
          {taskModalLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
            </div>
          ) : taskModalError ? (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{taskModalError}</p>
          ) : taskModalTasks.length === 0 ? (
            <div className="text-center py-8">
              <Wrench size={40} className="mx-auto text-slate-300 mb-2" />
              <p className="text-slate-500">
                No {taskModalStatus === 'open' ? 'open' : 'completed'} tasks for this technician.
              </p>
            </div>
          ) : (
            taskModalTasks.map((task) => (
              <div key={task.id} className="flex items-center justify-between gap-4 p-3 rounded-lg bg-slate-50 border border-slate-200">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-8 h-8 rounded-lg bg-cyan-500/10 flex items-center justify-center flex-shrink-0">
                    {task.status === 'completed' ? (
                      <CheckCircle2 size={16} className="text-emerald-600" />
                    ) : (
                      <Wrench size={16} className="text-cyan-600" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium text-slate-800 text-sm truncate">{task.equipment_name || 'Untitled'}</p>
                    <p className="text-xs text-slate-500 truncate">{task.site_location || 'No site'}</p>
                  </div>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-xs text-slate-500 mb-1">
                    Due {task.due_date ? new Date(task.due_date).toLocaleDateString() : '-'}
                  </p>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${getTaskStatusColor(task.status)}`}>
                    {task.status || 'unknown'}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </Modal>
    </div>
  );
}
