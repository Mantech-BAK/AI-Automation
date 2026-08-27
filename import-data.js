const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
const { pool } = require('./db');

const EMPLOYEES_CSV_PATH = 'C:\\Users\\mcs.sw01\\OneDrive - BAK Group Bahrain\\Desktop\\MaintenanceSystem\\employees.csv';
const ASSETS_XLSX_PATH = 'C:\\Users\\mcs.sw01\\OneDrive - BAK Group Bahrain\\Desktop\\MaintenanceSystem\\Master Data for Documents and Assets.xlsx';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseCsv(content) {
  const lines = content.split(/\r?\n/).filter((line) => line.length > 0);
  if (lines.length === 0) return [];
  const header = lines[0].split(',').map((h) => h.trim());
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',');
    const obj = {};
    header.forEach((h, idx) => {
      obj[h] = (cols[idx] !== undefined ? cols[idx] : '').trim();
    });
    rows.push(obj);
  }
  return rows;
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

function buildDateString(year, month, day) {
  if (!year || !month || !day) return null;
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > 31) return null;
  if (year < 1900 || year > 2100) return null;
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

const MONTH_NAMES = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

// Parses dates that are primarily day/month/year (25/03/2026, 25/3/2026),
// but also tolerates the messier real-world variants found in the source
// spreadsheet (stray punctuation, "D-Mon-YYYY", 2-digit years, and an
// occasional accidental month/day/year entry where the "day" slot exceeds 12).
function parseDayMonthYear(raw) {
  if (raw === null || raw === undefined) return null;
  const s = String(raw).trim();
  if (!s) return null;
  const lower = s.toLowerCase();
  if (lower.includes('not yet') || lower === 'na' || lower === 'n/a' || lower === '--') return null;

  const monthNameMatch = s.match(/^(\d{1,2})[\s\-/]+([A-Za-z]{3,9})[\s\-/]*(\d{2,4})?$/);
  if (monthNameMatch) {
    const day = parseInt(monthNameMatch[1], 10);
    const month = MONTH_NAMES[monthNameMatch[2].toLowerCase().slice(0, 3)];
    if (!month || !monthNameMatch[3]) return null;
    let year = parseInt(monthNameMatch[3], 10);
    if (year < 100) year += 2000;
    return buildDateString(year, month, day);
  }

  const digitGroups = s.match(/\d+/g);
  if (!digitGroups || digitGroups.length < 3) return null;

  let day = parseInt(digitGroups[0], 10);
  let month = parseInt(digitGroups[1], 10);
  let year = parseInt(digitGroups[2], 10);
  if (year < 100) year += 2000;

  if (month > 12 && day <= 12) {
    [day, month] = [month, day];
  }

  return buildDateString(year, month, day);
}

// Parses US-style month/day/year dates (3/1/2026 = March 1, 2026), tolerating
// the same swap-fallback as above if the "month" slot is out of range.
function parseMonthDayYear(raw) {
  if (raw === null || raw === undefined) return null;
  const s = String(raw).trim();
  if (!s) return null;

  const digitGroups = s.match(/\d+/g);
  if (!digitGroups || digitGroups.length < 3) return null;

  let month = parseInt(digitGroups[0], 10);
  let day = parseInt(digitGroups[1], 10);
  let year = parseInt(digitGroups[2], 10);
  if (year < 100) year += 2000;

  if (month > 12 && day <= 12) {
    [month, day] = [day, month];
  }

  return buildDateString(year, month, day);
}

function normalizeDepartment(raw) {
  if (!raw) return null;
  const trimmed = String(raw).trim();
  const compact = trimmed.toLowerCase().replace(/\s+/g, '');
  if (compact === 'aljuman') return 'Aljuman';
  if (compact === 'rubberplant') return 'Rubber Plant';
  return trimmed;
}

function normalizeForMatch(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

const ASSET_TYPE_MATCH_MAP = {
  'calibration': 'Calibration',
  'management': 'Management',
  'operation': 'Operation',
  'industrial and manufactring products': 'Industrial and Manufacturing Products',
  'industrial and manufacturing products': 'Industrial and Manufacturing Products',
  'waste transport license': 'Waste Transport License',
  'waste tyre recycling plant': 'Waste Tyre Recycling Plant',
};

function matchAssetTypeName(raw) {
  return ASSET_TYPE_MATCH_MAP[normalizeForMatch(raw)] || null;
}

function normalizeReligionKey(raw) {
  const s = String(raw || '').trim().toLowerCase();
  if (s === 'hindu' || s === 'hinduism') return 'hindu';
  if (s === 'buddhist' || s === 'buddhism') return 'buddhism';
  return s;
}

function parseReminderDays(raw) {
  const n = parseInt(String(raw ?? '').trim(), 10);
  return Number.isFinite(n) ? n : 20;
}

function emptyToNull(value) {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  return s === '' ? null : s;
}

// ---------------------------------------------------------------------------
// Step 1: clear existing data
// ---------------------------------------------------------------------------

async function clearData() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const deleteStatements = [
      'DELETE FROM email_action_items',
      'DELETE FROM email_summaries',
      'DELETE FROM escalation_log',
      'DELETE FROM notification_log',
      'DELETE FROM work_orders',
      'DELETE FROM technicians',
      'DELETE FROM employees',
      'DELETE FROM assets',
      'DELETE FROM sites WHERE true',
      'DELETE FROM origins',
      'DELETE FROM religions',
      'DELETE FROM designations',
      'DELETE FROM employee_types',
      'DELETE FROM asset_departments',
      'DELETE FROM asset_types',
      'DELETE FROM asset_categories',
    ];

    for (const statement of deleteStatements) {
      const result = await client.query(statement);
      console.log(`  ${statement} -> ${result.rowCount} row(s) deleted`);
    }

    const sequenceResets = [
      'assets_id_seq',
      'technicians_id_seq',
      'employees_id_seq',
      'work_orders_id_seq',
    ];

    for (const seq of sequenceResets) {
      await client.query(`ALTER SEQUENCE ${seq} RESTART WITH 1`);
      console.log(`  ALTER SEQUENCE ${seq} RESTART WITH 1`);
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// ---------------------------------------------------------------------------
// Step 2: populate lookup tables
// ---------------------------------------------------------------------------

async function insertLookupValues(table, values) {
  for (const value of values) {
    await pool.query(`INSERT INTO ${table} (name) VALUES ($1) ON CONFLICT DO NOTHING`, [value]);
  }
}

async function populateLookups(employeeRows) {
  await insertLookupValues('asset_categories', ['Document', 'Equipment']);
  await insertLookupValues('asset_types', [
    'Calibration',
    'Management',
    'Operation',
    'Industrial and Manufacturing Products',
    'Waste Transport License',
    'Waste Tyre Recycling Plant',
  ]);
  await insertLookupValues('asset_departments', ['Asphalt', 'Ready-Mix Plant', 'Aljuman', 'Rubber Plant', 'UCO Tiles']);
  await insertLookupValues('religions', ['Hindu', 'Christian', 'Muslim', 'Sikh', 'Buddhism', 'Other']);
  await insertLookupValues('origins', ['India', 'Pakistan', 'Sri Lanka', 'Philippines', 'Bangladesh', 'Nepal', 'Egypt', 'Bahrain', 'UAE', 'Other']);
  await insertLookupValues('employee_types', ['Full Time', 'Contract']);
  console.log('  Lookup tables (categories, types, departments, religions, origins, sites, employee types) populated.');

  const uniqueDesignations = [...new Set(
    employeeRows
      .map((row) => (row['Designation'] || '').trim())
      .filter((d) => d.length > 0)
  )];
  await insertLookupValues('designations', uniqueDesignations);
  console.log(`  Designations populated: ${uniqueDesignations.length} unique value(s) -> ${uniqueDesignations.join(', ')}`);
}

// sites table uses site_name, not name -- handle separately
async function populateSites() {
  const siteNames = ['Asphalt', 'Ready-Mix Plant', 'Aljuman', 'Rubber Plant', 'UCO Tiles'];
  for (const siteName of siteNames) {
    await pool.query(`INSERT INTO sites (site_name) VALUES ($1) ON CONFLICT DO NOTHING`, [siteName]);
  }
}

// ---------------------------------------------------------------------------
// Step 3: import assets (Sheet1 only)
// ---------------------------------------------------------------------------

async function importAssets() {
  const workbook = XLSX.readFile(ASSETS_XLSX_PATH);
  const sheet = workbook.Sheets['Sheet1'];
  if (!sheet) {
    throw new Error('Sheet1 not found in workbook');
  }

  // range: 1 skips the first (blank) row and uses the second row as the header.
  const rows = XLSX.utils.sheet_to_json(sheet, { range: 1, raw: false, defval: null });

  const categoryResult = await pool.query(`SELECT id FROM asset_categories WHERE name = 'Document'`);
  const documentCategoryId = categoryResult.rows[0]?.id || null;
  if (!documentCategoryId) {
    throw new Error('Document category not found in asset_categories');
  }

  const typeRows = (await pool.query(`SELECT id, name FROM asset_types`)).rows;
  const typeIdByName = new Map(typeRows.map((r) => [r.name, r.id]));

  const departmentRows = (await pool.query(`SELECT id, name FROM asset_departments`)).rows;
  const departmentIdByName = new Map(departmentRows.map((r) => [r.name, r.id]));

  let inserted = 0;
  let skipped = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const sheetRowNumber = i + 3; // +1 header offset, +1 blank row, +1 for 1-index

    const equipmentName = emptyToNull(row['Item Description']);
    if (!equipmentName) {
      console.log(`  SKIPPED sheet row ${sheetRowNumber}: empty Item Description`);
      skipped++;
      continue;
    }

    const siteLocation = normalizeDepartment(row['Department']);
    const typeName = matchAssetTypeName(row['Category']);
    const typeId = typeName ? typeIdByName.get(typeName) || null : null;
    const departmentId = siteLocation ? departmentIdByName.get(siteLocation) || null : null;

    const registrationDate = parseDayMonthYear(row['Reg.Date']);
    const expiryDate = parseDayMonthYear(row['Exp.Date']);
    const reminderDays = parseReminderDays(row['Reminder Days']);
    const responsiblePerson = emptyToNull(row['InCharge']);
    const remarks = emptyToNull(row['Remarks']);

    await pool.query(
      `INSERT INTO assets (
         equipment_name, site_location, category_id, type_id, department_id,
         last_completed_date, next_due_date, expiry_date, registration_date,
         reminder_days, responsible_person, remarks,
         maintenance_interval_days, estimated_duration_hours, type_of_service
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
      [
        equipmentName,
        siteLocation,
        documentCategoryId,
        typeId,
        departmentId,
        registrationDate,
        expiryDate,
        expiryDate,
        registrationDate,
        reminderDays,
        responsiblePerson,
        remarks,
        365,
        1,
        'general',
      ]
    );

    console.log(`  INSERTED sheet row ${sheetRowNumber}: ${equipmentName}`);
    inserted++;
  }

  return { inserted, skipped };
}

// ---------------------------------------------------------------------------
// Step 4: import employees (CSV)
// ---------------------------------------------------------------------------

function resolveEmpId(cprRaw, idRaw) {
  const cpr = (cprRaw || '').trim();
  if (!cpr || cpr === '--') {
    return (idRaw || '').trim() || null;
  }
  return cpr;
}

async function importEmployees(employeeRows) {
  await pool.query(`
    ALTER TABLE employees ADD COLUMN IF NOT EXISTS nationality VARCHAR;
    ALTER TABLE employees ADD COLUMN IF NOT EXISTS joining_date DATE;
    ALTER TABLE employees ADD COLUMN IF NOT EXISTS company VARCHAR;
    ALTER TABLE employees ADD COLUMN IF NOT EXISTS department_text VARCHAR;
    ALTER TABLE employees ADD COLUMN IF NOT EXISTS designation_text VARCHAR;
    ALTER TABLE employees ADD COLUMN IF NOT EXISTS religion_text VARCHAR;
    ALTER TABLE employees ADD COLUMN IF NOT EXISTS gender VARCHAR;
    ALTER TABLE employees ADD COLUMN IF NOT EXISTS cost_center VARCHAR;
    ALTER TABLE employees ADD COLUMN IF NOT EXISTS reports_to_name VARCHAR;
  `);

  const designationRows = (await pool.query(`SELECT id, name FROM designations`)).rows;
  const designationIdByLowerName = new Map(designationRows.map((r) => [r.name.toLowerCase(), r.id]));

  const religionRows = (await pool.query(`SELECT id, name FROM religions`)).rows;
  const religionIdByLowerName = new Map(religionRows.map((r) => [r.name.toLowerCase(), r.id]));

  const originRows = (await pool.query(`SELECT id, name FROM origins`)).rows;
  const originIdByLowerName = new Map(originRows.map((r) => [r.name.toLowerCase(), r.id]));

  let inserted = 0;
  let skipped = 0;

  for (let i = 0; i < employeeRows.length; i++) {
    const row = employeeRows[i];
    const csvLineNumber = i + 2; // +1 header, +1 for 1-index

    const name = emptyToNull(row['Name']);
    if (!name) {
      console.log(`  SKIPPED CSV line ${csvLineNumber}: empty Name`);
      skipped++;
      continue;
    }

    const empId = resolveEmpId(row['CPR No.'], row['ID']);
    if (!empId) {
      console.log(`  SKIPPED CSV line ${csvLineNumber} (${name}): could not resolve emp_id`);
      skipped++;
      continue;
    }

    const nationality = emptyToNull(row['Nationality']);
    const joiningDate = parseMonthDayYear(row['Joining Date']);
    const company = emptyToNull(row['Company']);
    const departmentText = emptyToNull(row['Department']);
    const designationText = emptyToNull(row['Designation']);
    const religionText = emptyToNull(row['Religion']);
    const gender = emptyToNull(row['Gender']);
    const costCenter = emptyToNull(row['Cost Center']);
    const reportsToName = emptyToNull(row['Reporting Manager']);

    const designationId = designationText ? designationIdByLowerName.get(designationText.toLowerCase()) || null : null;
    const religionId = religionText ? religionIdByLowerName.get(normalizeReligionKey(religionText)) || null : null;
    const originId = nationality ? originIdByLowerName.get(nationality.toLowerCase()) || null : null;

    try {
      await pool.query(
        `INSERT INTO employees (
           emp_id, name, nationality, joining_date, company, department_text,
           designation_text, religion_text, gender, cost_center, reports_to_name,
           is_technician, email, contact_number, designation_id, religion_id, origin_id
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)`,
        [
          empId,
          name,
          nationality,
          joiningDate,
          company,
          departmentText,
          designationText,
          religionText,
          gender,
          costCenter,
          reportsToName,
          false,
          null,
          null,
          designationId,
          religionId,
          originId,
        ]
      );
      console.log(`  INSERTED employee: ${name} (emp_id ${empId})`);
      inserted++;
    } catch (error) {
      console.log(`  SKIPPED CSV line ${csvLineNumber} (${name}): ${error.message}`);
      skipped++;
    }
  }

  return { inserted, skipped };
}

// ---------------------------------------------------------------------------
// Step 5: verification summary
// ---------------------------------------------------------------------------

async function printSummary() {
  const scalar = async (query) => {
    const { rows } = await pool.query(query);
    return Number(Object.values(rows[0])[0]);
  };

  const totalAssets = await scalar('SELECT COUNT(*) FROM assets');
  const totalDocuments = await scalar(`
    SELECT COUNT(*) FROM assets a
    JOIN asset_categories ac ON ac.id = a.category_id
    WHERE ac.name = 'Document'
  `);
  const totalEmployees = await scalar('SELECT COUNT(*) FROM employees');
  const assetCategoriesCount = await scalar('SELECT COUNT(*) FROM asset_categories');
  const assetTypesCount = await scalar('SELECT COUNT(*) FROM asset_types');
  const assetDepartmentsCount = await scalar('SELECT COUNT(*) FROM asset_departments');
  const designationsCount = await scalar('SELECT COUNT(*) FROM designations');
  const religionsCount = await scalar('SELECT COUNT(*) FROM religions');
  const originsCount = await scalar('SELECT COUNT(*) FROM origins');
  const sitesCount = await scalar('SELECT COUNT(*) FROM sites');
  const assetsNullDueDate = await scalar('SELECT COUNT(*) FROM assets WHERE next_due_date IS NULL');
  const employeesNullEmpId = await scalar('SELECT COUNT(*) FROM employees WHERE emp_id IS NULL');

  console.log(`  Total assets in database: ${totalAssets}`);
  console.log(`  Total documents imported (category = Document): ${totalDocuments}`);
  console.log(`  Total employees in database: ${totalEmployees}`);
  console.log(`  asset_categories rows: ${assetCategoriesCount}`);
  console.log(`  asset_types rows: ${assetTypesCount}`);
  console.log(`  asset_departments rows: ${assetDepartmentsCount}`);
  console.log(`  designations rows: ${designationsCount}`);
  console.log(`  religions rows: ${religionsCount}`);
  console.log(`  origins rows: ${originsCount}`);
  console.log(`  sites rows: ${sitesCount}`);
  console.log(`  assets with next_due_date IS NULL: ${assetsNullDueDate}`);
  console.log(`  employees with emp_id IS NULL: ${employeesNullEmpId}`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('=== STEP 1: Clearing existing data ===');
  await clearData();

  console.log('=== STEP 2: Populating lookup tables ===');
  const employeeCsvContent = fs.readFileSync(EMPLOYEES_CSV_PATH, 'utf8');
  const employeeRows = parseCsv(employeeCsvContent);
  await populateSites();
  await populateLookups(employeeRows);

  console.log('=== STEP 3: Importing assets from Sheet1 ===');
  const assetResult = await importAssets();
  console.log(`  Assets: ${assetResult.inserted} inserted, ${assetResult.skipped} skipped`);

  console.log('=== STEP 4: Importing employees from CSV ===');
  const employeeResult = await importEmployees(employeeRows);
  console.log(`  Employees: ${employeeResult.inserted} inserted, ${employeeResult.skipped} skipped`);

  console.log('=== STEP 5: Verification summary ===');
  await printSummary();

  console.log('DONE');
}

main()
  .catch((error) => {
    console.error('Import failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
