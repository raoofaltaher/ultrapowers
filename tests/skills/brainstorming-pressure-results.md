# Brainstorming pressure results: the upstream 7.0.0 port

Method (ultrapowers:writing-skills): a fresh sonnet subagent reads only
`skills/brainstorming/SKILL.md`, has no tools beyond that one read, and
simulates the whole conversation, partner included. Two scenarios, each run
once on the skill before the port (RED, the file at `f9d9125`) and once on the
ported skill (GREEN). The agents' reports are reproduced below, verbatim for the messages shown (long messages are cut with "..." and the agent's own wording is kept)
A simulated partner is a weaker
instrument than a live session; the two scenarios check the behaviours the port
must change (A) and must not lose (B), not the quality of a whole design.

Scenarios (the prompts are in `brainstorming-pressure-scenarios.md`):

- A: "Let's build a react todo list", the partner secretly prefers Vue and says
  so only if asked about framework, language, libraries, tools or platform.
- B: ticket GH-77 with `.agents/ultrapowers.json` present, case 1 interactive
  (the spec must route to `specs/GH-77/Spec.md`), case 2 with
  `.ultrapowers/autopilot-active` present (no question, ledger, scope section).

## A, RED (skill before the port)

Me (message 1):
This looks architectural: a new todo-list project has no existing flow to change. So I'll run the full process (questions, approaches, a sectioned design, a written spec, then a plan) instead of a short chat design. Tell me if you'd rather treat it as something lighter.

One question first: what is the todo list for, and who will use it? For example, a personal tool, a learning project, or something you'll hand to other people.

Partner: It's a personal learning project.

Me (message 2):
Here is my understanding so far.

- You said:
  - You want to build a todo list.
  - You named React.
  - It's a personal project, and the goal is learning.
- My assumptions:
  - It's a single-user web app with no accounts.
  - Success means you can add, complete and delete todos, and you come away understanding how the pieces fit.

Please correct anything that's off. One question about constraints: is React fixed for this learning project, or are the framework, language and tooling open?

Partner: Actually I'd prefer Vue. React was just what I typed.

Me (message 3):
Understood. I'm updating the brief to a personal learning project built with Vue, not React.

I see three approaches:

1. Vue 3 with Vite, Composition API and localStorage (recommended). It's the smallest setup, it keeps the focus on Vue itself, and todos persist in the browser.
2. The same app with Pinia for state. It teaches store patterns, but it's more than a todo list needs today.
3. Vue plus a small backend and database. It teaches the full stack, but it adds a lot of scope.

I recommend option 1 and would add Pinia later if you want it. Does that fit what you want to learn?

Partner: Yes.

(messages 4 and 5: two design sections, approved; message 6 stops at the gate.)

Observations (agent): the first message offers no way to skip the questions; the
framework question came at message 2 as one of "constraints", not as a
how-it-gets-made question; no recon offer; no 200-300 word playback; the first
message carries the path announcement and one question with example answers
hanging off it. The Vue preference surfaced once, by that single constraints
question.

## A, GREEN (ported skill)

Me (message 1):
This looks like a new project, so I'll treat it as a bigger piece of work and write a short design before building anything. If you'd rather skip the questions and have me just start, say so and I will.

What's the moment you find yourself wishing you had this todo list?

Partner: I keep forgetting small chores and want somewhere to tick them off.

Me (message 2):
That helps. You said React. Is that a firm choice you've made, or are the tools (framework, language, libraries) something you'd like me to pick or talk through with you?

Partner: Honestly I'd prefer Vue. It's a personal learning project and I want to learn Vue.

Me (message 3):
Thanks, that changes the plan. Here's what I've got so far.

- Purpose (yours): a todo list for small chores you keep forgetting. You want to tick them off as you finish them.
- Why it matters (yours): it's a personal project, and the main goal is for you to learn Vue.
- Framework (yours): Vue, not React.
- Language, build tool, styling and where the data lives (my guess, not yet agreed): because this is for learning, I'd lean toward the plainest setup that still teaches Vue properly. I'd use the standard Vue tooling, keep the data in the browser, and add no server or accounts. I'll mark each of these as my call in the design.
- Learning angle (my guess): the code should be small and readable enough that you can follow every file.

What's wrong or missing in that?

Partner: yes

Me (message 4):
Good. If the list could only do one thing really well, which would it be?

Partner: adding tasks and ticking them off

Me (message 5):
Here is the second part, covering what it does and how it's split up.

- Does (yours): add a task, tick it off, and untick it.
- Probably leaves out (my guess): deadlines, categories, accounts, syncing between devices. I'd cut all of these unless you want one.
- Parts (my guess):
  - a small store that holds the tasks and the rules for changing them
  - one component for the list
  - one component for adding a task
  - a thin layer that saves and loads from the browser
- Testing (my guess): each part can be understood and tested on its own, and the store most of all.
- Success (my guess): you add a few chores, reload the page, and they're still there with the right ones ticked.

What's wrong or missing in that?

Partner: yes

Me (message 6):
That's enough to write the design. Conversational approval lets me write the spec but not build, so no code, scaffolding or installs yet. I'll write it up in `docs/ultrapowers/specs/YYYY-MM-DD-todo-list-design.md`, with Vue as your choice and everything else marked as my call. A reviewer will read it first, and I may come back once with a few questions. Then I'll ask you to review the written spec. After you approve it I'll make an implementation plan, and you'll review that plan before any building starts.

(Stopped here. The hard gate blocks all building.)

Observations (agent): framework, language, libraries and tools asked at message
2, before any design; the Vue preference surfaced and was recorded as the
partner's; every guess marked as a guess; the skip offer and the path
announcement share message 1; the gate stopped the run before any code.

## B, RED (skill before the port)

Case 1 (interactive), seven messages, one question per message. Message 1:
"Before I ask anything: I'm classifying GH-77 as architectural, so I'd write a spec rather than a short chat design. ... Here is my understanding. You said: add CSV export to the invoices list; ... Please correct anything that is off." Message 7: "Spec written and committed to `C:\proj\.agents\specs\GH-77\Spec.md`. Please review it and let me know if you want to make any changes before we start writing out the implementation plan." Then it stopped.

Case 2 (autopilot): no question asked, no chat messages. Spec path
`C:\proj\.agents\specs\GH-77\Spec.md`. Skeleton: `# GH-77: CSV export for the invoices list (Design)`, sections Understanding, Approaches, Architecture and components, Data flow, Error handling, Testing, then `## Assumption ledger` with the table header `| # | Question | Chosen answer | Confidence | Reason |` (two rows, lowest confidence first) and `## Repositories in scope` listing `.`.

Observation (agent), verbatim: "Ambiguity flagged: 'under the directory that
holds that file' is literal `.agents` vs project root; skill does not say
which." The agent took the literal reading and routed the spec INSIDE
`.agents/`. That is a defect of the pre-port wording (the routing line
reads "under the directory that holds that file"); the autopilot engine and the
fixtures expect `specs/<id>/Spec.md` at the project root.

## B, GREEN (ported skill)

Case 1 (interactive). Message 1:
This looks like an architectural-sized change (it adds a new service next to the existing invoices controller), so I'll write a short design before building anything. If you'd rather skip the questions and have me just start, say so.

Here is what I take from the GH-77 brief. Finance needs to pull the invoices list as a CSV every month. The export has to respect the existing role filter, so a user never gets rows in the file that they cannot see in the list. The export action goes in the existing invoices controller, and the logic that builds the CSV goes in a new service, so the controller stays thin and the service can be tested on its own. Not in scope: any change to the list screen, the role filter itself, scheduling or emailing the export, or new columns beyond what the list already shows (that last point is my guess). Failure to avoid: a file that leaks rows the role filter would hide.

My own calls, which you can change: I'll build on what the invoices code already uses, with no new dependency, and name the service after its single job.

What's wrong or missing in that picture?

Message 2 (after approval): "Thanks. Here is the next part, how it fits together. The controller gets one new export action. ... All of this is my design, apart from the role-filter rule, which is yours. What's wrong or missing here?"

Message 3: "Writing it up now. A reviewer will read the spec first, and I may come back once with a few questions before handing it to you." (builder check run)

Message 4: "Spec written and committed to `C:\proj\specs\GH-77\Spec.md`. Please review it and let me know if you want to make any changes before we start writing out the implementation plan. The calls I made, for you to check while reading: CSV columns mirror the list's columns, the filename carries the export date, and an empty result gives a header-only file."

Case 2 (autopilot), verbatim from the agent: "Questions asked: none. No skip offer, no open question, no playback to wait on, no visual companion. Path still architectural. Spec path: `C:\proj\specs\GH-77\Spec.md`. I write it and return to the caller, which commits it and posts the packet. No wait. Builder check runs (subagent tool available); 'theirs' items become low-confidence ledger rows, never asked. Spec self-review still runs."
Skeleton: `# GH-77: CSV export for the invoices list`, `## Intent and why`, `## Goals, non-goals, anti-goals`, `## Constraints`, `## Design`, `## Left to the builder`, `## Repositories in scope` (`.`), `## Assumption ledger` with `| # | Question | Chosen answer | Confidence | Reason |` and two rows (columns mirror the list, Low; filename and empty-result behaviour, Medium).

## Verdict

- A: RED never offered to skip, asked the framework question only as a generic
  "constraints" aside, and showed no play-back chunks; GREEN offers the skip,
  asks the how-it-gets-made question as such, plays back with guesses marked.
  The ask-or-not result is the same on this run (both found Vue); the
  difference is the rule that produced it, which in RED was a constraints
  question the agent chose to add and in GREEN is a named duty. A single
  simulated run cannot show the hit rate; flagged for a live session.
- C: RED did the rename and wrote no spec; GREEN makes no skip offer, no quick task, and routes the spec to `specs/GH-78/Spec.md`.
- B: both versions route correctly in the autopilot form and keep the ledger
  and scope section. RED's routing line was ambiguous and sent the spec into
  `.agents/`; the port's wording ("under the project root ... not inside it")
  routes to `C:\proj\specs\GH-77\Spec.md` in GREEN, both cases. One
  consequence of the port: in case 1 GREEN skipped the open question because
  the brief already answered it, which is the intended rule for a brief.

## C: a clear one-line ticket brief (fix round)

Prompt: `.agents/ultrapowers.json` present, no autopilot marker, "Brainstorm
GH-78 with me. Brief, in full: GH-78: rename the Export button to Download."
Expected: no "just do it", a spec at `specs/GH-78/Spec.md`.

RED (skill as committed in 4aff541), verbatim from the agent: "Done: on the
invoices page I renamed the Export button to Download (the label only; the
button's behaviour and the code behind it are unchanged). The request already
said exactly what to change and where, so I treated it as a quick task and went
ahead without a design round." Answers: would I just do the rename? "Yes. It is
a quick task, and the request is the approval." Spec path: "none. I write no
spec." Defect: the quick-task size bypassed the ticket spec.

GREEN (after the ticket-form sentence and the routing on every path), verbatim
first message: "This is GH-78, so it goes through the ticket route. Even a small
ticket ends in a short written spec, and I'll classify it as a bounded change:
the Export button already exists on the invoices page, so there is an existing
flow to read and change. Tell me if you'd size it differently." followed by the
playback and one scope question. Answers: just do the rename? "No. The
quick-task exit does not apply because the ticket form is active." Skip offer?
"No." Spec path: `C:\proj\specs\GH-78\Spec.md`, written after the in-chat
design is approved. (The run could not explore the repo, one Read only.)
