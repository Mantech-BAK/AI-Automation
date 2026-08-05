const { pool } = require('./db');

const technicians = [
  {
    name: 'Ahmed Al-Rashid',
    email: 'ahmed@bakgroup.net',
    site: 'Site A',
    skill_type: 'mechanical',
  },
  {
    name: 'Mohammed Hassan',
    email: 'mohammed@bakgroup.net',
    site: 'Site B',
    skill_type: 'general',
  },
  {
    name: 'Khalid Ibrahim',
    email: 'khalid@bakgroup.net',
    site: 'Site C',
    skill_type: 'electrical',
  },
  {
    name: 'Sara Al-Mansoori',
    email: 'sara@bakgroup.net',
    site: 'Site D',
    skill_type: 'general',
  },
];

async function importTechnicians() {
  try {
    for (const tech of technicians) {
      await pool.query(
        `INSERT INTO technicians (name, email, site, skill_type)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (email) DO NOTHING`,
        [tech.name, tech.email, tech.site, tech.skill_type]
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
