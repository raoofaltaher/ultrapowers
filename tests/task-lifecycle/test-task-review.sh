#!/usr/bin/env bash
# Tests for the task-review skill's helper scripts: review-preflight.sh (documents,
# repository selection, per-repository diff ranges) and qa-preflight.mjs --change-set-only,
# run against temp scaffolded projects built by make-fixture.sh.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
FIXTURE="$SCRIPT_DIR/make-fixture.sh"
PREFLIGHT="$REPO_ROOT/skills/task-review/scripts/review-preflight.sh"
QA_PREFLIGHT="$REPO_ROOT/skills/qa-specialist/scripts/qa-preflight.mjs"

FAILURES=0
TEST_ROOT=""

pass() { echo "  [PASS] $1"; }
fail() {
    echo "  [FAIL] $1"
    FAILURES=$((FAILURES + 1))
}
cleanup() {
    if [[ -n "$TEST_ROOT" && -d "$TEST_ROOT" ]]; then rm -rf "$TEST_ROOT"; fi
}

# check NAME CONDITION-RESULT(0|1) [DETAIL]
check() {
    if [[ "$2" -eq 0 ]]; then pass "$1"; else
        fail "$1"
        [[ -n "${3:-}" ]] && printf '    %s\n' "$3"
    fi
}
has() { grep -Fq -- "$2" <<<"$1"; }

commit_file() { # DIR FILE CONTENT MESSAGE
    printf '%s\n' "$3" >"$1/$2"
    git -C "$1" add -A
    git -C "$1" commit -qm "$4"
}

# Two repositories on the same ticket branch name, with different bases: api branches from
# main, web from develop (web's defaultBranch in the config is develop).
build_two_base_project() {
    local proj="$1"
    bash "$FIXTURE" "$proj" >/dev/null
    sed -i 's|"name": "web", "path": "web", "defaultBranch": "main"|"name": "web", "path": "web", "defaultBranch": "develop"|' \
        "$proj/.agents/ultrapowers.json"
    git -C "$proj/api" checkout -q -b feature/501-login
    commit_file "$proj/api" src/a.txt a1 "api one"
    commit_file "$proj/api" src/b.txt b1 "api two"
    git -C "$proj/web" checkout -q -b develop
    commit_file "$proj/web" src/dev.txt d1 "develop work"
    git -C "$proj/web" checkout -q -b feature/501-login
    commit_file "$proj/web" src/w.txt w1 "web one"
    mkdir -p "$proj/tasks/501" "$proj/specs/501"
    printf '# 501\n' >"$proj/tasks/501/501.md"
    printf '# Spec\n' >"$proj/specs/501/Spec.md"
}

test_review_preflight() {
    echo "--- review-preflight.sh ---"
    local proj="$TEST_ROOT/two" out rc

    build_two_base_project "$proj"
    out="$(cd "$proj" && sh "$PREFLIGHT" 501)"
    has "$out" '=== DOCS ===' && has "$out" 'tasks/501/501.md' && has "$out" 'specs/501/Spec.md'
    check "lists the ticket documents under DOCS" $?

    has "$out" 'SELECTED-BY-BRANCH: api web'
    check "selects both repositories on the ticket branch" $? "$out"

    local tab=$'\t'
    has "$out" "api${tab}main${tab}feature/501-login${tab}2${tab}2"
    check "api's range uses main: 2 files, 2 commits" $? "$out"
    has "$out" "web${tab}develop${tab}feature/501-login${tab}1${tab}1"
    check "web's range uses its own base, develop: 1 file, 1 commit" $? "$out"
    has "$out" 'STATUS: READY'
    check "status is READY when a range exists" $?

    out="$(cd "$proj" && sh "$PREFLIGHT" 501 backend)"
    has "$out" 'SELECTED-BY-FOCUS (backend): api' && has "$out" "api${tab}main${tab}" && ! has "$out" "web${tab}develop${tab}"
    check "focus word backend narrows the ranges to api" $? "$out"

    # A ticket with no branch anywhere and no spec
    local bare="$TEST_ROOT/bare"
    bash "$FIXTURE" "$bare" >/dev/null
    out="$(cd "$bare" && sh "$PREFLIGHT" 777)"
    has "$out" 'STATUS: NO-WORK'
    check "no ticket branch and no spec prints NO-WORK" $? "$out"

    # A spec but no branch: nothing to diff
    mkdir -p "$bare/specs/778"
    printf '# Spec\n' >"$bare/specs/778/Spec.md"
    out="$(cd "$bare" && sh "$PREFLIGHT" 778)"
    has "$out" 'STATUS: NO-CODE' && ! has "$out" 'STATUS: NO-WORK'
    check "a spec without a ticket branch prints NO-CODE, not NO-WORK" $? "$out"

    # Bad ticket id and missing id
    rc=0
    (cd "$proj" && sh "$PREFLIGHT" '../x' >/dev/null 2>&1) || rc=$?
    check "a ticket id that names a path is refused with exit 2" "$([[ $rc -eq 2 ]] && echo 0 || echo 1)" "exit $rc"
    rc=0
    (cd "$proj" && sh "$PREFLIGHT" >/dev/null 2>&1) || rc=$?
    check "no ticket id exits 1" "$([[ $rc -eq 1 ]] && echo 0 || echo 1)" "exit $rc"

    # Writes nothing
    local before after
    before="$(git -C "$proj" status --porcelain; find "$proj" -path '*/.git' -prune -o -type f -newer "$proj/.agents/ultrapowers.json" -print | LC_ALL=C sort)"
    (cd "$proj" && sh "$PREFLIGHT" 501 >/dev/null)
    after="$(git -C "$proj" status --porcelain; find "$proj" -path '*/.git' -prune -o -type f -newer "$proj/.agents/ultrapowers.json" -print | LC_ALL=C sort)"
    [[ "$before" == "$after" ]] && rc=0 || rc=1
    check "the preflight writes nothing" "$rc"
}

test_change_set_only() {
    echo "--- qa-preflight.mjs --change-set-only ---"
    local proj="$TEST_ROOT/two" out rc=0
    out="$(cd "$proj" && node "$QA_PREFLIGHT" --change-set-only 501)" || rc=$?
    check "exits 0 on a project with no qa section" "$([[ $rc -eq 0 ]] && echo 0 || echo 1)" "exit $rc"
    node -e '
const a = JSON.parse(process.argv[1]);
const w = a.find(e => e.repo === "web");
const p = a.find(e => e.repo === "api");
if (!Array.isArray(a) || !w || !p) process.exit(1);
if (w.defaultBranch !== "develop" || w.commits.length !== 1 || !w.onTicketBranch) process.exit(2);
if (p.defaultBranch !== "main" || p.commits.length !== 2) process.exit(3);
' "$out"
    check "prints only the changeSet array, each repo against its own base" $? "$out"
    has "$out" '"qa"' && rc=1 || rc=0
    check "prints nothing but the changeSet" "$rc"

    rc=0
    (cd "$proj" && node "$QA_PREFLIGHT" --change-set-only '../x' >/dev/null 2>&1) || rc=$?
    check "an id that names a path exits 4" "$([[ $rc -eq 4 ]] && echo 0 || echo 1)" "exit $rc"
    rc=0
    (cd "$TEST_ROOT" && node "$QA_PREFLIGHT" --change-set-only 501 >/dev/null 2>&1) || rc=$?
    check "no project root exits 3" "$([[ $rc -eq 3 ]] && echo 0 || echo 1)" "exit $rc"
}

main() {
    echo "=== Test: task-review helpers ==="
    TEST_ROOT="$(mktemp -d)"
    trap cleanup EXIT
    test_review_preflight
    test_change_set_only
    echo ""
    if [[ "$FAILURES" -ne 0 ]]; then
        echo "FAILED: $FAILURES assertion(s)."
        exit 1
    fi
    echo "PASS"
}

main "$@"
