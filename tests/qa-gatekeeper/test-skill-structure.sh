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
  if printf '%s\n' "$fm" | grep -Eq '^disallowedTools: .*browser_evaluate'; then pass "agent disallows the in-page evaluate tool"; else fail "agent disallows the in-page evaluate tool"; fi
  for needle in 'chmod u+r' 'Guardrail: active' 'Guardrail: not active on this harness'; do
    if grep -Fq -- "$needle" "$AGENT"; then pass "agent's guardrail probe mentions '$needle'"; else fail "agent's guardrail probe mentions '$needle'"; fi
    if grep -Fq -- "$needle" "$REPO_ROOT/skills/qa-report/SKILL.md" || [ "$needle" = 'chmod u+r' ]; then pass "qa-report mentions '$needle'"; else fail "qa-report mentions '$needle'"; fi
  done
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

echo "QA gatekeeper entry skill, full-G1 and name-consistency checks"

ENTRY="$REPO_ROOT/skills/qa-specialist/SKILL.md"
PREFLIGHT="$REPO_ROOT/skills/qa-specialist/scripts/qa-preflight.mjs"
CONFIG_TMPL="$REPO_ROOT/templates/.agents/ultrapowers.json.tmpl"

if [[ -f "$ENTRY" ]]; then
  pass "skills/qa-specialist/SKILL.md exists"
  entry_fm="$(frontmatter "$ENTRY")"
  entry_body="$(body "$ENTRY")"
  if printf '%s\n' "$entry_fm" | grep -Eq '^arguments:'; then fail "qa-specialist: no arguments key"; else pass "qa-specialist: no arguments key"; fi
  entry_desc="$(printf '%s\n' "$entry_fm" | sed -n 's/^description: //p')"
  for word in 'then' step dispatch preflight marker; do
    if printf '%s' "$entry_desc" | grep -qiw -- "$word"; then
      fail "qa-specialist: description avoids workflow word '$word'"
    else
      pass "qa-specialist: description avoids workflow word '$word'"
    fi
  done
  for needle in '## Checklist' 'qa-preflight.mjs' '.ultrapowers/qa-active' 'agents/qa-specialist.md' \
    'run-state.json' 'PRECONDITION-FAILED' 'inline' 'Verdict: <value> — reviews/<ID>/QA-REPORT.md'; do
    if printf '%s\n' "$entry_body" | grep -Fq -- "$needle"; then pass "qa-specialist: body mentions $needle"; else fail "qa-specialist: body mentions $needle"; fi
  done
  for field in missing preconditions warnings markerExists runState changeSet onTicketBranch errors; do
    if printf '%s\n' "$entry_body" | grep -Fq -- "\`$field" && grep -Fq -- "$field" "$PREFLIGHT"; then
      pass "qa-specialist: preflight field $field is used and exists"
    else
      fail "qa-specialist: preflight field $field is used and exists"
    fi
  done
  if printf '%s\n' "$entry_body" | grep -Eq '\$[0-9]'; then
    fail "qa-specialist: body has no \$N placeholder (the harness would substitute it)"
  else
    pass "qa-specialist: body has no \$N placeholder"
  fi
  # Loaded only when invoked; about 1,300 words as written, headroom for Task 12's red-flag rows.
  entry_words="$(printf '%s\n' "$entry_body" | wc -w | tr -d ' ')"
  if [[ "$entry_words" -le 1500 ]]; then pass "qa-specialist: body within 1500 words ($entry_words)"; else fail "qa-specialist: body within 1500 words ($entry_words)"; fi
else
  fail "skills/qa-specialist/SKILL.md exists"
fi

LANE7="$REPO_ROOT/skills/qa-lane-7-content/SKILL.md"
if [[ -f "$LANE7" ]]; then
  for needle in '## Checklist' '## Red Flags' 'your human partner' 'gates.lane7.active' 'not-covered'; do
    if grep -Fq -- "$needle" "$LANE7"; then pass "qa-lane-7-content: has $needle (new skill, full G1)"; else fail "qa-lane-7-content: has $needle (new skill, full G1)"; fi
  done
fi

for skill in "${LANES[@]}" qa-specialist; do
  file="$REPO_ROOT/skills/$skill/SKILL.md"
  [[ -f "$file" ]] || continue
  skill_body="$(body "$file")"
  if printf '%s\n' "$skill_body" | grep -Eq 'browser_[a-z_]+|Playwright MCP'; then
    fail "$skill: names the browser only as the Playwright browser tools"
  else
    pass "$skill: names the browser only as the Playwright browser tools"
  fi
done

for rel in skills/qa-specialist/scripts/qa-preflight.mjs skills/qa-lane-6-suites/scripts/judge.mjs \
  skills/qa-lane-6-suites/scripts/run-suite.sh skills/qa-lane-4-db/recipes/postgres.md \
  skills/qa-lane-4-db/recipes/qa_agent_ro.sql skills/qa-lane-5-observability/recipes/langfuse.md; do
  if [[ -f "$REPO_ROOT/$rel" ]]; then pass "bundled file exists: $rel"; else fail "bundled file exists: $rel"; fi
done

# Every qa.<key>[.<sub>] that the agent, the skills and the recipes name must exist in the config
# template (Task 1), so a renamed key cannot drift between the config and its readers.
qa_keys="$(cat "$AGENT" "$REPO_ROOT"/skills/qa-*/SKILL.md "$REPO_ROOT"/skills/qa-*/recipes/*.md 2>/dev/null \
  | grep -oE 'qa\.[A-Za-z]+(\.[A-Za-z]+)?' | sort -u || true)"
while IFS= read -r key; do
  [[ -z "$key" ]] && continue
  IFS=. read -r _ top sub <<<"$key"
  found=1
  grep -Fq -- "\"$top\"" "$CONFIG_TMPL" || found=0
  if [[ -n "$sub" ]]; then grep -Fq -- "\"$sub\"" "$CONFIG_TMPL" || found=0; fi
  if [[ "$found" -eq 1 ]]; then pass "config key $key exists in the template"; else fail "config key $key exists in the template"; fi
done <<<"$qa_keys"

# Every gates.<name> that the agent and the skills name must be a gate the preflight computes.
gate_names="$(cat "$AGENT" "$REPO_ROOT"/skills/qa-*/SKILL.md 2>/dev/null | grep -oE 'gates\.[A-Za-z0-9]+' | sort -u || true)"
while IFS= read -r gate; do
  [[ -z "$gate" ]] && continue
  name="${gate#gates.}"
  if grep -Eq "^[[:space:]]+$name: " "$PREFLIGHT"; then pass "gate $name exists in the preflight"; else fail "gate $name exists in the preflight"; fi
done <<<"$gate_names"


# Final review I2/I3: the fresh-or-resume decision reads plan rows (runState.unfinished), the
# fresh path moves the previous artifacts aside, and lane 6 names its final suite statuses.
ENTRY_FILE="$REPO_ROOT/skills/qa-specialist/SKILL.md"
LANE6_FILE="$REPO_ROOT/skills/qa-lane-6-suites/SKILL.md"
if [[ -f "$ENTRY_FILE" ]]; then
  if grep -q 'runState.unfinished' "$ENTRY_FILE" && ! grep -q "grep -Eq '\"status\"" "$ENTRY_FILE"; then pass "qa-specialist: Step 3 decides from runState.unfinished"; else fail "qa-specialist: Step 3 decides from runState.unfinished"; fi
  if grep -q 'artifacts-<ID>' "$ENTRY_FILE"; then pass "qa-specialist: a fresh run moves the previous artifacts aside"; else fail "qa-specialist: a fresh run moves the previous artifacts aside"; fi
fi
if [[ -f "$LANE6_FILE" ]]; then
  if grep -q '`judged`' "$LANE6_FILE"; then pass "qa-lane-6-suites: names the final suite statuses"; else fail "qa-lane-6-suites: names the final suite statuses"; fi
fi


# Final review I8: lane 3 keeps raw responses in .ultrapowers/ scratch and writes only a
# redacted copy into the committed artifacts; both cleanups remove the scratch files.
LANE3_FILE="$REPO_ROOT/skills/qa-lane-3-api/SKILL.md"
if [[ -f "$LANE3_FILE" ]]; then
  if ! grep -q -- '-o <ROOT>/reviews/' "$LANE3_FILE" && grep -q '\.ultrapowers/qa-api-' "$LANE3_FILE"; then pass "qa-lane-3-api: raw responses go to .ultrapowers/ scratch, not artifacts"; else fail "qa-lane-3-api: raw responses go to .ultrapowers/ scratch, not artifacts"; fi
fi
if grep -q 'qa-api-\*' "$REPO_ROOT/agents/qa-specialist.md" && grep -q 'qa-api-\*' "$REPO_ROOT/skills/qa-specialist/SKILL.md"; then pass "STEP 9 and Step 7 delete the qa-api-* scratch files"; else fail "STEP 9 and Step 7 delete the qa-api-* scratch files"; fi

# The judge's INCOMPLETE summary points at the troubleshooting notes, and the file exists.
if [[ -f "$REPO_ROOT/skills/qa-lane-6-suites/troubleshooting.md" ]] && grep -q 'skills/qa-lane-6-suites/troubleshooting.md' "$REPO_ROOT/skills/qa-lane-6-suites/scripts/judge.mjs"; then pass "qa-lane-6-suites: troubleshooting.md exists and the judge names it"; else fail "qa-lane-6-suites: troubleshooting.md exists and the judge names it"; fi

if [[ "$FAILURES" -gt 0 ]]; then
  echo "STATUS: FAILED ($FAILURES failure(s))"
  exit 1
fi
echo "STATUS: PASSED"
