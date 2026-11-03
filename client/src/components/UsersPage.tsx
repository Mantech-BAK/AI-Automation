import { useEffect, useState } from 'react';
import { Users as UsersIcon, Plus, Trash2, Loader2, ShieldCheck, User as UserIcon, KeyRound, Check } from 'lucide-react';
import Modal from './Modal';
import { apiFetch } from '../lib/api';
import { MODULE_ORDER, MODULES, type ModuleId } from '../lib/modules';
import {
  FEATURE_OPTIONS,
  MODULE_PERMISSION_NAMES,
  canAccessModule,
  emptyPermissions,
  selectableNavItems,
  type Permissions,
} from '../lib/permissions';

interface AppUser {
  id: number;
  name: string;
  email: string;
  role: string;
  allowed_item_types: string[];
  permissions: Permissions | null;
  designation: string | null;
  created_at: string;
}

// Suggestions only: the field accepts any text.
const DESIGNATIONS = ['Salesman', 'Sales Manager', 'Engineer', 'Technician', 'Manager', 'Admin'];

const STEPS = ['Modules', 'Features', 'Sidebar', 'Data'] as const;

const MODULE_BY_NAME = Object.fromEntries(MODULE_ORDER.map((id) => [MODULE_PERMISSION_NAMES[id], id])) as Record<string, ModuleId>;

function toggleInArray(list: string[], value: string): string[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

// Every sidebar entry of a module, by label.
function allSidebarLabels(module: ModuleId): string[] {
  return selectableNavItems(module).map((item) => item.label);
}

// What the wizard starts from when editing: the saved permissions, or for an account from before role-based access
// the access it effectively has today.
function permissionsOf(user: AppUser): Permissions {
  if (user.permissions) return user.permissions;
  const modules = MODULE_ORDER.filter((id) => canAccessModule({ role: user.role, allowed_item_types: user.allowed_item_types }, id));
  return {
    modules: modules.map((id) => MODULE_PERMISSION_NAMES[id]),
    features: { emailSummary: true, scheduleMeeting: true },
    sidebar: {},
    dataScope: 'all',
  };
}

function checkboxClass() {
  return 'rounded border-slate-300 text-cyan-600 focus:ring-cyan-500';
}

export default function UsersPage() {
  const [users, setUsers] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [updatingRoleId, setUpdatingRoleId] = useState<number | null>(null);

  // The add / edit wizard. `editing` is null while adding. step 0 = account details (add only), 1..4 = STEPS.
  const [wizardOpen, setWizardOpen] = useState(false);
  const [editing, setEditing] = useState<AppUser | null>(null);
  const [step, setStep] = useState(0);
  const [account, setAccount] = useState({ name: '', email: '', password: '', role: 'user', designation: '' });
  const [draft, setDraft] = useState<Permissions>(emptyPermissions());
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    fetchUsers();
  }, []);

  async function fetchUsers() {
    setLoading(true);
    try {
      const response = await apiFetch('/api/users');
      if (!response.ok) throw new Error(`Failed to load users: ${response.statusText}`);
      const json: AppUser[] = await response.json();
      setUsers(json);
      setError(null);
    } catch (fetchError) {
      const message = fetchError instanceof Error ? fetchError.message : 'Unknown error';
      console.error('Error fetching users:', fetchError);
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  function openAddWizard() {
    setEditing(null);
    setAccount({ name: '', email: '', password: '', role: 'user', designation: '' });
    setDraft(emptyPermissions());
    setStep(0);
    setFormError(null);
    setWizardOpen(true);
  }

  function openEditWizard(user: AppUser) {
    setEditing(user);
    setAccount({ name: user.name, email: user.email, password: '', role: user.role, designation: user.designation || '' });
    setDraft(permissionsOf(user));
    setStep(0);
    setFormError(null);
    setWizardOpen(true);
  }

  const isAdminAccount = editing ? editing.role === 'admin' : account.role === 'admin';
  const lastStep = STEPS.length;

  function toggleModule(module: ModuleId) {
    const name = MODULE_PERMISSION_NAMES[module];
    setDraft((current) => {
      if (current.modules.includes(name)) {
        const sidebar = { ...current.sidebar };
        delete sidebar[name];
        return { ...current, modules: current.modules.filter((m) => m !== name), sidebar };
      }
      // A newly allowed module starts with its whole sidebar.
      return { ...current, modules: [...current.modules, name], sidebar: { ...current.sidebar, [name]: allSidebarLabels(module) } };
    });
  }

  function toggleSidebarItem(module: ModuleId, label: string) {
    const name = MODULE_PERMISSION_NAMES[module];
    setDraft((current) => {
      const present = current.sidebar[name] ?? allSidebarLabels(module);
      return { ...current, sidebar: { ...current.sidebar, [name]: toggleInArray(present, label) } };
    });
  }

  function validateStep(): string | null {
    if (step === 0 && !editing) {
      if (!account.name.trim() || !account.email.trim() || !account.password.trim()) return 'Name, email, and password are required';
    }
    if (step === 1 && draft.modules.length === 0) return 'Choose at least one module';
    return null;
  }

  function handleNext() {
    const problem = validateStep();
    if (problem) {
      setFormError(problem);
      return;
    }
    setFormError(null);
    // Admins have full access: nothing more to choose after the account details.
    if (step === 0 && account.role === 'admin') {
      void handleSave();
      return;
    }
    setStep(step + 1);
  }

  async function handleSave() {
    const problem = validateStep();
    if (problem) {
      setFormError(problem);
      return;
    }

    // Fill in sidebar lists for modules the admin never opened step 3 for, so what is stored is explicit.
    const sidebar: Record<string, string[]> = {};
    for (const name of draft.modules) sidebar[name] = draft.sidebar[name] ?? allSidebarLabels(MODULE_BY_NAME[name]);
    const permissions: Permissions = { ...draft, sidebar };

    setSubmitting(true);
    setFormError(null);
    try {
      // The old department / item type / category pickers are replaced by this; clear them so no hidden restriction remains.
      const legacy = { allowed_departments: [], allowed_item_types: [], allowed_categories: [] };
      const response = editing
        ? await apiFetch(`/api/users/${editing.id}/update`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...legacy, permissions, designation: account.designation }),
          })
        : await apiFetch('/api/users/add', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...account, ...legacy, permissions: account.role === 'admin' ? undefined : permissions }),
          });
      const json = await response.json();
      if (!response.ok) throw new Error(json?.error || 'Failed to save user');
      setWizardOpen(false);
      await fetchUsers();
    } catch (submitError) {
      setFormError(submitError instanceof Error ? submitError.message : 'Failed to save user');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDeleteUser(user: AppUser) {
    if (!window.confirm(`Remove ${user.name} (${user.email})? This cannot be undone.`)) {
      return;
    }

    setDeletingId(user.id);
    try {
      const response = await apiFetch(`/api/users/${user.id}`, { method: 'DELETE' });
      const json = await response.json();
      if (!response.ok) {
        throw new Error(json?.error || 'Failed to delete user');
      }
      await fetchUsers();
    } catch (deleteError) {
      console.error('Error deleting user:', deleteError);
      window.alert(deleteError instanceof Error ? deleteError.message : 'Failed to delete user');
    } finally {
      setDeletingId(null);
    }
  }

  async function handleRoleChange(user: AppUser, role: string) {
    setUpdatingRoleId(user.id);
    try {
      const response = await apiFetch(`/api/users/${user.id}/update`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role }),
      });
      const json = await response.json();
      if (!response.ok) {
        throw new Error(json?.error || 'Failed to update role');
      }
      await fetchUsers();
    } catch (updateError) {
      console.error('Error updating role:', updateError);
      window.alert(updateError instanceof Error ? updateError.message : 'Failed to update role');
    } finally {
      setUpdatingRoleId(null);
    }
  }

  function accessBadges(user: AppUser) {
    const access = permissionsOf(user);
    const badges: { label: string; badgeClass: string }[] = access.modules.map((name) => ({ label: name, badgeClass: 'bg-cyan-100 text-cyan-700' }));
    if (access.features.emailSummary) badges.push({ label: 'Email Summarization', badgeClass: 'bg-amber-100 text-amber-700' });
    if (access.features.scheduleMeeting) badges.push({ label: 'Schedule Meeting', badgeClass: 'bg-amber-100 text-amber-700' });
    if (access.modules.length > 0) {
      badges.push(
        access.dataScope === 'own'
          ? { label: 'Own data only', badgeClass: 'bg-emerald-100 text-emerald-700' }
          : { label: 'All data', badgeClass: 'bg-slate-100 text-slate-600' }
      );
    }
    return badges;
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
          <p className="font-semibold">Failed to load users</p>
          <p className="text-sm mt-2">{error}</p>
        </div>
      </div>
    );
  }

  const selectedModules = MODULE_ORDER.filter((id) => draft.modules.includes(MODULE_PERMISSION_NAMES[id]));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-end empty:hidden">
        <button
          onClick={openAddWizard}
          className="flex items-center gap-2 px-4 py-2 bg-[#0f172a] text-white text-sm font-medium rounded-lg hover:bg-slate-800 transition-colors"
        >
          <Plus size={16} />
          Add User
        </button>
      </div>

      {users.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-64 bg-white rounded-xl shadow-sm border border-slate-200">
          <UsersIcon size={40} className="text-slate-300 mb-3" />
          <p className="text-slate-500">No users found</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {users.map((user) => (
            <div
              key={user.id}
              className="bg-white rounded-xl p-5 shadow-sm border border-slate-200 hover:shadow-md transition-shadow flex flex-col gap-3"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-full bg-cyan-500/10 flex items-center justify-center flex-shrink-0">
                    {user.role === 'admin' ? (
                      <ShieldCheck size={18} className="text-cyan-600" />
                    ) : (
                      <UserIcon size={18} className="text-cyan-600" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-800 truncate">{user.name}</p>
                    <p className="text-sm text-slate-500 truncate">{user.email}</p>
                    {user.designation && <p className="text-xs text-cyan-700 truncate">{user.designation}</p>}
                  </div>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  {user.role !== 'admin' && (
                    <button
                      onClick={() => openEditWizard(user)}
                      className="p-1.5 text-slate-400 hover:text-cyan-600 hover:bg-cyan-50 rounded-lg transition-colors"
                      title="Manage access"
                    >
                      <KeyRound size={16} />
                    </button>
                  )}
                  <button
                    onClick={() => handleDeleteUser(user)}
                    disabled={deletingId === user.id}
                    className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                    title="Delete user"
                  >
                    {deletingId === user.id ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                {user.role === 'admin' ? (
                  <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-purple-100 text-purple-700">Full Access</span>
                ) : accessBadges(user).length > 0 ? (
                  accessBadges(user).map((badge, index) => (
                    <span key={`${badge.label}-${index}`} className={`px-2.5 py-1 rounded-full text-xs font-medium ${badge.badgeClass}`}>
                      {badge.label}
                    </span>
                  ))
                ) : (
                  <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-500">No access assigned</span>
                )}
              </div>

              <div className="flex items-center justify-between gap-2 pt-3 border-t border-slate-100">
                <select
                  value={user.role}
                  onChange={(e) => handleRoleChange(user, e.target.value)}
                  disabled={updatingRoleId === user.id}
                  className={`px-2.5 py-1 rounded-full text-xs font-medium capitalize border-0 focus:outline-none focus:ring-2 focus:ring-cyan-500 disabled:opacity-50 ${
                    user.role === 'admin' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'
                  }`}
                >
                  <option value="admin">Admin</option>
                  <option value="user">User</option>
                </select>
                <span className="text-xs text-slate-400">Added {user.created_at ? new Date(user.created_at).toLocaleDateString() : '-'}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal
        isOpen={wizardOpen}
        onClose={() => setWizardOpen(false)}
        title={editing ? `Access - ${editing.name}` : 'Add User'}
      >
        <div className="space-y-5">
          {!isAdminAccount && (
            <ol className="flex items-center gap-2 text-xs">
              {['Account', ...STEPS].map((label, index) => {
                const number = index;
                const done = number < step;
                const current = number === step;
                return (
                  <li key={label} className="flex items-center gap-2 min-w-0">
                    <span
                      className={`w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-semibold flex-shrink-0 ${
                        current ? 'bg-cyan-600 text-white' : done ? 'bg-cyan-100 text-cyan-700' : 'bg-slate-100 text-slate-400'
                      }`}
                    >
                      {done ? <Check size={11} /> : number + 1}
                    </span>
                    <span className={`truncate ${current ? 'text-slate-800 font-medium' : 'text-slate-400'}`}>{label}</span>
                    {index < STEPS.length && <span className="text-slate-300">/</span>}
                  </li>
                );
              })}
            </ol>
          )}

          {formError && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{formError}</div>
          )}

          {step === 0 && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Name</label>
                <input
                  type="text"
                  name="new-user-name"
                  autoComplete="off"
                  value={account.name}
                  disabled={!!editing}
                  onChange={(e) => setAccount({ ...account, name: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
                <input
                  type="email"
                  name="new-user-email"
                  autoComplete="off"
                  value={account.email}
                  disabled={!!editing}
                  onChange={(e) => setAccount({ ...account, email: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                />
              </div>
              {!editing && (
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Password</label>
                <input
                  type="password"
                  name="new-user-password"
                  autoComplete="new-password"
                  value={account.password}
                  onChange={(e) => setAccount({ ...account, password: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                />
              </div>
              )}
              {!editing && (
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Role</label>
                <select
                  value={account.role}
                  onChange={(e) => setAccount({ ...account, role: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                >
                  <option value="admin">Admin - full access, sees everything</option>
                  <option value="user">User - access set in the next steps</option>
                </select>
              </div>
              )}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Designation</label>
                <input
                  type="text"
                  name="new-user-designation"
                  autoComplete="off"
                  list="designation-options"
                  placeholder="Choose or type, e.g. Salesman"
                  value={account.designation}
                  onChange={(e) => setAccount({ ...account, designation: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                />
                <datalist id="designation-options">
                  {DESIGNATIONS.map((option) => (
                    <option key={option} value={option} />
                  ))}
                </datalist>
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-3">
              <p className="text-sm text-slate-500">Which modules can this user open? They only see these on their home page.</p>
              <div className="space-y-2">
                {MODULE_ORDER.map((id) => (
                  <label key={id} className="flex items-center gap-3 px-3 py-2.5 border border-slate-200 rounded-lg text-sm text-slate-700 cursor-pointer hover:bg-slate-50">
                    <input
                      type="checkbox"
                      checked={draft.modules.includes(MODULE_PERMISSION_NAMES[id])}
                      onChange={() => toggleModule(id)}
                      className={checkboxClass()}
                    />
                    {MODULE_PERMISSION_NAMES[id]}
                  </label>
                ))}
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-3">
              <p className="text-sm text-slate-500">Extra features, outside the modules.</p>
              <div className="space-y-2">
                {FEATURE_OPTIONS.map((feature) => (
                  <label key={feature.key} className="flex items-center justify-between gap-3 px-3 py-2.5 border border-slate-200 rounded-lg text-sm cursor-pointer hover:bg-slate-50">
                    <span>
                      <span className="block text-slate-700 font-medium">{feature.label}</span>
                      <span className="block text-xs text-slate-400">{feature.description}</span>
                    </span>
                    <input
                      type="checkbox"
                      checked={draft.features[feature.key]}
                      onChange={() => setDraft({ ...draft, features: { ...draft.features, [feature.key]: !draft.features[feature.key] } })}
                      className={checkboxClass()}
                    />
                  </label>
                ))}
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <p className="text-sm text-slate-500">Which pages of each module appear in the user's sidebar? The Dashboard is always shown.</p>
              {selectedModules.map((id) => {
                const name = MODULE_PERMISSION_NAMES[id];
                const checked = draft.sidebar[name] ?? allSidebarLabels(id);
                return (
                  <div key={id} className="border border-slate-200 rounded-lg p-3">
                    <p className="text-sm font-semibold text-slate-800 mb-2">{name} <span className="font-normal text-slate-400">· {MODULES[id].label}</span></p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                      {selectableNavItems(id).map((item) => (
                        <label key={item.id} className="flex items-center gap-2 text-sm text-slate-700">
                          <input
                            type="checkbox"
                            checked={checked.includes(item.label)}
                            onChange={() => toggleSidebarItem(id, item.label)}
                            className={checkboxClass()}
                          />
                          {item.label}
                        </label>
                      ))}
                    </div>
                  </div>
                );
              })}
              {selectedModules.length === 0 && <p className="text-sm text-slate-400">No modules selected.</p>}
            </div>
          )}

          {step === 4 && (
            <div className="space-y-3">
              <p className="text-sm text-slate-500">Which records can this user see?</p>
              {([
                ['own', 'Own data only', 'Only records where they are the responsible person or the sender'],
                ['all', 'All data', 'Every record in the modules they can open'],
              ] as const).map(([value, label, description]) => (
                <label key={value} className="flex items-start gap-3 px-3 py-2.5 border border-slate-200 rounded-lg text-sm cursor-pointer hover:bg-slate-50">
                  <input
                    type="radio"
                    name="dataScope"
                    checked={draft.dataScope === value}
                    onChange={() => setDraft({ ...draft, dataScope: value })}
                    className="mt-0.5 text-cyan-600 focus:ring-cyan-500"
                  />
                  <span>
                    <span className="block text-slate-700 font-medium">{label}</span>
                    <span className="block text-xs text-slate-400">{description}</span>
                  </span>
                </label>
              ))}
              <p className="text-xs text-slate-400">Applies to Equipment, Documents and Vehicles. Projects and the Costing Sheet keep their own access rules.</p>
            </div>
          )}

          <div className="flex justify-between gap-2 pt-2">
            <button
              onClick={() => (step > 0 ? setStep(step - 1) : setWizardOpen(false))}
              className="px-4 py-2 text-sm font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
            >
              {step > 0 ? 'Back' : 'Cancel'}
            </button>
            {step === lastStep || isAdminAccount ? (
              <button
                onClick={handleSave}
                disabled={submitting}
                className="flex items-center gap-2 px-4 py-2 bg-[#0f172a] text-white text-sm font-medium rounded-lg hover:bg-slate-800 transition-colors disabled:opacity-50"
              >
                {submitting && <Loader2 size={14} className="animate-spin" />}
                {editing ? 'Save access' : 'Add User'}
              </button>
            ) : (
              <button
                onClick={handleNext}
                className="px-4 py-2 bg-[#0f172a] text-white text-sm font-medium rounded-lg hover:bg-slate-800 transition-colors"
              >
                Next: {STEPS[step]}
              </button>
            )}
          </div>
        </div>
      </Modal>
    </div>
  );
}
