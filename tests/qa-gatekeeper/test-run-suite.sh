#!/usr/bin/env bash
# Tests for skills/qa-lane-6-suites/scripts/run-suite.sh: {{out}} substitution, markers, the
# .failed marker on a crashed suite, and the judge reading that marker as INCOMPLETE.
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
RUNNER="$REPO_ROOT/skills/qa-lane-6-suites/scripts/run-suite.sh"
JUDGE="$REPO_ROOT/skills/qa-lane-6-suites/scripts/judge.mjs"
BASELINE="$SCRIPT_DIR/fixtures/judge/baseline.md"

FAILURES=0
pass() { echo "  [PASS] $1"; }
fail() { echo "  [FAIL] $1"; FAILURES=$((FAILURES + 1)); }

TEST_ROOT="$(mktemp -d)"
cleanup() { rm -rf "$TEST_ROOT"; }
trap cleanup EXIT
mkdir -p "$TEST_ROOT/repo"

echo "run-suite tests"

out1="$TEST_ROOT/out-ok"
bash "$RUNNER" "$TEST_ROOT/repo" "$out1" "printf '%s' '<testsuite><testcase classname=\"a.B\" name=\"c\"><failure/></testcase></testsuite>' > {{out}}/results.xml; pwd > {{out}}/cwd.txt"
if [[ -f "$out1/results.xml" ]]; then pass "command runs with {{out}} substituted"; else fail "command runs with {{out}} substituted"; fi
if [[ "$(cat "$out1/exit-code")" == "0" ]]; then pass "exit-code recorded as 0"; else fail "exit-code recorded as 0 (got $(cat "$out1/exit-code" 2>/dev/null))"; fi
if [[ ! -f "$out1/.failed" ]]; then pass "no .failed marker on success"; else fail "no .failed marker on success"; fi
if [[ -f "$out1/started-at" && -f "$out1/finished-at" ]]; then pass "timestamps written"; else fail "timestamps written"; fi
if grep -q "repo$" "$out1/cwd.txt"; then pass "command runs inside the repo dir"; else fail "command runs inside the repo dir"; fi
if node "$JUDGE" "$out1" "$BASELINE" | grep -q '^NEW-FAILING a\.B\.c$'; then pass "judge reads the produced JUnit file"; else fail "judge reads the produced JUnit file"; fi

out2="$TEST_ROOT/out-crash"
bash "$RUNNER" "$TEST_ROOT/repo" "$out2" "echo booting; exit 3"
if [[ "$(cat "$out2/exit-code")" == "3" ]]; then pass "non-zero exit code recorded"; else fail "non-zero exit code recorded"; fi
if [[ -f "$out2/.failed" ]] && grep -q 'exit 3' "$out2/.failed"; then pass ".failed marker names the command"; else fail ".failed marker names the command"; fi
if grep -q booting "$out2/stdout.txt"; then pass "stdout captured"; else fail "stdout captured"; fi
if node "$JUDGE" "$out2" "$BASELINE" | grep -q '^INCOMPLETE  suite failed to run: '; then pass "judge reports INCOMPLETE for the crashed suite"; else fail "judge reports INCOMPLETE for the crashed suite"; fi

out3="$TEST_ROOT/out-nonzero-with-results"
bash "$RUNNER" "$TEST_ROOT/repo" "$out3" "printf '%s' '{\"testResults\":[]}' > {{out}}/vitest.json; exit 1"
if [[ ! -f "$out3/.failed" ]]; then pass "non-zero exit with results is not marked .failed (failing tests are results)"; else fail "non-zero exit with results is not marked .failed"; fi

rc=0
bash "$RUNNER" "$TEST_ROOT/repo" >/dev/null 2>&1 || rc=$?
if [[ "$rc" -ne 0 ]]; then pass "missing arguments exit non-zero"; else fail "missing arguments exit non-zero"; fi

if [[ "$FAILURES" -gt 0 ]]; then
  echo "STATUS: FAILED ($FAILURES failure(s))"
  exit 1
fi
echo "STATUS: PASSED"
