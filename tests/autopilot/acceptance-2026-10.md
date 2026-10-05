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

The Owner added `up:approve` on issue 16 from the browser. `next GH-16` answered `wait`, `awaiting-approval`, with approval `{ ok: false, reason: "self" }`: the label's actor `raoofaltaher` is also the login `gh` runs as on this machine, and the spec says the engine's own account never counts. The engine followed the spec. The finding is that a solo developer whose `gh` login is their own account cannot pass the gate through the session door.

The Owner ruled that the rule was wrong: the developer must be able to approve their own tickets. The engine's account now counts like any other (spec D11, commit `bc5228b`). A team that runs the engine as a bot keeps it out with `approvers`. Pressure scenario A8 then checked that the unchanged skill still keeps the agent from adding the label itself, both when the request sits in an owner comment and when the owner relays it in the prompt. Both runs passed.

With the rule changed, the run resumed on the label already on the issue:

| Stage | Command | Outcome |
|---|---|---|
| gate | `next GH-16` | `run execute`, reason `approved`; actor `raoofaltaher`, event `32442181332`; the label was removed and the scope froze at `.` |
| execute | `begin GH-16 execute`, executing-plans inline on `plans/GH-16/Plan.md`, `end` | finished at `d9888d5` |
| qa | `next GH-16` | `run pr`, reason `qa-not-configured` |
| pr | `pr GH-16` | https://github.com/raoofaltaher/ultrapowers/pull/20 against `dev`, citing the packet, the approver and the log head; closing comment on issue 16 |
| done | `next GH-16` | `done`, `pr-finished`; `verifyChain` ok |

The ticket's own work ended at its Task 1 by the plan's rule. Six baseline runs of the new scenario S20 (three on claude-opus-5-5, three on claude-sonnet-5-5, the second three asked for by the ticket's branch review) found that the unedited writing-plans skill already names `plans/1234/Plan.md` in the hand-off. So the skill prose was not changed, and the pull request carries the S20 record only.

Finding from this step: the log had no line for the skipped QA stage, which spec section 6 requires. `pr` now logs `qa skipped` once before it starts (commit `e507504`, test first). PR 20 was opened before that fix, so its log lacks the line.

## Step 4: negative check

Issue 18 received `up:approve` before any autopilot run. `next GH-18` answered `run scaffold`, reason `new-ticket`, with `approval` null: the label is not consulted before the gate. `approval GH-18` refused with `wrong-stage` ("GH-18 is not at the gate"). `status GH-18` showed no state and an empty log; no `tasks/GH-18/` folder and no branch were created. The label was removed afterwards.

The plan expected `wait` with `no-event` or `before-packet`. The engine is stricter than that expectation: an approval is only read once a packet exists, so an early label changes nothing at all. The `before-packet` rule itself is covered by the `verifyApproval` tests.

## Odoo, GitLab, nested workspace (release 1.3.0, 2026-10-05)

The second live round ran the Odoo tracker on the Owner's workspace: a nested documents repository with eleven code repositories, every remote on the Owner's self-hosted GitLab, tickets in the Owner's Odoo (version 19, enterprise). The engine ran from the `feat-odoo-tracker` worktree against the Owner's workspace root; the stages were performed inline in the session. Times are UTC.

### Step 1: configuration

`init tickets` added the technical user's `login` and the `db` to the Odoo source (the database name came from `/web/database/list`); `init autopilot` wrote `gated`, inline execution, the Owner's login as the approver, `watchSelfApproval` and `watch.sharedCredentials` true, and the six `Ultrapowers …` tag names. It created the six tags on the Odoo project and the six labels on the GitLab documents project. The key lives in `.agents/mcp-secrets.env`, which the engine reads; the Owner's single variable is `ODOO_API_KEY`. Init also regenerated nine MCP proposals (`*.ultrapowers-new`) beside the Owner's richer MCP files; they were deleted unmerged, since the Owner's files hold many more servers than the template.

Findings from this step, all fixed with tests before the run went on:

- The Owner's server is Odoo 19: `res.users` carries `all_group_ids` and `group_ids`, not `groups_id`. The tracker now reads `ir.model.fields` once and uses the field the server has.
- On Odoo 19 `mail.tracking.value` and the `tracking_value_ids` field are readable by administrators only, and the technical user is a Project User. The tracker probes that read once and falls back to the last-writer attribution of spec D3 instead of failing the run.

### Step 2: session door to the gate

`/ultrapowers:autopilot <task URL>` resolved the URL to the short id `ODOO-<task>` (the task is in the source's default project). The documents branch `ODOO-<task>-<slug>` was cut from `draft`.

| Stage | Outcome |
|---|---|
| scaffold | brief, `source.md` with 48 messages, 5 attachments and 9 links; the five attachments are kept outside Odoo by a cloud storage module, so they were listed at their addresses, not downloaded |
| spec | `specs/ODOO-<task>/Spec.md`: a bounded slice (the Compliance findings register) with a ten-row assumption ledger and the two repositories in scope; the grounding manifest names every file and page read and the three sources that could not be read (the cloud-stored attachments, a design page answering 403, a meeting recording behind the team's sign-in); the ticket's earlier working branches were read through the local clones |
| plan | `plans/ODOO-<task>/Plan.md`, two tasks |
| gate | `packet` pushed the branch and posted the packet as an internal log note on the task (16 lines, three links at the docs tip, the five lowest-confidence assumptions) |
| next | `wait`, `awaiting-approval`, `no-event` |

Findings from this step, fixed with tests:

- The fetch step wrote five empty files for the cloud-stored attachments (`ir.attachment.type` `cloud_storage`, empty `datas`). A `url` or `cloud_storage` attachment is now listed at its own address and never downloaded; a stale file path from an earlier run is dropped when an attachment is skipped.
- The first packet note appeared as raw markup with no clickable link: Odoo 17 and later escape a plain `message_post` body. Notes now go with `body_is_html`, with a plain retry for an older server. The packet was re-posted; both notes stay on the task.
- The packet's scope lines said `base draft` for the two code repositories, whose bases are `main`: the renderer fell back to the documents base before the code branches existed. It now shows each repository's own default branch.

### Step 3: approval and implementation

The Owner was away; on the Owner's standing instruction to run the full flow, the approve tag was added through the API by the Owner's own account, standing in for the Owner's click. `next` answered `run execute`, reason `approved`, actor the Owner's login, `attribution: last-writer`, and the tag was consumed. `begin execute` opened one worktree per repository in scope under `.worktrees/<branch>` in the backend and the frontend clones.

The plan ran inline under the workspace's house rules (no test file committed; no code comment). Backend: an entity with its migration, a service and a thin controller, proved by six throwaway xunit tests against a disposable PostgreSQL container (the in-memory provider cannot map this context's JSONB columns), then `dotnet build` of the solution. Frontend: a DTO, a service, a findings card with a drawer and a JSON import, wired into the Compliance tab, proved by six throwaway vitest component tests, then the whole suite and `npm run build` with its i18n gate. The frontend suite is red on the base branch itself (147 failures in 20 files, identical on the `main` checkout); the slice adds six passing tests and no failure.

### Step 4: QA and the stop

`next` → `run qa` (the project has a `qa` block). The QA preflight listed four preconditions (no QA role has credentials in the environment) and the two configured URLs did not answer: the Owner's local `int-*` stack was not running, and the Owner's own QA process runs after the merge on a QA host. The report was written as `PRECONDITION-FAILED` and committed; `end qa` recorded the verdict and `next` answered `stop`, `qa-PRECONDITION-FAILED`. No pull request opened, by design: the engine refuses `pr` after a QA stop.

Findings from this step, fixed with tests:

- A QA stop left the task with nothing but a removed running tag: the report was posted at the pull-request stage only. A QA stop now posts the report on the ticket once.
- The report path a stage names was posted unchecked; `end qa` now accepts only a markdown file under `reviews/<ID>/`.

Found and deferred: the QA preflight's change set reads each repository's main checkout, so inside an autopilot run it sees no ticket branch; the QA stage's contract should read the engine's worktrees.

### Step 5: the watcher on the Owner's VM

The Owner's development VM (Debian, Node 22, Claude Code 2.1, `glab` 1.53) holds a clone of the workspace with all repositories. The branch under test was cloned there as the plugin checkout, the documents repository pulled to the committed configuration, and the one Odoo key put in `.agents/mcp-secrets.env`. The VM's Claude Code had no ultrapowers plugin enabled.

Finding, fixed with tests before the cycle: a headless Claude Code stage ran with whatever plugins the host enables, so on this VM a stage would have had no skills and no guardrail. The adapter now passes `--plugin-dir` with the engine's own checkout; the stage command on the VM showed `--plugin-dir <checkout> --strict-mcp-config --mcp-config <project>/.mcp.json`.

A small test task was created in the Odoo project (titled as a test, safe to archive) with a docs-only ask, tagged `Ultrapowers Ready` by the Owner's account.

Cycle 1, `watch --once`, gated:

| Event | Outcome |
|---|---|
| GitLab source | `tracker-error`: the VM's `glab` token is revoked, `glab issue list` printed text instead of JSON; logged, the cycle went on |
| cycle | one ticket, the test task |
| scaffold | headless, 83 s, ok |
| spec | headless, 166 s, ok: a spec with a five-row assumption ledger and `.` in scope |
| plan | headless, 97 s, ok: one task |
| gate | the branch pushed to GitLab; the packet posted as a log note on the task with clickable links; the Ready tag consumed |
| final | `wait`, `awaiting-approval`; next sleep 120 s |

Cycle 2, after the approve tag was added by the Owner's account: the watcher answered `wait`, `awaiting-approval` and ran no stage. The approval was verified (actor, permission, timing) and then refused by the watch door's self-approval rule, `self-watch-no-stage-tokens`: the account that added the tag is the one the watcher runs as, `watchSelfApproval` is true, but the stages hold no read-only token of their own, and Odoo has one key by the Owner's decision. The rule is the one spec D13 set in 1.2.0; the way through for a solo developer on Odoo is a read-only forge token for the stages (`ULTRAPOWERS_STAGE_GITLAB_TOKEN` with `read_api` here), which also keeps the engine's GitLab token out of the stages, or a second person who approves. The approve tag stays on the test task for the Owner to decide.

Not run live in this round: the headless execute stage (the session door ran it inline), the changes loop, and merge requests on GitLab, which the QA stop prevented in both doors. The VM's `glab` token is revoked and must be re-issued before any pull request can open from there.

### What this round verified

| | Verified |
|---|---|
| Live, Owner's workspace | Odoo 19 as the tracker through its JSON-RPC API with one key read from `.agents/mcp-secrets.env`; init creating the six tags and the six GitLab labels; the session door from a task URL through scaffold, spec, plan, packet (log note), approval by tag with last-writer attribution, execute in two nested repositories' worktrees, the QA stage's PRECONDITION-FAILED stop and the QA report posted on the task; the watcher door on the VM through scaffold, spec, plan and packet with the engine's own plugin checkout in the headless stages, and the self-approval rule refusing the watcher's own account |
| Offline suites | every suite in `AGENTS.md`, with the new Odoo scenarios |
| Not yet run live | headless execute and QA stages, the changes loop, merge requests opened by the engine on GitLab, `full` mode |
