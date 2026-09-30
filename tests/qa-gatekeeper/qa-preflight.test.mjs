import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '../..');
const scriptPath = resolve(repoRoot, 'skills/qa-specialist/scripts/qa-preflight.mjs');
const mod = await import(pathToFileURL(scriptPath).href);
const { findRoot, filledString, filledList, ticketBranchRegex, validateConfig, scanContentHint, preflight } = mod;

const FULL_QA = {
  urls: { frontend: 'http://localhost:3000', backendHealth: 'http://localhost:8080/health', idp: '', observability: '' },
  hosts: { allowed: ['localhost', '127.0.0.1'], forbidden: [] },
  auth: { type: 'form', route: '/login', tokenUrl: '', clientId: '', recipe: '' },
  roles: [
    { name: 'user', userEnv: 'QA_USER_USER', passwordEnv: 'QA_PW_USER', required: true },
    { name: 'admin', userEnv: 'QA_USER_ADMIN', passwordEnv: 'QA_PW_ADMIN', required: false },
  ],
  languages: [{ code: 'en', switch: '?lang=en' }, { code: 'fr', switch: '?lang=fr' }],
  containers: { watch: ['backend-container'], errorPattern: 'error|exception|fatal|unhandled' },
  db: { engine: 'postgres', container: 'db-container', host: '', database: 'appdb', roRole: 'qa_agent_ro', roPasswordEnv: 'QA_DB_RO_PASSWORD', tenantColumn: 'tenant_id', auditTables: ['audit_log'] },
  suites: [{ repo: 'repo-a', command: 'npm test -- --reporter=json --outputFile={{out}}/vitest.json', resultFormat: 'vitest-json', timeoutSec: 600 }],
  observability: { provider: 'none', publicKeyEnv: '', secretKeyEnv: '' },
  brand: { logoPaths: ['repo-a/public/logo.svg'], tokenPaths: [], compareRoute: '/' },
  regression: ['/', '/login'],
  knownIssues: 'qa/known-issues.md',
  api: { errorEnvelopeFields: ['message'], crossTenantStatus: 404 },
};

const TEMPLATE_QA = {
  urls: { frontend: '', backendHealth: '', idp: '', observability: '' },
  hosts: { allowed: [], forbidden: [] },
  auth: { type: 'form|oidc-password|custom', route: '', tokenUrl: '', clientId: '', recipe: '' },
  roles: [{ name: 'user', userEnv: 'QA_USER_USER', passwordEnv: 'QA_PW_USER', required: true }],
  languages: [{ code: 'en', switch: '' }],
  containers: { watch: [], errorPattern: 'error|exception|fatal|unhandled' },
  db: { engine: 'postgres', container: '', host: '', database: '', roRole: 'qa_agent_ro', roPasswordEnv: 'QA_DB_RO_PASSWORD', tenantColumn: '', auditTables: [] },
  suites: [{ repo: '', command: '', resultFormat: 'trx|vitest-json|junit-xml', timeoutSec: 1800 }],
  observability: { provider: 'langfuse|none', publicKeyEnv: '', secretKeyEnv: '' },
  brand: { logoPaths: [], tokenPaths: [], compareRoute: '' },
  regression: [''],
  knownIssues: 'qa/known-issues.md',
  api: { errorEnvelopeFields: [], crossTenantStatus: 404 },
};

const ENV_ALL = { QA_USER_USER: 'u', QA_PW_USER: 'p', QA_USER_ADMIN: 'a', QA_PW_ADMIN: 'p' };

function git(dir, ...args) {
  const run = spawnSync('git', ['-C', dir, '-c', 'user.name=t', '-c', 'user.email=t@example.com', ...args], { encoding: 'utf8' });
  assert.equal(run.status, 0, `git ${args.join(' ')} failed: ${run.stderr}`);
  return run.stdout.trim();
}

function makeProject({ qa = FULL_QA, ticket = '1234', branch = 'feat/1234-thing', specText = 'The feature generates a PDF report per company.' } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'qa-preflight-'));
  mkdirSync(join(root, '.agents'));
  writeFileSync(join(root, '.agents', 'ultrapowers.json'), JSON.stringify({
    name: 'sample', pluginVersion: '1.0.0', topology: 'nested',
    repos: [{ name: 'repo-a', path: 'repo-a', defaultBranch: 'main' }, { name: 'repo-b', path: 'repo-b', defaultBranch: 'main' }],
    ticketPattern: '^#?[A-Za-z0-9][A-Za-z0-9._-]*$',
    qa,
  }, null, 2));
  for (const dir of ['tasks', 'specs', 'plans', 'reviews']) mkdirSync(join(root, dir, ticket), { recursive: true });
  writeFileSync(join(root, 'tasks', ticket, `${ticket}.md`), `# ${ticket} - Sample\n\n## Context\nA sample brief.\n`);
  writeFileSync(join(root, 'specs', ticket, 'Spec.md'), `# Spec\n\n${specText}\n`);
  writeFileSync(join(root, 'plans', ticket, 'Plan.md'), '# Plan\n');
  mkdirSync(join(root, 'qa'));
  writeFileSync(join(root, 'qa', 'known-issues.md'), '# baseline\n```lane6-suppress\n```\n');
  for (const repo of ['repo-a', 'repo-b']) {
    const dir = join(root, repo);
    mkdirSync(join(dir, 'src'), { recursive: true });
    spawnSync('git', ['init', '-q', '-b', 'main', dir]);
    writeFileSync(join(dir, 'src', 'a.js'), 'export const a = 1;\n');
    git(dir, 'add', '.');
    git(dir, 'commit', '-q', '-m', 'init');
  }
  const repoA = join(root, 'repo-a');
  git(repoA, 'checkout', '-q', '-b', branch);
  writeFileSync(join(repoA, 'src', 'a.js'), 'export const a = 2;\n');
  git(repoA, 'add', '.');
  git(repoA, 'commit', '-q', '-m', 'change a');
  return root;
}

test('findRoot walks up from a nested clone and returns null past the filesystem root', () => {
  const root = makeProject();
  assert.equal(findRoot(join(root, 'repo-a', 'src')), root);
  assert.equal(findRoot(tmpdir()), null);
  rmSync(root, { recursive: true, force: true });
});

test('filledString rejects empty strings and enum placeholders; filledList rejects arrays of blanks', () => {
  assert.equal(filledString('http://localhost:3000'), true);
  assert.equal(filledString(''), false);
  assert.equal(filledString('   '), false);
  assert.equal(filledString('form|oidc-password|custom'), false);
  assert.equal(filledString('a|b'), false);
  assert.equal(filledString('error|exception|fatal|unhandled'), false);
  assert.equal(filledList(['']), false);
  assert.equal(filledList([]), false);
  assert.equal(filledList(['/']), true);
});

test('ticketBranchRegex escapes metacharacters, strips a leading #, and needs a non-digit boundary', () => {
  assert.equal(ticketBranchRegex('1234').test('feat/1234-thing'), true);
  assert.equal(ticketBranchRegex('123').test('feat/1234-thing'), false);
  assert.equal(ticketBranchRegex('#1234').test('1234'), true);
  assert.equal(ticketBranchRegex('PROJ-12.3').test('PROJ-12.3-x'), true);
  assert.equal(ticketBranchRegex('PROJ-12.3').test('PROJ-12x3-x'), false);
  assert.equal(ticketBranchRegex('1234').test('a1234b'), false);
});

test('validateConfig on the template lists every empty required key and gates lanes off with reasons', () => {
  const result = validateConfig(TEMPLATE_QA, ENV_ALL);
  assert.deepEqual(result.missing, ['qa.urls.frontend', 'qa.urls.backendHealth', 'qa.hosts.allowed', 'qa.auth.type (one of form, oidc-password, custom)']);
  assert.equal(result.gates.lane2.active, false);
  assert.equal(result.gates.lane4.active, false);
  assert.equal(result.gates.lane5.active, false);
  assert.equal(result.gates.lane6.active, false);
  assert.equal(result.gates.visualBrand.active, false);
  assert.equal(result.gates.localization.active, false);
  assert.equal(result.gates.regression.active, false);
  for (const gate of Object.values(result.gates)) {
    if (!gate.active) assert.ok(gate.reason.length > 0, 'every inactive gate has a reason');
  }
  assert.deepEqual(result.regression, []);
});

test('validateConfig on a full config is ok, gates on, and reports credentials by presence only', () => {
  const result = validateConfig(FULL_QA, { QA_USER_USER: 'u', QA_PW_USER: 'p' });
  assert.deepEqual(result.missing, []);
  assert.equal(result.gates.lane2.active, true);
  assert.equal(result.gates.lane4.active, true);
  assert.equal(result.gates.lane5.active, false);
  assert.equal(result.gates.lane6.active, true);
  assert.equal(result.gates.visualBrand.active, true);
  assert.equal(result.gates.localization.active, true);
  assert.equal(result.gates.regression.active, true);
  assert.equal(result.roles[0].credentials, 'present');
  assert.equal(result.roles[1].credentials, 'missing');
  assert.deepEqual(result.preconditions, []);
  assert.equal(JSON.stringify(result).includes('"u"'), false, 'credential values never appear in the report');
});

test('a required role without credentials is a precondition; no credentials at all is too', () => {
  const one = validateConfig(FULL_QA, {});
  assert.ok(one.preconditions.some((p) => p.includes('required role "user"') && p.includes('QA_USER_USER') && p.includes('QA_PW_USER')));
  assert.ok(one.preconditions.some((p) => p.includes('no role has credentials')));
  const two = validateConfig(FULL_QA, { QA_USER_ADMIN: 'a', QA_PW_ADMIN: 'p' });
  assert.ok(two.preconditions.some((p) => p.includes('required role "user"')));
  assert.equal(two.preconditions.some((p) => p.includes('no role has credentials')), false);
});

test('scanContentHint finds generation terms and stays quiet otherwise', () => {
  const hit = scanContentHint('The feature generates a PDF report and translates the summary.');
  assert.equal(hit.active, true);
  assert.ok(hit.terms.includes('generates'));
  assert.equal(scanContentHint('Adds a sort button to the table.').active, false);
});

test('preflight resolves docs, run-state, marker and the change set from ticket branches', () => {
  const root = makeProject();
  const report = preflight({ cwd: join(root, 'repo-b'), ticket: '1234', env: ENV_ALL });
  assert.equal(report.ok, true);
  assert.equal(report.root, root);
  assert.equal(report.docs.brief.exists, true);
  assert.equal(report.docs.spec.exists, true);
  assert.equal(report.docs.plans.length, 1);
  assert.equal(report.runState.exists, false);
  assert.equal(report.markerExists, false);
  assert.equal(report.knownIssues.exists, true);
  const a = report.changeSet.find((r) => r.repo === 'repo-a');
  const b = report.changeSet.find((r) => r.repo === 'repo-b');
  assert.equal(a.onTicketBranch, true);
  assert.deepEqual(a.files, ['src/a.js']);
  assert.equal(a.commits.length, 1);
  assert.equal(b.onTicketBranch, false);
  assert.deepEqual(b.files, []);
  assert.equal(report.gates.lane7.active, true);
  assert.equal(report.suites[0].path, join(root, 'repo-a'));
  rmSync(root, { recursive: true, force: true });
});

test('preflight reports run-state and marker when present and turns lane 7 off without generation terms', () => {
  const root = makeProject({ specText: 'Adds a sort button to the table.' });
  mkdirSync(join(root, '.ultrapowers'));
  writeFileSync(join(root, '.ultrapowers', 'qa-active'), '1234');
  writeFileSync(join(root, 'reviews', '1234', 'run-state.json'), '{}');
  const report = preflight({ cwd: root, ticket: '1234', env: ENV_ALL });
  assert.equal(report.runState.exists, true);
  assert.equal(report.markerExists, true);
  assert.equal(report.gates.lane7.active, false);
  rmSync(root, { recursive: true, force: true });
});

test('preflight accepts a # prefixed id and matches its branch', () => {
  const root = makeProject({ ticket: '#77', branch: 'fix/77-login' });
  const report = preflight({ cwd: root, ticket: '#77', env: ENV_ALL });
  assert.equal(report.ok, true);
  assert.equal(report.changeSet.find((r) => r.repo === 'repo-a').onTicketBranch, true);
  assert.equal(report.docs.reviewDir, 'reviews/#77');
  rmSync(root, { recursive: true, force: true });
});

test('CLI exit codes: 0 with report, 3 without a root, 4 on an invalid ticket, 2 on usage', () => {
  const root = makeProject();
  const ok = spawnSync(process.execPath, [scriptPath, '1234', '--cwd', root], { encoding: 'utf8', env: { ...process.env, ...ENV_ALL } });
  assert.equal(ok.status, 0, ok.stderr);
  const parsed = JSON.parse(ok.stdout);
  assert.equal(parsed.ok, true);
  const noRoot = spawnSync(process.execPath, [scriptPath, '1234', '--cwd', tmpdir()], { encoding: 'utf8' });
  assert.equal(noRoot.status, 3);
  assert.match(JSON.parse(noRoot.stdout).errors[0], /^ERROR: no \.agents\/ultrapowers\.json/);
  const badTicket = spawnSync(process.execPath, [scriptPath, 'bad ticket!', '--cwd', root], { encoding: 'utf8' });
  assert.equal(badTicket.status, 4);
  assert.match(JSON.parse(badTicket.stdout).errors[0], /^ERROR: ticket/);
  const usage = spawnSync(process.execPath, [scriptPath], { encoding: 'utf8' });
  assert.equal(usage.status, 2);
  // qa: undefined would fall back to the FULL_QA default; null reaches the no-qa branch.
  const missingQa = makeProject({ qa: null });
  const noQa = spawnSync(process.execPath, [scriptPath, '1234', '--cwd', missingQa], { encoding: 'utf8' });
  assert.equal(noQa.status, 0);
  assert.deepEqual(JSON.parse(noQa.stdout).missing, ['qa']);
  rmSync(root, { recursive: true, force: true });
  rmSync(missingQa, { recursive: true, force: true });
});

test('ids that name a path are refused whatever ticketPattern allows', () => {
  const root = makeProject();
  const cfgPath = join(root, '.agents', 'ultrapowers.json');
  const cfg = JSON.parse(readFileSync(cfgPath, 'utf8'));
  cfg.ticketPattern = '.*';
  writeFileSync(cfgPath, JSON.stringify(cfg));
  for (const id of ['../x', 'a/b', 'a\\b', 'a b', '.', '..', '-x', 'a\nb']) {
    const result = preflight({ cwd: root, ticket: id, env: ENV_ALL });
    assert.equal(result.exitCode, 4, `id ${JSON.stringify(id)}`);
    assert.match(result.errors[0], /^ERROR: ticket/);
  }
  assert.equal(preflight({ cwd: root, ticket: '#12', env: ENV_ALL }).exitCode, 0);
  rmSync(root, { recursive: true, force: true });
});

test('a marker with a UTF-8 byte order mark is read', () => {
  const root = makeProject();
  const cfgPath = join(root, '.agents', 'ultrapowers.json');
  writeFileSync(cfgPath, '﻿' + readFileSync(cfgPath, 'utf8'));
  const result = preflight({ cwd: root, ticket: '1234', env: ENV_ALL });
  assert.equal(result.exitCode, 0, JSON.stringify(result.errors));
  assert.equal(result.ok, true);
  rmSync(root, { recursive: true, force: true });
});

test('runState.unfinished reads plan rows only, never lane or suite statuses', () => {
  const root = makeProject();
  const rs = join(root, 'reviews', '1234', 'run-state.json');
  writeFileSync(rs, JSON.stringify({ ticket: '1234', plan: [{ id: 'P1', status: 'done' }, { id: 'P2', status: 'not-covered' }], lanes: { 3: { status: 'pending' }, 6: { status: 'running' } }, suites: [{ repo: 'repo-a', status: 'running' }] }));
  let r = preflight({ cwd: root, ticket: '1234', env: ENV_ALL });
  assert.equal(r.runState.exists, true);
  assert.equal(r.runState.unfinished, false);
  writeFileSync(rs, JSON.stringify({ ticket: '1234', plan: [{ id: 'P1', status: 'done' }, { id: 'P2', status: 'pending' }] }));
  r = preflight({ cwd: root, ticket: '1234', env: ENV_ALL });
  assert.equal(r.runState.unfinished, true);
  writeFileSync(rs, '{ "plan": [');
  r = preflight({ cwd: root, ticket: '1234', env: ENV_ALL });
  assert.equal(r.runState.unfinished, false);
  assert.match(r.runState.error, /JSON|Unexpected|end/i);
  rmSync(root, { recursive: true, force: true });
});
