#!/usr/bin/env node
// post-review.mjs <ticket> [--draft-pr] [--cwd <dir>]
//
// Step 6 of ultrapowers:task-review, run only when the invocation carried --post. Posts the full
// reviews/<ticket>/TASK-REVIEW.md and QA-REPORT.md, screenshots included, on the ticket and on the
// ticket's open pull or merge request of each repository on a ticket branch, through the autopilot
// tracker clients (tracker.mjs) and the guarded push (repos.mjs). It never merges and never edits
// code. Network access is only what those two modules do; a local ticket is refused.
//
//   - reviews/<ticket>/ is committed to the documents branch (the branch checked out in the project
//     root, which must start with "<ticket>-") and pushed. On GitHub and GitLab each screenshot is
//     embedded from its URL on that pushed branch, percent-encoded.
//   - On Odoo the screenshots are attached to the chatter message (OdooTracker.attach) under
//     their own names.
//   - A report longer than the tracker's comment limit goes as numbered parts, in order, each under
//     the limit; a screenshot stays in the part that references it.
//   - The pull or merge request is found by branch name, never by the ticket number. With none open and
//     --draft-pr, the ticket branch is pushed through the guarded push and a draft is opened first.
//
// Exit codes: 0 posted; 2 usage; 3 no project root; 4 invalid ticket; 5 refused (local ticket, no review,
// documents not on a ticket branch, a tracker or git failure).
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { AutopilotError, loadSecretsFile } from '../../autopilot/scripts/autopilot-lib.mjs';
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

function decodeName(raw) {
  if (!/%[0-9A-Fa-f]{2}/.test(raw)) return raw;
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

// Rewrites every link into artifacts/ in a report for one destination.
//   mode 'raw'    -> the file's URL on the pushed branch (options.base)
//   mode 'attach' -> a line naming the attached file (the caller attaches it); options.exists(name) says
//                    whether the file is on disk, and a missing one is named, not attached
//   mode 'plain'  -> a line saying the file is attached to the ticket
// Returns { text, files } where files lists { name, replacement } for each artifact link, in order.
export function rewriteLinks(text, { id, mode, base = null, exists = () => true }) {
  const files = [];
  const out = String(text).replace(ARTIFACT, (whole, bang, label, angled, bare) => {
    const name = decodeName((angled ?? bare).slice('artifacts/'.length));
    const caption = label || name;
    let replacement;
    if (mode === 'raw') {
      const url = `${base}/reviews/${encodeSegment(id)}/artifacts/${name.split('/').map(encodeSegment).join('/')}`;
      replacement = `${bang}[${label}](${url})`;
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

// The comments for one destination: TASK-REVIEW.md then QA-REPORT.md, each rewritten and split.
// Returns [{ body, attachments }] in posting order.
function commentsFor(documents, { id, mode, base, limit, root }) {
  const out = [];
  const exists = (name) => fs.existsSync(path.join(root, 'reviews', id, 'artifacts', name));
  for (const doc of documents) {
    const { text, files } = rewriteLinks(doc.text, { id, mode, base, exists });
    const parts = numbered(doc.name, splitParts(text, limit - HEADER_RESERVE));
    for (const body of parts) {
      if (body.length > limit) throw new AutopilotError('part-too-long', `a part of ${doc.name} has ${body.length} characters, over the ${limit} limit`);
      const attachments = [];
      if (mode === 'attach') {
        for (const file of files) {
          if (!body.includes(file.replacement) || !exists(file.name) || attachments.some((a) => a.name === file.name)) continue;
          attachments.push({ name: file.name, bytes: fs.readFileSync(path.join(root, 'reviews', id, 'artifacts', file.name)) });
        }
      }
      out.push({ body, attachments });
    }
  }
  return out;
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

export async function postReview({ id, root, marker, resolution, draftPr = false, env = process.env }, deps = defaultDeps) {
  if (resolution.provider === 'local') {
    throw new AutopilotError('local-ticket', `${id} is a local ticket: there is no tracker to post to. --post needs a ticket from a configured GitHub, GitLab or Odoo source`);
  }
  if (!['github', 'gitlab', 'odoo'].includes(resolution.provider)) {
    throw new AutopilotError('no-writeback', `${resolution.provider} tickets have no write-back in this version; GitHub, GitLab and Odoo do`);
  }
  const reviewFile = path.join(root, 'reviews', id, 'TASK-REVIEW.md');
  if (!fs.existsSync(reviewFile)) {
    throw new AutopilotError('no-review', `reviews/${id}/TASK-REVIEW.md does not exist; run the review before posting it`);
  }
  const documents = [{ name: 'TASK-REVIEW.md', text: fs.readFileSync(reviewFile, 'utf8') }];
  const qaFile = path.join(root, 'reviews', id, 'QA-REPORT.md');
  if (fs.existsSync(qaFile)) documents.push({ name: 'QA-REPORT.md', text: fs.readFileSync(qaFile, 'utf8') });

  const docsBranch = deps.currentBranch(root);
  if (!docsBranch.startsWith(`${id}-`)) {
    throw new AutopilotError('no-docs-branch', `the documents repository at ${root} is on ${docsBranch || 'a detached HEAD'}, not on a branch starting with ${id}-; check out the ticket's documents branch first (the guarded push only pushes ${id}- branches)`);
  }

  const docsForge = deps.forgeFor(root, { provider: resolution.provider, host: resolution.host })
    ?? (['github', 'gitlab'].includes(resolution.provider) ? { provider: resolution.provider, host: resolution.host, path: resolution.path } : null);
  const trailer = typeof marker?.commitTrailer === 'string' ? marker.commitTrailer : '';
  deps.commitPaths(root, [`reviews/${id}`], `docs(${id}): task review`, trailer);
  if (docsForge) {
    deps.push(root, docsBranch, { state: { ticket: id, scope: { frozen: [] } }, repoName: 'docs', ticket: id });
  }
  const docsRaw = rawBase(docsForge, docsBranch);

  const posted = [];
  const notes = [];

  const ticketTracker = deps.trackerFor(resolution, env);
  const ticketMode = resolution.provider === 'odoo' ? 'attach' : 'raw';
  for (const c of commentsFor(documents, { id, mode: ticketMode, base: docsRaw, limit: LIMITS[resolution.provider], root })) {
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
        notes.push(`${entry.repo}: no open pull request for ${branch}; pass --draft-pr to push the branch and open a draft`);
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
          body: `Task review for ${id}. The review and the QA report follow as comments. This draft is opened by ultrapowers:task-review and is never merged by it.`,
        });
        created = true;
      } catch (error) {
        notes.push(`${entry.repo}: draft not opened for ${branch}: ${error.message}`);
        continue;
      }
    }
    const mode = docsRaw ? 'raw' : 'plain';
    for (const c of commentsFor(documents, { id, mode, base: docsRaw, limit: LIMITS[forge.provider] ?? LIMITS.github, root })) {
      await tracker.prComment(prUrl, c.body);
    }
    posted.push({ to: 'pr', repo: entry.repo, url: prUrl, created });
  }
  return { ticket: id, docsBranch, posted, notes };
}

function usage(message) {
  if (message) process.stderr.write(`${message}\n`);
  process.stderr.write('usage: node post-review.mjs <ticket> [--draft-pr] [--cwd <dir>]\n');
  return 2;
}

async function main(argv) {
  const args = [...argv];
  const draftIndex = args.indexOf('--draft-pr');
  const draftPr = draftIndex !== -1;
  if (draftPr) args.splice(draftIndex, 1);
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
  if (/^(\.|\.\.|-.*)$/.test(id) || /[/\\\s]/.test(id) || !new RegExp(pattern).test(id)) {
    process.stderr.write(`ERROR: ticket ${JSON.stringify(id)} is not a plain folder name matching ticketPattern ${pattern}\n`);
    return 4;
  }
  try {
    loadSecretsFile(root, process.env);
    const resolution = resolveTicket(marker, id);
    if (resolution.provider === 'odoo' && !process.env.ODOO_API_KEY) {
      throw new AutopilotError('no-credentials', `ODOO_API_KEY is not set; the tracker client reaches ${resolution.url} with the technical user's API key. Set it in the environment or in .agents/mcp-secrets.env`);
    }
    const result = await postReview({ id, root, marker, resolution, draftPr });
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
