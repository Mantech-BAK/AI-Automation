const { graphRequest } = require('../graph/client');

const BAK_DOMAIN = '@bakgroup.net';
const CACHE_TTL_MS = 10 * 60 * 1000;
const MAX_PAGES = 20;

let cache = null; // { at, users }

// Enabled Microsoft 365 accounts with a @bakgroup.net mailbox, as [{ name, email }] sorted by name.
// Cached for 10 minutes. Throws when Graph fails so the caller can fall back to mas_users.
async function fetchBakUsers() {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.users;

  // endswith() on mail is an "advanced query": it needs ConsistencyLevel: eventual together with $count=true.
  const filter = encodeURIComponent(`accountEnabled eq true and endswith(mail,'${BAK_DOMAIN}')`);
  let endpoint = `/users?$filter=${filter}&$count=true&$select=displayName,mail&$top=999`;
  const byEmail = new Map();

  for (let page = 0; endpoint && page < MAX_PAGES; page++) {
    const data = await graphRequest('GET', endpoint, null, 'app', { ConsistencyLevel: 'eventual' });
    for (const user of data?.value || []) {
      const email = String(user.mail || '').trim();
      const name = String(user.displayName || '').trim();
      if (!email || !name || !email.toLowerCase().endsWith(BAK_DOMAIN)) continue;
      byEmail.set(email.toLowerCase(), { name, email });
    }
    const next = data?.['@odata.nextLink'];
    endpoint = next ? next.replace('https://graph.microsoft.com/v1.0', '') : null;
  }

  const users = [...byEmail.values()].sort((a, b) => a.name.localeCompare(b.name));
  cache = { at: Date.now(), users };
  return users;
}

module.exports = { fetchBakUsers };
