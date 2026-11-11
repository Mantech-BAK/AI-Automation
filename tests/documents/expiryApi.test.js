const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const h = require('../helpers/harness');

// The real dashboard router, signed in as an administrator, on a local port.
let server;
let base;
test.before(async () => {
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => {
    req.session = { user: { id: 1, role: 'admin', email: 'admin@bak.example.test', name: 'Admin' } };
    next();
  });
  app.use('/api/dashboard', require('../../routes/dashboard'));
  server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await h.pool.end();
});
test.beforeEach(() => h.reset());

const call = async (method, path, body) => {
  const response = await h.realFetch(`${base}${path}`, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  return { status: response.status, body: await response.json().catch(() => ({})) };
};
const row = async (id) => (await h.query(`SELECT expiry_date::text AS expiry_date, next_due_date::text AS next_due_date, expiry_source, expiry_note FROM assets WHERE id = $1`, [id])).rows[0];

test('a document saved without an expiry date appears in the Documents list with its flag', async () => {
  await h.run([h.email({ files: ['no_expiry.pdf', 'valid_4_years.pdf'] })]);
  const { status, body } = await call('GET', '/api/dashboard/assets?type=Document');
  assert.equal(status, 200);
  const missing = body.find((d) => d.license_no === 'LIC-100100');
  const calculated = body.find((d) => d.license_no === 'LIC-200200');
  assert.deepEqual([missing.expiry_date, missing.expiry_source], [null, 'missing']);
  assert.match(missing.expiry_note, /no expiry date/);
  assert.deepEqual([calculated.expiry_date, calculated.expiry_source], ['2030-01-15', 'calculated']);
  assert.equal(calculated.expiry_note, 'Issue date 15/01/2026 + 4 years');
});

test('Add expiry date: saves it, clears the flag, marks it manual', async () => {
  const id = await h.seedDocument({ name: 'Needs a date', licenseNo: 'API-1', expiry: null, expirySource: 'missing', expiryNote: 'No expiry date found' });
  await h.query(`INSERT INTO document_versions (asset_id, onedrive_url, expiry_date, issue_date, file_name) VALUES ($1, 'https://onedrive.test/x', NULL, NULL, 'x.pdf')`, [id]);

  const { status, body } = await call('PATCH', `/api/dashboard/documents/${id}/expiry`, { expiry_date: '2030-06-30' });
  assert.equal(status, 200);
  assert.equal(body.expiry_source, 'manual');
  assert.equal(body.expiry_note, null);

  assert.deepEqual(await row(id), { expiry_date: '2030-06-30', next_due_date: '2030-06-30', expiry_source: 'manual', expiry_note: null });
  assert.equal((await h.query(`SELECT expiry_date::text AS d FROM document_versions WHERE asset_id = $1`, [id])).rows[0].d, '2030-06-30');
});

test('Add expiry date: it can be reviewed and changed when it was calculated', async () => {
  const id = await h.seedDocument({ name: 'Calculated', licenseNo: 'API-2', expiry: '2030-01-15', issue: '2026-01-15', expirySource: 'calculated', expiryNote: 'Issue date 15/01/2026 + 4 years' });
  const { status } = await call('PATCH', `/api/dashboard/documents/${id}/expiry`, { expiry_date: '2030-01-14' });
  assert.equal(status, 200);
  assert.deepEqual((await row(id)).expiry_source, 'manual');
});

test('Add expiry date: bad input is refused and nothing changes', async () => {
  const id = await h.seedDocument({ name: 'Needs a date', licenseNo: 'API-3', expiry: null, issue: '2026-05-01', expirySource: 'missing' });
  for (const value of ['', 'tomorrow', '2030-13-40', '2030-02-30', '30/06/2030']) {
    const { status, body } = await call('PATCH', `/api/dashboard/documents/${id}/expiry`, { expiry_date: value });
    assert.equal(status, 400, `"${value}" should be refused`);
    assert.match(body.error, /valid expiry date/);
  }
  const beforeIssue = await call('PATCH', `/api/dashboard/documents/${id}/expiry`, { expiry_date: '2026-04-30' });
  assert.equal(beforeIssue.status, 400);
  assert.match(beforeIssue.body.error, /before the issue date/);
  assert.equal((await row(id)).expiry_date, null);
  assert.equal((await call('PATCH', `/api/dashboard/documents/999999/expiry`, { expiry_date: '2030-01-01' })).status, 404);
});

test('Add expiry date: only documents - not equipment', async () => {
  const { rows } = await h.query(
    `INSERT INTO assets (equipment_name, site_location, maintenance_interval_days, estimated_duration_hours, type_id)
     VALUES ('Pump', 'Plant', 30, 1, (SELECT id FROM asset_types WHERE name = 'Equipment')) RETURNING id`
  );
  assert.equal((await call('PATCH', `/api/dashboard/documents/${rows[0].id}/expiry`, { expiry_date: '2030-01-01' })).status, 404);
});

test('editing a document the usual way: a typed date is manual, an unchanged one keeps its source', async () => {
  const id = await h.seedDocument({ name: 'Edit me', licenseNo: 'API-4', expiry: '2030-01-15', issue: '2026-01-15', expirySource: 'calculated', expiryNote: 'Issue date + 4 years' });
  const edit = (expiry) =>
    call('PUT', `/api/dashboard/assets/${id}`, {
      equipment_name: 'Edit me', site_location: 'Unassigned', maintenance_interval_days: 365, estimated_duration_hours: 1,
      registration_date: '2026-01-15', expiry_date: expiry, next_due_date: expiry,
    });

  assert.equal((await edit('2030-01-15')).status, 200); // saved without touching the date
  assert.equal((await row(id)).expiry_source, 'calculated');

  assert.equal((await edit('2031-01-15')).status, 200);
  assert.deepEqual(await row(id), { expiry_date: '2031-01-15', next_due_date: '2031-01-15', expiry_source: 'manual', expiry_note: null });
});

test('after "Add expiry date" the reminder job picks the document up', async () => {
  const id = await h.seedDocument({ name: 'Soon due', licenseNo: 'API-5', expiry: null, expirySource: 'missing', responsible: 'owner@bak.example.test' });
  const { runDailyCheck } = require('../../jobs/dailyCheck');
  assert.equal((await runDailyCheck()).documentRemindersSent, 0);

  const { body } = await call('PATCH', `/api/dashboard/documents/${id}/expiry`, { expiry_date: h.daysFromToday(4) });
  assert.equal(body.planner_sync.status, 'created'); // inside the reminder window with a responsible person: the Planner task is created at once
  assert.equal(h.state.plannerTasks.length, 1);
  assert.equal((await runDailyCheck()).documentRemindersSent, 1);
});
