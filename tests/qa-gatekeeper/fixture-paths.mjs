#!/usr/bin/env node
// Helper of the guardrail fixture suites (Windows-only facts, answered through node so no shell
// quoting is involved).
//   fixture-paths.mjs short <path>      prints the 8.3 short form of an existing path, with forward
//                                       slashes; prints the path itself when it has none
//   fixture-paths.mjs casesens <dir>    makes <dir> a case-sensitive folder (Windows) and prints 1
//                                       when a probe confirms it, else 0
import { execFileSync, execSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const [mode, target] = process.argv.slice(2);
const fwd = (p) => p.split(String.fromCharCode(92)).join('/');

if (mode === 'short') {
  let out = target;
  if (process.platform === 'win32') {
    try {
      out = execSync(`for %I in ("${target}") do @echo %~sI`, { shell: 'cmd.exe', encoding: 'utf8' }).trim() || target;
    } catch { out = target; }
  }
  process.stdout.write(fwd(out));
} else if (mode === 'casesens') {
  mkdirSync(target, { recursive: true });
  if (process.platform === 'win32') {
    try { execFileSync('fsutil', ['file', 'setCaseSensitiveInfo', target, 'enable'], { stdio: 'pipe', windowsHide: true }); } catch { /* probed below */ }
  }
  const probe = join(target, '.cs-probe');
  let sensitive = false;
  try {
    writeFileSync(probe, '');
    sensitive = !existsSync(join(target, '.CS-PROBE'));
  } catch { sensitive = false; }
  rmSync(probe, { force: true });
  process.stdout.write(sensitive ? '1' : '0');
} else {
  process.stderr.write('usage: fixture-paths.mjs short|casesens <path>\n');
  process.exit(1);
}
