#!/usr/bin/env node
// sample-suite.mjs <base-url> <junit-out>: a two-case smoke suite for the sample app that writes
// JUnit XML with the standard library only (Node 18 has no JUnit reporter). Exit 0 when both pass.
import { writeFileSync } from 'node:fs';

const [base, out] = process.argv.slice(2);
if (!base || !out) {
  process.stderr.write('usage: node sample-suite.mjs <base-url> <junit-out>\n');
  process.exit(2);
}
const cases = [
  ['health_answers_ok', async () => (await fetch(`${base}/health`)).status === 200],
  ['api_requires_a_session', async () => (await fetch(`${base}/api/items`)).status === 401],
];
const results = [];
for (const [name, run] of cases) {
  let ok = false;
  let error = '';
  try {
    ok = await run();
  } catch (caught) {
    error = caught.message;
  }
  results.push({ name, ok, error });
}
const esc = (text) => text.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const body = results.map((r) => (r.ok
  ? `  <testcase classname="sample.Smoke" name="${r.name}"/>`
  : `  <testcase classname="sample.Smoke" name="${r.name}"><failure message="${esc(r.error || 'assertion failed')}"/></testcase>`)).join('\n');
const failures = results.filter((r) => !r.ok).length;
writeFileSync(out, `<?xml version="1.0" encoding="UTF-8"?>\n<testsuite name="sample" tests="${results.length}" failures="${failures}">\n${body}\n</testsuite>\n`);
// exitCode, not process.exit(): exiting while fetch's sockets close trips a libuv
// assertion on Windows (src/win/async.c) and turns a passing run into exit 127.
process.exitCode = failures ? 1 : 0;
