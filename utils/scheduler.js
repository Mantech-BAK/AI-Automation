// The background schedules (document emails, general emails, daily check), editable from Settings -> Schedule.
// One cron tick per minute decides what is due from the saved intervals, so a change takes effect within a minute
// without restarting anything. Documents run before the general email summariser so PDF emails are handled (and
// marked read) first. A job that is still running when its next slot arrives is skipped, not stacked.
const cron = require('node-cron');
const { pool } = require('../db');

const DEFAULTS = { doc_email_interval_minutes: 5, general_email_interval_minutes: 30, daily_check_time: 6 };

// What the Schedule screen offers (minutes); the saved value must be one of these.
const DOC_INTERVAL_OPTIONS = [1, 2, 5, 10, 15, 30, 60];
const GENERAL_INTERVAL_OPTIONS = [15, 30, 60, 120, 240];

function pickOption(raw, options, fallback) {
  const value = Number(raw);
  return options.includes(value) ? value : fallback;
}

async function loadSchedule() {
  const { rows } = await pool.query(
    `SELECT key, value FROM settings WHERE key = ANY($1)`,
    [['doc_email_interval_minutes', 'general_email_interval_minutes', 'daily_check_time', 'last_document_email_run', 'last_email_process_run', 'last_daily_check_run']]
  );
  const map = Object.fromEntries(rows.map((row) => [row.key, row.value]));
  const hour = Number(map.daily_check_time);
  return {
    doc_email_interval_minutes: pickOption(map.doc_email_interval_minutes, DOC_INTERVAL_OPTIONS, DEFAULTS.doc_email_interval_minutes),
    general_email_interval_minutes: pickOption(map.general_email_interval_minutes, GENERAL_INTERVAL_OPTIONS, DEFAULTS.general_email_interval_minutes),
    daily_check_time: Number.isInteger(hour) && hour >= 0 && hour <= 23 ? hour : DEFAULTS.daily_check_time,
    last_document_email_run: map.last_document_email_run || null,
    last_email_process_run: map.last_email_process_run || null,
    last_daily_check_run: map.last_daily_check_run || null,
  };
}

async function recordRun(key) {
  try {
    await pool.query(
      `INSERT INTO settings (key, value, updated_at) VALUES ($1, NOW()::text, NOW())
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at`,
      [key]
    );
  } catch (error) {
    console.warn(`Could not record ${key}:`, error.message);
  }
}

// One scheduler pass for the minute `now` falls in (exported so it can be tested without waiting for cron).
function createScheduler({ processDocumentEmails, processEmails, runDailyCheck }) {
  const running = { documents: false, general: false, daily: false };

  async function guarded(name, label, work) {
    if (running[name]) {
      console.log(`Scheduler: ${label} is still running - skipping this slot`);
      return;
    }
    running[name] = true;
    try {
      await work();
    } catch (error) {
      console.error(`${label} job failed:`, error.message, error.stack);
    } finally {
      running[name] = false;
    }
  }

  return async function tick(now = new Date()) {
    let schedule;
    try {
      schedule = await loadSchedule();
    } catch (error) {
      console.error('Scheduler could not read the schedule settings:', error.message);
      schedule = { ...DEFAULTS };
    }

    const minuteOfDay = now.getHours() * 60 + now.getMinutes();

    if (minuteOfDay % schedule.doc_email_interval_minutes === 0) {
      await guarded('documents', 'Document email processor', async () => {
        await processDocumentEmails();
        await recordRun('last_document_email_run');
      });
    }

    if (minuteOfDay % schedule.general_email_interval_minutes === 0) {
      await guarded('general', 'Email processor', async () => {
        await processEmails();
        await recordRun('last_email_process_run');
      });
    }

    if (minuteOfDay === schedule.daily_check_time * 60) {
      guarded('daily', 'Daily check', runDailyCheck);
    }
  };
}

function startScheduler(jobs) {
  const tick = createScheduler(jobs);
  cron.schedule('* * * * *', () => tick());
}

module.exports = { startScheduler, createScheduler, loadSchedule, DOC_INTERVAL_OPTIONS, GENERAL_INTERVAL_OPTIONS, DEFAULTS };
