// The guardrail bridge for in-process harnesses (OpenCode, Pi). They have no shell PreToolUse
// hook, so their plugin calls this before every tool: it runs hooks/qa-guardrail with the same
// event JSON a shell-hook harness sends ({ tool_name, tool_input, cwd }) and reports the
// verdict. One rule of the hook is kept here too: nothing is spawned unless a run marker
// (.ultrapowers/qa-active or .ultrapowers/autopilot-active) exists at or above the cwd, or the
// session is a headless stage (ULTRAPOWERS_AUTOPILOT_INSIDE=1), so an ordinary session pays a
// directory walk and no process. Node built-ins only.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HOOK_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DENY_RE = /((?:QA|AUTOPILOT)-GUARDRAIL) DENY: (.*)/;

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

// The deny prefix of the run marker found at or above `startDir`: the QA profile when a QA marker
// exists (it wins when both do, as in the hook), else the autopilot profile.
export function markerPrefix(startDir) {
  const root = markerRoot(startDir);
  if (!root) return null;
  return fs.existsSync(path.join(root, '.ultrapowers', 'qa-active')) ? 'QA-GUARDRAIL' : 'AUTOPILOT-GUARDRAIL';
}

// A headless watcher stage carries ULTRAPOWERS_AUTOPILOT_INSIDE=1: the hook then treats the run
// as an autopilot stage even when the marker file is gone, and so does every entry point.
export const insideFlag = () => process.env.ULTRAPOWERS_AUTOPILOT_INSIDE === '1';

// The nearest directory at or above `startDir` holding .agents/ultrapowers.json, or null.
export function projectRoot(startDir) {
  let dir;
  try {
    dir = fs.realpathSync(path.resolve(startDir));
  } catch {
    return null;
  }
  for (;;) {
    if (fs.existsSync(path.join(dir, '.agents', 'ultrapowers.json'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

// The active run seen from `sessionDir` and the further candidates `dirs`: { prefix, root, dir }
// with `dir` the candidate it was found from, or null when no run is active. A marker found from
// any candidate wins (a candidate can add a run, never hide one). With
// ULTRAPOWERS_AUTOPILOT_INSIDE=1 and no marker the run is an autopilot stage rooted at the
// project above the session directory alone, as the hook roots it above its cwd: a hook's own
// working directory (a plugin install, itself maybe a project) never roots it. Root null: none.
export function activeRun(sessionDir, dirs = []) {
  const list = [sessionDir, ...dirs].filter((d) => typeof d === 'string' && d !== '');
  for (const d of list) {
    const root = markerRoot(d);
    if (root) return { prefix: markerPrefix(d), root, dir: d };
  }
  if (!insideFlag()) return null;
  const root = sessionDir ? projectRoot(sessionDir) : null;
  return { prefix: 'AUTOPILOT-GUARDRAIL', root, dir: sessionDir || process.cwd() };
}

// The text every harness shows for a deny: the profile's prefix, then the reason.
export const denyText = (verdict) => `${verdict.prefix || 'QA-GUARDRAIL'} DENY: ${verdict.reason}`;

// The per-call working directory a tool input carries, in any harness's spelling, or undefined:
// `workdir` (OpenCode bash, Hermes terminal, Codex shell), `working_directory` (Cursor), `Cwd`
// (Antigravity run_command), and `dir_path` on a shell call (Gemini run_shell_command; on Gemini's
// listing tools the same key names the directory listed, not a working directory).
export function perCallDir(inp) {
  if (!inp || typeof inp !== 'object' || Array.isArray(inp)) return undefined;
  const str = (v) => (typeof v === 'string' && v !== '' ? v : undefined);
  const shell = str(inp.command) !== undefined || str(inp.cmd) !== undefined;
  return str(inp.workdir) ?? str(inp.working_directory) ?? str(inp.Cwd) ?? (shell ? str(inp.dir_path) : undefined);
}

// The shell-hook event for a harness tool call. OpenCode spells the file as `filePath`, Pi as
// `path`; the hook reads `file_path`, `command` and `url`, so those are filled from the spellings
// the harness used. Everything else travels as it came, for the hook's key-material scan.
export function guardrailEvent({ toolName, input, cwd }) {
  // Copilot CLI sends the arguments as a JSON string: parse it. Anything else that is not an
  // object travels unchanged, so the hook refuses it; only a missing input is an empty one.
  let raw = input;
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) raw = parsed;
    } catch { /* kept as written */ }
  }
  if (raw === undefined || raw === null) raw = {};
  if (typeof raw !== 'object' || Array.isArray(raw)) return { tool_name: String(toolName ?? ''), tool_input: raw, cwd: String(cwd ?? '') };
  const inp = { ...raw };
  const first = (...keys) => keys.map((k) => inp[k]).find((v) => typeof v === 'string' && v !== '');
  const filePath = first('file_path', 'filePath', 'path', 'notebook_path', 'file');
  const command = first('command', 'cmd');
  const url = first('url');
  const workdir = perCallDir(inp);
  if (filePath !== undefined) inp.file_path = filePath;
  if (command !== undefined) inp.command = command;
  if (url !== undefined) inp.url = url;
  // One canonical spelling of the call's working directory; with no cwd from the harness it is
  // the event's cwd too, so the hook resolves relative paths against it.
  if (workdir !== undefined) inp.workdir = workdir;
  const evCwd = String(cwd ?? '') || (workdir !== undefined ? path.resolve(workdir) : '');
  return { tool_name: String(toolName ?? ''), tool_input: inp, cwd: evCwd };
}

// `p` resolved through the symlinks of its nearest existing ancestor (the rest may not exist yet).
function realish(p) {
  let head = path.resolve(p);
  const tail = [];
  for (;;) {
    try {
      return path.join(fs.realpathSync(head), ...tail);
    } catch {
      const parent = path.dirname(head);
      if (parent === head) return path.resolve(p);
      tail.unshift(path.basename(head));
      head = parent;
    }
  }
}

// True when `p` is `root` or inside it (case-insensitively on Windows).
function within(p, root) {
  const fold = (s) => (process.platform === 'win32' ? s.toLowerCase() : s);
  const rel = path.relative(fold(root), fold(p));
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
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
// `cwd` is the session directory and stays the event's cwd; `dirs` are further candidates (an
// entry point's workspace paths, a call's own directory). The run is looked for from every
// candidate, the session cwd and the process cwd included, and the first marker found wins: a
// candidate can add a run, never hide one. A call's own working directory outside the project
// root is denied here: the hook resolves paths against the event, not against that directory.
export function runGuardrail({ toolName, input, cwd, dirs = [], hookDir = HOOK_DIR, timeoutMs = 15000 }) {
  const givenCwd = cwd && String(cwd) ? String(cwd) : '';
  const startDir = givenCwd || process.cwd();
  const event = guardrailEvent({ toolName, input, cwd: givenCwd });
  if (!event.cwd) event.cwd = startDir;
  const callDir = perCallDir(event.tool_input);
  const callAbs = callDir !== undefined ? path.resolve(startDir, callDir) : null;
  const run = activeRun(startDir, [...dirs, process.cwd(), ...(callAbs ? [callAbs] : [])]);
  if (!run) return { deny: false };
  const { prefix } = run;
  if (!run.root) {
    return { deny: true, prefix, reason: 'an autopilot stage is running (ULTRAPOWERS_AUTOPILOT_INSIDE) outside any ultrapowers project; the call cannot be verified' };
  }
  if (callAbs && !within(realish(callAbs), run.root)) {
    return { deny: true, prefix, reason: `the call's working directory ${callAbs} is outside the project root ${run.root}; during a run a call works inside the project` };
  }
  const hook = path.join(hookDir, 'qa-guardrail');
  const bash = bashBinary();
  if (!bash || !fs.existsSync(hook)) {
    return { deny: true, prefix, reason: `the ultrapowers guardrail could not run (${!bash ? 'no bash' : 'hook missing'}); a tool call during a run is refused without it` };
  }
  const env = { ...process.env };
  delete env.CURSOR_PLUGIN_ROOT; // the verdict is read from stderr and the exit code, not from Cursor's JSON
  // The hook finds the run from its own cwd first: start it where the run was found.
  const spawnDir = [run.dir, startDir].find((d) => d && fs.existsSync(d));
  const res = spawnSync(bash, [hook], { input: `${JSON.stringify(event)}\0`, cwd: spawnDir, env, encoding: 'utf8', timeout: timeoutMs, windowsHide: true });
  if (res.status === 0) return { deny: false };
  const line = String(res.stderr ?? '').split('\n').map((l) => DENY_RE.exec(l)).find(Boolean);
  if (res.status === 2) return { deny: true, prefix: line ? line[1] : prefix, reason: line ? line[2].trim() : 'denied by the ultrapowers guardrail' };
  return { deny: true, prefix, reason: `the ultrapowers guardrail could not run (${res.error ? res.error.message : `exit ${res.status}`}); a tool call during a run is refused without it` };
}
