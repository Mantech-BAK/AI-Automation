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

const MONTH_START = `date_trunc('month', NOW() AT TIME ZONE 'Asia/Bahrain') AT TIME ZONE 'Asia/Bahrain'`;

// Equipment: maintenance work orders that are not finished / not finished and past their due date.
router.get('/equipment/active-work-orders', requireAuth, countRoute(0, `
  SELECT COUNT(*) AS count FROM work_orders WHERE task_type = 'equipment' AND status NOT IN ('completed', 'rejected') AND $1::int >= 0`));

router.get('/equipment/overdue', requireAuth, countRoute(0, `
  SELECT COUNT(*) AS count FROM work_orders
  WHERE task_type = 'equipment' AND status NOT IN ('completed', 'rejected') AND due_date < CURRENT_DATE AND $1::int >= 0`));

// Documents received / filed in the current calendar month (Bahrain time).
router.get('/documents/filed-this-month', requireAuth, countRoute(0, `
  SELECT COUNT(*) AS count FROM assets a JOIN asset_types t ON t.id = a.type_id
  WHERE t.name = 'Document' AND COALESCE(a.processed_at, a.last_received_at) >= ${MONTH_START} AND $1::int >= 0`));

// Vehicles in the fleet (vehicle-category equipment records).
router.get('/vehicles/in-service', requireAuth, countRoute(0, `
  SELECT COUNT(*) AS count FROM assets a JOIN asset_types t ON t.id = a.type_id
  WHERE t.name = 'Equipment' AND a.category_id IN (SELECT id FROM asset_categories WHERE name ILIKE '%vehicle%' OR name ILIKE '%transport%')
    AND $1::int >= 0`));

// Project Tracking: same access rule as the module itself (admin, or "Project" in the user's item types).
const projectAccess = (req, res, next) => {
  const user = req.session?.user;
  if (user?.role === 'admin' || (Array.isArray(user?.allowed_item_types) && user.allowed_item_types.includes('Project'))) return next();
  return res.status(403).json({ error: "You don't have permission to access Project Tracking" });
};
router.get('/projects/on-track', requireAuth, projectAccess, countRoute(0, `SELECT COUNT(*) AS count FROM projects WHERE management_flag = 'On Track' AND $1::int >= 0`));
router.get('/projects/at-risk', requireAuth, projectAccess, countRoute(0, `
  SELECT COUNT(*) AS count FROM projects WHERE management_flag IN ('Collection Risk', 'Margin Risk', 'Behind Plan') AND $1::int >= 0`));

module.exports = router;
