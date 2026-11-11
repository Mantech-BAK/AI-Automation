const path = require('path');
const os = require('os');
const fs = require('fs');
const { execFile } = require('child_process');
const dotenv = require('dotenv');
const Groq = require('groq-sdk');
// Required via lib/ directly: pdf-parse's index.js runs a debug routine that
// tries to read a bundled test PDF when loaded outside a parent module.
const pdfParse = require('pdf-parse/lib/pdf-parse.js');
const { pool } = require('../db');
const { graphRequest, getAppOnlyToken } = require('../graph/client');
const { findCrNo, findLicenseNo, stripPrintedFields, findIdentifiersInText } = require('../utils/documentFields');
const { segmentPages, describePages } = require('../utils/pdfSegmentation');
const { resolveExpiry } = require('../utils/documentExpiry');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Text sent to the model: every page is included (marked "=== PAGE n of N ==="), each page capped so one long page
// cannot push the later pages out. Long inputs make the model's answer long enough to be cut off mid-JSON.
const MAX_TEXT_CHARS = 24000;
const MAX_PAGE_CHARS = 6000;
// false: a re-sent document that already exists is always a duplicate (even with a new expiry date).
const AUTO_RENEW_ON_NEWER_EXPIRY = false;
const ONEDRIVE_FOLDER = 'Maintenance Documents';

const SYSTEM_PROMPT =
  'You are a document data extraction assistant. Extract every piece of information you can find in this document and return it as a JSON object. ' +
  'Include all fields you find such as document name, owner name, company name, document type, document number, issuing authority, registration number, ' +
  'address, contact details, validity period, conditions, fees, reference numbers, stamp details, signatures, categories, and any other field present in the document. ' +
  'Also always include these specific fields if found: document_name (string), registration_date (YYYY-MM-DD or null), expiry_date (YYYY-MM-DD or null). ' +
  'registration_date is the date the document was issued or registered (usually the earlier date). expiry_date is the date the document expires or becomes invalid (usually the later date). expiry_date must always be after registration_date. Use null for expiry_date when the document does not show an expiry date - never work one out yourself. ' +
  'If the document states how long it is valid for (for example "valid for 4 years"), also return validity_period as the exact words of the document. ' +
  'Use exactly these snake_case keys whenever the document has the value, so every run names them the same way: ' +
  'cr_no (the Commercial Registration / CR number only), license_no (the licence / permit number only - never put the CR number here), ' +
  'reference_number (a policy, certificate, reference or serial number - such numbers are NEVER license_no or cr_no), document_number, company_name. Do not include the date the document was printed. ' +
  'This PDF may contain multiple separate documents, one per page or section (the text is split into "=== PAGE n of N ===" sections). You MUST return ALL documents found as separate items in the documents array. Do not combine multiple documents into one. If there are 2 documents, return 2 items. If there are 3, return 3. ' +
  'If the PDF contains more than one separate document (for example a CR certificate AND a licence on the same file, or one licence per page), return {"documents": [ {...}, {...} ]} ' +
  'with one object per document, each with its own document_name, cr_no, license_no, registration_date, expiry_date and the other fields; otherwise return a single object. ' +
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

// Runs fn up to `attempts` times (1 try + retries), logging the exact error of every failed attempt.
// "Could not read document content" is the AI returning unparseable JSON, which is intermittent for the
// very same PDF - a retry usually succeeds.
async function withRetries(label, fn, attempts = 3, delayMs = 2000) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      console.warn(`${label} failed (attempt ${attempt}/${attempts}): ${error.name || 'Error'}: ${error.message}${error.status ? ` [HTTP ${error.status}]` : ''}`);
      if (attempt < attempts) await sleep(delayMs);
    }
  }
  throw lastError;
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
  const truncatedText = text.slice(0, MAX_TEXT_CHARS);
  console.log(`Text sent to the AI (${truncatedText.length} of ${text.length} chars):
${truncatedText}`);
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

  const choice = completion.choices?.[0];
  if (choice?.finish_reason === 'length') {
    console.warn('Groq response was cut off (finish_reason=length) - the JSON will be incomplete');
  }
  const content = choice?.message?.content;
  console.log(`AI raw response (${String(content || '').length} chars, ${truncatedText.length} chars sent): ${String(content || '').slice(0, 4000)}`);
  return parseJsonObject(content);
}

// A PDF can hold many documents: the first pages are read (here and in scripts/ocr_pdf.py, LAST_PAGE) and split by document.
const MAX_PDF_PAGES = 20;

// Text of a PDF page by page. pdf-parse joins pages into one string; the custom page renderer keeps each page's own text.
async function readPdfPages(pdfBuffer) {
  const pages = [];
  const renderPage = async (pageData) => {
    const content = await pageData.getTextContent({ normalizeWhitespace: false, disableCombineTextItems: false });
    let lastY;
    let text = '';
    for (const item of content.items) {
      if (lastY === item.transform[5] || lastY === undefined) text += item.str;
      else text += '\n' + item.str;
      lastY = item.transform[5];
    }
    pages.push(text);
    return text;
  };
  const result = await pdfParse(pdfBuffer, { pagerender: renderPage, max: MAX_PDF_PAGES });
  return { text: result.text, pages };
}

// Text of a PDF through scripts/ocr_pdf.py: the PDF's own text layer when it has one, otherwise EasyOCR (English +
// Arabic) on page images. Pages come back separated by a form feed. Always resolves to an object:
//   { text, pages, ocrAttempted }                 - the script produced text
//   { failure: 'killed' | 'error', ocrAttempted } - it could not (killed by a signal, e.g. out of memory on Railway;
//                                                    or Python / poppler / EasyOCR missing, no text found, ...)
// so the caller can fall back to pdf-parse and still report why OCR failed.
const OCR_SCRIPT = path.join(__dirname, '..', 'scripts', 'ocr_pdf.py');
const OCR_TIMEOUT_MS = 10 * 60 * 1000;

function readPdfViaScript(pdfBuffer, label) {
  const tempPath = path.join(os.tmpdir(), `ocr_input_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.pdf`);
  const python = process.env.PYTHON_BIN || (process.platform === 'win32' ? 'python' : 'python3');

  return new Promise((resolve) => {
    fs.writeFileSync(tempPath, pdfBuffer);
    execFile(
      python,
      [OCR_SCRIPT, tempPath],
      { timeout: OCR_TIMEOUT_MS, maxBuffer: 50 * 1024 * 1024, encoding: 'utf8', env: { ...process.env, PYTHONIOENCODING: 'utf-8' } },
      (error, stdout, stderr) => {
        fs.rm(tempPath, { force: true }, () => {});
        const notes = String(stderr || '').trim();
        if (notes) console.log(`"${label}" OCR script: ${notes.split('\n').join(' | ').slice(0, 800)}`);
        // the script says "running OCR" once it gave up on the text layer
        const ocrAttempted = /running OCR/.test(notes);
        if (error) {
          // error.signal is set when the process was killed (SIGKILL = the container ran out of memory)
          const failure = error.signal ? 'killed' : 'error';
          console.warn(`OCR script failed for "${label}" (${error.signal || error.code || error.message}) - falling back to pdf-parse`);
          return resolve({ failure, ocrAttempted });
        }
        const pages = String(stdout).split('\f');
        resolve({ text: pages.join('\n'), pages, ocrAttempted });
      }
    );
  });
}

const textForAi = (pages) =>
  pages.map((page, i) => `=== PAGE ${i + 1} of ${pages.length} ===\n${String(page).trim().slice(0, MAX_PAGE_CHARS)}`).join('\n\n');

const MIN_TEXT_CHARS = 100;
// Fewer characters than this from OCR means the scan was unreadable.
const MIN_OCR_CHARS = 50;
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


// Uploads the PDF to the service account's OneDrive. Never throws - a failed
// upload must not stop the document from being recorded.
// The file keeps the attachment's own filename. If a file with that name is already in the folder (the same document re-sent),
// OneDrive keeps both instead of overwriting the earlier version.
async function uploadToOneDrive(pdfBuffer, fileName) {
  const documentName = fileName;
  try {
    const itemPath = `${ONEDRIVE_FOLDER}/${fileName}`.split('/').map(encodeURIComponent).join('/');
    const token = await getAppOnlyToken();
    const response = await fetch(
      `https://graph.microsoft.com/v1.0/users/${serviceAccount()}/drive/root:/${itemPath}:/content?@microsoft.graph.conflictBehavior=rename`,
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
         processed_at = NOW(),
         updated_at = NOW(),
         onedrive_url = COALESCE($4, onedrive_url),
         cr_no = COALESCE($6, cr_no),
         license_no = COALESCE($7, license_no),
         expiry_source = $8,
         expiry_note = $9
       WHERE id = $5`,
      [doc.expiry_date, doc.registration_date, JSON.stringify(doc.extracted_data), oneDriveUrl, assetId, doc.cr_no, doc.license_no, doc.expiry_source || null, doc.expiry_note || null]
    );

    if (oneDriveUrl) {
      await client.query(
        `INSERT INTO document_versions (asset_id, onedrive_url, expiry_date, issue_date, file_name) VALUES ($1, $2, $3, $4, $5)`,
        [assetId, oneDriveUrl, doc.expiry_date, doc.registration_date, doc.file_name]
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
       type_id, responsible_person, site_location, estimated_duration_hours, extracted_data,
       cr_no, license_no, processed_at, sent_by, expiry_source, expiry_note
     ) VALUES (
       $1, $2, $3, $4, $5,
       $6, $6, $7, NOW(),
       30, 365, NULL, $8,
       (SELECT id FROM asset_types WHERE name = 'Document' LIMIT 1), $9, 'Unassigned', 0, $10::jsonb,
       $11, $12, NOW(), $13, $14, $15
     ) RETURNING id`,
    [
      doc.document_name, doc.owner_name, doc.document_type, doc.document_number, doc.issuing_authority,
      doc.expiry_date, doc.registration_date, oneDriveUrl, doc.responsible_person,
      JSON.stringify(doc.extracted_data), doc.cr_no, doc.license_no, doc.sent_by, doc.expiry_source || null, doc.expiry_note || null,
    ]
  );

  if (oneDriveUrl) {
    await pool.query(
      `INSERT INTO document_versions (asset_id, onedrive_url, expiry_date, issue_date, file_name) VALUES ($1, $2, $3, $4, $5)`,
      [rows[0].id, oneDriveUrl, doc.expiry_date, doc.registration_date, doc.file_name]
    );
  }
  return rows[0].id;
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

// Looks for a stored document (assets row of type "Document" - manual and e-mailed ones alike) that is the same
// as the incoming one. Checked against the live database, in priority order:
//   1. same licence number          2. same CR number (CR-only records)          3. same name AND same sender (sent_by)
// Records already created/matched by an earlier document of this same PDF (excludeIds) are skipped.
// Returns { id, expiryDate, processedAt, matchedBy, matchedValue, name } or null.
async function findExistingDocument(extractedData, documentName, responsiblePerson, doc = {}, excludeIds = new Set()) {
  const exclude = [...excludeIds];
  const base = `SELECT a.id, a.equipment_name, a.expiry_date, COALESCE(a.processed_at, a.last_received_at) AS processed_at
                FROM assets a JOIN asset_types t ON t.id = a.type_id
                WHERE t.name = 'Document' AND a.id <> ALL($1::int[])`;
  const found = (row, matchedBy, matchedValue) => ({
    id: row.id, name: row.equipment_name, expiryDate: row.expiry_date, processedAt: row.processed_at, matchedBy, matchedValue,
  });

  if (doc.license_no) {
    const { rows } = await pool.query(`${base} AND LOWER(TRIM(a.license_no)) = LOWER(TRIM($2)) ORDER BY a.id LIMIT 1`, [exclude, doc.license_no]);
    if (rows.length > 0) return found(rows[0], 'license_no', doc.license_no);
  } else if (!doc.cr_no && doc.document_number) {
    // No licence or CR number: the reference number, among records that have neither either.
    const { rows } = await pool.query(
      `${base} AND LOWER(TRIM(a.document_number)) = LOWER(TRIM($2)) AND a.license_no IS NULL AND a.cr_no IS NULL ORDER BY a.id LIMIT 1`,
      [exclude, doc.document_number]
    );
    if (rows.length > 0) return found(rows[0], 'document_number', doc.document_number);
  } else if (doc.cr_no) {
    // A licence record also carries the CR number, so only CR-only records count as the same CR certificate.
    const { rows } = await pool.query(`${base} AND LOWER(TRIM(a.cr_no)) = LOWER(TRIM($2)) AND a.license_no IS NULL ORDER BY a.id LIMIT 1`, [exclude, doc.cr_no]);
    if (rows.length > 0) return found(rows[0], 'cr_no', doc.cr_no);
  }

  // Same name from the same person. The name comes from the attachment filename, so it is stable between runs
  // (the AI spells identifiers differently on every run, so identifiers alone cannot catch a re-sent file).
  if (documentName && responsiblePerson) {
    const { rows } = await pool.query(
      `${base} AND LOWER(TRIM(a.equipment_name)) = ANY($2::text[]) AND LOWER(TRIM(COALESCE(a.sent_by, a.responsible_person))) = LOWER(TRIM($3)) ORDER BY a.id LIMIT 1`,
      // The filename itself, and the shortened form older records were stored under (".pdf" and leading codes removed).
      [exclude, [documentName, documentNameFromFilename(documentName)].filter(Boolean).map((name) => name.trim().toLowerCase()), responsiblePerson]
    );
    if (rows.length > 0) return found(rows[0], 'name + sent by', `${documentName} / ${responsiblePerson}`);
  }

  return null;
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

// A PDF with several documents comes back as { documents: [ {...}, {...} ] }; anything else is one document.
// Shared top-level fields (e.g. company_name) are inherited by each document unless it has its own.
function splitDocuments(aiResult) {
  const list = Array.isArray(aiResult?.documents)
    ? aiResult.documents.filter((item) => item && typeof item === 'object' && !Array.isArray(item))
    : [];
  if (list.length === 0) return [aiResult];
  if (list.length === 1 && Object.keys(aiResult).length === 1) return list;
  const { documents, ...shared } = aiResult;
  return list.map((item) => ({ ...shared, ...item }));
}

// A PDF starts with "%PDF-" (allowing a little junk before it, which PDF readers accept).
function isPdfBuffer(buffer) {
  return buffer.subarray(0, 1024).toString('latin1').includes('%PDF-');
}

// What is wrong with a PDF that could not be opened, in words for the sender.
function classifyPdfError(error, pdfBuffer) {
  const description = `${error?.name || ''} ${error?.message || ''}`;
  if (/password/i.test(description) || (pdfBuffer && /\/Encrypt\b/.test(pdfBuffer.toString('latin1')))) {
    return { code: 'password_protected', reason: 'The PDF is password-protected, so it cannot be read. Please remove the password and send it again.' };
  }
  if (/invalid pdf|bad xref|\bxref\b|corrupt|unexpected end|format ?error|invalidpdf|missing pdf|stream|trailer|not a pdf/i.test(description)) {
    return { code: 'corrupted', reason: 'The PDF file is corrupted and cannot be opened. Please send a fresh copy.' };
  }
  return { code: 'unreadable', reason: `The PDF could not be read (${String(error?.message || 'unknown error').replace(/\s+/g, ' ').slice(0, 120)}).` };
}

// pdf-parse fallback with retries for unexpected errors; a password or a corrupted file is final and not retried.
async function readPdfPagesChecked(pdfBuffer, label) {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      return await readPdfPages(pdfBuffer);
    } catch (error) {
      lastError = error;
      console.warn(`${label} failed (attempt ${attempt}/3): ${error.name || 'Error'}: ${error.message}`);
      if (classifyPdfError(error, pdfBuffer).code !== 'unreadable') break;
      if (attempt < 3) await sleep(2000);
    }
  }
  throw lastError;
}

// Runs the AI on one piece of text; returns { items } or { failure: { reason, reasonCode } } - never throws.
async function extractItems(label, text) {
  try {
    const aiResult = await withRetries(`AI extraction for ${label}`, () => extractDocumentData(text));
    return { items: splitDocuments(aiResult) };
  } catch (error) {
    console.error(`AI extraction failed for ${label}: ${error.message}`);
    if (error instanceof InvalidAiJsonError) return { failure: { reason: 'The document content could not be read by the analysis service. Please resend.', reasonCode: 'invalid_json' } };
    return { failure: { reason: `The document could not be analysed (${String(error.message || 'service error').slice(0, 120)}). Please resend.`, reasonCode: 'ai_error' } };
  }
}

// Result: { status: 'updated' | 'created' | 'duplicate' | 'failed', fileName, documentName?, pages?, expiry?, reason?, reasonCode? }
// reasonCode picks the wording of the reply email. A PDF can hold several documents: one result per document, in page order.
async function processPdf(messageId, attachment, senderName, senderAddress) {
  const fail = (reason, reasonCode, extra = {}) => ({ status: 'failed', fileName: attachment.name, reason, reasonCode, ...extra });

  const attachmentUrl = `/users/${serviceAccount()}/messages/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(attachment.id)}`;
  const full = await graphRequest('GET', attachmentUrl, null, 'app');

  if (!full.contentBytes) {
    return [fail('The attachment is empty (no content was received). Please send the file again.', 'empty')];
  }

  const pdfBuffer = Buffer.from(full.contentBytes, 'base64');
  if (!isPdfBuffer(pdfBuffer)) {
    return [fail('Unsupported file: it is named like a PDF but is not a valid PDF. Please send the document as a PDF.', 'unsupported')];
  }

  // Text layer or OCR through scripts/ocr_pdf.py; pdf-parse is the fallback when the script cannot run.
  const scriptResult = await readPdfViaScript(pdfBuffer, attachment.name);
  let text;
  let pages;
  if (scriptResult.pages) {
    ({ text, pages } = scriptResult);
  } else {
    try {
      ({ text, pages } = await readPdfPagesChecked(pdfBuffer, `PDF text extraction for "${attachment.name}"`));
    } catch (error) {
      const problem = classifyPdfError(error, pdfBuffer);
      console.warn(`[FAIL] "${attachment.name}": ${problem.reason}`);
      return [fail(problem.reason, problem.code)];
    }
  }
  console.log(`"${attachment.name}": ${pages.length} page(s), text per page: ${pages.map((p) => String(p).trim().length).join(', ')} chars`);
  if (pages.length >= MAX_PDF_PAGES) console.log(`"${attachment.name}": only the first ${MAX_PDF_PAGES} pages are read`);

  // Scanned PDFs have little or no text layer - try Microsoft's conversion.
  if (!text || text.trim().length < MIN_TEXT_CHARS) {
    console.log(`"${attachment.name}" has little extractable text, trying Graph text conversion`);
    const converted = await extractTextViaGraph(pdfBuffer);

    if (!converted || converted.trim().length < MIN_TEXT_CHARS) {
      // Every extraction path failed - say why, using what the OCR script reported.
      if (scriptResult.failure === 'killed') {
        console.warn(`[FAIL] "${attachment.name}": OCR process was killed (memory limit)`);
        return [fail('OCR processing failed (memory limit) — try splitting the PDF into smaller files', 'ocr_killed')];
      }
      if (scriptResult.ocrAttempted) {
        console.warn(`[FAIL] "${attachment.name}": OCR ran but found less than ${MIN_OCR_CHARS} characters`);
        return [fail('Scan quality too low — please rescan at minimum 300 DPI and send again', 'low_quality')];
      }
      console.warn(`[FAIL] "${attachment.name}": image-only PDF, no text could be extracted`);
      return [fail('scanned image PDF — Microsoft could not extract text — please use a text-based PDF', 'scanned')];
    }
    text = converted;
    pages = [converted];
  }

  // Which pages belong to which document. Pages are grouped by identity (licence / CR number, title, page marker).
  const groups = pages.length > 1 ? segmentPages(pages) : [{ pages: [1], unreadable: false, reason: 'single page' }];
  console.log(
    `"${attachment.name}": ${groups.length} document(s) by page - ` +
      groups.map((g) => `${describePages(g.pages)}${g.unreadable ? ' (no readable text)' : ''} [${g.reason}]`).join('; ')
  );

  // In page order: either documents to save ({ items }) or a reason a group of pages could not be used ({ failure }).
  const entries = [];
  const wholePdf = groups.length === 1 && !groups[0].unreadable;

  if (wholePdf) {
    const label = `"${attachment.name}"`;
    const extracted = await extractItems(label, pages.length > 1 ? textForAi(pages) : text);
    if (extracted.failure) return [fail(extracted.failure.reason, extracted.failure.reasonCode)];
    // Normally one document; the AI may still find several in the text (a CR certificate and a licence on one page).
    entries.push(...extracted.items.map((item) => ({ item, pages: groups[0].pages, text: pages.join('\n') })));
  } else {
    for (const group of groups) {
      if (group.unreadable) {
        const number = group.pages[0];
        const why = 'It has no text layer and no text could be read from it (image-only page)';
        console.warn(`[FAIL] "${attachment.name}" ${describePages(group.pages)}: ${why}`);
        const label = describePages(group.pages);
        entries.push({ failure: fail(`${label.charAt(0).toUpperCase()}${label.slice(1)} could not be read. ${why}. Please send a clearer copy of that page.`, 'unreadable_page', { pages: [number] }) });
        continue;
      }
      const groupText = group.pages.length > 1 ? textForAi(group.pages.map((n) => pages[n - 1])) : String(pages[group.pages[0] - 1]).trim();
      const extracted = await extractItems(`"${attachment.name}" ${describePages(group.pages)}`, groupText);
      if (extracted.failure) {
        entries.push({ failure: fail(`${describePages(group.pages)}: ${extracted.failure.reason}`, extracted.failure.reasonCode, { pages: group.pages }) });
        continue;
      }
      for (const item of extracted.items) entries.push({ item, pages: group.pages, text: group.pages.map((n) => pages[n - 1]).join('\n') });
    }
  }

  // The attachment's filename exactly as received - every document found in this PDF carries it unchanged.
  const baseName = attachment.name;
  const documentCount = entries.filter((entry) => entry.item).length;
  if (entries.length > 1) console.log(`"${attachment.name}" contains ${entries.length} document(s)`);

  // The PDF is uploaded once (when the first document that needs it is saved) and the link is shared.
  const shared = { uploaded: false, url: null };
  const getOneDriveUrl = async (doc) => {
    if (!shared.uploaded) {
      shared.uploaded = true;
      shared.url = await uploadToOneDrive(pdfBuffer, baseName);
    }
    return shared.url;
  };

  const results = [];
  const usedNames = new Set();
  // Records created or matched by an earlier document of this same PDF: a later page never merges into them.
  const claimedIds = new Set();
  let index = 0;
  for (const entry of entries) {
    if (entry.failure) {
      results.push(entry.failure);
      continue;
    }
    try {
      results.push(
        await processExtractedDocument({
          raw: entry.item, index, total: documentCount, attachment, baseName, usedNames, claimedIds, senderName, senderAddress, getOneDriveUrl,
          pageNumbers: pages.length > 1 ? entry.pages : [], text: entry.text,
        })
      );
    } catch (error) {
      // One document failing must never stop the others.
      console.error(`[FAIL] Could not save document ${index + 1} of "${attachment.name}": ${error.message}`);
      results.push(fail(`The document could not be saved (${String(error.message).slice(0, 160)}).`, 'save_error', { pages: pages.length > 1 ? entry.pages : [] }));
    }
    index++;
  }
  return results;
}

// Result for ONE document found in a PDF. Duplicates are checked per document (by licence / CR number, then by
// name + responsible person), never per file.
async function processExtractedDocument({ raw, index, total, attachment, baseName, usedNames, claimedIds = new Set(), senderName, senderAddress, getOneDriveUrl, pageNumbers = [], text = '' }) {
  const fail = (reason, reasonCode) => ({ status: 'failed', fileName: attachment.name, reason, reasonCode, pages: pageNumbers });

  // The PDF's own printed date is not when we processed it (that is processed_at), so it is not kept.
  stripPrintedFields(raw);

  const firstString = (...keys) => {
    for (const key of keys) {
      const value = cleanString(typeof raw[key] === 'object' ? null : raw[key]);
      if (value) return value;
    }
    return null;
  };

  // The name is the attachment filename exactly as received (the AI's name varies from run to run). Several documents
  // found in one PDF all carry that same filename - nothing is appended or renamed.
  const documentName = baseName;

  // The whole AI response is kept as extracted_data; a few well-known keys are
  // also copied into dedicated columns.
  const doc = {
    extracted_data: raw,
    document_name: documentName,
    file_name: attachment.name,
    registration_date: cleanDate(raw.registration_date) || cleanDate(raw.issue_date) || cleanDate(raw.date_of_issue),
    expiry_date: cleanDate(raw.expiry_date),
    owner_name: firstString('company_name', 'owner_name', 'owner', 'company'),
    document_type: firstString('document_type') || 'general',
    cr_no: findCrNo(raw),
    license_no: findLicenseNo(raw),
    document_number: firstString('document_number', 'registration_number', 'license_number', 'certificate_number', 'reference_number', 'reference_no', 'policy_number', 'policy_no'),
    issuing_authority: firstString('issuing_authority'),
    // Whoever emailed the document (read-only). The responsible person is left empty until someone is assigned.
    sent_by: senderAddress || null,
    responsible_person: null,
  };

  // The AI sometimes leaves the numbers out: read them from the document's own text.
  if (!doc.cr_no && !doc.license_no && text) {
    const found = findIdentifiersInText(text);
    doc.license_no = found.licenseNos[0] || null;
    doc.cr_no = found.crNos[0] || null;
    // Neither number: a reference / policy / certificate / document number identifies it.
    if (!doc.license_no && !doc.cr_no && !doc.document_number) doc.document_number = found.referenceNos[0] || null;
  }

  // A document is registered before it expires: when the AI returns the two dates the wrong way round, put them right.
  if (doc.registration_date && doc.expiry_date && doc.registration_date > doc.expiry_date) {
    [doc.registration_date, doc.expiry_date] = [doc.expiry_date, doc.registration_date];
    doc.extracted_data = { ...raw, registration_date: doc.registration_date, expiry_date: doc.expiry_date };
  }

  // The AI sometimes can't find an owner - fall back to whoever sent the email.
  if (isUnknownOwner(doc.owner_name)) {
    doc.owner_name = senderName || null;
  }

  // The AI spells the same company slightly differently between runs: trim, collapse repeated spaces and drop
  // trailing periods (W.L.L. -> W.L.L) so the Company filter doesn't list one company several times.
  if (doc.owner_name) {
    doc.owner_name = String(doc.owner_name).replace(/\s+/g, ' ').replace(/[.\s]+$/, '').trim() || null;
    // Same company spelled differently ("AL JUMAN" / "ALJUMAN"): use the spelling already stored.
    if (doc.owner_name) {
      const known = await pool.query(
        `SELECT company_name FROM assets
         WHERE company_name IS NOT NULL AND REGEXP_REPLACE(UPPER(company_name), '[\\s.]+', '', 'g') = $1
         GROUP BY company_name ORDER BY COUNT(*) DESC, LENGTH(company_name) DESC LIMIT 1`,
        [doc.owner_name.replace(/[\s.]+/g, '').toUpperCase()]
      );
      if (known.rows[0]) doc.owner_name = known.rows[0].company_name;
    }
  }

  // Keep the stored extraction consistent with the chosen name, so it can't
  // differ between runs when documents are matched against each other.
  raw.document_name = doc.document_name;

  // A CR No, a License No or - for documents that have neither (a policy, a certificate) - a reference number identifies the document.
  // With none of them it cannot be told apart from others (duplicate check) or recorded.
  if (!doc.cr_no && !doc.license_no && !doc.document_number) {
    console.warn(`[FAIL] "${attachment.name}"${pageNumbers.length ? ` ${describePages(pageNumbers)}` : ''}: no CR No, License No or reference number found`);
    return {
      ...fail('No CR No, License No or reference number was found in this document, so it cannot be recorded or checked for duplicates.', 'no_identifier'),
      documentName: doc.document_name, company: doc.owner_name,
    };
  }

  // Expiry date: as printed, or calculated from the issue date + the validity period the document states, or - when neither
  // is possible - missing. A document without an expiry date is NOT failed: it is saved, flagged "Expiry date missing", and
  // the sender is asked to add the date. The note keeps how a calculated date was worked out (or why it is missing).
  const hints = ['validity_period', 'validity', 'valid_for', 'period_of_validity', 'validity_term'].map((key) => raw[key]).filter((value) => typeof value === 'string');
  const resolved = resolveExpiry({ statedExpiry: doc.expiry_date, issueDate: doc.registration_date, text, hints });
  doc.expiry_date = resolved.expiryDate;
  doc.expiry_source = resolved.source;
  doc.expiry_note = resolved.source === 'calculated' ? resolved.note : resolved.source === 'missing' ? resolved.reason : null;
  if (resolved.source !== 'stated') {
    console.log(`"${attachment.name}"${pageNumbers.length ? ` ${describePages(pageNumbers)}` : ''}: expiry ${resolved.source} - ${doc.expiry_note}`);
  }

  const base = {
    fileName: attachment.name, documentName: doc.document_name, company: doc.owner_name, expiry: doc.expiry_date,
    pages: pageNumbers, licenseNo: doc.license_no, crNo: doc.cr_no, issueDate: doc.registration_date,
    referenceNo: !doc.license_no && !doc.cr_no ? doc.document_number : null,
    expirySource: doc.expiry_source, expiryNote: doc.expiry_note,
  };

  // Already expired (before today, Bahrain time): not saved. A missing expiry is never treated as expired.
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bahrain' }).format(new Date());
  if (doc.expiry_date && doc.expiry_date < today) {
    console.warn(`[FAIL] already expired: "${doc.document_name}" (expiry date: ${formatDMY(doc.expiry_date)}${doc.expiry_source === 'calculated' ? `, calculated: ${doc.expiry_note}` : ''}) - not saved`);
    return { ...fail('already expired', 'expired'), ...base };
  }

  // Documents handled earlier in this same run are already in the database
  // (each record is committed before the next one is checked), so this also
  // catches the same document attached twice, or sent in several emails.
  const existing = await findExistingDocument(doc.extracted_data, doc.document_name, doc.sent_by, doc, claimedIds);
  if (existing) claimedIds.add(existing.id);

  // Already in the system: nothing is saved and the sender is told (renewals go through the administrator).
  // AUTO_RENEW_ON_NEWER_EXPIRY lets a re-sent document with a different expiry date update the stored record instead.
  if (existing && !(AUTO_RENEW_ON_NEWER_EXPIRY && doc.expiry_date && existing.expiryDate !== doc.expiry_date)) {
    console.log(
      `Duplicate document detected: "${doc.document_name}" matches existing document #${existing.id} "${existing.name}" by ${existing.matchedBy} (${existing.matchedValue}) - not saved`
    );
    return {
      ...base,
      status: 'duplicate',
      identifier: doc.license_no || doc.cr_no || doc.document_number || null,
      processedAt: existing.processedAt || null,
      existingId: existing.id,
      existingName: existing.name,
      matchedBy: existing.matchedBy,
    };
  }

  const oneDriveUrl = await getOneDriveUrl(doc);

  if (existing) {
    await updateExistingDocument(existing.id, doc, oneDriveUrl);
  } else {
    claimedIds.add(await createNewDocument(doc, oneDriveUrl));
  }

  const status = existing ? 'updated' : 'created';
  console.log(
    `Processed document: ${doc.document_name} from ${doc.owner_name || 'Unknown owner'} — Action: ${status} — Expiry: ${doc.expiry_date || 'MISSING'} (${doc.expiry_source}) — OneDrive: ${oneDriveUrl || 'null'}`
  );
  return { ...base, status };
}

// Why a document failed, in words for the sender (no file name - the summary shows that separately).
function failureReason(result) {
  switch (result.reasonCode) {
    case 'scanned':
      return 'This is a scanned image PDF. Please use a text-searchable PDF version and resend.';
    case 'ocr_killed':
      return 'OCR processing failed (memory limit) — try splitting the PDF into smaller files';
    case 'low_quality':
      return 'Scan quality too low — please rescan at minimum 300 DPI and send again';
    case 'invalid_json':
      return 'Could not read document content. Please resend.';
    case 'expired':
      return `Document '${result.documentName}' was not processed — it is already expired (expiry date: ${formatDMY(result.expiry)}${result.expirySource === 'calculated' ? `, calculated: ${result.expiryNote}` : ''}). Please submit a valid, current document.`;
    case 'no_expiry':
      return 'No expiry date found in document. Please ensure the document contains a visible expiry date.';
    default:
      return result.reason || 'Unknown error';
  }
}

const DUPLICATE_SUBJECT = 'Document Processing Failed – Duplicate Document';
// Shown in the UI when a manually submitted document is rejected as a duplicate.
const DUPLICATE_UI_MESSAGE = 'This document has already been processed. A notification has been sent.';

function formatDMYHM(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Bahrain', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })
      .formatToParts(date)
      .map((part) => [part.type, part.value])
  );
  return `${parts.day}/${parts.month}/${parts.year} ${parts.hour === '24' ? '00' : parts.hour}:${parts.minute}`;
}

function buildDuplicateEmail({ documentName, fileName }) {
  const name = documentName || fileName || 'Unknown document';
  return {
    subject: DUPLICATE_SUBJECT,
    content:
      `<p>This document <b>${escapeHtml(name)}</b> already exists in the system. ` +
      `If this is a renewal or update, please contact the administrator.</p>`,
  };
}

// Addresses of a Graph recipient list.
const addressesOf = (recipients) => (recipients || []).map((r) => r.emailAddress?.address).filter(Boolean);

// Unique (case-insensitive) addresses, leaving out the service account itself and anything in `exclude`.
function uniqueAddresses(addresses, exclude = []) {
  const skip = new Set([String(process.env.SERVICE_ACCOUNT_EMAIL || '').toLowerCase(), ...exclude.map((a) => a.toLowerCase())]);
  const seen = new Map();
  for (const address of addresses) {
    const key = String(address || '').toLowerCase();
    if (key && !skip.has(key) && !seen.has(key)) seen.set(key, address);
  }
  return [...seen.values()];
}

// Emails the submitter that their document is a duplicate. `toAddress` is one address or a list (the sender plus
// everyone the original email was addressed to). Never throws; returns true when sent.
async function sendDuplicateEmail(toAddress, info, override = null) {
  const to = uniqueAddresses([].concat(toAddress || []));
  if (to.length === 0) return false;

  const { subject, content } = override || buildDuplicateEmail(info);
  try {
    await graphRequest(
      'POST',
      `/users/${serviceAccount()}/sendMail`,
      {
        message: {
          subject,
          body: { contentType: 'HTML', content },
          toRecipients: to.map((address) => ({ emailAddress: { address } })),
        },
        saveToSentItems: 'true',
      },
      'app'
    );
    console.log(`Duplicate-document email sent to ${to.join(', ')} (${info.documentName || info.fileName})`);
    return true;
  } catch (error) {
    console.warn(`Could not send duplicate-document email to ${to.join(', ')}: ${error.message}`);
    return false;
  }
}

// "License No 123 · CR No 456" for a result (whatever the document carries).
function identifierText(result) {
  const parts = [];
  if (result.licenseNo) parts.push(`License No ${result.licenseNo}`);
  if (result.crNo) parts.push(`CR No ${result.crNo}`);
  if (result.referenceNo) parts.push(`Reference No ${result.referenceNo}`);
  return parts.join(' · ') || result.identifier || null;
}

// How one document is reported: label, colours and an icon. Duplicates count as failures (with their own reason).
const OUTCOMES = {
  success: { label: 'Success', icon: '✅', solid: '#16a34a', tint: '#f0fdf4', line: '#bbf7d0' },
  needs_expiry: { label: 'Success, please add expiry date', icon: '✅', solid: '#ca8a04', tint: '#fefce8', line: '#fde68a' },
  calculated: { label: 'Success, expiry calculated', icon: '✅', solid: '#2563eb', tint: '#eff6ff', line: '#bfdbfe' },
  duplicate: { label: 'Failed, duplicate', icon: '⚠️', solid: '#ea580c', tint: '#fff7ed', line: '#fed7aa' },
  failed: { label: 'Failed', icon: '❌', solid: '#dc2626', tint: '#fef2f2', line: '#fecaca' },
};

function outcomeOf(result) {
  if (result.status === 'failed') return 'failed';
  if (result.status === 'duplicate') return 'duplicate';
  if (result.expirySource === 'missing') return 'needs_expiry';
  if (result.expirySource === 'calculated') return 'calculated';
  return 'success';
}

// Why a duplicate was refused, naming the record that already exists.
function duplicateReason(result) {
  const existing = result.existingName ? `"${result.existingName}"${result.existingId ? ` (record #${result.existingId})` : ''}` : 'a record already in the system';
  const matched = { license_no: 'the same License No', cr_no: 'the same CR No', document_number: 'the same Reference No', 'name + sent by': 'the same document name from the same sender' }[result.matchedBy];
  return `Duplicate: this document already exists in the system as ${existing}${matched ? `, matched by ${matched}` : ''}. If it is a renewal or update, please contact the administrator.`;
}

// The summary for one sender: for every PDF they sent, a section per document found in it, in page order.
// Table layout with inline styles only, so Outlook renders it.
// results: [{ status, fileName, documentName, pages, company, licenseNo, crNo, issueDate, expiry, expirySource, expiryNote, reasonCode, reason, ... }]
function buildSummaryEmail(results, { subject: originalSubject = null } = {}) {
  const count = (outcome) => results.filter((r) => outcomeOf(r) === outcome).length;
  const failed = count('failed');
  const duplicates = count('duplicate');
  const needsExpiry = count('needs_expiry');
  const added = results.filter((r) => r.status === 'created').length;
  const renewed = results.filter((r) => r.status === 'updated').length;
  const saved = added + renewed;

  const totalLine =
    `Total: ${results.length} document${results.length === 1 ? '' : 's'} processed — ${added} new, ` +
    (renewed ? `${renewed} updated, ` : '') +
    `${duplicates} duplicate${duplicates === 1 ? '' : 's'}, ${failed} failed` +
    (needsExpiry ? ` — ${needsExpiry} need${needsExpiry === 1 ? 's' : ''} an expiry date` : '');

  const font = "font-family:'Segoe UI',Arial,Helvetica,sans-serif;";
  const row = (label, value, color = '#1f2937') =>
    `<tr><td valign="top" style="padding:2px 12px 2px 0;${font}font-size:13px;color:#6b7280;white-space:nowrap;">${escapeHtml(label)}</td>` +
    `<td valign="top" style="padding:2px 0;${font}font-size:13px;color:${color};">${value}</td></tr>`;

  const renderDocument = (r) => {
    const outcome = OUTCOMES[outcomeOf(r)];
    const name = r.documentName || r.fileName || 'Unknown document';
    const identifier = identifierText(r);
    const pages = r.pages && r.pages.length ? describePages(r.pages) : null;

    const issue = r.issueDate ? escapeHtml(formatDMY(r.issueDate)) : '<span style="color:#9ca3af;">Not found</span>';
    let expiry;
    if (r.expiry) {
      expiry = escapeHtml(formatDMY(r.expiry));
      if (r.expirySource === 'calculated') expiry += ` <span style="color:#2563eb;">(calculated: ${escapeHtml(r.expiryNote || '')})</span>`;
    } else if (r.status === 'failed' && !r.expirySource) {
      expiry = '';
    } else {
      expiry = '<span style="color:#b45309;font-weight:bold;">Not found</span>';
    }

    const rows = [
      row('Document', escapeHtml(name) + (pages ? ` <span style="color:#6b7280;">(${escapeHtml(pages)})</span>` : '')),
      r.company ? row('Company', escapeHtml(r.company)) : '',
      identifier ? row('Identifier', escapeHtml(identifier)) : '',
      r.status === 'failed' && !r.issueDate && !expiry ? '' : row('Issue date', issue),
      expiry === '' ? '' : row('Expiry date', expiry),
    ].join('');

    let note = '';
    if (outcomeOf(r) === 'needs_expiry') {
      note =
        `<tr><td style="padding:8px 14px 2px 14px;${font}font-size:13px;font-weight:bold;color:#92400e;">` +
        `Please add the expiry date for this document: ${escapeHtml(name)}${identifier ? ` (${escapeHtml(identifier)})` : ''}.</td></tr>` +
        (r.expiryNote ? `<tr><td style="padding:0 14px 2px 14px;${font}font-size:12px;color:#6b7280;">Why: ${escapeHtml(r.expiryNote)}</td></tr>` : '');
    } else if (outcomeOf(r) === 'duplicate') {
      note = `<tr><td style="padding:8px 14px 2px 14px;${font}font-size:13px;color:#9a3412;">${escapeHtml(duplicateReason(r))}</td></tr>`;
    } else if (outcomeOf(r) === 'failed') {
      note = `<tr><td style="padding:8px 14px 2px 14px;${font}font-size:13px;color:#991b1b;"><b>Reason:</b> ${escapeHtml(failureReason(r))}</td></tr>`;
    }

    return (
      `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 10px 0;border-collapse:collapse;">` +
      `<tr><td bgcolor="${outcome.solid}" style="background-color:${outcome.solid};color:#ffffff;padding:8px 14px;${font}font-size:14px;font-weight:bold;">${outcome.icon} ${escapeHtml(outcome.label)}</td></tr>` +
      `<tr><td bgcolor="${outcome.tint}" style="background-color:${outcome.tint};padding:8px 14px;border:1px solid ${outcome.line};border-top:0;">` +
      `<table role="presentation" cellpadding="0" cellspacing="0" border="0">${rows}</table></td></tr>${note ? `<tr><td bgcolor="${outcome.tint}" style="background-color:${outcome.tint};border:1px solid ${outcome.line};border-top:0;padding-bottom:8px;"><table role="presentation" cellpadding="0" cellspacing="0" border="0">${note}</table></td></tr>` : ''}</table>`
    );
  };

  // PDFs in the order they came; each PDF's documents in page order.
  const files = [];
  for (const r of results) {
    const key = r.fileName || r.documentName || 'Unknown file';
    let file = files.find((entry) => entry.key === key);
    if (!file) files.push((file = { key, items: [] }));
    file.items.push(r);
  }
  const sections = files
    .map(
      (file) =>
        `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 6px 0;"><tr><td style="padding:6px 0;${font}font-size:14px;font-weight:bold;color:#1f2937;border-bottom:2px solid #e5e7eb;">` +
        `📎 ${escapeHtml(file.key)}${file.items.length > 1 ? ` <span style="font-weight:normal;color:#6b7280;">— ${file.items.length} documents found</span>` : ''}</td></tr></table>` +
        file.items.map(renderDocument).join('')
    )
    .join('');

  const intro = originalSubject
    ? `Result of processing the ${results.length} document${results.length === 1 ? '' : 's'} in your email &ldquo;${escapeHtml(originalSubject)}&rdquo;:`
    : `Result of processing the ${results.length} document${results.length === 1 ? '' : 's'} received from you:`;
  const content =
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#ffffff" style="background-color:#ffffff;"><tr><td align="center" style="padding:16px;">` +
    `<table role="presentation" width="640" cellpadding="0" cellspacing="0" border="0" style="width:640px;max-width:100%;"><tr><td style="${font}font-size:14px;color:#1f2937;padding-bottom:14px;">${intro}</td></tr>` +
    `<tr><td>${sections}</td></tr>` +
    `<tr><td style="${font}font-size:14px;font-weight:bold;color:#1f2937;padding:6px 0 0 0;">${escapeHtml(totalLine)}</td></tr></table></td></tr></table>`;

  const parts = [
    saved ? `${saved} saved` : null,
    needsExpiry ? `${needsExpiry} need${needsExpiry === 1 ? 's' : ''} an expiry date` : null,
    duplicates ? `${duplicates} duplicate${duplicates === 1 ? '' : 's'}` : null,
    failed ? `${failed} failed` : null,
  ].filter(Boolean);
  return {
    subject: `Document Processing Complete — ${parts.join(', ') || 'nothing to process'}${originalSubject ? ` (Re: ${originalSubject})` : ''}`,
    content,
  };
}

// Sends ONE summary email per unique sender at the end of a run, covering all of that sender's documents across every email
// they sent in that run (each PDF with a section per document found in it). Never throws.
// entries: [{ id, subject, result, to }] queued as PDFs were processed.
// Returns the ids of the entries that are done (summary sent, or deliberately not sent); a sender whose send failed is left out
// so its entries stay queued and are retried on the next run.
async function sendSummaryEmails(entriesBySender) {
  const ownAddress = String(process.env.SERVICE_ACCOUNT_EMAIL || '').toLowerCase();
  const doneIds = [];

  for (const [senderAddress, entries] of entriesBySender) {
    // Avoid mailing ourselves (and a possible reply loop).
    if (senderAddress.toLowerCase() === ownAddress) {
      console.log(`Summary not sent: the documents came from the processing mailbox itself (${senderAddress})`);
      doneIds.push(...entries.map((entry) => entry.id));
      continue;
    }

    const results = entries.map((entry) => entry.result);

    // To = the sender plus everyone their emails were addressed to (merged over all of this sender's emails, unique,
    // case-insensitive). The service account is never included, nor anyone twice. Nobody is CC'd.
    const toAddresses = uniqueAddresses([senderAddress, ...entries.flatMap((entry) => entry.to || [])]);
    const { subject, content } = buildSummaryEmail(results);

    try {
      await graphRequest(
        'POST',
        `/users/${serviceAccount()}/sendMail`,
        {
          message: {
            subject,
            body: { contentType: 'HTML', content },
            toRecipients: toAddresses.map((address) => ({ emailAddress: { address } })),
          },
          saveToSentItems: 'true',
        },
        'app'
      );
      console.log(`Summary email sent to ${senderAddress} (${results.length} document${results.length === 1 ? '' : 's'}, ${toAddresses.length} To)`);
      doneIds.push(...entries.map((entry) => entry.id));
    } catch (error) {
      console.warn(`Could not send summary email to ${senderAddress} (will retry on the next run): ${error.message}`);
    }
  }
  return doneIds;
}

// Results waiting for their summary email. They are saved as each email is processed, so a restart or crash in the middle
// of a long run (OCR can take minutes per PDF) no longer loses the summary: the next run sends what is left.
async function flushSummaryQueue() {
  await pool.query(`DELETE FROM document_summary_queue WHERE created_at < NOW() - INTERVAL '3 days'`);
  const { rows } = await pool.query(`SELECT id, sender, subject, recipients, result FROM document_summary_queue ORDER BY id`);
  if (rows.length === 0) return;

  const entriesBySender = new Map();
  for (const row of rows) {
    if (!entriesBySender.has(row.sender)) entriesBySender.set(row.sender, []);
    entriesBySender.get(row.sender).push({ id: row.id, subject: row.subject, result: row.result, to: row.recipients || [] });
  }
  const doneIds = await sendSummaryEmails(entriesBySender);
  if (doneIds.length > 0) {
    await pool.query(`DELETE FROM document_summary_queue WHERE id = ANY($1::int[])`, [doneIds]);
  }
}

// Emails already handled, keyed by the Internet Message-ID (stable even if the same mail is delivered or moved again).
let processedEmailsReady = false;
async function ensureProcessedEmailsTable() {
  if (processedEmailsReady) return;
  await pool.query(
    `CREATE TABLE IF NOT EXISTS processed_emails (
       message_id VARCHAR PRIMARY KEY, subject VARCHAR, sender VARCHAR, processed_at TIMESTAMP DEFAULT NOW()
     )`
  );
  await pool.query(
    `CREATE TABLE IF NOT EXISTS document_summary_queue (
       id SERIAL PRIMARY KEY, sender VARCHAR NOT NULL, subject VARCHAR, recipients JSONB, result JSONB NOT NULL, created_at TIMESTAMP DEFAULT NOW()
     )`
  );
  processedEmailsReady = true;
}

async function wasEmailProcessed(messageId) {
  if (!messageId) return false;
  const { rows } = await pool.query('SELECT 1 FROM processed_emails WHERE message_id = $1', [messageId]);
  return rows.length > 0;
}

async function markEmailProcessed(messageId, subject, sender) {
  if (!messageId) return;
  await pool.query(
    'INSERT INTO processed_emails (message_id, subject, sender) VALUES ($1, $2, $3) ON CONFLICT (message_id) DO NOTHING',
    [messageId, subject || null, sender || null]
  );
}

async function processDocumentEmails() {
  const summary = { emailsChecked: 0, pdfsFound: 0, documentsUpdated: 0, documentsCreated: 0, needExpiryDate: 0, duplicates: 0, failed: 0 };

  if (isProcessing) {
    console.log('Already processing — skipping this run');
    return { ...summary, alreadyRunning: true };
  }
  isProcessing = true;

  try {
    await cleanupOrphanedTempFiles();

    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const filter = `hasAttachments eq true and isRead eq false and receivedDateTime ge ${since}`;
    const data = await graphRequest(
      'GET',
      `/users/${serviceAccount()}/messages?$filter=${encodeURIComponent(filter)}&$select=id,internetMessageId,subject,from,toRecipients&$top=50`,
      null,
      'app'
    );
    const messages = Array.isArray(data?.value) ? data.value : [];
    summary.emailsChecked = messages.length;
    console.log(`[RUN] ${messages.length} unread email(s) with attachments received since ${since.slice(0, 10)} (last 30 days)`);
    messages.forEach((m) => console.log(`[RUN]   "${m.subject}" from ${m.from?.emailAddress?.address || 'unknown'}`));

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

    await ensureProcessedEmailsTable();
    // Summaries a previous run did not get to send (restart / crash mid-run).
    await flushSummaryQueue().catch((error) => console.warn(`Could not send queued summary emails: ${error.message}`));

    for (const message of messages) {
      try {
        // The same email arriving again (same Message-ID) is skipped before any download or AI call.
        const messageKey = message.internetMessageId || message.id;
        if (await wasEmailProcessed(messageKey)) {
          console.log(`[SKIP] "${message.subject}" — reason: already processed earlier (Message-ID ${messageKey}); marked as read`);
          await graphRequest('PATCH', `/users/${serviceAccount()}/messages/${encodeURIComponent(message.id)}`, { isRead: true }, 'app');
          continue;
        }

        const attachmentList = await graphRequest(
          'GET',
          `/users/${serviceAccount()}/messages/${encodeURIComponent(message.id)}/attachments?$select=id,name,contentType,isInline,size`,
          null,
          'app'
        );
        const pdfs = (attachmentList?.value || []).filter(
          (a) => /pdf/i.test(a.contentType || '') || /\.pdf$/i.test(a.name || '')
        );

        // Emails without PDFs are left untouched for the general email processor.
        if (pdfs.length === 0) {
          const found = (attachmentList?.value || []).map((a) => `${a.name} (${a.contentType || 'no type'}${a.isInline ? ', inline' : ''}, ${a.size ?? '?'} bytes)`);
          console.log(`[SKIP] "${message.subject}" — reason: no PDF attachment (name must end in .pdf or type contain pdf). Attachments: ${found.length ? found.join('; ') : 'none returned by Graph'}`);
          continue;
        }

        summary.pdfsFound += pdfs.length;
        console.log(`[EMAIL] "${message.subject}" — ${pdfs.length} PDF(s): ${pdfs.map((p) => p.name).join('; ')}`);
        const senderAddress = message.from?.emailAddress?.address || null;

        for (const attachment of pdfs) {
          let results;
          try {
            results = await processPdf(message.id, attachment, message.from?.emailAddress?.name || message.from?.emailAddress?.address || null, message.from?.emailAddress?.address || null);
          } catch (error) {
            console.error(`Failed to process PDF "${attachment.name}" in "${message.subject}":`, error.message);
            results = [{ status: 'failed', fileName: attachment.name, reason: error.message }];
          }

          for (const result of results) {
          console.log(`[RESULT] "${attachment.name}" -> ${result.status}${result.reason ? ` (${result.reason})` : ''}`);

          // Duplicates (nothing was saved) are reported in the summary email, in their own section.
          if (senderAddress) {
            await pool.query(
              `INSERT INTO document_summary_queue (sender, subject, recipients, result) VALUES ($1, $2, $3, $4)`,
              [senderAddress, message.subject || null, JSON.stringify(addressesOf(message.toRecipients)), JSON.stringify(result)]
            );
          } else {
            console.warn(`No sender address on "${message.subject}", it will not be included in a summary email`);
          }
          if (result.status === 'updated') summary.documentsUpdated++;
          else if (result.status === 'created') {
            summary.documentsCreated++;
            if (result.expirySource === 'missing') summary.needExpiryDate++;
          }
          else if (result.status === 'duplicate') summary.duplicates++;
          else summary.failed++;
          }
        }

        await markEmailProcessed(messageKey, message.subject, senderAddress);
        await graphRequest('PATCH', `/users/${serviceAccount()}/messages/${encodeURIComponent(message.id)}`, { isRead: true }, 'app');
      } catch (error) {
        summary.failed++;
        console.error(`Failed to process email "${message.subject}":`, error.message);
      }
    }

    await flushSummaryQueue();
  } finally {
    isProcessing = false;
  }

  console.log('Document email processing summary:');
  console.log(`  Total emails checked: ${summary.emailsChecked}`);
  console.log(`  Total PDFs found: ${summary.pdfsFound}`);
  console.log(`  Total documents updated: ${summary.documentsUpdated}`);
  console.log(`  Total documents created: ${summary.documentsCreated} (${summary.needExpiryDate} without an expiry date)`);
  console.log(`  Total duplicates skipped: ${summary.duplicates}`);
  console.log(`  Total failed: ${summary.failed}`);

  return summary;
}

module.exports = { flushSummaryQueue, buildSummaryEmail, processExtractedDocument, splitDocuments, DUPLICATE_SUBJECT, DUPLICATE_UI_MESSAGE, buildDuplicateEmail, sendDuplicateEmail, formatDMYHM, documentNameFromFilename, processDocumentEmails, removeDuplicateDocuments, compareExtractedData, isDateKey, looksLikeDate, parseJsonObject, isUnknownOwner, cleanupOrphanedTempFiles };
