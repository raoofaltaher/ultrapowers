#!/usr/bin/env node
// The autopilot engine: one JSON object per command; exit 0 is a result, exit 2 an error
// { "error": { "code", "message" } }, exit 1 a crash. Node built-ins only.
//
//   status <ID>                              the state, the last log lines and the chain check
//   next <ID> [--mode off|gated|full]        what to do next: run <stage>, wait, done or stop
//   begin <ID> <stage> [--door command|watch]
//   end <ID> <stage> --result <json>
// Every command takes --root <dir>; without it the root is found from the working directory.

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { execFile } from 'node:child_process';
import { resolveTicket, TicketError } from '../../new-task/scripts/ticket-sources.mjs';
import { fileURLToPath } from 'node:url';
import {
  AutopilotError, STAGES, QA_STOPS, effectiveAutopilot, modeFor, branchName, initialState,
  readState, writeState, appendLog, readLog, verifyChain,
  nextStage, acquireLock, releaseLock, liveLock, readLock, lockPath,
  writeActiveMarker, clearActiveMarker, readActiveMarker, verifyApproval,
  renderPacket, assumptionsFrom, scopeFrom, freezeScope, pushAllowed, loadSecretsFile, packetId,
} from './autopilot-lib.mjs';
import { trackerFor } from './tracker.mjs';
import { HARNESSES, GUARDED_HARNESSES, PLUGIN_ROOT } from './harnesses.mjs';
import { ensureBranch, ensureOnTicketBranch, ensureWorktree, remoteHead, forgeFor, tip, workTip, commitPaths, push, repoDirs, baseAhead, pathsChanged, git } from './repos.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PACKET_TEMPLATE = path.join(HERE, '..', 'templates', 'packet.md');
const REPORT_TEMPLATE = path.join(HERE, '..', 'templates', 'report.md');
const MARKER = path.join('.agents', 'ultrapowers.json');
const COMMANDS = ['status', 'next', 'begin', 'end', 'packet', 'approval', 'pr', 'run', 'watch'];
const BACKOFF_CAP_MS = 600_000;
const MAX_STAGE_REPEATS = 3;
const DOORS = ['command', 'watch'];
const FLAGS = { '--root': 'root', '--mode': 'mode', '--door': 'door', '--result': 'result', '--pid': 'pid' };
const SWITCHES = { '--once': 'once' };
const PROMPTS_DIR = path.join(HERE, '..', 'prompts');

// The headless harnesses the watcher door can spawn live in harnesses.mjs, one fresh call per
// agent stage. An override ending in .mjs/.js/.cjs runs under this node, for the tests.
export { HARNESSES };

function maxTurns() {
  const v = Number(process.env.ULTRAPOWERS_AUTOPILOT_MAX_TURNS);
  return Number.isInteger(v) && v > 0 ? v : 200;
}

function stageTimeoutMs() {
  const v = Number(process.env.ULTRAPOWERS_AUTOPILOT_STAGE_TIMEOUT_MS);
  return Number.isFinite(v) && v > 0 ? v : 3_600_000;
}

// The same text the session door follows: the skill invocation line, then the stage prompt file.
export function stagePrompt(stage, id) {
  const file = path.join(PROMPTS_DIR, `${stage}.md`);
  const body = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  return `/ultrapowers:autopilot ${id} --stage ${stage} --door watch\n\n${body}`;
}

function findRoot(start) {
  let dir = path.resolve(start);
  for (;;) {
    if (fs.existsSync(path.join(dir, MARKER))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) throw new AutopilotError('no-marker', `no ${MARKER.replace(/\\/g, '/')} at or above ${start}`);
    dir = parent;
  }
}

function readMarker(root) {
  try {
    return JSON.parse(fs.readFileSync(path.join(root, MARKER), 'utf8').replace(/^﻿/, ''));
  } catch (err) {
    throw new AutopilotError('marker-corrupt', `${MARKER.replace(/\\/g, '/')} is not valid JSON: ${err.message}`);
  }
}

function parseArgs(argv) {
  // `watch` takes no ticket; every other command does.
  const [command, ...tail] = argv;
  const watchMode = command === 'watch';
  const id = watchMode ? (tail[0] && !tail[0].startsWith('--') ? tail.shift() : null) : tail.shift();
  const rest = tail;
  const opts = { command, id, stage: null, root: null, mode: null, door: 'command', result: null, pid: null, once: false };
  let i = 0;
  if ((command === 'begin' || command === 'end') && rest[0] && !rest[0].startsWith('--')) {
    opts.stage = rest[0];
    i = 1;
  }
  for (; i < rest.length; i += 1) {
    const flag = rest[i];
    const value = rest[i + 1];
    if (flag in SWITCHES) {
      opts[SWITCHES[flag]] = true;
      continue;
    }
    if (!(flag in FLAGS)) throw new AutopilotError('bad-args', `unknown argument ${flag}`);
    if (value === undefined) throw new AutopilotError('bad-args', `${flag} needs a value`);
    opts[FLAGS[flag]] = value;
    i += 1;
  }
  if (!COMMANDS.includes(command) || (!id && !watchMode)) {
    throw new AutopilotError('bad-args', `usage: autopilot.mjs ${COMMANDS.filter((c) => c !== 'watch').join('|')} <ID> [<stage>] [--root <dir>] [--mode off|gated|full] [--door command|watch] [--result <json>] | watch [--root <dir>] [--once]`);
  }
  if (watchMode && id) throw new AutopilotError('bad-args', 'watch takes no ticket; it lists them from the tracker');
  if ((command === 'begin' || command === 'end') && !STAGES.includes(opts.stage)) {
    throw new AutopilotError('bad-args', `${command} needs a stage: ${STAGES.join(', ')}`);
  }
  if (!DOORS.includes(opts.door)) throw new AutopilotError('bad-args', `--door must be ${DOORS.join(' or ')}`);
  if (opts.pid !== null) {
    opts.pid = Number(opts.pid);
    if (!Number.isInteger(opts.pid) || opts.pid <= 0) throw new AutopilotError('bad-args', '--pid must be a positive integer');
  }
  if (command === 'end') {
    if (!opts.result) throw new AutopilotError('bad-args', 'end needs --result <json>');
    try {
      opts.result = JSON.parse(opts.result);
    } catch (err) {
      throw new AutopilotError('bad-args', `--result is not JSON: ${err.message}`);
    }
  }
  return opts;
}

// Everything a command needs about the ticket: root, marker, settings, source, tracker.
function context(opts) {
  const isUrl = /^https?:\/\//i.test(opts.id);
  if (!isUrl && /[/\\]|\.\./.test(opts.id)) throw new AutopilotError('bad-ticket', `${opts.id} names a path; a ticket id holds no "/", "\\" or ".."`);
  const root = opts.root ? path.resolve(opts.root) : findRoot(process.cwd());
  if (!fs.existsSync(path.join(root, MARKER))) throw new AutopilotError('no-marker', `no ${MARKER.replace(/\\/g, '/')} in ${root}`);
  const marker = readMarker(root);
  const settings = effectiveAutopilot(marker);
  loadSecretsFile(root, process.env);
  const resolution = resolveTicket(marker, opts.id);
  if (resolution.provider === 'local') {
    throw new AutopilotError('local-ticket', `${opts.id} is a local ticket; autopilot runs tickets from a configured GitHub, GitLab or Odoo source. Use /ultrapowers:new-task ${opts.id} for the manual flow`);
  }
  if (!['github', 'gitlab', 'odoo'].includes(resolution.provider)) {
    throw new AutopilotError('no-writeback', `${resolution.provider} tickets have no write-back in this version; GitHub, GitLab and Odoo do`);
  }
  if (resolution.provider === 'odoo') {
    if (!resolution.login) throw new AutopilotError('no-credentials', `tickets.sources[].login is required for ${resolution.prefix}: the engine signs in to Odoo as a technical user`);
    if (!process.env.ODOO_API_KEY) throw new AutopilotError('no-credentials', `ODOO_API_KEY is not set; the engine reaches ${resolution.url} with the technical user's API key. Set it in the environment or in .agents/mcp-secrets.env`);
  }
  // A task URL resolves to the ticket's id; every state path uses that id.
  if (resolution.id && resolution.id !== opts.id) opts.id = resolution.id;
  const tracker = trackerFor(resolution, process.env);
  const source = { provider: resolution.provider, path: resolution.path, number: resolution.number };
  const dirs = repoDirs(root, marker);
  // The ticket's documents live on its branch, checked out in place: put the documents
  // repository there before anything reads the state, so two tickets can share one workspace.
  ensureOnTicketBranch(dirs.docs, opts.id);
  // Inside a watcher's headless stage the engine CLI holds the stage's credentials, which may be
  // read-only; the tracker writes of begin and end are then made by the watcher around the stage.
  const inside = process.env.ULTRAPOWERS_AUTOPILOT_INSIDE === '1';
  return { root, marker, settings, resolution, source, tracker, dirs, inside };
}

function trailerOf(marker) {
  return typeof marker.commitTrailer === 'string' ? marker.commitTrailer : '';
}

function commitState(ctx, id, message) {
  return commitPaths(ctx.dirs.docs, [`tasks/${id}`], message, trailerOf(ctx.marker));
}

async function labelsOf(ctx) {
  return ctx.settings.mode === 'off' ? [] : ctx.tracker.labels(ctx.source.number);
}

async function removeRunning(ctx) {
  if (ctx.settings.mode === 'off') return;
  await ctx.tracker.removeLabel(ctx.source.number, ctx.settings.events.running);
}

// The stage the agent is inside, if any. While it is open the engine's gate commands are refused:
// the agent must not be able to post, verify or open pull requests from within its own stage.
function openStage(ctx) {
  return readActiveMarker(ctx.root);
}

function assertNoOpenStage(ctx, what) {
  const open = openStage(ctx);
  if (!open) return;
  throw new AutopilotError('stage-open', `${what} is refused while the ${open.stage ?? 'current'} stage of ${open.ticket ?? 'a ticket'} is open; end that stage first`);
}

const SCOPE_CODES = ['scope-widened', 'unknown-repo', 'no-scope'];

// The spec's and the plan's repository lists and the scope they would freeze to; throws a scope code.
function previewScope(ctx, state) {
  const specRepos = scopeFrom(readText(path.join(ctx.root, 'specs', state.ticket, 'Spec.md')));
  const planRepos = scopeFrom(readText(path.join(ctx.root, 'plans', state.ticket, 'Plan.md')));
  return { specRepos, planRepos, frozen: freezeScope(state, { specRepos, planRepos, knownRepos: knownRepos(ctx) }) };
}

// Ends an engine stage as blocked: the state, the log, the commit, the label, the comment, and the
// lock and marker released, so a failed packet or pull request never strands the ticket or the watcher.
async function blockStage(ctx, id, door, stage, message, { label = true } = {}) {
  const state = readState(ctx.root, id);
  if (state) {
    state.stage = stage;
    state.stageStatus = 'blocked';
    writeState(ctx.root, id, state);
    appendLog(ctx.root, id, { stage, event: 'blocked', actor: 'engine', trigger: door, repo: 'docs', message });
    commitState(ctx, id, `chore(${id}): autopilot ${stage} blocked`);
  }
  clearActiveMarker(ctx.root);
  releaseLock(ctx.root, id);
  if (ctx.settings.mode === 'off') return;
  await removeRunning(ctx).catch(() => {});
  if (label) await ctx.tracker.addLabel(ctx.source.number, ctx.settings.events.blocked).catch(() => {});
  await ctx.tracker.comment(ctx.source.number, `Autopilot for ${id} is blocked at stage ${stage} (attempt ${state?.attempt ?? 1}): ${message}`).catch(() => {});
}

// A recorded approval is checked again before execute and before the pull request: the event
// is still on the tracker's timeline with its actor, and it belongs to the packet that was approved.
// A full-mode approval has no event; it belongs to its packet all the same.
async function recheckApproval(ctx, state) {
  const a = state.approval;
  if (!a || !state.packet || a.docsTip !== state.packet.docsTip) {
    throw new AutopilotError('approval-unverified', `${state.ticket}: the recorded approval does not belong to the current packet`);
  }
  if (a.mode === 'full') return;
  // A last-writer approval (Odoo without tag tracking, spec D3) has no timeline event to find again:
  // the engine's own tag removal at the gate made it the task's last writer. What can be checked is
  // the hash-chained log: intact, and holding the `approved` line this record claims.
  if (a.attribution === 'last-writer') {
    const chain = verifyChain(ctx.root, state.ticket);
    if (!chain.ok) throw new AutopilotError('approval-unverified', `${state.ticket}: the stage log chain is broken at line ${chain.at}; the recorded approval cannot be trusted`);
    const line = readLog(ctx.root, state.ticket).find((l) => l.event === 'approved' && l.actor === a.actor && l.sha === a.docsTip && l.attribution === 'last-writer');
    if (!line) throw new AutopilotError('approval-unverified', `${state.ticket}: the stage log holds no approved line by ${a.actor} for ${a.docsTip}`);
    return;
  }
  const events = await ctx.tracker.labelEvents(ctx.source.number);
  const found = events.some((e) => String(e.id) === String(a.eventId) && e.actor === a.actor && e.action === 'labeled' && e.label === ctx.settings.events.approve);
  if (!found) throw new AutopilotError('approval-unverified', `${state.ticket}: the approval event ${a.eventId} by ${a.actor} is not on the tracker's timeline`);
}

// The tracker writes around a stage. In the session door `begin` and `end` make them; in the
// watch door the watcher makes them, because the stage may hold a read-only credential.
async function markRunning(ctx) {
  const labels = await ctx.tracker.labels(ctx.source.number);
  if (!labels.includes(ctx.settings.events.running)) await ctx.tracker.addLabel(ctx.source.number, ctx.settings.events.running);
}

// The changes request is taken: the label goes, so the gate that follows waits for a new one.
async function takeChangesLabel(ctx, id, door) {
  await ctx.tracker.removeLabel(ctx.source.number, ctx.settings.events.changes);
  appendLog(ctx.root, id, { stage: 'changes', event: 'changes-taken', actor: 'engine', trigger: door, repo: 'docs' });
}

async function reportBlocked(ctx, id, stage, attempt, message) {
  await ctx.tracker.addLabel(ctx.source.number, ctx.settings.events.blocked);
  await ctx.tracker.comment(ctx.source.number, `Autopilot for ${id} is blocked at stage ${stage} (attempt ${attempt}): ${message}`);
}

// Spec §4: a changed spec or plan after the approval stops the run.
function planChangedSince(ctx, state) {
  const since = state.approval?.docsTip;
  if (!since) return false;
  return pathsChanged(ctx.dirs.docs, since, 'HEAD', [`specs/${state.ticket}`, `plans/${state.ticket}`]);
}

// ---- commands ----

async function runStatus(opts) {
  const ctx = context(opts);
  const state = readState(ctx.root, opts.id);
  const log = readLog(ctx.root, opts.id).slice(-10);
  const lock = readLock(ctx.root, opts.id);
  return { ticket: opts.id, state, log, chain: verifyChain(ctx.root, opts.id), lock };
}

async function runNext(opts) {
  const ctx = context(opts);
  const state = readState(ctx.root, opts.id);
  const labels = await permittedLabels(ctx);
  const block = ctx.marker.autopilot ?? { mode: 'off' };
  const mode = modeFor(block, { arg: opts.mode, labels });
  const events = ctx.settings.events ?? effectiveAutopilot({ autopilot: { mode: 'gated' } }).events;
  let approval = null;
  // No approval is read, let alone consumed, while a stage is open: the agent inside it cannot pass its own gate.
  const stageOpen = openStage(ctx) !== null;
  if (state && !stageOpen && !state.approval && state.stage === 'gate' && (state.stageStatus ?? 'finished') === 'finished' && mode !== 'off' && mode !== 'full') {
    approval = await pendingApproval(ctx, state, events, opts.door);
  }
  const facts = {
    mode, labels, events, approval,
    qaConfigured: qaConfigured(ctx.marker),
    locked: liveLock(ctx.root, opts.id, opts.door),
  };
  let answer = nextStage(state, facts);
  // A verified approval is consumed here: the label goes, the scope freezes, the log says who.
  if (answer.reason === 'approved' && !state.approval) {
    try {
      await consumeApproval(ctx, state, approval, opts.door);
    } catch (err) {
      if (!SCOPE_CODES.includes(err.code)) throw err;
      // The spec or the plan no longer freezes (changed since the packet): the label goes and the gate reposts.
      await voidApproval(ctx, state, { ...approval, detail: err.message }, opts.door);
      answer = { action: 'run', stage: 'gate', reason: 'drift' };
    }
  }
  if (answer.reason === 'drift' && approval && approval.reason === 'drift') await voidApproval(ctx, state, approval, opts.door);
  if (answer.action === 'wait' && answer.reason !== 'locked') await removeRunning(ctx);
  if (answer.action === 'done' || answer.action === 'stop') await removeRunning(ctx);
  // A QA stop opens no pull request, so the report goes on the ticket from here, once.
  if (answer.action === 'stop' && /^qa-/.test(answer.reason) && state?.qa?.report && !state.report?.ticketCommentUrl) {
    await postReport(ctx, opts, state, {}, qaConfigured(ctx.marker), 'qa');
  }
  return { ...answer, ticket: opts.id, mode, approval, state: readState(ctx.root, opts.id) };
}

function qaConfigured(marker) {
  const qa = marker.qa;
  return Boolean(qa && typeof qa === 'object' && qa.urls && Object.values(qa.urls).some((v) => typeof v === 'string' && v.trim()));
}

function readText(file) {
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
}

// The names a scope may use: the code repositories of the marker and `.`, the documents repository.
function knownRepos(ctx) {
  const names = Object.keys(ctx.dirs.repos);
  return names.includes('.') ? names : ['.', ...names];
}

// Freezes the scope from the spec and the plan, removes the approve label, records the approval.
async function consumeApproval(ctx, state, approval, door) {
  const specRepos = scopeFrom(readText(path.join(ctx.root, 'specs', state.ticket, 'Spec.md')));
  const planRepos = scopeFrom(readText(path.join(ctx.root, 'plans', state.ticket, 'Plan.md')));
  const frozen = freezeScope(state, { specRepos, planRepos, knownRepos: knownRepos(ctx) });
  const attribution = approval.attribution ?? 'tracked';
  frozen.approval = { actor: approval.actor, eventId: approval.eventId, at: approval.at, attribution, docsTip: state.packet.docsTip, tips: state.packet.tips };
  writeState(ctx.root, state.ticket, frozen);
  await ctx.tracker.removeLabel(ctx.source.number, ctx.settings.events.approve);
  appendLog(ctx.root, state.ticket, { stage: 'gate', event: 'approved', actor: approval.actor, attribution, trigger: door, repo: 'docs', sha: state.packet.docsTip, url: state.packet.commentUrl });
  commitState(ctx, state.ticket, `chore(${state.ticket}): autopilot approved by ${approval.actor}`);
}

// A new commit since the packet: the label goes, the reviewer is told, the gate reposts.
async function voidApproval(ctx, state, approval, door) {
  await ctx.tracker.removeLabel(ctx.source.number, ctx.settings.events.approve);
  await ctx.tracker.comment(ctx.source.number, `Autopilot for ${state.ticket}: the approval is voided because the branch changed after the packet (${approval.detail}). A new packet follows; approve that one.`);
  appendLog(ctx.root, state.ticket, { stage: 'gate', event: 'voided', actor: 'engine', trigger: door, repo: 'docs', sha: state.packet?.docsTip ?? null });
  // appendLog moved the log head; write the fresh state, not the copy from before the line.
  const fresh = readState(ctx.root, state.ticket) ?? state;
  fresh.approval = null;
  writeState(ctx.root, state.ticket, fresh);
  commitState(ctx, state.ticket, `chore(${state.ticket}): autopilot approval voided`);
}

// The forge that shows the documents repository: its origin remote, else the ticket's own forge
// for a GitHub or GitLab ticket, else none (an Odoo ticket whose documents live off any forge).
function docsForge(ctx) {
  const fromRemote = forgeFor(ctx.dirs.docs);
  if (fromRemote) return fromRemote;
  if (['github', 'gitlab'].includes(ctx.resolution.provider)) return { provider: ctx.resolution.provider, host: ctx.resolution.host, path: ctx.source.path };
  return null;
}

function webBase(ctx) {
  const forge = docsForge(ctx);
  if (!forge) return null;
  return forge.provider === 'gitlab' ? `https://${forge.host}/${forge.path}` : `https://github.com/${forge.path}`;
}

function blobUrl(ctx, sha, file) {
  const base = webBase(ctx);
  if (!base) return `${file} at ${String(sha).slice(0, 7)}`;
  const sep = docsForge(ctx).provider === 'gitlab' ? '/-/blob/' : '/blob/';
  return `${base}${sep}${sha}/${file}`;
}

function compareUrl(ctx, from, to) {
  const base = webBase(ctx);
  if (!base) return `${String(from).slice(0, 7)}...${String(to).slice(0, 7)}`;
  const sep = docsForge(ctx).provider === 'gitlab' ? '/-/compare/' : '/compare/';
  return `${base}${sep}${from}...${to}`;
}

// The gate stage: push the documents branch, post the packet, record it, wait.
async function runPacket(opts) {
  const ctx = context(opts);
  if (ctx.settings.mode === 'off') throw new AutopilotError('mode-off', 'autopilot.mode is off for this project; nothing runs');
  assertNoOpenStage(ctx, 'packet');
  const state = readState(ctx.root, opts.id);
  if (!state) throw new AutopilotError('no-state', `${opts.id} has no autopilot state; run the scaffold, spec and plan stages first`);
  const lock = acquireLock(ctx.root, opts.id, opts.door, opts.pid);
  if (!lock.ok) throw new AutopilotError('locked', `${opts.id} is being run by the ${lock.door} door`);
  try {
    return await postPacket(ctx, opts, state);
  } catch (err) {
    // A packet that fails ends the gate blocked, with the lock and the marker released.
    const message = SCOPE_CODES.includes(err.code)
      ? `the scope cannot be frozen (${err.code}): ${err.message}. Fix the spec or the plan on ${state.docs.branch} and run the gate again`
      : `the packet could not be posted (${err.code ?? 'error'}): ${err.message}`;
    await blockStage(ctx, opts.id, opts.door, 'gate', message);
    throw err;
  }
}

async function postPacket(ctx, opts, state) {
  const previous = state.packet;
  const retry = state.stage === 'gate' && state.stageStatus === 'blocked';
  state.stage = 'gate';
  state.stageStatus = 'running';
  state.attempt = retry ? (state.attempt ?? 1) + 1 : 1;
  const specText = readText(path.join(ctx.root, 'specs', opts.id, 'Spec.md'));
  // The scope is validated before anything is posted: a plan that widens the spec, or names a
  // repository this workspace does not have, blocks the gate here instead of at the approval.
  const preview = previewScope(ctx, state);
  state.scope = { ...state.scope, proposed: preview.frozen.scope.frozen };
  writeState(ctx.root, opts.id, state);
  appendLog(ctx.root, opts.id, { stage: 'gate', event: 'started', actor: 'engine', trigger: opts.door, repo: 'docs' });
  commitState(ctx, opts.id, `chore(${opts.id}): autopilot gate started`);
  push(ctx.dirs.docs, state.docs.branch, { state, repoName: 'docs', ticket: opts.id });
  const docsTip = workTip(ctx.dirs.docs, opts.id, state.docs.branch);
  const ahead = baseAhead(ctx.dirs.docs, state.docs.base);
  state.docs.baseAhead = ahead;
  const tips = {};
  for (const r of state.repos ?? []) {
    const dir = ctx.dirs.repos[r.name];
    if (dir && r.branch) {
      r.tip = tip(dir, r.branch);
      tips[r.name] = r.tip;
    }
  }
  state.docs.tip = docsTip;
  const links = {
    brief: blobUrl(ctx, docsTip, `tasks/${opts.id}/${opts.id}.md`),
    spec: blobUrl(ctx, docsTip, `specs/${opts.id}/Spec.md`),
    plan: blobUrl(ctx, docsTip, `plans/${opts.id}/Plan.md`),
    diff: previous && previous.docsTip && previous.docsTip !== docsTip ? compareUrl(ctx, previous.docsTip, docsTip) : null,
  };
  const repoBases = Object.fromEntries((ctx.marker.repos ?? []).filter((r) => r?.name && r.defaultBranch).map((r) => [r.name, r.defaultBranch]));
  const body = renderPacket(readText(PACKET_TEMPLATE), { state, links, assumptions: assumptionsFrom(specText), events: ctx.settings.events, baseAhead: ahead, repoBases });
  const commentUrl = await ctx.tracker.comment(ctx.source.number, body);
  // The packet time is the tracker's clock, the same clock that stamps the label events.
  const postedAt = (await ctx.tracker.commentTime(commentUrl).catch(() => null)) ?? new Date().toISOString();
  state.packet = { commentUrl, docsTip, tips, postedAt };
  state.approval = null;
  state.stageStatus = 'finished';
  writeState(ctx.root, opts.id, state);
  appendLog(ctx.root, opts.id, { stage: 'gate', event: 'packet-posted', actor: 'engine', trigger: opts.door, repo: 'docs', sha: docsTip, url: commentUrl });
  if (state.mode === 'full') {
    // Full mode: the packet is posted for the record and the run continues. The scope freezes
    // here and the approval is the engine's, so execute and pr find what they require.
    const frozen = preview.frozen;
    const full = readState(ctx.root, opts.id);
    full.scope = frozen.scope;
    full.approval = { mode: 'full', actor: 'engine', eventId: null, at: postedAt, docsTip, tips };
    writeState(ctx.root, opts.id, full);
    appendLog(ctx.root, opts.id, { stage: 'gate', event: 'approved', actor: 'engine', trigger: opts.door, repo: 'docs', sha: docsTip, url: commentUrl, mode: 'full' });
  }
  commitState(ctx, opts.id, `chore(${opts.id}): autopilot packet posted`);
  await removeRunning(ctx);
  clearActiveMarker(ctx.root);
  releaseLock(ctx.root, opts.id);
  return { ticket: opts.id, stage: 'gate', packet: state.packet, lines: body.split('\n').length, mode: state.mode };
}

// The explicit form of the approval check; `next` does the same when it finds one.
async function runApproval(opts) {
  const ctx = context(opts);
  assertNoOpenStage(ctx, 'approval');
  const state = readState(ctx.root, opts.id);
  if (!state || state.stage !== 'gate') throw new AutopilotError('wrong-stage', `${opts.id} is not at the gate`);
  const approval = await pendingApproval(ctx, state, ctx.settings.events, opts.door);
  if (approval.ok && !state.approval) await consumeApproval(ctx, state, approval, opts.door);
  if (!approval.ok && approval.reason === 'drift') await voidApproval(ctx, state, approval, opts.door);
  return { ticket: opts.id, approval, state: readState(ctx.root, opts.id) };
}

// The tracker path of a code repository: its origin URL, else <owner or namespace>/<name>.
// The forge a repository's pull request opens on: its origin remote (spec D5); for a GitHub or
// GitLab ticket, a repository without a usable remote falls back to the ticket source as before.
function forgeOf(ctx, name, dir) {
  const fromRemote = forgeFor(dir);
  if (fromRemote) return fromRemote;
  if (!['github', 'gitlab'].includes(ctx.resolution.provider)) {
    throw new AutopilotError('no-forge', `${name} has no origin remote on a forge; an ${ctx.resolution.provider} ticket opens pull requests on the forge of each repository`);
  }
  const source = (ctx.marker.tickets?.sources ?? []).find((s) => s.prefix === ctx.resolution.prefix) ?? {};
  const base = source.provider === 'gitlab' ? source.namespace : source.owner;
  return { ...ctx.resolution, path: name === 'docs' && ctx.resolution.path ? ctx.resolution.path : `${base}/${name}` };
}

// After the pull requests open, the QA report goes on the ticket and on every pull request, each
// headed by the packet id, the approver and the log head (spec 2026-10-05 §8). Every post is saved
// as it lands, so a stage blocked halfway resumes with the missing ones only.
async function postReport(ctx, opts, state, prs, qaOn, stage = 'pr') {
  state.report = state.report ?? { ticketCommentUrl: null, prComments: {} };
  const logHead = readState(ctx.root, opts.id).logHead ?? '';
  let body;
  if (state.qa?.report) body = readText(path.join(ctx.root, state.qa.report)) || `QA verdict ${state.qa.verdict}; the report at ${state.qa.report} is empty`;
  else body = qaOn ? 'QA: skipped' : 'QA: not configured for this project';
  const text = readText(REPORT_TEMPLATE)
    .replace('{{ID}}', opts.id)
    .replace('{{PACKET_ID}}', packetId(state.packet?.docsTip, state.packet?.tips))
    .replace('{{APPROVER}}', state.approval?.mode === 'full' ? 'nobody (mode full: the packet is the record)' : state.approval?.actor ?? 'n/a')
    .replace('{{LOG_HEAD}}', logHead)
    .replace('{{PR_LINES}}', Object.entries(prs).map(([n, u]) => `- ${n}: ${u}`).join('\n'))
    .replace('{{BODY}}', body.replace(/\n+$/, ''));
  if (!state.report.ticketCommentUrl) {
    state.report.ticketCommentUrl = await ctx.tracker.comment(ctx.source.number, text);
    writeState(ctx.root, opts.id, state);
  }
  for (const [name, prUrl] of Object.entries(prs)) {
    if (state.report.prComments[name] || !prUrl) continue;
    const dir = name === 'docs' ? ctx.dirs.docs : ctx.dirs.repos[name];
    state.report.prComments[name] = await trackerFor(forgeOf(ctx, name, dir), process.env).prComment(prUrl, text);
    writeState(ctx.root, opts.id, state);
  }
  if (!readLog(ctx.root, opts.id).some((l) => l.event === 'report posted')) {
    appendLog(ctx.root, opts.id, { stage, event: 'report posted', actor: 'engine', trigger: opts.door, repo: 'docs', url: state.report.ticketCommentUrl });
    state.logHead = readState(ctx.root, opts.id).logHead;
  }
}

// The last stage: push every branch in scope, one PR per repository plus the documents PR.
async function runPr(opts) {
  const ctx = context(opts);
  assertNoOpenStage(ctx, 'pr');
  const state = readState(ctx.root, opts.id);
  if (!state) throw new AutopilotError('no-state', `${opts.id} has no autopilot state`);
  if (!state.approval || !Array.isArray(state.scope.frozen)) throw new AutopilotError('not-approved', `${opts.id} has no verified approval; the gate has not been passed`);
  const resuming = state.stage === 'pr' && ['running', 'blocked'].includes(state.stageStatus);
  if (!resuming && (!['execute', 'qa'].includes(state.stage) || state.stageStatus !== 'finished')) {
    throw new AutopilotError('wrong-stage', `${opts.id} is at ${state.stage} (${state.stageStatus}); pr follows a finished execute or qa stage`);
  }
  if (state.qa && QA_STOPS.includes(state.qa.verdict)) {
    throw new AutopilotError('qa-failed', `${opts.id} has QA verdict ${state.qa.verdict} (${state.qa.report}); no pull request opens on a failed gate`);
  }
  const qaOn = qaConfigured(ctx.marker);
  if (qaOn && !state.qa) throw new AutopilotError('qa-missing', `${opts.id}: QA is configured for this project and no verdict was recorded; no pull request opens without one`);
  await recheckApproval(ctx, state);
  if (planChangedSince(ctx, state)) throw new AutopilotError('plan-changed', `${opts.id}: specs/${opts.id} or plans/${opts.id} changed after the approval at ${state.approval.docsTip}; the gate must approve them again`);
  const lock = acquireLock(ctx.root, opts.id, opts.door, opts.pid);
  if (!lock.ok) throw new AutopilotError('locked', `${opts.id} is being run by the ${lock.door} door`);
  try {
    return await openPullRequests(ctx, opts, state, { resuming, qaOn });
  } catch (err) {
    // A pull request that fails partway leaves the stage blocked and resumable, never a held lock.
    await blockStage(ctx, opts.id, opts.door, 'pr', `the pull requests could not be opened (${err.code ?? 'error'}): ${err.message}`);
    throw err;
  }
}

async function openPullRequests(ctx, opts, state, { resuming, qaOn }) {
  // Spec §6: without a qa block the QA stage is skipped with a log line (and a note in the PR body).
  if (!state.qa && !qaOn && !readLog(ctx.root, opts.id).some((l) => l.stage === 'qa' && l.event === 'skipped')) {
    appendLog(ctx.root, opts.id, { stage: 'qa', event: 'skipped', actor: 'engine', trigger: opts.door, repo: 'docs', reason: 'no qa block in .agents/ultrapowers.json' });
    state.logHead = readState(ctx.root, opts.id).logHead;
  }
  state.stage = 'pr';
  state.stageStatus = 'running';
  state.attempt = resuming ? (state.attempt ?? 1) + 1 : 1;
  writeState(ctx.root, opts.id, state);
  appendLog(ctx.root, opts.id, { stage: 'pr', event: 'started', actor: 'engine', trigger: opts.door, repo: 'docs' });
  commitState(ctx, opts.id, `chore(${opts.id}): autopilot pr started`);
  const logHead = readState(ctx.root, opts.id).logHead ?? '';
  const ahead = state.docs.baseAhead ?? [];
  const cite = (what) => [
    `Autopilot pull request for ${opts.id}: ${what}.`,
    '',
    `- Packet: ${state.packet?.commentUrl ?? 'none'}`,
    `- Documents tip at approval: ${state.approval?.docsTip ?? state.packet?.docsTip ?? 'none'}`,
    `- Approved by: ${state.approval?.mode === 'full' ? 'nobody (mode full: the packet is the record)' : state.approval?.actor ?? 'n/a'}`,
    `- Stage log head: ${logHead}`,
    state.qa ? `- QA verdict: ${state.qa.verdict} (${state.qa.report})` : '- QA: not configured for this project',
    ...(ahead.length ? [`- Base ${state.docs.base} commits not on origin/${state.docs.base}: ${ahead.join(', ')} (they are in this diff)`] : []),
  ].join('\n');
  const prs = {};
  const title = `${opts.id}: ${state.title || 'autopilot'}`;
  // Code repositories first, so the documents PR can list them. A repository that already has its
  // pull request (a resumed stage) is listed, not opened twice.
  for (const r of state.repos ?? []) {
    if (!state.scope.frozen.includes(r.name) || r.name === '.') continue;
    if (r.prUrl) {
      prs[r.name] = r.prUrl;
      continue;
    }
    const dir = ctx.dirs.repos[r.name];
    const workDir = r.worktree && fs.existsSync(r.worktree) ? r.worktree : dir;
    push(workDir, r.branch, { state, repoName: r.name, ticket: opts.id });
    r.tip = tip(workDir, r.branch);
    const tracker = trackerFor(forgeOf(ctx, r.name, dir), process.env);
    r.prUrl = await tracker.createPr({ head: r.branch, base: r.base, title, body: cite(`the ${r.name} repository`) });
    r.status = 'pr';
    prs[r.name] = r.prUrl;
    writeState(ctx.root, opts.id, state);
  }
  push(ctx.dirs.docs, state.docs.branch, { state, repoName: 'docs', ticket: opts.id });
  if (!state.pr.docs) {
    const docsBody = `${cite('the documents repository')}\n${Object.entries(prs).map(([n, u]) => `- ${n}: ${u}`).join('\n')}`;
    state.pr.docs = await trackerFor(forgeOf(ctx, 'docs', ctx.dirs.docs), process.env).createPr({ head: state.docs.branch, base: state.docs.base, title, body: docsBody });
  }
  prs.docs = state.pr.docs;
  writeState(ctx.root, opts.id, state);
  await postReport(ctx, opts, state, prs, qaOn);
  state.stageStatus = 'finished';
  writeState(ctx.root, opts.id, state);
  appendLog(ctx.root, opts.id, { stage: 'pr', event: 'finished', actor: 'engine', trigger: opts.door, repo: 'docs', sha: tip(ctx.dirs.docs, state.docs.branch), url: state.pr.docs });
  commitState(ctx, opts.id, `chore(${opts.id}): autopilot pull requests opened`);
  push(ctx.dirs.docs, state.docs.branch, { state, repoName: 'docs', ticket: opts.id });
  await ctx.tracker.comment(ctx.source.number, `Autopilot for ${opts.id} opened the pull requests:\n${Object.entries(prs).map(([n, u]) => `- ${n}: ${u}`).join('\n')}`);
  await removeRunning(ctx);
  clearActiveMarker(ctx.root);
  releaseLock(ctx.root, opts.id);
  return { ticket: opts.id, stage: 'pr', prs };
}

// The approval verification of spec §7 against the tracker, as facts for nextStage. D11: the
// developer's own account approves in the session door; the watch door takes the account it
// runs as only when `watchSelfApproval` is set, because an unattended stage holds that account.
async function pendingApproval(ctx, state, events, door = 'command') {
  if (!state.packet) return { ok: false, reason: 'no-packet', detail: 'no packet has been posted' };
  const eventsList = await ctx.tracker.labelEvents(ctx.source.number);
  const tips = { docs: workTip(ctx.dirs.docs, state.ticket, state.docs.branch), repos: {} };
  for (const r of state.repos ?? []) {
    const dir = r.worktree && fs.existsSync(r.worktree) ? r.worktree : ctx.dirs.repos[r.name];
    tips.repos[r.name] = dir && r.branch ? tip(dir, r.branch) : null;
  }
  const verdict = await verifyApproval({
    events: eventsList, approveLabel: events.approve, packet: state.packet,
    permissionOf: (login) => ctx.tracker.permission(login), approvers: ctx.settings.approvers ?? [], tips,
  });
  if (verdict.ok && door === 'watch') {
    // The self check fails closed: an engine account that cannot be read is treated as the actor.
    const me = await ctx.tracker.me().catch(() => null);
    if (me === null) return { ok: false, reason: 'self-watch-unverified', detail: 'the account the watcher runs as could not be read from the tracker, so the approval cannot be told apart from the engine\'s own' };
    if (verdict.actor === me) {
      if (!ctx.settings.watchSelfApproval) {
        return { ok: false, reason: 'self-watch', detail: `${me} is the account the watcher runs as; approve from another account, or set autopilot.watchSelfApproval to true` };
      }
      if (!stageTokensConfigured()) {
        return { ok: false, reason: 'self-watch-no-stage-tokens', detail: `${me} is the account the watcher runs as; watchSelfApproval counts only when the stages hold their own read-only token (ULTRAPOWERS_STAGE_GH_TOKEN or ULTRAPOWERS_STAGE_GITLAB_TOKEN)` };
      }
    }
  }
  return verdict;
}

// Odoo has one key, ODOO_API_KEY, for the engine and the stages alike: the stage keeps it, so
// the project's Odoo MCP server works inside the stage, and the guardrail denies tracker writes.
const STAGE_TOKEN_VARS = ['ULTRAPOWERS_STAGE_GH_TOKEN', 'ULTRAPOWERS_STAGE_GITLAB_TOKEN'];

function stageTokensConfigured() {
  return STAGE_TOKEN_VARS.some((k) => Boolean(process.env[k]));
}

// A control label counts only when a member with write access (and, when the list is set, an
// approver) added it last: the mode labels and the watcher's start label, like the approval.
async function labelAddedByPermitted(tracker, number, label, settings) {
  const events = await tracker.labelEvents(number);
  const last = events.filter((e) => e.label === label).sort((a, b) => String(a.at).localeCompare(String(b.at))).at(-1);
  if (!last || last.action !== 'labeled' || !last.actor) return false;
  const permission = await tracker.permission(last.actor);
  if (!['write', 'maintain', 'admin'].includes(permission)) return false;
  const approvers = settings.approvers ?? [];
  return approvers.length === 0 || approvers.includes(last.actor);
}

// The ticket's labels with the mode labels that an unpermitted account added removed.
async function permittedLabels(ctx) {
  const labels = await labelsOf(ctx);
  const out = [];
  for (const label of labels) {
    if (!/^up:mode:/.test(label)) {
      out.push(label);
      continue;
    }
    if (await labelAddedByPermitted(ctx.tracker, ctx.source.number, label, ctx.settings)) out.push(label);
  }
  return out;
}

async function runBegin(opts) {
  const ctx = context(opts);
  if (ctx.settings.mode === 'off') throw new AutopilotError('mode-off', 'autopilot.mode is off for this project; nothing runs');
  // An open stage may re-enter itself (a retry inside the same session); no other stage may start.
  const open = openStage(ctx);
  if (open && !(open.ticket === opts.id && open.stage === opts.stage)) assertNoOpenStage(ctx, `begin ${opts.stage}`);
  const lock = acquireLock(ctx.root, opts.id, opts.door, opts.pid);
  if (!lock.ok) throw new AutopilotError('locked', `${opts.id} is being run by the ${lock.door} door${lock.pid ? ` (pid ${lock.pid})` : ''}`);
  let state = readState(ctx.root, opts.id);
  let pending = null;
  if (!state) {
    if (opts.stage !== 'scaffold') {
      releaseLock(ctx.root, opts.id);
      throw new AutopilotError('no-state', `${opts.id} has no autopilot state; the first stage is scaffold`);
    }
    const title = await ctx.tracker.title(ctx.source.number);
    const labels = await permittedLabels(ctx);
    const mode = modeFor(ctx.marker.autopilot, { arg: opts.mode, labels });
    const base = ctx.settings.baseBranch ?? remoteHead(ctx.dirs.docs);
    const branch = branchName(opts.id, title);
    pending = initialState({ id: opts.id, mode, source: ctx.source, docsBranch: branch, docsBase: base, title });
    pending.stageStatus = 'running';
    pending.door = opts.door;
    ensureBranch(ctx.dirs.docs, branch, base);
    // The state is written at end: tasks/<ID> must not exist before new-task runs.
    const lockFile = lockPath(ctx.root, opts.id);
    fs.writeFileSync(lockFile, JSON.stringify({ ...JSON.parse(fs.readFileSync(lockFile, 'utf8')), pending }));
    state = pending;
  } else {
    if (state.stage === opts.stage && ['running', 'blocked'].includes(state.stageStatus)) state.attempt = (state.attempt ?? 1) + 1;
    else state.attempt = 1;
    state.stage = opts.stage;
    state.stageStatus = 'running';
    state.door = opts.door;
    if (opts.stage === 'execute') {
      // The state file is not the gate: a frozen scope counts only with the approval that froze
      // it, and that approval is checked against the tracker again before any work starts.
      if (!state.approval || !Array.isArray(state.scope.frozen)) {
        releaseLock(ctx.root, opts.id);
        throw new AutopilotError('not-approved', `${opts.id} has no verified approval; execute follows one`);
      }
      try {
        await recheckApproval(ctx, state);
      } catch (err) {
        releaseLock(ctx.root, opts.id);
        throw err;
      }
      prepareWorktrees(ctx, state);
    }
    writeState(ctx.root, opts.id, state);
    appendLog(ctx.root, opts.id, { stage: opts.stage, event: 'started', actor: 'engine', trigger: opts.door, repo: 'docs' });
    if (opts.stage === 'changes' && !ctx.inside) await takeChangesLabel(ctx, opts.id, opts.door);
    commitState(ctx, opts.id, `chore(${opts.id}): autopilot ${opts.stage} started`);
  }
  writeActiveMarker(ctx.root, { ticket: opts.id, branch: state.docs.branch, scope: Array.isArray(state.scope.frozen) ? state.scope.frozen : [], stage: opts.stage });
  if (!ctx.inside) await markRunning(ctx);
  const worktrees = Object.fromEntries((state.repos ?? []).filter((r) => r.worktree).map((r) => [r.name, r.worktree]));
  return { ticket: opts.id, stage: opts.stage, attempt: state.attempt, branch: state.docs.branch, mode: state.mode, door: opts.door, docs: ctx.dirs.docs, repos: ctx.dirs.repos, worktrees };
}

// One ticket branch per frozen code repository, in a worktree of that clone. Root topology has none.
function prepareWorktrees(ctx, state) {
  const markerRepos = Array.isArray(ctx.marker.repos) ? ctx.marker.repos : [];
  state.repos = state.repos ?? [];
  for (const name of state.scope.frozen) {
    if (name === '.') continue;
    const dir = ctx.dirs.repos[name];
    if (!dir || !fs.existsSync(dir)) throw new AutopilotError('unknown-repo', `${name} is not a clone of this workspace`);
    const entry = markerRepos.find((r) => r.name === name) ?? {};
    const base = entry.defaultBranch || remoteHead(dir);
    const worktree = ensureWorktree(dir, state.docs.branch, base);
    let r = state.repos.find((x) => x.name === name);
    if (!r) {
      r = { name, branch: state.docs.branch, base, tip: null, status: 'pending', prUrl: null, worktree };
      state.repos.push(r);
    }
    r.branch = state.docs.branch;
    r.base = base;
    r.worktree = worktree;
    r.tip = tip(worktree, state.docs.branch);
  }
}

async function runEnd(opts) {
  const ctx = context(opts);
  const result = opts.result;
  let state = readState(ctx.root, opts.id);
  const lock = readLock(ctx.root, opts.id);
  let firstWrite = false;
  if (!state) {
    if (!lock?.pending) throw new AutopilotError('no-state', `${opts.id} has no autopilot state and no pending scaffold`);
    state = lock.pending;
    firstWrite = true;
  }
  if (state.stage !== opts.stage) throw new AutopilotError('wrong-stage', `${opts.id} is at stage ${state.stage}, not ${opts.stage}`);
  let ok = result.ok !== false;
  let message = typeof result.message === 'string' && result.message ? result.message : null;
  if (typeof result.title === 'string' && result.title) state.title = result.title;
  if (Array.isArray(result.scope)) state.scope = { ...state.scope, proposed: result.scope.filter((s) => typeof s === 'string') };
  let verdict = null;
  if (opts.stage === 'qa') {
    // The verdict is read from the committed report, not taken from the result: the gate fails
    // closed when QA is configured and no committed report carries a Verdict line.
    const report = typeof result.report === 'string' && result.report ? result.report : `reviews/${opts.id}/QA-REPORT.md`;
    verdict = committedVerdict(ctx, report);
    if (!verdict && !qaConfigured(ctx.marker) && typeof result.verdict === 'string') verdict = result.verdict;
    if (verdict) state.qa = { verdict, report };
    else if (qaConfigured(ctx.marker) && ok) {
      ok = false;
      message = `qa-missing: no committed ${report} with a Verdict line; the QA gate fails closed`;
    }
  }
  if (opts.stage === 'execute' && ok && planChangedSince(ctx, state)) {
    ok = false;
    message = `plan-changed: specs/${opts.id} or plans/${opts.id} changed after the approval at ${state.approval.docsTip}; the gate must approve them again`;
  }
  // The run marker is the envelope's switch. A stage that ends without it had no guardrail for
  // part of its run, whatever removed the file; the stage is blocked and the reason is on the ticket.
  if (ok && !readActiveMarker(ctx.root)) {
    ok = false;
    message = `the run marker .ultrapowers/autopilot-active was removed during the ${opts.stage} stage; the guardrail was off for part of it, so the stage is blocked for review`;
  }
  state.stageStatus = ok ? 'finished' : 'blocked';
  if (firstWrite) {
    writeState(ctx.root, opts.id, state);
    appendLog(ctx.root, opts.id, { at: lock.startedAt, stage: opts.stage, event: 'started', actor: 'engine', trigger: lock.door ?? 'command', repo: 'docs' });
  }
  for (const r of state.repos ?? []) {
    const dir = r.worktree && fs.existsSync(r.worktree) ? r.worktree : ctx.dirs.repos[r.name];
    if (dir && r.branch) r.tip = tip(dir, r.branch);
  }
  writeState(ctx.root, opts.id, state);
  // One commit carries the stage's work under tasks/<ID> plus the state; a second, state-only
  // commit records the work tip and the log line. Bookkeeping commits never move the work tip.
  commitState(ctx, opts.id, `chore(${opts.id}): autopilot ${opts.stage} ${ok ? 'finished' : 'blocked'}`);
  state.docs.tip = workTip(ctx.dirs.docs, opts.id);
  writeState(ctx.root, opts.id, state);
  appendLog(ctx.root, opts.id, {
    stage: opts.stage, event: ok ? 'finished' : 'blocked', actor: result.actor ?? 'agent', trigger: state.door ?? opts.door, repo: 'docs', sha: state.docs.tip,
  });
  commitState(ctx, opts.id, `chore(${opts.id}): autopilot state`);
  clearActiveMarker(ctx.root);
  releaseLock(ctx.root, opts.id);
  if (!ok) {
    message = message ?? `the ${opts.stage} stage did not finish`;
    if (ctx.inside) {
      // The watcher reports it after the stage, with the credential that may write.
      const s = readState(ctx.root, opts.id);
      s.blockedMessage = message;
      writeState(ctx.root, opts.id, s);
    } else {
      await reportBlocked(ctx, opts.id, opts.stage, state.attempt ?? 1, message);
    }
  }
  return { ticket: opts.id, stage: opts.stage, status: state.stageStatus, tip: state.docs.tip, attempt: state.attempt ?? 1, ...(opts.stage === 'qa' ? { verdict } : {}) };
}

// The Verdict line of a QA report as committed on HEAD of the documents branch; null when the
// file is not committed or carries no verdict.
function committedVerdict(ctx, report) {
  const r = git(ctx.dirs.docs, ['show', `HEAD:${report.replace(/\\/g, '/')}`]);
  if (!r.ok) return null;
  const m = /^\s*\**\s*verdict\s*\**\s*:\s*\**\s*([A-Z][A-Z-]+)/im.exec(r.stdout);
  return m ? m[1].toUpperCase() : null;
}

// The environment a headless stage runs in. The stage never needs to write to the tracker or to
// push: the engine does both between stages. When the service provides stage credentials
// (ULTRAPOWERS_STAGE_GH_TOKEN, ULTRAPOWERS_STAGE_GITLAB_TOKEN; read-only tokens), the stage gets
// those and nothing else: the engine's tokens are removed and gh and glab see an empty config
// directory, so a stage steered into labelling a ticket has nothing to do it with. Without stage
// credentials the stage shares the engine's, as before, and the guardrail is the brake. Git
// never prompts, and the git credential helper is reset so a pushed-by-hand attempt finds none.
function stageEnvironment(root) {
  const env = { ...process.env, ULTRAPOWERS_AUTOPILOT_INSIDE: '1', GIT_TERMINAL_PROMPT: '0' };
  const noAuth = path.join(root, '.ultrapowers', 'autopilot', 'no-auth');
  const stageGh = process.env.ULTRAPOWERS_STAGE_GH_TOKEN;
  const stageGl = process.env.ULTRAPOWERS_STAGE_GITLAB_TOKEN;
  if (stageGh || stageGl) {
    // The engine's tokens, and the ssh agent: a push over ssh would not need a token at all.
    // ODOO_API_KEY stays: it is the one Odoo key, and the project's Odoo MCP server reads it.
    for (const k of ['GH_TOKEN', 'GITHUB_TOKEN', 'GH_ENTERPRISE_TOKEN', 'GITHUB_ENTERPRISE_TOKEN', 'GITLAB_TOKEN', 'GLAB_TOKEN', 'OAUTH_TOKEN', 'SSH_AUTH_SOCK', 'GIT_SSH_COMMAND', 'GIT_SSH']) delete env[k];
    for (const d of ['gh', 'glab']) fs.mkdirSync(path.join(noAuth, d), { recursive: true });
    env.GH_CONFIG_DIR = path.join(noAuth, 'gh');
    env.GLAB_CONFIG_DIR = path.join(noAuth, 'glab');
    if (stageGh) env.GH_TOKEN = stageGh;
    if (stageGl) env.GITLAB_TOKEN = stageGl;
    const n = Number.parseInt(env.GIT_CONFIG_COUNT ?? '0', 10) || 0;
    env[`GIT_CONFIG_KEY_${n}`] = 'credential.helper';
    env[`GIT_CONFIG_VALUE_${n}`] = '';
    env.GIT_CONFIG_COUNT = String(n + 1);
  }
  return env;
}

// Only the MCP servers the project lists load into a headless stage: the user's own connectors
// (a tracker among them) stay out. Without a project .mcp.json, none loads.
function mcpConfigArgs(root) {
  const project = path.join(root, '.mcp.json');
  let file = project;
  if (!fs.existsSync(project)) {
    file = path.join(root, '.ultrapowers', 'autopilot', 'mcp-none.json');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, '{"mcpServers":{}}\n');
  }
  return ['--strict-mcp-config', '--mcp-config', file];
}

// One headless harness call; resolves { code, timedOut, stdout, stderr }.
function spawnHarness(name, prompt, cwd, root = cwd) {
  const adapter = HARNESSES[name];
  if (!adapter) throw new AutopilotError('bad-autopilot', `autopilot.harness ${name} has no headless adapter; ${Object.keys(HARNESSES).join(', ')} do`);
  const override = process.env[adapter.env];
  const command = override || adapter.bin;
  const script = /\.[cm]?js$/i.test(command);
  const args = [...adapter.args(prompt, maxTurns(), { pluginRoot: PLUGIN_ROOT }), ...(name === 'claude-code' ? mcpConfigArgs(root) : [])];
  const [file, argv] = script ? [process.execPath, [command, ...args]] : [command, args];
  const env = stageEnvironment(root);
  return new Promise((resolve) => {
    execFile(file, argv, { cwd, env, timeout: stageTimeoutMs(), windowsHide: true, maxBuffer: 64 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (!error) return resolve({ code: 0, timedOut: false, stdout: String(stdout ?? ''), stderr: String(stderr ?? '') });
      if (error.code === 'ENOENT') return resolve({ code: 127, timedOut: false, stdout: '', stderr: `${adapter.bin} is not on PATH (${file})` });
      return resolve({ code: typeof error.code === 'number' ? error.code : 1, timedOut: Boolean(error.killed), stdout: String(stdout ?? ''), stderr: String(stderr ?? error.message) });
    });
  });
}

// The watcher door: one fresh headless harness call per agent stage, the engine steps in
// process, until the ticket waits, is done or stops. Exit 0 on wait or done, 3 on stop.
// A harness whose stages do not run inside the guardrail has no brake at all in the watcher, so
// the watcher refuses it (harnesses.mjs names them).
function assertGuardedHarness(settings) {
  if (GUARDED_HARNESSES.includes(settings.harness)) return;
  throw new AutopilotError('harness-unguarded', `autopilot.harness ${settings.harness} has no guardrail in the watcher door yet; run its tickets from a session with /ultrapowers:autopilot <ID>, or set harness to ${GUARDED_HARNESSES.join(' or ')}`);
}

// A watcher's stages hold their own read-only tokens (D13). Without them a stage holds the
// engine's write token, so the watcher refuses to start unless the project says so in writing.
// The rule holds for an Odoo project too: its one key is shared by design, but the forge token
// and the CLI logins the stage would inherit still need either a stage token or the project's
// written sharedCredentials.
function assertStageCredentials(settings) {
  if (stageTokensConfigured() || settings.watch?.sharedCredentials) return;
  throw new AutopilotError('stage-credentials-missing', `the watcher starts only with read-only stage tokens in its environment (${STAGE_TOKEN_VARS.join(', ')}); to run its stages with the engine's own credentials, set autopilot.watch.sharedCredentials to true`);
}

async function runRun(opts) {
  const base = { ...opts, door: 'watch', pid: process.pid };
  const ctx = context(base);
  assertGuardedHarness(ctx.settings);
  assertStageCredentials(ctx.settings);
  const stages = [];
  const seen = {};
  let final = null;
  try {
    final = await runStages(ctx, base, opts, stages, seen);
  } catch (err) {
    // Whatever failed, the watcher's lock and the marker never outlive the run.
    clearActiveMarker(ctx.root);
    releaseLock(ctx.root, opts.id);
    throw err;
  }
  releaseLock(ctx.root, opts.id);
  const result = { ticket: opts.id, door: 'watch', stages, final };
  result.exitCode = final.action === 'stop' ? 3 : 0;
  return result;
}

async function runStages(ctx, base, opts, stages, seen) {
  let final = null;
  for (;;) {
    const answer = await runNext(base);
    if (answer.action !== 'run') {
      final = { action: answer.action, reason: answer.reason };
      break;
    }
    // A stage that keeps coming back is a loop, not progress: each pass is a model session.
    seen[answer.stage] = (seen[answer.stage] ?? 0) + 1;
    if (seen[answer.stage] > MAX_STAGE_REPEATS) {
      final = { action: 'stop', reason: 'stage-repeated', stage: answer.stage };
      break;
    }
    const lock = acquireLock(ctx.root, opts.id, 'watch', process.pid);
    if (!lock.ok) {
      final = { action: 'wait', reason: 'locked' };
      break;
    }
    const stage = answer.stage;
    if (stage === 'gate' || stage === 'pr') {
      // An engine stage that fails has already blocked itself; the loop decides what follows.
      try {
        await (stage === 'gate' ? runPacket(base) : runPr(base));
        stages.push({ stage, ok: true });
      } catch (err) {
        if (!(err instanceof AutopilotError)) throw err;
        stages.push({ stage, ok: false, code: err.code, message: err.message });
      }
    } else {
      const started = Date.now();
      // The watcher makes the tracker writes around the stage: the stage may hold a read-only credential.
      await markRunning(ctx);
      if (stage === 'changes') await takeChangesLabel(ctx, opts.id, 'watch');
      const spawned = await spawnHarness(ctx.settings.harness, stagePrompt(stage, opts.id), ctx.dirs.docs, ctx.root);
      const state = readState(ctx.root, opts.id);
      const pending = readLock(ctx.root, opts.id)?.pending;
      const ended = state ? state.stage === stage && state.stageStatus !== 'running' : false;
      let ok = spawned.code === 0 && ended;
      let message = null;
      if (ended && state.stageStatus === 'blocked' && state.blockedMessage) {
        // `end` inside the stage recorded the reason; the report is made from here.
        await reportBlocked(ctx, opts.id, stage, state.attempt ?? 1, state.blockedMessage);
        const s = readState(ctx.root, opts.id);
        delete s.blockedMessage;
        writeState(ctx.root, opts.id, s);
      }
      if (!ended) {
        message = spawned.timedOut
          ? `the ${stage} stage timed out after ${stageTimeoutMs()} ms and was killed`
          : spawned.code !== 0
            ? `the harness exited ${spawned.code} before ending the ${stage} stage: ${spawned.stderr.trim().split('\n').slice(-3).join(' ') || 'no output'}`
            : `the harness exited without ending the ${stage} stage`;
        try {
          // A harness that died before `begin` left no stage open: open and close it here, so
          // the ticket still ends blocked with its label and its comment.
          if (!state && !pending) await runBegin({ ...base, stage });
          await runEnd({ ...base, stage, result: { ok: false, message, actor: 'engine' } });
        } catch (err) {
          message = `${message}; and the stage could not be closed: ${err.message}`;
          clearActiveMarker(ctx.root);
        }
        ok = false;
      } else if (state.stageStatus === 'blocked') {
        ok = false;
        message = `the ${stage} stage ended blocked`;
      }
      stages.push({ stage, ok, exitCode: spawned.code, seconds: Math.round((Date.now() - started) / 1000), ...(message ? { message } : {}) });
    }
    if (opts.once) {
      const after = await runNext(base).catch((err) => ({ action: 'stop', reason: err.code ?? 'error' }));
      final = { action: after.action, reason: after.reason, once: true };
      break;
    }
  }
  return final;
}

function sleep(ms) {
  return new Promise((resolve) => { setTimeout(resolve, ms); });
}

// One cycle of the watcher door (spec section 8): the kill switch, the labelled tickets of every
// source with a default project, skip the locked ones, run the rest in turn, and the next sleep.
async function watchCycle(root, marker, settings, opts, previousSleepMs) {
  const events = [];
  const baseSleep = settings.watch.intervalSec * 1000;
  if (fs.existsSync(path.join(root, '.ultrapowers', 'autopilot-stop'))) {
    events.push({ event: 'idle', reason: 'autopilot-stop' });
    return { events, nextSleepMs: baseSleep };
  }
  const sources = (marker.tickets?.sources ?? []).filter((s) => s && ['github', 'gitlab', 'odoo'].includes(s.provider));
  const queue = [];
  let failed = false;
  for (const source of sources) {
    if (!source.defaultProject) {
      events.push({ event: 'unwatched', source: source.prefix, reason: `${source.prefix} has no defaultProject; run its tickets from a session with /ultrapowers:autopilot <ID>` });
      continue;
    }
    let resolution;
    try {
      resolution = resolveTicket(marker, `${source.prefix}-1`);
    } catch (err) {
      events.push({ event: 'unwatched', source: source.prefix, reason: err.message });
      continue;
    }
    const tracker = trackerFor(resolution, process.env);
    try {
      // `ready` is the only start signal (spec §7): a ticket that carries approve or changes but
      // has no state here was never started by this engine, and is left alone.
      for (const label of [settings.events.ready, settings.events.approve, settings.events.changes]) {
        for (const item of await tracker.listTickets(label)) {
          const id = `${source.prefix}-${item.number}`;
          if (label !== settings.events.ready && !readState(root, id)) continue;
          // The start label counts like the approval: a member with write access added it.
          if (label === settings.events.ready && !readState(root, id) && !(await labelAddedByPermitted(tracker, item.number, label, settings))) {
            events.push({ event: 'skip', ticket: id, reason: 'ready-label-not-from-a-member-with-write-access' });
            continue;
          }
          if (!queue.some((q) => q.id === id)) queue.push({ id, number: item.number, tracker });
        }
      }
    } catch (err) {
      failed = true;
      events.push({ event: 'tracker-error', source: source.prefix, code: err.code ?? 'error', message: err.message });
    }
  }
  events.push({ event: 'cycle', tickets: queue.map((q) => q.id) });
  let ran = 0;
  for (const item of queue) {
    if (ran >= settings.watch.maxConcurrent) break;
    const held = liveLock(root, item.id, 'watch');
    if (held) {
      events.push({ event: 'skip', ticket: item.id, reason: 'locked', door: held.door, pid: held.pid ?? null });
      continue;
    }
    try {
      // `--once` bounds the watcher's cycles, not a ticket's stages: each ticket runs to wait, done or stop.
      const result = await runRun({ ...opts, id: item.id, root, once: false });
      ran += 1;
      if (readState(root, item.id)) await item.tracker.removeLabel(item.number, settings.events.ready).catch(() => {});
      events.push({ event: 'ran', ticket: item.id, final: result.final, stages: result.stages });
    } catch (err) {
      ran += 1;
      events.push({ event: 'error', ticket: item.id, code: err.code ?? 'error', message: err.message });
    }
  }
  const nextSleepMs = failed ? Math.min(Math.max(previousSleepMs, baseSleep) * 2, BACKOFF_CAP_MS) : baseSleep;
  events.push({ event: 'sleep', nextSleepMs });
  return { events, nextSleepMs };
}

// The watcher door: cycles until stopped. `--once` runs one cycle and returns it.
async function runWatch(opts) {
  const root = opts.root ? path.resolve(opts.root) : findRoot(process.cwd());
  if (!fs.existsSync(path.join(root, MARKER))) throw new AutopilotError('no-marker', `no ${MARKER.replace(/\\/g, '/')} in ${root}`);
  const marker = readMarker(root);
  const settings = effectiveAutopilot(marker);
  loadSecretsFile(root, process.env);
  if (settings.mode !== 'off') {
    assertGuardedHarness(settings);
    assertStageCredentials(settings);
  }
  if (settings.mode === 'off') {
    const events = [{ event: 'idle', reason: 'mode-off' }];
    if (opts.once) return { root, events, nextSleepMs: 0 };
    process.stdout.write(`${JSON.stringify(events[0])}\n`);
    return { root, events, nextSleepMs: 0 };
  }
  let previousSleepMs = Number(process.env.ULTRAPOWERS_AUTOPILOT_SLEEP_MS) || settings.watch.intervalSec * 1000;
  for (;;) {
    const cycle = await watchCycle(root, marker, settings, opts, previousSleepMs);
    if (opts.once) return { root, ...cycle };
    for (const e of cycle.events) process.stdout.write(`${JSON.stringify({ at: new Date().toISOString(), ...e })}\n`);
    previousSleepMs = cycle.nextSleepMs;
    await sleep(cycle.nextSleepMs);
  }
}

export async function main(argv) {
  try {
    const opts = parseArgs(argv);
    const runners = { status: runStatus, next: runNext, begin: runBegin, end: runEnd, packet: runPacket, approval: runApproval, pr: runPr, run: runRun, watch: runWatch };
    const result = await runners[opts.command](opts);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (opts.command === 'run') return result.exitCode;
    return 0;
  } catch (err) {
    if (err instanceof AutopilotError || err instanceof TicketError) {
      process.stdout.write(`${JSON.stringify({ error: { code: err.code, message: err.message } }, null, 2)}\n`);
      return 2;
    }
    process.stderr.write(`${err.stack ?? err}\n`);
    return 1;
  }
}

process.exitCode = await main(process.argv.slice(2));
