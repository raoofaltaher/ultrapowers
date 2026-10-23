// node --test tests/autopilot/hardening.test.mjs
// The audit-2026-10-23 hardening of the autopilot engine: the stage environment as an allow-list
// (M6, L3), remote MCP servers out of the stage snapshot (L11), the snapshot of the config a ticket
// runs under (L1), repository-local git config that runs programs (L2), configured branch names
// that cannot be options (L4), and no bare tool names (M10).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import * as lib from '../../skills/autopilot/scripts/autopilot-lib.mjs';
import * as repos from '../../skills/autopilot/scripts/repos.mjs';
import { HARNESSES } from '../../skills/autopilot/scripts/harnesses.mjs';
import { trackerFor } from '../../skills/autopilot/scripts/tracker.mjs';
import { resolveTool } from '../../hooks/lib/resolve-tool.mjs';
import { makeWorkspace as workspace, git } from './fixtures/make-workspace.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..');
const ENGINE = path.join(REPO, 'skills', 'autopilot', 'scripts', 'autopilot.mjs');
const HARNESS_STUB = path.join(HERE, 'fixtures', 'harness-stub.mjs');
const win = process.platform === 'win32';
const exe = win ? '.exe' : '';

function run(ws, args, extraEnv = {}) {
  const result = spawnSync(process.execPath, [ENGINE, ...args, '--root', ws.root], { cwd: ws.root, encoding: 'utf8', env: { ...ws.env, ...extraEnv } });
  let json = null;
  try { json = JSON.parse(result.stdout); } catch { json = null; }
  return { code: result.status, json, stdout: result.stdout, stderr: result.stderr };
}

const markerFile = (ws) => path.join(ws.root, '.agents', 'ultrapowers.json');
const readMarker = (ws) => JSON.parse(fs.readFileSync(markerFile(ws), 'utf8'));
const writeMarker = (ws, mutate) => {
  const m = readMarker(ws);
  mutate(m);
  fs.writeFileSync(markerFile(ws), `${JSON.stringify(m, null, 2)}\n`);
};
const state = (ws, id = 'GH-16') => JSON.parse(fs.readFileSync(path.join(ws.root, 'tasks', id, 'autopilot.json'), 'utf8'));

// ---------------------------------------------------------------------------------------------
// M6 + L3: the stage environment is an allow-list
// ---------------------------------------------------------------------------------------------

const BASE_ENV = {
  PATH: '/usr/bin', HOME: '/home/u', LANG: 'C', LC_ALL: 'C', TERM: 'xterm', TMPDIR: '/tmp', USER: 'u',
  ULTRAPOWERS_CLAUDE: '/x/claude.mjs',
};

test('stageEnvFrom: the toolchain base passes, ODOO_API_KEY and a secrets-file key do not', () => {
  const env = { ...BASE_ENV, ODOO_API_KEY: 'k1', DB_PASSWORD_KEY: 's3', AWS_SECRET_ACCESS_KEY: 'a', NODE_OPTIONS: '--require /evil.js' };
  const out = lib.stageEnvFrom(env, { harness: 'claude-code', platform: 'linux' });
  assert.equal(out.PATH, '/usr/bin');
  assert.equal(out.HOME, '/home/u');
  assert.equal(out.LC_ALL, 'C');
  assert.equal(out.ULTRAPOWERS_CLAUDE, '/x/claude.mjs', 'ULTRAPOWERS_* passes');
  assert.equal(out.ODOO_API_KEY, undefined);
  assert.equal(out.DB_PASSWORD_KEY, undefined);
  assert.equal(out.AWS_SECRET_ACCESS_KEY, undefined);
  assert.equal(out.NODE_OPTIONS, undefined, 'NODE_OPTIONS never passes');
  assert.equal(out.ULTRAPOWERS_AUTOPILOT_INSIDE, '1');
  assert.equal(out.GIT_TERMINAL_PROMPT, '0');
});

test('stageEnvFrom: NODE_OPTIONS never passes, not even when the project or a harness lists it', () => {
  const env = { ...BASE_ENV, NODE_OPTIONS: '--require /evil.js', ANTHROPIC_API_KEY: 'sk' };
  const out = lib.stageEnvFrom(env, { harness: 'claude-code', extra: ['NODE_OPTIONS', 'NODE_*'], mcpNames: ['NODE_OPTIONS'], platform: 'linux' });
  assert.equal(out.NODE_OPTIONS, undefined);
});

test('stageEnvFrom: a name an MCP server of the snapshot references passes', () => {
  const env = { ...BASE_ENV, ODOO_API_KEY: 'k1', OTHER_KEY: 'o' };
  const out = lib.stageEnvFrom(env, { harness: 'claude-code', mcpNames: ['ODOO_API_KEY'], platform: 'linux' });
  assert.equal(out.ODOO_API_KEY, 'k1');
  assert.equal(out.OTHER_KEY, undefined);
});

test('stageEnvFrom: the harness auth names pass for that harness only', () => {
  const env = { ...BASE_ENV, ANTHROPIC_API_KEY: 'sk-a', OPENAI_API_KEY: 'sk-o', CLAUDE_CODE_OAUTH_TOKEN: 'oa' };
  const claude = lib.stageEnvFrom(env, { harness: 'claude-code', platform: 'linux' });
  assert.equal(claude.ANTHROPIC_API_KEY, 'sk-a');
  assert.equal(claude.CLAUDE_CODE_OAUTH_TOKEN, 'oa');
  assert.equal(claude.OPENAI_API_KEY, undefined);
  const codex = lib.stageEnvFrom(env, { harness: 'codex', platform: 'linux' });
  assert.equal(codex.OPENAI_API_KEY, 'sk-o');
  assert.equal(codex.ANTHROPIC_API_KEY, undefined);
});

test('stageEnvFrom: autopilot.stageEnv names and PREFIX_* patterns add variables', () => {
  const env = { ...BASE_ENV, MY_SERVICE_URL: 'u', MYAPP_ONE: '1', MYAPP_TWO: '2', MYAPPLE: 'no', UNLISTED: 'x' };
  const out = lib.stageEnvFrom(env, { harness: 'claude-code', extra: ['MY_SERVICE_URL', 'MYAPP_*'], platform: 'linux' });
  assert.deepEqual([out.MY_SERVICE_URL, out.MYAPP_ONE, out.MYAPP_TWO, out.MYAPPLE, out.UNLISTED], ['u', '1', '2', undefined, undefined]);
});

test('stageEnvFrom: without stage credentials the engine tokens pass, as before', () => {
  const env = { ...BASE_ENV, GH_TOKEN: 'g', GITHUB_TOKEN: 'g2', GITLAB_TOKEN: 'l', GLAB_TOKEN: 'l2', GL_TOKEN: 'l3', SSH_AUTH_SOCK: '/s', GIT_SSH_COMMAND: 'ssh -i k' };
  const out = lib.stageEnvFrom(env, { harness: 'claude-code', platform: 'linux' });
  assert.deepEqual([out.GH_TOKEN, out.GITHUB_TOKEN, out.GITLAB_TOKEN, out.GLAB_TOKEN, out.GL_TOKEN], ['g', 'g2', 'l', 'l2', 'l3']);
  assert.equal(out.SSH_AUTH_SOCK, '/s');
  assert.equal(out.GIT_SSH_COMMAND, 'ssh -i k');
});

test('stageEnvFrom: with stage credentials the stage gets only the mapped stage tokens', () => {
  const env = {
    ...BASE_ENV, GH_TOKEN: 'engine-g', GITLAB_TOKEN: 'engine-l', GITHUB_TOKEN: 'x', SSH_AUTH_SOCK: '/s', GIT_SSH_COMMAND: 'ssh', GIT_SSH: 'ssh',
    ULTRAPOWERS_STAGE_GH_TOKEN: 'ro-g', ULTRAPOWERS_STAGE_GITLAB_TOKEN: 'ro-l', GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_0: 'user.name', GIT_CONFIG_VALUE_0: 'x',
  };
  const out = lib.stageEnvFrom(env, { harness: 'claude-code', noAuthDir: '/ws/.ultrapowers/autopilot/no-auth', platform: 'linux' });
  assert.equal(out.GH_TOKEN, 'ro-g');
  assert.equal(out.GITLAB_TOKEN, 'ro-l');
  assert.equal(out.GITHUB_TOKEN, undefined);
  assert.equal(out.SSH_AUTH_SOCK, undefined);
  assert.equal(out.GIT_SSH_COMMAND, undefined);
  assert.equal(out.GIT_SSH, undefined);
  assert.equal(out.ULTRAPOWERS_STAGE_GH_TOKEN, undefined, 'the stage token names are mapped, not passed on');
  assert.equal(out.ULTRAPOWERS_STAGE_GITLAB_TOKEN, undefined);
  assert.match(out.GH_CONFIG_DIR, /no-auth/);
  assert.match(out.GLAB_CONFIG_DIR, /no-auth/);
  assert.equal(out.GIT_CONFIG_KEY_0, 'credential.helper', 'the credential helper is reset');
  assert.equal(out.GIT_CONFIG_VALUE_0, '');
  assert.equal(out.GIT_CONFIG_COUNT, '1', 'the engine process own GIT_CONFIG_* pins are not passed on');
  const listed = lib.stageEnvFrom(env, { harness: 'claude-code', extra: ['GIT_CONFIG_*'], noAuthDir: '/x', platform: 'linux' });
  assert.equal(listed.GIT_CONFIG_KEY_0, 'user.name', 'a project that lists them keeps them');
  assert.equal(listed.GIT_CONFIG_KEY_1, 'credential.helper', 'and the helper is reset behind them');
  assert.equal(listed.GIT_CONFIG_COUNT, '2');
});

test('stageEnvFrom: on Windows names match case-insensitively', () => {
  const env = { Path: 'C:\\Windows', SystemRoot: 'C:\\Windows', UserProfile: 'C:\\Users\\u', ProgramFiles: 'C:\\PF', 'ProgramFiles(x86)': 'C:\\PF86', Anthropic_Api_Key: 'k', Secret_Thing: 's', NODE_options: 'x' };
  const out = lib.stageEnvFrom(env, { harness: 'claude-code', platform: 'win32' });
  assert.equal(out.Path, 'C:\\Windows');
  assert.equal(out.SystemRoot, 'C:\\Windows');
  assert.equal(out.UserProfile, 'C:\\Users\\u');
  assert.equal(out['ProgramFiles(x86)'], 'C:\\PF86');
  assert.equal(out.Anthropic_Api_Key, 'k');
  assert.equal(out.Secret_Thing, undefined);
  assert.equal(out.NODE_options, undefined);
  const posix = lib.stageEnvFrom({ path: '/x', Path: '/y', PATH: '/usr/bin' }, { harness: 'claude-code', platform: 'linux' });
  assert.deepEqual(Object.keys(posix).filter((k) => k.toLowerCase() === 'path'), ['PATH'], 'on posix the match is exact');
});

test('mcpEnvNames: every ${NAME} an MCP config references, in env, headers, args and url', () => {
  const text = JSON.stringify({
    mcpServers: {
      odoo: { type: 'http', url: 'https://x/${ODOO_HOST}/mcp', headers: { Authorization: 'Bearer ${ODOO_API_KEY}' } },
      local: { command: 'node', args: ['s.js', '--k=${LOCAL_KEY:-dflt}'], env: { A: '${A_TOKEN}', B: 'literal' } },
    },
  });
  assert.deepEqual([...lib.mcpEnvNames(text)].sort(), ['A_TOKEN', 'LOCAL_KEY', 'ODOO_API_KEY', 'ODOO_HOST']);
  assert.deepEqual(lib.mcpEnvNames('not json ${BARE_NAME}'), ['BARE_NAME']);
  assert.deepEqual(lib.mcpEnvNames(''), []);
});

test('autopilot.stageEnv is validated: names or PREFIX_* patterns only', () => {
  const ok = { mode: 'gated', stageEnv: ['MY_VAR', 'MYAPP_*', '_x1'] };
  assert.deepEqual(lib.validateAutopilot(ok), []);
  assert.deepEqual(lib.effectiveAutopilot({ autopilot: ok }).stageEnv, ['MY_VAR', 'MYAPP_*', '_x1']);
  assert.deepEqual(lib.effectiveAutopilot({ autopilot: { mode: 'gated' } }).stageEnv, []);
  for (const bad of [['a b'], ['*'], ['A*B'], ['1ABC'], [''], 'MYAPP_*', [1], ['A=B'], ['A-B']]) {
    assert.ok(lib.validateAutopilot({ mode: 'gated', stageEnv: bad }).some((e) => /stageEnv/.test(e)), `${JSON.stringify(bad)} is refused`);
  }
});

test('every headless adapter lists the auth names its harness reads', () => {
  for (const [name, adapter] of Object.entries(HARNESSES)) {
    assert.ok(Array.isArray(adapter.envAllow) && adapter.envAllow.length > 0, `${name} has envAllow`);
    for (const entry of adapter.envAllow) assert.match(entry, /^[A-Za-z_][A-Za-z0-9_]*\*?$/, `${name}: ${entry}`);
  }
  assert.ok(HARNESSES['claude-code'].envAllow.includes('ANTHROPIC_*'));
  assert.ok(HARNESSES.codex.envAllow.includes('OPENAI_*'));
  assert.ok(HARNESSES.gemini.envAllow.includes('GEMINI_*'));
});

// ---------------------------------------------------------------------------------------------
// The environment a watcher stage really gets (through the engine)
// ---------------------------------------------------------------------------------------------

function stageProbe(ws) {
  // A stand-in harness that logs the whole environment it got, then exits non-zero: the engine blocks the stage.
  const probe = path.join(ws.base, 'autopilot-env-probe.mjs');
  fs.writeFileSync(probe, [
    "import fs from 'node:fs';",
    "fs.writeFileSync(process.env.PROBE_OUT, JSON.stringify(process.env));",
    'process.exit(3);',
    '',
  ].join('\n'));
  return probe;
}

test('a watcher stage holds no ODOO_API_KEY or secrets-file key unless the MCP snapshot names it', () => {
  const ws = workspace({ autopilot: { mode: 'gated', baseBranch: 'main', stageEnv: ['PROBE_*'] } });
  fs.writeFileSync(path.join(ws.root, '.agents', 'mcp-secrets.env'), 'export SECRETS_FILE_TOKEN=from-file\n');
  const out = path.join(ws.base, 'autopilot-env-out.json');
  const env = {
    ULTRAPOWERS_CLAUDE: stageProbe(ws), PROBE_OUT: out, ODOO_API_KEY: 'k-odoo', NODE_OPTIONS: '--no-warnings', ANTHROPIC_API_KEY: 'sk-ant',
    OTHER_LOCAL_SECRET: 'zzz', ULTRAPOWERS_STAGE_GH_TOKEN: '', ULTRAPOWERS_STAGE_GITLAB_TOKEN: '',
  };
  const r = run(ws, ['run', 'GH-16', '--once'], env);
  assert.ok(fs.existsSync(out), `the stage ran: ${r.stdout}${r.stderr}`);
  const seen = JSON.parse(fs.readFileSync(out, 'utf8'));
  assert.equal(seen.ODOO_API_KEY, undefined, 'the Odoo key is not in the stage');
  assert.equal(seen.SECRETS_FILE_TOKEN, undefined, 'a key from mcp-secrets.env is not in the stage');
  assert.equal(seen.OTHER_LOCAL_SECRET, undefined);
  assert.equal(seen.NODE_OPTIONS, undefined);
  assert.equal(seen.ANTHROPIC_API_KEY, 'sk-ant', 'the harness auth passes');
  assert.equal(seen.PROBE_OUT, out, 'autopilot.stageEnv passes what the project lists');
  assert.equal(seen.ULTRAPOWERS_AUTOPILOT_INSIDE, '1');
  assert.ok(seen.PATH || seen.Path, 'PATH passes');
});

test('a watcher stage holds the keys the MCP snapshot references', () => {
  const ws = workspace({ autopilot: { mode: 'gated', baseBranch: 'main', stageEnv: ['PROBE_*'] } });
  fs.writeFileSync(path.join(ws.root, '.mcp.json'), JSON.stringify({ mcpServers: { odoo: { command: 'node', args: ['odoo-mcp.js'], env: { KEY: '${ODOO_API_KEY}' } } } }));
  fs.writeFileSync(path.join(ws.root, '.agents', 'mcp-secrets.env'), 'export SECRETS_FILE_TOKEN=from-file\n');
  const out = path.join(ws.base, 'autopilot-env-out2.json');
  const env = { ULTRAPOWERS_CLAUDE: stageProbe(ws), PROBE_OUT: out, ODOO_API_KEY: 'k-odoo', ULTRAPOWERS_STAGE_GH_TOKEN: '', ULTRAPOWERS_STAGE_GITLAB_TOKEN: '' };
  run(ws, ['run', 'GH-16', '--once'], env);
  const seen = JSON.parse(fs.readFileSync(out, 'utf8'));
  assert.equal(seen.ODOO_API_KEY, 'k-odoo');
  assert.equal(seen.SECRETS_FILE_TOKEN, undefined);
});

// ---------------------------------------------------------------------------------------------
// L11: remote MCP servers stay out of the stage snapshot
// ---------------------------------------------------------------------------------------------

test('filterMcpServers keeps local command servers and drops http, sse, streamable-http and url servers', () => {
  const input = {
    mcpServers: {
      local: { command: 'node', args: ['a.js'] },
      stdio: { type: 'stdio', command: 'npx', args: ['x'] },
      http: { type: 'http', url: 'https://x/mcp', headers: { Authorization: 'Bearer ${ODOO_API_KEY}' } },
      sse: { type: 'sse', url: 'https://x/sse' },
      stream: { type: 'streamable-http', url: 'https://x/s' },
      urlOnly: { url: 'https://x/u' },
      mixed: { command: 'node', url: 'https://x/m' },
      typedCommand: { type: 'http', command: 'node' },
      noCommand: { type: 'stdio' },
      emptyCommand: { command: '' },
    },
    other: 'kept',
  };
  const out = JSON.parse(lib.filterMcpServers(JSON.stringify(input)));
  assert.deepEqual(Object.keys(out.mcpServers).sort(), ['local', 'stdio']);
  assert.equal(out.other, 'kept', 'the other keys are untouched');
  assert.deepEqual(out.mcpServers.local, input.mcpServers.local);
  assert.equal(lib.filterMcpServers('not json'), '{"mcpServers":{}}', 'an unreadable config loads no server');
  assert.equal(lib.filterMcpServers(JSON.stringify({ mcpServers: ['x'] })), '{"mcpServers":{}}');
});

test('begin writes the filtered MCP snapshot: a remote server of the project never reaches a stage', () => {
  const ws = workspace();
  fs.writeFileSync(path.join(ws.root, '.mcp.json'), JSON.stringify({ mcpServers: { odoo: { type: 'http', url: 'https://odoo.example/mcp', headers: { Authorization: 'Bearer ${ODOO_API_KEY}' } }, local: { command: 'node', args: ['x.js'] } } }));
  const r = run(ws, ['begin', 'GH-16', 'scaffold']);
  assert.equal(r.code, 0, r.stdout + r.stderr);
  const snap = JSON.parse(fs.readFileSync(path.join(ws.root, '.ultrapowers', 'autopilot', 'mcp.json'), 'utf8'));
  assert.deepEqual(Object.keys(snap.mcpServers), ['local']);
});

// ---------------------------------------------------------------------------------------------
// L1: the config a ticket runs under is snapshotted
// ---------------------------------------------------------------------------------------------

const configSnapshot = (ws, id = 'GH-16') => path.join(ws.root, '.ultrapowers', 'autopilot', `${id}.config.json`);

test('begin snapshots the config; later commands with the file unchanged pass', () => {
  const ws = workspace();
  assert.equal(run(ws, ['begin', 'GH-16', 'scaffold']).code, 0);
  assert.ok(fs.existsSync(configSnapshot(ws)), 'the snapshot is taken at begin');
  const snap = JSON.parse(fs.readFileSync(configSnapshot(ws), 'utf8'));
  assert.deepEqual(snap.autopilot, readMarker(ws).autopilot);
  assert.deepEqual(snap.tickets, readMarker(ws).tickets);
  // An unrelated key may change: only tickets and autopilot are guarded.
  writeMarker(ws, (m) => { m.somethingElse = 'changed'; });
  const status = run(ws, ['status', 'GH-16']);
  assert.equal(status.code, 0, status.stdout + status.stderr);
});

test('a changed autopilot key blocks the ticket, names the key and says to re-run begin', () => {
  const ws = workspace();
  assert.equal(run(ws, ['begin', 'GH-16', 'scaffold']).code, 0);
  writeMarker(ws, (m) => { m.autopilot.mode = 'full'; });
  const r = run(ws, ['end', 'GH-16', 'scaffold', '--result', JSON.stringify({ ok: true })]);
  assert.equal(r.code, 2, r.stdout + r.stderr);
  assert.equal(r.json.error.code, 'config-changed');
  assert.match(r.json.error.message, /autopilot\.mode/);
  assert.match(r.json.error.message, /begin/);
  assert.ok(!fs.existsSync(path.join(ws.root, '.ultrapowers', 'autopilot-active')), 'the run marker is released');
  assert.ok(ws.calls().some((a) => a.includes('--add-label') && a.includes('up:blocked')), 'the ticket is labelled blocked');
});

test('a changed tickets source blocks the ticket, and the tracker still talks to the snapshot source', () => {
  const ws = workspace();
  assert.equal(run(ws, ['begin', 'GH-16', 'scaffold']).code, 0);
  fs.mkdirSync(path.join(ws.root, 'tasks', 'GH-16'), { recursive: true });
  fs.writeFileSync(path.join(ws.root, 'tasks', 'GH-16', 'GH-16.md'), '# GH-16 - Fix it now please\n');
  assert.equal(run(ws, ['end', 'GH-16', 'scaffold', '--result', JSON.stringify({ ok: true })]).code, 0);
  writeMarker(ws, (m) => { m.tickets.sources[0].owner = 'attacker'; m.tickets.sources[0].host = 'evil.example'; });
  const r = run(ws, ['next', 'GH-16']);
  assert.equal(r.code, 2, r.stdout + r.stderr);
  assert.equal(r.json.error.code, 'config-changed');
  assert.match(r.json.error.message, /tickets\.sources/);
  assert.ok(ws.calls().every((a) => !a.join(' ').includes('attacker')), 'no call reaches the changed source');
  assert.equal(state(ws).stageStatus, 'blocked');
  // Repeating the command does not post another comment.
  const before = ws.calls().length;
  const again = run(ws, ['next', 'GH-16']);
  assert.equal(again.json.error.code, 'config-changed');
  assert.equal(ws.calls().filter((a) => a.includes('--add-label')).length, ws.calls().slice(0, before).filter((a) => a.includes('--add-label')).length, 'the block is reported once');
});

test('begin run again after the change is checked takes a fresh snapshot, and the ticket goes on', () => {
  const ws = workspace();
  assert.equal(run(ws, ['begin', 'GH-16', 'scaffold']).code, 0);
  fs.mkdirSync(path.join(ws.root, 'tasks', 'GH-16'), { recursive: true });
  fs.writeFileSync(path.join(ws.root, 'tasks', 'GH-16', 'GH-16.md'), '# GH-16 - Fix it now please\n');
  assert.equal(run(ws, ['end', 'GH-16', 'scaffold', '--result', JSON.stringify({ ok: true })]).code, 0);
  writeMarker(ws, (m) => { m.autopilot.approvers = ['alice']; });
  assert.equal(run(ws, ['next', 'GH-16']).json.error.code, 'config-changed');
  const again = run(ws, ['begin', 'GH-16', 'spec']);
  assert.equal(again.code, 0, again.stdout + again.stderr);
  assert.deepEqual(JSON.parse(fs.readFileSync(configSnapshot(ws), 'utf8')).autopilot.approvers, ['alice']);
  assert.equal(run(ws, ['status', 'GH-16']).code, 0);
});

test('a begin from inside an open stage never refreshes the snapshot', () => {
  const ws = workspace();
  assert.equal(run(ws, ['begin', 'GH-16', 'scaffold']).code, 0);
  writeMarker(ws, (m) => { m.autopilot.mode = 'full'; });
  const again = run(ws, ['begin', 'GH-16', 'scaffold']);
  assert.equal(again.json.error.code, 'config-changed', 'the stage is open: only a human with no stage open refreshes');
  const inside = run(ws, ['begin', 'GH-16', 'scaffold'], { ULTRAPOWERS_AUTOPILOT_INSIDE: '1' });
  assert.equal(inside.json.error.code, 'config-changed');
  assert.equal(JSON.parse(fs.readFileSync(configSnapshot(ws), 'utf8')).autopilot.mode, 'gated');
});

// ---------------------------------------------------------------------------------------------
// L2: repository-local git config that runs programs
// ---------------------------------------------------------------------------------------------

const GIT_ENV = {
  GIT_AUTHOR_NAME: 'Test', GIT_AUTHOR_EMAIL: 'test@example.com',
  GIT_COMMITTER_NAME: 'Test', GIT_COMMITTER_EMAIL: 'test@example.com',
  GIT_CONFIG_GLOBAL: path.join(os.tmpdir(), 'autopilot-hardening-gitconfig'),
};
fs.writeFileSync(GIT_ENV.GIT_CONFIG_GLOBAL, '');
Object.assign(process.env, GIT_ENV);

function tempRepo() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'autopilot-hardening-'));
  fs.mkdirSync(path.join(base, '.agents'));
  fs.writeFileSync(path.join(base, '.agents', 'ultrapowers.json'), '{}');
  git(base, 'init', '-q', '-b', 'main');
  fs.writeFileSync(path.join(base, 'a.txt'), 'a\n');
  git(base, 'add', '-A');
  git(base, 'commit', '-q', '-m', 'seed');
  return base;
}

test('gitConfigSnapshot lists the keys that run a program or redirect a remote, and no others', () => {
  const dir = tempRepo();
  git(dir, 'config', 'user.name', 'Someone');
  git(dir, 'config', 'core.filemode', 'false');
  git(dir, 'config', 'core.fsmonitor', 'x');
  git(dir, 'config', 'alias.st', '!echo');
  git(dir, 'config', 'filter.lfs.clean', 'x');
  git(dir, 'config', 'diff.ext.command', 'x');
  git(dir, 'config', 'diff.ext.textconv', 'x');
  git(dir, 'config', 'merge.drv.driver', 'x');
  git(dir, 'config', 'credential.helper', 'store');
  git(dir, 'config', 'url.https://evil/.insteadOf', 'https://good/');
  git(dir, 'config', 'gpg.program', 'x');
  git(dir, 'config', 'include.path', 'x');
  git(dir, 'config', 'includeIf.gitdir:/x/.path', 'x');
  const keys = repos.gitConfigSnapshot(dir).map((e) => e.split('=')[0]);
  for (const k of ['core.fsmonitor', 'alias.st', 'filter.lfs.clean', 'diff.ext.command', 'diff.ext.textconv', 'merge.drv.driver', 'credential.helper', 'url.https://evil/.insteadof', 'gpg.program', 'include.path']) {
    assert.ok(keys.includes(k), `${k} is watched: ${keys.join(', ')}`);
  }
  assert.ok(keys.some((k) => k.startsWith('includeif.')), 'includeIf is watched');
  assert.ok(!keys.includes('user.name') && !keys.includes('core.filemode'), 'unrelated keys are not');
});

test('gitConfigChanges: an added or changed watched key is reported, an unrelated one is not', () => {
  const dir = tempRepo();
  git(dir, 'config', 'core.sshCommand', 'ssh -o A=b');
  const before = repos.gitConfigSnapshot(dir);
  assert.deepEqual(repos.gitConfigChanges(dir, before), []);
  git(dir, 'config', 'user.email', 'new@example.com');
  git(dir, 'config', 'branch.main.remote', 'origin');
  assert.deepEqual(repos.gitConfigChanges(dir, before), [], 'user.* and branch.* are not watched');
  git(dir, 'config', 'core.fsmonitor', 'evil-monitor');
  git(dir, 'config', 'core.sshCommand', 'ssh -o ProxyCommand=evil');
  git(dir, 'config', 'alias.pwn', '!evil');
  git(dir, 'config', '--add', 'remote.origin.pushurl', 'https://evil.example/x.git');
  const changes = repos.gitConfigChanges(dir, before).sort();
  assert.deepEqual(changes, ['alias.pwn', 'core.fsmonitor', 'core.sshcommand', 'remote.origin.pushurl']);
  git(dir, 'config', '--unset', 'core.sshCommand');
  assert.ok(repos.gitConfigChanges(dir, before).includes('core.sshcommand'), 'a removed key is a change too');
});

test('gitConfigChanges also reads config.worktree when the repository uses extensions.worktreeConfig', () => {
  const dir = tempRepo();
  git(dir, 'config', 'extensions.worktreeConfig', 'true');
  const before = repos.gitConfigSnapshot(dir);
  git(dir, 'config', '--worktree', 'core.fsmonitor', 'evil');
  assert.deepEqual(repos.gitConfigChanges(dir, before), ['core.fsmonitor']);
});

test('the engine git pins core.askPass to nothing, and leaves credential.helper and gpg.program alone', () => {
  const dir = tempRepo();
  const argv = repos.gitArgs(dir, ['status']);
  const joined = argv.join(' ');
  assert.match(joined, /-c core\.askPass=(?= |$)/);
  assert.doesNotMatch(joined, /credential\.helper/);
  assert.doesNotMatch(joined, /gpg\.program/);
});

test('a key a stage adds to .git/config blocks end before anything is committed', () => {
  const ws = workspace();
  assert.equal(run(ws, ['begin', 'GH-16', 'scaffold']).code, 0);
  fs.mkdirSync(path.join(ws.root, 'tasks', 'GH-16'), { recursive: true });
  fs.writeFileSync(path.join(ws.root, 'tasks', 'GH-16', 'GH-16.md'), '# GH-16 - Fix it now please\n');
  git(ws.root, 'config', 'filter.pwn.clean', 'evil-program');
  const headBefore = git(ws.root, 'rev-parse', 'HEAD');
  const r = run(ws, ['end', 'GH-16', 'scaffold', '--result', JSON.stringify({ ok: true })]);
  assert.equal(r.code, 2, r.stdout + r.stderr);
  assert.equal(r.json.error.code, 'git-config-changed');
  assert.match(r.json.error.message, /filter\.pwn\.clean/);
  assert.equal(git(ws.root, 'rev-parse', 'HEAD'), headBefore, 'the engine committed nothing');
});

test('pr is blocked by a watched key added since begin', () => {
  const ws = workspace();
  assert.equal(run(ws, ['begin', 'GH-16', 'scaffold']).code, 0);
  fs.mkdirSync(path.join(ws.root, 'tasks', 'GH-16'), { recursive: true });
  fs.writeFileSync(path.join(ws.root, 'tasks', 'GH-16', 'GH-16.md'), '# GH-16 - Fix it now please\n');
  assert.equal(run(ws, ['end', 'GH-16', 'scaffold', '--result', JSON.stringify({ ok: true })]).code, 0);
  git(ws.root, 'config', 'core.hooksPath', '/tmp/evil-hooks');
  const r = run(ws, ['pr', 'GH-16']);
  assert.equal(r.code, 2, r.stdout + r.stderr);
  assert.equal(r.json.error.code, 'git-config-changed');
});

// ---------------------------------------------------------------------------------------------
// L4: configured branch names cannot be options
// ---------------------------------------------------------------------------------------------

test('checkBranchName refuses an option, a bad ref name and a reflog expression', () => {
  const root = tempRepo();
  assert.equal(repos.checkBranchName(root, 'main'), null);
  assert.equal(repos.checkBranchName(root, 'release/2026.10'), null);
  for (const bad of ['--upload-pack=x', '-x', 'a..b', 'a b', '@{-1}', 'a~1', 'a:b', '', 'x.lock', 'a\nb']) {
    assert.match(String(repos.checkBranchName(root, bad)), /branch/i, `${JSON.stringify(bad)} is refused`);
  }
});

test('autopilot.baseBranch that is an option is refused at validation', () => {
  const errors = lib.validateAutopilot({ mode: 'gated', baseBranch: '--upload-pack=touch /tmp/x' });
  assert.ok(errors.some((e) => /baseBranch/.test(e)), errors.join('; '));
  assert.deepEqual(lib.validateAutopilot({ mode: 'gated', baseBranch: 'release/1.2' }), []);
  assert.throws(() => lib.effectiveAutopilot({ autopilot: { mode: 'gated', baseBranch: '-x' } }), (err) => err.code === 'bad-autopilot');
});

test('a base branch that is an option is refused by the engine: baseBranch and repos[].defaultBranch', () => {
  const ws = workspace({ nested: true });
  writeMarker(ws, (m) => { m.repos[0].defaultBranch = '--upload-pack=touch evil'; });
  const r = run(ws, ['begin', 'GH-16', 'scaffold']);
  assert.equal(r.code, 2, r.stdout + r.stderr);
  assert.equal(r.json.error.code, 'bad-branch');
  assert.match(r.json.error.message, /defaultBranch/);
  const ws2 = workspace({ autopilot: { mode: 'gated', baseBranch: '--upload-pack=touch evil' } });
  const r2 = run(ws2, ['begin', 'GH-16', 'scaffold']);
  assert.equal(r2.json.error.code, 'bad-autopilot');
});

test('ensureBranch and ensureWorktree refuse a base that is an option and run no fetch with it', () => {
  const dir = tempRepo();
  git(dir, 'remote', 'add', 'origin', path.join(dir, 'nowhere.git'));
  const marker = path.join(dir, 'upload-pack-ran');
  const evil = `--upload-pack=node -e "require('fs').writeFileSync('${marker.replace(/\\/g, '/')}','x')"`;
  assert.throws(() => repos.ensureBranch(dir, 'GH-16-x', evil), (err) => err.code === 'bad-branch');
  assert.throws(() => repos.ensureWorktree(dir, 'GH-16-x', evil), (err) => err.code === 'bad-branch');
  assert.equal(fs.existsSync(marker), false);
});

test('a revision that is an option never reaches git as one', () => {
  const dir = tempRepo();
  assert.equal(repos.tip(dir, '--output=owned.txt'), null);
  assert.equal(repos.pathsChanged(dir, '--output=owned.txt', 'HEAD', ['a.txt']), true, 'an unreadable revision counts as changed');
  assert.equal(fs.existsSync(path.join(dir, 'owned.txt')), false);
});

// ---------------------------------------------------------------------------------------------
// M10: no bare tool names
// ---------------------------------------------------------------------------------------------

// A file the system would start by that name: on Windows node.exe copied (libuv finds <cwd>\git.exe
// before PATH); on posix a script that records that it ran.
function plantTool(dir, name, record) {
  const file = path.join(dir, `${name}${exe}`);
  if (win) fs.copyFileSync(process.execPath, file);
  else {
    fs.writeFileSync(file, `#!/bin/sh\necho ran > '${record}'\nexit 0\n`);
    fs.chmodSync(file, 0o755);
  }
  return file;
}

function pathWithout(...tools) {
  // The PATH of this process, minus any entry that holds one of the tools being tested.
  return process.env[win ? 'Path' : 'PATH'].split(path.delimiter).filter((d) => !tools.some((t) => {
    try { return fs.statSync(path.join(d, `${t}${exe}`)).isFile(); } catch { return false; }
  }));
}

test('a git planted in the project root is never the one started', () => {
  const dir = tempRepo();
  const record = path.join(dir, 'planted-ran');
  plantTool(dir, 'git', record);
  const realGit = resolveTool('git', { root: dir });
  assert.ok(realGit, 'a real git resolves');
  const saved = process.env[win ? 'Path' : 'PATH'];
  process.env[win ? 'Path' : 'PATH'] = [dir, '.', path.dirname(realGit), ...pathWithout('git')].join(path.delimiter);
  try {
    const r = repos.git(dir, ['rev-parse', '--is-inside-work-tree']);
    assert.equal(r.ok, true, r.stderr);
    assert.equal(r.stdout.trim(), 'true');
    assert.equal(repos.snapshotHooks(dir).length > 0, true);
  } finally {
    process.env[win ? 'Path' : 'PATH'] = saved;
  }
  assert.equal(fs.existsSync(record), false, 'the planted git did not run');
});

test('ULTRAPOWERS_GIT is accepted only as an absolute path', () => {
  const dir = tempRepo();
  const saved = process.env.ULTRAPOWERS_GIT;
  try {
    process.env.ULTRAPOWERS_GIT = 'git';
    const relative = repos.git(dir, ['rev-parse', 'HEAD']);
    assert.equal(relative.ok, false);
    assert.match(relative.stderr, /ULTRAPOWERS_GIT.*absolute/);
    process.env.ULTRAPOWERS_GIT = resolveTool('git', { root: dir });
    assert.equal(repos.git(dir, ['rev-parse', '--is-inside-work-tree']).ok, true);
  } finally {
    if (saved === undefined) delete process.env.ULTRAPOWERS_GIT; else process.env.ULTRAPOWERS_GIT = saved;
  }
});

test('a gh or glab planted in the project root is not started: the tracker reports no-cli', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'autopilot-hardening-gh-'));
  plantTool(root, 'gh', path.join(root, 'planted-ran'));
  plantTool(root, 'glab', path.join(root, 'planted-ran'));
  const env = { [win ? 'Path' : 'PATH']: [root, '.'].join(path.delimiter), PATHEXT: '.COM;.EXE;.BAT;.CMD' };
  for (const [provider, host, cli] of [['github', 'github.com', 'gh'], ['gitlab', 'gitlab.example.com', 'glab']]) {
    const tracker = trackerFor({ provider, host, path: 'o/r', root }, env);
    await assert.rejects(tracker.labels(1), (err) => err.code === 'no-cli' && new RegExp(`${cli} is not on PATH`).test(err.message));
  }
  assert.equal(fs.existsSync(path.join(root, 'planted-ran')), false);
});

test('a harness planted in the project root is not started: the stage ends with "not on PATH"', () => {
  const ws = workspace();
  plantTool(ws.root, 'claude', path.join(ws.root, 'planted-ran'));
  const gitDir = path.dirname(resolveTool('git', { root: ws.root }));
  // Both spellings: a Git Bash environment carries PATH, a native one Path, and the child takes one.
  const searchPath = [ws.root, '.', gitDir].join(path.delimiter);
  const r = run(ws, ['run', 'GH-16', '--once'], { ULTRAPOWERS_CLAUDE: '', PATH: searchPath, Path: searchPath, ULTRAPOWERS_STAGE_GH_TOKEN: '', ULTRAPOWERS_STAGE_GITLAB_TOKEN: '' });
  assert.ok(r.json?.stages, r.stdout + r.stderr);
  assert.match(r.json.stages[0].message, /claude is not on PATH/);
  assert.equal(r.json.stages[0].exitCode, 127);
  assert.equal(fs.existsSync(path.join(ws.root, 'planted-ran')), false);
});

test('the harness override keeps working: a .mjs override runs under node', () => {
  const ws = workspace();
  const r = run(ws, ['run', 'GH-16', '--once'], { ULTRAPOWERS_CLAUDE: HARNESS_STUB, STUB_LOG: path.join(ws.stubDir, 'calls.log'), ULTRAPOWERS_STAGE_GH_TOKEN: '', ULTRAPOWERS_STAGE_GITLAB_TOKEN: '' });
  assert.ok(r.json?.stages?.length > 0, r.stdout + r.stderr);
  assert.equal(r.json.stages[0].exitCode, 0, JSON.stringify(r.json.stages));
});
