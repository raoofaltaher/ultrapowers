#!/usr/bin/env bash
# Fixture-driven tests for the hunt profile of hooks/qa-guardrail (the vulnerability hunt).
# Pass 1: .ultrapowers/hunt-active present (holding the audit id) -> deny_* cases exit 2 with a
#         HUNT-GUARDRAIL DENY line that is a rule and never the "could not be analysed" crash
#         message, and that holds the case's `reason` text when it has one; allow_* cases exit 0.
# Pass 2: the deny message names the marker, the audit id and who can end the run.
# Pass 3: precedence: with qa-active too the QA profile applies; with autopilot-active too the
#         hunt profile applies.
# Pass 4: no marker -> every case exits 0 and prints nothing.
# Cases live in fixtures/hunt/cases.json: [{ name, event, reason? }], with {{ROOT}} (POSIX path of
# the temp project) substituted.
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
HOOK="$REPO_ROOT/hooks/qa-guardrail"
CASES="$SCRIPT_DIR/fixtures/hunt/cases.json"

export MSYS_NO_PATHCONV=1
shopt -u patsub_replacement 2>/dev/null || true

FAILURES=0
pass() { echo "  [PASS] $1"; }
fail() { echo "  [FAIL] $1"; FAILURES=$((FAILURES + 1)); }

TEST_ROOT="$(mktemp -d)"
cleanup() { rm -rf "$TEST_ROOT"; }
trap cleanup EXIT

ROOT="$TEST_ROOT/project"
mkdir -p "$ROOT/.agents" "$ROOT/.ultrapowers" "$ROOT/.claude" "$ROOT/repo-a/src" "$ROOT/reviews/audit-2026-10-11"
echo '{}' > "$ROOT/.claude/settings.json"
cat > "$ROOT/.agents/ultrapowers.json" <<'JSON'
{
  "name": "sample",
  "pluginVersion": "1.0.0",
  "topology": "nested",
  "repos": [ { "name": "repo-a", "path": "repo-a", "defaultBranch": "main" } ],
  "qa": {
    "hosts": { "allowed": ["localhost", "127.0.0.1"], "forbidden": ["prod.example.com"] }
  }
}
JSON
MARKER="$ROOT/.ultrapowers/hunt-active"
QA_MARKER="$ROOT/.ultrapowers/qa-active"
AP_MARKER="$ROOT/.ultrapowers/autopilot-active"
printf '%s' 'audit-2026-10-11' > "$MARKER"

# Node on Windows needs a mixed path for the cases file; the events keep the POSIX root.
CASES_NODE="$CASES"
if command -v cygpath >/dev/null 2>&1; then CASES_NODE="$(cygpath -m "$CASES" 2>/dev/null || printf '%s' "$CASES")"; fi

# One case per line: name<TAB>reason<TAB>event JSON (reason "-" when the case has none), with
# {{ROOT}} substituted.
case_lines() {
  node -e '
const fs = require("node:fs");
const [file, root] = process.argv.slice(1);
for (const c of JSON.parse(fs.readFileSync(file, "utf8"))) {
  const text = JSON.stringify(c.event).split("{{ROOT}}").join(root);
  process.stdout.write(`${c.name}\t${c.reason || "-"}\t${text}\n`);
}' "$CASES_NODE" "$ROOT"
}

run_hook() {
  # $1 event, $2 working dir; prints "<code>|<stderr>|<stdout>"
  local event="$1" dir="$2" out err code
  out="$(cd "$dir" && printf '%s' "$event" | bash "$HOOK" 2>"$TEST_ROOT/stderr.txt")"
  code=$?
  err="$(cat "$TEST_ROOT/stderr.txt")"
  printf '%s|%s|%s' "$code" "$err" "$out"
}

echo "hunt profile: marker present"
count=0
allows=0
denies=0
while IFS=$'\t' read -r name reason event; do
  [ -n "$name" ] || continue
  count=$((count + 1))
  result="$(run_hook "$event" "$ROOT")"
  code="${result%%|*}"
  rest="${result#*|}"
  err="${rest%%|*}"
  case "$name" in
    deny_*)
      denies=$((denies + 1))
      if [[ "$code" -ne 2 ]] || ! printf '%s' "$err" | grep -q '^HUNT-GUARDRAIL DENY: '; then
        fail "$name denied (exit $code, stderr: $err)"
      elif [[ "$err" == *"could not be analysed"* ]]; then
        fail "$name is denied by a crash of the analyzer, not by a rule (stderr: $err)"
      elif [[ "$reason" != "-" && "$err" != *"$reason"* ]]; then
        fail "$name is denied for another reason than '$reason' (stderr: $err)"
      else
        pass "$name denied"
      fi ;;
    allow_*)
      allows=$((allows + 1))
      if [[ "$code" -eq 0 ]]; then
        pass "$name allowed"
      else
        fail "$name allowed (exit $code, stderr: $err)"
      fi ;;
    *) fail "$name has no deny_/allow_ prefix" ;;
  esac
done < <(case_lines)
if [[ "$allows" -lt 25 || "$denies" -lt 50 ]]; then
  fail "expected at least 25 allow and 50 deny cases, found $allows and $denies"
fi

echo "hunt profile: every deny names the marker, the audit id and who can end the run"
result="$(run_hook '{"tool_name":"Bash","tool_input":{"command":"git push origin main"}}' "$ROOT")"
err="${result#*|}"; err="${err%%|*}"
for want in ".ultrapowers/hunt-active" "audit-2026-10-11" "your human partner"; do
  if [[ "$err" == *"$want"* ]]; then pass "a hunt deny names '$want'"; else fail "a hunt deny names '$want' (stderr: $err)"; fi
done
if [[ "$err" != *"QA run"* && "$err" != *"autopilot"* ]]; then pass "a hunt deny speaks of the hunt, not of a QA run or an autopilot stage"; else fail "a hunt deny speaks of the hunt (stderr: $err)"; fi
result="$(run_hook '{"tool_name":"Write","tool_input":{"file_path":"reviews/audit-2026-01-01/x.md","content":"x"}}' "$ROOT")"
err="${result#*|}"; err="${err%%|*}"
if [[ "$err" == *"reviews/audit-2026-10-11/"* ]]; then pass "the write area named in a deny is the audit's own folder"; else fail "the write area named in a deny is the audit's own folder (stderr: $err)"; fi

echo "hunt profile: the audit id in the marker is the only report folder"
# A relative target resolves against the event cwd too, and a ticket id is as good an audit id.
printf '%s' 'GH-16' > "$MARKER"
result="$(run_hook "{\"tool_name\":\"Write\",\"tool_input\":{\"file_path\":\"$ROOT/reviews/GH-16/SECURITY-REPORT.md\",\"content\":\"x\"}}" "$ROOT")"
if [[ "${result%%|*}" -eq 0 ]]; then pass "a ticket id as the audit id writes reviews/GH-16/"; else fail "a ticket id as the audit id writes reviews/GH-16/ (got $result)"; fi
result="$(run_hook "{\"tool_name\":\"Write\",\"tool_input\":{\"file_path\":\"$ROOT/reviews/audit-2026-10-11/SECURITY-REPORT.md\",\"content\":\"x\"}}" "$ROOT")"
if [[ "${result%%|*}" -eq 2 ]]; then pass "another audit's folder is refused"; else fail "another audit's folder is refused (got $result)"; fi
printf '%s' 'audit-2026-10-11' > "$MARKER"

echo "hunt profile: the hook's time does not grow with the size of the command"
long=""
for ((i = 0; i < 500; i++)); do long+="echo a; "; done
long+="echo x > repo-a/src/x.ts"
t_start="$(date +%s)"
result="$(run_hook "{\"tool_name\":\"Bash\",\"tool_input\":{\"command\":\"$long\"}}" "$ROOT")"
t_end="$(date +%s)"
err="${result#*|}"; err="${err%%|*}"
if [[ "${result%%|*}" -eq 2 && "$err" == HUNT-GUARDRAIL\ DENY:* && $((t_end - t_start)) -lt 10 ]]; then
  pass "a 500-segment command is denied in under 10 s ($((t_end - t_start)) s)"
else
  fail "a 500-segment command is denied in under 10 s (exit ${result%%|*}, $((t_end - t_start)) s)"
fi

echo "hunt profile: precedence between the markers"
printf '%s' "GH-16" > "$QA_MARKER"
result="$(run_hook '{"tool_name":"Bash","tool_input":{"command":"git commit -m x"}}' "$ROOT")"
err="${result#*|}"; err="${err%%|*}"
if [[ "${result%%|*}" -eq 2 ]] && printf '%s' "$err" | grep -q '^QA-GUARDRAIL DENY: '; then
  pass "with qa-active and hunt-active the QA profile applies"
else
  fail "with qa-active and hunt-active the QA profile applies (got $result)"
fi
rm -f "$QA_MARKER"
printf '%s' '{"ticket":"GH-16","branch":"GH-16-x","scope":["repo-a"]}' > "$AP_MARKER"
result="$(run_hook '{"tool_name":"Bash","tool_input":{"command":"git commit -m x"}}' "$ROOT")"
err="${result#*|}"; err="${err%%|*}"
if [[ "${result%%|*}" -eq 2 ]] && printf '%s' "$err" | grep -q '^HUNT-GUARDRAIL DENY: '; then
  pass "with hunt-active and autopilot-active the hunt profile applies (a commit is refused)"
else
  fail "with hunt-active and autopilot-active the hunt profile applies (got $result)"
fi
result="$(run_hook "{\"tool_name\":\"Write\",\"tool_input\":{\"file_path\":\"$ROOT/repo-a/src/x.ts\",\"content\":\"x\"}}" "$ROOT")"
if [[ "${result%%|*}" -eq 2 ]]; then pass "a code write is refused with hunt-active and autopilot-active"; else fail "a code write is refused with hunt-active and autopilot-active (got $result)"; fi
rm -f "$AP_MARKER"

echo "hunt profile: the marker can be written and removed by the run itself"
result="$(run_hook "{\"tool_name\":\"Write\",\"tool_input\":{\"file_path\":\"$ROOT/.ultrapowers/hunt-active\",\"content\":\"audit-2026-10-11\"}}" "$ROOT")"
if [[ "${result%%|*}" -eq 0 ]]; then pass "the hunt writes its own marker"; else fail "the hunt writes its own marker (got $result)"; fi
result="$(run_hook '{"tool_name":"Bash","tool_input":{"command":"rm .ultrapowers/hunt-active"}}' "$ROOT")"
if [[ "${result%%|*}" -eq 0 ]]; then pass "the hunt removes its own marker"; else fail "the hunt removes its own marker (got $result)"; fi
printf '%s' 'audit-2026-10-11' > "$MARKER"

echo "hunt profile: no marker, everything passes silently"
rm -f "$MARKER"
silent=0
while IFS=$'\t' read -r name reason event; do
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

echo
if [[ "$FAILURES" -gt 0 ]]; then
  echo "STATUS: FAILED ($FAILURES)"
  exit 1
fi
echo "STATUS: PASSED"
