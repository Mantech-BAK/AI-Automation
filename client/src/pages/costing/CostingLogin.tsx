import { useEffect, useState } from 'react';
import { UserCircle2 } from 'lucide-react';
import { costingApi, errorText, jsonInit, type MasUser } from '../../lib/costing';
import { ErrorBanner, Field, inputCls, primaryBtn } from './ui';

// "Select your name to continue" - an internal system, so there is no password: the chosen user is kept in the session.
export default function CostingLogin({ current, onLogin }: { current: MasUser | null; onLogin: (user: MasUser) => void }) {
  const [users, setUsers] = useState<MasUser[]>([]);
  const [selected, setSelected] = useState<string>(current ? String(current.id) : '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    costingApi<MasUser[]>('/login-users').then(setUsers).catch((e) => setError(errorText(e, 'Failed to load users')));
  }, []);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await costingApi<{ user: MasUser }>('/login', jsonInit('POST', { user_id: Number(selected) }));
      onLogin(result.user);
    } catch (e) {
      setError(errorText(e, 'Could not select that user'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-md mx-auto mt-10 bg-white rounded-2xl border border-slate-200 shadow-sm p-8 space-y-5">
      <div className="text-center">
        <div className="w-14 h-14 mx-auto rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center mb-3">
          <UserCircle2 size={30} />
        </div>
        <h1 className="text-xl font-bold text-slate-800">Costing Sheet</h1>
        <p className="text-slate-500 text-sm mt-1">Select your name to continue</p>
      </div>
      {error && <ErrorBanner message={error} />}
      <Field label="Your name">
        <select value={selected} onChange={(e) => setSelected(e.target.value)} className={inputCls} aria-label="Your name">
          <option value="">Select a user...</option>
          {users.map((user) => (
            <option key={user.id} value={user.id}>
              {user.name} - {user.role_name}
              {user.department_name ? ` (${user.department_name})` : ''}
            </option>
          ))}
        </select>
      </Field>
      <button onClick={submit} disabled={!selected || busy} className={`${primaryBtn} w-full justify-center`}>
        {busy ? 'Please wait...' : 'Continue'}
      </button>
    </div>
  );
}
