// node --test tests/hooks/test-resolve-tool.mjs
// hooks/lib/resolve-tool.mjs: a tool resolves from absolute PATH entries outside the project only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveTool, childEnv } from '../../hooks/lib/resolve-tool.mjs';

const win = process.platform === 'win32';
const exe = win ? '.exe' : '';

function sandbox() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'resolve-tool-'));
  const project = path.join(base, 'project');
  const outside = path.join(base, 'bin');
  fs.mkdirSync(path.join(project, 'bin'), { recursive: true });
  fs.mkdirSync(outside, { recursive: true });
  return { base, project, outside };
}

function plant(dir, name) {
  const file = path.join(dir, name);
  fs.writeFileSync(file, '');
  if (!win) fs.chmodSync(file, 0o755);
  return file;
}

const pathEnv = (entries) => (win ? { Path: entries.join(path.delimiter), PATHEXT: '.COM;.EXE;.BAT;.CMD' } : { PATH: entries.join(path.delimiter) });

test('a tool planted at the project root or under it is never the one resolved', () => {
  const { project, outside } = sandbox();
  plant(project, `git${exe}`);
  plant(path.join(project, 'bin'), `git${exe}`);
  const real = plant(outside, `git${exe}`);
  const env = pathEnv([project, path.join(project, 'bin'), outside]);
  assert.equal(resolveTool('git', { root: project, env }), real);
});

test('relative PATH entries and "." are skipped', () => {
  const { project, outside } = sandbox();
  plant(path.join(project, 'bin'), `gh${exe}`);
  const real = plant(outside, `gh${exe}`);
  const env = pathEnv(['.', 'bin', '', outside]);
  assert.equal(resolveTool('gh', { root: project, env }), real);
});

test('no resolvable tool gives null', () => {
  const { project } = sandbox();
  plant(project, `claude${exe}`);
  assert.equal(resolveTool('claude', { root: project, env: pathEnv([project]) }), null);
});

test('a relative path is never resolved; an absolute path to a file is returned as is', () => {
  const { project, outside } = sandbox();
  const real = plant(outside, `tool${exe}`);
  assert.equal(resolveTool(`./tool${exe}`, { root: project, env: pathEnv([outside]) }), null);
  assert.equal(resolveTool(`bin/tool${exe}`, { root: project, env: pathEnv([outside]) }), null);
  assert.equal(resolveTool(real, { root: project, env: pathEnv([]) }), real);
  assert.equal(resolveTool(path.join(outside, 'missing'), { root: project, env: pathEnv([]) }), null);
});

test('Windows: a .cmd shim resolves only when the caller asks for shims', { skip: !win }, () => {
  const { project, outside } = sandbox();
  const shim = plant(outside, 'codex.cmd');
  const env = pathEnv([outside]);
  assert.equal(resolveTool('codex', { root: project, env }), null);
  assert.equal(resolveTool('codex', { root: project, env, shims: true })?.toLowerCase(), shim.toLowerCase());
});

test('childEnv stops Windows from searching the current directory', () => {
  const env = childEnv({ A: '1' });
  assert.equal(env.A, '1');
  if (win) assert.equal(env.NoDefaultCurrentDirectoryInExePath, '1');
});

test('the module imports node built-ins only', () => {
  const src = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'hooks', 'lib', 'resolve-tool.mjs'), 'utf8');
  for (const m of src.matchAll(/^import .* from '([^']+)';$/gm)) assert.match(m[1], /^node:/);
});
