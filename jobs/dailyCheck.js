const path = require('path');
const dotenv = require('dotenv');
const cron = require('node-cron');
const { pool } = require('../db');
const { getAppOnlyToken, graphRequest } = require('../graph/client');

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
  const description = `Equipment: ${asset.equipment_name}\nSite: ${asset.site_location}\nDuration: ${asset.estimated_duration_hours} hours\nSkill required: ${asset.skill_type_required}`;
  const bucketId = await getPlannerBucketId(PLANNER_PLAN_ID);

  const body = {
    planId: PLANNER_PLAN_ID,
    bucketId,
    title,
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

async function assignTaskAndNotify(workOrder, asset, technician) {
  let plannerTaskId;
  try {
    plannerTaskId = await createPlannerTask(asset);
    await assignPlannerTask(plannerTaskId, technician);
  } catch (error) {
    console.error('Planner assignment error:', error.status, JSON.stringify(error.body));
    throw error;
  }

  await pool.query(
    `UPDATE work_orders SET status = 'open', technician_id = $1, planner_task_id = $2 WHERE id = $3`,
    [technician.id, plannerTaskId, workOrder.id]
  );

  await pool.query(
    `UPDATE technicians SET open_task_count = open_task_count + 1 WHERE id = $1`,
    [technician.id]
  );

  const emailBody = `New maintenance task created:\nEquipment: ${asset.equipment_name}\nSite: ${asset.site_location}\nTechnician: ${technician.name}\nDue date: ${asset.next_due_date}\nDuration: ${asset.estimated_duration_hours} hours`;
  try {
    await sendMail(MAINTENANCE_MANAGER_EMAIL, 'New Maintenance Task', emailBody, 'app');
  } catch (error) {
    console.warn('Email sending skipped and continue running');
  }

  const teamsBody = `New maintenance task created for <b>${asset.equipment_name}</b> at <b>${asset.site_location}</b>. Assigned to <b>${technician.name}</b>. Due <b>${asset.next_due_date}</b> for ${asset.estimated_duration_hours} hours.`;
  try {
    await postTeamsMessage(teamsBody);
  } catch (error) {
    console.error('Teams error:', error.status, JSON.stringify(error.body));
  }

  try {
    await createCalendarEvent(asset, technician, MAINTENANCE_MANAGER_EMAIL, workOrder.due_date || asset.next_due_date);
  } catch (error) {
    console.warn('Calendar event skipped and continue running');
  }
  await logNotification(workOrder.id, 'task_created');
}

async function createTaskForWorkOrder(workOrderId) {
  const { rows } = await pool.query(
    `SELECT wo.*, a.id AS asset_id, a.equipment_name, a.site_location, a.maintenance_interval_days,
            a.estimated_duration_hours, a.skill_type_required, a.next_due_date
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
    skill_type_required: workOrder.skill_type_required,
    next_due_date: workOrder.next_due_date,
  };

  const techResult = await pool.query(
    `SELECT * FROM technicians WHERE site = $1 AND LOWER(skill_type) = LOWER($2) ORDER BY open_task_count ASC LIMIT 1`,
    [asset.site_location, asset.skill_type_required]
  );

  if (!techResult.rows.length) {
    throw new Error(`No matching technician found for asset ${asset.id}`);
  }

  const technician = techResult.rows[0];
  await assignTaskAndNotify(workOrder, asset, technician);
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

  const token = await getAppOnlyToken();
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

function toGraphDateTime(dateValue) {
  if (!dateValue) return null;

  const date = dateValue instanceof Date ? dateValue : new Date(dateValue);
  if (Number.isNaN(date.getTime())) return null;

  const isoDate = date.toISOString().slice(0, 10);
  return `${isoDate}T09:00:00`;
}

function toGraphDateTimeEnd(dateValue, durationHours = 1) {
  if (!dateValue) return null;

  const date = dateValue instanceof Date ? dateValue : new Date(dateValue);
  if (Number.isNaN(date.getTime())) return null;

  const isoDate = date.toISOString().slice(0, 10);
  const startHour = 9;
  const endHour = startHour + Number(durationHours || 1);
  return `${isoDate}T${String(endHour).padStart(2, '0')}:00:00`;
}

async function createCalendarEvent(asset, technician, managerEmail, dueDate = null) {
  const startDateTime = toGraphDateTime(dueDate || asset.due_date || asset.next_due_date);
  const endDateTime = toGraphDateTimeEnd(dueDate || asset.due_date || asset.next_due_date, asset.estimated_duration_hours || 1);

  if (!startDateTime || !endDateTime) {
    throw new Error('Unable to build calendar event date/time');
  }

  const body = {
    subject: `Maintenance: ${asset.equipment_name}`,
    body: {
      contentType: 'Text',
      content: `Maintenance task for ${asset.equipment_name} at ${asset.site_location}. Assigned to ${technician.name}.`,
    },
    start: {
      dateTime: startDateTime,
      timeZone: 'Asia/Bahrain',
    },
    end: {
      dateTime: endDateTime,
      timeZone: 'Asia/Bahrain',
    },
    attendees: [
      {
        emailAddress: {
          address: technician.email,
          name: technician.name,
        },
        type: 'Required',
      },
      {
        emailAddress: {
          address: managerEmail,
          name: 'Maintenance Manager',
        },
        type: 'Required',
      },
    ],
  };

  await graphRequest('POST', `/users/${SERVICE_ACCOUNT_EMAIL}/events`, body, 'app');
}

async function logNotification(workOrderId, notificationType) {
  await pool.query(
    `INSERT INTO notification_log (work_order_id, notification_type) VALUES ($1, $2)`,
    [workOrderId, notificationType]
  );
}

async function runDailyCheck() {
  const assetsResult = await pool.query(`
    SELECT * FROM assets
    WHERE next_due_date <= CURRENT_DATE + INTERVAL '30 days'
      AND next_due_date IS NOT NULL
  `);

  for (const asset of assetsResult.rows) {
    const existingOrder = await pool.query(
      `SELECT 1 FROM work_orders WHERE asset_id = $1 AND status = 'open' LIMIT 1`,
      [asset.id]
    );

    if (existingOrder.rows.length > 0) {
      continue;
    }

    const techResult = await pool.query(
      `SELECT * FROM technicians WHERE site = $1 AND LOWER(skill_type) = LOWER($2) ORDER BY open_task_count ASC LIMIT 1`,
      [asset.site_location, asset.skill_type_required]
    );

    if (techResult.rows.length === 0) {
      console.warn(`No matching technician found for asset ${asset.id} at ${asset.site_location}`);
      continue;
    }

    const technician = techResult.rows[0];

    const plannerTaskId = await createPlannerTask(asset);
    await assignPlannerTask(plannerTaskId, technician);

    const workOrderResult = await pool.query(
      `INSERT INTO work_orders (status, asset_id, technician_id, planner_task_id, due_date)
       VALUES ('open', $1, $2, $3, $4)
       RETURNING *`,
      [asset.id, technician.id, plannerTaskId, asset.next_due_date]
    );

    const workOrder = workOrderResult.rows[0];

    await pool.query(
      `UPDATE technicians SET open_task_count = open_task_count + 1 WHERE id = $1`,
      [technician.id]
    );

    const emailBody = `New maintenance task created:\nEquipment: ${asset.equipment_name}\nSite: ${asset.site_location}\nTechnician: ${technician.name}\nDue date: ${asset.next_due_date}\nDuration: ${asset.estimated_duration_hours} hours`;
    try {
      await sendMail(MAINTENANCE_MANAGER_EMAIL, 'New Maintenance Task', emailBody, 'app');
    } catch (error) {
      console.warn('Email sending skipped and continue running');
    }

    const teamsBody = `New maintenance task created for <b>${asset.equipment_name}</b> at <b>${asset.site_location}</b>. Assigned to <b>${technician.name}</b>. Due <b>${asset.next_due_date}</b> for ${asset.estimated_duration_hours} hours.`;
    try {
      await postTeamsMessage(teamsBody);
    } catch (error) {
      console.warn('Teams message skipped and continue running');
    }

    try {
      await createCalendarEvent(asset, technician, MAINTENANCE_MANAGER_EMAIL, asset.next_due_date);
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
