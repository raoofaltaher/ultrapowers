#!/usr/bin/env bash
# The Antigravity plugin hooks file at the repository root (Antigravity's own shape: named
# groups, camelCase payload, {decision, reason} on stdout) runs the guardrail through its node
# entry with --antigravity. CI-safe: no agy needed.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
fail() { echo "FAIL: $*" >&2; exit 1; }

echo "test-antigravity-hooks: checking the plugin hooks file"
[ -f "$REPO_ROOT/hooks.json" ] || fail "hooks.json missing at the repository root"
node -e '
const fs = require("fs");
const h = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
const group = h["ultrapowers-guardrail"];
if (!group || group.enabled !== true) throw new Error("ultrapowers-guardrail group missing or disabled");
const pre = group.PreToolUse;
if (!Array.isArray(pre) || pre.length !== 1) throw new Error("one PreToolUse matcher expected");
const cmd = pre[0].hooks[0].command;
if (!/guardrail-cli\.mjs --antigravity/.test(cmd)) throw new Error(`the command must run guardrail-cli.mjs --antigravity, got ${cmd}`);
if (Object.keys(group).some((k) => !["enabled", "PreToolUse"].includes(k))) throw new Error("only PreToolUse: SessionStart is served by the plugin SessionStart hook");
' "$REPO_ROOT/hooks.json" || fail "hooks.json shape"
[ -f "$REPO_ROOT/hooks/lib/guardrail-cli.mjs" ] || fail "hooks/lib/guardrail-cli.mjs missing"
echo "test-antigravity-hooks: OK"
