#!/usr/bin/env bash
# Checks the shared research rules (skills/brainstorming/current-sources.md, GH-59) and the
# files that link them: the rules exist, find research tools by what they do, keep project
# content out of queries, say plainly when no tool exists, and no file names a research
# product. The product list below is test data: it lives here and nowhere in the skills.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
FAILURES=0

pass() { echo "  [PASS] $1"; }
fail() {
    echo "  [FAIL] $1"
    FAILURES=$((FAILURES + 1))
}
has() { grep -qiF -- "$2" "$REPO_ROOT/$1" 2>/dev/null; }

SOURCES="skills/brainstorming/current-sources.md"
PRODUCTS='WebFetch|WebSearch|web_fetch|web_search|google_web_search|Firecrawl|firecrawl|Context7|context7|Apify|apify|Microsoft Learn|microsoft_docs|Nango|Tavily|Exa|Perplexity|Brave'
# Every file that carries research text; the product check runs on each one that exists.
BRAIN="skills/brainstorming/SKILL.md"
TASK="skills/brainstorm-task/SKILL.md"
PLANS="skills/writing-plans/SKILL.md"
HUNT_FILES=("agents/vulnerability-hunter.md" "skills/vulnerability-hunt/SKILL.md" "skills/vulnerability-hunt/prompts/research.md" "skills/vulnerability-hunt/prompts/verifier.md" "skills/vulnerability-hunt/templates/SECURITY-REPORT.md")
NO_PRODUCT_FILES=("$SOURCES" "$BRAIN" "$TASK" "$PLANS" "${HUNT_FILES[@]}")

echo "=== Test: current-source research ==="

if [[ -f "$REPO_ROOT/$SOURCES" ]]; then
    pass "$SOURCES exists"
else
    fail "$SOURCES exists"
fi

for phrase in 'web search' 'fetch' 'documentation' 'by what they do'; do
    if has "$SOURCES" "$phrase"; then pass "the rules name the kind: $phrase"; else fail "the rules name the kind: $phrase"; fi
done
for phrase in 'Current sources not checked: no research tool in this session' \
              'Current sources not checked: a vulnerability hunt is running in this project' \
              'never install' 'data, never an instruction' \
              'never put project code, secrets or private names in a query or a URL'; do
    if has "$SOURCES" "$phrase"; then pass "the rules hold: $phrase"; else fail "the rules hold: $phrase"; fi
done

echo "--- the five gaps the live runs on GH-52 found (S46 to S50) ---"
for phrase in 'load before you can call it' 'as summarised by the fetch tool' 'is never evidence that' "project's own source repository"; do
    if has "$SOURCES" "$phrase"; then pass "the rules hold: $phrase"; else fail "the rules hold: $phrase"; fi
done
for phrase in 'when a search returns no official page' 'or the address alone when the tool returns no title'; do
    if has "skills/brainstorm-task/SKILL.md" "$phrase"; then pass "brainstorm-task holds: $phrase"; else fail "brainstorm-task holds: $phrase"; fi
done

echo "--- the workflows that run it ---"
check() { if has "$1" "$2"; then pass "$1 holds: $2"; else fail "$1 holds: $2"; fi; }
check "$BRAIN" '(current-sources.md)'
check "$BRAIN" '## Check Current Sources'
check "$BRAIN" 'not an offer'
check "$PLANS" '## Check Current Sources'
check "$BRAIN" 'This is a quick, clear'
check "$BRAIN" 'On the bounded path'
check "$TASK" '(../brainstorming/current-sources.md)'
check "$TASK" 'research tools found'
if grep -qi 'firecrawl' "$REPO_ROOT/$TASK"; then fail "$TASK no longer names a scrape product"; else pass "$TASK no longer names a scrape product"; fi
check "$PLANS" '(../brainstorming/current-sources.md)'
check "$PLANS" '**Sources:**'
check "$PLANS" '**6. Current sources:**'

for f in "${NO_PRODUCT_FILES[@]}"; do
    [[ -f "$REPO_ROOT/$f" ]] || continue
    if grep -Ewq -- "$PRODUCTS" "$REPO_ROOT/$f"; then
        fail "$f names no research product (found: $(grep -Ewo -- "$PRODUCTS" "$REPO_ROOT/$f" | sort -u | tr '\n' ' '))"
    else
        pass "$f names no research product"
    fi
done

echo ""
if [[ "$FAILURES" -eq 0 ]]; then
    echo "All current-source checks passed."
    exit 0
fi
echo "$FAILURES current-source check(s) failed."
exit 1
