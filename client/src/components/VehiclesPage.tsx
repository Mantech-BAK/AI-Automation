import { useEffect, useMemo, useState } from 'react';
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

// A vehicle is just an Equipment-type asset tagged with one of these
// categories; its documents (insurance, registration, etc.) are Document-type
// assets linked back via parent_asset_id. Kept in sync with
// utils/vehicleCategories.js on the server.
const VEHICLE_CATEGORIES = ['Light Vehicle', 'Heavy Vehicle', 'Plant Equipment', 'Marine Vessel'];

interface Asset {
  id: number;
  equipment_name: string;
  site_location?: string | null;
  department_id?: number | string | null;
  department_name?: string | null;
  category_id?: number | string | null;
  category_name?: string | null;
  type_id?: number | string | null;
  maintenance_interval_days?: number | null;
  estimated_duration_hours?: number | null;
  last_completed_date?: string | null;
  next_due_date?: string | null;
  registration_date?: string | null;
  expiry_date?: string | null;
  reminder_days?: number | null;
  frequency_days?: number | null;
  tolerance_days?: number | null;
  responsible_person?: string | null;
  remarks?: string | null;
  parent_asset_id?: number | null;
}

interface LookupOption {
  id: string;
  name: string;
}

interface VehiclesPageProps {
  initialSelectedVehicleId?: number | null;
  readOnly?: boolean;
}

const emptyVehicleForm = {
  equipment_name: '',
  category_id: '',
  department_id: '',
  site_location: '',
  maintenance_interval_days: '',
  estimated_duration_hours: '',
  last_completed_date: '',
  responsible_person: '',
  remarks: '',
};

const emptyTaskForm = {
  task_name: '',
  registration_date: '',
  expiry_date: '',
  reminder_days: '30',
  frequency_days: '365',
  tolerance_days: '0',
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

function getStatusBadge(task: Asset): { label: string; className: string } {
  const days = daysUntil(task.expiry_date);
  if (days !== null && days < 0) return { label: 'Expired', className: 'bg-red-100 text-red-700' };
  if (days !== null && days <= 30) return { label: 'Expiring Soon', className: 'bg-orange-100 text-orange-700' };
  return { label: 'Active', className: 'bg-slate-100 text-slate-600' };
}

export default function VehiclesPage({ initialSelectedVehicleId, readOnly = false }: VehiclesPageProps) {
  const [vehicles, setVehicles] = useState<Asset[]>([]);
  const [documents, setDocuments] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('all');

  const [expandedVehicleId, setExpandedVehicleId] = useState<number | null>(initialSelectedVehicleId ?? null);

  const [categoryOptions, setCategoryOptions] = useState<LookupOption[]>([]);
  const [departmentOptions, setDepartmentOptions] = useState<LookupOption[]>([]);
  const [siteOptions, setSiteOptions] = useState<{ id: string; site_name: string }[]>([]);
  const [documentTypeId, setDocumentTypeId] = useState<string | null>(null);
  const [equipmentTypeId, setEquipmentTypeId] = useState<string | null>(null);

  const [addVehicleModalOpen, setAddVehicleModalOpen] = useState(false);
  const [editingVehicle, setEditingVehicle] = useState<Asset | null>(null);
  const [vehicleForm, setVehicleForm] = useState(emptyVehicleForm);
  const [savingVehicle, setSavingVehicle] = useState(false);
  const [vehicleFormError, setVehicleFormError] = useState<string | null>(null);

  const [addTaskVehicleId, setAddTaskVehicleId] = useState<number | null>(null);
  const [taskForm, setTaskForm] = useState(emptyTaskForm);
  const [savingTask, setSavingTask] = useState(false);
  const [taskFormError, setTaskFormError] = useState<string | null>(null);

  const [editingTask, setEditingTask] = useState<Asset | null>(null);
  const [editTaskForm, setEditTaskForm] = useState({ registration_date: '', expiry_date: '', reminder_days: '30', frequency_days: '365', tolerance_days: '0' });
  const [savingEditTask, setSavingEditTask] = useState(false);

  const [busyTaskId, setBusyTaskId] = useState<number | null>(null);

  const vehicleCategoryOptions = useMemo(
    () => categoryOptions.filter((c) => VEHICLE_CATEGORIES.includes(c.name)),
    [categoryOptions]
  );

  useEffect(() => {
    fetchAll();
    fetchLookups();
  }, []);

  async function fetchAll() {
    setLoading(true);
    try {
      const categoriesParam = VEHICLE_CATEGORIES.join(',');
      const [vehiclesRes, documentsRes] = await Promise.all([
        fetch(`/api/dashboard/assets?type=Equipment&categories=${encodeURIComponent(categoriesParam)}`),
        fetch(`/api/dashboard/assets?type=Document&categories=${encodeURIComponent(categoriesParam)}`),
      ]);
      if (!vehiclesRes.ok) throw new Error(`Failed to load vehicles: ${vehiclesRes.statusText}`);
      if (!documentsRes.ok) throw new Error(`Failed to load vehicle documents: ${documentsRes.statusText}`);
      setVehicles(await vehiclesRes.json());
      setDocuments((await documentsRes.json()).filter((d: Asset) => d.parent_asset_id != null));
      setError(null);
    } catch (fetchError) {
      const message = fetchError instanceof Error ? fetchError.message : 'Unknown error';
      console.error('Error fetching vehicles:', fetchError);
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  async function fetchLookups() {
    try {
      const [categoriesRes, typesRes, departmentsRes, sitesRes] = await Promise.all([
        fetch('/api/dashboard/categories'),
        fetch('/api/dashboard/asset-types'),
        fetch('/api/dashboard/departments'),
        fetch('/api/dashboard/sites/list'),
      ]);
      setCategoryOptions(await categoriesRes.json());
      setDepartmentOptions(await departmentsRes.json());
      setSiteOptions(await sitesRes.json());
      const types: LookupOption[] = await typesRes.json();
      setDocumentTypeId(types.find((t) => t.name === 'Document')?.id ?? null);
      setEquipmentTypeId(types.find((t) => t.name === 'Equipment')?.id ?? null);
    } catch (fetchError) {
      console.error('Error fetching lookup options:', fetchError);
    }
  }

  function toggleVehicle(vehicle: Asset) {
    setExpandedVehicleId((prev) => (prev === vehicle.id ? null : vehicle.id));
  }

  function openAddVehicle() {
    setVehicleForm(emptyVehicleForm);
    setVehicleFormError(null);
    setEditingVehicle(null);
    setAddVehicleModalOpen(true);
  }

  function openEditVehicle(vehicle: Asset) {
    setVehicleForm({
      equipment_name: vehicle.equipment_name || '',
      category_id: vehicle.category_id != null ? String(vehicle.category_id) : '',
      department_id: vehicle.department_id != null ? String(vehicle.department_id) : '',
      site_location: vehicle.site_location || '',
      maintenance_interval_days: vehicle.maintenance_interval_days != null ? String(vehicle.maintenance_interval_days) : '',
      estimated_duration_hours: vehicle.estimated_duration_hours != null ? String(vehicle.estimated_duration_hours) : '',
      last_completed_date: vehicle.last_completed_date ? vehicle.last_completed_date.slice(0, 10) : '',
      responsible_person: vehicle.responsible_person || '',
      remarks: vehicle.remarks || '',
    });
    setVehicleFormError(null);
    setEditingVehicle(vehicle);
    setAddVehicleModalOpen(true);
  }

  async function handleSaveVehicle() {
    if (!vehicleForm.equipment_name.trim() || !vehicleForm.category_id) {
      setVehicleFormError('Vehicle name and vehicle type are required');
      return;
    }
    setSavingVehicle(true);
    setVehicleFormError(null);
    try {
      const payload = {
        equipment_name: vehicleForm.equipment_name,
        site_location: vehicleForm.site_location || null,
        maintenance_interval_days: vehicleForm.maintenance_interval_days ? Number(vehicleForm.maintenance_interval_days) : null,
        estimated_duration_hours: vehicleForm.estimated_duration_hours ? Number(vehicleForm.estimated_duration_hours) : null,
        last_completed_date: vehicleForm.last_completed_date || null,
        type_of_service: 'general',
        category_id: Number(vehicleForm.category_id),
        type_id: equipmentTypeId ? Number(equipmentTypeId) : null,
        department_id: vehicleForm.department_id ? Number(vehicleForm.department_id) : null,
        responsible_person: vehicleForm.responsible_person || null,
        remarks: vehicleForm.remarks || null,
      };

      const response = editingVehicle
        ? await fetch(`/api/dashboard/assets/${editingVehicle.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          })
        : await fetch('/api/dashboard/assets/add', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });

      const json = await response.json();
      if (!response.ok) throw new Error(json?.error || 'Failed to save vehicle');
      setAddVehicleModalOpen(false);
      setEditingVehicle(null);
      setVehicleForm(emptyVehicleForm);
      await fetchAll();
    } catch (submitError) {
      setVehicleFormError(submitError instanceof Error ? submitError.message : 'Failed to save vehicle');
    } finally {
      setSavingVehicle(false);
    }
  }

  async function handleDeleteVehicle(vehicle: Asset) {
    if (!window.confirm(`Delete vehicle "${vehicle.equipment_name}"? This removes all its documents too.`)) {
      return;
    }
    try {
      const response = await fetch(`/api/vehicles/${vehicle.id}`, { method: 'DELETE' });
      const json = await response.json();
      if (!response.ok) throw new Error(json?.error || 'Failed to delete vehicle');
      if (expandedVehicleId === vehicle.id) setExpandedVehicleId(null);
      await fetchAll();
    } catch (deleteError) {
      window.alert(deleteError instanceof Error ? deleteError.message : 'Failed to delete vehicle');
    }
  }

  async function handleAddTask() {
    if (!addTaskVehicleId) return;
    const vehicle = vehicles.find((v) => v.id === addTaskVehicleId);
    if (!taskForm.task_name.trim()) {
      setTaskFormError('Document name is required');
      return;
    }
    setSavingTask(true);
    setTaskFormError(null);
    try {
      const payload = {
        equipment_name: taskForm.task_name,
        site_location: vehicle?.site_location || null,
        type_id: documentTypeId ? Number(documentTypeId) : null,
        category_id: vehicle?.category_id != null ? Number(vehicle.category_id) : null,
        department_id: vehicle?.department_id != null ? Number(vehicle.department_id) : null,
        responsible_person: vehicle?.responsible_person || null,
        registration_date: taskForm.registration_date || null,
        expiry_date: taskForm.expiry_date || null,
        reminder_days: taskForm.reminder_days ? Number(taskForm.reminder_days) : 30,
        frequency_days: taskForm.frequency_days ? Number(taskForm.frequency_days) : 365,
        tolerance_days: taskForm.tolerance_days ? Number(taskForm.tolerance_days) : 0,
        parent_asset_id: addTaskVehicleId,
      };

      const response = await fetch('/api/dashboard/assets/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json?.error || 'Failed to add document');
      setAddTaskVehicleId(null);
      setTaskForm(emptyTaskForm);
      await fetchAll();
    } catch (submitError) {
      setTaskFormError(submitError instanceof Error ? submitError.message : 'Failed to add document');
    } finally {
      setSavingTask(false);
    }
  }

  function openEditTask(task: Asset) {
    setEditingTask(task);
    setEditTaskForm({
      registration_date: task.registration_date ? task.registration_date.slice(0, 10) : '',
      expiry_date: task.expiry_date ? task.expiry_date.slice(0, 10) : '',
      reminder_days: String(task.reminder_days ?? 30),
      frequency_days: String(task.frequency_days ?? 365),
      tolerance_days: String(task.tolerance_days ?? 0),
    });
  }

  async function handleSaveEditTask() {
    if (!editingTask) return;
    setSavingEditTask(true);
    try {
      const payload = {
        equipment_name: editingTask.equipment_name,
        site_location: editingTask.site_location || null,
        type_id: editingTask.type_id != null ? Number(editingTask.type_id) : null,
        category_id: editingTask.category_id != null ? Number(editingTask.category_id) : null,
        department_id: editingTask.department_id != null ? Number(editingTask.department_id) : null,
        responsible_person: editingTask.responsible_person || null,
        remarks: editingTask.remarks || null,
        parent_asset_id: editingTask.parent_asset_id,
        registration_date: editTaskForm.registration_date || null,
        expiry_date: editTaskForm.expiry_date || null,
        reminder_days: Number(editTaskForm.reminder_days) || 30,
        frequency_days: Number(editTaskForm.frequency_days) || 365,
        tolerance_days: Number(editTaskForm.tolerance_days) || 0,
      };

      const response = await fetch(`/api/dashboard/assets/${editingTask.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json?.error || 'Failed to update document');
      setEditingTask(null);
      await fetchAll();
    } catch (updateError) {
      window.alert(updateError instanceof Error ? updateError.message : 'Failed to update document');
    } finally {
      setSavingEditTask(false);
    }
  }

  async function handleCompleteTask(task: Asset) {
    setBusyTaskId(task.id);
    try {
      const response = await fetch(`/api/vehicles/tasks/${task.id}/complete`, { method: 'PUT' });
      const json = await response.json();
      if (!response.ok) throw new Error(json?.error || 'Failed to renew document');
      await fetchAll();
    } catch (completeError) {
      window.alert(completeError instanceof Error ? completeError.message : 'Failed to renew document');
    } finally {
      setBusyTaskId(null);
    }
  }

  async function handleDeleteTask(task: Asset) {
    if (!window.confirm(`Delete document "${task.equipment_name}"?`)) return;
    setBusyTaskId(task.id);
    try {
      const response = await fetch(`/api/vehicles/tasks/${task.id}`, { method: 'DELETE' });
      const json = await response.json();
      if (!response.ok) throw new Error(json?.error || 'Failed to delete document');
      await fetchAll();
    } catch (deleteError) {
      window.alert(deleteError instanceof Error ? deleteError.message : 'Failed to delete document');
    } finally {
      setBusyTaskId(null);
    }
  }

  const tasksByVehicle = useMemo(() => {
    const map: Record<number, Asset[]> = {};
    for (const doc of documents) {
      if (doc.parent_asset_id == null) continue;
      if (!map[doc.parent_asset_id]) map[doc.parent_asset_id] = [];
      map[doc.parent_asset_id].push(doc);
    }
    return map;
  }, [documents]);

  const vehicleStats = useMemo(() => {
    const map: Record<number, { total: number; expired: number; expiring: number }> = {};
    for (const vehicle of vehicles) {
      const tasks = tasksByVehicle[vehicle.id] || [];
      map[vehicle.id] = {
        total: tasks.length,
        expired: tasks.filter((t) => daysUntil(t.expiry_date) !== null && (daysUntil(t.expiry_date) as number) < 0).length,
        expiring: tasks.filter((t) => {
          const days = daysUntil(t.expiry_date);
          return days !== null && days >= 0 && days <= 30;
        }).length,
      };
    }
    return map;
  }, [vehicles, tasksByVehicle]);

  const departmentOptionsList = [...new Set(
    vehicles.map((v) => v.site_location).filter((d): d is string => Boolean(d))
  )].sort();

  const filteredVehicles = vehicles.filter((vehicle) => {
    if (departmentFilter !== 'all' && vehicle.site_location !== departmentFilter) return false;
    if (search.trim()) {
      const term = search.trim().toLowerCase();
      if (!vehicle.equipment_name?.toLowerCase().includes(term)) return false;
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
            onClick={openAddVehicle}
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
          {departmentOptionsList.map((dept) => (
            <option key={dept} value={dept}>{dept}</option>
          ))}
        </select>
        <div className="relative sm:w-72">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by vehicle name..."
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
            const stats = vehicleStats[vehicle.id] || { total: 0, expired: 0, expiring: 0 };
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
                      <p className="font-bold text-slate-800">{vehicle.equipment_name}</p>
                      <p className="text-sm text-slate-600 truncate">{vehicle.category_name || '-'}</p>
                      <p className="text-xs text-slate-400 mt-0.5">
                        {vehicle.site_location || 'No site'} {vehicle.responsible_person ? `· Incharge: ${vehicle.responsible_person}` : ''}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 flex-shrink-0">
                    <div className="text-right text-xs text-slate-500 hidden sm:block">
                      <p>{stats.total} document{stats.total === 1 ? '' : 's'}</p>
                      <p className="text-orange-600">{stats.expiring} expiring soon</p>
                      <p className="text-red-600">{stats.expired} overdue</p>
                    </div>
                    {!readOnly && (
                      <div className="flex items-center gap-1">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            openEditVehicle(vehicle);
                          }}
                          className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
                          title="Edit vehicle"
                        >
                          <Pencil size={16} />
                        </button>
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
                      </div>
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
                          Add Document
                        </button>
                      </div>
                    )}

                    {tasks.length === 0 ? (
                      <p className="text-sm text-slate-500 text-center py-4">No documents yet for this vehicle.</p>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="bg-slate-50 border-b border-slate-200">
                              <th className="text-left px-4 py-2 text-xs font-semibold text-slate-500 uppercase">Document</th>
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
                                    <p className="font-medium text-slate-800">{task.equipment_name}</p>
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
                                        <button
                                          onClick={() => handleDeleteTask(task)}
                                          disabled={busyTaskId === task.id}
                                          className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                                          title="Delete document"
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

      {/* Add / Edit Vehicle Modal */}
      <Modal
        isOpen={addVehicleModalOpen}
        onClose={() => setAddVehicleModalOpen(false)}
        title={editingVehicle ? 'Edit Vehicle' : 'Add Vehicle'}
        size="lg"
      >
        <div className="space-y-4">
          {vehicleFormError && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{vehicleFormError}</div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-1">Vehicle Name / No *</label>
              <input
                type="text"
                value={vehicleForm.equipment_name}
                onChange={(e) => setVehicleForm({ ...vehicleForm, equipment_name: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Vehicle Type *</label>
              <select
                value={vehicleForm.category_id}
                onChange={(e) => setVehicleForm({ ...vehicleForm, category_id: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
              >
                <option value="">Select a type</option>
                {vehicleCategoryOptions.map((option) => (
                  <option key={option.id} value={option.id}>{option.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Site Location</label>
              <select
                value={vehicleForm.site_location}
                onChange={(e) => setVehicleForm({ ...vehicleForm, site_location: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
              >
                <option value="">Select a site</option>
                {siteOptions.map((site) => (
                  <option key={site.id} value={site.site_name}>{site.site_name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Department</label>
              <select
                value={vehicleForm.department_id}
                onChange={(e) => setVehicleForm({ ...vehicleForm, department_id: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
              >
                <option value="">Select a department</option>
                {departmentOptions.map((option) => (
                  <option key={option.id} value={option.id}>{option.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Service Interval (days)</label>
              <input
                type="number"
                value={vehicleForm.maintenance_interval_days}
                onChange={(e) => setVehicleForm({ ...vehicleForm, maintenance_interval_days: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                placeholder="e.g., 90"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Last Service Date</label>
              <input
                type="date"
                value={vehicleForm.last_completed_date}
                onChange={(e) => setVehicleForm({ ...vehicleForm, last_completed_date: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Incharge</label>
              <input
                type="text"
                value={vehicleForm.responsible_person}
                onChange={(e) => setVehicleForm({ ...vehicleForm, responsible_person: e.target.value })}
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
              onClick={handleSaveVehicle}
              disabled={savingVehicle}
              className="flex items-center gap-2 px-4 py-2 bg-[#0f172a] text-white text-sm font-medium rounded-lg hover:bg-slate-800 transition-colors disabled:opacity-50"
            >
              {savingVehicle && <Loader2 size={14} className="animate-spin" />}
              {editingVehicle ? 'Save' : 'Add Vehicle'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Add Document Modal */}
      <Modal isOpen={addTaskVehicleId !== null} onClose={() => setAddTaskVehicleId(null)} title="Add Document">
        <div className="space-y-4">
          {taskFormError && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{taskFormError}</div>
          )}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Document Name</label>
            <input
              type="text"
              value={taskForm.task_name}
              onChange={(e) => setTaskForm({ ...taskForm, task_name: e.target.value })}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
              placeholder="e.g., Insurance, Registration, Mulkiya"
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
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Reminder Days</label>
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
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Tolerance (days)</label>
              <input
                type="number"
                value={taskForm.tolerance_days}
                onChange={(e) => setTaskForm({ ...taskForm, tolerance_days: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                placeholder="0"
              />
            </div>
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
              Add Document
            </button>
          </div>
        </div>
      </Modal>

      {/* Edit Document Dates Modal */}
      <Modal isOpen={editingTask !== null} onClose={() => setEditingTask(null)} title="Edit Document Dates">
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
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Reminder Days</label>
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
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Tolerance (days)</label>
              <input
                type="number"
                value={editTaskForm.tolerance_days}
                onChange={(e) => setEditTaskForm({ ...editTaskForm, tolerance_days: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                placeholder="0"
              />
            </div>
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
