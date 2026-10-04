// A fake headless harness (claude or opencode) for the watcher tests, run through
// ULTRAPOWERS_CLAUDE or ULTRAPOWERS_OPENCODE. It logs its argv to STUB_LOG, then performs the
// stage the prompt names the way the autopilot skill would in a session: begin, write the
// files, end. Knobs:
// (The HARNESS_ prefix keeps them apart from the tracker stub's STUB_ knobs in a shared env.)
//   HARNESS_EXIT      exit code; non-zero exits before `end`, like a crashed session
//   HARNESS_SLEEP_MS  delay before anything, for timeout tests
//   HARNESS_NO_END    "1": perform the work but never call `end`
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENGINE = path.resolve(HERE, '..', '..', '..', 'skills', 'autopilot', 'scripts', 'autopilot.mjs');
const args = process.argv.slice(2);
// The credentials a stage must not hold are logged as seen, so a test can check the watcher scrubbed them.
const seen = Object.fromEntries(['GH_TOKEN', 'GITHUB_TOKEN', 'GITLAB_TOKEN', 'GLAB_TOKEN', 'GH_CONFIG_DIR', 'GLAB_CONFIG_DIR', 'GIT_TERMINAL_PROMPT']
  .map((k) => [k, process.env[k] ?? null]));
if (process.env.STUB_LOG) fs.appendFileSync(process.env.STUB_LOG, `${JSON.stringify({ harness: 'stub', args, env: seen })}\n`);

const sleep = Number(process.env.HARNESS_SLEEP_MS ?? 0);
if (sleep > 0) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, sleep);
if (process.env.HARNESS_EXIT && Number(process.env.HARNESS_EXIT) !== 0) process.exit(Number(process.env.HARNESS_EXIT));

const prompt = args.find((a) => a.startsWith('/ultrapowers:autopilot')) ?? args.join(' ');
const id = /autopilot\s+(\S+)/.exec(prompt)?.[1];
const stage = /--stage\s+(\S+)/.exec(prompt)?.[1];
const root = process.cwd();
const engine = (...a) => JSON.parse(execFileSync(process.execPath, [ENGINE, ...a, '--root', root], { encoding: 'utf8', env: process.env }));
const git = (...a) => execFileSync('git', a, { cwd: root, encoding: 'utf8', env: process.env });

engine('begin', id, stage, '--door', 'watch');
const result = { ok: true };
if (stage === 'scaffold') {
  fs.mkdirSync(path.join(root, 'tasks', id), { recursive: true });
  fs.writeFileSync(path.join(root, 'tasks', id, `${id}.md`), `# ${id} - stub brief\n`);
  result.title = 'Fix it now please';
} else if (stage === 'spec') {
  fs.mkdirSync(path.join(root, 'specs', id), { recursive: true });
  fs.writeFileSync(path.join(root, 'specs', id, 'Spec.md'), '# Spec\n\n## Repositories in scope\n\n- .\n\n## Assumption ledger\n\n| # | Question | Chosen answer | Confidence | Reason |\n|---|---|---|---|---|\n| 1 | Which? | this | low | stub |\n');
  git('add', '-A');
  git('commit', '-q', '-m', `spec(${id}): stub`);
  result.scope = ['.'];
} else if (stage === 'plan') {
  fs.mkdirSync(path.join(root, 'plans', id), { recursive: true });
  fs.writeFileSync(path.join(root, 'plans', id, 'Plan.md'), '# Plan\n\n## Repositories in scope\n\n- .\n');
  git('add', '-A');
  git('commit', '-q', '-m', `plan(${id}): stub`);
  result.scope = ['.'];
} else if (stage === 'execute') {
  fs.writeFileSync(path.join(root, 'FEATURE.md'), 'stub work\n');
  git('add', '-A');
  git('commit', '-q', '-m', 'feat: stub work');
} else if (stage === 'qa') {
  fs.mkdirSync(path.join(root, 'reviews', id), { recursive: true });
  fs.writeFileSync(path.join(root, 'reviews', id, 'QA-REPORT.md'), '# QA\n\nVerdict: PASS\n');
  result.verdict = 'PASS';
  result.report = `reviews/${id}/QA-REPORT.md`;
}
if (process.env.HARNESS_NO_END !== '1') engine('end', id, stage, '--result', JSON.stringify(result));
process.stdout.write(JSON.stringify({ result: `stub finished ${stage}` }));
