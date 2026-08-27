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

function formatDateDDMMYYYY(dateStr) {
  if (!dateStr) return '';
  const [year, month, day] = String(dateStr).split('-');
  return `${day}/${month}/${year}`;
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

async function createPlannerTask(asset, overrides = {}) {
  const title = overrides.title || `${asset.equipment_name} - ${asset.site_location}`;
  const dueDateTime = overrides.dueDateTime || formatDateTime(asset.next_due_date, 9);
  const description = overrides.description || `Equipment: ${asset.equipment_name}\nSite: ${asset.site_location}\nDuration: ${asset.estimated_duration_hours} hours\nType of service: ${asset.type_of_service}`;
  const assigneeId = overrides.assigneeId || MY_USER_ID;
  const bucketId = await getPlannerBucketId(PLANNER_PLAN_ID);

  const body = {
    planId: PLANNER_PLAN_ID,
    bucketId,
    title,
    startDateTime: dueDateTime,
    dueDateTime,
    assignments: {
      [assigneeId]: {
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
  const recipients = (Array.isArray(to) ? to : [to]).filter(Boolean);

  const body = {
    message: {
      subject,
      body: {
        contentType: 'Text',
        content,
      },
      toRecipients: recipients.map((address) => ({
        emailAddress: { address },
      })),
    },
    saveToSentItems: 'true',
  };

  await graphRequest('POST', getSendMailEndpoint(authType), body, authType);
}

// Department-level notification recipients, configured via the Notification
// Config page. Falls back to MAINTENANCE_MANAGER_EMAIL when a department has
// no configured emails - this is for the notification email only, it has no
// effect on who the Planner task itself gets assigned to.
async function getDepartmentNotificationEmails(departmentName) {
  if (!departmentName) {
    return [MAINTENANCE_MANAGER_EMAIL];
  }

  const { rows } = await pool.query(
    `SELECT email FROM department_notification_emails WHERE LOWER(department_name) = LOWER($1)`,
    [departmentName]
  );

  if (rows.length > 0) {
    return rows.map((row) => row.email);
  }

  return [MAINTENANCE_MANAGER_EMAIL];
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

async function createCalendarEvent(asset, technician, managerEmail, dueDate = null, slotDateTime = null, overrides = {}) {
  const startDateTime = overrides.startDateTime || toGraphStartDateTime(dueDate || asset.due_date || asset.next_due_date, slotDateTime);
  const endDateTime = overrides.endDateTime || toGraphEndDateTime(startDateTime, asset.estimated_duration_hours || 1);

  if (!startDateTime || !endDateTime) {
    throw new Error('Unable to build calendar event date/time');
  }

  const timeZone = overrides.timeZone || 'Asia/Bahrain';

  if (overrides.singleRecipientEmail) {
    const singleEventBody = {
      subject: overrides.title || `${asset.equipment_name} - ${asset.site_location}`,
      body: {
        contentType: 'Text',
        content: overrides.description || `${asset.equipment_name} at ${asset.site_location}.`,
      },
      start: {
        dateTime: startDateTime,
        timeZone,
      },
      end: {
        dateTime: endDateTime,
        timeZone,
      },
    };

    await graphRequest('POST', `/users/${encodeURIComponent(overrides.singleRecipientEmail)}/events`, singleEventBody, 'app');
    return;
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
  let documentRemindersSent = 0;
  let errors = 0;

  // Self-healing schema: notification_log needs somewhere to stash the asset_id
  // for document reminders, since those notifications have no work_order_id.
  await pool.query(`ALTER TABLE notification_log ADD COLUMN IF NOT EXISTS notes TEXT;`);

  const assetsResult = await pool.query(`
    SELECT a.* FROM assets a
    JOIN asset_categories ac ON ac.id = a.category_id
    WHERE ac.name = 'Equipment'
      AND a.next_due_date <= CURRENT_DATE + INTERVAL '30 days'
      AND a.next_due_date IS NOT NULL
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

    const dueDate = new Date(asset.next_due_date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const daysRemaining = Math.round((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    const isDueOrOverdue = daysRemaining <= 0;

    if (!isDueOrOverdue) {
      // PRE-DUE: send a reminder and put a calendar hold on the due date, but
      // don't create the Planner task yet - technicians should only see it
      // on the day the work is actually due.
      try {
        const notes = JSON.stringify({ asset_id: asset.id });

        const alreadySent = await pool.query(
          `SELECT 1 FROM notification_log
           WHERE notification_type = 'equipment_reminder'
             AND notes = $1
             AND sent_at >= NOW() - INTERVAL '24 hours'
           LIMIT 1`,
          [notes]
        );

        if (alreadySent.rows.length > 0) {
          continue;
        }

        const reminderDescription = `Equipment: ${asset.equipment_name}\nSite: ${asset.site_location}\nDue date: ${asset.next_due_date}\nDays remaining: ${daysRemaining} days`;

        try {
          await createCalendarEvent(asset, null, null, null, null, {
            title: `Maintenance Due Soon - ${asset.equipment_name} - ${asset.site_location}`,
            description: reminderDescription,
            singleRecipientEmail: SERVICE_ACCOUNT_EMAIL,
            timeZone: 'Arab Standard Time',
            startDateTime: `${asset.next_due_date}T09:00:00`,
            endDateTime: `${asset.next_due_date}T10:00:00`,
          });
        } catch (calendarError) {
          console.warn(`Calendar event skipped for ${asset.equipment_name}:`, calendarError.message);
        }

        const emailBody = `Upcoming maintenance:\nEquipment: ${asset.equipment_name}\nSite: ${asset.site_location}\nDue date: ${asset.next_due_date}\nDays remaining: ${daysRemaining} days`;
        try {
          const departmentEmails = await getDepartmentNotificationEmails(asset.site_location);
          await sendMail(departmentEmails, `Maintenance Reminder - ${asset.equipment_name}`, emailBody, 'app');
        } catch (error) {
          console.warn('Email sending skipped and continue running');
        }

        await pool.query(
          `INSERT INTO notification_log (notification_type, work_order_id, notes) VALUES ($1, $2, $3)`,
          ['equipment_reminder', null, notes]
        );

        console.log(`Equipment reminder sent for ${asset.equipment_name}, due ${asset.next_due_date} (${daysRemaining} day(s) remaining)`);
      } catch (error) {
        console.error(`Equipment reminder failed for asset ${asset.id}:`, error.message);
        errors++;
      }

      continue;
    }

    // DUE TODAY OR OVERDUE: create the Planner task and assign a technician.
    const availability = await findAvailableTechnician(
      asset.site_location,
      asset.type_of_service,
      asset.next_due_date,
      asset.estimated_duration_hours
    );

    if (!availability || !availability.technician) {
      console.warn(`No matching technician found for asset ${asset.id} at ${asset.site_location}`);
      errors++;
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
      const departmentEmails = await getDepartmentNotificationEmails(asset.site_location);
      await sendMail(departmentEmails, 'New Maintenance Task', emailBody, 'app');
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

    await logNotification(workOrder.id, 'equipment_task_created');
  }

  // --- Document Renewal Check ---
  console.log('--- Document Renewal Check ---');

  const documentsResult = await pool.query(`
    SELECT a.*, at.name AS type_name
    FROM assets a
    JOIN asset_categories ac ON ac.id = a.category_id
    LEFT JOIN asset_types at ON at.id = a.type_id
    WHERE ac.name = 'Document'
      AND a.expiry_date IS NOT NULL
      AND a.expiry_date <= CURRENT_DATE + INTERVAL '90 days'
  `);

  for (const doc of documentsResult.rows) {
    try {
      const expiry = new Date(doc.expiry_date);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const daysRemaining = Math.round((expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      const isDueOrOverdue = daysRemaining <= 0;

      const notes = JSON.stringify({ asset_id: doc.id });
      const documentDescription = `Document type: ${doc.type_name || 'N/A'}\nDepartment: ${doc.site_location}\nResponsible: ${doc.responsible_person || 'N/A'}\nExpires: ${doc.expiry_date}\nDays remaining: ${daysRemaining} days`;

      if (!isDueOrOverdue) {
        // PRE-EXPIRY: send a reminder and put a calendar hold on the expiry
        // date, but don't create the Planner task yet.
        const alreadySent = await pool.query(
          `SELECT 1 FROM notification_log
           WHERE notification_type = 'document_reminder'
             AND notes = $1
             AND sent_at >= NOW() - INTERVAL '24 hours'
           LIMIT 1`,
          [notes]
        );

        if (alreadySent.rows.length > 0) {
          continue;
        }

        try {
          await createCalendarEvent(doc, null, null, null, null, {
            title: `Document Expiring Soon - ${doc.equipment_name} - ${doc.site_location}`,
            description: documentDescription,
            singleRecipientEmail: SERVICE_ACCOUNT_EMAIL,
            timeZone: 'Arab Standard Time',
            startDateTime: `${doc.expiry_date}T09:00:00`,
            endDateTime: `${doc.expiry_date}T10:00:00`,
          });
        } catch (calendarError) {
          console.warn(`Calendar event skipped for document ${doc.equipment_name}:`, calendarError.message);
        }

        const subject = `Document Renewal Reminder - ${doc.equipment_name} - ${doc.site_location}`;
        const emailBody = `Item: ${doc.equipment_name}\nDepartment: ${doc.site_location}\nExpiry date: ${doc.expiry_date}\n${daysRemaining} day(s) remaining\nResponsible person: ${doc.responsible_person || 'N/A'}`;

        try {
          const departmentEmails = await getDepartmentNotificationEmails(doc.site_location);
          await sendMail(departmentEmails, subject, emailBody, 'app');
        } catch (error) {
          console.warn('Email sending skipped and continue running');
        }

        const teamsBody = `<b>Document Renewal Reminder</b><br/>Item: ${doc.equipment_name}<br/>Department: ${doc.site_location}<br/>Expiry date: ${doc.expiry_date}<br/>${daysRemaining} day(s) remaining<br/>Responsible person: ${doc.responsible_person || 'N/A'}`;
        try {
          await postTeamsMessage(teamsBody);
        } catch (error) {
          console.warn('Teams message skipped (delegated auth not available) and continue running');
        }

        await pool.query(
          `INSERT INTO notification_log (notification_type, work_order_id, notes) VALUES ($1, $2, $3)`,
          ['document_reminder', null, notes]
        );

        console.log(`Document reminder sent for ${doc.equipment_name} expiring ${doc.expiry_date}`);
        documentRemindersSent++;
        continue;
      }

      // DUE / OVERDUE: create the Planner task, once.
      const alreadyCreated = await pool.query(
        `SELECT 1 FROM notification_log WHERE notification_type = 'document_task_created' AND notes = $1 LIMIT 1`,
        [notes]
      );

      if (alreadyCreated.rows.length > 0) {
        continue;
      }

      // Planner task + calendar event MUST run before the notification_log
      // insert below so a Graph failure is visible in the logs immediately,
      // rather than being masked by a notification that already "succeeded".
      try {
        await createPlannerTask(doc, {
          title: `Document Renewal Required - ${doc.equipment_name} (${doc.site_location}) - Expires ${formatDateDDMMYYYY(doc.expiry_date)}`,
          dueDateTime: `${doc.expiry_date}T09:00:00Z`,
          description: documentDescription,
          assigneeId: MY_USER_ID,
        });

        await createCalendarEvent(doc, null, null, null, null, {
          title: `Document Renewal - ${doc.equipment_name} - ${doc.site_location}`,
          description: documentDescription,
          singleRecipientEmail: SERVICE_ACCOUNT_EMAIL,
          timeZone: 'Arab Standard Time',
          startDateTime: `${doc.expiry_date}T09:00:00`,
          endDateTime: `${doc.expiry_date}T10:00:00`,
        });

        console.log(`Created Planner task and calendar event for document: ${doc.equipment_name} expiring ${doc.expiry_date}`);
      } catch (graphError) {
        console.error(`Planner task / calendar event creation failed for document ${doc.equipment_name}:`, graphError.message);
        errors++;
      }

      await pool.query(
        `INSERT INTO notification_log (notification_type, work_order_id, notes) VALUES ($1, $2, $3)`,
        ['document_task_created', null, notes]
      );

      const daysLabel = daysRemaining === 0 ? 'due today' : `${Math.abs(daysRemaining)} day(s) overdue`;
      const subject = `Document Renewal Reminder - ${doc.equipment_name} - ${doc.site_location}`;
      const emailBody = `Item: ${doc.equipment_name}\nDepartment: ${doc.site_location}\nExpiry date: ${doc.expiry_date}\n${daysLabel}\nResponsible person: ${doc.responsible_person || 'N/A'}`;

      try {
        const departmentEmails = await getDepartmentNotificationEmails(doc.site_location);
        await sendMail(departmentEmails, subject, emailBody, 'app');
      } catch (error) {
        console.warn('Email sending skipped and continue running');
      }

      const teamsBody = `<b>Document Renewal Reminder</b><br/>Item: ${doc.equipment_name}<br/>Department: ${doc.site_location}<br/>Expiry date: ${doc.expiry_date}<br/>${daysLabel}<br/>Responsible person: ${doc.responsible_person || 'N/A'}`;
      try {
        await postTeamsMessage(teamsBody);
      } catch (error) {
        console.warn('Teams message skipped (delegated auth not available) and continue running');
      }

      console.log(`Document reminder sent for ${doc.equipment_name} expiring ${doc.expiry_date}`);
      documentRemindersSent++;
    } catch (error) {
      console.error(`Document renewal check failed for asset ${doc.id}:`, error.message);
      errors++;
    }
  }

  const reminders = [
    { days: 7, type: 'reminder7' },
    { days: 3, type: 'reminder3' },
    { days: 1, type: 'reminder1' },
  ];

  for (const reminder of reminders) {
    const dueResult = await pool.query(
      `SELECT wo.*, a.equipment_name, a.site_location, a.estimated_duration_hours, t.name AS technician_name, t.email AS technician_email, t.notification_email AS technician_notification_email
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

      const recipientEmail = workOrder.technician_notification_email || workOrder.technician_email;
      const emailBody = `Reminder: maintenance task for ${workOrder.equipment_name} at ${workOrder.site_location} is due in ${reminder.days} days. Technician: ${workOrder.technician_name}. Duration: ${workOrder.estimated_duration_hours} hours.`;
      try {
        await sendMail(recipientEmail, `Maintenance Reminder (${reminder.days} days)`, emailBody, 'app');
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

  console.log(`Daily check summary — Equipment tasks created: ${tasksCreated}, Document reminders sent: ${documentRemindersSent}, Errors: ${errors}`);

  return { tasksCreated, documentRemindersSent, errors };
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
