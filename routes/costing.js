const express = require('express');
const { pool } = require('../db');
const { calcSheet, formatQuotationRef, baseQuotationRef } = require('../utils/costing');

const router = express.Router();

const SECTIONS = ['ST1', 'ST2', 'ST3', 'ST4'];
const ENQUIRY_STATUSES = ['open', 'in_progress', 'costing_done', 'approved', 'rejected', 'closed'];
const TASK_STATUSES = ['pending', 'in_progress', 'completed'];

const clean = (value) => {
  const text = value === null || value === undefined ? '' : String(value).trim();
  return text || null;
};
const toId = (value) => {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
};
const toNumberOrNull = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};
const bahrainParts = () => {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bahrain', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date()).map((p) => [p.type, p.value])
  );
  return { year: Number(parts.year), today: `${parts.year}-${parts.month}-${parts.day}` };
};
const addDays = (isoDate, days) => {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

// ------------------------------------------------------------------ session user + RBAC

const USER_SELECT = `
  SELECT u.id, u.name, u.email, u.role_id, u.department_id, u.manager_id, u.is_active,
         r.name AS role_name, r.level AS role_level, d.name AS department_name, m.name AS manager_name
  FROM mas_users u
  JOIN roles r ON r.id = u.role_id
  LEFT JOIN departments d ON d.id = u.department_id
  LEFT JOIN mas_users m ON m.id = u.manager_id`;

// Everyone below `userId` in the manager_id chain (including the user).
async function subtreeIds(userId) {
  const { rows } = await pool.query(
    `WITH RECURSIVE sub AS (
       SELECT id FROM mas_users WHERE id = $1
       UNION
       SELECT u.id FROM mas_users u JOIN sub ON u.manager_id = sub.id
     ) SELECT id FROM sub`,
    [userId]
  );
  return rows.map((row) => row.id);
}

// Director / General Manager (level 4+) see everything; a Manager (level 3) sees their own and everyone under
// them; every other role sees only their own records.
async function loadMasUser(req, res, next) {
  try {
    const id = req.session?.masUserId;
    if (!id) return res.status(401).json({ error: 'Select your name to continue', needsLogin: true });
    const { rows } = await pool.query(`${USER_SELECT} WHERE u.id = $1`, [id]);
    const user = rows[0];
    if (!user || !user.is_active) {
      delete req.session.masUserId;
      return res.status(401).json({ error: 'That user is not active - select your name again', needsLogin: true });
    }
    const level = Number(user.role_level);
    const scope = level >= 4 ? { all: true, ids: [] } : level === 3 ? { all: false, ids: await subtreeIds(user.id) } : { all: false, ids: [user.id] };
    req.masUser = { ...user, role_level: level };
    req.scope = scope;
    const idSet = new Set(scope.ids);
    // True when the logged-in user owns the resource, manages its owner (directly or further up), or is Director/GM.
    req.canView = (ownerId) => scope.all || (ownerId !== null && ownerId !== undefined && idSet.has(Number(ownerId)));
    return next();
  } catch (error) {
    console.error('Costing auth failed:', error);
    return res.status(500).json({ error: 'Failed to load your costing profile' });
  }
}

const isManagerOrAbove = (user) => user.role_level >= 3;
const isGmOrAbove = (user) => user.role_level >= 4;

// ------------------------------------------------------------------ login (public within the MAS session)

router.get('/login-users', async (req, res) => {
  if (!req.session?.user) return res.status(401).json({ error: 'Unauthorized' });
  const { rows } = await pool.query(`${USER_SELECT} WHERE u.is_active ORDER BY r.level DESC, u.name`);
  return res.json(rows);
});

router.post('/login', async (req, res) => {
  if (!req.session?.user) return res.status(401).json({ error: 'Unauthorized' });
  const id = toId(req.body?.user_id);
  if (!id) return res.status(400).json({ error: 'user_id is required' });
  const { rows } = await pool.query(`${USER_SELECT} WHERE u.id = $1 AND u.is_active`, [id]);
  if (rows.length === 0) return res.status(404).json({ error: 'User not found' });
  req.session.masUserId = id;
  return res.json({ user: rows[0] });
});

router.post('/logout', (req, res) => {
  if (req.session) delete req.session.masUserId;
  return res.json({ success: true });
});

router.use((req, res, next) => {
  if (!req.session?.user) return res.status(401).json({ error: 'Unauthorized' });
  return next();
});

// ------------------------------------------------------------------ home page counts
// Plain { count } endpoints for the module-selection page. They only need the MAS login, not a selected costing
// user, so the home page works before anyone has opened Costing. Enquiry/sheet counts are organisation-wide.

const countOf = (sql) => async (req, res) => {
  try {
    return res.json({ count: Number((await pool.query(sql)).rows[0].count) });
  } catch (error) {
    console.error('Costing count failed:', req.path, error.message);
    return res.status(500).json({ error: 'Failed to load count' });
  }
};

router.get('/enquiries/open-count', countOf(`SELECT COUNT(*) AS count FROM enquiries WHERE status IN ('open', 'in_progress')`));
router.get('/sheets/awaiting-approval', countOf(`SELECT COUNT(*) AS count FROM costing_sheets WHERE status = 'submitted' AND is_latest`));
router.get('/sheets/approved-this-month', countOf(
  `SELECT COUNT(*) AS count FROM costing_sheets WHERE status = 'approved'
   AND reviewed_at >= date_trunc('month', NOW() AT TIME ZONE 'Asia/Bahrain') AT TIME ZONE 'Asia/Bahrain'`
));

// "Me" = the selected costing user, else the costing user whose e-mail matches the signed-in MAS user.
router.get('/tasks/my-pending', async (req, res) => {
  try {
    let id = req.session.masUserId;
    if (!id && req.session.user.email) {
      id = (await pool.query('SELECT id FROM mas_users WHERE is_active AND LOWER(email) = LOWER($1) LIMIT 1', [req.session.user.email])).rows[0]?.id;
    }
    if (!id) return res.json({ count: 0 });
    const { rows } = await pool.query(`SELECT COUNT(*) AS count FROM enquiry_tasks WHERE assigned_to = $1 AND status <> 'completed'`, [id]);
    return res.json({ count: Number(rows[0].count) });
  } catch (error) {
    console.error('Costing count failed:', req.path, error.message);
    return res.status(500).json({ error: 'Failed to load count' });
  }
});

router.get('/me', loadMasUser, (req, res) => res.json({ user: req.masUser }));

// Everything below needs a selected costing user.
router.use(loadMasUser);

// ------------------------------------------------------------------ lookups

router.get('/departments', async (req, res) => {
  const { rows } = await pool.query('SELECT id, name FROM departments ORDER BY id');
  return res.json(rows);
});

router.get('/roles', async (req, res) => {
  const { rows } = await pool.query('SELECT id, name, level FROM roles ORDER BY level DESC');
  return res.json(rows);
});

// Who the logged-in user may assign an enquiry to: Director/GM anyone, a Manager their team, everyone else only themselves.
async function assignableUsers(me) {
  if (isGmOrAbove(me)) return (await pool.query(`${USER_SELECT} WHERE u.is_active ORDER BY u.name`)).rows;
  if (isManagerOrAbove(me)) {
    const ids = await subtreeIds(me.id);
    return (await pool.query(`${USER_SELECT} WHERE u.is_active AND u.id = ANY($1) ORDER BY u.name`, [ids])).rows;
  }
  return (await pool.query(`${USER_SELECT} WHERE u.id = $1`, [me.id])).rows;
}

router.get('/lookup', async (req, res) => {
  const [departments, assignable, salesmen] = await Promise.all([
    pool.query('SELECT id, name FROM departments ORDER BY id'),
    assignableUsers(req.masUser),
    pool.query(`${USER_SELECT} WHERE u.is_active ORDER BY u.name`),
  ]);
  return res.json({ departments: departments.rows, assignable, salesmen: salesmen.rows });
});

// ------------------------------------------------------------------ notifications

async function notify(client, userId, message, link) {
  if (!userId) return;
  await client.query('INSERT INTO mas_notifications (user_id, message, link) VALUES ($1, $2, $3)', [userId, message, link]);
}

router.get('/notifications', async (req, res) => {
  const { rows } = await pool.query('SELECT id, message, link, is_read, created_at FROM mas_notifications WHERE user_id = $1 ORDER BY id DESC LIMIT 50', [req.masUser.id]);
  const unread = (await pool.query('SELECT COUNT(*)::int AS count FROM mas_notifications WHERE user_id = $1 AND NOT is_read', [req.masUser.id])).rows[0].count;
  return res.json({ unread, notifications: rows });
});

router.put('/notifications/:id/read', async (req, res) => {
  const { rows } = await pool.query('UPDATE mas_notifications SET is_read = TRUE WHERE id = $1 AND user_id = $2 RETURNING id', [req.params.id, req.masUser.id]);
  if (rows.length === 0) return res.status(404).json({ error: 'Notification not found' });
  return res.json({ success: true });
});

router.put('/notifications-read-all', async (req, res) => {
  await pool.query('UPDATE mas_notifications SET is_read = TRUE WHERE user_id = $1', [req.masUser.id]);
  return res.json({ success: true });
});

// ------------------------------------------------------------------ enquiries

const ENQUIRY_SELECT = `
  SELECT e.*, d.name AS department_name, a.name AS assigned_to_name, s.name AS salesman_name, c.name AS created_by_name,
         (SELECT cs.id FROM costing_sheets cs WHERE cs.enquiry_id = e.id AND cs.is_latest ORDER BY cs.id DESC LIMIT 1) AS latest_sheet_id,
         (SELECT cs.status FROM costing_sheets cs WHERE cs.enquiry_id = e.id AND cs.is_latest ORDER BY cs.id DESC LIMIT 1) AS latest_sheet_status
  FROM enquiries e
  LEFT JOIN departments d ON d.id = e.department_id
  LEFT JOIN mas_users a ON a.id = e.assigned_to
  LEFT JOIN mas_users s ON s.id = e.salesman_id
  LEFT JOIN mas_users c ON c.id = e.created_by`;

// An enquiry is visible when its assignee, creator or salesman is within the user's reach.
const canViewEnquiry = (req, enquiry) => req.canView(enquiry.assigned_to) || req.canView(enquiry.created_by) || req.canView(enquiry.salesman_id);

function enquiryScopeSql(req, params) {
  if (req.scope.all) return null;
  params.push(req.scope.ids);
  const n = params.length;
  return `(e.assigned_to = ANY($${n}) OR e.created_by = ANY($${n}) OR e.salesman_id = ANY($${n}))`;
}

async function loadEnquiry(req, res) {
  const id = toId(req.params.id);
  const { rows } = id ? await pool.query(`${ENQUIRY_SELECT} WHERE e.id = $1`, [id]) : { rows: [] };
  if (rows.length === 0) { res.status(404).json({ error: 'Enquiry not found' }); return null; }
  if (!canViewEnquiry(req, rows[0])) { res.status(403).json({ error: "You don't have access to this enquiry" }); return null; }
  return rows[0];
}

router.get('/enquiries', async (req, res) => {
  try {
    const params = [];
    const conditions = [];
    const scope = enquiryScopeSql(req, params);
    if (scope) conditions.push(scope);
    if (req.query.status) { params.push(req.query.status); conditions.push(`e.status = $${params.length}`); }
    if (toId(req.query.department_id)) { params.push(toId(req.query.department_id)); conditions.push(`e.department_id = $${params.length}`); }
    if (toId(req.query.assigned_to)) { params.push(toId(req.query.assigned_to)); conditions.push(`e.assigned_to = $${params.length}`); }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const { rows } = await pool.query(`${ENQUIRY_SELECT} ${where} ORDER BY e.id DESC`, params);
    return res.json(rows);
  } catch (error) {
    console.error('Enquiries query failed:', error);
    return res.status(500).json({ error: 'Failed to load enquiries' });
  }
});

async function validateEnquiryBody(req, body) {
  if (!clean(body.client_name) || !clean(body.project_name)) return 'Client name and project name are required';
  if (!toId(body.department_id)) return 'Department is required';
  const assignedTo = toId(body.assigned_to) || req.masUser.id;
  const allowed = await assignableUsers(req.masUser);
  if (!allowed.some((user) => user.id === assignedTo)) return "You can't assign an enquiry to that user";
  if (body.status !== undefined && !ENQUIRY_STATUSES.includes(body.status)) return `Status must be one of ${ENQUIRY_STATUSES.join(', ')}`;
  return null;
}

// ENQ-2026-001: next number of the Bahrain year, serialised so two people never get the same one.
async function nextEnquiryNo(client, year) {
  await client.query('SELECT pg_advisory_xact_lock(7001)');
  const prefix = `ENQ-${year}-`;
  const { rows } = await client.query(
    `SELECT COALESCE(MAX(SUBSTRING(enquiry_no FROM '[0-9]+$')::int), 0) AS max FROM enquiries WHERE enquiry_no LIKE $1`,
    [`${prefix}%`]
  );
  return `${prefix}${String(Number(rows[0].max) + 1).padStart(3, '0')}`;
}

router.post('/enquiries', async (req, res) => {
  const body = req.body || {};
  const problem = await validateEnquiryBody(req, body);
  if (problem) return res.status(400).json({ error: problem });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { year, today } = bahrainParts();
    const enquiryNo = await nextEnquiryNo(client, year);
    const assignedTo = toId(body.assigned_to) || req.masUser.id;
    const submission = clean(body.submission_date);
    const { rows } = await client.query(
      `INSERT INTO enquiries (enquiry_no, client_name, project_name, project_location, consultant, main_contractor, department_id, assigned_to,
         salesman_id, submission_date, estimated_value, status, notes, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'open', $12, $13) RETURNING id`,
      [enquiryNo, clean(body.client_name), clean(body.project_name), clean(body.project_location), clean(body.consultant), clean(body.main_contractor),
        toId(body.department_id), assignedTo, toId(body.salesman_id), submission, toNumberOrNull(body.estimated_value), clean(body.notes), req.masUser.id]
    );
    const enquiryId = rows[0].id;

    // Default to-dos: prepare the sheet two days before the deadline, send it for review one day before.
    const base = submission || addDays(today, 7);
    const defaults = [
      ['Prepare Costing Sheet', 'Prepare the costing sheet for this enquiry', addDays(base, -2)],
      ['Submit for Review', 'Submit the costing sheet to your manager for approval', addDays(base, -1)],
    ];
    for (const [title, description, due] of defaults) {
      await client.query('INSERT INTO enquiry_tasks (enquiry_id, assigned_to, task_title, description, due_date) VALUES ($1, $2, $3, $4, $5)', [enquiryId, assignedTo, title, description, due]);
    }
    if (assignedTo !== req.masUser.id) {
      await notify(client, assignedTo, `${req.masUser.name} assigned you a new enquiry: ${clean(body.project_name)} (${enquiryNo})`, `/costing/enquiries/${enquiryId}`);
    }
    await client.query('COMMIT');
    const { rows: created } = await pool.query(`${ENQUIRY_SELECT} WHERE e.id = $1`, [enquiryId]);
    return res.status(201).json(created[0]);
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Create enquiry failed:', error);
    return res.status(500).json({ error: 'Failed to create enquiry' });
  } finally {
    client.release();
  }
});

router.get('/enquiries/:id', async (req, res) => {
  try {
    const enquiry = await loadEnquiry(req, res);
    if (!enquiry) return;
    const { rows: tasks } = await pool.query(
      `SELECT t.*, u.name AS assigned_to_name FROM enquiry_tasks t LEFT JOIN mas_users u ON u.id = t.assigned_to WHERE t.enquiry_id = $1 ORDER BY t.due_date NULLS LAST, t.id`,
      [enquiry.id]
    );
    const { rows: sheets } = await pool.query(
      `SELECT s.id, s.quotation_ref_no, s.revision_no, s.is_latest, s.status, s.rejection_comment, s.total_selling_amount, s.prepared_by, u.name AS prepared_by_name
       FROM costing_sheets s LEFT JOIN mas_users u ON u.id = s.prepared_by WHERE s.enquiry_id = $1 ORDER BY s.revision_no DESC, s.id DESC`,
      [enquiry.id]
    );
    return res.json({ enquiry, tasks, sheets });
  } catch (error) {
    console.error('Load enquiry failed:', error);
    return res.status(500).json({ error: 'Failed to load enquiry' });
  }
});

router.put('/enquiries/:id', async (req, res) => {
  try {
    const enquiry = await loadEnquiry(req, res);
    if (!enquiry) return;
    const body = req.body || {};
    const problem = await validateEnquiryBody(req, { ...enquiry, ...body });
    if (problem) return res.status(400).json({ error: problem });
    const { rows } = await pool.query(
      `UPDATE enquiries SET client_name = $1, project_name = $2, project_location = $3, consultant = $4, main_contractor = $5, department_id = $6,
         assigned_to = $7, salesman_id = $8, submission_date = $9, estimated_value = $10, status = $11, notes = $12, updated_at = NOW()
       WHERE id = $13 RETURNING id`,
      [clean(body.client_name), clean(body.project_name), clean(body.project_location), clean(body.consultant), clean(body.main_contractor), toId(body.department_id),
        toId(body.assigned_to) || enquiry.assigned_to, toId(body.salesman_id), clean(body.submission_date), toNumberOrNull(body.estimated_value),
        body.status || enquiry.status, clean(body.notes), enquiry.id]
    );
    const { rows: updated } = await pool.query(`${ENQUIRY_SELECT} WHERE e.id = $1`, [rows[0].id]);
    return res.json(updated[0]);
  } catch (error) {
    console.error('Update enquiry failed:', error);
    return res.status(500).json({ error: 'Failed to update enquiry' });
  }
});

router.delete('/enquiries/:id', async (req, res) => {
  try {
    const enquiry = await loadEnquiry(req, res);
    if (!enquiry) return;
    const { rows } = await pool.query(`SELECT 1 FROM costing_sheets WHERE enquiry_id = $1 AND status IN ('submitted', 'approved') LIMIT 1`, [enquiry.id]);
    if (rows.length > 0) return res.status(409).json({ error: 'An enquiry with a submitted or approved costing sheet cannot be deleted' });
    await pool.query('DELETE FROM enquiries WHERE id = $1', [enquiry.id]);
    return res.json({ success: true });
  } catch (error) {
    console.error('Delete enquiry failed:', error);
    return res.status(500).json({ error: 'Failed to delete enquiry' });
  }
});

// ------------------------------------------------------------------ tasks

const TASK_SELECT = `
  SELECT t.*, e.enquiry_no, e.project_name, e.client_name, e.assigned_to AS enquiry_assigned_to, e.created_by AS enquiry_created_by,
         e.salesman_id AS enquiry_salesman_id, u.name AS assigned_to_name
  FROM enquiry_tasks t JOIN enquiries e ON e.id = t.enquiry_id LEFT JOIN mas_users u ON u.id = t.assigned_to`;

router.get('/my-tasks', async (req, res) => {
  const { rows } = await pool.query(`${TASK_SELECT} WHERE t.assigned_to = $1 ORDER BY (t.status = 'completed'), t.due_date NULLS LAST, t.id`, [req.masUser.id]);
  return res.json(rows);
});

router.get('/enquiries/:id/tasks', async (req, res) => {
  const enquiry = await loadEnquiry(req, res);
  if (!enquiry) return;
  const { rows } = await pool.query(`${TASK_SELECT} WHERE t.enquiry_id = $1 ORDER BY t.due_date NULLS LAST, t.id`, [enquiry.id]);
  return res.json(rows);
});

router.post('/enquiries/:id/tasks', async (req, res) => {
  try {
    const enquiry = await loadEnquiry(req, res);
    if (!enquiry) return;
    const title = clean(req.body?.task_title);
    if (!title) return res.status(400).json({ error: 'Task title is required' });
    const assignee = toId(req.body?.assigned_to) || enquiry.assigned_to;
    const { rows } = await pool.query(
      `INSERT INTO enquiry_tasks (enquiry_id, assigned_to, task_title, description, due_date) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [enquiry.id, assignee, title, clean(req.body?.description), clean(req.body?.due_date)]
    );
    const { rows: created } = await pool.query(`${TASK_SELECT} WHERE t.id = $1`, [rows[0].id]);
    return res.status(201).json(created[0]);
  } catch (error) {
    console.error('Create task failed:', error);
    return res.status(500).json({ error: 'Failed to add task' });
  }
});

router.put('/tasks/:id', async (req, res) => {
  try {
    const { rows } = await pool.query(`${TASK_SELECT} WHERE t.id = $1`, [toId(req.params.id) || 0]);
    if (rows.length === 0) return res.status(404).json({ error: 'Task not found' });
    const task = rows[0];
    const reachable = req.canView(task.assigned_to) || req.canView(task.enquiry_assigned_to) || req.canView(task.enquiry_created_by) || req.canView(task.enquiry_salesman_id);
    if (!reachable) return res.status(403).json({ error: "You don't have access to this task" });
    const body = req.body || {};
    if (body.status !== undefined && !TASK_STATUSES.includes(body.status)) return res.status(400).json({ error: `Status must be one of ${TASK_STATUSES.join(', ')}` });
    await pool.query(
      `UPDATE enquiry_tasks SET status = COALESCE($1, status), task_title = COALESCE($2, task_title), description = COALESCE($3, description),
         due_date = COALESCE($4, due_date), assigned_to = COALESCE($5, assigned_to) WHERE id = $6`,
      [body.status ?? null, clean(body.task_title), clean(body.description), clean(body.due_date), toId(body.assigned_to), task.id]
    );
    const { rows: updated } = await pool.query(`${TASK_SELECT} WHERE t.id = $1`, [task.id]);
    return res.json(updated[0]);
  } catch (error) {
    console.error('Update task failed:', error);
    return res.status(500).json({ error: 'Failed to update task' });
  }
});

// ------------------------------------------------------------------ costing sheets

const SHEET_SELECT = `
  SELECT s.*, e.enquiry_no, e.assigned_to AS enquiry_assigned_to, e.status AS enquiry_status, d.name AS department_name,
         p.name AS prepared_by_name, p.manager_id AS preparer_manager_id, pm.name AS preparer_manager_name, r.name AS reviewed_by_name
  FROM costing_sheets s
  JOIN enquiries e ON e.id = s.enquiry_id
  LEFT JOIN departments d ON d.id = s.department_id
  LEFT JOIN mas_users p ON p.id = s.prepared_by
  LEFT JOIN mas_users pm ON pm.id = p.manager_id
  LEFT JOIN mas_users r ON r.id = s.reviewed_by`;

const canViewSheet = (req, sheet) => req.canView(sheet.prepared_by) || req.canView(sheet.enquiry_assigned_to);
const canEditSheet = (req, sheet) => sheet.is_latest && ['draft', 'rejected'].includes(sheet.status) && canViewSheet(req, sheet);
const canReviewSheet = (req, sheet) => sheet.status === 'submitted' && sheet.is_latest && sheet.preparer_manager_id === req.masUser.id;

const withFlags = (req, sheet) => ({ ...sheet, can_edit: canEditSheet(req, sheet), can_review: canReviewSheet(req, sheet) });

async function loadSheet(req, res) {
  const id = toId(req.params.id);
  const { rows } = id ? await pool.query(`${SHEET_SELECT} WHERE s.id = $1`, [id]) : { rows: [] };
  if (rows.length === 0) { res.status(404).json({ error: 'Costing sheet not found' }); return null; }
  if (!canViewSheet(req, rows[0])) { res.status(403).json({ error: "You don't have access to this costing sheet" }); return null; }
  return rows[0];
}

router.get('/sheets', async (req, res) => {
  try {
    const params = [];
    const conditions = [];
    if (!req.scope.all) {
      params.push(req.scope.ids);
      conditions.push(`(s.prepared_by = ANY($${params.length}) OR e.assigned_to = ANY($${params.length}))`);
    }
    if (req.query.status) { params.push(req.query.status); conditions.push(`s.status = $${params.length}`); }
    if (toId(req.query.enquiry_id)) { params.push(toId(req.query.enquiry_id)); conditions.push(`s.enquiry_id = $${params.length}`); }
    if (req.query.pending_approval === '1') {
      params.push(req.masUser.id);
      conditions.push(`s.status = 'submitted' AND s.is_latest AND p.manager_id = $${params.length}`);
    }
    if (req.query.latest === '1') conditions.push('s.is_latest');
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const { rows } = await pool.query(`${SHEET_SELECT} ${where} ORDER BY s.id DESC`, params);
    return res.json(rows.map((sheet) => withFlags(req, sheet)));
  } catch (error) {
    console.error('Sheets query failed:', error);
    return res.status(500).json({ error: 'Failed to load costing sheets' });
  }
});

router.get('/sheets/:id', async (req, res) => {
  try {
    const sheet = await loadSheet(req, res);
    if (!sheet) return;
    const { rows: lines } = await pool.query('SELECT * FROM costing_line_items WHERE costing_sheet_id = $1 ORDER BY section, sort_order, id', [sheet.id]);
    const { rows: revisions } = await pool.query(
      'SELECT id, quotation_ref_no, revision_no, status, is_latest FROM costing_sheets WHERE enquiry_id = $1 ORDER BY revision_no, id',
      [sheet.enquiry_id]
    );
    const { rows: enquiry } = await pool.query(`${ENQUIRY_SELECT} WHERE e.id = $1`, [sheet.enquiry_id]);
    return res.json({ sheet: withFlags(req, sheet), lines, revisions, enquiry: enquiry[0] });
  } catch (error) {
    console.error('Load sheet failed:', error);
    return res.status(500).json({ error: 'Failed to load costing sheet' });
  }
});

const LINE_COLUMNS = [
  'sl_no', 'qty', 'unit', 'model_no', 'description', 'unit_cost_exw', 'currency', 'supplier_discount_pct', 'unit_rate_discounted', 'bd_conversion_rate',
  'unit_rate_bd', 'total_cost_bd', 'shipping_duty_pct', 'unit_rate_with_cf', 'total_landing_cost_bd', 'margin_pct', 'unit_rate_selling', 'selling_total_bd',
  'unit_cost_bd', 'nos', 'months', 'days', 'role_name', 'salary_per_month', 'per_day_rate', 'oh_pct', 'total_cost', 'amount',
];
const TEXT_LINE_COLUMNS = new Set(['unit', 'model_no', 'description', 'currency', 'role_name']);
// Everything that is copied for a revision: the figures plus the heading flag.
const COPY_COLUMNS = [...LINE_COLUMNS, 'is_heading'];

async function writeLines(client, sheetId, incoming) {
  const { results, summary } = calcSheet(incoming);
  await client.query('DELETE FROM costing_line_items WHERE costing_sheet_id = $1', [sheetId]);
  const order = { ST1: 0, ST2: 0, ST3: 0, ST4: 0 };
  for (let i = 0; i < incoming.length; i++) {
    const line = incoming[i];
    const derived = results[i];
    const heading = line.is_heading === true;
    // A heading keeps only its text (in description); every number and the other text fields are null.
    const values = LINE_COLUMNS.map((column) => {
      if (heading) return column === 'description' ? clean(line.description) : null;
      const raw = derived[column] !== undefined ? derived[column] : line[column];
      return TEXT_LINE_COLUMNS.has(column) ? clean(raw) : toNumberOrNull(raw);
    });
    await client.query(
      `INSERT INTO costing_line_items (costing_sheet_id, section, sort_order, is_heading, ${LINE_COLUMNS.join(', ')})
       VALUES ($1, $2, $3, $4, ${LINE_COLUMNS.map((_, idx) => `$${idx + 5}`).join(', ')})`,
      [sheetId, line.section, order[line.section]++, heading, ...values]
    );
  }
  return summary;
}

const cleanLines = (lines) => (Array.isArray(lines) ? lines.filter((line) => line && SECTIONS.includes(line.section)) : []);

async function nextQuotationRef(client, departmentId, year) {
  const { rows } = await client.query(
    `INSERT INTO quotation_counters (department_id, year, last_number) VALUES ($1, $2, 1)
     ON CONFLICT (department_id, year) DO UPDATE SET last_number = quotation_counters.last_number + 1 RETURNING last_number`,
    [departmentId, year]
  );
  const dept = (await client.query('SELECT name FROM departments WHERE id = $1', [departmentId])).rows[0];
  return formatQuotationRef(dept.name, year, rows[0].last_number);
}

// Creates the first costing sheet of an enquiry (header prefilled from the enquiry, quotation number generated now).
router.post('/sheets', async (req, res) => {
  const client = await pool.connect();
  try {
    const body = req.body || {};
    const enquiryId = toId(body.enquiry_id);
    const { rows: enquiryRows } = enquiryId ? await client.query(`${ENQUIRY_SELECT} WHERE e.id = $1`, [enquiryId]) : { rows: [] };
    if (enquiryRows.length === 0) return res.status(404).json({ error: 'Enquiry not found' });
    const enquiry = enquiryRows[0];
    if (!canViewEnquiry(req, enquiry)) return res.status(403).json({ error: "You don't have access to this enquiry" });

    const { rows: existing } = await client.query('SELECT id, status FROM costing_sheets WHERE enquiry_id = $1 AND is_latest', [enquiry.id]);
    if (existing.length > 0) {
      return res.status(409).json({
        error: existing[0].status === 'rejected' ? 'This enquiry already has a rejected costing sheet - edit it, or create a revision' : 'This enquiry already has a costing sheet',
        sheet_id: existing[0].id,
      });
    }

    await client.query('BEGIN');
    const { year, today } = bahrainParts();
    const departmentId = toId(body.department_id) || enquiry.department_id;
    const ref = clean(body.quotation_ref_no) || (await nextQuotationRef(client, departmentId, year));
    const lines = cleanLines(body.lines);
    const { rows } = await client.query(
      `INSERT INTO costing_sheets (enquiry_id, quotation_ref_no, revision_no, is_latest, project_name, client, consultant, main_contractor, date, department_id, prepared_by, status)
       VALUES ($1, $2, 0, TRUE, $3, $4, $5, $6, $7, $8, $9, 'draft') RETURNING id`,
      [enquiry.id, ref, clean(body.project_name) || enquiry.project_name, clean(body.client) || enquiry.client_name, clean(body.consultant) ?? enquiry.consultant,
        clean(body.main_contractor) ?? enquiry.main_contractor, clean(body.date) || today, departmentId, req.masUser.id]
    );
    const sheetId = rows[0].id;
    const summary = await writeLines(client, sheetId, lines);
    await client.query(
      `UPDATE costing_sheets SET total_net_cost = $1, total_selling_amount = $2, profit_pct_on_cost = $3, profit_pct_on_selling = $4 WHERE id = $5`,
      [summary.total_net_cost, summary.total_selling_amount, summary.profit_pct_on_cost, summary.profit_pct_on_selling, sheetId]
    );
    await client.query(`UPDATE enquiries SET status = 'in_progress', updated_at = NOW() WHERE id = $1 AND status = 'open'`, [enquiry.id]);
    await client.query(`UPDATE enquiry_tasks SET status = 'in_progress' WHERE enquiry_id = $1 AND task_title = 'Prepare Costing Sheet' AND status = 'pending'`, [enquiry.id]);
    await client.query('COMMIT');
    return res.status(201).json({ id: sheetId, quotation_ref_no: ref });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Create sheet failed:', error);
    return res.status(500).json({ error: 'Failed to create costing sheet' });
  } finally {
    client.release();
  }
});

// Saves a draft / rejected sheet: header, lines and the recomputed totals. Submitted and approved sheets are locked.
router.put('/sheets/:id', async (req, res) => {
  const client = await pool.connect();
  try {
    const sheet = await loadSheet(req, res);
    if (!sheet) return;
    if (!canEditSheet(req, sheet)) {
      const reason = sheet.status === 'approved' ? 'This costing sheet is approved and locked' : sheet.status === 'submitted' ? 'This costing sheet is awaiting manager approval and cannot be edited' : !sheet.is_latest ? 'This revision has been superseded and is read-only' : "You can't edit this costing sheet";
      return res.status(409).json({ error: reason });
    }
    const body = req.body || {};
    await client.query('BEGIN');
    const summary = await writeLines(client, sheet.id, cleanLines(body.lines));
    // Header fields that are not in the request keep their stored value.
    const pick = (key) => (Object.prototype.hasOwnProperty.call(body, key) ? clean(body[key]) : sheet[key]);
    await client.query(
      `UPDATE costing_sheets SET quotation_ref_no = $1, project_name = $2, client = $3, consultant = $4, main_contractor = $5,
         date = $6, total_net_cost = $7, total_selling_amount = $8, profit_pct_on_cost = $9, profit_pct_on_selling = $10, updated_at = NOW()
       WHERE id = $11`,
      [clean(body.quotation_ref_no) || sheet.quotation_ref_no, pick('project_name'), pick('client'), pick('consultant'), pick('main_contractor'),
        clean(body.date) || sheet.date, summary.total_net_cost, summary.total_selling_amount, summary.profit_pct_on_cost, summary.profit_pct_on_selling, sheet.id]
    );
    await client.query('COMMIT');
    return res.json({ id: sheet.id, summary });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Save sheet failed:', error);
    return res.status(500).json({ error: 'Failed to save costing sheet' });
  } finally {
    client.release();
  }
});

router.delete('/sheets/:id', async (req, res) => {
  try {
    const sheet = await loadSheet(req, res);
    if (!sheet) return;
    if (sheet.status !== 'draft') return res.status(409).json({ error: 'Only a draft costing sheet can be deleted' });
    if (!canEditSheet(req, sheet)) return res.status(403).json({ error: "You can't delete this costing sheet" });
    await pool.query('DELETE FROM costing_sheets WHERE id = $1', [sheet.id]);
    return res.json({ success: true });
  } catch (error) {
    console.error('Delete sheet failed:', error);
    return res.status(500).json({ error: 'Failed to delete costing sheet' });
  }
});

// Submit (or resubmit) for the preparer's manager to approve. The sheet is locked while it waits.
router.post('/sheets/:id/submit', async (req, res) => {
  const client = await pool.connect();
  try {
    const sheet = await loadSheet(req, res);
    if (!sheet) return;
    if (!canEditSheet(req, sheet)) return res.status(409).json({ error: 'This costing sheet cannot be submitted in its current state' });
    if (Number(sheet.total_selling_amount) <= 0) return res.status(409).json({ error: 'Add line items and save the sheet before submitting it' });

    await client.query('BEGIN');
    await client.query(
      `UPDATE costing_sheets SET status = 'submitted', submitted_at = NOW(), rejection_comment = NULL, reviewed_by = NULL, reviewed_at = NULL, updated_at = NOW() WHERE id = $1`,
      [sheet.id]
    );
    await client.query(`UPDATE enquiries SET status = 'costing_done', updated_at = NOW() WHERE id = $1`, [sheet.enquiry_id]);
    await client.query(`UPDATE enquiry_tasks SET status = 'completed' WHERE enquiry_id = $1 AND task_title IN ('Prepare Costing Sheet', 'Submit for Review')`, [sheet.enquiry_id]);
    await notify(client, sheet.preparer_manager_id, `Costing sheet for ${sheet.project_name || sheet.enquiry_no} is ready for your review`, `/costing/sheet/${sheet.id}`);
    await client.query('COMMIT');
    return res.json({ success: true, notified: sheet.preparer_manager_name || null });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Submit sheet failed:', error);
    return res.status(500).json({ error: 'Failed to submit costing sheet' });
  } finally {
    client.release();
  }
});

async function review(req, res, approve) {
  const client = await pool.connect();
  try {
    const sheet = await loadSheet(req, res);
    if (!sheet) return;
    if (!canReviewSheet(req, sheet)) return res.status(403).json({ error: sheet.status !== 'submitted' ? 'This costing sheet is not awaiting approval' : "Only the preparer's manager can approve or reject this sheet" });
    const comment = clean(req.body?.comment);
    if (!approve && !comment) return res.status(400).json({ error: 'A rejection comment is required' });

    await client.query('BEGIN');
    await client.query(
      `UPDATE costing_sheets SET status = $1, rejection_comment = $2, reviewed_by = $3, reviewed_at = NOW(), updated_at = NOW() WHERE id = $4`,
      [approve ? 'approved' : 'rejected', approve ? null : comment, req.masUser.id, sheet.id]
    );
    await client.query(`UPDATE enquiries SET status = $1, updated_at = NOW() WHERE id = $2`, [approve ? 'approved' : 'rejected', sheet.enquiry_id]);
    const label = sheet.project_name || sheet.enquiry_no;
    await notify(
      client,
      sheet.prepared_by,
      approve ? `Your costing sheet for ${label} has been approved` : `Your costing sheet for ${label} was rejected: ${comment}`,
      `/costing/sheet/${sheet.id}`
    );
    await client.query('COMMIT');
    return res.json({ success: true, status: approve ? 'approved' : 'rejected' });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Review sheet failed:', error);
    return res.status(500).json({ error: 'Failed to update the costing sheet' });
  } finally {
    client.release();
  }
}

router.post('/sheets/:id/approve', (req, res) => review(req, res, true));
router.post('/sheets/:id/reject', (req, res) => review(req, res, false));

// "Create Revision" after a rejection: copies the rejected sheet into a new draft (ref + -R<n>); the old one stays as history.
router.post('/sheets/:id/revise', async (req, res) => {
  const client = await pool.connect();
  try {
    const sheet = await loadSheet(req, res);
    if (!sheet) return;
    if (sheet.status !== 'rejected' || !sheet.is_latest) return res.status(409).json({ error: 'Only the latest, rejected costing sheet can be revised' });
    if (!canEditSheet(req, sheet)) return res.status(403).json({ error: "You can't revise this costing sheet" });

    await client.query('BEGIN');
    const revisionNo = Number((await client.query('SELECT COALESCE(MAX(revision_no), 0) AS max FROM costing_sheets WHERE enquiry_id = $1', [sheet.enquiry_id])).rows[0].max) + 1;
    await client.query('UPDATE costing_sheets SET is_latest = FALSE WHERE enquiry_id = $1', [sheet.enquiry_id]);
    const ref = `${baseQuotationRef(sheet.quotation_ref_no)}-R${revisionNo}`;
    const { rows } = await client.query(
      `INSERT INTO costing_sheets (enquiry_id, quotation_ref_no, revision_no, is_latest, project_name, client, consultant, main_contractor, date, department_id, prepared_by,
         status, total_net_cost, total_selling_amount, profit_pct_on_cost, profit_pct_on_selling)
       SELECT enquiry_id, $2, $3, TRUE, project_name, client, consultant, main_contractor, $4, department_id, $5, 'draft', total_net_cost,
         total_selling_amount, profit_pct_on_cost, profit_pct_on_selling FROM costing_sheets WHERE id = $1 RETURNING id`,
      [sheet.id, ref, revisionNo, bahrainParts().today, req.masUser.id]
    );
    await client.query(
      `INSERT INTO costing_line_items (costing_sheet_id, section, sort_order, ${COPY_COLUMNS.join(', ')})
       SELECT $2, section, sort_order, ${COPY_COLUMNS.join(', ')} FROM costing_line_items WHERE costing_sheet_id = $1`,
      [sheet.id, rows[0].id]
    );
    await client.query(`UPDATE enquiries SET status = 'in_progress', updated_at = NOW() WHERE id = $1`, [sheet.enquiry_id]);
    await client.query('COMMIT');
    return res.status(201).json({ id: rows[0].id, quotation_ref_no: ref });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Revise sheet failed:', error);
    return res.status(500).json({ error: 'Failed to create revision' });
  } finally {
    client.release();
  }
});

// ------------------------------------------------------------------ dashboard

router.get('/dashboard', async (req, res) => {
  try {
    const me = req.masUser;
    const eParams = [];
    const eScope = enquiryScopeSql(req, eParams);
    const total = (await pool.query(`SELECT COUNT(*)::int AS count FROM enquiries e ${eScope ? `WHERE ${eScope}` : ''}`, eParams)).rows[0].count;


    const sParams = [];
    let sScope = '';
    if (!req.scope.all) {
      sParams.push(req.scope.ids);
      sScope = `AND (s.prepared_by = ANY($1) OR e.assigned_to = ANY($1))`;
    }
    const awaiting = (await pool.query(`SELECT COUNT(*)::int AS count FROM costing_sheets s JOIN enquiries e ON e.id = s.enquiry_id WHERE s.status = 'submitted' AND s.is_latest ${sScope}`, sParams)).rows[0].count;
    const approvedThisMonth = (
      await pool.query(
        `SELECT COUNT(*)::int AS count FROM costing_sheets s JOIN enquiries e ON e.id = s.enquiry_id
         WHERE s.status = 'approved' AND s.reviewed_at >= date_trunc('month', NOW() AT TIME ZONE 'Asia/Bahrain') AT TIME ZONE 'Asia/Bahrain' ${sScope}`,
        sParams
      )
    ).rows[0].count;

    // Pending my action: my open tasks, sheets waiting for my approval, and my sheets sent back to me.
    const openTasks = (await pool.query(`SELECT COUNT(*)::int AS count FROM enquiry_tasks WHERE assigned_to = $1 AND status <> 'completed'`, [me.id])).rows[0].count;
    const toApprove = (await pool.query(`SELECT COUNT(*)::int AS count FROM costing_sheets s JOIN mas_users p ON p.id = s.prepared_by WHERE s.status = 'submitted' AND s.is_latest AND p.manager_id = $1`, [me.id])).rows[0].count;
    const rejected = (await pool.query(`SELECT COUNT(*)::int AS count FROM costing_sheets s WHERE s.status = 'rejected' AND s.is_latest AND s.prepared_by = $1`, [me.id])).rows[0].count;

    const recentParams = [];
    const recentScope = enquiryScopeSql(req, recentParams);
    const recent = (await pool.query(`${ENQUIRY_SELECT} ${recentScope ? `WHERE ${recentScope}` : ''} ORDER BY e.id DESC LIMIT 8`, recentParams)).rows;
    const tasks = (await pool.query(`${TASK_SELECT} WHERE t.assigned_to = $1 AND t.status <> 'completed' ORDER BY t.due_date NULLS LAST, t.id LIMIT 10`, [me.id])).rows;

    return res.json({
      total_enquiries: total,
      pending_my_action: openTasks + toApprove + rejected,
      pending_breakdown: { open_tasks: openTasks, to_approve: toApprove, rejected },
      awaiting_approval: awaiting,
      approved_this_month: approvedThisMonth,
      recent_enquiries: recent,
      my_tasks: tasks,
    });
  } catch (error) {
    console.error('Costing dashboard failed:', error);
    return res.status(500).json({ error: 'Failed to load the dashboard' });
  }
});

// ------------------------------------------------------------------ users & permissions (Director / GM)

function requireGm(req, res, next) {
  if (!isGmOrAbove(req.masUser)) return res.status(403).json({ error: 'Only the Director or General Manager can manage users' });
  return next();
}

router.get('/users', requireGm, async (req, res) => {
  const { rows } = await pool.query(`${USER_SELECT} ORDER BY u.is_active DESC, r.level DESC, u.name`);
  return res.json(rows);
});

async function validateUserBody(body, existingId) {
  if (!clean(body.name)) return 'Name is required';
  if (!toId(body.role_id)) return 'Role is required';
  const managerId = toId(body.manager_id);
  if (managerId) {
    if (existingId && managerId === existingId) return 'A user cannot be their own manager';
    // No loops: the new manager must not already report (directly or indirectly) to this user.
    if (existingId && (await subtreeIds(existingId)).includes(managerId)) return "That would create a loop in the reporting line";
  }
  return null;
}

router.post('/users', requireGm, async (req, res) => {
  try {
    const body = req.body || {};
    const problem = await validateUserBody(body, null);
    if (problem) return res.status(400).json({ error: problem });
    const { rows } = await pool.query(
      `INSERT INTO mas_users (name, email, role_id, department_id, manager_id, is_active) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [clean(body.name), clean(body.email), toId(body.role_id), toId(body.department_id), toId(body.manager_id), body.is_active !== false]
    );
    const { rows: created } = await pool.query(`${USER_SELECT} WHERE u.id = $1`, [rows[0].id]);
    return res.status(201).json(created[0]);
  } catch (error) {
    console.error('Create user failed:', error);
    return res.status(500).json({ error: 'Failed to create user' });
  }
});

router.put('/users/:id', requireGm, async (req, res) => {
  try {
    const id = toId(req.params.id);
    const body = req.body || {};
    const problem = await validateUserBody(body, id);
    if (problem) return res.status(400).json({ error: problem });
    if (id === req.masUser.id && body.is_active === false) return res.status(400).json({ error: "You can't deactivate yourself" });
    const { rows } = await pool.query(
      `UPDATE mas_users SET name = $1, email = $2, role_id = $3, department_id = $4, manager_id = $5, is_active = COALESCE($6, is_active) WHERE id = $7 RETURNING id`,
      [clean(body.name), clean(body.email), toId(body.role_id), toId(body.department_id), toId(body.manager_id), typeof body.is_active === 'boolean' ? body.is_active : null, id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'User not found' });
    const { rows: updated } = await pool.query(`${USER_SELECT} WHERE u.id = $1`, [id]);
    return res.json(updated[0]);
  } catch (error) {
    console.error('Update user failed:', error);
    return res.status(500).json({ error: 'Failed to update user' });
  }
});

module.exports = router;
