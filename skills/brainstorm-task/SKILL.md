---
name: brainstorm-task
description: Use when a ticket has a brief in tasks/<id>/ and needs a spec grounded in the code, before writing any design or plan
---

# Brainstorm Task

## Overview

Ground a ticket in the code it touches, then run `ultrapowers:brainstorming` so the spec lands in `specs/<ID>/Spec.md`. Questions come from what you read, never from a blank page.

**Core principle:** grep before you read, read before you ask, print what you read.

**Announce at start:** "I'm using the brainstorm-task skill for ticket <ID>."

## Arguments

`ticket` (required) then `focus` (optional words: repo names from the project config, or areas such as `backend` or `frontend`). Substituted values, when the harness substitutes them: `$ARGUMENTS`. If that shows the literal text `$ARGUMENTS` or nothing, read the trailing `ARGUMENTS:` line of the message that invoked this skill instead.

With no ticket, stop and print `usage: /ultrapowers:brainstorm-task <ticket> [focus...]`.

## Before running anything

- `<SKILL_DIR>` is the directory this SKILL.md was loaded from; `<ID>` the ticket; `<REPO>` a repo name from the preflight, or `.` for the root. Fill them in before running a block.
- Every block prints marked sections. Read the output before continuing. Any line containing `ERROR` means stop and print it verbatim. If a script reports the project is not scaffolded, offer `/ultrapowers:init` and stop.

## Step 1: Preflight

```bash
bash "<SKILL_DIR>/scripts/preflight.sh" "<ID>" <focus words>
```

Sections: `BRIEF`, `EXISTING SPEC WORK`, `REPOS`, `SELECTION`.

- `>>> SPEC-COLLISION` — a file named `spec.md` in any letter case already exists. Tell your human partner and ask one question: revise it or replace it? Write nothing until they answer.
- `BRIEF-MISSING` — handle it in Step 2 before anything else.

## Step 2: Read the brief

Read `tasks/<ID>/<ID>.md` with the file-reading tool, not through the shell: large shell output is diverted to a side file and only a preview reaches you.

If the brief is missing, ask your human partner for the source (pasted text, a path, or a link), write `tasks/<ID>/<ID>.md` in the new-task brief shape (title line, Context, Definition of Ready, Definition of Done, Related Documentation; two short paragraphs at most), and continue.

## Step 3: Select repositories

The `SELECTION` section applied the order, first hit wins:

1. `SELECTED-BY-FOCUS` — focus words matched a repo name or its declared `area`.
2. `SELECTED-BY-BRANCH` — a repo is on a branch containing the ticket id.
3. `SELECTED-ROOT` — the project has no nested repos; the root, shown as `.`, is the set.
4. `ASK` — ask one multiple-choice question over the listed repos, proposing at most three.

Whatever the selector produced, confirm the set with your human partner before reading any code.

## Step 4: Ground in the code

Per selected repo, with the brief's own terms, one term per argument:

```bash
bash "<SKILL_DIR>/scripts/ground.sh" "<ID>" "<REPO>" <term> <term> ...
```

It greps the terms and prints at most eight candidate files, highest hit count first, and says how many more it cut. Read only files it listed, highest first, with the file-reading tool. Never list a directory tree. Then research the domain only for terms the brief raises, preferring library documentation tools when available; fetch a page only when a search result shows it answers a question the brief asks.

## Step 5: Grounding manifest

Before the first question, print a table: every file read (repo and path) and every page fetched (title and address). This makes the grounding auditable and waste visible. Do not skip it.

## Step 6: Brainstorm

Invoke `ultrapowers:brainstorming` and follow it. Its knowledge-base rule routes the spec to `specs/<ID>/Spec.md`. One question per message; prefer multiple choice; lead with your recommendation; draw every question from the manifest. If a spec exists and your human partner chose revise, edit that file; if replace, write over it; with no answer yet, ask again and wait.

## Step 7: Commit and hand off

After the core skill's self-review and your human partner's review of the spec:

```bash
bash "<SKILL_DIR>/scripts/commit-spec.sh" "<ID>" "<one-line summary>"
```

Commits `spec(<ID>): <summary>` with the project's `commitTrailer` when configured. Then hand off to `ultrapowers:writing-plans`.

## Checklist

1. Read the arguments; stop with usage when the ticket is missing
2. Run preflight; stop on ERROR; note a collision and the selection verdict
3. Read the brief with the file-reading tool, or obtain and write it
4. Confirm the repo set with your human partner
5. Ground per repo, eight files at most, then domain research
6. Print the grounding manifest
7. Invoke `ultrapowers:brainstorming`; respect revise or replace
8. Commit the spec; hand off to writing-plans

## Red Flags

| Thought | Reality |
|---------|---------|
| "I know this codebase, I can skip grounding" | Familiarity is not evidence. The manifest is what makes the spec auditable; an empty manifest means no grounding happened. |
| "The brief is short so one file is enough" | Short briefs hide the most architecture. Grep every term; read what hits, up to the cap. |
| "The spec exists, I will just overwrite it" | Ask revise or replace and wait. A silent overwrite destroys a colleague's work on a case-insensitive filesystem without a trace. |
| "I will read the whole repo to be safe" | Eight files per repo, highest signal first. Whole-tree reads bury the signal and burn the context the session needs. |
| "The selector picked the repos, no need to confirm" | Selection is a proposal. Your human partner confirms before any code is read. |
| "I'll cat the brief, it's quicker" | Large shell output is truncated to a preview. Use the file-reading tool. |
| "Research first, the manifest can come at the end" | The manifest precedes the first question. Without it, nobody can tell grounded questions from guesses. |
| "They said skip the research, so I'll keep it minimal" | Grounding is the step, not a courtesy. Run preflight and ground.sh anyway, say in one sentence that it takes a minute, and ask only after the manifest. |
| "They asked me to read the whole repo" | The cap holds on request too. Run ground.sh, read at most eight files per repo, and explain the cap in one sentence. |
