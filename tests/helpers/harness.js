// Test harness for the Documents email processor: a fake mailbox + OneDrive (Microsoft Graph), a fake AI that answers
// the way the real one does for the invented sample documents, and the throw-away local database. No real email is
// sent, no real AI or Microsoft call is made, and nothing touches production.
require('./env'); // first: forces DATABASE_URL to the local test database

const fs = require('fs');
const path = require('path');
const Module = require('module');

process.env.SERVICE_ACCOUNT_EMAIL = 'documents@bak.example.test';
// USE_REAL_AI=1 (manual smoke runs only): the real Groq model reads the invented sample PDFs; otherwise a fake answers.
if (!process.env.USE_REAL_AI) process.env.GROQ_API_KEY = 'test-key';

const PDF_DIR = path.join(__dirname, '..', 'fixtures', 'pdfs');

// ---- state shared with the fakes
const state = {
  messages: [], // [{ id, internetMessageId, subject, from, toRecipients, attachments: [{ id, name, file }] }]
  sent: [], // mails the processor tried to send: { to, subject, content }
  uploads: [], // files the processor stored in "OneDrive"
  aiPrompts: [], // texts sent to the fake AI
  aiMode: {}, // { omitIdentifiers, badJsonFor: RegExp, throwFor: RegExp }
  queued: [], // results the processor queued for the reply email: { subject, result }
  plannerTasks: [], // Planner tasks the reminder job created
  failSend: false, // true: sending mail fails (to test that replies are kept and retried)
};

// ---- fake AI: reads the invented sample documents the way the real model would
const isoDate = (value) => (value ? value.split('/').reverse().join('-') : null);
function fakeAiAnswer(text) {
  const pick = (pattern) => (pattern.exec(text) || [])[1]?.trim() || null;
  const record = {
    document_name: pick(/^(Commercial [A-Za-z ]+?)(?: \(continued\))?\s*$/m) || pick(/^(Certificate [A-Za-z ]+?)\s*$/m) || pick(/^(Insurance [A-Za-z ]+?)\s*$/m),
    company_name: pick(/Company Name:\s*(.+)/),
    cr_no: pick(/CR No:\s*(\S+)/),
    license_no: pick(/Licence No:\s*(\S+)/),
    reference_number: pick(/Policy No:\s*(\S+)/),
    issuing_authority: pick(/Issuing Authority:\s*(.+)/),
    registration_date: isoDate(pick(/(?:Issue Date|Date of Issue):\s*(\d{2}\/\d{2}\/\d{4})/)),
    expiry_date: isoDate(pick(/Expiry Date:\s*(\d{2}\/\d{2}\/\d{4})/)),
  };
  if (state.aiMode.omitIdentifiers) {
    record.cr_no = null;
    record.license_no = null;
    record.reference_number = null;
  }
  return record;
}

class FakeGroq {
  constructor() {
    this.chat = {
      completions: {
        create: async ({ messages }) => {
          const text = messages[messages.length - 1].content;
          state.aiPrompts.push(text);
          if (state.aiMode.throwFor && state.aiMode.throwFor.test(text)) throw Object.assign(new Error('fake AI outage'), { status: 500 });
          const content = state.aiMode.badJsonFor && state.aiMode.badJsonFor.test(text) ? 'sorry, I cannot do that' : JSON.stringify(fakeAiAnswer(text));
          return { choices: [{ finish_reason: 'stop', message: { content } }] };
        },
      },
    };
  }
}

// ---- fake Microsoft Graph
async function graphRequest(method, url, body) {
  if (method === 'POST' && url.endsWith('/sendMail')) {
    if (state.failSend) throw new Error('mail service unavailable');
    state.sent.push({
      to: body.message.toRecipients.map((r) => r.emailAddress.address),
      subject: body.message.subject,
      content: body.message.body.content,
    });
    return {};
  }
  if (method === 'GET' && /\/messages\?/.test(url)) {
    return { value: decodeURIComponent(url).includes('isRead eq false') ? state.messages.map(({ attachments, ...message }) => message) : [] };
  }
  let match = /\/messages\/([^/]+)\/attachments\?/.exec(url);
  if (method === 'GET' && match) {
    const message = state.messages.find((m) => m.id === decodeURIComponent(match[1]));
    return {
      value: message.attachments.map((a) => ({ id: a.id, name: a.name, contentType: a.name.endsWith('.pdf') ? 'application/pdf' : 'application/octet-stream', isInline: false, size: 1 })),
    };
  }
  match = /\/messages\/([^/]+)\/attachments\/([^/?]+)$/.exec(url);
  if (method === 'GET' && match) {
    const message = state.messages.find((m) => m.id === decodeURIComponent(match[1]));
    const attachment = message.attachments.find((a) => a.id === decodeURIComponent(match[2]));
    return { contentBytes: fs.readFileSync(path.join(PDF_DIR, attachment.file)).toString('base64') };
  }
  if (method === 'GET' && url.includes('/drive/root:/temp:/children')) throw Object.assign(new Error('not found'), { status: 404 });
  if (url.endsWith('/createLink')) return { link: { webUrl: 'https://onedrive.test/share/link' } };
  if (method === 'GET' && /\/planner\/plans\/[^/]+\/buckets$/.test(url)) return { value: [{ id: 'bucket-1' }] };
  if (method === 'POST' && url === '/planner/tasks') {
    state.plannerTasks.push(body);
    return { id: `task-${state.plannerTasks.length}` };
  }
  if (method === 'POST' && /\/events$|\/calendar\/events/.test(url)) return { id: 'event-1' };
  return {};
}

const realFetch = global.fetch; // kept for talking to the local test server; everything else is faked below
global.fetch = async (url, options = {}) => {
  // manual smoke runs only (USE_REAL_AI=1): the call to the AI service goes out for real; nothing else does
  if (process.env.USE_REAL_AI && /^https:\/\/api\.groq\.com\//.test(String(url))) return realFetch(url, options);
  const json = (value, status = 200) => ({ ok: status < 300, status, statusText: 'OK', json: async () => value, text: async () => '' });
  if (options.method === 'PUT' && /\/drive\/root:\//.test(url)) {
    const name = decodeURIComponent(/root:\/(?:[^/]+\/)?([^:?]+):/.exec(url)[1]);
    state.uploads.push(name);
    return json({ id: `item-${state.uploads.length}`, webUrl: `https://onedrive.test/${encodeURIComponent(name)}` });
  }
  return json({}, 404);
};

// Replace the real modules: the Graph client for EVERY module (so no test can reach Microsoft) and the AI SDK.
const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, ...rest) {
  if (request === 'groq-sdk' && !process.env.USE_REAL_AI) return FakeGroq;
  if (request === '../graph/client' || request === './graph/client') {
    return { graphRequest, getAppOnlyToken: async () => 'fake-token', getDelegatedToken: async () => 'fake-token', sendMail: async () => {}, updateEnvFile: () => {} };
  }
  return originalLoad.call(this, request, parent, ...rest);
};

const { pool } = require('../../db');
const processor = require('../../jobs/documentEmailProcessor');
const ready = require('../../db/documentColumns').ensureDocumentColumns(pool);

// Record what the processor queues for its reply email, as structured data.
const realQuery = pool.query.bind(pool);
pool.query = (text, params) => {
  if (typeof text === 'string' && text.startsWith('INSERT INTO document_summary_queue')) {
    state.queued.push({ subject: params[1], result: JSON.parse(params[3]) });
  }
  return realQuery(text, params);
};

let counter = 0;
// An email with PDF attachments. files: ['two_docs.pdf', ...] (names in tests/fixtures/pdfs)
function email({ subject = 'Documents', from = 'alice@bak.example.test', fromName = 'Alice Example', to = ['bob@bak.example.test'], files = [] } = {}) {
  counter++;
  return {
    id: `msg-${counter}`,
    internetMessageId: `<msg-${counter}@test>`,
    subject,
    from: { emailAddress: { name: fromName, address: from } },
    toRecipients: to.map((address) => ({ emailAddress: { address } })),
    attachments: files.map((file, i) => ({ id: `att-${counter}-${i}`, name: file, file })),
  };
}

async function reset() {
  await ready; // schema columns for the Documents module exist
  state.messages = [];
  state.sent = [];
  state.uploads = [];
  state.aiPrompts = [];
  state.aiMode = {};
  state.queued = [];
  state.plannerTasks = [];
  state.failSend = false;
  await realQuery(`DELETE FROM document_versions`);
  await realQuery(`DELETE FROM notification_log`);
  await realQuery(`DELETE FROM escalation_log`).catch(() => {});
  await realQuery(`DELETE FROM work_orders`);
  await realQuery(`DELETE FROM assets`);
  await realQuery(`DELETE FROM processed_emails`).catch(() => {});
  await realQuery(`DELETE FROM document_summary_queue`).catch(() => {});
}

// Runs one pass of the processor over the given emails; returns what it produced.
async function run(messages) {
  state.messages = messages;
  const summary = await processor.processDocumentEmails();
  return { summary, sent: state.sent, queued: state.queued, results: state.queued.map((q) => q.result) };
}

const documents = async () =>
  (await realQuery(
    `SELECT a.*, t.name AS type_name FROM assets a JOIN asset_types t ON t.id = a.type_id WHERE t.name = 'Document' ORDER BY a.id`
  )).rows;

// A document already in the system (for duplicate and reminder scenarios).
async function seedDocument({
  name, licenseNo = null, crNo = null, company = 'Seeded Co', expiry = '2031-01-01', issue = null, sentBy = 'someone@bak.example.test',
  responsible = null, expirySource = null, expiryNote = null,
}) {
  const { rows } = await realQuery(
    `INSERT INTO assets (equipment_name, company_name, expiry_date, next_due_date, registration_date, license_no, cr_no, sent_by, responsible_person,
                         site_location, maintenance_interval_days, estimated_duration_hours, type_id, extracted_data, processed_at, expiry_source, expiry_note)
     VALUES ($1, $2, $3, $3, $4, $5, $6, $7, $8, 'Unassigned', 365, 0, (SELECT id FROM asset_types WHERE name = 'Document'), '{}'::jsonb, NOW(), $9, $10)
     RETURNING id`,
    [name, company, expiry, issue, licenseNo, crNo, sentBy, responsible, expirySource, expiryNote]
  );
  return rows[0].id;
}

// Today + n days as YYYY-MM-DD (Bahrain calendar day, the one the app uses).
const daysFromToday = (n) => {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bahrain' }).format(new Date());
  const date = new Date(`${today}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + n);
  return date.toISOString().slice(0, 10);
};

// The email body as plain text (for readable assertions).
const plain = (html) => String(html).replace(/<br\s*\/?>/gi, '\n').replace(/<\/(tr|p|div)>/gi, '\n').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n');

module.exports = { state, pool, query: realQuery, processor, email, reset, run, documents, seedDocument, daysFromToday, plain, realFetch, PDF_DIR };
