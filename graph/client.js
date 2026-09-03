const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const { ConfidentialClientApplication } = require('@azure/msal-node');

const envPath = path.join(__dirname, '..', '.env');
dotenv.config({ path: envPath });

const tenantId = process.env.TENANT_ID;
const clientId = process.env.CLIENT_ID;
const clientSecret = process.env.CLIENT_SECRET;

const authority = `https://login.microsoftonline.com/${tenantId}`;
const graphScopes = ['https://graph.microsoft.com/.default'];

// Must exactly match (or be a subset of) whatever was granted when
// get-refresh-token.js was used to obtain DELEGATED_REFRESH_TOKEN - a
// refresh_token grant can't be used to ask for scopes beyond what the user
// originally consented to.
const delegatedScopes = [
  'https://graph.microsoft.com/ChannelMessage.Send',
  'https://graph.microsoft.com/Tasks.ReadWrite',
  'https://graph.microsoft.com/OnlineMeetings.ReadWrite',
  'https://graph.microsoft.com/Mail.Send',
  'https://graph.microsoft.com/Calendars.ReadWrite',
  'offline_access',
];

// Persists a KEY=value pair into .env, replacing an existing line for that
// key or appending a new one - used to save (and, if Microsoft rotates it,
// re-save) the delegated refresh token.
function updateEnvFile(key, value) {
  let content = '';
  try {
    content = fs.readFileSync(envPath, 'utf8');
  } catch (error) {
    content = '';
  }

  const line = `${key}=${value}`;
  const pattern = new RegExp(`^${key}=.*$`, 'm');

  if (pattern.test(content)) {
    content = content.replace(pattern, line);
  } else {
    if (content.length && !content.endsWith('\n')) {
      content += '\n';
    }
    content += `${line}\n`;
  }

  fs.writeFileSync(envPath, content, 'utf8');
}

const msalConfig = {
  auth: {
    clientId,
    authority,
    clientSecret,
  },
};

const msalClient = new ConfidentialClientApplication(msalConfig);

async function getAppOnlyToken() {
  if (!tenantId || !clientId || !clientSecret) {
    throw new Error('Missing TENANT_ID, CLIENT_ID or CLIENT_SECRET in environment');
  } const result = await msalClient.acquireTokenByClientCredential({
    scopes: graphScopes,
  });

  if (!result || !result.accessToken) {
    throw new Error('Failed to acquire app-only token');
  }

  return result.accessToken;
}

// Delegated access now comes from a stored refresh token instead of the
// Resource Owner Password Credentials (ROPC) flow - ROPC doesn't support MFA
// and Microsoft is deprecating it for many tenants. Run get-refresh-token.js
// once to obtain DELEGATED_REFRESH_TOKEN via a real interactive sign-in.
async function getDelegatedToken() {
  const refreshToken = process.env.DELEGATED_REFRESH_TOKEN;

  if (!tenantId || !clientId || !clientSecret || !refreshToken) {
    throw new Error(
      'Missing TENANT_ID, CLIENT_ID, CLIENT_SECRET, or DELEGATED_REFRESH_TOKEN in environment. ' +
      'Run "node get-refresh-token.js" and follow the printed instructions to obtain a delegated refresh token.'
    );
  }

  const params = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    scope: delegatedScopes.join(' '),
  });

  const response = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });

  const json = await response.json();

  if (!response.ok) {
    const error = new Error(`Failed to refresh delegated token: ${json.error_description || json.error}`);
    error.status = response.status;
    error.body = json;
    throw error;
  }

  if (json.refresh_token && json.refresh_token !== refreshToken) {
    // Microsoft can rotate the refresh token on each use - persist the new
    // one immediately so the next call doesn't fail with an invalidated one.
    process.env.DELEGATED_REFRESH_TOKEN = json.refresh_token;
    updateEnvFile('DELEGATED_REFRESH_TOKEN', json.refresh_token);
  }

  if (!json.access_token) {
    throw new Error('Failed to acquire delegated token');
  }

  return json.access_token;
}

async function graphRequest(method, endpoint, body = null, authType = 'app', extraHeaders = {}) {
  const baseUrl = 'https://graph.microsoft.com/v1.0';
  const url = `${baseUrl}${endpoint}`;
  const token = authType === 'delegated'
    ? await getDelegatedToken()
    : await getAppOnlyToken();

  const headers = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    ...extraHeaders,
  };

  const response = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const responseText = await response.text();
  let json;

  try {
    json = responseText ? JSON.parse(responseText) : {};
  } catch (error) {
    throw new Error(`Graph response parse error: ${error.message}`);
  }

  if (!response.ok) {
    const message = json.error?.message || response.statusText;
    const error = new Error(`Graph request failed: ${message}`);
    error.status = response.status;
    error.body = json;
    throw error;
  }

  return json;
}

module.exports = {
  getAppOnlyToken,
  getDelegatedToken,
  graphRequest,
  updateEnvFile,
};
