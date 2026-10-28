// Count endpoints behind the home page tiles: each answers { count: number }.
const express = require('express');
const { pool } = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

const daysParam = (req, fallback) => {
  const n = Math.floor(Number(req.query.days));
  return Number.isFinite(n) && n > 0 && n <= 3650 ? n : fallback;
};

const countRoute = (fallbackDays, sql) => async (req, res) => {
  try {
    const { rows } = await pool.query(sql, [daysParam(req, fallbackDays)]);
    return res.json({ count: Number(rows[0].count) });
  } catch (error) {
    console.error('Home count query failed:', req.path, error.message);
    return res.status(500).json({ error: 'Failed to load count' });
  }
};

// Equipment / vehicle "due" = open maintenance work orders (work_orders.due_date) falling in the next N days.
router.get('/equipment/due-soon', requireAuth, countRoute(30, `
  SELECT COUNT(*) AS count FROM work_orders
  WHERE task_type = 'equipment' AND status = 'open' AND due_date BETWEEN CURRENT_DATE AND CURRENT_DATE + $1 * INTERVAL '1 day'`));

router.get('/vehicles/due-soon', requireAuth, countRoute(30, `
  SELECT COUNT(*) AS count FROM work_orders wo JOIN assets a ON a.id = wo.asset_id
  WHERE a.category_id IN (SELECT id FROM asset_categories WHERE name ILIKE '%vehicle%' OR name ILIKE '%transport%')
    AND wo.status = 'open' AND wo.due_date BETWEEN CURRENT_DATE AND CURRENT_DATE + $1 * INTERVAL '1 day'`));

router.get('/documents/expiring-soon', requireAuth, countRoute(60, `
  SELECT COUNT(*) AS count FROM assets a JOIN asset_types at ON at.id = a.type_id
  WHERE at.name = 'Document' AND a.expiry_date BETWEEN CURRENT_DATE AND CURRENT_DATE + $1 * INTERVAL '1 day'`));

module.exports = router;
