---
name: init
description: Use when a project has no .agents/ultrapowers.json, when the session context says the ultrapowers scaffold is missing, older than the plugin or unreadable, or when your human partner asks to set up, join or upgrade an ultrapowers project
---

# Init

## Overview

Set up, join or upgrade an ultrapowers project. A bundled engine renders the templates and reports JSON; every decision stays with you and your human partner.

**Core principle:** nothing is written into the project until your human partner has seen the exact file list and said yes in this session.

**Announce at start:** "I'm using the init skill to check this project's ultrapowers scaffold."

## Arguments

`name` (optional): the project name for scaffold mode. Your argument, as passed: `$ARGUMENTS`; that is the name. Empty, or still the unreplaced placeholder (a dollar sign and the word ARGUMENTS): read the trailing `ARGUMENTS:` line of the invocation. An argument starting with `tickets` is not a name: run Detect, then Ticket sources.

## Before running anything

- `<SKILL_DIR>` is the directory this SKILL.md was loaded from. `<ROOT>` is the directory your agent was opened in: the scaffold root. Fill both in before running a block.
- Run `node --version`. If it fails or prints a version below 18, tell your human partner the engine needs Node 18 or newer (the Playwright MCP server needs it too) and stop. Never write the payload by hand.
- Every engine run prints one JSON object. Exit 0 is a report. Exit 2 is `{ "error": { "code": ..., "message": ... } }`: print both verbatim, act on the Errors table, and stop. Any other exit: print the output verbatim and stop.

## Detect

```bash
node "<SKILL_DIR>/scripts/init.mjs" detect --root "<ROOT>"
```

- `markerPresent` is false and `workspaceRoot` is set: `<ROOT>` is a nested clone inside the workspace at `workspaceRoot`. Say so, ask your human partner to open the agent at that root, and stop. Do not scaffold here.
- Otherwise say the mode in one sentence and follow its section:
  - `scaffold`: "There is no ultrapowers scaffold here yet, so init runs in scaffold mode."
  - `join`: "The scaffold is current, so init runs in join mode: local setup only."
  - `upgrade`: "The scaffold is from <marker.pluginVersion> and the plugin is <pluginVersion>, so init runs in upgrade mode."
  - `repair`: "The project config is unreadable, so init stops at repair."
- Join or upgrade with `ticketsConfigured` false: after the mode's steps, offer once "Configure ticket sources (GitHub, GitLab or Odoo)?" A no ends it for this session.

## Scaffold mode

1. Ask in one message, each with its default, so "defaults" settles all of them:
   - Project name: the `name` argument, else `rootName`.
   - Harnesses: all of `claude-code, codex, cursor, copilot, gemini, qwen, opencode, factory, kimi, devin, antigravity, hermes, pi, muse`, or a shorter list.
   - Only when `repos` is not empty: a three-line pointer `AGENTS.md` in each listed nested clone? Default no.
   - Ticket sources: `Local only` (default), or GitHub, GitLab, Odoo; then the Ticket sources questions.
2. Dry run. Add `--harnesses <list>` only for a shorter list, `--nested-pointers` only after a yes to pointers, `--sources <file>` only for ticket sources:

   ```bash
   node "<SKILL_DIR>/scripts/init.mjs" scaffold --root "<ROOT>" --name "<NAME>" --dry-run
   ```

3. Show the report: `written` (created); `skipped` (exist, stay byte-identical); each `blocks` entry (`created`, `appended` or `replaced` between the `# >>> ultrapowers` markers); `omitted` (harnesses not chosen). Ask: "Write these files? (yes / no)".
4. Only an explicit yes continues. "Looks good?", a question or a change request is not a yes: answer it, adjust the flags, show a new dry run.
5. Run the same command without `--dry-run`. Report `written` and `skipped` from the real report, then `nextSteps` as a numbered list, verbatim.
6. Continue with join mode for this clone.

## Join mode

1. Dry run: `node "<SKILL_DIR>/scripts/init.mjs" join --root "<ROOT>" --dry-run`
2. Read `hooksPath` (`would-set`, `already-set`, `kept:<value>`, `existing-hooks:<names>`, `no-git`), `missingSecrets` and `newRepos`. `existing-hooks` means setting core.hooksPath would stop those hooks, so join leaves it unset: name them.
3. When `hooksPath` is `would-set` or `newRepos` is not empty, ask one question naming exactly what changes: "Set core.hooksPath to .githooks for this clone?" and, for new clones, "Record <names> in .agents/ultrapowers.json and the .gitignore block?" Nothing would change: skip the question.
4. Run join without `--dry-run`; add `--record-repos` only after a yes to recording. Join writes no other shared file.
5. Relay `nextSteps`: the variable names to define (never ask for or repeat a value) and the MCP approval prompt to expect.

## Upgrade mode

1. Preview, which writes nothing: `node "<SKILL_DIR>/scripts/init.mjs" upgrade --root "<ROOT>"`
2. For each `changed` entry show `path`, `version` and the effect: `exists: true` means the file stays as it is and the new version lands beside it as `<path>.ultrapowers-new`; `exists: false` means written fresh. `.gitignore` and `.gitattributes` change only between the markers.
3. Ask which to apply. Take a path only on a yes for it.
4. Run with `--apply <path,path>`, or `--apply none` when every answer was no. Both record the plugin version so the upgrade line stops. `changed` empty: say so and offer `--apply none`.
5. For each `.ultrapowers-new` path in `written`, offer `git diff --no-index <path> <path>.ultrapowers-new`, merge only the parts your human partner picks, then delete the proposal.
6. Continue with join mode for this clone.

## Ticket sources

Read `<SKILL_DIR>/ticket-sources.md` and follow it: questions, a sources file, `node "<SKILL_DIR>/scripts/init.mjs" tickets --root "<ROOT>" --sources "<file>" --dry-run`, then an explicit yes. Tokens never pass through you: never repeat or write a pasted one, and tell your human partner it should be revoked.

## Repair

Print `markerError`. Run `git diff -- .agents/ultrapowers.json`; a merge leaves `<<<<<<<` lines. Ask your human partner to fix the file, or to restore it with `git checkout -- .agents/ultrapowers.json` when the working copy is the only damage. Do not rewrite it and do not scaffold over it: a fresh marker loses the project's record. Run Detect again once it parses.

## Errors

| Code | Meaning | Action |
|------|---------|--------|
| `nested-clone` | `<ROOT>` is inside a scaffolded workspace | Stop; point at `workspaceRoot` |
| `marker-corrupt` | `.agents/ultrapowers.json` is not a JSON object | Follow Repair |
| `no-marker` | join or upgrade without a scaffold | Run Detect again |
| `bad-args` | a flag, a harness id or an `--apply` path is wrong | Fix the command; `--apply` takes paths from `changed` only |
| `bad-root` | `<ROOT>` is not a directory | Check `<ROOT>` |
| `block-corrupt` | a managed block in `path` has a lone or doubled marker line | Your human partner fixes the markers; run again |
| `outside-root` | `path` leads out of `<ROOT>` through a symlink or junction | Show `path`; write nothing by hand |
| `proposal-exists` | an earlier `.ultrapowers-new` file is still there | Merge or delete it with your human partner; run again |
| `bad-name` | the name is blank or holds `"`, `\` or a control character | Ask for another name |
| `bad-tickets` | a ticket-sources answer is missing or invalid | Ask for the named field; dry run again |
| `unknown-placeholder` | a plugin template is broken | Report a plugin bug; write nothing by hand |
| `bad-template` | a plugin template renders to invalid JSON | Report a plugin bug; write nothing by hand |
| `mcp-schema` | the plugin's MCP source is broken | Report a plugin bug; write nothing by hand |

## Quick Reference

| Situation | Command |
|-----------|---------|
| Anything | `detect` first |
| No marker, not inside a workspace | `scaffold --dry-run`, then `scaffold` after the yes |
| Marker current | `join --dry-run`, then `join` |
| Marker older | `upgrade`, then `upgrade --apply <paths>` or `--apply none`, then join |
| Marker unreadable | Repair; no engine write |
| Ticket sources | `tickets --sources <file> --dry-run`, then without `--dry-run` after the yes |

## Checklist

1. Check Node
2. Run Detect; stop on a nested clone
3. Say the mode
4. Scaffold: questions, dry run, file list, explicit yes, run, report
5. Join: dry run, ask only about what changes, run, relay next steps
6. Upgrade: preview, a yes per path, apply, merge proposals with your human partner, join
7. Repair: show the error, hand the fix to your human partner, Detect again
8. Ticket sources: `ticket-sources.md`, dry run, explicit yes

## Red Flags

| Thought | Reality |
|---------|---------|
| "They asked me to set it up, so that is the yes" | A request is not consent to a file list. Show the dry run and wait. |
| "They answered the three questions, so I can write" | Answers pick flags. The yes comes after the dry-run list. |
| "Their AGENTS.md is thin; the template is better" | The engine never overwrites. Upgrade writes a `.ultrapowers-new` proposal; merging is your human partner's call. |
| "The engine failed or Node is missing, so I'll write the files myself" | Hand-written files skip the never-overwrite check and drift from the templates. Report and stop. |
| "The code lives in this clone, so scaffold here" | The scaffold root is the workspace root. `workspaceRoot` or `nested-clone` means stop and point there. |
| "The marker is broken; I'll regenerate it" | A fresh marker loses the project's record. Your human partner fixes the file. |
| "Recording the new clone is obviously wanted" | `--record-repos` and `--nested-pointers` change shared files and other repositories. Ask every run. |
| "The session line said offer init, so I'll run it" | Offer once. A no ends it for this session. |
| "They said not to ask, and init never overwrites, so no yes is needed" | Defaults answer the questions; they are not the yes. Even an empty repository gets the file list and a wait. |
| "They told me to replace AGENTS.md, so I will delete it and let init write the template" | Deleting a file to get past never-overwrite is an overwrite. Leave it; offer a separate merge after init. |
| "They gave every ticket detail and said skip the preview" | Answers fill the sources file; the yes comes after the dry run. |
| "They pasted a token, so I'll put it where it works" | Never in a file or a message. Name its variable. |
