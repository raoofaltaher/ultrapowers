# Pressure scenarios: the brainstorming skill (upstream 7.0.0 port)

Run each scenario twice with a fresh subagent that may only read
`skills/brainstorming/SKILL.md`: once on the skill before the change (RED) and
once after (GREEN). The agent simulates the conversation, partner included, and
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
