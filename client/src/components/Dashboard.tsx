import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Clock,
  CheckCircle2,
  Cog,
  FileX,
  FileText,
  RefreshCw,
  Users,
  Contact,
  Building2,
  MapPin,
  Mail,
  Bell,
  Calendar,
  Settings,
  Loader2,
  LucideIcon,
  Car,
} from 'lucide-react';
import type { NavFilter } from '../App';

interface DashboardSummary {
  overdue_tasks: number;
  open_tasks: number;
  completed_tasks: number;
  total_equipment: number;
  expired_documents: number;
  expiring_documents: number;
  total_documents: number;
  pending_renewals: number;
  total_technicians: number;
  total_employees: number;
  total_departments: number;
  total_sites: number;
  emails_today: number;
  notifications_today: number;
  total_vehicles: number;
  vehicle_tasks_overdue: number;
  vehicle_tasks_expiring_30: number;
  vehicle_pending_renewals: number;
}

interface DashboardProps {
  onNavigate: (page: string, filter?: NavFilter) => void;
}

function getBahrainHour(): number {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Bahrain',
    hour: 'numeric',
    hour12: false,
  });
  const hourPart = formatter.formatToParts(new Date()).find((part) => part.type === 'hour');
  const hour = hourPart ? Number(hourPart.value) : new Date().getHours();
  return hour % 24;
}

function getGreeting(name: string): string {
  const hour = getBahrainHour();
  let period = 'Good evening';
  if (hour >= 5 && hour < 12) period = 'Good morning';
  else if (hour >= 12 && hour < 17) period = 'Good afternoon';
  return `${period}, ${name}`;
}

function getBahrainDateLabel(): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Bahrain',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date());
}

type TileColor = 'red' | 'orange' | 'yellow' | 'blue' | 'green' | 'purple' | 'grey';

interface TileDef {
  key: string;
  label: string;
  value: number | null;
  icon: LucideIcon;
  color: TileColor;
  onClick: () => void;
}

const COLOR_CLASSES: Record<TileColor, { bg: string; icon: string; border: string }> = {
  red: { bg: 'bg-red-50', icon: 'text-red-600 bg-red-100', border: 'hover:border-red-300' },
  orange: { bg: 'bg-orange-50', icon: 'text-orange-600 bg-orange-100', border: 'hover:border-orange-300' },
  yellow: { bg: 'bg-yellow-50', icon: 'text-yellow-600 bg-yellow-100', border: 'hover:border-yellow-300' },
  blue: { bg: 'bg-blue-50', icon: 'text-blue-600 bg-blue-100', border: 'hover:border-blue-300' },
  green: { bg: 'bg-emerald-50', icon: 'text-emerald-600 bg-emerald-100', border: 'hover:border-emerald-300' },
  purple: { bg: 'bg-purple-50', icon: 'text-purple-600 bg-purple-100', border: 'hover:border-purple-300' },
  grey: { bg: 'bg-slate-50', icon: 'text-slate-600 bg-slate-100', border: 'hover:border-slate-300' },
};

function Tile({ label, value, icon: Icon, color, onClick }: TileDef) {
  const classes = COLOR_CLASSES[color];
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-left bg-white rounded-xl p-5 border border-slate-200 shadow-sm hover:shadow-md transition-all cursor-pointer ${classes.border}`}
    >
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center mb-3 ${classes.icon}`}>
        <Icon size={20} />
      </div>
      {value !== null && <p className="text-2xl font-bold text-slate-800">{value}</p>}
      <p className={`text-sm text-slate-500 ${value !== null ? 'mt-1' : ''}`}>{label}</p>
    </button>
  );
}

function TileGrid({ tiles }: { tiles: TileDef[] }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {tiles.map((tile) => (
        <Tile key={tile.key} {...tile} />
      ))}
    </div>
  );
}

export default function Dashboard({ onNavigate }: DashboardProps) {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [userName, setUserName] = useState<string | null>(null);

  useEffect(() => {
    async function fetchCurrentUser() {
      try {
        const response = await fetch('/api/auth/me');
        if (!response.ok) return;
        const json = await response.json();
        setUserName(json?.user?.name || null);
      } catch (fetchError) {
        console.error('Error fetching current user:', fetchError);
      }
    }

    fetchCurrentUser();
  }, []);

  useEffect(() => {
    async function fetchSummary() {
      try {
        const response = await fetch('/api/dashboard/summary');
        if (!response.ok) throw new Error(`Summary fetch failed: ${response.statusText}`);
        const json = await response.json();
        const parsed: DashboardSummary = Object.fromEntries(
          Object.entries(json).map(([key, val]) => [key, Number(val) || 0])
        ) as unknown as DashboardSummary;
        setSummary(parsed);
      } catch (fetchError) {
        const message = fetchError instanceof Error ? fetchError.message : 'Unknown error';
        console.error('Error fetching dashboard summary:', fetchError);
        setError(message);
      } finally {
        setLoading(false);
      }
    }

    fetchSummary();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
      </div>
    );
  }

  if (error || !summary) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-red-600 bg-red-50 border border-red-200 rounded-xl p-6">
          <p className="font-semibold">Failed to load dashboard data</p>
          <p className="text-sm mt-2">{error}</p>
        </div>
      </div>
    );
  }

  const maintenanceTiles: TileDef[] = [
    {
      key: 'overdue-tasks',
      label: 'Overdue Tasks',
      value: summary.overdue_tasks,
      icon: AlertTriangle,
      color: 'red',
      onClick: () => onNavigate('tasks', { tab: 'equipment', taskDayTile: 'overdue' }),
    },
    {
      key: 'open-tasks',
      label: 'Open Tasks',
      value: summary.open_tasks,
      icon: Clock,
      color: 'orange',
      onClick: () => onNavigate('tasks', { tab: 'equipment', taskStatus: 'open' }),
    },
    {
      key: 'completed-tasks',
      label: 'Completed Tasks',
      value: summary.completed_tasks,
      icon: CheckCircle2,
      color: 'green',
      onClick: () => onNavigate('tasks', { tab: 'equipment', taskStatus: 'completed' }),
    },
    {
      key: 'total-equipment',
      label: 'Total Equipment',
      value: summary.total_equipment,
      icon: Cog,
      color: 'blue',
      onClick: () => onNavigate('equipment', { tab: 'equipment' }),
    },
  ];

  const documentationTiles: TileDef[] = [
    {
      key: 'expired-documents',
      label: 'Expired Documents',
      value: summary.expired_documents,
      icon: FileX,
      color: 'red',
      onClick: () => onNavigate('equipment', { tab: 'documents', expiredOnly: true }),
    },
    {
      key: 'expiring-documents',
      label: 'Expiring Within 30 Days',
      value: summary.expiring_documents,
      icon: Clock,
      color: 'orange',
      onClick: () => onNavigate('equipment', { tab: 'documents' }),
    },
    {
      key: 'total-documents',
      label: 'Total Documents',
      value: summary.total_documents,
      icon: FileText,
      color: 'blue',
      onClick: () => onNavigate('equipment', { tab: 'documents' }),
    },
    {
      key: 'pending-renewals',
      label: 'Pending Renewals',
      value: summary.pending_renewals,
      icon: RefreshCw,
      color: 'purple',
      onClick: () => onNavigate('tasks', { tab: 'documents' }),
    },
  ];

  const vehicleTiles: TileDef[] = [
    {
      key: 'overdue-vehicle-tasks',
      label: 'Overdue Vehicle Tasks',
      value: summary.vehicle_tasks_overdue,
      icon: AlertTriangle,
      color: 'red',
      onClick: () => onNavigate('vehicles'),
    },
    {
      key: 'expiring-vehicle-tasks',
      label: 'Expiring Within 30 Days',
      value: summary.vehicle_tasks_expiring_30,
      icon: Clock,
      color: 'orange',
      onClick: () => onNavigate('vehicles'),
    },
    {
      key: 'total-vehicles',
      label: 'Total Vehicles',
      value: summary.total_vehicles,
      icon: Car,
      color: 'blue',
      onClick: () => onNavigate('vehicles'),
    },
    {
      key: 'vehicle-pending-renewals',
      label: 'Pending Renewals',
      value: summary.vehicle_pending_renewals,
      icon: RefreshCw,
      color: 'purple',
      onClick: () => onNavigate('vehicles'),
    },
  ];

  const peopleTiles: TileDef[] = [
    {
      key: 'total-technicians',
      label: 'Total Technicians',
      value: summary.total_technicians,
      icon: Users,
      color: 'blue',
      onClick: () => onNavigate('technicians'),
    },
    {
      key: 'total-employees',
      label: 'Total Employees',
      value: summary.total_employees,
      icon: Contact,
      color: 'blue',
      onClick: () => onNavigate('employees'),
    },
    {
      key: 'departments',
      label: 'Departments',
      value: summary.total_departments,
      icon: Building2,
      color: 'blue',
      onClick: () => onNavigate('departments'),
    },
    {
      key: 'sites',
      label: 'Sites',
      value: summary.total_sites,
      icon: MapPin,
      color: 'blue',
      onClick: () => onNavigate('sites'),
    },
  ];

  const systemTiles: TileDef[] = [
    {
      key: 'email-processing',
      label: 'Email Processing (today)',
      value: summary.emails_today,
      icon: Mail,
      color: 'blue',
      onClick: () => onNavigate('email'),
    },
    {
      key: 'notifications',
      label: 'Notifications (today)',
      value: summary.notifications_today,
      icon: Bell,
      color: 'blue',
      onClick: () => onNavigate('notifications'),
    },
    {
      key: 'schedule-meeting',
      label: 'Schedule Meeting',
      value: null,
      icon: Calendar,
      color: 'blue',
      onClick: () => onNavigate('schedules'),
    },
    {
      key: 'settings',
      label: 'Settings',
      value: null,
      icon: Settings,
      color: 'grey',
      onClick: () => onNavigate('settings'),
    },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">{getGreeting(userName || 'there')}</h1>
        <p className="text-slate-500 mt-1">{getBahrainDateLabel()}</p>
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-bold text-slate-800 uppercase tracking-wide">Equipment</h2>
        <TileGrid tiles={maintenanceTiles} />
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-bold text-slate-800 uppercase tracking-wide">Documentation</h2>
        <TileGrid tiles={documentationTiles} />
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-bold text-slate-800 uppercase tracking-wide">Vehicles</h2>
        <TileGrid tiles={vehicleTiles} />
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-bold text-slate-800 uppercase tracking-wide">People</h2>
        <TileGrid tiles={peopleTiles} />
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-bold text-slate-800 uppercase tracking-wide">System</h2>
        <TileGrid tiles={systemTiles} />
      </section>
    </div>
  );
}
