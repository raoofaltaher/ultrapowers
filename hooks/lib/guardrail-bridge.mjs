// The guardrail bridge for in-process harnesses (OpenCode, Pi). They have no shell PreToolUse
// hook, so their plugin calls this before every tool: it runs hooks/qa-guardrail with the same
// event JSON a shell-hook harness sends ({ tool_name, tool_input, cwd }) and reports the
// verdict. One rule of the hook is kept here too: nothing is spawned unless a run marker
// (.ultrapowers/qa-active, hunt-active or autopilot-active) exists at or above the cwd, or the
// session is a headless stage (ULTRAPOWERS_AUTOPILOT_INSIDE=1), so an ordinary session pays a
// directory walk and no process. Node built-ins only.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HOOK_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DENY_RE = /((?:QA|HUNT|AUTOPILOT)-GUARDRAIL) DENY: (.*)/;

// The run markers and the deny prefix of each, in the order the hook applies them when several
// exist in one directory: the QA run, the vulnerability hunt, the autopilot stage.
const RUN_MARKERS = ['qa-active', 'hunt-active', 'autopilot-active'];
const MARKER_PREFIX = { 'qa-active': 'QA-GUARDRAIL', 'hunt-active': 'HUNT-GUARDRAIL', 'autopilot-active': 'AUTOPILOT-GUARDRAIL' };

// The directory holding a run marker at or above `startDir`, or null.
export function markerRoot(startDir) {
  let dir;
  try {
    dir = fs.realpathSync.native(path.resolve(startDir));
  } catch {
    return null;
  }
  for (;;) {
    if (RUN_MARKERS.some((m) => fs.existsSync(path.join(dir, '.ultrapowers', m)))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

// The deny prefix of the run marker found at or above `startDir`: the first of qa, hunt, autopilot
// that exists in the directory holding a marker, as in the hook.
export function markerPrefix(startDir) {
  const root = markerRoot(startDir);
  if (!root) return null;
  const marker = RUN_MARKERS.find((m) => fs.existsSync(path.join(root, '.ultrapowers', m)));
  return MARKER_PREFIX[marker] ?? 'AUTOPILOT-GUARDRAIL';
}

// A headless watcher stage carries ULTRAPOWERS_AUTOPILOT_INSIDE=1: the hook then treats the run
// as an autopilot stage even when the marker file is gone, and so does every entry point.
export const insideFlag = () => process.env.ULTRAPOWERS_AUTOPILOT_INSIDE === '1';

// The nearest directory at or above `startDir` holding .agents/ultrapowers.json, or null.
export function projectRoot(startDir) {
  let dir;
  try {
    dir = fs.realpathSync.native(path.resolve(startDir));
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
// Every working-directory spelling the input carries, in the order above (a decoy under one key
// must not hide an outside directory under another).
export function perCallDirs(inp) {
  if (!inp || typeof inp !== 'object' || Array.isArray(inp)) return [];
  const str = (v) => (typeof v === 'string' && v !== '' ? v : undefined);
  const shell = str(inp.command) !== undefined || str(inp.cmd) !== undefined;
  return [str(inp.workdir), str(inp.working_directory), str(inp.Cwd), shell ? str(inp.dir_path) : undefined].filter((v) => v !== undefined);
}

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
      return path.join(fs.realpathSync.native(head), ...tail);
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
// The PATH search takes absolute entries only and skips the working directory (`cwd`, the
// project during a run), so a bash planted in the project is never the one that runs the hook.
const WIN_CANDIDATES = () => [
  'C:\\Program Files\\Git\\bin\\bash.exe',
  'C:\\Program Files (x86)\\Git\\bin\\bash.exe',
  process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'Programs', 'Git', 'bin', 'bash.exe') : null,
].filter(Boolean);
export function bashBinary({ env = process.env, cwd = process.cwd(), candidates } = {}) {
  const win = process.platform === 'win32';
  if (win) for (const c of candidates ?? WIN_CANDIDATES()) if (fs.existsSync(c)) return c;
  const fold = (p) => (win ? p.toLowerCase() : p);
  let here = '';
  try { here = fold(fs.realpathSync.native(cwd)); } catch { here = fold(path.resolve(cwd)); }
  const system32 = (env.SystemRoot ?? 'C:\\Windows').toLowerCase();
  for (const raw of (env.PATH ?? env.Path ?? '').split(path.delimiter)) {
    const dir = raw.trim().replace(/^"|"$/g, '');
    if (!dir || !path.isAbsolute(dir)) continue;
    let real = dir;
    try { real = fs.realpathSync.native(dir); } catch { /* keep as written */ }
    if (fold(real) === here) continue;
    // The WSL launcher in System32 is never used: it fails when no distribution is installed.
    if (win && dir.toLowerCase().startsWith(system32)) continue;
    const c = path.join(dir, win ? 'bash.exe' : 'bash');
    try { if (fs.statSync(c).isFile()) { if (!win) fs.accessSync(c, fs.constants.X_OK); return c; } } catch { /* not here */ }
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
  const callDirs = perCallDirs(event.tool_input);
  const callAbsAll = callDirs.map((d) => path.resolve(startDir, d));
  const callAbs = callAbsAll.length ? callAbsAll[0] : null;
  const run = activeRun(startDir, [...dirs, process.cwd(), ...(callAbs ? [callAbs] : [])]);
  if (!run) return { deny: false };
  const { prefix } = run;
  if (!run.root) {
    return { deny: true, prefix, reason: 'an autopilot stage is running (ULTRAPOWERS_AUTOPILOT_INSIDE) outside any ultrapowers project; the call cannot be verified' };
  }
  for (const dir of callAbsAll) {
    if (!within(realish(dir), run.root)) {
      return { deny: true, prefix, reason: `the call's working directory ${dir} is outside the project root ${run.root}; during a run a call works inside the project` };
    }
  }
  const fold = (d) => (process.platform === 'win32' ? realish(d).toLowerCase() : realish(d));
  if (callAbsAll.length > 1 && new Set(callAbsAll.map(fold)).size > 1) {
    return { deny: true, prefix, reason: `the call names two working directories (${callAbsAll.join(', ')}); one call runs in one directory` };
  }
  // The event carries one file spelling (file_path, copied from the first of the harness's keys), and
  // the tool may write another: Pi writes `path`, OpenCode `filePath`. Two spellings that name
  // different files are refused; the same file under two spellings is one target.
  let given = input;
  if (typeof given === 'string') { try { given = JSON.parse(given); } catch { given = null; } }
  if (given && typeof given === 'object' && !Array.isArray(given)) {
    const base = callAbs ?? (givenCwd || startDir);
    const spellings = ['path', 'file_path', 'filePath', 'notebook_path'].map((k) => given[k]).filter((v) => typeof v === 'string' && v !== '');
    if (new Set(spellings.map((p) => fold(path.resolve(base, p)))).size > 1) {
      return { deny: true, prefix, reason: `the call names two different targets (${spellings.join(', ')}); one call writes one file` };
    }
  }
  // The marker was found from the session cwd; the command itself runs in the call's directory, so
  // the hook resolves a relative target there (a bare autopilot.json inside tasks/<ID> is the state file).
  if (callAbs) event.cwd = realish(callAbs);
  const hook = path.join(hookDir, 'qa-guardrail');
  const bash = bashBinary();
  if (!bash || !fs.existsSync(hook)) {
    return { deny: true, prefix, reason: `the ultrapowers guardrail could not run (${!bash ? 'no bash' : 'hook missing'}); a tool call during a run is refused without it` };
  }
  const env = { ...process.env };
  delete env.CURSOR_PLUGIN_ROOT; // the verdict is read from stderr and the exit code, not from Cursor's JSON
  // The hook runs from the plugin's folder, never the project's (it finds the run from the event's
  // cwd), and on Windows it does not search its current directory for the programs it starts.
  if (process.platform === 'win32') env.NoDefaultCurrentDirectoryInExePath = '1';
  // The directory the run was found from, which the hook's root scan reads like a cwd (it may be an
  // extra candidate, not the event cwd).
  event.ultrapowers_run_dir = path.resolve(run.dir);
  const res = spawnSync(bash, [hook], { input: `${JSON.stringify(event)}\0`, cwd: path.resolve(hookDir, '..'), env, encoding: 'utf8', timeout: timeoutMs, windowsHide: true });
  if (res.status === 0) return { deny: false };
  const line = String(res.stderr ?? '').split('\n').map((l) => DENY_RE.exec(l)).find(Boolean);
  if (res.status === 2) return { deny: true, prefix: line ? line[1] : prefix, reason: line ? line[2].trim() : 'denied by the ultrapowers guardrail' };
  return { deny: true, prefix, reason: `the ultrapowers guardrail could not run (${res.error ? res.error.message : `exit ${res.status}`}); a tool call during a run is refused without it` };
}
