import { useEffect, useState } from 'react';
import {
  Settings as SettingsIcon,
  Bell,
  Clock,
  Sparkles,
  Info,
  Save,
  Loader2,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react';

interface SettingsData {
  maintenance_manager_email: string;
  senior_manager_email: string;
  daily_check_time: string;
  working_hours_start: string;
  working_hours_end: string;
  timezone: string;
  notify_email_enabled: boolean;
  notify_teams_enabled: boolean;
  notify_calendar_enabled: boolean;
  notify_reminders_enabled: boolean;
  reminder_first_days: number;
  reminder_second_days: number;
  reminder_final_days: number;
  escalation_days_after_due: number;
  ai_model: string;
  ai_api_key_set: boolean;
  about: {
    version: string;
    last_daily_check_run: string | null;
    total_emails_processed: number;
    total_tasks_created: number;
  };
}

const DEFAULT_SETTINGS: SettingsData = {
  maintenance_manager_email: '',
  senior_manager_email: '',
  daily_check_time: '6',
  working_hours_start: '07:30',
  working_hours_end: '16:30',
  timezone: 'Asia/Bahrain',
  notify_email_enabled: true,
  notify_teams_enabled: true,
  notify_calendar_enabled: true,
  notify_reminders_enabled: true,
  reminder_first_days: 7,
  reminder_second_days: 3,
  reminder_final_days: 1,
  escalation_days_after_due: 0,
  ai_model: 'llama-3.1-8b-instant',
  ai_api_key_set: false,
  about: {
    version: '1.0.0',
    last_daily_check_run: null,
    total_emails_processed: 0,
    total_tasks_created: 0,
  },
};

const AI_MODEL_OPTIONS = [
  'llama-3.1-8b-instant',
  'llama-3.3-70b-versatile',
  'llama3-70b-8192',
  'llama3-8b-8192',
  'gemma2-9b-it',
];

const HOUR_OPTIONS = Array.from({ length: 24 }, (_, hour) => {
  const label = hour === 0 ? '12am' : hour < 12 ? `${hour}am` : hour === 12 ? '12pm' : `${hour - 12}pm`;
  return { value: String(hour), label };
});

function ToggleSwitch({ checked, onChange }: { checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className="relative inline-flex items-center cursor-pointer">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="sr-only peer"
      />
      <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-cyan-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-cyan-500"></div>
    </label>
  );
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<SettingsData>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('system');
  const [aiApiKeyInput, setAiApiKeyInput] = useState('');

  const [savingSection, setSavingSection] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<{ section: string; error: boolean; text: string } | null>(null);

  useEffect(() => {
    fetchSettings();
  }, []);

  async function fetchSettings() {
    try {
      const response = await fetch('/api/settings', { credentials: 'include' });
      if (!response.ok) {
        const txt = await response.text().catch(() => response.statusText);
        throw new Error(`Failed to load settings: ${response.status} ${response.statusText} - ${txt}`);
      }
      const contentType = response.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        const txt = await response.text().catch(() => '');
        throw new Error(`Expected JSON but received ${contentType}: ${txt.slice(0,200)}`);
      }
      const json: SettingsData = await response.json();
      setSettings(json);
    } catch (fetchError) {
      const message = fetchError instanceof Error ? fetchError.message : 'Unknown error';
      console.error('Error fetching settings:', fetchError);
      setLoadError(message);
    } finally {
      setLoading(false);
    }
  }

  async function saveSection(section: string, payload: Record<string, unknown>) {
    setSavingSection(section);
    setSaveMessage(null);
    try {
      const response = await fetch('/api/settings', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const txt = await response.text().catch(() => response.statusText);
        throw new Error(`Failed to save settings: ${response.status} ${response.statusText} - ${txt}`);
      }

      const contentType = response.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        const txt = await response.text().catch(() => '');
        throw new Error(`Expected JSON but received ${contentType}: ${txt.slice(0,200)}`);
      }

      const json: SettingsData = await response.json();
      setSettings(json);
      if (payload.ai_api_key) {
        setAiApiKeyInput('');
      }
      setSaveMessage({ section, error: false, text: 'Saved successfully' });
    } catch (saveError) {
      const message = saveError instanceof Error ? saveError.message : 'Unknown error';
      setSaveMessage({ section, error: true, text: message });
    } finally {
      setSavingSection(null);
    }
  }

  function updateField<K extends keyof SettingsData>(key: K, value: SettingsData[K]) {
    setSettings((prev) => ({ ...prev, [key]: value }));
  }

  const tabs = [
    { id: 'system', label: 'System Settings', icon: SettingsIcon },
    { id: 'notifications', label: 'Notification Settings', icon: Bell },
    { id: 'reminders', label: 'Reminder Settings', icon: Clock },
    { id: 'ai', label: 'AI Settings', icon: Sparkles },
    { id: 'about', label: 'About', icon: Info },
  ];

  const SaveFeedback = ({ section }: { section: string }) => {
    if (!saveMessage || saveMessage.section !== section) return null;
    return (
      <p className={`flex items-center gap-2 text-sm px-3 py-2 rounded-lg ${
        saveMessage.error ? 'text-red-600 bg-red-50 border border-red-200' : 'text-emerald-600 bg-emerald-50 border border-emerald-200'
      }`}>
        {saveMessage.error ? <AlertCircle size={16} /> : <CheckCircle2 size={16} />}
        {saveMessage.text}
      </p>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-red-600 bg-red-50 border border-red-200 rounded-xl p-6">
          <p className="font-semibold">Failed to load settings</p>
          <p className="text-sm mt-2">{loadError}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Settings</h1>
        <p className="text-slate-500 mt-1">Manage your application preferences</p>
      </div>

      <div className="flex flex-col lg:flex-row gap-6">
        {/* Sidebar */}
        <div className="lg:w-64 flex-shrink-0">
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <nav className="p-2">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`
                      w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium
                      transition-colors
                      ${activeTab === tab.id
                        ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-white'
                        : 'text-slate-600 hover:bg-slate-100'
                      }
                    `}
                  >
                    <Icon size={18} />
                    {tab.label}
                  </button>
                );
              })}
            </nav>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1">
          {activeTab === 'system' && (
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
              <h2 className="text-lg font-semibold text-slate-800 mb-6">System Settings</h2>
              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Maintenance Manager Email</label>
                  <input
                    type="email"
                    value={settings.maintenance_manager_email}
                    onChange={(e) => updateField('maintenance_manager_email', e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Senior Manager Email</label>
                  <input
                    type="email"
                    value={settings.senior_manager_email}
                    onChange={(e) => updateField('senior_manager_email', e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Daily Check Time</label>
                  <select
                    value={settings.daily_check_time}
                    onChange={(e) => updateField('daily_check_time', e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                  >
                    {HOUR_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Working Hours Start</label>
                    <input
                      type="time"
                      value={settings.working_hours_start}
                      onChange={(e) => updateField('working_hours_start', e.target.value)}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Working Hours End</label>
                    <input
                      type="time"
                      value={settings.working_hours_end}
                      onChange={(e) => updateField('working_hours_end', e.target.value)}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Timezone</label>
                  <input
                    type="text"
                    value={settings.timezone}
                    onChange={(e) => updateField('timezone', e.target.value)}
                    placeholder="e.g., Asia/Bahrain"
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                  />
                </div>
              </div>
              <div className="mt-6 flex items-center gap-3">
                <button
                  onClick={() => saveSection('system', {
                    maintenance_manager_email: settings.maintenance_manager_email,
                    senior_manager_email: settings.senior_manager_email,
                    daily_check_time: settings.daily_check_time,
                    working_hours_start: settings.working_hours_start,
                    working_hours_end: settings.working_hours_end,
                    timezone: settings.timezone,
                  })}
                  disabled={savingSection === 'system'}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-lg font-medium text-sm bg-gradient-to-r from-cyan-500 to-blue-600 text-white hover:shadow-lg transition-shadow disabled:opacity-50"
                >
                  {savingSection === 'system' ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
                  {savingSection === 'system' ? 'Saving...' : 'Save System Settings'}
                </button>
                <SaveFeedback section="system" />
              </div>
            </div>
          )}

          {activeTab === 'notifications' && (
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
              <h2 className="text-lg font-semibold text-slate-800 mb-6">Notification Settings</h2>
              <div className="space-y-4">
                {[
                  { key: 'notify_email_enabled' as const, label: 'Enable Email Notifications', desc: 'Send maintenance notifications by email' },
                  { key: 'notify_teams_enabled' as const, label: 'Enable Teams Channel Alerts', desc: 'Post updates to the Teams channel' },
                  { key: 'notify_calendar_enabled' as const, label: 'Enable Calendar Booking', desc: 'Create calendar events for scheduled work' },
                  { key: 'notify_reminders_enabled' as const, label: 'Enable Reminder Emails', desc: 'Send reminder emails before tasks are due' },
                ].map((item) => (
                  <div key={item.key} className="flex items-center justify-between p-4 rounded-lg bg-slate-50">
                    <div>
                      <p className="font-medium text-slate-800">{item.label}</p>
                      <p className="text-sm text-slate-500">{item.desc}</p>
                    </div>
                    <ToggleSwitch
                      checked={settings[item.key]}
                      onChange={(checked) => updateField(item.key, checked)}
                    />
                  </div>
                ))}
              </div>
              <div className="mt-6 flex items-center gap-3">
                <button
                  onClick={() => saveSection('notifications', {
                    notify_email_enabled: settings.notify_email_enabled,
                    notify_teams_enabled: settings.notify_teams_enabled,
                    notify_calendar_enabled: settings.notify_calendar_enabled,
                    notify_reminders_enabled: settings.notify_reminders_enabled,
                  })}
                  disabled={savingSection === 'notifications'}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-lg font-medium text-sm bg-gradient-to-r from-cyan-500 to-blue-600 text-white hover:shadow-lg transition-shadow disabled:opacity-50"
                >
                  {savingSection === 'notifications' ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
                  {savingSection === 'notifications' ? 'Saving...' : 'Save Notification Settings'}
                </button>
                <SaveFeedback section="notifications" />
              </div>
            </div>
          )}

          {activeTab === 'reminders' && (
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
              <h2 className="text-lg font-semibold text-slate-800 mb-6">Reminder Settings</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">First Reminder (days before)</label>
                  <input
                    type="number"
                    min={0}
                    value={settings.reminder_first_days}
                    onChange={(e) => updateField('reminder_first_days', Number(e.target.value))}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Second Reminder (days before)</label>
                  <input
                    type="number"
                    min={0}
                    value={settings.reminder_second_days}
                    onChange={(e) => updateField('reminder_second_days', Number(e.target.value))}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Final Reminder (days before)</label>
                  <input
                    type="number"
                    min={0}
                    value={settings.reminder_final_days}
                    onChange={(e) => updateField('reminder_final_days', Number(e.target.value))}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Escalation (days after due)</label>
                  <input
                    type="number"
                    min={0}
                    value={settings.escalation_days_after_due}
                    onChange={(e) => updateField('escalation_days_after_due', Number(e.target.value))}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                  />
                </div>
              </div>
              <div className="mt-6 flex items-center gap-3">
                <button
                  onClick={() => saveSection('reminders', {
                    reminder_first_days: settings.reminder_first_days,
                    reminder_second_days: settings.reminder_second_days,
                    reminder_final_days: settings.reminder_final_days,
                    escalation_days_after_due: settings.escalation_days_after_due,
                  })}
                  disabled={savingSection === 'reminders'}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-lg font-medium text-sm bg-gradient-to-r from-cyan-500 to-blue-600 text-white hover:shadow-lg transition-shadow disabled:opacity-50"
                >
                  {savingSection === 'reminders' ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
                  {savingSection === 'reminders' ? 'Saving...' : 'Save Reminder Settings'}
                </button>
                <SaveFeedback section="reminders" />
              </div>
            </div>
          )}

          {activeTab === 'ai' && (
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
              <h2 className="text-lg font-semibold text-slate-800 mb-6">AI Settings</h2>
              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Current AI Model</label>
                  <p className="text-sm text-slate-500 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">{settings.ai_model}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Select AI Model</label>
                  <select
                    value={settings.ai_model}
                    onChange={(e) => updateField('ai_model', e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                  >
                    {AI_MODEL_OPTIONS.map((model) => (
                      <option key={model} value={model}>{model}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    API Key {settings.ai_api_key_set ? <span className="text-emerald-600 font-normal">(currently set)</span> : <span className="text-amber-600 font-normal">(not set)</span>}
                  </label>
                  <input
                    type="password"
                    value={aiApiKeyInput}
                    onChange={(e) => setAiApiKeyInput(e.target.value)}
                    placeholder={settings.ai_api_key_set ? '••••••••••••••••' : 'Enter API key'}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                  />
                  <p className="text-xs text-slate-400 mt-1">Leave blank to keep the current key. The stored key is never displayed once saved.</p>
                </div>
              </div>
              <div className="mt-6 flex items-center gap-3">
                <button
                  onClick={() => {
                    const payload: Record<string, unknown> = { ai_model: settings.ai_model };
                    if (aiApiKeyInput.trim()) {
                      payload.ai_api_key = aiApiKeyInput.trim();
                    }
                    saveSection('ai', payload);
                  }}
                  disabled={savingSection === 'ai'}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-lg font-medium text-sm bg-gradient-to-r from-cyan-500 to-blue-600 text-white hover:shadow-lg transition-shadow disabled:opacity-50"
                >
                  {savingSection === 'ai' ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
                  {savingSection === 'ai' ? 'Saving...' : 'Save AI Settings'}
                </button>
                <SaveFeedback section="ai" />
              </div>
            </div>
          )}

          {activeTab === 'about' && (
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
              <h2 className="text-lg font-semibold text-slate-800 mb-6">About</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-4 rounded-lg bg-slate-50 border border-slate-200">
                  <p className="text-sm text-slate-500">System Version</p>
                  <p className="text-xl font-bold text-slate-800 mt-1">{settings.about.version}</p>
                </div>
                <div className="p-4 rounded-lg bg-slate-50 border border-slate-200">
                  <p className="text-sm text-slate-500">Last Daily Check Run</p>
                  <p className="text-xl font-bold text-slate-800 mt-1">
                    {settings.about.last_daily_check_run
                      ? new Date(settings.about.last_daily_check_run).toLocaleString()
                      : 'Never run yet'}
                  </p>
                </div>
                <div className="p-4 rounded-lg bg-slate-50 border border-slate-200">
                  <p className="text-sm text-slate-500">Total Emails Processed</p>
                  <p className="text-xl font-bold text-slate-800 mt-1">{settings.about.total_emails_processed}</p>
                </div>
                <div className="p-4 rounded-lg bg-slate-50 border border-slate-200">
                  <p className="text-sm text-slate-500">Total Tasks Created</p>
                  <p className="text-xl font-bold text-slate-800 mt-1">{settings.about.total_tasks_created}</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
