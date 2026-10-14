import { CalendarClock, Car, ClipboardList, UserCheck, UserX } from 'lucide-react';
import type { NavFilter } from '../../App';
import ResponsiblePerson, { looksLikeEmail } from '../ResponsiblePerson';
import ModuleOverview from './ModuleOverview';
import {
  DashboardBanner,
  EmptyState,
  ErrorState,
  LoadingState,
  Panel,
  StatTiles,
  TableHead,
  daysUntil,
  formatDMY,
  titleCase,
  useJson,
} from './parts';

interface Vehicle {
  id: number | string;
  vehicle_name: string;
  vehicle_type?: string | null;
  incharge?: string | null;
  incharge_name?: string | null;
  incharge_contact?: string | null;
}

interface VehicleTask {
  id: number | string;
  vehicle_name?: string | null;
  task_name?: string | null;
  expiry_date?: string | null;
  status?: string | null;
}

function expiryClass(dateStr?: string | null): string {
  const days = daysUntil(dateStr);
  if (days === null) return 'text-slate-400';
  if (days < 7) return 'text-red-600 font-medium';
  if (days < 30) return 'text-orange-600 font-medium';
  return 'text-emerald-600 font-medium';
}

interface Props {
  onNavigate: (page: string, filter?: NavFilter) => void;
}

export default function VehiclesDashboard({ onNavigate }: Props) {
  const vehicles = useJson<Vehicle[]>('/api/vehicles');
  const tasks = useJson<VehicleTask[]>('/api/vehicles/tasks/upcoming?days=30');

  const list = vehicles.data ?? [];
  const withInCharge = list.filter((vehicle) => (vehicle.incharge || '').trim() !== '');
  const withoutInCharge = list.length - withInCharge.length;

  // The original tiles already cover totals and due dates; these two are the
  // in-charge split that the lists below are built on.
  const tiles = [
    { key: 'with', label: 'With In-Charge', value: vehicles.data ? withInCharge.length : null, icon: UserCheck, tone: 'text-emerald-600 bg-emerald-100', onClick: () => onNavigate('technicians') },
    { key: 'without', label: 'Without In-Charge', value: vehicles.data ? withoutInCharge : null, icon: UserX, tone: 'text-slate-600 bg-slate-200', onClick: () => onNavigate('equipment', { tab: 'vehicles' }) },
  ];

  const upcoming = (tasks.data ?? []).slice(0, 8);

  return (
    <div className="space-y-6">
      <DashboardBanner moduleLabel="Vehicles" gradient="from-orange-400 to-amber-600" />

      {/* Original donut chart and stat tiles */}
      <ModuleOverview module="vehicles" onNavigate={onNavigate} />

      <StatTiles tiles={tiles} loading={vehicles.loading} />

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <Panel
          title="Vehicles With an In-Charge"
          icon={Car}
          action={{ label: 'View all vehicles', onClick: () => onNavigate('equipment', { tab: 'vehicles' }) }}
        >
          {vehicles.loading ? (
            <LoadingState />
          ) : vehicles.error ? (
            <ErrorState message={vehicles.error} />
          ) : withInCharge.length === 0 ? (
            <EmptyState icon={Car} message="No vehicles assigned" hint="Vehicles with an in-charge person will be listed here." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <TableHead columns={['Vehicle', 'In-Charge', 'Contact']} />
                <tbody className="divide-y divide-slate-100">
                  {withInCharge.slice(0, 8).map((vehicle) => {
                    const contact = vehicle.incharge_contact || (looksLikeEmail(vehicle.incharge) ? vehicle.incharge : null);
                    return (
                      <tr key={vehicle.id} className="hover:bg-slate-50">
                        <td className="px-5 py-3">
                          <p className="font-medium text-slate-800">{vehicle.vehicle_name}</p>
                          {vehicle.vehicle_type && <p className="text-xs text-slate-400">{vehicle.vehicle_type}</p>}
                        </td>
                        <td className="px-5 py-3 text-slate-600">
                          <ResponsiblePerson value={vehicle.incharge} resolvedName={vehicle.incharge_name} />
                        </td>
                        <td className="px-5 py-3 text-slate-600">
                          {contact ? (
                            looksLikeEmail(contact) ? (
                              <a href={`mailto:${contact}`} className="text-blue-600 hover:underline">{contact}</a>
                            ) : (
                              <a href={`tel:${contact}`} className="text-blue-600 hover:underline">{contact}</a>
                            )
                          ) : (
                            '-'
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        <Panel
          title="Upcoming Vehicle Tasks (next 30 days)"
          icon={ClipboardList}
          action={{ label: 'View all tasks', onClick: () => onNavigate('tasks', { tab: 'vehicles' }) }}
        >
          {tasks.loading ? (
            <LoadingState />
          ) : tasks.error ? (
            <ErrorState message={tasks.error} />
          ) : upcoming.length === 0 ? (
            <EmptyState icon={CalendarClock} message="No upcoming tasks" hint="Vehicle renewals and expiring documents will show here." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <TableHead columns={['Vehicle', 'Task', 'Due / Expiry', 'Status']} />
                <tbody className="divide-y divide-slate-100">
                  {upcoming.map((task) => (
                    <tr key={task.id} className="hover:bg-slate-50">
                      <td className="px-5 py-3 font-medium text-slate-800">{task.vehicle_name || '-'}</td>
                      <td className="px-5 py-3 text-slate-600">{task.task_name || '-'}</td>
                      <td className={`px-5 py-3 whitespace-nowrap ${expiryClass(task.expiry_date)}`}>{formatDMY(task.expiry_date)}</td>
                      <td className="px-5 py-3 text-slate-600">{task.status ? titleCase(task.status) : '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}
