// The guardrail bridge for in-process harnesses (OpenCode, Pi). They have no shell PreToolUse
// hook, so their plugin calls this before every tool: it runs hooks/qa-guardrail with the same
// event JSON a shell-hook harness sends ({ tool_name, tool_input, cwd }) and reports the
// verdict. One rule of the hook is kept here too: nothing is spawned unless a run marker
// (.ultrapowers/qa-active or .ultrapowers/autopilot-active) exists at or above the cwd, so an
// ordinary session pays a directory walk and no process. Node built-ins only.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HOOK_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DENY_RE = /(?:QA|AUTOPILOT)-GUARDRAIL DENY: (.*)/;

// The directory holding a run marker at or above `startDir`, or null.
export function markerRoot(startDir) {
  let dir;
  try {
    dir = fs.realpathSync(path.resolve(startDir));
  } catch {
    return null;
  }
  for (;;) {
    if (fs.existsSync(path.join(dir, '.ultrapowers', 'qa-active')) || fs.existsSync(path.join(dir, '.ultrapowers', 'autopilot-active'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

// The shell-hook event for a harness tool call. OpenCode spells the file as `filePath`, Pi as
// `path`; the hook reads `file_path`, `command` and `url`, so those are filled from the spellings
// the harness used. Everything else travels as it came, for the hook's key-material scan.
export function guardrailEvent({ toolName, input, cwd }) {
  const inp = input && typeof input === 'object' ? { ...input } : {};
  const first = (...keys) => keys.map((k) => inp[k]).find((v) => typeof v === 'string' && v !== '');
  const filePath = first('file_path', 'filePath', 'path', 'notebook_path', 'file');
  const command = first('command', 'cmd');
  const url = first('url');
  if (filePath !== undefined) inp.file_path = filePath;
  if (command !== undefined) inp.command = command;
  if (url !== undefined) inp.url = url;
  return { tool_name: String(toolName ?? ''), tool_input: inp, cwd: String(cwd ?? '') };
}

// Git for Windows bash, found the way hooks/run-hook.cmd finds it; `bash` on PATH elsewhere.
// The WSL launcher in System32 is never used: it fails when no distribution is installed.
function bashBinary() {
  if (process.platform !== 'win32') return 'bash';
  const candidates = [
    'C:\\Program Files\\Git\\bin\\bash.exe',
    'C:\\Program Files (x86)\\Git\\bin\\bash.exe',
    process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'Programs', 'Git', 'bin', 'bash.exe') : null,
  ].filter(Boolean);
  for (const c of candidates) if (fs.existsSync(c)) return c;
  const system32 = (process.env.SystemRoot ?? 'C:\\Windows').toLowerCase();
  for (const dir of (process.env.PATH ?? '').split(path.delimiter)) {
    const c = path.join(dir, 'bash.exe');
    if (dir && !dir.toLowerCase().startsWith(system32) && fs.existsSync(c)) return c;
  }
  return null;
}

// Runs the guardrail for one tool call. { deny: false } when no run is active or the hook
// allows; { deny: true, reason } when it denies, or when a run is active and the hook cannot run
// (no bash, no hook file): an active run without its brake fails closed, as the hook itself does.
export function runGuardrail({ toolName, input, cwd, hookDir = HOOK_DIR, timeoutMs = 15000 }) {
  const startDir = cwd && String(cwd) ? String(cwd) : process.cwd();
  if (!markerRoot(startDir)) return { deny: false };
  const hook = path.join(hookDir, 'qa-guardrail');
  const bash = bashBinary();
  if (!bash || !fs.existsSync(hook)) {
    return { deny: true, reason: `the ultrapowers guardrail could not run (${!bash ? 'no bash' : 'hook missing'}); a tool call during a run is refused without it` };
  }
  const event = guardrailEvent({ toolName, input, cwd: startDir });
  const env = { ...process.env };
  delete env.CURSOR_PLUGIN_ROOT; // the verdict is read from stderr and the exit code, not from Cursor's JSON
  const res = spawnSync(bash, [hook], { input: `${JSON.stringify(event)}\0`, cwd: fs.existsSync(startDir) ? startDir : undefined, env, encoding: 'utf8', timeout: timeoutMs, windowsHide: true });
  if (res.status === 0) return { deny: false };
  const line = String(res.stderr ?? '').split('\n').map((l) => DENY_RE.exec(l)).find(Boolean);
  if (res.status === 2) return { deny: true, reason: line ? line[1].trim() : 'denied by the ultrapowers guardrail' };
  return { deny: true, reason: `the ultrapowers guardrail could not run (${res.error ? res.error.message : `exit ${res.status}`}); a tool call during a run is refused without it` };
}
