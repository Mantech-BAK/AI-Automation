const path = require('path');
const dotenv = require('dotenv');
const Groq = require('groq-sdk');
// Required via lib/ directly: pdf-parse's index.js runs a debug routine that
// tries to read a bundled test PDF when loaded outside a parent module.
const pdfParse = require('pdf-parse/lib/pdf-parse.js');
const { pool } = require('../db');
const { graphRequest, getAppOnlyToken } = require('../graph/client');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const MAX_TEXT_CHARS = 3000;
const ONEDRIVE_FOLDER = 'Maintenance Documents';

const SYSTEM_PROMPT =
  'You are a document data extraction assistant. Extract every piece of information you can find in this document and return it as a JSON object. ' +
  'Include all fields you find such as document name, owner name, company name, document type, document number, issuing authority, registration number, ' +
  'address, contact details, validity period, conditions, fees, reference numbers, stamp details, signatures, categories, and any other field present in the document. ' +
  'Also always include these specific fields if found: document_name (string), registration_date (string in YYYY-MM-DD format or null), expiry_date (string in YYYY-MM-DD format or null). ' +
  'Return ONLY a valid JSON object with no markdown or extra text. Every field name should be snake_case.';

// Fields that describe dates change between renewals, so they are ignored when
// deciding whether a new PDF is the same document as an existing one. Rather
// than hardcoding names, a field is excluded when its KEY looks date-related or
// its VALUE looks like a date, whatever the AI called it.
//
// Key words are matched against the snake_case parts of the key (not as raw
// substrings) so e.g. "vendor" is not caught by "end" and "format" by "at".
const DATE_KEY_WORDS = new Set([
  'expiry', 'expire', 'expires', 'expired', 'expiration',
  'issued', 'issue', 'issuance',
  'start', 'end', 'from', 'until', 'since', 'renewal', 'effective',
]);

const MONTH = '(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';
const DATE_VALUE_PATTERNS = [
  /\d{4}[-/.]\d{1,2}[-/.]\d{1,2}(?:[t ]\d{1,2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:z|[+-]\d{2}:?\d{2})?)?/gi, // YYYY-MM-DD, ISO datetime
  /\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}/g, // DD/MM/YYYY, DD-MM-YYYY, DD.MM.YYYY
  new RegExp(String.raw`\d{1,2}(?:st|nd|rd|th)?[\s-]+${MONTH}\.?[\s,-]+\d{2,4}`, 'gi'), // 15 January 2025
  new RegExp(String.raw`${MONTH}\.?[\s-]+\d{1,2}(?:st|nd|rd|th)?,?[\s-]+\d{2,4}`, 'gi'), // January 15, 2025
];
// Words allowed between dates in a range such as "01/01/2024 to 31/12/2025".
const DATE_RANGE_CONNECTORS = /\b(?:to|until|till|from|and|through|thru)\b|[-–—,]/gi;

function isDateKey(key) {
  const lower = String(key).toLowerCase().trim();
  if (lower.endsWith('_date') || lower.startsWith('date')) return true;

  const words = lower.split(/[^a-z0-9]+/).filter(Boolean);
  // "ends with at" -> a trailing "at" word (issued_at, created_at), not any key ending in the letters "at".
  if (words.length > 1 && words[words.length - 1] === 'at') return true;
  return words.some((word) => DATE_KEY_WORDS.has(word) || word.startsWith('valid'));
}

function looksLikeDate(value) {
  if (Array.isArray(value)) return value.length > 0 && value.every(looksLikeDate);
  if (typeof value !== 'string') return false;

  let remaining = value.trim();
  if (!remaining) return false;

  let found = false;
  for (const pattern of DATE_VALUE_PATTERNS) {
    remaining = remaining.replace(pattern, () => {
      found = true;
      return ' ';
    });
  }

  // Only a date (or a range of dates) counts - free text that merely mentions
  // one, e.g. "Valid for 2 years from 01/01/2024 subject to inspection", does not.
  return found && remaining.replace(DATE_RANGE_CONNECTORS, ' ').trim() === '';
}

function isExcludedField(key, newValue, existingValue) {
  return isDateKey(key) || looksLikeDate(newValue) || looksLikeDate(existingValue);
}

// Owner/company names are spelled differently by the AI on every run
// ("Kaiksow", "KaiKso", "KAIKSOW"), so they are compared by similarity.
const OWNER_KEYS = ['company_name', 'owner_name', 'entity_name', 'owner', 'company', 'licensee', 'applicant_name'];
const OWNER_MIN_SIMILARITY = 0.8;

let isProcessing = false;

function serviceAccount() {
  const email = process.env.SERVICE_ACCOUNT_EMAIL;
  if (!email) {
    throw new Error('SERVICE_ACCOUNT_EMAIL is not configured');
  }
  return encodeURIComponent(email);
}

function cleanString(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text && text.toLowerCase() !== 'null' ? text : null;
}

function cleanDate(value) {
  const text = cleanString(value);
  if (!text || !/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  return Number.isNaN(new Date(text).getTime()) ? null : text;
}

class InvalidAiJsonError extends Error {}

// Extracts a JSON object from the model output. Models often wrap the JSON in
// markdown fences or add a sentence before/after it, so fences are stripped and
// the outermost {...} is pulled out with a regex before parsing.
function parseJsonObject(rawText) {
  const rawResponse = String(rawText || '');
  const withoutFences = rawResponse.replace(/```(?:json)?/gi, '');
  const jsonMatch = withoutFences.match(/\{[\s\S]*\}/);
  const cleaned = jsonMatch ? jsonMatch[0] : withoutFences;

  try {
    return JSON.parse(cleaned);
  } catch (error) {
    // Log exactly what the model returned so the failure can be diagnosed.
    console.error(`Groq response could not be parsed as JSON (${error.message}). Raw response:
${rawResponse}`);
    throw new InvalidAiJsonError('AI returned invalid JSON');
  }
}

async function extractDocumentData(text) {
  // Long inputs make the model's answer long enough to be cut off mid-JSON.
  const truncatedText = text.slice(0, MAX_TEXT_CHARS);
  const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: truncatedText },
  ];

  let completion;
  try {
    completion = await groq.chat.completions.create({ messages, model: 'openai/gpt-oss-20b' });
  } catch (error) {
    if (error?.status !== 429) throw error;
    console.warn('Groq rate limit hit, waiting 30 seconds then retrying');
    await sleep(30000);
    completion = await groq.chat.completions.create({ messages, model: 'openai/gpt-oss-20b' });
  }

  return parseJsonObject(completion.choices[0].message.content);
}

const MIN_TEXT_CHARS = 100;
const TEMP_FOLDER = 'temp';
const TEMP_FILE_PREFIX = 'ocr_temp_';
const TEMP_FILE_MAX_AGE_MS = 60 * 60 * 1000;

// Fallback for scanned PDFs with no text layer: park the file in OneDrive and
// ask Graph to convert it to plain text. Never throws - any failure just means
// "no text", and the temp file is always removed afterwards.
async function extractTextViaGraph(pdfBuffer) {
  const fileName = `${TEMP_FILE_PREFIX}${Date.now()}_${Math.random().toString(36).slice(2, 8)}.pdf`;
  const itemPath = `${TEMP_FOLDER}/${fileName}`.split('/').map(encodeURIComponent).join('/');
  const base = `https://graph.microsoft.com/v1.0/users/${serviceAccount()}/drive/root:/${itemPath}`;
  let uploaded = false;

  try {
    const token = await getAppOnlyToken();
    const upload = await fetch(`${base}:/content`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/pdf' },
      body: pdfBuffer,
    });
    if (!upload.ok) {
      throw new Error(`temp upload failed (${upload.status})`);
    }
    uploaded = true;

    const converted = await fetch(`${base}:/content?format=txt`, { headers: { Authorization: `Bearer ${token}` } });
    if (!converted.ok) {
      throw new Error(`text conversion failed (${converted.status})`);
    }
    return await converted.text();
  } catch (error) {
    console.warn(`Graph text extraction failed: ${error.message}`);
    return '';
  } finally {
    if (uploaded) {
      try {
        await graphRequest('DELETE', `/users/${serviceAccount()}/drive/root:/${itemPath}`, null, 'app');
      } catch (error) {
        console.warn(`Could not delete temp file ${fileName}: ${error.message}`);
      }
    }
  }
}

// Removes ocr_temp_ files left behind by earlier runs that crashed before
// their own clean-up. Never throws.
async function cleanupOrphanedTempFiles() {
  let removed = 0;
  try {
    const data = await graphRequest('GET', `/users/${serviceAccount()}/drive/root:/${TEMP_FOLDER}:/children`, null, 'app');
    const cutoff = Date.now() - TEMP_FILE_MAX_AGE_MS;

    for (const item of data?.value || []) {
      if (!String(item.name || '').startsWith(TEMP_FILE_PREFIX)) continue;
      if (new Date(item.createdDateTime).getTime() > cutoff) continue;
      try {
        await graphRequest('DELETE', `/users/${serviceAccount()}/drive/items/${encodeURIComponent(item.id)}`, null, 'app');
        removed++;
      } catch (error) {
        console.warn(`Could not delete orphaned temp file ${item.name}: ${error.message}`);
      }
    }
  } catch (error) {
    // 404 just means there is no temp folder yet.
    if (error.status !== 404) console.warn(`Temp file clean-up failed: ${error.message}`);
  }

  console.log(`Temp files cleaned up: ${removed}`);
  return removed;
}

const UNKNOWN_OWNER_VALUES = new Set(['unknown', 'unknown owner', 'unknown company', 'n/a', 'na', 'none', 'not found', 'not available']);

function isUnknownOwner(value) {
  return !value || UNKNOWN_OWNER_VALUES.has(String(value).trim().toLowerCase());
}

// Document name taken from the attachment filename: ".pdf" removed and any
// leading numbers/codes stripped, e.g. "103123-Sewage Tanker STP License.pdf"
// -> "Sewage Tanker STP License". Returns null if nothing usable is left (for
// example "13687.pdf"), in which case the caller falls back to other sources.
function documentNameFromFilename(fileName) {
  const withoutExtension = String(fileName || '').replace(/\.pdf$/i, '').trim();
  const stripped = withoutExtension.replace(/^[\s\d._\-–—()#]+/, '').replace(/\s+/g, ' ').trim();
  return stripped || null;
}

function safeFilePart(value) {
  return String(value || 'Unknown').replace(/[\\/:*?"<>|#%~]/g, '').replace(/\s+/g, ' ').trim().slice(0, 80) || 'Unknown';
}

function buildFileName(companyName, documentName, expiryDate) {
  return `${safeFilePart(companyName)}_${safeFilePart(documentName)}_${expiryDate}.pdf`;
}

// Uploads the PDF to the service account's OneDrive. Never throws - a failed
// upload must not stop the document from being recorded.
async function uploadToOneDrive(pdfBuffer, companyName, documentName, expiryDate) {
  try {
    const fileName = buildFileName(companyName, documentName, expiryDate);
    const itemPath = `${ONEDRIVE_FOLDER}/${fileName}`.split('/').map(encodeURIComponent).join('/');
    const token = await getAppOnlyToken();
    const response = await fetch(
      `https://graph.microsoft.com/v1.0/users/${serviceAccount()}/drive/root:/${itemPath}:/content`,
      {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/pdf' },
        body: pdfBuffer,
      }
    );

    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(`${response.status} ${body.error?.code || ''} ${body.error?.message || response.statusText}`.trim());
    }

    // A sharing link (organization-wide, view only) opens for anyone in the
    // tenant, unlike the raw webUrl which only works for the file's owner.
    // If link creation fails the file is still stored, so fall back to webUrl.
    try {
      const link = await graphRequest(
        'POST',
        `/users/${serviceAccount()}/drive/items/${encodeURIComponent(body.id)}/createLink`,
        { type: 'view', scope: 'organization' },
        'app'
      );
      if (link?.link?.webUrl) return link.link.webUrl;
    } catch (linkError) {
      console.warn(`Could not create sharing link for "${documentName}": ${linkError.message}`);
    }

    return body.webUrl || null;
  } catch (error) {
    console.warn(`OneDrive upload failed for "${documentName}": ${error.message}`);
    return null;
  }
}

async function updateExistingDocument(assetId, doc, oneDriveUrl) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Snapshot the version being replaced before overwriting it. Skipped when
    // there is no stored link (document_versions.onedrive_url is NOT NULL) or
    // that link is already recorded as a version.
    await client.query(
      `INSERT INTO document_versions (asset_id, onedrive_url, expiry_date, issue_date, uploaded_at, file_name)
       SELECT a.id, a.onedrive_url, a.expiry_date, a.registration_date, COALESCE(a.last_received_at, NOW()),
              regexp_replace(a.onedrive_url, '^.*/', '')
       FROM assets a
       WHERE a.id = $1 AND a.onedrive_url IS NOT NULL
         AND NOT EXISTS (SELECT 1 FROM document_versions v WHERE v.asset_id = a.id AND v.onedrive_url = a.onedrive_url)`,
      [assetId]
    );

    // COALESCE keeps a previously stored link if this upload failed.
    await client.query(
      `UPDATE assets SET
         expiry_date = $1,
         next_due_date = $1,
         registration_date = $2,
         extracted_data = $3::jsonb,
         last_received_at = NOW(),
         updated_at = NOW(),
         onedrive_url = COALESCE($4, onedrive_url)
       WHERE id = $5`,
      [doc.expiry_date, doc.registration_date, JSON.stringify(doc.extracted_data), oneDriveUrl, assetId]
    );

    if (oneDriveUrl) {
      await client.query(
        `INSERT INTO document_versions (asset_id, onedrive_url, expiry_date, issue_date, file_name) VALUES ($1, $2, $3, $4, $5)`,
        [assetId, oneDriveUrl, doc.expiry_date, doc.registration_date, buildFileName(doc.owner_name, doc.document_name, doc.expiry_date)]
      );
    }

    const { rows: openOrders } = await client.query(
      `SELECT id FROM work_orders WHERE asset_id = $1 AND task_type = 'document' AND status = 'open'`,
      [assetId]
    );

    for (const order of openOrders) {
      await client.query(`UPDATE work_orders SET status = 'completed', completed_at = NOW() WHERE id = $1`, [order.id]);
    }

    await client.query(
      `INSERT INTO notification_log (work_order_id, notification_type, notes) VALUES ($1, $2, $3)`,
      [
        openOrders[0]?.id || null,
        'document_renewed_via_email',
        JSON.stringify({ asset_id: assetId, document_name: doc.document_name, new_expiry_date: doc.expiry_date }),
      ]
    );

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

async function createNewDocument(doc, oneDriveUrl) {
  // "Document" is an asset_types row (type_id); asset_categories only holds
  // the fine-grained tags since the category/type swap in db/migrate.js.
  // site_location and estimated_duration_hours are NOT NULL on assets.
  const { rows } = await pool.query(
    `INSERT INTO assets (
       equipment_name, company_name, type_of_service, document_number, issuing_authority,
       expiry_date, next_due_date, registration_date, last_received_at,
       reminder_days, maintenance_interval_days, frequency_days, onedrive_url,
       type_id, responsible_person, site_location, estimated_duration_hours, extracted_data
     ) VALUES (
       $1, $2, $3, $4, $5,
       $6, $6, $7, NOW(),
       30, 365, NULL, $8,
       (SELECT id FROM asset_types WHERE name = 'Document' LIMIT 1), $9, 'Unassigned', 0, $10::jsonb
     ) RETURNING id`,
    [
      doc.document_name, doc.owner_name, doc.document_type, doc.document_number, doc.issuing_authority,
      doc.expiry_date, doc.registration_date, oneDriveUrl, doc.responsible_person,
      JSON.stringify(doc.extracted_data),
    ]
  );

  if (oneDriveUrl) {
    await pool.query(
      `INSERT INTO document_versions (asset_id, onedrive_url, expiry_date, issue_date, file_name) VALUES ($1, $2, $3, $4, $5)`,
      [rows[0].id, oneDriveUrl, doc.expiry_date, doc.registration_date, buildFileName(doc.owner_name, doc.document_name, doc.expiry_date)]
    );
  }
}

function normalizeValue(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') {
    const ordered = Array.isArray(value)
      ? value.map(normalizeValue)
      : Object.keys(value).sort().map((k) => `${k}:${normalizeValue(value[k])}`);
    return JSON.stringify(ordered);
  }
  return String(value).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

// Fields that identify one particular certificate/licence: *_no, *_number, ids,
// references and codes (cr_no, license_no, document_number, ...).
function isIdentifierKey(key) {
  return /(^|_)(no|number|num|id|ref|reference|code)($|_)/.test(String(key).toLowerCase());
}

function ownerOf(data) {
  for (const key of OWNER_KEYS) {
    const value = normalizeValue(data[key]);
    if (value) return value;
  }
  return '';
}

// 1 = identical, 0 = nothing in common (Levenshtein distance ratio).
function similarity(a, b) {
  if (a === b) return 1;
  if (!a || !b) return 0;
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) {
      current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    previous = current;
  }
  return 1 - previous[b.length] / Math.max(a.length, b.length);
}

// Two owner/company names are "the same" when, ignoring case, spaces and
// punctuation, one contains the other (or they are within a couple of typos).
function ownersMatch(a, b) {
  const squash = (value) => value.replace(/[^\p{L}\p{N}]+/gu, '');
  const x = squash(a);
  const y = squash(b);
  if (!x || !y) return false;
  return x.includes(y) || y.includes(x) || similarity(x, y) >= OWNER_MIN_SIMILARITY;
}

// Decides whether two extractions are the same document (a renewal or a
// re-sent copy). Returns null for "different document", otherwise a score used
// to rank candidates.
//   1. The document name must be the same (case-insensitive). It comes from
//      the attachment filename, so it is stable between runs.
//   2. Identifier fields (cr_no, license_no, document_number, ...) are compared
//      under the same key. Any one equal identifier makes it a match; if both
//      records have identifiers but none agree it is a different certificate.
//   3. With no identifier in common, the owner names (when both exist) must
//      match loosely, since the AI spells them differently each run.
// Dates are never compared (isExcludedField), and fields only one record has
// are ignored.
function compareExtractedData(newData, existingData) {
  if (!existingData || typeof existingData !== 'object') return null;

  const name = normalizeValue(newData.document_name);
  if (!name || name !== normalizeValue(existingData.document_name)) return null;

  let sharedIds = 0;
  let equalIds = 0;
  for (const key of Object.keys(newData)) {
    if (!isIdentifierKey(key) || isExcludedField(key, newData[key], existingData[key])) continue;
    const a = normalizeValue(newData[key]);
    const b = normalizeValue(existingData[key]);
    if (!a || !b) continue;
    sharedIds++;
    if (a === b) equalIds++;
  }

  const ownerA = ownerOf(newData);
  const ownerB = ownerOf(existingData);
  const ownerKnown = Boolean(ownerA && ownerB);
  const ownerSame = ownerKnown && ownersMatch(ownerA, ownerB);

  if (equalIds > 0) return 1 + equalIds * 2 + (ownerSame ? 1 : 0);
  if (sharedIds > 0) return null; // identifiers disagree
  if (ownerKnown && !ownerSame) return null;
  return 1 + (ownerSame ? 1 : 0);
}

async function findExistingDocument(extractedData) {
  const { rows } = await pool.query(
    `SELECT id, extracted_data, onedrive_url, expiry_date FROM assets WHERE extracted_data IS NOT NULL`
  );

  let best = null;
  for (const row of rows) {
    const score = compareExtractedData(extractedData, row.extracted_data);
    if (score !== null && (!best || score > best.score)) {
      best = { id: row.id, expiryDate: row.expiry_date, score };
    }
  }
  return best;
}

// Startup clean-up: keeps the oldest record of each group of documents that
// match each other and deletes the rest. Uses the same matching rules as the
// processor.
async function removeDuplicateDocuments() {
  const { rows } = await pool.query(`SELECT id, extracted_data FROM assets WHERE extracted_data IS NOT NULL ORDER BY id`);

  const kept = [];
  const duplicateIds = [];
  for (const row of rows) {
    if (kept.some((existing) => compareExtractedData(row.extracted_data, existing.extracted_data) !== null)) {
      duplicateIds.push(row.id);
    } else {
      kept.push(row);
    }
  }

  if (duplicateIds.length > 0) {
    await pool.query(`DELETE FROM assets WHERE id = ANY($1)`, [duplicateIds]);
  }

  console.log(`Duplicate documents removed: ${duplicateIds.length}`);
  return duplicateIds.length;
}

function formatDMY(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value || ''));
  return match ? `${match[3]}/${match[2]}/${match[1]}` : String(value || '');
}

function escapeHtml(value) {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Result: { status: 'updated' | 'created' | 'duplicate' | 'failed', fileName, documentName?, expiry?, reason?, reasonCode? }
// reasonCode ('scanned' | 'invalid_json' | 'no_expiry') picks the wording of the summary email.
async function processPdf(messageId, attachment, senderName, senderAddress) {
  const fail = (reason, reasonCode) => ({ status: 'failed', fileName: attachment.name, reason, reasonCode });

  const attachmentUrl = `/users/${serviceAccount()}/messages/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(attachment.id)}`;
  const full = await graphRequest('GET', attachmentUrl, null, 'app');

  if (!full.contentBytes) {
    return fail('attachment has no content');
  }

  const pdfBuffer = Buffer.from(full.contentBytes, 'base64');
  let { text } = await pdfParse(pdfBuffer);

  // Scanned PDFs have little or no text layer - try Microsoft's conversion.
  if (!text || text.trim().length < MIN_TEXT_CHARS) {
    console.log(`"${attachment.name}" has little extractable text, trying Graph text conversion`);
    const converted = await extractTextViaGraph(pdfBuffer);

    if (!converted || converted.trim().length < MIN_TEXT_CHARS) {
      console.warn(`Failed — scanned image PDF — Microsoft could not extract text — please use a text-based PDF ("${attachment.name}")`);
      return fail('scanned image PDF — Microsoft could not extract text — please use a text-based PDF', 'scanned');
    }
    text = converted;
  }

  let raw;
  try {
    raw = await extractDocumentData(text);
  } catch (error) {
    if (error instanceof InvalidAiJsonError) {
      console.error(`AI returned invalid JSON for "${attachment.name}":`, error.message);
      return fail(error.message, 'invalid_json');
    }
    throw error;
  }

  const firstString = (...keys) => {
    for (const key of keys) {
      const value = cleanString(typeof raw[key] === 'object' ? null : raw[key]);
      if (value) return value;
    }
    return null;
  };

  // The whole AI response is kept as extracted_data; a few well-known keys are
  // also copied into dedicated columns.
  const doc = {
    extracted_data: raw,
    // The attachment filename is the document name everywhere (database,
    // OneDrive filename, UI). Groq's extracted name varies from run to run, so
    // it is only a fallback when the filename has nothing usable in it.
    document_name:
      documentNameFromFilename(attachment.name) ||
      firstString('document_name') ||
      String(attachment.name || '').replace(/\.pdf$/i, '').trim(),
    registration_date: cleanDate(raw.registration_date) || cleanDate(raw.issue_date) || cleanDate(raw.date_of_issue),
    expiry_date: cleanDate(raw.expiry_date),
    owner_name: firstString('company_name', 'owner_name', 'owner', 'company'),
    document_type: firstString('document_type') || 'general',
    document_number: firstString('document_number', 'registration_number', 'license_number', 'certificate_number'),
    issuing_authority: firstString('issuing_authority'),
    // Whoever sent the document is responsible for it.
    responsible_person: senderAddress || null,
  };

  // The AI sometimes can't find an owner - fall back to whoever sent the email.
  if (isUnknownOwner(doc.owner_name)) {
    doc.owner_name = senderName || null;
  }

  // Keep the stored extraction consistent with the chosen name, so it can't
  // differ between runs when documents are matched against each other.
  raw.document_name = doc.document_name;

  if (!doc.expiry_date) {
    console.warn(`Cannot process PDF — no expiry date found ("${attachment.name}")`);
    return fail('could not extract expiry date', 'no_expiry');
  }

  const base = { fileName: attachment.name, documentName: doc.document_name, expiry: doc.expiry_date };

  // Documents handled earlier in this same run are already in the database
  // (each record is committed before the next PDF is checked), so this also
  // catches the same PDF attached twice, or sent in several emails.
  const existing = await findExistingDocument(doc.extracted_data);

  // Already stored with the very same expiry - nothing new to record.
  if (existing && existing.expiryDate === doc.expiry_date) {
    console.log(`Duplicate PDF skipped (already in system with same expiry): ${doc.document_name}`);
    return { ...base, status: 'duplicate' };
  }

  const oneDriveUrl = await uploadToOneDrive(pdfBuffer, doc.owner_name, doc.document_name, doc.expiry_date);

  if (existing) {
    await updateExistingDocument(existing.id, doc, oneDriveUrl);
  } else {
    await createNewDocument(doc, oneDriveUrl);
  }

  const status = existing ? 'updated' : 'created';
  console.log(
    `Processed PDF: ${doc.document_name} from ${doc.owner_name || 'Unknown owner'} — Action: ${status} — Expiry: ${doc.expiry_date} — OneDrive: ${oneDriveUrl || 'null'}`
  );
  return { ...base, status };
}

function describeResult(result) {
  switch (result.status) {
    case 'updated':
      return `Successfully processed — ${result.documentName} — Expiry updated to ${formatDMY(result.expiry)}`;
    case 'created':
      return `New document created — ${result.documentName} — Expires ${formatDMY(result.expiry)}`;
    case 'duplicate':
      return `Duplicate — ${result.documentName} — already exists in system with same details`;
    default:
      switch (result.reasonCode) {
        case 'scanned':
          return `${result.fileName} — Failed: This is a scanned image PDF. Please use a text-searchable PDF version and resend.`;
        case 'invalid_json':
          return `${result.fileName} — Failed: Could not read document content. Please resend.`;
        case 'no_expiry':
          return `${result.fileName} — Failed: No expiry date found in document. Please ensure the document contains a visible expiry date.`;
        default:
          return `${result.fileName} — Failed: ${result.reason}`;
      }
  }
}

// Sends ONE summary email per unique sender at the end of a run, covering all
// of that sender's documents across every email they sent. Never throws.
// entries: [{ subject, result }] collected as PDFs are processed.
async function sendSummaryEmails(entriesBySender) {
  const ownAddress = String(process.env.SERVICE_ACCOUNT_EMAIL || '').toLowerCase();

  for (const [senderAddress, entries] of entriesBySender) {
    // Avoid mailing ourselves (and a possible reply loop).
    if (senderAddress.toLowerCase() === ownAddress) continue;

    const results = entries.map((entry) => entry.result);

    // Merge the CC lists of all this sender's emails (unique, case-insensitive).
    // The service account and the recipient themselves are never CC'd.
    const ccAddresses = new Map();
    for (const entry of entries) {
      for (const address of entry.cc || []) {
        const key = address.toLowerCase();
        if (key === ownAddress || key === senderAddress.toLowerCase()) continue;
        if (!ccAddresses.has(key)) ccAddresses.set(key, address);
      }
    }
    const count = (status) => results.filter((r) => r.status === status).length;
    const created = count('created');
    const processed = count('updated') + created;
    const totals = `Total: ${processed} processed, ${created} new, ${count('duplicate')} duplicates, ${count('failed')} failed`;

    const subjects = [...new Set(entries.map((entry) => entry.subject || '(no subject)'))];
    const sections = subjects
      .map((subject) => {
        const items = entries
          .filter((entry) => (entry.subject || '(no subject)') === subject)
          .map(({ result }) => `<li>${escapeHtml(result.status === 'failed' ? describeResult(result) : `${result.fileName}: ${describeResult(result)}`)}</li>`)
          .join('');
        return `<p><b>${escapeHtml(subject)}</b></p><ul>${items}</ul>`;
      })
      .join('');
    const content = `<p>Summary of the ${results.length} PDF attachment${results.length === 1 ? '' : 's'} received from you:</p>${sections}<p><b>${totals}</b></p>`;
    const subject = subjects.length === 1
      ? `Document Processing Summary — ${subjects[0]}`
      : `Document Processing Summary — ${subjects.length} emails`;

    try {
      await graphRequest(
        'POST',
        `/users/${serviceAccount()}/sendMail`,
        {
          message: {
            subject,
            body: { contentType: 'HTML', content },
            toRecipients: [{ emailAddress: { address: senderAddress } }],
            ccRecipients: [...ccAddresses.values()].map((address) => ({ emailAddress: { address } })),
          },
          saveToSentItems: 'true',
        },
        'app'
      );
      console.log(`Summary email sent to ${senderAddress} (${results.length} document${results.length === 1 ? '' : 's'}, ${ccAddresses.size} CC)`);
    } catch (error) {
      console.warn(`Could not send summary email to ${senderAddress}: ${error.message}`);
    }
  }
}

async function processDocumentEmails() {
  const summary = { emailsChecked: 0, pdfsFound: 0, documentsUpdated: 0, documentsCreated: 0, duplicates: 0, failed: 0 };

  if (isProcessing) {
    console.log('Already processing — skipping this run');
    return { ...summary, alreadyRunning: true };
  }
  isProcessing = true;

  try {
    await cleanupOrphanedTempFiles();

    // sender address -> [{ subject, result }] for the single end-of-run summary
    const entriesBySender = new Map();
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const filter = `hasAttachments eq true and isRead eq false and receivedDateTime ge ${since}`;
    const data = await graphRequest(
      'GET',
      `/users/${serviceAccount()}/messages?$filter=${encodeURIComponent(filter)}&$select=id,subject,from,ccRecipients&$top=50`,
      null,
      'app'
    );
    const messages = Array.isArray(data?.value) ? data.value : [];
    summary.emailsChecked = messages.length;

    // TEMP DEBUG: same query without the unread condition, log only (not processed).
    try {
      const debugFilter = `hasAttachments eq true and receivedDateTime ge ${since}`;
      const debugData = await graphRequest(
        'GET',
        `/users/${serviceAccount()}/messages?$filter=${encodeURIComponent(debugFilter)}&$select=id,subject,isRead,receivedDateTime&$top=50`,
        null,
        'app'
      );
      const debugMessages = Array.isArray(debugData?.value) ? debugData.value : [];
      console.log(`[DEBUG] Emails with attachments (read or unread) in last 30 days: ${debugMessages.length}`);
      debugMessages.forEach((m) => console.log(`[DEBUG]   ${m.isRead ? 'READ  ' : 'UNREAD'} ${m.receivedDateTime} — ${m.subject}`));
    } catch (error) {
      console.warn(`[DEBUG] Debug fetch failed: ${error.message}`);
    }

    for (const message of messages) {
      try {
        const attachmentList = await graphRequest(
          'GET',
          `/users/${serviceAccount()}/messages/${encodeURIComponent(message.id)}/attachments?$select=id,name,contentType`,
          null,
          'app'
        );
        const pdfs = (attachmentList?.value || []).filter(
          (a) => /pdf/i.test(a.contentType || '') || /\.pdf$/i.test(a.name || '')
        );

        // Emails without PDFs are left untouched for the general email processor.
        if (pdfs.length === 0) continue;

        summary.pdfsFound += pdfs.length;
        const senderAddress = message.from?.emailAddress?.address || null;

        for (const attachment of pdfs) {
          let result;
          try {
            result = await processPdf(message.id, attachment, message.from?.emailAddress?.name || message.from?.emailAddress?.address || null, message.from?.emailAddress?.address || null);
          } catch (error) {
            console.error(`Failed to process PDF "${attachment.name}" in "${message.subject}":`, error.message);
            result = { status: 'failed', fileName: attachment.name, reason: error.message };
          }

          if (senderAddress) {
            if (!entriesBySender.has(senderAddress)) entriesBySender.set(senderAddress, []);
            entriesBySender.get(senderAddress).push({
              subject: message.subject,
              result,
              cc: (message.ccRecipients || []).map((r) => r.emailAddress?.address).filter(Boolean),
            });
          } else {
            console.warn(`No sender address on "${message.subject}", it will not be included in a summary email`);
          }
          if (result.status === 'updated') summary.documentsUpdated++;
          else if (result.status === 'created') summary.documentsCreated++;
          else if (result.status === 'duplicate') summary.duplicates++;
          else summary.failed++;
        }

        await graphRequest('PATCH', `/users/${serviceAccount()}/messages/${encodeURIComponent(message.id)}`, { isRead: true }, 'app');
      } catch (error) {
        summary.failed++;
        console.error(`Failed to process email "${message.subject}":`, error.message);
      }
    }

    await sendSummaryEmails(entriesBySender);
  } finally {
    isProcessing = false;
  }

  console.log('Document email processing summary:');
  console.log(`  Total emails checked: ${summary.emailsChecked}`);
  console.log(`  Total PDFs found: ${summary.pdfsFound}`);
  console.log(`  Total documents updated: ${summary.documentsUpdated}`);
  console.log(`  Total documents created: ${summary.documentsCreated}`);
  console.log(`  Total duplicates skipped: ${summary.duplicates}`);
  console.log(`  Total failed: ${summary.failed}`);

  return summary;
}

module.exports = { documentNameFromFilename, processDocumentEmails, removeDuplicateDocuments, compareExtractedData, isDateKey, looksLikeDate, parseJsonObject, isUnknownOwner, cleanupOrphanedTempFiles };
