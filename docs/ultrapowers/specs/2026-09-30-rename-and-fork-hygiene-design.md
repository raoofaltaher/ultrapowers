# Ultrapowers piece 1: rename and fork hygiene

> Naming note: this document describes the rename away from the upstream name. The upstream name is written `<old-name>` (`<Old-name>`, `<OLD-NAME>` for the other cases) so that no file in the repository carries it. Commands that must match it build it at run time as `OLD="$(printf 'super%s' powers)"`.

- Date: 2026-09-30
- Status: approved design, pending implementation plan
- Scope: sub-project 1 of 5 in the ultrapowers build-out. Pieces 2 to 5 (scaffold engine and baseline payload, task lifecycle skills, team memory, QA gatekeeper) each get their own spec.

## 1. Problem

The repository at `S:\ultrapowers` is a copy of upstream <old-name> 6.4.2. Its remote already points at `https://github.com/raoofaltaher/ultrapowers`, but every identifier, path, skill namespace, install command, and document still says <old-name>. Some content is wrong for a personal fork rather than merely misnamed: a funding file for the upstream author, release tooling that publishes through the upstream author's fork of OpenAI's plugin marketplace, a contributor policy written for a high-traffic public project, and a visual-companion logo loaded from the upstream author's website that reports the version in use.

Every later piece adds skills that reference the namespace `ultrapowers:<skill>`, so the rename must land first.

## 2. Decisions

| Id | Decision | Rationale |
|----|----------|-----------|
| D1 | Rename every occurrence, including upstream history documents. | Owner's choice. One name in the repo, no dual vocabulary. |
| D2 | No file in the repository contains the old name after the rename, in any case. Attribution to the upstream author is the copyright line in `LICENSE` and one fork notice in `README.md`, both without the old name. (Revised 2026-09-30 by the owner; the first version allowed exceptions.) | MIT requires the copyright and permission notice, not the project name. The owner asked for no trace of the old name. |
| D3 | Version resets to `1.0.0`. The fork notice states the upstream version it was cut from. | Ultrapowers is a new plugin with its own release line. |
| D4 | Plugin name `ultrapowers`; marketplace name `ultrapowers`; one plugin with source `./`; owner `raoofaltaher`; homepage and repository `https://github.com/raoofaltaher/ultrapowers`. | Matches the existing git remote. One repo serves as marketplace and plugin. |
| D5 | Author fields name the fork owner by git name only; no email in manifests. | Owner did not ask for an email to be published. |
| D6 | `RELEASE-NOTES.md` is kept as an empty file. | Owner's choice. It will hold the first ultrapowers release note. |
| D7 | The visual companion's remote brand image and all telemetry handling are removed. | The remote image reports version usage to the upstream author's server. A fork must not do that. |
| D8 | Codex publishing tooling that targets upstream's marketplace fork is deleted. The Codex manifest and Codex marketplace file stay. | Only the upstream author can use that pipeline. Codex users install from the git URL. |
| D9 | The external evals-harness wiring is removed. | The evals repo belongs to upstream. The fork has no evals repo yet. |
| D10 | Skill bodies are renamed only where the name appears; their behavior-shaping content is otherwise untouched. | Upstream tuned skill prose against real sessions. Piece 1 is a rename, not a rewrite. |

## 3. Approach

A scripted bulk substitution over every tracked text file, followed by a curated manual pass, followed by the full offline test run. The script replaces the three spellings `<old-name>`, `<Old-name>`, `<OLD-NAME>` with `ultrapowers`, `Ultrapowers`, `ULTRAPOWERS`, and applies the path renames with `git mv`. The manual pass handles everything a blind substitution gets wrong: attribution, the fork notice, telemetry code, the README and AGENTS.md rewrites, deletions, and tests that assert on names or on deleted tooling.

Rejected alternatives: a file-by-file manual rename across 148 files is slower and less reliable; a compatibility alias that answers to both namespaces contradicts D1.

## 4. Design

### 4.1 Identity and manifests

Files: `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`, `.codex-plugin/plugin.json`, `.agents/plugins/marketplace.json`, `.cursor-plugin/plugin.json`, `.devin-plugin/plugin.json`, `.hermes-plugin/plugin.yaml`, `.kimi-plugin/plugin.json`, `.muse-plugin/plugin.json`, `.muse-plugin/marketplace.json`, `gemini-extension.json`, `package.json`.

- `name` becomes `ultrapowers` everywhere. Marketplace `name` becomes `ultrapowers` (was `<old-name>-dev`); display names become `Ultrapowers`.
- `author` becomes `{ "name": "RAOOF A." }` in JSON manifests and `author: raoofaltaher` in the Hermes YAML. `owner` in marketplace files becomes `{ "name": "raoofaltaher", "url": "https://github.com/raoofaltaher" }`.
- `homepage`, `repository`, `websiteURL`, `privacyPolicyURL`, `termsOfServiceURL` point at `https://github.com/raoofaltaher/ultrapowers`.
- The Codex manifest `interface.composerIcon` follows the SVG rename in 4.2.
- The Muse manifest enumerates every skill by id and path; the two renamed skills are updated there.
- Kimi `sessionStart.skill` becomes `using-ultrapowers`.
- Version is set to `1.0.0` with `scripts/bump-version.sh 1.0.0`, which touches all eleven files registered in `.version-bump.json`.
- `LICENSE` keeps `Copyright (c) 2025 Jesse Vincent` and gains the line `Copyright (c) 2026 RAOOF A.` above it, both under the same MIT text.

### 4.2 Mechanical rename

Paths moved with `git mv`:

| From | To | Also update |
|------|----|-------------|
| `.opencode/plugins/<old-name>.js` | `.opencode/plugins/ultrapowers.js` | `index.js`, `package.json` `main`, `tests/opencode/setup.sh`, `tests/opencode/test-plugin-loading.sh` |
| `.pi/extensions/<old-name>.ts` | `.pi/extensions/ultrapowers.ts` | `package.json` `pi.extensions`, `tests/pi/test-pi-extension.mjs` |
| `assets/<old-name>-small.svg` | `assets/ultrapowers-small.svg` | `.codex-plugin/plugin.json` `composerIcon` |
| `docs/<old-name>/` | `docs/ultrapowers/` | skill prose that names the specs and plans path; the two `diagnosing-<old-name>` files inside are renamed too |
| `skills/using-<old-name>/` | `skills/using-ultrapowers/` | `hooks/session-start`, `GEMINI.md`, Kimi manifest, Muse manifest, the four in-process injectors, every skill that names it |
| `skills/diagnosing-<old-name>/` | `skills/diagnosing-ultrapowers/` | Muse manifest, its test directory |
| `tests/diagnosing-<old-name>/` | `tests/diagnosing-ultrapowers/` | its own test script |

`docs/ultrapowers/` already contains this spec, so the move merges the upstream `specs/` and `plans/` contents into it rather than replacing the directory.

Text substitutions the blind pass produces, listed so their consumers can be checked:

- Skill namespace: `<old-name>:<skill>` becomes `ultrapowers:<skill>` in all fifteen skills, the Hermes bootstrap, and tests.
- Bootstrap phrase and markers: `You have <old-name>.` becomes `You have ultrapowers.`; the Pi and Hermes bootstrap markers follow the same substitution.
- Runtime folder `.<old-name>/` becomes `.ultrapowers/` in `skills/subagent-driven-development/scripts/sdd-workspace`, `skills/brainstorming/scripts/start-server.sh`, skill prose, `.gitignore`, and tests. No migration of existing ledgers is attempted; ultrapowers has no users yet.
- Environment variables: every `<OLD-NAME>_*` name becomes `ULTRAPOWERS_*`: `ROOT`, `SKILLS_DIR`, `PLUGIN_FILE`, `DIR`, `VERSION`, `SHELL_LINT_TEST_LOG`, `VISUAL_COMPANION`, `STATE_DIR`. The three telemetry variables are deleted, not renamed (see 4.4).
- Hermes: the fallback path in `skills/using-ultrapowers/references/hermes-tools.md` becomes `~/.hermes/plugins/ultrapowers/skills/<skill>/SKILL.md`; the install command in the `.hermes-plugin/__init__.py` error text becomes `hermes plugins install raoofaltaher/ultrapowers`.
- Upstream URLs `github.com/obra/<old-name>` and `obra/<old-name>` become `github.com/raoofaltaher/ultrapowers` and `raoofaltaher/ultrapowers`. The sibling repos `<old-name>-marketplace`, `<old-name>-skills`, `<old-name>-evals`, and the fork `prime-radiant-inc/openai-codex-plugins` have no fork equivalent; their mentions are removed with the sections that used them (see 4.3).
- `hooks/session-start` keeps its file name, so `.gitattributes` needs no change.

Excluded from the blind pass: `LICENSE`, `docs/ultrapowers-requirements.md`, this spec, its plan, `.git/`, `.remember/`, and binary assets.

### 4.3 Fork hygiene: deletions and rewrites

Deleted:

- `.github/FUNDING.yml` (funds the upstream author).
- `scripts/sync-to-codex-plugin.sh`, `scripts/package-codex-plugin.sh`, `tests/codex-plugin-sync/`, `tests/codex/test-package-codex-plugin.sh` (all depend on upstream's marketplace fork or on OpenAI-owned metadata this repo does not have).
- `.pre-commit-config.yaml` (its only hooks lint the external `evals/` checkout).

Rewritten:

- `README.md`: title and intro for ultrapowers; a fork notice crediting Jesse Vincent's MIT-licensed skills library and the version it was cut from, without the old name or its URL; an install section per harness pointing at the new repo, with Claude Code as `/plugin marketplace add raoofaltaher/ultrapowers` then `/plugin install ultrapowers@ultrapowers`; the workflow, skills library, and philosophy sections kept and renamed. Removed sections: Commercial Services, Community, Official Marketplace, Visual companion telemetry, and Updating instructions that reference upstream marketplaces. A short "What ultrapowers adds" section is a placeholder pointing at pieces 2 to 5.
- `AGENTS.md`: rewritten as this fork's guide for agents and contributors. Kept: repository layout, the zero-dependency rule, the skill-writing philosophy and the instruction to use `ultrapowers:writing-skills` for skill changes, how to run each test suite, and the rule that skill bodies are behavior-shaping content. Removed: the PR-rejection statistics, the duplicate-PR search mandate, the `dev` branch rule, the eval-harness section, and all upstream-project policing language.
- `.github/PULL_REQUEST_TEMPLATE.md` and `.github/ISSUE_TEMPLATE/*`: replaced by one short PR template (what, why, how tested, harness) and one short bug template; `config.yml`, `diagnosis_report.md` and `platform_support.md` are deleted.
- `docs/testing.md`: the evals section and the `<OLD-NAME>_ROOT` contract are removed; the per-suite run commands stay.
- `docs/porting-to-a-new-harness.md` and `docs/windows/polyglot-hooks.md`: renamed in place; the Codex distribution rows that describe the deleted sync pipeline are removed.
- `RELEASE-NOTES.md`: truncated to zero bytes.
- `CODE_OF_CONDUCT.md`: deleted. (Revised 2026-09-30 by the owner: it routed incident reports to the upstream maintainers.)

### 4.4 Telemetry removal

File: `skills/brainstorming/scripts/server.cjs`.

- Delete the remote brand image constant, the telemetry environment-variable list, the derived disabled flag, and the conditional that chooses between remote image and text.
- The brand area renders the bundled `assets/ultrapowers-small.svg`, served by the local server, with the text `Ultrapowers v<version>`; the version still comes from `package.json` via the existing reader, renamed.
- `tests/brainstorm-server/branding.test.js` is rewritten to assert the local asset path, the new text, and the absence of any `primeradiant.com` or `<old-name>` string in served HTML.

### 4.5 Tests that must change

- Name assertions: `tests/kimi/test-plugin-manifest.sh`, `tests/devin/test-devin-plugin.sh`, `tests/codex/test-marketplace-manifest.sh`, `tests/pi/test-pi-extension.mjs`, `tests/hermes/test_plugin.py`, `tests/hermes/test_bootstrap.py`, `tests/opencode/test-skill-registration.mjs`, `tests/opencode/test-priority.sh`, `tests/opencode/setup.sh`, `tests/opencode/test-plugin-loading.sh`, `tests/brainstorm-server/branding.test.js`, `tests/brainstorm-server/lifecycle.test.js`, `tests/claude-code/test-sdd-workspace.sh`, `tests/claude-code/test-executing-plans-scripts.sh`, `tests/claude-code/test-subagent-driven-development-integration.sh`, `tests/diagnosing-ultrapowers/test-skill-structure.sh`, `tests/hooks/test-session-start.sh`, `tests/version-bump/test-bump-version.sh`.
- Deleted with their subject: `tests/codex-plugin-sync/`, `tests/codex/test-package-codex-plugin.sh`.
- `tests/claude-code/test-worktree-path-policy.sh` and `tests/hooks/test-session-start.sh` assert that legacy `~/.config/<old-name>` text is absent; those assertions are renamed and remain valid.

## 5. Acceptance criteria

1. `OLD="$(printf 'super%s' powers)"; grep -rli "$OLD" . --exclude-dir=.git --exclude-dir=.remember --exclude-dir=node_modules` returns nothing (binary files included).
2. `find . -path ./.git -prune -o -iname '*<old-name>*' -print` returns nothing.
3. `scripts/bump-version.sh --check` reports `1.0.0` in all eleven registered files and `--audit` finds no stray version strings.
4. Every offline suite passes: `bash tests/hooks/test-session-start.sh`; `node --test tests/pi/test-pi-extension.mjs`; `bash tests/opencode/run-tests.sh` (unit tests only); `python -m pytest tests/hermes`; `bash tests/kimi/run-tests.sh`; `bash tests/devin/test-devin-plugin.sh`; `bash tests/codex/test-marketplace-manifest.sh`; `bash tests/version-bump/test-bump-version.sh`; the shell-lint tests; `npm test` in `tests/brainstorm-server`; `bash tests/antigravity/run-tests.sh`; the non-model scripts in `tests/claude-code/` (`test-sdd-workspace.sh`, `test-executing-plans-scripts.sh`, `test-worktree-path-policy.sh`); `bash tests/diagnosing-ultrapowers/test-skill-structure.sh`.
5. `scripts/lint-shell.sh --all` passes.
6. In Claude Code, `/plugin marketplace add S:\ultrapowers` followed by `/plugin install ultrapowers@ultrapowers` succeeds; a new session's bootstrap says `You have ultrapowers.`; `/ultrapowers:brainstorming` is listed and loads.
7. `RELEASE-NOTES.md` exists and is empty. `.github/FUNDING.yml` does not exist.
8. Served HTML from the brainstorm companion contains no `primeradiant.com` URL.

## 6. Risks

- Blind substitution inside code identifiers can produce names that differ only by case from surviving ones. Mitigation: the three-variant map is exact, and the test run covers every injector.
- The Muse manifest is hand-enumerated; a missed entry silently drops a skill. Mitigation: acceptance grep plus a check that every `skills/*/SKILL.md` appears in the Muse list.
- Windows line endings: renamed hook and shell files must stay LF. Mitigation: `.gitattributes` already pins them; the shell lint runs `bash -n`.
- The brainstorm-server tests need the `ws` dev dependency; if `npm install` is unavailable offline, that suite is reported as skipped, not passed.

## 7. Out of scope

New skills, the scaffold engine, project templates, team memory, and QA belong to pieces 2 to 5. Migration of any existing `.<old-name>/` ledgers is not attempted. The `.remember/` directory is local tool state and is untouched.
