const express = require('express');
const { pool } = require('../db');
const { runDailyCheck } = require('../jobs/dailyCheck');
const { processEmails } = require('../jobs/emailProcessor');

const router = express.Router();

async function upsertSetting(key, value) {
  await pool.query(
    `INSERT INTO settings (key, value, updated_at) VALUES ($1, $2, NOW())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at`,
    [key, value]
  );
}

router.post('/run-daily-check', async (req, res) => {
  try {
    const result = await runDailyCheck();
    const tasksCreated = result?.tasksCreated ?? 0;
    const timestamp = new Date().toISOString();

    await upsertSetting('last_daily_check_run', timestamp);

    return res.json({
      message: `Daily check complete. ${tasksCreated} task${tasksCreated === 1 ? '' : 's'} created.`,
      timestamp,
      tasksCreated,
    });
  } catch (error) {
    console.error('Run daily check failed:', error);
    return res.status(500).json({ error: 'Failed to run daily check' });
  }
});

router.post('/process-emails', async (req, res) => {
  try {
    const result = await processEmails();
    const processed = result?.processed ?? 0;
    const timestamp = new Date().toISOString();

    await upsertSetting('last_email_process_run', timestamp);

    return res.json({
      message: `Email processing complete. ${processed} email${processed === 1 ? '' : 's'} processed.`,
      timestamp,
      processed,
    });
  } catch (error) {
    console.error('Process emails failed:', error);
    return res.status(500).json({ error: 'Failed to process emails' });
  }
});

router.post('/reset-data', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const simpleTables = ['email_action_items', 'email_summaries', 'escalation_log'];
    const counts = {};

    for (const table of simpleTables) {
      const result = await client.query(`DELETE FROM ${table}`);
      counts[table] = result.rowCount;
    }

    const notificationResult = await client.query(
      `DELETE FROM notification_log WHERE work_order_id NOT IN (SELECT id FROM work_orders WHERE status = 'completed')`
    );
    counts.notification_log = notificationResult.rowCount;

    const workOrdersResult = await client.query(`DELETE FROM work_orders WHERE status != 'completed'`);
    counts.work_orders = workOrdersResult.rowCount;

    await client.query('ALTER SEQUENCE email_action_items_id_seq RESTART WITH 1');
    await client.query('ALTER SEQUENCE email_summaries_id_seq RESTART WITH 1');
    await client.query('ALTER SEQUENCE escalation_log_id_seq RESTART WITH 1');

    await client.query('COMMIT');

    return res.json({
      success: true,
      message: 'Test data has been reset. Completed work orders, assets, technicians, and sites were kept.',
      counts,
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Reset data failed:', error);
    return res.status(500).json({ error: 'Failed to reset data' });
  } finally {
    client.release();
  }
});

module.exports = router;
