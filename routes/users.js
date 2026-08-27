const express = require('express');
const bcrypt = require('bcrypt');
const { pool } = require('../db');

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, email, name, role, created_at FROM users ORDER BY created_at DESC`
    );
    return res.json(rows);
  } catch (error) {
    console.error('Load users failed:', error);
    return res.status(500).json({ error: 'Failed to load users' });
  }
});

router.post('/add', async (req, res) => {
  try {
    const { name, email, password, role } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Name, email, and password are required' });
    }

    if (role && role !== 'admin' && role !== 'user') {
      return res.status(400).json({ error: 'Role must be admin or user' });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const { rows } = await pool.query(
      `INSERT INTO users (name, email, password_hash, role)
       VALUES ($1, $2, $3, $4)
       RETURNING id, email, name, role, created_at`,
      [name, email, passwordHash, role || 'user']
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
    const { role } = req.body;

    if (role !== 'admin' && role !== 'user') {
      return res.status(400).json({ error: 'Role must be admin or user' });
    }

    const { rows } = await pool.query(
      `UPDATE users SET role = $1 WHERE id = $2 RETURNING id, email, name, role, created_at`,
      [role, id]
    );

    if (!rows.length) {
      return res.status(404).json({ error: 'User not found' });
    }

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
