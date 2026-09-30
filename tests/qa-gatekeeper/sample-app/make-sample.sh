#!/usr/bin/env bash
# make-sample.sh <dir> <port>
#
# Builds a scaffolded sample project for the QA gatekeeper's live checks: .agents/ultrapowers.json
# with a filled qa section (two roles, two languages, one suite; containers, database,
# observability and brand left empty so lanes 2, 4 and 5 and the brand dimension gate off),
# ticket 2001's brief, spec and plan with no generated content (lane 7 gates off), the
# known-issues baseline, a .mcp.json declaring the playwright server, and a nested repo "app"
# whose branch feat/2001-items adds the feature over a health-only main.
# Start the app afterwards with: QA_SAMPLE_PORT=<port> node <dir>/app/server.mjs
set -euo pipefail

usage="usage: make-sample.sh <dir> <port>"
dir="${1:?$usage}"
port="${2:?$usage}"
here="$(cd "$(dirname "$0")" && pwd)"
repo_root="$(cd "$here/../../.." && pwd)"

if [[ -e "$dir/.agents/ultrapowers.json" ]]; then
  echo "ERROR: $dir already holds a project" >&2
  exit 1
fi
mkdir -p "$dir/.agents" "$dir/tasks/2001" "$dir/specs/2001" "$dir/plans/2001" "$dir/reviews/2001" "$dir/qa" "$dir/app"
sed "s/__PORT__/$port/g" "$here/ultrapowers.qa.json" >"$dir/.agents/ultrapowers.json"
cp "$repo_root/templates/qa/known-issues.md.tmpl" "$dir/qa/known-issues.md"

case "$(uname -s)" in
  MINGW* | MSYS* | CYGWIN*) server='"command": "cmd", "args": ["/c", "npx", "-y", "@playwright/mcp@latest"]' ;;
  *) server='"command": "npx", "args": ["-y", "@playwright/mcp@latest"]' ;;
esac
printf '{\n  "mcpServers": {\n    "playwright": { "type": "stdio", %s, "env": {} }\n  }\n}\n' "$server" >"$dir/.mcp.json"

cat >"$dir/tasks/2001/2001.md" <<'EOF'
# 2001 - Items list

## Context
Signed-in people list and add items; admins also reach an administration page and may delete items through the API. The app speaks English and French.

## Definition of Ready
- [x] Two roles and two languages agreed

## Definition of Done
- [ ] Both roles list and add items in both languages; only admins reach the administration page
EOF
cat >"$dir/specs/2001/Spec.md" <<'EOF'
# 2001 design

## Acceptance criteria
1. A signed-in user sees the item list and can add an item by name.
2. An empty name is refused with a message in the session's language.
3. An admin also reaches /admin; a user gets "access denied" there.
4. Every page offers a way home and a language switch; the choice persists.
5. /api/items answers 401 without a session; DELETE /api/items/<id> is for admins only.
EOF
printf '# 2001 plan\n\nSee specs/2001/Spec.md.\n' >"$dir/plans/2001/Plan.md"

git_app() { git -C "$dir/app" -c user.name=qa-sample -c user.email=qa-sample@example.com "$@"; }
git init -q -b main "$dir/app"
printf '%s\n' "import { createServer } from 'node:http';" \
  "createServer((req, res) => { res.writeHead(200); res.end('ok'); }).listen(Number(process.env.QA_SAMPLE_PORT || 3917));" \
  >"$dir/app/server.mjs"
git_app add server.mjs
git_app commit -q -m "health-only stub"
git_app checkout -q -b feat/2001-items
cp "$here/server.mjs" "$here/sample-suite.mjs" "$dir/app/"
git_app add server.mjs sample-suite.mjs
git_app commit -q -m "2001: items list, admin page, English and French"
echo "sample project ready: $dir (ticket 2001, port $port)"
