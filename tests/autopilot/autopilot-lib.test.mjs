import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  AutopilotError, STAGES, DEFAULTS, validateAutopilot, effectiveAutopilot, slugFor, branchName, modeFor,
  initialState, statePath, logPath, readState, writeState, hashLine, appendLog, readLog, verifyChain,
  packetId, renderPacket, verifyApproval, assumptionsFrom, scopeFrom, freezeScope, pushAllowed,
  nextStage, acquireLock, releaseLock, readLock, lockPath, activeMarkerPath, writeActiveMarker, clearActiveMarker,
} from '../../skills/autopilot/scripts/autopilot-lib.mjs';

const TEMPLATE = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'skills', 'autopilot', 'templates', 'packet.md'), 'utf8');

test('validateAutopilot names the field', () => {
  assert.deepEqual(validateAutopilot({ mode: 'gated', approvers: [] }), []);
  assert.match(validateAutopilot({ mode: 'turbo' })[0], /autopilot\.mode must be one of off, gated, full/);
  assert.match(validateAutopilot({ mode: 'gated', watch: { intervalSec: 0 } })[0], /watch\.intervalSec/);
  assert.match(validateAutopilot({ mode: 'gated', events: { approve: '' } })[0], /events\.approve/);
  assert.match(validateAutopilot({ mode: 'gated', approvers: 'alice' })[0], /autopilot\.approvers must be a list/);
  assert.match(validateAutopilot({ mode: 'gated', execution: 'parallel' })[0], /autopilot\.execution/);
  assert.match(validateAutopilot({ mode: 'gated', harness: 'cursor' })[0], /autopilot\.harness/);
  assert.match(validateAutopilot('gated')[0], /autopilot must be an object/);
});

test('effectiveAutopilot fills defaults and reports off', () => {
  assert.deepEqual(effectiveAutopilot({}), { mode: 'off' });
  assert.deepEqual(effectiveAutopilot({ autopilot: { mode: 'off', approvers: ['x'] } }), { mode: 'off' });
  const a = effectiveAutopilot({ autopilot: { mode: 'gated' } });
  assert.equal(a.events.ready, 'up:ready');
  assert.equal(a.events.blocked, 'up:blocked');
  assert.equal(a.watch.maxConcurrent, 1);
  assert.equal(a.watch.intervalSec, 60);
  assert.equal(a.execution, 'subagent');
  assert.equal(a.harness, 'claude-code');
  assert.equal(a.baseBranch, null);
  assert.deepEqual(a.approvers, []);
  const b = effectiveAutopilot({ autopilot: { mode: 'full', events: { approve: 'ok' }, baseBranch: 'dev' } });
  assert.equal(b.events.approve, 'ok');
  assert.equal(b.events.ready, 'up:ready');
  assert.equal(b.baseBranch, 'dev');
  assert.throws(() => effectiveAutopilot({ autopilot: { mode: 'turbo' } }), (e) => e instanceof AutopilotError && e.code === 'bad-autopilot');
});

test('STAGES and DEFAULTS are the spec values', () => {
  assert.deepEqual(STAGES, ['scaffold', 'spec', 'plan', 'gate', 'changes', 'execute', 'qa', 'pr', 'done']);
  assert.deepEqual(Object.keys(DEFAULTS.events), ['ready', 'approve', 'changes', 'hold', 'running', 'blocked']);
});

test('slugFor and branchName', () => {
  assert.equal(branchName('GH-16', 'writing-plans: hand-off lines still announce docs/ultrapowers/plans/'), 'GH-16-writing-plans-hand-off-lines-still');
  assert.equal(branchName('GL-web-7', 'Add a login page'), 'GL-web-7-add-a-login-page');
  assert.equal(slugFor('!!!', '16'), '16');
  assert.equal(slugFor('', '16'), '16');
  assert.equal(slugFor(undefined, '16'), '16');
  assert.ok(slugFor('a'.repeat(80), '1').length <= 40);
  assert.doesNotMatch(slugFor('Ünïcode titré here', '1'), /-$/);
  assert.equal(slugFor('Ünïcode titré here', '1'), 'unicode-titre-here');
  assert.equal(slugFor('one two three four five six seven', '1'), 'one-two-three-four-five-six');
});

test('modeFor precedence', () => {
  const b = { mode: 'gated' };
  assert.equal(modeFor(b, { arg: 'full', labels: ['up:mode:off'] }), 'full');
  assert.equal(modeFor(b, { labels: ['up:mode:off'] }), 'off');
  assert.equal(modeFor(b, { labels: ['bug', 'up:mode:full'] }), 'full');
  assert.equal(modeFor(b, {}), 'gated');
  assert.equal(modeFor({ mode: 'off' }, {}), 'off');
  assert.throws(() => modeFor(b, { arg: 'turbo' }), (e) => e.code === 'bad-args');
});

// ---- Task 2: state and stage log ----
const SRC = { provider: 'github', path: 'acme/web', number: 16 };

function tmpTicket(id) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'autopilot-lib-'));
  fs.mkdirSync(path.join(root, 'tasks', id), { recursive: true });
  return root;
}

test('initialState shape', () => {
  const s = initialState({ id: 'GH-16', mode: 'gated', source: SRC, docsBranch: 'GH-16-x', docsBase: 'dev', title: 'x' });
  assert.equal(s.ticket, 'GH-16');
  assert.equal(s.mode, 'gated');
  assert.equal(s.stage, 'scaffold');
  assert.equal(s.attempt, 1);
  assert.deepEqual(s.source, SRC);
  assert.deepEqual(s.docs, { branch: 'GH-16-x', base: 'dev', tip: null });
  assert.deepEqual(s.repos, []);
  assert.deepEqual(s.scope, { proposed: [], frozen: false });
  assert.equal(s.packet, null);
  assert.equal(s.approval, null);
  assert.deepEqual(s.pr, { docs: null });
  assert.equal(s.title, 'x');
});

test('paths live under tasks/<ID>', () => {
  assert.equal(statePath('/r', 'GH-16'), path.join('/r', 'tasks', 'GH-16', 'autopilot.json'));
  assert.equal(logPath('/r', 'GH-16'), path.join('/r', 'tasks', 'GH-16', 'stage-log.jsonl'));
});

test('readState returns null when absent and round-trips', () => {
  const root = tmpTicket('GH-16');
  assert.equal(readState(root, 'GH-16'), null);
  const s = initialState({ id: 'GH-16', mode: 'gated', source: SRC, docsBranch: 'GH-16-x', docsBase: 'dev', title: 'x' });
  writeState(root, 'GH-16', s);
  assert.deepEqual(readState(root, 'GH-16'), s);
  const text = fs.readFileSync(statePath(root, 'GH-16'), 'utf8');
  assert.ok(text.endsWith('\n'));
  assert.ok(text.includes('\n  "ticket"'));
});

test('log chain links and detects edits', () => {
  const root = tmpTicket('GH-16');
  const first = appendLog(root, 'GH-16', { stage: 'scaffold', event: 'started', actor: 'engine', trigger: 'command', repo: 'docs' });
  appendLog(root, 'GH-16', { stage: 'scaffold', event: 'finished', actor: 'engine', trigger: 'command', repo: 'docs', sha: 'abc' });
  const lines = readLog(root, 'GH-16');
  assert.equal(lines.length, 2);
  assert.equal(lines[0].prev, '0'.repeat(64));
  assert.match(lines[0].at, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(first.hash, hashLine(first.line));
  assert.equal(lines[1].prev, hashLine(fs.readFileSync(logPath(root, 'GH-16'), 'utf8').split('\n')[0]));
  assert.deepEqual(Object.keys(lines[1]), ['at', 'stage', 'event', 'actor', 'trigger', 'repo', 'sha', 'prev']);
  assert.deepEqual(verifyChain(root, 'GH-16'), { ok: true });
  const raw = fs.readFileSync(logPath(root, 'GH-16'), 'utf8').replace('"event":"started"', '"event":"startet"');
  fs.writeFileSync(logPath(root, 'GH-16'), raw);
  assert.deepEqual(verifyChain(root, 'GH-16'), { ok: false, at: 2 });
});

test('the state anchors the log head, so the last line cannot be edited either', () => {
  const root = tmpTicket('GH-16');
  writeState(root, 'GH-16', initialState({ id: 'GH-16', mode: 'gated', source: SRC, docsBranch: 'b', docsBase: 'dev', title: 'x' }));
  appendLog(root, 'GH-16', { stage: 'scaffold', event: 'started', actor: 'engine', trigger: 'command', repo: 'docs' });
  const last = appendLog(root, 'GH-16', { stage: 'scaffold', event: 'finished', actor: 'engine', trigger: 'command', repo: 'docs', sha: 'abc' });
  assert.equal(readState(root, 'GH-16').logHead, last.hash);
  assert.deepEqual(verifyChain(root, 'GH-16'), { ok: true });
  const raw = fs.readFileSync(logPath(root, 'GH-16'), 'utf8').replace('"sha":"abc"', '"sha":"abd"');
  fs.writeFileSync(logPath(root, 'GH-16'), raw);
  assert.deepEqual(verifyChain(root, 'GH-16'), { ok: false, at: 2 });
});

// ---- Task 4: packet, approval verification and scope ----
const PACKET = { commentUrl: 'u', docsTip: 'd1', tips: { backend: 'b1' }, postedAt: '2026-10-04T09:00:00Z' };
const TIPS_SAME = { docs: 'd1', repos: { backend: 'b1' } };
const TIPS_DRIFT = { docs: 'd2', repos: { backend: 'b1' } };
const BEFORE = '2026-10-04T08:00:00Z';
const AFTER = '2026-10-04T10:00:00Z';
const EV = (actor, at, extra = {}) => ({ id: 'e1', action: 'labeled', label: 'up:approve', actor, at, ...extra });

function stateWith(extra = {}) {
  const s = initialState({ id: 'GH-16', mode: 'gated', source: SRC, docsBranch: 'GH-16-x', docsBase: 'dev', title: 'Fix the hand-off line' });
  return { ...s, ...extra };
}

test('packetId is stable across repo order and 12 hex', () => {
  assert.equal(packetId('d', { b: '2', a: '1' }), packetId('d', { a: '1', b: '2' }));
  assert.match(packetId('d', {}), /^[0-9a-f]{12}$/);
  assert.notEqual(packetId('d', { a: '1' }), packetId('d', { a: '2' }));
});

test('verifyApproval: the four checks', async () => {
  const base = { approveLabel: 'up:approve', approvers: [], packet: PACKET, tips: TIPS_SAME };
  const ok = await verifyApproval({ ...base, events: [EV('alice', AFTER)], permissionOf: async () => 'write' });
  assert.deepEqual(ok, { ok: true, actor: 'alice', eventId: 'e1', at: AFTER });
  assert.equal((await verifyApproval({ ...base, events: [], permissionOf: async () => 'admin' })).reason, 'no-event');
  assert.equal((await verifyApproval({ ...base, events: [EV('alice', AFTER, { label: 'up:ready' })], permissionOf: async () => 'admin' })).reason, 'no-event');
  assert.equal((await verifyApproval({ ...base, events: [EV('alice', AFTER), EV('alice', '2026-10-04T11:00:00Z', { id: 'e2', action: 'unlabeled' })], permissionOf: async () => 'admin' })).reason, 'no-event');
  assert.equal((await verifyApproval({ ...base, events: [EV('alice', BEFORE)], permissionOf: async () => 'write' })).reason, 'before-packet');
  assert.equal((await verifyApproval({ ...base, events: [EV('alice', AFTER)], permissionOf: async () => 'read' })).reason, 'not-permitted');
  assert.equal((await verifyApproval({ ...base, approvers: ['bob'], events: [EV('alice', AFTER)], permissionOf: async () => 'admin' })).reason, 'not-approver');
  assert.equal((await verifyApproval({ ...base, approvers: ['alice'], events: [EV('alice', AFTER)], permissionOf: async () => 'maintain' })).ok, true);
  const drift = await verifyApproval({ ...base, tips: TIPS_DRIFT, events: [EV('alice', AFTER)], permissionOf: async () => 'write' });
  assert.equal(drift.reason, 'drift');
  assert.match(drift.detail, /docs/);
});

test('scopeFrom and assumptionsFrom parse the spec sections', () => {
  const spec = [
    '# Spec', '', '## Repositories in scope', '', '- backend', '- `web`', '', '## Assumption ledger', '',
    '| # | Question | Chosen answer | Confidence | Reason |', '|---|---|---|---|---|',
    '| 1 | Which auth? | OIDC | high | the app uses it |', '| 2 | Cache TTL? | 60 s | low | no requirement given |',
    '| 3 | Retry count? | 3 | medium | common default |', '', '## Next',
  ].join('\n');
  assert.deepEqual(scopeFrom(spec), ['backend', 'web']);
  const a = assumptionsFrom(spec);
  assert.equal(a.length, 3);
  assert.deepEqual(a[0], { question: 'Cache TTL?', answer: '60 s', confidence: 'low', reason: 'no requirement given' });
  assert.equal(a[2].confidence, 'high');
  assert.deepEqual(scopeFrom('# Spec\n\nno section'), []);
  assert.deepEqual(assumptionsFrom('# Spec'), []);
});

test('freezeScope refuses widening and unknown names; root topology freezes to .', () => {
  const S = stateWith();
  assert.throws(() => freezeScope(S, { specRepos: ['backend'], planRepos: ['backend', 'web'], knownRepos: ['backend', 'web'] }), { code: 'scope-widened' });
  assert.throws(() => freezeScope(S, { specRepos: ['payments'], planRepos: ['payments'], knownRepos: ['backend'] }), { code: 'unknown-repo' });
  assert.deepEqual(freezeScope(S, { specRepos: ['backend', 'web'], planRepos: ['backend'], knownRepos: ['backend', 'web'] }).scope, { proposed: ['backend', 'web'], frozen: ['backend'] });
  assert.deepEqual(freezeScope(S, { specRepos: ['backend'], planRepos: [], knownRepos: ['backend'] }).scope, { proposed: ['backend'], frozen: ['backend'] });
  assert.deepEqual(freezeScope(S, { specRepos: [], planRepos: [], knownRepos: ['.'] }).scope, { proposed: ['.'], frozen: ['.'] });
  assert.deepEqual(freezeScope(S, { specRepos: ['.'], planRepos: ['.'], knownRepos: ['.'] }).scope.frozen, ['.']);
  assert.throws(() => freezeScope(S, { specRepos: [], planRepos: [], knownRepos: ['backend', 'web'] }), { code: 'no-scope' });
  assert.equal(S.scope.frozen, false, 'the input state is not mutated');
});

test('pushAllowed only inside the frozen scope and the ticket branch', () => {
  const S = stateWith({ scope: { proposed: ['backend', 'web'], frozen: ['backend'] } });
  assert.equal(pushAllowed(S, 'backend', 'GH-16-x'), true);
  assert.equal(pushAllowed(S, 'web', 'GH-16-x'), false);
  assert.equal(pushAllowed(S, 'backend', 'main'), false);
  assert.equal(pushAllowed(S, 'backend', 'GH-160-x'), false);
  assert.equal(pushAllowed(S, 'docs', 'GH-16-x'), true, 'the documents branch is always a ticket branch');
  assert.equal(pushAllowed(stateWith(), 'backend', 'GH-16-x'), false, 'nothing frozen yet');
  assert.equal(pushAllowed(stateWith(), 'docs', 'GH-16-x'), true, 'the docs branch is pushed before the freeze');
});

test('renderPacket is under 25 lines and carries the packet id', () => {
  const S = stateWith({ docs: { branch: 'GH-16-x', base: 'dev', tip: 'd1' }, scope: { proposed: ['backend', 'web'], frozen: false },
    repos: [{ name: 'backend', branch: null, base: 'main', tip: null, status: 'pending', prUrl: null }] });
  const text = renderPacket(TEMPLATE, {
    state: S, events: DEFAULTS.events,
    links: { brief: 'B', spec: 'S', plan: 'P', diff: null },
    assumptions: Array.from({ length: 7 }, (_, i) => ({ question: `Q${i}`, answer: `A${i}`, confidence: 'low', reason: 'r' })),
  });
  const lines = text.split('\n');
  assert.ok(lines.length <= 25, `${lines.length} lines`);
  assert.match(text, /GH-16/);
  assert.match(text, /gate 1 of 2/);
  assert.match(text, /mode gated/);
  assert.match(text, /backend\s+base main/);
  assert.match(text, /web\s+base/);
  assert.match(text, /Q4/);
  assert.doesNotMatch(text, /Q5/);
  assert.match(text, /up:approve/);
  assert.match(text, new RegExp(`Packet id ${packetId('d1', {})}`));
  assert.doesNotMatch(text, /\{\{/);
  const noDiff = renderPacket(TEMPLATE, { state: S, events: DEFAULTS.events, links: { brief: 'B', spec: 'S', plan: 'P', diff: null }, assumptions: [] });
  assert.match(noDiff, /changed since last packet: none/);
  assert.throws(() => renderPacket(`${TEMPLATE}${'\nx'.repeat(30)}`, { state: S, events: DEFAULTS.events, links: { brief: 'B', spec: 'S', plan: 'P', diff: null }, assumptions: [] }), { code: 'packet-too-long' });
});

test('renderPacket names the docs branch for the root repository', () => {
  const S = stateWith({ docs: { branch: 'GH-16-x', base: 'dev', tip: 'd1' }, scope: { proposed: ['.'], frozen: false }, repos: [] });
  const args = { events: DEFAULTS.events, links: { brief: 'B', spec: 'S', plan: 'P', diff: null }, assumptions: [] };
  const text = renderPacket(TEMPLATE, { state: S, ...args });
  assert.match(text, /\.\s+base dev\s+branch GH-16-x at d1/);
  assert.doesNotMatch(text, /not yet created/);
  const withPr = renderPacket(TEMPLATE, { state: stateWith({ ...S, stage: 'pr', pr: { docs: 'https://x/pull/1' } }), ...args });
  assert.match(withPr, /\.\s+base dev\s+PR https:\/\/x\/pull\/1/);
});

// ---- Task 6: next-stage decision and locks ----
const FACTS = { mode: 'gated', labels: [], events: DEFAULTS.events, approval: null, qaConfigured: false, locked: null };
const finished = (stage, extra = {}) => stateWith({ stage, stageStatus: 'finished', ...extra });

test('nextStage: the transition table', () => {
  assert.deepEqual(nextStage(null, { ...FACTS, mode: 'off' }), { action: 'stop', reason: 'mode-off' });
  assert.deepEqual(nextStage(null, FACTS), { action: 'run', stage: 'scaffold', reason: 'new-ticket' });
  assert.deepEqual(nextStage(finished('scaffold'), FACTS), { action: 'run', stage: 'spec', reason: 'scaffold-finished' });
  assert.deepEqual(nextStage(finished('spec'), FACTS), { action: 'run', stage: 'plan', reason: 'spec-finished' });
  assert.deepEqual(nextStage(finished('plan'), FACTS), { action: 'run', stage: 'gate', reason: 'plan-finished' });
  const gate = finished('gate', { packet: PACKET });
  assert.deepEqual(nextStage(gate, { ...FACTS, mode: 'full' }), { action: 'run', stage: 'execute', reason: 'mode-full' });
  assert.deepEqual(nextStage(gate, { ...FACTS, labels: ['up:hold'] }), { action: 'wait', reason: 'held' });
  assert.deepEqual(nextStage(gate, { ...FACTS, labels: ['up:hold'], mode: 'full' }), { action: 'wait', reason: 'held' }, 'hold beats full');
  assert.deepEqual(nextStage(gate, { ...FACTS, labels: ['up:changes'] }), { action: 'run', stage: 'changes', reason: 'changes-requested' });
  assert.deepEqual(nextStage(gate, { ...FACTS, approval: { ok: true, actor: 'alice' } }), { action: 'run', stage: 'execute', reason: 'approved' });
  assert.deepEqual(nextStage(gate, { ...FACTS, approval: { ok: false, reason: 'drift' } }), { action: 'run', stage: 'gate', reason: 'drift' });
  assert.deepEqual(nextStage(gate, { ...FACTS, approval: { ok: false, reason: 'no-event' } }), { action: 'wait', reason: 'awaiting-approval' });
  assert.deepEqual(nextStage(gate, FACTS), { action: 'wait', reason: 'awaiting-approval' });
  assert.deepEqual(nextStage(finished('changes'), FACTS), { action: 'run', stage: 'gate', reason: 'changes-finished' });
  assert.deepEqual(nextStage(finished('execute'), { ...FACTS, qaConfigured: true }), { action: 'run', stage: 'qa', reason: 'execute-finished' });
  assert.deepEqual(nextStage(finished('execute'), FACTS), { action: 'run', stage: 'pr', reason: 'qa-not-configured' });
  assert.deepEqual(nextStage(finished('qa', { qa: { verdict: 'FAIL' } }), FACTS), { action: 'stop', reason: 'qa-FAIL' });
  assert.deepEqual(nextStage(finished('qa', { qa: { verdict: 'PRECONDITION-FAILED' } }), FACTS), { action: 'stop', reason: 'qa-PRECONDITION-FAILED' });
  assert.deepEqual(nextStage(finished('qa', { qa: { verdict: 'PASS-WITH-ISSUES' } }), FACTS), { action: 'run', stage: 'pr', reason: 'qa-finished' });
  assert.deepEqual(nextStage(finished('pr'), FACTS), { action: 'done', reason: 'pr-finished' });
  assert.deepEqual(nextStage(stateWith({ stage: 'done', stageStatus: 'finished' }), FACTS), { action: 'done', reason: 'done' });
  assert.deepEqual(nextStage(finished('spec'), { ...FACTS, locked: { pid: 4, door: 'watch' } }), { action: 'wait', reason: 'locked' });
  assert.deepEqual(nextStage(null, { ...FACTS, locked: { pid: null, door: 'command' } }), { action: 'wait', reason: 'locked' }, 'a pending scaffold is locked too');
  assert.deepEqual(nextStage(stateWith({ stage: 'spec', stageStatus: 'running', attempt: 1 }), FACTS), { action: 'run', stage: 'spec', reason: 'spec-interrupted' });
  assert.deepEqual(nextStage(stateWith({ stage: 'spec', stageStatus: 'blocked', attempt: 2 }), FACTS), { action: 'run', stage: 'spec', reason: 'spec-retry' });
  assert.deepEqual(nextStage(stateWith({ stage: 'spec', stageStatus: 'blocked', attempt: 3 }), FACTS), { action: 'stop', reason: 'blocked' });
  assert.deepEqual(nextStage(finished('plan'), { ...FACTS, labels: ['up:hold'] }), { action: 'wait', reason: 'held' }, 'hold stops before any stage');
  assert.deepEqual(nextStage(finished('plan'), { ...FACTS, mode: 'off' }), { action: 'stop', reason: 'mode-off' });
});

test('locks: acquire, refuse the other door, remove a stale pid, release', () => {
  const root = tmpTicket('GH-16');
  assert.deepEqual(acquireLock(root, 'GH-16', 'command'), { ok: true });
  const lock = readLock(root, 'GH-16');
  assert.equal(lock.pid, process.pid);
  assert.equal(lock.door, 'command');
  assert.match(lock.startedAt, /^\d{4}-/);
  const again = acquireLock(root, 'GH-16', 'watch');
  assert.equal(again.ok, false);
  assert.equal(again.pid, process.pid);
  assert.equal(again.door, 'command');
  assert.deepEqual(acquireLock(root, 'GH-16', 'command'), { ok: true }, 'the same pid may re-enter');
  releaseLock(root, 'GH-16');
  assert.equal(readLock(root, 'GH-16'), null);
  fs.mkdirSync(path.dirname(lockPath(root, 'GH-16')), { recursive: true });
  fs.writeFileSync(lockPath(root, 'GH-16'), JSON.stringify({ pid: 999999, door: 'watch', startedAt: '2026-01-01T00:00:00Z' }));
  assert.deepEqual(acquireLock(root, 'GH-16', 'command'), { ok: true }, 'a dead pid is removed');
  assert.equal(readLock(root, 'GH-16').pid, process.pid);
  releaseLock(root, 'GH-16');
  assert.equal(lockPath(root, 'GH-16'), path.join(root, '.ultrapowers', 'autopilot', 'GH-16.lock'));
  // A session-door lock has no pid: it lives until released or until the TTL passes.
  assert.deepEqual(acquireLock(root, 'GH-16', 'command', null), { ok: true });
  assert.equal(readLock(root, 'GH-16').pid, null);
  assert.equal(acquireLock(root, 'GH-16', 'watch', 123).ok, false);
  fs.writeFileSync(lockPath(root, 'GH-16'), JSON.stringify({ pid: null, door: 'command', startedAt: '2020-01-01T00:00:00Z' }));
  assert.deepEqual(acquireLock(root, 'GH-16', 'watch', null), { ok: true }, 'an expired session lock is removed');
  releaseLock(root, 'GH-16');
  // The watcher holds the lock with its pid; the skill's begin inside its harness call re-enters
  // the same door without one and must not erase the pid.
  assert.deepEqual(acquireLock(root, 'GH-16', 'watch', process.pid), { ok: true });
  assert.deepEqual(acquireLock(root, 'GH-16', 'watch', null), { ok: true });
  assert.equal(readLock(root, 'GH-16').pid, process.pid);
  releaseLock(root, 'GH-16');
});

test('the active marker holds ticket, branch and scope', () => {
  const root = tmpTicket('GH-16');
  assert.equal(activeMarkerPath(root), path.join(root, '.ultrapowers', 'autopilot-active'));
  writeActiveMarker(root, { ticket: 'GH-16', branch: 'GH-16-x', scope: ['backend'] });
  assert.deepEqual(JSON.parse(fs.readFileSync(activeMarkerPath(root), 'utf8')), { ticket: 'GH-16', branch: 'GH-16-x', scope: ['backend'] });
  clearActiveMarker(root);
  assert.equal(fs.existsSync(activeMarkerPath(root)), false);
  clearActiveMarker(root);
});

test('verifyChain on an absent or empty log is ok; a tampered line is named', () => {
  const root = tmpTicket('GH-16');
  assert.deepEqual(verifyChain(root, 'GH-16'), { ok: true });
  assert.deepEqual(readLog(root, 'GH-16'), []);
  appendLog(root, 'GH-16', { stage: 'scaffold', event: 'started', actor: 'engine', trigger: 'command', repo: 'docs' });
  appendLog(root, 'GH-16', { stage: 'scaffold', event: 'finished', actor: 'engine', trigger: 'command', repo: 'docs' });
  const raw = fs.readFileSync(logPath(root, 'GH-16'), 'utf8').replace('"started"', '"starte"');
  fs.writeFileSync(logPath(root, 'GH-16'), raw);
  assert.deepEqual(verifyChain(root, 'GH-16'), { ok: false, at: 2 });
});

// ---- Final review fix pass (2026-10-04) ----

test('nextStage: a consumed approval survives a crash, and a missing QA verdict stops', () => {
  const gate = finished('gate', { packet: PACKET, approval: { actor: 'alice', eventId: 'e1', at: AFTER, docsTip: 'd1', tips: {} } });
  assert.deepEqual(nextStage(gate, FACTS), { action: 'run', stage: 'execute', reason: 'approved' }, 'the label is gone, the state remembers');
  assert.deepEqual(nextStage(gate, { ...FACTS, labels: ['up:hold'] }), { action: 'wait', reason: 'held' });
  assert.deepEqual(nextStage(finished('qa'), { ...FACTS, qaConfigured: true }), { action: 'stop', reason: 'qa-missing' });
  assert.deepEqual(nextStage(finished('qa', { qa: { verdict: '' } }), { ...FACTS, qaConfigured: true }), { action: 'stop', reason: 'qa-missing' });
  assert.deepEqual(nextStage(finished('qa'), FACTS), { action: 'run', stage: 'pr', reason: 'qa-finished' }, 'without a qa block the stage was skipped');
});

test('verifyApproval compares instants, not strings: the packet second is before the packet', async () => {
  const base = { approveLabel: 'up:approve', approvers: [], packet: { ...PACKET, postedAt: '2026-10-04T09:00:00.500Z' }, tips: TIPS_SAME, permissionOf: async () => 'write' };
  assert.equal((await verifyApproval({ ...base, events: [EV('alice', '2026-10-04T09:00:00Z')] })).reason, 'before-packet');
  assert.equal((await verifyApproval({ ...base, events: [EV('alice', '2026-10-04T09:00:01Z')] })).ok, true);
  assert.equal((await verifyApproval({ ...base, events: [EV('alice', 'not a date')] })).reason, 'before-packet', 'an unparsable time fails closed');
});

test('locks: a second watcher is refused while the first lives', () => {
  const root = tmpTicket('GH-16');
  assert.deepEqual(acquireLock(root, 'GH-16', 'watch', process.pid), { ok: true });
  assert.deepEqual(acquireLock(root, 'GH-16', 'watch', 999999), { ok: false, pid: process.pid, door: 'watch' });
  assert.deepEqual(acquireLock(root, 'GH-16', 'watch', null), { ok: true }, 'the skill inside the holder re-enters without a pid');
  assert.deepEqual(acquireLock(root, 'GH-16', 'watch', process.pid), { ok: true }, 'the holder re-enters');
  assert.equal(readLock(root, 'GH-16').pid, process.pid);
  releaseLock(root, 'GH-16');
});

test('freezeScope accepts the documents root beside code repositories', () => {
  const S = stateWith();
  assert.deepEqual(freezeScope(S, { specRepos: ['.', 'backend'], planRepos: [], knownRepos: ['.', 'backend'] }).scope, { proposed: ['.', 'backend'], frozen: ['.', 'backend'] });
  assert.deepEqual(freezeScope(S, { specRepos: ['backend'], planRepos: ['backend'], knownRepos: ['.', 'backend'] }).scope.frozen, ['backend']);
  assert.throws(() => freezeScope(S, { specRepos: [], planRepos: [], knownRepos: ['.', 'backend'] }), { code: 'no-scope' }, 'nested: the spec must name its repositories');
});

test('pushAllowed takes the validated ticket id, not the state file', () => {
  const S = stateWith({ scope: { proposed: ['.'], frozen: ['.'] } });
  assert.equal(pushAllowed({ ...S, ticket: 'main' }, 'docs', 'main-x', 'GH-16'), false, 'a tampered state cannot rename the ticket');
  assert.equal(pushAllowed({ ...S, ticket: 'GH-99' }, 'docs', 'GH-16-x', 'GH-16'), true);
  assert.equal(pushAllowed(S, 'docs', 'GH-16-x'), true, 'the state id is the default');
});

test('renderPacket names the base commits that are not on origin', () => {
  const S = stateWith({ docs: { branch: 'GH-16-x', base: 'dev', tip: 'd1' }, scope: { proposed: ['.'], frozen: false }, repos: [] });
  const args = { events: DEFAULTS.events, links: { brief: 'B', spec: 'S', plan: 'P', diff: null }, assumptions: [] };
  const text = renderPacket(TEMPLATE, { state: S, ...args, baseAhead: ['abc1234', 'def5678'] });
  assert.match(text.split('\n')[1], /^Docs branch GH-16-x at d1; base dev is 2 commits ahead of origin\/dev: abc1234, def5678$/);
  assert.doesNotMatch(renderPacket(TEMPLATE, { state: S, ...args }), /ahead of origin/);
  assert.doesNotMatch(renderPacket(TEMPLATE, { state: S, ...args, baseAhead: [] }), /ahead of origin/);
});

test('watchSelfApproval is a boolean, off by default', () => {
  assert.deepEqual(validateAutopilot({ mode: 'gated', watchSelfApproval: true }), []);
  assert.match(validateAutopilot({ mode: 'gated', watchSelfApproval: 'yes' })[0], /autopilot\.watchSelfApproval must be true or false/);
  assert.equal(effectiveAutopilot({ autopilot: { mode: 'gated' } }).watchSelfApproval, false);
  assert.equal(effectiveAutopilot({ autopilot: { mode: 'gated', watchSelfApproval: true } }).watchSelfApproval, true);
});
