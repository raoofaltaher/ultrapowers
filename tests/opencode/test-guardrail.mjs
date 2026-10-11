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
// carries the call's arguments as `input`; a denied call throws with the hook's reason.
const v2Hooks = new Map();
const v2Ctx = (directory) => ({
  directory,
  skill: { transform: async () => ({ dispose: async () => {} }) },
  session: { hook: async () => ({ dispose: async () => {} }) },
  tool: { hook: async (name, callback) => { v2Hooks.set(name, callback); return { dispose: async () => {} }; } },
});
await mod.default.setup(v2Ctx(hunt));
const v2Before = v2Hooks.get('execute.before');
assert.equal(typeof v2Before, 'function', 'V2 registers execute.before through ctx.tool.hook');
await assert.rejects(
  v2Before({ tool: 'bash', sessionID: 's4', id: 'v1', input: { command: 'git push origin x' } }),
  /HUNT-GUARDRAIL DENY: /,
  'V2: a push during a hunt is refused',
);
await v2Before({ tool: 'bash', sessionID: 's4', id: 'v2', input: { command: 'npm audit --package-lock-only --json' } });
await mod.default.setup(v2Ctx(idle));
await v2Hooks.get('execute.before')({ tool: 'bash', sessionID: 's5', id: 'v3', input: { command: 'git push origin main' } });
// A V2 ctx without a tool domain still sets up (the bootstrap and the skills do not depend on it).
await mod.default.setup({ ...v2Ctx(idle), tool: undefined });

console.log('opencode guardrail: PASS');
