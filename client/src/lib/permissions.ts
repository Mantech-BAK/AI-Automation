import { MODULES, type ModuleId, type ModuleNavItem, type ToolId } from './modules';

// users.permissions as stored by the Users screen (see utils/permissions.js on the server).
export interface Permissions {
  modules: string[];
  features: { emailSummary: boolean; scheduleMeeting: boolean };
  // Per module: the sidebar entries (by label) the user may open. A module without an entry shows its whole sidebar.
  sidebar: Record<string, string[]>;
  dataScope: 'own' | 'all';
}

export interface AccessUser {
  role: string;
  allowed_item_types?: string[];
  // null/undefined = account from before role-based access: the old item-type rules apply and nothing else is restricted.
  permissions?: Permissions | null;
}

// The names the permission object uses for the modules.
export const MODULE_PERMISSION_NAMES: Record<ModuleId, string> = {
  equipment: 'Equipment',
  documents: 'Documents',
  vehicles: 'Vehicles',
  projects: 'Projects',
  costing: 'Costing Sheet',
};

export const FEATURE_OPTIONS: { key: keyof Permissions['features']; label: string; description: string }[] = [
  { key: 'emailSummary', label: 'Email Summarization', description: 'Open Email Processing and read email summaries' },
  { key: 'scheduleMeeting', label: 'Schedule Meeting', description: 'Open Meeting Schedule and book meetings' },
];

export function canAccessModule(user: AccessUser, module: ModuleId): boolean {
  if (user.role === 'admin') return true;
  if (user.permissions) return user.permissions.modules.includes(MODULE_PERMISSION_NAMES[module]);
  const itemTypes = user.allowed_item_types || [];
  // Project financials are opt-in: the user needs the 'Project' item type, an empty list is not enough.
  if (module === 'projects') return itemTypes.includes('Project');
  // Costing Sheet has its own user picker and role-based access, so every MAS user could open it.
  if (module === 'costing') return true;
  if (itemTypes.length === 0) return true;
  return itemTypes.includes(module === 'documents' ? 'Document' : 'Equipment');
}

// The Dashboard is always available inside an allowed module.
export function canSeeNavItem(user: AccessUser, module: ModuleId, item: ModuleNavItem): boolean {
  if (user.role === 'admin' || !user.permissions || item.id === 'dashboard') return true;
  const allowed = user.permissions.sidebar[MODULE_PERMISSION_NAMES[module]];
  return allowed === undefined || allowed.includes(item.label);
}

export function canUseTool(user: AccessUser, tool: ToolId): boolean {
  // Settings (system controls, reset data) and Users management are administrators only.
  if (tool === 'users' || tool === 'settings') return user.role === 'admin';
  if (user.role === 'admin' || !user.permissions) return true;
  if (tool === 'email') return user.permissions.features.emailSummary;
  if (tool === 'schedules') return user.permissions.features.scheduleMeeting;
  return true;
}

// A starting point for a new user: nothing allowed, own data only.
export function emptyPermissions(): Permissions {
  return { modules: [], features: { emailSummary: false, scheduleMeeting: false }, sidebar: {}, dataScope: 'own' };
}

// The selectable sidebar entries of a module (everything except the always-visible Dashboard).
export function selectableNavItems(module: ModuleId): ModuleNavItem[] {
  return MODULES[module].nav.filter((item) => item.id !== 'dashboard');
}
