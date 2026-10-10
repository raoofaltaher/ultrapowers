#!/usr/bin/env bash
# Team memory store templates: presence, content, leak scan, and a real render
# through the piece 2 init engine.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
TPL="$REPO_ROOT/templates"
STORE_TPL="$TPL/.agents/memory"
INIT="$REPO_ROOT/skills/init/scripts/init.mjs"
LINT="$REPO_ROOT/skills/team-memory/scripts/memory-lint.mjs"

FAILURES=0
pass() { echo "  [PASS] $1"; }
fail() { echo "  [FAIL] $1"; FAILURES=$((FAILURES + 1)); }
check() { local d="$1"; shift; if "$@" >/dev/null 2>&1; then pass "$d"; else fail "$d"; fi; }

echo "Team memory templates"

for f in README.md.tmpl MEMORY.md.tmpl gotchas/.gitkeep decisions/.gitkeep subsystems/.gitkeep; do
  check "templates/.agents/memory/$f exists" test -f "$STORE_TPL/$f"
done

check "MEMORY.md.tmpl has exactly the three headings, in order" bash -c '
  [ "$(grep -c "^## " "$1")" -eq 3 ] &&
  [ "$(grep "^## " "$1" | tr "\n" "|")" = "## Gotchas|## Decisions|## Subsystems|" ]' _ "$STORE_TPL/MEMORY.md.tmpl"

check "MEMORY.md.tmpl preamble carries the four criteria and the never-store list" bash -c '
  grep -q "Verified" "$1" && grep -q "Durable" "$1" && grep -q "Expensive" "$1" && grep -q "Not derivable" "$1" &&
  grep -q "Never store: secrets, tokens, credentials, URLs embedding auth, personal data, customer data." "$1"' _ "$STORE_TPL/MEMORY.md.tmpl"

check "MEMORY.md.tmpl stays well under the 150-line budget" bash -c '[ "$(wc -l < "$1")" -lt 40 ]' _ "$STORE_TPL/MEMORY.md.tmpl"

check "README.md.tmpl documents the D2 entry schema" bash -c '
  grep -q "^name: " "$1" && grep -q "^description: " "$1" && grep -q "^metadata:" "$1" &&
  grep -q "^  type: " "$1" && grep -q "^date: " "$1" && ! grep -q "^title: " "$1" && ! grep -q "^area: " "$1"' _ "$STORE_TPL/README.md.tmpl"

check "README.md.tmpl names the trailer, the ladder, prune and the secret gate" bash -c '
  grep -q "Memory-Ref" "$1" && grep -qi "recall ladder" "$1" && grep -qi "prune" "$1" && grep -qi "secret gate" "$1"' _ "$STORE_TPL/README.md.tmpl"

# G4: nothing from the reference project. Generic patterns only: emails,
# URLs, forge and package-manager names, a DRI line. Project-specific names
# belong in the untracked ULTRAPOWERS_FORBIDDEN_PATTERNS_FILE, which the
# template leak scan in tests/init/test-templates-clean.sh reads.
check "store templates contain no reference-project data" bash -c '
  ! grep -rEi "https?://|@[a-z0-9-]+\.[a-z]{2,}|gitlab|github|bitbucket|winget|DRI:" "$1"' _ "$STORE_TPL"

# Promotion is a transformation, not a copy: a personal auto-memory layer has
# its own metadata types and keys, which the D2 schema rejects.
check "README.md.tmpl and AGENTS.md.tmpl describe promotion as reducing metadata to type" bash -c '
  ! grep -q "promoted by copying it here and adding" "$1" && grep -q "only \`type\`" "$1" &&
  grep -q "reduced to \`type\`" "$2" && grep -qi "never promote" "$1" && grep -qi "never promoted" "$2"' _ "$STORE_TPL/README.md.tmpl" "$TPL/AGENTS.md.tmpl"

check "ultrapowers.json.tmpl has the memory section with the three keys (no path)" bash -c '
  grep -q "\"memory\": {" "$1" && ! grep -q "\"path\"" "$1" &&
  grep -q "\"indexBudget\": 150" "$1" && grep -q "\"rediscoveryMinutes\": 15" "$1" &&
  grep -q "\"trailer\": \"Memory-Ref\"" "$1"' _ "$TPL/.agents/ultrapowers.json.tmpl"

check "AGENTS.md.tmpl has the Team memory section with criteria and trailer" bash -c '
  grep -q "^## Team memory" "$1" && grep -q "MEMORY.md" "$1" && grep -q "Memory-Ref" "$1" &&
  grep -q "not derivable" "$1" && grep -q "ultrapowers:team-memory" "$1"' _ "$TPL/AGENTS.md.tmpl"

check "CLAUDE.md.tmpl imports MEMORY.md right after AGENTS.md" bash -c '
  grep -n "^@" "$1" | head -2 | tr "\n" "|" | grep -q "^[0-9]*:@AGENTS.md|[0-9]*:@.agents/memory/MEMORY.md|$"' _ "$TPL/CLAUDE.md.tmpl"

check "GEMINI.md.tmpl imports MEMORY.md right after AGENTS.md" bash -c '
  grep -n "^@" "$1" | head -2 | tr "\n" "|" | grep -q "^[0-9]*:@AGENTS.md|[0-9]*:@.agents/memory/MEMORY.md|$"' _ "$TPL/GEMINI.md.tmpl"

check "nested-clone pointer template names ../.agents/memory/ and the grep caveat" bash -c '
  f="$(grep -rl "Team memory lives at" "$1" | head -1)"; [ -n "$f" ] &&
  grep -q "\.\./\.agents/memory/" "$f" && grep -qi "grep from inside this repo cannot see it" "$f"' _ "$TPL"

# Real render through the init engine (acceptance criterion 1).
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
git -C "$WORK" init -q
if (cd "$WORK" && node "$INIT" scaffold --name demo >"$WORK/.init-report.json" 2>"$WORK/.init-err.txt"); then
  pass "init scaffold ran"
else
  fail "init scaffold ran"; sed 's/^/    /' "$WORK/.init-err.txt"
fi
check "rendered store has README.md" test -f "$WORK/.agents/memory/README.md"
check "rendered store has MEMORY.md with three headings" bash -c '[ "$(grep -c "^## " "$1")" -eq 3 ]' _ "$WORK/.agents/memory/MEMORY.md"
for d in gotchas decisions subsystems; do
  check "rendered store has $d/" test -d "$WORK/.agents/memory/$d"
done
check "rendered config has memory.indexBudget 150" bash -c '
  node -e "const c=JSON.parse(require(\"fs\").readFileSync(process.argv[1],\"utf8\")); process.exit(c.memory && c.memory.indexBudget===150 && c.memory.rediscoveryMinutes===15 && c.memory.trailer===\"Memory-Ref\" ? 0 : 1)" "$1"' _ "$WORK/.agents/ultrapowers.json"
check "rendered config has no memory.path (the store path is fixed)" bash -c '
  node -e "const c=JSON.parse(require(\"fs\").readFileSync(process.argv[1],\"utf8\")); process.exit(c.memory && !(\"path\" in c.memory) ? 0 : 1)" "$1"' _ "$WORK/.agents/ultrapowers.json"
check "rendered MEMORY.md has no unrendered placeholder" bash -c '! grep -q "{{" "$1"' _ "$WORK/.agents/memory/MEMORY.md"
if [ -f "$LINT" ]; then
  check "fresh rendered store passes memory-lint" node "$LINT" "$WORK/.agents/memory"
else
  echo "  [SKIP] memory-lint not present yet (Task 2)"
fi

if [ "$FAILURES" -gt 0 ]; then echo "STATUS: FAILED ($FAILURES failure(s))"; exit 1; fi
echo "STATUS: PASSED"
