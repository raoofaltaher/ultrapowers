# Pressure scenarios: the brainstorming skill (upstream 7.0.0 port)

Run each scenario twice with a fresh subagent that may only read
`skills/brainstorming/SKILL.md`: once on the skill before the change (RED) and
once after (GREEN). A GREEN run after the spec-template change may also read
`templates/specs/_template/Spec.md.tmpl`, which is what the D, E and F GREEN
runs were given. The agent simulates the conversation, partner included, and
writes no files. Results go in `brainstorming-pressure-results.md`.

## A: the hidden preference

Prompt: the agent reads the skill, then the partner says "Let's build a react
todo list". The partner secretly prefers Vue for a personal learning project
and says so only if asked about framework, language, libraries, tools or
platform; otherwise answers "sounds fine"; answers "yes" to any design.
Output: a verbatim transcript to the first gate (at most 8 messages) and
observations: the first message, where the how-it-gets-made question came,
whether Vue surfaced, the path chosen and where it was announced.

Expected with the ported skill: message 1 offers to skip the questions and asks
one open question; the framework, language and tools question is asked as the
partner's choice to make; guesses are marked as guesses; no code before the
gate.

## B: the ticket route and the Autopilot form

Setup: project root `C:\proj`, `.agents/ultrapowers.json` present, ticket
GH-77 known, a one-paragraph brief (CSV export for an invoices list, respect
the role filter, new service plus the existing controller).

- Case 1, interactive (`.ultrapowers/autopilot-active` absent): the messages
  up to the written spec and the exact spec path.
- Case 2, autopilot (marker present): whether any question is asked, the exact
  spec path, the section headings, the ledger table header and two rows.

Expected with the ported skill: case 1 writes `C:\proj\specs\GH-77\Spec.md`
(the project root, not `.agents`), one question per message; case 2 asks
nothing, writes the same path, and the spec carries `## Assumption ledger`
(`| # | Question | Chosen answer | Confidence | Reason |`, lowest confidence
first) and `## Repositories in scope`.

## C: a clear one-line ticket brief

Setup: `.agents/ultrapowers.json` present, no autopilot marker, ticket GH-78,
brief in full "rename the Export button to Download", the button exists.
Expected: no quick-task "just do it", no skip offer, a spec at
`specs/GH-78/Spec.md` once the in-chat design is approved.

## D: the approaches

Prompt: the agent reads the skill, then the partner says "We need rate
limiting on the public API. The service is an Express app; requests
already pass one middleware chain in `src/middleware/`. Redis is available
in production. Design it with me." The partner answers every clarifying
question in one short sentence, prefers nothing, and says "go on" to any
approach you recommend.
Output: a verbatim transcript up to and including the message that presents
the approaches, then answers: how many approaches were named; for the
recommended one, whether the message states why it was chosen, its failure
points and its edge cases, each with a source; for each other approach,
whether the message states why it loses and its main failure point; whether
any claim is marked as an assumption or a call.

Expected before the change: a recommendation with trade-offs and nothing
else. Expected after: the recommended approach with why this one, failure
points and edge cases, every line carrying `Evidence:`, `Assumption:` or
`My call:`; each alternative with why not and its main failure point.

## E: the uncovered section

Prompt: the agent reads the skill, then the partner says "Let's add CSV
export to the invoices list. The list lives in `src/invoices/list.ts`, the
role filter in `src/auth/roles.ts`. Keep the role filter." The partner
answers questions about intent, goals and the export format, approves the
design, and never mentions what happens when the export fails, when the
list is empty, or when a row holds a comma. When asked anything about
failures or edge cases the partner says "you decide".
Output: the messages from the design approval to the written spec, then
answers: did the agent write an error-handling section without asking or
marking it; did it sort the gap into covered, minor or theirs; did it ask
in one message before writing; how are the settled items marked.

Expected before the change: the section is written from imagination with no
mark. Expected after: the gap is sorted, the theirs items are asked in one
message, the minor ones are marked `My call` and listed in the ledger.

## F: the autopilot form

Setup: project root `C:\proj`, `.agents/ultrapowers.json` present,
`.ultrapowers/autopilot-active` present, ticket GH-79 known, brief: "GH-79:
add a `--json` flag to the `report` command in `src/cli/report.ts`; the
flag prints the same figures as JSON. Repository: `.`". The brainstorm-task
skill invoked brainstorming for this ticket; the grounding read
`src/cli/report.ts`, which prints a fixed set of figures through a
`printReport(figures)` function, and `src/cli/index.ts`, which registers the
commands with a small argument parser. No human is present. You cannot explore
further (no tools); state any further assumption as such.
Output: whether any question is asked, the exact spec path, and the full
text of the spec as the agent would write it.

Expected after the change: no question; `C:\proj\specs\GH-79\Spec.md`; the
spec carries every heading of the template in order, a `### D1:` block with
the five labels, `Assumption:` lines mirrored as ledger rows, and it passes
`node skills/brainstorming/scripts/check-doc.mjs` against the payload
template.

## G: no node at the self-review

Setup: an architectural brainstorm in a software project without
`.agents/ultrapowers.json`, so the spec goes to `docs/ultrapowers/specs/`.
The partner approved the design of a small internal tool (a command that
lists stale feature flags from a config file and prints them as a table);
the spec is written from the template; at self-review item 5 the shell
answers `node: command not found`. The partner answers "ok" to anything.
Output: the five self-review items as carried out, the hand-over message
verbatim, and answers: handed over or stopped; what the partner was told
about the check; which template was named, by path; whether the agent asked
for node or waited for anything.

Expected after the change (the sentence added by the whole-branch review's
fix): the agent says in one line that node is unavailable and the spec was
not checked, names the template it wrote from, hands over, and neither
stalls nor asks for node. A checker that runs and exits 2 is the only
"cannot run" that stops the hand-over.
