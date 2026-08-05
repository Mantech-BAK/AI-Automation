const path = require('path');
const dotenv = require('dotenv');
const cron = require('node-cron');
const { pool } = require('../db');
const { graphRequest } = require('../graph/client');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

async function applyAssetRecurrence(assetId, maintenanceIntervalDays) {
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

  await applyAssetRecurrence(workOrder.asset_id, workOrder.maintenance_interval_days);
}

async function runStatusTracker() {
  const result = await pool.query(`
    SELECT wo.id,
           wo.status,
           wo.planner_task_id,
           wo.asset_id,
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
  cron.schedule('0 * * * *', async () => {
    try {
      await runStatusTracker();
    } catch (error) {
      console.error('Status tracker hourly job failed:', error);
    }
  });
}

module.exports = {
  startStatusTracker,
  runStatusTracker,
};
