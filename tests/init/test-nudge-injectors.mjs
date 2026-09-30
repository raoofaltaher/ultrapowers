import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../..');
const OPENCODE = path.join(repoRoot, '.opencode', 'plugins', 'ultrapowers.js');
const PI = path.join(repoRoot, '.pi', 'extensions', 'ultrapowers.ts');
const VERSION = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8')).version;

const SCAFFOLD = 'This project has no ultrapowers scaffold. Offer /ultrapowers:init before other work.';
const UPGRADE = `This project's ultrapowers scaffold is from version 0.0.1; the plugin is ${VERSION}. Offer /ultrapowers:init to upgrade before other work.`;
const REPAIR = "This project's .agents/ultrapowers.json is unreadable. Offer /ultrapowers:init to repair it before other work.";
const ALL = [SCAFFOLD, 'Offer /ultrapowers:init to upgrade', REPAIR];

const base = fs.mkdtempSync(path.join(os.tmpdir(), 'ultrapowers-nudge-'));
function dirAt(...parts) {
  const dir = path.join(base, ...parts);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}
function markerAt(dir, content) {
  fs.mkdirSync(path.join(dir, '.agents'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.agents', 'ultrapowers.json'), content);
  return dir;
}
const FIXTURES = {
  absent: dirAt('absent'),
  current: markerAt(dirAt('current'), JSON.stringify({ name: 'x', pluginVersion: VERSION })),
  older: markerAt(dirAt('older'), JSON.stringify({ name: 'x', pluginVersion: '0.0.1' })),
  corrupt: markerAt(dirAt('corrupt'), '{ "name": "x", '),
  nested: dirAt('current', 'svc-api'),
};

const EXPECTED = { absent: SCAFFOLD, current: null, older: UPGRADE, corrupt: REPAIR, nested: null };

let generation = 0;
const load = (file) => import(`${pathToFileURL(file).href}?nudge=${++generation}`);

function assertNudge(text, expected, label) {
  assert.ok(text.includes('You have ultrapowers.'), `${label}: bootstrap present`);
  assert.ok(text.trimEnd().endsWith('</EXTREMELY_IMPORTANT>'), `${label}: nudge sits inside the bootstrap block`);
  if (expected) {
    assert.ok(text.includes(`\n${expected}\n</EXTREMELY_IMPORTANT>`), `${label}: expected nudge line`);
    assert.equal(ALL.filter((n) => text.includes(n)).length, 1, `${label}: exactly one nudge`);
  } else {
    for (const nudge of ALL) assert.equal(text.includes(nudge), false, `${label}: no nudge expected`);
  }
}

async function openCodeV1(directory) {
  const mod = await load(OPENCODE);
  const hooks = await mod.UltrapowersPlugin({ client: null, directory });
  const output = { messages: [{ info: { role: 'user', sessionID: 's1' }, parts: [{ type: 'text', text: 'hi' }] }] };
  await hooks['experimental.chat.messages.transform']({}, output);
  return output.messages[0].parts[0].text;
}

async function openCodeV2(ctxExtra, event = {}) {
  const mod = await load(OPENCODE);
  let hook;
  await mod.default.setup({
    ...ctxExtra,
    skill: { transform: async (fn) => fn({ add: () => {} }) },
    session: { hook: async (name, callback) => { if (name === 'context') hook = callback; } },
  });
  const payload = { sessionID: 's2', messages: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }], ...event };
  await hook(payload);
  return payload.messages[0].content[0].text;
}

async function pi(ctx) {
  const mod = await load(PI);
  const handlers = new Map();
  mod.default({ on: (event, handler) => handlers.set(event, handler) });
  await handlers.get('session_start')({ type: 'session_start', reason: 'startup' }, ctx);
  const result = await handlers.get('context')({ type: 'context', messages: [{ role: 'user', content: [{ type: 'text', text: 'hi' }], timestamp: 1 }] }, ctx);
  return result.messages[0].content[0].text;
}

for (const [kind, dir] of Object.entries(FIXTURES)) {
  test(`OpenCode V1 injector, marker ${kind}`, async () => {
    assertNudge(await openCodeV1(dir), EXPECTED[kind], `v1 ${kind}`);
  });
  test(`OpenCode V2 injector, marker ${kind}`, async () => {
    assertNudge(await openCodeV2({ directory: dir }), EXPECTED[kind], `v2 ${kind}`);
  });
  test(`Pi injector, marker ${kind}`, async () => {
    assertNudge(await pi({ cwd: dir }), EXPECTED[kind], `pi ${kind}`);
  });
}

test('OpenCode V2 prefers the directory on the context event', async () => {
  assertNudge(await openCodeV2({ directory: FIXTURES.current }, { directory: FIXTURES.older }), UPGRADE, 'v2 event directory');
});

test('OpenCode V2 without any project directory adds no nudge', async () => {
  assertNudge(await openCodeV2({}), null, 'v2 no directory');
});

test('Pi without ctx.cwd uses the process working directory', async () => {
  const previous = process.cwd();
  process.chdir(FIXTURES.older);
  try {
    assertNudge(await pi({}), UPGRADE, 'pi process cwd');
  } finally {
    process.chdir(previous);
  }
});

test('the injectors never write into the project', async () => {
  const list = (dir) => fs.readdirSync(dir, { recursive: true }).sort();
  const before = list(base);
  for (const dir of Object.values(FIXTURES)) {
    await openCodeV1(dir);
    await openCodeV2({ directory: dir });
    await pi({ cwd: dir });
  }
  assert.deepEqual(list(base), before);
});

test('using-ultrapowers tells hookless harnesses to look for the marker', () => {
  const skill = fs.readFileSync(path.join(repoRoot, 'skills', 'using-ultrapowers', 'SKILL.md'), 'utf8');
  const start = skill.indexOf('## Project Scaffold');
  const end = skill.indexOf('## User Instructions');
  assert.ok(start > skill.indexOf('## Platform Adaptation') && end > start, 'section sits between Platform Adaptation and User Instructions');
  const section = skill.slice(start, end);
  for (const needle of ['.agents/ultrapowers.json', '/ultrapowers:init', 'Codex', 'Gemini CLI', 'Kimi Code', 'Devin', 'your human partner']) {
    assert.ok(section.includes(needle), `section mentions ${needle}`);
  }
  for (const nudge of ALL) assert.equal(section.includes(nudge), false, 'section never repeats a nudge sentence');
  assert.ok(section.split(/\s+/).length <= 130, 'section stays short: this skill loads every session');
});
