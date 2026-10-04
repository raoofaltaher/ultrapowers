<p align="center">
  <img src="assets/ultrapowers-small.svg" alt="Ultrapowers logo" width="420">
</p>

<p align="center">
  <a href="https://github.com/raoofaltaher/ultrapowers/releases/latest"><img src="https://img.shields.io/github/v/release/raoofaltaher/ultrapowers?style=for-the-badge&label=release&color=8e09fa&labelColor=2d0789&cacheSeconds=300" alt="Latest release" height="40"></a>
</p>

<p align="center">
  🙏 <a href="https://github.com/raoofaltaher/ultrapowers/discussions/new?category=q-a">Ask a question</a>
  &nbsp;·&nbsp;
  💡 <a href="https://github.com/raoofaltaher/ultrapowers/discussions/new?category=ideas">Suggest an idea</a>
  &nbsp;·&nbsp;
  🙌 <a href="https://github.com/raoofaltaher/ultrapowers/discussions/new?category=show-and-tell">Show what you built</a>
  &nbsp;·&nbsp;
  🐛 <a href="https://github.com/raoofaltaher/ultrapowers/issues/new/choose">Report a bug</a>
  &nbsp;·&nbsp;
  💬 <a href="https://github.com/raoofaltaher/ultrapowers/discussions">Join the discussion</a>
</p>

# Ultrapowers

Ultrapowers is a complete software development methodology for your coding agents, built on a set of composable skills and a session-start bootstrap that makes sure your agent uses them.

It also sets your projects up for you. One command writes the same proven setup into every project, for every coding agent you use: the knowledge base, the agent instructions, the MCP servers and settings, and a team memory kept in git. From there, a ticket-driven workflow carries each task from a short brief to a spec grounded in the code, a plan, tested code, and a QA verdict.

You choose how much of that workflow runs on its own. Run the skills by hand, one at a time. Or hand the agent a GitHub or GitLab ticket with one command, `/ultrapowers:autopilot <ticket>`, approve its spec and plan on the ticket, and review its pull request. Or leave a watcher running where your coding agent lives and only touch labels on the ticket. The same gates hold in every form: nothing merges, and nothing pushes outside the approved scope, without a human.

Ultrapowers is a fork of Jesse Vincent's MIT-licensed skills library, cut from its version 6.4.2.

## Table of Contents

- [Ultrapowers](#ultrapowers)
  - [Table of Contents](#table-of-contents)
  - [How it works](#how-it-works)
  - [Installation](#installation)
    - [Claude Code](#claude-code)
    - [Antigravity](#antigravity)
    - [Codex](#codex)
    - [Cursor](#cursor)
    - [Devin CLI](#devin-cli)
    - [Factory Droid](#factory-droid)
    - [Gemini CLI](#gemini-cli)
    - [GitHub Copilot CLI](#github-copilot-cli)
    - [Grok Build CLI](#grok-build-cli)
    - [Kimi Code](#kimi-code)
    - [OpenCode](#opencode)
    - [Pi](#pi)
    - [Qwen Code](#qwen-code)
    - [Hermes Agent](#hermes-agent)
    - [Muse](#muse)
  - [The Basic Workflow](#the-basic-workflow)
  - [Project configuration](#project-configuration)
  - [When Something Goes Wrong](#when-something-goes-wrong)
  - [What ultrapowers adds](#what-ultrapowers-adds)
  - [What's Inside](#whats-inside)
    - [Skills Library](#skills-library)
    - [Agents and Output Styles](#agents-and-output-styles)
  - [Philosophy](#philosophy)
  - [Community](#community)
  - [Contributing](#contributing)
  - [License](#license)
  - [Pipelines](#pipelines)

## How it works

It starts from the moment you fire up your coding agent. The first time you open a project, it notices the project has no Ultrapowers setup and offers `/ultrapowers:init`. You see the exact list of files first, and nothing is written until you say yes.

Then the work runs ticket by ticket. As soon as it sees that you're building something, it *doesn't* just jump into trying to write code. Instead, it steps back and asks you what you're really trying to do. And before it asks its first question, it reads the ticket's brief and the code it is about to change, so the questions are about your real system, not a guess.

Once it's teased a spec out of the conversation, it shows it to you in chunks short enough to actually read and digest.

After you've signed off on the design, your agent puts together an implementation plan that's clear enough for an enthusiastic junior engineer with poor taste, no judgement, no project context, and an aversion to testing to follow. It emphasizes true red/green TDD, YAGNI (You Aren't Gonna Need It), and DRY.

Next up, once you say "go", it launches a *subagent-driven-development* process, having agents work through each engineering task, inspecting and reviewing their work, and continuing forward. It's not uncommon for your agent to work autonomously for a couple hours at a time without deviating from the plan you put together.

When the work is done, a QA agent tests the running app the way a senior human tester would, in a real browser, and leaves one verdict in the ticket's review folder. Anything worth knowing next time goes into the team memory in git, where every developer and every coding agent on the project can find it.

The same workflow runs from a ticket when you want it to. `/ultrapowers:autopilot <ticket>` takes a GitHub or GitLab issue through the brief, the grounded spec and the plan, then stops: a review packet lands on the ticket with links to all three, and you approve it with a label. The engine checks that approval against the tracker (who, with what access, after which packet, on which commits), then implements, reviews and runs QA inside a guardrail that denies the agent any push, merge or tracker write, and opens the pull request for you. A watcher on your machine does the same for tickets you label, so you only interact with the tracker. The agent never pushes, merges or approves; the engine does those steps between stages, and you merge.

There's a bunch more to it, but that's the core of the system. And because the skills trigger automatically, you don't need to do anything special. Your coding agent just has Ultrapowers.

## Installation

Installation differs by harness. If you use more than one, install Ultrapowers separately for each one. Every install below points at this repository: `https://github.com/raoofaltaher/ultrapowers`.

### Claude Code

This repository is its own plugin marketplace (`.claude-plugin/marketplace.json`).

- Register the marketplace:

  ```bash
  /plugin marketplace add raoofaltaher/ultrapowers
  ```

- Install the plugin from it:

  ```bash
  /plugin install ultrapowers@ultrapowers
  ```

- For a local checkout, register the directory instead: `/plugin marketplace add <path-to-your-clone>`, then the same `/plugin install ultrapowers@ultrapowers`.

### Antigravity

```bash
agy plugin install https://github.com/raoofaltaher/ultrapowers
```

Antigravity runs the plugin's session-start hook, so Ultrapowers is active from the first message. Reinstall with the same command to update.

### Codex

Ultrapowers is not listed in the Codex plugin marketplace. The Codex manifest is `.codex-plugin/plugin.json` and the marketplace file is `.agents/plugins/marketplace.json`; clone this repository and register the clone as a plugin source in the Codex `/plugins` interface.

### Cursor

Ultrapowers is not listed in the Cursor plugin marketplace. The Cursor manifest is `.cursor-plugin/plugin.json`; install from a local clone through Cursor's plugin settings.

### Devin CLI

- Install:

  ```bash
  devin plugins install raoofaltaher/ultrapowers
  ```

- Update:

  ```bash
  devin plugins update ultrapowers
  ```

### Factory Droid

- Register the marketplace:

  ```bash
  droid plugin marketplace add https://github.com/raoofaltaher/ultrapowers
  ```

- Install the plugin:

  ```bash
  droid plugin install ultrapowers@ultrapowers
  ```

### Gemini CLI

- Install the extension:

  ```bash
  gemini extensions install https://github.com/raoofaltaher/ultrapowers
  ```

- Update later:

  ```bash
  gemini extensions update ultrapowers
  ```

### GitHub Copilot CLI

- Register the marketplace:

  ```bash
  copilot plugin marketplace add raoofaltaher/ultrapowers
  ```

- Install the plugin:

  ```bash
  copilot plugin install ultrapowers@ultrapowers
  ```

### Grok Build CLI

Ultrapowers is not listed in the xAI plugin marketplace. Install from a local clone of this repository following Grok Build's plugin documentation.

### Kimi Code

- Install directly from this repository:

  ```text
  /plugins install https://github.com/raoofaltaher/ultrapowers
  ```

- Detailed docs: [docs/README.kimi.md](docs/README.kimi.md)

### OpenCode

OpenCode uses its own plugin install; install Ultrapowers separately even if you already use it in another harness.

- Tell OpenCode:

  ```
  Fetch and follow instructions from https://raw.githubusercontent.com/raoofaltaher/ultrapowers/refs/heads/main/.opencode/INSTALL.md
  ```

- Detailed docs: [docs/README.opencode.md](docs/README.opencode.md)

### Pi

Install Ultrapowers as a Pi package from this repository:

```bash
pi install git:github.com/raoofaltaher/ultrapowers
```

For local development, run Pi with this checkout loaded as a temporary package:

```bash
pi -e /path/to/ultrapowers
```

The Pi package loads the Ultrapowers skills and a small extension that injects the `using-ultrapowers` bootstrap at session startup and again after compaction. Pi has native skills, so no compatibility `Skill` tool is required. Subagent and task-list tools remain optional Pi companion packages.

### Qwen Code

Qwen Code installs plugins from Claude Code marketplaces directly.

- Install the plugin from this repository, and pick `ultrapowers` when prompted:

  ```bash
  qwen extensions install raoofaltaher/ultrapowers
  ```

- Update later:

  ```bash
  qwen extensions update ultrapowers
  ```

### Hermes Agent

```bash
hermes plugins install raoofaltaher/ultrapowers --enable
```

Restart any active Hermes sessions after installing. Hermes has no post-compaction hook, so a very long session that compacts over its first turn loses the bootstrap; start a fresh session if skills stop triggering.

### Muse

Ultrapowers is a native Muse plugin. The `using-ultrapowers` bootstrap is injected via the native `SessionStart` hook.

- Install from a local checkout:

  ```bash
  muse plugins install ./
  muse plugins approve ultrapowers
  ```

  Or clone and install:

  ```bash
  git clone https://github.com/raoofaltaher/ultrapowers.git
  muse plugins install ./ultrapowers
  muse plugins approve ultrapowers
  ```

- Update later:

  ```bash
  muse plugins update ultrapowers
  ```

Restart any active Muse sessions after installing so the `SessionStart` hook takes effect. To verify any install, start a fresh session and send `Let's make a react todo list`; a working install auto-triggers `brainstorming` before any code is written.

## The Basic Workflow

From a ticket to a reviewed, tested branch. The agents do the repeatable work; an experienced developer approves the spec and the plan.

1. **`/ultrapowers:init`** - Sets the project up, once. Offered at session start in any git repository without an Ultrapowers setup. It works out the mode (scaffold a new project, join an existing one, upgrade after a plugin update, or repair a broken setup), asks for the project name and the coding agents you use, shows a dry run, and writes only after your yes. It never overwrites a file. You get the knowledge base folders (`tasks/`, `specs/`, `plans/`, `reviews/`, `evals/`, `handbooks/`, `playbooks/`, `brand-book/`, `business/`, `release-notes/`), one `AGENTS.md` for every agent (imported by `CLAUDE.md` and `GEMINI.md`), MCP configuration for nine harnesses, Claude Code settings and output style, the team-memory store, and repo hygiene (a gitleaks pre-commit hook, managed `.gitignore` and `.gitattributes` blocks). It also asks where your tickets live (GitHub Issues, GitLab Issues, Odoo tasks, or local only); `/ultrapowers:init tickets` sets or changes that later. Every setting lands in one file, described in [Project configuration](#project-configuration).

2. **`/ultrapowers:new-task <ticket> [title]`** - Starts a ticket. Creates `tasks/<ID>/`, `specs/<ID>/`, `plans/<ID>/` and `reviews/<ID>/`, writes the brief `tasks/<ID>/<ID>.md` (Context, Definition of Ready, Definition of Done, Related Documentation; two short paragraphs at most), commits it, and hands off to brainstorm-task. A ticket that already exists is never overwritten; it points you to `/ultrapowers:task`. With a ticket source configured, an id such as `GH-web-7`, `GL-billing-api-42` or `ODOO-12-1203` fills the brief from that ticket, through `gh` or `glab` when they are signed in and the source's MCP server otherwise, and keeps a quoted copy in `tasks/<ID>/source.md`. Any other id is a local ticket, as before.

3. **`/ultrapowers:brainstorm-task <ticket> [focus]`** - Grounds before it asks. Reads the brief, confirms which repositories to read (focus words such as `backend`, `frontend` or a repository name narrow the choice), reads every file the design depends on, strongest match first, with no cap, and prints what it read. Only then does it run **brainstorming**: questions one at a time, alternatives, and the design in sections for your approval. The spec is saved as `specs/<ID>/Spec.md` and committed after your review.

4. **writing-plans** - Activates with the approved spec. Writes `plans/<ID>/Plan.md`: small steps, each one action with a checkable result, with exact file paths, interfaces, test assertions and verification commands. You review the plan before anything runs.

5. **subagent-driven-development** or **executing-plans** - Activates with the plan, in an isolated workspace on a new branch (**using-git-worktrees**). Either dispatches a fresh subagent per task with a review after each (most thorough), or implements every task inline in the current session with one fresh review of the whole branch at the end (cheapest).

6. **test-driven-development** - Activates during implementation. Enforces RED-GREEN-REFACTOR: write failing test, watch it fail, write minimal code, watch it pass, commit. Deletes code written before tests.

7. **requesting-code-review** - The review gate: a review after each task and a review of the whole branch at the end. Reports issues by severity. Critical issues block progress.

8. **`/ultrapowers:qa-specialist <ticket> [note]`** *(beta)* - The QA gate, which you run before you finish the branch. It tests the running app in a real browser for every configured role and language, across seven lanes: UI, logs, API, database, observability, test suites and content. A guardrail keeps the run read-only. It writes `reviews/<ID>/QA-REPORT.md` with one verdict: PASS, PASS-WITH-ISSUES, FAIL, INCOMPLETE or PRECONDITION-FAILED. It never starts or stops your stack and never commits.

9. **finishing-a-development-branch** - Activates when tasks complete. Verifies tests, offers to merge, open a pull request or keep the branch, and cleans up the worktree. Discarding the work needs your explicit request and a typed confirmation.

10. **`/ultrapowers:autopilot <ticket> [--mode off|gated|full]`** *(beta)* - Runs steps 2 to 9 for one GitHub or GitLab ticket with the human gates on the tracker instead of in the chat. It has two doors: the command, which you run in a session, and a watcher, `autopilot.mjs watch`, which runs on the machine that hosts your coding agent and picks up tickets a human labelled. In `gated` mode the run stops twice: at a review packet on the ticket, with links to the brief, the spec with its assumption ledger and the plan, which you approve with a label, and at the pull requests, one per repository in scope. In `full` mode only the pull requests wait for you. The engine keeps a hash-chained stage log per ticket, pushes and writes to the tracker itself, and a guardrail envelope keeps the agent from pushing, merging or writing to the tracker. Set it up with `/ultrapowers:init autopilot`; `docs/autopilot-watcher.md` covers the watcher as a service.

At any point, **`/ultrapowers:task <ticket>`** tells you where a ticket stands (brief, spec, plan, reviews, branches) and what comes next, without changing anything. And **team-memory** works alongside every step: when the agent verifies a fact that is durable, expensive to rediscover and not already in the code, it saves it to `.agents/memory/` in git, so every developer, every coding agent and every session on the project can use it.

**The agent checks for relevant skills before any task.** Mandatory workflows, not suggestions.

**Where this is going** *(roadmap, not shipped yet)*: a CI door, where a label on the ticket starts the same engine on a runner your CI provides; Odoo write-back, so an Odoo task gets the packet and the approval the way a GitHub or GitLab issue does; and per-ticket lanes that pick how many gates a ticket needs from its risk.

## Project configuration

`/ultrapowers:init` writes `.agents/ultrapowers.json`. Commit it: every developer and every agent on the project reads the same settings. Change it by hand, or with `/ultrapowers:init tickets` for ticket sources.

```json
{
  "name": "acme-platform",
  "pluginVersion": "x.y.z",
  "scaffoldedAt": "2026-10-02",
  "topology": "nested",
  "commitTrailer": "",
  "ticketPattern": "^#?[A-Za-z0-9][A-Za-z0-9._-]*$",
  "repos": [
    { "name": "billing-api", "path": "billing-api", "defaultBranch": "main", "area": "backend" },
    { "name": "web", "path": "web", "defaultBranch": "develop", "area": "frontend" }
  ],
  "harnesses": ["claude-code", "codex", "cursor"],
  "kb": ["tasks", "specs", "plans", "reviews", "evals", "handbooks", "brand-book", "business", "playbooks", "release-notes"],
  "memory": { "path": ".agents/memory", "indexBudget": 150, "rediscoveryMinutes": 15, "trailer": "Memory-Ref" },
  "tickets": {
    "transport": "auto",
    "sources": [
      { "prefix": "GL", "provider": "gitlab", "host": "gitlab.com", "namespace": "acme/platform", "defaultProject": "tracker" },
      { "prefix": "GH", "provider": "github", "owner": "acme" },
      { "prefix": "ODOO", "provider": "odoo", "url": "https://erp.example.com", "mcpUrl": "https://erp.example.com/mcp", "mcpHeader": "Authorization: Bearer" }
    ]
  },
  "autopilot": { "mode": "gated", "baseBranch": "dev", "approvers": ["alice"], "execution": "subagent", "harness": "claude-code" },
  "qa": { "urls": { "frontend": "http://localhost:3000" }, "roles": [ { "name": "user", "userEnv": "QA_USER_USER", "passwordEnv": "QA_PW_USER", "required": true } ] },
  "written": [".mcp.json", "AGENTS.md"]
}
```

| Key | What it holds | Your options |
|---|---|---|
| `name` | The project name | Any text without `"` or `\` |
| `pluginVersion`, `scaffoldedAt`, `written` | The plugin version, date and files of the last init | Init sets these; do not edit |
| `topology` | `root` (one repository) or `nested` (clones inside the workspace) | Init detects it |
| `commitTrailer` | A line added to every commit the skills make | Empty, or for example `Reviewed-by: Name` |
| `ticketPattern` | The regular expression a ticket id must match | Tighten it, for example `^PROJ-[0-9]+$` |
| `repos` | The nested clones: `name`, `path`, `defaultBranch` | Add `area` (for example `backend`) so `brainstorm-task backend` picks that clone |
| `harnesses` | The coding agents init writes files for | Any of `claude-code`, `codex`, `cursor`, `copilot`, `gemini`, `qwen`, `opencode`, `factory`, `kimi`, `devin`, `antigravity`, `hermes`, `pi`, `muse` |
| `kb` | The knowledge base folders | The ten folders init writes |
| `memory` | Team memory: its folder, the index line budget, the minutes a fact must take to rediscover before it is worth saving, the commit trailer | Raise `indexBudget` for a large team |
| `tickets` | Where tickets come from; no key means local tickets only | See the next table |
| `autopilot` | How automated a ticket's run is; no key means the manual workflow | See the second table below; set it with `/ultrapowers:init autopilot` |
| `qa` | QA gatekeeper settings: `urls`, `hosts`, `auth`, `roles`, `languages`, `containers`, `db`, `suites`, `observability`, `brand`, `regression`, `knownIssues`, `api` | Fill what your app has; the qa-specialist skill lists any missing key before a run |

One entry of `tickets.sources` (the id of its tickets is `<prefix>-<project>-<number>`, for example `GL-billing-api-42`):

| Field | For | Value |
|---|---|---|
| `prefix` | all | Capital letters and digits, unique, for example `GL` |
| `provider` | all | `github`, `gitlab` or `odoo` |
| `owner` | GitHub | The user or organization |
| `host`, `namespace` | GitLab | `host` defaults to `gitlab.com`; `namespace` is the group path |
| `url`, `mcpUrl`, `mcpHeader` | Odoo | The Odoo address, your team's MCP server, and `Authorization: Bearer` or a key header such as `X-Api-Key` (leave it out for browser sign-in) |
| `projects` | GitHub, GitLab | Optional map from a short project name to its full path |
| `defaultProject` | all | Optional; lets `GL-42` mean the default project |
| `transport` | all, or the whole block | `auto` (the CLI when signed in, else the MCP server), `cli` or `mcp` |

Tokens never go in this file. Put them in your environment; `.agents/mcp-secrets.env.example` lists their names (`GH_TOKEN`, `GITLAB_TOKEN`, `ODOO_API_KEY`).

The `autopilot` block (every field but `mode` is optional):

| Field | Value |
|---|---|
| `mode` | `off` (the manual workflow), `gated` (stops at the review packet and at the pull requests) or `full` (stops at the pull requests only). A ticket overrides it with `--mode` on the command or a label `up:mode:<mode>` |
| `baseBranch` | The base of the ticket branch in the documents repository, this workspace root; default the remote HEAD. Code repositories use their own `defaultBranch` from `repos` |
| `approvers` | Tracker logins allowed to approve a packet; empty means any member with write access, including the account the engine runs as, so you approve your own tickets. If the engine runs as a bot, list your human approvers here to keep the bot out |
| `execution` | `subagent` (a fresh subagent per plan task, the default) or `inline` |
| `harness` | The headless harness the watcher spawns for each stage: `claude-code` (default), `codex`, `copilot`, `cursor`, `gemini`, `qwen`, `opencode`, `pi`, `droid`, `kimi`, `hermes` or `antigravity`. `devin` is accepted for a session and refused by the watcher, because its plugin hooks fail open. See "Where the envelope runs" below |
| `watchSelfApproval` | `false` by default: the watcher does not take an approval from the account it runs as. `true` lets a solo developer approve their own tickets from a watcher that runs under their account; it counts only when the read-only stage tokens in `docs/autopilot-watcher.md` are set |
| `watch.sharedCredentials` | `false` by default: a watcher starts only with read-only stage tokens in its environment. `true` lets its stages run with the engine's own credentials, which a team says in writing here |
| `events` | The six label names, defaults `up:ready`, `up:approve`, `up:changes`, `up:hold`, `up:running`, `up:blocked` |
| `watch` | `intervalSec` (default 60) and `maxConcurrent` (default 1) for the watcher |

Autopilot needs a GitHub or GitLab source in `tickets`. The engine writes `tasks/<ID>/autopilot.json` and a hash-chained `tasks/<ID>/stage-log.jsonl` on the ticket branch; `/ultrapowers:task` reads them first.

**Where the envelope runs.** The engine, the skill, the tracker write-back through `gh` and `glab`, and the watcher are the same on every harness. What differs is how each harness runs the guardrail, the hook that denies a push, a merge or a tracker write to the agent during a stage:

| Harness | The guardrail during a session stage | A watcher stage (`autopilot.harness`) | Notes |
|---|---|---|---|
| Claude Code | plugin hook `hooks/hooks.json` (PreToolUse) | yes | Verified live (the session door, GitHub). Only the project's `.mcp.json` servers load into a headless stage. A hook that crashes or exceeds its timeout is non-blocking in Claude Code; the deny path is exit 2 |
| Codex | plugin hook `hooks/hooks-codex.json` | yes | Trust the plugin's hooks once with `/hooks`; the watcher passes `--dangerously-bypass-hook-trust`. Edits through `apply_patch` are checked file by file |
| GitHub Copilot CLI | plugin hook `hooks/hooks.json` | yes | A failing hook denies the call |
| Cursor | plugin hook `hooks/hooks-cursor.json`, `failClosed` | yes (`agent -p`) | |
| Muse | plugin hook (PreToolUse) | no headless CLI | |
| Qwen Code | the extension's `hooks/hooks.json` (PreToolUse) | yes | |
| Gemini CLI | the project `BeforeTool` hook init writes to `.gemini/settings.json`, which runs the extension's guardrail | yes | Set `ULTRAPOWERS_PLUGIN_ROOT` when the extension is not under `~/.gemini/extensions/ultrapowers`. A hook that writes anything but JSON to stdout is ignored by Gemini |
| Factory Droid | plugin hook `hooks/hooks.json` | yes | |
| Kimi Code | plugin hook in `.kimi-plugin/plugin.json`, through `hooks/lib/guardrail-cli.mjs` | yes | Like Gemini CLI, Qwen Code and Droid, Kimi lets a crashed or timed-out hook through; the deny path itself is exit 2 |
| Grok Build CLI | not verified: install it through the Claude Code marketplace path and check that `hooks/hooks.json` fires | no adapter | Run its tickets from a session once the hook is confirmed |
| OpenCode | in process, `tool.execute.before` in the plugin | yes | Never run it with `--pure`, which drops the plugin |
| Pi | in process, the extension's `tool_call` handler | yes | The watcher loads this extension and no other |
| Hermes Agent | in process, the plugin's `pre_tool_call` (fails closed) | yes | The plugin must be in `plugins.enabled`; the watcher passes `--accept-hooks` |
| Antigravity | plugin hook `hooks.json` at the plugin root, through `guardrail-cli.mjs --antigravity` | yes (`agy -p`) | From its documentation only: Antigravity runs plugin hooks in its CLI, the IDE surface and its crash behaviour are not confirmed |
| Devin | `hooks/hooks.json`, which Devin documents as best effort and fail open | refused | A Devin session has no reliable envelope; use the project's own `permissions.deny` rules as the brake |

On every harness the deny is the same exit code 2 with the reason on stderr, which each of them turns into a blocked call the agent can read. Only Claude Code's session door has been run live; the other rows rest on this repository's offline tests and on each vendor's documentation, and `tests/autopilot/test-adapters.sh` checks the headless flags against the CLIs installed on a machine. The hook matches patterns; it is not a sandbox. A build script a stage runs can execute anything the hook never sees, so the credentials a stage holds and the host it runs on are the boundary that counts: see `docs/autopilot-watcher.md`. On GitLab, "write access" means Maintainer or above.

## When Something Goes Wrong

Sometimes a session misbehaves: a skill fires when it shouldn't, stays silent when it should, or the agent ignores its plan, repeats work, or burns more tokens than you'd expect. Ask your coding agent to "figure out what went wrong with ultrapowers in this session" and it will invoke the **diagnosing-ultrapowers** skill. To examine an earlier session, name it: "figure out what went wrong with ultrapowers in session `<id>`".

The skill reads the session transcript, reports what happened with line-level evidence, and, if you want, packages a scrubbed bundle for a bug report.

## What ultrapowers adds

Everything above the original methodology, built from real daily work across many projects:

- **Scaffold engine and baseline payload** - `/ultrapowers:init` writes the same proven setup into every project and keeps it current with join, upgrade and repair modes. No more copying the setup from the last project and adapting it by hand every few days.
- **Knowledge base and AI configuration for the full development lifecycle** - Ten knowledge base folders, each with a README that says what belongs there. One `AGENTS.md` serves every coding agent; one `.mcp.json` is rendered into each harness's own MCP format; settings, output style and repo hygiene come with it.
- **Easy-to-repeat workflows for new projects** - The same commands and the same folder layout in every project, so neither you nor your agents relearn the setup each time.
- **Task lifecycle skills** - `new-task`, `brainstorm-task` and `task` keep one ticket id across `tasks/`, `specs/`, `plans/` and `reviews/`, so every brief, spec, plan and QA report for a ticket is in one predictable place. Brainstorming reads the code first, so the plan meets no surprises.
- **Team memory** - Verified, durable lessons live in `.agents/memory/` in the repository: shared across developers, across coding agents and across sessions. Hooks remind the agent to save them, and a lint keeps the store small and clean.
- **QA gatekeeper** *(beta)* - A seven-lane QA agent that tests the running app the way a senior human tester does, under a read-only guardrail, and leaves one verdict per ticket.

## What's Inside

### Skills Library

**Project setup and tickets**
- **init** - Scaffold, join, upgrade or repair a project's Ultrapowers setup; writes only after your yes
- **new-task** - Open a ticket: its four folders and a short brief
- **brainstorm-task** - Read the brief and the code, then brainstorm the ticket's spec
- **task** - Where a ticket stands and what comes next (read-only)

**Automation** *(beta)*
- **autopilot** - Run one GitHub or GitLab ticket from brief to pull request with the human gates on the tracker: `/ultrapowers:autopilot <ticket>` in a session, or `autopilot.mjs watch` on the machine that hosts your coding agent; configured with `/ultrapowers:init autopilot`

**Team knowledge**
- **team-memory** - Remember, recall, prune and lint the team's shared memory in `.agents/memory/`

**Quality gate** *(beta)*
- **qa-specialist** - Run the seven-lane QA gate for a ticket and leave one verdict in `reviews/<ID>/QA-REPORT.md`
- **qa-lane-1-ui**, **qa-lane-2-logs**, **qa-lane-3-api**, **qa-lane-4-db**, **qa-lane-5-observability**, **qa-lane-6-suites**, **qa-lane-7-content**, **qa-report** - The lanes and the report format the QA agent uses; not invoked directly

**Testing**
- **test-driven-development** - RED-GREEN-REFACTOR cycle (includes the writing-good-tests reference)

**Debugging**
- **systematic-debugging** - 4-phase root cause process (includes root-cause-tracing, defense-in-depth, condition-based-waiting techniques)
- **verification-before-completion** - Ensure it's actually fixed
- **diagnosing-ultrapowers** - Work out what went wrong in a session, with evidence; export a scrubbed bundle or file an issue

**Collaboration**
- **brainstorming** - Socratic design refinement
- **writing-plans** - Detailed implementation plans
- **executing-plans** - Inline plan execution: one context, one final review
- **dispatching-parallel-agents** - Concurrent subagent workflows
- **requesting-code-review** - Pre-review checklist
- **receiving-code-review** - Responding to feedback
- **using-git-worktrees** - Parallel development branches
- **finishing-a-development-branch** - Merge/PR decision workflow
- **subagent-driven-development** - A fresh subagent per task, a review after each task, and a final review of the whole branch

**Meta**
- **writing-skills** - Create new skills following best practices (includes testing methodology)
- **using-ultrapowers** - Introduction to the skills system

### Agents and Output Styles

- **`agents/qa-specialist.md`** *(beta)* - The QA gatekeeper's contract: the agent the qa-specialist skill runs, forked where the harness supports it and inline elsewhere
- **`output-styles/ste-explanatory.md`** - Explanatory answers in Simplified Technical English, with short insights about the choices made; init installs it for Claude Code, and every other agent gets the same rules through `AGENTS.md`

## Philosophy

Ultrapowers exists to help developers and teams who work from tickets automate as much of their work as they can, without lowering its quality. Agents take the repeatable steps; experienced people keep the decisions that need judgment. Have an idea for where this goes next? Bring it to [Discussions](https://github.com/raoofaltaher/ultrapowers/discussions/categories/ideas).

- **Automate the repeatable, keep the judgment** - Agents do the routine work; people approve the spec and the plan
- **Speed with gates** - Every step that runs faster still passes TDD, review and the QA verdict
- **Test-Driven Development** - Write tests first, always
- **Systematic over ad-hoc** - Process over guessing
- **Complexity reduction** - Simplicity as primary goal
- **Evidence over claims** - Verify before declaring success
- **Set up once, reuse everywhere** - A project's setup is generated, never copied by hand
- **Ground before you ask** - Read the code before designing against it
- **One ticket, one trail** - Brief, spec, plan and review share the ticket id
- **Memory belongs to the team** - What one agent learns, every developer and every agent can reuse, in git
- **Quality is a gate** - A tester's eye on the running app, and one verdict per ticket
- **Autonomous between your gates** - Automation runs where your agent already runs, stops at the spec-and-plan packet and at the pull request, and leaves one trail per ticket

## Community

Questions, ideas and feedback are welcome in [Discussions](https://github.com/raoofaltaher/ultrapowers/discussions):

- **[Q&A](https://github.com/raoofaltaher/ultrapowers/discussions/categories/q-a)** - Ask for help with setup or with a skill
- **[Ideas](https://github.com/raoofaltaher/ultrapowers/discussions/categories/ideas)** - Suggest a new skill, harness or feature
- **[Show and tell](https://github.com/raoofaltaher/ultrapowers/discussions/categories/show-and-tell)** - Share what you built with ultrapowers
- **[Announcements](https://github.com/raoofaltaher/ultrapowers/discussions/categories/announcements)** - Release news from the maintainers

Found a bug? [Open an issue](https://github.com/raoofaltaher/ultrapowers/issues/new/choose) with the bug report template.

## Contributing

Pull requests are not accepted. Report bugs and request features through issues, and ask questions in Discussions. See [CONTRIBUTING.md](./CONTRIBUTING.md). This project follows the [Contributor Covenant](./CODE_OF_CONDUCT.md).

## License

Proprietary, source-available. Copyright (c) 2026 RAOOF ALTAHER. All rights reserved. You may install the plugin in your AI agent or coding tool and use it there; you may not copy, modify, redistribute or sell it. See [LICENSE](./LICENSE). Releases published before this license were under the MIT License and stay under it; section 6 of the license sets the cutoff. The portions that come from the upstream library keep their MIT License; section 7 of the license reproduces its notice.

## Pipelines

The same workflow, four ways to run it. Every one keeps the brief, spec, plan and review under the ticket id in the documents repository, the workspace root where init ran; code repositories are that root in a single-repository project, or the nested clones listed in `repos`.

**Manual** - every skill invoked by you; no `autopilot` block.

```text
 DEVELOPER in a session
   /ultrapowers:new-task <ID> ─► tasks/<ID>/<ID>.md          (from GitHub, GitLab, Odoo or typed)
   /ultrapowers:brainstorm-task ► specs/<ID>/Spec.md           ◄ you answer each question
   writing-plans              ─► plans/<ID>/Plan.md           ◄ you review the plan
   executing-plans | subagent-driven-development, TDD, reviews ◄ a branch in each repo you choose
   /ultrapowers:qa-specialist ─► reviews/<ID>/QA-REPORT.md
   finishing-a-development-branch                             ◄ you pick merge, PR or keep
```

Two choices make the pipeline: who starts a run (you, with the command, or the watcher, from a label) and how many gates it has (`gated`, two; `full`, one). Start manual, move to the command, then to the watcher; keep `gated` until a team has a track record. The session door on Claude Code with GitHub has run live (`tests/autopilot/acceptance-2026-10.md`); the watcher and `full` mode are **beta** until their own live runs are recorded.

**Gated autopilot** - `autopilot.mode: gated`; two human gates, both on the tracker and the pull requests.

```text
 TRACKER (GitHub or GitLab issue)
        │ /ultrapowers:autopilot <ID>   (a session)   or   a watcher saw the up:ready label
        ▼
 DOCUMENTS REPOSITORY, branch <ID>-<slug> off autopilot.baseBranch
   scaffold ─► spec (assumption ledger, repositories in scope) ─► plan
        │ engine: commit, push, review packet posted on the ticket (<25 lines, links at <sha>)
        ▼
 GATE 1 ── a member with write access adds up:approve ── up:changes loops back with a comment
        │ engine: label verified (actor, time, unchanged tips), scope frozen
        ▼
 CODE REPOSITORIES, same branch name, a worktree per repo in scope
   execute (TDD, per-task review) ─► qa (when configured; FAIL stops the run)
        │ engine: push each branch, one PR/MR per repo + one for the documents, closing comment
        ▼
 GATE 2 ── you review and merge the pull requests
```

**Full autopilot** *(beta)* - `autopilot.mode: full`; the packet is posted for the record and the run continues.

```text
 TRACKER ── up:ready ──► scaffold ─► spec ─► plan ─► packet posted (no wait) ─► execute ─► qa ─► PRs
                                                            │                        │
                                                   up:hold pauses here        FAIL stops here
 GATE ── you review and merge the pull requests; the packet and the stage log are the record
```

**Watcher on a VM** *(beta)* - `autopilot.mjs watch`, a service on the machine that hosts your coding agent.

```text
 every autopilot.watch.intervalSec:
   .ultrapowers/autopilot-stop exists? ─► idle
   for each GitHub or GitLab source with a defaultProject:
     list open tickets labelled up:ready | up:approve | up:changes
   skip a ticket a session holds (lock) ─► run the rest one at a time:
     next ─► one fresh headless harness call per agent stage (claude-code)
          ─► engine steps for the gate and the pull requests ─► wait | done | stop
   tracker error? sleep doubles, up to 10 minutes
```

The watcher runs the agent with permission prompts bypassed inside the guardrail's autopilot envelope: no push, no merge, no tracker write, no edit to the configuration, hooks, CI or settings. It starts only with read-only stage tokens in its environment, unless the project says `watch.sharedCredentials: true`; with them, the engine's tokens and the ssh agent are removed from the stage, and on Claude Code only the project's MCP servers load. The hook matches patterns; it is not a sandbox. Run the watcher on a disposable host that holds nothing else, with HTTPS remotes and branch protection on every base branch; `docs/autopilot-watcher.md` has the checklist.
