#!/usr/bin/env bash
# Fixture-driven tests for the hunt profile of hooks/qa-guardrail (the vulnerability hunt).
# Pass 1: a hunt run record present (.ultrapowers/runs/hunt-audit-2026-10-11-0a1b2c3d.json, bound to no
#         session) -> deny_* cases exit 2 with a HUNT-GUARDRAIL DENY line that is a rule and never the
#         "could not be analysed" crash message, and that holds the case's `reason` text when it has
#         one; allow_* cases exit 0.
# Pass 2: the deny message names the run record, the audit id and who can end the run.
# Pass 3: precedence: with a QA record too the QA profile applies; with autopilot-active too the
#         hunt profile applies.
# Pass 4: the records are never written, moved or removed by a call of the run; a corrupt record
#         refuses every call; hunts of different sessions are active at once, each judging its own
#         session's calls, and a session no record names is inert.
# Pass 5: no run record -> every case exits 0 and prints nothing.
# Cases live in fixtures/hunt/cases.json: [{ name, event, reason?, dir?, env? }], with {{ROOT}} (POSIX
# path of the temp project), {{ELSEWHERE}} (a directory outside it) and {{DECOY}} (another project
# with its own autopilot marker and a config with no forbidden host) substituted. `dir` is the
# directory the hook runs from (default the project) and `env` an object of environment variables
# set for that one run (e.g. {"ULTRAPOWERS_RUN_DIR":"{{ROOT}}"}, as the bridge sets it); the
# no-record pass ignores both.
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

# write_run <project root> <profile> <id> [session] [run suffix] [startedAt]: writes the run record
# <root>/.ultrapowers/runs/<profile>-<id>-<suffix>.json, bound to no session unless one is given.
write_run() {
  local r="$1" prof="$2" id="$3" sess="${4:-}" suffix="${5:-0a1b2c3d}" started="${6:-}" sj="null"
  [[ -n "$started" ]] || started="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  [[ -n "$sess" ]] && sj="\"$sess\""
  mkdir -p "$r/.ultrapowers/runs"
  printf '{"run":"%s-%s-%s","profile":"%s","id":"%s","session":%s,"startedAt":"%s"}\n' "$prof" "$id" "$suffix" "$prof" "$id" "$sj" "$started" > "$r/.ultrapowers/runs/$prof-$id-$suffix.json"
}

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
MARKER="$ROOT/.ultrapowers/runs/hunt-audit-2026-10-11-0a1b2c3d.json"
DECOY="$TEST_ROOT/decoy"
ELSEWHERE="${ELSEWHERE:-$TEST_ROOT/elsewhere}"
mkdir -p "$DECOY/.agents" "$DECOY/.ultrapowers" "$ELSEWHERE"
# Copies of the plugin's own scripts outside the plugin: the hunt refuses them (deny_node_script_outside_plugin).
mkdir -p "$ELSEWHERE/plugin/skills/vulnerability-hunt/scripts"
: > "$ELSEWHERE/plugin/skills/vulnerability-hunt/scripts/hunt-preflight.mjs"
# A copy of run-records.mjs outside the plugin: deny_node_run_records_copy_outside_plugin. The real one runs from the plugin.
PLUGIN_M="$(cygpath -m "$REPO_ROOT" 2>/dev/null || printf %s "$REPO_ROOT")"
mkdir -p "$ELSEWHERE/plugin/hooks/lib"
: > "$ELSEWHERE/plugin/hooks/lib/run-records.mjs"
printf '%s' '{"name":"decoy","pluginVersion":"1.0.0","qa":{"hosts":{"allowed":[],"forbidden":[]}}}' > "$DECOY/.agents/ultrapowers.json"
printf '%s' '{"ticket":"GH-99","branch":"GH-99-x","scope":["."]}' > "$DECOY/.ultrapowers/autopilot-active"
QA_MARKER="$ROOT/.ultrapowers/runs/qa-GH-16-0a1b2c3d.json"
AP_MARKER="$ROOT/.ultrapowers/autopilot-active"
write_run "$ROOT" hunt audit-2026-10-11

# Node on Windows needs a mixed path for the cases file; the events keep the POSIX root.
CASES_NODE="$CASES"
if command -v cygpath >/dev/null 2>&1; then CASES_NODE="$(cygpath -m "$CASES" 2>/dev/null || printf '%s' "$CASES")"; fi

# One case per line: name<TAB>reason<TAB>dir<TAB>env<TAB>event JSON ("-" for a missing reason, dir or
# env; env is NAME=value pairs joined by \x1f), with the placeholders substituted.
case_lines() {
  DECOY_DIR="$DECOY" ELSEWHERE_DIR="$ELSEWHERE" PLUGIN_DIR="$(cygpath -m "$REPO_ROOT" 2>/dev/null || printf %s "$REPO_ROOT")" node -e '
const fs = require("node:fs");
const [file, root] = process.argv.slice(1);
for (const c of JSON.parse(fs.readFileSync(file, "utf8"))) {
  const fill = (t) => t.split("{{ROOT}}").join(root).split("{{DECOY}}").join(process.env.DECOY_DIR).split("{{ELSEWHERE}}").join(process.env.ELSEWHERE_DIR).split("{{PLUGIN}}").join(process.env.PLUGIN_DIR);
  const text = fill(JSON.stringify(c.event));
  const env = Object.entries(c.env || {}).map(([k, v]) => `${k}=${fill(String(v))}`).join("\x1f") || "-";
  process.stdout.write(`${c.name}\t${c.reason || "-"}\t${c.dir ? fill(c.dir) : "-"}\t${env}\t${text}\n`);
}' "$CASES_NODE" "$ROOT"
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

echo "hunt profile: run record present"
count=0
allows=0
denies=0
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

echo "hunt profile: every deny names the run record, the audit id and who can end the run"
result="$(run_hook '{"tool_name":"Bash","tool_input":{"command":"git push origin main"}}' "$ROOT")"
err="${result#*|}"; err="${err%%|*}"
# (the hook prints the record's path in the spelling node gives it: backslashes on Windows)
for want in "hunt-audit-2026-10-11-0a1b2c3d.json" "audit-2026-10-11" "your human partner"; do
  if [[ "$err" == *"$want"* ]]; then pass "a hunt deny names '$want'"; else fail "a hunt deny names '$want' (stderr: $err)"; fi
done
if [[ "$err" != *"QA run"* && "$err" != *"autopilot"* ]]; then pass "a hunt deny speaks of the hunt, not of a QA run or an autopilot stage"; else fail "a hunt deny speaks of the hunt (stderr: $err)"; fi
result="$(run_hook '{"tool_name":"Write","tool_input":{"file_path":"reviews/audit-2026-01-01/x.md","content":"x"}}' "$ROOT")"
err="${result#*|}"; err="${err%%|*}"
if [[ "$err" == *"reviews/audit-2026-10-11/"* ]]; then pass "the write area named in a deny is the audit's own folder"; else fail "the write area named in a deny is the audit's own folder (stderr: $err)"; fi

echo "hunt profile: the audit id of the record is the only report folder"
# A relative target resolves against the event cwd too, and a ticket id is as good an audit id.
rm -f "$MARKER"
write_run "$ROOT" hunt GH-16
result="$(run_hook "{\"tool_name\":\"Write\",\"tool_input\":{\"file_path\":\"$ROOT/reviews/GH-16/SECURITY-REPORT.md\",\"content\":\"x\"}}" "$ROOT")"
if [[ "${result%%|*}" -eq 0 ]]; then pass "a ticket id as the audit id writes reviews/GH-16/"; else fail "a ticket id as the audit id writes reviews/GH-16/ (got $result)"; fi
result="$(run_hook "{\"tool_name\":\"Write\",\"tool_input\":{\"file_path\":\"$ROOT/reviews/audit-2026-10-11/SECURITY-REPORT.md\",\"content\":\"x\"}}" "$ROOT")"
if [[ "${result%%|*}" -eq 2 ]]; then pass "another audit's folder is refused"; else fail "another audit's folder is refused (got $result)"; fi
rm -f "$ROOT/.ultrapowers/runs/hunt-GH-16-0a1b2c3d.json"
write_run "$ROOT" hunt audit-2026-10-11

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

echo "hunt profile: precedence between the records and the autopilot marker"
write_run "$ROOT" qa GH-16
result="$(run_hook '{"tool_name":"Bash","tool_input":{"command":"git commit -m x"}}' "$ROOT")"
err="${result#*|}"; err="${err%%|*}"
if [[ "${result%%|*}" -eq 2 ]] && printf '%s' "$err" | grep -q '^HUNT-GUARDRAIL DENY: '; then
  pass "with a QA record and a hunt record the hunt profile applies (the stricter one)"
else
  fail "with a QA record and a hunt record the hunt profile applies (got $result)"
fi
rm -f "$QA_MARKER"
printf '%s' '{"ticket":"GH-16","branch":"GH-16-x","scope":["repo-a"]}' > "$AP_MARKER"
result="$(run_hook '{"tool_name":"Bash","tool_input":{"command":"git commit -m x"}}' "$ROOT")"
err="${result#*|}"; err="${err%%|*}"
if [[ "${result%%|*}" -eq 2 ]] && printf '%s' "$err" | grep -q '^HUNT-GUARDRAIL DENY: '; then
  pass "with a hunt record and autopilot-active the hunt profile applies (a commit is refused)"
else
  fail "with a hunt record and autopilot-active the hunt profile applies (got $result)"
fi
result="$(run_hook "{\"tool_name\":\"Write\",\"tool_input\":{\"file_path\":\"$ROOT/repo-a/src/x.ts\",\"content\":\"x\"}}" "$ROOT")"
if [[ "${result%%|*}" -eq 2 ]]; then pass "a code write is refused with a hunt record and autopilot-active"; else fail "a code write is refused with a hunt record and autopilot-active (got $result)"; fi
rm -f "$AP_MARKER"

echo "hunt profile: no call of the run writes, moves or removes its record; the run ends itself through run-records.mjs end"
# The skill writes the record before the run (no record yet, the hook is inert); during the run no
# hunter or gatekeeper call rewrites or removes it.
result="$(run_hook "{\"tool_name\":\"Write\",\"tool_input\":{\"file_path\":\"$MARKER\",\"content\":\"{}\"}}" "$ROOT")"
if [[ "${result%%|*}" -eq 2 && "$result" == *"is a run record; no call of a run writes, moves or removes one"* ]]; then pass "a write of the record during the hunt is refused"; else fail "a write of the record during the hunt is refused (got $result)"; fi
result="$(run_hook '{"tool_name":"Bash","tool_input":{"command":"rm .ultrapowers/runs/hunt-audit-2026-10-11-0a1b2c3d.json"}}' "$ROOT")"
if [[ "${result%%|*}" -eq 2 && "$result" == *"the run ends itself through"*"run-records.mjs end once its report holds its Verdict line"* ]]; then pass "a sole rm of the record is refused; the run ends itself through run-records.mjs end"; else fail "a sole rm of the record is refused; the run ends itself through run-records.mjs end (got $result)"; fi
result="$(run_hook "{\"tool_name\":\"Bash\",\"tool_input\":{\"command\":\"node $PLUGIN_M/hooks/lib/run-records.mjs end --root $ROOT --run hunt-audit-2026-10-11-0a1b2c3d\"},\"session_id\":\"h-none\"}" "$ROOT")"
if [[ "${result%%|*}" -eq 0 ]]; then pass "the hunt runs the plugin's own run-records.mjs end"; else fail "the hunt runs the plugin's own run-records.mjs end (got $result)"; fi

echo "hunt profile: a record whose id would widen the write area, or that cannot be read, refuses every call"
for bad in '..' 'audit/../..' 'a\\b'; do
  printf '{"run":"hunt-audit-2026-10-11-0a1b2c3d","profile":"hunt","id":"%s","session":null,"startedAt":"%s"}\n' "$bad" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$MARKER"
  result="$(run_hook '{"tool_name":"Bash","tool_input":{"command":"ls"}}' "$ROOT")"
  if [[ "${result%%|*}" -eq 2 && "$result" == *"a run record cannot be read"* ]]; then pass "deny_record_id: a record holding the id '$bad' refuses every call"; else fail "deny_record_id: a record holding the id '$bad' refuses every call (got $result)"; fi
done
printf '%s' '{ "run": ' > "$MARKER"
result="$(run_hook '{"tool_name":"Read","tool_input":{"file_path":"repo-a/src/x.ts"}}' "$ROOT")"
if [[ "${result%%|*}" -eq 2 && "$result" == *"a run record cannot be read ("*"hunt-audit-2026-10-11-0a1b2c3d.json"* ]]; then pass "deny_corrupt_record: a record that is not JSON refuses a read, naming itself"; else fail "deny_corrupt_record: a record that is not JSON refuses a read, naming itself (got $result)"; fi
write_run "$ROOT" hunt audit-2026-10-11

echo "hunt profile: hunts of different sessions are active at once; each judges its own session's calls"
HSESS="$TEST_ROOT/sessproject"
mkdir -p "$HSESS/.agents" "$HSESS/reviews/audit-a" "$HSESS/reviews/audit-b" "$HSESS/reviews/GH-16"
cp "$ROOT/.agents/ultrapowers.json" "$HSESS/.agents/ultrapowers.json"
write_run "$HSESS" hunt audit-a h-one aaaa1111
write_run "$HSESS" hunt audit-b h-two bbbb2222
hsess_write() { printf '{"tool_name":"Write","tool_input":{"file_path":"%s/reviews/%s/SECURITY-REPORT.md","content":"x"},"session_id":"%s"}' "$HSESS" "$1" "$2"; }
for combo in "audit-a h-one 0" "audit-b h-one 2" "audit-b h-two 0" "audit-a h-two 2"; do
  set -- $combo
  result="$(run_hook "$(hsess_write "$1" "$2")" "$HSESS")"
  if [[ "${result%%|*}" -eq "$3" ]]; then pass "session $2 writing reviews/$1/ is judged by its own hunt (exit ${result%%|*})"; else fail "session $2 writing reviews/$1/ is judged by its own hunt (want exit $3, got $result)"; fi
done
result="$(run_hook "$(hsess_write audit-b h-one)" "$HSESS")"
if [[ "$result" == *"HUNT-GUARDRAIL DENY: "* && "$result" == *"reviews/audit-a/"* && "$result" == *"hunt-audit-a-aaaa1111.json"* && "$result" != *"hunt-audit-b-bbbb2222.json"* ]]; then pass "the deny of session h-one names its own record and audit folder"; else fail "the deny of session h-one names its own record and audit folder (got $result)"; fi
result="$(run_hook '{"tool_name":"Bash","tool_input":{"command":"git push origin main"},"session_id":"h-three"}' "$HSESS")"
if [[ "${result%%|*}" -eq 0 && "${result#*|}" == "|" ]]; then pass "a session that no record names is allowed silently while only session-bound records exist"; else fail "a session that no record names is allowed silently while only session-bound records exist (got $result)"; fi
result="$(run_hook '{"tool_name":"Bash","tool_input":{"command":"git push origin main"}}' "$HSESS")"
if [[ "${result%%|*}" -eq 0 ]]; then pass "a call that names no session is allowed while only session-bound records exist"; else fail "a call that names no session is allowed while only session-bound records exist (got $result)"; fi
# A QA run of one session and a hunt of another in one project: each call meets its own profile.
write_run "$HSESS" qa GH-16 q-one cccc3333
result="$(run_hook '{"tool_name":"Bash","tool_input":{"command":"git push origin main"},"session_id":"q-one"}' "$HSESS")"
if [[ "${result%%|*}" -eq 2 && "$result" == *"QA-GUARDRAIL DENY: "* ]]; then pass "the session of a QA record is judged by the QA profile"; else fail "the session of a QA record is judged by the QA profile (got $result)"; fi
result="$(run_hook '{"tool_name":"Bash","tool_input":{"command":"git push origin main"},"session_id":"h-two"}' "$HSESS")"
if [[ "${result%%|*}" -eq 2 && "$result" == *"HUNT-GUARDRAIL DENY: "* ]]; then pass "the session of a hunt record is judged by the hunt profile"; else fail "the session of a hunt record is judged by the hunt profile (got $result)"; fi
result="$(run_hook "{\"tool_name\":\"Write\",\"tool_input\":{\"file_path\":\"$HSESS/reviews/GH-16/QA-REPORT.md\",\"content\":\"x\"},\"session_id\":\"h-two\"}" "$HSESS")"
if [[ "${result%%|*}" -eq 2 ]]; then pass "a hunt session never writes the report folder of another session's QA run"; else fail "a hunt session never writes the report folder of another session's QA run (got $result)"; fi

echo "hunt profile: no run record, everything passes silently"
rm -rf "$ROOT/.ultrapowers/runs"
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

echo
if [[ "$FAILURES" -gt 0 ]]; then
  echo "STATUS: FAILED ($FAILURES)"
  exit 1
fi
echo "STATUS: PASSED"
