import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const [, , inputPath] = process.argv;
assert.ok(inputPath, 'pass the plugin module path');
const pluginURL = pathToFileURL(fs.realpathSync(inputPath));
let generation = 0;
const load = async () => import(`${pluginURL.href}?team-memory-test=${++generation}`);

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ultrapowers-team-memory-'));
const bare = path.join(tmp, 'bare');
const proj = path.join(tmp, 'proj');
const nested = path.join(proj, 'nested', 'app');
fs.mkdirSync(bare, { recursive: true });
fs.mkdirSync(path.join(proj, '.agents', 'memory'), { recursive: true });
fs.mkdirSync(nested, { recursive: true });
fs.writeFileSync(path.join(proj, '.agents', 'memory', 'MEMORY.md'), '# Team memory: index\n');

const mod = await load();
assert.equal(mod.findMemoryStore(bare), null, 'no store above a bare directory');
assert.equal(mod.findMemoryStore(proj), '.agents/memory/');
assert.equal(mod.findMemoryStore(nested), '../../.agents/memory/');
assert.equal(mod.findMemoryStore(path.join(proj, 'gone')), null, 'missing directory is null, not a throw');

const texts = (msg) => (msg.parts ?? msg.content).filter((p) => p.type === 'text').map((p) => p.text);
const hasNudge = (msg) => texts(msg).some((t) => t.startsWith(mod.TEAM_MEMORY_MARKER));
const hasRescue = (msg) => texts(msg).some((t) => t.startsWith(mod.POSTCOMPACT_MARKER));

// ---- V1 ---------------------------------------------------------------------
const v1Message = (sessionID, text) => ({ info: { role: 'user', sessionID }, parts: [{ type: 'text', text }] });

async function v1(directory) {
  const m = await load();
  const hooks = await m.UltrapowersPlugin({ client: null, directory });
  return {
    transform: (event) => hooks['experimental.chat.messages.transform']({}, event),
    event: (event) => hooks.event({ event }),
  };
}

{
  const h = await v1(bare);
  const event = { messages: [v1Message('v1-bare', 'Do the task')] };
  await h.transform(event);
  assert.equal(hasNudge(event.messages[0]), false, 'V1 without a store: no nudge');
  assert.equal(event.messages[0].parts.length, 2, 'V1 without a store: bootstrap + original only');
}

{
  const h = await v1(nested);
  const event = { messages: [v1Message('v1-nested', 'Do the task')] };
  await h.transform(event);
  assert.equal(hasNudge(event.messages[0]), true, 'V1 with a store: nudge rides the first message');
  assert.match(texts(event.messages[0]).at(-1), /`\.\.\/\.\.\/\.agents\/memory\/`/);
  assert.equal(event.messages[0].parts.length, 3, 'bootstrap, original, nudge');
  await h.transform(event);
  assert.equal(event.messages[0].parts.filter((p) => p.text?.startsWith(mod.TEAM_MEMORY_MARKER)).length, 1, 'nudge is not duplicated');

  await h.event({ type: 'session.compacted', properties: { sessionID: 'v1-nested' } });
  event.messages.push(v1Message('v1-nested', 'Continue'));
  await h.transform(event);
  const last = event.messages.at(-1);
  assert.equal(hasRescue(last), true, 'V1 after session.compacted: rescue line on the newest user message');
  assert.match(texts(last).at(-1), /`\.\.\/\.\.\/\.agents\/memory\/`/);
  await h.transform(event);
  assert.equal(last.parts.filter((p) => p.text?.startsWith(mod.POSTCOMPACT_MARKER)).length, 1, 'rescue line is appended once per compaction');

  await h.event({ type: 'session.updated', properties: { sessionID: 'v1-nested' } });
  event.messages.push(v1Message('v1-nested', 'More'));
  await h.transform(event);
  assert.equal(hasRescue(event.messages.at(-1)), false, 'other events do not trigger the rescue line');
}

{
  const h = await v1(bare);
  await h.event({ type: 'session.compacted', properties: { sessionID: 'v1-bare-c' } });
  const event = { messages: [v1Message('v1-bare-c', 'Continue')] };
  await h.transform(event);
  assert.equal(hasRescue(event.messages[0]), false, 'V1 without a store: compaction stays silent');
}

// ---- V2 ---------------------------------------------------------------------
async function v2(cwd) {
  const previous = process.cwd();
  process.chdir(cwd);
  try {
    const m = await load();
    let invoke;
    await m.default.setup({
      skill: { transform: async (transform) => transform({ add() {} }) },
      session: { hook: async (name, callback) => { if (name === 'context') invoke = callback; } },
    });
    assert.equal(typeof invoke, 'function');
    return invoke;
  } finally {
    process.chdir(previous);
  }
}

const v2User = (text) => ({ role: 'user', content: [{ type: 'text', text }] });
const checkpoint = (id = 'opaque') => ({ role: 'assistant', content: [{ type: 'compaction', provider: 'fixture', encrypted: id }] });

{
  const invoke = await v2(bare);
  const event = { sessionID: 'v2-bare', messages: [v2User('Do the task')] };
  await invoke(event);
  assert.equal(hasNudge(event.messages[0]), false, 'V2 without a store: no nudge');
  assert.equal(event.messages[0].content.length, 2);
}

{
  const invoke = await v2(proj);
  const first = { sessionID: 'v2-proj', messages: [v2User('Do the task')] };
  await invoke(first);
  assert.equal(hasNudge(first.messages[0]), true, 'V2 with a store: nudge on the first message');
  assert.match(texts(first.messages[0]).at(-1), /`\.agents\/memory\/`/);
  assert.equal(hasRescue(first.messages[0]), false);

  const compacted = { sessionID: 'v2-proj', messages: [checkpoint()] };
  await invoke(compacted);
  assert.equal(compacted.messages.length, 2, 'checkpoint kept, one user message appended');
  assert.equal(hasRescue(compacted.messages[1]), true, 'V2 after compaction: rescue line rides the re-injected bootstrap');
  assert.equal(hasNudge(compacted.messages[1]), false);

  // Provider-native checkpoints stay in every later request: the same
  // checkpoint must not repeat the rescue line, and the nudge comes back.
  const nextTurn = { sessionID: 'v2-proj', messages: [checkpoint(), v2User('Next step')] };
  await invoke(nextTurn);
  assert.equal(hasRescue(nextTurn.messages[1]), false, 'V2: the rescue line is not repeated for the same checkpoint');
  assert.equal(hasNudge(nextTurn.messages[1]), true, 'V2: the nudge returns on the turn after the rescue');

  const retained = { sessionID: 'v2-proj', messages: [v2User('Keep going'), checkpoint('second')] };
  await invoke(retained);
  assert.equal(hasRescue(retained.messages[0]), true, 'V2 with a retained user message and a new checkpoint: rescue line');
}

{
  process.env.ULTRAPOWERS_NUDGE = 'off';
  try {
    const h = await v1(nested);
    const event = { messages: [v1Message('v1-off', 'Do the task')] };
    await h.transform(event);
    assert.equal(hasNudge(event.messages[0]), false, 'V1: ULTRAPOWERS_NUDGE=off silences the nudge');
    const invoke = await v2(proj);
    const off = { sessionID: 'v2-off', messages: [checkpoint('off')] };
    await invoke(off);
    assert.equal(hasRescue(off.messages[1]) || hasNudge(off.messages[1]), false, 'V2: ULTRAPOWERS_NUDGE=off silences both lines');
  } finally {
    delete process.env.ULTRAPOWERS_NUDGE;
  }
}

{
  const invoke = await v2(bare);
  const compacted = { sessionID: 'v2-bare-c', messages: [checkpoint()] };
  await invoke(compacted);
  assert.equal(compacted.messages.length, 2);
  assert.equal(hasRescue(compacted.messages[1]), false, 'V2 without a store: compaction stays silent');
}

console.log('Team-memory injection for OpenCode V1 and V2 passed');
