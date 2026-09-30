#!/usr/bin/env bash
# Acceptance criterion 7: no plugin file from piece 5 carries a hostname, IP, email or other
# project fact from the reference implementation. The public scan is generic (emails, IPv4,
# hostnames outside an allow-list). The owner adds the reference project's private strings
# through the file named by ULTRAPOWERS_FORBIDDEN_PATTERNS_FILE, the same untracked file piece
# 2's template scan reads (one extended regular expression per line, kept outside the repo).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

FAILURES=0
pass() { echo "  [PASS] $1"; }
fail() { echo "  [FAIL] $1"; FAILURES=$((FAILURES + 1)); }

collect_files() {
  local candidates=(
    "$REPO_ROOT/agents/qa-specialist.md"
    "$REPO_ROOT/hooks/qa-guardrail"
    "$REPO_ROOT/hooks/lib/qa-shell-writes.mjs"
    "$REPO_ROOT/templates/qa"
    "$REPO_ROOT/templates/.agents/ultrapowers.json.tmpl"
    "$REPO_ROOT/tests/qa-gatekeeper"
  )
  local d
  for d in "$REPO_ROOT"/skills/qa-*; do
    [[ -d "$d" ]] && candidates+=("$d")
  done
  local c
  for c in "${candidates[@]}"; do
    if [[ -d "$c" ]]; then
      find "$c" -type f \( -name '*.md' -o -name '*.mjs' -o -name '*.sh' -o -name '*.json' -o -name '*.sql' -o -name '*.tmpl' -o -name '*.trx' -o -name '*.xml' -o -name 'qa-guardrail' \) -print
    elif [[ -f "$c" ]]; then
      printf '%s\n' "$c"
    fi
  done
}

mapfile -t FILES < <(collect_files | sort -u)
if [[ "${#FILES[@]}" -eq 0 ]]; then
  echo "STATUS: FAILED (no piece 5 files found to scan)"
  exit 1
fi
echo "QA gatekeeper leak scan over ${#FILES[@]} files"

scan() {
  local description="$1" pattern="$2" allow="$3"
  local hits
  hits="$(grep -EnoH -- "$pattern" "${FILES[@]}" 2>/dev/null | grep -Ev -- "$allow" || true)"
  if [[ -z "$hits" ]]; then
    pass "$description"
  else
    fail "$description"
    printf '%s\n' "$hits" | sed 's/^/    /'
  fi
}

scan "no email addresses" \
  '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}' \
  '@example\.(com|org|net)$|<[^>]*@[^>]*>'

scan "no IPv4 addresses outside loopback and TEST-NET-1" \
  '([0-9]{1,3}\.){3}[0-9]{1,3}' \
  ':(127\.0\.0\.1|0\.0\.0\.0|192\.0\.2\.[0-9]+|[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+\.)$|(^|:)[0-9]+\.[0-9]+\.[0-9]+$'

scan "no hostnames outside the documentation allow-list" \
  '\b[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+\.(com|net|org|io|ca|dev|app|cloud|fr|ai|co)\b' \
  ':(([a-z0-9-]+\.)*example\.(com|org|net)|github\.com|json\.schemastore\.org|agentskills\.io)$'

if [[ -n "${ULTRAPOWERS_FORBIDDEN_PATTERNS_FILE:-}" && -f "${ULTRAPOWERS_FORBIDDEN_PATTERNS_FILE}" ]]; then
  # Same file and format as piece 2's tests/init/test-templates-clean.sh: one extended regular
  # expression per line. Blank lines are dropped first; an empty pattern would match everything.
  hits="$(grep -inoHE -f <(grep -v '^[[:space:]]*$' "$ULTRAPOWERS_FORBIDDEN_PATTERNS_FILE") -- "${FILES[@]}" 2>/dev/null || true)"
  if [[ -z "$hits" ]]; then
    pass "no private reference patterns (ULTRAPOWERS_FORBIDDEN_PATTERNS_FILE)"
  else
    fail "no private reference patterns (ULTRAPOWERS_FORBIDDEN_PATTERNS_FILE)"
    printf '%s\n' "$hits" | sed 's/^/    /'
  fi
else
  echo "  [SKIP] private reference patterns: set ULTRAPOWERS_FORBIDDEN_PATTERNS_FILE to enable"
fi

if [[ "$FAILURES" -gt 0 ]]; then
  echo "STATUS: FAILED ($FAILURES failure(s))"
  exit 1
fi
echo "STATUS: PASSED"
