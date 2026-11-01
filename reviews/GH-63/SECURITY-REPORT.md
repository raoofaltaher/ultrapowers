# Security report — GH-63
Verdict: INCOMPLETE — run_status in_progress in ultrapowers: the run did not finish; ultrapowers has no findings.json; the dependencies lane did not run or did not complete in ultrapowers.

| Ticket or audit | GH-63 |
|---|---|
| Date (UTC) | 2026-11-01 17:46 |
| Run | run-1 |
| Depth | quick |
| Scope | scoped run, 68 path(s) |
| Repositories | ultrapowers |

## Summary

0 confirmed findings (0 critical, 0 high, 0 medium, 0 low, 0 informational), 0 needs_validation, 0 rejected, 0 committed credentials, 0 OSINT alerts, 0 CVEs (0 critical or high in a runtime dependency) and 0 of 0 advisories from research that apply, across 1 repository.

Guardrail: active
Sandbox: ultrapowers: unavailable: no hunt.sandbox in .agents/ultrapowers.json
Research: Firecrawl search and scrape, WebSearch, WebFetch, context7-http documentation, DeepWiki
Problems: none

## ultrapowers

Run status: in_progress

### Confirmed findings

#### critical

None.

#### high

None.

#### medium

None.

#### low

None.

#### informational

None.

### Needs validation

None.

### Committed secrets

None.

### CVEs

None.

### Advisories from research

Research tools: Firecrawl search and scrape, WebSearch, WebFetch, context7-http documentation, DeepWiki.

No advisory found.

Not researched: ws ^8.22.0 (tests/brainstorm-server/package.json:8) (covered by the npm audit tool present in TOOLS; its database is the source, not a research query)
Not researched: runtimes and base images (Node engines, version files, Dockerfile FROM) (not declared in a readable form)

### OSINT alerts

None.

### Notes

- package.json:0 missing-lockfile: No lockfile next to the root package.json, so npm audit cannot run (ENOLOCK). The manifest declares no dependencies or devDependencies, so nothing is unpinned; the missing lockfile is moot today.
- package.json:0 no-engines: No engines field; AGENTS.md states Node 22 or newer, but the manifest does not enforce it. Not an end-of-life runtime finding.
- tests/brainstorm-server/package.json:8 test-only-dependency: ws ^8.22.0 is locked to 8.22.0 (tests/brainstorm-server/package-lock.json:15) with an integrity hash; it is used only by the brainstorm-server tests. Optional peers bufferutil and utf-8-validate are not installed. npm audit found no advisory.

### Tool lanes

| Lane | Status | Tools (exit) |
|---|---|---|
| osint | skipped (origin is a local path (S:/ultrapowers/.claude/worktrees/GH-63), so there is no <o>/<r> to query with gh; osv-scanner is absent) | - |
| dependencies | incomplete (root package.json has no lockfile: npm audit exited 1 with ENOLOCK and no report; the root manifest declares no dependencies, so the offline fallback found nothing to audit. tests/brainstorm-server audited clean (exit 0).) | npm 11.21.1 (0), npm 11.21.1 (1) |
| secrets | ok | gitleaks 8.30.1 (0) |

### Cloudflare reports

- [run-1/ultrapowers/REPORT.md](run-1/ultrapowers/REPORT.md)
- [run-1/ultrapowers/FINDINGS-DETAIL.md](run-1/ultrapowers/FINDINGS-DETAIL.md)
- [run-1/ultrapowers/NEEDS-VALIDATION.md](run-1/ultrapowers/NEEDS-VALIDATION.md)
