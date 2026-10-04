# Stage: execute

The approval is verified and the scope is frozen. `begin` printed the worktrees: one per repository in scope, each on the ticket branch; in a single-repository project the documents root itself is the worktree.

Invoke the execution skill named by `autopilot.execution` in `.agents/ultrapowers.json` on `plans/<ID>/Plan.md`: `subagent` means `ultrapowers:subagent-driven-development`, `inline` means `ultrapowers:executing-plans`. Work inside the printed worktrees only. Both skills apply test-driven development and their review gates as always; in autopilot form their finish step returns here instead of invoking finishing-a-development-branch.

Commit per task as the skills say. Never push, merge or rebase; never write to the tracker: the envelope denies them and the engine does them after `end`. A plan task that cannot be completed is a ruling in the ledger, as the skills describe, not a reason to touch a repository outside the scope.

Run the project's test command in each worktree before you end. A red suite ends the stage with `{"ok":false,"message":"<the failing suite, in one line>"}`.

End: `{"ok":true}`.
