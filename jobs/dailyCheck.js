const path = require('path');
const dotenv = require('dotenv');
const cron = require('node-cron');
const { pool } = require('../db');
const { getDelegatedToken, graphRequest } = require('../graph/client');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const {
  PLANNER_PLAN_ID,
  SERVICE_ACCOUNT_EMAIL,
  MAINTENANCE_MANAGER_EMAIL,
  SENIOR_MANAGER_EMAIL,
  TEAM_GROUP_ID,
  TEAMS_CHANNEL_ID,
  MY_USER_ID,
} = process.env;

const WORKING_HOURS_START = '07:30:00';
const WORKING_HOURS_END = '16:30:00';
const WORK_START_MINUTES = 7 * 60 + 30;
const WORK_END_MINUTES = 16 * 60 + 30;

function toIso8601Duration(hours) {
  const totalMinutes = Math.round(Number(hours || 1) * 60);
  const wholeHours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  let duration = 'PT';
  if (wholeHours > 0) duration += `${wholeHours}H`;
  if (minutes > 0) duration += `${minutes}M`;
  if (wholeHours === 0 && minutes === 0) duration += '0M';
  return duration;
}

function minutesSinceMidnight(dateTimeStr) {
  const match = /T(\d{2}):(\d{2})/.exec(dateTimeStr || '');
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

function nextBusinessDay(date) {
  const next = new Date(date);
  do {
    next.setDate(next.getDate() + 1);
  } while (next.getDay() === 0 || next.getDay() === 6);
  return next;
}

function isoDateOnly(date) {
  return date.toISOString().slice(0, 10);
}

function parseDateValue(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function formatDateTime(dateValue, hours = 9) {
  const date = parseDateValue(dateValue);
  if (!date) return null;
  const utcDate = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), hours, 0, 0));
  return utcDate.toISOString();
}

function addHoursToDateTime(dateString, hours) {
  const date = parseDateValue(dateString);
  if (!date) return null;
  date.setHours(date.getHours() + Number(hours));
  return date.toISOString();
}

async function getPlannerBucketId(planId) {
  const buckets = await graphRequest('GET', `/planner/plans/${planId}/buckets`, null, 'app');
  if (!buckets.value || !buckets.value.length) {
    throw new Error(`No buckets found for planner plan ${planId}`);
  }
  return buckets.value[0].id;
}

async function createPlannerTask(asset) {
  const title = `${asset.equipment_name} - ${asset.site_location}`;
  const dueDateTime = formatDateTime(asset.next_due_date, 9);
  const description = `Equipment: ${asset.equipment_name}\nSite: ${asset.site_location}\nDuration: ${asset.estimated_duration_hours} hours\nType of service: ${asset.type_of_service}`;
  const bucketId = await getPlannerBucketId(PLANNER_PLAN_ID);

  const body = {
    planId: PLANNER_PLAN_ID,
    bucketId,
    title,
    startDateTime: dueDateTime,
    dueDateTime,
    assignments: {
      [MY_USER_ID]: {
        '@odata.type': 'microsoft.graph.plannerAssignment',
        orderHint: ' !',
      },
    },
    details: {
      description,
    },
  };

  const result = await graphRequest('POST', '/planner/tasks', body, 'app');
  return result.id;
}

async function assignPlannerTask(taskId, technician) {
  const boardFormat = await graphRequest('GET', `/planner/tasks/${taskId}/assignedToTaskBoardFormat`, null, 'app');
  const etag = boardFormat['@odata.etag'] || boardFormat['odata.etag'];
  if (!etag) {
    throw new Error('Could not retrieve ETag for planner task board format');
  }

  const body = {
    assignments: {
      [MY_USER_ID]: {
        '@odata.type': 'microsoft.graph.plannerAssignment',
        orderHint: ' !',
      },
    },
  };

  await graphRequest(
    'PATCH',
    `/planner/tasks/${taskId}/assignedToTaskBoardFormat`,
    body,
    'app',
    { 'If-Match': etag }
  );
}

async function checkTechnicianAvailability(technicianEmail, isoDate, estimatedDurationHours) {
  const body = {
    attendees: [
      {
        emailAddress: { address: technicianEmail },
        type: 'Required',
      },
    ],
    locationConstraint: {
      isRequired: false,
      suggestLocation: false,
      locations: [],
    },
    timeConstraint: {
      activityDomain: 'Work',
      timeslots: [
        {
          start: { dateTime: `${isoDate}T${WORKING_HOURS_START}`, timeZone: 'Arab Standard Time' },
          end: { dateTime: `${isoDate}T${WORKING_HOURS_END}`, timeZone: 'Arab Standard Time' },
        },
      ],
    },
    meetingDuration: toIso8601Duration(estimatedDurationHours),
    maxCandidates: 10,
    minimumAttendeePercentage: 100,
  };

  return graphRequest(
    'POST',
    `/users/${SERVICE_ACCOUNT_EMAIL}/findMeetingTimes`,
    body,
    'app',
    { Prefer: 'outlook.timezone="Arab Standard Time"' }
  );
}

function logSuggestions(technicianName, isoDate, findMeetingTimesResult) {
  const suggestions = Array.isArray(findMeetingTimesResult?.meetingTimeSuggestions)
    ? findMeetingTimesResult.meetingTimeSuggestions
    : [];

  console.log(`findMeetingTimes returned ${suggestions.length} suggestion(s) for ${technicianName} on ${isoDate}:`);
  suggestions.forEach((suggestion, index) => {
    const start = suggestion.meetingTimeSlot?.start?.dateTime || 'unknown';
    const end = suggestion.meetingTimeSlot?.end?.dateTime || 'unknown';
    console.log(`  [${index}] start=${start} end=${end} confidence=${suggestion.confidence}`);
  });
}

function findValidSlot(findMeetingTimesResult, { requireConfidence = true } = {}) {
  const suggestions = Array.isArray(findMeetingTimesResult?.meetingTimeSuggestions)
    ? findMeetingTimesResult.meetingTimeSuggestions
    : [];

  const candidates = [];

  for (const suggestion of suggestions) {
    const confidence = Number(suggestion.confidence || 0);
    if (requireConfidence && confidence <= 0) continue;

    const start = suggestion.meetingTimeSlot?.start;
    const end = suggestion.meetingTimeSlot?.end;
    if (!start?.dateTime || !end?.dateTime) continue;

    const startMinutes = minutesSinceMidnight(start.dateTime);
    const endMinutes = minutesSinceMidnight(end.dateTime);
    if (startMinutes === null || endMinutes === null) continue;

    if (startMinutes < WORK_START_MINUTES || endMinutes > WORK_END_MINUTES) {
      continue;
    }

    candidates.push({ dateTime: start.dateTime, timeZone: start.timeZone || 'Arab Standard Time', startMinutes });
  }

  if (!candidates.length) {
    return null;
  }

  candidates.sort((a, b) => a.startMinutes - b.startMinutes);
  const earliest = candidates[0];
  return { dateTime: earliest.dateTime, timeZone: earliest.timeZone };
}

function buildFallbackSlot(isoDate, estimatedDurationHours) {
  const durationMinutes = Math.round(Number(estimatedDurationHours || 1) * 60);
  const endMinutes = WORK_START_MINUTES + durationMinutes;
  if (endMinutes > WORK_END_MINUTES) {
    return null;
  }
  return { dateTime: `${isoDate}T${WORKING_HOURS_START}`, timeZone: 'Arab Standard Time' };
}

async function findAvailableTechnician(siteLocation, typeOfService, dueDate, estimatedDurationHours) {
  const eligibleResult = await pool.query(
    `SELECT * FROM technicians WHERE LOWER(type_of_service) = LOWER($1) ORDER BY open_task_count ASC`,
    [typeOfService]
  );

  const eligibleTechnicians = eligibleResult.rows;
  if (!eligibleTechnicians.length) {
    return null;
  }

  let candidateDate = parseDateValue(dueDate) || new Date();
  const originalIsoDate = isoDateOnly(candidateDate);

  for (let dayOffset = 0; dayOffset <= 3; dayOffset++) {
    if (dayOffset > 0) {
      const previousIsoDate = isoDateOnly(candidateDate);
      candidateDate = nextBusinessDay(candidateDate);
      console.log(`No technician available on ${previousIsoDate}, trying ${isoDateOnly(candidateDate)}`);
    }

    const isoDate = isoDateOnly(candidateDate);
    const availableCandidates = [];

    for (const technician of eligibleTechnicians) {
      try {
        const result = await checkTechnicianAvailability(technician.email, isoDate, estimatedDurationHours);
        logSuggestions(technician.name, isoDate, result);
        const slot = findValidSlot(result);

        if (slot) {
          console.log(`Technician ${technician.name} is AVAILABLE on ${isoDate} - slot found at ${slot.dateTime} (${slot.timeZone})`);
          availableCandidates.push({ technician, slot });
        } else {
          console.log(`Technician ${technician.name} is NOT AVAILABLE on ${isoDate} within working hours 07:30-16:30`);
        }
      } catch (error) {
        console.warn(`findMeetingTimes check failed for technician ${technician.name} (${technician.email}): ${error.message}`);
      }
    }

    if (availableCandidates.length > 0) {
      availableCandidates.sort((a, b) => a.technician.open_task_count - b.technician.open_task_count);
      const chosen = availableCandidates[0];
      const timeLabelMatch = /T(\d{2}:\d{2})/.exec(chosen.slot.dateTime || '');
      const timeLabel = timeLabelMatch ? timeLabelMatch[1] : chosen.slot.dateTime;
      console.log(`Found available slot on ${isoDate} at ${timeLabel} for ${chosen.technician.name}`);
      return {
        technician: chosen.technician,
        slotDateTime: chosen.slot.dateTime,
        slotTimeZone: chosen.slot.timeZone,
        slotDate: isoDate,
      };
    }

    const fallbackSlot = buildFallbackSlot(isoDate, estimatedDurationHours);
    if (fallbackSlot) {
      const fallbackTechnician = eligibleTechnicians[0];
      console.log(`No Graph-confirmed slot found on ${isoDate} for any technician - using unconstrained same-day fallback at ${WORKING_HOURS_START} for ${fallbackTechnician.name}`);
      return {
        technician: fallbackTechnician,
        slotDateTime: fallbackSlot.dateTime,
        slotTimeZone: fallbackSlot.timeZone,
        slotDate: isoDate,
      };
    }
  }

  console.warn('No free calendar slot found within working hours 07:30 to 16:30, assigning to least loaded technician');
  return {
    technician: eligibleTechnicians[0],
    slotDateTime: null,
    slotTimeZone: 'Arab Standard Time',
    slotDate: originalIsoDate,
  };
}

async function assignTaskAndNotify(workOrder, asset, technician, availability = {}) {
  const workOrderDueDate = asset.next_due_date;

  let plannerTaskId;
  try {
    plannerTaskId = await createPlannerTask(asset);
    await assignPlannerTask(plannerTaskId, technician);
  } catch (error) {
    console.error('Planner assignment error:', error.status, JSON.stringify(error.body));
    throw error;
  }

  await pool.query(
    `UPDATE work_orders SET status = 'open', technician_id = $1, planner_task_id = $2, due_date = $3 WHERE id = $4`,
    [technician.id, plannerTaskId, workOrderDueDate, workOrder.id]
  );

  await pool.query(
    `UPDATE technicians SET open_task_count = open_task_count + 1 WHERE id = $1`,
    [technician.id]
  );

  const emailBody = `New maintenance task created:\nEquipment: ${asset.equipment_name}\nSite: ${asset.site_location}\nTechnician: ${technician.name}\nDue date: ${workOrderDueDate}\nDuration: ${asset.estimated_duration_hours} hours`;
  try {
    await sendMail(MAINTENANCE_MANAGER_EMAIL, 'New Maintenance Task', emailBody, 'app');
  } catch (error) {
    console.warn('Email sending skipped and continue running');
  }

  const teamsBody = `New maintenance task created for <b>${asset.equipment_name}</b> at <b>${asset.site_location}</b>. Assigned to <b>${technician.name}</b>. Due <b>${workOrderDueDate}</b> for ${asset.estimated_duration_hours} hours.`;
  try {
    await postTeamsMessage(teamsBody);
  } catch (error) {
    console.error('Teams error:', error.status, JSON.stringify(error.body));
  }

  try {
    await createCalendarEvent(asset, technician, MAINTENANCE_MANAGER_EMAIL, workOrderDueDate, availability.slotDateTime);
  } catch (error) {
    console.warn('Calendar event skipped and continue running');
  }
  await logNotification(workOrder.id, 'task_created');
}

async function createTaskForWorkOrder(workOrderId) {
  const { rows } = await pool.query(
    `SELECT wo.*, a.id AS asset_id, a.equipment_name, a.site_location, a.maintenance_interval_days,
            a.estimated_duration_hours, a.type_of_service, a.next_due_date
     FROM work_orders wo
     JOIN assets a ON a.id = wo.asset_id
     WHERE wo.id = $1`,
    [workOrderId]
  );

  if (!rows.length) {
    throw new Error('Work order not found');
  }

  const workOrder = rows[0];
  const asset = {
    id: workOrder.asset_id,
    equipment_name: workOrder.equipment_name,
    site_location: workOrder.site_location,
    maintenance_interval_days: workOrder.maintenance_interval_days,
    estimated_duration_hours: workOrder.estimated_duration_hours,
    type_of_service: workOrder.type_of_service,
    next_due_date: workOrder.next_due_date,
  };

  const availability = await findAvailableTechnician(
    asset.site_location,
    asset.type_of_service,
    workOrder.due_date || asset.next_due_date,
    asset.estimated_duration_hours
  );

  if (!availability || !availability.technician) {
    throw new Error(`No matching technician found for asset ${asset.id}`);
  }

  const technician = availability.technician;
  await assignTaskAndNotify(workOrder, asset, technician, availability);
}

function getSendMailEndpoint(authType = 'delegated') {
  if (authType === 'delegated') {
    return '/me/sendMail';
  }
  return `/users/${SERVICE_ACCOUNT_EMAIL}/sendMail`;
}

async function sendMail(to, subject, content, authType = 'delegated') {
  const body = {
    message: {
      subject,
      body: {
        contentType: 'Text',
        content,
      },
      toRecipients: [
        {
          emailAddress: {
            address: to,
          },
        },
      ],
    },
    saveToSentItems: 'true',
  };

  await graphRequest('POST', getSendMailEndpoint(authType), body, authType);
}

async function postTeamsMessage(message) {
  const body = {
    body: {
      contentType: 'html',
      content: `<p>${message}</p>`,
    },
  };

  const token = await getDelegatedToken();
  const response = await fetch(`https://graph.microsoft.com/v1.0/teams/${TEAM_GROUP_ID}/channels/${TEAMS_CHANNEL_ID}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const responseText = await response.text();
  let json;

  try {
    json = responseText ? JSON.parse(responseText) : {};
  } catch (error) {
    throw new Error(`Graph response parse error: ${error.message}`);
  }

  if (!response.ok) {
    const messageText = json.error?.message || response.statusText;
    throw new Error(`Graph request failed: ${messageText}`);
  }

  return json;
}

function toGraphStartDateTime(dateValue, slotDateTime = null) {
  if (slotDateTime) {
    return slotDateTime.slice(0, 19);
  }

  if (!dateValue) return null;

  const date = dateValue instanceof Date ? dateValue : new Date(dateValue);
  if (Number.isNaN(date.getTime())) return null;

  const isoDate = date.toISOString().slice(0, 10);
  return `${isoDate}T09:00:00`;
}

function toGraphEndDateTime(startDateTime, durationHours = 1) {
  if (!startDateTime) return null;

  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/.exec(startDateTime);
  if (!match) return null;

  const [, isoDate, hourStr, minuteStr] = match;
  const startMinutes = Number(hourStr) * 60 + Number(minuteStr);
  const endMinutes = Math.min(startMinutes + Math.round(Number(durationHours || 1) * 60), WORK_END_MINUTES);
  const endHour = Math.floor(endMinutes / 60);
  const endMinute = endMinutes % 60;

  return `${isoDate}T${String(endHour).padStart(2, '0')}:${String(endMinute).padStart(2, '0')}:00`;
}

async function createCalendarEvent(asset, technician, managerEmail, dueDate = null, slotDateTime = null) {
  const startDateTime = toGraphStartDateTime(dueDate || asset.due_date || asset.next_due_date, slotDateTime);
  const endDateTime = toGraphEndDateTime(startDateTime, asset.estimated_duration_hours || 1);

  if (!startDateTime || !endDateTime) {
    throw new Error('Unable to build calendar event date/time');
  }

  const managerEventBody = {
    subject: `Maintenance: ${asset.equipment_name} - ${asset.site_location} (${technician.name})`,
    body: {
      contentType: 'Text',
      content: `Maintenance task for ${asset.equipment_name} at ${asset.site_location}. Assigned to ${technician.name}. Estimated duration: ${asset.estimated_duration_hours} hours.`,
    },
    start: {
      dateTime: startDateTime,
      timeZone: 'Asia/Bahrain',
    },
    end: {
      dateTime: endDateTime,
      timeZone: 'Asia/Bahrain',
    },
  };

  const technicianEventBody = {
    subject: `Maintenance Task: ${asset.equipment_name} - ${asset.site_location}`,
    body: {
      contentType: 'Text',
      content: `Maintenance task for ${asset.equipment_name} at ${asset.site_location}. Technician: ${technician.name}. Estimated duration: ${asset.estimated_duration_hours} hours.`,
    },
    start: {
      dateTime: startDateTime,
      timeZone: 'Asia/Bahrain',
    },
    end: {
      dateTime: endDateTime,
      timeZone: 'Asia/Bahrain',
    },
  };

  await graphRequest('POST', `/users/${encodeURIComponent(managerEmail)}/events`, managerEventBody, 'app');
  await graphRequest('POST', `/users/${encodeURIComponent(technician.email)}/events`, technicianEventBody, 'app');
}

async function logNotification(workOrderId, notificationType) {
  await pool.query(
    `INSERT INTO notification_log (work_order_id, notification_type) VALUES ($1, $2)`,
    [workOrderId, notificationType]
  );
}

async function runDailyCheck() {
  let tasksCreated = 0;

  const assetsResult = await pool.query(`
    SELECT * FROM assets
    WHERE next_due_date <= CURRENT_DATE + INTERVAL '30 days'
      AND next_due_date IS NOT NULL
  `);

  for (const asset of assetsResult.rows) {
    console.log(`Checking asset: ${asset.equipment_name} - ${asset.site_location}`);

    const existingOrder = await pool.query(
      `SELECT id FROM work_orders WHERE asset_id = $1 AND status NOT IN ('completed', 'rejected') LIMIT 1`,
      [asset.id]
    );

    if (existingOrder.rows.length > 0) {
      console.log(`Asset ${asset.equipment_name} already has an open work order - skipping`);
      continue;
    }

    const availability = await findAvailableTechnician(
      asset.site_location,
      asset.type_of_service,
      asset.next_due_date,
      asset.estimated_duration_hours
    );

    if (!availability || !availability.technician) {
      console.warn(`No matching technician found for asset ${asset.id} at ${asset.site_location}`);
      continue;
    }

    const technician = availability.technician;
    const workOrderDueDate = asset.next_due_date;

    const plannerTaskId = await createPlannerTask(asset);
    await assignPlannerTask(plannerTaskId, technician);

    const workOrderResult = await pool.query(
      `INSERT INTO work_orders (status, asset_id, technician_id, planner_task_id, due_date)
       VALUES ('open', $1, $2, $3, $4)
       RETURNING *`,
      [asset.id, technician.id, plannerTaskId, workOrderDueDate]
    );

    const workOrder = workOrderResult.rows[0];
    tasksCreated++;

    await pool.query(
      `UPDATE technicians SET open_task_count = open_task_count + 1 WHERE id = $1`,
      [technician.id]
    );

    const emailBody = `New maintenance task created:\nEquipment: ${asset.equipment_name}\nSite: ${asset.site_location}\nTechnician: ${technician.name}\nDue date: ${workOrderDueDate}\nDuration: ${asset.estimated_duration_hours} hours`;
    try {
      await sendMail(MAINTENANCE_MANAGER_EMAIL, 'New Maintenance Task', emailBody, 'app');
    } catch (error) {
      console.warn('Email sending skipped and continue running');
    }

    const teamsBody = `New maintenance task created for <b>${asset.equipment_name}</b> at <b>${asset.site_location}</b>. Assigned to <b>${technician.name}</b>. Due <b>${workOrderDueDate}</b> for ${asset.estimated_duration_hours} hours.`;
    try {
      await postTeamsMessage(teamsBody);
    } catch (error) {
      console.warn('Teams message skipped and continue running');
    }

    try {
      await createCalendarEvent(asset, technician, MAINTENANCE_MANAGER_EMAIL, workOrderDueDate, availability.slotDateTime);
    } catch (error) {
      console.warn('Calendar event skipped and continue running');
    }

    await logNotification(workOrder.id, 'task_created');
  }

  const reminders = [
    { days: 7, type: 'reminder7' },
    { days: 3, type: 'reminder3' },
    { days: 1, type: 'reminder1' },
  ];

  for (const reminder of reminders) {
    const dueResult = await pool.query(
      `SELECT wo.*, a.equipment_name, a.site_location, a.estimated_duration_hours, t.name AS technician_name, t.email AS technician_email
       FROM work_orders wo
       JOIN assets a ON wo.asset_id = a.id
       JOIN technicians t ON wo.technician_id = t.id
       WHERE wo.status = 'open'
         AND wo.due_date = CURRENT_DATE + INTERVAL '${reminder.days} days'`,
    );

    for (const workOrder of dueResult.rows) {
      const existingReminder = await pool.query(
        `SELECT 1 FROM notification_log WHERE work_order_id = $1 AND notification_type = $2 LIMIT 1`,
        [workOrder.id, reminder.type]
      );

      if (existingReminder.rows.length > 0) continue;

      const emailBody = `Reminder: maintenance task for ${workOrder.equipment_name} at ${workOrder.site_location} is due in ${reminder.days} days. Technician: ${workOrder.technician_name}. Duration: ${workOrder.estimated_duration_hours} hours.`;
      try {
        await sendMail(workOrder.technician_email, `Maintenance Reminder (${reminder.days} days)`, emailBody, 'app');
      } catch (error) {
        console.warn('Email sending skipped and continue running');
      }
      await logNotification(workOrder.id, reminder.type);
    }
  }

  const overdueResult = await pool.query(`
    SELECT wo.*, a.equipment_name, a.site_location, a.estimated_duration_hours, t.name AS technician_name, t.email AS technician_email
    FROM work_orders wo
    JOIN assets a ON wo.asset_id = a.id
    JOIN technicians t ON wo.technician_id = t.id
    WHERE wo.status = 'open' AND wo.due_date < CURRENT_DATE
  `);

  for (const workOrder of overdueResult.rows) {
    const recentEscalation = await pool.query(
      `SELECT 1 FROM escalation_log WHERE work_order_id = $1 AND escalated_at >= CURRENT_DATE - INTERVAL '7 days' LIMIT 1`,
      [workOrder.id]
    );

    if (recentEscalation.rows.length > 0) continue;

    const emailBody = `Escalation: maintenance task for ${workOrder.equipment_name} at ${workOrder.site_location} is overdue. Technician: ${workOrder.technician_name}. Due date: ${workOrder.due_date}. Duration: ${workOrder.estimated_duration_hours} hours.`;
    try {
      await sendMail(SENIOR_MANAGER_EMAIL, 'Escalated Overdue Maintenance Task', emailBody, 'app');
    } catch (error) {
      console.warn('Email sending skipped and continue running');
    }

      const teamsBody = `Escalation: overdue maintenance task for <b>${workOrder.equipment_name}</b> at <b>${workOrder.site_location}</b>. Technician: <b>${workOrder.technician_name}</b>. Due date: <b>${workOrder.due_date}</b>. Duration: ${workOrder.estimated_duration_hours} hours.`;
    try {
      await postTeamsMessage(teamsBody);
    } catch (error) {
      console.error('Teams error:', error.status, JSON.stringify(error.body));
    }

    await pool.query(
      `INSERT INTO escalation_log (work_order_id, escalated_to) VALUES ($1, $2)`,
      [workOrder.id, SENIOR_MANAGER_EMAIL]
    );
  }

  await pool.query(
    `INSERT INTO settings (key, value, updated_at) VALUES ('last_daily_check_run', NOW()::text, NOW())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at`
  );

  return { tasksCreated };
}

cron.schedule('0 6 * * *', async () => {
  try {
    await runDailyCheck();
  } catch (error) {
    console.error('Daily check failed:', error);
  }
});

module.exports = {
  runDailyCheck,
  createTaskForWorkOrder,
};
