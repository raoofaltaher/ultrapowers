// The guardrail has one canonical entry point, the bash hook hooks/qa-guardrail, and several others
// that must agree with it: the bridge (OpenCode, Pi, Kimi, Antigravity, the Gemini project hook),
// the OpenCode plugin, the Hermes plugin, the Gemini launcher template and the Windows wrapper
// run-hook.cmd. They agree on what marks a run (a run record, .ultrapowers/runs/<run>.json, counted
// only up to the nearest project root; and the autopilot marker, .ultrapowers/autopilot-active, at any
// height), the deny prefixes (<P>-GUARDRAIL), the precedence (a record before the autopilot marker; QA
// before hunt among records), and on how each harness registers the hook. Nothing else tests that
// agreement; this suite does, so a new profile cannot land in one entry point only (AGENTS.md rule 9).
// Offline; node built-ins only.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n');
const readJson = (rel) => JSON.parse(read(rel));

const HOOK = 'hooks/qa-guardrail';
const BRIDGE = 'hooks/lib/guardrail-bridge.mjs';
const OPENCODE = '.opencode/plugins/ultrapowers.js';
const HERMES = '.hermes-plugin/__init__.py';
const GEMINI = 'templates/.gemini/hooks/ultrapowers-guardrail.mjs.tmpl';
const CMD = 'hooks/run-hook.cmd';

// The profiles in the order of precedence, and the prefix of each.
const MARKERS = ['qa', 'hunt', 'autopilot'];
const PREFIXES = ['QA', 'HUNT', 'AUTOPILOT'];
// Where the run walk starts in each fast path that has one of its own.
const WALK_START = { [OPENCODE]: 'const runRecordPrefix', [HERMES]: 'def _run_active', [GEMINI]: 'function runActive' };
const PREFIX_OF ={ qa: 'QA', hunt: 'HUNT', autopilot: 'AUTOPILOT' };

const sorted = (set) => [...set].sort();
const matches = (text, re) => new Set([...text.matchAll(re)].map((m) => m[1]));

// The text of a source file without its full-line comments, so an order check reads the code that
// walks the markers and not the prose that lists them.
function code(rel, { slashes = false, hashes = false } = {}) {
  return read(rel)
    .replace(slashes ? /\/\*[\s\S]*?\*\//g : hashes ? /"""[\s\S]*?"""/g : /$^/g, '')
    .split('\n')
    .filter((l) => {
      const t = l.trim();
      if (slashes && t.startsWith('//')) return false;
      if (hashes && t.startsWith('#')) return false;
      return true;
    })
    .join('\n');
}

// The position of each marker's first appearance in `text`, which must hold all three.
function markerOrder(text, label) {
  const at = MARKERS.map((m) => text.indexOf(`${m}-active`));
  MARKERS.forEach((m, i) => assert.notEqual(at[i], -1, `${label}: ${m}-active is not in the marker walk`));
  return at;
}

function assertOrdered(text, label) {
  const [qa, hunt, autopilot] = markerOrder(text, label);
  assert.ok(qa < hunt, `${label}: qa-active must come before hunt-active`);
  assert.ok(hunt < autopilot, `${label}: hunt-active must come before autopilot-active`);
}

// --- 1. The canonical sets, from the bash hook ----------------------------------------------

// The first position of each needle in `text`, which must hold all of them, in this order.
function assertSequence(text, label, needles) {
  const at = needles.map((n) => text.indexOf(n));
  needles.forEach((n, i) => assert.notEqual(at[i], -1, `${label}: ${n} is not in the run walk`));
  for (let i = 1; i < needles.length; i += 1) assert.ok(at[i - 1] < at[i], `${label}: ${needles[i - 1]} must come before ${needles[i]}`);
}

test('1. the bash hook defines the run records, the autopilot marker and the prefixes QA, HUNT, AUTOPILOT', () => {
  const hook = read(HOOK);
  assert.deepEqual(sorted(matches(hook, /\.ultrapowers\/([a-z]+)-active/g)), ['autopilot'], 'the markers of hooks/qa-guardrail');
  assert.ok(hook.includes('.ultrapowers/runs'), 'hooks/qa-guardrail does not read .ultrapowers/runs');
  assert.deepEqual(sorted(matches(hook, /([A-Z]+)-GUARDRAIL DENY/g)), sorted(PREFIXES), 'prefixes of hooks/qa-guardrail');
  // The prefix the deny() function prints is chosen per profile: the default is QA, the others are assigned.
  const assigned = matches(hook, /GUARD_PREFIX="([A-Z]+)-GUARDRAIL"/g);
  assert.deepEqual(sorted(assigned), sorted(PREFIXES), 'GUARD_PREFIX assignments of hooks/qa-guardrail');
});

// --- 2. Textual coverage of every entry point -------------------------------------------------

test('2. the bridge, the OpenCode plugin, the Hermes plugin and the Gemini template read the run records and the autopilot marker; all but the bridge name every prefix', () => {
  for (const rel of [BRIDGE, OPENCODE, HERMES, GEMINI]) {
    const text = read(rel);
    assert.ok(text.includes('autopilot-active'), `${rel} does not name autopilot-active`);
    assert.ok(/['"]runs['"]|\.ultrapowers\/runs/.test(text), `${rel} does not read the run records of .ultrapowers/runs`);
  }
  assert.ok(read(BRIDGE).includes('HUNT-GUARDRAIL'), 'the bridge does not name HUNT-GUARDRAIL for a hunt record');
  // The prefixes are read from the code, not from a comment that lists them. A fast path only decides
  // whether the hook runs, but the deny it makes itself (the hook or the bridge missing) names the
  // profile too: a record's file name starts with its profile (qa-, hunt-).
  for (const [rel, opts] of [[OPENCODE, { slashes: true }], [HERMES, { hashes: true }], [GEMINI, { slashes: true }]]) {
    const text = code(rel, opts);
    for (const p of PREFIXES) assert.ok(text.includes(`${p}-GUARDRAIL`), `${rel} does not name ${p}-GUARDRAIL in its code`);
  }
});

test('2d. the OpenCode, Hermes and Gemini walks look for run records only up to the nearest project root, and for the autopilot marker at any height', () => {
  for (const [rel, opts] of [[OPENCODE, { slashes: true }], [HERMES, { hashes: true }], [GEMINI, { slashes: true }]]) {
    const full = code(rel, opts);
    const text = full.slice(full.indexOf(WALK_START[rel]));
    assert.ok(text.length < full.length && text.includes('.json'), `${rel}: no ${WALK_START[rel]} walk reading *.json records`);
    // the records, then their prefix, then the marker, then its prefix: the order of the walk
    assertSequence(text, rel, ['runs', 'QA-GUARDRAIL', 'autopilot-active', 'AUTOPILOT-GUARDRAIL']);
    const lines = text.split('\n');
    // the project-root stop: .agents/ultrapowers.json sets a flag that only the record check reads
    const flag = lines.findIndex((l) => /past_?[Pp]roject\s*=\s*(true|True)/.test(l));
    assert.notEqual(flag, -1, `${rel}: no line sets the past-project flag`);
    assert.ok(/ultrapowers\.json/.test(lines[flag]) || /ultrapowers\.json/.test(lines[flag - 1] ?? ''), `${rel}: the past-project flag is not set by .agents/ultrapowers.json`);
    assert.ok(lines.some((l) => /!\s*pastProject|pastProject\s*\?|not past_project/.test(l) && !l.includes('autopilot')), `${rel}: the record check is not guarded by the flag`);
    const marker = lines.find((l) => l.includes('autopilot-active'));
    assert.ok(!/pastProject|past_project/.test(marker), `${rel}: the autopilot marker must count at any height`);
  }
});

test('2b. run-hook.cmd tests the run records and the autopilot marker with `if exist` lines, stops at the project root, and carries the QA and AUTOPILOT prefixes in a DENY message', () => {
  // The fail-closed walk of the Windows wrapper. Without bash it cannot ask which profile or session
  // a record belongs to, so any record denies, under the QA label (a hunt shares it).
  const cmd = read(CMD);
  const lines = cmd.split('\n');
  const exists = lines.filter((l) => /^(if not defined GUARD_PAST )?if exist /.test(l));
  assert.ok(exists.some((l) => l.includes('\\.ultrapowers\\runs\\*.json') && /^if not defined GUARD_PAST /.test(l)), 'run-hook.cmd has no `if exist` line for the run records, guarded by GUARD_PAST');
  assert.ok(exists.some((l) => l.includes('\\.ultrapowers\\autopilot-active') && !l.includes('GUARD_PAST')), 'run-hook.cmd has no unguarded `if exist` line for autopilot-active');
  assert.ok(exists.some((l) => l.includes('\\.agents\\ultrapowers.json') && l.includes('GUARD_PAST=')), 'run-hook.cmd does not set GUARD_PAST at the project root');
  for (const p of ['QA', 'AUTOPILOT']) {
    assert.ok(lines.some((l) => l.includes(`${p}-GUARDRAIL DENY:`)), `run-hook.cmd has no ${p}-GUARDRAIL DENY: message`);
  }
  assert.ok(lines.some((l) => /^:guard_qa$/.test(l)) && lines.some((l) => /^:guard_autopilot$/.test(l)), 'run-hook.cmd lost the :guard_qa or :guard_autopilot label');
});

test('2c. the delegating entry points (guardrail-cli.mjs, the Pi extension) import the bridge and carry no marker list of their own', () => {
  const cli = read('hooks/lib/guardrail-cli.mjs');
  assert.match(cli, /^import \{[^}]*runGuardrail[^}]*\} from '\.\/guardrail-bridge\.mjs';$/m, 'guardrail-cli.mjs does not import runGuardrail from the bridge');
  const pi = read('.pi/extensions/ultrapowers.ts');
  assert.match(pi, /^import \{[^}]*runGuardrail[^}]*\} from "\.\.\/\.\.\/hooks\/lib\/guardrail-bridge\.mjs";$/m, 'the Pi extension does not import runGuardrail from the bridge');
  for (const [rel, text] of [['hooks/lib/guardrail-cli.mjs', cli], ['.pi/extensions/ultrapowers.ts', pi]]) {
    for (const m of MARKERS) assert.ok(!text.includes(`${m}-active`), `${rel} carries its own marker ${m}-active; it must delegate to the bridge`);
    assert.ok(!/['"]runs['"]/.test(text), `${rel} reads the run records itself; it must delegate to the bridge`);
  }
});

// --- 3. Order of the run walk -----------------------------------------------------------------

test('3. every run walk tests the run records (QA before hunt) and then the autopilot marker', () => {
  // The hook names the autopilot marker earlier, in the deny text, so its walk starts at find_root_r.
  const hook = code(HOOK, { hashes: true });
  const walk = hook.slice(hook.indexOf('find_root_r() {'));
  assert.ok(walk.length < hook.length, 'hooks/qa-guardrail has no find_root_r() walk');
  assertSequence(walk, HOOK, ['.ultrapowers/runs', 'pick_run_r', '.ultrapowers/autopilot-active', '.agents/ultrapowers.json']);
  // which record of a project guards a call: a corrupt one, then QA, then hunt (the hook asks run-records.mjs)
  const pick = code('hooks/lib/run-records.mjs', { slashes: true });
  assertSequence(pick.slice(pick.indexOf('export function pickRun')), 'run-records.mjs pickRun', ['r.corrupt', "r.profile === 'qa'", "r.profile === 'hunt'"]);
  const bridge = code(BRIDGE, { slashes: true });
  assertSequence(bridge.slice(bridge.indexOf('function runAt')), BRIDGE, ['applicableRuns', 'r.corrupt', "r.profile === 'qa'", 'autopilot-active', 'ultrapowers.json']);
  const walkOf = (rel, opts) => { const t = code(rel, opts); return t.slice(t.indexOf(WALK_START[rel])); };
  assertSequence(walkOf(OPENCODE, { slashes: true }), OPENCODE, ['QA-GUARDRAIL', 'autopilot-active', 'ultrapowers.json']);
  assertSequence(walkOf(HERMES, { hashes: true }), HERMES, ['QA-GUARDRAIL', 'autopilot-active', 'ultrapowers.json']);
  assertSequence(walkOf(GEMINI, { slashes: true }), GEMINI, ['QA-GUARDRAIL', 'autopilot-active', 'ultrapowers.json']);
  // run-hook.cmd: the `if exist` lines of its fail-closed walk.
  const cmdWalk = read(CMD).split('\n').filter((l) => /^(if not defined GUARD_PAST )?if exist /.test(l)).join('\n');
  assertSequence(cmdWalk, CMD, ['.ultrapowers\\runs\\*.json', '.ultrapowers\\autopilot-active', '.agents\\ultrapowers.json']);
});

// --- 4. The deny line the bridge parses ---------------------------------------------------------

test('4. the DENY_RE of the bridge reads every prefix and its reason', () => {
  const m = /const DENY_RE = \/(.+)\/;/.exec(read(BRIDGE));
  assert.ok(m, 'no DENY_RE literal in the bridge');
  const re = new RegExp(m[1]);
  for (const p of PREFIXES) {
    const hit = re.exec(`${p}-GUARDRAIL DENY: x`);
    assert.ok(hit, `DENY_RE does not match ${p}-GUARDRAIL DENY: x`);
    assert.equal(hit[1], `${p}-GUARDRAIL`);
    assert.equal(hit[2], 'x');
  }
  assert.equal(re.exec('OTHER-GUARDRAIL DENY: x'), null, 'DENY_RE must not match a prefix the hook does not use');
});

// --- 5. markerPrefix behaviour --------------------------------------------------------------------

const { markerPrefix } = await import(pathToFileURL(path.join(ROOT, BRIDGE)).href);

// A project holding a run record per profile named ('qa', 'hunt') and the autopilot marker when
// 'autopilot' is named.
function projectWith(profiles) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'guardrail-parity-'));
  fs.mkdirSync(path.join(dir, '.ultrapowers', 'runs'), { recursive: true });
  fs.mkdirSync(path.join(dir, '.agents'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.agents', 'ultrapowers.json'), '{}\n');
  for (const m of profiles) {
    if (m === 'autopilot') { fs.writeFileSync(path.join(dir, '.ultrapowers', 'autopilot-active'), 'x\n'); continue; }
    const run = `${m}-T-1-0a1b2c3d`;
    fs.writeFileSync(path.join(dir, '.ultrapowers', 'runs', `${run}.json`), JSON.stringify({ run, profile: m, id: 'T-1', session: null, startedAt: new Date().toISOString() }));
  }
  fs.mkdirSync(path.join(dir, 'sub', 'deeper'), { recursive: true });
  return dir;
}

test('5. markerPrefix returns the prefix of the run, and the first of qa, hunt, autopilot when several exist', () => {
  const made = [];
  try {
    const at = (profiles) => {
      const dir = projectWith(profiles);
      made.push(dir);
      return path.join(dir, 'sub', 'deeper');
    };
    for (const m of MARKERS) assert.equal(markerPrefix(at([m])), `${PREFIX_OF[m]}-GUARDRAIL`, `a lone ${m} run`);
    assert.equal(markerPrefix(at(['qa', 'hunt'])), 'QA-GUARDRAIL');
    assert.equal(markerPrefix(at(['hunt', 'autopilot'])), 'HUNT-GUARDRAIL');
    assert.equal(markerPrefix(at(['qa', 'hunt', 'autopilot'])), 'QA-GUARDRAIL');
    assert.equal(markerPrefix(at(['qa', 'autopilot'])), 'QA-GUARDRAIL');
    assert.equal(markerPrefix(at([])), null);
  } finally {
    for (const dir of made) fs.rmSync(dir, { recursive: true, force: true });
  }
});

// --- 6. Registration of the hook on every harness ----------------------------------------------------

// The PreToolUse registrations of a Claude-style hooks file: [{ matcher, command, timeout, ... }].
function claudeStyle(json, event) {
  return (json.hooks?.[event] ?? []).flatMap((group) => (group.hooks ?? []).map((h) => ({ matcher: group.matcher, ...h })));
}

const ANY_MATCHER = new Set(['*', '.*']);
const assertMatcher = (reg, label) => {
  if (reg.matcher !== undefined) assert.ok(ANY_MATCHER.has(reg.matcher), `${label}: matcher ${JSON.stringify(reg.matcher)} must be * or .*`);
};
const endsWithGuardrail = (command) => /(^|[\s/\\"])qa-guardrail"?$/.test(command.trim());

test('6a. Claude Code, Codex and the other shell-hook harnesses register qa-guardrail on every tool with a 30 second timeout', () => {
  for (const rel of ['hooks/hooks.json', 'hooks/hooks-codex.json']) {
    const regs = claudeStyle(readJson(rel), 'PreToolUse');
    assert.equal(regs.length, 1, `${rel}: exactly one PreToolUse registration`);
    assert.ok(endsWithGuardrail(regs[0].command), `${rel}: command must end in qa-guardrail: ${regs[0].command}`);
    assert.match(regs[0].command, /run-hook\.cmd"? qa-guardrail$/, `${rel}: goes through run-hook.cmd`);
    assert.ok(regs[0].matcher !== undefined, `${rel}: has a matcher`);
    assertMatcher(regs[0], rel);
    assert.equal(regs[0].timeout, 30, `${rel}: timeout`);
  }
});

test('6b. Cursor registers qa-guardrail with failClosed: true', () => {
  const json = readJson('hooks/hooks-cursor.json');
  const regs = json.hooks?.preToolUse ?? [];
  assert.equal(regs.length, 1);
  assert.ok(endsWithGuardrail(regs[0].command), `command must end in qa-guardrail: ${regs[0].command}`);
  assert.equal(regs[0].failClosed, true, 'a Cursor guardrail that fails open lets every call through');
  assertMatcher(regs[0], 'hooks-cursor.json');
  if (regs[0].timeout !== undefined) assert.equal(regs[0].timeout, 30);
});

test('6c. Muse registers qa-guardrail on PreToolUse with a 30000 ms timeout', () => {
  const hooks = readJson('.muse-plugin/plugin.json').capabilities.hooks;
  const regs = hooks.filter((h) => h.event === 'PreToolUse');
  assert.equal(regs.length, 1);
  assert.ok(endsWithGuardrail(regs[0].command.join(' ')), `command must end in qa-guardrail: ${regs[0].command.join(' ')}`);
  assertMatcher(regs[0], '.muse-plugin/plugin.json');
  assert.equal(regs[0].timeoutMs, 30000);
});

test('6d. Kimi Code registers guardrail-cli.mjs on PreToolUse with a 30 second timeout', () => {
  const regs = readJson('.kimi-plugin/plugin.json').hooks.filter((h) => h.event === 'PreToolUse');
  assert.equal(regs.length, 1);
  assert.ok(regs[0].command.includes('guardrail-cli.mjs'), `command: ${regs[0].command}`);
  assert.ok(regs[0].matcher !== undefined, 'has a matcher');
  assertMatcher(regs[0], '.kimi-plugin/plugin.json');
  assert.equal(regs[0].timeout, 30);
});

test('6e. Antigravity registers guardrail-cli.mjs --antigravity from the root hooks.json with a 30 second timeout', () => {
  const json = readJson('hooks.json');
  const regs = (json['ultrapowers-guardrail']?.PreToolUse ?? []).flatMap((group) => (group.hooks ?? []).map((h) => ({ matcher: group.matcher, ...h })));
  assert.equal(regs.length, 1);
  assert.ok(regs[0].command.includes('guardrail-cli.mjs'), `command: ${regs[0].command}`);
  assert.ok(/\s--antigravity$/.test(regs[0].command), `the Antigravity event shape needs --antigravity: ${regs[0].command}`);
  assert.ok(regs[0].matcher !== undefined, 'has a matcher');
  assertMatcher(regs[0], 'hooks.json');
  assert.equal(regs[0].timeout, 30);
});

test('6f. init writes the Gemini CLI guardrail as a BeforeTool hook named ultrapowers-guardrail', () => {
  const src = read('skills/init/scripts/init.mjs');
  const start = src.indexOf('const GEMINI_GUARDRAIL_HOOK = {');
  assert.notEqual(start, -1, 'init.mjs lost GEMINI_GUARDRAIL_HOOK');
  const block = src.slice(start, src.indexOf('\n};', start));
  assert.match(block, /BeforeTool:/);
  assert.match(block, /matcher: '(\*|\.\*)'/);
  assert.match(block, /name: 'ultrapowers-guardrail'/);
  assert.match(block, /type: 'command'/);
  assert.match(block, /ultrapowers-guardrail\.mjs/);
  assert.match(block, /timeout: 30000\b/, 'Gemini counts the timeout in milliseconds');
});

test('6g. the hook script sets agree: Muse equals hooks/hooks.json; Cursor is that set without team-memory-postcompact', () => {
  // Every `command` string of a hooks file, in any nesting, reduced to the script run-hook.cmd is given.
  const commandsOf = (node) => (node && typeof node === 'object' ? Object.entries(node).flatMap(([k, v]) => (k === 'command' && typeof v === 'string' ? [v] : commandsOf(v))) : []);
  const scriptsOf = (rel) => new Set(commandsOf(readJson(rel)).map((c) => /run-hook\.cmd"?\s+([a-z-]+)/.exec(c)?.[1]).filter(Boolean));
  const claude = scriptsOf('hooks/hooks.json');
  const muse = new Set(readJson('.muse-plugin/plugin.json').capabilities.hooks.map((h) => path.basename(h.command[h.command.length - 1])));
  const cursor = scriptsOf('hooks/hooks-cursor.json');
  assert.ok(claude.has('qa-guardrail') && claude.has('session-start'), 'hooks/hooks.json lost a script');
  assert.deepEqual(sorted(muse), sorted(claude), 'Muse registers a different set of hook scripts than hooks/hooks.json');
  // Cursor has no post-compaction event: README.md ("Team-memory reminder after a compaction")
  // says Cursor gets the reminder at session start only.
  assert.match(read('README.md'), /Cursor gets it at session start only/);
  assert.deepEqual(sorted(cursor), sorted([...claude].filter((s) => s !== 'team-memory-postcompact')), 'Cursor registers a different set of hook scripts');
});

// --- 7. The tool guard in the OpenCode plugin, V1 and V2 -----------------------------------------------

test('7. the OpenCode plugin registers guardTool on the V1 tool.execute.before hook and in the V2 setup()', () => {
  const src = read(OPENCODE);
  assert.match(src, /export const guardTool = \(directory\) => async \(input, output\) =>/, 'guardTool is no longer exported with its (input, output) shape');
  // V1: the object UltrapowersPlugin returns.
  const v1 = src.slice(src.indexOf('export const UltrapowersPlugin'), src.indexOf('async function setup(ctx)'));
  assert.ok(v1.length > 0 && src.indexOf('async function setup(ctx)') > src.indexOf('export const UltrapowersPlugin'), 'could not isolate the V1 plugin body');
  assert.match(v1, /'tool\.execute\.before': guardTool\(directory\)/, 'V1 does not register guardTool on tool.execute.before');
  // V2: setup(ctx), up to the default export.
  const setupStart = src.indexOf('async function setup(ctx)');
  const v2 = src.slice(setupStart, src.indexOf('export default', setupStart));
  assert.ok(v2.length > 0, 'could not isolate setup()');
  // V2 wraps the same guardTool in a function that reads the event's `input` (or `args`): the
  // wrapper must be built on guardTool, and setup() must register the wrapper.
  const wrapper = /const guardV2Tool = \(directory\) => \{[\s\S]*?\n\};/.exec(src);
  assert.ok(wrapper, 'the V2 wrapper guardV2Tool is gone; if V2 registers something else, pin it here');
  assert.match(wrapper[0], /guardTool\(directory\)/, 'guardV2Tool is not built on guardTool');
  assert.match(v2, /ctx\.tool\.hook\(\s*['"]execute\.before['"],\s*guardV2Tool\(/, "V2 setup() does not register guardV2Tool through ctx.tool.hook('execute.before')");
  assert.match(src, /export default \{[^}]*\bsetup\b[^}]*\}/, 'the default export no longer carries setup');
});

// --- 8. The fork contract of the skills that run as an agent ----------------------------------------------

test('8. every skill with context: fork names an agent that exists, and its body reads that agent file when the harness does not fork', () => {
  const skillsDir = path.join(ROOT, 'skills');
  const forked = fs.readdirSync(skillsDir).filter((d) => fs.existsSync(path.join(skillsDir, d, 'SKILL.md')) && /^context: fork$/m.test(read(`skills/${d}/SKILL.md`)));
  assert.deepEqual(forked.sort(), ['qa-specialist', 'vulnerability-hunt'], 'the set of forked skills changed: pin the new one here');
  for (const dir of forked) {
    const skill = read(`skills/${dir}/SKILL.md`);
    const front = /^---\n([\s\S]*?)\n---/.exec(skill)[1];
    const agent = /^agent: (\S+)$/m.exec(front);
    assert.ok(agent, `skills/${dir}/SKILL.md has context: fork and no agent: line`);
    const name = agent[1];
    assert.ok(fs.existsSync(path.join(ROOT, 'agents', `${name}.md`)), `agents/${name}.md does not exist`);
    assert.match(read(`agents/${name}.md`), new RegExp(`^name: ${name}$`, 'm'), `agents/${name}.md has a different name`);
    const body = skill.slice(skill.indexOf('\n---', 4));
    assert.ok(body.includes(`agents/${name}.md`), `skills/${dir}/SKILL.md does not point at agents/${name}.md for the inline branch`);
    assert.match(body, /this harness did not fork/, `skills/${dir}/SKILL.md lost the inline branch ("this harness did not fork")`);
    assert.match(body, /contract inline: this harness does not fork\./, `skills/${dir}/SKILL.md lost the inline announcement`);
  }
  const manifest = JSON.parse(read('.claude-plugin/plugin.json'));
  if ('agents' in manifest) {
    assert.ok(Array.isArray(manifest.agents), 'plugin.json agents must be an array of .md files; a directory value fails to load');
    for (const entry of manifest.agents) {
      assert.ok(entry.endsWith('.md'), `plugin.json agents entry ${entry} must end with .md`);
      assert.ok(fs.existsSync(path.join(ROOT, entry)), `plugin.json agents entry ${entry} does not exist`);
    }
    for (const file of fs.readdirSync(path.join(ROOT, 'agents')).filter((n) => n.endsWith('.md'))) {
      assert.ok(manifest.agents.map((e) => path.normalize(e)).includes(path.normalize(`./agents/${file}`)), `agents/${file} is not listed in plugin.json agents`);
    }
  }
});
