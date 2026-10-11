// The OpenCode plugin runs the ultrapowers guardrail before every tool call while a run is
// active (tool.execute.before): a denied call throws with the hook's reason, an allowed one
// returns, and without a run marker nothing is spawned.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const [, , inputPath] = process.argv;
assert.ok(inputPath, 'pass the plugin module path');
const mod = await import(`${pathToFileURL(fs.realpathSync(inputPath)).href}?guardrail-test=${Date.now()}`);

function project(active) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opencode-guardrail-'));
  fs.mkdirSync(path.join(root, '.agents'), { recursive: true });
  fs.mkdirSync(path.join(root, '.ultrapowers'), { recursive: true });
  fs.writeFileSync(path.join(root, '.agents', 'ultrapowers.json'), JSON.stringify({ name: 'p', autopilot: { mode: 'gated' } }));
  if (active) fs.writeFileSync(path.join(root, '.ultrapowers', 'autopilot-active'), JSON.stringify({ ticket: 'GH-16', branch: 'GH-16-x', scope: ['.'], stage: 'execute' }));
  return root;
}

const active = project(true);
const hooks = await mod.UltrapowersPlugin({ client: null, directory: active });
assert.equal(typeof hooks['tool.execute.before'], 'function', 'V1 registers tool.execute.before');

await assert.rejects(
  hooks['tool.execute.before']({ tool: 'bash', sessionID: 's1', callID: 'c1' }, { args: { command: 'git push origin GH-16-x' } }),
  /git push is never allowed/,
  'a push inside a stage is refused with the hook reason',
);
await assert.rejects(
  hooks['tool.execute.before']({ tool: 'write', sessionID: 's1', callID: 'c2' }, { args: { filePath: path.join(active, 'tasks', 'GH-16', 'autopilot.json'), content: '{}' } }),
  /protected path/,
  'the state file is protected, read through OpenCode\'s filePath spelling',
);
await hooks['tool.execute.before']({ tool: 'bash', sessionID: 's1', callID: 'c3' }, { args: { command: 'git status --porcelain' } });
// OpenCode's bash takes a per-call workdir: outside the project it is refused, inside it passes
await assert.rejects(
  hooks['tool.execute.before']({ tool: 'bash', sessionID: 's1', callID: 'c3b' }, { args: { command: 'echo x > config', workdir: fs.mkdtempSync(path.join(os.tmpdir(), 'opencode-outside-')) } }),
  /AUTOPILOT-GUARDRAIL DENY: the call's working directory .* is outside the project root/,
  'a workdir outside the project is refused',
);
await hooks['tool.execute.before']({ tool: 'bash', sessionID: 's1', callID: 'c3c' }, { args: { command: 'git status', workdir: path.join(active, '.agents') } });
await hooks['tool.execute.before']({ tool: 'write', sessionID: 's1', callID: 'c4' }, { args: { filePath: path.join(active, 'src', 'a.ts'), content: 'x' } });

const idle = project(false);
const idleHooks = await mod.UltrapowersPlugin({ client: null, directory: idle });
await idleHooks['tool.execute.before']({ tool: 'bash', sessionID: 's2', callID: 'c5' }, { args: { command: 'git push origin main' } });

// A call whose own workdir sits under a run is guarded even when the session directory is not.
await assert.rejects(
  idleHooks['tool.execute.before']({ tool: 'bash', sessionID: 's2', callID: 'c8' }, { args: { command: 'git push origin GH-16-x', workdir: active } }),
  /git push is never allowed/,
  'the workdir is a marker candidate too',
);

// A vulnerability hunt (.ultrapowers/hunt-active): a push is refused with the HUNT prefix, an audit
// passes, a source write is refused.
const hunt = project(false);
fs.writeFileSync(path.join(hunt, '.ultrapowers', 'hunt-active'), 'audit-2026-10-11\n');
const huntHooks = await mod.UltrapowersPlugin({ client: null, directory: hunt });
await assert.rejects(
  huntHooks['tool.execute.before']({ tool: 'bash', sessionID: 's3', callID: 'h1' }, { args: { command: 'git push origin x' } }),
  /^Error: HUNT-GUARDRAIL DENY: /,
  'a push during a hunt is refused with the HUNT prefix',
);
await huntHooks['tool.execute.before']({ tool: 'bash', sessionID: 's3', callID: 'h2' }, { args: { command: 'npm audit --package-lock-only --json' } });
await assert.rejects(
  huntHooks['tool.execute.before']({ tool: 'write', sessionID: 's3', callID: 'h3' }, { args: { filePath: path.join(hunt, 'repo-a', 'src', 'x.ts'), content: 'x' } }),
  /HUNT-GUARDRAIL DENY: /,
  'a source write during a hunt is refused',
);

// A headless stage (ULTRAPOWERS_AUTOPILOT_INSIDE=1) is guarded even when the marker is gone.
process.env.ULTRAPOWERS_AUTOPILOT_INSIDE = '1';
try {
  await assert.rejects(
    idleHooks['tool.execute.before']({ tool: 'bash', sessionID: 's2', callID: 'c6' }, { args: { command: 'git push origin main' } }),
    /AUTOPILOT-GUARDRAIL DENY: git push is never allowed/,
    'ULTRAPOWERS_AUTOPILOT_INSIDE=1 keeps the envelope without the marker',
  );
  await idleHooks['tool.execute.before']({ tool: 'bash', sessionID: 's2', callID: 'c7' }, { args: { command: 'git status' } });
} finally {
  delete process.env.ULTRAPOWERS_AUTOPILOT_INSIDE;
}

// V2: setup() registers the same guard through ctx.tool.hook('execute.before'). The V2 event
// carries the call's arguments as `input` (`args` is accepted too) and V2's built-in tools are
// named shell, patch, write and edit. A denied call throws with the hook's reason; during a run an
// event with no argument object is refused; with no run it passes.
const v2Hooks = new Map();
const v2Ctx = (directory, tool) => ({
  directory,
  skill: { transform: async () => ({ dispose: async () => {} }) },
  session: { hook: async () => ({ dispose: async () => {} }) },
  tool: tool ?? { hook: async (name, callback) => { v2Hooks.set(name, callback); return { dispose: async () => {} }; } },
});
// console.error calls made while `fn` runs.
const logged = async (fn) => {
  const original = console.error;
  const lines = [];
  console.error = (...a) => { lines.push(a.map(String).join(' ')); };
  try { await fn(); } finally { console.error = original; }
  return lines;
};
await mod.default.setup(v2Ctx(hunt));
const v2Before = v2Hooks.get('execute.before');
assert.equal(typeof v2Before, 'function', 'V2 registers execute.before through ctx.tool.hook');
await assert.rejects(
  v2Before({ tool: 'shell', sessionID: 's4', id: 'v1', input: { command: 'git push origin x' } }),
  /HUNT-GUARDRAIL DENY: /,
  'V2: a push during a hunt is refused',
);
await v2Before({ tool: 'shell', sessionID: 's4', id: 'v2', input: { command: 'npm audit --package-lock-only --json' } });
for (const [tool, input] of [
  ['write', { filePath: path.join(hunt, 'repo-a', 'src', 'x.ts'), content: 'x' }],
  ['edit', { filePath: path.join(hunt, 'repo-a', 'src', 'x.ts'), oldString: 'a', newString: 'b' }],
  ['patch', { patchText: ['*** Begin Patch', '*** Add File: repo-a/src/x.ts', '+x', '*** End Patch'].join('\n') }],
  ['shell', { command: 'echo x > repo-a/src/x.ts' }],
]) {
  await assert.rejects(
    v2Before({ tool, sessionID: 's4', id: 'v-src', input }),
    /HUNT-GUARDRAIL DENY: /,
    `V2: a source write through ${tool} during a hunt is refused`,
  );
}
// `args` is accepted when `input` is absent.
await assert.rejects(
  v2Before({ tool: 'shell', sessionID: 's4', id: 'v-args', args: { command: 'git push origin x' } }),
  /HUNT-GUARDRAIL DENY: /,
  'V2: args is read when input is missing',
);
// No argument object during a run: refused with the run's prefix, whatever the missing shape.
for (const event of [{ tool: 'shell' }, { tool: 'write', input: 'x' }, { tool: 'shell', input: ['git', 'push'] }, { tool: 'shell', input: null }, undefined]) {
  await assert.rejects(
    v2Before(event),
    /^Error: HUNT-GUARDRAIL DENY: the V2 tool event carried no arguments; refused during a run$/,
    `V2: an event without arguments is refused during a hunt (${JSON.stringify(event)})`,
  );
}
// No run: inert, with or without arguments.
await mod.default.setup(v2Ctx(idle));
const v2Idle = v2Hooks.get('execute.before');
await v2Idle({ tool: 'shell', sessionID: 's5', id: 'v3', input: { command: 'git push origin main' } });
await v2Idle({ tool: 'shell', sessionID: 's5', id: 'v4' });

// A V2 ctx without a tool domain, or whose tool domain has no hook, still sets up and says that
// the run guardrail is not registered on this host.
for (const tool of [{}, { hook: 'nope' }]) {
  const lines = await logged(() => mod.default.setup({ ...v2Ctx(idle), tool }));
  assert.equal(lines.filter((l) => /run guardrail is not registered on this host/.test(l)).length, 1, `one log line when the host has no tool hook (${JSON.stringify(tool)})`);
}
const noDomain = await logged(() => mod.default.setup({ ...v2Ctx(idle), tool: undefined }));
assert.equal(noDomain.filter((l) => /run guardrail is not registered on this host/.test(l)).length, 1, 'one log line when the host has no tool domain');
// The hook present: no such line.
const registered = await logged(() => mod.default.setup(v2Ctx(idle)));
assert.deepEqual(registered.filter((l) => /not registered on this host/.test(l)), [], 'no warning when the hook registers');

// Registration that throws or rejects is logged and setup goes on (skills and bootstrap are
// registered before it, so they are unaffected).
let skillsRegistered = 0;
for (const hook of [() => { throw new Error('boom'); }, async () => { throw new Error('boom'); }]) {
  const ctx = { ...v2Ctx(idle, { hook }), skill: { transform: async () => { skillsRegistered += 1; return { dispose: async () => {} }; } } };
  const lines = await logged(() => mod.default.setup(ctx));
  assert.equal(lines.filter((l) => /tool guard registration failed/.test(l)).length, 1, 'a failing registration is logged once');
}
assert.equal(skillsRegistered, 2, 'setup registered the skills before the guard and went on');

console.log('opencode guardrail: PASS');
