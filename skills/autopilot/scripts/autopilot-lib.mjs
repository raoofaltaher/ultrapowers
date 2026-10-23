// Rules of the autopilot engine: configuration, slugs, branch names, the per-ticket
// state file and the hash-chained stage log. Node built-ins only; no process is spawned here.

import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { HARNESS_NAMES, HARNESSES as ADAPTERS } from './harnesses.mjs';
import { textLines } from '../../brainstorming/scripts/check-doc.mjs';

export class AutopilotError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'AutopilotError';
    this.code = code;
  }
}

// A ticket's review folder, or a folder under it, is read and posted on the tracker, so it must be
// a real folder of the project: neither reviews/<ID> nor the named sub-folder may be a symbolic
// link or junction, and its real path must be <real project root>/reviews/<ID>[/<sub>]. Returns
// null when it is, or when it does not exist; otherwise a sentence naming the folder.
export function reviewFolderProblem(root, id, sub = '') {
  const rel = sub ? `reviews/${id}/${sub}` : `reviews/${id}`;
  const steps = [path.join(root, 'reviews', id)].concat(sub ? [path.join(root, 'reviews', id, sub)] : []);
  for (const step of steps) {
    const stat = fs.lstatSync(step, { throwIfNoEntry: false });
    if (!stat) return null;
    if (stat.isSymbolicLink()) return `${path.relative(root, step).replace(/\\/g, '/')} is a symbolic link or junction, not a folder of the project`;
  }
  let realRoot;
  let realDir;
  try {
    realRoot = fs.realpathSync(root);
    realDir = fs.realpathSync(steps.at(-1));
  } catch {
    return `${rel} cannot be resolved`;
  }
  const expected = path.join(realRoot, 'reviews', id, ...(sub ? [sub] : []));
  const fold = (p) => (process.platform === 'win32' ? path.normalize(p).toLowerCase() : path.normalize(p));
  if (!realDir.startsWith(realRoot + path.sep) || fold(realDir) !== fold(expected)) return `${rel} resolves outside the project, to ${realDir}`;
  return null;
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
  // sharedCredentials: false means a watcher starts only with read-only stage tokens in its environment.
  watch: Object.freeze({ intervalSec: 60, maxConcurrent: 1, sharedCredentials: false }),
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

const STAGE_ENV_NAME = /^[A-Za-z_][A-Za-z0-9_]*\*?$/;

// Why a configured branch name could reach git as an option or a revision expression, or null. The
// pure part of the check; the engine also asks git itself (repos.mjs checkBranchName).
export function branchNameProblem(name) {
  if (typeof name !== 'string' || name.trim() === '') return 'must be a non-empty string';
  if (name.startsWith('-')) return `(${JSON.stringify(name)}) starts with "-": git would read it as an option`;
  if (/[\u0000- \u007f~^:?*[\\]|\.\.|@\{|\/\/|\.lock$|\/$|^\//.test(name)) return `(${JSON.stringify(name)}) is not a valid branch name`;
  return null;
}

// Returns a list of error strings, empty when the block is valid.
export function validateAutopilot(block) {
  const errors = [];
  if (!isObject(block)) return ['autopilot must be an object'];
  if (!MODES.includes(block.mode)) errors.push(`autopilot.mode must be one of ${MODES.join(', ')}`);
  if (block.baseBranch !== undefined && (typeof block.baseBranch !== 'string' || block.baseBranch.trim() === '')) {
    errors.push('autopilot.baseBranch must be a non-empty string');
  } else if (block.baseBranch !== undefined && branchNameProblem(block.baseBranch)) {
    errors.push(`autopilot.baseBranch ${branchNameProblem(block.baseBranch)}`);
  }
  if (block.stageEnv !== undefined) {
    if (!Array.isArray(block.stageEnv) || block.stageEnv.some((n) => typeof n !== 'string' || !STAGE_ENV_NAME.test(n))) {
      errors.push('autopilot.stageEnv must be a list of variable names, each a name or a PREFIX_* pattern (letters, digits and underscores)');
    }
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
        else if (v.includes(',')) errors.push(`autopilot.events.${k} must not contain a comma; Odoo joins tag names with ", " in its chatter, so the engine could not tell them apart`);
      }
    }
  }
  if (block.watch !== undefined) {
    if (!isObject(block.watch)) errors.push('autopilot.watch must be an object');
    else {
      if (block.watch.intervalSec !== undefined && !isPositiveInt(block.watch.intervalSec)) errors.push('autopilot.watch.intervalSec must be a positive integer');
      if (block.watch.maxConcurrent !== undefined && !isPositiveInt(block.watch.maxConcurrent)) errors.push('autopilot.watch.maxConcurrent must be a positive integer');
      if (block.watch.sharedCredentials !== undefined && typeof block.watch.sharedCredentials !== 'boolean') errors.push('autopilot.watch.sharedCredentials must be true or false');
    }
  }
  return errors;
}

// An Odoo source that autopilot runs holds the engine's technical-user key, so an empty approvers
// list would let that account (or any member) approve its own work: approvers must name people, and
// never the technical user itself. A source with `autopilot: false` is not run and is left out.
export function odooApproverErrors(tickets, block) {
  const sources = Array.isArray(tickets?.sources) ? tickets.sources : [];
  const running = sources.filter((s) => isObject(s) && s.provider === 'odoo' && s.autopilot !== false);
  if (!running.length || !isObject(block) || block.mode === 'off') return [];
  const approvers = Array.isArray(block.approvers) ? block.approvers.map((a) => String(a).trim().toLowerCase()) : [];
  const errors = [];
  if (!approvers.length) {
    errors.push('autopilot.approvers must name at least one human login when autopilot runs an Odoo source: the engine holds the key of a technical user, and an empty list would let any member approve');
  }
  for (const source of running) {
    const login = typeof source.login === 'string' ? source.login.trim().toLowerCase() : '';
    if (login && approvers.includes(login)) {
      errors.push(`autopilot.approvers lists ${source.login}, the technical user of the Odoo source ${source.prefix}: the technical user cannot be its own approver`);
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
  const odooErrors = odooApproverErrors(marker.tickets, block);
  if (odooErrors.length) throw new AutopilotError('bad-autopilot', odooErrors.join('; '));
  return {
    mode: block.mode,
    baseBranch: block.baseBranch ?? null,
    approvers: [...(block.approvers ?? [])],
    execution: block.execution ?? DEFAULTS.execution,
    harness: block.harness ?? DEFAULTS.harness,
    // Extra variable names (or PREFIX_* patterns) a headless stage may hold, beyond the allow-list.
    stageEnv: [...(block.stageEnv ?? [])],
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
export function renderPacket(template, { state, links, assumptions = [], events, baseAhead = [], repoBases = {} }) {
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
    // A code repository keeps its own default branch; before its branch exists that comes from the
    // configured repos, never from the documents base.
    const base = r?.base ?? repoBases[name] ?? state.docs.base ?? '';
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
// `lastSeenTags` is the tag set the engine recorded at its previous observation (observeTags). A
// last-writer event names whoever wrote the task last, not who added the tag, so such an approve
// tag verifies only when it was absent at that observation or was first seen under this same actor.
export async function verifyApproval({ events, approveLabel, packet, permissionOf, approvers = [], tips, lastSeenTags }) {
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
  if (last.attribution === 'last-writer' && Array.isArray(lastSeenTags)) {
    const seen = lastSeenTags.find((t) => t?.name === approveLabel);
    if (seen && seen.writer !== last.actor) {
      return { ok: false, reason: 'attribution-unproven', detail: `the ${approveLabel} tag was first seen under ${seen.writer || 'an unknown writer'} at ${seen.at}; ${last.actor} is only the task's last writer` };
    }
  }
  const drift = [];
  if ((tips?.docs ?? null) !== (packet.docsTip ?? null)) drift.push(`docs ${packet.docsTip} -> ${tips?.docs}`);
  for (const [name, sha] of Object.entries(packet.tips ?? {})) {
    if ((tips?.repos?.[name] ?? null) !== sha) drift.push(`${name} ${sha} -> ${tips?.repos?.[name] ?? 'none'}`);
  }
  if (drift.length) return { ok: false, reason: 'drift', detail: drift.join(', ') };
  return { ok: true, actor: last.actor, eventId: String(last.id), at: last.at, attribution: last.attribution ?? 'tracked' };
}

// The tag set of a last-writer observation: a tag already recorded keeps the writer it was first
// seen under (a later edit never upgrades it), a new tag takes the current last writer, a tag gone
// from the task is dropped.
export function observeTags(previous, events) {
  const before = new Map((Array.isArray(previous) ? previous : []).filter((t) => t?.name).map((t) => [t.name, t]));
  const out = [];
  for (const e of events ?? []) {
    if (e.action !== 'labeled' || out.some((t) => t.name === e.label)) continue;
    const kept = before.get(e.label);
    out.push(kept ? { name: kept.name, writer: kept.writer, at: kept.at } : { name: e.label, writer: e.actor ?? '', at: e.at ?? '' });
  }
  return out;
}

// The Odoo tag names init proposes when a project's autopilot source is Odoo (spec D9).
export const ODOO_EVENTS = Object.freeze({
  ready: 'Ultrapowers Ready', approve: 'Ultrapowers Approve', changes: 'Ultrapowers Changes',
  hold: 'Ultrapowers Hold', running: 'Ultrapowers Running', blocked: 'Ultrapowers Blocked',
});

// `.agents/mcp-secrets.env` (KEY=VALUE lines, `export` allowed, quotes stripped) fills the variables
// the environment lacks, so a key kept there is read like the provider CLIs' tokens. The environment
// wins over the file, and only credential-shaped names are taken: a planted file must not be able
// to set PATH, NODE_OPTIONS or a git command. Returns the names it set.
const SECRET_NAME = /(_TOKEN|_API_KEY|_KEY|_SECRET|_PASSWORD|_PAT)$/;

export function loadSecretsFile(root, env = process.env) {
  const file = path.join(root, '.agents', 'mcp-secrets.env');
  if (!fs.existsSync(file)) return [];
  const loaded = [];
  for (const raw of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const m = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!m || !SECRET_NAME.test(m[1])) continue;
    let value = m[2].trim();
    const quoted = /^(["'])(.*)\1$/.exec(value);
    if (quoted) value = quoted[2];
    if (!value) continue;
    if (env[m[1]] === undefined || env[m[1]] === '') {
      env[m[1]] = value;
      loaded.push(m[1]);
    }
  }
  return loaded;
}

// ---- The environment of a headless stage (audit 2026-10-23, M6 and L3) ----
//
// A stage runs a coding agent with permission prompts bypassed, and anything it writes and runs (a
// script, a test) reads its environment. The engine's own process holds credentials the stage has
// no use for: the Odoo key and every key `loadSecretsFile` pulled out of .agents/mcp-secrets.env.
// So the stage environment is built from a list of what it needs, not by removing what it must not
// have. A key an MCP server of the stage needs stays readable by a script the stage runs; only an
// OS sandbox removes that, which this plugin does not provide.

// The operating-system and toolchain base: where things are, who and where the user is, the
// language, the terminal, the proxy and CA settings, the engine's own ULTRAPOWERS_* names, and the
// non-secret git identity. On Windows the names match case-insensitively.
const STAGE_ENV_BASE = Object.freeze([
  'PATH', 'PATHEXT', 'HOME', 'USERPROFILE', 'HOMEDRIVE', 'HOMEPATH', 'APPDATA', 'LOCALAPPDATA', 'PROGRAMDATA',
  'ProgramFiles', 'ProgramFiles(x86)', 'ProgramW6432', 'CommonProgramFiles', 'CommonProgramFiles(x86)', 'CommonProgramW6432',
  'SystemRoot', 'SYSTEMDRIVE', 'WINDIR', 'COMSPEC', 'TEMP', 'TMP', 'TMPDIR', 'USER', 'USERNAME', 'LOGNAME', 'SHELL',
  'LANG', 'LANGUAGE', 'LC_*', 'TZ', 'TERM', 'COLORTERM', 'NUMBER_OF_PROCESSORS', 'PROCESSOR_ARCHITECTURE', 'OS', 'XDG_*', 'MSYSTEM',
  'HTTP_PROXY', 'HTTPS_PROXY', 'NO_PROXY', 'ALL_PROXY', 'http_proxy', 'https_proxy', 'no_proxy', 'all_proxy',
  'SSL_CERT_FILE', 'SSL_CERT_DIR', 'NODE_EXTRA_CA_CERTS',
  'GIT_AUTHOR_NAME', 'GIT_AUTHOR_EMAIL', 'GIT_COMMITTER_NAME', 'GIT_COMMITTER_EMAIL', 'GIT_CONFIG_GLOBAL', 'GIT_CONFIG_SYSTEM', 'GIT_CONFIG_NOSYSTEM',
  'GH_HOST', 'GITLAB_HOST',
  'ULTRAPOWERS_*',
]);

// The tracker tokens and the ssh agent of the engine. Without stage credentials the stage shares
// them, as before; with stage credentials they are removed and the mapped stage tokens set instead.
export const ENGINE_TOKEN_VARS = Object.freeze(['GH_TOKEN', 'GITHUB_TOKEN', 'GH_ENTERPRISE_TOKEN', 'GITHUB_ENTERPRISE_TOKEN', 'GITLAB_TOKEN', 'GLAB_TOKEN', 'GITLAB_ACCESS_TOKEN', 'GITLAB_PRIVATE_TOKEN', 'GL_TOKEN']);
const STAGE_SHARED_VARS = Object.freeze([...ENGINE_TOKEN_VARS, 'CI_JOB_TOKEN', 'OAUTH_TOKEN', 'SSH_AUTH_SOCK', 'GIT_SSH_COMMAND', 'GIT_SSH', 'GH_CONFIG_DIR', 'GLAB_CONFIG_DIR']);
const STAGE_TOKEN_NAMES = Object.freeze(['ULTRAPOWERS_STAGE_GH_TOKEN', 'ULTRAPOWERS_STAGE_GITLAB_TOKEN']);
// Never passed, whatever a harness, the project or an MCP reference lists: it loads code into node.
const STAGE_ENV_NEVER = Object.freeze(['NODE_OPTIONS']);

function nameTest(patterns, caseInsensitive) {
  const fold = (s) => (caseInsensitive ? s.toLowerCase() : s);
  const exact = new Set();
  const prefixes = [];
  for (const p of patterns) {
    const q = fold(String(p));
    if (q.endsWith('*')) prefixes.push(q.slice(0, -1));
    else exact.add(q);
  }
  return (name) => {
    const n = fold(name);
    return exact.has(n) || prefixes.some((pre) => n.startsWith(pre));
  };
}

// Every ${NAME} (or ${NAME:-default}) the text of an MCP configuration references, once each: the
// variables the servers it names expect in their environment, headers, arguments or url.
export function mcpEnvNames(text) {
  const names = new Set();
  for (const m of String(text ?? '').matchAll(/\$\{([A-Za-z_][A-Za-z0-9_]*)(?::?[-=?+][^}]*)?\}/g)) names.add(m[1]);
  return [...names];
}

// The environment of a headless stage, built from `env` (the engine's own). `harness` adds that
// adapter's auth names, `extra` is autopilot.stageEnv, `mcpNames` the variables the stage's MCP
// snapshot references. `noAuthDir` is where gh and glab find an empty configuration when the stage
// has credentials of its own. Pure: nothing is read from or written to the disk or process.env.
export function stageEnvFrom(env, { harness, extra = [], mcpNames = [], noAuthDir = null, platform = process.platform } = {}) {
  const ci = platform === 'win32';
  const fold = (s) => (ci ? s.toLowerCase() : s);
  const get = (name) => {
    for (const k of Object.keys(env)) if (fold(k) === fold(name) && env[k]) return env[k];
    return undefined;
  };
  const stageGh = get('ULTRAPOWERS_STAGE_GH_TOKEN');
  const stageGl = get('ULTRAPOWERS_STAGE_GITLAB_TOKEN');
  const stageCreds = Boolean(stageGh || stageGl);
  const adapter = ADAPTERS[harness];
  const allowed = nameTest([
    ...STAGE_ENV_BASE,
    ...(adapter?.envAllow ?? []),
    ...extra,
    ...mcpNames,
    ...(stageCreds ? [] : STAGE_SHARED_VARS),
  ], ci);
  const never = nameTest(STAGE_ENV_NEVER, ci);
  const dropped = nameTest(stageCreds ? [...STAGE_SHARED_VARS, ...STAGE_TOKEN_NAMES] : STAGE_TOKEN_NAMES, ci);
  const out = {};
  for (const [k, v] of Object.entries(env)) {
    if (typeof v !== 'string' || never(k) || dropped(k) || !allowed(k)) continue;
    out[k] = v;
  }
  out.ULTRAPOWERS_AUTOPILOT_INSIDE = '1';
  out.GIT_TERMINAL_PROMPT = '0';
  if (stageCreds) {
    // gh and glab see an empty configuration directory, so a stage steered into labelling a ticket
    // has nothing to do it with; and the git credential helper is reset behind any pins already there.
    if (noAuthDir) {
      out.GH_CONFIG_DIR = path.join(noAuthDir, 'gh');
      out.GLAB_CONFIG_DIR = path.join(noAuthDir, 'glab');
    }
    if (stageGh) out.GH_TOKEN = stageGh;
    if (stageGl) out.GITLAB_TOKEN = stageGl;
    const n = Number.parseInt(out.GIT_CONFIG_COUNT ?? '0', 10) || 0;
    out[`GIT_CONFIG_KEY_${n}`] = 'credential.helper';
    out[`GIT_CONFIG_VALUE_${n}`] = '';
    out.GIT_CONFIG_COUNT = String(n + 1);
  }
  return out;
}

// The MCP configuration a stage loads is the project's with its remote servers left out: a server
// with a `url`, or of type http, sse or streamable-http, is a connection the stage would open with
// the credentials in its headers; only servers that run a local command stay. The result is the
// filtered JSON text (a config that is not JSON, or has no server table, loads no server).
export function filterMcpServers(text) {
  const none = '{"mcpServers":{}}';
  let parsed;
  try {
    parsed = JSON.parse(String(text ?? '').replace(/^﻿/, ''));
  } catch {
    return none;
  }
  if (!isObject(parsed) || !isObject(parsed.mcpServers)) return none;
  const kept = {};
  for (const [name, server] of Object.entries(parsed.mcpServers)) {
    if (!isObject(server)) continue;
    const stdio = server.type === undefined || server.type === 'stdio';
    const command = typeof server.command === 'string' && server.command.trim() !== '';
    if (stdio && command && server.url === undefined) kept[name] = server;
  }
  return JSON.stringify({ ...parsed, mcpServers: kept }, null, 2);
}

// The lines under the first heading with this text, up to the next heading. A spec may quote the
// template in a fenced block, headings and all: the checker's own reading blanks those lines, so only
// the document's own headings count.
function section(markdown, heading) {
  const lines = textLines(String(markdown ?? ''));
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
  // The header row starts with "#" and the separator row with dashes, aligned with colons or not.
  const body = rows.filter((cells) => cells.length >= 5 && !/^#$/.test(cells[0]) && !/^:?-+:?$/.test(cells[0]));
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

// A ticket branch name: `<ID>-` and then letters, digits, `.`, `_` and `-` only, so the name read
// from the state file can never be a refspec (`:`), a path (`/`), a range (`..`) or an option.
export function isTicketBranch(ticket, branch) {
  if (typeof branch !== 'string' || typeof ticket !== 'string' || !ticket || ticket.startsWith('-')) return false;
  const escaped = ticket.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (!new RegExp(`^${escaped}-[A-Za-z0-9._-]+$`).test(branch)) return false;
  return !branch.includes('..') && !branch.endsWith('.') && !branch.endsWith('.lock');
}

// A push is allowed only to a `<ID>-` branch, to the docs repository or a frozen repository.
// `ticket` is the id the command validated; the state file's copy is not trusted for this.
export function pushAllowed(state, repoName, branch, ticket = state.ticket) {
  if (!isTicketBranch(String(ticket), branch)) return false;
  if (repoName === 'docs') return true;
  return Array.isArray(state.scope?.frozen) && state.scope.frozen.includes(repoName);
}

// ---- Next stage, locks and the active marker (spec §6, §8) ----

const MAX_ATTEMPTS = 3;
// A verdict that stops the run: a failure, a precondition that was not met, and a report that did
// not finish (INCOMPLETE), which proves nothing either way. PASS-WITH-ISSUES goes on to the pull request.
export const QA_STOPS = ['FAIL', 'PRECONDITION-FAILED', 'INCOMPLETE'];
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
