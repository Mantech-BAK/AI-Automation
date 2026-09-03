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
  AlertTriangle,
  Clock,
  CalendarClock,
  CalendarDays,
  LayoutGrid,
  FileX,
  X,
  Car,
} from 'lucide-react';
import type { NavFilter } from '../App';

interface MaintenanceTask {
  id: string;
  asset_id?: string | number | null;
  task_type?: string | null;
  equipment_name?: string | null;
  document_name?: string | null;
  site_location?: string | null;
  department?: string | null;
  asset_department?: string | null;
  responsible_person?: string | null;
  frequency_days?: number | null;
  technician_name?: string | null;
  status?: string;
  due_date?: string | null;
  expiry_date?: string | null;
  planner_task_id?: string | null;
  created_at?: string | null;
  completed_at?: string | null;
  estimated_duration_hours?: number | null;
  days_overdue?: number;
}

interface HistoryRow {
  id: string;
  status?: string;
  due_date?: string | null;
  created_at?: string | null;
  completed_at?: string | null;
  planner_task_id?: string | null;
  technician_name?: string | null;
}

interface Vehicle {
  id: number;
  vehicle_no: string;
  vehicle_name: string;
  vehicle_type?: string | null;
  department?: string | null;
  total_tasks: number;
  expired_tasks: number;
  expiring_tasks: number;
}

interface VehicleUpcomingTask {
  id: number;
  vehicle_id: number;
  vehicle_no: string;
  vehicle_name: string;
  department?: string | null;
  task_type: string;
  expiry_date?: string | null;
  status: string;
}

interface MaintenanceTasksPageProps {
  initialFilter?: NavFilter | null;
  onNavigate?: (page: string, filter?: NavFilter) => void;
}

type PageTab = 'equipment' | 'documents' | 'vehicles';

type StatusFilter = 'all' | 'pending' | 'open' | 'approved' | 'completed';

type DayTile = 'overdue' | 'today' | '7' | '15' | '30' | 'all';
type DocTile = 'expired' | '7' | '15' | '30' | 'all';

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

const VALID_STATUS_FILTERS: StatusFilter[] = ['all', 'pending', 'open', 'approved', 'completed'];
const VALID_DAY_TILES: DayTile[] = ['overdue', 'today', '7', '15', '30', 'all'];
const VALID_DOC_TILES: DocTile[] = ['expired', '7', '15', '30', 'all'];

const DAY_TILES: { id: DayTile; label: string; color: string; activeColor: string; icon: typeof AlertTriangle }[] = [
  { id: 'overdue', label: 'Overdue', color: 'text-red-600 bg-red-50 border-red-200', activeColor: 'border-red-600 bg-red-100', icon: AlertTriangle },
  { id: 'today', label: 'Due Today', color: 'text-orange-600 bg-orange-50 border-orange-200', activeColor: 'border-orange-600 bg-orange-100', icon: Clock },
  { id: '7', label: 'Due Within 7 Days', color: 'text-yellow-600 bg-yellow-50 border-yellow-200', activeColor: 'border-yellow-600 bg-yellow-100', icon: CalendarClock },
  { id: '15', label: 'Due Within 15 Days', color: 'text-blue-600 bg-blue-50 border-blue-200', activeColor: 'border-blue-600 bg-blue-100', icon: CalendarDays },
  { id: '30', label: 'Due Within 30 Days', color: 'text-teal-600 bg-teal-50 border-teal-200', activeColor: 'border-teal-600 bg-teal-100', icon: CalendarDays },
  { id: 'all', label: 'All Tasks', color: 'text-slate-600 bg-slate-50 border-slate-200', activeColor: 'border-slate-500 bg-slate-200', icon: LayoutGrid },
];

const DOC_TILES: { id: DocTile; label: string; color: string; activeColor: string; icon: typeof AlertTriangle }[] = [
  { id: 'expired', label: 'Expired', color: 'text-red-600 bg-red-50 border-red-200', activeColor: 'border-red-600 bg-red-100', icon: FileX },
  { id: '7', label: 'Expiring Within 7 Days', color: 'text-orange-600 bg-orange-50 border-orange-200', activeColor: 'border-orange-600 bg-orange-100', icon: CalendarClock },
  { id: '15', label: 'Expiring Within 15 Days', color: 'text-yellow-600 bg-yellow-50 border-yellow-200', activeColor: 'border-yellow-600 bg-yellow-100', icon: CalendarDays },
  { id: '30', label: 'Expiring Within 30 Days', color: 'text-blue-600 bg-blue-50 border-blue-200', activeColor: 'border-blue-600 bg-blue-100', icon: CalendarDays },
  { id: 'all', label: 'All Documents', color: 'text-slate-600 bg-slate-50 border-slate-200', activeColor: 'border-slate-500 bg-slate-200', icon: LayoutGrid },
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
  { id: 'equipment', label: 'Equipments', icon: Wrench },
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

function matchesDayTile(task: MaintenanceTask, tile: DayTile): boolean {
  if (tile === 'all') return true;
  const isCompleted = task.status === 'completed';
  const days = daysUntil(task.due_date);

  if (tile === 'overdue') {
    return !isCompleted && days !== null && days < 0;
  }
  if (isCompleted || days === null) return false;
  if (tile === 'today') return days === 0;
  if (tile === '7') return days >= 0 && days <= 7;
  if (tile === '15') return days >= 0 && days <= 15;
  if (tile === '30') return days >= 0 && days <= 30;
  return true;
}

function matchesDocTile(task: MaintenanceTask, tile: DocTile): boolean {
  if (tile === 'all') return true;
  const days = daysUntil(task.expiry_date);
  if (days === null) return false;
  if (tile === 'expired') return days < 0;
  if (tile === '7') return days >= 0 && days <= 7;
  if (tile === '15') return days >= 0 && days <= 15;
  if (tile === '30') return days >= 0 && days <= 30;
  return true;
}

export default function MaintenanceTasksPage({ initialFilter, onNavigate }: MaintenanceTasksPageProps) {
  const initialTab: PageTab = (initialFilter?.tab && ['equipment', 'documents', 'vehicles'].includes(initialFilter.tab))
    ? (initialFilter.tab as PageTab)
    : 'equipment';
  const initialStatus: StatusFilter = VALID_STATUS_FILTERS.includes(initialFilter?.taskStatus as StatusFilter)
    ? (initialFilter!.taskStatus as StatusFilter)
    : 'all';
  const initialDayTile: DayTile = VALID_DAY_TILES.includes(initialFilter?.taskDayTile as DayTile)
    ? (initialFilter!.taskDayTile as DayTile)
    : 'all';
  const initialDocTile: DocTile = VALID_DOC_TILES.includes(initialFilter?.taskDocTile as DocTile)
    ? (initialFilter!.taskDocTile as DocTile)
    : 'all';

  const [activeTab, setActiveTab] = useState<PageTab>(initialTab);

  const [tasks, setTasks] = useState<MaintenanceTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(initialStatus);
  const [dayTileFilter, setDayTileFilter] = useState<DayTile>(initialDayTile);
  const [search, setSearch] = useState('');
  const [completingId, setCompletingId] = useState<string | null>(null);
  const [sortOption, setSortOption] = useState<SortKey>('due_asc');
  const [sortMenuOpen, setSortMenuOpen] = useState(false);

  const [documentTasks, setDocumentTasks] = useState<MaintenanceTask[]>([]);
  const [documentsLoading, setDocumentsLoading] = useState(true);
  const [documentsError, setDocumentsError] = useState<string | null>(null);
  const [renewingId, setRenewingId] = useState<string | null>(null);
  const [docTileFilter, setDocTileFilter] = useState<DocTile>(initialDocTile);

  const [selectedTask, setSelectedTask] = useState<MaintenanceTask | null>(null);
  const [historyRows, setHistoryRows] = useState<HistoryRow[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);

  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [vehiclesLoading, setVehiclesLoading] = useState(true);
  const [vehiclesError, setVehiclesError] = useState<string | null>(null);
  const [upcomingVehicleTasks, setUpcomingVehicleTasks] = useState<VehicleUpcomingTask[]>([]);
  const [upcomingVehicleTasksLoading, setUpcomingVehicleTasksLoading] = useState(true);

  useEffect(() => {
    fetchData();
    fetchDocumentTasks();
    fetchVehicles();
    fetchUpcomingVehicleTasks();
  }, []);

  async function fetchVehicles() {
    try {
      const response = await fetch('/api/vehicles');
      if (!response.ok) throw new Error(`Failed to load vehicles: ${response.statusText}`);
      const json: Vehicle[] = await response.json();
      setVehicles(json);
    } catch (fetchError) {
      const message = fetchError instanceof Error ? fetchError.message : 'Unknown error';
      console.error('Error fetching vehicles:', fetchError);
      setVehiclesError(message);
    } finally {
      setVehiclesLoading(false);
    }
  }

  async function fetchUpcomingVehicleTasks() {
    try {
      const response = await fetch('/api/vehicles/tasks/upcoming?days=30');
      if (!response.ok) throw new Error(`Failed to load upcoming vehicle tasks: ${response.statusText}`);
      const json: VehicleUpcomingTask[] = await response.json();
      setUpcomingVehicleTasks(json);
    } catch (fetchError) {
      console.error('Error fetching upcoming vehicle tasks:', fetchError);
    } finally {
      setUpcomingVehicleTasksLoading(false);
    }
  }

  async function fetchData() {
    try {
      const response = await fetch('/api/dashboard/tasks?task_type=equipment');
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

  async function fetchDocumentTasks() {
    try {
      // Only documents that already have a work order (created by the daily
      // check) show up here - not every document asset in the system.
      const response = await fetch('/api/dashboard/tasks?task_type=document');
      if (!response.ok) {
        throw new Error(`Failed to load document tasks: ${response.statusText}`);
      }
      const json: MaintenanceTask[] = await response.json();
      setDocumentTasks(json);
    } catch (fetchError) {
      const message = fetchError instanceof Error ? fetchError.message : 'Unknown error';
      console.error('Error fetching document tasks:', fetchError);
      setDocumentsError(message);
    } finally {
      setDocumentsLoading(false);
    }
  }

  async function fetchHistory(assetId: string | number) {
    setHistoryLoading(true);
    setHistoryError(null);
    try {
      const response = await fetch(`/api/dashboard/tasks/history/${assetId}`);
      if (!response.ok) {
        throw new Error(`Failed to load history: ${response.statusText}`);
      }
      const json: HistoryRow[] = await response.json();
      setHistoryRows(json);
    } catch (fetchError) {
      const message = fetchError instanceof Error ? fetchError.message : 'Unknown error';
      console.error('Error fetching task history:', fetchError);
      setHistoryError(message);
    } finally {
      setHistoryLoading(false);
    }
  }

  function openTaskDetail(task: MaintenanceTask) {
    setSelectedTask(task);
    setHistoryRows([]);
    if (task.asset_id) {
      fetchHistory(task.asset_id);
    }
  }

  function closeTaskDetail() {
    setSelectedTask(null);
    setHistoryRows([]);
    setHistoryError(null);
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

  async function handleDocumentRenewed(taskId: string) {
    setRenewingId(taskId);
    try {
      const response = await fetch(`/api/workorders/${taskId}/complete`, {
        method: 'POST',
      });
      if (!response.ok) {
        throw new Error(`Failed to complete task: ${response.statusText}`);
      }
      await fetchDocumentTasks();
    } catch (fetchError) {
      console.error('Error marking document as renewed:', fetchError);
    } finally {
      setRenewingId(null);
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

  const dayTileCounts: Record<DayTile, number> = {
    overdue: tasks.filter((t) => matchesDayTile(t, 'overdue')).length,
    today: tasks.filter((t) => matchesDayTile(t, 'today')).length,
    '7': tasks.filter((t) => matchesDayTile(t, '7')).length,
    '15': tasks.filter((t) => matchesDayTile(t, '15')).length,
    '30': tasks.filter((t) => matchesDayTile(t, '30')).length,
    all: tasks.length,
  };

  const docTileCounts: Record<DocTile, number> = {
    expired: documentTasks.filter((t) => matchesDocTile(t, 'expired')).length,
    '7': documentTasks.filter((t) => matchesDocTile(t, '7')).length,
    '15': documentTasks.filter((t) => matchesDocTile(t, '15')).length,
    '30': documentTasks.filter((t) => matchesDocTile(t, '30')).length,
    all: documentTasks.length,
  };

  const filteredTasks = tasks.filter((task) => {
    if (!matchesDayTile(task, dayTileFilter)) return false;

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

  const filteredDocumentTasks = documentTasks.filter((task) => matchesDocTile(task, docTileFilter));
  const sortedDocumentTasks = [...filteredDocumentTasks].sort((a, b) => compareByDueDate(a.expiry_date, b.expiry_date, 1));

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
            {/* Day-range filter tiles */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              {DAY_TILES.map((tile) => {
                const Icon = tile.icon;
                const isActive = dayTileFilter === tile.id;
                return (
                  <button
                    key={tile.id}
                    type="button"
                    onClick={() => setDayTileFilter(tile.id)}
                    className={`text-left rounded-xl p-3 border-2 transition-all cursor-pointer ${
                      isActive ? tile.activeColor : `${tile.color} hover:shadow-sm`
                    }`}
                  >
                    <Icon size={16} />
                    <p className="text-xl font-bold text-slate-800 mt-1">{dayTileCounts[tile.id]}</p>
                    <p className="text-xs text-slate-600 mt-0.5">{tile.label}</p>
                  </button>
                );
              })}
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
                        <tr
                          key={task.id}
                          onClick={() => openTaskDetail(task)}
                          className="hover:bg-slate-50 transition-colors cursor-pointer"
                        >
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
                          <td className="px-6 py-4" onClick={(e) => e.stopPropagation()}>
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
              <p className="font-semibold">Failed to load document tasks</p>
              <p className="text-sm mt-2">{documentsError}</p>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Expiry filter tiles */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              {DOC_TILES.map((tile) => {
                const Icon = tile.icon;
                const isActive = docTileFilter === tile.id;
                return (
                  <button
                    key={tile.id}
                    type="button"
                    onClick={() => setDocTileFilter(tile.id)}
                    className={`text-left rounded-xl p-3 border-2 transition-all cursor-pointer ${
                      isActive ? tile.activeColor : `${tile.color} hover:shadow-sm`
                    }`}
                  >
                    <Icon size={16} />
                    <p className="text-xl font-bold text-slate-800 mt-1">{docTileCounts[tile.id]}</p>
                    <p className="text-xs text-slate-600 mt-0.5">{tile.label}</p>
                  </button>
                );
              })}
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200">
                      <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Document Name</th>
                      <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Department</th>
                      <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Expiry Date</th>
                      <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</th>
                      <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {sortedDocumentTasks.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-6 py-12 text-center text-slate-500">
                          <FileText size={40} className="mx-auto text-slate-300 mb-2" />
                          <p>No document tasks yet. They appear here once the daily check creates one.</p>
                        </td>
                      </tr>
                    ) : (
                      sortedDocumentTasks.map((task) => (
                        <tr
                          key={task.id}
                          onClick={() => openTaskDetail(task)}
                          className="hover:bg-slate-50 transition-colors cursor-pointer"
                        >
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-lg bg-cyan-500/10 flex items-center justify-center">
                                <FileText size={16} className="text-cyan-600" />
                              </div>
                              <p className="font-medium text-slate-800">{task.document_name || '-'}</p>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-sm text-slate-600">{task.department || '-'}</td>
                          <td className={`px-6 py-4 text-sm ${getExpiryColorClass(task.expiry_date)}`}>
                            {task.expiry_date ? new Date(task.expiry_date).toLocaleDateString() : '-'}
                          </td>
                          <td className="px-6 py-4">
                            <span className={`px-2.5 py-1 rounded-full text-xs font-medium capitalize ${getStatusColor(task)}`}>
                              {getStatusLabel(task)}
                            </span>
                          </td>
                          <td className="px-6 py-4" onClick={(e) => e.stopPropagation()}>
                            {task.status !== 'completed' && (
                              <button
                                onClick={() => handleDocumentRenewed(task.id)}
                                disabled={renewingId === task.id}
                                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-emerald-50 text-emerald-700 rounded-lg hover:bg-emerald-100 transition-colors disabled:opacity-50"
                              >
                                {renewingId === task.id ? (
                                  <Loader2 size={14} className="animate-spin" />
                                ) : (
                                  <CheckCircle2 size={14} />
                                )}
                                Document Renewed
                              </button>
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

      {activeTab === 'vehicles' && (
        vehiclesLoading ? (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
          </div>
        ) : vehiclesError ? (
          <div className="flex items-center justify-center h-64">
            <div className="text-red-600 bg-red-50 border border-red-200 rounded-xl p-6">
              <p className="font-semibold">Failed to load vehicles</p>
              <p className="text-sm mt-2">{vehiclesError}</p>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            {(() => {
              const vehiclesWithTasks = vehicles.filter((v) => v.expired_tasks > 0 || v.expiring_tasks > 0);
              return vehiclesWithTasks.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-48 bg-white rounded-xl shadow-sm border border-slate-200">
                  <Car size={36} className="text-slate-300 mb-3" />
                  <p className="text-slate-500">No vehicles with expiring or overdue tasks</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  {vehiclesWithTasks.map((vehicle) => (
                    <button
                      key={vehicle.id}
                      type="button"
                      onClick={() => onNavigate && onNavigate('equipment', { tab: 'vehicles', vehicleId: vehicle.id })}
                      className={`text-left rounded-xl p-4 border-2 shadow-sm hover:shadow-md transition-all cursor-pointer ${
                        vehicle.expired_tasks > 0 ? 'border-red-200 bg-red-50' : 'border-orange-200 bg-orange-50'
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <Car size={16} className={vehicle.expired_tasks > 0 ? 'text-red-600' : 'text-orange-600'} />
                        <p className="font-bold text-slate-800">{vehicle.vehicle_no}</p>
                      </div>
                      <p className="text-sm text-slate-600 truncate">{vehicle.vehicle_name}</p>
                      <div className="flex items-center gap-3 mt-2 text-xs">
                        {vehicle.expired_tasks > 0 && (
                          <span className="text-red-600 font-medium">{vehicle.expired_tasks} overdue</span>
                        )}
                        {vehicle.expiring_tasks > 0 && (
                          <span className="text-orange-600 font-medium">{vehicle.expiring_tasks} expiring soon</span>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              );
            })()}

            <div>
              <h3 className="text-sm font-semibold text-slate-800 mb-3">Vehicle Tasks Due Within 30 Days</h3>
              {upcomingVehicleTasksLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
                </div>
              ) : (
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200">
                          <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Vehicle</th>
                          <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Task Type</th>
                          <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Department</th>
                          <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Expiry Date</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {upcomingVehicleTasks.length === 0 ? (
                          <tr>
                            <td colSpan={4} className="px-6 py-12 text-center text-slate-500">
                              <Car size={40} className="mx-auto text-slate-300 mb-2" />
                              <p>No vehicle tasks due within 30 days.</p>
                            </td>
                          </tr>
                        ) : (
                          upcomingVehicleTasks.map((task) => (
                            <tr
                              key={task.id}
                              onClick={() => onNavigate && onNavigate('equipment', { tab: 'vehicles', vehicleId: task.vehicle_id })}
                              className="hover:bg-slate-50 transition-colors cursor-pointer"
                            >
                              <td className="px-6 py-4">
                                <p className="font-medium text-slate-800">{task.vehicle_no}</p>
                                <p className="text-xs text-slate-500">{task.vehicle_name}</p>
                              </td>
                              <td className="px-6 py-4 text-sm text-slate-600">{task.task_type}</td>
                              <td className="px-6 py-4 text-sm text-slate-600">{task.department || '-'}</td>
                              <td className={`px-6 py-4 text-sm ${getExpiryColorClass(task.expiry_date)}`}>
                                {task.expiry_date ? new Date(task.expiry_date).toLocaleDateString() : '-'}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </div>
        )
      )}

      {/* Task detail panel */}
      {selectedTask && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/50" onClick={closeTaskDetail} />
          <div className="relative bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
              <h2 className="text-lg font-semibold text-slate-800">
                {selectedTask.equipment_name || selectedTask.document_name || 'Task Details'}
              </h2>
              <button
                onClick={closeTaskDetail}
                className="p-1 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <X size={20} className="text-slate-500" />
              </button>
            </div>
            <div className="overflow-y-auto p-6 space-y-6">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-slate-400 text-xs uppercase tracking-wide">Site</p>
                  <p className="text-slate-800 font-medium">{selectedTask.site_location || '-'}</p>
                </div>
                <div>
                  <p className="text-slate-400 text-xs uppercase tracking-wide">Department</p>
                  <p className="text-slate-800 font-medium">{selectedTask.asset_department || selectedTask.department || '-'}</p>
                </div>
                <div>
                  <p className="text-slate-400 text-xs uppercase tracking-wide">Technician</p>
                  <p className="text-slate-800 font-medium">{selectedTask.technician_name || '-'}</p>
                </div>
                <div>
                  <p className="text-slate-400 text-xs uppercase tracking-wide">Responsible Person</p>
                  <p className="text-slate-800 font-medium">{selectedTask.responsible_person || '-'}</p>
                </div>
                {selectedTask.task_type === 'document' && (
                  <div>
                    <p className="text-slate-400 text-xs uppercase tracking-wide">Renewal Frequency</p>
                    <p className="text-slate-800 font-medium">
                      {selectedTask.frequency_days != null ? `Every ${selectedTask.frequency_days} days` : '-'}
                    </p>
                  </div>
                )}
                <div>
                  <p className="text-slate-400 text-xs uppercase tracking-wide">Status</p>
                  <span className={`inline-block mt-0.5 px-2.5 py-1 rounded-full text-xs font-medium capitalize ${getStatusColor(selectedTask)}`}>
                    {getStatusLabel(selectedTask)}
                  </span>
                </div>
                <div>
                  <p className="text-slate-400 text-xs uppercase tracking-wide">
                    {selectedTask.task_type === 'document' ? 'Expiry Date' : 'Due Date'}
                  </p>
                  <p className="text-slate-800 font-medium">
                    {(selectedTask.task_type === 'document' ? selectedTask.expiry_date : selectedTask.due_date)
                      ? new Date((selectedTask.task_type === 'document' ? selectedTask.expiry_date : selectedTask.due_date) as string).toLocaleDateString()
                      : '-'}
                  </p>
                </div>
                <div>
                  <p className="text-slate-400 text-xs uppercase tracking-wide">Estimated Hours</p>
                  <p className="text-slate-800 font-medium">
                    {selectedTask.estimated_duration_hours != null ? `${selectedTask.estimated_duration_hours}h` : '-'}
                  </p>
                </div>
                <div>
                  <p className="text-slate-400 text-xs uppercase tracking-wide">Planner Task ID</p>
                  <p className="text-slate-800 font-medium truncate">{selectedTask.planner_task_id || '-'}</p>
                </div>
                <div>
                  <p className="text-slate-400 text-xs uppercase tracking-wide">Created</p>
                  <p className="text-slate-800 font-medium">
                    {selectedTask.created_at ? new Date(selectedTask.created_at).toLocaleDateString() : '-'}
                  </p>
                </div>
                {selectedTask.status === 'completed' && (
                  <div>
                    <p className="text-slate-400 text-xs uppercase tracking-wide">Completed</p>
                    <p className="text-slate-800 font-medium">
                      {selectedTask.completed_at ? new Date(selectedTask.completed_at).toLocaleDateString() : '-'}
                    </p>
                  </div>
                )}
              </div>

              <div>
                <h3 className="text-sm font-semibold text-slate-800 mb-2">Task History</h3>
                {historyLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
                  </div>
                ) : historyError ? (
                  <p className="text-sm text-red-600">{historyError}</p>
                ) : historyRows.length === 0 ? (
                  <p className="text-sm text-slate-500">No previous work orders for this asset.</p>
                ) : (
                  <div className="border border-slate-200 rounded-lg overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200">
                          <th className="text-left px-4 py-2 text-xs font-semibold text-slate-500 uppercase">Date</th>
                          <th className="text-left px-4 py-2 text-xs font-semibold text-slate-500 uppercase">Technician</th>
                          <th className="text-left px-4 py-2 text-xs font-semibold text-slate-500 uppercase">Status</th>
                          <th className="text-left px-4 py-2 text-xs font-semibold text-slate-500 uppercase">Completed</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {historyRows.map((row) => (
                          <tr key={row.id}>
                            <td className="px-4 py-2 text-slate-600">
                              {row.created_at ? new Date(row.created_at).toLocaleDateString() : '-'}
                            </td>
                            <td className="px-4 py-2 text-slate-600">{row.technician_name || '-'}</td>
                            <td className="px-4 py-2 text-slate-600 capitalize">{row.status || '-'}</td>
                            <td className="px-4 py-2 text-slate-600">
                              {row.completed_at ? new Date(row.completed_at).toLocaleDateString() : '-'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
