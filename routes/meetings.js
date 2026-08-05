const express = require('express');
const path = require('path');
const dotenv = require('dotenv');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { graphRequest } = require('../graph/client');
const { pool } = require('../db');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const router = express.Router();
const { SERVICE_ACCOUNT_EMAIL, GEMINI_API_KEY, PLANNER_PLAN_ID } = process.env;
const genAI = GEMINI_API_KEY ? new GoogleGenerativeAI(GEMINI_API_KEY) : null;

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

function parseJsonResponse(rawText) {
  const cleaned = String(rawText || '')
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  return JSON.parse(cleaned);
}

async function callGemini(prompt, content) {
  if (!genAI) {
    throw new Error('GEMINI_API_KEY is not configured');
  }

  const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' }, { apiVersion: 'v1' });
  const result = await model.generateContent(`${prompt}\n\nMeeting notes:\n${content}`);
  const response = await result.response;
  return response.text();
}

async function extractMeetingActionItems(notes) {
  const prompt = [
    'Extract all action items from these meeting notes and return ONLY a valid JSON array where each item has fields title, assigned_to, due_date in YYYY-MM-DD format or null, estimated_hours or null.',
    'Return only the JSON array nothing else.',
  ].join(' ');

  const responseText = await callGemini(prompt, notes);
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

    const onlineMeeting = await graphRequest(
      'POST',
      `/users/${encodeURIComponent(SERVICE_ACCOUNT_EMAIL)}/onlineMeetings`,
      {
        startDateTime: startDateTime.dateTime,
        endDateTime: endDateTime.dateTime,
        subject: title,
      },
      'delegated'
    );

    const joinUrl = onlineMeeting?.joinWebUrl || null;

    const event = await graphRequest(
      'POST',
      `/users/${encodeURIComponent(SERVICE_ACCOUNT_EMAIL)}/events`,
      {
        subject: title,
        start: startDateTime,
        end: endDateTime,
        attendees: attendees.map((email) => ({
          emailAddress: { address: email },
          type: 'Required',
        })),
        body: {
          contentType: 'html',
          content: `<p>Join the Teams meeting: <a href="${joinUrl}">${joinUrl}</a></p>`,
        },
      },
      'app'
    );

    return res.status(201).json({
      title,
      start: startDateTime,
      end: endDateTime,
      attendees,
      joinUrl,
      onlineMeetingId: onlineMeeting?.id || null,
      eventId: event?.id || null,
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
      { id: 'facilities', name: 'Facilities Team', members: PLACEHOLDER_TEAM_MEMBERS.facilities },
      { id: 'it', name: 'IT Team', members: PLACEHOLDER_TEAM_MEMBERS.it },
      { id: 'sales', name: 'Sales Team', members: PLACEHOLDER_TEAM_MEMBERS.sales },
      { id: 'purchase', name: 'Purchase Team', members: PLACEHOLDER_TEAM_MEMBERS.purchase },
      { id: 'software', name: 'Software Team', members: PLACEHOLDER_TEAM_MEMBERS.software },
      { id: 'management', name: 'Management Team', members: PLACEHOLDER_TEAM_MEMBERS.management },
    ];

    return res.json({ teams });
  } catch (error) {
    console.error('Load teams failed:', error);
    return res.status(500).json({ error: 'Failed to load teams' });
  }
});

module.exports = router;
