---
name: task
description: Use when your human partner names a ticket id and wants to know where it stands, resume it, or load its documents, before doing any work on it
---

# Task

## Overview

Load every markdown document a ticket has and report where it stands. This is a bulk loader, not a summary: cost is not a reason to read less. It writes nothing and starts nothing.

**Announce at start:** "I'm using the task skill to load ticket <ID>."

## Arguments

`ticket` (required). Your argument, as the harness passed it: `$ARGUMENTS`. A single word there is the ticket. Only when those backticks are empty, or still hold the unreplaced placeholder (a dollar sign followed by the word ARGUMENTS), did the harness not pass it: then read it from the trailing `ARGUMENTS:` line of the message that invoked this skill.

With no ticket, stop and print `usage: /ultrapowers:task <ticket>`.

## Step 1: Manifest

`<SKILL_DIR>` is the directory this SKILL.md was loaded from; `<ID>` the ticket. Fill both in before running.

```bash
bash "<SKILL_DIR>/scripts/manifest.sh" "<ID>"
```

Sections: `MARKDOWN TO READ` (path, bytes, estimated tokens), `NON-MARKDOWN` (listed, not read), `REPO STATE` (per repo: branch, whether it is a ticket branch, last ten commits, short status). Read the output before continuing. Any line containing `ERROR` means stop and print it verbatim; if the project is not scaffolded, offer `/ultrapowers:init`.

## Step 2: Read everything listed

With the file-reading tool, one call per file, in this order: `tasks/`, `specs/`, `plans/`, `reviews/`. That runs brief, design, plan, outcome. Not through the shell: large output is diverted and only a preview reaches you. Read all of them; the point is that your human partner never names a file.

## Step 3: Report

In this order:

1. **Position, one sentence.** What stage is the ticket at?
2. **Done**, with evidence from the documents.
3. **In flight**: uncommitted files, an open review finding, a ticket branch with work on it.
4. **Next step**, in order.
5. **Every missing part, by name.** `ABSENT` folders are normal early on; say which. When all four are absent, say the ticket does not exist yet and suggest `/ultrapowers:new-task <ID>`.
6. **The non-markdown list**, when it is not empty: the files exist, you did not read them, name one by path to have it read.

## Step 4: Write nothing

Do not edit, create, commit or push. Do not start the work the documents describe. If your human partner wants work done, they will say so in their next message.

## Checklist

1. Read the argument; stop with usage when it is missing
2. Run the manifest; stop on ERROR
3. Read every listed markdown file, in order
4. Report the six parts
5. Change nothing

## Red Flags

| Thought | Reality |
|---------|---------|
| "The plan is 40 KB, I'll skim the headings" | Read all of it. The loader exists so nothing is skipped. |
| "I'll fix that typo in the spec while I'm here" | Report it under in flight or next step. Writing is a separate request from your human partner. |
| "No spec yet, so I'll start brainstorming" | Name the gap and suggest the skill. Starting work is your human partner's call. |
| "I'll cat the files in one shell call" | Truncated to a preview. One file-reading call per file. |
| "It is a one-word, uncommitted change, not really a write" | Any change to a file is a write. The loader writes nothing; list the fix under next steps and offer it as a separate action. |
