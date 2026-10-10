# Lane 6 troubleshooting

Read this when the judge prints `INCOMPLETE` for a suite. An `INCOMPLETE` suite is not a pass,
and it is not a failing test either: nothing was judged. Do not re-run the suite blindly. Find the
case below that matches the out dir, read the evidence named there, fix the cause, then re-run
the suite once.

Out dir: `reviews/<id>/suites/<repo>/` (the runner writes every marker below into it).

## 1. No results file: the suite ran and wrote nothing the judge reads

The judge reports "suite produced no results" and `exit-code` is `0`.

- The command finished, so it ran, but its results were not written where the judge looks. The
  results must go to `{{out}}` (the out dir), in the format `qa.suites[].resultFormat` names
  (`*.trx`, `*.xml` for JUnit, `*.json` for vitest).
- Check `stdout.txt` for the path the tool reported writing. A path inside the repo is the usual
  cause: the command must write to `{{out}}/...`, not to the repo.
- Fix `qa.suites[].command` in the project config, not the run.

## 2. The runner exited without results: `.failed` is present

`.failed` is written only when the command exits non-zero and no results file exists. It holds
the command as configured, with `{{out}}` still in it, so the reader sees the template and not one
run's path.

- Read `stdout.txt` first. The usual causes: `command not found` (a tool or SDK is not
  installed on this machine), a dependency that was never installed, a compile error, or a runner
  flag that the installed version does not accept (`--reporter`, `--outputFile`).
- Run the command yourself in the repository with `{{out}}` replaced by the out dir, and read the
  same error. Then fix the command or the environment it needs.
- A non-zero exit WITH results is not `.failed`: the tests failed, and the judge compares the
  failing names with the known-issues baseline. That is a result, not an `INCOMPLETE`.

## 3. Aborted or stopped runs

- `finished-at` is missing and `kill -0 <pid>` fails: the runner died. The session ended, the
  machine slept, or the process was killed. Nothing in the out dir is reusable: re-run the suite.
- `stopped-at` is present: the runner was asked to stop. The reason is the last word of the file:
  - `close`: the QA contract stopped the suite at close, because the run was ending before the
    suite finished (STEP 7b). The suite did not fail; it was not waited for. Re-run lane 6 only
    if the run needs this suite's result.
  - `timeout`: the suite ran past `timeoutSec` (`QA_SUITE_TIMEOUT_SEC`). Find the slow or hung
    part in `stdout.txt` before raising `timeoutSec`; a timeout is not a pass.
  - `term`: the runner itself got a TERM signal. Re-run the suite.
- The judge treats an aborted TRX run, or tests that never executed, as `INCOMPLETE`, not as a
  green. A partly written results file is not evidence that the suite passed.

## 4. What each marker means

| File | Written when | Meaning |
|---|---|---|
| `started-at` | the run starts | UTC time the command started |
| `pid` | the run starts | the process-group leader; `kill -0 <pid>` tells whether it is alive |
| `stdout.txt` | the command runs | its stdout and stderr together: read this first |
| `exit-code` | the command ends or is stopped | its exit status; `143` or `137` after a stop |
| `finished-at` | the command ends by itself | absent means still running, died, or stopped |
| `stopped-at` | the runner is asked to stop | `<UTC time> <reason>`; the reason is `close`, `timeout`, `term` or `stop` |
| `.failed` | non-zero exit and no results | the command template, `{{out}}` unexpanded |

## Never

- Never read `INCOMPLETE` as a pass, and never clear it by adding names to the known-issues
  baseline: the baseline suppresses failing names, it does not stand in for a run that did not
  happen.
- Never change `timeoutSec` or the command to make a single run look finished.
