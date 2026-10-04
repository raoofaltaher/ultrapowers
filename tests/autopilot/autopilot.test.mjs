import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { makeWorkspace as workspace, git } from './fixtures/make-workspace.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..');
const ENGINE = path.join(REPO, 'skills', 'autopilot', 'scripts', 'autopilot.mjs');

const SPEC = (scope) => `# Spec\n\n## Repositories in scope\n\n${scope.map((s) => `- ${s}`).join('\n')}\n\n## Assumption ledger\n\n| # | Question | Chosen answer | Confidence | Reason |\n|---|---|---|---|---|\n| 1 | Which cache? | none | low | not asked |\n| 2 | Which auth? | OIDC | high | the app uses it |\n`;
const PLAN = (scope) => `# Plan\n\n## Repositories in scope\n\n${scope.map((s) => `- ${s}`).join('\n')}\n\n### Task 1\n`;

// Runs scaffold, spec and plan as the agent would, up to the gate.
function throughPlan(ws, { scope = ['.'], planScope = scope } = {}) {
  run(ws, ['begin', 'GH-16', 'scaffold']);
  fs.mkdirSync(path.join(ws.root, 'tasks', 'GH-16'), { recursive: true });
  fs.writeFileSync(path.join(ws.root, 'tasks', 'GH-16', 'GH-16.md'), '# GH-16 - Fix it now please\n');
  run(ws, ['end', 'GH-16', 'scaffold', '--result', JSON.stringify({ ok: true })]);
  run(ws, ['begin', 'GH-16', 'spec']);
  fs.mkdirSync(path.join(ws.root, 'specs', 'GH-16'), { recursive: true });
  fs.writeFileSync(path.join(ws.root, 'specs', 'GH-16', 'Spec.md'), SPEC(scope));
  git(ws.root, 'add', '-A');
  git(ws.root, 'commit', '-q', '-m', 'spec(GH-16): spec');
  run(ws, ['end', 'GH-16', 'spec', '--result', JSON.stringify({ ok: true })]);
  run(ws, ['begin', 'GH-16', 'plan']);
  fs.mkdirSync(path.join(ws.root, 'plans', 'GH-16'), { recursive: true });
  fs.writeFileSync(path.join(ws.root, 'plans', 'GH-16', 'Plan.md'), PLAN(planScope));
  git(ws.root, 'add', '-A');
  git(ws.root, 'commit', '-q', '-m', 'plan(GH-16): plan');
  run(ws, ['end', 'GH-16', 'plan', '--result', JSON.stringify({ ok: true })]);
}

const APPROVE_AT = '2999-01-01T00:00:00Z';
const approvedBy = (login) => ({
  'api repos/o/r/issues/16/timeline': { stdout: [[{ id: 'e1', event: 'labeled', label: { name: 'up:approve' }, actor: { login }, created_at: APPROVE_AT }]] },
  [`api repos/o/r/collaborators/${login}/permission`]: { stdout: { permission: 'write' } },
  'issue edit 16 -R o/r --remove-label up:approve': { stdout: '' },
});
const stdinOf = (ws, pred) => {
  const log = fs.readFileSync(path.join(ws.stubDir, 'calls.log'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  return log.filter((c) => pred(c.args)).map((c) => c.stdin);
};

export function run(ws, args, extraEnv = {}) {
  const result = spawnSync(process.execPath, [ENGINE, ...args, '--root', ws.root], { cwd: ws.root, encoding: 'utf8', env: { ...ws.env, ...extraEnv } });
  let json = null;
  try { json = JSON.parse(result.stdout); } catch { json = null; }
  return { code: result.status, json, stdout: result.stdout, stderr: result.stderr };
}

const state = (ws) => JSON.parse(fs.readFileSync(path.join(ws.root, 'tasks', 'GH-16', 'autopilot.json'), 'utf8'));
const logLines = (ws) => fs.readFileSync(path.join(ws.root, 'tasks', 'GH-16', 'stage-log.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
const lockFile = (ws) => path.join(ws.root, '.ultrapowers', 'autopilot', 'GH-16.lock');
const marker = (ws) => path.join(ws.root, '.ultrapowers', 'autopilot-active');

test('next on a fresh ticket prints run scaffold with the mode', () => {
  const ws = workspace();
  const r = run(ws, ['next', 'GH-16']);
  assert.equal(r.code, 0, r.stdout + r.stderr);
  assert.equal(r.json.action, 'run');
  assert.equal(r.json.stage, 'scaffold');
  assert.equal(r.json.reason, 'new-ticket');
  assert.equal(r.json.mode, 'gated');
  assert.equal(r.json.state, null);
});

test('next honours --mode and a mode label; off stops', () => {
  const ws = workspace({ map: { 'issue view 16 -R o/r --json labels': { stdout: { labels: [{ name: 'up:mode:full' }] } } } });
  assert.equal(run(ws, ['next', 'GH-16']).json.mode, 'full');
  assert.equal(run(ws, ['next', 'GH-16', '--mode', 'gated']).json.mode, 'gated');
  const off = run(ws, ['next', 'GH-16', '--mode', 'off']);
  assert.deepEqual([off.json.action, off.json.reason], ['stop', 'mode-off']);
  const none = workspace({ autopilot: null });
  assert.deepEqual([run(none, ['next', 'GH-16']).json.action, run(none, ['next', 'GH-16']).json.reason], ['stop', 'mode-off']);
});

test('next with a local id exits 2 local-ticket; bad args exit 2', () => {
  const ws = workspace();
  const r = run(ws, ['next', 'PROJ-1']);
  assert.equal(r.code, 2);
  assert.equal(r.json.error.code, 'local-ticket');
  assert.match(r.json.error.message, /new-task/);
  assert.equal(run(ws, ['dance', 'GH-16']).json.error.code, 'bad-args');
  assert.equal(run(ws, ['begin', 'GH-16', 'fly']).json.error.code, 'bad-args');
});

test('begin scaffold takes the lock, writes the marker, creates the docs branch and marks running', () => {
  const ws = workspace();
  const r = run(ws, ['begin', 'GH-16', 'scaffold', '--door', 'command']);
  assert.equal(r.code, 0, r.stdout + r.stderr);
  assert.equal(r.json.stage, 'scaffold');
  assert.equal(r.json.branch, 'GH-16-fix-it-now-please');
  assert.equal(JSON.parse(fs.readFileSync(lockFile(ws), 'utf8')).door, 'command');
  assert.deepEqual(JSON.parse(fs.readFileSync(marker(ws), 'utf8')), { ticket: 'GH-16', branch: 'GH-16-fix-it-now-please', scope: [], stage: 'scaffold' });
  assert.equal(git(ws.root, 'branch', '--show-current'), 'GH-16-fix-it-now-please');
  assert.equal(fs.existsSync(path.join(ws.root, 'tasks', 'GH-16')), false, 'nothing under tasks/<ID> before end');
  assert.ok(ws.calls().some((a) => a.includes('--add-label') && a.includes('up:running')));
  const again = run(ws, ['begin', 'GH-16', 'scaffold', '--door', 'watch']);
  assert.equal(again.code, 2);
  assert.equal(again.json.error.code, 'locked');
});

test('end scaffold writes state and log, commits tasks/<ID>, clears marker and lock; next says spec', () => {
  const ws = workspace();
  run(ws, ['begin', 'GH-16', 'scaffold']);
  fs.mkdirSync(path.join(ws.root, 'tasks', 'GH-16'), { recursive: true });
  fs.writeFileSync(path.join(ws.root, 'tasks', 'GH-16', 'GH-16.md'), '# GH-16 - Fix it now please\n');
  const r = run(ws, ['end', 'GH-16', 'scaffold', '--result', JSON.stringify({ ok: true })]);
  assert.equal(r.code, 0, r.stdout + r.stderr);
  const s = state(ws);
  assert.equal(s.stage, 'scaffold');
  assert.equal(s.stageStatus, 'finished');
  assert.equal(s.title, 'Fix it now please');
  assert.equal(s.mode, 'gated');
  assert.equal(s.docs.branch, 'GH-16-fix-it-now-please');
  assert.equal(s.docs.base, 'main');
  assert.equal(s.docs.tip, git(ws.root, 'log', '-1', '--format=%H', '--', 'tasks/GH-16/GH-16.md'), 'the work tip is the commit that carries the brief');
  assert.equal(s.docs.tip, git(ws.root, 'rev-parse', 'HEAD~1'), 'the state-only commit on top does not count');
  assert.deepEqual(s.source, { provider: 'github', path: 'o/r', number: 16 });
  const lines = logLines(ws);
  assert.deepEqual(lines.map((l) => l.event), ['started', 'finished']);
  assert.equal(lines[0].trigger, 'command');
  assert.equal(lines[1].sha, s.docs.tip);
  assert.equal(fs.existsSync(marker(ws)), false);
  assert.equal(fs.existsSync(lockFile(ws)), false);
  assert.match(git(ws.root, 'log', '-2', '--format=%s'), /autopilot state\nchore\(GH-16\): autopilot scaffold finished/);
  assert.equal(git(ws.root, 'status', '--porcelain'), '');
  const n = run(ws, ['next', 'GH-16']);
  assert.deepEqual([n.json.action, n.json.stage], ['run', 'spec']);
  const st = run(ws, ['status', 'GH-16']);
  assert.equal(st.json.state.stage, 'scaffold');
  assert.equal(st.json.log.length, 2);
  assert.deepEqual(st.json.chain, { ok: true });
});

test('end with ok false logs blocked, labels and comments; a third attempt stops', () => {
  const ws = workspace();
  run(ws, ['begin', 'GH-16', 'scaffold']);
  fs.mkdirSync(path.join(ws.root, 'tasks', 'GH-16'), { recursive: true });
  run(ws, ['end', 'GH-16', 'scaffold', '--result', JSON.stringify({ ok: true })]);
  run(ws, ['begin', 'GH-16', 'spec']);
  assert.equal(state(ws).stageStatus, 'running');
  assert.equal(state(ws).attempt, 1);
  const r = run(ws, ['end', 'GH-16', 'spec', '--result', JSON.stringify({ ok: false, message: 'the spec stage crashed' })]);
  assert.equal(r.code, 0, r.stdout + r.stderr);
  assert.equal(state(ws).stageStatus, 'blocked');
  assert.equal(logLines(ws).at(-1).event, 'blocked');
  assert.ok(ws.calls().some((a) => a.includes('--add-label') && a.includes('up:blocked')));
  assert.ok(ws.calls().some((a) => a[0] === 'issue' && a[1] === 'comment'));
  const n = run(ws, ['next', 'GH-16']);
  assert.deepEqual([n.json.action, n.json.stage, n.json.reason], ['run', 'spec', 'spec-retry']);
  run(ws, ['begin', 'GH-16', 'spec']);
  assert.equal(state(ws).attempt, 2);
  run(ws, ['end', 'GH-16', 'spec', '--result', JSON.stringify({ ok: false, message: 'again' })]);
  run(ws, ['begin', 'GH-16', 'spec']);
  assert.equal(state(ws).attempt, 3);
  run(ws, ['end', 'GH-16', 'spec', '--result', JSON.stringify({ ok: false, message: 'and again' })]);
  assert.deepEqual([run(ws, ['next', 'GH-16']).json.action, run(ws, ['next', 'GH-16']).json.reason], ['stop', 'blocked']);
});

test('a stale lock from a dead pid is removed by begin', () => {
  const ws = workspace();
  fs.mkdirSync(path.dirname(lockFile(ws)), { recursive: true });
  fs.writeFileSync(lockFile(ws), JSON.stringify({ pid: 999999, door: 'watch', startedAt: '2026-01-01T00:00:00Z' }));
  const r = run(ws, ['begin', 'GH-16', 'scaffold']);
  assert.equal(r.code, 0, r.stdout + r.stderr);
  assert.equal(JSON.parse(fs.readFileSync(lockFile(ws), 'utf8')).door, 'command');
});

test('next reports locked while the other door runs and leaves the running label alone', () => {
  const ws = workspace();
  run(ws, ['begin', 'GH-16', 'scaffold', '--door', 'watch']);
  // a live lock: this test process's own pid, under the other door
  fs.writeFileSync(lockFile(ws), JSON.stringify({ pid: process.pid, door: 'watch', startedAt: '2026-01-01T00:00:00Z' }));
  const n = run(ws, ['next', 'GH-16']);
  assert.deepEqual([n.json.action, n.json.reason], ['wait', 'locked']);
  assert.ok(!ws.calls().some((a) => a.includes('--remove-label')));
});

// ---- Task 7: packet, approval and pr ----

test('packet pushes the docs branch, posts under 25 lines, records tips and clears running', () => {
  const ws = workspace();
  throughPlan(ws);
  assert.deepEqual([run(ws, ['next', 'GH-16']).json.action, run(ws, ['next', 'GH-16']).json.stage], ['run', 'gate']);
  const r = run(ws, ['packet', 'GH-16']);
  assert.equal(r.code, 0, r.stdout + r.stderr);
  const bodies = stdinOf(ws, (a) => a[0] === 'issue' && a[1] === 'comment');
  assert.equal(bodies.length, 1);
  const lines = bodies[0].split('\n');
  assert.ok(lines.length <= 25, `${lines.length} lines`);
  assert.match(bodies[0], /Autopilot packet for GH-16 — gate 1 of 2 — mode gated/);
  assert.match(bodies[0], /https:\/\/github\.com\/o\/r\/blob\/[0-9a-f]{40}\/specs\/GH-16\/Spec\.md/);
  assert.match(bodies[0], /Which cache\?/);
  assert.match(bodies[0], /Packet id [0-9a-f]{12}/);
  const s = state(ws);
  assert.equal(s.stage, 'gate');
  assert.equal(s.stageStatus, 'finished');
  assert.equal(s.packet.docsTip, s.docs.tip);
  assert.equal(s.packet.commentUrl, 'https://github.com/o/r/issues/16#issuecomment-9');
  assert.match(s.packet.postedAt, /^\d{4}-/);
  assert.deepEqual(s.scope, { proposed: ['.'], frozen: false });
  assert.match(git(ws.origin, 'branch', '--list', 'GH-16-fix-it-now-please'), /GH-16/);
  assert.ok(ws.calls().some((a) => a.includes('--remove-label') && a.includes('up:running')));
  assert.equal(logLines(ws).at(-1).event, 'packet-posted');
  assert.equal(logLines(ws).at(-1).url, s.packet.commentUrl);
  const n = run(ws, ['next', 'GH-16']);
  assert.deepEqual([n.json.action, n.json.reason], ['wait', 'awaiting-approval']);
});

test('an approval by a permitted account removes the label, freezes scope and leads to execute', () => {
  const ws = workspace();
  throughPlan(ws);
  run(ws, ['packet', 'GH-16']);
  ws.setMap(approvedBy('alice'));
  const n = run(ws, ['next', 'GH-16']);
  assert.deepEqual([n.json.action, n.json.stage, n.json.reason], ['run', 'execute', 'approved'], n.stdout);
  const s = state(ws);
  assert.equal(s.approval.actor, 'alice');
  assert.equal(s.approval.eventId, 'e1');
  assert.deepEqual(s.scope, { proposed: ['.'], frozen: ['.'] });
  assert.ok(ws.calls().some((a) => a.includes('--remove-label') && a.includes('up:approve')));
  assert.equal(logLines(ws).at(-1).event, 'approved');
  assert.equal(logLines(ws).at(-1).actor, 'alice');
  assert.deepEqual([run(ws, ['next', 'GH-16']).json.action, run(ws, ['next', 'GH-16']).json.stage], ['run', 'execute'], 'idempotent');
});

test('the developer approves with the same account the engine runs as', () => {
  const ws = workspace();
  throughPlan(ws);
  run(ws, ['packet', 'GH-16']);
  ws.setMap({ ...approvedBy('dev-owner'), 'api user': { stdout: { login: 'dev-owner' } } });
  const n = run(ws, ['next', 'GH-16']);
  assert.deepEqual([n.json.action, n.json.stage, n.json.reason], ['run', 'execute', 'approved'], n.stdout);
  assert.equal(state(ws).approval.actor, 'dev-owner');
});

test('an approval by a read-only account or before the packet does not count', () => {
  const ws = workspace();
  throughPlan(ws);
  run(ws, ['packet', 'GH-16']);
  ws.setMap({ ...approvedBy('bob'), 'api repos/o/r/collaborators/bob/permission': { stdout: { permission: 'read' } } });
  const n = run(ws, ['next', 'GH-16']);
  assert.deepEqual([n.json.action, n.json.reason, n.json.approval.reason], ['wait', 'awaiting-approval', 'not-permitted']);
  assert.equal(state(ws).approval, null);
  ws.setMap({ ...approvedBy('alice'), 'api repos/o/r/issues/16/timeline': { stdout: [[{ id: 'e0', event: 'labeled', label: { name: 'up:approve' }, actor: { login: 'alice' }, created_at: '2000-01-01T00:00:00Z' }]] } });
  assert.equal(run(ws, ['next', 'GH-16']).json.approval.reason, 'before-packet');
});

test('a new commit after the packet voids the approval, comments, and the packet is reposted', () => {
  const ws = workspace();
  throughPlan(ws);
  run(ws, ['packet', 'GH-16']);
  const first = state(ws).packet.docsTip;
  fs.appendFileSync(path.join(ws.root, 'tasks', 'GH-16', 'GH-16.md'), 'edited after the packet\n');
  git(ws.root, 'add', '-A');
  git(ws.root, 'commit', '-q', '-m', 'edit');
  ws.setMap(approvedBy('alice'));
  const n = run(ws, ['next', 'GH-16']);
  assert.deepEqual([n.json.action, n.json.stage, n.json.reason], ['run', 'gate', 'drift'], n.stdout);
  assert.equal(state(ws).approval, null);
  assert.equal(logLines(ws).at(-1).event, 'voided');
  const comments = stdinOf(ws, (a) => a[0] === 'issue' && a[1] === 'comment');
  assert.equal(comments.length, 2);
  assert.match(comments[1], /voided|drift|changed/i);
  assert.ok(ws.calls().some((a) => a.includes('--remove-label') && a.includes('up:approve')));
  run(ws, ['packet', 'GH-16']);
  assert.notEqual(state(ws).packet.docsTip, first);
  const bodies = stdinOf(ws, (a) => a[0] === 'issue' && a[1] === 'comment');
  assert.match(bodies.at(-1), new RegExp(`changed since last packet: https://github.com/o/r/compare/${first}\\.\\.\\.`));
});

test('pr refuses before approval, then opens the docs PR and posts the closing comment', () => {
  const ws = workspace();
  throughPlan(ws);
  run(ws, ['packet', 'GH-16']);
  const refused = run(ws, ['pr', 'GH-16']);
  assert.equal(refused.code, 2);
  assert.equal(refused.json.error.code, 'not-approved');
  ws.setMap({ ...approvedBy('alice'), 'pr create -R o/r --head GH-16-fix-it-now-please --base main': { stdout: 'https://github.com/o/r/pull/9\n' } });
  run(ws, ['next', 'GH-16']);
  run(ws, ['begin', 'GH-16', 'execute']);
  fs.writeFileSync(path.join(ws.root, 'FEATURE.md'), 'done\n');
  git(ws.root, 'add', '-A');
  git(ws.root, 'commit', '-q', '-m', 'feat: the work');
  run(ws, ['end', 'GH-16', 'execute', '--result', JSON.stringify({ ok: true })]);
  const n = run(ws, ['next', 'GH-16']);
  assert.deepEqual([n.json.action, n.json.stage, n.json.reason], ['run', 'pr', 'qa-not-configured']);
  const r = run(ws, ['pr', 'GH-16']);
  assert.equal(r.code, 0, r.stdout + r.stderr);
  assert.equal(r.json.prs.docs, 'https://github.com/o/r/pull/9');
  const events = logLines(ws).map((l) => `${l.stage} ${l.event}`);
  assert.ok(events.indexOf('qa skipped') >= 0 && events.indexOf('qa skipped') < events.indexOf('pr started'), `spec §6: QA skipped with a log line, before pr: ${events.join(', ')}`);
  assert.equal(events.filter((e) => e === 'qa skipped').length, 1);
  const prCalls = ws.calls().filter((a) => a[0] === 'pr' && a[1] === 'create');
  assert.equal(prCalls.length, 1, 'root topology: one PR, the docs repository is the code repository');
  const prBody = stdinOf(ws, (a) => a[0] === 'pr' && a[1] === 'create')[0];
  assert.match(prBody, /issuecomment-9/);
  assert.match(prBody, new RegExp(state(ws).packet.docsTip));
  assert.match(prBody, /[0-9a-f]{64}/);
  const closing = stdinOf(ws, (a) => a[0] === 'issue' && a[1] === 'comment').at(-1);
  assert.match(closing, /https:\/\/github\.com\/o\/r\/pull\/9/);
  const s = state(ws);
  assert.equal(s.pr.docs, 'https://github.com/o/r/pull/9');
  assert.equal(s.stage, 'pr');
  assert.equal(s.stageStatus, 'finished');
  assert.deepEqual([run(ws, ['next', 'GH-16']).json.action, run(ws, ['next', 'GH-16']).json.reason], ['done', 'pr-finished']);
});

test('pr refuses after a QA FAIL verdict', () => {
  const ws = workspace();
  throughPlan(ws);
  run(ws, ['packet', 'GH-16']);
  ws.setMap(approvedBy('alice'));
  run(ws, ['next', 'GH-16']);
  run(ws, ['begin', 'GH-16', 'execute']);
  run(ws, ['end', 'GH-16', 'execute', '--result', JSON.stringify({ ok: true })]);
  run(ws, ['begin', 'GH-16', 'qa']);
  run(ws, ['end', 'GH-16', 'qa', '--result', JSON.stringify({ ok: true, verdict: 'FAIL', report: 'reviews/GH-16/QA-REPORT.md' })]);
  assert.deepEqual(state(ws).qa, { verdict: 'FAIL', report: 'reviews/GH-16/QA-REPORT.md' });
  const n = run(ws, ['next', 'GH-16']);
  assert.deepEqual([n.json.action, n.json.reason], ['stop', 'qa-FAIL']);
  const r = run(ws, ['pr', 'GH-16']);
  assert.equal(r.code, 2);
  assert.equal(r.json.error.code, 'qa-failed');
  assert.ok(!ws.calls().some((a) => a[0] === 'pr'));
});

test('nested: execute creates a worktree per frozen repo and pr opens one PR per repo plus docs', () => {
  const ws = workspace({ nested: true });
  throughPlan(ws, { scope: ['backend'] });
  run(ws, ['packet', 'GH-16']);
  ws.setMap({
    ...approvedBy('alice'),
    'pr create -R o/r --head GH-16-fix-it-now-please --base main': { stdout: 'https://github.com/o/r/pull/9\n' },
    'pr create -R o/backend --head GH-16-fix-it-now-please --base main': { stdout: 'https://github.com/o/backend/pull/3\n' },
  });
  run(ws, ['next', 'GH-16']);
  assert.deepEqual(state(ws).scope.frozen, ['backend']);
  const b = run(ws, ['begin', 'GH-16', 'execute']);
  assert.equal(b.code, 0, b.stdout + b.stderr);
  const wt = path.join(ws.root, 'backend', '.worktrees', 'GH-16-fix-it-now-please');
  assert.ok(fs.existsSync(path.join(wt, '.git')), 'worktree created');
  assert.equal(git(wt, 'branch', '--show-current'), 'GH-16-fix-it-now-please');
  assert.deepEqual(b.json.worktrees, { backend: wt });
  assert.equal(state(ws).repos[0].name, 'backend');
  assert.equal(state(ws).repos[0].worktree, wt);
  fs.writeFileSync(path.join(wt, 'feature.js'), 'ok\n');
  git(wt, 'add', '-A');
  git(wt, 'commit', '-q', '-m', 'feat: backend work');
  run(ws, ['end', 'GH-16', 'execute', '--result', JSON.stringify({ ok: true })]);
  assert.equal(state(ws).repos[0].tip, git(wt, 'rev-parse', 'HEAD'));
  const r = run(ws, ['pr', 'GH-16']);
  assert.equal(r.code, 0, r.stdout + r.stderr);
  assert.deepEqual(r.json.prs, { docs: 'https://github.com/o/r/pull/9', backend: 'https://github.com/o/backend/pull/3' });
  assert.match(git(ws.backendOrigin, 'branch', '--list', 'GH-16-fix-it-now-please'), /GH-16/);
  assert.equal(state(ws).repos[0].prUrl, 'https://github.com/o/backend/pull/3');
  const closing = stdinOf(ws, (a) => a[0] === 'issue' && a[1] === 'comment').at(-1);
  assert.match(closing, /pull\/3/);
  assert.match(closing, /pull\/9/);
});

// ---- Task 13: headless run ----
const HARNESS_STUB = path.join(HERE, 'fixtures', 'harness-stub.mjs');
const headless = (ws, extra = {}) => ({ ULTRAPOWERS_CLAUDE: HARNESS_STUB, ULTRAPOWERS_AUTOPILOT_MAX_TURNS: '7', ...extra });
const harnessCalls = (ws) => {
  const log = path.join(ws.stubDir, 'calls.log');
  if (!fs.existsSync(log)) return [];
  return fs.readFileSync(log, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)).filter((c) => c.harness === 'stub');
};

test('run performs scaffold, spec, plan and the gate with the stub and stops at wait', () => {
  const ws = workspace();
  const r = run(ws, ['run', 'GH-16'], headless(ws));
  assert.equal(r.code, 0, r.stdout + r.stderr);
  assert.deepEqual(r.json.stages.map((s) => s.stage), ['scaffold', 'spec', 'plan', 'gate']);
  assert.deepEqual([r.json.final.action, r.json.final.reason], ['wait', 'awaiting-approval']);
  const s = state(ws);
  assert.equal(s.stage, 'gate');
  assert.equal(s.stageStatus, 'finished');
  assert.ok(s.packet.commentUrl);
  const calls = harnessCalls(ws);
  assert.equal(calls.length, 3, 'one harness call per agent stage');
  assert.ok(calls[0].args.includes('-p'));
  assert.ok(calls[0].args.includes('bypassPermissions'));
  assert.ok(calls[0].args.some((a) => a.startsWith('/ultrapowers:autopilot GH-16 --stage scaffold --door watch')));
  assert.ok(calls[0].args.includes('7'), 'max turns from the environment');
  assert.ok(logLines(ws).every((l) => l.trigger === 'watch'));
  assert.equal(fs.existsSync(lockFile(ws)), false, 'the lock is released at wait');
});

test('a crashed harness leaves the stage blocked with the blocked label', () => {
  const ws = workspace();
  const r = run(ws, ['run', 'GH-16', '--once'], headless(ws, { HARNESS_EXIT: '7' }));
  assert.equal(r.code, 0, r.stdout + r.stderr);
  assert.equal(r.json.stages[0].stage, 'scaffold');
  assert.equal(r.json.stages[0].ok, false);
  assert.ok(ws.calls().some((a) => a.includes('--add-label') && a.includes('up:blocked')));
  const s = state(ws);
  assert.equal(s.stageStatus, 'blocked');
  assert.match(logLines(ws).at(-1).event, /blocked/);
});

test('a harness that never ends its stage is marked blocked', () => {
  const ws = workspace();
  const r = run(ws, ['run', 'GH-16', '--once'], headless(ws, { HARNESS_NO_END: '1' }));
  assert.equal(r.code, 0, r.stdout + r.stderr);
  assert.equal(state(ws).stageStatus, 'blocked');
  assert.ok(ws.calls().some((a) => a.includes('--add-label') && a.includes('up:blocked')));
});

test('a stage past the timeout is killed and logged blocked', () => {
  const ws = workspace();
  const r = run(ws, ['run', 'GH-16', '--once'], headless(ws, { HARNESS_SLEEP_MS: '3000', ULTRAPOWERS_AUTOPILOT_STAGE_TIMEOUT_MS: '500' }));
  assert.equal(r.code, 0, r.stdout + r.stderr);
  assert.equal(r.json.stages[0].ok, false);
  assert.match(r.json.stages[0].message, /timed out|timeout/i);
  assert.equal(state(ws).stageStatus, 'blocked');
});

test('--once performs exactly one stage and run exits 3 on stop', () => {
  const ws = workspace();
  const r = run(ws, ['run', 'GH-16', '--once'], headless(ws));
  assert.equal(r.json.stages.length, 1);
  assert.equal(state(ws).stage, 'scaffold');
  const off = run(ws, ['run', 'GH-16', '--once', '--mode', 'off'], headless(ws));
  assert.equal(off.code, 3);
  assert.deepEqual([off.json.final.action, off.json.final.reason], ['stop', 'mode-off']);
});

test('run skips a ticket the session door holds', () => {
  const ws = workspace();
  run(ws, ['begin', 'GH-16', 'scaffold', '--door', 'command']);
  const r = run(ws, ['run', 'GH-16', '--once'], headless(ws));
  assert.equal(r.code, 0);
  assert.deepEqual([r.json.final.action, r.json.final.reason], ['wait', 'locked']);
  assert.equal(harnessCalls(ws).length, 0);
});

// ---- Task 14: the watcher ----
const READY = (numbers) => ({ 'issue list -R o/r --label up:ready': { stdout: numbers.map((n) => ({ number: n, title: `T${n}`, updatedAt: '2026-10-04T00:00:00Z' })) }, 'issue list -R o/r --label up:approve': { stdout: [] }, 'issue list -R o/r --label up:changes': { stdout: [] } });
const forNumber = (n) => ({
  [`issue view ${n} -R o/r --json number,title,body`]: { stdout: { number: n, title: `Ticket ${n}`, body: 'body', state: 'OPEN', labels: [], author: { login: 'owner' }, url: `https://github.com/o/r/issues/${n}` } },
  [`issue view ${n} -R o/r --json title`]: { stdout: { title: `Ticket ${n}` } },
  [`issue view ${n} -R o/r --json labels`]: { stdout: { labels: [{ name: 'up:ready' }] } },
  [`issue edit ${n} -R o/r --add-label up:running`]: { stdout: '' },
  [`issue edit ${n} -R o/r --remove-label up:running`]: { stdout: '' },
  [`issue edit ${n} -R o/r --remove-label up:ready`]: { stdout: '' },
  [`issue comment ${n} -R o/r --body-file -`]: { stdout: `https://github.com/o/r/issues/${n}#issuecomment-1\n` },
  [`api repos/o/r/issues/${n}/timeline`]: { stdout: [[]] },
});
const events = (r) => r.json.events.map((e) => e.event);

test('watch --once picks a ready ticket and runs it to wait', () => {
  const ws = workspace({ map: { ...READY([16]), ...forNumber(16) } });
  const r = run(ws, ['watch', '--once'], headless(ws));
  assert.equal(r.code, 0, r.stdout + r.stderr);
  assert.ok(events(r).includes('cycle'));
  const ran = r.json.events.find((e) => e.event === 'ran');
  assert.equal(ran.ticket, 'GH-16');
  assert.deepEqual([ran.final.action, ran.final.reason], ['wait', 'awaiting-approval']);
  assert.equal(state(ws).stage, 'gate');
  assert.ok(ws.calls().some((a) => a.includes('--remove-label') && a.includes('up:ready')), 'the ready label is consumed');
  assert.equal(r.json.nextSleepMs, 60000);
});

test('the kill switch idles the watcher', () => {
  const ws = workspace({ map: { ...READY([16]), ...forNumber(16) } });
  fs.mkdirSync(path.join(ws.root, '.ultrapowers'), { recursive: true });
  fs.writeFileSync(path.join(ws.root, '.ultrapowers', 'autopilot-stop'), 'stop\n');
  const r = run(ws, ['watch', '--once'], headless(ws));
  assert.equal(r.code, 0, r.stdout + r.stderr);
  assert.deepEqual(events(r), ['idle']);
  assert.equal(harnessCalls(ws).length, 0);
});

test('a ticket the session door holds is skipped', () => {
  const ws = workspace({ map: { ...READY([16]), ...forNumber(16) } });
  run(ws, ['begin', 'GH-16', 'scaffold', '--door', 'command']);
  const r = run(ws, ['watch', '--once'], headless(ws));
  assert.equal(r.code, 0, r.stdout + r.stderr);
  const skip = r.json.events.find((e) => e.event === 'skip');
  assert.equal(skip.ticket, 'GH-16');
  assert.equal(skip.reason, 'locked');
  assert.equal(harnessCalls(ws).length, 0);
});

test('two ready tickets run one after the other, up to maxConcurrent per cycle', () => {
  const ws = workspace({ autopilot: { mode: 'gated', baseBranch: 'main', watch: { intervalSec: 5, maxConcurrent: 2 } }, map: { ...READY([16, 17]), ...forNumber(16), ...forNumber(17) } });
  const r = run(ws, ['watch', '--once'], headless(ws));
  assert.equal(r.code, 0, r.stdout + r.stderr);
  const ran = r.json.events.filter((e) => e.event === 'ran').map((e) => e.ticket);
  assert.deepEqual(ran, ['GH-16', 'GH-17']);
  // The documents repository is on GH-17's branch now; an engine command for GH-16 switches back.
  assert.equal(git(ws.root, 'branch', '--show-current'), 'GH-17-ticket-17');
  assert.equal(run(ws, ['status', 'GH-17']).json.state.stage, 'gate');
  assert.equal(run(ws, ['status', 'GH-16']).json.state.stage, 'gate');
  assert.equal(git(ws.root, 'branch', '--show-current'), 'GH-16-ticket-16');
  assert.equal(r.json.nextSleepMs, 5000);
  const one = workspace({ autopilot: { mode: 'gated', baseBranch: 'main', watch: { intervalSec: 5, maxConcurrent: 1 } }, map: { ...READY([16, 17]), ...forNumber(16), ...forNumber(17) } });
  const r1 = run(one, ['watch', '--once'], headless(one));
  assert.deepEqual(r1.json.events.filter((e) => e.event === 'ran').map((e) => e.ticket), ['GH-16'], 'one per cycle');
});

test('backoff doubles the sleep on a tracker failure', () => {
  const ws = workspace({ map: { 'issue list -R o/r --label up:ready': { exit: 1, stderr: 'gh: connection refused' } } });
  const r = run(ws, ['watch', '--once'], headless(ws));
  assert.equal(r.code, 0, r.stdout + r.stderr);
  const err = r.json.events.find((e) => e.event === 'tracker-error');
  assert.match(err.message, /connection refused/);
  assert.equal(r.json.nextSleepMs, 120000);
  const r2 = run(ws, ['watch', '--once'], { ...headless(ws), ULTRAPOWERS_AUTOPILOT_SLEEP_MS: '120000' });
  assert.equal(r2.json.nextSleepMs, 240000);
  const capped = run(ws, ['watch', '--once'], { ...headless(ws), ULTRAPOWERS_AUTOPILOT_SLEEP_MS: '500000' });
  assert.equal(capped.json.nextSleepMs, 600000);
});

test('a source without a default project is reported, not watched', () => {
  const ws = workspace({ map: READY([]) });
  const markerPath = path.join(ws.root, '.agents', 'ultrapowers.json');
  const marker = JSON.parse(fs.readFileSync(markerPath, 'utf8'));
  marker.tickets.sources.push({ prefix: 'GX', provider: 'github', owner: 'o' });
  fs.writeFileSync(markerPath, JSON.stringify(marker, null, 2));
  const r = run(ws, ['watch', '--once'], headless(ws));
  assert.equal(r.code, 0, r.stdout + r.stderr);
  const unwatched = r.json.events.find((e) => e.event === 'unwatched');
  assert.equal(unwatched.source, 'GX');
  assert.match(unwatched.reason, /defaultProject/);
});

test('next removes the running label when it answers stop', () => {
  const ws = workspace();
  run(ws, ['begin', 'GH-16', 'scaffold']);
  fs.mkdirSync(path.join(ws.root, 'tasks', 'GH-16'), { recursive: true });
  run(ws, ['end', 'GH-16', 'scaffold', '--result', JSON.stringify({ ok: true })]);
  const n = run(ws, ['next', 'GH-16', '--mode', 'off']);
  assert.equal(n.json.action, 'stop');
  assert.ok(ws.calls().some((a) => a.includes('--remove-label') && a.includes('up:running')));
});

// ---- Final review fix pass (2026-10-04) ----
const stateFile = (ws) => path.join(ws.root, 'tasks', 'GH-16', 'autopilot.json');
const writeStateFile = (ws, s) => fs.writeFileSync(stateFile(ws), `${JSON.stringify(s, null, 2)}\n`);
const PR_CREATE = { 'pr create -R o/r --head GH-16-fix-it-now-please --base main': { stdout: 'https://github.com/o/r/pull/9\n' } };
const commentBodies = (ws) => stdinOf(ws, (a) => a[0] === 'issue' && a[1] === 'comment');
const approveThenExecute = (ws) => {
  run(ws, ['packet', 'GH-16']);
  ws.setMap({ ...approvedBy('alice'), ...PR_CREATE });
  run(ws, ['next', 'GH-16']);
  const b = run(ws, ['begin', 'GH-16', 'execute']);
  assert.equal(b.code, 0, b.stdout + b.stderr);
  fs.writeFileSync(path.join(ws.root, 'FEATURE.md'), 'done\n');
  git(ws.root, 'add', '-A');
  git(ws.root, 'commit', '-q', '-m', 'feat: the work');
};

test('the changes label is taken when the changes stage begins, so the gate does not loop', () => {
  const ws = workspace();
  throughPlan(ws);
  run(ws, ['packet', 'GH-16']);
  ws.setMap({ 'issue view 16 -R o/r --json labels': { stdout: { labels: [{ name: 'up:changes' }] } }, 'issue edit 16 -R o/r --remove-label up:changes': { stdout: '' } });
  assert.deepEqual([run(ws, ['next', 'GH-16']).json.action, run(ws, ['next', 'GH-16']).json.stage], ['run', 'changes']);
  const b = run(ws, ['begin', 'GH-16', 'changes']);
  assert.equal(b.code, 0, b.stdout + b.stderr);
  assert.ok(ws.calls().some((a) => a.includes('--remove-label') && a.includes('up:changes')), 'the engine takes the label');
  assert.equal(logLines(ws).at(-1).event, 'changes-taken');
  ws.setMap({ 'issue view 16 -R o/r --json labels': { stdout: { labels: [] } } });
  run(ws, ['end', 'GH-16', 'changes', '--result', JSON.stringify({ ok: true })]);
  assert.equal(run(ws, ['next', 'GH-16']).json.stage, 'gate');
  run(ws, ['packet', 'GH-16']);
  assert.deepEqual([run(ws, ['next', 'GH-16']).json.action, run(ws, ['next', 'GH-16']).json.reason], ['wait', 'awaiting-approval']);
});

test('run stops when a stage repeats without progress', () => {
  const ws = workspace({ map: { 'issue view 16 -R o/r --json labels': { stdout: { labels: [{ name: 'up:changes' }] } }, 'issue edit 16 -R o/r --remove-label up:changes': { stdout: '' } } });
  const r = run(ws, ['run', 'GH-16'], headless(ws));
  assert.equal(r.code, 3, r.stdout + r.stderr);
  assert.deepEqual([r.json.final.action, r.json.final.reason], ['stop', 'stage-repeated']);
  assert.ok(harnessCalls(ws).filter((c) => c.args.some((a) => a.includes('--stage changes'))).length <= 3, 'bounded');
});

test('full mode records its approval at the packet and runs to the pull request', () => {
  const ws = workspace({ autopilot: { mode: 'full', baseBranch: 'main' }, map: PR_CREATE });
  const r = run(ws, ['run', 'GH-16'], headless(ws));
  assert.equal(r.code, 0, r.stdout + r.stderr);
  assert.deepEqual(r.json.stages.map((s) => s.stage), ['scaffold', 'spec', 'plan', 'gate', 'execute', 'pr']);
  assert.deepEqual([r.json.final.action, r.json.final.reason], ['done', 'pr-finished']);
  const s = state(ws);
  assert.equal(s.approval.mode, 'full');
  assert.deepEqual(s.scope.frozen, ['.']);
  assert.ok(logLines(ws).some((l) => l.event === 'approved' && l.actor === 'engine' && l.mode === 'full'));
  assert.equal(s.pr.docs, 'https://github.com/o/r/pull/9');
});

test('a frozen scope written into the state file does not open execute or a pull request', () => {
  const ws = workspace();
  throughPlan(ws);
  run(ws, ['packet', 'GH-16']);
  writeStateFile(ws, { ...state(ws), scope: { proposed: ['.'], frozen: ['.'] } });
  const b = run(ws, ['begin', 'GH-16', 'execute']);
  assert.equal(b.code, 2);
  assert.equal(b.json.error.code, 'not-approved');
  writeStateFile(ws, { ...state(ws), stage: 'execute', stageStatus: 'finished', scope: { proposed: ['.'], frozen: ['.'] } });
  const p = run(ws, ['pr', 'GH-16']);
  assert.equal(p.code, 2);
  assert.equal(p.json.error.code, 'not-approved');
});

test('execute and pr re-check the recorded approval against the tracker', () => {
  const ws = workspace();
  throughPlan(ws);
  run(ws, ['packet', 'GH-16']);
  ws.setMap(approvedBy('alice'));
  assert.equal(run(ws, ['next', 'GH-16']).json.reason, 'approved');
  ws.setMap({ 'api repos/o/r/issues/16/timeline': { stdout: [[]] } });
  const b = run(ws, ['begin', 'GH-16', 'execute']);
  assert.equal(b.code, 2, b.stdout);
  assert.equal(b.json.error.code, 'approval-unverified');
  assert.equal(state(ws).stageStatus, 'finished', 'the gate is untouched');
});

test('while a stage is open the engine refuses the gate commands and another stage', () => {
  const ws = workspace();
  throughPlan(ws);
  run(ws, ['begin', 'GH-16', 'changes']);
  for (const args of [['packet', 'GH-16'], ['approval', 'GH-16'], ['pr', 'GH-16'], ['begin', 'GH-16', 'spec']]) {
    const r = run(ws, args);
    assert.equal(r.code, 2, args.join(' '));
    assert.equal(r.json.error.code, 'stage-open', args.join(' '));
  }
  assert.equal(run(ws, ['begin', 'GH-16', 'changes']).code, 0, 'the open stage re-enters');
  run(ws, ['end', 'GH-16', 'changes', '--result', JSON.stringify({ ok: true })]);
  assert.equal(run(ws, ['packet', 'GH-16']).code, 0, 'closed again');
});

test('the packet time is the tracker clock, so a label inside the packet second is before it', () => {
  const ws = workspace({ map: { 'api repos/o/r/issues/comments/9': { stdout: { id: 9, created_at: '2026-10-04T09:00:00Z' } } } });
  throughPlan(ws);
  run(ws, ['packet', 'GH-16']);
  assert.equal(state(ws).packet.postedAt, '2026-10-04T09:00:00Z');
  ws.setMap({ ...approvedBy('alice'), 'api repos/o/r/issues/16/timeline': { stdout: [[{ id: 'e1', event: 'labeled', label: { name: 'up:approve' }, actor: { login: 'alice' }, created_at: '2026-10-04T09:00:00Z' }]] } });
  assert.equal(run(ws, ['next', 'GH-16']).json.approval.reason, 'before-packet');
});

test('the watcher refuses a harness that has no guardrail', () => {
  const ws = workspace({ autopilot: { mode: 'gated', baseBranch: 'main', harness: 'opencode' } });
  const r = run(ws, ['run', 'GH-16'], { ULTRAPOWERS_OPENCODE: HARNESS_STUB });
  assert.equal(r.code, 2, r.stdout + r.stderr);
  assert.equal(r.json.error.code, 'harness-unguarded');
  assert.equal(harnessCalls(ws).length, 0);
});

test('the QA verdict is read from the committed report and a missing one blocks', () => {
  const ws = workspace({ qa: true });
  throughPlan(ws);
  approveThenExecute(ws);
  run(ws, ['end', 'GH-16', 'execute', '--result', JSON.stringify({ ok: true })]);
  assert.equal(run(ws, ['next', 'GH-16']).json.stage, 'qa');
  run(ws, ['begin', 'GH-16', 'qa']);
  const missing = run(ws, ['end', 'GH-16', 'qa', '--result', JSON.stringify({ ok: true, verdict: 'PASS' })]);
  assert.equal(missing.json.status, 'blocked', 'no committed report, no verdict');
  assert.equal(missing.json.verdict, null);
  run(ws, ['begin', 'GH-16', 'qa']);
  fs.mkdirSync(path.join(ws.root, 'reviews', 'GH-16'), { recursive: true });
  fs.writeFileSync(path.join(ws.root, 'reviews', 'GH-16', 'QA-REPORT.md'), '# QA\n\nVerdict: FAIL\n');
  git(ws.root, 'add', '-A');
  git(ws.root, 'commit', '-q', '-m', 'qa(GH-16): report');
  const lied = run(ws, ['end', 'GH-16', 'qa', '--result', JSON.stringify({ ok: true, verdict: 'PASS' })]);
  assert.equal(lied.json.verdict, 'FAIL', 'the report wins over the result');
  assert.deepEqual([run(ws, ['next', 'GH-16']).json.action, run(ws, ['next', 'GH-16']).json.reason], ['stop', 'qa-FAIL']);
  assert.equal(run(ws, ['pr', 'GH-16']).json.error.code, 'qa-failed');
});

test('a plan that widens the spec scope is refused at the packet, with the reason on the ticket', () => {
  const ws = workspace({ nested: true });
  throughPlan(ws, { scope: ['backend'], planScope: ['backend', '.'] });
  const p = run(ws, ['packet', 'GH-16']);
  assert.equal(p.code, 2, p.stdout);
  assert.equal(p.json.error.code, 'scope-widened');
  const s = state(ws);
  assert.equal(s.packet, null);
  assert.deepEqual([s.stage, s.stageStatus], ['gate', 'blocked']);
  assert.ok(ws.calls().some((a) => a.includes('--add-label') && a.includes('up:blocked')));
  assert.match(commentBodies(ws).at(-1), /scope/);
  assert.equal(fs.existsSync(lockFile(ws)), false);
  assert.equal(fs.existsSync(marker(ws)), false);
});

test('nested: the documents root may be in scope beside a code repository', () => {
  const ws = workspace({ nested: true });
  throughPlan(ws, { scope: ['.', 'backend'] });
  const p = run(ws, ['packet', 'GH-16']);
  assert.equal(p.code, 0, p.stdout + p.stderr);
  ws.setMap(approvedBy('alice'));
  assert.equal(run(ws, ['next', 'GH-16']).json.reason, 'approved');
  assert.deepEqual(state(ws).scope.frozen, ['.', 'backend']);
});

test('a pull request that fails partway leaves no lock and resumes without a second PR', () => {
  const ws = workspace();
  throughPlan(ws);
  approveThenExecute(ws);
  run(ws, ['end', 'GH-16', 'execute', '--result', JSON.stringify({ ok: true })]);
  ws.setMap({ ...approvedBy('alice'), 'pr create -R o/r --head GH-16-fix-it-now-please --base main': { exit: 1, stderr: 'boom' } });
  const failed = run(ws, ['pr', 'GH-16']);
  assert.equal(failed.code, 2);
  assert.equal(failed.json.error.code, 'tracker-failed');
  assert.deepEqual([state(ws).stage, state(ws).stageStatus], ['pr', 'blocked']);
  assert.equal(fs.existsSync(lockFile(ws)), false, 'the lock is released on failure');
  assert.equal(fs.existsSync(marker(ws)), false);
  assert.equal(logLines(ws).at(-1).event, 'blocked');
  ws.setMap({ ...approvedBy('alice'), ...PR_CREATE });
  assert.deepEqual([run(ws, ['next', 'GH-16']).json.stage, run(ws, ['next', 'GH-16']).json.reason], ['pr', 'pr-retry']);
  const again = run(ws, ['pr', 'GH-16']);
  assert.equal(again.code, 0, again.stdout + again.stderr);
  assert.equal(ws.calls().filter((a) => a[0] === 'pr' && a[1] === 'create').length, 2, 'one failed call, one that opened it');
  assert.equal(run(ws, ['pr', 'GH-16']).json.error.code, 'wrong-stage', 'a finished pr stage does not reopen');
});

test('a spec or plan changed after the approval blocks execute', () => {
  const ws = workspace();
  throughPlan(ws);
  approveThenExecute(ws);
  fs.appendFileSync(path.join(ws.root, 'plans', 'GH-16', 'Plan.md'), '\n### Task 2\n');
  git(ws.root, 'add', '-A');
  git(ws.root, 'commit', '-q', '-m', 'plan(GH-16): widened');
  const e = run(ws, ['end', 'GH-16', 'execute', '--result', JSON.stringify({ ok: true })]);
  assert.equal(e.json.status, 'blocked');
  assert.match(commentBodies(ws).at(-1), /plan-changed|changed after the approval/);
  assert.equal(run(ws, ['pr', 'GH-16']).json.error.code, 'wrong-stage');
});

test('the packet and the pull request name base commits that are not on origin', () => {
  const ws = workspace({ map: PR_CREATE });
  fs.writeFileSync(path.join(ws.root, 'LOCAL.md'), 'not pushed\n');
  git(ws.root, 'add', '-A');
  git(ws.root, 'commit', '-q', '-m', 'local: unpushed base commit');
  const sha = git(ws.root, 'rev-parse', '--short', 'HEAD');
  throughPlan(ws);
  run(ws, ['packet', 'GH-16']);
  assert.match(commentBodies(ws).at(-1), new RegExp(`base main is 1 commit ahead of origin/main: ${sha}`));
  ws.setMap({ ...approvedBy('alice'), ...PR_CREATE });
  run(ws, ['next', 'GH-16']);
  run(ws, ['begin', 'GH-16', 'execute']);
  run(ws, ['end', 'GH-16', 'execute', '--result', JSON.stringify({ ok: true })]);
  run(ws, ['pr', 'GH-16']);
  assert.match(stdinOf(ws, (a) => a[0] === 'pr' && a[1] === 'create')[0], new RegExp(`not on origin/main: ${sha}`));
});

test('the watcher starts a ticket on the ready label only', () => {
  const ws = workspace({ map: { ...READY([]), 'issue list -R o/r --label up:changes': { stdout: [{ number: 17, title: 'T17', updatedAt: '2026-10-04T00:00:00Z' }] }, ...forNumber(17) } });
  const r = run(ws, ['watch', '--once'], headless(ws));
  assert.equal(r.code, 0, r.stdout + r.stderr);
  assert.deepEqual(r.json.events.find((e) => e.event === 'cycle').tickets, []);
  assert.equal(harnessCalls(ws).length, 0);
});

test('the watch door does not take an approval from the account it runs as unless the project opts in', () => {
  const ws = workspace();
  throughPlan(ws);
  run(ws, ['packet', 'GH-16']);
  ws.setMap({ ...approvedBy('engine-bot') });
  const w = run(ws, ['next', 'GH-16', '--door', 'watch']);
  assert.deepEqual([w.json.action, w.json.approval.reason], ['wait', 'self-watch'], w.stdout);
  assert.equal(state(ws).approval, null);
  const s = run(ws, ['next', 'GH-16', '--door', 'command']);
  assert.equal(s.json.reason, 'approved', 'the session door is the developer at the keyboard');
});

test('watchSelfApproval lets the watch door take the engine account approval', () => {
  const ws = workspace({ autopilot: { mode: 'gated', baseBranch: 'main', watchSelfApproval: true } });
  throughPlan(ws);
  run(ws, ['packet', 'GH-16']);
  ws.setMap({ ...approvedBy('engine-bot') });
  assert.equal(run(ws, ['next', 'GH-16', '--door', 'watch']).json.reason, 'approved');
});

test('with stage credentials a headless stage holds only those, and loads only the project MCP servers', () => {
  const ws = workspace();
  fs.writeFileSync(path.join(ws.root, '.mcp.json'), JSON.stringify({ mcpServers: {} }));
  const secrets = { GH_TOKEN: 'ghp_secret', GITHUB_TOKEN: 'ghp_secret2', GITLAB_TOKEN: 'glpat', GLAB_TOKEN: 'glpat2' };
  const r = run(ws, ['run', 'GH-16', '--once'], headless(ws, { ...secrets, ULTRAPOWERS_STAGE_GH_TOKEN: 'ghs_readonly', ULTRAPOWERS_STAGE_GITLAB_TOKEN: 'gl_readonly' }));
  assert.equal(r.code, 0, r.stdout + r.stderr);
  const call = harnessCalls(ws)[0];
  assert.deepEqual([call.env.GH_TOKEN, call.env.GITHUB_TOKEN, call.env.GITLAB_TOKEN, call.env.GLAB_TOKEN], ['ghs_readonly', null, 'gl_readonly', null], 'the engine tokens are gone, the stage tokens are in');
  assert.ok(call.env.GH_CONFIG_DIR && fs.existsSync(call.env.GH_CONFIG_DIR) && fs.readdirSync(call.env.GH_CONFIG_DIR).length === 0, 'gh sees an empty config');
  assert.ok(call.env.GLAB_CONFIG_DIR && fs.existsSync(call.env.GLAB_CONFIG_DIR), 'glab sees an empty config');
  assert.equal(call.env.GIT_TERMINAL_PROMPT, '0');
  assert.ok(call.args.includes('--strict-mcp-config'), 'only the listed MCP servers load');
  const i = call.args.indexOf('--mcp-config');
  assert.ok(i > 0 && /\.mcp\.json$/.test(call.args[i + 1]), 'the project file is the list');
  assert.ok(ws.calls().some((a) => a.includes('--add-label') && a.includes('up:running')), 'the watcher, not the stage, labels the ticket');
});

test('without stage credentials a headless stage shares the engine credentials, and still prompts for nothing', () => {
  const ws = workspace();
  fs.rmSync(path.join(ws.root, '.mcp.json'), { force: true });
  const r = run(ws, ['run', 'GH-16', '--once'], headless(ws, { GH_TOKEN: 'ghp_shared' }));
  assert.equal(r.code, 0, r.stdout + r.stderr);
  const call = harnessCalls(ws)[0];
  assert.equal(call.env.GH_TOKEN, 'ghp_shared');
  assert.equal(call.env.GH_CONFIG_DIR, null);
  assert.equal(call.env.GIT_TERMINAL_PROMPT, '0');
  const i = call.args.indexOf('--mcp-config');
  assert.ok(call.args.includes('--strict-mcp-config') && i > 0 && /mcp-none\.json$/.test(call.args[i + 1]), 'no project .mcp.json: no server loads');
});
