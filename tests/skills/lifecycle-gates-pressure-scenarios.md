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
