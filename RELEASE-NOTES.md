# Ultrapowers Release Notes

## v2.3.0 (2026-10-23)

The fixes for the 2026-10-23 vulnerability hunt of this repository, for the findings of a hunt of a project `init` scaffolded that trace back to the plugin, and for a second hunt of the release candidate (the reports are not committed).

**Heads up:**

- QA runs and hunts no longer hold a project-wide marker. The single `.ultrapowers/qa-active` and `hunt-active` files are gone: each run is its own record under `.ultrapowers/runs/` (`hooks/lib/run-records.mjs`), and any number run at once: several tickets of one project in different sessions and harnesses, and several projects on one disk. A record guards only its own run: on Claude Code its session and the session's subagents (`CLAUDE_CODE_SESSION_ID`), elsewhere the calls made in its own project folder. A record of a session follows that session into a nested worktree or project; a record of no session guards its own project folder only, never a nested one; your other sessions are never made read-only by either. A session that a run already guards starts no second run, and the run's own calls run `run-records.mjs` only to end their run or list the records. The run ends itself once its report holds its `Verdict:` line (logged in `reviews/<id>/run-log.txt`); no step of yours is needed. A record past 24 hours, or dated more than five minutes ahead of the clock, guards nothing. Only a second live run of the same ticket or audit id is refused, because both would write `reviews/<id>/`. Old `qa-active` and `hunt-active` files left in a project do nothing.
- An autopilot stage reaches only the hosts in `qa.hosts.allowed` with `curl` and `wget`, an empty list included, and only the MCP servers of the ticket's snapshot of `.mcp.json`; remote MCP servers stay out of that snapshot. A stage's environment is an allow-list: `ODOO_API_KEY` and the keys of `.agents/mcp-secrets.env` reach it only when a server of its snapshot names them, or when `autopilot.stageEnv` lists them.
- Autopilot refuses a ticket whose body was edited after the ready label went on, removes the label and asks a maintainer to re-apply it. On Odoo with tracked tags, any task write after the ready tag counts as an edit.
- A ticket's `.agents/ultrapowers.json` and repository git config are snapshotted at `begin`; a later change blocks the ticket until `begin` runs again with no stage open.
- An Odoo `url` or `mcpUrl` must use https, except for a loopback host.
- Scaffolded `.claude/settings.json` no longer pre-approves `git blame`, and pre-approves the build and test commands of the toolchains found at the project root only. The `.gitignore` block ignores `.env`, `.env.*` (not `.env.example`, `.env.sample`, `.env.template` or `.env.dist`) and `.dev.vars` files.
- Upgrade mode (`/ultrapowers:init`) offers the sixteen scaffold targets this release changed (the Claude, Cursor, Qwen and OpenCode settings, the MCP files, the gitignore block, the pre-commit hook and the Gemini hook); `templates/CHANGES.json` records them at 2.3.0.

**Guardrail**

- An interpreter or shell given `/dev/stdin`, `/dev/fd/N` or `/proc/*/fd/N` as its script is refused (with a heredoc it ran code no rule read, the hunt included); the hunt runs node or python only on the plugin's own scripts (its preflight, the review assembler, `run-records.mjs`), from the plugin's folder, so no copy in a project and no `npm` or `pip` entry script runs as one.
- `find -delete`, a recursive or forced `rm`, `rmdir`, `shred`, `dd` and `mkfs` are judged on the words the shell runs, so quoting the program no longer skips the rule.
- Key paths are tested in canonical form (`//`, `/./`, symlinks, 8.3 names), and every `/proc/.../environ` file is refused.
- `${NAME:-x}` and the other `${NAME<op>}` forms count as reads of `NAME`; `${!NAME}`, `declare -p NAME`, a name reference to a credential, `awk ENVIRON` and `jq`/`yq` environment reads are refused. `${NAME:+set}` and `${#NAME}` stay the presence checks.
- In an autopilot stage, `git rm` and `git mv` operands, `--output`, the paths of `git checkout <tree> <path>` and the folder of `git worktree add` are held to the protected paths; HTTP clients other than `curl` and `wget` are refused.
- A role variable never stands for a tracker credential, and the hunt reads no role variable.
- An MCP call whose server or tool name cannot be read is refused; Antigravity's `call_mcp_tool` keeps its server and tool name.
- The hunt runs `date` (printing forms), `npm audit --omit`/`--include`, and `npm ls` with `--package-lock-only`, `--prefix` inside the project and package names.

**Every harness.** The run-record change lands on every entry point: the bash hook `hooks/qa-guardrail` (Claude Code, Cursor, Copilot CLI, Droid, Qwen Code, Devin, Codex) reads `.ultrapowers/runs/` and the autopilot marker; `hooks/run-hook.cmd` (Windows without bash) has its fail-closed path read `.ultrapowers/runs/*.json`; `hooks/lib/guardrail-bridge.mjs` serves OpenCode and Pi; `hooks/lib/guardrail-cli.mjs` serves Kimi, Antigravity, Hermes and the Gemini project hook, and Antigravity's `call_mcp_tool` keeps its server and tool name; the Hermes plugin and the OpenCode plugin changed their own fast paths; and the Gemini hook template changed, recorded in `templates/CHANGES.json` for upgrade mode. The tool references under `skills/using-ultrapowers/references/` never named the markers and did not change; the Kimi, Hermes and Muse manifests did not change.

**Autopilot**

- An approval belongs to the latest packet the engine posted on the tracker, not to `tasks/<ID>/autopilot.json`; a pull request URL is always the one the forge returns for the ticket's own branch.
- The engine's git config pins add `core.askPass`; a configured branch name that git would read as an option is refused.

**Everywhere a tool is started**

- `hooks/lib/resolve-tool.mjs` starts git, gh, glab, bash, cygpath and the harness CLIs from absolute PATH entries outside the project, never by bare name: on Windows a bare name resolves in the working directory first.

**Scaffold and the rest**

- The Cursor CLI config and Qwen's permissions carry the Claude template's full secret-read denies, `.env.secrets` and `.dev.vars` among them. Codex, Gemini CLI, Factory, Kimi and Copilot have no deny-list surface in the scaffold.
- The gitleaks Docker fallback is pinned by tag and digest and runs with no network; the scaffolded Playwright MCP server runs `--isolated`.
- Hidden HTML comments in a ticket never reach an autopilot stage.
- The brainstorm server's session directory under `/tmp` comes from `mktemp`, mode 700.
- Antigravity runs a plugin hook from the plugin's folder (measured on agy 1.3.3), so issue #53's relative hook path is safe there; Kimi Code documents the same.

**Known residuals, out of scope by decision:** a script a stage writes and runs still reads the keys its MCP servers need, and can still rewrite engine files a call cannot; only an OS sandbox or a signed, engine-owned store removes that. A QA run or a hunt ends itself, so a prompt-injected agent of the run can end its own guard early (audit finding M5): only through `run-records.mjs end`, only after a report with a `Verdict:` line exists, and the end is logged in `reviews/<id>/run-log.txt`. Ending a run by hand was the alternative, and it blocked concurrent runs.

**From the hunt of the release candidate (386b837)**

A second hunt, of `dev` before this release, found four Highs, and Mediums and Lows in the same areas. This release fixes them; the items that need a live harness measurement or a design decision are listed in a follow-up issue.

- **Run records.** A run's own calls run `run-records.mjs` only to end their run or list the records; a second `start` would change the profile that guards the session. The CLI reads its command from its first argument only (`run-records.mjs <start|end|list|pick> ...`), so no option before it can name another command, and a session that a run guards from a parent project starts no run in a nested one. During a hunt, node and python run only the plugin's own scripts, from the plugin's folder. A record of a session guards that session in a nested project or worktree too. When a hunt and a QA run both guard a call, the hunt (the stricter profile) judges it, on every entry point.
- **Guardrail.** A URL whose authority holds a backslash, a `#`, whitespace or a second `@` is refused. A glob or `find -name` that can reach `/proc/<pid>/environ` is refused. Key material is also matched through `${X:-WORD}` defaults, brace lists and the patterns of `find`, `grep --include` and `rg -g`, and now names `.pypirc`, cargo credentials, gcloud and azure folders, `.pgpass`, `.vault-token` and `*.pem`/`*.key` files. `envsubst`, jq or yq reads of the environment, `gh`/`glab auth token` and `auth status -t` are refused. `sort --compress-program` is refused; `task-done`, `watch` and `parallel` are unwrapped so the command inside is judged; `exec -a`, `time -f`/`-o`, the source of a hard link, `declare -n` with no target and a symlinked write area are handled. An MCP tool whose name holds `run`, `rerun`, `cancel`, `transition`, `trigger`, `dispatch`, `retry`, `play`, `start`, `invoke` or `restart`, in snake or camel case, is a write. A whole process folder of `/proc` (`/proc/self`, `/proc/<pid>`) is refused to the shell and to the file tools. Nested `${X:-${Y:-WORD}}` defaults are resolved before the key test. `jq` and `yq` read no program from a file (`-f`, `--from-file`); `yq --in-place` is a write; `gh`/`glab config get` of a token key is refused; `${!1}` and the other positional indirections are refused. `strace`, `ltrace`, `script`, `chronic`, `faketime`, `proxychains` and `torsocks` are unwrapped, so the command inside is judged. `link` and `cp --link=` are hard links. Key names may hold a space, and `.pfx`, `.p12`, a `.bak`, `.old` or `.orig` copy, `id_ecdsa` and `.gem/credentials` count. A bare file name that is a symlink in its folder (`cat notes.txt`) is resolved before the key test, like a path.
- **Autopilot stage rules.** `git stash push` with `-a`, `-u` or a pathspec, `yq -i` and `yq -s` on protected files, `gh`/`glab` `clone` and `download`, `gh api --hostname` and the forge host variables are refused, and so are `GH_REPO`, `GLAB_REPO` and a URL argument to `gh` or `glab` whose host `qa.hosts.allowed` does not list (a stage gives the number or `OWNER/REPO`). The protected paths add `.opencode/`, `.cursor/hooks.json`, `.cursor/hooks/`, `.cursor/environment.json`, `.cursor/worktrees.json`, `.devcontainer/`, `.pi/`, `.claude-plugin/` and `hooks.json`. OpenCode and Hermes MCP tool names are matched to their server for the stage's server list; Cursor's `MCP:<tool>` names no server, so a Cursor stage calls no MCP tool.
- **Engine.** The snapshot taken at `begin` also holds `repos`, `topology`, `qa` and `kb`; a `repos[].path` that is absolute or holds `..` is refused. `status` checks the git config before it runs git. The gate refuses to push a documents branch that holds paths outside the ticket's document folders (`docs-scope`); a stage cannot move the base branch onto its tip to hide them (`git checkout -B`, `git switch -C`, `git branch -f` and `update-ref` are refused in a stage). Remote media in the markdown the engine and `task-review` post become links: `src`, `srcset`, `poster`, `data` and `background` on any tag, and `<link>` and `<base>` addresses. `task-review` refuses report files that are symbolic links.
- **Tickets.** The autopilot form of a ticket also loses zero-width, bidirectional and tag characters, markdown link definitions that point nowhere (`[x]: #`) and the titles of the others, `<!...>` declarations and `<?...?>` instructions, and Odoo HTML hidden by a class (`d-none`, `sr-only`, ...), a `hidden` attribute, a style (`display:none`, `font-size:0`, ...) or a `<template>`, counted in the same note.
- **Hunt preflight.** A `DECLARED` row with a control character, a backtick, `$(` or more than 200 characters is dropped and counted, and so is a version of several words in which a word holds no digit and is no range operator (a sentence). A dependency counts as private when an `.npmrc`, `.yarnrc.yml`, pip index option or Gemfile source names a non-public registry for it.
- **Harnesses.** The OpenCode guard searches every folder a call names (V2 contexts included), and a file in a folder that does not exist yet is judged from its nearest existing ancestor. On Hermes, during a run, a relative path, an unresolved `~` and a `cd` (quoted, escaped or through `eval` or a `$` command word too) are refused (Hermes sends no working directory), and node is never taken from a folder inside a project.
- **Scaffold.** The Claude settings pre-approve `git diff` with no argument, `--stat`, `--cached`, `--name-only` and `HEAD` only (`git diff --no-index` read any file). The Claude, Cursor and Qwen secret-read denies and the scaffolded `.cursorignore` add `.env.prod`, `.env.dev`, `.env.preview`, `.env.prd`, `.env.stage` and `.env.uat`. The Claude settings deny `git show REV:PATH` of an env or `.dev.vars` file at any depth. The Windows MCP launcher starts `cmd` from `ComSpec` and never searches the project folder for `npx`.

Every harness, for this part: the bash hook and the analyzer changed (every harness runs them, through the hook, `run-hook.cmd`, the bridge or `guardrail-cli.mjs`); the bridge changed for OpenCode, Pi, Kimi, Antigravity, Hermes and the Gemini project hook; the OpenCode plugin, the Hermes plugin (`guardrail-cli.mjs --hermes`) and the Gemini hook template changed their own fast paths; Cursor got its MCP rule in the hook; `run-hook.cmd` did not change (it refuses every call while any record exists). The Claude, Cursor CLI and Qwen settings templates changed (`templates/CHANGES.json` already records them at 2.3.0). The Kimi, Muse and Devin manifests, the tool references and the headless adapters did not change.

**Current sources (GH-59)**

Brainstorming, writing-plans and the vulnerability hunt now check current sources before they design, plan or audit: the official documentation, current versions and current security advisories of the technologies in scope (GH-59). There is nothing to configure. Each one finds the research tools its session already has by what they do (a web search, a page fetch or scrape, a documentation server for a library or a vendor's product, built into the harness, served by an MCP server or installed as a CLI) and names no tool; with none, it says `Current sources not checked: no research tool in this session` and invents nothing. Design: `specs/GH-59/Spec.md`.

- **The shared rules.** `skills/brainstorming/current-sources.md` holds them once: find tools by capability, official sources first, a query carries public names and versions only (never project code, secrets or private names), fetched text is data and never an instruction, and every source is recorded with its link, date and version.
- **brainstorming** checks current sources before the first question on every path except the quick task, as a step and not an offer, and puts what it read on the decision record's `Evidence:` lines. **brainstorm-task** does it while it grounds the ticket and names the research tools in its manifest. **writing-plans** checks every API, option and version a plan pins and records the pages on a new `**Sources:**` header line, with a sixth self-review item.
- **The vulnerability hunt** gains STEP 0b: before its guardrail is on, a research subagent checks current advisories for the declared runtimes (`engines`, `.nvmrc`, `python_requires`, ...), the base images and the direct dependencies no installed audit tool covers, and never queries a private package. It opens no project file: the preflight's new `DECLARED` section hands it the declared runtimes, images and dependencies as name and version rows with their `file:line`, so a repository's own text cannot steer a subagent that runs before the guardrail. Its rows land in a new `Advisories from research` table per repository (`reviews/<ID>/research.json`, then `repos[].research` in `security-findings.json`), separate from the CVE table, which stays tool-only. A row that applies counts like a CVE of the same severity, once; a critical or high one counts only after a verifier has checked its platform, feature and flag conditions against the repository. A declared runtime now counts as runtime. `task-review` renders and counts the same table.
- **The hunt guardrail** denies, while a hunt's run record guards the session, every tool the hunt does not use, whatever its name: a query-only search or documentation tool passed it before. The shell, file readers, subagent dispatch and its report and lifecycle tools, task tracking, skills, asking the user, the read, list and stop forms of the shell session tools and tracker reads still pass; the tools that type into a running shell are refused, because the shell rules never see that text.
- **Autopilot** `spec`, `plan` and `changes` stages may fetch, search or scrape any public host that `qa.hosts.forbidden` does not list (a forbidden host covers its subdomains there), so their research needs no host list. A loopback, link-local, private, single-label or `.internal` host, and any browser tool, still need `qa.hosts.allowed`; every other stage keeps the listed-hosts rule. The headless adapters are unchanged, so a stage on Codex, Copilot CLI, Gemini CLI or Pi researches with that harness's built-in tools only.
- **AGENTS.md Rule 5** says how research reaches the network.

Every harness: the guardrail change lands in `hooks/qa-guardrail`, which every entry point runs (the bash hook and `run-hook.cmd` for Claude Code, Cursor, Copilot CLI, Droid, Qwen Code, Devin, Codex and Muse; the bridge for OpenCode and Pi; `guardrail-cli.mjs` for Kimi, Antigravity, Hermes and the Gemini project hook). No manifest, hook registration, scaffold template or Muse skill list changes: there is no new skill. The skill text names no tool, so it reads the same on every harness.

## v2.2.0 (2026-10-13)

Every spec now comes from one template and carries a decision record: the approaches considered, why one won, where it breaks and what sits at its edges, with a source on every claim line. A checker refuses a spec that misses any of it, at the self-review, at the ticket commit, at the end of the autopilot spec and changes stages, and in the scaffolded pre-commit hook. The brainstorming skill presents its approaches in the same shape before the design, sorts every template question it never covered instead of filling it, and writes the design from the template. Design: `docs/ultrapowers/specs/2026-10-12-spec-template-and-decision-record-design.md`, itself the first spec in the new shape. The same release closes the gap in the ticket route: the execution skills hand off to `task-review` before the finish, and the finishing skill verifies that gate at the door. Design: `docs/ultrapowers/specs/2026-10-13-ticket-route-and-review-gate-design.md`.

**Heads up:**

- Upgrade mode (`/ultrapowers:init`) offers three targets: `specs/_template/Spec.md` (the template), `specs/README.md` (one bullet about it) and `.githooks/pre-commit` (the spec-check block). `templates/CHANGES.json` records each at 2.2.0. `.agents/ultrapowers.json` needs no change and no setting is added.
- An autopilot ticket whose spec predates the template is not touched at its gate or execute stage, but a `changes` stage after this upgrade ends blocked with `spec-incomplete` until the spec is brought to the template; the ticket comment names the first three findings.
- The pre-commit hook finds the checker the way it finds the memory lint: through `ULTRAPOWERS_ROOT` or the Claude Code plugin cache. On every other harness set `ULTRAPOWERS_ROOT` to the plugin checkout, or the spec check warns and continues.
- Without node on the machine, the brainstorming skill hands the spec over with a one-line note, `commit-spec.sh` prints `=== SPEC-CHECK-SKIPPED ===` and commits, and the hook warns and continues. A checker that runs and exits 2 stops the hand-over and the ticket commit.
- `_template` and any id with a leading underscore are refused as ticket ids by `validate_ticket` and by the four scripts that copy its rule, whatever `ticketPattern` allows.
- In a ticket project, `finishing-a-development-branch` now reads `reviews/<ID>/TASK-REVIEW.md` after the test suite: missing, or written for another head, it runs `task-review` (the code review, the vulnerability hunt and the QA gate) before its menu; present, it quotes the verdict above the menu, and a `FAIL` or `BLOCKED` verdict makes the pull request a draft. Your explicit instruction to skip the gate still skips it. The decision stays yours.

**The spec template and the decision record**

- `templates/specs/_template/Spec.md.tmpl`, rendered to `specs/_template/Spec.md`: thirteen sections in a fixed order (Intent; Goals, non-goals and anti-goals; Constraints; Decision record; Architecture; Components; Data flow; Error handling; Testing; Left to the builder; Definition of done; Repositories in scope; Assumption ledger), two or three italic questions under each heading that the writer answers or removes, and a `### D1:` block with five labels: Chosen, Why this one, Rejected, Failure points, Edge cases. A section that does not apply says `None:` with the reason. A project may add sections and questions to its copy; the status line and the decision record are the non-removable core.
- Every line under Why this one, Rejected, Failure points and Edge cases ends with its source, `Evidence: <source>`, or says `Assumption:` with the reason or `My call:` for a minor choice. A source is a file and line read in the session, a document or standard by title, official documentation read through a docs server or the web reader, a probe or a measurement with its result, a ticket page or attachment, or what your human partner said in the conversation. Every `Assumption:` and `My call:` line is a row of the Assumption ledger, which now serves the interactive form too: the calls you made, lowest confidence first, for your partner to check while reading.
- The brainstorming skill (`skills/brainstorming/SKILL.md`): in the architectural path and the ticket form the approaches are presented before the design, in one message, the recommended one under the record's labels with a source on every line, each alternative with why not and its main failure point; before writing, every italic line of the template is sorted into covered, minor (settled and marked `My call` with a ledger row) or theirs (asked in one message, most important first), and a whole section nobody covered is asked, not filled; the written design starts at the title and keeps every heading, on every path in the ticket form; self-review item 5 runs the checker; the autopilot form mirrors the record's assumption lines as ledger rows; the bounded path names the alternative not taken in one line; three Red Flags rows. Evidence: scenarios D, E, F and G in `tests/skills/brainstorming-pressure-scenarios.md`, RED and GREEN in `brainstorming-pressure-results.md`.
- `brainstorm-task` says what `=== SPEC-CHECK-FAILED ===` and `=== SPEC-CHECK-SKIPPED ===` mean; the autopilot spec-stage prompt names the template; init's node message names the spec check.

**The checker**

- `skills/brainstorming/scripts/check-doc.mjs`, node built-ins only: `node check-doc.mjs [--template <path>] <document>` and `--print-template`. It reads the project's `specs/_template/Spec.md` when the project has one, else the plugin's payload. Seven rules, read from the template except two that are core: `heading` (every template heading, in order), `status` (core), `question` (no italic template line survives), `placeholder` (no `TBD`, `TODO` or `<...>` outside code), `empty` (every section has content; a bare `None` is not content), `record` (core: `D1`, the five labels in order, a tag on every line under four of them), `ledger` (the engine's five columns, confidence high, medium or low). Fenced code blocks and HTML comment lines are blanked before any rule, so a spec may quote the template; an unclosed fence is one finding at its line; inline code spans are matched within a paragraph. Findings print as `path:line: rule: message`; exit 0 clean, 1 findings, 2 cannot run.
- `commit-spec.sh` runs it before `git add`; the autopilot engine runs it at the end of the spec and changes stages and refuses a spec or template that is not a regular file inside the project; the scaffolded hook checks every staged spec that is new in the commit or already carries a decision record, treating a rename as a modification, and skips the template itself and files under `docs/ultrapowers/specs/` without the `-design.md` suffix.
- The engine's section reader now blanks fenced code too, so a spec that quotes the template keeps its scope list and its ledger rows on the packet.

**The ticket route and the review gate**

- `subagent-driven-development` and `executing-plans` end, in the ticket form, with `task-review` for the ticket and then `finishing-a-development-branch`; outside it, with the finishing skill as before; in the autopilot form they return to the engine as before. Their flowcharts, Finish sections, example end messages and rationalization tables say so.
- `finishing-a-development-branch` has a Step 1b, Verify the Whole-Ticket Review: the report missing or stale runs `task-review`; the report is current when its reviewed head is an ancestor of the branch head and the commits since touch only `reviews/<ID>/`; a current one is quoted above the menu with its counts; a `task-review` that stopped before a verdict leaves its reason above the menu. On `FAIL` or `BLOCKED`, option 2 reads "Push and create a draft Pull Request" and opens a draft (`gh pr create --draft`, `glab mr create --draft`) whose description quotes the verdict line. Four new rationalization rows.
- `using-ultrapowers` carries the route in sixty words, "The Ticket Route", and sends a merge or a pull request through the finishing skill. `task-review` triggers on its own when a ticket's implementation is complete and its branch is about to be merged or opened as a pull request, and names the finishing skill as the next step without invoking it. `task` reports a ticket whose plan tasks are done and whose branch has no `TASK-REVIEW.md` as "at the whole-ticket review".
- The README's How it works and Basic Workflow follow the same route and say that `task-review` includes the QA gate; running `qa-specialist` alone refreshes `QA-REPORT.md` only.
- `task-review`'s assembler mirrors the engine's "QA not configured" rule: in a project whose `qa.urls` are blank, a missing QA report no longer makes the verdict `BLOCKED`; the verdict comes from the code review and the vulnerability hunt, and the report says "QA: not configured for this project". With QA configured and no report, `BLOCKED` stays.
- Not changed: the autopilot engine, which runs `qa` and no hunt stage (issue 43); projects without a scaffold, where the gates refuse to run.

**Harness parity**

- Rule 9: this change touches no harness-specific surface. The prose is shared, the checker and the engine run on node, and the hook is git. The per-harness suites of the gate pass unchanged. The one surface recorded as absent: on harnesses other than Claude Code the hook needs `ULTRAPOWERS_ROOT` to find the checker, as it already does for the memory lint. The ticket route and the whole-ticket review touch skill prose, the README and one bash test; no harness-specific surface, and the Muse skill list is unchanged.

**Tests**

- New: `tests/brainstorming/check-doc.test.mjs` (35 tests, including the spec of this change as its own dogfood case and a test that the spec's fenced copy of the template equals the payload) and `tests/brainstorming/test-precommit-spec-check.sh` (17 cases on a throwaway project at a path with a space). Extended: the lifecycle, autopilot, init, skill-body and four ticket-id suites. The checker suite also runs in the Windows CI job.
- `tests/skills/test-skill-bodies.sh` gains the section "the ticket route reaches the review gate", written before the change and failing on it; `tests/skills/lifecycle-gates-pressure-scenarios.md` and `lifecycle-gates-pressure-results.md` hold the eight scenarios and their RED and GREEN runs.

**Known residuals**

- GitHub-flavoured markdown renders the template's bare `<Title>`-style placeholders as HTML tags and hides them; the raw file is the one a writer reads. Escaping them changes the template text, so it is left for an issue.
- The engine's `isFile()` clause has no test that depends on it (a directory at the spec path blocks correctly by hand); the symlinked-spec test skips where the platform cannot create a symbolic link.
- The templates for the plan, the QA report, the security report and the task review follow in #57; the measured cost of subagent-driven execution is reported in #56.

## v2.1.0 (2026-10-11)

A vulnerability hunt for a ticket's change or a whole project, the guardrail profile that keeps it read-only on every harness that runs the guardrail, one test suite that keeps those entry points in step, and a security hardening pass over the plugin's own code. The hunt is beta. The live run of the new hunt on this repository found six guardrail bypasses that the earlier hunt on dev had missed, and this release fixes them (see "Found by the live hunt" below).

**Heads up:**

- `task-review` now runs the vulnerability hunt between the code review and the QA gate. A security `FAIL` makes the review `FAIL`; a security `PASS-WITH-ISSUES` makes it `PASS-WITH-ISSUES`; a security `INCOMPLETE` is named in the verdict and never blocks. The hunt uses the audit tools installed on the machine (`npm`, `pip-audit`, `cargo-audit`, `dotnet`, `osv-scanner`, `gh`, `glab`) and reports a lane as `incomplete` when a tool fails; it installs nothing.
- The guardrail refuses more during a QA run and an autopilot stage (see "The security hardening pass"): among others, any PowerShell command, an interpreter given code inline, a shell init command, and a write by `mkdir`, `touch`, `sort -o`, `tar` or `patch` outside the report area.
- Upgrade mode (`/ultrapowers:init`) offers the three templates that changed: `README.md` (the `hunt` setting), `.claude/settings.json` (pre-approves the new skill and carries the secret-read denies of the hardening pass) and `.gemini/hooks/ultrapowers-guardrail.mjs`. `templates/CHANGES.json` records the version of each. `.agents/ultrapowers.json` needs no change: the new `hunt` block is optional.

**Vulnerability hunt and audit**

- New skill `ultrapowers:vulnerability-hunt`: `/ultrapowers:vulnerability-hunt [ticket] [repo...] [--full-audit] [--post]`. With a ticket it hunts the files the ticket's change set touched. `--full-audit`, or no ticket, audits the whole tree and writes under `reviews/audit-<date>/`; a ticket with `--full-audit` is a full audit under the ticket's folder. It reads and reports: it installs nothing, fixes nothing and commits nothing, and a secret is named by file, line and kind, never printed or hashed.
- New agent `agents/vulnerability-hunter.md`, the hunt's contract and its gatekeeper: it plans the hunt, dispatches the hunters, sends every High or Medium finding to a verifier and writes the verdict. It is forked where the harness supports it and read inline elsewhere. A preflight, `hunt-preflight.mjs`, scopes the run (a change set per repository, or the whole tree), finds the manifests and the installed audit tools, decides the lanes, plans the hunters and reports a stale marker. `--repo` narrows a ticket's repositories, and a repository dropped from the selection shows as a note.
- Five lanes, each split over parallel hunters: dependencies (a CVE enters the table only from an audit tool's own report with an advisory id, marked runtime or test-only, never from memory), code, secrets and supply chain, the AI and agent surface (run when a model client, a prompt folder or an MCP config exists), and open-source intelligence on what the public can already see (run when `gh` or `osv-scanner` answers). No manifest is a note, not a failure.
- New project setting `hunt.maxHuntersPerLane` in `.agents/ultrapowers.json`: the most hunters one lane runs in parallel, a whole number above 0, default 8. It is in the README's configuration table, the scaffold template and the project README template.
- A verifier on the most capable model tries to refute every High or Medium finding; a finding it rejects, or that rates below the confidence floor of 6 out of 10, never counts and appears under Discarded leads. A finding without a numeric confidence is an error. Every subagent names its model: hunters on a mid-tier model, verifiers and the verdict on the most capable.
- The verdict (`PASS`, `PASS-WITH-ISSUES`, `FAIL` or `INCOMPLETE`) is `FAIL` on a confirmed or plausible High finding or a critical or high CVE in a runtime dependency; `PASS-WITH-ISSUES` on a Medium finding, a moderate runtime CVE or a critical or high CVE in a test-only dependency; `INCOMPLETE` when the dependencies lane produced no block, or its status is `incomplete` with no CVE recorded (an audit tool that failed and reported no advisory). Low findings never change it. It goes to `reviews/<ID>/SECURITY-REPORT.md`, with `security-findings.json` beside it, and a `Guardrail:` line says whether the guardrail was active.
- `task-review` runs the hunt as its Step 3b. Its assembler reads `security-findings.json`, computes the security verdict itself instead of trusting the report's line, and folds it into `TASK-REVIEW.md`; with no hunt file it reports "no vulnerability hunt" and changes nothing. A Red Flags row without a run behind it is dropped.
- `--post` comments the report on the ticket and on its open pull or merge request through the autopilot tracker clients: `post-review.mjs --security-only <ticket | audit-date>`. For an audit without a ticket it comments the open pull or merge request of the current branch and refuses when none is open. It commits and pushes `reviews/audit-<date>/` through the guarded push only on a branch that starts with `audit-<date>-`; on any other branch it says that nothing was committed or pushed. Combined with `--draft-pr` it is a usage error.
- The autopilot hunt stage is not part of this release; it is tracked in issue #43.

**The `hunt` guardrail profile**

- A third profile beside QA and autopilot, switched on by the marker `.ultrapowers/hunt-active` with the deny prefix `HUNT-GUARDRAIL`. The marker walk reads `qa-active`, then `hunt-active`, then `autopilot-active`. The profile reads everywhere in the project and writes only under `reviews/<audit id>/` and `.ultrapowers/`.
- It allows a closed list of audit commands in their listed forms: `npm audit` and `pnpm audit`, `pip-audit`, `cargo audit`, `dotnet list package --vulnerable`, `osv-scanner`, `gh api` and `glab api` reads, and `gh search code`. Three need a flag: `npm audit` needs `--package-lock-only`, `pip-audit -r` needs `--no-deps`, and `dotnet list package` needs `--no-restore`, so that none of them resolves or restores anything. The dependencies lane prompt carries those flags.
- Package managers are allowed only in their audit form and a read-only listing form that no project script can shadow (`npm` and `pnpm ls`, `pip list` and `freeze`, `cargo tree --locked`); `yarn`, `bun`, `uv`, `poetry`, `pipenv`, `pdm` and `go` are refused for every subcommand, and so is anything started through a package runner, including an `npx`-started audit tool. Installs and restores are refused.
- `gh api` and `glab api` take a path only: a URL or `--hostname` is refused. `make test`, `mvn`, `gradle` and `phpunit` count as test suites and are refused, as are `git worktree add`, key material and every tracker write.
- The profile is on every entry point that runs the guardrail: the bash hook `hooks/qa-guardrail`; `hooks/run-hook.cmd`, which fails closed on the hunt marker with its own `HUNT-GUARDRAIL` message when there is no bash; the bridge (`hooks/lib/guardrail-bridge.mjs`) for OpenCode and Pi, whose deny parser keeps the `HUNT-GUARDRAIL` prefix; `hooks/lib/guardrail-cli.mjs`, which runs the hook through the bridge, for Kimi Code, Antigravity, Hermes and the Gemini project hook; the Hermes plugin's own deny, which carries the prefix; and the Gemini launcher template, recorded at 2.1.0 so upgrade mode offers it. The OpenCode in-process fallback walks the same three markers.
- OpenCode V2: the plugin's V2 setup registers the run guardrail on `ctx.tool.hook("execute.before")`; before this release a V2 session ran a QA run, a hunt or an autopilot stage without its brake. A V2 call with no argument object is refused during a run, and a host without that hook gets one logged line saying the guardrail is not registered. That V2 behaviour follows the OpenCode source as read on 2026-10-11 and has not been run on a live V2 host; the README and `docs/README.opencode.md` say so. A denied V2 call is expected to stop before the tool runs, without the hook's reason text.

**Harness parity**

- `AGENTS.md` rule 9 (every harness, every change) is applied to the hunt: each harness-specific surface it touches is covered or recorded as absent. The Muse manifest lists the new skill, and `.claude-plugin/plugin.json` declares `"agents"` as an array of the two agent files, `["./agents/qa-specialist.md", "./agents/vulnerability-hunter.md"]` (a folder value does not load).
- New suite `tests/hooks/test-guardrail-entrypoints-parity.mjs`, one test over every entry point. It pins that the bash hook, the bridge, the OpenCode, Hermes and Gemini entry points and `run-hook.cmd` agree on the run markers, the deny prefixes and the precedence; the bridge's deny parser; the hook registration on every harness; the OpenCode V1 and V2 guard registration; and that each skill that forks into an agent has its agent file. A new profile can no longer land in one entry point only. It is listed in `AGENTS.md` and in CI, with `tests/vulnerability-hunt/run-tests.sh` and the `hunt` profile fixtures (`tests/qa-gatekeeper/test-hunt-profile.sh`, which `tests/qa-gatekeeper/run-tests.sh` runs).
- Gemini CLI is in the Platform Adaptation list of `using-ultrapowers`, with its `references/gemini-tools.md`.

**The security hardening pass**

A review of the plugin's own code: five read-only investigators (injection, secrets and approval logic, prompt injection, supply chain, the guardrail entry points), one finding at a time verified by the orchestrator, and one fixer per batch, test-first. No CVE was found in any dependency; the plugin still has none at run time.

Autopilot engine:

- On Odoo, where tag tracking is unreadable and every tag is attributed to the task's last writer, a refused approve tag is now removed from the task with a note asking the approver to add it again, and a tag first seen under a non-approver never verifies later because an approver edited something else. The engine records the tags it saw and who placed them. The residual, two writes inside one poll interval, is documented in the watcher guide.
- The engine no longer trusts the stage-writable state file for what it pushes: a ticket branch must match `<ID>-[A-Za-z0-9._-]+` (no `:`, `/` or `..`, so no refspec), `git check-ref-format` runs first and the push names `refs/heads/<b>:refs/heads/<b>` on both sides; the mode comes from the project, the labels and `--mode`, never from the state; the repositories, their branches and worktrees and the frozen scope are re-derived or checked against the configuration, and a mismatch stops the run with `state-tampered`.
- The changes stage reads `tasks/<ID>/changes-comments.md`, which the engine writes before the stage from the ticket comments since the packet, keeping only authors with write access (and in the approvers list when one is set), each between marker lines. A comment from anyone else never reaches the stage. The file is protected like the ticket's other state files, and the stage says how many comments it did not read and why.
- A QA report under a `reviews/<ID>` folder that is a symbolic link or junction out of the project is refused.

Posting to a tracker:

- GitLab runs a note line that starts with `/` as a quick action under the posting account. Every body the engine or `task-review --post` sends to GitLab (issue notes, merge request notes and descriptions) has such lines neutralised with a zero-width space, inside code fences too.
- `task-review --post` refuses a `reviews/<ID>/artifacts` folder, or a `reviews/<ID>` folder, that is a symbolic link out of the project; with such a link, any local file named in a report was uploaded to GitLab or attached on Odoo.

Tickets:

- `source.md` fences the ticket's comments between their own markers with every line quoted, and writes labels, state, attachment names and link URLs as code spans, so a comment cannot forge a message header, a section heading or a downloaded-file line. The closing sentence now covers the text between any ultrapowers markers.
- A link in a ticket to a loopback, private, link-local, unique-local, site-local, shared, multicast, benchmark, NAT64 or 6to4 address, to `localhost`, a single-label name, a `.internal` or `.local` name, a URL with a user name, or plain http to any host but the ticket source's own, is written as "not fetched" with the reason, and brainstorm-task never fetches it. The check is static; the fetch is the harness's.
- The ticket title reaches `scaffold-task.sh create` through `--title-from-json <ticket JSON>` or `--title-file`, never as shell words; new-task and the autopilot scaffold prompt say so.

Project scaffold:

- The Claude Code settings deny reads of `.agents/mcp-secrets.env`, `.env`, `.env.local`, `.env.*.local`, `.env.production`, `~/.ssh` and `~/.aws`, and deny `--output` (and its abbreviations) on `git log`, `git diff` and `git show`, which otherwise write a commit message to any file under a pre-approved rule. OpenCode, Qwen Code and Cursor get the equivalent through their own documented mechanisms; the README names the harnesses that have none, where the guardrail during a QA or autopilot run is the only brake.
- The npm MCP servers in the project template are pinned to exact versions; the gitleaks image in the pre-commit hook is pinned to a release tag; a Docker failure is reported as a skipped scan rather than a found secret; the team-memory lint says when node is missing. Upgrade mode offers all of these to existing projects.
- `init` treats a Node below 22 as a warning, not a stop.
- The Gemini project hook names the profile and the marker in its own deny; the Hermes plugin's own denies carry the profile prefix; the Muse guardrail hook timeout matches the other harnesses at 30 s.

Guardrail entry points:

- OpenCode, Pi, Kimi, Antigravity, Hermes and the Gemini project hook honour `ULTRAPOWERS_AUTOPILOT_INSIDE=1` like the bash hook: a stage whose marker is gone stays an autopilot stage, and a stage outside any project is denied.
- The Antigravity marker search never starts from the tool call's own `Cwd`; it searches the workspace paths, the process directory and then the call's directory, first marker found wins.
- A per-call working directory (`workdir`, `working_directory`, `dir_path`, `Cwd`) is normalised to one field, bounded to the project root, and denied when it resolves outside it, and its relative targets resolve against it like the event's own directory.
- A tracker write through the OpenCode, Hermes or Cursor spelling of an MCP tool is refused like the `mcp__` spelling.

Guardrail rules, QA and autopilot profiles (the hook matches patterns; it is still not a sandbox):

- Shells and interpreters: a PowerShell command is refused outright, and so is `-Method Post` to an unlisted host; a `cmd.exe` command line is refused except a literal list of QA reads, and a `/c` or `/k` tail holding `%`, `!` or `^` is refused; a shell init command or rc file, a `HOME=` assignment before a shell, `fish -C`, a zsh `ZDOTDIR` and any variable a shell or interpreter executes are refused unless on a short safe list; `coproc`, `case`, `select` and `function` are refused; code given to an interpreter inline or on stdin is refused however the option is spelled; `fish`, `csh` and `tcsh -c` are refused like `bash -c`, `env -S` and `patch` are refused, programs run through `ionice`, `flock`, `taskset`, `chrt` or `doas` are judged like the bare program, and `timeout -s` and `-k` no longer hide the program.
- Containers and processes: `docker`, `podman` and `nerdctl` teardown and restart are refused with global options and quoting, `kubectl` is judged by its verb and `helm` is refused outright, and a container CLI option on neither list, a variable in the verb path or a verb outside the read set is refused; `kill` by name (`pkill`, `pgrep`, a group), a non-literal pid and every spelling of `kill -1`, a process group or `0` are refused, while `kill $!` and `kill $PID` stay allowed; `ssh`, `scp`, `rsync`, `nc` and `chmod`-like programs are refused however quoted or wrapped; a `gh` or `glab` verb outside the read allow-list is refused in an autopilot stage; `wget -i`, `curl -K` and a URL under any key or nesting of a tool input are judged like a URL on the command line; package runners fail closed.
- Writes: `mkdir`, `touch`, `sort -o`, `find -fprint`, `-fprintf` and `-fls`, `tar` and `unzip` extraction, in-place `gzip` and a copy into a protected folder are refused outside the report area; key material is refused under `absolute_path`, `dir_path`, `DirectoryPath` and `Url`, and a bare `.ssh` or `.aws` folder counts; a trailing dot, a trailing space or an NTFS stream on a protected path is refused like the plain name; a tool with a path-shaped field the hook did not list is judged like `Write`, a write-named file tool without a readable path is refused, and the patch of any tool named `*patch*` is judged file by file; a git subcommand built from a variable is refused.
- The loops over a call's URLs, key paths and patch files start no process per item, and the push and substitution checks read the command in one pass, so a long command no longer outlasts the hook's timeout.

Found by the live hunt, fixed in this release (hardening rounds 4 to 6). The live hunt of this repository found six bypasses of the guardrail analyzer that the earlier hunt on dev had missed; each was confirmed on the branch, and each is now refused or analysed:

- A command substitution (`$( )` or backticks) is analysed as a command of its own in the same profile, up to three levels deep, instead of being read as opaque text; a cut whose quotes do not balance, a substitution inside a here-document, `${...}` or arithmetic, and in a QA run or a hunt `<( )` and `>( )`, are refused.
- `cd` is scoped: the tracked directory is saved and restored around `( )`, each side of a pipeline, a backgrounded list and a brace group in a pipeline, so a `cd` there no longer moves where the next command's paths are judged; `eval` with a `cd` and `source` make it unknown.
- `$'...'` and `$"..."` words are dynamic for every target check, not literal text.
- The run markers `qa-active` and `hunt-active` are protected from every shell write, move and removal, file tool and patch; the one exit is a call whose entire command is `rm [-f]` of the run's own marker. A marker whose id holds `..`, `/` or `\` refuses every call.
- `git -c`, `--config-env` and `--exec-path` are refused in every profile, not only in an autopilot stage, and so are `git grep -O` (`--open-files-in-pager`) and `--ext-diff` on any subcommand; `-C`, `--git-dir` and `--work-tree` take a literal folder inside the project.
- The bridge refuses a call whose path spellings (`file_path`, `filePath`, `path`, `notebook_path`) name two different files, so a decoy path no longer decides how a write is judged; the hook's own event parse does the same.

The same rounds closed the routes the re-reviews found next to them:

- The Hermes plugin finds `node`, and the bridge finds `bash`, on absolute PATH entries outside the project only, never in the working directory, a relative entry or a folder under the project such as `node_modules/.bin`; the child runs from the plugin's folder.
- The run's directory reaches the hook out of band, as `ULTRAPOWERS_RUN_DIR` set by the bridge on the spawn, and must be an absolute, existing folder; otherwise the hook reads the project root from the event's top-level `cwd` only, never from a key nested under the tool input.
- Cursor, which runs the hook from the plugin folder and sends `workspace_roots` instead of `cwd`, roots the hook from the top-level `workspace_roots[0]` and then `CURSOR_PROJECT_DIR`, each only when absolute and existing; a nested copy never does.
- The hook's search of the event for a run directory, when its own directory holds no run, is linear and reads at most 256 KB and 64 candidates with shell builtins; past that bound it reads the event's top-level fields through node. A 1 MB argument before a nested `cwd` key took minutes, past the hook's timeout, and now takes under a second. The event itself is read in blocks, not one byte per call.

Skills and repository:

- `task-review` runs the review inline, with a `declined` entry, on a harness without a subagent tool.
- CI pins its actions to commit SHAs and pytest to a version; the engine's documented floor is Node 22 (18 and 20 are end-of-life); the brainstorm-server test dependency ws moves to 8.22.0; the Kimi manifest test falls back to `python` when `python3` is the Windows Store stub.

**Audit fixes**

A read-only audit of the merged release, with every finding verified before a fix, found the routes below; each fix landed test-first.

A, a confirmed High from the live audit:

- The PowerShell tool is refused during a run. The hook read its command as POSIX shell, so `sc`, `ri`, `iex` and .NET calls passed in every profile, the run's own marker among them; the tool is now denied by name after the marker lookup, and the Bash tool is the shell of a run.

B, the hunt profile:

- The hunt profile is a program allow-list: it runs only the read verbs, the git and `gh`/`glab` read forms, the audit tools, and node or python on the hunt's own preflight script or a script outside the project; everything else is refused with "the hunt reads; <program> is not on its list". The hunter contract now says the hook refuses a project script too. QA and autopilot keep their deny-list and gain `shuf -o`, `uniq IN OUT`, `openssl -out` and `sqlite3 <db>` as writes held to the report area.
- The hunt has no URL tool and no curl: `curl`, `wget`, `iwr`, `nc`, `ssh`, `rsync` and the like are refused by name, and so are WebFetch, WebSearch and any tool whose input holds a URL, whatever `qa.hosts` lists. An autopilot stage refuses a tool URL whose host no list names. QA keeps open egress on an empty list, as the README configuration table now says.
- With `qa.hosts.allowed` set, curl and wget operands that send a request for a listed host to another server are refused: a schemeless operand, `--connect-to`, `--resolve`, a proxy, a `Host` header, `--url`, and `wget -e` or `--execute`.
- A symlink's target is checked: `ln -s`, `cp -s` and `mklink` are refused in a QA run and a hunt, and in an autopilot stage the link target is held to the same rules as a write.
- The key-material rule judges every word as the shell resolves it, so `.e"n"v`, `.en?` and `.e[n]v` count as `.env`, and a glob that can expand to a key name is refused; `.git-credentials`, `.netrc`, `.npmrc`, the `gh` and `glab` configs, `.docker/config.json`, `.kube` and `.gnupg` join the key files. The token-variable rule now runs in the hunt and, for the tracker credentials, in a QA run.
- The hunt allow-list takes the read-only text filters in their safe forms: `uniq`, `tac`, `nl`, `column`, `paste`, `fold`, `expand`, `which` and `type`; `sed` only with `-n`, `-E`, `-r`, `-e` and a script of addresses and `p`, `d`, `q`, `=`, `s`, `y`; `awk` only with an inline program that holds no `system(`, `getline`, redirect or pipe. The sed and awk fixtures name the rule that refuses them first.

C, the autopilot stage and the engine:

- A glob or brace target (`.gi[t]/config`) is refused during an autopilot stage; a stage spells the path out.
- MCP and harness config files are protected paths, and the engine copies `.mcp.json` to `.ultrapowers/autopilot/mcp.json` before a ticket's first stage and passes that copy, never the working file.
- A `.git` file (a nested worktree's) is protected like the `.git/` folder, so a stage cannot point it at a config of its own.
- The engine's git neutralises the config keys that run a program: `core.fsmonitor`, `core.sshCommand`, `diff.external`, `core.gitProxy` and `core.pager`.
- The engine runs the ticket's hooks from an engine-owned snapshot taken when the ticket starts (`core.hooksPath` pinned to `.ultrapowers/autopilot/hooks/`), so the project's own hooks, the secret scan among them, still run and a hook a stage writes later does not. The snapshot copies what git would run (`core.hooksPath` of the project, else `.git/hooks`), not a `.githooks` folder git is not set to use.
- The engine's git has no temp-folder fallback: outside a workspace it throws with the folder it looked in.
- Team memory and nested `AGENTS.md` files stay writable in a stage: the team-memory skill runs inside stages and its committed edits show in the pull request diff. Only the root instruction files are protected, and `.cursor/rules/` through the harness-config rule.
- MCP tracker and mail writes are refused in every run, not only in an autopilot stage: mail and chat servers join the tracker list, and send, reply and chat join the write verbs.
- GitLab token variables (`GITLAB_ACCESS_TOKEN`, `CI_JOB_TOKEN`, `GITLAB_PRIVATE_TOKEN`, `GL_TOKEN`) join the stage scrub.

D, scripts and templates:

- The hunt preflight resolves its audit tools from absolute PATH entries outside the project and runs them without a shell, so a planted `npm.cmd` in an audited repository no longer runs on Windows.
- The scaffolded denies cover git reads of secrets (`git diff --no-index`, `--contents`, `rev:.env`) and the credential files in the home directory, for Claude Code, Qwen Code, Cursor CLI and OpenCode, each in its own syntax.
- The env denies name the files (`.env.development`, `.env.test`, `.env.staging`, `.env.secret` beside the existing ones) instead of a wildcard, so `.env.example` stays readable; the CLAUDE.md template paragraph names them.
- In the autopilot form only collaborators' comments reach the stages (write, maintain or admin access, or the approvers list); the manual form keeps every comment as quoted material, and a test pins the title between the ticket markers.
- The database recipe of `qa-lane-4-db` names the `PUBLIC` grants that PostgreSQL 14 and older keep, with the owner-decision `REVOKE`s commented out.

E, the egress host:

- With `qa.hosts.allowed` set, the host of a curl or wget operand is read by the URL parser (a trailing dot and any case match the listed host), and an operand with an `@`, `#` or `;` before its first path slash is refused, since curl and the parser read it differently. Config files and redirects cannot leave a listed host: curl `-K`/`--config`, `-L`/`--location` and `--location-trusted`, and wget `-i`/`--input-file`, `-B`/`--base` and `--config` are refused.

Verified and accepted: the audit's remaining findings were each reproduced. Three are accepted with a reason: the Odoo URL is the protected configuration and is reached over https; the pre-commit hook's fail-open without Docker is deliberate and warned; the MCP servers are pinned by exact version. One is rejected: the CI action pins match their tags. Two are deferred to 2.1.1: the Antigravity and Kimi hook-command working directory needs a live check on those harnesses, and a provenance rule for the team-memory skill.

**Upstream 7.0.0**

What version 7.0.0 of the project this plugin was forked from changed, and this plugin did not have yet:

- The `brainstorming` skill is rebuilt on the upstream design. It starts from what is already known (a quick, clear task is done and reported, the request being the approval); the first message offers to skip the questions and asks one open question; it offers to look at prior art, the project or the web; it plays each understood part back with guesses marked; it confirms the size once the work is understood; it asks which how-it-gets-made choices (framework, language, libraries, tools) the partner owns, even when the questions are skipped; and it offers the visual companion whenever seeing helps. The checklist and the flow graph are gone.
- What was kept: the spec routing to `specs/<id>/Spec.md` when `.agents/ultrapowers.json` and a ticket id exist, now worded as under the project root and not inside `.agents/` (the old wording sent a simulated run into `.agents/specs/`); the Autopilot form (no question, `## Assumption ledger`, `## Repositories in scope`); the three paths announced in the first message and the one-way ratchet; the hard gate per path; the Red Flags rows, with upstream's new rows added; the visual companion's paths, logo and `--open`; and the handoff to `ultrapowers:writing-plans`. A ticket always produces the spec: in `brainstorm-task`, with a ticket id and the scaffold, or in the Autopilot form, the quick size does not apply and no skip offer is made. `brainstorm-task` keeps its rhythm: one grounded question per message, multiple choice, recommendation first.
- The builder check replaces the spec-document reviewer: after the inline self-review, a fresh subagent reads the written design as the person who has to build it (`skills/brainstorming/builder-check-prompt.md`). In the Autopilot form what only the partner could answer becomes low-confidence ledger rows, never questions. `spec-document-reviewer-prompt.md`, which the skill never dispatched, is removed. The design and the merge decisions are in `docs/ultrapowers/specs/2026-10-11-brainstorming-v7-port-design.md`, the before and after pressure runs in `tests/skills/brainstorming-pressure-results.md`; the partner in those runs is simulated, and a live session is still owed.
- Antigravity native manifest: `.antigravity-plugin/plugin.json`, kept in step by `scripts/bump-version.sh` (now twelve files) and checked by `tests/antigravity/test-plugin-manifest.sh`. `agy plugin install` of it has not been run here.
- Antigravity docs correction: the README and `docs/porting-to-a-new-harness.md` no longer say that Antigravity runs the session-start hook. As measured upstream on agy 1.3.1 (not re-measured here), agy has no session-start event; it lists each installed skill's description, and the description of `using-ultrapowers` prompts the model to load it. The repository-root `hooks.json` registers only the guardrail.
- Already present since v1.0.0, named here for completeness: eight upstream 7.0.0 fixes were taken when this fork was cut: `run-hook.cmd`'s bash discovery (upstream #2393), the hooks with a broken `PATH` (upstream #2349), the companion server's literal content insert (upstream #2364), the systematic-debugging example that no longer prints a secret (upstream #2380), `task-done` recording a silently passing test command (upstream #2388), the requesting-code-review `cut` example (upstream #2361), `sdd-workspace` leaving a repository's own `.gitignore` alone (upstream #2399), and the Hermes skill descriptions (upstream #2284).

**What was verified, and how**

| | Verified |
|---|---|
| Offline suites | The suites `AGENTS.md` lists, including the new `tests/vulnerability-hunt/`, the `hunt` profile fixtures, the entry-point parity suite and the extended assembler and `post-review.mjs` tests |
| Pressure scenarios | Subagents under pressure for the hunt's door and for `task-review` Step 3b (S28 to S34: the hunt in task-review, a repository with nothing to audit, the standalone `--post` with and without an open pull request, a hostile code comment, and the envelope gate when the marker or the preflight is refused); the record is in `tests/task-lifecycle/pressure-results.md` |
| Live, Claude Code, 2026-10-11 | The hunt through both doors, headless: the standalone audit of this repository (verdict FAIL; two High findings against the guardrail analyzer left unverified when the verification pass was cut short, one Medium confirmed; dependencies, OSINT and secrets lanes incomplete) and the ticket door on the review fixture (verdict FAIL; the token and curl-pipe-shell findings confirmed; the planted CVE missed because the dependencies lane could not audit a nested manifest). The fixes those runs produced are in this release: the envelope gate, the nested-manifest audit with `--prefix`, the lane prompts' allowed forms, and the gatekeeper waiting for its hunters |
| Not yet run live | The OpenCode V2 guard on a live V2 host, and `--post` of a security report |

**Known residuals**

- During a hunt the hook still allows a command that computes a hash of a literal value; the hunt's contract forbids it, and a hook rule follows in 2.1.1. The Cursor event shape (`workspace_roots` instead of `cwd`) was taken from the session-start hook, not captured from a live Cursor guardrail call.

## v2.0.1 (2026-10-11)

Two lane 4 and task-review fixes found in the 2.0.0 review, each posted and reviewed through `task-review --post` on this repository, which was its first live run on GitHub, and three fixes from a diagnosis of the 2.0.0 session with `diagnosing-ultrapowers`.

- Guardrail lane 4: an array slice with integer bounds such as `a[2:3]` passes as a read; a bound that is a name stays refused, because psql would substitute a variable of that name; `psql -v`, `--set` and `--variable` are refused; psql interpolation is refused in its three spellings, `:name`, `:'name'` and `:"name"` (#35).
- `task-review --post`: screenshots render on a private repository. GitHub comments link the file on the documents branch through the blob URL with `?raw=true`, which GitHub serves to a logged-in viewer with access; GitLab comments upload the file to the project through its uploads API and embed what it returns, with the raw link as the fallback when an upload fails (#34).
- `executing-plans`: the task's test command runs once, inside `task-done`. The completion contract listed a passed final run as a precondition of the ledger line while `task-done` is that run, so an executor ran a ten-minute suite set twice per task (#39).
- `executing-plans`: an executor stops every background task it started before its hand-back, reads the output of a call the harness moved to the background, and names in its final message any task it could not stop; a shell left waiting on stdin kept an agent shown as running for hours (#40).
- `tests/qa-gatekeeper/run-tests.sh`: stopping the runner stops its suites. Each suite runs as a tracked child in its own process group, a trap ends that group on INT, TERM or HUP, and a watchdog stops the runner when its parent shell is gone, which is what a Windows harness stop looks like from inside (`taskkill /T` reaches the wrapper shell only, because Cygwin orphans every exec'd process). `ULTRAPOWERS_QA_SUITES` replaces the suite list for a short run (#41).

## v2.0.0 (2026-10-10)

Every open issue triaged against 1.3.1 and fixed in one release, a stricter guardrail, and `/ultrapowers:task-review`.

This is a major version because three things a 1.x project relies on change under it: the knowledge-base folder is renamed, an Odoo source that autopilot runs needs human approvers, and the guardrail refuses commands it allowed before (environment reads, SQL through anything but a literal `psql -c` as the read-only role, and a tool event it cannot read). The twenty-two issues open on 2026-10-10 were reproduced one by one on 1.3.1 and traced to their root causes; the design is `docs/ultrapowers/specs/2026-10-10-open-issues-fixes-design.md` and five plans beside it. Three of them were security gaps in the guardrail (#30, #31 and #8): an autopilot stage could write to the tracker through the ticket source's MCP server, read key material through an 8.3 short name on Windows, and print any credential with `printenv`. All three are closed, with fixtures that fail on 1.3.1.

**Heads up:**

- The knowledge-base folder is `brandbook/`, no longer `brand-book/`. Init never moves a folder: upgrade mode reports the old name and the `git mv brand-book brandbook` to run.
- An Odoo ticket source that autopilot runs now needs `autopilot.approvers` with at least one human login, and the technical user cannot be its own approver (#32). `init autopilot` asks; an existing config without it stops the run with `bad-autopilot`.
- Guardrail denies are stricter during a run: an event whose tool or input cannot be read is refused (#2), in-page code tools of the browser MCP servers are refused (#11), and SQL through `psql` is an allow-list of reads under the configured read-only role (#3). `printenv` reads only the configured role variables during a QA run and no credential-shaped name during an autopilot stage, where `echo $GH_TOKEN` is refused too (#8).

### Who it is for

Anyone running the QA gate or autopilot on 1.3.1, Windows users in particular, and teams that want one reviewed verdict on a ticket's work before merge.

### What is new

- **`/ultrapowers:task-review <ID> [repos...] [--post] [--draft-pr]`** (closes #29) reviews a ticket's finished work end to end. For each repository the ticket touched, a reviewer on the most capable model reads the whole range against that repository's own base, every changed file in full and its callers, judges the tests against test-driven development and traces every failing test and every Critical or Important finding to its root cause. The QA gate runs after the reviewers. One verdict (`PASS`, `PASS-WITH-ISSUES`, `FAIL` or `BLOCKED`) and the findings land in `reviews/<ID>/TASK-REVIEW.md`. With `--post` the full reports, screenshots included, go to the ticket and to the ticket's open pull or merge request, found by branch name, in numbered parts when long; `--draft-pr` pushes the ticket branch through the guarded push and opens a draft when none is open; on Odoo the screenshots are attached to the chatter message. The skill never edits code and never merges, and a link in a report that leaves `reviews/<ID>/artifacts/` is never read or posted.
- **`/ultrapowers:init check`** audits a scaffold and writes nothing (#28). Init also compares the keys the plugin needs in settings files it did not write, proposes ticket servers additively (your other MCP servers and pinned arguments stay), warns on a duplicate ticket server, lets a source name its server, proposes the projects map from the clones' remotes, shows which transport is in use, marks optional secrets as optional, lets an Odoo source opt out of autopilot, and discloses the allow list it writes.
- **The QA report says whether the guardrail was active** (`Guardrail:` line from a probe, #7), every deny names the run marker and who can end the run (#14), and `run-hook.cmd` fails closed without bash (#12).

### What is fixed

- **Guardrail, lane 4.** The shell analyzer walks every construct that can run `psql` (`xargs`, `find -exec`, `eval`, `sudo -u`, `su -c`, `kubectl exec`, a brace group, `sh -lc`), refuses a shell fed on stdin and a program built from a variable, refuses a bare `psql` word it did not inspect, tracks the superuser through `export PGUSER`, `docker exec -u`, `gosu`, `sudo -upostgres` and the last `user=` of a connection string, refuses `PSQLRC`, `PGSERVICE` and `PGOPTIONS`, refuses the other client tools (`dropdb`, `pg_restore`, `pgcli`, ...), and closes SQL holes (an `UPDATE` alias without `AS`, a quoted function name, `pg_stat_reset` and friends) (#3). It remains a pattern guard, not a sandbox: the read-only role's grants are the guarantee behind it.
- **Guardrail.** One path resolver behind every gate: 8.3 short names, Git Bash and Windows spellings and symlinks compare as the same place, and a project under a folder like `.claude/worktrees` is no longer protected as a whole (#9, #13, #31). Init's `tickets-<prefix>` servers count as trackers (#30). Compose rules match the subcommand, so `docker compose run --rm` passes and `down` is refused (#1). Every URL of a tool call is checked (#11).
- **QA lanes.** A suite runs as the leader of its own process group and `run-suite.sh --stop` ends the whole tree; the contract stops live suites before the report (#4). The suppress list keeps `#` inside a test name and accepts a pasted `NEW-FAILING` prefix (#6). The preflight warns on dropped entries and reads placeholders only on enum fields (#10). A crashed suite's `.failed` keeps the configured template, and `skills/qa-lane-6-suites/troubleshooting.md` says what to do with `INCOMPLETE` (#5).
- **Docs and assets.** The QA skill says where the guardrail applies (#7), the team-memory store path is fixed (#15) and the Cursor note is correct (#17); the brainstorm companion and the Codex icon use a small mark, `assets/ultrapowers-mark.svg`, and the README keeps the full logo (#18).

### What was verified, and how

| | Verified |
|---|---|
| Offline suites, every commit | Every suite `AGENTS.md` lists, on Windows, with the two documented OpenCode symlink exceptions; the guardrail fixture suites grew from 289 to 362 assertions (QA) and from 154 to 191 (autopilot) |
| Independent reproduction | The orchestrator's own probe of the three guardrail bypasses against the 1.3.1 hook and the new one: tracker writes, `printenv` of a credential and unreadable events pass on 1.3.1 and are refused now; the 8.3 alias read found during that review is fixed in the same release |
| Pressure scenarios | Haiku subagents under time and authority pressure for the QA contract (suites at close, an incomplete suite), the guardrail wording, and task-review's six scenarios; rows where the baseline did not fail are recorded as such in `tests/qa-gatekeeper/pressure/pressure-results.md` and `tests/task-lifecycle/pressure-results.md` |
| Not yet run live | `task-review --post` on GitHub, GitLab and Odoo, and `--draft-pr`; real PreToolUse payloads from each installed harness |

## v1.3.1 (2026-10-05)

A resumed QA stage's report reaches the ticket.

In 1.3.0 the engine posted the QA report on the ticket only while the ticket carried none. A QA stage begun again after a stop (PRECONDITION-FAILED, FAIL or INCOMPLETE) ended with a new verdict that stayed in the repository: the task never saw it, and a pass after a stop reached the pull requests but not the ticket. The ticket comment is now keyed by the report's text, so every new report posts once and a `next` that only repeats a stop posts nothing. Found in the live round on the Owner's VM, where the headless QA stage ran end to end for the first time; `tests/autopilot/acceptance-2026-10.md` step 6 has the record.

**Heads up:** a ticket whose 1.3.0 state already carries a posted report posts it once more on its next `next`, because the old state has no report key; nothing else changes.

### What was verified, and how

| | Verified |
|---|---|
| Live, the Owner's VM | the headless QA stage on the ticket branch's stack, its verdict committed and, after the fix, its report as a log note on the task |
| Offline suites | `tests/autopilot/run-tests.sh` with the new case, and every suite `AGENTS.md` lists |

## v1.3.0 (2026-10-05)

Odoo as an autopilot tracker: the tag on the task starts the run, the packet and the QA report are log notes, the pull requests open on your forge.

Teams that track work in Odoo tasks rather than GitHub or GitLab issues can now run autopilot from the task. The engine talks to the Odoo server's own JSON-RPC API with one key you issue; the approval is a tag an internal user adds; the review packet and the QA report are internal log notes on the task; and the pull requests open on whichever forge each repository's `origin` remote names. Everything that worked for GitHub and GitLab issues in 1.2.0 keeps working unchanged.

**Heads up:** an Odoo source that autopilot will run needs the technical user's `login` (and `db` when the server hosts several databases): `/ultrapowers:init tickets` asks for them, and `init autopilot` creates the six `Ultrapowers …` tags on the project after your yes. The key lives in `ODOO_API_KEY`, in your environment or in `.agents/mcp-secrets.env` (gitignored), the one Odoo variable for the engine and its stages alike. Upgrade mode finds no changed template; answer `--apply none`.

### Who it is for

Teams whose tickets live in Odoo's Project app, and anyone whose code repositories live on a different forge than their tickets.

### What is new

- **Odoo as a tracker.** `/ultrapowers:autopilot ODOO-1203`, or the task's URL, runs the ticket through the same stages and gates. The engine reads the task, its tags and its chatter over JSON-RPC, posts the packet as an internal note with clickable links, and reads the approve tag from the chatter's tracking values; when the server keeps those for administrators only (Odoo 19 does), the tag is attributed to the task's last writer and the log says so. Only internal users in the Project User or Project Manager group count; a portal user's tag is refused.
- **The forge is the repository's remote.** Each repository's pull request opens on the forge its `origin` points to, GitHub through `gh` or GitLab through `glab`, whatever the ticket source is. A repository without a GitHub or GitLab remote stops the run with `no-forge`.
- **The rich ticket read, for every provider.** The brief's source file now carries the ticket's messages, its attachments (downloaded up to `tickets.attachmentMaxBytes`, default 10 MB, or listed at their address when they are larger or kept outside the tracker) and every link they hold; brainstorm-task reads them all before the first question, through the harness's web reader or the Firecrawl MCP server, and lists them in the grounding manifest.
- **The QA report on the ticket and the pull requests.** After the pull requests open, the full QA report is posted on the ticket and as a comment on every pull request, headed by the packet id, the approver and the stage log head. A QA stop posts the report on the ticket too, so the human reads why the run stopped.
- **The guardrail knows Odoo.** During a stage the MCP write verbs of an Odoo server (`call_model_method`, `execute_kw`, `update_record`, `post_message`) and any `curl`, `wget` or `Invoke-WebRequest` to a configured ticket source's host are denied; reads pass.
- **A headless Claude Code stage loads the engine's own plugin checkout** (`--plugin-dir`), so its skills and its guardrail are the engine's version on any host.
- **Init.** Ticket sources ask for the Odoo login and database; autopilot proposes the readable tag names for an Odoo-only project and creates the tags; the secrets example names `ODOO_API_KEY` once.

### What was verified, and how

| | Verified |
|---|---|
| Live, the Owner's workspace | Odoo 19 as the tracker in a nested workspace of eleven repositories with self-hosted GitLab remotes: init creating the tags and the labels; the session door from a task URL through scaffold, spec, plan and the packet as a log note, the approval by tag, execute in two repositories' worktrees, and the QA stage's PRECONDITION-FAILED stop with the report on the task; the watcher on the Owner's VM from the Ready tag through the headless scaffold, spec and plan stages to the packet, and its self-approval rule refusing the watcher's own account (`tests/autopilot/acceptance-2026-10.md`) |
| Offline suites, every commit | The engine against a fake Odoo server (tags, tracking and last-writer attribution, permissions, notes, the watcher cycle, the URL id, the secrets file), the tracker and the forge rule, the fetch step's messages, attachments and links, init's Odoo questions and tags, the guardrail's Odoo cases, the pressure scenarios P1 to P3 |
| Not yet run live | Headless execute and QA stages, the changes loop, pull requests opened by the engine on GitLab, full mode |

### Found during the live run and the final review, fixed in this release

Odoo 19 renames the user groups field and restricts the tracking values to administrators; its cloud storage module keeps attachments outside the database; `message_post` escapes a plain body, and a markdown report posted as text appeared raw; the packet showed the documents base for code repositories; a QA stop left the ticket without the report; a stage's report path was posted unchecked; a headless stage ran with the host's plugins. The final review added: in last-writer mode the engine's own label writes now come before the packet, so a pre-placed approve tag can never pass as the engine's own approval; a source without `db` asks the server's database list; a renamed tag or a user's tag with a comma no longer hides the approve event; a GitHub or GitLab ticket keeps its own forge when a remote's host is an ssh alias; a stray `%` in a link, a `$&` in a report and an attachment id of another task are handled. Each has a test.

### Not in this release

- A second gate on the pull request with the engine merging on your label, and the QA fix loop.
- Approval from Odoo portal users or by message; a CI door; per-ticket lanes.
- A switch to skip the in-run QA gate for a team whose QA runs after the merge: today the QA stage runs whenever `qa.urls` is set.

## v1.2.1 (2026-10-04)

A patch release with no change to the plugin's behaviour.

- **The version audit skips the ticket folders.** `scripts/bump-version.sh --audit` no longer scans `tasks/`, `specs/`, `plans/` and `reviews/`, which hold documents written for tickets and may quote a plugin version. The Linux CI job on `main` failed on that audit right after the 1.2.0 release merge, because the GH-16 spec quotes the version.
- **README.** The first-ticket step says "this release" instead of a version number.

**Heads up:** `/ultrapowers:init` offers upgrade mode once a project's marker says 1.2.0. No template changed in this release, so answer `--apply none`.

## v1.2.0 (2026-10-04)

Autopilot: hand the agent a ticket, approve its plan on the ticket, review its pull request.

The request we hear most from engineering teams is the same one: "give the agent a task and wait for the pull request, without lowering the bar". Ultrapowers already carried the bar: a short brief, a spec grounded in the code, a plan, test-driven implementation, a review of every task, a QA specialist, a clean finish. This release runs that same workflow from a ticket, with the human decisions on the ticket, and leaves every form of working in place.

**Heads up:** existing projects keep working unchanged; without an `autopilot` block every skill behaves as before. Set it up with `/ultrapowers:init autopilot` (join and upgrade offer it once when a GitHub or GitLab source exists). Upgrade finds two changed templates: `.claude/settings.json`, which now allows `Skill(ultrapowers:autopilot)`, and, for projects that chose Gemini CLI, the new `.gemini/hooks/ultrapowers-guardrail.mjs`; apply them to get `.ultrapowers-new` proposals beside your files, or answer `--apply none`.

### Who it is for

Professional development teams and the enterprises they work in: teams that already review specs and pull requests and want the agent to do the work between those two decisions, on their own machines, with tokens they issue.

### Three ways to run the same workflow

Pick the rung that fits, and move up when the record says so. The artifacts are the same at every rung: the brief, the spec with its assumption ledger, the plan, the stage log, the pull request.

1. **Manual.** The skills by hand, as before. Nothing changes without an `autopilot` block.
2. **One command.** `/ultrapowers:autopilot <ticket>` in your session takes a GitHub or GitLab issue through the brief, the spec and the plan, posts a review packet on the ticket, and stops. You add the `up:approve` label. The run implements, reviews, runs QA when the project has a QA block, and opens the pull request. Verified live on Claude Code with GitHub: issue 16 of this repository became pull request 20 (`tests/autopilot/acceptance-2026-10.md`).
3. **A watcher** *(beta)*. `autopilot.mjs watch`, a service on the machine that hosts your coding agent, picks up every ticket a member with write access labelled `up:ready` and runs it the same way, so you only touch the tracker. Beta until a public run from label to pull request is recorded.

`gated` is the default and the mode we recommend: two gates, the packet and the pull request. `full` *(beta)* posts the packet for the record and stops at the pull request only.

### How you stay in control

- **One packet, one label.** The packet is under 25 lines: the brief, the spec with its assumption ledger (every question the agent answered for itself, lowest confidence first), the plan, the repositories in scope, all linked at one commit. Your approval is a label on the ticket, and the engine checks it on the tracker's own timeline: who added it, with write access (on GitLab, Maintainer or above) and in `approvers` when you set that list, after the packet, and on the same commits. A new commit voids it. The check runs again before implementation starts and before the pull request opens.
- **Your own account approves your own tickets** in a session. A watcher takes an approval from the account it runs as only when you set `watchSelfApproval` and give its stages their own read-only token.
- **Changes and holds.** `up:changes` with a comment sends the run back to the spec and the plan; `up:hold` pauses it; a kill switch file pauses the watcher.
- **During a stage, a guardrail hook denies the agent push, merge and tracker writes.** The engine pushes and opens pull requests between stages, and a human merges. The hook matches patterns; it is not a sandbox. It also denies edits to the project's configuration, CI, commit hooks, settings, the ticket's state files and its own run marker, and a stage that loses its marker is blocked for review.
- **What a watcher stage holds.** With read-only stage tokens (`ULTRAPOWERS_STAGE_GH_TOKEN`, `ULTRAPOWERS_STAGE_GITLAB_TOKEN`), the engine's tokens and the ssh agent are removed from the stage's environment; on Claude Code, only the project's MCP servers load. A watcher refuses to start without stage tokens unless the project says `watch.sharedCredentials: true` in writing. `docs/autopilot-watcher.md` has the checklist a team runs before the first ticket.
- **One record per ticket.** `tasks/<ID>/autopilot.json` and a hash-chained `tasks/<ID>/stage-log.jsonl` on the ticket branch, read by `/ultrapowers:task` first; the pull request cites the packet, the approver and the log head.
- **Runs on your machine with tokens you issue; the plugin's own code sends nothing anywhere.** The agent talks to its model provider as it always did.

### Where it runs

The engine, the skill and the tracker write-back through `gh` and `glab` are the same on every harness. The guardrail reaches each harness its own way: plugin hooks on Claude Code, Codex, GitHub Copilot CLI, Cursor, Muse, Qwen Code, Factory Droid, Kimi Code and Antigravity; in-process hooks in the OpenCode plugin, the Pi extension and the Hermes plugin; a project `BeforeTool` hook that init writes for Gemini CLI. Devin's plugin hooks are documented as fail-open, so the watcher refuses `devin` and a Devin session has no reliable envelope. Codex asks you to trust the plugin's hooks once; Hermes loads the plugin only when it is in `plugins.enabled`. The README's table "Where the envelope runs" names each harness's hook, its one-time step and its limits; Claude Code, Gemini CLI, Qwen Code, Droid and Kimi Code let a hook that crashes or times out through, so the deny path, exit 2, is what the tests exercise.

### What was verified, and how

| | Verified |
|---|---|
| Live, on this repository | The session door on Claude Code with GitHub: one repository, gated mode, inline execution, no QA stage; the early-label negative check; pressure scenario A8 (the agent does not add the approve label for you) |
| Offline suites, every commit | The engine against a fake tracker and a fake harness (54 scenarios: gates, approvals, drift, loops, locks, the watcher cycle, stage credentials); the guardrail's autopilot profile (120 cases); the bridge and the node entry; the OpenCode plugin, the Pi extension and the Hermes plugin hooks; the adapters' command lines; init's autopilot mode |
| Against the installed CLIs | `tests/autopilot/test-adapters.sh` ran the Claude Code and Codex adapters live on the release machine; OpenCode and Pi accepted their flags and answered a provider or login error; the rest were not installed |
| Vendor documentation only | The hook contracts and crash behaviour of Codex, Copilot CLI, Cursor, Gemini CLI, Qwen Code, Droid, Kimi Code, Antigravity, Hermes and Devin |
| Not yet run | The watcher on any harness, GitLab, a nested workspace, full mode, the changes loop, the QA stage inside a run, subagent execution inside a run |

### The engineering detail

- **One engine, two doors.** The command and the watcher share one state file and one log per ticket; one fresh headless harness call per agent stage in the watcher (`skills/autopilot/scripts/harnesses.mjs`, one adapter per harness); resume re-reads files, never chat.
- **The documents repository** where init ran is the ticket's home; code repositories get one branch each, in a worktree, only those the approved plan names, and one pull request each. Scope: a hint in the brief, binding in the spec, narrowable by the plan, frozen at approval, enforced at push. A base branch ahead of origin is named in the packet and the pull request.
- **The gate's record is not the gate.** Execute and the pull request require the recorded approval and check it again; the gate commands and other stages are refused while a stage is open; a spec or plan changed after approval blocks; full mode records its approval at the packet; the changes label is taken when its stage begins; a run stops when a stage repeats; a QA verdict of FAIL, PRECONDITION-FAILED or INCOMPLETE stops the run and a missing one blocks; a failed packet or pull request blocks its stage and releases the lock. A mode label and the watcher's start label count only from a member with write access. The watch door's self check fails closed.
- **Autopilot form of the skills.** brainstorming, brainstorm-task, writing-plans, executing-plans and subagent-driven-development ask nothing when the run marker exists: each question becomes an assumption-ledger row, the plan copies or narrows the spec's repositories, and the finish step returns to the engine. Pressure scenarios A1 to A8, B1 to B4 and C1 to C2 are recorded under `tests/autopilot/`.
- **Init.** `/ultrapowers:init autopilot` asks the mode, base branch, approvers, execution, harness, the two watcher questions (own-account approval, shared credentials) and the label names, shows a dry run, and creates the six labels on the source's default project after your yes.
- **Documentation.** The Basic Workflow has step 10, the project configuration documents the `autopilot` block and the harness table, Philosophy gains "Autonomous between your gates", and the last section, Pipelines, draws the manual workflow, gated and full autopilot, and the watcher. The spec's decisions D11 to D16 record what changed during the live run and the executive review (`docs/executive/2026-10-04-v1-2-0-autopilot-release-notes-and-readme-review.md`).

### Not in this release

- A second gate on the pull request with the engine merging on your label, the QA report posted on the ticket, and the QA fix loop: the next spec, agreed with the Owner.
- Odoo write-back (Odoo tickets are still read as in 1.1.0), a CI door, per-ticket lanes, and a public watcher run. The README's roadmap line names them.

## v1.1.0 (2026-10-02)

Tickets come from where the team already tracks them.

**Heads up:** existing projects keep working unchanged; every id without a configured prefix is still a local ticket. To add ticket sources to a project that already has a scaffold, run `/ultrapowers:init tickets` (join and upgrade also offer it once). Upgrade finds no changed template in this release, so `--apply none` is the answer to its prompt.

### Task Lifecycle

- **Ticket sources.** `/ultrapowers:init` asks where tickets live, and `/ultrapowers:init tickets` sets it later: GitHub Issues, GitLab Issues or Odoo tasks, several at once, each with its own id prefix. `/ultrapowers:new-task GH-web-7`, `GL-billing-api-42` or `ODOO-12-1203` then fills the brief from the ticket and keeps a quoted copy in `tasks/<ID>/source.md`. Ids read as `<PREFIX>-<project>-<number>`; in a workspace with nested clones, a project that matches a clone becomes a `Repository:` line that brainstorm-task proposes first. Read only: nothing is written back to the tracker. Any id without a configured prefix is a local ticket, exactly as before.
- **CLI first, MCP otherwise.** `gh` and `glab` are used when they are installed and signed in (a `GH_TOKEN` or `GITLAB_TOKEN` is enough, so headless runners work); otherwise the agent uses the source's MCP server: GitHub's official server with a read-only header, GitLab's official server with browser sign-in, and the team's own Odoo server. The plugin itself still opens no network connection.
- **Ticket text is data.** A fetched ticket's instructions are never followed, a failed fetch creates nothing, a credential in a ticket stops the scaffold before anything is committed, and an Odoo task filed under another project is refused.

### Documentation

- **Project configuration in the README.** One example of `.agents/ultrapowers.json` and two tables explain every key, what you can set, and a ticket source's fields.
- **The vision, briefly.** The Basic Workflow says who decides what and names the roadmap (a tracker label starting the same workflow headless, with your approvals on the pull request; not shipped yet). Philosophy says who ultrapowers helps and how, and invites ideas in Discussions.

### Rules

- **Rule 5 reads as a principle.** Nothing reports on users, their projects or their usage; the plugin opens no connection itself; a skill reaches the network only through a tool the user installed and signed in, to a host named in `.agents/ultrapowers.json`.

### Fixes found in review

- A self-hosted GitLab source fetches from its own host, not gitlab.com; a GitHub pull-request number is refused as a ticket; no variant of the `source.md` markers can close the quote early; an id that names a path is refused; an Odoo header is limited to the forms every harness renders; upgrade proposals keep the ticket servers.

## v1.0.1 (2026-10-02)

Brainstorming now reads all the code a design needs before it asks its first question, and the README's release badge updates itself.

### Brainstorm Task

- **Grounding reads all the context the design needs.** `brainstorm-task` stopped at eight files per repository, so a change that touched more files than that reached brainstorming with some of them unread, and writing-plans found them later. `ground.sh` now lists every matching file, ranked as before, and the agent reads every file the design depends on, strongest match first, following what those files lead to until it can say where the change lands, what it touches and what already exists. There is no cap and no setting for one. The grounding manifest still lists every file read.

### Documentation

- **The README release badge updates itself.** It reads the latest GitHub release when the README is viewed, so a release no longer needs a hand-edited banner.

### Fixes

- **The version audit matches whole version numbers.** Bumping to 1.0.1 no longer flags a comment that mentions version 1.0.11.

## v1.0.0 (2026-10-01)

The first release of Ultrapowers, a fork of Jesse Vincent's MIT-licensed skills library cut from its version 6.4.2. It keeps the whole methodology (brainstorming, plans, subagent-driven and inline execution, test-driven development, systematic debugging, code review, worktrees) and adds what a working developer repeats on every project: one-command project setup for every coding agent, a ticket-driven lifecycle with brainstorming grounded in the code, team memory kept in git, and a seven-lane QA gatekeeper. It also carries the upstream fixes made after 6.4.2 and a round of Windows and hook hardening.

**Heads up:** every name is `ultrapowers`. Install with `/plugin marketplace add raoofaltaher/ultrapowers` and `/plugin install ultrapowers@ultrapowers`; skills are invoked as `ultrapowers:<skill>`; the runtime folder is `.ultrapowers/`; environment variables are `ULTRAPOWERS_*`. Installing the plugin writes nothing into your project: run `/ultrapowers:init`, which the session start offers in any git repository without an Ultrapowers setup.

**Beta:** the QA gatekeeper (the `qa-specialist` skill and agent, its eight lane skills and the `qa-guardrail` hook) is experimental in 1.0.0. Its contract, guardrail rules and report format may change in a minor release. Known gaps are tracked in issues #1 to #14.

### New Skills

- **`init`: one command sets up a project for every coding agent.** Scaffold, join, upgrade and repair modes. It writes ten knowledge base folders with READMEs, one `AGENTS.md` that `CLAUDE.md` and `GEMINI.md` import and the other agents read directly, MCP configuration rendered for nine harnesses from one `.mcp.json`, Claude Code settings and output style, the team-memory store, and repo hygiene (a gitleaks pre-commit hook and managed `.gitignore` and `.gitattributes` blocks). It shows a dry run and writes only after an explicit yes, never overwrites a file, and offers template updates as `<file>.ultrapowers-new` proposals. A one-line offer at session start (`ULTRAPOWERS_NUDGE=off` silences it) tells the agent when a project has no setup, an older one, or an unreadable one.
- **`new-task`: open a ticket in one step.** It creates `tasks/<ID>/`, `specs/<ID>/`, `plans/<ID>/` and `reviews/<ID>/`, writes a brief of two short paragraphs at most (Context, Definition of Ready, Definition of Done, Related Documentation), commits it, and hands off to brainstorm-task. It refuses a ticket that already exists.
- **`brainstorm-task`: brainstorming grounded in the code.** It reads the brief, confirms which repositories to read, reads at most eight relevant files per repository, prints a grounding manifest, and only then starts the brainstorming dialogue, so the plan does not meet surprises later. The spec lands at `specs/<ID>/Spec.md`; brainstorming and writing-plans route ticket documents into the knowledge base.
- **`task`: where a ticket stands.** A read-only report of the brief, spec, plan, reviews and branches, with the next step.
- **`team-memory`: shared memory in git.** Remember, recall, prune and lint verified, durable, expensive-to-rediscover facts in `.agents/memory/` (gotchas, decisions, subsystems) behind a size-budgeted index, with a `Memory-Ref` commit trailer and an optional pre-commit lint. Hooks remind the agent to save learnings on each prompt and right after compaction on Claude Code and Muse, at session start on Cursor, and through the OpenCode, Pi and Hermes injectors.
- **`qa-specialist` (beta): a seven-lane QA gate.** It tests the running app in a real browser for each configured role and language across seven lanes (UI, logs, API, database, observability, test suites, content) and writes `reviews/<ID>/QA-REPORT.md` with one verdict: PASS, PASS-WITH-ISSUES, FAIL, INCOMPLETE or PRECONDITION-FAILED. It runs forked as the `qa-specialist` agent where the harness supports it and inline elsewhere, and resumes an interrupted run from its run-state. Credentials come from environment variables named in the project config. It never starts or stops your stack and never commits.

### Hooks

- **`qa-guardrail` (beta): a PreToolUse guardrail for QA runs.** It is inert unless `.ultrapowers/qa-active` exists, and that check uses shell builtins only. During a run it limits shell writes to `reviews/<ID>/` and `.ultrapowers/`, allows only read-only git, and blocks stack teardown, destructive commands, forbidden hosts, database writes and key material. A call it cannot inspect is denied. It is registered for Claude Code, Cursor and Muse.
- **Windows: hook exit codes reach the harness.** `run-hook.cmd` expanded `%ERRORLEVEL%` inside a parenthesised block when cmd parsed it, before bash ran, so every hook reported success and a guardrail deny did not block.
- **Windows: `run-hook.cmd` finds a per-user Git install and never runs a WSL launcher or a planted `bash` or `where`.** It checks `%LOCALAPPDATA%\Programs\Git`, calls `where.exe` by full path with `$PATH:bash`, and skips the System32, Sysnative and WindowsApps launchers. (upstream #2393)
- **The hooks work with a broken `PATH`.** session-start, the team-memory hooks and the Unix half of the wrapper no longer need `dirname`, `cat`, `head` or `bash` from `PATH`, so the bootstrap, the setup offer and the team-memory lines survive a harness that starts hooks with a broken `PATH`. (upstream #2349, extended to the fork's own hooks) During a QA run the guardrail denies when `grep`, `sed` or `tr` is missing instead of letting every rule pass.
- **Muse runs session-start with bash.** The manifest started it with `sh`, which is dash on many systems.

### Skills

- **The ticket skills read a bare argument without a self-contradicting fallback.** new-task, brainstorm-task, task, init and qa-specialist wrote the argument placeholder twice; the harness substituted both, and the model read an instruction to fall back to a line that did not exist. In the forked QA agent that printed the usage line in 5 of 6 runs.
- **The brainstorm companion inserts screen content literally.** Screens containing `$'` or `$&` no longer splice pieces of the frame into the page. (upstream #2364)
- **The systematic-debugging example no longer prints the secret it checks for.** It reports only SET or UNSET. (upstream #2380)
- **`task-done` records a passing test command that prints nothing.** (upstream #2388)
- **The requesting-code-review example survives skill arguments.** `cut` replaces an `awk '{print $1}'` that the harness substituted. (upstream #2361)
- **`sdd-workspace` leaves a repository's own workspace `.gitignore` alone.** (upstream #2399)

### Harness Support

- Install from this repository on Claude Code, Antigravity, Codex, Cursor, Devin CLI, Factory Droid, Gemini CLI, GitHub Copilot CLI, Grok Build CLI, Kimi Code, OpenCode, Pi, Qwen Code, Hermes Agent and Muse; see the README for each install command.
- **Hermes shows every skill with its description.** The plugin passed only a name and path, so the skill list was blank. (upstream #2284)

### Rename and Fork Hygiene

- **One vocabulary.** The plugin, marketplace, skill namespace, runtime folder and environment variables are all `ultrapowers`, applied by `scripts/rename-fork.sh`. No tracked file or path carries the upstream name; upstream attribution lives in `LICENSE` and the README fork notice.
- **No telemetry.** The brainstorm companion serves its own bundled logo; nothing fetches from or reports to a remote host at runtime.
- Upstream-only material is gone: the sponsorship file, the Codex sync pipeline that depended on upstream's marketplace fork, the issue templates that routed reports upstream, and the code of conduct that sent incident reports to the upstream maintainers.

### Documentation

- `AGENTS.md` is the guide for agents and contributors: the layout, the rules (zero dependencies, skill bodies are code, no telemetry, versions, line endings) and every offline test suite.
- `docs/porting-to-a-new-harness.md` matches the code and indexes every integration in this repository; `docs/windows/polyglot-hooks.md` describes the hardened wrapper; `docs/testing.md` lists every suite.
- The design history of each piece is in `docs/ultrapowers/specs/` and `docs/ultrapowers/plans/`.
