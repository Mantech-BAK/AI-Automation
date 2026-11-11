const test = require('node:test');
const assert = require('node:assert/strict');
const h = require('../helpers/harness');

test.beforeEach(() => h.reset());
test.after(() => h.pool.end());

const text = (mail) => h.plain(mail.content);
const SERVICE = 'documents@bak.example.test';

test('one reply per received email, each with a section per document', async () => {
  await h.seedDocument({ name: 'Existing licence', licenseNo: 'LIC-500500', crNo: '75005-1' });
  const { sent } = await h.run([
    h.email({ subject: 'Licences for April', from: 'alice@bak.example.test', to: ['bob@bak.example.test', SERVICE], files: ['no_expiry.pdf', 'valid_4_years.pdf'] }),
    h.email({ subject: 'Unity documents', from: 'alice@bak.example.test', to: ['carol@bak.example.test'], files: ['three_docs.pdf'] }),
    h.email({ subject: 'Xenon licence', from: 'dave@bak.example.test', to: [], files: ['password_protected.pdf'] }),
  ]);

  assert.equal(sent.length, 3); // three emails received -> three replies (Alice's two emails are NOT merged)
  assert.deepEqual(sent.map((m) => m.subject.match(/\(Re: (.+)\)$/)?.[1]), ['Licences for April', 'Unity documents', 'Xenon licence']);
});

test('reply 1: expiry missing / expiry calculated, in the words the sender needs', async () => {
  const { sent } = await h.run([h.email({ subject: 'Licences for April', to: ['bob@bak.example.test', SERVICE], files: ['no_expiry.pdf', 'valid_4_years.pdf'] })]);
  assert.equal(sent.length, 1);
  const body = text(sent[0]);

  // sender rules: To = sender + the people the email was addressed to, the service account never, nobody twice
  assert.deepEqual(sent[0].to, ['alice@bak.example.test', 'bob@bak.example.test']);
  assert.match(sent[0].subject, /^Document Processing Complete — 2 saved, 1 needs an expiry date \(Re: Licences for April\)$/);

  // PDF 1: no expiry date -> SUCCESS + a clear request
  assert.match(body, /no_expiry\.pdf/);
  assert.match(body, /Success, please add expiry date/);
  assert.match(body, /Please add the expiry date for this document: no_expiry\.pdf \(License No LIC-100100 · CR No 71001-1\)\./);
  assert.match(body, /Expiry date Not found/);

  // PDF 2: calculated expiry, with the working shown
  assert.match(body, /valid_4_years\.pdf/);
  assert.match(body, /Success, expiry calculated/);
  assert.match(body, /Issue date 15\/01\/2026/);
  assert.match(body, /Expiry date 15\/01\/2030 \(calculated: Issue date 15\/01\/2026 \+ 4 years\)/);
  assert.match(body, /Nimbus Catering/);

  assert.match(body, /Total: 2 documents processed — 2 new, 0 duplicates, 0 failed — 1 needs an expiry date/);
});

test('reply 2: three documents in one PDF - each reported on its own, in page order', async () => {
  await h.seedDocument({ name: 'Existing licence', licenseNo: 'LIC-500500', crNo: '75005-1' });
  const { sent } = await h.run([h.email({ subject: 'Unity documents', files: ['three_docs.pdf'] })]);
  const body = text(sent[0]);

  assert.match(body, /three_docs\.pdf\s+— 3 documents found/);
  const order = ['Failed, duplicate', 'Failed', 'Success'].map((label) => body.search(new RegExp(`${label}\\s*\\n?\\s*Document`)));
  assert.ok(order[0] >= 0 && order[0] < order[1] && order[1] < order[2], `sections out of page order: ${order}`);

  assert.match(body, /\(page 1\)/);
  assert.match(body, /Duplicate: this document already exists in the system as "Existing licence" \(record #\d+\), matched by the same License No/);
  assert.match(body, /\(page 2\)/);
  assert.match(body, /Reason: Page 2 could not be read\. It has no text layer and no text could be read from it \(image-only page\)/);
  assert.match(body, /\(page 3\)/);
  assert.match(body, /License No LIC-500501/);
  assert.match(body, /Total: 3 documents processed — 1 new, 1 duplicate, 1 failed/);
});

test('reply: every failure states its specific reason, never a generic one', async () => {
  const files = ['password_protected.pdf', 'corrupted.pdf', 'not_a_pdf.pdf', 'no_identifier.pdf'];
  const { sent } = await h.run(files.map((file) => h.email({ subject: file, files: [file] })));
  const bodies = sent.map(text);
  assert.match(bodies[0], /Reason: The PDF is password-protected/);
  assert.match(bodies[1], /Reason: The PDF file is corrupted/);
  assert.match(bodies[2], /Reason: Unsupported file: it is named like a PDF but is not a valid PDF/);
  assert.match(bodies[3], /Reason: No CR No or License No was found in this document/);
  for (const body of bodies) {
    assert.doesNotMatch(body, /Unknown error|Failed to process|Reason: Failed\b/);
  }
});

test('nothing is replied to the processing mailbox itself', async () => {
  const { sent } = await h.run([h.email({ from: SERVICE, files: ['stated_expiry.pdf'] })]);
  assert.equal(sent.length, 0);
  assert.equal((await h.documents()).length, 1); // still processed
});

test('a reply that could not be sent is kept and goes out on the next run', async () => {
  h.state.failSend = true;
  await h.run([h.email({ subject: 'Stored for later', files: ['stated_expiry.pdf'] })]);
  assert.equal(h.state.sent.length, 0);
  assert.equal((await h.query(`SELECT count(*)::int AS n FROM document_summary_queue`)).rows[0].n, 1);

  h.state.failSend = false;
  await h.run([]); // the next run: nothing new, the kept reply is sent first
  assert.equal(h.state.sent.length, 1);
  assert.match(h.state.sent[0].subject, /\(Re: Stored for later\)$/);
  assert.equal((await h.query(`SELECT count(*)::int AS n FROM document_summary_queue`)).rows[0].n, 0);
});

test('HTML in names and reasons cannot break out of the email', () => {
  const { content } = h.processor.buildSummaryEmail(
    [{ status: 'failed', fileName: '<script>alert(1)</script>.pdf', reason: '<b>bad</b>', reasonCode: 'x', company: 'A & B' }],
    { subject: '<img src=x>' }
  );
  assert.doesNotMatch(content, /<script>|<img |<b>bad/);
  assert.match(content, /A &amp; B/);
});
