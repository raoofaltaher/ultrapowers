#!/usr/bin/env bash
# Fixture-driven tests for the autopilot profile of hooks/qa-guardrail.
# Pass 1: .ultrapowers/autopilot-active present -> deny_* cases exit 2 with an
#         AUTOPILOT-GUARDRAIL DENY line, allow_* cases exit 0.
# Pass 2: both markers present -> the QA profile wins: `git commit` is denied with the QA prefix.
# Pass 3: no marker -> every case exits 0 and prints nothing.
# Cases live in fixtures/autopilot/cases.json: [{ name, event }], with {{ROOT}} (POSIX path of
# the temp project) and {{ELSEWHERE}} (a sibling directory outside it) substituted.
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
HOOK="$REPO_ROOT/hooks/qa-guardrail"
CASES="$SCRIPT_DIR/fixtures/autopilot/cases.json"

export MSYS_NO_PATHCONV=1
shopt -u patsub_replacement 2>/dev/null || true

FAILURES=0
pass() { echo "  [PASS] $1"; }
fail() { echo "  [FAIL] $1"; FAILURES=$((FAILURES + 1)); }

TEST_ROOT="$(mktemp -d)"
cleanup() { rm -rf "$TEST_ROOT"; }
trap cleanup EXIT

ROOT="$TEST_ROOT/project"
ELSEWHERE="$TEST_ROOT/elsewhere"
mkdir -p "$ROOT/.agents" "$ROOT/.ultrapowers" "$ROOT/tasks/GH-16" "$ROOT/specs/GH-16" "$ROOT/repo-a/src" "$ROOT/.github/workflows" "$ELSEWHERE"
cat > "$ROOT/.agents/ultrapowers.json" <<'JSON'
{
  "name": "sample",
  "pluginVersion": "1.0.0",
  "topology": "nested",
  "repos": [ { "name": "repo-a", "path": "repo-a", "defaultBranch": "main" } ],
  "autopilot": { "mode": "gated" },
  "qa": {
    "urls": { "frontend": "http://localhost:3000", "backendHealth": "http://localhost:8080/health", "idp": "", "observability": "" },
    "hosts": { "allowed": ["localhost", "127.0.0.1"], "forbidden": ["prod.example.com"] }
  }
}
JSON
MARKER="$ROOT/.ultrapowers/autopilot-active"
QA_MARKER="$ROOT/.ultrapowers/qa-active"
printf '%s' '{"ticket":"GH-16","branch":"GH-16-x","scope":["repo-a"]}' > "$MARKER"

# Node on Windows needs a mixed path for the cases file; the events keep the POSIX root.
CASES_NODE="$CASES"
if command -v cygpath >/dev/null 2>&1; then CASES_NODE="$(cygpath -m "$CASES" 2>/dev/null || printf '%s' "$CASES")"; fi

# One case per line: name<TAB>event JSON, with the placeholders substituted.
case_lines() {
  node -e '
const fs = require("node:fs");
const [file, root, elsewhere] = process.argv.slice(1);
for (const c of JSON.parse(fs.readFileSync(file, "utf8"))) {
  const text = JSON.stringify(c.event).split("{{ROOT}}").join(root).split("{{ELSEWHERE}}").join(elsewhere);
  process.stdout.write(`${c.name}\t${text}\n`);
}' "$CASES_NODE" "$ROOT" "$ELSEWHERE"
}

run_hook() {
  # $1 event, $2 working dir; prints "<code>|<stderr>|<stdout>"
  local event="$1" dir="$2" out err code
  out="$(cd "$dir" && printf '%s' "$event" | bash "$HOOK" 2>"$TEST_ROOT/stderr.txt")"
  code=$?
  err="$(cat "$TEST_ROOT/stderr.txt")"
  printf '%s|%s|%s' "$code" "$err" "$out"
}

echo "autopilot profile: marker present"
count=0
while IFS=$'\t' read -r name event; do
  [ -n "$name" ] || continue
  count=$((count + 1))
  result="$(run_hook "$event" "$ROOT")"
  code="${result%%|*}"
  rest="${result#*|}"
  err="${rest%%|*}"
  case "$name" in
    deny_*)
      if [[ "$code" -eq 2 ]] && printf '%s' "$err" | grep -q '^AUTOPILOT-GUARDRAIL DENY: '; then
        pass "$name denied"
      else
        fail "$name denied (exit $code, stderr: $err)"
      fi ;;
    allow_*)
      if [[ "$code" -eq 0 ]]; then
        pass "$name allowed"
      else
        fail "$name allowed (exit $code, stderr: $err)"
      fi ;;
    *) fail "$name has no deny_/allow_ prefix" ;;
  esac
done < <(case_lines)
if [[ "$count" -lt 30 ]]; then
  fail "expected at least 30 cases, found $count"
fi

echo "autopilot profile: both markers present, the QA profile wins"
printf '%s' "GH-16" > "$QA_MARKER"
result="$(run_hook '{"tool_name":"Bash","tool_input":{"command":"git commit -m x"}}' "$ROOT")"
code="${result%%|*}"
rest="${result#*|}"
err="${rest%%|*}"
if [[ "$code" -eq 2 ]] && printf '%s' "$err" | grep -q '^QA-GUARDRAIL DENY: '; then
  pass "git commit is denied by the QA rules when both markers exist"
else
  fail "git commit is denied by the QA rules when both markers exist (exit $code, stderr: $err)"
fi
result="$(run_hook "{\"tool_name\":\"Write\",\"tool_input\":{\"file_path\":\"$ROOT/repo-a/src/x.ts\",\"content\":\"x\"}}" "$ROOT")"
code="${result%%|*}"
if [[ "$code" -eq 2 ]]; then
  pass "a code write is denied by the QA rules when both markers exist"
else
  fail "a code write is denied by the QA rules when both markers exist (exit $code)"
fi
rm -f "$QA_MARKER"

echo "autopilot profile: no marker, everything passes silently"
rm -f "$MARKER"
silent=0
while IFS=$'\t' read -r name event; do
  [ -n "$name" ] || continue
  result="$(run_hook "$event" "$ROOT")"
  code="${result%%|*}"
  rest="${result#*|}"
  if [[ "$code" -ne 0 || -n "$rest" && "$rest" != "|" ]]; then
    fail "$name without a marker (exit $code, output: $rest)"
    silent=1
  fi
done < <(case_lines)
[[ "$silent" -eq 0 ]] && pass "every case exits 0 and prints nothing without a marker"

echo "autopilot profile: no marker, but inside a watcher stage (ULTRAPOWERS_AUTOPILOT_INSIDE=1)"
run_inside() {
  local event="$1" out code
  out="$(cd "$ROOT" && printf '%s' "$event" | ULTRAPOWERS_AUTOPILOT_INSIDE=1 bash "$HOOK" 2>"$TEST_ROOT/stderr.txt")"
  code=$?
  printf '%s|%s' "$code" "$(cat "$TEST_ROOT/stderr.txt")"
}
result="$(run_inside '{"tool_name":"Bash","tool_input":{"command":"git push origin GH-16-x"}}')"
if [[ "${result%%|*}" -eq 2 ]] && printf '%s' "${result#*|}" | grep -q '^AUTOPILOT-GUARDRAIL DENY: '; then
  pass "a push is denied inside a stage whose marker is gone"
else
  fail "a push is denied inside a stage whose marker is gone (got $result)"
fi
result="$(run_inside '{"tool_name":"Bash","tool_input":{"command":"gh issue edit 16 --add-label up:approve"}}')"
if [[ "${result%%|*}" -eq 2 ]]; then
  pass "a label write is denied inside a stage whose marker is gone"
else
  fail "a label write is denied inside a stage whose marker is gone (got $result)"
fi
result="$(run_inside "{\"tool_name\":\"Write\",\"tool_input\":{\"file_path\":\"$ROOT/repo-a/src/x.ts\",\"content\":\"x\"}}")"
if [[ "${result%%|*}" -eq 0 ]]; then
  pass "a source write still passes inside a stage whose marker is gone"
else
  fail "a source write still passes inside a stage whose marker is gone (got $result)"
fi

echo
if [[ "$FAILURES" -gt 0 ]]; then
  echo "STATUS: FAILED ($FAILURES)"
  exit 1
fi
echo "STATUS: PASSED"
