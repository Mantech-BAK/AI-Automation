const express = require('express');
const { pool } = require('../db');
const { toTitleCase } = require('../utils/text');

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        v.*,
        COUNT(vt.id)::int AS total_tasks,
        COUNT(vt.id) FILTER (WHERE vt.status != 'completed' AND vt.expiry_date IS NOT NULL AND vt.expiry_date < CURRENT_DATE)::int AS expired_tasks,
        COUNT(vt.id) FILTER (WHERE vt.status != 'completed' AND vt.expiry_date IS NOT NULL AND vt.expiry_date >= CURRENT_DATE AND vt.expiry_date <= CURRENT_DATE + INTERVAL '30 days')::int AS expiring_tasks
      FROM vehicles v
      LEFT JOIN vehicle_tasks vt ON vt.vehicle_id = v.id
      GROUP BY v.id
      ORDER BY v.vehicle_no
    `);
    return res.json(rows);
  } catch (error) {
    console.error('Load vehicles failed:', error);
    return res.status(500).json({ error: 'Failed to load vehicles' });
  }
});

router.get('/tasks/upcoming', async (req, res) => {
  try {
    const days = req.query.days ? Number(req.query.days) : 30;
    const { rows } = await pool.query(
      `
      SELECT
        vt.*,
        v.vehicle_no,
        v.vehicle_name,
        v.department,
        v.site_location,
        v.incharge
      FROM vehicle_tasks vt
      JOIN vehicles v ON v.id = vt.vehicle_id
      WHERE vt.status != 'completed'
        AND vt.expiry_date IS NOT NULL
        AND vt.expiry_date <= CURRENT_DATE + ($1 || ' days')::INTERVAL
      ORDER BY vt.expiry_date ASC NULLS LAST
    `,
      [days]
    );
    return res.json(rows);
  } catch (error) {
    console.error('Load upcoming vehicle tasks failed:', error);
    return res.status(500).json({ error: 'Failed to load upcoming vehicle tasks' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const { rows: vehicleRows } = await pool.query(`SELECT * FROM vehicles WHERE id = $1`, [id]);
    const vehicle = vehicleRows[0];

    if (!vehicle) {
      return res.status(404).json({ error: 'Vehicle not found' });
    }

    const { rows: tasks } = await pool.query(
      `SELECT * FROM vehicle_tasks WHERE vehicle_id = $1 ORDER BY expiry_date NULLS LAST, id`,
      [id]
    );

    return res.json({ ...vehicle, tasks });
  } catch (error) {
    console.error('Load vehicle failed:', error);
    return res.status(500).json({ error: 'Failed to load vehicle' });
  }
});

router.post('/add', async (req, res) => {
  try {
    const { vehicle_no, vehicle_name, vehicle_type, model, cr_no, department, site_location, incharge, remarks } = req.body;

    if (!vehicle_no || !vehicle_name) {
      return res.status(400).json({ error: 'vehicle_no and vehicle_name are required' });
    }

    const { rows } = await pool.query(
      `INSERT INTO vehicles (vehicle_no, vehicle_name, vehicle_type, model, cr_no, department, site_location, incharge, remarks)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        vehicle_no,
        vehicle_name,
        vehicle_type || null,
        model || null,
        cr_no || null,
        toTitleCase(department) || null,
        toTitleCase(site_location) || null,
        incharge || null,
        remarks || null,
      ]
    );

    return res.status(201).json(rows[0]);
  } catch (error) {
    console.error('Add vehicle failed:', error);
    return res.status(500).json({ error: 'Failed to add vehicle' });
  }
});

router.put('/:id/update', async (req, res) => {
  try {
    const { id } = req.params;
    const { vehicle_no, vehicle_name, vehicle_type, model, cr_no, department, site_location, incharge, remarks } = req.body;

    const { rows } = await pool.query(
      `UPDATE vehicles SET
         vehicle_no = $1,
         vehicle_name = $2,
         vehicle_type = $3,
         model = $4,
         cr_no = $5,
         department = $6,
         site_location = $7,
         incharge = $8,
         remarks = $9
       WHERE id = $10
       RETURNING *`,
      [
        vehicle_no,
        vehicle_name,
        vehicle_type || null,
        model || null,
        cr_no || null,
        toTitleCase(department) || null,
        toTitleCase(site_location) || null,
        incharge || null,
        remarks || null,
        id,
      ]
    );

    if (!rows.length) {
      return res.status(404).json({ error: 'Vehicle not found' });
    }

    return res.json(rows[0]);
  } catch (error) {
    console.error('Update vehicle failed:', error);
    return res.status(500).json({ error: 'Failed to update vehicle' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { rows } = await pool.query(`DELETE FROM vehicles WHERE id = $1 RETURNING id`, [id]);

    if (!rows.length) {
      return res.status(404).json({ error: 'Vehicle not found' });
    }

    return res.json({ success: true });
  } catch (error) {
    console.error('Delete vehicle failed:', error);
    return res.status(500).json({ error: 'Failed to delete vehicle' });
  }
});

router.get('/:id/tasks', async (req, res) => {
  try {
    const { id } = req.params;
    const { rows } = await pool.query(
      `SELECT * FROM vehicle_tasks WHERE vehicle_id = $1 ORDER BY expiry_date NULLS LAST, id`,
      [id]
    );
    return res.json(rows);
  } catch (error) {
    console.error('Load vehicle tasks failed:', error);
    return res.status(500).json({ error: 'Failed to load vehicle tasks' });
  }
});

router.post('/:id/tasks/add', async (req, res) => {
  try {
    const { id } = req.params;
    const { task_name, task_type, expiry_date, registration_date, reminder_days, frequency_days } = req.body;

    if (!task_name || !task_type) {
      return res.status(400).json({ error: 'task_name and task_type are required' });
    }

    const { rows: vehicleRows } = await pool.query(`SELECT id FROM vehicles WHERE id = $1`, [id]);
    if (!vehicleRows.length) {
      return res.status(404).json({ error: 'Vehicle not found' });
    }

    const { rows } = await pool.query(
      `INSERT INTO vehicle_tasks (vehicle_id, task_name, task_type, expiry_date, registration_date, reminder_days, frequency_days)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [id, task_name, task_type, expiry_date || null, registration_date || null, reminder_days || 30, frequency_days || 365]
    );

    return res.status(201).json(rows[0]);
  } catch (error) {
    console.error('Add vehicle task failed:', error);
    return res.status(500).json({ error: 'Failed to add vehicle task' });
  }
});

router.put('/tasks/:task_id/update', async (req, res) => {
  try {
    const { task_id } = req.params;
    const { task_name, task_type, expiry_date, registration_date, reminder_days, frequency_days } = req.body;

    const { rows } = await pool.query(
      `UPDATE vehicle_tasks SET
         task_name = COALESCE($1, task_name),
         task_type = COALESCE($2, task_type),
         expiry_date = $3,
         registration_date = $4,
         reminder_days = COALESCE($5, reminder_days),
         frequency_days = COALESCE($6, frequency_days)
       WHERE id = $7
       RETURNING *`,
      [task_name || null, task_type || null, expiry_date || null, registration_date || null, reminder_days || null, frequency_days || null, task_id]
    );

    if (!rows.length) {
      return res.status(404).json({ error: 'Vehicle task not found' });
    }

    return res.json(rows[0]);
  } catch (error) {
    console.error('Update vehicle task failed:', error);
    return res.status(500).json({ error: 'Failed to update vehicle task' });
  }
});

router.put('/tasks/:task_id/complete', async (req, res) => {
  try {
    const { task_id } = req.params;

    const { rows: taskRows } = await pool.query(`SELECT * FROM vehicle_tasks WHERE id = $1`, [task_id]);
    const task = taskRows[0];

    if (!task) {
      return res.status(404).json({ error: 'Vehicle task not found' });
    }

    const frequencyDays = task.frequency_days || 365;

    // Renewing in place: the new expiry is calculated from the OLD expiry
    // date plus the renewal frequency (not from today), and registration_date
    // is left untouched. planner_task_id is cleared so the daily check can
    // create a fresh Planner task when this task's next reminder fires.
    const { rows } = await pool.query(
      `UPDATE vehicle_tasks SET
         status = 'open',
         completed_at = NOW(),
         planner_task_id = NULL,
         expiry_date = COALESCE(expiry_date, CURRENT_DATE) + ($1 || ' days')::interval
       WHERE id = $2
       RETURNING *`,
      [frequencyDays, task_id]
    );

    return res.json(rows[0]);
  } catch (error) {
    console.error('Complete vehicle task failed:', error);
    return res.status(500).json({ error: 'Failed to complete vehicle task' });
  }
});

router.delete('/tasks/:task_id', async (req, res) => {
  try {
    const { task_id } = req.params;
    const { rows } = await pool.query(`DELETE FROM vehicle_tasks WHERE id = $1 RETURNING id`, [task_id]);

    if (!rows.length) {
      return res.status(404).json({ error: 'Vehicle task not found' });
    }

    return res.json({ success: true });
  } catch (error) {
    console.error('Delete vehicle task failed:', error);
    return res.status(500).json({ error: 'Failed to delete vehicle task' });
  }
});

module.exports = router;
