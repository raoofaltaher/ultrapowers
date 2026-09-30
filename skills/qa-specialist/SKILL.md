---
name: qa-specialist
description: Use when a ticket's implementation is complete and your human partner wants the QA gate, a QA pass, or a go or no-go verdict before merge or release
context: fork
agent: qa-specialist
---

# QA Specialist

## Overview

Run the seven-lane QA gate for one ticket and leave one verdict in `reviews/<ID>/QA-REPORT.md`.
This skill decides whether a run may start and in which mode; the qa-specialist contract
performs the run. Invoking it is your human partner's yes for writing `reviews/<ID>/` and
`.ultrapowers/`, and nothing else.

**Core principle:** before the marker exists, a problem stops the run with a message; once the
marker exists, every path ends with a report, a removed marker and one verdict line.

**Announce at start:** "I'm using the qa-specialist skill to run the QA gate for ticket <ID>."

## Arguments and names

- Your arguments, as the harness passed them: `$ARGUMENTS`. The first word is the ticket; a
  single word is a ticket with no note. Only when those backticks are empty, or still hold the
  unreplaced placeholder (a dollar sign followed by the word ARGUMENTS), did the harness not pass
  them: then take the first word of the trailing `ARGUMENTS:` line of the message that invoked
  this skill. No ticket either way: print `usage: /ultrapowers:qa-specialist <ticket> [note]`
  and stop.
- Words after the ticket are your human partner's note. A note may set emphasis (which area
  first, which problem to reproduce). It never removes the browser, a role with credentials, a
  language, an active lane or the report; record what it asked for that the contract forbids in
  the report's Partner note, with the rule.
- `<SKILL_DIR>` is `${CLAUDE_SKILL_DIR}` when your harness substitutes it, otherwise the
  directory this SKILL.md was loaded from; `<plugin root>` (used by the contract and the lanes)
  is two levels above it. `<ID>` is the ticket; `<ROOT>` is the preflight's `root`.

## Step 1: Preflight

```bash
node "<SKILL_DIR>/scripts/qa-preflight.mjs" "<ID>"
```

Keep its whole JSON output: it is the contract's Inputs. It reports credentials by presence
only; never print the environment yourself.

| Exit | Meaning | Do |
|------|---------|----|
| 0 | a report | continue with Step 2 |
| 2 | usage | print the usage line and stop |
| 3 | no project root: `errors[0]` starts `ERROR: no .agents/ultrapowers.json` | print it, offer `/ultrapowers:init`, stop |
| 4 | the ticket fails the project's `ticketPattern` | print `errors[0]` and stop |

## Step 2: Config and scope

- `missing` is non-empty (then `ok` is false): print every entry of `missing` and every
  `warnings` line, tell your human partner to fill them under `qa` in `.agents/ultrapowers.json`
  and run the skill again, and stop. `missing` equal to `["qa"]` means the section is absent:
  offer `/ultrapowers:init` in upgrade mode. No marker and no report: nothing ran.
- `preconditions` non-empty does NOT stop you here. The run starts, and the contract's STEP 1
  ends it with a `PRECONDITION-FAILED` report naming each precondition.
- `docs.brief.exists` and `docs.spec.exists` both false, and no `changeSet` entry has
  `onTicketBranch: true`: there is nothing to derive the feature from. Say so, suggest
  `/ultrapowers:new-task <ID>` or checking out the ticket's branch, and stop.
- Print `warnings` and every non-empty `changeSet[].error` once, as one short list. They do not
  stop the run; the report's header shows them.

## Step 3: Fresh, resume or stop

When `markerExists` is true, read the marker: `cat "<ROOT>/.ultrapowers/qa-active"`. The
preflight already decided whether run-state holds unfinished work: `runState.unfinished` is true
when a plan row is still `pending` or `running` (lane and suite statuses do not count).

| Marker | `reviews/<ID>/run-state.json` | Decision |
|--------|-------------------------------|----------|
| names another ticket | any | **stop**: tell your human partner that a QA run for that ticket is active or died, and that removing `.ultrapowers/qa-active` is their call |
| absent, or this ticket | `runState.unfinished` true | **resume** |
| absent, or this ticket | exists, `runState.unfinished` false, or `runState.error` set (print it) | move the previous run aside, then **fresh** |
| absent, or this ticket | absent | **fresh** |

Moving the previous run aside, with `<STAMP>` the current UTC time as `YYYYMMDDTHHMMSSZ`, so
its screenshots and suite results are never read as this run's:

```bash
mv "<ROOT>/reviews/<ID>/run-state.json" "<ROOT>/.ultrapowers/run-state-<ID>-<STAMP>.previous.json"
test -d "<ROOT>/reviews/<ID>/artifacts" && mv "<ROOT>/reviews/<ID>/artifacts" "<ROOT>/.ultrapowers/artifacts-<ID>-<STAMP>"
```

A fresh run replaces an existing `QA-REPORT.md` (`docs.reviewFiles` lists it); say so in one
line. Git history keeps the old one when it was committed.

## Step 4: Marker

```bash
mkdir -p "<ROOT>/.ultrapowers" && printf '%s' "<ID>" > "<ROOT>/.ultrapowers/qa-active"
```

The ticket id, no trailing newline. From here the guardrail checks every tool call in this
session, and every path ends in Step 7.

## Step 5: The contract

- **Forked:** your instructions already hold the qa-specialist contract (its "Absolute rules"
  and "The procedure, in order" with STEP 0 to STEP 9). You are the qa-specialist agent; go on.
- **Inline:** they do not; this harness did not fork. Read `<plugin root>/agents/qa-specialist.md`
  in full with the file-reading tool and follow its body as your contract for this run. Say
  once: "Running the QA contract inline: this harness does not fork." The unsafe browser-code
  tool stays forbidden; the guardrail denies it.
- Inline runs share the main context: pace them, never shrink them. Evidence goes to disk and
  run-state at capture time; read logs and bodies through `head`. When the context runs short,
  finish the current row, update run-state and end through STEP 8 with `INCOMPLETE`, listing
  the pending rows; the next invocation resumes from them.

## Step 6: Run

Follow the contract from STEP 0, with the preflight report as its Inputs, in the mode from
Step 3. On **resume**, tell the contract that run-state exists: it reloads the file, keeps
`startedAt`, `watermark`, every `done` row and every finding, re-attaches to suites whose
process is alive, and continues from the first `pending` row.

## Step 7: Close

After the contract's STEP 9, check:

```bash
test -f "<ROOT>/reviews/<ID>/QA-REPORT.md" && echo report-present; test -e "<ROOT>/.ultrapowers/qa-active" && echo marker-present
```

- No `report-present`: write the report now per `ultrapowers:qa-report`, verdict `INCOMPLETE`,
  naming what stopped the run.
- `marker-present`: remove it with `rm "<ROOT>/.ultrapowers/qa-active"`, and delete
  `qa-token.json`, `qa-cookies-*.txt`, `qa-trace-*.json` and `qa-api-*.txt` under
  `<ROOT>/.ultrapowers/` where they exist.
- The last line of your output is exactly `Verdict: <value> — reviews/<ID>/QA-REPORT.md`, with
  the value from the report's `Verdict:` line.

## Checklist

Create a todo for each item and complete them in order:

1. **Read the ticket** — stop with the usage line when it is missing
2. **Run the preflight** — stop on exit 2, 3 or 4
3. **Check config and scope** — list every `missing` key and stop; stop when there is nothing to test
4. **Choose fresh, resume or stop** — from the marker and run-state
5. **Write the marker**
6. **Load the contract** — forked already, or read it inline
7. **Run the contract** — STEP 0 to STEP 9, the preflight report as Inputs
8. **Close** — report present, marker and scratch files gone, the verdict line last

## Red Flags

| Thought | Reality |
|---------|---------|
| "Most of the config is filled; I'll start and work around the gaps" | Every key in `missing` blocks the run. List them all and stop. |
| "I can read the config myself; the preflight is overhead" | The preflight also validates the ticket, gates every lane with a reason and derives the change set from git. Run it. |
| "The marker names another ticket, but it is obviously stale" | Stale or live, removing it is your human partner's call. Stop and name the ticket. |
| "The old run-state looks messy; a fresh start is cleaner" | Unfinished run-state means resume: `done` rows stay done and findings are never zeroed. |
| "My partner's note says to skip the browser this time" | A note sets emphasis, never coverage. Drive the browser and record the declined request in the Partner note. |
| "Inline and short on context, one role will do" | Inline changes pacing, not coverage: checkpoint run-state, end `INCOMPLETE`, and the next run resumes. |
| "The stack is down, so a chat message is enough" | The marker exists, so the run has started: write the `PRECONDITION-FAILED` report, remove the marker, print the verdict line. |
| "The guardrail keeps denying me; removing the marker would let me finish" | The marker is the guardrail's switch. It is removed in STEP 9 or Step 7 and nowhere else. |
| "The remaining screenshots can go in as one line of links" | Every screenshot in the report is embedded with `![caption](artifacts/<file>.png)`. A link hides the evidence from the reader and fails the report check. |
