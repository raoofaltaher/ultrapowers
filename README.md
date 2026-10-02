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
  - [When Something Goes Wrong](#when-something-goes-wrong)
  - [What ultrapowers adds](#what-ultrapowers-adds)
  - [What's Inside](#whats-inside)
    - [Skills Library](#skills-library)
    - [Agents and Output Styles](#agents-and-output-styles)
  - [Philosophy](#philosophy)
  - [Community](#community)
  - [Contributing](#contributing)
  - [License](#license)

## How it works

It starts from the moment you fire up your coding agent. The first time you open a project, it notices the project has no Ultrapowers setup and offers `/ultrapowers:init`. You see the exact list of files first, and nothing is written until you say yes.

Then the work runs ticket by ticket. As soon as it sees that you're building something, it *doesn't* just jump into trying to write code. Instead, it steps back and asks you what you're really trying to do. And before it asks its first question, it reads the ticket's brief and the code it is about to change, so the questions are about your real system, not a guess.

Once it's teased a spec out of the conversation, it shows it to you in chunks short enough to actually read and digest.

After you've signed off on the design, your agent puts together an implementation plan that's clear enough for an enthusiastic junior engineer with poor taste, no judgement, no project context, and an aversion to testing to follow. It emphasizes true red/green TDD, YAGNI (You Aren't Gonna Need It), and DRY.

Next up, once you say "go", it launches a *subagent-driven-development* process, having agents work through each engineering task, inspecting and reviewing their work, and continuing forward. It's not uncommon for your agent to work autonomously for a couple hours at a time without deviating from the plan you put together.

When the work is done, a QA agent tests the running app the way a senior human tester would, in a real browser, and leaves one verdict in the ticket's review folder. Anything worth knowing next time goes into the team memory in git, where every developer and every coding agent on the project can find it.

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

1. **`/ultrapowers:init`** - Sets the project up, once. Offered at session start in any git repository without an Ultrapowers setup. It works out the mode (scaffold a new project, join an existing one, upgrade after a plugin update, or repair a broken setup), asks for the project name and the coding agents you use, shows a dry run, and writes only after your yes. It never overwrites a file. You get the knowledge base folders (`tasks/`, `specs/`, `plans/`, `reviews/`, `evals/`, `handbooks/`, `playbooks/`, `brand-book/`, `business/`, `release-notes/`), one `AGENTS.md` for every agent (imported by `CLAUDE.md` and `GEMINI.md`), MCP configuration for nine harnesses, Claude Code settings and output style, the team-memory store, and repo hygiene (a gitleaks pre-commit hook, managed `.gitignore` and `.gitattributes` blocks).

2. **`/ultrapowers:new-task <ticket> [title]`** - Starts a ticket. Creates `tasks/<ID>/`, `specs/<ID>/`, `plans/<ID>/` and `reviews/<ID>/`, writes the brief `tasks/<ID>/<ID>.md` (Context, Definition of Ready, Definition of Done, Related Documentation; two short paragraphs at most), commits it, and hands off to brainstorm-task. A ticket that already exists is never overwritten; it points you to `/ultrapowers:task`.

3. **`/ultrapowers:brainstorm-task <ticket> [focus]`** - Grounds before it asks. Reads the brief, confirms which repositories to read (focus words such as `backend`, `frontend` or a repository name narrow the choice), reads every file the design depends on, strongest match first, with no cap, and prints what it read. Only then does it run **brainstorming**: questions one at a time, alternatives, and the design in sections for your approval. The spec is saved as `specs/<ID>/Spec.md` and committed after your review.

4. **writing-plans** - Activates with the approved spec. Writes `plans/<ID>/Plan.md`: small steps, each one action with a checkable result, with exact file paths, interfaces, test assertions and verification commands. You review the plan before anything runs.

5. **subagent-driven-development** or **executing-plans** - Activates with the plan, in an isolated workspace on a new branch (**using-git-worktrees**). Either dispatches a fresh subagent per task with a review after each (most thorough), or implements every task inline in the current session with one fresh review of the whole branch at the end (cheapest).

6. **test-driven-development** - Activates during implementation. Enforces RED-GREEN-REFACTOR: write failing test, watch it fail, write minimal code, watch it pass, commit. Deletes code written before tests.

7. **requesting-code-review** - The review gate: a review after each task and a review of the whole branch at the end. Reports issues by severity. Critical issues block progress.

8. **`/ultrapowers:qa-specialist <ticket> [note]`** *(beta)* - The QA gate, which you run before you finish the branch. It tests the running app in a real browser for every configured role and language, across seven lanes: UI, logs, API, database, observability, test suites and content. A guardrail keeps the run read-only. It writes `reviews/<ID>/QA-REPORT.md` with one verdict: PASS, PASS-WITH-ISSUES, FAIL, INCOMPLETE or PRECONDITION-FAILED. It never starts or stops your stack and never commits.

9. **finishing-a-development-branch** - Activates when tasks complete. Verifies tests, offers to merge, open a pull request or keep the branch, and cleans up the worktree. Discarding the work needs your explicit request and a typed confirmation.

At any point, **`/ultrapowers:task <ticket>`** tells you where a ticket stands (brief, spec, plan, reviews, branches) and what comes next, without changing anything. And **team-memory** works alongside every step: when the agent verifies a fact that is durable, expensive to rediscover and not already in the code, it saves it to `.agents/memory/` in git, so every developer, every coding agent and every session on the project can use it.

**The agent checks for relevant skills before any task.** Mandatory workflows, not suggestions.

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

- **Test-Driven Development** - Write tests first, always
- **Systematic over ad-hoc** - Process over guessing
- **Complexity reduction** - Simplicity as primary goal
- **Evidence over claims** - Verify before declaring success
- **Set up once, reuse everywhere** - A project's setup is generated, never copied by hand
- **Ground before you ask** - Read the code before designing against it
- **One ticket, one trail** - Brief, spec, plan and review share the ticket id
- **Memory belongs to the team** - What one agent learns, every developer and every agent can reuse, in git
- **Quality is a gate** - A tester's eye on the running app, and one verdict per ticket

## Community

Questions, ideas and feedback are welcome in [Discussions](https://github.com/raoofaltaher/ultrapowers/discussions):

- **[Q&A](https://github.com/raoofaltaher/ultrapowers/discussions/categories/q-a)** - Ask for help with setup or with a skill
- **[Ideas](https://github.com/raoofaltaher/ultrapowers/discussions/categories/ideas)** - Suggest a new skill, harness or feature
- **[Show and tell](https://github.com/raoofaltaher/ultrapowers/discussions/categories/show-and-tell)** - Share what you built with ultrapowers
- **[Announcements](https://github.com/raoofaltaher/ultrapowers/discussions/categories/announcements)** - Release news from the maintainers

Found a bug? [Open an issue](https://github.com/raoofaltaher/ultrapowers/issues/new/choose) with the bug report template.

## Contributing

Read `AGENTS.md` first: it describes the repository layout, the zero-dependency rule, how to run each test suite, and how skill changes are developed and tested with `ultrapowers:writing-skills`. Skill bodies are behavior-shaping content; change them with evidence, not taste.

## License

MIT License - see [LICENSE](./LICENSE) file for details.
