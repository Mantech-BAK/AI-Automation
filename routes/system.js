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
    const documentReminders = result?.documentRemindersSent ?? 0;
    const timestamp = new Date().toISOString();

    await upsertSetting('last_daily_check_run', timestamp);

    return res.json({
      message: `Daily check complete. ${tasksCreated} equipment task${tasksCreated === 1 ? '' : 's'} created, ${documentReminders} document reminder${documentReminders === 1 ? '' : 's'} sent.`,
      timestamp,
      tasksCreated,
      documentReminders,
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
  const counts = {};

  try {
    await client.query('BEGIN');

    const actionItemsResult = await client.query('DELETE FROM email_action_items');
    counts.email_action_items = actionItemsResult.rowCount;
    console.log(`reset-data: deleted ${actionItemsResult.rowCount} rows from email_action_items`);

    const summariesResult = await client.query('DELETE FROM email_summaries');
    counts.email_summaries = summariesResult.rowCount;
    console.log(`reset-data: deleted ${summariesResult.rowCount} rows from email_summaries`);

    const escalationsResult = await client.query('DELETE FROM escalation_log');
    counts.escalation_log = escalationsResult.rowCount;
    console.log(`reset-data: deleted ${escalationsResult.rowCount} rows from escalation_log`);

    const notificationResult = await client.query('DELETE FROM notification_log');
    counts.notification_log = notificationResult.rowCount;
    console.log(`reset-data: deleted ${notificationResult.rowCount} rows from notification_log`);

    // The calendar has no separate cache - CalendarPage always reads live from
    // GET /api/dashboard/schedules, which queries work_orders directly. So
    // deleting work_orders here is sufficient to empty the calendar; there is
    // nothing else to clear.
    const workOrdersResult = await client.query('DELETE FROM work_orders');
    counts.work_orders = workOrdersResult.rowCount;
    console.log(`reset-data: deleted ${workOrdersResult.rowCount} rows from work_orders (calendar will be empty until the next daily check run)`);

    await client.query('ALTER SEQUENCE email_action_items_id_seq RESTART WITH 1');
    await client.query('ALTER SEQUENCE email_summaries_id_seq RESTART WITH 1');
    await client.query('ALTER SEQUENCE escalation_log_id_seq RESTART WITH 1');
    await client.query('ALTER SEQUENCE notification_log_id_seq RESTART WITH 1');
    await client.query('ALTER SEQUENCE work_orders_id_seq RESTART WITH 1');

    await client.query('COMMIT');

    return res.json({
      success: true,
      message: 'All task-related data has been reset. Assets, technicians, and sites were kept.',
      counts,
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Reset data failed, rolled back:', error);
    return res.status(500).json({ error: 'Failed to reset data', details: error.message, counts });
  } finally {
    client.release();
  }
});

module.exports = router;
