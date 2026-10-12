#!/usr/bin/env node
// check-doc: the shape check for a document written from a template.
//
// Node standard library only. The template names the sections a document must
// carry and the question lines its writer replaces; the rules that hold
// whatever the template says (the status line and the decision record) live
// here. The checker proves shape, never truth, and it never writes a file.
//
// Usage: node check-doc.mjs [--template <path>] <document>
//        node check-doc.mjs --print-template [<document or directory>]
// Output: "template: <path>" on stderr first, then one stdout line per finding,
//         "<document>:<line>: <rule>: <message>", in document order.
//         --print-template prints the resolved template path alone.
// Exit: 0 clean, 1 findings, 2 a file cannot be read, the template has no
//       "## " heading, or the usage is wrong.
//
// checkDoc(document, template) returns [{ line, rule, message }] in document
// order, line being 1-based and 0 when the finding concerns the whole document.
// It throws an Error when the template has no "## " heading.

import { readFileSync, realpathSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const RULES = Object.freeze(['heading', 'status', 'question', 'placeholder', 'empty', 'record', 'ledger']);

const PAYLOAD_TEMPLATE = resolve(dirname(fileURLToPath(import.meta.url)), '../../../templates/specs/_template/Spec.md.tmpl');

const STATUS_RE = /^Status: (?:draft|approved|superseded), \d{4}-\d{2}-\d{2}\./;
const FENCE_RE = /^\s*(`{3,}|~{3,})(.*)$/;
const COMMENT_RE = /^\s*<!--.*-->\s*$/;
const PLACEHOLDER_RE = /\bTBD\b|\bTODO\b|<[^>]+>/g;
// A run of backticks, then the next run of exactly as many.
const CODE_SPAN_RE = /(?<!`)(`+)(?!`)[\s\S]*?(?<!`)\1(?!`)/g;

const LABELS = Object.freeze(['Chosen', 'Why this one', 'Rejected', 'Failure points', 'Edge cases']);
const SOURCE_RE = /Evidence:|Assumption:|My call/;
const LEDGER_HEADER = Object.freeze(['#', 'Question', 'Chosen answer', 'Confidence', 'Reason']);
const CONFIDENCE = Object.freeze(['high', 'medium', 'low']);

const clip = (text, max = 60) => (text.length > max ? `${text.slice(0, max - 3)}...` : text);

// The lines of a text with every line of a fenced block (the fences included)
// and every whole-line HTML comment blanked. Line n is index n - 1. A fence
// closes on the same character, at least as long, with nothing after it, so a
// shorter fence quoted inside a longer one stays inside.
function linesOf(text) {
  let fence = null;
  return text.replace(/\r/g, '').split('\n').map((line) => {
    const marker = FENCE_RE.exec(line);
    if (fence) {
      if (marker && marker[1][0] === fence.char && marker[1].length >= fence.size && marker[2].trim() === '') fence = null;
      return '';
    }
    if (marker && !(marker[1][0] === '`' && marker[2].includes('`'))) {
      fence = { char: marker[1][0], size: marker[1].length };
      return '';
    }
    return COMMENT_RE.test(line) ? '' : line;
  });
}

// The "## " headings of the lines, each with the index of its line and the
// index where its section ends: the next "## " heading or the end of the text.
function headingsOf(lines) {
  const found = [];
  lines.forEach((line, index) => {
    if (line.startsWith('## ')) found.push({ text: line.slice(3).trim(), index });
  });
  found.forEach((heading, i) => {
    heading.end = i + 1 < found.length ? found[i + 1].index : lines.length;
  });
  return found;
}

// A question line of a template is wholly italic: it starts and ends with an
// underscore and holds something besides underscores, so "___" is not one.
function isQuestion(line) {
  const text = line.trim();
  return text.startsWith('_') && text.endsWith('_') && /[^_\s]/.test(text);
}

function parseTemplate(template) {
  const lines = linesOf(template);
  const headings = [];
  for (const { text } of headingsOf(lines)) {
    if (text && !headings.includes(text)) headings.push(text);
  }
  if (!headings.length) throw new Error('the template has no "## " heading');
  return { headings, questions: new Set(lines.filter(isQuestion).map((line) => line.trim())) };
}

// Which of a series of items must move for their template positions, in
// document order, to be in template order: everything outside the longest run
// that is already in order. Of equal runs the one that keeps the later items
// wins, so a finding lands on the item that came early. Returns document-order
// positions.
function misplaced(ranks) {
  const count = ranks.length;
  if (!count) return [];
  const run = new Array(count).fill(1);
  const from = new Array(count).fill(-1);
  for (let i = 0; i < count; i += 1) {
    for (let j = 0; j < i; j += 1) {
      if (ranks[j] < ranks[i] && run[j] + 1 >= run[i]) {
        run[i] = run[j] + 1;
        from[i] = j;
      }
    }
  }
  let last = 0;
  for (let i = 1; i < count; i += 1) {
    if (run[i] >= run[last]) last = i;
  }
  const kept = new Set();
  for (let i = last; i !== -1; i = from[i]) kept.add(i);
  return ranks.map((_, i) => i).filter((i) => !kept.has(i));
}

// The cells of a table row, outer pipes dropped, an escaped pipe kept in its cell.
const cellsOf = (line) => line.trim()
  .replace(/^\|/, '')
  .replace(/(?<!\\)\|$/, '')
  .split(/(?<!\\)\|/)
  .map((cell) => cell.trim().replace(/\s+/g, ' '));

// One "### D<n>:" block of the decision record: lines from + 1 up to `to`.
function checkBlock(lines, { name, from, to }, add) {
  const items = [];
  let open = null;
  for (let i = from + 1; i < to; i += 1) {
    const line = lines[i];
    if (line.trim() === '') continue;
    if (line.startsWith('- ')) {
      open = { index: i, text: line, label: LABELS.find((label) => line.startsWith(`- **${label}:**`)) ?? null };
      items.push(open);
    } else if (open && /^\s/.test(line)) {
      open.text += `\n${line}`;
    } else {
      open = null;
      add(i + 1, `${name}: "${clip(line.trim())}" is not part of a bullet item`);
    }
  }

  const first = (label) => items.find((item) => item.label === label);
  for (const label of LABELS) {
    if (!first(label)) add(from + 1, `${name} has no "- **${label}:**" line`);
  }
  const present = LABELS.filter((label) => first(label)).sort((a, b) => first(a).index - first(b).index);
  for (const k of misplaced(present.map((label) => LABELS.indexOf(label)))) {
    add(first(present[k]).index + 1, `${name}: "${present[k]}" is out of order; the order is ${LABELS.join(', ')}`);
  }

  const why = first('Why this one');
  if (!why) return;
  for (const item of items) {
    if (item.index < why.index || SOURCE_RE.test(item.text)) continue;
    const label = item.label ?? clip(item.text.split('\n')[0]);
    add(item.index + 1, `${name}: "${label}" has no Evidence:, Assumption: or My call`);
  }
}

// One function per rule, keyed by its name in RULES. Each gets the document
// and the template read once, and an `add(line, message)` for its own findings.
const CHECKS = {
  heading({ h2, spec }, add) {
    const found = [];
    spec.headings.forEach((want, rank) => {
      const hit = h2.find((h) => h.text === want);
      if (hit) {
        found.push({ rank, hit });
        return;
      }
      const near = h2.find((h) => h.text.toLowerCase() === want.toLowerCase());
      add(0, near ? `"${want}" is missing (found "${near.text}")` : `"${want}" is missing`);
    });
    found.sort((a, b) => a.hit.index - b.hit.index);
    for (const k of misplaced(found.map((entry) => entry.rank))) {
      const { rank, hit } = found[k];
      add(hit.index + 1, `"${hit.text}" is out of order; the template puts it ${rank ? `after "${spec.headings[rank - 1]}"` : 'first'}`);
    }
  },

  status({ lines, h2 }, add) {
    const before = lines.slice(0, h2.length ? h2[0].index : lines.length);
    if (!before.some((line) => STATUS_RE.test(line.trim()))) {
      add(0, 'no "Status: draft|approved|superseded, YYYY-MM-DD." line before the first "## " heading');
    }
  },

  question({ lines, spec }, add) {
    lines.forEach((line, i) => {
      if (spec.questions.has(line.trim())) add(i + 1, `the template line is still here, answer it or remove it: ${clip(line.trim())}`);
    });
  },

  // Per paragraph, the lines up to a blank line, with each inline code span
  // blanked (newlines kept) before the matching, so a span that wraps still
  // counts as code. One finding per line.
  placeholder({ lines }, add) {
    let start = 0;
    while (start < lines.length) {
      if (lines[start].trim() === '') {
        start += 1;
        continue;
      }
      let end = start;
      while (end < lines.length && lines[end].trim() !== '') end += 1;
      const text = lines.slice(start, end).join('\n').replace(CODE_SPAN_RE, (span) => span.replace(/[^\n]/g, ' '));
      const reported = new Set();
      for (const match of text.matchAll(PLACEHOLDER_RE)) {
        if (match[0].startsWith('<http')) continue;
        const line = start + text.slice(0, match.index).split('\n').length;
        if (reported.has(line)) continue;
        reported.add(line);
        add(line, `"${clip(match[0].replace(/\s+/g, ' '))}" is still in the text`);
      }
      start = end;
    }
  },

  empty({ lines, h2, spec }, add) {
    for (const want of spec.headings) {
      const section = h2.find((h) => h.text === want);
      if (!section) continue;
      const filled = lines.slice(section.index + 1, section.end).some((line) => {
        const text = line.trim();
        return text !== '' && !spec.questions.has(text) && !/^None:?$/.test(text);
      });
      if (!filled) add(section.index + 1, `"${want}" has no content; write it, or write "None:" and the reason`);
    }
  },

  record({ lines, h2 }, add) {
    const record = h2.find((h) => h.text === 'Decision record');
    if (!record) {
      add(0, 'the document has no "## Decision record" section');
      return;
    }
    const starts = [];
    for (let i = record.index + 1; i < record.end; i += 1) {
      if (lines[i].startsWith('### ')) starts.push(i);
    }
    const blocks = [];
    starts.forEach((from, k) => {
      const name = /^### (D\d+):/.exec(lines[from])?.[1];
      if (name) blocks.push({ name, from, to: k + 1 < starts.length ? starts[k + 1] : record.end });
    });
    if (!blocks.some((block) => block.name === 'D1')) add(record.index + 1, 'the decision record has no "### D1:" block');
    for (const block of blocks) checkBlock(lines, block, add);
  },

  ledger({ lines, h2 }, add) {
    const ledger = h2.find((h) => h.text === 'Assumption ledger');
    if (!ledger) return;
    const rows = [];
    for (let i = ledger.index + 1; i < ledger.end; i += 1) {
      if (lines[i].trimStart().startsWith('|')) rows.push({ index: i, cells: cellsOf(lines[i]) });
    }
    if (!rows.length) return;
    const [head, separator, ...body] = rows;
    if (head.cells.length !== LEDGER_HEADER.length || head.cells.some((cell, i) => cell !== LEDGER_HEADER[i])) {
      add(head.index + 1, `the table header is not | ${LEDGER_HEADER.join(' | ')} |`);
    }
    if (!separator) {
      add(head.index + 1, 'the table header has no separator row under it');
      return;
    }
    if (separator.cells.length !== LEDGER_HEADER.length || !separator.cells.every((cell) => /^:?-+:?$/.test(cell))) {
      add(separator.index + 1, 'the second table line is not the separator |---|---|---|---|---|');
    }
    body.forEach((row, k) => {
      const name = row.cells[0] || String(k + 1);
      if (row.cells.length !== LEDGER_HEADER.length) {
        add(row.index + 1, `row ${name} has ${row.cells.length} cells, expected ${LEDGER_HEADER.length}`);
      } else if (!CONFIDENCE.includes(row.cells[3].toLowerCase())) {
        add(row.index + 1, `row ${name}: Confidence "${row.cells[3]}" is not high, medium or low`);
      }
    });
  },
};

export function checkDoc(document, template) {
  const spec = parseTemplate(template);
  const lines = linesOf(document);
  const context = { lines, h2: headingsOf(lines), spec };
  const findings = [];
  for (const rule of RULES) {
    CHECKS[rule](context, (line, message) => findings.push({ line, rule, message }));
  }
  // The sort is stable: findings on one line keep the order of the rules.
  return findings.sort((a, b) => a.line - b.line);
}

function isFile(path) {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

// The template for a document in `fromDir`: the project's own copy when the
// nearest folder above holding .agents/ultrapowers.json has one, otherwise the
// payload file that ships beside this script.
export function resolveTemplate(fromDir) {
  let dir = resolve(fromDir);
  for (;;) {
    if (isFile(join(dir, '.agents', 'ultrapowers.json'))) {
      const own = join(dir, 'specs', '_template', 'Spec.md');
      if (isFile(own)) return { path: own, source: 'project' };
      break;
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return { path: PAYLOAD_TEMPLATE, source: 'plugin' };
}

const USAGE = 'Usage: node check-doc.mjs [--template <path>] <document>\n'
  + '       node check-doc.mjs --print-template [<document or directory>]\n';

function readText(what, path) {
  try {
    return readFileSync(path, 'utf8');
  } catch (error) {
    throw new Error(`cannot read the ${what} ${path} (${error.code ?? error.message})`);
  }
}

function main(argv) {
  const usage = () => {
    process.stderr.write(USAGE);
    return 2;
  };
  const operands = [];
  let templateArg = null;
  let printOnly = false;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--print-template') {
      printOnly = true;
    } else if (arg === '--template') {
      i += 1;
      if (i >= argv.length) return usage();
      templateArg = argv[i];
    } else if (arg.startsWith('--')) {
      return usage();
    } else {
      operands.push(arg);
    }
  }

  if (printOnly) {
    if (templateArg !== null || operands.length > 1) return usage();
    // A document works as well as a folder here: the walk starts below it and goes up.
    process.stdout.write(`${resolveTemplate(operands[0] ?? '.').path}\n`);
    return 0;
  }
  if (operands.length !== 1) return usage();

  const [documentPath] = operands;
  const templatePath = templateArg === null ? resolveTemplate(dirname(resolve(documentPath))).path : resolve(templateArg);
  process.stderr.write(`template: ${templatePath}\n`);
  let findings;
  try {
    const template = readText('template', templatePath);
    const document = readText('document', documentPath);
    findings = checkDoc(document, template);
  } catch (error) {
    process.stderr.write(`check-doc: ${error.message}\n`);
    return 2;
  }
  for (const { line, rule, message } of findings) process.stdout.write(`${documentPath}:${line}: ${rule}: ${message}\n`);
  return findings.length ? 1 : 0;
}

function invokedDirectly() {
  if (!process.argv[1]) return false;
  try {
    return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (invokedDirectly()) process.exitCode = main(process.argv.slice(2));
