# Security report — audit-2026-10-11
Verdict: FAIL — two High guardrail-bypass findings (hooks/lib/qa-shell-writes.mjs:73 command substitutions, :1215 cd handling) stand unrefuted because every verifier but one failed on the org spend limit, one Medium is confirmed (Hermes cwd-resolved node, .hermes-plugin/__init__.py:283), and the dependencies lane (npm audit never ran), the osint lane (no gh query ran) and the git-history check were not covered, so there is no clean bill for dependencies or secrets.

| Ticket or audit | audit-2026-10-11 |
|---|---|
| Date (UTC) | 2026-10-11 (time not recorded) |
| Scope | the whole tree (full audit) |
| Repositories | ultrapowers: feat-vulnerability-hunt at ba4bfe4, 1138 files by the preflight (the request said 1137; the preflight run by the gate reported 1138), 27 tree groups |
| Lanes run | dependencies (incomplete), code (8 hunters), secrets-supply-chain (incomplete), ai-surface, osint (incomplete) |

## Summary

Counts across the one repository, after merging duplicates (the .mcp.json finding from ai-surface and code 7; the cwd-relative Antigravity/Kimi hook commands from code 8 and ai-surface; the pre-commit fail-open from code 8 and secrets-supply-chain):

| Severity | Findings | Confirmed | Refuted | Unverified |
|---|---|---|---|---|
| High | 2 | 0 | 0 | 2 (verifier failed) |
| Medium | 18 | 1 | 0 | 17 (verifier failed) |
| Low | 7 | 0 | 0 | 7 (Lows are not verified by contract) |
| CVEs | 0 | | | none reported, because no audit tool ran |

- Verification: 19 verifiers were dispatched on the most capable model. One finding (the Hermes one) had already been verified and came back confirmed at confidence 7. All 19 others ended with `You've hit your org's monthly spend limit` (HTTP 429) before returning a verdict. Each is recorded as `unverified (verifier failed)` and no verdict is guessed. They were not re-dispatched, since the limit is still in force. In the findings file their verdict is `unverified`, which is outside the contract's confirmed, plausible, rejected set on purpose.
- Discarded leads: at least 23 (the counts for code 2, 3, 7, 8 and secrets-supply-chain were not relayed). None were rejected by a verifier.
- What decided the verdict: the contract fails a run on a confirmed or plausible High. The two High findings are the hunter's own claims at confidence 9, reasoned from code and never executed, and they could not be put to a verifier. An unrefuted High cannot yield a pass. If both were rejected on verification the verdict would drop to PASS-WITH-ISSUES, because of the confirmed Medium. Re-run the verifier pass for these two first.
- Not INCOMPLETE: the contract reserves INCOMPLETE for a dependencies lane that produced no block. That lane did return a block, with status `incomplete`, so it is named here and in the verdict sentence instead.
- Provenance caveat: the blocks for dependencies, osint, code 1, code 4, code 6 and ai-surface are the hunters' own JSON. The blocks for code 2, code 3, code 5, code 7, code 8 and secrets-supply-chain were lost when the session was cut off by the spend limit and are reconstructed from the summaries the coordinator relayed. Their attack paths, exploits and mitigation notes are shorter than the contract asks for, and are marked "relayed as summary only" in the findings file. Treat them as hunter claims.
- Injection check: the ai-surface hunter's output was flagged by the harness as matching instruction-shaped patterns (settings-json, bypass-permissions). It was the hunter quoting a permission-bypass flag as part of a finding. No instruction in it was followed.
- Method notes: the lane and verifier prompts were read from `skills/vulnerability-hunt/` in the audited tree, because the plugin copy was not readable by the gate. The audited tree is the same plugin; if its copy differs from the installed one, the prompts used may differ.

Guardrail: active (the hunt profile denied an output redirect, a `gh repo` call and `npm audit --prefix`; none was worked around)

## Repositories

### ultrapowers

### CVEs

| Package | Version | Advisory | Severity | Fixed in | Runtime |
|---|---|---|---|---|---|
| none reported | | | | | |

No advisory was obtained from any tool. This is not a clean result: `npm audit` never ran for `tests/brainstorm-server` (`ws` 8.22.0, the only declared dependency, pinned by a v3 lockfile; used by the server's test files only), and the root `package.json` declares no dependencies. No advisory is stated from memory.

### Findings

#### High

1. **Command substitutions, backticks and unquoted heredoc bodies are opaque to the shell-write analysis** `hooks/lib/qa-shell-writes.mjs:73` — guardrail-bypass, confidence 9, verification unverified (verifier failed: spend limit)
   - Attack path: a prompt-injected agent's Bash tool call reaches `hooks/qa-guardrail`; `tokenize()` (qa-shell-writes.mjs:73) skips `$( )`, backtick and unquoted-heredoc bodies and emits an opaque word, so the write analysis never sees what is inside; the autopilot "substitution at segment start" rule (hooks/qa-guardrail:701) fires only at the start of a segment. Full path relayed as a summary only.
   - Exploit: `echo $(echo x > src/app.js)` writes outside `reviews/<ticket>`. In autopilot the same shape reaches `.git/config`, `.github/`, `.agents/ultrapowers.json` and `hooks/qa-guardrail`. Described, never run.
   - Mitigation examined: only the fixed-verb text rules and the segment-start rule; none covers a substitution inside a segment.
   - Fix: recurse into substitutions, or deny any substitution during a run.

2. **cd handling: tilde and unscoped directory across subshells and pipelines** `hooks/lib/qa-shell-writes.mjs:1215` — guardrail-bypass, confidence 9, verification unverified (verifier failed: spend limit)
   - Attack path: a Bash call with a subshell or pipeline `cd`; `flush()` on `( ) | &` does not scope the tracked directory, and `cd ~` sets it to `<dir>/~`; a later relative write such as `src/app.js` is judged against `reviews/T` and allowed. Full path relayed as a summary only.
   - Exploit: `(cd reviews/T); echo x > src/app.js` or `cd reviews/T | cat; ...`. Described, never run.
   - Mitigation examined: none found by the hunter.
   - Fix: treat `~` as unresolved, and save and restore the directory around subshells, pipelines and background segments.

#### Medium

All items below are unverified (verifier failed: spend limit) except item 1.

1. **Hermes plugin resolves node through the working directory on Windows** `.hermes-plugin/__init__.py:283` — untrusted search path, confidence 7, verification **confirmed**
   - Attack path: Hermes calls `pre_tool_call` with its own working directory (`:309-311`); the guardrail check proceeds if a run marker exists at or above it (`:273-279`), and the hunt creates that marker itself (`skills/vulnerability-hunt/scripts/hunt-preflight.mjs:412`); a hostile repository can also commit one; `shutil.which("node")` (`:283`) searches the current directory first on Windows (PATHEXT included); the relative result runs at `subprocess.run([node, cli], ...)` (`:288`).
   - Exploit: a repository ships `node.exe`, `node.cmd` or `node.bat` at its root; a native-Windows Hermes session runs it as the user on every guarded tool call, including during this hunt. Described, never run.
   - Mitigation examined: no absolute path, no exclusion of the cwd, `NoDefaultCurrentDirectoryInExePath` not set. `hooks/run-hook.cmd:31-37`, `tests/hooks/test-run-hook-cmd-windows.sh:141-155` and `hooks/lib/guardrail-bridge.mjs:160-176` guard the same class elsewhere; the Hermes adapter does not. Unseen: whether Hermes runs natively on Windows (its tests and bridge treat Windows as supported).
   - Fix: resolve node from PATH entries only or by absolute path, and set `NoDefaultCurrentDirectoryInExePath=1`.

2. **$'..' and $".." quoting is tokenized as literal text, hiding paths and names from the write analysis** `hooks/lib/qa-shell-writes.mjs:90` — guardrail-bypass, confidence 8. A write to `reviews/T/$'..'/$'..'/src/app.js` is judged inside the area; protected names, `.env` and program names are hidden the same way. Fix: decode them or deny them.

3. **Autopilot protected-path matching ignores glob and brace expansion** `hooks/lib/qa-shell-writes.mjs:839` — guardrail-bypass, confidence 8, autopilot only. `.gi[t]/config`, `hooks/qa-guardra[i]l`, `.agents/ultrapowers.jso[n]` and `tee {.git,x}/config` are matched on the typed text. Fix: refuse targets containing `* ? [ {`.

4. **Secret-file rule matches only literal spelling, omits credential files, and the token-variable check is autopilot-only** `hooks/qa-guardrail:442` — guardrail-bypass, confidence 8. `KEY_RE` misses quoted or globbed spellings and omits the glab config, gh hosts file, `.npmrc`, `.netrc` and `.git-credentials`; printing a tracker token works in the hunt. Fix: run it over resolved words, extend the list, apply the variable check in every profile.

5. **git -c is skipped and read-only git subcommands can run a configured command in QA and hunt** `hooks/lib/qa-shell-writes.mjs:1444` — guardrail-bypass, confidence 8. `git -c core.fsmonitor=<cmd> status` runs a command; only autopilot denies `-c`. Fix: deny `-c`, `--config-env`, `--exec-path`, `-O` and `--ext-diff` in every profile.

6. **.ultrapowers/ is writable in QA and hunt runs, so the run marker can be removed or widened** `hooks/qa-guardrail:610` — guardrail-bypass, confidence 9. Removing the marker makes every later call inert; writing `..` into it widens the write area to the project because the ticket value is interpolated into `reviews/<ticket>`. Fix: protect the QA and hunt markers from the agent and validate the ticket value.

7. **PowerShell tool command is analysed as POSIX shell** `hooks/qa-guardrail:745` — guardrail-bypass, confidence 8. Aliases (`sc`, `ac`, `ni`, `ri`, `mi`, `cpi`, `rni`, `si`), `[IO.File]::WriteAllText` and `iwr -OutFile` are not denied. Fix: on the PowerShell tool, allow only a read-only list.

8. **MCP tracker-write rule is gated on the autopilot profile only** `hooks/qa-guardrail:483` — tool misuse, confidence 7. Hunt and QA can call MCP comment, mail, chat or Odoo write tools; an MCP call with no command falls through to exit 0 at `:647`. Fix: apply the rule to the hunt profile.

9. **Write analysis is a program-name deny-list, so unlisted programs and project scripts can write or execute** `hooks/lib/qa-shell-writes.mjs:707` — guardrail-bypass, confidence 8. Not caught: `node reviews/x.mjs` after the Write tool created it, `bash script.sh`, `./x`, `make`, `awk -f`, `sed -f`, `shuf -o`, `uniq IN OUT`, `zip`, `openssl -out`, `sqlite3`, `ed`, `curl --output-dir`. Commit ba4bfe4 documents running a project script as forbidden by the hunter's contract, and the hook does not enforce it. Fix: allow-list programs in hunt and QA.

10. **A symlink created in the same command is not resolved when write paths are checked** `hooks/lib/qa-shell-writes.mjs:1744` — guardrail-bypass, confidence 8. `ln -s ../.. reviews/T/up && echo x > reviews/T/up/src/app.js` passes. Fix: check `ln -s` targets and refuse writes through same-command links.

11. **Egress host allow-list inspects only https URLs, so extra curl/wget operands escape it** `hooks/qa-guardrail:839` — guardrail-bypass, confidence 7, only when `qa.hosts.allowed` is set. A second schemeless URL, `--connect-to`, `--resolve` and `--proxy` pass. Fix: parse every curl and wget operand and refuse those forms.

12. **Autopilot envelope does not protect .mcp.json or other harness MCP/config files, which the next headless stage loads outside the guardrail** `hooks/qa-guardrail:470` (also `skills/autopilot/scripts/autopilot.mjs:1066`) — tool misuse, confidence 7 (reported by ai-surface and code 7)
    - Attack path: outsider ticket text (fetch-ticket.mjs:284-302) reaches the scaffold or spec stage; a maintainer labels the ticket ready (label checked, content not; autopilot.mjs:1256); the steered stage writes an MCP server entry to `<root>/.mcp.json`, which the guardrail allows (qa-guardrail:586-599, protected set at :466/:470 lacks it); the watcher starts the next stage with `--strict-mcp-config --mcp-config <root>/.mcp.json` (autopilot.mjs:1066-1075, 1084) and the harness runs the attacker's command as the user outside every hook; it can read tracker CLI credentials in the home directory. The engine commits only `tasks/<ID>` (repos.mjs:140), so the edit is not in the approver's diff.
    - Exploit: a ticket comment asks the agent to register a docs MCP server whose command exfiltrates credentials. Described, never run.
    - Mitigation examined: ticket text is quoted and marked data; the ready label needs a write-access account; stage tokens read-only when configured. None covers `.mcp.json`. Unexercised: whether an explicit `--mcp-config` skips the harness's project-server approval.
    - Fix: protect `.mcp.json`, `.cursor/`, `.vscode/`, `.codex/`, `.kimi/`, `.factory/` and `opencode.json` in the guardrail copies, and take the stage's MCP config from a snapshot the engine controls.

13. **URL-carrying tools (WebFetch, Firecrawl, browser tools) have no egress restriction in autopilot stages unless qa.hosts.allowed or qa.urls is set** `hooks/qa-guardrail:638` — sensitive data exposure, confidence 6. Only `qa.hosts.forbidden` and a non-empty allow-list are checked for tool URLs; this repository leaves both empty. Fix: default-deny tool URLs to hosts from the ticket's own links in the autopilot profile, and document that empty `qa.hosts` means open egress.

14. **Team memory and nested instruction files are writable by autopilot stages, and uncommitted edits bypass PR review** `hooks/qa-guardrail:470` — memory manipulation, confidence 6. `.agents/memory/**` and nested `AGENTS.md` and `.cursor/rules` are not protected; `MEMORY.md` is imported into every session through `CLAUDE.md`; nothing excludes facts that came from ticket text. Fix: protect these paths in the autopilot profile and add a provenance rule to the remember gate.

15. **In nested worktrees .git is a file the guardrail does not protect, so a stage can redirect gitdir and make engine git run attacker config** `skills/autopilot/scripts/repos.mjs:105` — confidence 6. The protected regex needs `.git/`; the worktree's `.git` file is writable; a `gitdir:` pointer to a stage-written directory carries `core.sshCommand` or `remote.origin.url`, used by the engine's push (repos.mjs:158, :121; autopilot.mjs:698). Fix: deny writes ending in `/.git`, check the git dir lies under `<clone>/.git/worktrees`, and pass `-c core.sshCommand= -c core.fsmonitor=` to engine git.

16. **hunt-preflight and sibling scripts resolve tools through the checkout's working directory on Windows** `skills/vulnerability-hunt/scripts/hunt-preflight.mjs:151` — untrusted search path, confidence 6. `execSync` through cmd.exe searches the cwd first, so `npm.cmd`, `gh.bat` or `dotnet.exe` at the checkout root runs; `spawnSync('git'/'bash')` at hunt-preflight.mjs:301 and :324, qa-preflight.mjs:196, repos.mjs:18 and init.mjs:1716 do likewise. It runs before any guardrail marker exists. Windows only; related to item 1. Fix: resolve tools from PATH entries only and set `NoDefaultCurrentDirectoryInExePath=1`.

17. **Antigravity and Kimi guardrail hook commands are working-directory-relative** `hooks.json:10` (also `.kimi-plugin/plugin.json:28`) — confidence 6 (reported by code 8 and ai-surface). `node hooks/lib/guardrail-cli.mjs --antigravity` and `node ./hooks/lib/guardrail-cli.mjs` carry no plugin-root variable; if the harness's cwd is the project, a hostile repository's own file runs, or the guardrail silently does not (Kimi is fail-open on hook error, harnesses.mjs:103). `tests/antigravity` says its path resolves from the plugin root; nothing equivalent was found for Kimi. Fix: use a path the harness expands, and add a decoy-file test.

18. **Scaffolded Claude settings pre-approve git diff and git blame, which can read files the Read deny rules protect** `templates/.claude/settings.json.tmpl:11` — unsafe default permissions, confidence 6. `git diff --no-index /dev/null <credential file>` and `git blame --contents <file>` read what the Read denies protect; the deny list omits `.env.staging`, `.env.development`, `.env.test`, `~/.gnupg`, `~/.kube`, `~/.config/gh`, `~/.npmrc` and `~/.git-credentials`. Fix: drop the allows or deny `--no-index` and `--contents`, and extend the denies.

#### Low

All unverified, by contract.

1. **Scaffold and spec stages read every ticket commenter's text, and the ticket title lands unmarked in the brief** `skills/new-task/scripts/fetch-ticket.mjs:284` — prompt injection, confidence 6. The changes stage filters by author permission; this path does not. In full mode no human reads the spec or plan before execute. It is the entry point for Medium items 12 to 14.
2. **Odoo API key is sent to whatever URL the checked-out config names** `skills/autopilot/scripts/odoo.mjs:40` — confidence 6; `mcpUrl` may be http (ticket-sources.mjs:73; init.mjs:583).
3. **Stage environment scrub omits GitLab token variables** `skills/autopilot/scripts/autopilot.mjs:1050` — confidence 6. The hunter states this from memory of glab documentation and did not check it.
4. **QA database recipe: the role keeps CREATE on public through PUBLIC on PostgreSQL 14 and older** `skills/qa-lane-4-db/recipes/qa_agent_ro.sql:43` — confidence 6.
5. **Scaffold pre-commit hook skips the secret scan when gitleaks and Docker are unavailable, and CI has no secret scan** `templates/.githooks/pre-commit.tmpl:34` and `.githooks/pre-commit:35` — confidence 6 (code 8 and secrets-supply-chain, merged). The image is pinned by tag, not digest.
6. **actions/checkout pin could not be tied to a known v4 tag** `.github/workflows/ci.yml:25` — confidence 6, unverified because `gh api` was denied. The workflow itself has no `pull_request_target`, `contents: read`, no secrets and no `${{ }}` in run steps.
7. **templates/.mcp.json runs six `npx -y` MCP servers with exact versions but no lockfile; three receive API keys** `templates/.mcp.json:6` — confidence 6. No live secret was found in the tracked tree.

## Skipped lanes

- **dependencies: incomplete.** `npm audit --package-lock-only --json` never ran for `tests/brainstorm-server` or the root. The hunter's output redirect to a temp file was denied by the hunt guardrail ("redirect target is outside reviews/audit-2026-10-11/ and .ultrapowers/"), and the retry without a redirect was denied by the permission layer. The gate's own run from the repository root returned exit 1 with `ENOLOCK` (the root has no lockfile), and `npm audit --prefix <folder>` is denied by the guardrail. Changing into `tests/brainstorm-server` first needs approval, which this non-interactive run cannot get. None of this was worked around. pip-audit, cargo-audit and osv-scanner are absent and dotnet does not apply. Offline fallback that ran: the root `package.json` declares no dependencies or engines; `tests/brainstorm-server/package.json` has one dependency (`ws@^8.22.0`) pinned at 8.22.0 with an integrity hash in a v3 lockfile; no git or URL dependency, wildcard range or end-of-life runtime. No advisory data exists for any dependency.
- **osint: incomplete.** The only git remote is a local filesystem path, not a GitHub repository, so there is no owner/repository for the Dependabot and secret-scanning alert queries. The confirming calls `gh repo view --json nameWithOwner` (guardrail: "gh repo is not on the hunt read allow-list") and `git remote get-url origin` (permission denied) never ran. osv-scanner is absent. Platform alerts, advisory feeds and fingerprint searches were not checked. This is not a clean result. `ws` is the canonical package name; no typosquat signal.
- **secrets-supply-chain: partly incomplete.** The git-history check never ran: `git log`, `git show` and `git ls-files` were denied, so a secret removed from the tree but still in history was not looked for. The tree read found no live secret. The pinned action SHAs could not be compared with upstream because `gh api` was denied.
- **code, trees not fully read:** `docs/` (markdown), about 750 files under `tests/`, `assets/ultrapowers-small.svg` (structural check only), and in the ai-surface lane the skill bodies other than autopilot, brainstorm-task, new-task and team-memory, the preflight scripts and most of `qa-shell-writes.mjs`.

## Declined to judge

- The 19 verifiers listed above returned no block (spend limit); the High and Medium findings other than the Hermes one carry no verdict.
- Code 5, 7 and 8 and ai-surface were re-dispatched once after the first session exit. They then returned. Code 2, code 3 and secrets-supply-chain reports were summarised by the coordinator; no block is held by the gate for them.
- Whether Hermes runs natively on Windows, how Antigravity and Kimi resolve hook paths, and whether an explicit `--mcp-config` file skips the project MCP approval were not visible from the repository.

## Discarded leads (at least 23)

- code 1: `qa.auth.recipe` / `qa.containers` config consumed outside scope (below the floor); Codex marketplace `source.url './'` is local; ticket ids cannot name another path.
- code 4: the contract-only ban on running project scripts (see Medium item 9); SVG assets show no script, handler or external reference (structural check on the large file).
- code 5: hook timeout fail-open (no concrete command); `hooks-cursor.json` relative path (cwd unknown); `dotnet list package` MSBuild evaluation (unconfirmed).
- code 6: `shellcheck --external-sources` in CI (confidence 4); leading-dash filenames (2); `.version-bump.json` paths (3); `.tmp` file mode loss (not a flaw); `sed -i` on a symlink (2).
- ai-surface: playwright `disallowedTools` naming (no gap, denied by pattern); unauthenticated remote MCP servers (injection channel only); pinned `npx -y` without lockfile hash (supply-chain hardening); read-only GitHub MCP bearer token (intended); brainstorm server (sound); Odoo HTML escaping (sound); suite commands run unsandboxed (inherent); `npm test` allows in the template settings (common convention); `loadSecretsFile` (documented).
- osint: `ws` name (no typosquat signal, below the floor).
- Rejected by a verifier: none.

## Files read (counts)

Per hunter, as reported; the full list for the hunters whose blocks are held verbatim is in `security-findings.json`.

- dependencies: 3; osint: 4; code 1: 13; code 4: 29 (25 are git-ignored `.remember` bookkeeping files); code 6: 8 plus 6 empty `.gitkeep` files; ai-surface: about 70 files or file ranges.
- code 2, code 3, code 5, code 7, code 8, secrets-supply-chain: file lists not relayed to the gate.

## Tools used

| Tool | Version | Command | Exit |
|---|---|---|---|
| npm (dependencies hunter, tests/brainstorm-server) | 11.16.0 | `npm audit --package-lock-only --json` (first with output redirected to a temp file, then without) | not run: guardrail deny, then permission denial |
| npm (dependencies hunter, repository root) | 11.16.0 | `npm audit --package-lock-only --json` (same two attempts) | not run: guardrail deny, then permission denial |
| npm (gate, repository root) | 11.16.0 | `npm audit --package-lock-only --json` | 1 (ENOLOCK: root has no lockfile) |
| npm (gate) | 11.16.0 | `npm audit --package-lock-only --json --prefix tests/brainstorm-server` | not run: guardrail deny (`--prefix`) |
| gh (osint hunter) | 2.86.0 | `gh repo view --json nameWithOwner` | not run: guardrail deny (not on the hunt read allow-list) |
| git (osint hunter) | n/a | `git remote get-url origin` | not run: permission denied |
| git (secrets-supply-chain hunter, as relayed) | n/a | `git log`, `git show`, `git ls-files` | not run: denied |
| gh (secrets-supply-chain hunter, as relayed) | 2.86.0 | `gh api` to compare the pinned action SHAs | not run: denied |
| pip-audit, cargo-audit, osv-scanner | absent | none | none |
| dotnet | 10.0.204 | not applicable (no .NET project) | none |
