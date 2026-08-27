const { pool } = require('./db');

const DEMO_NOTIFICATION_EMAIL = 'mcs.sw01@bakgroup.net';

// Designation patterns (case insensitive, exact match) that mark an employee as a technician.
const TECHNICIAN_DESIGNATIONS = [
  'TECHNICIAN',
  'ELECTRONICS TECHNICIAN',
  'JR TECHNICIAN',
  'ELECTRICIAN TECHNICIAN',
  'ELECTRONINC TECHNICIAN',
  'ELECTRONIC TECHNICIAN',
  'ELECTRICAL TECHNICIAN',
  'ELECTRONCIS ENGINEER',
  'ELECTRICAL ENGINEER',
  'TELECOMMUNICATION ENGINEER',
  'FOREMAN',
  'LABOUR',
  'SITE ENGINEER',
];

const MECHANICAL_DESIGNATIONS = new Set(['FOREMAN', 'LABOUR', 'SITE ENGINEER']);

const CSV_DEPARTMENTS = ['MANTECH', 'ASPHALT', 'ELV & IT'];

function determineTypeOfService(designationText) {
  const key = (designationText || '').trim().toUpperCase();
  if (MECHANICAL_DESIGNATIONS.has(key)) return 'mechanical';
  if (TECHNICIAN_DESIGNATIONS.includes(key)) return 'electrical';
  return 'general';
}

// ---------------------------------------------------------------------------
// FIX 1: mark technicians on the employees table and add them to technicians
// ---------------------------------------------------------------------------

async function fixOneMarkAndInsertTechnicians() {
  // technicians.email was originally NOT NULL; the task requires inserting
  // technicians with email = null, so the column must allow it.
  await pool.query(`ALTER TABLE technicians ALTER COLUMN email DROP NOT NULL;`);

  const lowerPatterns = TECHNICIAN_DESIGNATIONS.map((d) => d.toLowerCase());

  const markResult = await pool.query(
    `UPDATE employees
     SET is_technician = true
     WHERE LOWER(designation_text) = ANY($1::text[])
     RETURNING id, name, emp_id, designation_text`,
    [lowerPatterns]
  );
  console.log(`  Marked ${markResult.rowCount} employee(s) as is_technician = true`);

  const { rows: technicianEmployees } = await pool.query(
    `SELECT id, emp_id, name, designation_text FROM employees WHERE is_technician = true`
  );

  let inserted = 0;
  let skipped = 0;

  for (const emp of technicianEmployees) {
    const typeOfService = determineTypeOfService(emp.designation_text);

    const result = await pool.query(
      `INSERT INTO technicians (
         name, email, type_of_service, emp_id, employee_id, reports_to_emp_id, notification_email
       ) VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (emp_id) DO NOTHING
       RETURNING id`,
      [emp.name, null, typeOfService, emp.emp_id, emp.id, null, null]
    );

    if (result.rowCount > 0) {
      console.log(`  INSERTED technician: ${emp.name} (emp_id ${emp.emp_id}, type_of_service ${typeOfService})`);
      inserted++;
    } else {
      console.log(`  SKIPPED technician (already exists): ${emp.name} (emp_id ${emp.emp_id})`);
      skipped++;
    }
  }

  console.log(`  Technicians: ${inserted} inserted, ${skipped} skipped`);
}

// ---------------------------------------------------------------------------
// FIX 2: demo notification emails on the first 4 technicians
// ---------------------------------------------------------------------------

async function fixTwoDemoNotificationEmails() {
  const { rows } = await pool.query(
    `SELECT id, name FROM technicians ORDER BY id LIMIT 4`
  );

  for (const tech of rows) {
    await pool.query(`UPDATE technicians SET notification_email = $1 WHERE id = $2`, [
      DEMO_NOTIFICATION_EMAIL,
      tech.id,
    ]);
    console.log(`  Set notification_email for ${tech.name} (id ${tech.id}) -> ${DEMO_NOTIFICATION_EMAIL}`);
  }

  console.log(`  ${rows.length} technician(s) now use ${DEMO_NOTIFICATION_EMAIL} for demo notifications`);
}

// ---------------------------------------------------------------------------
// FIX 3: CSV department values in asset_departments + employees.department_id
// ---------------------------------------------------------------------------

async function fixThreeDepartments() {
  for (const name of CSV_DEPARTMENTS) {
    await pool.query(`INSERT INTO asset_departments (name) VALUES ($1) ON CONFLICT DO NOTHING`, [name]);
  }
  console.log(`  Ensured asset_departments contains: ${CSV_DEPARTMENTS.join(', ')}`);

  const { rows: departmentRows } = await pool.query(`SELECT id, name FROM asset_departments`);
  const departmentIdByLowerName = new Map(departmentRows.map((r) => [r.name.toLowerCase(), r.id]));

  const { rows: employees } = await pool.query(`SELECT id, department_text FROM employees`);

  let updated = 0;
  let unmatched = 0;

  for (const emp of employees) {
    const deptText = (emp.department_text || '').trim();
    const departmentId = deptText ? departmentIdByLowerName.get(deptText.toLowerCase()) || null : null;

    if (departmentId) {
      await pool.query(`UPDATE employees SET department_id = $1 WHERE id = $2`, [departmentId, emp.id]);
      updated++;
    } else {
      unmatched++;
    }
  }

  console.log(`  employees.department_id updated: ${updated}, unmatched department_text: ${unmatched}`);
}

// ---------------------------------------------------------------------------
// FIX 6: verification summary
// ---------------------------------------------------------------------------

async function printSummary() {
  const scalar = async (query, params) => {
    const { rows } = await pool.query(query, params);
    return Number(Object.values(rows[0])[0]);
  };

  const totalEmployees = await scalar('SELECT COUNT(*) FROM employees');
  const totalTechnicians = await scalar('SELECT COUNT(*) FROM employees WHERE is_technician = true');
  const techniciansWithNotificationEmail = await scalar(
    'SELECT COUNT(*) FROM technicians WHERE notification_email IS NOT NULL'
  );
  const departmentsCount = await scalar('SELECT COUNT(*) FROM asset_departments');

  console.log(`  Total employees: ${totalEmployees}`);
  console.log(`  Total technicians (is_technician = true): ${totalTechnicians}`);
  console.log(`  Technicians with notification_email set: ${techniciansWithNotificationEmail}`);
  console.log(`  Departments in asset_departments: ${departmentsCount}`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('=== FIX 1: Marking technicians and inserting into technicians table ===');
  await fixOneMarkAndInsertTechnicians();

  console.log('=== FIX 2: Setting demo notification emails ===');
  await fixTwoDemoNotificationEmails();

  console.log('=== FIX 3: Adding CSV departments and linking employees.department_id ===');
  await fixThreeDepartments();

  console.log('=== FIX 6: Verification summary ===');
  await printSummary();

  console.log('DONE');
}

main()
  .catch((error) => {
    console.error('Fix script failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
