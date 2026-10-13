const { graphRequest } = require('../graph/client');

// Resolved display names, keyed by lower-cased email. Successful lookups are
// kept for the life of the server process. Failed lookups are remembered only
// briefly, so a temporary Graph error doesn't pin the raw email until restart.
const cache = new Map();
const FAILURE_TTL_MS = 10 * 60 * 1000;

function looksLikeEmail(value) {
  return typeof value === 'string' && value.includes('@');
}

// Returns the person's Microsoft 365 display name for an email address.
// Values without an "@" are manually typed names and are returned unchanged;
// if Graph can't find the user (404) or errors, the raw email is returned.
async function resolveDisplayName(value) {
  if (!looksLikeEmail(value)) return value;

  const email = value.trim();
  const key = email.toLowerCase();
  const cached = cache.get(key);
  if (cached && (cached.ok || Date.now() - cached.at < FAILURE_TTL_MS)) {
    return cached.name;
  }

  try {
    const user = await graphRequest('GET', `/users/${encodeURIComponent(email)}?$select=displayName`, null, 'app');
    const name = user?.displayName || email;
    cache.set(key, { ok: Boolean(user?.displayName), name, at: Date.now() });
    return name;
  } catch (error) {
    cache.set(key, { ok: false, name: email, at: Date.now() });
    if (error.status !== 404) {
      console.warn(`Display name lookup failed for ${email}: ${error.message}`);
    }
    return email;
  }
}

// Adds `outKey` to every row with the resolved name of row[sourceKey]. Each
// distinct address is looked up once, in parallel.
async function addResolvedNames(rows, sourceKey = 'responsible_person', outKey = 'resolved_responsible_name') {
  const distinct = [...new Set(rows.map((row) => row[sourceKey]).filter(looksLikeEmail))];
  const names = new Map(await Promise.all(distinct.map(async (value) => [value, await resolveDisplayName(value)])));

  for (const row of rows) {
    const value = row[sourceKey];
    row[outKey] = value ? (names.get(value) ?? value) : null;
  }
  return rows;
}

module.exports = { resolveDisplayName, addResolvedNames, looksLikeEmail };
