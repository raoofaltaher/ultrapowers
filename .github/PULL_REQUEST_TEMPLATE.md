<!--
BEFORE SUBMITTING: fill in every section with specifics. PRs that leave
sections blank, bundle unrelated changes, or show no human review are
closed without review. One concern per PR.
-->

> Targets `dev`. <!-- `main` is the released branch; only release PRs from `dev` target it. -->

## Who is submitting this PR? (required)

| Field | Value |
|-------|-------|
| Model + version that wrote the change (or "human") | <!-- name each model and the stage it did, e.g. "Model A (spec and plan), Model B (execution)" --> |
| Harness + version (Claude Code, Codex, Cursor, OpenCode, other) | |
| All plugins installed | |
| Human who reviewed the complete diff | |

## What problem does this solve?
<!-- What broke or what was missing, with the exact behaviour you saw:
     the message you sent, which skill triggered (or did not), and a
     transcript excerpt. "Improving X" is not a problem.
     Link the spec and plan if there are any:
     docs/ultrapowers/specs/<date>-<topic>-design.md, docs/ultrapowers/plans/<date>-<topic>.md -->

## What does this PR change?
<!-- One to three sentences. Name any file that moved and why. Name the
     version if this PR bumps it (scripts/bump-version.sh, never by hand). -->

## Is this change appropriate for this plugin?
<!-- Say it plainly: did any skills/*/SKILL.md body change? If yes, attach
     the ultrapowers:writing-skills before/after evidence from real sessions.
     Does it add a runtime dependency, telemetry or a remote call, or a
     second vocabulary beside `ultrapowers`? If yes to any of the last three,
     it does not belong here (AGENTS.md rules 1, 4 and 5). -->

## What alternatives did you consider?
<!-- Each alternative and why it lost, one sentence each. -->

## Evidence
<!-- Tick only what you ran on the final commit, and give the counts.
     The full offline suite is listed in AGENTS.md under "Running the tests". -->

- [ ] `bash tests/hooks/test-session-start.sh` passes (N cases)
- [ ] `bash tests/init/run-tests.sh` passes (N cases)
- [ ] `bash tests/skills/test-skill-bodies.sh` passes
- [ ] The other suites this change touches pass: <!-- name them -->
- [ ] `scripts/lint-shell.sh --all` passes
- [ ] `scripts/bump-version.sh --audit` ends with "All clear" (release PRs, or any manifest change)
- Live check: <!-- what you ran in a real session and what you saw: e.g. in a clean session, `Let's make a react todo list` triggers brainstorming before any code -->
- Exercised by hand: <!-- what the suites do not cover and you tried yourself: Windows cmd.exe and run-hook.cmd, paths with spaces, a second harness, an init upgrade from the previous release -->
- Review: <!-- who reviewed the branch before this PR (a fresh reviewer, which model) or "self-review only", and why -->

## Related issues and PRs
<!-- #number, or "none found" after searching open and closed items -->

## Human review
- [ ] A human has reviewed the complete diff before submission
