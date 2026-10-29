// guard-paths.mjs: the one path resolver behind every comparison of hooks/qa-guardrail and
// hooks/lib/qa-shell-writes.mjs. A path is resolved to its real, canonical spelling (8.3 short
// names, Git Bash `/c/` forms, symlinks) and compared exactly; it is compared case-insensitively
// only when the project's own folder ignores case. Node standard library only.
import { execFileSync } from 'node:child_process';
import { existsSync, realpathSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { resolveTool, childEnv } from './resolve-tool.mjs';

const win32 = process.platform === 'win32';
const forward = (p) => String(p).replace(/\\/g, '/');

let cygpathChecked = false;
let cygpathOk = false;
let cygpathExe = null;
function cygpath(p) {
  if (!cygpathChecked) {
    cygpathChecked = true;
    // cygpath by its absolute path, never by bare name: the hook runs in the project folder, and a
    // cygpath.exe committed there would be found first (Windows searches the working directory).
    cygpathExe = resolveTool('cygpath', { root: process.cwd() });
    try { if (cygpathExe) { execFileSync(cygpathExe, ['-m', '/'], { stdio: 'pipe', windowsHide: true, env: childEnv() }); cygpathOk = true; } } catch { cygpathOk = false; }
  }
  if (!cygpathOk) return null;
  // cygpath reads a colon as the separator of a path list and drops it (`f:x` becomes `fx`): the colons
  // of the name (an NTFS stream, `f::$DATA`) are carried through as a placeholder character.
  try {
    const out = execFileSync(cygpathExe, ['-m', String(p).replace(/:/g, '@@COLON@@')], { stdio: 'pipe', windowsHide: true, encoding: 'utf8', env: childEnv() }).trim();
    return out ? out.replace(/@@COLON@@/g, ':') : null;
  } catch { return null; }
}

// A Git Bash form (`/c/x`, `/tmp/x`) or a Windows form becomes the platform's native absolute
// form; a relative path comes back unchanged. Off Windows nothing changes.
export function toNative(p) {
  const s = String(p);
  if (!win32) return s;
  const drive = /^\/([A-Za-z])(\/.*)?$/.exec(forward(s));
  if (drive) return `${drive[1].toUpperCase()}:${drive[2] || '/'}`;
  if (/^[\\/]/.test(s) && !/^[\\/]{2}/.test(s)) return cygpath(forward(s)) ?? s;
  return s;
}

function canonicalForm(p) {
  let s = forward(p).replace(/^\/\/\?\//, '');
  s = s.replace(/\/{2,}/g, (m, off) => (off === 0 ? m : '/'));
  if (s.length > 1 && s.endsWith('/') && !/^[A-Za-z]:\/$/.test(s)) s = s.slice(0, -1);
  const m = /^([A-Za-z]):(.*)$/.exec(s);
  return m ? `${m[1].toUpperCase()}:${m[2]}` : s;
}

// The real, canonical path of `p` (relative to `cwd`): the longest existing prefix goes through
// realpath, the rest is appended as written.
export function realCanonical(p, cwd) {
  const abs = path.resolve(toNative(String(cwd || '.')), toNative(String(p)));
  let head = abs;
  const tail = [];
  while (!existsSync(head)) {
    const parent = path.dirname(head);
    if (parent === head) break;
    tail.unshift(path.basename(head));
    head = parent;
  }
  let real = head;
  try { real = realpathSync.native(head); } catch { real = head; }
  return winNames(canonicalForm([real, ...tail].join('/')));
}

// Windows resolves names the text does not show: a trailing dot or space of a component is dropped
// (`.husky./x` is `.husky/x`) and `name:stream` or `name::$DATA` is the file `name`. A component that
// does not exist yet is appended as written, so the same folding is applied to every component.
// Off Windows nothing changes.
function winNames(p) {
  if (!win32) return p;
  const parts = p.split('/');
  const out = parts.map((seg, i) => {
    if (seg === '' || seg === '.' || seg === '..') return seg;
    if (i === 0 && /^[A-Za-z]:$/.test(seg)) return seg;
    const folded = seg.replace(/:.*$/, '').replace(/[. ]+$/, '');
    return folded || seg;
  });
  return out.join('/');
}

// True when a probe file written under <root>/.ultrapowers/ is found again under a different-case
// name. The probe is always removed. False on any error: an exact compare is the safe default.
export function rootIgnoresCase(root) {
  const dir = path.join(toNative(String(root)), '.ultrapowers');
  const name = `.case-probe-${process.pid}-${Date.now().toString(36)}`;
  const probe = path.join(dir, name);
  try {
    writeFileSync(probe, '');
    return existsSync(path.join(dir, name.toUpperCase()));
  } catch {
    return false;
  } finally {
    try { unlinkSync(probe); } catch { /* not written */ }
  }
}

const fold = (s, ignoreCase) => (ignoreCase ? String(s).toLowerCase() : String(s));

export function inside(target, area, ignoreCase) {
  const t = fold(target, ignoreCase);
  const a = fold(area, ignoreCase);
  // A drive root (P:/) already ends in the separator.
  return t === a || t.startsWith(a.endsWith('/') ? a : `${a}/`);
}

export function rel(target, root, ignoreCase) {
  if (!inside(target, root, ignoreCase)) return null;
  return String(target).slice(String(root).length).replace(/^\/+/, '');
}

// Key material by name, for a glob: the names a glob word can expand to that the key-material rule refuses.
// A shell expands `.en?` or `.e[n]v` to `.env` after the hook has judged the word, so a word with a glob
// character is matched against these names instead: from its last segments, the way it would be applied
// under some folder, and with the shell's rule that `*` and `?` match no leading dot. A glob whose only
// literal-free segments are wildcards (`*`, `repo/*`) reaches no name by itself, and a name inside a dot folder
// (.config/gh/hosts.yml) is reached only by a glob that covers the folder too (so `*.json` is not `.docker/config.json`).
const KEY_GLOB_NAMES = ['.env', '.env.local', '.env.production', '.env.development', '.env.test', '.ssh/id_rsa', '.ssh/id_ed25519', '.ssh/authorized_keys', '.aws/credentials',
  '.git-credentials', '.netrc', '.npmrc', '.config/gh/hosts.yml', '.config/glab-cli/config.yml', '.docker/config.json', '.kube/config', '.gnupg/private-keys-v1.d',
  'mcp-secrets.env', 'secrets.local', 'id_rsa', 'id_ed25519', 'id_ecdsa', 'authorized_keys', '.ssh/id_ecdsa',
  '.pypirc', '.pgpass', '.vault-token', '.cargo/credentials', '.cargo/credentials.toml', '.config/gcloud/application_default_credentials.json',
  '.azure/msal_token_cache.json', '.gem/credentials', 'private.pem', 'private.key', 'private.pfx', 'private.p12'];
function globSegmentRegExp(seg) {
  let out = '';
  for (let i = 0; i < seg.length; i++) {
    const c = seg[i];
    if (c === '*') { out += '[^/]*'; continue; }
    if (c === '?') { out += '[^/]'; continue; }
    if (c === '[') {
      const end = seg.indexOf(']', i + 2);
      if (end === -1) return null;
      let body = seg.slice(i + 1, end);
      if (body[0] === '!' || body[0] === '^') body = `^${body.slice(1)}`;
      out += `[${body.replace(/\\/g, '\\\\')}]`;
      i = end;
      continue;
    }
    if (c === '{') {
      const end = seg.indexOf('}', i + 1);
      if (end === -1) return null;
      out += `(?:${seg.slice(i + 1, end).split(',').map((a) => a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`;
      i = end;
      continue;
    }
    out += c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  try { return new RegExp(`^${out}$`, 'i'); } catch { return null; }
}
export function keyGlobReaches(word) {
  const s = String(word).replace(/\\/g, '/');
  if (!/[*?[\]{}]/.test(s)) return false;
  const g = s.split('/').filter((x) => x !== '' && x !== '.' && x !== '~');
  if (g.length === 0) return false;
  for (const name of KEY_GLOB_NAMES) {
    const p = name.split('/');
    if (p.length > 1 && g.length < p.length) continue;
    let literal = false;
    let ok = true;
    for (let i = 1; i <= Math.min(g.length, p.length) && ok; i++) {
      const gs = g[g.length - i];
      const ps = p[p.length - i];
      const re = globSegmentRegExp(gs);
      if (re === null) { ok = false; break; } // an unbalanced [ or { is a literal character to the shell
      if (!re.test(ps)) { ok = false; break; }
      // The shell's `*` and `?` match no leading dot: only a literal dot, a class or a brace can.
      if (ps.startsWith('.') && !/^[.[{]/.test(gs)) { ok = false; break; }
      if (/[^*?]/.test(gs)) literal = true;
    }
    if (ok && literal) return true;
  }
  return false;
}
