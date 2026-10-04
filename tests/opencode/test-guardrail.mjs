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
await hooks['tool.execute.before']({ tool: 'write', sessionID: 's1', callID: 'c4' }, { args: { filePath: path.join(active, 'src', 'a.ts'), content: 'x' } });

const idle = project(false);
const idleHooks = await mod.UltrapowersPlugin({ client: null, directory: idle });
await idleHooks['tool.execute.before']({ tool: 'bash', sessionID: 's2', callID: 'c5' }, { args: { command: 'git push origin main' } });

console.log('opencode guardrail: PASS');
