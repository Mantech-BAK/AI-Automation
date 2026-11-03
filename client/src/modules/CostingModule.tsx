import type { MasUser } from '../lib/costing';
import AdminUsers from '../pages/costing/AdminUsers';
import Approvals from '../pages/costing/Approvals';
import CostingDashboard from '../pages/costing/CostingDashboard';
import EnquiriesList from '../pages/costing/EnquiriesList';
import EnquiryDetail from '../pages/costing/EnquiryDetail';
import EnquiryForm from '../pages/costing/EnquiryForm';
import MyTasks from '../pages/costing/MyTasks';
import SheetPage from '../pages/costing/SheetPage';
import { Loading } from '../pages/costing/ui';

interface CostingModuleProps {
  // The signed-in user's costing profile: undefined while it loads, null when the account has none.
  me: MasUser | null | undefined;
  // Opens a Costing Sheet URL (App keeps the sidebar highlight in step).
  onNavigate: (path: string) => void;
}

// URLs: /costing (dashboard) /costing/enquiries /costing/enquiries/new /costing/enquiries/:id[/edit]
// /costing/tasks /costing/approvals /costing/admin /costing/sheet/new?enquiry=:id /costing/sheet/:id[/edit]
export default function CostingModule({ me, onNavigate }: CostingModuleProps) {
  if (me === undefined) return <Loading />;

  const [, a, b, c] = window.location.pathname.split('/').filter(Boolean);
  const id = Number(b);

  if (me === null) {
    return <p className="text-sm text-slate-500">Your account has no costing profile. Ask an administrator to check your email in the Users section.</p>;
  }

  if (a === 'enquiries') {
    if (b === 'new') return <EnquiryForm me={me} onNavigate={onNavigate} />;
    if (id && c === 'edit') return <EnquiryForm me={me} enquiryId={id} onNavigate={onNavigate} />;
    if (id) return <EnquiryDetail me={me} enquiryId={id} onNavigate={onNavigate} />;
    return <EnquiriesList onNavigate={onNavigate} />;
  }
  if (a === 'tasks') return <MyTasks onNavigate={onNavigate} />;
  if (a === 'approvals') {
    return me.role_level >= 3 ? <Approvals onNavigate={onNavigate} /> : <p className="text-sm text-slate-500">Pending approvals are for managers.</p>;
  }
  if (a === 'admin') {
    return me.role_level >= 4 ? <AdminUsers me={me} /> : <p className="text-sm text-slate-500">Only the Director or General Manager can manage users.</p>;
  }
  if (a === 'sheet') {
    if (b === 'new') {
      const enquiryId = Number(new URLSearchParams(window.location.search).get('enquiry'));
      return enquiryId ? <SheetPage mode="new" me={me} enquiryId={enquiryId} onNavigate={onNavigate} /> : <p className="text-sm text-slate-500">Open a costing sheet from an enquiry.</p>;
    }
    if (id) return <SheetPage mode={c === 'edit' ? 'edit' : 'view'} me={me} sheetId={id} onNavigate={onNavigate} />;
  }
  return <CostingDashboard me={me} onNavigate={onNavigate} />;
}

