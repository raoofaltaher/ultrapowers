#!/usr/bin/env bash
# Fixture-driven tests for hooks/qa-guardrail.
# Pass 1: marker present -> deny_* fixtures exit 2 with a QA-GUARDRAIL DENY line, allow_* exit 0.
# Pass 2: marker absent -> every fixture exits 0 and prints nothing.
# Pass 3: registration files name the hook.
# Fixtures may contain {{ROOT}} (POSIX path of the temp project), {{WINROOT}} (its Windows
# form, JSON-escaped; fixtures ending in _winpath run only where cygpath exists).
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
cat > "$ROOT/.agents/ultrapowers.json" <<'JSON'
{
  "name": "sample",
  "pluginVersion": "1.0.0",
  "repos": [ { "name": "repo-a", "path": "repo-a", "defaultBranch": "main" } ],
  "qa": {
    "urls": { "frontend": "http://localhost:3000", "backendHealth": "http://localhost:8080/health", "idp": "https://idp.example.com", "observability": "" },
    "hosts": { "allowed": ["localhost", "127.0.0.1", "app.example.com", "backend-container"], "forbidden": ["prod.example.com", "192.0.2.10"] }
  }
}
JSON
printf '%s' "1234" > "$ROOT/.ultrapowers/qa-active"

WINROOT_JSON=""
if command -v cygpath >/dev/null 2>&1; then
  winroot="$(cygpath -w "$ROOT")"
  WINROOT_JSON="${winroot//\\/\\\\}"
fi

render() {
  # $1 fixture path -> stdout with placeholders substituted. Bash substitution, not sed:
  # sed would treat the JSON-escaped backslashes in WINROOT_JSON as escapes and halve them.
  local text
  text="$(cat "$1")"
  text="${text//\{\{ROOT\}\}/$ROOT}"
  text="${text//\{\{WINROOT\}\}/$WINROOT_JSON}"
  printf '%s' "$text"
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
  case "$name" in
    *_winpath)
      if [[ -z "$WINROOT_JSON" ]]; then
        echo "  [SKIP] $name (no cygpath on this platform)"
        continue
      fi ;;
  esac
  count=$((count + 1))
  event="$(render "$f")"
  result="$(run_hook "$event" "$ROOT")"
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

echo "qa-guardrail: run-hook.cmd wrapper dispatches to the hook"
result="$(cd "$ROOT" && render "$FIXTURES/deny_git_push.json" | bash "$WRAPPER" qa-guardrail 2>&1; echo "|$?")"
if [[ "${result##*|}" -eq 2 ]]; then
  pass "wrapper returns the hook's exit code"
else
  fail "wrapper returns the hook's exit code (got ${result##*|})"
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
  case "$name" in *_winpath) [[ -z "$WINROOT_JSON" ]] && continue ;; esac
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
