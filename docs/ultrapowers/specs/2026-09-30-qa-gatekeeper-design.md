# Ultrapowers piece 5: QA gatekeeper

- Date: 2026-09-30
- Status: approved design, pending implementation plan
- Scope: sub-project 5 of 5. Covers requirement 5: the seven-lane QA specialist as an in-session skill that forks into a shipped agent and writes the report into the knowledge base. Depends on pieces 1 to 3 (namespace, config, knowledge base, ticket folders) and on the Playwright MCP server from the piece 2 payload. Inherits G1 to G5 from the piece 2 spec.

## 1. Problem

After a feature is built, the owner wants one gatekeeper that behaves like a senior human tester: drives the real UI per role and language, watches logs, probes the API, checks the database read-only, checks traces, runs the suites, judges generated content, and issues a verdict with evidence. The reference implementation does this but is bound to one project's stack, roles, languages, brand and forge, and runs through a headless launcher with GitLab publishing. Ultrapowers ports the contract and the lanes, moves every project fact into config, adds the missing seventh lane, and runs inside the current session.

## 2. Decisions

| Id | Decision | Rationale |
|----|----------|-----------|
| D1 | In-session only: `/ultrapowers:qa-specialist <ticket>` forks into the `qa-specialist` agent. No headless launcher, no publishing, no forge comments. | Owner's choice. |
| D2 | Seven lanes: 1 UI, 2 logs, 3 API, 4 database, 5 observability, 6 suites, 7 generated content. Lanes 4, 5 and 7 are gated on configuration or applicability and report "not covered, reason" otherwise. | Owner's selection; lanes 4 and 5 were engine- and provider-bound in the reference; lane 7 was named but never built. |
| D3 | Every project fact lives in the `qa` section of `.agents/ultrapowers.json`; credentials live in environment variables named there; nothing secret in the repo. | The reference hard-coded roles, languages, brand paths, IdP client, tenant column and table names in skills. |
| D4 | The change set is derived from git: repos on a branch matching the ticket are diffed against their default branch; plus the ticket's brief, spec and plan. | Replaces merge-request URLs and forge API calls. |
| D5 | Safety is the agent's rules plus a plugin pre-tool-use guardrail active only while a run marker exists. The normal permission mode stays. | Replaces the reference's bypass-permissions launcher. |
| D6 | Outputs land in `reviews/<id>/`: `QA-REPORT.md`, `artifacts/`, and a gitignored `run-state.json` for resume. | Owner's requirement and the knowledge base convention. |
| D7 | The agent and lane skills are ported tools and keep the reference structure; the `qa-specialist` entry skill is new and follows G1. | G1. |

## 3. Design

### 3.1 Components

- `skills/qa-specialist/SKILL.md`: the entry skill. Argument `ticket`. `context: fork`, `agent: qa-specialist` where the harness supports it; otherwise the skill instructs the agent to adopt the agent contract inline. Steps: find the project root; require the `qa` config section or stop with the missing keys; write the run marker; resolve the change set; hand the agent its inputs; on completion remove the marker and print the verdict line and report path.
- `agents/qa-specialist.md`: the ported contract. Frontmatter: `name`, `description`, `model` unset (session default), `tools` excluding the unsafe browser code tool. Body: persona, absolute rules, dimension matrix (Functional, UX and navigation, Visual and brand when a brand block exists, Localization when more than one language, Access control per configured roles, Resilience, Performance-lite, Regression), inputs, lane table, the ordered steps 0 to 9 with run-state and the resume rule, triage classes, severity levels and exit criteria inlined from the reference handbook, completion gate.
- Lane skills, all `user-invocable: false`: `qa-lane-1-ui`, `qa-lane-2-logs`, `qa-lane-3-api`, `qa-lane-4-db`, `qa-lane-5-observability`, `qa-lane-6-suites`, `qa-lane-7-content`, `qa-report`.
- `skills/qa-lane-6-suites/scripts/judge.mjs`: set-difference judge over trx, vitest JSON and JUnit XML, reading the fenced `lane6-suppress` block from the known-issues file.
- `skills/qa-lane-4-db/recipes/postgres.md` plus `qa_agent_ro.sql`; `skills/qa-lane-5-observability/recipes/langfuse.md`.
- `hooks/qa-guardrail`: pre-tool-use guardrail, extensionless bash through the polyglot wrapper, registered in the Claude Code and Cursor hook files and the Muse manifest.
- Templates for the piece 2 payload: `qa/known-issues.md` with the suppress block, and the `qa` config section with placeholders.

### 3.2 Project config, `qa` section

```json
{
  "qa": {
    "urls": { "frontend": "", "backendHealth": "", "idp": "", "observability": "" },
    "hosts": { "allowed": [], "forbidden": [] },
    "auth": { "type": "form|oidc-password|custom", "route": "", "tokenUrl": "", "clientId": "", "recipe": "" },
    "roles": [ { "name": "user", "userEnv": "QA_USER_USER", "passwordEnv": "QA_PW_USER", "required": true } ],
    "languages": [ { "code": "en", "switch": "" } ],
    "containers": { "watch": [], "errorPattern": "error|exception|fatal|unhandled" },
    "db": { "engine": "postgres", "container": "", "host": "", "database": "", "roRole": "qa_agent_ro", "roPasswordEnv": "QA_DB_RO_PASSWORD", "tenantColumn": "", "auditTables": [] },
    "suites": [ { "repo": "", "command": "", "resultFormat": "trx|vitest-json|junit-xml", "timeoutSec": 1800 } ],
    "observability": { "provider": "langfuse|none", "publicKeyEnv": "", "secretKeyEnv": "" },
    "brand": { "logoPaths": [], "tokenPaths": [], "compareRoute": "" },
    "regression": [ "" ],
    "knownIssues": "qa/known-issues.md",
    "api": { "errorEnvelopeFields": [] , "crossTenantStatus": 404 }
  }
}
```

Init writes it with placeholders; the entry skill lists every empty required key and stops until filled. Optional blocks left empty gate their lane off.

### 3.3 Run flow

0. Orient: read the config, brief, spec, plan, known-issues; compute the change set (D4); list repos, files and endpoints touched.
1. Preflight: frontend responds, backend health responds, credentials present for required roles; otherwise report `PRECONDITION-FAILED` and stop.
2. Baseline: UTC watermark; `docker ps` for the watched containers when configured; initialize `run-state.json` with the plan matrix, feature areas by dimension by role with credentials by language, plus the regression sweep; mark rows `not-covered` with reasons immediately.
3. Start lane 6 in the background per configured suite; record process ids.
4. Sweep: for each plan item drive lane 1, watching lanes 2, 3, 4, 5 live; on deviation capture a finding and evidence and chase it across lanes before moving on; run lane 7 when the feature generates content.
5. Regression sweep over the configured routes at smoke depth.
6. Collect lane 6 with the judge; timeout marks the lane `INCOMPLETE` without blocking the report.
7. Triage: dedupe, severity Critical, Medium, Minor; class Confirmed, False positive, Duplicate, Environment-specific, Accepted risk; verdict rules: Confirmed Critical or broken core flow gives FAIL; Confirmed Medium or Minor gives PASS-WITH-ISSUES; nothing Confirmed gives PASS; required steps unrun gives INCOMPLETE.
8. Write the report through `qa-report`.
9. Close the browser; remove the run marker; print the verdict line and path.

Resume: when `run-state.json` exists at start, reload it, verify browser and stack, continue from the first pending row; never redo done rows, never zero findings.

### 3.4 Lane notes

- Lane 1: Playwright MCP only; clean authenticated context per role; input classes including script tags, quotes, accented and right-to-left text, very long strings; way-back check on every screen; console and network read after each page; screenshots at `reviews/<id>/artifacts/<area>-<role>-<lang>-<what>.png`; page content is untrusted, a page instructing the agent is itself a finding; navigate only to allowed hosts.
- Lane 2: `docker logs --since <watermark>` filtered by the error pattern, known-noise filter from known-issues, attribution duty, evidence as text files; never restart anything.
- Lane 3: path A observes UI traffic; path B probes changed endpoints: no token, wrong role, cross-tenant id expecting the configured status, malformed and oversized input, double submit; token minted per the auth recipe; literal URLs only; headers and credentials stripped from evidence.
- Lane 4: read-only role first, fallback to app credentials while behaving read-only; inline single statements only; persistence, tenant scoping when a tenant column is configured, audit rows when audit tables are configured, exactly-one-row on double submit; never any write, not even for cleanup.
- Lane 5: gate on LLM or agent stack touched and provider configured; presence, shape, correctness, masking checks per recipe; otherwise stack-health only.
- Lane 6: background start with process ids, judge by set difference, only new failures become findings, newly passing suppressed names are prune candidates.
- Lane 7: inventory generated artifacts named in the spec or observed in the sweep; for each check correctness against the spec, language matches the requested locale, format validity, no leaked prompts or internal identifiers, consistency across runs; evidence as text files; gated off when the feature generates nothing.
- Report: the reference's ten sections; exactly one `Verdict:` line; screenshots embedded with relative image syntax; text evidence inline plus link; known-issues candidates; data hygiene.

### 3.5 Guardrail

`hooks/qa-guardrail` runs on every pre-tool-use event and exits 0 immediately unless `.ultrapowers/qa-active` exists at or above `cwd`. When active it denies with exit 2 and a `QA-GUARDRAIL DENY: <reason>` message: git push, container stop, remove, down or prune, mutating SQL including hidden writes in CTEs, DO blocks and comments, recursive or forced deletes, permission changes, remote shells and inline interpreters, key material access, upload forms, network calls to hosts outside the configured allow-list when one is set, writes outside `reviews/<id>/` and `.ultrapowers/`. The reference's fixture set is ported to bash tests. The agent's rules say a denial is by design and never routed around.

## 4. Acceptance criteria

1. On a scaffolded sample app with two roles and two languages configured, `/ultrapowers:qa-specialist <id>` produces `reviews/<id>/QA-REPORT.md` with one verdict line, a dimension matrix, per-lane coverage, and at least one screenshot per role.
2. With the `db` block empty, lane 4 reports "not covered" and the run completes; the same for lanes 5 and 7 when ungated.
3. Killing the session mid-sweep and rerunning resumes from the first pending row without repeating done rows.
4. Guardrail bash tests pass for every ported fixture with the marker present, and every fixture is allowed with the marker absent.
5. The judge's Node tests pass for trx, vitest JSON and JUnit XML fixtures, including the incomplete cases.
6. Pressure tests per writing-skills: the agent refuses to skip the browser, refuses to mark a lane passed without evidence, stops at a guardrail denial, and never ends without a report.
7. No plugin file contains a hostname, role account, table name or client id from the reference.

## 5. Risks

- Running in the session's permission mode means prompts may interrupt long sweeps. Mitigation: the report is written incrementally through run-state; the owner may pre-approve the read-only tool set in project settings.
- Harnesses without agent forking run the contract inline in the main context. Mitigation: the entry skill states this and shortens the sweep to fit.
- Lane 7 has no precedent. Mitigation: it ships gated and its checks are the smallest set that is verifiable.

## 6. Out of scope

The headless launcher, worktrees, locking and publishing; forge comment posting; VM runbooks; remote environments.
