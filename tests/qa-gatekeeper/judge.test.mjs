import assert from 'node:assert/strict';
import { mkdtempSync, copyFileSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '../..');
const judgePath = resolve(repoRoot, 'skills/qa-lane-6-suites/scripts/judge.mjs');
const fixtures = resolve(__dirname, 'fixtures/judge');
const baseline = join(fixtures, 'baseline.md');

const {
  parseSuppressList, failingFromTrx, failingFromVitest, failingFromJunit, judge, formatReport,
} = await import(pathToFileURL(judgePath).href);

function readFixture(name) {
  return readFileSync(join(fixtures, name), 'utf8');
}

function tempDir(...files) {
  const dir = mkdtempSync(join(tmpdir(), 'judge-'));
  for (const f of files) copyFileSync(join(fixtures, f), join(dir, f));
  return dir;
}

function runCli(outDir, base = baseline) {
  return spawnSync(process.execPath, [judgePath, outDir, base], { encoding: 'utf8' });
}

test('parseSuppressList reads only the fenced block, strips comments and blanks', () => {
  const list = parseSuppressList(`prose Sample.Tests.ArticlesTests\n\n\`\`\`lane6-suppress\n# c\nA.B.C\n  D.E   # trailing\n\n\`\`\`\nA.After.Block\n`);
  assert.deepEqual(list, ['A.B.C', 'D.E']);
});
test('a comment starts at whitespace-#-whitespace, so "Foo #2" stays whole', () => {
  assert.deepEqual(parseSuppressList('```lane6-suppress\nFoo #2\nCart adds item #2\nD.E   # trailing\n```'), ['Foo #2', 'Cart adds item #2', 'D.E']);
});
test('a pasted NEW-FAILING prefix is stripped', () => {
  assert.deepEqual(parseSuppressList('```lane6-suppress\nNEW-FAILING A.B\n```'), ['A.B']);
});
test('"Foo #2" does not suppress a test named "Foo"', () => {
  const dir = mkdtempSync(join(tmpdir(), 'judge-'));
  writeFileSync(join(dir, 'junit.xml'), '<testsuite><testcase name="Foo"><failure/></testcase></testsuite>');
  const base = join(dir, 'baseline.md');
  writeFileSync(base, '```lane6-suppress\nFoo #2\n```\n');
  const result = judge(dir, base);
  rmSync(dir, { recursive: true, force: true });
  assert.deepEqual(result.newFailing, ['Foo']);
});

test('failingFromTrx names Failed results in either attribute order and decodes entities', () => {
  const names = failingFromTrx(readFixture('sample.trx'));
  assert.deepEqual(names.sort(), [
    'Sample.Tests.ApprovalFlow.Delete_requires_approval',
    'Sample.Tests.ArticlesTests.Anonymous_cannot_write',
    'Sample.Tests.HeaderTests.Renders_header',
    'Sample.Tests.MathTests.Rounds & carries',
  ]);
});

test('failingFromVitest names failed assertions only', () => {
  assert.deepEqual(failingFromVitest(readFixture('vitest.json')), ['onboarding > prefill > applies detected sector']);
});

test('failingFromJunit handles classname, no classname, self-closing failure, error, skipped, entities', () => {
  const names = failingFromJunit(readFixture('junit.xml'));
  assert.deepEqual(names.sort(), [
    'com.example.CartTest.removes_item',
    'com.example.CheckoutTest.totals_add_up',
    'com.example.MathTest.Rounds & carries',
    'smoke renders home',
  ]);
});

test('failingFromJunit dedupes across nested testsuites', () => {
  assert.deepEqual(failingFromJunit(readFixture('junit-nested.xml')), ['com.example.OuterTest.first']);
});

test('judge classifies by whole-line exact name or class, never prefix or prose', () => {
  const dir = tempDir('sample.trx', 'vitest.json', 'junit.xml');
  const result = judge(dir, baseline);
  rmSync(dir, { recursive: true, force: true });
  assert.equal(result.status, 'JUDGED');
  assert.deepEqual(result.suppressed.sort(), [
    'Sample.Tests.ApprovalFlow.Delete_requires_approval',
    'Sample.Tests.HeaderTests.Renders_header',
    'com.example.CheckoutTest.totals_add_up',
  ]);
  assert.deepEqual(result.newFailing.sort(), [
    'Sample.Tests.ArticlesTests.Anonymous_cannot_write',
    'Sample.Tests.MathTests.Rounds & carries',
    'com.example.CartTest.removes_item',
    'com.example.MathTest.Rounds & carries',
    'onboarding > prefill > applies detected sector',
    'smoke renders home',
  ]);
});

test('empty out-dir is INCOMPLETE, never a zero new-failing count', () => {
  const dir = mkdtempSync(join(tmpdir(), 'judge-empty-'));
  const result = judge(dir, baseline);
  const text = formatReport(result, dir, baseline);
  rmSync(dir, { recursive: true, force: true });
  assert.equal(result.status, 'INCOMPLETE');
  assert.match(text, /^INCOMPLETE  no \.trx, vitest JSON or JUnit XML under /m);
  assert.doesNotMatch(text, /new-failing,/);
});

test('a .failed marker forces INCOMPLETE even with results present', () => {
  const dir = tempDir('sample.trx');
  writeFileSync(join(dir, '.failed'), 'npm test\n');
  const result = judge(dir, baseline);
  const text = formatReport(result, dir, baseline);
  rmSync(dir, { recursive: true, force: true });
  assert.equal(result.status, 'INCOMPLETE');
  assert.match(text, /^INCOMPLETE  suite failed to run: npm test$/m);
});

test('CLI prints the reference line shapes and exits 0', () => {
  const dir = tempDir('sample.trx', 'vitest.json');
  const run = runCli(dir);
  rmSync(dir, { recursive: true, force: true });
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /^== judge: .* vs baseline\.md ==$/m);
  assert.match(run.stdout, /^SUPPRESSED  Sample\.Tests\.ApprovalFlow\.Delete_requires_approval$/m);
  assert.match(run.stdout, /^NEW-FAILING onboarding > prefill > applies detected sector$/m);
  assert.match(run.stdout, /^== judge summary: 3 new-failing, 2 suppressed \(judge by the SET above, never these counts\) ==$/m);
});

test('CLI exits 1 when the baseline is missing', () => {
  const dir = tempDir('sample.trx');
  const run = runCli(dir, join(fixtures, 'does-not-exist.md'));
  rmSync(dir, { recursive: true, force: true });
  assert.equal(run.status, 1);
  assert.match(run.stderr, /baseline not found/);
});

function dirWith(name, text) {
  const dir = mkdtempSync(join(tmpdir(), 'judge-'));
  writeFileSync(join(dir, name), text);
  return dir;
}

test('a vitest file that failed to load is a failure even with no failed assertion', () => {
  const json = JSON.stringify({ testResults: [{ name: 'src/items.test.js', status: 'failed', message: 'SyntaxError: Unexpected token', assertionResults: [] }] });
  assert.deepEqual(failingFromVitest(json), ['src/items.test.js']);
  const dir = dirWith('vitest.json', json);
  const r = judge(dir, baseline);
  assert.equal(r.status, 'JUDGED');
  assert.deepEqual(r.newFailing, ['src/items.test.js']);
  rmSync(dir, { recursive: true, force: true });
});

test('TRX Error, Timeout and Aborted outcomes are failures', () => {
  const xml = '<TestRun><Results>'
    + '<UnitTestResult testName="A.Err" outcome="Error"/>'
    + '<UnitTestResult testName="A.Slow" outcome="Timeout"/>'
    + '<UnitTestResult testName="A.Cut" outcome="Aborted"/>'
    + '<UnitTestResult testName="A.Ok" outcome="Passed"/>'
    + '</Results></TestRun>';
  assert.deepEqual(failingFromTrx(xml).sort(), ['A.Cut', 'A.Err', 'A.Slow']);
});

test('an aborted TRX run or unexecuted tests is INCOMPLETE, not a green', () => {
  const aborted = '<TestRun><ResultSummary outcome="Aborted"><Counters total="3" executed="3" passed="3"/></ResultSummary><Results><UnitTestResult testName="A.B" outcome="Passed"/></Results></TestRun>';
  let dir = dirWith('run.trx', aborted);
  let r = judge(dir, baseline);
  assert.equal(r.status, 'INCOMPLETE');
  assert.ok(r.reasons.some((x) => /Aborted/.test(x)), r.reasons.join('; '));
  rmSync(dir, { recursive: true, force: true });
  const short = '<TestRun><ResultSummary outcome="Completed"><Counters total="5" executed="2" passed="2"/></ResultSummary><Results><UnitTestResult testName="A.B" outcome="Passed"/></Results></TestRun>';
  dir = dirWith('run.trx', short);
  r = judge(dir, baseline);
  assert.equal(r.status, 'INCOMPLETE');
  assert.ok(r.reasons.some((x) => /2 of 5/.test(x)), r.reasons.join('; '));
  rmSync(dir, { recursive: true, force: true });
});

test('a JUnit suite-level error with no failing testcase is INCOMPLETE', () => {
  const dir = dirWith('junit.xml', '<testsuites><testsuite name="s" tests="1" errors="1" failures="0"><testcase classname="a" name="b"/></testsuite></testsuites>');
  const r = judge(dir, baseline);
  assert.equal(r.status, 'INCOMPLETE');
  assert.ok(r.reasons.some((x) => /suite-level/.test(x)), r.reasons.join('; '));
  rmSync(dir, { recursive: true, force: true });
});
