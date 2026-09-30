# Ultrapowers piece 2: scaffold engine and baseline payload

- Date: 2026-09-30
- Status: approved design, pending implementation plan
- Scope: sub-project 2 of 5. Covers requirements 2 (knowledge base folders), 6 (agent instruction file for every harness), 7 (settings, MCP, repo hygiene), 8 (output style) and 9 (one-command project setup). Depends on piece 1 (the `ultrapowers:` namespace). Pieces 3, 4 and 5 add their own templates to the payload defined here.

## 1. Problem

The owner starts a new project every two to three days and recreates the same setup by hand: knowledge base folders, agent instruction files for several harnesses, MCP configuration per harness, settings, secrets scaffolding, git hygiene, and an output style. Teammates then need the same files plus local onboarding. No harness offers an install-time hook, and four of the supported harnesses cannot run code at session start, so "appears on install" must become a one-confirmation flow that works everywhere.

## 2. Global constraints (inherited by pieces 3, 4 and 5)

- G1. Every new ultrapowers skill follows the conventions of the fifteen original skills: two-key frontmatter (`name`, `description` beginning "Use when"), the process in `ultrapowers:writing-skills` including pressure testing, checklists that become todos, red-flags tables where rationalization is likely, "your human partner" voice, and no harness tool names in skill bodies. Tools ported from the reference project keep their own structure.
- G2. Zero runtime dependencies. Scripts are bash or Node with the standard library only.
- G3. Nothing is written into a project without the owner's explicit yes in that session.
- G4. Nothing from the reference project's data enters templates: no hostnames, names, ids, credentials. Placeholders only.
- G5. Windows with Git Bash is the primary environment; Linux and macOS must work. Committed shell files are LF.

## 3. Decisions

| Id | Decision | Rationale |
|----|----------|-----------|
| D1 | Trigger is nudge plus one confirmation. A session-start check detects a missing or stale marker and injects one line; the agent offers `/ultrapowers:init`; init writes only after a yes. | Owner's choice. Silent writes would spray files into any opened repo; init needs at least a project name. |
| D2 | Every harness the plugin supports is first-class: init writes the files each one reads. | Owner's choice. |
| D3 | No vendoring. Skills stay in the plugin; every teammate installs the marketplace and plugin. | Owner's choice. Removes drift between plugin and project copies. |
| D4 | The scaffold root is the directory the agent is opened in. Knowledge base and agent config live there. Code is at the root or in nested, gitignored clones one level down. | Owner's layout, shown in two projects. |
| D5 | `AGENTS.md` at the root is the single instruction source. `CLAUDE.md` and `GEMINI.md` import it; Gemini and Qwen settings list it as a context file; Copilot gets a pointer file. | Codex, Cursor, Copilot, OpenCode, Factory and Hermes read AGENTS.md natively. Claude Code reads it only when no CLAUDE.md exists, and Claude Code needs its own lines. |
| D6 | The project config and marker is `.agents/ultrapowers.json`, committed. | Node parses JSON with no dependency; hooks only test existence. |
| D7 | MCP servers are declared once in `.mcp.json` and generated into every other harness's file and schema. | Nine harnesses read nine files in three schemas. One source prevents drift. |
| D8 | The output style ships in the plugin and is also written into the project's `.claude/output-styles/`; its rules also appear as a "Response style" section in AGENTS.md. | Only Claude Code has output styles. The section gives every other harness the same behavior. The project copy keeps the setting valid without the plugin. |
| D9 | Ten knowledge base folders: `tasks`, `specs`, `plans`, `reviews`, `evals`, `handbooks`, `brand-book`, `business`, `playbooks`, `release-notes`. | Owner's selection. |
| D10 | Init is idempotent and never overwrites. Existing files are reported as skipped. `.gitignore` and `.gitattributes` get a marked block that is replaced in place. | Teammates join projects a colleague already scaffolded. |
| D11 | Writing into nested clones is opt-in per run. | Those are other repositories. |

## 4. Design

### 4.1 The init skill

`skills/init/SKILL.md`, invoked as `/ultrapowers:init` with an optional project name argument. Written per G1. It selects a mode and states it out loud:

- **Scaffold** when `.agents/ultrapowers.json` is absent. Asks up to three questions: project name (default: root folder name), harnesses to generate for (default: all), whether to write pointer files into detected nested clones (default: no). Renders the payload, prints the list of written and skipped files, then tells the owner the local steps that remain (define the secret variables, approve MCP servers when prompted).
- **Join** when the marker exists. Sets `git config core.hooksPath .githooks` if unset, lists secret variables from the example file that are not defined in the environment, reminds about MCP approval, writes no shared files.
- **Upgrade** when the marker's `pluginVersion` is older than the plugin. Shows which templates changed since that version and applies each only with a yes; skipped files stay skipped.

The skill runs the engine as `node <skill dir>/scripts/init.mjs <mode> <flags>` and reads its JSON report. All decisions that need judgment stay in the skill; the script only renders and reports.

### 4.2 The nudge

- `hooks/session-start` gains a check: read `cwd` from the hook's stdin JSON; if `cwd/.agents/ultrapowers.json` is missing, append one line to the injected context: "This project has no ultrapowers scaffold. Offer /ultrapowers:init before other work." If present with an older `pluginVersion`, append the upgrade variant. Otherwise append nothing. The check never writes.
- The OpenCode, Pi and Hermes injectors do the same check in code against the project directory they receive.
- `skills/using-ultrapowers/SKILL.md` gains a short section telling the agent on harnesses without hooks (Codex, Devin, Kimi, Gemini, Muse if hookless) to check for the marker at the start of a session and offer init. This is the only change to that skill's body.

### 4.3 Project config

`.agents/ultrapowers.json`:

```json
{
  "name": "<project name>",
  "pluginVersion": "1.0.0",
  "scaffoldedAt": "2026-09-30",
  "topology": "nested",
  "repos": [ { "name": "<folder>", "path": "<folder>", "defaultBranch": "main" } ],
  "harnesses": ["claude-code", "codex", "cursor", "copilot", "gemini", "qwen", "opencode", "factory", "kimi", "devin", "antigravity", "hermes", "pi", "muse"],
  "kb": ["tasks", "specs", "plans", "reviews", "evals", "handbooks", "brand-book", "business", "playbooks", "release-notes"],
  "written": ["AGENTS.md", "CLAUDE.md", "..."]
}
```

`topology` is `root` when no nested clone is detected, else `nested`. `repos` is auto-discovered: directories one level down that contain `.git`. Later pieces add top-level keys: `memory` (piece 4), `qa` (piece 5).

### 4.4 Template engine

`skills/init/scripts/init.mjs`, Node standard library only. Templates live in `templates/` at the plugin root, mirroring the target tree; a file named `AGENTS.md.tmpl` renders to `AGENTS.md`. Placeholders are `{{name}}`, `{{pluginVersion}}`, `{{date}}`, `{{repos}}` and per-harness flags. Rules:

- Never overwrite. If the target exists, skip and report.
- `.gitignore` and `.gitattributes`: manage a block between `# >>> ultrapowers` and `# <<< ultrapowers`; create the file if absent, replace the block if present, append the block if the file exists without one.
- Write a provenance comment on the first line where the format allows comments (Markdown, TOML, JSONC, shell). Plain JSON gets none.
- Record every written path in `written` in the config.
- Emit a JSON report `{ mode, written: [], skipped: [], repos: [], nextSteps: [] }` on stdout for the skill to read.
- Generate every MCP file from `templates/.mcp.json` by transforming to each schema (4.5). The transform is the only logic beyond substitution.

### 4.5 The baseline payload

Knowledge base:

- The ten folders, each with `README.md` stating what belongs there and the naming convention, and a `.gitkeep`. `tasks`, `specs`, `plans`, `reviews` READMEs describe the `<ticket-id>/` subfolder convention used by piece 3.
- Root `README.md` only if none exists: folder guide, workspace setup for both topologies, per-harness setup pointers, contributing notes.

Instructions:

- `AGENTS.md`: the reference content in full, made generic. Sections: repository principles and directory-first layout; team memory (path `.agents/memory/`, the four criteria, the commit trailer); anti-slop rules; the two house rules with the tech list replaced by "any language in this repository"; behavioral guidelines 1 to 4 and the closing check; a new "Response style" section holding the output-style rules.
- `CLAUDE.md`: first line `@AGENTS.md`, then `@.agents/memory/MEMORY.md`, then Claude-only notes (settings location, output style name, hooks live in `.claude/settings.json`).
- `GEMINI.md`: `@AGENTS.md`.
- `.gemini/settings.json` and `.qwen/settings.json`: `context.fileName` including `AGENTS.md`, plus generated `mcpServers`.
- `.github/copilot-instructions.md`: pointer to AGENTS.md and the directory-first rule. `.vscode/settings.json`: Copilot instruction file locations.
- Optional per nested clone: a three-line `AGENTS.md` pointing up to the root's knowledge base and memory, written only when the owner opts in.

Settings and MCP:

- `.mcp.json` (canonical): Playwright, context7, sequential thinking, Microsoft docs, deepwiki, Firecrawl, Brave, Chrome DevTools. Secrets as `${VAR}`. Commands use `npx` in the canonical file. Every generated file starts each `npx` server as `node -e <launcher> -- <npx args>`. The launcher runs `cmd /c npx` on Windows and `npx` elsewhere, so a scaffold made on any OS works for teammates on every other OS. (Revised 2026-09-30 by owner decision: the earlier per-OS `cmd /c` wrapper broke macOS and Linux teammates of a Windows scaffold.)
- Generated: `.codex/config.toml` (`[mcp_servers.<id>]`, secrets by variable name, plus `approval_policy` and `sandbox_mode` defaults), `.cursor/mcp.json` (`${env:VAR}`), `.gemini/settings.json`, `.qwen/settings.json`, `opencode.json` (`mcp` map with `{env:VAR}`), `.factory/mcp.json`, `.kimi/mcp.json`, `.vscode/mcp.json`.
- `.claude/settings.json`: `outputStyle` set to the shipped style name; `permissions.allow` with a curated read-mostly list (read tools, git read subcommands, docker read subcommands, package-manager test and build commands, the plugin's skills); empty `hooks` object that piece 4 fills; `.claude/settings.local.json` gitignored.
- `.agents/mcp-secrets.env.example`: variable names with one-line purposes. The real file is never created by init.

Output style:

- Plugin ships `output-styles/ste-explanatory.md`: the reference style, renamed, no project content. Init writes the same file to `.claude/output-styles/` and the settings reference it.

Hygiene:

- `.gitignore` block: nested clone folders from `repos`, `.ultrapowers/`, `.remember/`, `.playwright-mcp/`, `.firecrawl/`, `.agents/mcp-secrets.env`, `*.local.*` next to committed templates, `.claude/settings.local.json`, tool scratch.
- `.gitattributes` block: LF for `.githooks/*`, `*.sh`, `*.ps1`, and the harness config files.
- `.gitleaks.toml` extending the default ruleset.
- `.githooks/pre-commit`: gitleaks on staged changes, Windows install-path probe, Docker fallback, warn-and-continue when neither is available.

### 4.6 Nested clones

Detection: directories one level down containing `.git`. Recorded in `repos`, added to the gitignore block. Pointer AGENTS.md per clone only on opt-in. Detection reruns on join and upgrade to catch clones added later, reporting new ones.

## 5. Acceptance criteria

1. On a fresh temp repo, `/ultrapowers:init` in Claude Code writes the payload in 4.5 and the config in 4.3, prints written and skipped lists, and asks before anything is written.
2. Running init a second time writes nothing and reports every file as existing.
3. Pre-creating `AGENTS.md` with custom content, then running init, leaves it byte-identical and reports it skipped.
4. A repo with a marker whose `pluginVersion` is older gets the upgrade nudge and the upgrade mode; a repo without a marker gets the scaffold nudge; a current repo gets no nudge. Tested for the bash hook with three fixtures and for the three in-process injectors.
5. Generated MCP files parse in their own format (JSON, JSONC, TOML via a minimal parser in the test) and list the same server ids as `.mcp.json`.
6. Opening the scaffolded repo in Codex and Cursor shows AGENTS.md content in effect and the MCP servers listed.
7. `node --test` for the engine and `bash` tests for the hook pass; `scripts/lint-shell.sh --all` passes.
8. No file in `templates/` contains a hostname, email, personal name or credential; a test greps for the reference project's known patterns.

## 6. Risks

- Harness file paths marked unverified in the research (Kimi, Pi, Devin, Antigravity, Hermes project-level) may be wrong. Mitigation: those files are generated behind harness flags and documented as best-effort; the acceptance test covers Claude Code, Codex and Cursor.
- Claude Code ignores AGENTS.md when CLAUDE.md exists, so the import line is load-bearing. Mitigation: the CLAUDE.md template starts with the import and a test asserts it.
- Owner rules in AGENTS.md (no test files committed, no code comments) may not suit every team. Mitigation: kept per owner's instruction, marked as house rules a team may edit.
- Node absence on a machine breaks the engine. Mitigation: the skill checks for Node first and reports the requirement; Playwright MCP already needs it.

## 7. Out of scope

Memory store templates and memory hooks (piece 4). QA files and config (piece 5). new-task, brainstorm-task and task skills (piece 3). A `_templates` folder until its purpose is described.
