import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Printer } from 'lucide-react';
import { bd, costingApi, formatDMY, lineFromRow, quotationRows, calcSheet, type SheetData } from '../../lib/costing';

const PRINT_CSS = `
@media print {
  body * { visibility: hidden; }
  #quotation-sheet, #quotation-sheet * { visibility: visible; }
  #quotation-sheet { position: absolute; left: 0; top: 0; width: 100%; box-shadow: none !important; border: none !important; }
  .no-print { display: none !important; }
  @page { margin: 14mm; }
}
`;

// Read-only quotation generated from a costing sheet: selling prices only, never costs or margins.
export default function Quotation({ sheetId, onNavigate }: { sheetId: number; onNavigate: (path: string) => void }) {
  const [data, setData] = useState<SheetData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    costingApi<SheetData>(`/sheets/${sheetId}`).then(setData).catch((e) => setError(e instanceof Error ? e.message : 'Failed to load quotation'));
  }, [sheetId]);

  const lines = useMemo(() => (data ? data.lines.map(lineFromRow) : []), [data]);
  const rows = useMemo(() => quotationRows(lines), [lines]);
  const total = useMemo(() => calcSheet(lines).summary.total_selling_amount, [lines]);

  if (error) return <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>;
  if (!data) return <p className="text-sm text-slate-400">Loading...</p>;

  const sheet = data.sheet;
  const approved = sheet.status === 'approved';
  const terms: [string, string | null][] = [
    ['Payment terms', sheet.payment_terms],
    ['Validity', sheet.validity],
    ['Delivery time', sheet.delivery_time],
    ['Warranty', sheet.warranty],
  ];

  return (
    <div className="space-y-4">
      <style>{PRINT_CSS}</style>
      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <button onClick={() => onNavigate(`/costing/sheet/${sheet.id}`)} className="flex items-center gap-1 text-sm text-teal-600 hover:underline">
          <ArrowLeft size={14} /> Back to costing sheet
        </button>
        <div className="flex items-center gap-3">
          {!approved && <span className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-1.5">Draft - not approved yet</span>}
          <button onClick={() => window.print()} className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-gradient-to-r from-cyan-500 to-blue-600 text-white rounded-lg hover:shadow-lg">
            <Printer size={15} /> Print / Save as PDF
          </button>
        </div>
      </div>

      <div id="quotation-sheet" className="relative bg-white border border-slate-200 shadow-sm rounded-xl p-8 lg:p-12 max-w-4xl mx-auto text-slate-800">
        {!approved && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none overflow-hidden">
            <span className="text-7xl font-black text-slate-200/70 -rotate-25 select-none" style={{ transform: 'rotate(-25deg)' }}>DRAFT</span>
          </div>
        )}

        <div className="relative">
          <div className="flex items-start justify-between gap-4 border-b-2 border-slate-800 pb-4">
            <div>
              <h1 className="text-2xl font-extrabold tracking-tight">Mantech Commercial Service W.L.L</h1>
              <p className="text-sm text-slate-500">Kingdom of Bahrain</p>
            </div>
            <div className="text-right">
              <p className="text-xl font-bold tracking-wide">QUOTATION</p>
              <p className="text-sm font-semibold">Ref: {sheet.quotation_ref_no}</p>
              <p className="text-sm text-slate-600">Date: {formatDMY(sheet.date)}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-1 text-sm mt-5">
            <p><span className="text-slate-500">Client:</span> <span className="font-medium">{sheet.client || sheet.customer_name}</span></p>
            <p><span className="text-slate-500">Project:</span> <span className="font-medium">{sheet.project_name || '-'}</span></p>
            <p><span className="text-slate-500">Consultant:</span> {sheet.consultant || '-'}</p>
            <p><span className="text-slate-500">Main contractor:</span> {sheet.main_contractor || '-'}</p>
          </div>

          <table className="w-full text-sm mt-6 border border-slate-300">
            <thead>
              <tr className="bg-slate-100 text-left">
                <th className="px-3 py-2 border-b border-slate-300 w-12">SL</th>
                <th className="px-3 py-2 border-b border-slate-300">Description</th>
                <th className="px-3 py-2 border-b border-slate-300 text-right w-16">Qty</th>
                <th className="px-3 py-2 border-b border-slate-300 w-16">Unit</th>
                <th className="px-3 py-2 border-b border-slate-300 text-right w-32">Unit Price (BHD)</th>
                <th className="px-3 py-2 border-b border-slate-300 text-right w-32">Total (BHD)</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr><td colSpan={6} className="px-3 py-6 text-center text-slate-400">No priced items</td></tr>
              )}
              {rows.map((row, index) => (
                <tr key={index} className="border-b border-slate-200 align-top">
                  <td className="px-3 py-2">{index + 1}</td>
                  <td className="px-3 py-2">{row.description}</td>
                  <td className="px-3 py-2 text-right">{row.qty}</td>
                  <td className="px-3 py-2">{row.unit}</td>
                  <td className="px-3 py-2 text-right">{row.unitPrice === null ? '' : bd(row.unitPrice)}</td>
                  <td className="px-3 py-2 text-right">{bd(row.total)}</td>
                </tr>
              ))}
              <tr className="bg-slate-100 font-bold">
                <td colSpan={5} className="px-3 py-2.5 text-right">TOTAL (BHD)</td>
                <td className="px-3 py-2.5 text-right">{bd(total)}</td>
              </tr>
            </tbody>
          </table>
          <p className="text-xs text-slate-500 mt-1">All prices are in Bahraini Dinars and exclusive of VAT.</p>

          <div className="mt-6 text-sm">
            <h2 className="font-bold mb-2">Terms &amp; Conditions</h2>
            <dl className="space-y-1.5">
              {terms.map(([label, value]) => (
                <div key={label} className="grid grid-cols-[9rem_1fr] gap-2">
                  <dt className="font-medium text-slate-600">{label}</dt>
                  <dd>{value || '-'}</dd>
                </div>
              ))}
              {sheet.terms_notes && (
                <div className="grid grid-cols-[9rem_1fr] gap-2">
                  <dt className="font-medium text-slate-600">Notes</dt>
                  <dd className="whitespace-pre-line">{sheet.terms_notes}</dd>
                </div>
              )}
            </dl>
          </div>

          <div className="mt-12 grid grid-cols-2 gap-8 text-sm">
            <div>
              <p className="text-slate-500">For Mantech Commercial Service W.L.L</p>
              <div className="mt-10 border-t border-slate-400 pt-1">{sheet.approved_by_gm || sheet.prepared_by || ' '}</div>
            </div>
            <div>
              <p className="text-slate-500">Client acceptance</p>
              <div className="mt-10 border-t border-slate-400 pt-1">Signature &amp; stamp</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
