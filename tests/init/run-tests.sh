#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$REPO_ROOT"

echo "== init: template leak scan"
bash tests/init/test-templates-clean.sh

echo "== init: engine"
node --test tests/init/test-engine.mjs

for extra in tests/init/test-mcp-transforms.mjs tests/init/test-modes.mjs tests/init/test-nudge-injectors.mjs; do
  if [ -f "$extra" ]; then
    echo "== init: $(basename "$extra" .mjs)"
    node --test "$extra"
  fi
done

if [ -f tests/init/test-skill-structure.sh ]; then
  echo "== init: skill structure"
  bash tests/init/test-skill-structure.sh
fi

echo "STATUS: PASSED"
