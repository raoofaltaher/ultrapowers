---
name: windows-node-test-spawn-failures-under-load
description: On Windows under load (several agents or suites running), node's test runner loses dozens of tests of tests/autopilot/autopilot.test.mjs to child-process start failures with exit code 3221225794 (STATUS_DLL_INIT_FAILED); rerun once on a quieter machine before reading a failure as real
metadata:
  type: gotcha
date: 2026-10-13
---
When several subagents or suites run at once on Windows, `node --test tests/autopilot/autopilot.test.mjs` can lose most of its tests from one point onward: every `spawnSync` of the engine fails at the OS level with exit code 3221225794 (0xC0000142, STATUS_DLL_INIT_FAILED) before any script runs. The same file passes 86/86 or 88/88 on a rerun a few minutes later with nothing changed.

**Why:** the failures are process starts refused by Windows under load, not test defects; observed twice on 2026-10-12 and 2026-10-13 (60 of 86 and 59 of 88 tests lost, the first 26 and 7 passing) while three or more agents ran suites in parallel on the same machine.

**How to apply:** when a Windows run of that file reports many failures that all begin at one test and carry exit 3221225794, rerun the file once with nothing else running before treating any of them as real; a single failing test with a real assertion message is a different matter. Related: [[guardrail-suites-run-time-windows]].
