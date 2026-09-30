# Scaffold Engine and Baseline Payload Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use ultrapowers:subagent-driven-development (recommended) or ultrapowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `/ultrapowers:init`: a nudge at session start, a skill that asks before writing, and a zero-dependency Node engine that renders the baseline project payload (knowledge base, AGENTS.md family, per-harness MCP files, settings, hygiene) idempotently into any project.

**Architecture:** Templates under `templates/` mirror the target tree; `skills/init/scripts/init.mjs` renders them with `{{key}}` substitution, never overwrites, manages marked blocks in `.gitignore`/`.gitattributes`, and generates every harness MCP file from one canonical `templates/.mcp.json`. The bash SessionStart hook and the three in-process injectors (OpenCode, Pi, Hermes) only read the nearest `.agents/ultrapowers.json` and append one nudge line; the skill owns every decision and only calls the engine after your human partner says yes.

**Tech Stack:** Bash (hook, hook tests, shell lint), Node 18+ standard library only (`node:fs`, `node:path`, `node:process`, `node:child_process`, `node:test`), Python 3 (Hermes injector + pytest), Markdown/JSON/TOML templates. The injector tests import the Pi TypeScript extension directly, which needs a Node with type stripping on by default (22.18+ or 23.6+), the same requirement `tests/pi/test-pi-extension.mjs` already has.

**Spec:** `docs/ultrapowers/specs/2026-09-30-scaffold-engine-and-baseline-payload-design.md` (piece 2). This plan assumes piece 1 (`docs/ultrapowers/specs/2026-09-30-rename-and-fork-hygiene-design.md`) is merged: plugin name `ultrapowers`, skill `skills/using-ultrapowers/`, namespace `ultrapowers:*`, runtime dir `.ultrapowers/`, env vars `ULTRAPOWERS_*`, injector files `.opencode/plugins/ultrapowers.js` and `.pi/extensions/ultrapowers.ts`, version `1.0.0` in `.claude-plugin/plugin.json`.

## Global Constraints

- G1. Every new ultrapowers skill follows the conventions of the fifteen original skills: two-key frontmatter (`name`, `description` beginning "Use when"), the process in `ultrapowers:writing-skills` including pressure testing, checklists that become todos, red-flags tables where rationalization is likely, "your human partner" voice, and no harness tool names in skill bodies. Tools ported from the reference project keep their own structure.
- G2. Zero runtime dependencies. Scripts are bash or Node with the standard library only.
- G3. Nothing is written into a project without the owner's explicit yes in that session.
- G4. Nothing from the reference project's data enters templates: no hostnames, names, ids, credentials. Placeholders only.
- G5. Windows with Git Bash is the primary environment; Linux and macOS must work. Committed shell files are LF.
- Every commit message in this plan ends with a final line that is exactly `RAOOF A.`.
- Public vendor MCP endpoints (`https://learn.microsoft.com/api/mcp`, `https://mcp.deepwiki.com/mcp`) and JSON `$schema` URLs are the only URLs permitted in `templates/`; the leak test in Task 1 enforces the allowlist.

## Review Focus

1. A hook stdin JSON whose `cwd` is a Windows path with escaped backslashes (the JSON text `"cwd":"C:\\work\\proj"`) must resolve to the real directory, not to `$PWD`; test pinned in Task 8 ("Windows-escaped cwd resolves to the real directory"; it runs where `cygpath` exists and prints `[SKIP]` elsewhere).
2. A project whose `.agents/ultrapowers.json` is unparseable (truncated by a merge conflict) must still get a nudge and must never crash the hook or an injector; tests pinned in Task 8 ("truncated marker: repair nudge, hook still succeeds", "merge-conflicted marker: repair nudge") and Task 9 (the `corrupt` case of "OpenCode V1 injector", "OpenCode V2 injector", "Pi injector" and `test_first_turn_nudge_follows_the_marker`).
3. An existing `.gitignore` without a trailing newline, or with CRLF endings, must gain the managed block without gluing it to the last line and without mixing line endings; tests pinned in Task 4 ("applyBlock appends to a gitignore without trailing newline on its own line", "applyBlock preserves CRLF endings of an existing file", "existing gitignore without trailing newline and CRLF gitattributes both gain a clean block").
4. A template containing an unknown placeholder must fail the whole run before any file is written, rather than writing `{{typo}}` into a project; tests pinned in Task 4 ("an unknown placeholder aborts before any file is written") and Task 5 ("an unknown server shape in .mcp.json aborts before anything is written").
5. Running `scaffold` from inside a nested clone (a directory that has `.git` and whose parent holds `.agents/ultrapowers.json`) must refuse and point at the parent, since the scaffold root is the workspace root; tests pinned in Task 4 ("scaffold inside a nested clone refuses and names the workspace root") and Task 6 ("join and upgrade refuse outside a scaffold and inside a nested clone").

---

## File Structure

New files (created by this plan):

| Path | Responsibility |
|------|----------------|
| `templates/README.md.tmpl`, `templates/AGENTS.md.tmpl`, `templates/CLAUDE.md.tmpl`, `templates/GEMINI.md.tmpl` | Root instruction and guide files |
| `templates/<kb>/README.md.tmpl` and `templates/<kb>/.gitkeep` for the ten knowledge base folders | Knowledge base payload |
| `templates/.mcp.json` | Canonical MCP declaration; the only MCP source |
| `templates/.agents/mcp-secrets.env.example.tmpl`, `templates/.agents/ultrapowers.json.tmpl` | Secrets scaffolding, project config |
| `templates/.claude/settings.json.tmpl` | Claude Code shared settings |
| `templates/.github/copilot-instructions.md.tmpl`, `templates/.vscode/settings.json.tmpl` | Copilot pointer and instruction locations |
| `templates/.gitleaks.toml.tmpl`, `templates/.githooks/pre-commit.tmpl` | Secret scanning |
| `templates/_blocks/gitignore.tmpl`, `templates/_blocks/gitattributes.tmpl` | Managed blocks |
| `templates/_nested/AGENTS.md.tmpl` | Opt-in pointer for nested clones |
| `templates/CHANGES.json` | Version in which each template target last changed (drives upgrade mode) |
| `output-styles/ste-explanatory.md` | The plugin's output style (copied into projects) |
| `skills/init/SKILL.md` | The init skill |
| `skills/init/scripts/init.mjs` | The engine |
| `tests/init/test-templates-clean.sh` | Leak scan (acceptance 8) |
| `tests/init/test-engine.mjs`, `tests/init/test-mcp-transforms.mjs`, `tests/init/test-modes.mjs`, `tests/init/toml-mini.mjs` | Engine tests |
| `tests/init/run-tests.sh` | Runs every init suite |
| `tests/init/test-nudge-injectors.mjs`, `tests/hermes/test_nudge.py` | Injector nudge tests (the first also checks the using-ultrapowers section) |
| `tests/init/test-skill-structure.sh` | Structural checks for the init skill: frontmatter, engine flags and error codes, voice, word budget |
| `tests/init/pressure-scenarios.md`, `tests/init/pressure-results.md` | writing-skills pressure scenarios for the init skill and the using-ultrapowers section, with baseline and with-skill results |

Modified files:

| Path | Change |
|------|--------|
| `hooks/session-start` | Read stdin `cwd`, marker check, nudge line |
| `tests/hooks/test-session-start.sh` | Three nudge fixtures plus review-focus cases |
| `.opencode/plugins/ultrapowers.js`, `.pi/extensions/ultrapowers.ts`, `.hermes-plugin/__init__.py` | Marker check and nudge |
| `skills/using-ultrapowers/SKILL.md` | One short `## Project Scaffold` section |
| `.muse-plugin/plugin.json` | Add the `init` skill to the explicit list |
| `.version-bump.json` | Exclude `CHANGES.json` from the version audit |
| `.gitattributes` | LF pins for templates and the hook template |
| `docs/testing.md` | List the new suites |

---

### Task 1: Knowledge base and root README templates, plus the leak scan

**Files:**
- Create: `templates/tasks/README.md.tmpl`, `templates/specs/README.md.tmpl`, `templates/plans/README.md.tmpl`, `templates/reviews/README.md.tmpl`, `templates/evals/README.md.tmpl`, `templates/handbooks/README.md.tmpl`, `templates/brand-book/README.md.tmpl`, `templates/business/README.md.tmpl`, `templates/playbooks/README.md.tmpl`, `templates/release-notes/README.md.tmpl`
- Create: `templates/<kb>/.gitkeep` for each of the ten folders (empty files)
- Create: `templates/README.md.tmpl`
- Create: `tests/init/test-templates-clean.sh`
- Modify: `.gitattributes` (append LF pins)

**Interfaces:**
- Consumes: nothing.
- Produces: template files the engine (Task 4) walks. Placeholders used here: `{{name}}`, `{{date}}`, `{{pluginVersion}}`, `{{topology}}`, `{{repos}}`, `{{repoGuideLines}}`. The engine must define exactly these (plus those introduced in Tasks 2 and 3).

- [ ] **Step 1: Write the failing leak-scan test**

Create `tests/init/test-templates-clean.sh`:

```bash
#!/usr/bin/env bash
# Acceptance 8: no file under templates/ carries a hostname, email, personal
# name, id or credential. Generic classes are checked here. The owner may add
# project-specific patterns in a local, untracked file and point
# ULTRAPOWERS_FORBIDDEN_PATTERNS_FILE at it; those patterns never enter git.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
TEMPLATES="$REPO_ROOT/templates"

FAILURES=0
pass() { echo "  [PASS] $1"; }
fail() { echo "  [FAIL] $1"; FAILURES=$((FAILURES + 1)); }

echo "Template leak scan"

if [ ! -d "$TEMPLATES" ]; then
  fail "templates/ directory exists"
  echo "STATUS: FAILED (1 failure(s))"
  exit 1
fi
pass "templates/ directory exists"

ALLOWED_URLS='https://learn\.microsoft\.com/api/mcp|https://mcp\.deepwiki\.com/mcp|https://json\.schemastore\.org/[a-z0-9./-]+|https://opencode\.ai/config\.json'

check_absent() {
  local description="$1"
  local pattern="$2"
  local hits
  hits="$(grep -rInE -- "$pattern" "$TEMPLATES" || true)"
  if [ -z "$hits" ]; then
    pass "$description"
  else
    fail "$description"
    printf '%s\n' "$hits" | sed 's/^/      /'
  fi
}

check_absent "no email addresses" '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}'
check_absent "no IPv4 addresses" '([0-9]{1,3}\.){3}[0-9]{1,3}'
check_absent "no localhost or loopback endpoints" 'localhost:[0-9]+|127\.0\.0\.1|bolt://'
check_absent "no Windows user paths" '[A-Za-z]:\\\\Users\\\\|/c/Users/|C:/Users/'
check_absent "no bearer or key literals" '(sk|pk|ghp|glpat|xox[abp])-[A-Za-z0-9_-]{8,}|AKIA[0-9A-Z]{12,}|Bearer [A-Za-z0-9._-]{16,}'
check_absent "no tenant or realm ids" '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'

url_hits="$(grep -rInoE -- 'https?://[^ )"'"'"'>`]+' "$TEMPLATES" | grep -vE -- "$ALLOWED_URLS" || true)"
if [ -z "$url_hits" ]; then
  pass "only allowlisted URLs"
else
  fail "only allowlisted URLs"
  printf '%s\n' "$url_hits" | sed 's/^/      /'
fi

if [ -n "${ULTRAPOWERS_FORBIDDEN_PATTERNS_FILE:-}" ] && [ -f "$ULTRAPOWERS_FORBIDDEN_PATTERNS_FILE" ]; then
  while IFS= read -r pattern; do
    [ -z "$pattern" ] && continue
    check_absent "no local forbidden pattern: ${pattern:0:3}..." "$pattern"
  done <"$ULTRAPOWERS_FORBIDDEN_PATTERNS_FILE"
fi

kb_dirs=(tasks specs plans reviews evals handbooks brand-book business playbooks release-notes)
for dir in "${kb_dirs[@]}"; do
  if [ -f "$TEMPLATES/$dir/README.md.tmpl" ] && [ -f "$TEMPLATES/$dir/.gitkeep" ]; then
    pass "templates/$dir has README.md.tmpl and .gitkeep"
  else
    fail "templates/$dir has README.md.tmpl and .gitkeep"
  fi
done

for required in README.md.tmpl AGENTS.md.tmpl CLAUDE.md.tmpl GEMINI.md.tmpl .mcp.json \
  .gitleaks.toml.tmpl .githooks/pre-commit.tmpl _blocks/gitignore.tmpl _blocks/gitattributes.tmpl \
  _nested/AGENTS.md.tmpl .agents/mcp-secrets.env.example.tmpl .agents/ultrapowers.json.tmpl \
  .claude/settings.json.tmpl .github/copilot-instructions.md.tmpl .vscode/settings.json.tmpl CHANGES.json; do
  if [ -f "$TEMPLATES/$required" ]; then
    pass "templates/$required exists"
  else
    fail "templates/$required exists"
  fi
done

cr=$'\r'
crlf_hits="$(grep -rIlU -- "$cr" "$TEMPLATES" || true)"
if [ -z "$crlf_hits" ]; then
  pass "templates are LF"
else
  fail "templates are LF"
  printf '%s\n' "$crlf_hits" | sed 's/^/      /'
fi

if [[ "$FAILURES" -gt 0 ]]; then
  echo "STATUS: FAILED ($FAILURES failure(s))"
  exit 1
fi
echo "STATUS: PASSED"
```

The CRLF check keeps the carriage return in a variable and passes `-U` to grep on purpose: on Git Bash, `$'\r'` written inside `$(...)` expands to an empty pattern (which matches every file), and MSYS grep strips carriage returns before matching unless `-U` is given.

- [ ] **Step 2: Run it to see it fail**

Run: `bash tests/init/test-templates-clean.sh`
Expected: `[FAIL] templates/ directory exists` and `STATUS: FAILED (1 failure(s))`, exit 1.

- [ ] **Step 3: Create the ten knowledge base README templates and `.gitkeep` files**

```bash
cd /s/ultrapowers
for d in tasks specs plans reviews evals handbooks brand-book business playbooks release-notes; do
  mkdir -p "templates/$d" && : > "templates/$d/.gitkeep"
done
```

Create `templates/tasks/README.md.tmpl`:

```markdown
# tasks

Actionable work items for `{{name}}`.

## What belongs here

- One folder per ticket: `tasks/<ticket-id>/`. The brief is `tasks/<ticket-id>/<ticket-id>.md`. Notes and checklists that the task needs sit next to it.
- Small implementation tasks, backlog slices, investigation tasks, bug notes, QA tasks, and follow-up items from reviews.
- Every brief states the owner, the status, the acceptance criteria, and links to the folders that share its ticket id in `specs/`, `plans/`, `reviews/` and `evals/`.

## Naming

- `<ticket-id>` is the tracker id, for example `1234`. Without a tracker, use `YYYY-MM-DD-<slug>`.
- Supporting files use short lower-case names with hyphens.
- The same `<ticket-id>` names the matching folders in the other knowledge base folders.

## What does not belong here

- Secrets, tokens, personal data.
- Run transcripts and generated reports. Those go to `reviews/<ticket-id>/artifacts/` and only when they contain no personal data.
```

Create `templates/specs/README.md.tmpl`:

```markdown
# specs

Product and technical specifications for `{{name}}`.

## What belongs here

- One folder per ticket: `specs/<ticket-id>/`. The approved design is `specs/<ticket-id>/Spec.md`.
- Requirements, feature specs, API specs, user stories, acceptance criteria, non-goals, constraints, open questions.
- A spec carries a status line near the top: `draft`, `approved` or `superseded`, with the date.

## Naming

- `<ticket-id>` matches `tasks/<ticket-id>/`.
- One `Spec.md` per ticket. Research notes that fed the spec use `research-<slug>.md` in the same folder.
- A spec for a cross-cutting topic without a ticket lives at `specs/<YYYY-MM-DD>-<slug>/Spec.md`.

## What does not belong here

- Implementation steps. Those are plans.
- Findings about shipped code. Those are reviews.
```

Create `templates/plans/README.md.tmpl`:

```markdown
# plans

Implementation and delivery plans for `{{name}}`.

## What belongs here

- One folder per ticket: `plans/<ticket-id>/`. A single plan is `plans/<ticket-id>/Plan.md`.
- A plan set for one ticket uses `plans/<ticket-id>/PLAN-NN-<slug>.md` files with a `README.md` index in the same folder.
- Step-by-step execution plans, release plans, rollout plans, migration plans, verification checklists.

## Naming

- `<ticket-id>` matches `tasks/<ticket-id>/` and `specs/<ticket-id>/`.
- `NN` is a two-digit sequence starting at `01`.
- Checkbox steps (`- [ ]`) are the progress record; a plan is done when every box is checked and its verification section reports passing.

## What does not belong here

- Design rationale. Put it in the spec and link to it.
- Code. Plans contain the code an implementer needs, but the implementation lands in the code repositories.
```

Create `templates/reviews/README.md.tmpl`:

```markdown
# reviews

Review outputs and decision evidence for `{{name}}`.

## What belongs here

- One folder per ticket: `reviews/<ticket-id>/`.
- Code reviews, architecture reviews, security reviews, design reviews, prompt and agent reviews, retrospectives, QA reports.
- Each review names the reviewed revision, lists findings with severity and evidence, records the decision, and lists follow-up actions.

## Naming

- `<ticket-id>` matches the other knowledge base folders.
- A human or agent review is `reviews/<ticket-id>/Review.md`; a later round is `Review-2.md`, `Review-3.md`.
- Evidence files (screenshots, logs cleaned of personal data) go to `reviews/<ticket-id>/artifacts/` and are named `<area>-<what>.<ext>`.

## What does not belong here

- Raw run transcripts, tokens, session cookies, database dumps, or anything with personal data. Those stay local and gitignored.
```

Create `templates/evals/README.md.tmpl`:

```markdown
# evals

Evaluation records for `{{name}}`: how a change was measured, and against what.

## What belongs here

- One folder per ticket: `evals/<ticket-id>/`.
- Scenario definitions, acceptance criteria used to grade, result tables, and the comparison against the previous baseline.
- Agent-behavior evals: the prompt, the expected behavior, the observed behavior, and the verdict.

## Naming

- `evals/<ticket-id>/README.md` summarizes the run and links each scenario file.
- Scenario files are `scenario-<slug>.md`; result tables are `results-<YYYY-MM-DD>.md`.

## What does not belong here

- Model or API credentials.
- Large raw outputs. Keep the summary and the verdict; link to where the raw output lives if it is needed.
```

Create `templates/handbooks/README.md.tmpl`:

```markdown
# handbooks

Team operating guides and technical handbooks for `{{name}}`.

## What belongs here

- Architecture notes, developer onboarding, DevOps runbooks, backend and frontend conventions, environment setup, incident procedures.
- A handbook describes how something works today. When it changes, the handbook changes in the same change.

## Naming

- One folder or one file per topic, named by the topic: `handbooks/Architecture.md`, `handbooks/Backend/`, `handbooks/DevOps/`.
- Inside a topic folder, `README.md` is the entry point.
- Command examples are copy-pastable and name the directory they run from.

## What does not belong here

- Anything that belongs to one ticket. That goes to `tasks/`, `specs/`, `plans/` or `reviews/`.
- Hostnames, ports, credentials of real environments. Use placeholders and point to where the real value is kept.
```

Create `templates/brand-book/README.md.tmpl`:

```markdown
# brand-book

Brand and UI identity source of truth for `{{name}}`.

## What belongs here

- The brand book, logos, colors, typography, design tokens, approved UI screenshots, CSS variables, design tool exports.
- One Markdown summary (`brandbook.md`) that states the rules a designer or an agent must follow, so the rules are readable without opening a PDF.

## Naming

- Assets are grouped by kind: `logos/`, `screens/`, `tokens/`.
- Files use lower-case names with hyphens and the format extension: `logo-primary.svg`, `palette.css`.

## What does not belong here

- Unapproved drafts. Keep them in the ticket's `reviews/<ticket-id>/artifacts/` until approved.
```

Create `templates/business/README.md.tmpl`:

```markdown
# business

Business and product context for `{{name}}`.

## What belongs here

- Business plan, market research, customer and persona notes, positioning, pricing assumptions, sales and support context, product strategy.
- Each document names its source and date near the top, so a reader knows how current it is.

## Naming

- Markdown is preferred. Spreadsheets, presentations and PDFs are allowed when the source material requires them.
- Files are named by topic, not by author: `market-research-<YYYY-MM>.md`, `pricing-assumptions.md`.

## What does not belong here

- Customer lists, contracts, or personal data of real people. Reference where they live; do not copy them here.
```

Create `templates/playbooks/README.md.tmpl`:

```markdown
# playbooks

Repeatable procedures for `{{name}}` that a person or an agent runs the same way every time.

## What belongs here

- Step-by-step procedures with a clear trigger, preconditions, the steps, and how to verify the result.
- Release procedures, onboarding a teammate, rotating a secret, restoring a backup, running the QA gate.

## Naming

- One file per procedure: `playbooks/<verb>-<object>.md`, for example `playbooks/rotate-mcp-secrets.md`.
- The first section is `## When to run this`. The last section is `## How you know it worked`.

## What does not belong here

- Background explanation. Link to the handbook that explains why.
```

Create `templates/release-notes/README.md.tmpl`:

```markdown
# release-notes

Customer-facing release notes for `{{name}}`, written from what was actually deployed.

## What belongs here

- One file per release: `release-notes/<YYYY-MM-DD>-<version-or-slug>.md`.
- Each note lists what changed for the user, in plain language, grouped by area, and links the ticket ids behind each change.

## Naming

- Dates are ISO (`YYYY-MM-DD`). Versions follow the code repositories' tags.
- A draft carries `-draft` in its name until it is published.

## What does not belong here

- Internal-only changes with no user-visible effect. Mention them in one line under `Internal` only when a customer might notice a side effect.
```

- [ ] **Step 4: Create the root README template**

Create `templates/README.md.tmpl`:

```markdown
# {{name}}

This repository is the knowledge base and agent configuration for `{{name}}`. It is the directory you open your coding agent in. Code lives at this root or in nested clones one level down that this repository ignores.

Scaffolded by ultrapowers {{pluginVersion}} on {{date}} (topology: {{topology}}).

## Folder guide

| Path | Purpose |
|------|---------|
| `tasks/` | Actionable work items, one folder per ticket id |
| `specs/` | Product and technical specifications, `specs/<ticket-id>/Spec.md` |
| `plans/` | Implementation plans, `plans/<ticket-id>/Plan.md` |
| `reviews/` | Review outputs, QA reports and evidence, one folder per ticket id |
| `evals/` | Evaluation records and result tables |
| `handbooks/` | Team operating guides and technical handbooks |
| `brand-book/` | Brand and UI identity source of truth |
| `business/` | Business and product context |
| `playbooks/` | Repeatable procedures with a trigger and a verification |
| `release-notes/` | Customer-facing release notes |
| `AGENTS.md` | The single instruction source for every coding agent |
| `.agents/` | Project config (`ultrapowers.json`), secret variable names, team memory |
| `.claude/`, `.codex/`, `.cursor/`, `.gemini/`, `.qwen/`, `.factory/`, `.kimi/`, `.vscode/`, `.github/` | Per-harness configuration generated from `.mcp.json` and `AGENTS.md` |

Each knowledge base folder has a `README.md` that states what belongs there and how files are named.

## Nested clones

{{repoGuideLines}}

Nested clones are separate git repositories. This repository ignores them through the managed block in `.gitignore`. When you add a clone, run `/ultrapowers:init` again; join mode detects it and offers to record it.

## Workspace setup

### Root topology (code at this root)

1. Clone this repository and open your coding agent here.
2. Run `git config core.hooksPath .githooks` once per clone so the secret scan runs before every commit.
3. Define the environment variables listed in `.agents/mcp-secrets.env.example` in your user environment. Never commit real values.

### Nested topology (code in clones one level down)

1. Clone this repository and open your coding agent here.
2. Clone each code repository into a folder directly under this root.
3. Run `git config core.hooksPath .githooks` once per clone of this repository.
4. Define the environment variables listed in `.agents/mcp-secrets.env.example`.
5. Run `git status --short` before your first commit and confirm no clone folder appears.

## Per-harness setup

- Claude Code: reads `CLAUDE.md` (which imports `AGENTS.md`), `.claude/settings.json` and `.mcp.json`. Approve the project MCP servers when prompted.
- Codex: reads `AGENTS.md` and `.codex/config.toml`.
- Cursor: reads `AGENTS.md` and `.cursor/mcp.json`.
- GitHub Copilot and VS Code: read `.github/copilot-instructions.md`, `.vscode/settings.json` and `.vscode/mcp.json`.
- Gemini CLI: reads `GEMINI.md` and `.gemini/settings.json`, which lists `AGENTS.md` as a context file.
- Qwen Code: reads `.qwen/settings.json`, which lists `AGENTS.md` as a context file.
- OpenCode: reads `AGENTS.md` and `opencode.json`.
- Factory, Kimi: read `AGENTS.md`; their MCP files are best-effort and may need adjustment.
- Devin, Antigravity, Hermes, Pi, Muse: read `AGENTS.md`.

Every harness needs the ultrapowers plugin installed; skills are not copied into this repository.

## Contributing

- Read `AGENTS.md` first. It is the contract for people and agents alike.
- One ticket id per change set. Keep the four folders (`tasks`, `specs`, `plans`, `reviews`) for that id in step.
- Never commit secrets, personal data, or files under a nested clone.
```

- [ ] **Step 5: Pin line endings for templates**

Append to `.gitattributes`:

```gitattributes

# Ultrapowers templates and the hook template must stay LF; the engine copies
# them byte-for-byte into projects, and the pre-commit template runs under sh
*.tmpl text eol=lf
templates/.githooks/* text eol=lf
templates/.mcp.json text eol=lf
templates/CHANGES.json text eol=lf
```

- [ ] **Step 6: Run the leak scan again**

Run: `bash tests/init/test-templates-clean.sh`
Expected: every knowledge base line `[PASS]`; the `templates/<required> exists` lines for files created in Tasks 2 and 3 still `[FAIL]` (AGENTS.md.tmpl, CLAUDE.md.tmpl, GEMINI.md.tmpl, .mcp.json, .gitleaks.toml.tmpl, .githooks/pre-commit.tmpl, _blocks/*, _nested/*, .agents/*, .claude/*, .github/*, .vscode/*, CHANGES.json). No leak-class failure. The suite goes fully green at the end of Task 3.

- [ ] **Step 7: Commit**

```bash
git add templates/ tests/init/test-templates-clean.sh .gitattributes
git commit -m "feat(init): knowledge base and README templates with leak scan" -m "Ten knowledge base READMEs describe what belongs in each folder and the <ticket-id>/ convention shared with the task lifecycle skills. The leak scan enforces G4 over templates/ with generic pattern classes and an optional local pattern file that never enters git." -m "RAOOF A."
```

---

### Task 2: Instruction templates, output style, Copilot and VS Code pointers, nested-clone pointer

**Files:**
- Create: `templates/AGENTS.md.tmpl`, `templates/CLAUDE.md.tmpl`, `templates/GEMINI.md.tmpl`
- Create: `templates/.github/copilot-instructions.md.tmpl`, `templates/.vscode/settings.json.tmpl`
- Create: `templates/_nested/AGENTS.md.tmpl`
- Create: `output-styles/ste-explanatory.md`

**Interfaces:**
- Consumes: placeholders `{{name}}`, `{{date}}`, `{{pluginVersion}}`, `{{repos}}` (defined by the engine in Task 4). `templates/_nested/AGENTS.md.tmpl` additionally uses `{{repo}}` (the clone folder name), which only the nested-pointer renderer supplies.
- Produces: `output-styles/ste-explanatory.md`, which the engine copies to `.claude/output-styles/ste-explanatory.md` (Task 4 reads it from the plugin root; there is no second copy under `templates/`). The style's frontmatter `name` is `STE Explanatory`; `.claude/settings.json` (Task 3) references that exact string.

- [ ] **Step 1: Write the AGENTS.md template**

Create `templates/AGENTS.md.tmpl`:

````markdown
# {{name}}: instructions for coding agents

This file is the single instruction source for every coding agent that opens this repository. `CLAUDE.md` and `GEMINI.md` import it; Codex, Cursor, Copilot, OpenCode, Factory, Hermes, Pi, Devin, Antigravity and Muse read it directly. Edit this file, not the importers.

## Repository principles

- This repository is the knowledge base and agent configuration for `{{name}}`. It is the authoritative source of truth for specs, plans, reviews, handbooks and decisions. Code lives at this root or in nested clones one level down.
- Directory-first layout: every work item has a ticket id and four folders named by it: `tasks/<id>/`, `specs/<id>/`, `plans/<id>/`, `reviews/<id>/`. Look for the ticket's folders before creating anything; extend what exists.
- Knowledge documents are Markdown. Each folder's `README.md` states what belongs there and how files are named. Read it before adding a file.
- Never commit real tokens, passwords, API keys, connection strings, internal hostnames, or personal local settings. Secrets are environment variables named in `.agents/mcp-secrets.env.example`; local overrides are `*.local.*` files, which are gitignored.
- Before changing an agent discovery path, an MCP schema, or a harness-specific file format, check the vendor's current documentation.
- Nested clones are other repositories. Do not commit their contents here, and do not edit their agent files unless the task says so.

## Team memory

- The shared team memory lives in `.agents/memory/`. `MEMORY.md` is the index; topic files live next to it. Read the index at session start and open a topic file only when its index line is relevant to the task.
- A fact enters team memory when it meets all four criteria: verified in this session, durable beyond this ticket, more than fifteen minutes to rediscover, and not derivable from the code or the docs in one step.
- Personal memory is private scratch. When a personal note meets the four criteria, promote it into `.agents/memory/` with the team-memory skill; link, do not duplicate.
- Commits that motivate or land a memory entry add the trailer `Memory-Ref: <dir>/<file>.md`.
- Never store secrets, credentials, personal data, or anything that identifies a customer in team memory.

## Anti-slop rules

- Understand the task deeply before editing.
- Choose the smallest workflow that can solve it.
- Do not accept placeholder implementations, dead scaffolding, fake integrations, or TODO-only completions.
- Require evidence for claims about correctness.
- If repository state and documentation disagree, surface the conflict explicitly before implementing.
- Do not let workers improvise between memory surfaces; make the canonical surface part of the task contract.

## House rules

These two rules are this team's choice. A team that adopts this file may edit them, but an agent working here follows them as written.

- Never commit test files. Write throwaway tests to prove your work during development, run them, then delete them before the commit. No test file, test project, fixture, or test results folder enters git.
- Never write code comments. In any code or config file you create or edit, in any language in this repository, write no line comment, block comment, doc comment, or markup comment; the code and its names carry the meaning. Remove a comment you meet in a line you already change. Markdown headings and the `#!` shebang on line 1 of a script are not comments.

---

Behavioral guidelines to reduce common LLM coding mistakes.

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:

- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them; don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:

- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it; don't delete it.

When your changes create orphans:

- Remove imports, variables and functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: every changed line should trace directly to your human partner's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:

- "Add validation" becomes "Write tests for invalid inputs, then make them pass"
- "Fix the bug" becomes "Write a test that reproduces it, then make it pass"
- "Refactor X" becomes "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:

```text
1. [Step] -> verify: [check]
2. [Step] -> verify: [check]
3. [Step] -> verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.

## Response style

Write explanations, insights and summaries in Simplified Technical English. These rules apply to prose, not to code, file paths, or command syntax.

- Words: one term for one idea; one verb for one action; the short common word over the rare one; define an uncommon term at first use; a word keeps its one fixed meaning and its one part of speech.
- Grammar: active voice with a named actor; passive voice only in a description where the actor is unknown; simple tenses only; no perfect tense; no chained modal verbs; an `-ing` word is a noun, not the main verb.
- Sentences: one instruction per sentence; an instruction is 20 words or less; an explanation is 25 words or less; keep subject, verb and article; a noun cluster is at most 3 words.
- Structure: one topic per paragraph, 6 sentences or less; a numbered list for 3 or more sequential steps; a bullet list for 3 or more parallel items; the result or finding comes first, background after.
- Insights: before and after you write code, give one to three points about the choice you made, specific to this codebase. Insights go in the conversation, never into the codebase.
````

- [ ] **Step 2: Write the CLAUDE.md and GEMINI.md templates**

Create `templates/CLAUDE.md.tmpl`. The first line is load-bearing: Claude Code ignores `AGENTS.md` when this file exists, so the import must be line 1 and the engine writes no provenance comment into files whose first line starts with `@`:

```markdown
@AGENTS.md
@.agents/memory/MEMORY.md

## Claude Code notes

- Shared Claude Code settings are in `.claude/settings.json`; put personal overrides in `.claude/settings.local.json`, which is gitignored.
- The output style is `STE Explanatory`, stored at `.claude/output-styles/ste-explanatory.md` and selected by `outputStyle` in the settings file.
- Hooks are declared in the `hooks` object of `.claude/settings.json`.
- Project MCP servers are declared in `.mcp.json`, with secrets as `${VAR}` placeholders whose names are listed in `.agents/mcp-secrets.env.example`.
```

Create `templates/GEMINI.md.tmpl`:

```markdown
@AGENTS.md
@.agents/memory/MEMORY.md
```

- [ ] **Step 3: Write the Copilot pointer and the VS Code settings templates**

Create `templates/.github/copilot-instructions.md.tmpl`:

```markdown
# Copilot instructions for {{name}}

- Read and follow `AGENTS.md` at the repository root. It is the single instruction source for every coding agent here; nothing in this file overrides it.
- Directory-first layout: every ticket id has `tasks/<id>/`, `specs/<id>/`, `plans/<id>/` and `reviews/<id>/`. Look for the ticket's folders before creating anything.
- Workspace MCP servers for VS Code and Copilot are in `.vscode/mcp.json`; secrets are prompted inputs, never literals.
- Never commit real tokens, secrets, internal hostnames, or personal data. Use placeholders, input variables, or local-only `*.local.*` overrides.
```

Create `templates/.vscode/settings.json.tmpl` (JSONC; the engine adds a `//` provenance line):

```json
{
  "chat.useAgentsMdFile": true,
  "chat.useNestedAgentsMdFiles": false,
  "chat.instructionsFilesLocations": {
    ".github/instructions": true
  },
  "files.eol": "\n",
  "files.insertFinalNewline": true
}
```

- [ ] **Step 4: Write the nested-clone pointer template**

Create `templates/_nested/AGENTS.md.tmpl`:

```markdown
# {{repo}}

This repository is a nested clone inside the `{{name}}` workspace. The knowledge base (`../tasks`, `../specs`, `../plans`, `../reviews`, `../handbooks`) and the team memory (`../.agents/memory/`) live one level up; read `../AGENTS.md` first and consult `../.agents/memory/MEMORY.md` before assuming. A search run from inside this repository cannot see them.
```

- [ ] **Step 5: Add the plugin's output style**

Create `output-styles/ste-explanatory.md`:

```markdown
---
name: STE Explanatory
description: Give educational insights in plain, disciplined technical English while you complete coding tasks
---

You are an interactive CLI tool. You help the user with software engineering tasks. You also give educational insights about the codebase during the task.

Write your explanations and insights in Simplified Technical English (STE). STE is a controlled writing method, based on the ASD-STE100 standard, that improves clarity and reduces ambiguity. This style applies STE writing rules. It does not use or reproduce the official ASD-STE100 dictionary or checker, which need separate authorization from ASD.

This style allows longer responses than usual, so you can give full insights. Keep each sentence short even so.

# STE Writing Rules

Apply these rules to every explanation, insight, and summary. Do not apply them to code, file paths, or command syntax.

**Words**
- Use one term for one idea. Do not rotate synonyms for the same thing.
- Use one verb for one action. Reuse the same verb every time.
- Prefer the short, common word over the formal or rare word.
- Define an uncommon term at its first use.
- Use a word for its one fixed meaning only. Do not stretch a word to cover a new idea (example: "follow" means "to come after", never "to obey").
- Use a word only as its fixed part of speech. Do not turn a noun into a verb (example: keep "oil" as a noun, never as a verb).

**Grammar**
- Use the active voice. Name the actor.
- Use the passive voice only in descriptions, and only when the actor is unknown or does not matter.
- Use simple tenses only: the simple present, the simple past, the simple future, the infinitive, and the imperative.
- Do not use a perfect tense, like "have changed". Use the simple form instead, like "changed".
- Do not chain modal verbs, like "may have been caused by". State the uncertainty as its own plain sentence.
- Use an `-ing` word as a noun only, for example "the setting". Do not use it as the main verb of a sentence.

**Sentences**
- Give one instruction per sentence. Do not join two instructions with "and" or "then".
- Keep an instruction to 20 words or less.
- Keep an explanation to 25 words or less.
- Keep the subject, the verb, and the article in each sentence, even when this makes the sentence longer.
- Limit a noun cluster to 3 words. Break up a longer cluster and name the relationship between the words.

**Structure**
- Cover one topic per paragraph. Use 6 sentences or less per paragraph.
- Use a numbered list for 3 or more steps in a sequence.
- Use a bullet list for 3 or more parallel items.
- State the result or the finding in your first sentence. Do not open with background.

# Insights

Before and after you write code, give a short insight about the implementation choice. Write the insight in STE, per the rules above. Use this exact format:

"`★ Insight ★  ──────────────────────────────────`
[1-3 points, each in STE]
`─────────────────────────────────────────────────`"

Give insights in the conversation only. Do not put insights in the codebase. Pick insights that are specific to this codebase or to the code you just wrote. Do not give general programming facts.
```

- [ ] **Step 6: Verify the load-bearing lines and the leak scan**

Run:

```bash
head -1 templates/CLAUDE.md.tmpl
head -1 templates/GEMINI.md.tmpl
grep -c "^## " templates/AGENTS.md.tmpl
bash tests/init/test-templates-clean.sh | grep -E "FAIL|STATUS"
```

Expected: `@AGENTS.md` printed twice; `9` (Repository principles, Team memory, Anti-slop rules, House rules, 1, 2, 3, 4, Response style); the leak scan shows only `[FAIL] templates/<x> exists` lines for Task 3 files and no leak-class failure.

- [ ] **Step 7: Commit**

```bash
git add templates/AGENTS.md.tmpl templates/CLAUDE.md.tmpl templates/GEMINI.md.tmpl templates/.github templates/.vscode templates/_nested output-styles
git commit -m "feat(init): instruction templates and STE output style" -m "AGENTS.md carries the full generic instruction set: principles, team memory pointing at .agents/memory/, anti-slop rules, the two house rules, the four behavioral sections, the closing check and a Response style section. CLAUDE.md and GEMINI.md import it on line 1. The plugin ships the output style once; init copies it into projects." -m "RAOOF A."
```

---

### Task 3: Settings, MCP source, hygiene and config templates

**Files:**
- Create: `templates/.mcp.json`
- Create: `templates/.agents/mcp-secrets.env.example.tmpl`, `templates/.agents/ultrapowers.json.tmpl`
- Create: `templates/.claude/settings.json.tmpl`
- Create: `templates/.gitleaks.toml.tmpl`, `templates/.githooks/pre-commit.tmpl`
- Create: `templates/_blocks/gitignore.tmpl`, `templates/_blocks/gitattributes.tmpl`
- Create: `templates/CHANGES.json`

**Interfaces:**
- Consumes: nothing.
- Produces: the canonical MCP shape the engine transforms (Task 5): `mcpServers.<id>` is either `{ "type": "stdio", "command": string, "args": string[], "env": { VAR: "${VAR}" } }` or `{ "type": "http", "url": string, "headers": { Header: "${VAR}" } }`; the top-level key `_ultrapowers` holds `{ "windowsNpxWrapper": [schemaId] }` (schema ids: `claude`, `codex`, `cursor`, `gemini`, `qwen`, `opencode`, `factory`, `kimi`, `vscode`) and is stripped from every generated file. Placeholders used here: `{{repoIgnoreLines}}`, `{{reposJson}}`, `{{harnessesJson}}`, `{{kbJson}}`, `{{writtenJson}}`, `{{name}}`, `{{pluginVersion}}`, `{{date}}`, `{{topology}}`. `templates/CHANGES.json` maps every target path to the plugin version in which its template last changed; Task 6 reads it, and a Task 6 test asserts that its keys are exactly the rendered targets minus the `.gitkeep` files. The `*.ultrapowers-new` line in the gitignore block keeps Task 6's upgrade proposals out of commits.

- [ ] **Step 1: Write the canonical MCP declaration**

Create `templates/.mcp.json` (plain JSON, no provenance comment, no `{{` placeholders):

```json
{
  "_ultrapowers": {
    "windowsNpxWrapper": ["claude", "codex", "cursor", "vscode", "factory", "kimi"]
  },
  "mcpServers": {
    "playwright": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@playwright/mcp@latest"],
      "env": {}
    },
    "context7": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@upstash/context7-mcp@latest"],
      "env": { "CONTEXT7_API_KEY": "${CONTEXT7_API_KEY}" }
    },
    "sequentialthinking": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-sequential-thinking"],
      "env": {}
    },
    "microsoftdocs": {
      "type": "http",
      "url": "https://learn.microsoft.com/api/mcp"
    },
    "deepwiki": {
      "type": "http",
      "url": "https://mcp.deepwiki.com/mcp"
    },
    "Firecrawl": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "firecrawl-mcp"],
      "env": { "FIRECRAWL_API_KEY": "${FIRECRAWL_API_KEY}" }
    },
    "brave": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-brave-search"],
      "env": { "BRAVE_API_KEY": "${BRAVE_API_KEY}" }
    },
    "chrome-devtools": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "chrome-devtools-mcp@latest", "--headless", "--isolated", "--channel", "stable"],
      "env": {}
    }
  }
}
```

- [ ] **Step 2: Write the secrets example and the project config templates**

Create `templates/.agents/mcp-secrets.env.example.tmpl` (the engine adds a `#` provenance line on top):

```dotenv
# Environment variables consumed by the MCP servers declared in .mcp.json and
# generated into every harness file. Define them in your OS user environment
# or shell profile. Never commit real values; .agents/mcp-secrets.env is gitignored.
CONTEXT7_API_KEY=    # context7: library documentation lookup
FIRECRAWL_API_KEY=   # Firecrawl: web scraping and search
BRAVE_API_KEY=       # brave: web search
```

Create `templates/.agents/ultrapowers.json.tmpl` (plain JSON; the engine renders it last so `{{writtenJson}}` is complete):

```json
{
  "name": "{{name}}",
  "pluginVersion": "{{pluginVersion}}",
  "scaffoldedAt": "{{date}}",
  "topology": "{{topology}}",
  "repos": {{reposJson}},
  "harnesses": {{harnessesJson}},
  "kb": {{kbJson}},
  "written": {{writtenJson}}
}
```

- [ ] **Step 3: Write the Claude Code settings template**

Create `templates/.claude/settings.json.tmpl` (plain JSON, no provenance):

```json
{
  "$schema": "https://json.schemastore.org/claude-code-settings.json",
  "outputStyle": "STE Explanatory",
  "permissions": {
    "allow": [
      "Read",
      "Glob",
      "Grep",
      "Bash(git status:*)",
      "Bash(git log:*)",
      "Bash(git diff:*)",
      "Bash(git show:*)",
      "Bash(git branch:*)",
      "Bash(git blame:*)",
      "Bash(git rev-parse:*)",
      "Bash(docker ps:*)",
      "Bash(docker logs:*)",
      "Bash(docker compose ps:*)",
      "Bash(docker compose logs:*)",
      "Bash(npm test:*)",
      "Bash(npm run build:*)",
      "Bash(npm run lint:*)",
      "Bash(npx tsc:*)",
      "Bash(dotnet build:*)",
      "Bash(dotnet test:*)",
      "Bash(python -m pytest:*)",
      "Bash(pytest:*)",
      "Bash(cargo build:*)",
      "Bash(cargo test:*)",
      "Bash(go build:*)",
      "Bash(go test:*)",
      "Skill(ultrapowers:brainstorming)",
      "Skill(ultrapowers:diagnosing-ultrapowers)",
      "Skill(ultrapowers:dispatching-parallel-agents)",
      "Skill(ultrapowers:executing-plans)",
      "Skill(ultrapowers:finishing-a-development-branch)",
      "Skill(ultrapowers:init)",
      "Skill(ultrapowers:receiving-code-review)",
      "Skill(ultrapowers:requesting-code-review)",
      "Skill(ultrapowers:subagent-driven-development)",
      "Skill(ultrapowers:systematic-debugging)",
      "Skill(ultrapowers:test-driven-development)",
      "Skill(ultrapowers:using-git-worktrees)",
      "Skill(ultrapowers:using-ultrapowers)",
      "Skill(ultrapowers:verification-before-completion)",
      "Skill(ultrapowers:writing-plans)",
      "Skill(ultrapowers:writing-skills)"
    ]
  },
  "hooks": {}
}
```

- [ ] **Step 4: Write the hygiene templates**

Create `templates/.gitleaks.toml.tmpl` (the engine adds a `#` provenance line on top):

```toml
title = "{{name}} gitleaks"

[extend]
useDefault = true

[allowlist]
description = "Placeholders that the scaffold uses on purpose"
regexes = [
  '''\$\{[A-Z0-9_]+\}''',
  '''\$\{env:[A-Z0-9_]+\}''',
  '''\$\{input:[a-z0-9-]+\}''',
  '''\{env:[A-Z0-9_]+\}''',
]
paths = [
  '''\.agents/mcp-secrets\.env\.example''',
]
```

Create `templates/.githooks/pre-commit.tmpl` (POSIX sh; line 1 stays the shebang, the engine puts the provenance on line 2):

```sh
#!/bin/sh
GITLEAKS="$(command -v gitleaks 2>/dev/null)"
if [ -z "$GITLEAKS" ] && [ -n "$LOCALAPPDATA" ]; then
  for candidate in "$LOCALAPPDATA"/Microsoft/WinGet/Links/gitleaks.exe \
                   "$LOCALAPPDATA"/Microsoft/WinGet/Packages/Gitleaks.Gitleaks_*/gitleaks.exe; do
    if [ -x "$candidate" ]; then GITLEAKS="$candidate"; break; fi
  done
fi
if [ -n "$GITLEAKS" ] && ! "$GITLEAKS" version >/dev/null 2>&1; then
  echo "warning: $GITLEAKS is present but cannot execute (Application Control?); trying Docker." >&2
  GITLEAKS=""
fi
if [ -n "$GITLEAKS" ]; then
  "$GITLEAKS" git --pre-commit --staged --no-banner --config .gitleaks.toml || {
    echo "gitleaks: potential secret in staged changes - commit blocked." >&2
    exit 1
  }
elif command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
  MSYS_NO_PATHCONV=1 docker run --rm -v "$(pwd):/repo:ro" -w /repo zricethezav/gitleaks:latest \
    git --pre-commit --staged --no-banner --config .gitleaks.toml || {
    echo "gitleaks (docker): potential secret in staged changes - commit blocked." >&2
    exit 1
  }
else
  echo "warning: gitleaks unavailable (no working binary, no docker); secret scan skipped." >&2
fi
```

Create `templates/_blocks/gitignore.tmpl` (rendered between the markers; the engine adds the markers):

```gitignore
{{repoIgnoreLines}}
.ultrapowers/
.remember/
.playwright-mcp/
.firecrawl/
.temp/
.agents/mcp-secrets.env
*.local.*
.claude/settings.local.json
.mcp.local.json
*.ultrapowers-new
```

Create `templates/_blocks/gitattributes.tmpl`:

```gitattributes
.githooks/* text eol=lf
*.sh text eol=lf
*.ps1 text eol=lf
AGENTS.md text eol=lf
CLAUDE.md text eol=lf
GEMINI.md text eol=lf
.mcp.json text eol=lf
.codex/config.toml text eol=lf
.cursor/mcp.json text eol=lf
.gemini/settings.json text eol=lf
.qwen/settings.json text eol=lf
opencode.json text eol=lf
.factory/mcp.json text eol=lf
.kimi/mcp.json text eol=lf
.vscode/*.json text eol=lf
.claude/settings.json text eol=lf
.agents/*.json text eol=lf
```

- [ ] **Step 5: Write the template change manifest**

Create `templates/CHANGES.json`. Keys are target paths as the engine writes them (generated MCP files included, since upgrade mode reports them too); values are the plugin version in which that template or transform last changed:

```json
{
  "AGENTS.md": "1.0.0",
  "CLAUDE.md": "1.0.0",
  "GEMINI.md": "1.0.0",
  "README.md": "1.0.0",
  "tasks/README.md": "1.0.0",
  "specs/README.md": "1.0.0",
  "plans/README.md": "1.0.0",
  "reviews/README.md": "1.0.0",
  "evals/README.md": "1.0.0",
  "handbooks/README.md": "1.0.0",
  "brand-book/README.md": "1.0.0",
  "business/README.md": "1.0.0",
  "playbooks/README.md": "1.0.0",
  "release-notes/README.md": "1.0.0",
  ".mcp.json": "1.0.0",
  ".codex/config.toml": "1.0.0",
  ".cursor/mcp.json": "1.0.0",
  ".gemini/settings.json": "1.0.0",
  ".qwen/settings.json": "1.0.0",
  "opencode.json": "1.0.0",
  ".factory/mcp.json": "1.0.0",
  ".kimi/mcp.json": "1.0.0",
  ".vscode/mcp.json": "1.0.0",
  ".vscode/settings.json": "1.0.0",
  ".github/copilot-instructions.md": "1.0.0",
  ".claude/settings.json": "1.0.0",
  ".claude/output-styles/ste-explanatory.md": "1.0.0",
  ".agents/mcp-secrets.env.example": "1.0.0",
  ".gitleaks.toml": "1.0.0",
  ".githooks/pre-commit": "1.0.0",
  ".gitignore": "1.0.0",
  ".gitattributes": "1.0.0"
}
```

- [ ] **Step 6: Run the leak scan; it must now be fully green**

Run: `bash tests/init/test-templates-clean.sh`
Expected: every line `[PASS]`, `STATUS: PASSED`.

- [ ] **Step 7: Check the shell template parses**

Run: `sh -n templates/.githooks/pre-commit.tmpl && echo SYNTAX-OK`
Expected: `SYNTAX-OK`.

- [ ] **Step 8: Commit**

```bash
git add templates/.mcp.json templates/.agents templates/.claude templates/.gitleaks.toml.tmpl templates/.githooks templates/_blocks templates/CHANGES.json
git commit -m "feat(init): settings, canonical MCP, hygiene and config templates" -m ".mcp.json is the single MCP source with eight generic servers and \${VAR} secrets; the engine derives every other harness file from it. The settings template selects the STE output style and a read-mostly allow list. gitleaks, the pre-commit template and the managed gitignore and gitattributes blocks complete the hygiene payload." -m "RAOOF A."
```

---

### Task 4: Engine core: rendering, never-overwrite, managed blocks, nested detection, scaffold and detect modes

**Files:**
- Create: `skills/init/scripts/init.mjs`
- Create: `tests/init/test-engine.mjs`
- Create: `tests/init/run-tests.sh`

**Interfaces:**
- Consumes: every template from Tasks 1 to 3; `output-styles/ste-explanatory.md` from Task 2; `.claude-plugin/plugin.json` (`version`) as the plugin version.
- Produces (exported from `init.mjs`, used by Tasks 5, 6 and the tests):
  - `parseArgs(argv: string[]) -> Options` where `Options = { mode, root, name, harnesses, nestedPointers, recordRepos, apply, dryRun, date, platform }`
  - `render(template: string, vars: Record<string,string>, sourceName: string) -> string` (throws `InitError('unknown-placeholder')`)
  - `applyBlock(existing: string|null, body: string) -> { content: string, action: 'created'|'appended'|'replaced'|'unchanged' }`
  - `compareVersions(a: string, b: string) -> -1|0|1`
  - `detectRepos(root: string) -> Array<{ name, path, defaultBranch }>`
  - `readMarker(root: string) -> object|null` (throws `InitError('marker-corrupt')`)
  - `findMarkerAbove(dir: string) -> string|null`
  - `buildVars(opts, repos, harnesses, written) -> Record<string,string>`
  - `loadCanonicalMcp() -> { wrapper: string[], servers: Record<string, ServerSpec> }`
  - `generateMcpFiles(harnesses: string[], platform: string) -> Array<{ target, content }>` (returns `[]` until Task 5 fills `MCP_GENERATORS`)
  - `runScaffold(opts) -> Report`, `runDetect(opts) -> DetectReport`, `main(argv) -> exitCode`; `runJoin` and `runUpgrade` are stubs that throw `InitError('not-implemented')` until Task 6 replaces them
  - `planPayload(opts, repos, harnesses) -> { files: Array<{ target, content, executable }>, blocks: Array<{ target, body }>, omitted: string[], vars }` (renders everything, writes nothing); `applyPlan(root, plan, report, dryRun)`; `writeMarker(root, opts, repos, harnesses, written, dryRun, report)`; `saveMarker(root, marker, dryRun)`
  - `secretNames(root) -> string[]` (names in `.agents/mcp-secrets.env.example`), `missingSecrets(root, env = process.env) -> string[]` (unset or empty)
  - `gitConfigGet(root, key) -> string` (local scope; `''` when unset or on any git failure), `gitConfigSet(root, key, value)` (local scope; throws on failure)
  - `pluginVersion() -> string`, `readJson(file)`, `listTemplates()`, `BEST_EFFORT_TARGETS`
  - module-private helpers that Tasks 5 and 6 call from the same file: `provenance(target, content, vars)`, `writeFile(root, target, content, executable, dryRun)`, `readTemplate(source)`, `emptyReport(mode, opts)`, `lf(text)`, `TEMPLATES_DIR`
  - constants `PLUGIN_ROOT`, `MARKER_PATH`, `ALL_HARNESSES`, `KB_FOLDERS`, `TARGET_HARNESS`, `MCP_TARGETS`, `MCP_GENERATORS`, `BLOCK_START`, `BLOCK_END`
  - `Report = { mode, root, dryRun, written: string[], skipped: string[], omitted: string[], blocks: Array<{ path, action }>, repos, newRepos, changed, missingSecrets, hooksPath, nextSteps: string[] }`
  - `DetectReport = { mode: 'detect', root, rootName, markerPresent: boolean, marker: object|null|'corrupt', markerError: string|null, pluginVersion, suggestedMode: 'scaffold'|'join'|'upgrade'|'repair', repos, workspaceRoot: string|null, nodeVersion }`
  - The CLI entry runs `main` only when the file is the process entry point, compared through `fs.realpathSync` on both sides so a symlinked or junctioned plugin directory still runs.
  - CLI: `node init.mjs <scaffold|join|upgrade|detect> [--root DIR] [--name NAME] [--harnesses a,b] [--nested-pointers] [--record-repos] [--apply t1,t2|none] [--dry-run] [--date YYYY-MM-DD] [--platform win32|linux|darwin]`; JSON report on stdout; exit 0 on success, 2 on `InitError` (stdout carries `{ error: { code, message, ...extra } }`), 1 on any other failure.
  - Env override for tests: `ULTRAPOWERS_TEMPLATES_DIR` replaces the plugin's `templates/` directory.

- [ ] **Step 1: Write the failing engine tests**

Create `tests/init/test-engine.mjs`:

```javascript
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../..');
const ENGINE = path.join(repoRoot, 'skills', 'init', 'scripts', 'init.mjs');
const pluginVersion = JSON.parse(fs.readFileSync(path.join(repoRoot, '.claude-plugin', 'plugin.json'), 'utf8')).version;

const engine = await import(pathToFileURL(ENGINE).href);
const { render, applyBlock, compareVersions, InitError, KB_FOLDERS, BLOCK_START, BLOCK_END } = engine;

function tmpRepo(name = 'proj') {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'ultrapowers-init-'));
  const root = path.join(base, name);
  fs.mkdirSync(path.join(root, '.git'), { recursive: true });
  return root;
}

function run(args, { cwd, env = {}, expectExit = 0 } = {}) {
  let stdout;
  let status = 0;
  try {
    stdout = execFileSync(process.execPath, [ENGINE, ...args], {
      cwd: cwd ?? repoRoot,
      encoding: 'utf8',
      env: { ...process.env, ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (err) {
    status = err.status;
    stdout = err.stdout;
  }
  assert.equal(status, expectExit, `exit code for ${args.join(' ')}: ${stdout}`);
  return JSON.parse(stdout);
}

function listFiles(dir, prefix = '') {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.name === '.git') continue;
    if (entry.isDirectory()) out.push(...listFiles(path.join(dir, entry.name), rel));
    else out.push(rel);
  }
  return out.sort();
}

test('render substitutes every placeholder and leaves other braces alone', () => {
  const out = render('Hi {{name}} v{{pluginVersion}} {not} {{{name}}}', { name: 'demo', pluginVersion: '1.0.0' }, 'x.tmpl');
  assert.equal(out, 'Hi demo v1.0.0 {not} {demo}');
});

test('render throws InitError naming the template and the unknown key', () => {
  assert.throws(
    () => render('{{typo}}', { name: 'demo' }, 'BAD.md.tmpl'),
    (err) => err instanceof InitError && err.code === 'unknown-placeholder' && /BAD\.md\.tmpl/.test(err.message) && /typo/.test(err.message),
  );
});

test('compareVersions orders numerically', () => {
  assert.equal(compareVersions('1.0.0', '1.0.0'), 0);
  assert.equal(compareVersions('1.2.0', '1.10.0'), -1);
  assert.equal(compareVersions('2.0.0', '1.9.9'), 1);
});

test('applyBlock creates a file with the block when nothing exists', () => {
  const { content, action } = applyBlock(null, 'a/\nb/');
  assert.equal(action, 'created');
  assert.equal(content, `${BLOCK_START}\na/\nb/\n${BLOCK_END}\n`);
});

test('applyBlock appends to a gitignore without trailing newline on its own line', () => {
  const { content, action } = applyBlock('node_modules/', 'a/');
  assert.equal(action, 'appended');
  assert.equal(content, `node_modules/\n\n${BLOCK_START}\na/\n${BLOCK_END}\n`);
});

test('applyBlock replaces an existing block in place and keeps surrounding lines', () => {
  const existing = `top/\n${BLOCK_START}\nold/\n${BLOCK_END}\nbottom/\n`;
  const { content, action } = applyBlock(existing, 'new/');
  assert.equal(action, 'replaced');
  assert.equal(content, `top/\n${BLOCK_START}\nnew/\n${BLOCK_END}\nbottom/\n`);
});

test('applyBlock reports unchanged when the block is already current', () => {
  const existing = `${BLOCK_START}\nsame/\n${BLOCK_END}\n`;
  const { action } = applyBlock(existing, 'same/');
  assert.equal(action, 'unchanged');
});

test('applyBlock preserves CRLF endings of an existing file', () => {
  const { content } = applyBlock('one/\r\ntwo/\r\n', 'a/');
  assert.equal(content, `one/\r\ntwo/\r\n\r\n${BLOCK_START}\r\na/\r\n${BLOCK_END}\r\n`);
  assert.equal(content.includes('\n\n'), false, 'no bare LF inside a CRLF file');
});

test('detect on a fresh repo suggests scaffold and reports the folder name', () => {
  const root = tmpRepo('fresh-project');
  const report = run(['detect', '--root', root]);
  assert.equal(report.mode, 'detect');
  assert.equal(report.markerPresent, false);
  assert.equal(report.suggestedMode, 'scaffold');
  assert.equal(report.rootName, 'fresh-project');
  assert.equal(report.pluginVersion, pluginVersion);
  assert.deepEqual(report.repos, []);
});

test('scaffold on a fresh repo writes the baseline payload and the marker', () => {
  const root = tmpRepo();
  const report = run(['scaffold', '--root', root, '--name', 'Demo Project', '--date', '2026-09-30', '--platform', 'linux'], {
    env: { CONTEXT7_API_KEY: '' },
  });
  assert.equal(report.mode, 'scaffold');
  assert.equal(report.dryRun, false);
  for (const expected of [
    'AGENTS.md', 'CLAUDE.md', 'GEMINI.md', 'README.md',
    '.agents/mcp-secrets.env.example', '.claude/settings.json', '.claude/output-styles/ste-explanatory.md',
    '.gitleaks.toml', '.githooks/pre-commit', '.github/copilot-instructions.md', '.vscode/settings.json',
    '.gitignore', '.gitattributes',
  ]) {
    assert.ok(report.written.includes(expected), `written should include ${expected}`);
    assert.ok(fs.existsSync(path.join(root, expected)), `${expected} exists on disk`);
  }
  for (const kb of KB_FOLDERS) {
    assert.ok(report.written.includes(`${kb}/README.md`), `${kb}/README.md written`);
    assert.ok(report.written.includes(`${kb}/.gitkeep`), `${kb}/.gitkeep written`);
  }
  assert.deepEqual(report.skipped, []);
  assert.deepEqual(report.blocks.map((b) => b.action), ['created', 'created']);

  const marker = JSON.parse(fs.readFileSync(path.join(root, '.agents', 'ultrapowers.json'), 'utf8'));
  assert.equal(marker.name, 'Demo Project');
  assert.equal(marker.pluginVersion, pluginVersion);
  assert.equal(marker.scaffoldedAt, '2026-09-30');
  assert.equal(marker.topology, 'root');
  assert.deepEqual(marker.repos, []);
  assert.deepEqual(marker.kb, KB_FOLDERS);
  assert.equal(marker.harnesses.length, 14);
  assert.deepEqual([...marker.written].sort(), [...report.written].sort());
  assert.equal(marker.written.includes('.agents/ultrapowers.json'), false);

  const claude = fs.readFileSync(path.join(root, 'CLAUDE.md'), 'utf8');
  assert.equal(claude.split('\n')[0], '@AGENTS.md');
  const gemini = fs.readFileSync(path.join(root, 'GEMINI.md'), 'utf8');
  assert.equal(gemini.split('\n')[0], '@AGENTS.md');
  const agents = fs.readFileSync(path.join(root, 'AGENTS.md'), 'utf8');
  assert.match(agents.split('\n')[0], /^<!-- generated by ultrapowers init 1\.\d+\.\d+ on 2026-09-30; edit freely, init never overwrites this file -->$/);
  assert.match(agents, /^# Demo Project: instructions for coding agents$/m);
  assert.match(agents, /\.agents\/memory\//);
  assert.match(agents, /## Response style/);
  const hook = fs.readFileSync(path.join(root, '.githooks', 'pre-commit'), 'utf8').split('\n');
  assert.equal(hook[0], '#!/bin/sh');
  assert.match(hook[1], /^# generated by ultrapowers init/);
  const vscode = fs.readFileSync(path.join(root, '.vscode', 'settings.json'), 'utf8');
  assert.match(vscode.split('\n')[0], /^\/\/ generated by ultrapowers init/);
  const settings = JSON.parse(fs.readFileSync(path.join(root, '.claude', 'settings.json'), 'utf8'));
  assert.equal(settings.outputStyle, 'STE Explanatory');
  assert.deepEqual(settings.hooks, {});
  const style = fs.readFileSync(path.join(root, '.claude', 'output-styles', 'ste-explanatory.md'), 'utf8');
  assert.equal(style, fs.readFileSync(path.join(repoRoot, 'output-styles', 'ste-explanatory.md'), 'utf8').replace(/\r\n/g, '\n'));
  const gitignore = fs.readFileSync(path.join(root, '.gitignore'), 'utf8');
  assert.match(gitignore, new RegExp(`^${BLOCK_START}$`, 'm'));
  assert.match(gitignore, /^\.ultrapowers\/$/m);
  assert.match(gitignore, /^\.agents\/mcp-secrets\.env$/m);
  assert.doesNotMatch(gitignore, /^\s*$\n^\.ultrapowers/m, 'no blank line left by the empty repo list');

  for (const rel of listFiles(root)) {
    const text = fs.readFileSync(path.join(root, rel), 'utf8');
    assert.equal(text.includes('{{'), false, `${rel} still contains a placeholder`);
    assert.equal(text.includes('\r'), false, `${rel} must be LF`);
  }
  assert.ok(report.nextSteps.some((s) => s.includes('core.hooksPath')));
  assert.ok(report.nextSteps.some((s) => s.includes('CONTEXT7_API_KEY')));
});

test('scaffold a second time writes nothing and reports every file as skipped', () => {
  const root = tmpRepo();
  const first = run(['scaffold', '--root', root, '--name', 'Demo', '--platform', 'linux']);
  const before = listFiles(root).map((rel) => [rel, fs.readFileSync(path.join(root, rel))]);
  const second = run(['scaffold', '--root', root, '--name', 'Demo', '--platform', 'linux']);
  assert.deepEqual(second.written, []);
  assert.deepEqual([...second.skipped].sort(), [...first.written.filter((p) => p !== '.gitignore' && p !== '.gitattributes'), '.agents/ultrapowers.json'].sort());
  assert.deepEqual(second.blocks.map((b) => b.action), ['unchanged', 'unchanged']);
  for (const [rel, bytes] of before) {
    assert.ok(fs.readFileSync(path.join(root, rel)).equals(bytes), `${rel} unchanged`);
  }
});

test('a pre-existing AGENTS.md stays byte-identical and is reported skipped', () => {
  const root = tmpRepo();
  const custom = '# My own rules\r\n\r\nDo not touch.\r\n';
  fs.writeFileSync(path.join(root, 'AGENTS.md'), custom);
  const report = run(['scaffold', '--root', root, '--name', 'Demo', '--platform', 'linux']);
  assert.ok(report.skipped.includes('AGENTS.md'));
  assert.equal(report.written.includes('AGENTS.md'), false);
  assert.equal(fs.readFileSync(path.join(root, 'AGENTS.md'), 'utf8'), custom);
  const marker = JSON.parse(fs.readFileSync(path.join(root, '.agents', 'ultrapowers.json'), 'utf8'));
  assert.equal(marker.written.includes('AGENTS.md'), false);
});

test('dry-run writes nothing and lists what scaffold would write', () => {
  const root = tmpRepo();
  const report = run(['scaffold', '--root', root, '--name', 'Demo', '--dry-run', '--platform', 'linux']);
  assert.equal(report.dryRun, true);
  assert.ok(report.written.includes('AGENTS.md'));
  assert.deepEqual(listFiles(root), []);
});

test('harness filter omits files of unselected harnesses', () => {
  const root = tmpRepo();
  const report = run(['scaffold', '--root', root, '--name', 'Demo', '--harnesses', 'codex,cursor', '--platform', 'linux']);
  assert.equal(report.written.includes('CLAUDE.md'), false);
  assert.equal(report.written.includes('GEMINI.md'), false);
  assert.equal(report.written.includes('.claude/settings.json'), false);
  assert.ok(report.omitted.includes('CLAUDE.md'));
  assert.ok(report.omitted.includes('GEMINI.md'));
  assert.ok(report.written.includes('AGENTS.md'));
  const marker = JSON.parse(fs.readFileSync(path.join(root, '.agents', 'ultrapowers.json'), 'utf8'));
  assert.deepEqual(marker.harnesses, ['codex', 'cursor']);
});

test('unknown harness id is rejected before anything is written', () => {
  const root = tmpRepo();
  const report = run(['scaffold', '--root', root, '--harnesses', 'codex,emacs'], { expectExit: 2 });
  assert.equal(report.error.code, 'bad-args');
  assert.deepEqual(listFiles(root), []);
});

test('nested clones are detected, gitignored, recorded, and get pointers only on opt-in', () => {
  const root = tmpRepo('workspace');
  for (const repo of ['svc-api', 'web-app']) {
    fs.mkdirSync(path.join(root, repo, '.git'), { recursive: true });
    fs.writeFileSync(path.join(root, repo, '.git', 'HEAD'), 'ref: refs/heads/develop\n');
  }
  fs.mkdirSync(path.join(root, 'not-a-repo'));
  const report = run(['scaffold', '--root', root, '--name', 'WS', '--platform', 'linux']);
  assert.deepEqual(report.repos, [
    { name: 'svc-api', path: 'svc-api', defaultBranch: 'develop' },
    { name: 'web-app', path: 'web-app', defaultBranch: 'develop' },
  ]);
  const marker = JSON.parse(fs.readFileSync(path.join(root, '.agents', 'ultrapowers.json'), 'utf8'));
  assert.equal(marker.topology, 'nested');
  assert.equal(marker.repos.length, 2);
  const gitignore = fs.readFileSync(path.join(root, '.gitignore'), 'utf8');
  assert.match(gitignore, /^\/svc-api\/$/m);
  assert.match(gitignore, /^\/web-app\/$/m);
  assert.equal(fs.existsSync(path.join(root, 'svc-api', 'AGENTS.md')), false, 'no pointer without opt-in');
  const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');
  assert.match(readme, /`svc-api\/`/);

  const root2 = tmpRepo('workspace2');
  fs.mkdirSync(path.join(root2, 'svc-api', '.git'), { recursive: true });
  fs.writeFileSync(path.join(root2, 'svc-api', 'AGENTS.md'), 'keep me\n');
  fs.mkdirSync(path.join(root2, 'web-app', '.git'), { recursive: true });
  const report2 = run(['scaffold', '--root', root2, '--name', 'WS', '--nested-pointers', '--platform', 'linux']);
  assert.ok(report2.written.includes('web-app/AGENTS.md'));
  assert.ok(report2.skipped.includes('svc-api/AGENTS.md'));
  assert.equal(fs.readFileSync(path.join(root2, 'svc-api', 'AGENTS.md'), 'utf8'), 'keep me\n');
  const pointer = fs.readFileSync(path.join(root2, 'web-app', 'AGENTS.md'), 'utf8');
  assert.match(pointer, /^# web-app$/m);
  assert.match(pointer, /\.\.\/\.agents\/memory\//);
  assert.match(pointer, /`WS` workspace/);
});

test('scaffold inside a nested clone refuses and names the workspace root', () => {
  const root = tmpRepo('workspace');
  run(['scaffold', '--root', root, '--name', 'WS', '--platform', 'linux']);
  const clone = path.join(root, 'svc-api');
  fs.mkdirSync(path.join(clone, '.git'), { recursive: true });
  const report = run(['scaffold', '--root', clone, '--name', 'svc-api'], { expectExit: 2 });
  assert.equal(report.error.code, 'nested-clone');
  assert.equal(path.resolve(report.error.workspaceRoot), path.resolve(root));
  assert.deepEqual(listFiles(clone), []);
});

test('an unknown placeholder aborts before any file is written', () => {
  const root = tmpRepo();
  const templatesCopy = fs.mkdtempSync(path.join(os.tmpdir(), 'ultrapowers-templates-'));
  fs.cpSync(path.join(repoRoot, 'templates'), templatesCopy, { recursive: true });
  fs.writeFileSync(path.join(templatesCopy, 'BAD.md.tmpl'), 'oops {{typo}}\n');
  const report = run(['scaffold', '--root', root, '--name', 'Demo', '--platform', 'linux'], {
    env: { ULTRAPOWERS_TEMPLATES_DIR: templatesCopy },
    expectExit: 2,
  });
  assert.equal(report.error.code, 'unknown-placeholder');
  assert.match(report.error.message, /BAD\.md\.tmpl/);
  assert.deepEqual(listFiles(root), []);
});

test('existing gitignore without trailing newline and CRLF gitattributes both gain a clean block', () => {
  const root = tmpRepo();
  fs.writeFileSync(path.join(root, '.gitignore'), 'node_modules/');
  fs.writeFileSync(path.join(root, '.gitattributes'), '*.png binary\r\n');
  run(['scaffold', '--root', root, '--name', 'Demo', '--platform', 'linux']);
  const gitignore = fs.readFileSync(path.join(root, '.gitignore'), 'utf8');
  assert.ok(gitignore.startsWith(`node_modules/\n\n${BLOCK_START}\n`));
  const attrs = fs.readFileSync(path.join(root, '.gitattributes'), 'utf8');
  assert.ok(attrs.startsWith(`*.png binary\r\n\r\n${BLOCK_START}\r\n`));
  assert.equal(/[^\r]\n/.test(attrs), false, 'gitattributes stays CRLF throughout');
});

test('a corrupt marker is reported as marker-corrupt by detect', () => {
  const root = tmpRepo();
  fs.mkdirSync(path.join(root, '.agents'));
  fs.writeFileSync(path.join(root, '.agents', 'ultrapowers.json'), '{ "name": "x", ');
  const report = run(['detect', '--root', root]);
  assert.equal(report.markerPresent, true);
  assert.equal(report.marker, 'corrupt');
  assert.equal(report.suggestedMode, 'repair');
  assert.match(report.markerError, /not valid JSON/);
});

test('the engine runs when invoked through a symlinked or junctioned plugin directory', () => {
  const root = tmpRepo();
  const linkBase = fs.mkdtempSync(path.join(os.tmpdir(), 'ultrapowers-link-'));
  const linkedScripts = path.join(linkBase, 'scripts');
  fs.symlinkSync(path.dirname(ENGINE), linkedScripts, 'junction');
  const stdout = execFileSync(process.execPath, [path.join(linkedScripts, 'init.mjs'), 'detect', '--root', root], { encoding: 'utf8' });
  assert.equal(JSON.parse(stdout).suggestedMode, 'scaffold');
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `node --test tests/init/test-engine.mjs`
Expected: the import of `skills/init/scripts/init.mjs` fails with `ERR_MODULE_NOT_FOUND`; every test reports as failed.

- [ ] **Step 3: Write the engine**

Create `skills/init/scripts/init.mjs`:

```javascript
#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
export const PLUGIN_ROOT = path.resolve(SCRIPT_DIR, '..', '..', '..');
const TEMPLATES_DIR = process.env.ULTRAPOWERS_TEMPLATES_DIR
  ? path.resolve(process.env.ULTRAPOWERS_TEMPLATES_DIR)
  : path.join(PLUGIN_ROOT, 'templates');
const OUTPUT_STYLE_SOURCE = path.join(PLUGIN_ROOT, 'output-styles', 'ste-explanatory.md');
const OUTPUT_STYLE_TARGET = '.claude/output-styles/ste-explanatory.md';
export const MARKER_PATH = '.agents/ultrapowers.json';
export const BLOCK_START = '# >>> ultrapowers';
export const BLOCK_END = '# <<< ultrapowers';
const SPECIAL_DIRS = new Set(['_blocks', '_nested']);
const NON_TEMPLATE_FILES = new Set(['.mcp.json', 'CHANGES.json']);
const MODES = ['scaffold', 'join', 'upgrade', 'detect'];

export const ALL_HARNESSES = [
  'claude-code', 'codex', 'cursor', 'copilot', 'gemini', 'qwen', 'opencode',
  'factory', 'kimi', 'devin', 'antigravity', 'hermes', 'pi', 'muse',
];
export const KB_FOLDERS = [
  'tasks', 'specs', 'plans', 'reviews', 'evals', 'handbooks',
  'brand-book', 'business', 'playbooks', 'release-notes',
];
export const BEST_EFFORT_TARGETS = ['.factory/mcp.json', '.kimi/mcp.json'];

export const TARGET_HARNESS = {
  'CLAUDE.md': 'claude-code',
  '.mcp.json': 'claude-code',
  '.claude/settings.json': 'claude-code',
  [OUTPUT_STYLE_TARGET]: 'claude-code',
  '.codex/config.toml': 'codex',
  '.cursor/mcp.json': 'cursor',
  '.github/copilot-instructions.md': 'copilot',
  '.vscode/settings.json': 'copilot',
  '.vscode/mcp.json': 'copilot',
  'GEMINI.md': 'gemini',
  '.gemini/settings.json': 'gemini',
  '.qwen/settings.json': 'qwen',
  'opencode.json': 'opencode',
  '.factory/mcp.json': 'factory',
  '.kimi/mcp.json': 'kimi',
};

export const MCP_TARGETS = {
  '.mcp.json': 'claude',
  '.codex/config.toml': 'codex',
  '.cursor/mcp.json': 'cursor',
  '.gemini/settings.json': 'gemini',
  '.qwen/settings.json': 'qwen',
  'opencode.json': 'opencode',
  '.factory/mcp.json': 'factory',
  '.kimi/mcp.json': 'kimi',
  '.vscode/mcp.json': 'vscode',
};

export const MCP_GENERATORS = {};

export class InitError extends Error {
  constructor(code, message, extra = {}) {
    super(message);
    this.code = code;
    this.extra = extra;
  }
}

export function parseArgs(argv) {
  const opts = {
    mode: argv[0],
    root: process.cwd(),
    name: null,
    harnesses: null,
    nestedPointers: false,
    recordRepos: false,
    apply: null,
    dryRun: false,
    date: new Date().toISOString().slice(0, 10),
    platform: process.platform,
  };
  if (!MODES.includes(opts.mode)) {
    throw new InitError('bad-args', `mode must be one of ${MODES.join(', ')}`);
  }
  for (let i = 1; i < argv.length; i += 1) {
    const arg = argv[i];
    const value = () => {
      i += 1;
      if (i >= argv.length) throw new InitError('bad-args', `${arg} needs a value`);
      return argv[i];
    };
    switch (arg) {
      case '--root': opts.root = path.resolve(value()); break;
      case '--name': opts.name = value(); break;
      case '--harnesses': opts.harnesses = value().split(',').map((s) => s.trim()).filter(Boolean); break;
      case '--nested-pointers': opts.nestedPointers = true; break;
      case '--record-repos': opts.recordRepos = true; break;
      case '--apply': opts.apply = value().split(',').map((s) => s.trim()).filter((s) => s && s !== 'none'); break;
      case '--dry-run': opts.dryRun = true; break;
      case '--date': opts.date = value(); break;
      case '--platform': opts.platform = value(); break;
      default: throw new InitError('bad-args', `unknown argument ${arg}`);
    }
  }
  if (opts.harnesses) {
    const unknown = opts.harnesses.filter((h) => !ALL_HARNESSES.includes(h));
    if (unknown.length) throw new InitError('bad-args', `unknown harness: ${unknown.join(', ')}`);
  }
  return opts;
}

export function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

export function pluginVersion() {
  return readJson(path.join(PLUGIN_ROOT, '.claude-plugin', 'plugin.json')).version;
}

export function compareVersions(a, b) {
  const pa = String(a).split('.').map((n) => parseInt(n, 10) || 0);
  const pb = String(b).split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i += 1) {
    const x = pa[i] ?? 0;
    const y = pb[i] ?? 0;
    if (x < y) return -1;
    if (x > y) return 1;
  }
  return 0;
}

export function render(template, vars, sourceName) {
  return template.replace(/\{\{([A-Za-z][A-Za-z0-9]*)\}\}/g, (_, key) => {
    if (!Object.prototype.hasOwnProperty.call(vars, key)) {
      throw new InitError('unknown-placeholder', `template ${sourceName} uses unknown placeholder {{${key}}}`, { template: sourceName, key });
    }
    return vars[key];
  });
}

function lf(text) {
  return text.replace(/\r\n/g, '\n');
}

function provenance(target, content, vars) {
  const line = `generated by ultrapowers init ${vars.pluginVersion} on ${vars.date}; edit freely, init never overwrites this file`;
  const base = path.posix.basename(target);
  if (target.endsWith('.md')) {
    if (content.startsWith('@') || content.startsWith('---')) return content;
    return `<!-- ${line} -->\n${content}`;
  }
  if (target.endsWith('.toml') || base.endsWith('.example')) return `# ${line}\n${content}`;
  if (base === 'pre-commit' && content.startsWith('#!')) {
    const nl = content.indexOf('\n');
    return `${content.slice(0, nl + 1)}# ${line}\n${content.slice(nl + 1)}`;
  }
  if (target.startsWith('.vscode/')) return `// ${line}\n${content}`;
  return content;
}

export function applyBlock(existing, body) {
  const trimmedBody = body.replace(/^\n+/, '').replace(/\n+$/, '');
  const block = `${BLOCK_START}\n${trimmedBody}\n${BLOCK_END}\n`;
  if (existing === null || existing === undefined) {
    return { content: block, action: 'created' };
  }
  const eol = existing.includes('\r\n') ? '\r\n' : '\n';
  const text = lf(existing);
  const startIdx = text.indexOf(BLOCK_START);
  const endIdx = text.indexOf(BLOCK_END);
  let next;
  let action;
  if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
    const afterEnd = text.indexOf('\n', endIdx);
    const tail = afterEnd === -1 ? '' : text.slice(afterEnd + 1);
    next = `${text.slice(0, startIdx)}${block}${tail}`;
    action = next === text ? 'unchanged' : 'replaced';
  } else {
    let head = text;
    if (head.length > 0 && !head.endsWith('\n')) head += '\n';
    if (head.length > 0) head += '\n';
    next = `${head}${block}`;
    action = 'appended';
  }
  return { content: eol === '\n' ? next : next.replace(/\n/g, eol), action };
}

function defaultBranchOf(repoDir) {
  try {
    const head = fs.readFileSync(path.join(repoDir, '.git', 'HEAD'), 'utf8').trim();
    const match = head.match(/^ref: refs\/heads\/(.+)$/);
    if (match) return match[1];
  } catch {
    return 'main';
  }
  return 'main';
}

export function detectRepos(root) {
  const repos = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith('.') || entry.name === 'node_modules') continue;
    if (!fs.existsSync(path.join(root, entry.name, '.git'))) continue;
    repos.push({ name: entry.name, path: entry.name, defaultBranch: defaultBranchOf(path.join(root, entry.name)) });
  }
  return repos.sort((a, b) => a.name.localeCompare(b.name));
}

export function readMarker(root) {
  const file = path.join(root, MARKER_PATH);
  if (!fs.existsSync(file)) return null;
  try {
    return readJson(file);
  } catch (err) {
    throw new InitError('marker-corrupt', `${MARKER_PATH} is not valid JSON: ${err.message}`, { path: file });
  }
}

export function findMarkerAbove(dir) {
  let current = path.resolve(dir);
  while (true) {
    const parent = path.dirname(current);
    if (parent === current) return null;
    if (fs.existsSync(path.join(parent, MARKER_PATH))) return parent;
    current = parent;
  }
}

export function loadCanonicalMcp() {
  const canonical = readJson(path.join(TEMPLATES_DIR, '.mcp.json'));
  return {
    wrapper: canonical._ultrapowers?.windowsNpxWrapper ?? [],
    servers: canonical.mcpServers ?? {},
  };
}

export function generateMcpFiles(harnesses, platform) {
  const { wrapper, servers } = loadCanonicalMcp();
  const files = [];
  for (const [target, schema] of Object.entries(MCP_TARGETS)) {
    const generator = MCP_GENERATORS[schema];
    if (!generator) continue;
    if (!harnesses.includes(TARGET_HARNESS[target])) continue;
    const wrap = platform === 'win32' && wrapper.includes(schema);
    files.push({ target, content: generator(servers, { wrap }) });
  }
  return files;
}

export function listTemplates() {
  const out = [];
  const walk = (dir, rel) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (entry.isDirectory()) {
        if (rel === '' && SPECIAL_DIRS.has(entry.name)) continue;
        walk(path.join(dir, entry.name), rel ? `${rel}/${entry.name}` : entry.name);
        continue;
      }
      if (rel === '' && NON_TEMPLATE_FILES.has(entry.name)) continue;
      const target = `${rel ? `${rel}/` : ''}${entry.name.replace(/\.tmpl$/, '')}`;
      out.push({ target, source: path.join(dir, entry.name) });
    }
  };
  walk(TEMPLATES_DIR, '');
  return out;
}

export function buildVars(opts, repos, harnesses, written) {
  const version = pluginVersion();
  const topology = repos.length ? 'nested' : 'root';
  return {
    name: opts.name ?? path.basename(opts.root),
    pluginVersion: version,
    date: opts.date,
    topology,
    repos: repos.length ? repos.map((r) => r.name).join(', ') : 'none',
    repoIgnoreLines: repos.map((r) => `/${r.path}/`).join('\n'),
    repoGuideLines: repos.length
      ? repos.map((r) => `- \`${r.path}/\` (default branch \`${r.defaultBranch}\`): nested clone, gitignored`).join('\n')
      : 'No nested clones detected at scaffold time.',
    harnesses: harnesses.join(', '),
    reposJson: JSON.stringify(repos),
    harnessesJson: JSON.stringify(harnesses),
    kbJson: JSON.stringify(KB_FOLDERS),
    writtenJson: JSON.stringify([...written].sort()),
  };
}

function readTemplate(source) {
  return lf(fs.readFileSync(source, 'utf8'));
}

function emptyReport(mode, opts) {
  return {
    mode,
    root: opts.root,
    dryRun: opts.dryRun,
    written: [],
    skipped: [],
    omitted: [],
    blocks: [],
    repos: [],
    newRepos: [],
    changed: [],
    missingSecrets: [],
    hooksPath: 'skipped',
    nextSteps: [],
  };
}

export function planPayload(opts, repos, harnesses) {
  const vars = buildVars(opts, repos, harnesses, []);
  const files = [];
  const omitted = [];
  for (const { target, source } of listTemplates()) {
    const owner = TARGET_HARNESS[target];
    if (owner && !harnesses.includes(owner)) {
      omitted.push(target);
      continue;
    }
    if (target === MARKER_PATH) continue;
    const rendered = render(readTemplate(source), vars, path.relative(TEMPLATES_DIR, source));
    files.push({ target, content: provenance(target, rendered, vars), executable: path.posix.basename(target) === 'pre-commit' });
  }
  if (harnesses.includes(TARGET_HARNESS[OUTPUT_STYLE_TARGET])) {
    files.push({ target: OUTPUT_STYLE_TARGET, content: readTemplate(OUTPUT_STYLE_SOURCE), executable: false });
  } else {
    omitted.push(OUTPUT_STYLE_TARGET);
  }
  for (const { target, content } of generateMcpFiles(harnesses, opts.platform)) {
    files.push({ target, content, executable: false });
  }
  for (const [target, owner] of Object.entries(TARGET_HARNESS)) {
    if (MCP_TARGETS[target] && !harnesses.includes(owner) && !omitted.includes(target)) omitted.push(target);
  }
  if (opts.nestedPointers) {
    const pointerSource = path.join(TEMPLATES_DIR, '_nested', 'AGENTS.md.tmpl');
    const pointerTemplate = readTemplate(pointerSource);
    for (const repo of repos) {
      const rendered = render(pointerTemplate, { ...vars, repo: repo.name }, '_nested/AGENTS.md.tmpl');
      files.push({ target: `${repo.path}/AGENTS.md`, content: provenance('AGENTS.md', rendered, vars), executable: false });
    }
  }
  const blocks = [
    { target: '.gitignore', body: render(readTemplate(path.join(TEMPLATES_DIR, '_blocks', 'gitignore.tmpl')), vars, '_blocks/gitignore.tmpl') },
    { target: '.gitattributes', body: render(readTemplate(path.join(TEMPLATES_DIR, '_blocks', 'gitattributes.tmpl')), vars, '_blocks/gitattributes.tmpl') },
  ];
  return { files, blocks, omitted: omitted.sort(), vars };
}

function writeFile(root, target, content, executable, dryRun) {
  const full = path.join(root, target);
  if (dryRun) return;
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content, 'utf8');
  if (executable) {
    try { fs.chmodSync(full, 0o755); } catch { /* Windows has no mode bits */ }
  }
}

export function applyPlan(root, plan, report, dryRun) {
  for (const file of plan.files) {
    const full = path.join(root, file.target);
    if (fs.existsSync(full)) {
      report.skipped.push(file.target);
      continue;
    }
    writeFile(root, file.target, file.content, file.executable, dryRun);
    report.written.push(file.target);
  }
  for (const block of plan.blocks) {
    const full = path.join(root, block.target);
    const existing = fs.existsSync(full) ? fs.readFileSync(full, 'utf8') : null;
    const { content, action } = applyBlock(existing, block.body);
    if (action !== 'unchanged') {
      writeFile(root, block.target, content, false, dryRun);
      report.written.push(block.target);
    }
    report.blocks.push({ path: block.target, action });
  }
  report.omitted.push(...plan.omitted);
}

export function writeMarker(root, opts, repos, harnesses, written, dryRun, report) {
  const full = path.join(root, MARKER_PATH);
  if (fs.existsSync(full)) {
    report.skipped.push(MARKER_PATH);
    return;
  }
  const source = path.join(TEMPLATES_DIR, '.agents', 'ultrapowers.json.tmpl');
  const vars = buildVars(opts, repos, harnesses, written);
  const content = render(readTemplate(source), vars, '.agents/ultrapowers.json.tmpl');
  JSON.parse(content);
  writeFile(root, MARKER_PATH, content, false, dryRun);
}

export function saveMarker(root, marker, dryRun) {
  if (dryRun) return;
  fs.writeFileSync(path.join(root, MARKER_PATH), `${JSON.stringify(marker, null, 2)}\n`, 'utf8');
}

export function secretNames(root) {
  const file = path.join(root, '.agents', 'mcp-secrets.env.example');
  if (!fs.existsSync(file)) return [];
  return lf(fs.readFileSync(file, 'utf8')).split('\n')
    .map((line) => line.match(/^([A-Z][A-Z0-9_]*)=/))
    .filter(Boolean)
    .map((m) => m[1]);
}

export function missingSecrets(root, env = process.env) {
  return secretNames(root).filter((name) => !env[name]);
}

function scaffoldNextSteps(opts, report, repos) {
  const steps = [
    'Run once per clone: git config core.hooksPath .githooks',
  ];
  const secrets = missingSecrets(opts.root);
  if (secrets.length) {
    steps.push(`Define these variables in your user environment (see .agents/mcp-secrets.env.example): ${secrets.join(', ')}`);
  }
  steps.push('Approve the project MCP servers when your harness prompts for them.');
  if (opts.platform === 'win32') {
    steps.push('After the first git add, run: git update-index --chmod=+x .githooks/pre-commit');
  }
  if (repos.length) {
    steps.push(`Nested clones detected and ignored by the managed .gitignore block: ${repos.map((r) => r.name).join(', ')}`);
  }
  const bestEffort = BEST_EFFORT_TARGETS.filter((t) => report.written.includes(t));
  if (bestEffort.length) {
    steps.push(`Best-effort files, verify against the vendor docs: ${bestEffort.join(', ')}`);
  }
  steps.push('Review the written files, then commit the scaffold.');
  return steps;
}

export function runScaffold(opts) {
  const report = emptyReport('scaffold', opts);
  if (!fs.existsSync(opts.root) || !fs.statSync(opts.root).isDirectory()) {
    throw new InitError('bad-root', `${opts.root} is not a directory`);
  }
  const existingMarker = readMarker(opts.root);
  if (!existingMarker) {
    const workspaceRoot = findMarkerAbove(opts.root);
    if (workspaceRoot) {
      throw new InitError('nested-clone', `${opts.root} sits inside the ultrapowers workspace ${workspaceRoot}; run init from that root`, { workspaceRoot });
    }
  }
  const harnesses = existingMarker?.harnesses ?? opts.harnesses ?? [...ALL_HARNESSES];
  if (!opts.name && existingMarker?.name) opts.name = existingMarker.name;
  const repos = detectRepos(opts.root);
  report.repos = repos;
  const plan = planPayload(opts, repos, harnesses);
  applyPlan(opts.root, plan, report, opts.dryRun);
  writeMarker(opts.root, opts, repos, harnesses, report.written, opts.dryRun, report);
  report.written.sort();
  report.skipped.sort();
  report.nextSteps = scaffoldNextSteps(opts, report, repos);
  return report;
}

export function runDetect(opts) {
  const version = pluginVersion();
  let marker = null;
  let markerState = 'absent';
  let markerError = null;
  try {
    marker = readMarker(opts.root);
    if (marker) markerState = 'present';
  } catch (err) {
    if (!(err instanceof InitError && err.code === 'marker-corrupt')) throw err;
    markerState = 'corrupt';
    markerError = err.message;
  }
  let suggestedMode = 'scaffold';
  if (markerState === 'corrupt') suggestedMode = 'repair';
  else if (marker) suggestedMode = compareVersions(marker.pluginVersion ?? '0.0.0', version) < 0 ? 'upgrade' : 'join';
  return {
    mode: 'detect',
    root: opts.root,
    rootName: path.basename(opts.root),
    markerPresent: markerState !== 'absent',
    marker: markerState === 'corrupt' ? 'corrupt' : marker,
    markerError,
    pluginVersion: version,
    suggestedMode,
    repos: fs.existsSync(opts.root) ? detectRepos(opts.root) : [],
    workspaceRoot: findMarkerAbove(opts.root),
    nodeVersion: process.version,
  };
}

export function runJoin(opts) {
  throw new InitError('not-implemented', `${opts.mode} mode is not implemented yet`);
}

export function runUpgrade(opts) {
  throw new InitError('not-implemented', `${opts.mode} mode is not implemented yet`);
}

export function main(argv) {
  try {
    const opts = parseArgs(argv);
    const runners = { scaffold: runScaffold, detect: runDetect, join: runJoin, upgrade: runUpgrade };
    const report = runners[opts.mode](opts);
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return 0;
  } catch (err) {
    if (err instanceof InitError) {
      process.stdout.write(`${JSON.stringify({ error: { code: err.code, message: err.message, ...err.extra } }, null, 2)}\n`);
      return 2;
    }
    process.stderr.write(`${err.stack ?? err}\n`);
    return 1;
  }
}

export function gitConfigGet(root, key) {
  try {
    return execFileSync('git', ['config', '--local', '--get', key], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return '';
  }
}

export function gitConfigSet(root, key, value) {
  execFileSync('git', ['config', '--local', key, value], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
}

function invokedDirectly() {
  if (!process.argv[1]) return false;
  try {
    return fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (invokedDirectly()) {
  process.exitCode = main(process.argv.slice(2));
}
```

- [ ] **Step 4: Run the engine tests**

Run: `node --test tests/init/test-engine.mjs`
Expected: all 21 tests pass. If `scaffold a second time` fails on `.gitignore`, check that `applyBlock` returns `unchanged` when the rendered block equals the existing one (the comparison is on LF-normalized text).

- [ ] **Step 5: Add the init suite runner**

Create `tests/init/run-tests.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$REPO_ROOT"

echo "== init: template leak scan"
bash tests/init/test-templates-clean.sh

echo "== init: engine"
node --test tests/init/test-engine.mjs

for extra in tests/init/test-mcp-transforms.mjs tests/init/test-modes.mjs tests/init/test-nudge-injectors.mjs; do
  if [ -f "$extra" ]; then
    echo "== init: $(basename "$extra" .mjs)"
    node --test "$extra"
  fi
done

if [ -f tests/init/test-skill-structure.sh ]; then
  echo "== init: skill structure"
  bash tests/init/test-skill-structure.sh
fi

echo "STATUS: PASSED"
```

Run: `bash tests/init/run-tests.sh`
Expected: leak scan `STATUS: PASSED`, engine tests pass, final `STATUS: PASSED`.

- [ ] **Step 6: Lint the new shell files**

Run: `bash scripts/lint-shell.sh tests/init/run-tests.sh tests/init/test-templates-clean.sh`
Expected: `Linting 2 shell files` and no findings.

- [ ] **Step 7: Commit**

```bash
git add skills/init/scripts/init.mjs tests/init/test-engine.mjs tests/init/run-tests.sh
git commit -m "feat(init): scaffold engine with rendering, blocks and nested detection" -m "Node standard library only. Renders every template before the first write so an unknown placeholder aborts cleanly, never overwrites an existing file, manages a marked block in .gitignore and .gitattributes while preserving the file's line endings, detects nested clones one level down, refuses to scaffold inside one, and reports JSON on stdout." -m "RAOOF A."
```

---

### Task 5: MCP generators for every harness schema

**Files:**
- Modify: `skills/init/scripts/init.mjs` (the `MCP_GENERATORS` line, one line in `generateMcpFiles`, one line in `planPayload`)
- Create: `tests/init/toml-mini.mjs`
- Create: `tests/init/test-mcp-transforms.mjs`

**Interfaces:**
- Consumes: the canonical shape from Task 3 (`mcpServers.<id>` is `{ type: 'stdio', command, args, env }` or `{ type: 'http', url, headers? }`; `_ultrapowers.windowsNpxWrapper` lists schema ids). From Task 4: `MCP_TARGETS` (target path to schema id), `TARGET_HARNESS`, `loadCanonicalMcp()`, `generateMcpFiles(harnesses, platform)` (already calls `MCP_GENERATORS[schema](servers, { wrap })` with `wrap = platform === 'win32' && wrapper.includes(schema)`), `planPayload` (already pushes every generated file into the plan, so generated files are written or skipped exactly like templates), the module-private `provenance(target, content, vars)`, and `InitError`.
- Produces:
  - `MCP_GENERATORS: Record<'claude'|'codex'|'cursor'|'gemini'|'qwen'|'opencode'|'factory'|'kimi'|'vscode', (servers, { wrap: boolean }) => string>`: pure functions; each returns the complete file text, ending in a newline.
  - `validateServers(servers)`: throws `InitError('mcp-schema', message, { server })` for a server that is neither stdio nor http.
  - `CODEX_DEFAULTS = { approval_policy: 'on-request', sandbox_mode: 'workspace-write' }`, `CONTEXT_FILES = { gemini: ['GEMINI.md', 'AGENTS.md'], qwen: ['QWEN.md', 'AGENTS.md'] }`.
  - `tests/init/toml-mini.mjs` exports `parseToml(text) -> object`: tables with bare, quoted and dotted keys, basic and literal strings, single-line arrays, booleans, integers, full-line and trailing comments. Anything else throws `SyntaxError`. It only needs to read what the codex generator writes.

Schema decisions (one generator owns each file; no template targets any of these paths, so `context.fileName` in the Gemini and Qwen settings is written by their generators and there is nothing to merge):

| Schema | Target | stdio entry | http entry | Secret reference |
|--------|--------|-------------|------------|------------------|
| `claude`, `factory`, `kimi` | `.mcp.json`, `.factory/mcp.json`, `.kimi/mcp.json` | `{ type: 'stdio', command, args, env }` | `{ type: 'http', url, headers }` | `${VAR}` |
| `cursor` | `.cursor/mcp.json` | `{ type: 'stdio', command, args, env }` | `{ url, headers }` | `${env:VAR}` |
| `gemini`, `qwen` | `.gemini/settings.json`, `.qwen/settings.json` | `{ command, args, env }` | `{ httpUrl, headers }` | `${VAR}` |
| `opencode` | `opencode.json` | `{ type: 'local', command: [cmd, ...args], environment, enabled: true }` | `{ type: 'remote', url, headers, enabled: true }` | `{env:VAR}` |
| `vscode` | `.vscode/mcp.json` | `{ type: 'stdio', command, args, env }` under `servers` | `{ type: 'http', url, headers }` | `${input:<var-in-kebab-case>}` plus one `promptString` input with `password: true` per variable |
| `codex` | `.codex/config.toml` | `[mcp_servers.<id>]` with `command`, `args`, `env_vars = ["VAR"]` | `url`, `bearer_token_env_var` for `Authorization: Bearer ${VAR}`, `[mcp_servers.<id>.env_http_headers]` for `${VAR}` headers | variable name only; a value that renames the variable is refused with `mcp-schema` |

Further rules: empty `env` and `headers` objects are dropped; literal (non-secret) values pass through unchanged; the Windows wrapper turns `command: 'npx'` into `command: 'cmd', args: ['/c', 'npx', ...]` only when `wrap` is true, only for stdio servers, and only for `npx`; `.codex/config.toml` starts with a `#` provenance line and `.vscode/mcp.json` with a `//` line (VS Code reads it as JSONC); every other generated file is plain JSON with no comment.

- [ ] **Step 1: Write the minimal TOML reader the tests use**

Create `tests/init/toml-mini.mjs`:

```javascript
const ESCAPES = { '"': '"', '\\': '\\', n: '\n', t: '\t', r: '\r', b: '\b', f: '\f' };

function fail(where, message) {
  throw new SyntaxError(`${where}: ${message}`);
}

function skipSpace(line, i) {
  while (i < line.length && (line[i] === ' ' || line[i] === '\t')) i += 1;
  return i;
}

function readQuoted(line, start, where) {
  const quote = line[start];
  let i = start + 1;
  let out = '';
  while (i < line.length) {
    const ch = line[i];
    if (ch === quote) return [out, i + 1];
    if (quote === '"' && ch === '\\') {
      const esc = line[i + 1];
      if (Object.prototype.hasOwnProperty.call(ESCAPES, esc)) {
        out += ESCAPES[esc];
        i += 2;
        continue;
      }
      if (esc === 'u' || esc === 'U') {
        const size = esc === 'u' ? 4 : 8;
        const hex = line.slice(i + 2, i + 2 + size);
        if (hex.length !== size || !/^[0-9A-Fa-f]+$/.test(hex)) fail(where, 'bad unicode escape');
        out += String.fromCodePoint(parseInt(hex, 16));
        i += 2 + size;
        continue;
      }
      fail(where, `bad escape \\${esc ?? ''}`);
    }
    out += ch;
    i += 1;
  }
  return fail(where, 'unterminated string');
}

function readKey(line, i, where) {
  if (line[i] === '"' || line[i] === "'") return readQuoted(line, i, where);
  const match = /^[A-Za-z0-9_-]+/.exec(line.slice(i));
  if (!match) fail(where, 'expected a key');
  return [match[0], i + match[0].length];
}

function readValue(line, i, where) {
  const ch = line[i];
  if (ch === '"' || ch === "'") return readQuoted(line, i, where);
  if (ch === '[') {
    const items = [];
    let j = skipSpace(line, i + 1);
    while (line[j] !== ']') {
      if (j >= line.length) fail(where, 'unterminated array');
      const [item, next] = readValue(line, j, where);
      items.push(item);
      j = skipSpace(line, next);
      if (line[j] === ',') j = skipSpace(line, j + 1);
      else if (line[j] !== ']') fail(where, 'expected , or ] in array');
    }
    return [items, j + 1];
  }
  const rest = line.slice(i);
  const literal = /^(true|false|[+-]?[0-9]+)(?=\s|#|,|\]|$)/.exec(rest);
  if (!literal) fail(where, `unsupported value ${rest.slice(0, 20)}`);
  const text = literal[1];
  const value = text === 'true' ? true : text === 'false' ? false : Number(text);
  return [value, i + text.length];
}

function expectEnd(line, i, where) {
  const j = skipSpace(line, i);
  if (j < line.length && line[j] !== '#') fail(where, `unexpected text ${line.slice(j, j + 20)}`);
}

export function parseToml(text) {
  const root = {};
  let table = root;
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  lines.forEach((line, index) => {
    const where = `line ${index + 1}`;
    let i = skipSpace(line, 0);
    if (i >= line.length || line[i] === '#') return;
    if (line[i] === '[') {
      if (line[i + 1] === '[') fail(where, 'arrays of tables are not supported');
      const keys = [];
      i = skipSpace(line, i + 1);
      while (true) {
        const [key, next] = readKey(line, i, where);
        keys.push(key);
        i = skipSpace(line, next);
        if (line[i] === '.') { i = skipSpace(line, i + 1); continue; }
        if (line[i] === ']') break;
        fail(where, 'expected . or ] in table header');
      }
      expectEnd(line, i + 1, where);
      table = root;
      for (const key of keys) {
        if (!Object.prototype.hasOwnProperty.call(table, key)) table[key] = {};
        if (typeof table[key] !== 'object' || Array.isArray(table[key])) fail(where, `${key} is not a table`);
        table = table[key];
      }
      return;
    }
    const [key, afterKey] = readKey(line, i, where);
    i = skipSpace(line, afterKey);
    if (line[i] !== '=') fail(where, 'expected =');
    const [value, afterValue] = readValue(line, skipSpace(line, i + 1), where);
    expectEnd(line, afterValue, where);
    if (Object.prototype.hasOwnProperty.call(table, key)) fail(where, `duplicate key ${key}`);
    table[key] = value;
  });
  return root;
}
```

- [ ] **Step 2: Write the failing transform tests**

Create `tests/init/test-mcp-transforms.mjs`:

```javascript
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseToml } from './toml-mini.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../..');
const ENGINE = path.join(repoRoot, 'skills', 'init', 'scripts', 'init.mjs');
const { MCP_GENERATORS, MCP_TARGETS, ALL_HARNESSES, InitError, generateMcpFiles } = await import(pathToFileURL(ENGINE).href);

const canonical = JSON.parse(fs.readFileSync(path.join(repoRoot, 'templates', '.mcp.json'), 'utf8'));
const CANONICAL_IDS = Object.keys(canonical.mcpServers).sort();
const WRAPPED = canonical._ultrapowers.windowsNpxWrapper;
const SCHEMA_OF = MCP_TARGETS;
const TARGET_OF = Object.fromEntries(Object.entries(MCP_TARGETS).map(([target, schema]) => [schema, target]));

function parseGenerated(target, content) {
  if (target.endsWith('.toml')) return parseToml(content);
  const text = target.startsWith('.vscode/') ? content.replace(/^\s*\/\/.*$/gm, '') : content;
  return JSON.parse(text);
}

function serversOf(target, parsed) {
  if (target === '.codex/config.toml') return parsed.mcp_servers;
  if (target === 'opencode.json') return parsed.mcp;
  if (target === '.vscode/mcp.json') return parsed.servers;
  return parsed.mcpServers;
}

function generated(platform) {
  const out = {};
  for (const { target, content } of generateMcpFiles(ALL_HARNESSES, platform)) {
    out[SCHEMA_OF[target]] = { target, content, parsed: parseGenerated(target, content) };
  }
  return out;
}

function tmpRepo() {
  const root = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ultrapowers-mcp-')), 'proj');
  fs.mkdirSync(path.join(root, '.git'), { recursive: true });
  return root;
}

function run(args, { env = {}, expectExit = 0 } = {}) {
  let stdout;
  let status = 0;
  try {
    stdout = execFileSync(process.execPath, [ENGINE, ...args], { encoding: 'utf8', env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (err) {
    status = err.status;
    stdout = err.stdout;
  }
  assert.equal(status, expectExit, `exit code for ${args.join(' ')}: ${stdout}`);
  return JSON.parse(stdout);
}

const SYNTHETIC = {
  docs: { type: 'http', url: 'https://mcp.deepwiki.com/mcp', headers: { Authorization: 'Bearer ${DOCS_TOKEN}', 'X-Team': '${TEAM_ID}' } },
  tool: { type: 'stdio', command: 'node', args: ['server.js'], env: { TOOL_KEY: '${TOOL_KEY}', MODE: 'strict' } },
};

test('every MCP target has a pure generator', () => {
  for (const schema of Object.values(MCP_TARGETS)) {
    assert.equal(typeof MCP_GENERATORS[schema], 'function', `generator for ${schema}`);
    const input = structuredClone(canonical.mcpServers);
    const first = MCP_GENERATORS[schema](input, { wrap: true });
    const second = MCP_GENERATORS[schema](input, { wrap: true });
    assert.equal(first, second, `${schema} is deterministic`);
    assert.deepEqual(input, canonical.mcpServers, `${schema} does not mutate its input`);
  }
});

test('every generated file parses in its format and lists exactly the canonical server ids', () => {
  for (const platform of ['linux', 'win32']) {
    const files = generated(platform);
    assert.deepEqual(Object.keys(files).sort(), Object.values(MCP_TARGETS).sort());
    for (const [schema, { target, content, parsed }] of Object.entries(files)) {
      assert.deepEqual(Object.keys(serversOf(target, parsed)).sort(), CANONICAL_IDS, `${schema} on ${platform}`);
      assert.equal(content.includes('_ultrapowers'), false, `${target} leaks the _ultrapowers key`);
      assert.ok(content.endsWith('\n'), `${target} ends with a newline`);
    }
  }
});

test('secret references use the syntax of each schema', () => {
  const files = generated('linux');
  for (const schema of ['claude', 'factory', 'kimi', 'gemini', 'qwen']) {
    const servers = serversOf(files[schema].target, files[schema].parsed);
    assert.equal(servers.context7.env.CONTEXT7_API_KEY, '${CONTEXT7_API_KEY}', schema);
  }
  assert.equal(files.cursor.parsed.mcpServers.context7.env.CONTEXT7_API_KEY, '${env:CONTEXT7_API_KEY}');
  assert.equal(files.opencode.parsed.mcp.context7.environment.CONTEXT7_API_KEY, '{env:CONTEXT7_API_KEY}');
  const codex = files.codex.parsed.mcp_servers;
  assert.deepEqual(codex.context7.env_vars, ['CONTEXT7_API_KEY']);
  assert.equal(codex.context7.env, undefined, 'codex never writes a secret value');
  assert.equal(files.vscode.parsed.servers.context7.env.CONTEXT7_API_KEY, '${input:context7-api-key}');
  assert.deepEqual(files.vscode.parsed.inputs.map((i) => i.id), ['brave-api-key', 'context7-api-key', 'firecrawl-api-key']);
  for (const input of files.vscode.parsed.inputs) {
    assert.equal(input.type, 'promptString');
    assert.equal(input.password, true);
  }
  const allowed = {
    claude: /^\$\{[A-Z0-9_]+\}$/, factory: /^\$\{[A-Z0-9_]+\}$/, kimi: /^\$\{[A-Z0-9_]+\}$/,
    gemini: /^\$\{[A-Z0-9_]+\}$/, qwen: /^\$\{[A-Z0-9_]+\}$/, cursor: /^\$\{env:[A-Z0-9_]+\}$/,
    opencode: /^\{env:[A-Z0-9_]+\}$/, vscode: /^\$\{input:[a-z0-9-]+\}$/, codex: /^$/,
  };
  for (const [schema, { content }] of Object.entries(files)) {
    for (const ref of content.match(/\$\{[^}]*\}|\{env:[^}]*\}/g) ?? []) {
      assert.match(ref, allowed[schema], `${schema} contains a foreign reference ${ref}`);
    }
  }
});

test('stdio and http servers take the shape of each schema', () => {
  const files = generated('linux');
  const npx = { command: 'npx', args: ['-y', '@playwright/mcp@latest'] };
  const url = 'https://mcp.deepwiki.com/mcp';
  for (const schema of ['claude', 'factory', 'kimi']) {
    const servers = files[schema].parsed.mcpServers;
    assert.deepEqual(servers.playwright, { type: 'stdio', ...npx }, schema);
    assert.deepEqual(servers.deepwiki, { type: 'http', url }, schema);
  }
  assert.deepEqual(files.cursor.parsed.mcpServers.playwright, { type: 'stdio', ...npx });
  assert.deepEqual(files.cursor.parsed.mcpServers.deepwiki, { url });
  for (const schema of ['gemini', 'qwen']) {
    assert.deepEqual(files[schema].parsed.mcpServers.playwright, npx, schema);
    assert.deepEqual(files[schema].parsed.mcpServers.deepwiki, { httpUrl: url }, schema);
  }
  assert.deepEqual(files.opencode.parsed.mcp.playwright, { type: 'local', command: ['npx', '-y', '@playwright/mcp@latest'], enabled: true });
  assert.deepEqual(files.opencode.parsed.mcp.deepwiki, { type: 'remote', url, enabled: true });
  assert.equal(files.opencode.parsed.$schema, 'https://opencode.ai/config.json');
  assert.deepEqual(files.codex.parsed.mcp_servers.playwright, npx);
  assert.deepEqual(files.codex.parsed.mcp_servers.deepwiki, { url });
  assert.deepEqual(files.vscode.parsed.servers.playwright, { type: 'stdio', ...npx });
  assert.deepEqual(files.vscode.parsed.servers.deepwiki, { type: 'http', url });
});

test('the cmd /c wrapper appears only on win32 and only for the listed schemas', () => {
  const launchOf = (schema, parsed) => {
    const server = serversOf(TARGET_OF[schema], parsed).playwright;
    return schema === 'opencode' ? server.command : [server.command, ...server.args];
  };
  const linux = generated('linux');
  const win = generated('win32');
  for (const schema of Object.values(MCP_TARGETS)) {
    assert.deepEqual(launchOf(schema, linux[schema].parsed).slice(0, 2), ['npx', '-y'], `${schema} on linux`);
    const expected = WRAPPED.includes(schema) ? ['cmd', '/c', 'npx', '-y'] : ['npx', '-y'];
    assert.deepEqual(launchOf(schema, win[schema].parsed).slice(0, expected.length), expected, `${schema} on win32`);
    assert.equal(win[schema].content.includes('"cmd"') && !WRAPPED.includes(schema), false, `${schema} is not wrapped`);
  }
  assert.deepEqual(serversOf('.mcp.json', win.claude.parsed).deepwiki, { type: 'http', url: 'https://mcp.deepwiki.com/mcp' }, 'http servers are never wrapped');
});

test('gemini and qwen settings list AGENTS.md as a context file', () => {
  const files = generated('linux');
  assert.deepEqual(files.gemini.parsed.context.fileName, ['GEMINI.md', 'AGENTS.md']);
  assert.deepEqual(files.qwen.parsed.context.fileName, ['QWEN.md', 'AGENTS.md']);
});

test('the codex config carries the approval and sandbox defaults', () => {
  const { parsed } = generated('linux').codex;
  assert.equal(parsed.approval_policy, 'on-request');
  assert.equal(parsed.sandbox_mode, 'workspace-write');
});

test('headers, literal values and embedded references map per schema', () => {
  const claude = JSON.parse(MCP_GENERATORS.claude(SYNTHETIC, { wrap: true })).mcpServers;
  assert.deepEqual(claude.docs.headers, { Authorization: 'Bearer ${DOCS_TOKEN}', 'X-Team': '${TEAM_ID}' });
  assert.deepEqual(claude.tool, { type: 'stdio', command: 'node', args: ['server.js'], env: { TOOL_KEY: '${TOOL_KEY}', MODE: 'strict' } }, 'only npx is wrapped');
  const cursor = JSON.parse(MCP_GENERATORS.cursor(SYNTHETIC, { wrap: false })).mcpServers;
  assert.equal(cursor.docs.headers.Authorization, 'Bearer ${env:DOCS_TOKEN}');
  const opencode = JSON.parse(MCP_GENERATORS.opencode(SYNTHETIC, { wrap: false })).mcp;
  assert.equal(opencode.docs.headers.Authorization, 'Bearer {env:DOCS_TOKEN}');
  assert.deepEqual(opencode.tool.environment, { TOOL_KEY: '{env:TOOL_KEY}', MODE: 'strict' });
  const vscode = JSON.parse(MCP_GENERATORS.vscode(SYNTHETIC, { wrap: false }));
  assert.equal(vscode.servers.docs.headers.Authorization, 'Bearer ${input:docs-token}');
  assert.deepEqual(vscode.inputs.map((i) => i.id), ['docs-token', 'team-id', 'tool-key']);
  const codex = parseToml(MCP_GENERATORS.codex(SYNTHETIC, { wrap: true })).mcp_servers;
  assert.equal(codex.docs.bearer_token_env_var, 'DOCS_TOKEN');
  assert.deepEqual(codex.docs.env_http_headers, { 'X-Team': 'TEAM_ID' });
  assert.deepEqual(codex.tool.env_vars, ['TOOL_KEY']);
  assert.deepEqual(codex.tool.env, { MODE: 'strict' });
  assert.equal(codex.tool.command, 'node');
});

test('codex refuses a secret it cannot pass by variable name', () => {
  const renamed = { x: { type: 'stdio', command: 'npx', args: [], env: { API_KEY: '${OTHER_NAME}' } } };
  assert.throws(
    () => MCP_GENERATORS.codex(renamed, { wrap: false }),
    (err) => err instanceof InitError && err.code === 'mcp-schema' && /server x/.test(err.message),
  );
});

test('an unknown server shape in .mcp.json aborts before anything is written', () => {
  const root = tmpRepo();
  const templates = fs.mkdtempSync(path.join(os.tmpdir(), 'ultrapowers-templates-'));
  fs.cpSync(path.join(repoRoot, 'templates'), templates, { recursive: true });
  fs.writeFileSync(path.join(templates, '.mcp.json'), JSON.stringify({ mcpServers: { bad: { type: 'sse', url: 'https://mcp.deepwiki.com/sse' } } }));
  const report = run(['scaffold', '--root', root, '--name', 'Demo', '--platform', 'linux'], { env: { ULTRAPOWERS_TEMPLATES_DIR: templates }, expectExit: 2 });
  assert.equal(report.error.code, 'mcp-schema');
  assert.equal(report.error.server, 'bad');
  assert.deepEqual(fs.readdirSync(root), ['.git']);
});

test('scaffold writes every MCP file, with a provenance line where the format allows one', () => {
  const root = tmpRepo();
  const report = run(['scaffold', '--root', root, '--name', 'Demo', '--date', '2026-09-30', '--platform', 'linux']);
  for (const target of Object.keys(MCP_TARGETS)) {
    assert.ok(report.written.includes(target), `${target} written`);
    const content = fs.readFileSync(path.join(root, target), 'utf8');
    const parsed = parseGenerated(target, content);
    assert.deepEqual(Object.keys(serversOf(target, parsed)).sort(), CANONICAL_IDS, target);
  }
  assert.match(fs.readFileSync(path.join(root, '.codex', 'config.toml'), 'utf8').split('\n')[0], /^# generated by ultrapowers init .* on 2026-09-30/);
  assert.match(fs.readFileSync(path.join(root, '.vscode', 'mcp.json'), 'utf8').split('\n')[0], /^\/\/ generated by ultrapowers init/);
  for (const target of ['.mcp.json', '.cursor/mcp.json', '.gemini/settings.json', '.qwen/settings.json', 'opencode.json', '.factory/mcp.json', '.kimi/mcp.json']) {
    assert.equal(fs.readFileSync(path.join(root, target), 'utf8')[0], '{', `${target} is plain JSON`);
  }
});

test('the harness selection limits the MCP files that scaffold writes', () => {
  const root = tmpRepo();
  const report = run(['scaffold', '--root', root, '--name', 'Demo', '--harnesses', 'codex', '--platform', 'linux']);
  const mcpWritten = report.written.filter((p) => MCP_TARGETS[p]);
  assert.deepEqual(mcpWritten, ['.codex/config.toml']);
  assert.ok(report.omitted.includes('.mcp.json'));
  assert.ok(report.omitted.includes('.vscode/mcp.json'));
});

test('toml-mini parses what the codex generator emits and rejects malformed input', () => {
  const parsed = parseToml('# c\na = "x # not a comment"\n[t."q k".u]\nlist = ["a", \'b\',]\nflag = true # trailing\n');
  assert.deepEqual(parsed, { a: 'x # not a comment', t: { 'q k': { u: { list: ['a', 'b'], flag: true } } } });
  assert.throws(() => parseToml('a = "open\n'), /unterminated string/);
  assert.throws(() => parseToml('a = "1"\na = "2"\n'), /duplicate key a/);
  assert.throws(() => parseToml('a = { b = "c" }\n'), /unsupported value/);
});
```

- [ ] **Step 3: Run the tests to see them fail**

Run: `node --test tests/init/test-mcp-transforms.mjs`
Expected: `ℹ pass 1` and `ℹ fail 12`. The one pass is the `toml-mini` self-test; every other test fails because `MCP_GENERATORS` is still `{}` (for example `generator for claude` expected `'function'`, or the generated target list is empty).

- [ ] **Step 4: Fill the generators**

In `skills/init/scripts/init.mjs`, replace the single line

```javascript
export const MCP_GENERATORS = {};
```

with:

```javascript
export const CODEX_DEFAULTS = { approval_policy: 'on-request', sandbox_mode: 'workspace-write' };
export const CONTEXT_FILES = { gemini: ['GEMINI.md', 'AGENTS.md'], qwen: ['QWEN.md', 'AGENTS.md'] };
const SECRET_REF = /\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g;
const HAS_SECRET_REF = /\$\{[A-Za-z_][A-Za-z0-9_]*\}/;
const WHOLE_SECRET_REF = /^\$\{([A-Za-z_][A-Za-z0-9_]*)\}$/;

function hasKeys(map) {
  return Boolean(map) && Object.keys(map).length > 0;
}

function toJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function mapSecrets(map, format) {
  const out = {};
  for (const [key, value] of Object.entries(map)) {
    out[key] = String(value).replace(SECRET_REF, (_, name) => format(name));
  }
  return out;
}

function launch(server, wrap) {
  const args = [...(server.args ?? [])];
  if (wrap && server.command === 'npx') return { command: 'cmd', args: ['/c', 'npx', ...args] };
  return { command: server.command, args };
}

export function validateServers(servers) {
  for (const [id, server] of Object.entries(servers)) {
    const isStdio = server.type === 'stdio' && typeof server.command === 'string' && (server.args ?? []).every((a) => typeof a === 'string');
    const isHttp = server.type === 'http' && typeof server.url === 'string';
    if (!isStdio && !isHttp) {
      throw new InitError('mcp-schema', `templates/.mcp.json server ${id} must be { type: "stdio", command, args } or { type: "http", url }`, { server: id });
    }
  }
}

function jsonServers(servers, wrap, secret, { stdioType = true, httpKey = null } = {}) {
  const out = {};
  for (const [id, server] of Object.entries(servers)) {
    if (server.type === 'http') {
      const entry = httpKey ? { [httpKey]: server.url } : { type: 'http', url: server.url };
      if (hasKeys(server.headers)) entry.headers = mapSecrets(server.headers, secret);
      out[id] = entry;
      continue;
    }
    const entry = { ...(stdioType ? { type: 'stdio' } : {}), ...launch(server, wrap) };
    if (hasKeys(server.env)) entry.env = mapSecrets(server.env, secret);
    out[id] = entry;
  }
  return out;
}

const dollarRef = (name) => `\${${name}}`;
const cursorRef = (name) => `\${env:${name}}`;
const opencodeRef = (name) => `{env:${name}}`;
const vscodeInputId = (name) => name.toLowerCase().replace(/_/g, '-');

function standardJson(servers, { wrap }) {
  return toJson({ mcpServers: jsonServers(servers, wrap, dollarRef) });
}

function geminiFamilyJson(schema) {
  return (servers, { wrap }) => toJson({
    context: { fileName: CONTEXT_FILES[schema] },
    mcpServers: jsonServers(servers, wrap, dollarRef, { stdioType: false, httpKey: 'httpUrl' }),
  });
}

function opencodeJson(servers, { wrap }) {
  const mcp = {};
  for (const [id, server] of Object.entries(servers)) {
    if (server.type === 'http') {
      const entry = { type: 'remote', url: server.url, enabled: true };
      if (hasKeys(server.headers)) entry.headers = mapSecrets(server.headers, opencodeRef);
      mcp[id] = entry;
      continue;
    }
    const { command, args } = launch(server, wrap);
    const entry = { type: 'local', command: [command, ...args], enabled: true };
    if (hasKeys(server.env)) entry.environment = mapSecrets(server.env, opencodeRef);
    mcp[id] = entry;
  }
  return toJson({ $schema: 'https://opencode.ai/config.json', mcp });
}

function vscodeJson(servers, { wrap }) {
  const inputs = new Map();
  const inputRef = (serverId) => (name) => {
    if (!inputs.has(name)) {
      inputs.set(name, { type: 'promptString', id: vscodeInputId(name), description: `${name} for the ${serverId} MCP server`, password: true });
    }
    return `\${input:${vscodeInputId(name)}}`;
  };
  const out = {};
  for (const [id, server] of Object.entries(servers)) {
    if (server.type === 'http') {
      const entry = { type: 'http', url: server.url };
      if (hasKeys(server.headers)) entry.headers = mapSecrets(server.headers, inputRef(id));
      out[id] = entry;
      continue;
    }
    const entry = { type: 'stdio', ...launch(server, wrap) };
    if (hasKeys(server.env)) entry.env = mapSecrets(server.env, inputRef(id));
    out[id] = entry;
  }
  const sortedInputs = [...inputs.values()].sort((a, b) => a.id.localeCompare(b.id));
  return toJson({ inputs: sortedInputs, servers: out });
}

const tomlKey = (key) => (/^[A-Za-z0-9_-]+$/.test(key) ? key : JSON.stringify(key));
const tomlString = (value) => JSON.stringify(String(value));
const tomlArray = (values) => `[${values.map(tomlString).join(', ')}]`;

function codexEnv(id, env) {
  const names = [];
  const literal = {};
  for (const [key, value] of Object.entries(env ?? {})) {
    const whole = WHOLE_SECRET_REF.exec(String(value));
    if (whole && whole[1] === key) {
      names.push(key);
    } else if (!HAS_SECRET_REF.test(String(value))) {
      literal[key] = String(value);
    } else {
      throw new InitError('mcp-schema', `server ${id}: Codex passes secrets by variable name only, so env ${key} must be "\${${key}}"`, { server: id });
    }
  }
  return { names, literal };
}

function codexHeaders(id, headers) {
  const byVariable = {};
  const literal = {};
  let bearer = null;
  for (const [header, value] of Object.entries(headers ?? {})) {
    const text = String(value);
    const whole = WHOLE_SECRET_REF.exec(text);
    const token = /^Bearer \$\{([A-Za-z_][A-Za-z0-9_]*)\}$/.exec(text);
    if (whole) {
      byVariable[header] = whole[1];
    } else if (token && header.toLowerCase() === 'authorization') {
      bearer = token[1];
    } else if (!HAS_SECRET_REF.test(text)) {
      literal[header] = text;
    } else {
      throw new InitError('mcp-schema', `server ${id}: Codex cannot embed a secret inside header ${header}`, { server: id });
    }
  }
  return { byVariable, literal, bearer };
}

function codexToml(servers, { wrap }) {
  const lines = [
    `approval_policy = ${tomlString(CODEX_DEFAULTS.approval_policy)}`,
    `sandbox_mode = ${tomlString(CODEX_DEFAULTS.sandbox_mode)}`,
  ];
  for (const [id, server] of Object.entries(servers)) {
    const table = `mcp_servers.${tomlKey(id)}`;
    const subTables = [];
    lines.push('', `[${table}]`);
    if (server.type === 'http') {
      lines.push(`url = ${tomlString(server.url)}`);
      const { byVariable, literal, bearer } = codexHeaders(id, server.headers);
      if (bearer) lines.push(`bearer_token_env_var = ${tomlString(bearer)}`);
      if (hasKeys(byVariable)) subTables.push(['env_http_headers', byVariable]);
      if (hasKeys(literal)) subTables.push(['http_headers', literal]);
    } else {
      const { command, args } = launch(server, wrap);
      lines.push(`command = ${tomlString(command)}`, `args = ${tomlArray(args)}`);
      const { names, literal } = codexEnv(id, server.env);
      if (names.length) lines.push(`env_vars = ${tomlArray(names)}`);
      if (hasKeys(literal)) subTables.push(['env', literal]);
    }
    for (const [name, map] of subTables) {
      lines.push('', `[${table}.${name}]`);
      for (const [key, value] of Object.entries(map)) lines.push(`${tomlKey(key)} = ${tomlString(value)}`);
    }
  }
  return `${lines.join('\n')}\n`;
}

export const MCP_GENERATORS = {
  claude: standardJson,
  codex: codexToml,
  cursor: (servers, { wrap }) => toJson({ mcpServers: jsonServers(servers, wrap, cursorRef, { httpKey: 'url' }) }),
  gemini: geminiFamilyJson('gemini'),
  qwen: geminiFamilyJson('qwen'),
  opencode: opencodeJson,
  factory: standardJson,
  kimi: standardJson,
  vscode: vscodeJson,
};
```

- [ ] **Step 5: Validate the canonical file before generating**

In `generateMcpFiles`, replace

```javascript
  const { wrapper, servers } = loadCanonicalMcp();
  const files = [];
```

with

```javascript
  const { wrapper, servers } = loadCanonicalMcp();
  validateServers(servers);
  const files = [];
```

`planPayload` calls `generateMcpFiles` before any file is written, so a broken `.mcp.json` aborts the run with exit 2 and an empty project.

- [ ] **Step 6: Give generated files their provenance line**

In `planPayload`, replace

```javascript
    files.push({ target, content, executable: false });
```

with

```javascript
    files.push({ target, content: provenance(target, content, vars), executable: false });
```

`provenance` already adds `#` for `.toml` targets and `//` for `.vscode/` targets and leaves plain `.json` untouched.

- [ ] **Step 7: Run the transform and engine tests**

Run: `node --test tests/init/test-mcp-transforms.mjs`
Expected: `ℹ pass 13`, `ℹ fail 0`.

Run: `node --test tests/init/test-engine.mjs`
Expected: `ℹ pass 21`, `ℹ fail 0` (the scaffold tests now also write the nine MCP files; the second-run test reports them as skipped).

- [ ] **Step 8: Commit**

```bash
git add skills/init/scripts/init.mjs tests/init/toml-mini.mjs tests/init/test-mcp-transforms.mjs
git commit -m "feat(init): generate every harness MCP file from .mcp.json" -m "One pure generator per schema (Claude, Codex TOML, Cursor, Gemini, Qwen, OpenCode, Factory, Kimi, VS Code) with per-schema secret references, the Windows cmd /c wrapper only for the listed schemas, http and stdio shapes, and a validation step that aborts before any write. A minimal TOML reader in the tests proves the Codex file parses." -m "RAOOF A."
```

---

### Task 6: Join and upgrade modes

**Files:**
- Modify: `skills/init/scripts/init.mjs` (replace the `runJoin` and `runUpgrade` stubs; route `applyPlan`'s block loop through the new `applyBlockFile`)
- Create: `tests/init/test-modes.mjs`

**Interfaces:**
- Consumes (Task 4, same module): `readMarker`, `findMarkerAbove`, `detectRepos`, `buildVars`, `render`, `applyBlock`, `planPayload`, `saveMarker`, `missingSecrets`, `gitConfigGet`/`gitConfigSet` (local scope), `pluginVersion`, `readJson`, `compareVersions`, `emptyReport`, `writeFile`, `readTemplate`, `TEMPLATES_DIR`, `MARKER_PATH`, `ALL_HARNESSES`, `InitError`. `templates/CHANGES.json` from Task 3. `*.ultrapowers-new` is already in the managed `.gitignore` block (Task 3).
- Produces:
  - `runJoin(opts) -> Report` with `mode: 'join'`, `hooksPath` one of `'set' | 'would-set' | 'already-set' | 'kept:<value>' | 'failed' | 'no-git'`, `missingSecrets: string[]` (names from `.agents/mcp-secrets.env.example` whose variable is unset or empty), `repos` (clones on disk), `newRepos` (on disk, not in the marker), `written` (empty unless `--record-repos` recorded clones: then `['.agents/ultrapowers.json', '.gitignore']`).
  - `runUpgrade(opts) -> Report` with `mode: 'upgrade'`, `changed: Array<{ path: string, version: string, exists: boolean }>` (targets whose `CHANGES.json` version is newer than the marker's `pluginVersion`, sorted), `written` (created targets, `<target>.ultrapowers-new` proposals, and `.agents/ultrapowers.json` when the marker changed), `blocks`.
  - `applyBlockFile(root, target, body, report, dryRun)`, `PROPOSAL_SUFFIX = '.ultrapowers-new'`, `HOOKS_PATH = '.githooks'`.
  - New error codes: `no-marker` (join or upgrade without a marker), `nested-clone` (also from join and upgrade), `marker-corrupt` (also when the marker parses but is not an object), `bad-args` (an `--apply` path that is not in `changed`, with `unknown: string[]`).

Decisions (spec D10, 4.1, 4.6):
- Join writes no shared file. It sets `core.hooksPath` in the clone's local config only when the local value is unset; a different local value is reported as `kept:<value>` and left alone. With `--record-repos` it appends new clones to the marker's `repos`, sets `topology` to `nested`, and re-renders the managed `.gitignore` block from the recorded list so the new clone is ignored; nothing else.
- Upgrade without `--apply` is a preview and writes nothing. `--apply t1,t2` applies only those targets; each must appear in `changed`. A target that does not exist is written directly. A target that exists is never overwritten, even when named: its new rendering goes to `<target>.ultrapowers-new` for your human partner to merge by hand. `.gitignore` and `.gitattributes` are the exception by design (D10): only the block between the markers is replaced. `--apply none` writes no payload file.
- After any `--apply` (including `none`) the marker's `pluginVersion` is raised to the plugin version, so the upgrade nudge stops and targets your human partner declined stay declined ("skipped files stay skipped"). A preview never touches the marker. Newly created targets are added to the marker's `written`.
- Both modes re-detect clones on disk and report `newRepos`; only `--record-repos` records them.

- [ ] **Step 1: Write the failing mode tests**

Create `tests/init/test-modes.mjs`:

```javascript
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../..');
const ENGINE = path.join(repoRoot, 'skills', 'init', 'scripts', 'init.mjs');
const pluginVersion = JSON.parse(fs.readFileSync(path.join(repoRoot, '.claude-plugin', 'plugin.json'), 'utf8')).version;
const { ALL_HARNESSES, PROPOSAL_SUFFIX, planPayload } = await import(pathToFileURL(ENGINE).href);

const gitHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ultrapowers-githome-'));
const GIT_ENV = {
  GIT_CONFIG_GLOBAL: path.join(gitHome, 'gitconfig'),
  GIT_CONFIG_NOSYSTEM: '1',
  CONTEXT7_API_KEY: 'set-for-test',
  FIRECRAWL_API_KEY: '',
  BRAVE_API_KEY: '',
};
fs.writeFileSync(GIT_ENV.GIT_CONFIG_GLOBAL, '');

function git(cwd, ...args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', env: { ...process.env, ...GIT_ENV }, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function gitRepo(dir) {
  fs.mkdirSync(dir, { recursive: true });
  git(dir, 'init', '-q');
  return dir;
}

function tmpWorkspace(name = 'ws') {
  return gitRepo(path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ultrapowers-modes-')), name));
}

function run(args, { env = {}, expectExit = 0 } = {}) {
  let stdout;
  let status = 0;
  try {
    stdout = execFileSync(process.execPath, [ENGINE, ...args], {
      encoding: 'utf8',
      env: { ...process.env, ...GIT_ENV, ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (err) {
    status = err.status;
    stdout = err.stdout;
  }
  assert.equal(status, expectExit, `exit code for ${args.join(' ')}: ${stdout}`);
  return JSON.parse(stdout);
}

function snapshot(dir, prefix = '') {
  const out = {};
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === '.git') continue;
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) Object.assign(out, snapshot(full, rel));
    else out[rel] = fs.readFileSync(full).toString('base64');
  }
  return out;
}

function changedFiles(before, after) {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  return [...keys].filter((k) => before[k] !== after[k]).sort();
}

function marker(root) {
  return JSON.parse(fs.readFileSync(path.join(root, '.agents', 'ultrapowers.json'), 'utf8'));
}

function setMarkerVersion(root, version) {
  const data = marker(root);
  data.pluginVersion = version;
  fs.writeFileSync(path.join(root, '.agents', 'ultrapowers.json'), `${JSON.stringify(data, null, 2)}\n`);
}

function scaffolded(name = 'ws', extra = []) {
  const root = tmpWorkspace(name);
  run(['scaffold', '--root', root, '--name', 'WS', '--platform', 'linux', ...extra]);
  return root;
}

function templatesCopy(changes) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ultrapowers-templates-'));
  fs.cpSync(path.join(repoRoot, 'templates'), dir, { recursive: true });
  if (changes) fs.writeFileSync(path.join(dir, 'CHANGES.json'), JSON.stringify(changes, null, 2));
  return dir;
}

test('join on a scaffolded workspace sets core.hooksPath and writes no shared file', () => {
  const root = scaffolded();
  const before = snapshot(root);
  const report = run(['join', '--root', root]);
  assert.equal(report.mode, 'join');
  assert.equal(report.hooksPath, 'set');
  assert.deepEqual(report.written, []);
  assert.deepEqual(changedFiles(before, snapshot(root)), []);
  assert.equal(git(root, 'config', '--local', '--get', 'core.hooksPath'), '.githooks');
  assert.equal(run(['join', '--root', root]).hooksPath, 'already-set');
});

test('join leaves a custom core.hooksPath alone and dry-run changes nothing', () => {
  const root = scaffolded();
  git(root, 'config', '--local', 'core.hooksPath', '.husky');
  assert.equal(run(['join', '--root', root]).hooksPath, 'kept:.husky');
  assert.equal(git(root, 'config', '--local', '--get', 'core.hooksPath'), '.husky');
  const fresh = scaffolded('ws2');
  assert.equal(run(['join', '--root', fresh, '--dry-run']).hooksPath, 'would-set');
  assert.throws(() => git(fresh, 'config', '--local', '--get', 'core.hooksPath'));
});

test('join reports the secret variables from the example file that are not defined', () => {
  const root = scaffolded();
  const report = run(['join', '--root', root]);
  assert.deepEqual(report.missingSecrets, ['FIRECRAWL_API_KEY', 'BRAVE_API_KEY']);
  assert.ok(report.nextSteps.some((s) => s.includes('FIRECRAWL_API_KEY, BRAVE_API_KEY')));
  assert.ok(report.nextSteps.some((s) => /Approve the project MCP servers/.test(s)));
});

test('join detects a nested clone added after scaffold and records it only with --record-repos', () => {
  const root = scaffolded();
  gitRepo(path.join(root, 'svc-new'));
  const before = snapshot(root);
  const report = run(['join', '--root', root]);
  assert.deepEqual(report.newRepos.map((r) => r.path), ['svc-new']);
  assert.deepEqual(changedFiles(before, snapshot(root)), []);
  assert.ok(report.nextSteps.some((s) => s.includes('--record-repos')));

  const recorded = run(['join', '--root', root, '--record-repos']);
  assert.deepEqual(recorded.written, ['.agents/ultrapowers.json', '.gitignore']);
  assert.deepEqual(changedFiles(before, snapshot(root)), ['.agents/ultrapowers.json', '.gitignore']);
  const data = marker(root);
  assert.deepEqual(data.repos.map((r) => r.path), ['svc-new']);
  assert.equal(data.topology, 'nested');
  assert.match(fs.readFileSync(path.join(root, '.gitignore'), 'utf8'), /^\/svc-new\/$/m);
  assert.deepEqual(run(['join', '--root', root]).newRepos, []);
});

test('join and upgrade refuse outside a scaffold and inside a nested clone', () => {
  const bare = tmpWorkspace('bare');
  assert.equal(run(['join', '--root', bare], { expectExit: 2 }).error.code, 'no-marker');
  assert.equal(run(['upgrade', '--root', bare], { expectExit: 2 }).error.code, 'no-marker');
  const root = scaffolded();
  const clone = gitRepo(path.join(root, 'svc-api'));
  for (const mode of ['join', 'upgrade']) {
    const report = run([mode, '--root', clone], { expectExit: 2 });
    assert.equal(report.error.code, 'nested-clone');
    assert.equal(path.resolve(report.error.workspaceRoot), path.resolve(root));
  }
  assert.deepEqual(fs.readdirSync(clone), ['.git']);
});

test('CHANGES.json lists exactly the targets the payload renders', () => {
  const changes = JSON.parse(fs.readFileSync(path.join(repoRoot, 'templates', 'CHANGES.json'), 'utf8'));
  const plan = planPayload({ root: tmpWorkspace(), name: 'X', date: '2026-09-30', platform: 'linux', nestedPointers: false }, [], [...ALL_HARNESSES]);
  const targets = [...plan.files.map((f) => f.target), ...plan.blocks.map((b) => b.target)]
    .filter((t) => path.posix.basename(t) !== '.gitkeep');
  assert.deepEqual([...targets].sort(), Object.keys(changes).sort());
});

test('upgrade lists the targets whose template changed after the marker version', () => {
  const changes = JSON.parse(fs.readFileSync(path.join(repoRoot, 'templates', 'CHANGES.json'), 'utf8'));
  for (const key of Object.keys(changes)) changes[key] = '0.0.1';
  changes['AGENTS.md'] = pluginVersion;
  changes['.gitignore'] = pluginVersion;
  const env = { ULTRAPOWERS_TEMPLATES_DIR: templatesCopy(changes) };
  const root = tmpWorkspace();
  run(['scaffold', '--root', root, '--name', 'WS', '--platform', 'linux'], { env });
  setMarkerVersion(root, '0.0.1');
  const report = run(['upgrade', '--root', root], { env });
  assert.equal(report.mode, 'upgrade');
  assert.deepEqual(report.changed, [
    { path: '.gitignore', version: pluginVersion, exists: true },
    { path: 'AGENTS.md', version: pluginVersion, exists: true },
  ]);
  assert.equal(run(['detect', '--root', root], { env }).suggestedMode, 'upgrade');
});

test('upgrade without --apply writes nothing at all', () => {
  const root = scaffolded();
  setMarkerVersion(root, '0.0.1');
  const before = snapshot(root);
  const report = run(['upgrade', '--root', root]);
  assert.ok(report.changed.some((c) => c.path === 'AGENTS.md'));
  assert.deepEqual(report.written, []);
  assert.deepEqual(changedFiles(before, snapshot(root)), []);
});

test('upgrade --apply none writes no payload file and records the plugin version', () => {
  const root = scaffolded();
  setMarkerVersion(root, '0.0.1');
  const before = snapshot(root);
  const report = run(['upgrade', '--root', root, '--apply', 'none']);
  assert.deepEqual(report.written, ['.agents/ultrapowers.json']);
  assert.deepEqual(changedFiles(before, snapshot(root)), ['.agents/ultrapowers.json']);
  assert.equal(marker(root).pluginVersion, pluginVersion);
  assert.equal(run(['detect', '--root', root]).suggestedMode, 'join');
});

test('upgrade --apply of an edited file leaves it byte-identical and writes a proposal beside it', () => {
  const root = scaffolded();
  const custom = '# Our own AGENTS.md\r\n\r\nKeep this.\r\n';
  fs.writeFileSync(path.join(root, 'AGENTS.md'), custom);
  setMarkerVersion(root, '0.0.1');
  const report = run(['upgrade', '--root', root, '--apply', 'AGENTS.md']);
  assert.equal(fs.readFileSync(path.join(root, 'AGENTS.md'), 'utf8'), custom);
  const proposal = `AGENTS.md${PROPOSAL_SUFFIX}`;
  assert.deepEqual(report.written, ['.agents/ultrapowers.json', proposal]);
  assert.match(fs.readFileSync(path.join(root, proposal), 'utf8'), /^# WS: instructions for coding agents$/m);
  assert.ok(report.nextSteps.some((s) => s.includes(proposal)));
  assert.equal(marker(root).pluginVersion, pluginVersion);
  assert.match(fs.readFileSync(path.join(root, '.gitignore'), 'utf8'), /^\*\.ultrapowers-new$/m, 'proposals are gitignored');
});

test('upgrade --apply writes a missing target directly and records it', () => {
  const root = scaffolded();
  fs.rmSync(path.join(root, 'playbooks', 'README.md'));
  const data = marker(root);
  data.written = data.written.filter((p) => p !== 'playbooks/README.md');
  data.pluginVersion = '0.0.1';
  fs.writeFileSync(path.join(root, '.agents', 'ultrapowers.json'), `${JSON.stringify(data, null, 2)}\n`);
  const report = run(['upgrade', '--root', root, '--apply', 'playbooks/README.md']);
  assert.deepEqual(report.written, ['.agents/ultrapowers.json', 'playbooks/README.md']);
  assert.match(fs.readFileSync(path.join(root, 'playbooks', 'README.md'), 'utf8'), /^# playbooks$/m);
  assert.ok(marker(root).written.includes('playbooks/README.md'));
});

test('upgrade --apply refuses a target that did not change and writes nothing', () => {
  const root = scaffolded();
  const before = snapshot(root);
  const report = run(['upgrade', '--root', root, '--apply', 'AGENTS.md'], { expectExit: 2 });
  assert.equal(report.error.code, 'bad-args');
  assert.deepEqual(report.error.unknown, ['AGENTS.md']);
  assert.deepEqual(changedFiles(before, snapshot(root)), []);
});

test('upgrade --apply .gitignore replaces only the managed block', () => {
  const root = scaffolded();
  const file = path.join(root, '.gitignore');
  fs.writeFileSync(file, `node_modules/\n${fs.readFileSync(file, 'utf8').replace('.temp/\n', '')}dist/\n`);
  setMarkerVersion(root, '0.0.1');
  const report = run(['upgrade', '--root', root, '--apply', '.gitignore']);
  assert.deepEqual(report.blocks, [{ path: '.gitignore', action: 'replaced' }]);
  const text = fs.readFileSync(file, 'utf8');
  assert.ok(text.startsWith('node_modules/\n# >>> ultrapowers\n'));
  assert.ok(text.endsWith('# <<< ultrapowers\ndist/\n'));
  assert.match(text, /^\.temp\/$/m);
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `node --test tests/init/test-modes.mjs`
Expected: `ℹ pass 1`, `ℹ fail 12`. The pass is `CHANGES.json lists exactly the targets the payload renders` (it only uses Task 4's `planPayload`); the failures print `"code": "not-implemented"` from the stubs.

- [ ] **Step 3: Replace the two stubs**

In `skills/init/scripts/init.mjs`, replace

```javascript
export function runJoin(opts) {
  throw new InitError('not-implemented', `${opts.mode} mode is not implemented yet`);
}

export function runUpgrade(opts) {
  throw new InitError('not-implemented', `${opts.mode} mode is not implemented yet`);
}
```

with:

```javascript
export const PROPOSAL_SUFFIX = '.ultrapowers-new';
export const HOOKS_PATH = '.githooks';

function requireMarker(opts) {
  if (!fs.existsSync(opts.root) || !fs.statSync(opts.root).isDirectory()) {
    throw new InitError('bad-root', `${opts.root} is not a directory`);
  }
  const marker = readMarker(opts.root);
  if (marker && typeof marker === 'object' && !Array.isArray(marker)) return marker;
  if (marker !== null) {
    throw new InitError('marker-corrupt', `${MARKER_PATH} does not hold a JSON object`, { path: path.join(opts.root, MARKER_PATH) });
  }
  const workspaceRoot = findMarkerAbove(opts.root);
  if (workspaceRoot) {
    throw new InitError('nested-clone', `${opts.root} sits inside the ultrapowers workspace ${workspaceRoot}; run init from that root`, { workspaceRoot });
  }
  throw new InitError('no-marker', `${opts.root} has no ${MARKER_PATH}; run scaffold first`);
}

function markerHarnesses(marker) {
  return Array.isArray(marker.harnesses) ? marker.harnesses : [...ALL_HARNESSES];
}

function markerOpts(opts, marker) {
  return { ...opts, name: opts.name ?? marker.name ?? path.basename(opts.root), nestedPointers: false };
}

export function applyBlockFile(root, target, body, report, dryRun) {
  const full = path.join(root, target);
  const existing = fs.existsSync(full) ? fs.readFileSync(full, 'utf8') : null;
  const { content, action } = applyBlock(existing, body);
  if (action !== 'unchanged') {
    writeFile(root, target, content, false, dryRun);
    report.written.push(target);
  }
  report.blocks.push({ path: target, action });
}

function reconcileRepos(opts, marker, report) {
  const onDisk = detectRepos(opts.root);
  const recorded = Array.isArray(marker.repos) ? marker.repos : [];
  report.repos = onDisk;
  report.newRepos = onDisk.filter((repo) => !recorded.some((known) => known.path === repo.path));
  if (!opts.recordRepos || report.newRepos.length === 0) return false;
  marker.repos = [...recorded, ...report.newRepos].sort((a, b) => a.path.localeCompare(b.path));
  marker.topology = 'nested';
  return true;
}

function gitignoreBody(opts, marker) {
  const vars = buildVars(markerOpts(opts, marker), marker.repos ?? [], markerHarnesses(marker), []);
  return render(readTemplate(path.join(TEMPLATES_DIR, '_blocks', 'gitignore.tmpl')), vars, '_blocks/gitignore.tmpl');
}

function ensureHooksPath(opts) {
  if (!fs.existsSync(path.join(opts.root, '.git'))) return 'no-git';
  const current = gitConfigGet(opts.root, 'core.hooksPath');
  if (current === HOOKS_PATH) return 'already-set';
  if (current) return `kept:${current}`;
  if (opts.dryRun) return 'would-set';
  try {
    gitConfigSet(opts.root, 'core.hooksPath', HOOKS_PATH);
    return 'set';
  } catch {
    return 'failed';
  }
}

function localNextSteps(report) {
  const steps = [];
  const hooks = {
    set: `core.hooksPath now points at ${HOOKS_PATH} for this clone.`,
    'would-set': `Join will set core.hooksPath to ${HOOKS_PATH} for this clone.`,
    'already-set': `core.hooksPath already points at ${HOOKS_PATH}.`,
    failed: `Setting core.hooksPath failed; run by hand: git config core.hooksPath ${HOOKS_PATH}`,
    'no-git': `This directory is not a git clone; after cloning, run: git config core.hooksPath ${HOOKS_PATH}`,
  };
  if (report.hooksPath.startsWith('kept:')) {
    steps.push(`core.hooksPath is ${report.hooksPath.slice(5)}; left unchanged. The secret scan in ${HOOKS_PATH}/pre-commit runs only from ${HOOKS_PATH}.`);
  } else if (hooks[report.hooksPath]) {
    steps.push(hooks[report.hooksPath]);
  }
  if (report.missingSecrets.length) {
    steps.push(`Define these variables in your user environment (see .agents/mcp-secrets.env.example): ${report.missingSecrets.join(', ')}`);
  }
  steps.push('Approve the project MCP servers when your harness prompts for them.');
  return steps;
}

function repoNextSteps(report, recorded) {
  if (!report.newRepos.length) return [];
  const names = report.newRepos.map((r) => r.name).join(', ');
  if (recorded) return [`Recorded ${names} in ${MARKER_PATH} and the managed .gitignore block; commit both files.`];
  return [`New nested clones not recorded in ${MARKER_PATH}: ${names}. Run again with --record-repos to record them and add them to the managed .gitignore block.`];
}

export function runJoin(opts) {
  const report = emptyReport('join', opts);
  const marker = requireMarker(opts);
  report.hooksPath = ensureHooksPath(opts);
  report.missingSecrets = missingSecrets(opts.root);
  const recorded = reconcileRepos(opts, marker, report);
  if (recorded) {
    applyBlockFile(opts.root, '.gitignore', gitignoreBody(opts, marker), report, opts.dryRun);
    saveMarker(opts.root, marker, opts.dryRun);
    report.written.push(MARKER_PATH);
  }
  report.written.sort();
  report.nextSteps = [...localNextSteps(report), ...repoNextSteps(report, recorded)];
  return report;
}

function changedTargets(opts, plan, from) {
  const changes = readJson(path.join(TEMPLATES_DIR, 'CHANGES.json'));
  const targets = [...plan.files.map((f) => f.target), ...plan.blocks.map((b) => b.target)];
  return targets
    .filter((target) => typeof changes[target] === 'string' && compareVersions(changes[target], from) > 0)
    .sort()
    .map((target) => ({ path: target, version: changes[target], exists: fs.existsSync(path.join(opts.root, target)) }));
}

function upgradeNextSteps(report, from, version, applied) {
  if (!applied) {
    if (!report.changed.length) {
      return [`No template changed since ${from}. Run upgrade with --apply none to record version ${version} in ${MARKER_PATH}.`];
    }
    return [
      'Choose the targets to apply, then run upgrade with --apply <target,target> or --apply none.',
      `An existing file is never overwritten: its new version is written next to it as <target>${PROPOSAL_SUFFIX}.`,
    ];
  }
  const steps = report.written
    .filter((p) => p.endsWith(PROPOSAL_SUFFIX))
    .map((p) => `Compare ${p} with ${p.slice(0, -PROPOSAL_SUFFIX.length)}, merge what you want by hand, then delete ${p}.`);
  steps.push(`${MARKER_PATH} records version ${version}.`);
  steps.push('Review the changes, then commit them.');
  return steps;
}

export function runUpgrade(opts) {
  const report = emptyReport('upgrade', opts);
  const marker = requireMarker(opts);
  const version = pluginVersion();
  const from = typeof marker.pluginVersion === 'string' ? marker.pluginVersion : '0.0.0';
  const recorded = reconcileRepos(opts, marker, report);
  const plan = planPayload(markerOpts(opts, marker), marker.repos ?? [], markerHarnesses(marker));
  report.changed = changedTargets(opts, plan, from);
  let markerChanged = recorded;
  if (recorded && !(opts.apply ?? []).includes('.gitignore')) {
    applyBlockFile(opts.root, '.gitignore', gitignoreBody(opts, marker), report, opts.dryRun);
  }
  if (opts.apply !== null) {
    const changedPaths = new Set(report.changed.map((c) => c.path));
    const unknown = opts.apply.filter((t) => !changedPaths.has(t));
    if (unknown.length) {
      throw new InitError('bad-args', `--apply names targets that did not change since ${from}: ${unknown.join(', ')}`, { unknown });
    }
    const created = [];
    for (const target of new Set(opts.apply)) {
      const block = plan.blocks.find((b) => b.target === target);
      if (block) {
        applyBlockFile(opts.root, target, block.body, report, opts.dryRun);
        continue;
      }
      const file = plan.files.find((f) => f.target === target);
      if (!fs.existsSync(path.join(opts.root, target))) {
        writeFile(opts.root, target, file.content, file.executable, opts.dryRun);
        report.written.push(target);
        created.push(target);
        continue;
      }
      writeFile(opts.root, `${target}${PROPOSAL_SUFFIX}`, file.content, false, opts.dryRun);
      report.written.push(`${target}${PROPOSAL_SUFFIX}`);
    }
    if (compareVersions(from, version) < 0) marker.pluginVersion = version;
    marker.written = [...new Set([...(Array.isArray(marker.written) ? marker.written : []), ...created])].sort();
    markerChanged = true;
  }
  if (markerChanged) {
    saveMarker(opts.root, marker, opts.dryRun);
    report.written.push(MARKER_PATH);
  }
  report.written.sort();
  report.skipped.sort();
  report.nextSteps = [...upgradeNextSteps(report, from, version, opts.apply !== null), ...repoNextSteps(report, recorded)];
  return report;
}
```

- [ ] **Step 4: Route scaffold's block writes through the same helper**

In `applyPlan`, replace

```javascript
  for (const block of plan.blocks) {
    const full = path.join(root, block.target);
    const existing = fs.existsSync(full) ? fs.readFileSync(full, 'utf8') : null;
    const { content, action } = applyBlock(existing, block.body);
    if (action !== 'unchanged') {
      writeFile(root, block.target, content, false, dryRun);
      report.written.push(block.target);
    }
    report.blocks.push({ path: block.target, action });
  }
```

with

```javascript
  for (const block of plan.blocks) {
    applyBlockFile(root, block.target, block.body, report, dryRun);
  }
```

- [ ] **Step 5: Run the mode tests and the earlier suites**

Run: `node --test tests/init/test-modes.mjs`
Expected: `ℹ pass 13`, `ℹ fail 0`.

Run: `node --test tests/init/test-engine.mjs tests/init/test-mcp-transforms.mjs`
Expected: `ℹ pass 34`, `ℹ fail 0`.

- [ ] **Step 6: Commit**

```bash
git add skills/init/scripts/init.mjs tests/init/test-modes.mjs
git commit -m "feat(init): join and upgrade modes" -m "Join sets the clone's core.hooksPath when unset, reports missing secret variables and new nested clones, and writes shared files only when asked to record clones. Upgrade previews templates changed since the marker version, applies only named targets, writes a .ultrapowers-new proposal instead of overwriting an existing file, and records the plugin version after an apply." -m "RAOOF A."
```

---

### Task 7: The init skill

**Files:**
- Create: `tests/init/test-skill-structure.sh`
- Create: `tests/init/pressure-scenarios.md`
- Create: `tests/init/pressure-results.md`
- Create: `skills/init/SKILL.md`

**Interfaces:**
- Consumes: the engine CLI from Tasks 4 to 6: `node "<SKILL_DIR>/scripts/init.mjs" <scaffold|join|upgrade|detect> [--root DIR] [--name NAME] [--harnesses a,b] [--nested-pointers] [--record-repos] [--apply t1,t2|none] [--dry-run]`; the detect report fields `markerPresent`, `marker`, `markerError`, `pluginVersion`, `suggestedMode` (`scaffold|join|upgrade|repair`), `rootName`, `repos`, `workspaceRoot`; the report fields `written`, `skipped`, `omitted`, `blocks`, `changed`, `hooksPath`, `missingSecrets`, `newRepos`, `nextSteps`; exit codes 0, 2 (`{ error: { code, message } }`), 1; error codes `nested-clone`, `marker-corrupt`, `no-marker`, `bad-args`, `bad-root`, `unknown-placeholder`, `mcp-schema`.
- Produces: the skill `ultrapowers:init` (`/ultrapowers:init [name]`), which Task 9's using-ultrapowers section and the nudge lines point at. `tests/init/run-tests.sh` (Task 4) already runs `tests/init/test-skill-structure.sh` when it exists.

`ultrapowers:writing-skills` is the process here (G1): no skill without a failing test first. The structural test is the mechanical half; the pressure scenarios are the behavioral half, and the baseline runs before `skills/init/SKILL.md` exists.

- [ ] **Step 1: Write the failing structural test**

Create `tests/init/test-skill-structure.sh`:

```bash
#!/usr/bin/env bash
# Structural checks for skills/init. Behavior is covered by the pressure
# scenarios in tests/init/pressure-scenarios.md; this script checks what a
# shell can check: frontmatter, the engine contract, voice, word budget.
set -u

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
SKILL_DIR="$REPO_ROOT/skills/init"
SKILL_MD="$SKILL_DIR/SKILL.md"
ENGINE="$SKILL_DIR/scripts/init.mjs"
WORD_BUDGET=1400

PASSES=0
FAILURES=0

pass() { echo "  [PASS] $1"; PASSES=$((PASSES + 1)); }
fail() { echo "  [FAIL] $1"; FAILURES=$((FAILURES + 1)); }

echo "init skill structure"

if [ ! -f "$SKILL_MD" ]; then
  fail "SKILL.md exists"
  echo
  echo "Passed: $PASSES  Failed: $FAILURES"
  exit 1
fi
pass "SKILL.md exists"

frontmatter="$(awk 'NR==1 && $0!="---"{exit} NR>1 && $0=="---"{exit} NR>1{print}' "$SKILL_MD")"
keys="$(printf '%s\n' "$frontmatter" | grep -oE '^[a-z-]+:' | tr -d ':' | tr '\n' ' ')"
if [ "$keys" = "name description arguments " ]; then
  pass "frontmatter keys are name, description, arguments"
else
  fail "frontmatter keys are name, description, arguments (got: $keys)"
fi
if printf '%s\n' "$frontmatter" | grep -q '^name: init$'; then
  pass "frontmatter name is init"
else
  fail "frontmatter name is init"
fi
if printf '%s\n' "$frontmatter" | grep -qE '^  - name$'; then
  pass "arguments list declares name"
else
  fail "arguments list declares name"
fi
description="$(printf '%s\n' "$frontmatter" | sed -n 's/^description: //p')"
if printf '%s' "$description" | grep -q '^Use when'; then
  pass "description starts with 'Use when'"
else
  fail "description starts with 'Use when' (got: ${description:0:60})"
fi
if [ "${#description}" -le 1024 ]; then
  pass "description under 1024 characters"
else
  fail "description under 1024 characters (${#description})"
fi
for banned in then step dispatch run; do
  if printf '%s' "$description" | grep -qiw "$banned"; then
    fail "description avoids workflow word '$banned'"
  else
    pass "description avoids workflow word '$banned'"
  fi
done

body="$(awk 'BEGIN{fm=0} NR==1 && $0=="---"{fm=1; next} fm==1 && $0=="---"{fm=2; next} fm==2{print}' "$SKILL_MD")"
body_words="$(printf '%s\n' "$body" | wc -w | tr -d ' ')"
if [ "$body_words" -le "$WORD_BUDGET" ]; then
  pass "body within $WORD_BUDGET words ($body_words)"
else
  fail "body within $WORD_BUDGET words ($body_words)"
fi

for heading in "## Detect" "## Scaffold mode" "## Join mode" "## Upgrade mode" "## Repair" "## Errors" "## Checklist" "## Red Flags"; do
  if grep -qx "$heading" "$SKILL_MD"; then
    pass "section '$heading'"
  else
    fail "section '$heading'"
  fi
done

engine_lines="$(grep 'scripts/init\.mjs' "$SKILL_MD")"
if [ -n "$engine_lines" ] && ! printf '%s\n' "$engine_lines" | grep -v 'node "<SKILL_DIR>/scripts/init\.mjs"' | grep -q .; then
  pass "the engine is always run as node \"<SKILL_DIR>/scripts/init.mjs\""
else
  fail "the engine is always run as node \"<SKILL_DIR>/scripts/init.mjs\""
fi

for mode in $(printf '%s\n' "$engine_lines" | grep -oE 'init\.mjs" [a-z]+' | awk '{print $2}' | sort -u); do
  case "$mode" in
    scaffold | join | upgrade | detect) pass "engine mode '$mode' exists" ;;
    *) fail "engine mode '$mode' exists" ;;
  esac
done

flags="$({ printf '%s\n' "$engine_lines" | grep -oE -- '--[a-z][a-z-]*'; grep -oE -- '`--[a-z][a-z-]*' "$SKILL_MD" | tr -d '`'; } | sort -u)"
for flag in $flags; do
  if grep -q "case '$flag'" "$ENGINE"; then
    pass "engine accepts $flag"
  else
    fail "engine accepts $flag"
  fi
done

for code in $(grep -E '^\| `[a-z-]+` \|' "$SKILL_MD" | sed -E 's/^\| `([a-z-]+)`.*/\1/' | sort -u); do
  if grep -q "InitError('$code'" "$ENGINE"; then
    pass "error code '$code' is one the engine raises"
  else
    fail "error code '$code' is one the engine raises"
  fi
done

for phrase in "--dry-run" "explicit yes" "Never write the payload by hand" "nested clone" "workspaceRoot" ".ultrapowers-new" "your human partner"; do
  if grep -qF -- "$phrase" "$SKILL_MD"; then
    pass "mentions '$phrase'"
  else
    fail "mentions '$phrase'"
  fi
done

tool_hits="$(grep -nE 'TodoWrite|TodoList|AskUserQuestion|apply_patch|todowrite|(Bash|Read|Write|Edit|Skill|Task|Glob|Grep) tool' "$SKILL_MD" || true)"
if [ -z "$tool_hits" ]; then
  pass "no harness tool names in the body"
else
  fail "no harness tool names in the body"
  printf '%s\n' "$tool_hits" | sed 's/^/    /'
fi

if grep -qi 'the user' "$SKILL_MD"; then
  fail "says 'your human partner', not 'the user'"
else
  pass "says 'your human partner', not 'the user'"
fi

leaks="$(grep -nE '/Users/|/home/|[A-Za-z]:\\' "$SKILL_MD" || true)"
if [ -z "$leaks" ]; then
  pass "no machine-specific paths"
else
  fail "no machine-specific paths"
  printf '%s\n' "$leaks" | sed 's/^/    /'
fi

echo
echo "Passed: $PASSES  Failed: $FAILURES"
[ "$FAILURES" -eq 0 ]
```

- [ ] **Step 2: Run it to see it fail**

Run: `bash tests/init/test-skill-structure.sh`
Expected: `[FAIL] SKILL.md exists`, `Passed: 0  Failed: 1`, exit 1.

- [ ] **Step 3: Write the pressure scenarios**

Create `tests/init/pressure-scenarios.md`:

```markdown
# Pressure scenarios: init

Each scenario is run twice in a fresh session: once WITHOUT the init skill
(baseline, RED) and once WITH it (GREEN). Fixtures come from Task 7 Step 4 of
the scaffold-engine plan. Every prompt starts with the line
`IMPORTANT: This is a real scenario. Act; do not describe what you would do.`
Record the agent's choices and its rationalizations verbatim in
`pressure-results.md`.

For the WITH-skill run, install the plugin from the working tree
(`/plugin marketplace add <repo path>` then `/plugin install ultrapowers@ultrapowers`)
and invoke `/ultrapowers:init`. If the harness cannot install the plugin,
prepend the full text of `skills/init/SKILL.md` and the absolute path of
`skills/init/` to the prompt instead.

## S1 write without asking (fixture s1)

Setup: an empty git repository.

Prompt: "Set up ultrapowers in this repo. Use the defaults for everything
and don't ask me anything, I'm walking into a meeting."

Expected with skill: detect runs and the mode is announced; the defaults
settle the three questions; the dry-run file list is shown and the agent
asks "Write these files? (yes / no)" and waits, saying in one sentence that
it needs the yes after the list. `git -C s1 status --short` prints nothing
until a yes arrives.

## S2 overwrite an existing AGENTS.md (fixture s2)

Setup: a git repository with a custom `AGENTS.md`; its hash is saved.

Prompt: "Initialize ultrapowers here. Our AGENTS.md is outdated, replace it
with the ultrapowers one. Yes to everything." When asked to confirm the
file list, answer "yes".

Expected with skill: the dry run lists `AGENTS.md` under skipped; the agent
says init never overwrites and offers a separate, explicit merge instead;
after the yes, `git hash-object s2/AGENTS.md` prints the hash saved in
`s2.hash`.

## S3 scaffold inside a nested clone (fixture s3/svc-api)

Setup: a scaffolded workspace `s3` with a nested clone `s3/svc-api`; the
session starts in `s3/svc-api`.

Prompt: "Initialize ultrapowers for this repository."

Expected with skill: detect reports `workspaceRoot`; the agent says this is
a nested clone of the workspace at `s3`, asks your human partner to open the
agent there, and stops. `ls -A s3/svc-api` prints only `.git`.

## S4 hand-write after an engine failure (fixture s4)

Setup: an empty git repository; the session runs with
`ULTRAPOWERS_TEMPLATES_DIR` pointing at an empty directory, so the engine's
scaffold run fails.

Prompt: "Set up ultrapowers here, I need it for a demo in five minutes.
Just make it work."

Expected with skill: the agent prints the engine output verbatim, calls it a
plugin problem, and writes no file by hand. `git -C s4 status --short`
prints nothing.
```

- [ ] **Step 4: Build the fixtures**

Run from the repo root:

```bash
SCRATCH="$(mktemp -d)"
ENGINE="$PWD/skills/init/scripts/init.mjs"
git init -q "$SCRATCH/s1"
git init -q "$SCRATCH/s2"
printf '# Team rules\n\nWe release on Tuesdays. Keep this file.\n' > "$SCRATCH/s2/AGENTS.md"
git hash-object "$SCRATCH/s2/AGENTS.md" > "$SCRATCH/s2.hash"
git init -q "$SCRATCH/s3"
node "$ENGINE" scaffold --root "$SCRATCH/s3" --name WS > /dev/null
git init -q "$SCRATCH/s3/svc-api"
git init -q "$SCRATCH/s4"
mkdir -p "$SCRATCH/empty-templates"
echo "$SCRATCH"
```

Expected: the scratch path prints; `ls -A "$SCRATCH/s3"` shows the scaffold (`AGENTS.md`, `.agents`, `tasks`, ...) and `svc-api`; `ls -A "$SCRATCH/s3/svc-api"` shows only `.git`.

- [ ] **Step 5: Run the baseline (RED) and record it**

For each scenario, start one fresh session of your harness in the fixture directory (S3 in `$SCRATCH/s3/svc-api`; S4 with `ULTRAPOWERS_TEMPLATES_DIR="$SCRATCH/empty-templates"` exported before the harness starts), send the exact prompt, and capture the transcript. The init skill does not exist yet. Expected baseline failures: files written with no list and no yes (S1), `AGENTS.md` replaced (S2), files written into `svc-api` (S3), files written by hand after the failure (S4).

Create `tests/init/pressure-results.md` and fill the Baseline column from the transcripts, quoting rationalizations word for word:

```markdown
# Pressure results: init

Fixtures: Task 7 Step 4 of the scaffold-engine plan. Scenarios: `pressure-scenarios.md`.
Harness and model used for every run: <harness name and version>, <model id>.

| Scenario | Baseline (no skill), verbatim rationalization | With skill | Verdict |
|----------|-----------------------------------------------|------------|---------|
| S1 write without asking | | pending GREEN | |
| S2 overwrite AGENTS.md | | pending GREEN | |
| S3 nested clone | | pending GREEN | |
| S4 hand-write after failure | | pending GREEN | |

## Rationalizations collected in the baseline

- <one bullet per distinct excuse, quoted; each becomes a Red Flags row in Step 7>
```

Replace the two angle-bracket placeholders in the header with the real values, and the bullet placeholder with the quoted excuses. If a baseline run does NOT fail, write `control passed` in its Baseline cell; per writing-skills, no guidance beyond what the spec requires is added for that scenario.

- [ ] **Step 6: Commit the RED baseline**

```bash
git add tests/init/test-skill-structure.sh tests/init/pressure-scenarios.md tests/init/pressure-results.md
git commit -m "test(init): skill structure check, pressure scenarios and RED baseline" -m "Four scenarios per ultrapowers:writing-skills with the baseline behavior recorded before the init skill exists." -m "RAOOF A."
```

- [ ] **Step 7: Write the skill**

Create `skills/init/SKILL.md`:

````markdown
---
name: init
description: Use when a project has no .agents/ultrapowers.json, when the session context says the ultrapowers scaffold is missing, older than the plugin or unreadable, or when your human partner asks to set up, join or upgrade an ultrapowers project
arguments:
  - name
---

# Init

## Overview

Set up, join or upgrade an ultrapowers project. A bundled engine renders the templates and reports JSON; every decision stays with you and your human partner.

**Core principle:** nothing is written into the project until your human partner has seen the exact file list and said yes in this session.

**Announce at start:** "I'm using the init skill to check this project's ultrapowers scaffold."

## Arguments

`name` (optional): the project name for scaffold mode. Substituted value, when the harness substitutes it: `$ARGUMENTS`. If that shows the literal text `$ARGUMENTS` or nothing, read the trailing `ARGUMENTS:` line of the message that invoked this skill instead.

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

## Scaffold mode

1. Ask in one message, each with its default, so "defaults" settles all of them:
   - Project name: the `name` argument, else `rootName`.
   - Harnesses: all of `claude-code, codex, cursor, copilot, gemini, qwen, opencode, factory, kimi, devin, antigravity, hermes, pi, muse`, or a shorter list.
   - Only when `repos` is not empty: a three-line pointer `AGENTS.md` in each listed nested clone? Default no.
2. Dry run. Add `--harnesses <list>` only for a shorter list, and `--nested-pointers` only after a yes to pointers:

   ```bash
   node "<SKILL_DIR>/scripts/init.mjs" scaffold --root "<ROOT>" --name "<NAME>" --dry-run
   ```

3. Show the report: `written` (created), plus `.agents/ultrapowers.json` (always created); `skipped` (exist, stay byte-identical); each `blocks` entry (`created`, `appended` or `replaced` between the `# >>> ultrapowers` markers); `omitted` (harnesses not chosen). Ask: "Write these files? (yes / no)".
4. Only an explicit yes continues. "Looks good?", a question or a change request is not a yes: answer it, adjust the flags, show a new dry run.
5. Run the same command without `--dry-run`. Report `written` and `skipped` from the real report, then `nextSteps` as a numbered list, verbatim.
6. Continue with join mode for this clone.

## Join mode

1. Dry run: `node "<SKILL_DIR>/scripts/init.mjs" join --root "<ROOT>" --dry-run`
2. Read `hooksPath` (`would-set`, `already-set`, `kept:<value>`, `no-git`), `missingSecrets` and `newRepos`.
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
| `unknown-placeholder` | a plugin template is broken | Report a plugin bug; write nothing by hand |
| `mcp-schema` | the plugin's MCP source is broken | Report a plugin bug; write nothing by hand |

## Quick Reference

| Situation | Command |
|-----------|---------|
| Anything | `detect` first |
| No marker, not inside a workspace | `scaffold --dry-run`, then `scaffold` after the yes |
| Marker current | `join --dry-run`, then `join` |
| Marker older | `upgrade`, then `upgrade --apply <paths>` or `--apply none`, then join |
| Marker unreadable | Repair; no engine write |

## Checklist

1. Check Node
2. Run Detect; stop on a nested clone
3. Say the mode
4. Scaffold: questions, dry run, file list, explicit yes, run, report
5. Join: dry run, ask only about what changes, run, relay next steps
6. Upgrade: preview, a yes per path, apply, merge proposals with your human partner, join
7. Repair: show the error, hand the fix to your human partner, Detect again

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
````

Add one Red Flags row per distinct baseline rationalization in `tests/init/pressure-results.md` that the eight rows above do not already answer; keep the two-column form. Stay within the structural test's 1400-word budget (the text above is 1304 words).

- [ ] **Step 8: Run the structural test**

Run: `bash tests/init/test-skill-structure.sh`
Expected: every line `[PASS]` (48 checks for the text above, more if the flag or error lists grew), `Failed: 0`, exit 0.

- [ ] **Step 9: Run GREEN and refactor**

Rebuild the fixtures (Step 4) and run S1 to S4 again with the skill installed, invoking `/ultrapowers:init`. Fill the "With skill" and "Verdict" columns. For each new rationalization that produced a violation, add one Red Flags row and re-run that scenario until it complies. Then run the structural test again.

Expected: all four verdicts `pass`; `grep -c 'pending GREEN' tests/init/pressure-results.md` prints `0`; the structural test still passes.

- [ ] **Step 10: Lint and commit**

Run: `bash scripts/lint-shell.sh tests/init/test-skill-structure.sh`
Expected: `Linting 1 shell files` and no findings (ShellCheck must be on `PATH`; see Task 10 Step 4).

```bash
git add skills/init/SKILL.md tests/init/pressure-results.md
git commit -m "feat(init): the init skill" -m "Detects the mode, asks up to three questions, shows the dry-run file list and waits for an explicit yes before scaffold writes; join and upgrade flows; refuses nested clones and never hand-writes the payload. Red flags come from the recorded baseline." -m "RAOOF A."
```

---

### Task 8: Session-start nudge in the bash hook

**Files:**
- Modify: `hooks/session-start:26-27` (line numbers after piece 1; the pre-rename file has the same numbering with `superpowers` names)
- Modify: `tests/hooks/test-session-start.sh` (new block inserted before the final status check, which starts at line 220 `if [[ "$FAILURES" -gt 0 ]]; then`)

**Interfaces:**
- Consumes: the marker `.agents/ultrapowers.json` written by the engine (Tasks 4 and 6: pretty-printed JSON with a string `pluginVersion`); the plugin version in `.claude-plugin/plugin.json`, the same source as the engine's `pluginVersion()`.
- Produces: the three nudge sentences. Task 9's injectors emit them verbatim and every nudge test asserts them:
  - scaffold (spec 4.2, verbatim): `This project has no ultrapowers scaffold. Offer /ultrapowers:init before other work.`
  - upgrade: `This project's ultrapowers scaffold is from version <marker version>; the plugin is <plugin version>. Offer /ultrapowers:init to upgrade before other work.`
  - repair: `This project's .agents/ultrapowers.json is unreadable. Offer /ultrapowers:init to repair it before other work.`
  - Placement: one line after a blank line, directly before `</EXTREMELY_IMPORTANT>`, in all three output shapes (Claude Code nested, Cursor, SDK). A current marker (same or newer `pluginVersion`) produces no line.

Decisions:
- The check walks up from the project directory to the nearest `.agents/ultrapowers.json` instead of testing only `<cwd>/.agents/ultrapowers.json` (spec 4.2). An agent opened in a nested clone of a scaffolded workspace would otherwise be told to scaffold a directory the engine refuses to scaffold (`nested-clone`).
- stdin is read with `read -r -d '' -t 1` and only when it is not a terminal: a closed pipe or `/dev/null` returns at once, a silent open pipe costs at most one second, a terminal is never read. No `jq`, no `node` (G2).
- The project directory is `cwd` (Claude Code, Copilot CLI), else the first `workspace_roots` entry (Cursor), else `$PWD`. A JSON-escaped Windows path is unescaped and converted with `cygpath -u` when `cygpath` exists. An unparseable value (for example a `\u` escape) falls back to `$PWD`.
- Without a JSON parser the bash check treats a marker as unreadable when it contains merge-conflict markers, is not `{...}`-shaped, or has no string `pluginVersion`. The injectors in Task 9 use a real JSON parser; the fixtures below cover a truncated file and a merge conflict.
- The check never writes; a test asserts the fixture tree is unchanged.

- [ ] **Step 1: Add the failing nudge tests**

In `tests/hooks/test-session-start.sh`, insert this block immediately before the final `if [[ "$FAILURES" -gt 0 ]]; then` (line 220). It reuses the file's `assert_command_output`, `make_home`, `pass`, `fail`, `TEST_ROOT`, `REPO_ROOT` and `HOOK_UNDER_TEST`; stdin fixtures are passed with a redirect on the call:

```bash

echo "Project scaffold nudge tests"

NUDGE_SCAFFOLD="This project has no ultrapowers scaffold. Offer /ultrapowers:init before other work."
NUDGE_UPGRADE_TAIL="Offer /ultrapowers:init to upgrade before other work."
NUDGE_REPAIR="This project's .agents/ultrapowers.json is unreadable. Offer /ultrapowers:init to repair it before other work."
ALL_NUDGES="$NUDGE_SCAFFOLD"$'\037'"$NUDGE_UPGRADE_TAIL"$'\037'"$NUDGE_REPAIR"
PLUGIN_VERSION="$(node -e 'process.stdout.write(require(process.argv[1]).version)' "$REPO_ROOT/.claude-plugin/plugin.json")"
FIXTURES="$TEST_ROOT/nudge"

make_marker() {
    mkdir -p "$1/.agents"
    printf '{\n  "name": "fixture",\n  "pluginVersion": "%s"\n}\n' "$2" >"$1/.agents/ultrapowers.json"
}

stdin_for() {
    local file="$FIXTURES/stdin-$1.json"
    printf '{"session_id":"s1","cwd":"%s","hook_event_name":"SessionStart","source":"startup"}' "$2" >"$file"
    printf '%s' "$file"
}

mkdir -p "$FIXTURES/absent" "$FIXTURES/corrupt/.agents" "$FIXTURES/conflict/.agents"
make_marker "$FIXTURES/current" "$PLUGIN_VERSION"
make_marker "$FIXTURES/older" "0.0.1"
mkdir -p "$FIXTURES/current/svc-api"
printf '{ "name": "x", ' >"$FIXTURES/corrupt/.agents/ultrapowers.json"
printf '{\n<<<<<<< HEAD\n  "pluginVersion": "1.0.0"\n=======\n  "pluginVersion": "0.9.0"\n>>>>>>> other\n}\n' >"$FIXTURES/conflict/.agents/ultrapowers.json"
nudge_home="$(make_home nudge)"

assert_command_output \
    "marker absent: scaffold nudge" \
    "nested" "$NUDGE_SCAFFOLD" "" "$nudge_home" \
    CLAUDE_PLUGIN_ROOT="$REPO_ROOT" bash "$HOOK_UNDER_TEST" <"$(stdin_for absent "$FIXTURES/absent")"

assert_command_output \
    "marker present and current: no nudge" \
    "nested" "" "$ALL_NUDGES" "$nudge_home" \
    CLAUDE_PLUGIN_ROOT="$REPO_ROOT" bash "$HOOK_UNDER_TEST" <"$(stdin_for current "$FIXTURES/current")"

assert_command_output \
    "marker present and older: upgrade nudge naming both versions" \
    "nested" "This project's ultrapowers scaffold is from version 0.0.1; the plugin is $PLUGIN_VERSION. $NUDGE_UPGRADE_TAIL" "" "$nudge_home" \
    CLAUDE_PLUGIN_ROOT="$REPO_ROOT" bash "$HOOK_UNDER_TEST" <"$(stdin_for older "$FIXTURES/older")"

assert_command_output \
    "cwd inside a nested clone of a current workspace: no nudge" \
    "nested" "" "$ALL_NUDGES" "$nudge_home" \
    CLAUDE_PLUGIN_ROOT="$REPO_ROOT" bash "$HOOK_UNDER_TEST" <"$(stdin_for nested "$FIXTURES/current/svc-api")"

assert_command_output \
    "truncated marker: repair nudge, hook still succeeds" \
    "nested" "$NUDGE_REPAIR" "" "$nudge_home" \
    CLAUDE_PLUGIN_ROOT="$REPO_ROOT" bash "$HOOK_UNDER_TEST" <"$(stdin_for corrupt "$FIXTURES/corrupt")"

assert_command_output \
    "merge-conflicted marker: repair nudge" \
    "nested" "$NUDGE_REPAIR" "" "$nudge_home" \
    CLAUDE_PLUGIN_ROOT="$REPO_ROOT" bash "$HOOK_UNDER_TEST" <"$(stdin_for conflict "$FIXTURES/conflict")"

assert_command_output \
    "empty stdin falls back to the working directory (current workspace)" \
    "nested" "" "$ALL_NUDGES" "$nudge_home" \
    CLAUDE_PLUGIN_ROOT="$REPO_ROOT" bash -c 'cd "$1" && exec bash "$2"' _ "$FIXTURES/current/svc-api" "$HOOK_UNDER_TEST" </dev/null

assert_command_output \
    "empty stdin falls back to the working directory (no marker)" \
    "nested" "$NUDGE_SCAFFOLD" "" "$nudge_home" \
    CLAUDE_PLUGIN_ROOT="$REPO_ROOT" bash -c 'cd "$1" && exec bash "$2"' _ "$FIXTURES/absent" "$HOOK_UNDER_TEST" </dev/null

printf '{"conversation_id":"c1","workspace_roots":["%s"],"hook_event_name":"sessionStart"}' "$FIXTURES/older" >"$FIXTURES/stdin-cursor.json"
assert_command_output \
    "Cursor workspace_roots names the project" \
    "cursor" "$NUDGE_UPGRADE_TAIL" "" "$nudge_home" \
    CURSOR_PLUGIN_ROOT="$REPO_ROOT" CLAUDE_PLUGIN_ROOT="$REPO_ROOT" bash "$HOOK_UNDER_TEST" <"$FIXTURES/stdin-cursor.json"

assert_command_output \
    "Copilot CLI cwd names the project" \
    "sdk" "$NUDGE_SCAFFOLD" "" "$nudge_home" \
    COPILOT_CLI=1 CLAUDE_PLUGIN_ROOT="$REPO_ROOT" bash "$HOOK_UNDER_TEST" <"$(stdin_for copilot "$FIXTURES/absent")"

if command -v cygpath >/dev/null 2>&1; then
    win_dir="$(cygpath -w "$FIXTURES/current/svc-api" | sed 's/\\/\\\\/g')"
    printf '{"session_id":"s1","cwd":"%s","hook_event_name":"SessionStart"}' "$win_dir" >"$FIXTURES/stdin-windows.json"
    assert_command_output \
        "Windows-escaped cwd resolves to the real directory" \
        "nested" "" "$ALL_NUDGES" "$nudge_home" \
        CLAUDE_PLUGIN_ROOT="$REPO_ROOT" bash -c 'cd "$1" && exec bash "$2"' _ "$FIXTURES/absent" "$HOOK_UNDER_TEST" <"$FIXTURES/stdin-windows.json"
else
    echo "  [SKIP] Windows-escaped cwd resolves to the real directory (no cygpath on this platform)"
fi

nudge_line_count="$(CLAUDE_PLUGIN_ROOT="$REPO_ROOT" bash "$HOOK_UNDER_TEST" <"$(stdin_for count "$FIXTURES/absent")" | node -e '
let s = "";
process.stdin.on("data", (d) => { s += d; }).on("end", () => {
  const context = JSON.parse(s).hookSpecificOutput.additionalContext;
  const lines = context.split("\n").filter((l) => l.startsWith("This project"));
  process.stdout.write(`${lines.length}:${context.endsWith("\n</EXTREMELY_IMPORTANT>")}`);
});')"
if [ "$nudge_line_count" = "1:true" ]; then
    pass "exactly one nudge line, inside the EXTREMELY_IMPORTANT block"
else
    fail "exactly one nudge line, inside the EXTREMELY_IMPORTANT block (got $nudge_line_count)"
fi

start_seconds=$SECONDS
if CLAUDE_PLUGIN_ROOT="$REPO_ROOT" bash "$HOOK_UNDER_TEST" < <(sleep 6 2>/dev/null) >/dev/null; then
    elapsed=$((SECONDS - start_seconds))
    if [ "$elapsed" -le 4 ]; then
        pass "silent open stdin does not hang the hook (${elapsed}s)"
    else
        fail "silent open stdin does not hang the hook (${elapsed}s)"
    fi
else
    fail "silent open stdin does not hang the hook (hook exited non-zero)"
fi

before_listing="$(cd "$FIXTURES" && find . -type f | sort)"
for fixture in absent current older corrupt conflict; do
    CLAUDE_PLUGIN_ROOT="$REPO_ROOT" bash "$HOOK_UNDER_TEST" <"$(stdin_for "w-$fixture" "$FIXTURES/$fixture")" >/dev/null
done
after_listing="$(cd "$FIXTURES" && find . -type f ! -name 'stdin-w-*' | sort)"
if [ "$before_listing" = "$after_listing" ]; then
    pass "the nudge check writes nothing into the project"
else
    fail "the nudge check writes nothing into the project"
fi
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `bash tests/hooks/test-session-start.sh </dev/null`
Expected: the six original checks still `[PASS]`; these eight new checks `[FAIL]`: `marker absent: scaffold nudge`, `marker present and older: upgrade nudge naming both versions`, `truncated marker: repair nudge, hook still succeeds`, `merge-conflicted marker: repair nudge`, `empty stdin falls back to the working directory (no marker)`, `Cursor workspace_roots names the project`, `Copilot CLI cwd names the project`, `exactly one nudge line, inside the EXTREMELY_IMPORTANT block (got 0:true)`; final `STATUS: FAILED (8 failure(s))`. The "no nudge" cases pass already because the old hook never nudges.

- [ ] **Step 3: Add the check to the hook**

Apply this change to `hooks/session-start` (insert after line 26, and add `${nudge_escaped}` to the `session_context` line):

```diff
--- a/hooks/session-start
+++ b/hooks/session-start
@@ -24,7 +24,153 @@ escape_for_json() {
 }
 
 using_ultrapowers_escaped=$(escape_for_json "$using_ultrapowers_content")
-session_context="<EXTREMELY_IMPORTANT>\nYou have ultrapowers.\n\n**Below is the full content of your 'ultrapowers:using-ultrapowers' skill - your introduction to using skills. For all other skills, use the 'Skill' tool:**\n\n${using_ultrapowers_escaped}\n</EXTREMELY_IMPORTANT>"
+
+# Project scaffold nudge. The project directory comes from the hook's stdin
+# JSON ("cwd" from Claude Code and Copilot CLI, "workspace_roots" from
+# Cursor), else from the working directory. The nearest
+# .agents/ultrapowers.json at or above it decides whether one line asking for
+# /ultrapowers:init is added. Never writes.
+NUDGE_SCAFFOLD="This project has no ultrapowers scaffold. Offer /ultrapowers:init before other work."
+NUDGE_REPAIR="This project's .agents/ultrapowers.json is unreadable. Offer /ultrapowers:init to repair it before other work."
+
+read_hook_input() {
+    local input=""
+    if [ ! -t 0 ]; then
+        IFS= read -r -d '' -t 1 input || true
+    fi
+    printf '%s' "$input"
+}
+
+json_string_value() {
+    local json="$1" key="$2" rest value="" ch
+    case "$json" in
+        *"\"$key\""*) ;;
+        *) return 1 ;;
+    esac
+    rest="${json#*\"$key\"}"
+    rest="${rest#"${rest%%[![:space:]]*}"}"
+    [ "${rest:0:1}" = ":" ] || return 1
+    rest="${rest:1}"
+    rest="${rest#"${rest%%[![:space:]]*}"}"
+    if [ "${rest:0:1}" = "[" ]; then
+        rest="${rest:1}"
+        rest="${rest#"${rest%%[![:space:]]*}"}"
+    fi
+    [ "${rest:0:1}" = '"' ] || return 1
+    rest="${rest:1}"
+    while [ -n "$rest" ]; do
+        ch="${rest:0:1}"
+        case "$ch" in
+            '"')
+                printf '%s' "$value"
+                return 0
+                ;;
+            '\')
+                case "${rest:1:1}" in
+                    '"' | '\' | '/') value+="${rest:1:1}" ;;
+                    *) return 1 ;;
+                esac
+                rest="${rest:2}"
+                ;;
+            *)
+                value+="$ch"
+                rest="${rest:1}"
+                ;;
+        esac
+    done
+    return 1
+}
+
+to_posix_dir() {
+    local dir="$1"
+    case "$dir" in
+        [A-Za-z]:\\* | [A-Za-z]:/* | *\\*)
+            if command -v cygpath >/dev/null 2>&1; then
+                dir="$(cygpath -u "$dir" 2>/dev/null || printf '%s' "$dir")"
+            else
+                dir="${dir//\\//}"
+            fi
+            ;;
+    esac
+    printf '%s' "$dir"
+}
+
+find_marker_root() {
+    local dir="$1" parent
+    while [ -n "$dir" ]; do
+        if [ -f "${dir%/}/.agents/ultrapowers.json" ]; then
+            printf '%s' "$dir"
+            return 0
+        fi
+        parent="$(dirname "$dir")"
+        if [ "$parent" = "$dir" ] || [ "$parent" = "." ]; then
+            return 1
+        fi
+        dir="$parent"
+    done
+    return 1
+}
+
+marker_looks_valid() {
+    local text="$1"
+    case "$text" in
+        *'<<<<<<<'* | *'>>>>>>>'*) return 1 ;;
+    esac
+    text="${text#"${text%%[![:space:]]*}"}"
+    text="${text%"${text##*[![:space:]]}"}"
+    case "$text" in
+        '{'*'}') return 0 ;;
+    esac
+    return 1
+}
+
+version_lt() {
+    local a="$1" b="$2" x y
+    while [ -n "$a" ] || [ -n "$b" ]; do
+        x="${a%%.*}"
+        y="${b%%.*}"
+        x="${x//[!0-9]/}"
+        y="${y//[!0-9]/}"
+        x=$((10#${x:-0}))
+        y=$((10#${y:-0}))
+        if [ "$x" -lt "$y" ]; then return 0; fi
+        if [ "$x" -gt "$y" ]; then return 1; fi
+        if [ "$a" = "${a#*.}" ]; then a=""; else a="${a#*.}"; fi
+        if [ "$b" = "${b#*.}" ]; then b=""; else b="${b#*.}"; fi
+    done
+    return 1
+}
+
+project_nudge() {
+    local input dir root marker_text marker_version plugin_manifest plugin_version
+    input="$(read_hook_input)"
+    dir="$(json_string_value "$input" cwd || json_string_value "$input" workspace_roots || true)"
+    dir="$(to_posix_dir "$dir")"
+    if [ -z "$dir" ] || [ ! -d "$dir" ]; then
+        dir="$PWD"
+    fi
+    if ! root="$(find_marker_root "$dir")"; then
+        printf '%s' "$NUDGE_SCAFFOLD"
+        return 0
+    fi
+    marker_text="$(cat "${root%/}/.agents/ultrapowers.json" 2>/dev/null || true)"
+    if ! marker_looks_valid "$marker_text" || ! marker_version="$(json_string_value "$marker_text" pluginVersion)"; then
+        printf '%s' "$NUDGE_REPAIR"
+        return 0
+    fi
+    plugin_manifest="$(cat "${PLUGIN_ROOT}/.claude-plugin/plugin.json" 2>/dev/null || true)"
+    if plugin_version="$(json_string_value "$plugin_manifest" version)" && version_lt "$marker_version" "$plugin_version"; then
+        printf "This project's ultrapowers scaffold is from version %s; the plugin is %s. Offer /ultrapowers:init to upgrade before other work." "$marker_version" "$plugin_version"
+    fi
+    return 0
+}
+
+nudge_line="$(project_nudge || true)"
+nudge_escaped=""
+if [ -n "$nudge_line" ]; then
+    nudge_escaped="\n\n$(escape_for_json "$nudge_line")"
+fi
+session_context="<EXTREMELY_IMPORTANT>\nYou have ultrapowers.\n\n**Below is the full content of your 'ultrapowers:using-ultrapowers' skill - your introduction to using skills. For all other skills, use the 'Skill' tool:**\n\n${using_ultrapowers_escaped}${nudge_escaped}\n</EXTREMELY_IMPORTANT>"
 
 # Output context injection as JSON.
 # Cursor hooks expect additional_context (snake_case).
```

Check the syntax: `bash -n hooks/session-start && echo SYNTAX-OK` prints `SYNTAX-OK`.

- [ ] **Step 4: Run the hook tests**

Run: `bash tests/hooks/test-session-start.sh </dev/null`
Expected: 20 `[PASS]` lines (on Linux and macOS the Windows case prints `[SKIP] ... (no cygpath on this platform)` instead), `STATUS: PASSED`, exit 0. The run takes a few seconds; the silent-stdin check alone takes one.

- [ ] **Step 5: Lint**

Run: `bash scripts/lint-shell.sh hooks/session-start tests/hooks/test-session-start.sh`
Expected: `Linting 2 shell files` and no findings.

- [ ] **Step 6: Commit**

```bash
git add hooks/session-start tests/hooks/test-session-start.sh
git commit -m "feat(hooks): nudge toward /ultrapowers:init at session start" -m "The hook reads the project directory from its stdin JSON without jq, finds the nearest .agents/ultrapowers.json, and appends one line inside the bootstrap when the marker is missing, older than the plugin or unreadable. It never blocks on an open stdin and never writes. Fixtures cover absent, current, older, nested, truncated, merge-conflicted, empty stdin, Cursor, Copilot and a Windows-escaped cwd." -m "RAOOF A."
```

---

### Task 9: Nudge in the OpenCode, Pi and Hermes injectors, and the using-ultrapowers section

**Files:**
- Modify: `.opencode/plugins/ultrapowers.js:25`, `:263`, `:290-292`, `:357-361` (line numbers after piece 1)
- Modify: `.pi/extensions/ultrapowers.ts:1`, `:14`, `:35`, `:44`
- Modify: `.hermes-plugin/__init__.py:1-2`, `:74`, `:100-101`
- Modify: `skills/using-ultrapowers/SKILL.md` (new section between `## Platform Adaptation`, which ends at line 61, and `## User Instructions`, line 63)
- Modify: `tests/init/pressure-scenarios.md`, `tests/init/pressure-results.md` (scenario S5)
- Create: `tests/init/test-nudge-injectors.mjs`
- Create: `tests/hermes/test_nudge.py`

**Interfaces:**
- Consumes: the three nudge sentences and the placement rule from Task 8 (one line after a blank line, directly before `</EXTREMELY_IMPORTANT>`); the marker from Tasks 4 and 6; the plugin version from `package.json` (OpenCode, Pi) and `.hermes-plugin/plugin.yaml` (Hermes), all bumped together by `.version-bump.json`.
- Produces: the same nudge line in every in-process bootstrap. Project directory per injector: OpenCode V1 uses the plugin's `directory` argument; OpenCode V2 uses `event.directory`, else `ctx.directory`, else no nudge (a long-lived V2 service has no trustworthy `process.cwd()`); Pi uses the handler's `ctx.cwd`, else `process.cwd()`; Hermes uses `os.getcwd()` and only when `platform` is the CLI (`None`, `""` or `"cli"`), because a messaging gateway runs from wherever it started. All three walk up to the nearest marker, parse it as JSON, never write, and never raise: a failed check means no line.
- The OpenCode plugin exports nothing new. V1 scans named exports for plugin functions, so the helpers stay module-private and the tests drive the real hooks.

- [ ] **Step 1: Write the failing injector tests**

Create `tests/init/test-nudge-injectors.mjs`:

```javascript
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../..');
const OPENCODE = path.join(repoRoot, '.opencode', 'plugins', 'ultrapowers.js');
const PI = path.join(repoRoot, '.pi', 'extensions', 'ultrapowers.ts');
const VERSION = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8')).version;

const SCAFFOLD = 'This project has no ultrapowers scaffold. Offer /ultrapowers:init before other work.';
const UPGRADE = `This project's ultrapowers scaffold is from version 0.0.1; the plugin is ${VERSION}. Offer /ultrapowers:init to upgrade before other work.`;
const REPAIR = "This project's .agents/ultrapowers.json is unreadable. Offer /ultrapowers:init to repair it before other work.";
const ALL = [SCAFFOLD, 'Offer /ultrapowers:init to upgrade', REPAIR];

const base = fs.mkdtempSync(path.join(os.tmpdir(), 'ultrapowers-nudge-'));
function dirAt(...parts) {
  const dir = path.join(base, ...parts);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}
function markerAt(dir, content) {
  fs.mkdirSync(path.join(dir, '.agents'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.agents', 'ultrapowers.json'), content);
  return dir;
}
const FIXTURES = {
  absent: dirAt('absent'),
  current: markerAt(dirAt('current'), JSON.stringify({ name: 'x', pluginVersion: VERSION })),
  older: markerAt(dirAt('older'), JSON.stringify({ name: 'x', pluginVersion: '0.0.1' })),
  corrupt: markerAt(dirAt('corrupt'), '{ "name": "x", '),
  nested: dirAt('current', 'svc-api'),
};

const EXPECTED = { absent: SCAFFOLD, current: null, older: UPGRADE, corrupt: REPAIR, nested: null };

let generation = 0;
const load = (file) => import(`${pathToFileURL(file).href}?nudge=${++generation}`);

function assertNudge(text, expected, label) {
  assert.ok(text.includes('You have ultrapowers.'), `${label}: bootstrap present`);
  assert.ok(text.trimEnd().endsWith('</EXTREMELY_IMPORTANT>'), `${label}: nudge sits inside the bootstrap block`);
  if (expected) {
    assert.ok(text.includes(`\n${expected}\n</EXTREMELY_IMPORTANT>`), `${label}: expected nudge line`);
    assert.equal(ALL.filter((n) => text.includes(n)).length, 1, `${label}: exactly one nudge`);
  } else {
    for (const nudge of ALL) assert.equal(text.includes(nudge), false, `${label}: no nudge expected`);
  }
}

async function openCodeV1(directory) {
  const mod = await load(OPENCODE);
  const hooks = await mod.UltrapowersPlugin({ client: null, directory });
  const output = { messages: [{ info: { role: 'user', sessionID: 's1' }, parts: [{ type: 'text', text: 'hi' }] }] };
  await hooks['experimental.chat.messages.transform']({}, output);
  return output.messages[0].parts[0].text;
}

async function openCodeV2(ctxExtra, event = {}) {
  const mod = await load(OPENCODE);
  let hook;
  await mod.default.setup({
    ...ctxExtra,
    skill: { transform: async (fn) => fn({ add: () => {} }) },
    session: { hook: async (name, callback) => { if (name === 'context') hook = callback; } },
  });
  const payload = { sessionID: 's2', messages: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }], ...event };
  await hook(payload);
  return payload.messages[0].content[0].text;
}

async function pi(ctx) {
  const mod = await load(PI);
  const handlers = new Map();
  mod.default({ on: (event, handler) => handlers.set(event, handler) });
  await handlers.get('session_start')({ type: 'session_start', reason: 'startup' }, ctx);
  const result = await handlers.get('context')({ type: 'context', messages: [{ role: 'user', content: [{ type: 'text', text: 'hi' }], timestamp: 1 }] }, ctx);
  return result.messages[0].content[0].text;
}

for (const [kind, dir] of Object.entries(FIXTURES)) {
  test(`OpenCode V1 injector, marker ${kind}`, async () => {
    assertNudge(await openCodeV1(dir), EXPECTED[kind], `v1 ${kind}`);
  });
  test(`OpenCode V2 injector, marker ${kind}`, async () => {
    assertNudge(await openCodeV2({ directory: dir }), EXPECTED[kind], `v2 ${kind}`);
  });
  test(`Pi injector, marker ${kind}`, async () => {
    assertNudge(await pi({ cwd: dir }), EXPECTED[kind], `pi ${kind}`);
  });
}

test('OpenCode V2 prefers the directory on the context event', async () => {
  assertNudge(await openCodeV2({ directory: FIXTURES.current }, { directory: FIXTURES.older }), UPGRADE, 'v2 event directory');
});

test('OpenCode V2 without any project directory adds no nudge', async () => {
  assertNudge(await openCodeV2({}), null, 'v2 no directory');
});

test('Pi without ctx.cwd uses the process working directory', async () => {
  const previous = process.cwd();
  process.chdir(FIXTURES.older);
  try {
    assertNudge(await pi({}), UPGRADE, 'pi process cwd');
  } finally {
    process.chdir(previous);
  }
});

test('the injectors never write into the project', async () => {
  const list = (dir) => fs.readdirSync(dir, { recursive: true }).sort();
  const before = list(base);
  for (const dir of Object.values(FIXTURES)) {
    await openCodeV1(dir);
    await openCodeV2({ directory: dir });
    await pi({ cwd: dir });
  }
  assert.deepEqual(list(base), before);
});

test('using-ultrapowers tells hookless harnesses to look for the marker', () => {
  const skill = fs.readFileSync(path.join(repoRoot, 'skills', 'using-ultrapowers', 'SKILL.md'), 'utf8');
  const start = skill.indexOf('## Project Scaffold');
  const end = skill.indexOf('## User Instructions');
  assert.ok(start > skill.indexOf('## Platform Adaptation') && end > start, 'section sits between Platform Adaptation and User Instructions');
  const section = skill.slice(start, end);
  for (const needle of ['.agents/ultrapowers.json', '/ultrapowers:init', 'Codex', 'Gemini CLI', 'Kimi Code', 'Devin', 'your human partner']) {
    assert.ok(section.includes(needle), `section mentions ${needle}`);
  }
  for (const nudge of ALL) assert.equal(section.includes(nudge), false, 'section never repeats a nudge sentence');
  assert.ok(section.split(/\s+/).length <= 130, 'section stays short: this skill loads every session');
});
```

Create `tests/hermes/test_nudge.py` (it uses the `mock_ctx` fixture from `tests/hermes/conftest.py`):

```python
import importlib
import json
import os
import re
import sys

import pytest

_PLUGIN_DIR = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "../../.hermes-plugin")
)
sys.path.insert(0, _PLUGIN_DIR)

HERMES_CONTEXT_SPILL_LIMIT = 10_000
SCAFFOLD = (
    "This project has no ultrapowers scaffold. "
    "Offer /ultrapowers:init before other work."
)
REPAIR = (
    "This project's .agents/ultrapowers.json is unreadable. "
    "Offer /ultrapowers:init to repair it before other work."
)
UPGRADE_TAIL = "Offer /ultrapowers:init to upgrade before other work."
ALL_NUDGES = (SCAFFOLD, UPGRADE_TAIL, REPAIR)


def _plugin_version():
    with open(os.path.join(_PLUGIN_DIR, "plugin.yaml"), encoding="utf-8") as f:
        return re.search(r"^version:\s*(\S+)", f.read(), re.M).group(1)


def _load_plugin():
    if "__init__" in sys.modules:
        del sys.modules["__init__"]
    return importlib.import_module("__init__")


def _first_turn(ctx, platform="cli"):
    plugin = _load_plugin()
    plugin.register(ctx)
    return ctx._hooks["pre_llm_call"](
        session_id="s1",
        user_message="hi",
        conversation_history=[],
        is_first_turn=True,
        model="test-model",
        platform=platform,
    )["context"]


def _marker(directory, content):
    (directory / ".agents").mkdir(parents=True)
    (directory / ".agents" / "ultrapowers.json").write_text(content, encoding="utf-8")
    return directory


@pytest.fixture
def projects(tmp_path):
    version = _plugin_version()
    dirs = {
        "absent": tmp_path / "absent",
        "current": _marker(tmp_path / "current", json.dumps({"pluginVersion": version})),
        "older": _marker(tmp_path / "older", json.dumps({"pluginVersion": "0.0.1"})),
        "corrupt": _marker(tmp_path / "corrupt", '{ "name": "x", '),
    }
    dirs["absent"].mkdir()
    dirs["nested"] = dirs["current"] / "svc-api"
    dirs["nested"].mkdir()
    return dirs


def _nudges_in(content):
    return [n for n in ALL_NUDGES if n in content]


@pytest.mark.parametrize(
    "kind, expected",
    [
        ("absent", SCAFFOLD),
        ("current", None),
        ("older", UPGRADE_TAIL),
        ("corrupt", REPAIR),
        ("nested", None),
    ],
)
def test_first_turn_nudge_follows_the_marker(mock_ctx, projects, monkeypatch, kind, expected):
    monkeypatch.chdir(projects[kind])
    content = _first_turn(mock_ctx)
    assert content.startswith("<EXTREMELY_IMPORTANT>")
    assert content.rstrip().endswith("</EXTREMELY_IMPORTANT>")
    if expected is None:
        assert _nudges_in(content) == []
    else:
        assert _nudges_in(content) == [expected]
        assert f"{expected}\n</EXTREMELY_IMPORTANT>" in content
        assert "\n\nThis project" in content


def test_upgrade_nudge_names_both_versions(mock_ctx, projects, monkeypatch):
    monkeypatch.chdir(projects["older"])
    content = _first_turn(mock_ctx)
    assert (
        f"is from version 0.0.1; the plugin is {_plugin_version()}." in content
    )


def test_messaging_platforms_get_no_nudge(mock_ctx, projects, monkeypatch):
    monkeypatch.chdir(projects["absent"])
    assert _nudges_in(_first_turn(mock_ctx, platform="telegram")) == []


def test_later_turns_still_return_none(mock_ctx, projects, monkeypatch):
    monkeypatch.chdir(projects["absent"])
    plugin = _load_plugin()
    plugin.register(mock_ctx)
    assert mock_ctx._hooks["pre_llm_call"](is_first_turn=False, platform="cli") is None


def test_nudged_context_stays_under_the_spill_limit(mock_ctx, projects, monkeypatch):
    monkeypatch.chdir(projects["older"])
    assert len(_first_turn(mock_ctx)) < HERMES_CONTEXT_SPILL_LIMIT


def test_nudge_check_writes_nothing(mock_ctx, projects, monkeypatch, tmp_path):
    before = sorted(str(p) for p in tmp_path.rglob("*"))
    for directory in projects.values():
        monkeypatch.chdir(directory)
        _first_turn(mock_ctx)
    assert sorted(str(p) for p in tmp_path.rglob("*")) == before
```

- [ ] **Step 2: Run them to see them fail**

Run: `node --test tests/init/test-nudge-injectors.mjs`
Expected: `ℹ pass 8`, `ℹ fail 12`. The passes are the no-nudge cases (current and nested markers, V2 without a directory, the no-write check) that the old injectors satisfy by never nudging; the section test fails because `## Project Scaffold` does not exist yet.

Run: `python -m pytest -q tests/hermes/test_nudge.py`
Expected: `4 failed, 6 passed` (absent, older, corrupt, and the two-version check fail).

- [ ] **Step 3: OpenCode injector**

In `.opencode/plugins/ultrapowers.js`, after line 25

```javascript
const ultrapowersSkillsDir = path.resolve(__dirname, '../../skills');
```

insert:

```javascript

// Project scaffold nudge (spec 4.2): one line inside the bootstrap when the
// project directory has no .agents/ultrapowers.json at or above it, or has one
// that is older than this plugin or unreadable. Read-only; recomputed per
// injection so the line disappears as soon as init has run.
const NUDGE_SCAFFOLD = 'This project has no ultrapowers scaffold. Offer /ultrapowers:init before other work.';
const NUDGE_REPAIR = "This project's .agents/ultrapowers.json is unreadable. Offer /ultrapowers:init to repair it before other work.";
const upgradeNudge = (from, to) => `This project's ultrapowers scaffold is from version ${from}; the plugin is ${to}. Offer /ultrapowers:init to upgrade before other work.`;

let _pluginVersion;
const readPluginVersion = () => {
  if (_pluginVersion !== undefined) return _pluginVersion;
  try {
    _pluginVersion = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../package.json'), 'utf8')).version || null;
  } catch {
    _pluginVersion = null;
  }
  return _pluginVersion;
};

const versionLess = (a, b) => {
  const pa = String(a).split('.').map((n) => parseInt(n, 10) || 0);
  const pb = String(b).split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) < (pb[i] ?? 0);
  }
  return false;
};

const projectNudge = (directory) => {
  if (typeof directory !== 'string' || directory === '') return null;
  try {
    let current = path.resolve(directory);
    let markerFile = null;
    while (!markerFile) {
      const candidate = path.join(current, '.agents', 'ultrapowers.json');
      if (fs.existsSync(candidate)) markerFile = candidate;
      else if (path.dirname(current) === current) return NUDGE_SCAFFOLD;
      else current = path.dirname(current);
    }
    let marker;
    try {
      marker = JSON.parse(fs.readFileSync(markerFile, 'utf8'));
    } catch {
      return NUDGE_REPAIR;
    }
    if (!marker || typeof marker !== 'object' || typeof marker.pluginVersion !== 'string') return NUDGE_REPAIR;
    const version = readPluginVersion();
    return version && versionLess(marker.pluginVersion, version) ? upgradeNudge(marker.pluginVersion, version) : null;
  } catch (err) {
    console.error('[ultrapowers] project scaffold check failed:', err);
    return null;
  }
};

const withProjectNudge = (bootstrap, directory) => {
  const nudge = projectNudge(directory);
  if (!nudge) return bootstrap;
  const close = '</EXTREMELY_IMPORTANT>';
  const at = bootstrap.lastIndexOf(close);
  return at === -1 ? `${bootstrap}\n\n${nudge}` : `${bootstrap.slice(0, at)}\n${nudge}\n${bootstrap.slice(at)}`;
};
```

In the V1 transform, replace

```javascript
      firstUser.parts.unshift({ ...ref, type: 'text', text: bootstrap });
```

with

```javascript
      firstUser.parts.unshift({ ...ref, type: 'text', text: withProjectNudge(bootstrap, directory) });
```

In `setup(ctx)`, directly after the V1-shaped-ctx guard

```javascript
  if (!ctx || !ctx.skill || typeof ctx.skill.transform !== 'function' || !ctx.session || typeof ctx.session.hook !== 'function') {
    return;
  }
```

add the line

```javascript
  const projectDirectory = typeof ctx.directory === 'string' ? ctx.directory : null;
```

and in the V2 context hook replace

```javascript
        if (firstUser) {
          firstUser.content.unshift({ type: 'text', text: bootstrap });
        } else {
          event.messages.push({ role: 'user', content: [{ type: 'text', text: bootstrap }] });
        }
```

with

```javascript
        const text = withProjectNudge(bootstrap, typeof event.directory === 'string' ? event.directory : projectDirectory);
        if (firstUser) {
          firstUser.content.unshift({ type: 'text', text });
        } else {
          event.messages.push({ role: 'user', content: [{ type: 'text', text }] });
        }
```

The nudge is computed on every injection, never cached with the bootstrap, so it disappears in the same session once init has run. The bootstrap-caching test counts reads of `using-ultrapowers/SKILL.md` only, so the marker reads do not affect it.

- [ ] **Step 4: Pi extension**

In `.pi/extensions/ultrapowers.ts`, change line 1 from

```typescript
import { readFileSync } from "node:fs";
```

to

```typescript
import { existsSync, readFileSync } from "node:fs";
```

After line 14

```typescript
let cachedBootstrap: string | null | undefined;
```

insert:

```typescript

const NUDGE_SCAFFOLD = "This project has no ultrapowers scaffold. Offer /ultrapowers:init before other work.";
const NUDGE_REPAIR = "This project's .agents/ultrapowers.json is unreadable. Offer /ultrapowers:init to repair it before other work.";

let cachedPluginVersion: string | null | undefined;

function pluginVersion(): string | null {
	if (cachedPluginVersion !== undefined) return cachedPluginVersion;
	try {
		const pkg = JSON.parse(readFileSync(resolve(packageRoot, "package.json"), "utf8")) as { version?: unknown };
		cachedPluginVersion = typeof pkg.version === "string" ? pkg.version : null;
	} catch {
		cachedPluginVersion = null;
	}
	return cachedPluginVersion;
}

function versionLess(a: string, b: string): boolean {
	const pa = a.split(".").map((n) => parseInt(n, 10) || 0);
	const pb = b.split(".").map((n) => parseInt(n, 10) || 0);
	for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
		if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) < (pb[i] ?? 0);
	}
	return false;
}

function projectNudge(directory: string): string | null {
	try {
		let current = resolve(directory);
		let markerFile: string | null = null;
		while (!markerFile) {
			const candidate = resolve(current, ".agents", "ultrapowers.json");
			if (existsSync(candidate)) markerFile = candidate;
			else if (dirname(current) === current) return NUDGE_SCAFFOLD;
			else current = dirname(current);
		}
		let marker: unknown;
		try {
			marker = JSON.parse(readFileSync(markerFile, "utf8"));
		} catch {
			return NUDGE_REPAIR;
		}
		const recorded = (marker as { pluginVersion?: unknown } | null)?.pluginVersion;
		if (typeof recorded !== "string") return NUDGE_REPAIR;
		const version = pluginVersion();
		if (version && versionLess(recorded, version)) {
			return `This project's ultrapowers scaffold is from version ${recorded}; the plugin is ${version}. Offer /ultrapowers:init to upgrade before other work.`;
		}
		return null;
	} catch {
		return null;
	}
}

function withProjectNudge(bootstrap: string, directory: string): string {
	const nudge = projectNudge(directory);
	if (!nudge) return bootstrap;
	const close = "</EXTREMELY_IMPORTANT>";
	const at = bootstrap.lastIndexOf(close);
	return at === -1 ? `${bootstrap}\n\n${nudge}` : `${bootstrap.slice(0, at)}\n${nudge}\n${bootstrap.slice(at)}`;
}
```

Change the context handler's first line (line 35) from

```typescript
	pi.on("context", async (event) => {
```

to

```typescript
	pi.on("context", async (event, ctx) => {
```

and the bootstrap message content (line 44) from

```typescript
			content: [{ type: "text" as const, text: bootstrap }],
```

to

```typescript
			content: [{ type: "text" as const, text: withProjectNudge(bootstrap, ctx?.cwd ?? process.cwd()) }],
```

The helpers use only erasable TypeScript syntax, so Node's type stripping loads the file in the tests exactly as `tests/pi/test-pi-extension.mjs` does.

- [ ] **Step 5: Hermes plugin**

In `.hermes-plugin/__init__.py`, change the imports on lines 1-2 from

```python
import os
import re
```

to

```python
import json
import os
import re
```

Insert before `def register(ctx):` (line 74), separated by two blank lines on each side:

```python

NUDGE_SCAFFOLD = (
    "This project has no ultrapowers scaffold. "
    "Offer /ultrapowers:init before other work."
)
NUDGE_REPAIR = (
    "This project's .agents/ultrapowers.json is unreadable. "
    "Offer /ultrapowers:init to repair it before other work."
)
NUDGE_PLATFORMS = (None, "", "cli")


def _plugin_version():
    here = os.path.dirname(os.path.realpath(__file__))
    try:
        with open(os.path.join(here, "plugin.yaml"), encoding="utf-8") as f:
            for line in f:
                match = re.match(r"^version:\s*['\"]?([0-9][^'\"\s]*)", line)
                if match:
                    return match.group(1)
    except OSError:
        pass
    return None


def _version_less(a, b):
    def parts(v):
        return [int(re.sub(r"\D", "", p) or 0) for p in str(v).split(".")]

    pa, pb = parts(a), parts(b)
    width = max(len(pa), len(pb))
    pa += [0] * (width - len(pa))
    pb += [0] * (width - len(pb))
    return pa < pb


def _find_marker(start):
    current = os.path.abspath(start)
    while True:
        candidate = os.path.join(current, ".agents", "ultrapowers.json")
        if os.path.isfile(candidate):
            return candidate
        parent = os.path.dirname(current)
        if parent == current:
            return None
        current = parent


def _project_nudge(directory):
    """One line for the first turn when the project needs /ultrapowers:init.

    Read-only. Mirrors hooks/session-start: missing marker, older
    pluginVersion, or an unreadable marker each get a line; a current
    project gets none.
    """
    marker = _find_marker(directory)
    if marker is None:
        return NUDGE_SCAFFOLD
    try:
        with open(marker, encoding="utf-8") as f:
            data = json.load(f)
    except (OSError, ValueError):
        return NUDGE_REPAIR
    recorded = data.get("pluginVersion") if isinstance(data, dict) else None
    if not isinstance(recorded, str):
        return NUDGE_REPAIR
    current = _plugin_version()
    if current and _version_less(recorded, current):
        return (
            f"This project's ultrapowers scaffold is from version {recorded}; "
            f"the plugin is {current}. "
            "Offer /ultrapowers:init to upgrade before other work."
        )
    return None


def _with_project_nudge(bootstrap, platform):
    # Only a terminal session has a project directory; messaging gateways
    # run from wherever the gateway process started.
    if platform not in NUDGE_PLATFORMS:
        return bootstrap
    try:
        nudge = _project_nudge(os.getcwd())
    except Exception:
        return bootstrap
    if not nudge:
        return bootstrap
    close = "</EXTREMELY_IMPORTANT>"
    at = bootstrap.rfind(close)
    if at == -1:
        return f"{bootstrap}\n\n{nudge}"
    return f"{bootstrap[:at]}\n{nudge}\n{bootstrap[at:]}"
```

In `pre_llm_call`, replace

```python
        if is_first_turn:
            return {"context": bootstrap}
```

with

```python
        if is_first_turn:
            return {"context": _with_project_nudge(bootstrap, platform)}
```

The existing `test_first_turn_returns_bootstrap_context` keeps passing because the line sits inside the block, before `</EXTREMELY_IMPORTANT>`.

- [ ] **Step 6: The using-ultrapowers section**

In `skills/using-ultrapowers/SKILL.md`, insert between the Platform Adaptation list (ends at line 61, `- Muse: \`references/muse-tools.md\``) and `## User Instructions` (line 63), with one blank line before and after:

```markdown
## Project Scaffold

On Claude Code, Cursor, Copilot CLI, Antigravity, Muse, OpenCode, Pi and Hermes, a session-start check looks for `.agents/ultrapowers.json` and adds one line at the end of this context when the project needs `/ultrapowers:init`. No line means the project is current.

Codex, Gemini CLI, Kimi Code and Devin run no check. There, before other work in a new session, look for `.agents/ultrapowers.json` in the working directory or a parent. If it is missing, offer `/ultrapowers:init` to set the project up; if it is not valid JSON, offer init to repair it.

Offer once. Init writes nothing without your human partner's yes, and a no ends it for this session.
```

This is the only change to that skill's body (spec 4.2). It never repeats a nudge sentence, so the hook tests' "no nudge" assertions stay meaningful even though every hook and injector embeds this skill.

- [ ] **Step 7: Run the injector tests and every suite that loads a bootstrap**

Run: `node --test tests/init/test-nudge-injectors.mjs`
Expected: `ℹ pass 20`, `ℹ fail 0`.

Run: `python -m pytest -q tests/hermes`
Expected: `29 passed` (19 existing plus 10 new; the bootstrap stays under the 10,000-character spill limit, about 6,400 characters with the new section).

Run: `node --test tests/pi/test-pi-extension.mjs`
Expected: `ℹ pass 6`, `ℹ fail 0`.

Run: `bash tests/opencode/test-bootstrap-caching.sh && bash tests/opencode/test-session-bootstrap.sh`
Expected: `=== All bootstrap caching tests passed ===` and `Session classification, recovery and cache lifetime passed`.

Run: `bash tests/hooks/test-session-start.sh </dev/null`
Expected: `STATUS: PASSED`.

`tests/opencode/test-plugin-loading.sh` and `tests/opencode/test-skill-registration.sh` need real symlinks (`ln -s`); on Git Bash without symlink permission they fail before and after this change with `Plugin symlink not found` and `expected setup() to register at least one skill`. Run them on Linux or macOS, or compare against a run on the parent commit.

- [ ] **Step 8: Pressure-test the section (writing-skills applies to edits too)**

Append to `tests/init/pressure-scenarios.md`:

```markdown
## S5 hookless harness, no marker (Codex, fixture s5)

Setup: `git init -q s5`, then `printf 'Teh quick fix.\n' > s5/README.md`. The
session runs in Codex CLI with the plugin installed, in `s5`.

Prompt: "Fix the typo in README.md."

Expected with the section: the first reply says once that the project has no
ultrapowers scaffold and offers `/ultrapowers:init`, does not run it, and
fixes the typo. Baseline (section absent): no mention of init.
```

Add the row `| S5 hookless offer | | pending GREEN | |` to the table in `tests/init/pressure-results.md`. Run S5 once on the parent commit (baseline, before Step 6) and once with this task's change; fill the row. If the baseline already offers init, write `control passed` and keep the section anyway: spec 4.2 requires it for harnesses without hooks.

- [ ] **Step 9: Commit**

```bash
git add .opencode/plugins/ultrapowers.js .pi/extensions/ultrapowers.ts .hermes-plugin/__init__.py skills/using-ultrapowers/SKILL.md tests/init/test-nudge-injectors.mjs tests/hermes/test_nudge.py tests/init/pressure-scenarios.md tests/init/pressure-results.md
git commit -m "feat(injectors): scaffold nudge in OpenCode, Pi and Hermes" -m "Each in-process injector finds the nearest .agents/ultrapowers.json for its project directory and appends the same one line as the bash hook inside the bootstrap, computed per injection and never written. using-ultrapowers gains a short Project Scaffold section telling hookless harnesses to look for the marker and offer init once." -m "RAOOF A."
```

---

### Task 10: Manifests, docs, lint and line endings

**Files:**
- Modify: `.muse-plugin/plugin.json` (skills list)
- Modify: `.version-bump.json` (`audit.exclude`)
- Modify: `docs/testing.md` (suite table, after piece 1's rewrite)
- Verify only: `.gitattributes` (Task 1 added the pins this piece needs)

**Interfaces:**
- Consumes: `skills/init/SKILL.md` (Task 7); `templates/CHANGES.json` (Task 3); every suite from Tasks 1 to 9.
- Produces: Muse loads `init` like every other skill; `scripts/bump-version.sh --audit` stays clean although `templates/CHANGES.json` holds version strings on purpose (they record when each template last changed and must never be bumped); `docs/testing.md` lists the new suites.

- [ ] **Step 1: List the init skill for Muse**

Muse is the only harness with an explicit skill list. In `.muse-plugin/plugin.json`, directly after the `finishing-a-development-branch` entry

```json
      {
        "id": "finishing-a-development-branch",
        "path": "skills/finishing-a-development-branch/SKILL.md"
      },
```

insert

```json
      {
        "id": "init",
        "path": "skills/init/SKILL.md"
      },
```

Run:

```bash
node -e '
const fs = require("fs");
const m = JSON.parse(fs.readFileSync(".muse-plugin/plugin.json", "utf8"));
const listed = m.capabilities.skills.map((s) => s.id).sort();
const dirs = fs.readdirSync("skills").filter((d) => fs.existsSync(`skills/${d}/SKILL.md`)).sort();
const badPath = m.capabilities.skills.filter((s) => s.path !== `skills/${s.id}/SKILL.md`);
console.log(JSON.stringify(listed) === JSON.stringify(dirs) && badPath.length === 0 ? `MUSE_MANIFEST_OK ${listed.length}` : `MISMATCH ${JSON.stringify({ listed, dirs, badPath })}`);
'
```

Expected: `MUSE_MANIFEST_OK <n>`, where `<n>` is the number of `skills/*/SKILL.md` directories (16 when this plan runs directly after piece 1).

- [ ] **Step 2: Keep the version audit clean**

In `.version-bump.json`, add `"CHANGES.json"` as the last entry of `audit.exclude`. After piece 1 the block reads:

```json
  "audit": {
    "exclude": [
      "RELEASE-NOTES.md",
      "node_modules",
      "docs",
      "tests",
      ".git",
      ".version-bump.json",
      "scripts/bump-version.sh",
      "CHANGES.json"
    ]
  }
```

`grep --exclude` matches base names, so the entry is the file name, not its path; no other file in the repository is called `CHANGES.json`.

Run: `bash scripts/bump-version.sh --audit`
Expected: every declared file at the same version, `All declared files are in sync at <version>`, then `No undeclared files contain the version string. All clear.` (needs `jq`, and `yq` for the Hermes manifest, as in piece 1).

- [ ] **Step 3: Document the suites**

In `docs/testing.md` (piece 1's version), replace the `tests/hooks/` row

```markdown
| `tests/hooks/` | `hooks/session-start` output shape per harness | `bash tests/hooks/test-session-start.sh` |
```

with these two rows

```markdown
| `tests/hooks/` | `hooks/session-start` output shape per harness and the project scaffold nudge | `bash tests/hooks/test-session-start.sh` |
| `tests/init/` | Init engine (rendering, managed blocks, MCP transforms, join and upgrade), template leak scan, OpenCode and Pi nudges, init skill structure | `bash tests/init/run-tests.sh` |
```

replace the `tests/hermes/` row

```markdown
| `tests/hermes/` | Hermes plugin layout resolution and bootstrap | `python -m pytest tests/hermes` |
```

with

```markdown
| `tests/hermes/` | Hermes plugin layout resolution, bootstrap and scaffold nudge | `python -m pytest tests/hermes` |
```

and append this sentence to the end of the `## Model-driven tests` paragraph:

```markdown
The init skill's pressure scenarios and their recorded baseline and with-skill results are in `tests/init/pressure-scenarios.md` and `tests/init/pressure-results.md`.
```

- [ ] **Step 4: Lint every tracked shell file**

`scripts/lint-shell.sh` needs ShellCheck. If `command -v shellcheck` prints nothing, install it first: `winget install --id koalaman.shellcheck` (Windows), `brew install shellcheck` (macOS), `sudo apt-get install shellcheck` (Debian or Ubuntu).

Run: `bash scripts/lint-shell.sh --all`
Expected: `Linting <n> shell files` and no ShellCheck output; exit 0. The files this plan adds or changes are `tests/init/test-templates-clean.sh`, `tests/init/run-tests.sh`, `tests/init/test-skill-structure.sh`, `hooks/session-start` and `tests/hooks/test-session-start.sh`; `templates/.githooks/pre-commit.tmpl` is not tracked as a shell file (its name ends in `.tmpl`), so check it by hand: `sh -n templates/.githooks/pre-commit.tmpl && echo SYNTAX-OK`.

- [ ] **Step 5: Check line endings in the index**

Run:

```bash
git ls-files --eol -- templates skills/init tests/init tests/hooks tests/hermes hooks .opencode .pi .hermes-plugin output-styles | awk '$1 != "i/lf" && $1 != "i/none"'
git check-attr eol -- templates/AGENTS.md.tmpl templates/.githooks/pre-commit.tmpl templates/.mcp.json templates/CHANGES.json skills/init/scripts/init.mjs tests/init/test-skill-structure.sh hooks/session-start
```

Every file checked here was committed by Tasks 1 to 9, so the index is current. Expected: the first command prints nothing (every file is LF in the index; the empty `.gitkeep` files are `i/none`); the second prints `eol: lf` for each of the seven paths. If a line appears in the first output, fix that file's endings (`sed -i 's/\r$//' <file>`) and add the pattern to `.gitattributes`.

- [ ] **Step 6: Commit**

```bash
git add .muse-plugin/plugin.json .version-bump.json docs/testing.md
git commit -m "chore(init): list the init skill for Muse, exclude CHANGES.json from the version audit, document the suites" -m "Muse is the only harness with an explicit skill list. templates/CHANGES.json records when each template last changed, so the version bump must never rewrite it." -m "RAOOF A."
```

---

### Task 11: Final verification against the acceptance criteria

**Files:**
- No new files. This task runs the checks and records nothing in git unless a check fails and a fix is committed through the owning task.

**Interfaces:**
- Consumes: everything above.
- Produces: evidence for spec section 5, criteria 1 to 8.

- [ ] **Step 1: Criterion 7, every automated suite**

Run from the repo root:

```bash
bash tests/init/run-tests.sh
bash tests/hooks/test-session-start.sh </dev/null
python -m pytest -q tests/hermes
node --test tests/pi/test-pi-extension.mjs
bash tests/opencode/run-tests.sh
bash scripts/lint-shell.sh --all
```

Expected: `run-tests.sh` prints the leak scan `STATUS: PASSED`, `ℹ pass 21` (engine), `ℹ pass 13` (MCP transforms), `ℹ pass 13` (modes), `ℹ pass 20` (injector nudges), `Passed: 48  Failed: 0` (skill structure, more if Task 7 added rows that name flags or codes), and a final `STATUS: PASSED`; the hook suite `STATUS: PASSED`; `29 passed`; `ℹ pass 6`; the OpenCode unit suite passes on Linux or macOS (on Git Bash without symlink permission, `test-plugin-loading.sh` and `test-skill-registration.sh` fail exactly as they do on the parent commit); lint prints no findings.

- [ ] **Step 2: Criteria 2, 3 and 5 through the engine**

Run:

```bash
DEMO="$(mktemp -d)/demo"
mkdir -p "$DEMO" && git init -q "$DEMO"
printf '# Our rules\n' > "$DEMO/AGENTS.md"
before="$(git hash-object "$DEMO/AGENTS.md")"
node skills/init/scripts/init.mjs scaffold --root "$DEMO" --name Demo > "$DEMO.first.json"
node skills/init/scripts/init.mjs scaffold --root "$DEMO" --name Demo > "$DEMO.second.json"
node -e '
const [first, second] = process.argv.slice(1).map((f) => JSON.parse(require("fs").readFileSync(f, "utf8")));
console.log("first written:", first.written.length, "skipped:", first.skipped.join(","));
console.log("second written:", second.written.length, "blocks:", second.blocks.map((b) => b.action).join(","));
' "$DEMO.first.json" "$DEMO.second.json"
[ "$(git hash-object "$DEMO/AGENTS.md")" = "$before" ] && echo AGENTS-UNCHANGED
node --input-type=module -e "
import { parseToml } from './tests/init/toml-mini.mjs';
import fs from 'node:fs';
const dir = process.argv[1];
const ids = Object.keys(JSON.parse(fs.readFileSync(dir + '/.mcp.json', 'utf8')).mcpServers).sort().join(',');
const codex = Object.keys(parseToml(fs.readFileSync(dir + '/.codex/config.toml', 'utf8')).mcp_servers).sort().join(',');
const cursor = Object.keys(JSON.parse(fs.readFileSync(dir + '/.cursor/mcp.json', 'utf8')).mcpServers).sort().join(',');
console.log(ids === codex && ids === cursor ? 'MCP-IDS-MATCH ' + ids : 'MCP-IDS-DIFFER');
" "$DEMO"
```

Expected: `first written: <n> skipped: AGENTS.md` with `<n>` above 40; `second written: 0 blocks: unchanged,unchanged`; `AGENTS-UNCHANGED`; `MCP-IDS-MATCH Firecrawl,brave,chrome-devtools,context7,deepwiki,microsoftdocs,playwright,sequentialthinking`.

- [ ] **Step 3: Criterion 4, the three nudge states in each injector**

The fixtures run in Step 1 (`tests/hooks/test-session-start.sh`, `tests/init/test-nudge-injectors.mjs`, `tests/hermes/test_nudge.py`) are the evidence: absent, current and older markers for the bash hook and for OpenCode, Pi and Hermes. Confirm the modes follow them:

```bash
node skills/init/scripts/init.mjs detect --root "$DEMO" | node -e 'let s="";process.stdin.on("data",(d)=>s+=d).on("end",()=>console.log(JSON.parse(s).suggestedMode))'
node -e 'const f=process.argv[1];const m=JSON.parse(require("fs").readFileSync(f,"utf8"));m.pluginVersion="0.0.1";require("fs").writeFileSync(f,JSON.stringify(m,null,2)+"\n")' "$DEMO/.agents/ultrapowers.json"
node skills/init/scripts/init.mjs detect --root "$DEMO" | node -e 'let s="";process.stdin.on("data",(d)=>s+=d).on("end",()=>console.log(JSON.parse(s).suggestedMode))'
printf '{"cwd":"%s"}' "$DEMO" | CLAUDE_PLUGIN_ROOT="$PWD" bash hooks/session-start | grep -o 'Offer /ultrapowers:init to upgrade before other work.'
```

Expected: `join`, then `upgrade`, then the upgrade sentence once.

- [ ] **Step 4: Criterion 8, the leak scan**

Run: `bash tests/init/test-templates-clean.sh`
Expected: every line `[PASS]`, `STATUS: PASSED`. If your human partner keeps a local list of the reference project's identifiers, also run `ULTRAPOWERS_FORBIDDEN_PATTERNS_FILE=<that file> bash tests/init/test-templates-clean.sh`; the file stays outside git.

- [ ] **Step 5: Criterion 1, the skill in Claude Code (manual)**

1. `SANDBOX="$(mktemp -d)/fresh" && mkdir -p "$SANDBOX" && git init -q "$SANDBOX"`
2. Start Claude Code in `$SANDBOX` with the plugin installed from this working tree (`/plugin marketplace add <repo path>`, then `/plugin install ultrapowers@ultrapowers`), and restart it once so the SessionStart hook runs.
3. Observe the session context: the line `This project has no ultrapowers scaffold. Offer /ultrapowers:init before other work.` is present and the agent offers init once.
4. Send `/ultrapowers:init Demo`. Observe, in order: the detect run, the sentence naming scaffold mode, one message with the three questions and their defaults (the nested-clone question is absent because there are no clones), and after "defaults" the dry-run file list and `Write these files? (yes / no)`.
5. Before answering, run `git -C "$SANDBOX" status --short` in another terminal: it prints nothing.
6. Answer `yes`. Observe the written and skipped lists and the numbered next steps; `ls -A "$SANDBOX"` now shows the payload of spec 4.5 and `.agents/ultrapowers.json`.
7. Start a new session in `$SANDBOX`: no nudge line. Run `/ultrapowers:init` again: join mode, and nothing shared is written (criterion 2 through the skill).

- [ ] **Step 6: Criterion 6, Codex and Cursor (manual)**

Use `$SANDBOX` from Step 5.

- Codex CLI: start `codex` in `$SANDBOX` and trust the project when asked (Codex applies a project's `.codex/config.toml` only to trusted projects). Run `/mcp`: the eight servers from `.codex/config.toml` are listed (`playwright`, `context7`, `sequentialthinking`, `microsoftdocs`, `deepwiki`, `Firecrawl`, `brave`, `chrome-devtools`); servers whose variable is unset report a start failure, which is expected. Ask "Which two house rules does this repository set?": the answer names "never commit test files" and "never write code comments" from `AGENTS.md`.
- Cursor: open `$SANDBOX` as a folder. Settings, then MCP: the same eight servers appear from `.cursor/mcp.json` (enable them when Cursor asks). In a new agent chat ask the same question: the answer cites `AGENTS.md`. With the plugin installed in Cursor, the first chat of a session carries no nudge, because the marker is current.

Record both observations in the pull request description's test section.

---

## Self-Review

### 1. Spec coverage

| Spec item | Where it is implemented and tested |
|-----------|------------------------------------|
| G1 skill conventions | Task 7: two-key frontmatter plus the `arguments:` list (as in piece 3), "your human partner" voice, checklist, red flags, no harness tool names, all checked by `tests/init/test-skill-structure.sh`; RED and GREEN pressure runs S1 to S4. Task 9 Step 8 pressure-tests the using-ultrapowers edit (S5). |
| G2 zero runtime dependencies | Tasks 4 to 6 use the Node standard library only; Task 8 parses stdin in bash without `jq` or `node`; `toml-mini.mjs` lives in `tests/` only. |
| G3 explicit yes | Task 7: dry-run file list, then "Write these files? (yes / no)", answers to questions are not a yes (S1). The engine's `detect`, `--dry-run` and upgrade preview write nothing (Tasks 4, 6). |
| G4 no reference data in templates | Task 1 leak scan; Task 11 Step 4. |
| G5 Windows first, LF | Task 1 `.gitattributes` pins and a Git Bash-safe CRLF check; Task 4 CRLF block tests; Task 8 Windows-escaped cwd; Task 10 Step 5 index check. |
| D1 nudge plus one confirmation | Tasks 8, 9 (nudge), Task 7 (confirmation). |
| D2 every harness first-class | Tasks 2, 3, 5 write each harness's files; Task 4 `TARGET_HARNESS` filter. |
| D3 no vendoring | The engine copies templates and the output style only; the README template says every harness needs the plugin installed (Task 1). |
| D4 scaffold root and nested clones | Task 4 `detectRepos` and the `nested-clone` refusal; Task 6 join and upgrade refuse too; Task 7 S3. |
| D5 AGENTS.md single source | Task 2 (`@AGENTS.md` on line 1 of CLAUDE.md and GEMINI.md, Copilot pointer, VS Code settings); Task 5 `context.fileName` for Gemini and Qwen. |
| D6 committed marker | Task 3 template; Task 4 `writeMarker`; Task 6 updates `repos`, `topology`, `pluginVersion`, `written`. |
| D7 one MCP source | Task 3 canonical `.mcp.json`; Task 5 generators and parse tests. |
| D8 output style and Response style | Task 2. |
| D9 ten knowledge base folders | Task 1. |
| D10 idempotent, never overwrite, managed blocks | Task 4 (skip existing, `applyBlock`); Task 6 (proposals instead of overwrites, blocks replaced in place). |
| D11 nested writes opt-in | Task 4 `--nested-pointers`; Task 6 `--record-repos`; Task 7 asks each run. |
| 4.1 init skill and modes | Task 7; engine modes in Tasks 4 and 6. |
| 4.2 nudge | Task 8 (bash hook), Task 9 (OpenCode, Pi, Hermes, using-ultrapowers section). |
| 4.3 project config | Tasks 3, 4, 6. |
| 4.4 template engine rules | Task 4 (never overwrite, blocks, provenance, `written`, JSON report); Task 5 (the MCP transform). |
| 4.5 baseline payload | Tasks 1 to 3; Task 5 for the generated MCP files and the Codex approval and sandbox defaults. |
| 4.6 nested clones | Task 4 (detect, ignore, opt-in pointers); Task 6 (re-detect on join and upgrade, report new ones, record on request). |
| 5.1 to 5.8 | Task 11 Steps 1 to 6 (5.1 and 5.6 manual). |
| 6 risks | Best-effort Factory and Kimi files are named in the scaffold's `nextSteps` (Task 4); the CLAUDE.md import is asserted (Task 4 test); Node absence is handled by the skill (Task 7). |

No spec requirement is without a task. Spec 4.4 mentions "per-harness flags" as placeholders; the engine implements harness selection by omitting targets (`TARGET_HARNESS`) instead, and no template needs a per-harness placeholder.

### 2. Placeholder scan

Searched the plan for "TBD", "TODO", "implement later", "fill in", "similar to Task" and "appropriate": no hits in steps. The angle-bracket values that remain are run-time inputs, not plan gaps: `<SKILL_DIR>`, `<ROOT>` and `<NAME>` in the skill are filled by the agent at run time, and the header and bullet placeholders in `tests/init/pressure-results.md` are replaced with observed values in Task 7 Step 5, which says so.

### 3. Names and types across tasks

- `MCP_GENERATORS` keys (Task 5) equal the values of `MCP_TARGETS` (Task 4) and the ids allowed in `_ultrapowers.windowsNpxWrapper` (Task 3): `claude, codex, cursor, gemini, qwen, opencode, factory, kimi, vscode`. Generators take `(servers, { wrap })`, the call shape `generateMcpFiles` already uses.
- Every report field the skill reads (Task 7) exists: `written, skipped, omitted, blocks, repos, newRepos, changed, missingSecrets, hooksPath, nextSteps` from `emptyReport` (Task 4), `markerError` and the other `DetectReport` fields from `runDetect` (Task 4), `hooksPath` values and `changed` entries `{ path, version, exists }` from Task 6.
- Every CLI flag and error code the skill names is parsed or raised by `init.mjs`; `tests/init/test-skill-structure.sh` enforces both lists.
- The three nudge sentences are byte-identical in `hooks/session-start` (Task 8), the OpenCode, Pi and Hermes injectors (Task 9), and all four test files. The using-ultrapowers section never contains them.
- `PROPOSAL_SUFFIX` (`.ultrapowers-new`, Task 6) matches the gitignore block line (Task 3) and the skill text (Task 7).
- `templates/CHANGES.json` keys equal the rendered targets minus `.gitkeep` files (test in Task 6).

### 4. Review Focus pins

1. Windows-escaped cwd: Task 8, "Windows-escaped cwd resolves to the real directory".
2. Unparseable marker: Task 8, "truncated marker: repair nudge, hook still succeeds" and "merge-conflicted marker: repair nudge"; Task 9, the `corrupt` cases for OpenCode V1, OpenCode V2, Pi and Hermes; Task 4, detect reports `repair`.
3. `.gitignore` without trailing newline, CRLF files: Task 4, the three `applyBlock` and scaffold tests named in Review Focus 3.
4. Unknown placeholder: Task 4, "an unknown placeholder aborts before any file is written"; the MCP analogue in Task 5, "an unknown server shape in .mcp.json aborts before anything is written".
5. Scaffold inside a nested clone: Task 4, "scaffold inside a nested clone refuses and names the workspace root"; Task 6, "join and upgrade refuse outside a scaffold and inside a nested clone"; Task 7 scenario S3.

### 5. Integration fixes made to Tasks 1 to 4

- Task 1: the leak scan's CRLF check used `$'\r'` inside `$(...)`, which Git Bash expands to an empty pattern (every template reported as CRLF), and MSYS grep ignores carriage returns without `-U`. It now keeps the carriage return in a variable and uses `grep -rIlU`.
- Task 3: the gitignore block gains `*.ultrapowers-new` for Task 6's upgrade proposals.
- Task 4: the entry-point check compares `fs.realpathSync` of both sides, so the engine also runs from a symlinked or junctioned plugin directory (previously it printed nothing); a test covers it. `gitConfigGet` and `gitConfigSet` use `--local`, so join neither reads nor overrides a global `core.hooksPath`. `runDetect` reports `markerError` for the skill's repair flow. `run-tests.sh` also runs `test-skill-structure.sh`. The engine test imports through `pathToFileURL` and pins `CONTEXT7_API_KEY` to empty, so a developer's environment cannot fail it. The Interfaces block lists every export later tasks use.
- Tasks 1 to 4: commits use `-m "<subject>" -m "<body>" -m "RAOOF A."`.
- Header: Review Focus 5 was pinned to Task 6 although Task 4 already owns the scaffold refusal; it now names both. The File Structure lists the skill structure test, the pressure files and `.version-bump.json`.

### 6. How the code in this plan was checked

Every code block in Tasks 1 to 9 was run in a scratch copy of the repository with piece 1's rename simulated (`superpowers` to `ultrapowers` in names and paths, version `1.0.0`), on Windows with Git Bash, Node 26 and Python 3.14: the leak scan, `test-engine.mjs` (21), `test-mcp-transforms.mjs` (13), `test-modes.mjs` (13), `test-nudge-injectors.mjs` (20), `test-skill-structure.sh` (48 checks), the extended hook suite (20), `tests/hermes` (29), `tests/pi` (6), and the OpenCode bootstrap-caching and session suites all passed, and each new suite was also run against the code before its task to confirm the failures the "see it fail" steps name. ShellCheck was not available there, so the lint steps are unverified; the pressure scenarios need live sessions and were not run.
