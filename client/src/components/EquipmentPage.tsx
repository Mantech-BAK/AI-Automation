import { useEffect, useState } from 'react';
import {
  Cog,
  Loader2,
  Plus,
  Save,
} from 'lucide-react';
import Modal from './Modal';

interface Equipment {
  id: string;
  equipment_name: string;
  site_location: string;
  maintenance_interval_days?: number | null;
  estimated_duration_hours?: number | null;
  last_completed_date?: string | null;
  next_due_date?: string | null;
  type_of_service?: string | null;
}

interface SiteOption {
  id: string;
  site_name: string;
}

export default function EquipmentPage() {
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [siteOptions, setSiteOptions] = useState<SiteOption[]>([]);
  const [siteOptionsLoading, setSiteOptionsLoading] = useState(false);

  const [formData, setFormData] = useState({
    equipment_name: '',
    site_location: '',
    maintenance_interval_days: '',
    estimated_duration_hours: '',
    last_completed_date: '',
    type_of_service: 'general',
  });

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    try {
      const response = await fetch('/api/dashboard/assets');
      if (!response.ok) {
        throw new Error(`Failed to load equipment: ${response.statusText}`);
      }
      const json: Equipment[] = await response.json();
      setEquipment(json);
    } catch (fetchError) {
      const message = fetchError instanceof Error ? fetchError.message : 'Unknown error';
      console.error('Error fetching data:', fetchError);
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    if (!formData.equipment_name.trim() || !formData.site_location.trim()) return;

    setSaving(true);
    try {
      const data = {
        equipment_name: formData.equipment_name,
        site_location: formData.site_location,
        maintenance_interval_days: formData.maintenance_interval_days ? Number(formData.maintenance_interval_days) : null,
        estimated_duration_hours: formData.estimated_duration_hours ? Number(formData.estimated_duration_hours) : null,
        last_completed_date: formData.last_completed_date || null,
        type_of_service: formData.type_of_service || 'general',
      };

      const response = await fetch('/api/dashboard/assets/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!response.ok) {
        throw new Error(`Failed to save equipment: ${response.statusText}`);
      }

      setAddModalOpen(false);
      resetForm();
      fetchData();
    } catch (fetchError) {
      console.error('Error saving equipment:', fetchError);
    } finally {
      setSaving(false);
    }
  }

  function resetForm() {
    setFormData({
      equipment_name: '',
      site_location: '',
      maintenance_interval_days: '',
      estimated_duration_hours: '',
      last_completed_date: '',
      type_of_service: 'general',
    });
  }

  async function fetchSiteOptions() {
    setSiteOptionsLoading(true);
    try {
      const response = await fetch('/api/dashboard/sites/list');
      if (!response.ok) {
        throw new Error(`Failed to load sites: ${response.statusText}`);
      }
      const json: SiteOption[] = await response.json();
      setSiteOptions(json);
    } catch (fetchError) {
      console.error('Error fetching site options:', fetchError);
    } finally {
      setSiteOptionsLoading(false);
    }
  }

  const getDueDateStatus = (nextDueDate?: string | null): 'overdue' | 'soon' | 'ok' | 'none' => {
    if (!nextDueDate) return 'none';
    const due = new Date(nextDueDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const sevenDaysFromNow = new Date(today);
    sevenDaysFromNow.setDate(today.getDate() + 7);

    if (due < today) return 'overdue';
    if (due <= sevenDaysFromNow) return 'soon';
    return 'ok';
  };

  const getDueDateColor = (nextDueDate?: string | null) => {
    switch (getDueDateStatus(nextDueDate)) {
      case 'overdue': return 'text-red-600 font-medium';
      case 'soon': return 'text-amber-600 font-medium';
      case 'ok': return 'text-emerald-600';
      default: return 'text-slate-400';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-red-600 bg-red-50 border border-red-200 rounded-xl p-6">
          <p className="font-semibold">Failed to load equipment</p>
          <p className="text-sm mt-2">{error}</p>
        </div>
      </div>
    );
  }

  const overdueCount = equipment.filter(e => getDueDateStatus(e.next_due_date) === 'overdue').length;
  const soonCount = equipment.filter(e => getDueDateStatus(e.next_due_date) === 'soon').length;
  const okCount = equipment.filter(e => getDueDateStatus(e.next_due_date) === 'ok').length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Equipment</h1>
          <p className="text-slate-500 mt-1">Manage your equipment and assets</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => {
              resetForm();
              setAddModalOpen(true);
              fetchSiteOptions();
            }}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg font-medium text-sm bg-gradient-to-r from-cyan-500 to-blue-600 text-white hover:shadow-lg transition-shadow"
          >
            <Plus size={18} />
            Add Equipment
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl p-4 border border-slate-200">
          <p className="text-sm text-slate-500">Total</p>
          <p className="text-2xl font-bold text-slate-800">{equipment.length}</p>
        </div>
        <div className="bg-white rounded-xl p-4 border border-slate-200">
          <p className="text-sm text-slate-500">Overdue</p>
          <p className="text-2xl font-bold text-red-600">{overdueCount}</p>
        </div>
        <div className="bg-white rounded-xl p-4 border border-slate-200">
          <p className="text-sm text-slate-500">Due Within 7 Days</p>
          <p className="text-2xl font-bold text-amber-600">{soonCount}</p>
        </div>
        <div className="bg-white rounded-xl p-4 border border-slate-200">
          <p className="text-sm text-slate-500">On Track</p>
          <p className="text-2xl font-bold text-emerald-600">{okCount}</p>
        </div>
      </div>

      {/* Equipment Table */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Equipment</th>
                <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Site</th>
                <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Type of Service</th>
                <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Interval (days)</th>
                <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Last Completed</th>
                <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Next Due</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {equipment.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-slate-500">
                    <Cog size={40} className="mx-auto text-slate-300 mb-2" />
                    <p>No equipment found. Add your first equipment to get started.</p>
                  </td>
                </tr>
              ) : (
                equipment.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-indigo-500/10 flex items-center justify-center">
                          <Cog size={16} className="text-indigo-600" />
                        </div>
                        <p className="font-medium text-slate-800">{item.equipment_name}</p>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-600">{item.site_location}</td>
                    <td className="px-6 py-4 text-sm text-slate-600 capitalize">{item.type_of_service || '-'}</td>
                    <td className="px-6 py-4 text-sm text-slate-600">{item.maintenance_interval_days ?? '-'}</td>
                    <td className="px-6 py-4 text-sm text-slate-600">
                      {item.last_completed_date ? new Date(item.last_completed_date).toLocaleDateString() : '-'}
                    </td>
                    <td className={`px-6 py-4 text-sm ${getDueDateColor(item.next_due_date)}`}>
                      {item.next_due_date ? new Date(item.next_due_date).toLocaleDateString() : '-'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Modal */}
      <Modal
        isOpen={addModalOpen}
        onClose={() => setAddModalOpen(false)}
        title="Add New Equipment"
        size="lg"
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-1">Equipment Name *</label>
              <input
                type="text"
                value={formData.equipment_name}
                onChange={(e) => setFormData({ ...formData, equipment_name: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                placeholder="Enter equipment name"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-1">Site Location *</label>
              <select
                value={formData.site_location}
                onChange={(e) => setFormData({ ...formData, site_location: e.target.value })}
                disabled={siteOptionsLoading}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent disabled:opacity-50"
              >
                <option value="">{siteOptionsLoading ? 'Loading sites...' : 'Select a site'}</option>
                {siteOptions.map((site) => (
                  <option key={site.id} value={site.site_name}>
                    {site.site_name}
                  </option>
                ))}
              </select>
              {!siteOptionsLoading && siteOptions.length === 0 && (
                <p className="text-xs text-slate-400 mt-1">No sites found. Add one on the Sites page first.</p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Maintenance Interval (days)</label>
              <input
                type="number"
                value={formData.maintenance_interval_days}
                onChange={(e) => setFormData({ ...formData, maintenance_interval_days: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                placeholder="e.g., 30"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Estimated Duration (hours)</label>
              <input
                type="number"
                value={formData.estimated_duration_hours}
                onChange={(e) => setFormData({ ...formData, estimated_duration_hours: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                placeholder="e.g., 2"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Last Completed</label>
              <input
                type="date"
                value={formData.last_completed_date}
                onChange={(e) => setFormData({ ...formData, last_completed_date: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Type of Service</label>
              <input
                type="text"
                value={formData.type_of_service}
                onChange={(e) => setFormData({ ...formData, type_of_service: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                placeholder="e.g., electrical, mechanical, general"
              />
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-4">
            <button
              onClick={() => setAddModalOpen(false)}
              className="px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={!formData.equipment_name.trim() || !formData.site_location.trim() || saving}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-gradient-to-r from-cyan-500 to-blue-600 text-white rounded-lg hover:shadow-lg transition-shadow disabled:opacity-50"
            >
              {saving ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save size={16} />
                  Save
                </>
              )}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
