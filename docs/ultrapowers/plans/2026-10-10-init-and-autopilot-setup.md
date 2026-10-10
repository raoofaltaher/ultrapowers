# Init and Autopilot Setup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use ultrapowers:subagent-driven-development (recommended) or ultrapowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close #28 (all fourteen items), #7.5 and #32, and rename the knowledge-base folder `brand-book/` to `brandbook/` (D7), in `skills/init/`, its templates and the autopilot engine.

**Architecture:** One helper, `missingContent`, compares an existing settings file with what init would render; scaffold, join, upgrade and a new read-only `check` mode share it. `runTickets` merges new servers into existing MCP files instead of proposing the whole template. The marker gains optional per-source fields (`server`, `autopilot`) and init proposes `projects` from the clones' remotes. The autopilot engine requires approvers for an Odoo source it runs.

**Tech Stack:** node 18+ built-ins; `tests/init/test-modes.mjs`, `test-engine.mjs`, `test-mcp-transforms.mjs`, `test-skill-structure.sh`; `tests/task-lifecycle/ticket-sources.test.mjs`; `tests/autopilot/autopilot-lib.test.mjs`, `autopilot.test.mjs`.

**Spec:** `docs/ultrapowers/specs/2026-10-10-open-issues-fixes-design.md`, sections 3 (D6, D7) and 6.

## Global Constraints

- Zero dependencies (rule 1): the Codex TOML merge is text appending, no TOML parser.
- Never overwrite: every change to an existing file is a `.ultrapowers-new` proposal or a report entry, never an in-place write.
- Every mode writes nothing before every target passed `guardTarget` and the proposal check.
- `templates/CHANGES.json` records `.gemini/settings.json`, `AGENTS.md`, `.agents/ultrapowers.json`, `brandbook/README.md` at `1.4.0`.
- Skill prose (`skills/init/SKILL.md`, `ticket-sources.md`, `autopilot.md`, `templates/AGENTS.md.tmpl`, `CLAUDE.md.tmpl`) changes go through writing-skills with before/after pressure evidence in `tests/init/pressure-results.md` (rule 3).
- `ODOO_API_KEY` stays the one Odoo key (D6).
- Each task's commit says `Closes #n` or `Part of #28 (A1)`.

## Review Focus

1. An existing `.claude/settings.json` that is JSON with comments (JSONC) or a trailing comma: `missingContent` reports `unreadable`, never a false "complete" (test in Task 1).
2. An existing `.vscode/mcp.json` whose first line is a `//` provenance comment: the merge keeps the line and parses the rest (test in Task 3).
3. A clone whose `origin` is an SSH URL (`git@gitlab.com:acme/backend/app-api.git`) or has no remote: the `projects` proposal handles both (test in Task 5).
4. `autopilot.approvers` present but holding the technical user's login only: refused for an Odoo source (test in Task 10).
5. `check` on a project with no marker: reports `scaffold` as the next step and writes nothing (test in Task 8).

---

### Task 1: `missingContent` (#28.A2, groundwork for A1, C1)

**Files:**
- Modify: `skills/init/scripts/init.mjs` (new export beside `applyBlock`, line 389)
- Test: `tests/init/test-engine.mjs`

**Interfaces:**
- Produces: `missingContent(target: string, existingText: string, renderedText: string): { missing: string[], unreadable?: string }`. For `.claude/settings.json`: `outputStyle` when absent or different from the rendered value; each rendered `permissions.allow` entry matching `/^Skill\(ultrapowers:/` that the existing file lacks. For `.gemini/settings.json`: `hooks.BeforeTool` when no entry's command names `ultrapowers-guardrail.mjs`. Any other target: `{ missing: [] }`. A parse failure: `{ missing: [], unreadable: <message> }`.

- [ ] **Step 1: Write the failing tests** — literal existing/rendered pairs: an empty `{}` reports `outputStyle` and every skill entry; a file with all but `Skill(ultrapowers:task)` reports that one; a `.gemini/settings.json` without the hook reports `hooks.BeforeTool`; JSONC with a comment reports `unreadable`.
- [ ] **Step 2: Run and see them fail** — `node --test tests/init/test-engine.mjs`.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run and see them pass.**
- [ ] **Step 5: Commit** — `feat(init): missingContent compares the keys the plugin needs (Part of #28 A2)`.

### Task 2: Scaffold, join and upgrade report incomplete files (#28.A1, #28.A2, #7.5)

**Files:**
- Modify: `skills/init/scripts/init.mjs` `applyPlan` (:706, skipped files go through `missingContent`), `runJoin` (:1028), `runUpgrade` (:1072), `scaffoldNextSteps`/`localNextSteps`/`upgradeNextSteps`; `templates/CHANGES.json:20` (`.gemini/settings.json`: `1.4.0`)
- Test: `tests/init/test-modes.mjs`

**Interfaces:**
- Produces: a report field `incomplete: [{ path, missing: string[] }]` in scaffold, join and upgrade, and a next step `"<path> lacks: <keys>; merge them by hand (init never overwrites)"`.

- [ ] **Step 1: Write the failing tests** — scaffold over an existing `.claude/settings.json` of `{}` reports `incomplete` with `outputStyle`; upgrade from a marker at `1.1.0` lists `.gemini/settings.json` in `changed`; join on a project whose `.gemini/settings.json` lacks the hook reports it.
- [ ] **Step 2: Run and see them fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run and see them pass.**
- [ ] **Step 5: Commit** — `fix(init): report settings files that lack required keys; Gemini hook in CHANGES (Closes #7 item 5; Part of #28 A1, A2)`.

### Task 3: Additive MCP proposals in `runTickets` (#28.A3)

**Files:**
- Modify: `skills/init/scripts/init.mjs:1145-1170` (replace the `full` rendering of an existing target with a merge), new helper `mergeMcpFile(target, existingText, aloneText): { content, added: string[] } | { unreadable }`
- Test: `tests/init/test-modes.mjs`, `tests/init/test-mcp-transforms.mjs`

**Interfaces:**
- Produces: for JSON targets, parse the existing file (dropping one leading `//` line for `.vscode/mcp.json`, kept in the output) and add the missing `tickets-*` entries under the container key (`mcpServers`; `mcp` for `opencode.json`; `servers` plus `inputs` merged by `id` for `.vscode/mcp.json`); for `.codex/config.toml`, append each missing `[mcp_servers.tickets-*]` table text from the `alone` rendering. The report's `mcp` entries gain `added: [ids]`; nothing is written for a file that already has every id.

- [ ] **Step 1: Write the failing tests** — an `.mcp.json` with `context7` pinned to another version and two team servers: the proposal keeps all three unchanged and adds only `tickets-gl` and `tickets-gh`; a second run reports `added: []` and writes no proposal; the vscode file keeps its first comment line; the codex file gains two tables and keeps its header.
- [ ] **Step 2: Run and see them fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run and see them pass.**
- [ ] **Step 5: Commit** — `fix(init): ticket proposals add only the new servers (Part of #28 A3)`.

### Task 4: Duplicate server warning and the `server` field (#28.A4)

**Files:**
- Modify: `skills/new-task/scripts/ticket-sources.mjs` (`validateTickets`: optional `server` string; `resolveTicket` returns `server: source.server ?? serverId(prefix)`), `skills/init/scripts/init.mjs` (`ticketServers` renders no server for a source with `server`; the dry run's `warnings` lists an existing server with the same URL), `skills/init/ticket-sources.md` (one line on `server`)
- Test: `tests/task-lifecycle/ticket-sources.test.mjs`, `tests/init/test-modes.mjs`

- [ ] **Step 1: Write the failing tests** — `server: "gitlab-company"` is valid and `resolve` reports it; `ticketServers` omits `tickets-gl` for it; the dry run on an `.mcp.json` holding a server with `url: https://gitlab.com/api/v4/mcp` warns `tickets-gl has the same URL as gitlab-company; set "server": "gitlab-company" to reuse it`.
- [ ] **Step 2: Run and see them fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run and see them pass.**
- [ ] **Step 5: Commit** — `feat(init): warn on a duplicate ticket server; a source may name its server (Part of #28 A4)`.

### Task 5: `projects` proposed from the clones' remotes (#28.A5)

**Files:**
- Modify: `skills/init/scripts/init.mjs` (new `proposeProjects(root, repos, source): Record<string,string>`, used by the `tickets` dry run and reported as `proposedProjects` per source), reusing the remote parser of `skills/autopilot/scripts/repos.mjs` (`forgeFor`; import it, or lift its URL parsing into `hooks/lib/`-free shared code under `skills/new-task/scripts/`)
- Test: `tests/init/test-modes.mjs`

- [ ] **Step 1: Write the failing tests** — a nested fixture with clone `app-api` whose origin is `https://gitlab.com/acme/backend/app-api.git` and source namespace `acme/platform` proposes `{ "app-api": "acme/backend/app-api" }`; an SSH origin proposes the same; a clone with no remote proposes nothing and is listed under `warnings`.
- [ ] **Step 2: Run and see them fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run and see them pass.**
- [ ] **Step 5: Commit** — `feat(init): propose the projects map from the clones' remotes (Part of #28 A5)`.

### Task 6: Per-source autopilot opt-out and the Odoo login rule (#28.B1, #28.B2)

**Files:**
- Modify: `skills/new-task/scripts/ticket-sources.mjs` (`validateTickets`: optional boolean `autopilot`), `skills/init/scripts/init.mjs:1219-1221` (require `login` only when `source.autopilot !== false`), `skills/autopilot/scripts/autopilot.mjs:1098` (the watcher skips `autopilot: false` sources with an `unwatched` event), `skills/init/ticket-sources.md:14`, `skills/init/autopilot.md`, `README.md` (the `transport` paragraph gains: "transport applies to reading tickets; autopilot always uses gh, glab, or Odoo's JSON-RPC with a login and ODOO_API_KEY")
- Test: `tests/task-lifecycle/ticket-sources.test.mjs`, `tests/init/test-modes.mjs`, `tests/autopilot/autopilot.test.mjs`; pressure scenario for the two skill files

- [ ] **Step 1: Write the failing tests** — an Odoo source with `autopilot: false` and no `login` passes `init autopilot`; the watcher emits `unwatched` with reason `autopilot: false` for it; an Odoo source without the field and without `login` is still refused.
- [ ] **Step 2: Run and see them fail.**
- [ ] **Step 3: Implement**, then the pressure run for the prose.
- [ ] **Step 4: Run and see them pass.**
- [ ] **Step 5: Commit** — `fix(init): an Odoo source may opt out of autopilot; docs say what transport covers (Part of #28 B1, B2)`.

### Task 7: Transport shown; preview flag; secrets split (#28.B3, #28.B4, #28.C3)

**Files:**
- Modify: `skills/new-task/scripts/fetch-ticket.mjs` (`resolve` adds `transportOnThisMachine` by probing `cliReady` once; Odoo reports `json-rpc` when `login` is set, else `mcp`), `skills/init/scripts/init.mjs` (`runTickets` dry run reports it per source; `runUpgrade` reports `preview: true` when `--apply` is absent and refuses `--record-repos` there as `bad-args`; `missingSecrets(root, env, marker)` returns `{ required, optional }` and the next steps print two lines)
- Test: `tests/task-lifecycle/fetch-ticket.test.mjs`, `tests/init/test-modes.mjs`

- [ ] **Step 1: Write the failing tests** — `resolve` with the stub `glab` signed in reports `transportOnThisMachine: "cli"`; the tickets dry run shows it; `upgrade` without `--apply` has `preview: true`; `upgrade --record-repos` without `--apply` is `bad-args`; join on a marker with a `visitor` role (`required: false`) lists `QA_PW_VISITOR` under `optional`.
- [ ] **Step 2: Run and see them fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run and see them pass.**
- [ ] **Step 5: Commit** — `fix(init): show the transport in use; preview flag; optional secrets (Part of #28 B3, B4, C3)`.

### Task 8: `init check` (#28.C1)

**Files:**
- Modify: `skills/init/scripts/init.mjs` (`MODES` gains `check`; `runCheck(opts)` read-only: `missingContent` per harness settings file, hooks registered per harness (`hooks` key of each settings file), each ticket source's server present in each MCP file, open `*.ultrapowers-new` files, `missingSecrets` split, near-named folders through a new `nearFolders(root): [{ kb, existing }]` (case-insensitive compare after removing `-` and `_`; also `docs/<kb>`), `ticketsConfigured`, `autopilot.mode`), `skills/init/SKILL.md` (an argument starting with `check` runs it; a "Check" section; Quick Reference row)
- Test: `tests/init/test-modes.mjs`, `tests/init/test-skill-structure.sh` (mode `check` accepted), pressure scenario "double check my setup"

- [ ] **Step 1: Write the failing tests** — `check` on a fixture with an unregistered Gemini hook, a stale `.mcp.json.ultrapowers-new`, a missing `tickets-gl` in `.cursor/mcp.json` and a `brand-book/` folder reports each under `findings: [{ kind, path, detail }]` and writes nothing (snapshot unchanged); `check` with no marker reports `next: "scaffold"`.
- [ ] **Step 2: Run and see them fail** — `mode must be one of ...`.
- [ ] **Step 3: Implement**, then the pressure run.
- [ ] **Step 4: Run and see them pass.**
- [ ] **Step 5: Commit** — `feat(init): check mode audits a scaffold and writes nothing (Part of #28 C1)`.

### Task 9: `brandbook/` and near-named folders (#28.C2, D7)

**Files:**
- Rename: `templates/brand-book/` → `templates/brandbook/`; `templates/CHANGES.json` (`brandbook/README.md`: `1.4.0`, the old key removed); `skills/init/scripts/init.mjs:32` (`KB_FOLDERS`), `templates/README.md.tmpl:17`, `templates/.agents/ultrapowers.json.tmpl` (`kb`)
- Modify: every reader of the folder name: `grep -rn "brand-book" skills agents templates hooks` lists them (at 1.3.1: `skills/init/scripts/init.mjs`, `templates/README.md.tmpl`, `templates/CHANGES.json`, the brand-book README; the QA lane 1 and qa-specialist prose that name `brand-book/` for logo paths), each accepting both names; `runUpgrade` prints `git mv brand-book brandbook` when the old folder exists; scaffold's dry run reports Task 8's `nearFolders`
- Test: `tests/init/test-modes.mjs`, `tests/init/test-templates-clean.sh`, `tests/qa-gatekeeper/test-skill-structure.sh`

- [ ] **Step 1: Write the failing tests** — a new scaffold writes `brandbook/README.md` and no `brand-book/`; upgrade on a project with `brand-book/` lists the `git mv` step and moves nothing; scaffold's dry run on a root with `brandbook/` already present and `docs/specs/` reports `nearFolders`; a QA run with `brand.logoPaths` under `brand-book/` still resolves.
- [ ] **Step 2: Run and see them fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run and see them pass.**
- [ ] **Step 5: Commit** — `feat(init): the knowledge-base folder is brandbook/; near-named folders are reported (Part of #28 C2)`.

### Task 10: Approvers required for an Odoo autopilot source (#32)

**Files:**
- Modify: `skills/init/scripts/init.mjs` (`loadAutopilot`/the autopilot setup: refuse when any source autopilot runs has `provider === 'odoo'` and `approvers` is empty, code `bad-tickets`, message naming `autopilot.approvers`), `skills/autopilot/scripts/autopilot-lib.mjs:53-56` (`readSettings` applies the same rule), `skills/init/autopilot.md` (one line)
- Test: `tests/init/test-modes.mjs`, `tests/autopilot/autopilot-lib.test.mjs`

- [ ] **Step 1: Write the failing tests** — `init autopilot` with an Odoo source and no `approvers` fails `bad-tickets` naming `autopilot.approvers`; with `approvers: ["bot@example.com"]` equal to the source's `login` it fails too (`the technical user cannot be its own approver`); with a human login it passes; `verifyApproval` with `approvers: ['ana']` and actor `bot@example.com` returns `not-approver`.
- [ ] **Step 2: Run and see them fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run and see them pass.**
- [ ] **Step 5: Commit** — `fix(autopilot): an Odoo source needs human approvers (Closes #32)`.

### Task 11: Generated-file comments and the allow-list disclosure (#28.B5, #28.C4)

**Files:**
- Modify: `templates/AGENTS.md.tmpl:38` (the rule exempts "lines init writes: provenance headers and the `# >>> ultrapowers` / `# <<< ultrapowers` markers"), `templates/CLAUDE.md.tmpl` and `README.md` (one sentence: `.claude/settings.json` pre-approves the test and build commands that run repository code), `skills/init/SKILL.md` (the scaffold dry run names it), `templates/CHANGES.json` (`AGENTS.md`, `CLAUDE.md`: `1.4.0`)
- Test: `tests/init/test-templates-clean.sh`; pressure scenarios: an agent following the generated rule leaves the markers; the scaffold dry run mentions the allow list

- [ ] **Step 1: Write the failing checks** — template text assertions; the pressure baseline shows the markers stripped.
- [ ] **Step 2: Run and see them fail.**
- [ ] **Step 3: Edit; run the pressure scenarios.**
- [ ] **Step 4: Run and see them pass.**
- [ ] **Step 5: Commit** — `docs(init): generated lines are exempt from the comment rule; the allow list is disclosed (Part of #28 B5, C4)`.

### Task 12: Gate and issue closure

- [ ] Run `bash tests/init/run-tests.sh`, `node --test tests/task-lifecycle/*.test.mjs`, `bash tests/autopilot/run-tests.sh`, `bash tests/qa-gatekeeper/run-tests.sh`, `bash tests/skills/test-skill-bodies.sh`; expected: all pass.
- [ ] The last commit of the plan says `Closes #28`, and a comment on #28 lists the commit per item.
