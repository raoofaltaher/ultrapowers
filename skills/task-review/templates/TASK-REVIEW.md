# Task review — <ID>

| Ticket | <ID> |
|---|---|
| Date (UTC) | <YYYY-MM-DD HH:MM> |
| Repositories | <repo: branch against base at head sha> |
| QA report | [QA-REPORT.md](QA-REPORT.md) |

Verdict: <PASS | PASS-WITH-ISSUES | FAIL | BLOCKED> — <one sentence naming the deciding finding, the QA verdict or a hunt that ended INCOMPLETE>

## Summary

<counts of Critical, Important and Minor findings across the repositories; the QA verdict; "security: <PASS | PASS-WITH-ISSUES | FAIL | INCOMPLETE> (<c> confirmed critical or high, <m> confirmed medium, <v> needs_validation, <s> committed credentials; <n> CVEs, <r> critical or high in a runtime dependency)", or "security: no vulnerability hunt"; what decided the verdict>

## Code review

### <repo> (<branch> against <base>)

#### Critical

1. **<title>** `<file>:<line>`
   - Problem: <what is wrong and why it matters>
   - Root cause: <cause found by tracing, or "unconfirmed" with what was tried>
   - Fix: <how to fix>

#### Important

#### Minor

#### TDD assessment

<verdict: pass | partial | fail> — <notes: tests present, written first by commit order, testing behavior>

#### Strengths

#### Declined to judge

## Vulnerability hunt and audit

> <the hunt's front page verdict line (SECURITY-REPORT.md), quoted unchanged>

> Note: <printed only when the quoted verdict differs from the verdict computed from the run's records; the run records decide>

<when reviews/<ID>/ holds no run folder, the one line "> No vulnerability hunt: ..." instead of the quoted line and the blocks below>

### <repo>

Run status: <complete, or the run_status and its incomplete_reason>

#### Confirmed findings

##### critical

1. **<title>** `<file>:<line>` — fingerprint `<fingerprint>`, confidence <low | medium | high>
   - Root cause: <root_cause>
   - Trace:
     - <entrypoint | propagation | sink> <file>:<line> <description>
   - Observed result: <execution.observed_result>
   - Remediation: <remediation.strategy, described, not applied>

##### high

##### medium

##### low

##### informational

#### Needs validation

| Title | Trace | Blockers | Validation plan |
|---|---|---|---|
| <title> | <kind file:line → kind file:line> | <blockers> | <local: ...; deployment: ...> |

#### Committed secrets

| File | Line | Rule | Kind | Commit | Source |
|---|---|---|---|---|---|
| <file> | <line> | <rule> | <kind> | <commit> | <source> |

#### CVEs

| Package | Version | Advisory | Severity | Fixed in | Runtime |
|---|---|---|---|---|---|
| <package> | <version> | <GHSA or CVE id> | <critical, high, moderate or low> | <version> | <runtime or test only> |

#### Advisories from research

<Research tools: the tools used, or "Current sources not checked: <reason>.">

| Subject | Version | Advisory | Severity | Affected | Fixed in | Runtime | Status | Verification | Source |
|---|---|---|---|---|---|---|---|---|---|
| <runtime, framework or package> | <version> | <CVE, GHSA or vendor id> | <critical, high, moderate or low> | <affected range> | <version> | <runtime or test only> | <applies, does not apply or unverified> | <confirmed, downgraded or not verified> | <link (date)> |

<Not researched: <subject> (<reason>)>

#### OSINT alerts

| Source | Id | Title |
|---|---|---|
| <source> | <id> | <title> |

#### Notes

<- file:line kind: the note, one line each>

#### Tool lanes

| Lane | Status | Tools (exit) |
|---|---|---|
| <dependencies, secrets or osint> | <status (reason)> | <name version (exit code)> |

#### Cloudflare reports

<- links to run-<N>/<repo>/REPORT.md, FINDINGS-DETAIL.md and NEEDS-VALIDATION.md>

## QA gate

> <the QA report's Verdict line, copied unchanged>

<each screenshot of the QA report, embedded: ![caption](artifacts/<file>.png)>
