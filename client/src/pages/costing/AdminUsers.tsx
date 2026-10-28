import { useCallback, useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import Modal from '../../components/Modal';
import { costingApi, errorText, jsonInit, type Department, type MasUser } from '../../lib/costing';
import { ErrorBanner, Field, Loading, PageHeader, inputCls, primaryBtn, secondaryBtn, tdCls, thCls } from './ui';

interface Role {
  id: number;
  name: string;
  level: number;
}

interface UserForm {
  name: string;
  email: string;
  role_id: string;
  department_id: string;
  manager_id: string;
  is_active: boolean;
}

const blank: UserForm = { name: '', email: '', role_id: '', department_id: '', manager_id: '', is_active: true };

// Users & Settings: who can use the costing module, their role, department and who they report to (Director / GM only).
export default function AdminUsers({ me }: { me: MasUser }) {
  const [users, setUsers] = useState<MasUser[] | null>(null);
  const [roles, setRoles] = useState<Role[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [editing, setEditing] = useState<MasUser | 'new' | null>(null);
  const [form, setForm] = useState<UserForm>(blank);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    costingApi<MasUser[]>('/users').then(setUsers).catch((e) => setError(errorText(e, 'Failed to load users')));
  }, []);

  useEffect(() => {
    load();
    costingApi<Role[]>('/roles').then(setRoles).catch(() => undefined);
    costingApi<Department[]>('/departments').then(setDepartments).catch(() => undefined);
  }, [load]);

  const open = (user: MasUser | 'new') => {
    setFormError(null);
    setEditing(user);
    setForm(
      user === 'new'
        ? blank
        : { name: user.name, email: user.email ?? '', role_id: String(user.role_id), department_id: user.department_id ? String(user.department_id) : '', manager_id: user.manager_id ? String(user.manager_id) : '', is_active: user.is_active }
    );
  };

  const save = async () => {
    setBusy(true);
    setFormError(null);
    try {
      if (editing === 'new') await costingApi('/users', jsonInit('POST', form));
      else if (editing) await costingApi(`/users/${editing.id}`, jsonInit('PUT', form));
      setEditing(null);
      load();
    } catch (e) {
      setFormError(errorText(e, 'Failed to save the user'));
    } finally {
      setBusy(false);
    }
  };

  const toggleActive = async (user: MasUser) => {
    try {
      await costingApi(`/users/${user.id}`, jsonInit('PUT', { name: user.name, email: user.email ?? '', role_id: user.role_id, department_id: user.department_id ?? '', manager_id: user.manager_id ?? '', is_active: !user.is_active }));
      load();
    } catch (e) {
      setError(errorText(e, 'Failed to update the user'));
    }
  };

  const managerChoices = (users ?? []).filter((u) => u.is_active && (editing === 'new' || !editing || u.id !== editing.id));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Users & Settings"
        subtitle="Costing users, their roles and who reports to whom"
        actions={
          <button onClick={() => open('new')} className={primaryBtn}>
            <Plus size={16} /> Add User
          </button>
        }
      />
      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}

      <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {!users ? (
          <Loading />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  {['Name', 'Role', 'Department', 'Manager', 'Status', ''].map((c) => (
                    <th key={c} className={thCls}>{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {users.map((user) => (
                  <tr key={user.id} className={user.is_active ? '' : 'text-slate-400'}>
                    <td className={`${tdCls} font-medium`}>{user.name}{user.id === me.id && <span className="ml-2 text-xs text-teal-600">(you)</span>}</td>
                    <td className={tdCls}>{user.role_name}</td>
                    <td className={tdCls}>{user.department_name || '-'}</td>
                    <td className={tdCls}>{user.manager_name || '-'}</td>
                    <td className={tdCls}>{user.is_active ? 'Active' : 'Inactive'}</td>
                    <td className={`${tdCls} text-right whitespace-nowrap`}>
                      <button onClick={() => open(user)} className="text-sm font-medium text-teal-600 hover:underline">Edit</button>
                      {user.id !== me.id && (
                        <button onClick={() => toggleActive(user)} className="ml-3 text-sm font-medium text-slate-500 hover:underline">{user.is_active ? 'Deactivate' : 'Activate'}</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <Modal isOpen={editing !== null} onClose={() => setEditing(null)} title={editing === 'new' ? 'Add User' : 'Edit User'} size="lg">
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Name" required>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputCls} aria-label="Name" />
            </Field>
            <Field label="Email">
              <input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className={inputCls} aria-label="Email" />
            </Field>
            <Field label="Role" required>
              <select value={form.role_id} onChange={(e) => setForm({ ...form, role_id: e.target.value })} className={inputCls} aria-label="Role">
                <option value="">Select a role...</option>
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </select>
            </Field>
            <Field label="Department">
              <select value={form.department_id} onChange={(e) => setForm({ ...form, department_id: e.target.value })} className={inputCls} aria-label="Department">
                <option value="">None</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </Field>
            <Field label="Manager (reports to)">
              <select value={form.manager_id} onChange={(e) => setForm({ ...form, manager_id: e.target.value })} className={inputCls} aria-label="Manager">
                <option value="">No manager</option>
                {managerChoices.map((u) => (
                  <option key={u.id} value={u.id}>{u.name} - {u.role_name}</option>
                ))}
              </select>
            </Field>
            <label className="flex items-center gap-2 text-sm text-slate-700 sm:mt-7">
              <input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} /> Active
            </label>
          </div>
          {formError && <ErrorBanner message={formError} />}
          <div className="flex justify-end gap-3">
            <button onClick={() => setEditing(null)} className={secondaryBtn}>Cancel</button>
            <button onClick={save} disabled={busy || !form.name.trim() || !form.role_id} className={primaryBtn}>{busy ? 'Saving...' : 'Save'}</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
