import { useEffect, useState } from 'react';
import {
  Cog,
  FileText,
  Loader2,
  Pencil,
  Plus,
  Save,
  Truck,
} from 'lucide-react';
import Modal from './Modal';
import AssetEditModal, { EditableAsset } from './AssetEditModal';
import VehiclesPage from './VehiclesPage';

interface Equipment {
  id: string;
  equipment_name: string;
  site_location: string;
  maintenance_interval_days?: number | null;
  estimated_duration_hours?: number | null;
  last_completed_date?: string | null;
  next_due_date?: string | null;
  type_of_service?: string | null;
  category_id?: number | null;
  type_id?: number | null;
  department_id?: number | null;
  category_name?: string | null;
  type_name?: string | null;
  department_name?: string | null;
  registration_date?: string | null;
  expiry_date?: string | null;
  reminder_days?: number | null;
  frequency_days?: number | null;
  tolerance_days?: number | null;
  responsible_person?: string | null;
  remarks?: string | null;
}

interface SiteOption {
  id: string;
  site_name: string;
}

interface LookupOption {
  id: string;
  name: string;
}

type PageTab = 'equipment' | 'documents' | 'vehicles';

type DocExpiryTile = 'all' | 'expired' | 'expiring7' | 'expiring30' | 'expiring90' | 'notSoon';

const DOC_EXPIRY_TILES: { id: DocExpiryTile; label: string; activeClass: string; inactiveClass: string }[] = [
  { id: 'all', label: 'All Documents', activeClass: 'bg-slate-200 border-slate-600 text-slate-800', inactiveClass: 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100' },
  { id: 'expired', label: 'Expired', activeClass: 'bg-red-100 border-red-600 text-red-800', inactiveClass: 'bg-red-50 border-red-200 text-red-700 hover:bg-red-100' },
  { id: 'expiring7', label: 'Expiring Within 7 Days', activeClass: 'bg-orange-100 border-orange-600 text-orange-800', inactiveClass: 'bg-orange-50 border-orange-200 text-orange-700 hover:bg-orange-100' },
  { id: 'expiring30', label: 'Expiring Within 30 Days', activeClass: 'bg-amber-100 border-amber-500 text-amber-800', inactiveClass: 'bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100' },
  { id: 'expiring90', label: 'Expiring Within 90 Days', activeClass: 'bg-yellow-100 border-yellow-500 text-yellow-800', inactiveClass: 'bg-yellow-50 border-yellow-200 text-yellow-700 hover:bg-yellow-100' },
  { id: 'notSoon', label: 'Not Expiring Soon', activeClass: 'bg-emerald-100 border-emerald-600 text-emerald-800', inactiveClass: 'bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100' },
];

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
  if (days === null) return 'text-slate-400';
  if (days <= 30) return 'text-red-600 font-medium';
  if (days <= 90) return 'text-amber-600 font-medium';
  return 'text-emerald-600 font-medium';
}

interface EquipmentPageProps {
  initialTab?: PageTab;
  initialDocExpiryTile?: DocExpiryTile;
}

export default function EquipmentPage({ initialTab, initialDocExpiryTile }: EquipmentPageProps = {}) {
  const [activeTab, setActiveTab] = useState<PageTab>(initialTab || 'equipment');
  const [docExpiryTile, setDocExpiryTile] = useState<DocExpiryTile>(initialDocExpiryTile || 'all');

  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [documents, setDocuments] = useState<Equipment[]>([]);
  const [documentsLoading, setDocumentsLoading] = useState(true);
  const [documentsError, setDocumentsError] = useState<string | null>(null);

  const [equipmentDeptFilter, setEquipmentDeptFilter] = useState('all');
  const [documentDeptFilter, setDocumentDeptFilter] = useState('all');

  const [editingAsset, setEditingAsset] = useState<EditableAsset | null>(null);

  const [addModalOpen, setAddModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [siteOptions, setSiteOptions] = useState<SiteOption[]>([]);
  const [siteOptionsLoading, setSiteOptionsLoading] = useState(false);
  const [categoryOptions, setCategoryOptions] = useState<LookupOption[]>([]);
  const [typeOptions, setTypeOptions] = useState<LookupOption[]>([]);
  const [departmentOptions, setDepartmentOptions] = useState<LookupOption[]>([]);
  const [lookupOptionsLoading, setLookupOptionsLoading] = useState(false);

  const [formData, setFormData] = useState({
    equipment_name: '',
    site_location: '',
    maintenance_interval_days: '',
    estimated_duration_hours: '',
    last_completed_date: '',
    type_of_service: 'general',
    category_id: '',
    type_id: '',
    department_id: '',
    registration_date: '',
    expiry_date: '',
    reminder_days: '7',
    frequency_days: '365',
    tolerance_days: '0',
    responsible_person: '',
    remarks: '',
  });

  useEffect(() => {
    fetchData();
    fetchDocuments();
  }, []);

  async function fetchData() {
    try {
      const response = await fetch('/api/dashboard/assets?type=Equipment');
      if (!response.ok) {
        throw new Error(`Failed to load equipment: ${response.statusText}`);
      }
      const json: Equipment[] = await response.json();
      setEquipment(json);
    } catch (fetchError) {
      const message = fetchError instanceof Error ? fetchError.message : 'Unknown error';
      console.error('Error fetching data:', fetchError);
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  async function fetchDocuments() {
    try {
      const response = await fetch('/api/dashboard/assets?type=Document');
      if (!response.ok) {
        throw new Error(`Failed to load documents: ${response.statusText}`);
      }
      const json: Equipment[] = await response.json();
      setDocuments(json);
    } catch (fetchError) {
      const message = fetchError instanceof Error ? fetchError.message : 'Unknown error';
      console.error('Error fetching documents:', fetchError);
      setDocumentsError(message);
    } finally {
      setDocumentsLoading(false);
    }
  }

  async function handleSave() {
    if (!formData.equipment_name.trim() || !formData.site_location.trim()) return;

    setSaving(true);
    try {
      const data = {
        equipment_name: formData.equipment_name,
        site_location: formData.site_location,
        maintenance_interval_days: formData.maintenance_interval_days ? Number(formData.maintenance_interval_days) : null,
        estimated_duration_hours: formData.estimated_duration_hours ? Number(formData.estimated_duration_hours) : null,
        last_completed_date: formData.last_completed_date || null,
        type_of_service: formData.type_of_service || 'general',
        category_id: formData.category_id ? Number(formData.category_id) : null,
        type_id: formData.type_id ? Number(formData.type_id) : null,
        department_id: formData.department_id ? Number(formData.department_id) : null,
        registration_date: formData.registration_date || null,
        expiry_date: formData.expiry_date || null,
        reminder_days: formData.reminder_days ? Number(formData.reminder_days) : null,
        frequency_days: formData.frequency_days ? Number(formData.frequency_days) : null,
        tolerance_days: formData.tolerance_days ? Number(formData.tolerance_days) : 0,
        responsible_person: formData.responsible_person || null,
        remarks: formData.remarks || null,
      };

      const response = await fetch('/api/dashboard/assets/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!response.ok) {
        throw new Error(`Failed to save equipment: ${response.statusText}`);
      }

      setAddModalOpen(false);
      resetForm();
      fetchData();
    } catch (fetchError) {
      console.error('Error saving equipment:', fetchError);
    } finally {
      setSaving(false);
    }
  }

  function resetForm() {
    setFormData({
      equipment_name: '',
      site_location: '',
      maintenance_interval_days: '',
      estimated_duration_hours: '',
      last_completed_date: '',
      type_of_service: 'general',
      category_id: '',
      type_id: '',
      department_id: '',
      registration_date: '',
      expiry_date: '',
      reminder_days: '7',
      frequency_days: '365',
      tolerance_days: '0',
      responsible_person: '',
      remarks: '',
    });
  }

  async function fetchSiteOptions() {
    setSiteOptionsLoading(true);
    try {
      const response = await fetch('/api/dashboard/sites/list');
      if (!response.ok) {
        throw new Error(`Failed to load sites: ${response.statusText}`);
      }
      const json: SiteOption[] = await response.json();
      setSiteOptions(json);
    } catch (fetchError) {
      console.error('Error fetching site options:', fetchError);
    } finally {
      setSiteOptionsLoading(false);
    }
  }

  async function fetchLookupOptions() {
    setLookupOptionsLoading(true);
    try {
      const [categoriesRes, typesRes, departmentsRes] = await Promise.all([
        fetch('/api/dashboard/categories'),
        fetch('/api/dashboard/asset-types'),
        fetch('/api/dashboard/departments'),
      ]);
      if (!categoriesRes.ok || !typesRes.ok || !departmentsRes.ok) {
        throw new Error('Failed to load lookup options');
      }
      setCategoryOptions(await categoriesRes.json());
      setTypeOptions(await typesRes.json());
      setDepartmentOptions(await departmentsRes.json());
    } catch (fetchError) {
      console.error('Error fetching lookup options:', fetchError);
    } finally {
      setLookupOptionsLoading(false);
    }
  }

  const getDueDateStatus = (nextDueDate?: string | null): 'overdue' | 'soon' | 'ok' | 'none' => {
    if (!nextDueDate) return 'none';
    const due = new Date(nextDueDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const sevenDaysFromNow = new Date(today);
    sevenDaysFromNow.setDate(today.getDate() + 7);

    if (due < today) return 'overdue';
    if (due <= sevenDaysFromNow) return 'soon';
    return 'ok';
  };

  const getDueDateColor = (nextDueDate?: string | null) => {
    switch (getDueDateStatus(nextDueDate)) {
      case 'overdue': return 'text-red-600 font-medium';
      case 'soon': return 'text-amber-600 font-medium';
      case 'ok': return 'text-emerald-600';
      default: return 'text-slate-400';
    }
  };

  const getExpiryDateColor = (expiryDate?: string | null) => {
    if (!expiryDate) return 'text-slate-400';
    const expiry = new Date(expiryDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const daysUntilExpiry = Math.floor((expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

    if (daysUntilExpiry < 30) return 'text-red-600 font-medium';
    if (daysUntilExpiry <= 90) return 'text-amber-600 font-medium';
    return 'text-emerald-600';
  };

  const overdueCount = equipment.filter(e => getDueDateStatus(e.next_due_date) === 'overdue').length;
  const soonCount = equipment.filter(e => getDueDateStatus(e.next_due_date) === 'soon').length;
  const okCount = equipment.filter(e => getDueDateStatus(e.next_due_date) === 'ok').length;

  const equipmentDeptOptions = [...new Set(
    equipment.map((item) => item.site_location).filter((d): d is string => Boolean(d))
  )].sort();
  const filteredEquipment = equipmentDeptFilter === 'all'
    ? equipment
    : equipment.filter((item) => item.site_location === equipmentDeptFilter);

  const documentDeptOptions = [...new Set(
    documents.map((item) => item.site_location).filter((d): d is string => Boolean(d))
  )].sort();

  // Cumulative "due within X days" windows, matching the semantics of the
  // Dashboard's Documentation tiles (e.g. expiring_documents = 0-30 days) so
  // counts stay consistent between the two pages. 'notSoon' is the complement
  // of the widest window (90 days) plus anything with no expiry date at all.
  const matchesDocExpiryTile = (tile: DocExpiryTile, dateStr?: string | null): boolean => {
    const days = daysUntil(dateStr);
    switch (tile) {
      case 'all': return true;
      case 'expired': return days !== null && days < 0;
      case 'expiring7': return days !== null && days >= 0 && days <= 7;
      case 'expiring30': return days !== null && days >= 0 && days <= 30;
      case 'expiring90': return days !== null && days >= 0 && days <= 90;
      case 'notSoon': return days === null || days > 90;
      default: return true;
    }
  };

  const documentsInDept = documentDeptFilter === 'all'
    ? documents
    : documents.filter((item) => item.site_location === documentDeptFilter);

  const docExpiryTileCounts: Record<DocExpiryTile, number> = {
    all: documentsInDept.length,
    expired: documentsInDept.filter((item) => matchesDocExpiryTile('expired', item.expiry_date)).length,
    expiring7: documentsInDept.filter((item) => matchesDocExpiryTile('expiring7', item.expiry_date)).length,
    expiring30: documentsInDept.filter((item) => matchesDocExpiryTile('expiring30', item.expiry_date)).length,
    expiring90: documentsInDept.filter((item) => matchesDocExpiryTile('expiring90', item.expiry_date)).length,
    notSoon: documentsInDept.filter((item) => matchesDocExpiryTile('notSoon', item.expiry_date)).length,
  };

  const filteredDocuments = documentsInDept.filter((item) => matchesDocExpiryTile(docExpiryTile, item.expiry_date));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Equipment</h1>
          <p className="text-slate-500 mt-1">Manage your equipment and assets</p>
        </div>
        {activeTab === 'equipment' && (
          <div className="flex gap-3">
            <button
              onClick={() => {
                resetForm();
                setAddModalOpen(true);
                fetchSiteOptions();
                fetchLookupOptions();
              }}
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg font-medium text-sm bg-gradient-to-r from-cyan-500 to-blue-600 text-white hover:shadow-lg transition-shadow"
            >
              <Plus size={18} />
              Add Equipment
            </button>
          </div>
        )}
      </div>

      {/* Tab Switcher */}
      <div className="flex items-center gap-2 flex-wrap">
        {([
          { id: 'equipment', label: 'Equipment', icon: Cog },
          { id: 'documents', label: 'Documents', icon: FileText },
          { id: 'vehicles', label: 'Vehicles', icon: Truck },
        ] as { id: PageTab; label: string; icon: typeof Cog }[]).map((tab) => {
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

      {activeTab === 'equipment' && (
        loading ? (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
          </div>
        ) : error ? (
          <div className="flex items-center justify-center h-64">
            <div className="text-red-600 bg-red-50 border border-red-200 rounded-xl p-6">
              <p className="font-semibold">Failed to load equipment</p>
              <p className="text-sm mt-2">{error}</p>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="bg-white rounded-xl p-4 border border-slate-200">
                <p className="text-sm text-slate-500">Total</p>
                <p className="text-2xl font-bold text-slate-800">{equipment.length}</p>
              </div>
              <div className="bg-white rounded-xl p-4 border border-slate-200">
                <p className="text-sm text-slate-500">Overdue</p>
                <p className="text-2xl font-bold text-red-600">{overdueCount}</p>
              </div>
              <div className="bg-white rounded-xl p-4 border border-slate-200">
                <p className="text-sm text-slate-500">Due Within 7 Days</p>
                <p className="text-2xl font-bold text-amber-600">{soonCount}</p>
              </div>
              <div className="bg-white rounded-xl p-4 border border-slate-200">
                <p className="text-sm text-slate-500">On Track</p>
                <p className="text-2xl font-bold text-emerald-600">{okCount}</p>
              </div>
            </div>

            {/* Department filter */}
            <select
              value={equipmentDeptFilter}
              onChange={(e) => setEquipmentDeptFilter(e.target.value)}
              className="px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white text-slate-600 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
            >
              <option value="all">All Departments</option>
              {equipmentDeptOptions.map((dept) => (
                <option key={dept} value={dept}>{dept}</option>
              ))}
            </select>

            {/* Equipment Table */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200">
                      <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Equipment</th>
                      <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Site</th>
                      <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Type</th>
                      <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Category</th>
                      <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Department</th>
                      <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Interval (days)</th>
                      <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Last Completed</th>
                      <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Next Due</th>
                      <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Registration Date</th>
                      <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Expiry Date</th>
                      <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Responsible Person</th>
                      <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {filteredEquipment.length === 0 ? (
                      <tr>
                        <td colSpan={12} className="px-6 py-12 text-center text-slate-500">
                          <Cog size={40} className="mx-auto text-slate-300 mb-2" />
                          <p>No equipment found. Add your first equipment to get started.</p>
                        </td>
                      </tr>
                    ) : (
                      filteredEquipment.map((item) => (
                        <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-lg bg-indigo-500/10 flex items-center justify-center">
                                <Cog size={16} className="text-indigo-600" />
                              </div>
                              <p className="font-medium text-slate-800">{item.equipment_name}</p>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-sm text-slate-600">{item.site_location}</td>
                          <td className="px-6 py-4 text-sm text-slate-600">{item.type_name || '-'}</td>
                          <td className="px-6 py-4 text-sm text-slate-600">{item.category_name || '-'}</td>
                          <td className="px-6 py-4 text-sm text-slate-600">{item.department_name || '-'}</td>
                          <td className="px-6 py-4 text-sm text-slate-600">{item.maintenance_interval_days ?? '-'}</td>
                          <td className="px-6 py-4 text-sm text-slate-600">
                            {item.last_completed_date ? new Date(item.last_completed_date).toLocaleDateString() : '-'}
                          </td>
                          <td className={`px-6 py-4 text-sm ${getDueDateColor(item.next_due_date)}`}>
                            {item.next_due_date ? new Date(item.next_due_date).toLocaleDateString() : '-'}
                          </td>
                          <td className="px-6 py-4 text-sm text-slate-600">
                            {item.registration_date ? new Date(item.registration_date).toLocaleDateString() : '-'}
                          </td>
                          <td className={`px-6 py-4 text-sm ${getExpiryDateColor(item.expiry_date)}`}>
                            {item.expiry_date ? new Date(item.expiry_date).toLocaleDateString() : '-'}
                          </td>
                          <td className="px-6 py-4 text-sm text-slate-600">{item.responsible_person || '-'}</td>
                          <td className="px-6 py-4">
                            <button
                              onClick={() => setEditingAsset(item)}
                              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition-colors"
                            >
                              <Pencil size={14} />
                              Edit
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )
      )}

      {activeTab === 'documents' && (
        documentsLoading ? (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
          </div>
        ) : documentsError ? (
          <div className="flex items-center justify-center h-64">
            <div className="text-red-600 bg-red-50 border border-red-200 rounded-xl p-6">
              <p className="font-semibold">Failed to load documents</p>
              <p className="text-sm mt-2">{documentsError}</p>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Expiry filter tiles */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              {DOC_EXPIRY_TILES.map((tile) => (
                <button
                  key={tile.id}
                  type="button"
                  onClick={() => setDocExpiryTile(tile.id)}
                  className={`text-left px-4 py-3 rounded-xl border-2 transition-colors ${
                    docExpiryTile === tile.id ? tile.activeClass : tile.inactiveClass
                  }`}
                >
                  <p className="text-2xl font-bold">{docExpiryTileCounts[tile.id]}</p>
                  <p className="text-xs font-medium mt-0.5">{tile.label}</p>
                </button>
              ))}
            </div>

            {/* Department filter */}
            <div className="flex flex-wrap items-center gap-3">
              <select
                value={documentDeptFilter}
                onChange={(e) => setDocumentDeptFilter(e.target.value)}
                className="px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white text-slate-600 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
              >
                <option value="all">All Departments</option>
                {documentDeptOptions.map((dept) => (
                  <option key={dept} value={dept}>{dept}</option>
                ))}
              </select>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200">
                      <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Item Name</th>
                      <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Category</th>
                      <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Department</th>
                      <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Registration Date</th>
                      <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Expiry Date</th>
                      <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Reminder Days</th>
                      <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Frequency (Days)</th>
                      <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">In Charge</th>
                      <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Remarks</th>
                      <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {filteredDocuments.length === 0 ? (
                      <tr>
                        <td colSpan={10} className="px-6 py-12 text-center text-slate-500">
                          <FileText size={40} className="mx-auto text-slate-300 mb-2" />
                          <p>No documents found.</p>
                        </td>
                      </tr>
                    ) : (
                      filteredDocuments.map((item) => (
                        <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-lg bg-cyan-500/10 flex items-center justify-center">
                                <FileText size={16} className="text-cyan-600" />
                              </div>
                              <p className="font-medium text-slate-800">{item.equipment_name}</p>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-sm text-slate-600">{item.type_name || '-'}</td>
                          <td className="px-6 py-4 text-sm text-slate-600">{item.site_location || '-'}</td>
                          <td className="px-6 py-4 text-sm text-slate-600">
                            {item.registration_date ? new Date(item.registration_date).toLocaleDateString() : '-'}
                          </td>
                          <td className={`px-6 py-4 text-sm ${getExpiryColorClass(item.expiry_date)}`}>
                            {item.expiry_date ? new Date(item.expiry_date).toLocaleDateString() : '-'}
                          </td>
                          <td className="px-6 py-4 text-sm text-slate-600">{item.reminder_days ?? '-'}</td>
                          <td className="px-6 py-4 text-sm text-slate-600">{item.frequency_days ?? '-'}</td>
                          <td className="px-6 py-4 text-sm text-slate-600">{item.responsible_person || '-'}</td>
                          <td className="px-6 py-4 text-sm text-slate-600">{item.remarks || '-'}</td>
                          <td className="px-6 py-4">
                            <button
                              onClick={() => setEditingAsset(item)}
                              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition-colors"
                            >
                              <Pencil size={14} />
                              Edit
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )
      )}

      {activeTab === 'vehicles' && <VehiclesPage readOnly />}

      {/* Add Modal */}
      <Modal
        isOpen={addModalOpen}
        onClose={() => setAddModalOpen(false)}
        title="Add New Equipment"
        size="lg"
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-1">Equipment Name *</label>
              <input
                type="text"
                value={formData.equipment_name}
                onChange={(e) => setFormData({ ...formData, equipment_name: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                placeholder="Enter equipment name"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-1">Site Location *</label>
              <select
                value={formData.site_location}
                onChange={(e) => setFormData({ ...formData, site_location: e.target.value })}
                disabled={siteOptionsLoading}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent disabled:opacity-50"
              >
                <option value="">{siteOptionsLoading ? 'Loading sites...' : 'Select a site'}</option>
                {siteOptions.map((site) => (
                  <option key={site.id} value={site.site_name}>
                    {site.site_name}
                  </option>
                ))}
              </select>
              {!siteOptionsLoading && siteOptions.length === 0 && (
                <p className="text-xs text-slate-400 mt-1">No sites found. Add one on the Sites page first.</p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Maintenance Interval (days)</label>
              <input
                type="number"
                value={formData.maintenance_interval_days}
                onChange={(e) => setFormData({ ...formData, maintenance_interval_days: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                placeholder="e.g., 30"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Estimated Duration (hours)</label>
              <input
                type="number"
                value={formData.estimated_duration_hours}
                onChange={(e) => setFormData({ ...formData, estimated_duration_hours: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                placeholder="e.g., 2"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Last Completed</label>
              <input
                type="date"
                value={formData.last_completed_date}
                onChange={(e) => setFormData({ ...formData, last_completed_date: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Type of Service</label>
              <input
                type="text"
                value={formData.type_of_service}
                onChange={(e) => setFormData({ ...formData, type_of_service: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                placeholder="e.g., electrical, mechanical, general"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Category</label>
              <select
                value={formData.category_id}
                onChange={(e) => setFormData({ ...formData, category_id: e.target.value })}
                disabled={lookupOptionsLoading}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent disabled:opacity-50"
              >
                <option value="">{lookupOptionsLoading ? 'Loading...' : 'Select a category'}</option>
                {categoryOptions.map((option) => (
                  <option key={option.id} value={option.id}>{option.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Type</label>
              <select
                value={formData.type_id}
                onChange={(e) => setFormData({ ...formData, type_id: e.target.value })}
                disabled={lookupOptionsLoading}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent disabled:opacity-50"
              >
                <option value="">{lookupOptionsLoading ? 'Loading...' : 'Select a type'}</option>
                {typeOptions.map((option) => (
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
                <option value="">{lookupOptionsLoading ? 'Loading...' : 'Select a department'}</option>
                {departmentOptions.map((option) => (
                  <option key={option.id} value={option.id}>{option.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Registration Date</label>
              <input
                type="date"
                value={formData.registration_date}
                onChange={(e) => setFormData({ ...formData, registration_date: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Expiry Date</label>
              <input
                type="date"
                value={formData.expiry_date}
                onChange={(e) => setFormData({ ...formData, expiry_date: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Reminder Days</label>
              <input
                type="number"
                value={formData.reminder_days}
                onChange={(e) => setFormData({ ...formData, reminder_days: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                placeholder="7"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Frequency (days)</label>
              <input
                type="number"
                value={formData.frequency_days}
                onChange={(e) => setFormData({ ...formData, frequency_days: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                placeholder="365"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Tolerance (days)</label>
              <input
                type="number"
                value={formData.tolerance_days}
                onChange={(e) => setFormData({ ...formData, tolerance_days: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                placeholder="0"
              />
              <p className="text-xs text-slate-400 mt-1">Grace period around the due date that still counts as on-schedule renewal.</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Responsible Person</label>
              <input
                type="text"
                value={formData.responsible_person}
                onChange={(e) => setFormData({ ...formData, responsible_person: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                placeholder="e.g., Yasir Ismail"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-1">Remarks</label>
              <textarea
                value={formData.remarks}
                onChange={(e) => setFormData({ ...formData, remarks: e.target.value })}
                rows={3}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                placeholder="Additional notes"
              />
            </div>
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
              disabled={!formData.equipment_name.trim() || !formData.site_location.trim() || saving}
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

      <AssetEditModal
        asset={editingAsset}
        onClose={() => setEditingAsset(null)}
        onSaved={() => {
          fetchData();
          fetchDocuments();
        }}
      />
    </div>
  );
}
