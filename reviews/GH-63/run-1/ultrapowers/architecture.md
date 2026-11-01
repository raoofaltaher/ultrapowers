# Architecture: ultrapowers at 058c1da, scoped run dev..GH-63-cloudflare-engine (quick)

## 1. Product, principals, authority, protected resources

Ultrapowers is a skills plugin for coding agents (`AGENTS.md`, `package.json:3-5`). GH-63 replaces the vulnerability hunt's engine with Cloudflare's vendored security-audit skill and changes the hunt's scripts, guardrail profile, prompts and the task-review verdict.

Principals:
- **The developer** (the human partner) runs a hunt and commits its report. Trusted.
- **The hunt's coordinating agent and its subagents** (hunters, verifiers, tool lanes). Lower trust: they read untrusted repository text and can be prompt-injected. By design they read the project, write only `reviews/<id>/` and `.ultrapowers/`, run only listed programs, and run project code only through `hunt-sandbox.mjs run` (`hooks/qa-guardrail:755-800,904-912`; `hooks/lib/qa-shell-writes.mjs:1153-1256,1399-1402`).
- **The audited tree.** Untrusted data: files, file names, git history, manifests, `.agents/ultrapowers.json`, `.gitleaks.toml` of the audited branch.
- **The research subagent (STEP 0b).** Has the session's tools and no guardrail; its only project input is the preflight's sanitized DECLARED rows (`hunt-preflight.mjs:105-145,162-170`).

Protected resources: host files outside the write area; key material and secrets (never printed or hashed); the host and network (target code must not reach them); the integrity of the verdict in `SECURITY-REPORT.md` and `TASK-REVIEW.md`, which gates merges; the run record that switches the guardrail on (`.ultrapowers/runs/`); and the sandbox log (`.ultrapowers/sandbox/`).

## 2. Comparable baseline

No source-grounded comparable beyond the vendored Cloudflare skill itself (`skills/vulnerability-hunt/cloudflare/PROVENANCE.md:3`).

## 3. Stack, deployment, offline limits

Plain ESM and CJS JavaScript on Node 22+, bash and Markdown, with zero runtime dependencies and no build step. The plugin is installed per harness. The guardrail is a bash PreToolUse hook (`hooks/qa-guardrail`) with node helpers (`hooks/lib/qa-shell-writes.mjs`, `hooks/lib/guard-paths.mjs`). The sandbox is a local Docker container started by `hunt-sandbox.mjs` (`--network none`, `--read-only`, `--cap-drop=ALL`, `no-new-privileges`, user 65534, limits; `hunt-sandbox.mjs:126-143`).

For this run the sandbox is **unavailable** (no `hunt.sandbox` in `.agents/ultrapowers.json`), so no target code runs and no local check exists. Candidates that need an observed result stay `needs_validation`. Tests exist offline (`tests/vulnerability-hunt/run-tests.sh`), but nothing may run outside the sandbox.

## 4. Entry surfaces and source-to-sink paths

- **Hook event JSON → guardrail decision** (`hooks/qa-guardrail:352-560` → `qa-shell-writes.mjs:3240-3249`). The command text, paths, globs and URLs that a model sends are judged against the hunt allow-list. New in range: gitleaks verbs and flags (`qa-shell-writes.mjs:898-958`, `--redact=1..100`), the own-script rule whose arguments are not judged (`:1160,1233-1256`), and the key-material rule shared through `guard-paths.mjs:180-181`.
- **`.agents/ultrapowers.json` → scripts.**
  - `repos[].path` is resolved with no containment check (`hunt-preflight.mjs:564`, `hunt-sandbox.mjs:325`), then walked, and becomes the Docker bind source.
  - `ticketPattern` goes to `new RegExp` (`hunt-preflight.mjs:533`, `assemble-review.mjs:236`).
  - `hunt.sandbox.images` and `limits` have no ceiling (`hunt-sandbox.mjs:62-72`).
- **Tree file names and contents → preflight output → agents.**
  - DECLARED rows go to the unguarded research subagent (`hunt-preflight.mjs:136-170`).
  - `printable` escapes only control characters, backticks and `$(` in SCOPE `file:` lines (`:614-646`).
  - `changedFiles` runs `git diff` with refs from `review-preflight.sh`, no `--`, and no `-z` (`:501-509,580`).
- **Agent CLI arguments → sandbox runner.** `--inputs`, `--env` values and command words; the mount strings in `dockerArgs` are comma-joined (`hunt-sandbox.mjs:126-143,270-294`). Masks are `maskPaths` (`:115-121`). The artifact is written then logged by SHA-256, and `verify` matches it (`:317-398`).
- **Agent-written records → verdict.**
  - `loadRun` takes the highest `run-N` (`hunt-verdict.mjs:192-211,254-331`).
  - It trusts `run_status`, `tool-lanes.json`, `research.json` and gitleaks reports by shape (`:234-252,349-385,530-533`).
  - Provenance is checked only for `method: local` and is off in `assemble-review.mjs:254`.
  - Markdown cells escape only `|` and newlines (`hunt-verdict.mjs:40-46`).
  - `assemble-review.mjs` places findings JSON into `TASK-REVIEW.md` unescaped and reads the first `Verdict:` line (`:38-40,61-85,139-161`).
- **Contract and prompts → agent behavior** (`agents/vulnerability-hunter.md`, `skills/vulnerability-hunt/SKILL.md`, `prompts/*.md`): which agent gets which tools and inputs, the run record lifecycle, and the research step before the guardrail.
- **Vendored files → in-process `require`** (`hunt-verdict.mjs:27-28` loads `validate-*.cjs`), with per-file SHA-256 in `PROVENANCE.md`.

## 5. Trust boundaries and strongest source-visible control

| Boundary | Strongest control |
|---|---|
| Agent tool call → host | Hunt allow-list and write confinement in the guardrail; deny on parse failure; unknown tools denied (`qa-guardrail:797-799`) |
| Agent → secret values | `--redact` required on gitleaks; key-material path rule; sandbox `redact()` |
| Target code → host | Docker flags and masks; empty environment; credential-looking `--env` names refused |
| Agent records → verdict | Shape checks, size and symlink checks, provenance for local checks |
| Tree text → research subagent | `safeCell`/`PLAIN_SUBJECT`/`plainVersion` filters |
| Guarded agent → run record | `MARKER_RE` protects `.ultrapowers/(runs\|sandbox)`; `run-records start` refused inside a run |

Deployment facts outside source: harness delivery of every PreToolUse event and its 30 s timeout behavior; Docker engine enforcement; gitleaks' `--redact=<n>` semantics for the installed version; and whether the audited branch's config is attacker-chosen.

## 6. Starting paths

- `hooks/qa-guardrail`
- `hooks/lib/qa-shell-writes.mjs`
- `hooks/lib/guard-paths.mjs`
- `skills/vulnerability-hunt/scripts/` (all four)
- `skills/task-review/scripts/assemble-review.mjs`
- `agents/vulnerability-hunter.md`
- `skills/vulnerability-hunt/SKILL.md`
- `skills/vulnerability-hunt/prompts/`
- `skills/vulnerability-hunt/cloudflare/`
- `templates/.agents/ultrapowers.json.tmpl`

## 7. Prior coverage

No earlier `run-*/ultrapowers/` ledger exists for GH-63, so nothing is carried or excluded. Earlier audits (`reviews/audit-2026-10-11`, `audit-2026-10-23`) are other ids with incompatible scope; they are not used as coverage.

Out of scope but relied on (unchanged in range):
- `hooks/lib/run-records.mjs`
- `hooks/lib/resolve-tool.mjs`
- `skills/task-review/scripts/review-preflight.sh`
- `post-review.mjs`

## 8. Companion selection

- **`AI-AND-LLM.md`**: agents act on model-produced tool arguments behind a deterministic guardrail, and an unguarded research subagent consumes tree-derived rows.
- **`CLOUD-AND-DEPLOYMENT.md`**: container isolation of target code by `hunt-sandbox.mjs`.
- **`SUPPLY-CHAIN-AND-RELEASE.md`**: vendored third-party files loaded in-process.
- **Excluded:**
  - `WEB-PROTOCOL-AND-AUTH`, `CLIENT-SIDE` and `PROTOCOLS-RPC-AND-MESSAGING`: no HTTP, browser or RPC surface in scope.
  - `MEMORY-SAFETY-AND-BINARY`: no native code.
  - `DATA-ISOLATION-AND-LIFECYCLE`: no multi-tenant store.
  - `DESKTOP-MOBILE-AND-LOCAL-IPC`: the hook's stdin is the harness's own channel, not a lower-trust IPC peer.
  - `RESOURCE-EXHAUSTION-AND-AVAILABILITY`: only same-user local effects.
