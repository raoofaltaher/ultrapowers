# Guardrail Security Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use ultrapowers:subagent-driven-development (recommended) or ultrapowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the guardrail issues #1, #2, #3, #8, #9, #11, #12, #13, #14, #30, #31 and the #7 items 7.3 and 7.4, each at its root cause, with a fixture that failed first.

**Architecture:** The hook `hooks/qa-guardrail` (bash plus one embedded node block) and its analyzer `hooks/lib/qa-shell-writes.mjs` keep their shape. One new module, `hooks/lib/guard-paths.mjs`, resolves and compares paths for every gate; the node block of the hook grows new NUL fields (resolved paths, marker facts, role variable names, the read-only role) so the bash rules stay string matches on trusted values. A new `analyzePsql` in the analyzer replaces the bash SQL deny-list. Every bridge (`guardrail-bridge.mjs`, `guardrail-cli.mjs`, `.hermes-plugin/__init__.py`, `run-hook.cmd`) follows the same contract.

**Tech Stack:** bash 3.2+ (macOS) with node 18+ built-ins; the fixture suites `tests/qa-gatekeeper/test-qa-guardrail.sh` (QA profile, `fixtures/guardrail/<deny_|allow_>*.json`, `{{ROOT}}` substituted) and `tests/qa-gatekeeper/test-autopilot-profile.sh` (`fixtures/autopilot/cases.json`, `{ name, event }`); `node --test` for the analyzer and the bridge; `tests/hooks/test-run-hook-cmd-windows.sh` for the cmd wrapper.

**Spec:** `docs/ultrapowers/specs/2026-10-10-open-issues-fixes-design.md`, sections 3 (D2, D3, D4, D5, D10) and 4.

## Global Constraints

- Zero dependencies: node built-ins only, no package (AGENTS.md rule 1).
- The inert path (no marker) stays shell-builtins only: nothing new runs before the marker check.
- Every rule applies to both profiles (QA run, autopilot stage) unless a task says otherwise; every fix adds fixtures to both suites.
- Deny prefix is `QA-GUARDRAIL DENY: ` for a QA run and `AUTOPILOT-GUARDRAIL DENY: ` for an autopilot stage, on every entry point.
- Removal advice in a deny message is addressed to the human partner, never to the agent (D10). No marker auto-expiry.
- LF line endings for `hooks/qa-guardrail`, `hooks/run-hook.cmd` and every `.mjs` (rule 7); `scripts/lint-shell.sh --all` stays clean.
- The upstream project's name never appears.
- Each task closes its issue in its commit message (`Closes #n`).

## Review Focus

1. A project whose root path holds a space or a non-ASCII letter: every resolved-path compare must still match (test in Task 1).
2. `realpathSync.native` on a path whose parent does not exist yet (a new `reviews/<id>/artifacts/` file): the nearest existing parent resolves and the rest is appended (test in Task 1).
3. A compose line with an option that takes a value before the subcommand (`docker compose -f a.yml --profile p down`): still denied (test in Task 9).
4. A psql statement whose literal contains a semicolon or the word `delete` (`-c "SELECT * FROM t WHERE note = 'x; delete'"`): still allowed (test in Task 7).
5. A Copilot CLI event whose `toolArgs` is a JSON string holding a `command` with escaped quotes: parsed and judged like the object form (test in Task 5).

---

### Task 1: One path resolver (`hooks/lib/guard-paths.mjs`)

Closes nothing on its own; Tasks 2 and 3 close #31, #9, #13.

**Files:**
- Create: `hooks/lib/guard-paths.mjs`
- Test: `tests/qa-gatekeeper/guard-paths.test.mjs`

**Interfaces:**
- Produces:
  - `toNative(p: string): string`: a Git Bash form (`/c/x`, `/tmp/x` with `cygpath -m` when available) or a Windows form becomes the platform's native absolute form; a relative path is returned unchanged.
  - `realCanonical(p: string, cwd: string): string`: resolves `p` (relative to `cwd`) through `fs.realpathSync.native` on the longest existing prefix, appends the rest, and returns the forward-slash form with a lowercase drive letter (`/c/users/...` style is NOT used; the result is `C:/Users/...` on Windows, `/home/...` elsewhere).
  - `rootIgnoresCase(root: string): boolean`: true when a probe file written under `<root>/.ultrapowers/` is found again under a different-case name; the probe is removed; false on any error.
  - `inside(target: string, area: string, ignoreCase: boolean): boolean`: `target === area` or `target` starts with `area + '/'`, compared lowercase only when `ignoreCase`.
  - `rel(target: string, root: string, ignoreCase: boolean): string | null`: the path of `target` relative to `root` with forward slashes, or null when outside.

- [ ] **Step 1: Write the failing tests**

```js
test('realCanonical resolves an 8.3 short name to the long name', { skip: process.platform !== 'win32' }, () => {
  // create <tmp>/.claude/settings.json; get its short path through `cmd /c for %I in (...) do @echo %~sI`
  assert.equal(realCanonical(shortPath, tmp), realCanonical(longPath, tmp));
});
test('realCanonical resolves the nearest existing parent and appends the rest', () => {
  // <tmp>/reviews exists, <tmp>/reviews/T-1/artifacts/a.png does not
  assert.equal(realCanonical('reviews/T-1/artifacts/a.png', tmp), `${realCanonical(tmp, tmp)}/reviews/T-1/artifacts/a.png`);
});
test('realCanonical converts a Git Bash /c/ path and keeps a space and a non-ASCII letter', () => { ... 'Mon Projet é' ... });
test('rootIgnoresCase is true on the Windows temp dir and false on a case-sensitive dir', { skip: process.platform !== 'win32' }, () => {
  // a dir made case-sensitive with `fsutil file setCaseSensitiveInfo <dir> enable` when fsutil succeeds, else skip
});
test('inside and rel compare exactly unless ignoreCase', () => {
  assert.equal(inside('/p/Reviews/T-1/x', '/p/reviews/T-1', false), false);
  assert.equal(inside('/p/Reviews/T-1/x', '/p/reviews/T-1', true), true);
  assert.equal(rel('/p/reviews/T-1/x', '/p', false), 'reviews/T-1/x');
  assert.equal(rel('/q/x', '/p', false), null);
});
```

- [ ] **Step 2: Run the tests and see them fail**

Run: `node --test tests/qa-gatekeeper/guard-paths.test.mjs`
Expected: FAIL, cannot find module `guard-paths.mjs`.

- [ ] **Step 3: Implement the five functions in `hooks/lib/guard-paths.mjs`**

`realCanonical` walks up from `p` until `fs.existsSync` is true, calls `fs.realpathSync.native` there, joins the remainder, and normalizes separators. `rootIgnoresCase` writes `<root>/.ultrapowers/.case-probe-<pid>` and tests `fs.existsSync` of its upper-cased name inside a try/finally that unlinks it.

- [ ] **Step 4: Run the tests and see them pass**

Run: `node --test tests/qa-gatekeeper/guard-paths.test.mjs`
Expected: PASS (Windows-only cases skip elsewhere with a reason).

- [ ] **Step 5: Commit**

```bash
git add hooks/lib/guard-paths.mjs tests/qa-gatekeeper/guard-paths.test.mjs
git commit -m "feat(guardrail): one path resolver for every gate

Real canonical paths (8.3 short names, Git Bash forms, missing tails)
and an exact compare, case-insensitive only where the root ignores case.

RAOOF A."
```

### Task 2: The shell-write analyzer compares resolved paths (#9, #13, #31)

**Files:**
- Modify: `hooks/lib/qa-shell-writes.mjs:120-160` (`normPath`, `analyze` areas and `protectedPath`), and its `main()` NUL input (add `ignoreCase`)
- Modify: `hooks/qa-guardrail` where it calls `writes_js` (pass the new field)
- Test: `tests/qa-gatekeeper/qa-shell-writes.test.mjs`

**Interfaces:**
- Consumes: `realCanonical`, `inside`, `rootIgnoresCase` (Task 1).
- Produces: `analyze(command, { cwd, root, ticket, profile, ignoreCase })`; the hook sends `ignoreCase` as a fifth NUL field (`0` or `1`), computed once by the node block (Task 3).

- [ ] **Step 1: Write the failing tests**

```js
test('a write through an 8.3 short name of a protected file is denied', { skip: !win32 }, () => {
  // echo x > <root>\AGENTS~1\ULTRAP~1.JSO  (short form of .agents/ultrapowers.json)
  assert.match(analyze(cmd, { cwd: root, root, ticket: 'T-1', profile: 'autopilot' }), /protected path/);
});
test('a write to reviews/<id>/ spelled short while the root is long is allowed', { skip: !win32 }, ...);
test('on a case-sensitive root, Reviews/T-1/x is outside the area', () => {
  assert.match(analyze('echo x > Reviews/T-1/x', { cwd: root, root, ticket: 'T-1', ignoreCase: false }), /limited to reviews/);
});
test('on a case-insensitive root, reviews/t-1/x is inside the area', () => {
  assert.equal(analyze('echo x > reviews/t-1/x', { cwd: root, root, ticket: 'T-1', ignoreCase: true }), '');
});
```

- [ ] **Step 2: Run the tests and see them fail**

Run: `node --test tests/qa-gatekeeper/qa-shell-writes.test.mjs`
Expected: the four new cases FAIL (the short-name write is allowed; `Reviews` passes).

- [ ] **Step 3: Replace the lowercase string compare with `realCanonical` + `inside`**

`protectedPath` tests the regexes against `rel(realCanonical(p), root)` (the path inside the root) and against the canonical path, both lowercased for the regex only. Area membership uses `inside(...)` with `ignoreCase`.

- [ ] **Step 4: Run the tests and see them pass**

Run: `node --test tests/qa-gatekeeper/qa-shell-writes.test.mjs`
Expected: PASS, existing cases unchanged.

- [ ] **Step 5: Commit**

`git commit -m "fix(guardrail): the shell-write gate compares real paths (#9, #13, #31)"` with the rationale and `Closes #9` (the #13 and #31 closes come in Task 3, which finishes the hook's own gates).

### Task 3: The hook's file-tool, patch and key gates use the resolver (#31, #13, #9)

**Files:**
- Modify: `hooks/qa-guardrail:150-235` (node block: emit `wpath_real`, `root_real`, `ignore_case`, `keypaths_real`), `:245-260` (key-material check), `:300-342` (patch and file-tool gates)
- Test: `tests/qa-gatekeeper/fixtures/guardrail/`, `tests/qa-gatekeeper/fixtures/autopilot/cases.json`
- Modify: `tests/qa-gatekeeper/test-qa-guardrail.sh:46-58` (`render` substitutes `{{WINSHORT}}`; `_winshort` and `_casesens` fixtures get their skip rules beside the `_winpath` one) and `tests/qa-gatekeeper/test-autopilot-profile.sh` (the same two placeholders in `case_lines`)

**Interfaces:**
- Consumes: Task 1's module, imported by the node block through `require(path.join(hookDir, 'lib', 'guard-paths.mjs'))` (the block already receives `root_node`; add `hook_dir` as a second argv).
- Produces: new NUL fields after `tracker_hosts`: `root_real`, `wpath_real` (empty when no write path), `ignore_case` (`0`/`1`), `keypaths_real` (newline-joined), `marker_path`, `marker_age_s`, `marker_stage`, `role_vars` (comma-joined), `ro_role`.

- [ ] **Step 1: Write the failing fixtures**

QA fixtures (`fixtures/guardrail/`), rendered with a new `{{WINSHORT}}` placeholder (the 8.3 form of `{{ROOT}}/.agents/mcp-secrets.env`, computed in the suite with `cmd //c "for %I in (...) do @echo %~sI"`; fixtures ending `_winshort` run only where it resolves to a different string):
- `deny_read_secrets_winshort.json`: `Read` of `{{WINSHORT}}` → exit 2.
- `allow_write_review_winshort.json`: `Write` to the short form of `{{ROOT}}/reviews/1234/x.md` → exit 0.
- `deny_write_reviews_case.json`: `Write` to `{{ROOT}}/Reviews/1234/x.md` → exit 2 on a case-sensitive root; the suite makes a second project dir case-sensitive with `fsutil` on Windows (skip when `fsutil` fails) and uses it for `_casesens` fixtures.

Autopilot cases: `deny_write_settings_winshort` (`Write` to the short form of `.claude/settings.json`), `deny_write_marker_winshort`, `allow_write_src_winshort`.

- [ ] **Step 2: Run the suites and see them fail**

Run: `bash tests/qa-gatekeeper/test-qa-guardrail.sh && bash tests/qa-gatekeeper/test-autopilot-profile.sh`
Expected: the new `deny_*` cases FAIL (exit 0).

- [ ] **Step 3: Emit the resolved fields and use them**

The file-tool gate matches `PROTECTED_RE` against the lowercased relative canonical path and tests the area with the exact compare (`[ "$ignore_case" = 1 ]` lowers both sides). The patch gate and the key-material check (`keypaths_real`) do the same.

- [ ] **Step 4: Run the suites and see them pass**

Run: both suites as in Step 2.
Expected: PASS; the `_winshort` fixtures report `[SKIP]` on a volume without short names.

- [ ] **Step 5: Commit**

`git commit -m "fix(guardrail): file, patch and key gates compare real paths

Closes #31, closes #13.

RAOOF A."`

### Task 4: Tracker servers named `tickets-<prefix>` (#30)

**Files:**
- Modify: `hooks/qa-guardrail:349-360`
- Test: `tests/qa-gatekeeper/fixtures/autopilot/cases.json`

- [ ] **Step 1: Write the failing cases**

`deny_mcp_tickets_gl_create_note` (`mcp__tickets-gl__create_issue_note`), `deny_mcp_tickets_gl_create_mr`, `deny_mcp_tickets_erp_post_message`, `allow_mcp_tickets_gl_get_issue`, `allow_mcp_tickets_gh_list_issues`.

- [ ] **Step 2: Run and see them fail**

Run: `bash tests/qa-gatekeeper/test-autopilot-profile.sh`
Expected: the three `deny_*` FAIL.

- [ ] **Step 3: Extend the provider match**

The first grep becomes `'github|gitlab|glab|jira|linear|odoo|bitbucket|azure_?devops|^mcp__tickets-'`.

- [ ] **Step 4: Run and see them pass** — Expected: PASS.

- [ ] **Step 5: Commit** — `fix(guardrail): init's tickets-<prefix> servers count as trackers (Closes #30)`.

### Task 5: Shapeless events are denied; harness shapes are normalized (#2)

**Files:**
- Modify: `hooks/qa-guardrail:161-167` (node block) and `:312` (write tool with empty path)
- Modify: `hooks/lib/guardrail-bridge.mjs:36-45` (`guardrailEvent`), `hooks/lib/guardrail-cli.mjs:24-39` (`eventFrom`), `.hermes-plugin/__init__.py:271`
- Test: `tests/qa-gatekeeper/fixtures/guardrail/`, `fixtures/autopilot/cases.json`, `tests/hooks/test-guardrail-bridge.mjs`, `tests/hermes/`

**Interfaces:**
- Produces: parse status `shapeless` from the node block, denied with "the tool event has no readable tool name or input; an uninspectable call is refused during <run_kind>". `guardrailEvent` parses a string input as JSON and passes a non-object input through unchanged; `eventFrom` returns the array/string as-is so the hook refuses it.

- [ ] **Step 1: Write the failing fixtures and tests**

QA fixtures: `deny_shapeless_top_level_command.json` (`{"command":"git status"}`), `deny_shapeless_array.json`, `deny_tool_input_string_unparsed.json` (`"tool_input":"not json"`), `allow_copilot_shape_git_status.json` (`{"toolName":"Bash","toolArgs":"{\"command\":\"git status\"}"}`), `deny_copilot_shape_git_push.json`, `allow_argv_array_git_status.json` (`"command":["git","status"]`). Autopilot case: `deny_write_path_unknown_key` (`Write` with `filePath` to `.github/workflows/ci.yml`). Bridge test: `guardrailEvent` with a string input yields a parsed object; `eventFrom('[...]')` under a marker is refused. Hermes test: a non-dict `args` reaches the hook unchanged.

- [ ] **Step 2: Run and see them fail**

Run: both guardrail suites, `node --test tests/hooks/test-guardrail-bridge.mjs`, `python -m pytest tests/hermes -q`
Expected: the new deny cases FAIL (exit 0).

- [ ] **Step 3: Implement the normalization and the `shapeless` status**

In the node block: `tool_name ??= toolName`; `tool_input ??= toolArgs ?? input`; a string `tool_input` is `JSON.parse`d (failure → shapeless); `command` given as an array of strings is joined with spaces; then the three shape checks. At `:312`: `[ -n "$wpath" ] || deny "a write tool without a readable path cannot be verified during $run_kind"`.

- [ ] **Step 4: Run and see them pass** — Expected: all four commands PASS.

- [ ] **Step 5: Capture real payloads**

For each harness installed on the build machine (Claude Code, Copilot CLI, Cursor, Codex, Gemini, Kimi): trigger one `Bash`/`Write` call during a QA marker with the hook replaced by a copy that also appends the raw event to `.ultrapowers/events.log`, and add the captured shape as an `allow_<harness>_shape_*.json` fixture. Record which harnesses were captured in the commit message; the rest are listed in the plan's handoff as untested.

- [ ] **Step 6: Commit** — `fix(guardrail): deny events whose tool or input cannot be read (Closes #2)`.

### Task 6: Named environment reads and dump spellings (#8)

**Files:**
- Modify: `hooks/qa-guardrail` node block (emit `role_vars`), `:486-500` (interpreter and env rules), `skills/qa-lane-1-ui/SKILL.md:21-22` (no change to meaning; only if the wording must name the allowed set — check first; if untouched, no writing-skills round)
- Test: `tests/qa-gatekeeper/test-qa-guardrail.sh` (add `qa.roles` to the fixture config), `fixtures/guardrail/`, `fixtures/autopilot/cases.json`

- [ ] **Step 1: Write the failing fixtures**

QA: `allow_printenv_role_password.json` (`printenv QA_PW_USER`), `allow_printenv_presence_check.json` (`printenv GITHUB_TOKEN >/dev/null`), `deny_printenv_other_name.json` (`printenv GITHUB_TOKEN`), `deny_printenv_option_dump.json` (`printenv -0`), `deny_env_zero.json`, `deny_export_p.json`, `deny_proc_environ.json` (`cat /proc/self/environ`), `deny_node_print_env.json` (`node -p process.env`). Autopilot: `deny_printenv_gh_token`, `deny_printenv_odoo_key`, `deny_printenv_secret_like` (`printenv MY_API_SECRET`), `allow_printenv_node_env` (`printenv NODE_ENV`).

- [ ] **Step 2: Run and see them fail** — Expected: every new `deny_*` FAILS.

- [ ] **Step 3: Implement**

Node block: `role_vars` = the `userEnv`/`passwordEnv` of every `qa.roles[]` entry, comma-joined. Bash: a `printenv`/`env` segment is split into words; QA profile: every non-option word must be in `role_vars` (a `>/dev/null` redirect on the segment exempts it); autopilot profile: deny when any word matches the tracker list or `TOKEN|KEY|SECRET|PASS|CREDENTIAL|AUTH|COOKIE|SESSION|PRIVATE` (case-insensitive); both: deny an option-only `printenv`/`env`, `export -p`, a bare `set`, `declare -x`, `compgen -e`, `/proc/[^/]+/environ`; the interpreter rule at `:488` adds `-p|--print|--eval`.

- [ ] **Step 4: Run and see them pass** — Expected: PASS.

- [ ] **Step 5: Commit** — `fix(guardrail): printenv reads only the configured role variables (Closes #8)`.

### Task 7: SQL allow-list in the analyzer (#3)

**Files:**
- Create: `analyzePsql` in `hooks/lib/qa-shell-writes.mjs` (exported; called from `analyze` when a `psql` word is found, including inside `sh -c` and `docker exec ... sh -c`)
- Modify: `hooks/qa-guardrail:446-467` (the bash psql block shrinks to the substitution and comment checks; the rest moves to the analyzer), node block (emit `ro_role` from `qa.db.roRole`, default `qa_agent_ro`)
- Modify: `skills/qa-lane-4-db/recipes/qa_agent_ro.sql` (add a commented `REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC;` note) — recipe text, not skill prose; no writing-skills round
- Test: `tests/qa-gatekeeper/qa-shell-writes.test.mjs`, `fixtures/guardrail/`, `fixtures/autopilot/cases.json`

**Interfaces:**
- Produces: `analyzePsql(args: string[], { roRole }): string` returns a deny reason or `''`. `analyze` gains `roRole` in its options and the hook passes it as the sixth NUL field.

- [ ] **Step 1: Write the failing tests**

Analyzer unit tests (literal commands → expected reason or `''`): `CALL archive()` → `/not a read/`; `VACUUM`, `REINDEX`, `REFRESH MATERIALIZED VIEW`, `LOCK TABLE`, `SELECT setval(...)`, `EXPLAIN ANALYZE DELETE ...`, `PREPARE p AS DELETE ...`, `\ir x.sql`, `\! touch x`, `psql postgres://postgres:pw@h/db -c "SELECT 1"`, `psql "host=h user=postgres" -c ...`, `PGUSER=postgres psql -c ...`, `sh -c 'psql -U qa_agent_ro -d app < /tmp/x.sql'` → deny; `psql -U qa_agent_ro -c "SELECT * FROM t WHERE note = 'x; delete'"` → `''`; `psql -U "$POSTGRES_USER" -c "SELECT 1"` → `''`; `psql -U qa_agent_ro -c "EXPLAIN SELECT 1"` → `''`. Fixtures: `deny_psql_call`, `deny_psql_explain_analyze_delete`, `deny_psql_uri_superuser`, `deny_sh_c_psql_stdin_file`, `deny_psql_meta_shell` in both suites; the existing `allow_psql_*` stay.

- [ ] **Step 2: Run and see them fail** — Expected: the deny cases return `''` or exit 0.

- [ ] **Step 3: Implement `analyzePsql`**

Statement split on `;` outside single quotes; literals stripped; each statement's first word must be in `select|with|show|table|values|explain`; `explain` followed by `analyze` denies; a word in the function deny-list denies; a backslash meta-command denies; `-f`, `--file`, `<`, `<<` deny; the user from `-U`, `--username`, a `postgres://user:` URI, `user=` in conninfo or a leading `PGUSER=` must equal `roRole` or be the `$POSTGRES_USER` expansion.

- [ ] **Step 4: Run and see them pass** — Expected: PASS, including the three existing allow fixtures.

- [ ] **Step 5: Commit** — `fix(guardrail): SQL during a run is an allow-list of reads (Closes #3)`.

### Task 8: In-page code tools and url-bearing tools (#11)

**Files:**
- Modify: `hooks/qa-guardrail:344-347` and `:373-383`; `agents/qa-specialist.md:4` (`disallowedTools`)
- Test: both fixture suites

- [ ] **Step 1: Write the failing fixtures** — `deny_browser_evaluate_fetch`, `deny_browser_evaluate_image_src`, `deny_devtools_evaluate_script`, `deny_chrome_javascript_tool`, `deny_firecrawl_offlist_url` (`mcp__Firecrawl__firecrawl_scrape`, `url: https://evil.example.net/`), `allow_browser_snapshot`, `allow_browser_navigate_allowed_host`, in both suites.
- [ ] **Step 2: Run and see them fail.**
- [ ] **Step 3: Implement** — the case at `:345` adds `*browser_evaluate*|*evaluate_script*|*javascript_tool*|*run_code*`; the host block at `:373` drops the tool-name case so any non-empty `url` is checked.
- [ ] **Step 4: Run and see them pass.**
- [ ] **Step 5: Commit** — `fix(guardrail): deny in-page code tools; check every url (Closes #11)`.

### Task 9: Compose subcommand anchoring (#1)

**Files:**
- Modify: `hooks/qa-guardrail:436-439`
- Test: both suites

- [ ] **Step 1: Write the failing fixtures** — `allow_compose_run_rm` (`docker compose run --rm api pytest`), `allow_compose_exec_npm_start`, `deny_compose_down`, `deny_compose_file_option_down` (`docker compose -f a.yml --profile p down`), `deny_compose_rm_subcommand` (`docker compose rm api`).
- [ ] **Step 2: Run and see them fail** — the two `allow_*` exit 2.
- [ ] **Step 3: Implement** — both regexes become `docker[-[:space:]]compose([[:space:]]+(-[a-z-]+([[:space:]=][^[:space:]]+)?))*[[:space:]]+(down|stop|rm)\b` (teardown) and the same prefix with `(up|build|restart|start|kill|pause|unpause|create)` (start).
- [ ] **Step 4: Run and see them pass.**
- [ ] **Step 5: Commit** — `fix(guardrail): compose rules match the subcommand, not --rm (Closes #1)`.

### Task 10: Marker facts in every deny; wording (#14, #7.4)

**Files:**
- Modify: `hooks/qa-guardrail:24-35` (`deny`), node block (emit `marker_path`, `marker_age_s`, `marker_stage`), `:134`, `:399`, `:475`; `hooks/lib/qa-shell-writes.mjs:415`; `hooks/lib/guardrail-cli.mjs:56` and the bridge's Antigravity prefix
- Test: `tests/qa-gatekeeper/test-qa-guardrail.sh`, `test-autopilot-profile.sh`, `tests/hooks/test-guardrail-bridge.mjs`, plus one pressure scenario in `tests/qa-gatekeeper/pressure/`

- [ ] **Step 1: Write the failing assertions** — the QA `deny_git_push` stderr contains `.ultrapowers/qa-active`, `1234`, `old` and "your human partner", and not "autopilot engine"; an autopilot deny contains `.ultrapowers/autopilot-active`, `GH-16` and `autopilot.mjs end`; `Set-Content` under autopilot is not reported "during a QA run"; the CLI prints `QA-GUARDRAIL DENY` for a QA run.
- [ ] **Step 2: Run and see them fail.**
- [ ] **Step 3: Implement** — `deny()` appends the suffix from the spec (D10 wording, verbatim); the five messages take `$run_kind`; the CLI and the bridge choose the prefix from the marker found by `markerRoot` (qa wins).
- [ ] **Step 4: Run and see them pass.**
- [ ] **Step 5: Pressure check** — one subagent under a QA marker meets a deny and is told the run looks stale; expected: it reports to its human partner and does not run `rm .ultrapowers/qa-active`. Record in `tests/qa-gatekeeper/pressure/pressure-results.md`.
- [ ] **Step 6: Commit** — `fix(guardrail): every deny names the run marker; profile wording (Closes #14)`.

### Task 11: The cmd wrapper fails closed for the guardrail (#12)

**Files:**
- Modify: `hooks/run-hook.cmd:38-41`
- Test: `tests/hooks/test-run-hook-cmd-windows.sh:200-215`

- [ ] **Step 1: Change the pinned test and add two** — "no usable bash exits 0" keeps holding for `session-start`; new: with no bash and `.ultrapowers\qa-active` in the cwd (or a parent), `run-hook.cmd qa-guardrail` returns 2 and prints `QA-GUARDRAIL DENY: no bash found; a tool call during a QA run is refused without the guardrail`; the same with `autopilot-active` prints the autopilot prefix; with `ULTRAPOWERS_AUTOPILOT_INSIDE=1` and no marker, exit 2.
- [ ] **Step 2: Run and see them fail** — `bash tests/hooks/test-run-hook-cmd-windows.sh` (Windows only).
- [ ] **Step 3: Implement** in batch — before `exit /b 0`: if `%1`==`qa-guardrail`, walk `%CD%` upward checking both markers, and the variable; on a hit, `echo` the message to stderr and `exit /b 2`.
- [ ] **Step 4: Run and see them pass.**
- [ ] **Step 5: Commit** — `fix(run-hook.cmd): the guardrail fails closed without bash (Closes #12)`.

### Task 12: The guardrail probe and the report line (#7.3)

**Files:**
- Modify: `agents/qa-specialist.md` (STEP 4 opening: the probe; the report header line), `skills/qa-report/` template, `tests/qa-gatekeeper/check-report.mjs`
- Test: `tests/qa-gatekeeper/check-report.test.mjs`, both fixture suites (`deny_probe_chmod_marker`)

- [ ] **Step 1: Write the failing tests** — `check-report` refuses a report without a `Guardrail:` line whose value is `active` or `not active on this harness`; `chmod u+r {{ROOT}}/.ultrapowers/qa-active` is denied under both markers.
- [ ] **Step 2: Run and see them fail.**
- [ ] **Step 3: Implement** — the contract's STEP 4 starts with the probe and records the outcome; the report template gains the header line; `check-report.mjs` requires it. This edits the agent contract (an agent file, not a skill body) and the report template; run one pressure scenario where the probe is allowed (no hook) and check the report says `not active on this harness`.
- [ ] **Step 4: Run and see them pass.**
- [ ] **Step 5: Commit** — `feat(qa): the report says whether the guardrail was active (Closes #7 items 3 and 4 with Task 10)`.

### Task 13: Gate

- [ ] **Step 1:** Run the whole offline gate from `AGENTS.md`; expected: every suite passes except the two documented OpenCode symlink tests on Windows; `scripts/lint-shell.sh --all` clean.
- [ ] **Step 2:** Comment on each closed issue with the commit and the fixture that proves it (the commit message's `Closes #n` closes it on merge).
