const express = require('express');
const bcrypt = require('bcrypt');
const { pool } = require('../db');
const { sanitizePermissions } = require('../utils/permissions');

const router = express.Router();

const VALID_ITEM_TYPES = ['Equipment', 'Document', 'Project'];

// Free text (Salesman, Engineer, ...): trimmed, blank means none.
function cleanDesignation(value) {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, 100);
  return text || null;
}

function isStringArray(value) {
  return Array.isArray(value) && value.every((v) => typeof v === 'string');
}

function isValidItemTypesArray(value) {
  return Array.isArray(value) && value.every((v) => VALID_ITEM_TYPES.includes(v));
}

// Only administrators manage users.
router.use((req, res, next) => {
  if (req.session?.user?.role !== 'admin') return res.status(403).json({ error: 'Administrators only' });
  next();
});

const USER_COLUMNS = 'id, email, name, role, allowed_departments, allowed_item_types, allowed_categories, permissions, designation, created_at';

router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT ${USER_COLUMNS}
       FROM users ORDER BY created_at DESC`
    );
    return res.json(rows);
  } catch (error) {
    console.error('Load users failed:', error);
    return res.status(500).json({ error: 'Failed to load users' });
  }
});

router.post('/add', async (req, res) => {
  try {
    const { name, email, password, role, allowed_departments, allowed_item_types, allowed_categories } = req.body;
    const designation = cleanDesignation(req.body.designation);
    let permissions = null;
    try {
      if (req.body.permissions !== undefined && req.body.permissions !== null) permissions = sanitizePermissions(req.body.permissions);
    } catch (validationError) {
      return res.status(400).json({ error: validationError.message });
    }

    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Name, email, and password are required' });
    }

    if (role && role !== 'admin' && role !== 'user') {
      return res.status(400).json({ error: 'Role must be admin or user' });
    }

    if (allowed_departments !== undefined && !isStringArray(allowed_departments)) {
      return res.status(400).json({ error: 'allowed_departments must be an array of strings' });
    }

    if (allowed_item_types !== undefined && !isValidItemTypesArray(allowed_item_types)) {
      return res.status(400).json({ error: `allowed_item_types must be an array containing only: ${VALID_ITEM_TYPES.join(', ')}` });
    }

    if (allowed_categories !== undefined && !isStringArray(allowed_categories)) {
      return res.status(400).json({ error: 'allowed_categories must be an array of strings' });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const { rows } = await pool.query(
      `INSERT INTO users (name, email, password_hash, role, allowed_departments, allowed_item_types, allowed_categories, permissions, designation)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING ${USER_COLUMNS}`,
      [
        name,
        email,
        passwordHash,
        role || 'user',
        JSON.stringify(allowed_departments || []),
        JSON.stringify(allowed_item_types || []),
        JSON.stringify(allowed_categories || []),
        permissions ? JSON.stringify(permissions) : null,
        designation,
      ]
    );

    return res.status(201).json(rows[0]);
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({ error: 'A user with this email already exists' });
    }
    console.error('Add user failed:', error);
    return res.status(500).json({ error: 'Failed to add user' });
  }
});

router.put('/:id/update', async (req, res) => {
  try {
    const { id } = req.params;
    const { role, allowed_departments, allowed_item_types, allowed_categories } = req.body;
    let permissions;
    try {
      if (req.body.permissions !== undefined) permissions = req.body.permissions === null ? null : sanitizePermissions(req.body.permissions);
    } catch (validationError) {
      return res.status(400).json({ error: validationError.message });
    }

    if (role === undefined && allowed_departments === undefined && allowed_item_types === undefined && allowed_categories === undefined && permissions === undefined && req.body.designation === undefined) {
      return res.status(400).json({ error: 'Provide role and/or permission fields to update' });
    }

    if (role !== undefined && role !== 'admin' && role !== 'user') {
      return res.status(400).json({ error: 'Role must be admin or user' });
    }

    if (allowed_departments !== undefined && !isStringArray(allowed_departments)) {
      return res.status(400).json({ error: 'allowed_departments must be an array of strings' });
    }

    if (allowed_item_types !== undefined && !isValidItemTypesArray(allowed_item_types)) {
      return res.status(400).json({ error: `allowed_item_types must be an array containing only: ${VALID_ITEM_TYPES.join(', ')}` });
    }

    if (allowed_categories !== undefined && !isStringArray(allowed_categories)) {
      return res.status(400).json({ error: 'allowed_categories must be an array of strings' });
    }

    const { rows: existingRows } = await pool.query(
      `SELECT role, allowed_departments, allowed_item_types, allowed_categories, permissions, designation FROM users WHERE id = $1`,
      [id]
    );
    const existing = existingRows[0];

    if (!existing) {
      return res.status(404).json({ error: 'User not found' });
    }

    const nextRole = role !== undefined ? role : existing.role;
    const nextDepartments = allowed_departments !== undefined ? allowed_departments : existing.allowed_departments;
    const nextItemTypes = allowed_item_types !== undefined ? allowed_item_types : existing.allowed_item_types;
    const nextCategories = allowed_categories !== undefined ? allowed_categories : existing.allowed_categories;
    const nextPermissions = permissions !== undefined ? permissions : existing.permissions;
    const nextDesignation = req.body.designation !== undefined ? cleanDesignation(req.body.designation) : existing.designation;

    const { rows } = await pool.query(
      `UPDATE users SET role = $1, allowed_departments = $2, allowed_item_types = $3, allowed_categories = $4, permissions = $5, designation = $6
       WHERE id = $7
       RETURNING ${USER_COLUMNS}`,
      [
        nextRole,
        JSON.stringify(nextDepartments || []),
        JSON.stringify(nextItemTypes || []),
        JSON.stringify(nextCategories || []),
        nextPermissions ? JSON.stringify(nextPermissions) : null,
        nextDesignation,
        id,
      ]
    );

    return res.json(rows[0]);
  } catch (error) {
    console.error('Update user failed:', error);
    return res.status(500).json({ error: 'Failed to update user' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    if (req.session?.user?.id === Number(id)) {
      return res.status(400).json({ error: 'You cannot delete your own account while logged in' });
    }

    const { rows } = await pool.query(`DELETE FROM users WHERE id = $1 RETURNING id`, [id]);

    if (!rows.length) {
      return res.status(404).json({ error: 'User not found' });
    }

    return res.json({ success: true });
  } catch (error) {
    console.error('Delete user failed:', error);
    return res.status(500).json({ error: 'Failed to delete user' });
  }
});

module.exports = router;
