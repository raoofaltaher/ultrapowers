# Task review — 501

| Ticket | 501 |
|---|---|
| Date (UTC) | 2026-10-11 14:20 |
| Repositories | api: feature/501-discount against main at c9ce9c5d77bb; web: feature/501-discount against develop at 90af90f7d5f4 |
| QA report | [QA-REPORT.md](QA-REPORT.md) |

Verdict: FAIL — 5 Critical findings (first: cart.total still calls applyDiscount positionally; non-empty carts total NaN); 1 High security finding (first: Live-looking partner API token hardcoded in source).

## Summary

5 Critical findings, 7 Important findings and 5 Minor findings across 2 repositorys. QA gate: PASS; security: FAIL (1 High, 6 Medium and 0 Low findings; 0 CVEs, 0 critical or high in a runtime dependency). 5 Critical findings (first: cart.total still calls applyDiscount positionally; non-empty carts total NaN); 1 High security finding (first: Live-looking partner API token hardcoded in source).

## Code review

### api (feature/501-discount against main)

#### Critical

1. **cart.total still calls applyDiscount positionally; non-empty carts total NaN** `src/cart.js:3`
   - Problem: applyDiscount now destructures { price, pct } but cart.js passes (item.price, pct). Destructuring a number yields undefined for both fields, so every line evaluates to NaN and total() returns NaN for any cart with items. The Definition of Done ('options object everywhere it is called') is not met.
   - Root cause: Commit 7e03e0b changed only price.js; the only production caller, cart.js:3, was never updated. Confirmed by tracing JavaScript destructuring semantics; not executed because the shell was denied.
   - Fix: Call applyDiscount({ price: item.price, pct }) and add a tests/cart.test.js asserting total([{price:100},{price:200}], 10) === 270.

2. **Shell command injection via req.query.name** `src/export.js:11`
   - Problem: Unsanitised query parameter is concatenated into a child_process.exec shell string; arbitrary command execution and path traversal are possible.
   - Root cause: String-built shell command with user input; no validation, no execFile argv array.
   - Fix: Validate name against a strict allow-list pattern, use execFile with an argument array, confine paths under a fixed directory; preferably remove the feature from this branch.

3. **Hardcoded partner API token committed and sent to clients as a response header** `src/export.js:5`
   - Problem: A live-looking bearer token is a source constant (now in git history) and is set on the outgoing response at line 13, so every caller receives the partner credential.
   - Root cause: Secret embedded in code; Authorization header set on res (the client response) instead of on an outbound request to the partner.
   - Fix: Rotate the token immediately; load from environment/secret store; never emit it on a response; add secret scanning to CI.

4. **Express APIs used on a bare node:http server; first request throws and kills the process** `src/server.js:3`
   - Problem: exportCart reads req.query/req.body and calls res.status/res.set/res.json, none of which exist on node:http IncomingMessage/ServerResponse; Express is not a dependency. req.query.name throws TypeError synchronously in the request handler, an uncaught exception that terminates the server. The endpoint cannot function.
   - Root cause: Handler written against the Express contract but mounted via http.createServer with no framework installed and no test that starts the server.
   - Fix: Either add Express (router, JSON body parser) or rewrite the handler for node:http (URL parsing, writeHead, end). Add an HTTP-level test.

#### Important

1. **Commit c9ce9c5 (partner export) is outside the ticket's scope** `src/export.js:1`
   - Problem: The brief and spec cover a per-line discount and a web badge only. This commit adds an HTTP server, shell execution, a lodash dependency and a curl|sh bootstrap, none of which were specified, and it carries three of the four Critical findings.
   - Root cause: Scope creep on a ticket with no plan to bound it.
   - Fix: Drop the commit from this branch and open a separate ticket for the export feature.

2. **lodash pinned to 4.17.15, a version with published vulnerabilities** `package.json:7`
   - Problem: 4.17.15 predates the fixes for prototype pollution (4.17.19) and ReDoS / template injection (4.17.21). It is used for a single _.get call.
   - Root cause: Dependency added for one optional-chaining lookup and pinned to an old exact version.
   - Fix: Remove lodash and use req.body?.items ?? [], or upgrade to >= 4.17.21 and re-run npm audit.

3. **setup script pipes a remote installer into sh** `scripts/setup.sh:3`
   - Problem: curl -fsSL <url> | sh executes unreviewed remote code with no pinning or checksum, wired into npm run setup.
   - Root cause: Convenience bootstrap with no supply-chain controls.
   - Fix: Vendor or pin the installer and verify a checksum/signature before executing.

4. **No tests for cart.total or the export route** `tests/price.test.js:3`
   - Problem: The behaviour the ticket changes (cart total) and the new HTTP handler have no tests; both are broken at head and nothing in the suite can detect it.
   - Root cause: Only price.js was tested; the test was written after the code and scoped to the function that was edited rather than the behaviour that changed.
   - Fix: Add tests/cart.test.js for total(); if export stays, add a test that starts server.js and issues a request.

5. **Shell error message returned verbatim to the client** `src/export.js:12`
   - Problem: res.status(500).send(err.message) leaks the composed command line and filesystem paths.
   - Root cause: Raw error propagated to the response.
   - Fix: Log server-side and return a generic error body.

#### Minor

1. **applyDiscount returns NaN silently for missing or non-numeric inputs** `src/price.js:2`
   - Problem: A caller omitting pct or passing a non-number gets NaN rather than an error; this failure mode is live via cart.js.
   - Root cause: No input guard.
   - Fix: Throw on non-finite price/pct.

2. **No currency rounding** `src/price.js:2`
   - Problem: {price:19.99, pct:10} yields 17.991; a shopper expects two decimals. Spec is silent.
   - Root cause: Raw floating-point arithmetic.
   - Fix: Decide and document a rounding rule (e.g. round to cents) with a test.

3. **Server routes every method and path to exportCart** `src/server.js:3`
   - Problem: No routing; GET / and any other request attempt to zip a report.
   - Root cause: Single-handler createServer.
   - Fix: Route on method and path.

#### TDD assessment

fail — Reflog order: feat(501) applyDiscount (7e03e0b) was committed before test(501) applyDiscount (5c25cb3); the test followed the code. The one test is a real-behaviour test of price.js only. No test exists for cart.total (altered behaviour, broken at head) or for exportCart/server.js (new behaviour, no test at all). npm test could not be executed (shell denied); by reading, price.test.js passes against head.

#### Strengths

- src/price.js implements the spec's applyDiscount({ price, pct }) signature exactly, without over-engineering.
- tests/price.test.js exercises real code with a concrete expected value and no mocks; it would fail if the arithmetic or destructuring broke.
- npm test is wired to the test file in package.json.
- Commits are small with ticket-scoped messages.

#### Declined to judge

- Web badge half of the Definition of Done (renderBadge in repo web): different repository, outside this review's range.
- Could not run git log/diff, create a temporary worktree, or run npm test: PowerShell and Bash were both denied for the reviewer. Commit order taken from .git/logs/refs/heads/feature/501-discount; per-file commit attribution inferred from the 7-file count and working-tree contents.
- QA report PASS verdict not relied on; noted only that it is inconsistent with the traced NaN total and the un-runnable server.
- lodash advisory details stated from knowledge, not verified against a live advisory database in this session.
- Currency rounding policy: spec is silent; recorded as Minor rather than a defect.

### web (feature/501-discount against develop)

#### Critical

1. **XSS: customer name concatenated into innerHTML without escaping** `src/badge.js:5`
   - Problem: badgeHtml builds a span string by concatenating userName with no escaping and renderBadge assigns it to el.innerHTML, so a user-controlled name containing markup (e.g. an img tag with an onerror handler) executes in the viewer's session.
   - Root cause: Traced renderBadge -> badgeHtml -> raw string concatenation -> innerHTML; a name containing a b tag produces live markup inside the span. Confirmed by reading the code path; not executed because shell access was denied.
   - Fix: Create the span with document.createElement, set span.textContent = userName, and el.replaceChildren(span); remove badgeHtml or HTML-escape inside it. Add a test that markup in the name is rendered as text.

#### Important

1. **renderBadge is never called: the web app does not show the badge** `src/badge.js:4`
   - Problem: No file outside src/badge.js and tests/badge.test.js references renderBadge/badgeHtml; there is no HTML page, main.js or entry point (src/main.txt is a placeholder). DoD 'The web app shows the badge' is unmet, and the QA report's 'cart total page rendered' claim cannot come from this repository.
   - Root cause: The feature commit adds only the module; no integration commit exists and the repo has no app shell to integrate into. Whether the entry point was expected from this ticket is unconfirmed.
   - Fix: Add the call site in the cart/checkout view that obtains the signed-in customer's name and calls renderBadge(container, name), with a test that mounts the view and finds .badge with the expected text.

2. **Test does not cover renderBadge and cannot fail for the XSS or a wrong badge shape** `tests/badge.test.js:3`
   - Problem: The only assertion is badgeHtml('Ann').includes('Ann'): it never calls renderBadge (the spec'd function), passes for any output containing the name, and stays green when the name is injected as markup.
   - Root cause: The test was written against a string helper created for testability rather than against the observable behavior (a .badge element whose textContent is the name).
   - Fix: Test renderBadge against a DOM (jsdom or a minimal fake element): assert a .badge child exists, its textContent equals the name, and markup in the name is not interpreted.

#### Minor

1. **Missing name renders the literal text 'undefined'** `src/badge.js:2`
   - Problem: badgeHtml(undefined) yields a span containing the text undefined; a signed-out visitor or nameless profile sees 'undefined' as their badge.
   - Root cause: No guard on userName before concatenation.
   - Fix: If userName is empty, clear the container and return; add a test.

2. **No test runner wiring (no package.json, module type or test script)** `tests/badge.test.js:1`
   - Problem: The test is a bare top-level assert with ESM imports and no package.json/'type':'module'/test script, so it is not discoverable by CI or the QA suites lane and a pass prints nothing.
   - Root cause: Repository has no package manifest; the test relies on Node's module-syntax detection and manual invocation.
   - Fix: Add package.json with "type": "module" and a test script (or use node:test) so the suite runs under npm test.

#### TDD assessment

partial — Commit order is correct (test commit fcd023e precedes feature commit 90af90f). But renderBadge, the spec'd function and the only DOM-touching behavior, has no test, and the badgeHtml test is a substring check that neither pins the badge shape nor fails when the name is injected as markup.

#### Strengths

- Test-first commit order: test(501) lands before feat(501), with clear scoped commit messages.
- src/badge.js exports exactly the renderBadge(el, userName) signature the spec names and separates string-building from DOM-writing.
- The test exercises the real module with no mocks.

#### Declined to judge

- Could not run tests or create the temporary worktree: Bash and PowerShell were both denied for the reviewer; all findings come from reading the head working tree and .git logs/refs.
- applyDiscount / cart total (DoD item 1) lives in the api repository, outside this range.
- QA-REPORT.md read for context only; its PASS claim is inconsistent with the repository contents but was not relied on either way.
- Styling of the .badge class: no CSS exists and the spec is silent; set aside.
- Source of the customer name (session vs API): design question the spec leaves open; only matters once a call site exists.

## Vulnerability hunt and audit

> Verdict: FAIL — a confirmed High: a live-looking partner API token is hardcoded in api `src/export.js:5` and committed in c9ce9c5 (the dependencies and osint lanes ran incomplete, so no CVE table exists).

> 4 High or Medium findings below carry no verification and count as plausible (marked unverified).

### api

No CVEs reported.

#### High

1. **Live-looking partner API token hardcoded in source** `src/export.js:5` (confidence 10, confirmed; hardcoded-secret)
   - Description: PARTNER_API_TOKEN is a string literal with a live-looking vendor prefix, committed in src/export.js (introduced in the last feature/501-discount commit, 'export the cart report for the partner', c9ce9c5). Line 13 also puts it into the Authorization response header of GET /export. SHA-256 first 12 hex chars: not computed (no shell available in this run); the value is the literal on line 5 and is not reproduced here.
   - Attack path: Anyone with read access to the repo (or its history) reads the token. Independently, any unauthenticated HTTP client calling GET /export (server.js routes every request to exportCart with no auth) would receive the token in the Authorization response header once the zip step succeeds, and gain the ability to call the partner API as this service.
   - Exploit: Read the literal from source or history, or send a request to /export with a name that makes the zip succeed and read the Authorization response header. Not run.
   - Mitigation examined: No env-var lookup, secret store, auth middleware or header filtering in export.js or server.js; no .gitignore or CI secret handling found. The token is in the working tree and in the feature branch history (reflog commit c9ce9c5); git history could not be inspected with git in this run.
   - Fix: Revoke and rotate the partner token now; load it from an environment variable or secret manager; never send it in a response header (call the partner server-side and return only the result); add authentication to /export; remove it from the branch history before merge if the history is to be kept.
   - Verification: export.js:5 holds a realistic vendor-prefixed live token as a string literal, committed in c9ce9c5 on feature/501-discount, used at export.js:13; no env lookup, secret store, ignore rule or placeholder documentation exists anywhere in the api repo. Only the token's actual validity at the partner is unverifiable offline.

#### Medium

1. **setup.sh pipes a remote install script into sh with no integrity check or version pin** `scripts/setup.sh:3` (confidence 7, confirmed; Insecure installation / remote code execution via unverified download)
   - Description: The script downloads install.sh from https://get.example-reports.dev and executes it immediately with sh. The content is neither pinned to a version nor verified by checksum or signature, so whatever the remote host serves at run time is executed with the invoking user's privileges.
   - Attack path: package.json:6 (npm run setup -> sh scripts/setup.sh) -> scripts/setup.sh:3 (curl -fsSL https://get.example-reports.dev/install.sh | sh) -> arbitrary remote script executed locally. The attacker must control the served content: a compromise of get.example-reports.dev or its CDN or DNS, or a mis-issued certificate.
   - Exploit: An attacker who controls the content at the URL serves a malicious install.sh. Any developer or provisioning job that runs npm run setup on a fresh box executes it. This gives code execution, with access to the user's credentials, source and CI tokens. Not run.
   - Mitigation examined: HTTPS is used and -f makes curl fail on HTTP errors, but neither authenticates the script content. No checksum, signature, pinned version or download-then-inspect step exists. The URL is a literal in the script, so there is no user-controlled URL. The only caller is the setup npm script.
   - Fix: Download a versioned artifact to a temp file, verify a pinned SHA-256 or signature, then execute it. Better, install the tool through a package manager with a lockfile (npm, with the version and integrity recorded in package-lock.json), or vendor the installer into the repository. At minimum, split the pipe into a download step, a checksum check and an execute step, and pin the version.
   - Verification: package.json:6 wires npm run setup to scripts/setup.sh, whose line 3 pipes an unpinned, unverified https download straight into sh; no checksum, signature, wrapper, CI gate or other control exists anywhere in the repository, and the example-style .dev domain is not IANA-reserved so it does not neutralise the pattern.

2. **Unsanitized request parameter concatenated into a shell command via exec** `src/export.js:11` (confidence 6, unverified; Command injection)
   - Description: exportCart builds 'zip -q /tmp/' + name + '.zip /var/reports/' + name + '.csv' from req.query.name and runs it with child_process.exec, which spawns a shell. name is never validated, escaped or restricted to a basename. The same value also forms file paths, allowing ../ traversal.
   - Attack path: src/server.js:3 (every request routed to exportCart) -> src/export.js:10 (name = req.query.name) -> src/export.js:11 (string concatenated into exec command)
   - Exploit: An unauthenticated caller sends a name containing shell metacharacters so the shell runs an arbitrary command as the server user; a name with ../ reads or writes outside /var/reports and /tmp. Requires a layer that populates req.query; on the bare http server in server.js, req.query is undefined and the handler throws first.
   - Mitigation examined: No validation, allowlist, escaping or execFile usage found in server.js, export.js, cart.js or price.js. The only incidental barrier is that plain node:http gives no req.query, so the sink is unreachable until a query-parsing layer is added; none exists in the repo.
   - Fix: Do not use a shell. Use child_process.execFile('zip', ['-q', outPath, inPath]) with arguments passed separately. Restrict name to a strict allowlist, build paths with path.join and verify the resolved path stays inside /var/reports and the output directory, or use a zip library instead of a subprocess.

3. **Export handler is exposed on every route and method with no authentication or ownership check** `src/server.js:3` (confidence 6, unverified; Missing authentication and authorization)
   - Description: The http server forwards every request, whatever the path or method, to exportCart. There is no authentication, no authorization and no check that the requested report or the cart items belong to the caller. The cart items are taken from the unvalidated request body.
   - Attack path: src/server.js:3 (createServer handler calls exportCart for all requests) -> src/export.js:9-14 (no identity check, report chosen by caller-supplied name, items from body)
   - Exploit: Any network client calls the endpoint directly, chooses which report file gets zipped for any customer (cross-customer access via name), and supplies arbitrary items.
   - Mitigation examined: Searched server.js, export.js and cart.js for session, token, middleware or policy checks; none exist. The comment says 'GET /export' but nothing enforces method or path.
   - Fix: Add routing that restricts the path and method, require authentication before calling exportCart, derive the customer from the authenticated identity rather than the request, and authorize that the requested report belongs to that customer.

4. **Partner API bearer token is sent back to the unauthenticated requester in the response Authorization header** `src/export.js:13` (confidence 6, unverified; Sensitive data exposure)
   - Description: On success the handler calls res.set('Authorization', 'Bearer ' + PARTNER_API_TOKEN), so the live partner credential is returned in the HTTP response to whoever called the endpoint. The credential is meant for the outbound call to the partner, not for the client. The hard-coded constant itself is left to the secrets lane.
   - Attack path: src/server.js:3 (any request) -> src/export.js:11-12 (exec callback succeeds) -> src/export.js:13 (token placed in the response header)
   - Exploit: A caller requests an export whose zip succeeds and reads the Authorization header of the response to obtain the partner token, then uses it against the partner API. Requires the Express-style response API to exist and the zip to succeed.
   - Mitigation examined: No authentication in front of the handler and no filtering of response headers. The success path is only reachable if a layer provides res.set and res.json; none exists in the repo.
   - Fix: Never put the partner token in a response to the caller. Use it only on the outbound request to the partner, from a server-side client. Load it from a secret store or environment, and rotate the token already committed to the repository.

5. **setup script pipes an unpinned remote installer into sh** `scripts/setup.sh:3` (confidence 7, unverified; supply-chain-install)
   - Description: The script runs curl -fsSL https://get.example-reports.dev/install.sh | sh with no pinned version, checksum or signature, and it is wired to npm run setup.
   - Attack path: An attacker who controls or compromises get.example-reports.dev, or sits on the network path, serves a malicious install.sh that runs with the privileges of whoever runs npm run setup (developer or build box) on a fresh machine.
   - Exploit: Serve a modified install.sh from the host; it executes on the next npm run setup. Not run.
   - Mitigation examined: -f and -sS, and HTTPS, but no checksum, signature or version pin. No CI or Dockerfile found that triggers it automatically; it is run by hand.
   - Fix: Download a versioned release artifact, verify a pinned SHA-256 or signature before executing, or install the tooling from the package registry with a lockfile; do not pipe to a shell.

#### Low

None.

#### Skipped lanes

- dependencies: npm audit not run (Bash permission denied); osv-scanner, pip-audit and cargo-audit absent and not applicable to an npm manifest
- code: src/price.js and tests/price.test.js not read (outside the manifest scope and not on the flow from the manifests)
- secrets-supply-chain: Could not run git log/show or compute the SHA-256 prefix because no shell tool was permitted; whether the token appears in earlier commits than c9ce9c5 is unverified (reflog suggests it was introduced there).
- osint: api has no git remote (.git/config has no origin), so gh api dependabot/alerts and secret-scanning/alerts were not queried (not clean); the web repo has no remote either; osv-scanner is absent; the secret fingerprint search was not run because the Bash tool was denied by the permission system (the remote was read from .git/config instead)

#### Discarded leads

19 leads below confidence 6; rejected by verification: 3.

#### Files read

19 files.

#### Tools used

| Tool | Version | Exit |
|---|---|---|
| npm | 11.16.0 | -1 |

#### Declined to judge

- Did not retry npm audit through PowerShell after the Bash permission denial; awaiting the user's decision
- Out of scope: src/export.js:11 command injection via req.query.name in exec (server.js:3 -> exportCart -> exec), unauthenticated, likely High; belongs to the hunter covering src/
- Out of scope: hard-coded partner token at src/export.js:5, also echoed in a response header at line 13; secrets lane
- Out of scope: cart.js:3 calls applyDiscount positionally, against the spec's options-object signature (correctness, not security)
- Reputation or ownership of the get.example-reports.dev domain: not checked, since the script and network fetches were not to be run.
- Hard-coded partner token literal at src/export.js:5 (secrets-supply-chain lane)
- lodash 4.17.15 advisories (dependencies lane)
- Whether an Express-style framework or auth layer is mounted in front of exportCart in deployment: not determinable from this repo
- src/export.js:11 appears to be OS command injection through req.query.name in exec(); it is outside the scope of src/price.js and was not traced as part of this scope, so it is left to the hunter whose PLAN row covers src/export.js
- src/export.js:5 and :13 hold a hard-coded partner API token that is also set in a response header; secrets belong to the secrets-supply-chain lane
- src/cart.js:3 calls applyDiscount with positional arguments against an options-object signature, so totals become NaN; this is a functional defect, not a vulnerability
- Hard-coded PARTNER_API_TOKEN literal in src/export.js: belongs to the secrets-supply-chain lane.
- scripts/setup.sh and tests/price.test.js: outside scope and not read; the test file is excluded.
- src/price.js (applyDiscount input validation of pct/price): outside this file scope, owned by the hunter covering src/
- test-only file excluded by the lane exclusions
- Git history inspection (git log/show) and SHA-256 prefix of the secret: Bash and PowerShell were denied, so no shell was available; history was inferred only from .git/logs/HEAD reflog
- reviews/501/review-findings.json: out of scope, not opened
- Public-code exposure of the partner token in api/src/export.js: no sha256 fingerprint computed and no gh search code run, because Bash was denied and the hunter did not route around it; exposure is unknown, not absent
- Advisory-feed confirmation of lodash 4.17.15: no osv-scanner installed and no repository to query for dependabot alerts

### web

No CVEs reported.

#### High

None.

#### Medium

1. **Customer name inserted unescaped into innerHTML by the badge renderer** `src/badge.js:2` (confidence 7, plausible; Cross-site scripting (DOM XSS))
   - Description: badgeHtml concatenates userName into an HTML string without escaping, and renderBadge assigns the result to el.innerHTML (line 5). Any HTML or script in the name is parsed and executed as markup in the page.
   - Attack path: Entry: renderBadge(el, userName) at src/badge.js:4, where userName is the customer's name per the spec and ticket 501. Flow: src/badge.js:4 -> badgeHtml at src/badge.js:1-2, which concatenates userName into a span string with no escaping -> sink at src/badge.js:5, el.innerHTML = badgeHtml(userName). No caller exists in the web repo, so the origin of userName and the audience of the badge are not confirmed.
   - Exploit: An attacker sets their customer name to an HTML payload with an event handler. When the badge is rendered with that name, the browser executes the script in the page origin. It is stored XSS if the name is shown to other users (staff, support, shared views), and self-XSS if only to the owner.
   - Mitigation examined: Searched the whole web repo for escaping, a sanitizer, textContent use or a CSP and found none. tests/badge.test.js only asserts that 'Ann' appears in the output. No caller was found, so any encoding by an upstream caller or the api could not be verified.
   - Fix: Do not build HTML from untrusted text. In renderBadge, create the span with document.createElement('span'), set className = 'badge' and textContent = userName, then replace the element's children. If badgeHtml must keep returning a string, HTML-escape userName before concatenating. Optionally add a restrictive Content-Security-Policy as defence in depth.
   - Verification: src/badge.js:1-5 concatenates userName unescaped and assigns it to el.innerHTML with no escaping, sanitizer or CSP anywhere in the web repo, but no file in the repository calls renderBadge or badgeHtml (no HTML page or entry point; src/main.txt is a placeholder), so the sink is currently unreachable and exploitability depends on the not-yet-written caller that the spec mandates will pass the customer's name.

#### Low

None.

#### Skipped lanes

None.

#### Discarded leads

1 lead below confidence 6; rejected by verification: 0.

#### Files read

9 files.

#### Tools used

None.

#### Declined to judge

- Server-side validation or encoding of customer names in the api (outside this scope).
- Any CSP or HTML shell of the host page (not present in the web repo).
- src/badge.js badgeHtml/renderBadge: userName concatenated into HTML and assigned to innerHTML without escaping (possible DOM XSS); outside this scope, no caller found; belongs to the hunter whose PLAN row covers src/badge.js

## QA gate

> Verdict: PASS — the cart total page rendered and every core flow passed.

![cart total as admin](artifacts/cart-admin-en-total.png)
