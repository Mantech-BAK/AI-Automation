// Planner tasks for documents: create one for the responsible person, and keep its assignee in step when the
// responsible person is set or changed later. The task id lives on assets.planner_task_id (work_orders keeps the
// same id for the status tracker). The task is only ever assigned to the responsible person's own Graph user -
// never to the service account or MY_USER_ID; when that user can't be resolved the task is left unassigned.
const { pool } = require('../db');
const { graphRequest } = require('../graph/client');

const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

function formatDMY(dateStr) {
  const [year, month, day] = String(dateStr).split('-');
  return `${day}/${month}/${year}`;
}

// Looks up the Graph user id of a mailbox (app-only, needs User.Read.All). Null - with a warning - when it fails.
async function resolveGraphUserId(email) {
  if (!email) return null;
  try {
    const user = await graphRequest('GET', `/users/${encodeURIComponent(email)}`, null, 'app');
    if (user?.id) return user.id;
  } catch (error) {
    console.warn(`Could not resolve Graph user id for ${email}: ${error.message}`);
    return null;
  }
  console.warn(`Could not resolve Graph user id for ${email}: no id returned`);
  return null;
}

// The document plus the fields the task title/description need; expiry_date as YYYY-MM-DD text.
async function loadDocument(assetId) {
  const { rows } = await pool.query(
    `SELECT a.*, a.expiry_date::text AS expiry_date, at.name AS type_name
     FROM assets a JOIN asset_types at ON at.id = a.type_id
     WHERE a.id = $1 AND at.name = 'Document'`,
    [assetId]
  );
  return rows[0] || null;
}

// Creates the renewal task in the plan's first bucket. assigneeId null = unassigned.
async function createDocumentPlannerTask(doc, assigneeId) {
  const planId = process.env.PLANNER_PLAN_ID;
  const buckets = await graphRequest('GET', `/planner/plans/${planId}/buckets`, null, 'app');
  if (!buckets.value?.length) throw new Error(`No buckets found for planner plan ${planId}`);

  const dueDateTime = `${doc.expiry_date}T09:00:00Z`;
  const daysRemaining = Math.round((new Date(doc.expiry_date).getTime() - Date.now()) / 86400000);
  const result = await graphRequest(
    'POST',
    '/planner/tasks',
    {
      planId,
      bucketId: buckets.value[0].id,
      title: `Document Renewal Required - ${doc.equipment_name} (${doc.company_name || 'No company'}) - Expires ${formatDMY(doc.expiry_date)}`,
      startDateTime: dueDateTime,
      dueDateTime,
      assignments: assigneeId ? { [assigneeId]: { '@odata.type': 'microsoft.graph.plannerAssignment', orderHint: ' !' } } : {},
      details: {
        description: `Document type: ${doc.type_name || 'N/A'}\nCompany: ${doc.company_name || 'N/A'}\nResponsible: ${doc.responsible_person || 'N/A'}\nExpires: ${doc.expiry_date}\nDays remaining: ${daysRemaining} days`,
      },
    },
    'app'
  );
  return result.id;
}

// Moves a task to exactly one assignee (the old assignees are removed). Returns false when it already was.
async function reassignPlannerTask(taskId, assigneeId) {
  const task = await graphRequest('GET', `/planner/tasks/${taskId}`, null, 'app');
  const current = Object.keys(task.assignments || {});
  if (current.length === 1 && current[0] === assigneeId) return false;

  const assignments = { [assigneeId]: { '@odata.type': 'microsoft.graph.plannerAssignment', orderHint: ' !' } };
  for (const oldId of current) {
    if (oldId !== assigneeId) assignments[oldId] = null;
  }
  await graphRequest('PATCH', `/planner/tasks/${taskId}`, { assignments }, 'app', { 'If-Match': task['@odata.etag'] });
  return true;
}

// Brings the document's Planner task in line with its responsible person. Never throws.
//  - existing task  -> reassigned to the responsible person
//  - no task yet    -> created (and a work order recorded, as the daily check does) when the document is inside its
//                      reminder window; before that the daily check creates it, already assigned, when the time comes
// Returns { status: 'updated' | 'unchanged' | 'created' | 'skipped' | 'failed', reason? }.
async function syncDocumentPlannerTask(assetId) {
  try {
    const doc = await loadDocument(assetId);
    if (!doc) return { status: 'skipped', reason: 'document not found' };
    if (!doc.responsible_person) return { status: 'skipped', reason: 'no responsible person' };

    const email = String(doc.responsible_person).trim();
    if (!EMAIL_PATTERN.test(email)) {
      console.warn(`Planner sync skipped for "${doc.equipment_name}": responsible person "${email}" is not an email address`);
      return { status: 'skipped', reason: 'responsible person has no email' };
    }

    const ownAddress = String(process.env.SERVICE_ACCOUNT_EMAIL || '').toLowerCase();
    if (email.toLowerCase() === ownAddress) {
      return { status: 'skipped', reason: 'responsible person is the service account' };
    }

    const assigneeId = await resolveGraphUserId(email);

    // The task id: on the document, else on its open work order (older rows).
    let taskId = doc.planner_task_id;
    if (!taskId) {
      const open = await pool.query(
        `SELECT planner_task_id FROM work_orders
         WHERE asset_id = $1 AND task_type = 'document' AND status NOT IN ('completed', 'rejected') AND planner_task_id IS NOT NULL
         ORDER BY id DESC LIMIT 1`,
        [doc.id]
      );
      taskId = open.rows[0]?.planner_task_id || null;
    }

    if (taskId) {
      if (!assigneeId) return { status: 'failed', reason: `could not resolve Graph user for ${email}` };
      try {
        const changed = await reassignPlannerTask(taskId, assigneeId);
        await pool.query(`UPDATE assets SET planner_task_id = $1 WHERE id = $2 AND planner_task_id IS DISTINCT FROM $1`, [taskId, doc.id]);
        if (changed) console.log(`Planner task ${taskId} for "${doc.equipment_name}" reassigned to ${email}`);
        return { status: changed ? 'updated' : 'unchanged' };
      } catch (error) {
        if (error.status !== 404) throw error;
        console.warn(`Planner task ${taskId} for "${doc.equipment_name}" no longer exists - creating a new one`);
        taskId = null;
        await pool.query(`UPDATE assets SET planner_task_id = NULL WHERE id = $1`, [doc.id]);
      }
    }

    // No task yet: only inside the reminder window (the daily check's own rule), and only if no work order is open.
    const reminderDays = doc.reminder_days || 30;
    const daysRemaining = Math.round((new Date(doc.expiry_date).getTime() - Date.now()) / 86400000);
    if (!doc.expiry_date || daysRemaining > reminderDays) {
      return { status: 'skipped', reason: 'no Planner task yet - the daily check creates it when the reminder window opens' };
    }
    const openOrder = await pool.query(
      `SELECT 1 FROM work_orders WHERE asset_id = $1 AND status NOT IN ('completed', 'rejected') LIMIT 1`,
      [doc.id]
    );
    if (openOrder.rows.length > 0) return { status: 'skipped', reason: 'open work order without a Planner task' };

    if (!assigneeId) console.warn(`Creating Planner task for "${doc.equipment_name}" unassigned - Graph user for ${email} not found`);
    const newTaskId = await createDocumentPlannerTask(doc, assigneeId);
    await pool.query(`UPDATE assets SET planner_task_id = $1 WHERE id = $2`, [newTaskId, doc.id]);
    await pool.query(
      `INSERT INTO work_orders (status, asset_id, technician_id, planner_task_id, due_date, notes, task_type)
       VALUES ('open', $1, NULL, $2, $3, 'Document renewal task', 'document')`,
      [doc.id, newTaskId, doc.expiry_date]
    );
    console.log(`Planner task ${newTaskId} created for "${doc.equipment_name}" (${assigneeId ? email : 'unassigned'})`);
    return { status: 'created' };
  } catch (error) {
    console.error(`Planner sync failed for document ${assetId}:`, error.message, error.body ? JSON.stringify(error.body) : '');
    return { status: 'failed', reason: error.message };
  }
}

// One-time correction (guarded by a flag row): every document that already has a Planner task and a responsible
// person gets that task reassigned if its assignee differs. Not repeated, so later manual changes in Planner stay.
async function reconcileDocumentPlannerTasks() {
  await pool.query(`CREATE TABLE IF NOT EXISTS app_flags (key VARCHAR PRIMARY KEY, done_at TIMESTAMPTZ DEFAULT NOW())`);
  const flag = await pool.query(`SELECT 1 FROM app_flags WHERE key = 'document_planner_assignees_v1'`);
  if (flag.rows.length > 0) return;

  const { rows } = await pool.query(
    `SELECT a.id FROM assets a
     WHERE a.type_id = (SELECT id FROM asset_types WHERE name = 'Document') AND a.responsible_person IS NOT NULL
       AND (a.planner_task_id IS NOT NULL OR EXISTS (
         SELECT 1 FROM work_orders wo WHERE wo.asset_id = a.id AND wo.task_type = 'document'
           AND wo.status NOT IN ('completed', 'rejected') AND wo.planner_task_id IS NOT NULL))`
  );
  let failed = 0;
  for (const row of rows) {
    const result = await syncDocumentPlannerTask(row.id);
    if (result.status === 'failed') failed++;
    console.log(`Planner reconcile: document ${row.id} -> ${result.status}${result.reason ? ` (${result.reason})` : ''}`);
  }
  // A failure (e.g. Graph unreachable) leaves the flag unset so the next start tries again.
  if (failed > 0) return;
  await pool.query(`INSERT INTO app_flags (key) VALUES ('document_planner_assignees_v1') ON CONFLICT DO NOTHING`);
}

module.exports = { resolveGraphUserId, createDocumentPlannerTask, syncDocumentPlannerTask, reconcileDocumentPlannerTasks };
