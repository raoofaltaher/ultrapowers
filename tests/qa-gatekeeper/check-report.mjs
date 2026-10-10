#!/usr/bin/env node
// check-report.mjs: deterministic post-checks for a QA gatekeeper run (Tasks 12 and 13).
//
//   node check-report.mjs report <root> <id> [--roles user,admin] [--not-covered 2,4,5,7] [--verdict <VALUE>]
//   node check-report.mjs snapshot <artifacts-dir>
//   node check-report.mjs resume <before.json> <after.json> [--complete] [--snapshot <snap.json> --artifacts <dir>]
//
// `report` checks reviews/<id>/QA-REPORT.md against the ultrapowers:qa-report headings, the one
// Verdict line, the per-lane not-covered reasons, one embedded screenshot per role, embedded
// files on disk, no bare .png links, no bearer token or JWT, and the removed run marker.
// `snapshot` prints {file: sha256} for the top-level .png and .txt evidence of a directory.
// `resume` compares run-state before and after a resumed run. Output: [PASS]/[FAIL] lines, then
// STATUS: PASSED or STATUS: FAILED (n failure(s)); exit 0 or 1, and 2 on usage.
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, join } from 'node:path';

export const VERDICTS = ['PASS', 'PASS-WITH-ISSUES', 'FAIL', 'INCOMPLETE', 'PRECONDITION-FAILED'];
export const SECTIONS = ['## Exit criteria', '## Findings', '## Dimension matrix', '## Per-lane coverage',
  '## Scenarios covered', '## Root-cause hints', '## Known-issues candidates', '## Data hygiene'];
export const LANES = ['### Lane 1: UI', '### Lane 2: Logs', '### Lane 3: API', '### Lane 4: Database',
  '### Lane 5: Observability', '### Lane 6: Suites', '### Lane 7: Generated content'];
export const DIMENSIONS = ['Functional', 'UX and navigation', 'Visual and brand', 'Localization',
  'Access control', 'Resilience', 'Performance-lite', 'Regression'];

function linesUnder(lines, heading, stop) {
  const start = lines.indexOf(heading);
  if (start === -1) return null;
  const out = [];
  for (let i = start + 1; i < lines.length && !stop.test(lines[i]); i += 1) out.push(lines[i]);
  return out;
}

function inOrder(lines, headings, check, label) {
  let previous = -1;
  for (const heading of headings) {
    const at = lines.indexOf(heading);
    check(at > previous, `${label} "${heading}" present and in order`);
    if (at > previous) previous = at;
  }
}

const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function checkReport(text, { id, roles = [], notCovered = [], verdict = '', exists = () => true } = {}) {
  const results = [];
  const check = (ok, name) => results.push({ ok: Boolean(ok), name });
  const lines = text.split(/\r?\n/);
  check(lines[0] === `# QA report — ${id}`, `title is "# QA report — ${id}"`);
  const verdictLines = lines.filter((line) => line.startsWith('Verdict:'));
  check(verdictLines.length === 1, `exactly one Verdict: line (found ${verdictLines.length})`);
  const value = (/^Verdict: ([A-Z-]+)(?= |$)/.exec(verdictLines[0] || '') || [])[1] || '';
  check(VERDICTS.includes(value), `verdict value is one of the five (got "${value}")`);
  if (verdict) check(value === verdict, `verdict is ${verdict}`);
  const precondition = value === 'PRECONDITION-FAILED';
  inOrder(lines, precondition ? ['## Per-lane coverage'] : SECTIONS, check, 'section');
  inOrder(lines, LANES, check, 'lane heading');
  for (const n of notCovered) {
    const under = linesUnder(lines, LANES[n - 1], /^#{2,3} /) || [];
    const first = (under.find((line) => line.trim() !== '') || '').trim();
    check(/^not-covered — \S/.test(first), `lane ${n} is not-covered with a reason`);
  }
  const lane6 = linesUnder(lines, LANES[5], /^#{2,3} /) || [];
  for (const line of lines.filter((text) => text.includes('Stopped at close'))) {
    check(lane6.includes(line), 'a Stopped at close row sits under Lane 6: Suites');
  }
  if (!precondition) {
    const matrix = linesUnder(lines, '## Dimension matrix', /^## /) || [];
    for (const dimension of DIMENSIONS) {
      const row = matrix.some((line) => line.startsWith('|') && line.split('|').map((cell) => cell.trim()).includes(dimension));
      check(row, `dimension matrix has a row for ${dimension}`);
    }
    check(!matrix.some((line) => line.includes('![')), 'no image inside the dimension matrix');
  }
  const embedded = [...text.matchAll(/!\[[^\]]*\]\((artifacts\/[^)\s]+\.png)\)/g)].map((match) => match[1]);
  for (const role of roles) {
    const pattern = new RegExp(`(^|-)${escapeRegex(role)}-[a-z]{2,3}(-[A-Za-z]{2,4})?-`);
    check(embedded.some((path) => pattern.test(basename(path))), `at least one embedded screenshot for role ${role}`);
  }
  for (const path of embedded) check(exists(path), `embedded ${path} exists`);
  const unembedded = text.replace(/!\[[^\]]*\]\([^)]*\)/g, '');
  check(!/\]\(artifacts\/[^)]+\.png\)|`artifacts\/[^`]+\.png`/.test(unembedded), 'every .png is embedded with ![](), none linked');
  check(!/Bearer [A-Za-z0-9._~+/-]{16,}|eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/.test(text), 'no bearer token or JWT in the report');
  return results;
}

export function snapshot(dir) {
  const out = {};
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir).sort()) {
    const full = join(dir, name);
    if (!/\.(png|txt)$/.test(name) || !statSync(full).isFile()) continue;
    out[name] = createHash('sha256').update(readFileSync(full)).digest('hex');
  }
  return out;
}

export function checkResume(before, after, { complete = false, snapshot: snap = null, artifactsDir = '' } = {}) {
  const results = [];
  const check = (ok, name) => results.push({ ok: Boolean(ok), name });
  check(after.startedAt === before.startedAt, 'startedAt kept');
  check(after.watermark === before.watermark, 'watermark kept');
  const afterRows = new Map((after.plan || []).map((row) => [row.id, row]));
  for (const row of before.plan || []) {
    if (row.status === 'done') check(afterRows.get(row.id)?.status === 'done', `row ${row.id} still done`);
  }
  const pendingBefore = (before.plan || []).filter((row) => row.status === 'pending');
  check(pendingBefore.some((row) => afterRows.has(row.id) && afterRows.get(row.id).status !== 'pending'),
    'the resumed run progressed past a pending row');
  const afterFindings = new Set((after.findings || []).map((finding) => finding.id));
  for (const finding of before.findings || []) check(afterFindings.has(finding.id), `finding ${finding.id} kept`);
  if (complete) check(!(after.plan || []).some((row) => row.status === 'pending'), 'no pending rows left');
  if (snap) {
    const now = snapshot(artifactsDir);
    for (const [file, hash] of Object.entries(snap)) check(now[file] === hash, `evidence ${file} unchanged`);
  }
  return results;
}

function print(results) {
  let failures = 0;
  for (const result of results) {
    console.log(`  [${result.ok ? 'PASS' : 'FAIL'}] ${result.name}`);
    if (!result.ok) failures += 1;
  }
  console.log(failures ? `STATUS: FAILED (${failures} failure(s))` : 'STATUS: PASSED');
  return failures ? 1 : 0;
}

const option = (args, name) => (args.includes(name) ? args[args.indexOf(name) + 1] || '' : '');
const list = (value) => (value ? value.split(',').map((item) => item.trim()).filter(Boolean) : []);
const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'));

function main(argv) {
  const [mode, ...args] = argv;
  if (mode === 'report' && args.length >= 2) {
    const [root, id] = args;
    const dir = join(root, 'reviews', id);
    const file = join(dir, 'QA-REPORT.md');
    if (!existsSync(file)) return print([{ ok: false, name: `${file} exists` }]);
    const results = checkReport(readFileSync(file, 'utf8'), {
      id,
      roles: list(option(args, '--roles')),
      notCovered: list(option(args, '--not-covered')).map(Number),
      verdict: option(args, '--verdict'),
      exists: (rel) => existsSync(join(dir, rel)),
    });
    results.push({ ok: !existsSync(join(root, '.ultrapowers', 'qa-active')), name: 'run marker removed' });
    return print(results);
  }
  if (mode === 'snapshot' && args.length === 1) {
    process.stdout.write(`${JSON.stringify(snapshot(args[0]), null, 2)}\n`);
    return 0;
  }
  if (mode === 'resume' && args.length >= 2) {
    const snapFile = option(args, '--snapshot');
    return print(checkResume(readJson(args[0]), readJson(args[1]), {
      complete: args.includes('--complete'),
      snapshot: snapFile ? readJson(snapFile) : null,
      artifactsDir: option(args, '--artifacts'),
    }));
  }
  process.stderr.write('usage: check-report.mjs report <root> <id> [--roles a,b] [--not-covered 2,4] [--verdict V]\n'
    + '       check-report.mjs snapshot <artifacts-dir>\n'
    + '       check-report.mjs resume <before.json> <after.json> [--complete] [--snapshot <file> --artifacts <dir>]\n');
  return 2;
}

if (process.argv[1] && basename(process.argv[1]) === 'check-report.mjs') {
  process.exit(main(process.argv.slice(2)));
}
