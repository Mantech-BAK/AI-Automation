import { useEffect, useState } from 'react';
import { Users as UsersIcon, Plus, Trash2, Loader2, ShieldCheck, User as UserIcon } from 'lucide-react';
import Modal from './Modal';

interface AppUser {
  id: number;
  name: string;
  email: string;
  role: string;
  created_at: string;
}

const emptyForm = {
  name: '',
  email: '',
  password: '',
  role: 'user',
};

export default function UsersPage() {
  const [users, setUsers] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [addModalOpen, setAddModalOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [updatingRoleId, setUpdatingRoleId] = useState<number | null>(null);

  useEffect(() => {
    fetchUsers();
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
                <button
                  onClick={() => handleDeleteUser(user)}
                  disabled={deletingId === user.id}
                  className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50 flex-shrink-0"
                  title="Delete user"
                >
                  {deletingId === user.id ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <Trash2 size={16} />
                  )}
                </button>
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
    </div>
  );
}
