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

Observed: The RED skill did more than the brief predicted. It names three approaches, gives the reason for the pick, says why options 1 and 3 lose with a main failure point for each, and marks the pick, the defaults and the repository-dependent points as calls or assumptions, in prose. Three failure points or edge cases appear inside trade-off clauses (the window edge, Redis slow or unreachable, the proxy case), but none is labelled and none cites a source; the agent had no tools, and the partner's statements are its only grounding. The double-burst, per-server and bucket-logic claims are stated as plain fact. Absent: the `Evidence:`, `Assumption:` and `My call:` labels, and a labelled list of failure points and edge cases for the recommended approach. Already on the baseline, for Task 8: the three approaches, the reasons the alternatives lose, and the calls marked in prose.

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

Observed: The RED skill wrote the error-handling section without asking the partner: no message asks about failure, an empty list or commas. The section is marked, though. Its lead-in line says every line is a call, each bullet ends `[my call]`, and the hand-over repeats the calls, so the brief's "no mark" expectation does not hold on this baseline. The sort into answered, minor and theirs happened only after the draft existed, in an internal builder check whose theirs pile was empty. The tags are the agent's own, and the spec has no ledger and no fixed section set. Already on the baseline, for Task 8: the calls are marked and listed to the partner. Absent: the sort before writing, the one question before writing, and the ledger.

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

Observed: No question was asked and the spec path is `C:\proj\specs\GH-79\Spec.md`, so both expected results of the change already hold on the baseline. The spec has no `## Decision record` heading, as the brief predicted, and it has no `### D1:` block and no `Assumption:` lines. It does have an `## Assumption ledger` table, lowest confidence first, and a `## Repositories in scope` section. Some claims carry origin tags, `(brief)`, `(call)` or `(assumed)`, but no claim cites a file or a measurement as evidence. Its section set is its own. The rejected alternatives appear only as non-goals, without failure points. Current state names `printReport(figures)` and the argument parser in `src/cli/index.ts` with no tag, though the brief names neither, the setup contains no code and the run had no tool to read it. Already on the baseline, for Task 8: no question, the exact path and the ledger table. Absent: the decision record, the D1 block, the Assumption lines and the fixed section set.

## Verdict
