#!/usr/bin/env bash
# An Antigravity MCP call ({ name: "call_mcp_tool", args: { ServerName, ToolName, Arguments } },
# measured on agy 1.3.3) keeps its server and tool in the name the guardrail judges:
# mcp__<server>__<tool>. A name that cannot be read maps to mcp__unreadable__call_mcp_tool.
# Offline; no agy needed.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

echo "test-antigravity-mcp: mapping call_mcp_tool"
node - "$REPO_ROOT" <<'JS'
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const repo = process.argv[2];
const assert = (cond, msg) => { if (!cond) { console.error(`FAIL: ${msg}`); process.exit(1); } };

(async () => {
  const { eventFrom } = await import(`file:///${path.join(repo, 'hooks', 'lib', 'guardrail-cli.mjs').replace(/\\/g, '/')}`);
  const mcp = (args) => JSON.stringify({ toolCall: { name: 'call_mcp_tool', args }, workspacePaths: [repo] });
  const name = (args) => eventFrom(mcp(args), { antigravity: true }).toolName;

  // A readable call: the server and the tool, as agy names them (a plugin server is <plugin>_<server>).
  assert(name({ ServerName: 'github', ToolName: 'create_issue_comment', Arguments: {} }) === 'mcp__github__create_issue_comment', 'a readable call keeps server and tool');
  assert(name({ ServerName: 'harness-probe_probe-srv', ToolName: 'echo_probe', Arguments: { text: 'hi' } }) === 'mcp__harness-probe_probe-srv__echo_probe', 'a plugin server name keeps its - and _');
  const ev = eventFrom(mcp({ ServerName: 'github', ToolName: 'get_issue', Arguments: { id: 1 } }), { antigravity: true });
  assert(ev.input.Arguments && ev.input.Arguments.id === 1, 'the call arguments stay in the input');

  // A missing, empty, blank or non-string server or tool: the unreadable name.
  const unreadable = 'mcp__unreadable__call_mcp_tool';
  assert(name({ ToolName: 'create_issue' }) === unreadable, 'a call with no server');
  assert(name({ ServerName: 'github' }) === unreadable, 'a call with no tool');
  assert(name({}) === unreadable, 'a call with neither');
  assert(name({ ServerName: '', ToolName: 'x' }) === unreadable, 'an empty server');
  assert(name({ ServerName: '   ', ToolName: 'x' }) === unreadable, 'a blank server');
  assert(name({ ServerName: { a: 1 }, ToolName: 'x' }) === unreadable, 'a server that is not a string');
  assert(name({ ServerName: 'github', ToolName: 7 }) === unreadable, 'a tool that is not a string');
  assert(eventFrom(JSON.stringify({ toolCall: { name: 'call_mcp_tool' } }), { antigravity: true }).toolName === unreadable, 'a call with no args at all');

  // Odd characters become _; the name stays [A-Za-z0-9_-] between the two markers.
  const odd = name({ ServerName: 'my server/../x.y', ToolName: 'do:it now' });
  assert(odd === 'mcp__my_server____x_y__do_it_now', `odd characters are replaced (${odd})`);
  assert(/^mcp__[A-Za-z0-9_-]+$/.test(odd), 'only [A-Za-z0-9_-] after the marker');
  assert(name({ ServerName: 'git\nhub', ToolName: 'a$(b)' }) === 'mcp__git_hub__a__b_', 'control characters and shell syntax are replaced');

  // Other tools keep their mapping.
  assert(eventFrom(JSON.stringify({ toolCall: { name: 'run_command', args: { CommandLine: 'ls' } } }), { antigravity: true }).toolName === 'Bash', 'run_command is still Bash');

  // End to end through the hook: a tracker write by MCP is denied during an autopilot stage; a read passes.
  const project = fs.mkdtempSync(path.join(os.tmpdir(), 'agy-mcp-'));
  fs.mkdirSync(path.join(project, '.agents'), { recursive: true });
  fs.mkdirSync(path.join(project, '.ultrapowers'), { recursive: true });
  fs.writeFileSync(path.join(project, '.agents', 'ultrapowers.json'), JSON.stringify({ name: 'p', autopilot: { mode: 'gated' } }));
  fs.writeFileSync(path.join(project, '.ultrapowers', 'autopilot-active'), JSON.stringify({ ticket: 'GH-16', branch: 'GH-16-x', scope: ['.'], stage: 'execute' }));
  const hook = (args) => {
    const r = spawnSync(process.execPath, [path.join(repo, 'hooks', 'lib', 'guardrail-cli.mjs'), '--antigravity'], {
      input: JSON.stringify({ toolCall: { name: 'call_mcp_tool', args }, workspacePaths: [project] }), encoding: 'utf8', cwd: project, env: { ...process.env, ULTRAPOWERS_AUTOPILOT_INSIDE: '' },
    });
    if (r.status !== 0) throw new Error(`the hook must exit 0 and answer JSON (exit ${r.status}: ${r.stderr})`);
    return JSON.parse(r.stdout);
  };
  let out = hook({ ServerName: 'github', ToolName: 'create_issue_comment', Arguments: { body: 'x' } });
  assert(out.decision === 'deny' && /^AUTOPILOT-GUARDRAIL DENY: /.test(out.reason), `a tracker write by MCP during a stage: denied (${JSON.stringify(out)})`);
  out = hook({ ServerName: 'github', ToolName: 'get_issue', Arguments: { id: 1 } });
  assert(out.decision === 'allow', `a tracker read by MCP during a stage: allowed (${JSON.stringify(out)})`);

  console.log('test-antigravity-mcp: OK');
})().catch((e) => { console.error(`FAIL: ${e.stack || e}`); process.exit(1); });
JS
