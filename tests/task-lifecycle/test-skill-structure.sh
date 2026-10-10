#!/usr/bin/env bash
# Structural checks for skills/task-review: frontmatter, required sections, the files the
# body names exist, no harness tool names, no upstream project name, and the Muse manifest
# lists the skill. Behavior is covered by the pressure scenarios (S21-S26).
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
SKILL_DIR="$REPO_ROOT/skills/task-review"
SKILL_MD="$SKILL_DIR/SKILL.md"

FAILURES=0
pass() { echo "  [PASS] $1"; }
fail() {
    echo "  [FAIL] $1"
    FAILURES=$((FAILURES + 1))
}
check() { # NAME EXIT-CODE
    if [[ "$2" -eq 0 ]]; then pass "$1"; else fail "$1"; fi
}

echo "=== Test: task-review skill structure ==="

if [[ -f "$SKILL_MD" ]]; then pass "SKILL.md exists"; else fail "SKILL.md exists"; fi

keys="$(awk 'NR==1 && $0!="---"{exit} NR>1 && $0=="---"{exit} NR>1{print}' "$SKILL_MD" | grep -oE '^[a-z-]+:' | tr -d ':' | tr '\n' ' ')"
if [[ "$keys" == "name description " ]]; then pass "frontmatter has exactly name and description (got: $keys)"; else fail "frontmatter has exactly name and description (got: $keys)"; fi
if [[ "$(sed -n '2p' "$SKILL_MD")" == "name: task-review" ]]; then pass "name equals the directory name"; else fail "name equals the directory name"; fi
if sed -n '3p' "$SKILL_MD" | grep -q '^description: Use when '; then pass "description starts with 'Use when '"; else fail "description starts with 'Use when '"; fi
if [[ "$(sed -n '/^---$/,/^---$/p' "$SKILL_MD" | wc -c | tr -d ' ')" -le 1024 ]]; then pass "frontmatter is at most 1024 characters"; else fail "frontmatter is at most 1024 characters"; fi

if grep -q 'your human partner' "$SKILL_MD"; then pass "speaks to your human partner"; else fail "speaks to your human partner"; fi
if grep -q '^## Checklist$' "$SKILL_MD" && grep -q '^## Red Flags$' "$SKILL_MD" && grep -q '^## Hard rules$' "$SKILL_MD"; then pass "has Hard rules, Checklist and Red Flags sections"; else fail "has Hard rules, Checklist and Red Flags sections"; fi
if grep -q 'ARGUMENTS:' "$SKILL_MD" && grep -q 'ERROR' "$SKILL_MD"; then pass "documents the ARGUMENTS: fallback and the ERROR stop rule"; else fail "documents the ARGUMENTS: fallback and the ERROR stop rule"; fi
count="$({ grep -o '\$ARGUMENTS' "$SKILL_MD" || true; } | wc -l | tr -d ' ')"
if [[ "$count" -le 1 ]]; then pass "writes the argument placeholder at most once"; else fail "writes the argument placeholder at most once"; fi
if ! grep -q '\$[0-9]' "$SKILL_MD"; then pass "has no positional token the harness would substitute"; else fail "has no positional token the harness would substitute"; fi
if ! grep -Eq 'AskUserQuestion|Read tool|Write tool|Edit tool|Bash tool|Glob|Grep tool|TodoWrite|WebFetch' "$SKILL_MD"; then pass "names no harness tools"; else fail "names no harness tools"; fi

# Every relative path the body links or runs must exist.
missing=""
for rel in prompts/review.md templates/TASK-REVIEW.md scripts/review-preflight.sh scripts/assemble-review.mjs scripts/post-review.mjs; do
    [[ -f "$SKILL_DIR/$rel" ]] || missing="$missing $rel"
    grep -q "$rel" "$SKILL_MD" || missing="$missing (unreferenced: $rel)"
done
rc=0
[[ -z "$missing" ]] || rc=1
check "the files the body names exist and are referenced (missing:$missing)" "$rc"

# The reviewer prompt names the skills it relies on; the body names the QA agent.
prompt="$SKILL_DIR/prompts/review.md"
if grep -q 'ultrapowers:requesting-code-review' "$prompt" && grep -q 'ultrapowers:test-driven-development' "$prompt" && grep -q 'ultrapowers:systematic-debugging' "$prompt"; then pass "the reviewer prompt uses code review, TDD and systematic-debugging"; else fail "the reviewer prompt uses code review, TDD and systematic-debugging"; fi
if grep -q 'qa-specialist' "$SKILL_MD"; then pass "the body runs the QA gate through qa-specialist"; else fail "the body runs the QA gate through qa-specialist"; fi
if grep -q 'most capable' "$SKILL_MD" && grep -q 'most capable' "$SKILL_DIR/prompts/review.md"; then pass "reviewers are dispatched on the most capable model"; else fail "reviewers are dispatched on the most capable model"; fi

# The upstream project name never appears; it is built at run time so this file does not hold it.
upstream="$(printf '%s%s' super powers)"
if ! grep -rqi "$upstream" "$SKILL_DIR"; then pass "no upstream project name anywhere in the skill"; else fail "no upstream project name anywhere in the skill"; fi

# The Muse manifest lists the skill with a matching id.
if node -e '
const m = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
const s = m.capabilities.skills.find((x) => x.id === "task-review");
process.exit(s && s.path === "skills/task-review/SKILL.md" ? 0 : 1);
' "$REPO_ROOT/.muse-plugin/plugin.json"; then pass "the Muse manifest lists task-review"; else fail "the Muse manifest lists task-review"; fi

echo ""
if [[ "$FAILURES" -ne 0 ]]; then
    echo "FAILED: $FAILURES assertion(s)."
    exit 1
fi
echo "PASS"
