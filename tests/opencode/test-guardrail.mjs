// The OpenCode plugin runs the ultrapowers guardrail before every tool call while a run is
// active (tool.execute.before): a denied call throws with the hook's reason, an allowed one
// returns, and without a run (a run record or the autopilot marker) nothing is spawned.
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

// A run record (.ultrapowers/runs/<run>.json), bound to no session unless one is named: OpenCode
// names no session, so a record bound to one never guards its calls.
function record(root, profile, id, session = null) {
  const run = `${profile}-${id}-0a1b2c3d`;
  fs.mkdirSync(path.join(root, '.ultrapowers', 'runs'), { recursive: true });
  fs.writeFileSync(path.join(root, '.ultrapowers', 'runs', `${run}.json`), JSON.stringify({ run, profile, id, session, startedAt: new Date().toISOString() }));
}

// A vulnerability hunt (a hunt record): a push is refused with the HUNT prefix, an audit passes, a
// source write is refused.
const hunt = project(false);
record(hunt, 'hunt', 'audit-2026-10-11');
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

// A record in a parent project does not guard a nested project (a folder with its own
// .agents/ultrapowers.json); the nested project's own record does.
const parent = project(false);
record(parent, 'qa', 'GH-16');
const nested = path.join(parent, 'repo-a');
fs.mkdirSync(path.join(nested, '.agents'), { recursive: true });
fs.writeFileSync(path.join(nested, '.agents', 'ultrapowers.json'), JSON.stringify({ name: 'nested' }));
const parentHooks = await mod.UltrapowersPlugin({ client: null, directory: parent });
await assert.rejects(
  parentHooks['tool.execute.before']({ tool: 'bash', sessionID: 's6', callID: 'n1' }, { args: { command: 'git push origin x' } }),
  /^Error: QA-GUARDRAIL DENY: /,
  'the record guards its own project',
);
const nestedHooks = await mod.UltrapowersPlugin({ client: null, directory: nested });
await nestedHooks['tool.execute.before']({ tool: 'bash', sessionID: 's6', callID: 'n2' }, { args: { command: 'git push origin x' } });
record(nested, 'hunt', 'audit-2026-10-11');
await assert.rejects(
  nestedHooks['tool.execute.before']({ tool: 'bash', sessionID: 's6', callID: 'n3' }, { args: { command: 'git push origin x' } }),
  /^Error: HUNT-GUARDRAIL DENY: /,
  'the nested project\'s own record guards it',
);

// A record bound to a session guards no OpenCode call: the plugin names no session.
const bound = project(false);
record(bound, 'qa', 'GH-16', 'S1');
const boundHooks = await mod.UltrapowersPlugin({ client: null, directory: bound });
await boundHooks['tool.execute.before']({ tool: 'bash', sessionID: 's7', callID: 'b1' }, { args: { command: 'git push origin x' } });

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

// A V1-shaped ctx (V1 also calls default.setup, without the skill and session domains) stays
// silent: no log line, no guard registered, even with a tool domain and a run marker present.
for (const v1 of [{ client: null, directory: hunt }, { directory: hunt, skill: {} }, { directory: hunt, skill: { transform: async () => ({}) } }, { directory: hunt, session: { hook: async () => ({}) } }]) {
  let hooked = 0;
  const ctx = { ...v1, tool: { hook: async () => { hooked += 1; return { dispose: async () => {} }; } } };
  const lines = await logged(() => mod.default.setup(ctx));
  assert.deepEqual(lines, [], `a V1-shaped ctx logs nothing (${Object.keys(v1).join(',')})`);
  assert.equal(hooked, 0, `a V1-shaped ctx registers no guard (${Object.keys(v1).join(',')})`);
}

// Registration that throws or rejects is logged and setup goes on (skills and bootstrap are
// registered before it, so they are unaffected).
let skillsRegistered = 0;
for (const hook of [() => { throw new Error('boom'); }, async () => { throw new Error('boom'); }]) {
  const ctx = { ...v2Ctx(idle, { hook }), skill: { transform: async () => { skillsRegistered += 1; return { dispose: async () => {} }; } } };
  const lines = await logged(() => mod.default.setup(ctx));
  assert.equal(lines.filter((l) => /tool guard registration failed/.test(l)).length, 1, 'a failing registration is logged once');
}
assert.equal(skillsRegistered, 2, 'setup registered the skills before the guard and went on');

// V2 hands setup() no `ctx.directory`: the project is `ctx.location.directory` (High 4 of the
// 2026-10-23 hunt). The guard looks for a run from every directory the context and the call carry,
// so a run is found whichever of them the host fills, and the service's own cwd is only one more
// candidate. (The test process's cwd is this repository, which holds no run.)
const v2Guard = async (ctx) => {
  await mod.default.setup({ ...v2Ctx(undefined), ...ctx });
  return v2Hooks.get('execute.before');
};
const push = { command: 'git push origin x' };
for (const [label, ctx] of [
  ['ctx.location.directory', { location: { directory: hunt } }],
  ['ctx.worktree', { worktree: hunt }],
  ['ctx.project.directory', { project: { directory: hunt } }],
]) {
  const guard = await v2Guard(ctx);
  await assert.rejects(guard({ tool: 'shell', sessionID: 's8', id: 'v-dir', input: push }), /HUNT-GUARDRAIL DENY: /, `V2: a run is found from ${label}`);
  await assert.rejects(guard({ tool: 'shell', sessionID: 's8', id: 'v-noargs' }), /^Error: HUNT-GUARDRAIL DENY: the V2 tool event carried no arguments/, `V2: no arguments during a run is refused from ${label}`);
}
// a context with several directories: the project can be any of them
await assert.rejects(
  (await v2Guard({ directory: os.tmpdir(), location: { directory: hunt } }))({ tool: 'shell', sessionID: 's8', id: 'v-two', input: push }),
  /HUNT-GUARDRAIL DENY: /,
  'V2: a run is found from the second directory the context carries',
);
// a context with no directory at all: the call's own absolute directory or file finds the run
const bare = await v2Guard({});
await assert.rejects(bare({ tool: 'shell', sessionID: 's8', id: 'v-wd', input: { ...push, workdir: hunt } }), /HUNT-GUARDRAIL DENY: /, 'V2: a workdir inside the project finds the run');
await assert.rejects(bare({ tool: 'shell', sessionID: 's8', id: 'v-cwd', input: { ...push, cwd: path.join(hunt, 'repo-a') } }), /HUNT-GUARDRAIL DENY: /, 'V2: a cwd inside the project finds the run');
await assert.rejects(
  bare({ tool: 'write', sessionID: 's8', id: 'v-fp', input: { filePath: path.join(hunt, 'repo-a', 'src', 'x.ts'), content: 'x' } }),
  /HUNT-GUARDRAIL DENY: /,
  'V2: the directory of an absolute filePath finds the run',
);
await assert.rejects(
  bare({ tool: 'write', sessionID: 's8', id: 'v-fp2', input: { filePath: path.join(hunt, 'new-folder', 'deeper', 'x.ts'), content: 'x' } }),
  /HUNT-GUARDRAIL DENY: /,
  'V2: a file in a folder that does not exist yet is judged from its nearest existing folder',
);
// a relative filePath names no directory, and a path outside every run is not guarded
await bare({ tool: 'write', sessionID: 's8', id: 'v-out', input: { filePath: path.join(idle, 'x.ts'), content: 'x' } });
await bare({ tool: 'shell', sessionID: 's8', id: 'v-out2', input: { command: 'git push origin main', workdir: idle } });
// a run in the process cwd's own project still guards a context that names none (the V1 fallback)
const cwdBefore = process.cwd();
process.chdir(hunt);
try {
  await assert.rejects(bare({ tool: 'shell', sessionID: 's8', id: 'v-cwd2', input: push }), /HUNT-GUARDRAIL DENY: /, 'V2: the process cwd stays a candidate');
} finally {
  process.chdir(cwdBefore);
}

// An autopilot stage reaches only the MCP servers of the ticket's snapshot. OpenCode spells a tool
// <server>_<tool>; the guard reads it as mcp__<server>__<tool> against that list (Medium 19).
const snapProject = project(true);
fs.mkdirSync(path.join(snapProject, '.ultrapowers', 'autopilot'), { recursive: true });
fs.writeFileSync(path.join(snapProject, '.ultrapowers', 'autopilot', 'mcp.json'), JSON.stringify({ mcpServers: { context7: { command: 'x' }, 'my-docs': { command: 'y' } } }));
const snapHooks = await mod.UltrapowersPlugin({ client: null, directory: snapProject });
await assert.rejects(
  snapHooks['tool.execute.before']({ tool: 'postgres_query', sessionID: 's9', callID: 'm1' }, { args: { query: 'select 1' } }),
  /AUTOPILOT-GUARDRAIL DENY: the MCP server 'postgres' is not in the ticket's snapshot of \.mcp\.json/,
  'V1: an MCP tool of a server outside the snapshot is refused',
);
await snapHooks['tool.execute.before']({ tool: 'context7_query-docs', sessionID: 's9', callID: 'm2' }, { args: { query: 'x' } });
await snapHooks['tool.execute.before']({ tool: 'my-docs_search', sessionID: 's9', callID: 'm3' }, { args: { query: 'x' } });
await snapHooks['tool.execute.before']({ tool: 'read', sessionID: 's9', callID: 'm4' }, { args: { filePath: path.join(snapProject, 'README.md') } });
const snapV2 = await v2Guard({ location: { directory: snapProject } });
await assert.rejects(
  snapV2({ tool: 'postgres_query', sessionID: 's9', id: 'm5', input: { query: 'select 1' } }),
  /AUTOPILOT-GUARDRAIL DENY: the MCP server 'postgres' is not in the ticket's snapshot/,
  'V2: an MCP tool of a server outside the snapshot is refused',
);
await snapV2({ tool: 'context7_query-docs', sessionID: 's9', id: 'm6', input: { query: 'x' } });
// a QA run keeps no server list: the tool name is judged as it came
await (await v2Guard({ location: { directory: parent } }))({ tool: 'postgres_query', sessionID: 's9', id: 'm7', input: { query: 'select 1' } });

console.log('opencode guardrail: PASS');
