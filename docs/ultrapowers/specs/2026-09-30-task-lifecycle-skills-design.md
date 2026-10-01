# Ultrapowers piece 3: task lifecycle skills

- Date: 2026-09-30
- Status: implemented (2026-09-30); released in v1.0.0. 2026-10-01: the argument sentence of the three skills writes the placeholder once (evidence in `tests/task-lifecycle/pressure-results.md`)
- Scope: sub-project 3 of 5. Covers requirements 3 (`/new-task`) and 4 (`/brainstorm-task`), plus the read-only `/task` loader the owner accepted. Depends on piece 1 (namespace) and piece 2 (scaffold marker, knowledge base folders, config file). Inherits the global constraints G1 to G5 from the piece 2 spec.

## 1. Problem

The owner's development cycle starts with a ticket: create the four ticket folders, write a short brief, brainstorm a spec grounded in the code, then plan. Today that is manual folder creation plus a brainstorming skill that does not read enough of the codebase first, which later produces plans that collide with the real architecture. The reference project solved this with two commands whose grounding step, repo selection and spec location are worth keeping, but they hard-code the reference's repo catalog, ticketing system and commit sign-off.

## 2. Decisions

| Id | Decision | Rationale |
|----|----------|-----------|
| D1 | Three new plugin skills: `new-task`, `brainstorm-task`, `task`. No merge-request skill. | Owner's selection. |
| D2 | The brief template is: title line, Context, Definition of Ready, Definition of Done, Related Documentation. Two short paragraphs at most. | Owner's requirement. It is a kickoff, not a spec. |
| D3 | Ticket ids accept any token matching a permissive pattern; default `^#?[A-Za-z0-9][A-Za-z0-9._-]*$`, overridable in project config. | Owner uses Odoo, GitLab and GitHub ids. |
| D4 | Repositories are discovered from the project config, never from a hand-written catalog. Selection order: explicit focus words, branch match on the ticket id, then one multiple-choice question. | Piece 2 records nested clones; the reference's keyword table was project-specific. |
| D5 | The core `brainstorming` and `writing-plans` skills each gain one paragraph: with a project config and a known ticket id, write to `specs/<id>/Spec.md` and `plans/<id>/Plan.md`; otherwise keep the upstream default. Nothing else in them changes. | Owner's choice. Running writing-plans directly after brainstorm-task must land in the knowledge base. |
| D6 | Root discovery walks up to `.agents/ultrapowers.json`. It never uses the git toplevel and never relies on a harness environment variable. | Inside a nested clone the git toplevel is the wrong repo; the variable is unset in shell tool calls. |
| D7 | Arguments come from `$ARGUMENTS` in the skill body, read by position (the ticket is the first word), with a fallback that reads a trailing `ARGUMENTS:` line. There is no `arguments:` frontmatter key. | Claude Code substitutes `$ARGUMENTS` without a declared list; older versions and other harnesses append the raw text instead. A named list would add a third frontmatter key, which G1 forbids (revised 2026-09-30 by owner decision, same ruling as the init skill). |
| D8 | Commits made by these skills end with an optional trailer from project config; none by default. | The reference hard-coded a personal sign-off. |

## 3. Design

### 3.1 Common behavior

- Frontmatter per G1: exactly `name` and `description`. Each body has an Arguments section that reads `$ARGUMENTS` by position, or the trailing `ARGUMENTS:` line when nothing was substituted.
- Root: from the working directory walk up until a directory contains `.agents/ultrapowers.json`; if the filesystem root is reached, stop and say the project is not scaffolded, offering `/ultrapowers:init`.
- Every shell block prints marked sections and the skill says "read the output before continuing; any line containing ERROR means stop".
- Placeholders `<ID>` and `<ROOT>` are filled by the agent before running commands.
- Config keys read: `repos`, `commitTrailer`, `ticketPattern`.

### 3.2 `new-task`

Arguments: `ticket` (required), `title` (optional, rest of the line), and context supplied in conversation.

1. Validate the ticket against the pattern. Check the four folders `tasks/<ID> specs/<ID> plans/<ID> reviews/<ID>` and print `EXISTS` with a listing or `absent` for each.
2. If `tasks/<ID>` exists, stop and change nothing; tell your human partner to run `/ultrapowers:task <ID>`. A re-run can never overwrite a real brief.
3. Create the four folders; write an empty `.gitkeep` into `specs`, `plans`, `reviews`.
4. If no context was given, ask one question for it; if the answer is "later", keep the angle-bracket prompts.
5. Write `tasks/<ID>/<ID>.md`:

   ```markdown
   # <ID> - <title or "title pending">

   ## Context
   <one paragraph: how things behave today and what this task changes>

   ## Definition of Ready
   - [ ] <what must be true before work starts>

   ## Definition of Done
   - [ ] <how anyone checks the goal is met>

   ## Related Documentation
   - <links to specs, handbooks, memory entries; leave empty if none>
   ```

6. Stage the four folders and commit `chore(<ID>): scaffold task` with a one-line body and the configured trailer if any.
7. Hand off: "fill the brief if it still has prompts, then run `/ultrapowers:brainstorm-task <ID>`".

### 3.3 `brainstorm-task`

Arguments: `ticket` (required), `focus` (optional words: repo names from `repos`, or areas such as frontend or backend).

1. Preflight, one shell block: brief present with byte size or `BRIEF-MISSING`; existing files under `specs/<ID>/` with sizes; case-insensitive check for any file named `spec.md`; for each repo in `repos`, current branch and whether it matches the ticket id.
2. Read the brief with the file-reading tool, not through the shell, because large output gets diverted. If the brief is missing, ask for the source and write it first via the new-task template.
3. Select repositories, first hit wins: focus words matched against repo names or their declared area; repos on a branch containing the ticket id; else ask one multiple-choice question over `repos`, proposing at most three. Confirm the set with your human partner before reading any code. A project with no nested repos selects the root.
4. Ground in the code, per repo: grep the brief's terms; read only hits; at most eight files, highest signal first; never list whole trees. Then domain research only for terms the brief raises, preferring library documentation tools when available.
5. Print the grounding manifest: every file read with its path and every page fetched. This makes the grounding auditable.
6. Invoke `ultrapowers:brainstorming` and follow it. The KB-aware paragraph in that skill routes the spec to `specs/<ID>/Spec.md`. If a spec already exists, ask revise or replace; never overwrite silently.
7. After the core skill's self-review, commit `spec(<ID>): <summary>` with the trailer, and hand off to `ultrapowers:writing-plans`.

Red flags table entries: "I know this codebase, I can skip grounding"; "the brief is short so one file is enough"; "the spec exists, I will just overwrite it"; "I will read the whole repo to be safe".

### 3.4 `task`

Argument: `ticket`. Read-only.

1. Manifest: every markdown file under the four ticket folders with byte size and an estimated token count; non-markdown files listed as "not read, name one by path".
2. Repo state: for each repo in `repos`, current branch, whether it is on a ticket branch, last ten commits and short status.
3. Read every listed markdown file in order tasks, specs, plans, reviews.
4. Report: where the ticket stands, what is done, what is in flight, the next step, every missing part by name, and the unread non-markdown list. Write nothing.

### 3.5 Core skill edits

- `skills/brainstorming/SKILL.md`, in the documentation step: "If `.agents/ultrapowers.json` exists at or above the working directory and a ticket id is known from the conversation, write the spec to `specs/<id>/Spec.md` instead of the default path."
- `skills/writing-plans/SKILL.md`, where the plan path is stated: the same rule targeting `plans/<id>/Plan.md`. A plan set for one ticket uses `plans/<id>/PLAN-NN-<slug>.md` with a `README.md` index.
- The piece 2 knowledge base READMEs for `specs` and `plans` document the same convention.

### 3.6 Config additions

```json
{
  "commitTrailer": "",
  "ticketPattern": "^#?[A-Za-z0-9][A-Za-z0-9._-]*$"
}
```

Both optional. Init writes them with defaults.

## 4. Acceptance criteria

1. On a scaffolded temp repo with two nested clones, `/ultrapowers:new-task 1234 Sample title` creates the four folders, the three `.gitkeep` files and the brief, and commits once. Running it again changes nothing and points at `/ultrapowers:task 1234`.
2. From inside a nested clone, all three skills find the project root and operate on it.
3. `brainstorm-task 1234 backend` selects the repo whose name or area matches, prints a grounding manifest with at most eight files for it, and writes `specs/1234/Spec.md` after the brainstorming session.
4. With `specs/1234/Spec.md` present, brainstorm-task asks revise or replace and never overwrites without an answer.
5. `writing-plans` invoked afterwards writes `plans/1234/Plan.md`. In a repo without the marker it writes to the upstream default.
6. `task 1234` reads the ticket's files and reports missing parts without writing.
7. Bash tests on temp repos pass for: root walk-up, ticket pattern accept and reject cases, refusal on existing task, spec collision detection, grounding cap enforcement in the preflight helper.
8. Pressure tests per writing-skills show the agent grounding before questioning, refusing to overwrite, and keeping the brief to two paragraphs.

## 5. Risks

- Adding text to tuned core skills can shift behavior. Mitigation: one paragraph each, conditional on the marker, verified by the pressure tests and by re-running the upstream acceptance prompt.
- Large briefs read through the shell get truncated. Mitigation: D-level rule to use the file-reading tool, stated in the skill.
- Branch matching on short numeric ids can collide with unrelated branches. Mitigation: match `<id>` followed by a non-digit or end of string, as the reference does.

## 6. Out of scope

Merge or pull request creation. QA (piece 5). Memory (piece 4). Any change to plan execution skills; they already take a plan path.
