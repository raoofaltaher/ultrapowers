// node --test tests/hooks/test-run-records.mjs
// hooks/lib/run-records.mjs: many runs at once, each guarding only its own session or folder.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { startRun, endRun, readRuns, applicableRuns, pickRun, projectRoot, sessionFromEnv, RUN_TTL_MS } from '../../hooks/lib/run-records.mjs';

const CLI = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'hooks', 'lib', 'run-records.mjs');

function project() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'run-records-'));
  fs.mkdirSync(path.join(root, '.agents'), { recursive: true });
  fs.writeFileSync(path.join(root, '.agents', 'ultrapowers.json'), '{}');
  return root;
}
const report = (root, id, file, text) => {
  fs.mkdirSync(path.join(root, 'reviews', id), { recursive: true });
  fs.writeFileSync(path.join(root, 'reviews', id, file), text);
};

test('several runs are active at once in one project, each with its own record', () => {
  const root = project();
  const a = startRun(root, { profile: 'hunt', id: 'GH-1', session: 's1' });
  const b = startRun(root, { profile: 'hunt', id: 'GH-2', session: 's2' });
  const c = startRun(root, { profile: 'qa', id: 'GH-3', session: null });
  assert.equal(readRuns(root).length, 3);
  assert.notEqual(a.run, b.run);
  assert.equal(c.session, null);
});

test('a record guards only its own session; a record with no session guards every call of its folder', () => {
  const root = project();
  startRun(root, { profile: 'hunt', id: 'GH-1', session: 's1' });
  assert.deepEqual(applicableRuns(root, 's1').map((r) => r.id), ['GH-1']);
  assert.deepEqual(applicableRuns(root, 's2'), []);
  assert.deepEqual(applicableRuns(root, null), []);
  startRun(root, { profile: 'qa', id: 'GH-2', session: null });
  assert.deepEqual(applicableRuns(root, 's2').map((r) => r.id), ['GH-2']);
  assert.deepEqual(applicableRuns(root, null).map((r) => r.id), ['GH-2']);
});

test('two active runs of the same profile and id are refused: both would write reviews/<id>/', () => {
  const root = project();
  startRun(root, { profile: 'qa', id: 'GH-1', session: 's1' });
  assert.throws(() => startRun(root, { profile: 'qa', id: 'GH-1', session: 's2' }), { code: 'run-active' });
  startRun(root, { profile: 'hunt', id: 'GH-1', session: 's2' });
});

test('a record past its run guards nothing and never blocks a new run', () => {
  const root = project();
  const old = Date.now() - RUN_TTL_MS - 1000;
  startRun(root, { profile: 'qa', id: 'GH-1', session: null, now: old });
  assert.deepEqual(applicableRuns(root, null), []);
  startRun(root, { profile: 'qa', id: 'GH-1', session: null });
  assert.equal(readRuns(root).length, 1, 'the expired record is cleared by the next start');
});

test('a corrupt record guards every call: it cannot say whose it is', () => {
  const root = project();
  fs.mkdirSync(path.join(root, '.ultrapowers', 'runs'), { recursive: true });
  fs.writeFileSync(path.join(root, '.ultrapowers', 'runs', 'qa-x-0000000a.json'), '{not json');
  assert.equal(applicableRuns(root, 's9').length, 1);
  assert.equal(applicableRuns(root, 's9')[0].corrupt, true);
});

test('a run ends itself only once its report holds a Verdict line, and the end is logged', () => {
  const root = project();
  const r = startRun(root, { profile: 'hunt', id: 'audit-2026-10-23', session: 's1' });
  const own = { session: 's1' };
  assert.throws(() => endRun(root, r.run, own), { code: 'no-verdict' });
  report(root, 'audit-2026-10-23', 'SECURITY-REPORT.md', '# Security report\nVerdict: PASS\n');
  assert.deepEqual(endRun(root, r.run, own), { ended: r.run, id: 'audit-2026-10-23', profile: 'hunt' });
  assert.equal(readRuns(root).length, 0);
  assert.match(fs.readFileSync(path.join(root, 'reviews', 'audit-2026-10-23', 'run-log.txt'), 'utf8'), /ended hunt-audit-2026-10-23-/);
  assert.throws(() => endRun(root, r.run, own), { code: 'no-run' });
});

test('a session ends only its own runs; a caller with no session is refused unless it forces (a human at a terminal)', () => {
  const root = project();
  const r = startRun(root, { profile: 'qa', id: 'GH-7', session: 's1' });
  report(root, 'GH-7', 'QA-REPORT.md', 'Verdict: PASS\n');
  assert.throws(() => endRun(root, r.run, { session: 's2' }), { code: 'other-session' });
  assert.throws(() => endRun(root, r.run, { session: null }), { code: 'other-session' });
  assert.equal(readRuns(root).length, 1, 'a refused end leaves the record');
  assert.equal(endRun(root, r.run, { session: null, force: true }).ended, r.run);
});

test('a run with no session ends from any caller: it guards its folder, not a session', () => {
  const root = project();
  const r = startRun(root, { profile: 'qa', id: 'GH-8', session: null });
  report(root, 'GH-8', 'QA-REPORT.md', 'Verdict: PASS\n');
  assert.equal(endRun(root, r.run, { session: null }).ended, r.run);
});

test('the CLI: an empty CLAUDE_CODE_SESSION_ID cannot end the run of another session; --force can', () => {
  const root = project();
  const r = startRun(root, { profile: 'qa', id: 'GH-9', session: 's1' });
  report(root, 'GH-9', 'QA-REPORT.md', 'Verdict: PASS\n');
  const env = { ...process.env, CLAUDE_CODE_SESSION_ID: '' };
  const refused = spawnSync(process.execPath, [CLI, 'end', '--root', root, '--run', r.run], { encoding: 'utf8', env });
  assert.equal(refused.status, 2);
  assert.match(refused.stderr, /other-session/);
  assert.equal(readRuns(root).length, 1);
  const forced = spawnSync(process.execPath, [CLI, 'end', '--force', '--root', root, '--run', r.run], { encoding: 'utf8', env });
  assert.equal(forced.status, 0, forced.stderr);
  assert.equal(readRuns(root).length, 0);
});

test('an autopilot stage cannot start a run: the marker at or above the root, or ULTRAPOWERS_AUTOPILOT_INSIDE, refuses it', () => {
  const root = project();
  fs.mkdirSync(path.join(root, '.ultrapowers'), { recursive: true });
  fs.writeFileSync(path.join(root, '.ultrapowers', 'autopilot-active'), '{"ticket":"GH-1","branch":"GH-1-x","scope":["."],"stage":"execute"}');
  assert.throws(() => startRun(root, { profile: 'qa', id: 'X', session: 's1' }), { code: 'autopilot-active' });
  assert.equal(readRuns(root).length, 0, 'no record is written');
  // A marker above the root (the project nested in a worktree of the ticket) counts too.
  const outer = project();
  fs.mkdirSync(path.join(outer, '.ultrapowers'), { recursive: true });
  fs.writeFileSync(path.join(outer, '.ultrapowers', 'autopilot-active'), '{}');
  const inner = path.join(outer, 'wt');
  fs.mkdirSync(path.join(inner, '.agents'), { recursive: true });
  fs.writeFileSync(path.join(inner, '.agents', 'ultrapowers.json'), '{}');
  assert.throws(() => startRun(inner, { profile: 'hunt', id: 'X', session: null }), { code: 'autopilot-active' });
  // The headless stage's environment alone refuses it, marker or not.
  const bare = project();
  assert.throws(() => startRun(bare, { profile: 'qa', id: 'X', session: null, env: { ULTRAPOWERS_AUTOPILOT_INSIDE: '1' } }), { code: 'autopilot-active' });
  assert.equal(startRun(bare, { profile: 'qa', id: 'X', session: null, env: { ULTRAPOWERS_AUTOPILOT_INSIDE: '0' } }).id, 'X');
  const cli = spawnSync(process.execPath, [CLI, 'start', '--root', root, '--profile', 'qa', '--id', 'X'], { encoding: 'utf8' });
  assert.equal(cli.status, 2);
  assert.match(cli.stderr, /autopilot-active/);
});

test('the stage that is the QA gate (marker stage qa) starts its own QA record, and nothing else', () => {
  const root = project();
  fs.mkdirSync(path.join(root, '.ultrapowers'), { recursive: true });
  fs.writeFileSync(path.join(root, '.ultrapowers', 'autopilot-active'), '{"ticket":"GH-1","branch":"GH-1-x","scope":["."],"stage":"qa"}');
  assert.throws(() => startRun(root, { profile: 'hunt', id: 'GH-1', session: 's1' }), { code: 'autopilot-active' });
  const rec = startRun(root, { profile: 'qa', id: 'GH-1', session: 's1', env: { ULTRAPOWERS_AUTOPILOT_INSIDE: '1' } });
  assert.equal(rec.profile, 'qa');
  // An unreadable marker names no stage: refused.
  const broken = project();
  fs.mkdirSync(path.join(broken, '.ultrapowers'), { recursive: true });
  fs.writeFileSync(path.join(broken, '.ultrapowers', 'autopilot-active'), '{nope');
  assert.throws(() => startRun(broken, { profile: 'qa', id: 'GH-1', session: 's1' }), { code: 'autopilot-active' });
});

test('ids and run names that would leave reviews/ are refused', () => {
  const root = project();
  for (const id of ['../x', 'a/b', 'a\\b', '', '..']) assert.throws(() => startRun(root, { profile: 'qa', id, session: null }), { code: 'bad-args' });
  assert.throws(() => endRun(root, '../../x'), { code: 'bad-args' });
  assert.throws(() => startRun(root, { profile: 'autopilot', id: 'GH-1' }), { code: 'bad-args' });
});

test('the project root is the nearest folder with .agents/ultrapowers.json: a nested project is its own', () => {
  const outer = project();
  const inner = path.join(outer, '.claude', 'worktrees', 'task-a');
  fs.mkdirSync(path.join(inner, '.agents'), { recursive: true });
  fs.writeFileSync(path.join(inner, '.agents', 'ultrapowers.json'), '{}');
  fs.mkdirSync(path.join(inner, 'src'), { recursive: true });
  assert.equal(projectRoot(path.join(inner, 'src')), inner);
  assert.equal(projectRoot(path.join(outer, 'docs')), outer);
});

test('the session comes from CLAUDE_CODE_SESSION_ID when the harness passes it', () => {
  assert.equal(sessionFromEnv({ CLAUDE_CODE_SESSION_ID: 'abc' }), 'abc');
  assert.equal(sessionFromEnv({}), null);
});

test('the CLI starts, lists and ends a run, binding the session from the environment', () => {
  const root = project();
  const env = { ...process.env, CLAUDE_CODE_SESSION_ID: 'cli-session' };
  const start = spawnSync(process.execPath, [CLI, 'start', '--root', root, '--profile', 'qa', '--id', 'T-1'], { encoding: 'utf8', env });
  assert.equal(start.status, 0, start.stderr);
  const rec = JSON.parse(start.stdout);
  assert.equal(rec.session, 'cli-session');
  const list = spawnSync(process.execPath, [CLI, 'list', '--root', root], { encoding: 'utf8', env });
  assert.equal(JSON.parse(list.stdout).length, 1);
  const early = spawnSync(process.execPath, [CLI, 'end', '--root', root, '--run', rec.run], { encoding: 'utf8', env });
  assert.equal(early.status, 2);
  assert.match(early.stderr, /no-verdict/);
  report(root, 'T-1', 'QA-REPORT.md', '# QA\n\nVerdict: PASS\n');
  const end = spawnSync(process.execPath, [CLI, 'end', '--root', root, '--run', rec.run], { encoding: 'utf8', env });
  assert.equal(end.status, 0, end.stderr);
});

test('a session that a run guards starts no second run; a record of no session guards every session of its folder', () => {
  const root = project();
  startRun(root, { profile: 'hunt', id: 'GH-1', session: 's1' });
  assert.throws(() => startRun(root, { profile: 'qa', id: 'GH-2', session: 's1' }), { code: 'session-guarded' });
  startRun(root, { profile: 'qa', id: 'GH-2', session: 's2' });
  const folder = startRun(root, { profile: 'qa', id: 'GH-3', session: null });
  assert.throws(() => startRun(root, { profile: 'hunt', id: 'GH-4', session: 's3' }), { code: 'session-guarded' });
  assert.throws(() => startRun(root, { profile: 'hunt', id: 'GH-4', session: null }), { code: 'session-guarded' });
  report(root, 'GH-3', 'QA-REPORT.md', 'Verdict: PASS\n');
  endRun(root, folder.run, { session: null });
  assert.equal(startRun(root, { profile: 'hunt', id: 'GH-4', session: 's3' }).id, 'GH-4');
});

test('a session that a run guards from a parent project starts no run in a nested project either', () => {
  const outer = project();
  const inner = path.join(outer, 'vendor', 'x');
  fs.mkdirSync(path.join(inner, '.agents'), { recursive: true });
  fs.writeFileSync(path.join(inner, '.agents', 'ultrapowers.json'), '{}');
  startRun(outer, { profile: 'hunt', id: 'GH-1', session: 's1' });
  assert.throws(() => startRun(inner, { profile: 'qa', id: 'GH-2', session: 's1' }), { code: 'session-guarded' });
  assert.equal(startRun(inner, { profile: 'qa', id: 'GH-2', session: 's2' }).id, 'GH-2', 'another session is not guarded by it');
});

test('the CLI reads its command from the first argument only: an option before it is no command', () => {
  const root = project();
  const r = spawnSync(process.execPath, [CLI, '--session-only', 'start', 'end', '--root', root, '--profile', 'qa', '--id', 'y'], { encoding: 'utf8' });
  assert.notEqual(r.status, 0, r.stdout);
  assert.equal(readRuns(root).length, 0, 'no record was written');
});

test('a record dated in the future guards nothing: a planted startedAt cannot outlive the 24-hour expiry', () => {
  const root = project();
  fs.mkdirSync(path.join(root, '.ultrapowers', 'runs'), { recursive: true });
  const ahead = new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString();
  fs.writeFileSync(path.join(root, '.ultrapowers', 'runs', 'qa-GH-1-0a1b2c3d.json'), JSON.stringify({ run: 'qa-GH-1-0a1b2c3d', profile: 'qa', id: 'GH-1', session: null, startedAt: ahead }));
  assert.deepEqual(applicableRuns(root, null), []);
  // a clock a little ahead is no expiry
  const soon = new Date(Date.now() + 60 * 1000).toISOString();
  fs.writeFileSync(path.join(root, '.ultrapowers', 'runs', 'qa-GH-2-0a1b2c3e.json'), JSON.stringify({ run: 'qa-GH-2-0a1b2c3e', profile: 'qa', id: 'GH-2', session: null, startedAt: soon }));
  assert.deepEqual(applicableRuns(root, null).map((r) => r.id), ['GH-2']);
});

test('pick: a corrupt record first, then a hunt before QA; --session-only counts only a record of the event\'s session', () => {
  const root = project();
  const ev = (s) => JSON.stringify({ session_id: s, tool_name: 'Bash' });
  startRun(root, { profile: 'qa', id: 'GH-1', session: null });
  fs.writeFileSync(path.join(root, '.ultrapowers', 'runs', 'hunt-A-0a1b2c3d.json'), JSON.stringify({ run: 'hunt-A-0a1b2c3d', profile: 'hunt', id: 'A', session: 's1', startedAt: new Date().toISOString() }));
  assert.equal(pickRun(root, ev('s1')).profile, 'hunt');
  assert.equal(pickRun(root, ev('s2')).profile, 'qa');
  assert.equal(pickRun(root, ev('s1'), Date.now(), { sessionOnly: true }).profile, 'hunt');
  assert.equal(pickRun(root, ev('s2'), Date.now(), { sessionOnly: true }), null, 'a record of no session counts in its own project only');
  assert.equal(pickRun(root, '{}', Date.now(), { sessionOnly: true }), null);
  const cli = (s, extra) => spawnSync(process.execPath, [CLI, 'pick', '--root', root, ...extra], { input: ev(s), encoding: 'utf8' }).stdout.split('\t')[0].trim();
  assert.equal(cli('s2', []), 'qa');
  assert.equal(cli('s2', ['--session-only']), '');
  assert.equal(cli('s1', ['--session-only']), 'hunt');
  fs.writeFileSync(path.join(root, '.ultrapowers', 'runs', 'qa-x-0000000a.json'), '{not json');
  assert.equal(cli('s2', []), 'corrupt');
  assert.equal(cli('s2', ['--session-only']), '', 'a corrupt record cannot say it belongs to this session');
});
