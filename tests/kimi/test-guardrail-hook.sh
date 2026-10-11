#!/usr/bin/env bash
# The Kimi PreToolUse hook (the manifest's command, run from the plugin root) judges a call the
# way hooks/qa-guardrail does: exit 2 and the reason on stderr for a deny, exit 0 for an allow.
# Offline; needs node and bash (Git Bash on Windows).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

node - "$REPO_ROOT" <<'JS'
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const repo = process.argv[2];
const manifest = JSON.parse(fs.readFileSync(path.join(repo, '.kimi-plugin', 'plugin.json'), 'utf8'));
const command = manifest.hooks.find((h) => h.event === 'PreToolUse').command;
const parts = command.split(/\s+/);
if (parts[0] !== 'node') throw new Error(`the Kimi guardrail hook must run under node, got ${command}`);

function project() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kimi-guardrail-'));
  fs.mkdirSync(path.join(root, '.agents'), { recursive: true });
  fs.writeFileSync(path.join(root, '.agents', 'ultrapowers.json'), JSON.stringify({ name: 'p', autopilot: { mode: 'gated' } }));
  return root;
}
const hook = (event, env = {}) => spawnSync(process.execPath, parts.slice(1), {
  input: JSON.stringify(event), encoding: 'utf8', cwd: repo, env: { ...process.env, ULTRAPOWERS_AUTOPILOT_INSIDE: '', ...env },
});
const assert = (cond, msg) => { if (!cond) { console.error(`FAIL: ${msg}`); process.exit(1); } };

const root = project();
const push = { hook_event_name: 'PreToolUse', tool_name: 'Shell', tool_input: { command: 'git push origin x' }, cwd: root };
let r = hook(push);
assert(r.status === 0, `no marker, no flag: inert (exit ${r.status}: ${r.stderr})`);

// A headless stage (ULTRAPOWERS_AUTOPILOT_INSIDE=1) is guarded even when the marker is gone.
r = hook(push, { ULTRAPOWERS_AUTOPILOT_INSIDE: '1' });
assert(r.status === 2 && /^AUTOPILOT-GUARDRAIL DENY: git push is never allowed/.test(r.stderr), `the flag keeps the envelope (exit ${r.status}: ${r.stderr})`);
r = hook({ ...push, tool_input: { command: 'git status' } }, { ULTRAPOWERS_AUTOPILOT_INSIDE: '1' });
assert(r.status === 0, `a read passes inside the flagged stage (exit ${r.status}: ${r.stderr})`);

console.log('Kimi guardrail hook looks good');
JS
