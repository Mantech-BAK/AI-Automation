import { useEffect, useState } from 'react';
import { Building2, Info, Loader2, Mail, Plus, Trash2 } from 'lucide-react';

interface DepartmentEmailConfig {
  id: string;
  email: string;
  label: string | null;
}

interface DepartmentConfigGroup {
  department_name: string;
  emails: DepartmentEmailConfig[];
}

export default function NotificationsConfigPage() {
  const [departments, setDepartments] = useState<string[]>([]);
  const [configs, setConfigs] = useState<DepartmentConfigGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedDepartment, setSelectedDepartment] = useState<string | null>(null);

  const [newEmail, setNewEmail] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchAll();
  }, []);

  async function fetchAll() {
    setLoading(true);
    try {
      const [departmentsRes, configsRes] = await Promise.all([
        fetch('/api/notifications-config/departments'),
        fetch('/api/notifications-config'),
      ]);
      if (!departmentsRes.ok || !configsRes.ok) {
        throw new Error('Failed to load notification configuration');
      }
      const departmentsJson: string[] = await departmentsRes.json();
      const configsJson: DepartmentConfigGroup[] = await configsRes.json();

      setDepartments(departmentsJson);
      setConfigs(configsJson);
      setSelectedDepartment((prev) => prev || departmentsJson[0] || null);
    } catch (fetchError) {
      const message = fetchError instanceof Error ? fetchError.message : 'Unknown error';
      console.error('Error fetching notification config:', fetchError);
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  async function handleAddEmail() {
    if (!selectedDepartment || !newEmail.trim()) return;

    setSaving(true);
    try {
      const response = await fetch('/api/notifications-config/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          department_name: selectedDepartment,
          email: newEmail.trim(),
          label: newLabel.trim() || null,
        }),
      });
      if (!response.ok) {
        throw new Error(`Failed to add email: ${response.statusText}`);
      }
      setNewEmail('');
      setNewLabel('');
      await fetchAll();
    } catch (fetchError) {
      console.error('Error adding notification email:', fetchError);
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteEmail(id: string) {
    try {
      const response = await fetch(`/api/notifications-config/${id}`, { method: 'DELETE' });
      if (!response.ok) {
        throw new Error(`Failed to delete email: ${response.statusText}`);
      }
      await fetchAll();
    } catch (fetchError) {
      console.error('Error deleting notification email:', fetchError);
    }
  }

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
          <p className="font-semibold">Failed to load notification configuration</p>
          <p className="text-sm mt-2">{error}</p>
        </div>
      </div>
    );
  }

  const emailsForSelected = configs.find((c) => c.department_name === selectedDepartment)?.emails || [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Notification Config</h1>
        <p className="text-slate-500 mt-1">Configure which email addresses receive notifications for each department</p>
      </div>

      {/* Info note */}
      <div className="flex items-start gap-3 bg-cyan-50 border border-cyan-200 rounded-xl p-4">
        <Info size={18} className="text-cyan-600 flex-shrink-0 mt-0.5" />
        <p className="text-sm text-cyan-800">
          Notification emails are sent to these addresses when documents expire or equipment maintenance is due for each department.
          Planner tasks are still assigned only to the responsible person.
        </p>
      </div>

      <div className="flex flex-col lg:flex-row gap-6">
        {/* Department list */}
        <div className="lg:w-64 flex-shrink-0">
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <nav className="p-2">
              {departments.length === 0 ? (
                <p className="px-3 py-2.5 text-sm text-slate-400">No departments found.</p>
              ) : (
                departments.map((dept) => {
                  const count = configs.find((c) => c.department_name === dept)?.emails.length || 0;
                  const isActive = selectedDepartment === dept;
                  return (
                    <button
                      key={dept}
                      onClick={() => setSelectedDepartment(dept)}
                      className={`w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                        isActive
                          ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-white'
                          : 'text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      <span className="flex items-center gap-2">
                        <Building2 size={16} className={isActive ? 'text-white' : 'text-slate-400'} />
                        {dept}
                      </span>
                      <span
                        className={`text-xs px-1.5 py-0.5 rounded-full ${
                          isActive ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500'
                        }`}
                      >
                        {count}
                      </span>
                    </button>
                  );
                })
              )}
            </nav>
          </div>
        </div>

        {/* Selected department panel */}
        <div className="flex-1">
          {!selectedDepartment ? (
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 text-slate-500 text-sm">
              Select a department to configure its notification emails.
            </div>
          ) : (
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 space-y-6">
              <h2 className="text-lg font-semibold text-slate-800">{selectedDepartment}</h2>

              <div className="space-y-2">
                {emailsForSelected.length === 0 ? (
                  <div className="text-center py-8 text-slate-400">
                    <Mail size={32} className="mx-auto mb-2 text-slate-300" />
                    <p className="text-sm">No notification emails configured for this department yet.</p>
                  </div>
                ) : (
                  emailsForSelected.map((cfg) => (
                    <div
                      key={cfg.id}
                      className="flex items-center justify-between gap-3 px-4 py-3 rounded-lg border border-slate-200"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-8 h-8 rounded-lg bg-cyan-500/10 flex items-center justify-center flex-shrink-0">
                          <Mail size={16} className="text-cyan-600" />
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium text-slate-800 truncate">{cfg.email}</p>
                          {cfg.label && <p className="text-xs text-slate-500 truncate">{cfg.label}</p>}
                        </div>
                      </div>
                      <button
                        onClick={() => handleDeleteEmail(cfg.id)}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-red-50 text-red-700 rounded-lg hover:bg-red-100 transition-colors flex-shrink-0"
                      >
                        <Trash2 size={14} />
                        Remove
                      </button>
                    </div>
                  ))
                )}
              </div>

              {/* Add email section */}
              <div className="pt-4 border-t border-slate-200">
                <p className="text-sm font-medium text-slate-700 mb-3">Add Email</p>
                <div className="flex flex-col sm:flex-row gap-3">
                  <input
                    type="email"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    placeholder="email@example.com"
                    className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                  />
                  <input
                    type="text"
                    value={newLabel}
                    onChange={(e) => setNewLabel(e.target.value)}
                    placeholder="Label (optional)"
                    className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                  />
                  <button
                    onClick={handleAddEmail}
                    disabled={!newEmail.trim() || saving}
                    className="flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium bg-gradient-to-r from-cyan-500 to-blue-600 text-white rounded-lg hover:shadow-lg transition-shadow disabled:opacity-50 whitespace-nowrap"
                  >
                    {saving ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                    Add
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
