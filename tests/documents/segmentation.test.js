const test = require('node:test');
const assert = require('node:assert/strict');
const { segmentPages, describePages } = require('../../utils/pdfSegmentation');
const { findIdentifiersInText } = require('../../utils/documentFields');

// Synthetic pages only - invented companies and numbers.
const licencePage = (company, licenseNo, crNo, extra = '') => `
${company}
Commercial Trade Licence
Licence No: ${licenseNo}
CR No: ${crNo}
Issue Date: 15/01/2024
Expiry Date: 14/01/2026
${extra}`;

const crPage = (company, crNo) => `
${company}
Commercial Registration Certificate
CR No: ${crNo}
Date of Issue: 01/03/2023
Activity: general trading and services for the company named above`;

const termsPage = `
Terms and Conditions
1. The holder must display this document at the premises at all times.
2. Any change of activity must be notified to the authority in writing.
3. This document is not transferable.`;

test('two different single-page documents are two documents', () => {
  const groups = segmentPages([licencePage('Alpha Trading W.L.L', 'LIC-1001', '55501-1'), licencePage('Alpha Trading W.L.L', 'LIC-2002', '55501-1')]);
  assert.deepEqual(groups.map((g) => g.pages), [[1], [2]]);
  assert.equal(groups[1].reason, 'different licence number');
});

test('three documents, each with its own identity', () => {
  const groups = segmentPages([
    licencePage('Beta Contracting', 'LIC-3003', '66602-1'),
    crPage('Beta Contracting', '66602-1'),
    licencePage('Gamma Services', 'LIC-4004', '77703-1'),
  ]);
  assert.deepEqual(groups.map((g) => g.pages), [[1], [2], [3]]);
});

test('one document spanning two pages stays together (continuation page with terms)', () => {
  const groups = segmentPages([licencePage('Delta Industries', 'LIC-5005', '88804-1'), termsPage]);
  assert.deepEqual(groups.map((g) => g.pages), [[1, 2]]);
});

test('one document spanning two pages stays together (page markers, repeated identifier)', () => {
  const first = licencePage('Delta Industries', 'LIC-5005', '88804-1', 'Page 1 of 2');
  const second = 'Delta Industries\nCommercial Trade Licence (continued)\nLicence No: LIC-5005\nAuthorised activities: general maintenance, cleaning, supply of spare parts.\nPage 2 of 2';
  assert.deepEqual(segmentPages([first, second]).map((g) => g.pages), [[1, 2]]);
});

test('a page 1 marker starts a new document even without identifiers', () => {
  const a = 'Annual Safety Certificate for the premises, all inspections passed and recorded by the inspector. Page 1 of 1';
  const b = 'Fire Safety Permit issued for the building after inspection by the civil defence team. Page 1 of 1';
  assert.deepEqual(segmentPages([a, b]).map((g) => g.pages), [[1], [2]]);
});

test('a page with no readable text is its own unreadable group, and the next page starts fresh', () => {
  const groups = segmentPages([licencePage('Epsilon Co', 'LIC-6006', '99905-1'), '   \n  ', licencePage('Epsilon Co', 'LIC-7007', '99905-1')]);
  assert.deepEqual(groups.map((g) => [g.pages, g.unreadable]), [[[1], false], [[2], true], [[3], false]]);
});

test('licence followed by a CR certificate of the same company are two documents', () => {
  const groups = segmentPages([licencePage('Zeta Group', 'LIC-8008', '12345-6'), crPage('Zeta Group', '12345-6')]);
  assert.deepEqual(groups.map((g) => g.pages), [[1], [2]]);
});

test('Arabic-Indic digits and Arabic labels are read', () => {
  const found = findIdentifiersInText('رقم الترخيص: ٤٥٦٧٨\nرقم السجل التجاري: ١٢٣٤٥-١');
  assert.deepEqual(found.licenseNos, ['45678']);
  assert.deepEqual(found.crNos, ['12345-1']);
});

test('labels followed by ordinary words are not identifiers', () => {
  const found = findIdentifiersInText('This licence issued by the authority. Permit holder: Acme.');
  assert.deepEqual(found, { licenseNos: [], crNos: [] });
});

test('describePages', () => {
  assert.equal(describePages([3]), 'page 3');
  assert.equal(describePages([2, 3]), 'pages 2–3');
});
