#!/usr/bin/env bash
# Runs every offline suite for the QA gatekeeper (piece 5). Each suite prints its own
# STATUS line; this runner aggregates exit codes.
#
# Stopping the runner stops its suites (#41). Two paths end the current suite's whole
# subtree (the `bash -c` child, the suite script and the hook or node processes it starts):
#   1. A signal to the runner (INT, TERM or HUP: Ctrl-C, `kill`, a harness on Linux). The trap
#      sends TERM to the suite's process group, then re-raises the signal.
#   2. The runner's parent going away without a signal. On Windows (Git Bash, MSYS/Cygwin)
#      a harness stops a background shell with `taskkill /PID <shell> /T /F`; that walks
#      Windows parent ids, but Cygwin's exec leaves every exec'd process under a dead
#      intermediary, so the tree kill ends the wrapper shell only and the runner never
#      hears of it. A watchdog polls the parent and sends the runner TERM when it is gone.
# Each suite runs in its own process group (set -m) so that one `kill -- -<pgid>` reaches
# its whole subtree. Consequence of path 2: the runner does not outlive the shell that
# started it (no `nohup ... &` then closing the shell); run it from a shell that stays.
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$REPO_ROOT" || exit 1

SUITES=(
  "bash tests/qa-gatekeeper/test-templates.sh"
  "bash tests/qa-gatekeeper/test-no-reference-leaks.sh"
  "bash tests/qa-gatekeeper/test-qa-guardrail.sh"
  "bash tests/qa-gatekeeper/test-autopilot-profile.sh"
  "bash tests/qa-gatekeeper/test-hunt-profile.sh"
  "node --test tests/qa-gatekeeper/qa-shell-writes.test.mjs"
  "node --test tests/qa-gatekeeper/guard-paths.test.mjs"
  "node --test tests/qa-gatekeeper/judge.test.mjs"
  "bash tests/qa-gatekeeper/test-run-suite.sh"
  "node --test tests/qa-gatekeeper/qa-preflight.test.mjs"
  "bash tests/qa-gatekeeper/test-skill-structure.sh"
  "node --test tests/qa-gatekeeper/check-report.test.mjs"
  "bash tests/qa-gatekeeper/test-runner-stop.sh"
  "bash tests/qa-gatekeeper/test-sample-app.sh"
)
# ULTRAPOWERS_QA_SUITES (one command per line) replaces the list; test-runner-stop.sh uses it.
if [[ -n "${ULTRAPOWERS_QA_SUITES:-}" ]]; then
  mapfile -t SUITES < <(printf '%s\n' "$ULTRAPOWERS_QA_SUITES" | grep -v '^[[:space:]]*$')
fi

child=
watchdog=
on_signal() {
  local sig="$1"
  if [[ -n "$child" ]]; then
    kill -s TERM -- "-$child" 2>/dev/null || kill -s TERM "$child" 2>/dev/null
  fi
  [[ -n "$watchdog" ]] && kill "$watchdog" 2>/dev/null
  trap - "$sig"
  kill -s "$sig" $$
}
trap 'on_signal INT' INT
trap 'on_signal TERM' TERM
trap 'on_signal HUP' HUP

if [[ "$PPID" -gt 1 ]]; then
  parent=$PPID
  (
    while kill -0 "$parent" 2>/dev/null; do sleep 1; done
    echo "QA GATEKEEPER SUITES: parent process $parent is gone, stopping" >&2
    kill -s TERM "$$" 2>/dev/null
  ) &
  watchdog=$!
fi

set -m
failed=0
for suite in "${SUITES[@]}"; do
  echo "=== $suite"
  bash -c "$suite" &
  child=$!
  if ! wait "$child"; then
    failed=$((failed + 1))
  fi
  child=
done
set +m
[[ -n "$watchdog" ]] && kill "$watchdog" 2>/dev/null

if [[ "$failed" -gt 0 ]]; then
  echo "QA GATEKEEPER SUITES: $failed failed"
  exit 1
fi
echo "QA GATEKEEPER SUITES: all passed"
