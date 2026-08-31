const path = require('path');
const dotenv = require('dotenv');
const cron = require('node-cron');
const { pool } = require('../db');
const { graphRequest } = require('../graph/client');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

async function applyAssetRecurrence(assetId, maintenanceIntervalDays, taskType) {
  if (taskType === 'document') {
    // Renewing a document: today becomes the new registration date, and the
    // next expiry is calculated from today plus the interval - not from the
    // old expiry date, since the renewal itself resets the clock.
    await pool.query(
      `UPDATE assets
       SET registration_date = CURRENT_DATE,
           last_completed_date = CURRENT_DATE,
           next_due_date = CURRENT_DATE + ($1 || ' days')::interval,
           expiry_date = CURRENT_DATE + ($1 || ' days')::interval
       WHERE id = $2`,
      [maintenanceIntervalDays, assetId]
    );
    return;
  }

  await pool.query(
    `UPDATE assets
     SET last_completed_date = CURRENT_DATE,
         next_due_date = CURRENT_DATE + ($1 || ' days')::interval
     WHERE id = $2`,
    [maintenanceIntervalDays, assetId]
  );
}

async function processWorkOrder(workOrder) {
  if (!workOrder.planner_task_id) {
    return;
  }

  const task = await graphRequest('GET', `/planner/tasks/${workOrder.planner_task_id}`, null, 'delegated');
  const percentComplete = Number(task.percentComplete || 0);

  if (percentComplete !== 100 || workOrder.status === 'completed') {
    return;
  }

  await pool.query(
    `UPDATE work_orders
     SET status = 'completed', completed_at = NOW()
     WHERE id = $1`,
    [workOrder.id]
  );

  await applyAssetRecurrence(workOrder.asset_id, workOrder.maintenance_interval_days, workOrder.task_type);
}

async function runStatusTracker() {
  const result = await pool.query(`
    SELECT wo.id,
           wo.status,
           wo.planner_task_id,
           wo.asset_id,
           wo.task_type,
           a.maintenance_interval_days
    FROM work_orders wo
    JOIN assets a ON a.id = wo.asset_id
    WHERE wo.status = 'open'
      AND wo.planner_task_id IS NOT NULL
  `);

  for (const workOrder of result.rows) {
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
