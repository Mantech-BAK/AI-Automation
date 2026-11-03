import { useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, Clock, FileText, Loader2, Mail, RefreshCw } from 'lucide-react';
import { apiFetch } from '../lib/api';

interface ScheduleData {
  doc_email_interval_minutes: number;
  general_email_interval_minutes: number;
  daily_check_time: number;
  last_document_email_run: string | null;
  last_email_process_run: string | null;
  last_daily_check_run: string | null;
  doc_interval_options: number[];
  general_interval_options: number[];
}

const selectCls =
  'w-full sm:w-64 px-3 py-2 border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent';

function intervalLabel(minutes: number): string {
  if (minutes < 60) return `Every ${minutes} minute${minutes === 1 ? '' : 's'}`;
  const hours = minutes / 60;
  return `Every ${hours} hour${hours === 1 ? '' : 's'}`;
}

function hourLabel(hour: number): string {
  const suffix = hour < 12 ? 'AM' : 'PM';
  const display = hour % 12 === 0 ? 12 : hour % 12;
  return `${display}:00 ${suffix}`;
}

function formatRun(value: string | null): string {
  if (!value) return 'Not run yet';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString('en-GB', { timeZone: 'Asia/Bahrain', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// Settings -> Schedule: how often the background jobs run. Saved values take effect within a minute (no restart).
export default function SchedulePanel() {
  const [schedule, setSchedule] = useState<ScheduleData | null>(null);
  const [draft, setDraft] = useState<{ doc: number; general: number; daily: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ error: boolean; text: string } | null>(null);

  async function load() {
    try {
      const response = await apiFetch('/api/settings', { credentials: 'include' });
      if (!response.ok) throw new Error(`Failed to load schedule: ${response.statusText}`);
      const json = await response.json();
      const loaded: ScheduleData = json.schedule;
      setSchedule(loaded);
      setDraft({ doc: loaded.doc_email_interval_minutes, general: loaded.general_email_interval_minutes, daily: loaded.daily_check_time });
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load schedule');
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function save() {
    if (!draft) return;
    setSaving(true);
    setMessage(null);
    try {
      const response = await apiFetch('/api/settings', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          doc_email_interval_minutes: draft.doc,
          general_email_interval_minutes: draft.general,
          daily_check_time: draft.daily,
        }),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json.error || 'Failed to save schedule');
      setSchedule(json.schedule);
      setMessage({ error: false, text: 'Schedule saved. It applies within a minute.' });
    } catch (saveError) {
      setMessage({ error: true, text: saveError instanceof Error ? saveError.message : 'Failed to save schedule' });
    } finally {
      setSaving(false);
    }
  }

  if (error) {
    return (
      <div className="text-red-600 bg-red-50 border border-red-200 rounded-xl p-6">
        <p className="font-semibold">Failed to load the schedule</p>
        <p className="text-sm mt-2">{error}</p>
      </div>
    );
  }

  if (!schedule || !draft) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
      </div>
    );
  }

  const dirty =
    draft.doc !== schedule.doc_email_interval_minutes ||
    draft.general !== schedule.general_email_interval_minutes ||
    draft.daily !== schedule.daily_check_time;

  const jobs = [
    {
      key: 'documents',
      icon: FileText,
      title: 'Document email processor',
      text: 'Reads PDF attachments from unread emails and creates or renews documents.',
      lastRun: schedule.last_document_email_run,
      control: (
        <select value={draft.doc} onChange={(e) => setDraft({ ...draft, doc: Number(e.target.value) })} className={selectCls}>
          {schedule.doc_interval_options.map((minutes) => (
            <option key={minutes} value={minutes}>{intervalLabel(minutes)}</option>
          ))}
        </select>
      ),
    },
    {
      key: 'general',
      icon: Mail,
      title: 'General email processor',
      text: 'Summarises the other emails in the mailbox and creates action items. Runs after the document processor when both are due.',
      lastRun: schedule.last_email_process_run,
      control: (
        <select value={draft.general} onChange={(e) => setDraft({ ...draft, general: Number(e.target.value) })} className={selectCls}>
          {schedule.general_interval_options.map((minutes) => (
            <option key={minutes} value={minutes}>{intervalLabel(minutes)}</option>
          ))}
        </select>
      ),
    },
    {
      key: 'daily',
      icon: RefreshCw,
      title: 'Daily check',
      text: 'Creates maintenance tasks and document renewal tasks (Planner), and sends the reminders. Runs once a day.',
      lastRun: schedule.last_daily_check_run,
      control: (
        <select value={draft.daily} onChange={(e) => setDraft({ ...draft, daily: Number(e.target.value) })} className={selectCls}>
          {Array.from({ length: 24 }, (_, hour) => (
            <option key={hour} value={hour}>Daily at {hourLabel(hour)}</option>
          ))}
        </select>
      ),
    },
  ];

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
        <div className="flex items-center gap-2 mb-1">
          <Clock size={20} className="text-slate-500" />
          <h2 className="text-lg font-semibold text-slate-800">Schedule</h2>
        </div>
        <p className="text-sm text-slate-500 mb-6">
          How often the background jobs run. Times follow the server clock. A job that is still running when its next slot comes is skipped.
        </p>

        <div className="space-y-4">
          {jobs.map((job) => {
            const Icon = job.icon;
            return (
              <div key={job.key} className="p-4 rounded-lg bg-slate-50 border border-slate-200">
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-lg bg-cyan-500/10 flex items-center justify-center flex-shrink-0">
                    <Icon size={18} className="text-cyan-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-slate-800">{job.title}</p>
                    <p className="text-sm text-slate-500 mb-3">{job.text}</p>
                    {job.control}
                    <p className="text-xs text-slate-400 mt-2">Last run: {formatRun(job.lastRun)}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-3 mt-6">
          <button
            onClick={save}
            disabled={saving || !dirty}
            className="px-4 py-2 bg-[#0f172a] text-white text-sm font-medium rounded-lg hover:bg-slate-800 transition-colors disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save Schedule'}
          </button>
          {message && (
            <p className={`flex items-center gap-2 text-sm px-3 py-2 rounded-lg ${
              message.error ? 'text-red-600 bg-red-50 border border-red-200' : 'text-emerald-600 bg-emerald-50 border border-emerald-200'
            }`}>
              {message.error ? <AlertCircle size={16} /> : <CheckCircle2 size={16} />}
              {message.text}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
