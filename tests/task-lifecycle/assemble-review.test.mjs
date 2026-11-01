// Tests for skills/task-review/scripts/assemble-review.mjs: one verdict from the review
// findings and the QA gate, and the TASK-REVIEW.md that carries it.
// Run: node --test tests/task-lifecycle/assemble-review.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync, symlinkSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { assemble } from '../../skills/task-review/scripts/assemble-review.mjs';
import { loadRun, judgeRun, renderReviewSection } from '../../skills/vulnerability-hunt/scripts/hunt-verdict.mjs';
import { makeRun, confirmed, needsValidation, cveRow, secretRow, lane } from '../vulnerability-hunt/fixtures.mjs';

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

const runNoQa = (findings, qaConfigured) => assemble({ id: '501', findings: { repos: findings }, qaText: null, qaConfigured, now: NOW });

test('a missing QA report in a project whose qa is not configured gives the verdict from the code review and the hunt', () => {
  const r = runNoQa([repoBlock('api')], false);
  assert.equal(r.verdict, 'PASS');
  assert.match(r.markdown, /^Verdict: PASS — /m);
  assert.match(r.markdown, /QA: not configured for this project/);
});

test('with qa not configured, Important findings still give PASS-WITH-ISSUES and a Critical finding still FAILs', () => {
  assert.equal(runNoQa([repoBlock('api', [finding('Important', 'Gap')])], false).verdict, 'PASS-WITH-ISSUES');
  assert.equal(runNoQa([repoBlock('api', [finding('Critical', 'Broken')])], false).verdict, 'FAIL');
});

test('a missing QA report with qa configured stays BLOCKED', () => {
  assert.equal(runNoQa([repoBlock('api')], true).verdict, 'BLOCKED');
  assert.equal(runNoQa([repoBlock('api')], undefined).verdict, 'BLOCKED');
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

// The vulnerability hunt: the run folder reviews/<ID>/run-<N>/, read through hunt-verdict.mjs (loadRun, judgeRun,
// renderReviewSection). The records come from makeRun, the hunt's own fixtures.
function huntRuns(list, id = '501') {
  const root = mkdtempSync(join(tmpdir(), 'assemble-run-'));
  try {
    for (const options of list) makeRun(root, id, options);
    return loadRun(root, id);
  } finally { rmSync(root, { recursive: true, force: true }); }
}
const huntRun = (repos, options = {}) => huntRuns([{ repos, ...options }]);
const api = (findings, extra = {}) => ({ repo: 'api', findings, ...extra });
const runHunt = (hunted, { findings = [repoBlock('api')], qaText = qa('Verdict: PASS — ok.'), reportText = null, qaConfigured = true } = {}) =>
  assemble({ id: '501', findings: { repos: findings }, qaText, run: hunted, reportText, qaConfigured, now: NOW });
const incompleteRun = () => huntRun([api([], { metadata: { run_status: 'incomplete', incomplete_reason: 'the agent ran out of budget' } })]);

test('a run with a confirmed high fails the review', () => {
  const r = runHunt(huntRun([api([confirmed({ severity: 'high', title: 'Missing ownership check' })])]));
  assert.equal(r.verdict, 'FAIL');
  assert.equal(r.security.verdict, 'FAIL');
  assert.match(r.markdown, /^Verdict: FAIL — 1 confirmed critical or high finding \(first: Missing ownership check\)\./m);
  assert.match(r.markdown, /security: FAIL \(1 confirmed critical or high, 0 confirmed medium, 0 needs_validation, 0 committed credentials; 0 CVEs, 0 critical or high in a runtime dependency\)/);
  assert.match(r.markdown, /^#### Confirmed findings$/m);
  assert.match(r.markdown, /^##### high$/m);
  assert.match(r.markdown, /1\. \*\*Missing ownership check\*\*/);
});

test('a needs_validation record gives PASS-WITH-ISSUES and appears in the needs-validation table', () => {
  const r = runHunt(huntRun([api([needsValidation({ title: 'Unchecked parsed size' })])]));
  assert.equal(r.verdict, 'PASS-WITH-ISSUES');
  assert.match(r.markdown, /^Verdict: PASS-WITH-ISSUES — 1 needs_validation record\./m);
  assert.match(r.markdown, /security: PASS-WITH-ISSUES \(0 confirmed critical or high, 0 confirmed medium, 1 needs_validation, 0 committed credentials; 0 CVEs/);
  assert.match(r.markdown, /^#### Needs validation\n\n\| Title \| Trace \| Blockers \| Validation plan \|\n\|---\|---\|---\|---\|\n\| Unchecked parsed size \|/m);
});

test('a hunt INCOMPLETE makes the review BLOCKED with "the vulnerability hunt ended INCOMPLETE (" in the sentence, also with qa not configured', () => {
  const hunted = incompleteRun();
  assert.equal(judgeRun(hunted).verdict, 'INCOMPLETE');
  for (const qaConfigured of [true, false]) {
    const r = runHunt(hunted, { qaConfigured, qaText: qaConfigured ? qa('Verdict: PASS — ok.') : null });
    assert.equal(r.verdict, 'BLOCKED', `qaConfigured ${qaConfigured}`);
    assert.match(r.sentence, /the vulnerability hunt ended INCOMPLETE \(run_status incomplete in api: the agent ran out of budget\)/);
    assert.match(r.markdown, /^Verdict: BLOCKED — .*the vulnerability hunt ended INCOMPLETE \(/m);
    assert.match(r.markdown, /security: INCOMPLETE/);
    assert.doesNotMatch(r.sentence, /QA gate ended/);
  }
  // Both causes are named when the QA gate is blocked too.
  const both = runHunt(hunted, { qaText: qa('Verdict: INCOMPLETE — ran out of context.') });
  assert.equal(both.verdict, 'BLOCKED');
  assert.match(both.sentence, /the QA gate ended INCOMPLETE/);
  assert.match(both.sentence, /the vulnerability hunt ended INCOMPLETE \(/);
  // Important findings do not turn a BLOCKED into PASS-WITH-ISSUES, and a FAIL still outranks it.
  assert.equal(runHunt(hunted, { findings: [repoBlock('api', [finding('Important', 'Gap')])] }).verdict, 'BLOCKED');
  assert.equal(runHunt(hunted, { findings: [repoBlock('api', [finding('Critical', 'Broken')])] }).verdict, 'FAIL');
});

test('a committed credential fails the review', () => {
  const r = runHunt(huntRun([api([], { toolLanes: [lane('dependencies'), lane('secrets', { secrets: [secretRow({ file: 'config/prod.env', line: 3 })] })] })]));
  assert.equal(r.verdict, 'FAIL');
  assert.match(r.markdown, /^Verdict: FAIL — 1 committed credential \(first: config\/prod\.env:3\)\./m);
  assert.match(r.markdown, /security: FAIL \(0 confirmed critical or high, 0 confirmed medium, 0 needs_validation, 1 committed credentials; 0 CVEs/);
  assert.match(r.markdown, /^#### Committed secrets\n\n\| File \| Line \| Rule \| Kind \| Commit \| Source \|/m);
});

test('a critical CVE in a runtime dependency fails the review and counts in the Summary', () => {
  const r = runHunt(huntRun([api([], { toolLanes: [lane('dependencies', { cves: [cveRow({ severity: 'critical', runtime: true })] })] })]));
  assert.equal(r.verdict, 'FAIL');
  assert.match(r.markdown, /security: FAIL \(0 confirmed critical or high, 0 confirmed medium, 0 needs_validation, 0 committed credentials; 1 CVEs, 1 critical or high in a runtime dependency\)/);
  assert.match(r.markdown, /\| left-pad \| 1\.0\.0 \| GHSA-aaaa-bbbb-cccc \| critical \| 1\.0\.1 \| runtime \|/);
});

test('a confirmed medium gives PASS-WITH-ISSUES; a clean complete run gives PASS', () => {
  const medium = runHunt(huntRun([api([confirmed({ severity: 'medium', title: 'Open redirect' })])]));
  assert.equal(medium.verdict, 'PASS-WITH-ISSUES');
  assert.match(medium.markdown, /security: PASS-WITH-ISSUES \(0 confirmed critical or high, 1 confirmed medium,/);
  const clean = runHunt(huntRun([api([])]));
  assert.equal(clean.verdict, 'PASS');
  assert.equal(clean.security.verdict, 'PASS');
  assert.match(clean.markdown, /security: PASS \(0 confirmed critical or high,/);
});

test('the section is renderReviewSection: the report verdict quoted, the disagreement note when they differ', () => {
  const hunted = huntRun([api([confirmed({ severity: 'medium', title: 'Open redirect' })])]);
  const judgement = judgeRun(hunted);
  const agreeLine = 'Verdict: PASS-WITH-ISSUES — 1 confirmed medium finding.';
  const agree = runHunt(hunted, { reportText: `# Security report — 501\n${agreeLine}\n\nbody\n` });
  assert.ok(agree.markdown.includes(renderReviewSection(hunted, judgement, agreeLine).join('\n')), 'the section is the one renderReviewSection returns');
  assert.match(agree.markdown, /> Verdict: PASS-WITH-ISSUES — 1 confirmed medium finding\./);
  assert.doesNotMatch(agree.markdown, /disagree/i);
  const differLine = 'Verdict: PASS — nothing found.';
  const differ = runHunt(hunted, { reportText: `# Security report — 501\n${differLine}\n` });
  assert.ok(differ.markdown.includes(renderReviewSection(hunted, judgement, differLine).join('\n')));
  assert.match(differ.markdown, /> Verdict: PASS — nothing found\./);
  assert.match(differ.markdown, /disagree/i);
  assert.equal(differ.verdict, 'PASS-WITH-ISSUES', 'the run records decide, not the report line');
  const unquoted = runHunt(hunted);
  assert.ok(unquoted.markdown.includes(renderReviewSection(hunted, judgement, null).join('\n')));
  assert.match(unquoted.markdown, /SECURITY-REPORT\.md was not found or has no verdict line/);
});

test('no hunt at all leaves the verdict unchanged and says there was no vulnerability hunt', () => {
  const without = run([repoBlock('api', [finding('Important', 'Gap')])], qa('Verdict: PASS — ok.'));
  assert.equal(without.verdict, 'PASS-WITH-ISSUES');
  assert.match(without.markdown, /## Vulnerability hunt and audit\n\n> No vulnerability hunt/);
  assert.match(without.markdown, /security: no vulnerability hunt/);
  assert.equal(without.security, null);
  assert.equal(run([repoBlock('api')], qa('Verdict: PASS — ok.')).verdict, 'PASS');
  assert.equal(run([repoBlock('api')], null).verdict, 'BLOCKED', 'the QA rule stays as it is');
});

test('run-2 is read over run-1', () => {
  const failing = { repos: [api([confirmed({ severity: 'high', title: 'Old hole' })])] };
  const clean = { repos: [api([])] };
  const later = runHunt(huntRuns([{ n: 1, ...failing }, { n: 2, ...clean }]));
  assert.equal(later.verdict, 'PASS', 'run-2 is clean');
  assert.doesNotMatch(later.markdown, /Old hole/);
  assert.match(later.markdown, /run-2\/api\/REPORT\.md/);
  const earlier = runHunt(huntRuns([{ n: 2, ...failing }, { n: 1, ...clean }]));
  assert.equal(earlier.verdict, 'FAIL', 'run-2 holds the finding, whatever order the folders were made in');
  assert.match(earlier.markdown, /Old hole/);
});

test('a hunt that records a problem is INCOMPLETE and blocks; the problem is named', () => {
  const hunted = huntRun([api([], { ledger: null })]);
  const r = runHunt(hunted);
  assert.equal(r.verdict, 'BLOCKED');
  assert.match(r.sentence, /the vulnerability hunt ended INCOMPLETE \(.*coverage-ledger\.json/);
});

test('every heading of the template appears in a full report', () => {
  const headings = readFileSync(TEMPLATE, 'utf8').split('\n').filter((l) => /^#{1,5} /.test(l) && !l.includes('<'));
  assert.ok(headings.includes('## Vulnerability hunt and audit') && headings.includes('#### Confirmed findings') && headings.includes('##### critical'), 'the template follows renderReviewSection');
  const hunted = huntRun([api([confirmed({ severity: 'high', title: 'h' }), needsValidation({ title: 'n' })], { toolLanes: [lane('dependencies', { cves: [cveRow({ severity: 'low' })] })] })]);
  const r = runHunt(hunted, { findings: [repoBlock('api', [finding('Critical', 'a'), finding('Important', 'b'), finding('Minor', 'c')])], qaText: qa('Verdict: PASS — ok.', '![s](artifacts/s.png)') });
  for (const h of headings) assert.ok(r.markdown.includes(h + '\n'), `missing heading: ${h}`);
});

test('the template carries no word of the removed hunt records', () => {
  const text = readFileSync(TEMPLATE, 'utf8');
  for (const word of ['plausible', 'attackPath', '"discarded"', 'verifications', 'Discarded leads', 'High | Medium | Low', 'never blocks', 'security-findings.json']) {
    assert.ok(!text.includes(word), `the template still says ${word}`);
  }
});

test('the date is UTC and the header names the QA report', () => {
  const r = run([repoBlock('api')], qa('Verdict: PASS — ok.'));
  assert.match(r.markdown, /2026-10-10 12:00/);
  assert.match(r.markdown, /\[QA-REPORT\.md\]\(QA-REPORT\.md\)/);
});

function project() {
  const root = mkdtempSync(join(tmpdir(), 'assemble-review-'));
  mkdirSync(join(root, '.agents'), { recursive: true });
  writeFileSync(join(root, '.agents', 'ultrapowers.json'), JSON.stringify({ name: 'fx', repos: [], qa: { urls: { frontend: 'http://localhost:3000' } } }));
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

test('the CLI reads the hunt from the latest run folder and quotes SECURITY-REPORT.md', () => {
  const root = project();
  try {
    writeFileSync(join(root, 'reviews', '501', 'review-findings.json'), JSON.stringify({ repos: [repoBlock('api')] }));
    writeFileSync(join(root, 'reviews', '501', 'QA-REPORT.md'), qa('Verdict: PASS — ok.'));
    let out = cli(root, ['501', '--findings', 'reviews/501/review-findings.json']);
    assert.equal(out.status, 0, out.stderr);
    assert.match(out.stdout, /Verdict: PASS —/, 'no run folder: the verdict is unchanged');
    assert.match(readFileSync(join(root, 'reviews', '501', 'TASK-REVIEW.md'), 'utf8'), /No vulnerability hunt/);

    makeRun(root, '501', { repos: [api([confirmed({ severity: 'critical', title: 'Owner check missing' })])] });
    out = cli(root, ['501', '--findings', 'reviews/501/review-findings.json']);
    assert.equal(out.status, 0, out.stderr);
    assert.match(out.stdout, /Verdict: FAIL — 1 confirmed critical or high finding/, 'the run folder is read');

    writeFileSync(join(root, 'reviews', '501', 'SECURITY-REPORT.md'), '# Security report — 501\nVerdict: FAIL — 1 confirmed critical or high finding (first: Owner check missing).\n');
    out = cli(root, ['501', '--findings', 'reviews/501/review-findings.json']);
    assert.equal(out.status, 0, out.stderr);
    const text = readFileSync(join(root, 'reviews', '501', 'TASK-REVIEW.md'), 'utf8');
    assert.match(text, /> Verdict: FAIL — 1 confirmed critical or high finding \(first: Owner check missing\)\./, 'the front page is quoted');
    assert.doesNotMatch(text, /disagree/i);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('an old reviews/<ID>/security-findings.json with no run folder: exit 2 with the run-the-hunt-again message, no TASK-REVIEW.md written', () => {
  const root = project();
  try {
    withFindings(root);
    writeFileSync(join(root, 'reviews', '501', 'QA-REPORT.md'), qa('Verdict: PASS — ok.'));
    writeFileSync(join(root, 'reviews', '501', 'security-findings.json'), JSON.stringify({ repos: [] }));
    const out = cli(root, ['501', '--findings', 'reviews/501/review-findings.json']);
    assert.equal(out.status, 2, out.stdout + out.stderr);
    assert.equal(out.stderr.trim(), 'ERROR: the vulnerability hunt records are from before GH-63; run the hunt again');
    assert.equal(out.stdout, '');
    assert.ok(!existsSync(join(root, 'reviews', '501', 'TASK-REVIEW.md')), 'nothing written');
    // A run folder beside the old file wins: the old file is not read.
    makeRun(root, '501', { repos: [api([])] });
    const next = cli(root, ['501', '--findings', 'reviews/501/review-findings.json']);
    assert.equal(next.status, 0, next.stderr);
    assert.match(next.stdout, /Verdict: PASS —/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('--security is no longer a flag: the usage text does not offer it', () => {
  const root = project();
  try {
    assert.doesNotMatch(cli(root, []).stderr, /--security/);
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
    // A leading _ marks a template folder such as reviews/_template, refused whatever ticketPattern allows.
    writeFileSync(join(root, '.agents', 'ultrapowers.json'), JSON.stringify({ name: 'fx', repos: [], ticketPattern: '.*' }));
    assert.equal(cli(root, ['_template', '--findings', 'bad.json']).status, 4, 'a leading underscore marks a template folder');
    assert.equal(cli(root, ['a_b', '--findings', 'bad.json']).status, 2, 'an underscore inside the id is fine: the bad findings file stops it');
    const outside = mkdtempSync(join(tmpdir(), 'assemble-noroot-'));
    try { assert.equal(cli(outside, ['501', '--findings', 'x.json']).status, 3, 'no project root'); }
    finally { rmSync(outside, { recursive: true, force: true }); }
    assert.ok(!existsSync(join(root, 'reviews', '501', 'TASK-REVIEW.md')), 'nothing written on refusal');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

// ---- Round 3, Medium 14: the files assemble-review reads and the one it writes are regular files of the project ----

// A link to a folder (a junction on Windows) or a file; false where the machine gives no right to make one.
function linkTo(target, link, type) {
  try {
    symlinkSync(target, link, type === 'dir' && process.platform === 'win32' ? 'junction' : type);
    return true;
  } catch (error) {
    if (error.code === 'EPERM' || error.code === 'EACCES') return false;
    throw error;
  }
}

function withFindings(root) {
  writeFileSync(join(root, 'reviews', '501', 'review-findings.json'), JSON.stringify({ repos: [repoBlock('api')] }));
}

test('round3 Medium 14: a QA report or a hunt report that is a folder is refused with exit 2 and a clear error, and TASK-REVIEW.md is not written', () => {
  for (const [name, args] of [['QA-REPORT.md', []], ['QA-REPORT.md', ['--qa', 'reviews/501/QA-REPORT.md']]]) {
    const root = project();
    try {
      withFindings(root);
      mkdirSync(join(root, 'reviews', '501', name));
      const out = cli(root, ['501', '--findings', 'reviews/501/review-findings.json', ...args]);
      assert.equal(out.status, 2, `${name} ${args.join(' ')}: ${out.stdout}${out.stderr}`);
      assert.match(out.stderr, new RegExp(`ERROR: .*${name.replace('.', '\\.')}.*is not a regular file`), out.stderr);
      assert.ok(!existsSync(join(root, 'reviews', '501', 'TASK-REVIEW.md')));
    } finally { rmSync(root, { recursive: true, force: true }); }
  }
  const root = project();
  try {
    withFindings(root);
    makeRun(root, '501', { repos: [api([])] });
    mkdirSync(join(root, 'reviews', '501', 'SECURITY-REPORT.md'));
    const out = cli(root, ['501', '--findings', 'reviews/501/review-findings.json']);
    assert.equal(out.status, 2, out.stdout + out.stderr);
    assert.match(out.stderr, /SECURITY-REPORT\.md is not a regular file/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

for (const name of ['QA-REPORT.md', 'SECURITY-REPORT.md', 'review-findings.json']) {
  test(`round3 Medium 14: reviews/<ID>/${name} as a symbolic link to a secrets file: refused, nothing read into the review`, (t) => {
    const root = project();
    const outside = mkdtempSync(join(tmpdir(), 'assemble-secret-'));
    writeFileSync(join(outside, 'secrets.env'), 'Verdict: PASS — TOKEN=secret-value\n');
    try {
      withFindings(root);
      makeRun(root, '501', { repos: [api([])] });
      if (name !== 'review-findings.json') writeFileSync(join(root, 'reviews', '501', 'SECURITY-REPORT.md'), '# Security\nVerdict: PASS — ok.\n');
      rmSync(join(root, 'reviews', '501', name), { force: true });
      if (!linkTo(join(outside, 'secrets.env'), join(root, 'reviews', '501', name), 'file')) { t.skip('no right to create a file link here'); return; }
      const out = cli(root, ['501', '--findings', 'reviews/501/review-findings.json']);
      assert.equal(out.status, 2, out.stdout + out.stderr);
      assert.match(out.stderr, /symbolic link/);
      assert.ok(!existsSync(join(root, 'reviews', '501', 'TASK-REVIEW.md')));
    } finally {
      rmSync(root, { recursive: true, force: true });
      rmSync(outside, { recursive: true, force: true });
    }
  });
}

test('round3 Medium 14: TASK-REVIEW.md is written only into a real folder of the project, and never through a link at the target', (t) => {
  // reviews/<ID> linked to a folder outside the project: nothing is written there.
  const root = project();
  const outside = mkdtempSync(join(tmpdir(), 'assemble-outside-'));
  try {
    writeFileSync(join(outside, 'review-findings.json'), JSON.stringify({ repos: [repoBlock('api')] }));
    writeFileSync(join(outside, 'QA-REPORT.md'), qa('Verdict: PASS — ok.'));
    rmSync(join(root, 'reviews', '501'), { recursive: true, force: true });
    if (linkTo(outside, join(root, 'reviews', '501'), 'dir')) {
      const out = cli(root, ['501', '--findings', 'reviews/501/review-findings.json']);
      assert.equal(out.status, 2, out.stdout + out.stderr);
      assert.match(out.stderr, /reviews\/501.*(symbolic link|resolves outside)/);
      assert.ok(!existsSync(join(outside, 'TASK-REVIEW.md')), 'nothing written through the link');
      rmSync(join(root, 'reviews', '501'), { force: true, recursive: false });
    } else t.diagnostic('no right to create a folder link here');
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  }
  // `reviews` itself linked out, with no reviews/<ID> yet: the folder is not created through it.
  const root2 = project();
  const outside2 = mkdtempSync(join(tmpdir(), 'assemble-outside-'));
  try {
    writeFileSync(join(root2, 'findings.json'), JSON.stringify({ repos: [repoBlock('api')] }));
    rmSync(join(root2, 'reviews'), { recursive: true, force: true });
    if (linkTo(outside2, join(root2, 'reviews'), 'dir')) {
      const out = cli(root2, ['501', '--findings', 'findings.json']);
      assert.equal(out.status, 2, out.stdout + out.stderr);
      assert.deepEqual(readdirSync(outside2), [], 'nothing created through the link');
      rmSync(join(root2, 'reviews'), { force: true, recursive: false });
    }
  } finally {
    rmSync(root2, { recursive: true, force: true });
    rmSync(outside2, { recursive: true, force: true });
  }
  // TASK-REVIEW.md itself a folder or a link to a file: refused, the file it points to is left as it was.
  const root3 = project();
  const outside3 = mkdtempSync(join(tmpdir(), 'assemble-outside-'));
  try {
    withFindings(root3);
    mkdirSync(join(root3, 'reviews', '501', 'TASK-REVIEW.md'));
    let out = cli(root3, ['501', '--findings', 'reviews/501/review-findings.json']);
    assert.equal(out.status, 2, out.stdout + out.stderr);
    assert.match(out.stderr, /TASK-REVIEW\.md is not a regular file/);
    rmSync(join(root3, 'reviews', '501', 'TASK-REVIEW.md'), { recursive: true, force: true });
    writeFileSync(join(outside3, 'ci.yml'), 'original\n');
    if (linkTo(join(outside3, 'ci.yml'), join(root3, 'reviews', '501', 'TASK-REVIEW.md'), 'file')) {
      out = cli(root3, ['501', '--findings', 'reviews/501/review-findings.json']);
      assert.equal(out.status, 2, out.stdout + out.stderr);
      assert.equal(readFileSync(join(outside3, 'ci.yml'), 'utf8'), 'original\n', 'the link target is not overwritten');
    }
  } finally {
    rmSync(root3, { recursive: true, force: true });
    rmSync(outside3, { recursive: true, force: true });
  }
});

test('round3 Medium 14: a plain project still assembles: regular files, a real folder', () => {
  const root = project();
  try {
    withFindings(root);
    writeFileSync(join(root, 'reviews', '501', 'QA-REPORT.md'), qa('Verdict: PASS — ok.'));
    const out = cli(root, ['501', '--findings', 'reviews/501/review-findings.json']);
    assert.equal(out.status, 0, out.stderr);
    assert.match(readFileSync(join(root, 'reviews', '501', 'TASK-REVIEW.md'), 'utf8'), /^Verdict: PASS — /m);
    // A second run over the report it wrote replaces it.
    assert.equal(cli(root, ['501', '--findings', 'reviews/501/review-findings.json']).status, 0);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
