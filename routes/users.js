const express = require('express');
const bcrypt = require('bcrypt');
const { pool } = require('../db');

const router = express.Router();

const VALID_ITEM_TYPES = ['Equipment', 'Document'];

function isStringArray(value) {
  return Array.isArray(value) && value.every((v) => typeof v === 'string');
}

function isValidItemTypesArray(value) {
  return Array.isArray(value) && value.every((v) => VALID_ITEM_TYPES.includes(v));
}

router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, email, name, role, allowed_departments, allowed_item_types, allowed_categories, created_at
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
      `INSERT INTO users (name, email, password_hash, role, allowed_departments, allowed_item_types, allowed_categories)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, email, name, role, allowed_departments, allowed_item_types, allowed_categories, created_at`,
      [
        name,
        email,
        passwordHash,
        role || 'user',
        JSON.stringify(allowed_departments || []),
        JSON.stringify(allowed_item_types || []),
        JSON.stringify(allowed_categories || []),
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

    if (role === undefined && allowed_departments === undefined && allowed_item_types === undefined && allowed_categories === undefined) {
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
      `SELECT role, allowed_departments, allowed_item_types, allowed_categories FROM users WHERE id = $1`,
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

    const { rows } = await pool.query(
      `UPDATE users SET role = $1, allowed_departments = $2, allowed_item_types = $3, allowed_categories = $4
       WHERE id = $5
       RETURNING id, email, name, role, allowed_departments, allowed_item_types, allowed_categories, created_at`,
      [
        nextRole,
        JSON.stringify(nextDepartments || []),
        JSON.stringify(nextItemTypes || []),
        JSON.stringify(nextCategories || []),
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
