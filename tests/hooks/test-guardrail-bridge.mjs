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
