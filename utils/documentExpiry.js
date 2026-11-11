// Works out a document's expiry date.
//
//   stated      the document shows an expiry date                                       -> used as printed
//   calculated  it shows an issue date and its own text states a validity period       -> issue date + period
//               ("valid for 4 years", "valid for one year", "valid up to 4 years from issue", Arabic too)
//   missing     anything else: no expiry and no period, an issue date but no period, a period but no issue date,
//               or a period the text states in conflicting ways                         -> saved without an expiry, with the reason
//
// There are no fixed periods per document type: a period is only ever read from the document's own text.
// Pure functions (no I/O).

const { normalizeDigits } = require('./documentFields');

const EN_NUMBERS = {
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
  thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30,
};
const AR_NUMBERS = {
  'واحد': 1, 'واحدة': 1, // واحد، واحدة
  'ثلاث': 3, 'ثلاثة': 3, // ثلاث، ثلاثة
  'أربع': 4, 'اربع': 4, 'أربعة': 4, 'اربعة': 4, // أربع، اربع، أربعة
  'خمس': 5, 'خمسة': 5, // خمس، خمسة
  'ست': 6, 'ستة': 6, // ست، ستة
  'سبع': 7, 'سبعة': 7, // سبع، سبعة
  'ثماني': 8, 'ثمان': 8, 'ثمانية': 8, // ثماني، ثمان، ثمانية
  'تسع': 9, 'تسعة': 9, // تسع، تسعة
  'عشر': 10, 'عشرة': 10, // عشر، عشرة
};

// unit word -> canonical unit
const EN_UNITS = { year: 'year', yr: 'year', month: 'month', week: 'week', day: 'day' };
const AR_UNITS = {
  'سنة': 'year', 'سنوات': 'year', 'سنين': 'year', 'عام': 'year', 'أعوام': 'year', 'اعوام': 'year', // سنة سنوات سنين عام أعوام
  'شهر': 'month', 'أشهر': 'month', 'اشهر': 'month', 'شهور': 'month', // شهر أشهر شهور
  'يوم': 'day', 'أيام': 'day', 'ايام': 'day', // يوم أيام
  'أسبوع': 'week', 'أسابيع': 'week', // أسبوع أسابيع
};
// dual forms already carry the number 2: سنتين عامين شهرين يومين أسبوعين
const AR_DUALS = {
  'سنتين': ['year', 2], 'عامين': ['year', 2], 'شهرين': ['month', 2],
  'يومين': ['day', 2], 'أسبوعين': ['week', 2],
};

const EN_WORD = Object.keys(EN_NUMBERS).join('|');
const EN_UNIT = 'years?|yrs?|months?|weeks?|days?';

// "valid for", "validity", "term of", "granted for" ... : words that introduce how long a document lasts.
const EN_CUE = /\b(?:valid(?:ity)?|good\s+for|term|duration|granted\s+for|issued\s+for|licen[cs]e\s+period|lifetime)\b/gi;
const AR_CUE = /(?:صالح(?:ة|ه)?|صلاحية|سارية|ساري|لمدة|مدة)/g; // صالح صلاحية سارية ساري لمدة مدة

// "4", "four", "a" followed by an optional "(4)" and the unit
const EN_PERIOD = new RegExp(String.raw`(?:^|[^\p{L}\d.])(\d{1,3}(?:\.\d+)?|${EN_WORD})\s*(?:\(\s*\d{1,3}\s*\)\s*)?[-\s]*(${EN_UNIT})\b`, 'iu');
// "4-year licence", "three-year validity"
const EN_COMPOUND = new RegExp(String.raw`\b(\d{1,3}|${EN_WORD})[-\s]?(year|month)\s+(?:licen[cs]e|permit|validity|registration|certificate|term)\b`, 'gi');
const AR_UNIT_ALT = Object.keys(AR_UNITS).join('|');
const AR_NUM_ALT = Object.keys(AR_NUMBERS).sort((a, b) => b.length - a.length).join('|');
const AR_PERIOD = new RegExp(String.raw`(\d{1,3}|${AR_NUM_ALT})\s*(${AR_UNIT_ALT})`, 'u');
const AR_DUAL = new RegExp(`(${Object.keys(AR_DUALS).join('|')})`, 'u');
// "سنة واحدة" (one year) and a bare singular right after the cue, "لمدة سنة" (for a year)
const AR_ONE = /(سنة|عام|شهر|يوم|أسبوع)\s*(?:واحدة|واحد)/u;
const AR_BARE = /^\s*(?:لمدة\s+|مدة\s+)?(سنة|عام|شهر)(?![؀-ۿA-Za-z\d])(?!\s*\d)/u;

// words between the cue and the number that mean the number is not "how long it lasts" (an end date, a renewal or fee period)
const NOT_A_PERIOD = /\b(?:until|till|expir\w*|renew\w*|fees?|penalt\w*|within|after|before)\b/i;

function toNumber(token) {
  if (token === undefined) return null;
  const text = String(token).toLowerCase();
  if (/^\d+(\.\d+)?$/.test(text)) return Number(text);
  return EN_NUMBERS[text] ?? AR_NUMBERS[token] ?? null;
}

function makePeriod(unit, count) {
  if (!count || count <= 0) return null;
  if (unit === 'year') return { months: Math.round(count * 12), days: 0, label: `${count} year${count === 1 ? '' : 's'}` };
  if (unit === 'month') return { months: Math.round(count), days: 0, label: `${count} month${count === 1 ? '' : 's'}` };
  if (unit === 'week') return { months: 0, days: Math.round(count * 7), label: `${count} week${count === 1 ? '' : 's'}` };
  return { months: 0, days: Math.round(count), label: `${count} day${count === 1 ? '' : 's'}` };
}

const periodKey = (period) => (period.months ? `${period.months}m` : `${period.days}d`);

// The sentence-sized stretch of text after a cue.
function windowAfter(text, index) {
  const slice = text.slice(index, index + 140);
  const end = slice.search(/(?<!\d)\.(?!\d)|;|\n\s*\n/);
  return end > 0 ? slice.slice(0, end) : slice;
}

function periodsFromCue(text, cuePattern, findPeriod) {
  const found = [];
  cuePattern.lastIndex = 0;
  let cue;
  while ((cue = cuePattern.exec(text))) {
    const afterCue = windowAfter(text, cue.index + cue[0].length);
    const match = findPeriod(afterCue);
    if (!match) continue;
    const between = afterCue.slice(0, match.index);
    if (NOT_A_PERIOD.test(between) || between.split(/\s+/).filter(Boolean).length > 7) continue;
    if (match.period) found.push({ period: match.period, quote: `${cue[0]}${afterCue.slice(0, match.index + match.length)}`.replace(/\s+/g, ' ').trim() });
  }
  return found;
}

function englishPeriod(windowText) {
  const match = EN_PERIOD.exec(windowText);
  if (!match) return null;
  const count = toNumber(match[1]);
  const unit = EN_UNITS[match[2].toLowerCase().replace(/s$/, '')];
  const start = match.index + match[0].indexOf(match[1]);
  return { index: start, length: match[0].length - (start - match.index), period: unit ? makePeriod(unit, count) : null };
}

function arabicPeriod(windowText) {
  const dual = AR_DUAL.exec(windowText);
  const plain = AR_PERIOD.exec(windowText);
  const one = AR_ONE.exec(windowText);
  const bare = AR_BARE.exec(windowText);
  const pick = [
    dual && { m: dual, p: makePeriod(...AR_DUALS[dual[1]]) },
    plain && { m: plain, p: makePeriod(AR_UNITS[plain[2]], toNumber(plain[1])) },
    one && { m: one, p: makePeriod(AR_UNITS[one[1]], 1) },
    bare && { m: bare, p: makePeriod(AR_UNITS[bare[1]], 1) },
  ]
    .filter(Boolean)
    .sort((a, b) => a.m.index - b.m.index)[0];
  return pick ? { index: pick.m.index, length: pick.m[0].length, period: pick.p } : null;
}

// Reads the validity period a document states about itself.
// Returns { status: 'found', period, quote } | { status: 'ambiguous', quotes: [...] } | { status: 'none' }
function findValidityPeriod(rawText) {
  const text = normalizeDigits(String(rawText || '')).replace(/[ً-ٟـ]/g, ''); // drop Arabic diacritics / tatweel
  const hits = [
    ...periodsFromCue(text, EN_CUE, englishPeriod),
    ...periodsFromCue(text, AR_CUE, arabicPeriod),
  ];

  EN_COMPOUND.lastIndex = 0;
  let compound;
  while ((compound = EN_COMPOUND.exec(text))) {
    const period = makePeriod(EN_UNITS[compound[2].toLowerCase()], toNumber(compound[1]));
    if (period) hits.push({ period, quote: compound[0].replace(/\s+/g, ' ') });
  }

  if (hits.length === 0) return { status: 'none' };
  const distinct = new Map();
  for (const hit of hits) if (!distinct.has(periodKey(hit.period))) distinct.set(periodKey(hit.period), hit);
  if (distinct.size > 1) return { status: 'ambiguous', quotes: [...distinct.values()].map((hit) => hit.quote.slice(0, 80)) };
  const [only] = distinct.values();
  return { status: 'found', period: only.period, quote: only.quote.slice(0, 80) };
}

// issue date ('YYYY-MM-DD') + period -> 'YYYY-MM-DD'. Month ends are respected (31 Jan + 1 month = 28/29 Feb).
function addPeriod(isoDate, period) {
  const [year, month, day] = String(isoDate).split('-').map(Number);
  let result;
  if (period.months) {
    const target = new Date(Date.UTC(year, month - 1 + period.months, 1));
    const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
    result = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), Math.min(day, lastDay)));
  } else {
    result = new Date(Date.UTC(year, month - 1, day + period.days));
  }
  return result.toISOString().slice(0, 10);
}

const formatDMY = (iso) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
  return match ? `${match[3]}/${match[2]}/${match[1]}` : String(iso || '');
};

// { expiryDate, source: 'stated' | 'calculated' | 'missing', note, reason }
//   note    (calculated) how it was worked out, e.g. "Issue date 15/01/2026 + 4 years"
//   reason  (missing)    why there is no expiry date, in words for the sender
// text: the document's own text; hints: extra strings that may state the period (e.g. the AI's "validity_period" field).
function resolveExpiry({ statedExpiry = null, issueDate = null, text = '', hints = [] }) {
  if (statedExpiry) return { expiryDate: statedExpiry, source: 'stated', note: null, reason: null };

  const period = findValidityPeriod([text, ...hints.filter((hint) => typeof hint === 'string')].join('\n'));

  if (period.status === 'ambiguous') {
    return {
      expiryDate: null, source: 'missing', note: null,
      reason: `The validity period is ambiguous (the text says ${period.quotes.map((q) => `"${q}"`).join(' and ')}), so no expiry date was calculated.`,
    };
  }
  if (period.status === 'found' && issueDate) {
    return {
      expiryDate: addPeriod(issueDate, period.period), source: 'calculated',
      note: `Issue date ${formatDMY(issueDate)} + ${period.period.label}`, reason: null,
    };
  }
  if (period.status === 'found') {
    return {
      expiryDate: null, source: 'missing', note: null,
      reason: `The document states a validity period (${period.period.label}) but no issue date was found, so the expiry date could not be calculated.`,
    };
  }
  if (issueDate) {
    return {
      expiryDate: null, source: 'missing', note: null,
      reason: `An issue date (${formatDMY(issueDate)}) was found but the document does not state a validity period.`,
    };
  }
  return { expiryDate: null, source: 'missing', note: null, reason: 'The document shows no expiry date, no issue date and no validity period.' };
}

module.exports = { findValidityPeriod, addPeriod, resolveExpiry };
