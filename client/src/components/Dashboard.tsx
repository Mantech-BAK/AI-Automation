import { useEffect, useState } from 'react';
import {
  Clock,
  CheckCircle2,
  AlertTriangle,
  Cog,
  FileText,
  RefreshCw,
  FileX,
  Users,
  Contact,
  Building2,
  MapPin,
  Mail,
  Bell,
  Calendar,
  CalendarClock,
  Settings,
  Loader2,
  LucideIcon,
  Car,
} from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';
import type { NavFilter } from '../App';

interface DashboardSummary {
  overdue_tasks: number;
  open_tasks: number;
  pending_tasks: number;
  completed_tasks: number;
  total_equipment: number;
  expired_documents: number;
  document_expiring_today: number;
  expiring_documents: number;
  document_expiring_7days: number;
  total_documents: number;
  pending_renewals: number;
  total_technicians: number;
  total_employees: number;
  total_departments: number;
  total_sites: number;
  emails_today: number;
  notifications_today: number;
  equipment_due_today: number;
  equipment_due_7days: number;
  document_due_today: number;
  document_due_7days: number;
  total_vehicles: number;
  vehicle_due_or_expiring_today: number;
  vehicle_due_or_expiring_7days: number;
  vehicle_due_or_expiring_30days: number;
  vehicle_pending: number;
  vehicle_overdue: number;
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

// Simple count-up: a state value that animates from 0 to the target over a
// fixed duration once the tile mounts (or the target changes). Always coerces
// through Number(...) || 0 first so an API value that's missing, null, or a
// non-numeric string renders as 0 instead of NaN.
function CountUpNumber({ value, duration = 700 }: { value: number; duration?: number }) {
  const safeValue = Number(value) || 0;
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    let frame: number;
    const start = performance.now();

    function tick(now: number) {
      const progress = Math.min((now - start) / duration, 1);
      setDisplay(Math.round(safeValue * progress));
      if (progress < 1) {
        frame = requestAnimationFrame(tick);
      }
    }

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [safeValue, duration]);

  return <>{display}</>;
}

interface DonutSegment {
  key: string;
  name: string;
  value: number;
  hex: string;
  onClick: () => void;
}

interface DonutTheme {
  gradient: string;
  totalLabel: string;
}

function DonutSection({
  title,
  icon: Icon,
  theme,
  segments,
  total,
}: {
  title: string;
  icon: LucideIcon;
  theme: DonutTheme;
  segments: DonutSegment[];
  total: number;
}) {
  const safeSegments = segments.map((s) => ({ ...s, value: Number(s.value) || 0 }));
  const hasData = safeSegments.some((s) => s.value > 0);

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
      <div className={`bg-gradient-to-r ${theme.gradient} px-5 py-3.5 flex items-center gap-3`}>
        <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center flex-shrink-0">
          <Icon size={18} className="text-white" />
        </div>
        <h2 className="text-white font-bold text-sm tracking-wide">{title}</h2>
      </div>

      <div className="p-5">
        <div className="relative h-56">
          {hasData ? (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={safeSegments}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={60}
                  outerRadius={90}
                  paddingAngle={2}
                  cursor="pointer"
                  onClick={(_data: unknown, index: number) => safeSegments[index]?.onClick()}
                >
                  {safeSegments.map((segment) => (
                    <Cell key={segment.key} fill={segment.hex} stroke="none" />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <div className="w-[180px] h-[180px] rounded-full border-[15px] border-slate-100" />
            </div>
          )}
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <span className="text-3xl font-extrabold text-slate-800">
              <CountUpNumber value={total} />
            </span>
            <span className="text-[11px] text-slate-400 font-medium uppercase tracking-wide">{theme.totalLabel}</span>
          </div>
        </div>

        <div className="mt-3 space-y-1 border-t border-slate-100 pt-3">
          {safeSegments.map((segment) => (
            <button
              key={segment.key}
              type="button"
              onClick={segment.onClick}
              className="w-full flex items-center justify-between gap-2 text-xs px-2 py-1.5 rounded-lg hover:bg-slate-50 transition-colors duration-200"
            >
              <span className="flex items-center gap-2 text-slate-600 min-w-0">
                <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: segment.hex }} />
                <span className="truncate">{segment.name}</span>
              </span>
              <span className="font-semibold text-slate-800 flex-shrink-0">{segment.value}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// Every tile carries its own explicit semantic color now (Equipment,
// Documentation and Vehicles tiles each need a specific color per position,
// not one shared per-section color) - see TILE_COLORS below.
interface TileDef {
  key: string;
  label: string;
  value: number | null;
  icon: LucideIcon;
  onClick: () => void;
  color: string;
}

const TILE_COLORS: Record<string, string> = {
  blue: 'text-blue-600 bg-blue-100',
  redOrange: 'text-orange-700 bg-orange-200',
  yellow: 'text-yellow-700 bg-yellow-100',
  orange: 'text-orange-600 bg-orange-100',
  green: 'text-emerald-600 bg-emerald-100',
  red: 'text-red-600 bg-red-100',
  darkRed: 'text-red-800 bg-red-200',
  purple: 'text-purple-600 bg-purple-100',
  teal: 'text-teal-600 bg-teal-100',
  grey: 'text-slate-600 bg-slate-100',
};

function MiniTile({ label, value, icon: Icon, onClick, color }: TileDef) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex items-center gap-2 p-2 bg-white rounded-xl border border-slate-100 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 text-left overflow-hidden"
    >
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 transition-transform duration-200 group-hover:scale-110 ${TILE_COLORS[color] || TILE_COLORS.grey}`}>
        <Icon size={16} />
      </div>
      <div className="min-w-0">
        <p className="text-lg font-bold text-slate-800 leading-tight">
          {value !== null ? <CountUpNumber value={value} /> : ''}
        </p>
        <p className="text-xs text-slate-500 leading-tight truncate">{label}</p>
      </div>
    </button>
  );
}

function TileGroup({ label, tiles }: { label: string; tiles: TileDef[] }) {
  return (
    <div>
      <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2.5">{label}</h3>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
        {tiles.map((tile) => (
          <MiniTile key={tile.key} {...tile} />
        ))}
      </div>
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

  // --- Section 2: donut chart segments ---
  const equipmentSegments: DonutSegment[] = [
    { key: 'total', name: 'Total Equipment', value: summary.total_equipment, hex: '#bfdbfe', onClick: () => onNavigate('equipment', { tab: 'equipment' }) },
    { key: 'open', name: 'Open Tasks', value: summary.open_tasks, hex: '#f97316', onClick: () => onNavigate('tasks', { tab: 'equipment', taskStatus: 'open' }) },
    { key: 'completed', name: 'Completed Tasks', value: summary.completed_tasks, hex: '#10b981', onClick: () => onNavigate('tasks', { tab: 'equipment', taskStatus: 'completed' }) },
    { key: 'overdue', name: 'Overdue Tasks', value: summary.overdue_tasks, hex: '#ef4444', onClick: () => onNavigate('tasks', { tab: 'equipment', taskDayTile: 'overdue' }) },
  ];

  const documentationSegments: DonutSegment[] = [
    { key: 'total', name: 'All Documents', value: summary.total_documents, hex: '#e9d5ff', onClick: () => onNavigate('equipment', { tab: 'documents' }) },
    { key: 'expiring30', name: 'Expiring Within 30 Days', value: summary.expiring_documents, hex: '#f97316', onClick: () => onNavigate('equipment', { tab: 'documents', docExpiryTile: 'expiring30' }) },
    { key: 'pending-renewals', name: 'Pending Renewals', value: summary.pending_renewals, hex: '#a855f7', onClick: () => onNavigate('tasks', { tab: 'documents' }) },
    { key: 'expired', name: 'Expired', value: summary.expired_documents, hex: '#ef4444', onClick: () => onNavigate('equipment', { tab: 'documents', docExpiryTile: 'expired' }) },
  ];

  const vehicleSegments: DonutSegment[] = [
    { key: 'total', name: 'All Vehicles', value: summary.total_vehicles, hex: '#fed7aa', onClick: () => onNavigate('equipment', { tab: 'vehicles' }) },
    { key: 'due-expiring-30', name: 'Due or Expiring Within 30 Days', value: summary.vehicle_due_or_expiring_30days, hex: '#f97316', onClick: () => onNavigate('tasks', { tab: 'vehicles', vehicleFilter: '30' }) },
    { key: 'pending', name: 'Pending Renewals', value: summary.vehicle_pending, hex: '#a855f7', onClick: () => onNavigate('tasks', { tab: 'vehicles' }) },
    { key: 'overdue', name: 'Overdue', value: summary.vehicle_overdue, hex: '#ef4444', onClick: () => onNavigate('tasks', { tab: 'vehicles', vehicleFilter: 'expired' }) },
  ];

  // --- Section 3: grouped tiles, exact order/colors per section ---
  const equipmentTiles: TileDef[] = [
    { key: 'total-equipment', label: 'Total Equipment', value: summary.total_equipment, icon: Cog, color: 'blue', onClick: () => onNavigate('equipment', { tab: 'equipment' }) },
    { key: 'equipment-due-today', label: 'Due Today', value: summary.equipment_due_today, icon: Clock, color: 'redOrange', onClick: () => onNavigate('tasks', { tab: 'equipment', taskDayTile: 'today' }) },
    { key: 'equipment-due-7days', label: 'Due Within 7 Days', value: summary.equipment_due_7days, icon: CalendarClock, color: 'yellow', onClick: () => onNavigate('tasks', { tab: 'equipment', taskDayTile: '7' }) },
    { key: 'open-tasks', label: 'Open Tasks', value: summary.open_tasks, icon: Clock, color: 'orange', onClick: () => onNavigate('tasks', { tab: 'equipment', taskStatus: 'open' }) },
    { key: 'completed-tasks', label: 'Completed Tasks', value: summary.completed_tasks, icon: CheckCircle2, color: 'green', onClick: () => onNavigate('tasks', { tab: 'equipment', taskStatus: 'completed' }) },
    { key: 'overdue-tasks', label: 'Overdue Tasks', value: summary.overdue_tasks, icon: AlertTriangle, color: 'red', onClick: () => onNavigate('tasks', { tab: 'equipment', taskDayTile: 'overdue' }) },
  ];

  const documentationTiles: TileDef[] = [
    { key: 'total-documents', label: 'Total Documents', value: summary.total_documents, icon: FileText, color: 'blue', onClick: () => onNavigate('equipment', { tab: 'documents' }) },
    { key: 'document-expiring-today', label: 'Expiring Today', value: summary.document_expiring_today, icon: Clock, color: 'red', onClick: () => onNavigate('equipment', { tab: 'documents', docExpiryTile: 'expiring0' }) },
    { key: 'document-expiring-7days', label: 'Expiring Within 7 Days', value: summary.document_expiring_7days, icon: CalendarClock, color: 'orange', onClick: () => onNavigate('equipment', { tab: 'documents', docExpiryTile: 'expiring7' }) },
    { key: 'expiring-documents', label: 'Expiring Within 30 Days', value: summary.expiring_documents, icon: CalendarClock, color: 'yellow', onClick: () => onNavigate('equipment', { tab: 'documents', docExpiryTile: 'expiring30' }) },
    { key: 'pending-renewals', label: 'Pending Renewals', value: summary.pending_renewals, icon: RefreshCw, color: 'purple', onClick: () => onNavigate('tasks', { tab: 'documents' }) },
    { key: 'expired-documents', label: 'Expired Documents', value: summary.expired_documents, icon: FileX, color: 'darkRed', onClick: () => onNavigate('equipment', { tab: 'documents', docExpiryTile: 'expired' }) },
  ];

  const vehicleTiles: TileDef[] = [
    { key: 'total-vehicles', label: 'Total Vehicles', value: summary.total_vehicles, icon: Car, color: 'blue', onClick: () => onNavigate('equipment', { tab: 'vehicles' }) },
    { key: 'vehicle-due-expiring-today', label: 'Expiring or Due Today', value: summary.vehicle_due_or_expiring_today, icon: Clock, color: 'red', onClick: () => onNavigate('tasks', { tab: 'vehicles', vehicleFilter: 'today' }) },
    { key: 'vehicle-due-expiring-7days', label: 'Expiring or Due Within 7 Days', value: summary.vehicle_due_or_expiring_7days, icon: CalendarClock, color: 'orange', onClick: () => onNavigate('tasks', { tab: 'vehicles', vehicleFilter: '7' }) },
    { key: 'vehicle-due-expiring-30days', label: 'Expiring or Due Within 30 Days', value: summary.vehicle_due_or_expiring_30days, icon: CalendarClock, color: 'yellow', onClick: () => onNavigate('tasks', { tab: 'vehicles', vehicleFilter: '30' }) },
    { key: 'vehicle-pending', label: 'Pending Renewals', value: summary.vehicle_pending, icon: RefreshCw, color: 'purple', onClick: () => onNavigate('tasks', { tab: 'vehicles' }) },
    { key: 'vehicle-overdue', label: 'Overdue', value: summary.vehicle_overdue, icon: AlertTriangle, color: 'darkRed', onClick: () => onNavigate('tasks', { tab: 'vehicles', vehicleFilter: 'expired' }) },
  ];

  const peopleTiles: TileDef[] = [
    { key: 'total-technicians', label: 'Total Technicians', value: summary.total_technicians, icon: Users, color: 'teal', onClick: () => onNavigate('technicians') },
    { key: 'total-employees', label: 'Total Employees', value: summary.total_employees, icon: Contact, color: 'teal', onClick: () => onNavigate('employees') },
    { key: 'total-departments', label: 'Total Departments', value: summary.total_departments, icon: Building2, color: 'teal', onClick: () => onNavigate('departments') },
    { key: 'total-sites', label: 'Total Sites', value: summary.total_sites, icon: MapPin, color: 'teal', onClick: () => onNavigate('sites') },
  ];

  const systemTiles: TileDef[] = [
    { key: 'emails-processed', label: 'Emails Processed', value: summary.emails_today, icon: Mail, color: 'grey', onClick: () => onNavigate('email') },
    { key: 'notifications', label: 'Notifications (today)', value: summary.notifications_today, icon: Bell, color: 'grey', onClick: () => onNavigate('notifications') },
    { key: 'upcoming-meetings', label: 'Upcoming Meetings', value: null, icon: Calendar, color: 'grey', onClick: () => onNavigate('schedules') },
    { key: 'settings', label: 'Settings', value: null, icon: Settings, color: 'grey', onClick: () => onNavigate('settings') },
  ];

  return (
    <div className="space-y-6">
      <div className="rounded-2xl bg-gradient-to-r from-cyan-500 to-blue-600 px-6 py-8 shadow-md">
        <h1 className="text-3xl font-bold text-white">{getGreeting(userName || 'there')}</h1>
        <p className="text-cyan-50 mt-2">{getBahrainDateLabel()}</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <DonutSection
          title="EQUIPMENT"
          icon={Cog}
          theme={{ gradient: 'from-blue-500 to-indigo-600', totalLabel: 'Total Equipment' }}
          segments={equipmentSegments}
          total={summary.total_equipment}
        />
        <DonutSection
          title="DOCUMENTATION"
          icon={FileText}
          theme={{ gradient: 'from-purple-500 to-fuchsia-600', totalLabel: 'Total Documents' }}
          segments={documentationSegments}
          total={summary.total_documents}
        />
        <DonutSection
          title="VEHICLES"
          icon={Car}
          theme={{ gradient: 'from-orange-400 to-amber-600', totalLabel: 'Total Vehicles' }}
          segments={vehicleSegments}
          total={summary.total_vehicles}
        />
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 space-y-6">
        <TileGroup label="Equipment" tiles={equipmentTiles} />
        <TileGroup label="Documentation" tiles={documentationTiles} />
        <TileGroup label="Vehicles" tiles={vehicleTiles} />
        <TileGroup label="People" tiles={peopleTiles} />
        <TileGroup label="System" tiles={systemTiles} />
      </div>
    </div>
  );
}
