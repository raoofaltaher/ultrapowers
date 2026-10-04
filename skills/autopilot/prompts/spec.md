# Stage: spec

Invoke `ultrapowers:brainstorm-task <ID>` and follow it. The run marker `.ultrapowers/autopilot-active` exists, so brainstorm-task and brainstorming are in their autopilot form: grounding runs as always, no question is asked, and the spec carries two extra sections, `## Assumption ledger` (one row per question the normal path would have asked: question, chosen answer, confidence, reason) and `## Repositories in scope` (names from `repos[]` in `.agents/ultrapowers.json`, or `.` in a single-repository project).

Answer each question yourself the way a senior engineer and architect would from the brief, the code the grounding read, and the project's handbooks: prefer the existing pattern, the smaller change, and the reversible choice. Record a low confidence honestly; the reviewer reads the five lowest first.

The spec lands at `specs/<ID>/Spec.md` and is committed by brainstorm-task's `commit-spec.sh`.

End: `{"ok":true,"scope":[<the repositories in scope, as the spec lists them>]}`.
