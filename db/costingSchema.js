// Costing Sheet module tables. Idempotent: safe to run on every start (index.js) and from db/migrate.js.
async function ensureCostingSchema(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS quotation_counters (
      department VARCHAR NOT NULL,
      year INTEGER NOT NULL,
      last_number INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (department, year)
    );

    CREATE TABLE IF NOT EXISTS enquiries (
      id SERIAL PRIMARY KEY,
      enquiry_no VARCHAR UNIQUE NOT NULL,
      customer_name VARCHAR NOT NULL,
      project_name VARCHAR NOT NULL,
      client VARCHAR,
      consultant VARCHAR,
      main_contractor VARCHAR,
      department VARCHAR NOT NULL,
      date DATE NOT NULL DEFAULT CURRENT_DATE,
      status VARCHAR NOT NULL DEFAULT 'draft',
      created_by VARCHAR,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS costing_sheets (
      id SERIAL PRIMARY KEY,
      enquiry_id INTEGER NOT NULL REFERENCES enquiries(id) ON DELETE CASCADE,
      quotation_ref_no VARCHAR NOT NULL,
      ref_is_auto BOOLEAN NOT NULL DEFAULT TRUE,
      revision_no INTEGER NOT NULL DEFAULT 0,
      is_latest BOOLEAN NOT NULL DEFAULT TRUE,
      department VARCHAR NOT NULL,
      project_name VARCHAR,
      client VARCHAR,
      consultant VARCHAR,
      main_contractor VARCHAR,
      date DATE NOT NULL DEFAULT CURRENT_DATE,
      status VARCHAR NOT NULL DEFAULT 'draft',
      prepared_by VARCHAR,
      reviewed_by VARCHAR,
      approved_by_gm VARCHAR,
      approved_by_gm_at TIMESTAMPTZ,
      approved_by_director VARCHAR,
      approved_by_director_at TIMESTAMPTZ,
      oh_pct NUMERIC NOT NULL DEFAULT 35,
      total_net_cost NUMERIC NOT NULL DEFAULT 0,
      total_selling_amount NUMERIC NOT NULL DEFAULT 0,
      profit_pct_on_cost NUMERIC NOT NULL DEFAULT 0,
      profit_pct_on_selling NUMERIC NOT NULL DEFAULT 0,
      payment_terms TEXT,
      validity TEXT,
      delivery_time TEXT,
      warranty TEXT,
      terms_notes TEXT,
      created_by VARCHAR,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_costing_sheets_enquiry ON costing_sheets(enquiry_id);

    CREATE TABLE IF NOT EXISTS costing_line_items (
      id SERIAL PRIMARY KEY,
      costing_sheet_id INTEGER NOT NULL REFERENCES costing_sheets(id) ON DELETE CASCADE,
      section VARCHAR NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      sl_no INTEGER,
      qty NUMERIC,
      unit VARCHAR,
      model_no VARCHAR,
      description TEXT,
      unit_cost_exw NUMERIC,
      currency VARCHAR,
      supplier_discount_pct NUMERIC,
      unit_rate_discounted NUMERIC,
      bd_conversion_rate NUMERIC,
      unit_rate_bd NUMERIC,
      total_cost_bd NUMERIC,
      shipping_duty NUMERIC,
      unit_rate_with_cf NUMERIC,
      total_landing_cost_bd NUMERIC,
      margin_pct NUMERIC,
      unit_rate_selling NUMERIC,
      selling_total_bd NUMERIC,
      months NUMERIC,
      days NUMERIC,
      role VARCHAR,
      salary_per_month NUMERIC,
      per_day_rate NUMERIC,
      oh_pct NUMERIC,
      amount NUMERIC
    );
    CREATE INDEX IF NOT EXISTS idx_costing_lines_sheet ON costing_line_items(costing_sheet_id);

    CREATE TABLE IF NOT EXISTS costing_documents (
      id SERIAL PRIMARY KEY,
      costing_sheet_id INTEGER NOT NULL REFERENCES costing_sheets(id) ON DELETE CASCADE,
      document_id INTEGER NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
      uploaded_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE (costing_sheet_id, document_id)
    );

    CREATE TABLE IF NOT EXISTS costing_files (
      id SERIAL PRIMARY KEY,
      costing_sheet_id INTEGER NOT NULL REFERENCES costing_sheets(id) ON DELETE CASCADE,
      file_name VARCHAR NOT NULL,
      content_type VARCHAR,
      size_bytes INTEGER,
      data BYTEA NOT NULL,
      uploaded_by VARCHAR,
      uploaded_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
}

module.exports = { ensureCostingSchema };
