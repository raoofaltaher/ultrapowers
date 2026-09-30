# Ultrapowers

Ultrapowers is a complete software development methodology for your coding agents, built on a set of composable skills and a session-start bootstrap that makes sure your agent uses them.

Ultrapowers is a fork of Jesse Vincent's MIT-licensed skills library, cut from its version 6.4.2. The original copyright notice is kept in `LICENSE`.

## Table of Contents

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
- [Philosophy](#philosophy)
- [Contributing](#contributing)
- [License](#license)

## How it works

It starts from the moment you fire up your coding agent. As soon as it sees that you're building something, it *doesn't* just jump into trying to write code. Instead, it steps back and asks you what you're really trying to do.

Once it's teased a spec out of the conversation, it shows it to you in chunks short enough to actually read and digest.

After you've signed off on the design, your agent puts together an implementation plan that's clear enough for an enthusiastic junior engineer with poor taste, no judgement, no project context, and an aversion to testing to follow. It emphasizes true red/green TDD, YAGNI (You Aren't Gonna Need It), and DRY.

Next up, once you say "go", it launches a *subagent-driven-development* process, having agents work through each engineering task, inspecting and reviewing their work, and continuing forward. It's not uncommon for your agent to work autonomously for a couple hours at a time without deviating from the plan you put together.

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

1. **brainstorming** - Activates before writing code. Refines rough ideas through questions, explores alternatives, presents design in sections for validation. Saves design document.

2. **using-git-worktrees** - Activates after design approval. Creates isolated workspace on new branch, runs project setup, verifies clean test baseline.

3. **writing-plans** - Activates with approved design. Breaks work into bite-sized tasks (2-5 minutes each). Every task has exact file paths, complete code, verification steps.

4. **subagent-driven-development** or **executing-plans** - Activates with plan. Either dispatches a fresh subagent per task with a review after each (most thorough), or implements every task inline in the current session with one fresh review of the whole branch at the end (cheapest).

5. **test-driven-development** - Activates during implementation. Enforces RED-GREEN-REFACTOR: write failing test, watch it fail, write minimal code, watch it pass, commit. Deletes code written before tests.

6. **requesting-code-review** - Activates between tasks. Reviews against plan, reports issues by severity. Critical issues block progress.

7. **finishing-a-development-branch** - Activates when tasks complete. Verifies tests, presents options (merge/PR/keep/discard), cleans up worktree.

**The agent checks for relevant skills before any task.** Mandatory workflows, not suggestions.

## When Something Goes Wrong

Sometimes a session misbehaves: a skill fires when it shouldn't, stays silent when it should, or the agent ignores its plan, repeats work, or burns more tokens than you'd expect. Ask your coding agent to "figure out what went wrong with ultrapowers in this session" and it will invoke the **diagnosing-ultrapowers** skill. To examine an earlier session, name it: "figure out what went wrong with ultrapowers in session `<id>`".

The skill reads the session transcript, reports what happened with line-level evidence, and, if you want, packages a scrubbed bundle for a bug report.

## What ultrapowers adds

Piece 1, the first release, is the rename and fork hygiene: one name everywhere, fork-owner identity in every manifest, nothing fetched from or reported to a remote host, no upstream-only publishing tooling. The pieces that make ultrapowers more than a rename each have a spec under `docs/ultrapowers/specs/` and land in later releases:

- Piece 2: scaffold engine and baseline payload
- Piece 3: task lifecycle skills
- Piece 4: team memory
- Piece 5: QA gatekeeper

## What's Inside

### Skills Library

**Testing**
- **test-driven-development** - RED-GREEN-REFACTOR cycle (includes testing anti-patterns reference)

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
- **subagent-driven-development** - Fast iteration with two-stage review (spec compliance, then code quality)

**Meta**
- **writing-skills** - Create new skills following best practices (includes testing methodology)
- **using-ultrapowers** - Introduction to the skills system

## Philosophy

- **Test-Driven Development** - Write tests first, always
- **Systematic over ad-hoc** - Process over guessing
- **Complexity reduction** - Simplicity as primary goal
- **Evidence over claims** - Verify before declaring success

## Contributing

Read `AGENTS.md` first: it describes the repository layout, the zero-dependency rule, how to run each test suite, and how skill changes are developed and tested with `ultrapowers:writing-skills`. Skill bodies are behavior-shaping content; change them with evidence, not taste.

## License

MIT License - see LICENSE file for details. Ultrapowers keeps the upstream copyright line alongside its own.
