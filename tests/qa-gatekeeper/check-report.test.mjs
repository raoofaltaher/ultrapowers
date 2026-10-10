import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import test from 'node:test';

const __dirname = dirname(fileURLToPath(import.meta.url));
const { checkReport, checkResume, snapshot } = await import(pathToFileURL(resolve(__dirname, 'check-report.mjs')).href);

const GOOD = [
  '# QA report — 2001', '', '| Ticket | 2001 |', '|---|---|', '',
  'Guardrail: active', '',
  'Verdict: PASS-WITH-ISSUES — one Confirmed Medium Localization finding.', '',
  '## Exit criteria', '- [x] No open Confirmed Critical', '',
  '## Findings', '### F1 Raw key in French', '![French refusal](artifacts/items-user-fr-empty-name.png)', '',
  '## Dimension matrix', '| Dimension | Result | Why |', '|---|---|---|',
  '| Functional | Pass | every action tried |', '| UX and navigation | Pass | home link everywhere |',
  '| Visual and brand | N/A | no brand block |', '| Localization | Fail | see F1 |',
  '| Access control | Pass | user gets 403 on /admin |', '| Resilience | Pass | inputs refused cleanly |',
  '| Performance-lite | Pass | no console errors |', '| Regression | Pass | / smoke |', '',
  '## Per-lane coverage',
  '### Lane 1: UI', '![admin list](artifacts/items-admin-en-list.png)', '',
  '### Lane 2: Logs', 'not-covered — qa.containers.watch is empty', '',
  '### Lane 3: API', 'probed /api/items without a session: 401', '',
  '### Lane 4: Database', 'not-covered — qa.db is not configured (engine, container or host, database)', '',
  '### Lane 5: Observability', 'not-covered — qa.observability.provider is none', '',
  '### Lane 6: Suites', 'app: 0 new-failing', '',
  '### Lane 7: Generated content', 'not-covered — the feature generates nothing', '',
  '## Scenarios covered', '- P1 done', '',
  '## Root-cause hints', '- server.mjs: the French strings lack the required entry', '',
  '## Known-issues candidates', '- none', '',
  '## Data hygiene', '- two items created', '',
].join('\n');
const OPTS = { id: '2001', roles: ['user', 'admin'], notCovered: [2, 4, 5, 7] };
const failed = (results) => results.filter((r) => !r.ok).map((r) => r.name);

test('a well-formed report passes every check', () => {
  assert.deepEqual(failed(checkReport(GOOD, OPTS)), []);
});

const STOPPED = 'Stopped at close: app (reviews/2001/suites/app), stopped 2026-10-10T12:00:00Z, reason timeout';

test('a suite stopped at close is named under Lane 6, and a row anywhere else fails', () => {
  const under6 = GOOD.replace('app: 0 new-failing', `app: 0 new-failing\n${STOPPED}`);
  assert.deepEqual(failed(checkReport(under6, OPTS)), []);
  const under1 = GOOD.replace('![admin list](artifacts/items-admin-en-list.png)', `![admin list](artifacts/items-admin-en-list.png)\n${STOPPED}`);
  assert.ok(failed(checkReport(under1, OPTS)).includes('a Stopped at close row sits under Lane 6: Suites'));
});

test('a second Verdict line, a missing role screenshot and a linked png all fail', () => {
  const bad = GOOD
    .replace('## Data hygiene', 'Verdict: PASS\n\n## Data hygiene')
    .replace('![admin list](artifacts/items-admin-en-list.png)', '[admin list](artifacts/items-admin-en-list.png)');
  const names = failed(checkReport(bad, OPTS));
  assert.ok(names.some((n) => n.startsWith('exactly one Verdict: line')));
  assert.ok(names.includes('at least one embedded screenshot for role admin'));
  assert.ok(names.includes('every .png is embedded with ![](), none linked'));
});

test('a gated lane without its not-covered reason fails, and so does a JWT anywhere', () => {
  const bad = GOOD
    .replace('not-covered — qa.db is not configured (engine, container or host, database)', 'checked the database')
    .replace('- two items created', '- token eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abc');
  const names = failed(checkReport(bad, OPTS));
  assert.ok(names.includes('lane 4 is not-covered with a reason'));
  assert.ok(names.includes('no bearer token or JWT in the report'));
});

test('the Guardrail line is required, exactly one, and says active or not active on this harness', () => {
  const names = (text) => failed(checkReport(text, OPTS));
  assert.ok(names(GOOD.replace('Guardrail: active\n\n', '')).some((n) => n.startsWith('exactly one Guardrail: line')), 'a report without the line fails');
  assert.ok(names(GOOD.replace('Guardrail: active', 'Guardrail: active\nGuardrail: active')).some((n) => n.startsWith('exactly one Guardrail: line')), 'two lines fail');
  assert.ok(names(GOOD.replace('Guardrail: active', 'Guardrail: probably')).includes('Guardrail line says active or not active on this harness'));
  assert.ok(names(GOOD.replace('Guardrail: active', 'Guardrail: not probed')).includes('Guardrail line says active or not active on this harness'), 'not probed is for a PRECONDITION-FAILED report only');
  assert.deepEqual(names(GOOD.replace('Guardrail: active', 'Guardrail: not active on this harness')), []);
});

test('a PRECONDITION-FAILED report needs only the title, the guardrail line, the verdict and the lanes', () => {
  const lanes = ['1: UI', '2: Logs', '3: API', '4: Database', '5: Observability', '6: Suites', '7: Generated content'];
  const text = ['# QA report — 2001', '', 'Guardrail: not probed — the run ended before STEP 4', '', 'Verdict: PRECONDITION-FAILED — the frontend did not answer.', '', '## Per-lane coverage',
    ...lanes.flatMap((lane) => [`### Lane ${lane}`, 'not-covered — precondition failed: frontend', '']),
  ].join('\n');
  assert.deepEqual(failed(checkReport(text, { id: '2001', verdict: 'PRECONDITION-FAILED', notCovered: [1, 2, 3, 4, 5, 6, 7] })), []);
});

test('resume keeps done rows, findings, startedAt and watermark, and untouched evidence keeps its hash', () => {
  const before = { startedAt: 'T0', watermark: 'W0', plan: [{ id: 'P1', status: 'done' }, { id: 'P2', status: 'pending' }], findings: [{ id: 'F1' }] };
  const good = { startedAt: 'T0', watermark: 'W0', plan: [{ id: 'P1', status: 'done' }, { id: 'P2', status: 'done' }], findings: [{ id: 'F1' }, { id: 'F2' }] };
  assert.deepEqual(failed(checkResume(before, good, { complete: true })), []);
  const redone = { startedAt: 'T1', watermark: 'W1', plan: [{ id: 'P1', status: 'pending' }, { id: 'P2', status: 'done' }], findings: [] };
  const names = failed(checkResume(before, redone, { complete: true }));
  for (const expected of ['startedAt kept', 'watermark kept', 'row P1 still done', 'finding F1 kept', 'no pending rows left']) {
    assert.ok(names.includes(expected), `expected a failure named "${expected}"`);
  }
  const dir = mkdtempSync(join(tmpdir(), 'qa-check-'));
  writeFileSync(join(dir, 'a.png'), 'one');
  const snap = snapshot(dir);
  writeFileSync(join(dir, 'a.png'), 'two');
  assert.ok(failed(checkResume(before, good, { snapshot: snap, artifactsDir: dir })).includes('evidence a.png unchanged'));
  rmSync(dir, { recursive: true, force: true });
});
