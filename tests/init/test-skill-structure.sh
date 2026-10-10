#!/usr/bin/env bash
# Structural checks for skills/init. Behavior is covered by the pressure
# scenarios in tests/init/pressure-scenarios.md; this script checks what a
# shell can check: frontmatter, the engine contract, voice, word budget.
set -u

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
SKILL_DIR="$REPO_ROOT/skills/init"
SKILL_MD="$SKILL_DIR/SKILL.md"
ENGINE="$SKILL_DIR/scripts/init.mjs"
WORD_BUDGET=1900

PASSES=0
FAILURES=0

pass() { echo "  [PASS] $1"; PASSES=$((PASSES + 1)); }
fail() { echo "  [FAIL] $1"; FAILURES=$((FAILURES + 1)); }

echo "init skill structure"

if [ ! -f "$SKILL_MD" ]; then
  fail "SKILL.md exists"
  echo
  echo "Passed: $PASSES  Failed: $FAILURES"
  exit 1
fi
pass "SKILL.md exists"

frontmatter="$(awk 'NR==1 && $0!="---"{exit} NR>1 && $0=="---"{exit} NR>1{print}' "$SKILL_MD")"
keys="$(printf '%s\n' "$frontmatter" | grep -oE '^[a-z-]+:' | tr -d ':' | tr '\n' ' ')"
if [ "$keys" = "name description " ]; then
  pass "frontmatter keys are exactly name and description"
else
  fail "frontmatter keys are exactly name and description (got: $keys)"
fi
if printf '%s\n' "$frontmatter" | grep -q '^name: init$'; then
  pass "frontmatter name is init"
else
  fail "frontmatter name is init"
fi
description="$(printf '%s\n' "$frontmatter" | sed -n 's/^description: //p')"
if printf '%s' "$description" | grep -q '^Use when'; then
  pass "description starts with 'Use when'"
else
  fail "description starts with 'Use when' (got: ${description:0:60})"
fi
if [ "${#description}" -le 1024 ]; then
  pass "description under 1024 characters"
else
  fail "description under 1024 characters (${#description})"
fi
for banned in 'then' step dispatch run; do
  if printf '%s' "$description" | grep -qiw "$banned"; then
    fail "description avoids workflow word '$banned'"
  else
    pass "description avoids workflow word '$banned'"
  fi
done

body="$(awk 'BEGIN{fm=0} NR==1 && $0=="---"{fm=1; next} fm==1 && $0=="---"{fm=2; next} fm==2{print}' "$SKILL_MD")"
body_words="$(printf '%s\n' "$body" | wc -w | tr -d ' ')"
if [ "$body_words" -le "$WORD_BUDGET" ]; then
  pass "body within $WORD_BUDGET words ($body_words)"
else
  fail "body within $WORD_BUDGET words ($body_words)"
fi

for heading in "## Detect" "## Scaffold mode" "## Join mode" "## Upgrade mode" "## Repair" "## Errors" "## Checklist" "## Red Flags"; do
  if grep -qx "$heading" "$SKILL_MD"; then
    pass "section '$heading'"
  else
    fail "section '$heading'"
  fi
done

engine_lines="$(grep 'scripts/init\.mjs' "$SKILL_MD")"
if [ -n "$engine_lines" ] && ! printf '%s\n' "$engine_lines" | grep -v 'node "<SKILL_DIR>/scripts/init\.mjs"' | grep -q .; then
  pass "the engine is always run as node \"<SKILL_DIR>/scripts/init.mjs\""
else
  fail "the engine is always run as node \"<SKILL_DIR>/scripts/init.mjs\""
fi

for mode in $(printf '%s\n' "$engine_lines" | grep -oE 'init\.mjs" [a-z]+' | awk '{print $2}' | sort -u); do
  case "$mode" in
    scaffold | join | upgrade | detect | tickets | autopilot | check) pass "engine mode '$mode' exists" ;;
    *) fail "engine mode '$mode' exists" ;;
  esac
done

flags="$({ printf '%s\n' "$engine_lines" | grep -oE -- '--[a-z][a-z-]*'; grep -oE -- '`--[a-z][a-z-]*' "$SKILL_MD" | tr -d '`'; } | sort -u)"
for flag in $flags; do
  if grep -q "case '$flag'" "$ENGINE"; then
    pass "engine accepts $flag"
  else
    fail "engine accepts $flag"
  fi
done

for code in $(grep -E '^\| `[a-z-]+` \|' "$SKILL_MD" | sed -E 's/^\| `([a-z-]+)`.*/\1/' | sort -u); do
  if grep -q "InitError('$code'" "$ENGINE"; then
    pass "error code '$code' is one the engine raises"
  else
    fail "error code '$code' is one the engine raises"
  fi
done

for code in $(grep -oE "InitError\('[a-z-]+'" "$ENGINE" | sed -E "s/InitError\('([a-z-]+)'/\1/" | sort -u); do
  if grep -qE "^\| \`$code\` \|" "$SKILL_MD"; then
    pass "engine error '$code' has a row in Errors"
  else
    fail "engine error '$code' has a row in Errors"
  fi
done

for phrase in "--dry-run" "existing-hooks:<names>" "explicit yes" "Never write the payload by hand" "nested clone" "workspaceRoot" ".ultrapowers-new" "your human partner"; do
  if grep -qF -- "$phrase" "$SKILL_MD"; then
    pass "mentions '$phrase'"
  else
    fail "mentions '$phrase'"
  fi
done

tool_hits="$(grep -nE 'TodoWrite|TodoList|AskUserQuestion|apply_patch|todowrite|(Bash|Read|Write|Edit|Skill|Task|Glob|Grep) tool' "$SKILL_MD" || true)"
if [ -z "$tool_hits" ]; then
  pass "no harness tool names in the body"
else
  fail "no harness tool names in the body"
  printf '%s\n' "$tool_hits" | sed 's/^/    /'
fi

if grep -qi 'the user' "$SKILL_MD"; then
  fail "says 'your human partner', not 'the user'"
else
  pass "says 'your human partner', not 'the user'"
fi

leaks="$(grep -nE '/Users/|/home/|[A-Za-z]:\\' "$SKILL_MD" || true)"
if [ -z "$leaks" ]; then
  pass "no machine-specific paths"
else
  fail "no machine-specific paths"
  printf '%s\n' "$leaks" | sed 's/^/    /'
fi

echo
echo "Passed: $PASSES  Failed: $FAILURES"
[ "$FAILURES" -eq 0 ]
