import UsersPage from './UsersPage';
import AdminUsers from '../pages/costing/AdminUsers';
import type { MasUser } from '../lib/costing';

interface SettingsUsersProps {
  isAdmin: boolean;
  // The Costing Sheet user (undefined = still checking, null = nobody picked yet).
  costingUser: MasUser | null | undefined;
}

// Settings -> Users: the one place to manage users. MAS sign-in users (admins only) and the Costing Sheet users
// (roles, departments, managers - Director / General Manager only).
export default function SettingsUsers({ isAdmin, costingUser }: SettingsUsersProps) {
  return (
    <div className="space-y-10">
      <section>
        <h2 className="text-lg font-semibold text-slate-800 mb-1">MAS users</h2>
        <p className="text-sm text-slate-500 mb-4">People who sign in to MAS, with their Microsoft 365 email and what they may access.</p>
        {isAdmin ? <UsersPage /> : <p className="text-sm text-slate-500">Only administrators can manage MAS users.</p>}
      </section>

      <section>
        <h2 className="text-lg font-semibold text-slate-800 mb-1">Costing Sheet users</h2>
        <p className="text-sm text-slate-500 mb-4">Who can use the Costing Sheet, with their role, department and manager.</p>
        {costingUser === undefined ? (
          <p className="text-sm text-slate-500">Loading...</p>
        ) : costingUser === null ? (
          <p className="text-sm text-slate-500">Open the Costing Sheet and pick your user first, then come back here to manage the Costing Sheet users.</p>
        ) : costingUser.role_level >= 4 ? (
          <AdminUsers me={costingUser} />
        ) : (
          <p className="text-sm text-slate-500">Only the Director or General Manager can manage Costing Sheet users.</p>
        )}
      </section>
    </div>
  );
}
