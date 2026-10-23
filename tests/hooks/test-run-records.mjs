// node --test tests/hooks/test-run-records.mjs
// hooks/lib/run-records.mjs: many runs at once, each guarding only its own session or folder.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { startRun, endRun, readRuns, applicableRuns, projectRoot, sessionFromEnv, RUN_TTL_MS } from '../../hooks/lib/run-records.mjs';

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
  assert.throws(() => endRun(root, r.run), { code: 'no-verdict' });
  report(root, 'audit-2026-10-23', 'SECURITY-REPORT.md', '# Security report\nVerdict: PASS\n');
  assert.deepEqual(endRun(root, r.run), { ended: r.run, id: 'audit-2026-10-23', profile: 'hunt' });
  assert.equal(readRuns(root).length, 0);
  assert.match(fs.readFileSync(path.join(root, 'reviews', 'audit-2026-10-23', 'run-log.txt'), 'utf8'), /ended hunt-audit-2026-10-23-/);
  assert.throws(() => endRun(root, r.run), { code: 'no-run' });
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
