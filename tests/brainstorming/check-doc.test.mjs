import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import test from 'node:test';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '../..');
const scriptPath = resolve(repoRoot, 'skills/brainstorming/scripts/check-doc.mjs');
const payloadPath = resolve(repoRoot, 'templates/specs/_template/Spec.md.tmpl');
const specPath = resolve(repoRoot, 'docs/ultrapowers/specs/2026-10-12-spec-template-and-decision-record-design.md');
const { checkDoc, resolveTemplate, RULES } = await import(pathToFileURL(scriptPath).href);

const read = (path) => readFileSync(path, 'utf8').replace(/\r\n/g, '\n');
const TEMPLATE = read(payloadPath);
const FIXTURE = read(resolve(__dirname, 'fixtures/minimal-valid.md'));

const rulesOf = (findings) => findings.map((f) => f.rule);
const linesOf = (findings) => findings.map((f) => f.line);

// One-line edit of a document. It fails when the text to replace is missing,
// so a typo cannot turn a test into a pass.
function mutate(text, from, to) {
  assert.ok(text.includes(from), `the text has no ${JSON.stringify(from)}`);
  return text.replace(from, () => to);
}

// The 1-based number of the first line that equals `line`.
function lineOf(text, line) {
  const at = text.split('\n').indexOf(line);
  assert.notEqual(at, -1, `the text has no line ${JSON.stringify(line)}`);
  return at + 1;
}

// A document as chunks: the text before the first "## " heading, then one chunk
// per section, each with its heading and the blank line after its body.
const chunks = (text) => text.split(/^(?=## )/m);
const indexOfSection = (parts, title) => parts.findIndex((part) => part.startsWith(`## ${title}\n`));
const dropSection = (text, title) => chunks(text).filter((part) => !part.startsWith(`## ${title}\n`)).join('');

function swapSections(text, a, b) {
  const parts = chunks(text);
  const i = indexOfSection(parts, a);
  const j = indexOfSection(parts, b);
  [parts[i], parts[j]] = [parts[j], parts[i]];
  return parts.join('');
}

function moveSection(text, title, before) {
  const parts = chunks(text);
  const [moved] = parts.splice(indexOfSection(parts, title), 1);
  parts.splice(indexOfSection(parts, before), 0, moved);
  return parts.join('');
}

// The fixture with `text` in place of the single line under "## Intent".
const withIntent = (text) => mutate(FIXTURE, '## Intent\nNone: fixture.', `## Intent\n${text}`);

// The fixture followed by ledger rows.
const withRows = (...rows) => `${FIXTURE}${rows.join('\n')}\n`;

const plainDir = () => mkdtempSync(join(tmpdir(), 'check-doc-'));

// A scaffolded project: the config marker and, unless told otherwise, a project
// copy of the template under specs/_template/.
function makeProject({ copy = true } = {}) {
  const root = plainDir();
  mkdirSync(join(root, '.agents'), { recursive: true });
  writeFileSync(join(root, '.agents', 'ultrapowers.json'), '{}\n');
  const own = join(root, 'specs', '_template', 'Spec.md');
  if (copy) {
    mkdirSync(dirname(own), { recursive: true });
    writeFileSync(own, TEMPLATE);
  }
  return { root, own };
}

const run = (args, options = {}) => spawnSync(process.execPath, [scriptPath, ...args], { encoding: 'utf8', ...options });

test('RULES names the seven rules in order', () => assert.deepEqual(RULES, ['heading', 'status', 'question', 'placeholder', 'empty', 'record', 'ledger']));

test('the minimal valid fixture has no finding', () => assert.deepEqual(checkDoc(FIXTURE, TEMPLATE), []));

test('a missing heading is reported at line 0', () => {
  const findings = checkDoc(dropSection(FIXTURE, 'Data flow'), TEMPLATE);
  assert.deepEqual(rulesOf(findings), ['heading']);
  assert.equal(findings[0].line, 0);
  assert.match(findings[0].message, /Data flow/);
});

test('a reordered heading is reported at its line', () => {
  // One section moved early: the heading that came early is the one finding.
  const early = moveSection(FIXTURE, 'Testing', 'Components');
  const one = checkDoc(early, TEMPLATE);
  assert.deepEqual(rulesOf(one), ['heading']);
  assert.equal(one[0].line, lineOf(early, '## Testing'));
  assert.match(one[0].message, /Testing/);
  // Two sections swapped, three apart: both are out of place, each at its own line.
  const swapped = swapSections(FIXTURE, 'Components', 'Testing');
  const two = checkDoc(swapped, TEMPLATE);
  assert.deepEqual(rulesOf(two), ['heading', 'heading']);
  assert.deepEqual(linesOf(two), [lineOf(swapped, '## Testing'), lineOf(swapped, '## Components')]);
  // Two neighbours swapped: the heading that came early is the one finding.
  const neighbours = swapSections(FIXTURE, 'Data flow', 'Error handling');
  const pair = checkDoc(neighbours, TEMPLATE);
  assert.deepEqual(rulesOf(pair), ['heading']);
  assert.equal(pair[0].line, lineOf(neighbours, '## Error handling'));
  // The last two swapped: again the one that came early.
  const tail = swapSections(FIXTURE, 'Repositories in scope', 'Assumption ledger');
  const last = checkDoc(tail, TEMPLATE);
  assert.deepEqual(rulesOf(last), ['heading']);
  assert.equal(last[0].line, lineOf(tail, '## Assumption ledger'));
  // An extra heading between required ones is not a reorder.
  assert.deepEqual(checkDoc(mutate(FIXTURE, '## Components\n', '## Extra\nNone: x\n\n## Components\n'), TEMPLATE), []);
});

test('a missing status line is reported', () => {
  const status = 'Status: draft, 2026-10-12. Ticket: none.\n\n';
  const findings = checkDoc(mutate(FIXTURE, status, ''), TEMPLATE);
  assert.deepEqual(rulesOf(findings), ['status']);
  assert.equal(findings[0].line, 0);
  // A status that does not fit the shape is the same finding.
  for (const bad of ['Status: done, 2026-10-12.', 'Status: Draft, 2026-10-12.', 'Status: draft, 2026-10-12']) {
    assert.deepEqual(rulesOf(checkDoc(mutate(FIXTURE, 'Status: draft, 2026-10-12.', bad), TEMPLATE)), ['status'], bad);
  }
  // The status counts before the first "## " heading only.
  const late = mutate(mutate(FIXTURE, status, ''), '## Intent\n', '## Intent\nStatus: draft, 2026-10-12.\n');
  assert.deepEqual(rulesOf(checkDoc(late, TEMPLATE)), ['status']);
  // approved and superseded fit.
  for (const word of ['approved', 'superseded']) {
    assert.deepEqual(checkDoc(mutate(FIXTURE, 'Status: draft,', `Status: ${word},`), TEMPLATE), [], word);
  }
});

test('a surviving italic question line is reported at its line', () => {
  const templateLines = TEMPLATE.split('\n');
  const question = templateLines[templateLines.indexOf('## Intent') + 1];
  assert.match(question, /^_.+_$/);
  const doc = mutate(FIXTURE, '## Intent\n', `## Intent\n${question}\n`);
  const findings = checkDoc(doc, TEMPLATE);
  assert.deepEqual(rulesOf(findings), ['question']);
  assert.equal(findings[0].line, lineOf(doc, question));
  assert.equal(findings[0].line, 6);
  // Lines are compared trimmed.
  assert.deepEqual(linesOf(checkDoc(mutate(FIXTURE, '## Intent\n', `## Intent\n  ${question}  \n`), TEMPLATE)), [6]);
  // A reworded question is an answer, not a survivor.
  assert.deepEqual(checkDoc(mutate(FIXTURE, '## Intent\n', '## Intent\n_What is the moment?_\n'), TEMPLATE), []);
  // A section that holds nothing but the question is empty as well.
  const alone = mutate(FIXTURE, '## Intent\nNone: fixture.\n', `## Intent\n${question}\n`);
  assert.deepEqual(rulesOf(checkDoc(alone, TEMPLATE)), ['empty', 'question']);
  // A horizontal rule is not a question, even where the template carries one.
  const ruled = mutate(TEMPLATE, '## Intent\n', '## Intent\n___\n');
  assert.deepEqual(checkDoc(mutate(FIXTURE, '## Intent\n', '## Intent\n___\n'), ruled), []);
});

test('TBD outside code is a placeholder; inside a code span it is not', () => {
  const tbd = checkDoc(withIntent('None: TBD with the owner.'), TEMPLATE);
  assert.deepEqual(rulesOf(tbd), ['placeholder']);
  assert.equal(tbd[0].line, 6);
  assert.match(tbd[0].message, /TBD/);
  const todo = checkDoc(withIntent('None: TODO later.'), TEMPLATE);
  assert.deepEqual(rulesOf(todo), ['placeholder']);
  assert.match(todo[0].message, /TODO/);
  assert.deepEqual(checkDoc(withIntent('None: the word `TBD` is quoted here.'), TEMPLATE), []);
  // Only the word counts, and a line with several is one finding.
  assert.deepEqual(checkDoc(withIntent('None: TBDs and TODOS are other words.'), TEMPLATE), []);
  assert.equal(checkDoc(withIntent('None: TBD, TODO and TBD.'), TEMPLATE).length, 1);
});

test('an angle placeholder is reported; one starting with http or inside a code span is not', () => {
  const angle = checkDoc(withIntent('None: see <the owner> first.'), TEMPLATE);
  assert.deepEqual(rulesOf(angle), ['placeholder']);
  assert.equal(angle[0].line, 6);
  assert.match(angle[0].message, /<the owner>/);
  assert.deepEqual(checkDoc(withIntent('None: read <https://example.com/x> first.'), TEMPLATE), []);
  assert.deepEqual(checkDoc(withIntent('None: type `<id>` first.'), TEMPLATE), []);
  // One finding per line, however many placeholders the line holds.
  assert.equal(checkDoc(withIntent('None: <a> and <b> and TBD.'), TEMPLATE).length, 1);
  // A placeholder that wraps is reported at the line it starts on.
  assert.deepEqual(linesOf(checkDoc(withIntent('None: fill in <the\n  decision> now.'), TEMPLATE)), [6]);
});

test('a bare None is an empty section; None with a reason is content', () => {
  const heading = '## Constraints\n';
  for (const bare of ['None', 'None:', 'None:   ', '  None:  ']) {
    const doc = mutate(FIXTURE, `${heading}None: fixture.\n`, `${heading}${bare}\n`);
    const findings = checkDoc(doc, TEMPLATE);
    assert.deepEqual(rulesOf(findings), ['empty'], JSON.stringify(bare));
    assert.equal(findings[0].line, lineOf(doc, '## Constraints'));
    assert.match(findings[0].message, /Constraints/);
  }
  // A section with nothing under it is empty too.
  assert.deepEqual(rulesOf(checkDoc(mutate(FIXTURE, `${heading}None: fixture.\n`, heading), TEMPLATE)), ['empty']);
  // A reason is content.
  assert.deepEqual(checkDoc(mutate(FIXTURE, `${heading}None: fixture.`, `${heading}None: no project-wide rule binds this change.`), TEMPLATE), []);
  // The section ends at the next "## " heading, not at the next section of the template.
  const extra = mutate(FIXTURE, '## Components\n', '## Extra\n\n## Components\n');
  assert.deepEqual(checkDoc(extra, TEMPLATE), []);
});

test('a missing D1 block is reported', () => {
  const doc = mutate(FIXTURE, '### D1: the approach', '### D2: the approach');
  const findings = checkDoc(doc, TEMPLATE);
  assert.deepEqual(rulesOf(findings), ['record']);
  assert.match(findings[0].message, /D1/);
  assert.equal(findings[0].line, lineOf(doc, '## Decision record'));
  // A document with no record section at all misses the heading and the record.
  const none = checkDoc(dropSection(FIXTURE, 'Decision record'), TEMPLATE);
  assert.deepEqual(rulesOf(none), ['heading', 'record']);
  assert.deepEqual(linesOf(none), [0, 0]);
});

test('a missing label is reported by block and label', () => {
  const doc = mutate(FIXTURE, '- **Edge cases:** none known. Evidence: this file\n', '');
  const findings = checkDoc(doc, TEMPLATE);
  assert.deepEqual(rulesOf(findings), ['record']);
  assert.match(findings[0].message, /D1/);
  assert.match(findings[0].message, /Edge cases/);
  assert.equal(findings[0].line, lineOf(doc, '### D1: the approach'));
  // Every block is checked and named: D2 has only its Chosen line.
  const two = mutate(FIXTURE, '\n## Architecture', '\n### D2: another\n- **Chosen:** x\n\n## Architecture');
  const missing = checkDoc(two, TEMPLATE);
  assert.deepEqual(rulesOf(missing), ['record', 'record', 'record', 'record']);
  assert.ok(missing.every((f) => /D2/.test(f.message)));
  for (const label of ['Why this one', 'Rejected', 'Failure points', 'Edge cases']) {
    assert.ok(missing.some((f) => f.message.includes(label)), label);
  }
});

test('a reordered label is reported', () => {
  const why = '- **Why this one:** it is small. Evidence: this file\n';
  const rejected = '- **Rejected:** nothing, because the fixture fixes the change. Evidence: this file\n';
  const doc = mutate(FIXTURE, why + rejected, rejected + why);
  const findings = checkDoc(doc, TEMPLATE);
  assert.deepEqual(rulesOf(findings), ['record']);
  assert.equal(findings[0].line, lineOf(doc, rejected.trimEnd()));
  assert.match(findings[0].message, /D1/);
  assert.match(findings[0].message, /Rejected/);
});

test('a repeated Rejected label is allowed', () => {
  const second = '- **Rejected:** a second option, because it costs more. Evidence: this file\n';
  assert.deepEqual(checkDoc(mutate(FIXTURE, '- **Failure points:**', `${second}- **Failure points:**`), TEMPLATE), []);
  // Wherever it repeats: only the first occurrence of each label sets the order.
  const edge = '- **Edge cases:** none known. Evidence: this file\n';
  assert.deepEqual(checkDoc(mutate(FIXTURE, edge, edge + second), TEMPLATE), []);
});

test('an untagged line under Failure points is reported', () => {
  const doc = mutate(FIXTURE, '- **Failure points:** none known. Evidence: this file', '- **Failure points:** none known.');
  const findings = checkDoc(doc, TEMPLATE);
  assert.deepEqual(rulesOf(findings), ['record']);
  assert.equal(findings[0].line, lineOf(doc, '- **Failure points:** none known.'));
  assert.match(findings[0].message, /D1/);
  assert.match(findings[0].message, /Failure points/);
  // Assumption: and My call are tags too.
  for (const tag of ['Assumption: nobody read it.', 'My call: a minor choice.']) {
    const tagged = mutate(FIXTURE, 'none known. Evidence: this file\n- **Edge cases:**', `none known. ${tag}\n- **Edge cases:**`);
    assert.deepEqual(checkDoc(tagged, TEMPLATE), [], tag);
  }
  // A line that is no known label needs a tag as well, once Why this one has begun.
  const extra = mutate(FIXTURE, '\n## Architecture', '- a bullet that is no label\n\n## Architecture');
  const bullet = checkDoc(extra, TEMPLATE);
  assert.deepEqual(rulesOf(bullet), ['record']);
  assert.equal(bullet[0].line, lineOf(extra, '- a bullet that is no label'));
});

test('a wrapped bullet whose tag is on its second line passes', () => {
  const wrapped = mutate(FIXTURE, '- **Edge cases:** none known. Evidence: this file', '- **Edge cases:** none known.\n  Evidence: this file');
  assert.deepEqual(checkDoc(wrapped, TEMPLATE), []);
  // The same wrap with no tag is one untagged item, reported at its first line.
  const bare = mutate(FIXTURE, '- **Edge cases:** none known. Evidence: this file', '- **Edge cases:** none known.\n  and nothing else');
  const findings = checkDoc(bare, TEMPLATE);
  assert.deepEqual(rulesOf(findings), ['record']);
  assert.equal(findings[0].line, lineOf(bare, '- **Edge cases:** none known.'));
});

test('a non-bullet line inside a block is reported', () => {
  const edge = '- **Edge cases:** none known. Evidence: this file\n';
  const stray = mutate(FIXTURE, edge, `${edge}A stray sentence in the block.\n`);
  const findings = checkDoc(stray, TEMPLATE);
  assert.deepEqual(rulesOf(findings), ['record']);
  assert.equal(findings[0].line, lineOf(stray, 'A stray sentence in the block.'));
  assert.match(findings[0].message, /D1/);
  // A continuation that is not indented does not belong to the bullet.
  const flush = mutate(FIXTURE, edge, '- **Edge cases:** none known.\nEvidence: this file\n');
  assert.deepEqual(rulesOf(checkDoc(flush, TEMPLATE)), ['record', 'record']);
  // Text outside a block, before D1 or under another "### " heading, is not the record rule's business.
  assert.deepEqual(checkDoc(mutate(FIXTURE, '## Decision record\n\n', '## Decision record\n\nA sentence before the first block.\n\n'), TEMPLATE), []);
  assert.deepEqual(checkDoc(mutate(FIXTURE, '\n## Architecture', '\n### Notes\nSome prose here.\n\n## Architecture'), TEMPLATE), []);
});

test('a bad ledger header and a confidence outside the set are reported', () => {
  const header = '| # | Question | Chosen answer | Confidence | Reason |';
  const answer = '| # | Question | Answer | Confidence | Reason |';
  const bad = mutate(FIXTURE, header, answer);
  const findings = checkDoc(bad, TEMPLATE);
  assert.deepEqual(rulesOf(findings), ['ledger']);
  assert.equal(findings[0].line, lineOf(bad, answer));
  // Runs of whitespace are normalized in the header.
  assert.deepEqual(checkDoc(mutate(FIXTURE, header, '|  #  |  Question |Chosen   answer|Confidence|   Reason|'), TEMPLATE), []);
  // The confidence is high, medium or low in any case.
  assert.deepEqual(checkDoc(withRows('| 1 | q | a | High | r |', '| 2 | q | a | MEDIUM | r |', '| 3 | q | a | low | r |'), TEMPLATE), []);
  const maybe = withRows('| 1 | q | a | high | r |', '| 2 | q | a | maybe | r |');
  const row = checkDoc(maybe, TEMPLATE);
  assert.deepEqual(rulesOf(row), ['ledger']);
  assert.equal(row[0].line, lineOf(maybe, '| 2 | q | a | maybe | r |'));
  assert.match(row[0].message, /2/);
  assert.match(row[0].message, /maybe/);
  // A row has five cells, and an escaped pipe is not a cell boundary.
  assert.deepEqual(rulesOf(checkDoc(withRows('| 1 | q | a | high |'), TEMPLATE)), ['ledger']);
  assert.deepEqual(checkDoc(withRows('| 1 | `a \\| b` | a | high | r |'), TEMPLATE), []);
  // The second table line is the separator.
  assert.deepEqual(rulesOf(checkDoc(mutate(FIXTURE, '|---|---|---|---|---|', '| 1 | q | a | high | r |'), TEMPLATE)), ['ledger']);
  // The ledger ends at the next "## " heading: a table in a later section is not its business.
  assert.deepEqual(checkDoc(`${FIXTURE}\n## Rollout\n| a | b |\n|---|---|\n| x | y |\n`, `${TEMPLATE}\n## Rollout\n_How?_\n`), []);
});

test('a fenced copy of the template is ignored by every rule', () => {
  assert.deepEqual(checkDoc(`${FIXTURE}${'````markdown\n'}${TEMPLATE}\n${'````\n'}`, TEMPLATE), []);
  // A shorter fence inside a longer one does not end it, and a tilde fence is a fence.
  assert.deepEqual(checkDoc(`${FIXTURE}${'````markdown\n```js\n<x> TBD\n```\n````\n'}`, TEMPLATE), []);
  assert.deepEqual(checkDoc(`${FIXTURE}~~~\n## Fake\n<x> TBD\n~~~\n`, TEMPLATE), []);
  // The fence ends: the text after it is checked again, at its own line.
  const after = `${FIXTURE}${'```\nx\n```\n'}TBD after the fence\n`;
  const findings = checkDoc(after, TEMPLATE);
  assert.deepEqual(rulesOf(findings), ['placeholder']);
  assert.equal(findings[0].line, lineOf(after, 'TBD after the fence'));
  // A fence line with text after it does not close a fence, and a code span at the start of a line does not open one.
  const inner = `${FIXTURE}${'```\n```js\n<x> TBD\n```\n'}TBD after it\n`;
  assert.deepEqual(linesOf(checkDoc(inner, TEMPLATE)), [lineOf(inner, 'TBD after it')]);
  const span = `${FIXTURE}${'```not a fence``` but a span\n'}TBD after it\n`;
  assert.deepEqual(linesOf(checkDoc(span, TEMPLATE)), [lineOf(span, 'TBD after it')]);
});

test('a generated-by comment line is ignored', () => {
  const comment = '<!-- generated by ultrapowers init 2.0.1 on 2026-10-12; edit freely, init never overwrites this file -->\n';
  assert.deepEqual(checkDoc(comment + FIXTURE, TEMPLATE), []);
  // The project copy of the template starts with that line too.
  assert.deepEqual(checkDoc(FIXTURE, comment + TEMPLATE), []);
  // Line numbers stay those of the file: the comment is line 1.
  assert.deepEqual(linesOf(checkDoc(comment + withIntent('None: TBD'), TEMPLATE)), [7]);
  // A comment line hides what it holds.
  assert.deepEqual(checkDoc(mutate(FIXTURE, '## Intent\n', '## Intent\n<!-- TBD <note> -->\n'), TEMPLATE), []);
});

test('a code span across a line break hides its placeholder', () => {
  assert.deepEqual(checkDoc(withIntent('Run `node <skill dir>/x.mjs\n  --print-template` first.'), TEMPLATE), []);
  // The same words without the span are a placeholder, at the line it is on.
  const bare = checkDoc(withIntent('Run node <skill dir>/x.mjs\n  --print-template first.'), TEMPLATE);
  assert.deepEqual(rulesOf(bare), ['placeholder']);
  assert.deepEqual(linesOf(bare), [6]);
  assert.deepEqual(linesOf(checkDoc(withIntent('Run it\n  with <the thing> now.'), TEMPLATE)), [7]);
  // Text after the span is still text, and a span may hold a backtick between longer fences.
  assert.deepEqual(rulesOf(checkDoc(withIntent('`x` and <y>'), TEMPLATE)), ['placeholder']);
  assert.deepEqual(checkDoc(withIntent('Use ``a ` <b>`` here.'), TEMPLATE), []);
});

test('CRLF line endings behave as LF', () => {
  const crlf = (text) => text.replaceAll('\n', '\r\n');
  assert.deepEqual(checkDoc(crlf(FIXTURE), TEMPLATE), []);
  assert.deepEqual(checkDoc(crlf(FIXTURE), crlf(TEMPLATE)), []);
  const bad = withIntent('None: TBD');
  assert.deepEqual(rulesOf(checkDoc(crlf(bad), TEMPLATE)), ['placeholder']);
  assert.deepEqual(checkDoc(crlf(bad), TEMPLATE), checkDoc(bad, TEMPLATE));
  // Fences and comments are found with the carriage returns too.
  const quoted = `${FIXTURE}${'````markdown\n'}${TEMPLATE}\n${'````\n'}`;
  assert.deepEqual(checkDoc(crlf(quoted), crlf(TEMPLATE)), []);
  assert.deepEqual(checkDoc(crlf(`<!-- one line -->\n${FIXTURE}`), TEMPLATE), []);
});

test('trailing spaces after a heading are tolerated and a case difference is reported', () => {
  assert.deepEqual(checkDoc(mutate(FIXTURE, '## Data flow\n', '## Data flow   \n'), TEMPLATE), []);
  const findings = checkDoc(mutate(FIXTURE, '## Data flow\n', '## Data Flow\n'), TEMPLATE);
  assert.deepEqual(rulesOf(findings), ['heading']);
  assert.equal(findings[0].line, 0);
  assert.equal(findings[0].message, '"Data flow" is missing (found "Data Flow")');
});

test('the last section at end of file without a trailing newline passes', () => {
  assert.ok(FIXTURE.endsWith('\n'));
  assert.deepEqual(checkDoc(FIXTURE.replace(/\n$/, ''), TEMPLATE), []);
  // A content section last in the file, with no newline after it.
  const noLedger = dropSection(TEMPLATE, 'Assumption ledger');
  assert.deepEqual(checkDoc(dropSection(FIXTURE, 'Assumption ledger').replace(/\n+$/, ''), noLedger), []);
});

test('a project template with an extra section makes it required', () => {
  const project = `${TEMPLATE}\n## Rollout\n_How?_\n`;
  const findings = checkDoc(FIXTURE, project);
  assert.deepEqual(rulesOf(findings), ['heading']);
  assert.equal(findings[0].line, 0);
  assert.match(findings[0].message, /Rollout/);
  // Answered, the section is satisfied; its question kept, it is a survivor.
  assert.deepEqual(checkDoc(`${FIXTURE}\n## Rollout\nNone: the fixture ships nowhere.\n`, project), []);
  assert.deepEqual(rulesOf(checkDoc(`${FIXTURE}\n## Rollout\n_How?_\n`, project)), ['empty', 'question']);
  // A project question added to an existing section is read from the template too.
  const asked = mutate(TEMPLATE, '## Intent\n', '## Intent\n_Who signs it off?_\n');
  assert.deepEqual(checkDoc(FIXTURE, asked), []);
  assert.deepEqual(rulesOf(checkDoc(mutate(FIXTURE, '## Intent\n', '## Intent\n_Who signs it off?_\n'), asked)), ['question']);
  // A heading the template repeats is required once.
  assert.deepEqual(checkDoc(FIXTURE, `${TEMPLATE}\n## Intent\n_Again?_\n`), []);
});

test('a project template without the record still requires it', () => {
  const project = dropSection(TEMPLATE, 'Decision record');
  assert.ok(!project.includes('## Decision record'));
  const findings = checkDoc(dropSection(FIXTURE, 'Decision record'), project);
  assert.deepEqual(rulesOf(findings), ['record']);
  assert.equal(findings[0].line, 0);
  assert.match(findings[0].message, /Decision record/);
  // Where the document has the record, its blocks are checked all the same.
  assert.deepEqual(checkDoc(FIXTURE, project), []);
  const broken = mutate(FIXTURE, '- **Edge cases:** none known. Evidence: this file\n', '');
  assert.deepEqual(rulesOf(checkDoc(broken, project)), ['record']);
  // The status line is core as well.
  assert.deepEqual(rulesOf(checkDoc(mutate(FIXTURE, 'Status: draft, 2026-10-12. Ticket: none.\n\n', ''), project)), ['status']);
});

test('resolveTemplate prefers the project copy, then the payload', () => {
  const { root, own } = makeProject({ copy: false });
  const nested = join(root, 'docs', 'ultrapowers', 'specs');
  mkdirSync(nested, { recursive: true });
  // The config without a project copy: the payload.
  assert.deepEqual(resolveTemplate(nested), { path: payloadPath, source: 'plugin' });
  // With the project copy, found from the root and from a folder below it.
  mkdirSync(dirname(own), { recursive: true });
  writeFileSync(own, TEMPLATE);
  assert.deepEqual(resolveTemplate(root), { path: own, source: 'project' });
  assert.deepEqual(resolveTemplate(nested), { path: own, source: 'project' });
  // The nearest config decides: a nested project without a copy does not borrow the outer one.
  const inner = join(root, 'workspace', 'inner');
  mkdirSync(join(inner, '.agents'), { recursive: true });
  writeFileSync(join(inner, '.agents', 'ultrapowers.json'), '{}\n');
  assert.deepEqual(resolveTemplate(inner), { path: payloadPath, source: 'plugin' });
  // A copy with no config beside it is not a project.
  const loose = plainDir();
  mkdirSync(join(loose, 'specs', '_template'), { recursive: true });
  writeFileSync(join(loose, 'specs', '_template', 'Spec.md'), TEMPLATE);
  assert.deepEqual(resolveTemplate(loose), { path: payloadPath, source: 'plugin' });
  assert.deepEqual(resolveTemplate(plainDir()), { path: payloadPath, source: 'plugin' });
});

test('the command line exits 0, 1 and 2 and names the template on stderr', () => {
  const dir = plainDir();
  const good = join(dir, 'good.md');
  writeFileSync(good, FIXTURE);
  const ok = run([good]);
  assert.equal(ok.status, 0);
  assert.equal(ok.stdout, '');
  assert.equal(ok.stderr, `template: ${payloadPath}\n`);

  const bad = join(dir, 'bad.md');
  writeFileSync(bad, withIntent('None: TBD'));
  const failed = run([bad]);
  assert.equal(failed.status, 1);
  assert.match(failed.stderr, /^template: /);
  const lines = failed.stdout.trimEnd().split('\n');
  assert.equal(lines.length, 1);
  assert.match(lines[0], /^.+:\d+: [a-z]+: /);
  assert.ok(lines[0].startsWith(`${bad}:6: placeholder: `), lines[0]);

  // Several findings come in document order, the whole-document ones first.
  const several = join(dir, 'several.md');
  writeFileSync(several, dropSection(withIntent('None: TBD'), 'Data flow'));
  const listed = run([several]).stdout.trimEnd().split('\n').map((line) => /^.+:(\d+): ([a-z]+): /.exec(line));
  assert.deepEqual(listed.map((m) => [Number(m[1]), m[2]]), [[0, 'heading'], [6, 'placeholder']]);

  // Exit 2: a document that is not there, a template that is not there, a template without a heading, bad usage.
  const missing = run([join(dir, 'nope.md')]);
  assert.equal(missing.status, 2);
  assert.match(missing.stderr, /^template: /);
  assert.match(missing.stderr, /cannot read the document/);
  assert.equal(missing.stdout, '');
  const noTemplate = run(['--template', join(dir, 'no-template.md'), good]);
  assert.equal(noTemplate.status, 2);
  assert.ok(noTemplate.stderr.startsWith(`template: ${join(dir, 'no-template.md')}\n`), noTemplate.stderr);
  assert.match(noTemplate.stderr, /cannot read the template/);
  const flat = join(dir, 'flat.md');
  writeFileSync(flat, '# Only a title\n\nSome text.\n');
  const flatRun = run(['--template', flat, good]);
  assert.equal(flatRun.status, 2);
  assert.match(flatRun.stderr, /no "## " heading/);
  assert.equal(flatRun.stdout, '');
  assert.equal(run([]).status, 2);
  assert.match(run([]).stderr, /Usage: /);
  assert.equal(run(['--nope', good]).status, 2);
  assert.equal(run(['--template']).status, 2);

  // The project copy is used, and named, when the document sits in a scaffolded project.
  const { root, own } = makeProject();
  mkdirSync(join(root, 'specs', 'GH-1'), { recursive: true });
  const spec = join(root, 'specs', 'GH-1', 'Spec.md');
  writeFileSync(spec, FIXTURE);
  const project = run([spec]);
  assert.equal(project.status, 0);
  assert.equal(project.stderr, `template: ${own}\n`);
  // --template wins over the lookup.
  const explicit = run(['--template', payloadPath, spec]);
  assert.equal(explicit.status, 0);
  assert.equal(explicit.stderr, `template: ${payloadPath}\n`);
});

test('--print-template prints the resolved path alone', () => {
  const { root, own } = makeProject();
  const fromDir = run(['--print-template', root]);
  assert.equal(fromDir.status, 0);
  assert.equal(fromDir.stdout, `${own}\n`);
  assert.equal(fromDir.stderr, '');
  // From a document, which need not exist, and from the working directory (which a child reports as a real path).
  assert.equal(run(['--print-template', join(root, 'specs', 'GH-1', 'Spec.md')]).stdout, `${own}\n`);
  assert.equal(realpathSync.native(run(['--print-template'], { cwd: root }).stdout.trim()), realpathSync.native(own));
  // Without a project copy: the payload.
  const bare = makeProject({ copy: false });
  assert.equal(run(['--print-template', bare.root]).stdout, `${payloadPath}\n`);
  assert.equal(run(['--print-template', plainDir()]).stdout, `${payloadPath}\n`);
  // It does not combine with --template.
  assert.equal(run(['--print-template', '--template', payloadPath]).status, 2);
});

test("this feature's spec passes against the payload template", () => {
  assert.deepEqual(checkDoc(read(specPath), TEMPLATE), []);
});
