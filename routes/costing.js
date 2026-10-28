const express = require('express');
const { pool } = require('../db');
const { calcSheet, formatQuotationRef, baseQuotationRef, DEFAULT_OH_PCT } = require('../utils/costing');

const router = express.Router();

const DEPARTMENTS = ['ELV', 'ELC', 'FS', 'MECH', 'IT'];
const SECTIONS = ['ST1', 'ST2', 'ST3', 'ST4'];
const ENQUIRY_STATUSES = ['draft', 'submitted', 'approved', 'rejected'];
const MAX_FILE_BYTES = 10 * 1024 * 1024;

const DEFAULT_TERMS = {
  payment_terms: '50% advance with the purchase order, 40% on delivery, 10% on completion and handover.',
  validity: '30 days from the date of this quotation.',
  delivery_time: '8 to 12 weeks from the date of the confirmed purchase order and advance payment.',
  warranty: '12 months from the date of handover against manufacturing defects.',
};

// The costing module is open to admins and to users whose permissions include the "Costing" item type.
router.use((req, res, next) => {
  const user = req.session?.user;
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  if (user.role === 'admin') return next();
  const allowed = Array.isArray(user.allowed_item_types) ? user.allowed_item_types : [];
  if (allowed.includes('Costing')) return next();
  return res.status(403).json({ error: "You don't have permission to access Costing Sheet" });
});

const currentUserName = (req) => req.session?.user?.name || req.session?.user?.email || 'Unknown';
const clean = (value) => {
  const text = value === null || value === undefined ? '' : String(value).trim();
  return text || null;
};
const bahrainYear = () => Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Bahrain', year: 'numeric' }).format(new Date()));
const bahrainToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bahrain', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

// Next number for (department, year); atomic, so two people never get the same quotation number.
async function nextNumber(client, department, year) {
  const { rows } = await client.query(
    `INSERT INTO quotation_counters (department, year, last_number) VALUES ($1, $2, 1)
     ON CONFLICT (department, year) DO UPDATE SET last_number = quotation_counters.last_number + 1
     RETURNING last_number`,
    [department, year]
  );
  return rows[0].last_number;
}

const isLocked = (sheet) => !sheet.is_latest || sheet.status === 'approved';

async function loadSheet(id) {
  const { rows } = await pool.query(
    `SELECT s.*, e.enquiry_no, e.customer_name, e.status AS enquiry_status
     FROM costing_sheets s JOIN enquiries e ON e.id = s.enquiry_id WHERE s.id = $1`,
    [id]
  );
  if (rows.length === 0) return null;
  const sheet = rows[0];
  const { rows: lines } = await pool.query(`SELECT * FROM costing_line_items WHERE costing_sheet_id = $1 ORDER BY section, sort_order, id`, [id]);
  const { rows: documents } = await pool.query(
    `SELECT cd.id AS link_id, cd.uploaded_at, a.id AS document_id, a.equipment_name AS document_name, a.type_of_service AS document_type,
            a.company_name, a.expiry_date, a.onedrive_url, a.cr_no, a.license_no
     FROM costing_documents cd JOIN assets a ON a.id = cd.document_id WHERE cd.costing_sheet_id = $1 ORDER BY cd.id`,
    [id]
  );
  const { rows: files } = await pool.query(
    `SELECT id, file_name, content_type, size_bytes, uploaded_by, uploaded_at FROM costing_files WHERE costing_sheet_id = $1 ORDER BY id`,
    [id]
  );
  const { rows: revisions } = await pool.query(
    `SELECT id, quotation_ref_no, revision_no, status, is_latest, total_selling_amount, created_at
     FROM costing_sheets WHERE enquiry_id = $1 ORDER BY revision_no`,
    [sheet.enquiry_id]
  );
  return { sheet: { ...sheet, locked: isLocked(sheet) }, lines, documents, files, revisions, defaults: DEFAULT_TERMS };
}

// ---------------------------------------------------------------- dashboard

router.get('/summary', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM enquiries) AS total_enquiries,
        (SELECT COUNT(*) FROM costing_sheets WHERE is_latest AND status = 'draft') AS pending_approval,
        (SELECT COUNT(*) FROM costing_sheets WHERE status = 'approved' AND is_latest
           AND GREATEST(approved_by_gm_at, approved_by_director_at) >= date_trunc('month', NOW() AT TIME ZONE 'Asia/Bahrain') AT TIME ZONE 'Asia/Bahrain') AS approved_this_month,
        (SELECT COALESCE(SUM(total_selling_amount), 0) FROM costing_sheets WHERE status = 'approved' AND is_latest) AS total_quoted_value
    `);
    const { rows: recent } = await pool.query(
      `SELECT s.id, s.quotation_ref_no, s.revision_no, s.project_name, s.client, s.department, s.status, s.is_latest,
              s.total_selling_amount, s.updated_at, e.enquiry_no
       FROM costing_sheets s JOIN enquiries e ON e.id = s.enquiry_id ORDER BY s.updated_at DESC, s.id DESC LIMIT 10`
    );
    const r = rows[0];
    return res.json({
      total_enquiries: Number(r.total_enquiries),
      pending_approval: Number(r.pending_approval),
      approved_this_month: Number(r.approved_this_month),
      total_quoted_value: Number(r.total_quoted_value),
      recent,
    });
  } catch (error) {
    console.error('Costing summary failed:', error);
    return res.status(500).json({ error: 'Failed to load costing summary' });
  }
});

// ---------------------------------------------------------------- enquiries

router.get('/enquiries', async (req, res) => {
  try {
    const { department, status, from, to } = req.query;
    const conditions = [];
    const params = [];
    if (department) { params.push(department); conditions.push(`e.department = $${params.length}`); }
    if (status) { params.push(status); conditions.push(`e.status = $${params.length}`); }
    if (from) { params.push(from); conditions.push(`e.date >= $${params.length}`); }
    if (to) { params.push(to); conditions.push(`e.date <= $${params.length}`); }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const { rows } = await pool.query(
      `SELECT e.*, (SELECT id FROM costing_sheets s WHERE s.enquiry_id = e.id AND s.is_latest ORDER BY s.id DESC LIMIT 1) AS latest_sheet_id
       FROM enquiries e ${where} ORDER BY e.id DESC`,
      params
    );
    return res.json(rows);
  } catch (error) {
    console.error('Enquiries query failed:', error);
    return res.status(500).json({ error: 'Failed to load enquiries' });
  }
});

// Creates the enquiry, its number (ENQ-26-0001) and its first costing sheet with a quotation number
// (MCS/ELV/26-001) in one transaction.
router.post('/enquiries', async (req, res) => {
  const body = req.body || {};
  const department = String(body.department || '').toUpperCase();
  if (!clean(body.customer_name) || !clean(body.project_name)) {
    return res.status(400).json({ error: 'Customer name and project name are required' });
  }
  if (!DEPARTMENTS.includes(department)) {
    return res.status(400).json({ error: `Department must be one of ${DEPARTMENTS.join(', ')}` });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const year = bahrainYear();
    const enquiryNo = `ENQ-${String(year % 100).padStart(2, '0')}-${String(await nextNumber(client, 'ENQ', year)).padStart(4, '0')}`;
    const date = clean(body.date) || bahrainToday();
    const user = currentUserName(req);

    const { rows: enquiryRows } = await client.query(
      `INSERT INTO enquiries (enquiry_no, customer_name, project_name, client, consultant, main_contractor, department, date, status, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'draft', $9) RETURNING *`,
      [enquiryNo, clean(body.customer_name), clean(body.project_name), clean(body.client), clean(body.consultant), clean(body.main_contractor), department, date, user]
    );
    const enquiry = enquiryRows[0];

    const ref = formatQuotationRef(department, year, await nextNumber(client, department, year));
    const { rows: sheetRows } = await client.query(
      `INSERT INTO costing_sheets (enquiry_id, quotation_ref_no, department, project_name, client, consultant, main_contractor, date,
         prepared_by, payment_terms, validity, delivery_time, warranty, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $9) RETURNING id`,
      [enquiry.id, ref, department, enquiry.project_name, enquiry.client, enquiry.consultant, enquiry.main_contractor, date, user,
        DEFAULT_TERMS.payment_terms, DEFAULT_TERMS.validity, DEFAULT_TERMS.delivery_time, DEFAULT_TERMS.warranty]
    );
    await client.query('COMMIT');
    return res.status(201).json({ enquiry, sheet_id: sheetRows[0].id });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Create enquiry failed:', error);
    return res.status(500).json({ error: 'Failed to create enquiry' });
  } finally {
    client.release();
  }
});

router.put('/enquiries/:id', async (req, res) => {
  try {
    const body = req.body || {};
    if (body.status !== undefined && !ENQUIRY_STATUSES.includes(body.status)) {
      return res.status(400).json({ error: `Status must be one of ${ENQUIRY_STATUSES.join(', ')}` });
    }
    const { rows } = await pool.query(
      `UPDATE enquiries SET status = COALESCE($1, status), customer_name = COALESCE($2, customer_name),
         client = COALESCE($3, client), updated_at = NOW() WHERE id = $4 RETURNING *`,
      [body.status ?? null, clean(body.customer_name), body.client === undefined ? null : clean(body.client), req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Enquiry not found' });
    return res.json(rows[0]);
  } catch (error) {
    console.error('Update enquiry failed:', error);
    return res.status(500).json({ error: 'Failed to update enquiry' });
  }
});

// ---------------------------------------------------------------- sheets

router.get('/sheets', async (req, res) => {
  try {
    const { department, status, latest } = req.query;
    const conditions = [];
    const params = [];
    if (department) { params.push(department); conditions.push(`s.department = $${params.length}`); }
    if (status) { params.push(status); conditions.push(`s.status = $${params.length}`); }
    if (latest === 'true') conditions.push('s.is_latest');
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const { rows } = await pool.query(
      `SELECT s.id, s.enquiry_id, s.quotation_ref_no, s.revision_no, s.is_latest, s.department, s.project_name, s.client, s.date, s.status,
              s.total_net_cost, s.total_selling_amount, s.profit_pct_on_cost, s.profit_pct_on_selling, s.updated_at, e.enquiry_no
       FROM costing_sheets s JOIN enquiries e ON e.id = s.enquiry_id ${where} ORDER BY s.id DESC`,
      params
    );
    return res.json(rows);
  } catch (error) {
    console.error('Sheets query failed:', error);
    return res.status(500).json({ error: 'Failed to load costing sheets' });
  }
});

router.get('/sheets/:id', async (req, res) => {
  try {
    const data = await loadSheet(req.params.id);
    if (!data) return res.status(404).json({ error: 'Costing sheet not found' });
    return res.json(data);
  } catch (error) {
    console.error('Load sheet failed:', error);
    return res.status(500).json({ error: 'Failed to load costing sheet' });
  }
});

const LINE_COLUMNS = [
  'sl_no', 'qty', 'unit', 'model_no', 'description', 'unit_cost_exw', 'currency', 'supplier_discount_pct', 'unit_rate_discounted',
  'bd_conversion_rate', 'unit_rate_bd', 'total_cost_bd', 'shipping_duty', 'unit_rate_with_cf', 'total_landing_cost_bd', 'margin_pct',
  'unit_rate_selling', 'selling_total_bd', 'months', 'days', 'role', 'salary_per_month', 'per_day_rate', 'oh_pct', 'amount',
];
const NUMERIC_LINE_COLUMNS = new Set([
  'sl_no', 'qty', 'unit_cost_exw', 'supplier_discount_pct', 'unit_rate_discounted', 'bd_conversion_rate', 'unit_rate_bd', 'total_cost_bd',
  'shipping_duty', 'unit_rate_with_cf', 'total_landing_cost_bd', 'margin_pct', 'unit_rate_selling', 'selling_total_bd', 'months', 'days',
  'salary_per_month', 'per_day_rate', 'oh_pct', 'amount',
]);

// Saves the header, replaces the lines and stores the recomputed figures (the client's numbers are never trusted).
router.put('/sheets/:id', async (req, res) => {
  const client = await pool.connect();
  try {
    const { rows: existing } = await client.query('SELECT * FROM costing_sheets WHERE id = $1', [req.params.id]);
    if (existing.length === 0) return res.status(404).json({ error: 'Costing sheet not found' });
    const sheet = existing[0];
    if (isLocked(sheet)) {
      return res.status(409).json({ error: sheet.is_latest ? 'This sheet is approved and read-only. Create a revision to change it.' : 'This revision has been superseded and is read-only.' });
    }

    const body = req.body || {};
    const incoming = Array.isArray(body.lines) ? body.lines.filter((line) => SECTIONS.includes(line.section)) : [];
    const { results, summary } = calcSheet(incoming);

    await client.query('BEGIN');

    // Department change on an auto-numbered draft: take the next number of the new department.
    let department = DEPARTMENTS.includes(String(body.department || '').toUpperCase()) ? String(body.department).toUpperCase() : sheet.department;
    let ref = sheet.quotation_ref_no;
    let refIsAuto = sheet.ref_is_auto;
    const requestedRef = clean(body.quotation_ref_no);
    if (requestedRef && requestedRef !== sheet.quotation_ref_no) {
      ref = requestedRef;
      refIsAuto = false;
    } else if (department !== sheet.department && sheet.ref_is_auto && sheet.revision_no === 0) {
      ref = formatQuotationRef(department, bahrainYear(), await nextNumber(client, department, bahrainYear()));
    }

    await client.query(
      `UPDATE costing_sheets SET quotation_ref_no = $1, ref_is_auto = $2, department = $3, project_name = $4, client = $5, consultant = $6,
         main_contractor = $7, date = $8, prepared_by = $9, reviewed_by = $10, payment_terms = $11, validity = $12, delivery_time = $13,
         warranty = $14, terms_notes = $15, total_net_cost = $16, total_selling_amount = $17, profit_pct_on_cost = $18,
         profit_pct_on_selling = $19, updated_at = NOW()
       WHERE id = $20`,
      [ref, refIsAuto, department, clean(body.project_name), clean(body.client), clean(body.consultant), clean(body.main_contractor),
        clean(body.date) || sheet.date, clean(body.prepared_by), clean(body.reviewed_by), clean(body.payment_terms), clean(body.validity),
        clean(body.delivery_time), clean(body.warranty), clean(body.terms_notes), summary.total_net_cost, summary.total_selling_amount,
        summary.profit_pct_on_cost, summary.profit_pct_on_selling, sheet.id]
    );

    // Keep the enquiry's header in step with the sheet.
    await client.query(
      `UPDATE enquiries SET project_name = COALESCE($1, project_name), client = $2, consultant = $3, main_contractor = $4, department = $5, updated_at = NOW()
       WHERE id = $6`,
      [clean(body.project_name), clean(body.client), clean(body.consultant), clean(body.main_contractor), department, sheet.enquiry_id]
    );

    await client.query('DELETE FROM costing_line_items WHERE costing_sheet_id = $1', [sheet.id]);
    const order = { ST1: 0, ST2: 0, ST3: 0, ST4: 0 };
    for (let i = 0; i < incoming.length; i++) {
      const line = incoming[i];
      const derived = results[i];
      const values = LINE_COLUMNS.map((column) => {
        const raw = derived[column] !== undefined ? derived[column] : line[column];
        if (NUMERIC_LINE_COLUMNS.has(column)) {
          if (raw === null || raw === undefined || raw === '') return null;
          const n = Number(raw);
          return Number.isFinite(n) ? n : null;
        }
        return clean(raw);
      });
      await client.query(
        `INSERT INTO costing_line_items (costing_sheet_id, section, sort_order, ${LINE_COLUMNS.join(', ')})
         VALUES ($1, $2, $3, ${LINE_COLUMNS.map((_, idx) => `$${idx + 4}`).join(', ')})`,
        [sheet.id, line.section, order[line.section]++, ...values]
      );
    }
    await client.query('COMMIT');

    return res.json(await loadSheet(sheet.id));
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Save sheet failed:', error);
    return res.status(500).json({ error: 'Failed to save costing sheet' });
  } finally {
    client.release();
  }
});

// Copies the sheet (header, lines, linked documents and files) into a new revision: same number + "-R<n>".
// The original is kept as it was and becomes read-only.
router.post('/sheets/:id/revise', async (req, res) => {
  const client = await pool.connect();
  try {
    const { rows } = await client.query('SELECT * FROM costing_sheets WHERE id = $1', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Costing sheet not found' });
    const source = rows[0];
    if (!source.is_latest) return res.status(409).json({ error: 'Only the latest revision can be revised' });

    await client.query('BEGIN');
    const base = baseQuotationRef(source.quotation_ref_no);
    const { rows: maxRows } = await client.query('SELECT COALESCE(MAX(revision_no), 0) AS max FROM costing_sheets WHERE enquiry_id = $1', [source.enquiry_id]);
    const revisionNo = Number(maxRows[0].max) + 1;

    await client.query('UPDATE costing_sheets SET is_latest = FALSE WHERE enquiry_id = $1', [source.enquiry_id]);
    const { rows: created } = await client.query(
      `INSERT INTO costing_sheets (enquiry_id, quotation_ref_no, ref_is_auto, revision_no, is_latest, department, project_name, client, consultant,
         main_contractor, date, status, prepared_by, oh_pct, total_net_cost, total_selling_amount, profit_pct_on_cost, profit_pct_on_selling,
         payment_terms, validity, delivery_time, warranty, terms_notes, created_by)
       SELECT enquiry_id, $2, ref_is_auto, $3, TRUE, department, project_name, client, consultant, main_contractor, $4, 'draft', $5, oh_pct,
         total_net_cost, total_selling_amount, profit_pct_on_cost, profit_pct_on_selling, payment_terms, validity, delivery_time, warranty, terms_notes, $5
       FROM costing_sheets WHERE id = $1 RETURNING id`,
      [source.id, `${base}-R${revisionNo}`, revisionNo, bahrainToday(), currentUserName(req)]
    );
    const newId = created[0].id;
    await client.query(
      `INSERT INTO costing_line_items (costing_sheet_id, section, sort_order, ${LINE_COLUMNS.join(', ')})
       SELECT $2, section, sort_order, ${LINE_COLUMNS.join(', ')} FROM costing_line_items WHERE costing_sheet_id = $1`,
      [source.id, newId]
    );
    await client.query(`INSERT INTO costing_documents (costing_sheet_id, document_id) SELECT $2, document_id FROM costing_documents WHERE costing_sheet_id = $1`, [source.id, newId]);
    await client.query(
      `INSERT INTO costing_files (costing_sheet_id, file_name, content_type, size_bytes, data, uploaded_by)
       SELECT $2, file_name, content_type, size_bytes, data, uploaded_by FROM costing_files WHERE costing_sheet_id = $1`,
      [source.id, newId]
    );
    await client.query(`UPDATE enquiries SET status = 'submitted', updated_at = NOW() WHERE id = $1 AND status = 'approved'`, [source.enquiry_id]);
    await client.query('COMMIT');
    return res.status(201).json({ sheet_id: newId, quotation_ref_no: `${base}-R${revisionNo}` });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Revise sheet failed:', error);
    return res.status(500).json({ error: 'Failed to create revision' });
  } finally {
    client.release();
  }
});

// Approval steps: the GM and Director sign off; the sheet becomes "approved" (and read-only) once both have.
router.post('/sheets/:id/approve', async (req, res) => {
  const client = await pool.connect();
  try {
    const step = String(req.body?.step || '');
    if (!['gm', 'director'].includes(step)) return res.status(400).json({ error: 'step must be gm or director' });
    const undo = req.body?.undo === true;

    const { rows } = await client.query('SELECT * FROM costing_sheets WHERE id = $1', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Costing sheet not found' });
    const sheet = rows[0];
    if (!sheet.is_latest) return res.status(409).json({ error: 'Only the latest revision can be approved' });
    if (!undo && Number(sheet.total_selling_amount) <= 0) return res.status(409).json({ error: 'Add line items and save the sheet before approving it' });

    await client.query('BEGIN');
    const nameColumn = step === 'gm' ? 'approved_by_gm' : 'approved_by_director';
    await client.query(
      `UPDATE costing_sheets SET ${nameColumn} = $1, ${nameColumn}_at = ${undo ? 'NULL' : 'NOW()'}, updated_at = NOW() WHERE id = $2`,
      [undo ? null : currentUserName(req), sheet.id]
    );
    const { rows: after } = await client.query('SELECT approved_by_gm, approved_by_director FROM costing_sheets WHERE id = $1', [sheet.id]);
    const approved = Boolean(after[0].approved_by_gm && after[0].approved_by_director);
    await client.query('UPDATE costing_sheets SET status = $1 WHERE id = $2', [approved ? 'approved' : 'draft', sheet.id]);
    await client.query(`UPDATE enquiries SET status = $1, updated_at = NOW() WHERE id = $2`, [approved ? 'approved' : 'submitted', sheet.enquiry_id]);
    await client.query('COMMIT');
    return res.json(await loadSheet(sheet.id));
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Approve sheet failed:', error);
    return res.status(500).json({ error: 'Failed to update approval' });
  } finally {
    client.release();
  }
});

// ---------------------------------------------------------------- shared documents + uploaded files

router.get('/documents/search', async (req, res) => {
  try {
    const q = `%${String(req.query.q || '').trim()}%`;
    const { rows } = await pool.query(
      `SELECT a.id, a.equipment_name AS document_name, a.type_of_service AS document_type, a.company_name, a.expiry_date, a.onedrive_url, a.cr_no, a.license_no
       FROM assets a JOIN asset_types t ON t.id = a.type_id
       WHERE t.name = 'Document' AND (a.equipment_name ILIKE $1 OR a.type_of_service ILIKE $1 OR a.company_name ILIKE $1)
       ORDER BY a.equipment_name LIMIT 30`,
      [q]
    );
    return res.json(rows);
  } catch (error) {
    console.error('Document search failed:', error);
    return res.status(500).json({ error: 'Failed to search documents' });
  }
});

async function editableSheet(id, res) {
  const { rows } = await pool.query('SELECT * FROM costing_sheets WHERE id = $1', [id]);
  if (rows.length === 0) { res.status(404).json({ error: 'Costing sheet not found' }); return null; }
  if (isLocked(rows[0])) { res.status(409).json({ error: 'This sheet is read-only' }); return null; }
  return rows[0];
}

router.post('/sheets/:id/documents', async (req, res) => {
  try {
    const sheet = await editableSheet(req.params.id, res);
    if (!sheet) return;
    const documentId = Number(req.body?.document_id);
    if (!documentId) return res.status(400).json({ error: 'document_id is required' });
    await pool.query(
      `INSERT INTO costing_documents (costing_sheet_id, document_id) VALUES ($1, $2) ON CONFLICT (costing_sheet_id, document_id) DO NOTHING`,
      [sheet.id, documentId]
    );
    return res.status(201).json(await loadSheet(sheet.id));
  } catch (error) {
    if (error.code === '23503') return res.status(404).json({ error: 'Document not found' });
    console.error('Link document failed:', error);
    return res.status(500).json({ error: 'Failed to link document' });
  }
});

router.delete('/sheets/:id/documents/:linkId', async (req, res) => {
  try {
    const sheet = await editableSheet(req.params.id, res);
    if (!sheet) return;
    await pool.query('DELETE FROM costing_documents WHERE id = $1 AND costing_sheet_id = $2', [req.params.linkId, sheet.id]);
    return res.json(await loadSheet(sheet.id));
  } catch (error) {
    console.error('Unlink document failed:', error);
    return res.status(500).json({ error: 'Failed to remove document' });
  }
});

// Raw upload: body is the file, name in ?name=. Stored in the database (max 10 MB).
router.post('/sheets/:id/files', express.raw({ type: () => true, limit: `${MAX_FILE_BYTES}b` }), async (req, res) => {
  try {
    const sheet = await editableSheet(req.params.id, res);
    if (!sheet) return;
    const name = clean(req.query.name);
    if (!name || !Buffer.isBuffer(req.body) || req.body.length === 0) return res.status(400).json({ error: 'A file and ?name= are required' });
    await pool.query(
      `INSERT INTO costing_files (costing_sheet_id, file_name, content_type, size_bytes, data, uploaded_by) VALUES ($1, $2, $3, $4, $5, $6)`,
      [sheet.id, name, clean(req.query.type) || 'application/octet-stream', req.body.length, req.body, currentUserName(req)]
    );
    return res.status(201).json(await loadSheet(sheet.id));
  } catch (error) {
    console.error('Upload file failed:', error);
    return res.status(500).json({ error: 'Failed to upload file' });
  }
});

router.get('/files/:id', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT file_name, content_type, data FROM costing_files WHERE id = $1', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'File not found' });
    res.setHeader('Content-Type', rows[0].content_type || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(rows[0].file_name)}"`);
    return res.send(rows[0].data);
  } catch (error) {
    console.error('Download file failed:', error);
    return res.status(500).json({ error: 'Failed to download file' });
  }
});

router.delete('/sheets/:id/files/:fileId', async (req, res) => {
  try {
    const sheet = await editableSheet(req.params.id, res);
    if (!sheet) return;
    await pool.query('DELETE FROM costing_files WHERE id = $1 AND costing_sheet_id = $2', [req.params.fileId, sheet.id]);
    return res.json(await loadSheet(sheet.id));
  } catch (error) {
    console.error('Delete file failed:', error);
    return res.status(500).json({ error: 'Failed to delete file' });
  }
});

module.exports = router;
module.exports.DEFAULT_OH_PCT = DEFAULT_OH_PCT;
