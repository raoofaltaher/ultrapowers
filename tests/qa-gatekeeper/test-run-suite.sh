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

# A Windows home directory holds a space; {{out}} must stay one word whether the command
# leaves it bare, puts it inside double quotes, or passes it as an argument.
out4="$TEST_ROOT/out with space & more"
bash "$RUNNER" "$TEST_ROOT/repo" "$out4" "printf a > {{out}}/bare.txt; printf b > \"{{out}}/quoted.txt\"; touch {{out}}/arg.txt"
if [[ -f "$out4/bare.txt" && -f "$out4/quoted.txt" && -f "$out4/arg.txt" ]]; then
  pass "{{out}} holding a space and & stays one path, bare, quoted or as an argument"
else
  fail "{{out}} holding a space and & stays one path, bare, quoted or as an argument"
  ls -A "$out4" | sed 's/^/    /'
fi

out5="$TEST_ROOT/out with 'quotes' too"
bash "$RUNNER" "$TEST_ROOT/repo" "$out5" "printf s > '{{out}}/single.txt'; A='-a -b'; printf '[%s]' \$A > {{out}}/split.txt"
if [[ -f "$out5/single.txt" ]]; then pass "{{out}} inside single quotes is the literal path"; else fail "{{out}} inside single quotes is the literal path"; ls -A "$out5" | sed 's/^/    /'; fi
if [[ "$(cat "$out5/split.txt" 2>/dev/null)" == "[-a][-b]" ]]; then pass "an unquoted variable in the command still word-splits"; else fail "an unquoted variable in the command still word-splits (got $(cat "$out5/split.txt" 2>/dev/null))"; fi

# A re-run reuses the same out dir: nothing from the previous run may be read as this run's.
out6="$TEST_ROOT/out-rerun"
bash "$RUNNER" "$TEST_ROOT/repo" "$out6" "printf '%s' '<testsuite><testcase classname=\"a.B\" name=\"old\"><failure/></testcase></testsuite>' > {{out}}/old.xml; exit 3"
bash "$RUNNER" "$TEST_ROOT/repo" "$out6" "exit 3"
if [[ -f "$out6/.failed" ]]; then pass "setup: the second crash is marked .failed"; else fail "setup: the second crash is marked .failed"; fi
bash "$RUNNER" "$TEST_ROOT/repo" "$out6" "if [ -e {{out}}/finished-at ]; then echo stale; else echo fresh; fi > {{out}}/probe.txt; printf '%s' '<testsuite><testcase classname=\"a.B\" name=\"new\"/></testsuite>' > {{out}}/new.xml"
if [[ ! -f "$out6/.failed" ]]; then pass "a clean re-run clears the previous .failed marker"; else fail "a clean re-run clears the previous .failed marker"; fi
if [[ "$(cat "$out6/probe.txt" 2>/dev/null)" == "fresh" ]]; then pass "the previous finished-at is gone while the new run is going"; else fail "the previous finished-at is gone while the new run is going"; fi
if [[ ! -f "$out6/old.xml" ]]; then pass "results from the previous run are not judged again"; else fail "results from the previous run are not judged again"; fi

# --- process group, pid file and --stop (#4). Each child would write late.json after 8 s
# unless the group is stopped; the wrapper returns only once its child has ended, so the
# absence of late.json is checked after the wrapper is reaped.
snap() { (cd "$1" && find . -type f | sort | while read -r f; do cksum "$f"; done); }
stop_repo="$TEST_ROOT/stop-repo"
mkdir -p "$stop_repo"

out_sh="$TEST_ROOT/out-stop-sh"
bash "$RUNNER" "$stop_repo" "$out_sh" 'sh -c "sleep 8; echo x > {{out}}/late.json"' &
runner_pid=$!
sleep 1
if [[ -s "$out_sh/pid" ]]; then pass "pid file written while the suite runs"; else fail "pid file written while the suite runs"; fi
rc=0
bash "$RUNNER" --stop "$out_sh" >/dev/null 2>&1 || rc=$?
wait "$runner_pid" 2>/dev/null
if [[ "$rc" -eq 0 ]]; then pass "--stop exits 0 on a live suite"; else fail "--stop exits 0 on a live suite (got $rc)"; fi
if [[ -f "$out_sh/stopped-at" && ! -f "$out_sh/late.json" ]]; then pass "--stop ends a Git Bash sh child: stopped-at written, late write never happens"; else fail "--stop ends a Git Bash sh child: stopped-at written, late write never happens"; fi

out_node="$TEST_ROOT/out-stop-node"
bash "$RUNNER" "$stop_repo" "$out_node" 'node -e "setTimeout(()=>require(\"fs\").writeFileSync(process.env.QA_SUITE_OUT+\"/late.json\",\"x\"),8000)"' &
runner_pid=$!
sleep 2
bash "$RUNNER" --stop "$out_node" >/dev/null 2>&1
wait "$runner_pid" 2>/dev/null
if [[ -f "$out_node/stopped-at" && ! -f "$out_node/late.json" ]]; then pass "--stop ends a native node child"; else fail "--stop ends a native node child"; fi

out_to="$TEST_ROOT/out-timeout"
QA_SUITE_TIMEOUT_SEC=1 bash "$RUNNER" "$stop_repo" "$out_to" 'sleep 8; echo x > {{out}}/late.json' &
runner_pid=$!
wait "$runner_pid" 2>/dev/null
if grep -q timeout "$out_to/stopped-at" 2>/dev/null && [[ ! -f "$out_to/late.json" ]]; then pass "QA_SUITE_TIMEOUT_SEC stops the suite and writes stopped-at with the reason timeout"; else fail "QA_SUITE_TIMEOUT_SEC stops the suite and writes stopped-at with the reason timeout"; fi

out_done="$TEST_ROOT/out-finished"
bash "$RUNNER" "$stop_repo" "$out_done" "echo done > {{out}}/done.txt"
before="$(snap "$out_done")"
rc=0
bash "$RUNNER" --stop "$out_done" >/dev/null 2>&1 || rc=$?
after="$(snap "$out_done")"
if [[ "$rc" -eq 0 && "$before" == "$after" ]]; then pass "--stop on a finished suite exits 0 and leaves the out dir untouched"; else fail "--stop on a finished suite exits 0 and leaves the out dir untouched (rc $rc)"; fi

out_idle="$TEST_ROOT/out-idle"
mkdir -p "$out_idle"
rc=0
bash "$RUNNER" --stop "$out_idle" >/dev/null 2>&1 || rc=$?
if [[ "$rc" -eq 0 && -f "$out_idle/stopped-at" ]]; then pass "--stop exits 0 when nothing is alive"; else fail "--stop exits 0 when nothing is alive (rc $rc)"; fi

rc=0
bash "$RUNNER" "$TEST_ROOT/repo" >/dev/null 2>&1 || rc=$?
if [[ "$rc" -ne 0 ]]; then pass "missing arguments exit non-zero"; else fail "missing arguments exit non-zero"; fi

if [[ "$FAILURES" -gt 0 ]]; then
  echo "STATUS: FAILED ($FAILURES failure(s))"
  exit 1
fi
echo "STATUS: PASSED"
