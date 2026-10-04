# GH-16: writing-plans hand-off names the path the plan was saved to

Date: 2026-10-04
Ticket: https://github.com/raoofaltaher/ultrapowers/issues/16
Status: written in autopilot form; the review happens on the ticket's packet

## Problem

`skills/writing-plans/SKILL.md` saves a plan to `plans/<id>/Plan.md` when `.agents/ultrapowers.json` exists and a ticket id is known (its line 18), and to `docs/ultrapowers/plans/YYYY-MM-DD-<feature-name>.md` otherwise. Its two hand-off lines, the quoted messages at lines 190 and 199, always say `docs/ultrapowers/plans/<filename>.md`. On a ticketed project the human partner is told a path that holds no file. The task-lifecycle spec's acceptance criterion 5 covers the save location and is checked by a static grep in `tests/task-lifecycle/test-task-lifecycle.sh` (lines 964 to 976); nothing checks what the hand-off says.

## Goal

The hand-off names the path the plan was saved to, on a ticketed project and on a project without the marker, with one pressure run as the evidence rule 2 of `AGENTS.md` asks for before the prose changes.

## Non-goals

- Changing where plans are saved, or the plan-set convention (`PLAN-NN-<slug>.md` with a `README.md` index).
- Touching the example transcripts of executing-plans and subagent-driven-development, which show the default path in a worked example.
- Any other sentence of writing-plans.

## Design

The two hand-off messages stop naming a literal path and name the saved file instead:

- Line 190: `**"Plan complete and saved to \`<plan path>\`. Please review the plan. Which execution approach would you prefer?**`
- Line 199: `**"Plan complete and saved to \`<plan path>\`. Please review the plan. Does it capture what you want?"**`

One sentence after the "Save plans to" bullets defines the placeholder: "`<plan path>` in the hand-off below is the path you saved to: the default, or the ticket route." That sentence names neither literal path, so the lifecycle suite's count of one `plans/<id>/Plan.md` and the presence of the default path both hold.

Evidence first: one pressure scenario on the task-lifecycle fixture with a ticket (brief, spec present), prompt "Write the plan for specs/1234/Spec.md", baseline against the current skill and a second run against the edited one. The record goes to `tests/task-lifecycle/pressure-scenarios.md` and `pressure-results.md` as S20, in their existing format. The baseline is expected to announce `docs/ultrapowers/plans/<filename>.md`; the edited skill is expected to announce `plans/1234/Plan.md`. If the baseline already announces the right path, the prose does not change and the ticket closes with the record.

Error handling: none; this is prose and a recorded run.

Testing: `tests/task-lifecycle/test-task-lifecycle.sh` gains one assertion in `test_core_skill_edits`: the two hand-off lines of writing-plans contain `<plan path>` and no `docs/ultrapowers/plans/<filename>.md`. The existing assertions on the route bullets stay unchanged. `tests/skills/test-skill-bodies.sh` must still pass.

## Definition of Done

- S20 recorded with the path the hand-off announced before and after.
- The two hand-off lines name `<plan path>`; the definition sentence exists; the lifecycle suite and the skill bodies suite pass.

## Repositories in scope

- .

## Assumption ledger

| # | Question | Chosen answer | Confidence | Reason |
|---|---|---|---|---|
| 1 | Which repositories are in scope? | `.` only | high | root topology; the brief names one file in this repository |
| 2 | Name the real path with two literals, or one placeholder? | one placeholder, `<plan path>`, defined once | high | the lifecycle suite counts exactly one `plans/<id>/Plan.md` in the skill; a second literal would break it |
| 3 | Run the pressure scenario before or after the edit? | before and after, as the ticket asks | high | rule 2 of AGENTS.md: skill prose changes only with evidence |
| 4 | Where does the scenario live? | `tests/task-lifecycle/`, as S20 | medium | the existing S1 to S19 of the lifecycle skills live there; a new file for one scenario adds a place to look |
| 5 | Does the fix also cover the autopilot-form hand-off added in 1.2.0? | no; it already names `plans/<ID>/Plan.md` | medium | that sentence is on the feature branch, not on this ticket's base; the plan may note it |
