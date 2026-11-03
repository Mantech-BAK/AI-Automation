const { pool } = require('../db');

// How long a session may go without re-reading its user row. Keeps role / permission changes (and deleted users)
// effective within seconds instead of at the next login.
const REFRESH_MS = 15000;

function toSessionUser(row) {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    allowed_departments: row.allowed_departments || [],
    allowed_item_types: row.allowed_item_types || [],
    allowed_categories: row.allowed_categories || [],
    // null = a user from before role-based access: legacy rules apply (see utils/permissions.js).
    permissions: row.permissions || null,
    refreshedAt: Date.now(),
  };
}

// Re-reads the signed-in user from the database when the session copy is stale. Returns the current user, or null when
// there is none (not signed in, or the account was deleted).
async function refreshSessionUser(req) {
  const current = req.session?.user;
  if (!current) return null;
  if (Date.now() - (current.refreshedAt || 0) < REFRESH_MS) return current;

  try {
    const { rows } = await pool.query(
      `SELECT id, email, name, role, allowed_departments, allowed_item_types, allowed_categories, permissions
       FROM users WHERE id = $1`,
      [current.id]
    );
    if (!rows[0]) {
      req.session.user = null;
      return null;
    }
    req.session.user = toSessionUser(rows[0]);
  } catch (error) {
    console.warn('Could not refresh session user:', error.message);
  }
  return req.session.user;
}

async function requireAuth(req, res, next) {
  const user = await refreshSessionUser(req);
  if (!user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

module.exports = {
  requireAuth,
  refreshSessionUser,
  toSessionUser,
};
