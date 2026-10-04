# GH-16 Hand-off Path Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use ultrapowers:subagent-driven-development (recommended) or ultrapowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The two hand-off lines of writing-plans name the path the plan was saved to, with one recorded pressure run as the evidence for the prose change.

**Architecture:** One pressure scenario, S20, on the task-lifecycle fixture with a ticket: a baseline run against the current skill, then a run against the edited one. The edit replaces the literal default path in the two hand-off messages with a `<plan path>` placeholder defined once under the save-location bullets. One shell assertion pins the new wording.

**Tech Stack:** Markdown skill prose, bash tests (`tests/task-lifecycle/test-task-lifecycle.sh`), the existing fixture `tests/task-lifecycle/make-fixture.sh`.

**Spec:** `specs/GH-16/Spec.md`

## Global Constraints

- Skill prose changes go through `ultrapowers:writing-skills` with a recorded pressure run before and after (AGENTS.md rules 2 and 3).
- `skills/writing-plans/SKILL.md` keeps exactly one `plans/<id>/Plan.md`, one `PLAN-NN-<slug>.md` and the default `docs/ultrapowers/plans/YYYY-MM-DD-<feature-name>.md` (lifecycle suite, lines 964 to 976); the route bullet stays directly under "User preferences for plan location override this default".
- No other sentence of writing-plans changes; the example transcripts of executing-plans and subagent-driven-development stay as they are.

## Review Focus

1. A project with the marker but no ticket id in the conversation. Expected: the hand-off names the default path, since that is where the plan went (covered by the definition sentence; checked in S20's baseline note).
2. A plan set (`PLAN-NN-<slug>.md` plus `README.md`). Expected: the hand-off names the folder's README or the first plan file, not `Plan.md`; the definition sentence says "the path you saved to", which covers it (Task 2's assertion does not pin a plan-set case; the reviewer checks the wording reads right for it).

## Repositories in scope

- .

---

### Task 1: Pressure scenario S20, baseline

**Files:**
- Modify: `tests/task-lifecycle/pressure-scenarios.md` (a new `## S20 hand-off path (writing-plans)` section in the file's format)
- Modify: `tests/task-lifecycle/pressure-results.md` (a new row for S20 under a `## Hand-off path (2026-10)` heading)

**Interfaces:**
- Produces: the recorded baseline sentence the hand-off announced on a ticketed fixture.

- [ ] **Step 1: Write the scenario.** Setup: `bash tests/task-lifecycle/make-fixture.sh <dir>`, ticket 1234 scaffolded with a brief and a short `specs/1234/Spec.md` (three sections). Prompt: "Write the plan for specs/1234/Spec.md through writing-plans. ARGUMENTS: 1234". Expected with the fix: the plan lands at `plans/1234/Plan.md` and the hand-off says it was saved to `plans/1234/Plan.md`.

- [ ] **Step 2: Baseline run.** One fresh subagent, the unedited skill (its `<SKILL_DIR>` named in the prompt), no human answering. Record the exact hand-off sentence and the path the plan was saved to.

Expected: the plan is at `plans/1234/Plan.md` and the hand-off says `docs/ultrapowers/plans/<filename>.md`. If the baseline already names the right path, stop here, record it, and the ticket closes with the record (spec, Design).

- [ ] **Step 3: Commit** — `test(task-lifecycle): S20 hand-off path scenario and baseline`.

---

### Task 2: The hand-off names the saved path

**Files:**
- Modify: `skills/writing-plans/SKILL.md` (lines 16 to 18 gain one sentence; lines 190 and 199 change one phrase each)
- Modify: `tests/task-lifecycle/test-task-lifecycle.sh` (`test_core_skill_edits`, after the writing-plans route assertions)
- Modify: `tests/task-lifecycle/pressure-results.md` (the S20 row gains the with-skill column)

**Interfaces:**
- Consumes: the baseline sentence from Task 1.

- [ ] **Step 1: Write the failing assertion** in `test_core_skill_edits`:

```bash
if [[ "$(grep -c 'saved to `<plan path>`' "$w" || true)" -eq 2 ]] && ! grep -q 'docs/ultrapowers/plans/<filename>.md' "$w" \
    && grep -q '`<plan path>` in the hand-off below is the path you saved to' "$w"; then
    pass "writing-plans hand-off names the saved plan path"
else
    fail "writing-plans hand-off names the saved plan path"
fi
```

- [ ] **Step 2: Run** `bash tests/task-lifecycle/test-task-lifecycle.sh`. Expected: FAIL on the new assertion only.

- [ ] **Step 3: Edit the skill.** After line 18 (the ticket route bullet), one bullet: "- `<plan path>` in the hand-off below is the path you saved to: the default, or the ticket route." In the two quoted hand-off messages (lines 190 and 199), replace `docs/ultrapowers/plans/<filename>.md` with `<plan path>`. Nothing else changes.

- [ ] **Step 4: Run** `bash tests/task-lifecycle/test-task-lifecycle.sh` and `bash tests/skills/test-skill-bodies.sh`. Expected: both PASS; the count of `plans/<id>/Plan.md` is still one.

- [ ] **Step 5: GREEN run of S20** with the edited skill, same fixture shape, fresh subagent. Expected: the hand-off says `plans/1234/Plan.md`. Record it in `pressure-results.md`.

- [ ] **Step 6: Commit** — `fix(writing-plans): the hand-off names the path the plan was saved to`.
