const path = require('path');
const { Pool, types } = require('pg');

require('dotenv').config({ path: path.join(__dirname, '.env') });

// pg's default DATE (OID 1082) parser builds a JS Date at local midnight,
// which shifts the calendar day when serialized to UTC on a non-UTC server.
// Return the raw 'YYYY-MM-DD' string instead so no timezone conversion happens.
types.setTypeParser(1082, (value) => value);

// Hosted (Render / Supabase): a single DATABASE_URL connection string, with SSL
// in production. Local development keeps using the discrete DB_* variables.
const isProduction = process.env.NODE_ENV === 'production';

const pool = new Pool(
  process.env.DATABASE_URL
    ? {
        connectionString: process.env.DATABASE_URL,
        ssl: isProduction ? { rejectUnauthorized: false } : undefined,
      }
    : {
        host: process.env.DB_HOST || 'localhost',
        port: Number(process.env.DB_PORT) || 5432,
        database: process.env.DB_NAME || 'postgres',
        user: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASSWORD || 'admin1234',
        ssl: isProduction ? { rejectUnauthorized: false } : undefined,
      }
);

pool.on('error', (err) => {
  console.error('Unexpected PostgreSQL client error', err);
});

module.exports = {
  pool,
};
