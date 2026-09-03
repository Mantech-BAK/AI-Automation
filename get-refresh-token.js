const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '.env') });

const { TENANT_ID, CLIENT_ID } = process.env;
const REDIRECT_URI = 'http://localhost:3000/api/auth/microsoft/callback';

// Must exactly match the delegatedScopes list in graph/client.js - a
// refresh_token grant can only ask for a subset of whatever scopes were
// consented to here.
const SCOPES = [
  'https://graph.microsoft.com/ChannelMessage.Send',
  'https://graph.microsoft.com/Tasks.ReadWrite',
  'https://graph.microsoft.com/OnlineMeetings.ReadWrite',
  'https://graph.microsoft.com/Mail.Send',
  'https://graph.microsoft.com/Calendars.ReadWrite',
  'offline_access',
].join(' ');

if (!TENANT_ID || !CLIENT_ID) {
  console.error('Missing TENANT_ID or CLIENT_ID in .env');
  process.exit(1);
}

const params = new URLSearchParams({
  client_id: CLIENT_ID,
  response_type: 'code',
  redirect_uri: REDIRECT_URI,
  scope: SCOPES,
  response_mode: 'query',
});

const authUrl = `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/authorize?${params.toString()}`;

console.log('');
console.log('=== Get Microsoft Delegated Refresh Token ===');
console.log('');
console.log('Step 1 - Make sure node index.js is running (in another terminal) so the callback route works.');
console.log('Step 2 - Open this URL in your browser:');
console.log('');
console.log(authUrl);
console.log('');
console.log('Step 3 - Login with mcs.sw01@bakgroup.net.');
console.log('Step 4 - Accept all permissions.');
console.log('Step 5 - You will be redirected to localhost.');
console.log('Step 6 - Check the node index.js terminal for your refresh token.');
console.log('');
