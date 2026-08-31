const express = require('express');
const bcrypt = require('bcrypt');
const { pool } = require('../db');

const router = express.Router();

const VALID_PERMISSIONS = ['equipment', 'document', 'vehicles'];

function isValidPermissionsArray(permissions) {
  return Array.isArray(permissions) && permissions.every((p) => VALID_PERMISSIONS.includes(p));
}

router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, email, name, role, permissions, created_at FROM users ORDER BY created_at DESC`
    );
    return res.json(rows);
  } catch (error) {
    console.error('Load users failed:', error);
    return res.status(500).json({ error: 'Failed to load users' });
  }
});

router.post('/add', async (req, res) => {
  try {
    const { name, email, password, role, permissions } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Name, email, and password are required' });
    }

    if (role && role !== 'admin' && role !== 'user') {
      return res.status(400).json({ error: 'Role must be admin or user' });
    }

    if (permissions !== undefined && !isValidPermissionsArray(permissions)) {
      return res.status(400).json({ error: `Permissions must be an array containing only: ${VALID_PERMISSIONS.join(', ')}` });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const { rows } = await pool.query(
      `INSERT INTO users (name, email, password_hash, role, permissions)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, email, name, role, permissions, created_at`,
      [name, email, passwordHash, role || 'user', JSON.stringify(permissions || [])]
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
    const { role, permissions } = req.body;

    if (role === undefined && permissions === undefined) {
      return res.status(400).json({ error: 'Provide role and/or permissions to update' });
    }

    if (role !== undefined && role !== 'admin' && role !== 'user') {
      return res.status(400).json({ error: 'Role must be admin or user' });
    }

    if (permissions !== undefined && !isValidPermissionsArray(permissions)) {
      return res.status(400).json({ error: `Permissions must be an array containing only: ${VALID_PERMISSIONS.join(', ')}` });
    }

    const { rows: existingRows } = await pool.query(`SELECT role, permissions FROM users WHERE id = $1`, [id]);
    const existing = existingRows[0];

    if (!existing) {
      return res.status(404).json({ error: 'User not found' });
    }

    const nextRole = role !== undefined ? role : existing.role;
    const nextPermissions = permissions !== undefined ? permissions : existing.permissions;

    const { rows } = await pool.query(
      `UPDATE users SET role = $1, permissions = $2 WHERE id = $3 RETURNING id, email, name, role, permissions, created_at`,
      [nextRole, JSON.stringify(nextPermissions || []), id]
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
