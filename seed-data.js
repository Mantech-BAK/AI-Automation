const { pool } = require('./db');

const TECHNICIANS = [
  { name: 'Ahmed Al-Rashid', email: 'mcs.sw01@bakgroup.net', site: 'Site A', skill_type: 'mechanical' },
  { name: 'Mohammed Hassan', email: 'mcs.sw01@bakgroup.net', site: 'Site B', skill_type: 'electrical' },
  { name: 'Khalid Ibrahim', email: 'mcs.sw01@bakgroup.net', site: 'Site C', skill_type: 'general' },
  { name: 'Sara Al-Mansoori', email: 'mcs.sw01@bakgroup.net', site: 'Site D', skill_type: 'mechanical' },
  { name: 'Ravi Kumar', email: 'ravi.kumar@bakgroup.net', site: 'Site A', skill_type: 'electrical' },
  { name: 'James Wilson', email: 'james.wilson@bakgroup.net', site: 'Site B', skill_type: 'general' },
  { name: 'Ali Hassan', email: 'ali.hassan@bakgroup.net', site: 'Site C', skill_type: 'mechanical' },
  { name: 'Omar Farooq', email: 'omar.farooq@bakgroup.net', site: 'Site D', skill_type: 'electrical' },
  { name: 'Priya Sharma', email: 'priya.sharma@bakgroup.net', site: 'Site A', skill_type: 'general' },
  { name: 'David Chen', email: 'david.chen@bakgroup.net', site: 'Site B', skill_type: 'mechanical' },
];

const ASSETS = [
  // Site A (12)
  { name: 'Generator A1', site: 'Site A', interval: 90, hours: 4, skill: 'mechanical', daysAgo: 60 },
  { name: 'Generator A2', site: 'Site A', interval: 90, hours: 4, skill: 'mechanical', daysAgo: 45 },
  { name: 'Air Conditioning Unit A1', site: 'Site A', interval: 30, hours: 1, skill: 'general', daysAgo: 25 },
  { name: 'Air Conditioning Unit A2', site: 'Site A', interval: 30, hours: 1, skill: 'general', daysAgo: 35 },
  { name: 'Fire Suppression System A', site: 'Site A', interval: 180, hours: 3, skill: 'electrical', daysAgo: 170 },
  { name: 'Elevator A1', site: 'Site A', interval: 365, hours: 5, skill: 'mechanical', daysAgo: 300 },
  { name: 'Elevator A2', site: 'Site A', interval: 365, hours: 5, skill: 'mechanical', daysAgo: 200 },
  { name: 'Emergency Lighting A', site: 'Site A', interval: 180, hours: 2, skill: 'electrical', daysAgo: 150 },
  { name: 'Water Pump A1', site: 'Site A', interval: 60, hours: 2, skill: 'mechanical', daysAgo: 55 },
  { name: 'Water Pump A2', site: 'Site A', interval: 60, hours: 2, skill: 'mechanical', daysAgo: 30 },
  { name: 'HVAC Unit A1', site: 'Site A', interval: 90, hours: 3, skill: 'mechanical', daysAgo: 80 },
  { name: 'Security System A', site: 'Site A', interval: 365, hours: 2, skill: 'electrical', daysAgo: 340 },

  // Site B (13)
  { name: 'Generator B1', site: 'Site B', interval: 90, hours: 4, skill: 'mechanical', daysAgo: 85 },
  { name: 'Generator B2', site: 'Site B', interval: 90, hours: 4, skill: 'mechanical', daysAgo: 50 },
  { name: 'Air Conditioning Unit B1', site: 'Site B', interval: 30, hours: 1, skill: 'general', daysAgo: 28 },
  { name: 'Air Conditioning Unit B2', site: 'Site B', interval: 30, hours: 1, skill: 'general', daysAgo: 15 },
  { name: 'Air Conditioning Unit B3', site: 'Site B', interval: 30, hours: 1, skill: 'general', daysAgo: 32 },
  { name: 'Fire Suppression System B', site: 'Site B', interval: 180, hours: 3, skill: 'electrical', daysAgo: 160 },
  { name: 'Elevator B1', site: 'Site B', interval: 365, hours: 5, skill: 'mechanical', daysAgo: 350 },
  { name: 'Emergency Lighting B', site: 'Site B', interval: 180, hours: 2, skill: 'electrical', daysAgo: 90 },
  { name: 'Water Pump B1', site: 'Site B', interval: 60, hours: 2, skill: 'mechanical', daysAgo: 58 },
  { name: 'HVAC Unit B1', site: 'Site B', interval: 90, hours: 3, skill: 'mechanical', daysAgo: 70 },
  { name: 'HVAC Unit B2', site: 'Site B', interval: 90, hours: 3, skill: 'mechanical', daysAgo: 88 },
  { name: 'UPS System B', site: 'Site B', interval: 180, hours: 2, skill: 'electrical', daysAgo: 120 },
  { name: 'Backup Generator B', site: 'Site B', interval: 180, hours: 4, skill: 'mechanical', daysAgo: 175 },

  // Site C (13)
  { name: 'Generator C1', site: 'Site C', interval: 90, hours: 4, skill: 'mechanical', daysAgo: 92 },
  { name: 'Generator C2', site: 'Site C', interval: 90, hours: 4, skill: 'mechanical', daysAgo: 40 },
  { name: 'Air Conditioning Unit C1', site: 'Site C', interval: 30, hours: 1, skill: 'general', daysAgo: 30 },
  { name: 'Air Conditioning Unit C2', site: 'Site C', interval: 30, hours: 1, skill: 'general', daysAgo: 20 },
  { name: 'Fire Suppression System C1', site: 'Site C', interval: 180, hours: 3, skill: 'electrical', daysAgo: 180 },
  { name: 'Fire Suppression System C2', site: 'Site C', interval: 180, hours: 3, skill: 'electrical', daysAgo: 95 },
  { name: 'Elevator C1', site: 'Site C', interval: 365, hours: 5, skill: 'mechanical', daysAgo: 360 },
  { name: 'Emergency Lighting C', site: 'Site C', interval: 180, hours: 2, skill: 'electrical', daysAgo: 185 },
  { name: 'Water Pump C1', site: 'Site C', interval: 60, hours: 2, skill: 'mechanical', daysAgo: 62 },
  { name: 'Water Pump C2', site: 'Site C', interval: 60, hours: 2, skill: 'mechanical', daysAgo: 25 },
  { name: 'HVAC Unit C1', site: 'Site C', interval: 90, hours: 3, skill: 'mechanical', daysAgo: 91 },
  { name: 'Cooling Tower C', site: 'Site C', interval: 90, hours: 3, skill: 'mechanical', daysAgo: 65 },
  { name: 'Security System C', site: 'Site C', interval: 365, hours: 2, skill: 'electrical', daysAgo: 200 },

  // Site D (12)
  { name: 'Generator D1', site: 'Site D', interval: 90, hours: 4, skill: 'mechanical', daysAgo: 88 },
  { name: 'Generator D2', site: 'Site D', interval: 90, hours: 4, skill: 'mechanical', daysAgo: 20 },
  { name: 'Air Conditioning Unit D1', site: 'Site D', interval: 30, hours: 1, skill: 'general', daysAgo: 29 },
  { name: 'Air Conditioning Unit D2', site: 'Site D', interval: 30, hours: 1, skill: 'general', daysAgo: 10 },
  { name: 'Fire Suppression System D', site: 'Site D', interval: 180, hours: 3, skill: 'electrical', daysAgo: 140 },
  { name: 'Elevator D1', site: 'Site D', interval: 365, hours: 5, skill: 'mechanical', daysAgo: 380 },
  { name: 'Emergency Lighting D', site: 'Site D', interval: 180, hours: 2, skill: 'electrical', daysAgo: 178 },
  { name: 'Water Pump D1', site: 'Site D', interval: 60, hours: 2, skill: 'mechanical', daysAgo: 61 },
  { name: 'Water Pump D2', site: 'Site D', interval: 60, hours: 2, skill: 'mechanical', daysAgo: 45 },
  { name: 'HVAC Unit D1', site: 'Site D', interval: 90, hours: 3, skill: 'mechanical', daysAgo: 82 },
  { name: 'UPS System D', site: 'Site D', interval: 180, hours: 2, skill: 'electrical', daysAgo: 100 },
  { name: 'Backup Generator D', site: 'Site D', interval: 180, hours: 4, skill: 'mechanical', daysAgo: 95 },
];

async function ensureEscalationLogTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS escalation_log (
      id SERIAL PRIMARY KEY,
      work_order_id INTEGER REFERENCES work_orders(id),
      escalated_to VARCHAR,
      escalated_at TIMESTAMP DEFAULT now(),
      resolved BOOLEAN DEFAULT false,
      resolved_at TIMESTAMP
    )
  `);
}

async function dropTechnicianEmailUniqueConstraint() {
  const { rows } = await pool.query(`
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
    WHERE rel.relname = 'technicians'
      AND att.attname = 'email'
      AND con.contype = 'u'
  `);

  for (const row of rows) {
    await pool.query(`ALTER TABLE technicians DROP CONSTRAINT ${row.conname}`);
    console.log(`Step 0 complete: dropped UNIQUE constraint "${row.conname}" on technicians.email.`);
  }
}

async function clearExistingData() {
  await pool.query('DELETE FROM email_action_items');
  await pool.query('DELETE FROM email_summaries');
  await pool.query('DELETE FROM escalation_log');
  await pool.query('DELETE FROM notification_log');
  await pool.query('DELETE FROM work_orders');
  await pool.query('DELETE FROM technicians');
  await pool.query('DELETE FROM assets');
  await pool.query('ALTER SEQUENCE assets_id_seq RESTART WITH 1');
  await pool.query('ALTER SEQUENCE technicians_id_seq RESTART WITH 1');
  await pool.query('ALTER SEQUENCE work_orders_id_seq RESTART WITH 1');
  console.log('Step 1 complete: cleared all existing data and reset ID sequences.');
}

async function insertTechnicians() {
  let count = 0;
  for (const tech of TECHNICIANS) {
    await pool.query(
      `INSERT INTO technicians (name, email, site, skill_type) VALUES ($1, $2, $3, $4)`,
      [tech.name, tech.email, tech.site, tech.skill_type]
    );
    count++;
  }
  console.log(`Step 2 complete: inserted ${count} technicians.`);
  return count;
}

async function insertAssets() {
  let count = 0;
  for (const asset of ASSETS) {
    await pool.query(
      `INSERT INTO assets (
         equipment_name, site_location, maintenance_interval_days, estimated_duration_hours,
         skill_type_required, last_completed_date, next_due_date
       )
       VALUES (
         $1, $2, $3, $4, $5,
         (CURRENT_DATE - make_interval(days => $6))::date,
         (CURRENT_DATE - make_interval(days => $6) + make_interval(days => $3))::date
       )`,
      [asset.name, asset.site, asset.interval, asset.hours, asset.skill, asset.daysAgo]
    );
    count++;
  }
  console.log(`Step 3 complete: inserted ${count} assets.`);
  return count;
}

async function printSummary(assetCount, technicianCount) {
  const { rows } = await pool.query(`
    SELECT
      COUNT(*) FILTER (WHERE next_due_date < CURRENT_DATE)::int AS overdue_count,
      COUNT(*) FILTER (WHERE next_due_date >= CURRENT_DATE AND next_due_date <= CURRENT_DATE + INTERVAL '30 days')::int AS due_soon_count
    FROM assets
  `);

  const { overdue_count: overdueCount, due_soon_count: dueSoonCount } = rows[0];

  console.log('\n--- Seed Summary ---');
  console.log(`Total assets inserted: ${assetCount}`);
  console.log(`Total technicians inserted: ${technicianCount}`);
  console.log(`Assets overdue: ${overdueCount}`);
  console.log(`Assets due within 30 days: ${dueSoonCount}`);
}

async function main() {
  try {
    await ensureEscalationLogTable();
    await dropTechnicianEmailUniqueConstraint();
    await clearExistingData();
    const technicianCount = await insertTechnicians();
    const assetCount = await insertAssets();
    await printSummary(assetCount, technicianCount);
    console.log('\nSeed complete.');
  } catch (error) {
    console.error('Seeding failed:', error);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main();
