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
