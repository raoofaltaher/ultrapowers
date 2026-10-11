#!/usr/bin/env node
// assemble-review.mjs <ticket> --findings <json> [--qa <QA-REPORT.md>] [--security <json>] [--cwd <dir>]
//
// Step 5 of ultrapowers:task-review. Reads the reviewers' findings (a JSON file,
// { "repos": [ { repo, base, branch, head, findings[], tdd, strengths[], declined[] } ] }), the
// vulnerability hunt (Step 3b, { "repos": [ { repo, hunts[], verifications[] } ] }; default
// reviews/<ticket>/security-findings.json when it exists) and the QA gate's report, decides one
// verdict and writes <root>/reviews/<ticket>/TASK-REVIEW.md (shape: ../templates/TASK-REVIEW.md).
// It writes nothing else and touches no network.
//
// Verdict: FAIL on any Critical finding, a QA FAIL or a security FAIL; BLOCKED when the QA gate gave
// no usable verdict (PRECONDITION-FAILED, INCOMPLETE, no report, no verdict line); PASS-WITH-ISSUES
// on any Important finding, a QA PASS-WITH-ISSUES or a security PASS-WITH-ISSUES; else PASS. The
// security verdict (decideSecurity) is computed here from the findings file, not read from the
// hunt's report: FAIL on a High finding that is not `rejected` (a High with no verification counts as
// plausible) or a critical or high CVE with `runtime: true`; PASS-WITH-ISSUES on a Medium finding, a
// moderate runtime CVE or a critical or high test-only CVE; INCOMPLETE when a repository has no
// dependencies lane block, or one with status incomplete and no CVEs, and nothing above applies; else
// PASS. A security INCOMPLETE never blocks: it is named in the verdict sentence, the Summary and the
// section. Low findings and low CVEs
// never change a verdict; a finding below confidence 6 is a discarded lead and a `rejected` one leaves
// the counts. A verification matches its finding by title (trimmed, case-sensitive) in the same
// repository. No hunt file is reported as "no vulnerability hunt" and changes nothing. SECURITY-REPORT.md
// (reviews/<ticket>/) is read only to quote its Verdict line; a disagreement is printed, not resolved.
// The code review and hunt findings appear in the report whatever the QA gate did.
//
// Exit codes: 0 written; 2 usage or unreadable findings or hunt; 3 no project root; 4 invalid ticket.
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

// --- the vulnerability hunt (Step 3b) ---
// Input: reviews/<ticket>/security-findings.json as vulnerability-hunter writes it,
// { "repos": [ { repo, hunts[] (the lane blocks), verifications[] { title, verdict, confidence, reason } } ] }.

const HUNT_SEVERITIES = ['High', 'Medium', 'Low'];
const CVE_SEVERITIES = ['critical', 'high', 'moderate', 'low'];
const VERDICTS = ['confirmed', 'plausible', 'rejected'];
const CONFIDENCE_FLOOR = 6;
const SECURITY_VERDICT = /^Verdict:[ \t]*(PASS-WITH-ISSUES|PASS|FAIL|INCOMPLETE)\b.*$/m;
const key = (s) => String(s ?? '').trim().toLowerCase();

export function parseSecurityVerdict(text) {
  if (typeof text !== 'string') return null;
  const match = SECURITY_VERDICT.exec(text);
  return match ? { value: match[1], line: match[0].trimEnd() } : null;
}

function huntSeverity(raw, title) {
  const found = HUNT_SEVERITIES.find((s) => s.toLowerCase() === key(raw));
  if (!found) throw new Error(`security finding ${JSON.stringify(title)} has an unknown severity ${JSON.stringify(raw)} (one of ${HUNT_SEVERITIES.join(', ')})`);
  return found;
}

function cveSeverity(raw, name) {
  const value = key(raw) === 'medium' ? 'moderate' : key(raw);
  if (!CVE_SEVERITIES.includes(value)) throw new Error(`CVE ${JSON.stringify(name)} has an unknown severity ${JSON.stringify(raw)} (one of ${CVE_SEVERITIES.join(', ')})`);
  return value;
}

// One entry per hunted repository: the findings that stand (confidence 6 or more, not rejected by
// the verification of the same title in the same repository), the CVEs (deduplicated), the skipped
// lanes, the tools, the declined lines and the counts of discarded leads and files read.
function normalizeSecurity(security) {
  if (security === null || security === undefined) return null;
  if (!Array.isArray(security.repos)) throw new Error('the vulnerability hunt JSON must be { "repos": [ ... ] }');
  return security.repos.map((block, i) => {
    if (!block || typeof block !== 'object') throw new Error(`security repos[${i}] is not an object`);
    const verdictFor = new Map();
    for (const v of Array.isArray(block.verifications) ? block.verifications : []) {
      const verdict = key(v?.verdict);
      if (!VERDICTS.includes(verdict)) throw new Error(`verification of ${JSON.stringify(v?.title)} has an unknown verdict ${JSON.stringify(v?.verdict)} (one of ${VERDICTS.join(', ')})`);
      verdictFor.set(String(v.title ?? '').trim(), { verdict, reason: String(v.reason ?? '') });
    }
    const findings = [];
    const cves = new Map();
    const skipped = [];
    const tools = [];
    const declined = new Set();
    const files = new Set();
    let discarded = 0;
    let rejected = 0;
    let dependencies = false;
    let dependenciesIncomplete = false;
    let dependenciesCves = 0;
    for (const hunt of Array.isArray(block.hunts) ? block.hunts : []) {
      const lane = String(hunt?.lane ?? 'unnamed');
      const cveList = Array.isArray(hunt?.cves) ? hunt.cves : [];
      if (lane === 'dependencies') {
        dependencies = true;
        dependenciesCves += cveList.length;
        if (key(hunt?.status) === 'incomplete') dependenciesIncomplete = true;
      }
      if (String(hunt?.skipped ?? '').trim()) skipped.push({ lane, reason: String(hunt.skipped).trim() });
      for (const d of Array.isArray(hunt?.declined) ? hunt.declined : []) if (String(d).trim()) declined.add(String(d).trim());
      for (const t of Array.isArray(hunt?.tools) ? hunt.tools : []) {
        tools.push({ lane, name: String(t?.name ?? ''), version: String(t?.version ?? ''), exit: t?.exit ?? '' });
      }
      discarded += Array.isArray(hunt?.discarded) ? hunt.discarded.length : 0;
      for (const f of Array.isArray(hunt?.filesRead) ? hunt.filesRead : []) files.add(String(f));
      for (const f of Array.isArray(hunt?.findings) ? hunt.findings : []) {
        const severity = huntSeverity(f?.severity, f?.title);
        const confidence = Number(f?.confidence);
        if (!(confidence >= CONFIDENCE_FLOOR)) { discarded += 1; continue; }
        const title = String(f?.title ?? '(untitled)');
        const check = verdictFor.get(title.trim());
        if (check?.verdict === 'rejected') { rejected += 1; continue; }
        // A High or Medium finding the agent did not verify counts as plausible and is marked so.
        const verification = severity === 'Low' ? 'not verified: Low' : check ? check.verdict : 'unverified';
        findings.push({
          severity, confidence, title, lane, verification, reason: check?.reason ?? '',
          category: String(f?.category ?? ''), file: String(f?.file ?? ''), line: f?.line,
          description: String(f?.description ?? ''), attackPath: String(f?.attackPath ?? ''), exploit: String(f?.exploit ?? ''),
          mitigationExamined: String(f?.mitigationExamined ?? ''), fix: String(f?.fix ?? ''),
        });
      }
      for (const c of cveList) {
        const name = String(c?.package ?? '(unnamed)');
        const entry = {
          package: name, version: String(c?.version ?? ''), advisory: String(c?.advisory ?? ''),
          severity: cveSeverity(c?.severity, name), fixedIn: String(c?.fixedIn ?? ''),
          // A CVE is runtime unless the hunter proved it test-only.
          runtime: c?.runtime !== false, proof: String(c?.proof ?? ''),
        };
        cves.set(`${entry.package}@${entry.version}#${entry.advisory}`, entry);
      }
    }
    return {
      repo: String(block.repo ?? `repo-${i + 1}`), findings, cves: [...cves.values()], skipped, tools, declined: [...declined],
      discarded, rejected, filesRead: files.size,
      // The dependencies lane produced no block, or ran, failed and gave no advisory: the audit is missing, not clean.
      incomplete: !dependencies || (dependenciesIncomplete && dependenciesCves === 0),
    };
  });
}

const severe = (c) => c.severity === 'critical' || c.severity === 'high';
const cveName = (c) => `${c.package} ${c.version}${c.advisory ? `, ${c.advisory}` : ''}`;

// The security verdict from the normalized hunt, by the rule of the vulnerability-hunter agent:
// FAIL on a High finding (confirmed, plausible or unverified) or a critical or high CVE in a runtime
// dependency; PASS-WITH-ISSUES on a Medium finding, a moderate runtime CVE or a critical or high
// test-only CVE; INCOMPLETE when a repository has no dependencies lane block or its one failed with no advisory and nothing above
// applies; else PASS. Low findings and low CVEs never count.
function judgeSecurity(hunted) {
  const counts = { high: 0, medium: 0, low: 0, cves: 0, cvesRuntimeCritical: 0, cvesRuntimeModerate: 0, cvesTestOnlyCritical: 0, unverified: 0 };
  const findings = hunted.flatMap((r) => r.findings);
  const cves = hunted.flatMap((r) => r.cves);
  for (const f of findings) {
    counts[f.severity.toLowerCase()] += 1;
    if (f.verification === 'unverified') counts.unverified += 1;
  }
  for (const c of cves) {
    counts.cves += 1;
    if (c.runtime && severe(c)) counts.cvesRuntimeCritical += 1;
    else if (c.runtime && c.severity === 'moderate') counts.cvesRuntimeModerate += 1;
    else if (!c.runtime && severe(c)) counts.cvesTestOnlyCritical += 1;
  }
  const incomplete = hunted.filter((r) => r.incomplete).map((r) => r.repo);
  const parts = [];
  let verdict;
  if (counts.high > 0 || counts.cvesRuntimeCritical > 0) {
    verdict = 'FAIL';
    if (counts.high > 0) parts.push(`${plural(counts.high, 'High security finding')} (first: ${findings.find((f) => f.severity === 'High').title})`);
    if (counts.cvesRuntimeCritical > 0) parts.push(`${plural(counts.cvesRuntimeCritical, 'critical or high CVE')} in a runtime dependency (first: ${cveName(cves.find((c) => c.runtime && severe(c)))})`);
  } else if (counts.medium > 0 || counts.cvesRuntimeModerate > 0 || counts.cvesTestOnlyCritical > 0) {
    verdict = 'PASS-WITH-ISSUES';
    if (counts.medium > 0) parts.push(plural(counts.medium, 'Medium security finding'));
    if (counts.cvesRuntimeModerate > 0) parts.push(`${plural(counts.cvesRuntimeModerate, 'moderate CVE')} in a runtime dependency`);
    if (counts.cvesTestOnlyCritical > 0) parts.push(`${plural(counts.cvesTestOnlyCritical, 'critical or high CVE')} in a test-only dependency`);
  } else if (incomplete.length > 0) {
    verdict = 'INCOMPLETE';
    parts.push(`the dependencies lane did not run or did not complete in ${incomplete.join(', ')}`);
  } else {
    verdict = 'PASS';
  }
  return { verdict, counts, sentence: parts.join('; '), incomplete };
}

// decideSecurity(repos): repos is the findings file's `repos` array. Returns null when there is no
// hunt (the caller then changes nothing), else { verdict, counts, sentence }.
export function decideSecurity(repos) {
  if (repos === null || repos === undefined) return null;
  const { verdict, counts, sentence } = judgeSecurity(normalizeSecurity({ repos }));
  return { verdict, counts, sentence };
}

export function decide(repos, qa, security = null) {
  const counts = { Critical: 0, Important: 0, Minor: 0 };
  for (const repo of repos) for (const f of repo.findings) counts[f.severity] += 1;
  const firstCritical = repos.flatMap((r) => r.findings).find((f) => f.severity === 'Critical');
  const securityValue = security ? security.verdict : null;
  const qaValue = qa ? qa.value : null;
  let verdict;
  let sentence;
  if (counts.Critical > 0 || qaValue === 'FAIL' || securityValue === 'FAIL') {
    verdict = 'FAIL';
    const parts = [];
    if (counts.Critical > 0) parts.push(`${plural(counts.Critical, 'Critical finding')} (first: ${firstCritical.title})`);
    if (securityValue === 'FAIL') parts.push(security.sentence);
    if (qaValue === 'FAIL') parts.push('the QA gate failed');
    sentence = parts.join('; ');
  } else if (qaValue === null || qaValue === 'PRECONDITION-FAILED' || qaValue === 'INCOMPLETE') {
    verdict = 'BLOCKED';
    const why = qaValue === null ? 'there is no usable QA verdict' : `the QA gate ended ${qaValue}`;
    sentence = `${why}; the code review found ${plural(counts.Important, 'Important finding')} and ${plural(counts.Minor, 'Minor finding')}`;
    if (security) sentence += `; the vulnerability hunt ended ${securityValue}`;
  } else if (counts.Important > 0 || qaValue === 'PASS-WITH-ISSUES' || securityValue === 'PASS-WITH-ISSUES') {
    verdict = 'PASS-WITH-ISSUES';
    const parts = [];
    if (counts.Important > 0) parts.push(plural(counts.Important, 'Important finding'));
    if (securityValue === 'PASS-WITH-ISSUES') parts.push(security.sentence);
    if (qaValue === 'PASS-WITH-ISSUES') parts.push('the QA gate passed with issues');
    sentence = parts.join('; ');
  } else {
    verdict = 'PASS';
    sentence = counts.Minor > 0 ? `only ${plural(counts.Minor, 'Minor finding')} and a QA pass` : 'no findings and a QA pass';
  }
  // A security INCOMPLETE never blocks; it is named wherever the verdict is explained.
  if (securityValue === 'INCOMPLETE') sentence += `; the vulnerability hunt is INCOMPLETE (${security.sentence})`;
  return { verdict, sentence, counts };
}

const cell = (s) => String(s || '-').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');

function huntFindingBlock(n, f) {
  const where = f.file ? ` \`${f.file}${f.line ? `:${f.line}` : ''}\`` : '';
  const lines = [
    `${n}. **${f.title}**${where} (confidence ${f.confidence}, ${f.verification}${f.category ? `; ${f.category}` : ''})`,
    `   - Description: ${f.description}`,
    `   - Attack path: ${f.attackPath}`,
  ];
  if (f.exploit) lines.push(`   - Exploit: ${f.exploit}`);
  lines.push(`   - Mitigation examined: ${f.mitigationExamined}`, `   - Fix: ${f.fix}`);
  if (f.reason && f.verification !== 'unverified') lines.push(`   - Verification: ${f.reason}`);
  return lines.join('\n');
}

function huntSection(id, hunted, sec, securityReport) {
  const out = ['## Vulnerability hunt and audit', ''];
  if (!hunted) {
    out.push(`> No vulnerability hunt: reviews/${id}/security-findings.json was not found, so the verdict counts no hunt.`, '');
    return out;
  }
  if (securityReport) {
    out.push(`> ${securityReport.line}`, '');
    if (securityReport.value !== sec.verdict) {
      out.push(`> Note: SECURITY-REPORT.md says ${securityReport.value} and the findings file gives ${sec.verdict}; the two disagree, and the verdict above follows the findings file.`, '');
    }
  } else {
    out.push('> SECURITY-REPORT.md was not found or has no verdict line; the verdict above comes from the findings file alone.', '');
  }
  if (sec.counts.unverified > 0) {
    out.push(`> ${plural(sec.counts.unverified, 'High or Medium finding')} below carry no verification and count as plausible (marked unverified).`, '');
  }
  if (hunted.length === 0) out.push('> The vulnerability hunt file lists no repository.', '');
  for (const repo of hunted) {
    out.push(`### ${repo.repo}`, '');
    if (repo.cves.length === 0) out.push('No CVEs reported.', '');
    else {
      out.push('| Package | Version | Advisory | Severity | Fixed in | Runtime |', '|---|---|---|---|---|---|');
      for (const c of repo.cves) out.push(`| ${cell(c.package)} | ${cell(c.version)} | ${cell(c.advisory)} | ${c.severity} | ${cell(c.fixedIn)} | ${c.runtime ? 'runtime' : 'test only'} |`);
      out.push('');
    }
    for (const severity of HUNT_SEVERITIES) {
      out.push(`#### ${severity}`, '');
      const list = repo.findings.filter((f) => f.severity === severity);
      if (list.length === 0) out.push('None.', '');
      else out.push(...list.map((f, i) => huntFindingBlock(i + 1, f) + '\n'));
    }
    out.push('#### Skipped lanes', '', ...(repo.skipped.length ? repo.skipped.map((s) => `- ${s.lane}: ${s.reason}`) : ['None.']), '');
    out.push('#### Discarded leads', '', `${plural(repo.discarded, 'lead')} below confidence ${CONFIDENCE_FLOOR}; rejected by verification: ${repo.rejected}.`, '');
    out.push('#### Files read', '', `${plural(repo.filesRead, 'file')}.`, '');
    out.push('#### Tools used', '');
    if (repo.tools.length === 0) out.push('None.', '');
    else {
      out.push('| Tool | Version | Exit |', '|---|---|---|');
      for (const t of repo.tools) out.push(`| ${cell(t.name)} | ${cell(t.version)} | ${t.exit === '' ? '-' : t.exit} |`);
      out.push('');
    }
    out.push('#### Declined to judge', '', ...(repo.declined.length ? repo.declined.map((s) => `- ${s}`) : ['None.']), '');
  }
  return out;
}

function securitySummary(sec) {
  if (!sec) return 'security: no vulnerability hunt';
  const c = sec.counts;
  return `security: ${sec.verdict} (${c.high} High, ${c.medium} Medium and ${c.low} Low findings; ${plural(c.cves, 'CVE')}, ${c.cvesRuntimeCritical} critical or high in a runtime dependency)`;
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

export function assemble({ id, findings, qaText, securityFindings = null, securityText = null, now = new Date() }) {
  const repos = normalize(findings);
  const hunted = normalizeSecurity(securityFindings);
  const sec = hunted ? judgeSecurity(hunted) : null;
  const qa = parseQaVerdict(qaText);
  const { verdict, sentence, counts } = decide(repos, qa, sec);
  const stamp = now.toISOString().slice(0, 16).replace('T', ' ');
  const out = [];
  out.push(`# Task review — ${id}`, '');
  out.push('| Ticket | ' + id + ' |', '|---|---|', `| Date (UTC) | ${stamp} |`);
  out.push(`| Repositories | ${repos.map((r) => `${r.repo}: ${r.branch} against ${r.base} at ${r.head}`).join('; ') || 'none'} |`);
  out.push('| QA report | [QA-REPORT.md](QA-REPORT.md) |', '');
  out.push(`Verdict: ${verdict} — ${sentence}.`, '');
  out.push('## Summary', '');
  out.push(`${plural(counts.Critical, 'Critical finding')}, ${plural(counts.Important, 'Important finding')} and ${plural(counts.Minor, 'Minor finding')} across ${plural(repos.length, 'repository')}. QA gate: ${qa ? qa.value : 'no verdict'}; ${securitySummary(sec)}. ${sentence}.`, '');
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
  out.push(...huntSection(id, hunted, sec, parseSecurityVerdict(securityText)));
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
  return { verdict, sentence, counts, security: sec && { verdict: sec.verdict, counts: sec.counts, sentence: sec.sentence }, markdown: out.join('\n').replace(/\n{3,}/g, '\n\n').replace(/\n*$/, '\n') };
}

function usage(message) {
  if (message) process.stderr.write(`${message}\n`);
  process.stderr.write('usage: node assemble-review.mjs <ticket> --findings <json> [--qa <QA-REPORT.md>] [--security <json>] [--cwd <dir>]\n');
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
  const securityArg = take('--security');
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
  // A named hunt file must exist; the default one is read when it exists and must then be valid.
  const securityFile = resolve(cwd, securityArg || join('reviews', id, 'security-findings.json'));
  let securityFindings = null;
  if (securityArg || existsSync(securityFile)) {
    try {
      securityFindings = JSON.parse(readFileSync(securityFile, 'utf8').replace(/^﻿/, ''));
    } catch (error) {
      return usage(`ERROR: cannot read the vulnerability hunt file ${securityArg || join('reviews', id, 'security-findings.json')}: ${error.message}`);
    }
  }
  // The hunt's own report is read only to quote its verdict line beside the one computed here.
  const securityReportFile = join(root, 'reviews', id, 'SECURITY-REPORT.md');
  const securityText = securityFindings !== null && existsSync(securityReportFile) ? readFileSync(securityReportFile, 'utf8') : null;
  let result;
  try {
    result = assemble({ id, findings, qaText, securityFindings, securityText });
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
