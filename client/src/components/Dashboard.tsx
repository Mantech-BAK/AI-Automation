import { useEffect, useState } from 'react';
import {
  ClipboardList,
  Clock,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  FileText,
  Bell,
  Rocket,
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

interface DocumentAsset {
  id: string;
  equipment_name?: string | null;
  site_location?: string | null;
  type_name?: string | null;
  expiry_date?: string | null;
  reminder_days?: number | null;
  responsible_person?: string | null;
}

interface MaintenanceOverview {
  totalTasks: number;
  open: number;
  overdue: number;
  completed: number;
}

interface DocumentationOverview {
  totalDocuments: number;
  expiringWithin30: number;
  expiringWithin90: number;
  expired: number;
}

const DAY_FILTER_OPTIONS = [7, 14, 30, 60];

interface Notification {
  id: string;
  notification_type?: string;
  sent_at?: string;
  equipment_name?: string | null;
  site_location?: string | null;
}

export default function Dashboard() {
  const [maintenanceOverview, setMaintenanceOverview] = useState<MaintenanceOverview>({
    totalTasks: 0,
    open: 0,
    overdue: 0,
    completed: 0,
  });
  const [documentationOverview, setDocumentationOverview] = useState<DocumentationOverview>({
    totalDocuments: 0,
    expiringWithin30: 0,
    expiringWithin90: 0,
    expired: 0,
  });
  const [upcomingTasks, setUpcomingTasks] = useState<MaintenanceTask[]>([]);
  const [upcomingDays, setUpcomingDays] = useState(30);
  const [upcomingLoading, setUpcomingLoading] = useState(true);
  const [upcomingDocuments, setUpcomingDocuments] = useState<DocumentAsset[]>([]);
  const [documentDays, setDocumentDays] = useState(30);
  const [documentsLoading, setDocumentsLoading] = useState(true);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchData() {
      try {
        const [maintenanceRes, documentationRes, notificationsRes] = await Promise.all([
          fetch('/api/dashboard/overview/maintenance'),
          fetch('/api/dashboard/overview/documentation'),
          fetch('/api/dashboard/notifications'),
        ]);

        if (!maintenanceRes.ok) throw new Error(`Maintenance overview fetch failed: ${maintenanceRes.statusText}`);
        if (!documentationRes.ok) throw new Error(`Documentation overview fetch failed: ${documentationRes.statusText}`);
        if (!notificationsRes.ok) throw new Error(`Notifications fetch failed: ${notificationsRes.statusText}`);

        const maintenanceJson: MaintenanceOverview = await maintenanceRes.json();
        const documentationJson: DocumentationOverview = await documentationRes.json();
        const notificationsJson: Notification[] = await notificationsRes.json();

        setMaintenanceOverview(maintenanceJson);
        setDocumentationOverview(documentationJson);
        setNotifications(notificationsJson.slice(0, 5));
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
        const response = await fetch(`/api/dashboard/tasks?days=${upcomingDays}&category=Equipment`);
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

  useEffect(() => {
    async function fetchUpcomingDocuments() {
      setDocumentsLoading(true);
      try {
        const response = await fetch('/api/dashboard/assets?category=Document');
        if (!response.ok) throw new Error(`Documents fetch failed: ${response.statusText}`);
        const documents: DocumentAsset[] = await response.json();

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const cutoff = new Date(today);
        cutoff.setDate(cutoff.getDate() + documentDays);

        const filtered = documents
          .filter((doc) => Boolean(doc.expiry_date) && new Date(doc.expiry_date as string) <= cutoff)
          .sort((a, b) => new Date(a.expiry_date as string).getTime() - new Date(b.expiry_date as string).getTime());
        setUpcomingDocuments(filtered);
      } catch (fetchError) {
        console.error('Error fetching upcoming documents:', fetchError);
      } finally {
        setDocumentsLoading(false);
      }
    }

    fetchUpcomingDocuments();
  }, [documentDays]);

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

  const maintenanceStatCards = [
    { label: 'Total Tasks', value: maintenanceOverview.totalTasks, icon: ClipboardList, color: 'bg-slate-500' },
    { label: 'Open', value: maintenanceOverview.open, icon: Clock, color: 'bg-amber-500' },
    { label: 'Overdue', value: maintenanceOverview.overdue, icon: AlertTriangle, color: 'bg-red-500' },
    { label: 'Completed', value: maintenanceOverview.completed, icon: CheckCircle2, color: 'bg-emerald-500' },
  ];

  const documentationStatCards = [
    { label: 'Total Documents', value: documentationOverview.totalDocuments, icon: FileText, badge: null },
    { label: 'Expiring Within 30 Days', value: documentationOverview.expiringWithin30, icon: Clock, badge: 'bg-red-100 text-red-700' },
    { label: 'Expiring Within 90 Days', value: documentationOverview.expiringWithin90, icon: AlertTriangle, badge: 'bg-amber-100 text-amber-700' },
    { label: 'Already Expired', value: documentationOverview.expired, icon: AlertTriangle, badge: 'bg-red-600 text-white' },
  ];

  const daysUntil = (dateStr?: string | null): number | null => {
    if (!dateStr) return null;
    const due = new Date(dateStr);
    if (Number.isNaN(due.getTime())) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return Math.round((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  };

  const getDocumentExpiryColor = (dateStr?: string | null) => {
    const days = daysUntil(dateStr);
    if (days === null) return 'text-slate-400';
    if (days <= 30) return 'text-red-600 font-medium';
    if (days <= 90) return 'text-amber-600 font-medium';
    return 'text-emerald-600 font-medium';
  };

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
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Dashboard</h1>
        <p className="text-slate-500 mt-1">Overview of your maintenance operations</p>
      </div>

      {/* SECTIONS 1-3: Maintenance / Documentation / Vehicles, side by side on desktop */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:divide-x lg:divide-slate-200">
        {/* SECTION 1 - MAINTENANCE */}
        <section className="space-y-4 lg:pr-6">
          <h2 className="text-lg font-bold text-slate-800 uppercase tracking-wide">Maintenance</h2>

          <div className="grid grid-cols-2 gap-3">
            {maintenanceStatCards.map((stat) => {
              const Icon = stat.icon;
              return (
                <div
                  key={stat.label}
                  className="bg-white rounded-xl p-4 shadow-sm border border-slate-200 hover:shadow-md transition-shadow"
                >
                  <div className={`w-9 h-9 rounded-lg ${stat.color} bg-opacity-10 flex items-center justify-center mb-3`}>
                    <Icon size={18} />
                  </div>
                  <p className="text-2xl font-bold text-slate-800">{stat.value}</p>
                  <p className="text-xs text-slate-500 mt-1">{stat.label}</p>
                </div>
              );
            })}
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-slate-200">
            <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between gap-2">
              <h3 className="font-semibold text-slate-800 text-sm">Upcoming Maintenance</h3>
              <select
                value={upcomingDays}
                onChange={(e) => setUpcomingDays(Number(e.target.value))}
                className="px-2 py-1 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
              >
                {DAY_FILTER_OPTIONS.map((days) => (
                  <option key={days} value={days}>
                    Next {days} days
                  </option>
                ))}
              </select>
            </div>
            <div className="p-4 max-h-96 overflow-y-auto">
              {upcomingLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
                </div>
              ) : upcomingTasks.length === 0 ? (
                <p className="text-slate-500 text-sm text-center py-4">No upcoming maintenance tasks</p>
              ) : (
                <div className="space-y-3">
                  {upcomingTasks.map((task) => (
                    <div key={task.id} className="flex items-start gap-3 p-2 rounded-lg hover:bg-slate-50 transition-colors">
                      <div className={`w-2 h-2 rounded-full mt-2 flex-shrink-0 ${getStatusDotColor(task.status, task.days_overdue)}`} />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-slate-800 text-sm truncate">{task.equipment_name || 'Untitled task'}</p>
                        <p className="text-xs text-slate-500 mt-1 truncate">
                          {task.site_location || 'No site'} {task.due_date && `- ${new Date(task.due_date).toLocaleDateString()}`}
                        </p>
                      </div>
                      <span className={`px-2 py-1 rounded-full text-xs font-medium capitalize flex-shrink-0 ${getStatusBadgeColor(task.status, task.days_overdue)}`}>
                        {task.status}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </section>

        {/* SECTION 2 - DOCUMENTATION */}
        <section className="space-y-4 lg:px-6">
          <h2 className="text-lg font-bold text-slate-800 uppercase tracking-wide">Documentation</h2>

          <div className="grid grid-cols-2 gap-3">
            {documentationStatCards.map((stat) => {
              const Icon = stat.icon;
              return (
                <div
                  key={stat.label}
                  className="bg-white rounded-xl p-4 shadow-sm border border-slate-200 hover:shadow-md transition-shadow"
                >
                  <div className="flex items-center gap-2 mb-3">
                    <Icon size={16} className="text-slate-400" />
                  </div>
                  {stat.badge ? (
                    <span className={`inline-flex items-center px-3 py-1 rounded-full text-xl font-bold ${stat.badge}`}>
                      {stat.value}
                    </span>
                  ) : (
                    <p className="text-2xl font-bold text-slate-800">{stat.value}</p>
                  )}
                  <p className="text-xs text-slate-500 mt-2">{stat.label}</p>
                </div>
              );
            })}
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-slate-200">
            <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between gap-2">
              <h3 className="font-semibold text-slate-800 text-sm">Upcoming Document Renewals</h3>
              <select
                value={documentDays}
                onChange={(e) => setDocumentDays(Number(e.target.value))}
                className="px-2 py-1 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
              >
                {DAY_FILTER_OPTIONS.map((days) => (
                  <option key={days} value={days}>
                    Next {days} days
                  </option>
                ))}
              </select>
            </div>
            <div className="p-4 max-h-96 overflow-y-auto">
              {documentsLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
                </div>
              ) : upcomingDocuments.length === 0 ? (
                <p className="text-slate-500 text-sm text-center py-4">No upcoming document renewals</p>
              ) : (
                <div className="space-y-3">
                  {upcomingDocuments.map((doc) => (
                    <div key={doc.id} className="flex items-start gap-3 p-2 rounded-lg hover:bg-slate-50 transition-colors">
                      <div className="w-8 h-8 rounded-lg bg-cyan-500/10 flex items-center justify-center flex-shrink-0">
                        <FileText size={16} className="text-cyan-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-slate-800 text-sm truncate">{doc.equipment_name || 'Untitled document'}</p>
                        <p className="text-xs text-slate-500 mt-1 truncate">{doc.site_location || 'No department'}</p>
                      </div>
                      <span className={`text-xs flex-shrink-0 ${getDocumentExpiryColor(doc.expiry_date)}`}>
                        {doc.expiry_date ? new Date(doc.expiry_date).toLocaleDateString() : '-'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </section>

        {/* SECTION 3 - VEHICLES */}
        <section className="space-y-4 lg:pl-6">
          <h2 className="text-lg font-bold text-slate-800 uppercase tracking-wide">Vehicles</h2>

          <div className="flex flex-col items-center justify-center h-48 bg-white rounded-xl shadow-sm border border-slate-200">
            <Rocket size={36} className="text-slate-300 mb-3" />
            <p className="text-base font-semibold text-slate-600">Coming Soon</p>
          </div>
        </section>
      </div>

      <div className="border-t border-slate-200" />

      {/* SECTION 4 - RECENT NOTIFICATIONS */}
      <section className="space-y-4">
        <h2 className="text-lg font-bold text-slate-800 uppercase tracking-wide">Recent Notifications</h2>

        <div className="bg-white rounded-xl shadow-sm border border-slate-200">
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
      </section>
    </div>
  );
}
