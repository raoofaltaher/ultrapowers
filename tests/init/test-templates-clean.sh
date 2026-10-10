#!/usr/bin/env bash
# Acceptance 8: no file under templates/ carries a hostname, email, personal
# name, id or credential. Generic classes are checked here. The owner may add
# project-specific patterns in a local, untracked file and point
# ULTRAPOWERS_FORBIDDEN_PATTERNS_FILE at it; those patterns never enter git.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
TEMPLATES="$REPO_ROOT/templates"

FAILURES=0
pass() { echo "  [PASS] $1"; }
fail() { echo "  [FAIL] $1"; FAILURES=$((FAILURES + 1)); }

echo "Template leak scan"

if [ ! -d "$TEMPLATES" ]; then
  fail "templates/ directory exists"
  echo "STATUS: FAILED (1 failure(s))"
  exit 1
fi
pass "templates/ directory exists"

ALLOWED_URLS='https://learn\.microsoft\.com/api/mcp|https://mcp\.deepwiki\.com/mcp|https://json\.schemastore\.org/[a-z0-9./-]+|https://opencode\.ai/config\.json'

check_absent() {
  local description="$1"
  local pattern="$2"
  local hits
  hits="$(grep -rInE -- "$pattern" "$TEMPLATES" || true)"
  if [ -z "$hits" ]; then
    pass "$description"
  else
    fail "$description"
    printf '%s\n' "$hits" | sed 's/^/      /'
  fi
}

check_absent "no email addresses" '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}'
check_absent "no IPv4 addresses" '([0-9]{1,3}\.){3}[0-9]{1,3}'
check_absent "no localhost or loopback endpoints" 'localhost:[0-9]+|127\.0\.0\.1|bolt://'
check_absent "no Windows user paths" '[A-Za-z]:\\\\Users\\\\|/c/Users/|C:/Users/'
check_absent "no bearer or key literals" '(sk|pk|ghp|glpat|xox[abp])-[A-Za-z0-9_-]{8,}|AKIA[0-9A-Z]{12,}|Bearer [A-Za-z0-9._-]{16,}'
check_absent "no tenant or realm ids" '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'

url_hits="$(grep -rInoE -- 'https?://[^ )"'"'"'>`]+' "$TEMPLATES" | grep -vE -- "$ALLOWED_URLS" || true)"
if [ -z "$url_hits" ]; then
  pass "only allowlisted URLs"
else
  fail "only allowlisted URLs"
  printf '%s\n' "$url_hits" | sed 's/^/      /'
fi

if [ -n "${ULTRAPOWERS_FORBIDDEN_PATTERNS_FILE:-}" ] && [ -f "$ULTRAPOWERS_FORBIDDEN_PATTERNS_FILE" ]; then
  while IFS= read -r pattern; do
    [ -z "$pattern" ] && continue
    check_absent "no local forbidden pattern: ${pattern:0:3}..." "$pattern"
  done <"$ULTRAPOWERS_FORBIDDEN_PATTERNS_FILE"
fi

kb_dirs=(tasks specs plans reviews evals handbooks brandbook business playbooks release-notes)
for dir in "${kb_dirs[@]}"; do
  if [ -f "$TEMPLATES/$dir/README.md.tmpl" ] && [ -f "$TEMPLATES/$dir/.gitkeep" ]; then
    pass "templates/$dir has README.md.tmpl and .gitkeep"
  else
    fail "templates/$dir has README.md.tmpl and .gitkeep"
  fi
done

for required in README.md.tmpl AGENTS.md.tmpl CLAUDE.md.tmpl GEMINI.md.tmpl .mcp.json \
  .gitleaks.toml.tmpl .githooks/pre-commit.tmpl _blocks/gitignore.tmpl _blocks/gitattributes.tmpl \
  _nested/AGENTS.md.tmpl .agents/mcp-secrets.env.example.tmpl .agents/ultrapowers.json.tmpl \
  .claude/settings.json.tmpl .github/copilot-instructions.md.tmpl .vscode/settings.json.tmpl CHANGES.json; do
  if [ -f "$TEMPLATES/$required" ]; then
    pass "templates/$required exists"
  else
    fail "templates/$required exists"
  fi
done

cr=$'\r'
crlf_hits="$(grep -rIlU -- "$cr" "$TEMPLATES" || true)"
if [ -z "$crlf_hits" ]; then
  pass "templates are LF"
else
  fail "templates are LF"
  printf '%s\n' "$crlf_hits" | sed 's/^/      /'
fi

# The secrets example is where a teammate is most likely to paste a real key,
# so gitleaks must scan it like any other file.
if grep -q 'mcp-secrets' "$TEMPLATES/.gitleaks.toml.tmpl"; then
  fail "gitleaks does not exempt the secrets example"
else
  pass "gitleaks does not exempt the secrets example"
fi

# Init writes each harness MCP file once; nothing regenerates them from .mcp.json.
if grep -q 'generated from `\.mcp\.json`' "$TEMPLATES/README.md.tmpl"; then
  fail "README does not claim harness configs regenerate from .mcp.json"
else
  pass "README does not claim harness configs regenerate from .mcp.json"
fi

# The settings template selects this style for every session in a scaffolded
# project, so it must keep Claude Code's built-in coding instructions.
STYLE="$REPO_ROOT/output-styles/ste-explanatory.md"
if sed -n '2,/^---$/p' "$STYLE" | grep -qx 'keep-coding-instructions: true'; then
  pass "output style keeps the coding instructions"
else
  fail "output style keeps the coding instructions"
fi

# The no-comments house rule must not make an agent strip what init writes: the provenance
# header and the managed-block markers (stripping a marker makes the next run append a duplicate).
if grep -q 'provenance' "$TEMPLATES/AGENTS.md.tmpl" && grep -qF '# >>> ultrapowers' "$TEMPLATES/AGENTS.md.tmpl" && grep -qF '# <<< ultrapowers' "$TEMPLATES/AGENTS.md.tmpl"; then
  pass "the comment rule exempts the provenance header and the managed-block markers"
else
  fail "the comment rule exempts the provenance header and the managed-block markers"
fi

# The shared settings file pre-approves commands that run repository code; say so where it is read.
if grep -q 'pre-approves' "$TEMPLATES/CLAUDE.md.tmpl" && grep -q 'run repository code' "$TEMPLATES/CLAUDE.md.tmpl"; then
  pass "the generated CLAUDE.md discloses the allow list"
else
  fail "the generated CLAUDE.md discloses the allow list"
fi

changes_at() { node -e 'const c=require(process.argv[1]);process.stdout.write(String(c[process.argv[2]]))' "$TEMPLATES/CHANGES.json" "$1"; }
for target in AGENTS.md CLAUDE.md; do
  if [ "$(changes_at "$target")" = "2.0.0" ]; then
    pass "CHANGES.json records $target at 2.0.0"
  else
    fail "CHANGES.json records $target at 2.0.0"
  fi
done

if [[ "$FAILURES" -gt 0 ]]; then
  echo "STATUS: FAILED ($FAILURES failure(s))"
  exit 1
fi
echo "STATUS: PASSED"
