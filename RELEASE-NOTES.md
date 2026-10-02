# Ultrapowers Release Notes

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
