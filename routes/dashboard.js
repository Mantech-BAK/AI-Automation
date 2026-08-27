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
        (SELECT COUNT(*) FROM work_orders WHERE status = 'open' AND (due_date IS NULL OR due_date >= CURRENT_DATE)) AS "pending",
        (SELECT COUNT(*) FROM work_orders WHERE status = 'completed') AS "completed",
        (SELECT COUNT(*) FROM work_orders WHERE status = 'open' AND due_date < CURRENT_DATE) AS "overdue",
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

router.get('/overview/maintenance', async (req, res) => {
  try {
    const query = `
      SELECT
        (SELECT COUNT(*) FROM work_orders wo
           JOIN assets a ON a.id = wo.asset_id
           JOIN asset_categories ac ON ac.id = a.category_id
           WHERE ac.name = 'Equipment') AS "totalTasks",
        (SELECT COUNT(*) FROM work_orders wo
           JOIN assets a ON a.id = wo.asset_id
           JOIN asset_categories ac ON ac.id = a.category_id
           WHERE ac.name = 'Equipment' AND wo.status = 'open' AND (wo.due_date IS NULL OR wo.due_date >= CURRENT_DATE)) AS "open",
        (SELECT COUNT(*) FROM work_orders wo
           JOIN assets a ON a.id = wo.asset_id
           JOIN asset_categories ac ON ac.id = a.category_id
           WHERE ac.name = 'Equipment' AND wo.status = 'open' AND wo.due_date < CURRENT_DATE) AS "overdue",
        (SELECT COUNT(*) FROM work_orders wo
           JOIN assets a ON a.id = wo.asset_id
           JOIN asset_categories ac ON ac.id = a.category_id
           WHERE ac.name = 'Equipment' AND wo.status = 'completed') AS "completed"
    `;

    const { rows } = await pool.query(query);
    return res.json(rows[0] || {});
  } catch (error) {
    console.error('Maintenance overview query failed:', error);
    return res.status(500).json({ error: 'Failed to load maintenance overview data' });
  }
});

router.get('/overview/documentation', async (req, res) => {
  try {
    const query = `
      SELECT
        (SELECT COUNT(*) FROM assets a
           JOIN asset_categories ac ON ac.id = a.category_id
           WHERE ac.name = 'Document') AS "totalDocuments",
        (SELECT COUNT(*) FROM assets a
           JOIN asset_categories ac ON ac.id = a.category_id
           WHERE ac.name = 'Document' AND a.expiry_date IS NOT NULL
             AND a.expiry_date >= CURRENT_DATE AND a.expiry_date <= CURRENT_DATE + INTERVAL '30 days') AS "expiringWithin30",
        (SELECT COUNT(*) FROM assets a
           JOIN asset_categories ac ON ac.id = a.category_id
           WHERE ac.name = 'Document' AND a.expiry_date IS NOT NULL
             AND a.expiry_date >= CURRENT_DATE AND a.expiry_date <= CURRENT_DATE + INTERVAL '90 days') AS "expiringWithin90",
        (SELECT COUNT(*) FROM assets a
           JOIN asset_categories ac ON ac.id = a.category_id
           WHERE ac.name = 'Document' AND a.expiry_date IS NOT NULL AND a.expiry_date < CURRENT_DATE) AS "expired"
    `;

    const { rows } = await pool.query(query);
    return res.json(rows[0] || {});
  } catch (error) {
    console.error('Documentation overview query failed:', error);
    return res.status(500).json({ error: 'Failed to load documentation overview data' });
  }
});

router.get('/tasks', async (req, res) => {
  try {
    const days = req.query.days ? Number(req.query.days) : null;
    const hasDaysFilter = Number.isFinite(days) && days !== null;

    const technicianId = req.query.technician_id ? Number(req.query.technician_id) : null;
    const hasTechnicianFilter = Number.isFinite(technicianId) && technicianId !== null;

    const { category, task_type: taskType } = req.query;

    const conditions = [];
    const params = [];

    if (hasDaysFilter) {
      params.push(days);
      conditions.push(`wo.due_date <= CURRENT_DATE + $${params.length} * INTERVAL '1 day' AND wo.status NOT IN ('completed', 'rejected')`);
    }

    if (hasTechnicianFilter) {
      params.push(technicianId);
      conditions.push(`wo.technician_id = $${params.length}`);
    }

    if (category === 'Document' || category === 'Equipment') {
      params.push(category);
      conditions.push(`ac.name = $${params.length}`);
    }

    if (taskType === 'equipment' || taskType === 'document') {
      params.push(taskType);
      conditions.push(`wo.task_type = $${params.length}`);
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const { rows } = await pool.query(
      `
      SELECT
        wo.id,
        wo.asset_id,
        wo.task_type,
        wo.planner_task_id,
        a.equipment_name,
        a.equipment_name AS document_name,
        a.site_location,
        a.site_location AS department,
        t.name AS technician_name,
        wo.status,
        wo.due_date,
        wo.due_date AS expiry_date,
        a.estimated_duration_hours,
        CASE
          WHEN wo.due_date < CURRENT_DATE THEN (CURRENT_DATE - wo.due_date)
          ELSE 0
        END AS days_overdue
      FROM work_orders wo
      LEFT JOIN assets a ON wo.asset_id = a.id
      LEFT JOIN technicians t ON wo.technician_id = t.id
      LEFT JOIN asset_categories ac ON ac.id = a.category_id
      ${whereClause}
      ORDER BY wo.due_date NULLS LAST, wo.id
    `,
      params
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
    const { category, department } = req.query;
    const conditions = [];
    const params = [];

    if (category === 'Document' || category === 'Equipment') {
      params.push(category);
      conditions.push(`ac.name = $${params.length}`);
    }

    if (department) {
      params.push(department);
      conditions.push(`assets.site_location = $${params.length}`);
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const { rows } = await pool.query(
      `
      SELECT
        assets.*,
        ac.name AS category_name,
        at.name AS type_name,
        ad.name AS department_name
      FROM assets
      LEFT JOIN asset_categories ac ON ac.id = assets.category_id
      LEFT JOIN asset_types at ON at.id = assets.type_id
      LEFT JOIN asset_departments ad ON ad.id = assets.department_id
      ${whereClause}
      ORDER BY assets.id
    `,
      params
    );
    return res.json(rows);
  } catch (error) {
    console.error('Assets query failed:', error);
    return res.status(500).json({ error: 'Failed to load assets' });
  }
});

router.get('/documents/responsible-persons', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        responsible_person,
        COUNT(*) AS total_documents,
        COUNT(CASE WHEN expiry_date <= CURRENT_DATE + 30 THEN 1 END) AS expiring_soon,
        COUNT(CASE WHEN expiry_date < CURRENT_DATE THEN 1 END) AS overdue
      FROM assets
      WHERE category_id = (SELECT id FROM asset_categories WHERE name = 'Document')
        AND responsible_person IS NOT NULL
      GROUP BY responsible_person
      ORDER BY overdue DESC, expiring_soon DESC
    `);
    return res.json(rows);
  } catch (error) {
    console.error('Responsible persons query failed:', error);
    return res.status(500).json({ error: 'Failed to load responsible persons' });
  }
});

router.get('/technicians', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        t.id,
        t.name,
        t.email,
        t.type_of_service,
        t.emp_id,
        t.contact_number,
        t.task_assigned_count,
        t.task_complete_count,
        t.reports_to_emp_id,
        et.name AS type_name,
        d.name AS designation_name,
        manager.name AS reports_to_name,
        COUNT(CASE WHEN w.status = 'open' THEN 1 END)::int as open_task_count,
        COUNT(CASE WHEN w.status = 'completed' THEN 1 END)::int as completed_task_count,
        MAX(CASE WHEN w.status = 'open' THEN a.site_location END) as current_site,
        MAX(CASE WHEN w.status = 'open' THEN a.equipment_name END) as current_task
      FROM technicians t
      LEFT JOIN employees emp ON emp.id = t.employee_id
      LEFT JOIN employee_types et ON et.id = t.type_id
      LEFT JOIN designations d ON d.id = t.designation_id
      LEFT JOIN employees manager ON manager.emp_id = t.reports_to_emp_id
      LEFT JOIN work_orders w ON w.technician_id = t.id
      LEFT JOIN assets a ON a.id = w.asset_id
      GROUP BY t.id, t.name, t.email, t.type_of_service, t.emp_id, t.contact_number,
               t.task_assigned_count, t.task_complete_count, t.reports_to_emp_id,
               et.name, d.name, manager.name
      ORDER BY t.name
    `);
    return res.json(rows);
  } catch (error) {
    console.error('Technicians query failed:', error);
    return res.status(500).json({ error: 'Failed to load technicians' });
  }
});

router.get('/categories', async (req, res) => {
  try {
    const { rows } = await pool.query(`SELECT * FROM asset_categories ORDER BY name`);
    return res.json(rows);
  } catch (error) {
    console.error('Categories query failed:', error);
    return res.status(500).json({ error: 'Failed to load categories' });
  }
});

router.get('/asset-types', async (req, res) => {
  try {
    const { rows } = await pool.query(`SELECT * FROM asset_types ORDER BY name`);
    return res.json(rows);
  } catch (error) {
    console.error('Asset types query failed:', error);
    return res.status(500).json({ error: 'Failed to load asset types' });
  }
});

router.get('/departments', async (req, res) => {
  try {
    const { rows } = await pool.query(`SELECT * FROM asset_departments ORDER BY name`);
    return res.json(rows);
  } catch (error) {
    console.error('Departments query failed:', error);
    return res.status(500).json({ error: 'Failed to load departments' });
  }
});

// Note: this is deliberately NOT at the bare /departments path - that's
// already used above for the asset_departments lookup table (populates the
// Department dropdown on the Add Equipment / Add Employee forms). This is a
// different concept: the organisational departments derived from assets and
// employees, for the Departments overview page.
router.get('/departments/list', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        d.name,
        COUNT(DISTINCT CASE WHEN ac.name = 'Document' THEN a.id END) AS document_count
      FROM (
        SELECT DISTINCT department AS name FROM assets WHERE department IS NOT NULL
        UNION
        SELECT DISTINCT department_text AS name FROM employees WHERE department_text IS NOT NULL
      ) d
      LEFT JOIN assets a ON a.department = d.name
      LEFT JOIN asset_categories ac ON ac.id = a.category_id
      GROUP BY d.name
      ORDER BY d.name
    `);
    return res.json(rows);
  } catch (error) {
    console.error('Departments list query failed:', error);
    return res.status(500).json({ error: 'Failed to load departments list' });
  }
});

router.get('/departments/:name/tasks', async (req, res) => {
  try {
    const { name } = req.params;

    const { rows } = await pool.query(
      `
      SELECT
        wo.id,
        wo.asset_id,
        wo.task_type,
        wo.planner_task_id,
        a.equipment_name,
        a.equipment_name AS document_name,
        a.site_location,
        a.site_location AS department,
        wo.status,
        wo.due_date,
        wo.due_date AS expiry_date,
        CASE
          WHEN wo.due_date < CURRENT_DATE THEN (CURRENT_DATE - wo.due_date)
          ELSE 0
        END AS days_overdue
      FROM work_orders wo
      JOIN assets a ON a.id = wo.asset_id
      WHERE a.site_location = $1
      ORDER BY wo.due_date NULLS LAST, wo.id
    `,
      [name]
    );

    return res.json(rows);
  } catch (error) {
    console.error('Department tasks query failed:', error);
    return res.status(500).json({ error: 'Failed to load department tasks' });
  }
});

router.get('/designations', async (req, res) => {
  try {
    const { rows } = await pool.query(`SELECT * FROM designations ORDER BY name`);
    return res.json(rows);
  } catch (error) {
    console.error('Designations query failed:', error);
    return res.status(500).json({ error: 'Failed to load designations' });
  }
});

router.get('/employee-types', async (req, res) => {
  try {
    const { rows } = await pool.query(`SELECT * FROM employee_types ORDER BY name`);
    return res.json(rows);
  } catch (error) {
    console.error('Employee types query failed:', error);
    return res.status(500).json({ error: 'Failed to load employee types' });
  }
});

router.get('/religions', async (req, res) => {
  try {
    const { rows } = await pool.query(`SELECT * FROM religions ORDER BY name`);
    return res.json(rows);
  } catch (error) {
    console.error('Religions query failed:', error);
    return res.status(500).json({ error: 'Failed to load religions' });
  }
});

router.get('/origins', async (req, res) => {
  try {
    const { rows } = await pool.query(`SELECT * FROM origins ORDER BY name`);
    return res.json(rows);
  } catch (error) {
    console.error('Origins query failed:', error);
    return res.status(500).json({ error: 'Failed to load origins' });
  }
});

router.get('/notifications', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        nl.*,
        wo.status AS work_order_status,
        wo.due_date AS work_order_due_date,
        COALESCE(a.equipment_name, a_notes.equipment_name) AS equipment_name,
        COALESCE(a.site_location, a_notes.site_location) AS site_location,
        COALESCE(a.equipment_name, a_notes.equipment_name) AS description
      FROM notification_log nl
      LEFT JOIN work_orders wo ON nl.work_order_id = wo.id
      LEFT JOIN assets a ON wo.asset_id = a.id
      LEFT JOIN assets a_notes ON a_notes.id = (nl.notes::json->>'asset_id')::integer
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
        COUNT(DISTINCT CASE WHEN ac.name = 'Equipment' THEN a.id END) AS equipment_count,
        COUNT(DISTINCT CASE WHEN ac.name = 'Document' THEN a.id END) AS document_count,
        COUNT(DISTINCT CASE WHEN ac.name = 'Vehicle' THEN a.id END) AS vehicle_count,
        COUNT(DISTINCT CASE WHEN wo.status = 'open' THEN wo.id END) AS open_work_orders
      FROM assets a
      LEFT JOIN asset_categories ac ON ac.id = a.category_id
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

router.get('/sites/list', async (req, res) => {
  try {
    const { rows } = await pool.query(`SELECT * FROM sites ORDER BY site_name`);
    return res.json(rows);
  } catch (error) {
    console.error('Sites list query failed:', error);
    return res.status(500).json({ error: 'Failed to load sites list' });
  }
});

router.post('/sites/add', async (req, res) => {
  try {
    const { site_name, location, description } = req.body;

    if (!site_name || typeof site_name !== 'string' || !site_name.trim()) {
      return res.status(400).json({ error: 'site_name is required' });
    }

    const { rows } = await pool.query(
      `INSERT INTO sites (site_name, location, description)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [site_name.trim(), location || null, description || null]
    );

    return res.status(201).json(rows[0]);
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({ error: 'A site with this name already exists' });
    }
    console.error('Add site failed:', error);
    return res.status(500).json({ error: 'Failed to add site' });
  }
});

router.delete('/sites/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const { rows: siteRows } = await pool.query(`SELECT * FROM sites WHERE id = $1`, [id]);
    const site = siteRows[0];

    if (!site) {
      return res.status(404).json({ error: 'Site not found' });
    }

    const { rows: assetRows } = await pool.query(
      `SELECT COUNT(*) AS count FROM assets WHERE site_location = $1`,
      [site.site_name]
    );

    if (Number(assetRows[0]?.count || 0) > 0) {
      return res.status(400).json({ error: 'Cannot delete — site has existing equipment' });
    }

    await pool.query(`DELETE FROM sites WHERE id = $1`, [id]);
    return res.json({ success: true });
  } catch (error) {
    console.error('Delete site failed:', error);
    return res.status(500).json({ error: 'Failed to delete site' });
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
      WHERE wo.status NOT IN ('completed', 'rejected')
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
      category_id,
      type_id,
      department_id,
      registration_date,
      expiry_date,
      reminder_days,
      responsible_person,
      remarks,
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
         type_of_service,
         category_id,
         type_id,
         department_id,
         registration_date,
         expiry_date,
         reminder_days,
         responsible_person,
         remarks
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
       RETURNING *`,
      [
        equipment_name,
        site_location,
        maintenance_interval_days,
        estimated_duration_hours,
        last_completed_date || null,
        next_due_date,
        type_of_service || 'general',
        category_id || null,
        type_id || null,
        department_id || null,
        registration_date || null,
        expiry_date || null,
        reminder_days || null,
        responsible_person || null,
        remarks || null,
      ]
    );

    return res.status(201).json(rows[0]);
  } catch (error) {
    console.error('Add asset failed:', error);
    return res.status(500).json({ error: 'Failed to add asset' });
  }
});

router.put('/assets/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const {
      equipment_name,
      site_location,
      maintenance_interval_days,
      estimated_duration_hours,
      next_due_date,
      type_of_service,
      category_id,
      type_id,
      department_id,
      registration_date,
      expiry_date,
      reminder_days,
      responsible_person,
      remarks,
    } = req.body;

    const { rows } = await pool.query(
      `UPDATE assets SET
         equipment_name = $1,
         site_location = $2,
         maintenance_interval_days = $3,
         estimated_duration_hours = $4,
         next_due_date = $5,
         type_of_service = $6,
         category_id = $7,
         type_id = $8,
         department_id = $9,
         registration_date = $10,
         expiry_date = $11,
         reminder_days = $12,
         responsible_person = $13,
         remarks = $14
       WHERE id = $15
       RETURNING *`,
      [
        equipment_name,
        site_location,
        maintenance_interval_days || null,
        estimated_duration_hours || null,
        next_due_date || null,
        type_of_service || 'general',
        category_id || null,
        type_id || null,
        department_id || null,
        registration_date || null,
        expiry_date || null,
        reminder_days || null,
        responsible_person || null,
        remarks || null,
        id,
      ]
    );

    if (!rows.length) {
      return res.status(404).json({ error: 'Asset not found' });
    }

    return res.json(rows[0]);
  } catch (error) {
    console.error('Update asset failed:', error);
    return res.status(500).json({ error: 'Failed to update asset' });
  }
});

router.post('/technicians/add', async (req, res) => {
  try {
    const { name, email, type_of_service, emp_id, type_id, designation_id, contact_number } = req.body;

    const { rows } = await pool.query(
      `INSERT INTO technicians (name, email, type_of_service, emp_id, type_id, designation_id, contact_number)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [name, email, type_of_service, emp_id || null, type_id || null, designation_id || null, contact_number || null]
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
