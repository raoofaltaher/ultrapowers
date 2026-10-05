// Git operations of the autopilot engine: branches, worktrees, commits and the guarded push.
// Node built-ins only; git runs through execFileSync with an argument array, never a shell.

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { AutopilotError, pushAllowed } from './autopilot-lib.mjs';

const WORKTREES = '.worktrees';

function gitBinary() {
  return process.env.ULTRAPOWERS_GIT || 'git';
}

// Runs git in `dir`. Never throws: { ok, stdout, stderr }.
export function git(dir, args) {
  try {
    const stdout = execFileSync(gitBinary(), args, { cwd: dir, encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
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
  return r.stdout.trim().replace(/^origin\//, '') || 'main';
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
  const local = git(dir, ['rev-parse', '--verify', '--quiet', `refs/heads/${base}`]).ok;
  let remote = false;
  if (hasRemote(dir)) {
    const f = git(dir, ['fetch', '--quiet', 'origin', base]);
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

// A worktree for `branch` under <clone>/.worktrees/<branch>, created from the base when the branch is new.
export function ensureWorktree(cloneDir, branch, base) {
  const target = path.join(cloneDir, WORKTREES, branch);
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
  const r = git(dir, ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`]);
  return r.ok ? r.stdout.trim() : null;
}

// The newest commit on `ref` that touches anything other than the ticket's two state files.
// Engine bookkeeping commits (state and log only) never move the work tip, so they are never drift.
export function workTip(dir, id, ref = 'HEAD') {
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
  must(dir, ['push', '--quiet', '-u', 'origin', branch], 'push');
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
  const r = git(dir, ['diff', '--quiet', from, to, '--', ...paths]);
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

// The forge of a repository, from its configured origin url (not an insteadOf rewrite): github.com
// is GitHub through gh, any other host is GitLab through glab against that host (spec D5). Null for
// a local path or no remote.
// The forge of a repository, from its origin remote: the path always; the provider and host
// from the remote when it names github.com or the ticket's own GitLab host, or when the ticket
// has no forge of its own (Odoo). A GitHub or GitLab ticket otherwise keeps its own forge, so an
// ssh host alias (`git@github-work:org/repo`) still opens its pull request where 1.2.0 did. An
// https or ssh port stays with a GitLab host; an ssh port (`ssh://host:2222/`) is not a web port.
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
  if (['github', 'gitlab'].includes(ticket.provider) && host !== ticketHost && bare !== ticketHost) {
    return { provider: ticket.provider, host: ticketHost || host, path: repoPath };
  }
  return { provider: 'gitlab', host, path: repoPath };
}

// Absolute directories of the documents repository and every code repository of the marker.
export function repoDirs(root, marker) {
  const repos = Array.isArray(marker?.repos) ? marker.repos : [];
  if (marker?.topology !== 'nested' || repos.length === 0) return { docs: root, repos: { '.': root } };
  return { docs: root, repos: Object.fromEntries(repos.map((r) => [r.name, path.resolve(root, r.path ?? r.name)])) };
}
