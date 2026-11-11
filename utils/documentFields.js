// Pulls the dedicated CR No / License No values out of a document's AI-extracted
// fields, and drops the PDF's own "printed date" (replaced by processed_at).
// The AI names these fields differently between documents (c_r_no, cr_number,
// license_number, licence_no, ...), so keys are matched by pattern.

const CR_KEY = /^(c_?r)(_?(no|number|num))?$|^commercial_?(registration|reg)(_?(no|number|num))?$/;
const LICENSE_KEY = /^licen[cs]e(_?(no|number|num))?$|^licen[cs]e_?(no|number|num)$/;

const asText = (value) => {
  if (value === null || value === undefined || typeof value === 'object') return null;
  const text = String(value).trim();
  return text && !/^(null|n\/a|none|-)$/i.test(text) ? text : null;
};

function firstMatching(data, pattern) {
  if (!data || typeof data !== 'object') return null;
  for (const key of Object.keys(data)) {
    if (pattern.test(key.toLowerCase().trim())) {
      const text = asText(data[key]);
      if (text) return text;
    }
  }
  return null;
}

const findCrNo = (data) => firstMatching(data, CR_KEY);
const findLicenseNo = (data) => firstMatching(data, LICENSE_KEY);

// "printed_date", "printed_on", "print_date": when the PDF was printed is not when we processed it.
const isPrintedKey = (key) => /^print(ed)?(_|$)/.test(String(key).toLowerCase().trim());

function stripPrintedFields(data) {
  if (!data || typeof data !== 'object') return data;
  for (const key of Object.keys(data)) {
    if (isPrintedKey(key)) delete data[key];
  }
  return data;
}

// Arabic-Indic and Persian digits to ASCII, so numbers read the same in every script.
function normalizeDigits(text) {
  return String(text ?? '')
    .replace(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (digit) => String(digit.charCodeAt(0) - 0x06f0));
}

// Identifiers read straight from the text of a document, for when the AI's fields have none and to tell documents
// apart page by page. A value must contain a digit, so labels followed by ordinary words ("Licence issued by...") never match.
const VALUE = String.raw`([A-Z0-9][A-Z0-9\-\/.]{2,24})`;
const LICENSE_TEXT = [
  new RegExp(String.raw`(?:licen[cs]e|permit)\s*(?:(?:no|number|num|nr)\b\.?|#|n°)\s*[:\-–#]?\s*${VALUE}`, 'gi'),
  new RegExp(String.raw`(?:licen[cs]e|permit)\s*[:#]\s*${VALUE}`, 'gi'),
  new RegExp(String.raw`(?:رقم\s*(?:ال)?(?:ترخيص|رخصة)|ترخيص\s*رقم)\s*[:\-–]?\s*${VALUE}`, 'gi'),
];
const CR_TEXT = [
  new RegExp(String.raw`(?:\bc\.?\s?r\.?\s*(?:no|number|num|nr)\b\.?|\bc\.?\s?r\.?\s*#|commercial\s+regist(?:ration|er)\s*(?:no|number|num)?\b\.?)\s*[:\-–#]?\s*(\d[0-9A-Z\-\/]{2,20})`, 'gi'),
  new RegExp(String.raw`(?:رقم\s*السجل\s*التجاري|السجل\s*التجاري\s*رقم)\s*[:\-–]?\s*(\d[0-9\-\/]{2,20})`, 'gi'),
];

function matchesOf(patterns, text) {
  const found = [];
  const seen = new Set();
  for (const pattern of patterns) {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(text))) {
      const value = match[1].replace(/[.\-\/]+$/, '');
      if (!/\d/.test(value)) continue;
      const key = value.toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (key.length < 3 || seen.has(key)) continue;
      seen.add(key);
      found.push(value);
    }
  }
  return found;
}

// { licenseNos: [...], crNos: [...] } found in a text, in order of appearance.
function findIdentifiersInText(text) {
  const clean = normalizeDigits(text);
  return { licenseNos: matchesOf(LICENSE_TEXT, clean), crNos: matchesOf(CR_TEXT, clean) };
}

module.exports = { findCrNo, findLicenseNo, isPrintedKey, stripPrintedFields, normalizeDigits, findIdentifiersInText };
