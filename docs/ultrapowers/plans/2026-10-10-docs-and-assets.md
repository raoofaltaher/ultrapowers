# Docs and Assets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use ultrapowers:subagent-driven-development (recommended) or ultrapowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close #7.2, #15, #17 and #18: the guardrail-coverage wording, the fixed memory path, the stale team-memory notes, and the 1 MB logo.

**Architecture:** Prose edits to two skill files and the agent contract (pressure-tested), one template key removed with a CHANGES bump, two documentation lines, and a new small SVG mark served from memory by the brainstorm companion.

**Tech Stack:** Markdown; node 18+ built-ins for the companion (`skills/brainstorming/scripts/server.cjs`); `tests/brainstorm-server/branding.test.js` (npm test); `tests/init/run-tests.sh`; `tests/team-memory/`; `tests/skills/test-skill-bodies.sh`.

**Spec:** `docs/ultrapowers/specs/2026-10-10-open-issues-fixes-design.md`, section 7.

## Global Constraints

- Skill prose changes (#7.2 in `skills/qa-specialist/SKILL.md` and `agents/qa-specialist.md`; #15 in `skills/team-memory/SKILL.md`) go through writing-skills with before/after evidence (rule 3).
- No network at runtime: the companion keeps serving its own logo (rule 5).
- `templates/.agents/ultrapowers.json.tmpl` changes bump its `CHANGES.json` entry to `1.4.0`.
- The upstream project's name never appears.
- Each task's commit says `Closes #n`.

## Review Focus

1. A project whose marker still holds `memory.path` after the template drops it: every reader ignores the key without an error (test in Task 2).
2. The companion with the mark file missing from a packaged tree: the brand area degrades to text, as it does today for the full logo (test in Task 4).
3. The mark rendered at 1em height in a dark theme: the existing `filter`/theme rules in `frame-template.html` still apply (visual check in Task 4, recorded).
4. The README logo on GitHub's dark theme after the file split: unchanged (visual check in Task 4).
5. A harness listed as "conditional" in the README table that a user has fully set up (Gemini with the hook registered): the probe line in the report says `active`, so the table and the report never disagree (covered by plan 1 Task 12; cross-checked in Task 1 here).

---

### Task 1: Guardrail coverage wording (#7.2)

**Files:**
- Modify: `skills/qa-specialist/SKILL.md:98` ("From here the guardrail checks every tool call in this session" → "From here the guardrail checks every tool call on a harness that runs it; Step 4's probe records whether it is active, and the report says so"), `agents/qa-specialist.md:50-53` (the same qualification), `README.md` harness table (a "Guardrail" column or sentence: always on Claude Code, Cursor, Copilot CLI, Droid, Qwen, Muse, Kimi, OpenCode, Pi, Hermes, Antigravity; after `/hooks` trust on Codex; when `.gemini/settings.json` registers it on Gemini; not on Devin), `skills/autopilot/scripts/autopilot.mjs` (the Devin refusal message no longer suggests a Devin session)
- Test: `tests/skills/test-skill-bodies.sh`; pressure scenario in `tests/qa-gatekeeper/pressure/`: an agent on an unguarded harness must not claim the guardrail checked its calls

- [ ] **Step 1: Baseline the pressure scenario (RED)** — with the current text, the agent's report claims full guardrail coverage on a harness with no hook.
- [ ] **Step 2: Edit the three texts and the message.**
- [ ] **Step 3: Rerun the scenario (GREEN)**; record both runs in `pressure-results.md`.
- [ ] **Step 4: Run `bash tests/skills/test-skill-bodies.sh`** — PASS.
- [ ] **Step 5: Commit** — `docs(qa): say where the guardrail applies (Closes #7 item 2)`.

### Task 2: `memory.path` is fixed (#15)

**Files:**
- Modify: `templates/.agents/ultrapowers.json.tmpl:11-16` (drop `path`), `templates/CHANGES.json` (`.agents/ultrapowers.json`: `1.4.0`), `templates/AGENTS.md.tmpl:16` and `skills/team-memory/SKILL.md:10` ("the store is `.agents/memory/` at the project root" with no config reference), `README.md` Project configuration table (the `memory` row loses "folder")
- Test: `tests/team-memory/test-templates.sh`, `node --test tests/team-memory/memory-lint.test.mjs` (a marker with a stray `memory.path` is ignored), `tests/init/run-tests.sh`

- [ ] **Step 1: Write the failing tests** — the template has no `memory.path`; the lint reads `indexBudget` from a marker that still carries `path` without error.
- [ ] **Step 2: Run and see them fail.**
- [ ] **Step 3: Edit**; one pressure check of the team-memory skill line (an agent asked to "move the memory store" says the path is fixed).
- [ ] **Step 4: Run and see them pass.**
- [ ] **Step 5: Commit** — `docs(team-memory): the store path is fixed (Closes #15)`.

### Task 3: Stale notes (#17)

**Files:**
- Modify: `skills/team-memory/CREATION-LOG.md:21` (Cursor nudge runs on `sessionStart`), `README.md` harness notes (one sentence: after a compaction, the team-memory reminder returns on Claude Code, Copilot CLI, Muse and Hermes; Cursor and Devin get it only at session start)
- Test: `tests/team-memory/test-skill-structure.sh` (the log no longer names `beforeSubmitPrompt`)

- [ ] **Step 1: Write the failing check.** — [ ] **Step 2: Run and see it fail.** — [ ] **Step 3: Edit.** — [ ] **Step 4: Run and see it pass.**
- [ ] **Step 5: Commit** — `docs(team-memory): correct the Cursor note; post-compaction coverage (Closes #17)`.

### Task 4: A small mark for the companion (#18)

**Files:**
- Create: `assets/ultrapowers-mark.svg` (under 20 KB; simplified from `ultrapowers-small.svg`: keep the silhouette and the two main fills, drop the texture layers; produced with a vector editor or a path-simplification pass, then SVGO; the Owner approves it visually before the commit)
- Modify: `skills/brainstorming/scripts/server.cjs:109` (`BRAND_LOGO_FILE` → the mark; read once at start into a buffer, served with `Cache-Control: public, max-age=86400`), `.codex-plugin/plugin.json:42` (`composerIcon` → the mark), `assets/app-icon.png` (re-encoded at 512×512, PNG, under 150 KB)
- Test: `tests/brainstorm-server/branding.test.js` (`LOGO_PATH` → the mark; a size assertion `< 20480` bytes; a second request is served without a new file read, checked through a spy on `fs.readFileSync` or by deleting the file after start)

- [ ] **Step 1: Write the failing tests** — size and caching assertions.
- [ ] **Step 2: Run and see them fail** — `(cd tests/brainstorm-server && npm test)`.
- [ ] **Step 3: Produce the mark; show it to the Owner; implement the server change.**
- [ ] **Step 4: Run and see them pass**; open the companion once and the README once (light and dark) and record the check in the commit message.
- [ ] **Step 5: Commit** — `fix(assets): a small mark for the companion and the Codex icon; README keeps the logo (Closes #18)`.

### Task 5: Gate

- [ ] Run `bash tests/skills/test-skill-bodies.sh`, `bash tests/team-memory/test-templates.sh`, `bash tests/team-memory/test-skill-structure.sh`, `node --test tests/team-memory/memory-lint.test.mjs`, `bash tests/init/run-tests.sh`, `(cd tests/brainstorm-server && npm test)`; expected: all pass.
