---
name: headless-live-run-needs-a-clone-outside-claude
description: A headless Claude Code run of the plugin (claude -p with --plugin-dir) refuses writes under .claude and under the plugin folder, and refuses node without an allowedTools entry; run it from a clone outside both with --add-dir and an explicit allow list
metadata:
  type: gotcha
date: 2026-10-12
---
A headless Claude Code session (`claude -p`) treats every path under a `.claude` directory and under the `--plugin-dir` folder as sensitive: a Write there is refused, so a hunt or QA run started from a worktree under `.claude/worktrees/` cannot write its `.ultrapowers/<run>-active` marker, and a run whose project is the plugin folder itself cannot write its report. It also refuses `node <script>` and the audit tools without an `--allowedTools` entry, and cannot read the plugin's own prompts outside the project without `--add-dir`.

**Why:** the harness's permission layer, not the guardrail; observed on 2026-10-11 in three headless sessions of the vulnerability hunt (the first dispatched twelve hunters with no marker because the write was refused).

**How to apply:** for a live run of a skill from an unreleased checkout, clone the branch to a folder outside any `.claude` directory (e.g. `S:/ultrapowers-live-audit`), use a second folder as the project, and pass `--plugin-dir <clone> --add-dir <clone> --allowedTools "Bash(node <clone>/skills/<skill>/scripts/<preflight>.mjs:*)" "Bash(npm audit:*)" ...` with the exact prefixes the skill runs; never `bypassPermissions`. The marker must be read back before any subagent is dispatched (the hunter contract's STEP 1 now requires it).
