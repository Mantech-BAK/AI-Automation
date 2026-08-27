const express = require('express');
const { pool } = require('../db');

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT id, department_name, email, label
      FROM department_notification_emails
      ORDER BY department_name, email
    `);

    const grouped = new Map();
    for (const row of rows) {
      if (!grouped.has(row.department_name)) {
        grouped.set(row.department_name, []);
      }
      grouped.get(row.department_name).push({ id: row.id, email: row.email, label: row.label });
    }

    const result = [...grouped.entries()].map(([department_name, emails]) => ({ department_name, emails }));
    return res.json(result);
  } catch (error) {
    console.error('Notifications config query failed:', error);
    return res.status(500).json({ error: 'Failed to load notification configs' });
  }
});

router.get('/departments', async (req, res) => {
  try {
    const [configuredResult, allDepartmentsResult] = await Promise.all([
      pool.query(`SELECT DISTINCT department_name FROM department_notification_emails`),
      pool.query(`SELECT name FROM asset_departments ORDER BY name`),
    ]);

    const departmentNames = new Set([
      ...allDepartmentsResult.rows.map((r) => r.name),
      ...configuredResult.rows.map((r) => r.department_name),
    ]);

    return res.json([...departmentNames].sort());
  } catch (error) {
    console.error('Notifications config departments query failed:', error);
    return res.status(500).json({ error: 'Failed to load departments' });
  }
});

router.post('/add', async (req, res) => {
  try {
    const { department_name, email, label } = req.body;

    if (!department_name || !email) {
      return res.status(400).json({ error: 'department_name and email are required' });
    }

    const { rows } = await pool.query(
      `INSERT INTO department_notification_emails (department_name, email, label)
       VALUES ($1, $2, $3)
       RETURNING id, department_name, email, label`,
      [department_name, email, label || null]
    );

    return res.status(201).json(rows[0]);
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({ error: 'This email is already configured for this department' });
    }
    console.error('Add notification config failed:', error);
    return res.status(500).json({ error: 'Failed to add notification email' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const { rows } = await pool.query(
      `DELETE FROM department_notification_emails WHERE id = $1 RETURNING id`,
      [id]
    );

    if (!rows.length) {
      return res.status(404).json({ error: 'Notification email config not found' });
    }

    return res.json({ success: true });
  } catch (error) {
    console.error('Delete notification config failed:', error);
    return res.status(500).json({ error: 'Failed to delete notification email' });
  }
});

module.exports = router;
