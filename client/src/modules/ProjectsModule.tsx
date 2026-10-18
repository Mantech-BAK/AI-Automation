import type { NavFilter } from '../App';
import EmailProcessing from '../components/EmailProcessing';
import NotificationsPage from '../components/NotificationsPage';
import SchedulesPage from '../components/SchedulesPage';
import SettingsPage from '../components/SettingsPage';
import UsersPage from '../components/UsersPage';
import ProjectsDashboard from '../pages/ProjectsDashboard';
import AllProjects from '../pages/projects/AllProjects';
import Financials from '../pages/projects/Financials';
import Adjustments from '../pages/projects/Adjustments';
import Collections from '../pages/projects/Collections';
import Payments from '../pages/projects/Payments';
import Procurement from '../pages/projects/Procurement';
import Retention from '../pages/projects/Retention';
import Sales from '../pages/projects/Sales';

interface ProjectsModuleProps {
  // The nav item's `page` id (see the 'projects' entry in lib/modules.ts).
  page: string;
  onNavigate: (page: string, filter?: NavFilter) => void;
  // Filter handed over by the page that navigated here (e.g. a project to preselect).
  navFilter?: NavFilter | null;
}

// Renders whichever Project Tracking page the sidebar has selected. The sidebar
// itself (and the module's route) are driven by the 'projects' entry in
// lib/modules.ts and App.tsx.
export default function ProjectsModule({ page, onNavigate, navFilter }: ProjectsModuleProps) {
  switch (page) {
    case 'project-all':
      return <AllProjects />;
    case 'project-financials':
      return <Financials onNavigate={onNavigate} />;
    case 'project-sales':
      return <Sales />;
    case 'project-adjustments':
      return <Adjustments />;
    case 'project-procurement':
      return <Procurement />;
    case 'project-collections':
      return <Collections />;
    case 'project-payments':
      return <Payments />;
    case 'project-retention':
      return <Retention />;
    // Tools shared with the other modules.
    case 'schedules':
      return <SchedulesPage />;
    case 'email':
      return <EmailProcessing onNavigate={onNavigate} />;
    case 'notifications':
      return <NotificationsPage module="projects" onNavigate={onNavigate} />;
    case 'settings':
      return <SettingsPage />;
    case 'users':
      return <UsersPage />;
    default:
      return <ProjectsDashboard onNavigate={onNavigate} initialProject={navFilter?.projectId} />;
  }
}
