import {
  Bell,
  Building2,
  Calendar,
  CalendarDays,
  Cog,
  Contact,
  FileText,
  LayoutDashboard,
  Mail,
  MapPin,
  Settings,
  Truck,
  UserCheck,
  UserCog,
  Users,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import type { NavFilter } from '../App';

export type ModuleId = 'equipment' | 'vehicles' | 'documents';

export type TabId = NonNullable<NavFilter['tab']>;
export type TechnicianTabId = 'maintenance' | 'documentation' | 'vehicles';

// One sidebar entry. `page` is the existing page id App.tsx renders ('tasks',
// 'equipment', ...). Several pages are shared, tabbed components (Asset
// Information, Maintenance Tasks, Technicians), so a module pins them to its
// own tab with `tab` / `technicianTab`.
export interface ModuleNavItem {
  id: string;
  label: string;
  icon: LucideIcon;
  page: string;
  tab?: TabId;
  technicianTab?: TechnicianTabId;
}

export interface ModuleDefinition {
  id: ModuleId;
  label: string;
  description: string;
  icon: LucideIcon;
  // Tailwind classes for the selection card and the sidebar badge.
  gradient: string;
  nav: ModuleNavItem[];
}

const DASHBOARD: ModuleNavItem = { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, page: 'dashboard' };

// Meetings and email processing are shared tools, listed in every module.
const SCHEDULE_MEETING: ModuleNavItem = { id: 'schedules', label: 'Schedule Meeting', icon: Calendar, page: 'schedules' };
const EMAIL_PROCESSING: ModuleNavItem = { id: 'email', label: 'Email Processing', icon: Mail, page: 'email' };

// Settings and Users are system-wide, so every module's sidebar ends with them.
export const SYSTEM_NAV: ModuleNavItem[] = [
  { id: 'settings', label: 'Settings', icon: Settings, page: 'settings' },
  { id: 'users', label: 'Users', icon: UserCog, page: 'users' },
];

export const MODULES: Record<ModuleId, ModuleDefinition> = {
  equipment: {
    id: 'equipment',
    label: 'Equipment Maintenance',
    description: 'Track assets, schedules and maintenance tasks',
    icon: Cog,
    gradient: 'from-blue-500 to-indigo-600',
    nav: [
      DASHBOARD,
      { id: 'assets', label: 'Asset Information', icon: Cog, page: 'equipment', tab: 'equipment' },
      { id: 'tasks', label: 'Maintenance Tasks', icon: Wrench, page: 'tasks', tab: 'equipment' },
      { id: 'departments', label: 'Departments', icon: Building2, page: 'departments' },
      { id: 'sites', label: 'Sites', icon: MapPin, page: 'sites' },
      { id: 'technicians', label: 'Technicians', icon: Users, page: 'technicians', technicianTab: 'maintenance' },
      { id: 'employees', label: 'Employee Master', icon: Contact, page: 'employees' },
      SCHEDULE_MEETING,
      { id: 'calendar', label: 'Calendar', icon: CalendarDays, page: 'calendar' },
      EMAIL_PROCESSING,
      { id: 'notifications', label: 'Notifications', icon: Bell, page: 'notifications' },
    ],
  },
  vehicles: {
    id: 'vehicles',
    label: 'Vehicles',
    description: 'Manage fleet assignments and vehicle tasks',
    icon: Truck,
    gradient: 'from-orange-400 to-amber-600',
    nav: [
      DASHBOARD,
      { id: 'vehicles', label: 'Vehicles', icon: Truck, page: 'equipment', tab: 'vehicles' },
      { id: 'tasks', label: 'Vehicle Tasks', icon: Wrench, page: 'tasks', tab: 'vehicles' },
      { id: 'incharge', label: 'Vehicle In-Charge', icon: UserCheck, page: 'technicians', technicianTab: 'vehicles' },
      SCHEDULE_MEETING,
      EMAIL_PROCESSING,
      { id: 'notifications', label: 'Notifications', icon: Bell, page: 'notifications' },
    ],
  },
  documents: {
    id: 'documents',
    label: 'Documents',
    description: 'Monitor licenses, certificates and expiry dates',
    icon: FileText,
    gradient: 'from-purple-500 to-fuchsia-600',
    nav: [
      DASHBOARD,
      { id: 'documents', label: 'Documents', icon: FileText, page: 'equipment', tab: 'documents' },
      { id: 'tasks', label: 'Document Tasks', icon: Wrench, page: 'tasks', tab: 'documents' },
      { id: 'responsible', label: 'Responsible Persons', icon: UserCheck, page: 'technicians', technicianTab: 'documentation' },
      SCHEDULE_MEETING,
      EMAIL_PROCESSING,
      { id: 'notifications', label: 'Notifications', icon: Bell, page: 'notifications' },
    ],
  },
};

export const MODULE_ORDER: ModuleId[] = ['equipment', 'vehicles', 'documents'];

export function isModuleId(value: string | undefined): value is ModuleId {
  return value === 'equipment' || value === 'vehicles' || value === 'documents';
}

export function allNavItems(module: ModuleId): ModuleNavItem[] {
  return [...MODULES[module].nav, ...SYSTEM_NAV];
}

// Which module a notification belongs to, from its notification_type.
export function moduleOfNotificationType(type: string): ModuleId {
  if (type.startsWith('document')) return 'documents';
  if (type.startsWith('vehicle')) return 'vehicles';
  return 'equipment';
}
