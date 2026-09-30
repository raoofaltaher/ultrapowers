#!/usr/bin/env bash
# Structural checks for skills/team-memory: frontmatter shape, the four modes,
# forge neutrality, house voice, lint script reference, Muse registration.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
SKILL="$REPO_ROOT/skills/team-memory/SKILL.md"

FAILURES=0
pass() { echo "  [PASS] $1"; }
fail() { echo "  [FAIL] $1"; FAILURES=$((FAILURES + 1)); }
check() { local d="$1"; shift; if "$@" >/dev/null 2>&1; then pass "$d"; else fail "$d"; fi; }

echo "team-memory skill structure"
check "SKILL.md exists" test -f "$SKILL"
check "frontmatter has exactly name and description" bash -c '
  fm="$(awk "NR==1 && \$0==\"---\" {infm=1; next} infm && \$0==\"---\" {exit} infm {print}" "$1")"
  [ "$(printf "%s\n" "$fm" | grep -c "^[a-z]*:")" -eq 2 ] &&
  printf "%s\n" "$fm" | grep -q "^name: team-memory$" &&
  printf "%s\n" "$fm" | grep -q "^description: Use when "' _ "$SKILL"
check "body has the four mode headings" bash -c '
  grep -q "^## remember" "$1" && grep -q "^## recall" "$1" && grep -q "^## prune" "$1" && grep -q "^## lint" "$1"' _ "$SKILL"
check "body carries the four criteria and the never-store list verbatim" bash -c '
  grep -q "\*\*Verified\*\*" "$1" && grep -q "\*\*Durable\*\*" "$1" && grep -q "\*\*Expensive\*\*" "$1" && grep -q "\*\*Not derivable\*\*" "$1" &&
  grep -q "Never store: secrets, tokens, credentials, URLs embedding auth, personal data, customer data." "$1"' _ "$SKILL"
check "body names the lint script and the file exists" bash -c '
  grep -q "scripts/memory-lint.mjs" "$1" && test -f "$2"' _ "$SKILL" "$REPO_ROOT/skills/team-memory/scripts/memory-lint.mjs"
check "body is forge-neutral and free of reference-project data" bash -c '
  ! grep -Eiq "gitlab|github|bitbucket|merge request|pull request|nextit|next-it|https?://" "$1"' _ "$SKILL"
check "body says your human partner, never the user" bash -c '
  ! grep -qi "the user" "$1" && grep -q "your human partner" "$1"' _ "$SKILL"
check "body reads repos from the project config, not hard-coded names" bash -c '
  grep -q "repos" "$1" && grep -q "ultrapowers.json" "$1" && ! grep -Eq "git -C [a-z]" "$1"' _ "$SKILL"
check "body has a Red Flags table" bash -c 'grep -q "^## Red flags" "$1" && grep -q "^| Thought | Reality |" "$1"' _ "$SKILL"
check "promotion reduces metadata to type and never promotes a user-type memory" bash -c '
  grep -q "reduced to \`type\`" "$1" && grep -qi "never promote" "$1"' _ "$SKILL"
check "Muse manifest lists team-memory" bash -c '
  node -e "const m=JSON.parse(require(\"fs\").readFileSync(process.argv[1],\"utf8\")); process.exit(m.capabilities.skills.some(s=>s.id===\"team-memory\"&&s.path===\"skills/team-memory/SKILL.md\")?0:1)" "$1"' _ "$REPO_ROOT/.muse-plugin/plugin.json"

if [ "$FAILURES" -gt 0 ]; then echo "STATUS: FAILED ($FAILURES failure(s))"; exit 1; fi
echo "STATUS: PASSED"
