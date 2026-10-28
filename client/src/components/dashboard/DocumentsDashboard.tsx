import { FileSearch, FileText } from 'lucide-react';
import type { NavFilter } from '../../App';
import ResponsiblePerson from '../ResponsiblePerson';
import ModuleOverview from './ModuleOverview';
import {
  EmptyState,
  ErrorState,
  LoadingState,
  Panel,
  TableHead,
  daysUntil,
  formatDMY,
  useJson,
} from './parts';

interface DocumentRow {
  id: number | string;
  document_name?: string | null;
  equipment_name: string;
  company_name?: string | null;
  expiry_date?: string | null;
  responsible_person?: string | null;
  resolved_responsible_name?: string | null;
}

type Tone = 'red' | 'orange' | 'green' | 'none';

// Red: expired or less than 7 days left. Orange: less than 30. Green: OK.
function toneFor(days: number | null): Tone {
  if (days === null) return 'none';
  if (days < 7) return 'red';
  if (days < 30) return 'orange';
  return 'green';
}

const ROW_STYLE: Record<Tone, { row: string; text: string }> = {
  red: { row: 'bg-red-50 hover:bg-red-100/70 border-l-4 border-red-500', text: 'text-red-700' },
  orange: { row: 'bg-orange-50 hover:bg-orange-100/70 border-l-4 border-orange-400', text: 'text-orange-700' },
  green: { row: 'bg-emerald-50/60 hover:bg-emerald-100/60 border-l-4 border-emerald-500', text: 'text-emerald-700' },
  none: { row: 'hover:bg-slate-50 border-l-4 border-transparent', text: 'text-slate-400' },
};

function describeDays(days: number | null): string {
  if (days === null) return 'No expiry date';
  if (days < 0) return `Expired ${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'} ago`;
  if (days === 0) return 'Expires today';
  return `${days} day${days === 1 ? '' : 's'}`;
}

interface Props {
  onNavigate: (page: string, filter?: NavFilter) => void;
}

export default function DocumentsDashboard({ onNavigate }: Props) {
  const documents = useJson<DocumentRow[]>('/api/dashboard/assets?type=Document');

  // Soonest expiry first (already-expired documents lead); undated ones last.
  const sorted = [...(documents.data ?? [])].sort((a, b) => {
    const da = daysUntil(a.expiry_date);
    const db = daysUntil(b.expiry_date);
    if (da === null && db === null) return 0;
    if (da === null) return 1;
    if (db === null) return -1;
    return da - db;
  });
  const shown = sorted.slice(0, 10);

  return (
    <div className="space-y-6">

      {/* Original donut chart and stat tiles (total, expiring 30 / 7 days, expired, ...) */}
      <ModuleOverview module="documents" onNavigate={onNavigate} />

      <Panel
        title="Documents by Expiry Date"
        icon={FileText}
        action={{ label: `View all documents${sorted.length > shown.length ? ` (${sorted.length})` : ''}`, onClick: () => onNavigate('equipment', { tab: 'documents' }) }}
      >
        {documents.loading ? (
          <LoadingState />
        ) : documents.error ? (
          <ErrorState message={documents.error} />
        ) : shown.length === 0 ? (
          <EmptyState icon={FileSearch} message="No documents found" hint="Documents received by email will appear here with their expiry dates." />
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-x-5 gap-y-1 px-5 py-2.5 text-xs text-slate-500 border-b border-slate-100">
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-red-500" />Expired or under 7 days</span>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-orange-400" />Under 30 days</span>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />OK</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <TableHead columns={['Document Name', 'Company', 'Expiry Date', 'Responsible Person', 'Days Remaining']} />
                <tbody>
                  {shown.map((doc) => {
                    const days = daysUntil(doc.expiry_date);
                    const style = ROW_STYLE[toneFor(days)];
                    return (
                      <tr key={doc.id} className={`transition-colors border-b border-white ${style.row}`}>
                        <td className="px-5 py-3 font-medium text-slate-800">{doc.document_name || doc.equipment_name}</td>
                        <td className="px-5 py-3 text-slate-600">{doc.company_name || '-'}</td>
                        <td className="px-5 py-3 text-slate-700 whitespace-nowrap">{formatDMY(doc.expiry_date)}</td>
                        <td className="px-5 py-3 text-slate-600">
                          <ResponsiblePerson value={doc.responsible_person} resolvedName={doc.resolved_responsible_name} />
                        </td>
                        <td className={`px-5 py-3 whitespace-nowrap font-semibold ${style.text}`}>{describeDays(days)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Panel>
    </div>
  );
}
