---
name: qa-lane-2-logs
description: Use when the qa-specialist agent watches container logs live during the UI sweep, scoped to the run's watermark window and filtered against the known-issues noise list, with per-scenario attribution. Gated on qa.containers.watch.
user-invocable: false
---

# Lane 2 — Container logs

## Gate

Active when `qa.containers.watch` names at least one container and `docker ps` at STEP 2 shows
it. Otherwise the lane is `not-covered — qa.containers.watch is empty` (or `— container <name>
not running`), stated in the report; never invent a container name.

## Mechanics

- At STEP 2, extract the noise list once:

  ```bash
  awk '/^```lane2-noise/{f=1;next} f&&/^```/{f=0} f' <ROOT>/<qa.knownIssues> | grep -vE '^(#|$)' > <ROOT>/reviews/<ID>/artifacts/lane2-noise.txt
  ```

- Watermark-scoped reads only, never unbounded:

  ```bash
  docker logs <container> --since <run-state.watermark> 2>&1 | grep -iE '<qa.containers.errorPattern>' | grep -vEf <ROOT>/reviews/<ID>/artifacts/lane2-noise.txt | head -80
  ```

- Read after each scenario cluster and IMMEDIATELY when the UI shows an error state; the
  correlation window is the point of this lane.

## Judging

- Lines matched by the noise list are noise, not findings; a NEW pattern inside a known-noisy
  area IS a finding.
- Attribution duty: every log finding names the scenario, role and language that produced it,
  plus the timestamp. An unattributable error in the window is still a finding, marked
  "unexplained in run window".
- A 5xx or unhandled exception triggered by a normal user action is at least Medium; anything
  security-relevant (auth bypass, a tenant identifier from another tenant in a log line, a secret
  printed) is Critical.

## Evidence

Save the matched lines WITH 3 lines of context to
`reviews/<ID>/artifacts/log-<container>-<finding>.txt` (`.txt`, so it is never git-ignored as a
`.log`) at capture time, and reference the file from the finding. For coverage, save each watched
container's filtered window after the sweep (the command's output, even when empty) to
`log-<container>-window.txt`; without it the lane is not `done`.

## Never

Never restart, stop or "fix" a container to quiet a log (the guardrail denies it; a denial is by
design). Never dump full logs into the report; excerpts only.
