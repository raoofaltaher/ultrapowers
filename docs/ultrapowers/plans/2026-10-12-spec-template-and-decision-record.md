# Spec Template and Decision Record Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use ultrapowers:subagent-driven-development (recommended) or ultrapowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every spec the brainstorming skill writes comes from one template, carries a decision record with a source on every claim line, and is refused by a checker at the self-review, the ticket commit, the end of the autopilot spec stage and the scaffolded pre-commit hook when it does not.

**Architecture:** A payload template (`templates/specs/_template/Spec.md.tmpl`, rendered to `specs/_template/Spec.md`) is the source of truth; a zero-dependency checker (`skills/brainstorming/scripts/check-doc.mjs`) reads a document against that template and reports findings; three call sites (the ticket commit script, the engine's `runEnd`, the pre-commit hook) run it; the brainstorming prose makes the approaches message, the coverage pass and the written design follow the template, with RED and GREEN pressure runs as the evidence.

**Tech Stack:** Node 22 built-ins (`node:fs`, `node:path`, `node:url`, `node:test`), POSIX sh, bash test suites, markdown.

**Spec:** `docs/ultrapowers/specs/2026-10-12-spec-template-and-decision-record-design.md`

## Global Constraints

- Zero dependencies: the checker uses node built-ins only (`AGENTS.md` rule 1).
- Skill bodies are code: every prose change lands with RED and GREEN evidence from pressure runs (`AGENTS.md` rules 2 and 3). Task 1 (RED) runs before Task 7 edits any skill; Task 8 (GREEN) runs after.
- Every harness, every change (`AGENTS.md` rule 9): this change touches no harness-specific surface; the prose is shared, the checker runs on node, the hook is git. The spec's Constraints section records that sentence; no per-harness file changes.
- Names: the folder is `_template`; the sections `Repositories in scope` and `Assumption ledger` keep the exact names the engine parses.
- Line endings: `commit-spec.sh`, `ticket-lib.sh` and `templates/.githooks/pre-commit.tmpl` stay LF.
- The upstream project's name never appears in the repository, in a commit message or in a test fixture.
- Version: the release bumps through `scripts/bump-version.sh`; this plan writes `2.2.0` into `templates/CHANGES.json` for the new target and the changed hook, and the release step corrects that value if the owner picks another number.
- Spec locations stay as they are: `docs/ultrapowers/specs/` by default, `specs/<ID>/Spec.md` in the ticket form.
- Scripts are invoked through their interpreter in prose (`node ...`), never by bare path.
- Commits stage files by name, never `git add -A` or `.`, and every commit message ends with the line `RAOOF A.`.

## Review Focus

1. A spec saved with CRLF line endings by a Windows editor: every rule must behave as on LF, so the status line, the italic lines and the labels still match. Test added to Task 3.
2. A heading with trailing spaces, or `## Decision Record` with a capital R: trailing spaces are tolerated, a case difference is reported by rule `heading` with the expected text in the message. Test added to Task 3.
3. A wrapped bullet whose `Evidence:` tag sits on its second, indented line: rule `record` reads the bullet item as one unit and passes it. Test added to Task 3.
4. The last section of a document that ends without a trailing newline: rule `empty` reads its body to the end of the file and passes it. Test added to Task 3.
5. A project checkout whose path holds a space: the hook's snapshot and checker call still run and still block a failing spec. Test added to Task 6.

---

### Task 1: Pressure scenarios D, E, F and their RED runs

**Files:**
- Modify: `tests/skills/brainstorming-pressure-scenarios.md` (append after scenario C)
- Modify: `tests/skills/brainstorming-pressure-results.md` (append a new part after the C section)

**Interfaces:**
- Consumes: `skills/brainstorming/SKILL.md` as committed on dev before any edit of this plan (the RED skill).
- Produces: the three scenario prompts that Task 8 reruns, and the RED records Task 8 compares against.

- [ ] **Step 1: Append the three scenarios to the scenarios file**

Append this text after scenario C, keeping the file's format:

```markdown
## D: the approaches

Prompt: the agent reads the skill, then the partner says "We need rate
limiting on the public API. The service is an Express app; requests
already pass one middleware chain in `src/middleware/`. Redis is available
in production. Design it with me." The partner answers every clarifying
question in one short sentence, prefers nothing, and says "go on" to any
approach you recommend.
Output: a verbatim transcript up to and including the message that presents
the approaches, then answers: how many approaches were named; for the
recommended one, whether the message states why it was chosen, its failure
points and its edge cases, each with a source; for each other approach,
whether the message states why it loses and its main failure point; whether
any claim is marked as an assumption or a call.

Expected before the change: a recommendation with trade-offs and nothing
else. Expected after: the recommended approach with why this one, failure
points and edge cases, every line carrying `Evidence:`, `Assumption:` or
`My call:`; each alternative with why not and its main failure point.

## E: the uncovered section

Prompt: the agent reads the skill, then the partner says "Let's add CSV
export to the invoices list. The list lives in `src/invoices/list.ts`, the
role filter in `src/auth/roles.ts`. Keep the role filter." The partner
answers questions about intent, goals and the export format, approves the
design, and never mentions what happens when the export fails, when the
list is empty, or when a row holds a comma. When asked anything about
failures or edge cases the partner says "you decide".
Output: the messages from the design approval to the written spec, then
answers: did the agent write an error-handling section without asking or
marking it; did it sort the gap into covered, minor or theirs; did it ask
in one message before writing; how are the settled items marked.

Expected before the change: the section is written from imagination with no
mark. Expected after: the gap is sorted, the theirs items are asked in one
message, the minor ones are marked `My call` and listed in the ledger.

## F: the autopilot form

Setup: project root `C:\proj`, `.agents/ultrapowers.json` present,
`.ultrapowers/autopilot-active` present, ticket GH-79 known, brief: "GH-79:
add a `--json` flag to the `report` command in `src/cli/report.ts`; the
flag prints the same figures as JSON. Repository: `.`".
Output: whether any question is asked, the exact spec path, and the full
text of the spec as the agent would write it.

Expected after the change: no question; `C:\proj\specs\GH-79\Spec.md`; the
spec carries every heading of the template in order, a `### D1:` block with
the five labels, `Assumption:` lines mirrored as ledger rows, and it passes
`node skills/brainstorming/scripts/check-doc.mjs` against the payload
template.
```

- [ ] **Step 2: Run the three RED scenarios**

Dispatch one fresh Sonnet subagent per scenario, in parallel, each with: read only `skills/brainstorming/SKILL.md` from the current checkout with one Read call, no other tool, simulate the partner as the scenario says, write no file, and return the transcript and the answers the scenario asks for. Scenario F's subagent returns the full spec text.

- [ ] **Step 3: Record the RED runs**

Append to `tests/skills/brainstorming-pressure-results.md` a part headed `# Brainstorming pressure results: the spec template and decision record`, with the method paragraph (fresh Sonnet subagent, one Read of the skill, no file written), then sections `## D, RED (skill at <sha>)`, `## E, RED (skill at <sha>)`, `## F, RED (skill at <sha>)`, each with the transcript excerpts and the answers verbatim. `<sha>` is `git rev-parse --short HEAD` at the time of the run. Leave a `## Verdict` heading for Task 8.

- [ ] **Step 4: Verify the baseline failed**

Read the three RED sections. Expected: D names no failure point or edge case with a source; E writes the error-handling section with no mark or question; F's spec lacks a `## Decision record` heading. If a scenario already passes, write that under its section and carry the fact into Task 8's verdict; do not change the scenario.

- [ ] **Step 5: Commit**

```bash
git add tests/skills/brainstorming-pressure-scenarios.md tests/skills/brainstorming-pressure-results.md
git commit -m "test(skills): pressure scenarios D, E, F and their RED runs for the spec template" -m "RAOOF A."
```

### Task 2: The payload template

**Files:**
- Create: `templates/specs/_template/Spec.md.tmpl`
- Modify: `templates/CHANGES.json`
- Modify: `templates/specs/README.md.tmpl`
- Modify: `tests/init/test-engine.mjs` (the scaffold test that reads rendered files, around line 185-210)
- Modify: `tests/init/test-modes.mjs` (near `check tells an older scaffold to upgrade`, line 1006)

**Interfaces:**
- Produces: the template text every later task reads; the rendered path `specs/_template/Spec.md`; the `CHANGES.json` key `specs/_template/Spec.md` at `2.2.0`.

- [ ] **Step 1: Write the failing init tests**

In `tests/init/test-engine.mjs`, inside the scaffold test that reads `AGENTS.md` and the hook, add:

```js
const specTemplate = fs.readFileSync(path.join(root, 'specs', '_template', 'Spec.md'), 'utf8').split('\n');
assert.match(specTemplate[0], /^<!-- generated by ultrapowers init \d+\.\d+\.\d+ on 2026-09-30; edit freely, init never overwrites this file -->$/);
assert.equal(specTemplate.slice(1).join('\n'), fs.readFileSync(path.join(repoRoot, 'templates', 'specs', '_template', 'Spec.md.tmpl'), 'utf8').replace(/\r\n/g, '\n'));
assert.ok(report.written.includes('specs/_template/Spec.md'));
```

In `tests/init/test-modes.mjs`, add after `check tells an older scaffold to upgrade`:

```js
test('an older scaffold without the spec template gets it from upgrade', () => {
  const root = scaffolded();
  fs.rmSync(path.join(root, 'specs', '_template'), { recursive: true, force: true });
  setMarkerVersion(root, '0.0.1');
  const check = run(['check', '--root', root], { env: ALL_SET });
  assert.ok(check.findings.some((f) => f.kind === 'upgrade-available'));
  const report = run(['upgrade', '--root', root], { env: ALL_SET });
  assert.equal(report.mode, 'upgrade');
  assert.ok(JSON.stringify(report).includes('specs/_template/Spec.md'), 'the preview lists the template among the files to create');
});
```

Use the file's own helpers (`scaffolded`, `setMarkerVersion`, `run`, `ALL_SET`); if `scaffolded` takes options, pass none.

- [ ] **Step 2: Run the init suite to verify it fails**

Run: `bash tests/init/run-tests.sh`
Expected: FAIL; `CHANGES.json lists exactly the targets the payload renders` still passes, the two new assertions fail on a missing file.

- [ ] **Step 3: Create the template**

Create `templates/specs/_template/Spec.md.tmpl` with the exact text of the fenced block under "Components > The template" in the spec, from `# <Title>` to the last italic ledger line, LF line endings, one trailing newline. It contains no `{{...}}`.

- [ ] **Step 4: Record the target and update the README template**

In `templates/CHANGES.json` add `"specs/_template/Spec.md": "2.2.0"` after the `"specs/README.md"` entry. In `templates/specs/README.md.tmpl`, add under "## What belongs here" this bullet:

```markdown
- The template every spec is written from is `_template/Spec.md`. The project may add sections and questions to it; the spec checker reads it, and the decision record cannot be removed.
```

- [ ] **Step 5: Run the init suite to verify it passes**

Run: `bash tests/init/run-tests.sh`
Expected: PASS, including `CHANGES.json lists exactly the targets the payload renders`.

- [ ] **Step 6: Commit**

```bash
git add templates/specs/_template/Spec.md.tmpl templates/CHANGES.json templates/specs/README.md.tmpl tests/init/test-engine.mjs tests/init/test-modes.mjs
git commit -m "feat(templates): the spec template under specs/_template/" -m "RAOOF A."
```

### Task 3: The checker

**Files:**
- Create: `skills/brainstorming/scripts/check-doc.mjs`
- Create: `tests/brainstorming/check-doc.test.mjs`
- Create: `tests/brainstorming/fixtures/minimal-valid.md`
- Modify: `AGENTS.md` (the "Running the tests" list, after `bash tests/skills/test-skill-bodies.sh`)
- Modify: `.github/workflows/ci.yml` (the Linux job, after line 60)

**Interfaces:**
- Consumes: `templates/specs/_template/Spec.md.tmpl` from Task 2 as the payload template.
- Produces: `checkDoc(document: string, template: string): Array<{ line: number, rule: string, message: string }>`; `resolveTemplate(fromDir: string): { path: string, source: 'project' | 'plugin' }`; `RULES`, the array of the seven rule names in order; the command line `node check-doc.mjs [--template <path>] <document>` and `node check-doc.mjs --print-template [<document or directory>]`; finding lines `<path>:<line>: <rule>: <message>`; exit codes 0, 1, 2; the stderr line `template: <path>` in check mode.

- [ ] **Step 1: Write the fixture**

Create `tests/brainstorming/fixtures/minimal-valid.md`:

```markdown
# Fixture

Status: draft, 2026-10-12. Ticket: none.

## Intent
None: fixture.

## Goals, non-goals and anti-goals
None: fixture.

## Constraints
None: fixture.

## Decision record

### D1: the approach
- **Chosen:** the fixture
- **Why this one:** it is small. Evidence: this file
- **Rejected:** nothing, because the fixture fixes the change. Evidence: this file
- **Failure points:** none known. Evidence: this file
- **Edge cases:** none known. Evidence: this file

## Architecture
None: fixture.

## Components
None: fixture.

## Data flow
None: fixture.

## Error handling
None: fixture.

## Testing
None: fixture.

## Left to the builder
None: fixture.

## Definition of done
None: fixture.

## Repositories in scope
- .

## Assumption ledger
| # | Question | Chosen answer | Confidence | Reason |
|---|---|---|---|---|
```

- [ ] **Step 2: Write the failing tests**

Create `tests/brainstorming/check-doc.test.mjs` in the style of `tests/team-memory/memory-lint.test.mjs`: import `checkDoc`, `resolveTemplate` and `RULES` through `pathToFileURL`, read the payload template and the fixture once, and define `rulesOf = (findings) => findings.map((f) => f.rule)` and `mutate(text, from, to)` for one-line edits of the fixture. Tests, each named as written:

```js
test('RULES names the seven rules in order', () => assert.deepEqual(RULES, ['heading', 'status', 'question', 'placeholder', 'empty', 'record', 'ledger']));
test('the minimal valid fixture has no finding', () => assert.deepEqual(checkDoc(FIXTURE, TEMPLATE), []));
test('a missing heading is reported at line 0', ...); // remove the "## Data flow" section: one finding, rule heading, line 0, message contains "Data flow"
test('a reordered heading is reported at its line', ...); // swap the Testing and Components sections: one finding, rule heading, line of the heading that came early
test('a missing status line is reported', ...); // drop the Status line: rules include status, line 0
test('a surviving italic question line is reported at its line', ...); // insert the template's first Intent question under ## Intent: rule question at that line
test('TBD outside code is a placeholder; inside a code span it is not', ...);
test('an angle placeholder is reported; one starting with http or inside a code span is not', ...);
test('a bare None is an empty section; None with a reason is content', ...);
test('a missing D1 block is reported', ...);
test('a missing label is reported by block and label', ...); // drop Edge cases: message contains "D1" and "Edge cases"
test('a reordered label is reported', ...); // Rejected before Why this one
test('a repeated Rejected label is allowed', ...);
test('an untagged line under Failure points is reported', ...); // "- **Failure points:** none known." : rule record, that line
test('a wrapped bullet whose tag is on its second line passes', ...); // "- **Edge cases:** none known.\n  Evidence: this file"
test('a non-bullet line inside a block is reported', ...);
test('a bad ledger header and a confidence outside the set are reported', ...);
test('a fenced copy of the template is ignored by every rule', ...); // append "````markdown\n" + TEMPLATE + "\n````\n" to the fixture: no finding
test('a generated-by comment line is ignored', ...); // prepend init's comment line: no finding
test('a code span across a line break hides its placeholder', ...); // a paragraph "run `node <skill dir>/x.mjs\n  --print-template` first": no placeholder finding
test('CRLF line endings behave as LF', ...); // fixture with \r\n: no finding
test('trailing spaces after a heading are tolerated and a case difference is reported', ...);
test('the last section at end of file without a trailing newline passes', ...);
test('a project template with an extra section makes it required', ...); // TEMPLATE + "\n## Rollout\n_How?_\n": fixture gets rule heading for Rollout
test('a project template without the record still requires it', ...); // TEMPLATE minus its Decision record section, fixture minus the record: rule record
test('resolveTemplate prefers the project copy, then the payload', ...); // tmp root with .agents/ultrapowers.json and specs/_template/Spec.md: source project; without the file: source plugin and the payload path
test('the command line exits 0, 1 and 2 and names the template on stderr', ...); // spawnSync node check-doc.mjs on the fixture (0), a mutated fixture (1, stdout lines match /^.+:\d+: [a-z]+: /), a missing file (2); stderr starts with "template: "
test('--print-template prints the resolved path alone', ...);
test("this feature's spec passes against the payload template", ...); // docs/ultrapowers/specs/2026-10-12-spec-template-and-decision-record-design.md: no finding
```

Every test asserts the rule names and, where the test name says so, the line number.

- [ ] **Step 3: Run the suite to verify it fails**

Run: `node --test tests/brainstorming/check-doc.test.mjs`
Expected: FAIL at the import (module not found).

- [ ] **Step 4: Implement the checker**

Create `skills/brainstorming/scripts/check-doc.mjs` with the exports of the Interfaces block and a `main(argv)` guarded by the `invokedDirectly` pattern of `skills/team-memory/scripts/memory-lint.mjs:222-223`. Preprocessing before any rule: split on `\n` after removing `\r`, blank every line of a fenced block (a line that starts with three backticks or three tildes toggles the fence and is blanked itself), blank every line that is a whole HTML comment, keep line numbers. Then the seven rules as the spec's "The checker" section defines them, with these fixed points:

- `heading`: template headings are the lines starting with `## ` after preprocessing the template too, text trimmed; the document's headings are compared trimmed and case-sensitively; a case-only difference produces the finding `heading: "<expected>" is missing (found "<actual>")`.
- `question`: the template's italic lines are the lines that start with `_` and end with `_` after trimming; compare trimmed.
- `placeholder`: inline code spans are removed per paragraph (lines joined up to a blank line) before matching `\bTBD\b`, `\bTODO\b` and `<[^>]+>` that does not start with `<http`; the finding's line is the line of the match inside the paragraph.
- `empty`: a section body runs from the line after its heading to the line before the next `## ` heading or the end of the file; content is a non-blank line that is not a template italic line and not `None` or `None:` with only whitespace after it.
- `record`: a block runs from `### D<n>:` to the next `### ` or `## ` heading or the end of the file; a bullet item is a `- ` line plus the following lines that start with whitespace; the five labels are matched as `- **<label>:**` at the start of a bullet item.
- `ledger`: cells are split on `|` after trimming the outer pipes; the header is compared with runs of whitespace collapsed.

`resolveTemplate(fromDir)` walks up from `fromDir` to the filesystem root looking for `.agents/ultrapowers.json`; the payload path is `path.resolve(<this file's dir>, '../../../templates/specs/_template/Spec.md.tmpl')`. Exit 2 when the template or the document cannot be read or the template has no `## ` heading; the message goes to stderr.

- [ ] **Step 5: Run the suite to verify it passes**

Run: `node --test tests/brainstorming/check-doc.test.mjs`
Expected: PASS, every test.

- [ ] **Step 6: Register the suite**

Add `node --test tests/brainstorming/check-doc.test.mjs` to the `AGENTS.md` test list after the `test-skill-bodies.sh` line, and `- run: node --test tests/brainstorming/check-doc.test.mjs` to `.github/workflows/ci.yml` after the `test-skill-bodies.sh` line of the Linux job.

- [ ] **Step 7: Commit**

```bash
git add skills/brainstorming/scripts/check-doc.mjs tests/brainstorming/check-doc.test.mjs tests/brainstorming/fixtures/minimal-valid.md AGENTS.md .github/workflows/ci.yml
git commit -m "feat(brainstorming): check-doc.mjs, the template-driven spec checker" -m "RAOOF A."
```

### Task 4: The ticket door: commit-spec.sh and the `_template` id

**Files:**
- Modify: `skills/brainstorm-task/scripts/commit-spec.sh` (between the existence check and `git add`)
- Modify: `skills/new-task/scripts/ticket-lib.sh:119-124`
- Modify: `tests/task-lifecycle/test-task-lifecycle.sh` (`test_lib` ticket lists at line 85-99; `test_brainstorm_task` commit-spec cases at line 703-730; `test_review_fixes` commit-spec cases at line 860-895)

**Interfaces:**
- Consumes: the checker's command line and exit codes from Task 3; `have_node` from `ticket-lib.sh:30`.
- Produces: the markers `=== SPEC-CHECK-FAILED ===` and `=== SPEC-CHECK-SKIPPED ===` on stdout of `commit-spec.sh`; `_template` and `_x` refused by `validate_ticket` with exit 2 and the message `no /, backslash, whitespace, leading -, leading _, . or ..`.

- [ ] **Step 1: Write the failing lifecycle cases**

In `test_lib`, add `_template` and `_x` to the rejected id list at line 93. In `test_brainstorm_task`, replace the one-line spec fixtures (`printf '# 1234 design\n' > ...` at line 704 and `printf '# 500 design\n' > ...` at line 722) with `cp "$REPO_ROOT/tests/brainstorming/fixtures/minimal-valid.md" "$proj/specs/1234/Spec.md"` and the same for `$trailered/specs/500/Spec.md`; then add after the trailer case:

```bash
    # --- the spec check ---
    printf '%s\n' '## Intent' '_What is the moment this exists for, and who is in it?_' >> "$proj/specs/1234/Spec.md"
    rc=0
    out="$(cd "$proj" && bash "$COMMIT_SPEC" 1234 "unchecked" 2>&1)" || rc=$?
    if [[ "$rc" -eq 1 && "$out" == *"=== SPEC-CHECK-FAILED ==="* && "$out" == *": question: "* && -z "$(git -C "$proj" diff --cached --name-only)" ]]; then
        pass "commit-spec refuses a spec that fails the check and stages nothing"
    else
        fail "commit-spec refuses a spec that fails the check and stages nothing"; echo "    out: $out"
    fi
    rc=0
    out="$(cd "$proj" && ULTRAPOWERS_NO_NODE=1 bash "$COMMIT_SPEC" 1234 "skipped" 2>&1)" || rc=$?
    if [[ "$rc" -eq 0 && "$out" == *"=== SPEC-CHECK-SKIPPED ==="* && "$out" == *"=== COMMITTED ==="* ]]; then
        pass "commit-spec without node prints the skipped marker and commits"
    else
        fail "commit-spec without node prints the skipped marker and commits"; echo "    out: $out"
    fi
```

In `test_review_fixes`, make every spec that a commit-spec case commits a copy of the fixture, so the cases keep their meaning (a rejected commit, an unchanged spec).

- [ ] **Step 2: Run the lifecycle suite to verify it fails**

Run: `bash tests/task-lifecycle/test-task-lifecycle.sh`
Expected: FAIL on `validate_ticket rejects [_template]`, `[_x]`, and the two new commit-spec cases; every other case still passes.

- [ ] **Step 3: Refuse a leading underscore**

In `ticket-lib.sh:119`, add `_*` to the `case` pattern list and `leading _` to the error message, keeping the message's shape.

- [ ] **Step 4: Run the check in commit-spec.sh**

After the `if [ ! -f "$root/$spec" ]` block, before `trailer=`:

```sh
check="$here/../../brainstorming/scripts/check-doc.mjs"
if have_node; then
  check_status=0
  check_out=$(node "$check" "$root/$spec" 2>&1) || check_status=$?
  if [ "$check_status" -eq 1 ]; then
    printf '=== SPEC-CHECK-FAILED ===\n%s\n' "$check_out"
    printf 'ERROR: %s fails the spec check (listed above); fix the lines and run again. Nothing was staged.\n' "$spec" >&2
    exit 1
  elif [ "$check_status" -ne 0 ]; then
    printf 'ERROR: the spec check could not run (exit %s): %s\n' "$check_status" "$check_out" >&2
    exit 1
  fi
else
  printf '=== SPEC-CHECK-SKIPPED ===\nnode not found; %s was not checked\n' "$spec"
fi
```

Update the header comment's exit-code line to name the check.

- [ ] **Step 5: Run the lifecycle suite and the shell lint to verify they pass**

Run: `bash tests/task-lifecycle/test-task-lifecycle.sh && scripts/lint-shell.sh --all`
Expected: PASS, both.

- [ ] **Step 6: Commit**

```bash
git add skills/brainstorm-task/scripts/commit-spec.sh skills/new-task/scripts/ticket-lib.sh tests/task-lifecycle/test-task-lifecycle.sh
git commit -m "feat(brainstorm-task): commit-spec runs the spec check; a leading underscore is not a ticket id" -m "RAOOF A."
```

### Task 5: The engine checks at the end of the spec stage

**Files:**
- Modify: `skills/autopilot/scripts/autopilot.mjs` (imports at the top; `runEnd`, after the `qa` block at line 961 and before the `execute` block)
- Modify: `tests/autopilot/autopilot.test.mjs:15` (the `SPEC` fixture) and a new test after `end with ok false logs blocked...` (line 171)

**Interfaces:**
- Consumes: `checkDoc` and `resolveTemplate` from `skills/brainstorming/scripts/check-doc.mjs` (Task 3), imported as `../../brainstorming/scripts/check-doc.mjs`.
- Produces: a spec stage ended with `ok: true` on a failing spec ends `blocked` with the message `spec-incomplete: <line>: <rule>: <message>; ...` (the first three findings); nothing else in the engine changes.

- [ ] **Step 1: Make the fixture valid and write the failing test**

Replace the `SPEC` constant with a function that returns the text of `tests/brainstorming/fixtures/minimal-valid.md` with its `## Repositories in scope` list replaced by `scope.map((s) => `- ${s}`).join('\n')` and the two ledger rows `| 1 | Which cache? | none | low | not asked |` and `| 2 | Which auth? | OIDC | high | the app uses it |` appended under the ledger header; read the fixture file at module load. Keep `INVALID_SPEC` as the old inline text for the new test. Add:

```js
test('end spec blocks a spec that fails the check and next retries the stage', () => {
  const ws = workspace();
  run(ws, ['begin', 'GH-16', 'scaffold']);
  fs.mkdirSync(path.join(ws.root, 'tasks', 'GH-16'), { recursive: true });
  run(ws, ['end', 'GH-16', 'scaffold', '--result', JSON.stringify({ ok: true })]);
  run(ws, ['begin', 'GH-16', 'spec']);
  fs.mkdirSync(path.join(ws.root, 'specs', 'GH-16'), { recursive: true });
  fs.writeFileSync(path.join(ws.root, 'specs', 'GH-16', 'Spec.md'), INVALID_SPEC(['.']));
  git(ws.root, 'add', 'specs/GH-16/Spec.md');
  git(ws.root, 'commit', '-q', '-m', 'spec(GH-16): spec');
  const r = run(ws, ['end', 'GH-16', 'spec', '--result', JSON.stringify({ ok: true })]);
  assert.equal(r.code, 0, r.stdout + r.stderr);
  assert.equal(state(ws).stageStatus, 'blocked');
  assert.equal(logLines(ws).at(-1).event, 'blocked');
  const comment = ws.calls().find((a) => a[0] === 'issue' && a[1] === 'comment');
  assert.ok(comment, 'the ticket is told');
  assert.match(JSON.stringify(stdinOf(ws, (a) => a[0] === 'issue' && a[1] === 'comment')), /spec-incomplete: 0: status: /);
  assert.deepEqual([run(ws, ['next', 'GH-16']).json.action, run(ws, ['next', 'GH-16']).json.reason], ['run', 'spec-retry']);
});
```

Match the comment's text the way the `end with ok false` test reads tracker calls in this file; if comment bodies arrive through `commentBodies(ws)`, use that helper instead of `stdinOf`.

- [ ] **Step 2: Run the autopilot suite to verify it fails**

Run: `bash tests/autopilot/run-tests.sh`
Expected: the new test fails (`stageStatus` is `finished`); every other test passes with the valid fixture.

- [ ] **Step 3: Add the check to runEnd**

Import `checkDoc` and `resolveTemplate`. In `runEnd`, after the `qa` block:

```js
if (opts.stage === 'spec' && ok) {
  const specFile = path.join(ctx.root, 'specs', opts.id, 'Spec.md');
  const findings = checkDoc(readText(specFile), readText(resolveTemplate(path.dirname(specFile)).path));
  if (findings.length) {
    ok = false;
    message = `spec-incomplete: ${findings.slice(0, 3).map((f) => `${f.line}: ${f.rule}: ${f.message}`).join('; ')}`;
  }
}
```

`readText` is the engine's own helper at line 364; if it throws on a missing file, catch and treat the text as empty so a missing spec blocks with findings rather than crashing.

- [ ] **Step 4: Run the autopilot suite to verify it passes**

Run: `bash tests/autopilot/run-tests.sh`
Expected: PASS, every test.

- [ ] **Step 5: Commit**

```bash
git add skills/autopilot/scripts/autopilot.mjs tests/autopilot/autopilot.test.mjs
git commit -m "feat(autopilot): the spec stage ends blocked when the spec fails the check" -m "RAOOF A."
```

### Task 6: The pre-commit hook

**Files:**
- Modify: `templates/.githooks/pre-commit.tmpl` (append a block after `# <<< team-memory lint`)
- Modify: `templates/CHANGES.json` (`.githooks/pre-commit` to `2.2.0`)
- Modify: `tests/init/test-templates-clean.sh:131-134` (`.githooks/pre-commit:2.0.2` becomes `:2.2.0`)
- Create: `tests/brainstorming/test-precommit-spec-check.sh`
- Modify: `AGENTS.md` (test list, after the check-doc line) and `.github/workflows/ci.yml` (Linux job, after the check-doc line)

**Interfaces:**
- Consumes: the checker's command line and exit codes (Task 3); the lint block's plugin lookup in the same file.
- Produces: the block `# >>> spec check` to `# <<< spec check`; the hook messages `pre-commit: spec check found problems (listed above). Fix them, or run the spec check with your agent.`, `pre-commit: spec check skipped (ultrapowers plugin not found; set ULTRAPOWERS_ROOT to its checkout)` and `pre-commit: spec check skipped (node not found)`.

- [ ] **Step 1: Write the failing hook test**

Create `tests/brainstorming/test-precommit-spec-check.sh` as a sibling of `tests/team-memory/test-precommit-lint.sh`: the same `pass`/`fail`, a `WORK` repo with `core.hooksPath .githooks`, the template copied in, `printf '{"version":1}' > .agents/ultrapowers.json`, the payload template copied to `specs/_template/Spec.md`, both committed first with `ULTRAPOWERS_ROOT="$REPO_ROOT"`. The repo lives at `"$WORK/with space"` so Review Focus 5 is covered. Cases, each a commit attempt under `ULTRAPOWERS_ROOT="$REPO_ROOT"` unless stated:

1. the template has the marked block (`grep` both markers);
2. the first commit, holding `specs/_template/Spec.md` and the config, succeeds (the template itself is not checked);
3. a new `specs/GH-1/Spec.md` that is the fixture plus one surviving italic question line is blocked, the output holds `: question: ` and `spec check found problems`;
4. the same file as the clean fixture commits;
5. an old spec `specs/GH-2/Spec.md` committed with the content `# old\n` under `ULTRAPOWERS_ROOT=` unset and `HOME` pointed at an empty folder, then modified to `# old\n\nmore\n` and committed with the plugin reachable, passes unchecked;
6. `specs/GH-1/Spec.md` modified to replace `None: fixture.` under `## Intent` with `None` is blocked (it carries a record);
7. a new `docs/ultrapowers/specs/notes.md` with the content `# notes\n` commits, and a new `docs/ultrapowers/specs/2026-10-12-x-design.md` with the same content is blocked;
8. with `ULTRAPOWERS_ROOT` unset and `HOME` pointed at an empty folder, a new failing spec commits and the output holds `spec check skipped (ultrapowers plugin not found`.

- [ ] **Step 2: Run the hook test to verify it fails**

Run: `bash tests/brainstorming/test-precommit-spec-check.sh`
Expected: FAIL on case 1 and on every blocked case.

- [ ] **Step 3: Add the block to the hook template**

Append after `# <<< team-memory lint`, mirroring the lint block (same candidate loop with `skills/brainstorming/scripts/check-doc.mjs`, a `mktemp -d` snapshot through `git ls-files -z` and `git checkout-index --prefix`, fail-open warnings). The file list is the algorithm the tests do not determine:

```sh
spec_pattern='^(specs/[^/]+/Spec\.md|docs/ultrapowers/specs/[^/]+-design\.md)$'
spec_files="$(git diff --cached --name-only --diff-filter=A | grep -E "$spec_pattern" | grep -v '^specs/_template/Spec\.md$')
$(git diff --cached --name-only --diff-filter=M | grep -E "$spec_pattern" | grep -v '^specs/_template/Spec\.md$' | while IFS= read -r f; do
  git show ":$f" | grep -q '^## Decision record' && printf '%s\n' "$f"; done)"
```

The snapshot holds `$spec_files`, `specs/_template/Spec.md` and `.agents/ultrapowers.json` (those two only when tracked); the checker runs once per file on `"$snapshot/$f"`; one failure sets a status and the commit is refused after every file ran. Quote every path.

- [ ] **Step 4: Record the changed hook**

In `templates/CHANGES.json` set `".githooks/pre-commit": "2.2.0"`; in `tests/init/test-templates-clean.sh` change `.githooks/pre-commit:2.0.2` to `.githooks/pre-commit:2.2.0`.

- [ ] **Step 5: Run the hook test, the lint hook test and the init suite to verify they pass**

Run: `bash tests/brainstorming/test-precommit-spec-check.sh && bash tests/team-memory/test-precommit-lint.sh && bash tests/init/run-tests.sh`
Expected: PASS, all three.

- [ ] **Step 6: Register the suite and commit**

Add `bash tests/brainstorming/test-precommit-spec-check.sh` to the `AGENTS.md` list and `- run: bash tests/brainstorming/test-precommit-spec-check.sh` to `ci.yml`, each after the check-doc line.

```bash
git add templates/.githooks/pre-commit.tmpl templates/CHANGES.json tests/init/test-templates-clean.sh tests/brainstorming/test-precommit-spec-check.sh AGENTS.md .github/workflows/ci.yml
git commit -m "feat(templates): the pre-commit hook checks staged specs against the template" -m "RAOOF A."
```

### Task 7: The prose

**Files:**
- Modify: `skills/brainstorming/SKILL.md` (lines 73-81, 97-115, 145-154, 166-170, after 212, 214-227, 236-243, 320-334)
- Modify: `skills/brainstorm-task/SKILL.md:80-86` and `:98`
- Modify: `skills/autopilot/prompts/spec.md:3`
- Modify: `skills/init/SKILL.md:23`
- Modify: `tests/skills/test-skill-bodies.sh` (a new block after the rebuilt-brainstorming block)

**Interfaces:**
- Consumes: Task 1's RED records exist in git (the Iron Law); the checker command line (Task 3); the markers of Task 4.
- Produces: the pinned phrases the test asserts: `--print-template`, `Failure points`, `Edge cases`, `Evidence:`, `theirs`, `check-doc.mjs`, the three Red Flags thoughts, and in brainstorm-task `SPEC-CHECK-FAILED`.

- [ ] **Step 1: Write the failing skill-body assertions**

Append to `tests/skills/test-skill-bodies.sh` before the final `FAILURES` check:

```bash
echo ""
echo "=== Test: the spec template and the decision record (spec 2026-10-12) ==="
expect $B '[-][-]print-template' 'brainstorming finds the spec template with --print-template'
expect $B 'Failure points' 'brainstorming asks for the failure points of the recommended approach'
expect $B 'Edge cases' 'brainstorming asks for the edge cases of the recommended approach'
expect $B 'Evidence:' 'brainstorming names the evidence tag'
expect $B 'theirs' 'brainstorming sorts uncovered template questions into theirs'
expect $B 'check-doc.mjs' 'brainstorming runs the checker in the self-review'
expect $B 'fill the section so the checker passes' 'brainstorming has the Red Flags row for filling to pass'
expect $B 'The template asks it' 'brainstorming has the Red Flags row for over-asking'
expect $B 'the others are obviously worse' 'brainstorming has the Red Flags row for a single approach'
if grep -q 'only when it helps them decide' "$REPO_ROOT/$B"; then fail 'brainstorming no longer shows the comparison only when it helps'; else pass 'brainstorming no longer shows the comparison only when it helps'; fi
expect skills/brainstorm-task/SKILL.md 'SPEC-CHECK-FAILED' 'brainstorm-task names the failed spec check'
expect skills/autopilot/prompts/spec.md 'template' 'the spec stage prompt names the template'
expect skills/init/SKILL.md 'spec check' 'init names the spec check among the reasons for Node'
T=templates/specs/_template/Spec.md.tmpl
expect $T '^## Decision record$' 'the payload template carries the decision record'
if [[ "$(grep -c '^## ' "$REPO_ROOT/$T")" -eq 13 ]]; then pass 'the payload template has thirteen sections'; else fail 'the payload template has thirteen sections'; fi
```

`expect` takes `file pattern description` and greps with `-E`; the bracketed pattern keeps the leading dashes from reading as an option.

- [ ] **Step 2: Run the skill-body suite to verify it fails**

Run: `bash tests/skills/test-skill-bodies.sh`
Expected: FAIL on every new brainstorming, brainstorm-task, spec-stage and init assertion; the template assertions pass.

- [ ] **Step 3: Edit the brainstorming skill**

Make these edits and no other:

1. Three Paths, the bounded bullet (`:73-81`): after "present a short design IN CHAT (a few sentences to a few short paragraphs)", insert ", name in one line the alternative you did not take and why,".
2. Ground to cover (`:145-154`): add the bullet `- in the architectural path and the ticket form, every question of the spec template: run `node <SKILL_DIR>/scripts/check-doc.mjs --print-template` once and read the file it names`.
3. Think wide privately (`:166-170`): keep the first two sentences; replace from "Show the comparison" to the end of the paragraph with: "In the architectural path and the ticket form, present the approaches before the design, in one message. The recommended one carries, as bold-labelled bullets: what it is, why this one, its failure points, its edge cases. Every line under those labels ends with its source, `Evidence: <source>`, or says `Assumption:` with the reason or `My call:` for a minor choice. Each other approach carries why not and its main failure point, with their sources. No table. End with your recommendation and one question. In the autopilot form there is no message: the record goes straight into the spec. YAGNI ruthlessly: remove unnecessary features from every idea."
4. A new paragraph after the "For software designs" paragraph (`:212`), headed in bold: "**Cover the template before you write.** Before the written design, take every italic line of the spec template and sort it, the way the builder check sorts: covered, your partner said it; minor, a sensible builder could settle it without changing what gets built, so settle it and mark it `My call` with a ledger row; theirs, only your partner can answer and the answer changes what gets built. Ask the theirs pile in one message, most important first. A whole section nobody covered is asked, not filled. Then write."
5. The Written Design (`:216-227`): replace the sentence "Cover:" and its five bullets with: "Write it from the spec template the checker names, starting at the title: every heading kept, every italic line answered or removed, a section that does not apply saying `None:` with the reason, and D1 the approach you presented, as chosen."
6. Spec self-review (`:236-243`): add item `5. **Template check:** run `node <SKILL_DIR>/scripts/check-doc.mjs <spec path>`. Fix every line it reports; nothing is handed over while it reports. If it cannot run, say so in one line and do not hand over.`
7. Autopilot form (`:97-115`): after "lowest confidence first," add: "every `Assumption:` and `My call:` line of the decision record is a ledger row, and a whole section the brief and the code do not cover becomes rows at low confidence,".
8. Red Flags (`:320-334`): append the three rows of the spec's table under "The brainstorming prose".

- [ ] **Step 4: Edit the other three skills**

- `skills/brainstorm-task/SKILL.md:80-86`: after the command block add: "The script checks the spec first. `=== SPEC-CHECK-FAILED ===` lists the lines to fix; fix them and run it again. `=== SPEC-CHECK-SKIPPED ===` means node is missing and the spec was committed unchecked; say so to your human partner." Checklist item 8 (`:98`) becomes `8. Commit the spec (the check runs first); hand off to writing-plans`.
- `skills/autopilot/prompts/spec.md:3`: append the sentence "The spec is written from the spec template, and every `Assumption:` or `My call:` line of its decision record is a ledger row."
- `skills/init/SKILL.md:23`: "tell your human partner the engine needs Node" becomes "tell your human partner the engine and the spec check need Node".

- [ ] **Step 5: Run the skill-body suite and the lifecycle structure checks to verify they pass**

Run: `bash tests/skills/test-skill-bodies.sh && bash tests/task-lifecycle/test-task-lifecycle.sh && bash tests/task-lifecycle/test-skill-structure.sh`
Expected: PASS, all three (the lifecycle suite greps the brainstorming routing lines, which this task leaves untouched).

- [ ] **Step 6: Commit**

```bash
git add skills/brainstorming/SKILL.md skills/brainstorm-task/SKILL.md skills/autopilot/prompts/spec.md skills/init/SKILL.md tests/skills/test-skill-bodies.sh
git commit -m "feat(brainstorming): approaches with their record, the coverage pass, the written design from the template" -m "RAOOF A."
```

### Task 8: GREEN runs

**Files:**
- Modify: `tests/skills/brainstorming-pressure-results.md` (the part Task 1 started)

**Interfaces:**
- Consumes: the edited skill (Task 7), the payload template (Task 2), the checker (Task 3), the scenarios (Task 1).
- Produces: the GREEN records and the verdict the release notes cite.

- [ ] **Step 1: Run the three GREEN scenarios**

Dispatch one fresh Sonnet subagent per scenario, in parallel, each allowed two Read calls: `skills/brainstorming/SKILL.md` and `templates/specs/_template/Spec.md.tmpl`, the rest as in Task 1 Step 2.

- [ ] **Step 2: Check F's spec mechanically**

Save the spec text F returned to a file under the session's scratch directory and run `node skills/brainstorming/scripts/check-doc.mjs --template templates/specs/_template/Spec.md.tmpl <that file>`.
Expected: exit 0. A finding is a defect in the prose: fix the sentence in Task 7's files, rerun F, and record both runs.

- [ ] **Step 3: Record the GREEN runs and the verdict**

Add `## D, GREEN (skill at <sha>)`, `## E, GREEN (skill at <sha>)`, `## F, GREEN (skill at <sha>)` with the transcript excerpts and the answers verbatim, then fill `## Verdict` with one bullet per scenario: what RED did, what GREEN did, and the checker's exit code for F.

- [ ] **Step 4: Verify the evidence**

Read the three GREEN sections against the scenarios' "Expected after" lines. Expected: D carries the four labelled fields with sources for the recommended approach and why-not lines for the other; E sorts and asks in one message; F asks nothing, writes the thirteen headings and the record, and passed the checker. A scenario that fails GREEN is a loophole: add the counter to the skill in the same commit, rerun, and record the second run as `GREEN, round 2`.

- [ ] **Step 5: Commit**

```bash
git add tests/skills/brainstorming-pressure-results.md
git commit -m "test(skills): GREEN runs for the spec template and decision record" -m "RAOOF A."
```

### Task 9: Documentation and the follow-up issue

**Files:**
- Modify: `README.md:320` and `README.md:469`
- Modify: `AGENTS.md` (the repository layout table: the `templates/` row and a new `skills/brainstorming/` row after `skills/autopilot/`)

**Interfaces:**
- Consumes: nothing new; names the files Tasks 2 to 6 created.
- Produces: the README and AGENTS.md sentences; one GitHub issue.

- [ ] **Step 1: Edit the README**

At line 320, after "and the design in sections for your approval.", insert: "The approaches come with why the recommended one wins, its failure points and its edge cases, each with its source. The spec is written from `specs/_template/Spec.md`, and a checker refuses it, at the commit and at the autopilot gate, until every section and the decision record are complete." At line 469, after "so the plan meets no surprises.", insert: "Every spec carries a decision record: the options, why one won, where it breaks, with sources."

- [ ] **Step 2: Edit AGENTS.md**

In the layout table, extend the `templates/` row's purpose with "`specs/_template/Spec.md`, the template every spec is written from, and the pre-commit hook that checks staged specs against it" and add the row:

```markdown
| `skills/brainstorming/` | The brainstorming skill, `builder-check-prompt.md`, `visual-companion.md`, and `scripts/`: the visual companion server and `check-doc.mjs`, the template-driven spec checker that the self-review, `commit-spec.sh`, the autopilot engine and the scaffolded pre-commit hook run. |
```

- [ ] **Step 3: Verify the documents and the audit**

Run: `bash tests/skills/test-skill-bodies.sh && scripts/bump-version.sh --audit`
Expected: PASS and "All clear".

- [ ] **Step 4: Open the follow-up issue**

With `gh issue create` on `raoofaltaher/ultrapowers`, label `enhancement`, title "Templates and the spec checker for the plan, the QA report, the security report and the task review", body in the feature template's shape: the convention this change set (`_template` folders, italic placeholders, the template-driven checker), the four documents and where their templates live today (`skills/writing-plans/SKILL.md` header block, `skills/qa-report/SKILL.md`, `skills/vulnerability-hunt/templates/`, `skills/task-review/templates/TASK-REVIEW.md`), the question each must settle (move into the project scaffold or stay in the skill), and the acceptance criterion: one template and one checker call site per document, with tests. End the body with the line `RAOOF A.`.

- [ ] **Step 5: Commit**

```bash
git add README.md AGENTS.md
git commit -m "docs: the spec template, the decision record and the checker" -m "RAOOF A."
```

### Task 10: The whole gate

**Files:** none changed.

**Interfaces:**
- Consumes: every suite above.
- Produces: the evidence the release step needs.

- [ ] **Step 1: Run the full offline list**

Run every command of the `AGENTS.md` "Running the tests" list, the long guardrail runner once, on a quiet machine, with `PATH="/c/Python314:$PATH"` on Windows.
Expected: every suite passes; `scripts/bump-version.sh --audit` ends with "All clear".

- [ ] **Step 2: Run the dogfood check once more**

Run: `node skills/brainstorming/scripts/check-doc.mjs docs/ultrapowers/specs/2026-10-12-spec-template-and-decision-record-design.md`
Expected: exit 0 and the stderr line `template: <the project's specs/_template/Spec.md, or the payload file when this checkout has no copy>`.
