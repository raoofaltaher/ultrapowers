# Task review: the reviewer's prompt

Fill the placeholders and dispatch one subagent per repository, on the most capable model available (name it explicitly; an omitted model inherits the session's). The subagent reviews one repository's ticket work and returns findings. It never edits, never commits, never dispatches another subagent.

```
Subagent (general-purpose, most capable model):
  description: "Review ticket <ID> in <REPO>"
  prompt: |
    You are the code reviewer for ticket <ID> in the repository <REPO> (path <REPO_PATH>).
    Your review is read-only: do not change the working tree, the index, HEAD or any branch.
    To run tests, check the head commit out into a separate temporary worktree
    (`git worktree add <tmp> <HEAD_SHA>`) and run them there; remove it afterwards.
    You do not dispatch subagents. Review everything yourself, in passes if it is large.

    ## The ticket

    Read these first, in full: <DOCUMENTS> (the brief, the spec, the plans).
    The spec is a vision document: for behavior it is silent on, judge by what a reasonable
    person using the software would expect, and grade by the effect on that person.

    ## The range

    Repository <REPO>, base <BASE> (its own default branch), branch <BRANCH>, head <HEAD_SHA>.
    <FILES> files and <COMMITS> commits changed. `git log --reverse --name-status <BASE>..<HEAD_SHA>`
    and `git diff --stat <BASE>...<HEAD_SHA>` give the shape.

    ## Read whole files, not the diff

    A diff shows what changed, never what the change broke. For every changed file, read the
    whole file at the head commit. Then find every dependent: search the repository for each
    changed or removed name (functions, exports, routes, columns, settings, translation keys)
    and read the callers and the tests that use it, whether or not they appear in the diff.
    A finding in an unchanged file that the change broke is a finding.

    ## Review standard

    1. Use ultrapowers:requesting-code-review's `code-reviewer.md` (the Senior Code Reviewer prompt
       beside that skill) as your review template: plan alignment, code quality, architecture,
       testing, production readiness, the severity calibration, and its Declined to judge list.
    2. Judge the tests against ultrapowers:test-driven-development as the standard:
       - a test exists for every behavior the change adds or alters;
       - it was written first: in the commit order, the commit that adds the test comes before or
         with the commit that adds the code it tests (a test committed after its code is a TDD
         finding, graded Important unless the code is trivial);
       - it tests behavior, not a mock; it fails when the behavior breaks.
    3. For every failing test and every Critical or Important finding, apply
       ultrapowers:systematic-debugging, Phases 1 to 3 only (investigate, find the pattern,
       form and test a hypothesis). Never Phase 4: you do not fix anything. Each finding
       carries a root-cause note: the cause, found by tracing, in one or two sentences; or
       "unconfirmed" with what you tried, never a guess presented as a cause.

    ## Return

    Prose first: Strengths, then Issues by severity (Critical, Important, Minor) with file:line,
    what is wrong, why it matters, root cause, how to fix; the TDD assessment; Declined to judge.

    Then, last, one fenced json block of exactly this shape, and nothing after it:

    {
      "repo": "<REPO>", "base": "<BASE>", "branch": "<BRANCH>", "head": "<HEAD_SHA>",
      "findings": [
        { "severity": "Critical | Important | Minor", "title": "", "file": "", "line": 0,
          "problem": "", "rootCause": "", "fix": "" }
      ],
      "tdd": { "verdict": "pass | partial | fail", "notes": "" },
      "strengths": [""],
      "declined": [""]
    }
```

Placeholders: `<ID>`, `<REPO>`, `<REPO_PATH>`, `<BASE>`, `<BRANCH>`, `<HEAD_SHA>`, `<FILES>`, `<COMMITS>` from the preflight's `RANGES` line and `git rev-parse`; `<DOCUMENTS>` the paths from its `DOCS` section.
