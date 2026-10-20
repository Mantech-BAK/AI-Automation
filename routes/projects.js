const express = require('express');
const { pool } = require('../db');

const router = express.Router();

// Project financials are sensitive (contract values, margins), so this module is
// limited to admins and to users whose permissions explicitly include the
// "Project" item type. An empty allowed_item_types does NOT grant it, unlike the
// Equipment and Document modules.
router.use((req, res, next) => {
  const user = req.session?.user;
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  if (user.role === 'admin') return next();
  const allowedItemTypes = Array.isArray(user.allowed_item_types) ? user.allowed_item_types : [];
  if (allowedItemTypes.includes('Project')) return next();
  return res.status(403).json({ error: "You don't have permission to access Project Tracking" });
});

const NUMERIC_COLUMNS = [
  'so_value_bhd',
  'retention_rate',
  'net_invoiced_bhd',
  'collections_bhd',
  'actual_cost_bhd',
  'committed_cost_bhd',
  'total_cost_exposure_bhd',
  'outstanding_ar_bhd',
  'unbilled_so_balance_bhd',
  'forecast_margin_bhd',
  'forecast_margin_pct',
  'billing_pct',
  'collection_pct_of_invoiced',
  'completion_pct',
  'planned_progress_pct',
  'progress_variance_pct',
];

// node-postgres returns NUMERIC as strings; the UI wants numbers. DATE columns are
// already plain 'YYYY-MM-DD' strings (see the type parser in db.js).
// The workbook (and so the database) stores these three as percent points (27.44 = 27.44%);
// the UI works with fractions (0.2744), like completion_pct, so convert on the way out.
const PERCENT_POINT_COLUMNS = ['forecast_margin_pct', 'billing_pct', 'collection_pct_of_invoiced'];

function toNumbers(row) {
  const out = { ...row };
  for (const column of NUMERIC_COLUMNS) {
    if (out[column] !== null && out[column] !== undefined) out[column] = Number(out[column]);
  }
  for (const column of PERCENT_POINT_COLUMNS) {
    if (out[column] !== null && out[column] !== undefined) out[column] = out[column] / 100;
  }
  return out;
}

const FLAG_NAMES = ['On Track', 'Collection Risk', 'Margin Risk', 'Behind Plan'];

// Builds the WHERE clause shared by the list and summary endpoints.
function buildFilters(query) {
  const conditions = [];
  const params = [];

  const add = (column, value) => {
    if (typeof value === 'string' && value.trim() !== '') {
      params.push(value.trim());
      conditions.push(`${column} = $${params.length}`);
    }
  };

  add('project_id', query.project_id);
  add('customer', query.customer);
  add('project_type', query.type);
  add('management_flag', query.flag);

  // As-of date: keep projects that had started by that date (their data runs from
  // the project start up to the date).
  if (typeof query.as_of === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(query.as_of)) {
    params.push(query.as_of);
    conditions.push(`(start_date IS NULL OR start_date <= $${params.length})`);
  }

  return { where: conditions.length ? `WHERE ${conditions.join(' AND ')}` : '', params };
}

const sum = (rows, key) => rows.reduce((total, row) => total + (Number(row[key]) || 0), 0);

// Average of `valueKey` weighted by SO value, so large projects count for more.
function weightedAverage(rows, valueKey) {
  const weight = sum(rows, 'so_value_bhd');
  if (weight === 0) return 0;
  return rows.reduce((total, row) => total + (Number(row[valueKey]) || 0) * (Number(row.so_value_bhd) || 0), 0) / weight;
}

function groupBy(rows, key) {
  const groups = new Map();
  for (const row of rows) {
    const name = row[key] || 'Unspecified';
    if (!groups.has(name)) groups.set(name, []);
    groups.get(name).push(row);
  }
  return groups;
}

router.get('/summary', async (req, res) => {
  try {
    const { where, params } = buildFilters(req.query);
    const { rows: raw } = await pool.query(`SELECT * FROM projects ${where} ORDER BY project_id`, params);
    const rows = raw.map(toNumbers);

    // ?project_id= narrows the summary to one project (same shape, so a single
    // project's figures are simply its own row: value, invoiced, margin %, ...).
    const projectId = typeof req.query.project_id === 'string' ? req.query.project_id.trim() : '';
    if (projectId && rows.length === 0) {
      return res.status(404).json({ error: 'Project not found' });
    }
    const project = projectId
      ? { project_id: rows[0].project_id, customer: rows[0].customer, project_type: rows[0].project_type, start_date: rows[0].start_date, expected_end_date: rows[0].expected_end_date }
      : null;

    const flagCounts = Object.fromEntries(FLAG_NAMES.map((name) => [name, 0]));
    for (const row of rows) {
      const flag = row.management_flag || 'Unflagged';
      flagCounts[flag] = (flagCounts[flag] || 0) + 1;
    }

    // Retention is withheld from what has been invoiced (matches the workbook's Retention sheet).
    // Purchases (AP invoices = actual cost) and retention held, for the projects in this summary
    // (so they follow the same filters as everything else).
    const projectIds = rows.map((row) => row.project_id);
    const { rows: procurementTotal } = await pool.query(
      `SELECT COALESCE(SUM(amount_bhd), 0) AS total FROM project_procurement WHERE cost_status = 'Actual Cost' AND project_id = ANY($1)`,
      [projectIds]
    );
    const { rows: retentionTotal } = await pool.query(
      `SELECT COALESCE(SUM(retention_amount_bhd), 0) AS total FROM project_retention WHERE project_id = ANY($1)`,
      [projectIds]
    );

    // Payments made to vendors (the same table the Payments page lists).
    const { rows: paymentsTotal } = await pool.query(
      `SELECT COALESCE(SUM(amount_bhd), 0) AS total FROM project_vendor_payments WHERE project_id = ANY($1)`,
      [projectIds]
    );

    const retentionHeld = rows.reduce((total, row) => total + (row.net_invoiced_bhd || 0) * (row.retention_rate || 0), 0);

    return res.json({
      project,
      projectCount: rows.length,
      totalSOValue: sum(rows, 'so_value_bhd'),
      totalInvoiced: sum(rows, 'net_invoiced_bhd'),
      totalCollected: sum(rows, 'collections_bhd'),
      outstandingAR: sum(rows, 'outstanding_ar_bhd'),
      totalCostExposure: sum(rows, 'total_cost_exposure_bhd'),
      totalActualCost: sum(rows, 'actual_cost_bhd'),
      retentionHeld,
      total_procurement: Number(procurementTotal[0].total),
      total_retention: Number(retentionTotal[0].total),
      total_payments: Number(paymentsTotal[0].total),
      forecastMarginPct: weightedAverage(rows, 'forecast_margin_pct'),
      flagCounts,
      // Value per flag, for the status-by-value chart.
      flagValues: Object.fromEntries(
        Object.keys(flagCounts).map((flag) => [flag, sum(rows.filter((row) => (row.management_flag || 'Unflagged') === flag), 'so_value_bhd')])
      ),
      byType: [...groupBy(rows, 'project_type')].map(([type, group]) => ({
        type,
        soValue: sum(group, 'so_value_bhd'),
        invoiced: sum(group, 'net_invoiced_bhd'),
        forecastMarginPct: weightedAverage(group, 'forecast_margin_pct'),
      })),
      byCustomer: [...groupBy(rows, 'customer')]
        .map(([customer, group]) => ({
          customer,
          soValue: sum(group, 'so_value_bhd'),
          invoiced: sum(group, 'net_invoiced_bhd'),
          collected: sum(group, 'collections_bhd'),
        }))
        .sort((a, b) => b.soValue - a.soValue),
    });
  } catch (error) {
    console.error('Project summary failed:', error);
    return res.status(500).json({ error: 'Failed to load project summary' });
  }
});

// Declared before "/:id" so these fixed paths aren't read as a project id.
router.get('/ar-transactions', async (req, res) => {
  try {
    // ?type= narrows to one document type: 'AR Invoice' or 'Incoming Payment'.
    const type = typeof req.query.type === 'string' ? req.query.type.trim() : '';
    const { rows } = await pool.query(
      `SELECT t.*, p.customer
       FROM project_ar_transactions t
       LEFT JOIN projects p ON p.project_id = t.project_id
       ${type ? 'WHERE t.transaction_type = $1' : ''}
       ORDER BY t.project_id, t.transaction_date NULLS LAST, t.id`,
      type ? [type] : []
    );
    return res.json(rows.map((row) => ({ ...row, amount_bhd: row.amount_bhd === null ? null : Number(row.amount_bhd) })));
  } catch (error) {
    console.error('AR transactions query failed:', error);
    return res.status(500).json({ error: 'Failed to load AR transactions' });
  }
});

const withAmount = (row) => ({ ...row, amount_bhd: row.amount_bhd === null ? null : Number(row.amount_bhd) });

// Collections: only the incoming payments (receipts) received from customers.
router.get('/collections', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT t.*, p.customer
       FROM project_ar_transactions t
       LEFT JOIN projects p ON p.project_id = t.project_id
       WHERE t.transaction_type = 'Incoming Payment'
       ORDER BY t.transaction_ref, t.id`
    );
    return res.json(rows.map(withAmount));
  } catch (error) {
    console.error('Collections query failed:', error);
    return res.status(500).json({ error: 'Failed to load collections' });
  }
});

// Payments: outgoing vendor payments, each applied to one AP invoice.
router.get('/vendor-payments', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT vp.*, p.customer
       FROM project_vendor_payments vp
       JOIN projects p ON vp.project_id = p.project_id
       ORDER BY vp.payment_date, vp.project_id, vp.payment_no`
    );
    return res.json(
      rows.map((row) => ({
        ...row,
        amount_bhd: row.amount_bhd === null ? null : Number(row.amount_bhd),
        ap_invoice_amount_bhd: row.ap_invoice_amount_bhd === null ? null : Number(row.ap_invoice_amount_bhd),
      }))
    );
  } catch (error) {
    console.error('Vendor payments query failed:', error);
    return res.status(500).json({ error: 'Failed to load vendor payments' });
  }
});

router.get('/procurement', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, project_id, customer, document_no, so_no, document_type, date, amount_bhd, cost_status
       FROM project_procurement
       ORDER BY date DESC NULLS LAST, id DESC`
    );
    return res.json(rows.map(withAmount));
  } catch (error) {
    console.error('Procurement query failed:', error);
    return res.status(500).json({ error: 'Failed to load procurement' });
  }
});

router.get('/adjustments', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, project_id, customer, description, adjustment_type, amount_bhd, date, reference, so_no
       FROM project_adjustments
       ORDER BY date DESC NULLS LAST, id DESC`
    );
    return res.json(rows.map(withAmount));
  } catch (error) {
    console.error('Adjustments query failed:', error);
    return res.status(500).json({ error: 'Failed to load adjustments' });
  }
});

router.get('/retention', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT r.id, r.project_id, r.so_no, r.retained_date, r.retention_rate, r.retention_amount_bhd,
              r.release_rule, r.collection_treatment, p.customer, p.so_value_bhd
       FROM project_retention r
       LEFT JOIN projects p ON p.project_id = r.project_id
       ORDER BY r.project_id`
    );
    return res.json(
      rows.map((row) => ({
        ...row,
        so_value_bhd: row.so_value_bhd === null ? null : Number(row.so_value_bhd),
        retention_rate: row.retention_rate === null ? null : Number(row.retention_rate),
        retention_amount_bhd: row.retention_amount_bhd === null ? null : Number(row.retention_amount_bhd),
      }))
    );
  } catch (error) {
    console.error('Retention query failed:', error);
    return res.status(500).json({ error: 'Failed to load retention' });
  }
});

router.get('/', async (req, res) => {
  try {
    const { where, params } = buildFilters(req.query);

    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 0, 0), 1000);
    const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);
    const paging = (limit ? ` LIMIT ${limit}` : '') + (offset ? ` OFFSET ${offset}` : '');

    const { rows } = await pool.query(`SELECT * FROM projects ${where} ORDER BY project_id${paging}`, params);
    return res.json(rows.map(toNumbers));
  } catch (error) {
    console.error('Projects query failed:', error);
    return res.status(500).json({ error: 'Failed to load projects' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM projects WHERE project_id = $1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Project not found' });
    return res.json(toNumbers(rows[0]));
  } catch (error) {
    console.error('Project query failed:', error);
    return res.status(500).json({ error: 'Failed to load project' });
  }
});

module.exports = router;
