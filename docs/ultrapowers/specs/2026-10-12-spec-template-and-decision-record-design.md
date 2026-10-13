# Spec template and decision record

Status: draft, 2026-10-12. Ticket: none.

## Intent

The moment: a brainstorming session ends, an approach was picked, and the
spec records the pick but not why, what was rejected, where the pick breaks,
or what evidence any of it rests on. The owner then reads a spec that cannot
answer "why X and not Y", and finds sections in it that another spec lacks.
Three specs in this repository carry three different heading sets.

Who is in it: the owner reading the approaches in chat and the spec after;
writing-plans reading the spec's constraints; the autopilot reviewer reading
the packet; a builder planning from the spec without the conversation.

Success looks like this to them: every approach presented in the
architectural path and the ticket form carries why it wins or loses, its
failure points and its edge cases, each with its source. The spec carries the
same record and one fixed section set. A spec that misses any of it cannot be
handed over, committed through the ticket script, posted on a packet, or
committed in a scaffolded project.

## Goals, non-goals and anti-goals

Goals:

- The approaches message and the spec share one shape, the decision record:
  five labelled fields and a source on every claim line.
- Every spec is written from one template, every heading present, a section
  that does not apply says `None:` with the reason in one line.
- A template question the conversation never covered is sorted and asked,
  never filled from imagination.
- A checker proves the shape at four points: the self-review, the ticket
  commit script, the engine before the packet, the scaffolded pre-commit hook.
- The prose change ships with RED and GREEN pressure runs, as rule 3 of
  `AGENTS.md` asks.

Non-goals, and where each one goes:

- The plan, QA report, security report and task-review templates: the next
  change, as an issue opened when this spec lands. The checker is generic so
  that change adds one template and one call site per document.
- The writing-plans prose: untouched. It already copies the spec's
  constraints into its Global Constraints verbatim.
- Retrofitting old specs: an old spec stays unchecked until it adopts the
  record.
- Judging content mechanically: the checker proves shape. The coverage rule,
  the builder check and the human judge content.
- Spec and plan locations: unchanged.

Anti-goals:

- A spec filled so the checker passes. That is an assumption with a heading
  on it.
- A conversation that reads the template out as a questionnaire.
- Walls of text. The record is bullets, an alternative gets two lines, a
  `None:` line is one line.
- A second vocabulary. One folder name, `_template`; the engine's section
  names unchanged.

## Constraints

- Zero dependencies: the checker uses node built-ins only (`AGENTS.md` rule 1).
- Skill bodies are code: every prose change lands with RED and GREEN evidence
  from pressure runs (`AGENTS.md` rules 2 and 3).
- Every harness, every change (`AGENTS.md` rule 9): this change touches no
  harness-specific surface. The prose is shared by every harness. The checker
  runs on node; the ticket scripts and the hook work without node and skip the
  check there (`skills/new-task/scripts/ticket-lib.sh:10-12`). The hook is git,
  but it finds the checker only through `ULTRAPOWERS_ROOT` or the Claude Code
  plugin cache, so on every other harness the spec check warns and continues
  unless `ULTRAPOWERS_ROOT` is set, exactly as the lint block does. Recorded
  here so the gap is named, not skipped.
- Names (`AGENTS.md` rule 4): the folder is `_template`, like the payload's
  `_blocks` and `_nested`; the sections `Repositories in scope` and
  `Assumption ledger` keep the exact names the engine parses
  (`skills/autopilot/scripts/autopilot-lib.mjs:459-481`).
- Line endings (`AGENTS.md` rule 7): `commit-spec.sh`, `ticket-lib.sh` and the
  hook template stay LF.
- The upstream project's name never appears in the repository.
- Version: the next minor, through `scripts/bump-version.sh`, at release time.
  `templates/CHANGES.json` records the new target and the changed hook at that
  version.
- Spec locations stay as they are: `docs/ultrapowers/specs/` by default,
  `specs/<ID>/Spec.md` in the ticket form (`skills/brainstorming/SKILL.md:231-233`).
- Scripts are invoked through their interpreter in prose (`node ...`), never
  by bare path (`skills/writing-skills/SKILL.md`, bundled scripts).

## Decision record

D1 is the approach. D2 to D5 are the choices the design sections fixed.

### D1: Where the policy lives and how it is enforced

- **Chosen:** a spec template file plus a template-driven checker, with the
  rule in the brainstorming skill only (approach A of the brainstorm).
- **Why this one:** a required element that agents omit is enforced by a slot
  in a template they fill, not by a prose reminder. Evidence:
  `skills/writing-skills/SKILL.md:469`. One skill writes every spec, so one
  file carries the policy and both doors inherit it. Evidence:
  `skills/brainstorm-task/SKILL.md:76` invokes brainstorming;
  `skills/autopilot/prompts/spec.md:3` invokes brainstorm-task. The engine
  already blocks a run whose spec lacks the scope list, with a code and a
  ticket comment; the new code reuses that path. Evidence:
  `skills/autopilot/scripts/autopilot-lib.mjs:486`, `autopilot.mjs:190-216`,
  `:341`, `:441`.
- **Rejected:** approach B, the section list in the skill prose plus the
  checker, because the skill text would grow in every session and a heading
  typed from memory drifts; three specs already show three heading sets.
  Evidence: the `## ` lines of `specs/GH-16/Spec.md`,
  `docs/ultrapowers/specs/2026-10-04-autopilot-design.md` and
  `docs/ultrapowers/specs/2026-10-11-vulnerability-hunt-design.md`, measured
  on 2026-10-12.
- **Rejected:** approach C, prose plus review with no checker, because
  nothing would stop an incomplete spec from being committed or posted; the
  7.0.0 port made the comparison optional and no review caught it. Evidence:
  `docs/ultrapowers/specs/2026-10-11-brainstorming-v7-port-design.md`,
  decision 7; `skills/brainstorming/SKILL.md:166-170`.
- **Failure points:** the checker proves shape, not truth; a model can fill a
  field with a vague line. Mitigation: the placeholder and question rules,
  the coverage sort of D4, and the builder check reading the content.
  Evidence: `skills/brainstorming/builder-check-prompt.md`. A check on wording
  blocks a correct spec and starts a fix loop. Mitigation: the rules match
  headings, labels and tags only, never sentence content. Evidence: the
  engine's parser matches a heading by name only,
  `autopilot-lib.mjs:459-466`. In the autopilot form nobody fixes a failing
  spec in the session. Mitigation: the stage blocks with the findings in the
  ticket comment, as `no-scope` does today. Evidence: `autopilot.mjs:201-216`.
- **Edge cases:** a design outside a software repository, where the skill
  asks where to write: the template still applies and the checker runs
  wherever node runs. Evidence: `skills/brainstorming/SKILL.md:231`. A
  non-software design, a talk or a renovation: sections like error handling
  say `None:` with the reason. Evidence: the skill's trigger text,
  `SKILL.md:3`. A spec revised after this change: the revise path adds the
  missing sections; an untouched old file is never checked. Evidence:
  `skills/brainstorm-task/SKILL.md:35` and `:76`. The partner picks an
  approach that was not recommended: the record is completed for the chosen
  one after the pick. My call: ledger row 1. The bounded path has no spec and
  keeps a one-line rule in prose. Evidence: the owner's reply of 2026-10-12 to
  call 1. A future upstream port keeps two more files. Evidence: the port
  design's "What we kept" table lists what a port preserves.

### D2: The `_template` convention

- **Chosen:** `specs/_template/Spec.md` in the project, rendered by init from
  the payload file `templates/specs/_template/Spec.md.tmpl`; the payload file
  is the fallback when the project has no copy; a project may add sections
  and questions to its copy; the decision record is non-removable.
- **Why this one:** the payload already uses underscore folders, and init
  walks nested template folders and strips `.tmpl` without a code change.
  Evidence: `skills/init/scripts/init.mjs:23` and `:740-756`. Init never
  overwrites a project file, and upgrade mode proposes a new target.
  Evidence: `init.mjs:425` and `:1314-1320`. A project copy lets a team add
  its own sections and keeps the template visible beside the specs it
  shapes. Evidence: the owner's reply of 2026-10-12 to design section 1.
- **Rejected:** a plugin-only template, because a project could not add
  sections and nobody would see the template beside their specs. Evidence:
  the owner asked for `_template` folders on 2026-10-12.
- **Rejected:** a `Spec.md` skeleton written by new-task into `specs/<ID>/`,
  because brainstorm-task refuses to write when a `spec.md` already exists,
  and the non-ticket door has no scaffold step at all. Evidence:
  `skills/brainstorm-task/SKILL.md:35` (SPEC-COLLISION) and
  `skills/brainstorm-task/scripts/preflight.sh`.
- **Failure points:** a project edits its copy and removes the record.
  Mitigation: the checker requires the record whatever the template says
  (rule 6 below). A project copy drifts from the plugin default. Mitigation:
  upgrade mode reports the changed target through `CHANGES.json`. Evidence:
  `init.mjs:1306-1320`. Someone runs new-task with `_template` as the id.
  Mitigation: the default pattern already refuses a leading underscore, and
  `validate_ticket` gains `_*` so a custom `ticketPattern` cannot allow it.
  Evidence: `skills/new-task/scripts/ticket-lib.sh:15` and `:119-124`.
- **Edge cases:** an unscaffolded repository: the payload file is used, found
  relative to the checker. Evidence: `--print-template` in Components. A
  project scaffolded before this version: the file is missing until upgrade,
  the checker falls back to the payload and names the template it used. My
  call: ledger row 2. A project reorders the template's headings: allowed,
  rule 1 follows the template; only the record's presence and its labels are
  core. My call: ledger row 13. No script enumerates `specs/*`, so the new
  folder confuses nothing. Evidence: a grep over `skills/**/*.sh` and
  `skills/**/*.mjs` for `specs/*`, `plans/*` and `reviews/*` on 2026-10-12
  found no match.

### D3: Questions as placeholders, under each heading

- **Chosen:** two or three italic question lines under each heading of the
  template; the writer replaces them with the answers; a question line that
  survives verbatim fails the check.
- **Why this one:** the questions guide the writer and double as the
  placeholder the checker tests, and the finished spec carries no
  questionnaire. Evidence: the owner's reply of 2026-10-12 to design
  section 1 and section 3.
- **Rejected:** a table of sections and questions at the head of the file,
  because it survives into every finished spec or must be deleted by hand.
  Evidence: the owner's reply of 2026-10-12 to design section 1.
- **Rejected:** HTML comments, because they hide the questions from the
  rendered template a human reads. My call: ledger row 3.
- **Failure points:** a writer rephrases a question instead of answering it,
  so the verbatim rule misses it. Mitigation: rule 5 requires content under
  the heading, and the builder check reads the content. My call: ledger
  row 4. A project adds a question with a typo: harmless, rule 3 only
  requires its removal. My call: ledger row 4.
- **Edge cases:** a spec quotes the template, as this spec does. The checker
  blanks fenced code blocks before any rule runs, so the quoted headings,
  questions and record block do not count as the document's own. Evidence:
  a heading scan of this spec on 2026-10-12 found the fenced copy's thirteen
  `## ` lines, which rules 1, 5 and 6 would otherwise read; this spec is the
  dogfood case of the checker's suite (Testing).

### D4: Coverage before writing

- **Chosen:** before the spec is written, every template question is sorted:
  covered (the partner said it), minor (settled, marked `My call`, a ledger
  row) or theirs (asked in one message, most important first). A whole
  uncovered section is asked, not filled. In the autopilot form every theirs
  item is a ledger row at low confidence.
- **Why this one:** the three-pile sort already exists for the builder check,
  so reusing it costs little, and it is the measure that keeps the checker
  honest. Evidence: `skills/brainstorming/SKILL.md:249-258` (the piles) and
  `:198-199` (a guess is marked as a guess).
- **Rejected:** fill every gap with a marked assumption and never ask,
  because the owner's rule is no assumption where the partner can be asked.
  Evidence: the owner's message of 2026-10-12, "let's not do any assumption
  if I'm not sure I can verify with the user".
- **Rejected:** ask after writing, inside the builder-check round, because the
  section would first be written from nothing and the partner would be asked
  twice about the same gap. My call: ledger row 5.
- **Failure points:** over-asking, where the model sends every question to
  the partner. Mitigation: the sort and a Red Flags row. Under-asking, where
  the model fills to pass. Mitigation: the other Red Flags row and the ledger
  showing every `My call`. Evidence: a discipline failure takes a
  rationalization table, `skills/writing-skills/SKILL.md:461-482`.
- **Edge cases:** the partner opted out of the questions: the skill is done,
  no spec, no coverage pass. Evidence: `skills/brainstorming/SKILL.md:45-51`
  and `:297-299`. A ticket with a one-line brief: the sections that do not
  apply say `None:` with the reason, and D1 names no rejected option, with
  the evidence that the ticket fixes the change. My call: ledger row 6.

### D5: Enforcement points

- **Chosen:** self-review item 5; `commit-spec.sh` before `git add`; the
  engine at the end of the spec stage and of the changes stage, where the
  stage ends blocked with `spec-incomplete` the way a QA stage ends blocked
  with `qa-missing`; the scaffolded pre-commit hook, for specs new in the
  commit and for existing specs that already carry a decision record.
- **Why this one:** each door gets a mechanical stop outside the model's
  discretion: the ticket commit, the end of the engine's stage, the git
  commit. Evidence: `skills/brainstorm-task/scripts/commit-spec.sh` (the
  ticket commit), `autopilot.mjs:940-970` (`runEnd` sets `ok` false and a
  message for `qa-missing`, `plan-changed` and a removed marker, then blocks
  the stage and comments on the ticket), and the `>>> team-memory lint`
  block of `templates/.githooks/pre-commit.tmpl` (plugin lookup, staged
  snapshot, fail-open).
- **Rejected:** the check inside `previewScope`, where the engine reads the
  spec for the packet, because `previewScope` also runs inside `trustState`,
  which turns any throw into `state-tampered`, and `next` never reaches it:
  `consumeApproval` parses the spec itself. A ticket approved before this
  change, or any ticket after a template change, would stop at execute or
  pr with a misleading tamper error. Evidence: `autopilot.mjs:375-387`,
  `:533-545`; the builder check of 2026-10-12.
- **Rejected:** a gate in writing-plans that refuses a spec without the
  record, because the owner keeps writing-plans untouched. Evidence: the
  owner's reply of 2026-10-12 to call 4.
- **Rejected:** hook checks on every modified spec, because every old spec
  touched would force a retrofit. My call: ledger row 7.
- **Failure points:** the hook fails open without node or without the plugin
  checkout, as the memory lint does, and `commit-spec.sh` fails open without
  node with its own marker; a deliberate, warned fail-open in both.
  Evidence: the two warning branches of the lint block in
  `templates/.githooks/pre-commit.tmpl`. The engine checks only at the end
  of the spec stage and of the changes stage; a spec edited by hand on the
  docs branch afterwards is not rechecked by the engine. Mitigation: the hook
  checks it on commit in a scaffolded project, and a spec changed after
  approval reposts the packet through the existing `plan-changed` rule.
  Evidence: `autopilot.mjs:960-963`; `skills/autopilot/prompts/changes.md`
  has the changes stage revise `specs/<ID>/Spec.md`, and the `AFTER` table
  of `skills/autopilot/scripts/autopilot-lib.mjs` sends that stage on to the
  gate, where the next packet is posted.
- **Edge cases:** the non-ticket door in an unscaffolded repository has no
  hook: the self-review and the builder check are the stop. Recorded
  residual. Evidence: the hook exists only where init wrote it,
  `templates/.githooks/pre-commit.tmpl`. The hook's snapshot must hold the
  staged template and the config, so the staged template is the one checked.
  My call: ledger row 8. The template itself is a new file in the first
  commit after scaffold or upgrade, and it fails the question and
  placeholder rules by design: the hook filter excludes
  `specs/_template/Spec.md`. Evidence: the builder check of 2026-10-12.
  `docs/ultrapowers/specs/` holds files that are not specs, so a new file
  there is checked only with the `-design.md` suffix the skill gives a spec.
  Evidence: the folder listing of 2026-10-12 holds
  `2026-07-06-sdd-plan-scoped-workspace-eval-results.md`;
  `skills/brainstorming/SKILL.md:231` names the suffix.

## Architecture

Five units, each with one purpose:

1. **The template**, `templates/specs/_template/Spec.md.tmpl`: the section
   set and the questions. Init renders it to `specs/_template/Spec.md`.
2. **The checker**, `skills/brainstorming/scripts/check-doc.mjs`: the pure
   function `checkDoc(document, template)` that returns findings, the command
   line around it, and the template lookup.
3. **The brainstorming prose**: the approaches rule, the coverage pass, the
   written design from the template, self-review item 5, two sentences in the
   autopilot form, three Red Flags rows, one sentence on the bounded path.
4. **The call sites**: `commit-spec.sh`, the engine, the pre-commit hook.
5. **Tests and evidence**: the checker suite, one case per call site, the
   skill-body pins, the pressure runs.

Interfaces others depend on:

- The section names the engine parses: unchanged.
- The checker's command line: new, used by the prose, the commit script and
  the hook.
- `checkDoc`: new, imported by the engine and the tests.
- `textLines`: new, the lines of a document with its fenced blocks and comment
  lines blanked, imported by the engine's lib so `scopeFrom` and
  `assumptionsFrom` skip a fenced copy of the template.
- The finding line `path:line: rule: message` and the exit codes 0, 1, 2.

What a future upstream port must keep: the template file, the checker, the
template lookup, and the prose paragraphs named under Components. The port
design of 2026-10-11 is history and is not edited; its "What we kept" table
has these as its next rows when the next port is designed.

## Components

### The template

The payload file holds this text. Init renders it unchanged apart from its
comment line, because it carries no `{{...}}` placeholder (ledger row 12).

````markdown
# <Title>

Status: draft, <YYYY-MM-DD>. Ticket: <id>, or none.

## Intent
_What is the moment this exists for, and who is in it?_
_What does success look like to them?_

## Goals, non-goals and anti-goals
_Goals: what must be true when this ships?_
_Non-goals: what is left out on purpose, and where does it go instead?_
_Anti-goals: what would make this a failure even if it works?_

## Constraints
_Which project-wide requirements bind every task: versions, dependencies, naming, platforms, security?_
_Which existing patterns must the design follow?_
_Exact values. writing-plans copies this section into its Global Constraints._

## Decision record
_D1 is the approach. Every later section that picks between options adds a block._
_A source is a file and line read in this session, a document or standard by title, official documentation read through a docs server or the web reader, a probe or a measurement with its result, a ticket page or attachment, or what your human partner said in this conversation._
_A line with no source says `Assumption:` with the reason, or `My call:` for a minor choice. Both kinds also appear in the ledger below._

### D1: <the decision>
- **Chosen:** <the option taken>
- **Why this one:** <reason>. Evidence: <source>
- **Rejected:** <option>, because <reason>. Evidence: <source>
- **Failure points:** <how the chosen option breaks, and the mitigation>. Evidence: <source>
- **Edge cases:** <the condition at the edge, and what happens>. Evidence: <source>

## Architecture
_Which units make up the design, and what is each one for?_
_How do they talk, and which interfaces do others depend on?_

## Components
_Per unit: what it does, how it is used, what it depends on._
_Which files are created or changed?_

## Data flow
_What enters, what leaves, what is stored, and where?_
_What crosses a trust or a process boundary?_

## Error handling
_What can fail, and how does the user or the caller learn it?_
_What is retried, refused or blocked, and what is never silent?_

## Testing
_Which test proves each requirement, and where does it live?_
_Which gate runs it, and what is the evidence for a prose change?_

## Left to the builder
_Which choices does this spec leave open on purpose, and within what limits?_

## Definition of done
_Which observable results mean this is complete?_

## Repositories in scope
_Which `repos[].name` entries does the design touch? `.` in a single-repository project._

## Assumption ledger
| # | Question | Chosen answer | Confidence | Reason |
|---|---|---|---|---|
_Interactive form: the calls you made, lowest confidence first, so your partner checks them while reading._
_Autopilot form: every question the conversation would have asked._
````

Every italic line is a placeholder: a question or an instruction the writer
replaces or removes. Init prefixes the rendered copy with its generated-by
comment line, as it does for every markdown target
(`skills/init/scripts/init.mjs:424-430`); the checker ignores HTML comment
lines, and the written spec starts at its title.

The specs README template gains one paragraph: `_template/Spec.md` is the
template every spec is written from, the project may add sections and
questions to it, and the checker reads it.

### The checker

`skills/brainstorming/scripts/check-doc.mjs`, node built-ins only, exports
`checkDoc(document, template)` and runs as a command:

```
node check-doc.mjs [--template <path>] <document>
node check-doc.mjs --print-template [<document or directory>]
```

Template lookup, when `--template` is absent: walk up from the document's
directory for `.agents/ultrapowers.json`. When it is found and
`specs/_template/Spec.md` exists under that root, use it. Otherwise use the
payload file, resolved relative to the checker's own location. The check
form prints, before any finding, one line `template: <path>` on stderr so a
reader knows which template was used. `--print-template` prints the
resolved path alone on stdout and exits 0.

`checkDoc` returns an array of `{ line, rule, message }`, line being
1-based in the document, 0 when the finding concerns the whole document.
The command prints one line per finding, `<path>:<line>: <rule>: <message>`,
in document order, and exits 1 when there is any, 0 when there is none, 2
when the template or the document cannot be read or the template has no
`## ` heading. It never writes a file.

Before any rule runs, the checker blanks every line of a fenced code block
(the lines between a pair of ``` or ~~~ fences, the fences included) and
every HTML comment line (`<!-- ... -->` on one line), keeping the line
numbers. So a spec may quote the template in a fence without the quoted
headings, questions, placeholders or record block counting as its own, and
init's generated-by line is harmless. Inline code spans (text between
backticks) are skipped by rules 3 and 4 only, and they are matched within a
paragraph, the lines up to the next blank line taken together, so a span
that crosses a soft line break in wrapped prose still counts as code.

The rules:

1. `heading`: every `## ` heading of the template (the text after `## `,
   trimmed) appears as a `## ` heading in the document, and the required
   headings appear in the template's order. Extra headings may sit between
   them. The first occurrence of a heading counts. Findings: a missing
   heading, reported at line 0; a heading out of order, reported at its line.
   A code fence that is never closed is reported here too, at its line, and
   then no other rule runs, since every later line would read as code.
2. `status`, core: a line matching `Status: draft|approved|superseded,
   YYYY-MM-DD.` appears before the first `## ` heading. One finding at line 0
   when it does not.
3. `question`: a template line that is wholly italic (`_..._`), a question
   or an instruction, and appears verbatim, trimmed, in the document. One
   finding per surviving line.
4. `placeholder`: outside code, the word `TBD`, the word `TODO`, or an angle
   placeholder `<...>` that does not start with `http`. One finding per line.
5. `empty`: a required section whose body, up to the next `## ` heading, has
   no line that is non-blank, is not a surviving question, and is not a bare
   `None` or `None:` with nothing after the colon. `None:` followed by a
   reason counts as content. One finding per section, at the heading's line.
6. `record`, core, applied even when the template lacks the section: the
   document has `## Decision record`; its body has a `### D1:` block; every
   `### D<n>:` block, up to the next `### ` or `## ` heading, carries the five
   label lines `- **Chosen:**`, `- **Why this one:**`, `- **Rejected:**`,
   `- **Failure points:**`, `- **Edge cases:**`, their first occurrences in
   that order, a label free to repeat (several rejected options); every
   bullet item from the `Why this one` label to the end of the block, a `- `
   line together with the indented lines that continue it, contains
   `Evidence:`, `Assumption:` or `My call`; and a non-blank line inside a
   block that is not part of a bullet item is a finding. Findings name the
   block and the label.
7. `ledger`: when `## Assumption ledger` exists and its body has lines
   starting with `|`, the first is the header `| # | Question | Chosen answer
   | Confidence | Reason |` with whitespace normalized, the second is the
   separator, and every later row has five cells with the fourth being
   `high`, `medium` or `low` in any case. Findings name the row.

Rules 2 and 6 are the non-removable core. Everything else is read from the
template.

### The brainstorming prose

`skills/brainstorming/SKILL.md`, by paragraph, meanings fixed here and
wording left to the builder within them:

- **Three Paths, the bounded bullet (`:73-81`)**: the short in-chat design
  names, in one line, the alternative not taken and why.
- **Ground to cover (`:145-154`)**: one more bullet, the spec template's
  questions, found with the checker's `--print-template` form, in the
  architectural path and the ticket form. Still territory, never read out.
- **Think wide privately (`:166-170`)**: the first two sentences stay. The
  third, which shows the comparison only when it helps them decide, is
  replaced by the rule: in the architectural path and the ticket form, the
  approaches are presented before the design. The recommended one carries,
  as bold-labelled bullets, what it is, why this one, failure points and
  edge cases, every line with `Evidence:`, `Assumption:` or `My call:`. Each
  alternative carries why not and its main failure point, with sources. No
  table. The message ends with the recommendation and one question. In the
  autopilot form the record goes straight into the spec.
- **Coverage pass**, a new paragraph after Play It Back (`:189-212`): before
  writing, sort every template question into covered, minor or theirs, as
  the builder check sorts; settle minor ones and mark them `My call` with a
  ledger row; ask the theirs pile in one message, most important first; a
  whole uncovered section is asked, not filled.
- **The Written Design (`:214-227`)**: the "Cover" list is replaced by: write
  it from the template, starting at the title, every heading kept, every
  italic line answered or removed, a section that does not apply saying
  `None:` with the reason, D1 the approach as chosen. The paragraph on a
  talented builder, "Where it goes" and the elements-of-style line stay.
- **Spec self-review (`:236-243`)**: item 5, run the checker on the spec,
  fix every line it reports, hand nothing over while it reports; without
  node, say so in one line, name the template the spec was written from,
  and hand over, because the commit-time check runs wherever node is; when
  the checker runs and exits 2, say so and do not hand over.
- **Autopilot form (`:97-115`)**: two sentences. Every `Assumption:` and
  `My call:` line of the record is a ledger row. A whole uncovered section
  becomes rows at low confidence.
- **Red Flags (`:320-334`)**: three rows.

| Thought | Reality |
|---|---|
| "I'll fill the section so the checker passes" | A filled blank is an assumption. Sort it: minor is your call, marked; theirs is a question. |
| "The template asks it, so I'll ask them" | Sort first. Only the theirs pile reaches your partner, in one message. |
| "I'll show one approach, the others are obviously worse" | The rejected options and why they lost are part of the design. Name them, with their failure point and its source. |

Untouched: HARD-GATE, the builder-check prompt, the visual companion, "Where
it goes".

Phrases the skill-body suite pins: `--print-template`, `Failure points`,
`Edge cases`, `Evidence:`, `theirs`, `check-doc.mjs`, the three Red Flags
thoughts; and the absence of "only when it helps them decide".

### The other prose

- `skills/brainstorm-task/SKILL.md` Step 7 (`:80-86`) and checklist item 8
  (`:98`): the commit script checks the spec first; `=== SPEC-CHECK-FAILED ===`
  means fix the listed lines and run it again.
- `skills/autopilot/prompts/spec.md:3`: the spec is written from the
  template, and the record's assumption lines are ledger rows.
- `skills/init/SKILL.md:23`: the message for a missing node also names the
  spec check as a reason to install it. No new check and no new setting.
- `README.md:320` (the brainstorm-task step) gains one sentence on the
  approaches, the template and the checker; `README.md:469` gains half a
  sentence. `AGENTS.md`'s layout table gains a `skills/brainstorming/` row
  naming `check-doc.mjs`, and the `templates/` row names
  `specs/_template/Spec.md`.

### The call sites

- `skills/brainstorm-task/scripts/commit-spec.sh`: after the existence check
  and before `git add`, run the checker on the spec when `have_node` of
  `ticket-lib.sh` says node is available. Exit 1 from the checker prints
  `=== SPEC-CHECK-FAILED ===`, the findings, and exits 1 with nothing staged.
  Exit 2, or a checker file that is missing, prints `ERROR:` with the reason
  and exits 1; the failed-check line carries no `ERROR:` prefix, because
  brainstorm-task reads `ERROR` as stop and a spec with findings is fixed and
  run again. Without node, the
  script prints `=== SPEC-CHECK-SKIPPED ===` with the reason and commits: the
  ticket scripts keep their promise to work without node, and the skip is
  visible in the transcript (ledger row 9). `have_node` is the existing
  helper the ticket scripts use; it treats the test-only variable
  `ULTRAPOWERS_NO_NODE` as "no node". No setting is added anywhere.
- `skills/new-task/scripts/ticket-lib.sh:119-124`: `_*` joins the refused
  ids, with the error text extended by "leading _". The four scripts that copy
  the rule in JavaScript (`qa-preflight.mjs`, `hunt-preflight.mjs`,
  `assemble-review.mjs`, `post-review.mjs`) refuse a leading `_` too, because
  the next change puts its templates under `reviews/_template/` and they write
  under `reviews/<id>/`.
- `skills/autopilot/scripts/autopilot.mjs`, `runEnd` (`:928-1002`): when
  `opts.stage` is `spec` or `changes` and the stage ended ok (the changes
  stage revises the spec, so a revised spec reaches the next packet checked),
  read `specs/<ID>/Spec.md`, resolve the template as the checker does (the
  project copy, then the payload), run `checkDoc`, and on findings set `ok`
  false with the message `spec-incomplete: <the first three findings joined
  by "; ">`, exactly as `qa-missing` and `plan-changed` do. The stage then
  ends blocked through the existing path: state, log, commit, label, ticket
  comment. The engine imports `checkDoc` and the lookup from the checker
  module directly; no new error code joins the scope-code list, and
  `previewScope` and `trustState` are untouched (ledger row 10). The suite's
  `SPEC` fixture (`tests/autopilot/autopilot.test.mjs:15`) becomes a minimal
  valid spec, so every test that ends a spec stage keeps passing.
- `templates/.githooks/pre-commit.tmpl`: a block `# >>> spec check` to
  `# <<< spec check` after the lint block, mirroring it: the same plugin
  lookup for `skills/brainstorming/scripts/check-doc.mjs`; the staged file
  list filtered to `specs/<x>/Spec.md`, with `specs/_template/Spec.md`
  excluded, and `docs/ultrapowers/specs/<x>-design.md`; a file added in the
  commit (`--diff-filter=A`) is always checked, a modified or renamed one
  (`--diff-filter=MR`, a rename being a modification, so a renamed old spec
  is not forced into a retrofit) only when its staged content has a
  `## Decision record` line; both file lists are read with
  `-c core.quotePath=false`, so a path with non-ASCII characters matches the
  filter; a staged snapshot through `checkout-index` holding the spec files,
  `specs/_template/Spec.md` and `.agents/ultrapowers.json`; one checker run
  per file; findings block the commit with the lines and a one-line hint; no
  plugin or no node warns and continues.

## Data flow

Interactive, either door: the skill reads the template through
`--print-template`; the conversation covers its questions; the coverage sort
runs; the spec is written from the template; the checker runs in the
self-review; the builder check reads the file; the partner reviews; the
commit runs the checker again, through `commit-spec.sh` in the ticket door
and through the hook in a scaffolded project.

Autopilot: the engine's spec stage invokes brainstorm-task, which invokes
brainstorming in its autopilot form; the spec is written with the ledger;
`commit-spec.sh` checks and commits it; the engine runs the checker once
more at the end of the spec stage and of the changes stage (which revises
the spec), and a finding ends the stage blocked with a ticket comment;
`next` moves to the plan stage only from a finished spec stage, and a
blocked changes stage is retried; the packet lists the assumptions as today.

Hook: the staged file list enters; the snapshot of the staged spec, the
staged template and the config is written to a temporary directory; the
checker reads two files per spec and writes nothing; the result is a blocked
commit or a pass.

Boundaries: the checker reads two files and opens no network connection. The
hook and the engine read only the repository. The template is data; nothing
in it is executed.

## Error handling

- The checker: an unreadable template or document, or a template without a
  `## ` heading, is one line on stderr and exit 2. Findings are one line each
  on stdout and exit 1. It never edits a file.
- `commit-spec.sh`: findings print `=== SPEC-CHECK-FAILED ===` and the lines,
  exit 1, nothing staged. A checker that cannot run with node present prints
  `ERROR:` and exits 1. Nothing is committed in either case. Without node the
  script prints `=== SPEC-CHECK-SKIPPED ===` with the reason and commits.
- The engine: `spec-incomplete` ends the stage blocked, at the end of the
  spec stage and of the changes stage, through `runEnd`'s existing path, which
  writes the state, the log, the commit, the label and a ticket comment with
  the first findings, and releases the lock and the marker. Never silent. A
  missing spec, a spec or template that is not a regular file inside the
  project, and a checker that cannot run end the stage blocked the same way,
  each with a message that says which (`spec-incomplete: specs/<ID>/Spec.md
  does not exist`, `spec-incomplete: the spec check could not run: <the
  reason>`), not a list of missing headings.
- The hook: findings block the commit with the lines and the hint "fix them,
  or run the spec check with your agent". No plugin checkout or no node is a
  warning and the commit continues, as for the lint.
- The skill: a checker that reports means fix and rerun before handing over.
  A checker that runs and exits 2 is said to the partner in one line, and
  the spec is not handed over until it runs. Without node the skill says so
  in one line and hands over; the commit-time check runs wherever node is.

## Testing

Offline suites, each in the `AGENTS.md` list and in `.github/workflows/ci.yml`:

- `node --test tests/brainstorming/check-doc.test.mjs`, new: a clean spec from
  the default template passes; one failing fixture per rule asserting the
  rule and the line: a missing heading, a reordered heading, a bad status
  line, a surviving question, `TBD` outside code, an angle placeholder inside
  a code span that is ignored, a bare `None`, a missing `D1`, a missing label,
  a reordered label, an untagged line under `Failure points`, a bad ledger
  header, a confidence outside the set; a fenced copy of the template inside
  a spec is ignored by every rule; a fence that is never closed is one
  finding at its line; a generated-by comment line is ignored; a
  code span that crosses a line break hides its placeholder, and hides a
  template question quoted inside it; a
  project template with an extra section makes it required; a project
  template without the record still requires it; `--print-template` resolves
  the project copy, then the payload; exit codes 0, 1 and 2; and the dogfood
  cases: this spec passes against the payload template, and its fenced copy
  of the template equals the payload file byte for byte.
- `bash tests/task-lifecycle/test-task-lifecycle.sh` gains cases: a
  ticket spec with a surviving question gets `=== SPEC-CHECK-FAILED ===`,
  exit 1 and nothing staged, without an `ERROR:` prefix, and a clean one
  commits; with `ULTRAPOWERS_NO_NODE=1` the same failing spec gets
  `=== SPEC-CHECK-SKIPPED ===` (reason `node not available`) and commits; a
  missing checker file is an `ERROR:` with nothing staged; `_template` and
  `_x` are refused as ticket ids. The suites of the four JavaScript scripts
  that copy the rule each refuse a leading `_` under a `ticketPattern` that
  would allow it.
- `bash tests/autopilot/run-tests.sh` gains cases in `autopilot.test.mjs`: a
  spec stage ended with a failing spec ends blocked with `spec-incomplete`,
  the ticket comment names the first findings, and `next` does not move to
  the plan stage; a spec stage ended with a valid spec finishes; a changes
  stage that leaves `TBD` in the spec ends blocked the same way and `next`
  answers `changes-retry`; a missing spec, a template the checker cannot use
  and a symlinked spec each end blocked with a message of their own. The
  suite's `SPEC` fixture becomes a minimal valid spec. `autopilot-lib.test.mjs`
  gains: the scope and the ledger are read from a spec that quotes the
  template in a fence, and from a ledger whose separator row is aligned.
- `bash tests/init/run-tests.sh` gains: scaffold renders `specs/_template/Spec.md`
  as the generated-by comment line followed by the payload file unchanged;
  `CHANGES.json` lists it and the hook at the new version; for a scaffold
  from an older version, check mode reports `upgrade-available` and the
  upgrade preview lists `specs/_template/Spec.md` among the files to create
  (`runCheck` has no missing-file finding for payload files,
  `init.mjs:1555-1596`, and none is added).
- `bash tests/brainstorming/test-precommit-spec-check.sh`, new, a sibling of
  `tests/team-memory/test-precommit-lint.sh` with the same fake project and
  `ULTRAPOWERS_ROOT`: a new spec with a surviving question blocks the commit;
  an old spec without a record passes unchecked; a modified spec with a record
  and a bare `None` blocks; a renamed old spec without a record passes and a
  renamed one with a record and a bare `None` blocks; a path with non-ASCII
  characters is checked; the staged snapshot decides, not the working tree;
  the template file itself, new after scaffold, passes unchecked; a new
  `docs/ultrapowers/specs/` file without the `-design.md` suffix passes
  unchecked; without the plugin the hook warns and the commit passes.
- `bash tests/skills/test-skill-bodies.sh` pins the phrases listed under
  "The brainstorming prose", the `SPEC-CHECK-FAILED` marker in brainstorm-task,
  that the payload template exists and holds `## Decision record`, and that
  its `## ` headings are exactly the thirteen of the template above.
- `scripts/lint-shell.sh --all` covers `commit-spec.sh` and `ticket-lib.sh`;
  the hook template is exercised by its test.

Pressure evidence, as `ultrapowers:writing-skills` prescribes: a fresh Sonnet
subagent reads only `skills/brainstorming/SKILL.md` and the payload template,
simulates the partner, writes no file, and runs once on the dev skill before
the change (RED) and once on the edited skill (GREEN). The prompts go to
`tests/skills/brainstorming-pressure-scenarios.md` as D, E and F, the reports
to `brainstorming-pressure-results.md`:

- **D, the approaches**: a feature with two plausible designs in an existing
  codebase described in the prompt. RED expected: a recommendation with
  trade-offs and nothing else. GREEN: the four fields with sources for the
  recommended one, why not and the main failure point for the other.
- **E, the uncovered section**: the partner approves a design and error
  handling was never discussed. RED expected: the section is written from
  imagination. GREEN: the sort, one message for the theirs pile, the section
  written after the answer.
- **F, the autopilot form**: the marker is present. GREEN: no question, the
  record's assumption lines mirrored as ledger rows, and the checker passes on
  the written result.

## Left to the builder

- The checker's internal structure: one function per rule or a rules table,
  the exact finding messages, the fixture layout under
  `tests/brainstorming/fixtures/`.
- The exact wording of the new skill sentences, within the meanings fixed
  under Components and the pinned phrases.
- The hook block's shell, within: the lint block's plugin lookup, the
  snapshot, the fail-open, LF.
- Whether `checkDoc` and the command line share one file guarded by a main
  check, or a library file plus a thin command.
- The README sentences and the AGENTS.md cells.
- The order of implementation tasks, within: the checker and its suite first,
  because every call site and the dogfood case depend on it; the pressure
  RED runs before the prose edits.

## Definition of done

- `templates/specs/_template/Spec.md.tmpl` exists, init renders it, and
  `templates/CHANGES.json` lists it and the hook at the next minor.
- `check-doc.mjs` passes its suite, and this spec passes the checker.
- `commit-spec.sh`, the engine and the hook refuse an incomplete spec in
  their tests.
- The brainstorming prose carries the changes; the skill-body suite passes;
  RED and GREEN results for D, E and F are recorded.
- The `AGENTS.md` test list and `ci.yml` include the new suites; CI is green
  on Linux and Windows.
- README and the AGENTS.md table are updated; the release notes carry the
  entry at release time.
- An issue is open for the follow-up templates: plan, QA report, security
  report, task review.

## Repositories in scope

- `.`

## Assumption ledger

| # | Question | Chosen answer | Confidence | Reason |
|---|---|---|---|---|
| 11 | Which files does the hook check under the two spec locations? | `specs/<x>/Spec.md` except `specs/_template/Spec.md`, and `docs/ultrapowers/specs/<x>-design.md` | medium | The template is new after every scaffold and fails by design; the docs folder holds files that are not specs; the skill gives a spec the `-design.md` suffix (`SKILL.md:231`) |
| 16 | Does `init check` gain a missing-file finding for the template? | No; it reports `upgrade-available` and the upgrade preview lists the file | medium | `runCheck`'s only missing-file case is the Gemini launcher (`init.mjs:1583-1596`); a new finding is more than this change needs |
| 17 | Is an inline code span matched across a line break? | Yes, within a paragraph | medium | Wrapped prose puts a span across two lines; a per-line scan flagged this spec's own text in the builder check of 2026-10-12 |
| 2 | A project scaffolded before this version has no template copy; what then? | The checker falls back to the payload and names the template it used | medium | Until upgrade proposes the file; the stderr line makes the fallback visible |
| 3 | Why not HTML comments for the questions? | A human reads the rendered template | medium | Visible questions guide a human writer too |
| 4 | A rephrased question evades rule 3; is that acceptable? | Yes, rule 5 and the builder check are the net | medium | A verbatim rule is cheap and exact; a fuzzy one would fail correct specs |
| 5 | Coverage questions before writing, not in the builder round? | Before | medium | The partner is asked once per gap; the section is never written from nothing |
| 6 | A one-line ticket brief: how does the record look? | `None:` sections, a D1 with no rejected option, with the evidence that the ticket fixes the change | medium | The ticket form always produces a spec (port decision 12) |
| 7 | Which staged specs does the hook check? | New ones always; modified ones only when they carry a record | medium | An old spec touched for a typo must not force a retrofit |
| 8 | What does the hook's snapshot hold? | The spec files, `specs/_template/Spec.md` and `.agents/ultrapowers.json` | medium | The lookup walks up from the document; the staged template must be the one checked |
| 13 | May a project reorder the template's headings? | Yes; only the record's presence and labels are core | medium | Rule 1 follows the template so a project owns its order |
| 14 | What is the version? | The next minor | medium | A feature plus a payload change; the owner decides at release |
| 9 | What does `commit-spec.sh` do without node? | Prints `=== SPEC-CHECK-SKIPPED ===` with the reason and commits | high | The owner's answer of 2026-10-12; the ticket scripts promise to work without node (`ticket-lib.sh:11-12`), and the marker keeps the skip visible; with node present a check that cannot run still stops the commit |
| 10 | Where does the engine run the checker? | At the end of the spec stage and of the changes stage, in `runEnd` | high | `consumeApproval` parses the spec itself and `previewScope` runs inside `trustState`, which turns any throw into `state-tampered` (`autopilot.mjs:375-387`, `:533-545`); a ticket already past the spec stage meets the check again only at a changes stage, where a spec that predates the template is blocked until it is brought to the template |
| 1 | The partner picks an approach that was not recommended; when is its record completed? | After the pick, before the spec is written | high | The spec's record is for the chosen option; the chat gave the short form |
| 12 | Does init change the template when it renders it? | Only its generated-by comment line is added | high | It carries no `{{...}}` placeholder; `init.mjs:424-430` adds the line to every markdown target; the init suite asserts the rest is unchanged |
| 15 | Which pressure method? | The simulated-partner method of the 7.0.0 port | high | `tests/skills/brainstorming-pressure-results.md`; live evidence stays owed as before |
