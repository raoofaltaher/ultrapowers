#!/usr/bin/env bash
# Runs every offline suite for the QA gatekeeper (piece 5). Each suite prints its own
# STATUS line; this runner aggregates exit codes.
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$REPO_ROOT" || exit 1

SUITES=(
  "bash tests/qa-gatekeeper/test-templates.sh"
  "bash tests/qa-gatekeeper/test-no-reference-leaks.sh"
  "bash tests/qa-gatekeeper/test-qa-guardrail.sh"
  "bash tests/qa-gatekeeper/test-autopilot-profile.sh"
  "node --test tests/qa-gatekeeper/qa-shell-writes.test.mjs"
  "node --test tests/qa-gatekeeper/judge.test.mjs"
  "bash tests/qa-gatekeeper/test-run-suite.sh"
  "node --test tests/qa-gatekeeper/qa-preflight.test.mjs"
  "bash tests/qa-gatekeeper/test-skill-structure.sh"
  "node --test tests/qa-gatekeeper/check-report.test.mjs"
  "bash tests/qa-gatekeeper/test-sample-app.sh"
)

failed=0
for suite in "${SUITES[@]}"; do
  echo "=== $suite"
  if ! bash -c "$suite"; then
    failed=$((failed + 1))
  fi
done

if [[ "$failed" -gt 0 ]]; then
  echo "QA GATEKEEPER SUITES: $failed failed"
  exit 1
fi
echo "QA GATEKEEPER SUITES: all passed"
