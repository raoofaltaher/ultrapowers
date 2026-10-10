#!/usr/bin/env node
// assemble-review.mjs <ticket> --findings <json> [--qa <QA-REPORT.md>] [--cwd <dir>]
//
// Step 5 of ultrapowers:task-review. Reads the reviewers' findings (a JSON file,
// { "repos": [ { repo, base, branch, head, findings[], tdd, strengths[], declined[] } ] }) and the
// QA gate's report, decides one verdict and writes <root>/reviews/<ticket>/TASK-REVIEW.md
// (shape: ../templates/TASK-REVIEW.md). It writes nothing else and touches no network.
//
// Verdict: FAIL on any Critical finding or a QA FAIL; BLOCKED when the QA gate gave no usable
// verdict (PRECONDITION-FAILED, INCOMPLETE, no report, no verdict line); PASS-WITH-ISSUES on any
// Important finding or a QA PASS-WITH-ISSUES; else PASS. The code review findings appear in the
// report whatever the QA gate did.
//
// Exit codes: 0 written; 2 usage or unreadable findings; 3 no project root; 4 invalid ticket.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { DEFAULT_TICKET_PATTERN, findRoot } from '../../qa-specialist/scripts/qa-preflight.mjs';

const SEVERITIES = ['Critical', 'Important', 'Minor'];
const QA_VERDICT = /^Verdict:[ \t]*(PASS-WITH-ISSUES|PASS|FAIL|INCOMPLETE|PRECONDITION-FAILED)\b.*$/m;
const EMBED = /!\[[^\]]*\]\(artifacts\/[^)\r\n]*\)/g;

export function parseQaVerdict(text) {
  if (typeof text !== 'string') return null;
  const match = QA_VERDICT.exec(text);
  return match ? { value: match[1], line: match[0].trimEnd() } : null;
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

function plural(n, word) {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

export function decide(repos, qa) {
  const counts = { Critical: 0, Important: 0, Minor: 0 };
  for (const repo of repos) for (const f of repo.findings) counts[f.severity] += 1;
  const firstCritical = repos.flatMap((r) => r.findings).find((f) => f.severity === 'Critical');
  const qaValue = qa ? qa.value : null;
  let verdict;
  let sentence;
  if (counts.Critical > 0 || qaValue === 'FAIL') {
    verdict = 'FAIL';
    const parts = [];
    if (counts.Critical > 0) parts.push(`${plural(counts.Critical, 'Critical finding')} (first: ${firstCritical.title})`);
    if (qaValue === 'FAIL') parts.push('the QA gate failed');
    sentence = parts.join('; ');
  } else if (qaValue === null || qaValue === 'PRECONDITION-FAILED' || qaValue === 'INCOMPLETE') {
    verdict = 'BLOCKED';
    const why = qaValue === null ? 'there is no usable QA verdict' : `the QA gate ended ${qaValue}`;
    sentence = `${why}; the code review found ${plural(counts.Important, 'Important finding')} and ${plural(counts.Minor, 'Minor finding')}`;
  } else if (counts.Important > 0 || qaValue === 'PASS-WITH-ISSUES') {
    verdict = 'PASS-WITH-ISSUES';
    const parts = [];
    if (counts.Important > 0) parts.push(plural(counts.Important, 'Important finding'));
    if (qaValue === 'PASS-WITH-ISSUES') parts.push('the QA gate passed with issues');
    sentence = parts.join('; ');
  } else {
    verdict = 'PASS';
    sentence = counts.Minor > 0 ? `only ${plural(counts.Minor, 'Minor finding')} and a QA pass` : 'no findings and a QA pass';
  }
  return { verdict, sentence, counts };
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

export function assemble({ id, findings, qaText, now = new Date() }) {
  const repos = normalize(findings);
  const qa = parseQaVerdict(qaText);
  const { verdict, sentence, counts } = decide(repos, qa);
  const stamp = now.toISOString().slice(0, 16).replace('T', ' ');
  const out = [];
  out.push(`# Task review — ${id}`, '');
  out.push('| Ticket | ' + id + ' |', '|---|---|', `| Date (UTC) | ${stamp} |`);
  out.push(`| Repositories | ${repos.map((r) => `${r.repo}: ${r.branch} against ${r.base} at ${r.head}`).join('; ') || 'none'} |`);
  out.push('| QA report | [QA-REPORT.md](QA-REPORT.md) |', '');
  out.push(`Verdict: ${verdict} — ${sentence}.`, '');
  out.push('## Summary', '');
  out.push(`${plural(counts.Critical, 'Critical finding')}, ${plural(counts.Important, 'Important finding')} and ${plural(counts.Minor, 'Minor finding')} across ${plural(repos.length, 'repository')}. QA gate: ${qa ? qa.value : 'no verdict'}. ${sentence}.`, '');
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
  out.push('## QA gate', '');
  if (qa) {
    out.push(`> ${qa.line}`, '');
    const embeds = [...new Set(qaText.match(EMBED) || [])];
    for (const e of embeds) out.push(e, '');
  } else if (typeof qaText === 'string') {
    out.push('> The QA report has no verdict line, so the gate counts as blocked.', '');
  } else {
    out.push(`> No QA report was found for ticket ${id}; the gate has not produced a verdict.`, '');
  }
  return { verdict, sentence, counts, markdown: out.join('\n').replace(/\n{3,}/g, '\n\n').replace(/\n*$/, '\n') };
}

function usage(message) {
  if (message) process.stderr.write(`${message}\n`);
  process.stderr.write('usage: node assemble-review.mjs <ticket> --findings <json> [--qa <QA-REPORT.md>] [--cwd <dir>]\n');
  return 2;
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
  if (!id) return usage('ERROR: no ticket given');
  if (!findingsPath) return usage('ERROR: --findings <json> is required');
  const root = findRoot(cwd);
  if (!root) {
    process.stderr.write(`ERROR: no .agents/ultrapowers.json at or above ${cwd}; run /ultrapowers:init first\n`);
    return 3;
  }
  let pattern = DEFAULT_TICKET_PATTERN;
  try {
    const config = JSON.parse(readFileSync(join(root, '.agents', 'ultrapowers.json'), 'utf8').replace(/^﻿/, ''));
    if (typeof config.ticketPattern === 'string' && config.ticketPattern.trim()) pattern = config.ticketPattern;
  } catch {
    process.stderr.write('ERROR: .agents/ultrapowers.json is not valid JSON\n');
    return 3;
  }
  if (/^(\.|\.\.|-.*)$/.test(id) || /[/\\\s]/.test(id) || !new RegExp(pattern).test(id)) {
    process.stderr.write(`ERROR: ticket ${JSON.stringify(id)} is not a plain folder name matching ticketPattern ${pattern}\n`);
    return 4;
  }
  let findings;
  try {
    findings = JSON.parse(readFileSync(resolve(cwd, findingsPath), 'utf8').replace(/^﻿/, ''));
  } catch (error) {
    return usage(`ERROR: cannot read the findings file ${findingsPath}: ${error.message}`);
  }
  const qaFile = resolve(cwd, qaArg || join('reviews', id, 'QA-REPORT.md'));
  const qaText = existsSync(qaFile) ? readFileSync(qaFile, 'utf8') : null;
  let result;
  try {
    result = assemble({ id, findings, qaText });
  } catch (error) {
    return usage(`ERROR: ${error.message}`);
  }
  const target = join(root, 'reviews', id, 'TASK-REVIEW.md');
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, result.markdown);
  process.stdout.write(`Verdict: ${result.verdict} — ${result.sentence}.\nwrote reviews/${id}/TASK-REVIEW.md\n`);
  return 0;
}

if (process.argv[1] && basename(process.argv[1]) === 'assemble-review.mjs') {
  process.exit(main(process.argv.slice(2)));
}
