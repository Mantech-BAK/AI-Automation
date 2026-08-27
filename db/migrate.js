const { pool } = require('../db');

async function runMigrations() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS assets (
        id SERIAL PRIMARY KEY,
        equipment_name VARCHAR NOT NULL,
        site_location VARCHAR NOT NULL,
        maintenance_interval_days INTEGER NOT NULL,
        estimated_duration_hours NUMERIC NOT NULL,
        last_completed_date DATE,
        next_due_date DATE,
        type_of_service VARCHAR DEFAULT 'general'
      );

      CREATE TABLE IF NOT EXISTS technicians (
        id SERIAL PRIMARY KEY,
        name VARCHAR NOT NULL,
        email VARCHAR UNIQUE NOT NULL,
        type_of_service VARCHAR NOT NULL,
        open_task_count INTEGER DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS work_orders (
        id SERIAL PRIMARY KEY,
        status VARCHAR DEFAULT 'open',
        asset_id INTEGER REFERENCES assets(id),
        technician_id INTEGER REFERENCES technicians(id),
        planner_task_id VARCHAR,
        due_date DATE,
        notes TEXT,
        raised_by VARCHAR,
        approved_by VARCHAR,
        created_at TIMESTAMP DEFAULT now(),
        completed_at TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS escalation_log (
        id SERIAL PRIMARY KEY,
        work_order_id INTEGER REFERENCES work_orders(id),
        escalated_to VARCHAR,
        escalated_at TIMESTAMP DEFAULT now(),
        resolved BOOLEAN DEFAULT false,
        resolved_at TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS notification_log (
        id SERIAL PRIMARY KEY,
        work_order_id INTEGER REFERENCES work_orders(id),
        notification_type VARCHAR,
        sent_at TIMESTAMP DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS email_summaries (
        id SERIAL PRIMARY KEY,
        email_message_id VARCHAR UNIQUE,
        sender VARCHAR,
        subject VARCHAR,
        summary_text TEXT,
        category VARCHAR,
        date_received TIMESTAMP WITH TIME ZONE,
        processed_at TIMESTAMP DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS email_action_items (
        id SERIAL PRIMARY KEY,
        email_summary_id INTEGER REFERENCES email_summaries(id),
        title VARCHAR,
        assigned_to VARCHAR,
        due_date DATE,
        estimated_hours NUMERIC,
        planner_task_id VARCHAR,
        created_at TIMESTAMP DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email VARCHAR UNIQUE NOT NULL,
        password_hash VARCHAR NOT NULL,
        name VARCHAR NOT NULL,
        role VARCHAR DEFAULT 'admin',
        created_at TIMESTAMP DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS settings (
        key VARCHAR PRIMARY KEY,
        value TEXT,
        updated_at TIMESTAMP DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS sites (
        id SERIAL PRIMARY KEY,
        site_name VARCHAR NOT NULL UNIQUE,
        location VARCHAR,
        description VARCHAR,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    await pool.query(`
      INSERT INTO sites (site_name) VALUES ('Site A'), ('Site B'), ('Site C'), ('Site D')
      ON CONFLICT DO NOTHING
    `);

    await pool.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'assets' AND column_name = 'skill_type_required'
        ) THEN
          ALTER TABLE assets RENAME COLUMN skill_type_required TO type_of_service;
        END IF;

        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'technicians' AND column_name = 'skill_type'
        ) THEN
          ALTER TABLE technicians RENAME COLUMN skill_type TO type_of_service;
        END IF;
      END $$;
    `);

    await pool.query(`ALTER TABLE technicians DROP COLUMN IF EXISTS site;`);

    await pool.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'email_summaries'
            AND column_name = 'date_received'
            AND data_type = 'timestamp without time zone'
        ) THEN
          ALTER TABLE email_summaries
            ALTER COLUMN date_received TYPE TIMESTAMP WITH TIME ZONE USING date_received AT TIME ZONE 'UTC';
        END IF;
      END $$;
    `);

    // Lookup ("master") tables for asset and employee classification.
    await pool.query(`
      CREATE TABLE IF NOT EXISTS asset_categories (
        id SERIAL PRIMARY KEY,
        name VARCHAR NOT NULL,
        created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS asset_types (
        id SERIAL PRIMARY KEY,
        name VARCHAR NOT NULL,
        created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS asset_departments (
        id SERIAL PRIMARY KEY,
        name VARCHAR NOT NULL,
        created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS employee_types (
        id SERIAL PRIMARY KEY,
        name VARCHAR NOT NULL,
        created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS designations (
        id SERIAL PRIMARY KEY,
        name VARCHAR NOT NULL,
        created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS religions (
        id SERIAL PRIMARY KEY,
        name VARCHAR NOT NULL,
        created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS origins (
        id SERIAL PRIMARY KEY,
        name VARCHAR NOT NULL,
        created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now()
      );

      CREATE UNIQUE INDEX IF NOT EXISTS idx_asset_categories_name ON asset_categories(name);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_asset_types_name ON asset_types(name);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_asset_departments_name ON asset_departments(name);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_employee_types_name ON employee_types(name);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_designations_name ON designations(name);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_religions_name ON religions(name);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_origins_name ON origins(name);
    `);

    // assets: classification, registration/compliance tracking fields.
    await pool.query(`
      ALTER TABLE assets ADD COLUMN IF NOT EXISTS category_id INTEGER REFERENCES asset_categories(id) ON DELETE SET NULL;
      ALTER TABLE assets ADD COLUMN IF NOT EXISTS type_id INTEGER REFERENCES asset_types(id) ON DELETE SET NULL;
      ALTER TABLE assets ADD COLUMN IF NOT EXISTS department_id INTEGER REFERENCES asset_departments(id) ON DELETE SET NULL;
      ALTER TABLE assets ADD COLUMN IF NOT EXISTS registration_date DATE;
      ALTER TABLE assets ADD COLUMN IF NOT EXISTS expiry_date DATE;
      ALTER TABLE assets ADD COLUMN IF NOT EXISTS reminder_days INTEGER;
      ALTER TABLE assets ADD COLUMN IF NOT EXISTS responsible_person VARCHAR;
      ALTER TABLE assets ADD COLUMN IF NOT EXISTS remarks TEXT;

      CREATE INDEX IF NOT EXISTS idx_assets_category_id ON assets(category_id);
      CREATE INDEX IF NOT EXISTS idx_assets_type_id ON assets(type_id);
      CREATE INDEX IF NOT EXISTS idx_assets_department_id ON assets(department_id);
    `);

    // assets: organisational department, kept separate from site_location
    // (physical location) so the two can diverge later without a schema
    // change. For now they're seeded equal - only backfill rows that have
    // never been set, so a future manual edit here is never clobbered by a
    // later migration run.
    await pool.query(`
      ALTER TABLE assets ADD COLUMN IF NOT EXISTS department VARCHAR;
    `);
    await pool.query(`
      UPDATE assets SET department = site_location WHERE department IS NULL;
    `);

    // technicians: HR/employee record fields.
    await pool.query(`
      ALTER TABLE technicians ADD COLUMN IF NOT EXISTS emp_id VARCHAR UNIQUE;
      ALTER TABLE technicians ADD COLUMN IF NOT EXISTS type_id INTEGER REFERENCES employee_types(id) ON DELETE SET NULL;
      ALTER TABLE technicians ADD COLUMN IF NOT EXISTS designation_id INTEGER REFERENCES designations(id) ON DELETE SET NULL;
      ALTER TABLE technicians ADD COLUMN IF NOT EXISTS religion_id INTEGER REFERENCES religions(id) ON DELETE SET NULL;
      ALTER TABLE technicians ADD COLUMN IF NOT EXISTS origin_id INTEGER REFERENCES origins(id) ON DELETE SET NULL;
      ALTER TABLE technicians ADD COLUMN IF NOT EXISTS contact_number VARCHAR;
      ALTER TABLE technicians ADD COLUMN IF NOT EXISTS task_assigned_count INTEGER DEFAULT 0;
      ALTER TABLE technicians ADD COLUMN IF NOT EXISTS task_complete_count INTEGER DEFAULT 0;

      CREATE INDEX IF NOT EXISTS idx_technicians_type_id ON technicians(type_id);
      CREATE INDEX IF NOT EXISTS idx_technicians_designation_id ON technicians(designation_id);
      CREATE INDEX IF NOT EXISTS idx_technicians_religion_id ON technicians(religion_id);
      CREATE INDEX IF NOT EXISTS idx_technicians_origin_id ON technicians(origin_id);
    `);

    // Employee master table: canonical HR record, technicians included via is_technician.
    await pool.query(`
      CREATE TABLE IF NOT EXISTS employees (
        id SERIAL PRIMARY KEY,
        emp_id VARCHAR UNIQUE NOT NULL,
        name VARCHAR NOT NULL,
        email VARCHAR UNIQUE,
        contact_number VARCHAR,
        designation_id INTEGER REFERENCES designations(id) ON DELETE SET NULL,
        department_id INTEGER REFERENCES asset_departments(id) ON DELETE SET NULL,
        employee_type_id INTEGER REFERENCES employee_types(id) ON DELETE SET NULL,
        religion_id INTEGER REFERENCES religions(id) ON DELETE SET NULL,
        origin_id INTEGER REFERENCES origins(id) ON DELETE SET NULL,
        reports_to INTEGER REFERENCES employees(id) ON DELETE SET NULL,
        is_technician BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_employees_designation_id ON employees(designation_id);
      CREATE INDEX IF NOT EXISTS idx_employees_department_id ON employees(department_id);
      CREATE INDEX IF NOT EXISTS idx_employees_employee_type_id ON employees(employee_type_id);
      CREATE INDEX IF NOT EXISTS idx_employees_religion_id ON employees(religion_id);
      CREATE INDEX IF NOT EXISTS idx_employees_origin_id ON employees(origin_id);
      CREATE INDEX IF NOT EXISTS idx_employees_reports_to ON employees(reports_to);
    `);

    // technicians: link to the employee master record and who they report to.
    await pool.query(`
      ALTER TABLE technicians ADD COLUMN IF NOT EXISTS employee_id INTEGER REFERENCES employees(id) ON DELETE SET NULL;
      ALTER TABLE technicians ADD COLUMN IF NOT EXISTS reports_to_emp_id VARCHAR;
      ALTER TABLE technicians ADD COLUMN IF NOT EXISTS notification_email VARCHAR;

      CREATE INDEX IF NOT EXISTS idx_technicians_employee_id ON technicians(employee_id);
    `);

    // work_orders: separates equipment maintenance tasks from document
    // renewal tasks so each tab can query its own task type directly.
    await pool.query(`
      ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS task_type VARCHAR DEFAULT 'equipment';
    `);

    // Department-level notification recipients: which email addresses get
    // notified when documents expire or equipment maintenance is due for a
    // given department, independent of who the Planner task is assigned to.
    await pool.query(`
      CREATE TABLE IF NOT EXISTS department_notification_emails (
        id SERIAL PRIMARY KEY,
        department_name VARCHAR NOT NULL,
        email VARCHAR NOT NULL,
        label VARCHAR,
        created_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(department_name, email)
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS vehicles (
        id SERIAL PRIMARY KEY,
        vehicle_no VARCHAR NOT NULL,
        vehicle_name VARCHAR NOT NULL,
        vehicle_type VARCHAR,
        model VARCHAR,
        cr_no VARCHAR,
        department VARCHAR,
        site_location VARCHAR,
        incharge VARCHAR,
        remarks TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS vehicle_tasks (
        id SERIAL PRIMARY KEY,
        vehicle_id INTEGER REFERENCES vehicles(id) ON DELETE CASCADE,
        task_name VARCHAR NOT NULL,
        task_type VARCHAR NOT NULL,
        expiry_date DATE,
        registration_date DATE,
        reminder_days INTEGER DEFAULT 30,
        status VARCHAR DEFAULT 'open',
        planner_task_id VARCHAR,
        completed_at TIMESTAMP,
        notes TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_vehicle_tasks_vehicle_id ON vehicle_tasks(vehicle_id);
    `);

    const defaultSettings = [
      ['maintenance_manager_email', process.env.MAINTENANCE_MANAGER_EMAIL || ''],
      ['senior_manager_email', process.env.SENIOR_MANAGER_EMAIL || ''],
      ['daily_check_time', '6'],
      ['working_hours_start', '07:30'],
      ['working_hours_end', '16:30'],
      ['timezone', 'Asia/Bahrain'],
      ['notify_email_enabled', 'true'],
      ['notify_teams_enabled', 'true'],
      ['notify_calendar_enabled', 'true'],
      ['notify_reminders_enabled', 'true'],
      ['reminder_first_days', '7'],
      ['reminder_second_days', '3'],
      ['reminder_final_days', '1'],
      ['escalation_days_after_due', '0'],
      ['ai_model', 'openai/gpt-oss-20b'],
    ];

    for (const [key, value] of defaultSettings) {
      await pool.query(
        `INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO NOTHING`,
        [key, value]
      );
    }

    console.log('Migration complete: all tables created or already exist.');
  } catch (error) {
    console.error('Migration failed:', error);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

runMigrations();
