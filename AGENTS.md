# Ultrapowers — Guide for Agents and Contributors

This file is the instruction file for any agent working in this repository and the contributor guide for humans. Read it before changing anything.

## What this repository is

Ultrapowers is a skills plugin for coding agents: a `skills/` library, a session-start bootstrap that loads `skills/using-ultrapowers/SKILL.md`, and one thin adapter per harness. It is a fork; upstream attribution lives in `LICENSE` and the README fork notice and nowhere else. The design history that motivated each change is under `docs/ultrapowers/specs/` and `docs/ultrapowers/plans/`.

## Repository layout

| Path | Purpose |
|---|---|
| `skills/<name>/SKILL.md` | One skill per directory. Frontmatter `name` must equal the directory name. Supporting prompts, templates and references live beside it. |
| `skills/using-ultrapowers/` | The bootstrap skill injected at session start on every harness; `references/<harness>-tools.md` holds per-harness tool mappings. |
| `skills/init/scripts/init.mjs` | The scaffold engine behind `ultrapowers:init` (scaffold, join, upgrade and repair modes, and `tickets` for ticket sources). It renders `templates/` and never overwrites a file. |
| `skills/new-task/scripts/` | `scaffold-task.sh` and `ticket-lib.sh` (ticket folders, shared with brainstorm-task and task); `ticket-sources.mjs` and `fetch-ticket.mjs` (ticket ids, and fetching a ticket through `gh`, `glab` or the source's MCP server). |
| `templates/` | The project payload init writes: `AGENTS.md` and its importers, the knowledge-base folder READMEs, MCP and harness settings, the repo-hygiene blocks (`_blocks/`), the team-memory store and `qa/known-issues.md`. `CHANGES.json` records the plugin version in which each target last changed, for upgrade mode. |
| `agents/` | `qa-specialist.md`: the QA gatekeeper's contract, the agent the `qa-specialist` skill forks into (or reads inline). |
| `output-styles/` | `ste-explanatory.md`: the Claude Code output style init copies into a project. |
| `hooks/` | `session-start` (bash) emits the bootstrap and the project scaffold nudge as JSON for Claude Code, Cursor, Copilot CLI and Muse; `team-memory-nudge` and `team-memory-postcompact` add the team-memory lines; `qa-guardrail` is the PreToolUse guardrail of a QA run, inert unless `.ultrapowers/qa-active` exists; `lib/` holds their shared code; `run-hook.cmd` is the Windows polyglot wrapper; `hooks.json` and `hooks-cursor.json` register them. `session-start` and the team-memory hooks work with a broken PATH; the guardrail's inert path uses shell builtins only, and an active run without its tools denies. |
| `.claude-plugin/`, `.codex-plugin/`, `.agents/plugins/`, `.cursor-plugin/`, `.devin-plugin/`, `.hermes-plugin/`, `.kimi-plugin/`, `.muse-plugin/`, `gemini-extension.json`, `GEMINI.md`, `package.json`, `index.js` | Per-harness manifests and entry points. `.opencode/plugins/ultrapowers.js` and `.pi/extensions/ultrapowers.ts` are in-process injectors. |
| `.version-bump.json` | The eleven files whose `version` field `scripts/bump-version.sh` keeps in lockstep, plus the audit exclude list. |
| `scripts/` | `bump-version.sh` (version sync and audit), `lint-shell.sh` (ShellCheck plus `bash -n`), `rename-fork.sh` (the parameterised rename used to create this fork). |
| `tests/` | Offline plugin-infrastructure tests, one directory per subject (see below). `tests/claude-code/` also holds model-driven tests that need a Claude Code login. |
| `docs/` | Harness guides (`README.opencode.md`, `README.kimi.md`), `porting-to-a-new-harness.md`, `testing.md`, `windows/polyglot-hooks.md`, and the specs/plans under `docs/ultrapowers/`. |
| `assets/` | `ultrapowers-small.svg` (brand logo, also served by the brainstorm companion) and `app-icon.png`. |

## Rules

1. **Zero dependencies.** The plugin has no runtime dependency on any third-party package or service. Injectors are plain JavaScript/TypeScript with no imports beyond node built-ins (Pi's `import type` is erased at compile time). Do not add one.
2. **Skill bodies are code.** The prose in `skills/*/SKILL.md` shapes agent behavior and was tuned against real sessions. Do not restructure, reword or "modernise" it without evidence from real sessions that the change is an improvement. Red Flags tables, rationalization lists and the phrase "your human partner" are deliberate.
3. **Skill changes go through `ultrapowers:writing-skills`.** Use that skill to develop and test any new or changed skill. Test with subagents under pressure, not just on the happy path, and keep the before/after evidence with the change.
4. **Names.** The plugin, marketplace and skill namespace are `ultrapowers`; skills are invoked as `ultrapowers:<skill>`. The runtime folder is `.ultrapowers/`; environment variables are `ULTRAPOWERS_*`. Do not introduce a second vocabulary.
5. **No telemetry.** Nothing in this repository reports on its users, their projects or their usage to anyone. The plugin's own code opens no network connection; the brainstorm companion serves its own logo. When a skill needs the network for the user's task, such as `new-task` reading a ticket, it goes through a tool the user installed and authenticated (a CLI or an MCP server) to a host the user named in `.agents/ultrapowers.json`.
6. **Versions.** Change the version only with `scripts/bump-version.sh <x.y.z>`, which needs `jq` and mikefarah `yq`. `scripts/bump-version.sh --audit` must end with "All clear". The `#v<version>` install pins in `.opencode/INSTALL.md` and `docs/README.opencode.md` are prose, so update them by hand when you bump, and add the release to `RELEASE-NOTES.md`. The README's release badge reads the latest GitHub release, so it updates itself once the `v<version>` release is published.
7. **Line endings.** Shell scripts, the extensionless helpers under `skills/*/scripts/`, `hooks/session-start` and `*.cmd` are pinned to LF in `.gitattributes`. Keep them that way; a CRLF checkout breaks them in bash.
8. **Commits.** Small, one concern each, with a message that says what changed and why.

## Running the tests

All of these run offline. Prerequisites: bash, node 18+, python 3 with pytest, `jq`, `yq` (mikefarah v4), `shellcheck`.

```bash
bash tests/hooks/test-session-start.sh
bash tests/hooks/test-team-memory-hooks.sh
bash tests/hooks/test-executable-bits.sh
bash tests/hooks/test-run-hook-cmd-windows.sh     # Windows only; skips elsewhere
bash tests/init/run-tests.sh
node --test tests/team-memory/memory-lint.test.mjs
bash tests/team-memory/test-templates.sh
bash tests/team-memory/test-skill-structure.sh
bash tests/team-memory/test-precommit-lint.sh
bash tests/task-lifecycle/test-task-lifecycle.sh
node --test tests/task-lifecycle/ticket-sources.test.mjs
node --test tests/task-lifecycle/fetch-ticket.test.mjs
bash tests/qa-gatekeeper/run-tests.sh
bash tests/skills/test-skill-bodies.sh
node --test tests/pi/test-pi-extension.mjs
bash tests/opencode/run-tests.sh            # unit tests; add --integration for a live OpenCode
python -m pytest tests/hermes
bash tests/kimi/run-tests.sh
bash tests/devin/test-devin-plugin.sh
bash tests/codex/test-marketplace-manifest.sh
bash tests/version-bump/test-bump-version.sh
bash tests/shell-lint/test-lint-shell.sh
bash tests/rename-fork/test-rename-fork.sh
bash tests/antigravity/run-tests.sh
bash tests/diagnosing-ultrapowers/test-skill-structure.sh
bash tests/claude-code/test-sdd-workspace.sh
bash tests/claude-code/test-executing-plans-scripts.sh
bash tests/claude-code/test-worktree-path-policy.sh
(cd tests/brainstorm-server && npm install && npm test)
scripts/lint-shell.sh --all
```

`.github/workflows/ci.yml` runs this list on Linux, and the hook and init suites on Windows, for every pull request to `dev` or `main`. When you add a suite here, add it there too.

On Windows without Developer Mode, Git Bash cannot create symlinks, so `test-plugin-loading.sh` and `test-skill-registration.sh` in `tests/opencode/` fail there for that reason alone; run them on a machine with symlink support.

Model-driven tests (`tests/claude-code/run-skill-tests.sh`, `tests/explicit-skill-requests/`, the OpenCode `--integration` tests) need a logged-in harness and are not part of the offline gate.

## Adding harness support

Read `docs/porting-to-a-new-harness.md`. A real integration loads the `using-ultrapowers` bootstrap at session start, every session, without per-session opt-in. Acceptance test: in a clean session send `Let's make a react todo list`; the `brainstorming` skill must trigger before any code is written. Register any new manifest that carries a version in `.version-bump.json`, and add the new skill test directory to the list above.

## Pull requests

Fill in `.github/PULL_REQUEST_TEMPLATE.md`: what changed, why (the concrete problem), how it was tested, and on which harness. Say whether an agent produced the change and which one. One concern per PR.
