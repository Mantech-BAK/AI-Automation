const { pool } = require('./db');

async function getLookupMap(table) {
  const { rows } = await pool.query(`SELECT id, name FROM ${table}`);
  const map = {};
  for (const row of rows) map[row.name] = row.id;
  return map;
}

function categorizeAsset(equipmentName) {
  if (equipmentName.startsWith('Backup Generator')) return { category: 'Mechanical Equipment', type: 'Backup Generator', remarkKey: 'Backup Generator' };
  if (equipmentName.startsWith('Generator')) return { category: 'Mechanical Equipment', type: 'Generator', remarkKey: 'Generator' };
  if (equipmentName.startsWith('Air Conditioning Unit')) return { category: 'HVAC', type: 'AC Unit', remarkKey: 'Air Conditioning Unit' };
  if (equipmentName.startsWith('Fire Suppression System')) return { category: 'Fire Safety', type: 'Fire Suppression System', remarkKey: 'Fire Suppression System' };
  if (equipmentName.startsWith('Elevator')) return { category: 'Elevators', type: 'Elevator', remarkKey: 'Elevator' };
  if (equipmentName.startsWith('Water Pump')) return { category: 'Mechanical Equipment', type: 'Water Pump', remarkKey: 'Water Pump' };
  if (equipmentName.startsWith('HVAC Unit')) return { category: 'HVAC', type: 'HVAC Unit', remarkKey: 'HVAC Unit' };
  if (equipmentName.startsWith('Emergency Lighting')) return { category: 'Electrical Systems', type: 'Emergency Lighting', remarkKey: 'Emergency Lighting' };
  if (equipmentName.startsWith('UPS System')) return { category: 'Electrical Systems', type: 'UPS System', remarkKey: 'UPS System' };
  if (equipmentName.startsWith('Cooling Tower')) return { category: 'Mechanical Equipment', type: 'Cooling Tower', remarkKey: 'Cooling Tower' };
  // No "Security System" asset type exists in asset_types (closest is "Security Camera");
  // mapped here so no asset is left with a null type_id.
  if (equipmentName.startsWith('Security System')) return { category: 'Security Systems', type: 'Security Camera', remarkKey: 'Security System' };
  throw new Error(`No category/type mapping for equipment: ${equipmentName}`);
}

const REMARKS_BY_TYPE = {
  Generator: 'Annual load test and oil change scheduled.',
  'Backup Generator': 'Fuel system inspection and automatic transfer switch test.',
  'Air Conditioning Unit': 'Filter replacement and refrigerant level check due.',
  'Fire Suppression System': 'Inspect extinguishing agent levels and nozzle integrity.',
  Elevator: 'Certified elevator inspection and safety compliance check.',
  'Water Pump': 'Seal and impeller inspection with lubrication check.',
  'HVAC Unit': 'Coil cleaning and airflow calibration scheduled.',
  'Emergency Lighting': 'Battery backup test and bulb replacement check.',
  'UPS System': 'Battery health test and load bank test scheduled.',
  'Cooling Tower': 'Water treatment and fill media inspection due.',
  'Security System': 'Camera calibration and DVR storage check.',
};

const ASSET_DEFS = [
  // Site A (12)
  { name: 'Generator A1', site: 'Site A', interval: 90, hours: 4, service: 'mechanical' },
  { name: 'Generator A2', site: 'Site A', interval: 90, hours: 4, service: 'mechanical' },
  { name: 'Air Conditioning Unit A1', site: 'Site A', interval: 30, hours: 1, service: 'general' },
  { name: 'Air Conditioning Unit A2', site: 'Site A', interval: 30, hours: 1, service: 'general' },
  { name: 'Fire Suppression System A', site: 'Site A', interval: 180, hours: 3, service: 'electrical' },
  { name: 'Elevator A1', site: 'Site A', interval: 365, hours: 5, service: 'mechanical' },
  { name: 'Elevator A2', site: 'Site A', interval: 365, hours: 5, service: 'mechanical' },
  { name: 'Emergency Lighting A', site: 'Site A', interval: 180, hours: 2, service: 'electrical' },
  { name: 'Water Pump A1', site: 'Site A', interval: 60, hours: 2, service: 'mechanical' },
  { name: 'Water Pump A2', site: 'Site A', interval: 60, hours: 2, service: 'mechanical' },
  { name: 'HVAC Unit A1', site: 'Site A', interval: 90, hours: 3, service: 'mechanical' },
  { name: 'Security System A', site: 'Site A', interval: 365, hours: 2, service: 'electrical' },
  // Site B (13)
  { name: 'Generator B1', site: 'Site B', interval: 90, hours: 4, service: 'mechanical' },
  { name: 'Generator B2', site: 'Site B', interval: 90, hours: 4, service: 'mechanical' },
  { name: 'Air Conditioning Unit B1', site: 'Site B', interval: 30, hours: 1, service: 'general' },
  { name: 'Air Conditioning Unit B2', site: 'Site B', interval: 30, hours: 1, service: 'general' },
  { name: 'Air Conditioning Unit B3', site: 'Site B', interval: 30, hours: 1, service: 'general' },
  { name: 'Fire Suppression System B', site: 'Site B', interval: 180, hours: 3, service: 'electrical' },
  { name: 'Elevator B1', site: 'Site B', interval: 365, hours: 5, service: 'mechanical' },
  { name: 'Emergency Lighting B', site: 'Site B', interval: 180, hours: 2, service: 'electrical' },
  { name: 'Water Pump B1', site: 'Site B', interval: 60, hours: 2, service: 'mechanical' },
  { name: 'HVAC Unit B1', site: 'Site B', interval: 90, hours: 3, service: 'mechanical' },
  { name: 'HVAC Unit B2', site: 'Site B', interval: 90, hours: 3, service: 'mechanical' },
  { name: 'UPS System B', site: 'Site B', interval: 180, hours: 2, service: 'electrical' },
  { name: 'Backup Generator B', site: 'Site B', interval: 180, hours: 4, service: 'mechanical' },
  // Site C (13)
  { name: 'Generator C1', site: 'Site C', interval: 90, hours: 4, service: 'mechanical' },
  { name: 'Generator C2', site: 'Site C', interval: 90, hours: 4, service: 'mechanical' },
  { name: 'Air Conditioning Unit C1', site: 'Site C', interval: 30, hours: 1, service: 'general' },
  { name: 'Air Conditioning Unit C2', site: 'Site C', interval: 30, hours: 1, service: 'general' },
  { name: 'Fire Suppression System C1', site: 'Site C', interval: 180, hours: 3, service: 'electrical' },
  { name: 'Fire Suppression System C2', site: 'Site C', interval: 180, hours: 3, service: 'electrical' },
  { name: 'Elevator C1', site: 'Site C', interval: 365, hours: 5, service: 'mechanical' },
  { name: 'Emergency Lighting C', site: 'Site C', interval: 180, hours: 2, service: 'electrical' },
  { name: 'Water Pump C1', site: 'Site C', interval: 60, hours: 2, service: 'mechanical' },
  { name: 'Water Pump C2', site: 'Site C', interval: 60, hours: 2, service: 'mechanical' },
  { name: 'HVAC Unit C1', site: 'Site C', interval: 90, hours: 3, service: 'mechanical' },
  { name: 'Cooling Tower C', site: 'Site C', interval: 90, hours: 3, service: 'mechanical' },
  { name: 'Security System C', site: 'Site C', interval: 365, hours: 2, service: 'electrical' },
  // Site D (12)
  { name: 'Generator D1', site: 'Site D', interval: 90, hours: 4, service: 'mechanical' },
  { name: 'Generator D2', site: 'Site D', interval: 90, hours: 4, service: 'mechanical' },
  { name: 'Air Conditioning Unit D1', site: 'Site D', interval: 30, hours: 1, service: 'general' },
  { name: 'Air Conditioning Unit D2', site: 'Site D', interval: 30, hours: 1, service: 'general' },
  { name: 'Fire Suppression System D', site: 'Site D', interval: 180, hours: 3, service: 'electrical' },
  { name: 'Elevator D1', site: 'Site D', interval: 365, hours: 5, service: 'mechanical' },
  { name: 'Emergency Lighting D', site: 'Site D', interval: 180, hours: 2, service: 'electrical' },
  { name: 'Water Pump D1', site: 'Site D', interval: 60, hours: 2, service: 'mechanical' },
  { name: 'Water Pump D2', site: 'Site D', interval: 60, hours: 2, service: 'mechanical' },
  { name: 'HVAC Unit D1', site: 'Site D', interval: 90, hours: 3, service: 'mechanical' },
  { name: 'UPS System D', site: 'Site D', interval: 180, hours: 2, service: 'electrical' },
  { name: 'Backup Generator D', site: 'Site D', interval: 180, hours: 4, service: 'mechanical' },
];

if (ASSET_DEFS.length !== 50) {
  throw new Error(`Expected 50 asset definitions, got ${ASSET_DEFS.length}`);
}

// next_due_date offset (in days from CURRENT_DATE) by position (1-indexed id, matching insertion order
// after the id sequences are reset to 1). Positions 1-2 overdue, 3-8 due today, 9-10 due within 30 days,
// 11-50 due 200+ days out (staggered by id so they don't all land on the same date).
function nextDueOffsetDays(id) {
  if (id === 1) return -3;
  if (id === 2) return -7;
  if (id >= 3 && id <= 8) return 0;
  if (id === 9) return 15;
  if (id === 10) return 25;
  return 200 + id * 3;
}

const TECHNICIANS = [
  { emp_id: 'EMP001', name: 'Ahmed Al-Rashid', email: 'ahmed.alrashid@bakgroup.net', contact_number: '+97336100001', designation: 'Senior Technician', department: 'Facilities', employeeType: 'Full Time', religion: 'Islam', origin: 'Bahrain', reportsTo: 'EMP011', typeOfService: 'mechanical', notificationEmail: 'mcs.sw01@bakgroup.net' },
  { emp_id: 'EMP002', name: 'Mohammed Hassan', email: 'mohammed.hassan@bakgroup.net', contact_number: '+97336100002', designation: 'Senior Technician', department: 'Facilities', employeeType: 'Full Time', religion: 'Islam', origin: 'India', reportsTo: 'EMP011', typeOfService: 'electrical', notificationEmail: 'mcs.sw01@bakgroup.net' },
  { emp_id: 'EMP003', name: 'Khalid Ibrahim', email: 'khalid.ibrahim@bakgroup.net', contact_number: '+97336100003', designation: 'Junior Technician', department: 'Facilities', employeeType: 'Full Time', religion: 'Islam', origin: 'Pakistan', reportsTo: 'EMP011', typeOfService: 'general', notificationEmail: 'mcs.sw01@bakgroup.net' },
  { emp_id: 'EMP004', name: 'Sara Al-Mansoori', email: 'sara.almansoori@bakgroup.net', contact_number: '+97336100004', designation: 'Junior Technician', department: 'Facilities', employeeType: 'Full Time', religion: 'Islam', origin: 'Bahrain', reportsTo: 'EMP011', typeOfService: 'mechanical' },
  { emp_id: 'EMP005', name: 'Ravi Kumar', email: 'ravi.kumar@bakgroup.net', contact_number: '+97336100005', designation: 'Junior Technician', department: 'Facilities', employeeType: 'Contract', religion: 'Hinduism', origin: 'India', reportsTo: 'EMP011', typeOfService: 'electrical' },
  { emp_id: 'EMP006', name: 'James Wilson', email: 'james.wilson@bakgroup.net', contact_number: '+97336100006', designation: 'Junior Technician', department: 'Facilities', employeeType: 'Contract', religion: 'Christianity', origin: 'Philippines', reportsTo: 'EMP011', typeOfService: 'general' },
  { emp_id: 'EMP007', name: 'Ali Hassan', email: 'ali.hassan@bakgroup.net', contact_number: '+97336100007', designation: 'Junior Technician', department: 'Facilities', employeeType: 'Contract', religion: 'Islam', origin: 'Egypt', reportsTo: 'EMP011', typeOfService: 'mechanical' },
  { emp_id: 'EMP008', name: 'Omar Farooq', email: 'omar.farooq@bakgroup.net', contact_number: '+97336100008', designation: 'Junior Technician', department: 'Facilities', employeeType: 'Contract', religion: 'Islam', origin: 'Pakistan', reportsTo: 'EMP011', typeOfService: 'electrical' },
  { emp_id: 'EMP009', name: 'Priya Sharma', email: 'priya.sharma@bakgroup.net', contact_number: '+97336100009', designation: 'Junior Technician', department: 'Facilities', employeeType: 'Contract', religion: 'Hinduism', origin: 'India', reportsTo: 'EMP011', typeOfService: 'general' },
  { emp_id: 'EMP010', name: 'David Chen', email: 'david.chen@bakgroup.net', contact_number: '+97336100010', designation: 'Junior Technician', department: 'Facilities', employeeType: 'Contract', religion: 'Christianity', origin: 'Philippines', reportsTo: 'EMP011', typeOfService: 'mechanical' },
];

const SUPERVISORS = [
  { emp_id: 'EMP011', name: 'Yasir Ismail', email: 'mcs.sw01@bakgroup.net', contact_number: '+97336199001', designation: 'Facilities Manager', department: 'Facilities', employeeType: 'Full Time', religion: 'Islam', origin: 'Bahrain', reportsTo: null },
  { emp_id: 'EMP012', name: 'Hassan Al-Farsi', email: 'hassan.alfarsi@bakgroup.net', contact_number: '+97336199002', designation: 'Site Supervisor', department: 'Operations', employeeType: 'Full Time', religion: 'Islam', origin: 'Bahrain', reportsTo: 'EMP011' },
  { emp_id: 'EMP013', name: 'Fatima Al-Khalifa', email: 'fatima.khalifa@bakgroup.net', contact_number: '+97336199003', designation: 'Site Supervisor', department: 'Administration', employeeType: 'Full Time', religion: 'Islam', origin: 'Bahrain', reportsTo: 'EMP011' },
  { emp_id: 'EMP014', name: 'Omar Al-Mansoori', email: 'omar.almansoori@bakgroup.net', contact_number: '+97336199004', designation: 'Maintenance Engineer', department: 'Engineering', employeeType: 'Full Time', religion: 'Islam', origin: 'UAE', reportsTo: 'EMP011' },
  { emp_id: 'EMP015', name: 'Layla Hassan', email: 'layla.hassan@bakgroup.net', contact_number: '+97336199005', designation: 'Site Supervisor', department: 'Operations', employeeType: 'Full Time', religion: 'Islam', origin: 'Jordan', reportsTo: 'EMP011' },
];

async function deleteAllData(client) {
  await client.query('DELETE FROM email_action_items');
  await client.query('DELETE FROM email_summaries');
  await client.query('DELETE FROM escalation_log');
  await client.query('DELETE FROM notification_log');
  await client.query('DELETE FROM work_orders');
  await client.query('DELETE FROM technicians');
  await client.query('DELETE FROM employees');
  await client.query('DELETE FROM assets');

  await client.query('ALTER SEQUENCE assets_id_seq RESTART WITH 1');
  await client.query('ALTER SEQUENCE technicians_id_seq RESTART WITH 1');
  await client.query('ALTER SEQUENCE employees_id_seq RESTART WITH 1');
  await client.query('ALTER SEQUENCE work_orders_id_seq RESTART WITH 1');

  console.log('Step 1 complete: existing data deleted and sequences reset.');
}

async function insertEmployeesAndTechnicians(client, lookups) {
  // Supervisors first (in listed order) so EMP011 exists before anyone's reports_to references it.
  for (const sup of SUPERVISORS) {
    await client.query(
      `INSERT INTO employees (emp_id, name, email, contact_number, designation_id, department_id, employee_type_id, religion_id, origin_id, reports_to, is_technician)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9,
         (SELECT id FROM employees WHERE emp_id = $10),
         FALSE)`,
      [
        sup.emp_id,
        sup.name,
        sup.email,
        sup.contact_number,
        lookups.designations[sup.designation],
        lookups.departments[sup.department],
        lookups.employeeTypes[sup.employeeType],
        lookups.religions[sup.religion],
        lookups.origins[sup.origin],
        sup.reportsTo,
      ]
    );
  }

  // Technicians: inserted into both employees (is_technician = true) and technicians.
  for (const tech of TECHNICIANS) {
    const employeeResult = await client.query(
      `INSERT INTO employees (emp_id, name, email, contact_number, designation_id, department_id, employee_type_id, religion_id, origin_id, reports_to, is_technician)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9,
         (SELECT id FROM employees WHERE emp_id = $10),
         TRUE)
       RETURNING id`,
      [
        tech.emp_id,
        tech.name,
        tech.email,
        tech.contact_number,
        lookups.designations[tech.designation],
        lookups.departments[tech.department],
        lookups.employeeTypes[tech.employeeType],
        lookups.religions[tech.religion],
        lookups.origins[tech.origin],
        tech.reportsTo,
      ]
    );
    const employeeId = employeeResult.rows[0].id;

    await client.query(
      `INSERT INTO technicians (
         name, email, type_of_service, emp_id, type_id, designation_id, religion_id, origin_id,
         contact_number, employee_id, reports_to_emp_id, notification_email
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [
        tech.name,
        tech.email,
        tech.typeOfService,
        tech.emp_id,
        lookups.employeeTypes[tech.employeeType],
        lookups.designations[tech.designation],
        lookups.religions[tech.religion],
        lookups.origins[tech.origin],
        tech.contact_number,
        employeeId,
        tech.reportsTo,
        tech.notificationEmail || tech.email,
      ]
    );
  }

  console.log(`Step 2 complete: ${SUPERVISORS.length} supervisors + ${TECHNICIANS.length} technicians inserted into employees and technicians.`);
}

async function insertAssets(client, lookups) {
  for (let i = 0; i < ASSET_DEFS.length; i++) {
    const id = i + 1; // matches the SERIAL id, since the sequence was just reset to 1
    const asset = ASSET_DEFS[i];
    const { category, type, remarkKey } = categorizeAsset(asset.name);

    const dueOffset = nextDueOffsetDays(id);
    const completedOffset = dueOffset - asset.interval;
    const regYearsAgo = 2 + (id % 4); // 2-5 years ago
    const expYearsAhead = 3 + (id % 5); // 3-7 years from now

    await client.query(
      `INSERT INTO assets (
         equipment_name, site_location, maintenance_interval_days, estimated_duration_hours,
         last_completed_date, next_due_date, type_of_service,
         category_id, type_id, department_id,
         registration_date, expiry_date, reminder_days, responsible_person, remarks
       ) VALUES (
         $1, $2, $3, $4,
         (CURRENT_DATE + make_interval(days => $5::int))::date,
         (CURRENT_DATE + make_interval(days => $6::int))::date,
         $7,
         $8, $9, $10,
         (CURRENT_DATE - make_interval(years => $11::int))::date,
         (CURRENT_DATE + make_interval(years => $12::int))::date,
         7, 'Yasir Ismail', $13
       )`,
      [
        asset.name,
        asset.site,
        asset.interval,
        asset.hours,
        completedOffset,
        dueOffset,
        asset.service,
        lookups.categories[category],
        lookups.types[type],
        lookups.departments['Facilities'],
        regYearsAgo,
        expYearsAhead,
        REMARKS_BY_TYPE[remarkKey],
      ]
    );
  }

  console.log(`Step 3 complete: ${ASSET_DEFS.length} assets inserted across Site A-D.`);
}

async function printVerificationSummary() {
  const employeeCount = await pool.query('SELECT COUNT(*) FROM employees');
  const technicianCount = await pool.query('SELECT COUNT(*) FROM technicians');
  const supervisorCount = await pool.query('SELECT COUNT(*) FROM employees WHERE is_technician = FALSE');
  const assetCount = await pool.query('SELECT COUNT(*) FROM assets');

  const overdue = await pool.query(`SELECT COUNT(*) FROM assets WHERE next_due_date < CURRENT_DATE`);
  const dueToday = await pool.query(`SELECT COUNT(*) FROM assets WHERE next_due_date = CURRENT_DATE`);
  const dueWithin30 = await pool.query(`SELECT COUNT(*) FROM assets WHERE next_due_date > CURRENT_DATE AND next_due_date <= CURRENT_DATE + INTERVAL '30 days'`);
  const dueAfter90 = await pool.query(`SELECT COUNT(*) FROM assets WHERE next_due_date > CURRENT_DATE + INTERVAL '90 days'`);

  const nullAssets = await pool.query(`
    SELECT id, equipment_name FROM assets
    WHERE equipment_name IS NULL OR site_location IS NULL OR maintenance_interval_days IS NULL
       OR estimated_duration_hours IS NULL OR last_completed_date IS NULL OR next_due_date IS NULL
       OR type_of_service IS NULL OR category_id IS NULL OR type_id IS NULL OR department_id IS NULL
       OR registration_date IS NULL OR expiry_date IS NULL OR reminder_days IS NULL
       OR responsible_person IS NULL OR remarks IS NULL
  `);
  const nullEmployees = await pool.query(`
    SELECT id, emp_id FROM employees
    WHERE emp_id IS NULL OR name IS NULL OR email IS NULL OR contact_number IS NULL
       OR designation_id IS NULL OR department_id IS NULL OR employee_type_id IS NULL
       OR religion_id IS NULL OR origin_id IS NULL
       OR (emp_id != 'EMP011' AND reports_to IS NULL)
  `);
  const nullTechnicians = await pool.query(`
    SELECT id, emp_id FROM technicians
    WHERE name IS NULL OR email IS NULL OR type_of_service IS NULL OR emp_id IS NULL
       OR type_id IS NULL OR designation_id IS NULL OR contact_number IS NULL
       OR employee_id IS NULL OR reports_to_emp_id IS NULL OR notification_email IS NULL
  `);

  console.log('\n===== Verification Summary =====');
  console.log(`Total employees: ${employeeCount.rows[0].count}`);
  console.log(`Total technicians: ${technicianCount.rows[0].count}`);
  console.log(`Total supervisors (is_technician = false): ${supervisorCount.rows[0].count}`);
  console.log(`Total assets: ${assetCount.rows[0].count}`);
  console.log(`Assets overdue: ${overdue.rows[0].count}`);
  console.log(`Assets due today: ${dueToday.rows[0].count}`);
  console.log(`Assets due within 30 days: ${dueWithin30.rows[0].count}`);
  console.log(`Assets not due for 90+ days: ${dueAfter90.rows[0].count}`);
  console.log(`Assets with a null critical field: ${nullAssets.rows.length}${nullAssets.rows.length ? ' -> ' + JSON.stringify(nullAssets.rows) : ''}`);
  console.log(`Employees with a null critical field: ${nullEmployees.rows.length}${nullEmployees.rows.length ? ' -> ' + JSON.stringify(nullEmployees.rows) : ''}`);
  console.log(`Technicians with a null critical field: ${nullTechnicians.rows.length}${nullTechnicians.rows.length ? ' -> ' + JSON.stringify(nullTechnicians.rows) : ''}`);
  console.log('=================================\n');
}

async function run() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await deleteAllData(client);

    // Runs early (ahead of Step 2's inserts) so the column exists before technicians rows
    // reference it; this is the schema change requested as Step 4.
    await client.query('ALTER TABLE technicians ADD COLUMN IF NOT EXISTS notification_email VARCHAR');

    const lookups = {
      designations: await getLookupMap('designations'),
      departments: await getLookupMap('asset_departments'),
      employeeTypes: await getLookupMap('employee_types'),
      religions: await getLookupMap('religions'),
      origins: await getLookupMap('origins'),
      categories: await getLookupMap('asset_categories'),
      types: await getLookupMap('asset_types'),
    };

    await insertEmployeesAndTechnicians(client, lookups);
    await insertAssets(client, lookups);

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Seed failed, all changes rolled back:', error);
    process.exitCode = 1;
    return;
  } finally {
    client.release();
  }

  await printVerificationSummary();
  await pool.end();
}

run();
