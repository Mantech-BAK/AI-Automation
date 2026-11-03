// Idempotent schema step for the Documents module: dedicated cr_no / license_no
// columns and a full-timestamp processed_at. Safe to run on every start; also
// called from db/migrate.js. Backfills existing rows from extracted_data.
const { findCrNo, findLicenseNo, stripPrintedFields } = require('../utils/documentFields');

async function ensureDocumentColumns(pool) {
  await pool.query(`
    ALTER TABLE assets ADD COLUMN IF NOT EXISTS cr_no VARCHAR;
    ALTER TABLE assets ADD COLUMN IF NOT EXISTS license_no VARCHAR;
    ALTER TABLE assets ADD COLUMN IF NOT EXISTS processed_at TIMESTAMPTZ;
    ALTER TABLE assets ADD COLUMN IF NOT EXISTS sent_by VARCHAR;
    ALTER TABLE assets ADD COLUMN IF NOT EXISTS planner_task_id VARCHAR;
  `);

  // Documents whose renewal task was created before assets.planner_task_id existed: take the id from the open work order.
  await pool.query(
    `UPDATE assets a SET planner_task_id = wo.planner_task_id
     FROM work_orders wo
     WHERE wo.asset_id = a.id AND wo.task_type = 'document' AND wo.status NOT IN ('completed', 'rejected')
       AND wo.planner_task_id IS NOT NULL AND a.planner_task_id IS NULL
       AND a.type_id = (SELECT id FROM asset_types WHERE name = 'Document')`
  );

  // sent_by = who emailed the document (read-only); responsible_person = who it is assigned to (editable).
  // Until now responsible_person held the sender: move it to sent_by and leave responsible_person empty so it can
  // be assigned separately. One-off - once sent_by is filled the row no longer matches.
  await pool.query(
    `UPDATE assets SET sent_by = responsible_person, responsible_person = NULL
     WHERE sent_by IS NULL AND responsible_person IS NOT NULL AND extracted_data IS NOT NULL
       AND type_id = (SELECT id FROM asset_types WHERE name = 'Document')`
  );

  // processed_at replaces the AI-extracted "printed date": for rows processed before this
  // column existed, last_received_at (set to NOW() on each processing, stored as UTC) is the best value.
  await pool.query(
    `UPDATE assets SET processed_at = last_received_at AT TIME ZONE 'UTC'
     WHERE processed_at IS NULL AND last_received_at IS NOT NULL AND extracted_data IS NOT NULL`
  );

  const { rows } = await pool.query(
    `SELECT id, extracted_data, cr_no, license_no FROM assets WHERE extracted_data IS NOT NULL`
  );
  let changed = 0;
  for (const row of rows) {
    const data = row.extracted_data;
    const hadPrinted = Object.keys(data).some((key) => /^print(ed)?(_|$)/i.test(key));
    const cr = row.cr_no || findCrNo(data);
    const license = row.license_no || findLicenseNo(data);
    if (!hadPrinted && cr === row.cr_no && license === row.license_no) continue;
    stripPrintedFields(data);
    await pool.query(`UPDATE assets SET cr_no = $1, license_no = $2, extracted_data = $3::jsonb WHERE id = $4`, [
      cr,
      license,
      JSON.stringify(data),
      row.id,
    ]);
    changed++;
  }
  return changed;
}

module.exports = { ensureDocumentColumns };
