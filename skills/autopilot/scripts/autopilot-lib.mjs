// Rules of the autopilot engine: configuration, slugs, branch names, the per-ticket
// state file and the hash-chained stage log. Node built-ins only; no process is spawned here.

import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

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
export const HARNESSES = ['claude-code', 'opencode'];
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
export function renderPacket(template, { state, links, assumptions = [], events }) {
  const repoNames = state.scope.frozen ? state.scope.frozen : state.scope.proposed;
  const byName = Object.fromEntries((state.repos ?? []).map((r) => [r.name, r]));
  const repoLines = (repoNames.length ? repoNames : ['.']).map((name) => {
    const r = byName[name];
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
export async function verifyApproval({ events, approveLabel, packet, permissionOf, approvers = [], botLogin, tips }) {
  const relevant = (events ?? []).filter((e) => e.label === approveLabel).sort((a, b) => String(a.at).localeCompare(String(b.at)));
  const last = relevant[relevant.length - 1];
  if (!last || last.action !== 'labeled') return { ok: false, reason: 'no-event', detail: `no ${approveLabel} label event` };
  if (botLogin && last.actor === botLogin) return { ok: false, reason: 'self', detail: `${last.actor} is the engine's own account` };
  if (!packet || !packet.postedAt || String(last.at) <= String(packet.postedAt)) {
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
export function pushAllowed(state, repoName, branch) {
  if (!String(branch).startsWith(`${state.ticket}-`)) return false;
  if (repoName === 'docs') return true;
  return Array.isArray(state.scope?.frozen) && state.scope.frozen.includes(repoName);
}
