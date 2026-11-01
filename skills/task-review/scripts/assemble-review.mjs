#!/usr/bin/env node
// assemble-review.mjs <ticket> --findings <json> [--qa <QA-REPORT.md>] [--cwd <dir>]
//
// Step 5 of ultrapowers:task-review. Reads the reviewers' findings (a JSON file,
// { "repos": [ { repo, base, branch, head, findings[], tdd, strengths[], declined[] } ] }), the
// vulnerability hunt's latest run folder (reviews/<ticket>/run-<N>/, read through hunt-verdict.mjs: its
// loadRun, judgeRun and renderReviewSection) and the QA gate's report, decides one verdict and writes
// <root>/reviews/<ticket>/TASK-REVIEW.md (shape: ../templates/TASK-REVIEW.md). It writes nothing else and
// touches no network.
//
// Verdict: FAIL on any Critical finding, a QA FAIL or a security FAIL; BLOCKED when the QA gate gave
// no usable verdict (PRECONDITION-FAILED, INCOMPLETE, no report, no verdict line) or the hunt ended
// INCOMPLETE; PASS-WITH-ISSUES on any Important finding, a QA PASS-WITH-ISSUES or a security
// PASS-WITH-ISSUES; else PASS. The security verdict is judgeRun's, computed from the run's records, not
// read from the hunt's report. A hunt INCOMPLETE blocks whether or not the project configures QA, and is
// named in the verdict sentence beside the QA cause when both hold. No run folder is reported as "no
// vulnerability hunt" and changes nothing. SECURITY-REPORT.md (reviews/<ticket>/) is read only to quote
// its Verdict line; a disagreement is printed, not resolved. The records of the hunt before GH-63 (its one
// JSON file in reviews/<ticket>/, with no run folder beside it) are refused: run the hunt again.
// The code review and hunt findings appear in the report whatever the QA gate did.
// Carve-out: with no QA report and a project whose `qa` config is blank (as autopilot's qaConfigured),
// the QA gate does not block; the verdict comes from the code review and the hunt alone and the report
// says "QA: not configured for this project".
//
// Every file it reads (the findings, the QA report, the hunt's report) and the one it writes are regular
// files of the project: a symbolic link or junction, a folder in a file's place, or a reviews or
// reviews/<ticket> that links out of the project is refused (exit 2), never followed.
//
// Exit codes: 0 written; 2 usage, unreadable findings, old hunt records, or a refused link; 3 no project
// root; 4 invalid ticket.
import { existsSync, lstatSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { regularFileProblem, reviewFolderProblem } from '../../autopilot/scripts/autopilot-lib.mjs';
import { DEFAULT_TICKET_PATTERN, findRoot } from '../../qa-specialist/scripts/qa-preflight.mjs';
import { plainId, plural, readProject } from '../../vulnerability-hunt/scripts/hunt-files.mjs';
import { judgeRun, loadRun, renderReviewSection } from '../../vulnerability-hunt/scripts/hunt-verdict.mjs';

const SEVERITIES = ['Critical', 'Important', 'Minor'];
const QA_VERDICT = /^Verdict:[ \t]*(PASS-WITH-ISSUES|PASS|FAIL|INCOMPLETE|PRECONDITION-FAILED)\b.*$/m;
const REPORT_VERDICT_LINE = /^Verdict:.*$/m;
const EMBED = /!\[[^\]]*\]\(artifacts\/[^)\r\n]*\)/g;

function parseQaVerdict(text) {
  if (typeof text !== 'string') return null;
  const match = QA_VERDICT.exec(text);
  return match ? { value: match[1], line: match[0].trimEnd() } : null;
}

// The line of SECURITY-REPORT.md that starts with `Verdict:`, or null.
function reportVerdictLine(text) {
  if (typeof text !== 'string') return null;
  const match = REPORT_VERDICT_LINE.exec(text);
  return match ? match[0].trimEnd() : null;
}

function normalizeSeverity(raw, title) {
  const found = SEVERITIES.find((s) => s.toLowerCase() === String(raw).trim().toLowerCase());
  if (!found) throw new Error(`finding ${JSON.stringify(title)} has an unknown severity ${JSON.stringify(raw)} (one of ${SEVERITIES.join(', ')})`);
  return found;
}

function normalize(findings) {
  if (!findings || !Array.isArray(findings.repos)) throw new Error('the findings JSON must be { "repos": [ ... ] }');
  return findings.repos.map((block, i) => {
    if (!block || typeof block !== 'object') throw new Error(`repos[${i}] is not an object`);
    const list = Array.isArray(block.findings) ? block.findings : [];
    return {
      repo: String(block.repo ?? `repo-${i + 1}`),
      base: String(block.base ?? ''),
      branch: String(block.branch ?? ''),
      head: String(block.head ?? '').slice(0, 12),
      findings: list.map((f) => ({
        severity: normalizeSeverity(f?.severity, f?.title),
        title: String(f?.title ?? '(untitled)'),
        file: String(f?.file ?? ''),
        line: f?.line,
        problem: String(f?.problem ?? ''),
        rootCause: String(f?.rootCause ?? '') || 'unconfirmed',
        fix: String(f?.fix ?? ''),
      })),
      tdd: { verdict: String(block.tdd?.verdict ?? 'unknown'), notes: String(block.tdd?.notes ?? '') },
      strengths: (Array.isArray(block.strengths) ? block.strengths : []).map(String),
      declined: (Array.isArray(block.declined) ? block.declined : []).map(String),
    };
  });
}

// `security` is judgeRun's judgement of the hunt's run ({ verdict, sentence, counts, repos }), or null when there is no run.
function decide(repos, qa, security, { qaConfigured = true } = {}) {
  const counts = { Critical: 0, Important: 0, Minor: 0 };
  for (const repo of repos) for (const f of repo.findings) counts[f.severity] += 1;
  const firstCritical = repos.flatMap((r) => r.findings).find((f) => f.severity === 'Critical');
  const securityValue = security ? security.verdict : null;
  const qaValue = qa ? qa.value : null;
  const qaSkipped = qaValue === null && !qaConfigured;
  const qaBlocked = !qaSkipped && (qaValue === null || qaValue === 'PRECONDITION-FAILED' || qaValue === 'INCOMPLETE');
  const huntBlocked = securityValue === 'INCOMPLETE';
  let verdict;
  let sentence;
  if (counts.Critical > 0 || qaValue === 'FAIL' || securityValue === 'FAIL') {
    verdict = 'FAIL';
    const parts = [];
    if (counts.Critical > 0) parts.push(`${plural(counts.Critical, 'Critical finding')} (first: ${firstCritical.title})`);
    if (securityValue === 'FAIL') parts.push(security.sentence);
    if (qaValue === 'FAIL') parts.push('the QA gate failed');
    sentence = parts.join('; ');
  } else if (qaBlocked || huntBlocked) {
    verdict = 'BLOCKED';
    const causes = [];
    if (qaBlocked) causes.push(qaValue === null ? 'there is no usable QA verdict' : `the QA gate ended ${qaValue}`);
    if (huntBlocked) causes.push(`the vulnerability hunt ended INCOMPLETE (${security.sentence})`);
    sentence = `${causes.join('; ')}; the code review found ${plural(counts.Important, 'Important finding')} and ${plural(counts.Minor, 'Minor finding')}`;
  } else if (counts.Important > 0 || qaValue === 'PASS-WITH-ISSUES' || securityValue === 'PASS-WITH-ISSUES') {
    verdict = 'PASS-WITH-ISSUES';
    const parts = [];
    if (counts.Important > 0) parts.push(plural(counts.Important, 'Important finding'));
    if (securityValue === 'PASS-WITH-ISSUES') parts.push(security.sentence);
    if (qaValue === 'PASS-WITH-ISSUES') parts.push('the QA gate passed with issues');
    sentence = parts.join('; ');
  } else {
    verdict = 'PASS';
    sentence = qaSkipped
      ? (counts.Minor > 0 ? `only ${plural(counts.Minor, 'Minor finding')}` : 'no findings')
      : (counts.Minor > 0 ? `only ${plural(counts.Minor, 'Minor finding')} and a QA pass` : 'no findings and a QA pass');
  }
  if (qaSkipped) sentence += '; QA: not configured for this project';
  return { verdict, sentence, counts, qaSkipped };
}

function securitySummary(sec) {
  if (!sec) return 'security: no vulnerability hunt';
  const c = sec.counts;
  return `security: ${sec.verdict} (${c.confirmed.critical + c.confirmed.high} confirmed critical or high, ${c.confirmed.medium} confirmed medium, ${c.needs_validation} needs_validation, ${c.secrets} committed credentials; ${c.cves.total} CVEs, ${c.cves.runtimeCriticalHigh} critical or high in a runtime dependency)`;
}

function findingBlock(n, f) {
  const where = f.file ? ` \`${f.file}${f.line ? `:${f.line}` : ''}\`` : '';
  return [
    `${n}. **${f.title}**${where}`,
    `   - Problem: ${f.problem}`,
    `   - Root cause: ${f.rootCause}`,
    `   - Fix: ${f.fix}`,
  ].join('\n');
}

// `run` is loadRun's result for the ticket (or null when it has no run folder); `reportText` the text of
// reviews/<ticket>/SECURITY-REPORT.md (or null).
export function assemble({ id, findings, qaText, run = null, reportText = null, qaConfigured = true, now = new Date() }) {
  const repos = normalize(findings);
  const sec = run ? judgeRun(run) : null;
  const qa = parseQaVerdict(qaText);
  const { verdict, sentence, counts, qaSkipped } = decide(repos, qa, sec, { qaConfigured });
  const stamp = now.toISOString().slice(0, 16).replace('T', ' ');
  const out = [];
  out.push(`# Task review — ${id}`, '');
  out.push('| Ticket | ' + id + ' |', '|---|---|', `| Date (UTC) | ${stamp} |`);
  out.push(`| Repositories | ${repos.map((r) => `${r.repo}: ${r.branch} against ${r.base} at ${r.head}`).join('; ') || 'none'} |`);
  out.push('| QA report | [QA-REPORT.md](QA-REPORT.md) |', '');
  out.push(`Verdict: ${verdict} — ${sentence}.`, '');
  out.push('## Summary', '');
  out.push(`${plural(counts.Critical, 'Critical finding')}, ${plural(counts.Important, 'Important finding')} and ${plural(counts.Minor, 'Minor finding')} across ${plural(repos.length, 'repository')}. ${qaSkipped ? 'QA: not configured for this project' : `QA gate: ${qa ? qa.value : 'no verdict'}`}; ${securitySummary(sec)}. ${sentence}.`, '');
  out.push('## Code review', '');
  for (const repo of repos) {
    out.push(`### ${repo.repo} (${repo.branch} against ${repo.base})`, '');
    for (const severity of SEVERITIES) {
      out.push(`#### ${severity}`, '');
      const list = repo.findings.filter((f) => f.severity === severity);
      if (list.length === 0) out.push('None.', '');
      else out.push(...list.map((f, i) => findingBlock(i + 1, f) + '\n'));
    }
    out.push('#### TDD assessment', '', `${repo.tdd.verdict} — ${repo.tdd.notes}`.trimEnd(), '');
    out.push('#### Strengths', '', ...(repo.strengths.length ? repo.strengths.map((s) => `- ${s}`) : ['None recorded.']), '');
    out.push('#### Declined to judge', '', ...(repo.declined.length ? repo.declined.map((s) => `- ${s}`) : ['None.']), '');
  }
  if (run) out.push(...renderReviewSection(run, sec, reportVerdictLine(reportText)));
  else out.push('## Vulnerability hunt and audit', '', `> No vulnerability hunt: reviews/${id}/ holds no run folder (run-<N>), so the verdict counts no hunt.`, '');
  out.push('## QA gate', '');
  if (qa) {
    out.push(`> ${qa.line}`, '');
    const embeds = [...new Set(qaText.match(EMBED) || [])];
    for (const e of embeds) out.push(e, '');
  } else if (qaSkipped) {
    out.push('> QA: not configured for this project', '');
  } else if (typeof qaText === 'string') {
    out.push('> The QA report has no verdict line, so the gate counts as blocked.', '');
  } else {
    out.push(`> No QA report was found for ticket ${id}; the gate has not produced a verdict.`, '');
  }
  return { verdict, sentence, counts, security: sec, markdown: out.join('\n').replace(/\n{3,}/g, '\n\n').replace(/\n*$/, '\n') };
}

// Mirrors qaConfigured(marker) in skills/autopilot/scripts/autopilot.mjs.
const qaConfiguredIn = (qa) => Boolean(qa && typeof qa === 'object' && qa.urls && Object.values(qa.urls).some((v) => typeof v === 'string' && v.trim()));

const USAGE = 'usage: node assemble-review.mjs <ticket> --findings <json> [--qa <QA-REPORT.md>] [--cwd <dir>]';

// A usage error: its ERROR line and the usage text, exit 2.
function usage(message) {
  process.stderr.write(`ERROR: ${message}\n${USAGE}\n`);
  return 2;
}

// Any other refusal: its ERROR line alone, exit 2 unless `code` says otherwise.
function fail(message, code = 2) {
  process.stderr.write(`ERROR: ${message}\n`);
  return code;
}

function main(argv) {
  const args = [...argv];
  const take = (flag) => {
    const i = args.indexOf(flag);
    if (i === -1) return undefined;
    const value = args[i + 1];
    args.splice(i, value === undefined ? 1 : 2);
    return value ?? '';
  };
  const findingsPath = take('--findings');
  const qaArg = take('--qa');
  const cwd = resolve(take('--cwd') ?? process.cwd());
  const id = args[0];
  if (!id) return usage('no ticket given');
  if (!findingsPath) return usage('--findings <json> is required');
  const root = findRoot(cwd);
  if (!root) return fail(`no .agents/ultrapowers.json at or above ${cwd}; run /ultrapowers:init first`, 3);
  let pattern = DEFAULT_TICKET_PATTERN;
  let qaConfigured = true;
  try {
    const { config } = readProject(root);
    if (typeof config.ticketPattern === 'string' && config.ticketPattern.trim()) pattern = config.ticketPattern;
    qaConfigured = qaConfiguredIn(config.qa);
  } catch {
    return fail('.agents/ultrapowers.json is not valid JSON', 3);
  }
  if (!plainId(id) || !new RegExp(pattern).test(id)) {
    return fail(`ticket ${JSON.stringify(id)} is not a plain folder name matching ticketPattern ${pattern}`, 4);
  }
  // The review folder is a real folder of the project before anything in it is read or written: neither reviews
  // nor reviews/<ticket> may be a link out of it.
  const folderProblem = lstatSync(join(root, 'reviews'), { throwIfNoEntry: false })?.isSymbolicLink()
    ? 'reviews is a symbolic link or junction, not a folder of the project'
    : reviewFolderProblem(root, id);
  if (folderProblem) return fail(`${folderProblem}; nothing was read or written`);
  // The refusal message of a file that is not a regular file of the project, or null.
  const refused = (file, label) => {
    const problem = regularFileProblem(file, label);
    return problem ? `${problem}; nothing was written` : null;
  };
  // The hunt's latest run folder, read the way hunt-verdict.mjs reads it. The provenance check runs when the
  // runner's log folder .ultrapowers/sandbox/<ID>/ exists on this machine; that folder is not committed, so
  // records read on another machine are judged without it. Records from before GH-63 are refused, not read.
  const logFolder = lstatSync(join(root, '.ultrapowers', 'sandbox', id), { throwIfNoEntry: false });
  let run;
  try {
    run = loadRun(root, id, logFolder?.isDirectory() ? { checkProvenance: true } : {});
  } catch (error) {
    return fail(`cannot read the vulnerability hunt's run folder: ${error.message}`);
  }
  if (!run && lstatSync(join(root, 'reviews', id, 'security-findings.json'), { throwIfNoEntry: false })?.isFile()) {
    return fail('the vulnerability hunt records are from before GH-63; run the hunt again');
  }
  const findingsFile = resolve(cwd, findingsPath);
  const findingsRefusal = refused(findingsFile, findingsPath);
  if (findingsRefusal) return fail(findingsRefusal);
  let findings;
  try {
    findings = JSON.parse(readFileSync(findingsFile, 'utf8').replace(/^﻿/, ''));
  } catch (error) {
    return fail(`cannot read the findings file ${findingsPath}: ${error.message}`);
  }
  const qaFile = resolve(cwd, qaArg || join('reviews', id, 'QA-REPORT.md'));
  const qaRefusal = refused(qaFile, qaArg || `reviews/${id}/QA-REPORT.md`);
  if (qaRefusal) return fail(qaRefusal);
  const qaText = existsSync(qaFile) ? readFileSync(qaFile, 'utf8') : null;
  // The hunt's own report is read only to quote its verdict line beside the one computed here.
  const reportFile = join(root, 'reviews', id, 'SECURITY-REPORT.md');
  const reportRefusal = run ? refused(reportFile, `reviews/${id}/SECURITY-REPORT.md`) : null;
  if (reportRefusal) return fail(reportRefusal);
  const reportText = run && existsSync(reportFile) ? readFileSync(reportFile, 'utf8') : null;
  let result;
  try {
    result = assemble({ id, findings, qaText, run, reportText, qaConfigured });
  } catch (error) {
    return fail(error.message);
  }
  const target = join(root, 'reviews', id, 'TASK-REVIEW.md');
  const targetRefusal = refused(target, `reviews/${id}/TASK-REVIEW.md`);
  if (targetRefusal) return fail(targetRefusal);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, result.markdown);
  process.stdout.write(`Verdict: ${result.verdict} — ${result.sentence}.\nwrote reviews/${id}/TASK-REVIEW.md\n`);
  return 0;
}

if (process.argv[1] && basename(process.argv[1]) === 'assemble-review.mjs') {
  process.exit(main(process.argv.slice(2)));
}
