# Stage: plan

Invoke `ultrapowers:writing-plans` for `specs/<ID>/Spec.md` and follow it. In autopilot form it asks no execution question: `autopilot.execution` in `.agents/ultrapowers.json` decides, and the plan's hand-off is the engine, not a skill.

The plan lands at `plans/<ID>/Plan.md` and carries its own `## Repositories in scope` section: the spec's list, or a narrower one, never a wider one. A repository the plan needs and the spec did not name is a finding for the reviewer: keep it out of the list and say so in the plan's first paragraph.

Commit the plan on the documents branch: `git add plans/<ID>` then `git commit -m "plan(<ID>): <one-line summary>"`, with the project's `commitTrailer` as a second `-m` when one is configured.

End: `{"ok":true,"scope":[<the repositories in scope, as the plan lists them>]}`.
