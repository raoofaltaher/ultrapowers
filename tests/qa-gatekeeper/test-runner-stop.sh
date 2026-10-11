#!/usr/bin/env bash
# Tests for tests/qa-gatekeeper/run-tests.sh stopping its suites (#41): the
# ULTRAPOWERS_QA_SUITES override, a TERM to the runner ending the current suite's subtree,
# and the runner ending itself when its parent is gone without a signal (the Windows
# harness stop, `taskkill /T /F` on the wrapper shell, which Cygwin's exec keeps from
# reaching the runner). The parent-death case kills the wrapper with SIGKILL, which
# likewise never reaches the runner, on every platform.
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
RUNNER="$SCRIPT_DIR/run-tests.sh"

FAILURES=0
pass() { echo "  [PASS] $1"; }
fail() { echo "  [FAIL] $1"; FAILURES=$((FAILURES + 1)); }

TEST_ROOT="$(mktemp -d)"
cleanup() {
  for f in "$TEST_ROOT"/*.pid; do
    [[ -f "$f" ]] && kill "$(cat "$f")" 2>/dev/null
  done
  rm -rf "$TEST_ROOT"
}
trap cleanup EXIT

# A suite that records the runner (its parent), itself and a grandchild, then sleeps.
sleeper_suite() {
  # $1 = pid file prefix
  printf '%s' "echo \$PPID >'$1-runner.pid'; echo \$\$ >'$1-suite.pid'; sleep 30 & echo \$! >'$1-grandchild.pid'; wait"
}

wait_for_file() {
  local f="$1"
  for _ in $(seq 1 40); do
    [[ -s "$f" ]] && return 0
    sleep 0.5
  done
  return 1
}

# Polls until every pid in the files is gone; prints the ones still alive after 10s.
wait_gone() {
  local p alive
  for _ in $(seq 1 20); do
    alive=""
    for p in "$@"; do
      kill -0 "$(cat "$p")" 2>/dev/null && alive="$alive $(basename "$p")"
    done
    [[ -z "$alive" ]] && return 0
    sleep 0.5
  done
  echo "$alive"
  return 1
}

echo "runner stop tests"

echo "ULTRAPOWERS_QA_SUITES replaces the suite list"
out="$(ULTRAPOWERS_QA_SUITES=$'true\nfalse\n' bash "$RUNNER" 2>&1)"
code=$?
if [[ "$code" -eq 1 ]] && grep -q '^=== true$' <<<"$out" && grep -q '^QA GATEKEEPER SUITES: 1 failed$' <<<"$out"; then
  pass "override runs its commands and aggregates the exit codes"
else
  fail "override runs its commands and aggregates the exit codes (exit $code): $out"
fi
out="$(ULTRAPOWERS_QA_SUITES='true' bash "$RUNNER" 2>&1)"
if [[ "$out" == $'=== true\nQA GATEKEEPER SUITES: all passed' ]]; then
  pass "a passing list prints the final line only"
else
  fail "a passing list prints the final line only: $out"
fi

echo "a TERM to the runner ends the current suite and its subtree"
p="$TEST_ROOT/term"
ULTRAPOWERS_QA_SUITES="$(sleeper_suite "$p")" bash "$RUNNER" >"$p.log" 2>&1 &
runner=$!
echo "$runner" >"$p-launched.pid"
if wait_for_file "$p-grandchild.pid"; then
  kill -s TERM "$runner"
  wait "$runner" 2>/dev/null
  code=$?
  if left="$(wait_gone "$p-suite.pid" "$p-grandchild.pid")"; then
    pass "suite and grandchild are gone after TERM"
  else
    fail "suite and grandchild are gone after TERM (still alive:$left)"
  fi
  if [[ "$code" -eq 143 ]]; then pass "runner exits 143"; else fail "runner exits 143 (got $code)"; fi
  if ! grep -q '^QA GATEKEEPER SUITES: ' "$p.log"; then
    pass "no final verdict line after a stop"
  else
    fail "no final verdict line after a stop: $(cat "$p.log")"
  fi
else
  fail "sleeper suite started (log: $(cat "$p.log" 2>/dev/null))"
fi

echo "the runner stops when its parent is gone without a signal"
p="$TEST_ROOT/orphan"
ULTRAPOWERS_QA_SUITES="$(sleeper_suite "$p")" bash -c 'bash "$1" >"$2" 2>&1; :' _ "$RUNNER" "$p.log" </dev/null &
wrapper=$!
if wait_for_file "$p-grandchild.pid"; then
  kill -s KILL "$wrapper"
  wait "$wrapper" 2>/dev/null
  if left="$(wait_gone "$p-runner.pid" "$p-suite.pid" "$p-grandchild.pid")"; then
    pass "runner, suite and grandchild are gone after the parent died"
  else
    fail "runner, suite and grandchild are gone after the parent died (still alive:$left)"
  fi
  if grep -q '^QA GATEKEEPER SUITES: parent process [0-9]* is gone, stopping$' "$p.log"; then
    pass "the log says why the runner stopped"
  else
    fail "the log says why the runner stopped: $(cat "$p.log")"
  fi
else
  fail "sleeper suite started under the wrapper (log: $(cat "$p.log" 2>/dev/null))"
fi

if [[ "$FAILURES" -gt 0 ]]; then
  echo "STATUS: FAILED ($FAILURES)"
  exit 1
fi
echo "STATUS: PASSED"
