# Task review — <ID>

| Ticket | <ID> |
|---|---|
| Date (UTC) | <YYYY-MM-DD HH:MM> |
| Repositories | <repo: branch against base at head sha, n files> |
| QA report | [QA-REPORT.md](QA-REPORT.md) |

Verdict: <PASS | PASS-WITH-ISSUES | FAIL | BLOCKED> — <one sentence naming the deciding finding or the QA verdict>

## Summary

<counts of Critical, Important and Minor findings across the repositories; the QA verdict; "security: <PASS | PASS-WITH-ISSUES | FAIL | INCOMPLETE>" with the hunt's High, Medium and Low findings and its CVEs, those critical or high in a runtime dependency counted apart, or "security: no vulnerability hunt"; what decided the verdict>

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

<the vulnerability hunt's own verdict line quoted unchanged, with a note when it differs from the verdict computed from security-findings.json; then one block per hunted repository; when reviews/<ID>/security-findings.json does not exist, the one line "> No vulnerability hunt: ..." instead>

### <repo>

| Package | Version | Advisory | Severity | Fixed in | Runtime |
|---|---|---|---|---|---|
| <package> | <version> | <GHSA or CVE id> | <critical, high, moderate or low> | <version> | <runtime or test only> |

#### Advisories from research

<Research tools: the tools used, or "Current sources not checked: <reason>.">

| Subject | Version | Advisory | Severity | Affected | Fixed in | Runtime | Status | Verification | Source |
|---|---|---|---|---|---|---|---|---|---|
| <runtime, framework or package> | <version> | <CVE, GHSA or vendor id> | <critical, high, moderate or low> | <affected range> | <version> | <runtime or test only> | <applies, does not apply or unverified> | <confirmed, downgraded or not verified> | <link (date)> |

<Not researched: <subject> (<reason>)>

#### High

1. **<title>** `<file>:<line>` (confidence <6-10>, <confirmed | plausible | unverified>; <category>)
   - Description: <what is vulnerable>
   - Attack path: <the source, each hop, the sink>
   - Exploit: <a concrete input, when the hunter gave one>
   - Mitigation examined: <the checks on the way and why they do not stop it>
   - Fix: <how to fix, described, not applied>
   - Verification: <the filter's reason>

#### Medium

#### Low

#### Skipped lanes

<- lane: the hunter's reason, such as no manifest, or no model client library and no prompt template>

#### Discarded leads

<n leads below confidence 6; rejected by verification: m.>

#### Files read

<n files.>

#### Tools used

| Tool | Version | Exit |
|---|---|---|
| <name> | <version> | <exit code> |

#### Declined to judge

<- what the hunters declined to judge, one line each>

## QA gate

> <the QA report's Verdict line, copied unchanged>

<each screenshot of the QA report, embedded: ![caption](artifacts/<file>.png)>
