const express = require('express');
const { pool } = require('../db');
const packageJson = require('../package.json');

const router = express.Router();

const EDITABLE_KEYS = [
  'maintenance_manager_email',
  'senior_manager_email',
  'daily_check_time',
  'working_hours_start',
  'working_hours_end',
  'timezone',
  'notify_email_enabled',
  'notify_teams_enabled',
  'notify_calendar_enabled',
  'notify_reminders_enabled',
  'reminder_first_days',
  'reminder_second_days',
  'reminder_final_days',
  'escalation_days_after_due',
  'ai_model',
];

async function upsertSetting(key, value) {
  await pool.query(
    `INSERT INTO settings (key, value, updated_at) VALUES ($1, $2, NOW())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at`,
    [key, value]
  );
}

async function loadSettingsResponse() {
  const { rows } = await pool.query('SELECT key, value FROM settings');
  const map = {};
  for (const row of rows) {
    map[row.key] = row.value;
  }

  const [emailCountResult, taskCountResult] = await Promise.all([
    pool.query('SELECT COUNT(*)::int AS count FROM email_summaries'),
    pool.query('SELECT COUNT(*)::int AS count FROM work_orders'),
  ]);

  return {
    maintenance_manager_email: map.maintenance_manager_email || '',
    senior_manager_email: map.senior_manager_email || '',
    daily_check_time: map.daily_check_time || '6',
    working_hours_start: map.working_hours_start || '07:30',
    working_hours_end: map.working_hours_end || '16:30',
    timezone: map.timezone || 'Asia/Bahrain',
    notify_email_enabled: map.notify_email_enabled !== 'false',
    notify_teams_enabled: map.notify_teams_enabled !== 'false',
    notify_calendar_enabled: map.notify_calendar_enabled !== 'false',
    notify_reminders_enabled: map.notify_reminders_enabled !== 'false',
    reminder_first_days: Number(map.reminder_first_days ?? 7),
    reminder_second_days: Number(map.reminder_second_days ?? 3),
    reminder_final_days: Number(map.reminder_final_days ?? 1),
    escalation_days_after_due: Number(map.escalation_days_after_due ?? 0),
    ai_model: map.ai_model || 'llama-3.1-8b-instant',
    ai_api_key_set: Boolean(map.ai_api_key),
    about: {
      version: packageJson.version || '1.0.0',
      last_daily_check_run: map.last_daily_check_run || null,
      total_emails_processed: emailCountResult.rows[0].count,
      total_tasks_created: taskCountResult.rows[0].count,
    },
  };
}

router.get('/', async (req, res) => {
  try {
    const settings = await loadSettingsResponse();
    return res.json(settings);
  } catch (error) {
    console.error('Load settings failed:', error);
    return res.status(500).json({ error: 'Failed to load settings' });
  }
});

router.post('/', async (req, res) => {
  try {
    const updates = req.body || {};

    for (const key of EDITABLE_KEYS) {
      if (Object.prototype.hasOwnProperty.call(updates, key)) {
        await upsertSetting(key, String(updates[key]));
      }
    }

    if (typeof updates.ai_api_key === 'string' && updates.ai_api_key.trim()) {
      await upsertSetting('ai_api_key', updates.ai_api_key.trim());
    }

    const settings = await loadSettingsResponse();
    return res.json(settings);
  } catch (error) {
    console.error('Save settings failed:', error);
    return res.status(500).json({ error: 'Failed to save settings' });
  }
});

module.exports = router;
