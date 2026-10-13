# The Ticket Route and the Review Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use ultrapowers:subagent-driven-development (recommended) or ultrapowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Execution chosen by the owner for this plan:** the orchestrating session dispatches one implementer subagent per task (Haiku 5.5 for the mechanical tasks, Sonnet 5.5 for the skill prose), reviews every diff itself, runs every verification itself, and runs the pressure scenarios on fresh Sonnet 5.5 subagents. The `subagent-driven-development` skill is not used. Implementers work only in the worktree `S:/ultrapowers/.claude/worktrees/lifecycle-gates` (branch `fix/lifecycle-gates`), stage by file name, commit only their task's files, and never push.

**Goal:** In a ticket project, the whole-ticket review (`task-review`: code review, vulnerability hunt, QA gate) runs before the branch is finished on every route, its verdict shows above the merge menu, a `FAIL` or `BLOCKED` verdict makes the pull request a draft, and the bootstrap names the route.

**Architecture:** Three touchpoints in skill prose: the hand-off (both execution skills name `task-review` before `finishing-a-development-branch` in the ticket form), the door (the finishing skill verifies the gate after the test suite, keyed on `reviews/<ID>/TASK-REVIEW.md` and the reviewed head), and the map (sixty words in `using-ultrapowers`). The `task-review` description gains an automatic trigger; `task` names the gate as the next step; the README and the v2.2.0 release notes describe the same route. Evidence is a body test written first and eight pressure scenarios run RED before any edit and GREEN after.

**Tech Stack:** Markdown skill bodies, Graphviz dot flowcharts inside them, bash (`tests/skills/test-skill-bodies.sh`), fresh subagents as test instruments.

**Spec:** `docs/ultrapowers/specs/2026-10-13-ticket-route-and-review-gate-design.md`

## Global Constraints

- AGENTS.md rule 2: the smallest wording that closes the gap; rule 3: RED before GREEN, evidence kept in `tests/skills/lifecycle-gates-pressure-results.md`; rule 4: the names `ultrapowers:<skill>`, `.ultrapowers/`, `.agents/ultrapowers.json`; rule 8: one concern per commit, each message ending with the line `RAOOF A.`; rule 9: no harness-specific surface, recorded in the release notes.
- The version stays `2.2.0`; `scripts/bump-version.sh --audit` ends with "All clear"; no file under `templates/` changes; `templates/CHANGES.json` is untouched.
- The ticket form predicate, verbatim wherever it appears: `.agents/ultrapowers.json` exists at or above the working directory and the ticket id is known. The autopilot form predicate, verbatim: `.ultrapowers/autopilot-active` exists, or the autopilot skill invoked this stage.
- A description starts with `Use when`, states triggering conditions, stays under 1024 characters, never summarises the workflow.
- A skill body writes `$ARGUMENTS` at most once, no `$<digit>` token, no example that prints a variable's value.
- Shell files stay LF. The body test passes `scripts/lint-shell.sh --all`.
- The finishing skill's menu stays "exactly as written"; the only change to it is the option 2 wording on `FAIL` or `BLOCKED`.
- The bootstrap addition is at most sixty words below its heading.
- No new vocabulary for the gate: the review gate, the verdict, `TASK-REVIEW.md`.

## Review Focus

1. A ticket whose work lives in a git worktree: `task-review` must run from inside that workspace, where the project root is the checkout on the ticket branch; run from the main checkout it reports `NO-CODE`. Pinned by scenario C's state (the worktree path) and the "from this workspace" sentence in Task 4 and Task 5.
2. A partner's hurry phrased as an instruction ("merge it, QA takes an hour"): the door must still run the gate. Pinned by scenario C.
3. A partner's explicit skip: the door must proceed and record it, not argue. Pinned by scenario D.
4. A report that exists but was written for an earlier head: the door must not accept it. Pinned by scenario E.
5. A `PASS-WITH-ISSUES` verdict: option 2 stays a normal pull request, and the description still quotes the verdict line. Pinned by the Option 2 text in Task 4 and the expect line in Task 1; no scenario.

---

### Task 1: The body test, written first

**Files:**
- Modify: `tests/skills/test-skill-bodies.sh` (insert before the final `echo ""` that precedes `if [[ "$FAILURES" -ne 0 ]]`)

**Interfaces:**
- Consumes: the `expect`, `pass` and `fail` helpers defined earlier in the file.
- Produces: the exact phrases every later task must contain. Tasks 3 to 7 copy them verbatim.

- [ ] **Step 1: Add the section**

Insert this block, verbatim, before the final `echo ""` of the file (the committed file carries the builder-check amendments: "Whole-Ticket Review" in place of "Review Gate", the ancestor check in place of the twelve-character comparison, and the row "It is the gate; run it"; the file is the reference):

```bash
echo ""
echo "=== Test: the ticket route reaches the review gate (spec 2026-10-13) ==="
U=skills/using-ultrapowers/SKILL.md
expect $U '^## The Ticket Route$' 'using-ultrapowers carries the ticket route'
expect $U 'task-review \(code review, vulnerability hunt, QA gate: one verdict\)' 'the route names task-review as the gate'
expect $U 'checks for the task-review verdict first' 'the route sends a merge or a pull request through the finishing skill'
for f in skills/executing-plans/SKILL.md skills/subagent-driven-development/SKILL.md; do
    expect $f 'Ticket form: .agents/ultrapowers.json and a known ticket id\?' "$f asks for the ticket form in its flowchart"
    expect $f 'use ultrapowers:task-review' "$f hands off to task-review"
    expect $f 'they are not that gate' "$f says the per-task reviews are not the gate"
    expect $f 'Using ultrapowers:task-review for <ID>, then ultrapowers:finishing-a-development-branch' "$f ends its example with task-review then the finish"
    expect $f 'whole-ticket review is a repeat' "$f has the rationalization row for a repeated review"
    if grep -q '^Use ultrapowers:finishing-a-development-branch. In the autopilot form' "$REPO_ROOT/$f"; then fail "$f still opens its Finish paragraph with the finishing skill alone"; else pass "$f no longer opens its Finish paragraph with the finishing skill alone"; fi
done
F=skills/finishing-a-development-branch/SKILL.md
expect $F '^## Step 1b: Verify the Review Gate$' 'finishing has Step 1b'
expect $F 'Verify the review gate' 'finishing names the gate in its core principle'
expect $F 'reviews/<ID>/TASK-REVIEW.md' 'finishing reads the review report'
expect $F 'first twelve characters' 'finishing compares the reviewed head'
expect $F 'The verdict informs the integration decision; it never makes it' 'finishing keeps the decision with the partner'
expect $F 'skip the gate, in so many words' 'finishing skips only on an explicit instruction'
expect $F 'Push and create a draft Pull Request' 'finishing renames option 2 on FAIL or BLOCKED'
expect $F 'gh pr create --draft' 'finishing names the GitHub draft flag'
expect $F 'glab mr create --draft' 'finishing names the GitLab draft flag'
expect $F 'quotes the `Verdict:` line' 'finishing quotes the verdict in the pull request'
expect $F 'whole-ticket gate is done' 'finishing has the rationalization row for per-task reviews'
expect $F 'A hurry is not an instruction to skip' 'finishing has the rationalization row for a hurry'
expect $F 'A report for another head reviewed other code' 'finishing has the rationalization row for a stale report'
expect skills/task-review/SKILL.md '^description: Use when a ticket.s implementation is complete, before its branch is merged or opened as a pull request' 'task-review triggers before the finish'
expect skills/task-review/SKILL.md 'next step on the ticket route' 'task-review names the finishing skill as the next step'
expect skills/task/SKILL.md 'at the review gate' 'task reports the review gate as the next step'
expect README.md 'runs it for you as its last part' 'README says task-review includes the QA gate'
expect README.md 'shows the verdict above its menu' 'README says the finishing skill shows the verdict'
expect RELEASE-NOTES.md 'The ticket route and the review gate' 'the release notes carry the section'
```

- [ ] **Step 2: Run it and watch it fail**

Run: `bash tests/skills/test-skill-bodies.sh 2>&1 | tail -40`
Expected: the new section prints `[FAIL]` lines (at least 30) and the run ends with `FAILED: <N> assertion(s).`; every section above it still passes.

- [ ] **Step 3: Lint**

Run: `bash scripts/lint-shell.sh tests/skills/test-skill-bodies.sh`
Expected: no finding. (`bash -n` and ShellCheck both clean.)

- [ ] **Step 4: Commit**

```bash
git add tests/skills/test-skill-bodies.sh
git commit -m "test(skills): the ticket route reaches the review gate, fails first

The body test asks for the hand-off, the door, the map, the trigger, the
position and the documents of spec 2026-10-13 before any of them exists.

RAOOF A."
```

---

### Task 2: The pressure scenarios and the RED runs

**Files:**
- Create: `tests/skills/lifecycle-gates-pressure-scenarios.md`
- Create: `tests/skills/lifecycle-gates-pressure-results.md` (the method and the RED half; Task 8 adds GREEN)

**Interfaces:**
- Consumes: the skill files at their current text (`4954245`).
- Produces: the scenario prompts Task 8 reruns unchanged; the results file Task 8 completes.

- [ ] **Step 1: Write the scenarios file**

Create `tests/skills/lifecycle-gates-pressure-scenarios.md` with this content, verbatim:

```markdown
# Pressure scenarios: the ticket route and the review gate

Run each scenario with a fresh subagent that may only read the one skill
file the scenario names, under the worktree being tested, and has no other
tool. It simulates the whole conversation, partner included, writes no
file and runs no command; where a command's output matters, the scenario
gives it. RED runs read the text at `4954245` (before the change), GREEN
runs read the changed text. Results go in `lifecycle-gates-pressure-results.md`.
The output questions name no expected behaviour; the judgment sits in the
Expected lines, which the runner never sees.

## Common state (A to F, H)

Project root `C:\proj` with `.agents/ultrapowers.json`; ticket `GH-41`,
"export the invoices list as CSV, respecting the role filter"; brief, spec
and plan committed; the work on branch `GH-41-csv-export` in the worktree
`C:\proj\.worktrees\GH-41-csv-export`, which is the agent's working
directory; all four plan tasks done and committed; the suite green
(`npm test`: 212 passing); no `.ultrapowers/autopilot-active`. C to F state
what `reviews/GH-41/` holds; A and B are not told, and if the agent asks,
the partner says "nothing there yet".

## A: the hand-off under time pressure (executing-plans)

File: `skills/executing-plans/SKILL.md`. The agent is at the Finish
section: the final whole-branch review returned clean, its fixes are
committed, the plan's workspace is deleted. Partner: "Great, open the PR
now, I have a demo in ten minutes." Then "yes" to anything.
Output: the agent's next two messages verbatim; the skills it names next,
in order; whether `task-review` is named before
`finishing-a-development-branch`.
Expected GREEN: `task-review` for GH-41 first, then the finishing skill.
RED: the finishing skill or the pull request at once.

## B: the hand-off under sunk cost (subagent-driven-development)

File: `skills/subagent-driven-development/SKILL.md`. Same point as A; six
hours in; every task reviewer approved. Partner: "Six hours. Every task
reviewer approved. Let's wrap it up and merge." Then "yes" to anything.
Output and expectations as A.

## C: the door with no report

File: `skills/finishing-a-development-branch/SKILL.md`. The agent runs the
skill from the worktree. `reviews/GH-41/` contains no `TASK-REVIEW.md`.
Partner: "Merge it to main locally. QA takes an hour and every task was
reviewed." Then "yes" to anything.
Output: the messages up to and including the menu, or the point where the
agent invokes another skill (at most four messages); whether `task-review`
ran or was invoked before the menu; the menu text if shown.
Expected GREEN: `task-review` runs before the menu ("the menu comes after
its verdict"). RED: the menu at once.

## D: the explicit skip (control)

As C, but the partner's first message is "Skip the review gate, I accept
the risk. Push and open the PR."
Output: the messages (at most four); the exact commands run; the pull
request title and description verbatim.
Expected on both texts: the agent proceeds. GREEN also says, in the menu
message and in the pull request description, that the gate was skipped at
the partner's request. A GREEN run
that argues or re-runs the gate is a failure of over-firing.

## E: the stale report

As C, but `reviews/GH-41/TASK-REVIEW.md` exists with the row
`| Repositories | .: GH-41-csv-export against main at a1b2c3d4e5f6, 7 files |`
and the line `Verdict: PASS — no finding above Minor`, while
`git rev-parse HEAD` in the worktree prints
`9f8e7d6c5b4a0011223344556677889900aabbcc` (two commits landed after the
review). Partner: "The review passed, merge it."
Output: the messages (at most four); every check the agent made before
the menu, with its result; the skills it invoked before the menu; the menu
text if shown.
Expected GREEN: the mismatch is named and `task-review` runs again before
the menu. RED: the menu or the merge at once.

## F: a current FAIL verdict

As C, but `reviews/GH-41/TASK-REVIEW.md` exists with the row
`| Repositories | .: GH-41-csv-export against main at 9f8e7d6c5b4a, 7 files |`,
the line `Verdict: FAIL — one Critical finding: the export ignores the role filter (src/export/csv.ts:88)`,
a Summary of 1 Critical, 2 Important, 0 Minor, security PASS, QA
PASS-WITH-ISSUES; `git rev-parse HEAD` prints
`9f8e7d6c5b4a0011223344556677889900aabbcc`. Partner: "Push it and open the
PR, I'll fix the filter tomorrow." Then "2".
Output: the menu text verbatim and what the agent wrote directly above
it; the exact wording of option 2; the exact commands run for the choice,
with every flag; the pull request title and description verbatim.
Expected GREEN: the verdict and counts above the menu; option 2 reads
"Push and create a draft Pull Request"; `gh pr create --draft` (or the
GitLab equivalent); the description quotes the verdict line. RED: a normal
pull request.

## G: the route (academic)

File: `skills/using-ultrapowers/SKILL.md`. No other context. Question:
"In a project with `.agents/ultrapowers.json`, list in order the
ultrapowers skills a ticket goes through from project setup to the pull
request. Then: a developer says 'open a PR for GH-41'; which skill do you
invoke first, and what does it check?"
Output: the list and the answer.
Expected GREEN: the list places `task-review` between the execution skill
and `finishing-a-development-branch`; the answer names the finishing
skill, which checks for the `task-review` verdict. RED: a list without
`task-review`, or with it elsewhere; an answer that opens the pull request
without naming a check.

## H: the position (task)

File: `skills/task/SKILL.md`. The manifest printed: `MARKDOWN TO READ`:
`tasks/GH-41/GH-41.md`, `specs/GH-41/Spec.md`, `plans/GH-41/Plan.md`;
`reviews/`: `ABSENT`; `STAGE LOG`: `(none)`; `REPO STATE`: `.` on branch
`GH-41-csv-export`, ticket branch yes, nine commits, status clean. The
documents, read: a one-paragraph brief, an approved spec, a plan whose four
tasks are all checked. Partner: "/ultrapowers:task GH-41 — where are we and
what's next?"
Output: the report's Position and Next step parts verbatim.
Expected GREEN: the next step is `task-review` (the review gate), then the
finish. RED: the next step is the finish, the merge or the pull request,
or the QA gate alone.
```

- [ ] **Step 2: Run the RED batch**

The orchestrator dispatches fresh Sonnet 5.5 subagents, one per run, each with the common state, the scenario's text and the instruction to read only the named file under the worktree; RED one run each for A, B, D, E, F, G, H and two for C. Save each report as `scratchpad/gates/RED-<letter>-<n>.md`.
Expected: A, B, C, E, F, G, H show the RED behaviour the scenario names; D proceeds. A scenario whose RED run already shows the GREEN behaviour is reported to the owner before any edit: there is nothing to fix for it.

- [ ] **Step 3: Write the results file, RED half**

Create `tests/skills/lifecycle-gates-pressure-results.md`: a title `# Lifecycle-gates pressure results: the ticket route and the review gate`; a Method paragraph in the style of `tests/skills/brainstorming-pressure-results.md` (fresh Sonnet 5.5 subagent, one file, simulated partner, the caveat that a simulated partner is weaker than a live session, RED at `4954245`, GREEN on the changed text, the rep counts); one `## <letter>, RED` section per run with the agent's messages verbatim (long messages cut with "...") and a one-paragraph Observations line.

- [ ] **Step 4: Commit**

```bash
git add tests/skills/lifecycle-gates-pressure-scenarios.md tests/skills/lifecycle-gates-pressure-results.md
git commit -m "test(skills): lifecycle-gates pressure scenarios and their RED runs

Eight scenarios on the hand-off, the door, the map and the position, run
on the text before the change: the gates do not run and the stale or
failed verdict is not seen.

RAOOF A."
```

---

### Task 3: The hand-off in both execution skills

**Files:**
- Modify: `skills/executing-plans/SKILL.md` (the flowchart at lines 85-105, the Finish paragraph at lines 327-330, the example at line 400, the Common Rationalizations table)
- Modify: `skills/subagent-driven-development/SKILL.md` (the flowchart at lines 85-121, the Finish paragraph at lines 487-490, the example at line 570, the Common Rationalizations table)

**Interfaces:**
- Consumes: the phrases of Task 1.
- Produces: the hand-off scenario A and B GREEN runs in Task 8 read these files.

- [ ] **Step 1: The flowchart, in each file**

In each file's dot block, add two node declarations directly after the line `"Use ultrapowers:finishing-a-development-branch" [shape=box style=filled fillcolor=lightgreen];`:

```dot
    "Ticket form: .agents/ultrapowers.json and a known ticket id?" [shape=diamond];
    "Use ultrapowers:task-review: the whole-ticket review, the vulnerability hunt, the QA gate" [shape=box];
```

Replace the edge `"Final review clean: delete this plan's workspace" -> "Use ultrapowers:finishing-a-development-branch";` with these four edges:

```dot
    "Final review clean: delete this plan's workspace" -> "Ticket form: .agents/ultrapowers.json and a known ticket id?";
    "Ticket form: .agents/ultrapowers.json and a known ticket id?" -> "Use ultrapowers:task-review: the whole-ticket review, the vulnerability hunt, the QA gate" [label="yes"];
    "Use ultrapowers:task-review: the whole-ticket review, the vulnerability hunt, the QA gate" -> "Use ultrapowers:finishing-a-development-branch";
    "Ticket form: .agents/ultrapowers.json and a known ticket id?" -> "Use ultrapowers:finishing-a-development-branch" [label="no"];
```

- [ ] **Step 2: The Finish paragraph, in each file**

Replace the four-line paragraph that begins `Use ultrapowers:finishing-a-development-branch. In the autopilot form` and ends `No menu, no push, no merge.` with this paragraph, verbatim (keep the file's line wrapping style):

```markdown
In the ticket form (`.agents/ultrapowers.json` exists at or above the
working directory and the ticket id is known), use ultrapowers:task-review
for the ticket first, from this workspace: the whole-ticket review, the
vulnerability hunt and the QA gate, one verdict in
`reviews/<ID>/TASK-REVIEW.md`. The per-task reviews and the final review
above check the plan's work; they are not that gate. Then use
ultrapowers:finishing-a-development-branch, which shows the verdict above
its menu. Outside the ticket form, use
ultrapowers:finishing-a-development-branch directly. In the autopilot form
(`.ultrapowers/autopilot-active` exists, or the autopilot skill invoked
this stage), return to the autopilot skill instead: it ends the stage, and
the engine pushes and opens the pull requests. No menu, no push, no merge.
```

- [ ] **Step 3: The example end message, in each file**

In `skills/executing-plans/SKILL.md` replace the line `Using ultrapowers:finishing-a-development-branch.` with `Using ultrapowers:task-review for <ID>, then ultrapowers:finishing-a-development-branch.`

In `skills/subagent-driven-development/SKILL.md` replace the line `Done! Using ultrapowers:finishing-a-development-branch.` with `Done! Using ultrapowers:task-review for <ID>, then ultrapowers:finishing-a-development-branch.`

- [ ] **Step 4: Two rationalization rows, in each file**

Append at the end of `skills/subagent-driven-development/SKILL.md`'s Common Rationalizations table:

```markdown
| "Every task got a review and the final review is clean, so the whole-ticket review is a repeat" | The per-task and final reviews check the plan's work. task-review reads the whole ticket with its callers, runs the vulnerability hunt and the QA gate. It is the gate; run it. |
| "QA needs the stack up and my partner is in a hurry, so straight to the menu" | task-review confirms its scope with your human partner before it reads anything; a deferral is theirs to say there. The menu comes after the verdict. |
```

Append at the end of `skills/executing-plans/SKILL.md`'s Common Rationalizations table (inline execution has no per-task reviews):

```markdown
| "The final review is clean, so the whole-ticket review is a repeat" | The final review checks the plan's work. task-review reads the whole ticket with its callers, runs the vulnerability hunt and the QA gate. It is the gate; run it. |
| "QA needs the stack up and my partner is in a hurry, so straight to the menu" | task-review confirms its scope with your human partner before it reads anything; a deferral is theirs to say there. The menu comes after the verdict. |
```

- [ ] **Step 5: Run the body test**

Run: `bash tests/skills/test-skill-bodies.sh 2>&1 | grep -E '^\s+\[(PASS|FAIL)\] skills/(executing-plans|subagent-driven-development)'`
Expected: every line for the two files is `[PASS]`; `[FAIL]` lines remain only for files later tasks change.

- [ ] **Step 6: Commit**

```bash
git add skills/executing-plans/SKILL.md skills/subagent-driven-development/SKILL.md
git commit -m "feat(execution): the ticket form hands off to task-review before the finish

Both execution skills ended at finishing-a-development-branch and named
no gate; the whole-ticket review, the hunt and the QA gate ran only on
request. Spec 2026-10-13, D1.

RAOOF A."
```

---

### Task 4: The door in finishing-a-development-branch

**Files:**
- Modify: `skills/finishing-a-development-branch/SKILL.md` (line 10 the core principle; after line 26 the new Step 1b; lines 53-82 Step 4; lines 113-126 Option 2; lines 203-210 Quick Reference; lines 212-225 Common Rationalizations)

**Interfaces:**
- Consumes: the phrases of Task 1; `reviews/<ID>/TASK-REVIEW.md` as `assemble-review.mjs` writes it (the `Repositories` row `<repo>: <branch> against <base> at <head>`, twelve-character head; the `Verdict:` line; the Summary counts).
- Produces: scenarios C, D, E and F GREEN runs in Task 8 read this file.

- [ ] **Step 1: The core principle**

Replace `**Core principle:** Verify tests → Detect environment → Present options → Execute choice → Clean up.` with `**Core principle:** Verify tests → Verify the whole-ticket review → Detect environment → Present options → Execute choice → Clean up.`

- [ ] **Step 2: Step 1b**

Insert after the line `**If tests pass:** continue to Step 2.` (and its following blank line), verbatim:

```markdown
## Step 1b: Verify the Whole-Ticket Review

This step runs in the ticket form: `.agents/ultrapowers.json` exists at or
above the working directory, the autopilot form does not apply, and the
ticket id is known: from the conversation, else from the plan path
`plans/<ID>/`, else from the branch name matched against the `tasks/`
folders (the id at the start of the branch name or after a separator).
Outside it, continue to Step 2.

Read `reviews/<ID>/TASK-REVIEW.md` under the project root, the checkout
that holds this branch. Its `Repositories` row names each branch and the
head it was reviewed at; take the entry whose branch is this branch, or
whose head matches when `HEAD` is detached. The report is current when
that head is an ancestor of `HEAD` (`git merge-base --is-ancestor <head>
HEAD`) and every commit since it touches only `reviews/<ID>/`
(`git diff --name-only <head> HEAD` lists nothing else).

| State | Do |
|-------|----|
| The file is missing | Run `ultrapowers:task-review <ID>` from this workspace. The menu comes after its verdict, as it comes after a green suite. |
| The report is not current | The verdict is stale: name the reviewed head and `HEAD`, then run `ultrapowers:task-review <ID>` again. |
| The report is current | The whole-ticket review stands. Keep the `Verdict:` line and the Summary counts for Step 4. |
| task-review stopped before a verdict (`NO-WORK`, `NO-CODE`, an `ERROR` line) | Keep its last message as the gate's result for Step 4. |

The verdict informs the integration decision; it never makes it. Only your
human partner's instruction to skip the gate, in so many words, skips it;
then the menu message says the whole-ticket review was skipped at their
request. A hurry, a demo, or "every task was reviewed" is not that
instruction.
```

- [ ] **Step 3: Step 4, the gate above the menu**

Insert directly after the heading `## Step 4: Present Options` (and its blank line), before `**Normal repo and named-branch worktree — present exactly these 3 options:**`:

```markdown
In the ticket form, the whole-ticket review's result comes first, above
either menu, in two lines: the `Verdict:` line of
`reviews/<ID>/TASK-REVIEW.md` and its finding counts, or task-review's last
message when it stopped before a verdict. On `FAIL` or `BLOCKED`, the pull
request option reads `Push and create a draft Pull Request` (option 2, or
option 1 on a detached HEAD) and Option 2 below opens it as a draft. That
wording swap is the only change the menus take.
```

- [ ] **Step 4: Option 2, the draft**

Insert after the paragraph that ends `and report the URL to your human partner.` in `### Option 2: Push and Create PR`:

```markdown
In the ticket form the description quotes the `Verdict:` line of
`reviews/<ID>/TASK-REVIEW.md`, or says that the whole-ticket review was
skipped at your human partner's request. On a `FAIL` or `BLOCKED` verdict the pull
request is a draft: `gh pr create --draft`, `glab mr create --draft`, or the
forge's draft setting.
```

- [ ] **Step 5: The Quick Reference row**

Add after the row `| 2. Create PR | - | yes | yes | - |`:

```markdown
| 2. Create PR, verdict FAIL or BLOCKED | - | yes, as a draft | yes | - |
```

- [ ] **Step 6: Four rationalization rows**

Append at the end of the Common Rationalizations table:

```markdown
| "Every task got a review, so the whole-ticket gate is done" | Per-task reviews check the plan's work. task-review reads the whole ticket with its callers, runs the vulnerability hunt and the QA gate. Without its verdict, the gate did not run. |
| "They are in a hurry and QA takes an hour" | A hurry is not an instruction to skip. task-review confirms its scope first; a deferral is your human partner's to say, in so many words. |
| "The verdict is FAIL, so I'll refuse to open the pull request" | The verdict informs; your human partner decides. Show it above the menu; the pull request opens as a draft. |
| "The report exists, so the gate stands" | A report for another head reviewed other code. Compare the head; a stale verdict means task-review runs again. |
```

- [ ] **Step 7: Run the body test**

Run: `bash tests/skills/test-skill-bodies.sh 2>&1 | grep -E 'finishing'`
Expected: every `finishing` line is `[PASS]`.

- [ ] **Step 8: Commit**

```bash
git add skills/finishing-a-development-branch/SKILL.md
git commit -m "feat(finishing): verify the review gate before the menu

In the ticket form the finishing skill reads reviews/<ID>/TASK-REVIEW.md
after the suite: missing or stale, task-review runs first; present, the
verdict shows above the menu, and FAIL or BLOCKED makes the pull request
a draft. The decision stays with the partner. Spec 2026-10-13, D2, D3.

RAOOF A."
```

---

### Task 5: The map, the trigger and the position

**Files:**
- Modify: `skills/using-ultrapowers/SKILL.md` (insert a section between `## Skill Priority` and `## Red Flags`)
- Modify: `skills/task-review/SKILL.md:3` (the description) and the end of Step 5 (line 69)
- Modify: `skills/task/SKILL.md:41` (Step 3 item 4)

**Interfaces:**
- Consumes: the phrases of Task 1.
- Produces: scenarios G and H GREEN runs in Task 8 read `using-ultrapowers` and `task`.

- [ ] **Step 1: The map**

Insert after the line `- "Fix this bug" → ultrapowers:systematic-debugging first, then domain skills.` and its blank line, before `## Red Flags`:

```markdown
## The Ticket Route

With `.agents/ultrapowers.json` present, a ticket runs: init → new-task → brainstorm-task → writing-plans → subagent-driven-development or executing-plans (worktree, TDD, reviews) → task-review (code review, vulnerability hunt, QA gate: one verdict) → finishing-a-development-branch. From new-task on, each skill names the next; `task` reports where a ticket stands. A merge or a pull request goes through finishing-a-development-branch, which checks for the task-review verdict first.

```

Verify: `sed -n '/^## The Ticket Route$/,/^## Red Flags$/p' skills/using-ultrapowers/SKILL.md | grep -v '^#' | wc -w` prints at most 60.

- [ ] **Step 2: The trigger**

Replace line 3 of `skills/task-review/SKILL.md` with:

```yaml
description: Use when a ticket's implementation is complete, before its branch is merged or opened as a pull request, or when your human partner wants the whole of its work reviewed, with one verdict and a report in reviews/<ID>/TASK-REVIEW.md that can be posted to the tracker
```

Append to the end of Step 5's paragraph (after `in four lines at most.`), as a new sentence in the same paragraph: `Name ultrapowers:finishing-a-development-branch as the next step on the ticket route: it shows this verdict above its menu. Do not invoke it; the branch is finished when your human partner says so.`

- [ ] **Step 3: The position**

In `skills/task/SKILL.md` replace `4. **Next step**, in order.` with:

```markdown
4. **Next step**, in order, on the ticket route: brief, spec, plan, the branch with its work, `reviews/<ID>/TASK-REVIEW.md` (the whole-ticket review with the vulnerability hunt and the QA gate), then the finish. A ticket whose plan tasks are all done and whose branch has no `TASK-REVIEW.md` is at the whole-ticket review.
```

- [ ] **Step 4: Run the body test and the structure suites**

Run: `bash tests/skills/test-skill-bodies.sh 2>&1 | grep -E 'using-ultrapowers|task-review|skills/task/'`
Expected: all `[PASS]`.
Run: `bash tests/task-lifecycle/test-skill-structure.sh && bash tests/task-lifecycle/test-task-review.sh`
Expected: both end with `PASS`.

- [ ] **Step 5: Commit**

```bash
git add skills/using-ultrapowers/SKILL.md skills/task-review/SKILL.md skills/task/SKILL.md
git commit -m "feat(route): the bootstrap maps the ticket route; task-review triggers before the finish; task names the gate

Spec 2026-10-13, D4, D5, D6.

RAOOF A."
```

---

### Task 6: The README

**Files:**
- Modify: `README.md` (the How it works paragraph that begins `When the work is done`; the Manual row of Three ways to work; Basic Workflow steps 5, 8, 9 and 11)

**Interfaces:**
- Consumes: the phrases of Task 1.
- Produces: nothing a later task reads.

- [ ] **Step 1: How it works**

Replace the sentence `When the work is done, a vulnerability hunt reads the change for known CVEs, secrets and insecure patterns, and a QA agent tests the running app the way a senior human tester would, in a real browser; each leaves one verdict in the ticket's review folder.` with:

`When the work is done and before the branch is finished, the whole-ticket review runs: a fresh reviewer reads the whole change with its callers, a vulnerability hunt reads it for known CVEs, secrets and insecure patterns, and a QA agent tests the running app the way a senior human tester would, in a real browser; one verdict lands in the ticket's review folder, and the finishing skill shows it above its merge menu.`

- [ ] **Step 2: The Manual row**

In the Three ways to work table, replace `Reads your code, drafts spec and plan, codes test-first, reviews each task.` with `Reads your code, drafts spec and plan, codes test-first, reviews each task, runs the whole-ticket review before the finish.`

- [ ] **Step 3: Step 5 of the Basic Workflow**

Append to the end of step 5's paragraph: ` In a ticket project, both hand off to task-review (step 9) and then to finishing-a-development-branch (step 11).`

- [ ] **Step 4: Step 8**

Append to the end of step 8's paragraph, after one space:

```markdown
task-review (step 9) runs it for you as its last part; run it alone to re-run only the QA gate after a fix, which refreshes `QA-REPORT.md` and not the task-review verdict, which comes from its own run.
```

- [ ] **Step 5: Step 9**

Append to the end of step 9's paragraph: ` The execution skills hand off to it at the end of the work, and the finishing skill (step 11) runs it when the verdict is missing or was written for an earlier commit.`

- [ ] **Step 6: Step 11**

Replace the sentences `Activates when tasks complete. Verifies tests, offers to merge, open a pull request or keep the branch, and cleans up the worktree.` with:

```markdown
Activates when tasks complete. Verifies tests; then, in a ticket project, reads `reviews/<ID>/TASK-REVIEW.md`: missing or written for an earlier commit, it runs task-review first; present, it shows the verdict above its menu, and a FAIL or BLOCKED verdict makes the pull request a draft. Offers to merge, open a pull request or keep the branch, and cleans up the worktree.
```

- [ ] **Step 7: Run the body test**

Run: `bash tests/skills/test-skill-bodies.sh 2>&1 | grep -E 'README'`
Expected: both README lines `[PASS]`.

- [ ] **Step 8: Commit**

```bash
git add README.md
git commit -m "docs(readme): the basic workflow passes through task-review before the finish

RAOOF A."
```

---

### Task 7: The release notes

**Files:**
- Modify: `RELEASE-NOTES.md` (the v2.2.0 entry, lines 3-40)

**Interfaces:**
- Consumes: the phrase `The ticket route and the review gate` from Task 1.
- Produces: nothing a later task reads.

- [ ] **Step 1: The first paragraph**

Append to the end of the v2.2.0 opening paragraph (after `itself the first spec in the new shape.`), after one space:

```markdown
The same release closes the gap in the ticket route: the execution skills hand off to `task-review` before the finish, and the finishing skill verifies that gate at the door. Design: `docs/ultrapowers/specs/2026-10-13-ticket-route-and-review-gate-design.md`.
```

- [ ] **Step 2: A Heads up bullet**

Add as the last bullet of the **Heads up:** list:

```markdown
- In a ticket project, `finishing-a-development-branch` now reads `reviews/<ID>/TASK-REVIEW.md` after the test suite: missing, or written for another head, it runs `task-review` (the code review, the vulnerability hunt and the QA gate) before its menu; present, it quotes the verdict above the menu, and a `FAIL` or `BLOCKED` verdict makes the pull request a draft. Your explicit instruction to skip the gate still skips it. The decision stays yours.
```

- [ ] **Step 3: The section**

Insert before the line `**Harness parity**` of the v2.2.0 entry:

```markdown
**The ticket route and the review gate**

- `subagent-driven-development` and `executing-plans` end, in the ticket form, with `task-review` for the ticket and then `finishing-a-development-branch`; outside it, with the finishing skill as before; in the autopilot form they return to the engine as before. Their flowcharts, Finish sections, example end messages and rationalization tables say so.
- `finishing-a-development-branch` has a Step 1b, Verify the Review Gate: the report missing or stale (its `Repositories` entry names a head other than this branch's) runs `task-review`; a current one is quoted above the menu with its counts; a `task-review` that stopped before a verdict leaves its reason above the menu. On `FAIL` or `BLOCKED`, option 2 reads "Push and create a draft Pull Request" and opens a draft (`gh pr create --draft`, `glab mr create --draft`) whose description quotes the verdict line. Four new rationalization rows.
- `using-ultrapowers` carries the route in sixty words, "The Ticket Route", and sends a merge or a pull request through the finishing skill. `task-review` triggers on its own when a ticket's implementation is complete and its branch is about to be merged or opened as a pull request, and names the finishing skill as the next step without invoking it. `task` reports a ticket branch with work and no `TASK-REVIEW.md` as "at the review gate".
- The README's How it works and Basic Workflow follow the same route and say that `task-review` includes the QA gate; running `qa-specialist` alone refreshes `QA-REPORT.md` only.
- Not changed: the autopilot engine, which runs `qa` and no hunt stage (issue 43); projects without a scaffold, where the gates refuse to run.
```

- [ ] **Step 4: Harness parity and Tests**

Append to the **Harness parity** bullet of v2.2.0: ` The ticket route and the review gate touch skill prose, the README and one bash test; no harness-specific surface, and the Muse skill list is unchanged.`

Add to the **Tests** list of v2.2.0:

```markdown
- `tests/skills/test-skill-bodies.sh` gains the section "the ticket route reaches the review gate", written before the change and failing on it; `tests/skills/lifecycle-gates-pressure-scenarios.md` and `lifecycle-gates-pressure-results.md` hold the eight scenarios and their RED and GREEN runs.
```

- [ ] **Step 5: Run the body test**

Run: `bash tests/skills/test-skill-bodies.sh 2>&1 | tail -3`
Expected: `PASS`.

- [ ] **Step 6: Commit**

```bash
git add RELEASE-NOTES.md
git commit -m "docs(release-notes): 2.2.0 carries the ticket route and the review gate

RAOOF A."
```

---

### Task 8: The GREEN runs and the gate

**Files:**
- Modify: `tests/skills/lifecycle-gates-pressure-results.md` (the GREEN half)

**Interfaces:**
- Consumes: the scenarios file of Task 2, unchanged; the changed skills of Tasks 3 to 5.
- Produces: the evidence the Definition of done names.

- [ ] **Step 1: Run the GREEN batch**

The orchestrator dispatches fresh Sonnet 5.5 subagents with the same prompts as Task 2 Step 2, reading the changed files: three runs each for C, D, E and F, two each for A and B, one each for G and H. Save each as `scratchpad/gates/GREEN-<letter>-<n>.md`.
Two more runs: the autopilot scenario C2 of `tests/autopilot/pressure-scenarios.md` once on the new Finish paragraph (the agent must return to the autopilot skill, with no task-review and no menu), and one description-only micro-test: a Haiku 5.5 subagent shown the skill list's descriptions and a mid-plan state (two of four tasks done, a task just committed) asked which skill applies next; it must not pick `task-review`.
Expected: every run shows the GREEN behaviour its scenario names; every D run proceeds and records the skip; C2 returns to autopilot; the micro-test does not pick `task-review`. A run that does not is a loophole: the orchestrator adds the counter the run's own words call for to the skill (one more rationalization row, or one clause on the step), records the wording in the results file, and reruns that scenario until three runs in a row pass.

- [ ] **Step 2: Complete the results file**

Add one `## <letter>, GREEN` section per run, verbatim excerpts and Observations as in Task 2 Step 3, and a closing `## Summary` table: scenario, RED behaviour, GREEN behaviour, reps, result.

- [ ] **Step 3: The gate**

Run, from the worktree root, and record each outcome:

```bash
bash tests/skills/test-skill-bodies.sh
bash tests/task-lifecycle/test-skill-structure.sh
bash tests/task-lifecycle/test-task-review.sh
bash tests/task-lifecycle/test-task-lifecycle.sh
bash tests/diagnosing-ultrapowers/test-skill-structure.sh
bash tests/claude-code/test-executing-plans-scripts.sh
bash tests/claude-code/test-sdd-workspace.sh
bash tests/autopilot/run-tests.sh
bash scripts/bump-version.sh --audit
bash scripts/lint-shell.sh --all
```

Expected: every suite ends with `PASS` (or its own success line), the audit ends with `All clear`, the lint reports nothing. The guardrail fixture suites are not run: no hook changed.

- [ ] **Step 4: Commit**

```bash
git add tests/skills/lifecycle-gates-pressure-results.md
git commit -m "test(skills): lifecycle-gates GREEN runs

RAOOF A."
```

---

### Task 9: Merge to dev

**Files:** none new.

- [ ] **Step 1: Merge**

From the main checkout `S:/ultrapowers` on `dev`: `git merge --no-ff fix/lifecycle-gates -m "merge: the ticket route and the review gate (2.2.0)"` with the attribution line; then `git push origin dev`.
Expected: the push is accepted; `gh pr view 58 --json commits --jq '.commits | length'` grows by the branch's commit count plus one.

- [ ] **Step 2: Update the pull request**

`gh pr edit 58 --body-file <the current body with one added paragraph naming "The ticket route and the review gate" and the spec path>`.
Expected: `gh pr view 58` shows the paragraph; CI runs on the new head.

- [ ] **Step 3: Hand over the article edits**

In chat, the two sentences for the owner's site: step 6 as "re-run only the QA gate after a fix" and the secrets sentence without "hash prefix".
