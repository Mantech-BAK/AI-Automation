import { useEffect, useState } from 'react';
import {
  Mail,
  Loader2,
  Play,
  Tag,
  User,
  CheckCircle2,
  Clock,
  FileText,
  AlertCircle,
  MessageSquare,
} from 'lucide-react';
import Modal from './Modal';

interface ActionItem {
  id: string;
  title: string;
  assigned_to?: string | null;
  due_date?: string | null;
  estimated_hours?: number | null;
  planner_task_id?: string | null;
}

interface ProcessedEmail {
  id: string;
  sender: string;
  subject: string;
  summary_text?: string | null;
  category: string;
  date_received?: string | null;
  action_items?: ActionItem[];
}

type EmailCategory = 'all' | 'Maintenance Request' | 'Work Report' | 'Vendor' | 'Escalation' | 'Inquiry' | 'Other';

function getSenderDisplay(sender?: string | null): string {
  if (!sender) return 'Unknown sender';
  const angleBracketIndex = sender.indexOf('<');
  if (angleBracketIndex === -1) return sender;
  return sender.slice(0, angleBracketIndex).trim() || sender;
}

function formatBahrainDateTime(value?: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Bahrain',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }).formatToParts(date);

  const get = (type: string) => parts.find((part) => part.type === type)?.value || '';
  return `${get('day')} ${get('month')} ${get('year')} ${get('hour')}:${get('minute')} ${get('dayPeriod').toUpperCase()}`;
}

const categoryConfig: Record<Exclude<EmailCategory, 'all'>, { color: string }> = {
  'Maintenance Request': { color: 'bg-blue-100 text-blue-700' },
  'Work Report': { color: 'bg-emerald-100 text-emerald-700' },
  'Vendor': { color: 'bg-purple-100 text-purple-700' },
  'Escalation': { color: 'bg-red-100 text-red-700' },
  'Inquiry': { color: 'bg-amber-100 text-amber-700' },
  'Other': { color: 'bg-slate-100 text-slate-700' },
};

export default function EmailProcessing() {
  const [emails, setEmails] = useState<ProcessedEmail[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<EmailCategory>('all');
  const [processModalOpen, setProcessModalOpen] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [processError, setProcessError] = useState<string | null>(null);
  const [emailBody, setEmailBody] = useState('');
  const [emailSender, setEmailSender] = useState('');
  const [emailSubject, setEmailSubject] = useState('');
  const [creatingTaskFor, setCreatingTaskFor] = useState<string | null>(null);
  const [createdTaskIds, setCreatedTaskIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetchEmails();
  }, []);

  async function fetchEmails() {
    try {
      const response = await fetch('/api/dashboard/email-summaries');
      if (!response.ok) {
        throw new Error(`Failed to load emails: ${response.statusText}`);
      }
      const json: ProcessedEmail[] = await response.json();
      setEmails(json);
    } catch (fetchError) {
      const message = fetchError instanceof Error ? fetchError.message : 'Unknown error';
      console.error('Error fetching emails:', fetchError);
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  async function handleProcessEmail() {
    if (!emailBody.trim()) return;

    setProcessing(true);
    setProcessError(null);
    try {
      const response = await fetch('/api/email/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          emailBody,
          sender: emailSender || null,
          subject: emailSubject || null,
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to process email: ${response.statusText}`);
      }

      setProcessModalOpen(false);
      setEmailBody('');
      setEmailSender('');
      setEmailSubject('');
      fetchEmails();
    } catch (fetchError) {
      const message = fetchError instanceof Error ? fetchError.message : 'Unknown error';
      console.error('Error processing email:', fetchError);
      setProcessError(message);
    } finally {
      setProcessing(false);
    }
  }

  async function handleCreateTask(item: ActionItem) {
    setCreatingTaskFor(item.id);
    try {
      const response = await fetch('/api/dashboard/tasks/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: item.title,
          assigned_to: item.assigned_to || null,
          due_date: item.due_date || null,
          estimated_hours: item.estimated_hours || null,
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to create task: ${response.statusText}`);
      }

      setCreatedTaskIds((prev) => new Set(prev).add(item.id));
    } catch (fetchError) {
      console.error('Error creating task:', fetchError);
    } finally {
      setCreatingTaskFor(null);
    }
  }

  const filteredEmails = activeFilter === 'all'
    ? emails
    : emails.filter(email => email.category === activeFilter);

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
          <p className="font-semibold">Failed to load emails</p>
          <p className="text-sm mt-2">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Email Processing</h1>
          <p className="text-slate-500 mt-1">AI-powered email parsing and categorization</p>
        </div>
        <button
          onClick={() => {
            setProcessError(null);
            setProcessModalOpen(true);
          }}
          className="flex items-center gap-2 px-5 py-2.5 rounded-lg font-medium text-sm bg-gradient-to-r from-cyan-500 to-blue-600 text-white hover:shadow-lg hover:scale-[1.02] transition-all duration-200 shadow-sm"
        >
          <Play size={18} />
          Process Email
        </button>
      </div>

      {/* Filter Tabs */}
      <div className="flex flex-wrap gap-2">
        {(['all', 'Maintenance Request', 'Work Report', 'Vendor', 'Escalation', 'Inquiry', 'Other'] as EmailCategory[]).map((category) => {
          const isActive = activeFilter === category;
          const count = category === 'all'
            ? emails.length
            : emails.filter(e => e.category === category).length;

          return (
            <button
              key={category}
              onClick={() => setActiveFilter(category)}
              className={`
                flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium
                transition-all duration-200
                ${isActive
                  ? 'bg-[#0f172a] text-white shadow-md'
                  : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
                }
              `}
            >
              {category === 'all' && <Mail size={16} />}
              {category === 'Maintenance Request' && <FileText size={16} />}
              {category === 'Work Report' && <CheckCircle2 size={16} />}
              {category === 'Vendor' && <Tag size={16} />}
              {category === 'Escalation' && <AlertCircle size={16} />}
              {category === 'Inquiry' && <MessageSquare size={16} />}
              {category === 'Other' && <FileText size={16} />}
              <span>{category === 'all' ? 'All' : category}</span>
              <span className={`
                px-2 py-0.5 rounded-full text-xs
                ${isActive ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500'}
              `}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Email List */}
      <div className="space-y-3">
        {filteredEmails.length === 0 ? (
          <div className="bg-white rounded-xl p-12 text-center border border-slate-200">
            <Mail size={40} className="mx-auto text-slate-300 mb-3" />
            <p className="text-slate-500">No emails found in this category</p>
          </div>
        ) : (
          filteredEmails.map((email) => (
            <div
              key={email.id}
              className="bg-white rounded-xl shadow-sm border border-slate-200 hover:shadow-md transition-shadow overflow-hidden"
            >
              <div className="p-5">
                <div className="flex flex-col md:flex-row md:items-start gap-4">
                  {/* Sender Info */}
                  <div className="flex items-start gap-3 min-w-0 md:w-1/4">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-slate-100 to-slate-200 flex items-center justify-center flex-shrink-0">
                      <User size={18} className="text-slate-500" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium text-slate-800 text-sm truncate">{getSenderDisplay(email.sender)}</p>
                      {email.date_received && (
                        <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-1">
                          <Clock size={12} />
                          {formatBahrainDateTime(email.date_received)}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Subject & Summary */}
                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium text-slate-800 text-sm line-clamp-1">{email.subject || '(no subject)'}</h3>
                    <p className="text-sm text-slate-500 mt-1 line-clamp-2">{email.summary_text}</p>

                    {/* Action Items */}
                    {email.action_items && email.action_items.length > 0 && (
                      <ol className="mt-3 space-y-2">
                        {email.action_items.map((item, idx) => {
                          const created = createdTaskIds.has(item.id) || Boolean(item.planner_task_id);
                          return (
                            <li
                              key={item.id}
                              className="flex items-center justify-between gap-3 px-3 py-2 bg-slate-50 rounded-lg"
                            >
                              <span className="text-sm text-slate-700">
                                {idx + 1}. {item.title}
                              </span>
                              <button
                                onClick={() => handleCreateTask(item)}
                                disabled={created || creatingTaskFor === item.id}
                                className={`
                                  flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium flex-shrink-0 transition-colors
                                  ${created
                                    ? 'bg-emerald-100 text-emerald-700 cursor-default'
                                    : 'bg-cyan-50 text-cyan-700 hover:bg-cyan-100'
                                  }
                                `}
                              >
                                {creatingTaskFor === item.id ? (
                                  <Loader2 size={12} className="animate-spin" />
                                ) : created ? (
                                  <CheckCircle2 size={12} />
                                ) : null}
                                {created ? 'Task Created' : 'Create Task'}
                              </button>
                            </li>
                          );
                        })}
                      </ol>
                    )}
                  </div>

                  {/* Category Badge */}
                  <div className="flex md:flex-col items-center md:items-end gap-2">
                    <span className={`
                      px-3 py-1.5 rounded-full text-xs font-medium
                      ${categoryConfig[email.category as keyof typeof categoryConfig]?.color || 'bg-slate-100 text-slate-600'}
                    `}>
                      {email.category}
                    </span>
                    <span className="text-xs text-slate-400">
                      {email.action_items?.length || 0} actions
                    </span>
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="px-5 py-3 bg-slate-50 border-t border-slate-100">
                <span className="text-xs text-slate-500">Extracted {email.action_items?.length || 0} action items</span>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Process Email Modal */}
      <Modal
        isOpen={processModalOpen}
        onClose={() => setProcessModalOpen(false)}
        title="Process Email"
        size="lg"
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Sender</label>
              <input
                type="text"
                value={emailSender}
                onChange={(e) => setEmailSender(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                placeholder="sender@example.com"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Subject</label>
              <input
                type="text"
                value={emailSubject}
                onChange={(e) => setEmailSubject(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                placeholder="Email subject"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Email Body *</label>
            <textarea
              value={emailBody}
              onChange={(e) => setEmailBody(e.target.value)}
              rows={10}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
              placeholder="Paste the email content here..."
            />
          </div>

          {processError && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {processError}
            </p>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <button
              onClick={() => setProcessModalOpen(false)}
              className="px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleProcessEmail}
              disabled={!emailBody.trim() || processing}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-gradient-to-r from-cyan-500 to-blue-600 text-white rounded-lg hover:shadow-lg transition-shadow disabled:opacity-50"
            >
              {processing ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <Play size={16} />
                  Process
                </>
              )}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
