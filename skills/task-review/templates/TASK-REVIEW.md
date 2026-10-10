# Task review — <ID>

| Ticket | <ID> |
|---|---|
| Date (UTC) | <YYYY-MM-DD HH:MM> |
| Repositories | <repo: branch against base at head sha, n files> |
| QA report | [QA-REPORT.md](QA-REPORT.md) |

Verdict: <PASS | PASS-WITH-ISSUES | FAIL | BLOCKED> — <one sentence naming the deciding finding or the QA verdict>

## Summary

<counts of Critical, Important and Minor findings across the repositories; the QA verdict; what decided the verdict>

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

## QA gate

> <the QA report's Verdict line, copied unchanged>

<each screenshot of the QA report, embedded: ![caption](artifacts/<file>.png)>
