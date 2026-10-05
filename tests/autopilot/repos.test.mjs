import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import {
  git, remoteHead, remotePath, forgeFor, ensureBranch, ensureOnTicketBranch, ensureWorktree, tip, workTip, commitPaths, push, repoDirs,
} from '../../skills/autopilot/scripts/repos.mjs';

const GIT_ENV = {
  GIT_AUTHOR_NAME: 'Test', GIT_AUTHOR_EMAIL: 'test@example.com',
  GIT_COMMITTER_NAME: 'Test', GIT_COMMITTER_EMAIL: 'test@example.com',
  GIT_CONFIG_GLOBAL: path.join(os.tmpdir(), 'autopilot-repos-gitconfig'),
};
fs.writeFileSync(GIT_ENV.GIT_CONFIG_GLOBAL, '');
Object.assign(process.env, GIT_ENV);

function sh(cwd, ...args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', env: process.env, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

// A bare origin with `main` and `dev`, and one clone of it.
function fixture() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'autopilot-repos-'));
  const origin = path.join(base, 'origin.git');
  sh(base, 'init', '-q', '--bare', '-b', 'main', origin);
  const seed = path.join(base, 'seed');
  sh(base, 'clone', '-q', origin, seed);
  fs.writeFileSync(path.join(seed, 'README.md'), 'seed\n');
  sh(seed, 'add', 'README.md');
  sh(seed, 'commit', '-q', '-m', 'seed');
  sh(seed, 'branch', '-M', 'main');
  sh(seed, 'push', '-q', '-u', 'origin', 'main');
  sh(seed, 'checkout', '-q', '-b', 'dev');
  fs.writeFileSync(path.join(seed, 'DEV.md'), 'dev\n');
  sh(seed, 'add', 'DEV.md');
  sh(seed, 'commit', '-q', '-m', 'dev');
  sh(seed, 'push', '-q', '-u', 'origin', 'dev');
  const clone = path.join(base, 'clone');
  sh(base, 'clone', '-q', origin, clone);
  sh(clone, 'remote', 'set-head', 'origin', 'main');
  return { base, origin, clone };
}

const STATE = (frozen) => ({ ticket: 'GH-16', scope: { proposed: ['backend'], frozen } });

test('git wraps execFile and reports failures without throwing', () => {
  const { clone } = fixture();
  assert.equal(git(clone, ['rev-parse', '--abbrev-ref', 'HEAD']).stdout.trim(), 'main');
  const bad = git(clone, ['rev-parse', '--verify', 'nope']);
  assert.equal(bad.ok, false);
  assert.match(bad.stderr, /fatal/);
});

test('remoteHead reads origin/HEAD and falls back to main', () => {
  const { clone, base } = fixture();
  assert.equal(remoteHead(clone), 'main');
  const plain = path.join(base, 'plain');
  sh(base, 'init', '-q', plain);
  assert.equal(remoteHead(plain), 'main');
});

test('ensureBranch creates from origin/dev in place and is idempotent', () => {
  const { clone } = fixture();
  assert.deepEqual(ensureBranch(clone, 'GH-16-x', 'dev'), { created: true });
  assert.equal(sh(clone, 'branch', '--show-current'), 'GH-16-x');
  assert.ok(fs.existsSync(path.join(clone, 'DEV.md')), 'branched from dev, not main');
  assert.deepEqual(ensureBranch(clone, 'GH-16-x', 'dev'), { created: false });
  assert.equal(sh(clone, 'branch', '--show-current'), 'GH-16-x');
});

test('ensureBranch starts from a local base that is ahead of origin, and from origin when the local base is behind', () => {
  const { clone, base } = fixture();
  // Local dev gains an unpushed commit: the ticket branch must carry it.
  sh(clone, 'checkout', '-q', 'dev');
  fs.writeFileSync(path.join(clone, 'LOCAL.md'), 'unpushed\n');
  sh(clone, 'add', 'LOCAL.md');
  sh(clone, 'commit', '-q', '-m', 'local only');
  ensureBranch(clone, 'GH-16-x', 'dev');
  assert.ok(fs.existsSync(path.join(clone, 'LOCAL.md')), 'the unpushed local commit is on the ticket branch');
  // A second clone whose local dev is behind origin: origin wins.
  const other = path.join(base, 'other');
  sh(base, 'clone', '-q', path.join(base, 'origin.git'), other);
  sh(other, 'checkout', '-q', '-b', 'dev', 'origin/dev~0');
  sh(other, 'reset', '-q', '--hard', 'origin/dev~1');
  ensureBranch(other, 'GH-17-y', 'dev');
  assert.ok(fs.existsSync(path.join(other, 'DEV.md')), 'origin/dev, which is ahead, is the start point');
});

test('ensureWorktree returns .worktrees/<branch> and reuses it', () => {
  const { clone } = fixture();
  const wt = ensureWorktree(clone, 'GH-16-x', 'dev');
  assert.equal(wt, path.join(clone, '.worktrees', 'GH-16-x'));
  assert.equal(sh(wt, 'branch', '--show-current'), 'GH-16-x');
  assert.ok(fs.existsSync(path.join(wt, 'DEV.md')));
  assert.equal(sh(clone, 'branch', '--show-current'), 'main', 'the clone itself stays on its branch');
  assert.equal(ensureWorktree(clone, 'GH-16-x', 'dev'), wt);
});

test('tip returns the sha of a ref', () => {
  const { clone } = fixture();
  assert.equal(tip(clone), sh(clone, 'rev-parse', 'HEAD'));
  assert.equal(tip(clone, 'origin/dev'), sh(clone, 'rev-parse', 'origin/dev'));
  assert.equal(tip(clone, 'nope'), null);
});

test('commitPaths returns null on no change and a sha on change, with trailer', () => {
  const { clone } = fixture();
  assert.equal(commitPaths(clone, ['README.md'], 'nothing', ''), null);
  fs.mkdirSync(path.join(clone, 'tasks', 'GH-16'), { recursive: true });
  fs.writeFileSync(path.join(clone, 'tasks', 'GH-16', 'autopilot.json'), '{}\n');
  const sha = commitPaths(clone, ['tasks/GH-16'], 'chore(GH-16): autopilot state', 'Reviewed-by: Bot');
  assert.match(sha, /^[0-9a-f]{40}$/);
  assert.equal(sha, sh(clone, 'rev-parse', 'HEAD'));
  const message = sh(clone, 'log', '-1', '--format=%B');
  assert.match(message, /^chore\(GH-16\): autopilot state/);
  assert.match(message, /Reviewed-by: Bot/);
  assert.equal(sh(clone, 'status', '--porcelain'), '');
});

test('workTip skips commits that touch only the two state files', () => {
  const { clone } = fixture();
  const work = tip(clone);
  fs.mkdirSync(path.join(clone, 'tasks', 'GH-16'), { recursive: true });
  fs.writeFileSync(path.join(clone, 'tasks', 'GH-16', 'autopilot.json'), '{}\n');
  fs.writeFileSync(path.join(clone, 'tasks', 'GH-16', 'stage-log.jsonl'), '{}\n');
  commitPaths(clone, ['tasks/GH-16'], 'chore(GH-16): autopilot state', '');
  assert.equal(workTip(clone, 'GH-16'), work);
  fs.writeFileSync(path.join(clone, 'tasks', 'GH-16', 'GH-16.md'), '# brief\n');
  fs.writeFileSync(path.join(clone, 'tasks', 'GH-16', 'autopilot.json'), '{"x":1}\n');
  const withWork = commitPaths(clone, ['tasks/GH-16'], 'chore(GH-16): scaffold', '');
  assert.equal(workTip(clone, 'GH-16'), withWork);
  fs.writeFileSync(path.join(clone, 'tasks', 'GH-16', 'autopilot.json'), '{"x":2}\n');
  commitPaths(clone, ['tasks/GH-16'], 'chore(GH-16): autopilot state', '');
  assert.equal(workTip(clone, 'GH-16'), withWork);
  assert.notEqual(tip(clone), withWork);
});

test('push refuses a branch outside <ID>- or a repo outside scope.frozen', () => {
  const { clone, origin } = fixture();
  ensureBranch(clone, 'GH-16-x', 'dev');
  assert.throws(() => push(clone, 'GH-16-x', { state: STATE(false), repoName: 'backend' }), { code: 'scope-violation' });
  assert.throws(() => push(clone, 'GH-16-x', { state: STATE(['web']), repoName: 'backend' }), { code: 'scope-violation' });
  assert.throws(() => push(clone, 'main', { state: STATE(['backend']), repoName: 'backend' }), { code: 'scope-violation' });
  assert.equal(sh(origin, 'branch', '--list', 'GH-16-x'), '', 'the remote has no such branch');
});

test('push succeeds inside scope and for the docs repository', () => {
  const { clone, origin } = fixture();
  ensureBranch(clone, 'GH-16-x', 'dev');
  push(clone, 'GH-16-x', { state: STATE(['backend']), repoName: 'backend' });
  assert.match(sh(origin, 'branch', '--list', 'GH-16-x'), /GH-16-x/);
  push(clone, 'GH-16-x', { state: STATE(false), repoName: 'docs' });
});

test('ensureOnTicketBranch switches to an existing ticket branch and refuses a dirty tree', () => {
  const { clone } = fixture();
  assert.equal(ensureOnTicketBranch(clone, 'GH-16'), null, 'no branch yet');
  ensureBranch(clone, 'GH-16-x', 'dev');
  sh(clone, 'checkout', '-q', 'main');
  assert.equal(ensureOnTicketBranch(clone, 'GH-16'), 'GH-16-x');
  assert.equal(sh(clone, 'branch', '--show-current'), 'GH-16-x');
  assert.equal(ensureOnTicketBranch(clone, 'GH-16'), 'GH-16-x', 'idempotent');
  assert.equal(ensureOnTicketBranch(clone, 'GH-160'), null, 'GH-160 does not match GH-16-x');
  sh(clone, 'checkout', '-q', 'main');
  fs.appendFileSync(path.join(clone, 'README.md'), 'dirty\n');
  assert.throws(() => ensureOnTicketBranch(clone, 'GH-16'), { code: 'dirty-worktree' });
});

test('remotePath parses https and ssh origins and returns null for a local path', () => {
  const { clone, base } = fixture();
  assert.equal(remotePath(clone), null, 'a local bare path is not a tracker path');
  sh(clone, 'remote', 'set-url', 'origin', 'https://github.com/o/backend.git');
  assert.equal(remotePath(clone), 'o/backend');
  sh(clone, 'remote', 'set-url', 'origin', 'git@gitlab.example.com:acme/platform/web.git');
  assert.equal(remotePath(clone), 'acme/platform/web');
  sh(clone, 'remote', 'set-url', 'origin', 'ssh://git@github.com/o/x');
  assert.equal(remotePath(clone), 'o/x');
  const plain = path.join(base, 'plain2');
  sh(base, 'init', '-q', plain);
  assert.equal(remotePath(plain), null);
});

test('forgeFor reads provider, host and path from the configured origin url', () => {
  const { clone, base } = fixture();
  assert.equal(forgeFor(clone), null, 'a local bare path has no forge');
  sh(clone, 'remote', 'set-url', 'origin', 'https://gitlab.example.com/acme/platform/web.git');
  assert.deepEqual(forgeFor(clone), { provider: 'gitlab', host: 'gitlab.example.com', path: 'acme/platform/web' });
  sh(clone, 'remote', 'set-url', 'origin', 'git@github.com:o/r.git');
  assert.deepEqual(forgeFor(clone), { provider: 'github', host: 'github.com', path: 'o/r' });
  sh(clone, 'remote', 'set-url', 'origin', 'ssh://git@gitlab.example.com:2222/acme/x');
  assert.deepEqual(forgeFor(clone), { provider: 'gitlab', host: 'gitlab.example.com', path: 'acme/x' });
  const plain = path.join(base, 'plain3');
  sh(base, 'init', '-q', plain);
  assert.equal(forgeFor(plain), null);
});

// A GitHub or GitLab ticket keeps its own forge when the remote's host is an ssh alias or an
// unknown host (as in 1.2.0); the remote decides only on github.com, a configured GitLab host,
// or for an Odoo ticket, which has no forge of its own. A port stays with a GitLab host.
test('forgeFor takes the ticket\'s forge for an alias host and keeps a GitLab port', () => {
  const { clone } = fixture();
  sh(clone, 'remote', 'set-url', 'origin', 'git@github-work:org/repo.git');
  assert.deepEqual(forgeFor(clone, { provider: 'github', host: 'github.com' }), { provider: 'github', host: 'github.com', path: 'org/repo' });
  assert.deepEqual(forgeFor(clone, { provider: 'gitlab', host: 'gitlab.example.com' }), { provider: 'gitlab', host: 'gitlab.example.com', path: 'org/repo' });
  assert.deepEqual(forgeFor(clone, { provider: 'odoo' }), { provider: 'gitlab', host: 'github-work', path: 'org/repo' });
  sh(clone, 'remote', 'set-url', 'origin', 'https://gitlab.corp:8443/g/r.git');
  assert.deepEqual(forgeFor(clone, { provider: 'odoo' }), { provider: 'gitlab', host: 'gitlab.corp:8443', path: 'g/r' });
  assert.deepEqual(forgeFor(clone, { provider: 'gitlab', host: 'gitlab.corp:8443' }), { provider: 'gitlab', host: 'gitlab.corp:8443', path: 'g/r' });
  sh(clone, 'remote', 'set-url', 'origin', 'git@github.com:o/r.git');
  assert.deepEqual(forgeFor(clone, { provider: 'gitlab', host: 'gitlab.example.com' }), { provider: 'github', host: 'github.com', path: 'o/r' }, 'github.com is always GitHub');
});

test('forgeFor reads the configured url, not an insteadOf rewrite', () => {
  const { clone, origin } = fixture();
  sh(clone, 'remote', 'set-url', 'origin', 'https://gitlab.example.com/acme/platform/web.git');
  sh(clone, 'config', `url.${origin}.insteadOf`, 'https://gitlab.example.com/acme/platform/web.git');
  assert.deepEqual(forgeFor(clone), { provider: 'gitlab', host: 'gitlab.example.com', path: 'acme/platform/web' });
  assert.ok(sh(clone, 'fetch', 'origin', 'main') === '' || true, 'fetch still reaches the bare origin through insteadOf');
});

test('repoDirs maps the marker to absolute paths', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'autopilot-dirs-'));
  assert.deepEqual(repoDirs(root, { topology: 'root', repos: [] }), { docs: root, repos: { '.': root } });
  assert.deepEqual(repoDirs(root, { topology: 'nested', repos: [{ name: 'backend', path: 'backend' }, { name: 'web', path: 'apps/web' }] }), {
    docs: root, repos: { backend: path.join(root, 'backend'), web: path.join(root, 'apps', 'web') },
  });
});
