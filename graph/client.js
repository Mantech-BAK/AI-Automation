const path = require('path');
const dotenv = require('dotenv');
const { ConfidentialClientApplication } = require('@azure/msal-node');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const tenantId = process.env.TENANT_ID;
const clientId = process.env.CLIENT_ID;
const clientSecret = process.env.CLIENT_SECRET;
const serviceAccountEmail = process.env.SERVICE_ACCOUNT_EMAIL;
const serviceAccountPassword = process.env.SERVICE_ACCOUNT_PASSWORD;

const authority = `https://login.microsoftonline.com/${tenantId}`;
const graphScopes = ['https://graph.microsoft.com/.default'];
const delegatedScopes = ['ChannelMessage.Send', 'Group.ReadWrite.All', 'Tasks.ReadWrite', 'Calendars.ReadWrite', 'Mail.Send', 'https://graph.microsoft.com/OnlineMeetings.ReadWrite'];

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

async function getDelegatedToken() {
  if (!tenantId || !clientId || !serviceAccountEmail || !serviceAccountPassword) {
    throw new Error('Missing TENANT_ID, CLIENT_ID, SERVICE_ACCOUNT_EMAIL, or SERVICE_ACCOUNT_PASSWORD in environment');
  }

  const result = await msalClient.acquireTokenByUsernamePassword({
    scopes: delegatedScopes,
    username: serviceAccountEmail,
    password: serviceAccountPassword,
  });

  if (!result || !result.accessToken) {
    throw new Error('Failed to acquire delegated token');
  }

  return result.accessToken;
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
};
