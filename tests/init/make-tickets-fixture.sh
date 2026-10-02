#!/usr/bin/env bash
# Build the fixture for the init ticket-source pressure scenarios S6-S10:
#   S6       an empty git repository (scaffold mode)
#   S7-S10   a repository scaffolded for claude-code by this tree's engine
#   S9       plus a .mcp.json.ultrapowers-new proposal left from an earlier run
#
# Usage: make-tickets-fixture.sh DIR SCENARIO
set -euo pipefail

dir="$1"
scenario="$2"
repo_root="$(cd "$(dirname "$0")/../.." && pwd)"

mkdir -p "$dir"
git init -q -b main "$dir"
git -C "$dir" config user.name "Test Bot"
git -C "$dir" config user.email "test@example.com"
git -C "$dir" config commit.gpgsign false
git -C "$dir" config core.autocrlf false
printf '# fixture\n' > "$dir/README.md"

case "$scenario" in
    S6) ;;
    S7|S8|S9|S10)
        node "$repo_root/skills/init/scripts/init.mjs" scaffold --root "$dir" --name fixture --harnesses claude-code > /dev/null
        if [ "$scenario" = S9 ]; then
            printf '{\n  "mcpServers": {}\n}\n' > "$dir/.mcp.json.ultrapowers-new"
        fi
        ;;
    *) printf 'unknown scenario %s\n' "$scenario" >&2; exit 1 ;;
esac

git -C "$dir" add -A
git -C "$dir" commit -qm "init tickets fixture ($scenario)"
