#!/usr/bin/env bash
# Structural checks for skills/task-review: frontmatter, required sections, the files the
# body names exist, no harness tool names, no upstream project name, and the Muse manifest
# lists the skill. Behavior is covered by the pressure scenarios (S21-S27).
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

# A harness with no subagent tool still gets the code review: the session runs the reviewer's prompt itself.
if grep -q '^\*\*Without a subagent tool:\*\* read \[prompts/review.md\]' "$SKILL_MD" && grep -q 'declined. entry' "$SKILL_MD"; then pass "the body runs the review inline, with a declined entry, when there is no subagent tool"; else fail "the body runs the review inline, with a declined entry, when there is no subagent tool"; fi

# Step 3b runs the vulnerability hunt between the code review and the QA gate (its three sentences verbatim).
step3="$(grep -n '^## Step 3: ' "$SKILL_MD" | cut -d: -f1)"
step3b="$(grep -n '^## Step 3b: The vulnerability hunt$' "$SKILL_MD" | cut -d: -f1)"
step4="$(grep -n '^## Step 4: ' "$SKILL_MD" | cut -d: -f1)"
if [[ -n "$step3b" && -n "$step3" && -n "$step4" && "$step3" -lt "$step3b" && "$step3b" -lt "$step4" ]]; then pass "Step 3b sits between Step 3 and Step 4"; else fail "Step 3b sits between Step 3 and Step 4"; fi
if grep -qF 'After every reviewer has returned and before the QA gate, run `ultrapowers:vulnerability-hunt <ID> <repo words>`; it writes `reviews/<ID>/SECURITY-REPORT.md` and `security-findings.json`, which Step 5 folds in. Its verdict stands as written. A hunt that could not run is INCOMPLETE in the report, not a reason to skip Step 5.' "$SKILL_MD"; then pass "Step 3b holds the three sentences of the hunt"; else fail "Step 3b holds the three sentences of the hunt"; fi
if grep -qF 'a code review of every repository it touched, then the vulnerability hunt, then the QA gate' "$SKILL_MD"; then pass "the Overview names the hunt between the code review and the QA gate"; else fail "the Overview names the hunt between the code review and the QA gate"; fi
hunt_item="$(grep -n '^[0-9]*\. Run the vulnerability hunt' "$SKILL_MD" | cut -d: -f1)"
findings_item="$(grep -n '^[0-9]*\. Collect the findings file$' "$SKILL_MD" | cut -d: -f1)"
qa_item="$(grep -n '^[0-9]*\. Run the QA gate' "$SKILL_MD" | cut -d: -f1)"
if [[ -n "$hunt_item" && -n "$findings_item" && -n "$qa_item" && "$findings_item" -lt "$hunt_item" && "$hunt_item" -lt "$qa_item" ]]; then pass "the Checklist runs the hunt between the findings file and the QA gate"; else fail "the Checklist runs the hunt between the findings file and the QA gate"; fi
nums="$(sed -n '/^## Checklist$/,/^## Red Flags$/p' "$SKILL_MD" | grep -oE '^[0-9]+\.' | tr -d '.' | tr '\n' ' ')"
if [[ "$nums" == "1 2 3 4 5 6 7 8 9 " ]]; then pass "the Checklist is numbered 1 to 9"; else fail "the Checklist is numbered 1 to 9 (got: $nums)"; fi
redflags="$(sed -n '/^## Red Flags$/,$p' "$SKILL_MD")"
if grep -q 'CI already runs' <<<"$redflags" && grep -q 'no network' <<<"$redflags"; then pass "Red Flags answers the skipped audit and the assumed missing network"; else fail "Red Flags answers the skipped audit and the assumed missing network"; fi
if grep -q 'security `INCOMPLETE` never blocks and is named in the verdict' "$SKILL_MD"; then pass "Step 5 says a security INCOMPLETE never blocks and is named in the verdict"; else fail "Step 5 says a security INCOMPLETE never blocks and is named in the verdict"; fi
if grep -q 'security-findings.json' "$SKILL_MD" && grep -q 'SECURITY-REPORT.md' "$SKILL_MD" && grep -q 'ultrapowers:vulnerability-hunt' "$SKILL_MD" && [[ -f "$REPO_ROOT/skills/vulnerability-hunt/SKILL.md" ]]; then pass "the body names the hunt skill and its two files, and the skill exists"; else fail "the body names the hunt skill and its two files, and the skill exists"; fi

# The upstream project name never appears; it is built at run time so this file does not hold it.
upstream="$(printf '%s%s' super powers)"
if ! grep -rqi "$upstream" "$SKILL_DIR"; then pass "no upstream project name anywhere in the skill"; else fail "no upstream project name anywhere in the skill"; fi

# The Muse manifest lists the skill with a matching id.
if node -e '
const m = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
const s = m.capabilities.skills.find((x) => x.id === "task-review");
process.exit(s && s.path === "skills/task-review/SKILL.md" ? 0 : 1);
' "$REPO_ROOT/.muse-plugin/plugin.json"; then pass "the Muse manifest lists task-review"; else fail "the Muse manifest lists task-review"; fi

# new-task Step 4: the local and the remote create commands are separate blocks, and the remote one
# takes the title from the saved JSON, never from pasted words.
NEW_TASK_MD="$REPO_ROOT/skills/new-task/SKILL.md"
step4="$(awk '/^## Step 4: Create$/{f=1;next} /^## Step 5/{f=0} f' "$NEW_TASK_MD")"
if grep -q '^For a local ticket:$' <<<"$step4" && grep -q '^For a remote ticket:$' <<<"$step4" \
    && [[ "$(grep -c '^```bash$' <<<"$step4")" -eq 2 ]] \
    && [[ "$(grep -c 'create "<ID>" <title words>' <<<"$step4")" -eq 1 ]] \
    && ! grep -q '<title words>.*--title-from-json\|--title-from-json.*<title words>' <<<"$step4" \
    && grep -q -- '--title-from-json "<ticket JSON file>"' <<<"$step4"; then
    pass "new-task Step 4 has one block for a local ticket and one for a remote ticket"
else
    fail "new-task Step 4 has one block for a local ticket and one for a remote ticket"
fi
if grep -q 'the JSON `fetch` printed, which Step 3 saved to a file outside the project' "$REPO_ROOT/skills/autopilot/prompts/scaffold.md"; then pass "the scaffold prompt names the saved JSON file"; else fail "the scaffold prompt names the saved JSON file"; fi

echo ""
if [[ "$FAILURES" -ne 0 ]]; then
    echo "FAILED: $FAILURES assertion(s)."
    exit 1
fi
echo "PASS"
