# Task Review Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use ultrapowers:subagent-driven-development (recommended) or ultrapowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close #29 with a new skill, `/ultrapowers:task-review <ID> [repos...] [--post]`, that reviews a ticket's work (code review with the TDD and root-cause lenses, then the QA gate) and writes `reviews/<ID>/TASK-REVIEW.md`, optionally posting the full reports to the tracker.

**Architecture:** The skill chains existing parts: `ultrapowers:task` for the documents, the QA preflight's `changeSet` and `brainstorm-task`'s selector for the repositories, `requesting-code-review` subagents per repository, the `qa-specialist` agent for the gate. Two new scripts: `review-preflight.sh` (repository selection and the diff ranges) and `post-review.mjs` (comments, attachments, the draft PR/MR through the autopilot tracker and repo clients). One new Odoo tracker call, `attach`.

**Tech Stack:** Markdown skill with POSIX sh helpers (as `brainstorm-task`), node 18+ built-ins; `tests/task-lifecycle/` for the scripts, `tests/autopilot/tracker.test.mjs` for `attach`, pressure scenarios per writing-skills.

**Spec:** `docs/ultrapowers/specs/2026-10-10-open-issues-fixes-design.md`, section 8.

## Global Constraints

- The skill never edits code and never merges; it writes only `reviews/<ID>/`, and with `--post` pushes branches and comments (D8).
- Every subagent dispatch names its model: the most capable available model for code review and root-cause work; the `qa-specialist` agent as defined in `agents/qa-specialist.md` for the gate.
- Network only through the autopilot tracker clients and the guarded push (rule 5); `--post` on a local ticket is refused.
- Zero dependencies (rule 1). LF endings for the sh helper (rule 7).
- A new skill goes through writing-skills: pressure scenarios with before/after evidence in `tests/task-lifecycle/pressure-results.md` (rule 3).
- Frontmatter: `name: task-review`, description starting "Use when ...", no workflow summary.
- Each task's commit says `Part of #29`; the last says `Closes #29`.

## Review Focus

1. A ticket branch that exists in two repositories with different bases (`main` and `develop`): each repository's range uses its own base from `changeSet` (test in Task 1).
2. A `--post` on GitHub where the ticket is a pull request number, or the ticket's issue is closed: the comment lands on the issue (open or closed) and the PR search uses the branch name, never the number (test in Task 4).
3. A report over 65,536 characters: posted as numbered parts in order, each under the limit, the screenshots in the part that references them (test in Task 4).
4. A screenshot path with a space or a non-ASCII name under `reviews/<ID>/artifacts/`: the embedded URL is percent-encoded and the Odoo attachment keeps the name (test in Task 4).
5. The QA gate ends `PRECONDITION-FAILED`: the review's verdict is `BLOCKED`, the code review findings still appear, and `--post` posts them with the precondition text (test in Task 3).

---

### Task 1: `review-preflight.sh` (documents, repositories, ranges)

**Files:**
- Create: `skills/task-review/scripts/review-preflight.sh` (sources `skills/new-task/scripts/ticket-lib.sh`; reuses `skills/brainstorm-task/scripts/preflight.sh`'s selection order; calls `node skills/qa-specialist/scripts/qa-preflight.mjs --change-set-only <ID>` — a new flag that prints only `changeSet`)
- Modify: `skills/qa-specialist/scripts/qa-preflight.mjs` (`--change-set-only`)
- Test: `tests/task-lifecycle/test-task-review.sh` (fixture from `make-fixture.sh` plus ticket branches with commits in `api` and `web`)

**Interfaces:**
- Produces: sections `DOCS` (the `task` manifest's file list), `SELECTION` (as brainstorm-task: `SELECTED-BY-FOCUS`, `SELECTED-BY-TICKET`, `SELECTED-BY-BRANCH`, `SELECTED-ROOT`, `ASK`), `RANGES` (one line per selected repo: `name<TAB>base<TAB>branch<TAB>files<TAB>commits`), and `STATUS` (`NO-WORK` when no repo has a ticket branch and no spec exists).

- [ ] **Step 1: Write the failing tests** — two repos on ticket branches with different bases print two `RANGES` lines with the right bases; focus word `backend` narrows to `api`; no branch anywhere prints `NO-WORK`.
- [ ] **Step 2: Run and see them fail.** — [ ] **Step 3: Implement.** — [ ] **Step 4: Run and see them pass; `scripts/lint-shell.sh` clean.**
- [ ] **Step 5: Commit** — `feat(task-review): preflight lists documents, repositories and ranges (Part of #29)`.

### Task 2: The skill body and the review template

**Files:**
- Create: `skills/task-review/SKILL.md` (steps: announce; `ultrapowers:task <ID>`; preflight and the repository confirmation; per repository a review subagent on the most capable model with the prompt in `prompts/review.md`; the `qa-specialist` agent; assemble the report; `--post` through Task 4's script; the Red Flags table from the pressure runs), `skills/task-review/prompts/review.md` (the reviewer reads the full range, every changed file and its dependents; invokes `ultrapowers:requesting-code-review` with `code-reviewer.md`, `ultrapowers:test-driven-development` as the standard (test exists, written first by commit order, tests behavior), `ultrapowers:systematic-debugging` Phases 1-3 on every failing test and Critical/Important finding; returns findings with a root-cause note each), `skills/task-review/templates/TASK-REVIEW.md` (Verdict; per repository: findings by severity with root cause; TDD assessment; QA summary with the verdict line and a link to `QA-REPORT.md`; screenshots embedded)
- Test: `tests/task-lifecycle/test-skill-structure.sh` (frontmatter, name = directory, no upstream name), pressure scenarios in `tests/task-lifecycle/pressure-scenarios.md`: "fix the finding while you are here" (refused), "post without --post" (refused), "merge the draft" (refused), "review the diff only" (refused: whole files), a multi-repository ticket, a ticket with no branch

- [ ] **Step 1: Write the pressure scenarios and run the baselines (RED)** with no skill.
- [ ] **Step 2: Write the skill, the prompt and the template.**
- [ ] **Step 3: Run the scenarios (GREEN); record the evidence.**
- [ ] **Step 4: Run `bash tests/task-lifecycle/test-task-lifecycle.sh` and `bash tests/skills/test-skill-bodies.sh`** — PASS.
- [ ] **Step 5: Commit** — `feat(task-review): the skill, the reviewer prompt and the report template (Part of #29)`.

### Task 3: Verdict assembly

**Files:**
- Create: `skills/task-review/scripts/assemble-review.mjs` (`assemble-review.mjs <ID> --findings <json> --qa <QA-REPORT.md path>` → `reviews/<ID>/TASK-REVIEW.md`; verdict `FAIL` on any Critical finding or a QA `FAIL`, `BLOCKED` on QA `PRECONDITION-FAILED` or `INCOMPLETE`, `PASS-WITH-ISSUES` on Important findings or QA `PASS-WITH-ISSUES`, else `PASS`; copies the QA verdict line and embeds every `![...](artifacts/...)` of the QA report)
- Test: `tests/task-lifecycle/assemble-review.test.mjs`

- [ ] **Step 1: Write the failing tests** — literal findings JSON and QA reports → expected verdict and sections; a QA report with three screenshots → three embeds.
- [ ] **Step 2: Run and see them fail.** — [ ] **Step 3: Implement.** — [ ] **Step 4: Run and see them pass.**
- [ ] **Step 5: Commit** — `feat(task-review): one verdict from the review findings and the QA gate (Part of #29)`.

### Task 4: `--post` through the tracker clients

**Files:**
- Create: `skills/task-review/scripts/post-review.mjs` (`post-review.mjs <ID> [--draft-pr]`: resolves the ticket with `resolveTicket`; refuses `provider: local`; commits `reviews/<ID>/` to the documents branch and pushes it through `repos.mjs` `push` with a state that allows it (as autopilot's gate stage does); rewrites screenshot links to `https://<host>/<path>/raw/<docs branch>/reviews/<ID>/artifacts/<name>` (GitHub: `raw.githubusercontent.com/<owner>/<repo>/<branch>/...`; GitLab: `<host>/<path>/-/raw/<branch>/...`), percent-encoded; splits at 65,000 characters into numbered parts; posts on the ticket with `tracker.comment`, on the open PR/MR found by branch name with `tracker.prComment`; with none open and `--draft-pr`, pushes the ticket branch and calls `tracker.createPr({ draft: true })` then comments)
- Modify: `skills/autopilot/scripts/tracker.mjs` (`createPr` gains `draft` for GitHub (`--draft`) and GitLab (`Draft:` title prefix); `OdooTracker.attach(number, name, bytes)` through `ir.attachment` `create` with `res_model: 'project.task'`, then `message_post` with `attachment_ids`; `OdooTracker.comment` accepts `{ attachments }`)
- Test: `tests/task-lifecycle/post-review.test.mjs` (a fake tracker object records calls; link rewriting, splitting, the PR search by branch, the draft flag), `tests/autopilot/tracker.test.mjs` (`attach` builds the right JSON-RPC calls against a fake client)

- [ ] **Step 1: Write the failing tests.** — [ ] **Step 2: Run and see them fail.** — [ ] **Step 3: Implement.** — [ ] **Step 4: Run and see them pass.**
- [ ] **Step 5: Commit** — `feat(task-review): --post comments the full reports and opens a draft PR/MR (Part of #29)`.

### Task 5: Registration, docs and gate

**Files:**
- Modify: `README.md` (The Basic Workflow: a step between the QA gate and finishing; the skills library table), `AGENTS.md` (layout row, test list), `.github/workflows/ci.yml` (the new test files), `RELEASE-NOTES.md` (Unreleased entry)
- Test: the offline gate

- [ ] **Step 1: Edit the four files.**
- [ ] **Step 2: Run the whole offline gate** — expected: all pass (the documented OpenCode symlink exception on Windows).
- [ ] **Step 3: Live acceptance (Owner)** — one GitHub ticket and one GitLab ticket with `--post`, one Odoo task with `--post` (attachments visible in the chatter), one `--draft-pr`.
- [ ] **Step 4: Commit** — `docs: task-review in the workflow and the test gate (Closes #29)`.
