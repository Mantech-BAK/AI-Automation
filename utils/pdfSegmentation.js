// Splits the pages of a PDF into the documents they contain, by document identity.
//
// A PDF may hold one document per page, one document over several pages, or any mix. Each page is looked at for
//   - its identifiers (licence numbers, CR numbers) read straight from the text,
//   - its title (the heading naming the kind of document, e.g. "Trade Licence"),
//   - a page marker ("Page 1 of 2", "صفحة 2 من 2"),
// and a new document starts where the identity changes. Pages that belong together stay together.
//
// Pure functions only (no I/O), so the rules are easy to test. Page numbers in the result are 1-based.

const { findIdentifiersInText, normalizeDigits } = require('./documentFields');

// A page with fewer visible characters than this has no readable text (image-only page, blank page, failed OCR).
const MIN_PAGE_CHARS = 30;

// Words that make a line a document title rather than a field or a letterhead.
const TITLE_WORDS =
  /certificate|licen[cs]e|permit|registration|authori[sz]ation|approval|attestation|\bcard\b|شهادة|رخصة|ترخيص|سجل|تصريح|بطاقة|إجازة/i;
const DATE_LABELS = /issue|expir|valid|تاريخ|صلاحية|انتهاء|إصدار/i;

const PAGE_MARKERS = [
  /page\s*(\d{1,3})\s*(?:of|\/|out\s+of)\s*(\d{1,3})/i,
  /صفحة\s*(\d{1,3})\s*(?:من|\/)\s*(\d{1,3})/,
  /^\s*(\d{1,2})\s*\/\s*(\d{1,2})\s*$/m,
];

const visibleChars = (text) => String(text || '').replace(/\s/g, '').length;
const squash = (value) => String(value || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');

function pageMarker(text) {
  for (const pattern of PAGE_MARKERS) {
    const match = pattern.exec(text);
    if (!match) continue;
    const n = Number(match[1]);
    const total = Number(match[2]);
    if (n >= 1 && total >= 1 && n <= total && total <= 100) return { n, total };
  }
  return null;
}

// The heading of a page: the first of its opening lines that names a kind of document. Letterheads (company names)
// repeat on every page of every document, so they are not used. Field lines ("Licence No: 123") are not headings.
function pageTitle(text) {
  const lines = String(text || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 10);
  const looksLikeField = (line) => line.includes(':') || (line.match(/\d/g) || []).length > 3 || line.length > 90;
  const heading = lines.find((line) => TITLE_WORDS.test(line) && !looksLikeField(line));
  return heading || '';
}

function analysePage(rawText) {
  const text = normalizeDigits(String(rawText || ''));
  const title = pageTitle(text);
  const found = findIdentifiersInText(text);
  return {
    chars: visibleChars(text),
    unreadable: visibleChars(text) < MIN_PAGE_CHARS,
    marker: pageMarker(text),
    title,
    titleKey: squash(title),
    hasTitleWord: title !== '',
    hasDateLabels: DATE_LABELS.test(text),
    licenses: found.licenseNos,
    crs: found.crNos,
  };
}

const keyOf = (value) => String(value).toUpperCase().replace(/[^A-Z0-9]/g, '');
const overlaps = (list, set) => list.some((value) => set.has(keyOf(value)));

// Does this page start a new document (true) or continue the current one (false)? `reason` says why, for the log.
function startsNewDocument(info, current) {
  if (!current) return { isNew: true, reason: 'first page' };
  if (current.afterUnreadable && !(info.marker && info.marker.n > 1)) return { isNew: true, reason: 'follows a page that could not be read' };

  // "Page 2 of 2" is the continuation of the document before it; "Page 1 of N" starts one.
  if (info.marker && info.marker.n > 1) return { isNew: false, reason: `page marker ${info.marker.n} of ${info.marker.total}` };
  if (info.marker && info.marker.n === 1) return { isNew: true, reason: 'page 1 marker' };

  const titleDiffers = info.titleKey !== '' && info.titleKey !== current.titleKey;

  if (info.licenses.length > 0) {
    if (current.licenseKeys.size > 0) {
      return overlaps(info.licenses, current.licenseKeys)
        ? { isNew: false, reason: 'same licence number' }
        : { isNew: true, reason: 'different licence number' };
    }
    // The document so far has no licence number (a CR-only certificate): a licence page after it is a new document.
    return titleDiffers || current.crKeys.size > 0
      ? { isNew: true, reason: 'licence page after a document without a licence number' }
      : { isNew: false, reason: 'no licence number so far' };
  }

  if (info.crs.length > 0) {
    if (current.crKeys.size > 0 && !overlaps(info.crs, current.crKeys)) return { isNew: true, reason: 'different CR number' };
    if (info.hasTitleWord && titleDiffers) return { isNew: true, reason: 'different title' };
    return { isNew: false, reason: 'same CR number' };
  }

  // No identifier on this page. A heading naming another kind of document together with issue / expiry wording is a
  // document of its own (it will be reported as having no identifier); anything else is more of the current document.
  if (info.hasTitleWord && titleDiffers && info.hasDateLabels) return { isNew: true, reason: 'different title, no identifier' };
  return { isNew: false, reason: 'no new identifier or title' };
}

// pages: array of page texts. Returns [{ pages: [1, 2], unreadable, licenses, crs, reason }] in page order.
function segmentPages(pages) {
  const groups = [];
  let current = null;

  pages.forEach((text, index) => {
    const info = analysePage(text);
    const number = index + 1;

    if (info.unreadable) {
      groups.push({ pages: [number], unreadable: true, licenses: [], crs: [], reason: 'no readable text on the page' });
      if (current) current.afterUnreadable = true;
      return;
    }

    const decision = startsNewDocument(info, current);
    if (decision.isNew) {
      current = {
        pages: [],
        unreadable: false,
        licenses: [],
        crs: [],
        reason: decision.reason,
        titleKey: info.titleKey,
        licenseKeys: new Set(),
        crKeys: new Set(),
        afterUnreadable: false,
      };
      groups.push(current);
    }
    current.pages.push(number);
    current.afterUnreadable = false;
    if (!current.titleKey) current.titleKey = info.titleKey;
    for (const value of info.licenses) {
      if (!current.licenseKeys.has(keyOf(value))) current.licenses.push(value);
      current.licenseKeys.add(keyOf(value));
    }
    for (const value of info.crs) {
      if (!current.crKeys.has(keyOf(value))) current.crs.push(value);
      current.crKeys.add(keyOf(value));
    }
  });

  return groups.map(({ pages: groupPages, unreadable, licenses, crs, reason }) => ({ pages: groupPages, unreadable, licenses, crs, reason }));
}

// "page 3", "pages 2-3" - for log lines and emails.
function describePages(pageNumbers) {
  if (!pageNumbers || pageNumbers.length === 0) return '';
  const first = pageNumbers[0];
  const last = pageNumbers[pageNumbers.length - 1];
  return first === last ? `page ${first}` : `pages ${first}–${last}`;
}

module.exports = { segmentPages, analysePage, describePages, startsNewDocument, MIN_PAGE_CHARS };
