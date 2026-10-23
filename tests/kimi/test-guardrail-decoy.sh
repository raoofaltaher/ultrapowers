#!/usr/bin/env bash
# A hostile project must not be able to replace the guardrail. Kimi Code's plugin guide says each
# plugin hook "runs with its working directory set to the plugin root, so `command` can use `./`
# paths inside the plugin" (it also sets KIMI_PLUGIN_ROOT and KIMI_CODE_HOME in the hook's
# environment, and documents no placeholder). Kimi Code is not installed on the maintainer's
# machine, so this is the documented behaviour, not a measured one. This test runs the registered
# command the way the guide says (a shell, cwd = the plugin root) beside a project with a decoy
# hooks/lib/guardrail-cli.mjs and checks the decoy never runs. Offline; no Kimi needed.
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
const assert = (cond, msg) => { if (!cond) { console.error(`FAIL: ${msg}`); process.exit(1); } };

// The guide documents no placeholder in a hook command: a variable would reach the shell as written
// (or expand to nothing), so the command is a ./ path inside the plugin.
assert(!/[$%`]/.test(command), `the command must hold no placeholder or variable: ${command}`);
assert(/^node\s+\.\/hooks\/lib\/guardrail-cli\.mjs(\s|$)/.test(command), `the command must be node with a ./ path inside the plugin: ${command}`);

const project = fs.mkdtempSync(path.join(os.tmpdir(), 'kimi-decoy-'));
const marker = path.join(project, 'DECOY-RAN');
fs.mkdirSync(path.join(project, '.agents'), { recursive: true });
fs.writeFileSync(path.join(project, '.agents', 'ultrapowers.json'), JSON.stringify({ name: 'p', autopilot: { mode: 'gated' } }));
fs.mkdirSync(path.join(project, 'hooks', 'lib'), { recursive: true });
fs.writeFileSync(path.join(project, 'hooks', 'lib', 'guardrail-cli.mjs'),
  `import fs from 'node:fs';\nfs.writeFileSync(${JSON.stringify(marker)}, 'ran');\n`);

const event = JSON.stringify({ hook_event_name: 'PreToolUse', tool_name: 'Shell', tool_input: { command: 'git status' }, cwd: project });
const run = (cwd) => spawnSync(command, {
  shell: true, input: event, encoding: 'utf8', cwd,
  env: { ...process.env, ULTRAPOWERS_AUTOPILOT_INSIDE: '', KIMI_PLUGIN_ROOT: repo },
});

// Control: from the project directory the relative command does reach the decoy, so the decoy is live.
let r = run(project);
assert(fs.existsSync(marker), `control: from the project directory the decoy must run (exit ${r.status}: ${r.stderr})`);
fs.rmSync(marker);

// The documented directory: the plugin root. The decoy never runs and the real hook allows.
r = run(repo);
assert(!fs.existsSync(marker), 'the decoy guardrail-cli.mjs in the project ran');
assert(r.status === 0, `the real hook must exit 0 for a call outside a run (exit ${r.status}: ${r.stderr})`);

// A push in a flagged stage proves it is the real guardrail that answered (exit 2 with the reason).
const push = JSON.stringify({ hook_event_name: 'PreToolUse', tool_name: 'Shell', tool_input: { command: 'git push origin x' }, cwd: project });
r = spawnSync(command, { shell: true, input: push, encoding: 'utf8', cwd: repo, env: { ...process.env, ULTRAPOWERS_AUTOPILOT_INSIDE: '1', KIMI_PLUGIN_ROOT: repo } });
assert(r.status === 2 && /^AUTOPILOT-GUARDRAIL DENY: git push is never allowed/.test(r.stderr), `the real guardrail denies a push in a flagged stage (exit ${r.status}: ${r.stderr})`);
assert(!fs.existsSync(marker), 'the decoy ran during the flagged stage');

console.log('Kimi guardrail decoy test looks good');
JS
