#!/usr/bin/env node
// post-review.mjs <ticket> [--draft-pr] [--cwd <dir>]
// post-review.mjs --security-only <ticket | audit-YYYY-MM-DD> [--cwd <dir>]
//
// Step 6 of ultrapowers:task-review, run only when the invocation carried --post. Posts the full
// reviews/<ticket>/TASK-REVIEW.md, QA-REPORT.md and, when the vulnerability hunt wrote one,
// SECURITY-REPORT.md, screenshots included, on the ticket and on the
// ticket's open pull or merge request of each repository on a ticket branch, through the autopilot
// tracker clients (tracker.mjs) and the guarded push (repos.mjs). It never merges and never edits
// code. Network access is only what those two modules do; a local ticket is refused.
//
//   - reviews/<ticket>/ is committed to the documents branch (the branch checked out in the project
//     root, which must start with "<ticket>-") and pushed. On GitHub each screenshot is linked from
//     that branch through the blob URL with ?raw=true (a logged-in viewer with access sees it on a
//     private repository); on GitLab it is uploaded to the project and embedded from the upload.
//   - On Odoo the screenshots are attached to the chatter message (OdooTracker.attach) under
//     their own names.
//   - A report longer than the tracker's comment limit goes as numbered parts, in order, each under
//     the limit; a screenshot stays in the part that references it.
//   - The pull or merge request is found by branch name, never by the ticket number. With none open and
//     --draft-pr, the ticket branch is pushed through the guarded push and a draft is opened first.
//
// --security-only (the standalone door of ultrapowers:vulnerability-hunt) posts reviews/<id>/SECURITY-REPORT.md
// alone. With a ticket id it does what the full post does for that one report: the ticket, and the open pull
// or merge request of each repository on a ticket branch (commit and guarded push of reviews/<ticket>/ as
// above), never a draft. With an audit id (audit-YYYY-MM-DD, a hunt without a ticket) there is no ticket and no
// ticket branch: the report goes as numbered comments on the open pull or merge request of the branch checked
// out in the project root, found through the tracker's findOpenPr(branch); none open is a refusal (no-open-pr).
// The folder reviews/audit-<date>/ is committed and pushed through the guarded push only when that branch starts
// with "audit-<date>-"; on any other branch nothing is committed or pushed and the output says so. It never
// opens a draft and combining it with --draft-pr is a usage error.
//
// Exit codes: 0 posted; 2 usage; 3 no project root; 4 invalid ticket; 5 refused (local ticket, no review,
// documents not on a ticket branch, a tracker or git failure).
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { AutopilotError, loadSecretsFile, pushAllowed, reviewFolderProblem } from '../../autopilot/scripts/autopilot-lib.mjs';
import { trackerFor } from '../../autopilot/scripts/tracker.mjs';
import { commitPaths, forgeFor, git, push } from '../../autopilot/scripts/repos.mjs';
import { resolveTicket, TicketError } from '../../new-task/scripts/ticket-sources.mjs';
import { DEFAULT_TICKET_PATTERN, changeSetOnly, findRoot } from '../../qa-specialist/scripts/qa-preflight.mjs';

// GitHub refuses a comment over 65,536 characters. glab takes the note as one argument, and a
// Windows command line holds about 32,000, so GitLab parts stay well under that.
const LIMITS = { github: 65000, gitlab: 24000, odoo: 65000 };
const HEADER_RESERVE = 120;
// A link or image into artifacts/: the path is bare (ends at the first closing parenthesis) or in angle brackets.
const ARTIFACT = /(!?)\[([^\]]*)\]\((?:<(artifacts\/[^>\r\n]*)>|(artifacts\/[^)\r\n]*))\)/g;

const defaultDeps = {
  currentBranch: (dir) => git(dir, ['branch', '--show-current']).stdout.trim(),
  commitPaths,
  push,
  forgeFor,
  trackerFor,
  changeSet: (root, id) => {
    const result = changeSetOnly({ cwd: root, ticket: id });
    if (!result.ok) throw new AutopilotError('bad-ticket', result.errors.join('; '));
    return result.changeSet;
  },
};

// A path segment, percent-encoded so that it survives inside a Markdown link.
function encodeSegment(text) {
  return encodeURIComponent(text).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

// Where a branch's files can be fetched raw on its forge; null without a forge.
export function rawBase(forge, branch) {
  if (!forge) return null;
  const encoded = String(branch).split('/').map(encodeSegment).join('/');
  if (forge.provider === 'github') return `https://raw.githubusercontent.com/${forge.path}/${encoded}`;
  if (forge.provider === 'gitlab') return `https://${forge.host}/${forge.path}/-/raw/${encoded}`;
  return null;
}

// Where a branch's files can be linked so that a logged-in viewer with access sees them: on GitHub
// the blob URL (an image carries ?raw=true, which GitHub serves through a signed redirect on a
// private repository too); on GitLab the raw URL (an upload replaces it where it can, see the
// upload mode). Null without a forge.
export function linkBase(forge, branch) {
  if (!forge) return null;
  const encoded = String(branch).split('/').map(encodeSegment).join('/');
  if (forge.provider === 'github') return `https://github.com/${forge.path}/blob/${encoded}`;
  return rawBase(forge, branch);
}

function decodeName(raw) {
  if (!/%[0-9A-Fa-f]{2}/.test(raw)) return raw;
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

// A report is written by an agent and can echo ticket text, so a link's path is untrusted data.
// Only a relative name that stays inside reviews/<ID>/artifacts/ is read, attached or linked.
export function insideArtifacts(name) {
  if (typeof name !== 'string' || name === '' || name.includes('\\') || name.includes('\0')) return false;
  if (name.startsWith('/') || /^[A-Za-z]:/.test(name)) return false;
  return name.split('/').every((segment) => segment !== '' && segment !== '.' && segment !== '..');
}

// Rewrites every link into artifacts/ in a report for one destination.
//   mode 'raw'    -> the file's URL on the pushed branch (options.base)
//   mode 'attach' -> a line naming the attached file (the caller attaches it); options.exists(name) says
//                    whether the file is on disk, and a missing one is named, not attached
//   mode 'plain'  -> a line saying the file is attached to the ticket
// Returns { text, files } where files lists { name, replacement } for each artifact link, in order.
//   mode 'upload' -> the file's URL on the tracker after an upload (options.uploaded, name -> url);
//                    a file whose upload failed (options.failed, name -> reason) keeps the raw link
//                    from options.base with a note, and a missing file is named, not linked
//   imageQuery      -> appended to an image URL in raw mode (GitHub's ?raw=true)
export function rewriteLinks(text, { id, mode, base = null, exists = () => true, imageQuery = '', uploaded = null, failed = null }) {
  const files = [];
  const rawUrl = (name) => `${base}/reviews/${encodeSegment(id)}/artifacts/${name.split('/').map(encodeSegment).join('/')}`;
  const out = String(text).replace(ARTIFACT, (whole, bang, label, angled, bare) => {
    const name = decodeName((angled ?? bare).slice('artifacts/'.length));
    const caption = label || name;
    if (!insideArtifacts(name)) {
      return `${bang ? 'Screenshot' : 'File'}: ${caption} (the link is not inside reviews/${id}/artifacts/, not posted)`;
    }
    let replacement;
    if (mode === 'raw') {
      replacement = `${bang}[${label}](${rawUrl(name)}${bang && imageQuery ? imageQuery : ''})`;
    } else if (mode === 'upload') {
      if (uploaded && uploaded.has(name)) replacement = `${bang}[${label}](${uploaded.get(name)})`;
      else if (failed && failed.has(name)) replacement = base ? `${bang}[${label}](${rawUrl(name)}) (upload failed: ${failed.get(name)})` : `${bang ? 'Screenshot' : 'File'}: ${caption} (upload failed: ${failed.get(name)})`;
      else if (!exists(name)) return `${bang ? 'Screenshot' : 'File'}: ${caption} (artifacts/${name} not found, not attached)`;
      else replacement = base ? `${bang}[${label}](${rawUrl(name)})` : `${bang ? 'Screenshot' : 'File'}: ${caption} (artifacts/${name})`;
    } else if (mode === 'attach') {
      replacement = exists(name)
        ? `${bang ? 'Screenshot' : 'File'}: ${caption} (attached as ${name})`
        : `${bang ? 'Screenshot' : 'File'}: ${caption} (artifacts/${name} not found, not attached)`;
      if (!exists(name)) return replacement;
    } else {
      replacement = `${bang ? 'Screenshot' : 'File'}: ${caption} (attached to the ticket as ${name})`;
    }
    files.push({ name, replacement });
    return replacement;
  });
  return { text: out, files };
}

// Splits a report into parts that are each at most `limit` characters. It cuts at a blank line
// when one is near, never inside a line unless the line is itself too long, and closes and
// reopens a fenced block it has to cut. Joining the parts with newlines restores the text.
export function splitParts(text, limit) {
  if (text.length <= limit) return [text];
  const budget = limit - 16;
  const lines = text.split('\n');
  const parts = [];
  let start = 0;
  let reopen = false;
  while (start < lines.length) {
    let used = reopen ? 4 : 0;
    let end = start;
    while (end < lines.length && used + lines[end].length + 1 <= budget) {
      used += lines[end].length + 1;
      end += 1;
    }
    if (end === start) {
      const piece = budget - 8;
      const long = lines[start];
      const cut = [];
      for (let i = 0; i < long.length; i += piece) cut.push(long.slice(i, i + piece));
      lines.splice(start, 1, ...cut);
      continue;
    }
    if (end < lines.length) {
      // Prefer a cut before a heading, so a finding and its screenshot stay together; else after a
      // blank line that does not separate a paragraph from its image; else at the last line that fits.
      let brk = end;
      let blank = -1;
      for (let i = end - 1; i > start + (end - start) / 2; i -= 1) {
        if (/^#{1,6} /.test(lines[i])) {
          brk = i;
          blank = -2;
          break;
        }
        if (blank === -1 && lines[i].trim() === '' && !/^!\[/.test(lines[i + 1] ?? '')) blank = i + 1;
      }
      if (blank >= 0) brk = blank;
      end = brk;
    }
    const slice = lines.slice(start, end);
    let inFence = reopen;
    for (const line of slice) if (/^```/.test(line)) inFence = !inFence;
    const body = (reopen ? ['```'] : []).concat(slice);
    if (inFence) body.push('```');
    parts.push(body.join('\n'));
    reopen = inFence;
    start = end;
  }
  return parts;
}

function numbered(name, parts) {
  return parts.map((part, i) => `**${name}**${parts.length > 1 ? ` (part ${i + 1} of ${parts.length})` : ''}\n\n${part}`);
}

// The comments for one destination: TASK-REVIEW.md, QA-REPORT.md, then SECURITY-REPORT.md when there is
// one, each rewritten and split.
// Returns [{ body, attachments }] in posting order. In upload mode every artifact a document links
// is uploaded first through tracker.upload; a failed upload is noted in `notes` and the link
// falls back to the raw URL.
async function commentsFor(documents, { id, mode, base, limit, root, imageQuery = '', tracker = null, notes = [] }) {
  const out = [];
  const artifactsDir = path.resolve(root, 'reviews', id, 'artifacts');
  // The real path must sit under the real artifacts folder: a symlink inside it is not followed out.
  // The folder itself must be the project's own reviews/<ID>/artifacts, not a link out of it.
  const artifactPath = (name) => {
    const file = path.resolve(artifactsDir, name);
    if (!insideArtifacts(name) || !file.startsWith(`${artifactsDir}${path.sep}`)) throw new AutopilotError('bad-artifact', `artifacts/${name} is not inside reviews/${id}/artifacts/`);
    const folder = reviewFolderProblem(root, id, 'artifacts');
    if (folder) throw new AutopilotError('bad-artifact', folder);
    let realDir;
    let realFile;
    try { realDir = fs.realpathSync(artifactsDir); realFile = fs.realpathSync(file); } catch { return file; }
    if (!realFile.startsWith(`${realDir}${path.sep}`)) throw new AutopilotError('bad-artifact', `artifacts/${name} resolves outside reviews/${id}/artifacts/`);
    return realFile;
  };
  const exists = (name) => {
    if (!insideArtifacts(name)) return false;
    try { return fs.existsSync(artifactPath(name)); } catch { return false; }
  };
  const uploaded = new Map();
  const failed = new Map();
  if (mode === 'upload') {
    for (const doc of documents) {
      for (const file of rewriteLinks(doc.text, { id, mode: 'raw', base: base || '', exists }).files) {
        if (uploaded.has(file.name) || failed.has(file.name) || !exists(file.name)) continue;
        try {
          const up = await tracker.upload(artifactPath(file.name));
          uploaded.set(file.name, up.url);
        } catch (error) {
          const reason = error instanceof Error ? error.message : String(error);
          failed.set(file.name, reason);
          notes.push(`artifacts/${file.name}: upload failed: ${reason}`);
        }
      }
    }
  }
  for (const doc of documents) {
    const { text, files } = rewriteLinks(doc.text, { id, mode, base, exists, imageQuery, uploaded, failed });
    const parts = numbered(doc.name, splitParts(text, limit - HEADER_RESERVE));
    for (const body of parts) {
      if (body.length > limit) throw new AutopilotError('part-too-long', `a part of ${doc.name} has ${body.length} characters, over the ${limit} limit`);
      const attachments = [];
      if (mode === 'attach') {
        for (const file of files) {
          if (!body.includes(file.replacement) || !exists(file.name) || attachments.some((a) => a.name === file.name)) continue;
          attachments.push({ name: file.name, bytes: fs.readFileSync(artifactPath(file.name)) });
        }
      }
      out.push({ body, attachments });
    }
  }
  return out;
}

// How a destination shows a screenshot: Odoo attaches it, GitLab uploads it to the project (raw
// link as the fallback), GitHub links the blob with ?raw=true; a destination without a documents
// forge gets a plain line. `raw` and `link` are the documents branch's bases, null when none.
function modeFor(provider, raw, link) {
  if (provider === 'odoo') return { mode: 'attach' };
  if (provider === 'gitlab') return { mode: 'upload', base: raw };
  return link ? { mode: 'raw', base: link, imageQuery: '?raw=true' } : { mode: 'plain' };
}

function sourceOf(marker, resolution) {
  return (marker?.tickets?.sources ?? []).find((s) => s.prefix === resolution.prefix) ?? {};
}

// The forge of a code repository: its origin remote, else (GitHub and GitLab tickets) the ticket's
// own owner or namespace with the repository's name, else null.
function repoForge(deps, marker, resolution, name, dir) {
  const found = deps.forgeFor(dir, { provider: resolution.provider, host: resolution.host });
  if (found) return found;
  if (!['github', 'gitlab'].includes(resolution.provider)) return null;
  const source = sourceOf(marker, resolution);
  const owner = source.provider === 'gitlab' ? source.namespace : source.owner;
  return owner ? { provider: resolution.provider, host: resolution.host, path: `${owner}/${name}` } : null;
}

export async function postReview({ id, root, marker, resolution, draftPr = false, securityOnly = false, env = process.env }, deps = defaultDeps) {
  if (securityOnly && draftPr) {
    throw new AutopilotError('usage', '--security-only never opens a draft; drop --draft-pr');
  }
  if (resolution.provider === 'local') {
    throw new AutopilotError('local-ticket', `${id} is a local ticket: there is no tracker to post to. --post needs a ticket from a configured GitHub, GitLab or Odoo source`);
  }
  if (!['github', 'gitlab', 'odoo'].includes(resolution.provider)) {
    throw new AutopilotError('no-writeback', `${resolution.provider} tickets have no write-back in this version; GitHub, GitLab and Odoo do`);
  }
  // Everything under reviews/<ID> is read and posted: a folder that links out of the project is
  // refused before anything is read, committed or pushed.
  const folder = reviewFolderProblem(root, id) ?? reviewFolderProblem(root, id, 'artifacts');
  if (folder) throw new AutopilotError('bad-artifact', `${folder}; nothing was posted`);
  const securityFile = path.join(root, 'reviews', id, 'SECURITY-REPORT.md');
  const hasSecurity = fs.existsSync(securityFile);
  const documents = [];
  if (securityOnly) {
    if (!hasSecurity) throw new AutopilotError('no-security-report', `reviews/${id}/SECURITY-REPORT.md does not exist; run the vulnerability hunt before posting it`);
    documents.push({ name: 'SECURITY-REPORT.md', text: fs.readFileSync(securityFile, 'utf8') });
  } else {
    const reviewFile = path.join(root, 'reviews', id, 'TASK-REVIEW.md');
    if (!fs.existsSync(reviewFile)) {
      throw new AutopilotError('no-review', `reviews/${id}/TASK-REVIEW.md does not exist; run the review before posting it`);
    }
    documents.push({ name: 'TASK-REVIEW.md', text: fs.readFileSync(reviewFile, 'utf8') });
    const qaFile = path.join(root, 'reviews', id, 'QA-REPORT.md');
    if (fs.existsSync(qaFile)) documents.push({ name: 'QA-REPORT.md', text: fs.readFileSync(qaFile, 'utf8') });
    // The vulnerability hunt's report (Step 3b) is the third part, only when the hunt wrote one.
    if (hasSecurity) documents.push({ name: 'SECURITY-REPORT.md', text: fs.readFileSync(securityFile, 'utf8') });
  }

  const docsBranch = deps.currentBranch(root);
  if (!docsBranch.startsWith(`${id}-`)) {
    throw new AutopilotError('no-docs-branch', `the documents repository at ${root} is on ${docsBranch || 'a detached HEAD'}, not on a branch starting with ${id}-; check out the ticket's documents branch first (the guarded push only pushes ${id}- branches)`);
  }

  const docsForge = deps.forgeFor(root, { provider: resolution.provider, host: resolution.host })
    ?? (['github', 'gitlab'].includes(resolution.provider) ? { provider: resolution.provider, host: resolution.host, path: resolution.path } : null);
  const trailer = typeof marker?.commitTrailer === 'string' ? marker.commitTrailer : '';
  deps.commitPaths(root, [`reviews/${id}`], securityOnly ? `docs(${id}): security report` : `docs(${id}): task review`, trailer);
  if (docsForge) {
    deps.push(root, docsBranch, { state: { ticket: id, scope: { frozen: [] } }, repoName: 'docs', ticket: id });
  }
  const docsRaw = rawBase(docsForge, docsBranch);
  const docsLink = linkBase(docsForge, docsBranch);

  const posted = [];
  const notes = [];

  const ticketTracker = deps.trackerFor(resolution, env);
  const ticketMode = modeFor(resolution.provider, docsRaw, docsLink).mode;
  for (const c of await commentsFor(documents, { id, ...modeFor(resolution.provider, docsRaw, docsLink), limit: LIMITS[resolution.provider], root, tracker: ticketTracker, notes })) {
    const url = ticketMode === 'attach' && c.attachments.length
      ? await ticketTracker.comment(resolution.number, c.body, { attachments: c.attachments })
      : await ticketTracker.comment(resolution.number, c.body);
    posted.push({ to: 'ticket', url, chars: c.body.length, attachments: c.attachments.map((a) => a.name) });
  }

  const entries = deps.changeSet(root, id).filter((e) => e.onTicketBranch && !e.error);
  for (const entry of entries) {
    const dir = path.resolve(root, entry.path);
    const forge = repoForge(deps, marker, resolution, entry.repo, dir);
    if (!forge) {
      notes.push(`${entry.repo}: no forge for this repository's origin; no pull request comment`);
      continue;
    }
    const tracker = deps.trackerFor({ provider: forge.provider, host: forge.host, path: forge.path }, env);
    const branch = entry.branch;
    let prUrl = await tracker.findOpenPr(branch);
    let created = false;
    if (!prUrl) {
      if (!draftPr) {
        notes.push(securityOnly
          ? `${entry.repo}: no open pull request for ${branch}; the security report was not posted there`
          : `${entry.repo}: no open pull request for ${branch}; pass --draft-pr to push the branch and open a draft`);
        continue;
      }
      try {
        deps.push(dir, branch, { state: { ticket: id, scope: { frozen: [entry.repo] } }, repoName: entry.repo, ticket: id });
        let title = id;
        try {
          title = `${id}: ${await ticketTracker.title(resolution.number)}`;
        } catch {
          title = id;
        }
        prUrl = await tracker.createPr({
          head: branch, base: entry.defaultBranch, title, draft: true,
          body: `Task review for ${id}. The ${hasSecurity ? 'review, the QA report and the security report' : 'review and the QA report'} follow as comments. This draft is opened by ultrapowers:task-review and is never merged by it.`,
        });
        created = true;
      } catch (error) {
        notes.push(`${entry.repo}: draft not opened for ${branch}: ${error.message}`);
        continue;
      }
    }
    for (const c of await commentsFor(documents, { id, ...modeFor(forge.provider, docsRaw, docsLink), limit: LIMITS[forge.provider] ?? LIMITS.github, root, tracker, notes })) {
      await tracker.prComment(prUrl, c.body);
    }
    posted.push({ to: 'pr', repo: entry.repo, url: prUrl, created });
  }
  return { ticket: id, docsBranch, posted, notes };
}

// --security-only <audit-YYYY-MM-DD>: no ticket. Comments the security report on the open pull or merge
// request of the branch checked out in the project root; refuses with no-open-pr when there is none.
export async function postAudit({ id, root, marker, env = process.env }, deps = defaultDeps) {
  const folder = reviewFolderProblem(root, id) ?? reviewFolderProblem(root, id, 'artifacts');
  if (folder) throw new AutopilotError('bad-artifact', `${folder}; nothing was posted`);
  const securityFile = path.join(root, 'reviews', id, 'SECURITY-REPORT.md');
  if (!fs.existsSync(securityFile)) {
    throw new AutopilotError('no-security-report', `reviews/${id}/SECURITY-REPORT.md does not exist; run the vulnerability hunt before posting it`);
  }
  const documents = [{ name: 'SECURITY-REPORT.md', text: fs.readFileSync(securityFile, 'utf8') }];
  const branch = deps.currentBranch(root);
  if (!branch) throw new AutopilotError('no-open-pr', `the project at ${root} is on a detached HEAD: there is no branch whose open pull request could take the report`);
  const forge = deps.forgeFor(root, {});
  if (!forge) throw new AutopilotError('no-forge', `the origin of ${root} is not a GitHub or GitLab repository: there is no pull request to comment`);
  const tracker = deps.trackerFor({ provider: forge.provider, host: forge.host, path: forge.path }, env);
  // Looked up before anything is committed: a refusal leaves the repository as it was.
  const prUrl = await tracker.findOpenPr(branch);
  if (!prUrl) {
    throw new AutopilotError('no-open-pr', `no open pull or merge request for ${branch} in ${forge.path}; open one for this branch first (--security-only never opens a draft)`);
  }
  const notes = [];
  const state = { ticket: id, scope: { frozen: [] } };
  const pushable = pushAllowed(state, 'docs', branch, id);
  if (pushable) {
    const trailer = typeof marker?.commitTrailer === 'string' ? marker.commitTrailer : '';
    deps.commitPaths(root, [`reviews/${id}`], `docs(${id}): security report`, trailer);
    deps.push(root, branch, { state, repoName: 'docs', ticket: id });
  } else {
    notes.push(`reviews/${id}/ was not committed or pushed: ${branch} does not start with ${id}-, which the guarded push requires; the report is only in the comment`);
  }
  const base = pushable ? { raw: rawBase(forge, branch), link: linkBase(forge, branch) } : { raw: null, link: null };
  const how = modeFor(forge.provider, base.raw, base.link);
  for (const c of await commentsFor(documents, { id, ...how, limit: LIMITS[forge.provider] ?? LIMITS.github, root, tracker, notes })) {
    await tracker.prComment(prUrl, c.body);
  }
  return { ticket: id, docsBranch: branch, posted: [{ to: 'pr', repo: forge.path, url: prUrl, created: false }], notes };
}

function usage(message) {
  if (message) process.stderr.write(`${message}\n`);
  process.stderr.write('usage: node post-review.mjs <ticket> [--draft-pr] [--cwd <dir>]\n       node post-review.mjs --security-only <ticket | audit-YYYY-MM-DD> [--cwd <dir>]\n');
  return 2;
}

async function main(argv) {
  const args = [...argv];
  const draftIndex = args.indexOf('--draft-pr');
  const draftPr = draftIndex !== -1;
  if (draftPr) args.splice(draftIndex, 1);
  const securityIndex = args.indexOf('--security-only');
  const securityOnly = securityIndex !== -1;
  if (securityOnly) args.splice(securityIndex, 1);
  if (securityOnly && draftPr) return usage('ERROR: --security-only and --draft-pr cannot be combined: the security-only door never opens a draft');
  const cwdIndex = args.indexOf('--cwd');
  let cwd = process.cwd();
  if (cwdIndex !== -1) {
    cwd = path.resolve(args[cwdIndex + 1] ?? '');
    args.splice(cwdIndex, 2);
  }
  const id = args[0];
  if (!id) return usage('ERROR: no ticket given');
  const root = findRoot(cwd);
  if (!root) {
    process.stderr.write(`ERROR: no .agents/ultrapowers.json at or above ${cwd}; run /ultrapowers:init first\n`);
    return 3;
  }
  let marker;
  try {
    marker = JSON.parse(fs.readFileSync(path.join(root, '.agents', 'ultrapowers.json'), 'utf8').replace(/^﻿/, ''));
  } catch (error) {
    process.stderr.write(`ERROR: .agents/ultrapowers.json is not valid JSON: ${error.message}\n`);
    return 3;
  }
  const pattern = typeof marker.ticketPattern === 'string' && marker.ticketPattern.trim() ? marker.ticketPattern : DEFAULT_TICKET_PATTERN;
  // An audit id (a hunt without a ticket) is audit-YYYY-MM-DD; anything else must be a ticket id.
  const auditId = securityOnly && /^audit-\d{4}-\d{2}-\d{2}$/.test(id);
  // A leading _ marks a template folder such as reviews/_template, as in ticket-lib.sh.
  if (!auditId && (/^(\.|\.\.|[-_].*)$/.test(id) || /[/\\\s]/.test(id) || !new RegExp(pattern).test(id))) {
    process.stderr.write(`ERROR: ticket ${JSON.stringify(id)} is not a plain folder name matching ticketPattern ${pattern}\n`);
    return 4;
  }
  try {
    loadSecretsFile(root, process.env);
    if (auditId) {
      const audit = await postAudit({ id, root, marker });
      for (const p of audit.posted) process.stdout.write(`posted on the pull request of ${p.repo}: ${p.url}\n`);
      for (const note of audit.notes) process.stdout.write(`note: ${note}\n`);
      return 0;
    }
    const resolution = resolveTicket(marker, id);
    if (resolution.provider === 'odoo' && !process.env.ODOO_API_KEY) {
      throw new AutopilotError('no-credentials', `ODOO_API_KEY is not set; the tracker client reaches ${resolution.url} with the technical user's API key. Set it in the environment or in .agents/mcp-secrets.env`);
    }
    const result = await postReview({ id, root, marker, resolution, draftPr, securityOnly });
    for (const p of result.posted) {
      process.stdout.write(p.to === 'ticket'
        ? `posted on the ticket: ${p.url} (${p.chars} characters${p.attachments.length ? `, attached: ${p.attachments.join(', ')}` : ''})\n`
        : `${p.created ? 'opened a draft and ' : ''}posted on the pull request of ${p.repo}: ${p.url}\n`);
    }
    for (const note of result.notes) process.stdout.write(`note: ${note}\n`);
    return 0;
  } catch (error) {
    if (error instanceof AutopilotError || error instanceof TicketError) {
      process.stderr.write(`ERROR: ${error.code ? `${error.code}: ` : ''}${error.message}\n`);
      return 5;
    }
    throw error;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).then((code) => process.exit(code));
}
