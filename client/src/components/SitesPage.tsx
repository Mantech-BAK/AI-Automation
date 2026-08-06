import { useEffect, useState } from 'react';
import {
  MapPin,
  Loader2,
  Cog,
  ClipboardList,
  CalendarDays,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';

interface Site {
  site_location: string;
  equipment_count: number;
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
  const [sites, setSites] = useState<Site[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedDate, setSelectedDate] = useState(todayIsoDate());
  const [siteTasks, setSiteTasks] = useState<SiteTaskBreakdown[]>([]);
  const [siteTasksLoading, setSiteTasksLoading] = useState(true);
  const [siteTasksError, setSiteTasksError] = useState<string | null>(null);

  useEffect(() => {
    fetchSites();
  }, []);

  useEffect(() => {
    fetchSiteTasks(selectedDate);
  }, [selectedDate]);

  async function fetchSites() {
    try {
      const response = await fetch('/api/dashboard/sites');
      if (!response.ok) {
        throw new Error(`Failed to load sites: ${response.statusText}`);
      }
      const json: Site[] = await response.json();
      setSites(json);
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Sites</h1>
          <p className="text-slate-500 mt-1">Facilities derived from your equipment locations</p>
        </div>
        <div className="flex items-center gap-2">
          <CalendarDays size={18} className="text-slate-400" />
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
          />
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
          <p className="text-2xl font-bold text-amber-600">{sites.reduce((sum, s) => sum + Number(s.open_work_orders || 0), 0)}</p>
        </div>
      </div>

      {/* Sites Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {sites.length === 0 ? (
          <div className="col-span-full bg-white rounded-xl p-12 text-center border border-slate-200">
            <MapPin size={40} className="mx-auto text-slate-300 mb-2" />
            <p className="text-slate-500">No sites found. Add equipment with a site location to see sites here.</p>
          </div>
        ) : (
          sites.map((site) => (
            <div key={site.site_location} className="bg-white rounded-xl p-5 border border-slate-200 hover:shadow-md transition-shadow">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-lg bg-teal-500/10 flex items-center justify-center">
                  <MapPin size={20} className="text-teal-600" />
                </div>
                <h3 className="font-semibold text-slate-800">{site.site_location}</h3>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-3 border-t border-slate-100">
                <div className="flex items-center gap-2 text-sm text-slate-600">
                  <Cog size={16} className="text-indigo-500" />
                  <div>
                    <p className="font-semibold text-slate-800">{site.equipment_count}</p>
                    <p className="text-xs text-slate-400">Equipment</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-sm text-slate-600">
                  <ClipboardList size={16} className="text-amber-500" />
                  <div>
                    <p className="font-semibold text-slate-800">{site.open_work_orders}</p>
                    <p className="text-xs text-slate-400">Open Tasks</p>
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
