// The guardrail bridge: the in-process harnesses (OpenCode, Pi) run hooks/qa-guardrail through
// it with the same event JSON a shell-hook harness sends. Offline; needs bash (Git Bash on Windows).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BRIDGE = path.resolve(HERE, '..', '..', 'hooks', 'lib', 'guardrail-bridge.mjs');
const { runGuardrail, guardrailEvent, markerRoot } = await import(`file://${BRIDGE.replace(/\\/g, '/')}`);

function project({ marker = 'autopilot' } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'guardrail-bridge-'));
  fs.mkdirSync(path.join(root, '.agents'), { recursive: true });
  fs.mkdirSync(path.join(root, '.ultrapowers'), { recursive: true });
  fs.mkdirSync(path.join(root, 'repo-a', 'src'), { recursive: true });
  fs.writeFileSync(path.join(root, '.agents', 'ultrapowers.json'), JSON.stringify({ name: 'p', autopilot: { mode: 'gated' }, qa: { urls: {}, hosts: { allowed: [], forbidden: ['prod.example.com'] } } }));
  if (marker === 'autopilot') fs.writeFileSync(path.join(root, '.ultrapowers', 'autopilot-active'), JSON.stringify({ ticket: 'GH-16', branch: 'GH-16-x', scope: ['.'], stage: 'execute' }));
  if (marker === 'qa') fs.writeFileSync(path.join(root, '.ultrapowers', 'qa-active'), 'GH-16\n');
  return root;
}

test('guardrailEvent speaks the shell-hook contract for OpenCode and Pi inputs', () => {
  const oc = guardrailEvent({ toolName: 'write', input: { filePath: '/p/a.ts', content: 'x' }, cwd: '/p' });
  assert.deepEqual([oc.tool_name, oc.tool_input.file_path, oc.cwd], ['write', '/p/a.ts', '/p']);
  const pi = guardrailEvent({ toolName: 'bash', input: { command: 'git status' }, cwd: '/p' });
  assert.equal(pi.tool_input.command, 'git status');
  const piWrite = guardrailEvent({ toolName: 'edit', input: { path: 'b.ts', oldText: 'a', newText: 'b' }, cwd: '/p' });
  assert.equal(piWrite.tool_input.file_path, 'b.ts');
});

test('markerRoot finds the run marker above the cwd and nothing elsewhere', () => {
  const root = project();
  assert.equal(markerRoot(path.join(root, 'repo-a', 'src')), root);
  assert.equal(markerRoot(fs.mkdtempSync(path.join(os.tmpdir(), 'no-marker-'))), null);
});

test('without a run marker every call is allowed and no hook runs', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'inert-'));
  const r = runGuardrail({ toolName: 'bash', input: { command: 'git push origin main' }, cwd: root, hookDir: '/nonexistent' });
  assert.deepEqual(r, { deny: false });
});

test('inside an autopilot stage a push is denied with the hook reason and a read passes', () => {
  const root = project();
  const push = runGuardrail({ toolName: 'bash', input: { command: 'git push origin GH-16-x' }, cwd: root });
  assert.equal(push.deny, true, JSON.stringify(push));
  assert.match(push.reason, /git push is never allowed/);
  const status = runGuardrail({ toolName: 'bash', input: { command: 'git status --porcelain' }, cwd: root });
  assert.deepEqual(status, { deny: false });
  const stateFile = runGuardrail({ toolName: 'write', input: { filePath: path.join(root, 'tasks', 'GH-16', 'autopilot.json'), content: '{}' }, cwd: root });
  assert.equal(stateFile.deny, true);
  assert.match(stateFile.reason, /protected path/);
  const src = runGuardrail({ toolName: 'write', input: { filePath: path.join(root, 'repo-a', 'src', 'x.ts'), content: 'x' }, cwd: root });
  assert.deepEqual(src, { deny: false });
  const label = runGuardrail({ toolName: 'bash', input: { command: 'gh issue edit 16 --add-label up:approve' }, cwd: root });
  assert.equal(label.deny, true);
});

test('a run marker with no usable hook fails closed', () => {
  const root = project();
  const r = runGuardrail({ toolName: 'bash', input: { command: 'ls' }, cwd: root, hookDir: path.join(root, 'no-hooks-here') });
  assert.equal(r.deny, true);
  assert.match(r.reason, /could not run/);
});

// ---- guardrail-cli: the node entry for Kimi, Antigravity and Hermes ----
import { spawnSync } from 'node:child_process';
const CLI = path.resolve(HERE, '..', '..', 'hooks', 'lib', 'guardrail-cli.mjs');
const runCli = (event, extra = []) => spawnSync(process.execPath, [CLI, ...extra], { input: JSON.stringify(event), encoding: 'utf8', cwd: event.cwd ?? undefined });

test('guardrail-cli answers exit 2 and the reason on stderr for a deny, exit 0 for an allow', () => {
  const root = project();
  const deny = runCli({ tool_name: 'Bash', tool_input: { command: 'git push origin GH-16-x' }, cwd: root });
  assert.equal(deny.status, 2, deny.stderr);
  assert.match(deny.stderr, /git push is never allowed/);
  assert.equal(deny.stdout, '');
  const allow = runCli({ tool_name: 'Bash', tool_input: { command: 'git status' }, cwd: root });
  assert.equal(allow.status, 0, allow.stderr);
  const kimi = runCli({ hook_event_name: 'PreToolUse', tool_name: 'Write', tool_input: { file_path: path.join(root, 'tasks', 'GH-16', 'stage-log.jsonl'), content: 'x' }, cwd: root });
  assert.equal(kimi.status, 2);
});

test('guardrail-cli --antigravity reads its payload and answers its JSON', () => {
  const root = project();
  const deny = runCli({ toolCall: { name: 'run_command', args: { CommandLine: 'gh issue edit 16 --add-label up:approve', Cwd: root } }, workspacePaths: [root], cwd: root }, ['--antigravity']);
  assert.equal(deny.status, 0, deny.stderr);
  const out = JSON.parse(deny.stdout);
  assert.equal(out.decision, 'deny');
  assert.match(out.reason, /gh writes/);
  const write = runCli({ toolCall: { name: 'write_to_file', args: { TargetFile: path.join(root, '.github', 'workflows', 'x.yml'), CodeContent: 'x' } }, workspacePaths: [root], cwd: root }, ['--antigravity']);
  assert.equal(JSON.parse(write.stdout).decision, 'deny');
  const allow = runCli({ toolCall: { name: 'view_file', args: { AbsolutePath: path.join(root, 'README.md') } }, workspacePaths: [root], cwd: root }, ['--antigravity']);
  assert.deepEqual(JSON.parse(allow.stdout), { decision: 'allow' });
});

test('guardrail-cli outside a run allows everything, whatever the payload', () => {
  const idle = fs.mkdtempSync(path.join(os.tmpdir(), 'cli-idle-'));
  assert.equal(runCli({ tool_name: 'Bash', tool_input: { command: 'git push origin main' }, cwd: idle }).status, 0);
  assert.equal(runCli({ cwd: idle, garbage: true }).status, 0);
});
