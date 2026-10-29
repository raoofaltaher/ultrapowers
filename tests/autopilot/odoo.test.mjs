import test from 'node:test';
import assert from 'node:assert/strict';
import { startOdooFake, seed } from './fixtures/odoo-fake.mjs';
import {
  createOdooClient, discoverDb, htmlToText, stripHiddenElements, textToNoteHtml, markdownToNoteHtml, parseOdooTaskUrl, splitTagNames,
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

// Round 3, Medium 12: text a reader of the ticket does not see (an element hidden by its class, its
// hidden attribute, its style, or a <template>) is dropped with everything inside it. A small scanner
// counts the depth of the same tag name, so a nested element does not end the hidden part early.
test('stripHiddenElements drops an element hidden by a class, the hidden attribute, a style or a template, with everything inside it', () => {
  const hidden = [
    '<p class="d-none">x</p>', '<p class="a  o_hidden b">x</p>', '<p class="sr-only">x</p>', '<p class="visually-hidden">x</p>', '<p class="D-None">x</p>',
    '<p hidden>x</p>', '<p HIDDEN="">x</p>', '<p hidden="hidden">x</p>', '<p class=d-none>x</p>',
    '<p style="display:none">x</p>', '<p style="display : none !important">x</p>', '<p style="DISPLAY:NONE">x</p>', '<p style="color:red;display:none;">x</p>',
    '<p style="visibility:hidden">x</p>', '<p style="font-size:0">x</p>', '<p style="font-size: 0px">x</p>', '<p style="font-size:0.0em">x</p>', '<p style="font-size:0%">x</p>',
    '<p style="opacity:0">x</p>', '<p style="opacity: 0.0">x</p>', '<p style=display:none>x</p>', '<p style="display&#58;none">x</p>', '<p style="display/**/:none">x</p>',
    '<template><p>x</p></template>', '<SPAN HIDDEN>x</SPAN>', '<p title="a>b" hidden>x</p>',
  ];
  for (const html of hidden) assert.deepEqual(stripHiddenElements(`<b>a</b>${html}<i>b</i>`), { text: '<b>a</b><i>b</i>', count: 1 }, html);
});

test('stripHiddenElements keeps an element that is shown, whatever its look-alike class or style', () => {
  const shown = [
    '<p class="d-md-none">x</p>', '<p class="nod-none">x</p>', '<p class="hidden-xs">x</p>', '<p class="o_hidden_not">x</p>',
    '<p style="display:block">x</p>', '<p style="display:inline-block">x</p>', '<p style="font-size:10px">x</p>', '<p style="font-size:0.5em">x</p>',
    '<p style="font-size:100px">x</p>', '<p style="opacity:0.5">x</p>', '<p style="opacity:1">x</p>', '<p style="visibility:visible">x</p>',
    '<p title="hidden">x</p>', '<p data-x="display:none">x</p>', '<p>display:none hidden d-none</p>',
  ];
  for (const html of shown) assert.deepEqual(stripHiddenElements(html), { text: html, count: 0 }, html);
});

test('stripHiddenElements counts the depth of the same tag, so a nested element does not end the hidden part early', () => {
  assert.deepEqual(stripHiddenElements('a<span hidden>b<span>c</span>d<span>e</span>f</span>g'), { text: 'ag', count: 1 });
  assert.deepEqual(stripHiddenElements('a<div hidden>b<div><div>c</div></div>d</div>e<div>f</div>'), { text: 'ae<div>f</div>', count: 1 });
  assert.deepEqual(stripHiddenElements('a<div><div hidden>b</div>c</div>'), { text: 'a<div>c</div>', count: 1 });
  assert.deepEqual(stripHiddenElements('a<div hidden><p hidden>b</p>c</div>d'), { text: 'ad', count: 1 });
  assert.deepEqual(stripHiddenElements('a<div hidden>b</div>c<div hidden>d</div>e'), { text: 'ace', count: 2 });
  assert.deepEqual(stripHiddenElements('a<div hidden><span>b</span><div>c</div>d'), { text: 'a', count: 1 }, 'an element never closed runs to the end');
  assert.deepEqual(stripHiddenElements('a<span hidden>b<span/>c</span>d'), { text: 'ad', count: 1 }, 'a self-closing tag inside does not add a level');
});

test('stripHiddenElements ends a void or self-closing element at its own tag', () => {
  assert.deepEqual(stripHiddenElements('a<img hidden src="x.png">b'), { text: 'ab', count: 1 });
  assert.deepEqual(stripHiddenElements('a<br hidden>b<input hidden>c<hr style="display:none">d'), { text: 'abcd', count: 3 });
  assert.deepEqual(stripHiddenElements('a<span hidden/>b</span>c'), { text: 'ab</span>c', count: 1 });
  assert.deepEqual(stripHiddenElements('a<p>b</p>'), { text: 'a<p>b</p>', count: 0 });
  assert.deepEqual(stripHiddenElements(''), { text: '', count: 0 });
});
