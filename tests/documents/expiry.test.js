const test = require('node:test');
const assert = require('node:assert/strict');
const { findValidityPeriod, addPeriod, resolveExpiry } = require('../../utils/documentExpiry');
const h = require('../helpers/harness');
const { runDailyCheck } = require('../../jobs/dailyCheck');

test.beforeEach(() => h.reset());
test.after(() => h.pool.end());

// ---------------------------------------------------------------- reading the validity period
const period = (text) => {
  const r = findValidityPeriod(text);
  return r.status === 'found' ? r.period.label : r.status;
};

test('validity period: English wording, digits and words', () => {
  assert.equal(period('This licence is valid for four (4) years from the date of issue.'), '4 years');
  assert.equal(period('valid for 4 years'), '4 years');
  assert.equal(period('Valid for one year'), '1 year');
  assert.equal(period('valid for a year'), '1 year');
  assert.equal(period('valid up to 4 years from issue'), '4 years');
  assert.equal(period('Validity: 4 years'), '4 years');
  assert.equal(period('valid from the date of issue for 3 years'), '3 years');
  assert.equal(period('granted for a period of five (5) years'), '5 years');
  assert.equal(period('A 4-year licence for trading.'), '4 years');
  assert.equal(period('This certificate is valid for 6 months.'), '6 months');
  assert.equal(period('valid for 90 days'), '90 days');
  assert.equal(period('Valid for 1 year. Validity: one year.'), '1 year'); // the same period twice is not a conflict
});

test('validity period: Arabic wording, Arabic digits', () => {
  assert.equal(period('صالحة لمدة سنتين'), '2 years');
  assert.equal(period('صالحة لمدة أربع سنوات'), '4 years');
  assert.equal(period('هذه الرخصة صالحة لمدة ٤ سنوات من تاريخ الإصدار'), '4 years');
  assert.equal(period('مدة صلاحيتها سنة واحدة'), '1 year');
  assert.equal(period('صالحة لمدة سنة'), '1 year');
  assert.equal(period('لمدة ثلاث سنوات'), '3 years');
  assert.equal(period('صالحة لمدة 6 أشهر'), '6 months');
});

test('validity period: things that are not a validity period', () => {
  assert.equal(period('Payment terms: 30 days from invoice'), 'none');
  assert.equal(period('valid until 31/12/2027, renewal fee for 3 years'), 'none');
  assert.equal(period('no period here at all'), 'none');
});

test('validity period: conflicting periods are ambiguous', () => {
  assert.equal(period('Valid for one year for trading. Valid for three years for the premises.'), 'ambiguous');
});

test('issue date + period', () => {
  assert.equal(addPeriod('2026-01-15', { months: 48, days: 0 }), '2030-01-15');
  assert.equal(addPeriod('2026-01-31', { months: 1, days: 0 }), '2026-02-28'); // month ends are respected
  assert.equal(addPeriod('2024-02-29', { months: 12, days: 0 }), '2025-02-28');
  assert.equal(addPeriod('2026-03-01', { months: 0, days: 90 }), '2026-05-30');
});

test('resolveExpiry: every case', () => {
  const stated = resolveExpiry({ statedExpiry: '2030-05-31', issueDate: '2026-06-01', text: 'valid for 1 year' });
  assert.deepEqual([stated.expiryDate, stated.source], ['2030-05-31', 'stated']); // a printed date always wins

  const calculated = resolveExpiry({ issueDate: '2026-01-15', text: 'valid for four (4) years' });
  assert.deepEqual([calculated.expiryDate, calculated.source, calculated.note], ['2030-01-15', 'calculated', 'Issue date 15/01/2026 + 4 years']);

  const noPeriod = resolveExpiry({ issueDate: '2026-02-20', text: 'nothing about validity' });
  assert.equal(noPeriod.source, 'missing');
  assert.match(noPeriod.reason, /issue date \(20\/02\/2026\) was found but the document does not state a validity period/);

  const noIssue = resolveExpiry({ text: 'valid for 4 years' });
  assert.equal(noIssue.source, 'missing');
  assert.match(noIssue.reason, /validity period \(4 years\) but no issue date/);

  const ambiguous = resolveExpiry({ issueDate: '2026-03-01', text: 'Valid for one year. Valid for three years.' });
  assert.equal(ambiguous.source, 'missing');
  assert.match(ambiguous.reason, /ambiguous/);

  assert.match(resolveExpiry({ text: '' }).reason, /no expiry date, no issue date and no validity period/);

  // the AI's own "validity_period" field is read too
  const hinted = resolveExpiry({ issueDate: '2026-01-15', text: '', hints: ['4 years'] });
  assert.equal(hinted.source, 'missing'); // a bare "4 years" has no cue word, so it is not trusted on its own
  assert.equal(resolveExpiry({ issueDate: '2026-01-15', text: '', hints: ['valid for 4 years'] }).expiryDate, '2030-01-15');
});

// ---------------------------------------------------------------- through the whole processor
const only = async (file) => {
  const { results } = await h.run([h.email({ files: [file] })]);
  assert.equal(results.length, 1);
  return { result: results[0], doc: (await h.documents())[0] };
};

test('no expiry date and no validity period: saved, flagged "Expiry date missing", reported as success', async () => {
  const { result, doc } = await only('no_expiry.pdf');
  assert.equal(result.status, 'created');
  assert.equal(result.expirySource, 'missing');
  assert.equal(result.expiry, null);
  assert.match(result.expiryNote, /no expiry date, no issue date and no validity period/);
  assert.equal(doc.expiry_date, null);
  assert.equal(doc.next_due_date, null);
  assert.equal(doc.expiry_source, 'missing');
  assert.equal(doc.license_no, 'LIC-100100');
});

test('issue date + "valid for four (4) years": expiry calculated and marked', async () => {
  const { result, doc } = await only('valid_4_years.pdf');
  assert.equal(result.status, 'created');
  assert.equal(result.expirySource, 'calculated');
  assert.equal(result.expiry, '2030-01-15');
  assert.equal(result.expiryNote, 'Issue date 15/01/2026 + 4 years');
  assert.equal(String(doc.expiry_date.toISOString?.() ?? doc.expiry_date).slice(0, 10), '2030-01-15');
  assert.equal(doc.expiry_source, 'calculated');
  assert.equal(doc.expiry_note, 'Issue date 15/01/2026 + 4 years');
});

test('issue date + "valid for one year": expiry calculated', async () => {
  const { result } = await only('valid_one_year.pdf');
  assert.deepEqual([result.expirySource, result.expiry, result.expiryNote], ['calculated', '2027-04-10', 'Issue date 10/04/2026 + 1 year']);
});

test('issue date but no validity period: treated as a missing expiry', async () => {
  const { result, doc } = await only('issue_no_period.pdf');
  assert.equal(result.status, 'created');
  assert.equal(result.expirySource, 'missing');
  assert.match(result.expiryNote, /issue date \(20\/02\/2026\) was found but the document does not state a validity period/);
  assert.equal(doc.expiry_date, null);
});

test('ambiguous validity period: saved as missing, with the reason', async () => {
  const { result } = await only('ambiguous_period.pdf');
  assert.equal(result.expirySource, 'missing');
  assert.match(result.expiryNote, /ambiguous/);
  assert.match(result.expiryNote, /one year/i);
  assert.match(result.expiryNote, /three years/i);
});

test('a printed expiry date is used as printed', async () => {
  const { result, doc } = await only('stated_expiry.pdf');
  assert.deepEqual([result.expirySource, result.expiry], ['stated', '2030-05-31']);
  assert.equal(doc.expiry_source, 'stated');
});

test('re-sending a document that was saved without an expiry date is a duplicate', async () => {
  await only('no_expiry.pdf');
  const { results } = await h.run([h.email({ files: ['no_expiry.pdf'] })]);
  assert.equal(results[results.length - 1].status, 'duplicate');
  assert.equal((await h.documents()).length, 1);
});

test('an already-expired calculated date is not saved, and says it was calculated', async () => {
  const resolved = resolveExpiry({ issueDate: '2020-01-01', text: 'valid for one year' });
  assert.equal(resolved.expiryDate, '2021-01-01');
  const reason = h.processor.buildSummaryEmail([{ status: 'failed', reasonCode: 'expired', documentName: 'Old licence', expiry: '2021-01-01', expirySource: 'calculated', expiryNote: resolved.note, fileName: 'old.pdf' }]);
  assert.match(h.plain(reason.content), /already expired \(expiry date: 01\/01\/2021, calculated: Issue date 01\/01\/2020 \+ 1 year\)/);
});

// ---------------------------------------------------------------- reminders
const noteTypes = async () => (await h.query(`SELECT notification_type FROM notification_log ORDER BY id`)).rows.map((r) => r.notification_type);

test('reminders: a calculated expiry date is reminded like any other, an empty one never is', async () => {
  const calculated = await h.seedDocument({
    name: 'Calculated licence', licenseNo: 'REM-1', expiry: h.daysFromToday(5), issue: h.daysFromToday(-360),
    expirySource: 'calculated', expiryNote: 'Issue date + 1 year', responsible: 'owner@bak.example.test',
  });
  const empty = await h.seedDocument({ name: 'Licence without expiry', licenseNo: 'REM-2', expiry: null, expirySource: 'missing', responsible: 'owner@bak.example.test' });

  const summary = await runDailyCheck();
  assert.equal(summary.documentRemindersSent, 1);

  const orders = (await h.query(`SELECT asset_id, task_type, due_date::text AS due FROM work_orders ORDER BY id`)).rows;
  assert.deepEqual(orders.map((o) => o.asset_id), [calculated]);
  assert.equal(orders[0].due, h.daysFromToday(5));
  assert.equal(h.state.plannerTasks.length, 1);
  assert.match(h.state.plannerTasks[0].title, /Calculated licence/);
  assert.ok(h.state.sent.some((m) => /Calculated licence/.test(m.subject)));
  assert.ok(!h.state.sent.some((m) => /without expiry/.test(m.subject)));
  assert.equal((await h.query(`SELECT planner_task_id FROM assets WHERE id = $1`, [empty])).rows[0].planner_task_id, null);
  assert.deepEqual(await noteTypes(), ['document_task_created']);
});

test('reminders: adding the expiry date later starts the reminders', async () => {
  const id = await h.seedDocument({ name: 'Late expiry', licenseNo: 'REM-3', expiry: null, expirySource: 'missing', responsible: 'owner@bak.example.test' });
  assert.equal((await runDailyCheck()).documentRemindersSent, 0);

  await h.query(`UPDATE assets SET expiry_date = $1, next_due_date = $1, expiry_source = 'manual', expiry_note = NULL WHERE id = $2`, [h.daysFromToday(3), id]);
  assert.equal((await runDailyCheck()).documentRemindersSent, 1);
  assert.equal((await h.query(`SELECT count(*)::int AS n FROM work_orders WHERE asset_id = $1`, [id])).rows[0].n, 1);
});

test('reminders: a calculated date that has passed is escalated as overdue', async () => {
  await h.seedDocument({ name: 'Overdue calculated', licenseNo: 'REM-4', expiry: h.daysFromToday(-2), expirySource: 'calculated', responsible: 'owner@bak.example.test' });
  const summary = await runDailyCheck();
  assert.equal(summary.documentRemindersSent, 1);
  const mail = h.state.sent.find((m) => /Overdue calculated/.test(m.subject));
  assert.ok(mail);
  assert.match(mail.content, /-2 day\(s\) remaining/);
});
