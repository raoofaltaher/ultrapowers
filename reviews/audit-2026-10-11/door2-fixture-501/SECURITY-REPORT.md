# Security report — 501
Verdict: FAIL — a confirmed High: a live-looking partner API token is hardcoded in api `src/export.js:5` and committed in c9ce9c5 (the dependencies and osint lanes ran incomplete, so no CVE table exists).

| Ticket or audit | 501 |
|---|---|
| Date (UTC) | 2026-10-11 (the session clock read 17:18 AST; the UTC time was not recorded) |
| Scope | ticket 501 change set: the files each ticket branch touched against its own base |
| Repositories | api: feature/501-discount at c9ce9c5, 7 files; web: feature/501-discount at 90af90f, 2 files; mobile skipped (path not found) |
| Lanes run | dependencies (incomplete), code (8 hunters), secrets-supply-chain (incomplete), osint (incomplete); ai-surface skipped |

## Summary

1 High, 2 Medium, 0 Low findings; 0 CVEs (no audit tool report exists). Six findings were sent to verifiers after de-duplication across lanes: 2 confirmed, 1 plausible, 3 rejected. 14 leads were discarded: 3 by verifier rejection, the rest below the floor or owned by another lane. The verdict is decided by the confirmed High, the hardcoded partner token.

Three findings that all hang off the same handler (command injection through `name`, the token returned in a response header, and the missing authentication with path traversal) were rejected as not reachable: `src/server.js` is a bare `node:http` server with no framework in `package.json` or the lockfile, so `req.query` is undefined and `src/export.js:10` throws before any of them runs. They are latent defects that become live, and the injection becomes High, the moment an Express-style layer is mounted in front of the handler; the code review lists the handler as a Critical defect for the same reasons, and the fix in each case is in that review.

Guardrail: active. The first denial was met on this run's own check (a compound `Monitor` command, `HUNT-GUARDRAIL DENY: a compound command the analyzer does not follow`); it was recorded and not worked around, and the waiting was done with plain single commands. It blocked no check.

## Repositories

### api

### CVEs

| Package | Version | Advisory | Severity | Fixed in | Runtime |
|---|---|---|---|---|---|
| none: no audit tool report exists | | | | | |

`npm audit --package-lock-only --json` was not run: the shell was denied to the dependencies hunter (exit none). The dependencies lane is `incomplete`. lodash 4.17.15 is the only dependency and is a runtime one (`src/export.js:2`); no advisory id is listed because none came from a tool, and none is taken from memory.

### Findings

#### High

1. **Live-looking partner API token hardcoded in source** `src/export.js:5` — hardcoded-secret, confidence 10, verification confirmed (confidence 9)
   - Attack path: anyone with read access to the repository or its history reads the literal at `src/export.js:5`, committed in c9ce9c5 on feature/501-discount, and can call the partner API as this service. The same literal is used at `src/export.js:13`.
   - Exploit: read the value from source or git history. Described, not run. Fingerprint (first 12 characters of the SHA-256): not computed, because no shell was available to the hunter; the value is the literal on line 5 and is not reproduced in this report.
   - Mitigation examined: no environment lookup, secret store, ignore rule or placeholder documentation anywhere in the api repository; the verifier found the value realistic (vendor prefix, live marker, 32 hex characters) and not a documented sample. Only its validity at the partner is unverifiable offline.
   - Fix: revoke and rotate the token now (it is in git history, so deleting the line is not enough); load it from an environment variable or secret manager; remove it from the branch history before the branch is kept or merged. Described, not applied.

#### Medium

1. **setup.sh pipes a remote install script into sh with no integrity check or version pin** `scripts/setup.sh:3` — supply-chain-install, confidence 7, verification confirmed (confidence 9). Found by the code lane and the secrets-supply-chain lane.
   - Attack path: `package.json:6` (`npm run setup` runs `sh scripts/setup.sh`) -> `scripts/setup.sh:3` (`curl -fsSL https://get.example-reports.dev/install.sh | sh`) -> whatever the host serves runs with the privileges of the person who ran it.
   - Exploit: an attacker who controls the served content (host, CDN or DNS compromise, or a taken-over unregistered domain: `.dev` is not an IANA-reserved example name) serves a malicious script that runs on the next `npm run setup`. Described, not run.
   - Mitigation examined: HTTPS and `-f` authenticate the host and fail on HTTP errors, not the content; no checksum, signature, version pin or wrapper exists; nothing in CI or a Dockerfile runs it, so it is a manual step.
   - Fix: download a versioned artifact, verify a pinned SHA-256 or signature, then execute it; or install through a package manager with a lockfile.

### web

#### Medium

1. **Customer name inserted unescaped into innerHTML by the badge renderer** `src/badge.js:2` — DOM XSS, confidence 7, verification plausible (confidence 8)
   - Attack path: `renderBadge(el, userName)` at `src/badge.js:4` -> `badgeHtml` at `src/badge.js:1-2` concatenates the name into a span string with no escaping -> `el.innerHTML = badgeHtml(userName)` at `src/badge.js:5`. No file in the web repository calls `renderBadge` (no page, no entry point; `src/main.txt` is a placeholder), so the sink is not reachable today.
   - Exploit: a customer sets their name to an HTML payload with an event handler; when the badge is rendered the script runs in the page origin (stored XSS if staff or other customers see it, self-XSS if only the owner does). Described, not run.
   - Mitigation examined: no escaping, sanitizer, `textContent` use or CSP anywhere in the web repository; the exploitability turns on the caller the spec requires and the host page, neither of which exists here.
   - Fix: build the span with `document.createElement` and set `textContent = userName`, or HTML-escape before concatenating; land it before the call site does.

#### Low

None.

## Skipped lanes

- ai-surface: skipped, no model client, prompt file or MCP configuration in scope (preflight).
- dependencies: ran `incomplete`: `npm audit` was not run (shell denied, exit none); osv-scanner, pip-audit and cargo-audit are absent; offline fallback: the manifest and lockfile were read (lodash 4.17.15 pinned exactly, lockfileVersion 3, integrity hash from the npmjs registry, no `.npmrc`, no git or URL dependencies).
- secrets-supply-chain: ran `incomplete`: git history and the SHA-256 fingerprint could not be computed without a shell; the reflog suggests c9ce9c5 introduced the token, earlier commits are unverified.
- osint: ran `incomplete`: neither repository has a git remote, so no `gh api` Dependabot or secret-scanning query was possible (not clean); osv-scanner is absent; the public-code search for the token's fingerprint was not run, so public exposure of the token is unknown.
- mobile: skipped, path not found (preflight note).

## Discarded leads (14)

- Verifier rejection: unsanitised `req.query.name` concatenated into an `exec` shell string, `src/export.js:11` (confidence 9): the only mount is bare `node:http`, so `req.query` is undefined and `src/export.js:10` throws before the sink; latent, becomes High once a query-parsing layer is added.
- Verifier rejection: partner token returned in the response `Authorization` header, `src/export.js:13` (confidence 8): the handler throws at line 10 and `res.set` does not exist on `ServerResponse`, so no caller receives the header today; latent High on any Express-style mount.
- Verifier rejection: no authentication or ownership check and `name` used as a file path, `src/export.js:10` (confidence 8): the same break at line 10; latent.
- lodash 4.17.15 may have advisories fixed in later versions: recalled from memory, no tool report, so not a CVE row (dependencies lane).
- `applyDiscount` does not validate `pct` or `price`, `src/price.js:1-3`: `pct` is hard-coded to 0 at the only call site, not attacker-reachable, confidence below 6.
- Crash on `req.query` / `res.status` being undefined on plain `node:http`, and a malformed `items` body: denial of service, excluded.
- `total(items, 0)` and `cart.js:3` calling `applyDiscount` positionally (NaN totals): functional defects, not security flaws (reported in the code review).
- `lodash` `_.get` on `req.body.items`, `src/export.js:9`: a read-only accessor, no prototype-pollution path.
- `tests/price.test.js` and `tests/badge.test.js`: test-only files, excluded.
- No injection path in `scripts/setup.sh`: no variables or untrusted input interpolated.
- No CI workflows, Dockerfiles, `.env*` or `.npmrc` in api: no pipeline findings possible.
- Reputation of `get.example-reports.dev` and server-side encoding of customer names in the api: not judged (outside a read-only code read).
- The hardcoded token in `src/export.js:5` as an OSINT finding: no public hit was searched for, so none is recorded; the secrets lane owns the finding.
- `web/src/format.js` and `web/src/main.txt`: nothing to flag.

## Files read (76 reads across the hunters)

By lane (reads, counting the shared ticket documents once per hunter): dependencies 5, code 44 (manifests 8, setup 3, export 6, price.js 6, server 7, price test 3, badge.js 6, badge test 5), secrets-supply-chain 13, osint 14; the full lists live in `security-findings.json`.

## Tools used

| Tool | Version | Command | Exit |
|---|---|---|---|
| npm | 11.16.0 | `npm audit --package-lock-only --json` | not run (shell denied, no exit code) |
| osv-scanner | absent | none | not applicable |
| pip-audit | absent | none | not applicable |
| cargo-audit | absent | none | not applicable |
| gh | 2.86.0 (signed in) | none run: no git remote to query | not run |
