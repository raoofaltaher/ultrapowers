#!/usr/bin/env bash
# Offline tests for the autopilot engine: every *.test.mjs in this directory under node --test.
set -uo pipefail
cd "$(dirname "$0")/../.." || exit 1

failures=0
for t in tests/autopilot/*.test.mjs; do
  echo "== $t"
  if ! node --test "$t"; then
    failures=$((failures + 1))
  fi
done

if [ "$failures" -ne 0 ]; then
  echo "AUTOPILOT SUITES: $failures failed"
  exit 1
fi
echo "AUTOPILOT SUITES: all passed"
