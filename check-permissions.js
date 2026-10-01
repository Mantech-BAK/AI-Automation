require('dotenv').config();
const { getAppOnlyToken } = require('./graph/client');

const USER = 'mcs.sw01@bakgroup.net';

async function main() {
  const token = await getAppOnlyToken();
  const res = await fetch(`https://graph.microsoft.com/v1.0/users/${USER}/drive`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (res.status === 200) {
    console.log('FILES PERMISSION GRANTED');
  } else if (res.status === 403) {
    console.log('FILES PERMISSION DENIED - need admin to grant Files.ReadWrite.All');
  } else if (res.status === 404) {
    console.log('FILES PERMISSION GRANTED BUT ONEDRIVE NOT INITIALIZED - need to open OneDrive once in browser');
  } else {
    const body = await res.json().catch(() => ({}));
    console.log(res.status, body.error && body.error.code, body.error && body.error.message);
  }
}

main().catch((err) => {
  console.error('ERROR', err.code || '', err.message);
  process.exit(1);
});
