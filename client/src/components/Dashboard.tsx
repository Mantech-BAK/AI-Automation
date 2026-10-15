import type { NavFilter } from '../App';
import type { ModuleId } from '../lib/modules';
import DocumentsDashboard from './dashboard/DocumentsDashboard';
import EquipmentDashboard from './dashboard/EquipmentDashboard';
import ProjectsDashboard from '../pages/ProjectsDashboard';
import VehiclesDashboard from './dashboard/VehiclesDashboard';

interface DashboardProps {
  // Which module's dashboard to show.
  module: ModuleId;
  onNavigate: (page: string, filter?: NavFilter) => void;
}

// Each module has its own dashboard (stat tiles, charts and lists) under
// ./dashboard; this just picks the right one.
export default function Dashboard({ module, onNavigate }: DashboardProps) {
  switch (module) {
    case 'vehicles':
      return <VehiclesDashboard onNavigate={onNavigate} />;
    case 'documents':
      return <DocumentsDashboard onNavigate={onNavigate} />;
    case 'projects':
      return <ProjectsDashboard onNavigate={onNavigate} />;
    default:
      return <EquipmentDashboard onNavigate={onNavigate} />;
  }
}
