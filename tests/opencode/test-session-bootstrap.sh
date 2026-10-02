#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# Run outside any project: the harness passes directory '.', and this repo's own
# .agents/memory/ would add a team-memory part to every bootstrap message.
WORK_DIR="$(mktemp -d)"
trap 'rm -rf "$WORK_DIR"' EXIT
cd "$WORK_DIR"
node "$SCRIPT_DIR/test-session-bootstrap.mjs" "$SCRIPT_DIR/../../.opencode/plugins/ultrapowers.js"
