import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { existsSync, mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import test from 'node:test';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '../..');
const packageJsonPath = resolve(repoRoot, 'package.json');
const extensionPath = resolve(repoRoot, '.pi/extensions/ultrapowers.ts');
const piToolsPath = resolve(repoRoot, 'skills/using-ultrapowers/references/pi-tools.md');

async function readPackageJson() {
  return JSON.parse(await readFile(packageJsonPath, 'utf8'));
}

async function loadExtension() {
  const handlers = new Map();
  const pi = {
    on(event, handler) {
      if (!handlers.has(event)) handlers.set(event, []);
      handlers.get(event).push(handler);
    },
  };
  const mod = await import(pathToFileURL(extensionPath).href + `?cachebust=${Date.now()}-${Math.random()}`);
  mod.default(pi);
  return { handlers };
}

function firstHandler(handlers, event) {
  const eventHandlers = handlers.get(event) ?? [];
  assert.equal(eventHandlers.length, 1, `expected one ${event} handler`);
  return eventHandlers[0];
}

function textOf(message) {
  if (typeof message.content === 'string') return message.content;
  return message.content
    .filter((part) => part.type === 'text')
    .map((part) => part.text)
    .join('\n');
}

test('package.json declares a pi package with skills and extension resources', async () => {
  const pkg = await readPackageJson();

  assert.equal(pkg.name, 'ultrapowers');
  assert.ok(pkg.keywords.includes('pi-package'));
  assert.deepEqual(pkg.pi.skills, ['./skills']);
  assert.deepEqual(pkg.pi.extensions, ['./.pi/extensions/ultrapowers.ts']);
});

test('extension registers lifecycle hooks without pre-compaction injection', async () => {
  const { handlers } = await loadExtension();

  for (const event of ['resources_discover', 'session_start', 'session_compact', 'context', 'agent_end']) {
    assert.equal((handlers.get(event) ?? []).length, 1, `missing ${event} handler`);
  }
  assert.equal((handlers.get('session_before_compact') ?? []).length, 0);
});

test('resources_discover contributes the bundled skills directory', async () => {
  const { handlers } = await loadExtension();
  const discover = firstHandler(handlers, 'resources_discover');

  const result = await discover({ type: 'resources_discover', cwd: repoRoot, reason: 'startup' }, {});

  assert.deepEqual(result.skillPaths, [resolve(repoRoot, 'skills')]);
});

test('startup context injects the bootstrap as one user message until agent_end', async () => {
  const { handlers } = await loadExtension();
  const sessionStart = firstHandler(handlers, 'session_start');
  const context = firstHandler(handlers, 'context');
  const agentEnd = firstHandler(handlers, 'agent_end');

  await sessionStart({ type: 'session_start', reason: 'startup' }, {});

  const originalMessages = [
    { role: 'user', content: [{ type: 'text', text: 'Let us make a react todo list' }], timestamp: 1 },
  ];
  const result = await context({ type: 'context', messages: originalMessages }, {});

  assert.equal(result.messages.length, 2);
  assert.equal(result.messages[0].role, 'user');
  assert.match(textOf(result.messages[0]), /You have ultrapowers/);
  assert.match(textOf(result.messages[0]), /Pi tool mapping/);
  assert.equal(result.messages[1], originalMessages[0]);

  const repeatedProviderRequest = await context({ type: 'context', messages: originalMessages }, {});
  assert.equal(repeatedProviderRequest.messages.length, 2);
  assert.match(textOf(repeatedProviderRequest.messages[0]), /You have ultrapowers/);

  const alreadyInjected = await context({ type: 'context', messages: result.messages }, {});
  assert.equal(alreadyInjected, undefined, 'bootstrap should not duplicate when already present');

  await agentEnd({ type: 'agent_end', messages: [] }, {});
  const afterEnd = await context({ type: 'context', messages: originalMessages }, {});
  assert.equal(afterEnd, undefined, 'startup bootstrap should clear after agent_end');
});

test('session_compact injects bootstrap after compaction summaries, not before compaction', async () => {
  const { handlers } = await loadExtension();
  const sessionCompact = firstHandler(handlers, 'session_compact');
  const context = firstHandler(handlers, 'context');

  await sessionCompact({ type: 'session_compact', compactionEntry: {}, fromExtension: false }, {});

  const summary = { role: 'compactionSummary', summary: 'Prior work summary', tokensBefore: 123, timestamp: 1 };
  const user = { role: 'user', content: [{ type: 'text', text: 'Continue' }], timestamp: 2 };
  const result = await context({ type: 'context', messages: [summary, user] }, {});

  assert.equal(result.messages.length, 3);
  assert.equal(result.messages[0], summary);
  assert.equal(result.messages[1].role, 'user');
  assert.match(textOf(result.messages[1]), /You have ultrapowers/);
  assert.equal(result.messages[2], user);
});

test('pi tools reference documents pi-specific mappings', async () => {
  assert.equal(existsSync(piToolsPath), true, 'pi-tools.md should exist');
  const text = await readFile(piToolsPath, 'utf8');

  // Assert against the mapping-table rows only. The surrounding prose mentions
  // these same tokens, so matching the whole file would still pass if the table
  // were deleted — the exact regression this test exists to catch.
  const rows = text.split('\n').filter((line) => line.startsWith('|'));
  assert.ok(
    rows.some((row) => /subagent/i.test(row)),
    'mapping table documents subagent dispatch',
  );
  assert.ok(
    rows.some((row) => /todo|task/i.test(row)),
    'mapping table documents task tracking',
  );
});

function makeMemoryFixture() {
  const root = mkdtempSync(join(tmpdir(), 'pi-team-memory-'));
  mkdirSync(join(root, '.agents', 'memory'), { recursive: true });
  writeFileSync(join(root, '.agents', 'memory', 'MEMORY.md'), '# Team memory: index\n');
  mkdirSync(join(root, 'nested', 'app'), { recursive: true });
  return { root, nested: join(root, 'nested', 'app'), bare: mkdtempSync(join(tmpdir(), 'pi-bare-')) };
}

test('team memory: findMemoryStore walks up to the store or returns null', async () => {
  const mod = await import(pathToFileURL(extensionPath).href + `?cachebust=${Date.now()}-${Math.random()}`);
  const fx = makeMemoryFixture();
  assert.equal(mod.findMemoryStore(fx.bare), null);
  assert.equal(mod.findMemoryStore(fx.root), '.agents/memory/');
  assert.equal(mod.findMemoryStore(fx.nested), '../../.agents/memory/');
  assert.equal(mod.findMemoryStore(join(fx.root, 'missing')), null);
});

test('team memory: startup bootstrap carries the nudge only when a store exists', async () => {
  const fx = makeMemoryFixture();
  const user = { role: 'user', content: [{ type: 'text', text: 'Start' }], timestamp: 1 };

  const withStore = await loadExtension();
  await firstHandler(withStore.handlers, 'session_start')({ type: 'session_start', reason: 'startup' }, { cwd: fx.nested });
  const injected = await firstHandler(withStore.handlers, 'context')({ type: 'context', messages: [user] }, { cwd: fx.nested });
  const text = textOf(injected.messages[0]);
  assert.match(text, /You have ultrapowers/);
  assert.match(text, /Team-memory: if this session verified a durable, expensive-to-rediscover, non-derivable fact, save it to `\.\.\/\.\.\/\.agents\/memory\/` with the team-memory skill\./);
  assert.doesNotMatch(text, /Context was just compacted/);

  const withoutStore = await loadExtension();
  await firstHandler(withoutStore.handlers, 'session_start')({ type: 'session_start', reason: 'startup' }, { cwd: fx.bare });
  const plain = await firstHandler(withoutStore.handlers, 'context')({ type: 'context', messages: [user] }, { cwd: fx.bare });
  assert.doesNotMatch(textOf(plain.messages[0]), /Team-memory:/);
});

test('team memory: after session_compact the bootstrap carries the rescue line until agent_end', async () => {
  const fx = makeMemoryFixture();
  const { handlers } = await loadExtension();
  const context = firstHandler(handlers, 'context');
  const ctx = { cwd: fx.root };

  await firstHandler(handlers, 'session_compact')({ type: 'session_compact', compactionEntry: {}, fromExtension: false }, ctx);
  const summary = { role: 'compactionSummary', summary: 'Prior work', tokensBefore: 10, timestamp: 1 };
  const user = { role: 'user', content: [{ type: 'text', text: 'Continue' }], timestamp: 2 };
  const result = await context({ type: 'context', messages: [summary, user] }, ctx);
  const text = textOf(result.messages[1]);
  assert.match(text, /Context was just compacted\. If team-worthy learnings surfaced earlier and are not yet saved to `\.agents\/memory\/`, save them now with the team-memory skill\./);
  assert.doesNotMatch(text, /Team-memory: if this session/);

  await firstHandler(handlers, 'agent_end')({ type: 'agent_end', messages: [] }, ctx);
  await firstHandler(handlers, 'session_start')({ type: 'session_start', reason: 'startup' }, ctx);
  const fresh = await context({ type: 'context', messages: [user] }, ctx);
  assert.match(textOf(fresh.messages[0]), /Team-memory: if this session/);
  assert.doesNotMatch(textOf(fresh.messages[0]), /Context was just compacted/);
});

test('team memory: ULTRAPOWERS_NUDGE=off leaves the memory lines out', async () => {
  const fx = makeMemoryFixture();
  const user = { role: 'user', content: [{ type: 'text', text: 'Start' }], timestamp: 1 };
  process.env.ULTRAPOWERS_NUDGE = 'off';
  try {
    const { handlers } = await loadExtension();
    await firstHandler(handlers, 'session_start')({ type: 'session_start', reason: 'startup' }, { cwd: fx.root });
    const injected = await firstHandler(handlers, 'context')({ type: 'context', messages: [user] }, { cwd: fx.root });
    assert.doesNotMatch(textOf(injected.messages[0]), /Team-memory:/);
  } finally {
    delete process.env.ULTRAPOWERS_NUDGE;
  }
});

test('the extension runs the ultrapowers guardrail before a tool call while a run is active', async () => {
  const { handlers } = await loadExtension();
  const toolCall = firstHandler(handlers, 'tool_call');
  const root = mkdtempSync(join(tmpdir(), 'pi-guardrail-'));
  mkdirSync(join(root, '.agents'), { recursive: true });
  mkdirSync(join(root, '.ultrapowers'), { recursive: true });
  writeFileSync(join(root, '.agents', 'ultrapowers.json'), JSON.stringify({ name: 'p', autopilot: { mode: 'gated' } }));
  writeFileSync(join(root, '.ultrapowers', 'autopilot-active'), JSON.stringify({ ticket: 'GH-16', branch: 'GH-16-x', scope: ['.'], stage: 'execute' }));

  const denied = await toolCall({ type: 'tool_call', toolCallId: '1', toolName: 'bash', input: { command: 'git push origin GH-16-x' } }, { cwd: root });
  assert.equal(denied?.block, true);
  assert.match(denied.reason, /git push is never allowed/);
  const state = await toolCall({ type: 'tool_call', toolCallId: '2', toolName: 'write', input: { path: join(root, 'tasks', 'GH-16', 'autopilot.json'), content: '{}' } }, { cwd: root });
  assert.equal(state?.block, true, 'Pi spells the file as path; the state file is protected');
  const allowed = await toolCall({ type: 'tool_call', toolCallId: '3', toolName: 'bash', input: { command: 'git status' } }, { cwd: root });
  assert.equal(allowed, undefined);

  const idle = mkdtempSync(join(tmpdir(), 'pi-idle-'));
  const inert = await toolCall({ type: 'tool_call', toolCallId: '4', toolName: 'bash', input: { command: 'git push origin main' } }, { cwd: idle });
  assert.equal(inert, undefined, 'no run marker: nothing is checked');
});
