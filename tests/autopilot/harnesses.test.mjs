import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { HARNESSES, HARNESS_NAMES, GUARDED_HARNESSES, PLUGIN_ROOT } from '../../skills/autopilot/scripts/harnesses.mjs';
import { HARNESSES as NAMES_IN_LIB, validateAutopilot } from '../../skills/autopilot/scripts/autopilot-lib.mjs';

const P = '/ultrapowers:autopilot GH-16 --stage spec --door watch';

test('every harness the configuration accepts has an adapter, and the watcher refuses only devin', () => {
  assert.deepEqual([...NAMES_IN_LIB].sort(), [...HARNESS_NAMES].sort());
  for (const name of HARNESS_NAMES) assert.deepEqual(validateAutopilot({ mode: 'gated', harness: name }), [], name);
  assert.deepEqual(HARNESS_NAMES.filter((n) => !GUARDED_HARNESSES.includes(n)), ['devin']);
});

test('each adapter carries the prompt, bypasses its own prompts, and asks for machine output', () => {
  const expect = {
    'claude-code': ['-p', '--permission-mode', 'bypassPermissions', '--output-format', 'json'],
    codex: ['exec', '--json', '--dangerously-bypass-approvals-and-sandbox', '--dangerously-bypass-hook-trust', '--ignore-user-config'],
    copilot: ['-p', '--allow-all-tools', '--no-ask-user', '--output-format', 'json', '--disable-builtin-mcps'],
    cursor: ['-p', '--force', '--trust', '--output-format', 'json'],
    gemini: ['-p', '--approval-mode=yolo', '--output-format', 'json', '-e', 'ultrapowers'],
    qwen: ['-p', '--yolo', '--output-format', 'json', '-e', 'ultrapowers'],
    opencode: ['run', '--format', 'json', '--dangerously-skip-permissions'],
    pi: ['-p', '--mode', 'json', '--no-extensions', '-e', '--approve'],
    droid: ['exec', '--skip-permissions-unsafe', '--output-format', 'json'],
    kimi: ['-p', '--output-format', 'stream-json'],
    hermes: ['chat', '--oneshot', '-q', '--format', 'stream-json', '--yolo', '--accept-hooks'],
    antigravity: ['-p', '--output-format', 'json', '--dangerously-skip-permissions'],
    devin: ['-p', '--permission-mode', 'dangerous'],
  };
  for (const [name, flags] of Object.entries(expect)) {
    const args = HARNESSES[name].args(P, 200, { pluginRoot: PLUGIN_ROOT });
    assert.ok(args.includes(P), `${name} carries the prompt`);
    for (const f of flags) assert.ok(args.includes(f), `${name} has ${f}: ${args.join(' ')}`);
    assert.ok(!args.includes('--pure'), `${name}: --pure would drop the plugin`);
  }
  assert.ok(HARNESSES.pi.args(P, 1, { pluginRoot: '/plug' }).includes(path.join('/plug', '.pi', 'extensions', 'ultrapowers.ts')), 'pi loads this plugin extension explicitly');
  assert.equal(HARNESSES['claude-code'].args(P, 7)[HARNESSES['claude-code'].args(P, 7).indexOf('--max-turns') + 1], '7');
});
