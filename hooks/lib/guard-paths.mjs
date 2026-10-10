// guard-paths.mjs: the one path resolver behind every comparison of hooks/qa-guardrail and
// hooks/lib/qa-shell-writes.mjs. A path is resolved to its real, canonical spelling (8.3 short
// names, Git Bash `/c/` forms, symlinks) and compared exactly; it is compared case-insensitively
// only when the project's own folder ignores case. Node standard library only.
import { execFileSync } from 'node:child_process';
import { existsSync, realpathSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const win32 = process.platform === 'win32';
const forward = (p) => String(p).replace(/\\/g, '/');

let cygpathChecked = false;
let cygpathOk = false;
function cygpath(p) {
  if (!cygpathChecked) {
    cygpathChecked = true;
    try { execFileSync('cygpath', ['-m', '/'], { stdio: 'pipe', windowsHide: true }); cygpathOk = true; } catch { cygpathOk = false; }
  }
  if (!cygpathOk) return null;
  try { return execFileSync('cygpath', ['-m', p], { stdio: 'pipe', windowsHide: true, encoding: 'utf8' }).trim() || null; } catch { return null; }
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
  return canonicalForm([real, ...tail].join('/'));
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
  return t === a || t.startsWith(`${a}/`);
}

export function rel(target, root, ignoreCase) {
  if (!inside(target, root, ignoreCase)) return null;
  return String(target).slice(String(root).length).replace(/^\/+/, '');
}
