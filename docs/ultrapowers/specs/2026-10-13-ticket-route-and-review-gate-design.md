# The ticket route and the review gate

Status: draft, 2026-10-13. Ticket: none.

## Intent

A developer finishes a ticket with `subagent-driven-development` or `executing-plans`. The agent says "Done! Using ultrapowers:finishing-a-development-branch" and presents the merge menu. The whole-ticket review (`task-review`), the vulnerability hunt and the QA gate never ran: no skill in the chain names them, and their own descriptions wait for a request from your human partner. The README's Basic Workflow and the two published articles ("AI-Native SDLC with Ultrapowers", "The AI-Native SDLC: A Developer's Playbook") describe a cycle in which those gates run before the branch is finished.

The people in the moment are the developer who expects the gate and the reviewer who later reads a pull request that carries no verdict. Success for them: in a ticket project, the gate runs before the menu on every route to a merge or a pull request; its verdict is on screen above the menu; a failed or blocked verdict turns the pull request into a draft; and the integration decision stays with the human.

## Goals, non-goals and anti-goals

Goals, true when this ships:

- Both execution skills hand off to `ultrapowers:task-review` before `ultrapowers:finishing-a-development-branch` in the ticket form, and say so in their flowcharts, their Finish sections and their example end messages.
- `finishing-a-development-branch` verifies the review gate after the test suite: a missing or stale `reviews/<ID>/TASK-REVIEW.md` runs `task-review` before the menu; a present one is quoted above the menu; a `FAIL` or `BLOCKED` verdict makes option 2 a draft pull request.
- `using-ultrapowers` carries the ticket route as a map, and names the finishing skill as the door for a merge or a pull request.
- `task-review` triggers on its own when a ticket's implementation is complete and its branch is about to be merged or opened as a pull request, and names the finishing skill as the next step without invoking it.
- `task` reports the whole-ticket review as the next step when the plan's tasks are all done and no `TASK-REVIEW.md` exists.
- The README's How it works and Basic Workflow sections describe the same route, and say that `task-review` includes the QA gate.
- The change is proven with a body test that fails first and pressure scenarios on fresh subagents, RED on the text before the change and GREEN after.
- It ships in release 2.2.0, through the open pull request #58 from `dev` to `main`.

Non-goals, left out on purpose:

- The autopilot engine's stage order. It runs `qa` and no hunt and no whole-ticket review; the hunt stage is issue 43 and stays there.
- Projects without `.agents/ultrapowers.json`. The three gates refuse to run there (exit 3, offer init), so the chain outside the ticket form is unchanged.
- A partial re-run of `task-review`. After a fix, a full run repeats the code review; running `qa-specialist` alone refreshes `QA-REPORT.md` only. The README gains a sentence that says so; the mechanism is not changed.
- The descriptions of `qa-specialist` and `vulnerability-hunt`. `task-review` invokes them by name.
- The two articles on the owner's website. Their edits are handed over in chat, since the site is not in this repository.

Anti-goals, a failure even if it works:

- An agent that refuses a merge or a pull request on its own. The verdict informs; the human decides.
- A bootstrap that grows by more than about sixty words, since it loads in every session on every harness.
- A `task-review` trigger that fires while a task of the plan completes, instead of when the ticket's implementation is complete.
- A second vocabulary for the gate ("sign-off", "approval") beside the existing words: the review gate, the verdict, `TASK-REVIEW.md`.

## Constraints

- AGENTS.md rule 2: skill bodies are code; every edit is the smallest wording that closes the gap, with evidence from pressure scenarios. Rule 3: the change goes through `ultrapowers:writing-skills`, RED before GREEN. Rule 4: the names `ultrapowers:<skill>`, `.ultrapowers/`, `.agents/ultrapowers.json`. Rule 8: one concern per commit. Rule 9: the change touches no harness-specific surface; the record of that is in the release notes.
- Zero dependencies: prose, a bash test, and one node-built-ins change to `assemble-review.mjs` with its node test (D8).
- The version stays 2.2.0 and the release notes entry for v2.2.0 gains a section. `scripts/bump-version.sh --audit` must still end with "All clear". No file under `templates/` changes, so `templates/CHANGES.json` is untouched.
- The ticket form, as this change words it: `.agents/ultrapowers.json` exists at or above the working directory, the ticket id is known, and the autopilot form does not apply. The autopilot form is the predicate the execution skills already use: `.ultrapowers/autopilot-active` exists, or the autopilot skill invoked the stage. The id is known from the conversation, else from the plan path `plans/<ID>/`, else from the branch name matched against the `tasks/` folders with `ticket_branch_match` of `skills/new-task/scripts/ticket-lib.sh`.
- The gate's name in every new sentence is "the whole-ticket review", the README's own phrase for `task-review` (step 9); "the review gate" already names the per-task review in README step 7, `executing-plans` and the autopilot execute prompt, and is not reused.
- A skill description starts with "Use when", states triggering conditions only, stays under 1024 characters, and never summarises the workflow (writing-skills, Skill Discovery Optimization).
- A skill body writes `$ARGUMENTS` at most once and no `$<digit>` token, and never prints a variable's value (`tests/skills/test-skill-bodies.sh`).
- Shell files stay LF (`.gitattributes`). The body test is bash and passes `scripts/lint-shell.sh --all`.
- The finishing skill's menu rule stands: "Present the menu exactly as written"; the only sanctioned change to it is the option 2 wording on `FAIL` or `BLOCKED`.

## Decision record

### D1: Two touchpoints and a map
- **Chosen:** the execution skills hand off to `task-review` before the finish (the hand-off), the finishing skill verifies the gate at the door (the door), and `using-ultrapowers` names the whole route (the map).
- **Why this one:** the gate must run on every route; the hand-off covers the normal route and the door covers work that arrives another way, while the map lets the agent plan a session around the gate instead of meeting it as a surprise. Evidence: `skills/subagent-driven-development/SKILL.md:487` and `skills/executing-plans/SKILL.md:327`, the only hand-off today, name the finishing skill and nothing else; `skills/finishing-a-development-branch/SKILL.md:14-26` already verifies before the menu ("the menu comes after a green suite"); writing-skills, "Match the Form to the Failure", a conditional keyed to an observable predicate for the door and rationalization rows for the pressure case.
- **Rejected:** the door check alone, because the execution skills would still end with "Done! Using ultrapowers:finishing-a-development-branch" and the gate would be a surprise at the menu with one point of enforcement. Evidence: `skills/executing-plans/SKILL.md:400`, `skills/subagent-driven-development/SKILL.md:570`.
- **Rejected:** the hand-off alone, because work done by hand or a partner who invokes the finishing skill directly skips the gate. Evidence: `skills/finishing-a-development-branch/SKILL.md:3`, whose description fires on its own when implementation is complete.
- **Rejected:** a guardrail rule that denies `git push` without a report, because the guardrail is inert outside a run marker by design, an always-on hook is a new surface on every harness, and a machine block contradicts "you choose and you merge". Evidence: AGENTS.md, the `hooks/` row ("inert unless one of those markers exists"); AGENTS.md rule 9; the article "AI-Native SDLC with Ultrapowers", step 8.
- **Failure points:** a partner who types "open a PR" and names no skill can bypass skills entirely; the map's last sentence routes a merge or a pull request through the finishing skill, which checks the gate. Evidence: `skills/using-ultrapowers/SKILL.md:20`, the rule that relevant skills are invoked before any action. A second failure point: the hand-off adds a heavy run, since the QA gate needs the stack up; `task-review` confirms the repository set with your human partner before it reads anything, so a deferral is theirs to say there. Evidence: `skills/task-review/SKILL.md:45`.
- **Edge cases:** the autopilot form is unchanged, since the engine's `qa` stage and the pull request step are its own; the execution skills already branch on that predicate. Evidence: `skills/autopilot/SKILL.md:10`, `skills/executing-plans/SKILL.md:327-330`. No scaffold or no ticket id: the predicate is false and the chain is unchanged. Evidence: `skills/qa-specialist/SKILL.md:51` (exit 3), `skills/vulnerability-hunt/SKILL.md`, Step 2 (exit 3), both offer init. An explicit "skip the review gate" from your human partner: the finishing skill proceeds and says so in the menu message. Evidence: `skills/using-ultrapowers/SKILL.md:74`, user instructions take precedence over skills.

### D2: The verdict informs; a FAIL or BLOCKED verdict makes the pull request a draft
- **Chosen:** the finishing skill quotes the `Verdict:` line and the finding counts above the menu; the three options stay; on `FAIL` or `BLOCKED`, option 2 reads "Push and create a draft Pull Request" and opens a draft whose description quotes the verdict line.
- **Why this one:** the human keeps the integration decision, and a draft keeps a failed gate from becoming a normal pull request by accident. Evidence: the article "AI-Native SDLC with Ultrapowers", steps 6 and 8 ("The verdict informs the merge but does not make the decision"; "You choose and you merge"); your human partner's answer in this conversation (the draft option, 2026-10-13).
- **Rejected:** a menu with option 2 removed on `FAIL`, because it makes the agent the decider. Evidence: `skills/finishing-a-development-branch/SKILL.md:217`, "Integration is your human partner's decision".
- **Rejected:** a menu unchanged with the verdict shown only, because a reader of the forge sees a normal pull request with no sign that the gate failed. Evidence: `skills/task-review/SKILL.md:77`, which already opens a draft under `--draft-pr` for the same reason.
- **Failure points:** a forge CLI without a draft flag; the skill names `gh pr create --draft`, `glab mr create --draft`, and "the forge's draft setting" for the rest, and the description still quotes the verdict. Evidence: the builder check ran both CLIs on this machine (gh 2.86.0, glab 1.119.0), and `skills/autopilot/scripts/tracker.mjs:168` already passes `--draft`. On a detached `HEAD` the reduced menu's pull request option is option 1; the draft rule applies to whichever option opens the pull request, and the verdict shows above either menu. Evidence: `skills/finishing-a-development-branch/SKILL.md:67-76`.
- **Edge cases:** `PASS-WITH-ISSUES` opens a normal pull request; its description still quotes the verdict line. Evidence: `skills/task-review/scripts/assemble-review.mjs`, the four verdict words, and your human partner's answer (draft on `FAIL` or `BLOCKED` only).

### D3: The door keys on observable state
- **Chosen:** Step 1b of the finishing skill reads `reviews/<ID>/TASK-REVIEW.md`; missing runs `task-review`; the report is current when the head in its `Repositories` entry for this branch is an ancestor of `HEAD` and every commit since it touches only `reviews/<ID>/`; otherwise it is stale and `task-review` runs again; a `task-review` that stopped before a verdict (`NO-WORK`, `NO-CODE`, an `ERROR` line) leaves its last message as the gate's result above the menu.
- **Why this one:** the report already names each branch's reviewed head, so staleness is a git check, not a judgment, and the check tolerates the one commit the route itself adds after the review: `--post` commits `reviews/<ID>/` onto the branch. Evidence: `skills/task-review/scripts/assemble-review.mjs:57` (`head` sliced to twelve characters) and `:369` (the `Repositories` row); `skills/task-review/scripts/post-review.mjs:320-328` (the documents commit on the checked-out branch).
- **Rejected:** a timestamp comparison between the report and the last commit, because the report's date is UTC wall time and a rebase or an amend moves commits without moving the date. Evidence: `skills/task-review/templates/TASK-REVIEW.md`, the "Date (UTC)" row.
- **Rejected:** strict equality of the reviewed head and `HEAD`, because a `--post` commit or a hand commit of the report would then force a full second review. Evidence: the builder check of this spec, question 4, with `post-review.mjs:320-328`.
- **Rejected:** treating any present report as current, because a report for another head reviewed other code. My call: the git check costs two commands and removes a silent false pass.
- **Failure points:** a ticket with several repositories has several entries; the finishing skill runs in one repository and takes the entry whose branch is this branch, or whose head matches when `HEAD` is detached. Evidence: `skills/task-review/scripts/assemble-review.mjs:369`, one entry per repository, joined by semicolons; `skills/finishing-a-development-branch/SKILL.md:67-76`, the detached menu.
- **Edge cases:** `task-review` reports `NO-CODE` when a spec exists and no repository is on a ticket branch, and `NO-WORK` when there is no spec either; the finishing skill shows that reason above the menu and the menu still comes. Evidence: `skills/task-review/scripts/review-preflight.sh:110-112`. A rebase moves every sha; the reviewed head is then no ancestor and the review runs again, which is the safe side. My call: a rebase after the review is rare, and the cost is a re-run, never a false pass.

### D4: task-review triggers on its own; QA and the hunt stay request skills
- **Chosen:** the `task-review` description becomes "Use when a ticket's implementation is complete, before its branch is merged or opened as a pull request, or when your human partner wants the whole of its work reviewed, with one verdict and a report in `reviews/<ID>/TASK-REVIEW.md` that can be posted to the tracker". The `qa-specialist` and `vulnerability-hunt` descriptions do not change.
- **Why this one:** `task-review` is the one gate that contains the other two, and its body invokes them by name, so one automatic trigger is enough. Evidence: `skills/task-review/SKILL.md:55-61` (Step 3b runs the hunt, Step 4 runs the QA gate).
- **Rejected:** automatic triggers on all three, because an agent then runs the QA gate or the hunt alone at the end of a task, outside the review that assembles the verdict. Evidence: writing-skills, Skill Discovery Optimization, a description that fires too early is followed instead of the body.
- **Failure points:** the trigger could fire when a single task of the plan completes; the wording says "a ticket's implementation is complete", and scenario A checks that the execution skill, not the description, drives the hand-off. Evidence: the pressure scenarios in `tests/skills/lifecycle-gates-pressure-scenarios.md`, scenario A.
- **Edge cases:** a partner who asks for the review alone still gets it; the current trigger, "your human partner wants the whole of its work reviewed", is kept as the second clause. Evidence: `skills/task-review/SKILL.md:3`. The description stays on line 3 and the Checklist stays at nine items, which `tests/task-lifecycle/test-skill-structure.sh` pins; the next-step sentence lives in Step 5's prose. Evidence: that test.

### D5: task-review names the finishing skill and never invokes it
- **Chosen:** Step 5 of `task-review` ends by naming `ultrapowers:finishing-a-development-branch` as the next step on the route, and says that the branch is finished when your human partner says so.
- **Why this one:** `task-review` is read-only and never merges; a partner who ran it alone may want fixes before the finish, and the execution skills invoke the finishing skill themselves after the review returns. Evidence: `skills/task-review/SKILL.md:24-25` (read-only, never merge); D1.
- **Rejected:** `task-review` invoking the finishing skill after the verdict, because a standalone review would then push its partner toward the menu. My call: the caller owns the next step.
- **Failure points:** an agent that ran `task-review` by hand forgets the finish; the map and the `task` skill both name it as the next step. Evidence: D1; `skills/task/SKILL.md:41`.
- **Edge cases:** in the autopilot form `task-review` is not on the route and nothing here runs. Evidence: `skills/autopilot/SKILL.md:10`.

### D6: The map is sixty words in the bootstrap
- **Chosen:** a section "The Ticket Route" in `using-ultrapowers`, one arrow line from init to the finish, "from new-task on, each skill names the next" (init names no successor), and the sentence that a merge or a pull request goes through the finishing skill, which checks the verdict first; about sixty words.
- **Why this one:** the bootstrap loads in every session on every harness and is 620 words today; a map helps the agent plan, and the enforcement lives in the hand-off and the door, not here. Evidence: `wc -w skills/using-ultrapowers/SKILL.md` (620); writing-skills, Token Efficiency.
- **Rejected:** a rationalization row in the bootstrap's Red Flags table for "the per-task reviews were the gate", because that pressure arises at the door, and the row belongs in the finishing skill's table. My call: keep the bootstrap a router.
- **Failure points:** a map that drifts from the skills; the body test checks that the map names `task-review` and the finishing skill. Evidence: `tests/skills/test-skill-bodies.sh`, the `expect` helper.
- **Edge cases:** Codex, Gemini CLI, Kimi Code and Devin read the same bootstrap through their adapters, so the map reaches every harness without a per-harness change. Evidence: `skills/using-ultrapowers/SKILL.md:64-68`, Project Scaffold.

### D7: Same release
- **Chosen:** no version bump; the v2.2.0 entry of `RELEASE-NOTES.md` gains the section "The ticket route and the review gate" and one Heads up bullet; the branch merges to `dev`, and pull request #58 carries it.
- **Why this one:** the change corrects an omission in the shipped cycle, and your human partner asked for one release. Evidence: your human partner's words in this conversation ("I don't want to do two releases", 2026-10-13).
- **Rejected:** 2.3.0, because a second release for a correction of the same cycle costs a second review and a second upgrade for every project. Evidence: the same words.
- **Failure points:** the release notes' first paragraph describes 2.2.0 as the template release; one added sentence names the route. My call: one sentence, no restructuring.
- **Edge cases:** PR #58 is merged before this branch reaches `dev`; then the work is a 2.2.1 patch with its own notes, decided with your human partner at that moment. Evidence: `gh pr view 58`, open and mergeable at the time of writing.

### D8: A project with no QA configured gets a verdict, not BLOCKED
- **Chosen:** `assemble-review.mjs` mirrors the engine's `qaConfigured` rule (a `qa.urls` value that is a non-blank string): with no QA report and no QA configured, the verdict comes from the code review and the vulnerability hunt, and the report names "QA: not configured for this project"; with QA configured and no report, `BLOCKED` stays.
- **Why this one:** the door would otherwise end every ticket of such a project in `BLOCKED` and every pull request as a draft, since the assembler returns `BLOCKED` whenever there is no QA report and a blank `qa` never produces one; the engine already skips the stage in that state. Evidence: `skills/task-review/scripts/assemble-review.mjs:260-263`; `skills/autopilot/scripts/autopilot.mjs:360-363` and `autopilot-lib.mjs:551`; `templates/.agents/ultrapowers.json.tmpl:16-30` (blank `qa` in every scaffold); your human partner's answer in this conversation ("approved the recommendation", 2026-10-13).
- **Rejected:** a door-only rule that reads a `BLOCKED` from "no QA configured" as a normal pull request, because the verdict word on the report would still be wrong and every reader of the report would have to know the carve-out. Evidence: the builder check of this spec, question 1.
- **Failure points:** a project that configures QA later keeps old reports with "QA: not configured"; the head check of D3 does not see that, so a stale QA state survives until the next review. My call: a configuration change is rare, and the next `task-review` run after it runs the gate.
- **Edge cases:** QA configured but the stack down: `PRECONDITION-FAILED` and `BLOCKED`, unchanged. Evidence: `assemble-review.mjs:260-263`. The default of the new option is "configured", so every existing caller and test keeps today's behaviour. My call: the safe default.

### D9: Evidence by pressure scenarios, RED before any edit
- **Chosen:** a body test block in `tests/skills/test-skill-bodies.sh` that fails on the current text; eight scenarios in `tests/skills/lifecycle-gates-pressure-scenarios.md`, run on fresh subagents that read only the named skill file and simulate the partner; results with verbatim excerpts in `tests/skills/lifecycle-gates-pressure-results.md`; RED runs on the text before the change, GREEN runs after.
- **Why this one:** rule 3 asks for subagents under pressure with before and after evidence, and the writing-skills Iron Law forbids an edit without a failing test first. Evidence: AGENTS.md rule 3; writing-skills, "The Iron Law"; `tests/skills/brainstorming-pressure-results.md`, the method of the previous round.
- **Rejected:** academic review of the wording alone, because reading is not using. Evidence: writing-skills, "Common Rationalizations for Skipping Testing".
- **Failure points:** a simulated partner is weaker than a live session; the scenarios check the hand-off and the door, not the quality of a review. Evidence: `tests/skills/brainstorming-pressure-results.md`, the same caveat in the previous round.
- **Edge cases:** scenario D, the explicit skip, must proceed on both texts; it is the control against over-firing. My call: one control scenario is enough for a conditional with one exception.

## Architecture

Seven units, each with one purpose:

- The map: `skills/using-ultrapowers/SKILL.md`, a section that names the route. Read by every session.
- The hand-off: `skills/subagent-driven-development/SKILL.md` and `skills/executing-plans/SKILL.md`, the Finish section, the flowchart and the example end message, which name `task-review` then the finishing skill in the ticket form.
- The door: `skills/finishing-a-development-branch/SKILL.md`, Step 1b and the menu rule, which verify the gate and show the verdict.
- The trigger: `skills/task-review/SKILL.md`, the description and the last line of Step 5.
- The position: `skills/task/SKILL.md`, the next-step rule.
- The documents: `README.md` (How it works, Three ways to work, Basic Workflow steps 5, 8, 9 and 11) and `RELEASE-NOTES.md` (v2.2.0).
- The evidence: `tests/skills/test-skill-bodies.sh`, `tests/skills/lifecycle-gates-pressure-scenarios.md`, `tests/skills/lifecycle-gates-pressure-results.md`.

They talk through two interfaces others depend on: the predicate of the ticket form, and the file `reviews/<ID>/TASK-REVIEW.md` with its `Verdict:` line and `Repositories` row, written by `assemble-review.mjs` and read by the door.

## Components

- `skills/using-ultrapowers/SKILL.md`: a new section "The Ticket Route" between Skill Priority and Red Flags, about sixty words.
- `skills/executing-plans/SKILL.md`: the flowchart gains a diamond "Ticket form?" between "Final review clean" and the finishing node, with a `task-review` box on the yes edge; the Finish paragraph names `task-review` then the finishing skill in the ticket form, the finishing skill directly outside it, and keeps the autopilot sentence; the example end message reads `Using ultrapowers:task-review for <ID>, then ultrapowers:finishing-a-development-branch.`; the Common Rationalizations table gains two rows (the per-task reviews as the gate; the stack and the hurry).
- `skills/subagent-driven-development/SKILL.md`: the same four changes; its first rationalization row speaks of the per-task and final reviews, while `executing-plans`, which has no per-task reviews, speaks of the final review only.
- `skills/finishing-a-development-branch/SKILL.md`: the core principle gains "Verify the review gate"; a new Step 1b after Step 1 with the predicate, the read, a four-row state table and the skip rule; Step 4 gains the two lines above the menu and the option 2 wording on `FAIL` or `BLOCKED`; Option 2 gains the draft flags and the quoted verdict; the Quick Reference gains a row; Common Rationalizations gains four rows.
- `skills/task-review/SKILL.md`: the description; Step 5 ends with the next-step sentence.
- `skills/task/SKILL.md`: Step 3 item 4 names the route and the gate.
- `README.md`: the How it works paragraph names the whole-ticket review and the finishing skill's verdict line; the Manual row of Three ways to work adds the whole-ticket review; steps 5, 8, 9 and 11 of the Basic Workflow gain one or two sentences each.
- `RELEASE-NOTES.md`: v2.2.0 gains one sentence in its first paragraph, one Heads up bullet, the section "The ticket route and the review gate", a Harness parity line, and a Tests line.
- `tests/skills/test-skill-bodies.sh`: a new section of `expect` lines and two negative checks.
- `tests/skills/lifecycle-gates-pressure-scenarios.md`, `tests/skills/lifecycle-gates-pressure-results.md`: new.

## Data flow

Enters the door: the presence of `.agents/ultrapowers.json`, the ticket id, `reviews/<ID>/TASK-REVIEW.md` (its `Verdict:` line, the counts of its Summary, the head in its `Repositories` entry for this branch), and `git rev-parse HEAD`. Leaves the door: two lines above the menu, the option 2 wording, the draft flag, and a pull request description that quotes the verdict line. Stored: nothing new; the report is `task-review`'s, and the finishing skill writes no file.

Across a boundary: the pull request creation already crosses to the forge through its CLI; the verdict line is the only added content, and it is the project's own text. No network call is added; no secret is read.

## Error handling

- The report is missing: `task-review` runs; the menu comes after its verdict. Never silent.
- The report names another head: the message names both heads and `task-review` runs again.
- `task-review` stops before a verdict (`NO-WORK`, `NO-CODE`, an `ERROR` line): its last message is the gate's result above the menu; the menu still comes, and the decision is your human partner's.
- Your human partner says to skip the gate, in so many words: the skill proceeds, the menu message says the gate was skipped at their request, and a pull request's description says the same, so the forge carries the trace. A hurry, a demo or "every task was reviewed" is not that instruction.
- The autopilot form: nothing in this change runs; the execution skills return to the autopilot skill as before.
- No subagent tool: `task-review` has its inline path and reports what it could not do. No node: its preflight prints an `ERROR` line and the skill stops; that line is the gate's result above the menu.
- A refused push or a failing merged result: unchanged, the existing rows of the finishing skill.

## Testing

- `tests/skills/test-skill-bodies.sh`, a section "the ticket route reaches the review gate (spec 2026-10-13)": `expect` lines for the map (`## The Ticket Route`, `task-review`, "checks for the task-review verdict first"), the hand-off in both execution skills (`ultrapowers:task-review`, the diamond label, the rationalization row), the door (`## Step 1b: Verify the Review Gate`, `TASK-REVIEW.md`, `--draft`, "The verdict informs", "skip the gate"), the trigger (the new description line), the position ("at the review gate"), the README ("runs it for you") and the release notes ("The ticket route and the review gate"); two negative checks that the bare line "Use ultrapowers:finishing-a-development-branch. In the autopilot form" no longer opens the Finish paragraph of either execution skill. It is written first and fails on the current text. Gate: the offline list in AGENTS.md and `.github/workflows/ci.yml`, Linux job.
- `tests/skills/lifecycle-gates-pressure-scenarios.md`: eight scenarios. A, the `executing-plans` Finish under time pressure in the ticket form; B, the `subagent-driven-development` Finish under sunk cost; C, the finishing skill with no report and a partner who wants the local merge now; D, the explicit skip, the control that must proceed on both texts; E, a stale report; F, a current `FAIL` verdict and a request for the pull request; G, the academic route question on `using-ultrapowers`; H, the `task` skill's next step with a ticket branch and no report. Each names the file the subagent reads, the state it is told, the pressure, the output it must return and the expected GREEN behaviour.
- `tests/skills/lifecycle-gates-pressure-results.md`: the method, then per scenario the RED and GREEN excerpts verbatim and the observations; RED runs on the text at `4954245`, GREEN on the changed text. Reps: RED one per scenario and two for C; GREEN three for C, D, E and F, two for A and B, one for G and H.
- Suites that pin text in the changed files and must stay green: `bash tests/task-lifecycle/test-skill-structure.sh` (the `task-review` description on line 3 and its nine checklist items), `bash tests/claude-code/test-worktree-path-policy.sh` (the `.worktrees/` rule in the finishing skill), `bash tests/task-lifecycle/test-task-review.sh`, `bash tests/autopilot/run-tests.sh` (the execute prompt names the execution skills), `scripts/bump-version.sh --audit`, `scripts/lint-shell.sh --all`.
- Two more runs beside the eight scenarios: the existing autopilot scenario C2 (`tests/autopilot/pressure-scenarios.md`) once on the new Finish paragraph, since the autopilot branch of that paragraph is rewritten; and one description-only micro-test, a subagent shown the skill descriptions and a mid-plan state (two of four tasks done), which must not pick `task-review`, the proof of the anti-goal.
- The evidence for a prose change is the results file; the plan links it from each GREEN task.

## Left to the builder

- The exact placement of the Step 1b table rows and the wording of the rationalization rows, within the sentences the plan gives; a row may be shortened but not softened.
- The dot node labels of the flowcharts, as long as the diamond asks for the ticket form and the yes edge passes through `task-review`.
- The scenario prompts' wording, as long as the named pressures, the state and the expected behaviour stay.
- Sentence boundaries in the README, within the four steps and the two paragraphs named.

## Definition of done

- `bash tests/skills/test-skill-bodies.sh` ends with `PASS`, and its new section failed on the text before the change (recorded in the results file).
- `tests/skills/lifecycle-gates-pressure-results.md` shows RED then GREEN for A, B, C, E, F, G and H, and D proceeding on both texts with the skip recorded on GREEN.
- The suites named under Testing pass; `scripts/bump-version.sh --audit` ends with "All clear"; the version is 2.2.0 everywhere.
- `RELEASE-NOTES.md` v2.2.0 carries the section, the Heads up bullet and the harness parity line ("no harness-specific surface").
- The branch is merged to `dev` and pushed; pull request #58's description names the added section.
- The two article edits are handed to your human partner in chat: step 6 as a re-run of the QA gate alone, and "hash prefix" removed from the secrets sentence.

## Repositories in scope

`.`

## Assumption ledger

| # | Question | Chosen answer | Confidence | Reason |
|---|---|---|---|---|
| 1 | Do `gh pr create --draft` and `glab mr create --draft` exist as written? | Yes, named in the finishing skill, with "the forge's draft setting" for other forges | high | Checked by the builder check on this machine: gh 2.86.0 and glab 1.119.0 both have the flag, and `tracker.mjs:168` already passes `--draft` to gh |
| 7 | Is a rebase after the review a re-run or a false pass? | A re-run: the reviewed head is no ancestor | high | My call: the safe side; see D3 |
| 8 | Does the assembler's new option default to "QA configured"? | Yes | high | My call: every existing caller and test keeps today's BLOCKED behaviour; see D8 |
| 9 | Does a report written while QA was unconfigured go stale when QA is configured later? | No; the next task-review run after the change runs the gate | medium | My call: a configuration change is rare, and the head check does not see it; see D8 |
| 2 | Is one control scenario (D, the explicit skip) enough against over-firing? | Yes | medium | My call: the conditional has one exception, and D exercises it on both texts |
| 3 | Does `task-review` invoke the finishing skill after its verdict? | No; it names it, the caller invokes it | high | My call: a standalone review must not push toward the menu; the execution skills own the next step |
| 4 | Does the bootstrap get a rationalization row for "the per-task reviews were the gate"? | No; the row lives in the finishing skill | high | My call: the pressure arises at the door, and the bootstrap stays a router |
| 5 | Does a present report count as current without a head check? | No; the head is compared | high | My call: one line removes a silent false pass |
| 6 | How is the v2.2.0 first paragraph changed? | One added sentence | high | My call: no restructuring of the shipped notes |
