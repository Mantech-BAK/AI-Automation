import { useEffect, useState } from 'react';
import {
  Contact,
  Loader2,
  Pencil,
  Plus,
  Save,
  Search,
  Trash2,
} from 'lucide-react';
import Modal from './Modal';

interface Employee {
  id: string;
  emp_id: string;
  name: string;
  email?: string | null;
  contact_number?: string | null;
  designation_name?: string | null;
  department_name?: string | null;
  department_text?: string | null;
  designation_text?: string | null;
  religion_text?: string | null;
  nationality?: string | null;
  gender?: string | null;
  cost_center?: string | null;
  employee_type_name?: string | null;
  religion_name?: string | null;
  origin_name?: string | null;
  reports_to_name?: string | null;
  reports_to_emp_id?: string | null;
  is_technician: boolean;
}

type TechnicianFilter = 'all' | 'technicians';

interface LookupOption {
  id: string;
  name: string;
}

interface EmployeesPageProps {
  initialSearch?: string;
}

const typeOfServiceOptions = ['Mechanical', 'Electrical', 'General'];

export default function EmployeesPage({ initialSearch }: EmployeesPageProps) {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState(initialSearch || '');
  const [departmentFilter, setDepartmentFilter] = useState('all');
  const [technicianFilter, setTechnicianFilter] = useState<TechnicianFilter>('all');

  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [editSaving, setEditSaving] = useState(false);
  const [editFormData, setEditFormData] = useState({
    name: '',
    designation_text: '',
    department_text: '',
    religion_text: '',
    nationality: '',
    gender: '',
    cost_center: '',
    reports_to_name: '',
    is_technician: false,
  });

  const [designationOptions, setDesignationOptions] = useState<LookupOption[]>([]);
  const [departmentOptions, setDepartmentOptions] = useState<LookupOption[]>([]);
  const [employeeTypeOptions, setEmployeeTypeOptions] = useState<LookupOption[]>([]);
  const [religionOptions, setReligionOptions] = useState<LookupOption[]>([]);
  const [managerOptions, setManagerOptions] = useState<Employee[]>([]);
  const [lookupOptionsLoading, setLookupOptionsLoading] = useState(false);

  const [formData, setFormData] = useState({
    emp_id: '',
    name: '',
    email: '',
    contact_number: '',
    designation_id: '',
    department_id: '',
    employee_type_id: '',
    religion_id: '',
    reports_to: '',
    is_technician: false,
    type_of_service: 'General',
  });

  useEffect(() => {
    fetchEmployees();
  }, []);

  useEffect(() => {
    if (initialSearch) {
      setSearch(initialSearch);
    }
  }, [initialSearch]);

  async function fetchEmployees() {
    try {
      const response = await fetch('/api/employees');
      if (!response.ok) {
        throw new Error(`Failed to load employees: ${response.statusText}`);
      }
      const json: Employee[] = await response.json();
      setEmployees(json);
    } catch (fetchError) {
      const message = fetchError instanceof Error ? fetchError.message : 'Unknown error';
      console.error('Error fetching employees:', fetchError);
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  async function fetchLookupOptions() {
    setLookupOptionsLoading(true);
    try {
      const [designationsRes, departmentsRes, employeeTypesRes, religionsRes, employeesRes] = await Promise.all([
        fetch('/api/dashboard/designations'),
        fetch('/api/dashboard/departments'),
        fetch('/api/dashboard/employee-types'),
        fetch('/api/dashboard/religions'),
        fetch('/api/employees'),
      ]);
      if (!designationsRes.ok || !departmentsRes.ok || !employeeTypesRes.ok || !religionsRes.ok || !employeesRes.ok) {
        throw new Error('Failed to load lookup options');
      }
      setDesignationOptions(await designationsRes.json());
      setDepartmentOptions(await departmentsRes.json());
      setEmployeeTypeOptions(await employeeTypesRes.json());
      setReligionOptions(await religionsRes.json());
      setManagerOptions(await employeesRes.json());
    } catch (fetchError) {
      console.error('Error fetching lookup options:', fetchError);
    } finally {
      setLookupOptionsLoading(false);
    }
  }

  async function handleSave() {
    if (!formData.emp_id.trim() || !formData.name.trim()) return;

    setSaving(true);
    try {
      const data = {
        emp_id: formData.emp_id,
        name: formData.name,
        email: formData.email || null,
        contact_number: formData.contact_number || null,
        designation_id: formData.designation_id ? Number(formData.designation_id) : null,
        department_id: formData.department_id ? Number(formData.department_id) : null,
        employee_type_id: formData.employee_type_id ? Number(formData.employee_type_id) : null,
        religion_id: formData.religion_id ? Number(formData.religion_id) : null,
        reports_to: formData.reports_to || null,
        is_technician: formData.is_technician,
        ...(formData.is_technician ? { type_of_service: formData.type_of_service.toLowerCase() } : {}),
      };

      const response = await fetch('/api/employees/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!response.ok) {
        throw new Error(`Failed to save employee: ${response.statusText}`);
      }

      setAddModalOpen(false);
      resetForm();
      fetchEmployees();
    } catch (fetchError) {
      console.error('Error saving employee:', fetchError);
    } finally {
      setSaving(false);
    }
  }

  function resetForm() {
    setFormData({
      emp_id: '',
      name: '',
      email: '',
      contact_number: '',
      designation_id: '',
      department_id: '',
      employee_type_id: '',
      religion_id: '',
      reports_to: '',
      is_technician: false,
      type_of_service: 'General',
    });
  }

  function openEditModal(emp: Employee) {
    setEditingEmployee(emp);
    setEditFormData({
      name: emp.name || '',
      designation_text: emp.designation_text || '',
      department_text: emp.department_text || '',
      religion_text: emp.religion_text || '',
      nationality: emp.nationality || '',
      gender: emp.gender || '',
      cost_center: emp.cost_center || '',
      reports_to_name: emp.reports_to_name || '',
      is_technician: emp.is_technician,
    });
  }

  async function handleEditSave() {
    if (!editingEmployee) return;

    setEditSaving(true);
    try {
      const response = await fetch(`/api/employees/${editingEmployee.id}/update`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editFormData),
      });
      if (!response.ok) {
        throw new Error(`Failed to update employee: ${response.statusText}`);
      }

      setEditingEmployee(null);
      fetchEmployees();
    } catch (fetchError) {
      console.error('Error updating employee:', fetchError);
    } finally {
      setEditSaving(false);
    }
  }

  async function handleDelete(emp: Employee) {
    if (!window.confirm(`Delete ${emp.name} (${emp.emp_id})? This cannot be undone.`)) {
      return;
    }

    try {
      const response = await fetch(`/api/employees/${emp.id}`, { method: 'DELETE' });
      if (!response.ok) {
        throw new Error(`Failed to delete employee: ${response.statusText}`);
      }
      fetchEmployees();
    } catch (fetchError) {
      console.error('Error deleting employee:', fetchError);
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
          <p className="font-semibold">Failed to load employees</p>
          <p className="text-sm mt-2">{error}</p>
        </div>
      </div>
    );
  }

  const departmentTextOptions = [...new Set(
    employees.map((emp) => emp.department_text).filter((d): d is string => Boolean(d))
  )].sort();

  const filteredEmployees = employees.filter((emp) => {
    const term = search.trim().toLowerCase();
    if (term && !emp.name.toLowerCase().includes(term) && !emp.emp_id.toLowerCase().includes(term)) {
      return false;
    }

    if (departmentFilter !== 'all' && emp.department_text !== departmentFilter) {
      return false;
    }

    if (technicianFilter === 'technicians' && !emp.is_technician) {
      return false;
    }

    return true;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Employee Master</h1>
          <p className="text-slate-500 mt-1">Manage all employee records</p>
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
            Add Employee
          </button>
        </div>
      </div>

      {/* Search & Filters */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="relative max-w-sm sm:w-72">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or employee ID"
            className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
          />
        </div>
        <select
          value={departmentFilter}
          onChange={(e) => setDepartmentFilter(e.target.value)}
          className="px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white text-slate-600 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
        >
          <option value="all">All Departments</option>
          {departmentTextOptions.map((dept) => (
            <option key={dept} value={dept}>{dept}</option>
          ))}
        </select>
        <div className="flex gap-2">
          {([
            { id: 'all', label: 'All Employees' },
            { id: 'technicians', label: 'Technicians Only' },
          ] as { id: TechnicianFilter; label: string }[]).map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => setTechnicianFilter(opt.id)}
              className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                technicianFilter === opt.id
                  ? 'bg-[#0f172a] text-white'
                  : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Employees Table */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Employee ID</th>
                <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Name</th>
                <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Designation</th>
                <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Department</th>
                <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Cost Center</th>
                <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filteredEmployees.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-slate-500">
                    <Contact size={40} className="mx-auto text-slate-300 mb-2" />
                    <p>No employees found.</p>
                  </td>
                </tr>
              ) : (
                filteredEmployees.map((emp) => (
                  <tr key={emp.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4 text-sm font-medium text-slate-800">{emp.emp_id}</td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-cyan-400 to-blue-500 flex items-center justify-center text-white font-semibold text-xs">
                          {emp.name.split(' ').map((n) => n[0]).join('').slice(0, 2)}
                        </div>
                        <p className="font-medium text-slate-800">{emp.name}</p>
                        {emp.is_technician && (
                          <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700">Technician</span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-600">{emp.designation_text || '-'}</td>
                    <td className="px-6 py-4 text-sm text-slate-600">{emp.department_text || '-'}</td>
                    <td className="px-6 py-4 text-sm text-slate-600">{emp.cost_center || '-'}</td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => openEditModal(emp)}
                          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition-colors"
                        >
                          <Pencil size={14} />
                          Edit
                        </button>
                        <button
                          onClick={() => handleDelete(emp)}
                          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-red-50 text-red-700 rounded-lg hover:bg-red-100 transition-colors"
                        >
                          <Trash2 size={14} />
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Modal */}
      <Modal
        isOpen={addModalOpen}
        onClose={() => setAddModalOpen(false)}
        title="Add New Employee"
        size="lg"
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Employee ID *</label>
              <input
                type="text"
                value={formData.emp_id}
                onChange={(e) => setFormData({ ...formData, emp_id: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                placeholder="e.g., EMP016"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Full Name *</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                placeholder="Enter full name"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                placeholder="Enter email"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Contact Number</label>
              <input
                type="text"
                value={formData.contact_number}
                onChange={(e) => setFormData({ ...formData, contact_number: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                placeholder="e.g., +97336100016"
              />
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
              <label className="block text-sm font-medium text-slate-700 mb-1">Department</label>
              <select
                value={formData.department_id}
                onChange={(e) => setFormData({ ...formData, department_id: e.target.value })}
                disabled={lookupOptionsLoading}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent disabled:opacity-50"
              >
                <option value="">{lookupOptionsLoading ? 'Loading...' : 'Select department'}</option>
                {departmentOptions.map((option) => (
                  <option key={option.id} value={option.id}>{option.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Employee Type</label>
              <select
                value={formData.employee_type_id}
                onChange={(e) => setFormData({ ...formData, employee_type_id: e.target.value })}
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
              <label className="block text-sm font-medium text-slate-700 mb-1">Religion</label>
              <select
                value={formData.religion_id}
                onChange={(e) => setFormData({ ...formData, religion_id: e.target.value })}
                disabled={lookupOptionsLoading}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent disabled:opacity-50"
              >
                <option value="">{lookupOptionsLoading ? 'Loading...' : 'Select religion'}</option>
                {religionOptions.map((option) => (
                  <option key={option.id} value={option.id}>{option.name}</option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-1">Reports To</label>
              <select
                value={formData.reports_to}
                onChange={(e) => setFormData({ ...formData, reports_to: e.target.value })}
                disabled={lookupOptionsLoading}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent disabled:opacity-50"
              >
                <option value="">{lookupOptionsLoading ? 'Loading...' : 'Select manager'}</option>
                {managerOptions.map((option) => (
                  <option key={option.id} value={option.emp_id}>{option.emp_id} - {option.name}</option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2 flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2.5">
              <label className="text-sm font-medium text-slate-700">Is Technician</label>
              <button
                type="button"
                onClick={() => setFormData({ ...formData, is_technician: !formData.is_technician })}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  formData.is_technician ? 'bg-cyan-500' : 'bg-slate-300'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    formData.is_technician ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
            {formData.is_technician && (
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-slate-700 mb-1">Type of Service</label>
                <select
                  value={formData.type_of_service}
                  onChange={(e) => setFormData({ ...formData, type_of_service: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                >
                  {typeOfServiceOptions.map((option) => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
              </div>
            )}
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
              disabled={!formData.emp_id.trim() || !formData.name.trim() || saving}
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

      {/* Edit Modal */}
      <Modal
        isOpen={Boolean(editingEmployee)}
        onClose={() => setEditingEmployee(null)}
        title="Edit Employee"
        size="lg"
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Employee ID</label>
              <input
                type="text"
                value={editingEmployee?.emp_id || ''}
                readOnly
                disabled
                className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-slate-50 text-slate-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Full Name</label>
              <input
                type="text"
                value={editFormData.name}
                onChange={(e) => setEditFormData({ ...editFormData, name: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Designation</label>
              <input
                type="text"
                value={editFormData.designation_text}
                onChange={(e) => setEditFormData({ ...editFormData, designation_text: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Department</label>
              <input
                type="text"
                value={editFormData.department_text}
                onChange={(e) => setEditFormData({ ...editFormData, department_text: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Religion</label>
              <input
                type="text"
                value={editFormData.religion_text}
                onChange={(e) => setEditFormData({ ...editFormData, religion_text: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Nationality</label>
              <input
                type="text"
                value={editFormData.nationality}
                onChange={(e) => setEditFormData({ ...editFormData, nationality: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Gender</label>
              <input
                type="text"
                value={editFormData.gender}
                onChange={(e) => setEditFormData({ ...editFormData, gender: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Cost Center</label>
              <input
                type="text"
                value={editFormData.cost_center}
                onChange={(e) => setEditFormData({ ...editFormData, cost_center: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-1">Reports To</label>
              <input
                type="text"
                value={editFormData.reports_to_name}
                onChange={(e) => setEditFormData({ ...editFormData, reports_to_name: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
              />
            </div>
            <div className="sm:col-span-2 flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2.5">
              <label className="text-sm font-medium text-slate-700">Is Technician</label>
              <button
                type="button"
                onClick={() => setEditFormData({ ...editFormData, is_technician: !editFormData.is_technician })}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  editFormData.is_technician ? 'bg-cyan-500' : 'bg-slate-300'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    editFormData.is_technician ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-4">
            <button
              onClick={() => setEditingEmployee(null)}
              className="px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleEditSave}
              disabled={editSaving}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-gradient-to-r from-cyan-500 to-blue-600 text-white rounded-lg hover:shadow-lg transition-shadow disabled:opacity-50"
            >
              {editSaving ? (
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
    </div>
  );
}
