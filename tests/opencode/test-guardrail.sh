#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
node "$SCRIPT_DIR/test-guardrail.mjs" "$SCRIPT_DIR/../../.opencode/plugins/ultrapowers.js"
