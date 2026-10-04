import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { trackerFor } from '../../skills/autopilot/scripts/tracker.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const STUB = path.join(HERE, 'fixtures', 'tracker-stub.mjs');
const FIXTURES = path.join(HERE, 'fixtures');

const GH = { provider: 'github', host: 'github.com', path: 'o/r', number: 16 };
const GL = { provider: 'gitlab', host: 'gitlab.example.com', path: 'acme/platform/web', number: 7 };

// Builds an env whose stub answers `map`; fixture files are copied beside map.json.
function env(map, extra = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tracker-stub-'));
  for (const v of Object.values(map)) {
    if (v.file) fs.copyFileSync(path.join(FIXTURES, v.file), path.join(dir, v.file));
  }
  fs.writeFileSync(path.join(dir, 'map.json'), JSON.stringify(map));
  const log = path.join(dir, 'calls.log');
  const e = { ...process.env, ULTRAPOWERS_GH: STUB, ULTRAPOWERS_GLAB: STUB, STUB_DIR: dir, STUB_LOG: log, ...extra };
  e.calls = () => (fs.existsSync(log) ? fs.readFileSync(log, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []);
  return e;
}

test('github labelEvents paginates and normalizes', async () => {
  const e = env({ 'api repos/o/r/issues/16/timeline': { file: 'timeline-2pages.json' } });
  const ev = await trackerFor(GH, e).labelEvents(16);
  assert.equal(ev.length, 3);
  assert.deepEqual(ev[2], { id: 'e3', action: 'labeled', label: 'up:approve', actor: 'alice', at: '2026-10-04T10:00:00Z' });
  assert.deepEqual(ev[1], { id: '3', action: 'unlabeled', label: 'enhancement', actor: 'owner', at: '2026-10-03T00:00:00Z' });
  const call = e.calls()[0].args;
  assert.ok(call.includes('--paginate') && call.includes('--slurp'), JSON.stringify(call));
});

test('gitlab labelEvents loops pages until a short page', async () => {
  const page1 = Array.from({ length: 100 }, (_, i) => ({ id: i + 1, action: 'add', label: { name: 'bug' }, user: { username: 'u' }, created_at: '2026-10-01T00:00:00Z' }));
  const page2 = [{ id: 101, action: 'remove', label: { name: 'up:approve' }, user: { username: 'alice' }, created_at: '2026-10-04T10:00:00Z' }];
  const e = env({
    'api projects/acme%2Fplatform%2Fweb/issues/7/resource_label_events?per_page=100&page=1': { stdout: page1 },
    'api projects/acme%2Fplatform%2Fweb/issues/7/resource_label_events?per_page=100&page=2': { stdout: page2 },
  });
  const ev = await trackerFor(GL, e).labelEvents(7);
  assert.equal(ev.length, 101);
  assert.deepEqual(ev[100], { id: '101', action: 'unlabeled', label: 'up:approve', actor: 'alice', at: '2026-10-04T10:00:00Z' });
  assert.equal(e.calls().length, 2);
});

test('github permission reads the permission field and maps 404 to none', async () => {
  const e = env({ 'api repos/o/r/collaborators/alice/permission': { stdout: { permission: 'write', role_name: 'write' } } });
  assert.equal(await trackerFor(GH, e).permission('alice'), 'write');
  const e2 = env({ 'api repos/o/r/collaborators/nobody/permission': { exit: 1, stderr: 'gh: Not Found (HTTP 404)' } });
  assert.equal(await trackerFor(GH, e2).permission('nobody'), 'none');
});

test('gitlab permission maps access levels', async () => {
  const user = { 'api users?username=bob': { stdout: [{ id: 7, username: 'bob' }] } };
  const member = (level) => ({ ...user, 'api projects/acme%2Fplatform%2Fweb/members/all/7': { stdout: { id: 7, access_level: level } } });
  assert.equal(await trackerFor(GL, env(member(40))).permission('bob'), 'write');
  assert.equal(await trackerFor(GL, env(member(50))).permission('bob'), 'admin');
  assert.equal(await trackerFor(GL, env(member(30))).permission('bob'), 'read');
  assert.equal(await trackerFor(GL, env({ 'api users?username=bob': { stdout: [] } })).permission('bob'), 'none');
});

test('me, title, labels and listTickets', async () => {
  const e = env({
    'api user': { stdout: { login: 'engine-bot' } },
    'issue view 16 -R o/r --json title': { stdout: { title: 'Fix it' } },
    'issue view 16 -R o/r --json labels': { stdout: { labels: [{ name: 'bug' }, { name: 'up:ready' }] } },
    'issue list -R o/r --label up:ready': { stdout: [{ number: 16, title: 'T', updatedAt: '2026-10-04T00:00:00Z' }] },
  });
  const t = trackerFor(GH, e);
  assert.equal(await t.me(), 'engine-bot');
  assert.equal(await t.title(16), 'Fix it');
  assert.deepEqual(await t.labels(16), ['bug', 'up:ready']);
  assert.deepEqual(await t.listTickets('up:ready'), [{ number: 16, title: 'T', updatedAt: '2026-10-04T00:00:00Z' }]);
  const gl = env({
    'api user': { stdout: { username: 'bot' } },
    'issue view 7 -R acme/platform/web -F json': { stdout: { iid: 7, title: 'G title', labels: ['x'] } },
    'issue list -R acme/platform/web -l up:ready -F json': { stdout: [{ iid: 7, title: 'G', updated_at: '2026-10-04T00:00:00Z' }] },
  });
  const g = trackerFor(GL, gl);
  assert.equal(await g.me(), 'bot');
  assert.equal(await g.title(7), 'G title');
  assert.deepEqual(await g.labels(7), ['x']);
  assert.deepEqual(await g.listTickets('up:ready'), [{ number: 7, title: 'G', updatedAt: '2026-10-04T00:00:00Z' }]);
});

test('comments are normalized and filtered by since', async () => {
  const e = env({
    'api repos/o/r/issues/16/comments': { stdout: [[
      { id: 1, user: { login: 'owner' }, created_at: '2026-10-04T09:00:00Z', body: 'old', html_url: 'u1' },
      { id: 2, user: { login: 'alice' }, created_at: '2026-10-04T11:00:00Z', body: 'please change X', html_url: 'u2' },
    ]] },
  });
  const c = await trackerFor(GH, e).comments(16, '2026-10-04T10:00:00Z');
  assert.deepEqual(c, [{ id: '2', author: 'alice', at: '2026-10-04T11:00:00Z', body: 'please change X', url: 'u2' }]);
  assert.ok(e.calls()[0].args.some((a) => a.includes('since=2026-10-04T10%3A00%3A00Z') || a.includes('since=2026-10-04T10:00:00Z')));
});

test('comment passes the body on stdin, never argv, and returns the url', async () => {
  const e = env({ 'issue comment 16 -R o/r --body-file -': { stdout: 'https://github.com/o/r/issues/16#issuecomment-1\n' } });
  const url = await trackerFor(GH, e).comment(16, 'BODY-TEXT with `code`');
  assert.equal(url, 'https://github.com/o/r/issues/16#issuecomment-1');
  const call = e.calls()[0];
  assert.ok(!call.args.some((a) => a.includes('BODY-TEXT')));
  assert.equal(call.stdin, 'BODY-TEXT with `code`');
});

test('labels are added and removed with marker-derived arguments', async () => {
  const e = env({ 'issue edit 16 -R o/r --add-label up:running': { stdout: '' }, 'issue edit 16 -R o/r --remove-label up:approve': { stdout: '' } });
  const t = trackerFor(GH, e);
  await t.addLabel(16, 'up:running');
  await t.removeLabel(16, 'up:approve');
  assert.equal(e.calls().length, 2);
  const gl = env({ 'issue update 7 -R acme/platform/web --label up:running': { stdout: '' }, 'issue update 7 -R acme/platform/web --unlabel up:approve': { stdout: '' } });
  const g = trackerFor(GL, gl);
  await g.addLabel(7, 'up:running');
  await g.removeLabel(7, 'up:approve');
  assert.equal(gl.calls().length, 2);
});

test('ensureLabel creates or updates; an existing gitlab label is not an error', async () => {
  const e = env({ 'label create up:ready -R o/r --color 0e8a16 --description Take this ticket --force': { stdout: '' } });
  await trackerFor(GH, e).ensureLabel('up:ready', '0e8a16', 'Take this ticket');
  const gl = env({ 'label create -R acme/platform/web --name up:ready --color #0e8a16 --description Take this ticket': { exit: 1, stderr: 'Label already exists' } });
  await trackerFor(GL, gl).ensureLabel('up:ready', '0e8a16', 'Take this ticket');
});

test('createPr returns the url and uses only the given arguments', async () => {
  const e = env({ 'pr create -R o/r --head GH-16-x --base dev --title GH-16: x --body-file -': { stdout: 'https://github.com/o/r/pull/9\n' } });
  const url = await trackerFor(GH, e).createPr({ head: 'GH-16-x', base: 'dev', title: 'GH-16: x', body: 'cites packet' });
  assert.equal(url, 'https://github.com/o/r/pull/9');
  assert.equal(e.calls()[0].stdin, 'cites packet');
  const gl = env({ 'mr create -R acme/platform/web --source-branch GL-web-7-x --target-branch main --title GL-web-7: x --description cites --yes': { stdout: 'Creating merge request...\nhttps://gitlab.example.com/acme/platform/web/-/merge_requests/3\n' } });
  assert.equal(await trackerFor(GL, gl).createPr({ head: 'GL-web-7-x', base: 'main', title: 'GL-web-7: x', body: 'cites' }), 'https://gitlab.example.com/acme/platform/web/-/merge_requests/3');
});

test('cliReady follows auth status; gitlab sets GITLAB_HOST', async () => {
  const e = env({ 'auth status --hostname github.com': { stdout: '' } });
  assert.equal(await trackerFor(GH, e).cliReady(), true);
  const bad = env({ 'auth status --hostname github.com': { exit: 1 } });
  assert.equal(await trackerFor(GH, bad).cliReady(), false);
});

test('missing cli -> no-cli; a failing call -> tracker-failed with stderr; a hang -> timeout', async () => {
  await assert.rejects(trackerFor(GH, { ...process.env, ULTRAPOWERS_GH: path.join(os.tmpdir(), 'nope', 'gh.mjs') }).me(), { code: 'no-cli' });
  const e = env({ 'api user': { exit: 1, stderr: 'boom' } });
  await assert.rejects(trackerFor(GH, e).me(), (err) => err.code === 'tracker-failed' && /boom/.test(err.message));
  const slow = env({}, { STUB_SLEEP_MS: '2000', ULTRAPOWERS_FETCH_TIMEOUT_MS: '200' });
  await assert.rejects(trackerFor(GH, slow).me(), { code: 'timeout' });
});
