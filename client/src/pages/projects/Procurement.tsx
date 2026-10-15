import { PieChart, ShoppingCart } from 'lucide-react';
import { EmptyState, Panel } from '../../components/dashboard/parts';
import { ProcurementDonut } from '../../components/projects/shared';

export default function Procurement() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Procurement</h1>
        <p className="text-slate-500 mt-1">Purchasing and cost breakdown</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        <Panel title="Procurement" icon={ShoppingCart}>
          <EmptyState icon={ShoppingCart} message="Procurement data coming soon" hint="Purchase orders and supplier commitments will be tracked here." />
        </Panel>

        <Panel title="Estimated Cost Split" icon={PieChart}>
          <ProcurementDonut height="h-64" />
        </Panel>
      </div>
    </div>
  );
}
