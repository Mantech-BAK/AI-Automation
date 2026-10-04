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

const DOCUMENT_TYPES = ['License', 'Certificate', 'Permit', 'Approval', 'Registration', 'Other'];
const MAX_TEXT_CHARS = 20000;
const ONEDRIVE_FOLDER = 'Maintenance Documents';

const SYSTEM_PROMPT =
  'You are a document data extraction assistant. Extract the following fields from the document text and return ONLY valid JSON with no other text: ' +
  'document_name (string), company_name (string), document_type (string — one of: License, Certificate, Permit, Approval, Registration, Other), ' +
  'issue_date (string in YYYY-MM-DD format or null), expiry_date (string in YYYY-MM-DD format or null), document_number (string or null), ' +
  'issuing_authority (string or null). If a field cannot be found return null for that field. Return only the JSON object with no markdown or extra text.';

let running = false;

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

function parseJsonObject(rawText) {
  const text = String(rawText || '');
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end < start) {
    throw new Error('No JSON object found in Groq response');
  }
  return JSON.parse(text.slice(start, end + 1));
}

async function extractDocumentData(text) {
  const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: text.slice(0, MAX_TEXT_CHARS) },
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
         company_name = $3,
         document_number = $4,
         issuing_authority = $5,
         last_received_at = NOW(),
         onedrive_url = COALESCE($6, onedrive_url)
       WHERE id = $7`,
      [doc.expiry_date, doc.issue_date, doc.company_name, doc.document_number, doc.issuing_authority, oneDriveUrl, assetId]
    );

    if (oneDriveUrl) {
      await client.query(
        `INSERT INTO document_versions (asset_id, onedrive_url, expiry_date, issue_date, file_name) VALUES ($1, $2, $3, $4, $5)`,
        [assetId, oneDriveUrl, doc.expiry_date, doc.issue_date, buildFileName(doc.company_name, doc.document_name, doc.expiry_date)]
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
       type_id, responsible_person, site_location, estimated_duration_hours
     ) VALUES (
       $1, $2, $3, $4, $5,
       $6, $6, $7, NOW(),
       30, 365, NULL, $8,
       (SELECT id FROM asset_types WHERE name = 'Document' LIMIT 1), $9, 'Unassigned', 0
     ) RETURNING id`,
    [
      doc.document_name, doc.company_name, doc.document_type, doc.document_number, doc.issuing_authority,
      doc.expiry_date, doc.issue_date, oneDriveUrl, process.env.SERVICE_ACCOUNT_EMAIL,
    ]
  );

  if (oneDriveUrl) {
    await pool.query(
      `INSERT INTO document_versions (asset_id, onedrive_url, expiry_date, issue_date, file_name) VALUES ($1, $2, $3, $4, $5)`,
      [rows[0].id, oneDriveUrl, doc.expiry_date, doc.issue_date, buildFileName(doc.company_name, doc.document_name, doc.expiry_date)]
    );
  }
}

async function findExistingDocument(doc) {
  const { rows } = await pool.query(
    `SELECT id FROM assets
     WHERE LOWER(TRIM(equipment_name)) = LOWER(TRIM($1))
       AND LOWER(TRIM(COALESCE(company_name,''))) = LOWER(TRIM(COALESCE($2,'')))
       AND LOWER(TRIM(COALESCE(type_of_service,''))) = LOWER(TRIM(COALESCE($3,'')))
       AND LOWER(TRIM(COALESCE(document_number,''))) = LOWER(TRIM(COALESCE($4,'')))
       AND LOWER(TRIM(COALESCE(issuing_authority,''))) = LOWER(TRIM(COALESCE($5,'')))
     LIMIT 1`,
    [doc.document_name, doc.company_name, doc.document_type, doc.document_number, doc.issuing_authority]
  );
  return rows[0]?.id || null;
}

// Returns 'updated' | 'created' | 'skipped'. Throws on unexpected failures.
async function processPdf(messageId, attachment) {
  const attachmentUrl = `/users/${serviceAccount()}/messages/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(attachment.id)}`;
  const full = await graphRequest('GET', attachmentUrl, null, 'app');

  if (!full.contentBytes) {
    throw new Error(`Attachment "${attachment.name}" has no content`);
  }

  const pdfBuffer = Buffer.from(full.contentBytes, 'base64');
  const { text } = await pdfParse(pdfBuffer);

  if (!text || !text.trim()) {
    console.warn(`Cannot process PDF "${attachment.name}" — no extractable text (scanned image?)`);
    return 'skipped';
  }

  const raw = await extractDocumentData(text);
  const documentType = DOCUMENT_TYPES.find((t) => t.toLowerCase() === String(raw.document_type || '').toLowerCase()) || 'Other';
  const doc = {
    document_name: cleanString(raw.document_name) || attachment.name.replace(/\.pdf$/i, ''),
    company_name: cleanString(raw.company_name),
    document_type: documentType,
    issue_date: cleanDate(raw.issue_date),
    expiry_date: cleanDate(raw.expiry_date),
    document_number: cleanString(raw.document_number),
    issuing_authority: cleanString(raw.issuing_authority),
  };

  if (!doc.expiry_date) {
    console.warn(`Cannot process PDF — no expiry date found ("${attachment.name}")`);
    return 'skipped';
  }

  const oneDriveUrl = await uploadToOneDrive(pdfBuffer, doc.company_name, doc.document_name, doc.expiry_date);
  const existingId = await findExistingDocument(doc);

  if (existingId) {
    await updateExistingDocument(existingId, doc, oneDriveUrl);
  } else {
    await createNewDocument(doc, oneDriveUrl);
  }

  const action = existingId ? 'updated' : 'created';
  console.log(
    `Processed PDF: ${doc.document_name} from ${doc.company_name || 'Unknown company'} — Action: ${action} — Expiry: ${doc.expiry_date} — OneDrive: ${oneDriveUrl || 'null'}`
  );
  return action;
}

async function processDocumentEmails() {
  const summary = { emailsChecked: 0, pdfsFound: 0, documentsUpdated: 0, documentsCreated: 0, failed: 0, skipped: 0 };

  if (running) {
    console.log('Document email processing already in progress, skipping this run');
    return { ...summary, alreadyRunning: true };
  }
  running = true;

  try {
    const filter = 'hasAttachments eq true and isRead eq false';
    const data = await graphRequest(
      'GET',
      `/users/${serviceAccount()}/messages?$filter=${encodeURIComponent(filter)}&$select=id,subject&$top=20`,
      null,
      'app'
    );
    const messages = Array.isArray(data?.value) ? data.value : [];
    summary.emailsChecked = messages.length;

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
        let messageFailed = false;

        for (const attachment of pdfs) {
          try {
            const result = await processPdf(message.id, attachment);
            if (result === 'updated') summary.documentsUpdated++;
            else if (result === 'created') summary.documentsCreated++;
            else summary.skipped++;
          } catch (error) {
            messageFailed = true;
            summary.failed++;
            console.error(`Failed to process PDF "${attachment.name}" in "${message.subject}":`, error.message);
          }
        }

        // A failed PDF leaves the email unread so the next run retries it.
        if (!messageFailed) {
          await graphRequest('PATCH', `/users/${serviceAccount()}/messages/${encodeURIComponent(message.id)}`, { isRead: true }, 'app');
        }
      } catch (error) {
        summary.failed++;
        console.error(`Failed to process email "${message.subject}":`, error.message);
      }
    }
  } finally {
    running = false;
  }

  console.log('Document email processing summary:');
  console.log(`  Total emails checked: ${summary.emailsChecked}`);
  console.log(`  Total PDFs found: ${summary.pdfsFound}`);
  console.log(`  Total documents updated: ${summary.documentsUpdated}`);
  console.log(`  Total documents created: ${summary.documentsCreated}`);
  console.log(`  Total failed: ${summary.failed}`);
  if (summary.skipped) console.log(`  Skipped (no expiry date / no text): ${summary.skipped}`);

  return summary;
}

module.exports = { processDocumentEmails };
