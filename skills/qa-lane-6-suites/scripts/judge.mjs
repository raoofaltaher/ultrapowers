#!/usr/bin/env node
// judge.mjs <out-dir> <known-issues.md>
//
// Lane 6 set-difference judge. Extracts the FAILING TEST SET from every results file under
// <out-dir> (*.trx from dotnet, vitest/jest JSON, JUnit XML) and diffs it against the
// machine-readable suppress list: the lines inside the ```lane6-suppress fenced block of the
// known-issues file. A failing test is SUPPRESSED when its full name OR its class (the name
// minus the last dotted segment) is a whole-line exact match of a suppress entry; otherwise it
// is NEW-FAILING. Whole-line exact, never substring: prose in the baseline cannot match, and an
// entry cannot over-match a longer or shorter name. Counts are never the signal.
//
// INCOMPLETE (not "0 new-failing"): a `.failed` marker from the runner, or no results file at
// all, means the suite did not run cleanly; say so instead of reporting a false green.
// Exit 0 always; the output is the judgement and the verdict is the agent's job. Exit 1 only
// when the baseline file is missing.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { basename, extname, join } from 'node:path';

const XML_ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

function decodeEntities(text) {
  return text.replace(/&(amp|lt|gt|quot|apos|#x[0-9a-fA-F]+|#[0-9]+);/g, (whole, entity) => {
    if (entity in XML_ENTITIES) return XML_ENTITIES[entity];
    if (entity.startsWith('#x')) return String.fromCodePoint(parseInt(entity.slice(2), 16));
    if (entity.startsWith('#')) return String.fromCodePoint(parseInt(entity.slice(1), 10));
    return whole;
  });
}

function attr(tagText, name) {
  const match = new RegExp(`\\b${name}="([^"]*)"`).exec(tagText);
  return match ? decodeEntities(match[1]) : '';
}

export function parseSuppressList(markdown) {
  const entries = [];
  let inside = false;
  for (const rawLine of markdown.split(/\r?\n/)) {
    if (!inside) {
      if (/^```lane6-suppress\s*$/.test(rawLine)) inside = true;
      continue;
    }
    if (/^```/.test(rawLine)) {
      inside = false;
      continue;
    }
    // A comment is whitespace, "#", then whitespace or the end of the line, so "Foo #2" stays
    // whole. A pasted NEW-FAILING prefix (the judge's own output) is not part of the name.
    const line = rawLine.replace(/\s+#(\s.*)?$/, '').trim().replace(/^NEW-FAILING\s+/, '');
    if (line === '' || line.startsWith('#')) continue;
    entries.push(line);
  }
  return entries;
}

const TRX_FAILING = new Set(['Failed', 'Error', 'Timeout', 'Aborted']);

export function failingFromTrx(xml) {
  const names = new Set();
  for (const match of xml.matchAll(/<UnitTestResult\b[^>]*>/g)) {
    const tag = match[0];
    if (!TRX_FAILING.has(attr(tag, 'outcome'))) continue;
    const name = attr(tag, 'testName');
    if (name) names.add(name);
  }
  return [...names];
}

// A results file can admit that the run did not finish; that is INCOMPLETE, not a green.
function incompleteFromTrx(xml, file) {
  const reasons = [];
  const summary = /<ResultSummary\b[^>]*>/.exec(xml);
  const outcome = summary ? attr(summary[0], 'outcome') : '';
  if (['Aborted', 'Error', 'Timeout'].includes(outcome)) reasons.push(`${file}: the test run ended ${outcome}`);
  const counters = /<Counters\b[^>]*>/.exec(xml);
  if (counters) {
    const total = Number(attr(counters[0], 'total'));
    const executed = Number(attr(counters[0], 'executed'));
    if (Number.isFinite(total) && Number.isFinite(executed) && executed < total) reasons.push(`${file}: ${executed} of ${total} tests executed`);
  }
  for (const match of xml.matchAll(/<RunInfo\b[^>]*>/g)) {
    if (attr(match[0], 'outcome') === 'Error') { reasons.push(`${file}: the test host reported a run error`); break; }
  }
  return reasons;
}

function incompleteFromJunit(xml, file, failingCount) {
  if (failingCount > 0) return [];
  for (const match of xml.matchAll(/<testsuite\b[^>]*>/g)) {
    const errors = Number(attr(match[0], 'errors')) || 0;
    const failures = Number(attr(match[0], 'failures')) || 0;
    if (errors + failures > 0) return [`${file}: a suite-level error or failure with no failing testcase to name`];
  }
  return [];
}

export function failingFromVitest(jsonText) {
  const names = new Set();
  let parsed;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    return [];
  }
  for (const file of Array.isArray(parsed?.testResults) ? parsed.testResults : []) {
    let failedAssertions = 0;
    for (const assertion of Array.isArray(file?.assertionResults) ? file.assertionResults : []) {
      if (assertion?.status === 'failed' && typeof assertion.fullName === 'string') { names.add(assertion.fullName); failedAssertions++; }
    }
    // A test file that failed to load or crashed has no failed assertion to name; the file
    // itself is the failure.
    if (file?.status === 'failed' && failedAssertions === 0) names.add(typeof file.name === 'string' && file.name ? file.name : '(unnamed test file)');
  }
  return [...names];
}

export function failingFromJunit(xml) {
  const names = new Set();
  const caseRe = /<testcase\b([^>]*?)(\/>|>([\s\S]*?)<\/testcase>)/g;
  for (const match of xml.matchAll(caseRe)) {
    const attrs = match[1];
    const body = match[3] ?? '';
    if (!/<(failure|error)\b/.test(body)) continue;
    const name = attr(attrs, 'name');
    const className = attr(attrs, 'classname');
    if (!name) continue;
    names.add(className ? `${className}.${name}` : name);
  }
  return [...names];
}

function isVitestJson(text) {
  try {
    const parsed = JSON.parse(text);
    return Array.isArray(parsed?.testResults);
  } catch {
    return false;
  }
}

export function collectFailing(outDir) {
  const names = new Set();
  const formats = new Set();
  const incomplete = [];
  let hadResults = false;
  const files = existsSync(outDir) ? readdirSync(outDir) : [];
  for (const file of files) {
    const full = join(outDir, file);
    const ext = extname(file).toLowerCase();
    let text;
    try {
      text = readFileSync(full, 'utf8');
    } catch {
      continue;
    }
    if (ext === '.trx') {
      hadResults = true;
      formats.add('trx');
      failingFromTrx(text).forEach((n) => names.add(n));
      incomplete.push(...incompleteFromTrx(text, file));
    } else if (ext === '.json' && isVitestJson(text)) {
      hadResults = true;
      formats.add('vitest-json');
      failingFromVitest(text).forEach((n) => names.add(n));
    } else if (ext === '.xml' && /<testsuites?\b/.test(text)) {
      hadResults = true;
      formats.add('junit-xml');
      const failing = failingFromJunit(text);
      failing.forEach((n) => names.add(n));
      incomplete.push(...incompleteFromJunit(text, file, failing.length));
    }
  }
  return { names: [...names].sort(), hadResults, formats: [...formats].sort(), incomplete };
}

export function judge(outDir, baselinePath) {
  const suppress = new Set(parseSuppressList(readFileSync(baselinePath, 'utf8')));
  const reasons = [];
  const failedMarker = join(outDir, '.failed');
  if (existsSync(failedMarker)) {
    for (const line of readFileSync(failedMarker, 'utf8').split(/\r?\n/)) {
      if (line.trim()) reasons.push(`suite failed to run: ${line.trim()}`);
    }
    if (reasons.length === 0) reasons.push('suite failed to run: (no command recorded)');
  }
  const collected = collectFailing(outDir);
  if (!collected.hadResults) reasons.push(`no .trx, vitest JSON or JUnit XML under ${outDir}; nothing was collected`);
  reasons.push(...collected.incomplete);
  if (reasons.length > 0) {
    return { status: 'INCOMPLETE', newFailing: [], suppressed: [], reasons, formats: collected.formats };
  }
  const newFailing = [];
  const suppressed = [];
  for (const name of collected.names) {
    const lastDot = name.lastIndexOf('.');
    const cls = lastDot > 0 ? name.slice(0, lastDot) : name;
    if (suppress.has(name) || (cls !== name && suppress.has(cls))) suppressed.push(name);
    else newFailing.push(name);
  }
  return { status: 'JUDGED', newFailing, suppressed, reasons: [], formats: collected.formats };
}

export function formatReport(result, outDir, baselinePath) {
  const lines = [`== judge: ${outDir} vs ${basename(baselinePath)} ==`];
  if (result.status === 'INCOMPLETE') {
    lines.push('INCOMPLETE  lane 6 did not run cleanly; a suite produced no results (crash, missing SDK, install failure or timeout).');
    for (const reason of result.reasons) lines.push(`INCOMPLETE  ${reason}`);
    lines.push('== judge summary: INCOMPLETE; do NOT read as pass; re-run lane 6 (see qa-lane-6-suites troubleshooting) ==');
    return lines.join('\n');
  }
  for (const name of result.suppressed) lines.push(`SUPPRESSED  ${name}`);
  for (const name of result.newFailing) lines.push(`NEW-FAILING ${name}`);
  lines.push(`== judge summary: ${result.newFailing.length} new-failing, ${result.suppressed.length} suppressed (judge by the SET above, never these counts) ==`);
  return lines.join('\n');
}

function main(argv) {
  const [outDir, baselinePath] = argv;
  if (!outDir || !baselinePath) {
    process.stderr.write('usage: node judge.mjs <out-dir> <known-issues.md>\n');
    return 2;
  }
  if (!existsSync(baselinePath)) {
    process.stderr.write(`judge: baseline not found: ${baselinePath}\n`);
    return 1;
  }
  const result = judge(outDir, baselinePath);
  process.stdout.write(formatReport(result, outDir, baselinePath) + '\n');
  return 0;
}

// Run main only when invoked as `node judge.mjs ...`; when imported by a test, argv[1] is the
// test file, so nothing runs.
if (process.argv[1] && basename(process.argv[1]) === 'judge.mjs') {
  process.exit(main(process.argv.slice(2)));
}
