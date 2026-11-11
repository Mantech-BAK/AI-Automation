const test = require('node:test');
const assert = require('node:assert/strict');
const h = require('../helpers/harness');

test.beforeEach(() => h.reset());
test.after(() => h.pool.end());

const byOutcome = (results) => results.map((r) => r.status + (r.reasonCode ? `:${r.reasonCode}` : ''));

test('a PDF with 2 different single-page documents creates 2 records', async () => {
  const { results } = await h.run([h.email({ files: ['two_docs.pdf'] })]);
  assert.deepEqual(byOutcome(results), ['created', 'created']);
  assert.deepEqual(results.map((r) => r.pages), [[1], [2]]);
  const docs = await h.documents();
  assert.equal(docs.length, 2);
  assert.deepEqual(docs.map((d) => d.license_no), ['LIC-400400', null]);
  assert.deepEqual(docs.map((d) => d.cr_no), ['74004-1', '74004-1']);
  // one PDF upload is shared by both records, under the attachment's own name
  assert.deepEqual(h.state.uploads, ['two_docs.pdf']);
});

test('3 documents in one PDF: a duplicate and an unreadable page never stop the new one', async () => {
  await h.seedDocument({ name: 'Existing licence', licenseNo: 'LIC-500500', crNo: '75005-1' });
  const { results } = await h.run([h.email({ files: ['three_docs.pdf'] })]);
  assert.deepEqual(byOutcome(results), ['duplicate', 'failed:unreadable_page', 'created']);
  assert.deepEqual(results.map((r) => r.pages), [[1], [2], [3]]);
  assert.match(results[0].existingName, /Existing licence/);
  assert.equal(results[0].existingId > 0, true);
  assert.match(results[1].reason, /page 2 could not be read/i);
  const docs = await h.documents();
  assert.equal(docs.length, 2); // the seeded one + the new one
  assert.ok(docs.some((d) => d.license_no === 'LIC-500501'));
});

test('one document spanning 2 pages is one record', async () => {
  const { results } = await h.run([h.email({ files: ['spanning_two_pages.pdf'] })]);
  assert.deepEqual(byOutcome(results), ['created']);
  assert.deepEqual(results[0].pages, [1, 2]);
  assert.equal((await h.documents()).length, 1);
  assert.equal(h.state.aiPrompts.length, 1); // one analysis for the two pages
});

test('a document that fails to analyse does not stop the others in the same PDF', async () => {
  h.state.aiMode.badJsonFor = /LIC-400400/;
  const { results } = await h.run([h.email({ files: ['two_docs.pdf'] })]);
  assert.deepEqual(byOutcome(results), ['failed:invalid_json', 'created']);
  assert.match(results[0].reason, /page 1/i);
  assert.equal((await h.documents()).length, 1);
});

test('identifiers missing from the AI answer are read from the document text', async () => {
  h.state.aiMode.omitIdentifiers = true;
  const { results } = await h.run([h.email({ files: ['stated_expiry.pdf'] })]);
  assert.deepEqual(byOutcome(results), ['created']);
  const [doc] = await h.documents();
  assert.equal(doc.license_no, 'LIC-330330');
  assert.equal(doc.cr_no, '73303-1');
});

test('failure: no CR No or License No', async () => {
  const { results } = await h.run([h.email({ files: ['no_identifier.pdf'] })]);
  assert.deepEqual(byOutcome(results), ['failed:no_identifier']);
  assert.match(results[0].reason, /No CR No or License No/);
  assert.equal((await h.documents()).length, 0);
});

test('failure: password-protected PDF', async () => {
  const { results } = await h.run([h.email({ files: ['password_protected.pdf'] })]);
  assert.deepEqual(byOutcome(results), ['failed:password_protected']);
  assert.match(results[0].reason, /password-protected/i);
});

test('failure: corrupted PDF', async () => {
  const { results } = await h.run([h.email({ files: ['corrupted.pdf'] })]);
  assert.equal(results[0].status, 'failed');
  assert.match(results[0].reasonCode, /corrupted|unreadable/);
  assert.notEqual(results[0].reason, 'Unknown error');
});

test('failure: unsupported file (named .pdf but not a PDF)', async () => {
  const { results } = await h.run([h.email({ files: ['not_a_pdf.pdf'] })]);
  assert.deepEqual(byOutcome(results), ['failed:unsupported']);
  assert.match(results[0].reason, /not a valid PDF/i);
});

test('failure: duplicate names the existing record', async () => {
  await h.seedDocument({ name: 'Summit licence on file', licenseNo: 'LIC-330330', crNo: '73303-1' });
  const { results } = await h.run([h.email({ files: ['stated_expiry.pdf'] })]);
  assert.deepEqual(byOutcome(results), ['duplicate']);
  assert.equal(results[0].existingName, 'Summit licence on file');
  assert.equal(results[0].matchedBy, 'license_no');
  assert.equal((await h.documents()).length, 1);
});

test('the same PDF sent twice: the second time every document is a duplicate', async () => {
  await h.run([h.email({ files: ['two_docs.pdf'] })]);
  const { results } = await h.run([h.email({ files: ['two_docs.pdf'] })]);
  assert.deepEqual(byOutcome(results.slice(-2)), ['duplicate', 'duplicate']);
  assert.equal((await h.documents()).length, 2);
});
