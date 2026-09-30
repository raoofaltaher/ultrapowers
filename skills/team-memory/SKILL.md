---
name: team-memory
description: Use when you learn a verified, durable, expensive-to-rediscover, non-derivable fact about this project; when you need to know whether the team already hit a problem or why a past decision was made; or when asked to prune or lint the team memory store
---

# Team Memory

## Overview

Git-native shared memory for every coding agent on the project. The store is `.agents/memory/` at the project root (`memory.path` in `.agents/ultrapowers.json`); from a nested clone it is `../.agents/memory/`. `MEMORY.md` is the index, hard budget `memory.indexBudget` lines (default 150). Entries are one fact per file under `gotchas/`, `decisions/`, `subsystems/`. Four modes: remember, recall, prune, lint. Say which mode you are in before acting.

## remember: save a learning

1. Gate. ALL four must hold, else do not save and tell your human partner which one failed:
   - **Verified**: tested or directly observed in this project, not inferred.
   - **Durable**: still true next month (no sprint status, no in-flight branch state).
   - **Expensive**: would cost a teammate `memory.rediscoveryMinutes` (default 15) or more to rediscover.
   - **Not derivable**: not already stated in code, docs, specs, or git history.

   Never store: secrets, tokens, credentials, URLs embedding auth, personal data, customer data. If the candidate text contains any of these, stop. Do not save a redacted version until the fact stands without the secret; describe where a credential lives, never its value.
2. Check the index for an existing entry on the topic. If one exists, update that file, refresh its `date`, and fold the change into its index line as `**UPDATED YYYY-MM-DD: ...**`. Do not add a near-duplicate.
3. Distill: strip session narrative, generalize to the reusable rule, one fact only. Ask: "what would I tell a teammate in three sentences?"
4. Write `<dir>/<name>.md` with this exact frontmatter; `name` equals the file name without `.md`:

   ```markdown
   ---
   name: <kebab-case-slug>
   description: <one line: what this entry tells you>
   metadata:
     type: <gotcha | decision | subsystem>
   date: <today, YYYY-MM-DD>
   ---
   <the fact, one to three sentences>

   **Why:** <root cause or rationale>

   **How to apply:** <what to do differently>
   ```

   Optional `[[name]]` links point at other entries.
5. Add one index line under the matching heading: `- [<name as title>](<dir>/<name>.md) — <one-line hook> (<YYYY-MM>)`.
6. Budget check: count the lines of `MEMORY.md`. If adding the line would exceed the budget, STOP. Do not write the line. Run **prune**, then retry.
7. Run **lint** on the store and fix every finding.
8. Commit on the current branch with the trailer `<memory.trailer>: <dir>/<name>.md` (default `Memory-Ref`). The entry is reviewed in the same change request as the work that produced it.

Promotion from personal memory: a personal auto-memory file that passes the gate is copied into the matching folder, gains `date` (and `metadata.type` when the personal layer left it out), gets its index line, and goes through steps 6 to 8.

## recall: find prior knowledge (the ladder, in order)

1. `MEMORY.md`: scan the one-liners.
2. Grep the store: names, descriptions, bodies.
3. Git history: `git log --grep="<topic>" --oneline` and `git log -S"<symbol>" --oneline` at the project root, then once per entry in `repos` of `.agents/ultrapowers.json` with `git -C <repos[].path>`. Search the trailer too: `git log --grep="Memory-Ref"`.
4. The forge or tracker, when tools for it are available in this session: change requests, issues, review threads. Descriptions and review threads hold the "why".
5. Personal memory layers, where installed.
6. If the answer was hard-won at rung 3 or deeper, write it back with **remember**. Archaeology feeds the corpus.

## prune: periodic hygiene

1. Run **lint** first and fix its findings.
2. List entries whose `date` is older than six months. Re-verify each against the current codebase; refresh `date` and the index line's `**UPDATED**` note, or delete the file together with its index line.
3. Merge near-duplicates into one entry; delete the other and its index line.
4. Report the index line count against the budget.
5. The output is a normal reviewable change on the current branch, committed with the trailer naming each touched entry.

## lint: check the store

Run `node <this skill's directory>/scripts/memory-lint.mjs <store>` (add `--budget N` to override the configured budget). Exit 0 means clean. Otherwise act on each line `<CODE> <path>: <message>`:

| Code | Fix |
|------|-----|
| `BUDGET` | Run prune. Do not add lines. |
| `DANGLING` | The index links to a missing file: restore the file or delete the line. |
| `ORPHAN` | An entry has no index line: add one under the right heading, or delete the entry if it fails the gate. |
| `STRAY` | A file or folder at the store root other than `README.md`, `MEMORY.md` and the three folders: rewrite it as a proper entry or delete it. Session summaries are strays. |
| `FM_MISSING`, `FM_KEYS`, `FM_NAME`, `FM_TYPE`, `FM_DATE` | Rewrite the frontmatter to the exact schema in remember step 4. |
| `WIKILINK` | `[[name]]` names no entry: fix the name or remove the link. |
| `NEAR_DUP` | Two names differ only by punctuation or a trailing s: merge them. |

## Red flags

| Thought | Reality |
|---------|---------|
| "Useful context for the next person, so it belongs in memory." | Sprint status and in-flight state fail Durable. Put it in the task folder. |
| "The index is only a little over; one more line is fine." | The budget is a hard stop. Prune first. |
| "The token is needed to reproduce the bug." | Nothing with a credential enters the store. Name where the credential lives, never its value. |
| "It's obvious from the code, but a note saves time." | Then it fails Not derivable. Do not save. |
| "I'll write the index line later." | An orphan entry is invisible. File and line land in the same commit. |
| "No time for the trailer." | The trailer is how recall reaches this commit. Add it. |
| "I'm fairly sure this is how it works." | Fairly sure is inferred. Verify it here first, or do not save. |
