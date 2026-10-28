import CostingDashboard from '../pages/costing/CostingDashboard';
import CostingSheetForm from '../pages/costing/CostingSheetForm';
import Enquiries from '../pages/costing/Enquiries';
import Quotation from '../pages/costing/Quotation';
import SheetsList from '../pages/costing/SheetsList';

interface CostingModuleProps {
  // Opens a Costing Sheet URL, e.g. /costing/sheet/12 (App keeps the sidebar highlight in step).
  onNavigate: (path: string) => void;
}

// URLs: /costing (dashboard), /costing/enquiries, /costing/sheets, /costing/quotations,
// /costing/sheet/:id (the costing form) and /costing/quotation/:id (the printable quotation).
export default function CostingModule({ onNavigate }: CostingModuleProps) {
  const [, second, third] = window.location.pathname.split('/').filter(Boolean);
  const id = Number(third);

  if (second === 'sheet' && id) return <CostingSheetForm sheetId={id} onNavigate={onNavigate} />;
  if (second === 'quotation' && id) return <Quotation sheetId={id} onNavigate={onNavigate} />;
  if (second === 'enquiries') return <Enquiries onNavigate={onNavigate} />;
  if (second === 'sheets') return <SheetsList mode="sheets" onNavigate={onNavigate} />;
  if (second === 'quotations') return <SheetsList mode="quotations" onNavigate={onNavigate} />;
  return <CostingDashboard onNavigate={onNavigate} />;
}
