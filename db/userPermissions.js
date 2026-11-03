// users.permissions - module / feature / sidebar access and data scope (see utils/permissions.js). Idempotent.
async function ensureUserPermissionsColumn(pool) {
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS permissions JSONB`);
}

module.exports = { ensureUserPermissionsColumn };
