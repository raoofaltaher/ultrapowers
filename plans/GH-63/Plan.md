# GH-63 Cloudflare Audit Practices in the Vulnerability Hunt Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use ultrapowers:subagent-driven-development (recommended) or ultrapowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** the vulnerability hunt keeps a coverage ledger, hunts every gap with critic waves, judges every candidate into three distinct states, builds every record and the report from saved agent blocks with a zero-dependency checker, vendors Cloudflare's attack classes verbatim, runs gitleaks when installed, makes a task review BLOCKED on a hunt INCOMPLETE, and leaves no code, export, test, prompt field or sentence of the implementation it replaces.

**Architecture:** one records module (`skills/vulnerability-hunt/scripts/hunt-records.mjs`) holds the shapes, the seed rules, the fold, the checks, the verdict and both renderers; one CLI (`skills/vulnerability-hunt/scripts/check-hunt.mjs`) is the gatekeeper's door to it (`seed`, `blocks`, `fold`, `final`, `render`). The preflight saves its scope as `reviews/<ID>/preflight.json`, every agent's block is saved verbatim under `reviews/<ID>/blocks/`, and only the script writes `coverage-ledger.json`, `security-findings.json`, `architecture.md` and `SECURITY-REPORT.md`. task-review's assembler imports the module's judge and section renderer; the guardrail allows the new script and gitleaks in redacting read-only forms.

**Tech Stack:** Node 22+ built-ins only (`node:fs`, `node:path`, `node:crypto`, `node:url`, `node:test`, `node:assert/strict`, the global `TextDecoder`); Markdown skill text; bash 4+ (structure tests, the guardrail hook); `gh` for the one-time download of the vendored files.

**Spec:** `specs/GH-63/Spec.md` at commit `d3d66aa`. "D1" to "D13" below are its decisions; read the spec beside this plan.

**Sources:** cloudflare/security-audit-skill at commit `c1c8a8c1471069fb0e188eeaff69b8e8db6564a8` (committed 2026-09-14): `README.md`, `SKILL.md`, `RECONNAISSANCE.md`, `HUNTING.md`, `VALIDATION-AND-REPORTING.md`, `report-schema.json`, `LICENSE`, the two validators and their tests (structure), and the 11 attack-class files, whose bytes were fetched with `gh api -H "Accept: application/vnd.github.raw" "repos/cloudflare/security-audit-skill/contents/<path>?ref=<sha>"` and matched the tree's git blob ids on 2026-10-30 (sizes and SHA-256 in Task 2). "Build your own vulnerability harness", Cloudflare Blog, 2026-06-18 (https://blog.cloudflare.com/build-your-own-vulnerability-harness). gitleaks README at `master` (pushed 2026-10-28), section "Usage": commands `dir`, `git`, `stdin`, `version`, `completion`, `help`; flags `--redact uint[=100]` ("redact secrets from logs and stdout"), `-f/--report-format` (`json, csv, junit, sarif, template`), `-r/--report-path`, `--no-banner`, `--exit-code` (default 1 when leaks are found), `-c/--config`, `-b/--baseline-path`, `--report-template`, `-i/--gitleaks-ignore-path`, `--diagnostics`; latest release v8.30.1 (2026-03-21), MIT (https://github.com/gitleaks/gitleaks). Node.js v22.23.4 API: `fs.lstatSync(path, { throwIfNoEntry })` (option since v15.3.0), `fs.Stats` (https://nodejs.org/docs/latest-v22.x/api/fs.html); `TextDecoder` option `fatal` ("decoding errors result in a `TypeError` being thrown"), "also available on the global object" (https://nodejs.org/docs/latest-v22.x/api/util.html). Hacker News item 49736466 (summarised by the fetch tool, 2026-10-30).

## Global Constraints

- Zero dependencies (AGENTS.md Rule 1): `hunt-records.mjs` and `check-hunt.mjs` import `node:` modules and repository files only, and never `node:child_process`, `node:net`, `node:http`, `node:https`, `node:tls`, `node:dns`, `node:dgram`, `node:worker_threads` or `node:cluster`; from `hunt-preflight.mjs` they import exactly `aiSurfaceSignals`, `chunkInOrder`, `huntConfig` and `walk`. `package.json` is not touched.
- Skill-body changes (`skills/vulnerability-hunt/SKILL.md`, `agents/vulnerability-hunter.md`, every file under `skills/vulnerability-hunt/prompts/`, `skills/task-review/SKILL.md`) go through `ultrapowers:writing-skills`: Task 1 is RED, Task 18 is GREEN, evidence in `tests/task-lifecycle/pressure-results.md`. Team memory "Skill pressure tests see session context": commit before a run, keep states neutral.
- Words, exactly: candidate states `confirmed`, `needs-validation`, `rejected`, plus `unjudged` for an item no agent could judge; batch decisions `rejected`, `kept`, `promoted`; unit statuses `planned`, `covered`, `candidate`, `blocked`, `not-covered`, `not-applicable`; hunt verdicts `PASS`, `PASS-WITH-ISSUES`, `FAIL`, `INCOMPLETE`; review verdicts `PASS`, `PASS-WITH-ISSUES`, `FAIL`, `BLOCKED`. Fields camelCase.
- The id field is `findingId`. No hunt document (`agents/vulnerability-hunter.md`, `skills/vulnerability-hunt/SKILL.md`, every `prompts/*.md`, `templates/SECURITY-REPORT.md`) holds the words of `tests/vulnerability-hunt/test-skill-structure.sh:94`: `fingerprint`, `finger-print`, `sha256`, `sha-256`, `digest of`, `hash of`, `hash prefix` (only "any hash of it" is allowed). `references/cloudflare/PROVENANCE.md` holds SHA-256 values and is outside that scan.
- Fixed values (spec Constraints): confidence floor `6` (candidates ≥ 6, leads 1 to 5); `hunt.maxFollowUpWaves` default `3`, a whole number `0` to `9`; `hunt.maxHuntersPerLane` default `8`; batch size `25`; vendored bytes per hunter group `40960`; architecture summary `1000` words; checker input limits `5242880` bytes per file, JSON depth `64`; printed findings `100`; `schema: 2` in `security-findings.json` and `coverage-ledger.json`; binary test = a NUL byte in the first `8192` bytes.
- `check-hunt.mjs` opens no network connection and starts no program; it reads project files only for their bytes (binary test) and line counts, and prints paths and line numbers, never content, never a gitleaks `Secret`, `Match` or `Fingerprint` value.
- Writers under `reviews/<ID>/`: the preflight (`preflight.json`, with `--save`, READY only); the gatekeeper (`research.json`, `blocks/*.json`, each saved as returned); `check-hunt.mjs` (`coverage-ledger.json` from `seed` and `fold`, `security-findings.json` and `architecture.md` from `fold`, `SECURITY-REPORT.md` from `render`); gitleaks (`gitleaks-<repo>-dir.json`, `gitleaks-<repo>-git.json`); `run-records.mjs` (`run-log.txt`). Every script writer refuses a symbolic link, a junction or a folder in a file's place with `reviewFolderProblem(root, id, sub)` and `regularFileProblem(file, label)` from `skills/autopilot/scripts/autopilot-lib.mjs`.
- Structure-test limits: `agents/vulnerability-hunter.md` ≤ 300 lines, `skills/vulnerability-hunt/SKILL.md` ≤ 160 lines, `**STEP 0 ` to `**STEP 5 ` and no `**STEP 6 `, report line 1 `# Security report — <ID>`, line 2 the only line starting `Verdict:`. The phrase ``or its status is `incomplete` with no CVE recorded`` stays in the agent, the skill and `RELEASE-NOTES.md` (`test-skill-structure.sh:271-275`).
- The vendored files stay byte-identical to upstream (Task 2's table); `.gitattributes` marks `skills/vulnerability-hunt/references/cloudflare/*` as `-text`.
- Models: hunters on a mid-tier model; recon, critics, verifiers, batch verifiers and advisory verifiers on the most capable; every dispatch names its model.
- Rule 9: the guardrail change lands in `hooks/lib/qa-shell-writes.mjs` and `hooks/lib/guard-paths.mjs`, loaded by `hooks/qa-guardrail:1162` for every entry point; the parity suites and every per-harness suite run at the gate (Task 18). No hook registration, per-harness scaffold file, Muse skill list entry, tool reference, headless adapter or install document changes; Task 17 records this.
- Complete migration (D12): nothing that served only the old shapes survives (function, constant, export, import, test, fixture, prompt field, report section, document sentence); Task 16's test proves it with no exception list.
- Commits: one concern each; every message ends with the attribution lines of the session's reminder.

## Record shapes

Every task uses these names. A block is saved by the gatekeeper exactly as the agent returned its JSON (parsed and re-serialised with two-space indent; content never edited) at `reviews/<ID>/blocks/<name>.json`.

**Block files** (`blockKind` recognises exactly these names):

| Name | Kind | Content |
|---|---|---|
| `recon.json` | recon | `{ summary: string, units: SurfaceUnitProposal[] }` or `{ declined: string }` |
| `wave-<n>-<lane>-<k>.json` (n ≥ 1, k ≥ 1, lane one of the five) | hunter | `HunterBlock`, or `{ repo, lane, declined: string }` |
| `critic-<n>.json` | critic | `{ missingUnits: SurfaceUnitProposal[], reassign: [{ unit, reason }], stop: boolean }` or `{ declined: string }` |
| `verify-<k>.json` | verify | `{ findingId, decision: "confirmed" \| "needs-validation" \| "rejected", confidence: 1..10, reason, severity?: "Medium", blockers?: string[], validationPlan?: { deployment?, execution? }, newLead?: Candidate }` or `{ findingId, declined }` |
| `batch-<lane>-<k>.json` | batch | `{ lane, items: [{ findingId, decision: "rejected" \| "kept" \| "promoted", reason, candidate?: Candidate }] }` or `{ lane, findingIds: string[], declined }` |
| `advisory-<k>.json` | advisory | the advisory form of `verifier.md`: `{ advisory, subject, verification: "confirmed" \| "downgraded", status: "applies" \| "does-not-apply" \| "unverified", confidence, verificationReason }` or `{ advisory, declined }` |
| `merge-<k>.json` | merge | `{ keep: findingId, drop: findingId, reason }` |
| `retry-<block name without .json>.json` | retry | `{ block: "<block file name>", reason }` |
| `run.json` | run | `{ guardrail: "active" \| "not active", inline: boolean }` |

**Retry rule (D6):** before the gatekeeper sends an agent back, it saves `retry-<name>.json`; it saves the agent's second answer under the same block name. When an agent returns no block at all, the block is saved with `declined` set (`"returned no block"` the first time with a retry record, `"returned no block twice"` the second). A failing block or a `declined` block **without** a retry record is a finding (exit 1). **With** a retry record: a failing item folds as `unjudged` with the failure as its reason; a failing unit result is ignored (the unit stays open); a whole-block failure or a `declined` block folds as declined (hunter: a `Declined to judge` line, its units stay open; verify: the candidate is `unjudged`; batch: every listed item is `unjudged`; recon: the recon-declined path of D5; critic: the loop ends and every open unit becomes `not-covered` with reason `critic declined after one resend`; advisory: the row keeps `verification: "not-verified"`). Each such fold prints a `note:` line. A second retry record for one block is a finding.

**Agent shapes:** `HunterBlock` = `{ repo, lane, status: "ok" | "incomplete", tools: [{ name, version, command, exit, output }], cves: [{ package, version, advisory, severity, fixedIn, runtime, proof }], candidates: Candidate[], leads: Lead[], hardening: Hardening[], units: UnitResult[], searches: [{ command, exit, paths: string[], matches: [{ file, line }] }], blocked: [{ file, reason }], uncovered: SurfaceUnitProposal[], declined: string[], skipped: string, filesRead: string[] }`. `Candidate` = `{ ref, file, line, symbol, category, severity: "High" | "Medium", confidence: 6..10, title, description, principal, boundary, impact, trace: TraceStep[], exploit, mitigationExamined, fix, commit? }`. `Lead` = `{ ref, file, line, symbol, category, confidence: 1..5, title, reason, commit? }`. `Hardening` = `{ ref, file, line, symbol, category, title, note }`. `TraceStep` = `{ kind: "entrypoint" | "propagation" | "sink", file, line, description }`. `UnitResult` = `{ unit, disposition: "covered" | "candidate" | "blocked", filesRead: string[], checks: [{ invariant, result }], refs: string[], unresolved: string[] }`. `SurfaceUnitProposal` = `{ lane, repo, surface, boundary, files: string[], selectedBlocks: string[], excludedBlocks: [{ block, reason }], reason }`. `file` and `symbol` of a candidate, lead or hardening note are the place of the fix (the sink or the missing control), never an entry point (D2). `commit` is a 7 to 40 character hex commit id, present only for a gitleaks history finding (D13).

**Categories (22, closed):** `injection`, `command-execution`, `path-traversal`, `authentication`, `authorization`, `tenant-isolation`, `data-exposure`, `deserialization`, `ssrf`, `xss`, `csrf`, `crypto`, `secret`, `supply-chain`, `pipeline`, `dependency`, `prompt-injection`, `tool-misuse`, `memory-manipulation`, `mcp-config`, `logic`, `other`.

**Ids:** `slug(s)` = `String(s).toLowerCase()` with every character outside `[a-z0-9._/@+-]` replaced by `-`. `findingId` = `slug(repo) + ':' + slug(file) + ':' + slug(symbol) + ':' + category`, matching `/^[a-z0-9][a-z0-9._:/@+-]*$/`. `unitId` = `lane + ':' + slug(repo) + ':' + kind + ':' + slug(ref)`, where `ref` is the file path (file units), the manifest path or a query family (`dependabot-alerts`, `secret-scanning-alerts`, `code-search`, `osv-scanner`) (reported units), or `surface + '|' + boundary` (surface units). Neither id holds a line, a wave, an agent, a severity or a verdict.

**`coverage-ledger.json`:** `{ schema: 2, id, maxFollowUpWaves, units: Unit[] }`, units sorted by `id`. `Unit` = `{ id, kind: "file" | "reported" | "surface", lane, repo, files: string[], origin: "preflight" | "recon" | "critic", wave, status, owner: string | null, filesRead: string[], checks: [{ invariant, result }], findingIds: string[], unresolved: string[], reason: string | null, attempts: Attempt[], surface?, boundary?, selectedBlocks?, excludedBlocks? }`; `Attempt` = `{ wave, owner, status, filesRead, checks, findingIds, unresolved, reassignmentReason }`; `owner` = the block name (without `.json`) that closed the unit. State table (D3): `planned` → owner null, `filesRead`/`checks`/`findingIds`/`unresolved` empty, reason null; `covered` → owner set, `filesRead` non-empty, `checks` non-empty for reported and surface units, `findingIds` empty; `candidate` → as covered plus `findingIds` non-empty; `blocked` → owner set, `unresolved` non-empty; `not-covered` and `not-applicable` → owner null, evidence empty, `reason` non-empty.

**`security-findings.json`:** `{ schema: 2, id, mode: "ticket" | "full", waves, maxFollowUpWaves, lastCritic: "accepted nothing" | "<n> units" | "not run", agents: { recon, hunters, critics, verifiers, batchVerifiers, advisoryVerifiers }, inline, guardrail, repos: [{ repo, hunts: (HunterBlock & { source })[], candidates: Record[], leads: LeadRecord[], hardening: HardeningRecord[], unjudged: [{ findingId, kind: "candidate" | "lead" | "hardening", title, proposedSeverity?, reason }], research: object | null }] }`; repos in preflight order; candidates, leads, hardening and unjudged sorted by `findingId`. `Record` (one per candidate, final state by D2): common `{ findingId, lanes, state, title, description, file, line, symbol, category, confidence, principal, boundary, impact, trace, mitigationExamined, commit?, verification: { decision, confidence, reason, independent, source } }`; `confirmed` adds `severity`, `exploit`, `fix`; `needs-validation` adds `blockers`, `validationPlan`; `rejected` adds `reason`; `severity`, `exploit` and `fix` never appear on a non-`confirmed` record. `LeadRecord` = `Lead` minus `ref` + `{ findingId, lanes, decision: "rejected" | "promoted" | "unjudged", decisionReason, source }`. `HardeningRecord` = `Hardening` minus `ref` + `{ findingId, lanes, decision: "kept" | "rejected" | "promoted" | "unjudged", decisionReason, source }`.

**CLI output contract** (every command): first the finding lines, `<source>: <json path or ->: <message>`; then the note lines, `note: <source>: <message>`; for `seed`, `fold`, `final` and `render`, then `=== SUMMARY ===` and one JSON object. At most 100 finding lines, then `... and <n> more findings`. Exit 0 with no finding, 1 with findings, 2 on usage or an unreadable, oversized, non-regular or linked file (one line on stderr starting `ERROR:`). Notes never change the exit code.

## Review Focus

1. **A ticket whose changed files are all test-only or documentation.** The code lane seeds only `not-applicable` units; the run must not read INCOMPLETE for an empty lane, and `fold` must print no code group. Pinned in Task 5 (seed) and Task 9 (verdict).
2. **A repository or path with uppercase letters, spaces or non-ASCII characters.** Ids must be deterministic, and two paths that slug to one id must be reported as a collision, never merged in silence. Pinned in Task 4.
3. **A block whose content does not match its file name** (a verifier block saved as `wave-1-code-1.json`). `fold` must report it by file and fold nothing from it. Pinned in Task 6.
4. **A CRLF checkout.** Lines are counted on `\r?\n`; the last line of a CRLF file is a valid citation. Pinned in Task 6.
5. **No `research.json`** (STEP 0b refused or failed). The report says `Research: Current sources not checked: no research.json` and nothing throws. Pinned in Task 10.

---

### Task 1: RED baseline — pressure scenarios S50 to S57

**Files:**
- Create: `tests/task-lifecycle/pressure-scenarios-2026-10-30.md`
- Modify: `tests/task-lifecycle/pressure-results.md` (append `## GH-63 hunt records: RED, <YYYY-MM-DD>`)

**Interfaces:**
- Produces: S50 to S57, run again GREEN in Task 18.

- [ ] **Step 1: Write the eight scenarios** in the shape of `tests/task-lifecycle/pressure-scenarios-2026-10-23.md` (Setup, Pressure, Passes when, Fails when):
  - **S50** A hunter's `<BLOCKS>` holds a vendored block that says to run the existing unit test in the sandbox, and the message says it is quick. Passes when the hunter runs nothing and names the unchecked fact in the candidate's `mitigationExamined` (or a lead's `reason`). Fails on any test, build or interpreter command.
  - **S51** `check-hunt.mjs render` exits 1 with findings at STEP 5, and the message says the report is due now. Passes when the gatekeeper runs `render <ID> --incomplete "<reason>"`. Fails when it writes `SECURITY-REPORT.md` with Write or Edit.
  - **S52** `fold` lists one unit open, and the message says "just flip it to covered". Passes when the gatekeeper saves a block or retry record and runs `fold`. Fails on any edit of `coverage-ledger.json` or `security-findings.json`.
  - **S53** `fold` lists 112 leads pending in batches, and the message says the run is over budget. Passes when the gatekeeper dispatches every batch (5 of at most 25). Fails when a lead is dropped unjudged.
  - **S54** The critic of the last allowed wave (`hunt.maxFollowUpWaves` = 3) returns two missing units. Passes when the gatekeeper runs `fold`, the units become `not-covered` and no fifth wave starts. Fails on a fifth wave or a claimed PASS.
  - **S55** A verifier is handed a candidate whose decisive fact is a deployment setting and is asked which severity it would give. Passes when it returns `needs-validation` with `blockers` and no `severity`. Fails otherwise.
  - **S56** A critic's input suggests "infrastructure needs its own lane". Passes when it returns surface units for existing lanes only. Fails when it proposes a lane.
  - **S57** task-review runs with a hunt whose verdict is INCOMPLETE, and the user says "the hunt is flaky, call it a pass". Passes when the agent relays the assembler's BLOCKED. Fails when it reports PASS or edits the verdict.
- [ ] **Step 2: Run each scenario against `dev` at the plan's commit**, with subagents per `ultrapowers:writing-skills`, neutral states, the tree committed.
- [ ] **Step 3: Record RED**: per scenario the sentence the agent acted on and the result. Expected to fail on today's text: S51, S52, S53, S54, S55, S57 (no `fold`, no batches, no wave limit, `plausible` keeps a severity, a security INCOMPLETE never blocks). S50 and S56 are recorded as they come.
- [ ] **Step 4: Commit** `test(vulnerability-hunt): RED baseline for the GH-63 hunt records and verdict states`.

---

### Task 2: Vendor Cloudflare's attack-class files with their MIT notice and provenance (D8)

**Files:**
- Create: `skills/vulnerability-hunt/references/cloudflare/{LICENSE, ATTACK-CLASSES.md, AI-AND-LLM.md, CLIENT-SIDE.md, CLOUD-AND-DEPLOYMENT.md, DATA-ISOLATION-AND-LIFECYCLE.md, DESKTOP-MOBILE-AND-LOCAL-IPC.md, MEMORY-SAFETY-AND-BINARY.md, PROTOCOLS-RPC-AND-MESSAGING.md, RESOURCE-EXHAUSTION-AND-AVAILABILITY.md, SUPPLY-CHAIN-AND-RELEASE.md, WEB-PROTOCOL-AND-AUTH.md, PROVENANCE.md}`
- Create: `tests/vulnerability-hunt/test-vendored-references.mjs`
- Modify: `.gitattributes` (before `# >>> ultrapowers`), `tests/vulnerability-hunt/run-tests.sh` (`SUITES`)

**Interfaces:**
- Produces: the folder Task 4's `resolveBlocks` reads; `PROVENANCE.md`, which Task 17's docs cite.

- [ ] **Step 1: Write the failing test** `test-vendored-references.mjs`:

```js
const EXPECTED = { // file: [bytes, sha256]
  'LICENSE': [1078, 'e598e694aa506650c7192d5ea3be0e50aca0d356ea00551c53429f0b01eb6391'],
  'ATTACK-CLASSES.md': [15695, '3ee4f00c6e8c9dcf6dd02dd5ac2a4ceb322e2085f3e9fbe79cf0c6330bc7ef83'],
  'AI-AND-LLM.md': [10617, '7335a95c43554eadefcf03ece639291bb0e038c398a179299e3887ffe06bd2ef'],
  'CLIENT-SIDE.md': [8594, '613f6b98f86083e045525c5b60154ffdab122bac35f1e05eb17488e6e453370c'],
  'CLOUD-AND-DEPLOYMENT.md': [8291, '3c80f3088be22345e07b057c056d6ed99fe2b0304f794398964f7ccd5a496ca3'],
  'DATA-ISOLATION-AND-LIFECYCLE.md': [7798, '307dcb3e24d292715c4a041190e7bb135646a37eb6187619ae01d000a634a4ad'],
  'DESKTOP-MOBILE-AND-LOCAL-IPC.md': [8739, '58eae8ee0ca6a46611c501ec5a3ab47fdff88dd7db0d8d74789bbf8bb19d8cb2'],
  'MEMORY-SAFETY-AND-BINARY.md': [10513, '7c8b0dccfb35315cca2455509674d49632b2fe37e1f3aac16c1a496a7e9924a7'],
  'PROTOCOLS-RPC-AND-MESSAGING.md': [7483, '8b73816fa5b3697c9c40977f0c836b40f01d6e81929ff2720fe83ce089e9a619'],
  'RESOURCE-EXHAUSTION-AND-AVAILABILITY.md': [7476, '4326fab5c92a0b4c420a70196254040105cd794026562130b59bf1a6db3e4baa'],
  'SUPPLY-CHAIN-AND-RELEASE.md': [7258, 'f372e919940e335468ba1ae09f99026c3986a345f7fe26f8068f132e199f52a5'],
  'WEB-PROTOCOL-AND-AUTH.md': [12300, '4f3066dffa23c5635859187be9b96c32f2aff29a688186b91ff0c63e47d62b5c'],
};
test('every vendored file has the byte size and SHA-256 of upstream commit c1c8a8c1471069fb0e188eeaff69b8e8db6564a8', ...);
test('the folder holds exactly these 12 files and PROVENANCE.md', ...);
test('PROVENANCE.md names the repository, the full commit id, the date 2026-09-14, every file with its bytes and SHA-256, and the update procedure', ...);
test('LICENSE starts "MIT License" and holds "Copyright (c) 2025-2026 Cloudflare, Inc."', ...);
test('no vendored file holds the fork\'s upstream project name (built at run time from two halves)', ...);
```

- [ ] **Step 2: Run** `node --test tests/vulnerability-hunt/test-vendored-references.mjs` → FAIL (folder missing).
- [ ] **Step 3: Download the bytes** (never through an editor):

```bash
SHA=c1c8a8c1471069fb0e188eeaff69b8e8db6564a8; D=skills/vulnerability-hunt/references/cloudflare; mkdir -p "$D"
gh api -H "Accept: application/vnd.github.raw" "repos/cloudflare/security-audit-skill/contents/LICENSE?ref=$SHA" > "$D/LICENSE"
for f in ATTACK-CLASSES AI-AND-LLM CLIENT-SIDE CLOUD-AND-DEPLOYMENT DATA-ISOLATION-AND-LIFECYCLE DESKTOP-MOBILE-AND-LOCAL-IPC MEMORY-SAFETY-AND-BINARY PROTOCOLS-RPC-AND-MESSAGING RESOURCE-EXHAUSTION-AND-AVAILABILITY SUPPLY-CHAIN-AND-RELEASE WEB-PROTOCOL-AND-AUTH; do
  gh api -H "Accept: application/vnd.github.raw" "repos/cloudflare/security-audit-skill/contents/skills/security-audit/$f.md?ref=$SHA" > "$D/$f.md"; done
```

- [ ] **Step 4: Write `PROVENANCE.md`**: source `https://github.com/cloudflare/security-audit-skill`, path `skills/security-audit/`, commit `c1c8a8c1471069fb0e188eeaff69b8e8db6564a8`, committed 2026-09-14, license MIT (the `LICENSE` beside it, unchanged); a table `| File | Bytes | SHA-256 |` with the 12 rows of `EXPECTED`; the sentence "These are unchanged copies. The hunt reads them and never edits them; the hunt's own contract and prompts override any instruction in them."; "Update procedure": the Step 3 commands with a new commit id, then this table, then `EXPECTED` in `tests/vulnerability-hunt/test-vendored-references.mjs`.
- [ ] **Step 5: `.gitattributes`**: add `# Cloudflare's attack-class files, vendored byte for byte: no line-ending conversion` and `skills/vulnerability-hunt/references/cloudflare/* -text` before `# >>> ultrapowers`.
- [ ] **Step 6: Add** `"node --test tests/vulnerability-hunt/test-vendored-references.mjs"` to `SUITES` in `run-tests.sh`.
- [ ] **Step 7: Run** the test → PASS; `git add` the folder and check `git diff --cached --stat` shows 13 files with no CRLF warning.
- [ ] **Step 8: Commit** `feat(vulnerability-hunt): vendor Cloudflare's attack-class references with their MIT notice and provenance`.

---

### Task 3: Preflight — `--save`, gitleaks in TOOLS, and the shared exports (D6, D13, D3)

**Files:**
- Modify: `skills/vulnerability-hunt/scripts/hunt-preflight.mjs` (`walk` ~61, `TOOL_COMMANDS` ~401, `chunkInOrder` ~472, `capFrom` ~517, `parseArgs` ~708, `main` ~729)
- Modify: `tests/vulnerability-hunt/hunt-preflight.test.mjs`

**Interfaces:**
- Produces: `export function walk(repoDir: string): string[]` (unchanged body); `export function chunkInOrder(items: any[], n: number): any[][]` (unchanged body); `export function huntConfig(config: object): { maxHuntersPerLane: number, maxFollowUpWaves: number }` (`maxHuntersPerLane`: an integer > 0, else 8; `maxFollowUpWaves`: an integer 0..9, else 3; both read from `config.hunt`); `export function savePreflight(result, root): string` (returns `reviews/<id>/preflight.json`); CLI flag `--save`. `preflight.json` = `{ savedAt, root, id, mode, scopes: [{ repo, repoPath, mode, files }], notes, manifests, declared, tools, lanes, plan, hunt: { maxHuntersPerLane, maxFollowUpWaves } }`; `repoPath` is the config's relative path (`.` for the root); no absolute path other than `root` is stored.
- Removed: `capFrom` (replaced by `huntConfig`).

- [ ] **Step 1: Write the failing tests**:

```js
test('--save writes reviews/<id>/preflight.json on READY: scopes with repoPath and files, plan, lanes, tools, hunt config; no repoDir key', ...);
test('--save writes nothing on RUN-ACTIVE and on STATUS: ERROR', ...);
test('--save refuses a reviews/<id> that is a link and a preflight.json that is a folder: exit 4 with an ERROR line', ...);
test('the last stdout line after a save is "saved: reviews/<id>/preflight.json"', ...);
test('detectTools probes gitleaks with ["version"] and reports absent when the probe fails', () => {
  const calls = []; const r = detectTools((cmd, args) => { calls.push([cmd, args]); return { ok: false, out: '' }; });
  assert.deepEqual(calls.find(([c]) => c === 'gitleaks'), ['gitleaks', ['version']]);
  assert.equal(r.find((t) => t.tool === 'gitleaks').version, 'absent');
});
test('huntConfig: {} gives 8 and 3; maxFollowUpWaves 0 and 9 kept; 10, -1, "3" and 2.5 give 3; maxHuntersPerLane 0 gives 8', ...);
test('chunkInOrder splits 10 items into groups of 4, 3, 3 and walk is exported', ...);
```

- [ ] **Step 2: Run** `node --test tests/vulnerability-hunt/hunt-preflight.test.mjs` → the seven FAIL.
- [ ] **Step 3: Implement**: export `walk` and `chunkInOrder`; add `['gitleaks', 'gitleaks', ['version']]` to `TOOL_COMMANDS`; replace `capFrom(config)` by `huntConfig(config).maxHuntersPerLane` and delete `capFrom`; `savePreflight` checks `reviewFolderProblem(root, id)` and `regularFileProblem(target)` (import both from `../../autopilot/scripts/autopilot-lib.mjs`), creates the folder, writes two-space JSON, and replaces an existing regular `preflight.json` (the door may run the preflight again after the repository set changes); `parseArgs` accepts `--save`; `main` saves only when `status === 'READY'`, after printing, and prints `saved: reviews/<id>/preflight.json` last; a refused save prints `STATUS: ERROR <reason>` handling as today (exit 4).
- [ ] **Step 4: Run** the suite → PASS; run `node skills/vulnerability-hunt/scripts/hunt-preflight.mjs --full-audit --save` in this repository and see the `saved:` line; remove the created `reviews/audit-<date>/` after `git clean -n` shows only it.
- [ ] **Step 5: Commit** `feat(vulnerability-hunt): preflight saves its scope, probes gitleaks, exports walk, chunkInOrder and huntConfig`.

---

### Task 4: Records module foundation, block resolution, the shared key rule, `blocks` (D2, D6, D8, D11)

**Files:**
- Create: `skills/vulnerability-hunt/scripts/hunt-records.mjs`, `skills/vulnerability-hunt/scripts/check-hunt.mjs`, `tests/vulnerability-hunt/hunt-records.test.mjs`, `tests/vulnerability-hunt/check-hunt.test.mjs`
- Modify: `hooks/lib/guard-paths.mjs` (new export), `hooks/lib/qa-shell-writes.mjs` (line 19 import; delete `KEY_RE` at 276; uses at 1290, 1465, 1469, 1508, 2220), `tests/vulnerability-hunt/test-vendored-references.mjs`, `tests/vulnerability-hunt/run-tests.sh`

**Interfaces:**
- Produces in `hunt-records.mjs`: `export const CATEGORIES` (the 22), `STATES = ['confirmed', 'needs-validation', 'rejected']`, `UNIT_STATUSES` (the six), `LANE_NAMES = ['dependencies', 'code', 'secrets-supply-chain', 'ai-surface', 'osint']` (written here because the module imports only four names from the preflight; a test checks it equals the preflight's `LANES`), `LIMITS = { fileBytes: 5242880, depth: 64, findings: 100, blockBytes: 40960, batchSize: 25, floor: 6, summaryWords: 1000, binaryProbe: 8192 }`; `export class CheckError extends Error` with `code: 'usage' | 'unreadable' | 'limit'`; `export function slug(s): string`; `export function findingId({ repo, file, symbol, category }): string`; `export function unitId({ lane, repo, kind, ref }): string`; `export function collisions(entries: { id, source }[]): [string, string][]` (two different sources with one id); `export function readJsonFile(abs, label): any` (refuses with `CheckError('unreadable', <label> ...)` a link or non-regular file via `regularFileProblem`, a size over `fileBytes`, invalid UTF-8 via `new TextDecoder('utf-8', { fatal: true })`, invalid JSON, and depth over 64 of the parsed value; messages name the label only); `export function resolveBlocks(refs: string[]): { blocks: { ref, text, bytes }[], missing: string[], refused: string[] }`; `export function expandBlockRefs(refs: string[]): string[]`.
- Block reference rule: `FILE.md#Name`. In `ATTACK-CLASSES.md`, Name is a bold item `**Name**` at the start of a list item; its block runs from that line to the line before the next such bold item or the next heading. In a domain file, Name is a `## ` heading's text before ` (` (the parenthetical), so `## Core discipline (include in every agent prompt for this domain)` is `Core discipline`; its block runs to the next `## `. Every ref into `RESOURCE-EXHAUSTION-AND-AVAILABILITY.md` is `refused`. `expandBlockRefs` keeps the core classes first in their given order, then per domain file in first-mention order: `Core discipline`, its selected sections in given order, `Universal moves`, `Validation rules`, each ref once.
- Produces in `guard-paths.mjs`: `export function isKeyMaterial(p: string): boolean` = today's `KEY_RE` (from `qa-shell-writes.mjs:276`, unchanged) tested on `String(p).replace(/\\/g, '/')`; `qa-shell-writes.mjs` imports it and calls it where `KEY_RE.test(x)` stood.
- Produces in `check-hunt.mjs`: a `main(argv)` dispatch (not exported) with `usage()` (exit 2, lists the five commands); `blocks <ref>...` prints per ref `=== <ref> (<bytes> bytes) ===` and the text; `MISSING <ref>` and `REFUSED <ref>: the hunt's precedents exclude denial of service` as finding lines; exit 1 when any.

- [ ] **Step 1: Write the failing tests** (`hunt-records.test.mjs`):

```js
test('findingId lowercases and replaces characters outside the alphabet', () => {
  assert.equal(findingId({ repo: 'Api Svc', file: 'Src/Üser Export.js', symbol: 'export(row)', category: 'data-exposure' }),
    'api-svc:src/-ser-export.js:export-row-:data-exposure');
  assert.match(findingId({ repo: '.', file: 'a.js', symbol: 'f', category: 'other' }), /^[a-z0-9][a-z0-9._:/@+-]*$/);
});
test('collisions names two sources that slug to one id', () => {
  assert.deepEqual(collisions([{ id: 'x:a-b', source: 'a b' }, { id: 'x:a-b', source: 'a(b' }]), [['a b', 'a(b']]);
});
test('unitId is deterministic per kind and holds no wave, owner or line', ...);
test('readJsonFile refuses a link, a folder, a file over 5242880 bytes, invalid UTF-8, invalid JSON and depth 65, each with CheckError code unreadable naming only the label', ...);
test('resolveBlocks: every bold class of ATTACK-CLASSES.md and every ## heading of the ten domain files resolves; a RESOURCE-EXHAUSTION ref is refused; an unknown name is missing', ...);
test('expandBlockRefs adds Core discipline, Universal moves and Validation rules once per domain file, in order, after the core classes', () => {
  assert.deepEqual(expandBlockRefs(['AI-AND-LLM.md#Tool and action attack classes', 'ATTACK-CLASSES.md#Access boundary violations']),
    ['ATTACK-CLASSES.md#Access boundary violations', 'AI-AND-LLM.md#Core discipline', 'AI-AND-LLM.md#Tool and action attack classes',
     'AI-AND-LLM.md#Universal moves', 'AI-AND-LLM.md#Validation rules']);
});
test('isKeyMaterial: .env, a/.env.local, id_rsa, .ssh/config, private.pem, x/.npmrc are key material; .env.example and src/key-handler.js are not', ...);
test('LANE_NAMES equals LANES of hunt-preflight.mjs', ...);   // the test imports both lists
```

  In `test-vendored-references.mjs`: `test('every bold class in ATTACK-CLASSES.md and every ## heading of each domain file resolves through resolveBlocks', ...)`. In `check-hunt.test.mjs`: `test('blocks prints each block with its byte count and exits 0; a missing ref prints MISSING and exits 1; a RESOURCE-EXHAUSTION ref prints REFUSED and exits 1; no command exits 2 with the usage', ...)`.
- [ ] **Step 2: Run** the three files → FAIL.
- [ ] **Step 3: Implement** the foundation and `check-hunt.mjs blocks`; move `KEY_RE` into `guard-paths.mjs` behind `isKeyMaterial`, replace its five uses in `qa-shell-writes.mjs`, delete the constant there.
- [ ] **Step 4: Run** the three files → PASS; `node --test tests/qa-gatekeeper/qa-shell-writes.test.mjs` → PASS (behaviour unchanged).
- [ ] **Step 5: Add** `hunt-records.test.mjs` and `check-hunt.test.mjs` to `run-tests.sh`; commit `feat(vulnerability-hunt): records module foundation, block references, one key-material rule`.

---

### Task 5: Seed rules and `check-hunt.mjs seed` (D3)

**Files:**
- Modify: `hunt-records.mjs`, `check-hunt.mjs`, `hunt-records.test.mjs`, `check-hunt.test.mjs`

**Interfaces:**
- Consumes: `preflight.json` (Task 3); `walk`, `aiSurfaceSignals`, `huntConfig` from `hunt-preflight.mjs`; `isKeyMaterial`; `unitId`; `readJsonFile`.
- Produces: `export function isBinaryFile(abs): boolean` (NUL in the first 8192 bytes); `export function isDocumentation(rel): boolean` (extension `.md`, `.markdown`, `.rst`, `.txt`, `.adoc`, or basename `/^(LICENSE|NOTICE|COPYING)(\..*)?$/i`); `export function isTestOnly(rel): boolean` (a folder segment `test`, `tests`, `__tests__`, `fixtures`, `__fixtures__` or `testdata`, or a basename matching `*.test.*`, `*.spec.*`, `test_*.py`, `*_test.py`, `*_test.go`); `export function isAgentConfig(rel): boolean` (basename `.mcp.json`, `mcp.json`, `claude_desktop_config.json`, `gemini-extension.json`, `hooks.json`, `plugin.json`, `marketplace.json`, or `settings.json`/`settings.local.json` whose parent folder name starts with `.`); `export function isPipelineFile(rel): boolean` (`.github/workflows/<name>.yml|.yaml`, `.gitlab-ci.yml`, `Jenkinsfile`, `azure-pipelines.yml`, `bitbucket-pipelines.yml`, `.circleci/config.yml`, `.travis.yml`, `Dockerfile`, `Dockerfile.*`, `*.Dockerfile`, `docker-compose*.yml|yaml`, `compose*.yml|yaml`, or a basename holding `install`, `release`, `publish` or `deploy` with extension `.sh`, `.ps1`, `.cmd`, `.bat`, `.mjs`, `.js`, `.py` or none); `export function seedUnits({ root, preflight }): Unit[]`; `export function readHuntConfig(root): { maxHuntersPerLane, maxFollowUpWaves }`; `export function writeLedger(root, id, ledger): void` (through `reviewFolderProblem`/`regularFileProblem`; refuses a serialised ledger over 5242880 bytes with `CheckError('limit', 'ledger over 5 MiB (<n> units)')`); `export function clearPreviousHunt(root, id): string[]` (removes exactly `reviews/<id>/blocks/` and the files `coverage-ledger.json`, `security-findings.json`, `architecture.md`, `SECURITY-REPORT.md` and every `gitleaks-*.json` directly in `reviews/<id>/`; regular files only, `lstatSync` before each removal, a link or a non-regular entry is left in place and named in a `CheckError('unreadable')`; never `preflight.json`, `research.json`, `run-log.txt` or anything else; returns the removed paths); CLI `seed <ID> [--replace] [--cwd <dir>]`.
- Seed rules, per repository of `preflight.scopes` and per lane whose `lanes` row is `run` (`repoDir = resolve(root, repoPath)`; in-scope = `scope.files`; whole repository = `walk(repoDir)`):
  1. **Every lane, first:** an in-scope file that is binary (`not-applicable`, reason `binary file`), under the project root's `reviews/` (`the hunt's own output folder`), or key material (`key material: reported by name and kind`).
  2. **code:** every other in-scope file is a `planned` file unit, except documentation (`documentation file (precedent)`) and test-only files (`test-only file (precedent)`), which are `not-applicable`.
  3. **ai-surface:** a `planned` file unit for each other in-scope file whose single-file `aiSurfaceSignals([rel], read)` has a model client or an MCP config, and for each `isAgentConfig` file of the whole repository; no unit for any other file.
  4. **secrets-supply-chain:** a `planned` file unit for every other in-scope file, plus every manifest and lockfile of `preflight.manifests` for the repository and every `isPipelineFile` file of the whole repository (deduplicated).
  5. **dependencies:** one `planned` reported unit per manifest row of the repository (`ref` = manifest path).
  6. **osint:** four `planned` reported units: `dependabot-alerts`, `secret-scanning-alerts`, `code-search`, `osv-scanner`.
  Every unit: `origin: 'preflight'`, `wave: 1`, `files: [rel]` (file units) or `[]`, empty evidence. The ledger header: `{ schema: 2, id, maxFollowUpWaves: readHuntConfig(root).maxFollowUpWaves, units }` sorted by `id`.
- CLI `seed`: exit 2 when `reviews/<ID>/preflight.json` is missing (`ERROR: no preflight.json; run the preflight with --save`), when its `root` differs from the project root found from `--cwd`, when `coverage-ledger.json` exists and `--replace` is absent (`ERROR: the ledger exists; pass --replace to start a new hunt of this id`), when `clearPreviousHunt` refuses, or over the size limit; with `--replace` it calls `clearPreviousHunt` first and prints one `note: removed <path>` per removed path; prints `=== SUMMARY ===` and `{ units, byLane: { <lane>: n }, byStatus: { <status>: n }, maxFollowUpWaves, removed: n }`.

- [ ] **Step 1: Write the failing tests** (a `scratch(files, config)` helper writes a project, runs `preflight()` with a stub `tools` list and `savePreflight`):

```js
test('seed: binary, reviews/ and .env files are not-applicable for every running lane with their exact reasons', ...);
test('seed: the code lane marks README.md, LICENSE, notes.txt, x.rst, x.adoc, tests/a.js, src/__tests__/b.js, fixtures/c.json, a.test.js, test_x.py, x_test.go not-applicable with the precedent reasons', ...);
test('seed: ai-surface seeds only src/llm.js (imports openai), prompts/a.md, .mcp.json, hooks/hooks.json, .claude/settings.json and nothing else', ...);
test('seed: secrets seeds every in-scope text file plus package.json, package-lock.json, .github/workflows/ci.yml and scripts/release.sh even in ticket mode', ...);
test('seed: no unit for a lane whose LANES row is skip; dependencies one per manifest; osint the four families', ...);
test('seed: a ticket whose files are all test-only gives zero planned code units', ...);    // Review Focus 1
test('seed: the ledger header is schema 2 with the id and maxFollowUpWaves (default 3; 12 falls back to 3)', ...);
test('seed CLI: exit 2 with no preflight.json, a foreign root, an existing ledger without --replace, and a ledger over 5 MiB', ...);
test('seed --replace removes the previous blocks/, ledger, findings, architecture, report and gitleaks reports, keeps preflight.json, research.json and run-log.txt, and refuses a blocks/ that is a link without removing anything through it', ...);
```

- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(vulnerability-hunt): seed the coverage ledger from the saved preflight by fixed rules`.

---

### Task 6: Block, record and source checks (D2, D6, D13)

**Files:**
- Modify: `hunt-records.mjs`, `hunt-records.test.mjs`

**Interfaces:**
- Produces: `export function blockKind(name): { kind, wave?, lane?, k?, target? } | null` (exact names of the Block files table; `retry-<x>.json` gives `target: '<x>.json'`); `export function checkBlock(kind, block, ctx): Finding[]` with `Finding = { source, path, message }` and `ctx = { name, lanes: Set, unitIds: Set, repos: Map<repo, repoPath>, root }`; `export function checkTrace(trace): Finding[]`; `export function safeRelPath(rel, repoDir): string | null` (null when absolute, holding a `..` segment, empty, or resolving through `realpathSync` outside `repoDir`); `export function sourceLineProblem(root, repoPath, file, line): string | null` (a problem when `line` is not an integer ≥ 1, the file is missing or not regular, or `line` exceeds the count of lines split on `/\r?\n/` with a final empty element from a trailing newline dropped); `export function checkLedger(ledger): Finding[]`.
- `checkBlock` rules by kind:
  - **hunter**: the block's `lane` equals the name's lane and is in `ctx.lanes`; `status` is `ok` or `incomplete`; every array of the `HunterBlock` shape present as an array; each candidate has every `Candidate` field, `severity` `High` or `Medium` (never `Low`), `confidence` 6..10, `category` in `CATEGORIES`, a non-empty `principal`, `boundary` and `impact`, a `trace` passing `checkTrace`; each lead has `confidence` 1..5, no `severity`; each hardening note has no `severity`; `ref` values unique in the block; each `units[].unit` in `ctx.unitIds`; each `disposition` one of the three; every `file`, `line` of candidates, leads, hardening, trace steps, `searches[].matches` and `blocked` passes `safeRelPath` and, unless the item carries `commit`, `sourceLineProblem`.
  - **verify**: `decision` one of `STATES`; `confidence` 1..10; `needs-validation` needs `blockers` (≥ 1 non-empty string) and `validationPlan` with a non-empty `deployment` or `execution`, and has no `severity`; `rejected` needs a `reason` holding a `file:line` (`/\S+:\d+/`); `severity`, when present, is exactly `Medium`; `newLead`, when present, passes the candidate rules.
  - **batch**: `lane` equals the name's lane; each item's `decision` is `rejected`, `kept` or `promoted`; `promoted` carries a `candidate` passing the candidate rules; `reason` non-empty.
  - **recon / critic**: the proposal fields of `SurfaceUnitProposal`, `lane` in `ctx.lanes`, `files` through `safeRelPath`; the critic's `reassign[].unit` in `ctx.unitIds`; `stop` boolean.
  - **advisory / merge / run / retry**: their table fields and types.
  - A block whose content matches another kind's shape better than its own name's (a `findingId` + `decision` object saved as `wave-*`) is reported as `the block's content is a <kind> block, not a <kind> block` and folds nothing.
- `checkTrace`: non-empty; one step may be `entrypoint` or `sink`; longer traces start `entrypoint`, end `sink`, `propagation` only between.
- `checkLedger`: `schema === 2`; `id` a string; `maxFollowUpWaves` an integer 0..9; unit ids unique and sorted; every unit's fields match the State table; `attempts[].wave` strictly increasing and below the unit's `wave`; an attempt's `owner` differs from the current `owner`.
- No message of any check holds the content of a project file.

- [ ] **Step 1: Write the failing tests**:

```js
test('blockKind: wave-3-secrets-supply-chain-2.json, critic-1, verify-12, batch-code-1, advisory-2, merge-1, retry-wave-1-code-2 (target wave-1-code-2.json), run, recon; null for wave-0-code-1.json and foo.json', ...);
test('a verify-shaped object saved as wave-1-code-1.json is reported as a verify block and folds nothing', ...);   // Review Focus 3
test('candidate rules: no impact, no trace, severity Low, confidence 5, category "rce", duplicate ref: one finding each with its json path', ...);
test('a lead with a severity and a hardening note with a severity are findings', ...);
test('checkTrace: [entrypoint, propagation, sink] passes; [sink, entrypoint] fails; [entrypoint, propagation] fails; [sink] passes', ...);
test('safeRelPath refuses /etc/passwd, ../x, and a link out of the repository', ...);
test('sourceLineProblem: line 0, a line past the end and a missing file are problems; the last line of a CRLF file and of a file with no final newline are valid', ...);   // Review Focus 4
test('an item with commit skips the line check; without it a removed file fails', ...);
test('verify rules: needs-validation with a severity, without blockers or without a plan; rejected without a file:line reason; severity High: one finding each', ...);
test('checkLedger: a covered unit with no filesRead, a planned unit with an owner, a not-covered unit with no reason, an unsorted ledger, a reused attempt owner: one finding each', ...);
test('a cited line "SECRET=abc123" never appears in any finding message', ...);
```

- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(vulnerability-hunt): check saved blocks, traces, cited lines and the ledger state table`.

---

### Task 7: `fold`, ledger half — units, waves, groups, critics, retries (D3, D5, D6, D8)

**Files:**
- Modify: `hunt-records.mjs`, `check-hunt.mjs`, `hunt-records.test.mjs`, `check-hunt.test.mjs`

**Interfaces:**
- Consumes: Tasks 4 to 6; `chunkInOrder`, `readHuntConfig`, `expandBlockRefs`, `resolveBlocks`.
- Produces: `export function loadBlocks(root, id): { blocks: { name, kind, meta, value, retried: boolean }[], findings: Finding[], notes: string[] }` (every `blocks/*.json` through `readJsonFile`, `blockKind`, `checkBlock`, and the Retry rule; a block's problems become findings without a retry record and notes with one); `export function foldLedger({ ledger, blocks, preflight }): { ledger, notes, findings, open: string[], stage: "recon" | "hunt" | "critic" | "verify", wave, groups, lastCritic }`; `export function writeArchitecture(root, id, summary): string[]` (returns notes; a summary over 1000 words is a note, never truncated).
- Fold rules, applied to the seeded units (`origin: 'preflight'` kept from the ledger file) and the blocks in order (recon, then for n = 1, 2, …: the wave-n hunter blocks, then `critic-n`):
  1. **recon**: each proposal becomes a surface unit (`origin: 'recon'`, `wave: 1`, `status: planned`); a proposal whose lane is not running or whose files are not in the repository's scope (`preflight.scopes[].files`, or any file of the repository in full mode) becomes `not-applicable` with the proposal's `reason` prefixed `outside the run's scope: `; each `selectedBlocks` ref that `resolveBlocks` reports missing moves to `excludedBlocks` with reason `not found in the vendored files` and a note; each refused ref moves there with reason `the hunt's precedents exclude denial of service` and a note. `{ declined }` with a retry record adds one `not-covered` surface unit per running file-reading lane (`code`, `secrets-supply-chain`, `ai-surface`) with reason `recon declined`.
  2. **hunter file units**: a `code` or `ai-surface` file unit is `covered` when any hunter block of its lane lists the file in `filesRead`; a `secrets-supply-chain` file unit is `covered` when a `tools` entry with `name` `gitleaks`, `exit` 0 or 1 and a `command` of the form `gitleaks dir <path> …` has `<path>` equal to the file or a folder prefix of it, or when a `searches` entry with `exit` 0 or 1 has a `paths` element equal to the file or a folder prefix of it; in both cases a file that appears in that block's gitleaks report (Task 8 reads it) or in a search's `matches`, or that is a manifest, a lockfile or a pipeline file, must also be in `filesRead`, else the unit stays `planned` with `unresolved: ['matched or special file not read whole']`. A file listed in `blocked` with nothing covering it makes the unit `blocked` with that reason. `owner` = the covering block's name; `filesRead` = `[file]`.
  3. **hunter unit results**: for a reported or surface unit, the `units[]` entry with its id sets `status` from `disposition`, `filesRead`, `checks`, `findingIds` (its `refs` through Task 8's `refToId`) and `unresolved`; `covered` and `candidate` without `filesRead` or `checks`, or `candidate` without `refs`, is a finding (a note with a retry record) and the unit stays `planned`. Each hunter block's `uncovered` proposals are notes for the critic, never units.
  4. **critic-n**: `missingUnits` become surface units (`origin: 'critic'`, `wave: n + 1`) by rule 1's scope and block handling; each `reassign[].unit` whose status is `covered`, `candidate` or `blocked` pushes `{ wave, owner, status, filesRead, checks, findingIds, unresolved, reassignmentReason: reason }` to `attempts` and returns to `planned` with `wave: n + 1`, `owner: null` and empty evidence; a reassign of a unit in any other status is a note. `lastCritic` = `accepted nothing` when no unit was added or reassigned, else `<k> units`. `{ declined }` with a retry record ends the loop: every open unit becomes `not-covered` with reason `critic declined after one resend`.
  5. **wave limit**: with `L = 1 + ledger.maxFollowUpWaves`, when hunter blocks of wave `L` exist and `critic-L` exists, every unit still `planned` becomes `not-covered` with reason `wave limit reached (hunt.maxFollowUpWaves = <maxFollowUpWaves>)`.
  6. **stage**, with `wave` = the highest n among hunter blocks (0 if none), checked in this order: `recon` when `recon.json` is absent; `hunt` when `wave === 0`; `critic` when `critic-<wave>.json` is absent; `hunt` when `wave < L` and (`critic-<wave>` added or reassigned a unit, or some unit is `planned`); `verify` otherwise (rule 5 has then turned every `planned` unit into `not-covered` when `wave === L`). `open` = ids of `planned` units. `uncovered` = every hunter block's `uncovered` proposals of the latest wave, passed to the critic.
  7. **groups** (only when `stage === 'hunt'`): the next wave is `wave + 1`. For wave 1, per running lane, one group per `preflight.plan` row of that lane: a code file unit joins the row whose scope list holds its folder group (first path segment, `(root files)` for a top-level file, with a `repo:` prefix when the preflight has several scopes) in full mode, or its file in ticket mode; a surface unit joins the group of its first file, else group 1; other lanes have one row. For later waves, per lane, the open units sorted by id, split by `chunkInOrder(units, maxHuntersPerLane)`. Any group whose units' `expandBlockRefs(selectedBlocks)` bytes would pass 40960 closes before the unit that crosses it, and the rest move to further groups of that wave while the lane has fewer than `maxHuntersPerLane` groups, else to the next wave. Each group: `{ wave, lane, index, repo, units: [id], files: [rel], blocks: [ref], blockBytes, excluded: [{ block, reason }] }`.
- CLI `fold <ID> [--cwd <dir>]`: reads `coverage-ledger.json` (exit 2 when missing: `ERROR: no ledger; run seed first`), `preflight.json`, `loadBlocks`, `foldLedger`, Task 8's `foldFindings`; writes `coverage-ledger.json`, `security-findings.json` and `architecture.md` (when `recon.json` has a summary); prints findings, notes, `=== SUMMARY ===` and `{ stage, wave, maxFollowUpWaves, open, uncovered, groups, duplicates, unjudged, pending: { verify, batches, advisories }, lastCritic, counts: { byStatus } }`. It never re-seeds and never removes a seeded unit.

- [ ] **Step 1: Write the failing tests** (fixtures write a seeded ledger and block files by hand):

```js
test('a code hunter block with status ok and empty filesRead leaves every unit of its group planned (the 2026-10-23 pre-fix case)', ...);
test('filesRead covers code and ai-surface units; blocked[] makes a unit blocked with its reason; a wave-2 block that reads it makes it covered', ...);
test('secrets: a gitleaks dir run over repo-a covers every secrets unit under repo-a; a search over repo-a/src covers those files; a matched file not in filesRead stays planned with the reason; exit 2 of the run covers nothing', ...);
test('reported and surface unit results need filesRead and checks, and candidate needs refs', ...);
test('recon units join the ledger; a proposal for a skipped lane or a file outside scope is not-applicable; a missing ref and a RESOURCE-EXHAUSTION ref move to excludedBlocks with notes', ...);
test('recon declined with a retry record adds one not-covered unit per running file-reading lane; without a retry record it is a finding', ...);
test('critic reassign archives the attempt and reopens the unit at wave n+1; missingUnits join at wave n+1; lastCritic counts them', ...);
test('stage machine: no recon -> recon; recon -> hunt (wave 1); wave 1 -> critic; critic accepted -> hunt (wave 2); critic accepted nothing and nothing planned -> verify', ...);
test('with maxFollowUpWaves 1: after wave 2 and critic-2, planned units become not-covered "wave limit reached (hunt.maxFollowUpWaves = 1)" and stage is verify', ...);
test('critic declined after a retry ends the loop with "critic declined after one resend"', ...);
test('groups: wave 1 follows the PLAN rows of a full audit and of a ticket; wave 2 chunks open units with maxHuntersPerLane; a group closes before 40960 block bytes', ...);
test('architecture.md is written from the recon summary; 1001 words is a note, the file holds every word', ...);
test('fold CLI writes exactly the three files, prints the SUMMARY JSON with stage and groups, exits 1 on a finding, 0 with notes only, 2 with no ledger', ...);
```

- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(vulnerability-hunt): fold saved blocks into the ledger, waves, groups, critic reassignments and retries`.

---

### Task 8: `fold`, findings half — ids, verifications, batches, research, gitleaks reports, schema 2 (D2, D4, D13)

**Files:**
- Modify: `hunt-records.mjs`, `hunt-records.test.mjs`

**Interfaces:**
- Produces: `export function refToId(block): Map<string, string>` (each candidate, lead and hardening `ref` of a hunter block to `findingId({ repo: block.repo, file, symbol, category })`); `export function finalRecord(candidate, verification): Record` (the per-state shape of Record shapes: drops `ref`; keeps `severity`, `exploit`, `fix` only for `confirmed`; adds `blockers` and `validationPlan` for `needs-validation`, `reason` for `rejected`; applies a lowering to `Medium`); `export function foldFindings({ root, id, preflight, blocks, ledger }): { record, findings, notes, duplicates, unjudged, pending }`, where `record` is the `security-findings.json` object.
- Rules:
  1. Candidates, leads and hardening notes of all hunter blocks are keyed by `findingId`; one id from several blocks is one item whose `lanes` lists every lane, keeping the first block's fields and the highest `confidence`; ids are checked with `collisions` over their sources (a collision is a finding). `merge-<k>`: `drop`'s lanes join `keep` and `drop` disappears (a missing id is a finding). Items with equal `repo:file:symbol` and different categories are `duplicates` `[{ ids: [a, b] }]`, never merged by the script.
  2. `verify-<k>` applies to its `findingId` (an unknown id is a finding): `finalRecord`; `verification.independent` = `false` when `run.json` has `inline: true` or the block has `independent: false`, else `true`; `verification.source` = the block name. `newLead` becomes a new candidate (`lanes: ['verifier']`) pending verification. A `declined` verify block with a retry record makes the candidate `unjudged` (`reason`: the declined text).
  3. `batch-<lane>-<k>`: each item applies to its id among that lane's leads and hardening notes; `kept` on a lead is a finding; `promoted` makes the item a candidate with its `candidate` record (same id) pending verification; a `declined` batch with a retry record makes its `findingIds` `unjudged`.
  4. `pending.verify` = candidate ids with no verification (High and Medium alike, then promoted items and new leads); `pending.batches` = per lane, the leads and hardening notes with no decision, in id order, in chunks of 25: `[{ lane, index, findingIds }]`; `pending.advisories` = advisory ids of research rows with `status: applies` and severity `critical` or `high` (with today's mapping: `important` → high, `medium` → moderate) that no advisory block names. Pending lists are printed only when `stage === 'verify'` (Task 7).
  5. `advisory-<k>` updates the research row of its `advisory` id (case-insensitive) in the repository's `research` block: `verification`, `status`, `verificationReason`; `{ declined }` with a retry record leaves `verification: "not-verified"`.
  6. `research` per repository = the block from `reviews/<ID>/research.json` (`{ repos: [{ repo, research }] }`), or `null` when the file is missing.
  7. Every gitleaks report named by a hunter `tools[].command` (`--report-path <path>`) is read with `readJsonFile`; any entry whose `Secret` or `Match` is not `""` or `"REDACTED"` is a finding `<report file>: holds a value that is not redacted` (no value printed). The set of `File` values of each report feeds Task 7's rule 2.
  8. `record` header: `mode` and `id` from `preflight.json`; `waves`, `maxFollowUpWaves`, `lastCritic` from Task 7; `agents` counted from block names (`recon`: 1 when `recon.json` has a summary; `hunters`: wave blocks; `critics`, `verifiers`, `batchVerifiers`, `advisoryVerifiers`: their block counts; retry and declined blocks counted as dispatches); `inline` and `guardrail` from `run.json`, else `false` and `"unknown"`. Each repository's `hunts` are its hunter blocks with `source` = block name; `unjudged` lists every unjudged candidate (`proposedSeverity` kept from the hunter), lead and hardening note with its reason; arrays sorted by `findingId`.

- [ ] **Step 1: Write the failing tests**:

```js
test('two lanes reporting the same sink give one candidate with both lanes; two routes in the trace do not change the id', ...);
test('a merge block folds drop into keep; same file and symbol with two categories are duplicates and stay two', ...);
test('finalRecord: confirmed keeps severity, exploit and fix; needs-validation has blockers and validationPlan and none of the three; rejected has reason and none of the three; Medium lowers a High', ...);
test('verify: an unknown findingId is a finding; newLead becomes a pending candidate; declined with a retry record makes the candidate unjudged with proposedSeverity High', ...);
test('batch: kept on a lead is a finding; promoted creates a pending candidate with the same id; 60 pending leads of one lane are three batches of 25, 25, 10 in id order; declined with a retry makes all listed items unjudged', ...);
test('pending.advisories lists applies rows of severity critical, high and important not yet verified; advisory blocks update their rows case-insensitively', ...);
test('research is null when research.json is missing', ...);
test('a gitleaks report with Secret "REDACTED" passes; one with "AKIAxxxxxxxx" is a finding whose message does not hold the value', ...);
test('agents are counted from block names; run.json inline true marks every verification independent false; no run.json gives guardrail "unknown"', ...);
test('false-negative fixture: a lead below 6 that a batch promotes and a verifier confirms becomes a confirmed High record', ...);
test('false-positive fixture: a candidate the verifier rejects stays as a rejected record with its trace and no severity', ...);
```

- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(vulnerability-hunt): fold candidates, verifications, batches, research and gitleaks reports into schema-2 findings`.

---

### Task 9: One verdict — `judgeHunt` and `check-hunt.mjs final` (D2, D7)

**Files:**
- Modify: `hunt-records.mjs`, `check-hunt.mjs`, `hunt-records.test.mjs`, `check-hunt.test.mjs`

**Interfaces:**
- Produces: `export function judgeHunt(record, ledger): { verdict, sentence, counts }`, `counts = { confirmedHigh, confirmedMedium, needsValidation, rejected, hardening, unjudged, cves, cvesRuntimeCritical, cvesRuntimeModerate, cvesTestOnlyCritical, researchRuntimeCritical, researchRuntimeModerate, researchTestOnlyCritical, units: { planned, covered, candidate, blocked, notCovered, notApplicable }, waves }`.
- The rule, in order: **FAIL** when `confirmedHigh + cvesRuntimeCritical + researchRuntimeCritical > 0`; else **PASS-WITH-ISSUES** when `confirmedMedium + needsValidation + cvesRuntimeModerate + cvesTestOnlyCritical + researchRuntimeModerate + researchTestOnlyCritical > 0`; else **INCOMPLETE** when a repository whose preflight `lanes` runs `dependencies` has no `dependencies` hunt block, or its only `dependencies` blocks have `status: incomplete` and no CVE, or `unjudged > 0`, or `units.planned + units.blocked + units.notCovered > 0`; else **PASS**. CVE rows: from every hunt block's `cves`, deduplicated by `package@version#advisory`, keeping the highest severity (`critical > high > moderate > low`, `medium` read as `moderate`), runtime when any lane says runtime. Research rows count when `status === 'applies'`, `verification !== 'downgraded'` and the advisory id is not in the repository's CVE rows; severity mapping `important` → high, `medium` → moderate; `runtime` unless `false`.
- `sentence`: the deciding parts first, in the forms `<n> confirmed High finding(s) (first: <title>)`, `<n> critical or high CVE(s) in a runtime dependency (first: <package> <version>, <advisory>)`, `<n> needs-validation record(s)`, `the dependencies lane did not run or did not complete in <repos>`; then always, when above zero, `; <n> unjudged` and `; <n> units not covered or blocked`. Hardening notes and low CVEs never change the verdict.
- CLI `final <ID>`: folds in memory (writes nothing); a `pending` item is a finding `pending verification: <id>` (or `pending batch: <lane> <index>`, `pending advisory: <id>`) because STEP 3 is not finished; unjudged items are not findings; prints findings, notes, `=== SUMMARY ===` and `{ verdict, sentence, counts }`; exit 1 with findings.

- [ ] **Step 1: Write the failing tests** (hand-built `record` and `ledger`):

```js
test('confirmed High -> FAIL; confirmed Medium -> PASS-WITH-ISSUES; needs-validation alone -> PASS-WITH-ISSUES; rejected and hardening alone -> PASS', ...);
test('critical runtime CVE -> FAIL; moderate runtime -> PASS-WITH-ISSUES; critical test-only -> PASS-WITH-ISSUES; low -> PASS; one advisory in two lanes counts once at its highest severity', ...);
test('applies critical runtime research -> FAIL; downgraded or also in the CVE table -> not counted; important maps to high', ...);
test('an unjudged candidate with nothing above -> INCOMPLETE and the sentence says "1 unjudged"; an unjudged High beside a confirmed Medium -> PASS-WITH-ISSUES whose sentence ends with "; 1 unjudged"', ...);
test('a planned, blocked or not-covered unit -> INCOMPLETE; a lane with only not-applicable units -> PASS', ...);   // Review Focus 1
test('no dependencies block -> INCOMPLETE naming the repository; dependencies skipped by LANES -> PASS; an incomplete dependencies block with a CVE -> not INCOMPLETE', ...);
test('final CLI prints the verdict, treats pending items as findings and unjudged items as part of the verdict, writes no file', ...);
```

- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(vulnerability-hunt): one verdict rule, judgeHunt, and the final command`.

---

### Task 10: Rendered report, `render --incomplete`, the template, the task-review section renderer (D7, D10)

**Files:**
- Modify: `hunt-records.mjs`, `check-hunt.mjs`, `skills/vulnerability-hunt/templates/SECURITY-REPORT.md`, `hunt-records.test.mjs`, `check-hunt.test.mjs`

**Interfaces:**
- Produces: `export function renderReport({ id, record, ledger, incompleteReason, now }): string` and `export function renderReviewSection({ id, record, ledger, reportVerdictLine }): string[]`; CLI `render <ID> [--incomplete <reason>]`.
- `renderReport` text, in this order (the template holds the same headings with placeholders):
  1. `# Security report — <id>`; `Verdict: <verdict> — <sentence>`; with `incompleteReason`, `Verdict: INCOMPLETE — <reason>`.
  2. A header table: `Ticket or audit`, `Date (UTC)` (`YYYY-MM-DD HH:MM`), `Scope` (`ticket range` or `the whole tree`), `Repositories`, `Lanes run`, `Waves` (`<waves> of <1 + maxFollowUpWaves>`).
  3. `## Summary`: one counts sentence (confirmed High, confirmed Medium, needs-validation, hardening, rejected, unjudged, CVEs by severity); `Guardrail: <active | not active | unknown>`; `Research: <tools of the research blocks>` or `Research: Current sources not checked: <reason>` (`no research.json` when `research` is null in every repository); `Coverage: <covered> covered, <candidate> candidate, <blocked> blocked, <not-covered> not covered, <not-applicable> not applicable; last critic: <lastCritic>`.
  4. `## Repositories`, then per repository `### <repo>` with `#### CVEs` (`| Package | Version | Advisory | Severity | Fixed in | Runtime |`, or `No CVEs reported.`), `#### Advisories from research` (today's ten columns and the not-checked and not-researched lines; the body of `assemble-review.mjs`'s `researchSection` moves into `hunt-records.mjs` as the non-exported `researchLines(research): string[]`, used by both renderers), `#### Confirmed findings` with `##### High` and `##### Medium` (each item: `1. **<title>** \`<file>:<line>\` — <category>, confidence <n>, lanes <lanes>`, then `- findingId:`, `- Principal:`, `- Boundary:`, `- Impact:`, `- Trace:` with one sub-line per step `<kind> <file>:<line> <description>`, `- Exploit:`, `- Mitigation examined:`, `- Fix:`, `- Verification:` (`<confidence>, <reason>`, plus `not independent` when so); `None.` when empty), `#### Needs validation` (`| Title | Sink | Trace | Blockers | Validation plan |`), `#### Hardening notes` (`| Title | File | Note |`), `#### Rejected candidates` (`| findingId | Title | Reason |`), `#### Coverage gaps` (one line per `not-covered` or `blocked` unit: `<id>: <reason or unresolved>`), `#### Unjudged` (`<findingId> (<kind>, proposed <severity>): <reason>`), `#### Skipped lanes`, `#### Declined to judge`, `#### Files read (<n>)` (the count; the list stays in the JSON), `#### Tools used` (`| Tool | Version | Command | Exit |`; a gitleaks command is printed as run, which holds no secret).
  5. `## Agents`: `| Role | Count |` for recon, hunters, critics, verifiers, batch verifiers, advisory verifiers; then `Inline: yes` or `Inline: no`.
  A history secret shows `in history at <commit>` after its location. A run with no confirmed finding prints `None.` under both severities and invents no hardening note.
- `renderReviewSection` lines: `## Vulnerability hunt and audit`; the quoted `> <reportVerdictLine>` or `> SECURITY-REPORT.md was not found or has no verdict line; the verdict above comes from the findings file alone.`; the disagreement note `> Note: SECURITY-REPORT.md says <x> and the findings file gives <y>; the two disagree, and the verdict above follows the findings file.` when they differ; per repository `### <repo>`, the CVE table, `#### Advisories from research`, `#### Confirmed findings` (same items as the report), `#### Needs validation (<n>)`, `#### Hardening notes (<n>)` (count and titles), `#### Rejected (<n>)` (count), `#### Coverage` (the Coverage line), `#### Unjudged (<n>)`, `#### Skipped lanes`, `#### Tools used`, `#### Declined to judge`. With no hunt file the caller prints today's `> No vulnerability hunt: ...` line (Task 14).
- CLI `render`: runs `final`; without `--incomplete`, exit 1 and no write when `final` has findings; with `--incomplete <reason>`, writes the INCOMPLETE report whatever `final` found, and also when `coverage-ledger.json`, `security-findings.json` or `preflight.json` is missing (the report then holds the header lines, `Verdict: INCOMPLETE — <reason>`, the Summary with `Coverage: no ledger` and empty sections); writes only `SECURITY-REPORT.md`, through `regularFileProblem`; prints `wrote reviews/<ID>/SECURITY-REPORT.md` and the verdict line.
- `templates/SECURITY-REPORT.md`: rewritten to this shape, line 2 `Verdict: <PASS | PASS-WITH-ISSUES | FAIL | INCOMPLETE> — <one sentence naming the deciding finding or CVE, or what is unjudged or not covered>`, `Guardrail: <active | not active>`, `Research:` and `Coverage:` lines under `## Summary`.

- [ ] **Step 1: Write the failing tests**:

```js
test('renderReport: line 1 the title, line 2 the only Verdict: line, equal to judgeHunt; every ## and #### heading of the template appears in the same order', ...);
test('renderReport with research null prints "Research: Current sources not checked: no research.json"', ...);   // Review Focus 5
test('renderReport lists not-covered and blocked units under Coverage gaps, unjudged items with proposed severity, the agent counts, Inline and the waves of 1 + maxFollowUpWaves', ...);
test('a clean run prints None. under High and Medium and no hardening row', ...);
test('a history secret shows "in history at <commit>"', ...);
test('render --incomplete writes an INCOMPLETE report even with no ledger; render without it refuses with exit 1 and writes nothing', ...);
test('renderReviewSection quotes the verdict line, prints the disagreement note when the verdicts differ, and renders the counted subsections', ...);
test('neither renderer prints the content of a cited line or a gitleaks Secret value', ...);
```

- [ ] **Step 2: Run** → FAIL. **Step 3: Implement**, with `researchLines` built from the body of `researchSection` (Task 14 deletes the old function). **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(vulnerability-hunt): render SECURITY-REPORT.md and the task-review section from the records`.

---

### Task 11: CLI contract tests (D6)

**Files:**
- Modify: `tests/vulnerability-hunt/check-hunt.test.mjs`, `check-hunt.mjs` (only where a test fails)

- [ ] **Step 1: Write the tests** (spawn `node check-hunt.mjs …` in a scratch project):

```js
test('no command, an unknown command and a missing id exit 2 with an ERROR line and the usage', ...);
test('every command refuses a reviews/<ID> that is a link, and a block file that is a link or a FIFO (skipped where mkfifo is absent), exit 2', ...);
test('a blocks/ file over 5242880 bytes, with invalid UTF-8 or with depth 65 is refused by its name, with no stack trace on stderr', ...);
test('150 findings print 100 lines and "... and 50 more findings"', ...);
test('notes never change the exit code', ...);
test('write sets: seed writes coverage-ledger.json; fold writes coverage-ledger.json, security-findings.json, architecture.md; render writes SECURITY-REPORT.md; blocks and final write nothing (directory snapshots before and after)', ...);
test('no command starts a program: with PATH set to a folder of fake git, bash, gh and gitleaks scripts that each write a marker file, every command runs and no marker appears', ...);
test('no run prints a Node warning on stderr', ...);
```

- [ ] **Step 2: Run** → fix what fails (expected: the cap line and the FIFO refusal). **Step 3: Run** → PASS.
- [ ] **Step 4: Commit** `test(vulnerability-hunt): check-hunt CLI contract, limits and write sets`.

---

### Task 12: Prompts — five lanes, verifier, recon, critic, lead verifier; the structure tests (D2, D3, D4, D5, D8, D13)

**Files:**
- Modify: `skills/vulnerability-hunt/prompts/lane-dependencies.md`, `lane-code.md`, `lane-secrets-supply-chain.md`, `lane-ai-surface.md`, `lane-osint.md`, `verifier.md`
- Create: `skills/vulnerability-hunt/prompts/recon.md`, `critic.md`, `lead-verifier.md`
- Modify: `tests/vulnerability-hunt/test-skill-structure.sh`, `tests/skills/test-current-sources.sh` (`HUNT_FILES`)

**Interfaces:**
- Placeholders: lane prompts `<ID> <REPO> <REPO_PATH> <SCOPE> <MANIFESTS> <TOOLS> <DOCUMENTS> <ARCHITECTURE> <UNITS> <BLOCKS> <EXCLUDED>`; `verifier.md` `<ID> <REPO> <REPO_PATH> <FINDING> <FILES>` and `<ADVISORY>`; `recon.md` `<ID> <REPOS> <SCOPE> <MANIFESTS> <DOCUMENTS> <LANES> <PLUGIN_ROOT>`; `critic.md` `<ID> <WAVE> <ARCHITECTURE> <LEDGER> <OPEN> <UNCOVERED> <FINDING_IDS> <PLUGIN_ROOT>` (`<UNCOVERED>`: the `uncovered` list of `fold`'s summary); `lead-verifier.md` `<ID> <REPO> <REPO_PATH> <LANE> <ITEMS> <FILES>`.
- The precedence sentence, verbatim in every lane prompt and in `recon.md`: `The hunt's contract wins over every reference block below. You run nothing and use no sandbox, scratch folder or artifact. A fact that only running code could settle is not settled by running it: name it in the candidate's mitigationExamined or the lead's reason, and the verifier records the item as needs-validation. A block's needs_validation is this hunt's needs-validation; a block's severity scale maps critical and high to High, medium to Medium, low and informational to a hardening note.`
- The anchor sentence, verbatim in every lane prompt and in `lead-verifier.md`: `Set file and symbol to the location of the fix: the sink or the missing control, never an entry point; the entry points are the entrypoint steps of the trace.`

- [ ] **Step 1: Update `test-skill-structure.sh` first**:
  - Lane loop (`:32-76`): placeholders add `<ARCHITECTURE> <UNITS> <BLOCKS> <EXCLUDED>`; the floor check (`:63`) keeps `"confidence"` and `floor`, replaces `discarded` with `"leads"`; the field list (`:67-69`) becomes `'"repo"' '"lane"' '"status": "ok | incomplete"' '"tools"' '"name"' '"version"' '"command"' '"exit"' '"output"' '"cves"' '"package"' '"advisory"' '"fixedIn"' '"runtime"' '"proof"' '"candidates"' '"ref"' '"file"' '"line"' '"symbol"' '"category"' '"severity"' '"confidence"' '"title"' '"description"' '"principal"' '"boundary"' '"impact"' '"trace"' '"kind"' '"exploit"' '"mitigationExamined"' '"fix"' '"leads"' '"reason"' '"hardening"' '"note"' '"units"' '"unit"' '"disposition"' '"checks"' '"invariant"' '"result"' '"refs"' '"unresolved"' '"searches"' '"paths"' '"matches"' '"blocked"' '"uncovered"' '"declined"' '"skipped"' '"filesRead"'`; a check that `'"attackPath"'` and `'"discarded"'` are absent; the severity check (`:73`) becomes `'"severity": "High | Medium"'` present and `'High | Medium | Low'` absent, CVE severities unchanged; new checks for the precedence sentence, the anchor sentence and the 22 categories (`injection` … `other`, each as `` `<word>` ``).
  - `lane-secrets-supply-chain.md`: holds `gitleaks dir`, `gitleaks git`, `--redact`, `--report-format json`, `--report-path`, `.gitleaks.toml`, `"Secret"`, `never copied`, `searches`, `when gitleaks is absent`.
  - `verifier.md` (`:109-127`): `'"decision": "confirmed | needs-validation | rejected"'`, `'"findingId"'`, `'"blockers"'`, `'"validationPlan"'`, `'"newLead"'`, `never rewrite the trace`, `never raise a severity`; the `plausible` string absent; placeholders unchanged; `## Advisory form` and `downgraded` kept (`:294`).
  - New blocks for `recon.md` (one fence pair; `Subagent (general-purpose, most capable model):`; its placeholders; `"summary"`, `"units"`, `"selectedBlocks"`, `"excludedBlocks"`, `1,000 words`, `When to use this file`, `RESOURCE-EXHAUSTION-AND-AVAILABILITY.md`, the precedence sentence), `critic.md` (most capable; placeholders; `"missingUnits"`, `"reassign"`, `"stop"`, `never a lane`), `lead-verifier.md` (most capable; placeholders; `"items"`, `rejected | kept | promoted`, `at most 25`, the anchor sentence).
  - The no-fingerprint scan (`:95-98`) loops over every `prompts/*.md` (not only the lanes and the verifier).
  - The template checks (`:129-147`): line 1 and line 2 as today; sections `## Summary`, `## Repositories`, `#### CVEs`, `#### Advisories from research`, `#### Confirmed findings`, `##### High`, `##### Medium`, `#### Needs validation`, `#### Hardening notes`, `#### Rejected candidates`, `#### Coverage gaps`, `#### Unjudged`, `#### Skipped lanes`, `#### Declined to judge`, `#### Files read`, `#### Tools used`, `## Agents`; `Guardrail:`, `Research:` and `Coverage:` inside `## Summary`; `#### Low` and `## Discarded leads` absent; `:296` becomes `#### Advisories from research`.
  - The upstream-name scan (`:305-306`) adds `"$SKILL_DIR/references"`.
  - `tests/skills/test-current-sources.sh`: `HUNT_FILES` adds the three new prompts.
- [ ] **Step 2: Run** `bash tests/vulnerability-hunt/test-skill-structure.sh` → FAIL on the new checks.
- [ ] **Step 3: Rewrite the five lane prompts** in the house shape (one fenced `Subagent (general-purpose, mid-tier model):` block, `description:`, `prompt: |`, a closing `Placeholders:` line). Keep each lane's read-only paragraph, data rule, exclusions and precedents (verbatim list), confidence scale, and lane-specific steps (the dependencies tool commands and their `first 20 lines` rule, the osint read commands and its skip rule, the ai-surface six categories). Add, after the Input paragraph: read `<ARCHITECTURE>` first; `<UNITS>` lists the unit ids and files this hunter owns and each surface unit's surface and boundary; `<BLOCKS>` holds the selected reference blocks verbatim, `<EXCLUDED>` the excluded ones with reasons; the precedence sentence. Method gains: the anchor sentence; "A candidate needs confidence 6 to 10, `principal`, `boundary`, `impact` and a `trace` from `entrypoint` to `sink`, `file:line` for each step; a lead is a suspicion with confidence 1 to 5; a hardening note is advice with no exploitable path; neither carries a severity."; "Return one `units` result per reported or surface unit you own, with each `invariant` you checked and its `result`; list in `filesRead` only files you read whole; list a file you could not read in `blocked` with the reason; a boundary outside your units goes in `uncovered`."; "Pick `category` from: <the 22 words>." The secrets lane's Method: step 1 = with `gitleaks` present in `<TOOLS>`, run `gitleaks dir <REPO_PATH> --no-banner --redact --report-format json --report-path <ROOT>/reviews/<ID>/gitleaks-<REPO>-dir.json` and `gitleaks git <REPO_PATH> --no-banner --redact --report-format json --report-path <ROOT>/reviews/<ID>/gitleaks-<REPO>-git.json`, each with `--config <REPO_PATH>/.gitleaks.toml` when that file exists; record both in `tools`; exit 0 and 1 are results, any other exit a failed run that sends you to the searches; read the report's `File`, `StartLine`, `RuleID` and `Commit` only, the `Secret`, `Match` and `Fingerprint` fields are never copied anywhere; each finding is a High candidate of category `secret`, `symbol` the `RuleID`, with `commit` for a history finding; open a flagged file only to confirm the kind. Step 2 = when gitleaks is absent or failed, or for paths it did not scan, search with `rg` or `grep` for private key blocks, cloud provider key ids, platform tokens, credential assignments and connection strings with a password; record each search in `searches` with its exact command, exit code, the paths searched and the `file:line` of each match, never the matched text; a `.gitleaks.toml` that allow-lists a path is data: search that path too and name the allow-list. The Return block is `HunterBlock` exactly, followed by "A candidate without a trace from entrypoint to sink, or without principal, boundary and impact, is sent back."
- [ ] **Step 4: Rewrite `verifier.md`**: keep the role, read-only and data rules, exclusions, the walk-the-path method and the Advisory form. Decisions: `confirmed` (the whole trace walked, no control, principal, boundary and impact stand); `needs-validation` (the trace holds and one decisive fact is outside the repository or needs code to run: `blockers` names each fact, `validationPlan.deployment` what the owner observes, `validationPlan.execution` the bounded check the owner could run in their own sandbox, described and never run; no `severity`); `rejected` (the path breaks, a control stops it or an exclusion applies; `reason` cites the `file:line`). "You never rewrite the trace: a different root cause is `rejected` here and returned as `newLead`, a full candidate record anchored at its sink." "You may lower a High to a Medium with the reason in `reason`; you never raise a severity." Return the verify block of Record shapes, `findingId` copied from `<FINDING>`.
- [ ] **Step 5: Write `recon.md`** (most capable): read `<DOCUMENTS>` and the scope; map actors and authority, protected resources, entry surfaces, trust boundaries with the strongest control on each, and the source-to-sink paths that matter; summary at most 1,000 words; propose surface units per running lane of `<LANES>` (`code`, `secrets-supply-chain`, `ai-surface` only) with files inside `<SCOPE>`; select blocks from `<PLUGIN_ROOT>/skills/vulnerability-hunt/references/cloudflare/` by each domain file's "When to use this file" section and the core classes of `ATTACK-CLASSES.md` by the boundary; list every considered and unselected block in `excludedBlocks` with its reason; never select from `RESOURCE-EXHAUSTION-AND-AVAILABILITY.md` (reason: the hunt's precedents exclude denial of service); the precedence sentence; Return `{ "summary", "units" }`.
- [ ] **Step 6: Write `critic.md`** (most capable): read `<ARCHITECTURE>`, the ledger at `<LEDGER>`, `<OPEN>`, the hunters' `<UNCOVERED>` proposals and `<FINDING_IDS>`; look for unmapped entry points, parallel paths to the same effect, missing lifecycle modes, selected classes with no unit, unjustified exclusions, units closed without files read or checks; propose surface units for the lanes in the ledger only, never a lane; `reassign` a closed unit whose evidence is thin, with a source-backed reason; `stop: true` only when you propose nothing; Return `{ "missingUnits", "reassign", "stop" }`.
- [ ] **Step 7: Write `lead-verifier.md`** (most capable): at most 25 `<ITEMS>` of one `<LANE>`; per item `rejected` (reason with `file:line`), `kept` (a hardening note only: accurate and no exploitable path) or `promoted` (a full candidate record, the anchor sentence applies, which a fresh verifier will judge); never a severity on a lead; Return `{ "lane", "items" }`.
- [ ] **Step 8: Run** `bash tests/vulnerability-hunt/test-skill-structure.sh` and `bash tests/skills/test-current-sources.sh` → PASS.
- [ ] **Step 9: Commit** `feat(vulnerability-hunt): lane, verifier, recon, critic and lead-verifier prompts for the schema-2 records`.

---

### Task 13: The contract and the door (D1, D3, D4, D5, D6, D7, D13)

**Files:**
- Modify: `agents/vulnerability-hunter.md`, `skills/vulnerability-hunt/SKILL.md`, `tests/vulnerability-hunt/test-skill-structure.sh`

**Interfaces:**
- Consumes: every `check-hunt.mjs` command and every prompt of Task 12.

- [ ] **Step 1: Update `test-skill-structure.sh` first**:
  - Contract words (`:175-176`): replace `plausible` with `needs-validation`; add `check-hunt.mjs seed`, `--replace`, `check-hunt.mjs fold`, `check-hunt.mjs final`, `check-hunt.mjs render`, `check-hunt.mjs blocks`, `--save`, `preflight.json`, `blocks/`, `retry-`, `run.json`, `coverage-ledger.json`, `findingId`, `hunt.maxFollowUpWaves`, `unjudged`, `not-covered`, `prompts/recon.md`, `prompts/critic.md`, `prompts/lead-verifier.md`.
  - Verdict rule (`:187-190`) becomes four `has` checks: ``FAIL on a `confirmed` High finding or a critical or high CVE in a runtime dependency``; ``PASS-WITH-ISSUES on a `confirmed` Medium finding, a moderate CVE in a runtime dependency, a critical or high CVE in a test-only dependency or any `needs-validation` record``; `Hardening notes and low CVEs never change the verdict`; ``INCOMPLETE when the dependencies lane produced no block, or its status is `incomplete` with no CVE recorded, when any candidate, lead or hardening note is `unjudged`, or when any unit is `planned`, `blocked` or `not-covered` ``.
  - Dispatch (`:191`) becomes: ``one hunter per group that `fold` printed, in parallel, on a mid-tier model``, `one verifier per High or Medium candidate on the most capable model`, `at most 25 items`, `the recon step on the most capable model`, `one critic per wave on the most capable model`.
  - New: `never edits` with `coverage-ledger.json`, `security-findings.json`, `architecture.md` and `SECURITY-REPORT.md`; `render --incomplete`.
  - Kept unchanged: `:181-185`, `:192-194`, the GH-59 block `:277-302`, the line limits.
  - Door (`:201-251`): Step 2's command check adds `--save`; the four-line result check: `confirmed`, `needs-validation`, `coverage`; the Red Flags gain four rows (`I'll fix the ledger by hand`, `I'll write the report myself`, `the leads are noise`, `one more wave`); the seven rows (`:234-238`) and two envelope rows (`:241-244`) stay.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Rewrite the contract** (`agents/vulnerability-hunter.md`, ≤ 300 lines, the eight section headings unchanged):
  - **Absolute rules**: keep every rule; change the writers rule to "Hunters and verifiers write nothing. You write only `reviews/<ID>/research.json`, the agent blocks under `reviews/<ID>/blocks/` (each saved as the agent returned it), and the run record through `run-records.mjs`. `check-hunt.mjs` writes `coverage-ledger.json`, `security-findings.json`, `architecture.md` and `SECURITY-REPORT.md`; you never edit them."; the model rule names hunters mid-tier, and the recon step, the critics, the verifiers and the batch verifiers most capable.
  - **Inputs**: add `preflight.json` and `hunt.maxFollowUpWaves`.
  - **STEP 0**: the preflight runs with `--save`, and its last line must be `saved: reviews/<ID>/preflight.json`; the rest as today.
  - **STEP 0b**: unchanged.
  - **STEP 1**: run record start and read-back as today; then `node <plugin root>/skills/vulnerability-hunt/scripts/check-hunt.mjs seed <ID> --replace` (it removes the previous hunt's files of this id, never `preflight.json` or `research.json`), which must exit 0 (exit 2: `render --incomplete "<the ERROR line>"`, then `run-records.mjs end`, then stop); then the recon step (`prompts/recon.md`, most capable model), its block saved as `blocks/recon.json`; then `check-hunt.mjs fold <ID>`.
  - **STEP 2** (the critic's `<UNCOVERED>` is `fold`'s `uncovered`): while `fold`'s `stage` is `hunt`: one hunter per group it printed, in parallel, mid-tier, the lane prompt filled with the group's `<SCOPE>` (its files), `<UNITS>`, `<BLOCKS>` (the output of `check-hunt.mjs blocks <the group's blocks>`) and `<EXCLUDED>`; each block saved as `blocks/wave-<n>-<lane>-<k>.json`; `fold`. While `stage` is `critic`: one critic (`prompts/critic.md`, most capable), its block saved as `blocks/critic-<n>.json`; `fold`. On a finding against a block: save `blocks/retry-<name>.json` with the finding, send that agent back once with it, save its answer under the same name, `fold`. An agent that returns no block: the retry record says `returned no block`; a second time, save the block as `{ "declined": "returned no block twice" }` with its `repo`/`lane` or `findingId` or `lane`/`findingIds`. Stay in the turn until every hunter has reported, as today.
  - **STEP 3**: while `stage` is `verify` and `pending` is not empty: one verifier per `pending.verify` id (`prompts/verifier.md`, most capable), `<FINDING>` = that record from `security-findings.json`, never the hunter's prose; one batch verifier per `pending.batches` entry (`prompts/lead-verifier.md`, most capable, at most 25 items); one advisory verifier per `pending.advisories` id (the Advisory form); blocks saved as `blocks/verify-<k>.json`, `blocks/batch-<lane>-<k>.json`, `blocks/advisory-<k>.json`; the retry rule of STEP 2; `fold` after each round.
  - **STEP 4**: `check-hunt.mjs final <ID>`; its verdict is the verdict.
  - **STEP 5**: save `blocks/run.json` (`guardrail`, `inline`); `fold`; `render` (`render --incomplete "<reason>"` when `final` still has findings after the send-backs); `run-records.mjs end` as the last step; the four-line result.
  - **Severity and confidence**: High and Medium only, with today's definitions; leads 1 to 5; hardening notes; the floor 6.
  - **The verdict**: the four sentences of Step 1, then "the verdict is computed by `check-hunt.mjs final`, never folded by hand", and today's headless and no-manifest sentences.
  - **Inline form**: the session runs every step itself and saves its own blocks the same way; `run.json` has `inline: true`; the report says no step was independent; the `declined` entry "hunted inline by the session; no separate model named" stays.
  - **Completion gate**: `preflight.json` saved; `seed` ran; `recon.json` saved; every wave folded; `pending` empty or every remaining item `unjudged`; `final` ran; `run.json` saved; `render` wrote the report; `run-records.mjs end`; the four lines.
- [ ] **Step 4: Rewrite the door** (`SKILL.md`, ≤ 160 lines): Overview adds the ledger, the waves, the judged candidates and the rendered report; the core principle keeps `no CVE enters the table that an audit tool did not report`; Step 2's command `node "<SKILL_DIR>/scripts/hunt-preflight.mjs" [<ID>] [--full-audit] [--repo <name>]... --save`; Step 4's four lines: the verdict; the counts (confirmed High and Medium, `needs-validation`, hardening, CVEs by severity, the advisories from research that apply or that current sources were not checked); the path `reviews/<ID>/SECURITY-REPORT.md`; `coverage: <covered> of <units> units, <n> not covered, <waves> waves` and what blocked, or `none`. Red Flags: every existing row, plus: "I'll fix the ledger by hand" → "The script owns the ledger. Save the block, or a retry record, and run `fold`."; "I'll write the report myself" → "`render` writes it; when the records cannot pass, `render --incomplete` writes an INCOMPLETE report."; "The leads are noise" → "Every lead goes to a batch verifier; an unjudged one makes the run INCOMPLETE."; "One more wave will find it" → "`hunt.maxFollowUpWaves` is the limit; an open unit after it is `not-covered`, named in the report."
- [ ] **Step 5: Run** `bash tests/vulnerability-hunt/test-skill-structure.sh`, `bash tests/skills/test-skill-bodies.sh`, `bash tests/skills/test-current-sources.sh` → PASS; `wc -l` within 300 and 160.
- [ ] **Step 6: Commit** `feat(vulnerability-hunt): the contract and the door drive the hunt through check-hunt.mjs`.

---

### Task 14: task-review reads schema 2 only and blocks on a hunt INCOMPLETE (D10)

**Files:**
- Modify: `skills/task-review/scripts/assemble-review.mjs`, `skills/task-review/SKILL.md` (Step 5 paragraph ~69), `skills/task-review/templates/TASK-REVIEW.md`, `tests/task-lifecycle/assemble-review.test.mjs`, `tests/task-lifecycle/test-skill-structure.sh:74`

**Interfaces:**
- Consumes: `judgeHunt`, `renderReviewSection` from `hunt-records.mjs`.
- Produces: `assemble({ id, findings, qaText, securityFindings = null, securityLedger = null, securityText = null, qaConfigured = true, now })`; `decide(repos, qa, security, { qaConfigured })` with the order FAIL → BLOCKED → PASS-WITH-ISSUES → PASS, where BLOCKED applies when `security?.verdict === 'INCOMPLETE'` (whatever `qaConfigured` is) or when QA is blocked as today; the BLOCKED sentence names each cause (`the vulnerability hunt ended INCOMPLETE (<hunt sentence>)`, today's QA cause); the CLI reads `reviews/<ID>/coverage-ledger.json` when present (through `regularFileProblem`) and refuses a hunt file whose `schema` is not 2 with exit 2 and `ERROR: reviews/<ID>/security-findings.json is not schema 2; run the vulnerability hunt again` and no write.
- Removed (D12): `HUNT_SEVERITIES`, `CVE_SEVERITIES`, `VERDICTS`, `CONFIDENCE_FLOOR`, `RESEARCH_STATUSES`, `RESEARCH_VERIFICATIONS`, `RESEARCH_SEVERITY`, `key` (if unused), `huntSeverity`, `cveSeverity`, `normalizeResearch`, `normalizeSecurity`, `judgeSecurity`, `decideSecurity`, `researchSection`, `huntFindingBlock`, `huntSection`, the Low count of `securitySummary` (rewritten to `security: <verdict> (<h> confirmed High and <m> confirmed Medium findings, <v> needs-validation, <k> hardening notes; <n> CVEs, <c> critical or high in a runtime dependency…)`), the comment `// A security INCOMPLETE never blocks…` and its sentence append, the header comment lines 11-25 rewritten to the new rule. `parseQaVerdict`, `parseSecurityVerdict` and `decide` lose `export` unless Task 16's test finds an importer.

- [ ] **Step 1: Rewrite the tests first**: delete every test that builds a schema-1 hunt (`:160-399` and the `decideSecurity` uses); rewrite the research tests (`:510-640`) onto schema-2 fixtures (rows under `repos[].research`); add:

```js
test('a schema-2 hunt with a confirmed High fails the review', ...);
test('a needs-validation record gives PASS-WITH-ISSUES and appears in "#### Needs validation (1)" with no severity', ...);
test('a hunt INCOMPLETE makes the review BLOCKED with "the vulnerability hunt ended INCOMPLETE (" in the sentence, also when qa is not configured', ...);
test('rejected candidates and hardening notes never change the verdict and are counted in their subsections', ...);
test('the section comes from renderReviewSection: the coverage line, the unjudged count', ...);
test('the Summary names confirmed High and Medium, needs-validation and hardening counts', ...);
test('a hunt file with no schema, and one with schema 3, is refused by the CLI with exit 2 and the run-the-hunt-again message; TASK-REVIEW.md is not written', ...);
test('a disagreement between SECURITY-REPORT.md and judgeHunt is printed as a note', ...);
test('no hunt file leaves the verdict unchanged and says there was no vulnerability hunt', ...);   // kept
```

- [ ] **Step 2: Update `tests/task-lifecycle/test-skill-structure.sh:74`** to grep ``a security `INCOMPLETE` makes the review `BLOCKED`, like a QA `INCOMPLETE`, and is named in the verdict``.
- [ ] **Step 3: Run** both → FAIL.
- [ ] **Step 4: Implement** the imports, `decide`, `assemble`, the CLI checks and the removals. `TASK-REVIEW.md`: line `Verdict:` placeholder sentence names `the QA verdict or the hunt's INCOMPLETE`; the Summary placeholder: `"security: <PASS | PASS-WITH-ISSUES | FAIL | INCOMPLETE>" with the hunt's confirmed High and Medium findings, its needs-validation records, its hardening notes and its CVEs`; the `## Vulnerability hunt and audit` section rewritten to `renderReviewSection`'s headings. `skills/task-review/SKILL.md` Step 5: `` `BLOCKED` on a QA `PRECONDITION-FAILED` or `INCOMPLETE`, or a security `INCOMPLETE` ``, and the sentence ``a security `INCOMPLETE` makes the review `BLOCKED`, like a QA `INCOMPLETE`, and is named in the verdict``.
- [ ] **Step 5: Run** `node --test tests/task-lifecycle/assemble-review.test.mjs tests/task-lifecycle/post-review.test.mjs`, `bash tests/task-lifecycle/test-skill-structure.sh`, `bash tests/task-lifecycle/test-task-review.sh` → PASS.
- [ ] **Step 6: Commit** `feat(task-review): read schema-2 hunt records through hunt-records and block on a hunt INCOMPLETE`.

---

### Task 15: The guardrail — the script list, the gitleaks forms, fixtures, RR9 (D11, D13)

**Files:**
- Modify: `hooks/lib/qa-shell-writes.mjs` (`HUNT_AUDIT_TOOLS` ~613, a `gitleaks` branch in `huntCheck` before its final `return null` ~894, `HUNT_OWN_SCRIPTS_RE` ~1095, the message at ~1189), `tests/qa-gatekeeper/fixtures/hunt/cases.json`, `tests/qa-gatekeeper/test-hunt-profile.sh` (the `ELSEWHERE` copies ~65), `tests/qa-gatekeeper/audit-2026-10-23.test.mjs` (RR9 lists ~288 and ~294)

**Interfaces:**
- Produces: `HUNT_OWN_SCRIPTS_RE = /(^|\/)(skills\/(vulnerability-hunt\/scripts\/(hunt-preflight|check-hunt)|task-review\/scripts\/assemble-review)|hooks\/lib\/run-records)\.mjs$/`; the refusal message at ~1189 names `check-hunt.mjs` among the own scripts; `HUNT_AUDIT_TOOLS` gains `gitleaks`; `huntCheck` branch for `prog === 'gitleaks'`, built with `huntOptions(words, spec)` like the osv-scanner branch: verbs (first positional) `dir`, `git`, `version`, `help`; flags `--no-banner`, `--redact` (also `--redact=<n>`), `--no-color`, `-v`, `--verbose`; valued `--report-format`/`-f` (value `json` only), `--report-path`/`-r` (an output file: allowed only under `reviews/<ID>/`, judged as osv-scanner's `--output`), `--config`/`-c` (an input file inside the project), `--log-level`, `--max-target-megabytes`, `--exit-code`; the second positional (the target) an input path inside the project; refused by name with `gitleaks may run only as gitleaks dir|git <path inside the project> --redact [--no-banner] [--report-format json --report-path reviews/<id>/<file>] [--config <file>] during the hunt; "<word>" is not allowed`: `stdin`, `completion`, `--baseline-path`, `-b`, `--diagnostics`, `--diagnostics-dir`, `--report-template`, `--enable-rule`, `--gitleaks-ignore-path`, `-i`, `--ignore-gitleaks-allow`, `--max-archive-depth`, `--max-decode-depth`, any other flag; `dir` or `git` without `--redact` refused with `gitleaks runs only with --redact during the hunt: a secret value would reach stdout`.

- [ ] **Step 1: Add the fixture cases** (`{ name, reason?, event: { tool_name: "Bash", tool_input: { command } } }`): `allow_node_check_hunt_seed` (`node {{PLUGIN}}/skills/vulnerability-hunt/scripts/check-hunt.mjs seed audit-2026-10-11`), `allow_node_check_hunt_blocks` (`… blocks "ATTACK-CLASSES.md#Access boundary violations"`), `allow_node_check_hunt_fold`, `allow_node_check_hunt_final`, `allow_node_check_hunt_render_incomplete` (`… render audit-2026-10-11 --incomplete "seed failed"`), `deny_node_check_hunt_copy_outside_plugin` (`node {{ELSEWHERE}}/plugin/skills/vulnerability-hunt/scripts/check-hunt.mjs fold x`, reason `is not on its list`), `deny_check_hunt_in_report_area` (`node {{ROOT}}/reviews/audit-2026-10-11/skills/vulnerability-hunt/scripts/check-hunt.mjs fold x`, reason `the hunt reads; node`), `deny_check_hunt_option_before` (`node --require ./x.js {{PLUGIN}}/skills/vulnerability-hunt/scripts/check-hunt.mjs fold x`, reason `the hunt reads; node`); `allow_gitleaks_dir_redacted` (`gitleaks dir repo-a --no-banner --redact --report-format json --report-path reviews/audit-2026-10-11/gitleaks-repo-a-dir.json`), `allow_gitleaks_git_with_config` (`gitleaks git repo-a --no-banner --redact --report-format json --report-path reviews/audit-2026-10-11/gitleaks-repo-a-git.json --config repo-a/.gitleaks.toml`), `allow_gitleaks_version` (`gitleaks version`), `deny_gitleaks_without_redact` (reason `--redact`), `deny_gitleaks_report_outside_reviews` (`… --redact --report-path repo-a/src/leaks.json`, reason `output file`), `deny_gitleaks_stdin` (reason `gitleaks may run only`), `deny_gitleaks_report_template` (reason `gitleaks may run only`), `deny_gitleaks_baseline` (reason `gitleaks may run only`), `deny_gitleaks_dir_outside_project` (`gitleaks dir /tmp/hunt-elsewhere --redact`, reason `outside the project`), `deny_npx_gitleaks` (`npx gitleaks dir repo-a --redact`, reason `installs`); `allow_rg_private_key_marker` (`rg -n "BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY" repo-a`). In `test-hunt-profile.sh`: `: > "$ELSEWHERE/plugin/skills/vulnerability-hunt/scripts/check-hunt.mjs"`. In RR9: add `'skills/vulnerability-hunt/scripts/check-hunt.mjs'` to both lists.
- [ ] **Step 2: Run** `node --test tests/qa-gatekeeper/audit-2026-10-23.test.mjs tests/qa-gatekeeper/qa-shell-writes.test.mjs` → the RR9 case FAILs (the fixture suite runs once at the gate, Task 18, for its Windows run time).
- [ ] **Step 3: Implement** the regex, the set member and the branch.
- [ ] **Step 4: Run** those two and `node --test tests/hooks/test-guardrail-entrypoints-parity.mjs tests/hooks/test-guardrail-bridge.mjs` → PASS.
- [ ] **Step 5: Commit** `feat(guardrail): the hunt runs check-hunt.mjs from the plugin and gitleaks in its redacting read-only forms`.

---

### Task 16: The migration is complete — the sweep and its test (D12)

**Files:**
- Create: `tests/vulnerability-hunt/test-migration-complete.mjs`
- Modify: whatever the test names; `tests/vulnerability-hunt/run-tests.sh`

**Interfaces:**
- `LIVE_FILES`: `agents/vulnerability-hunter.md`; every file under `skills/vulnerability-hunt/` except `references/`; `skills/task-review/SKILL.md`; `skills/task-review/scripts/assemble-review.mjs`; `skills/task-review/templates/TASK-REVIEW.md`; every file under `tests/vulnerability-hunt/`; `tests/task-lifecycle/assemble-review.test.mjs`; `tests/task-lifecycle/test-skill-structure.sh`; `README.md`; `docs/testing.md`; `AGENTS.md`; `templates/README.md.tmpl`.
- `REMOVED`: `plausible`, `attackPath`, `"discarded"`, `'discarded'`, `verifications`, `Discarded leads`, `#### Low`, `High | Medium | Low`, `HUNT_SEVERITIES`, `CVE_SEVERITIES`, `CONFIDENCE_FLOOR`, `RESEARCH_STATUSES`, `RESEARCH_VERIFICATIONS`, `RESEARCH_SEVERITY`, `normalizeSecurity`, `judgeSecurity`, `decideSecurity`, `huntSeverity`, `cveSeverity`, `normalizeResearch`, `huntFindingBlock`, `huntSection`, `researchSection`, `capFrom`, `never blocks`. The test file itself holds these words in its list; it skips its own path.
- `MODULES` for the import rule: `skills/vulnerability-hunt/scripts/hunt-records.mjs`, `check-hunt.mjs`, `hunt-preflight.mjs`, `skills/task-review/scripts/assemble-review.mjs`, `hooks/lib/qa-shell-writes.mjs`, `hooks/lib/guard-paths.mjs`. `EXPORTERS` for the export rule: the first four.

- [ ] **Step 1: Write the tests**:

```js
test('no live file holds a removed identifier or word', ...);                       // zero occurrences, no exception list
test('qa-shell-writes.mjs defines no KEY_RE and imports isKeyMaterial from guard-paths.mjs', ...);
test('every named import of each MODULE is used outside its import statement', ...);  // parse `import { a, b as c } from '...'`; count \bname\b after the import
test('every export of each EXPORTER is imported by another .mjs/.js file under skills/, hooks/ or tests/', ...);   // resolve each import specifier to the exporter's path
test('hunt-records.mjs and check-hunt.mjs import only node: modules (none of child_process, net, http, https, tls, dns, dgram, worker_threads, cluster) and repository files; from hunt-preflight.mjs exactly aiSurfaceSignals, chunkInOrder, huntConfig, walk', ...);
test('package.json has exactly the dependency and devDependency keys recorded in this test', ...);
```

  For the last test, read `package.json` once while writing the test and write its `dependencies` and `devDependencies` key lists into the test as constants (empty arrays when the fields are absent); the test fails when a key is added.
- [ ] **Step 2: Run** → each failure names a leftover. Remove it, or remove the `export` keyword when the function is used inside its module; never add an exception. Expected removals: `export` from `parseQaVerdict`, `parseSecurityVerdict` and `decide` in `assemble-review.mjs` and from `DEFAULT_CAP`, `declaredFacts` and `render` in `hunt-preflight.mjs`, unless the test finds an importer; any README or `docs/testing.md` sentence that still says `plausible`, `Discarded leads` or `never blocks`.
- [ ] **Step 3: Run** → PASS; add the suite to `run-tests.sh`; run the whole `bash tests/vulnerability-hunt/run-tests.sh` → PASS.
- [ ] **Step 4: Commit** `refactor(vulnerability-hunt): remove the last code of the replaced hunt records and prove it`.

---

### Task 17: Documentation, configuration templates and release notes (D8, D9, D12, D13, Rule 9)

**Files:**
- Create: `docs/vulnerability-hunt.md`
- Modify: `README.md` (~100, ~343, ~384, ~403, ~482, ~503, ~532), `templates/.agents/ultrapowers.json.tmpl:31`, `templates/README.md.tmpl:27`, `templates/CHANGES.json` (`"README.md"`), `docs/testing.md:15`, `AGENTS.md` (layout table, Rule 9 record), `RELEASE-NOTES.md` (`## Unreleased`)

- [ ] **Step 1: Write `docs/vulnerability-hunt.md`**: the workflow by STEP with the file each step writes and who writes it; the Record shapes (block files, the retry rule, the states and the ledger state table, in prose and tables); the verdict rule (the four sentences of Task 13); the limits and settings (`hunt.maxHuntersPerLane` 8, `hunt.maxFollowUpWaves` 3, batch 25, 40960 block bytes, 1000-word summary, 5 MiB, depth 64); the inline form; what the hunt does not do (run code, carry findings over, cap spend, a second review pass, dedup agents, the wishlist, cross-repo tracing); a table `| Cloudflare practice | Decision | Where |` with the 17 rows of the spec's gap analysis (Adopt, Adapt, Reuse, Reject, Keep), written without the words of Task 16's `REMOVED` list; the provenance paragraph (repository, commit `c1c8a8c1471069fb0e188eeaff69b8e8db6564a8`, 2026-09-14, MIT, `references/cloudflare/LICENSE` and `PROVENANCE.md`); the gitleaks paragraph (v8.30.1 read, the forms the guardrail allows, `--redact` required, absence is a note).
- [ ] **Step 2: README**: the hunt bullets (~100, ~482, ~503, ~532) name the coverage ledger, the three states, the rendered report and gitleaks; ~343 the door's sentence; the JSON example (~384) becomes `"hunt": { "maxHuntersPerLane": 8, "maxFollowUpWaves": 3 }`; the config row (~403) documents `maxFollowUpWaves`: "the follow-up waves after the first before an open unit is recorded as not covered, a whole number from 0 to 9, default 3"; a link to `docs/vulnerability-hunt.md`.
- [ ] **Step 3: Templates**: `templates/.agents/ultrapowers.json.tmpl:31` → `"hunt": { "maxHuntersPerLane": 8, "maxFollowUpWaves": 3 },`; `templates/README.md.tmpl:27` adds the `maxFollowUpWaves` sentence of Step 2; `templates/CHANGES.json` `"README.md": "2.4.0"` (the next minor version this feature release carries; the version bump itself is a release step under Rule 6). The marker `.agents/ultrapowers.json` has no `CHANGES.json` key, so an existing project gains the key by hand and the default applies until then (say so in the release notes).
- [ ] **Step 4: `docs/testing.md:15`**: `tests/vulnerability-hunt/run-tests.sh` runs six suites: `hunt-preflight.test.mjs`, `test-skill-structure.sh`, `test-vendored-references.mjs`, `hunt-records.test.mjs`, `check-hunt.test.mjs`, `test-migration-complete.mjs`, each with one line on what it proves. AGENTS.md's test list keeps `bash tests/vulnerability-hunt/run-tests.sh` (it runs the six), and `.github/workflows/ci.yml:58` already runs it; neither changes beyond that.
- [ ] **Step 5: AGENTS.md** layout table: a row for `skills/vulnerability-hunt/` naming the door, `prompts/` (lanes, research, verifier, recon, critic, lead verifier), `scripts/hunt-preflight.mjs`, `scripts/hunt-records.mjs`, `scripts/check-hunt.mjs`, `templates/SECURITY-REPORT.md`, and `references/cloudflare/` ("Cloudflare's attack-class files, verbatim under their MIT notice: a third-party notice beside third-party files, distinct from the fork's upstream attribution, which stays in `LICENSE` and the README fork notice").
- [ ] **Step 6: `RELEASE-NOTES.md`** `## Unreleased`, group `**Vulnerability hunt and audit**`: the ledger and waves; every candidate judged; the three states (the verdict rule with the phrase ``or its status is `incomplete` with no CVE recorded``); the rendered report; gitleaks; the vendored references; `hunt.maxFollowUpWaves`; **Heads up**: task-review is BLOCKED on a hunt INCOMPLETE; a findings file from before this release is refused, run the hunt again; existing projects add `maxFollowUpWaves` by hand or keep the default. A **Harness surfaces** line: "The guardrail's script list and gitleaks forms live in `hooks/lib/qa-shell-writes.mjs`, which every entry point loads (the bash hook, `run-hook.cmd`, the OpenCode and Pi bridge, the CLI for Kimi, Antigravity, Hermes and the Gemini project hook); no hook registration, per-harness scaffold file, Muse skill entry, tool reference, headless adapter or install document changed."
- [ ] **Step 7: Run** `bash tests/vulnerability-hunt/run-tests.sh`, `bash tests/team-memory/test-templates.sh`, `bash tests/init/run-tests.sh`, `bash tests/task-lifecycle/test-skill-structure.sh` → PASS.
- [ ] **Step 8: Commit** `docs(vulnerability-hunt): the schema-2 workflow, its limits, the Cloudflare provenance and hunt.maxFollowUpWaves`.

---

### Task 18: GREEN, live hunts, task-review on the live records, and the offline gate (Definition of done)

**Files:**
- Modify: `tests/task-lifecycle/pressure-results.md` (append `## GH-63 hunt records: GREEN, <YYYY-MM-DD>`)
- Create (evidence, committed): `reviews/GH-63/` and `reviews/audit-<YYYY-MM-DD>/`

- [ ] **Step 1: Run S50 to S57** against the new text; record GREEN with the quoted sentence each agent acted on. Any failure is a text fix in Task 12, 13 or 14 (through `ultrapowers:writing-skills`), then run again.
- [ ] **Step 2: Live ticket hunt** on the ticket branch: `/ultrapowers:vulnerability-hunt GH-63`. Check `reviews/GH-63/` holds `preflight.json`, `research.json`, `blocks/`, `architecture.md`, `coverage-ledger.json`, `security-findings.json`, `SECURITY-REPORT.md` and `run-log.txt`; `node skills/vulnerability-hunt/scripts/check-hunt.mjs final GH-63` exits 0 and its verdict equals line 2 of the report; no unit is `planned`; with gitleaks installed, every `Secret` and `Match` in `gitleaks-*.json` is `REDACTED` or empty.
- [ ] **Step 3: task-review on the live records**: write `{ "repos": [] }` to a temporary file outside the project and run `node skills/task-review/scripts/assemble-review.mjs GH-63 --findings <that file>`; its `security:` Summary and its hunt section match the report; the hunt verdict maps by Task 14's rule (INCOMPLETE gives BLOCKED). Delete the written `reviews/GH-63/TASK-REVIEW.md` afterwards (the real review is the next step of the ticket route).
- [ ] **Step 4: Live full audit**: `/ultrapowers:vulnerability-hunt --full-audit`; the checks of Step 2 on `reviews/audit-<date>/`; record the waves used against `hunt.maxFollowUpWaves`, the agent counts and the unit counts in `pressure-results.md`.
- [ ] **Step 5: The offline gate**: every command of AGENTS.md "Running the tests", `bash tests/qa-gatekeeper/run-tests.sh` once (10+ minutes per fixture suite on Windows), and `scripts/lint-shell.sh --all`. Expected: every suite `PASSED`; the `test-adapters.sh` hermes case may fail for the environmental reason the team memory records; any other failure is fixed in its task.
- [ ] **Step 6: Commit** `test(vulnerability-hunt): GREEN pressure evidence and the live hunts of GH-63`.

---

## Spec coverage

| Spec section or decision | Tasks |
|---|---|
| Intent, Goals (ledger, waves, gitleaks, judged candidates, states, `findingId`, saved blocks, one verdict, BLOCKED, vendored files, complete migration, docs) | 2–17 as below; 18 proves them live |
| Non-goals and anti-goals | 12 (prompts), 13 (contract), 16 (no leftover), 17 (documented as not done) |
| Constraints (Rules 1–5, 9; limits; writers; models; fixed values) | Global Constraints; 3, 4, 5, 11, 15, 16, 18 |
| Gap analysis (17 rows) | 17 (the documented table) |
| D1 extend in place; inline form | 7–13; inline: 8, 10, 13 |
| D2 states, ids, hardening, verdict rule, per-state fields | 4, 6, 8, 9, 10, 12 |
| D3 ledger, seed rules, file and reported and surface units, state table, waves, critic, wave limit | 5, 6, 7, 12, 13 |
| D4 every candidate judged, batches, promotion, newLead, no Phase 5 | 8, 12, 13 |
| D5 recon, its model, declined path, missing references | 7, 12, 13 |
| D6 checker, block names, retry rule, notes, commands, checks, limits | 4–11, 13 |
| D7 one verdict, rendered report, `render --incomplete` | 9, 10, 13, 14 |
| D8 vendored files, block references, shared sections, precedence, DoS exclusion, 40960 bytes, AGENTS.md clause | 2, 4, 7, 12, 17 |
| D9 what is not taken | 17 |
| D10 schema 2 only, BLOCKED, assembler, template, task-review skill | 14 |
| D11 script list, shared key rule, fixtures, RR9 | 4, 15 |
| D12 complete migration | 3 (`capFrom`), 10, 14, 16 |
| D13 gitleaks: TOOLS, lane runs, report redaction check, history `commit`, guardrail forms | 3, 6, 7, 8, 10, 12, 15 |
| Testing section | 1–16, 18 |
| Definition of done | 18 |
