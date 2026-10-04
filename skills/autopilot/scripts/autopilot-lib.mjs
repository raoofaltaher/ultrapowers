// Pure rules of the autopilot engine: configuration, slugs and branch names.
// No I/O here. Node built-ins only.

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
