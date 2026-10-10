import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import test from 'node:test';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '../..');
const scriptPath = resolve(repoRoot, 'skills/team-memory/scripts/memory-lint.mjs');
const { lintStore, parseFrontmatter, CODES } = await import(pathToFileURL(scriptPath).href);

const DIR_OF = { gotcha: 'gotchas', decision: 'decisions', subsystem: 'subsystems' };
const PREAMBLE = '# Team memory: index\n\nPreamble line one.\nPreamble line two.\n\n';

function frontmatter({ name, type, date = '2026-09-30', description = 'What this entry tells you' }) {
  return `---\nname: ${name}\ndescription: ${description}\nmetadata:\n  type: ${type}\ndate: ${date}\n---\n`;
}

const BODY = 'The fact in one sentence.\n\n**Why:** because of a verified cause.\n\n**How to apply:** do the safe thing.\n';

// makeStore builds <tmp>/.agents/memory with README.md, MEMORY.md and the
// three folders. Each entry: { name, type, file?, dir?, orphan?, date?,
// description?, body?, raw? }. raw replaces the whole file content.
function makeStore({ entries = [], index, extraFiles = {}, config, eol = '\n' } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'memory-lint-'));
  const store = join(root, '.agents', 'memory');
  for (const d of Object.values(DIR_OF)) mkdirSync(join(store, d), { recursive: true });
  writeFileSync(join(store, 'README.md'), '# Team memory\n');
  const lines = { gotchas: [], decisions: [], subsystems: [] };
  for (const e of entries) {
    const dir = e.dir ?? DIR_OF[e.type];
    const file = e.file ?? e.name;
    const content = e.raw ?? frontmatter(e) + (e.body ?? BODY);
    writeFileSync(join(store, dir, `${file}.md`), content.replaceAll('\n', eol));
    if (!e.orphan) lines[dir].push(`- [${e.name}](${dir}/${file}.md) — one-line hook (2026-09)`);
  }
  const defaultIndex = PREAMBLE
    + `## Gotchas\n${lines.gotchas.join('\n')}\n\n## Decisions\n${lines.decisions.join('\n')}\n\n## Subsystems\n${lines.subsystems.join('\n')}\n`;
  writeFileSync(join(store, 'MEMORY.md'), (index ?? defaultIndex).replaceAll('\n', eol));
  for (const [rel, content] of Object.entries(extraFiles)) {
    mkdirSync(dirname(join(store, rel)), { recursive: true });
    writeFileSync(join(store, rel), content);
  }
  if (config) writeFileSync(join(root, '.agents', 'ultrapowers.json'), JSON.stringify(config));
  return { root, store };
}

const codes = (findings) => findings.map((f) => f.code);
const only = (findings, code) => findings.filter((f) => f.code === code);

test('CODES lists the eleven finding codes', () => {
  assert.deepEqual([...CODES].sort(), ['BUDGET', 'DANGLING', 'FM_DATE', 'FM_KEYS', 'FM_MISSING', 'FM_NAME', 'FM_TYPE', 'NEAR_DUP', 'ORPHAN', 'STRAY', 'WIKILINK']);
});

test('parseFrontmatter reads scalars, one nested map, quoted values and CRLF', () => {
  const lf = parseFrontmatter('---\nname: a-b\ndescription: has: a colon\nmetadata:\n  type: gotcha\ndate: "2026-09-30"\n---\nbody');
  assert.deepEqual(lf, { data: { name: 'a-b', description: 'has: a colon', metadata: { type: 'gotcha' }, date: '2026-09-30' }, malformed: null });
  const crlf = parseFrontmatter('---\r\nname: a\r\nmetadata:\r\n  type: decision\r\n---\r\nbody');
  assert.deepEqual(crlf.data, { name: 'a', metadata: { type: 'decision' } });
  assert.equal(parseFrontmatter('no block here'), null);
  assert.equal(parseFrontmatter('---\nname: a\nthis line has no colon\n---\n').malformed, 'this line has no colon');
});

test('a clean store with one entry per type has no findings', () => {
  const { store } = makeStore({ entries: [
    { name: 'docker-tests-need-node', type: 'gotcha' },
    { name: 'memory-is-a-git-store', type: 'decision', body: 'Fact. See [[docker-tests-need-node]].\n\n**Why:** x.\n\n**How to apply:** y.\n' },
    { name: 'how-the-scheduler-runs', type: 'subsystem' },
  ] });
  assert.deepEqual(lintStore(store), []);
});

test('a fresh store with three empty headings has no findings', () => {
  const { store } = makeStore();
  assert.deepEqual(lintStore(store), []);
});

test('BUDGET fires when the index exceeds the default 150 lines', () => {
  const index = PREAMBLE + '## Gotchas\n' + Array.from({ length: 150 }, (_, i) => `- filler ${i}`).join('\n') + '\n\n## Decisions\n\n## Subsystems\n';
  const { store } = makeStore({ index });
  const f = only(lintStore(store), 'BUDGET');
  assert.equal(f.length, 1);
  assert.equal(f[0].path, 'MEMORY.md');
  assert.match(f[0].message, /budget 150/);
  assert.deepEqual(codes(lintStore(store, { budget: 500 })), []);
});

test('BUDGET reads memory.indexBudget from .agents/ultrapowers.json', () => {
  const index = PREAMBLE + '## Gotchas\n\n## Decisions\n\n## Subsystems\n' + 'x\n'.repeat(5);
  const { store } = makeStore({ index, config: { memory: { indexBudget: 10 } } });
  const f = only(lintStore(store), 'BUDGET');
  assert.equal(f.length, 1);
  assert.match(f[0].message, /budget 10/);
});

test('BUDGET ignores a stray memory.path left in a marker by an older scaffold', () => {
  const index = PREAMBLE + '## Gotchas\n\n## Decisions\n\n## Subsystems\n' + 'x\n'.repeat(5);
  const { store } = makeStore({ index, config: { memory: { path: '.agents/memory', indexBudget: 10 } } });
  const f = only(lintStore(store), 'BUDGET');
  assert.equal(f.length, 1);
  assert.match(f[0].message, /budget 10/);
});

test('DANGLING fires for an index link whose file does not exist', () => {
  const index = PREAMBLE + '## Gotchas\n- [gone](gotchas/gone.md) — hook (2026-09)\n\n## Decisions\n\n## Subsystems\n';
  const { store } = makeStore({ index });
  const f = only(lintStore(store), 'DANGLING');
  assert.equal(f.length, 1);
  assert.equal(f[0].path, 'MEMORY.md:7');
  assert.match(f[0].message, /gotchas\/gone\.md/);
});

test('ORPHAN fires for an entry file with no index line', () => {
  const { store } = makeStore({ entries: [{ name: 'lonely-entry', type: 'gotcha', orphan: true }] });
  const f = only(lintStore(store), 'ORPHAN');
  assert.deepEqual(f.map((x) => x.path), ['gotchas/lonely-entry.md']);
});

test('STRAY fires for a top-level file or an unknown folder', () => {
  const { store } = makeStore({ extraFiles: { '2026-01-05-session-summary.md': '# summary\n', 'notes/thing.md': 'x\n' } });
  const f = only(lintStore(store), 'STRAY');
  assert.deepEqual(f.map((x) => x.path).sort(), ['2026-01-05-session-summary.md', 'notes/']);
});

test('FM_MISSING fires for an entry without a frontmatter block', () => {
  const { store } = makeStore({ entries: [{ name: 'no-frontmatter', type: 'gotcha', raw: 'Just a body.\n' }] });
  assert.deepEqual(codes(lintStore(store)), ['FM_MISSING']);
});

test('FM_KEYS fires for the old title/date/area schema and for extra keys', () => {
  const old = makeStore({ entries: [{ name: 'old-schema', type: 'gotcha', raw: '---\ntitle: old\ndate: 2026-09-30\narea: x\n---\nbody\n' }] });
  assert.ok(codes(lintStore(old.store)).includes('FM_KEYS'));
  const extra = makeStore({ entries: [{ name: 'extra-key', type: 'gotcha', raw: '---\nname: extra-key\ndescription: d\nmetadata:\n  type: gotcha\n  area: x\ndate: 2026-09-30\nowner: me\n---\nbody\n' }] });
  const f = only(lintStore(extra.store), 'FM_KEYS');
  assert.equal(f.length, 2, 'one for top-level keys, one for metadata keys');
});

test('FM_NAME fires when name differs from the file name', () => {
  const { store } = makeStore({ entries: [{ name: 'declared-name', file: 'file-name', type: 'gotcha' }] });
  const f = only(lintStore(store), 'FM_NAME');
  assert.equal(f.length, 1);
  assert.equal(f[0].path, 'gotchas/file-name.md');
});

test('FM_TYPE fires for an unknown type and for a type that does not match its folder', () => {
  const unknown = makeStore({ entries: [{ name: 'a-note', type: 'note', dir: 'gotchas' }] });
  assert.match(only(lintStore(unknown.store), 'FM_TYPE')[0].message, /not gotcha, decision or subsystem/);
  const mismatch = makeStore({ entries: [{ name: 'misfiled', type: 'decision', dir: 'gotchas' }] });
  assert.match(only(lintStore(mismatch.store), 'FM_TYPE')[0].message, /does not match folder gotchas\//);
});

test('FM_DATE fires for non-ISO or impossible dates', () => {
  for (const date of ['2026-9-30', '30/09/2026', '2026-02-30', 'yesterday']) {
    const { store } = makeStore({ entries: [{ name: 'dated', type: 'gotcha', date }] });
    assert.deepEqual(codes(lintStore(store)), ['FM_DATE'], date);
  }
});

test('WIKILINK fires for [[name]] that names no entry, in any folder', () => {
  const { store } = makeStore({ entries: [
    { name: 'source', type: 'gotcha', body: 'Fact [[nowhere]] and [[target]].\n\n**Why:** x.\n\n**How to apply:** y.\n' },
    { name: 'target', type: 'subsystem' },
  ] });
  const f = only(lintStore(store), 'WIKILINK');
  assert.equal(f.length, 1);
  assert.match(f[0].message, /\[\[nowhere\]\]/);
});

test('WIKILINK ignores [[ ]] inside inline code and fenced code blocks', () => {
  const fence = '`'.repeat(3);
  const body = [
    'Bash tests need `[[ -n "$x" ]]` and TOML tables look like `[[bin]]`.',
    '',
    `${fence}bash`,
    'if [[ -f .env ]]; then echo yes; fi',
    fence,
    '',
    '**Why:** x.',
    '',
    '**How to apply:** y.',
    '',
  ].join('\n');
  const { store } = makeStore({ entries: [{ name: 'bash-double-brackets', type: 'gotcha', body }] });
  assert.deepEqual(lintStore(store), []);
});

test('STRAY ignores dot-entries and operating-system files at the store root', () => {
  const { store } = makeStore({ extraFiles: { '.DS_Store': 'x', 'Thumbs.db': 'x', 'desktop.ini': 'x', '.obsidian/app.json': '{}' } });
  assert.deepEqual(lintStore(store), []);
});

test('NEAR_DUP fires once for names differing only by punctuation or a trailing s', () => {
  const { store } = makeStore({ entries: [
    { name: 'docker-tests-gitbash', type: 'gotcha' },
    { name: 'docker_tests_gitbashs', type: 'gotcha' },
  ] });
  const f = only(lintStore(store), 'NEAR_DUP');
  assert.equal(f.length, 1);
  assert.match(f[0].message, /docker-tests-gitbash\.md/);
});

test('CRLF index and entries lint exactly like LF', () => {
  const { store } = makeStore({ entries: [{ name: 'crlf-entry', type: 'gotcha' }], eol: '\r\n' });
  assert.deepEqual(lintStore(store), []);
});

test('a real personal auto-memory file lints clean once promoted: metadata reduced to type, date added', () => {
  const body = 'The fact.\n\n**Why:** cause.\n\n**How to apply:** action.\n';
  // The key shape a personal auto-memory layer writes: its own type set and
  // extra metadata keys. Adding date alone is not a promotion.
  const personal = '---\nname: promoted-fact\ndescription: Copied from a personal memory layer\nmetadata:\n  node_type: memory\n  type: feedback\n  originSessionId: s-1\n  modified: 2026-09-01\ndate: 2026-09-30\n---\n' + body;
  const raw = makeStore({ entries: [{ name: 'promoted-fact', type: 'gotcha', raw: personal }] });
  assert.deepEqual(codes(lintStore(raw.store)).sort(), ['FM_KEYS', 'FM_TYPE']);
  const promoted = '---\nname: promoted-fact\ndescription: Copied from a personal memory layer\nmetadata:\n  type: gotcha\ndate: 2026-09-30\n---\n' + body;
  const done = makeStore({ entries: [{ name: 'promoted-fact', type: 'gotcha', raw: promoted }] });
  assert.deepEqual(lintStore(done.store), []);
});

test('CLI prints one line per finding and exits 1; clean store exits 0 with no output', () => {
  const dirty = makeStore({ entries: [{ name: 'lonely', type: 'gotcha', orphan: true }] });
  const bad = spawnSync(process.execPath, [scriptPath, dirty.store], { encoding: 'utf8' });
  assert.equal(bad.status, 1);
  const lines = bad.stdout.trim().split('\n');
  assert.equal(lines.length, 1);
  assert.match(lines[0], /^ORPHAN gotchas\/lonely\.md: .+$/);

  const clean = makeStore();
  const ok = spawnSync(process.execPath, [scriptPath, clean.store], { encoding: 'utf8' });
  assert.equal(ok.status, 0);
  assert.equal(ok.stdout, '');

  const budget = spawnSync(process.execPath, [scriptPath, clean.store, '--budget', '3'], { encoding: 'utf8' });
  assert.equal(budget.status, 1);
  assert.match(budget.stdout, /^BUDGET MEMORY\.md: /);

  const usage = spawnSync(process.execPath, [scriptPath], { encoding: 'utf8' });
  assert.equal(usage.status, 2);
  assert.match(usage.stderr, /Usage: /);
});
