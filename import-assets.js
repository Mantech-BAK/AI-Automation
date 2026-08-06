const fs = require('fs');
const path = require('path');
const { pool } = require('./db');

function parseCsvLine(line) {
  const values = line.split(',');
  return {
    equipment_name: values[0]?.trim(),
    site_location: values[1]?.trim(),
    maintenance_interval_days: Number(values[2]),
    estimated_duration_hours: Number(values[3]),
    last_completed_date: values[4]?.trim() || null,
    type_of_service: values[5]?.trim() || 'general',
  };
}

function addDays(dateString, days) {
  if (!dateString) return null;
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return null;
  date.setDate(date.getDate() + days);
  return date.toISOString().split('T')[0];
}

async function importAssets() {
  try {
    const csvPath = path.join(__dirname, 'assets.csv');
    const csvData = fs.readFileSync(csvPath, 'utf8');
    const lines = csvData
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    const header = lines.shift();
    if (!header) {
      throw new Error('assets.csv is empty or missing a header row');
    }

    for (const line of lines) {
      const row = parseCsvLine(line);
      const next_due_date = addDays(row.last_completed_date, row.maintenance_interval_days);

      await pool.query(
        `INSERT INTO assets (
          equipment_name,
          site_location,
          maintenance_interval_days,
          estimated_duration_hours,
          last_completed_date,
          next_due_date,
          type_of_service
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT DO NOTHING`,
        [
          row.equipment_name,
          row.site_location,
          row.maintenance_interval_days,
          row.estimated_duration_hours,
          row.last_completed_date || null,
          next_due_date,
          row.type_of_service || 'general',
        ]
      );
    }

    console.log(`Imported ${lines.length} asset rows.`);
  } catch (error) {
    console.error('Failed to import assets:', error);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

importAssets();
