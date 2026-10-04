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
import { resolveTicket, TicketError } from '../../new-task/scripts/ticket-sources.mjs';
import { fileURLToPath } from 'node:url';
import {
  AutopilotError, STAGES, effectiveAutopilot, modeFor, branchName, initialState,
  readState, writeState, appendLog, readLog, verifyChain,
  nextStage, acquireLock, releaseLock, liveLock, readLock, lockPath,
  writeActiveMarker, clearActiveMarker, verifyApproval,
  renderPacket, assumptionsFrom, scopeFrom, freezeScope, pushAllowed,
} from './autopilot-lib.mjs';
import { trackerFor } from './tracker.mjs';
import { ensureBranch, ensureWorktree, remoteHead, remotePath, tip, workTip, commitPaths, push, repoDirs } from './repos.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PACKET_TEMPLATE = path.join(HERE, '..', 'templates', 'packet.md');
const MARKER = path.join('.agents', 'ultrapowers.json');
const COMMANDS = ['status', 'next', 'begin', 'end', 'packet', 'approval', 'pr'];
const DOORS = ['command', 'watch'];
const FLAGS = { '--root': 'root', '--mode': 'mode', '--door': 'door', '--result': 'result', '--pid': 'pid' };

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
  const [command, id, ...rest] = argv;
  const opts = { command, id, stage: null, root: null, mode: null, door: 'command', result: null, pid: null };
  let i = 0;
  if ((command === 'begin' || command === 'end') && rest[0] && !rest[0].startsWith('--')) {
    opts.stage = rest[0];
    i = 1;
  }
  for (; i < rest.length; i += 1) {
    const flag = rest[i];
    const value = rest[i + 1];
    if (!(flag in FLAGS)) throw new AutopilotError('bad-args', `unknown argument ${flag}`);
    if (value === undefined) throw new AutopilotError('bad-args', `${flag} needs a value`);
    opts[FLAGS[flag]] = value;
    i += 1;
  }
  if (!COMMANDS.includes(command) || !id) {
    throw new AutopilotError('bad-args', `usage: autopilot.mjs ${COMMANDS.join('|')} <ID> [<stage>] [--root <dir>] [--mode off|gated|full] [--door command|watch] [--result <json>]`);
  }
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
  if (/[/\\]|\.\./.test(opts.id)) throw new AutopilotError('bad-ticket', `${opts.id} names a path; a ticket id holds no "/", "\\" or ".."`);
  const root = opts.root ? path.resolve(opts.root) : findRoot(process.cwd());
  if (!fs.existsSync(path.join(root, MARKER))) throw new AutopilotError('no-marker', `no ${MARKER.replace(/\\/g, '/')} in ${root}`);
  const marker = readMarker(root);
  const settings = effectiveAutopilot(marker);
  const resolution = resolveTicket(marker, opts.id);
  if (resolution.provider === 'local') {
    throw new AutopilotError('local-ticket', `${opts.id} is a local ticket; autopilot runs tickets from a configured GitHub or GitLab source. Use /ultrapowers:new-task ${opts.id} for the manual flow`);
  }
  if (!['github', 'gitlab'].includes(resolution.provider)) {
    throw new AutopilotError('no-writeback', `${resolution.provider} tickets have no write-back in this version; GitHub and GitLab do`);
  }
  const tracker = trackerFor(resolution, process.env);
  const source = { provider: resolution.provider, path: resolution.path, number: resolution.number };
  return { root, marker, settings, resolution, source, tracker, dirs: repoDirs(root, marker) };
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
  const labels = await labelsOf(ctx);
  const block = ctx.marker.autopilot ?? { mode: 'off' };
  const mode = modeFor(block, { arg: opts.mode, labels });
  const events = ctx.settings.events ?? effectiveAutopilot({ autopilot: { mode: 'gated' } }).events;
  let approval = null;
  if (state && state.stage === 'gate' && (state.stageStatus ?? 'finished') === 'finished' && mode !== 'off' && mode !== 'full') {
    approval = await pendingApproval(ctx, state, events);
  }
  const facts = {
    mode, labels, events, approval,
    qaConfigured: qaConfigured(ctx.marker),
    locked: liveLock(ctx.root, opts.id, opts.door),
  };
  const answer = nextStage(state, facts);
  // A verified approval is consumed here: the label goes, the scope freezes, the log says who.
  if (answer.reason === 'approved' && !state.approval) await consumeApproval(ctx, state, approval, opts.door);
  if (answer.reason === 'drift' && approval && approval.reason === 'drift') await voidApproval(ctx, state, approval, opts.door);
  if (answer.action === 'wait' && answer.reason !== 'locked') await removeRunning(ctx);
  if (answer.action === 'done' || answer.action === 'stop') await removeRunning(ctx);
  return { ...answer, ticket: opts.id, mode, approval, state: readState(ctx.root, opts.id) };
}

function qaConfigured(marker) {
  const qa = marker.qa;
  return Boolean(qa && typeof qa === 'object' && qa.urls && Object.values(qa.urls).some((v) => typeof v === 'string' && v.trim()));
}

function readText(file) {
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
}

function knownRepos(ctx) {
  return Object.keys(ctx.dirs.repos);
}

// Freezes the scope from the spec and the plan, removes the approve label, records the approval.
async function consumeApproval(ctx, state, approval, door) {
  const specRepos = scopeFrom(readText(path.join(ctx.root, 'specs', state.ticket, 'Spec.md')));
  const planRepos = scopeFrom(readText(path.join(ctx.root, 'plans', state.ticket, 'Plan.md')));
  const frozen = freezeScope(state, { specRepos, planRepos, knownRepos: knownRepos(ctx) });
  frozen.approval = { actor: approval.actor, eventId: approval.eventId, at: approval.at, docsTip: state.packet.docsTip, tips: state.packet.tips };
  writeState(ctx.root, state.ticket, frozen);
  await ctx.tracker.removeLabel(ctx.source.number, ctx.settings.events.approve);
  appendLog(ctx.root, state.ticket, { stage: 'gate', event: 'approved', actor: approval.actor, trigger: door, repo: 'docs', sha: state.packet.docsTip, url: state.packet.commentUrl });
  commitState(ctx, state.ticket, `chore(${state.ticket}): autopilot approved by ${approval.actor}`);
}

// A new commit since the packet: the label goes, the reviewer is told, the gate reposts.
async function voidApproval(ctx, state, approval, door) {
  await ctx.tracker.removeLabel(ctx.source.number, ctx.settings.events.approve);
  await ctx.tracker.comment(ctx.source.number, `Autopilot for ${state.ticket}: the approval is voided because the branch changed after the packet (${approval.detail}). A new packet follows; approve that one.`);
  appendLog(ctx.root, state.ticket, { stage: 'gate', event: 'voided', actor: 'engine', trigger: door, repo: 'docs', sha: state.packet?.docsTip ?? null });
  state.approval = null;
  writeState(ctx.root, state.ticket, state);
  commitState(ctx, state.ticket, `chore(${state.ticket}): autopilot approval voided`);
}

function webBase(ctx) {
  const { provider, host } = ctx.resolution;
  return provider === 'gitlab' ? `https://${host}/${ctx.source.path}` : `https://github.com/${ctx.source.path}`;
}

function blobUrl(ctx, sha, file) {
  const sep = ctx.resolution.provider === 'gitlab' ? '/-/blob/' : '/blob/';
  return `${webBase(ctx)}${sep}${sha}/${file}`;
}

function compareUrl(ctx, from, to) {
  const sep = ctx.resolution.provider === 'gitlab' ? '/-/compare/' : '/compare/';
  return `${webBase(ctx)}${sep}${from}...${to}`;
}

// The gate stage: push the documents branch, post the packet, record it, wait.
async function runPacket(opts) {
  const ctx = context(opts);
  if (ctx.settings.mode === 'off') throw new AutopilotError('mode-off', 'autopilot.mode is off for this project; nothing runs');
  const state = readState(ctx.root, opts.id);
  if (!state) throw new AutopilotError('no-state', `${opts.id} has no autopilot state; run the scaffold, spec and plan stages first`);
  const lock = acquireLock(ctx.root, opts.id, opts.door, opts.pid);
  if (!lock.ok) throw new AutopilotError('locked', `${opts.id} is being run by the ${lock.door} door`);
  const previous = state.packet;
  state.stage = 'gate';
  state.stageStatus = 'running';
  state.attempt = 1;
  const specText = readText(path.join(ctx.root, 'specs', opts.id, 'Spec.md'));
  const specRepos = scopeFrom(specText);
  state.scope = { ...state.scope, proposed: specRepos.length ? specRepos : (knownRepos(ctx).length === 1 ? knownRepos(ctx) : []) };
  writeState(ctx.root, opts.id, state);
  appendLog(ctx.root, opts.id, { stage: 'gate', event: 'started', actor: 'engine', trigger: opts.door, repo: 'docs' });
  commitState(ctx, opts.id, `chore(${opts.id}): autopilot gate started`);
  push(ctx.dirs.docs, state.docs.branch, { state, repoName: 'docs' });
  const docsTip = workTip(ctx.dirs.docs, opts.id, state.docs.branch);
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
  const body = renderPacket(readText(PACKET_TEMPLATE), { state, links, assumptions: assumptionsFrom(specText), events: ctx.settings.events });
  const commentUrl = await ctx.tracker.comment(ctx.source.number, body);
  const postedAt = new Date().toISOString();
  state.packet = { commentUrl, docsTip, tips, postedAt };
  state.approval = null;
  state.stageStatus = 'finished';
  writeState(ctx.root, opts.id, state);
  appendLog(ctx.root, opts.id, { stage: 'gate', event: 'packet-posted', actor: 'engine', trigger: opts.door, repo: 'docs', sha: docsTip, url: commentUrl });
  commitState(ctx, opts.id, `chore(${opts.id}): autopilot packet posted`);
  await removeRunning(ctx);
  clearActiveMarker(ctx.root);
  releaseLock(ctx.root, opts.id);
  return { ticket: opts.id, stage: 'gate', packet: state.packet, lines: body.split('\n').length, mode: state.mode };
}

// The explicit form of the approval check; `next` does the same when it finds one.
async function runApproval(opts) {
  const ctx = context(opts);
  const state = readState(ctx.root, opts.id);
  if (!state || state.stage !== 'gate') throw new AutopilotError('wrong-stage', `${opts.id} is not at the gate`);
  const approval = await pendingApproval(ctx, state, ctx.settings.events);
  if (approval.ok && !state.approval) await consumeApproval(ctx, state, approval, opts.door);
  if (!approval.ok && approval.reason === 'drift') await voidApproval(ctx, state, approval, opts.door);
  return { ticket: opts.id, approval, state: readState(ctx.root, opts.id) };
}

// The tracker path of a code repository: its origin URL, else <owner or namespace>/<name>.
function repoTrackerPath(ctx, name, dir) {
  const fromRemote = remotePath(dir);
  if (fromRemote) return fromRemote;
  const source = (ctx.marker.tickets?.sources ?? []).find((s) => s.prefix === ctx.resolution.prefix) ?? {};
  const base = source.provider === 'gitlab' ? source.namespace : source.owner;
  return `${base}/${name}`;
}

// The last stage: push every branch in scope, one PR per repository plus the documents PR.
async function runPr(opts) {
  const ctx = context(opts);
  const state = readState(ctx.root, opts.id);
  if (!state) throw new AutopilotError('no-state', `${opts.id} has no autopilot state`);
  if (!Array.isArray(state.scope.frozen)) throw new AutopilotError('not-approved', `${opts.id} has no approved scope; the gate has not been passed`);
  if (!['execute', 'qa'].includes(state.stage) || state.stageStatus !== 'finished') throw new AutopilotError('wrong-stage', `${opts.id} is at ${state.stage} (${state.stageStatus}); pr follows a finished execute or qa stage`);
  if (state.qa && ['FAIL', 'PRECONDITION-FAILED'].includes(state.qa.verdict)) {
    throw new AutopilotError('qa-failed', `${opts.id} has QA verdict ${state.qa.verdict} (${state.qa.report}); no pull request opens on a failed gate`);
  }
  const lock = acquireLock(ctx.root, opts.id, opts.door, opts.pid);
  if (!lock.ok) throw new AutopilotError('locked', `${opts.id} is being run by the ${lock.door} door`);
  state.stage = 'pr';
  state.stageStatus = 'running';
  state.attempt = 1;
  writeState(ctx.root, opts.id, state);
  appendLog(ctx.root, opts.id, { stage: 'pr', event: 'started', actor: 'engine', trigger: opts.door, repo: 'docs' });
  commitState(ctx, opts.id, `chore(${opts.id}): autopilot pr started`);
  const logHead = readState(ctx.root, opts.id).logHead ?? '';
  const cite = (what) => [
    `Autopilot pull request for ${opts.id}: ${what}.`,
    '',
    `- Packet: ${state.packet?.commentUrl ?? 'none'}`,
    `- Documents tip at approval: ${state.approval?.docsTip ?? state.packet?.docsTip ?? 'none'}`,
    `- Approved by: ${state.approval?.actor ?? 'n/a'}`,
    `- Stage log head: ${logHead}`,
    state.qa ? `- QA verdict: ${state.qa.verdict} (${state.qa.report})` : '- QA: not configured for this project',
  ].join('\n');
  const prs = {};
  const title = `${opts.id}: ${state.title || 'autopilot'}`;
  // Code repositories first, so the documents PR can list them.
  for (const r of state.repos ?? []) {
    if (!state.scope.frozen.includes(r.name) || r.name === '.') continue;
    const dir = ctx.dirs.repos[r.name];
    const workDir = r.worktree && fs.existsSync(r.worktree) ? r.worktree : dir;
    push(workDir, r.branch, { state, repoName: r.name });
    r.tip = tip(workDir, r.branch);
    const tracker = trackerFor({ ...ctx.resolution, path: repoTrackerPath(ctx, r.name, dir) }, process.env);
    r.prUrl = await tracker.createPr({ head: r.branch, base: r.base, title, body: cite(`the ${r.name} repository`) });
    r.status = 'pr';
    prs[r.name] = r.prUrl;
    writeState(ctx.root, opts.id, state);
  }
  push(ctx.dirs.docs, state.docs.branch, { state, repoName: 'docs' });
  const docsBody = `${cite('the documents repository')}\n${Object.entries(prs).map(([n, u]) => `- ${n}: ${u}`).join('\n')}`;
  state.pr.docs = await ctx.tracker.createPr({ head: state.docs.branch, base: state.docs.base, title, body: docsBody });
  prs.docs = state.pr.docs;
  state.stageStatus = 'finished';
  writeState(ctx.root, opts.id, state);
  appendLog(ctx.root, opts.id, { stage: 'pr', event: 'finished', actor: 'engine', trigger: opts.door, repo: 'docs', sha: tip(ctx.dirs.docs, state.docs.branch), url: state.pr.docs });
  commitState(ctx, opts.id, `chore(${opts.id}): autopilot pull requests opened`);
  push(ctx.dirs.docs, state.docs.branch, { state, repoName: 'docs' });
  await ctx.tracker.comment(ctx.source.number, `Autopilot for ${opts.id} opened the pull requests:\n${Object.entries(prs).map(([n, u]) => `- ${n}: ${u}`).join('\n')}`);
  await removeRunning(ctx);
  clearActiveMarker(ctx.root);
  releaseLock(ctx.root, opts.id);
  return { ticket: opts.id, stage: 'pr', prs };
}

// The approval verification of spec §7 against the tracker, as facts for nextStage.
async function pendingApproval(ctx, state, events) {
  if (!state.packet) return { ok: false, reason: 'no-packet', detail: 'no packet has been posted' };
  const eventsList = await ctx.tracker.labelEvents(ctx.source.number);
  const botLogin = await ctx.tracker.me().catch(() => '');
  const tips = { docs: workTip(ctx.dirs.docs, state.ticket, state.docs.branch), repos: {} };
  for (const r of state.repos ?? []) {
    const dir = r.worktree && fs.existsSync(r.worktree) ? r.worktree : ctx.dirs.repos[r.name];
    tips.repos[r.name] = dir && r.branch ? tip(dir, r.branch) : null;
  }
  return verifyApproval({
    events: eventsList, approveLabel: events.approve, packet: state.packet,
    permissionOf: (login) => ctx.tracker.permission(login), approvers: ctx.settings.approvers ?? [], botLogin, tips,
  });
}

async function runBegin(opts) {
  const ctx = context(opts);
  if (ctx.settings.mode === 'off') throw new AutopilotError('mode-off', 'autopilot.mode is off for this project; nothing runs');
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
    const labels = await ctx.tracker.labels(ctx.source.number);
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
      if (!Array.isArray(state.scope.frozen)) {
        releaseLock(ctx.root, opts.id);
        throw new AutopilotError('not-approved', `${opts.id} has no approved scope; execute follows a verified approval`);
      }
      prepareWorktrees(ctx, state);
    }
    writeState(ctx.root, opts.id, state);
    appendLog(ctx.root, opts.id, { stage: opts.stage, event: 'started', actor: 'engine', trigger: opts.door, repo: 'docs' });
    commitState(ctx, opts.id, `chore(${opts.id}): autopilot ${opts.stage} started`);
  }
  writeActiveMarker(ctx.root, { ticket: opts.id, branch: state.docs.branch, scope: Array.isArray(state.scope.frozen) ? state.scope.frozen : [] });
  const labels = await ctx.tracker.labels(ctx.source.number);
  if (!labels.includes(ctx.settings.events.running)) await ctx.tracker.addLabel(ctx.source.number, ctx.settings.events.running);
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
  const ok = result.ok !== false;
  if (typeof result.title === 'string' && result.title) state.title = result.title;
  if (Array.isArray(result.scope)) state.scope = { ...state.scope, proposed: result.scope.filter((s) => typeof s === 'string') };
  if (opts.stage === 'qa' && typeof result.verdict === 'string') state.qa = { verdict: result.verdict, report: result.report ?? `reviews/${opts.id}/QA-REPORT.md` };
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
    await ctx.tracker.addLabel(ctx.source.number, ctx.settings.events.blocked);
    const message = typeof result.message === 'string' && result.message ? result.message : `the ${opts.stage} stage did not finish`;
    await ctx.tracker.comment(ctx.source.number, `Autopilot for ${opts.id} is blocked at stage ${opts.stage} (attempt ${state.attempt ?? 1}): ${message}`);
  }
  return { ticket: opts.id, stage: opts.stage, status: state.stageStatus, tip: state.docs.tip, attempt: state.attempt ?? 1 };
}

export async function main(argv) {
  try {
    const opts = parseArgs(argv);
    const runners = { status: runStatus, next: runNext, begin: runBegin, end: runEnd, packet: runPacket, approval: runApproval, pr: runPr };
    const result = await runners[opts.command](opts);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
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
