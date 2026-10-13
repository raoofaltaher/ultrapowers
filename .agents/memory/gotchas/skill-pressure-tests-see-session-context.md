---
name: skill-pressure-tests-see-session-context
description: A subagent told to read one skill file and simulate also sees every installed skill's description, AGENTS.md and the worktree's git status and recent commits, which can make a RED run show the GREEN behaviour and makes a description-trigger test a test of the installed plugin; judge RED and GREEN on the file sentence the run quotes, keep states neutral, commit before running
metadata:
  type: gotcha
date: 2026-10-13
---

A fresh subagent dispatched to "read only this skill file and simulate" also carries, in its system context, the harness's one-line description of every installed skill, the repo's `AGENTS.md`, and the worktree's `git status` and recent commit messages. Three effects were observed on 2026-10-13 while testing the ticket-route change:

- A RED run can show the GREEN behaviour by inference: the agents named `task-review` from the installed description and from commit names such as "the ticket route reaches the review gate", then said the file alone would not have led them there.
- A scenario state line that names the subject ("`reviews/<ID>/` holds nothing") or an output question that names the expected behaviour ("is the pull request a draft?") cues the answer; the agents reported the cue themselves.
- A "description-only" micro-test quotes the installed plugin's description (the plugin cache), not the worktree's edited one.

**How to apply:** ask every run to quote the sentence of the file that prescribes each action, and judge RED and GREEN on that quote, not on the agent's inclination; keep the state neutral and move the judgment into "Expected" lines the runner never sees; commit the spec, plan and test before the runs so `git status` is quiet; treat a description-trigger test as a check of the installed plugin, not of the worktree. Method and caveats recorded in `tests/skills/lifecycle-gates-pressure-results.md`.
