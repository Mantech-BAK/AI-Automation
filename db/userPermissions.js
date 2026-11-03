// users.permissions / users.designation - module / feature / sidebar access and data scope (see utils/permissions.js). Idempotent.
async function ensureUserPermissionsColumn(pool) {
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS permissions JSONB`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS designation VARCHAR(100)`);
}

module.exports = { ensureUserPermissionsColumn };
