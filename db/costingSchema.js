// Costing Sheet module tables, enquiry workflow, role hierarchy and seed data.
// Idempotent: safe to run on every start (index.js) and from db/migrate.js.
//
// A first, simpler version of this module (customer_name-based enquiries, standalone sheets) was never
// used in production; if its tables are found they are dropped and rebuilt in the new shape.
async function ensureCostingSchema(pool) {
  const { rows: legacy } = await pool.query(
    `SELECT 1 FROM information_schema.columns WHERE table_name = 'enquiries' AND column_name = 'customer_name' LIMIT 1`
  );
  if (legacy.length > 0) {
    console.warn('Costing: dropping the first-generation costing tables and rebuilding them');
    await pool.query(`
      DROP TABLE IF EXISTS costing_files, costing_documents, costing_line_items, costing_sheets, enquiries, quotation_counters CASCADE;
    `);
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS departments (
      id SERIAL PRIMARY KEY,
      name VARCHAR NOT NULL UNIQUE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS roles (
      id SERIAL PRIMARY KEY,
      name VARCHAR NOT NULL UNIQUE,
      level INTEGER NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS mas_users (
      id SERIAL PRIMARY KEY,
      name VARCHAR NOT NULL,
      email VARCHAR,
      role_id INTEGER NOT NULL REFERENCES roles(id),
      department_id INTEGER REFERENCES departments(id),
      manager_id INTEGER REFERENCES mas_users(id) ON DELETE SET NULL,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS enquiries (
      id SERIAL PRIMARY KEY,
      enquiry_no VARCHAR UNIQUE NOT NULL,
      client_name VARCHAR NOT NULL,
      project_name VARCHAR NOT NULL,
      project_location VARCHAR,
      consultant VARCHAR,
      main_contractor VARCHAR,
      department_id INTEGER REFERENCES departments(id),
      assigned_to INTEGER REFERENCES mas_users(id),
      salesman_id INTEGER REFERENCES mas_users(id),
      submission_date DATE,
      estimated_value NUMERIC,
      status VARCHAR NOT NULL DEFAULT 'open',
      notes TEXT,
      created_by INTEGER REFERENCES mas_users(id),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS enquiry_tasks (
      id SERIAL PRIMARY KEY,
      enquiry_id INTEGER NOT NULL REFERENCES enquiries(id) ON DELETE CASCADE,
      assigned_to INTEGER REFERENCES mas_users(id),
      task_title VARCHAR NOT NULL,
      description TEXT,
      due_date DATE,
      status VARCHAR NOT NULL DEFAULT 'pending',
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS quotation_counters (
      department_id INTEGER NOT NULL REFERENCES departments(id),
      year INTEGER NOT NULL,
      last_number INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (department_id, year)
    );

    CREATE TABLE IF NOT EXISTS costing_sheets (
      id SERIAL PRIMARY KEY,
      enquiry_id INTEGER NOT NULL REFERENCES enquiries(id) ON DELETE CASCADE,
      quotation_ref_no VARCHAR NOT NULL,
      revision_no INTEGER NOT NULL DEFAULT 0,
      is_latest BOOLEAN NOT NULL DEFAULT TRUE,
      project_name VARCHAR,
      client VARCHAR,
      consultant VARCHAR,
      main_contractor VARCHAR,
      date DATE NOT NULL DEFAULT CURRENT_DATE,
      department_id INTEGER REFERENCES departments(id),
      prepared_by INTEGER REFERENCES mas_users(id),
      status VARCHAR NOT NULL DEFAULT 'draft',
      rejection_comment TEXT,
      reviewed_by INTEGER REFERENCES mas_users(id),
      reviewed_at TIMESTAMPTZ,
      submitted_at TIMESTAMPTZ,
      total_net_cost NUMERIC NOT NULL DEFAULT 0,
      total_selling_amount NUMERIC NOT NULL DEFAULT 0,
      profit_pct_on_cost NUMERIC NOT NULL DEFAULT 0,
      profit_pct_on_selling NUMERIC NOT NULL DEFAULT 0,
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
      shipping_duty_pct NUMERIC,
      unit_rate_with_cf NUMERIC,
      total_landing_cost_bd NUMERIC,
      margin_pct NUMERIC,
      unit_rate_selling NUMERIC,
      selling_total_bd NUMERIC,
      unit_cost_bd NUMERIC,
      nos NUMERIC,
      months NUMERIC,
      days NUMERIC,
      role_name VARCHAR,
      salary_per_month NUMERIC,
      per_day_rate NUMERIC,
      oh_pct NUMERIC,
      total_cost NUMERIC,
      amount NUMERIC
    );
    CREATE INDEX IF NOT EXISTS idx_costing_lines_sheet ON costing_line_items(costing_sheet_id);
    -- A heading row is a label/divider between groups of items: section + description only, every number null.
    ALTER TABLE costing_line_items ADD COLUMN IF NOT EXISTS is_heading BOOLEAN NOT NULL DEFAULT FALSE;

    CREATE TABLE IF NOT EXISTS mas_notifications (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES mas_users(id) ON DELETE CASCADE,
      message TEXT NOT NULL,
      link VARCHAR,
      is_read BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_mas_notifications_user ON mas_notifications(user_id, is_read);
  `);

  await seedCosting(pool);
}

// Departments, roles and the sample users - only when the tables are empty, so edits are never overwritten.
async function seedCosting(pool) {
  for (const name of ['ELV', 'ELC', 'FS', 'MECH', 'IT']) {
    await pool.query('INSERT INTO departments (name) VALUES ($1) ON CONFLICT (name) DO NOTHING', [name]);
  }
  const roles = [['Director', 5], ['General Manager', 4], ['Manager', 3], ['Sales Engineer', 2], ['Estimator', 1]];
  for (const [name, level] of roles) {
    await pool.query('INSERT INTO roles (name, level) VALUES ($1, $2) ON CONFLICT (name) DO NOTHING', [name, level]);
  }

  const { rows } = await pool.query('SELECT COUNT(*)::int AS count FROM mas_users');
  if (rows[0].count > 0) return;

  const roleId = async (name) => (await pool.query('SELECT id FROM roles WHERE name = $1', [name])).rows[0].id;
  const deptId = async (name) => (name ? (await pool.query('SELECT id FROM departments WHERE name = $1', [name])).rows[0].id : null);
  const add = async (name, role, department, managerId) =>
    (await pool.query('INSERT INTO mas_users (name, role_id, department_id, manager_id) VALUES ($1, $2, $3, $4) RETURNING id', [name, await roleId(role), await deptId(department), managerId])).rows[0].id;

  const ahmed = await add('Ahmed Al Farsi', 'Director', null, null);
  const dhanaraju = await add('Dhanaraju', 'General Manager', null, ahmed);
  const salim = await add('Salim', 'Manager', 'ELV', dhanaraju);
  await add('Yasir', 'Sales Engineer', 'ELV', salim);
  await add('Ravi', 'Estimator', 'ELV', salim);
}

module.exports = { ensureCostingSchema, seedCosting };
