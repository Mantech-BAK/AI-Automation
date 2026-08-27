const express = require('express');
const { pool } = require('../db');

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const { department, is_technician } = req.query;
    const conditions = [];
    const params = [];

    if (department) {
      params.push(department);
      conditions.push(`e.department_text = $${params.length}`);
    }

    if (is_technician === 'true') {
      conditions.push(`e.is_technician = true`);
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const { rows } = await pool.query(
      `
      SELECT
        e.id,
        e.emp_id,
        e.name,
        e.email,
        e.contact_number,
        e.is_technician,
        e.department_text,
        e.designation_text,
        e.religion_text,
        e.nationality,
        e.gender,
        e.cost_center,
        d.name AS designation_name,
        ad.name AS department_name,
        et.name AS employee_type_name,
        r.name AS religion_name,
        o.name AS origin_name,
        manager.name AS reports_to_name,
        manager.emp_id AS reports_to_emp_id
      FROM employees e
      LEFT JOIN designations d ON d.id = e.designation_id
      LEFT JOIN asset_departments ad ON ad.id = e.department_id
      LEFT JOIN employee_types et ON et.id = e.employee_type_id
      LEFT JOIN religions r ON r.id = e.religion_id
      LEFT JOIN origins o ON o.id = e.origin_id
      LEFT JOIN employees manager ON manager.id = e.reports_to
      ${whereClause}
      ORDER BY e.name
    `,
      params
    );
    return res.json(rows);
  } catch (error) {
    console.error('Employees query failed:', error);
    return res.status(500).json({ error: 'Failed to load employees' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const { rows } = await pool.query(
      `
      SELECT
        e.*,
        d.name AS designation_name,
        ad.name AS department_name,
        et.name AS employee_type_name,
        r.name AS religion_name,
        o.name AS origin_name,
        manager.name AS reports_to_name,
        manager.emp_id AS reports_to_emp_id
      FROM employees e
      LEFT JOIN designations d ON d.id = e.designation_id
      LEFT JOIN asset_departments ad ON ad.id = e.department_id
      LEFT JOIN employee_types et ON et.id = e.employee_type_id
      LEFT JOIN religions r ON r.id = e.religion_id
      LEFT JOIN origins o ON o.id = e.origin_id
      LEFT JOIN employees manager ON manager.id = e.reports_to
      WHERE e.id = $1
      `,
      [id]
    );

    if (!rows.length) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    return res.json(rows[0]);
  } catch (error) {
    console.error('Employee lookup failed:', error);
    return res.status(500).json({ error: 'Failed to load employee' });
  }
});

router.post('/add', async (req, res) => {
  try {
    const {
      emp_id,
      name,
      email,
      contact_number,
      designation_id,
      department_id,
      employee_type_id,
      religion_id,
      origin_id,
      reports_to,
      is_technician,
    } = req.body;

    if (!emp_id || !name) {
      return res.status(400).json({ error: 'emp_id and name are required' });
    }

    let reportsToId = null;
    if (reports_to) {
      const managerResult = await pool.query(`SELECT id FROM employees WHERE emp_id = $1`, [reports_to]);
      reportsToId = managerResult.rows[0]?.id || null;
    }

    const { rows } = await pool.query(
      `INSERT INTO employees (
         emp_id, name, email, contact_number, designation_id, department_id,
         employee_type_id, religion_id, origin_id, reports_to, is_technician
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING *`,
      [
        emp_id,
        name,
        email || null,
        contact_number || null,
        designation_id || null,
        department_id || null,
        employee_type_id || null,
        religion_id || null,
        origin_id || null,
        reportsToId,
        Boolean(is_technician),
      ]
    );

    const employee = rows[0];

    if (is_technician) {
      await pool.query(
        `INSERT INTO technicians (
           name, email, type_of_service, emp_id, type_id, designation_id,
           contact_number, employee_id, reports_to_emp_id
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          name,
          email || null,
          'general',
          emp_id,
          employee_type_id || null,
          designation_id || null,
          contact_number || null,
          employee.id,
          reports_to || null,
        ]
      );
    }

    return res.status(201).json(employee);
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({ error: 'An employee with this emp_id or email already exists' });
    }
    console.error('Add employee failed:', error);
    return res.status(500).json({ error: 'Failed to add employee' });
  }
});

router.put('/:id/update', async (req, res) => {
  try {
    const { id } = req.params;
    const {
      name,
      designation_text,
      department_text,
      religion_text,
      nationality,
      gender,
      cost_center,
      reports_to_name,
      is_technician,
    } = req.body;

    const { rows: existingRows } = await pool.query(`SELECT * FROM employees WHERE id = $1`, [id]);
    const existing = existingRows[0];

    if (!existing) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    const nextIsTechnician = typeof is_technician === 'boolean' ? is_technician : existing.is_technician;

    const { rows } = await pool.query(
      `UPDATE employees SET
         name = $1,
         designation_text = $2,
         department_text = $3,
         religion_text = $4,
         nationality = $5,
         gender = $6,
         cost_center = $7,
         reports_to_name = $8,
         is_technician = $9
       WHERE id = $10
       RETURNING *`,
      [
        name !== undefined ? name : existing.name,
        designation_text !== undefined ? designation_text : existing.designation_text,
        department_text !== undefined ? department_text : existing.department_text,
        religion_text !== undefined ? religion_text : existing.religion_text,
        nationality !== undefined ? nationality : existing.nationality,
        gender !== undefined ? gender : existing.gender,
        cost_center !== undefined ? cost_center : existing.cost_center,
        reports_to_name !== undefined ? reports_to_name : existing.reports_to_name,
        nextIsTechnician,
        id,
      ]
    );

    const updated = rows[0];

    if (nextIsTechnician) {
      const { rows: techRows } = await pool.query(`SELECT id FROM technicians WHERE employee_id = $1`, [id]);
      if (!techRows.length) {
        await pool.query(
          `INSERT INTO technicians (name, email, type_of_service, emp_id, employee_id, reports_to_emp_id, notification_email)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT (emp_id) DO NOTHING`,
          [updated.name, null, 'general', updated.emp_id, updated.id, null, null]
        );
      }
    }

    return res.json(updated);
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({ error: 'An employee with this emp_id or email already exists' });
    }
    console.error('Update employee failed:', error);
    return res.status(500).json({ error: 'Failed to update employee' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    await pool.query(`DELETE FROM technicians WHERE employee_id = $1`, [id]);

    const { rows } = await pool.query(`DELETE FROM employees WHERE id = $1 RETURNING id`, [id]);

    if (!rows.length) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    return res.json({ success: true });
  } catch (error) {
    console.error('Delete employee failed:', error);
    return res.status(500).json({ error: 'Failed to delete employee' });
  }
});

module.exports = router;
