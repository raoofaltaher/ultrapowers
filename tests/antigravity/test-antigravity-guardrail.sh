#!/usr/bin/env bash
# The Antigravity guardrail hook (the root hooks.json command, run from the plugin root) judges a
# call the way hooks/qa-guardrail does and answers Antigravity's { decision, reason } JSON.
# Offline; needs node and bash (Git Bash on Windows). No agy needed.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

echo "test-antigravity-guardrail: running the hook command"
node - "$REPO_ROOT" <<'JS'
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const repo = process.argv[2];
const command = JSON.parse(fs.readFileSync(path.join(repo, 'hooks.json'), 'utf8'))['ultrapowers-guardrail'].PreToolUse[0].hooks[0].command;
const parts = command.split(/\s+/);
if (parts[0] !== 'node') throw new Error(`the Antigravity guardrail hook must run under node, got ${command}`);

function project({ marker = false } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agy-guardrail-'));
  fs.mkdirSync(path.join(root, '.agents'), { recursive: true });
  fs.mkdirSync(path.join(root, '.ultrapowers'), { recursive: true });
  fs.writeFileSync(path.join(root, '.agents', 'ultrapowers.json'), JSON.stringify({ name: 'p', autopilot: { mode: 'gated' } }));
  if (marker) fs.writeFileSync(path.join(root, '.ultrapowers', 'autopilot-active'), JSON.stringify({ ticket: 'GH-16', branch: 'GH-16-x', scope: ['.'], stage: 'execute' }));
  return root;
}
const hook = (event, { env = {}, cwd = repo } = {}) => {
  // the script path is relative to the plugin root; the process cwd is the case's own
  const args = parts.slice(1).map((a) => (a.endsWith('.mjs') ? path.resolve(repo, a) : a));
  const r = spawnSync(process.execPath, args, {
    input: JSON.stringify(event), encoding: 'utf8', cwd, env: { ...process.env, ULTRAPOWERS_AUTOPILOT_INSIDE: '', ...env },
  });
  if (r.status !== 0) throw new Error(`the hook must exit 0 and answer JSON (exit ${r.status}: ${r.stderr})`);
  return JSON.parse(r.stdout);
};
const assert = (cond, msg) => { if (!cond) { console.error(`FAIL: ${msg}`); process.exit(1); } };
const runCommand = (cmd, Cwd, workspacePaths) => ({ toolCall: { name: 'run_command', args: { CommandLine: cmd, ...(Cwd ? { Cwd } : {}) } }, ...(workspacePaths ? { workspacePaths } : {}) });

// A headless stage (ULTRAPOWERS_AUTOPILOT_INSIDE=1) is guarded even when the marker is gone.
const plain = project();
let out = hook(runCommand('git push origin x', plain, [plain]));
assert(out.decision === 'allow', `no marker, no flag: inert (${JSON.stringify(out)})`);
out = hook(runCommand('git push origin x', plain, [plain]), { env: { ULTRAPOWERS_AUTOPILOT_INSIDE: '1' } });
assert(out.decision === 'deny' && /^AUTOPILOT-GUARDRAIL DENY: git push is never allowed/.test(out.reason), `the flag keeps the envelope (${JSON.stringify(out)})`);

// The call's own Cwd never replaces the session directory: a run_command whose Cwd points
// outside the project is still judged by the marker under the workspace or the process cwd.
const stage = project({ marker: true });
const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'agy-outside-'));
out = hook(runCommand('git push origin GH-16-x', stage, [stage]));
assert(out.decision === 'deny', `Cwd in the project: denied (${JSON.stringify(out)})`);
out = hook(runCommand('git push origin GH-16-x', outside, [stage]), { cwd: outside });
assert(out.decision === 'deny', `Cwd outside, the workspace holds the marker: denied (${JSON.stringify(out)})`);
out = hook(runCommand('git push origin GH-16-x', outside), { cwd: stage });
assert(out.decision === 'deny', `Cwd outside, no workspacePaths, the process cwd holds the marker: denied (${JSON.stringify(out)})`);

// The call's Cwd is its working directory: outside the project root it is refused outright.
out = hook(runCommand('echo x > config', outside, [stage]));
assert(out.decision === 'deny' && /outside the project root/.test(out.reason), `Cwd outside the project: refused (${JSON.stringify(out)})`);
out = hook(runCommand('git status', path.join(stage, '.agents'), [stage]));
assert(out.decision === 'allow', `Cwd inside the project: the hook decides (${JSON.stringify(out)})`);

// A run record, .ultrapowers/runs/<run>.json, bound to no session unless one is named (Antigravity
// names no session, so a record bound to one never guards its calls).
function record(root, profile, id, session = null) {
  const run = `${profile}-${id}-0a1b2c3d`;
  fs.mkdirSync(path.join(root, '.ultrapowers', 'runs'), { recursive: true });
  fs.writeFileSync(path.join(root, '.ultrapowers', 'runs', `${run}.json`), JSON.stringify({ run, profile, id, session, startedAt: new Date().toISOString() }));
}

// A vulnerability hunt (a hunt record): the HUNT profile denies a push, allows an audit and refuses a source write.
const hunt = project();
record(hunt, 'hunt', 'audit-2026-10-11');
out = hook(runCommand('git push origin x', hunt, [hunt]));
assert(out.decision === 'deny' && /^HUNT-GUARDRAIL DENY: /.test(out.reason), `a push during a hunt: denied with the HUNT prefix (${JSON.stringify(out)})`);
out = hook(runCommand('npm audit --package-lock-only --json', hunt, [hunt]));
assert(out.decision === 'allow', `an audit during a hunt: allowed (${JSON.stringify(out)})`);
out = hook({ toolCall: { name: 'write_to_file', args: { TargetFile: path.join(hunt, 'repo-a', 'src', 'x.ts'), CodeContent: 'x' } }, workspacePaths: [hunt] });
assert(out.decision === 'deny' && /^HUNT-GUARDRAIL DENY: /.test(out.reason), `a source write during a hunt: denied (${JSON.stringify(out)})`);

// A record in a parent project does not guard a nested project (its own .agents/ultrapowers.json); the
// nested project's own record does. A record bound to a session guards no Antigravity call.
const parent = project();
record(parent, 'qa', 'GH-16');
const nested = path.join(parent, 'repo-a');
fs.mkdirSync(path.join(nested, '.agents'), { recursive: true });
fs.writeFileSync(path.join(nested, '.agents', 'ultrapowers.json'), JSON.stringify({ name: 'nested' }));
out = hook(runCommand('git push origin x', parent, [parent]));
assert(out.decision === 'deny' && /^QA-GUARDRAIL DENY: /.test(out.reason), `a push in the project that holds the record: denied (${JSON.stringify(out)})`);
out = hook(runCommand('git push origin x', nested, [nested]), { cwd: nested });
assert(out.decision === 'allow', `a nested project is not guarded by its parent's record (${JSON.stringify(out)})`);
record(nested, 'hunt', 'audit-2026-10-11');
out = hook(runCommand('git push origin x', nested, [nested]), { cwd: nested });
assert(out.decision === 'deny' && /^HUNT-GUARDRAIL DENY: /.test(out.reason), `the nested project's own record guards it (${JSON.stringify(out)})`);
const bound = project();
record(bound, 'qa', 'GH-16', 'S1');
out = hook(runCommand('git push origin x', bound, [bound]), { cwd: bound });
assert(out.decision === 'allow', `a record bound to a session guards no Antigravity call (${JSON.stringify(out)})`);

console.log('test-antigravity-guardrail: OK');
JS
