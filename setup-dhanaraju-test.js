const { pool } = require('./db');

// One-off test-data setup: makes one document asset due tomorrow and assigns
// it to Dhanaraju, so the next daily check run has something fresh to notify
// on. Safe to re-run - Step 1 upserts by emp_id, and Step 2 only ever grabs
// one asset that doesn't already have an open work order.
async function run() {
  try {
    console.log('=== Dhanaraju Test Setup ===\n');

    // Step 1 - find or insert Dhanaraju in the employee master record.
    const { rows: employeeRows } = await pool.query(
      `INSERT INTO employees (emp_id, name, email, notification_email, is_technician, department_text, designation_text)
       VALUES ('DHAN001', 'Dhanaraju', 'dhanaraju@bakgroup.net', 'dhanaraju@bakgroup.net', false, 'Asphalt', 'Engineer')
       ON CONFLICT (emp_id) DO UPDATE SET notification_email = 'dhanaraju@bakgroup.net', email = 'dhanaraju@bakgroup.net'
       RETURNING id, emp_id, name, email, notification_email`
    );
    const employee = employeeRows[0];
    console.log('Step 1: Employee record ready ->', employee);

    const myUserId = process.env.MY_USER_ID || null;
    console.log(`Step 1: MY_USER_ID from environment: ${myUserId || '(not set)'}`);

    // No column currently exists on employees to persist a per-person
    // Microsoft 365 user id (only the single shared MY_USER_ID is used
    // elsewhere, for Planner task assignment) - this just surfaces one if a
    // caller has set it via the environment, without inventing storage for it.
    const dhanarajuUserId = process.env.DHANARAJU_MS_USER_ID || null;
    if (dhanarajuUserId) {
      console.log(`Step 1: Dhanaraju Microsoft 365 user id found in environment (DHANARAJU_MS_USER_ID): ${dhanarajuUserId}`);
      console.log('Step 1: employees has no column to store this id yet - skipping persistence (add one, e.g. graph_user_id, if this needs to be saved).');
    } else {
      console.log('Step 1: No Dhanaraju Microsoft 365 user id is configured in the environment (expected DHANARAJU_MS_USER_ID) - nothing to store.');
    }

    // Step 2 - pick one Document-type asset with no open work order and push
    // its due/expiry date to tomorrow. Note: 'Document' lives in asset_types
    // now (not asset_categories) after this project's type/category swap.
    const { rows: updatedAssets } = await pool.query(
      `UPDATE assets
       SET next_due_date = CURRENT_DATE + 1,
           expiry_date = CURRENT_DATE + 1,
           responsible_person = 'Dhanaraju',
           reminder_days = 1
       WHERE id = (
         SELECT id FROM assets
         WHERE type_id = (SELECT id FROM asset_types WHERE name = 'Document')
           AND expiry_date IS NOT NULL
           AND id NOT IN (SELECT asset_id FROM work_orders WHERE status = 'open')
         LIMIT 1
       )
       RETURNING id, equipment_name, site_location, expiry_date, responsible_person`
    );
    const updatedAsset = updatedAssets[0] || null;

    // Step 3 - report what changed.
    console.log('\nStep 3: Document updated for the test');
    if (updatedAsset) {
      console.log(`  Name:               ${updatedAsset.equipment_name}`);
      console.log(`  Department/Site:    ${updatedAsset.site_location || '(none)'}`);
      console.log(`  New expiry date:    ${updatedAsset.expiry_date}`);
      console.log(`  Responsible person: ${updatedAsset.responsible_person}`);
    } else {
      console.log('  No eligible document asset was found (every Document-type asset either has no expiry_date or already has an open work order).');
    }

    // Step 4 - clear any stale notification log entries for this asset so
    // the next daily check run treats it as fresh.
    if (updatedAsset) {
      const { rowCount } = await pool.query(
        `DELETE FROM notification_log
         WHERE notes::text LIKE '%asset_id%'
           AND notes::jsonb->>'asset_id' = $1::text`,
        [String(updatedAsset.id)]
      );
      console.log(`\nStep 4: Deleted ${rowCount} stale notification_log row(s) for asset ${updatedAsset.id}.`);
    } else {
      console.log('\nStep 4: Skipped - no asset was updated in Step 2.');
    }

    console.log('\nDone.');
  } catch (error) {
    console.error('setup-dhanaraju-test failed:', error);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

run();
