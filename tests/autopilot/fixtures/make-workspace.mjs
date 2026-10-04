// Builds a scaffolded workspace for the autopilot tests and pressure scenarios: init scaffold,
// a GH ticket source, an autopilot block, git on branch main with a bare origin, and the tracker
// stub wired through ULTRAPOWERS_GH / ULTRAPOWERS_GLAB with a per-workspace answer map.
// `nested` adds a code repository clone `backend/` with its own origin, listed in repos[].
//
// Also a CLI: node make-workspace.mjs <dir> [--nested] [--mode gated|full|off] prints the env JSON.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..', '..');
const INIT = path.join(REPO, 'skills', 'init', 'scripts', 'init.mjs');
export const STUB = path.join(HERE, 'tracker-stub.mjs');

export const GIT_ENV = {
  GIT_AUTHOR_NAME: 'Test', GIT_AUTHOR_EMAIL: 'test@example.com',
  GIT_COMMITTER_NAME: 'Test', GIT_COMMITTER_EMAIL: 'test@example.com',
  GIT_CONFIG_GLOBAL: path.join(os.tmpdir(), 'autopilot-fixture-gitconfig'),
};
fs.writeFileSync(GIT_ENV.GIT_CONFIG_GLOBAL, '');

export function git(cwd, ...args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', env: { ...process.env, ...GIT_ENV }, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

export const BASE_MAP = {
  'api user': { stdout: { login: 'engine-bot' } },
  'auth status --hostname github.com': { stdout: '' },
  'issue view 16 -R o/r --json number,title,body': { stdout: { number: 16, title: 'Fix it now please', body: 'The hand-off line names the wrong folder. Acceptance: the line names plans/<ID>/Plan.md.', state: 'OPEN', labels: [], author: { login: 'owner' }, url: 'https://github.com/o/r/issues/16' } },
  'issue view 16 -R o/r --json title': { stdout: { title: 'Fix it now please' } },
  'issue view 16 -R o/r --json labels': { stdout: { labels: [] } },
  'issue edit 16 -R o/r --add-label up:running': { stdout: '' },
  'issue edit 16 -R o/r --remove-label up:running': { stdout: '' },
  'issue edit 16 -R o/r --add-label up:blocked': { stdout: '' },
  'issue edit 16 -R o/r --remove-label up:approve': { stdout: '' },
  'issue comment 16 -R o/r --body-file -': { stdout: 'https://github.com/o/r/issues/16#issuecomment-9\n' },
  'api repos/o/r/issues/16/timeline': { stdout: [[]] },
  'api repos/o/r/issues/16/comments': { stdout: [[]] },
};

function withOrigin(base, name, dir) {
  const origin = path.join(base, `${name}.git`);
  git(base, 'init', '-q', '--bare', '-b', 'main', origin);
  git(dir, 'remote', 'add', 'origin', origin);
  git(dir, 'push', '-q', '-u', 'origin', 'main');
  git(dir, 'remote', 'set-head', 'origin', 'main');
  return origin;
}

export function makeWorkspace({ dir = null, autopilot = { mode: 'gated', baseBranch: 'main' }, map = {}, qa = false, nested = false } = {}) {
  const base = dir ? path.resolve(dir) : fs.mkdtempSync(path.join(os.tmpdir(), 'autopilot-cli-'));
  fs.mkdirSync(base, { recursive: true });
  const root = path.join(base, 'ws');
  fs.mkdirSync(root);
  execFileSync(process.execPath, [INIT, 'scaffold', '--root', root, '--name', 'WS', '--platform', 'linux', '--harnesses', 'claude-code'], { encoding: 'utf8', env: { ...process.env, ...GIT_ENV } });
  const markerPath = path.join(root, '.agents', 'ultrapowers.json');
  const marker = JSON.parse(fs.readFileSync(markerPath, 'utf8'));
  marker.tickets = { transport: 'cli', sources: [{ prefix: 'GH', provider: 'github', owner: 'o', defaultProject: 'r' }] };
  if (autopilot) marker.autopilot = autopilot;
  if (!qa) delete marker.qa;
  if (nested) {
    marker.topology = 'nested';
    marker.repos = [{ name: 'backend', path: 'backend', defaultBranch: 'main', area: 'backend' }];
    fs.appendFileSync(path.join(root, '.gitignore'), 'backend/\n');
  }
  fs.writeFileSync(markerPath, `${JSON.stringify(marker, null, 2)}\n`);
  git(root, 'init', '-q', '-b', 'main');
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', 'scaffold');
  const origin = withOrigin(base, 'ws', root);
  let backendOrigin = null;
  if (nested) {
    const backend = path.join(root, 'backend');
    fs.mkdirSync(backend);
    git(backend, 'init', '-q', '-b', 'main');
    fs.writeFileSync(path.join(backend, 'README.md'), 'backend\n');
    git(backend, 'add', '-A');
    git(backend, 'commit', '-q', '-m', 'seed');
    backendOrigin = withOrigin(base, 'backend', backend);
  }
  const stubDir = path.join(base, 'stub');
  fs.mkdirSync(stubDir);
  fs.writeFileSync(path.join(stubDir, 'map.json'), JSON.stringify({ ...BASE_MAP, ...map }));
  const log = path.join(stubDir, 'calls.log');
  const env = { ...process.env, ...GIT_ENV, ULTRAPOWERS_GH: STUB, ULTRAPOWERS_GLAB: STUB, STUB_DIR: stubDir, STUB_LOG: log };
  const calls = () => (fs.existsSync(log) ? fs.readFileSync(log, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l).args) : []);
  const setMap = (extra) => fs.writeFileSync(path.join(stubDir, 'map.json'), JSON.stringify({ ...BASE_MAP, ...map, ...extra }));
  return { base, root, env, calls, setMap, stubDir, origin, backendOrigin };
}

if (process.argv[1] && /make-workspace\.mjs$/.test(process.argv[1].replace(/\\/g, '/'))) {
  const args = process.argv.slice(2);
  const dir = args.find((a) => !a.startsWith('--')) ?? null;
  const nested = args.includes('--nested');
  const modeIdx = args.indexOf('--mode');
  const mode = modeIdx !== -1 ? args[modeIdx + 1] : 'gated';
  const ws = makeWorkspace({ dir, nested, autopilot: mode === 'off' ? null : { mode, baseBranch: 'main' } });
  const picked = {};
  for (const k of ['ULTRAPOWERS_GH', 'ULTRAPOWERS_GLAB', 'STUB_DIR', 'STUB_LOG', ...Object.keys(GIT_ENV)]) picked[k] = ws.env[k];
  process.stdout.write(`${JSON.stringify({ root: ws.root, origin: ws.origin, stubDir: ws.stubDir, env: picked }, null, 2)}\n`);
}
