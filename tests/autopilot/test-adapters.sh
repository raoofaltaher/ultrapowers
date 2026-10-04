#!/usr/bin/env bash
# Contract tests for the headless harness adapters the watcher uses. Each runs only when its
# CLI is on PATH and signed in; a missing CLI is a SKIP, not a failure. One short prompt per
# harness proves the flags the engine spawns still exist and that the answer is JSON.
set -uo pipefail

FAILURES=0
pass() { echo "  [PASS] $1"; }
fail() { echo "  [FAIL] $1"; FAILURES=$((FAILURES + 1)); }
skip() { echo "  [SKIP] $1"; }

echo "autopilot headless adapters"

if command -v claude >/dev/null 2>&1; then
  out="$(timeout 120 claude -p 'Reply with exactly the two letters OK and nothing else.' --permission-mode bypassPermissions --max-turns 1 --output-format json 2>/dev/null)" || out=""
  # --output-format json prints an array of messages; the one with type "result" carries the answer.
  if printf '%s' "$out" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const j=JSON.parse(s);const list=Array.isArray(j)?j:[j];const r=list.find(m=>m&&m.type==="result")??list[list.length-1];process.exit(/OK/.test(String(r.result ?? ""))?0:1)}catch{process.exit(1)}})'; then
    pass "claude-code: -p --permission-mode bypassPermissions --max-turns --output-format json answers JSON with a result message"
  else
    fail "claude-code: -p --permission-mode bypassPermissions --max-turns --output-format json answers JSON with a result message (got: ${out:0:200})"
  fi
else
  skip "claude-code: claude is not on PATH"
fi

if command -v opencode >/dev/null 2>&1; then
  out="$(timeout 120 opencode run --format json 'Reply with exactly the two letters OK and nothing else.' 2>/dev/null)" || out=""
  if printf '%s' "$out" | grep -q 'OK'; then
    pass "opencode: run --format json answers with the text"
  elif printf '%s' "$out" | grep -q '"type":"error"'; then
    # The flags are accepted and the output is JSON; the provider or model of this machine answered
    # with an error, which is the environment's state, not the adapter's.
    skip "opencode: run --format json is accepted; this machine's provider answered an error (${out:0:120})"
  else
    fail "opencode: run --format json answers with the text (got: ${out:0:200})"
  fi
else
  skip "opencode: opencode is not on PATH"
fi

echo
if [[ "$FAILURES" -gt 0 ]]; then
  echo "STATUS: FAILED ($FAILURES)"
  exit 1
fi
echo "STATUS: PASSED"
