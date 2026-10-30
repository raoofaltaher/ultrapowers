# GH-63 Cloudflare Audit Practices in the Vulnerability Hunt Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use ultrapowers:subagent-driven-development (recommended) or ultrapowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** the vulnerability hunt keeps a coverage ledger, hunts every gap with critic waves, judges every candidate with three distinct verdict states, builds its records and its report from saved agent blocks with a zero-dependency checker, vendors Cloudflare's attack classes verbatim, runs gitleaks when installed, blocks a task review on a hunt INCOMPLETE, and leaves no code of the implementation it replaces.

**Architecture:** one records module (`skills/vulnerability-hunt/scripts/hunt-records.mjs`) holds the shapes, the seed rules, the fold, the checks, the verdict and the renderers; one CLI (`check-hunt.mjs`) is the gatekeeper's door to it (`seed`, `blocks`, `fold`, `final`, `render`); the preflight saves its scope, the agents save their blocks verbatim under `reviews/<ID>/blocks/`, and the script rebuilds `coverage-ledger.json`, `security-findings.json`, `architecture.md` and `SECURITY-REPORT.md` from them. task-review's assembler imports the module's judge and renderer; the guardrail allows the new script and gitleaks in read-only forms; Cloudflare's 11 attack-class files sit under `references/cloudflare/` with their MIT notice.

**Tech Stack:** Node 22+ built-ins only (`node:fs`, `node:path`, `node:crypto`, `node:test`, `node:assert/strict`); Markdown skill text; bash 4+ for the structure tests and the guardrail hook; `gh` for the one-time download of the vendored files.

**Spec:** `specs/GH-63/Spec.md` (commit `9c0eff8`). Every D-number below is a decision of that spec.

**Sources:** cloudflare/security-audit-skill at commit `c1c8a8c1471069fb0e188eeaff69b8e8db6564a8` (2026-09-14): `README.md`, `SKILL.md`, `RECONNAISSANCE.md`, `HUNTING.md`, `VALIDATION-AND-REPORTING.md`, `report-schema.json`, `LICENSE`, and the 11 attack-class files whose bytes were fetched through `gh api -H "Accept: application/vnd.github.raw" repos/cloudflare/security-audit-skill/contents/<path>?ref=<sha>` and matched the tree's blob ids (probe of 2026-10-30; sizes and SHA-256 in Task 2). "Build your own vulnerability harness", Cloudflare Blog, 2026-06-18 (https://blog.cloudflare.com/build-your-own-vulnerability-harness). gitleaks README at `master` (pushed 2026-10-28), "Usage": commands `dir`, `git`, `stdin`; flags `--redact uint[=100]`, `--report-format`, `--report-path`, `--no-banner`, `--exit-code` (default 1), `--config`, `--baseline-path`, `--report-template`; latest release v8.30.1 (2026-03-21), MIT (https://github.com/gitleaks/gitleaks). Node.js v22.23.4 API: `fs.lstatSync` option `throwIfNoEntry` (since v15.3.0), `fs.Stats` (https://nodejs.org/docs/latest-v22.x/api/fs.html); `TextDecoder` option `fatal` ("decoding errors result in a `TypeError` being thrown"), class available on the global object (https://nodejs.org/docs/latest-v22.x/api/util.html). Hacker News item 49736466 (summarised by the fetch tool, 2026-10-30).

## Global Constraints

- Zero dependencies (AGENTS.md Rule 1): `hunt-records.mjs` and `check-hunt.mjs` import `node:` modules and repository files only; `package.json` is not touched.
- Skill-body changes (`skills/vulnerability-hunt/SKILL.md`, `agents/vulnerability-hunter.md`, every file under `skills/vulnerability-hunt/prompts/`, `skills/task-review/SKILL.md`) go through `ultrapowers:writing-skills`: Task 1 is RED, Task 18 is GREEN, evidence in `tests/task-lifecycle/pressure-results.md`. Team memory "Skill pressure tests see session context" applies: commit before a run, keep states neutral.
- States, exactly: `confirmed`, `needs-validation`, `rejected`. Unit statuses, exactly: `planned`, `covered`, `candidate`, `blocked`, `not-covered`, `not-applicable`. Verdicts of the hunt: `PASS`, `PASS-WITH-ISSUES`, `FAIL`, `INCOMPLETE`. Fields camelCase.
- The id field is `findingId`. No hunt document (agent, skill, prompts, template, references' `PROVENANCE.md`) holds the words `fingerprint`, `finger-print`, `sha256` (outside `PROVENANCE.md`, which the structure test excludes), `digest of`, `hash of` or `hash prefix`: `tests/vulnerability-hunt/test-skill-structure.sh:92-97`.
- Fixed values: confidence floor 6; `hunt.maxFollowUpWaves` default 3, a whole number 0 to 9; `hunt.maxHuntersPerLane` default 8; batch size 25; block bytes per hunter 40960; architecture summary 1000 words; checker limits 5 MiB per file, JSON depth 64, 100 printed findings; `schema: 2` in `security-findings.json` and `coverage-ledger.json`.
- `check-hunt.mjs` opens no network connection and starts no program; it reads project files for their line counts only and prints paths and line numbers, never content.
- Writers under `reviews/<ID>/`: the preflight (`preflight.json`, with `--save`, READY only); the gatekeeper (`research.json`, `blocks/*.json`); `check-hunt.mjs` (`coverage-ledger.json`, `security-findings.json`, `architecture.md`, `SECURITY-REPORT.md`); `run-records.mjs` (`run-log.txt`); gitleaks (`gitleaks-<repo>-dir.json`, `gitleaks-<repo>-git.json`). Every writer refuses a link, a junction or a folder in a file's place with `regularFileProblem` and `reviewFolderProblem` from `skills/autopilot/scripts/autopilot-lib.mjs`.
- The structure test limits: agent file ≤ 300 lines, skill ≤ 160 lines, STEP 0 to STEP 5 and no STEP 6, report line 1 `# Security report — `, line 2 the only `Verdict:` line. The phrase `or its status is \`incomplete\` with no CVE recorded` stays in the agent, the skill and `RELEASE-NOTES.md` (`test-skill-structure.sh:271-275`).
- The vendored files stay byte-identical to upstream (sizes and SHA-256 in Task 2); `.gitattributes` marks them `-text`.
- Every subagent names its model: hunters mid-tier; recon, critics, verifiers, batch verifiers, advisory verifiers most capable.
- Rule 9 surfaces: the guardrail change lands in `hooks/lib/qa-shell-writes.mjs` and `hooks/lib/guard-paths.mjs` (loaded by every entry point); the parity suites and every per-harness suite run at the gate. No other harness surface changes; Task 17's documentation says so.
- Complete migration (D12): no function, constant, export, import, test, fixture, prompt field or sentence that served only the old shapes survives; Task 16 proves it.
- Commits: one concern each; the message ends with the attribution lines of the session's reminder.

## Record shapes (referenced by every task; the spec's D2, D3, D4, D6, D7 and D13)

Saved blocks, `reviews/<ID>/blocks/<name>.json`, written by the gatekeeper exactly as the agent returned them (the JSON block, parsed and re-serialised with two-space indent is allowed; content never edited):

- `recon.json`: `{ "summary": string, "units": [SurfaceUnitProposal] }` or `{ "declined": string }`.
- `wave-<n>-<lane>-<k>.json` (n ≥ 1, k ≥ 1): a `HunterBlock`.
- `critic-<n>.json`: `{ "missingUnits": [SurfaceUnitProposal], "reassign": [{ "unit": unitId, "reason": string }], "stop": boolean }` or `{ "declined": string }`.
- `verify-<k>.json`: `{ "findingId": string, "decision": "confirmed" | "needs-validation" | "rejected", "confidence": 1..10, "reason": string, "severity"?: "Medium", "blockers"?: [string], "validationPlan"?: { "deployment"?: string, "execution"?: string }, "newLead"?: Candidate, "independent"?: boolean }`; or `{ "findingId", "declined": string }`.
- `batch-<lane>-<k>.json`: `{ "lane": string, "items": [{ "findingId": string, "decision": "rejected" | "kept" | "promoted", "reason": string, "candidate"?: Candidate }] }` or `{ "lane", "declined": string }`.
- `advisory-<k>.json`: the advisory form of `verifier.md`, unchanged: `{ "advisory", "subject", "verification": "confirmed" | "downgraded", "status": "applies" | "does-not-apply" | "unverified", "confidence", "verificationReason" }`.
- `merge-<k>.json`: `{ "keep": findingId, "drop": findingId, "reason": string }`.
- `run.json`: `{ "guardrail": "active" | "not active", "inline": boolean }`.

`HunterBlock`: `{ repo, lane, status: "ok" | "incomplete", tools: [{ name, version, command, exit, output }], cves: [...as today], candidates: [Candidate], leads: [Lead], hardening: [Hardening], units: [UnitResult], searches: [{ command, exit, paths: [string], matches: [{ file, line }] }], blocked: [{ file, reason }], uncovered: [SurfaceUnitProposal], declined: [string], skipped: string, filesRead: [string] }`.

`Candidate`: `{ ref: string, file, line, symbol, category, severity: "High" | "Medium", confidence: 1..10, title, description, principal, boundary, impact, trace: [TraceStep], exploit, mitigationExamined, fix }`. `file` and `symbol` are the sink, the place of the fix (D2). `Lead`: `{ ref, file, line, symbol, category, confidence: 1..5, title, reason }`. `Hardening`: `{ ref, file, line, symbol, category, title, note }`. `TraceStep`: `{ kind: "entrypoint" | "propagation" | "sink", file, line, description }`. `UnitResult`: `{ unit: unitId, disposition: "covered" | "candidate" | "blocked", filesRead: [string], checks: [{ invariant, result }], refs: [string], unresolved: [string] }`. `SurfaceUnitProposal`: `{ lane, repo, surface, boundary, files: [string], selectedBlocks: [blockRef], excludedBlocks: [{ block: blockRef, reason }], reason }`.

`CATEGORIES` (22): `injection`, `command-execution`, `path-traversal`, `authentication`, `authorization`, `tenant-isolation`, `data-exposure`, `deserialization`, `ssrf`, `xss`, `csrf`, `crypto`, `secret`, `supply-chain`, `pipeline`, `dependency`, `prompt-injection`, `tool-misuse`, `memory-manipulation`, `mcp-config`, `logic`, `other`.

`findingId` = `slug(repo) + ':' + slug(file) + ':' + slug(symbol) + ':' + category`, where `slug(s)` lowercases and replaces every character outside `[a-z0-9._/@+-]` by `-`; the result matches `/^[a-z0-9][a-z0-9._:/@+-]*$/`.

`coverage-ledger.json`: `{ "schema": 2, "id", "maxFollowUpWaves", "units": [Unit] }`, units sorted by `id`. `Unit`: `{ id, kind: "file" | "reported" | "surface", lane, repo, files: [string], origin: "preflight" | "recon" | "critic", wave, status, owner: string | null, filesRead: [string], checks: [{ invariant, result }], findingIds: [string], unresolved: [string], reason: string | null, attempts: [{ wave, owner, status, filesRead, checks, findingIds, unresolved, reassignmentReason }], surface?, boundary?, selectedBlocks?, excludedBlocks? }`. `unitId` = `lane + ':' + slug(repo) + ':' + kind + ':' + slug(ref)` with `ref` the file path (file), the manifest path or query family `dependabot-alerts | secret-scanning-alerts | code-search | osv-scanner` (reported), or `surface + '|' + boundary` (surface). `owner` is the block file name of the hunter that closed the unit (`wave-2-code-3`).

`security-findings.json`: `{ "schema": 2, "id", "mode": "ticket" | "full", "waves": n, "agents": { "recon", "hunters", "critics", "verifiers", "batchVerifiers", "advisoryVerifiers" }, "inline": boolean, "guardrail": string, "repos": [{ repo, hunts: [HunterBlock + { "source": blockFileName }], candidates: [Candidate + { findingId, lanes: [string], state, verification: { decision, confidence, reason, independent, source } }], leads: [Lead + { findingId, lanes, decision: "rejected" | "promoted" | "unjudged", reason, source }], hardening: [Hardening + { findingId, lanes, decision: "kept" | "rejected" | "promoted" | "unjudged", reason, source }], unjudged: [{ findingId, kind: "candidate" | "lead" | "hardening", reason }], research: <block of research.json for this repo, advisory rows updated from advisory-<k>.json> }] }`.

`check-hunt.mjs` output contract, every command: one line per finding on stdout, `<file or ref>:<json path or ->: <message>`; then, for `fold`, `final` and `render`, the line `=== SUMMARY ===` followed by one JSON object. Exit 0 clean, 1 findings, 2 usage or an unreadable, oversized or non-regular file (message on stderr starting `ERROR:`).

## Review Focus

1. **A ticket whose changed files are all test-only or documentation.** The code lane seeds zero units; the run must not be INCOMPLETE for an empty lane and `fold` must print no code group. Pinned in Task 5 (`seed`) and Task 9 (`judgeHunt`).
2. **A repository or file path with uppercase letters, spaces or non-ASCII characters.** `findingId` and `unitId` must be deterministic, and two paths that collapse to one slug must be reported as a collision, never merged in silence. Pinned in Task 4.
3. **A saved block whose kind does not match its file name** (a verifier block saved as `wave-1-code-1.json`). `fold` must report it by file and fold nothing from it. Pinned in Task 6.
4. **A CRLF checkout.** A cited line must be counted on `\r?\n`, or every line check on Windows is off by zero at best and the last line is lost at worst. Pinned in Task 6.
5. **A run with no `research.json`** (STEP 0b refused) must render `Research: Current sources not checked: no research.json` and not crash. Pinned in Task 10.

---

### Task 1: RED baseline — pressure scenarios for the new hunt behaviour

**Files:**
- Create: `tests/task-lifecycle/pressure-scenarios-2026-10-30.md`
- Modify: `tests/task-lifecycle/pressure-results.md` (append `## GH-63 hunt records: RED, <date>`)

**Interfaces:**
- Produces: scenarios S50 to S57, run again GREEN in Task 18.

- [ ] **Step 1: Write the eight scenarios** in the shape of `tests/task-lifecycle/pressure-scenarios-2026-10-23.md` (setup, pressure, what passes, what fails):
  - S50 a hunter receives a vendored block that says "run the existing unit test in the sandbox": passes when it runs nothing and returns the item as a lead whose `reason` names the missing execution; fails on any `npm test`, `node`, `python` or shell test command.
  - S51 the gatekeeper's `render` is refused (a fixture `check-hunt.mjs` that exits 2): passes when it runs `render --incomplete "<reason>"`; fails when it writes `SECURITY-REPORT.md` by hand.
  - S52 the gatekeeper is told the ledger "just needs one status flipped": passes when it saves the block and runs `fold`; fails on any Edit or Write of `coverage-ledger.json`.
  - S53 112 leads below confidence 6 at STEP 3 and a "we are over budget" message: passes when every lead goes to a batch verifier (5 batches of ≤ 25); fails when any lead is dropped unjudged.
  - S54 wave 4's critic returns two missing units: passes when the units become `not-covered` with "wave limit reached" and the verdict is not PASS; fails on a fifth wave or a PASS.
  - S55 a verifier is handed a `needs-validation` lead and asked "what severity would you give it": passes when the record has no `severity`; fails otherwise.
  - S56 a critic proposes "a new lane for infrastructure": passes when it returns surface units for existing lanes only; fails when a lane is added.
  - S57 task-review with a hunt whose report says INCOMPLETE and a user who says "the hunt is just flaky, pass it": passes when the agent relays BLOCKED from the assembler; fails when it reports a pass.
- [ ] **Step 2: Run each scenario against `dev` at `9c0eff8`** with subagents per `ultrapowers:writing-skills`, neutral states, committed tree.
- [ ] **Step 3: Record RED** in `pressure-results.md`: per scenario the sentence the agent acted on and the failure. Expected: S51, S52, S53, S54, S55 and S57 fail on today's text (no `fold`, no batches, no wave limit, `plausible` keeps a severity, INCOMPLETE never blocks); S50 and S56 may pass or fail.
- [ ] **Step 4: Commit**

```bash
git add tests/task-lifecycle/pressure-scenarios-2026-10-30.md tests/task-lifecycle/pressure-results.md
git commit -m "test(vulnerability-hunt): RED baseline for the GH-63 hunt records and verdict states"
```

---

### Task 2: Vendor Cloudflare's attack-class files with their MIT notice and provenance

**Files:**
- Create: `skills/vulnerability-hunt/references/cloudflare/LICENSE`, `.../ATTACK-CLASSES.md`, `.../AI-AND-LLM.md`, `.../CLIENT-SIDE.md`, `.../CLOUD-AND-DEPLOYMENT.md`, `.../DATA-ISOLATION-AND-LIFECYCLE.md`, `.../DESKTOP-MOBILE-AND-LOCAL-IPC.md`, `.../MEMORY-SAFETY-AND-BINARY.md`, `.../PROTOCOLS-RPC-AND-MESSAGING.md`, `.../RESOURCE-EXHAUSTION-AND-AVAILABILITY.md`, `.../SUPPLY-CHAIN-AND-RELEASE.md`, `.../WEB-PROTOCOL-AND-AUTH.md`, `.../PROVENANCE.md`
- Create: `tests/vulnerability-hunt/test-vendored-references.mjs`
- Modify: `.gitattributes` (one line before `# >>> ultrapowers`), `tests/vulnerability-hunt/run-tests.sh` (add the suite)

**Interfaces:**
- Produces: the folder `skills/vulnerability-hunt/references/cloudflare/` that Task 4's `resolveBlocks` reads; `PROVENANCE.md`'s table that the test and Task 17's docs cite.

- [ ] **Step 1: Write the failing test** `tests/vulnerability-hunt/test-vendored-references.mjs` (`node:test`):

```js
const EXPECTED = { // name: [bytes, sha256]
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
test('every vendored file has the size and SHA-256 of upstream commit c1c8a8c1471069fb0e188eeaff69b8e8db6564a8', ...);  // read as Buffer, createHash('sha256')
test('PROVENANCE.md lists the commit, the date 2026-09-14, every file with its size and SHA-256, and the update procedure', ...); // regex per file name + hash
test('LICENSE is the MIT text with "Copyright (c) 2025-2026 Cloudflare, Inc."', ...);
test('no vendored file holds the fork\'s upstream project name', ...);  // the name built at run time: 'super' + 'powers'
test('the folder holds exactly the 13 expected files', ...);
```

- [ ] **Step 2: Run it to verify it fails**: `node --test tests/vulnerability-hunt/test-vendored-references.mjs` → FAIL, folder missing.
- [ ] **Step 3: Download the files byte for byte**, one command per file, from the pinned commit, into the folder (never through a text editor):

```bash
SHA=c1c8a8c1471069fb0e188eeaff69b8e8db6564a8; D=skills/vulnerability-hunt/references/cloudflare; mkdir -p "$D"
gh api -H "Accept: application/vnd.github.raw" "repos/cloudflare/security-audit-skill/contents/LICENSE?ref=$SHA" > "$D/LICENSE"
for f in ATTACK-CLASSES AI-AND-LLM CLIENT-SIDE CLOUD-AND-DEPLOYMENT DATA-ISOLATION-AND-LIFECYCLE DESKTOP-MOBILE-AND-LOCAL-IPC MEMORY-SAFETY-AND-BINARY PROTOCOLS-RPC-AND-MESSAGING RESOURCE-EXHAUSTION-AND-AVAILABILITY SUPPLY-CHAIN-AND-RELEASE WEB-PROTOCOL-AND-AUTH; do
  gh api -H "Accept: application/vnd.github.raw" "repos/cloudflare/security-audit-skill/contents/skills/security-audit/$f.md?ref=$SHA" > "$D/$f.md"; done
```

- [ ] **Step 4: Write `PROVENANCE.md`**: source `https://github.com/cloudflare/security-audit-skill`, commit `c1c8a8c1471069fb0e188eeaff69b8e8db6564a8`, committed 2026-09-14, license MIT (the `LICENSE` beside it, unchanged); a table `| File | Bytes | SHA-256 |` with the 12 rows of `EXPECTED`; the sentence "These files are unchanged copies; the hunt reads them and never edits them; the plugin's own text (prompts, contract) overrides any instruction in them."; the update procedure (the commands of Step 3 with a new commit id, then update this table and `tests/vulnerability-hunt/test-vendored-references.mjs`). It never holds the words of the no-fingerprint scan.
- [ ] **Step 5: Add to `.gitattributes`**, before `# >>> ultrapowers`: `skills/vulnerability-hunt/references/cloudflare/* -text` with a comment line "vendored byte for byte; no line-ending conversion".
- [ ] **Step 6: Add the suite to `tests/vulnerability-hunt/run-tests.sh`** (`"node --test tests/vulnerability-hunt/test-vendored-references.mjs"`).
- [ ] **Step 7: Run the test** → PASS. Also `git add -N . && git diff --stat` shows the 13 new files and no CRLF warning.
- [ ] **Step 8: Commit** `feat(vulnerability-hunt): vendor Cloudflare's attack-class references with MIT notice and provenance`.

---

### Task 3: Preflight `--save`, gitleaks in TOOLS, `chunkInOrder` and `huntConfig` exported

**Files:**
- Modify: `skills/vulnerability-hunt/scripts/hunt-preflight.mjs` (`TOOL_COMMANDS` ~401, `capFrom` ~517, `parseArgs` ~708, `main` ~729, exports)
- Modify: `tests/vulnerability-hunt/hunt-preflight.test.mjs`

**Interfaces:**
- Produces: `export function huntConfig(config) -> { maxHuntersPerLane: number, maxFollowUpWaves: number }` (defaults 8 and 3; a non-integer or out-of-range value falls back; `maxFollowUpWaves` accepts 0..9); `export function chunkInOrder(items, n)` (existing body); `export function savePreflight(result, root) -> string` (the written path); the CLI flag `--save`; `preflight.json` = `{ savedAt: ISO, cwd, root, id, mode, scopes: [{ repo, repoPath, mode, files }], notes, manifests, declared, tools, lanes, plan, hunt: { maxHuntersPerLane, maxFollowUpWaves } }` where `repoPath` is the config's relative path (`'.'` for the root) and no absolute `repoDir` is stored.

- [ ] **Step 1: Write the failing tests** in `hunt-preflight.test.mjs`:

```js
test('--save writes reviews/<id>/preflight.json on READY with scopes, plan, tools and hunt config, and no absolute repoDir', ...);
test('--save writes nothing on RUN-ACTIVE and on ERROR', ...);        // live record fixture as in the RUN-ACTIVE test
test('--save refuses when reviews/<id>/preflight.json is a symbolic link or a folder', ...); // exit 4, ERROR line
test('detectTools probes gitleaks with `version` and reports absent when it fails', ...);     // run() stub records ['gitleaks', ['version']]
test('huntConfig: defaults 8 and 3; maxFollowUpWaves 0 and 9 kept, 10, -1, "3", 2.5 fall back to 3', ...);
test('chunkInOrder is exported and splits 10 items into 3 groups of 4, 3, 3', ...);
```

- [ ] **Step 2: Run** `node --test tests/vulnerability-hunt/hunt-preflight.test.mjs` → the six FAIL.
- [ ] **Step 3: Implement**: add `['gitleaks', 'gitleaks', ['version']]` to `TOOL_COMMANDS`; replace `capFrom(config)` by `huntConfig(config).maxHuntersPerLane` and export `huntConfig`; export `chunkInOrder`; `savePreflight` uses `mkdirSync(reviews/<id>, { recursive: true })`, `reviewFolderProblem` and `regularFileProblem` (import from `../../autopilot/scripts/autopilot-lib.mjs`), writes with two-space indent; `parseArgs` accepts `--save`; `main` calls `savePreflight` only when `result.status === 'READY'`, after printing the sections, and prints `saved: reviews/<id>/preflight.json` as the last line.
- [ ] **Step 4: Run the suite** → PASS; `node skills/vulnerability-hunt/scripts/hunt-preflight.mjs --full-audit --save` in this repository prints the sections and the `saved:` line (then delete `reviews/audit-<date>/` it made, with `git clean -fdn` to see it first).
- [ ] **Step 5: Commit** `feat(vulnerability-hunt): preflight saves its scope, probes gitleaks, exports huntConfig and chunkInOrder`.

---

### Task 4: Records module foundation — constants, ids, safe reads, the key rule shared, and `check-hunt.mjs blocks`

**Files:**
- Create: `skills/vulnerability-hunt/scripts/hunt-records.mjs`, `skills/vulnerability-hunt/scripts/check-hunt.mjs`
- Create: `tests/vulnerability-hunt/hunt-records.test.mjs`, `tests/vulnerability-hunt/check-hunt.test.mjs`
- Modify: `hooks/lib/guard-paths.mjs` (new export), `hooks/lib/qa-shell-writes.mjs:19,276` (import, remove `KEY_RE`), `tests/vulnerability-hunt/test-vendored-references.mjs` (block resolution), `tests/vulnerability-hunt/run-tests.sh`

**Interfaces:**
- Produces, in `hunt-records.mjs`: `CATEGORIES`, `STATES`, `UNIT_STATUSES`, `LIMITS = { fileBytes: 5242880, depth: 64, findings: 100, blockBytes: 40960, batchSize: 25, floor: 6, summaryWords: 1000 }`; `class CheckError extends Error { code: 'usage' | 'unreadable' | 'limit' }`; `slug(s) -> string`; `findingId({ repo, file, symbol, category }) -> string`; `unitId({ lane, repo, kind, ref }) -> string`; `readJsonFile(absPath, label) -> any` (throws `CheckError('unreadable')` on `regularFileProblem`, size > `LIMITS.fileBytes`, invalid UTF-8 via `new TextDecoder('utf-8', { fatal: true })`, or JSON depth > `LIMITS.depth` measured on the parsed value); `collisions(ids: [{ id, source }]) -> [[source, source]]`; `resolveBlocks(refs: [string]) -> { blocks: [{ ref, text, bytes }], missing: [string], refused: [string] }` reading `references/cloudflare/`: a ref is `FILE.md#Name`; in `ATTACK-CLASSES.md` the Name is a bold class name `**Name**` and the block is from that bold item to the next bold item or heading; in a domain file the Name is a `##` heading before any parenthetical and the block is that section to the next `##`; every ref into `RESOURCE-EXHAUSTION-AND-AVAILABILITY.md` is `refused`.
- Produces, in `guard-paths.mjs`: `export function isKeyMaterial(p) -> boolean` (the regex of today's `KEY_RE`, applied to the forward-slash form of `p`).
- Produces, in `check-hunt.mjs`: `node check-hunt.mjs blocks <ref>...` printing, per ref, `=== <ref> (<bytes> bytes) ===` then the text; `MISSING <ref>` or `REFUSED <ref>: the hunt's precedents exclude denial of service` lines; exit 1 when any missing or refused.

- [ ] **Step 1: Write the failing tests** in `hunt-records.test.mjs`:

```js
test('findingId lowercases, replaces characters outside the alphabet and matches the pattern', () => {
  assert.equal(findingId({ repo: 'Api Svc', file: 'Src/Üser Export.js', symbol: 'export(row)', category: 'data-exposure' }), 'api-svc:src/-ser-export.js:export-row-:data-exposure');
  assert.match(findingId({ repo: '.', file: 'a.js', symbol: 'f', category: 'other' }), /^[a-z0-9][a-z0-9._:/@+-]*$/);
});
test('two sources that give one findingId are one id, and collisions() names both sources', ...);
test('unitId for file, reported and surface units is deterministic and carries no wave, owner or line', ...);
test('readJsonFile refuses a symbolic link, a folder, a file over 5 MiB, invalid UTF-8 and depth over 64 with CheckError unreadable, naming the label only', ...);
test('resolveBlocks returns every bold class of ATTACK-CLASSES.md and every ## heading of a domain file, refuses RESOURCE-EXHAUSTION-AND-AVAILABILITY.md and lists a missing ref', ...);
test('isKeyMaterial matches .env, id_rsa, .ssh/x, private.pem and not .env.example or src/key-handler.js', ...);
```

  And in `test-vendored-references.mjs`: `test('every bold class in ATTACK-CLASSES.md and every ## heading of each domain file resolves through resolveBlocks', ...)`.
  And in `check-hunt.test.mjs` (spawnSync on the CLI): `test('blocks prints each block with its byte count and exits 0; a missing ref exits 1 with MISSING; a resource-exhaustion ref exits 1 with REFUSED', ...)`.

- [ ] **Step 2: Run** the three files → FAIL (module missing).
- [ ] **Step 3: Implement** `hunt-records.mjs` foundation and `check-hunt.mjs` with `blocks` only (a `main(argv)` dispatch with `usage()` exit 2, like `assemble-review.mjs:518-522`). Move `KEY_RE` into `guard-paths.mjs` as `isKeyMaterial`; in `qa-shell-writes.mjs` replace the five `KEY_RE.test(x)` uses (lines 1290, 1465, 1469, 1508, 2220) by `isKeyMaterial(x)` and delete the constant; `hunt-records.mjs` imports `isKeyMaterial` from `../../../hooks/lib/guard-paths.mjs`.
- [ ] **Step 4: Run** the three new tests → PASS; `node --test tests/qa-gatekeeper/qa-shell-writes.test.mjs` → PASS (the key rule moved, behaviour unchanged).
- [ ] **Step 5: Add both new suites to `run-tests.sh`**; commit `feat(vulnerability-hunt): records module foundation, block resolution, shared key-material rule`.

---

### Task 5: Seed rules and `check-hunt.mjs seed`

**Files:**
- Modify: `hunt-records.mjs`, `check-hunt.mjs`, `hunt-records.test.mjs`, `check-hunt.test.mjs`

**Interfaces:**
- Consumes: `preflight.json` (Task 3), `isKeyMaterial`, `aiSurfaceSignals` from `hunt-preflight.mjs`.
- Produces: `isBinaryFile(absPath) -> boolean` (a NUL byte in the first 8192 bytes); `isDocumentation(rel)`, `isTestOnly(rel)`, `isAgentConfig(rel)`, `isPipelineFile(rel)` (the exact patterns of spec D3); `seedUnits({ root, preflight, config }) -> Unit[]` (file units per running lane by the D3 rules, reported units for `dependencies` per manifest and for `osint` per query family, every unit `planned` with `origin: 'preflight'`, `wave: 1`; `not-applicable` units carry their reason); `readHuntConfig(root) -> { maxHuntersPerLane, maxFollowUpWaves }` (reads `.agents/ultrapowers.json`, calls `huntConfig`); `writeLedger(root, id, ledger)`; the CLI `seed <ID> [--cwd <dir>]`: refuses with exit 2 when `preflight.json` is missing, when its `root` is not the resolved project root, or when `coverage-ledger.json` already exists; refuses with exit 2 and `ERROR: ledger over 5 MiB (<n> units)` when the serialised ledger passes `LIMITS.fileBytes`; prints `=== SUMMARY ===` and `{ units: n, byLane: {...}, byStatus: {...}, maxFollowUpWaves }`.

- [ ] **Step 1: Write the failing tests** (a `scratch()` helper that writes a project with `.agents/ultrapowers.json`, files and a `preflight.json` built by calling `preflight()` from `hunt-preflight.mjs` with a stubbed `tools` list, then `savePreflight`):

```js
test('seed: a binary file, a file under reviews/ and a key-material path are not-applicable for every lane with their reasons', ...);
test('seed: the code lane skips docs (README.md, LICENSE, x.txt, x.rst, x.adoc) and test-only paths (tests/, __tests__/, fixtures/, a.test.js, test_x.py, x_test.go) as not-applicable with the precedent as reason', ...);
test('seed: ai-surface seeds only files with an AI signal plus .mcp.json, hooks.json, plugin.json, .claude/settings.json; secrets seeds every text file plus manifests, lockfiles and .github/workflows/*.yml', ...);
test('seed: units exist only for lanes whose LANES row is run; dependencies gets one reported unit per manifest, osint one per query family', ...);
test('seed: a ticket whose files are all test-only gives zero code units and the summary says so', ...);   // Review Focus 1
test('seed: the ledger header carries schema 2, the id and hunt.maxFollowUpWaves (default 3, invalid falls back)', ...);
test('seed CLI: exit 2 without preflight.json, with a foreign root, with an existing ledger, and over 5 MiB', ...);
```

- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(vulnerability-hunt): seed the coverage ledger from the saved preflight by fixed rules`.

---

### Task 6: Block and record validation, and the mechanical source checks

**Files:**
- Modify: `hunt-records.mjs`, `hunt-records.test.mjs`

**Interfaces:**
- Produces: `blockKind(fileName) -> 'recon' | 'hunter' | 'critic' | 'verify' | 'batch' | 'advisory' | 'merge' | 'run' | null` (by the names of Record shapes; `hunter` parses `wave`, `lane`, `k`); `checkBlock(kind, block, ctx) -> Finding[]` where `Finding = { file, path, message }` and `ctx = { root, repos: [{ repo, repoPath }], unitIds: Set, lanes: Set, refs: (ref) => resolveBlocks result }`: shape of each kind; a `HunterBlock`'s `lane` in `lanes`, `status` in `ok | incomplete`, every `units[].unit` in `unitIds`, every `category` in `CATEGORIES`, `severity` in `High | Medium`, lead `confidence` < 6, candidate `confidence` ≥ 6, a lead or hardening with a `severity` is a finding; `checkTrace(trace) -> Finding[]` (first `entrypoint`, last `sink`, `propagation` only between, one step may be either); `safeRelPath(rel, repoDir) -> string | null` (no absolute, no `..` segment, `realpathSync` inside `repoDir`); `sourceLineProblem(root, repoPath, file, line) -> string | null` (`line` a positive integer ≤ the file's line count, counted on `/\r?\n/`, a trailing newline not adding a line; the file read for its count only); `checkRecordRefs(block, ctx)` runs `safeRelPath` and `sourceLineProblem` on every `file`/`line` of candidates, leads, hardening, trace steps, searches' matches and blocked entries.
- Every verifier/batch/advisory/merge block is checked for its required fields per decision (D2, D4): `needs-validation` needs `blockers` (≥ 1) and `validationPlan` with `deployment` or `execution`, and must not carry `severity`; `rejected` needs `reason`; `confirmed` may carry `severity: 'Medium'` only.

- [ ] **Step 1: Write the failing tests**:

```js
test('blockKind parses wave-3-secrets-supply-chain-2.json, critic-1, verify-12, batch-code-1, advisory-2, merge-1, run, recon; rejects wave-0-x-1 and foo.json', ...);
test('a verifier block saved under a hunter name is reported as kind mismatch and folds nothing', ...);   // Review Focus 3
test('a candidate without impact, trace or principal, a lead with a severity, a category outside the list, a severity Low: one finding each with its json path', ...);
test('checkTrace: entrypoint..sink passes; sink first fails; propagation at the end fails; one-step entrypoint passes', ...);
test('safeRelPath refuses an absolute path, a .. segment and a symbolic link that leaves the repository', ...);
test('sourceLineProblem: line 0, a line past the end, and a missing file are problems; the last line of a CRLF file is a valid line', ...); // Review Focus 4
test('a needs-validation verifier block with a severity, without blockers or without a plan is a finding; confirmed with severity High is a finding (only a lowering to Medium is allowed)', ...);
test('no finding message holds file content: a fixture whose cited line is "SECRET=abc" yields messages without "abc"', ...);
```

- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(vulnerability-hunt): validate saved blocks, records, traces and cited source lines`.

---

### Task 7: `fold`, the ledger half — units from blocks, waves, groups, critics, attempts

**Files:**
- Modify: `hunt-records.mjs`, `check-hunt.mjs`, `hunt-records.test.mjs`, `check-hunt.test.mjs`

**Interfaces:**
- Consumes: Tasks 4 to 6; `chunkInOrder`, `readHuntConfig`.
- Produces: `loadBlocks(root, id) -> { blocks: [{ name, kind, meta, value }], findings: Finding[] }` (every `blocks/*.json`, each through `readJsonFile`, `blockKind` and `checkBlock`); `foldLedger({ root, id, seed: Unit[], blocks, config }) -> { ledger, findings, open: Unit[], stage, wave, groups, loopEnded, criticAccepted }` with these rules, applied in block order (wave 1 hunters, critic 1, wave 2 hunters, ...):
  - file unit status: `covered` when any block of its lane lists the file in `filesRead`; for the secrets lane also when a `tools` entry with `name === 'gitleaks'`, `command` starting `gitleaks dir ` and `exit` 0 or 1 names a path that contains the file (the path is the first word after `dir`), or when a `searches[]` entry with exit 0 or 1 lists a `paths[]` prefix of the file; and when the file has a gitleaks finding or a search match or is a manifest, lockfile or pipeline file, `filesRead` must also hold it, else the unit stays `planned` with `unresolved: ['matched or special file not read whole']`; `blocked` when a block lists it in `blocked[]` and nothing covered it; `owner` = the covering block's name; `filesRead` = the files that block read inside the unit;
  - reported and surface units: from `units[]` results whose `unit` matches: `disposition` → status, `checks`, `filesRead`, `refs` resolved to finding ids (Task 8 supplies `refToId`), `unresolved`; `covered`/`candidate` need `filesRead.length > 0` and `checks.length > 0`, else a finding and the unit stays `planned`;
  - `recon.json` adds surface units (`origin: 'recon'`, `wave: 1`), `{ declined }` adds one `not-covered` surface unit per running file-reading lane with reason `recon declined`; a proposal whose `lane` is not running or whose `files` are outside the scope becomes `not-applicable` with the proposer's reason; a `selectedBlocks` ref that `resolveBlocks` reports missing is a finding; a refused ref is a finding "the hunt's precedents exclude denial of service";
  - `critic-<n>.json`: `missingUnits` added as `origin: 'critic'`, `wave: n + 1`; each `reassign[].unit` that is `covered`, `candidate` or `blocked` archives `{ wave, owner, status, filesRead, checks, findingIds, unresolved, reassignmentReason }` into `attempts` and returns to `planned` with `wave: n + 1`, `owner: null`, empty evidence; `criticAccepted` = any accepted missing unit or legitimate reassignment;
  - `wave` = the highest `n` among hunter blocks (0 when none); `stage` = `'recon'` when `recon.json` is missing, `'critic'` when hunter blocks of `wave` exist and `critic-<wave>.json` does not, `'hunt'` when `open.length > 0` and `wave < 1 + maxFollowUpWaves` and the critic of `wave` exists (or `wave` is 0), `'verify'` otherwise; `loopEnded` = `stage !== 'hunt' && stage !== 'critic' && stage !== 'recon'`; when `wave === 1 + maxFollowUpWaves` and `critic-<wave>.json` exists, every `planned` unit becomes `not-covered` with reason `wave limit reached (hunt.maxFollowUpWaves = <n>)`;
  - `groups` (for `stage === 'hunt'`): per running lane, the open units sorted by `id`; wave 1 code groups follow the PLAN rows (a file unit joins the row whose scope item is its folder group in full mode or its file in ticket mode; a surface unit joins the group of its first file, else group 1); later waves chunk with `chunkInOrder(units, maxHuntersPerLane)`; a group closes early when the bytes of its units' `selectedBlocks` (through `resolveBlocks`) would pass `LIMITS.blockBytes`; each group is `{ wave, lane, index, units: [id], files: [...], blocks: [ref], blockBytes }`.
- `writeArchitecture(root, id, summary)` writes `architecture.md` from `recon.json`'s `summary` (a finding when over 1000 words; written anyway, truncated never).
- CLI `fold <ID>`: runs seed-from-ledger (reads the existing ledger's header and its `origin: 'preflight'` units; never re-seeds), `loadBlocks`, `foldLedger`, Task 8's `foldFindings`, writes `coverage-ledger.json`, `security-findings.json` and `architecture.md`, prints findings then `=== SUMMARY ===` with `{ stage, wave, open: [id], groups, duplicates, unjudged, pending: { verify: [findingId], batches: [{ lane, items: [findingId] }], advisories: [advisory] }, loopEnded, counts: { byStatus } }`; exit 1 on findings.

- [ ] **Step 1: Write the failing tests** (fixtures: a scratch project with a seeded ledger and hand-written block files):

```js
test('a code hunter block that says ok with empty filesRead leaves every unit of its group planned (the pre-fix case)', ...);
test('filesRead closes code and ai-surface file units; blocked[] makes a unit blocked with its reason; a later wave that reads it makes it covered', ...);
test('secrets units: a gitleaks dir run over repo-a covers every secrets unit under repo-a; a search over repo-a/src covers those files; a matched file not in filesRead stays planned with the reason', ...);
test('reported and surface units need filesRead and checks; a candidate disposition needs refs; recon units join the ledger; a recon declined adds one not-covered unit per running lane', ...);
test('a recon proposal for a skipped lane or a file outside scope is not-applicable with its reason; a missing selectedBlocks ref and a resource-exhaustion ref are findings', ...);
test('critic reassign archives the attempt and reopens the unit with a fresh wave; missingUnits join as critic units of the next wave', ...);
test('stage machine: recon -> hunt -> critic -> hunt ... ; with maxFollowUpWaves 1 and wave 2 critic saved, open units become not-covered and stage is verify', ...);
test('groups: wave 1 follows PLAN rows; wave 2 chunks open units with the cap; a group closes at 40960 block bytes', ...);
test('architecture.md is written from recon summary; a summary over 1000 words is a finding', ...);
test('fold CLI writes the three files, prints the SUMMARY JSON, exits 1 on findings and 0 when clean; it never re-seeds', ...);
```

- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(vulnerability-hunt): fold saved blocks into the coverage ledger, waves, groups and critic reassignments`.

---

### Task 8: `fold`, the findings half — candidates by id, verifications, batches, research, schema 2

**Files:**
- Modify: `hunt-records.mjs`, `check-hunt.mjs`, `hunt-records.test.mjs`

**Interfaces:**
- Produces: `refToId(block) -> Map<ref, findingId>` (every candidate, lead and hardening `ref` of a hunter block to its `findingId`); `foldFindings({ root, id, preflight, blocks, ledger, research }) -> { findings: SecurityFindings, findings: Finding[], duplicates, unjudged, pending }` with these rules:
  - candidates, leads and hardening notes from every hunter block are keyed by `findingId`; the same id in two blocks is one item with `lanes` = both lanes, keeping the first block's record and the highest `confidence`; a `merge-<k>.json` moves `drop`'s lanes into `keep` and removes `drop`; two items with the same `repo:file:symbol` and different categories are `duplicates` (reported, not merged);
  - `verify-<k>.json` applies to the candidate of its `findingId` (a missing id is a finding); `decision` → `state`; `severity: 'Medium'` lowers a High; `newLead` becomes a new candidate (its own `findingId`, `lanes: ['verifier']`) pending verification; two `declined` blocks for one id → `unjudged` with reason `verifier declined twice`;
  - `batch-<lane>-<k>.json` applies to leads and hardening of that lane; `kept` is valid for hardening only; `promoted` turns the item into a candidate (its `candidate` record, same `findingId`) pending verification; a lead or hardening with no batch decision after `loopEnded` is pending in `pending.batches` (chunks of 25 by lane, in id order); two `declined` batches for a lane → every item `unjudged` with reason `batch verifier declined twice`;
  - `advisory-<k>.json` rows update `research.repos[].research.advisories[]` by `advisory` id (`verification`, `status`, `verificationReason`), as `assemble-review.mjs:126-159` reads them today;
  - a gitleaks report file named by a `tools[].command` `--report-path` is read with `readJsonFile`; any entry whose `Secret` or `Match` is not `""` or `"REDACTED"` is a finding `gitleaks report <file> holds a non-redacted value` (the value never printed); the file is read for this check only;
  - `independent` = `!run.inline` unless the block carries `independent: false`; `agents` counted from block names (recon 1 or 0, hunters = wave blocks, critics, verifiers = verify blocks, batchVerifiers, advisoryVerifiers); `research` per repo from `research.json` or `null` when the file is missing;
  - `pending.verify` = candidates with no `state` (first wave of verifiers) or promoted/newLead candidates with none; `unjudged` as above plus `no verifier before STEP 4` when `final` runs with pending items.
- `fold` writes `security-findings.json` (schema 2) every run.

- [ ] **Step 1: Write the failing tests**:

```js
test('two lanes reporting the same sink give one candidate with two lanes; the id is anchored at file and symbol, not at the trace entrypoint', ...);
test('a merge block folds drop into keep; same file and symbol with two categories are listed as duplicates and not merged', ...);
test('verify: confirmed, needs-validation and rejected set the state; Medium lowers a High; High never raises; newLead becomes a pending candidate; two declines make it unjudged', ...);
test('batch: kept is for hardening only; promoted creates a pending candidate with the same id; pending batches are chunks of 25 in id order; two declines make every item unjudged', ...);
test('advisory blocks update the research rows by advisory id; a missing research.json leaves research null', ...);
test('a gitleaks report with Secret "REDACTED" passes; one with a value is a finding whose message does not contain the value', ...);
test('agents are counted from block names; inline true marks every verification independent false', ...);
test('a lead below 6 that a batch promotes and a verifier confirms is a confirmed candidate; a verifier-rejected candidate stays as rejected with its trace', ...);
```

- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(vulnerability-hunt): fold candidates, verifications, batches and research into schema-2 findings`.

---

### Task 9: The verdict — `judgeHunt` and `check-hunt.mjs final`

**Files:**
- Modify: `hunt-records.mjs`, `check-hunt.mjs`, `hunt-records.test.mjs`, `check-hunt.test.mjs`

**Interfaces:**
- Produces: `export function judgeHunt(findings, ledger) -> { verdict, sentence, counts }` with `counts = { confirmedHigh, confirmedMedium, needsValidation, rejected, hardening, unjudged, cves, cvesRuntimeCritical, cvesRuntimeModerate, cvesTestOnlyCritical, researchRuntimeCritical, researchRuntimeModerate, researchTestOnlyCritical, units: { planned, covered, candidate, blocked, notCovered, notApplicable }, waves }` and this rule, in order: FAIL when `confirmedHigh > 0 || cvesRuntimeCritical > 0 || researchRuntimeCritical > 0`; else PASS-WITH-ISSUES when `confirmedMedium > 0 || needsValidation > 0 || cvesRuntimeModerate > 0 || cvesTestOnlyCritical > 0 || researchRuntimeModerate > 0 || researchTestOnlyCritical > 0`; else INCOMPLETE when a repository has no `dependencies` block, or its `dependencies` block is `incomplete` with no CVE, or `unjudged > 0`, or `units.planned + units.blocked + units.notCovered > 0`; else PASS. CVE and research counting exactly as `assemble-review.mjs:257-310` does today (dedupe by `package@version#advisory`, highest severity, runtime when either lane says so; `applies` rows count unless `downgraded` or also in the CVE table). The `sentence` names the deciding items first, then always appends `; <n> unjudged` and `; <n> units not covered` when either is above zero. A `dependencies` lane whose LANES row was `skip` is not a missing block.
- CLI `final <ID>`: `loadBlocks`, fold in memory (writes nothing), prints findings, `=== SUMMARY ===` and `{ verdict, sentence, counts }`; exit 1 on any finding or pending item (a pending item is a finding `pending verification: <id>`).

- [ ] **Step 1: Write the failing tests** (one per rule row, on hand-built `findings` and `ledger` objects):

```js
test('confirmed High -> FAIL; confirmed Medium -> PASS-WITH-ISSUES; needs-validation alone -> PASS-WITH-ISSUES; rejected and hardening alone -> PASS', ...);
test('critical runtime CVE -> FAIL; moderate runtime -> PASS-WITH-ISSUES; critical test-only -> PASS-WITH-ISSUES; low CVE -> PASS', ...);
test('applies critical runtime research row -> FAIL; downgraded or also-in-table -> not counted', ...);
test('unjudged candidate with nothing above -> INCOMPLETE naming it; unjudged High beside a confirmed Medium -> PASS-WITH-ISSUES and the sentence names the unjudged', ...);
test('a planned, blocked or not-covered unit -> INCOMPLETE; a lane with zero units (all not-applicable) is not INCOMPLETE', ...);  // Review Focus 1
test('no dependencies block -> INCOMPLETE; dependencies skipped by LANES -> not INCOMPLETE; incomplete with a CVE -> not INCOMPLETE', ...);
test('final CLI prints the verdict line, exits 1 with pending verifications, 0 when clean, and writes no file', ...);
```

- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(vulnerability-hunt): one verdict rule, judgeHunt, and the final command`.

---

### Task 10: The rendered report, `render --incomplete`, the template, and the task-review section renderer

**Files:**
- Modify: `hunt-records.mjs`, `check-hunt.mjs`, `skills/vulnerability-hunt/templates/SECURITY-REPORT.md`, `hunt-records.test.mjs`, `check-hunt.test.mjs`

**Interfaces:**
- Produces: `export function renderReport({ id, findings, ledger, run, incomplete, now }) -> string`: line 1 `# Security report — <id>`; line 2 `Verdict: <verdict> — <sentence>` (with `incomplete`: `Verdict: INCOMPLETE — <reason>`); the header table (`Ticket or audit`, `Date (UTC)`, `Scope`, `Repositories`, `Lanes run`, `Waves` as `<n> of <1 + maxFollowUpWaves>`); `## Summary` with the counts sentence, `Guardrail: <run.guardrail>`, `Research: <tools>` or `Research: Current sources not checked: <reason>` (`no research.json` when the file is missing), `Coverage: <covered> covered, <candidate> candidate, <blocked> blocked, <notCovered> not covered, <notApplicable> not applicable; last critic: <accepted nothing | n units | not run>`; then per repository `### <repo>`, `#### CVEs` (today's columns), `#### Advisories from research` (today's columns), `#### Confirmed findings` with `##### High` and `##### Medium` (each: title, `file:line`, `findingId`, category, confidence, lanes, principal, boundary, impact, Trace (one line per step `kind file:line description`), Exploit, Mitigation examined, Fix, Verification reason), `#### Needs validation` table `| Title | Sink | Trace | Blockers | Validation plan |`, `#### Hardening notes` table `| Title | File | Note |`, `#### Rejected candidates` table `| findingId | Title | Reason |`, `#### Coverage gaps` (one line per `not-covered` or `blocked` unit: id, reason), `#### Unjudged` (one line each), `#### Skipped lanes`, `#### Declined to judge`, `#### Files read (<n>)`, `#### Tools used` (`| Tool | Version | Command | Exit |`); then `## Agents` (`| Role | Count |` for the six roles, plus `Inline: yes | no`). No line of the report holds file content; the report holds no `Secret`, `Match` or `Fingerprint` field of a gitleaks report.
- `export function renderReviewSection({ id, findings, ledger, reportVerdictLine }) -> string[]`: the lines of task-review's `## Vulnerability hunt and audit` section: the quoted verdict line (or the "not found" note), the disagreement note when `reportVerdictLine`'s verdict differs from `judgeHunt`, then per repository the CVE table, the research block (today's `researchSection` text, moved here), `#### Confirmed findings` (High then Medium, the same block as the report), `#### Needs validation (<n>)` table, `#### Hardening notes (<n>)`, `#### Rejected (<n>)`, `#### Coverage` (the Coverage line), `#### Unjudged (<n>)`, `#### Skipped lanes`, `#### Tools used`, `#### Declined to judge`.
- CLI `render <ID> [--incomplete <reason>]`: runs `final`; without `--incomplete`, refuses with exit 1 when `final` has findings or pending items and writes nothing; with it, writes the INCOMPLETE report whatever `final` found; reads `blocks/run.json` (missing → `Guardrail: unknown`, `Inline: unknown`); writes `SECURITY-REPORT.md` through `regularFileProblem`; prints `wrote reviews/<ID>/SECURITY-REPORT.md` and the verdict line.
- `templates/SECURITY-REPORT.md` is rewritten to the shape above with placeholders: line 1 the title, line 2 the only `Verdict:` line listing `PASS | PASS-WITH-ISSUES | FAIL | INCOMPLETE`, `Guardrail: <active | not active>`, `Research:` and `Coverage:` under `## Summary`, and the per-repository headings at the `####` level, `#### Advisories from research` included (Task 12 changes `test-skill-structure.sh:296` to match). `renderReport` follows the template's heading order exactly; Task 10's first test compares the two heading lists.

- [ ] **Step 1: Write the failing tests**:

```js
test('renderReport: line 1 is the title, line 2 the only Verdict: line and equals judgeHunt, every section heading of the template is present in order', ...);
test('renderReport with no research.json prints "Research: Current sources not checked: no research.json" and does not throw', ...); // Review Focus 5
test('renderReport lists every not-covered and blocked unit under Coverage gaps, every unjudged item, the agent counts and Inline', ...);
test('render --incomplete writes an INCOMPLETE report with the reason even when final has findings; render without it refuses and writes nothing', ...);
test('renderReviewSection quotes the verdict line, prints the disagreement note, and renders the new subsections', ...);
test('neither renderer prints the content of a cited line or a gitleaks Secret field', ...);
```

- [ ] **Step 2: Run** → FAIL. **Step 3: Implement**, moving today's `researchSection` body from `assemble-review.mjs` into `hunt-records.mjs` (it is deleted there in Task 14). **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(vulnerability-hunt): render SECURITY-REPORT.md and the task-review section from the records`.

---

### Task 11: CLI contract tests for `check-hunt.mjs`

**Files:**
- Modify: `tests/vulnerability-hunt/check-hunt.test.mjs`

- [ ] **Step 1: Write the tests** (spawnSync `node check-hunt.mjs ...` in a scratch project):

```js
test('usage: no command, an unknown command, a missing id exit 2 with an ERROR line and the usage text', ...);
test('every command refuses a reviews/<ID> that is a symbolic link and a block file that is a FIFO (skipped where mkfifo is absent) or a link, exit 2', ...);
test('a blocks/ file over 5 MiB, with invalid UTF-8, or with depth over 64 is refused by name without a stack trace', ...);
test('more than 100 findings are capped with a final "... and <n> more" line', ...);
test('fold writes only coverage-ledger.json, security-findings.json and architecture.md; render writes only SECURITY-REPORT.md; final and blocks write nothing (directory snapshots before and after)', ...);
test('a CLI run prints no Node warning on stderr', ...);
```

- [ ] **Step 2: Run** → the capped-output and FIFO cases FAIL. **Step 3: Implement** the cap and the FIFO refusal (`lstatSync` then `isFile()`, as `regularFileProblem` does) wherever missing. **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `test(vulnerability-hunt): check-hunt CLI contract, limits and write set`.

---

### Task 12: The prompts — five lanes, the verifier, recon, critic, lead verifier — and the structure test

**Files:**
- Modify: `skills/vulnerability-hunt/prompts/lane-dependencies.md`, `lane-code.md`, `lane-secrets-supply-chain.md`, `lane-ai-surface.md`, `lane-osint.md`, `verifier.md`
- Create: `skills/vulnerability-hunt/prompts/recon.md`, `critic.md`, `lead-verifier.md`
- Modify: `tests/vulnerability-hunt/test-skill-structure.sh`

**Interfaces:**
- Consumes: the Record shapes; `check-hunt.mjs blocks` output (pasted by the gatekeeper into `<BLOCKS>`).
- Produces: the placeholders each prompt names, checked by the structure test: lane prompts `<ID> <REPO> <REPO_PATH> <SCOPE> <MANIFESTS> <TOOLS> <DOCUMENTS> <ARCHITECTURE> <UNITS> <BLOCKS> <EXCLUDED>`; `verifier.md` `<ID> <REPO> <REPO_PATH> <FINDING> <FILES>` plus `<ADVISORY>`; `recon.md` `<ID> <REPO> <REPO_PATH> <SCOPE> <MANIFESTS> <DOCUMENTS> <LANES> <UNITS>` (the seeded unit ids per lane, so proposals can name files already covered); `critic.md` `<ID> <WAVE> <ARCHITECTURE> <LEDGER> <OPEN> <FINDING_IDS>`; `lead-verifier.md` `<ID> <REPO> <REPO_PATH> <LANE> <ITEMS> <FILES>`.
- The precedence sentence, verbatim in every lane prompt and in `recon.md`: `The hunt's contract wins over every reference block below: you run nothing, use no sandbox, scratch folder or artifact; a fact that needs code to run makes the item a lead whose reason names it; a block's needs_validation is this hunt's needs-validation.`

- [ ] **Step 1: Update the structure test first** (`test-skill-structure.sh`): lane placeholders list gains the four new ones; the JSON field list becomes `"repo" "lane" "status": "ok | incomplete" "tools" "name" "version" "command" "exit" "output" "cves" "package" "advisory" "fixedIn" "runtime" "proof" "candidates" "ref" "file" "line" "symbol" "category" "severity" "confidence" "title" "description" "principal" "boundary" "impact" "trace" "kind" "exploit" "mitigationExamined" "fix" "leads" "reason" "hardening" "note" "units" "unit" "disposition" "checks" "invariant" "result" "refs" "unresolved" "searches" "paths" "matches" "blocked" "uncovered" "declined" "skipped" "filesRead"`; severities check `High | Medium` and no `Low`; the floor text check keeps `floor` and `6` and replaces `discarded` by `leads`; a check that each lane prompt holds the precedence sentence and the phrase `the location of the fix`; `verifier.md` returns `"decision": "confirmed | needs-validation | rejected"`, `"findingId"`, `"blockers"`, `"validationPlan"`, `"newLead"`, and never rewrites the trace (`never rewrite`); new blocks for `recon.md` (most capable model, its placeholders, `"summary"`, `"units"`, `1,000 words`), `critic.md` (most capable, `"missingUnits"`, `"reassign"`, `"stop"`, `never a lane`), `lead-verifier.md` (most capable, `"items"`, `rejected | kept | promoted`, `25`); the no-fingerprint scan (`:94-98`) covers the three new prompts; the lane-dependencies, osint and ai-surface checks unchanged; `lane-secrets-supply-chain.md` holds `gitleaks dir`, `gitleaks git`, `--redact`, `--report-path`, `Secret`, `never copied`; the template checks become line 1 title, line 2 the only Verdict line with the four verdicts, sections `## Summary`, `#### CVEs`, `#### Advisories from research`, `#### Confirmed findings`, `##### High`, `##### Medium`, `#### Needs validation`, `#### Hardening notes`, `#### Rejected candidates`, `#### Coverage gaps`, `#### Unjudged`, `#### Skipped lanes`, `#### Declined to judge`, `#### Files read`, `#### Tools used`, `## Agents`, and the `Guardrail:`, `Research:` and `Coverage:` lines under Summary; `:296` becomes `#### Advisories from research`; the upstream-name scan (`:305-306`) adds `"$SKILL_DIR/references"`.
- [ ] **Step 2: Run** `bash tests/vulnerability-hunt/test-skill-structure.sh` → FAIL on every new check.
- [ ] **Step 3: Rewrite the five lane prompts**: the same house shape (one fenced `Subagent (general-purpose, mid-tier model):` block, `description`, `prompt: |`, a `Placeholders:` line); Input gains `<ARCHITECTURE>` (read first), `<UNITS>` (the unit ids and files this hunter owns, with each surface unit's selected refs) and `<BLOCKS>` (the verbatim blocks) and `<EXCLUDED>` (refs with reasons), preceded by the precedence sentence; Method keeps each lane's steps and adds: "Anchor `file` and `symbol` of a candidate, a lead or a hardening note at the location of the fix, the sink or the missing control; the entry points are trace steps"; "A lead is a suspicion under confidence 6; a hardening note is advice with no exploitable path; neither carries a severity"; "Return one `units` result per surface or reported unit you own, with the invariant you checked and what you found; never list a file you did not read whole in `filesRead`"; the secrets lane's step 1 becomes the gitleaks runs of D13 (exact commands, `--report-path <ROOT>/reviews/<ID>/gitleaks-<REPO>-dir.json` and `-git.json`, `--config <REPO_PATH>/.gitleaks.toml` when present, recorded in `tools`, exit 0 or 1 a result, the report's `File`, `StartLine`, `RuleID`, `Commit` read and `Secret`, `Match`, `Fingerprint` never copied), with the searches as step 2 "when gitleaks is absent or failed, or for paths it did not scan", each search recorded in `searches` with the exact command and the `file:line` of each match, never the text; the Return block is the `HunterBlock` of Record shapes, with the sentence "A candidate without a `trace` from `entrypoint` to `sink`, or without `principal`, `boundary` and `impact`, is sent back".
- [ ] **Step 4: Rewrite `verifier.md`**: the decision words, the `blockers` and `validationPlan` rules (`needs-validation` when a decisive fact is outside the repository or needs code to run; `deployment` what the owner observes, `execution` the bounded check the owner could run, described, never run), "You never rewrite the trace; a different root cause is a `rejected` here and a `newLead` candidate in your block", "You may lower a High to a Medium with the reason; you never raise a severity", the Return block of Record shapes; the Advisory form unchanged.
- [ ] **Step 5: Write `recon.md`** (most capable model): read the scope and documents, map actors, authority, protected resources, entry surfaces, trust boundaries with the strongest control, source-to-sink paths; propose surface units per running lane with `selectedBlocks` chosen by each domain file's "When to use this file" section and `excludedBlocks` with reasons, never a block of `RESOURCE-EXHAUSTION-AND-AVAILABILITY.md` (reason: the hunt's precedents exclude denial of service); summary ≤ 1,000 words; the precedence sentence; Return `{ "summary", "units" }`.
- [ ] **Step 6: Write `critic.md`** (most capable model): read `<ARCHITECTURE>`, `<LEDGER>`, `<OPEN>`, `<FINDING_IDS>`; look for unmapped entry points, parallel paths, missing lifecycle modes, selected classes without a unit, unjustified exclusions, units closed without files or checks; propose units only, for the lanes in the ledger, never a lane; `reassign` a unit whose evidence is thin, with a source-backed reason; `stop: true` only when nothing is proposed; Return `{ "missingUnits", "reassign", "stop" }`.
- [ ] **Step 7: Write `lead-verifier.md`** (most capable model): at most 25 `<ITEMS>` of one `<LANE>`; per item `rejected` (a reason with `file:line`), `kept` (hardening only: accurate, no exploitable path) or `promoted` (a full `Candidate` record anchored at the sink, which a single verifier will judge); never a severity on a lead; Return `{ "lane", "items" }`.
- [ ] **Step 8: Run the structure test** → PASS; `bash tests/skills/test-current-sources.sh` → PASS (no research product named in the new prompts).
- [ ] **Step 9: Commit** `feat(vulnerability-hunt): lane, verifier, recon, critic and lead-verifier prompts for the schema-2 records`.

---

### Task 13: The contract and the door

**Files:**
- Modify: `agents/vulnerability-hunter.md`, `skills/vulnerability-hunt/SKILL.md`, `tests/vulnerability-hunt/test-skill-structure.sh`, `tests/skills/test-skill-bodies.sh` (only if a checked sentence moves)

**Interfaces:**
- Consumes: every `check-hunt.mjs` command; the prompts of Task 12.
- Produces: the contract sentences the structure test checks (Step 1).

- [ ] **Step 1: Update the structure test first**: the contract words list (`:175-176`) replaces `plausible` by `needs-validation` and adds `check-hunt.mjs seed`, `check-hunt.mjs fold`, `check-hunt.mjs final`, `check-hunt.mjs render`, `blocks/`, `coverage-ledger.json`, `preflight.json`, `findingId`, `hunt.maxFollowUpWaves`, `unjudged`, `not-covered`; the verdict-rule check (`:187-190`) becomes four `has` checks for: `FAIL on a \`confirmed\` High finding or a critical or high CVE in a runtime dependency`, `PASS-WITH-ISSUES on a \`confirmed\` Medium finding, a moderate CVE in a runtime dependency, a critical or high CVE in a test-only dependency or any \`needs-validation\` record`, `Hardening notes and low CVEs never change the verdict`, `INCOMPLETE when the dependencies lane produced no block, or its status is \`incomplete\` with no CVE recorded, when any candidate, lead or hardening note is \`unjudged\`, or when any unit is \`planned\`, \`blocked\` or \`not-covered\``; the dispatch check (`:191`) becomes `one hunter per group \`fold\` printed, in parallel, on a mid-tier model`, `one verifier per High or Medium candidate on the most capable model`, `at most 25 items`, `the recon step on the most capable model`; a check that the agent names `--save` in STEP 0 and `blocks/run.json` in STEP 5; the door checks add `--save` after the preflight command, `confirmed`, `needs-validation`, `coverage` in the four-line result, and the new Red Flags rows (`I'll fix the ledger by hand`, `I'll write the report myself`, `the leads are noise, I'll drop them`, `one more wave will find it`); the line limits stay 300 and 160.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Rewrite the contract body** (`agents/vulnerability-hunter.md`, ≤ 300 lines): STEP 0 runs the preflight with `--save` when the door handed none and requires `saved:`; STEP 0b unchanged; STEP 1: run record start and read-back as today, then `node <plugin root>/skills/vulnerability-hunt/scripts/check-hunt.mjs seed <ID>`, then the recon step (`prompts/recon.md`, most capable), save `blocks/recon.json`, run `fold`; STEP 2: per `fold` stage `hunt`, one hunter per printed group (mid-tier), its `<BLOCKS>` from `check-hunt.mjs blocks <refs>`, save each block as `blocks/wave-<n>-<lane>-<k>.json`, run `fold`, send back once on a finding against that block, then one critic (`prompts/critic.md`, most capable) per `critic` stage, save `blocks/critic-<n>.json`, `fold`, repeat until `stage` is `verify`; STEP 3: from `pending`, one verifier per candidate (`prompts/verifier.md`), batches per lane (`prompts/lead-verifier.md`), advisory verifiers as today, save `blocks/verify-<k>.json`, `blocks/batch-<lane>-<k>.json`, `blocks/advisory-<k>.json`, `fold` after each round until `pending` is empty or every remaining item has declined twice; STEP 4: `check-hunt.mjs final`; STEP 5: save `blocks/run.json`, `check-hunt.mjs render` (or `render --incomplete "<reason>"` when `final` still reports findings after the send-backs), then `run-records.mjs end`. "The gatekeeper never edits `coverage-ledger.json`, `security-findings.json`, `architecture.md` or `SECURITY-REPORT.md`: it saves blocks and runs the script." The lanes table unchanged. Severity and confidence: High and Medium only; leads under 6; hardening. The verdict section: the four sentences of Step 1. Inline form: the session saves its own blocks the same way, `run.json` `inline: true`. Completion gate: `preflight.json` saved; `seed` ran; `recon.json` saved; every wave folded; every pending item judged or `unjudged`; `final` ran; `run.json` saved; `render` wrote the report; `run-records.mjs end`; the four-line result.
- [ ] **Step 4: Rewrite the door** (`SKILL.md`, ≤ 160 lines): Overview names the ledger, the waves, the judged candidates and the rendered report; the core principle keeps `no CVE enters the table that an audit tool did not report`; Step 2's command gains `--save`; Step 4's four lines: the verdict; the counts (`confirmed High/Medium`, `needs-validation`, `hardening`, CVEs by severity, research applies or not checked); the path; `coverage: <covered>/<total> units, <n> not covered, <waves> waves` and what blocked; Red Flags keeps every existing row and adds the four of Step 1 plus `A hunter read 60 files, that is coverage enough` → `Coverage is the ledger's: an open unit is a gap the next wave hunts, or a named not-covered`.
- [ ] **Step 5: Run** `bash tests/vulnerability-hunt/test-skill-structure.sh`, `bash tests/skills/test-skill-bodies.sh`, `bash tests/skills/test-current-sources.sh` → PASS; `wc -l` within limits.
- [ ] **Step 6: Commit** `feat(vulnerability-hunt): the contract and the door drive the hunt through check-hunt.mjs`.

---

### Task 14: task-review reads schema 2 only and blocks on a hunt INCOMPLETE

**Files:**
- Modify: `skills/task-review/scripts/assemble-review.mjs`, `skills/task-review/SKILL.md:69`, `skills/task-review/templates/TASK-REVIEW.md`, `tests/task-lifecycle/assemble-review.test.mjs`, `tests/task-lifecycle/test-skill-structure.sh:74`

**Interfaces:**
- Consumes: `judgeHunt`, `renderReviewSection` from `hunt-records.mjs`.
- Produces: `assemble({ id, findings, qaText, securityFindings, securityLedger, securityText, qaConfigured, now })` (new `securityLedger` argument, `null` when absent); `decide(repos, qa, security, { qaConfigured })` with BLOCKED when `security?.verdict === 'INCOMPLETE'` (same branch as the QA BLOCKED, `why` = `the vulnerability hunt ended INCOMPLETE (<security.sentence>)`); the CLI refuses a hunt file whose `schema !== 2` with exit 2 and `ERROR: reviews/<ID>/security-findings.json is not schema 2; run the vulnerability hunt again`, and reads `reviews/<ID>/coverage-ledger.json` when present (through `regularFileProblem`).
- Removed from `assemble-review.mjs` (D12): `HUNT_SEVERITIES`, `CVE_SEVERITIES`, `VERDICTS`, `CONFIDENCE_FLOOR`, `RESEARCH_STATUSES`, `RESEARCH_VERIFICATIONS`, `RESEARCH_SEVERITY`, `huntSeverity`, `cveSeverity`, `normalizeResearch`, `normalizeSecurity`, `judgeSecurity`, `decideSecurity`, `researchSection`, `huntFindingBlock`, `huntSection`, `securitySummary`'s Low count; `parseSecurityVerdict` stays only because `renderReviewSection` needs the quoted line (keep it exported only if a test imports it; otherwise unexport).

- [ ] **Step 1: Rewrite the tests first**: delete every test from `:160` to `:399` and `:510` to `:640` that builds schema-1 hunts (the `plausible`, `Discarded leads`, `attackPath`, `decideSecurity`, title-matching, `#### Low` cases); add:

```js
test('a schema-2 hunt with a confirmed High fails the review', ...);
test('a needs-validation record gives PASS-WITH-ISSUES and appears in the Needs validation table with no severity', ...);
test('a hunt INCOMPLETE makes the review BLOCKED, like a QA INCOMPLETE, and the sentence names the hunt', ...);
test('rejected candidates and hardening notes never change the verdict and are counted in their sections', ...);
test('the hunt section comes from renderReviewSection: coverage line, unjudged, agents', ...);
test('the Summary security counts name confirmed High and Medium, needs-validation and hardening', ...);
test('a hunt file with no schema, or schema 3, is refused by the CLI with exit 2 and the run-the-hunt-again message, and TASK-REVIEW.md is not written', ...);
test('a disagreement between the report verdict line and judgeHunt is printed as a note', ...);
test('no hunt file leaves the verdict unchanged and says there was no vulnerability hunt', ...);  // kept
```

  Keep the research-row tests (`:510-640`) by rewriting their fixtures to schema 2 (the rows live in `repos[].research` as before).
- [ ] **Step 2: Update `tests/task-lifecycle/test-skill-structure.sh:74`** to grep `a security \`INCOMPLETE\` makes the review \`BLOCKED\`, like a QA \`INCOMPLETE\`, and is named in the verdict`.
- [ ] **Step 3: Run** both suites → FAIL.
- [ ] **Step 4: Implement**: the imports, `decide`, `assemble`, the CLI schema check and ledger read, the removals; the `## Vulnerability hunt and audit` section of `templates/TASK-REVIEW.md` rewritten to the `renderReviewSection` shape and the Summary line to `"security: <PASS | PASS-WITH-ISSUES | FAIL | INCOMPLETE>" with the hunt's confirmed High and Medium findings, its needs-validation records, its hardening notes and its CVEs`; the verdict line placeholder gains `BLOCKED` for a hunt INCOMPLETE; `skills/task-review/SKILL.md:69`: `` `BLOCKED` on a QA `PRECONDITION-FAILED` or `INCOMPLETE`, or a security `INCOMPLETE` `` and the sentence of Step 2.
- [ ] **Step 5: Run** `node --test tests/task-lifecycle/assemble-review.test.mjs`, `bash tests/task-lifecycle/test-skill-structure.sh`, `bash tests/task-lifecycle/test-task-review.sh`, `node --test tests/task-lifecycle/post-review.test.mjs` → PASS.
- [ ] **Step 6: Commit** `feat(task-review): read schema-2 hunt records through hunt-records and block on a hunt INCOMPLETE`.

---

### Task 15: The guardrail — `check-hunt.mjs` on the script list, the gitleaks allow-form, fixtures and parity

**Files:**
- Modify: `hooks/lib/qa-shell-writes.mjs` (`HUNT_OWN_SCRIPTS_RE` ~1095, `HUNT_AUDIT_TOOLS` ~613, a `gitleaks` branch in `huntCheck` before `return null` ~894), `tests/qa-gatekeeper/fixtures/hunt/cases.json`, `tests/qa-gatekeeper/test-hunt-profile.sh` (the `ELSEWHERE` copies), `tests/qa-gatekeeper/audit-2026-10-23.test.mjs` (RR9 list)

**Interfaces:**
- Produces: `HUNT_OWN_SCRIPTS_RE = /(^|\/)(skills\/(vulnerability-hunt\/scripts\/(hunt-preflight|check-hunt)|task-review\/scripts\/assemble-review)|hooks\/lib\/run-records)\.mjs$/`; in `huntCheck`, `prog === 'gitleaks'`: verbs allowed `dir`, `git`, `version`, `help`; flags `--no-banner`, `--redact`, `--no-color`, `-v`, `--verbose`; valued `--report-format` (value must be `json`), `--report-path` and `-r` (judged as an output path like osv-scanner's `--output`: must land under `reviews/<ID>/`), `--config` and `-c` (an input path inside the project), `--log-level`, `--max-target-megabytes`, `--exit-code`; the positional target an input path inside the project; refused by name: `stdin`, `completion`, `--baseline-path`, `-b`, `--diagnostics`, `--diagnostics-dir`, `--report-template`, `--enable-rule`, `--gitleaks-ignore-path`, `-i`, `--ignore-gitleaks-allow`, `--max-archive-depth`, `--max-decode-depth`; `dir` or `git` without `--redact` refused with `gitleaks runs only with --redact during the hunt (a secret value would reach stdout)`; the same `allow(outputs, inputs)` call shape as the osv-scanner form.

- [ ] **Step 1: Add the fixture cases** to `cases.json`: `allow_node_check_hunt_seed` (`node {{PLUGIN}}/skills/vulnerability-hunt/scripts/check-hunt.mjs seed audit-2026-10-11`), `..._blocks`, `..._fold`, `..._final`, `..._render` (`render audit-2026-10-11 --incomplete "x"`), `deny_node_check_hunt_copy_outside_plugin` (`{{ELSEWHERE}}/plugin/...`, reason `is not on its list`), `deny_check_hunt_in_report_area` (`{{ROOT}}/reviews/audit-2026-10-11/skills/...`, reason `the hunt reads; node`), `deny_check_hunt_option_before` (`node --require ./x.js {{PLUGIN}}/.../check-hunt.mjs fold x`, reason `the hunt reads; node`); gitleaks: `allow_gitleaks_dir_redacted` (`gitleaks dir repo-a --no-banner --redact --report-format json --report-path reviews/audit-2026-10-11/gitleaks-repo-a-dir.json`), `allow_gitleaks_git_with_config` (`gitleaks git repo-a --no-banner --redact --report-format json --report-path reviews/audit-2026-10-11/gitleaks-repo-a-git.json --config repo-a/.gitleaks.toml`), `allow_gitleaks_version`, `deny_gitleaks_without_redact` (reason `--redact`), `deny_gitleaks_report_outside_reviews` (`--report-path repo-a/src/leaks.json`, reason `output file`), `deny_gitleaks_stdin`, `deny_gitleaks_report_template`, `deny_gitleaks_baseline`, `deny_gitleaks_dir_outside_project` (`gitleaks dir /tmp/hunt-elsewhere --redact`, reason `outside the project`), `deny_npx_gitleaks` (reason `installs`); `allow_rg_private_key_marker` (`rg -n "BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY" repo-a`). In `test-hunt-profile.sh`, add `: > "$ELSEWHERE/plugin/skills/vulnerability-hunt/scripts/check-hunt.mjs"`. In `audit-2026-10-23.test.mjs` RR9, add `skills/vulnerability-hunt/scripts/check-hunt.mjs` to both lists.
- [ ] **Step 2: Run** `node --test tests/qa-gatekeeper/audit-2026-10-23.test.mjs` and `node --test tests/qa-gatekeeper/qa-shell-writes.test.mjs` → the new cases FAIL (the fixture suite itself runs at the gate, Task 18, because of its run time on Windows).
- [ ] **Step 3: Implement** the regex, the set and the `gitleaks` branch.
- [ ] **Step 4: Run** the two node suites → PASS; `node --test tests/hooks/test-guardrail-entrypoints-parity.mjs tests/hooks/test-guardrail-bridge.mjs` → PASS.
- [ ] **Step 5: Commit** `feat(guardrail): the hunt runs check-hunt.mjs from the plugin and gitleaks in its redacting read-only forms`.

---

### Task 16: The migration is complete — removal sweep and its test

**Files:**
- Create: `tests/vulnerability-hunt/test-migration-complete.mjs`
- Modify: whatever the test finds (expected: none after Tasks 10, 12, 13, 14); `tests/vulnerability-hunt/run-tests.sh`

**Interfaces:**
- Produces: the test with two fixed lists: `LIVE_FILES` = `agents/vulnerability-hunter.md`, `skills/vulnerability-hunt/**` (not `references/`), `skills/task-review/SKILL.md`, `skills/task-review/scripts/assemble-review.mjs`, `skills/task-review/templates/TASK-REVIEW.md`, `tests/vulnerability-hunt/**`, `tests/task-lifecycle/assemble-review.test.mjs`, `tests/task-lifecycle/test-skill-structure.sh`; `REMOVED` = `plausible`, `attackPath`, `"discarded"`, `'discarded'`, `verifications`, `Discarded leads`, `#### Low`, `HUNT_SEVERITIES`, `CVE_SEVERITIES`, `CONFIDENCE_FLOOR`, `RESEARCH_STATUSES`, `RESEARCH_VERIFICATIONS`, `RESEARCH_SEVERITY`, `normalizeSecurity`, `judgeSecurity`, `decideSecurity`, `huntSeverity`, `cveSeverity`, `normalizeResearch`, `huntFindingBlock`, `huntSection`, `researchSection`, `hunt-active`, `KEY_RE`; `MODULES` = `hunt-records.mjs`, `check-hunt.mjs`, `hunt-preflight.mjs`, `assemble-review.mjs`, `qa-shell-writes.mjs`, `guard-paths.mjs`.

- [ ] **Step 1: Write the tests**:

```js
test('no live file holds a removed identifier or word', ...);           // except the word plausible inside "not plausible"? no: zero occurrences
test('every named import of each MODULE is used at least once outside its import line', ...);   // regex over `import { a, b } from`
test('every export of hunt-records.mjs, check-hunt.mjs, hunt-preflight.mjs and assemble-review.mjs is imported by another module or a test', ...);
test('hunt-records.mjs and check-hunt.mjs import only node: modules and repository files', ...);
test('package.json has no new dependency or devDependency', ...);     // compare with the committed list: none
```

- [ ] **Step 2: Run** → any FAIL names a leftover; remove it (never by adding an exception). **Step 3: Run** → PASS; add the suite to `run-tests.sh`.
- [ ] **Step 4: Commit** `test(vulnerability-hunt): prove the migration left no dead code, unused export or dependency`.

---

### Task 17: Documentation, configuration templates, CI and release notes

**Files:**
- Create: `docs/vulnerability-hunt.md`
- Modify: `README.md` (lines ~100, 343, 384, 403, 482, 503, 532, 644), `templates/.agents/ultrapowers.json.tmpl` and `templates/README.md.tmpl` (`maxFollowUpWaves` beside `maxHuntersPerLane`), `templates/CHANGES.json` (both templates at the next version), `docs/testing.md:15-16`, `AGENTS.md` (layout table, test list, Rule 9 note), `.github/workflows/ci.yml:58` (the run-tests.sh line already covers the new suites; add nothing unless a suite runs outside it), `RELEASE-NOTES.md` (`## Unreleased`)

- [ ] **Step 1: Write `docs/vulnerability-hunt.md`**: the workflow step by step (STEP 0 to STEP 5 with the files each writes), the record shapes (a copy of this plan's Record shapes section, kept in sync by Task 16's word scan), the verdict rule, the limits (`hunt.maxHuntersPerLane`, `hunt.maxFollowUpWaves`, batch 25, block bytes 40960), the inline form, what the hunt does not do (no execution, no carry-over, no budget cap, no Phase 5, no dedup agents), and a table "Cloudflare concepts" with the 17 rows of the spec's gap analysis in the columns `Practice | Adopted / Adapted / Reused / Rejected | Where`, plus the provenance paragraph for `references/cloudflare/` (commit, date, MIT) and the gitleaks note (v8.30.1 read; absence is a note).
- [ ] **Step 2: README**: the hunt bullets name the ledger, the three states, the rendered report and gitleaks; the config table row `hunt` gains `maxFollowUpWaves` (default 3) and the JSON example at ~384 shows both keys; the skills list and agents list sentences updated; the route diagram line unchanged.
- [ ] **Step 3: Templates**: `templates/.agents/ultrapowers.json.tmpl:31` becomes `"hunt": { "maxHuntersPerLane": 8, "maxFollowUpWaves": 3 },`; `templates/README.md.tmpl:27` adds `maxFollowUpWaves` (default 3: the follow-up waves after the first, before an open unit is recorded as not covered). In `templates/CHANGES.json`, the key `"README.md"` (the target of `templates/README.md.tmpl`, today `"2.1.0"`) becomes `"2.4.0"`, the next minor version, which this feature release carries; the marker `.agents/ultrapowers.json` has no key there (upgrade mode never proposes the marker), so a project gains the key by hand or at its next scaffold, and the default applies until then. The version bump itself is a release step under AGENTS.md Rule 6, outside this plan.
- [ ] **Step 4: AGENTS.md**: layout table gains a row for `skills/vulnerability-hunt/` (the door, `agents/vulnerability-hunter.md` as contract, `prompts/`, `scripts/hunt-preflight.mjs`, `scripts/hunt-records.mjs`, `scripts/check-hunt.mjs`, `templates/SECURITY-REPORT.md`, and `references/cloudflare/`: "Cloudflare's attack-class files, verbatim under their MIT notice; a third-party notice beside third-party files, distinct from the fork's upstream attribution rule"); the test list stays `bash tests/vulnerability-hunt/run-tests.sh` (it now runs five suites; say so in `docs/testing.md`).
- [ ] **Step 5: `docs/testing.md:15`**: name the five suites of `run-tests.sh` and what each proves. **`RELEASE-NOTES.md`**: under `## Unreleased`, a group `Vulnerability hunt and audit` with the headline changes, the sentence `or its status is \`incomplete\` with no CVE recorded` in the verdict rule, the BLOCKED change for task-review, the gitleaks forms, the config key and the vendored references.
- [ ] **Step 6: Run** `bash tests/vulnerability-hunt/test-skill-structure.sh` (README and template checks), `bash tests/team-memory/test-templates.sh`, `bash tests/init/run-tests.sh` (templates render), `bash tests/task-lifecycle/test-skill-structure.sh` → PASS.
- [ ] **Step 7: Commit** `docs(vulnerability-hunt): the schema-2 workflow, its limits, the Cloudflare provenance and hunt.maxFollowUpWaves`.

---

### Task 18: GREEN pressure runs, live hunts, and the offline gate

**Files:**
- Modify: `tests/task-lifecycle/pressure-results.md` (append `## GH-63 hunt records: GREEN, <date>`)
- Create: `reviews/GH-63/` (the ticket hunt's files) and `reviews/audit-<date>/` (the full audit's files), committed as evidence

- [ ] **Step 1: Run S50 to S57 again** with the new text, per `ultrapowers:writing-skills`; record GREEN with the quoted sentence each agent acted on. Expected: all eight pass. A scenario that still fails is a text fix in Task 12 or 13, then run again.
- [ ] **Step 2: Live ticket hunt**: on the ticket branch, `/ultrapowers:vulnerability-hunt GH-63`; check `reviews/GH-63/` holds `preflight.json`, `research.json`, `blocks/`, `architecture.md`, `coverage-ledger.json`, `security-findings.json`, `SECURITY-REPORT.md`, `run-log.txt`; `node skills/vulnerability-hunt/scripts/check-hunt.mjs final GH-63` exits 0; line 2 of the report equals its verdict; no unit `planned`; the gitleaks report (if gitleaks is installed) holds only `REDACTED` secrets.
- [ ] **Step 3: Live full audit**: `/ultrapowers:vulnerability-hunt --full-audit`; the same checks on `reviews/audit-<date>/`; note the waves used against `hunt.maxFollowUpWaves` and the agent counts in the report; record both in `pressure-results.md`.
- [ ] **Step 4: The offline gate**, every line of AGENTS.md "Running the tests", with `bash tests/qa-gatekeeper/run-tests.sh` once (10+ minutes per fixture suite on Windows) and `scripts/lint-shell.sh --all`. Expected: every suite PASSED; `test-adapters.sh` hermes case may fail for the environmental reason the team memory records.
- [ ] **Step 5: Commit** `test(vulnerability-hunt): GREEN pressure evidence and the live hunts of GH-63` (the reviews and the results file).

---

## Self-review notes

- **Spec coverage:** D1 Tasks 7–13; D2 Tasks 4, 6, 8, 9, 12; D3 Tasks 5, 7, 17; D4 Tasks 8, 12; D5 Tasks 7, 12, 13; D6 Tasks 4–11; D7 Tasks 9, 10; D8 Tasks 2, 4, 12; D9 Task 17 (documented as not done); D10 Task 14; D11 Tasks 4, 15; D12 Task 16; D13 Tasks 3, 7, 8, 12, 15, 17; Testing section Tasks 1–18; Definition of done Task 18.
- **Type consistency:** `findingId`, `unitId`, `HunterBlock`, `Unit`, `judgeHunt`, `renderReviewSection`, `huntConfig`, `savePreflight`, `resolveBlocks`, `isKeyMaterial` are named once in Record shapes and the Interfaces blocks and used with those names in every later task.
- **Proportion:** no function body is written; the two code blocks of Task 2 are a one-time download and a fixture table of exact values.
