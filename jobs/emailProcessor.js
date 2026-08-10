const path = require('path');
const dotenv = require('dotenv');
const cron = require('node-cron');
const Groq = require('groq-sdk');
const { pool } = require('../db');
const { graphRequest } = require('../graph/client');

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const serviceAccountEmail = process.env.SERVICE_ACCOUNT_EMAIL;

function decodeHtmlEntities(value) {
  return String(value || '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

function stripHtmlTags(value) {
  return String(value || '')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ');
}

function cleanEmailBody(body) {
  let text = body || '';
  text = text.replace(/<br\s*\/?>/gi, '\n');
  text = stripHtmlTags(text);
  text = decodeHtmlEntities(text);
  text = text.replace(/\r/g, '\n');

  const lines = text.split('\n');
  const cleanedLines = [];
  let inSignature = false;
  let hasContent = false;

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (!line) {
      if (hasContent) {
        cleanedLines.push('');
      }
      continue;
    }

    if (/^(>|\s*>)/.test(line)) {
      continue;
    }

    if (/^(on\s+.+\bwrote:|from:|to:|cc:|subject:|sent:|date:)/i.test(line)) {
      continue;
    }

    if (/^(--|__|[-]{3,}|[=]{3,})$/.test(line)) {
      inSignature = true;
      continue;
    }

    if (inSignature) {
      const lowered = line.toLowerCase();
      if (/^(best|thanks|regards|kind regards|sincerely|cheers|thanks and regards|with appreciation|respectfully|warm regards)\b/.test(lowered)) {
        continue;
      }
      if (/^[\w.+-]+@[\w.-]+\.[a-z]{2,}$/i.test(line)) {
        continue;
      }
      if (/^(phone|mobile|office|fax|www\.)/i.test(line)) {
        continue;
      }
    }

    hasContent = true;
    cleanedLines.push(line.replace(/\s+/g, ' ').trim());
  }

  return cleanedLines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
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
    console.warn('Could not parse action items JSON: no JSON array found in response');
    return [];
  }

  const candidate = text.slice(start, end + 1);

  try {
    return JSON.parse(candidate);
  } catch (error) {
    console.warn('Could not parse action items JSON:', error);
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
        console.error('Email skipped due to rate limit');
        throw retryError;
      }
    }

    throw error;
  }
}

async function summarizeEmail(cleanedText) {
  const prompt = [
    'Summarize this maintenance email in 3 sentences focusing on what action is needed, which equipment or location is involved, and who needs to do it.',
    'Also classify it as exactly one of: Maintenance Request, Work Report, Vendor, Escalation, Inquiry, Other.',
    'Return only a valid JSON object with fields summary and category.'
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

  if (typeof actionItem.due_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(actionItem.due_date)) {
    body.dueDateTime = `${actionItem.due_date}T00:00:00Z`;
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
      [summaryId, normalized.title, normalized.assigned_to, normalized.due_date || null, normalized.estimated_hours, plannerTaskId || null]
    );

    savedItems.push(result.rows[0]);
  }

  return savedItems;
}

async function processEmailContent(emailBody, options = {}) {
  const cleanedText = cleanEmailBody(emailBody);

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
    dateReceived: options.dateReceived || null,
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
  const endpoint = `/users/${encodeURIComponent(serviceAccountEmail)}/messages?$filter=${encodeURIComponent(filter)}&$select=id,subject,body,receivedDateTime&$top=10`;
  const data = await graphRequest('GET', endpoint, null, 'app');
  const messages = Array.isArray(data?.value) ? data.value : [];
  const results = [];

  let processed = 0;
  let skipped = 0;
  let total = messages.length;

  for (const message of messages) {
    console.log(`Processing email number ${processed + 1} of ${total}`);

    try {
      const existing = await pool.query(
        'SELECT id FROM email_summaries WHERE email_message_id = $1 LIMIT 1',
        [message.id]
      );

      if (existing.rows.length) {
        continue;
      }

      const bodyContent = message.body?.content || '';
      const cleanedText = cleanEmailBody(bodyContent);

      if (!cleanedText) {
        await markEmailAsRead(message.id);
        continue;
      }

      const summaryResult = await summarizeEmail(cleanedText);
      const actionItems = await extractActionItems(cleanedText);
      const actionItemsArray = Array.isArray(actionItems) ? actionItems : [];

      const savedSummary = await saveSummaryToDatabase({
        messageId: message.id,
        sender: message.from?.emailAddress?.address || null,
        subject: message.subject || null,
        summaryText: summaryResult?.summary || null,
        category: summaryResult?.category || 'Other',
        dateReceived: message.receivedDateTime || null,
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
      console.error(`Email processing failed for message ${message?.id}:`, error);
      skipped++;
    } finally {
      try {
        await markEmailAsRead(message.id);
      } catch (markError) {
        console.error(`Failed to mark email ${message?.id} as read:`, markError);
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
      console.error('Email processor job failed:', error);
    }
  });
}

module.exports = {
  processEmails,
  processEmailContent,
  startEmailProcessor,
};
