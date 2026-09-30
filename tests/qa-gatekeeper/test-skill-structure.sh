#!/usr/bin/env bash
# Structural checks for the piece 5 agent and skills: frontmatter shape, user-invocable flags,
# entry-skill fork fields, no harness tool names in skill bodies, and (once all nine exist) the
# Muse manifest listing. Skips skills that do not exist yet so it can run task by task.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

FAILURES=0
pass() { echo "  [PASS] $1"; }
fail() { echo "  [FAIL] $1"; FAILURES=$((FAILURES + 1)); }

frontmatter() {
  # prints the YAML block between the first two --- lines
  awk 'NR==1 && $0!="---" {exit} NR>1 && $0=="---" {exit} NR>1 {print}' "$1"
}

body() {
  awk 'NR==1 && $0!="---" {print; next} NR>1 && f {print} NR>1 && !f && $0=="---" {f=1}' "$1"
}

echo "QA gatekeeper structure tests"

AGENT="$REPO_ROOT/agents/qa-specialist.md"
if [[ -f "$AGENT" ]]; then
  fm="$(frontmatter "$AGENT")"
  if printf '%s\n' "$fm" | grep -Eq '^name: qa-specialist$'; then pass "agent name is qa-specialist"; else fail "agent name is qa-specialist"; fi
  if printf '%s\n' "$fm" | grep -Eq '^description: '; then pass "agent has a description"; else fail "agent has a description"; fi
  if printf '%s\n' "$fm" | grep -Eq '^model:'; then fail "agent leaves model unset (session default)"; else pass "agent leaves model unset (session default)"; fi
  if printf '%s\n' "$fm" | grep -Eq '^disallowedTools: .*run_code_unsafe'; then pass "agent disallows the unsafe browser code tool"; else fail "agent disallows the unsafe browser code tool"; fi
  for section in '## Absolute rules' '## The QA dimensions' '## Inputs' '## Your skills' '## The procedure' '## Triage classes' '## Severity' '## Exit criteria' '## Run-state and resume' '## Completion gate'; do
    if grep -Fq -- "$section" "$AGENT"; then pass "agent has section '$section'"; else fail "agent has section '$section'"; fi
  done
  for step in 'STEP 0' 'STEP 1' 'STEP 2' 'STEP 3' 'STEP 4' 'STEP 5' 'STEP 6' 'STEP 7' 'STEP 8' 'STEP 9'; do
    if grep -Fq -- "**$step" "$AGENT"; then pass "agent has $step"; else fail "agent has $step"; fi
  done
  if grep -Fq 'QA-GUARDRAIL DENY' "$AGENT"; then pass "agent names the guardrail denial"; else fail "agent names the guardrail denial"; fi
else
  echo "  [SKIP] agents/qa-specialist.md not present yet"
fi

LANES=(qa-lane-1-ui qa-lane-2-logs qa-lane-3-api qa-lane-4-db qa-lane-5-observability qa-lane-6-suites qa-lane-7-content qa-report)
present=0
for skill in "${LANES[@]}" qa-specialist; do
  file="$REPO_ROOT/skills/$skill/SKILL.md"
  if [[ ! -f "$file" ]]; then
    echo "  [SKIP] skills/$skill/SKILL.md not present yet"
    continue
  fi
  present=$((present + 1))
  fm="$(frontmatter "$file")"
  if printf '%s\n' "$fm" | grep -Eq "^name: $skill\$"; then pass "$skill: name matches directory"; else fail "$skill: name matches directory"; fi
  if printf '%s\n' "$fm" | grep -Eq '^description: "?Use when '; then pass "$skill: description starts with Use when"; else fail "$skill: description starts with Use when"; fi
  if body "$file" | grep -Eq 'mcp__|\bBash\(|\bWrite\(|\bEdit\('; then fail "$skill: body has no harness tool names"; else pass "$skill: body has no harness tool names"; fi
  if [[ "$skill" == "qa-specialist" ]]; then
    for key in '^context: fork$' '^agent: qa-specialist$'; do
      if printf '%s\n' "$fm" | grep -Eq "$key"; then pass "$skill: frontmatter has $key"; else fail "$skill: frontmatter has $key"; fi
    done
    if printf '%s\n' "$fm" | grep -Eq '^arguments:'; then fail "$skill: no arguments key"; else pass "$skill: no arguments key"; fi
    if printf '%s\n' "$fm" | grep -Eq '^user-invocable: false'; then fail "$skill: is user-invocable"; else pass "$skill: is user-invocable"; fi
    if grep -Fq '## Red Flags' "$file"; then pass "$skill: has a red-flags table"; else fail "$skill: has a red-flags table"; fi
  else
    if printf '%s\n' "$fm" | grep -Eq '^user-invocable: false$'; then pass "$skill: user-invocable false"; else fail "$skill: user-invocable false"; fi
  fi
  if grep -Eq 'your human partner' "$file" || [[ "$skill" != "qa-specialist" ]]; then pass "$skill: voice check"; else fail "$skill: uses 'your human partner'"; fi
done

if [[ "$present" -eq 9 ]]; then
  for skill in "${LANES[@]}" qa-specialist; do
    if node -e '
const m = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
const hit = (m.capabilities.skills || []).find((s) => s.id === process.argv[2] && s.path === `skills/${process.argv[2]}/SKILL.md`);
process.exit(hit ? 0 : 1);
' "$REPO_ROOT/.muse-plugin/plugin.json" "$skill"; then
      pass "Muse manifest lists $skill"
    else
      fail "Muse manifest lists $skill"
    fi
  done
fi

if [[ "$FAILURES" -gt 0 ]]; then
  echo "STATUS: FAILED ($FAILURES failure(s))"
  exit 1
fi
echo "STATUS: PASSED"
