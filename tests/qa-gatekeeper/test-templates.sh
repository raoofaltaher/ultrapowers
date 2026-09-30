#!/usr/bin/env bash
# Structural checks for the piece 5 templates: the known-issues baseline carries both fenced
# blocks, the config template carries every qa key from spec 3.2, and the hygiene block
# carries the two QA lines.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
KNOWN="$REPO_ROOT/templates/qa/known-issues.md.tmpl"
CONFIG="$REPO_ROOT/templates/.agents/ultrapowers.json.tmpl"

FAILURES=0
pass() { echo "  [PASS] $1"; }
fail() { echo "  [FAIL] $1"; FAILURES=$((FAILURES + 1)); }

assert_file_contains() {
  local file="$1" needle="$2" description="$3"
  if [[ -f "$file" ]] && grep -Fq -- "$needle" "$file"; then
    pass "$description"
  else
    fail "$description"
    echo "    expected $file to contain: $needle"
  fi
}

echo "QA gatekeeper template tests"

assert_file_contains "$KNOWN" '```lane6-suppress' "known-issues template has the lane6-suppress block"
assert_file_contains "$KNOWN" '```lane2-noise' "known-issues template has the lane2-noise block"
assert_file_contains "$KNOWN" 'whole-line exact' "known-issues template explains whole-line matching"

for key in '"qa"' '"urls"' '"frontend"' '"backendHealth"' '"idp"' '"observability"' \
  '"hosts"' '"allowed"' '"forbidden"' '"auth"' '"tokenUrl"' '"clientId"' '"recipe"' \
  '"roles"' '"userEnv"' '"passwordEnv"' '"required"' '"languages"' '"switch"' \
  '"containers"' '"watch"' '"errorPattern"' '"db"' '"engine"' '"roRole"' '"roPasswordEnv"' \
  '"tenantColumn"' '"auditTables"' '"suites"' '"resultFormat"' '"timeoutSec"' \
  '"publicKeyEnv"' '"secretKeyEnv"' '"brand"' '"logoPaths"' '"tokenPaths"' '"compareRoute"' \
  '"regression"' '"knownIssues"' '"api"' '"errorEnvelopeFields"' '"crossTenantStatus"'; do
  assert_file_contains "$CONFIG" "$key" "config template has key $key"
done

# Piece 2 keeps the managed gitignore block body in templates/_blocks/gitignore.tmpl.
GITIGNORE_BLOCK="$REPO_ROOT/templates/_blocks/gitignore.tmpl"
assert_file_contains "$GITIGNORE_BLOCK" '.ultrapowers/qa-active' "hygiene block ignores the run marker"
assert_file_contains "$GITIGNORE_BLOCK" 'reviews/**/run-state.json' "hygiene block ignores run-state.json"

SETTINGS="$REPO_ROOT/templates/.claude/settings.json.tmpl"
for skill in qa-lane-1-ui qa-lane-2-logs qa-lane-3-api qa-lane-4-db qa-lane-5-observability \
  qa-lane-6-suites qa-lane-7-content qa-report qa-specialist; do
  assert_file_contains "$SETTINGS" "\"Skill(ultrapowers:$skill)\"" "settings template allows $skill"
done
if node -e 'JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"))' "$SETTINGS" 2>/dev/null; then
  pass "settings template is still valid JSON"
else
  fail "settings template is still valid JSON"
fi

CHANGES="$REPO_ROOT/templates/CHANGES.json"
if node -e 'const c = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")); process.exit(c["qa/known-issues.md"] ? 0 : 1)' "$CHANGES" 2>/dev/null; then
  pass "CHANGES.json tracks qa/known-issues.md"
else
  fail "CHANGES.json tracks qa/known-issues.md"
fi

if [[ "$FAILURES" -gt 0 ]]; then
  echo "STATUS: FAILED ($FAILURES failure(s))"
  exit 1
fi
echo "STATUS: PASSED"
