import { useEffect, useState } from 'react';
import {
  Calendar,
  Loader2,
  Users,
  FileText,
  CheckCircle2,
  ExternalLink,
  AlertCircle,
  ChevronDown,
  ChevronRight,
  X,
  Check,
} from 'lucide-react';
import Modal from './Modal';

interface TeamMember {
  name: string;
  email: string;
}

interface Team {
  id: string;
  name: string;
  members: TeamMember[];
}

interface GraphDateTime {
  dateTime: string;
  timeZone: string;
}

interface UpcomingMeeting {
  id: string;
  subject?: string | null;
  start?: GraphDateTime | null;
  end?: GraphDateTime | null;
  attendees?: string[];
}

interface AvailabilityResult {
  email: string;
  available: boolean;
}

interface NotesActionItem {
  title: string;
  assigned_to?: string | null;
  due_date?: string | null;
  estimated_hours?: number | null;
  planner_task_id?: string | null;
}

const FIXED_ATTENDEE = 'mcs.sw01@bakgroup.net';
const FIXED_ATTENDEE_NAME = 'Yasir Ismail';
const DURATION_OPTIONS = [
  { label: '30 minutes', minutes: 30 },
  { label: '1 hour', minutes: 60 },
  { label: '2 hours', minutes: 120 },
];

function todayIsoDate() {
  return new Date().toISOString().split('T')[0];
}

function computeEndTime(startTime: string, durationMinutes: number): string {
  const [hour, minute] = startTime.split(':').map(Number);
  if (Number.isNaN(hour) || Number.isNaN(minute)) return startTime;
  const totalMinutes = hour * 60 + minute + durationMinutes;
  const endHour = Math.floor(totalMinutes / 60) % 24;
  const endMinute = totalMinutes % 60;
  return `${String(endHour).padStart(2, '0')}:${String(endMinute).padStart(2, '0')}`;
}

function formatGraphDateTime(dt?: GraphDateTime | null) {
  if (!dt?.dateTime) return '-';
  const date = new Date(dt.dateTime);
  const formatted = Number.isNaN(date.getTime()) ? dt.dateTime : date.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
  return `${formatted}${dt.timeZone ? ` (${dt.timeZone})` : ''}`;
}

export default function SchedulesPage() {
  // Upcoming Meetings state
  const [upcomingMeetings, setUpcomingMeetings] = useState<UpcomingMeeting[]>([]);
  const [upcomingLoading, setUpcomingLoading] = useState(true);
  const [upcomingError, setUpcomingError] = useState<string | null>(null);

  // Schedule Meeting modal state
  const [meetingModalOpen, setMeetingModalOpen] = useState(false);
  const [meetingTitle, setMeetingTitle] = useState('Monthly Maintenance Review');
  const [meetingDate, setMeetingDate] = useState(todayIsoDate());
  const [startTime, setStartTime] = useState('10:00');
  const [durationMinutes, setDurationMinutes] = useState(60);
  const [teams, setTeams] = useState<Team[]>([]);
  const [teamsLoading, setTeamsLoading] = useState(false);
  const [teamsError, setTeamsError] = useState<string | null>(null);
  const [expandedTeams, setExpandedTeams] = useState<Set<string>>(new Set());
  const [selectedAttendees, setSelectedAttendees] = useState<Map<string, string>>(
    new Map([[FIXED_ATTENDEE, FIXED_ATTENDEE_NAME]])
  );
  const [availabilityResults, setAvailabilityResults] = useState<AvailabilityResult[] | null>(null);
  const [checkingAvailability, setCheckingAvailability] = useState(false);
  const [scheduling, setScheduling] = useState(false);
  const [meetingError, setMeetingError] = useState<string | null>(null);
  const [scheduledJoinUrl, setScheduledJoinUrl] = useState<string | null>(null);

  // Process Meeting Notes modal state
  const [notesModalOpen, setNotesModalOpen] = useState(false);
  const [notesText, setNotesText] = useState('');
  const [processingNotes, setProcessingNotes] = useState(false);
  const [notesError, setNotesError] = useState<string | null>(null);
  const [extractedActionItems, setExtractedActionItems] = useState<NotesActionItem[] | null>(null);

  useEffect(() => {
    fetchUpcomingMeetings();
  }, []);

  async function fetchUpcomingMeetings() {
    setUpcomingLoading(true);
    setUpcomingError(null);
    try {
      const response = await fetch('/api/meetings/upcoming');
      if (!response.ok) {
        throw new Error(`Failed to load upcoming meetings: ${response.statusText}`);
      }
      const json = await response.json();
      setUpcomingMeetings(json.meetings || []);
    } catch (fetchError) {
      const message = fetchError instanceof Error ? fetchError.message : 'Unknown error';
      console.error('Error fetching upcoming meetings:', fetchError);
      setUpcomingError(message);
    } finally {
      setUpcomingLoading(false);
    }
  }

  async function fetchTeams() {
    setTeamsLoading(true);
    setTeamsError(null);
    try {
      const response = await fetch('/api/meetings/teams', { method: 'POST' });
      if (!response.ok) {
        throw new Error(`Failed to load teams: ${response.statusText}`);
      }
      const json = await response.json();
      setTeams(json.teams || []);
    } catch (fetchError) {
      const message = fetchError instanceof Error ? fetchError.message : 'Unknown error';
      setTeamsError(message);
    } finally {
      setTeamsLoading(false);
    }
  }

  function openMeetingModal() {
    setMeetingTitle('Monthly Maintenance Review');
    setMeetingDate(todayIsoDate());
    setStartTime('10:00');
    setDurationMinutes(60);
    setExpandedTeams(new Set());
    setSelectedAttendees(new Map([[FIXED_ATTENDEE, FIXED_ATTENDEE_NAME]]));
    setAvailabilityResults(null);
    setMeetingError(null);
    setScheduledJoinUrl(null);
    setMeetingModalOpen(true);
    fetchTeams();
  }

  function toggleExpanded(teamId: string) {
    setExpandedTeams((prev) => {
      const next = new Set(prev);
      if (next.has(teamId)) {
        next.delete(teamId);
      } else {
        next.add(teamId);
      }
      return next;
    });
  }

  function isTeamFullySelected(team: Team) {
    return team.members.length > 0 && team.members.every((m) => selectedAttendees.has(m.email));
  }

  function isTeamPartiallySelected(team: Team) {
    const selectedCount = team.members.filter((m) => selectedAttendees.has(m.email)).length;
    return selectedCount > 0 && selectedCount < team.members.length;
  }

  function toggleTeam(team: Team) {
    const fullySelected = isTeamFullySelected(team);
    setAvailabilityResults(null);
    setSelectedAttendees((prev) => {
      const next = new Map(prev);
      if (fullySelected) {
        team.members.forEach((member) => {
          if (member.email !== FIXED_ATTENDEE) {
            next.delete(member.email);
          }
        });
      } else {
        team.members.forEach((member) => {
          next.set(member.email, member.name);
        });
      }
      return next;
    });
  }

  function toggleMember(member: TeamMember) {
    if (member.email === FIXED_ATTENDEE) return;
    setAvailabilityResults(null);
    setSelectedAttendees((prev) => {
      const next = new Map(prev);
      if (next.has(member.email)) {
        next.delete(member.email);
      } else {
        next.set(member.email, member.name);
      }
      return next;
    });
  }

  function removeAttendee(email: string) {
    if (email === FIXED_ATTENDEE) return;
    setAvailabilityResults(null);
    setSelectedAttendees((prev) => {
      const next = new Map(prev);
      next.delete(email);
      return next;
    });
  }

  async function handleCheckAvailability() {
    setCheckingAvailability(true);
    setMeetingError(null);
    setAvailabilityResults(null);
    try {
      const endTime = computeEndTime(startTime, durationMinutes);
      const response = await fetch('/api/meetings/check-availability', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          attendees: Array.from(selectedAttendees.keys()),
          date: meetingDate,
          startTime,
          endTime,
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to check availability: ${response.statusText}`);
      }

      const json = await response.json();
      setAvailabilityResults(json.results || []);
    } catch (fetchError) {
      const message = fetchError instanceof Error ? fetchError.message : 'Unknown error';
      setMeetingError(message);
    } finally {
      setCheckingAvailability(false);
    }
  }

  const hasConfirmedAttendee = Boolean(availabilityResults?.some((r) => r.available));

  async function handleScheduleMeeting() {
    if (!hasConfirmedAttendee) return;

    setScheduling(true);
    setMeetingError(null);
    try {
      const endTime = computeEndTime(startTime, durationMinutes);
      const response = await fetch('/api/meetings/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slot: {
            start: { dateTime: `${meetingDate}T${startTime}:00`, timeZone: 'Asia/Bahrain' },
            end: { dateTime: `${meetingDate}T${endTime}:00`, timeZone: 'Asia/Bahrain' },
          },
          attendees: Array.from(selectedAttendees.keys()),
          title: meetingTitle,
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to schedule meeting: ${response.statusText}`);
      }

      const json = await response.json();
      setScheduledJoinUrl(json.joinUrl || null);
      fetchUpcomingMeetings();
    } catch (fetchError) {
      const message = fetchError instanceof Error ? fetchError.message : 'Unknown error';
      setMeetingError(message);
    } finally {
      setScheduling(false);
    }
  }

  function openNotesModal() {
    setNotesText('');
    setNotesError(null);
    setExtractedActionItems(null);
    setNotesModalOpen(true);
  }

  async function handleProcessNotes() {
    if (!notesText.trim()) return;

    setProcessingNotes(true);
    setNotesError(null);
    try {
      const response = await fetch('/api/meetings/process-notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: notesText }),
      });

      if (!response.ok) {
        throw new Error(`Failed to process meeting notes: ${response.statusText}`);
      }

      const json = await response.json();
      setExtractedActionItems(json.action_items || []);
    } catch (fetchError) {
      const message = fetchError instanceof Error ? fetchError.message : 'Unknown error';
      setNotesError(message);
    } finally {
      setProcessingNotes(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Schedules</h1>
          <p className="text-slate-500 mt-1">Upcoming meetings and review scheduling</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={openNotesModal}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg font-medium text-sm bg-white text-slate-700 border border-slate-200 hover:bg-slate-50 transition-colors"
          >
            <FileText size={18} />
            Process Meeting Notes
          </button>
          <button
            onClick={openMeetingModal}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg font-medium text-sm bg-gradient-to-r from-cyan-500 to-blue-600 text-white hover:shadow-lg transition-shadow"
          >
            <Calendar size={18} />
            Schedule Meeting
          </button>
        </div>
      </div>

      {/* Upcoming Meetings */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200">
        <div className="px-6 py-4 border-b border-slate-200">
          <h2 className="font-semibold text-slate-800">Upcoming Meetings</h2>
        </div>
        <div className="p-6">
          {upcomingLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
            </div>
          ) : upcomingError ? (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{upcomingError}</p>
          ) : upcomingMeetings.length === 0 ? (
            <p className="text-slate-500 text-sm text-center py-4">No upcoming meetings scheduled</p>
          ) : (
            <div className="space-y-3">
              {upcomingMeetings.map((meeting) => (
                <div key={meeting.id} className="flex items-start gap-4 p-3 rounded-lg hover:bg-slate-50 transition-colors">
                  <div className="w-8 h-8 rounded-lg bg-purple-500/10 flex items-center justify-center flex-shrink-0">
                    <Calendar size={16} className="text-purple-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-slate-800 text-sm truncate">{meeting.subject || 'Untitled meeting'}</p>
                    <p className="text-xs text-slate-500 mt-1">
                      {formatGraphDateTime(meeting.start)} to {formatGraphDateTime(meeting.end)}
                    </p>
                  </div>
                  <span className="text-xs text-slate-400 flex-shrink-0">
                    {(meeting.attendees || []).length} attendee{(meeting.attendees || []).length === 1 ? '' : 's'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Schedule Meeting Modal */}
      <Modal
        isOpen={meetingModalOpen}
        onClose={() => setMeetingModalOpen(false)}
        title="Schedule Meeting"
        size="lg"
      >
        {scheduledJoinUrl ? (
          <div className="space-y-4">
            <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4">
              <div className="flex items-center gap-2 text-emerald-700 mb-2">
                <CheckCircle2 size={20} />
                <span className="font-medium">Meeting scheduled successfully</span>
              </div>
              <a
                href={scheduledJoinUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-sm text-cyan-600 hover:text-cyan-700 font-medium break-all"
              >
                <ExternalLink size={14} />
                {scheduledJoinUrl}
              </a>
            </div>
            <div className="flex justify-end">
              <button
                onClick={() => setMeetingModalOpen(false)}
                className="px-4 py-2 text-sm font-medium bg-gradient-to-r from-cyan-500 to-blue-600 text-white rounded-lg hover:shadow-lg transition-shadow"
              >
                Done
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Meeting Title</label>
              <input
                type="text"
                value={meetingTitle}
                onChange={(e) => {
                  setMeetingTitle(e.target.value);
                  setAvailabilityResults(null);
                }}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Date</label>
                <input
                  type="date"
                  value={meetingDate}
                  onChange={(e) => {
                    setMeetingDate(e.target.value);
                    setAvailabilityResults(null);
                  }}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Start Time</label>
                <input
                  type="time"
                  value={startTime}
                  onChange={(e) => {
                    setStartTime(e.target.value);
                    setAvailabilityResults(null);
                  }}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Duration</label>
              <div className="flex gap-2">
                {DURATION_OPTIONS.map((opt) => (
                  <button
                    key={opt.minutes}
                    onClick={() => {
                      setDurationMinutes(opt.minutes);
                      setAvailabilityResults(null);
                    }}
                    className={`px-3 py-1.5 text-sm font-medium rounded-lg border transition-colors ${
                      durationMinutes === opt.minutes
                        ? 'bg-[#0f172a] text-white border-[#0f172a]'
                        : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="flex items-center gap-2 text-sm font-medium text-slate-700 mb-2">
                <Users size={16} />
                Teams
              </label>

              {teamsError && (
                <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-3">
                  {teamsError}
                </p>
              )}

              {teamsLoading ? (
                <div className="flex items-center justify-center py-6 border border-slate-200 rounded-lg">
                  <Loader2 size={20} className="animate-spin text-slate-400" />
                </div>
              ) : (
                <div className="space-y-2 max-h-52 overflow-y-auto">
                  {teams.map((team) => {
                    const expanded = expandedTeams.has(team.id);
                    const fullySelected = isTeamFullySelected(team);
                    const partiallySelected = isTeamPartiallySelected(team);
                    const selectedCount = team.members.filter((m) => selectedAttendees.has(m.email)).length;

                    return (
                      <div key={team.id} className="border border-slate-200 rounded-lg overflow-hidden">
                        <div className="flex items-center gap-3 px-3 py-2.5 bg-white">
                          <input
                            type="checkbox"
                            checked={fullySelected}
                            ref={(el) => {
                              if (el) el.indeterminate = partiallySelected;
                            }}
                            onChange={() => toggleTeam(team)}
                            disabled={team.members.length === 0}
                            className="rounded border-slate-300 text-cyan-600 focus:ring-cyan-500"
                          />
                          <button
                            type="button"
                            onClick={() => toggleExpanded(team.id)}
                            className="flex-1 flex items-center justify-between text-left"
                          >
                            <span className="text-sm font-medium text-slate-700">{team.name}</span>
                            <span className="flex items-center gap-2 text-xs text-slate-400">
                              {selectedCount}/{team.members.length} selected
                              {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                            </span>
                          </button>
                        </div>

                        {expanded && (
                          <div className="border-t border-slate-100 divide-y divide-slate-100 bg-slate-50">
                            {team.members.length === 0 ? (
                              <p className="px-3 py-2 text-sm text-slate-400">No members in this team yet</p>
                            ) : (
                              team.members.map((member) => (
                                <label
                                  key={member.email}
                                  className="flex items-center gap-3 px-3 py-2 pl-9 cursor-pointer hover:bg-slate-100"
                                >
                                  <input
                                    type="checkbox"
                                    checked={selectedAttendees.has(member.email)}
                                    onChange={() => toggleMember(member)}
                                    className="rounded border-slate-300 text-cyan-600 focus:ring-cyan-500"
                                  />
                                  <span className="text-sm text-slate-700">
                                    {member.name} <span className="text-slate-400">({member.email})</span>
                                  </span>
                                </label>
                              ))
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Attendees ({selectedAttendees.size})
              </label>
              <div className="border border-slate-200 rounded-lg divide-y divide-slate-100 max-h-40 overflow-y-auto">
                {Array.from(selectedAttendees.entries()).map(([email, name]) => {
                  const result = availabilityResults?.find((r) => r.email === email);
                  return (
                    <div key={email} className="flex items-center justify-between gap-3 px-3 py-2">
                      <span className="text-sm text-slate-700 truncate">
                        {name} <span className="text-slate-400">({email})</span>
                      </span>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {result && (
                          result.available ? (
                            <span className="flex items-center gap-1 text-xs font-medium text-emerald-600">
                              <Check size={14} />
                              Available
                            </span>
                          ) : (
                            <span className="flex items-center gap-1 text-xs font-medium text-red-600">
                              <X size={14} />
                              Busy
                            </span>
                          )
                        )}
                        <button
                          type="button"
                          onClick={() => removeAttendee(email)}
                          disabled={email === FIXED_ATTENDEE}
                          title={email === FIXED_ATTENDEE ? 'This attendee cannot be removed' : 'Remove attendee'}
                          className={`p-1 rounded-md transition-colors flex-shrink-0 ${
                            email === FIXED_ATTENDEE
                              ? 'text-slate-300 cursor-not-allowed'
                              : 'text-slate-400 hover:text-red-600 hover:bg-red-50'
                          }`}
                        >
                          <X size={14} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <button
              onClick={handleCheckAvailability}
              disabled={selectedAttendees.size === 0 || !meetingDate || !startTime || checkingAvailability}
              className="flex items-center justify-center gap-2 w-full px-4 py-2.5 text-sm font-medium bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition-colors disabled:opacity-50"
            >
              {checkingAvailability ? <Loader2 size={16} className="animate-spin" /> : <Calendar size={16} />}
              Check Availability
            </button>

            {meetingError && (
              <p className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                <AlertCircle size={16} />
                {meetingError}
              </p>
            )}

            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => setMeetingModalOpen(false)}
                className="px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleScheduleMeeting}
                disabled={!hasConfirmedAttendee || scheduling}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-gradient-to-r from-cyan-500 to-blue-600 text-white rounded-lg hover:shadow-lg transition-shadow disabled:opacity-50"
              >
                {scheduling ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    Scheduling...
                  </>
                ) : (
                  'Schedule Meeting'
                )}
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Process Meeting Notes Modal */}
      <Modal
        isOpen={notesModalOpen}
        onClose={() => setNotesModalOpen(false)}
        title="Process Meeting Notes"
        size="lg"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Meeting Notes</label>
            <textarea
              value={notesText}
              onChange={(e) => setNotesText(e.target.value)}
              rows={10}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
              placeholder="Paste the meeting notes here..."
            />
          </div>

          {notesError && (
            <p className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              <AlertCircle size={16} />
              {notesError}
            </p>
          )}

          {extractedActionItems && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 space-y-3">
              <div className="flex items-center gap-2 text-emerald-700">
                <CheckCircle2 size={18} />
                <span className="font-medium">
                  {extractedActionItems.length === 0
                    ? 'No action items found'
                    : `${extractedActionItems.length} action item${extractedActionItems.length === 1 ? '' : 's'} created in Planner`}
                </span>
              </div>
              {extractedActionItems.length > 0 && (
                <ol className="space-y-1.5">
                  {extractedActionItems.map((item, idx) => (
                    <li key={idx} className="text-sm text-emerald-800">
                      {idx + 1}. {item.title}
                      {item.assigned_to && <span className="text-emerald-600"> - {item.assigned_to}</span>}
                      {item.due_date && <span className="text-emerald-600"> (due {item.due_date})</span>}
                    </li>
                  ))}
                </ol>
              )}
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <button
              onClick={() => setNotesModalOpen(false)}
              className="px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
            >
              Close
            </button>
            <button
              onClick={handleProcessNotes}
              disabled={!notesText.trim() || processingNotes}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-gradient-to-r from-cyan-500 to-blue-600 text-white rounded-lg hover:shadow-lg transition-shadow disabled:opacity-50"
            >
              {processingNotes ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Processing...
                </>
              ) : (
                'Process Notes'
              )}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
