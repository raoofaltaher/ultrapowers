import test from 'node:test';
import assert from 'node:assert/strict';
import { startOdooFake, seed } from './fixtures/odoo-fake.mjs';
import {
  createOdooClient, discoverDb, htmlToText, textToNoteHtml, markdownToNoteHtml, parseOdooTaskUrl, splitTagNames,
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
  assert.throws(() => createOdooClient({ url: 'https://x', db: 'erp', login: 'bot', apiKey: undefined }), (e) => e.code === 'no-credentials');
  assert.throws(() => createOdooClient({ url: 'https://x', db: 'erp', login: undefined, apiKey: 'k' }), (e) => e.code === 'no-credentials');
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

// A QA report is markdown; Odoo's chatter shows HTML, so the note carries the markdown's
// structure: headings, tables, lists, code, links, with the text escaped.
test('markdownToNoteHtml renders headings, paragraphs and inline marks', () => {
  const html = markdownToNoteHtml('# QA report — X\n\nVerdict: **PASS** — all `3` lanes <ok>\nsecond line\n\n## Lanes');
  assert.match(html, /^<h2>QA report — X<\/h2>/);
  assert.match(html, /<p>Verdict: <strong>PASS<\/strong> — all <code>3<\/code> lanes &lt;ok&gt;<br>second line<\/p>/);
  assert.match(html, /<h3>Lanes<\/h3>$/);
});

test('markdownToNoteHtml renders a pipe table with its header row', () => {
  const html = markdownToNoteHtml('| Field | Value |\n|---|---|\n| Ticket | X-1 |\n| Date | 2026 |');
  assert.match(html, /^<table class="table table-sm">/);
  assert.match(html, /<thead><tr><th>Field<\/th><th>Value<\/th><\/tr><\/thead>/);
  assert.match(html, /<tbody><tr><td>Ticket<\/td><td>X-1<\/td><\/tr><tr><td>Date<\/td><td>2026<\/td><\/tr><\/tbody><\/table>$/);
  assert.doesNotMatch(html, /---/);
});

test('markdownToNoteHtml renders lists, fenced code and links', () => {
  const html = markdownToNoteHtml('Pull requests\n- docs: https://g/x/pull/1\n- web: see [the PR](https://g/y/pull/2)\n\n1. first\n2. second\n\n```\ncurl -s <url>\n```');
  assert.match(html, /<ul><li>docs: <a href="https:\/\/g\/x\/pull\/1">https:\/\/g\/x\/pull\/1<\/a><\/li><li>web: see <a href="https:\/\/g\/y\/pull\/2">the PR<\/a><\/li><\/ul>/);
  assert.match(html, /<ol><li>first<\/li><li>second<\/li><\/ol>/);
  assert.match(html, /<pre>curl -s &lt;url&gt;<\/pre>$/);
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
  assert.deepEqual(splitTagNames('Odd, Name', ['Odd, Name']), ['Odd, Name'], 'a tag whose own name holds a comma is read back as one tag');
  assert.equal(splitTagNames('Odd, Name', ['Odd', 'Odd, Name']), null, 'one tag or two: the row cannot be told apart');
  assert.deepEqual(splitTagNames('AI, Back-end', ['AI']), ['AI', 'Back-end'], 'a name that is no longer a current tag is kept');
});

test('tagEventsFromTracking diffs before and after lists into events', () => {
  const messages = [{ id: 51, date: '2026-10-02 19:50:00', author_id: [9, 'Val'] }];
  const rows = [{ mail_message_id: [51, 'm'], field_id: [1, 'Tags'], old_value_char: 'AI, Backend', new_value_char: 'AI, Backend, Ultrapowers Approve' }];
  const ev = tagEventsFromTracking(messages, rows, ['AI', 'Backend', 'Ultrapowers Approve'], () => 'val');
  assert.deepEqual(ev, [{ id: '51', action: 'labeled', label: 'Ultrapowers Approve', actor: 'val', at: '2026-10-02T19:50:00Z' }]);
});

test('tagEventsFromTracking ignores a row whose names cannot be told apart', () => {
  // "Odd" and "Odd, Name" are both tags: the row "Odd, Name" is one tag or two, so it is skipped.
  const rows = [{ mail_message_id: [51, 'm'], field_id: [1, 'Tags'], old_value_char: '', new_value_char: 'Odd, Name, Ultrapowers Approve' }];
  assert.deepEqual(tagEventsFromTracking([{ id: 51, date: '2026-10-02 19:50:00', author_id: [9, 'V'] }], rows, ['Odd', 'Odd, Name', 'Ultrapowers Approve'], () => 'v'), []);
  // "Odd, Name" alone is one tag whose name holds a comma: the row reads as that tag.
  const one = [{ mail_message_id: [51, 'm'], field_id: [1, 'Tags'], old_value_char: '', new_value_char: 'Odd, Name' }];
  assert.deepEqual(tagEventsFromTracking([{ id: 51, date: '2026-10-02 19:50:00', author_id: [9, 'V'] }], one, ['Odd, Name'], () => 'v').map((e) => e.label), ['Odd, Name']);
});

// A tracking row keeps the names of its moment: a tag renamed since, or a user's tag whose
// name is not a current tag, must not hide the control tag events in the same row.
test('tagEventsFromTracking keeps a row whose other names are no longer current tags', () => {
  const messages = [{ id: 51, date: '2026-10-02 19:50:00', author_id: [9, 'V'] }];
  const rows = [{ mail_message_id: [51, 'm'], field_id: [1, 'Tags'], old_value_char: 'AI, Backend', new_value_char: 'AI, Backend, Ultrapowers Approve' }];
  const renamed = tagEventsFromTracking(messages, rows, ['AI', 'Back-end', 'Ultrapowers Approve'], () => 'v');
  assert.deepEqual(renamed.map((e) => [e.action, e.label]), [['labeled', 'Ultrapowers Approve']]);
  const userComma = [{ mail_message_id: [51, 'm'], field_id: [1, 'Tags'], old_value_char: 'Bug, Critical', new_value_char: 'Bug, Critical, Ultrapowers Approve' }];
  const kept = tagEventsFromTracking(messages, userComma, ['Bug, Critical', 'Ultrapowers Approve'], () => 'v');
  assert.deepEqual(kept.map((e) => [e.action, e.label]), [['labeled', 'Ultrapowers Approve']]);
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

test('the client refuses a plain-http URL that is not loopback', () => {
  assert.throws(() => createOdooClient({ url: 'http://erp.example.com', db: 'erp', login: 'bot', apiKey: 'k1' }), (e) => e.code === 'bad-tickets' && /https/.test(e.message));
  assert.ok(createOdooClient({ url: 'http://127.0.0.1:1', db: 'erp', login: 'bot', apiKey: 'k1' }));
  assert.ok(createOdooClient({ url: 'https://erp.example.com', db: 'erp', login: 'bot', apiKey: 'k1' }));
});

test('the client does not follow a redirect, so the key never travels to another host', async () => {
  const elsewhere = await fake(seed());
  const f = await fake(seed({ redirectTo: `${elsewhere.url}/jsonrpc` }));
  await assert.rejects(createOdooClient({ url: f.url, db: 'erp', login: 'bot', apiKey: 'k1' }).authenticate(), (e) => e.code === 'tracker-failed' && /redirect/.test(e.message));
  assert.equal(elsewhere.requests.length, 0);
});
