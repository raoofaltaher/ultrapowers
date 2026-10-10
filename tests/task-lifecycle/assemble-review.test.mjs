// Tests for skills/task-review/scripts/assemble-review.mjs: one verdict from the review
// findings and the QA gate, and the TASK-REVIEW.md that carries it.
// Run: node --test tests/task-lifecycle/assemble-review.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { assemble } from '../../skills/task-review/scripts/assemble-review.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(HERE, '../../skills/task-review/scripts/assemble-review.mjs');
const TEMPLATE = join(HERE, '../../skills/task-review/templates/TASK-REVIEW.md');
const NOW = new Date('2026-10-10T12:00:00Z');

const finding = (severity, title, extra = {}) => ({
  severity, title, file: 'src/cart.js', line: 3,
  problem: `${title}: the problem`, rootCause: `${title}: the root cause`, fix: `${title}: the fix`, ...extra,
});
const repoBlock = (name, findings = [], extra = {}) => ({
  repo: name, base: 'main', branch: 'feature/501-x', head: 'abc1234', findings,
  tdd: { verdict: 'pass', notes: `${name}: tests first` }, strengths: [`${name}: clear`], declined: [], ...extra,
});
const qa = (verdictLine, body = '') => `# QA report — 501\n\n| Ticket | 501 |\n|---|---|\n\n${verdictLine}\n\n## Findings\n\n${body}\n`;
const run = (findings, qaText, id = '501') => assemble({ id, findings: { repos: findings }, qaText, now: NOW });

test('a Critical finding fails the review even when the QA gate passes', () => {
  const r = run([repoBlock('api', [finding('Critical', 'Caller not updated')])], qa('Verdict: PASS — all flows passed.'));
  assert.equal(r.verdict, 'FAIL');
  assert.match(r.markdown, /^Verdict: FAIL — /m);
  assert.match(r.markdown, /Caller not updated/);
  assert.match(r.markdown, /Caller not updated: the root cause/);
});

test('a QA FAIL fails the review with no findings at all', () => {
  const r = run([repoBlock('api')], qa('Verdict: FAIL — the cart total is wrong.'));
  assert.equal(r.verdict, 'FAIL');
});

test('QA PRECONDITION-FAILED is BLOCKED, the findings still appear, and the precondition text is kept', () => {
  const r = run(
    [repoBlock('api', [finding('Important', 'Test written after the code')])],
    qa('Verdict: PRECONDITION-FAILED — the frontend at http://localhost:3000 did not answer.'),
  );
  assert.equal(r.verdict, 'BLOCKED');
  assert.match(r.markdown, /^Verdict: BLOCKED — /m);
  assert.match(r.markdown, /Test written after the code/);
  assert.match(r.markdown, /> Verdict: PRECONDITION-FAILED — the frontend at http:\/\/localhost:3000 did not answer\./);
});

test('QA INCOMPLETE is BLOCKED', () => {
  assert.equal(run([repoBlock('api')], qa('Verdict: INCOMPLETE — ran out of context.')).verdict, 'BLOCKED');
});

test('a missing QA report is BLOCKED, never a pass', () => {
  const r = run([repoBlock('api')], null);
  assert.equal(r.verdict, 'BLOCKED');
  assert.match(r.markdown, /no QA report/i);
});

test('a QA report with no recognisable verdict line is BLOCKED', () => {
  assert.equal(run([repoBlock('api')], '# QA report\n\nlooks fine\n').verdict, 'BLOCKED');
});

test('Important findings give PASS-WITH-ISSUES; Minor findings alone give PASS', () => {
  assert.equal(run([repoBlock('api', [finding('Important', 'Gap')])], qa('Verdict: PASS — ok.')).verdict, 'PASS-WITH-ISSUES');
  assert.equal(run([repoBlock('api', [finding('Minor', 'Nit')])], qa('Verdict: PASS — ok.')).verdict, 'PASS');
  assert.equal(run([repoBlock('api')], qa('Verdict: PASS — ok.')).verdict, 'PASS');
});

test('a QA PASS-WITH-ISSUES gives PASS-WITH-ISSUES with no findings', () => {
  assert.equal(run([repoBlock('api')], qa('Verdict: PASS-WITH-ISSUES — one medium finding.')).verdict, 'PASS-WITH-ISSUES');
});

test('severity words are matched without regard to case; an unknown severity is refused', () => {
  assert.equal(run([repoBlock('api', [finding('critical', 'x')])], qa('Verdict: PASS — ok.')).verdict, 'FAIL');
  assert.throws(() => run([repoBlock('api', [finding('Severe', 'x')])], qa('Verdict: PASS — ok.')), /severity/i);
});

test('exactly one line of the report starts with Verdict:', () => {
  const r = run([repoBlock('api', [finding('Minor', 'Nit')])], qa('Verdict: PASS — ok.'));
  assert.equal(r.markdown.split('\n').filter((l) => l.startsWith('Verdict:')).length, 1);
});

test('three screenshots in the QA report are three embeds in the review', () => {
  const body = [
    '![cart as admin](artifacts/cart-admin-en-total.png)',
    '![cart as clerk, with a space](artifacts/cart clerk fr.png)',
    '![é non-ascii](artifacts/café-total.png)',
    'a plain link [log](artifacts/log-api.txt) is not an embed',
  ].join('\n\n');
  const r = run([repoBlock('api')], qa('Verdict: PASS — ok.', body));
  const qaSection = r.markdown.slice(r.markdown.indexOf('## QA gate'));
  const embeds = qaSection.match(/^!\[[^\]]*\]\(artifacts\/[^)]*\)$/gm) || [];
  assert.equal(embeds.length, 3);
  assert.ok(embeds.includes('![cart as clerk, with a space](artifacts/cart clerk fr.png)'));
  assert.ok(embeds.includes('![é non-ascii](artifacts/café-total.png)'));
});

test('a QA report with no screenshots has no embeds', () => {
  const r = run([repoBlock('api')], qa('Verdict: PASS — ok.', 'No findings.'));
  assert.equal((r.markdown.match(/^!\[/gm) || []).length, 0);
});

test('two repositories each get a section, a TDD assessment and findings by severity', () => {
  const r = run(
    [
      repoBlock('api', [finding('Minor', 'Api nit'), finding('Critical', 'Api break')], { base: 'main' }),
      repoBlock('web', [finding('Important', 'Web gap')], { base: 'develop', tdd: { verdict: 'partial', notes: 'web: test after code' } }),
    ],
    qa('Verdict: PASS — ok.'),
  );
  assert.match(r.markdown, /### api \(feature\/501-x against main\)/);
  assert.match(r.markdown, /### web \(feature\/501-x against develop\)/);
  assert.match(r.markdown, /partial — web: test after code/);
  assert.ok(r.markdown.indexOf('Api break') < r.markdown.indexOf('Api nit'), 'Critical before Minor within a repository');
});

test('every heading of the template appears in a full report', () => {
  const headings = readFileSync(TEMPLATE, 'utf8').split('\n').filter((l) => /^#{1,4} /.test(l) && !l.includes('<'));
  const r = run([repoBlock('api', [finding('Critical', 'a'), finding('Important', 'b'), finding('Minor', 'c')])], qa('Verdict: PASS — ok.', '![s](artifacts/s.png)'));
  for (const h of headings) assert.ok(r.markdown.includes(h + '\n'), `missing heading: ${h}`);
});

test('the date is UTC and the header names the QA report', () => {
  const r = run([repoBlock('api')], qa('Verdict: PASS — ok.'));
  assert.match(r.markdown, /2026-10-10 12:00/);
  assert.match(r.markdown, /\[QA-REPORT\.md\]\(QA-REPORT\.md\)/);
});

function project() {
  const root = mkdtempSync(join(tmpdir(), 'assemble-review-'));
  mkdirSync(join(root, '.agents'), { recursive: true });
  writeFileSync(join(root, '.agents', 'ultrapowers.json'), JSON.stringify({ name: 'fx', repos: [] }));
  mkdirSync(join(root, 'reviews', '501'), { recursive: true });
  return root;
}
const cli = (root, args) => spawnSync(process.execPath, [SCRIPT, ...args], { cwd: root, encoding: 'utf8' });

test('the CLI writes reviews/<ID>/TASK-REVIEW.md and prints the verdict', () => {
  const root = project();
  try {
    writeFileSync(join(root, 'reviews', '501', 'review-findings.json'), JSON.stringify({ repos: [repoBlock('api', [finding('Important', 'Gap')])] }));
    writeFileSync(join(root, 'reviews', '501', 'QA-REPORT.md'), qa('Verdict: PASS — ok.'));
    const out = cli(root, ['501', '--findings', 'reviews/501/review-findings.json', '--qa', 'reviews/501/QA-REPORT.md']);
    assert.equal(out.status, 0, out.stderr);
    assert.match(out.stdout, /Verdict: PASS-WITH-ISSUES/);
    assert.match(readFileSync(join(root, 'reviews', '501', 'TASK-REVIEW.md'), 'utf8'), /^Verdict: PASS-WITH-ISSUES — /m);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('the CLI treats a QA report that does not exist as a blocked gate', () => {
  const root = project();
  try {
    writeFileSync(join(root, 'reviews', '501', 'review-findings.json'), JSON.stringify({ repos: [repoBlock('api', [finding('Minor', 'Nit')])] }));
    const out = cli(root, ['501', '--findings', 'reviews/501/review-findings.json', '--qa', 'reviews/501/QA-REPORT.md']);
    assert.equal(out.status, 0, out.stderr);
    assert.match(readFileSync(join(root, 'reviews', '501', 'TASK-REVIEW.md'), 'utf8'), /^Verdict: BLOCKED — /m);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('the CLI refuses bad input with the documented exit codes', () => {
  const root = project();
  try {
    assert.equal(cli(root, []).status, 2, 'no ticket');
    assert.equal(cli(root, ['501']).status, 2, 'no findings file');
    assert.equal(cli(root, ['501', '--findings', 'nope.json']).status, 2, 'findings file missing');
    writeFileSync(join(root, 'bad.json'), '{ not json');
    assert.equal(cli(root, ['501', '--findings', 'bad.json']).status, 2, 'findings not JSON');
    assert.equal(cli(root, ['../x', '--findings', 'bad.json']).status, 4, 'ticket names a path');
    const outside = mkdtempSync(join(tmpdir(), 'assemble-noroot-'));
    try { assert.equal(cli(outside, ['501', '--findings', 'x.json']).status, 3, 'no project root'); }
    finally { rmSync(outside, { recursive: true, force: true }); }
    assert.ok(!existsSync(join(root, 'reviews', '501', 'TASK-REVIEW.md')), 'nothing written on refusal');
  } finally { rmSync(root, { recursive: true, force: true }); }
});
