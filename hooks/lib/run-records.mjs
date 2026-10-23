#!/usr/bin/env node
// run-records.mjs: the run records of the QA gatekeeper and the vulnerability hunt. Node built-ins only.
//
// A QA run or a hunt is one record, <project root>/.ultrapowers/runs/<run id>.json: { run, profile,
// id, session, startedAt }. Any number can be active at once, in one project or in many; no run waits
// for another. A record guards only its own run:
// - with a session (Claude Code passes CLAUDE_CODE_SESSION_ID to every command, its subagents
//   included), only the calls of that session;
// - without one (a harness that names no session), the calls made inside its own project folder.
// The guardrail finds records in the nearest project root at or above a call's directory (the folder
// that holds .agents/ultrapowers.json), never above it: a run in a parent folder does not guard a
// nested worktree or project. A run ends itself (`end`) once its report holds its Verdict line; a
// record older than RUN_TTL_MS is past its run and guards nothing.
//
// CLI: node run-records.mjs start --root <dir> --profile qa|hunt --id <ticket or audit id>
//      node run-records.mjs end --root <dir> --run <run id>
//      node run-records.mjs list --root <dir>
//      node run-records.mjs pick --root <dir>  < event.json   (the hook's: the record guarding a call)
// Each prints one JSON line (pick: one tab-separated line); exit 0 on success, 2 on a usage or
// state error (message on stderr).
import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';

export const RUN_TTL_MS = 24 * 60 * 60 * 1000;
export const PROFILES = Object.freeze(['qa', 'hunt']);
export const REPORTS = Object.freeze({ qa: 'QA-REPORT.md', hunt: 'SECURITY-REPORT.md' });
// A ticket or audit id names the folder reviews/<id>/: no separator and no parent segment.
const ID_RE = /^#?[A-Za-z0-9][A-Za-z0-9._#-]*$/;
const RUN_FILE_RE = /^(qa|hunt)-[A-Za-z0-9._#-]+-[0-9a-f]{8}\.json$/;

export class RunError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

// The session a command runs in, when the harness names it: Claude Code's CLAUDE_CODE_SESSION_ID
// (the same in every subagent of the session). Null elsewhere: the record then guards its folder.
export function sessionFromEnv(env = process.env) {
  const s = env.CLAUDE_CODE_SESSION_ID;
  return typeof s === 'string' && s.trim() ? s.trim() : null;
}

// The nearest folder at or above `startDir` that holds .agents/ultrapowers.json, or null.
export function projectRoot(startDir) {
  let dir = path.resolve(startDir);
  for (;;) {
    if (fs.existsSync(path.join(dir, '.agents', 'ultrapowers.json'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

export function runsDir(root) {
  return path.join(root, '.ultrapowers', 'runs');
}

// Every record of the project: { file, run, profile, id, session, startedAt, expired, corrupt }.
// A file that cannot be read as a record is `corrupt`: the guardrail refuses calls while it exists.
export function readRuns(root, now = Date.now()) {
  const dir = runsDir(root);
  let names = [];
  try { names = fs.readdirSync(dir).filter((n) => n.endsWith('.json')); } catch { return []; }
  const out = [];
  for (const name of names.sort()) {
    const file = path.join(dir, name);
    let rec = null;
    try { rec = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^﻿/, '')); } catch { rec = null; }
    const ok = rec && typeof rec === 'object' && !Array.isArray(rec)
      && PROFILES.includes(rec.profile) && typeof rec.id === 'string' && ID_RE.test(rec.id) && !rec.id.includes('..')
      && (rec.session === null || (typeof rec.session === 'string' && rec.session !== ''))
      && Number.isFinite(Date.parse(rec.startedAt));
    if (!ok) { out.push({ file, run: name.replace(/\.json$/, ''), corrupt: true }); continue; }
    out.push({ file, run: name.replace(/\.json$/, ''), profile: rec.profile, id: rec.id, session: rec.session, startedAt: rec.startedAt, expired: now - Date.parse(rec.startedAt) > RUN_TTL_MS, corrupt: false });
  }
  return out;
}

// The records that guard a call of `session` (null when the call names none): every record that is
// not past its run and is either bound to no session or bound to this one. A corrupt record guards
// every call (it cannot say whose it is).
export function applicableRuns(root, session, now = Date.now()) {
  return readRuns(root, now).filter((r) => r.corrupt || (!r.expired && (r.session === null || (session && r.session === session))));
}

// Starts a run: refuses a second active run of the same profile and id (both would write
// reviews/<id>/), clears records past their run, and writes the new record.
export function startRun(root, { profile, id, session = sessionFromEnv(), now = Date.now() } = {}) {
  if (!PROFILES.includes(profile)) throw new RunError('bad-args', `profile must be one of ${PROFILES.join(', ')}`);
  if (typeof id !== 'string' || !ID_RE.test(id) || id.includes('..')) throw new RunError('bad-args', `id ${JSON.stringify(id)} is not a ticket or audit id (letters, digits, . _ - #; no separator)`);
  if (!fs.existsSync(path.join(root, '.agents', 'ultrapowers.json'))) throw new RunError('bad-root', `${root} holds no .agents/ultrapowers.json`);
  const dir = runsDir(root);
  fs.mkdirSync(dir, { recursive: true });
  for (const r of readRuns(root, now)) {
    if (!r.corrupt && r.expired) fs.rmSync(r.file, { force: true });
    else if (!r.corrupt && r.profile === profile && r.id === id) {
      throw new RunError('run-active', `a ${profile === 'qa' ? 'QA run' : 'hunt'} of ${id} is already active (${path.relative(root, r.file).replace(/\\/g, '/')}, started ${r.startedAt}); both would write reviews/${id}/. Wait for it to end, or let your human partner remove that record if its run is gone`);
    }
  }
  const run = `${profile}-${id}-${randomBytes(4).toString('hex')}`;
  const record = { run, profile, id, session: session ?? null, startedAt: new Date(now).toISOString() };
  fs.writeFileSync(path.join(dir, `${run}.json`), `${JSON.stringify(record, null, 2)}\n`, { flag: 'wx' });
  return record;
}

// Ends a run: only once its report holds a line starting `Verdict:`. The end is logged in
// reviews/<id>/run-log.txt, so an early end is visible next to the report.
export function endRun(root, run, { now = Date.now() } = {}) {
  if (typeof run !== 'string' || !RUN_FILE_RE.test(`${run}.json`)) throw new RunError('bad-args', `run ${JSON.stringify(run)} is not a run id`);
  const file = path.join(runsDir(root), `${run}.json`);
  const rec = readRuns(root, now).find((r) => r.file === file);
  if (!rec) throw new RunError('no-run', `no run ${run} in ${path.relative(root, runsDir(root)).replace(/\\/g, '/')}`);
  if (rec.corrupt) throw new RunError('corrupt', `the record of run ${run} cannot be read; your human partner removes it`);
  const report = path.join(root, 'reviews', rec.id, REPORTS[rec.profile]);
  let text = '';
  try { text = fs.readFileSync(report, 'utf8'); } catch { text = ''; }
  if (!/^\s*\**\s*Verdict\s*\**\s*:/mi.test(text)) {
    throw new RunError('no-verdict', `reviews/${rec.id}/${REPORTS[rec.profile]} holds no Verdict line yet; a run ends after its report is written (an INCOMPLETE report counts)`);
  }
  fs.rmSync(file, { force: true });
  fs.appendFileSync(path.join(root, 'reviews', rec.id, 'run-log.txt'), `${new Date(now).toISOString()} ended ${run} (started ${rec.startedAt}, session ${rec.session ?? 'none'})\n`);
  return { ended: run, id: rec.id, profile: rec.profile };
}

// The record that guards one tool call, for hooks/qa-guardrail: the event JSON on stdin gives the
// call's session (its top-level session_id; nested keys never count). The first applicable record
// by profile, QA before hunt as the markers were; a corrupt one first of all. Null when none applies.
export function pickRun(root, eventText, now = Date.now()) {
  let session = null;
  try {
    const ev = JSON.parse(String(eventText ?? '').replace(/\0+$/, ''));
    if (ev && typeof ev === 'object' && !Array.isArray(ev) && typeof ev.session_id === 'string' && ev.session_id) session = ev.session_id;
  } catch { session = null; }
  const runs = applicableRuns(root, session, now);
  return runs.find((r) => r.corrupt) ?? runs.find((r) => r.profile === 'qa') ?? runs.find((r) => r.profile === 'hunt') ?? null;
}

function args(argv) {
  const o = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a.startsWith('--')) { o[a.slice(2)] = argv[i + 1]; i += 1; } else o._.push(a);
  }
  return o;
}

function main(argv) {
  const o = args(argv);
  const cmd = o._[0];
  const root = path.resolve(o.root ?? process.cwd());
  try {
    let out;
    if (cmd === 'start') out = startRun(root, { profile: o.profile, id: o.id });
    else if (cmd === 'end') out = endRun(root, o.run);
    else if (cmd === 'list') out = readRuns(root).map(({ file, ...r }) => ({ ...r, file: path.relative(root, file).replace(/\\/g, '/') }));
    else if (cmd === 'pick') {
      // For the hook: tab-separated `profile id run startedAt file` (profile `corrupt` for an unreadable
      // record), or an empty line when no record guards this call.
      let text = '';
      try { text = fs.readFileSync(0, 'utf8'); } catch { text = ''; }
      const r = pickRun(root, text);
      process.stdout.write(r ? `${r.corrupt ? 'corrupt' : r.profile}\t${r.id ?? ''}\t${r.run}\t${r.startedAt ?? ''}\t${r.file}\n` : '\n');
      return 0;
    }
    else throw new RunError('bad-args', 'usage: run-records.mjs start --root <dir> --profile qa|hunt --id <id> | end --root <dir> --run <run id> | list --root <dir>');
    process.stdout.write(`${JSON.stringify(out)}\n`);
    return 0;
  } catch (e) {
    process.stderr.write(`ERROR: ${e.code ?? 'error'}: ${e.message}\n`);
    return 2;
  }
}

if (process.argv[1] && /(^|\/)run-records\.mjs$/.test(process.argv[1].replace(/\\/g, '/'))) process.exit(main(process.argv.slice(2)));
