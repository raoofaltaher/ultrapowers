#!/usr/bin/env bash
# Scripts that harnesses or other scripts launch by path must be tracked
# as executable (git mode 100755). Without the bit, Linux and macOS refuse
# to run them: hooks.json starts hooks/run-hook.cmd directly, and task-done
# and task-start call sdd-workspace and task-brief by path.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$REPO_ROOT"

EXPECTED=(
  hooks/run-hook.cmd
  hooks/session-start
  scripts/bump-version.sh
  scripts/lint-shell.sh
  scripts/rename-fork.sh
  skills/brainstorming/scripts/start-server.sh
  skills/brainstorming/scripts/stop-server.sh
  skills/executing-plans/scripts/task-done
  skills/executing-plans/scripts/task-start
  skills/subagent-driven-development/scripts/review-package
  skills/subagent-driven-development/scripts/sdd-workspace
  skills/subagent-driven-development/scripts/task-brief
  skills/systematic-debugging/find-polluter.sh
)

failures=0
echo "executable bits"
for path in "${EXPECTED[@]}"; do
  mode="$(git ls-files -s -- "$path" | awk '{print $1}')"
  if [[ "$mode" == "100755" ]]; then
    echo "  [PASS] $path"
  else
    echo "  [FAIL] $path (mode ${mode:-untracked})"
    failures=$((failures + 1))
  fi
done

echo
if [[ "$failures" -gt 0 ]]; then
  echo "STATUS: FAILED ($failures failure(s))"
  exit 1
fi
echo "STATUS: PASSED"
