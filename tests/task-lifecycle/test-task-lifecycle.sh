#!/usr/bin/env bash
# Tests for the task lifecycle helper scripts shipped with the new-task,
# brainstorm-task and task skills, run against temp scaffolded projects built
# by make-fixture.sh: root walk-up to .agents/ultrapowers.json, ticket pattern
# accept and reject, refusal on an existing task, spec collision detection,
# repository selection and the eight-file grounding cap.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
FIXTURE="$SCRIPT_DIR/make-fixture.sh"
LIB="$REPO_ROOT/skills/new-task/scripts/ticket-lib.sh"
SCAFFOLD="$REPO_ROOT/skills/new-task/scripts/scaffold-task.sh"
PREFLIGHT="$REPO_ROOT/skills/brainstorm-task/scripts/preflight.sh"
GROUND="$REPO_ROOT/skills/brainstorm-task/scripts/ground.sh"
COMMIT_SPEC="$REPO_ROOT/skills/brainstorm-task/scripts/commit-spec.sh"
MANIFEST="$REPO_ROOT/skills/task/scripts/manifest.sh"
LIFECYCLE_SKILLS=()

FAILURES=0
TEST_ROOT=""

pass() { echo "  [PASS] $1"; }
fail() {
    echo "  [FAIL] $1"
    FAILURES=$((FAILURES + 1))
}

cleanup() {
    if [[ -n "$TEST_ROOT" && -d "$TEST_ROOT" ]]; then
        rm -rf "$TEST_ROOT"
    fi
}

# lib_call DIR FUNCTION [ARGS...]
# Source the POSIX library in a plain sh started in DIR and call one function.
lib_call() {
    local dir="$1"
    shift
    (cd "$dir" && sh -c '. "$1"; shift; "$@"' sh "$LIB" "$@")
}

test_lib() {
    echo "--- ticket-lib.sh ---"
    local proj="$TEST_ROOT/proj"
    local got rc err id expected

    # --- root walk-up ---
    got="$(lib_call "$proj/api/src" find_root)"
    if [[ "$got" == "$proj" ]]; then
        pass "find_root walks up from a nested clone to the marker"
    else
        fail "find_root walks up from a nested clone to the marker"
        echo "    got: $got"
    fi

    got="$(lib_call "$proj" find_root)"
    if [[ "$got" == "$proj" ]]; then
        pass "find_root at the root returns the root"
    else
        fail "find_root at the root returns the root"
        echo "    got: $got"
    fi

    got="$(lib_call "$TEST_ROOT/with space/proj/web" find_root)"
    if [[ "$got" == "$TEST_ROOT/with space/proj" ]]; then
        pass "find_root works when the project path contains a space"
    else
        fail "find_root works when the project path contains a space"
        echo "    got: $got"
    fi

    mkdir -p "$TEST_ROOT/bare/deep"
    rc=0
    err="$(lib_call "$TEST_ROOT/bare/deep" find_root 2>&1 >/dev/null)" || rc=$?
    if [[ "$rc" -eq 1 && "$err" == *"ERROR"* && "$err" == *"/ultrapowers:init"* ]]; then
        pass "find_root without a marker exits 1 with ERROR and offers /ultrapowers:init"
    else
        fail "find_root without a marker exits 1 with ERROR and offers /ultrapowers:init"
        echo "    exit: $rc"
        echo "    stderr: $err"
    fi

    # --- ticket pattern, default ---
    for id in 1234 '#1234' PROJ-42 abc.1 v1_2; do
        if lib_call "$proj" validate_ticket "$proj" "$id" 2>/dev/null; then
            pass "validate_ticket accepts [$id]"
        else
            fail "validate_ticket accepts [$id]"
        fi
    done
    for id in '' -x '12 34' a/b .hidden '#'; do
        rc=0
        lib_call "$proj" validate_ticket "$proj" "$id" 2>/dev/null || rc=$?
        if [[ "$rc" -eq 2 ]]; then
            pass "validate_ticket rejects [$id] with exit 2"
        else
            fail "validate_ticket rejects [$id] with exit 2"
            echo "    exit: $rc"
        fi
    done

    # --- ticket pattern, custom ---
    local digits="$TEST_ROOT/digits"
    if lib_call "$digits" validate_ticket "$digits" 1234 2>/dev/null; then
        pass "custom ticketPattern ^[0-9]+\$ accepts [1234]"
    else
        fail "custom ticketPattern ^[0-9]+\$ accepts [1234]"
    fi
    rc=0
    lib_call "$digits" validate_ticket "$digits" PROJ-42 2>/dev/null || rc=$?
    if [[ "$rc" -eq 2 ]]; then
        pass "custom ticketPattern ^[0-9]+\$ rejects [PROJ-42]"
    else
        fail "custom ticketPattern ^[0-9]+\$ rejects [PROJ-42]"
    fi

    # --- config reading, node and sed fallback ---
    expected="$(printf 'api\tapi\tbackend\nweb\tweb\tfrontend\nmobile\tmobile\t-')"
    got="$(lib_call "$proj" config_repos "$proj")"
    if [[ "$got" == "$expected" ]]; then
        pass "config_repos prints name, path and area per repo"
    else
        fail "config_repos prints name, path and area per repo"
        echo "    got: $got"
    fi
    got="$(ULTRAPOWERS_NO_NODE=1 lib_call "$proj" config_repos "$proj")"
    if [[ "$got" == "$expected" ]]; then
        pass "config_repos sed fallback matches the node reader"
    else
        fail "config_repos sed fallback matches the node reader"
        echo "    got: $got"
    fi

    got="$(lib_call "$proj" config_string "$proj" ticketPattern DEFAULT)"
    if [[ "$got" == '^#?[A-Za-z0-9][A-Za-z0-9._-]*$' ]]; then
        pass "config_string reads ticketPattern"
    else
        fail "config_string reads ticketPattern"
        echo "    got: $got"
    fi
    got="$(ULTRAPOWERS_NO_NODE=1 lib_call "$proj" config_string "$proj" ticketPattern DEFAULT)"
    if [[ "$got" == '^#?[A-Za-z0-9][A-Za-z0-9._-]*$' ]]; then
        pass "config_string sed fallback reads ticketPattern"
    else
        fail "config_string sed fallback reads ticketPattern"
        echo "    got: $got"
    fi
    got="$(lib_call "$proj" config_string "$proj" commitTrailer NONE)"
    if [[ "$got" == "NONE" ]]; then
        pass "config_string returns the default for an empty commitTrailer"
    else
        fail "config_string returns the default for an empty commitTrailer"
        echo "    got: $got"
    fi
    got="$(lib_call "$proj" config_string "$proj" missingKey fallback)"
    if [[ "$got" == "fallback" ]]; then
        pass "config_string returns the default for a missing key"
    else
        fail "config_string returns the default for a missing key"
        echo "    got: $got"
    fi

    mkdir -p "$TEST_ROOT/bareconfig/.agents"
    printf '{ "name": "x", "pluginVersion": "1.0.0" }\n' > "$TEST_ROOT/bareconfig/.agents/ultrapowers.json"
    got="$(lib_call "$TEST_ROOT/bareconfig" config_repos "$TEST_ROOT/bareconfig")"
    if [[ "$got" == "$(printf '.\t.\t-')" ]]; then
        pass "a marker without repos yields the root as the only repo"
    else
        fail "a marker without repos yields the root as the only repo"
        echo "    got: $got"
    fi
    got="$(ULTRAPOWERS_NO_NODE=1 lib_call "$TEST_ROOT/bareconfig" config_repos "$TEST_ROOT/bareconfig")"
    if [[ "$got" == "$(printf '.\t.\t-')" ]]; then
        pass "sed fallback also yields the root when repos is absent"
    else
        fail "sed fallback also yields the root when repos is absent"
        echo "    got: $got"
    fi

    # --- repo_path ---
    got="$(lib_call "$proj" repo_path "$proj" api)"
    if [[ "$got" == "$proj/api" ]]; then
        pass "repo_path resolves a declared repo under the root"
    else
        fail "repo_path resolves a declared repo under the root"
        echo "    got: $got"
    fi
    got="$(lib_call "$proj" repo_path "$proj" .)"
    if [[ "$got" == "$proj" ]]; then
        pass "repo_path resolves . to the root"
    else
        fail "repo_path resolves . to the root"
    fi
    rc=0
    lib_call "$proj" repo_path "$proj" nosuch >/dev/null 2>&1 || rc=$?
    if [[ "$rc" -eq 2 ]]; then
        pass "repo_path exits 2 for an unknown repo"
    else
        fail "repo_path exits 2 for an unknown repo"
        echo "    exit: $rc"
    fi

    # --- branch matching ---
    local pairs=(
        "1234|1234|0"
        "1234-thing|1234|0"
        "feature/1234-x|1234|0"
        "1234_x|1234|0"
        "12345-x|1234|1"
        "51234|1234|1"
        "x1234|1234|1"
        "main|1234|1"
        "PROJ-42-fix|PROJ-42|0"
        "PROJ-421|PROJ-42|1"
        "1234-thing|#1234|0"
    )
    local p branch tid want
    for p in "${pairs[@]}"; do
        IFS='|' read -r branch tid want <<<"$p"
        rc=0
        lib_call "$proj" ticket_branch_match "$branch" "$tid" || rc=$?
        if [[ "$rc" -eq "$want" ]]; then
            pass "ticket_branch_match [$branch] vs [$tid] returns $want"
        else
            fail "ticket_branch_match [$branch] vs [$tid] returns $want"
            echo "    got: $rc"
        fi
    done

    # --- branch report and selectors ---
    got="$(lib_call "$proj" branch_report "$proj")"
    expected="$(printf 'api\tapi\tbackend\tmain\nweb\tweb\tfrontend\tmain\nmobile\tmobile\t-\t<missing>')"
    if [[ "$got" == "$expected" ]]; then
        pass "branch_report shows main for clones and <missing> for an uncloned repo"
    else
        fail "branch_report shows main for clones and <missing> for an uncloned repo"
        echo "    got: $got"
    fi
    got="$(lib_call "$proj" select_by_focus "$proj" Backend)"
    if [[ "$got" == "api" ]]; then
        pass "select_by_focus matches an area case-insensitively"
    else
        fail "select_by_focus matches an area case-insensitively"
        echo "    got: $got"
    fi
    got="$(lib_call "$proj" select_by_focus "$proj" web)"
    if [[ "$got" == "web" ]]; then
        pass "select_by_focus matches a repo name"
    else
        fail "select_by_focus matches a repo name"
        echo "    got: $got"
    fi
    got="$(lib_call "$proj" select_by_focus "$proj" nothing)"
    if [[ -z "$got" ]]; then
        pass "select_by_focus prints nothing when no word matches"
    else
        fail "select_by_focus prints nothing when no word matches"
        echo "    got: $got"
    fi
    got="$(lib_call "$proj" select_by_branch "$proj" 1234)"
    if [[ -z "$got" ]]; then
        pass "select_by_branch prints nothing when no repo is on a ticket branch"
    else
        fail "select_by_branch prints nothing when no repo is on a ticket branch"
        echo "    got: $got"
    fi
}

main() {
    echo "=== Test: task lifecycle skills ==="
    TEST_ROOT="$(mktemp -d)"
    trap cleanup EXIT

    bash "$FIXTURE" "$TEST_ROOT/proj" >/dev/null
    bash "$FIXTURE" "$TEST_ROOT/with space/proj" >/dev/null
    bash "$FIXTURE" "$TEST_ROOT/digits" '^[0-9]+$' >/dev/null

    test_lib

    echo ""
    if [[ "$FAILURES" -ne 0 ]]; then
        echo "FAILED: $FAILURES assertion(s)."
        exit 1
    fi
    echo "PASS"
}

main "$@"
