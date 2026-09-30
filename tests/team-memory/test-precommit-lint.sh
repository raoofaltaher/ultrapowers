#!/usr/bin/env bash
# The project pre-commit template runs memory-lint on staged store changes when
# the plugin is reachable, blocks on findings, and stays quiet otherwise.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
TEMPLATE="$REPO_ROOT/templates/.githooks/pre-commit.tmpl"

FAILURES=0
pass() { echo "  [PASS] $1"; }
fail() { echo "  [FAIL] $1"; FAILURES=$((FAILURES + 1)); }

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

git -C "$WORK" init -q
git -C "$WORK" config user.email "test@example.invalid"
git -C "$WORK" config user.name "Test"
git -C "$WORK" config core.hooksPath .githooks
mkdir -p "$WORK/.githooks" "$WORK/.agents/memory/gotchas" "$WORK/.agents/memory/decisions" "$WORK/.agents/memory/subsystems"
cp "$TEMPLATE" "$WORK/.githooks/pre-commit"
chmod +x "$WORK/.githooks/pre-commit"
printf '# Team memory: index\n\n## Gotchas\n\n## Decisions\n\n## Subsystems\n' > "$WORK/.agents/memory/MEMORY.md"
printf -- '---\nname: lonely\ndescription: d\nmetadata:\n  type: gotcha\ndate: 2026-09-30\n---\nFact.\n\n**Why:** x.\n\n**How to apply:** y.\n' > "$WORK/.agents/memory/gotchas/lonely.md"

echo "pre-commit team-memory lint"
if grep -q '^# >>> team-memory lint' "$TEMPLATE" && grep -q '^# <<< team-memory lint' "$TEMPLATE"; then
  pass "template has the marked block"
else
  fail "template has the marked block"
fi

# 1. Unrelated commit with a dirty store: not blocked.
printf 'hello\n' > "$WORK/notes.txt"
git -C "$WORK" add notes.txt
if ULTRAPOWERS_ROOT="$REPO_ROOT" git -C "$WORK" commit -q -m "unrelated" >/dev/null 2>&1; then
  pass "commit that does not touch the store is not blocked by store findings"
else
  fail "commit that does not touch the store is not blocked by store findings"
fi

# 2. Staging the orphan entry: blocked, ORPHAN named.
git -C "$WORK" add .agents/memory
set +e
out="$(ULTRAPOWERS_ROOT="$REPO_ROOT" git -C "$WORK" commit -q -m "store" 2>&1)"
status=$?
set -e
if [ "$status" -ne 0 ] && printf '%s' "$out" | grep -q "ORPHAN gotchas/lonely.md"; then
  pass "commit touching the store is blocked and the finding is printed"
else
  fail "commit touching the store is blocked and the finding is printed"; printf '%s\n' "$out" | sed 's/^/    /'
fi

# 3. Fix the index line: commit succeeds.
printf '# Team memory: index\n\n## Gotchas\n- [lonely](gotchas/lonely.md) — hook (2026-09)\n\n## Decisions\n\n## Subsystems\n' > "$WORK/.agents/memory/MEMORY.md"
git -C "$WORK" add .agents/memory
if ULTRAPOWERS_ROOT="$REPO_ROOT" git -C "$WORK" commit -q -m "store" >/dev/null 2>&1; then
  pass "commit succeeds once the store is clean"
else
  fail "commit succeeds once the store is clean"
fi

# 4. Plugin not reachable: warns and continues (the stray file would otherwise be a finding).
printf 'session summary\n' > "$WORK/.agents/memory/2026-01-05-session-summary.md"
git -C "$WORK" add .agents/memory
set +e
out="$(env -u ULTRAPOWERS_ROOT HOME="$WORK/no-home" git -C "$WORK" commit -q -m "stray" 2>&1)"
status=$?
set -e
if [ "$status" -eq 0 ] && printf '%s' "$out" | grep -q "team-memory lint skipped"; then
  pass "without a reachable plugin the hook warns and lets the commit through"
else
  fail "without a reachable plugin the hook warns and lets the commit through"; printf '%s\n' "$out" | sed 's/^/    /'
fi

if [ "$FAILURES" -gt 0 ]; then echo "STATUS: FAILED ($FAILURES failure(s))"; exit 1; fi
echo "STATUS: PASSED"
