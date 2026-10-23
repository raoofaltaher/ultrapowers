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
import { assemble, decideSecurity } from '../../skills/task-review/scripts/assemble-review.mjs';

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

// The vulnerability hunt (Step 3b): reviews/<ID>/security-findings.json, as vulnerability-hunter writes it.
const vuln = (severity, title, extra = {}) => ({
  severity, confidence: 9, category: 'command_injection', title, file: 'src/export.js', line: 11,
  description: `${title}: description`, attackPath: `${title}: attack path`, exploit: `${title}: exploit`,
  mitigationExamined: `${title}: mitigation`, fix: `${title}: fix`, ...extra,
});
const cve = (severity, runtime, extra = {}) => ({
  package: 'lodash', version: '4.17.15', advisory: 'GHSA-35jh-r3h4-6jhm', severity, fixedIn: '4.17.21', runtime,
  proof: runtime ? "src/export.js:2 require('lodash')" : 'required only by tests/report.test.js', ...extra,
});
// One lane block, as the hunter returns it.
const hunt = (repo, lane, extra = {}) => ({
  repo, lane, status: 'ok', tools: [], findings: [], cves: [], discarded: [], declined: [], skipped: '', filesRead: [], ...extra,
});
const npmAudit = { name: 'npm audit', version: '10.8.2', command: 'npm audit --json', exit: 1, output: '{}' };
const verify = (title, verdict) => ({ title, verdict, confidence: 8, reason: `${title}: read the code, ${verdict}` });
const sec = (hunts, verifications = [], repo = 'api') => ({ repos: [{ repo, hunts, verifications }] });
const runSec = (securityFindings, findings = [repoBlock('api')], qaText = qa('Verdict: PASS — ok.'), securityText = null) =>
  assemble({ id: '501', findings: { repos: findings }, qaText, securityFindings, securityText, now: NOW });

test('a confirmed High finding fails the review even when the code review and QA pass', () => {
  const r = runSec(sec([hunt('api', 'code', { findings: [vuln('High', 'Shell command built from req.query.name')] })], [verify('Shell command built from req.query.name', 'confirmed')]));
  assert.equal(r.verdict, 'FAIL');
  assert.match(r.markdown, /^Verdict: FAIL — .*High security finding.*Shell command built from req\.query\.name/m);
  assert.match(r.markdown, /security: FAIL/);
});

test('a plausible High finding keeps its severity, fails the review and is marked plausible', () => {
  const r = runSec(sec([hunt('api', 'code', { findings: [vuln('High', 'Exec sink')] })], [verify('Exec sink', 'plausible')]));
  assert.equal(r.verdict, 'FAIL');
  assert.match(r.markdown, /\*\*Exec sink\*\* `src\/export\.js:11` \(confidence 9, plausible; command_injection\)/);
});

test('a Medium finding gives PASS-WITH-ISSUES', () => {
  const r = runSec(sec([hunt('api', 'secrets-supply-chain', { findings: [vuln('Medium', 'Token in a constant')] })], [verify('Token in a constant', 'confirmed')]));
  assert.equal(r.verdict, 'PASS-WITH-ISSUES');
  assert.match(r.markdown, /^Verdict: PASS-WITH-ISSUES — .*Medium security finding/m);
  assert.match(r.markdown, /security: PASS-WITH-ISSUES/);
});

test('a critical CVE in a runtime dependency fails the review', () => {
  const r = runSec(sec([hunt('api', 'dependencies', { cves: [cve('critical', true)] })]));
  assert.equal(r.verdict, 'FAIL');
  assert.match(r.markdown, /^Verdict: FAIL — .*lodash 4\.17\.15/m);
});

test('a high CVE in a runtime dependency fails; a moderate one gives PASS-WITH-ISSUES', () => {
  assert.equal(runSec(sec([hunt('api', 'dependencies', { cves: [cve('high', true)] })])).verdict, 'FAIL');
  assert.equal(runSec(sec([hunt('api', 'dependencies', { cves: [cve('moderate', true)] })])).verdict, 'PASS-WITH-ISSUES');
});

test('a critical CVE in a test-only dependency gives PASS-WITH-ISSUES, not FAIL', () => {
  const r = runSec(sec([hunt('api', 'dependencies', { cves: [cve('critical', false)] })]));
  assert.equal(r.verdict, 'PASS-WITH-ISSUES');
  assert.match(r.markdown, /\| lodash \| 4\.17\.15 \| GHSA-35jh-r3h4-6jhm \| critical \| 4\.17\.21 \| test only \|/);
});

test('a low CVE, a Low finding and a moderate test-only CVE never change the verdict', () => {
  const r = runSec(sec([
    hunt('api', 'code', { findings: [vuln('Low', 'Verbose error message')] }),
    hunt('api', 'dependencies', { cves: [cve('low', true), cve('moderate', false, { package: 'mocha', version: '9.0.0' })] }),
  ]));
  assert.equal(r.verdict, 'PASS');
});

test('a rejected High finding has no effect on the verdict and leaves the report', () => {
  const r = runSec(sec([hunt('api', 'code', { findings: [vuln('High', 'Path traversal in the report name')] })], [verify('Path traversal in the report name', 'rejected')]));
  assert.equal(r.verdict, 'PASS');
  assert.doesNotMatch(r.markdown, /Path traversal in the report name/);
  assert.match(r.markdown, /rejected by verification: 1/);
  assert.match(r.markdown, /0 High, 0 Medium and 0 Low findings/);
});

test('a finding below confidence 6 is a discarded lead, not a finding', () => {
  const r = runSec(sec([hunt('api', 'code', { findings: [vuln('High', 'Weak lead', { confidence: 5 })], discarded: ['an older lead'] })]));
  assert.equal(r.verdict, 'PASS');
  assert.doesNotMatch(r.markdown, /Weak lead/);
  assert.match(r.markdown, /#### Discarded leads\n\n2 leads below confidence 6/);
});

test('a finding with a missing or non-numeric confidence is an error, never a discarded lead', () => {
  const missing = vuln('High', 'No confidence');
  delete missing.confidence;
  assert.throws(() => runSec(sec([hunt('api', 'code', { findings: [missing] })])), /finding "No confidence" has no numeric confidence/);
  for (const bad of [null, '', '  ', '\t', 'high', true, NaN]) {
    assert.throws(() => runSec(sec([hunt('api', 'code', { findings: [vuln('Medium', 'Bad confidence', { confidence: bad })] })])), /no numeric confidence/, `confidence ${String(bad)}`);
  }
  assert.throws(() => decideSecurity(sec([hunt('api', 'code', { findings: [missing] })]).repos), /no numeric confidence/);
  assert.equal(runSec(sec([hunt('api', 'code', { findings: [vuln('High', 'Numeric string', { confidence: '9' })] })])).verdict, 'FAIL', 'a numeric string is a number');
});

test('a CVE listed by two lanes with runtime true then false stays runtime and fails the review', () => {
  for (const order of [[true, false], [false, true]]) {
    const r = runSec(sec(order.map((runtime, i) => hunt('api', i === 0 ? 'dependencies' : 'code', { cves: [cve('critical', runtime)] }))));
    assert.equal(r.security.verdict, 'FAIL', `runtime order ${order}`);
    assert.equal(r.verdict, 'FAIL');
    assert.equal(r.markdown.match(/\| lodash \|/g).length, 1);
    assert.match(r.markdown, /\| critical \| 4\.17\.21 \| runtime \|/);
  }
});

test('a dependencies lane with status incomplete that recorded a CVE is not INCOMPLETE', () => {
  assert.equal(runSec(sec([hunt('api', 'dependencies', { status: 'incomplete', cves: [cve('low', true)] })])).security.verdict, 'PASS');
  assert.equal(runSec(sec([hunt('api', 'dependencies', { status: 'incomplete', cves: [cve('moderate', true)] })])).security.verdict, 'PASS-WITH-ISSUES');
});

test('a CVE critical and test-only in one lane and moderate and runtime in another is one critical runtime row', () => {
  for (const order of [0, 1]) {
    const pair = [cve('critical', false), cve('moderate', true)];
    if (order) pair.reverse();
    const r = runSec(sec(pair.map((c, i) => hunt('api', i === 0 ? 'dependencies' : 'code', { cves: [c] }))));
    assert.equal(r.security.verdict, 'FAIL', `order ${order}`);
    assert.equal(r.markdown.match(/\| lodash \|/g).length, 1);
    assert.match(r.markdown, /\| critical \| 4\.17\.21 \| runtime \|/);
  }
});

test('a CVE listed by two lanes with different severities keeps the highest, in either order', () => {
  for (const order of [['critical', 'moderate'], ['moderate', 'critical']]) {
    const cves = order.map((severity) => cve(severity, true, { fixedIn: severity === 'critical' ? '4.17.21' : '4.17.19' }));
    const r = runSec(sec(cves.map((c, i) => hunt('api', i === 0 ? 'dependencies' : 'code', { cves: [c] }))));
    assert.equal(r.security.verdict, 'FAIL', `severity order ${order}`);
    assert.equal(r.markdown.match(/\| lodash \|/g).length, 1);
    assert.match(r.markdown, /\| critical \| 4\.17\.21 \| runtime \|/);
  }
});

test('a dependencies lane with status incomplete and no CVEs is security INCOMPLETE; the review verdict is unchanged and the Summary says so', () => {
  const incomplete = sec([hunt('api', 'dependencies', { status: 'incomplete', tools: [{ ...npmAudit, exit: 1, output: 'ENOLOCK' }] })]);
  const r = runSec(incomplete);
  assert.equal(r.verdict, 'PASS', 'a security INCOMPLETE does not block');
  const summary = r.markdown.slice(r.markdown.indexOf('## Summary'), r.markdown.indexOf('## Code review'));
  assert.match(summary, /security: INCOMPLETE/);
  assert.match(r.markdown, /^Verdict: PASS — .*vulnerability hunt .*INCOMPLETE/m);
  assert.equal(r.security.verdict, 'INCOMPLETE');
  // Next to a QA gate that ended blocked, or a finding, nothing moves either.
  assert.equal(runSec(incomplete, [repoBlock('api')], null).verdict, 'BLOCKED');
  assert.equal(runSec(incomplete, [repoBlock('api', [finding('Important', 'Gap')])]).verdict, 'PASS-WITH-ISSUES');
  // A dependencies block that found nothing but finished is a pass, and one with no manifest is not a failure.
  assert.equal(runSec(sec([hunt('api', 'dependencies', { skipped: 'no manifest' })])).security.verdict, 'PASS');
});

test('a repository whose hunts hold no dependencies lane is security INCOMPLETE; the review verdict is unchanged', () => {
  const noDeps = sec([hunt('api', 'code', { findings: [vuln('Low', 'Verbose error message')] })]);
  const r = runSec(noDeps);
  assert.equal(r.security.verdict, 'INCOMPLETE');
  assert.equal(r.verdict, 'PASS', 'a security INCOMPLETE does not block');
  assert.match(r.markdown, /^Verdict: PASS — .*vulnerability hunt is INCOMPLETE .*did not run/m);
  assert.match(r.markdown, /security: INCOMPLETE/);
  assert.equal(decideSecurity({ repos: [] }.repos).verdict, 'PASS', 'no repository, nothing missing');
  assert.equal(decideSecurity(sec([]).repos).verdict, 'INCOMPLETE', 'a repository with no hunts has no dependencies block');
  assert.equal(runSec(noDeps, [repoBlock('api', [finding('Important', 'Gap')])]).verdict, 'PASS-WITH-ISSUES');
  assert.equal(runSec(sec([hunt('api', 'code', { findings: [vuln('Medium', 'Open redirect')] })])).security.verdict, 'PASS-WITH-ISSUES', 'a finding outranks INCOMPLETE');
});

test('a High finding stays FAIL when the dependencies lane is incomplete', () => {
  const r = runSec(sec([hunt('api', 'dependencies', { status: 'incomplete' }), hunt('api', 'code', { findings: [vuln('High', 'Exec sink')] })], [verify('Exec sink', 'confirmed')]));
  assert.equal(r.verdict, 'FAIL');
  assert.equal(r.security.verdict, 'FAIL');
});

test('no hunt file leaves the verdict unchanged and says there was no vulnerability hunt', () => {
  const without = run([repoBlock('api', [finding('Important', 'Gap')])], qa('Verdict: PASS — ok.'));
  assert.equal(without.verdict, 'PASS-WITH-ISSUES');
  assert.match(without.markdown, /## Vulnerability hunt and audit\n\n> No vulnerability hunt/);
  assert.match(without.markdown, /security: no vulnerability hunt/);
  assert.equal(without.security, null);
  assert.equal(run([repoBlock('api')], qa('Verdict: PASS — ok.')).verdict, 'PASS');
  assert.equal(run([repoBlock('api')], null).verdict, 'BLOCKED', 'the QA rule stays as it is');
  assert.equal(decideSecurity(null), null);
});

test('decideSecurity returns the verdict, the counts and a sentence naming the deciding item', () => {
  const s = decideSecurity(sec([
    hunt('api', 'code', { findings: [vuln('High', 'Exec sink'), vuln('Medium', 'Open redirect'), vuln('Low', 'Verbose error'), vuln('High', 'Refuted sink')] }),
    hunt('api', 'dependencies', { cves: [cve('critical', true), cve('moderate', true, { package: 'minimist', version: '1.2.0', advisory: 'GHSA-xvch-5gv4-984h' }), cve('critical', false, { package: 'mocha', version: '9.0.0', advisory: 'GHSA-test' })] }),
  ], [verify('Exec sink', 'confirmed'), verify('Open redirect', 'confirmed'), verify('Refuted sink', 'rejected')]).repos);
  assert.equal(s.verdict, 'FAIL');
  assert.deepEqual({ high: s.counts.high, medium: s.counts.medium, low: s.counts.low, cvesRuntimeCritical: s.counts.cvesRuntimeCritical, cvesRuntimeModerate: s.counts.cvesRuntimeModerate },
    { high: 1, medium: 1, low: 1, cvesRuntimeCritical: 1, cvesRuntimeModerate: 1 });
  assert.match(s.sentence, /Exec sink/);
  assert.match(s.sentence, /lodash 4\.17\.15/);
});

test('a verification matches its finding by title within the same repository only', () => {
  const two = {
    repos: [
      { repo: 'api', hunts: [hunt('api', 'code', { findings: [vuln('High', 'Exec sink')] })], verifications: [] },
      { repo: 'web', hunts: [hunt('web', 'code', { findings: [vuln('High', 'Exec sink')] })], verifications: [verify('Exec sink', 'rejected')] },
    ],
  };
  const s = decideSecurity(two.repos);
  assert.equal(s.counts.high, 1, 'the rejection in web does not clear the finding in api');
  const r = runSec(two);
  assert.match(r.markdown, /### api[\s\S]*unverified[\s\S]*### web/);
  // The match is trimmed and case-sensitive.
  assert.equal(decideSecurity(sec([hunt('api', 'code', { findings: [vuln('High', 'Exec sink')] })], [verify('  Exec sink ', 'rejected')]).repos).counts.high, 0);
  assert.equal(decideSecurity(sec([hunt('api', 'code', { findings: [vuln('High', 'Exec sink')] })], [verify('exec sink', 'rejected')]).repos).counts.high, 1);
});

test('the hunt section renders per repository: CVE table, findings by severity, skipped, discarded, files read, tools, declined', () => {
  const r = runSec(sec([
    hunt('api', 'dependencies', { tools: [npmAudit], cves: [cve('high', true)], filesRead: ['package.json', 'package-lock.json', 'src/export.js'] }),
    hunt('api', 'code', { findings: [vuln('High', 'Exec sink'), vuln('Low', 'Error text sent to the client')], discarded: ['regex built from input'], filesRead: ['src/export.js', 'src/server.js'], declined: ['src/vendor/minified.js: minified, not judged'] }),
    hunt('api', 'secrets-supply-chain', { findings: [vuln('Medium', 'Partner token in source', { category: 'hardcoded_secret', file: 'src/export.js', line: 5 }), vuln('Medium', 'curl piped to sh', { file: 'scripts/setup.sh', line: 3 })], filesRead: ['src/export.js', 'scripts/setup.sh'] }),
    hunt('api', 'ai-surface', { skipped: 'no model client library and no prompt template (searched for openai, anthropic, langchain, prompt)' }),
  ], [verify('Exec sink', 'confirmed'), verify('Partner token in source', 'confirmed'), verify('curl piped to sh', 'plausible')]));
  const md = r.markdown;
  const start = md.indexOf('## Vulnerability hunt and audit');
  assert.ok(md.indexOf('## Code review') < start && start < md.indexOf('## QA gate'), 'the section sits between Code review and QA gate');
  const section = md.slice(start, md.indexOf('## QA gate'));
  assert.match(section, /### api\n/);
  assert.match(section, /\| Package \| Version \| Advisory \| Severity \| Fixed in \| Runtime \|/);
  assert.match(section, /\| lodash \| 4\.17\.15 \| GHSA-35jh-r3h4-6jhm \| high \| 4\.17\.21 \| runtime \|/);
  assert.ok(section.indexOf('#### High') < section.indexOf('#### Medium') && section.indexOf('#### Medium') < section.indexOf('#### Low'));
  assert.match(section, /1\. \*\*Exec sink\*\* `src\/export\.js:11` \(confidence 9, confirmed; command_injection\)/);
  for (const field of ['Description: Exec sink: description', 'Attack path: Exec sink: attack path', 'Mitigation examined: Exec sink: mitigation', 'Fix: Exec sink: fix']) {
    assert.ok(section.includes(field), `missing: ${field}`);
  }
  assert.match(section, /\*\*curl piped to sh\*\* `scripts\/setup\.sh:3` \(confidence 9, plausible; command_injection\)/);
  assert.match(section, /\*\*Error text sent to the client\*\*.*\(confidence 9, not verified: Low; command_injection\)/);
  assert.match(section, /#### Skipped lanes\n\n- ai-surface: no model client library/);
  assert.match(section, /#### Discarded leads\n\n1 lead below confidence 6; rejected by verification: 0\./);
  assert.match(section, /#### Files read\n\n5 files\./);
  assert.match(section, /#### Tools used\n\n\| Tool \| Version \| Exit \|\n\|---\|---\|---\|\n\| npm audit \| 10\.8\.2 \| 1 \|/);
  assert.match(section, /#### Declined to judge\n\n- src\/vendor\/minified\.js: minified, not judged/);
  assert.match(md, /security: FAIL \(1 High, 2 Medium and 1 Low findings; 1 CVE, 1 critical or high in a runtime dependency\)/);
});

test('the hunt section quotes the report verdict and prints a disagreement as a note without resolving it', () => {
  const security = sec([hunt('api', 'code', { findings: [vuln('Medium', 'Open redirect')] })], [verify('Open redirect', 'confirmed')]);
  const agree = runSec(security, [repoBlock('api')], qa('Verdict: PASS — ok.'), '# Security report — 501\nVerdict: PASS-WITH-ISSUES — an open redirect.\n');
  assert.match(agree.markdown, /> Verdict: PASS-WITH-ISSUES — an open redirect\./);
  assert.doesNotMatch(agree.markdown, /disagree/i);
  const differ = runSec(security, [repoBlock('api')], qa('Verdict: PASS — ok.'), '# Security report — 501\nVerdict: PASS — nothing found.\n');
  assert.match(differ.markdown, /> Verdict: PASS — nothing found\./);
  assert.match(differ.markdown, /disagree/i);
  assert.equal(differ.verdict, 'PASS-WITH-ISSUES', 'the findings file decides, not the report line');
  assert.equal(differ.security.verdict, 'PASS-WITH-ISSUES');
});

test('a High or Medium finding with no verification counts as plausible and is marked unverified', () => {
  const r = runSec(sec([hunt('api', 'code', { findings: [vuln('Medium', 'Unverified sink'), vuln('High', 'Unverified high')] })]));
  assert.equal(r.verdict, 'FAIL');
  assert.match(r.markdown, /\*\*Unverified sink\*\*.*\(confidence 9, unverified; command_injection\)/);
});

test('a CVE reported by two lanes appears once', () => {
  const r = runSec(sec([hunt('api', 'dependencies', { cves: [cve('moderate', true)] }), hunt('api', 'code', { cves: [cve('moderate', true)] })]));
  assert.equal(r.markdown.match(/\| lodash \|/g).length, 1);
});

test('hunt severities are matched without regard to case; an unknown one is refused', () => {
  assert.equal(runSec(sec([hunt('api', 'code', { findings: [vuln('high', 'x')] })], [verify('x', 'confirmed')])).verdict, 'FAIL');
  assert.throws(() => runSec(sec([hunt('api', 'code', { findings: [vuln('Critical', 'x')] })])), /severity/i);
  assert.throws(() => runSec(sec([hunt('api', 'dependencies', { cves: [cve('severe', true)] })])), /severity/i);
  assert.throws(() => runSec(sec([hunt('api', 'code', { findings: [vuln('High', 'x')] })], [verify('x', 'maybe')])), /verdict/i);
  assert.throws(() => runSec({ hunts: [] }), /repos/);
});

test('every heading of the template appears in a full report', () => {
  const headings = readFileSync(TEMPLATE, 'utf8').split('\n').filter((l) => /^#{1,4} /.test(l) && !l.includes('<'));
  const security = sec([
    hunt('api', 'dependencies', { tools: [npmAudit], cves: [cve('low', true)] }),
    hunt('api', 'code', { findings: [vuln('High', 'h'), vuln('Medium', 'm'), vuln('Low', 'l')] }),
  ], [verify('h', 'confirmed'), verify('m', 'confirmed')]);
  const r = runSec(security, [repoBlock('api', [finding('Critical', 'a'), finding('Important', 'b'), finding('Minor', 'c')])], qa('Verdict: PASS — ok.', '![s](artifacts/s.png)'));
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

test('the CLI takes the hunt from --security, and from reviews/<ID>/security-findings.json by default', () => {
  const root = project();
  try {
    writeFileSync(join(root, 'reviews', '501', 'review-findings.json'), JSON.stringify({ repos: [repoBlock('api')] }));
    writeFileSync(join(root, 'reviews', '501', 'QA-REPORT.md'), qa('Verdict: PASS — ok.'));
    const runtimeCve = sec([hunt('api', 'dependencies', { cves: [cve('high', true)] })]);
    writeFileSync(join(root, 'hunt.json'), JSON.stringify(runtimeCve));
    let out = cli(root, ['501', '--findings', 'reviews/501/review-findings.json', '--security', 'hunt.json']);
    assert.equal(out.status, 0, out.stderr);
    assert.match(out.stdout, /Verdict: FAIL/);

    out = cli(root, ['501', '--findings', 'reviews/501/review-findings.json']);
    assert.equal(out.status, 0, out.stderr);
    assert.match(out.stdout, /Verdict: PASS —/, 'no hunt file: the verdict is unchanged');
    assert.match(readFileSync(join(root, 'reviews', '501', 'TASK-REVIEW.md'), 'utf8'), /No vulnerability hunt/);

    writeFileSync(join(root, 'reviews', '501', 'security-findings.json'), JSON.stringify(runtimeCve));
    out = cli(root, ['501', '--findings', 'reviews/501/review-findings.json']);
    assert.equal(out.status, 0, out.stderr);
    assert.match(out.stdout, /Verdict: FAIL/, 'the default hunt file is read');

    writeFileSync(join(root, 'reviews', '501', 'SECURITY-REPORT.md'), '# Security report — 501\nVerdict: FAIL — lodash 4.17.15, GHSA-35jh-r3h4-6jhm.\n');
    out = cli(root, ['501', '--findings', 'reviews/501/review-findings.json']);
    assert.equal(out.status, 0, out.stderr);
    assert.match(readFileSync(join(root, 'reviews', '501', 'TASK-REVIEW.md'), 'utf8'), /> Verdict: FAIL — lodash 4\.17\.15/, 'the default hunt report is quoted');

    assert.equal(cli(root, ['501', '--findings', 'reviews/501/review-findings.json', '--security', 'missing.json']).status, 2, 'a named hunt file that does not exist');
    writeFileSync(join(root, 'reviews', '501', 'security-findings.json'), '{ not json');
    assert.equal(cli(root, ['501', '--findings', 'reviews/501/review-findings.json']).status, 2, 'a default hunt file that is not JSON');
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

// GH-59: advisories from research (repos[].research), the hunt's STEP 0b.
const research = (advisories, extra = {}) => ({ tools: ['a documentation server'], status: 'checked', reason: '', notResearched: [], advisories, ...extra });
const adv = (severity, runtime, status, extra = {}) => ({
  subject: 'node', version: '20.0.0', versionSource: 'package.json engines', advisory: 'CVE-2026-0001', severity,
  affectedRange: '<20.18.1', fixedIn: '20.18.1', runtime, status, reason: '', source: 'https://nodejs.org/en/blog/vulnerability/x',
  sourceDate: '2026-10-20', verification: 'confirmed', verificationReason: '', ...extra,
});
// A repository whose dependencies lane ran clean, with a research block.
const withResearch = (block, repo = 'api', hunts = []) => ({ repo, hunts: [hunt(repo, 'dependencies', { tools: [npmAudit] }), ...hunts], verifications: [], research: block });
const runResearch = (...repos) => runSec({ repos });

test('a confirmed applies critical runtime advisory from research fails the review', () => {
  const r = runResearch(withResearch(research([adv('critical', true, 'applies')])));
  assert.equal(r.verdict, 'FAIL');
  assert.match(r.markdown, /^Verdict: FAIL — .*1 critical or high advisory from research in a runtime \(first: node 20\.0\.0, CVE-2026-0001\)/m);
  assert.match(r.markdown, /#### Advisories from research/);
  assert.match(r.markdown, /\| node \| 20\.0\.0 \| CVE-2026-0001 \| critical \| <20\.18\.1 \| 20\.18\.1 \| runtime \| applies \| confirmed \|/);
});

test('an applies moderate runtime advisory gives PASS-WITH-ISSUES', () => {
  assert.equal(runResearch(withResearch(research([adv('moderate', true, 'applies')]))).verdict, 'PASS-WITH-ISSUES');
});

test('an applies high test-only advisory gives PASS-WITH-ISSUES', () => {
  assert.equal(runResearch(withResearch(research([adv('high', false, 'applies')]))).verdict, 'PASS-WITH-ISSUES');
});

test('unverified and does-not-apply rows never change the verdict', () => {
  const r = runResearch(withResearch(research([adv('critical', true, 'unverified', { reason: 'no version declared' }), adv('critical', true, 'does-not-apply', { advisory: 'CVE-2026-0002' })])));
  assert.equal(r.verdict, 'PASS');
  assert.match(r.markdown, /\| unverified \|/);
  assert.match(r.markdown, /\| does not apply \|/);
});

test('an applies high row the verifier did not reach still counts and is marked not verified', () => {
  const r = runResearch(withResearch(research([adv('high', true, 'applies', { verification: 'not-verified' })])));
  assert.equal(r.verdict, 'FAIL');
  assert.match(r.markdown, /\| applies \| not verified \|/);
});

test('GitHub\'s medium severity maps to moderate', () => {
  const r = runResearch(withResearch(research([adv('medium', true, 'applies')])));
  assert.equal(r.verdict, 'PASS-WITH-ISSUES');
  assert.match(r.markdown, /\| moderate \|/);
});

test('a row whose advisory id is in the CVE table counts once and says also reported', () => {
  const block = withResearch(research([adv('critical', true, 'applies', { subject: 'lodash', version: '4.17.15', advisory: 'ghsa-35jh-r3h4-6jhm' })]));
  block.hunts[0].cves = [cve('moderate', true)];
  const s = decideSecurity([block]);
  assert.equal(s.counts.researchRuntimeCritical, 0);
  assert.equal(s.verdict, 'PASS-WITH-ISSUES', 'the CVE table row decides, once');
  assert.match(runResearch(block).markdown, /also reported by the audit tools/);
});

test('two repositories: an advisory applies in one only', () => {
  const r = runResearch(
    withResearch(research([adv('critical', true, 'applies')]), 'api'),
    withResearch(research([adv('critical', true, 'does-not-apply', { version: '22.11.0' })]), 'web'),
  );
  assert.equal(r.verdict, 'FAIL');
  assert.match(r.markdown, /### web[\s\S]*\| node \| 22\.11\.0 \| CVE-2026-0001 \| critical \|[^\n]*\| does not apply \|/);
});

test('a repository with no research key renders the not-checked line and changes nothing', () => {
  const r = runResearch(withResearch(undefined));
  assert.equal(r.verdict, 'PASS');
  assert.match(r.markdown, /Current sources not checked: the hunt recorded no research/);
});

test('a research block with status not-checked renders its reason', () => {
  const r = runResearch(withResearch(research([], { status: 'not-checked', reason: 'no research tool in this session', tools: [] })));
  assert.match(r.markdown, /Current sources not checked: no research tool in this session/);
});

test('not researched subjects are listed with their reason', () => {
  const r = runResearch(withResearch(research([], { notResearched: [{ subject: '@acme-internal/billing', reason: 'private' }] })));
  assert.match(r.markdown, /Not researched: @acme-internal\/billing \(private\)/);
});

test('an unknown research status is refused', () => {
  assert.throws(() => decideSecurity([withResearch(research([adv('critical', true, 'maybe')]))]), /unknown research status/);
});
