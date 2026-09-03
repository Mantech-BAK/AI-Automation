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

    // How often each item needs servicing/renewal, in days - drives the next
    // expiry/due date calculation when a task is marked complete. (Vehicles
    // used to be a separate table with their own frequency_days column - see
    // the "vehicles are no longer a separate table" migration further down,
    // which folds them into assets instead.)
    await pool.query(`
      ALTER TABLE assets ADD COLUMN IF NOT EXISTS frequency_days INTEGER DEFAULT 365;
    `);

    // Notification email resolved from the employee master record, so
    // document/vehicle reminders can be addressed to a real mailbox instead
    // of the free-text responsible_person/incharge name.
    await pool.query(`
      ALTER TABLE employees ADD COLUMN IF NOT EXISTS notification_email VARCHAR;
    `);

    // Per-user page access. Roles beyond 'admin' are gated by this list
    // rather than by the single `role` column, so a user can hold more than
    // one area of access at once (e.g. equipment + vehicles but not document).
    await pool.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS permissions JSONB DEFAULT '[]'::jsonb;
    `);

    // One-off case normalization: department/site names entered inconsistently
    // over time (e.g. "rubber plant" vs "Rubber Plant" vs "RUBBER PLANT") are
    // collapsed to Title Case so equality/grouping isn't silently split across
    // near-duplicate values. Routes normalize new writes the same way going
    // forward - see toTitleCase() in utils/text.js.
    await pool.query(`
      UPDATE assets SET
        site_location = INITCAP(LOWER(TRIM(site_location))),
        department = INITCAP(LOWER(TRIM(department)))
      WHERE site_location IS NOT NULL OR department IS NOT NULL;

      UPDATE employees SET department_text = INITCAP(LOWER(TRIM(department_text)))
      WHERE department_text IS NOT NULL;

      UPDATE asset_departments SET name = INITCAP(LOWER(TRIM(name)))
      WHERE name IS NOT NULL;

      UPDATE sites SET site_name = INITCAP(LOWER(TRIM(site_name)))
      WHERE site_name IS NOT NULL;
    `);

    // Normalizing case can produce duplicate asset_departments rows (e.g.
    // "Rubber Plant" and "rubber plant" both become "Rubber Plant") - keep the
    // lowest id per name and repoint any foreign keys before dropping the rest.
    await pool.query(`
      WITH duplicates AS (
        SELECT id, name, MIN(id) OVER (PARTITION BY name) AS keep_id
        FROM asset_departments
      ),
      to_remove AS (
        SELECT id, keep_id FROM duplicates WHERE id != keep_id
      )
      UPDATE assets SET department_id = to_remove.keep_id
      FROM to_remove WHERE assets.department_id = to_remove.id;

      WITH duplicates AS (
        SELECT id, name, MIN(id) OVER (PARTITION BY name) AS keep_id
        FROM asset_departments
      ),
      to_remove AS (
        SELECT id, keep_id FROM duplicates WHERE id != keep_id
      )
      UPDATE employees SET department_id = to_remove.keep_id
      FROM to_remove WHERE employees.department_id = to_remove.id;

      DELETE FROM asset_departments a USING (
        SELECT id, MIN(id) OVER (PARTITION BY name) AS keep_id
        FROM asset_departments
      ) d
      WHERE a.id = d.id AND a.id != d.keep_id;
    `);

    // Meetings created through the Schedule Meeting feature, stored locally
    // so "upcoming meetings" doesn't depend on Graph calendar access.
    await pool.query(`
      CREATE TABLE IF NOT EXISTS meetings (
        id SERIAL PRIMARY KEY,
        title VARCHAR NOT NULL,
        start_time TIMESTAMPTZ NOT NULL,
        end_time TIMESTAMPTZ NOT NULL,
        join_url VARCHAR,
        attendees JSONB DEFAULT '[]'::jsonb,
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_meetings_start_time ON meetings(start_time);
    `);

    // Lets GET /api/meetings/upcoming confirm a saved meeting's Graph event
    // still exists (and isn't cancelled) before showing it, and clean up the
    // local row once the event is gone.
    await pool.query(`
      ALTER TABLE meetings ADD COLUMN IF NOT EXISTS event_id VARCHAR;
    `);

    // These two settings are no longer used - manager emails are now resolved
    // dynamically from the employees table (see resolveEmailChain() in
    // jobs/dailyCheck.js) instead of a hardcoded settings value.
    await pool.query(`
      DELETE FROM settings WHERE key IN ('maintenance_manager_email', 'senior_manager_email');
    `);

    // Vehicles are no longer a separate table - a vehicle is just an asset
    // (type = Equipment, category = one of the vehicle categories below), and
    // its insurance/registration/etc. are Document-type assets linked back to
    // it via parent_asset_id. tolerance_days drives the renewal-date grace
    // period logic in utils/assetCompletion.js.
    await pool.query(`
      ALTER TABLE assets ADD COLUMN IF NOT EXISTS parent_asset_id INTEGER REFERENCES assets(id) ON DELETE CASCADE;
      ALTER TABLE assets ADD COLUMN IF NOT EXISTS tolerance_days INTEGER DEFAULT 0;

      CREATE INDEX IF NOT EXISTS idx_assets_parent_asset_id ON assets(parent_asset_id);
    `);

    // One-time swap: historically asset_categories held the coarse
    // Equipment/Document split and asset_types held the fine-grained tags
    // (Calibration, Management, ...). That's backwards from how the app now
    // needs to filter - "type" should be the Equipment/Document workflow
    // switch, "category" should be the fine-grained tag so vehicle categories
    // (Light Vehicle, Heavy Vehicle, ...) can sit alongside Calibration,
    // Electrical, etc. and apply equally to a vehicle asset and its documents.
    // Gated by a settings marker so this only ever runs once, however many
    // times migrate.js itself is re-run.
    const swapMarker = await pool.query(`SELECT 1 FROM settings WHERE key = 'category_type_swap_done'`);

    if (swapMarker.rows.length === 0) {
      console.log('Running one-time asset category/type swap...');

      const VEHICLE_CATEGORIES = ['Light Vehicle', 'Heavy Vehicle', 'Plant Equipment', 'Marine Vessel'];
      const OTHER_NEW_CATEGORIES = ['Generator', 'HVAC', 'Fire Safety', 'Electrical', 'Mechanical'];

      // Equipment/Document become the only two asset_types.
      await pool.query(`
        INSERT INTO asset_types (name) VALUES ('Equipment'), ('Document')
        ON CONFLICT (name) DO NOTHING
      `);

      // Whatever asset_types held before (Calibration, Management, Operation,
      // Industrial and Manufacturing Products, Waste Transport License, Waste
      // Tyre Recycling Plant, and any other pre-existing ones) becomes
      // asset_categories, plus the new vehicle and equipment categories.
      await pool.query(`
        INSERT INTO asset_categories (name)
        SELECT name FROM asset_types WHERE name NOT IN ('Equipment', 'Document')
        ON CONFLICT (name) DO NOTHING
      `);

      for (const name of [...VEHICLE_CATEGORIES, ...OTHER_NEW_CATEGORIES]) {
        await pool.query(`INSERT INTO asset_categories (name) VALUES ($1) ON CONFLICT (name) DO NOTHING`, [name]);
      }

      // Snapshot each asset's current category_id/type_id before touching
      // either column, so the swap below reads consistent "before" values
      // regardless of statement order.
      await pool.query(`ALTER TABLE assets ADD COLUMN IF NOT EXISTS _swap_old_category_id INTEGER;`);
      await pool.query(`ALTER TABLE assets ADD COLUMN IF NOT EXISTS _swap_old_type_id INTEGER;`);
      await pool.query(`UPDATE assets SET _swap_old_category_id = category_id, _swap_old_type_id = type_id;`);

      // New category_id = the asset_categories row with the same name as the
      // OLD type_id (Calibration/Management/etc.).
      await pool.query(`
        UPDATE assets a
        SET category_id = ac.id
        FROM asset_types old_type
        JOIN asset_categories ac ON ac.name = old_type.name
        WHERE old_type.id = a._swap_old_type_id
      `);

      // New type_id = the asset_types row with the same name as the OLD
      // category_id (Equipment/Document).
      await pool.query(`
        UPDATE assets a
        SET type_id = t.id
        FROM asset_categories old_cat
        JOIN asset_types t ON t.name = old_cat.name
        WHERE old_cat.id = a._swap_old_category_id
      `);

      await pool.query(`ALTER TABLE assets DROP COLUMN IF EXISTS _swap_old_category_id;`);
      await pool.query(`ALTER TABLE assets DROP COLUMN IF EXISTS _swap_old_type_id;`);

      // Drop the now-obsolete rows from each table - safe now that every
      // asset has already been repointed to the new rows above (any row a
      // stray reference still pointed at just gets nulled by ON DELETE SET
      // NULL rather than erroring).
      await pool.query(`DELETE FROM asset_categories WHERE name IN ('Equipment', 'Document');`);
      await pool.query(`DELETE FROM asset_types WHERE name NOT IN ('Equipment', 'Document');`);

      await pool.query(
        `INSERT INTO settings (key, value) VALUES ('category_type_swap_done', 'true')
         ON CONFLICT (key) DO UPDATE SET value = 'true'`
      );

      console.log('Asset category/type swap complete.');
    }

    // Vehicles/vehicle_tasks held no meaningful data (checked before dropping
    // - both were empty) and are fully superseded by assets + parent_asset_id.
    await pool.query(`
      DROP TABLE IF EXISTS vehicle_tasks;
      DROP TABLE IF EXISTS vehicles;
    `);

    // Three-level permission system: which departments, item types
    // (Equipment/Document), and categories a non-admin user can see. Replaces
    // the old flat `permissions` array (equipment/document/vehicles), which
    // couldn't express "only this department" or "only this category".
    await pool.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS allowed_departments JSONB DEFAULT '[]'::jsonb;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS allowed_item_types JSONB DEFAULT '[]'::jsonb;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS allowed_categories JSONB DEFAULT '[]'::jsonb;
      ALTER TABLE users DROP COLUMN IF EXISTS permissions;
    `);

    const defaultSettings = [
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
