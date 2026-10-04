// Rules of the autopilot engine: configuration, slugs, branch names, the per-ticket
// state file and the hash-chained stage log. Node built-ins only; no process is spawned here.

import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { HARNESS_NAMES } from './harnesses.mjs';

export class AutopilotError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'AutopilotError';
    this.code = code;
  }
}

export const STAGES = ['scaffold', 'spec', 'plan', 'gate', 'changes', 'execute', 'qa', 'pr', 'done'];
export const MODES = ['off', 'gated', 'full'];
export const EXECUTIONS = ['subagent', 'inline'];
export const HARNESSES = HARNESS_NAMES;
export const EVENT_NAMES = ['ready', 'approve', 'changes', 'hold', 'running', 'blocked'];

export const DEFAULTS = Object.freeze({
  events: Object.freeze({
    ready: 'up:ready', approve: 'up:approve', changes: 'up:changes',
    hold: 'up:hold', running: 'up:running', blocked: 'up:blocked',
  }),
  watch: Object.freeze({ intervalSec: 60, maxConcurrent: 1 }),
  execution: 'subagent',
  harness: 'claude-code',
});

const SLUG_MAX = 40;
const SLUG_WORDS = 6;

function isObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function isPositiveInt(v) {
  return Number.isInteger(v) && v > 0;
}

// Returns a list of error strings, empty when the block is valid.
export function validateAutopilot(block) {
  const errors = [];
  if (!isObject(block)) return ['autopilot must be an object'];
  if (!MODES.includes(block.mode)) errors.push(`autopilot.mode must be one of ${MODES.join(', ')}`);
  if (block.baseBranch !== undefined && (typeof block.baseBranch !== 'string' || block.baseBranch.trim() === '')) {
    errors.push('autopilot.baseBranch must be a non-empty string');
  }
  if (block.approvers !== undefined) {
    if (!Array.isArray(block.approvers) || block.approvers.some((a) => typeof a !== 'string' || a.trim() === '')) {
      errors.push('autopilot.approvers must be a list of logins');
    }
  }
  if (block.execution !== undefined && !EXECUTIONS.includes(block.execution)) {
    errors.push(`autopilot.execution must be one of ${EXECUTIONS.join(', ')}`);
  }
  if (block.harness !== undefined && !HARNESSES.includes(block.harness)) {
    errors.push(`autopilot.harness must be one of ${HARNESSES.join(', ')}`);
  }
  if (block.watchSelfApproval !== undefined && typeof block.watchSelfApproval !== 'boolean') {
    errors.push('autopilot.watchSelfApproval must be true or false');
  }
  if (block.events !== undefined) {
    if (!isObject(block.events)) errors.push('autopilot.events must be an object');
    else {
      for (const [k, v] of Object.entries(block.events)) {
        if (!EVENT_NAMES.includes(k)) errors.push(`autopilot.events.${k} is not an event (${EVENT_NAMES.join(', ')})`);
        else if (typeof v !== 'string' || v.trim() === '') errors.push(`autopilot.events.${k} must be a non-empty label name`);
      }
    }
  }
  if (block.watch !== undefined) {
    if (!isObject(block.watch)) errors.push('autopilot.watch must be an object');
    else {
      if (block.watch.intervalSec !== undefined && !isPositiveInt(block.watch.intervalSec)) errors.push('autopilot.watch.intervalSec must be a positive integer');
      if (block.watch.maxConcurrent !== undefined && !isPositiveInt(block.watch.maxConcurrent)) errors.push('autopilot.watch.maxConcurrent must be a positive integer');
    }
  }
  return errors;
}

// The effective settings for a marker: { mode: 'off' } when absent or off, else every field with defaults.
export function effectiveAutopilot(marker) {
  const block = marker && isObject(marker) ? marker.autopilot : undefined;
  if (block === undefined || block === null) return { mode: 'off' };
  const errors = validateAutopilot(block);
  if (errors.length) throw new AutopilotError('bad-autopilot', errors.join('; '));
  if (block.mode === 'off') return { mode: 'off' };
  return {
    mode: block.mode,
    baseBranch: block.baseBranch ?? null,
    approvers: [...(block.approvers ?? [])],
    execution: block.execution ?? DEFAULTS.execution,
    harness: block.harness ?? DEFAULTS.harness,
    // The watch door takes an approval from the account it runs as only when the project says so.
    watchSelfApproval: block.watchSelfApproval === true,
    events: { ...DEFAULTS.events, ...(block.events ?? {}) },
    watch: { ...DEFAULTS.watch, ...(block.watch ?? {}) },
  };
}

// First six whitespace-separated words of the title, slugified, cut at 40 on a word boundary.
export function slugFor(title, fallback) {
  const words = String(title ?? '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, SLUG_WORDS)
    .map((w) => w.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''))
    .filter(Boolean);
  let slug = words.join('-');
  if (slug.length > SLUG_MAX) {
    slug = slug.slice(0, SLUG_MAX);
    const cut = slug.lastIndexOf('-');
    if (cut > 0) slug = slug.slice(0, cut);
  }
  slug = slug.replace(/^-+|-+$/g, '');
  return slug || String(fallback);
}

export function branchName(id, title) {
  const number = String(id).split('-').pop();
  return `${id}-${slugFor(title, number)}`;
}

// The mode for one ticket: the argument, then an `up:mode:<m>` label, then the project default.
export function modeFor(block, { arg, labels = [] } = {}) {
  if (arg !== undefined && arg !== null) {
    if (!MODES.includes(arg)) throw new AutopilotError('bad-args', `--mode must be one of ${MODES.join(', ')}`);
    return arg;
  }
  for (const label of labels) {
    const m = /^up:mode:(off|gated|full)$/.exec(String(label));
    if (m) return m[1];
  }
  return block && MODES.includes(block.mode) ? block.mode : 'off';
}

// ---- State file and stage log (spec §5) ----

const GENESIS = '0'.repeat(64);
const LOG_KEYS = ['at', 'stage', 'event', 'actor', 'trigger', 'repo', 'sha', 'url', 'prev'];

export function statePath(root, id) {
  return path.join(root, 'tasks', id, 'autopilot.json');
}

export function logPath(root, id) {
  return path.join(root, 'tasks', id, 'stage-log.jsonl');
}

export function initialState({ id, mode, source, docsBranch, docsBase, title }) {
  return {
    ticket: id,
    title: title ?? '',
    mode,
    stage: 'scaffold',
    attempt: 1,
    source,
    docs: { branch: docsBranch, base: docsBase, tip: null },
    repos: [],
    scope: { proposed: [], frozen: false },
    packet: null,
    approval: null,
    pr: { docs: null },
  };
}

export function readState(root, id) {
  const file = statePath(root, id);
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^﻿/, ''));
  } catch (err) {
    throw new AutopilotError('bad-state', `${file} is not readable JSON: ${err.message}`);
  }
}

export function writeState(root, id, state) {
  const file = statePath(root, id);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(state, null, 2)}\n`);
}

export function hashLine(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

function logLines(root, id) {
  const file = logPath(root, id);
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, 'utf8').split('\n').filter((l) => l.trim() !== '');
}

// Appends one JSON line whose `prev` is the hash of the previous line's exact text.
export function appendLog(root, id, entry) {
  const lines = logLines(root, id);
  const prev = lines.length ? hashLine(lines[lines.length - 1]) : GENESIS;
  const full = { at: new Date().toISOString(), ...entry, prev };
  const ordered = {};
  for (const k of LOG_KEYS) if (full[k] !== undefined) ordered[k] = full[k];
  for (const k of Object.keys(full)) if (!(k in ordered) && full[k] !== undefined) ordered[k] = full[k];
  const line = JSON.stringify(ordered);
  const file = logPath(root, id);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(file, `${line}\n`);
  const hash = hashLine(line);
  // The state anchors the head of the chain, so an edit to the last line is visible too.
  const state = readState(root, id);
  if (state) {
    state.logHead = hash;
    writeState(root, id, state);
  }
  return { line, hash };
}

export function readLog(root, id) {
  return logLines(root, id).map((l, i) => {
    try {
      return JSON.parse(l);
    } catch (err) {
      throw new AutopilotError('bad-log', `${logPath(root, id)} line ${i + 1} is not JSON: ${err.message}`);
    }
  });
}

// { ok: true }, or { ok: false, at: <1-based line whose prev does not match> }.
export function verifyChain(root, id) {
  const lines = logLines(root, id);
  let expected = GENESIS;
  for (let i = 0; i < lines.length; i += 1) {
    let entry;
    try {
      entry = JSON.parse(lines[i]);
    } catch {
      return { ok: false, at: i + 1 };
    }
    if (entry.prev !== expected) return { ok: false, at: i + 1 };
    expected = hashLine(lines[i]);
  }
  const state = lines.length ? readState(root, id) : null;
  if (state && state.logHead && state.logHead !== expected) return { ok: false, at: lines.length };
  return { ok: true };
}

// ---- Packet, approval and scope (spec §7, §5) ----

const PACKET_LINES = 25;
const PACKET_ASSUMPTIONS = 5;
const CONFIDENCE_ORDER = { low: 0, medium: 1, high: 2 };

// The first 12 hex of SHA-256 over the docs tip and the repo tips, in repo-name order.
export function packetId(docsTip, tips) {
  const parts = [String(docsTip ?? '')];
  for (const name of Object.keys(tips ?? {}).sort()) parts.push(`${name}=${tips[name] ?? ''}`);
  return hashLine(parts.join('\n')).slice(0, 12);
}

function fill(template, values) {
  return template.replace(/\{\{([A-Z_]+)\}\}/g, (m, key) => (key in values ? String(values[key]) : m));
}

// Renders the review packet from the template beside the skill; under 25 lines or it throws.
export function renderPacket(template, { state, links, assumptions = [], events, baseAhead = [] }) {
  // Commits on the local base that origin does not have ride into the ticket's pull request;
  // the reviewer sees them here instead of discovering them in the diff.
  const ahead = Array.isArray(baseAhead) ? baseAhead.filter(Boolean) : [];
  const baseNote = ahead.length
    ? `; base ${state.docs.base} is ${ahead.length} commit${ahead.length === 1 ? '' : 's'} ahead of origin/${state.docs.base}: ${ahead.join(', ')}`
    : '';
  const repoNames = state.scope.frozen ? state.scope.frozen : state.scope.proposed;
  const byName = Object.fromEntries((state.repos ?? []).map((r) => [r.name, r]));
  const repoLines = (repoNames.length ? repoNames : ['.']).map((name) => {
    // The root repository is the documents repository: its branch, tip and PR are the docs ones.
    const r = byName[name] ?? (name === '.' ? { base: state.docs.base, branch: state.docs.branch, tip: state.docs.tip, prUrl: state.pr?.docs ?? null } : undefined);
    const base = r?.base ?? state.docs.base ?? '';
    const branchState = r?.prUrl ? `PR ${r.prUrl}` : r?.tip ? `branch ${r.branch} at ${r.tip}` : 'branch not yet created';
    return `  ${name}   base ${base}     ${branchState}`;
  });
  const tips = Object.fromEntries((state.repos ?? []).filter((r) => r.tip).map((r) => [r.name, r.tip]));
  const assumptionLines = assumptions.slice(0, PACKET_ASSUMPTIONS).map((a, i) => `  ${i + 1}. ${a.question} — chosen: ${a.answer} (${a.confidence})`);
  const gate = state.stage === 'pr' || state.stage === 'done' ? '2 of 2' : '1 of 2';
  const text = fill(template, {
    ID: state.ticket,
    GATE: gate,
    MODE: state.mode,
    DOCS_BRANCH: state.docs.branch,
    DOCS_TIP: state.docs.tip ?? '',
    BASE_NOTE: baseNote,
    BRIEF_URL: links.brief ?? '',
    SPEC_URL: links.spec ?? '',
    PLAN_URL: links.plan ?? '',
    DIFF_URL: links.diff ?? 'none',
    REPO_LINES: repoLines.join('\n'),
    ASSUMPTION_LINES: assumptionLines.length ? assumptionLines.join('\n') : '  none',
    E_APPROVE: events.approve,
    E_CHANGES: events.changes,
    E_HOLD: events.hold,
    PACKET_ID: packetId(state.docs.tip, tips),
  }).replace(/\n+$/, '');
  const count = text.split('\n').length;
  if (count > PACKET_LINES) throw new AutopilotError('packet-too-long', `the packet has ${count} lines; the limit is ${PACKET_LINES}`);
  return text;
}

// The four checks of spec §7 against the tracker's label events.
// The engine's own account counts like any other: the developer who runs the engine approves their own tickets.
// A team that runs the engine as a bot keeps the bot out by listing human logins in autopilot.approvers.
export async function verifyApproval({ events, approveLabel, packet, permissionOf, approvers = [], tips }) {
  const relevant = (events ?? []).filter((e) => e.label === approveLabel).sort((a, b) => String(a.at).localeCompare(String(b.at)));
  const last = relevant[relevant.length - 1];
  if (!last || last.action !== 'labeled') return { ok: false, reason: 'no-event', detail: `no ${approveLabel} label event` };
  // Instants, not strings: the tracker reports whole seconds and the packet time may carry
  // milliseconds. A label inside the packet's own second is not after it; an unreadable time fails closed.
  const labelAt = Date.parse(String(last.at ?? ''));
  const packetAt = Date.parse(String(packet?.postedAt ?? ''));
  if (!Number.isFinite(labelAt) || !Number.isFinite(packetAt) || labelAt <= packetAt) {
    return { ok: false, reason: 'before-packet', detail: `the label at ${last.at} precedes the packet at ${packet?.postedAt ?? 'none'}` };
  }
  const permission = await permissionOf(last.actor);
  if (!['write', 'maintain', 'admin'].includes(permission)) return { ok: false, reason: 'not-permitted', detail: `${last.actor} has ${permission} access` };
  if (approvers.length && !approvers.includes(last.actor)) return { ok: false, reason: 'not-approver', detail: `${last.actor} is not in autopilot.approvers` };
  const drift = [];
  if ((tips?.docs ?? null) !== (packet.docsTip ?? null)) drift.push(`docs ${packet.docsTip} -> ${tips?.docs}`);
  for (const [name, sha] of Object.entries(packet.tips ?? {})) {
    if ((tips?.repos?.[name] ?? null) !== sha) drift.push(`${name} ${sha} -> ${tips?.repos?.[name] ?? 'none'}`);
  }
  if (drift.length) return { ok: false, reason: 'drift', detail: drift.join(', ') };
  return { ok: true, actor: last.actor, eventId: String(last.id), at: last.at };
}

function section(markdown, heading) {
  const lines = String(markdown ?? '').split('\n');
  const start = lines.findIndex((l) => new RegExp(`^#{1,6}\\s+${heading}\\s*$`, 'i').test(l.trim()));
  if (start < 0) return [];
  const out = [];
  for (const l of lines.slice(start + 1)) {
    if (/^#{1,6}\s/.test(l)) break;
    out.push(l);
  }
  return out;
}

// The list under "## Repositories in scope".
export function scopeFrom(markdown) {
  return section(markdown, 'Repositories in scope')
    .map((l) => /^\s*[-*]\s+(.+?)\s*$/.exec(l))
    .filter(Boolean)
    .map((m) => m[1].replace(/^`|`$/g, '').trim())
    .filter(Boolean);
}

// The rows of the "## Assumption ledger" table, lowest confidence first.
export function assumptionsFrom(markdown) {
  const rows = section(markdown, 'Assumption ledger')
    .filter((l) => /^\s*\|/.test(l))
    .map((l) => l.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim()));
  const body = rows.filter((cells) => cells.length >= 5 && !/^#$/.test(cells[0]) && !/^-+$/.test(cells[0]));
  return body
    .map((c) => ({ question: c[1], answer: c[2], confidence: c[3].toLowerCase(), reason: c[4] }))
    .sort((a, b) => (CONFIDENCE_ORDER[a.confidence] ?? 1) - (CONFIDENCE_ORDER[b.confidence] ?? 1));
}

// Copies the plan's list into scope.frozen: the plan may narrow the spec's list, never widen it.
export function freezeScope(state, { specRepos = [], planRepos = [], knownRepos = [] }) {
  const root = knownRepos.length === 1 && knownRepos[0] === '.';
  const spec = root && specRepos.length === 0 ? ['.'] : [...specRepos];
  for (const name of [...spec, ...planRepos]) {
    if (!knownRepos.includes(name)) throw new AutopilotError('unknown-repo', `${name} is not a repository of this workspace (repos[]: ${knownRepos.join(', ')})`);
  }
  if (spec.length === 0) throw new AutopilotError('no-scope', 'the spec names no repository under "Repositories in scope"');
  const widened = planRepos.filter((n) => !spec.includes(n));
  if (widened.length) throw new AutopilotError('scope-widened', `the plan names ${widened.join(', ')}, which the spec did not`);
  const frozen = planRepos.length ? [...planRepos] : spec;
  return { ...state, scope: { proposed: spec, frozen } };
}

// A push is allowed only to a `<ID>-` branch, to the docs repository or a frozen repository.
// `ticket` is the id the command validated; the state file's copy is not trusted for this.
export function pushAllowed(state, repoName, branch, ticket = state.ticket) {
  if (!String(branch).startsWith(`${ticket}-`)) return false;
  if (repoName === 'docs') return true;
  return Array.isArray(state.scope?.frozen) && state.scope.frozen.includes(repoName);
}

// ---- Next stage, locks and the active marker (spec §6, §8) ----

const MAX_ATTEMPTS = 3;
const QA_STOPS = ['FAIL', 'PRECONDITION-FAILED'];
const AFTER = { scaffold: 'spec', spec: 'plan', plan: 'gate', changes: 'gate' };

// The engine's one decision: what to do next for this ticket.
// facts = { mode, labels, events, approval, qaConfigured, locked }
export function nextStage(state, facts) {
  const { mode, labels = [], events = DEFAULTS.events, approval = null, qaConfigured = false, locked = null } = facts;
  if (mode === 'off') return { action: 'stop', reason: 'mode-off' };
  if (locked) return { action: 'wait', reason: 'locked' };
  if (!state) return { action: 'run', stage: 'scaffold', reason: 'new-ticket' };
  if (state.stage === 'done') return { action: 'done', reason: 'done' };
  if (labels.includes(events.hold)) return { action: 'wait', reason: 'held' };
  const status = state.stageStatus ?? 'finished';
  if (status === 'running') return { action: 'run', stage: state.stage, reason: `${state.stage}-interrupted` };
  if (status === 'blocked') {
    if ((state.attempt ?? 1) >= MAX_ATTEMPTS) return { action: 'stop', reason: 'blocked' };
    return { action: 'run', stage: state.stage, reason: `${state.stage}-retry` };
  }
  const stage = state.stage;
  if (stage in AFTER) return { action: 'run', stage: AFTER[stage], reason: `${stage}-finished` };
  if (stage === 'gate') {
    if (labels.includes(events.changes)) return { action: 'run', stage: 'changes', reason: 'changes-requested' };
    // A consumed approval lives in the state: the label is gone, so a crash between the
    // consumption and `begin execute` must not strand the ticket at the gate.
    if (state.approval) return { action: 'run', stage: 'execute', reason: 'approved' };
    if (mode === 'full') return { action: 'run', stage: 'execute', reason: 'mode-full' };
    if (approval?.ok) return { action: 'run', stage: 'execute', reason: 'approved' };
    if (approval && approval.reason === 'drift') return { action: 'run', stage: 'gate', reason: 'drift' };
    return { action: 'wait', reason: 'awaiting-approval' };
  }
  if (stage === 'execute') {
    return qaConfigured ? { action: 'run', stage: 'qa', reason: 'execute-finished' } : { action: 'run', stage: 'pr', reason: 'qa-not-configured' };
  }
  if (stage === 'qa') {
    const verdict = state.qa?.verdict ?? '';
    if (QA_STOPS.includes(verdict)) return { action: 'stop', reason: `qa-${verdict}` };
    // QA is configured and the stage ended without a verdict: the gate fails closed.
    if (!verdict && qaConfigured) return { action: 'stop', reason: 'qa-missing' };
    return { action: 'run', stage: 'pr', reason: 'qa-finished' };
  }
  if (stage === 'pr') return { action: 'done', reason: 'pr-finished' };
  throw new AutopilotError('bad-state', `unknown stage ${stage}`);
}

export function lockPath(root, id) {
  return path.join(root, '.ultrapowers', 'autopilot', `${id}.lock`);
}

export function readLock(root, id) {
  const file = lockPath(root, id);
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return { pid: 0, door: 'unknown', startedAt: '' };
  }
}

function pidAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err.code === 'EPERM';
  }
}

function lockTtlMs() {
  const value = Number(process.env.ULTRAPOWERS_AUTOPILOT_LOCK_TTL_MS);
  return Number.isFinite(value) && value > 0 ? value : 6 * 60 * 60 * 1000;
}

// The live lock that keeps this caller out, or null. A lock is per door: the same door re-enters,
// except that a second long-lived process of the same door (two watchers) is refused while the
// holder's pid lives. A re-entry without a pid (the skill's CLI calls inside the holder's harness)
// is always the holder's. A lock with a pid lives while that pid does; a lock without one (the
// session door, whose CLI calls are short-lived processes) lives until `end` releases it or the TTL passes.
export function liveLock(root, id, door, pid = null) {
  const lock = readLock(root, id);
  if (!lock) return null;
  const hasPid = Number.isInteger(lock.pid) && lock.pid > 0;
  const stale = hasPid ? !pidAlive(lock.pid) : Date.now() - Date.parse(lock.startedAt || 0) > lockTtlMs();
  if (stale) {
    fs.rmSync(lockPath(root, id), { force: true });
    return null;
  }
  if (lock.door === door && (!hasPid || pid === null || pid === lock.pid)) return null;
  return lock;
}

// Takes the ticket's lock for this door; a stale lock is removed first. `pid` is the long-lived
// process that owns the run (the watcher), or null for the session door.
export function acquireLock(root, id, door, pid = process.pid) {
  const other = liveLock(root, id, door, pid);
  if (other) return { ok: false, pid: other.pid ?? null, door: other.door };
  const file = lockPath(root, id);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const existing = readLock(root, id);
  const same = existing && existing.door === door ? existing : null;
  const startedAt = same ? same.startedAt : new Date().toISOString();
  // A re-entry of the same door without a pid (the skill's begin inside a watcher's harness call)
  // keeps the holder's pid, so the lock still names the long-lived process.
  fs.writeFileSync(file, JSON.stringify({ ...(same ?? {}), pid: pid ?? same?.pid ?? null, door, startedAt }));
  return { ok: true };
}

export function releaseLock(root, id) {
  fs.rmSync(lockPath(root, id), { force: true });
}

export function activeMarkerPath(root) {
  return path.join(root, '.ultrapowers', 'autopilot-active');
}

export function writeActiveMarker(root, { ticket, branch, scope, stage = null }) {
  const file = activeMarkerPath(root);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify({ ticket, branch, scope: scope ?? [], ...(stage ? { stage } : {}) }));
}

// The marker's content while a stage is open, or null.
export function readActiveMarker(root) {
  const file = activeMarkerPath(root);
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return { ticket: null, branch: null, scope: [], stage: null };
  }
}

export function clearActiveMarker(root) {
  fs.rmSync(activeMarkerPath(root), { force: true });
}
