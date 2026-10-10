---
name: qa-report
description: Use when the qa-specialist agent writes the QA report at the end of a run, or an INCOMPLETE or PRECONDITION-FAILED report when blocked. The only sanctioned output format for a QA run.
user-invocable: false
---

# qa-report — the report contract

## QA-REPORT.md (write to `<ROOT>/reviews/<ID>/QA-REPORT.md`)

Structure, in order:

1. **Header table** — Ticket, Date (UTC), Frontend URL, Change set (repo: branch, n files),
   Roles covered, Languages covered, Session note (harness, forked or inline), Partner note
   (the invocation text after the ticket, or `none`, and anything in it the run declined, with
   the rule that required declining it).
2. **Verdict line — exactly one, exactly this shape:**
   `Verdict: PASS` | `Verdict: PASS-WITH-ISSUES` | `Verdict: FAIL` | `Verdict: INCOMPLETE` |
   `Verdict: PRECONDITION-FAILED`, followed on the same line by ` — ` and one sentence of
   justification. Never write another line anywhere in the report that starts with `Verdict:`.
3. **Exit criteria checklist** — no open Confirmed Critical · suites run and set-diffed · core
   flows confirmed by a real browser session · known issues documented. Check or cross each,
   with a half-line reason.
4. **Findings** — numbered F1…Fn, each with: severity (Critical, Medium, Minor), dimension,
   classification (Confirmed, False positive, Duplicate, Environment-specific, Accepted risk),
   reproduction steps, expected versus observed, the lane(s) that caught it. **Evidence: embed
   it, never just name it.**
   - Screenshots: a real Markdown image so it renders inline: `![short caption](artifacts/<file>.png)`.
     The leading `!` is what makes a `.png` render as a picture. A bare code path and a plain
     link both render as text, never as the image. Every `.png` you reference uses the `![]()`
     form and is a file you saved under `reviews/<ID>/artifacts/` this run. Put each screenshot
     inside the finding (§4) or the per-lane coverage (§6) whose claim it evidences; the
     dimension matrix (§5) is a table, so write "see F3" there and never put an image in a cell.
   - Text evidence (a query result, a log excerpt, a failing-test list, a content excerpt):
     inline the few relevant lines as a fenced block, save the full capture to
     `artifacts/<name>.txt` AND link it (`[full output](artifacts/<name>.txt)`). The key lines
     must be visible in the report itself.
   False positives stay listed, briefly; they document what was checked.
5. **Dimension matrix results** — the eight dimensions with Pass, Fail or N/A each, plus one line
   of justification ("N/A — no brand block", "N/A — one language").
6. **Per-lane coverage log** — what each of the seven lanes actually did: roles and flows driven
   (with one screenshot per role embedded), containers watched, endpoints probed, database checks
   run, traces read, suites run (repo, duration, judge summary), content judged. Gated or blocked
   lanes as `not-covered — <reason>`, using the reason from the preflight gates or the guardrail
   denial. Under `### Lane 6: Suites`, every suite that STEP 7b stopped gets its own line:
   `Stopped at close: <suite> (<out dir>), stopped <time>`. A suite that finished gets no such line.
7. **Scenarios covered** — the plan rows with their statuses, from run-state.
8. **Root-cause hints** — for correlated findings: probable cause at file, endpoint or query
   level, prioritized.
9. **Known-issues candidates** — new flaky sets, benign noise lines (as `lane2-noise` patterns),
   environment quirks, newly passing suppressed tests (prune suggestions), the read-only role
   when lane 4 fell back: proposed for `<qa.knownIssues>`; your human partner reviews and edits
   the baseline.
10. **Data hygiene** — what test data the run created (disposable identities, records), net state
    change, and what your human partner may want to remove.

### Headings (exact, so the structure is checkable)

The file starts with `# QA report — <ID>`, then the header table (§1), then the verdict line
(§2) on a line of its own. The other sections use exactly these second-level headings, in this
order: `## Exit criteria`, `## Findings`, `## Dimension matrix`, `## Per-lane coverage`,
`## Scenarios covered`, `## Root-cause hints`, `## Known-issues candidates`, `## Data hygiene`.
Under `## Per-lane coverage`, one third-level heading per lane, in order: `### Lane 1: UI`,
`### Lane 2: Logs`, `### Lane 3: API`, `### Lane 4: Database`, `### Lane 5: Observability`,
`### Lane 6: Suites`, `### Lane 7: Generated content`. A gated or blocked lane's first
non-empty line under its heading starts with `not-covered — ` and gives the reason. The
`## Dimension matrix` table has one row per dimension, named exactly as the agent contract
names them: Functional, UX and navigation, Visual and brand, Localization, Access control,
Resilience, Performance-lite, Regression.

An `INCOMPLETE` report additionally lists exactly which plan rows and lanes did not run (from
run-state) and why. A `PRECONDITION-FAILED` report has the title, the header table, the verdict
line and `## Per-lane coverage` only (§1, §2, §6), naming the failed check and its output
under `### Lane 1: UI`; every lane is `not-covered — precondition failed: <check>`. No secrets, tokens or credentials anywhere in the report or the
artifacts. Evidence file names: `<area>-<role>-<lang>-<what>.png`, `log-<container>-<finding>.txt`,
`api-<finding>.txt`, `db-<finding>.txt`, `trace-<finding>.txt`, `content-<finding>.txt`,
`suites-<repo>.txt`, and the per-lane coverage files `log-<container>-window.txt`,
`api-probes.txt`, `db-checks.txt`, `trace-window.txt`, `content-inventory.txt`.

## Final chat line

After writing the report, closing the browser and removing the marker, print exactly one line:
`Verdict: <value> — reviews/<ID>/QA-REPORT.md`. Nothing after it.
