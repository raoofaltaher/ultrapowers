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

# Brainstorming pressure results: the spec template and decision record

Method: each RED run is a fresh Sonnet subagent. It reads only `skills/brainstorming/SKILL.md` as committed at 9a3e0f4, before any edit of this plan, with one Read call and no other tool. The agent simulates the whole conversation, with the partner played by the agent, writes no file, and returns the transcript and the answers the scenario asks for. The transcripts and answers below are copied verbatim from the returned text. For E the section starts at the design approval, as the scenario's output asks, so the agent's one-line summary of the earlier messages is left out.

## D, RED (skill at 9a3e0f4)

### Transcript

Me: This looks like a new piece of the service that callers will notice, so I'll write a short design with you before building anything, and if you'd rather skip the questions and have me just start, say so.

What was the moment you thought the public API needs rate limiting?

Partner: A couple of big integrators hammered it and slowed it down for everyone else.

Me: Here's what I'm hearing so far, so you can correct it. The problem is fairness: a few heavy callers use up the API's capacity and everyone else pays for it with slow responses, so the limit is there to cap what any one caller can take. That much is yours, along with the rest of what you told me: it's the public API, it's an Express app, every request already passes one middleware chain in `src/middleware/`, and Redis is available in production. These are my guesses, not things you said: the people it serves are the other integrators, who feel the slowdown today; success means a well-behaved integrator never notices the limit while a heavy one gets a clear refusal; and stopping a determined attacker is not part of this job.

I'd offer to go and read `src/middleware/` for the order of the chain and where the caller gets identified, to check whether the app sees each caller's real address when requests come through a proxy or load balancer, and to see how Redis is already used so I can reuse that connection. I can't open the project from this conversation, so for now I'm working from assumptions, and I'll flag each one when it matters.

What's wrong or missing in that?

Partner: Nothing, that's right.

Me: Good. Which choices about how this gets built do you want to make yourself?

Partner: None of them, I don't mind how it's built.

Me: Then how it gets built is mine to propose, and my pick is to count requests in Redis in fixed windows, as one more step in your existing middleware chain; that's my call, not something you've agreed to. Here are the three ways I weighed, so you can see why.

1. Count in each server's own memory. It needs no Redis and is the least code. But every instance counts on its own, so with several instances a caller can get that many times the limit, and the counts reset on every restart or deploy. That works against the problem you described, a few callers slowing everyone down, so it loses unless you run a single instance.

2. Count in Redis in fixed windows: one counter per caller per window (say, a minute) that expires by itself. Every instance sees the same count, it is easy to read and to test, and it adds one Redis call to each request. Its catch is the window edge: a caller can send up to twice the limit in a short burst across the boundary between two windows.

3. Count in Redis with a token bucket (a small Lua script, or a library that does it). Same shared counts, and it allows short bursts and refills steadily, so there is no edge spike. It loses because the smoother behavior isn't something you asked for, and it is more machinery to get right: a mistake in the bucket logic either lets heavy callers through or blocks good ones.

Why option 2: it fixes the thing you told me about, a few callers taking the capacity, with shared counts and the least new machinery, and the twice-the-limit edge is a small price for that.

The rest is also my call, and I'm saying it out loud so you can change it: use a maintained Express rate-limit library with a Redis store rather than hand-written code; one limit for every caller, with nothing per customer plan and no admin screen; tell callers apart by API key when the request has one, otherwise by IP address; answer a caller over the limit with a 429 and a Retry-After header; and if Redis is slow or can't be reached, let the request through, so a Redis outage never takes the API down, at the price that limits aren't enforced while it's down.

I'm assuming three things I haven't checked: that you run more than one instance (with one, option 1 would be enough); that the chain already identifies the caller by API key before the routes run (if not, I'd have to add that step or limit by IP address only); and that the app already sees each caller's real address when requests come through a proxy or load balancer (if not, the IP fallback would treat every anonymous caller as one caller).

Does anything in that fight what you need from this?

### Answers

1. Three: per-server memory counters (option 1), Redis fixed-window counters (option 2, the recommendation) and a Redis token bucket (option 3).

2. Why chosen: yes ("it fixes the thing you told me about, a few callers taking the capacity, with shared counts and the least new machinery, and the twice-the-limit edge is a small price for that"). Failure points and edge cases appear only inside trade-off clauses, not as a labelled part: Redis trouble ("if Redis is slow or can't be reached, let the request through ... at the price that limits aren't enforced while it's down"), the window edge ("a caller can send up to twice the limit in a short burst across the boundary between two windows") and the proxy case ("the IP fallback would treat every anonymous caller as one caller"), with nothing on, for example, callers sharing one address or a counter that never expires.

3. No source is given for any of them: the per-server multiplication and reset on deploy, the window-edge double burst, the Redis-outage trade-off and the bucket-logic risk are general engineering knowledge or my own reasoning, with no file, document or measurement cited (I had no tools, and the skill asks only for "the comparison, with trade-offs and your recommendation"). The only grounding is the partner's own statements (a few heavy callers, Redis in production, one middleware chain), and the claims that depend on the repo are flagged as "three things I haven't checked".

4. Yes for both. Option 1 loses because "That works against the problem you described, a few callers slowing everyone down, so it loses unless you run a single instance", and its main failure point is that "every instance counts on its own" and the counts "reset on every restart or deploy"; option 3 loses because "the smoother behavior isn't something you asked for", and its main failure point is "a mistake in the bucket logic either lets heavy callers through or blocks good ones".

5. Yes: the pick is marked "that's my call, not something you've agreed to", the defaults are marked "also my call, and I'm saying it out loud so you can change it", and the repo-dependent points sit under "I'm assuming three things I haven't checked". The failure-point and edge-case claims inside the three options (double burst, per-server multiplication, bucket-logic risk) are stated as plain fact, not marked as assumptions or as my own judgment.

Observed: The RED skill did more than the 'Expected before the change' lines of `brainstorming-pressure-scenarios.md` predicted. It names three approaches, gives the reason for the pick, says why options 1 and 3 lose with a main failure point for each, and marks the pick, the defaults and the repository-dependent points as calls or assumptions, in prose. Three failure points or edge cases appear inside trade-off clauses (the window edge, Redis slow or unreachable, the proxy case), but none is labelled and none cites a source; the agent had no tools, and the partner's statements are its only grounding. The double-burst, per-server and bucket-logic claims are stated as plain fact. Absent: the `Evidence:`, `Assumption:` and `My call:` labels, and a labelled list of failure points and edge cases for the recommended approach. Already on the baseline, for Task 8: the three approaches, the reasons the alternatives lose, and the calls marked in prose.

## E, RED (skill at 9a3e0f4)

### Transcript

Me: Here is the design as I understand it. From you: CSV export on the invoices list, covering everything matching the list's current filters, with the same columns in the same order. Each person gets exactly the rows they already see, because the role filter in `src/auth/roles.ts` stays. Amounts and dates have to sort and sum in Excel, and it is just CSV, nothing fancy.

My guesses, since I couldn't read the code: it is one Export button on the list, shown to everyone who can open it; `list.ts` already gets its rows through one function that applies the role filter, so the export reuses it and the filter rules stay in one place; amounts come out as plain numbers and dates as YYYY-MM-DD, which is how I read "sort and sum in Excel"; and I add no new library.

I'd build it as three small pieces: the button in the list, one function that fetches the rows the way the list does, and one plain function that turns rows into CSV text so it can be tested alone.

What's wrong or missing?

Partner: That's right, go ahead.

Me: Good. I'm writing it up now. A reviewer will read it first, and I may come back once with a few questions.

[Me, internal, not shown to the partner. Draft written at the default path with every line tagged [said], [my call] or [my guess]. Self-review: no TBD or TODO; no contradictions; one plan covers it; two ambiguities fixed ("the filters" now means the on-screen filters plus the role filter; "server or browser" replaced by the rule that the role filter runs on the data side).
No subagent tool, so I read the spec as the builder who must plan from it without asking anyone (I did not open builder-check-prompt.md; this scenario allowed one file). Sorted what that builder would ask:
- Answered already: page or all rows; which columns; whether the export shows more than the list. All are the partner's answers and already in the document.
- Minor, settled as my call: who sees the button; what happens when the export fails; an empty list; a comma, quote or line break in a value; text that looks like a formula; amount and date formats; encoding and file name; very large lists; whether list.ts already filters on the data side (the builder verifies, the rule is stated). Who sees the button came closest to "theirs" because it touches access, but "keep the role filter" and "exactly what they see now, nothing more" already point to the list's own visibility.
- Theirs: none. Nothing remains that only the partner can answer and that changes what gets built, so no questions go back.]

Me: The reviewer's questions were all ones I could settle myself, so I'm not coming back with any. These are the calls I made that you didn't decide, most important first; each is marked [my call] in the document.
1. The Export button shows for everyone who can open the list.
2. If an export fails, the person sees the app's usual error and gets no file, never a partial one.
3. If nothing matches the filters, they get a file with just the header row.
4. A value with a comma, quote or line break is quoted the standard way, and text starting with = + - or @ is made safe for spreadsheets.
5. Amounts are plain numbers, dates are YYYY-MM-DD, and the file is UTF-8 with a marker so Excel shows accented names right, named invoices-YYYY-MM-DD.csv.
6. The whole list goes out in one request; if the biggest real list is too large for that, the builder stops and raises it.
One guess is about your code, which I couldn't read: that `list.ts` already applies the role filter where the rows are fetched. It's marked [my guess], and the builder checks it first.

Spec written and committed to `docs/ultrapowers/specs/2026-10-12-invoices-csv-export-design.md`. Please review it and let me know if you want to make any changes before we start writing out the implementation plan.

[Simulation: no write or commit tool was available, so nothing was saved; the text under "## Spec" stands in for the committed file.]

Partner: Yes.

(Next per the skill: invoke ultrapowers:writing-plans and no other skill. Not run in this scenario.)

### Spec

```markdown
# Invoices list: CSV export (design)

Date: 2026-10-12. Status: written for review.
Markers: [said] is the partner's own words or answers. [my call] is a choice the partner did not make, so it needs a check. [my guess] is about code I could not read while writing, so the builder verifies it first.

## Intent and why

Finance rebuilds the month-end invoice list in a spreadsheet by hand every month. Success is that finance gets the list into Excel in one step, it matches what they saw on screen, and there is nothing to retype or clean up. [said, put together from the partner's answers]

## Goals

- CSV export on the invoices list, as one Export button that downloads the file. [said: the export; the button is my call]
- The file holds every invoice matching the list's current filters (the filters on screen plus the role filter), not only the page on screen. [said: "Everything matching the filters."]
- The same columns the list shows, in the same order. [said]
- Amounts and dates that Excel can sort and sum. [said] Amounts as plain numbers with no currency symbol or thousands separator, dates as YYYY-MM-DD. [my call]

## Non-goals

- Anything beyond a CSV file: no XLSX or PDF, no scheduled or emailed export, no column picker. [said: "Just CSV, nothing fancy." The list is my reading.]

## Anti-goals

- The export holding an invoice the person cannot already see in the list. [said]
- A file in which Excel cannot sort or sum amounts or dates. [said]

## Constraints

- Keep the role filter in `src/auth/roles.ts`. The export goes through the same filter as the list, with no second copy of its rules. [said; "no second copy" is my call]
- The list lives in `src/invoices/list.ts`. Follow what is already there and add no new library unless the app already uses one. [said: "Follow what's there."; "no new library" is my call]

## Design

Three pieces, each with one purpose. The split is my call.

1. Row source. One function returns the invoices for the list's current filters through the list's own fetch path, so the role filter runs there and nowhere else. I am guessing that `list.ts` already fetches its rows through one function that applies the role filter. [my guess] If the filter only runs on screen, moving it to the data side so the list and the export share it is part of this work. [my call]
2. CSV writer. A pure function that takes the column definitions and the rows and returns CSV text. It owns quoting and encoding and knows nothing else about invoices. It lives in a new small module beside `list.ts`, so `list.ts` does not grow. [my call]
3. Export button. In `list.ts`: it calls the row source with the list's current filters, passes the rows to the CSV writer and hands the result to the browser as a download. It shows for everyone who can open the list. [my call]

The CSV is built on whichever side already fetches the list's rows, and the role filter must run on that side, not only in the browser. [my call]

## Left to the builder

Module and function names, how the download is triggered (use the app's existing pattern) and how the tests are laid out. For the cases the partner did not discuss, I made the calls below. The builder follows them unless the code shows one cannot work, and then stops and raises it.

**If something goes wrong, or the data is odd.** None of this was discussed. Every line is my call.

- Export fails: the person sees the app's usual error for a failed action. No file is downloaded, a partial file is never delivered, and the list stays as it was. [my call]
- Nothing matches the filters: the file downloads with the header row only, and the button stays enabled. [my call]
- A value holding a comma, a double quote or a line break: standard CSV quoting, the value in double quotes with any inner quote doubled. [my call]
- Text a spreadsheet could run as a formula (starts with =, +, - or @): in text columns only, add a leading apostrophe. Number columns are never altered, so credit-note amounts stay negative numbers. [my call]
- File: UTF-8 with a byte-order mark so Excel shows accented names correctly, named `invoices-YYYY-MM-DD.csv` with the day of export. [my call]
- Large lists: the whole file is built in one request. If the builder finds the biggest real list is too large for that, they stop and raise it, because that changes the design. [my call]

## How we will know it works

- The CSV writer has its own tests: quoting, header-only output, amount and date formats, formula-prefix handling. [my call]
- For the same person and filters, the export holds exactly the rows the list shows and never a row the list would hide. [my call]
```

### Answers

1. Yes: a block under "Left to the builder" headed "If something goes wrong, or the data is odd. None of this was discussed. Every line is my call.", with bullets for failure, empty list, comma values, formula-like text, encoding and list size; the failure bullet reads "Export fails: the person sees the app's usual error for a failed action. No file is downloaded, a partial file is never delivered, and the list stays as it was. [my call]"
2. Marked as my call, not asked about and not written as agreed: the block says "None of this was discussed. Every line is my call.", each bullet ends "[my call]", and the legend reads "[my call] is a choice the partner did not make, so it needs a check." The hand-over message repeated the same calls, so the partner heard them before saying yes.
3. Not as a sort: while drafting I only tagged lines [said], [my call] or [my guess], and the three-way split (answered, minor, theirs) first happened in the inline builder check, after the draft existed. That check put failure, empty list and comma in "minor" and left "theirs" empty.
4. Not at all: the partner was never asked about failure, empty list or commas, so "you decide" never came up, and they were only told about them in the hand-over list after the check. The skill's single round of questions is the "theirs" pile, and it was empty.
5. Inline tags: [said] for the partner's words, [my call] for choices I settled, [my guess] for unverified code assumptions, with a legend under the title and the calls repeated as a short list in the hand-over. The skill only says to "mark it in the document as your call" and gives no format, so the tag scheme is my own and another run could mark them differently or not at all.

Observed: The RED skill wrote the error-handling section without asking the partner: no message asks about failure, an empty list or commas. The section is marked, though. Its lead-in line says every line is a call, each bullet ends `[my call]`, and the hand-over repeats the calls, so the "no mark" expectation in the 'Expected before the change' lines of `brainstorming-pressure-scenarios.md` does not hold on this baseline. The sort into answered, minor and theirs happened only after the draft existed, in an internal builder check whose theirs pile was empty. The tags are the agent's own, and the spec has no ledger and no fixed section set. Already on the baseline, for Task 8: the calls are marked and listed to the partner. Absent: the sort before writing, the one question before writing, and the ledger.

## F, RED (skill at 9a3e0f4)

### Questions

none

### Spec path

C:\proj\specs\GH-79\Spec.md

### Spec

```markdown
# GH-79: add a `--json` flag to the `report` command

Ticket: GH-79; size: bounded; repository: `.`; form: autopilot (no human was asked; the review happens on the tracker packet).

Marks: (brief) is the ticket's own word. (call) is a decision this design made with no human present; the ones that change what gets built are rows in the Assumption ledger. (assumed) is a fact about the code that the grounding did not show.

## Intent

`report` prints its figures as text. The brief asks for a `--json` flag that prints the same figures as JSON (brief). The brief does not say why. My guess, not the ticket author's words: scripts and other tools need the figures without scraping the text layout.

## Current state

- `src/cli/report.ts` prints a fixed set of figures through `printReport(figures)`.
- `src/cli/index.ts` registers the commands with a small argument parser.
- The grounding mentions no JSON output and no `--json` or `--format` option (assumed: none exists).

## Goals

1. `report --json` writes the report's figures to stdout as one JSON document, and all of stdout parses with `JSON.parse` (brief).
2. The document holds exactly the figures the text report prints, none missing and none added (brief).
3. `report` without the flag behaves exactly as before, and so does every other command for every input it accepts today (call).
4. The change has tests in the repository's existing style, and the repository's own checks pass (call).

## Non-goals

All calls.

- Other formats (CSV, YAML), a `--format` option, or a short alias such as `-j`.
- Honoring `--json` in any command but `report`.
- Changing which figures `report` shows, how they are computed, or how the text report looks.
- JSON-shaped errors. Errors stay as they are today.
- An envelope, schema, version field or timestamp around the figures.

## Anti-goals

Each is a failure even if the flag technically works. All calls.

- Anything but the document on stdout in JSON mode, such as a header line, a progress note or color codes. The consumer's `JSON.parse` would fail.
- The text report changing by one byte.
- A second computation of the figures for the JSON path. Both outputs read the same `figures` value.
- Rewriting the parser, or adding a dependency, to deliver one flag.

## Constraints

- One repository, `.`. The command lives in `src/cli/report.ts` (brief). The flag is declared where the repository already declares command options; the grounding showed `src/cli/index.ts` registering commands with a small argument parser (assumed).
- `printReport(figures)` keeps its signature and behavior (call).
- No new dependency (call).
- The JSON keys are the ones `figures` already has. Scripts will depend on them once this ships, so the builder does not rename, reorder or add any (call).
- If the repository has contribution rules (changelog, commit format, lint, type check), the builder follows them. No project handbook was in the grounding I was given (assumed).

## Design

Decided by the brief: a `--json` flag on the `report` command, and with it the command prints the same figures as JSON.

Decided by this design (calls):

With `--json`, `report` writes `JSON.stringify(figures, null, 2)` and one trailing newline to stdout instead of calling `printReport(figures)`. It uses the same `figures` value the text path uses, then ends as it does today. Without the flag nothing changes. For example, if `figures` were `{ a: 1, b: 2 }`, stdout would be four lines: `{`, `  "a": 1,`, `  "b": 2`, `}`.

The flag is a plain on/off switch, long form only, honored by `report` only. It is declared the way the repository already declares a command option. Errors and exit codes do not change.

Verification: one test runs `report --json`, parses stdout and deep-equals `figures`; one test shows that the output without the flag is unchanged.

## Left to the builder

- How the parsed flag reaches `report`, following the existing pattern.
- An inline branch where `report` calls `printReport`, or a small sibling function beside it in `src/cli/report.ts`. No new source file other than tests.
- Test names and placement, matching the repository's test setup. If `report` has no test yet, the smallest file that fits that setup.
- Any figure whose JSON form would lose or change its value (a bigint throws; NaN and Infinity become null): pick the least surprising JSON value and name the figure in the pull request description.
- A figure the text report shows but `figures` does not hold, because `printReport` derives it: compute it once before the branch so both outputs share it, and say so in the pull request description.
- If the command's help text or the README lists its options, one line for `--json` there. If neither does, no documentation is added.

## Assumption ledger

Decisions made with no human present, lowest confidence first. The builder check was read inline (no subagent tool). Row 1 is the question it left that only the ticket author can answer.

| # | Question | Chosen answer | Confidence | Reason |
|---|---|---|---|---|
| 1 | What is the JSON document: its shape, keys and values? | `figures` itself, unwrapped, exactly as it is: its own keys, its own nesting, its values as held (numbers stay numbers; no rounding, units or separators from the text report), nothing added or dropped | low | The brief says only "the same figures". I did not see the type of `figures`, whether it holds every figure the text report shows, or whether `printReport` formats values, so I assumed plain, JSON-serializable data that `printReport` only formats. Only the ticket author knows what their consumers expect. Correct this row first. |
| 2 | How is the flag declared? | The repository's existing way of declaring a command option. If it has none for a boolean switch, extend the parser by the least that works; if its options are global, the other commands ignore `--json`. No parser replacement, no library | medium | The grounding showed a small argument parser, not its option API. Using what exists is the smaller change. |
| 3 | What else may reach stdout in JSON mode? | Nothing but the document. Other stdout text `report` prints today (a header, color codes) is left out in JSON mode, along with anything it carried that is not in `figures` | medium | A consumer parses all of stdout, so one stray line breaks it, and the brief asks for the figures only. I assumed `printReport` is the only stdout writer; I did not see a header. |
| 4 | Compact or indented JSON? | Two-space indentation and one trailing newline | medium | Whitespace does not matter to a JSON parser, and indented output reads well in a terminal. It costs one argument to `JSON.stringify`. |
| 5 | How is it verified? | A test that runs `report --json`, parses stdout and deep-equals `figures`, and a test that the output without the flag is unchanged, both in the repository's existing test style | medium | I did not see the repository's test setup, so matching its runner and style is the builder's job. |
| 6 | Which language, library and structure? | The existing TypeScript files and the built-in `JSON.stringify`. No dependency. `printReport(figures)` is untouched, and the branch sits where `report` calls it | high | The existing pattern and the smaller change. `printReport` may have other callers. |
| 7 | Do errors or exit codes change under `--json`? | No. Errors and exit codes stay exactly as today, and there is no JSON error object | high | The brief asks only for the figures as JSON. Failing as today is the smaller change. |
| 8 | Does the flag get a short alias, or work on other commands? | No. `--json` only, honored by `report` only | high | The brief names one flag on one command. More surface is more to keep. |
| 9 | Which size is this: spike, bounded or architectural? | Bounded | high | A new flag on a command whose code was read, so the flow to change exists. The one new surface, the JSON shape, is pinned in row 1. A ticket always gets a spec, so the size only sets how much design it carries. |

## Repositories in scope

- `.`
```

Observed: No question was asked and the spec path is `C:\proj\specs\GH-79\Spec.md`, so both expected results of the change already hold on the baseline. The spec has no `## Decision record` heading, as the plan's Task 1 Step 4 predicted, and it has no `### D1:` block and no `Assumption:` lines. It does have an `## Assumption ledger` table, lowest confidence first, and a `## Repositories in scope` section. Some claims carry origin tags, `(brief)`, `(call)` or `(assumed)`, but no claim cites a file or a measurement as evidence. Its section set is its own. The alternatives it rejects (`--format`, an alias, an envelope) are non-goal bullets, anti-goal bullets or ledger rows with a one-line reason; none has a labelled failure point. Current state names `printReport(figures)` and the argument parser in `src/cli/index.ts` with no tag, though the ticket brief names neither, the setup supplies the grounding's findings but no code and the run had no tool to read it. Already on the baseline, for Task 8: no question, the exact path and the ledger table. Absent: the decision record, the D1 block, the Assumption lines and the fixed section set.

## D, GREEN (skill at 9f943d8)

### Transcript

**Partner:** We need rate limiting on the public API. The service is an Express app; requests already pass one middleware chain in `src/middleware/`. Redis is available in production. Design it with me.

**Me:** This looks like a new piece of the system that changes what callers of the public API see, so I'll treat it as a full design job and write a short design for you to approve before building anything; if you'd rather skip the questions and have me just start, say so.

What's the moment that made you decide the public API needs rate limiting?

**Partner:** A client's script flooded the API last week and slowed it for everyone.

*[Off-stage: the skill's `check-doc.mjs --print-template` step names the spec template, which I read once; its questions are ground to cover, never read out.]*

**Me:** I'd normally read `src/middleware/` first, for the order of the chain, how a caller is identified (key, token or address), whether the app already talks to Redis and through what, and how errors reach callers, and I'd read the Redis and Express documentation on counting and proxies. I can't open anything in this session, so I'll carry each of those as an assumption and mark it as one.

Which choices about how this gets built do you want to make yourself, and which are you handing to me?

**Partner:** No preference, you pick.

**Me:** You're leaving the how to me, so here are my defaults in plain words: I build on what you already run (the Express middleware chain and Redis), add no new service, and every pick goes into the design as my call, not as something you agreed to.

Here is what I understand so far. What you said is marked as yours; everything else is my guess.

You said: last week one client's script flooded the public API and slowed it for everyone. The service is an Express app, every request already passes one middleware chain in `src/middleware/`, and Redis is available in production.

My guesses:
- The aim is to stop one caller from hurting everyone else, so the limit applies per caller, not as one cap on the whole API.
- A caller over the limit gets a clear "too many requests" answer that says when to try again; callers under the limit notice nothing.
- The failure you would least want is blocking a real, well-behaved caller, more than letting a few extra requests through.
- Success looks like the same script being turned away quickly while everyone else stays fast.
- Left out for now: different limits per customer plan, a dashboard, and any change to how callers sign in.

What's wrong or missing?

**Partner:** Looks right.

*[Off-stage: I think wide and drop three weak ideas: one global cap on the whole API (it fights "slowed for everyone"), counters in a database table (a slow write on every request), and a check inside each route handler (it fights the one chain and can miss a route).]*

**Me:** Here are three ways to do this, with the one I recommend first. I can't read the repository in this session, so a line marked `Assumption:` is something I haven't checked and `My call:` is a small choice I'm making for you; both go on a list in the design for you to check.

**Approach 1 (recommended): one Redis-backed limiter in the existing middleware chain**
- **What it is:** one new middleware in `src/middleware/` that counts each caller's requests in Redis, so every copy of the service shares one count, and answers `429 Too Many Requests` with a `Retry-After` header once a caller is over its limit; no dashboard and no per-plan limits. Where it sits in the chain, which counting rule it uses and whether a library does the counting are smaller choices that I'll settle in the design, each with its alternatives.
- **Why this one:**
  - It turns a flooding caller away once it passes its limit, however many copies of the service that caller reaches, because the count lives in one place. Assumption: production runs more than one copy of the service; you haven't said how many.
  - It needs no new infrastructure and covers every route. Assumption: Redis is reachable from the API service and the chain sees every route; both come from your message and I haven't checked either in the code.
  - It uses the standard way to tell a caller to slow down over HTTP. Evidence: RFC 6585, section 4 (429 Too Many Requests); RFC 9110, section 10.2.3 (Retry-After).
- **Failure points:**
  - A Redis outage or slow reply sits on the path of every request, so after a short timeout the limiter lets the request through and logs the error. My call: letting requests through, because wrongly blocking a real caller is the failure we agreed is worst.
  - Counting and expiring in two separate Redis calls can leave a counter that never expires if the service dies between them, which would block that caller for good, so both happen in one atomic step. Assumption: this is from my memory of the Redis INCR documentation's rate-limiter pattern, not read in this session.
  - If callers are counted by IP address and a proxy or load balancer sits in front that Express does not trust, every caller looks like the proxy and all share one allowance, so I count by API key where callers have one and set `trust proxy` for the fallback. Assumption: this is from my memory of Express's "behind proxies" guide, not read in this session, and I don't know whether a proxy is in front.
  - Every rejected request still costs a pass through Express and one Redis call, so a flood far beyond the limit still loads the service; an edge limit could be added in front later if that happens. Assumption: the flood you saw was far below what Express and Redis can absorb; I have no traffic figures.
- **Edge cases:**
  - Callers behind one shared address (an office, a mobile network) share one allowance if counted by IP, so a busy neighbour could get a real caller blocked. Assumption: callers have API keys to count by instead; you haven't said how they identify themselves.
  - A fixed-window count lets a caller send up to twice the limit by straddling two windows; a sliding window avoids most of that. Assumption: this follows from how window counting works and I have not measured it.
  - Health checks and internal calls on the same chain would eat into the limit, so they are exempt. My call: the exemption, as I can't see whether such traffic uses this chain.
  - A `Retry-After` date only works if the caller's clock agrees with ours, while a number of seconds counts from when the response arrives, so I send seconds. Evidence: RFC 9110, section 10.2.3 (Retry-After).

**Approach 2: the same middleware, counting in the service's own memory**
- **Why not:** it is the simplest of the three, but Redis is already available, so counting in memory saves no infrastructure and gives up the shared count. Assumption: Redis is reachable from the API service; that comes from your message and I haven't checked it.
- **Main failure point:** each copy of the service counts only what it sees, and the count resets on every restart or deploy, so a caller's allowance multiplies with the number of copies and a script spread across them slips under the limit, which is the incident you described. Assumption: production runs more than one copy of the service; you haven't said how many.

**Approach 3: limiting at the edge, in a proxy or gateway in front of Express**
- **Why not:** it would turn a flood away before it reaches Express, but its rules live outside this repository, so they can't be reviewed or tested with the code. Assumption: any proxy or gateway in front is configured outside this repository; I haven't seen your deployment.
- **Main failure point:** it works only if something you control sits in front of Express, and you described none, so this may need new infrastructure before anything is limited. Assumption: no such layer exists, since you described only the Express app.

My recommendation is approach 1, the Redis-backed limiter in the existing chain. Is that the one you want me to write the design around?

### Answers

1. Three approaches were named: the Redis-backed limiter in the existing chain (recommended), the same middleware counting in the service's own memory, and limiting at the edge in a proxy or gateway. Three weaker ideas (a global cap, a database counter, a check in each route handler) were dropped off-stage and never shown to the partner.

2. Yes, under three bold labels, each with several lines. Why this one: "It turns a flooding caller away once it passes its limit, however many copies of the service that caller reaches, because the count lives in one place" (plus "It needs no new infrastructure and covers every route" and the standard 429 with Retry-After); Failure points has four lines, for example "A Redis outage or slow reply sits on the path of every request, so after a short timeout the limiter lets the request through and logs the error"; Edge cases has four, for example "Callers behind one shared address (an office, a mobile network) share one allowance if counted by IP, so a busy neighbour could get a real caller blocked."

3. Of the eight failure-point and edge-case lines, only one cites a source, the Retry-After line ("Evidence: RFC 9110, section 10.2.3 (Retry-After)", a standard by title); the other seven are unsourced and say so, five with `Assumption:` (two of those say the Redis INCR and Express proxy documentation was recalled from memory, not read) and two with `My call:`. No file, measurement or probe is cited anywhere, because none could be read or run.

4. Yes, both. Approach 2 gives "Why not: it is the simplest of the three, but Redis is already available, so counting in memory saves no infrastructure and gives up the shared count" and "Main failure point: each copy of the service counts only what it sees, and the count resets on every restart or deploy"; approach 3 gives "Why not: it would turn a flood away before it reaches Express, but its rules live outside this repository, so they can't be reviewed or tested with the code" and "Main failure point: it works only if something you control sits in front of Express, and you described none"; all four lines end in `Assumption:`, so none carries a real source.

5. Yes: 11 lines in the whole message are marked `Assumption:` and 2 are marked `My call:` (letting requests through when Redis fails, and exempting health checks and internal calls), against 2 marked `Evidence:` (the two RFCs), and the opening sentence tells the partner what the markers mean and that they go on a list in the design. The skill's source list does not name the partner's own chat words, so lines that rest only on them (Redis is available, one middleware chain) are marked `Assumption:` rather than `Evidence:`.

Observed: Against the Expected after line, the recommended approach has labelled `Why this one`, `Failure points` and `Edge cases` parts, and each alternative has a `Why not` and a `Main failure point`. Every bullet under those labels carries `Evidence:`, `Assumption:` or `My call:`: across the whole message there are eleven `Assumption:` lines, two `My call:` lines and two `Evidence:` lines, and both `Evidence:` lines cite an RFC. The 11, 2 and 2 counts are of marker lines and do not include the opening sentence that names the markers. The `What it is` line under the recommended approach carries no marker, and the Expected after line does not name that field.

## E, GREEN (skill at 9f943d8)

### Transcript

From the design message onward; the earlier messages are summarised one per line in the run record.

Me: Here's the design as I understand it; tell me what's wrong. Finance gets an Export CSV button on the invoices list, on the page you already have; there is no new screen. Pressing it asks the server for a file. The server reads the rows through the list's own code in `src/invoices/list.ts`, so the role filter in `src/auth/roles.ts` applies exactly as it does on screen, and every page of the list's current filters goes in. A small new piece, `src/invoices/export-csv.ts`, turns the rows into CSV: a header row of the list's column headings, then one row per invoice. The file downloads as `invoices-<date>.csv`, and nothing is stored. You told me: finance gets every invoice they may see, in the list's columns, as a plain CSV, and the role filter stays as it is. Everything else here is my guess, not something you said: I haven't read the two files, so I'm assuming the list pages its rows and applies the role filter in one place I can reuse; that cells hold plain values, like dates as 2026-10-13 and amounts as plain numbers, so a spreadsheet can add them up; and the file name is my pick. What's wrong or missing?
Partner: "That's right, go ahead."

[Private sort of every italic line in the template, not sent. Template read: the file the --print-template form names, `templates/specs/_template/Spec.md.tmpl`.]
Covered, the partner said: Intent (month-end copying by hand; click and get the file); Goals and non-goals (every invoice the list shows, all pages, same columns; no other formats); Anti-goal (someone seeing invoices they shouldn't); Constraints (keep the role filter; the two files); Architecture and Components (the design they just approved).
Minor, a builder could settle it, so settle it, mark My call, add a ledger row: empty list, cell values, file name and encoding, new file names. Testing, Definition of done, Left to the builder and Repositories in scope were not discussed, but each follows from requirements the partner did state, so they are minor too (the test gate and the repository are Assumptions). A comma, quote or line break in a field: a standard settles it, so Evidence, no call.
Theirs, only the partner can answer and it changes what gets built: Error handling, a whole section nobody covered (what can fail and how the person learns it; what is refused, blocked or never silent). Asked, not filled.

Me: Before I write this up, one section has nothing in it yet, and only you can say what goes there: what the export does when something goes wrong.
1. When the export can't be produced, what should the person see?
2. Is there anything the export must refuse to do, or must never do without telling anyone?
Partner: "You decide."

Me: Then these are my calls, and the spec marks each one as mine so you can overrule it. If the export fails, nothing downloads and the list page says "The export could not be created. Try again."; you never get a half-finished file, or an error page saved as the CSV. It won't retry by itself, and pressing Export again is safe. Someone the list turns away is turned away from the export too. Two more I'm settling myself: an empty list gives a file with only the header row, and a name with a comma or a quotation mark is wrapped in quotes, the standard way, so it stays one cell. I'm writing it up now; a reviewer will read it first, and I may come back once with a few questions.

[Wrote the spec from the template, from the title down (shown in the Spec section). Not written to disk or committed: this simulation has no tools.]
[Self-review. 1 Placeholders: none left, every angle-bracket slot replaced. 2 Consistency: streaming clashed with fail-whole (D2), so Left to the builder now limits streaming. 3 Scope: one plan. 4 Ambiguity: "all pages" made explicit as every page of the current filters. 5 Template check: the checker cannot run here (no commands), so I checked the spec against the template by hand (headings, italic lines, D1, a marker or source on every line, a ledger row for every marker); a live session would stop here until it runs.]
[Builder check, read inline as the builder (no subagent tool), six questions. Answered by the conversation: which headings, in what order. Answered only by the project, unreadable here: does the list page its rows (stays an Assumption, first job for the builder). Minor, settled as My call: cell values (#7), file name and encoding (#8). Settled by a standard: a name starting with = or + (Evidence: OWASP). Left to the builder: route and where the control sits. Theirs: nothing new; failure behavior was already asked and delegated. So no second round.]

Me: The reviewer's read raised nothing only you can answer, so there is no second round. The calls I made, for you to check while reading (each is marked in the spec and listed in the table at the bottom):
- If the export fails, nothing downloads and the list page shows a message; never a partial file. You said "you decide".
- No automatic retry; refusals match the list's; failures are logged without invoice contents.
- An empty list gives a file with only the header row.
- Cells hold plain values (dates as YYYY-MM-DD, amounts as plain decimals), not the list's display text.
- File name `invoices-YYYY-MM-DD.csv`, UTF-8 with a byte-order mark.
- I could not read the code, so the builder confirms first that the list pages its rows and applies the role filter in one place.
[Simulation: the file is not written or committed here; the spec is in the Spec section.]
"Spec written and committed to `docs/ultrapowers/specs/2026-10-13-invoices-csv-export-design.md`. Please review it and let me know if you want to make any changes before we start writing out the implementation plan."
Partner: "Looks good."
Me: [The only skill I invoke now is writing-plans. Approving the spec permits that and nothing else; the plan gets its own review, and nothing is built yet.]

### Spec

````markdown
# Invoices list: CSV export

Status: draft, 2026-10-13. Ticket: none.

## Intent
At month end, finance copies the rows of the invoices list into a spreadsheet by hand. Export removes the copying. Success, in the partner's words: they click Export and get the file, no copying.

## Goals, non-goals and anti-goals
- Goals: Export gives one file holding every invoice the list shows for the person's current filters, all pages, in the list's columns, as a plain CSV. The role filter stays and governs every row.
- Non-goals: No other formats. Nothing replaces them; a later request gets its own design.
- Anti-goals: Someone seeing an invoice in the file that the list would hide from them. The partner: "Someone seeing invoices they shouldn't."

## Constraints
- Keep the role filter in `src/auth/roles.ts`: it governs every row of the export, unchanged and not bypassed. The partner's instruction.
- The list's code is `src/invoices/list.ts`; the export reads its rows through it. The partner named the file; reading through it is D1.
- Assumption: TypeScript (the files are `.ts`), no new dependency, and the project's existing patterns for routes, error display and tests. I could not read the project. (#2)
- File: named `invoices-YYYY-MM-DD.csv` with the export date, UTF-8 with a byte-order mark. My call: finance's spreadsheet is unknown and the mark lets most read accents. (#8) Header row; records end in CRLF; `Content-Type: text/csv; charset=utf-8`. Evidence: RFC 4180, sections 2 and 3.

## Decision record

### D1: Export on the server, through the list's own read path
- **Chosen:** An Export CSV control on the list asks the server for a file. The server reads every row through `src/invoices/list.ts` with the person's role filter and the list's current filters, turns the rows into CSV text in a small pure function, and returns the text as a download. Nothing is stored.
- **Why this one:** The role filter is applied by the code that already applies it, so the file cannot hold a row the list would hide, which is the partner's condition ("Keep the role filter"). Assumption: the filter is applied inside the list's read path. (#3)
- **Rejected:** Building the CSV in the browser from the rows already loaded, because it holds only the loaded pages and a long list would freeze the tab. Assumption: the list pages its rows. (#3)
- **Rejected:** A job that stores the file and notifies the person, because it adds file storage and a job runner for a month-end copy, and a stored file outlives a change of role. Assumption: the project has neither for this. (#4)
- **Failure points:** The read path pages or caps its rows, so a plain read would drop rows without saying so. Mitigation: the export reads every page and fails whole if any page fails (D2). Assumption: the list pages or caps its rows; I have not read the code. (#3)
- **Edge cases:**
  - A field holding a comma, a double quote or a line break is wrapped in double quotes, and a double quote inside it is doubled. Evidence: RFC 4180, section 2, items 6 and 7.
  - The list is empty: the file holds the header row only. My call: a file is the least surprising answer to pressing Export, and the purpose does not change. (#6)
  - A text cell starting with `=`, `+`, `-` or `@` is written with a leading single quote so a spreadsheet does not run it as a formula; numbers, negative ones included, are written plainly. Evidence: OWASP, "CSV Injection".

### D2: A failed export fails whole
- **Chosen:** If any step fails (reading a page, the role check, building the file, sending it), nothing downloads and the list page shows "The export could not be created. Try again." The server logs the failure without invoice contents. My call: asked in one message before writing; the partner said "you decide". (#1, #5)
- **Why this one:** A cut-short file looks complete, and finance adds up its columns. My call: I could not ask finance; the partner said "you decide". (#1)
- **Rejected:** A partial file ending in a warning row, because a warning inside the file is easy to miss and the file gets booked as complete. My call: same reason. (#1)
- **Failure points:** The request dies and the page never hears of it. Mitigation: no file within the project's usual request timeout counts as a failure and shows the same message. My call: the timeout is the project's own. (#1)
- **Edge cases:** An expired session returns a login or error page; it is never saved as the `.csv`, and the person sees the same message. My call: the same message for every failure. (#1)

## Architecture
Three units, each with one purpose:
- The list's read path (`src/invoices/list.ts`, existing): returns the rows a person may see, through the role filter. The export is its second caller.
- The CSV writer (`src/invoices/export-csv.ts`, new): a pure function from rows and columns to CSV text. No I/O, no role logic.
- The export action (a new handler plus an Export CSV control on the list): checks the person may see the list, asks the read path for every row, passes them to the writer, and returns the text as a download, or the failure of D2.
Interfaces others depend on: none change. `roles.ts` is called as the list calls it; `list.ts` behaves as before for the list.

## Components
- Read path: used by the list and the export; depends on `roles.ts`. Changed: `src/invoices/list.ts`, by at most one exported function that reads all pages for the person's filters. My call: the smallest change that gives the export every page. (#9)
- CSV writer: a header row of the list's column headings in the list's order, one row per invoice. Cells hold raw values, not the list's display text: dates as `YYYY-MM-DD`, amounts as plain decimals with a dot and no currency symbol or thousands separator. My call: the partner said "the same columns", not the same text, and finance adds up the cells. (#7) Created: `src/invoices/export-csv.ts` and `src/invoices/export-csv.test.ts`. My call: names and place. (#9)
- Export action: depends on the read path and the writer. Created: the handler with its test, and the Export CSV control on the list page, in the places the project's existing routes and pages use. Assumption: I could not read those patterns. (#2)
- Not changed: `src/auth/roles.ts`.

## Data flow
- Enters: the person's identity and role, and the list's current filters.
- Leaves: one CSV download, `text/csv; charset=utf-8`, to the person's browser. Evidence: RFC 4180, section 3.
- Stored: nothing. The file is built per request and discarded (D1).
- Crosses a boundary: the file leaves the server for the person's machine. The role filter is applied before any row is built, so the file holds only what that person may see.

## Error handling
- What can fail: reading any page of the list, the role check, building the file, sending it, no answer in time, an expired session. The person learns it from a message on the list page, "The export could not be created. Try again."; nothing downloads. My call: asked in one message before writing; the partner said "you decide". (#1)
- Retried, refused, blocked: nothing is retried by itself; pressing Export again is safe because the export only reads. A person the list turns away is turned away from the export the same way. No row the role filter hides is ever written. My call: the partner said "you decide" to the failure questions. (#5)
- Never silent: a failure never yields an empty, partial or error-page file, and the server logs each failure without invoice contents. My call: no failure is silent, per D2. (#1, #5)

## Testing
- The CSV writer, in `src/invoices/export-csv.test.ts`: a comma, a double quote and a line break in one field; an empty list gives the header row only; a text cell starting with `=` is guarded and `-12.50` is not; accented text; CRLF line ends.
- The role filter, with the export action's tests: a row the filter hides from a role is absent from that role's file.
- The failure rule, with the export action's tests: if the second page read fails, nothing is returned and the message shows.
- Gate: the project's existing test command runs them. Assumption: it exists; I could not read it. (#2) Evidence for a prose change: None: this change edits no prose.

## Left to the builder
- Reading the rows: one query or page by page, within the limit that the role filter applies to every page and a failed page fails the whole export.
- Building the file: in memory or streamed, within the limit that a failure part way cannot leave a download that looks complete; if streaming cannot promise that, build in memory.
- The route, the verb and where the control sits, within the project's existing routing and page patterns.
- Confirm ledger row 3 first; if the list does not apply the role filter inside one read path, stop and bring that back before building.

## Definition of done
- On the invoices list, Export CSV downloads `invoices-<date>.csv` holding the header row and every row the list shows for the person's current filters, all pages.
- An invoice the role filter hides from a person is absent from their file.
- A name with a comma, a quote or a line break opens as one cell.
- An empty list gives a file with only the header row.
- A forced failure downloads nothing and shows the message.
- The tests under Testing pass under the project's gate.

## Repositories in scope
`.` Assumption: one repository, since the two files named sit under `src/`. (#2)

## Assumption ledger
| # | Question | Chosen answer | Confidence | Reason |
|---|---|---|---|---|
| 1 | What does the person see when the export fails? | Nothing downloads and the list page shows "The export could not be created. Try again." This holds for a failed page read, a refused role check, a build error, no answer in the usual request timeout and an expired session. Never a partial file, a warning row or an error page saved as the CSV. | Low | The Error handling section was asked in one message before writing; the partner said "you decide". |
| 2 | Which stack, patterns, test command and repository layout bind the work? | TypeScript (the files are `.ts`), one repository (`.`), no new dependency, the project's existing patterns and test command. | Low | I could not read the project in this conversation. |
| 3 | How does `src/invoices/list.ts` read and filter its rows? | It applies the role filter inside one read path and pages or caps its rows, so the export reads every page. | Low | I have not read `src/invoices/list.ts` or `src/auth/roles.ts`; the builder confirms first. |
| 4 | Does the project already have a job runner and file storage for exports? | Assumed no, so a stored or background export is rejected as heavier than a download. | Low | Not read; stated as a guess in the approaches. |
| 5 | What is retried, refused or logged on failure? | Nothing is retried by itself, since pressing Export again is safe; a person the list turns away is turned away from the export too; each failure is logged without invoice contents. | Medium | Asked with the failure question; the partner said "you decide". |
| 6 | What does an empty list export? | A file with only the header row. | Medium | Not asked; a builder could settle it and the purpose does not change. |
| 7 | Do cells hold the list's display text or raw values? | Raw values: dates as `YYYY-MM-DD`, amounts as plain decimals. | Medium | The partner said "the same columns", not the same text; finance adds up the cells. |
| 8 | What are the file name and encoding? | `invoices-YYYY-MM-DD.csv`, UTF-8 with a byte-order mark, so a spreadsheet reads accents. | Medium | Not asked; the byte-order mark is the part most worth checking. |
| 9 | Which files are created or changed? | New `src/invoices/export-csv.ts` and its test, a handler and the control; `src/invoices/list.ts` gains at most one exported function; `src/auth/roles.ts` is untouched. | High | Follows from the approved design and "Keep the role filter". |
````

### Answers

1. Yes. `## Error handling` is written out (three bullets, plus decision D2), and the first bullet reads: "What can fail: reading any page of the list, the role check, building the file, sending it, no answer in time, an expired session. The person learns it from a message on the list page, "The export could not be created. Try again."; nothing downloads. My call: asked in one message before writing; the partner said "you decide". (#1)"

2. It was asked about first, then, after "you decide", written as the assistant's own call and never as agreed. The marking is "My call: asked in one message before writing; the partner said "you decide". (#1)", repeated on D2 and the other two bullets (#1, #5), and ledger row 1 (Confidence Low): "The Error handling section was asked in one message before writing; the partner said "you decide"."

3. Yes, privately, before the question message. Quoted: "Covered, the partner said: Intent ... Constraints (keep the role filter; the two files) ...", "Minor, a builder could settle it, so settle it, mark My call, add a ledger row: empty list, cell values, file name and encoding, new file names", and "Theirs, only the partner can answer and it changes what gets built: Error handling, a whole section nobody covered ... Asked, not filled."

4. In one message before writing: two questions on Error handling, sent after the design approval ("Before I write this up, one section has nothing in it yet, and only you can say what goes there ..."), and none after writing, because the inline builder check raised nothing only the partner could answer. The empty list and the comma were never asked as questions; they were sorted minor or settled by RFC 4180, shown as marked lines in the approaches message, and listed again in the hand-over.

5. A settled (minor) item carries `My call:` on its own line with a `(#n)` pointer (an assumption carries `Assumption:` the same way), and each one has a row in the Assumption ledger, lowest confidence first (rows 1 to 9). A line settled by a cited standard (comma quoting, RFC 4180) carries `Evidence:` and has no row, and what the partner said carries no marker.

Two flags. (a) The checker could not run, so the spec was checked by hand against the template; the skill itself says not to hand over until the checker runs, so a live session would stop at that step. (b) The skill allows sources of a file read, a standard, documentation, a probe or a ticket, so the partner's own words are not a listed source. Lines resting only on them are written as plain statements ("The partner's instruction") rather than as `Evidence:`, and the repository-dependent lines are `Assumption:` because the files were not read.

### Mechanical check (controller, 2026-10-13 00:13)

```
node skills/brainstorming/scripts/check-doc.mjs --template templates/specs/_template/Spec.md.tmpl <the saved spec>
template: S:\ultrapowers\.claude\worktrees\spec-template\templates\specs\_template\Spec.md.tmpl
exit=0
```

Observed: Against the Expected after line, the run sorted every italic line of the template before writing, into covered, minor and theirs (the sort is in its private notes). The one theirs item, Error handling, was put to the partner in one message before the spec was written, with two questions, and the partner answered "You decide." The settled items are marked `My call:` with a `(#n)` pointer, and each of the nine Assumption ledger rows is referenced from the spec. The run's own answer (a) under "Two flags" says the checker could not run in the simulation; the controller's run in the mechanical check above exits 0.

## F, GREEN (skill at 9f943d8)

### Questions

none

### Spec path

C:\proj\specs\GH-79\Spec.md

### Spec

````markdown
# Add a --json flag to the report command

Status: draft, 2026-10-12. Ticket: GH-79.

## Intent
The moment: someone runs `report` and wants its figures inside another program, such as a script, a CI step or a dashboard feed, instead of reading them off the screen. The people in it are whoever runs `report` today and whatever they pipe it into. Assumption: the brief names the flag and what it prints, not the reader or the reason, so this is my reading.

Today `report` prints a fixed set of figures as text through `printReport(figures)`. Evidence: `src/cli/report.ts`, read in this session.

Success: `report --json` gives the same figures as one JSON document that a parser reads as it is, and plain `report` is untouched. Evidence: the GH-79 brief.

## Goals, non-goals and anti-goals
Goals:
- G1. `report --json` writes the figures the text form prints, and no others, to stdout as one JSON document, each with the value that `figures` holds. Evidence: the GH-79 brief.
- G2. `report` without the flag prints the same bytes it prints today and exits with the same code.
- G3. The flag is read through the project's existing argument parser, not a second one.

Non-goals: each of these goes to a new ticket, not to this one.
- Other output formats, or a `--format` option.
- `--json` on any other command; the brief names only `report`.
- A documented, versioned JSON schema; the JSON mirrors the figures as they are.
- Changing which figures are produced, how they are produced, or how the text form looks.
- Refactoring `printReport` or the argument parser.

Anti-goals:
- JSON mode prints anything else on stdout, so `report --json` piped to a JSON parser fails.
- The two forms disagree: JSON mode shows more, fewer or different figures than the text form.
- The default text output or its exit code changes and breaks the scripts that run `report` today.
- A failure leaves empty or partial JSON on stdout with a zero exit code.

## Constraints
- Flag: exactly `--json`, long form only, no negated form. My call: the brief names neither a short nor a negated form.
- Command and file: the `report` command in `src/cli/report.ts`. Evidence: the GH-79 brief.
- Repository: `.`, a single-repository project. Evidence: the GH-79 brief.
- Language: TypeScript, as in the existing files. Evidence: `src/cli/report.ts` and `src/cli/index.ts`, read in this session.
- Libraries: none added or changed; the JSON comes from the runtime's built-in `JSON.stringify`. My call: it is the smaller change, and the brief needs nothing more.
- Versions and platforms: no runtime, language or compiler version changes; the builder uses what the project already pins. Assumption: the manifest and the handbooks were not read in this run, so no version number is recorded here.
- Pattern: the flag is read through the argument parser that registers the commands in `src/cli/index.ts`; no second parser and no direct reading of the raw arguments. Evidence: `src/cli/index.ts` registers the commands through a small argument parser, read in this session.
- JSON form, exact: the `figures` value serialized with two-space indentation and followed by one newline, written to stdout in one call, with nothing else on stdout in JSON mode (D2).
- Without `--json`: the text output and the exit codes stay exactly as they are.
- Security: the JSON holds exactly the figures the text form prints and no field it leaves out; the flag adds no other data.

## Decision record

### D1: Print the JSON form through a second print function that the flag selects
- **Chosen:** Add a second print function beside `printReport(figures)` in `src/cli/report.ts`, here called `printReportJson(figures)`, which takes the same value. The `report` command reads `--json` and calls it instead of `printReport(figures)` when the flag is set; the figures are obtained once, the same way in both modes. Evidence: the GH-79 brief; `src/cli/report.ts` (`printReport(figures)` receives the figures as its argument), read in this session.
- **Why this one:** Both printers receive the same `figures` value, so the two forms show the same figures by construction, and the text printer, its callers and its output are not touched. Evidence: `src/cli/report.ts` (`printReport(figures)`), read in this session.
- **Why this one:** The brief asks for one boolean flag, and choosing between two printers is exactly that, with no option type and no format abstraction. Evidence: the GH-79 brief.
- **Rejected:** Giving `printReport` an options argument and branching inside it, because the function whose text output must not change would carry the new branch, for no saving in size. My call: the two are close in size, and leaving the text printer untouched decides it.
- **Rejected:** Serializing inline in the command body, because the code prints through a named function today and an inline `JSON.stringify` would break that pattern. Evidence: `src/cli/report.ts` (`printReport(figures)`), read in this session.
- **Rejected:** A `--format` option that takes `text` or `json`, or a formatter abstraction, because the brief asks for one flag and a format option invites formats nobody asked for. Evidence: the GH-79 brief.
- **Rejected:** Switching to JSON automatically when stdout is not a terminal, because it changes the default output for every existing script that pipes `report`. Evidence: the GH-79 brief asks for an explicit flag.
- **Failure points:** The parser does not carry the flag to the command, so `report --json` silently prints the text form; the test that runs `report --json` through the registered command fails in that case, and the builder reads the parser before editing. Assumption: the code reading in this session recorded a small argument parser, not how it carries a boolean flag or whether it needs the flag declared.
- **Failure points:** The command prints something outside `printReport(figures)`, so JSON mode carries extra text on stdout; the whole-stdout parse catches it, and the builder skips that text in JSON mode. Assumption: the code reading in this session recorded `printReport(figures)` as the printer, not whether the command prints anything else.
- **Failure points:** `printReport` derives a figure that `figures` lacks, or `figures` holds a field the text form does not print, so the two forms disagree; the parity test catches it, and the builder makes JSON mode match the text form. Assumption: the code reading in this session recorded a fixed set of figures printed through `printReport(figures)`, not whether `printReport` derives a value or whether `figures` holds more than it prints.
- **Edge cases:** `--json` given with any other `report` option: the other option behaves as it does today, and the flag changes only which printer runs. Evidence: `src/cli/report.ts` (`printReport(figures)` takes figures that already exist), read in this session.

### D2: In JSON mode stdout carries the figures alone, and a failure keeps it empty
- **Chosen:** The document holds the figures the text form prints, taken from the `figures` value as it is: no wrapper object, no version field, no renamed keys, and a value the text form formats for display appears as `figures` holds it. It is written alone to stdout as `JSON.stringify(figures, null, 2)` plus one newline. Evidence: the GH-79 brief asks for "the same figures as JSON". My call: the two-space indentation and the newline, which the brief does not fix.
- **Why this one:** Serializing the value that `printReport` already receives needs no translation layer, so there is nothing for the two forms to drift on. Evidence: `src/cli/report.ts` (`printReport(figures)`), read in this session.
- **Why this one:** The string is built before anything is written, and written in one call, so a serialization failure cannot leave half a document on stdout. Evidence: ECMAScript Language Specification (ECMA-262), JSON.stringify, which throws a TypeError for a BigInt or a circular structure.
- **Rejected:** An envelope object with a `figures` member and a `version` member, because the brief asks for "the same figures" and an envelope is a contract nobody asked for. Evidence: the GH-79 brief.
- **Rejected:** A JSON error document on stdout, because it would be a second output contract and the brief asks only for the figures. My call: a reader who needs structured errors is a follow-up ticket, not this one.
- **Failure points:** `JSON.stringify` throws on a value it rejects, such as a BigInt member or a circular reference in `figures`; stdout stays empty, the throw reaches the error path that a failure of the text form reaches, and the process exits non-zero. Evidence: ECMAScript Language Specification (ECMA-262), JSON.stringify.
- **Edge cases:** `figures` holds NaN, Infinity or an undefined object member: `JSON.stringify` writes `null` for the first two and leaves the third out, and this change keeps that and adds no encoding. Evidence: ECMAScript Language Specification (ECMA-262), JSON.stringify.
- **Edge cases:** `figures` is empty: JSON mode prints the empty value as a valid document, never nothing, and exits as the text form does. My call: an empty report still gives a parser something to read.

## Architecture
Four units. The argument parser, registered in `src/cli/index.ts`, turns `--json` into a boolean for the `report` command. The `report` command, in `src/cli/report.ts`, obtains the figures once and chooses a printer. The printers, `printReport` (text, unchanged) and `printReportJson` (JSON, new), each take the same `figures` value and write to stdout. The interfaces others depend on do not change: `printReport(figures)` keeps its signature and its output. The new interfaces are the `--json` flag and the JSON document on stdout.

## Components
- `printReport(figures)`, in `src/cli/report.ts`: unchanged; prints the text form; used by the command when `--json` is absent.
- `printReportJson(figures)`, in `src/cli/report.ts`: new; serializes `figures` and writes the document to stdout as D2 says; used by the command when `--json` is set; depends only on the runtime's `JSON.stringify` and on the value type that `printReport` takes.
- The `report` command, in `src/cli/report.ts`: changed; reads the boolean flag and calls one printer; how the figures are obtained is not touched.
- The parser registration, in `src/cli/index.ts`: changed only if the parser must be told about the flag, the way it is told about any other flag; otherwise untouched (D1).
- Tests: created or extended beside the project's existing tests for CLI code, in its runner and layout (see Testing).
- Help or README text: if the parser keeps per-command help, or the README lists the `report` options, add one line for `--json`; otherwise add none. My call: the brief asks for the flag only, and documentation follows where it already exists.
- Files created: a test file, only where none exists for the report command. Files changed: `src/cli/report.ts`; `src/cli/index.ts` only as above; a help or README line only as above.

## Data flow
- Enters: `report --json` on the command line; the parser turns it into a boolean on the `report` command. The figures are obtained exactly as today; this change does not touch that.
- Leaves: in JSON mode, one JSON document and one newline on stdout; in text mode, what `printReport` prints today. This change adds nothing to stderr on success.
- Stored: nothing; the new code reads and writes no file, cache or setting.
- Crosses a boundary: stdout, a process boundary to whatever reads it, a pipe or a redirect. No trust boundary is crossed: the flag only chooses the form, and the output holds only figures the text form already prints.

## Error handling
- Obtaining the figures fails: unchanged; the failure takes the path it takes today, and in JSON mode nothing has been written to stdout, because the printer runs after the figures exist.
- Serialization fails: the printer builds the string before it writes, adds no catch, and lets the throw reach whatever handles a throw from `printReport` today; stdout stays empty and the process exits non-zero (D2).
- The flag does not reach the command: if the parser rejects an undeclared flag, its own error applies; if it ignores one, the test that runs `report --json` through the registered command is what catches the silent text output (D1).
- Nothing is retried, refused or blocked by this change. Never silent: an empty stdout with a zero exit code, a partial document, and an ignored flag.

## Testing
Each test lives beside the project's existing tests for CLI code, in its runner and layout. Assumption: the project has a test runner for its TypeScript CLI code; the code reading in this session did not record the runner, the layout or the test command, so the builder finds them and adds no framework or dependency.
- G1, the JSON holds the figures and only the figures: with a fixed `figures` value of plain values, capture stdout of the JSON printer; `JSON.parse` of the whole of stdout deep-equals the value, stdout ends with exactly one newline, and stderr is empty.
- G1, the two forms agree: for the same fixed value, every figure the text output shows is also in the parsed JSON, and the parsed JSON holds no figure the text output does not show.
- G2, the default is unchanged: the existing test of the text output passes unchanged; if no test pins it, the builder adds one first and runs it against the unchanged code, so it proves the output did not move.
- G3 and the silent-ignore failure: run `report --json` through the command registration in `src/cli/index.ts` and parse stdout as JSON; the test fails if the text form comes out.
- Failure in JSON mode: a `figures` value with a BigInt member, added in the test with a type cast, makes the JSON printer throw with nothing written to stdout; through the command, the process exits non-zero with stdout empty.
- Empty figures: the JSON printer prints a valid document for the empty value.
Gate: the project's own test command, run in full, then its type check and lint if it has them. The prose change, the help or README line if there is one, is evidenced by its text in the diff and, where the parser prints help, by the help output.

## Left to the builder
- The name and exact position of the second printer; limits: beside `printReport` in `src/cli/report.ts`, named so that it pairs with it. `printReportJson` is the working name.
- How the flag is declared to the parser; limits: the way the parser declares any other flag, no second parser, no direct reading of the raw arguments.
- Which call writes the document; limits: the same kind of call `printReport` uses to reach stdout, one call, one trailing newline.
- Which fields go into the JSON if `figures` carries more than the text form prints; limits: exactly the figures the text form prints, no more and no fewer.
- What to do with any other stdout text that the command prints in JSON mode; limit: JSON mode skips it, so stdout holds the document alone.
- The names and files of the tests; limits: the project's existing runner and layout, no new dependency.

## Definition of done
- `report --json` prints one JSON document on stdout that parses as a whole and holds the figures the text form prints, no others, each with the value `figures` holds; this change adds nothing to stderr.
- `report` without the flag prints what it printed before and exits as before; the text-output test, existing or added first, passes unchanged.
- A failure in JSON mode leaves stdout empty and exits non-zero; the test for a value `JSON.stringify` rejects passes.
- The flag reaches the command through the registered parser; the test that runs `report --json` through `src/cli/index.ts` passes.
- The project's test command passes with no new failure, and its type check and lint, if it has them, report nothing new.
- The diff touches `src/cli/report.ts`, `src/cli/index.ts` only for the flag, the tests, and a help or README line only where one already lists the `report` options; the manifest and the lockfile are untouched.

## Repositories in scope
- `.`

## Assumption ledger
| # | Question | Chosen answer | Confidence | Reason |
|---|---|---|---|---|
| 1 | Who reads the JSON, and does the reader need a fixed shape? | A script, a CI step or a person piping `report --json` to a JSON tool; the shape is the figures as they are, with no wrapper and no version field | low | The brief names neither the reader nor a schema; raised by the builder check, only the ticket's author can answer, so it is not asked and the review packet is where to correct it |
| 2 | In JSON mode, should a failure be reported as JSON on stdout? | No: stdout stays empty and the error goes where a text failure goes today, with a non-zero exit code | low | The brief asks only for the figures; raised by the builder check, not asked; how a failed `report` ends today was not recorded, so this reuses it |
| 3 | Which test runner, layout and test command does the project use? | The project's existing ones; no new framework or dependency | low | Testing is not covered by the brief or the two files read |
| 4 | Which versions and platforms bind this change? | Those the project already pins; none changed | low | Not covered by the brief or the two files read; the manifest and the handbooks were not read |
| 5 | How does the parser carry a boolean flag, and must `src/cli/index.ts` change? | The flag is declared the way the parser declares any other flag; `src/cli/index.ts` changes only if the parser needs that | low | The code reading recorded a small argument parser, not its rules |
| 6 | Does the command print anything on stdout outside `printReport(figures)`? | No: `printReport(figures)` is the only printer; the whole-stdout parse catches a miss | low | The code reading recorded `printReport(figures)` as the printer, nothing more |
| 7 | Does `printReport` derive a figure, or does `figures` hold more than the text form prints? | No to both: `figures` is exactly the printed set; the parity test catches a miss | low | The code reading recorded a fixed set of figures printed through `printReport(figures)`, nothing more |
| 8 | Did the spec checker run on this spec? | No: it was checked by hand against the template, with headings in order, no template line left, every record line sourced or marked, and every marker in this ledger | low | The checker could not run in this session, so run it before the spec is committed; code sources cite a file and function, not a line, because the reading recorded no line numbers |
| 9 | Give `printReport` an options argument, or add a second printer? | A second printer, `printReportJson`, so the text printer stays untouched | medium | The two are close in size; keeping the text form untouched decides it |
| 10 | Which indentation and trailing newline does the JSON use? | Two spaces and one trailing newline | medium | The brief fixes neither; two spaces read well in a terminal and in a test diff, and any parser reads them |
| 11 | What does JSON mode print for an empty report? | The empty value as a valid JSON document, never nothing | medium | An empty report should still give a parser something to read |
| 12 | Does a help or README line change? | One line for `--json`, only where the parser keeps per-command help or the README lists the `report` options | medium | The brief asks for the flag only; documentation follows where it already exists |
| 13 | Does the flag get a short or a negated form? | No: `--json` only, long form | high | The brief names only `--json` |
| 14 | May a library be added? | No: the runtime's built-in `JSON.stringify` only | high | The smaller change; the brief needs nothing more |
| 15 | Which path does this ticket take? | Bounded: a new flag on a command whose code was read; the spec is still written because this is the ticket form | high | The flow to change already exists in `src/cli/report.ts` and `src/cli/index.ts` |
````

### Mechanical check (controller, 2026-10-13 00:01)

```
node skills/brainstorming/scripts/check-doc.mjs --template templates/specs/_template/Spec.md.tmpl <the saved spec>
template: S:\ultrapowers\.claude\worktrees\spec-template\templates\specs\_template\Spec.md.tmpl
exit=0
```

No finding: the status line, the thirteen headings in order, no surviving italic line, no placeholder, no empty section, two decision blocks (`### D1:` and `### D2:`) with the five labels in order and every line from `Why this one` onward tagged `Evidence:`, `Assumption:` or `My call:`, and a fifteen-row ledger with the confidences low, medium, high in that order.

Observed: Against the Expected after line, the run asked nothing, gave the path C:\proj\specs\GH-79\Spec.md, and wrote the template's thirteen headings in order, with a Decision record holding D1 and D2 blocks that each carry the five labels. The spec has a fifteen-row Assumption ledger, and each of its thirteen `Assumption:` and `My call:` lines has a ledger row. Ledger row 8 says the agent could not run the checker in the simulation; the controller's mechanical run above exits 0. The spec cites `src/cli/report.ts` and `src/cli/index.ts` as read in this session; the run itself read only the skill and the template, and those citations rest on the scenario setup's grounding sentence, which states that the grounding read the two files and what they hold; the spec's statements about them are consistent with that sentence; two details go beyond it, the words 'as text' and the edge case for any other `report` option, and the spec does not flag them; its ledger row 8 discloses that no line numbers were recorded.

## Verdict

- D: RED named three approaches (per-server memory counters, Redis fixed windows as the recommendation, a Redis token bucket) and why the other two lose, but gave no labelled failure points or edge cases and no source on any claim. GREEN names three approaches in its own words (a Redis-backed limiter in the existing chain as the recommendation, counting in each server's memory, and limiting at the edge in a proxy; the token bucket is not among them). The recommended approach carries labelled Why this one, Failure points and Edge cases parts, each bullet under them is tagged `Evidence:`, `Assumption:` or `My call:` (two Evidence lines, both citing RFCs), and each alternative has a Why not and a Main failure point. The one line without a tag is the `What it is` description.
- E: RED marked its calls, but sorted nothing before writing (the sort came after the draft existed) and never asked the partner about the uncovered section. GREEN sorted the sections before writing into covered, minor and theirs, asked the partner about Error handling in one message before writing, got "You decide.", and marked the settled items `My call:`, with nine ledger rows, each referenced from the spec. Checker exit code: 0.
- F: RED asked nothing and routed to `C:\proj\specs\GH-79\Spec.md`, but wrote an ad-hoc section set with no status line and no decision record. GREEN asks nothing, routes to the same path, and writes the template's thirteen headings in order, with D1 and D2 decision blocks and a fifteen-row ledger; its code citations rest on the grounding the scenario's setup supplies, not on a file the run read, which the Observed paragraph records. Checker exit code: 0.
- The D and E GREEN runs observed that the partner's own words in the conversation are not in the template's list of sources, which the controller has queued as a one-line template change.
