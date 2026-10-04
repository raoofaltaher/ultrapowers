import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { execFileSync, spawn } from 'node:child_process';
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

test('join leaves a global core.hooksPath in charge and sets nothing locally', () => {
  const root = scaffolded();
  const globalConfig = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ultrapowers-global-')), 'gitconfig');
  fs.writeFileSync(globalConfig, '[core]\n\thooksPath = /corp/hooks\n');
  const env = { GIT_CONFIG_GLOBAL: globalConfig };
  assert.equal(run(['join', '--root', root, '--dry-run'], { env }).hooksPath, 'kept:/corp/hooks');
  const report = run(['join', '--root', root], { env });
  assert.equal(report.hooksPath, 'kept:/corp/hooks');
  assert.ok(report.nextSteps.some((s) => s.includes('/corp/hooks')));
  assert.throws(() => git(root, 'config', '--local', '--get', 'core.hooksPath'));
});

test('join does not set core.hooksPath over hooks already in .git/hooks and names them', () => {
  const root = scaffolded();
  const hook = path.join(root, '.git', 'hooks', 'pre-push');
  fs.writeFileSync(hook, '#!/bin/sh\ngit lfs pre-push "$@"\n');
  fs.chmodSync(hook, 0o755);
  assert.equal(run(['join', '--root', root, '--dry-run']).hooksPath, 'existing-hooks:pre-push');
  const report = run(['join', '--root', root]);
  assert.equal(report.hooksPath, 'existing-hooks:pre-push');
  assert.ok(report.nextSteps.some((s) => s.includes('pre-push')));
  assert.throws(() => git(root, 'config', '--local', '--get', 'core.hooksPath'));
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

test('upgrade --record-repos with a bad --apply writes nothing, not even the .gitignore block', () => {
  const root = scaffolded();
  gitRepo(path.join(root, 'svc-new'));
  setMarkerVersion(root, '0.0.1');
  const before = snapshot(root);
  const report = run(['upgrade', '--root', root, '--record-repos', '--apply', 'no/such/target.md'], { expectExit: 2 });
  assert.equal(report.error.code, 'bad-args');
  assert.deepEqual(changedFiles(before, snapshot(root)), []);
});

test('a marker whose repos is not a list is marker-corrupt for upgrade, not a crash', () => {
  const root = scaffolded();
  const data = marker(root);
  data.repos = 'svc-api';
  data.pluginVersion = '0.0.1';
  fs.writeFileSync(path.join(root, '.agents', 'ultrapowers.json'), `${JSON.stringify(data, null, 2)}\n`);
  const before = snapshot(root);
  const report = run(['upgrade', '--root', root, '--apply', 'none'], { expectExit: 2 });
  assert.equal(report.error.code, 'marker-corrupt');
  assert.deepEqual(changedFiles(before, snapshot(root)), []);
});

test('a nested clone records its remote default branch, not the branch checked out', () => {
  const origin = gitRepo(path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ultrapowers-origin-')), 'svc'));
  git(origin, 'checkout', '-q', '-b', 'trunk');
  git(origin, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '--allow-empty', '-m', 'init');
  const root = tmpWorkspace();
  git(root, 'clone', '-q', origin, 'svc');
  git(path.join(root, 'svc'), 'checkout', '-q', '-b', 'feature-x');
  run(['scaffold', '--root', root, '--name', 'WS', '--platform', 'linux']);
  assert.deepEqual(marker(root).repos, [{ name: 'svc', path: 'svc', defaultBranch: 'trunk' }]);
});

// tickets mode (spec docs/ultrapowers/specs/2026-10-02-ticket-sources-design.md, section 6).
function ticketsExample() {
  return {
    transport: 'auto',
    sources: [
      { prefix: 'GL', provider: 'gitlab', host: 'gitlab.com', namespace: 'acme/platform', defaultProject: 'tracker' },
      { prefix: 'GH', provider: 'github', owner: 'acme' },
      { prefix: 'ODOO', provider: 'odoo', url: 'https://erp.example.com', mcpUrl: 'https://erp.example.com/mcp', mcpHeader: 'Authorization: Bearer' },
    ],
  };
}

function sourcesFile(tickets) {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ultrapowers-sources-')), 'sources.json');
  fs.writeFileSync(file, JSON.stringify(tickets));
  return file;
}

const TICKET_IDS = ['tickets-gl', 'tickets-gh', 'tickets-odoo'];

test('tickets --dry-run reports the change and writes nothing', () => {
  const root = scaffolded();
  const before = snapshot(root);
  const report = run(['tickets', '--root', root, '--sources', sourcesFile(ticketsExample()), '--dry-run']);
  assert.equal(report.marker.before, null);
  assert.deepEqual(report.marker.after, ticketsExample());
  assert.deepEqual(report.secrets, ['GH_TOKEN', 'GITLAB_TOKEN', 'ODOO_API_KEY', 'ULTRAPOWERS_STAGE_ODOO_API_KEY']);
  assert.ok(report.mcp.some((m) => m.path === '.mcp.json' && m.action === 'proposal'));
  assert.deepEqual(changedFiles(before, snapshot(root)), []);
});

test('tickets writes the block, proposals for existing MCP files and the secret names', () => {
  const root = scaffolded();
  const markerBefore = marker(root);
  const mcpBefore = fs.readFileSync(path.join(root, '.mcp.json'), 'utf8');
  const secretsFile = path.join(root, '.agents', 'mcp-secrets.env.example');
  const secretsBefore = fs.readFileSync(secretsFile, 'utf8');
  run(['tickets', '--root', root, '--sources', sourcesFile(ticketsExample())]);
  const after = marker(root);
  assert.deepEqual(after.tickets, ticketsExample());
  const { tickets, ...rest } = after;
  assert.deepEqual(rest, markerBefore);
  assert.equal(fs.readFileSync(path.join(root, '.mcp.json'), 'utf8'), mcpBefore);
  const proposal = JSON.parse(fs.readFileSync(path.join(root, `.mcp.json${PROPOSAL_SUFFIX}`), 'utf8'));
  for (const id of TICKET_IDS) assert.ok(id in proposal.mcpServers, id);
  assert.ok('context7' in proposal.mcpServers, 'the proposal keeps the canonical servers');
  const secrets = fs.readFileSync(secretsFile, 'utf8');
  assert.ok(secrets.startsWith(secretsBefore), 'lines above the block stay byte-identical');
  assert.match(secrets, /# >>> ultrapowers\nGH_TOKEN=.*\nGITLAB_TOKEN=.*\nODOO_API_KEY=.*\nULTRAPOWERS_STAGE_ODOO_API_KEY=.*\n# <<< ultrapowers\n$/);
});

test('tickets creates a missing harness MCP file with the ticket servers only', () => {
  const root = scaffolded();
  fs.rmSync(path.join(root, '.mcp.json'));
  const report = run(['tickets', '--root', root, '--sources', sourcesFile(ticketsExample())]);
  assert.ok(report.mcp.some((m) => m.path === '.mcp.json' && m.action === 'created'));
  assert.deepEqual(Object.keys(JSON.parse(fs.readFileSync(path.join(root, '.mcp.json'), 'utf8')).mcpServers), TICKET_IDS);
  assert.equal(fs.existsSync(path.join(root, `.mcp.json${PROPOSAL_SUFFIX}`)), false);
});

test('tickets refuses to run over a proposal still waiting to be merged', () => {
  const root = scaffolded();
  run(['tickets', '--root', root, '--sources', sourcesFile(ticketsExample())]);
  const report = run(['tickets', '--root', root, '--sources', sourcesFile(ticketsExample())], { expectExit: 2 });
  assert.equal(report.error.code, 'proposal-exists');
});

test('tickets with no sources removes the block', () => {
  const root = scaffolded();
  const cliOnly = { transport: 'cli', sources: [{ prefix: 'GH', provider: 'github', owner: 'acme' }] };
  run(['tickets', '--root', root, '--sources', sourcesFile(cliOnly)]);
  assert.deepEqual(marker(root).tickets, cliOnly);
  run(['tickets', '--root', root, '--sources', sourcesFile({ sources: [] })]);
  assert.equal('tickets' in marker(root), false);
});

test('an invalid tickets block is bad-tickets and writes nothing', () => {
  const root = scaffolded();
  const before = snapshot(root);
  const bad = ticketsExample();
  bad.sources[1].provider = 'slack';
  const report = run(['tickets', '--root', root, '--sources', sourcesFile(bad)], { expectExit: 2 });
  assert.equal(report.error.code, 'bad-tickets');
  assert.match(report.error.message, /tickets\.sources\[1\]\.provider/);
  assert.deepEqual(changedFiles(before, snapshot(root)), []);
});

// autopilot mode (spec docs/ultrapowers/specs/2026-10-04-autopilot-design.md, sections 4 and 9).
const TRACKER_STUB = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'autopilot', 'fixtures', 'tracker-stub.mjs');
const EVENT_LABELS = ['up:ready', 'up:approve', 'up:changes', 'up:hold', 'up:running', 'up:blocked'];

function autopilotExample() {
  return { mode: 'gated', baseBranch: 'dev', approvers: ['alice'], execution: 'inline' };
}

function answersFile(block) {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ultrapowers-autopilot-')), 'answers.json');
  fs.writeFileSync(file, JSON.stringify(block));
  return file;
}

// A stub gh/glab that accepts every label create call and logs it.
function labelStubEnv() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ultrapowers-label-stub-'));
  fs.writeFileSync(path.join(dir, 'map.json'), JSON.stringify({ 'label create': { stdout: '' } }));
  const log = path.join(dir, 'calls.log');
  const calls = () => (fs.existsSync(log) ? fs.readFileSync(log, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l).args) : []);
  return { env: { ULTRAPOWERS_GH: TRACKER_STUB, ULTRAPOWERS_GLAB: TRACKER_STUB, STUB_DIR: dir, STUB_LOG: log }, calls };
}

test('autopilot --dry-run reports the block and the labels and writes nothing', () => {
  const root = scaffolded();
  run(['tickets', '--root', root, '--sources', sourcesFile(ticketsExample())]);
  const before = snapshot(root);
  const report = run(['autopilot', '--root', root, '--answers', answersFile(autopilotExample()), '--dry-run']);
  assert.equal(report.marker.before, null);
  assert.deepEqual(report.marker.after, autopilotExample());
  const gl = report.labels.filter((l) => l.source === 'GL');
  assert.equal(gl.length, 6);
  assert.deepEqual(gl.map((l) => l.name), EVENT_LABELS);
  assert.ok(gl.every((l) => l.path === 'acme/platform/tracker' && l.action === 'would-create'));
  const gh = report.labels.filter((l) => l.source === 'GH');
  assert.equal(gh.length, 6);
  assert.ok(gh.every((l) => l.action === 'skipped' && /defaultProject/.test(l.message)), 'a source without a default project names no repository');
  assert.equal(report.labels.filter((l) => l.source === 'ODOO').length, 0);
  assert.ok(report.nextSteps.some((s) => /\/ultrapowers:autopilot <ID>/.test(s)));
  assert.deepEqual(changedFiles(before, snapshot(root)), []);
});

test('autopilot writes the block, keeps every other key byte-identical and creates the labels', () => {
  const root = scaffolded();
  run(['tickets', '--root', root, '--sources', sourcesFile(ticketsExample())]);
  const markerBefore = marker(root);
  const stub = labelStubEnv();
  const report = run(['autopilot', '--root', root, '--answers', answersFile(autopilotExample())], { env: stub.env });
  const after = marker(root);
  assert.deepEqual(after.autopilot, autopilotExample());
  const { autopilot, ...rest } = after;
  assert.deepEqual(rest, markerBefore);
  assert.equal(report.labels.filter((l) => l.action === 'created').length, 6);
  const created = stub.calls().filter((a) => a[0] === 'label' && a[1] === 'create');
  assert.equal(created.length, 6);
  assert.ok(created.every((a) => a.includes('acme/platform/tracker')));
  assert.deepEqual(report.written, ['.agents/ultrapowers.json']);
});

test('autopilot label failures are reported and do not stop the marker write', () => {
  const root = scaffolded();
  run(['tickets', '--root', root, '--sources', sourcesFile(ticketsExample())]);
  const stub = labelStubEnv();
  const report = run(['autopilot', '--root', root, '--answers', answersFile(autopilotExample())], { env: { ...stub.env, STUB_EXIT: '1' } });
  assert.deepEqual(marker(root).autopilot, autopilotExample());
  assert.equal(report.labels.filter((l) => l.action === 'failed').length, 6);
  assert.ok(report.nextSteps.some((s) => /label/i.test(s) && /by hand|create/i.test(s)));
});

test('autopilot with mode off removes the block', () => {
  const root = scaffolded();
  run(['tickets', '--root', root, '--sources', sourcesFile(ticketsExample())]);
  run(['autopilot', '--root', root, '--answers', answersFile(autopilotExample())], { env: labelStubEnv().env });
  assert.equal(marker(root).autopilot.mode, 'gated');
  const report = run(['autopilot', '--root', root, '--answers', answersFile({ mode: 'off' })]);
  assert.equal('autopilot' in marker(root), false);
  assert.deepEqual(report.labels, []);
});

// Odoo as an autopilot source (spec 2026-10-05 §9): the Ultrapowers tag names, the login, the keys.
const ODOO_FAKE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'autopilot', 'fixtures', 'odoo-fake.mjs');
const ODOO_LABELS = ['Ultrapowers Ready', 'Ultrapowers Approve', 'Ultrapowers Changes', 'Ultrapowers Hold', 'Ultrapowers Running', 'Ultrapowers Blocked'];
const odooChildren = [];
test.after(() => { for (const c of odooChildren) c.kill(); });

function startOdoo(spec = {}) {
  return new Promise((resolve, reject) => {
    const seedFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'odoo-seed-')), 'seed.json');
    fs.writeFileSync(seedFile, JSON.stringify(spec));
    const child = spawn(process.execPath, [ODOO_FAKE, 'serve', '--seed-file', seedFile], { stdio: ['ignore', 'pipe', 'pipe'] });
    odooChildren.push(child);
    let out = '';
    child.stdout.on('data', (d) => {
      out += d;
      const line = out.split('\n').find((l) => l.startsWith('{'));
      if (line) resolve({ child, url: JSON.parse(line).url });
    });
    child.on('exit', (code) => reject(new Error(`the fake Odoo exited with ${code}`)));
  });
}

function odooOnly(url, extra = {}) {
  return { sources: [{ prefix: 'ODOO', provider: 'odoo', url, mcpUrl: `${url}/mcp`, mcpHeader: 'Authorization: Bearer', login: 'bot', db: 'erp', defaultProject: '34', ...extra }] };
}

test('autopilot on an Odoo-only project proposes the Ultrapowers tag names and lists the tags', () => {
  const root = scaffolded();
  run(['tickets', '--root', root, '--sources', sourcesFile(odooOnly('https://erp.example.com'))]);
  const report = run(['autopilot', '--root', root, '--answers', answersFile(autopilotExample()), '--dry-run']);
  assert.deepEqual(report.marker.after.events, Object.fromEntries(['ready', 'approve', 'changes', 'hold', 'running', 'blocked'].map((k, i) => [k, ODOO_LABELS[i]])));
  const odoo = report.labels.filter((l) => l.source === 'ODOO');
  assert.deepEqual(odoo.map((l) => l.name), ODOO_LABELS);
  assert.ok(odoo.every((l) => l.action === 'would-create' && l.path === '34'), JSON.stringify(odoo));
  assert.ok(report.nextSteps.some((s) => /ODOO_API_KEY/.test(s) && /ULTRAPOWERS_STAGE_ODOO_API_KEY/.test(s)));
  assert.ok(report.nextSteps.some((s) => /Project User/.test(s)));
});

test('autopilot creates the Odoo tags through the engine tracker', async () => {
  const { url } = await startOdoo();
  const root = scaffolded();
  run(['tickets', '--root', root, '--sources', sourcesFile(odooOnly(url))]);
  const report = run(['autopilot', '--root', root, '--answers', answersFile(autopilotExample())], { env: { ODOO_API_KEY: 'k1' } });
  assert.equal(report.labels.filter((l) => l.action === 'created').length, 6, JSON.stringify(report.labels));
  const tags = (await (await fetch(`${url}/__fake/state`)).json()).tags.map((t) => t.name);
  for (const name of ODOO_LABELS) assert.ok(tags.includes(name), name);
  assert.equal(marker(root).autopilot.events.approve, 'Ultrapowers Approve');
});

test('autopilot refuses an Odoo source without login', () => {
  const root = scaffolded();
  run(['tickets', '--root', root, '--sources', sourcesFile(odooOnly('https://erp.example.com', { login: undefined }))]);
  const report = run(['autopilot', '--root', root, '--answers', answersFile(autopilotExample())], { expectExit: 2 });
  assert.equal(report.error.code, 'bad-tickets');
  assert.match(report.error.message, /login/);
});

test('autopilot refuses an event name with a comma', () => {
  const root = scaffolded();
  run(['tickets', '--root', root, '--sources', sourcesFile(odooOnly('https://erp.example.com'))]);
  const report = run(['autopilot', '--root', root, '--answers', answersFile({ ...autopilotExample(), events: { approve: 'A, B' } })], { expectExit: 2 });
  assert.equal(report.error.code, 'bad-autopilot');
  assert.match(report.error.message, /comma/);
});

test('tickets writes both Odoo keys into the secrets example', () => {
  const root = scaffolded();
  run(['tickets', '--root', root, '--sources', sourcesFile(odooOnly('https://erp.example.com'))]);
  const secrets = fs.readFileSync(path.join(root, '.agents', 'mcp-secrets.env.example'), 'utf8');
  assert.match(secrets, /^ODOO_API_KEY=/m);
  assert.match(secrets, /^ULTRAPOWERS_STAGE_ODOO_API_KEY=/m);
});

test('an invalid autopilot block is bad-autopilot and writes nothing', () => {
  const root = scaffolded();
  const before = snapshot(root);
  const report = run(['autopilot', '--root', root, '--answers', answersFile({ mode: 'turbo', approvers: 'alice' })], { expectExit: 2 });
  assert.equal(report.error.code, 'bad-autopilot');
  assert.match(report.error.message, /autopilot\.mode/);
  assert.match(report.error.message, /autopilot\.approvers/);
  assert.deepEqual(changedFiles(before, snapshot(root)), []);
  assert.equal(run(['autopilot', '--root', root], { expectExit: 2 }).error.code, 'bad-args');
});

test('autopilot needs a GitHub or GitLab source', () => {
  const root = scaffolded();
  const report = run(['autopilot', '--root', root, '--answers', answersFile(autopilotExample())], { expectExit: 2 });
  assert.equal(report.error.code, 'no-source');
});

test('detect reports whether autopilot is configured', () => {
  const root = scaffolded();
  assert.equal(run(['detect', '--root', root]).autopilotConfigured, false);
  run(['tickets', '--root', root, '--sources', sourcesFile(ticketsExample())]);
  run(['autopilot', '--root', root, '--answers', answersFile(autopilotExample())], { env: labelStubEnv().env });
  assert.equal(run(['detect', '--root', root]).autopilotConfigured, true);
});

test('scaffold --autopilot writes the block with the sources in one run', () => {
  const root = scaffolded('ws', ['--sources', sourcesFile(ticketsExample()), '--autopilot', answersFile(autopilotExample())]);
  assert.deepEqual(marker(root).autopilot, autopilotExample());
  assert.deepEqual(marker(root).tickets, ticketsExample());
});

test('detect reports whether ticket sources are configured', () => {
  const root = scaffolded();
  assert.equal(run(['detect', '--root', root]).ticketsConfigured, false);
  run(['tickets', '--root', root, '--sources', sourcesFile(ticketsExample())]);
  assert.equal(run(['detect', '--root', root]).ticketsConfigured, true);
});

test('scaffold --sources writes the block, the servers and the secrets in one run', () => {
  const root = scaffolded('ws', ['--sources', sourcesFile(ticketsExample())]);
  assert.deepEqual(marker(root).tickets, ticketsExample());
  const servers = JSON.parse(fs.readFileSync(path.join(root, '.mcp.json'), 'utf8')).mcpServers;
  for (const id of ['context7', ...TICKET_IDS]) assert.ok(id in servers, id);
  assert.equal(fs.existsSync(path.join(root, `.mcp.json${PROPOSAL_SUFFIX}`)), false);
  assert.match(fs.readFileSync(path.join(root, '.agents', 'mcp-secrets.env.example'), 'utf8'), /^GITLAB_TOKEN=/m);
});

test('scaffold without --sources writes no tickets key', () => {
  const root = scaffolded();
  assert.equal('tickets' in marker(root), false);
  assert.doesNotMatch(fs.readFileSync(path.join(root, '.agents', 'mcp-secrets.env.example'), 'utf8'), /GH_TOKEN/);
});

test('upgrade proposals keep the configured ticket servers (final review)', () => {
  const changes = JSON.parse(fs.readFileSync(path.join(repoRoot, 'templates', 'CHANGES.json'), 'utf8'));
  for (const key of Object.keys(changes)) changes[key] = '0.0.1';
  changes['.mcp.json'] = pluginVersion;
  const env = { ULTRAPOWERS_TEMPLATES_DIR: templatesCopy(changes) };
  const root = tmpWorkspace();
  run(['scaffold', '--root', root, '--name', 'WS', '--platform', 'linux', '--sources', sourcesFile(ticketsExample())], { env });
  setMarkerVersion(root, '0.0.1');
  run(['upgrade', '--root', root, '--apply', '.mcp.json'], { env });
  const proposal = JSON.parse(fs.readFileSync(path.join(root, `.mcp.json${PROPOSAL_SUFFIX}`), 'utf8'));
  for (const id of TICKET_IDS) assert.ok(id in proposal.mcpServers, id);
});

test('tickets next steps name the token scopes and the GitLab sign-in', () => {
  const root = scaffolded();
  const report = run(['tickets', '--root', root, '--sources', sourcesFile(ticketsExample()), '--dry-run']);
  const steps = report.nextSteps.join('\n');
  assert.match(steps, /Issues read and Metadata read/);
  assert.match(steps, /read_api/);
  assert.match(steps, /can only read projects and tasks/);
  assert.ok(report.nextSteps.includes('Headless GitLab needs glab with GITLAB_TOKEN; the GitLab MCP server signs in in the browser'));
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
