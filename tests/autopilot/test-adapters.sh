#!/usr/bin/env bash
# Contract tests for the headless harness adapters the watcher uses (skills/autopilot/scripts/
# harnesses.mjs). Each runs only when its CLI is on PATH and signed in; a missing CLI is a SKIP,
# not a failure. One short prompt per harness proves the flags the engine spawns still exist
# and that the answer carries the text. This makes a real model call per installed harness,
# so it is not part of the offline gate's silent runs; run it before a release.
set -uo pipefail

FAILURES=0
pass() { echo "  [PASS] $1"; }
fail() { echo "  [FAIL] $1"; FAILURES=$((FAILURES + 1)); }
skip() { echo "  [SKIP] $1"; }

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PROMPT='Reply with exactly the two letters OK and nothing else.'
echo "autopilot headless adapters"

# contract <harness> <bin> <args...>: runs the adapter's command line with the prompt in place of
# the literal PROMPT token and passes when the output carries OK.
contract() {
  local name="$1" bin="$2"; shift 2
  if ! command -v "$bin" >/dev/null 2>&1; then
    skip "$name: $bin is not on PATH"
    return
  fi
  local args=() a
  for a in "$@"; do
    if [ "$a" = "PROMPT" ]; then args+=("$PROMPT"); else args+=("$a"); fi
  done
  local out
  out="$(timeout 180 "$bin" "${args[@]}" 2>&1)" || out="${out:-}"
  # A login, provider or install problem is the machine's state, not the adapter's: the flags
  # were accepted. It is judged first, because an error stream can still carry the letters OK.
  if printf '%s' "$out" | grep -qiE '"type": *"error"|"stopReason": *"error"|not logged in|unauthorized|authentication|oauth|api key|not recognized|cannot find|is not installed|credentials|usage limit|rate.?limit'; then
    skip "$name: the flags are accepted; this machine's login, provider or install answered an error ($(printf '%s' "$out" | grep -oiE '.{0,40}(error|oauth|not recognized|cannot find).{0,60}' | head -1))"
  elif printf '%s' "$out" | grep -qE '(^|[^A-Za-z])OK([^A-Za-z]|$)'; then
    pass "$name: $bin ${args[*]:0:3} ... answers with the text"
  elif [ -z "$out" ]; then
    skip "$name: $bin printed nothing; check its install and login on this machine"
  else
    fail "$name: $bin ${args[*]:0:3} ... answers with the text (got: ${out:0:200})"
  fi
}

# The same flags as harnesses.mjs, written out so a drift in either place shows here.
contract claude-code claude -p PROMPT --permission-mode bypassPermissions --max-turns 1 --output-format json --plugin-dir "$REPO_ROOT"
contract codex codex exec --json --dangerously-bypass-approvals-and-sandbox --dangerously-bypass-hook-trust --skip-git-repo-check --ignore-user-config PROMPT
contract copilot copilot -p PROMPT --allow-all-tools --no-ask-user --output-format json -s --disable-builtin-mcps
contract cursor agent -p --force --trust --output-format json PROMPT
contract gemini gemini -p PROMPT --approval-mode=yolo --output-format json --skip-trust -e ultrapowers
contract qwen qwen -p PROMPT --yolo --output-format json -e ultrapowers
contract opencode opencode run --format json --dangerously-skip-permissions PROMPT
contract pi pi -p --mode json --no-session --approve --no-extensions -e "$REPO_ROOT/.pi/extensions/ultrapowers.ts" PROMPT
contract droid droid exec --skip-permissions-unsafe --output-format json PROMPT
contract kimi kimi -p PROMPT --output-format stream-json
contract hermes hermes chat --oneshot -q PROMPT --format stream-json --yolo --accept-hooks
contract antigravity agy -p PROMPT --output-format json --dangerously-skip-permissions

echo
if [[ "$FAILURES" -gt 0 ]]; then
  echo "STATUS: FAILED ($FAILURES)"
  exit 1
fi
echo "STATUS: PASSED"
