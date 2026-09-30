---
name: qa-lane-6-suites
description: Use when the qa-specialist agent runs the configured test suites in the background and judges them strictly by the failing-set difference against the known-issues baseline. Never judge by counts. Gated on qa.suites.
user-invocable: false
---

# Lane 6 — Test suites (background)

## Gate

Active when `qa.suites` has at least one complete entry (`repo`, `command`, `resultFormat`) whose
`repo` names an entry of `repos[]` (the preflight resolved its `path`). Otherwise
`not-covered — qa.suites has no complete entry`.

## Kickoff (STEP 3, before the UI sweep)

For each suite, start the runner in the background and record the pid. Run it as ONE shell
line: each shell invocation is fresh, so `$!` is empty in a later one. Inside the single quotes,
write any single quote of the command as `'\''`:

```bash
mkdir -p <ROOT>/reviews/<ID>/artifacts/suites/<repo> && nohup bash <plugin root>/skills/qa-lane-6-suites/scripts/run-suite.sh <suite.path> <ROOT>/reviews/<ID>/artifacts/suites/<repo> '<suite.command>' > /dev/null 2>&1 & echo $!
```

The runner replaces `{{out}}` in the command with the absolute out dir and exports
`QA_SUITE_OUT`; the command must write its results there in the declared `resultFormat`:

| resultFormat | what the command must produce in `{{out}}` | example command |
|---|---|---|
| `trx` | one or more `*.trx` | `dotnet test --logger "trx;LogFileName={{out}}/results.trx"` |
| `vitest-json` | one or more `*.json` with a `testResults` array | `npx vitest run --reporter=json --outputFile={{out}}/vitest.json` |
| `junit-xml` | one or more `*.xml` with `<testsuite>` | `npx jest --ci --reporters=default --reporters=jest-junit` with `JEST_JUNIT_OUTPUT_DIR={{out}}`, or `pytest --junitxml={{out}}/junit.xml` |

Record in run-state: `suites[] = { repo, pid, outDir: "artifacts/suites/<repo>", startedAt,
timeoutSec, status: "running" }`.

## Collect (STEP 6)

A suite is finished when `<out dir>/finished-at` exists (the runner writes it last; this works
the same on Windows, Linux and macOS). Until then, wait while the elapsed time since `startedAt`
is below `timeoutSec`; give the suites the whole UI sweep plus a grace period. `kill -0 <pid>`
failing while `finished-at` is absent means the runner died: that suite is `INCOMPLETE` at once.
Still running past the timeout → mark that suite `INCOMPLETE` with "timed out after <n>s" and
move on; a slow suite never blocks the report. Then judge with the set-difference tool, never by
eye, never by count:

```bash
node <plugin root>/skills/qa-lane-6-suites/scripts/judge.mjs <ROOT>/reviews/<ID>/artifacts/suites/<repo> <ROOT>/<qa.knownIssues> | tee <ROOT>/reviews/<ID>/artifacts/suites-<repo>.txt
```

The judge prints `NEW-FAILING <name>` (not in the baseline), `SUPPRESSED <name>` (in the
baseline), or `INCOMPLETE ...` when the suite crashed, produced no results or reported a run
that did not finish. Then set that suite's run-state `status` to its final value: `judged` when
the judge's summary line counts new-failing and suppressed names, `INCOMPLETE` otherwise. A
suite is never left `running` once STEP 6 is past.

## Judging rules (the baseline discipline)

- Only **NEW-FAILING names** become findings: default severity Medium, dimension Functional, one
  finding per failure cluster (same root cause = one finding listing its tests). Read the
  runner's `stdout.txt` for the failure messages.
- `INCOMPLETE` is never a pass: record the lane `INCOMPLETE` with the runner's `.failed` content
  and `exit-code`, and list what was pending.
- A red aggregate run proves nothing by itself; the SET is the only signal.
- A NEW-FAILING test in a file the change set touched is a probable regression; one in an
  untouched file is a probable pre-existing failure: still a finding, classified per your
  evidence, and a candidate for the suppress list.
- Newly passing baseline entries (a suppressed name that no longer fails) are good news: list
  them under known-issues candidates as prune suggestions; never silently drop them.

## Evidence

Judge output verbatim in `reviews/<ID>/artifacts/suites-<repo>.txt`; failing test names cited in
the finding; the runner's `stdout.txt`, `exit-code`, `started-at` and `finished-at` stay in the
out dir.
