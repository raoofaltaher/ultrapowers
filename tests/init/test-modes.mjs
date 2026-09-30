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
const { ALL_HARNESSES, PROPOSAL_SUFFIX, planPayload } = await import(pathToFileURL(ENGINE).href);

const gitHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ultrapowers-githome-'));
const GIT_ENV = {
  GIT_CONFIG_GLOBAL: path.join(gitHome, 'gitconfig'),
  GIT_CONFIG_NOSYSTEM: '1',
  CONTEXT7_API_KEY: 'set-for-test',
  FIRECRAWL_API_KEY: '',
  BRAVE_API_KEY: '',
};
fs.writeFileSync(GIT_ENV.GIT_CONFIG_GLOBAL, '');

function git(cwd, ...args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', env: { ...process.env, ...GIT_ENV }, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function gitRepo(dir) {
  fs.mkdirSync(dir, { recursive: true });
  git(dir, 'init', '-q');
  return dir;
}

function tmpWorkspace(name = 'ws') {
  return gitRepo(path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ultrapowers-modes-')), name));
}

function run(args, { env = {}, expectExit = 0 } = {}) {
  let stdout;
  let status = 0;
  try {
    stdout = execFileSync(process.execPath, [ENGINE, ...args], {
      encoding: 'utf8',
      env: { ...process.env, ...GIT_ENV, ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (err) {
    status = err.status;
    stdout = err.stdout;
  }
  assert.equal(status, expectExit, `exit code for ${args.join(' ')}: ${stdout}`);
  return JSON.parse(stdout);
}

function snapshot(dir, prefix = '') {
  const out = {};
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === '.git') continue;
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) Object.assign(out, snapshot(full, rel));
    else out[rel] = fs.readFileSync(full).toString('base64');
  }
  return out;
}

function changedFiles(before, after) {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  return [...keys].filter((k) => before[k] !== after[k]).sort();
}

function marker(root) {
  return JSON.parse(fs.readFileSync(path.join(root, '.agents', 'ultrapowers.json'), 'utf8'));
}

function setMarkerVersion(root, version) {
  const data = marker(root);
  data.pluginVersion = version;
  fs.writeFileSync(path.join(root, '.agents', 'ultrapowers.json'), `${JSON.stringify(data, null, 2)}\n`);
}

function scaffolded(name = 'ws', extra = []) {
  const root = tmpWorkspace(name);
  run(['scaffold', '--root', root, '--name', 'WS', '--platform', 'linux', ...extra]);
  return root;
}

function templatesCopy(changes) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ultrapowers-templates-'));
  fs.cpSync(path.join(repoRoot, 'templates'), dir, { recursive: true });
  if (changes) fs.writeFileSync(path.join(dir, 'CHANGES.json'), JSON.stringify(changes, null, 2));
  return dir;
}

test('join on a scaffolded workspace sets core.hooksPath and writes no shared file', () => {
  const root = scaffolded();
  const before = snapshot(root);
  const report = run(['join', '--root', root]);
  assert.equal(report.mode, 'join');
  assert.equal(report.hooksPath, 'set');
  assert.deepEqual(report.written, []);
  assert.deepEqual(changedFiles(before, snapshot(root)), []);
  assert.equal(git(root, 'config', '--local', '--get', 'core.hooksPath'), '.githooks');
  assert.equal(run(['join', '--root', root]).hooksPath, 'already-set');
});

test('join leaves a custom core.hooksPath alone and dry-run changes nothing', () => {
  const root = scaffolded();
  git(root, 'config', '--local', 'core.hooksPath', '.husky');
  assert.equal(run(['join', '--root', root]).hooksPath, 'kept:.husky');
  assert.equal(git(root, 'config', '--local', '--get', 'core.hooksPath'), '.husky');
  const fresh = scaffolded('ws2');
  assert.equal(run(['join', '--root', fresh, '--dry-run']).hooksPath, 'would-set');
  assert.throws(() => git(fresh, 'config', '--local', '--get', 'core.hooksPath'));
});

test('join reports the secret variables from the example file that are not defined', () => {
  const root = scaffolded();
  const report = run(['join', '--root', root]);
  assert.deepEqual(report.missingSecrets, ['FIRECRAWL_API_KEY', 'BRAVE_API_KEY']);
  assert.ok(report.nextSteps.some((s) => s.includes('FIRECRAWL_API_KEY, BRAVE_API_KEY')));
  assert.ok(report.nextSteps.some((s) => /Approve the project MCP servers/.test(s)));
});

test('join detects a nested clone added after scaffold and records it only with --record-repos', () => {
  const root = scaffolded();
  gitRepo(path.join(root, 'svc-new'));
  const before = snapshot(root);
  const report = run(['join', '--root', root]);
  assert.deepEqual(report.newRepos.map((r) => r.path), ['svc-new']);
  assert.deepEqual(changedFiles(before, snapshot(root)), []);
  assert.ok(report.nextSteps.some((s) => s.includes('--record-repos')));

  const recorded = run(['join', '--root', root, '--record-repos']);
  assert.deepEqual(recorded.written, ['.agents/ultrapowers.json', '.gitignore']);
  assert.deepEqual(changedFiles(before, snapshot(root)), ['.agents/ultrapowers.json', '.gitignore']);
  const data = marker(root);
  assert.deepEqual(data.repos.map((r) => r.path), ['svc-new']);
  assert.equal(data.topology, 'nested');
  assert.match(fs.readFileSync(path.join(root, '.gitignore'), 'utf8'), /^\/svc-new\/$/m);
  assert.deepEqual(run(['join', '--root', root]).newRepos, []);
});

test('join and upgrade refuse outside a scaffold and inside a nested clone', () => {
  const bare = tmpWorkspace('bare');
  assert.equal(run(['join', '--root', bare], { expectExit: 2 }).error.code, 'no-marker');
  assert.equal(run(['upgrade', '--root', bare], { expectExit: 2 }).error.code, 'no-marker');
  const root = scaffolded();
  const clone = gitRepo(path.join(root, 'svc-api'));
  for (const mode of ['join', 'upgrade']) {
    const report = run([mode, '--root', clone], { expectExit: 2 });
    assert.equal(report.error.code, 'nested-clone');
    assert.equal(path.resolve(report.error.workspaceRoot), path.resolve(root));
  }
  assert.deepEqual(fs.readdirSync(clone), ['.git']);
});

test('CHANGES.json lists exactly the targets the payload renders', () => {
  const changes = JSON.parse(fs.readFileSync(path.join(repoRoot, 'templates', 'CHANGES.json'), 'utf8'));
  const plan = planPayload({ root: tmpWorkspace(), name: 'X', date: '2026-09-30', platform: 'linux', nestedPointers: false }, [], [...ALL_HARNESSES]);
  const targets = [...plan.files.map((f) => f.target), ...plan.blocks.map((b) => b.target)]
    .filter((t) => path.posix.basename(t) !== '.gitkeep');
  assert.deepEqual([...targets].sort(), Object.keys(changes).sort());
});

test('upgrade lists the targets whose template changed after the marker version', () => {
  const changes = JSON.parse(fs.readFileSync(path.join(repoRoot, 'templates', 'CHANGES.json'), 'utf8'));
  for (const key of Object.keys(changes)) changes[key] = '0.0.1';
  changes['AGENTS.md'] = pluginVersion;
  changes['.gitignore'] = pluginVersion;
  const env = { ULTRAPOWERS_TEMPLATES_DIR: templatesCopy(changes) };
  const root = tmpWorkspace();
  run(['scaffold', '--root', root, '--name', 'WS', '--platform', 'linux'], { env });
  setMarkerVersion(root, '0.0.1');
  const report = run(['upgrade', '--root', root], { env });
  assert.equal(report.mode, 'upgrade');
  assert.deepEqual(report.changed, [
    { path: '.gitignore', version: pluginVersion, exists: true },
    { path: 'AGENTS.md', version: pluginVersion, exists: true },
  ]);
  assert.equal(run(['detect', '--root', root], { env }).suggestedMode, 'upgrade');
});

test('upgrade without --apply writes nothing at all', () => {
  const root = scaffolded();
  setMarkerVersion(root, '0.0.1');
  const before = snapshot(root);
  const report = run(['upgrade', '--root', root]);
  assert.ok(report.changed.some((c) => c.path === 'AGENTS.md'));
  assert.deepEqual(report.written, []);
  assert.deepEqual(changedFiles(before, snapshot(root)), []);
});

test('upgrade --apply none writes no payload file and records the plugin version', () => {
  const root = scaffolded();
  setMarkerVersion(root, '0.0.1');
  const before = snapshot(root);
  const report = run(['upgrade', '--root', root, '--apply', 'none']);
  assert.deepEqual(report.written, ['.agents/ultrapowers.json']);
  assert.deepEqual(changedFiles(before, snapshot(root)), ['.agents/ultrapowers.json']);
  assert.equal(marker(root).pluginVersion, pluginVersion);
  assert.equal(run(['detect', '--root', root]).suggestedMode, 'join');
});

test('upgrade --apply of an edited file leaves it byte-identical and writes a proposal beside it', () => {
  const root = scaffolded();
  const custom = '# Our own AGENTS.md\r\n\r\nKeep this.\r\n';
  fs.writeFileSync(path.join(root, 'AGENTS.md'), custom);
  setMarkerVersion(root, '0.0.1');
  const report = run(['upgrade', '--root', root, '--apply', 'AGENTS.md']);
  assert.equal(fs.readFileSync(path.join(root, 'AGENTS.md'), 'utf8'), custom);
  const proposal = `AGENTS.md${PROPOSAL_SUFFIX}`;
  assert.deepEqual(report.written, ['.agents/ultrapowers.json', proposal]);
  assert.match(fs.readFileSync(path.join(root, proposal), 'utf8'), /^# WS: instructions for coding agents$/m);
  assert.ok(report.nextSteps.some((s) => s.includes(proposal)));
  assert.equal(marker(root).pluginVersion, pluginVersion);
  assert.match(fs.readFileSync(path.join(root, '.gitignore'), 'utf8'), /^\*\.ultrapowers-new$/m, 'proposals are gitignored');
});

test('upgrade --apply refuses to replace an earlier proposal and writes nothing', () => {
  const root = scaffolded();
  fs.writeFileSync(path.join(root, 'AGENTS.md'), '# Our own AGENTS.md\n');
  const proposal = `AGENTS.md${PROPOSAL_SUFFIX}`;
  fs.writeFileSync(path.join(root, proposal), '# Half-merged by hand\n\nKeep these notes.\n');
  setMarkerVersion(root, '0.0.1');
  const before = snapshot(root);
  const report = run(['upgrade', '--root', root, '--apply', 'AGENTS.md'], { expectExit: 2 });
  assert.equal(report.error.code, 'proposal-exists');
  assert.deepEqual(report.error.paths, [proposal]);
  assert.deepEqual(changedFiles(before, snapshot(root)), []);
});

test('upgrade --apply writes a missing target directly and records it', () => {
  const root = scaffolded();
  fs.rmSync(path.join(root, 'playbooks', 'README.md'));
  const data = marker(root);
  data.written = data.written.filter((p) => p !== 'playbooks/README.md');
  data.pluginVersion = '0.0.1';
  fs.writeFileSync(path.join(root, '.agents', 'ultrapowers.json'), `${JSON.stringify(data, null, 2)}\n`);
  const report = run(['upgrade', '--root', root, '--apply', 'playbooks/README.md']);
  assert.deepEqual(report.written, ['.agents/ultrapowers.json', 'playbooks/README.md']);
  assert.match(fs.readFileSync(path.join(root, 'playbooks', 'README.md'), 'utf8'), /^# playbooks$/m);
  assert.ok(marker(root).written.includes('playbooks/README.md'));
});

test('upgrade --apply refuses a target that did not change and writes nothing', () => {
  const root = scaffolded();
  const before = snapshot(root);
  const report = run(['upgrade', '--root', root, '--apply', 'AGENTS.md'], { expectExit: 2 });
  assert.equal(report.error.code, 'bad-args');
  assert.deepEqual(report.error.unknown, ['AGENTS.md']);
  assert.deepEqual(changedFiles(before, snapshot(root)), []);
});

test('upgrade --apply with a broken managed block writes nothing, not even the proposals before it', () => {
  const root = scaffolded();
  const file = path.join(root, '.gitattributes');
  fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace('# <<< ultrapowers\n', ''));
  setMarkerVersion(root, '0.0.1');
  const before = snapshot(root);
  const report = run(['upgrade', '--root', root, '--apply', 'AGENTS.md,.gitattributes'], { expectExit: 2 });
  assert.equal(report.error.code, 'block-corrupt');
  assert.equal(report.error.path, '.gitattributes');
  assert.deepEqual(changedFiles(before, snapshot(root)), []);
});

test('upgrade --apply .gitignore replaces only the managed block', () => {
  const root = scaffolded();
  const file = path.join(root, '.gitignore');
  fs.writeFileSync(file, `node_modules/\n${fs.readFileSync(file, 'utf8').replace('.temp/\n', '')}dist/\n`);
  setMarkerVersion(root, '0.0.1');
  const report = run(['upgrade', '--root', root, '--apply', '.gitignore']);
  assert.deepEqual(report.blocks, [{ path: '.gitignore', action: 'replaced' }]);
  const text = fs.readFileSync(file, 'utf8');
  assert.ok(text.startsWith('node_modules/\n# >>> ultrapowers\n'));
  assert.ok(text.endsWith('# <<< ultrapowers\ndist/\n'));
  assert.match(text, /^\.temp\/$/m);
});
