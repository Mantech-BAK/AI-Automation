import { useEffect, useState } from 'react';
import { Loader2, Save } from 'lucide-react';
import Modal from './Modal';

export interface EditableAsset {
  id: string;
  equipment_name?: string | null;
  site_location?: string | null;
  maintenance_interval_days?: number | null;
  estimated_duration_hours?: number | null;
  next_due_date?: string | null;
  type_of_service?: string | null;
  category_id?: number | string | null;
  type_id?: number | string | null;
  department_id?: number | string | null;
  registration_date?: string | null;
  expiry_date?: string | null;
  reminder_days?: number | null;
  frequency_days?: number | null;
  responsible_person?: string | null;
  remarks?: string | null;
}

interface CategoryOption {
  id: string;
  name: string;
}

interface AssetEditModalProps {
  asset: EditableAsset | null;
  onClose: () => void;
  onSaved: () => void;
}

export default function AssetEditModal({ asset, onClose, onSaved }: AssetEditModalProps) {
  const [saving, setSaving] = useState(false);
  const [categoryOptions, setCategoryOptions] = useState<CategoryOption[]>([]);
  const [formData, setFormData] = useState({
    equipment_name: '',
    site_location: '',
    category_id: '',
    type_of_service: '',
    maintenance_interval_days: '',
    estimated_duration_hours: '',
    next_due_date: '',
    registration_date: '',
    expiry_date: '',
    reminder_days: '',
    frequency_days: '',
    responsible_person: '',
    remarks: '',
  });

  useEffect(() => {
    if (!asset) return;

    setFormData({
      equipment_name: asset.equipment_name || '',
      site_location: asset.site_location || '',
      category_id: asset.category_id != null ? String(asset.category_id) : '',
      type_of_service: asset.type_of_service || '',
      maintenance_interval_days: asset.maintenance_interval_days != null ? String(asset.maintenance_interval_days) : '',
      estimated_duration_hours: asset.estimated_duration_hours != null ? String(asset.estimated_duration_hours) : '',
      next_due_date: asset.next_due_date ? asset.next_due_date.slice(0, 10) : '',
      registration_date: asset.registration_date ? asset.registration_date.slice(0, 10) : '',
      expiry_date: asset.expiry_date ? asset.expiry_date.slice(0, 10) : '',
      reminder_days: asset.reminder_days != null ? String(asset.reminder_days) : '',
      frequency_days: asset.frequency_days != null ? String(asset.frequency_days) : '',
      responsible_person: asset.responsible_person || '',
      remarks: asset.remarks || '',
    });

    fetch('/api/dashboard/categories')
      .then((res) => res.json())
      .then(setCategoryOptions)
      .catch((err) => console.error('Error fetching categories:', err));
  }, [asset]);

  async function handleSave() {
    if (!asset) return;

    setSaving(true);
    try {
      const data = {
        equipment_name: formData.equipment_name,
        site_location: formData.site_location,
        category_id: formData.category_id ? Number(formData.category_id) : null,
        type_id: asset.type_id != null ? Number(asset.type_id) : null,
        department_id: asset.department_id != null ? Number(asset.department_id) : null,
        type_of_service: formData.type_of_service || 'general',
        maintenance_interval_days: formData.maintenance_interval_days ? Number(formData.maintenance_interval_days) : null,
        estimated_duration_hours: formData.estimated_duration_hours ? Number(formData.estimated_duration_hours) : null,
        next_due_date: formData.next_due_date || null,
        registration_date: formData.registration_date || null,
        expiry_date: formData.expiry_date || null,
        reminder_days: formData.reminder_days ? Number(formData.reminder_days) : null,
        frequency_days: formData.frequency_days ? Number(formData.frequency_days) : null,
        responsible_person: formData.responsible_person || null,
        remarks: formData.remarks || null,
      };

      const response = await fetch(`/api/dashboard/assets/${asset.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!response.ok) {
        throw new Error(`Failed to update asset: ${response.statusText}`);
      }

      onSaved();
      onClose();
    } catch (fetchError) {
      console.error('Error updating asset:', fetchError);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal isOpen={Boolean(asset)} onClose={onClose} title="Edit Asset" size="lg">
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <label className="block text-sm font-medium text-slate-700 mb-1">Item Name</label>
            <input
              type="text"
              value={formData.equipment_name}
              onChange={(e) => setFormData({ ...formData, equipment_name: e.target.value })}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Site / Department</label>
            <input
              type="text"
              value={formData.site_location}
              onChange={(e) => setFormData({ ...formData, site_location: e.target.value })}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Category</label>
            <select
              value={formData.category_id}
              onChange={(e) => setFormData({ ...formData, category_id: e.target.value })}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
            >
              <option value="">Select category</option>
              {categoryOptions.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
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
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Maintenance Interval (days)</label>
            <input
              type="number"
              value={formData.maintenance_interval_days}
              onChange={(e) => setFormData({ ...formData, maintenance_interval_days: e.target.value })}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Estimated Duration (hours)</label>
            <input
              type="number"
              value={formData.estimated_duration_hours}
              onChange={(e) => setFormData({ ...formData, estimated_duration_hours: e.target.value })}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Next Due Date</label>
            <input
              type="date"
              value={formData.next_due_date}
              onChange={(e) => setFormData({ ...formData, next_due_date: e.target.value })}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Registration Date</label>
            <input
              type="date"
              value={formData.registration_date}
              onChange={(e) => setFormData({ ...formData, registration_date: e.target.value })}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Expiry Date</label>
            <input
              type="date"
              value={formData.expiry_date}
              onChange={(e) => setFormData({ ...formData, expiry_date: e.target.value })}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Reminder Days</label>
            <input
              type="number"
              value={formData.reminder_days}
              onChange={(e) => setFormData({ ...formData, reminder_days: e.target.value })}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Frequency (days)</label>
            <input
              type="number"
              value={formData.frequency_days}
              onChange={(e) => setFormData({ ...formData, frequency_days: e.target.value })}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
              placeholder="365"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Responsible Person</label>
            <input
              type="text"
              value={formData.responsible_person}
              onChange={(e) => setFormData({ ...formData, responsible_person: e.target.value })}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-sm font-medium text-slate-700 mb-1">Remarks</label>
            <textarea
              value={formData.remarks}
              onChange={(e) => setFormData({ ...formData, remarks: e.target.value })}
              rows={3}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
            />
          </div>
        </div>
        <div className="flex justify-end gap-3 pt-4">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
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
  );
}
