import { useEffect, useState } from 'react';
import { Users as UsersIcon, Plus, Trash2, Loader2, ShieldCheck, User as UserIcon, KeyRound } from 'lucide-react';
import Modal from './Modal';

interface AppUser {
  id: number;
  name: string;
  email: string;
  role: string;
  allowed_departments: string[];
  allowed_item_types: string[];
  allowed_categories: string[];
  created_at: string;
}

interface LookupOption {
  id: string;
  name: string;
}

const ITEM_TYPE_OPTIONS = ['Equipment', 'Document'];

const emptyForm = {
  name: '',
  email: '',
  password: '',
  role: 'user',
  allowed_departments: [] as string[],
  allowed_item_types: [] as string[],
  allowed_categories: [] as string[],
};

function toggleInArray(list: string[], value: string): string[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

export default function UsersPage() {
  const [users, setUsers] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [departmentOptions, setDepartmentOptions] = useState<LookupOption[]>([]);
  const [categoryOptions, setCategoryOptions] = useState<LookupOption[]>([]);

  const [addModalOpen, setAddModalOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [updatingRoleId, setUpdatingRoleId] = useState<number | null>(null);

  const [permissionsUser, setPermissionsUser] = useState<AppUser | null>(null);
  const [permissionsDraft, setPermissionsDraft] = useState<{
    allowed_departments: string[];
    allowed_item_types: string[];
    allowed_categories: string[];
  }>({ allowed_departments: [], allowed_item_types: [], allowed_categories: [] });
  const [savingPermissions, setSavingPermissions] = useState(false);

  useEffect(() => {
    fetchUsers();
    fetchLookups();
  }, []);

  async function fetchUsers() {
    setLoading(true);
    try {
      const response = await fetch('/api/users');
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

  async function fetchLookups() {
    try {
      const [departmentsRes, categoriesRes] = await Promise.all([
        fetch('/api/dashboard/departments'),
        fetch('/api/dashboard/categories'),
      ]);
      if (departmentsRes.ok) setDepartmentOptions(await departmentsRes.json());
      if (categoriesRes.ok) setCategoryOptions(await categoriesRes.json());
    } catch (fetchError) {
      console.error('Error fetching permission lookups:', fetchError);
    }
  }

  async function handleAddUser() {
    if (!form.name.trim() || !form.email.trim() || !form.password.trim()) {
      setFormError('Name, email, and password are required');
      return;
    }

    setSubmitting(true);
    setFormError(null);
    try {
      const response = await fetch('/api/users/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const json = await response.json();
      if (!response.ok) {
        throw new Error(json?.error || 'Failed to add user');
      }
      setAddModalOpen(false);
      setForm(emptyForm);
      await fetchUsers();
    } catch (submitError) {
      const message = submitError instanceof Error ? submitError.message : 'Failed to add user';
      setFormError(message);
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
      const response = await fetch(`/api/users/${user.id}`, { method: 'DELETE' });
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
      const response = await fetch(`/api/users/${user.id}/update`, {
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

  function openPermissionsModal(user: AppUser) {
    setPermissionsUser(user);
    setPermissionsDraft({
      allowed_departments: user.allowed_departments || [],
      allowed_item_types: user.allowed_item_types || [],
      allowed_categories: user.allowed_categories || [],
    });
  }

  async function handleSavePermissions() {
    if (!permissionsUser) return;
    setSavingPermissions(true);
    try {
      const response = await fetch(`/api/users/${permissionsUser.id}/update`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(permissionsDraft),
      });
      const json = await response.json();
      if (!response.ok) {
        throw new Error(json?.error || 'Failed to update permissions');
      }
      setPermissionsUser(null);
      await fetchUsers();
    } catch (updateError) {
      window.alert(updateError instanceof Error ? updateError.message : 'Failed to update permissions');
    } finally {
      setSavingPermissions(false);
    }
  }

  function accessBadges(user: AppUser) {
    const badges: { label: string; badgeClass: string }[] = [];
    for (const dept of user.allowed_departments || []) {
      badges.push({ label: dept, badgeClass: 'bg-cyan-100 text-cyan-700' });
    }
    for (const type of user.allowed_item_types || []) {
      badges.push({ label: type, badgeClass: 'bg-amber-100 text-amber-700' });
    }
    for (const category of user.allowed_categories || []) {
      badges.push({ label: category, badgeClass: 'bg-emerald-100 text-emerald-700' });
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Users</h1>
          <p className="text-slate-500 mt-1">Manage who can log in to the software</p>
        </div>
        <button
          onClick={() => {
            setForm(emptyForm);
            setFormError(null);
            setAddModalOpen(true);
          }}
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
                  </div>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  {user.role !== 'admin' && (
                    <button
                      onClick={() => openPermissionsModal(user)}
                      className="p-1.5 text-slate-400 hover:text-cyan-600 hover:bg-cyan-50 rounded-lg transition-colors"
                      title="Manage permissions"
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
                    {deletingId === user.id ? (
                      <Loader2 size={16} className="animate-spin" />
                    ) : (
                      <Trash2 size={16} />
                    )}
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                {user.role === 'admin' ? (
                  <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-purple-100 text-purple-700">
                    Full Access
                  </span>
                ) : accessBadges(user).length > 0 ? (
                  accessBadges(user).map((badge, index) => (
                    <span key={`${badge.label}-${index}`} className={`px-2.5 py-1 rounded-full text-xs font-medium ${badge.badgeClass}`}>
                      {badge.label}
                    </span>
                  ))
                ) : (
                  <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-500">
                    No access assigned
                  </span>
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
                <span className="text-xs text-slate-400">
                  Added {user.created_at ? new Date(user.created_at).toLocaleDateString() : '-'}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal isOpen={addModalOpen} onClose={() => setAddModalOpen(false)} title="Add User">
        <div className="space-y-4">
          {formError && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {formError}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Name</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Password</label>
            <input
              type="password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Role</label>
            <select
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value })}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
            >
              <option value="admin">Admin</option>
              <option value="user">User</option>
            </select>
          </div>

          {form.role === 'user' && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Departments</label>
                <div className="space-y-1.5 max-h-32 overflow-y-auto pr-1">
                  {departmentOptions.map((option) => (
                    <label key={option.id} className="flex items-center gap-2 text-sm text-slate-700">
                      <input
                        type="checkbox"
                        checked={form.allowed_departments.includes(option.name)}
                        onChange={() => setForm({ ...form, allowed_departments: toggleInArray(form.allowed_departments, option.name) })}
                        className="rounded border-slate-300 text-cyan-600 focus:ring-cyan-500"
                      />
                      {option.name}
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Item Types</label>
                <div className="space-y-1.5">
                  {ITEM_TYPE_OPTIONS.map((type) => (
                    <label key={type} className="flex items-center gap-2 text-sm text-slate-700">
                      <input
                        type="checkbox"
                        checked={form.allowed_item_types.includes(type)}
                        onChange={() => setForm({ ...form, allowed_item_types: toggleInArray(form.allowed_item_types, type) })}
                        className="rounded border-slate-300 text-cyan-600 focus:ring-cyan-500"
                      />
                      {type}
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Categories</label>
                <div className="space-y-1.5 max-h-32 overflow-y-auto pr-1">
                  {categoryOptions.map((option) => (
                    <label key={option.id} className="flex items-center gap-2 text-sm text-slate-700">
                      <input
                        type="checkbox"
                        checked={form.allowed_categories.includes(option.name)}
                        onChange={() => setForm({ ...form, allowed_categories: toggleInArray(form.allowed_categories, option.name) })}
                        className="rounded border-slate-300 text-cyan-600 focus:ring-cyan-500"
                      />
                      {option.name}
                    </label>
                  ))}
                </div>
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button
              onClick={() => setAddModalOpen(false)}
              className="px-4 py-2 text-sm font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleAddUser}
              disabled={submitting}
              className="flex items-center gap-2 px-4 py-2 bg-[#0f172a] text-white text-sm font-medium rounded-lg hover:bg-slate-800 transition-colors disabled:opacity-50"
            >
              {submitting && <Loader2 size={14} className="animate-spin" />}
              Add User
            </button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={permissionsUser !== null} onClose={() => setPermissionsUser(null)} title="Manage Permissions">
        <div className="space-y-4">
          {permissionsUser && (
            <p className="text-sm text-slate-500">
              Choose which departments, item types, and categories <span className="font-medium text-slate-700">{permissionsUser.name}</span> can access.
            </p>
          )}

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Departments</label>
            <div className="space-y-1.5 max-h-32 overflow-y-auto pr-1">
              {departmentOptions.map((option) => (
                <label key={option.id} className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={permissionsDraft.allowed_departments.includes(option.name)}
                    onChange={() =>
                      setPermissionsDraft({
                        ...permissionsDraft,
                        allowed_departments: toggleInArray(permissionsDraft.allowed_departments, option.name),
                      })
                    }
                    className="rounded border-slate-300 text-cyan-600 focus:ring-cyan-500"
                  />
                  {option.name}
                </label>
              ))}
              {departmentOptions.length === 0 && <p className="text-xs text-slate-400">No departments found.</p>}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Item Types</label>
            <div className="space-y-1.5">
              {ITEM_TYPE_OPTIONS.map((type) => (
                <label key={type} className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={permissionsDraft.allowed_item_types.includes(type)}
                    onChange={() =>
                      setPermissionsDraft({
                        ...permissionsDraft,
                        allowed_item_types: toggleInArray(permissionsDraft.allowed_item_types, type),
                      })
                    }
                    className="rounded border-slate-300 text-cyan-600 focus:ring-cyan-500"
                  />
                  {type}
                </label>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Categories</label>
            <div className="space-y-1.5 max-h-32 overflow-y-auto pr-1">
              {categoryOptions.map((option) => (
                <label key={option.id} className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={permissionsDraft.allowed_categories.includes(option.name)}
                    onChange={() =>
                      setPermissionsDraft({
                        ...permissionsDraft,
                        allowed_categories: toggleInArray(permissionsDraft.allowed_categories, option.name),
                      })
                    }
                    className="rounded border-slate-300 text-cyan-600 focus:ring-cyan-500"
                  />
                  {option.name}
                </label>
              ))}
              {categoryOptions.length === 0 && <p className="text-xs text-slate-400">No categories found.</p>}
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              onClick={() => setPermissionsUser(null)}
              className="px-4 py-2 text-sm font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSavePermissions}
              disabled={savingPermissions}
              className="flex items-center gap-2 px-4 py-2 bg-[#0f172a] text-white text-sm font-medium rounded-lg hover:bg-slate-800 transition-colors disabled:opacity-50"
            >
              {savingPermissions && <Loader2 size={14} className="animate-spin" />}
              Save
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
