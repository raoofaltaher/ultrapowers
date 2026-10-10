#!/usr/bin/env node
// A node entry point for the guardrail, for harnesses whose hook command runs under node rather
// than bash (Kimi Code's plugin hooks, Antigravity's plugin hooks, Hermes' plugin): reads the hook
// event JSON on stdin, runs hooks/qa-guardrail through the bridge, and answers the way every
// harness understands: exit 2 with the reason on stderr for a deny, exit 0 for an allow. With
// --antigravity the event is Antigravity's ({ toolCall: { name, args }, workspacePaths }) and the
// answer is its JSON ({ decision, reason }) on stdout. Node built-ins only.
import { runGuardrail } from './guardrail-bridge.mjs';

const args = process.argv.slice(2);
const antigravity = args.includes('--antigravity');

let raw = '';
try {
  raw = (await import('node:fs')).readFileSync(0, 'utf8');
} catch {
  raw = '';
}

// Antigravity tool names to the shell-hook vocabulary the guardrail already reads.
const AG_TOOLS = { run_command: 'Bash', write_to_file: 'Write', replace_file_content: 'Edit', multi_replace_file_content: 'Edit', view_file: 'Read', call_mcp_tool: 'mcp__tool' };

export function eventFrom(text, { antigravity: ag = false } = {}) {
  let ev;
  try {
    ev = JSON.parse(text.replace(/\0+$/, ''));
  } catch {
    return null;
  }
  if (!ev || typeof ev !== 'object') return null;
  // An array has no tool name and no input: it goes to the hook as written, which refuses it
  // while a run is active.
  if (Array.isArray(ev)) return { toolName: '', input: ev, cwd: process.cwd() };
  if (ag) {
    const call = ev.toolCall ?? {};
    const name = String(call.name ?? '');
    const argsIn = call.args && typeof call.args === 'object' ? call.args : {};
    const input = { ...argsIn };
    if (typeof argsIn.CommandLine === 'string') input.command = argsIn.CommandLine;
    if (typeof argsIn.TargetFile === 'string') input.file_path = argsIn.TargetFile;
    if (typeof argsIn.AbsolutePath === 'string') input.file_path = argsIn.AbsolutePath;
    const cwd = typeof argsIn.Cwd === 'string' ? argsIn.Cwd : Array.isArray(ev.workspacePaths) && ev.workspacePaths[0] ? ev.workspacePaths[0] : process.cwd();
    return { toolName: AG_TOOLS[name] ?? name, input, cwd };
  }
  return { toolName: ev.tool_name ?? ev.toolName ?? '', input: ev.tool_input ?? ev.toolArgs ?? ev.input, cwd: ev.cwd ?? process.cwd() };
}

if (process.argv[1] && /guardrail-cli\.mjs$/.test(process.argv[1].replace(/\\/g, '/'))) {
  const ev = eventFrom(raw, { antigravity });
  // An event that cannot be read is refused only while a run is active; the bridge decides that.
  const verdict = ev ? runGuardrail(ev) : runGuardrail({ toolName: '', input: {}, cwd: process.cwd() }).deny
    ? { deny: true, reason: 'the tool event could not be parsed; an uninspectable call is refused during a run' }
    : { deny: false };
  if (antigravity) {
    process.stdout.write(`${JSON.stringify(verdict.deny ? { decision: 'deny', reason: `ultrapowers guardrail: ${verdict.reason}` } : { decision: 'allow' })}\n`);
    process.exit(0);
  }
  if (verdict.deny) {
    process.stderr.write(`AUTOPILOT-GUARDRAIL DENY: ${verdict.reason}\n`);
    process.exit(2);
  }
  process.exit(0);
}
