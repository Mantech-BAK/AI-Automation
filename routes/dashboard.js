const express = require('express');
const path = require('path');
const dotenv = require('dotenv');
const { pool } = require('../db');
const { graphRequest } = require('../graph/client');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const router = express.Router();

async function createPlannerTaskFromActionItem(actionItem) {
  const planId = process.env.PLANNER_PLAN_ID;

  if (!planId) {
    return null;
  }

  const body = {
    planId,
    title: actionItem.title,
    assignments: {},
    dueDateTime: actionItem.due_date ? `${actionItem.due_date}T00:00:00Z` : null,
  };

  const createdTask = await graphRequest('POST', '/planner/tasks', body, 'app');
  return createdTask?.id || null;
}

router.get('/overview', async (req, res) => {
  try {
    const query = `
      SELECT
        (SELECT COUNT(*) FROM work_orders) AS "totalTasks",
        (SELECT COUNT(*) FROM work_orders WHERE status = 'pending') AS "pending",
        (SELECT COUNT(*) FROM work_orders WHERE status = 'open' AND planner_task_id IS NOT NULL) AS "inProgress",
        (SELECT COUNT(*) FROM work_orders WHERE status = 'completed') AS "completed",
        (SELECT COUNT(*) FROM work_orders WHERE due_date < CURRENT_DATE AND status <> 'completed') AS "overdue",
        (SELECT COUNT(*) FROM work_orders WHERE due_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '30 days' AND status <> 'completed') AS "dueSoon",
        (SELECT COUNT(DISTINCT site_location) FROM assets) AS "sites",
        (SELECT COUNT(*) FROM assets) AS "equipment",
        (SELECT COUNT(*) FROM technicians) AS "technicians"
    `;

    const { rows } = await pool.query(query);
    return res.json(rows[0] || {});
  } catch (error) {
    console.error('Overview query failed:', error);
    return res.status(500).json({ error: 'Failed to load overview data' });
  }
});

router.get('/tasks', async (req, res) => {
  try {
    const days = req.query.days ? Number(req.query.days) : null;
    const hasDaysFilter = Number.isFinite(days) && days !== null;

    const { rows } = await pool.query(
      `
      SELECT
        wo.id,
        a.equipment_name,
        a.site_location,
        t.name AS technician_name,
        wo.status,
        wo.due_date,
        a.estimated_duration_hours,
        CASE
          WHEN wo.due_date < CURRENT_DATE THEN (CURRENT_DATE - wo.due_date)
          ELSE 0
        END AS days_overdue
      FROM work_orders wo
      LEFT JOIN assets a ON wo.asset_id = a.id
      LEFT JOIN technicians t ON wo.technician_id = t.id
      ${hasDaysFilter ? `WHERE wo.due_date <= CURRENT_DATE + $1 * INTERVAL '1 day' AND wo.status NOT IN ('completed', 'rejected')` : ''}
      ORDER BY wo.due_date NULLS LAST, wo.id
    `,
      hasDaysFilter ? [days] : []
    );

    return res.json(rows);
  } catch (error) {
    console.error('Tasks query failed:', error);
    return res.status(500).json({ error: 'Failed to load tasks' });
  }
});

router.get('/tasks/completed', async (req, res) => {
  try {
    const { rows: tasks } = await pool.query(`
      SELECT
        wo.id,
        a.equipment_name,
        a.site_location,
        t.name AS technician_name,
        wo.due_date,
        wo.completed_at
      FROM work_orders wo
      LEFT JOIN assets a ON wo.asset_id = a.id
      LEFT JOIN technicians t ON wo.technician_id = t.id
      WHERE wo.status = 'completed'
      ORDER BY wo.completed_at DESC
      LIMIT 20
    `);

    const { rows: monthRows } = await pool.query(`
      SELECT
        COUNT(*) AS total_this_month,
        COUNT(*) FILTER (WHERE status = 'completed') AS completed_this_month
      FROM work_orders
      WHERE due_date >= date_trunc('month', CURRENT_DATE)::date
        AND due_date < (date_trunc('month', CURRENT_DATE) + INTERVAL '1 month')::date
    `);

    return res.json({
      tasks,
      total_this_month: Number(monthRows[0]?.total_this_month || 0),
      completed_this_month: Number(monthRows[0]?.completed_this_month || 0),
    });
  } catch (error) {
    console.error('Completed tasks query failed:', error);
    return res.status(500).json({ error: 'Failed to load completed tasks' });
  }
});

router.get('/assets', async (req, res) => {
  try {
    const { rows } = await pool.query(`SELECT * FROM assets ORDER BY id`);
    return res.json(rows);
  } catch (error) {
    console.error('Assets query failed:', error);
    return res.status(500).json({ error: 'Failed to load assets' });
  }
});

router.get('/technicians', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        t.*,
        COALESCE(a.site_location, 'Available') AS current_location
      FROM technicians t
      LEFT JOIN LATERAL (
        SELECT wo.asset_id
        FROM work_orders wo
        WHERE wo.technician_id = t.id AND wo.status = 'open'
        ORDER BY wo.due_date ASC NULLS LAST, wo.id ASC
        LIMIT 1
      ) wo ON true
      LEFT JOIN assets a ON a.id = wo.asset_id
      ORDER BY t.id
    `);
    return res.json(rows);
  } catch (error) {
    console.error('Technicians query failed:', error);
    return res.status(500).json({ error: 'Failed to load technicians' });
  }
});

router.get('/notifications', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        nl.*, 
        wo.status AS work_order_status,
        wo.due_date AS work_order_due_date,
        a.equipment_name,
        a.site_location
      FROM notification_log nl
      LEFT JOIN work_orders wo ON nl.work_order_id = wo.id
      LEFT JOIN assets a ON wo.asset_id = a.id
      WHERE nl.sent_at::date = CURRENT_DATE
      ORDER BY nl.sent_at DESC
    `);
    return res.json(rows);
  } catch (error) {
    console.error('Notifications query failed:', error);
    return res.status(500).json({ error: 'Failed to load notifications' });
  }
});

router.get('/sites', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        a.site_location,
        COUNT(a.id) AS equipment_count,
        SUM(CASE WHEN wo.status = 'open' THEN 1 ELSE 0 END) AS open_work_orders
      FROM assets a
      LEFT JOIN work_orders wo ON wo.asset_id = a.id
      GROUP BY a.site_location
      ORDER BY a.site_location
    `);
    return res.json(rows);
  } catch (error) {
    console.error('Sites query failed:', error);
    return res.status(500).json({ error: 'Failed to load site data' });
  }
});

router.get('/sites/tasks', async (req, res) => {
  try {
    const { date } = req.query;

    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ error: 'date query parameter in YYYY-MM-DD format is required' });
    }

    const { rows } = await pool.query(
      `
      SELECT
        a.site_location,
        COUNT(wo.id) AS total_tasks,
        COUNT(*) FILTER (WHERE wo.status = 'completed') AS completed_tasks,
        COUNT(*) FILTER (WHERE wo.status NOT IN ('completed', 'rejected')) AS open_tasks,
        COUNT(*) FILTER (WHERE wo.due_date < $1 AND wo.status NOT IN ('completed', 'rejected')) AS overdue_tasks
      FROM work_orders wo
      JOIN assets a ON a.id = wo.asset_id
      WHERE wo.created_at::date <= $1 AND wo.due_date >= $1
      GROUP BY a.site_location
      ORDER BY a.site_location
    `,
      [date]
    );

    return res.json(rows);
  } catch (error) {
    console.error('Sites tasks query failed:', error);
    return res.status(500).json({ error: 'Failed to load site task data' });
  }
});

router.get('/email-summaries', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        es.*,
        COALESCE(
          JSON_AGG(
            JSON_BUILD_OBJECT(
              'id', eai.id,
              'title', eai.title,
              'assigned_to', eai.assigned_to,
              'due_date', eai.due_date,
              'estimated_hours', eai.estimated_hours,
              'planner_task_id', eai.planner_task_id,
              'created_at', eai.created_at
            )
          ) FILTER (WHERE eai.id IS NOT NULL),
          '[]'
        ) AS action_items
      FROM email_summaries es
      LEFT JOIN email_action_items eai ON eai.email_summary_id = es.id
      GROUP BY es.id
      ORDER BY es.date_received DESC
    `);

    return res.json(rows);
  } catch (error) {
    console.error('Email summaries query failed:', error);
    return res.status(500).json({ error: 'Failed to load email summaries' });
  }
});

router.get('/schedules', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        wo.*,
        a.equipment_name,
        a.site_location,
        a.estimated_duration_hours,
        t.name AS technician_name
      FROM work_orders wo
      LEFT JOIN assets a ON wo.asset_id = a.id
      LEFT JOIN technicians t ON wo.technician_id = t.id
      WHERE wo.due_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '60 days'
      ORDER BY wo.due_date ASC
    `);
    return res.json(rows);
  } catch (error) {
    console.error('Schedules query failed:', error);
    return res.status(500).json({ error: 'Failed to load schedules' });
  }
});

router.post('/assets/add', async (req, res) => {
  try {
    const {
      equipment_name,
      site_location,
      maintenance_interval_days,
      estimated_duration_hours,
      last_completed_date,
      type_of_service,
    } = req.body;

    const next_due_date = last_completed_date
      ? (() => {
          const date = new Date(last_completed_date);
          if (Number.isNaN(date.getTime())) return null;
          date.setDate(date.getDate() + Number(maintenance_interval_days || 0));
          return date.toISOString().split('T')[0];
        })()
      : null;

    const { rows } = await pool.query(
      `INSERT INTO assets (
         equipment_name,
         site_location,
         maintenance_interval_days,
         estimated_duration_hours,
         last_completed_date,
         next_due_date,
         type_of_service
       ) VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        equipment_name,
        site_location,
        maintenance_interval_days,
        estimated_duration_hours,
        last_completed_date || null,
        next_due_date,
        type_of_service || 'general',
      ]
    );

    return res.status(201).json(rows[0]);
  } catch (error) {
    console.error('Add asset failed:', error);
    return res.status(500).json({ error: 'Failed to add asset' });
  }
});

router.post('/technicians/add', async (req, res) => {
  try {
    const { name, email, type_of_service } = req.body;

    const { rows } = await pool.query(
      `INSERT INTO technicians (name, email, type_of_service)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [name, email, type_of_service]
    );

    return res.status(201).json(rows[0]);
  } catch (error) {
    console.error('Add technician failed:', error);
    return res.status(500).json({ error: 'Failed to add technician' });
  }
});

router.post('/tasks/create', async (req, res) => {
  try {
    const { title, assigned_to, due_date, estimated_hours, asset_id } = req.body;

    if (!title || typeof title !== 'string' || !title.trim()) {
      return res.status(400).json({ error: 'title is required' });
    }

    let technicianId = null;
    if (assigned_to) {
      const techResult = await pool.query(
        `SELECT id FROM technicians WHERE email = $1 OR name = $1 LIMIT 1`,
        [assigned_to]
      );
      technicianId = techResult.rows[0]?.id || null;
    }

    const plannerTaskId = await createPlannerTaskFromActionItem({ title, due_date });

    const notes = [title, estimated_hours ? `Estimated hours: ${estimated_hours}` : null]
      .filter(Boolean)
      .join('\n');

    const { rows } = await pool.query(
      `INSERT INTO work_orders (status, asset_id, technician_id, planner_task_id, due_date, notes)
       VALUES ('open', $1, $2, $3, $4, $5)
       RETURNING *`,
      [asset_id || null, technicianId, plannerTaskId, due_date || null, notes]
    );

    return res.status(201).json({ work_order: rows[0], planner_task_id: plannerTaskId });
  } catch (error) {
    console.error('Create task failed:', error);
    return res.status(500).json({ error: 'Failed to create task' });
  }
});

router.post('/escalations/:id/resolve', async (req, res) => {
  try {
    const { id } = req.params;

    const { rows } = await pool.query(
      `UPDATE escalation_log
       SET resolved = true,
           resolved_at = now()
       WHERE id = $1
       RETURNING *`,
      [id]
    );

    if (!rows.length) {
      return res.status(404).json({ error: 'Escalation not found' });
    }

    return res.json({ success: true, escalation: rows[0] });
  } catch (error) {
    console.error('Resolve escalation failed:', error);
    return res.status(500).json({ error: 'Failed to resolve escalation' });
  }
});

module.exports = router;
