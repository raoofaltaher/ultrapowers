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
// Carve-out: with no QA report and a project whose `qa` config is blank (as autopilot's qaConfigured),
// the verdict comes from the code review and the hunt alone and the report says "QA: not configured for this project".
//
// Every file it reads (the findings, the QA report, the hunt file and the hunt's report) and the one it writes
// are regular files of the project: a symbolic link or junction, a folder in a file's place, or a reviews or
// reviews/<ticket> that links out of the project is refused (exit 2), never followed.
//
// Exit codes: 0 written; 2 usage, unreadable findings or hunt, or a refused link; 3 no project root; 4 invalid ticket.
import { existsSync, lstatSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { regularFileProblem, reviewFolderProblem } from '../../autopilot/scripts/autopilot-lib.mjs';
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

// Advisories from research (the hunt's STEP 0b): repos[].research, one block per repository,
// { tools, status: checked | not-checked, reason, notResearched[{ subject, reason }], advisories[] }.
// An `applies` row counts in the verdict like a tool CVE of the same severity, once: a row whose
// advisory id (compared without regard to case) is already in this repository's CVE table counts
// through the table. `unverified` and `does-not-apply` rows, and a row the verifier downgraded,
// never count. A research row never stops the review: a severity word the scale does not know shows as
// `unknown`, and an `applies` row with such a severity counts as `unverified`.
const RESEARCH_STATUSES = ['applies', 'does-not-apply', 'unverified'];
const RESEARCH_VERIFICATIONS = ['confirmed', 'downgraded', 'not-verified'];
// The sources' own words, vendor scales among them, on the CVE scale.
const RESEARCH_SEVERITY = { critical: 'critical', high: 'high', important: 'high', moderate: 'moderate', medium: 'moderate', low: 'low' };

function normalizeResearch(raw, cves) {
  if (raw === null || raw === undefined) return null;
  if (typeof raw !== 'object') throw new Error('a research block must be an object');
  const inTable = new Set(cves.map((c) => key(c.advisory)).filter(Boolean));
  const advisories = (Array.isArray(raw.advisories) ? raw.advisories : []).map((a) => {
    const subject = String(a?.subject ?? '(unnamed)');
    // A word the scale does not know never stops the review: the row shows as unverified (or not
    // verified) with the reason, and never counts.
    let status = key(a?.status).replace(/\s+/g, '-');
    let reason = String(a?.reason ?? '');
    if (!RESEARCH_STATUSES.includes(status)) {
      reason = `${reason ? `${reason}; ` : ''}status ${JSON.stringify(String(a?.status ?? ''))} is not one of ${RESEARCH_STATUSES.join(', ')}`;
      status = 'unverified';
    }
    let verification = key(a?.verification).replace(/\s+/g, '-') || 'not-verified';
    if (!RESEARCH_VERIFICATIONS.includes(verification)) {
      reason = `${reason ? `${reason}; ` : ''}verification ${JSON.stringify(String(a?.verification ?? ''))} is not one of ${RESEARCH_VERIFICATIONS.join(', ')}`;
      verification = 'not-verified';
    }
    const severity = RESEARCH_SEVERITY[key(a?.severity)] ?? 'unknown';
    if (severity === 'unknown' && status === 'applies') {
      status = 'unverified';
      reason = `${reason ? `${reason}; ` : ''}severity ${JSON.stringify(String(a?.severity ?? ''))} is not on the scale`;
    }
    const advisory = String(a?.advisory ?? '');
    const alsoReported = advisory && inTable.has(key(advisory)) ? 'the audit tools' : '';
    return {
      subject, version: String(a?.version ?? ''), versionSource: String(a?.versionSource ?? ''), advisory,
      severity, affectedRange: String(a?.affectedRange ?? ''), fixedIn: String(a?.fixedIn ?? ''),
      runtime: a?.runtime !== false, status, reason, source: String(a?.source ?? ''),
      sourceDate: String(a?.sourceDate ?? ''), verification, verificationReason: String(a?.verificationReason ?? ''),
      alsoReported, counted: status === 'applies' && verification !== 'downgraded' && !alsoReported,
    };
  });
  return {
    status: key(raw.status) === 'not-checked' ? 'not-checked' : 'checked',
    reason: String(raw.reason ?? ''),
    tools: (Array.isArray(raw.tools) ? raw.tools : []).map(String),
    notResearched: (Array.isArray(raw.notResearched) ? raw.notResearched : []).map((n) => ({ subject: String(n?.subject ?? ''), reason: String(n?.reason ?? '') })),
    advisories,
  };
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
        const title = String(f?.title ?? '(untitled)');
        // A missing, blank or non-numeric confidence is an error, never a discarded lead: that would
        // fail open (Number('  ') is 0).
        const raw = f?.confidence;
        const blank = raw === null || raw === undefined || (typeof raw === 'string' && raw.trim() === '');
        const confidence = blank || typeof raw === 'boolean' ? NaN : Number(raw);
        if (!Number.isFinite(confidence)) throw new Error(`security finding ${JSON.stringify(title)} has no numeric confidence`);
        if (confidence < CONFIDENCE_FLOOR) { discarded += 1; continue; }
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
        // The same advisory from two lanes is one row; it is runtime when either lane says so, and it
        // keeps the highest severity reported, with that report's fixedIn and proof.
        const id = `${entry.package}@${entry.version}#${entry.advisory}`;
        const seen = cves.get(id);
        const runtime = entry.runtime || Boolean(seen?.runtime);
        const kept = seen && CVE_SEVERITIES.indexOf(seen.severity) < CVE_SEVERITIES.indexOf(entry.severity) ? seen : entry;
        cves.set(id, { ...kept, runtime });
      }
    }
    const cveRows = [...cves.values()];
    return {
      repo: String(block.repo ?? `repo-${i + 1}`), findings, cves: cveRows, research: normalizeResearch(block.research, cveRows), skipped, tools, declined: [...declined],
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
  const counts = { high: 0, medium: 0, low: 0, cves: 0, cvesRuntimeCritical: 0, cvesRuntimeModerate: 0, cvesTestOnlyCritical: 0, unverified: 0,
    researchRuntimeCritical: 0, researchRuntimeModerate: 0, researchTestOnlyCritical: 0 };
  const findings = hunted.flatMap((r) => r.findings);
  const cves = hunted.flatMap((r) => r.cves);
  const researched = hunted.flatMap((r) => (r.research ? r.research.advisories : [])).filter((a) => a.counted);
  for (const a of researched) {
    if (a.runtime && severe(a)) counts.researchRuntimeCritical += 1;
    else if (a.runtime && a.severity === 'moderate') counts.researchRuntimeModerate += 1;
    else if (!a.runtime && severe(a)) counts.researchTestOnlyCritical += 1;
  }
  const advisoriesFromResearch = (n) => `${n === 1 ? 'advisory' : 'advisories'} from research`;
  const advisoryName = (a) => `${a.subject} ${a.version}${a.advisory ? `, ${a.advisory}` : ''}`;
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
  if (counts.high > 0 || counts.cvesRuntimeCritical > 0 || counts.researchRuntimeCritical > 0) {
    verdict = 'FAIL';
    if (counts.high > 0) parts.push(`${plural(counts.high, 'High security finding')} (first: ${findings.find((f) => f.severity === 'High').title})`);
    if (counts.cvesRuntimeCritical > 0) parts.push(`${plural(counts.cvesRuntimeCritical, 'critical or high CVE')} in a runtime dependency (first: ${cveName(cves.find((c) => c.runtime && severe(c)))})`);
    if (counts.researchRuntimeCritical > 0) parts.push(`${counts.researchRuntimeCritical} critical or high ${advisoriesFromResearch(counts.researchRuntimeCritical)} in a runtime (first: ${advisoryName(researched.find((a) => a.runtime && severe(a)))})`);
  } else if (counts.medium > 0 || counts.cvesRuntimeModerate > 0 || counts.cvesTestOnlyCritical > 0
    || counts.researchRuntimeModerate > 0 || counts.researchTestOnlyCritical > 0) {
    verdict = 'PASS-WITH-ISSUES';
    if (counts.medium > 0) parts.push(plural(counts.medium, 'Medium security finding'));
    if (counts.cvesRuntimeModerate > 0) parts.push(`${plural(counts.cvesRuntimeModerate, 'moderate CVE')} in a runtime dependency`);
    if (counts.cvesTestOnlyCritical > 0) parts.push(`${plural(counts.cvesTestOnlyCritical, 'critical or high CVE')} in a test-only dependency`);
    if (counts.researchRuntimeModerate > 0) parts.push(`${counts.researchRuntimeModerate} moderate ${advisoriesFromResearch(counts.researchRuntimeModerate)} in a runtime`);
    if (counts.researchTestOnlyCritical > 0) parts.push(`${counts.researchTestOnlyCritical} critical or high ${advisoriesFromResearch(counts.researchTestOnlyCritical)} in a test-only dependency`);
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

export function decide(repos, qa, security = null, { qaConfigured = true } = {}) {
  const counts = { Critical: 0, Important: 0, Minor: 0 };
  for (const repo of repos) for (const f of repo.findings) counts[f.severity] += 1;
  const firstCritical = repos.flatMap((r) => r.findings).find((f) => f.severity === 'Critical');
  const securityValue = security ? security.verdict : null;
  const qaValue = qa ? qa.value : null;
  const qaSkipped = qaValue === null && !qaConfigured;
  let verdict;
  let sentence;
  if (counts.Critical > 0 || qaValue === 'FAIL' || securityValue === 'FAIL') {
    verdict = 'FAIL';
    const parts = [];
    if (counts.Critical > 0) parts.push(`${plural(counts.Critical, 'Critical finding')} (first: ${firstCritical.title})`);
    if (securityValue === 'FAIL') parts.push(security.sentence);
    if (qaValue === 'FAIL') parts.push('the QA gate failed');
    sentence = parts.join('; ');
  } else if (!qaSkipped && (qaValue === null || qaValue === 'PRECONDITION-FAILED' || qaValue === 'INCOMPLETE')) {
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
    sentence = qaSkipped
      ? (counts.Minor > 0 ? `only ${plural(counts.Minor, 'Minor finding')}` : 'no findings')
      : (counts.Minor > 0 ? `only ${plural(counts.Minor, 'Minor finding')} and a QA pass` : 'no findings and a QA pass');
  }
  // A security INCOMPLETE never blocks; it is named wherever the verdict is explained.
  if (qaSkipped) sentence += '; QA: not configured for this project';
  if (securityValue === 'INCOMPLETE') sentence += `; the vulnerability hunt is INCOMPLETE (${security.sentence})`;
  return { verdict, sentence, counts };
}

const cell = (s) => String(s || '-').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');

// The `#### Advisories from research` block of one repository.
function researchSection(research) {
  const out = ['#### Advisories from research', ''];
  if (!research) return [...out, 'Current sources not checked: the hunt recorded no research.', ''];
  if (research.status === 'not-checked') out.push(`Current sources not checked: ${(research.reason || 'no reason recorded').replace(/\.$/, '')}.`, '');
  else out.push(`Research tools: ${research.tools.length ? research.tools.join(', ') : 'none named'}.`, '');
  if (research.advisories.length) {
    out.push('| Subject | Version | Advisory | Severity | Affected | Fixed in | Runtime | Status | Verification | Source |', '|---|---|---|---|---|---|---|---|---|---|');
    for (const a of research.advisories) {
      const status = a.status === 'does-not-apply' ? 'does not apply' : a.status;
      const verification = (a.verification === 'not-verified' ? 'not verified' : a.verification) + (a.alsoReported ? `; also reported by ${a.alsoReported}` : '');
      const source = a.source ? `${a.source}${a.sourceDate ? ` (${a.sourceDate})` : ''}` : '';
      out.push(`| ${cell(a.subject)} | ${cell(a.version)} | ${cell(a.advisory)} | ${a.severity} | ${cell(a.affectedRange)} | ${cell(a.fixedIn)} | ${a.runtime ? 'runtime' : 'test only'} | ${status} | ${cell(verification)} | ${cell(source)} |`);
    }
    out.push('');
    // Why a row does not count, in a line of its own: the table has no room for a reason.
    for (const a of research.advisories) {
      if (a.status === 'unverified' && a.reason) out.push(`Unverified: ${a.subject} ${a.version}${a.advisory ? `, ${a.advisory}` : ''}: ${a.reason}`);
    }
    if (research.advisories.some((a) => a.status === 'unverified' && a.reason)) out.push('');
  } else if (research.status === 'checked') out.push('No advisory found.', '');
  for (const n of research.notResearched) out.push(`Not researched: ${n.subject} (${n.reason})`);
  if (research.notResearched.length) out.push('');
  return out;
}

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
    out.push(...researchSection(repo.research));
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
  const research = c.researchRuntimeCritical + c.researchRuntimeModerate + c.researchTestOnlyCritical;
  const researchPart = research > 0
    ? `; ${research} ${research === 1 ? 'advisory' : 'advisories'} from research that ${research === 1 ? 'applies' : 'apply'}, ${c.researchRuntimeCritical} critical or high advisory from research in a runtime`
    : '';
  return `security: ${sec.verdict} (${c.high} High, ${c.medium} Medium and ${c.low} Low findings; ${plural(c.cves, 'CVE')}, ${c.cvesRuntimeCritical} critical or high in a runtime dependency${researchPart})`;
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

export function assemble({ id, findings, qaText, securityFindings = null, securityText = null, qaConfigured = true, now = new Date() }) {
  const repos = normalize(findings);
  const hunted = normalizeSecurity(securityFindings);
  const sec = hunted ? judgeSecurity(hunted) : null;
  const qa = parseQaVerdict(qaText);
  const { verdict, sentence, counts } = decide(repos, qa, sec, { qaConfigured });
  const qaSkipped = !qa && !qaConfigured;
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
  out.push(...huntSection(id, hunted, sec, parseSecurityVerdict(securityText)));
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
  return { verdict, sentence, counts, security: sec && { verdict: sec.verdict, counts: sec.counts, sentence: sec.sentence }, markdown: out.join('\n').replace(/\n{3,}/g, '\n\n').replace(/\n*$/, '\n') };
}

// Mirrors qaConfigured(marker) in skills/autopilot/scripts/autopilot.mjs.
const qaConfiguredIn = (qa) => Boolean(qa && typeof qa === 'object' && qa.urls && Object.values(qa.urls).some((v) => typeof v === 'string' && v.trim()));

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
  let qaConfigured = true;
  try {
    const config = JSON.parse(readFileSync(join(root, '.agents', 'ultrapowers.json'), 'utf8').replace(/^﻿/, ''));
    if (typeof config.ticketPattern === 'string' && config.ticketPattern.trim()) pattern = config.ticketPattern;
    qaConfigured = qaConfiguredIn(config.qa);
  } catch {
    process.stderr.write('ERROR: .agents/ultrapowers.json is not valid JSON\n');
    return 3;
  }
  // A leading _ marks a template folder such as reviews/_template, as in ticket-lib.sh.
  if (/^(\.|\.\.|[-_].*)$/.test(id) || /[/\\\s]/.test(id) || !new RegExp(pattern).test(id)) {
    process.stderr.write(`ERROR: ticket ${JSON.stringify(id)} is not a plain folder name matching ticketPattern ${pattern}\n`);
    return 4;
  }
  // The review folder is a real folder of the project before anything in it is read or written: neither reviews
  // nor reviews/<ticket> may be a link out of it.
  const folderProblem = lstatSync(join(root, 'reviews'), { throwIfNoEntry: false })?.isSymbolicLink()
    ? 'reviews is a symbolic link or junction, not a folder of the project'
    : reviewFolderProblem(root, id);
  if (folderProblem) return usage(`ERROR: ${folderProblem}; nothing was read or written`);
  const refused = (file, label) => {
    const problem = regularFileProblem(file, label);
    return problem ? usage(`ERROR: ${problem}; nothing was written`) : 0;
  };
  let findings;
  const findingsFile = resolve(cwd, findingsPath);
  if (regularFileProblem(findingsFile, findingsPath)) return refused(findingsFile, findingsPath);
  try {
    findings = JSON.parse(readFileSync(findingsFile, 'utf8').replace(/^﻿/, ''));
  } catch (error) {
    return usage(`ERROR: cannot read the findings file ${findingsPath}: ${error.message}`);
  }
  const qaFile = resolve(cwd, qaArg || join('reviews', id, 'QA-REPORT.md'));
  if (regularFileProblem(qaFile, qaArg || `reviews/${id}/QA-REPORT.md`)) return refused(qaFile, qaArg || `reviews/${id}/QA-REPORT.md`);
  const qaText = existsSync(qaFile) ? readFileSync(qaFile, 'utf8') : null;
  // A named hunt file must exist; the default one is read when it exists and must then be valid.
  const securityFile = resolve(cwd, securityArg || join('reviews', id, 'security-findings.json'));
  let securityFindings = null;
  if (regularFileProblem(securityFile, securityArg || `reviews/${id}/security-findings.json`)) return refused(securityFile, securityArg || `reviews/${id}/security-findings.json`);
  if (securityArg || existsSync(securityFile)) {
    try {
      securityFindings = JSON.parse(readFileSync(securityFile, 'utf8').replace(/^﻿/, ''));
    } catch (error) {
      return usage(`ERROR: cannot read the vulnerability hunt file ${securityArg || join('reviews', id, 'security-findings.json')}: ${error.message}`);
    }
  }
  // The hunt's own report is read only to quote its verdict line beside the one computed here.
  const securityReportFile = join(root, 'reviews', id, 'SECURITY-REPORT.md');
  if (securityFindings !== null && regularFileProblem(securityReportFile, `reviews/${id}/SECURITY-REPORT.md`)) return refused(securityReportFile, `reviews/${id}/SECURITY-REPORT.md`);
  const securityText = securityFindings !== null && existsSync(securityReportFile) ? readFileSync(securityReportFile, 'utf8') : null;
  let result;
  try {
    result = assemble({ id, findings, qaText, securityFindings, securityText, qaConfigured });
  } catch (error) {
    return usage(`ERROR: ${error.message}`);
  }
  const target = join(root, 'reviews', id, 'TASK-REVIEW.md');
  if (regularFileProblem(target, `reviews/${id}/TASK-REVIEW.md`)) return refused(target, `reviews/${id}/TASK-REVIEW.md`);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, result.markdown);
  process.stdout.write(`Verdict: ${result.verdict} — ${result.sentence}.\nwrote reviews/${id}/TASK-REVIEW.md\n`);
  return 0;
}

if (process.argv[1] && basename(process.argv[1]) === 'assemble-review.mjs') {
  process.exit(main(process.argv.slice(2)));
}
