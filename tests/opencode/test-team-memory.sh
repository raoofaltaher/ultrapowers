#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
node "$SCRIPT_DIR/test-team-memory.mjs" "$SCRIPT_DIR/../../.opencode/plugins/ultrapowers.js"
