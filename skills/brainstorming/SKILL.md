---
name: brainstorming
description: "You MUST use this before any creative work - creating features, building components, adding functionality, modifying behavior, or planning anything new, in software or out of it (a talk, a business, a renovation)."
---

# Brainstorming

You are very good at building. You build what you believe your human
partner wants, and that belief is usually thinner than it feels. This
skill is for finding out what they actually want, and why, before
anything gets built.

People often haven't finished working out what they want. Good questions
help them think it through. When you understand the why, you make the
hundred decisions they never mention the way they would have made them.

## First: What Do You Actually Know?

Before you reply, ask yourself: what do I know about what they want, and
why?

- **Everything that matters is in the request** ("make the icon cornflower
  blue", and the icon is already in the repo). This is a quick, clear
  task. Do it, and say what you did. Your human partner's request is the
  approval; nothing is left to present.
- **Something non-trivial is missing.** Start the conversation, below.

In the ticket form (`ultrapowers:brainstorm-task` invoked you, or
`.agents/ultrapowers.json` exists at or above the working directory and a
ticket id is known, or the Autopilot form applies) the quick-task size does
not apply and you make no skip offer: however small the ticket, the output
is the ticket spec, routed as under "Where it goes".

Knowing the genre of a thing does not tell you why they want it. When the
request or the brief already supplies the purpose and constraints, play
them back instead of asking again; gathering missing requirements never
asks them to authorize the task a second time.

## Your First Message

Before your first question, classify the request (see Three Paths) and say
the classification out loud, so your human partner can override it. Your
first message is then two things, in this order:

1. One line that says the classification ("this looks like a new project,
   so I'll write a short design before building anything") and lets them
   know that if they'd rather skip the questions and have you just start,
   they can say so. If they take you up on it, this skill is done: state
   any significant how-it-gets-made choice (platform, language, medium) in
   one plain line, naming that they can change it, then do what they asked
   through the normal workflow.
2. One open question that gets them describing. Ask about a real moment
   or a concrete picture: "What's the moment you find yourself wishing
   this existed?" or "Tell me about the people who'll be in the room."

That's the whole message. (When a brief already answers the open
question, skip it and start with the playback below.)

## Three Paths

The classification is a size, picked from what you can see now and
confirmed once you understand the request. Your human partner can
override it:

- **Spike** — a feasibility question ("can we...", "is it possible...",
  "quick and dirty is fine") whose output is an answer, not code you
  keep. Present the question and what you'll try in 2-3 sentences, get
  a nod, then find out as cheaply as correctness allows. No design
  doc, no spec file. Spikes get no tests or minimal ones, are not
  bulletproof, and skip the plan, implementation and review process.
  Report findings as a recommendation; anything you built stays labeled
  throwaway. Bring what the spike taught you back into the conversation.
- **Bounded** — a small change to code that already exists in this repo:
  a new flag, a small endpoint, a one-file fix. Understanding the kind of
  app is not enough — bounded means the flow you are changing is already
  here to read. If there is no existing flow to change, the task is not
  bounded. Ask the questions that matter, present a short design IN CHAT
  (a few sentences to a few short paragraphs), name in one line the
  alternative you did not take and why, and STOP. Implementation
  starts only after your human partner says yes to that design — a
  bounded task's approval is as hard a gate as an architectural one. No
  spec file, no implementation plan document.
- **Architectural** — new projects, new subsystems, changes that
  restructure how components fit together or alter interfaces others
  depend on, and anything else that deserves a written design. Follow the
  full process: the conversation, the written design, then the
  writing-plans skill.

When in doubt between two paths, take the heavier one. The ratchet is
one-way: hidden complexity discovered mid-task upgrades the path — stop,
say so, and step up. Nothing downgrades mid-task, and a quick task that
turns out not to be quick is classified at that moment.

If the request is really several independent projects, say so, agree on
an order, and brainstorm them one at a time; each gets its own design,
plan and implementation.

## Autopilot form

When `.ultrapowers/autopilot-active` exists at or above the working directory,
or the autopilot skill invoked this stage, the human gate is on the ticket
tracker, not in this chat. Ask no question: no skip offer, no open question,
no playback to wait on. For every question the selected path would ask,
including which how-it-gets-made choices (platform, language, libraries,
medium) are yours, decide it yourself as a senior engineer would from the
brief, the grounded code and the project's handbooks: the existing pattern,
the smaller change. Record each decision as one row of a `## Assumption
ledger` table in the spec, `| # | Question | Chosen answer | Confidence |
Reason |`, lowest confidence first; every `Assumption:` and `My call:`
line of the decision record is a ledger row, and a whole section the
brief and the code do not cover becomes rows at low confidence. Add a
`## Repositories in scope` section listing the `repos[].name` entries the
design touches, or `.` in a single-repository project. The builder check
runs when a subagent tool is available; each question in its "theirs"
pile becomes a low-confidence ledger row and is never asked. Everything
else holds: the three paths, the design sections, the spec self-review.
The User Review Gate becomes writing the spec and returning to the caller;
the review happens on the packet the engine posts.

## The Conversation

Each message ends with one question: a single sentence with no list of
example answers hanging off it. Use plain language, pitched just a little
above where your human partner is. Match their vocabulary; never use
process jargon. Be clear and concise. Lead with what matters. When you
report what you found, give them the most important findings and offer
the rest.

**Get them describing.** Open questions come first. Their own words carry
intent that your options can't. Offer a short menu only when they're
stuck. When they say "just guess" or "what do you think?", propose
something concrete. (A caller that has already read the code, such as
`ultrapowers:brainstorm-task`, may ask the grounded question with the
choices its reading found, and its recommendation. In that caller's door its rhythm (one question per
message, multiple choice, your recommendation first) stands, and the
open-first-question rule yields to it.)

**How it gets made.** Every project rests on choices about medium, tools,
materials, and resources: the platform, programming language, and
libraries for an app; the medium for a piece of art. Find out early which
of those choices they want to make, which they're handing to you, and what
they already have to work with. Someone with strong views or skills will
want to talk it through. Someone counting on you needs sensible defaults,
said in plain words. When there's existing work, build on what it already
uses. Any choice you make goes in the design as your call, never as
something they agreed to. This holds even when they skip the questions.

**Ground to cover.** This is territory, not a script. Never read these
out as questions:

- what kind of thing this is, and what makes it special
- why now, and what success looks like to them
- goals, non-goals, and anti-goals (what would make this a failure even
  if it technically works)
- prior art: what they've seen elsewhere, loved or hated
- current state: what exists now, what they've tried
- the details they care about
- in the architectural path and the ticket form, every question of the
  spec template: run `node "<brainstorming skill directory>/scripts/check-doc.mjs" --print-template`
  once and read the file it names; the brainstorming skill directory is
  the one this SKILL.md was loaded from, not the caller's

**Questions that work** anchor in specifics: "Walk me through the last
time...", "If it could only do one of these well, which?", "What would
make you wince if I got it wrong?" A guess they can correct ("I'm
guessing this is because X keeps biting you?") often beats a question.

**Offer recon.** Once you have a bit of grounding and looking would help,
offer to go look: their codebase or project, their own files and data,
or the web. Say what you'd look for. They decide whether you go.
Read-only exploration of the project is allowed at any time.

**Think wide privately.** Before you propose anything, come up with
several ideas and drop the weak ones, including any that fight what
they've told you about why. In the architectural path and the ticket
form, present the approaches before the design, in one message. The
recommended one carries, as bold-labelled bullets, what it is and then
`Why this one`, `Failure points` and `Edge cases`, the labels the spec
template's decision record uses. Every line under those labels
ends with its source, `Evidence: <source>`, or says `Assumption:` with
the reason or `My call:` for a minor choice. Each other approach carries
why not and its main failure point, with their sources. No table. End
with your recommendation and one question. In the autopilot form there is
no message: the record goes straight into the spec. YAGNI ruthlessly:
remove unnecessary features from every idea.

**Show, don't tell.** Offer the visual companion (below) whenever seeing
would help more than reading:

- something they'll look at: a screen, a page, a printout, a sign
- a layout or arrangement: of a screen, a room, a schedule
- a flow or a sequence of steps
- options that would look different from each other
- a structure that's easier to see than read: a diagram, a timeline, a map

Once they've accepted, use it for mockups to react to, side-by-side
options, and throwaway prototypes they can click.

**Spike to feel things out.** Agentic work is waterfall, but very, very
fast. A quick throwaway build is often the cheapest way to learn what
they want or whether something works. Offer one when it would help, under
the Spike path above.

## Play It Back

Play back as you go. As soon as you understand one part well enough to
describe it (what it's for and who it serves, say, or how one piece
behaves), describe that part back in about 200-300 words, then return to
questions about the next part. Playback and questions alternate through
the whole conversation; the last chunk covers whatever is left. For a
bounded change, the short chat design is the playback.

Mark anything you're guessing as your guess; only what they said goes in
as theirs. End each chunk by asking what's wrong or missing, and
incorporate the answer before treating it as the design.

Before you send a chunk, check it: does it describe something they'll
look at, like a page, a screen, a schedule, or a printout? If so, and
they haven't seen the visual companion offer yet, send the offer instead
(its own message, below) and hold the chunk for the next message. Once
they've accepted, put a mockup next to the description.

For software designs: break the system into units with one clear purpose
and well-defined interfaces, that can be understood and tested on their
own. In an existing codebase, follow its patterns, include the targeted
improvements the work needs (a file grown too large, tangled
responsibilities), and propose no unrelated refactoring.

**Cover the template before you write.** Before the written design, take
every italic line of the spec template and sort it, the way the builder
check sorts: covered, your partner said it; minor, a sensible builder
could settle it without changing what gets built, so settle it and mark
it `My call` with a ledger row; theirs, only your partner can answer and
the answer changes what gets built. Ask the theirs pile in one message,
most important first. A whole section nobody covered is asked, not
filled. Then write.

## The Written Design

For an architectural-path project, write a plain document a talented
builder in the domain could plan from without going back to your human
partner. Write it from the spec template the checker names, starting at
the title: every heading kept, every italic line answered or removed, a
section that does not apply saying `None:` with the reason, and D1 the
approach you presented, as chosen. The same holds for every spec in the
ticket form, whichever path it took.

Carry the agreed understanding into it, and check every feature and
technical choice against that understanding.

**Where it goes:**

- Write the design (spec) to `docs/ultrapowers/specs/YYYY-MM-DD-<topic>-design.md` and commit it. Outside a software repo, ask where.
  - (User preferences for spec location override this default)
  - If `.agents/ultrapowers.json` exists at or above the working directory and a ticket id is known from the conversation, on every path in the ticket form, not only the architectural one, write the spec to `specs/<id>/Spec.md` under the project root (the directory that contains the `.agents` folder, not inside it) instead of the default path. With no such file, or no ticket id, the default above stands.
- Use elements-of-style:writing-clearly-and-concisely skill if available

**Spec self-review.** After writing the spec, look at it with fresh eyes:

1. **Placeholder scan:** Any "TBD", "TODO", incomplete sections, or vague requirements? Fix them.
2. **Internal consistency:** Do any sections contradict each other?
3. **Scope check:** Is this focused enough for a single implementation plan, or does it need decomposition?
4. **Ambiguity check:** Could any requirement be interpreted two different ways? Pick one and make it explicit.
5. **Template check:** run `node "<brainstorming skill directory>/scripts/check-doc.mjs" "<spec path>"`. Fix every line it reports; nothing is handed over while it reports. Without node on this machine, say so in one line and hand over: the template you wrote from is the project's `specs/_template/Spec.md`, or the plugin's `templates/specs/_template/Spec.md.tmpl` when the project has no copy, and the commit-time check runs wherever node is. If the checker runs and exits 2, say so and do not hand over.

Fix issues inline; no need to re-review.

**Builder check:** dispatch a fresh subagent with
`builder-check-prompt.md` in this directory. When you tell your human
partner you're writing it up, say a reviewer will read it first and you
may come back once with a few questions. Don't hand over the document
until the check is back. Sort what the builder asks into three piles:

- **Answered already** by the conversation or the project: put the answer
  in the document.
- **Minor:** a sensible builder could settle it without changing what gets
  built. Settle it yourself and mark it in the document as your call.
- **Theirs:** only your human partner can answer it, and the answer changes
  what gets built.

Bring the "theirs" pile in one message, most important first. Update the
document with their answers, then hand it over with a short list of the
calls you made so they can check those while reading. That's the only
round of questions the check produces. Without a subagent tool, read the
document as that builder yourself.

**User Review Gate.** Once the check is done, ask your human partner to
review the written spec before proceeding:

> "Spec written and committed to `<path>`. Please review it and let me know if you want to make any changes before we start writing out the implementation plan."

Wait for the response. If they request changes, make them and re-run the
self-review. Only proceed once they approve. In the autopilot form there
is no wait: write the spec with its ledger and scope sections and return
to the caller, which commits it and posts the packet.

**Implementation.** Invoke the writing-plans skill to create a detailed
implementation plan. Do NOT invoke any other skill.

<HARD-GATE>
Before taking any implementation action, including invoking an
implementation skill, writing product code, scaffolding, installing
product dependencies, or creating an external project, complete the
selected path's prerequisites:

- Quick task: nothing; the request was the approval.
- Spike: the human partner approves the question and probe.
- Bounded: the human partner approves the short in-chat design.
- Architectural: the human partner reviews and approves the written spec,
  then reviews the written implementation plan and selects its execution
  method. Conversational design approval only permits writing the spec;
  written-spec approval only permits invoking writing-plans.

A reply approves the stage actually presented. Approval of an idea or
feature scope does not approve artifacts that do not exist yet. Resume
at the earliest incomplete stage; do not turn one approval into permission
to skip the rest of the selected path. Read-only project exploration is
allowed while those prerequisites remain incomplete.

Two exceptions. If they opted out of the questions, the skill is done and
the gate goes with it (the normal workflow still applies). A spike they
said yes to may be built; it stays labeled throwaway, and keeping what it
produced is a new request that comes back through this gate. Neither
exception exists in the autopilot form, whose gate is the tracker.

Terminal states are path-bound. Architectural: the ONLY skill you invoke
after brainstorming is writing-plans — never frontend-design, mcp-builder,
or any other implementation skill. Bounded: after approval,
implementation proceeds directly through the normal development workflow
(TDD applies); no plan document. Spike: the terminal state is a reported
recommendation.
</HARD-GATE>

## Anti-Pattern: "Too Simple To Need Approval"

Every path ends with your human partner approving the required design
before implementation, except the quick task whose request already says
everything. A bounded change may need only two sentences in chat. A new
todo-list project is architectural and requires the written spec and
planning handoffs. Scale the artifact to the selected path; complete that
path's reviews before implementation.

## Red Flags

| Thought | Reality |
|---------|---------|
| "This is too simple to need a design" | Follow the selected path: a bounded change gets a short chat design; an architectural change gets the written spec and planning handoffs. |
| "I'll call it bounded and skip the spec" | Reaching for a label to skip work IS the doubt — take the heavier path. |
| "It's bounded and the design is obvious — I'll start while they read it" | The gate is the approval, not the design's length. Present, then stop until you hear yes. |
| "I understand this kind of app, so it's bounded" | Bounded measures the repo, not your familiarity. A new project has no existing flow — it is architectural. |
| "The spike works, so I'll keep the code" | A spike's output is an answer. Keeping the code, or building on it, is a new request — classify it and go back through the gate. |
| "It grew, but I'm almost done — no need to re-classify" | Hidden complexity upgrades the path mid-task. Stop and say so. |
| "They approved the spike, so the follow-up change is approved too" | Each task gets its own classification and its own approval. |
| "I'll offer options to save them effort" | Options steer. Ask them to describe it first. |
| "I'll fill in sensible defaults" | Good. Say them out loud. A default they never heard is one they couldn't reject. |
| "I should explain the process first" | Ask your question. The process shows itself. |
| "They said 'sounds good' to the idea" | Approval covers what you showed them. A description you haven't written isn't approved. |
| "I'll fill the section so the checker passes" | A filled blank is an assumption. Sort it: minor is your call, marked; theirs is a question. |
| "The template asks it, so I'll ask them" | Sort first. Only the theirs pile reaches your partner, in one message. |
| "I'll show one approach, the others are obviously worse" | The rejected options and why they lost are part of the design. Name them, with their failure point and its source. |

## Visual Companion

A browser tab for showing mockups, diagrams, and prototypes. It's a
tool, not a mode: accepting it doesn't send every question to the
browser.

**Offer it just-in-time.** Offer it the first time one of the moments
under "Show, don't tell" comes up, never upfront. The offer is its own
message with nothing else in it:

> "This might be easier if I show you. Want me to open a browser tab with some mockups?"

If they decline, stay in text and don't offer again unless they raise it.
If they accept, start the server with `--open` so their browser opens to
the first screen automatically. (Not offered in the autopilot form.)

**Per question, ask: would they understand this better by seeing it?**
Mockups, layouts, diagrams, and side-by-side designs go in the browser.
Requirements, scope, tradeoffs, and conceptual choices stay in text. A
question about a UI topic isn't automatically a visual question.

If they accept, read `skills/brainstorming/visual-companion.md` before
starting the server.
