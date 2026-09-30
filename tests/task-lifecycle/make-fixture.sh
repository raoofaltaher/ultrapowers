#!/usr/bin/env bash
# Build a scaffolded ultrapowers project for tests and pressure scenarios:
# a root repo holding .agents/ultrapowers.json and the four ticket folders,
# two nested clones one level down (api: area backend, web: area frontend),
# both ignored by the root, and one declared repo (mobile) that is not cloned.
#
# Usage: make-fixture.sh DIR [TICKET_PATTERN] [COMMIT_TRAILER]
set -euo pipefail

dir="$1"
pattern="${2:-^#?[A-Za-z0-9][A-Za-z0-9._-]*\$}"
trailer="${3:-}"

git_identity() {
    git -C "$1" config user.name "Test Bot"
    git -C "$1" config user.email "test@example.com"
    git -C "$1" config commit.gpgsign false
    # Keep the temp repos byte-stable on Windows: no CRLF conversion warnings
    # and no phantom modifications in the clean-tree assertions.
    git -C "$1" config core.autocrlf false
}

mkdir -p "$dir"
git init -q -b main "$dir"
git_identity "$dir"
mkdir -p "$dir/.agents" "$dir/tasks" "$dir/specs" "$dir/plans" "$dir/reviews"
cat > "$dir/.agents/ultrapowers.json" <<JSON
{
  "name": "fixture",
  "pluginVersion": "1.0.0",
  "scaffoldedAt": "2026-09-30",
  "topology": "nested",
  "repos": [
    { "name": "api", "path": "api", "defaultBranch": "main", "area": "backend" },
    { "name": "web", "path": "web", "defaultBranch": "main", "area": "frontend" },
    { "name": "mobile", "path": "mobile", "defaultBranch": "main" }
  ],
  "harnesses": ["claude-code"],
  "kb": ["tasks", "specs", "plans", "reviews"],
  "written": [],
  "commitTrailer": "$trailer",
  "ticketPattern": "$pattern"
}
JSON
printf 'api/\nweb/\nmobile/\n' > "$dir/.gitignore"
for kb in tasks specs plans reviews; do : > "$dir/$kb/.gitkeep"; done
git -C "$dir" add -A
git -C "$dir" commit -qm "scaffold fixture"

for r in api web; do
    git init -q -b main "$dir/$r"
    git_identity "$dir/$r"
    mkdir -p "$dir/$r/src"
    printf 'hello from %s\n' "$r" > "$dir/$r/src/main.txt"
    git -C "$dir/$r" add -A
    git -C "$dir/$r" commit -qm "init $r"
done
printf '%s\n' "$dir"
