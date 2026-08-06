import { useEffect, useState } from 'react';
import {
  ClipboardList,
  Clock,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  CalendarClock,
  MapPin,
  Cog,
  Users,
  ArrowRight,
  Bell,
} from 'lucide-react';

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

interface CompletedTask {
  id: string;
  equipment_name?: string | null;
  site_location?: string | null;
  technician_name?: string | null;
  due_date?: string | null;
  completed_at?: string | null;
}

const DAY_FILTER_OPTIONS = [3, 7, 10, 20, 30];

interface Notification {
  id: string;
  notification_type?: string;
  sent_at?: string;
  equipment_name?: string | null;
  site_location?: string | null;
}

interface Overview {
  totalTasks: number;
  pending: number;
  inProgress: number;
  completed: number;
  overdue: number;
  dueSoon: number;
  sites: number;
  equipment: number;
  technicians: number;
}

export default function Dashboard({ onNavigate }: { onNavigate: (page: string) => void }) {
  const [overview, setOverview] = useState<Overview>({
    totalTasks: 0,
    pending: 0,
    inProgress: 0,
    completed: 0,
    overdue: 0,
    dueSoon: 0,
    sites: 0,
    equipment: 0,
    technicians: 0,
  });
  const [upcomingTasks, setUpcomingTasks] = useState<MaintenanceTask[]>([]);
  const [upcomingDays, setUpcomingDays] = useState(7);
  const [upcomingLoading, setUpcomingLoading] = useState(true);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [completedTasks, setCompletedTasks] = useState<CompletedTask[]>([]);
  const [completedThisMonth, setCompletedThisMonth] = useState(0);
  const [totalThisMonth, setTotalThisMonth] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchData() {
      try {
        const [overviewRes, notificationsRes, completedRes] = await Promise.all([
          fetch('/api/dashboard/overview'),
          fetch('/api/dashboard/notifications'),
          fetch('/api/dashboard/tasks/completed'),
        ]);

        if (!overviewRes.ok) throw new Error(`Overview fetch failed: ${overviewRes.statusText}`);
        if (!notificationsRes.ok) throw new Error(`Notifications fetch failed: ${notificationsRes.statusText}`);
        if (!completedRes.ok) throw new Error(`Completed tasks fetch failed: ${completedRes.statusText}`);

        const overviewJson: Overview = await overviewRes.json();
        const notificationsJson: Notification[] = await notificationsRes.json();
        const completedJson = await completedRes.json();

        setOverview(overviewJson);
        setNotifications(notificationsJson.slice(0, 5));
        setCompletedTasks(completedJson.tasks || []);
        setCompletedThisMonth(completedJson.completed_this_month || 0);
        setTotalThisMonth(completedJson.total_this_month || 0);
      } catch (fetchError) {
        const message = fetchError instanceof Error ? fetchError.message : 'Unknown error';
        console.error('Error fetching dashboard data:', fetchError);
        setError(message);
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, []);

  useEffect(() => {
    async function fetchUpcomingTasks() {
      setUpcomingLoading(true);
      try {
        const response = await fetch(`/api/dashboard/tasks?days=${upcomingDays}`);
        if (!response.ok) throw new Error(`Tasks fetch failed: ${response.statusText}`);
        const tasks: MaintenanceTask[] = await response.json();

        const sorted = [...tasks].sort((a, b) => {
          if (!a.due_date && !b.due_date) return 0;
          if (!a.due_date) return 1;
          if (!b.due_date) return -1;
          return new Date(a.due_date).getTime() - new Date(b.due_date).getTime();
        });
        setUpcomingTasks(sorted);
      } catch (fetchError) {
        console.error('Error fetching upcoming tasks:', fetchError);
      } finally {
        setUpcomingLoading(false);
      }
    }

    fetchUpcomingTasks();
  }, [upcomingDays]);

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
          <p className="font-semibold">Failed to load dashboard data</p>
          <p className="text-sm mt-2">{error}</p>
        </div>
      </div>
    );
  }

  const statCards = [
    { label: 'Total Tasks', value: overview.totalTasks, icon: ClipboardList, color: 'bg-slate-500', textColor: 'text-slate-600' },
    { label: 'Pending', value: overview.pending, icon: Clock, color: 'bg-amber-500', textColor: 'text-amber-600' },
    { label: 'In Progress', value: overview.inProgress, icon: Loader2, color: 'bg-blue-500', textColor: 'text-blue-600' },
    { label: 'Completed', value: overview.completed, icon: CheckCircle2, color: 'bg-emerald-500', textColor: 'text-emerald-600' },
    { label: 'Overdue', value: overview.overdue, icon: AlertTriangle, color: 'bg-red-500', textColor: 'text-red-600' },
    { label: 'Due Soon', value: overview.dueSoon, icon: CalendarClock, color: 'bg-purple-500', textColor: 'text-purple-600' },
  ];

  const getStatusDotColor = (status?: string, daysOverdue?: number) => {
    if (status === 'completed') return 'bg-emerald-500';
    if (daysOverdue && daysOverdue > 0) return 'bg-red-500';
    return 'bg-amber-500';
  };

  const getStatusBadgeColor = (status?: string, daysOverdue?: number) => {
    if (status === 'completed') return 'bg-emerald-100 text-emerald-700';
    if (daysOverdue && daysOverdue > 0) return 'bg-red-100 text-red-700';
    return 'bg-amber-100 text-amber-700';
  };

  const getNotificationColor = (type?: string) => {
    switch (type) {
      case 'escalation': return 'bg-red-500';
      case 'creation': return 'bg-blue-500';
      case 'reminder7':
      case 'reminder3':
      case 'reminder1': return 'bg-amber-500';
      case 'teams': return 'bg-purple-500';
      default: return 'bg-blue-500';
    }
  };

  const getNotificationIconColor = (type?: string) => {
    switch (type) {
      case 'escalation': return 'text-red-600';
      case 'creation': return 'text-blue-600';
      case 'reminder7':
      case 'reminder3':
      case 'reminder1': return 'text-amber-600';
      case 'teams': return 'text-purple-600';
      default: return 'text-blue-600';
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Dashboard</h1>
        <p className="text-slate-500 mt-1">Overview of your maintenance operations</p>
      </div>

      {/* Task Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {statCards.map((stat) => {
          const Icon = stat.icon;
          return (
            <div
              key={stat.label}
              className="bg-white rounded-xl p-4 shadow-sm border border-slate-200 hover:shadow-md transition-shadow"
            >
              <div className={`w-10 h-10 rounded-lg ${stat.color} bg-opacity-10 flex items-center justify-center mb-3`}>
                <Icon size={20} className={stat.icon === Loader2 ? 'animate-spin' : ''} />
              </div>
              <p className="text-2xl font-bold text-slate-800">{stat.value}</p>
              <p className="text-xs text-slate-500 mt-1">{stat.label}</p>
            </div>
          );
        })}
      </div>

      {/* Completed Tasks */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <h2 className="font-semibold text-slate-800">Completed Tasks</h2>
          <span className="text-sm text-slate-500">
            {completedThisMonth} / {totalThisMonth} completed this month
          </span>
        </div>
        <div className="p-6">
          {completedTasks.length === 0 ? (
            <p className="text-slate-500 text-sm text-center py-4">No completed tasks yet</p>
          ) : (
            <div className="space-y-3">
              {completedTasks.map((task) => (
                <div key={task.id} className="flex items-center gap-4 p-3 rounded-lg hover:bg-slate-50 transition-colors">
                  <div className="w-8 h-8 rounded-full bg-emerald-500/10 flex items-center justify-center flex-shrink-0">
                    <CheckCircle2 size={16} className="text-emerald-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-slate-800 text-sm truncate">{task.equipment_name || 'Untitled task'}</p>
                    <p className="text-xs text-slate-500 mt-1">
                      {task.site_location || 'No site'} {task.technician_name && `- ${task.technician_name}`}
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-xs text-slate-500">
                      Due {task.due_date ? new Date(task.due_date).toLocaleDateString() : '-'}
                    </p>
                    <p className="text-xs text-emerald-600 font-medium">
                      Completed {task.completed_at ? new Date(task.completed_at).toLocaleDateString() : '-'}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Resource Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Sites */}
        <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-teal-500/10 flex items-center justify-center">
                <MapPin size={20} className="text-teal-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-800">{overview.sites}</p>
                <p className="text-xs text-slate-500">Sites</p>
              </div>
            </div>
            <button
              onClick={() => onNavigate('sites')}
              className="text-slate-400 hover:text-teal-600 transition-colors"
            >
              <ArrowRight size={20} />
            </button>
          </div>
          <p
            onClick={() => onNavigate('sites')}
            className="text-sm text-teal-600 hover:text-teal-700 cursor-pointer font-medium"
          >
            View all sites
          </p>
        </div>

        {/* Equipment */}
        <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-indigo-500/10 flex items-center justify-center">
                <Cog size={20} className="text-indigo-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-800">{overview.equipment}</p>
                <p className="text-xs text-slate-500">Equipment</p>
              </div>
            </div>
            <button
              onClick={() => onNavigate('equipment')}
              className="text-slate-400 hover:text-indigo-600 transition-colors"
            >
              <ArrowRight size={20} />
            </button>
          </div>
          <p
            onClick={() => onNavigate('equipment')}
            className="text-sm text-indigo-600 hover:text-indigo-700 cursor-pointer font-medium"
          >
            View all equipment
          </p>
        </div>

        {/* Technicians */}
        <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-cyan-500/10 flex items-center justify-center">
                <Users size={20} className="text-cyan-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-800">{overview.technicians}</p>
                <p className="text-xs text-slate-500">Technicians</p>
              </div>
            </div>
            <button
              onClick={() => onNavigate('technicians')}
              className="text-slate-400 hover:text-cyan-600 transition-colors"
            >
              <ArrowRight size={20} />
            </button>
          </div>
          <p
            onClick={() => onNavigate('technicians')}
            className="text-sm text-cyan-600 hover:text-cyan-700 cursor-pointer font-medium"
          >
            View all technicians
          </p>
        </div>
      </div>

      {/* Bottom Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Upcoming Maintenance */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200">
          <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between gap-3">
            <h2 className="font-semibold text-slate-800">Upcoming Maintenance</h2>
            <select
              value={upcomingDays}
              onChange={(e) => setUpcomingDays(Number(e.target.value))}
              className="px-2.5 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
            >
              {DAY_FILTER_OPTIONS.map((days) => (
                <option key={days} value={days}>
                  Next {days} days
                </option>
              ))}
            </select>
          </div>
          <div className="p-6">
            {upcomingLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
              </div>
            ) : upcomingTasks.length === 0 ? (
              <p className="text-slate-500 text-sm text-center py-4">No upcoming maintenance tasks</p>
            ) : (
              <div className="space-y-4">
                {upcomingTasks.map((task) => (
                  <div key={task.id} className="flex items-start gap-4 p-3 rounded-lg hover:bg-slate-50 transition-colors">
                    <div className={`w-2 h-2 rounded-full mt-2 ${getStatusDotColor(task.status, task.days_overdue)}`} />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-slate-800 text-sm truncate">{task.equipment_name || 'Untitled task'}</p>
                      <p className="text-xs text-slate-500 mt-1">
                        {task.site_location || 'No site'} {task.due_date && `- ${new Date(task.due_date).toLocaleDateString()}`}
                      </p>
                    </div>
                    <span className={`px-2 py-1 rounded-full text-xs font-medium capitalize ${getStatusBadgeColor(task.status, task.days_overdue)}`}>
                      {task.status}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Recent Notifications */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200">
          <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
            <h2 className="font-semibold text-slate-800">Recent Notifications</h2>
            <button
              onClick={() => onNavigate('notifications')}
              className="text-sm text-cyan-600 hover:text-cyan-700 font-medium"
            >
              View all
            </button>
          </div>
          <div className="p-6">
            {notifications.length === 0 ? (
              <p className="text-slate-500 text-sm text-center py-4">No notifications today</p>
            ) : (
              <div className="space-y-4">
                {notifications.map((notif) => (
                  <div key={notif.id} className="flex items-start gap-4 p-3 rounded-lg hover:bg-slate-50 transition-colors">
                    <div className={`w-8 h-8 rounded-full ${getNotificationColor(notif.notification_type)} bg-opacity-15 flex items-center justify-center flex-shrink-0`}>
                      <Bell size={16} className={getNotificationIconColor(notif.notification_type)} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-slate-800 text-sm truncate capitalize">{notif.notification_type}</p>
                      <p className="text-xs text-slate-500 mt-1 line-clamp-1">
                        {[notif.equipment_name, notif.site_location].filter(Boolean).join(' - ') || 'No details'}
                      </p>
                      {notif.sent_at && (
                        <p className="text-xs text-slate-400 mt-1">
                          {new Date(notif.sent_at).toLocaleDateString()} {new Date(notif.sent_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
