import test from 'node:test';
import assert from 'node:assert/strict';
import { startOdooFake, seed } from './fixtures/odoo-fake.mjs';
import {
  createOdooClient, discoverDb, htmlToText, textToNoteHtml, parseOdooTaskUrl, splitTagNames,
  tagEventsFromTracking, lastWriterEvents, odooColorIndex, odooIso,
} from '../../skills/autopilot/scripts/odoo.mjs';

const fakes = [];
async function fake(s) {
  const f = await startOdooFake(s);
  fakes.push(f);
  return f;
}
test.after(async () => { for (const f of fakes) await f.close(); });

test('authenticate returns the uid and call sends execute_kw with db, uid and key', async () => {
  const f = await fake(seed({ models: { 'project.task': { read: () => [{ id: 13, name: 'x' }] } } }));
  const c = createOdooClient({ url: f.url, db: 'erp', login: 'bot', apiKey: 'k1' });
  assert.equal(await c.authenticate(), 7);
  await c.call('project.task', 'read', [[13]], { fields: ['name'] });
  assert.deepEqual(f.calls.at(-1), { model: 'project.task', method: 'read', args: [[13]], kwargs: { fields: ['name'] } });
  assert.deepEqual(f.requests.at(-1).params.args.slice(0, 3), ['erp', 7, 'k1']);
});

test('a missing key is no-credentials before any request', () => {
  assert.throws(() => createOdooClient({ url: 'http://x', db: 'erp', login: 'bot', apiKey: undefined }), (e) => e.code === 'no-credentials');
  assert.throws(() => createOdooClient({ url: 'http://x', db: 'erp', login: undefined, apiKey: 'k' }), (e) => e.code === 'no-credentials');
});

test('an Odoo error becomes tracker-failed with Odoo\'s message', async () => {
  const f = await fake(seed({ models: { 'project.task': { read: () => { throw new Error('Access Denied'); } } } }));
  await assert.rejects(
    createOdooClient({ url: f.url, db: 'erp', login: 'bot', apiKey: 'k1' }).call('project.task', 'read', [[1]]),
    (e) => e.code === 'tracker-failed' && /Access Denied/.test(e.message),
  );
});

test('a refused login is tracker-failed', async () => {
  const f = await fake(seed());
  await assert.rejects(createOdooClient({ url: f.url, db: 'erp', login: 'bot', apiKey: 'wrong' }).authenticate(), (e) => e.code === 'tracker-failed' && /refused/.test(e.message));
});

test('a slow server is a timeout', async () => {
  const f = await fake(seed({ delayMs: 200 }));
  await assert.rejects(
    createOdooClient({ url: f.url, db: 'erp', login: 'bot', apiKey: 'k1', env: { ULTRAPOWERS_FETCH_TIMEOUT_MS: '50' } }).authenticate(),
    (e) => e.code === 'timeout',
  );
});

test('discoverDb returns the single database', async () => {
  const f = await fake(seed({ databases: ['erp'] }));
  assert.equal(await discoverDb(f.url), 'erp');
});

test('discoverDb rejects with bad-tickets when the list is disabled or ambiguous', async () => {
  for (const s of [seed({ listDisabled: true }), seed({ databases: ['a', 'b'] })]) {
    const f = await fake(s);
    await assert.rejects(discoverDb(f.url), (e) => e.code === 'bad-tickets' && /db is required/.test(e.message));
  }
});

test('htmlToText keeps paragraphs and drops script, style and data URIs', () => {
  const t = htmlToText('<p>Hi <b>there</b></p><script>x()</script><style>p{}</style><img src="data:image/png;base64,AAA"><ul><li>a</li><li>b &amp; c</li></ul>');
  assert.equal(t, 'Hi there\na\nb & c');
});

test('textToNoteHtml escapes and links', () => {
  assert.equal(textToNoteHtml('a <b> https://x.y/z'), '<pre style="white-space:pre-wrap">a &lt;b&gt; <a href="https://x.y/z">https://x.y/z</a></pre>');
});

test('parseOdooTaskUrl reads project and task from the three shapes', () => {
  assert.deepEqual(parseOdooTaskUrl('https://erp.example.com/odoo/action-577/34/tasks/13627'), { origin: 'https://erp.example.com', project: 34, task: 13627 });
  assert.deepEqual(parseOdooTaskUrl('https://erp.example.com/odoo/project.task/13627'), { origin: 'https://erp.example.com', project: null, task: 13627 });
  assert.deepEqual(parseOdooTaskUrl('https://erp.example.com/web#model=project.task&id=13627&view_type=form'), { origin: 'https://erp.example.com', project: null, task: 13627 });
  assert.equal(parseOdooTaskUrl('https://erp.example.com/odoo/action-577/34'), null);
  assert.equal(parseOdooTaskUrl('ODOO-34-13627'), null);
});

test('splitTagNames splits Odoo display names and refuses an ambiguous split', () => {
  assert.deepEqual(splitTagNames('AI, Backend', ['AI', 'Backend']), ['AI', 'Backend']);
  assert.deepEqual(splitTagNames(false, ['AI']), []);
  assert.equal(splitTagNames('Odd, Name', ['Odd, Name']), null);
});

test('tagEventsFromTracking diffs before and after lists into events', () => {
  const messages = [{ id: 51, date: '2026-10-02 19:50:00', author_id: [9, 'Val'] }];
  const rows = [{ mail_message_id: [51, 'm'], field_id: [1, 'Tags'], old_value_char: 'AI, Backend', new_value_char: 'AI, Backend, Ultrapowers Approve' }];
  const ev = tagEventsFromTracking(messages, rows, ['AI', 'Backend', 'Ultrapowers Approve'], () => 'val');
  assert.deepEqual(ev, [{ id: '51', action: 'labeled', label: 'Ultrapowers Approve', actor: 'val', at: '2026-10-02T19:50:00Z' }]);
});

test('tagEventsFromTracking ignores a row whose names cannot be split', () => {
  const rows = [{ mail_message_id: [51, 'm'], field_id: [1, 'Tags'], old_value_char: '', new_value_char: 'Odd, Name' }];
  assert.deepEqual(tagEventsFromTracking([{ id: 51, date: '2026-10-02 19:50:00', author_id: [9, 'V'] }], rows, ['Odd, Name'], () => 'v'), []);
});

test('lastWriterEvents attributes every current tag to the last writer', () => {
  const ev = lastWriterEvents({ write_uid: [3, 'Bob'], write_date: '2026-10-05 08:00:00' }, ['Ultrapowers Approve'], () => 'bob');
  assert.deepEqual(ev, [{ id: 'write:2026-10-05T08:00:00Z', action: 'labeled', label: 'Ultrapowers Approve', actor: 'bob', at: '2026-10-05T08:00:00Z', attribution: 'last-writer' }]);
});

test('odooColorIndex maps the label palette into 1..11', () => {
  for (const hex of ['0e8a16', '1d76db', 'fbca04', 'd93f0b', '5319e7', 'b60205', '#ededed']) {
    const i = odooColorIndex(hex);
    assert.ok(i >= 1 && i <= 11, `${hex} -> ${i}`);
  }
});

test('odooIso converts an Odoo UTC datetime and leaves ISO alone', () => {
  assert.equal(odooIso('2026-10-05 08:00:00'), '2026-10-05T08:00:00Z');
  assert.equal(odooIso('2026-10-05T08:00:00Z'), '2026-10-05T08:00:00Z');
  assert.equal(odooIso(false), '');
});
