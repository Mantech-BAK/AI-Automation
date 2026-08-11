const { pool } = require('./db');

const technicians = [
  {
    name: 'Ahmed Al-Rashid',
    email: 'ahmed@bakgroup.net',
    type_of_service: 'mechanical',
  },
  {
    name: 'Mohammed Hassan',
    email: 'mohammed@bakgroup.net',
    type_of_service: 'general',
  },
  {
    name: 'Khalid Ibrahim',
    email: 'khalid@bakgroup.net',
    type_of_service: 'electrical',
  },
  {
    name: 'Sara Al-Mansoori',
    email: 'sara@bakgroup.net',
    type_of_service: 'general',
  },
];

async function importTechnicians() {
  try {
    for (const tech of technicians) {
      await pool.query(
        `INSERT INTO technicians (name, email, type_of_service)
         VALUES ($1, $2, $3)
         ON CONFLICT (email) DO NOTHING`,
        [tech.name, tech.email, tech.type_of_service]
      );
    }
    console.log('Technicians imported successfully.');
  } catch (error) {
    console.error('Failed to import technicians:', error);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

importTechnicians();
