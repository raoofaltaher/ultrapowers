# Autopilot live acceptance, October 2026

The session door run on this repository against GitHub issue 16, as the plan's Task 16 asks. The engine ran from the `feat-autopilot` worktree; the documents repository was the main checkout of this repository on `dev`, root topology. Times are UTC.

## Step 1: configuration

`init autopilot` on `dev` with mode `gated`, base branch `dev`, approvers the Owner's login, execution `inline`. The marker block was committed on `dev`. `gh label list` afterwards shows the six labels `up:ready`, `up:approve`, `up:changes`, `up:hold`, `up:blocked`, `up:running`.

## Step 2: session door to the gate

The ticket branch is `GH-16-writing-plans-hand-off-lines-still` (the plan's example name broke its own 40-character rule; see the ledger ruling of Task 1). It was cut from the newer of the local `dev` and `origin/dev`, which surfaced the base-branch rule fix (`a876d39`, `61565a7`).

| Stage | Command | Outcome |
|---|---|---|
| scaffold | `begin GH-16 scaffold`, brief and `source.md` committed, `end` | finished |
| spec | `begin GH-16 spec`, `specs/GH-16/Spec.md` with the assumption ledger and `## Repositories in scope` (`.`), `end` | finished |
| plan | `begin GH-16 plan`, `plans/GH-16/Plan.md` (two tasks), `end --result '{"ok":true,"scope":["."]}'` | finished |
| gate | `packet GH-16` | packet posted 11:49:26, 15 lines |
| next | `next GH-16` | `wait`, `awaiting-approval`, approval `no-event` |

The branch is on origin with the brief, `source.md`, the spec, the plan, `tasks/GH-16/autopilot.json` and the chained `stage-log.jsonl`. The `up:running` label was removed when `next` returned `wait`. The packet comment on issue 16:

```
Autopilot packet for GH-16 — gate 1 of 2 — mode gated
Docs branch GH-16-writing-plans-hand-off-lines-still at 20195075ccbe4597b4333b0d33665fa16b94e8d9
  brief   https://github.com/raoofaltaher/ultrapowers/blob/2019507.../tasks/GH-16/GH-16.md
  spec    https://github.com/raoofaltaher/ultrapowers/blob/2019507.../specs/GH-16/Spec.md   changed since last packet: none
  plan    https://github.com/raoofaltaher/ultrapowers/blob/2019507.../plans/GH-16/Plan.md
Repositories in scope
  .   base dev     branch not yet created
Assumptions to check (lowest confidence first)
  1. Where does the scenario live? — chosen: `tests/task-lifecycle/`, as S20 (medium)
  2. Does the fix also cover the autopilot-form hand-off added in 1.2.0? — chosen: no; it already names `plans/<ID>/Plan.md` (medium)
  3. Which repositories are in scope? — chosen: `.` only (high)
  4. Name the real path with two literals, or one placeholder? — chosen: one placeholder, `<plan path>`, defined once (high)
  5. Run the pressure scenario before or after the edit? — chosen: before and after, as the ticket asks (high)
Approve: add label up:approve. Changes: comment, then add up:changes. Stop: up:hold.
Packet id 4a6b1f2fa8f1
```

Findings from this step:

- The scope line for `.` said `branch not yet created`. The root repository is the documents repository, so the renderer now takes its branch, tip and PR from the docs state. Fixed with a test in `autopilot-lib.test.mjs`.
- The `chore(GH-16): autopilot packet posted` state commit lands after the push, so origin is one bookkeeping commit behind until the next push. Verification compares the work tip, which ignores state-only commits, so this is not drift.

## Step 3: approval

Pending: the Owner adds `up:approve` on issue 16.

## Step 4: negative check

Issue 18 received `up:approve` before any autopilot run. `next GH-18` answered `run scaffold`, reason `new-ticket`, with `approval` null: the label is not consulted before the gate. `approval GH-18` refused with `wrong-stage` ("GH-18 is not at the gate"). `status GH-18` showed no state and an empty log; no `tasks/GH-18/` folder and no branch were created. The label was removed afterwards.

The plan expected `wait` with `no-event` or `before-packet`. The engine is stricter than that expectation: an approval is only read once a packet exists, so an early label changes nothing at all. The `before-packet` rule itself is covered by the `verifyApproval` tests.

## GitLab nested workspace and VM watcher

Not run in this round; recorded here when the Owner's workspaces are available.
