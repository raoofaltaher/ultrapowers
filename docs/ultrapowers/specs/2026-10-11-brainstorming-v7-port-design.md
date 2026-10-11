# Brainstorming: the upstream 7.0.0 port

Date: 2026-10-11. Branch `chore/upstream-sync`. Skill prose under AGENTS.md
rules 2 and 3; evidence in `tests/skills/brainstorming-pressure-results.md`.

## What upstream changed (7.0.0, #2463, #2482, #2483)

The brainstorming skill was rebuilt: it starts from "what do you actually know"
(a quick clear task is done and reported), the first message is one line offering
to skip the questions plus one open question, a menu only when stuck, offers to
look at prior art, the project or the web, a play-back of each understood part
in about 200-300 words with guesses marked, sizing after understanding (do it,
a small change in chat, a design document, overridable, stepping up if it
grows), a builder check by a fresh subagent replacing the spec-document
reviewer, a question about which how-it-gets-made choices the partner owns
(asked even when questions are skipped), and the visual companion offered
whenever seeing helps, without the token-cost warning. The Red Flags shrank to
five rows and the checklist and flow graph went.

## What we kept, and where it landed

| Our addition | Landing |
|---|---|
| Spec routing to `specs/<id>/Spec.md` under `.agents/ultrapowers.json` and a ticket id | "The Written Design", "Where it goes", directly under the spec-location bullet (tests/task-lifecycle pins this) |
| Autopilot form: no question, `## Assumption ledger`, `## Repositories in scope` | its own section, extended for the new flow |
| Three Paths announcement and the one-way ratchet | "Your First Message" and "Three Paths" |
| HARD-GATE per path, terminal states, written-spec then plan then execution method | "HARD-GATE" after the written design |
| Anti-pattern "Too Simple To Need Approval" | kept, with the quick-task exception |
| Our seven Red Flags rows | kept, upstream's non-duplicate four added (11 rows) |
| "your human partner" voice, the handoff to `ultrapowers:writing-plans` | kept |
| Visual companion: our paths, our logo, `--open`, `.ultrapowers/brainstorm/` | `visual-companion.md` and `scripts/` untouched; upstream's diff there was names only |
| What `brainstorm-task` relies on: routing, the Autopilot form, one question per message | kept; see decision 5 |
| Spec self-review (inline) | kept, then the builder check |

## Merge decisions

1. **Sizing versus our three paths.** Upstream sizes after understanding; ours
   classifies before the first question. Kept ours (it is what the Autopilot
   form and the gate hang on) and made it a provisional size announced in
   the first message, confirmed once understood. Upstream's three sizes map to
   Quick (new) / Bounded / Architectural; Spike stays ours.
2. **Quick, clear task.** Adopted: when the request names everything, do it
   and say what you did, the request being the approval. This loosens our
   "every path needs approval" anti-pattern in exactly one place, as the
   release notes ask. The ratchet applies the moment it stops being quick.
3. **First message.** Upstream's two parts, with our path announcement folded
   into the skip-offer line, so "that's the whole message" still holds. When a
   brief already answers the open question (a ticket), the open question is
   skipped and the playback leads, as the old skill's "reflect, do not re-ask"
   rule required.
4. **Skipped questions.** Adopted, with the how-it-gets-made choice stated in
   one line that names it can be changed. Not available in the Autopilot form:
   nobody to opt out, the gate is the tracker.
5. **Question style.** Upstream: open first, menu when stuck. brainstorm-task
   says "prefer multiple choice; lead with your recommendation" because its
   questions come from a grounded manifest. The skill now says a caller that
   already read the code may ask the grounded question with choices and a
   recommendation. brainstorm-task itself is unchanged (not in this change's
   scope); see the open questions.
6. **Builder check in the Autopilot form.** Runs when a subagent tool exists;
   its "theirs" pile becomes low-confidence ledger rows, never questions.
   Replaces nothing of ours: our reviewer prompt was never dispatched by the
   skill. `spec-document-reviewer-prompt.md` deleted after grepping the tree:
   only 2026-01 specs and plans named it.
7. **Approaches.** Our checklist item "propose 2-3 approaches" becomes upstream's
   "think wide privately, show the comparison when it helps". Our isolation and
   existing-codebase guidance stays, condensed, under "Play It Back".
8. **Checklist and flow graph.** Dropped (upstream's rebuild drops them and the
   new flow is prose-ordered). No test or skill referenced them.
9. **Description.** Upstream's broader trigger text adopted (non-software work).
10. **Visual companion offer.** Upstream's wording and whenever-seeing-helps
    triggers; the token-cost sentence is gone; not offered in the Autopilot form.
11. **Routing wording (found by the RED run).** "under the directory that
    holds that file" read literally puts the spec in `.agents/`. Now "under the
    project root (the directory that contains the `.agents` folder, not inside
    it)", matching where the engine and the fixtures look.

## Evidence

`tests/skills/brainstorming-pressure-results.md`, scenario prompts in
`brainstorming-pressure-scenarios.md`; offline assertions in
`tests/skills/test-skill-bodies.sh`. Summary: A, RED never offered to skip and
asked the framework question only as a "constraints" aside; GREEN offers the skip
and asks it as a how-it-gets-made question; both surfaced Vue (one simulated run
cannot give a rate). B, RED routed the spec into `.agents/specs/GH-77/`; GREEN
routes to `specs/GH-77/Spec.md` and the Autopilot form still asks nothing,
writes the ledger and the scope section.

## Open questions

- brainstorm-task's "prefer multiple choice" line now sits beside "open
  questions first"; reword it, or leave it as the grounded-question exception?
- Quick-task exception (decision 2): confirm the owner accepts it for ticket
  work too; in the Autopilot form a quick task still produces a spec.
- Live-session evidence is still owed; the runs here simulate the partner.

## Fix round (review)

12. **Ticket form always produces the spec.** Decision 2's quick-task exit would
    have let a one-line ticket skip `specs/<id>/Spec.md` (scenario C, RED). In
    the ticket form (brainstorm-task, a ticket id with `.agents/ultrapowers.json`,
    or the Autopilot form) the quick size does not apply, no skip offer is made,
    and the routing applies on every path. GREEN in scenario C.
13. **Grounded door keeps its rhythm.** brainstorm-task's one question per
    message, multiple choice, recommendation first stands in that door; the
    open-first-question rule yields. This closes the first open question above.
14. Spike Red Flags rows merged into one.
