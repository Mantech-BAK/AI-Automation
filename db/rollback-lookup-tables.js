// Rollback for the lookup-tables migration added in db/migrate.js:
// asset_categories, asset_types, asset_departments, employee_types,
// designations, religions, origins - plus the related columns/indexes added
// to assets and technicians.
//
// This repo has no formal migration/rollback tool, so this is a plain
// hand-written "down" script matching db/migrate.js's own style. Run with:
//   node db/rollback-lookup-tables.js

const { pool } = require('../db');

async function rollback() {
  try {
    console.log('Rolling back lookup tables migration...');

    // Indexes are auto-dropped when their column is dropped below, but drop
    // them explicitly first for clarity/idempotency.
    await pool.query(`
      DROP INDEX IF EXISTS idx_technicians_origin_id;
      DROP INDEX IF EXISTS idx_technicians_religion_id;
      DROP INDEX IF EXISTS idx_technicians_designation_id;
      DROP INDEX IF EXISTS idx_technicians_type_id;
      DROP INDEX IF EXISTS idx_assets_department_id;
      DROP INDEX IF EXISTS idx_assets_type_id;
      DROP INDEX IF EXISTS idx_assets_category_id;
      DROP INDEX IF EXISTS idx_origins_name;
      DROP INDEX IF EXISTS idx_religions_name;
      DROP INDEX IF EXISTS idx_designations_name;
      DROP INDEX IF EXISTS idx_employee_types_name;
      DROP INDEX IF EXISTS idx_asset_departments_name;
      DROP INDEX IF EXISTS idx_asset_types_name;
      DROP INDEX IF EXISTS idx_asset_categories_name;
    `);

    // Drop the added columns (this also drops their FK constraints), before
    // dropping the lookup tables they reference.
    await pool.query(`
      ALTER TABLE technicians DROP COLUMN IF EXISTS task_complete_count;
      ALTER TABLE technicians DROP COLUMN IF EXISTS task_assigned_count;
      ALTER TABLE technicians DROP COLUMN IF EXISTS contact_number;
      ALTER TABLE technicians DROP COLUMN IF EXISTS origin_id;
      ALTER TABLE technicians DROP COLUMN IF EXISTS religion_id;
      ALTER TABLE technicians DROP COLUMN IF EXISTS designation_id;
      ALTER TABLE technicians DROP COLUMN IF EXISTS type_id;
      ALTER TABLE technicians DROP COLUMN IF EXISTS emp_id;
    `);

    await pool.query(`
      ALTER TABLE assets DROP COLUMN IF EXISTS remarks;
      ALTER TABLE assets DROP COLUMN IF EXISTS responsible_person;
      ALTER TABLE assets DROP COLUMN IF EXISTS reminder_days;
      ALTER TABLE assets DROP COLUMN IF EXISTS expiry_date;
      ALTER TABLE assets DROP COLUMN IF EXISTS registration_date;
      ALTER TABLE assets DROP COLUMN IF EXISTS department_id;
      ALTER TABLE assets DROP COLUMN IF EXISTS type_id;
      ALTER TABLE assets DROP COLUMN IF EXISTS category_id;
    `);

    // Now safe to drop the lookup tables themselves.
    await pool.query(`
      DROP TABLE IF EXISTS origins;
      DROP TABLE IF EXISTS religions;
      DROP TABLE IF EXISTS designations;
      DROP TABLE IF EXISTS employee_types;
      DROP TABLE IF EXISTS asset_departments;
      DROP TABLE IF EXISTS asset_types;
      DROP TABLE IF EXISTS asset_categories;
    `);

    console.log('Rollback complete: lookup tables and related columns/indexes removed.');
  } catch (error) {
    console.error('Rollback failed:', error);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

rollback();
