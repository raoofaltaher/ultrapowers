# Ultrapowers piece 4: team memory

- Date: 2026-09-30
- Status: approved design, pending implementation plan
- Scope: sub-project 4 of 5. Covers requirement 1: a git-native shared memory for every developer, every harness and every session on a project. Depends on piece 2 (init writes the store; AGENTS.md carries the read path) and piece 1 (hook wrapper, namespace). Inherits G1 to G5 from the piece 2 spec.

## 1. Problem

Personal agent memories are machine-local and harness-specific. A team using several coding agents keeps rediscovering the same gotchas, decisions and subsystem facts. The reference project solved this with a git-committed markdown store, thin wiring and a skill; it worked, and after three months it drifted: index over budget, dangling and orphan links, three entry formats, a stray session summary. Ultrapowers ports the mechanism and adds the lint the reference declined.

## 2. Decisions

| Id | Decision | Rationale |
|----|----------|-----------|
| D1 | Store is `.agents/memory/` at the project root: `README.md`, `MEMORY.md` index, `gotchas/`, `decisions/`, `subsystems/`. One verified fact per file. No service, no database. | Reviewed git markdown is the pattern every small-team evidence converges on; it rides feature branches into review. |
| D2 | Entry frontmatter is Claude Code's auto-memory schema plus `date`: `name`, `description`, `metadata.type` in {gotcha, decision, subsystem}, `date`. Body: fact, `**Why:**`, `**How to apply:**`, optional `[[name]]` links. File name equals `name`. | Owner's choice. Promotion from personal memory is a copy; one lint validates both layers. |
| D3 | Hooks ship in the plugin and stay silent unless a store exists under the working directory. Nothing is written into project settings for them. | Owner's choice. One place to maintain. |
| D4 | The `team-memory` skill is a ported tool: it keeps the reference structure and gains a `lint` mode. | G1 exempts ported tools; lint addresses observed drift. |
| D5 | Index hard budget 150 lines; the skill refuses to add a line past it and runs prune first. Rediscovery threshold 15 minutes. Both configurable. | Reference contract, proven in use. |
| D6 | Commits that land or motivate an entry carry the trailer `Memory-Ref: <dir>/<file>.md`. | Searchable through `git log --grep`. |
| D7 | Secrets never enter the store; the piece 2 gitleaks pre-commit scans it; the skill's never-store list is repeated in the index preamble, the README and the skill. | Reference contract. |

## 3. Design

### 3.1 Store templates (added to the piece 2 payload)

- `templates/.agents/memory/README.md.tmpl`: quick start, layout, entry format (D2), the four write criteria verbatim, how entries get in, the recall ladder, the trailer, prune policy, the secret gate. Forge-neutral wording; no names.
- `templates/.agents/memory/MEMORY.md.tmpl`: title, the preamble (harness-neutral sentence, layout, budget, the four criteria, never-store list, pointer to README and skill), then the three headings `## Gotchas`, `## Decisions`, `## Subsystems`, empty.
- `.gitkeep` in each of the three folders.
- Project config `memory` section:

  ```json
  { "memory": { "path": ".agents/memory", "indexBudget": 150, "rediscoveryMinutes": 15, "trailer": "Memory-Ref" } }
  ```

Index line format: `- [<name as title>](<dir>/<file>.md) — <one-line hook> (<YYYY-MM>)`. Updates fold into the same line as `**UPDATED YYYY-MM-DD: …**`.

### 3.2 Read path

- AGENTS.md (piece 2 template) section "Team memory": store location, "read `MEMORY.md` at session start and a topic file only when its line is relevant", the criteria, the promotion rule from personal memory, the trailer.
- CLAUDE.md and GEMINI.md: `@.agents/memory/MEMORY.md` import line after the AGENTS.md import.
- Nested-clone pointer AGENTS.md (piece 2, opt-in): "Team memory lives at `../.agents/memory/`; consult MEMORY.md before assuming. Grep from inside this repo cannot see it."

### 3.3 The skill

`skills/team-memory/SKILL.md`, ported. Description begins "Use when" per the fork's frontmatter shape, body keeps the reference's four-part structure:

- **remember**: gate on all four criteria and the never-store list; check the index for an existing entry and update it instead, refreshing `date`; distill to one fact in three sentences; write the file with D2 frontmatter; add one index line under the right heading; budget check, refuse and prune if over; commit on the current branch with the trailer.
- **recall**: index lines; grep the store; `git log --grep` and `git log -S` in the root and in each repo from the project config; forge or tracker tools when available; personal memory layers; write back anything recovered at rung three or later.
- **prune**: entries older than six months are re-verified, refreshed or deleted with their index line; merge near-duplicates; report the line count against the budget; output is a normal reviewable change.
- **lint**: run `node <skill dir>/scripts/memory-lint.mjs <store>` and act on findings: fix dangling links, index orphans or delete strays, correct frontmatter, report budget.

### 3.4 Hooks

Two extensionless bash scripts in `hooks/`, LF-pinned in `.gitattributes`:

- `hooks/team-memory-nudge`: reads hook input JSON from stdin, takes `cwd`, walks up for `.agents/memory/MEMORY.md`; when found prints the harness-appropriate JSON with the line "Team-memory: if this session verified a durable, expensive-to-rediscover, non-derivable fact, save it to `<store>` with the team-memory skill." Otherwise prints nothing and exits 0.
- `hooks/team-memory-postcompact`: same discovery; line "Context was just compacted. If team-worthy learnings surfaced earlier and are not yet saved to `<store>`, save them now with the team-memory skill."
- Output shape follows `hooks/session-start`'s platform selection so Claude Code, Cursor, Copilot and Muse each get their field.
- Registration: `hooks/hooks.json` adds `UserPromptSubmit` and `SessionStart` with matcher `compact`; `hooks/hooks-cursor.json` adds the equivalent events; the Muse manifest adds both hooks.
- In-process injectors: OpenCode adds the check on the session compacted event and on first user message; Pi on `session_compact`; Hermes cannot re-inject after the first turn and documents that limit. All three are best-effort and silent without a store.

### 3.5 Lint script

`skills/team-memory/scripts/memory-lint.mjs`, Node standard library. Checks: index line count against budget; every index link resolves to a file; every entry file appears in the index; frontmatter has exactly the D2 keys with valid `metadata.type` and ISO `date`; no top-level files other than `README.md` and `MEMORY.md`; names differing only by punctuation or a trailing `s`. Output: one line per finding with a code; exit 1 on any finding, 0 otherwise. The piece 2 pre-commit gains an optional call when the store exists.

## 4. Acceptance criteria

1. On a scaffolded temp repo, init creates the store with the README, the empty index with three headings, and the three folders.
2. Both hook scripts print nothing when no store exists at or above `cwd`, print the correct JSON field for each harness when it does, and find the store from a nested clone. Bash tests cover the nine cases.
3. `memory-lint.mjs` reports each finding type against fixtures and exits 0 on a clean store. Node tests cover every check.
4. Pressure tests per writing-skills: the agent refuses to save sprint status, a derivable fact, and a line containing a token; refuses to add a 151st index line and runs prune; recall reaches the git-history rung on a planted fact.
5. A promoted personal memory file passes the lint unchanged after adding `date`.
6. `grep -r "Memory-Ref" .git` after a remember shows the trailer on the commit.

## 5. Risks

- Prompt-submit hooks fire every turn; a noisy line degrades sessions. Mitigation: one short line, and silence without a store.
- Hermes and Devin users get no post-compaction rescue. Mitigation: documented; AGENTS.md carries the criteria so the model still saves during work.
- The auto-memory schema may change upstream. Mitigation: the lint owns the schema in one place.

## 6. Out of scope

Semantic search, session digests, memory MCP servers, cloud sync.
