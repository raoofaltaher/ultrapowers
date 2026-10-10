#!/usr/bin/env bash
# Fixture-driven tests for hooks/qa-guardrail.
# Pass 1: marker present -> deny_* fixtures exit 2 with a QA-GUARDRAIL DENY line, allow_* exit 0.
# Pass 2: marker absent -> every fixture exits 0 and prints nothing.
# Pass 3: registration files name the hook.
# Fixtures may contain {{ROOT}} (POSIX path of the temp project), {{WINROOT}} (its Windows
# form, JSON-escaped; fixtures ending in _winpath run only where cygpath exists), {{WINSHORT}}
# (the 8.3 short form of the project, forward slashes) and {{WINSHORT_SECRETS}} (the short form of
# .agents/mcp-secrets.env); fixtures ending in _winshort run only where the volume has short names.
# Fixtures ending in _casesens run in a second project whose folder is case-sensitive ({{ROOT}} is
# then that project); they skip where no case-sensitive folder can be made.
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
HOOK="$REPO_ROOT/hooks/qa-guardrail"
WRAPPER="$REPO_ROOT/hooks/run-hook.cmd"
FIXTURES="$SCRIPT_DIR/fixtures/guardrail"

export MSYS_NO_PATHCONV=1
# Bash 5.2 turns patsub_replacement on, which halves the backslashes render() substitutes
# into the Windows-path fixtures. Older bash has no such option; the error is ignored.
shopt -u patsub_replacement 2>/dev/null || true

FAILURES=0
pass() { echo "  [PASS] $1"; }
fail() { echo "  [FAIL] $1"; FAILURES=$((FAILURES + 1)); }

TEST_ROOT="$(mktemp -d)"
cleanup() { rm -rf "$TEST_ROOT"; }
trap cleanup EXIT

ROOT="$TEST_ROOT/project"
mkdir -p "$ROOT/.agents" "$ROOT/.ultrapowers" "$ROOT/reviews/1234/artifacts" "$ROOT/repo-a/src" "$TEST_ROOT/elsewhere"
: > "$ROOT/.agents/mcp-secrets.env"
cat > "$ROOT/.agents/ultrapowers.json" <<'JSON'
{
  "name": "sample",
  "pluginVersion": "1.0.0",
  "repos": [ { "name": "repo-a", "path": "repo-a", "defaultBranch": "main" } ],
  "qa": {
    "roles": [ { "name": "user", "userEnv": "QA_USER", "passwordEnv": "QA_PW_USER", "required": true } ],
    "urls": { "frontend": "http://localhost:3000", "backendHealth": "http://localhost:8080/health", "idp": "https://idp.example.com", "observability": "" },
    "hosts": { "allowed": ["localhost", "127.0.0.1", "app.example.com", "backend-container"], "forbidden": ["prod.example.com", "192.0.2.10"] }
  }
}
JSON
printf '%s' "1234" > "$ROOT/.ultrapowers/qa-active"

# A second project in a case-sensitive folder, for the _casesens fixtures.
FIXTURE_PATHS="$SCRIPT_DIR/fixture-paths.mjs"
if command -v cygpath >/dev/null 2>&1; then FIXTURE_PATHS="$(cygpath -m "$FIXTURE_PATHS")"; fi
node_path() { if command -v cygpath >/dev/null 2>&1; then cygpath -m "$1"; else printf '%s' "$1"; fi; }
CSROOT="$TEST_ROOT/csproject"
CS_OK="$(node "$FIXTURE_PATHS" casesens "$(node_path "$CSROOT")" 2>/dev/null || printf 0)"
if [[ "$CS_OK" == "1" ]]; then
  mkdir -p "$CSROOT/.agents" "$CSROOT/.ultrapowers" "$CSROOT/reviews/1234/artifacts"
  cp "$ROOT/.agents/ultrapowers.json" "$CSROOT/.agents/ultrapowers.json"
  printf '%s' "1234" > "$CSROOT/.ultrapowers/qa-active"
fi

# 8.3 short forms (Windows volumes that generate them).
WINSHORT=""; WINSHORT_SECRETS=""
if command -v cygpath >/dev/null 2>&1; then
  WINSHORT="$(node "$FIXTURE_PATHS" short "$(node_path "$ROOT")")"
  WINSHORT_SECRETS="$(node "$FIXTURE_PATHS" short "$(node_path "$ROOT/.agents/mcp-secrets.env")")"
  if [[ "$WINSHORT" == "$(node_path "$ROOT")" || "$WINSHORT_SECRETS" == "$(node_path "$ROOT/.agents/mcp-secrets.env")" ]]; then
    WINSHORT=""; WINSHORT_SECRETS=""
  fi
fi

WINROOT_JSON=""
if command -v cygpath >/dev/null 2>&1; then
  winroot="$(cygpath -w "$ROOT")"
  WINROOT_JSON="${winroot//\\/\\\\}"
fi

render() {
  # $1 fixture path -> stdout with placeholders substituted. Bash substitution, not sed:
  # sed would treat the JSON-escaped backslashes in WINROOT_JSON as escapes and halve them.
  # A _casesens fixture is rendered against the case-sensitive project.
  local ROOT="$ROOT" text
  case "$1" in *_casesens.json) ROOT="$CSROOT" ;; esac
  text="$(cat "$1")"
  text="${text//\{\{ROOT\}\}/$ROOT}"
  text="${text//\{\{WINROOT\}\}/$WINROOT_JSON}"
  text="${text//\{\{WINSHORT_SECRETS\}\}/$WINSHORT_SECRETS}"
  text="${text//\{\{WINSHORT\}\}/$WINSHORT}"
  printf '%s' "$text"
}

skip_fixture() {
  # prints a reason when this fixture cannot run on this machine
  case "$1" in
    *_winpath) [[ -z "$WINROOT_JSON" ]] && echo "no cygpath on this platform" ;;
    *_winshort) [[ -z "$WINSHORT" ]] && echo "no 8.3 short names on this volume" ;;
    *_casesens) [[ "$CS_OK" != "1" ]] && echo "no case-sensitive folder can be made here" ;;
  esac
  return 0
}

run_hook() {
  # $1 rendered event, $2 working dir; prints "<code>|<stderr>|<stdout>"
  local event="$1" dir="$2" out err code
  out="$(cd "$dir" && printf '%s' "$event" | bash "$HOOK" 2>"$TEST_ROOT/stderr.txt")"
  code=$?
  err="$(cat "$TEST_ROOT/stderr.txt")"
  printf '%s|%s|%s' "$code" "$err" "$out"
}

echo "qa-guardrail fixture tests (marker present)"
count=0
for f in "$FIXTURES"/*.json; do
  name="$(basename "$f" .json)"
  reason="$(skip_fixture "$name")"
  if [[ -n "$reason" ]]; then
    echo "  [SKIP] $name ($reason)"
    continue
  fi
  count=$((count + 1))
  event="$(render "$f")"
  run_root="$ROOT"
  case "$name" in *_casesens) run_root="$CSROOT" ;; esac
  result="$(run_hook "$event" "$run_root")"
  code="${result%%|*}"
  rest="${result#*|}"
  err="${rest%%|*}"
  case "$name" in
    deny_*)
      if [[ "$code" -eq 2 ]] && printf '%s' "$err" | grep -q '^QA-GUARDRAIL DENY: '; then
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
    *)
      fail "$name has no deny_/allow_ prefix" ;;
  esac
done
if [[ "$count" -lt 60 ]]; then
  fail "expected at least 60 fixtures, found $count"
fi

echo "qa-guardrail: marker found through the event cwd when the process cwd has none"
# The event itself must carry the cwd; the deny_git_push fixture has none.
event="{\"tool_name\":\"Bash\",\"tool_input\":{\"command\":\"git push origin qa\"},\"cwd\":\"$ROOT\"}"
result="$(run_hook "$event" "$TEST_ROOT/elsewhere")"
if [[ "${result%%|*}" -eq 2 ]]; then
  pass "event cwd activates the guardrail"
else
  fail "event cwd activates the guardrail (exit ${result%%|*})"
fi

echo "qa-guardrail: a config with a byte order mark keeps its host lists"
BOMROOT="$TEST_ROOT/bomproject"
mkdir -p "$BOMROOT/.agents" "$BOMROOT/.ultrapowers"
{ printf '\357\273\277'; cat "$ROOT/.agents/ultrapowers.json"; } > "$BOMROOT/.agents/ultrapowers.json"
printf '%s' "1234" > "$BOMROOT/.ultrapowers/qa-active"
result="$(run_hook '{"tool_name":"Bash","tool_input":{"command":"curl -s http://prod.example.com/"}}' "$BOMROOT")"
if [[ "${result%%|*}" -eq 2 ]]; then
  pass "a forbidden host stays denied when the config starts with a BOM"
else
  fail "a forbidden host stays denied when the config starts with a BOM (exit ${result%%|*})"
fi

echo "qa-guardrail: an unreadable config denies while a run is active"
BADROOT="$TEST_ROOT/badconfig"
mkdir -p "$BADROOT/.agents" "$BADROOT/.ultrapowers"
printf '%s' '{ "qa": { "hosts": ' > "$BADROOT/.agents/ultrapowers.json"
printf '%s' "1234" > "$BADROOT/.ultrapowers/qa-active"
result="$(run_hook '{"tool_name":"Bash","tool_input":{"command":"curl -s http://prod.example.com/"}}' "$BADROOT")"
rest="${result#*|}"
if [[ "${result%%|*}" -eq 2 && "$rest" == *"QA-GUARDRAIL DENY: "* ]]; then
  pass "a config that does not parse is refused, not read as empty"
else
  fail "a config that does not parse is refused, not read as empty (exit ${result%%|*})"
fi

echo "qa-guardrail: the inert path runs on shell builtins alone"
mkdir -p "$TEST_ROOT/emptybin"
result="$(cd "$TEST_ROOT/elsewhere" && printf '%s' '{"tool_name":"Bash","tool_input":{"command":"ls"},"cwd":"/nowhere"}' | PATH="$TEST_ROOT/emptybin" "$BASH" "$HOOK" 2>&1; echo "|$?")"
if [[ "$result" == "|0" ]]; then
  pass "no marker: exit 0 and no output with an empty PATH"
else
  fail "no marker: exit 0 and no output with an empty PATH (got: $result)"
fi

echo "qa-guardrail: an active run with a PATH that resolves node but not the text tools"
mkdir -p "$TEST_ROOT/nodebin"
# node, and cygpath where it exists so node can still open the config: a rule that only
# grep enforces (stack teardown) must still deny when grep is the missing tool.
for tool in node cygpath; do
  if command -v "$tool" >/dev/null 2>&1; then
    printf '#!%s\nexec "%s" "$@"\n' "$BASH" "$(command -v "$tool")" > "$TEST_ROOT/nodebin/$tool"
    chmod +x "$TEST_ROOT/nodebin/$tool"
  fi
done
result="$(cd "$ROOT" && render "$FIXTURES/deny_compose_down.json" | PATH="$TEST_ROOT/nodebin" "$BASH" "$HOOK" 2>&1; echo "|$?")"
if [[ "${result##*|}" -eq 2 && "$result" == *"QA-GUARDRAIL DENY: "* && "$result" != *"cannot be read"* ]]; then
  pass "missing grep, sed or tr during a run is a deny, not a silent allow"
else
  fail "missing grep, sed or tr during a run is a deny, not a silent allow (got: $result)"
fi

echo "qa-guardrail: run-hook.cmd wrapper dispatches to the hook"
result="$(cd "$ROOT" && render "$FIXTURES/deny_git_push.json" | bash "$WRAPPER" qa-guardrail 2>&1; echo "|$?")"
if [[ "${result##*|}" -eq 2 ]]; then
  pass "wrapper returns the hook's exit code"
else
  fail "wrapper returns the hook's exit code (got ${result##*|})"
fi

if command -v cmd.exe >/dev/null 2>&1 && command -v cygpath >/dev/null 2>&1; then
  echo "qa-guardrail: Windows harness paths (cmd.exe wrapper, backslash hook path)"
  # Claude Code on Windows runs run-hook.cmd through cmd.exe; the deny must reach it as exit 2.
  # /c, not //c: MSYS_NO_PATHCONV=1 above keeps Git Bash from rewriting the switch.
  result="$(cd "$ROOT" && render "$FIXTURES/deny_git_push.json" | cmd.exe /c "$(cygpath -w "$WRAPPER")" qa-guardrail 2>/dev/null; echo "|$?")"
  if [[ "${result##*|}" -eq 2 ]]; then
    pass "run-hook.cmd under cmd.exe returns the hook's exit code"
  else
    fail "run-hook.cmd under cmd.exe returns the hook's exit code (got ${result##*|})"
  fi
  # cmd.exe hands bash the hook as S:\...\hooks\qa-guardrail; the write analyzer must still be found.
  event="{\"tool_name\":\"Bash\",\"tool_input\":{\"command\":\"printf x > $ROOT/repo-a/src/app.js\"}}"
  result="$(cd "$ROOT" && printf '%s' "$event" | bash "$(cygpath -w "$HOOK")" 2>&1; echo "|$?")"
  if [[ "${result##*|}" -eq 2 && "$result" == *"outside reviews/1234/"* ]]; then
    pass "a backslash hook path still finds the write analyzer"
  else
    fail "a backslash hook path still finds the write analyzer (got: ${result%%$'\n'*})"
  fi
fi

echo "qa-guardrail: Cursor shape adds a permission JSON on stdout"
result="$(cd "$ROOT" && render "$FIXTURES/deny_git_push.json" | CURSOR_PLUGIN_ROOT="$REPO_ROOT" bash "$HOOK" 2>/dev/null)"
if printf '%s' "$result" | grep -q '"permission":"deny"'; then
  pass "Cursor deny JSON emitted"
else
  fail "Cursor deny JSON emitted (got: $result)"
fi

echo "qa-guardrail fixture tests (marker absent)"
rm -f "$ROOT/.ultrapowers/qa-active"
for f in "$FIXTURES"/*.json; do
  name="$(basename "$f" .json)"
  [[ -n "$(skip_fixture "$name")" ]] && continue
  event="$(render "$f")"
  result="$(run_hook "$event" "$ROOT")"
  code="${result%%|*}"
  rest="${result#*|}"
  if [[ "$code" -eq 0 && -z "${rest//|/}" ]]; then
    pass "$name inert without marker"
  else
    fail "$name inert without marker (exit $code, output: $rest)"
  fi
done

echo "qa-guardrail registration"
if node -e '
const hooks = JSON.parse(require("fs").readFileSync(0, "utf8"));
const entries = hooks.hooks.PreToolUse || [];
const hit = entries.find((e) => e.matcher === "*" && (e.hooks || []).some((h) => h.shell === "bash" && /run-hook\.cmd" qa-guardrail$/.test(h.command)));
if (!hit) { console.error("no PreToolUse entry with matcher * dispatching qa-guardrail via run-hook.cmd with shell bash"); process.exit(1); }
' < "$REPO_ROOT/hooks/hooks.json"; then
  pass "hooks.json registers PreToolUse qa-guardrail"
else
  fail "hooks.json registers PreToolUse qa-guardrail"
fi
if node -e '
const hooks = JSON.parse(require("fs").readFileSync(0, "utf8"));
const entries = hooks.hooks.preToolUse || [];
if (!entries.some((e) => e.command === "./hooks/run-hook.cmd qa-guardrail")) { console.error("no preToolUse entry"); process.exit(1); }
' < "$REPO_ROOT/hooks/hooks-cursor.json"; then
  pass "hooks-cursor.json registers preToolUse qa-guardrail"
else
  fail "hooks-cursor.json registers preToolUse qa-guardrail"
fi
if node -e '
const m = JSON.parse(require("fs").readFileSync(0, "utf8"));
const hit = (m.capabilities.hooks || []).find((h) => h.id === "qa-guardrail" && h.event === "PreToolUse");
if (!hit) { console.error("no Muse hook qa-guardrail"); process.exit(1); }
' < "$REPO_ROOT/.muse-plugin/plugin.json"; then
  pass "Muse manifest registers qa-guardrail"
else
  fail "Muse manifest registers qa-guardrail"
fi
if grep -Fq 'hooks/qa-guardrail text eol=lf' "$REPO_ROOT/.gitattributes"; then
  pass ".gitattributes pins hooks/qa-guardrail to LF"
else
  fail ".gitattributes pins hooks/qa-guardrail to LF"
fi

if [[ "$FAILURES" -gt 0 ]]; then
  echo "STATUS: FAILED ($FAILURES failure(s))"
  exit 1
fi
echo "STATUS: PASSED"
