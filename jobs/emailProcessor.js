const path = require('path');
const dotenv = require('dotenv');
const cron = require('node-cron');
const Groq = require('groq-sdk');
const { pool } = require('../db');
const { graphRequest } = require('../graph/client');

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const serviceAccountEmail = process.env.SERVICE_ACCOUNT_EMAIL;

function parseDateReceived(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

const MICROSOFT_SYSTEM_SENDER_PATTERNS = [
  'noreply@planner',
  'planner.office365.com',
  'noreply@microsoft.com',
  'teams.microsoft.com',
  'sharepoint.com',
  'onmicrosoft.com',
  'microsoft.com',
  'no-reply@microsoft',
  'notifications@microsoft',
];

function getSkipReason(message) {
  const senderEmail = (message.from?.emailAddress?.address || '').toLowerCase();

  const isMicrosoftSystemSender = MICROSOFT_SYSTEM_SENDER_PATTERNS.some((pattern) => senderEmail.includes(pattern));
  if (isMicrosoftSystemSender) {
    return `Skipping Microsoft system email from ${senderEmail}`;
  }

  return null;
}

function sanitizeDueDate(value) {
  if (!value) return null;
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (trimmed === 'null' || trimmed === 'undefined' || trimmed === '') return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return null;
  return trimmed;
}

function cleanEmailBody(message) {
  let body = '';

  if (message.body) {
    if (message.body.contentType === 'html' || message.body.contentType === 'HTML') {
      body = message.body.content || '';
      body = body.replace(/<style[\s\S]*?<\/style>/gi, '');
      body = body.replace(/<script[\s\S]*?<\/script>/gi, '');
      body = body.replace(/<[^>]+>/g, ' ');
      body = body.replace(/&nbsp;/gi, ' ');
      body = body.replace(/&amp;/gi, '&');
      body = body.replace(/&lt;/gi, '<');
      body = body.replace(/&gt;/gi, '>');
      body = body.replace(/&quot;/gi, '"');
    } else {
      body = message.body.content || '';
    }
  }

  if (!body || body.trim().length === 0) {
    if (message.bodyPreview) {
      body = message.bodyPreview;
    }
  }

  body = body.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  body = body.split('\n').map(line => line.trim()).filter(line => line.length > 0).join('\n');
  body = body.replace(/\n{3,}/g, '\n\n');
  return body.trim();
}

function parseJsonResponse(rawText) {
  const original = String(rawText || '');

  try {
    return JSON.parse(original);
  } catch (firstError) {
    let recovered = original
      .replace(/'/g, '"')
      .replace(/,(\s*[\]}])/g, '$1')
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();

    return JSON.parse(recovered);
  }
}

function parseJsonArrayResponse(rawText) {
  const text = String(rawText || '');
  const start = text.indexOf('[');
  const end = text.lastIndexOf(']');

  if (start === -1 || end === -1 || end < start) {
    console.error('Could not parse action items JSON: no JSON array found in response');
    return [];
  }

  const candidate = text.slice(start, end + 1);

  try {
    return JSON.parse(candidate);
  } catch (error) {
    console.error('Could not parse action items JSON:', error.message, error.stack);
    return [];
  }
}

async function callGroq(prompt, emailBody) {
  const apiKey = process.env.GROQ_API_KEY;
  const groq = new Groq({ apiKey });
  const messages = [{ role: 'user', content: `${prompt}\n\nEmail content:\n${emailBody}` }];

  try {
    const completion = await groq.chat.completions.create({ messages, model: 'llama-3.1-8b-instant' });
    return completion.choices[0].message.content;
  } catch (error) {
    if (error?.status === 429) {
      console.warn('Rate limit hit, waiting 30 seconds then retry');
      await sleep(30000);

      try {
        const retryCompletion = await groq.chat.completions.create({ messages, model: 'llama-3.1-8b-instant' });
        return retryCompletion.choices[0].message.content;
      } catch (retryError) {
        console.error('Email skipped due to rate limit:', retryError.message, retryError.stack);
        throw retryError;
      }
    }

    console.error('Groq API call failed:', error.message, error.stack);
    throw error;
  }
}

async function summarizeEmail(cleanedText) {
  const prompt = [
    'Summarize this maintenance email in 3 sentences focusing on what action is needed, which equipment or location is involved, and who needs to do it.',
    'Classify this email into exactly one of these categories using these rules: Use Maintenance Request if the email reports a broken or malfunctioning piece of equipment that needs inspection or repair. Use Work Report if the email confirms that maintenance work has already been completed or provides a summary of finished tasks. Use Vendor if the email is from a supplier or contractor about quotations, deliveries, invoices, contracts, or spare parts. Use Escalation if the email uses urgent language, mentions management involvement, threatens consequences, or follows up on a previously unresolved issue. Use Inquiry if the email is asking a question or requesting information such as schedules, names, or dates without reporting a problem. Use Other for anything that does not clearly fit the above categories such as HR matters, administrative notices, or general announcements.',
    'Return only a valid JSON object with fields summary and category, where category is exactly one of the category names above with no other text.'
  ].join(' ');

  const responseText = await callGroq(prompt, cleanedText);
  return parseJsonResponse(responseText);
}

async function extractActionItems(cleanedText) {
  const prompt = [
    'Extract all action items from this email and return ONLY a valid JSON array where each item has fields title, assigned_to or null, due_date in YYYY-MM-DD format or null, estimated_hours as number or null.',
    'Return only the JSON array nothing else.'
  ].join(' ');

  const responseText = await callGroq(prompt, cleanedText);
  return parseJsonArrayResponse(responseText);
}

function normalizeActionItem(item) {
  return {
    title: item?.title || 'Follow up',
    assigned_to: item?.assigned_to || null,
    due_date: item?.due_date || null,
    estimated_hours: typeof item?.estimated_hours === 'number' ? item.estimated_hours : null,
  };
}

async function createPlannerTask(actionItem) {
  const planId = process.env.PLANNER_PLAN_ID;

  if (!planId) {
    return null;
  }

  const body = {
    planId,
    title: actionItem.title,
    assignments: {},
  };

  const sanitizedDueDate = sanitizeDueDate(actionItem.due_date);
  if (sanitizedDueDate) {
    body.dueDateTime = `${sanitizedDueDate}T00:00:00Z`;
    body.startDateTime = body.dueDateTime;
  }

  const createdTask = await graphRequest('POST', '/planner/tasks', body, 'app');
  return createdTask?.id || null;
}

async function markEmailAsRead(messageId) {
  if (!serviceAccountEmail || !messageId) {
    return;
  }

  await graphRequest('PATCH', `/users/${encodeURIComponent(serviceAccountEmail)}/messages/${messageId}`, { isRead: true }, 'app');
}

async function saveSummaryToDatabase({ messageId, sender, subject, summaryText, category, dateReceived }) {
  const result = await pool.query(
    `INSERT INTO email_summaries (email_message_id, sender, subject, summary_text, category, date_received)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [messageId, sender || null, subject || null, summaryText || null, category || null, dateReceived || null]
  );

  return result.rows[0];
}

async function saveActionItems(summaryId, actionItems) {
  const savedItems = [];

  for (const item of actionItems) {
    const normalized = normalizeActionItem(item);
    const plannerTaskId = await createPlannerTask(normalized);

    const result = await pool.query(
      `INSERT INTO email_action_items (email_summary_id, title, assigned_to, due_date, estimated_hours, planner_task_id)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [summaryId, normalized.title, normalized.assigned_to, sanitizeDueDate(item.due_date), normalized.estimated_hours, plannerTaskId || null]
    );

    savedItems.push(result.rows[0]);
  }

  return savedItems;
}

async function processEmailContent(emailBody, options = {}) {
  const cleanedText = cleanEmailBody({ body: { contentType: 'text', content: emailBody } });

  if (!cleanedText) {
    return {
      summary: '',
      category: 'Other',
      action_items: [],
      saved: false,
    };
  }

  const summaryResult = await summarizeEmail(cleanedText);
  const actionItems = await extractActionItems(cleanedText);
  const actionItemsArray = Array.isArray(actionItems) ? actionItems : [];

  const persistedSummary = await saveSummaryToDatabase({
    messageId: options.messageId || `manual-${Date.now()}`,
    sender: options.sender || null,
    subject: options.subject || null,
    summaryText: summaryResult?.summary || null,
    category: summaryResult?.category || 'Other',
    dateReceived: parseDateReceived(options.dateReceived),
  });

  if (persistedSummary?.id) {
    await saveActionItems(persistedSummary.id, actionItemsArray);
  }

  return {
    summary: summaryResult?.summary || '',
    category: summaryResult?.category || 'Other',
    action_items: actionItemsArray.map(normalizeActionItem),
    saved: Boolean(persistedSummary?.id),
  };
}

async function processEmails() {
  if (!serviceAccountEmail) {
    throw new Error('SERVICE_ACCOUNT_EMAIL is not configured');
  }

  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const filter = `isRead eq false and receivedDateTime ge ${yesterday}`;
  const endpoint = `/users/${encodeURIComponent(serviceAccountEmail)}/messages?$filter=${encodeURIComponent(filter)}&$select=id,subject,body,bodyPreview,receivedDateTime,from&$top=10`;
  const data = await graphRequest('GET', endpoint, null, 'app');
  const messages = Array.isArray(data?.value) ? data.value : [];
  const results = [];

  let processed = 0;
  let skipped = 0;
  let total = messages.length;

  for (let i = 0; i < messages.length; i++) {
    const message = messages[i];
    console.log(`Processing email number ${i + 1} of ${total}`);

    try {
      const skipReason = getSkipReason(message);
      if (skipReason) {
        console.log(skipReason);
        await markEmailAsRead(message.id);
        continue;
      }

      console.log(`Processing email from ${message.from?.emailAddress?.address || 'unknown sender'}`);

      const existing = await pool.query(
        'SELECT id FROM email_summaries WHERE email_message_id = $1 LIMIT 1',
        [message.id]
      );

      if (existing.rows.length) {
        continue;
      }

      const cleanedText = cleanEmailBody(message);

      if (!cleanedText) {
        await markEmailAsRead(message.id);
        continue;
      }

      const summaryResult = await summarizeEmail(cleanedText);
      const actionItems = await extractActionItems(cleanedText);
      const actionItemsArray = Array.isArray(actionItems) ? actionItems : [];

      const senderName = message.from?.emailAddress?.name || message.from?.emailAddress?.address || 'Unknown';
      const senderEmail = message.from?.emailAddress?.address || '';
      const sender = senderName !== senderEmail && senderName ? senderName + ' <' + senderEmail + '>' : senderEmail;

      const savedSummary = await saveSummaryToDatabase({
        messageId: message.id,
        sender: sender || null,
        subject: message.subject || null,
        summaryText: summaryResult?.summary || null,
        category: summaryResult?.category || 'Other',
        dateReceived: parseDateReceived(message.receivedDateTime),
      });

      if (savedSummary?.id) {
        await saveActionItems(savedSummary.id, actionItemsArray);
      }

      results.push({
        messageId: message.id,
        summary: summaryResult?.summary || '',
        category: summaryResult?.category || 'Other',
        actionItems: actionItemsArray.map(normalizeActionItem),
      });
      processed++;
    } catch (error) {
      console.error(`Email processing failed for message ${message?.id}:`, error.message, error.stack);
      skipped++;
    } finally {
      try {
        await markEmailAsRead(message.id);
      } catch (markError) {
        console.error(`Failed to mark email ${message?.id} as read:`, markError.message, markError.stack);
      }
    }

    await sleep(8000);
  }

  console.log(`Email processing complete. Processed ${processed} emails successfully. Skipped ${skipped} emails.`);

  return {
    processed: results.length,
    messages: results,
  };
}

function startEmailProcessor() {
  cron.schedule('*/30 * * * *', async () => {
    try {
      await processEmails();
    } catch (error) {
      console.error('Email processor job failed:', error.message, error.stack);
    }
  });
}

module.exports = {
  processEmails,
  processEmailContent,
  startEmailProcessor,
};
