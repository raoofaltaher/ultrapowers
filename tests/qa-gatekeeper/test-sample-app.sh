#!/usr/bin/env bash
# Offline checks of the sample project that Tasks 12 and 13 run the QA gatekeeper against: the
# app serves two roles and two languages (with its seeded French defect), the preflight accepts
# its config and gates lanes 2, 4, 5 and 7 off with reasons, a missing required credential
# becomes a precondition, and its suite runs through run-suite.sh and the judge with no new
# failures. Needs node, git and curl.
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
PREFLIGHT="$REPO_ROOT/skills/qa-specialist/scripts/qa-preflight.mjs"
RUNNER="$REPO_ROOT/skills/qa-lane-6-suites/scripts/run-suite.sh"
JUDGE="$REPO_ROOT/skills/qa-lane-6-suites/scripts/judge.mjs"

FAILURES=0
pass() { echo "  [PASS] $1"; }
fail() { echo "  [FAIL] $1"; FAILURES=$((FAILURES + 1)); }
expect() {
  # $1 description, $2 expected value, $3 actual value
  if [[ "$3" == "$2" ]]; then pass "$1"; else fail "$1 (expected '$2', got '$3')"; fi
}
field() {
  # $1 JSON text, $2 dotted path; prints the value (objects and arrays as JSON)
  printf '%s' "$1" | node -e '
let text = "";
process.stdin.on("data", (chunk) => { text += chunk; }).on("end", () => {
  const value = process.argv[1].split(".").reduce((o, k) => (o == null ? o : o[k]), JSON.parse(text));
  process.stdout.write(typeof value === "object" ? JSON.stringify(value) : String(value));
});' "$2"
}
status() { curl -s -o /dev/null -w '%{http_code}' "$@"; }

TEST_ROOT="$(mktemp -d)"
SERVER_PID=""
cleanup() {
  if [[ -n "$SERVER_PID" ]]; then kill "$SERVER_PID" 2>/dev/null; fi
  rm -rf "$TEST_ROOT"
}
trap cleanup EXIT

PORT=$((20000 + RANDOM % 20000))
BASE="http://localhost:$PORT"
PROJECT="$TEST_ROOT/sample"
QA_USER_USER=qa-user
QA_USER_ADMIN=qa-admin
QA_PW_USER="pw-$RANDOM-$RANDOM"
QA_PW_ADMIN="pw-$RANDOM-$RANDOM"
export QA_USER_USER QA_USER_ADMIN QA_PW_USER QA_PW_ADMIN

echo "sample project tests (port $PORT)"

if bash "$SCRIPT_DIR/sample-app/make-sample.sh" "$PROJECT" "$PORT" >/dev/null; then pass "make-sample.sh builds the project"; else fail "make-sample.sh builds the project"; fi
if bash "$SCRIPT_DIR/sample-app/make-sample.sh" "$PROJECT" "$PORT" >/dev/null 2>&1; then fail "make-sample.sh refuses an existing project"; else pass "make-sample.sh refuses an existing project"; fi

QA_SAMPLE_PORT="$PORT" node "$PROJECT/app/server.mjs" >"$TEST_ROOT/server.log" 2>&1 &
SERVER_PID=$!
up=0
for _ in $(seq 1 100); do
  if curl -s -o /dev/null "$BASE/health"; then
    up=1
    break
  fi
  sleep 0.1
done
expect "the app answers /health" 1 "$up"

curl -s -o /dev/null -c "$TEST_ROOT/user.jar" --data-urlencode "username=$QA_USER_USER" --data-urlencode "password=$QA_PW_USER" "$BASE/login"
curl -s -o /dev/null -c "$TEST_ROOT/admin.jar" --data-urlencode "username=$QA_USER_ADMIN" --data-urlencode "password=$QA_PW_ADMIN" "$BASE/login"
expect "the API needs a session" 401 "$(status "$BASE/api/items")"
expect "a wrong password is refused" 401 "$(status --data-urlencode "username=$QA_USER_USER" --data-urlencode "password=wrong" "$BASE/login")"
expect "the user reaches the item list" 200 "$(status -b "$TEST_ROOT/user.jar" "$BASE/")"
expect "the user is denied the admin page" 403 "$(status -b "$TEST_ROOT/user.jar" "$BASE/admin")"
expect "the admin reaches the admin page" 200 "$(status -b "$TEST_ROOT/admin.jar" "$BASE/admin")"
expect "the user may not delete through the API" 403 "$(status -X DELETE -b "$TEST_ROOT/user.jar" "$BASE/api/items/1")"
if curl -s -b "$TEST_ROOT/user.jar" "$BASE/?lang=fr" | grep -q 'Articles'; then pass "French is served on ?lang=fr"; else fail "French is served on ?lang=fr"; fi
if curl -s -b "$TEST_ROOT/user.jar" --data-urlencode "name=" "$BASE/items?lang=en" | grep -q 'A name is required'; then pass "an empty name is refused in English"; else fail "an empty name is refused in English"; fi
if curl -s -b "$TEST_ROOT/user.jar" --data-urlencode "name=" "$BASE/items?lang=fr" | grep -q 'items.required'; then pass "seeded defect: the French refusal shows the raw key"; else fail "seeded defect: the French refusal shows the raw key"; fi

REPORT="$(node "$PREFLIGHT" 2001 --cwd "$PROJECT")"
expect "the preflight exits 0 on the sample" 0 "$?"
expect "preflight ok" true "$(field "$REPORT" ok)"
expect "no preconditions" "[]" "$(field "$REPORT" preconditions)"
expect "lane 2 gated off" false "$(field "$REPORT" gates.lane2.active)"
expect "lane 4 gated off" false "$(field "$REPORT" gates.lane4.active)"
expect "lane 4 reason" "qa.db is not configured (engine, container or host, database)" "$(field "$REPORT" gates.lane4.reason)"
expect "lane 5 gated off" false "$(field "$REPORT" gates.lane5.active)"
expect "lane 5 reason" "qa.observability.provider is none" "$(field "$REPORT" gates.lane5.reason)"
expect "lane 6 active" true "$(field "$REPORT" gates.lane6.active)"
expect "lane 7 gated off" false "$(field "$REPORT" gates.lane7.active)"
expect "localization active" true "$(field "$REPORT" gates.localization.active)"
expect "user credentials present" present "$(field "$REPORT" roles.0.credentials)"
expect "admin credentials present" present "$(field "$REPORT" roles.1.credentials)"
expect "app is on the ticket branch" true "$(field "$REPORT" changeSet.0.onTicketBranch)"
expect "the change set lists the feature files" '["sample-suite.mjs","server.mjs"]' "$(field "$REPORT" changeSet.0.files)"

NOCRED="$(env -u QA_PW_USER node "$PREFLIGHT" 2001 --cwd "$PROJECT")"
if field "$NOCRED" preconditions | grep -Fq 'required role \"user\"'; then pass "a required role without credentials is a precondition"; else fail "a required role without credentials is a precondition"; fi

bash "$RUNNER" "$(field "$REPORT" suites.0.path)" "$TEST_ROOT/suite-out" "$(field "$REPORT" suites.0.command)"
expect "the sample suite exits 0" 0 "$(cat "$TEST_ROOT/suite-out/exit-code" 2>/dev/null)"
if node "$JUDGE" "$TEST_ROOT/suite-out" "$PROJECT/qa/known-issues.md" | grep -q '^== judge summary: 0 new-failing, 0 suppressed'; then
  pass "the judge finds no new failures in the sample suite"
else
  fail "the judge finds no new failures in the sample suite"
fi

if [[ "$FAILURES" -gt 0 ]]; then
  echo "STATUS: FAILED ($FAILURES failure(s))"
  exit 1
fi
echo "STATUS: PASSED"
