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
const { eventFrom } = await import(`file://${CLI.replace(/\\/g, '/')}`);
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

// ---- shapeless events (issue 2) ----
test('guardrailEvent parses a string input as JSON and passes any other non-object input through unchanged', () => {
  const parsed = guardrailEvent({ toolName: 'bash', input: JSON.stringify({ command: 'git status' }), cwd: '/p' });
  assert.deepEqual(parsed.tool_input, { command: 'git status' });
  assert.equal(guardrailEvent({ toolName: 'bash', input: 'not json', cwd: '/p' }).tool_input, 'not json');
  assert.deepEqual(guardrailEvent({ toolName: 'bash', input: ['git', 'push'], cwd: '/p' }).tool_input, ['git', 'push']);
  assert.deepEqual(guardrailEvent({ toolName: 'bash', input: undefined, cwd: '/p' }).tool_input, {});
});

test('a Copilot-shaped call, its toolArgs a JSON string with escaped quotes, is judged like the object form', () => {
  const root = project();
  const push = runGuardrail({ toolName: 'bash', input: JSON.stringify({ command: 'echo "hi" && git push origin GH-16-x' }), cwd: root });
  assert.equal(push.deny, true, JSON.stringify(push));
  assert.match(push.reason, /git push is never allowed/);
  const status = runGuardrail({ toolName: 'bash', input: JSON.stringify({ command: 'echo "hi" && git status' }), cwd: root });
  assert.deepEqual(status, { deny: false });
});

test('an input that is not an object or a JSON object string is refused during a run', () => {
  const root = project();
  for (const input of ['not json', ['git', 'push'], '"a string"']) {
    const r = runGuardrail({ toolName: 'bash', input, cwd: root });
    assert.equal(r.deny, true, JSON.stringify(input));
    assert.match(r.reason, /no readable tool name or input/);
  }
});

test('guardrail-cli refuses an array event and a payload without a tool name while a run is active', () => {
  const root = project();
  const runIn = (payload) => spawnSync(process.execPath, [CLI], { input: JSON.stringify(payload), encoding: 'utf8', cwd: root });
  for (const payload of [[{ tool_name: 'Bash', tool_input: { command: 'git status' } }], { command: 'git push origin GH-16-x' }]) {
    const r = runIn(payload);
    assert.equal(r.status, 2, r.stderr);
    assert.match(r.stderr, /no readable tool name or input|could not be parsed/);
  }
  const copilot = runIn({ toolName: 'Bash', toolArgs: JSON.stringify({ command: 'git status' }), cwd: root });
  assert.equal(copilot.status, 0, copilot.stderr);
});

// ---- the deny names the profile that denied (issue 7.4) ----
test('the bridge verdict and every entry point keep the profile prefix: QA for a QA run, AUTOPILOT for a stage', () => {
  const qa = project({ marker: 'qa' });
  const qaVerdict = runGuardrail({ toolName: 'bash', input: { command: 'git push origin qa' }, cwd: qa });
  assert.equal(qaVerdict.deny, true);
  assert.equal(qaVerdict.prefix, 'QA-GUARDRAIL');
  assert.match(qaVerdict.reason, /\.ultrapowers\/qa-active/);
  const stage = project({ marker: 'autopilot' });
  assert.equal(runGuardrail({ toolName: 'bash', input: { command: 'git push origin x' }, cwd: stage }).prefix, 'AUTOPILOT-GUARDRAIL');
  // the fail-closed verdict (hook missing) names the marker's profile too
  assert.equal(runGuardrail({ toolName: 'bash', input: { command: 'ls' }, cwd: qa, hookDir: path.join(qa, 'no-hooks-here') }).prefix, 'QA-GUARDRAIL');
  assert.equal(runGuardrail({ toolName: 'bash', input: { command: 'ls' }, cwd: stage, hookDir: path.join(stage, 'no-hooks-here') }).prefix, 'AUTOPILOT-GUARDRAIL');

  const qaCli = runCli({ tool_name: 'Bash', tool_input: { command: 'git push origin qa' }, cwd: qa });
  assert.equal(qaCli.status, 2);
  assert.match(qaCli.stderr, /^QA-GUARDRAIL DENY: /);
  const apCli = runCli({ tool_name: 'Bash', tool_input: { command: 'git push origin x' }, cwd: stage });
  assert.match(apCli.stderr, /^AUTOPILOT-GUARDRAIL DENY: /);
  const ag = runCli({ toolCall: { name: 'run_command', args: { CommandLine: 'git push origin qa', Cwd: qa } }, workspacePaths: [qa], cwd: qa }, ['--antigravity']);
  assert.match(JSON.parse(ag.stdout).reason, /^QA-GUARDRAIL DENY: /);
});

// ---- ULTRAPOWERS_AUTOPILOT_INSIDE: the run is active without the marker, as in the hook ----
function withInside(fn) {
  const prev = process.env.ULTRAPOWERS_AUTOPILOT_INSIDE;
  process.env.ULTRAPOWERS_AUTOPILOT_INSIDE = '1';
  try {
    return fn();
  } finally {
    if (prev === undefined) delete process.env.ULTRAPOWERS_AUTOPILOT_INSIDE;
    else process.env.ULTRAPOWERS_AUTOPILOT_INSIDE = prev;
  }
}
const runCliInside = (event, extra = [], cwd = event.cwd) => spawnSync(process.execPath, [CLI, ...extra], { input: JSON.stringify(event), encoding: 'utf8', cwd: cwd ?? undefined, env: { ...process.env, ULTRAPOWERS_AUTOPILOT_INSIDE: '1' } });

test('ULTRAPOWERS_AUTOPILOT_INSIDE=1 with the marker gone: the bridge runs the hook as an autopilot stage', () => {
  const root = project({ marker: 'none' });
  const push = withInside(() => runGuardrail({ toolName: 'bash', input: { command: 'git push origin x' }, cwd: path.join(root, 'repo-a') }));
  assert.equal(push.deny, true, JSON.stringify(push));
  assert.equal(push.prefix, 'AUTOPILOT-GUARDRAIL');
  assert.match(push.reason, /git push is never allowed/);
  assert.deepEqual(withInside(() => runGuardrail({ toolName: 'bash', input: { command: 'git status' }, cwd: root })), { deny: false });
  // without the flag the same project is inert
  assert.deepEqual(runGuardrail({ toolName: 'bash', input: { command: 'git push origin x' }, cwd: root }), { deny: false });
});

test('ULTRAPOWERS_AUTOPILOT_INSIDE=1 outside any ultrapowers project: every call is denied', () => {
  const idle = fs.mkdtempSync(path.join(os.tmpdir(), 'inside-idle-'));
  // the process cwd (this checkout, itself a project) never roots the stage: the session cwd does
  const r = withInside(() => runGuardrail({ toolName: 'bash', input: { command: 'ls' }, cwd: idle, hookDir: '/nonexistent' }));
  assert.equal(r.deny, true);
  assert.equal(r.prefix, 'AUTOPILOT-GUARDRAIL');
  assert.match(r.reason, /outside any ultrapowers project/);
});

test('guardrail-cli and --antigravity honour ULTRAPOWERS_AUTOPILOT_INSIDE=1 like the hook', () => {
  const root = project({ marker: 'none' });
  const kimi = runCliInside({ tool_name: 'Bash', tool_input: { command: 'git push origin x' }, cwd: root });
  assert.equal(kimi.status, 2, kimi.stderr);
  assert.match(kimi.stderr, /^AUTOPILOT-GUARDRAIL DENY: git push is never allowed/);
  assert.equal(runCliInside({ tool_name: 'Bash', tool_input: { command: 'git status' }, cwd: root }).status, 0);
  const ag = runCliInside({ toolCall: { name: 'run_command', args: { CommandLine: 'git push origin x', Cwd: root } }, workspacePaths: [root] }, ['--antigravity'], root);
  assert.equal(JSON.parse(ag.stdout).decision, 'deny', ag.stdout + ag.stderr);
  const idle = fs.mkdtempSync(path.join(os.tmpdir(), 'cli-inside-idle-'));
  const out = runCliInside({ tool_name: 'Bash', tool_input: { command: 'ls' }, cwd: idle });
  assert.equal(out.status, 2);
  assert.match(out.stderr, /outside any ultrapowers project/);
});

// ---- the marker search takes every candidate; a tool argument never replaces the session cwd ----
test('guardrail-cli --antigravity finds the marker from workspacePaths or the process cwd when Cwd points outside', () => {
  const root = project();
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'agy-outside-'));
  const call = (Cwd, extra = {}) => ({ toolCall: { name: 'run_command', args: { CommandLine: 'git push origin GH-16-x', Cwd } }, ...extra });
  const viaWorkspace = spawnSync(process.execPath, [CLI, '--antigravity'], { input: JSON.stringify(call(outside, { workspacePaths: [outside, root] })), encoding: 'utf8', cwd: outside });
  assert.equal(JSON.parse(viaWorkspace.stdout).decision, 'deny', viaWorkspace.stdout + viaWorkspace.stderr);
  const viaProcess = spawnSync(process.execPath, [CLI, '--antigravity'], { input: JSON.stringify(call(outside)), encoding: 'utf8', cwd: root });
  assert.equal(JSON.parse(viaProcess.stdout).decision, 'deny', viaProcess.stdout + viaProcess.stderr);
  // and the session directory stays the event cwd: Cwd never replaces it
  const ev = eventFrom(JSON.stringify(call(outside, { workspacePaths: [root] })), { antigravity: true });
  assert.equal(ev.cwd, root);
  assert.ok(ev.dirs.includes(root) && ev.dirs.includes(outside), JSON.stringify(ev.dirs));
});

test('runGuardrail takes the first marker among the session cwd and every extra candidate', () => {
  const root = project();
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'bridge-outside-'));
  const r = runGuardrail({ toolName: 'bash', input: { command: 'git push origin GH-16-x' }, cwd: outside, dirs: [outside, root] });
  assert.equal(r.deny, true, JSON.stringify(r));
  assert.match(r.reason, /git push is never allowed/);
  // a call's own working directory, in any harness's spelling, is a candidate too
  for (const key of ['workdir', 'working_directory', 'Cwd', 'dir_path']) {
    const v = runGuardrail({ toolName: 'bash', input: { command: 'git push origin GH-16-x', [key]: root }, cwd: outside });
    assert.equal(v.deny, true, `${key}: ${JSON.stringify(v)}`);
  }
});
