---
name: guardrail-suites-run-time-windows
description: The two guardrail fixture suites take ten minutes or more each on Windows, and tests/qa-gatekeeper/run-tests.sh runs them again, so run the combined runner once at the gate, not per step
metadata:
  type: gotcha
date: 2026-10-10
---
On Windows, `tests/qa-gatekeeper/test-qa-guardrail.sh` and `test-autopilot-profile.sh` each take ten minutes or more, and `tests/qa-gatekeeper/run-tests.sh` runs both again after the unit tests; a review that runs the three in sequence loses half an hour and overruns a ten-minute shell timeout.

**Why:** every fixture starts the hook once (about 550 fixtures across the two suites), and each start spawns bash plus a node process, which is slow on Windows.

**How to apply:** while iterating, run the one unit test file that covers the change (`node --test tests/qa-gatekeeper/qa-shell-writes.test.mjs`, under a second) and at most one fixture suite; run `run-tests.sh` once, at the gate, in the background with a log file.
