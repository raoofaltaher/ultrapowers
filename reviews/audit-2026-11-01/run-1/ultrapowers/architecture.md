# Architecture: ultrapowers (audit-2026-11-01, run-1, profile quick)

## 1. Product, principals, authority, protected resources

A skills plugin for coding agents (version 2.3.0, `package.json:3`): a `skills/` library, a session-start bootstrap, a PreToolUse guardrail and one adapter per harness (Claude Code, Codex, Cursor, Copilot CLI, Droid, Qwen, Devin, OpenCode, Pi, Kimi, Antigravity, Hermes, Muse, Gemini). It runs on a developer's machine inside the developer's harness session; it is not a deployed service. Node built-ins and bash only (AGENTS.md Rule 1).

Principals: the developer (trusted operator); the agent and its subagents during a QA run, a vulnerability hunt or an autopilot stage (lower trust, held by the guardrail); ticket and issue authors (untrusted text the engine ingests: `skills/new-task/scripts/fetch-ticket.mjs`, `skills/autopilot/scripts/autopilot.mjs`); tracker members who can label (`ready`, `approve`: `autopilot-lib.mjs:466-492`); the content of a repository under audit or QA (files, manifests, memory, test suites; untrusted for the hunt); MCP peers (judged by name, `hooks/qa-guardrail:700-755`); other local processes and browser pages that reach the loopback brainstorm server (`skills/brainstorming/scripts/server.cjs`); fork PR authors in CI (`.github/workflows/ci.yml:3-10`).

Protected resources: the developer's credentials (`~/.ssh`, `~/.aws`, gh/glab logins, `GH_TOKEN`, Odoo API key, `.agents/mcp-secrets.env`); the run's own envelope (run records `.ultrapowers/runs/`, sandbox log `.ultrapowers/sandbox/`, autopilot marker and state, `.agents/ultrapowers.json`, hooks); the developer's repositories and branches (push, commit); tracker state (comments, labels, PRs); the verdict files (`reviews/<ID>/`).

## 2. Comparable baseline

A fork of the upstream <old-name> skills plugin (AGENTS.md:17); the hunt engine is Cloudflare's security-audit skill stored byte for byte (`skills/vulnerability-hunt/cloudflare/PROVENANCE.md`). A PreToolUse allow/deny hook is the same pattern as harness permission rules: a deny-list over a shell grammar is a known weak class (parser differentials between the checker and bash). Calibration only.

## 3. Stack, deployment paths, offline limits

Node ESM/CJS, bash, one TypeScript extension (`.pi/extensions/ultrapowers.ts`), Python only in tests. No build; tests listed in AGENTS.md and `.github/workflows/ci.yml`. Hook registrations: `hooks/hooks.json` (PreToolUse `*`, timeout 30 s, through `hooks/run-hook.cmd`), `hooks/hooks-cursor.json`, `hooks/hooks-codex.json`, root `hooks.json` (Antigravity: `node hooks/lib/guardrail-cli.mjs`), Kimi/Hermes/Muse manifests; in-process injectors `.opencode/plugins/ultrapowers.js` and `.pi/extensions/ultrapowers.ts` call `hooks/lib/guardrail-bridge.mjs`. Bounded execution: only `hunt-sandbox.mjs run` (Docker, `--network none`, read-only target at `/target`, tmpfs `/scratch`, user 65534, caps dropped, 512m/128 pids/120 s; image `node@sha256:4b15...` with bash 5.2, node 22, grep, sed, tr; no git, no jq). Evidence is only the runner's redacted stdout artifact; scratch files are never promoted. `ws` is not installed, so the brainstorm-server suite cannot run offline.

## 4. Entry surfaces and source-to-sink paths

- Guardrail: harness tool-call JSON on stdin → `hooks/qa-guardrail` (root discovery from cwd, `ULTRAPOWERS_RUN_DIR`, top-level `cwd`/`workspace_roots`, lines 204-312) → run record pick (`hooks/lib/run-records.mjs` `pickRun`) → profile rules: file/MCP/URL tools (`qa-guardrail:668-1005`), shell commands (`hooks/lib/qa-shell-writes.mjs`, hunt list at 1150-1255) → allow or deny.
- Run records: `run-records.mjs start|end|list|pick`; `end` needs only a `Verdict:` line (`:159-176`); the guardrail lets a run call `start`, `end`, `list`.
- Hunt: `hunt-preflight.mjs` reads the audited repository (DECLARED rows feed the STEP 0b research prompt); `hunt-sandbox.mjs run` (masks, env-name filter, inputs confinement, redaction, hash log); `hunt-verdict.mjs` renders `SECURITY-REPORT.md` from records.
- Autopilot: ticket text and labels → stage prompts for headless harnesses with permission prompts bypassed (`harnesses.mjs:19-118`, FAIL_OPEN_ON_ERROR for kimi, gemini, qwen, droid) → engine commits, guarded push (`repos.mjs:86-98, 309-316`, `pushAllowed` `autopilot-lib.mjs:729-733`), tracker writes (`tracker.mjs`, `odoo.mjs`).
- Tickets: `fetch-ticket.mjs` (gh/glab/MCP, `linkFetchable` `:217-236`), `ticket-lib.sh`, `scaffold-task.sh` → `tasks/<id>/` files.
- Task review: `post-review.mjs --post` → tracker comments, Odoo attachments, guarded push of `reviews/<ID>/`.
- Brainstorm companion: loopback HTTP+WebSocket (`server.cjs:100`, key `:123-145`, `isAuthorized` `:328-340`, WS Origin `:364-370`, `/files/*` `:291-304, 409-421`, `BRAINSTORM_OPEN_CMD` exec `:537`).
- Init: `skills/init/scripts/init.mjs` writes `templates/` into a project (settings allow-lists, pre-commit hook, AGENTS.md importers).
- Session context: `hooks/session-start`, `team-memory-*` inject the bootstrap and project memory into the model context.
- CI and repo hooks: `.github/workflows/ci.yml` (`pull_request`, `contents: read`, SHA-pinned actions, `npm ci`), `.githooks/pre-commit` (gitleaks, Docker fallback).

## 5. Trust boundaries and strongest source-visible control

- Agent → host during a run: the guardrail profiles; fail-closed when a run is active and bash/node are missing (`qa-guardrail:322-326`, `run-hook.cmd:43-78`); bridge fails closed on timeout (`guardrail-bridge.mjs:321-325`); harness timeout behaviour is a deployment fact.
- Agent → its own envelope: `MARKER_RE`/`PROTECTED_RE` (`qa-guardrail:674-686`), `startRun` refusals (`run-records.mjs:120-150`).
- Target code → host: the Docker sandbox flags and masks (`hunt-sandbox.mjs:115-144`).
- Ticket text → actions: approval verification and frozen config snapshot (`autopilot.mjs:97-110`), push scope.
- Browser/local process → brainstorm server: 32-byte key, HttpOnly SameSite=Strict cookie, constant-time compare.
- Fork PR → CI: `pull_request` trigger, read-only token.

## 6. Starting paths

`hooks/`, `hooks/lib/`, `.opencode/plugins/`, `.pi/extensions/`, `skills/vulnerability-hunt/scripts/`, `skills/autopilot/scripts/`, `skills/new-task/scripts/`, `skills/task-review/scripts/`, `skills/brainstorming/scripts/`, `skills/init/scripts/`, `templates/`, `skills/qa-specialist/scripts/`, `skills/qa-lane-6-suites/scripts/`, `skills/*/scripts/` (helpers), `.github/workflows/ci.yml`, `.githooks/pre-commit`, `scripts/`.

## 7. Prior coverage

Three prior hunts exist (`reviews/audit-2026-10-11/`, `reviews/audit-2026-10-23/`, `reviews/audit-2026-10-23-pre-fix/`), written by the replaced hunter: no Cloudflare coverage ledger, so none is compatible and none suppresses or excludes current work. They reported the guardrail and run-record subsystems as the main defect class; the guardrail, run records and the whole hunt engine (sandbox runner, preflight, verdict) changed since (commits 7dc2c5e, 76a163e, 7f565a3, 739f9e0). No same-source confirmed exclusions.

## 8. Companion selection

- `AI-AND-LLM.md`: ticket text, repository content and memory enter model contexts that hold tool authority (autopilot stages, hunt research rows, session-start memory).
- `SUPPLY-CHAIN-AND-RELEASE.md`: CI on pull requests, plugin hooks and the init payload installed into other projects.
- `DESKTOP-MOBILE-AND-LOCAL-IPC.md`: the loopback brainstorm server reachable by other local processes; the guardrail as a local policy helper.
- `CLIENT-SIDE.md`: the brainstorm companion's browser page, WebSocket and served HTML.
- `CLOUD-AND-DEPLOYMENT.md`: the hunt's Docker container isolation (host capability exposure, secret exposure across the workload boundary).
- Not selected: `WEB-PROTOCOL-AND-AUTH.md` (no deployed web service; the companion's auth is a local key, covered by IPC and client-side), `PROTOCOLS-RPC-AND-MESSAGING.md` (Odoo JSON-RPC is an outbound client only), `MEMORY-SAFETY-AND-BINARY.md` (no native code), `RESOURCE-EXHAUSTION-AND-AVAILABILITY.md` (single-user local tools), `DATA-ISOLATION-AND-LIFECYCLE.md` (no multi-tenant store).
