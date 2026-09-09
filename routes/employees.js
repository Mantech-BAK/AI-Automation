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
      conditions.push(`ad.name ILIKE $${params.length}`);
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
        e.nationality,
        e.gender,
        e.cost_center,
        e.designation_id,
        e.department_id,
        e.employee_type_id,
        e.religion_id,
        e.origin_id,
        d.name AS designation,
        ad.name AS department,
        et.name AS employee_type,
        r.name AS religion,
        o.name AS origin,
        manager.id AS reports_to_id,
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

    // reports_to arrives as the manager's employees.id (integer) directly now.
    const reportsToId = reports_to ? Number(reports_to) : null;

    // technicians is retired - a technician is just an employee row with
    // is_technician = true, so type_of_service now lives on employees
    // directly. 'general' matches the old technicians-row default.
    const { rows } = await pool.query(
      `INSERT INTO employees (
         emp_id, name, email, contact_number, designation_id, department_id,
         employee_type_id, religion_id, origin_id, reports_to, is_technician, type_of_service
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
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
        is_technician ? 'general' : null,
      ]
    );

    return res.status(201).json(rows[0]);
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
      designation_id,
      department_id,
      employee_type_id,
      religion_id,
      origin_id,
      reports_to,
      nationality,
      gender,
      cost_center,
      is_technician,
    } = req.body;

    const { rows: existingRows } = await pool.query(`SELECT * FROM employees WHERE id = $1`, [id]);
    const existing = existingRows[0];

    if (!existing) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    const nextIsTechnician = typeof is_technician === 'boolean' ? is_technician : existing.is_technician;

    // technicians is retired - a technician is just an employee row with
    // is_technician = true. Default type_of_service to 'general' on
    // conversion (matches the old technicians-row default) if not already set.
    const nextTypeOfService = nextIsTechnician ? (existing.type_of_service || 'general') : existing.type_of_service;

    // reports_to arrives as the manager's employees.id (integer) directly now.
    let reportsToId = existing.reports_to;
    if (reports_to !== undefined) {
      reportsToId = reports_to ? Number(reports_to) : null;
    }

    const { rows } = await pool.query(
      `UPDATE employees SET
         name = $1,
         designation_id = $2,
         department_id = $3,
         employee_type_id = $4,
         religion_id = $5,
         origin_id = $6,
         reports_to = $7,
         nationality = $8,
         gender = $9,
         cost_center = $10,
         is_technician = $11,
         type_of_service = $12
       WHERE id = $13
       RETURNING *`,
      [
        name !== undefined ? name : existing.name,
        designation_id !== undefined ? designation_id : existing.designation_id,
        department_id !== undefined ? department_id : existing.department_id,
        employee_type_id !== undefined ? employee_type_id : existing.employee_type_id,
        religion_id !== undefined ? religion_id : existing.religion_id,
        origin_id !== undefined ? origin_id : existing.origin_id,
        reportsToId,
        nationality !== undefined ? nationality : existing.nationality,
        gender !== undefined ? gender : existing.gender,
        cost_center !== undefined ? cost_center : existing.cost_center,
        nextIsTechnician,
        nextTypeOfService,
        id,
      ]
    );

    return res.json(rows[0]);
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
