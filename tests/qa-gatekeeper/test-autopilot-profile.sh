#!/usr/bin/env bash
# Fixture-driven tests for the autopilot profile of hooks/qa-guardrail.
# Pass 1: .ultrapowers/autopilot-active present -> deny_* cases exit 2 with an
#         AUTOPILOT-GUARDRAIL DENY line, allow_* cases exit 0.
# Pass 2: both markers present -> the QA profile wins: `git commit` is denied with the QA prefix.
# Pass 3: no marker -> every case exits 0 and prints nothing.
# Cases live in fixtures/autopilot/cases.json: [{ name, event, reason?, dir?, env? }], with {{ROOT}}
# (POSIX path of the temp project), {{ELSEWHERE}} (a sibling directory outside it) and {{DECOY}}
# (another project with its own autopilot marker and a config with no forbidden host) substituted,
# plus
# {{WINSHORT}}, {{WINSHORT_SETTINGS}} and {{WINSHORT_MARKER}} (8.3 short forms of the project, of
# .claude/settings.json and of the autopilot marker) for the cases ending in _winshort. `dir` is the
# directory the hook runs from (default the project) and `env` an object of environment variables
# set for that one run (e.g. {"ULTRAPOWERS_RUN_DIR":"{{ROOT}}"}, as the bridge sets it); the
# no-marker pass ignores both.
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
mkdir -p "$ROOT/.agents" "$ROOT/.ultrapowers" "$ROOT/.claude" "$ROOT/tasks/GH-16" "$ROOT/specs/GH-16" "$ROOT/repo-a/src" "$ROOT/.github/workflows" "$ELSEWHERE"
echo '{}' > "$ROOT/.claude/settings.json"
cat > "$ROOT/.agents/ultrapowers.json" <<'JSON'
{
  "name": "sample",
  "pluginVersion": "1.0.0",
  "topology": "nested",
  "repos": [ { "name": "repo-a", "path": "repo-a", "defaultBranch": "main" } ],
  "autopilot": { "mode": "gated" },
  "tickets": { "sources": [ { "prefix": "ODOO", "provider": "odoo", "url": "https://erp.example.com", "login": "bot@example.com" } ] },
  "qa": {
    "knownIssues": "qa/baseline/known.md",
    "urls": { "frontend": "http://localhost:3000", "backendHealth": "http://localhost:8080/health", "idp": "", "observability": "" },
    "hosts": { "allowed": ["localhost", "127.0.0.1", "erp.example.com"], "forbidden": ["prod.example.com"] }
  }
}
JSON
MARKER="$ROOT/.ultrapowers/autopilot-active"
DECOY="$TEST_ROOT/decoy"
ELSEWHERE="${ELSEWHERE:-$TEST_ROOT/elsewhere}"
mkdir -p "$DECOY/.agents" "$DECOY/.ultrapowers" "$ELSEWHERE"
printf '%s' '{"name":"decoy","pluginVersion":"1.0.0","qa":{"hosts":{"allowed":[],"forbidden":[]}}}' > "$DECOY/.agents/ultrapowers.json"
printf '%s' '{"ticket":"GH-99","branch":"GH-99-x","scope":["."]}' > "$DECOY/.ultrapowers/autopilot-active"
QA_MARKER="$ROOT/.ultrapowers/qa-active"
printf '%s' '{"ticket":"GH-16","branch":"GH-16-x","scope":["repo-a"]}' > "$MARKER"

# 8.3 short forms (Windows volumes that generate them); cases ending in _winshort run only there.
FIXTURE_PATHS="$SCRIPT_DIR/fixture-paths.mjs"
if command -v cygpath >/dev/null 2>&1; then FIXTURE_PATHS="$(cygpath -m "$FIXTURE_PATHS")"; fi
node_path() { if command -v cygpath >/dev/null 2>&1; then cygpath -m "$1"; else printf '%s' "$1"; fi; }
WINSHORT=""; WINSHORT_SETTINGS=""; WINSHORT_MARKER=""
if command -v cygpath >/dev/null 2>&1; then
  WINSHORT="$(node "$FIXTURE_PATHS" short "$(node_path "$ROOT")")"
  WINSHORT_SETTINGS="$(node "$FIXTURE_PATHS" short "$(node_path "$ROOT/.claude/settings.json")")"
  WINSHORT_MARKER="$(node "$FIXTURE_PATHS" short "$(node_path "$MARKER")")"
  if [[ "$WINSHORT" == "$(node_path "$ROOT")" || "$WINSHORT_SETTINGS" == "$(node_path "$ROOT/.claude/settings.json")" ]]; then
    WINSHORT=""; WINSHORT_SETTINGS=""; WINSHORT_MARKER=""
  fi
fi

# Node on Windows needs a mixed path for the cases file; the events keep the POSIX root.
CASES_NODE="$CASES"
if command -v cygpath >/dev/null 2>&1; then CASES_NODE="$(cygpath -m "$CASES" 2>/dev/null || printf '%s' "$CASES")"; fi

# One case per line: name<TAB>reason<TAB>dir<TAB>env<TAB>event JSON ("-" for a missing reason, dir or
# env; env is NAME=value pairs joined by \x1f), with the placeholders substituted.
case_lines() {
  DECOY_DIR="$DECOY" ELSEWHERE_DIR="$ELSEWHERE" node -e '
const fs = require("node:fs");
const [file, root, elsewhere, short, shortSettings, shortMarker] = process.argv.slice(1);
for (const c of JSON.parse(fs.readFileSync(file, "utf8"))) {
  if (c.name.endsWith("_winshort") && !short) continue;
  const text = JSON.stringify(c.event).split("{{DECOY}}").join(process.env.DECOY_DIR).split("{{ROOT}}").join(root).split("{{ELSEWHERE}}").join(elsewhere)
    .split("{{WINSHORT_SETTINGS}}").join(shortSettings).split("{{WINSHORT_MARKER}}").join(shortMarker).split("{{WINSHORT}}").join(short);
  const fill = (t) => t.split("{{DECOY}}").join(process.env.DECOY_DIR).split("{{ELSEWHERE}}").join(process.env.ELSEWHERE_DIR).split("{{ROOT}}").join(root);
  const env = Object.entries(c.env || {}).map(([k, v]) => `${k}=${fill(String(v))}`).join("\x1f") || "-";
  process.stdout.write(`${c.name}\t${c.reason || "-"}\t${c.dir ? fill(c.dir) : "-"}\t${env}\t${text}\n`);
}' "$CASES_NODE" "$ROOT" "$ELSEWHERE" "$WINSHORT" "$WINSHORT_SETTINGS" "$WINSHORT_MARKER"
}

RUN_ENV=()
run_hook() {
  # $1 event, $2 working dir; prints "<code>|<stderr>|<stdout>"
  local event="$1" dir="$2" out err code
  out="$(cd "$dir" && printf '%s' "$event" | env ${RUN_ENV[@]+"${RUN_ENV[@]}"} bash "$HOOK" 2>"$TEST_ROOT/stderr.txt")"
  code=$?
  err="$(cat "$TEST_ROOT/stderr.txt")"
  printf '%s|%s|%s' "$code" "$err" "$out"
}

echo "autopilot profile: marker present"
count=0
while IFS=$'\t' read -r name reason cdir cenv event; do
  [ -n "$name" ] || continue
  count=$((count + 1))
  RUN_ENV=(); [[ "$cenv" != "-" ]] && IFS=$'\x1f' read -r -a RUN_ENV <<< "$cenv"
  run_dir="$ROOT"; [[ "$cdir" != "-" ]] && run_dir="$cdir"
  result="$(run_hook "$event" "$run_dir")"
  RUN_ENV=()
  code="${result%%|*}"
  rest="${result#*|}"
  err="${rest%%|*}"
  case "$name" in
    deny_*)
      if [[ "$code" -eq 2 ]] && printf '%s' "$err" | grep -q '^AUTOPILOT-GUARDRAIL DENY: '; then
        if [[ "$reason" != "-" && "$err" != *"$reason"* ]]; then fail "$name is denied for another reason than '$reason' (stderr: $err)"; else pass "$name denied"; fi
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

echo "autopilot profile: every deny names the stage marker, the ticket and who can end the stage"
result="$(run_hook '{"tool_name":"Bash","tool_input":{"command":"git push origin GH-16-x"}}' "$ROOT")"
err="${result#*|}"; err="${err%%|*}"
for want in ".ultrapowers/autopilot-active" "GH-16" "autopilot.mjs end" "your human partner"; do
  if [[ "$err" == *"$want"* ]]; then pass "an autopilot deny names '$want'"; else fail "an autopilot deny names '$want' (stderr: $err)"; fi
done
result="$(run_hook '{"tool_name":"Bash","tool_input":{"command":"Set-Content x.txt hello"}}' "$ROOT")"
err="${result#*|}"; err="${err%%|*}"
if [[ "$err" == *"AUTOPILOT-GUARDRAIL DENY: "* && "$err" != *"QA run"* ]]; then pass "a PowerShell deny under autopilot does not speak of a QA run"; else fail "a PowerShell deny under autopilot does not speak of a QA run (stderr: $err)"; fi

echo "autopilot profile: the hook's time does not grow with the size of the command"
# A hook killed at the registration timeout (30 s) lets the call through: 500 segments followed by a
# write to a protected path must be denied, and quickly.
long=""
for ((i = 0; i < 500; i++)); do long+="echo a; "; done
long+="echo x > .claude/settings.json"
t_start="$(date +%s)"
result="$(run_hook "{\"tool_name\":\"Bash\",\"tool_input\":{\"command\":\"$long\"}}" "$ROOT")"
t_end="$(date +%s)"
err="${result#*|}"; err="${err%%|*}"
if [[ "${result%%|*}" -eq 2 && "$err" == AUTOPILOT-GUARDRAIL\ DENY:* && $((t_end - t_start)) -lt 5 ]]; then
  pass "a 500-segment command is denied in under 5 s ($((t_end - t_start)) s)"
else
  fail "a 500-segment command is denied in under 5 s (exit ${result%%|*}, $((t_end - t_start)) s)"
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
while IFS=$'\t' read -r name reason cdir cenv event; do
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
# A key under tool_input never names the project: a decoy project with no forbidden host does not
# lift this project's forbidden host, on the direct path (hook run from the project) or the bridge
# path (hook run from elsewhere with ULTRAPOWERS_RUN_DIR naming the session directory).
# (A nested cwd is also a working directory outside the project, refused as such by the real root.)
for kv in "ultrapowers_run_dir:forbidden" "cwd:is outside the project $ROOT"; do
  key="${kv%%:*}"; want="${kv#*:}"
  event="{\"tool_name\":\"Bash\",\"tool_input\":{\"command\":\"curl -s https://prod.example.com/\",\"$key\":\"$DECOY\"}}"
  result="$(run_inside "$event")"
  if [[ "${result%%|*}" -eq 2 && "${result#*|}" == *"$want"* ]]; then pass "inside a stage, tool_input.$key naming a decoy project is still judged by this project"; else fail "inside a stage, tool_input.$key naming a decoy project is still judged by this project (got $result)"; fi
  out="$(cd "$ELSEWHERE" && printf '%s' "$event" | ULTRAPOWERS_AUTOPILOT_INSIDE=1 ULTRAPOWERS_RUN_DIR="$ROOT" bash "$HOOK" 2>&1)"; code=$?
  if [[ "$code" -eq 2 && "$out" == *"$want"* ]]; then pass "inside a stage through the bridge, tool_input.$key naming a decoy is still judged by this project"; else fail "inside a stage through the bridge, tool_input.$key naming a decoy is still judged by this project (exit $code: $out)"; fi
done

echo
if [[ "$FAILURES" -gt 0 ]]; then
  echo "STATUS: FAILED ($FAILURES)"
  exit 1
fi
echo "STATUS: PASSED"
