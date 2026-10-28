import { useEffect, useState } from 'react';
import { bd, costingApi, errorText, formatDateTime, type Sheet } from '../../lib/costing';
import { Badge, ErrorBanner, Loading, PageHeader, tdCls, thCls } from './ui';

// Costing sheets submitted by the people who report to the logged-in manager.
export default function Approvals({ onNavigate }: { onNavigate: (path: string) => void }) {
  const [rows, setRows] = useState<Sheet[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    costingApi<Sheet[]>('/sheets?pending_approval=1')
      .then(setRows)
      .catch((e) => setError(errorText(e, 'Failed to load pending approvals')));
  }, []);

  return (
    <div className="space-y-6">
      <PageHeader title="Pending Approvals" subtitle="Costing sheets waiting for your decision" />
      {error && <ErrorBanner message={error} />}
      <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {!rows ? (
          <Loading />
        ) : rows.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-slate-400">Nothing is waiting for your approval</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  {['Quotation Ref', 'Enquiry', 'Project', 'Client', 'Prepared By', 'Selling (BHD)', 'Status', 'Updated'].map((c) => (
                    <th key={c} className={thCls}>{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((sheet) => (
                  <tr key={sheet.id} onClick={() => onNavigate(`/costing/sheet/${sheet.id}`)} className="hover:bg-teal-50/50 cursor-pointer">
                    <td className={`${tdCls} font-medium text-slate-800 whitespace-nowrap`}>{sheet.quotation_ref_no}</td>
                    <td className={`${tdCls} text-slate-600 whitespace-nowrap`}>{sheet.enquiry_no}</td>
                    <td className={`${tdCls} text-slate-700`}>{sheet.project_name}</td>
                    <td className={`${tdCls} text-slate-600`}>{sheet.client}</td>
                    <td className={`${tdCls} text-slate-600`}>{sheet.prepared_by_name}</td>
                    <td className={`${tdCls} text-right text-slate-800`}>{bd(sheet.total_selling_amount)}</td>
                    <td className={tdCls}><Badge status={sheet.status} /></td>
                    <td className={`${tdCls} text-slate-500 whitespace-nowrap`}>{formatDateTime((sheet as unknown as { submitted_at: string }).submitted_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
