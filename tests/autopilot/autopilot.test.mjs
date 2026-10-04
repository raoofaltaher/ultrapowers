import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..');
const ENGINE = path.join(REPO, 'skills', 'autopilot', 'scripts', 'autopilot.mjs');
const INIT = path.join(REPO, 'skills', 'init', 'scripts', 'init.mjs');
const STUB = path.join(HERE, 'fixtures', 'tracker-stub.mjs');

const GIT_ENV = {
  GIT_AUTHOR_NAME: 'Test', GIT_AUTHOR_EMAIL: 'test@example.com',
  GIT_COMMITTER_NAME: 'Test', GIT_COMMITTER_EMAIL: 'test@example.com',
  GIT_CONFIG_GLOBAL: path.join(os.tmpdir(), 'autopilot-cli-gitconfig'),
};
fs.writeFileSync(GIT_ENV.GIT_CONFIG_GLOBAL, '');

function git(cwd, ...args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', env: { ...process.env, ...GIT_ENV }, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

const BASE_MAP = {
  'api user': { stdout: { login: 'engine-bot' } },
  'issue view 16 -R o/r --json title': { stdout: { title: 'Fix it now please' } },
  'issue view 16 -R o/r --json labels': { stdout: { labels: [] } },
  'issue edit 16 -R o/r --add-label up:running': { stdout: '' },
  'issue edit 16 -R o/r --remove-label up:running': { stdout: '' },
  'issue edit 16 -R o/r --add-label up:blocked': { stdout: '' },
  'issue comment 16 -R o/r --body-file -': { stdout: 'https://github.com/o/r/issues/16#issuecomment-9\n' },
};

// A scaffolded workspace on branch main with a GH source and an autopilot block.
export function workspace({ autopilot = { mode: 'gated', baseBranch: 'main' }, map = {}, qa = false } = {}) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'autopilot-cli-'));
  const root = path.join(base, 'ws');
  fs.mkdirSync(root);
  execFileSync(process.execPath, [INIT, 'scaffold', '--root', root, '--name', 'WS', '--platform', 'linux', '--harnesses', 'claude-code'], { encoding: 'utf8', env: { ...process.env, ...GIT_ENV } });
  const markerPath = path.join(root, '.agents', 'ultrapowers.json');
  const marker = JSON.parse(fs.readFileSync(markerPath, 'utf8'));
  marker.tickets = { transport: 'cli', sources: [{ prefix: 'GH', provider: 'github', owner: 'o', defaultProject: 'r' }] };
  if (autopilot) marker.autopilot = autopilot;
  if (!qa) delete marker.qa;
  fs.writeFileSync(markerPath, `${JSON.stringify(marker, null, 2)}\n`);
  git(root, 'init', '-q', '-b', 'main');
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', 'scaffold');
  const stubDir = path.join(base, 'stub');
  fs.mkdirSync(stubDir);
  fs.writeFileSync(path.join(stubDir, 'map.json'), JSON.stringify({ ...BASE_MAP, ...map }));
  const log = path.join(stubDir, 'calls.log');
  const env = { ...process.env, ...GIT_ENV, ULTRAPOWERS_GH: STUB, ULTRAPOWERS_GLAB: STUB, STUB_DIR: stubDir, STUB_LOG: log };
  const calls = () => (fs.existsSync(log) ? fs.readFileSync(log, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l).args) : []);
  const setMap = (extra) => fs.writeFileSync(path.join(stubDir, 'map.json'), JSON.stringify({ ...BASE_MAP, ...map, ...extra }));
  return { root, env, calls, setMap, stubDir };
}

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
  assert.deepEqual(JSON.parse(fs.readFileSync(marker(ws), 'utf8')), { ticket: 'GH-16', branch: 'GH-16-fix-it-now-please', scope: [] });
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

test('next removes the running label when it answers stop', () => {
  const ws = workspace();
  run(ws, ['begin', 'GH-16', 'scaffold']);
  fs.mkdirSync(path.join(ws.root, 'tasks', 'GH-16'), { recursive: true });
  run(ws, ['end', 'GH-16', 'scaffold', '--result', JSON.stringify({ ok: true })]);
  const n = run(ws, ['next', 'GH-16', '--mode', 'off']);
  assert.equal(n.json.action, 'stop');
  assert.ok(ws.calls().some((a) => a.includes('--remove-label') && a.includes('up:running')));
});
