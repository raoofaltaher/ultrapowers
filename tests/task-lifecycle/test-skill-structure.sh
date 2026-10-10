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

[[ -f "$SKILL_MD" ]]
check "SKILL.md exists" $?

keys="$(awk 'NR==1 && $0!="---"{exit} NR>1 && $0=="---"{exit} NR>1{print}' "$SKILL_MD" | grep -oE '^[a-z-]+:' | tr -d ':' | tr '\n' ' ')"
[[ "$keys" == "name description " ]]
check "frontmatter has exactly name and description (got: $keys)" $?
[[ "$(sed -n '2p' "$SKILL_MD")" == "name: task-review" ]]
check "name equals the directory name" $?
sed -n '3p' "$SKILL_MD" | grep -q '^description: Use when '
check "description starts with 'Use when '" $?
[[ "$(sed -n '/^---$/,/^---$/p' "$SKILL_MD" | wc -c | tr -d ' ')" -le 1024 ]]
check "frontmatter is at most 1024 characters" $?

grep -q 'your human partner' "$SKILL_MD"
check "speaks to your human partner" $?
grep -q '^## Checklist$' "$SKILL_MD" && grep -q '^## Red Flags$' "$SKILL_MD" && grep -q '^## Hard rules$' "$SKILL_MD"
check "has Hard rules, Checklist and Red Flags sections" $?
grep -q 'ARGUMENTS:' "$SKILL_MD" && grep -q 'ERROR' "$SKILL_MD"
check "documents the ARGUMENTS: fallback and the ERROR stop rule" $?
count="$({ grep -o '\$ARGUMENTS' "$SKILL_MD" || true; } | wc -l | tr -d ' ')"
[[ "$count" -le 1 ]]
check "writes the argument placeholder at most once" $?
! grep -q '\$[0-9]' "$SKILL_MD"
check "has no positional token the harness would substitute" $?
! grep -Eq 'AskUserQuestion|Read tool|Write tool|Edit tool|Bash tool|Glob|Grep tool|TodoWrite|WebFetch' "$SKILL_MD"
check "names no harness tools" $?

# Every relative path the body links or runs must exist.
missing=""
for rel in prompts/review.md templates/TASK-REVIEW.md scripts/review-preflight.sh; do
    [[ -f "$SKILL_DIR/$rel" ]] || missing="$missing $rel"
    grep -q "$rel" "$SKILL_MD" || missing="$missing (unreferenced: $rel)"
done
rc=0
[[ -z "$missing" ]] || rc=1
check "the files the body names exist and are referenced (missing:$missing)" "$rc"

# The reviewer prompt names the skills it relies on; the body names the QA agent.
grep -q 'ultrapowers:requesting-code-review' "$SKILL_DIR/prompts/review.md" \
    && grep -q 'ultrapowers:test-driven-development' "$SKILL_DIR/prompts/review.md" \
    && grep -q 'ultrapowers:systematic-debugging' "$SKILL_DIR/prompts/review.md"
check "the reviewer prompt uses code review, TDD and systematic-debugging" $?
grep -q 'qa-specialist' "$SKILL_MD"
check "the body runs the QA gate through qa-specialist" $?
grep -q 'most capable' "$SKILL_MD" && grep -q 'most capable' "$SKILL_DIR/prompts/review.md"
check "reviewers are dispatched on the most capable model" $?

# The upstream project name never appears; it is built at run time so this file does not hold it.
upstream="$(printf '%s%s' super powers)"
! grep -rqi "$upstream" "$SKILL_DIR"
check "no upstream project name anywhere in the skill" $?

# The Muse manifest lists the skill with a matching id.
node -e '
const m = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
const s = m.capabilities.skills.find((x) => x.id === "task-review");
process.exit(s && s.path === "skills/task-review/SKILL.md" ? 0 : 1);
' "$REPO_ROOT/.muse-plugin/plugin.json"
check "the Muse manifest lists task-review" $?

echo ""
if [[ "$FAILURES" -ne 0 ]]; then
    echo "FAILED: $FAILURES assertion(s)."
    exit 1
fi
echo "PASS"
