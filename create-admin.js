const bcrypt = require('bcrypt');
const { pool } = require('./db');

const ADMIN_EMAIL = 'mcs.sw01@bakgroup.net';
const ADMIN_PASSWORD = 'Admin1234';
const ADMIN_NAME = 'Yasir Ismail';

async function createAdmin() {
  try {
    const existing = await pool.query(
      `SELECT id FROM users WHERE email = $1 LIMIT 1`,
      [ADMIN_EMAIL]
    );

    if (existing.rows.length) {
      console.log('Admin user already exists.');
      return;
    }

    const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 10);

    await pool.query(
      `INSERT INTO users (email, password_hash, name, role)
       VALUES ($1, $2, $3, 'admin')`,
      [ADMIN_EMAIL, passwordHash, ADMIN_NAME]
    );

    console.log('Admin user created successfully.');
  } catch (error) {
    console.error('Failed to create admin user:', error);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

createAdmin();
