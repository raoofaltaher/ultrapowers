#!/usr/bin/env bash
# Team-memory hooks: silent without a store, one line with the right JSON shape
# per harness when a store exists at or above cwd, found from nested clones.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
NUDGE="$REPO_ROOT/hooks/team-memory-nudge"
POSTCOMPACT="$REPO_ROOT/hooks/team-memory-postcompact"
LIB="$REPO_ROOT/hooks/lib/team-memory-common"
WRAPPER="$REPO_ROOT/hooks/run-hook.cmd"

FAILURES=0
TEST_ROOT="$(mktemp -d)"
trap 'rm -rf "$TEST_ROOT"' EXIT

pass() { echo "  [PASS] $1"; }
fail() { echo "  [FAIL] $1"; FAILURES=$((FAILURES + 1)); }

# Fixture tree
#   $TEST_ROOT/bare             no store here or above
#   $TEST_ROOT/proj             store at proj/.agents/memory
#   $TEST_ROOT/proj/nested/app  two levels below the store
mkdir -p "$TEST_ROOT/bare" "$TEST_ROOT/proj/.agents/memory" "$TEST_ROOT/proj/nested/app"
printf '# Team memory: index\n\n## Gotchas\n\n## Decisions\n\n## Subsystems\n' > "$TEST_ROOT/proj/.agents/memory/MEMORY.md"

NUDGE_TEXT="Team-memory: if this session verified a durable, expensive-to-rediscover, non-derivable fact, save it to"
POSTCOMPACT_TEXT="Context was just compacted. If team-worthy learnings surfaced earlier and are not yet saved to"

# hook_input <cwd-json-escaped> <event> [source]
hook_input() {
  if [ -n "${3:-}" ]; then
    printf '{"session_id":"t","transcript_path":"/dev/null","cwd":"%s","hook_event_name":"%s","source":"%s"}' "$1" "$2" "$3"
  else
    printf '{"session_id":"t","transcript_path":"/dev/null","cwd":"%s","hook_event_name":"%s","prompt":"hi"}' "$1" "$2"
  fi
}

# run_hook <stdin> <ENV=val>... -- <command>...   sets OUTPUT and STATUS
run_hook() {
  local input="$1"; shift
  local -a envs=()
  while [ "$1" != "--" ]; do envs+=("$1"); shift; done
  shift
  set +e
  OUTPUT="$(printf '%s' "$input" | env -i PATH="${PATH:-}" HOME="$TEST_ROOT" "${envs[@]}" "$@" 2>&1)"
  STATUS=$?
  set -e
}

assert_silent() {
  if [ "$STATUS" -eq 0 ] && [ -z "$OUTPUT" ]; then
    pass "$1"
  else
    fail "$1"; echo "    status=$STATUS output:"; echo "$OUTPUT" | sed 's/^/      /'
  fi
}

# assert_context <description> <nested|cursor|sdk> <hookEventName> <contains-1> <contains-2>
assert_context() {
  local description="$1" shape="$2" event="$3" c1="$4" c2="$5"
  if [ "$STATUS" -ne 0 ]; then
    fail "$description"; echo "    hook exited $STATUS"; echo "$OUTPUT" | sed 's/^/      /'; return
  fi
  if printf '%s' "$OUTPUT" | EXPECT_SHAPE="$shape" EXPECT_EVENT="$event" EXPECT_C1="$c1" EXPECT_C2="$c2" node -e '
const input = require("fs").readFileSync(0, "utf8");
let payload;
try { payload = JSON.parse(input); } catch (e) { console.error(`invalid JSON: ${e.message}`); process.exit(1); }
const has = (k) => Object.prototype.hasOwnProperty.call(payload, k);
const die = (m) => { console.error(m); process.exit(1); };
const shape = process.env.EXPECT_SHAPE;
let context;
if (shape === "nested") {
  if (!has("hookSpecificOutput")) die("missing hookSpecificOutput");
  if (has("additional_context") || has("additionalContext")) die("nested output also has a top-level context field");
  const h = payload.hookSpecificOutput;
  if (!h || typeof h !== "object") die("hookSpecificOutput is not an object");
  if (h.hookEventName !== process.env.EXPECT_EVENT) die(`hookEventName ${h.hookEventName}, expected ${process.env.EXPECT_EVENT}`);
  context = h.additionalContext;
} else if (shape === "cursor") {
  if (has("hookSpecificOutput") || has("additionalContext")) die("cursor output has a non-cursor field");
  if (!has("additional_context")) die("cursor output missing additional_context");
  context = payload.additional_context;
} else if (shape === "sdk") {
  if (has("hookSpecificOutput") || has("additional_context")) die("sdk output has a non-sdk field");
  if (!has("additionalContext")) die("sdk output missing additionalContext");
  context = payload.additionalContext;
} else {
  die(`unknown shape ${shape}`);
}
if (typeof context !== "string" || context.trim() === "") die("context empty");
if (context.includes("\n")) die("context must be exactly one line");
for (const key of ["EXPECT_C1", "EXPECT_C2"]) {
  const want = process.env[key];
  if (want && !context.includes(want)) die(`context lacks: ${want}`);
}
'; then
    pass "$description"
  else
    fail "$description"; echo "    output:"; echo "$OUTPUT" | sed 's/^/      /'
  fi
}

echo "Team-memory hook syntax"
for f in "$LIB" "$NUDGE" "$POSTCOMPACT"; do
  if bash -n "$f"; then pass "bash -n $(basename "$f")"; else fail "bash -n $(basename "$f")"; fi
done

CLAUDE_ENV=(CLAUDE_PLUGIN_ROOT="$REPO_ROOT")
CURSOR_ENV=(CURSOR_PLUGIN_ROOT="$REPO_ROOT" CLAUDE_PLUGIN_ROOT="$REPO_ROOT")
COPILOT_ENV=(COPILOT_CLI=1 CLAUDE_PLUGIN_ROOT="$REPO_ROOT")
MUSE_ENV=(MUSE_PLUGIN_ROOT="$REPO_ROOT")

# The nine spec cases per hook: {absent, present, nested} x {Claude Code, Cursor, Copilot}.
for hook in nudge postcompact; do
  case "$hook" in
    nudge) script="$NUDGE"; event="UserPromptSubmit"; text="$NUDGE_TEXT"; source_arg="" ;;
    postcompact) script="$POSTCOMPACT"; event="SessionStart"; text="$POSTCOMPACT_TEXT"; source_arg="compact" ;;
  esac
  echo "$hook hook"
  for harness in claude cursor copilot; do
    case "$harness" in
      claude) envs=("${CLAUDE_ENV[@]}"); expect=nested ;;
      cursor) envs=("${CURSOR_ENV[@]}"); expect=cursor ;;
      copilot) envs=("${COPILOT_ENV[@]}"); expect=sdk ;;
    esac
    run_hook "$(hook_input "$TEST_ROOT/bare" "$event" "$source_arg")" "${envs[@]}" -- bash "$script"
    assert_silent "$hook / $harness: silent when no store exists at or above cwd"

    run_hook "$(hook_input "$TEST_ROOT/proj" "$event" "$source_arg")" "${envs[@]}" -- bash "$script"
    assert_context "$hook / $harness: one line naming .agents/memory/ when the store is at cwd" "$expect" "$event" "$text" '`.agents/memory/`'

    run_hook "$(hook_input "$TEST_ROOT/proj/nested/app" "$event" "$source_arg")" "${envs[@]}" -- bash "$script"
    assert_context "$hook / $harness: finds the store two levels up from a nested cwd" "$expect" "$event" "$text" '`../../.agents/memory/`'
  done
done

echo "Extra cases"
run_hook "$(hook_input "$TEST_ROOT/proj" UserPromptSubmit)" "${MUSE_ENV[@]}" -- bash "$NUDGE"
assert_context "nudge / Muse: nested shape with UserPromptSubmit event" nested UserPromptSubmit "$NUDGE_TEXT" '`.agents/memory/`'

run_hook "$(hook_input "$TEST_ROOT/proj" SessionStart compact)" "${MUSE_ENV[@]}" -- bash "$POSTCOMPACT"
assert_context "postcompact / Muse: nested shape with SessionStart event" nested SessionStart "$POSTCOMPACT_TEXT" '`.agents/memory/`'

run_hook "$(hook_input "$TEST_ROOT/proj" UserPromptSubmit)" "${CLAUDE_ENV[@]}" -- bash "$WRAPPER" team-memory-nudge
assert_context "run-hook.cmd dispatches team-memory-nudge" nested UserPromptSubmit "$NUDGE_TEXT" '`.agents/memory/`'

run_hook "$(hook_input "$TEST_ROOT/proj" SessionStart startup)" "${CLAUDE_ENV[@]}" -- bash "$POSTCOMPACT"
assert_silent "postcompact: silent when source is startup, not compact"

run_hook "$(hook_input "$TEST_ROOT/proj" SessionStart resume)" "${CLAUDE_ENV[@]}" -- bash "$POSTCOMPACT"
assert_silent "postcompact: silent when source is resume"

run_hook "$(hook_input "$TEST_ROOT/proj" SessionStart)" "${CLAUDE_ENV[@]}" -- bash "$POSTCOMPACT"
assert_context "postcompact: emits when the input has no source field (harness without one)" nested SessionStart "$POSTCOMPACT_TEXT" '`.agents/memory/`'

run_hook "" "${CLAUDE_ENV[@]}" -- bash -c 'cd "$1" && exec bash "$2"' _ "$TEST_ROOT/proj" "$NUDGE"
assert_context "nudge: empty stdin falls back to the process working directory" nested UserPromptSubmit "$NUDGE_TEXT" '`.agents/memory/`'

run_hook '{"session_id":"t"}' "${CLAUDE_ENV[@]}" -- bash -c 'cd "$1" && exec bash "$2"' _ "$TEST_ROOT/proj/nested/app" "$NUDGE"
assert_context "nudge: JSON without cwd falls back to the process working directory" nested UserPromptSubmit "$NUDGE_TEXT" '`../../.agents/memory/`'

run_hook '{"session_id":"t"}' "${CLAUDE_ENV[@]}" -- bash -c 'cd "$1" && exec bash "$2"' _ "$TEST_ROOT/bare" "$NUDGE"
assert_silent "nudge: JSON without cwd and no store at the process working directory is silent"

run_hook "$(hook_input "$TEST_ROOT/proj/does-not-exist" UserPromptSubmit)" "${CLAUDE_ENV[@]}" -- bash "$NUDGE"
assert_silent "nudge: cwd that no longer exists is silent and exits 0"

run_hook 'not json at all' "${CLAUDE_ENV[@]}" -- bash -c 'cd "$1" && exec bash "$2"' _ "$TEST_ROOT/bare" "$NUDGE"
assert_silent "nudge: unparsable stdin is silent and exits 0"

if command -v cygpath >/dev/null 2>&1; then
  win="$(cygpath -w "$TEST_ROOT/proj/nested/app")"
  run_hook "$(hook_input "${win//\\/\\\\}" UserPromptSubmit)" "${CLAUDE_ENV[@]}" -- bash "$NUDGE"
  assert_context "nudge: Windows-style cwd with escaped backslashes finds the store" nested UserPromptSubmit "$NUDGE_TEXT" '`../../.agents/memory/`'
else
  echo "  [SKIP] Windows-style cwd (cygpath not available)"
fi

echo "Registrations"
if node -e '
const fs = require("fs");
const hooks = JSON.parse(fs.readFileSync(process.argv[1], "utf8")).hooks;
const die = (m) => { console.error(m); process.exit(1); };
if (!/run-hook\.cmd" session-start$/.test(hooks.SessionStart[0].hooks[0].command)) die("SessionStart[0] must stay session-start");
const compact = hooks.SessionStart.find((g) => g.matcher === "compact");
if (!compact) die("no SessionStart group with matcher compact");
const pc = compact.hooks[0];
if (pc.shell !== "bash" || pc.type !== "command" || !/run-hook\.cmd" team-memory-postcompact$/.test(pc.command)) die(`bad postcompact entry: ${JSON.stringify(pc)}`);
const ups = (hooks.UserPromptSubmit || [])[0]?.hooks?.[0];
if (!ups) die("no UserPromptSubmit hook");
if (ups.shell !== "bash" || ups.type !== "command" || !/run-hook\.cmd" team-memory-nudge$/.test(ups.command)) die(`bad nudge entry: ${JSON.stringify(ups)}`);
' "$REPO_ROOT/hooks/hooks.json"; then
  pass "hooks.json registers nudge (UserPromptSubmit) and postcompact (SessionStart compact) with shell:bash"
else
  fail "hooks.json registers nudge (UserPromptSubmit) and postcompact (SessionStart compact) with shell:bash"
fi

if node -e '
const hooks = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")).hooks;
const ok = (hooks.beforeSubmitPrompt || []).some((h) => h.command === "./hooks/run-hook.cmd team-memory-nudge")
  && hooks.sessionStart.some((h) => h.command === "./hooks/run-hook.cmd session-start");
process.exit(ok ? 0 : 1);
' "$REPO_ROOT/hooks/hooks-cursor.json"; then
  pass "hooks-cursor.json registers the nudge on beforeSubmitPrompt and keeps sessionStart"
else
  fail "hooks-cursor.json registers the nudge on beforeSubmitPrompt and keeps sessionStart"
fi

if node -e '
const m = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
const hooks = m.capabilities.hooks;
const nudge = hooks.find((h) => h.id === "team-memory-nudge");
const pc = hooks.find((h) => h.id === "team-memory-postcompact");
const ok = nudge && nudge.event === "UserPromptSubmit" && nudge.command[1] === "hooks/team-memory-nudge"
  && pc && pc.event === "SessionStart" && pc.matcher === "compact" && pc.command[1] === "hooks/team-memory-postcompact"
  && hooks.some((h) => h.id === "session-start");
process.exit(ok ? 0 : 1);
' "$REPO_ROOT/.muse-plugin/plugin.json"; then
  pass "Muse manifest registers both team-memory hooks"
else
  fail "Muse manifest registers both team-memory hooks"
fi

if [[ "$FAILURES" -gt 0 ]]; then
  echo "STATUS: FAILED ($FAILURES failure(s))"
  exit 1
fi
echo "STATUS: PASSED"
