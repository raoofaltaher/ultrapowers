import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AutopilotError, STAGES, DEFAULTS, validateAutopilot, effectiveAutopilot, slugFor, branchName, modeFor,
} from '../../skills/autopilot/scripts/autopilot-lib.mjs';

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
