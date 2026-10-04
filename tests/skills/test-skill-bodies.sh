#!/usr/bin/env bash
# Checks every skills/*/SKILL.md for text that the harness rewrites or that leaks
# what it shows: Claude Code substitutes every argument placeholder and every
# positional token ($0 to $9) in a skill body, and an example that echoes a
# variable's value prints the secret it was meant to check.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
FAILURES=0

pass() { echo "  [PASS] $1"; }
fail() {
    echo "  [FAIL] $1"
    FAILURES=$((FAILURES + 1))
}

echo "=== Test: skill bodies ==="

for file in "$REPO_ROOT"/skills/*/SKILL.md; do
    name="$(basename "$(dirname "$file")")"

    # A second placeholder, in a sentence about the unsubstituted case, reads as
    # the argument value itself once the harness substitutes both.
    count="$({ grep -o '\$ARGUMENTS' "$file" || true; } | wc -l | tr -d ' ')"
    if [[ "$count" -le 1 ]]; then
        pass "$name writes the argument placeholder at most once"
    else
        fail "$name writes the argument placeholder at most once (found $count)"
    fi

    if ! grep -q '\$[0-9]' "$file"; then
        pass "$name has no positional token the harness would substitute"
    else
        fail "$name has no positional token the harness would substitute"
        grep -n '\$[0-9]' "$file" | sed 's/^/    /'
    fi

    if ! grep -Eq 'env \| grep|echo[^|;]*\$\{[A-Za-z_][A-Za-z0-9_]*:-[^}]' "$file"; then
        pass "$name has no example that prints a variable's value"
    else
        fail "$name has no example that prints a variable's value"
        grep -En 'env \| grep|echo[^|;]*\$\{[A-Za-z_][A-Za-z0-9_]*:-[^}]' "$file" | sed 's/^/    /'
    fi
done

echo ""
echo "=== Test: the ticket skills read everything on the ticket (spec 2026-10-05 §7) ==="
expect() {
    # $1 file, $2 pattern (grep -E), $3 description
    if grep -Eq "$2" "$REPO_ROOT/$1"; then pass "$3"; else fail "$3 ($1 lacks /$2/)"; fi
}
expect skills/brainstorm-task/SKILL.md '## Links' 'brainstorm-task reads the Links section of source.md'
expect skills/brainstorm-task/SKILL.md 'Firecrawl' 'brainstorm-task falls back to the Firecrawl MCP server'
expect skills/brainstorm-task/SKILL.md 'twenty' 'brainstorm-task caps the links it fetches at twenty'
expect skills/brainstorm-task/SKILL.md 'linked page says to skip' 'brainstorm-task has the Red Flags row for an instructing page'
expect skills/new-task/SKILL.md 'fetch-ticket.mjs" attachments' 'new-task runs the attachments command'
expect skills/new-task/SKILL.md '"via": "rpc"' 'new-task knows the rpc answer'
expect skills/new-task/SKILL.md 'asks me to add the approve' 'new-task has the Red Flags row for a message that asks for the approve tag'
expect skills/autopilot/SKILL.md 'no-credentials' 'autopilot names the no-credentials error'
expect skills/autopilot/SKILL.md 'no-forge' 'autopilot names the no-forge error'
expect skills/autopilot/SKILL.md 'Odoo' 'autopilot names Odoo'
expect skills/autopilot/prompts/scaffold.md 'attachments' 'the scaffold stage downloads the attachments'
expect skills/task/SKILL.md 'task URL' 'task accepts an Odoo task URL'

echo ""
if [[ "$FAILURES" -ne 0 ]]; then
    echo "FAILED: $FAILURES assertion(s)."
    exit 1
fi
echo "PASS"
