import { useEffect, useState } from 'react';
import {
  Bell,
  Loader2,
  AlertTriangle,
  PlusCircle,
  Clock,
  MessageSquare,
} from 'lucide-react';

interface Notification {
  id: string;
  notification_type: string;
  sent_at: string;
  notes?: string | null;
  description?: string | null;
  equipment_name?: string | null;
  site_location?: string | null;
}

const TYPE_LABELS: Record<string, string> = {
  document_task_created: 'Document Task Created',
  document_reminder: 'Document Reminder',
  equipment_reminder: 'Equipment Reminder',
  equipment_task_created: 'Equipment Task Created',
  task_created: 'Task Created',
};

function getNotificationDescription(notif: Notification): string {
  if (notif.notes) {
    try {
      const parsed = JSON.parse(notif.notes);
      const name: string | undefined = parsed.document_name || parsed.equipment_name;
      const department: string | undefined = parsed.department;
      if (name) {
        return [name, department].filter(Boolean).join(' - ');
      }
    } catch {
      return notif.notes;
    }
  }

  return (
    [notif.description || notif.equipment_name, notif.site_location].filter(Boolean).join(' - ') ||
    'No details available'
  );
}

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchNotifications();
  }, []);

  async function fetchNotifications() {
    try {
      const response = await fetch('/api/dashboard/notifications');
      if (!response.ok) {
        throw new Error(`Failed to load notifications: ${response.statusText}`);
      }
      const json: Notification[] = await response.json();
      setNotifications(json);
    } catch (fetchError) {
      const message = fetchError instanceof Error ? fetchError.message : 'Unknown error';
      console.error('Error fetching notifications:', fetchError);
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'escalation': return <AlertTriangle size={20} className="text-red-600" />;
      case 'creation': return <PlusCircle size={20} className="text-blue-600" />;
      case 'reminder7':
      case 'reminder3':
      case 'reminder1': return <Clock size={20} className="text-amber-600" />;
      case 'teams': return <MessageSquare size={20} className="text-purple-600" />;
      default: return <Bell size={20} className="text-slate-600" />;
    }
  };

  const getTypeBg = (type: string) => {
    switch (type) {
      case 'escalation': return 'bg-red-100';
      case 'creation': return 'bg-blue-100';
      case 'reminder7':
      case 'reminder3':
      case 'reminder1': return 'bg-amber-100';
      case 'teams': return 'bg-purple-100';
      default: return 'bg-slate-100';
    }
  };

  const formatTypeLabel = (type: string) => {
    if (TYPE_LABELS[type]) return TYPE_LABELS[type];
    return type
      .replace(/([a-z])(\d)/i, '$1 $2')
      .replace(/_/g, ' ')
      .split(' ')
      .filter(Boolean)
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

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
          <p className="font-semibold">Failed to load notifications</p>
          <p className="text-sm mt-2">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Notifications</h1>
        <p className="text-slate-500 mt-1">
          {notifications.length > 0 ? `${notifications.length} notifications today` : 'No notifications today'}
        </p>
      </div>

      {/* Notifications List */}
      <div className="space-y-3">
        {notifications.length === 0 ? (
          <div className="bg-white rounded-xl p-12 text-center border border-slate-200">
            <Bell size={40} className="mx-auto text-slate-300 mb-2" />
            <p className="text-slate-500">No notifications found</p>
          </div>
        ) : (
          notifications.map((notif) => (
            <div
              key={notif.id}
              className="bg-white rounded-xl p-5 border border-slate-200 transition-all"
            >
              <div className="flex items-start gap-4">
                <div className={`w-10 h-10 rounded-full ${getTypeBg(notif.notification_type)} flex items-center justify-center flex-shrink-0`}>
                  {getTypeIcon(notif.notification_type)}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-medium text-slate-800 capitalize">{formatTypeLabel(notif.notification_type)}</h3>
                  <p className="text-sm text-slate-500 mt-1">
                    {getNotificationDescription(notif)}
                  </p>
                  <p className="text-xs text-slate-400 mt-3">
                    {new Date(notif.sent_at).toLocaleDateString()} at{' '}
                    {new Date(notif.sent_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
