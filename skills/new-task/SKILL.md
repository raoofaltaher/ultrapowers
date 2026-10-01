---
name: new-task
description: Use when a ticket id arrives and its task, spec, plan and review folders do not exist yet, before any brainstorming or code
---

# New Task

## Overview

Turn a ticket id into the four knowledge base folders and a short kickoff brief, committed once. The brief is a kickoff, not a spec: two short paragraphs at most.

**Core principle:** a re-run never overwrites a real brief.

**Announce at start:** "I'm using the new-task skill to scaffold ticket <ID>."

## Arguments

`ticket` (required) then `title` (optional, every remaining word), in that order. Your arguments, as the harness passed them: `$ARGUMENTS`. The first word is the ticket; a single word is a ticket with no title. Only when those backticks are empty, or still hold the unreplaced placeholder (a dollar sign followed by the word ARGUMENTS), did the harness not pass them: then read them from the trailing `ARGUMENTS:` line of the message that invoked this skill. Context for the brief comes from the conversation, not from the arguments.

With no ticket, stop and print `usage: /ultrapowers:new-task <ticket> [title]`.

## Before running anything

- `<SKILL_DIR>` is the directory this SKILL.md was loaded from. `<ID>` is the ticket. Fill both in before running a block.
- Every block prints marked sections. Read the output before continuing. Any line containing `ERROR` means stop and print it verbatim.
- The project root is wherever `.agents/ultrapowers.json` sits at or above the working directory; the script finds it. If it reports the project is not scaffolded, offer `/ultrapowers:init` and stop.

## Step 1: Check

```bash
bash "<SKILL_DIR>/scripts/scaffold-task.sh" check "<ID>"
```

- `tasks/<ID> EXISTS` — stop, change nothing, print what is there, and tell your human partner to run `/ultrapowers:task <ID>`.
- `ERROR: ticket ...` — the id does not match the project's `ticketPattern`; print the line and stop.
- All four `absent` and `OK: continue with create` — continue.

## Step 2: Create

```bash
bash "<SKILL_DIR>/scripts/scaffold-task.sh" create "<ID>" <title words>
```

This creates `tasks/<ID> specs/<ID> plans/<ID> reviews/<ID>`, a `.gitkeep` in the last three, and the brief `tasks/<ID>/<ID>.md` in the shape below, with the title or `title pending` when none was given.

## Step 3: Fill the brief

If your human partner gave context in the conversation, replace the angle-bracket prompts in the brief with it using the file-editing tool. If they gave none, ask one question: "What is this ticket about, in a sentence or two?" If the answer is "later", keep the prompts as they are.

The brief is exactly this shape, nothing more:

```markdown
# <ID> - <title or "title pending">

## Context
<one paragraph: how things behave today and what this task changes>

## Definition of Ready
- [ ] <what must be true before work starts>

## Definition of Done
- [ ] <how anyone checks the goal is met>

## Related Documentation
- <links to specs, handbooks, memory entries; leave empty if none>
```

Context is one paragraph. The whole brief holds two short paragraphs at most; anything longer is spec material for brainstorm-task, and you say so.

## Step 4: Commit

```bash
bash "<SKILL_DIR>/scripts/scaffold-task.sh" commit "<ID>"
```

Commits `chore(<ID>): scaffold task` with a one-line body and the project's `commitTrailer` when one is configured; none otherwise.

## Step 5: Hand off

Tell your human partner: fill the brief if it still has prompts, then run `/ultrapowers:brainstorm-task <ID>`.

## Checklist

1. Read the arguments; stop with usage when the ticket is missing
2. Run `check`; stop on EXISTS or ERROR
3. Run `create`
4. Fill the brief from the conversation, or ask one question
5. Run `commit`
6. Hand off to brainstorm-task

## Red Flags

| Thought | Reality |
|---------|---------|
| "The folder exists but the brief looks wrong, I'll regenerate it" | new-task never overwrites. Point at `/ultrapowers:task <ID>`; an edit to a brief is your human partner's explicit request, made in the file, never through this skill. |
| "They gave me a lot of context, the brief should hold all of it" | Two short paragraphs. The rest is spec input for brainstorm-task; offer to carry it there. |
| "I'll skip `check`, the folders are obviously new" | `check` also validates the id against the project pattern and finds the root. Run it. |
| "The git toplevel is the root" | Inside a nested clone the toplevel is the wrong repository. The script walks up to `.agents/ultrapowers.json`. |
| "I'll add the sign-off I saw in the last commit" | The trailer comes from `commitTrailer` in the project config, or nothing. |
| "They told me to overwrite it, so it is allowed" | new-task never overwrites, even on request. Stop at `check`, point at `/ultrapowers:task <ID>`, and edit the existing brief in place only when your human partner asks for that edit. |
| "Git has the old brief, so overwriting is safe" | A recoverable overwrite is still an overwrite of someone's work. Recovery is a chore you hand to your human partner; not overwriting costs nothing. |
