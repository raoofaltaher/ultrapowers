# Ultrapowers Release Notes

## v1.3.0 (2026-10-05)

Odoo as an autopilot tracker: the tag on the task starts the run, the packet and the QA report are log notes, the pull requests open on your forge.

Teams that track work in Odoo tasks rather than GitHub or GitLab issues can now run autopilot from the task. The engine talks to the Odoo server's own JSON-RPC API with one key you issue; the approval is a tag an internal user adds; the review packet and the QA report are internal log notes on the task; and the pull requests open on whichever forge each repository's `origin` remote names. Everything that worked for GitHub and GitLab issues in 1.2.0 keeps working unchanged.

**Heads up:** an Odoo source that autopilot will run needs the technical user's `login` (and `db` when the server hosts several databases): `/ultrapowers:init tickets` asks for them, and `init autopilot` creates the six `Ultrapowers …` tags on the project after your yes. The key lives in `ODOO_API_KEY`, in your environment or in `.agents/mcp-secrets.env` (gitignored), the one Odoo variable for the engine and its stages alike. Upgrade mode finds no changed template; answer `--apply none`.

### Who it is for

Teams whose tickets live in Odoo's Project app, and anyone whose code repositories live on a different forge than their tickets.

### What is new

- **Odoo as a tracker.** `/ultrapowers:autopilot ODOO-1203`, or the task's URL, runs the ticket through the same stages and gates. The engine reads the task, its tags and its chatter over JSON-RPC, posts the packet as an internal note with clickable links, and reads the approve tag from the chatter's tracking values; when the server keeps those for administrators only (Odoo 19 does), the tag is attributed to the task's last writer and the log says so. Only internal users in the Project User or Project Manager group count; a portal user's tag is refused.
- **The forge is the repository's remote.** Each repository's pull request opens on the forge its `origin` points to, GitHub through `gh` or GitLab through `glab`, whatever the ticket source is. A repository without a GitHub or GitLab remote stops the run with `no-forge`.
- **The rich ticket read, for every provider.** The brief's source file now carries the ticket's messages, its attachments (downloaded up to `tickets.attachmentMaxBytes`, default 10 MB, or listed at their address when they are larger or kept outside the tracker) and every link they hold; brainstorm-task reads them all before the first question, through the harness's web reader or the Firecrawl MCP server, and lists them in the grounding manifest.
- **The QA report on the ticket and the pull requests.** After the pull requests open, the full QA report is posted on the ticket and as a comment on every pull request, headed by the packet id, the approver and the stage log head. A QA stop posts the report on the ticket too, so the human reads why the run stopped.
- **The guardrail knows Odoo.** During a stage the MCP write verbs of an Odoo server (`call_model_method`, `execute_kw`, `update_record`, `post_message`) and any `curl`, `wget` or `Invoke-WebRequest` to a configured ticket source's host are denied; reads pass.
- **A headless Claude Code stage loads the engine's own plugin checkout** (`--plugin-dir`), so its skills and its guardrail are the engine's version on any host.
- **Init.** Ticket sources ask for the Odoo login and database; autopilot proposes the readable tag names for an Odoo-only project and creates the tags; the secrets example names `ODOO_API_KEY` once.

### What was verified, and how

| | Verified |
|---|---|
| Live, the Owner's workspace | Odoo 19 as the tracker in a nested workspace of eleven repositories with self-hosted GitLab remotes: init creating the tags and the labels; the session door from a task URL through scaffold, spec, plan and the packet as a log note, the approval by tag, execute in two repositories' worktrees, and the QA stage's PRECONDITION-FAILED stop with the report on the task; the watcher on the Owner's VM from the Ready tag through the headless scaffold, spec and plan stages to the packet, and its self-approval rule refusing the watcher's own account (`tests/autopilot/acceptance-2026-10.md`) |
| Offline suites, every commit | The engine against a fake Odoo server (tags, tracking and last-writer attribution, permissions, notes, the watcher cycle, the URL id, the secrets file), the tracker and the forge rule, the fetch step's messages, attachments and links, init's Odoo questions and tags, the guardrail's Odoo cases, the pressure scenarios P1 to P3 |
| Not yet run live | Headless execute and QA stages, the changes loop, pull requests opened by the engine on GitLab, full mode |

### Found during the live run, fixed in this release

Odoo 19 renames the user groups field and restricts the tracking values to administrators; its cloud storage module keeps attachments outside the database; `message_post` escapes a plain body; the packet showed the documents base for code repositories; a QA stop left the ticket without the report; a stage's report path was posted unchecked; a headless stage ran with the host's plugins. Each has a test.

### Not in this release

- A second gate on the pull request with the engine merging on your label, and the QA fix loop.
- Approval from Odoo portal users or by message; a CI door; per-ticket lanes.
- A switch to skip the in-run QA gate for a team whose QA runs after the merge: today the QA stage runs whenever `qa.urls` is set.

## v1.2.1 (2026-10-04)

A patch release with no change to the plugin's behaviour.

- **The version audit skips the ticket folders.** `scripts/bump-version.sh --audit` no longer scans `tasks/`, `specs/`, `plans/` and `reviews/`, which hold documents written for tickets and may quote a plugin version. The Linux CI job on `main` failed on that audit right after the 1.2.0 release merge, because the GH-16 spec quotes the version.
- **README.** The first-ticket step says "this release" instead of a version number.

**Heads up:** `/ultrapowers:init` offers upgrade mode once a project's marker says 1.2.0. No template changed in this release, so answer `--apply none`.

## v1.2.0 (2026-10-04)

Autopilot: hand the agent a ticket, approve its plan on the ticket, review its pull request.

The request we hear most from engineering teams is the same one: "give the agent a task and wait for the pull request, without lowering the bar". Ultrapowers already carried the bar: a short brief, a spec grounded in the code, a plan, test-driven implementation, a review of every task, a QA specialist, a clean finish. This release runs that same workflow from a ticket, with the human decisions on the ticket, and leaves every form of working in place.

**Heads up:** existing projects keep working unchanged; without an `autopilot` block every skill behaves as before. Set it up with `/ultrapowers:init autopilot` (join and upgrade offer it once when a GitHub or GitLab source exists). Upgrade finds two changed templates: `.claude/settings.json`, which now allows `Skill(ultrapowers:autopilot)`, and, for projects that chose Gemini CLI, the new `.gemini/hooks/ultrapowers-guardrail.mjs`; apply them to get `.ultrapowers-new` proposals beside your files, or answer `--apply none`.

### Who it is for

Professional development teams and the enterprises they work in: teams that already review specs and pull requests and want the agent to do the work between those two decisions, on their own machines, with tokens they issue.

### Three ways to run the same workflow

Pick the rung that fits, and move up when the record says so. The artifacts are the same at every rung: the brief, the spec with its assumption ledger, the plan, the stage log, the pull request.

1. **Manual.** The skills by hand, as before. Nothing changes without an `autopilot` block.
2. **One command.** `/ultrapowers:autopilot <ticket>` in your session takes a GitHub or GitLab issue through the brief, the spec and the plan, posts a review packet on the ticket, and stops. You add the `up:approve` label. The run implements, reviews, runs QA when the project has a QA block, and opens the pull request. Verified live on Claude Code with GitHub: issue 16 of this repository became pull request 20 (`tests/autopilot/acceptance-2026-10.md`).
3. **A watcher** *(beta)*. `autopilot.mjs watch`, a service on the machine that hosts your coding agent, picks up every ticket a member with write access labelled `up:ready` and runs it the same way, so you only touch the tracker. Beta until a public run from label to pull request is recorded.

`gated` is the default and the mode we recommend: two gates, the packet and the pull request. `full` *(beta)* posts the packet for the record and stops at the pull request only.

### How you stay in control

- **One packet, one label.** The packet is under 25 lines: the brief, the spec with its assumption ledger (every question the agent answered for itself, lowest confidence first), the plan, the repositories in scope, all linked at one commit. Your approval is a label on the ticket, and the engine checks it on the tracker's own timeline: who added it, with write access (on GitLab, Maintainer or above) and in `approvers` when you set that list, after the packet, and on the same commits. A new commit voids it. The check runs again before implementation starts and before the pull request opens.
- **Your own account approves your own tickets** in a session. A watcher takes an approval from the account it runs as only when you set `watchSelfApproval` and give its stages their own read-only token.
- **Changes and holds.** `up:changes` with a comment sends the run back to the spec and the plan; `up:hold` pauses it; a kill switch file pauses the watcher.
- **During a stage, a guardrail hook denies the agent push, merge and tracker writes.** The engine pushes and opens pull requests between stages, and a human merges. The hook matches patterns; it is not a sandbox. It also denies edits to the project's configuration, CI, commit hooks, settings, the ticket's state files and its own run marker, and a stage that loses its marker is blocked for review.
- **What a watcher stage holds.** With read-only stage tokens (`ULTRAPOWERS_STAGE_GH_TOKEN`, `ULTRAPOWERS_STAGE_GITLAB_TOKEN`), the engine's tokens and the ssh agent are removed from the stage's environment; on Claude Code, only the project's MCP servers load. A watcher refuses to start without stage tokens unless the project says `watch.sharedCredentials: true` in writing. `docs/autopilot-watcher.md` has the checklist a team runs before the first ticket.
- **One record per ticket.** `tasks/<ID>/autopilot.json` and a hash-chained `tasks/<ID>/stage-log.jsonl` on the ticket branch, read by `/ultrapowers:task` first; the pull request cites the packet, the approver and the log head.
- **Runs on your machine with tokens you issue; the plugin's own code sends nothing anywhere.** The agent talks to its model provider as it always did.

### Where it runs

The engine, the skill and the tracker write-back through `gh` and `glab` are the same on every harness. The guardrail reaches each harness its own way: plugin hooks on Claude Code, Codex, GitHub Copilot CLI, Cursor, Muse, Qwen Code, Factory Droid, Kimi Code and Antigravity; in-process hooks in the OpenCode plugin, the Pi extension and the Hermes plugin; a project `BeforeTool` hook that init writes for Gemini CLI. Devin's plugin hooks are documented as fail-open, so the watcher refuses `devin` and a Devin session has no reliable envelope. Codex asks you to trust the plugin's hooks once; Hermes loads the plugin only when it is in `plugins.enabled`. The README's table "Where the envelope runs" names each harness's hook, its one-time step and its limits; Claude Code, Gemini CLI, Qwen Code, Droid and Kimi Code let a hook that crashes or times out through, so the deny path, exit 2, is what the tests exercise.

### What was verified, and how

| | Verified |
|---|---|
| Live, on this repository | The session door on Claude Code with GitHub: one repository, gated mode, inline execution, no QA stage; the early-label negative check; pressure scenario A8 (the agent does not add the approve label for you) |
| Offline suites, every commit | The engine against a fake tracker and a fake harness (54 scenarios: gates, approvals, drift, loops, locks, the watcher cycle, stage credentials); the guardrail's autopilot profile (120 cases); the bridge and the node entry; the OpenCode plugin, the Pi extension and the Hermes plugin hooks; the adapters' command lines; init's autopilot mode |
| Against the installed CLIs | `tests/autopilot/test-adapters.sh` ran the Claude Code and Codex adapters live on the release machine; OpenCode and Pi accepted their flags and answered a provider or login error; the rest were not installed |
| Vendor documentation only | The hook contracts and crash behaviour of Codex, Copilot CLI, Cursor, Gemini CLI, Qwen Code, Droid, Kimi Code, Antigravity, Hermes and Devin |
| Not yet run | The watcher on any harness, GitLab, a nested workspace, full mode, the changes loop, the QA stage inside a run, subagent execution inside a run |

### The engineering detail

- **One engine, two doors.** The command and the watcher share one state file and one log per ticket; one fresh headless harness call per agent stage in the watcher (`skills/autopilot/scripts/harnesses.mjs`, one adapter per harness); resume re-reads files, never chat.
- **The documents repository** where init ran is the ticket's home; code repositories get one branch each, in a worktree, only those the approved plan names, and one pull request each. Scope: a hint in the brief, binding in the spec, narrowable by the plan, frozen at approval, enforced at push. A base branch ahead of origin is named in the packet and the pull request.
- **The gate's record is not the gate.** Execute and the pull request require the recorded approval and check it again; the gate commands and other stages are refused while a stage is open; a spec or plan changed after approval blocks; full mode records its approval at the packet; the changes label is taken when its stage begins; a run stops when a stage repeats; a QA verdict of FAIL, PRECONDITION-FAILED or INCOMPLETE stops the run and a missing one blocks; a failed packet or pull request blocks its stage and releases the lock. A mode label and the watcher's start label count only from a member with write access. The watch door's self check fails closed.
- **Autopilot form of the skills.** brainstorming, brainstorm-task, writing-plans, executing-plans and subagent-driven-development ask nothing when the run marker exists: each question becomes an assumption-ledger row, the plan copies or narrows the spec's repositories, and the finish step returns to the engine. Pressure scenarios A1 to A8, B1 to B4 and C1 to C2 are recorded under `tests/autopilot/`.
- **Init.** `/ultrapowers:init autopilot` asks the mode, base branch, approvers, execution, harness, the two watcher questions (own-account approval, shared credentials) and the label names, shows a dry run, and creates the six labels on the source's default project after your yes.
- **Documentation.** The Basic Workflow has step 10, the project configuration documents the `autopilot` block and the harness table, Philosophy gains "Autonomous between your gates", and the last section, Pipelines, draws the manual workflow, gated and full autopilot, and the watcher. The spec's decisions D11 to D16 record what changed during the live run and the executive review (`docs/executive/2026-10-04-v1-2-0-autopilot-release-notes-and-readme-review.md`).

### Not in this release

- A second gate on the pull request with the engine merging on your label, the QA report posted on the ticket, and the QA fix loop: the next spec, agreed with the Owner.
- Odoo write-back (Odoo tickets are still read as in 1.1.0), a CI door, per-ticket lanes, and a public watcher run. The README's roadmap line names them.

## v1.1.0 (2026-10-02)

Tickets come from where the team already tracks them.

**Heads up:** existing projects keep working unchanged; every id without a configured prefix is still a local ticket. To add ticket sources to a project that already has a scaffold, run `/ultrapowers:init tickets` (join and upgrade also offer it once). Upgrade finds no changed template in this release, so `--apply none` is the answer to its prompt.

### Task Lifecycle

- **Ticket sources.** `/ultrapowers:init` asks where tickets live, and `/ultrapowers:init tickets` sets it later: GitHub Issues, GitLab Issues or Odoo tasks, several at once, each with its own id prefix. `/ultrapowers:new-task GH-web-7`, `GL-billing-api-42` or `ODOO-12-1203` then fills the brief from the ticket and keeps a quoted copy in `tasks/<ID>/source.md`. Ids read as `<PREFIX>-<project>-<number>`; in a workspace with nested clones, a project that matches a clone becomes a `Repository:` line that brainstorm-task proposes first. Read only: nothing is written back to the tracker. Any id without a configured prefix is a local ticket, exactly as before.
- **CLI first, MCP otherwise.** `gh` and `glab` are used when they are installed and signed in (a `GH_TOKEN` or `GITLAB_TOKEN` is enough, so headless runners work); otherwise the agent uses the source's MCP server: GitHub's official server with a read-only header, GitLab's official server with browser sign-in, and the team's own Odoo server. The plugin itself still opens no network connection.
- **Ticket text is data.** A fetched ticket's instructions are never followed, a failed fetch creates nothing, a credential in a ticket stops the scaffold before anything is committed, and an Odoo task filed under another project is refused.

### Documentation

- **Project configuration in the README.** One example of `.agents/ultrapowers.json` and two tables explain every key, what you can set, and a ticket source's fields.
- **The vision, briefly.** The Basic Workflow says who decides what and names the roadmap (a tracker label starting the same workflow headless, with your approvals on the pull request; not shipped yet). Philosophy says who ultrapowers helps and how, and invites ideas in Discussions.

### Rules

- **Rule 5 reads as a principle.** Nothing reports on users, their projects or their usage; the plugin opens no connection itself; a skill reaches the network only through a tool the user installed and signed in, to a host named in `.agents/ultrapowers.json`.

### Fixes found in review

- A self-hosted GitLab source fetches from its own host, not gitlab.com; a GitHub pull-request number is refused as a ticket; no variant of the `source.md` markers can close the quote early; an id that names a path is refused; an Odoo header is limited to the forms every harness renders; upgrade proposals keep the ticket servers.

## v1.0.1 (2026-10-02)

Brainstorming now reads all the code a design needs before it asks its first question, and the README's release badge updates itself.

### Brainstorm Task

- **Grounding reads all the context the design needs.** `brainstorm-task` stopped at eight files per repository, so a change that touched more files than that reached brainstorming with some of them unread, and writing-plans found them later. `ground.sh` now lists every matching file, ranked as before, and the agent reads every file the design depends on, strongest match first, following what those files lead to until it can say where the change lands, what it touches and what already exists. There is no cap and no setting for one. The grounding manifest still lists every file read.

### Documentation

- **The README release badge updates itself.** It reads the latest GitHub release when the README is viewed, so a release no longer needs a hand-edited banner.

### Fixes

- **The version audit matches whole version numbers.** Bumping to 1.0.1 no longer flags a comment that mentions version 1.0.11.

## v1.0.0 (2026-10-01)

The first release of Ultrapowers, a fork of Jesse Vincent's MIT-licensed skills library cut from its version 6.4.2. It keeps the whole methodology (brainstorming, plans, subagent-driven and inline execution, test-driven development, systematic debugging, code review, worktrees) and adds what a working developer repeats on every project: one-command project setup for every coding agent, a ticket-driven lifecycle with brainstorming grounded in the code, team memory kept in git, and a seven-lane QA gatekeeper. It also carries the upstream fixes made after 6.4.2 and a round of Windows and hook hardening.

**Heads up:** every name is `ultrapowers`. Install with `/plugin marketplace add raoofaltaher/ultrapowers` and `/plugin install ultrapowers@ultrapowers`; skills are invoked as `ultrapowers:<skill>`; the runtime folder is `.ultrapowers/`; environment variables are `ULTRAPOWERS_*`. Installing the plugin writes nothing into your project: run `/ultrapowers:init`, which the session start offers in any git repository without an Ultrapowers setup.

**Beta:** the QA gatekeeper (the `qa-specialist` skill and agent, its eight lane skills and the `qa-guardrail` hook) is experimental in 1.0.0. Its contract, guardrail rules and report format may change in a minor release. Known gaps are tracked in issues #1 to #14.

### New Skills

- **`init`: one command sets up a project for every coding agent.** Scaffold, join, upgrade and repair modes. It writes ten knowledge base folders with READMEs, one `AGENTS.md` that `CLAUDE.md` and `GEMINI.md` import and the other agents read directly, MCP configuration rendered for nine harnesses from one `.mcp.json`, Claude Code settings and output style, the team-memory store, and repo hygiene (a gitleaks pre-commit hook and managed `.gitignore` and `.gitattributes` blocks). It shows a dry run and writes only after an explicit yes, never overwrites a file, and offers template updates as `<file>.ultrapowers-new` proposals. A one-line offer at session start (`ULTRAPOWERS_NUDGE=off` silences it) tells the agent when a project has no setup, an older one, or an unreadable one.
- **`new-task`: open a ticket in one step.** It creates `tasks/<ID>/`, `specs/<ID>/`, `plans/<ID>/` and `reviews/<ID>/`, writes a brief of two short paragraphs at most (Context, Definition of Ready, Definition of Done, Related Documentation), commits it, and hands off to brainstorm-task. It refuses a ticket that already exists.
- **`brainstorm-task`: brainstorming grounded in the code.** It reads the brief, confirms which repositories to read, reads at most eight relevant files per repository, prints a grounding manifest, and only then starts the brainstorming dialogue, so the plan does not meet surprises later. The spec lands at `specs/<ID>/Spec.md`; brainstorming and writing-plans route ticket documents into the knowledge base.
- **`task`: where a ticket stands.** A read-only report of the brief, spec, plan, reviews and branches, with the next step.
- **`team-memory`: shared memory in git.** Remember, recall, prune and lint verified, durable, expensive-to-rediscover facts in `.agents/memory/` (gotchas, decisions, subsystems) behind a size-budgeted index, with a `Memory-Ref` commit trailer and an optional pre-commit lint. Hooks remind the agent to save learnings on each prompt and right after compaction on Claude Code and Muse, at session start on Cursor, and through the OpenCode, Pi and Hermes injectors.
- **`qa-specialist` (beta): a seven-lane QA gate.** It tests the running app in a real browser for each configured role and language across seven lanes (UI, logs, API, database, observability, test suites, content) and writes `reviews/<ID>/QA-REPORT.md` with one verdict: PASS, PASS-WITH-ISSUES, FAIL, INCOMPLETE or PRECONDITION-FAILED. It runs forked as the `qa-specialist` agent where the harness supports it and inline elsewhere, and resumes an interrupted run from its run-state. Credentials come from environment variables named in the project config. It never starts or stops your stack and never commits.

### Hooks

- **`qa-guardrail` (beta): a PreToolUse guardrail for QA runs.** It is inert unless `.ultrapowers/qa-active` exists, and that check uses shell builtins only. During a run it limits shell writes to `reviews/<ID>/` and `.ultrapowers/`, allows only read-only git, and blocks stack teardown, destructive commands, forbidden hosts, database writes and key material. A call it cannot inspect is denied. It is registered for Claude Code, Cursor and Muse.
- **Windows: hook exit codes reach the harness.** `run-hook.cmd` expanded `%ERRORLEVEL%` inside a parenthesised block when cmd parsed it, before bash ran, so every hook reported success and a guardrail deny did not block.
- **Windows: `run-hook.cmd` finds a per-user Git install and never runs a WSL launcher or a planted `bash` or `where`.** It checks `%LOCALAPPDATA%\Programs\Git`, calls `where.exe` by full path with `$PATH:bash`, and skips the System32, Sysnative and WindowsApps launchers. (upstream #2393)
- **The hooks work with a broken `PATH`.** session-start, the team-memory hooks and the Unix half of the wrapper no longer need `dirname`, `cat`, `head` or `bash` from `PATH`, so the bootstrap, the setup offer and the team-memory lines survive a harness that starts hooks with a broken `PATH`. (upstream #2349, extended to the fork's own hooks) During a QA run the guardrail denies when `grep`, `sed` or `tr` is missing instead of letting every rule pass.
- **Muse runs session-start with bash.** The manifest started it with `sh`, which is dash on many systems.

### Skills

- **The ticket skills read a bare argument without a self-contradicting fallback.** new-task, brainstorm-task, task, init and qa-specialist wrote the argument placeholder twice; the harness substituted both, and the model read an instruction to fall back to a line that did not exist. In the forked QA agent that printed the usage line in 5 of 6 runs.
- **The brainstorm companion inserts screen content literally.** Screens containing `$'` or `$&` no longer splice pieces of the frame into the page. (upstream #2364)
- **The systematic-debugging example no longer prints the secret it checks for.** It reports only SET or UNSET. (upstream #2380)
- **`task-done` records a passing test command that prints nothing.** (upstream #2388)
- **The requesting-code-review example survives skill arguments.** `cut` replaces an `awk '{print $1}'` that the harness substituted. (upstream #2361)
- **`sdd-workspace` leaves a repository's own workspace `.gitignore` alone.** (upstream #2399)

### Harness Support

- Install from this repository on Claude Code, Antigravity, Codex, Cursor, Devin CLI, Factory Droid, Gemini CLI, GitHub Copilot CLI, Grok Build CLI, Kimi Code, OpenCode, Pi, Qwen Code, Hermes Agent and Muse; see the README for each install command.
- **Hermes shows every skill with its description.** The plugin passed only a name and path, so the skill list was blank. (upstream #2284)

### Rename and Fork Hygiene

- **One vocabulary.** The plugin, marketplace, skill namespace, runtime folder and environment variables are all `ultrapowers`, applied by `scripts/rename-fork.sh`. No tracked file or path carries the upstream name; upstream attribution lives in `LICENSE` and the README fork notice.
- **No telemetry.** The brainstorm companion serves its own bundled logo; nothing fetches from or reports to a remote host at runtime.
- Upstream-only material is gone: the sponsorship file, the Codex sync pipeline that depended on upstream's marketplace fork, the issue templates that routed reports upstream, and the code of conduct that sent incident reports to the upstream maintainers.

### Documentation

- `AGENTS.md` is the guide for agents and contributors: the layout, the rules (zero dependencies, skill bodies are code, no telemetry, versions, line endings) and every offline test suite.
- `docs/porting-to-a-new-harness.md` matches the code and indexes every integration in this repository; `docs/windows/polyglot-hooks.md` describes the hardened wrapper; `docs/testing.md` lists every suite.
- The design history of each piece is in `docs/ultrapowers/specs/` and `docs/ultrapowers/plans/`.
