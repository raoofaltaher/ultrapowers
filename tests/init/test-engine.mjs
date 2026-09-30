import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../..');
const ENGINE = path.join(repoRoot, 'skills', 'init', 'scripts', 'init.mjs');
const pluginVersion = JSON.parse(fs.readFileSync(path.join(repoRoot, '.claude-plugin', 'plugin.json'), 'utf8')).version;

const engine = await import(pathToFileURL(ENGINE).href);
const { render, applyBlock, compareVersions, InitError, KB_FOLDERS, BLOCK_START, BLOCK_END } = engine;

function tmpRepo(name = 'proj') {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'ultrapowers-init-'));
  const root = path.join(base, name);
  fs.mkdirSync(path.join(root, '.git'), { recursive: true });
  return root;
}

function run(args, { cwd, env = {}, expectExit = 0 } = {}) {
  let stdout;
  let status = 0;
  try {
    stdout = execFileSync(process.execPath, [ENGINE, ...args], {
      cwd: cwd ?? repoRoot,
      encoding: 'utf8',
      env: { ...process.env, ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (err) {
    status = err.status;
    stdout = err.stdout;
  }
  assert.equal(status, expectExit, `exit code for ${args.join(' ')}: ${stdout}`);
  return JSON.parse(stdout);
}

function listFiles(dir, prefix = '') {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.name === '.git') continue;
    if (entry.isDirectory()) out.push(...listFiles(path.join(dir, entry.name), rel));
    else out.push(rel);
  }
  return out.sort();
}

test('render substitutes every placeholder and leaves other braces alone', () => {
  const out = render('Hi {{name}} v{{pluginVersion}} {not} {{{name}}}', { name: 'demo', pluginVersion: '1.0.0' }, 'x.tmpl');
  assert.equal(out, 'Hi demo v1.0.0 {not} {demo}');
});

test('render throws InitError naming the template and the unknown key', () => {
  assert.throws(
    () => render('{{typo}}', { name: 'demo' }, 'BAD.md.tmpl'),
    (err) => err instanceof InitError && err.code === 'unknown-placeholder' && /BAD\.md\.tmpl/.test(err.message) && /typo/.test(err.message),
  );
});

test('compareVersions orders numerically', () => {
  assert.equal(compareVersions('1.0.0', '1.0.0'), 0);
  assert.equal(compareVersions('1.2.0', '1.10.0'), -1);
  assert.equal(compareVersions('2.0.0', '1.9.9'), 1);
});

test('applyBlock creates a file with the block when nothing exists', () => {
  const { content, action } = applyBlock(null, 'a/\nb/');
  assert.equal(action, 'created');
  assert.equal(content, `${BLOCK_START}\na/\nb/\n${BLOCK_END}\n`);
});

test('applyBlock appends to a gitignore without trailing newline on its own line', () => {
  const { content, action } = applyBlock('node_modules/', 'a/');
  assert.equal(action, 'appended');
  assert.equal(content, `node_modules/\n\n${BLOCK_START}\na/\n${BLOCK_END}\n`);
});

test('applyBlock replaces an existing block in place and keeps surrounding lines', () => {
  const existing = `top/\n${BLOCK_START}\nold/\n${BLOCK_END}\nbottom/\n`;
  const { content, action } = applyBlock(existing, 'new/');
  assert.equal(action, 'replaced');
  assert.equal(content, `top/\n${BLOCK_START}\nnew/\n${BLOCK_END}\nbottom/\n`);
});

test('applyBlock reports unchanged when the block is already current', () => {
  const existing = `${BLOCK_START}\nsame/\n${BLOCK_END}\n`;
  const { action } = applyBlock(existing, 'same/');
  assert.equal(action, 'unchanged');
});

test('applyBlock preserves CRLF endings of an existing file', () => {
  const { content } = applyBlock('one/\r\ntwo/\r\n', 'a/');
  assert.equal(content, `one/\r\ntwo/\r\n\r\n${BLOCK_START}\r\na/\r\n${BLOCK_END}\r\n`);
  assert.equal(content.includes('\n\n'), false, 'no bare LF inside a CRLF file');
});

test('detect on a fresh repo suggests scaffold and reports the folder name', () => {
  const root = tmpRepo('fresh-project');
  const report = run(['detect', '--root', root]);
  assert.equal(report.mode, 'detect');
  assert.equal(report.markerPresent, false);
  assert.equal(report.suggestedMode, 'scaffold');
  assert.equal(report.rootName, 'fresh-project');
  assert.equal(report.pluginVersion, pluginVersion);
  assert.deepEqual(report.repos, []);
});

test('scaffold on a fresh repo writes the baseline payload and the marker', () => {
  const root = tmpRepo();
  const report = run(['scaffold', '--root', root, '--name', 'Demo Project', '--date', '2026-09-30', '--platform', 'linux'], {
    env: { CONTEXT7_API_KEY: '' },
  });
  assert.equal(report.mode, 'scaffold');
  assert.equal(report.dryRun, false);
  for (const expected of [
    'AGENTS.md', 'CLAUDE.md', 'GEMINI.md', 'README.md',
    '.agents/mcp-secrets.env.example', '.claude/settings.json', '.claude/output-styles/ste-explanatory.md',
    '.gitleaks.toml', '.githooks/pre-commit', '.github/copilot-instructions.md', '.vscode/settings.json',
    '.gitignore', '.gitattributes',
  ]) {
    assert.ok(report.written.includes(expected), `written should include ${expected}`);
    assert.ok(fs.existsSync(path.join(root, expected)), `${expected} exists on disk`);
  }
  for (const kb of KB_FOLDERS) {
    assert.ok(report.written.includes(`${kb}/README.md`), `${kb}/README.md written`);
    assert.ok(report.written.includes(`${kb}/.gitkeep`), `${kb}/.gitkeep written`);
  }
  assert.deepEqual(report.skipped, []);
  assert.deepEqual(report.blocks.map((b) => b.action), ['created', 'created']);

  const marker = JSON.parse(fs.readFileSync(path.join(root, '.agents', 'ultrapowers.json'), 'utf8'));
  assert.equal(marker.name, 'Demo Project');
  assert.equal(marker.pluginVersion, pluginVersion);
  assert.equal(marker.scaffoldedAt, '2026-09-30');
  assert.equal(marker.topology, 'root');
  assert.deepEqual(marker.repos, []);
  assert.deepEqual(marker.kb, KB_FOLDERS);
  assert.equal(marker.harnesses.length, 14);
  assert.deepEqual([...marker.written].sort(), [...report.written].sort());
  assert.equal(marker.written.includes('.agents/ultrapowers.json'), false);

  const claude = fs.readFileSync(path.join(root, 'CLAUDE.md'), 'utf8');
  assert.equal(claude.split('\n')[0], '@AGENTS.md');
  const gemini = fs.readFileSync(path.join(root, 'GEMINI.md'), 'utf8');
  assert.equal(gemini.split('\n')[0], '@AGENTS.md');
  const agents = fs.readFileSync(path.join(root, 'AGENTS.md'), 'utf8');
  assert.match(agents.split('\n')[0], /^<!-- generated by ultrapowers init 1\.\d+\.\d+ on 2026-09-30; edit freely, init never overwrites this file -->$/);
  assert.match(agents, /^# Demo Project: instructions for coding agents$/m);
  assert.match(agents, /\.agents\/memory\//);
  assert.match(agents, /## Response style/);
  const hook = fs.readFileSync(path.join(root, '.githooks', 'pre-commit'), 'utf8').split('\n');
  assert.equal(hook[0], '#!/bin/sh');
  assert.match(hook[1], /^# generated by ultrapowers init/);
  const vscode = fs.readFileSync(path.join(root, '.vscode', 'settings.json'), 'utf8');
  assert.match(vscode.split('\n')[0], /^\/\/ generated by ultrapowers init/);
  const settings = JSON.parse(fs.readFileSync(path.join(root, '.claude', 'settings.json'), 'utf8'));
  assert.equal(settings.outputStyle, 'STE Explanatory');
  assert.deepEqual(settings.hooks, {});
  const style = fs.readFileSync(path.join(root, '.claude', 'output-styles', 'ste-explanatory.md'), 'utf8');
  assert.equal(style, fs.readFileSync(path.join(repoRoot, 'output-styles', 'ste-explanatory.md'), 'utf8').replace(/\r\n/g, '\n'));
  const gitignore = fs.readFileSync(path.join(root, '.gitignore'), 'utf8');
  assert.match(gitignore, new RegExp(`^${BLOCK_START}$`, 'm'));
  assert.match(gitignore, /^\.ultrapowers\/$/m);
  assert.match(gitignore, /^\.agents\/mcp-secrets\.env$/m);
  assert.doesNotMatch(gitignore, /^\s*$\n^\.ultrapowers/m, 'no blank line left by the empty repo list');

  for (const rel of listFiles(root)) {
    const text = fs.readFileSync(path.join(root, rel), 'utf8');
    assert.equal(text.includes('{{'), false, `${rel} still contains a placeholder`);
    assert.equal(text.includes('\r'), false, `${rel} must be LF`);
  }
  assert.ok(report.nextSteps.some((s) => s.includes('core.hooksPath')));
  assert.ok(report.nextSteps.some((s) => s.includes('CONTEXT7_API_KEY')));
});

test('scaffold a second time writes nothing and reports every file as skipped', () => {
  const root = tmpRepo();
  const first = run(['scaffold', '--root', root, '--name', 'Demo', '--platform', 'linux']);
  const before = listFiles(root).map((rel) => [rel, fs.readFileSync(path.join(root, rel))]);
  const second = run(['scaffold', '--root', root, '--name', 'Demo', '--platform', 'linux']);
  assert.deepEqual(second.written, []);
  assert.deepEqual([...second.skipped].sort(), [...first.written.filter((p) => p !== '.gitignore' && p !== '.gitattributes'), '.agents/ultrapowers.json'].sort());
  assert.deepEqual(second.blocks.map((b) => b.action), ['unchanged', 'unchanged']);
  for (const [rel, bytes] of before) {
    assert.ok(fs.readFileSync(path.join(root, rel)).equals(bytes), `${rel} unchanged`);
  }
});

test('a pre-existing AGENTS.md stays byte-identical and is reported skipped', () => {
  const root = tmpRepo();
  const custom = '# My own rules\r\n\r\nDo not touch.\r\n';
  fs.writeFileSync(path.join(root, 'AGENTS.md'), custom);
  const report = run(['scaffold', '--root', root, '--name', 'Demo', '--platform', 'linux']);
  assert.ok(report.skipped.includes('AGENTS.md'));
  assert.equal(report.written.includes('AGENTS.md'), false);
  assert.equal(fs.readFileSync(path.join(root, 'AGENTS.md'), 'utf8'), custom);
  const marker = JSON.parse(fs.readFileSync(path.join(root, '.agents', 'ultrapowers.json'), 'utf8'));
  assert.equal(marker.written.includes('AGENTS.md'), false);
});

test('dry-run writes nothing and lists what scaffold would write', () => {
  const root = tmpRepo();
  const report = run(['scaffold', '--root', root, '--name', 'Demo', '--dry-run', '--platform', 'linux']);
  assert.equal(report.dryRun, true);
  assert.ok(report.written.includes('AGENTS.md'));
  assert.deepEqual(listFiles(root), []);
});

test('harness filter omits files of unselected harnesses', () => {
  const root = tmpRepo();
  const report = run(['scaffold', '--root', root, '--name', 'Demo', '--harnesses', 'codex,cursor', '--platform', 'linux']);
  assert.equal(report.written.includes('CLAUDE.md'), false);
  assert.equal(report.written.includes('GEMINI.md'), false);
  assert.equal(report.written.includes('.claude/settings.json'), false);
  assert.ok(report.omitted.includes('CLAUDE.md'));
  assert.ok(report.omitted.includes('GEMINI.md'));
  assert.ok(report.written.includes('AGENTS.md'));
  const marker = JSON.parse(fs.readFileSync(path.join(root, '.agents', 'ultrapowers.json'), 'utf8'));
  assert.deepEqual(marker.harnesses, ['codex', 'cursor']);
});

test('unknown harness id is rejected before anything is written', () => {
  const root = tmpRepo();
  const report = run(['scaffold', '--root', root, '--harnesses', 'codex,emacs'], { expectExit: 2 });
  assert.equal(report.error.code, 'bad-args');
  assert.deepEqual(listFiles(root), []);
});

test('nested clones are detected, gitignored, recorded, and get pointers only on opt-in', () => {
  const root = tmpRepo('workspace');
  for (const repo of ['svc-api', 'web-app']) {
    fs.mkdirSync(path.join(root, repo, '.git'), { recursive: true });
    fs.writeFileSync(path.join(root, repo, '.git', 'HEAD'), 'ref: refs/heads/develop\n');
  }
  fs.mkdirSync(path.join(root, 'not-a-repo'));
  const report = run(['scaffold', '--root', root, '--name', 'WS', '--platform', 'linux']);
  assert.deepEqual(report.repos, [
    { name: 'svc-api', path: 'svc-api', defaultBranch: 'develop' },
    { name: 'web-app', path: 'web-app', defaultBranch: 'develop' },
  ]);
  const marker = JSON.parse(fs.readFileSync(path.join(root, '.agents', 'ultrapowers.json'), 'utf8'));
  assert.equal(marker.topology, 'nested');
  assert.equal(marker.repos.length, 2);
  const gitignore = fs.readFileSync(path.join(root, '.gitignore'), 'utf8');
  assert.match(gitignore, /^\/svc-api\/$/m);
  assert.match(gitignore, /^\/web-app\/$/m);
  assert.equal(fs.existsSync(path.join(root, 'svc-api', 'AGENTS.md')), false, 'no pointer without opt-in');
  const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');
  assert.match(readme, /`svc-api\/`/);

  const root2 = tmpRepo('workspace2');
  fs.mkdirSync(path.join(root2, 'svc-api', '.git'), { recursive: true });
  fs.writeFileSync(path.join(root2, 'svc-api', 'AGENTS.md'), 'keep me\n');
  fs.mkdirSync(path.join(root2, 'web-app', '.git'), { recursive: true });
  const report2 = run(['scaffold', '--root', root2, '--name', 'WS', '--nested-pointers', '--platform', 'linux']);
  assert.ok(report2.written.includes('web-app/AGENTS.md'));
  assert.ok(report2.skipped.includes('svc-api/AGENTS.md'));
  assert.equal(fs.readFileSync(path.join(root2, 'svc-api', 'AGENTS.md'), 'utf8'), 'keep me\n');
  const pointer = fs.readFileSync(path.join(root2, 'web-app', 'AGENTS.md'), 'utf8');
  assert.match(pointer, /^# web-app$/m);
  assert.match(pointer, /\.\.\/\.agents\/memory\//);
  assert.match(pointer, /`WS` workspace/);
});

test('scaffold inside a nested clone refuses and names the workspace root', () => {
  const root = tmpRepo('workspace');
  run(['scaffold', '--root', root, '--name', 'WS', '--platform', 'linux']);
  const clone = path.join(root, 'svc-api');
  fs.mkdirSync(path.join(clone, '.git'), { recursive: true });
  const report = run(['scaffold', '--root', clone, '--name', 'svc-api'], { expectExit: 2 });
  assert.equal(report.error.code, 'nested-clone');
  assert.equal(path.resolve(report.error.workspaceRoot), path.resolve(root));
  assert.deepEqual(listFiles(clone), []);
});

test('an unknown placeholder aborts before any file is written', () => {
  const root = tmpRepo();
  const templatesCopy = fs.mkdtempSync(path.join(os.tmpdir(), 'ultrapowers-templates-'));
  fs.cpSync(path.join(repoRoot, 'templates'), templatesCopy, { recursive: true });
  fs.writeFileSync(path.join(templatesCopy, 'BAD.md.tmpl'), 'oops {{typo}}\n');
  const report = run(['scaffold', '--root', root, '--name', 'Demo', '--platform', 'linux'], {
    env: { ULTRAPOWERS_TEMPLATES_DIR: templatesCopy },
    expectExit: 2,
  });
  assert.equal(report.error.code, 'unknown-placeholder');
  assert.match(report.error.message, /BAD\.md\.tmpl/);
  assert.deepEqual(listFiles(root), []);
});

test('existing gitignore without trailing newline and CRLF gitattributes both gain a clean block', () => {
  const root = tmpRepo();
  fs.writeFileSync(path.join(root, '.gitignore'), 'node_modules/');
  fs.writeFileSync(path.join(root, '.gitattributes'), '*.png binary\r\n');
  run(['scaffold', '--root', root, '--name', 'Demo', '--platform', 'linux']);
  const gitignore = fs.readFileSync(path.join(root, '.gitignore'), 'utf8');
  assert.ok(gitignore.startsWith(`node_modules/\n\n${BLOCK_START}\n`));
  const attrs = fs.readFileSync(path.join(root, '.gitattributes'), 'utf8');
  assert.ok(attrs.startsWith(`*.png binary\r\n\r\n${BLOCK_START}\r\n`));
  assert.equal(/[^\r]\n/.test(attrs), false, 'gitattributes stays CRLF throughout');
});

test('a corrupt marker is reported as marker-corrupt by detect', () => {
  const root = tmpRepo();
  fs.mkdirSync(path.join(root, '.agents'));
  fs.writeFileSync(path.join(root, '.agents', 'ultrapowers.json'), '{ "name": "x", ');
  const report = run(['detect', '--root', root]);
  assert.equal(report.markerPresent, true);
  assert.equal(report.marker, 'corrupt');
  assert.equal(report.suggestedMode, 'repair');
  assert.match(report.markerError, /not valid JSON/);
});

test('the engine runs when invoked through a symlinked or junctioned plugin directory', () => {
  const root = tmpRepo();
  const linkBase = fs.mkdtempSync(path.join(os.tmpdir(), 'ultrapowers-link-'));
  const linkedScripts = path.join(linkBase, 'scripts');
  fs.symlinkSync(path.dirname(ENGINE), linkedScripts, 'junction');
  const stdout = execFileSync(process.execPath, [path.join(linkedScripts, 'init.mjs'), 'detect', '--root', root], { encoding: 'utf8' });
  assert.equal(JSON.parse(stdout).suggestedMode, 'scaffold');
});
