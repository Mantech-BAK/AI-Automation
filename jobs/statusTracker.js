const path = require('path');
const dotenv = require('dotenv');
const cron = require('node-cron');
const { pool } = require('../db');
const { graphRequest } = require('../graph/client');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

async function applyAssetRecurrence(assetId, maintenanceIntervalDays, taskType, frequencyDays) {
  // Documents/vehicle documents are configured via frequency_days (see
  // utils/assetCompletion.js and Change 2's tolerance-based renewal logic) -
  // maintenance_interval_days is the equipment-service-interval field and is
  // frequently null on document assets, which was silently producing a NULL
  // expiry_date here. Equipment keeps using maintenance_interval_days only,
  // unchanged, per the existing convention elsewhere in this codebase.
  const effectiveDays = taskType === 'document'
    ? (frequencyDays ?? maintenanceIntervalDays)
    : maintenanceIntervalDays;

  const { rows: beforeRows } = await pool.query(
    `SELECT expiry_date, next_due_date FROM assets WHERE id = $1`,
    [assetId]
  );
  const before = beforeRows[0] || {};

  let calculatedNewExpiry = null;
  if (effectiveDays != null) {
    const calculated = new Date();
    calculated.setHours(0, 0, 0, 0);
    calculated.setDate(calculated.getDate() + Number(effectiveDays));
    calculatedNewExpiry = calculated.toISOString().slice(0, 10);
  }

  console.log(
    `applyAssetRecurrence BEFORE: asset ${assetId} task_type=${taskType} ` +
    `current expiry_date=${before.expiry_date} frequency_days=${frequencyDays} ` +
    `maintenance_interval_days=${maintenanceIntervalDays} effective_days=${effectiveDays} ` +
    `calculated_new_expiry_date=${calculatedNewExpiry}`
  );

  if (effectiveDays == null) {
    console.warn(`applyAssetRecurrence: asset ${assetId} has neither frequency_days nor maintenance_interval_days set - skipping date update`);
    return before;
  }

  if (taskType === 'document') {
    // Renewing a document: today becomes the new registration date, and the
    // next expiry is calculated from today plus the interval - not from the
    // old expiry date, since the renewal itself resets the clock.
    const { rows, rowCount } = await pool.query(
      `UPDATE assets
       SET registration_date = CURRENT_DATE,
           last_completed_date = CURRENT_DATE,
           next_due_date = CURRENT_DATE + ($1 || ' days')::interval,
           expiry_date = CURRENT_DATE + ($1 || ' days')::interval
       WHERE id = $2
       RETURNING expiry_date, next_due_date`,
      [effectiveDays, assetId]
    );
    console.log(`applyAssetRecurrence AFTER: asset ${assetId} UPDATE affected ${rowCount} row(s), new expiry_date=${rows[0]?.expiry_date}`);
    return rows[0];
  }

  const { rows, rowCount } = await pool.query(
    `UPDATE assets
     SET last_completed_date = CURRENT_DATE,
         next_due_date = CURRENT_DATE + ($1 || ' days')::interval
     WHERE id = $2
     RETURNING expiry_date, next_due_date`,
    [effectiveDays, assetId]
  );
  console.log(`applyAssetRecurrence AFTER: asset ${assetId} UPDATE affected ${rowCount} row(s), new next_due_date=${rows[0]?.next_due_date}`);
  return rows[0];
}

// Logs the renewal/completion to notification_log so it shows up on the
// Notifications page alongside the daily-check-driven reminders. A document
// asset with a parent_asset_id is a vehicle's own document (insurance,
// registration, etc. - see utils/vehicleCategories.js) rather than a plain
// standalone document, so it gets its own notification type even though both
// share task_type = 'document'.
async function logCompletionNotification(workOrder, assetBefore, updatedDates) {
  const isVehicleDocument = workOrder.task_type === 'document' && assetBefore.parent_asset_id != null;

  const notificationType = workOrder.task_type === 'document'
    ? (isVehicleDocument ? 'vehicle_task_renewed' : 'document_renewed')
    : 'task_completed';

  // Documents/vehicle documents are tracked by expiry_date; equipment has no
  // expiry_date and is tracked by next_due_date instead.
  const oldExpiry = workOrder.task_type === 'document' ? assetBefore.expiry_date : assetBefore.next_due_date;
  const newExpiry = workOrder.task_type === 'document' ? updatedDates.expiry_date : updatedDates.next_due_date;

  // A vehicle document's own equipment_name is the task label (e.g.
  // "Insurance", "Registration") - the parent vehicle's own name is a
  // separate asset, looked up here so the notification can show both.
  let vehicleName = null;
  if (isVehicleDocument) {
    const { rows: parentRows } = await pool.query(
      `SELECT equipment_name FROM assets WHERE id = $1`,
      [assetBefore.parent_asset_id]
    );
    vehicleName = parentRows[0]?.equipment_name || null;
  }

  const notes = JSON.stringify({
    asset_id: assetBefore.id,
    document_name: assetBefore.equipment_name,
    department: assetBefore.site_location,
    old_expiry: oldExpiry,
    new_expiry: newExpiry,
    completed_by: assetBefore.responsible_person,
    ...(isVehicleDocument ? { vehicle_name: vehicleName, task_type: assetBefore.equipment_name } : {}),
  });

  await pool.query(
    `INSERT INTO notification_log (work_order_id, notification_type, sent_at, notes)
     VALUES ($1, $2, NOW(), $3)`,
    [workOrder.id, notificationType, notes]
  );
}

async function processWorkOrder(workOrder) {
  if (!workOrder.planner_task_id) {
    return;
  }

  let task;
  try {
    task = await graphRequest('GET', `/planner/tasks/${workOrder.planner_task_id}`, null, 'app');
  } catch (error) {
    if (error.status === 404) {
      // The Planner task was deleted (or never existed) on the Microsoft
      // Graph side - clear the stale id so this work order stops being
      // checked every cycle, instead of failing forever.
      await pool.query(
        `UPDATE work_orders SET planner_task_id = NULL WHERE id = $1`,
        [workOrder.id]
      );
      console.warn(`Planner task not found for work order ${workOrder.id} - clearing planner_task_id and skipping`);
      return;
    }

    console.error(`Status tracker Graph lookup failed for work order ${workOrder.id}:`, error);
    return;
  }

  const percentComplete = Number(task.percentComplete || 0);
  console.log(`Work order ${workOrder.id} percentComplete=${percentComplete}`);

  if (percentComplete !== 100 || workOrder.status === 'completed') {
    return;
  }

  console.log(`Marking work order ${workOrder.id} as completed`);

  const { rows: assetRows } = await pool.query(
    `SELECT id, equipment_name, site_location, responsible_person, expiry_date, next_due_date, parent_asset_id
     FROM assets WHERE id = $1`,
    [workOrder.asset_id]
  );
  const assetBefore = assetRows[0];

  await pool.query(
    `UPDATE work_orders
     SET status = 'completed', completed_at = NOW()
     WHERE id = $1`,
    [workOrder.id]
  );

  const updatedDates = await applyAssetRecurrence(workOrder.asset_id, workOrder.maintenance_interval_days, workOrder.task_type, workOrder.frequency_days);

  if (assetBefore && updatedDates) {
    await logCompletionNotification(workOrder, assetBefore, updatedDates);
  }
}

async function runStatusTracker() {
  const result = await pool.query(`
    SELECT wo.id,
           wo.status,
           wo.planner_task_id,
           wo.asset_id,
           wo.task_type,
           a.maintenance_interval_days,
           a.frequency_days
    FROM work_orders wo
    JOIN assets a ON a.id = wo.asset_id
    WHERE wo.status = 'open'
      AND wo.planner_task_id IS NOT NULL
  `);

  console.log(`Found ${result.rows.length} work orders to check`);

  for (const workOrder of result.rows) {
    console.log(`Checking work order ${workOrder.id} task_type=${workOrder.task_type} planner_task_id=${workOrder.planner_task_id}`);
    try {
      await processWorkOrder(workOrder);
    } catch (error) {
      console.error(`Status tracker failed for work order ${workOrder.id}:`, error);
    }
  }
}

function startStatusTracker() {
  cron.schedule('*/2 * * * *', async () => {
    console.log('Status tracker running - checking Planner task completions every 2 minutes');
    try {
      await runStatusTracker();
    } catch (error) {
      console.error('Status tracker job failed:', error);
    }
  });
}

module.exports = {
  startStatusTracker,
  runStatusTracker,
};
