// fetch-ticket.mjs: the resolve, fetch and write-source commands, run as a
// real process against temp projects. gh and glab are replaced by
// fixtures/cli-stub.mjs through ULTRAPOWERS_GH and ULTRAPOWERS_GLAB, so the
// execFile path runs offline (spec section 7).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = path.resolve(HERE, '../../skills/new-task/scripts/fetch-ticket.mjs');
const STUB = path.join(HERE, 'fixtures', 'cli-stub.mjs');

function tickets(overrides = {}) {
  return {
    transport: 'auto',
    sources: [
      {
        prefix: 'GL', provider: 'gitlab', host: 'gitlab.com', namespace: 'acme/platform',
        projects: { 'auth-service': 'acme/identity/auth-service' }, defaultProject: 'tracker',
        ...(overrides.GL ?? {}),
      },
      { prefix: 'GH', provider: 'github', owner: 'acme', defaultProject: 'web' },
      { prefix: 'ODOO', provider: 'odoo', url: 'https://erp.example.com', mcpUrl: 'https://erp.example.com/mcp', defaultProject: '12' },
    ],
  };
}

function project(t = tickets()) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fetch-ticket-'));
  fs.mkdirSync(path.join(root, '.agents'));
  fs.writeFileSync(path.join(root, '.agents', 'ultrapowers.json'), JSON.stringify({
    name: 'fixture',
    repos: [{ name: 'billing-api', path: 'billing-api', defaultBranch: 'main' }, { name: 'web', path: 'web', defaultBranch: 'main' }],
    tickets: t,
  }, null, 2));
  return root;
}

function run(root, args, env = {}) {
  const log = path.join(root, 'stub.log');
  const result = spawnSync(process.execPath, [SCRIPT, ...args], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, ULTRAPOWERS_GH: STUB, ULTRAPOWERS_GLAB: STUB, STUB_LOG: log, ...env },
  });
  let json = null;
  try { json = JSON.parse(result.stdout); } catch { /* asserted by the caller */ }
  const calls = fs.existsSync(log) ? fs.readFileSync(log, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [];
  return { code: result.status, json, stdout: result.stdout, stderr: result.stderr, calls };
}

const GH_JSON = JSON.stringify({
  number: 7, title: 'T', body: 'B', state: 'OPEN', labels: [{ name: 'bug' }],
  author: { login: 'ana' }, url: 'https://github.com/acme/web/issues/7',
});
const GL_JSON = JSON.stringify({
  iid: 42, title: 'T', description: 'D', state: 'opened', labels: ['backend'],
  author: { username: 'bo' }, web_url: 'https://gitlab.com/acme/platform/billing-api/-/issues/42',
});

test('fetch GH-web-7 through gh returns the normalized ticket', () => {
  const r = run(project(), ['fetch', 'GH-web-7'], { STUB_JSON: GH_JSON });
  assert.equal(r.code, 0, r.stdout + r.stderr);
  assert.deepEqual(r.json, {
    title: 'T', body: 'B', url: 'https://github.com/acme/web/issues/7',
    state: 'open', labels: ['bug'], author: 'ana', via: 'cli',
  });
  assert.deepEqual(r.calls.find((c) => c[0] === 'issue'),
    ['issue', 'view', '7', '-R', 'acme/web', '--json', 'number,title,body,state,labels,author,url']);
  assert.deepEqual(r.calls.find((c) => c[0] === 'auth'), ['auth', 'status', '--hostname', 'github.com']);
});

test('fetch GL-billing-api-42 through glab returns the normalized ticket', () => {
  const r = run(project(), ['fetch', 'GL-billing-api-42'], { STUB_JSON: GL_JSON });
  assert.equal(r.code, 0, r.stdout + r.stderr);
  assert.deepEqual(r.json, {
    title: 'T', body: 'D', url: 'https://gitlab.com/acme/platform/billing-api/-/issues/42',
    state: 'opened', labels: ['backend'], author: 'bo', via: 'cli',
  });
  const view = r.calls.find((c) => c[0] === 'issue');
  assert.deepEqual(view, ['issue', 'view', '42', '-R', 'acme/platform/billing-api', '-F', 'json']);
});

test('auth failing under auto hands the fetch to the MCP server', () => {
  const r = run(project(), ['fetch', 'GL-billing-api-42'], { STUB_AUTH_EXIT: '1' });
  assert.equal(r.code, 0, r.stdout + r.stderr);
  assert.deepEqual(r.json, { via: 'mcp', provider: 'gitlab', server: 'tickets-gl', path: 'acme/platform/billing-api', number: 42 });
  assert.equal(r.calls.some((c) => c[0] === 'issue'), false);
});

test('auth failing under transport cli is no-cli, naming glab and GITLAB_TOKEN', () => {
  const r = run(project(tickets({ GL: { transport: 'cli' } })), ['fetch', 'GL-42'], { STUB_AUTH_EXIT: '1' });
  assert.equal(r.code, 2);
  assert.equal(r.json.error.code, 'no-cli');
  assert.match(r.json.error.message, /glab/);
  assert.match(r.json.error.message, /GITLAB_TOKEN/);
});

test('a missing CLI binary under auto falls back to MCP without crashing', () => {
  const missing = path.join(os.tmpdir(), 'no-such-dir-ultrapowers', 'glab');
  const r = run(project(), ['fetch', 'GL-42'], { ULTRAPOWERS_GLAB: missing });
  assert.equal(r.code, 0, r.stdout + r.stderr);
  assert.equal(r.json.via, 'mcp');
  assert.equal(r.json.path, 'acme/platform/tracker');
});

test('Odoo always goes through MCP and starts no CLI', () => {
  const r = run(project(), ['fetch', 'ODOO-12-1203']);
  assert.equal(r.code, 0, r.stdout + r.stderr);
  assert.deepEqual(r.json, { via: 'mcp', provider: 'odoo', server: 'tickets-odoo', path: '12', number: 1203 });
  assert.equal(r.calls.length, 0);
});

test('a ticket the CLI cannot resolve is not-found with the provider message', () => {
  const r = run(project(), ['fetch', 'GH-web-7'], {
    STUB_VIEW_EXIT: '1', STUB_STDERR: 'GraphQL: Could not resolve to an issue or pull request with the number of 7.',
  });
  assert.equal(r.code, 2);
  assert.equal(r.json.error.code, 'not-found');
  assert.match(r.json.error.message, /Could not resolve to an issue/);
});

test('any other CLI failure is cli-failed with its first stderr line', () => {
  const r = run(project(), ['fetch', 'GH-web-7'], { STUB_VIEW_EXIT: '1', STUB_STDERR: 'boom' });
  assert.equal(r.code, 2);
  assert.equal(r.json.error.code, 'cli-failed');
  assert.match(r.json.error.message, /boom/);
});

test('a CLI that hangs is stopped with timeout', () => {
  const r = run(project(), ['fetch', 'GH-web-7'], { STUB_JSON: GH_JSON, STUB_SLEEP_MS: '40000', ULTRAPOWERS_FETCH_TIMEOUT_MS: '200' });
  assert.equal(r.code, 2);
  assert.equal(r.json.error.code, 'timeout');
});

test('resolve prints the resolution; a local id is local', () => {
  const root = project();
  assert.deepEqual(run(root, ['resolve', 'PROJ-88']).json, { provider: 'local' });
  const r = run(root, ['resolve', 'GL-billing-api-42']);
  assert.equal(r.json.repoHint, 'billing-api');
  assert.equal(r.json.server, 'tickets-gl');
});

test('resolve and fetch report bad-ticket for an id without a number', () => {
  const r = run(project(), ['fetch', 'GL-billing-api']);
  assert.equal(r.code, 2);
  assert.equal(r.json.error.code, 'bad-ticket');
});

test('--root overrides the walk up from the cwd', () => {
  const root = project();
  const elsewhere = fs.mkdtempSync(path.join(os.tmpdir(), 'fetch-elsewhere-'));
  const result = spawnSync(process.execPath, [SCRIPT, 'resolve', 'GH-web-7', '--root', root], { cwd: elsewhere, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.equal(JSON.parse(result.stdout).path, 'acme/web');
});

test('outside any project, resolve is no-marker', () => {
  const bare = fs.mkdtempSync(path.join(os.tmpdir(), 'fetch-bare-'));
  const r = run(bare, ['resolve', 'GL-42']);
  assert.equal(r.code, 2);
  assert.equal(r.json.error.code, 'no-marker');
});
