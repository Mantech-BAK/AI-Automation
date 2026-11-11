// Must be required BEFORE ../db (or anything that loads it). Points every test at the throw-away local database
// "mas_doctest" and refuses to run against anything else. The repo's .env also carries a Supabase connection string
// (Database_URL), which db.js would otherwise prefer - so DATABASE_URL is set here explicitly (dotenv never overrides it).
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '..', '..', '.env'), quiet: true });

const TEST_DB = 'mas_doctest';
const host = process.env.DB_HOST || 'localhost';
if (!['localhost', '127.0.0.1', '::1'].includes(host)) {
  throw new Error(`Refusing to run tests: DB_HOST is "${host}", not a local server`);
}

const url = `postgresql://${encodeURIComponent(process.env.DB_USER || 'postgres')}:${encodeURIComponent(process.env.DB_PASSWORD || '')}@${host}:${Number(process.env.DB_PORT) || 5432}/${TEST_DB}`;
process.env.DATABASE_URL = url;

module.exports = { TEST_DB };
