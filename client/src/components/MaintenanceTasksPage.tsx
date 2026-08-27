import { useEffect, useState } from 'react';
import {
  Wrench,
  Loader2,
  Filter,
  Search,
  CheckCircle2,
  ArrowUpDown,
  ChevronDown,
  Check,
  FileText,
  Truck,
  Rocket,
  Pencil,
} from 'lucide-react';
import AssetEditModal, { EditableAsset } from './AssetEditModal';

interface MaintenanceTask {
  id: string;
  equipment_name?: string | null;
  site_location?: string | null;
  technician_name?: string | null;
  status?: string;
  due_date?: string | null;
  estimated_duration_hours?: number | null;
  days_overdue?: number;
}

interface DocumentAsset extends EditableAsset {
  id: string;
  equipment_name?: string | null;
  site_location?: string | null;
  type_name?: string | null;
  next_due_date?: string | null;
  reminder_days?: number | null;
  responsible_person?: string | null;
}

type PageTab = 'equipment' | 'documents' | 'vehicles';

type StatusFilter = 'all' | 'pending' | 'open' | 'approved' | 'completed';

type DocumentSortKey =
  | 'expiry_asc'
  | 'expiry_desc'
  | 'name_asc'
  | 'name_desc'
  | 'department_asc'
  | 'overdue_first';

type DocumentStatusFilter = 'all' | 'overdue' | 'within_7' | 'within_30' | 'within_90';

const DOCUMENT_SORT_OPTIONS: { key: DocumentSortKey; label: string }[] = [
  { key: 'expiry_asc', label: 'Expiry Date (soonest first)' },
  { key: 'expiry_desc', label: 'Expiry Date (latest first)' },
  { key: 'name_asc', label: 'Item Name (A-Z)' },
  { key: 'name_desc', label: 'Item Name (Z-A)' },
  { key: 'department_asc', label: 'Department (A-Z)' },
  { key: 'overdue_first', label: 'Overdue first, then by date' },
];

const DOCUMENT_STATUS_OPTIONS: { key: DocumentStatusFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'overdue', label: 'Overdue' },
  { key: 'within_7', label: 'Expiring within 7 days' },
  { key: 'within_30', label: 'Expiring within 30 days' },
  { key: 'within_90', label: 'Expiring within 90 days' },
];

type SortKey =
  | 'due_asc'
  | 'due_desc'
  | 'equipment_asc'
  | 'equipment_desc'
  | 'technician_asc'
  | 'technician_desc'
  | 'status_overdue_first'
  | 'hours_desc';

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'due_asc', label: 'Due Date (earliest first)' },
  { key: 'due_desc', label: 'Due Date (latest first)' },
  { key: 'equipment_asc', label: 'Equipment Name (A-Z)' },
  { key: 'equipment_desc', label: 'Equipment Name (Z-A)' },
  { key: 'technician_asc', label: 'Technician Name (A-Z)' },
  { key: 'technician_desc', label: 'Technician Name (Z-A)' },
  { key: 'status_overdue_first', label: 'Status (Overdue first)' },
  { key: 'hours_desc', label: 'Estimated Hours (longest first)' },
];

function compareByName(aName: string | null | undefined, bName: string | null | undefined, direction: 1 | -1): number {
  const a = aName || '';
  const b = bName || '';
  if (!a && !b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  return direction * a.localeCompare(b, undefined, { sensitivity: 'base' });
}

function compareByDueDate(aDate: string | null | undefined, bDate: string | null | undefined, direction: 1 | -1): number {
  const aTime = aDate ? new Date(aDate).getTime() : null;
  const bTime = bDate ? new Date(bDate).getTime() : null;
  if (aTime === null && bTime === null) return 0;
  if (aTime === null) return 1;
  if (bTime === null) return -1;
  return direction * (aTime - bTime);
}

function todayDateString(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function isDueTodayOrPast(dueDate?: string | null): boolean {
  if (!dueDate) return false;
  return new Date(dueDate) <= new Date(todayDateString());
}

const PAGE_TABS: { id: PageTab; label: string; icon: typeof Wrench }[] = [
  { id: 'equipment', label: 'Equipment Maintenance', icon: Wrench },
  { id: 'documents', label: 'Documents', icon: FileText },
  { id: 'vehicles', label: 'Vehicles', icon: Truck },
];

function daysUntil(dateStr?: string | null): number | null {
  if (!dateStr) return null;
  const due = new Date(dateStr);
  if (Number.isNaN(due.getTime())) return null;
  const today = new Date(todayDateString());
  return Math.round((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

function getExpiryColorClass(dateStr?: string | null): string {
  const days = daysUntil(dateStr);
  if (days === null) return 'text-slate-500';
  if (days <= 30) return 'text-red-600 font-medium';
  if (days <= 90) return 'text-amber-600 font-medium';
  return 'text-emerald-600 font-medium';
}

function compareDocuments(a: DocumentAsset, b: DocumentAsset, sortOption: DocumentSortKey): number {
  switch (sortOption) {
    case 'expiry_asc':
      return compareByDueDate(a.expiry_date, b.expiry_date, 1);
    case 'expiry_desc':
      return compareByDueDate(a.expiry_date, b.expiry_date, -1);
    case 'name_asc':
      return compareByName(a.equipment_name, b.equipment_name, 1);
    case 'name_desc':
      return compareByName(a.equipment_name, b.equipment_name, -1);
    case 'department_asc':
      return compareByName(a.site_location, b.site_location, 1);
    case 'overdue_first': {
      const aOverdue = (daysUntil(a.expiry_date) ?? Infinity) < 0;
      const bOverdue = (daysUntil(b.expiry_date) ?? Infinity) < 0;
      if (aOverdue !== bOverdue) return aOverdue ? -1 : 1;
      return compareByDueDate(a.expiry_date, b.expiry_date, 1);
    }
    default:
      return 0;
  }
}

function matchesDocumentStatusFilter(doc: DocumentAsset, filter: DocumentStatusFilter): boolean {
  if (filter === 'all') return true;
  const days = daysUntil(doc.expiry_date);
  if (days === null) return false;
  switch (filter) {
    case 'overdue':
      return days < 0;
    case 'within_7':
      return days >= 0 && days <= 7;
    case 'within_30':
      return days >= 0 && days <= 30;
    case 'within_90':
      return days >= 0 && days <= 90;
    default:
      return true;
  }
}

export default function MaintenanceTasksPage() {
  const [activeTab, setActiveTab] = useState<PageTab>('equipment');

  const [tasks, setTasks] = useState<MaintenanceTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [search, setSearch] = useState('');
  const [completingId, setCompletingId] = useState<string | null>(null);
  const [sortOption, setSortOption] = useState<SortKey>('due_asc');
  const [sortMenuOpen, setSortMenuOpen] = useState(false);

  const [documents, setDocuments] = useState<DocumentAsset[]>([]);
  const [documentsLoading, setDocumentsLoading] = useState(true);
  const [documentsError, setDocumentsError] = useState<string | null>(null);
  const [departmentFilter, setDepartmentFilter] = useState<string>('all');
  const [editingDocument, setEditingDocument] = useState<EditableAsset | null>(null);
  const [documentSortOption, setDocumentSortOption] = useState<DocumentSortKey>('expiry_asc');
  const [documentSortMenuOpen, setDocumentSortMenuOpen] = useState(false);
  const [documentStatusFilter, setDocumentStatusFilter] = useState<DocumentStatusFilter>('all');

  useEffect(() => {
    fetchData();
    fetchDocuments();
  }, []);

  async function fetchData() {
    try {
      const response = await fetch('/api/dashboard/tasks');
      if (!response.ok) {
        throw new Error(`Failed to load tasks: ${response.statusText}`);
      }
      const json: MaintenanceTask[] = await response.json();
      setTasks(json);
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
      const response = await fetch('/api/dashboard/assets?category=Document');
      if (!response.ok) {
        throw new Error(`Failed to load documents: ${response.statusText}`);
      }
      const json: DocumentAsset[] = await response.json();
      setDocuments(json);
    } catch (fetchError) {
      const message = fetchError instanceof Error ? fetchError.message : 'Unknown error';
      console.error('Error fetching documents:', fetchError);
      setDocumentsError(message);
    } finally {
      setDocumentsLoading(false);
    }
  }

  async function handleCompleteTask(taskId: string) {
    setCompletingId(taskId);
    try {
      const response = await fetch(`/api/workorders/${taskId}/complete`, {
        method: 'POST',
      });
      if (!response.ok) {
        throw new Error(`Failed to complete task: ${response.statusText}`);
      }
      await fetchData();
      window.dispatchEvent(new Event('technician-data-updated'));
    } catch (fetchError) {
      console.error('Error completing task:', fetchError);
    } finally {
      setCompletingId(null);
    }
  }

  const isOverdue = (task: MaintenanceTask) => Boolean(task.days_overdue && task.days_overdue > 0) && task.status !== 'completed';

  const compareTasks = (a: MaintenanceTask, b: MaintenanceTask): number => {
    switch (sortOption) {
      case 'due_asc':
        return compareByDueDate(a.due_date, b.due_date, 1);
      case 'due_desc':
        return compareByDueDate(a.due_date, b.due_date, -1);
      case 'equipment_asc':
        return compareByName(a.equipment_name, b.equipment_name, 1);
      case 'equipment_desc':
        return compareByName(a.equipment_name, b.equipment_name, -1);
      case 'technician_asc':
        return compareByName(a.technician_name, b.technician_name, 1);
      case 'technician_desc':
        return compareByName(a.technician_name, b.technician_name, -1);
      case 'status_overdue_first': {
        const aOverdue = isOverdue(a);
        const bOverdue = isOverdue(b);
        if (aOverdue !== bOverdue) return aOverdue ? -1 : 1;
        return compareByDueDate(a.due_date, b.due_date, 1);
      }
      case 'hours_desc': {
        const aHours = a.estimated_duration_hours ?? -Infinity;
        const bHours = b.estimated_duration_hours ?? -Infinity;
        return bHours - aHours;
      }
      default:
        return 0;
    }
  };

  const getStatusColor = (task: MaintenanceTask) => {
    if (task.status === 'completed') return 'bg-emerald-100 text-emerald-700';
    if (task.status === 'open' && isOverdue(task)) return 'bg-red-100 text-red-700';
    if (task.status === 'open') return 'bg-amber-100 text-amber-700';
    return 'bg-slate-100 text-slate-600';
  };

  const getStatusLabel = (task: MaintenanceTask) => {
    if (task.status === 'completed') return 'Completed';
    if (task.status === 'open' && isOverdue(task)) return 'Overdue';
    if (task.status === 'open') return 'Pending';
    return task.status ? task.status.replace('_', ' ') : 'Unknown';
  };

  const filteredTasks = tasks.filter((task) => {
    if (statusFilter !== 'all') {
      if (statusFilter === 'open' || statusFilter === 'pending') {
        if (task.status !== statusFilter) return false;
      } else if (task.status !== statusFilter) {
        return false;
      }
    }

    if (search.trim()) {
      const term = search.trim().toLowerCase();
      const matchesEquipment = task.equipment_name?.toLowerCase().includes(term);
      const matchesSite = task.site_location?.toLowerCase().includes(term);
      if (!matchesEquipment && !matchesSite) return false;
    }

    return true;
  });

  const sortedTasks = [...filteredTasks].sort(compareTasks);

  const activeSortLabel = SORT_OPTIONS.find((opt) => opt.key === sortOption)?.label || 'Sort';

  const departmentOptions = [...new Set(
    documents.map((doc) => doc.site_location).filter((loc): loc is string => Boolean(loc))
  )].sort();

  const filteredDocuments = documents
    .filter((doc) => departmentFilter === 'all' || doc.site_location === departmentFilter)
    .filter((doc) => matchesDocumentStatusFilter(doc, documentStatusFilter));

  const sortedDocuments = [...filteredDocuments].sort((a, b) => compareDocuments(a, b, documentSortOption));

  const activeDocumentSortLabel = DOCUMENT_SORT_OPTIONS.find((opt) => opt.key === documentSortOption)?.label || 'Sort';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Maintenance Tasks</h1>
        <p className="text-slate-500 mt-1">View work orders, documents, and project activities</p>
      </div>

      {/* Tab Switcher */}
      <div className="flex items-center gap-2 flex-wrap">
        {PAGE_TABS.map((tab) => {
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
              <p className="font-semibold">Failed to load maintenance tasks</p>
              <p className="text-sm mt-2">{error}</p>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="bg-white rounded-xl p-4 border border-slate-200">
                <p className="text-sm text-slate-500">Total</p>
                <p className="text-2xl font-bold text-slate-800">{tasks.length}</p>
              </div>
              <div className="bg-white rounded-xl p-4 border border-slate-200">
                <p className="text-sm text-slate-500">Open / Pending</p>
                <p className="text-2xl font-bold text-amber-600">{tasks.filter(t => t.status === 'open' || t.status === 'pending').length}</p>
              </div>
              <div className="bg-white rounded-xl p-4 border border-slate-200">
                <p className="text-sm text-slate-500">Completed</p>
                <p className="text-2xl font-bold text-emerald-600">{tasks.filter(t => t.status === 'completed').length}</p>
              </div>
              <div className="bg-white rounded-xl p-4 border border-slate-200">
                <p className="text-sm text-slate-500">Overdue</p>
                <p className="text-2xl font-bold text-red-600">{tasks.filter(isOverdue).length}</p>
              </div>
            </div>

            {/* Filters */}
            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
              <div className="flex items-center gap-2">
                <Filter size={18} className="text-slate-400" />
                <div className="flex gap-2">
                  {(['all', 'pending', 'open', 'approved', 'completed'] as StatusFilter[]).map((status) => (
                    <button
                      key={status}
                      onClick={() => setStatusFilter(status)}
                      className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors capitalize ${
                        statusFilter === status
                          ? 'bg-[#0f172a] text-white'
                          : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      {status}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-2 sm:ml-auto">
                <div className="relative sm:w-72">
                  <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search by equipment or site..."
                    className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                  />
                </div>
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setSortMenuOpen((prev) => !prev)}
                    className="flex items-center gap-2 px-3 py-2 text-sm font-medium bg-white text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap"
                  >
                    <ArrowUpDown size={16} className="text-slate-400" />
                    {activeSortLabel}
                    <ChevronDown size={14} className="text-slate-400" />
                  </button>
                  {sortMenuOpen && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setSortMenuOpen(false)} />
                      <div className="absolute right-0 mt-2 w-64 bg-white rounded-lg shadow-lg border border-slate-200 z-20 py-1">
                        {SORT_OPTIONS.map((opt) => (
                          <button
                            key={opt.key}
                            type="button"
                            onClick={() => {
                              setSortOption(opt.key);
                              setSortMenuOpen(false);
                            }}
                            className="w-full flex items-center justify-between gap-2 px-3 py-2 text-sm text-left hover:bg-slate-50 transition-colors"
                          >
                            <span className={sortOption === opt.key ? 'font-medium text-slate-800' : 'text-slate-600'}>
                              {opt.label}
                            </span>
                            {sortOption === opt.key && <Check size={16} className="text-cyan-600 flex-shrink-0" />}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Tasks Table */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200">
                      <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Equipment</th>
                      <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Site</th>
                      <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Technician</th>
                      <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</th>
                      <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Due Date</th>
                      <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Est. Hours</th>
                      <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {sortedTasks.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-6 py-12 text-center text-slate-500">
                          <Wrench size={40} className="mx-auto text-slate-300 mb-2" />
                          <p>No tasks found.</p>
                        </td>
                      </tr>
                    ) : (
                      sortedTasks.map((task) => (
                        <tr key={task.id} className="hover:bg-slate-50 transition-colors">
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-lg bg-cyan-500/10 flex items-center justify-center">
                                <Wrench size={16} className="text-cyan-600" />
                              </div>
                              <p className="font-medium text-slate-800">{task.equipment_name || '-'}</p>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-sm text-slate-600">{task.site_location || '-'}</td>
                          <td className="px-6 py-4 text-sm text-slate-600">{task.technician_name || '-'}</td>
                          <td className="px-6 py-4">
                            <span className={`px-2.5 py-1 rounded-full text-xs font-medium capitalize ${getStatusColor(task)}`}>
                              {getStatusLabel(task)}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-sm text-slate-600">
                            {task.due_date ? new Date(task.due_date).toLocaleDateString() : '-'}
                          </td>
                          <td className="px-6 py-4 text-sm text-slate-600">
                            {task.estimated_duration_hours != null ? `${task.estimated_duration_hours}h` : '-'}
                          </td>
                          <td className="px-6 py-4">
                            {task.status === 'open' && (
                              isDueTodayOrPast(task.due_date) ? (
                                <button
                                  onClick={() => handleCompleteTask(task.id)}
                                  disabled={completingId === task.id}
                                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-emerald-50 text-emerald-700 rounded-lg hover:bg-emerald-100 transition-colors disabled:opacity-50"
                                >
                                  {completingId === task.id ? (
                                    <Loader2 size={14} className="animate-spin" />
                                  ) : (
                                    <CheckCircle2 size={14} />
                                  )}
                                  Complete Task
                                </button>
                              ) : (
                                <span className="text-xs text-slate-400">Not due yet</span>
                              )
                            )}
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
            {/* Filters */}
            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
              <div className="flex items-center gap-2">
                <Filter size={18} className="text-slate-400" />
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
              </div>

              <div className="flex gap-2 flex-wrap">
                {DOCUMENT_STATUS_OPTIONS.map((opt) => (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => setDocumentStatusFilter(opt.key)}
                    className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                      documentStatusFilter === opt.key
                        ? 'bg-[#0f172a] text-white'
                        : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>

              <div className="relative sm:ml-auto">
                <button
                  type="button"
                  onClick={() => setDocumentSortMenuOpen((prev) => !prev)}
                  className="flex items-center gap-2 px-3 py-2 text-sm font-medium bg-white text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap"
                >
                  <ArrowUpDown size={16} className="text-slate-400" />
                  {activeDocumentSortLabel}
                  <ChevronDown size={14} className="text-slate-400" />
                </button>
                {documentSortMenuOpen && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setDocumentSortMenuOpen(false)} />
                    <div className="absolute right-0 mt-2 w-64 bg-white rounded-lg shadow-lg border border-slate-200 z-20 py-1">
                      {DOCUMENT_SORT_OPTIONS.map((opt) => (
                        <button
                          key={opt.key}
                          type="button"
                          onClick={() => {
                            setDocumentSortOption(opt.key);
                            setDocumentSortMenuOpen(false);
                          }}
                          className="w-full flex items-center justify-between gap-2 px-3 py-2 text-sm text-left hover:bg-slate-50 transition-colors"
                        >
                          <span className={documentSortOption === opt.key ? 'font-medium text-slate-800' : 'text-slate-600'}>
                            {opt.label}
                          </span>
                          {documentSortOption === opt.key && <Check size={16} className="text-cyan-600 flex-shrink-0" />}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200">
                      <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Item Name</th>
                      <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Category</th>
                      <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Department</th>
                      <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Expiry Date</th>
                      <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Reminder Days</th>
                      <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">In Charge</th>
                      <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {sortedDocuments.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-6 py-12 text-center text-slate-500">
                          <FileText size={40} className="mx-auto text-slate-300 mb-2" />
                          <p>No documents found.</p>
                        </td>
                      </tr>
                    ) : (
                      sortedDocuments.map((doc) => (
                        <tr key={doc.id} className="hover:bg-slate-50 transition-colors">
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-lg bg-cyan-500/10 flex items-center justify-center">
                                <FileText size={16} className="text-cyan-600" />
                              </div>
                              <p className="font-medium text-slate-800">{doc.equipment_name || '-'}</p>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-sm text-slate-600">{doc.type_name || '-'}</td>
                          <td className="px-6 py-4 text-sm text-slate-600">{doc.site_location || '-'}</td>
                          <td className={`px-6 py-4 text-sm ${getExpiryColorClass(doc.next_due_date)}`}>
                            {doc.next_due_date ? new Date(doc.next_due_date).toLocaleDateString() : '-'}
                          </td>
                          <td className="px-6 py-4 text-sm text-slate-600">{doc.reminder_days ?? '-'}</td>
                          <td className="px-6 py-4 text-sm text-slate-600">{doc.responsible_person || '-'}</td>
                          <td className="px-6 py-4">
                            <button
                              onClick={() => setEditingDocument(doc)}
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

      {activeTab === 'vehicles' && (
        <div className="flex flex-col items-center justify-center h-64 bg-white rounded-xl shadow-sm border border-slate-200">
          <Rocket size={40} className="text-slate-300 mb-3" />
          <p className="text-lg font-semibold text-slate-600">Coming Soon</p>
        </div>
      )}

      <AssetEditModal
        asset={editingDocument}
        onClose={() => setEditingDocument(null)}
        onSaved={fetchDocuments}
      />
    </div>
  );
}
