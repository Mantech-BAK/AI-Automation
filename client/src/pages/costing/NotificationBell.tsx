import { useCallback, useEffect, useRef, useState } from 'react';
import { Bell, Repeat } from 'lucide-react';
import { costingApi, formatDateTime, jsonInit, type MasUser } from '../../lib/costing';

interface Notification {
  id: number;
  message: string;
  link: string | null;
  is_read: boolean;
  created_at: string;
}

// Top-nav bell with the unread count; the panel lists the user's costing notifications (in-app only).
export default function NotificationBell({ me, onNavigate }: { me: MasUser; onNavigate: (path: string) => void }) {
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [items, setItems] = useState<Notification[]>([]);
  const box = useRef<HTMLDivElement>(null);

  const load = useCallback(() => {
    costingApi<{ unread: number; notifications: Notification[] }>('/notifications')
      .then((data) => {
        setUnread(data.unread);
        setItems(data.notifications);
      })
      .catch(() => undefined);
  }, []);

  // Refetch when the user changes and then every 30 seconds.
  useEffect(() => {
    load();
    const timer = setInterval(load, 30000);
    return () => clearInterval(timer);
  }, [load, me.id]);

  useEffect(() => {
    if (!open) return undefined;
    const close = (event: MouseEvent) => {
      if (box.current && !box.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const openItem = async (item: Notification) => {
    if (!item.is_read) {
      await costingApi(`/notifications/${item.id}/read`, jsonInit('PUT')).catch(() => undefined);
      load();
    }
    setOpen(false);
    if (item.link) onNavigate(item.link);
  };

  const markAll = async () => {
    await costingApi('/notifications-read-all', jsonInit('PUT')).catch(() => undefined);
    load();
  };

  return (
    <div className="flex items-center gap-3">
      <button
        onClick={() => onNavigate('/costing/login')}
        className="hidden sm:flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-800"
        title="Switch costing user"
      >
        <Repeat size={14} />
        <span className="text-right leading-tight">
          <span className="block font-semibold text-slate-700">{me.name}</span>
          <span className="block text-[11px]">{me.role_name}</span>
        </span>
      </button>
      <div className="relative" ref={box}>
        <button onClick={() => setOpen((v) => !v)} className="relative p-2 rounded-lg hover:bg-slate-100 text-slate-600" aria-label="Notifications">
          <Bell size={20} />
          {unread > 0 && (
            <span data-testid="unread-count" className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[11px] font-semibold flex items-center justify-center">{unread}</span>
          )}
        </button>
        {open && (
          <div className="absolute right-0 mt-2 w-80 max-w-[90vw] bg-white border border-slate-200 rounded-xl shadow-xl z-50">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-100">
              <span className="text-sm font-semibold text-slate-800">Notifications</span>
              {unread > 0 && <button onClick={markAll} className="text-xs text-teal-600 hover:underline">Mark all read</button>}
            </div>
            <ul className="max-h-96 overflow-y-auto divide-y divide-slate-100">
              {items.length === 0 && <li className="px-4 py-6 text-center text-sm text-slate-400">No notifications</li>}
              {items.map((item) => (
                <li key={item.id}>
                  <button onClick={() => openItem(item)} className={`w-full text-left px-4 py-3 hover:bg-slate-50 ${item.is_read ? '' : 'bg-blue-50/60'}`}>
                    <p className={`text-sm ${item.is_read ? 'text-slate-600' : 'font-medium text-slate-800'}`}>{item.message}</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">{formatDateTime(item.created_at)}</p>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
