// The absolute path of a tool the plugin starts (git, gh, glab, bash, cygpath, a harness CLI), so
// that nothing the plugin runs is looked up in the checkout it works on. Node built-ins only.
//
// Started by bare name, a tool resolves through the child's working directory first on Windows
// (libuv searches the cwd before PATH), and through any relative PATH entry ('.', 'bin') on every
// platform: a repository that commits `git.exe` or `claude.exe` at its root would run with the
// user's tokens. resolveTool searches the ABSOLUTE entries of PATH only, skips every entry at or
// under the project root, and on Windows takes only the extensions node can start without a shell
// (.exe, .com) unless the caller asks for the .cmd/.bat shims and passes them fixed arguments only.
import fs from 'node:fs';
import path from 'node:path';

const isWin = () => process.platform === 'win32';

function under(dir, root) {
  if (!root) return false;
  const win = isWin();
  const a = win ? dir.toLowerCase() : dir;
  const r = win ? root.toLowerCase() : root;
  return a === r || a.startsWith(r.endsWith(path.sep) ? r : r + path.sep);
}

// resolveTool('git', { root, env, shims }) -> absolute path, or null when the tool does not resolve.
// root: the project the tool must not come from (default: the process cwd). env: the environment
// whose PATH is searched (default: process.env). shims: on Windows, also accept .cmd and .bat (only
// for a caller that starts them through cmd.exe with fixed, constant arguments).
// A command that is already an absolute path is returned as is when it names a regular file.
export function resolveTool(command, { root = process.cwd(), env = process.env, shims = false } = {}) {
  if (typeof command !== 'string' || !command) return null;
  const win = isWin();
  if (path.isAbsolute(command)) {
    try { return fs.statSync(command).isFile() ? command : null; } catch { return null; }
  }
  // A relative path names a file in some working directory: never resolved.
  if (/[\\/]/.test(command)) return null;
  const rootAbs = root ? path.resolve(root) : null;
  const exts = win
    ? (shims ? (env.PATHEXT || env.Pathext || '.COM;.EXE;.BAT;.CMD').split(';').filter(Boolean) : ['.exe', '.com'])
    : [''];
  const pathValue = (win ? (env.Path ?? env.PATH ?? env.path) : env.PATH) || '';
  for (const entry of pathValue.split(path.delimiter)) {
    const dir = entry.replace(/^"(.*)"$/, '$1');
    if (!dir || !path.isAbsolute(dir) || under(path.resolve(dir), rootAbs)) continue;
    // A command that already carries an allowed extension is tried as written first.
    const names = win && exts.some((e) => command.toLowerCase().endsWith(e.toLowerCase())) ? [command] : exts.map((e) => command + e);
    for (const name of names) {
      const candidate = path.join(dir, name);
      try { if (fs.statSync(candidate).isFile()) return candidate; } catch { /* next */ }
    }
  }
  return null;
}

// The environment for a child the plugin starts: on Windows, cmd.exe and CreateProcess stop
// searching the current directory for a bare command name inside the child too.
export function childEnv(env = process.env) {
  return isWin() ? { ...env, NoDefaultCurrentDirectoryInExePath: '1' } : { ...env };
}
