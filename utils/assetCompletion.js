const { pool } = require('../db');

// Shared by routes/workorders.js (POST /:id/complete, keyed by work_order id)
// and routes/vehicles.js (keyed by asset id, since a vehicle's insurance/
// registration/etc. is just a Document-type asset that may not have an open
// work_order yet). Both paths end up here so the tolerance/frequency renewal
// math only lives in one place.
//
// Renewal rule: if completed within tolerance_days of the original due date
// (early or only slightly late), the new expiry is original_due_date +
// frequency_days - the cycle stays anchored to schedule. If completed after
// the tolerance window has passed, the new expiry is today + frequency_days
// instead, so a badly overdue renewal doesn't inherit an already-stale
// schedule.
async function completeDocumentAsset(assetId, originalDueDate) {
  const { rows: assetRows } = await pool.query(
    `SELECT id, expiry_date, frequency_days, tolerance_days FROM assets WHERE id = $1`,
    [assetId]
  );
  const asset = assetRows[0];

  if (!asset) {
    throw new Error('Asset not found');
  }

  const frequencyDays = asset.frequency_days || 365;
  const toleranceDays = asset.tolerance_days || 0;
  // Fall back to the asset's own current expiry_date when there's no
  // work_order to read an original due date from (e.g. renewing a vehicle
  // document directly before the daily check ever created one).
  const dueDateForTolerance = originalDueDate || asset.expiry_date;

  const { rows } = await pool.query(
    `UPDATE assets
     SET last_completed_date = CURRENT_DATE,
         next_due_date = (
           CASE
             WHEN $3::date IS NOT NULL AND (CURRENT_DATE - $3::date) <= $2 THEN $3::date
             ELSE CURRENT_DATE
           END
         ) + ($1 || ' days')::interval,
         expiry_date = (
           CASE
             WHEN $3::date IS NOT NULL AND (CURRENT_DATE - $3::date) <= $2 THEN $3::date
             ELSE CURRENT_DATE
           END
         ) + ($1 || ' days')::interval
     WHERE id = $4
     RETURNING *`,
    [frequencyDays, toleranceDays, dueDateForTolerance, assetId]
  );

  return rows[0];
}

module.exports = { completeDocumentAsset };
