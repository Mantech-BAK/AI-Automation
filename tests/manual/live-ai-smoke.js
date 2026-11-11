// Manual check, not part of `npm test`: the REAL AI model reads the invented sample PDFs, end to end through the processor
// (fake mailbox and OneDrive, local test database). Uses the GROQ_API_KEY from .env; only the invented sample text is sent.
//   node tests/manual/live-ai-smoke.js
process.env.USE_REAL_AI = '1';
const h = require('../helpers/harness');

(async () => {
  await h.reset();
  await h.seedDocument({ name: 'Existing licence', licenseNo: 'LIC-500500', crNo: '75005-1' });
  const files = ['no_expiry.pdf', 'valid_4_years.pdf', 'issue_no_period.pdf', 'ambiguous_period.pdf', 'two_docs.pdf', 'spanning_two_pages.pdf', 'three_docs.pdf'];
  const { results } = await h.run(files.map((file) => h.email({ subject: file, files: [file] })));
  for (const r of results) {
    console.log('RESULT', JSON.stringify({
      file: r.fileName, pages: r.pages, status: r.status, code: r.reasonCode, licence: r.licenseNo, cr: r.crNo,
      issue: r.issueDate, expiry: r.expiry, source: r.expirySource, note: r.expiryNote && r.expiryNote.slice(0, 70),
    }));
  }
  await h.pool.end();
})().catch((error) => {
  console.error('ERR', error.message);
  process.exit(1);
});
