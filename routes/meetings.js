const express = require('express');
const path = require('path');
const dotenv = require('dotenv');
const Groq = require('groq-sdk');
const { graphRequest } = require('../graph/client');
const { pool } = require('../db');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const router = express.Router();
const { SERVICE_ACCOUNT_EMAIL, PLANNER_PLAN_ID } = process.env;

const PLACEHOLDER_TEAM_NOTE = 'These are placeholder members - update with real company email addresses when available.';

const PLACEHOLDER_TEAM_MEMBERS = {
  facilities: [
    { name: 'Facilities Lead', email: 'facilities.lead@bakgroup.net' },
    { name: 'Facilities Coordinator', email: 'facilities.coordinator@bakgroup.net' },
  ],
  it: [
    { name: 'IT Manager', email: 'it.manager@bakgroup.net' },
    { name: 'IT Support', email: 'it.support@bakgroup.net' },
  ],
  sales: [
    { name: 'Sales Manager', email: 'sales.manager@bakgroup.net' },
    { name: 'Sales Executive', email: 'sales.executive@bakgroup.net' },
  ],
  purchase: [
    { name: 'Purchase Manager', email: 'purchase.manager@bakgroup.net' },
    { name: 'Purchase Officer', email: 'purchase.officer@bakgroup.net' },
  ],
  software: [
    { name: 'Software Lead', email: 'software.lead@bakgroup.net' },
    { name: 'Software Developer', email: 'software.developer@bakgroup.net' },
  ],
  management: [
    { name: 'General Manager', email: 'general.manager@bakgroup.net' },
    { name: 'Operations Manager', email: 'operations.manager@bakgroup.net' },
  ],
};

function minutesBetween(startTime, endTime) {
  const [startHour, startMinute] = startTime.split(':').map(Number);
  const [endHour, endMinute] = endTime.split(':').map(Number);
  return (endHour * 60 + endMinute) - (startHour * 60 + startMinute);
}

// Bahrain is UTC+3 year-round (Arabia Standard Time, no DST). Treat the given
// date/time as literal Bahrain wall-clock components and convert to the
// equivalent UTC instant by subtracting 3 hours - independent of whatever
// timezone the server process itself happens to run in.
function bahrainWallClockToUtcIso(dateStr, timeStr) {
  const [year, month, day] = dateStr.split('-').map(Number);
  const [hour, minute] = timeStr.split(':').map(Number);
  const utcMillis = Date.UTC(year, month - 1, day, hour, minute, 0) - 3 * 60 * 60 * 1000;
  return new Date(utcMillis).toISOString();
}

async function checkAttendeesAvailability(attendees, date, startTime, endTime, attendeeNames = {}) {
  const durationHours = minutesBetween(startTime, endTime) / 60;
  const startUtcIso = bahrainWallClockToUtcIso(date, startTime);
  const endUtcIso = new Date(new Date(startUtcIso).getTime() + durationHours * 60 * 60 * 1000).toISOString();

  console.log(`Checking calendarView from ${startUtcIso} to ${endUtcIso} (UTC) for: ${attendees.join(', ')}`);

  const results = await Promise.all(attendees.map(async (email) => {
    const name = attendeeNames[email] || email;

    try {
      const endpoint = `/users/${encodeURIComponent(email)}/calendarView?startDateTime=${encodeURIComponent(startUtcIso)}&endDateTime=${encodeURIComponent(endUtcIso)}`;
      const result = await graphRequest('GET', endpoint, null, 'app');
      const events = Array.isArray(result?.value) ? result.value : [];

      console.log(`calendarView for ${email}: ${events.length} event(s) found`);

      if (events.length === 0) {
        return { email, name, available: true };
      }

      return { email, name, available: false, reason: events[0]?.subject || 'Busy' };
    } catch (error) {
      console.warn(`calendarView check failed for ${email}, treating as unverified:`, error.message);
      return { email, name, available: true, note: 'unverified' };
    }
  }));

  return { results };
}

function getNextBusinessDaysWindow(businessDays) {
  const start = new Date();
  const end = new Date(start);
  let count = 0;

  while (count < businessDays) {
    end.setDate(end.getDate() + 1);
    const day = end.getDay();
    if (day !== 0 && day !== 6) {
      count++;
    }
  }

  return { start, end };
}

function normalizeDateTime(value) {
  if (value && typeof value === 'object' && value.dateTime) {
    return { dateTime: value.dateTime, timeZone: value.timeZone || 'UTC' };
  }
  return { dateTime: value, timeZone: 'UTC' };
}

function graphDateTimeToUtcIso(dt) {
  if (!dt?.dateTime) return null;
  const hasOffset = /[Zz]$|[+-]\d{2}:\d{2}$/.test(dt.dateTime);
  if (hasOffset) return dt.dateTime;
  if (!dt.timeZone || dt.timeZone.toUpperCase() === 'UTC') {
    return `${dt.dateTime}Z`;
  }
  return dt.dateTime;
}

function parseJsonResponse(rawText) {
  const cleaned = String(rawText || '')
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  return JSON.parse(cleaned);
}

async function callGroq(prompt, content) {
  const apiKey = process.env.GROQ_API_KEY;
  const groq = new Groq({ apiKey });
  const completion = await groq.chat.completions.create({
    messages: [{ role: 'user', content: `${prompt}\n\nMeeting notes:\n${content}` }],
    model: 'openai/gpt-oss-20b',
  });
  return completion.choices[0].message.content;
}

async function extractMeetingActionItems(notes) {
  const prompt = [
    'Extract all action items from these meeting notes and return ONLY a valid JSON array where each item has fields title, assigned_to, due_date in YYYY-MM-DD format or null, estimated_hours or null.',
    'Return only the JSON array nothing else.',
  ].join(' ');

  const responseText = await callGroq(prompt, notes);
  return parseJsonResponse(responseText);
}

function normalizeActionItem(item) {
  return {
    title: item?.title || 'Follow up',
    assigned_to: item?.assigned_to || null,
    due_date: item?.due_date || null,
    estimated_hours: typeof item?.estimated_hours === 'number' ? item.estimated_hours : null,
  };
}

async function createPlannerTaskForActionItem(actionItem) {
  if (!PLANNER_PLAN_ID) {
    return null;
  }

  const body = {
    planId: PLANNER_PLAN_ID,
    title: actionItem.title,
    assignments: {},
    dueDateTime: actionItem.due_date ? `${actionItem.due_date}T00:00:00Z` : null,
  };

  const createdTask = await graphRequest('POST', '/planner/tasks', body, 'app');
  return createdTask?.id || null;
}

router.post('/find-slots', async (req, res) => {
  try {
    const { attendees, durationMinutes } = req.body;

    if (!Array.isArray(attendees) || !attendees.length) {
      return res.status(400).json({ error: 'attendees array is required' });
    }

    if (!durationMinutes || typeof durationMinutes !== 'number' || durationMinutes <= 0) {
      return res.status(400).json({ error: 'durationMinutes must be a positive number' });
    }

    const { start, end } = getNextBusinessDaysWindow(5);

    const body = {
      attendees: attendees.map((email) => ({
        emailAddress: { address: email },
        type: 'Required',
      })),
      timeConstraint: {
        activityDomain: 'work',
        timeslots: [
          {
            start: { dateTime: start.toISOString(), timeZone: 'UTC' },
            end: { dateTime: end.toISOString(), timeZone: 'UTC' },
          },
        ],
      },
      meetingDuration: `PT${durationMinutes}M`,
      maxCandidates: 10,
      returnSuggestionReasons: true,
      minimumAttendeePercentage: 100,
    };

    const result = await graphRequest(
      'POST',
      `/users/${encodeURIComponent(SERVICE_ACCOUNT_EMAIL)}/findMeetingTimes`,
      body,
      'app'
    );

    const suggestions = Array.isArray(result?.meetingTimeSuggestions) ? result.meetingTimeSuggestions : [];
    const topSlots = suggestions.slice(0, 3).map((suggestion) => ({
      start: suggestion.meetingTimeSlot?.start || null,
      end: suggestion.meetingTimeSlot?.end || null,
      confidence: suggestion.confidence || null,
    }));

    return res.json({ slots: topSlots });
  } catch (error) {
    console.error('Find meeting slots failed:', error);
    return res.status(500).json({ error: 'Failed to find meeting slots' });
  }
});

router.post('/check-availability', async (req, res) => {
  try {
    console.log('check-availability request body received:', JSON.stringify(req.body, null, 2));

    const { attendees, attendeeNames, date, startTime, endTime } = req.body;

    if (!Array.isArray(attendees) || !attendees.length) {
      return res.status(400).json({ error: 'attendees array is required' });
    }

    if (!date || !startTime || !endTime) {
      return res.status(400).json({ error: 'date, startTime and endTime are required' });
    }

    const currentUserEmail = req.session?.user?.email;
    let fullAttendees = attendees;
    const names = { ...(attendeeNames || {}) };

    if (currentUserEmail) {
      const rest = attendees.filter((email) => email.toLowerCase() !== currentUserEmail.toLowerCase());
      fullAttendees = [currentUserEmail, ...rest];
      if (req.session.user.name) {
        names[currentUserEmail] = req.session.user.name;
      }
    }

    const { results } = await checkAttendeesAvailability(fullAttendees, date, startTime, endTime, names);
    return res.json({ results });
  } catch (error) {
    console.error('Check availability failed:', error);
    return res.status(500).json({ error: 'Failed to check availability' });
  }
});

const NON_MEETING_SUBJECT_PREFIXES = [
  'Maintenance Task',
  'Maintenance:',
  'Maintenance Due Soon',
  'Document Renewal',
  'Document Renewal Reminder',
  'Document Renewal Required',
  'Document Expiring Soon',
];

function isMaintenanceEventSubject(subject) {
  const value = subject || '';
  return NON_MEETING_SUBJECT_PREFIXES.some((prefix) => value.startsWith(prefix));
}

router.get('/upcoming', async (req, res) => {
  try {
    const now = new Date();
    const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const todayIso = now.toISOString();
    const thirtyDaysIso = thirtyDaysFromNow.toISOString();

    const filter = `start/dateTime ge '${todayIso}' and end/dateTime le '${thirtyDaysIso}'`;
    const select = 'id,subject,start,end,webLink,onlineMeeting,attendees';
    const endpoint = `/users/${encodeURIComponent(SERVICE_ACCOUNT_EMAIL)}/events?$filter=${encodeURIComponent(filter)}&$orderby=${encodeURIComponent('start/dateTime asc')}&$top=20&$select=${select}`;

    const result = await graphRequest('GET', endpoint, null, 'app');
    const events = Array.isArray(result?.value) ? result.value : [];

    const meetings = events
      .filter((event) => !isMaintenanceEventSubject(event.subject))
      .map((event) => ({
        id: event.id,
        subject: event.subject,
        start: graphDateTimeToUtcIso(event.start),
        end: graphDateTimeToUtcIso(event.end),
        attendeeCount: Array.isArray(event.attendees) ? event.attendees.length : 0,
        webLink: event.webLink || null,
        joinUrl: event.onlineMeeting?.joinUrl || null,
      }));

    return res.json({ meetings });
  } catch (error) {
    console.error('Load upcoming meetings failed:', error);
    return res.status(500).json({ error: 'Failed to load upcoming meetings' });
  }
});

router.post('/create', async (req, res) => {
  try {
    const { slot, attendees, title } = req.body;

    if (!slot || !slot.start || !slot.end) {
      return res.status(400).json({ error: 'slot with start and end is required' });
    }

    if (!Array.isArray(attendees) || !attendees.length) {
      return res.status(400).json({ error: 'attendees array is required' });
    }

    if (!title || typeof title !== 'string' || !title.trim()) {
      return res.status(400).json({ error: 'title is required' });
    }

    const startDateTime = normalizeDateTime(slot.start);
    const endDateTime = normalizeDateTime(slot.end);

    const event = await graphRequest(
      'POST',
      `/users/${encodeURIComponent(SERVICE_ACCOUNT_EMAIL)}/events`,
      {
        subject: title,
        start: startDateTime,
        end: endDateTime,
        isOnlineMeeting: true,
        onlineMeetingProvider: 'teamsForBusiness',
        attendees: attendees.map((email) => ({
          emailAddress: { address: email },
          type: 'Required',
        })),
      },
      'app'
    );

    const joinUrl = event?.onlineMeeting?.joinUrl || null;

    return res.status(201).json({
      title,
      start: startDateTime,
      end: endDateTime,
      attendees,
      eventId: event?.id || null,
      joinUrl,
      onlineMeeting: event?.onlineMeeting || null,
    });
  } catch (error) {
    console.error('Create meeting failed:', error);
    return res.status(500).json({ error: 'Failed to create meeting' });
  }
});

router.post('/process-notes', async (req, res) => {
  try {
    const { notes } = req.body;

    if (!notes || typeof notes !== 'string' || !notes.trim()) {
      return res.status(400).json({ error: 'notes is required' });
    }

    const actionItems = await extractMeetingActionItems(notes);
    const actionItemsArray = Array.isArray(actionItems) ? actionItems : [];

    const createdTasks = [];
    for (const item of actionItemsArray) {
      const normalized = normalizeActionItem(item);
      const plannerTaskId = await createPlannerTaskForActionItem(normalized);
      createdTasks.push({ ...normalized, planner_task_id: plannerTaskId });
    }

    return res.json({ action_items: createdTasks });
  } catch (error) {
    console.error('Process meeting notes failed:', error);
    return res.status(500).json({ error: 'Failed to process meeting notes' });
  }
});

router.post('/teams', async (req, res) => {
  try {
    const technicianResult = await pool.query(
      `SELECT name, email FROM technicians WHERE email IS NOT NULL ORDER BY name`
    );
    const maintenanceMembers = technicianResult.rows.map((row) => ({
      name: row.name,
      email: row.email,
    }));

    const teams = [
      { id: 'maintenance', name: 'Maintenance Team', members: maintenanceMembers },
      { id: 'facilities', name: 'Facilities Team', members: PLACEHOLDER_TEAM_MEMBERS.facilities, note: PLACEHOLDER_TEAM_NOTE },
      { id: 'it', name: 'IT Team', members: PLACEHOLDER_TEAM_MEMBERS.it, note: PLACEHOLDER_TEAM_NOTE },
      { id: 'sales', name: 'Sales Team', members: PLACEHOLDER_TEAM_MEMBERS.sales, note: PLACEHOLDER_TEAM_NOTE },
      { id: 'purchase', name: 'Purchase Team', members: PLACEHOLDER_TEAM_MEMBERS.purchase, note: PLACEHOLDER_TEAM_NOTE },
      { id: 'software', name: 'Software Team', members: PLACEHOLDER_TEAM_MEMBERS.software, note: PLACEHOLDER_TEAM_NOTE },
      { id: 'management', name: 'Management Team', members: PLACEHOLDER_TEAM_MEMBERS.management, note: PLACEHOLDER_TEAM_NOTE },
    ];

    return res.json({ teams });
  } catch (error) {
    console.error('Load teams failed:', error);
    return res.status(500).json({ error: 'Failed to load teams' });
  }
});

module.exports = router;
