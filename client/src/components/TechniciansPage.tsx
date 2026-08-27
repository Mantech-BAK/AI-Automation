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
  ExternalLink,
  FileText,
  Truck,
  Rocket,
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
  emp_id?: string | null;
  type_id?: number | null;
  designation_id?: number | null;
  religion_id?: number | null;
  origin_id?: number | null;
  contact_number?: string | null;
  task_assigned_count?: number;
  task_complete_count?: number;
  type_name?: string | null;
  designation_name?: string | null;
  reports_to_emp_id?: string | null;
  reports_to_name?: string | null;
}

interface LookupOption {
  id: string;
  name: string;
}

interface TechniciansPageProps {
  onViewEmployee?: (empId: string) => void;
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

type TechnicianTab = 'maintenance' | 'documentation' | 'vehicles';

const TECHNICIAN_TABS: { id: TechnicianTab; label: string; icon: typeof Wrench }[] = [
  { id: 'maintenance', label: 'Maintenance Technicians', icon: Wrench },
  { id: 'documentation', label: 'Documentation Technicians', icon: FileText },
  { id: 'vehicles', label: 'Vehicles', icon: Truck },
];

interface ResponsiblePerson {
  responsible_person: string;
  total_documents: number;
  expiring_soon: number;
  overdue: number;
}

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

export default function TechniciansPage({ onViewEmployee }: TechniciansPageProps) {
  const [activeTab, setActiveTab] = useState<TechnicianTab>('maintenance');
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [responsiblePersons, setResponsiblePersons] = useState<ResponsiblePerson[]>([]);
  const [responsiblePersonsLoading, setResponsiblePersonsLoading] = useState(true);
  const [responsiblePersonsError, setResponsiblePersonsError] = useState<string | null>(null);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [employeeTypeOptions, setEmployeeTypeOptions] = useState<LookupOption[]>([]);
  const [designationOptions, setDesignationOptions] = useState<LookupOption[]>([]);
  const [lookupOptionsLoading, setLookupOptionsLoading] = useState(false);

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    type_of_service: '',
    emp_id: '',
    type_id: '',
    designation_id: '',
    contact_number: '',
  });

  const [taskModalOpen, setTaskModalOpen] = useState(false);
  const [taskModalTechnician, setTaskModalTechnician] = useState<Technician | null>(null);
  const [taskModalStatus, setTaskModalStatus] = useState<TaskModalStatus>('open');
  const [taskModalTasks, setTaskModalTasks] = useState<TechnicianTask[]>([]);
  const [taskModalLoading, setTaskModalLoading] = useState(false);
  const [taskModalError, setTaskModalError] = useState<string | null>(null);

  useEffect(() => {
    fetchTechnicians();
    fetchResponsiblePersons();
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

  async function fetchResponsiblePersons() {
    try {
      const response = await fetch('/api/dashboard/documents/responsible-persons');
      if (!response.ok) {
        throw new Error(`Failed to load responsible persons: ${response.statusText}`);
      }
      const json: ResponsiblePerson[] = await response.json();
      setResponsiblePersons(
        json.map((rp) => ({
          responsible_person: rp.responsible_person,
          total_documents: Number(rp.total_documents),
          expiring_soon: Number(rp.expiring_soon),
          overdue: Number(rp.overdue),
        }))
      );
    } catch (fetchError) {
      const message = fetchError instanceof Error ? fetchError.message : 'Unknown error';
      console.error('Error fetching responsible persons:', fetchError);
      setResponsiblePersonsError(message);
    } finally {
      setResponsiblePersonsLoading(false);
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
        emp_id: formData.emp_id || null,
        type_id: formData.type_id ? Number(formData.type_id) : null,
        designation_id: formData.designation_id ? Number(formData.designation_id) : null,
        contact_number: formData.contact_number || null,
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
      emp_id: '',
      type_id: '',
      designation_id: '',
      contact_number: '',
    });
  }

  async function fetchLookupOptions() {
    setLookupOptionsLoading(true);
    try {
      const [employeeTypesRes, designationsRes] = await Promise.all([
        fetch('/api/dashboard/employee-types'),
        fetch('/api/dashboard/designations'),
      ]);
      if (!employeeTypesRes.ok || !designationsRes.ok) {
        throw new Error('Failed to load lookup options');
      }
      setEmployeeTypeOptions(await employeeTypesRes.json());
      setDesignationOptions(await designationsRes.json());
    } catch (fetchError) {
      console.error('Error fetching lookup options:', fetchError);
    } finally {
      setLookupOptionsLoading(false);
    }
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
              fetchLookupOptions();
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

      {/* Tab Switcher */}
      <div className="flex items-center gap-2 flex-wrap">
        {TECHNICIAN_TABS.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                activeTab === tab.id
                  ? 'bg-[#0f172a] text-white'
                  : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
              }`}
            >
              <Icon size={16} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {activeTab === 'vehicles' && (
        <div className="flex flex-col items-center justify-center h-64 bg-white rounded-xl shadow-sm border border-slate-200">
          <Rocket size={40} className="text-slate-300 mb-3" />
          <p className="text-lg font-semibold text-slate-600">Coming Soon</p>
        </div>
      )}

      {activeTab === 'documentation' && (
        responsiblePersonsLoading ? (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
          </div>
        ) : responsiblePersonsError ? (
          <div className="flex items-center justify-center h-64">
            <div className="text-red-600 bg-red-50 border border-red-200 rounded-xl p-6">
              <p className="font-semibold">Failed to load responsible persons</p>
              <p className="text-sm mt-2">{responsiblePersonsError}</p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {responsiblePersons.length === 0 ? (
              <div className="col-span-full bg-white rounded-xl p-12 text-center border border-slate-200">
                <FileText size={40} className="mx-auto text-slate-300 mb-2" />
                <p className="text-slate-500">No responsible persons found for documents.</p>
              </div>
            ) : (
              responsiblePersons.map((rp) => (
                <div key={rp.responsible_person} className="bg-white rounded-xl p-5 border border-slate-200 hover:shadow-md transition-shadow">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-cyan-400 to-blue-500 flex items-center justify-center text-white font-semibold text-lg">
                      {rp.responsible_person.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <h3 className="font-semibold text-slate-800">{rp.responsible_person}</h3>
                      <p className="text-xs text-slate-400">Document Responsible Person</p>
                    </div>
                  </div>
                  <div className="space-y-2 text-sm pt-3 border-t border-slate-100">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">Total Documents</span>
                      <span className="font-semibold text-slate-800">{rp.total_documents}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">Expiring within 30 days</span>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${rp.expiring_soon > 0 ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-500'}`}>
                        {rp.expiring_soon}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">Overdue</span>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${rp.overdue > 0 ? 'bg-red-600 text-white' : 'bg-slate-100 text-slate-500'}`}>
                        {rp.overdue}
                      </span>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )
      )}

      {activeTab === 'maintenance' && (
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
                    {tech.emp_id && (
                      <p className="text-xs text-slate-400">{tech.emp_id}</p>
                    )}
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
                {tech.contact_number && (
                  <div className="text-xs text-slate-500">Contact: {tech.contact_number}</div>
                )}
                {(tech.designation_name || tech.type_name) && (
                  <div className="flex items-center gap-2 flex-wrap text-xs">
                    {tech.designation_name && (
                      <span className="px-2 py-0.5 rounded-full font-medium bg-indigo-100 text-indigo-700">
                        {tech.designation_name}
                      </span>
                    )}
                    {tech.type_name && (
                      <span className="px-2 py-0.5 rounded-full font-medium bg-slate-100 text-slate-600">
                        {tech.type_name}
                      </span>
                    )}
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
                <div className="text-xs text-slate-500">
                  Assigned: {tech.task_assigned_count ?? 0} &middot; Completed: {tech.task_complete_count ?? 0}
                </div>
                {tech.reports_to_name && (
                  <div className="text-xs text-slate-500">
                    Reports To: {tech.reports_to_name} ({tech.reports_to_emp_id})
                  </div>
                )}
                {tech.emp_id && onViewEmployee && (
                  <button
                    type="button"
                    onClick={() => onViewEmployee(tech.emp_id as string)}
                    className="flex items-center gap-1 text-xs font-medium text-cyan-600 hover:text-cyan-700 transition-colors pt-1"
                  >
                    <ExternalLink size={12} />
                    View in Employee Master
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>
      )}

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
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Employee ID</label>
            <input
              type="text"
              value={formData.emp_id}
              onChange={(e) => setFormData({ ...formData, emp_id: e.target.value })}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
              placeholder="e.g., EMP011"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Employee Type</label>
            <select
              value={formData.type_id}
              onChange={(e) => setFormData({ ...formData, type_id: e.target.value })}
              disabled={lookupOptionsLoading}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent disabled:opacity-50"
            >
              <option value="">{lookupOptionsLoading ? 'Loading...' : 'Select employee type'}</option>
              {employeeTypeOptions.map((option) => (
                <option key={option.id} value={option.id}>{option.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Designation</label>
            <select
              value={formData.designation_id}
              onChange={(e) => setFormData({ ...formData, designation_id: e.target.value })}
              disabled={lookupOptionsLoading}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent disabled:opacity-50"
            >
              <option value="">{lookupOptionsLoading ? 'Loading...' : 'Select designation'}</option>
              {designationOptions.map((option) => (
                <option key={option.id} value={option.id}>{option.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Contact Number</label>
            <input
              type="text"
              value={formData.contact_number}
              onChange={(e) => setFormData({ ...formData, contact_number: e.target.value })}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
              placeholder="e.g., +97336100011"
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
