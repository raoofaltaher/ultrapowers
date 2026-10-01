# Testing Ultrapowers

Ultrapowers ships offline plugin-infrastructure tests under `tests/`, one directory per subject. They check that the non-LLM code works: hooks, manifests, injectors, the brainstorm companion server, the SDD scripts and the helper scripts. Skill behavior on real model sessions is judged with the `writing-skills` skill's subagent pressure tests and is not part of this suite.

## Suites and how to run them

| Directory | Subject | Run |
|---|---|---|
| `tests/hooks/` | `hooks/session-start` output shape per harness and the project scaffold nudge; the two team-memory hooks (silent without a store, per-harness JSON shape, nested-clone discovery, Windows cwd, empty stdin, registrations in `hooks.json`, `hooks-cursor.json` and the Muse manifest); executable bits on scripts run by path; the Windows half of `run-hook.cmd` (exit code passed through, per-user Git found, WSL launchers and the current directory never run; skips without cmd.exe) | `bash tests/hooks/test-session-start.sh`, `bash tests/hooks/test-team-memory-hooks.sh`, `bash tests/hooks/test-executable-bits.sh`, `bash tests/hooks/test-run-hook-cmd-windows.sh` |
| `tests/init/` | Init engine (rendering, managed blocks, MCP transforms, join and upgrade), template leak scan, OpenCode and Pi nudges, init skill structure | `bash tests/init/run-tests.sh` |
| `tests/team-memory/` | `memory-lint.mjs` (one test per finding code, code spans and OS files, CRLF, budget from config, promotion of a real personal memory file, CLI exit codes); store templates rendered through init; skill frontmatter and forge neutrality; the pre-commit lint block | `node --test tests/team-memory/memory-lint.test.mjs`, `bash tests/team-memory/test-templates.sh`, `bash tests/team-memory/test-skill-structure.sh`, `bash tests/team-memory/test-precommit-lint.sh` |
| `tests/task-lifecycle/` | Helper scripts of the new-task, brainstorm-task and task skills on temp scaffolded projects: root walk-up to `.agents/ultrapowers.json`, ticket pattern accept and reject, refusal on an existing task, spec collision detection, repo selection, the eight-file grounding cap, the read-only manifest, the KB routing bullets and the Muse manifest; skill frontmatter, required sections and no harness tool names | `bash tests/task-lifecycle/test-task-lifecycle.sh` |
| `tests/qa-gatekeeper/` | QA gatekeeper (piece 5): templates and config (`test-templates.sh`); the reference-leak scan (`test-no-reference-leaks.sh`; point `ULTRAPOWERS_FORBIDDEN_PATTERNS_FILE` at your private, untracked pattern file to extend it); the guardrail fixtures with and without the run marker (`test-qa-guardrail.sh`); the lane 6 judge and suite runner (`judge.test.mjs`, `test-run-suite.sh`); the preflight (`qa-preflight.test.mjs`); agent and skill structure with config-key and gate consistency (`test-skill-structure.sh`); the report and resume checker (`check-report.test.mjs`); the sample project (`test-sample-app.sh`, needs `curl` and a free local port) | `bash tests/qa-gatekeeper/run-tests.sh` |
| `tests/skills/` | Every `SKILL.md`: the argument placeholder at most once and no positional token (`$0` to `$9`), both of which Claude Code substitutes in a skill body, and no example that prints the value of the variable it checks | `bash tests/skills/test-skill-bodies.sh` |
| `tests/pi/` | Pi extension registration, bootstrap injection and the team-memory lines | `node --test tests/pi/test-pi-extension.mjs` |
| `tests/opencode/` | OpenCode plugin loading, bootstrap caching, session classification, V2 skill registration, team-memory nudge and post-compaction lines | `bash tests/opencode/run-tests.sh` (unit); `--integration` needs OpenCode installed |
| `tests/hermes/` | Hermes plugin layout resolution, bootstrap, scaffold nudge and the first-turn team-memory line | `python -m pytest tests/hermes` |
| `tests/kimi/` | Kimi manifest wiring | `bash tests/kimi/run-tests.sh` |
| `tests/devin/` | Devin manifest | `bash tests/devin/test-devin-plugin.sh` |
| `tests/codex/` | Codex marketplace and manifest | `bash tests/codex/test-marketplace-manifest.sh` |
| `tests/version-bump/` | `scripts/bump-version.sh` against fixtures (needs `jq`, `yq`) | `bash tests/version-bump/test-bump-version.sh` |
| `tests/shell-lint/` | `scripts/lint-shell.sh` against fixtures | `bash tests/shell-lint/test-lint-shell.sh` |
| `tests/rename-fork/` | `scripts/rename-fork.sh` against a throwaway repo | `bash tests/rename-fork/test-rename-fork.sh` |
| `tests/antigravity/` | Antigravity tool mapping reference | `bash tests/antigravity/run-tests.sh` |
| `tests/diagnosing-ultrapowers/` | Structure of the diagnosing skill (frontmatter, referenced files, leak scan, word budget) | `bash tests/diagnosing-ultrapowers/test-skill-structure.sh` |
| `tests/brainstorm-server/` | Companion server: WebSocket protocol, auth, branding, lifecycle | `cd tests/brainstorm-server && npm install && npm test` |
| `tests/claude-code/` | SDD workspace and executing-plans scripts; worktree path policy | `bash tests/claude-code/test-sdd-workspace.sh`, `bash tests/claude-code/test-executing-plans-scripts.sh`, `bash tests/claude-code/test-worktree-path-policy.sh` |

Shell scripts are linted with `scripts/lint-shell.sh --all` (ShellCheck plus `bash -n`/`sh -n`).

On Windows without Developer Mode, Git Bash cannot create symlinks, so `test-plugin-loading.sh` and `test-skill-registration.sh` in `tests/opencode/` fail there for that reason alone; run them on a machine with symlink support.

## Model-driven tests

`tests/claude-code/run-skill-tests.sh`, `tests/claude-code/test-subagent-driven-development*.sh`, `tests/claude-code/test-worktree-native-preference.sh` and everything under `tests/explicit-skill-requests/` drive a real Claude Code session and need a logged-in CLI. They are slow, cost tokens, and are run on demand, not as a gate. The init skill's pressure scenarios and their recorded baseline and with-skill results are in `tests/init/pressure-scenarios.md` and `tests/init/pressure-results.md`; the team-memory skill's are in `skills/team-memory/CREATION-LOG.md`; the task lifecycle skills' are in `tests/task-lifecycle/pressure-scenarios.md` and `tests/task-lifecycle/pressure-results.md`; the QA gatekeeper's are under `tests/qa-gatekeeper/pressure/`, run by hand in real sessions against the sample project (`sample-app/make-sample.sh`), with baseline and with-plugin results in `pressure-results.md`.
