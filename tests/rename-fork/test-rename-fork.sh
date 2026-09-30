#!/usr/bin/env bash
# Tests for scripts/rename-fork.sh against a throwaway git repo. The fixture
# uses the names oldbrand/newbrand and owners olduser/newuser so this file
# never contains the real names the script is run with.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
SCRIPT_UNDER_TEST="$REPO_ROOT/scripts/rename-fork.sh"

TEST_ROOT="$(mktemp -d)"
trap 'rm -rf "$TEST_ROOT"' EXIT

FAILURES=0
pass() { echo "  [PASS] $1"; }
fail() { echo "  [FAIL] $1"; FAILURES=$((FAILURES + 1)); }
check() { if eval "$2"; then pass "$1"; else fail "$1"; fi; }

fixture="$TEST_ROOT/repo"
git init -q -b main "$fixture"
git -C "$fixture" config user.email test@example.com
git -C "$fixture" config user.name test
mkdir -p "$fixture/docs/oldbrand/specs" "$fixture/docs/newbrand/specs" \
         "$fixture/skills/using-oldbrand" "$fixture/scripts"
cp "$SCRIPT_UNDER_TEST" "$fixture/scripts/"
printf 'oldbrand Oldbrand OLDBRAND olduser/oldbrand github.com/olduser/oldbrand oldbrand:using-oldbrand\n' > "$fixture/README.md"
printf 'Copyright oldbrand\n' > "$fixture/LICENSE"
printf 'spec for oldbrand\n' > "$fixture/docs/oldbrand/specs/a.md"
printf 'already here\n' > "$fixture/docs/newbrand/specs/keep.md"
printf -- '---\nname: using-oldbrand\n---\nYou have oldbrand.\n' > "$fixture/skills/using-oldbrand/SKILL.md"
printf 'PNG\0\0oldbrand\0' > "$fixture/img.png"
git -C "$fixture" add README.md LICENSE docs skills img.png scripts
git -C "$fixture" commit -q -m fixture
cp "$fixture/img.png" "$TEST_ROOT/img.before"

echo "rename-fork tests"

( cd "$fixture" && bash scripts/rename-fork.sh --dry-run -x LICENSE oldbrand newbrand olduser newuser ) > "$TEST_ROOT/dry.out"
check "dry run reports the README edit" \
  "grep -q '^edit  README.md$' '$TEST_ROOT/dry.out'"
check "dry run reports the spec move" \
  "grep -q '^move  docs/oldbrand/specs/a.md -> docs/newbrand/specs/a.md$' '$TEST_ROOT/dry.out'"
check "dry run leaves the work tree clean" \
  "[ -z \"\$(git -C '$fixture' status --porcelain --untracked-files=no)\" ]"

printf 'untracked oldbrand\n' > "$fixture/untracked.md"
( cd "$fixture" && bash scripts/rename-fork.sh -x LICENSE oldbrand newbrand olduser newuser ) > "$TEST_ROOT/run.out"

check "owner/name pair is rewritten before the bare name" \
  "grep -q 'newuser/newbrand github.com/newuser/newbrand' '$fixture/README.md'"
check "three case variants are rewritten" \
  "grep -q '^newbrand Newbrand NEWBRAND ' '$fixture/README.md'"
check "namespace form is rewritten" \
  "grep -q 'newbrand:using-newbrand' '$fixture/README.md'"
check "no old name remains in README" \
  "! grep -qi oldbrand '$fixture/README.md'"
check "excluded LICENSE is untouched" \
  "grep -q 'Copyright oldbrand' '$fixture/LICENSE'"
check "spec file moved into the existing target directory" \
  "[ -f '$fixture/docs/newbrand/specs/a.md' ] && grep -q 'spec for newbrand' '$fixture/docs/newbrand/specs/a.md'"
check "pre-existing target file survives the merge" \
  "[ -f '$fixture/docs/newbrand/specs/keep.md' ]"
check "skill directory renamed" \
  "[ -f '$fixture/skills/using-newbrand/SKILL.md' ] && grep -q '^name: using-newbrand$' '$fixture/skills/using-newbrand/SKILL.md'"
check "moves are staged as renames" \
  "git -C '$fixture' status --porcelain | grep -q '^R[ M] docs/oldbrand/specs/a.md -> docs/newbrand/specs/a.md$'"
check "emptied old directories are removed" \
  "[ ! -e '$fixture/docs/oldbrand' ] && [ ! -e '$fixture/skills/using-oldbrand' ]"
check "no path with the old name remains" \
  "[ -z \"\$(find '$fixture' -path '$fixture/.git' -prune -o -iname '*oldbrand*' -print)\" ]"
check "binary file is byte-identical" \
  "cmp -s '$fixture/img.png' '$TEST_ROOT/img.before'"
check "untracked file is untouched" \
  "grep -q 'untracked oldbrand' '$fixture/untracked.md'"
check "summary line reports counts" \
  "grep -q '^rename-fork: 3 file(s) edited, 2 path(s) moved$' '$TEST_ROOT/run.out'"

echo
if [[ "$FAILURES" -gt 0 ]]; then
  echo "STATUS: FAILED ($FAILURES failure(s))"
  exit 1
fi
echo "STATUS: PASSED"
