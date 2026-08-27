import { useEffect, useState } from 'react';
import {
  MapPin,
  Loader2,
  ClipboardList,
  CalendarDays,
  CheckCircle2,
  AlertTriangle,
  Plus,
  Save,
  Trash2,
} from 'lucide-react';
import Modal from './Modal';

interface SiteRecord {
  id: string;
  site_name: string;
  location?: string | null;
  description?: string | null;
}

interface SiteStat {
  site_location: string;
  equipment_count: number;
  document_count: number;
  vehicle_count: number;
  open_work_orders: number;
}

interface SiteTaskBreakdown {
  site_location: string;
  total_tasks: number;
  completed_tasks: number;
  open_tasks: number;
  overdue_tasks: number;
}

function todayIsoDate() {
  return new Date().toISOString().split('T')[0];
}

export default function SitesPage() {
  const [siteRecords, setSiteRecords] = useState<SiteRecord[]>([]);
  const [siteStats, setSiteStats] = useState<SiteStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedDate, setSelectedDate] = useState(todayIsoDate());
  const [siteTasks, setSiteTasks] = useState<SiteTaskBreakdown[]>([]);
  const [siteTasksLoading, setSiteTasksLoading] = useState(true);
  const [siteTasksError, setSiteTasksError] = useState<string | null>(null);

  const [addModalOpen, setAddModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({ site_name: '', location: '', description: '' });
  const [addError, setAddError] = useState<string | null>(null);

  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteErrors, setDeleteErrors] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    fetchSites();
  }, []);

  useEffect(() => {
    fetchSiteTasks(selectedDate);
  }, [selectedDate]);

  async function fetchSites() {
    try {
      const [listRes, statsRes] = await Promise.all([
        fetch('/api/dashboard/sites/list'),
        fetch('/api/dashboard/sites'),
      ]);
      if (!listRes.ok) {
        throw new Error(`Failed to load sites: ${listRes.statusText}`);
      }
      if (!statsRes.ok) {
        throw new Error(`Failed to load site stats: ${statsRes.statusText}`);
      }
      const listJson: SiteRecord[] = await listRes.json();
      const statsJson: SiteStat[] = await statsRes.json();
      setSiteRecords(listJson);
      setSiteStats(statsJson);
    } catch (fetchError) {
      const message = fetchError instanceof Error ? fetchError.message : 'Unknown error';
      console.error('Error fetching sites:', fetchError);
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  async function fetchSiteTasks(date: string) {
    setSiteTasksLoading(true);
    setSiteTasksError(null);
    try {
      const response = await fetch(`/api/dashboard/sites/tasks?date=${encodeURIComponent(date)}`);
      if (!response.ok) {
        throw new Error(`Failed to load site tasks: ${response.statusText}`);
      }
      const json: SiteTaskBreakdown[] = await response.json();
      setSiteTasks(json);
    } catch (fetchError) {
      const message = fetchError instanceof Error ? fetchError.message : 'Unknown error';
      console.error('Error fetching site tasks:', fetchError);
      setSiteTasksError(message);
    } finally {
      setSiteTasksLoading(false);
    }
  }

  function resetForm() {
    setFormData({ site_name: '', location: '', description: '' });
    setAddError(null);
  }

  async function handleSave() {
    if (!formData.site_name.trim()) return;

    setSaving(true);
    setAddError(null);
    try {
      const response = await fetch('/api/dashboard/sites/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          site_name: formData.site_name,
          location: formData.location || null,
          description: formData.description || null,
        }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error || `Failed to save site: ${response.statusText}`);
      }

      setAddModalOpen(false);
      resetForm();
      fetchSites();
    } catch (fetchError) {
      const message = fetchError instanceof Error ? fetchError.message : 'Unknown error';
      setAddError(message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(site: SiteRecord) {
    setDeletingId(site.id);
    setDeleteErrors((prev) => {
      const next = new Map(prev);
      next.delete(site.id);
      return next;
    });
    try {
      const response = await fetch(`/api/dashboard/sites/${site.id}`, { method: 'DELETE' });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error || `Failed to delete site: ${response.statusText}`);
      }
      fetchSites();
    } catch (fetchError) {
      const message = fetchError instanceof Error ? fetchError.message : 'Unknown error';
      setDeleteErrors((prev) => new Map(prev).set(site.id, message));
    } finally {
      setDeletingId(null);
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
          <p className="font-semibold">Failed to load sites</p>
          <p className="text-sm mt-2">{error}</p>
        </div>
      </div>
    );
  }

  const sites = siteRecords.map((record) => {
    const stat = siteStats.find((s) => s.site_location === record.site_name);
    return {
      ...record,
      equipment_count: Number(stat?.equipment_count || 0),
      document_count: Number(stat?.document_count || 0),
      vehicle_count: Number(stat?.vehicle_count || 0),
      open_work_orders: Number(stat?.open_work_orders || 0),
    };
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Sites</h1>
          <p className="text-slate-500 mt-1">Manage your facility locations</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <CalendarDays size={18} className="text-slate-400" />
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
            />
          </div>
          <button
            onClick={() => {
              resetForm();
              setAddModalOpen(true);
            }}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg font-medium text-sm bg-gradient-to-r from-cyan-500 to-blue-600 text-white hover:shadow-lg transition-shadow"
          >
            <Plus size={18} />
            Add New Site
          </button>
        </div>
      </div>

      {/* Task Breakdown by Site for Selected Date */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
        <h2 className="font-semibold text-slate-800 mb-4">
          Task Breakdown - {new Date(`${selectedDate}T00:00:00`).toLocaleDateString()}
        </h2>
        {siteTasksLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
          </div>
        ) : siteTasksError ? (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{siteTasksError}</p>
        ) : siteTasks.length === 0 ? (
          <p className="text-slate-500 text-sm text-center py-4">No tasks found for this date.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {siteTasks.map((site) => (
              <div key={site.site_location} className="border border-slate-200 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-3">
                  <MapPin size={16} className="text-teal-600" />
                  <h3 className="font-medium text-slate-800">{site.site_location}</h3>
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <p className="text-slate-500">Total</p>
                    <p className="font-semibold text-slate-800">{site.total_tasks}</p>
                  </div>
                  <div>
                    <p className="text-slate-500 flex items-center gap-1"><CheckCircle2 size={12} /> Completed</p>
                    <p className="font-semibold text-emerald-600">{site.completed_tasks}</p>
                  </div>
                  <div>
                    <p className="text-slate-500 flex items-center gap-1"><ClipboardList size={12} /> Open</p>
                    <p className="font-semibold text-amber-600">{site.open_tasks}</p>
                  </div>
                  <div>
                    <p className="text-slate-500 flex items-center gap-1"><AlertTriangle size={12} /> Overdue</p>
                    <p className="font-semibold text-red-600">{site.overdue_tasks}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl p-4 border border-slate-200">
          <p className="text-sm text-slate-500">Total Sites</p>
          <p className="text-2xl font-bold text-slate-800">{sites.length}</p>
        </div>
        <div className="bg-white rounded-xl p-4 border border-slate-200">
          <p className="text-sm text-slate-500">Total Open Work Orders</p>
          <p className="text-2xl font-bold text-amber-600">{sites.reduce((sum, s) => sum + s.open_work_orders, 0)}</p>
        </div>
      </div>

      {/* Sites Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {sites.length === 0 ? (
          <div className="col-span-full bg-white rounded-xl p-12 text-center border border-slate-200">
            <MapPin size={40} className="mx-auto text-slate-300 mb-2" />
            <p className="text-slate-500">No sites found. Click "Add New Site" to create one.</p>
          </div>
        ) : (
          sites.map((site) => (
            <div key={site.id} className="bg-white rounded-xl p-5 border border-slate-200 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-lg bg-teal-500/10 flex items-center justify-center flex-shrink-0">
                    <MapPin size={20} className="text-teal-600" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-semibold text-slate-800 truncate">{site.site_name}</h3>
                    {site.location && <p className="text-xs text-slate-500 truncate">{site.location}</p>}
                  </div>
                </div>
                <button
                  onClick={() => handleDelete(site)}
                  disabled={deletingId === site.id}
                  title="Delete site"
                  className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors flex-shrink-0 disabled:opacity-50"
                >
                  {deletingId === site.id ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                </button>
              </div>

              {site.description && (
                <p className="text-sm text-slate-500 mb-3">{site.description}</p>
              )}

              {deleteErrors.has(site.id) && (
                <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-2 py-1.5 mb-3">
                  {deleteErrors.get(site.id)}
                </p>
              )}

              <div className="flex flex-wrap gap-2 pt-3 border-t border-slate-100">
                <span className="px-2 py-1 rounded-lg bg-indigo-50 text-indigo-700 text-xs font-medium">
                  Equipment: {site.equipment_count}
                </span>
                <span className="px-2 py-1 rounded-lg bg-cyan-50 text-cyan-700 text-xs font-medium">
                  Documents: {site.document_count}
                </span>
                <span className="px-2 py-1 rounded-lg bg-slate-100 text-slate-600 text-xs font-medium">
                  Vehicles: {site.vehicle_count}
                </span>
              </div>

              <div className="flex items-center gap-2 text-sm text-slate-600 pt-3 mt-3 border-t border-slate-100">
                <ClipboardList size={16} className="text-amber-500" />
                <div>
                  <p className="font-semibold text-slate-800">{site.open_work_orders}</p>
                  <p className="text-xs text-slate-400">Open Tasks</p>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Add Site Modal */}
      <Modal
        isOpen={addModalOpen}
        onClose={() => setAddModalOpen(false)}
        title="Add New Site"
        size="md"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Site Name *</label>
            <input
              type="text"
              value={formData.site_name}
              onChange={(e) => setFormData({ ...formData, site_name: e.target.value })}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
              placeholder="e.g., Site E"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Location</label>
            <input
              type="text"
              value={formData.location}
              onChange={(e) => setFormData({ ...formData, location: e.target.value })}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
              placeholder="e.g., Building 3, North Wing"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
            <input
              type="text"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
              placeholder="Optional description"
            />
          </div>

          {addError && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{addError}</p>
          )}

          <div className="flex justify-end gap-3 pt-4">
            <button
              onClick={() => setAddModalOpen(false)}
              className="px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={!formData.site_name.trim() || saving}
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
    </div>
  );
}
