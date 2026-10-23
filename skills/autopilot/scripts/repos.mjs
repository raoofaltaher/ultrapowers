// Git operations of the autopilot engine: branches, worktrees, commits and the guarded push.
// Node built-ins only; git runs through execFileSync with an argument array, never a shell.

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { AutopilotError, pushAllowed, branchNameProblem } from './autopilot-lib.mjs';
import { resolveTool, childEnv } from '../../../hooks/lib/resolve-tool.mjs';

const WORKTREES = '.worktrees';

// The absolute path of the git the engine starts, never a bare name: a bare `git` resolves through
// the child's working directory first on Windows, and through any relative PATH entry on every
// platform, and the working directory is a checkout a stage wrote. ULTRAPOWERS_GIT overrides the
// lookup, and only as an absolute path. `root` is the project, whose own folders are never searched.
function gitBinary(root) {
  const override = process.env.ULTRAPOWERS_GIT;
  if (override) {
    if (!path.isAbsolute(override)) throw new AutopilotError('bad-git', `ULTRAPOWERS_GIT must be an absolute path to a git executable, not ${JSON.stringify(override)}`);
    const file = resolveTool(override);
    if (!file) throw new AutopilotError('no-git', `ULTRAPOWERS_GIT ${override} is not a file`);
    return file;
  }
  const found = resolveTool('git', { root });
  if (!found) throw new AutopilotError('no-git', 'git is not on PATH (only absolute PATH entries outside the project are searched)');
  return found;
}

// A configured or remote-supplied branch name must not reach git as an option or a revision
// expression: refuse it before any argv is built from it.
function assertBranch(name, what = 'branch') {
  const problem = branchNameProblem(name);
  if (problem) throw new AutopilotError('bad-branch', `${what} ${problem}`);
  return name;
}

// null when git accepts `name` as a branch name too (check-ref-format), else a sentence. The pure
// rules come first, so `-x` and `@{-1}` never reach git as arguments.
export function checkBranchName(root, name) {
  const problem = branchNameProblem(name);
  if (problem) return `branch ${problem}`;
  try {
    execFileSync(gitBinary(root), ['check-ref-format', '--branch', name], { cwd: root, encoding: 'utf8', env: childEnv(process.env), windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    return null;
  } catch (err) {
    if (err instanceof AutopilotError) return err.message;
    return `branch ${JSON.stringify(name)} is not a valid branch name for git`;
  }
}

// The engine's git reads the repository's config, and a stage can reach it (a nested worktree's
// `.git` file, a script it ran). Command-line `-c` outranks every config file, so the keys that
// run a program are pinned: no filesystem monitor, plain ssh, no external diff, no proxy command,
// a plain pager, and hooks only from the engine-owned snapshot of the project's hooks taken at the
// start of the ticket (snapshotHooks), so a hook a stage writes later is not what the engine runs.
function workspaceRoot(dir) {
  for (let d = path.resolve(dir); ; d = path.dirname(d)) {
    if (fs.existsSync(path.join(d, '.agents', 'ultrapowers.json'))) return d;
    if (path.dirname(d) === d) return null;
  }
}

function hooksSnapshotDir(root) {
  return path.join(root, '.ultrapowers', 'autopilot', 'hooks');
}

// Copies the hooks directory git would use for the workspace (core.hooksPath of the project
// config, else .git/hooks: what git itself would run, so a .githooks folder git is not set to use stays unused) into .ultrapowers/autopilot/hooks/, replacing an
// earlier snapshot; an empty directory when there is none.
export function snapshotHooks(root) {
  let source = null;
  try {
    const cfg = execFileSync(gitBinary(root), ['config', '--get', 'core.hooksPath'], { cwd: root, encoding: 'utf8', env: childEnv(process.env), windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    if (cfg) source = path.resolve(root, cfg);
  } catch { source = null; }
  if (!source || !fs.existsSync(source)) source = path.join(root, '.git', 'hooks');
  const snap = hooksSnapshotDir(root);
  fs.rmSync(snap, { recursive: true, force: true });
  fs.mkdirSync(snap, { recursive: true });
  if (fs.existsSync(source) && fs.statSync(source).isDirectory() && path.resolve(source) !== path.resolve(snap)) {
    fs.cpSync(source, snap, { recursive: true });
  }
  return snap;
}

export function gitArgs(dir, args) {
  const root = workspaceRoot(dir);
  if (!root) throw new AutopilotError('no-workspace', `${dir} is not inside an ultrapowers workspace (no .agents/ultrapowers.json above it); the engine's git runs only inside one`);
  const hooks = hooksSnapshotDir(root);
  fs.mkdirSync(hooks, { recursive: true });
  // core.askPass is emptied too: the engine never prompts (GIT_TERMINAL_PROMPT=0), and a program a
  // repository's config names there would run on every credential question. credential.helper and
  // gpg.program stay the user's: their global helper and signing must keep working; a repository-
  // local change to them is caught by the config snapshot instead (gitConfigChanges).
  return ['-c', 'core.fsmonitor=false', '-c', 'core.sshCommand=ssh', '-c', 'diff.external=', '-c', 'core.gitProxy=', '-c', 'core.pager=cat', '-c', 'core.askPass=',
    '-c', 'core.hooksPath=' + hooks.split(path.sep).join('/'), ...args];
}

// Runs git in `dir`. Never throws for a git failure: { ok, stdout, stderr }. A directory outside a
// workspace is a programming error and throws (gitArgs).
export function git(dir, args) {
  const argv = gitArgs(dir, args);
  try {
    const stdout = execFileSync(gitBinary(workspaceRoot(dir)), argv, { cwd: dir, encoding: 'utf8', env: childEnv(process.env), windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    return { ok: true, stdout, stderr: '' };
  } catch (err) {
    return { ok: false, stdout: String(err.stdout ?? ''), stderr: String(err.stderr ?? err.message) };
  }
}

function must(dir, args, what) {
  const r = git(dir, args);
  if (!r.ok) throw new AutopilotError('git-failed', `${what}: git ${args.join(' ')} in ${dir}: ${r.stderr.trim()}`);
  return r.stdout;
}

// The remote's default branch, or `main` when origin/HEAD is not set.
export function remoteHead(dir) {
  const r = git(dir, ['symbolic-ref', '--short', 'refs/remotes/origin/HEAD']);
  if (!r.ok) return 'main';
  const name = r.stdout.trim().replace(/^origin\//, '');
  // The name comes from the remote: one that git would read as an option is not a default branch.
  return name && !branchNameProblem(name) ? name : 'main';
}

// ---- Repository-local git config that runs programs or redirects a remote (audit L2) ----
//
// The engine's git pins the keys it knows (gitArgs), but a stage can reach .git/config of a clone
// (and of a worktree), and git has more keys that start a program than any list of pins keeps up
// with: filter drivers run on `git add`, textconv on `git log -p`, an alias, an include, a
// remote's receive-pack. At `begin` the engine records the keys of the repository's own config that
// can run something or send the work elsewhere; before it does git work in `end` and `pr`, it
// compares, and any key added, changed or removed blocks the ticket.

const WATCHED_CORE = ['fsmonitor', 'sshcommand', 'pager', 'hookspath', 'askpass', 'editor', 'gitproxy', 'alternaterefscommand'];
const WATCHED_REMOTE = ['url', 'pushurl', 'uploadpack', 'receivepack', 'proxy', 'vcs'];
const WATCHED_HTTP = ['proxy', 'extraheader', 'sslverify', 'sslcainfo', 'cookiefile', 'sslcert', 'sslkey'];

// `key` as git prints it: section and variable lowercased, subsection as written.
export function watchedConfigKey(key) {
  const first = key.indexOf('.');
  const last = key.lastIndexOf('.');
  if (first < 0) return false;
  const section = key.slice(0, first);
  const variable = key.slice(last + 1);
  if (variable === 'textconv') return true;
  switch (section) {
    case 'core': return WATCHED_CORE.includes(key.slice(first + 1));
    case 'credential': case 'gpg': case 'filter': case 'alias': case 'include': case 'includeif': case 'url': return true;
    case 'diff': return variable === 'command' || variable === 'external';
    case 'merge': return variable === 'driver' || variable === 'recursivedriver';
    case 'remote': return first !== last && WATCHED_REMOTE.includes(variable);
    case 'http': return WATCHED_HTTP.includes(variable);
    default: return false;
  }
}

// Every [key, value] of one scope of the repository's config.
function configPairs(dir, scope) {
  const r = git(dir, ['config', scope, '--list', '--null']);
  if (!r.ok) return [];
  const out = [];
  for (const raw of r.stdout.split('\0')) {
    if (!raw) continue;
    const nl = raw.indexOf('\n');
    out.push(nl < 0 ? [raw, ''] : [raw.slice(0, nl), raw.slice(nl + 1)]);
  }
  return out;
}

// The watched entries (`key=value`, sorted) of the repository's own config, and of its
// config.worktree when the repository uses extensions.worktreeConfig.
export function gitConfigSnapshot(dir) {
  const local = configPairs(dir, '--local');
  const perWorktree = local.some(([k, v]) => k === 'extensions.worktreeconfig' && /^(true|yes|on|1)$/i.test(v));
  const pairs = perWorktree ? [...local, ...configPairs(dir, '--worktree')] : local;
  return [...new Set(pairs.filter(([k]) => watchedConfigKey(k)).map(([k, v]) => `${k}=${v}`))].sort();
}

// The keys whose entries differ between `before` and the config now: added, changed or removed.
export function gitConfigChanges(dir, before) {
  const now = new Set(gitConfigSnapshot(dir));
  const was = new Set(before);
  const changed = new Set();
  for (const e of now) if (!was.has(e)) changed.add(e.slice(0, e.indexOf('=')));
  for (const e of was) if (!now.has(e)) changed.add(e.slice(0, e.indexOf('=')));
  return [...changed].sort();
}

function hasRemote(dir) {
  return git(dir, ['remote', 'get-url', 'origin']).ok;
}

function branchExists(dir, branch) {
  return git(dir, ['rev-parse', '--verify', '--quiet', `refs/heads/${branch}`]).ok;
}

// The start point for a new ticket branch: the newer of the local base and origin/<base> after a
// fetch. A local base with unpushed commits wins over origin; an origin ahead of a stale local wins
// over it; when they diverged, the local base is what the developer sees, so it wins.
function startPoint(dir, base) {
  assertBranch(base, 'base branch');
  const local = git(dir, ['rev-parse', '--verify', '--quiet', `refs/heads/${base}`]).ok;
  let remote = false;
  if (hasRemote(dir)) {
    // A full refspec: the name can only ever be a branch of the remote, never an option of fetch.
    const f = git(dir, ['fetch', '--quiet', 'origin', `+refs/heads/${base}:refs/remotes/origin/${base}`]);
    remote = f.ok && git(dir, ['rev-parse', '--verify', '--quiet', `refs/remotes/origin/${base}`]).ok;
  }
  // Full ref names: a tag or a file called like the branch must not stand in for it.
  if (local && remote) {
    const localContainsRemote = git(dir, ['merge-base', '--is-ancestor', `refs/remotes/origin/${base}`, `refs/heads/${base}`]).ok;
    return localContainsRemote ? `refs/heads/${base}` : `refs/remotes/origin/${base}`;
  }
  if (remote) return `refs/remotes/origin/${base}`;
  if (local) return `refs/heads/${base}`;
  throw new AutopilotError('no-base', `${dir} has no branch ${base} locally or on origin`);
}

// Creates `branch` from the base when missing and checks it out in `dir`.
export function ensureBranch(dir, branch, base) {
  const current = git(dir, ['branch', '--show-current']).stdout.trim();
  if (branchExists(dir, branch)) {
    if (current !== branch) must(dir, ['checkout', '--quiet', branch], 'checkout');
    return { created: false };
  }
  const start = startPoint(dir, base);
  must(dir, ['checkout', '--quiet', '-b', branch, start], 'create branch');
  return { created: true };
}

// The local `<ID>-*` branch of a ticket in `dir`, or null when none exists yet.
export function ticketBranch(dir, id) {
  const r = git(dir, ['for-each-ref', '--format=%(refname:short)', `refs/heads/${id}-*`]);
  if (!r.ok) return null;
  const names = r.stdout.split('\n').map((s) => s.trim()).filter(Boolean);
  return names[0] ?? null;
}

// Puts `dir` on the ticket's branch when one exists and another branch is checked out.
// A dirty tree is refused: the engine never discards work to switch tickets.
export function ensureOnTicketBranch(dir, id) {
  const branch = ticketBranch(dir, id);
  if (!branch) return null;
  const current = git(dir, ['branch', '--show-current']).stdout.trim();
  if (current === branch) return branch;
  const dirty = git(dir, ['status', '--porcelain', '--untracked-files=no']).stdout.trim();
  if (dirty) throw new AutopilotError('dirty-worktree', `${dir} is on ${current || 'a detached HEAD'} with uncommitted changes; commit or stash them before running ${id}, whose branch is ${branch}`);
  must(dir, ['checkout', '--quiet', branch], 'checkout');
  return branch;
}

// Where the engine keeps the worktree of `branch` in a clone: the path is recomputed, never read from state.
export function worktreePath(cloneDir, branch) {
  return path.join(cloneDir, WORKTREES, branch);
}

// A worktree for `branch` under <clone>/.worktrees/<branch>, created from the base when the branch is new.
export function ensureWorktree(cloneDir, branch, base) {
  const target = worktreePath(cloneDir, branch);
  if (fs.existsSync(path.join(target, '.git'))) return target;
  fs.mkdirSync(path.join(cloneDir, WORKTREES), { recursive: true });
  const ignore = path.join(cloneDir, WORKTREES, '.gitignore');
  if (!fs.existsSync(ignore)) fs.writeFileSync(ignore, '*\n');
  if (branchExists(cloneDir, branch)) {
    must(cloneDir, ['worktree', 'add', '--quiet', target, branch], 'add worktree');
  } else {
    const start = startPoint(cloneDir, base);
    must(cloneDir, ['worktree', 'add', '--quiet', '-b', branch, target, start], 'add worktree');
  }
  return target;
}

// The sha of a ref, or null when it does not resolve.
export function tip(dir, ref = 'HEAD') {
  // A revision that starts with "-" is an option, not a revision: it resolves to nothing.
  if (typeof ref !== 'string' || ref.startsWith('-')) return null;
  const r = git(dir, ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`]);
  return r.ok ? r.stdout.trim() : null;
}

// The newest commit on `ref` that touches anything other than the ticket's two state files.
// Engine bookkeeping commits (state and log only) never move the work tip, so they are never drift.
export function workTip(dir, id, ref = 'HEAD') {
  if (typeof ref !== 'string' || ref.startsWith('-')) return null;
  const r = git(dir, ['log', '--format=%x00%H', '--name-only', '-n', '200', ref, '--']);
  if (!r.ok) return tip(dir, ref);
  const bookkeeping = new Set([`tasks/${id}/autopilot.json`, `tasks/${id}/stage-log.jsonl`]);
  for (const block of r.stdout.split('\0').slice(1)) {
    const [sha, ...files] = block.split('\n').map((l) => l.trim()).filter(Boolean);
    if (files.length === 0 || files.some((f) => !bookkeeping.has(f))) return sha;
  }
  return tip(dir, ref);
}

// Stages `paths`, commits with the message and the optional trailer; null when nothing changed.
export function commitPaths(dir, paths, message, trailer = '') {
  must(dir, ['add', '-A', '--', ...paths], 'stage');
  const staged = git(dir, ['diff', '--cached', '--quiet', '--', ...paths]);
  if (staged.ok) return null;
  const messages = ['-m', message];
  if (trailer && trailer.trim()) messages.push('-m', trailer.trim());
  must(dir, ['commit', '--quiet', ...messages, '--', ...paths], 'commit');
  return tip(dir);
}

// Pushes `branch` to origin, only when the state allows it for this repository. `ticket` is the
// id the command validated; without it the state's copy is used.
export function push(dir, branch, { state, repoName, ticket = state.ticket }) {
  if (!pushAllowed(state, repoName, branch, ticket)) {
    throw new AutopilotError('scope-violation', `push of ${branch} in ${repoName} is outside the ticket's frozen scope`);
  }
  // git's own check too, then a full refspec: the name can only ever be a branch of the same name.
  must(dir, ['check-ref-format', '--branch', branch], 'check branch name');
  must(dir, ['push', '--quiet', '-u', 'origin', `refs/heads/${branch}:refs/heads/${branch}`], 'push');
}

// Short shas of the commits on the local base that origin/<base> does not have, oldest first;
// empty without a remote or a local base. These ride into the ticket's pull request.
export function baseAhead(dir, base) {
  if (!hasRemote(dir)) return [];
  const local = git(dir, ['rev-parse', '--verify', '--quiet', `refs/heads/${base}`]).ok;
  const remote = git(dir, ['rev-parse', '--verify', '--quiet', `refs/remotes/origin/${base}`]).ok;
  if (!local || !remote) return [];
  const r = git(dir, ['log', '--reverse', '--format=%h', `refs/remotes/origin/${base}..refs/heads/${base}`]);
  return r.ok ? r.stdout.split('\n').map((s) => s.trim()).filter(Boolean) : [];
}

// True when any of `paths` differs between the two revisions; an unreadable revision counts as changed.
export function pathsChanged(dir, from, to, paths) {
  // The revisions can come from the state file, which a stage can write: never an option of git.
  if ([from, to].some((rev) => typeof rev !== 'string' || rev.startsWith('-'))) return true;
  const r =git(dir, ['diff', '--quiet', from, to, '--', ...paths]);
  return !r.ok;
}

// The `owner/repo` path of origin, parsed from an https or ssh URL; null for a local or unknown remote.
export function remotePath(dir) {
  const r = git(dir, ['remote', 'get-url', 'origin']);
  if (!r.ok) return null;
  const url = r.stdout.trim();
  const m = /^(?:https?:\/\/[^/]+\/|[^@]+@[^:]+:|ssh:\/\/[^/]+\/)(.+?)(?:\.git)?\/?$/.exec(url);
  if (!m || !m[1].includes('/') || /^[A-Za-z]:[\\/]|^\//.test(url) || /^[A-Za-z]:/.test(m[1])) return null;
  return m[1];
}

// The forge of a repository, from its origin remote (spec D5): github.com is GitHub, any other
// host name is GitLab at that host. An ssh host alias (`git@github-work:org/repo`, no dot) names
// no host at all: a GitHub or GitLab ticket then keeps its own forge, as in 1.2.0, and an Odoo
// ticket, which has no forge of its own, takes the alias as a GitLab host. An https port stays
// with a GitLab host; an ssh port (`ssh://host:2222/`) is not a web port.
export function forgeFor(dir, ticket = {}) {
  const r = git(dir, ['config', '--get', 'remote.origin.url']);
  if (!r.ok) return null;
  const url = r.stdout.trim();
  if (/^[A-Za-z]:[\\/]|^\/|^\.\.?[\\/]/.test(url)) return null;
  const m = /^(?:https?:\/\/(?:[^@/]+@)?([^/:]+)(:\d+)?\/|ssh:\/\/(?:[^@/]+@)?([^/:]+)(?::\d+)?\/|(?:[^@/]+@)?([^:/]+):(?!\/))(.+?)(?:\.git)?\/?$/.exec(url);
  if (!m) return null;
  const bare = (m[1] ?? m[3] ?? m[4] ?? '').toLowerCase();
  const host = m[1] && m[2] ? `${bare}${m[2]}` : bare;
  const repoPath = m[5];
  if (!bare || !repoPath.includes('/') || /^[A-Za-z]:/.test(repoPath)) return null;
  if (bare === 'github.com') return { provider: 'github', host: 'github.com', path: repoPath };
  const ticketHost = String(ticket.host ?? '').toLowerCase();
  const alias = !bare.includes('.') && bare !== 'localhost';
  if (alias && ['github', 'gitlab'].includes(ticket.provider) && ticketHost) {
    return { provider: ticket.provider, host: ticketHost, path: repoPath };
  }
  return { provider: 'gitlab', host, path: repoPath };
}

// Absolute directories of the documents repository and every code repository of the marker.
export function repoDirs(root, marker) {
  const repos = Array.isArray(marker?.repos) ? marker.repos : [];
  if (marker?.topology !== 'nested' || repos.length === 0) return { docs: root, repos: { '.': root } };
  return { docs: root, repos: Object.fromEntries(repos.map((r) => [r.name, path.resolve(root, r.path ?? r.name)])) };
}
