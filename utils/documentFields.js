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

module.exports = { findCrNo, findLicenseNo, isPrintedKey, stripPrintedFields };
