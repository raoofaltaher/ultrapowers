---
name: qa-lane-3-api
description: Use when the qa-specialist agent validates API behaviour two ways during a QA run; observing the browser's real traffic, and probing the changed endpoints directly for the negative, permission and cross-tenant cases the UI will not trigger.
user-invocable: false
---

# Lane 3 — API request and response

## Path A — observe the UI's traffic

After each lane 1 scenario, read the browser's network requests: status codes match the
scenario's expectation (success paths 2xx, guarded paths 401 or 403); no unexpected 4xx or 5xx;
API responses that feed the visible UI carry the data the UI showed (spot-check). A page-load
API call repeating for more than about two seconds is a Performance-lite flag.

## Path B — direct probes (what the UI cannot easily do)

Endpoints under test are the ones the `changeSet` files declare or that path A observed. Mint a
token per `qa.auth.type`:

- `oidc-password`: password grant against `qa.auth.tokenUrl` with `qa.auth.clientId`:

  ```bash
  curl -s -X POST <qa.auth.tokenUrl> -d grant_type=password -d client_id=<qa.auth.clientId> --data-urlencode "username=$<userEnv>" --data-urlencode "password=$<passwordEnv>" -o <ROOT>/.ultrapowers/qa-token.json -w '%{http_code}\n'
  ```

  The token file lives in the gitignored `.ultrapowers/`, never under `reviews/`. Use it inside
  the same shell line as the probe, so the value never prints:

  ```bash
  TOKEN="$(sed -n 's/.*"access_token":"\([^"]*\)".*/\1/p' <ROOT>/.ultrapowers/qa-token.json)"; curl -s -o <ROOT>/reviews/<ID>/artifacts/api-<finding>.txt -w '%{http_code}\n' -H "Authorization: Bearer $TOKEN" <literal endpoint URL>
  ```

  Never print the file; STEP 9 deletes it.
- `form`: sign in from the shell the way the form does, with the form's own field names (read
  them from the login page in lane 1) and a cookie jar in the gitignored `.ultrapowers/`:

  ```bash
  curl -s -o /dev/null -w '%{http_code}\n' -c <ROOT>/.ultrapowers/qa-cookies-<role>.txt --data-urlencode "<user field>=$<userEnv>" --data-urlencode "<password field>=$<passwordEnv>" <qa.urls.frontend><qa.auth.route>
  ```

  then probe with `-b <ROOT>/.ultrapowers/qa-cookies-<role>.txt`. When the form needs more than
  two fields (an anti-forgery token, a second factor), probe the unauthenticated cases only and
  record the authenticated probes as `not-covered — form sign-in needs <what>`.
- `custom`: follow `qa.auth.recipe`.

Tokens are short-lived: **re-mint per probe batch**, never once per run.

For each changed endpoint, probe:

- **No token** → expect 401.
- **Wrong role** (a lower role's token on a higher role's endpoint) → expect 403; if the response
  carries data anyway → Critical (Access control).
- **Cross-tenant** (an id belonging to another tenant, when the app is multi-tenant) → expect
  `qa.api.crossTenantStatus` (default 404). A 200 is a Critical IDOR finding; any other status
  that reveals existence is a Medium finding.
- **Malformed, empty and oversized body** → expect 400 with the fields named in
  `qa.api.errorEnvelopeFields` (when set); a missing localized message field is a Localization
  finding.
- **Double submit** of a mutating call → no duplicate row (verify via lane 4 when active).

Writes only through the app's own endpoints against the test tenant. Literal URLs only; a `$VAR`
URL is denied by the guardrail by design. Hosts: `qa.hosts.allowed` only.

## Evidence

Save probe and response (status, body excerpt) to `reviews/<ID>/artifacts/api-<finding>.txt` at
capture time. For coverage, append every probe as you go (method, path, role, expected status,
observed status) to `api-probes.txt`; without it the lane is not `done`. Strip `Authorization`
headers, cookies and any credential material from everything you save. Never write a token into
the report or an artifact.
