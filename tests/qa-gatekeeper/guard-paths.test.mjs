import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import test from 'node:test';

const __dirname = dirname(fileURLToPath(import.meta.url));
const modPath = resolve(__dirname, '../../hooks/lib/guard-paths.mjs');
const { realCanonical, rootIgnoresCase, inside, rel, toNative } = await import(pathToFileURL(modPath).href);

const win32 = process.platform === 'win32';
const fwd = (p) => p.replace(/\\/g, '/');
const makeTmp = (name = 'gp-') => mkdtempSync(join(tmpdir(), name));
const shortOf = (p) => execSync(`for %I in ("${p}") do @echo %~sI`, { shell: 'cmd.exe', encoding: 'utf8' }).trim();

test('realCanonical resolves an 8.3 short name to the long name', { skip: !win32 }, (t) => {
  const tmp = makeTmp();
  t.after(() => rmSync(tmp, { recursive: true, force: true }));
  mkdirSync(join(tmp, '.claude'));
  const longPath = join(tmp, '.claude', 'settings.json');
  writeFileSync(longPath, '{}');
  const shortPath = shortOf(longPath);
  if (fwd(shortPath).toLowerCase() === fwd(longPath).toLowerCase()) return t.skip('this volume has no 8.3 short names');
  assert.equal(realCanonical(shortPath, tmp), realCanonical(longPath, tmp));
});

test('realCanonical resolves the nearest existing parent and appends the rest', (t) => {
  const tmp = makeTmp();
  t.after(() => rmSync(tmp, { recursive: true, force: true }));
  mkdirSync(join(tmp, 'reviews'));
  assert.equal(realCanonical('reviews/T-1/artifacts/a.png', tmp), `${realCanonical(tmp, tmp)}/reviews/T-1/artifacts/a.png`);
});

test('realCanonical keeps a space and a non-ASCII letter, and reads a Git Bash /c/ path', (t) => {
  const tmp = makeTmp();
  t.after(() => rmSync(tmp, { recursive: true, force: true }));
  const dir = join(tmp, 'Mon Projet é');
  mkdirSync(dir);
  const want = realCanonical(dir, tmp);
  assert.match(want, /Mon Projet é$/);
  if (win32) {
    const m = /^([A-Za-z]):(.*)$/.exec(fwd(dir));
    assert.equal(realCanonical(`/${m[1].toLowerCase()}${m[2]}`, tmp), want);
  }
  assert.equal(realCanonical(join('Mon Projet é', 'x.md'), tmp), `${want}/x.md`);
});

test('realCanonical returns a forward-slash path with a drive letter on Windows', () => {
  const out = realCanonical('.', tmpdir());
  assert.ok(!out.includes('\\'));
  if (win32) assert.match(out, /^[A-Za-z]:\//);
  else assert.ok(out.startsWith('/'));
  assert.equal(out, fwd(realpathSync.native(tmpdir())));
});

test('toNative leaves a relative path alone', () => {
  assert.equal(toNative('reviews/T-1/x'), 'reviews/T-1/x');
});

test('rootIgnoresCase is true on the Windows temp dir and leaves no probe behind', { skip: !win32 }, (t) => {
  const tmp = makeTmp();
  t.after(() => rmSync(tmp, { recursive: true, force: true }));
  mkdirSync(join(tmp, '.ultrapowers'));
  assert.equal(rootIgnoresCase(tmp), true);
  assert.deepEqual(execSync(`dir /b "${join(tmp, '.ultrapowers')}"`, { shell: 'cmd.exe', encoding: 'utf8' }).trim(), '');
});

test('rootIgnoresCase is false on a case-sensitive Windows directory', { skip: !win32 }, (t) => {
  const tmp = makeTmp();
  t.after(() => rmSync(tmp, { recursive: true, force: true }));
  try {
    execSync(`fsutil file setCaseSensitiveInfo "${tmp}" enable`, { shell: 'cmd.exe', stdio: 'pipe' });
  } catch {
    return t.skip('fsutil cannot make a case-sensitive directory here');
  }
  mkdirSync(join(tmp, '.ultrapowers'));
  assert.equal(rootIgnoresCase(tmp), false);
});

test('rootIgnoresCase is false when the root cannot be probed', () => {
  assert.equal(rootIgnoresCase(join(tmpdir(), 'gp-does-not-exist', 'nowhere')), false);
});

test('inside and rel compare exactly unless ignoreCase', () => {
  assert.equal(inside('/p/Reviews/T-1/x', '/p/reviews/T-1', false), false);
  assert.equal(inside('/p/Reviews/T-1/x', '/p/reviews/T-1', true), true);
  assert.equal(inside('/p/reviews/T-1', '/p/reviews/T-1', false), true);
  assert.equal(inside('/p/reviews/T-10/x', '/p/reviews/T-1', false), false);
  assert.equal(rel('/p/reviews/T-1/x', '/p', false), 'reviews/T-1/x');
  assert.equal(rel('/P/reviews/T-1/x', '/p', true), 'reviews/T-1/x');
  assert.equal(rel('/q/x', '/p', false), null);
});
