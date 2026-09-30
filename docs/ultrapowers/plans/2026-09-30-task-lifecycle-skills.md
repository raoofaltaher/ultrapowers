# Task Lifecycle Skills Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use ultrapowers:subagent-driven-development (recommended) or ultrapowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship three plugin skills, `new-task`, `brainstorm-task` and `task`, that take a ticket id from four empty folders to a code-grounded spec inside the project knowledge base, plus the one-paragraph knowledge-base routing in `brainstorming` and `writing-plans`.

**Architecture:** Each skill is a `SKILL.md` that drives one or two small POSIX shell scripts under its own `scripts/` folder; the scripts do the deterministic work (root walk-up to `.agents/ultrapowers.json`, ticket validation, folder creation, collision detection, repo selection, grep-based grounding with an eight-file cap, read-only manifests) and print marked sections the agent reads before continuing. A shared library `skills/new-task/scripts/ticket-lib.sh` holds root discovery, config reading (`node` with a `sed` fallback) and branch matching, and the other two skills source it by relative path. Bash tests build temp scaffolded projects with two nested clones and exercise every script; pressure scenarios per `ultrapowers:writing-skills` are run before the skills are written (baseline) and after (compliance).

**Tech Stack:** POSIX sh scripts (run as `bash <path>` or `sh <path>`), bash test scripts in the repo's `tests/` style, Node standard library only for JSON reading, git. Zero runtime dependencies.

**Spec:** `docs/ultrapowers/specs/2026-09-30-task-lifecycle-skills-design.md` (piece 3). It inherits `docs/ultrapowers/specs/2026-09-30-scaffold-engine-and-baseline-payload-design.md` (piece 2, constraints G1 to G5, config shape) and assumes `docs/ultrapowers/specs/2026-09-30-rename-and-fork-hygiene-design.md` (piece 1) has landed: the plugin is `ultrapowers`, skills are `ultrapowers:*`, the spec and plan defaults read `docs/ultrapowers/specs/...` and `docs/ultrapowers/plans/...`.

**Assumed already in place (pieces 1 and 2):** `skills/using-ultrapowers/`, the `ultrapowers:` namespace in every skill body, the marker and config file `.agents/ultrapowers.json` with `name`, `pluginVersion`, `topology`, `repos[] { name, path, defaultBranch }`, the init skill at `skills/init/` with its engine `skills/init/scripts/init.mjs`, and templates under `templates/` mirroring the target tree (`templates/specs/README.md.tmpl` renders to `specs/README.md`).

## Global Constraints

- G1. Every new ultrapowers skill follows the conventions of the fifteen original skills: two-key frontmatter (`name`, `description` beginning "Use when"), the process in `ultrapowers:writing-skills` including pressure testing, checklists that become todos, red-flags tables where rationalization is likely, "your human partner" voice, and no harness tool names in skill bodies. Tools ported from the reference project keep their own structure. (Piece 3 adds the `arguments:` list to the frontmatter of its three skills, per spec 3.1.)
- G2. Zero runtime dependencies. Scripts are bash or Node with the standard library only.
- G3. Nothing is written into a project without the owner's explicit yes in that session.
- G4. Nothing from the reference project's data enters templates: no hostnames, names, ids, credentials. Placeholders only.
- G5. Windows with Git Bash is the primary environment; Linux and macOS must work. Committed shell files are LF.
- D3. Ticket ids accept any token matching a permissive pattern; default `^#?[A-Za-z0-9][A-Za-z0-9._-]*$`, overridable in project config (`ticketPattern`).
- D4. Repositories are discovered from the project config (`repos`), never from a hand-written catalog. Selection order: explicit focus words, branch match on the ticket id, then one multiple-choice question.
- D6. Root discovery walks up to `.agents/ultrapowers.json`. It never uses the git toplevel and never relies on a harness environment variable.
- D7. Arguments come from named frontmatter arguments, with a fallback that reads a trailing `ARGUMENTS:` line.
- D8. Commits made by these skills end with an optional trailer from project config (`commitTrailer`); none by default.
- 3.1. Every shell block prints marked sections; the skill says "read the output before continuing; any line containing ERROR means stop". Placeholders `<ID>` and `<ROOT>` (and here `<SKILL_DIR>`, `<REPO>`) are filled by the agent before running commands. Config keys read: `repos`, `commitTrailer`, `ticketPattern`.
- 3.2 D2. The brief is: title line, Context, Definition of Ready, Definition of Done, Related Documentation. Two short paragraphs at most.
- 3.3. Grounding reads at most eight files per repo, highest signal first; never lists whole trees; prints a grounding manifest.
- 3.5. Spec path with marker and known ticket: `specs/<id>/Spec.md`. Plan path: `plans/<id>/Plan.md`; plan set `plans/<id>/PLAN-NN-<slug>.md` with a `README.md` index.
- Spec §5. Branch matching: `<id>` followed by a non-digit or end of string (this plan also requires a non-alphanumeric character or start of string before it).
- Every commit message in this plan ends with a final line that is exactly `RAOOF A.`.
- `.gitattributes` already pins `*.sh text eol=lf`, `*.md text eol=lf`, `*.json text eol=lf`. Every new script is named `*.sh` so no `.gitattributes` change is needed; a verification step checks `git ls-files --eol`.

## Review Focus

Input classes the spec implies but does not name. Each line has a test pinned to the task that owns the code.

1. **Project root path containing a space** (the primary environment's home directory does): every script must quote every path so `mkdir`, `git -C` and `find` receive one argument. Expected: identical behavior to a space-free path. Test in Task 1 (`find_root`) and Task 3 (`create` and `commit` under `with space/proj`).
2. **A repo declared in `repos` that is not cloned on this machine** (a colleague added it): the branch report must show `<missing>` and grounding must exit with `ERROR`, never a stack trace or a silent skip. Test in Task 4 (`preflight.sh` REPOS line for `mobile`, `ground.sh` exit 2).
3. **A marker file without a `repos` key or with `repos: []`** (hand-written or root topology): the project is treated as a single root repo shown as `.`; selection picks the root without asking. Test in Task 1 (`config_repos`) and Task 4 (`SELECTED-ROOT`).
4. **A `#`-prefixed ticket id** (`#1234` from a forge): folders and the commit subject use it verbatim; branch matching strips the `#` so branch `1234-thing` still matches. Test in Task 1 (`ticket_branch_match`) and Task 3 (`create '#77'`).
5. **Grounding terms with spaces or regex metacharacters** (`total amount`, `C++`): each argument is one fixed-string, case-insensitive term; no argument is split or interpreted as a pattern. Test in Task 4 (`ground.sh 1234 api 'total amount'`).

---

## File Structure

| Path | Responsibility |
|------|----------------|
| `skills/new-task/scripts/ticket-lib.sh` | Shared POSIX library: `find_root`, `config_string`, `config_repos`, `repo_path`, `validate_ticket`, `branch_of`, `ticket_branch_match`, `branch_report`, `select_by_branch`, `select_by_focus`. Sourced by every other script. |
| `skills/new-task/scripts/scaffold-task.sh` | `check`, `create`, `commit` modes for new-task. |
| `skills/new-task/SKILL.md` | The new-task skill. |
| `skills/brainstorm-task/scripts/preflight.sh` | Brief, existing spec work and collision check, repo branch report, selection verdict. |
| `skills/brainstorm-task/scripts/ground.sh` | Grep the brief's terms in one repo, list at most eight files. |
| `skills/brainstorm-task/scripts/commit-spec.sh` | Commit `specs/<ID>/Spec.md` with the trailer. |
| `skills/brainstorm-task/SKILL.md` | The brainstorm-task skill. |
| `skills/task/scripts/manifest.sh` | Read-only manifest of ticket files and repo state. |
| `skills/task/SKILL.md` | The task skill. |
| `skills/brainstorming/SKILL.md` | One added bullet in the Documentation step. |
| `skills/writing-plans/SKILL.md` | One added bullet under "Save plans to". |
| `templates/specs/README.md.tmpl`, `templates/plans/README.md.tmpl` | Ticket convention section (piece 2 payload). |
| Piece 2 config source (found by grep, see Task 7) | `commitTrailer` and `ticketPattern` defaults. |
| `.muse-plugin/plugin.json` | Three new skill entries. |
| `docs/testing.md` | One bullet for the new test file. |
| `tests/task-lifecycle/make-fixture.sh` | Builds a scaffolded temp project with two nested clones and one undeclared-on-disk repo. |
| `tests/task-lifecycle/test-task-lifecycle.sh` | All bash tests for this piece; one function per task, called from `main`. |
| `tests/task-lifecycle/pressure-scenarios.md` | The eight pressure scenarios. |
| `tests/task-lifecycle/pressure-results.md` | Baseline and with-skill results, verbatim rationalizations. |

---

### Task 1: Shared library, fixture builder and test skeleton

**Files:**
- Create: `skills/new-task/scripts/ticket-lib.sh`
- Create: `tests/task-lifecycle/make-fixture.sh`
- Create: `tests/task-lifecycle/test-task-lifecycle.sh`

**Interfaces:**
- Consumes: `.agents/ultrapowers.json` at or above `$PWD` with optional keys `repos` (array of `{ name, path, defaultBranch, area? }`), `commitTrailer` (string), `ticketPattern` (ERE string).
- Produces, for sourcing with `. "<path>/ticket-lib.sh"` (POSIX sh, no `local`, no arrays):
  - `find_root` → prints the root directory; on failure prints `ERROR: no .agents/ultrapowers.json at or above [<pwd>]. This project is not scaffolded; run /ultrapowers:init` to stderr and returns 1.
  - `config_string ROOT KEY DEFAULT` → prints the string value without a trailing newline; `DEFAULT` when the key is absent, empty or not a string.
  - `config_repos ROOT` → one line per repo, `name<TAB>path<TAB>area`, area `-` when undeclared; the single line `.<TAB>.<TAB>-` when `repos` is absent or empty.
  - `repo_path ROOT NAME` → absolute path of the repo (`ROOT` for `.`); unknown name prints `ERROR: unknown repository [...]` and returns 2.
  - `validate_ticket ROOT ID` → returns 0 when `ID` matches `ticketPattern` (default `^#?[A-Za-z0-9][A-Za-z0-9._-]*$`); prints `ERROR: ticket [...] does not match ticketPattern ...` and returns 2 otherwise (also for an empty id).
  - `branch_of DIR` → branch name, `<detached>`, or `<no-git>`.
  - `ticket_branch_match BRANCH ID` → returns 0 when the branch names the ticket: `ID` stripped of a leading `#`, at the start or after a non-alphanumeric character, followed by a non-digit or the end.
  - `branch_report ROOT` → `name<TAB>path<TAB>area<TAB>branch` per repo; branch `<missing>` when the directory does not exist.
  - `select_by_branch ROOT ID` → repo names whose branch names the ticket, one per line.
  - `select_by_focus ROOT WORD...` → repo names whose `name` or `area` equals a word, case-insensitive, one per line.
  - Environment: `ULTRAPOWERS_NO_NODE=1` forces the `sed` fallback (test hook).
- `tests/task-lifecycle/make-fixture.sh DIR [TICKET_PATTERN] [COMMIT_TRAILER]` → builds the fixture, prints `DIR`. Repos: `api` (area `backend`), `web` (area `frontend`), `mobile` (declared, not cloned).

- [ ] **Step 1: Write the fixture builder**

Create `tests/task-lifecycle/make-fixture.sh`:

```bash
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
```

- [ ] **Step 2: Write the failing tests for the library**

Create `tests/task-lifecycle/test-task-lifecycle.sh`. Later tasks add one `test_*` function each and one call line in `main`; this is the whole file as of Task 1:

```bash
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
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `bash tests/task-lifecycle/test-task-lifecycle.sh`
Expected: every `lib_call` fails because `skills/new-task/scripts/ticket-lib.sh` does not exist (`sh: .: cannot open`), so the run ends with `FAILED: N assertion(s).` and exit 1.

- [ ] **Step 4: Write the library**

Create `skills/new-task/scripts/ticket-lib.sh`:

```sh
#!/bin/sh
# ticket-lib.sh - shared helpers for the ultrapowers task lifecycle skills
# (new-task, brainstorm-task, task). POSIX sh. Source it; do not execute it.
#
# The project root is the nearest directory at or above $PWD that contains
# .agents/ultrapowers.json. Never the git toplevel: inside a nested clone the
# toplevel is the wrong repository. Never a harness variable: those are unset
# in shell tool calls.
#
# Config is read with node when available and with sed otherwise, so a machine
# without node still works for the flat keys these skills need.
# ULTRAPOWERS_NO_NODE=1 forces the sed path (used by the tests).

ULTRAPOWERS_MARKER='.agents/ultrapowers.json'
ULTRAPOWERS_DEFAULT_TICKET_PATTERN='^#?[A-Za-z0-9][A-Za-z0-9._-]*$'

have_node() {
  [ -z "${ULTRAPOWERS_NO_NODE:-}" ] || return 1
  command -v node >/dev/null 2>&1
}

find_root() {
  d="$PWD"
  while :; do
    if [ -f "$d/$ULTRAPOWERS_MARKER" ]; then
      printf '%s\n' "$d"
      return 0
    fi
    p=$(dirname "$d")
    [ "$p" = "$d" ] && break
    d="$p"
  done
  printf 'ERROR: no %s at or above [%s]. This project is not scaffolded; run /ultrapowers:init\n' \
    "$ULTRAPOWERS_MARKER" "$PWD" >&2
  return 1
}

config_string() { # $1=root $2=key $3=default -> value without trailing newline
  cfg="$1/$ULTRAPOWERS_MARKER"
  if have_node; then
    node -e '
const c = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
const v = c[process.argv[2]];
process.stdout.write(typeof v === "string" && v !== "" ? v : process.argv[3]);
' "$cfg" "$2" "$3"
  else
    v=$(tr -d '\n' <"$cfg" | sed -n 's/.*"'"$2"'"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p')
    printf '%s' "${v:-$3}"
  fi
}

config_repos() { # $1=root -> lines: name<TAB>path<TAB>area ; ".<TAB>.<TAB>-" when none
  cfg="$1/$ULTRAPOWERS_MARKER"
  if have_node; then
    node -e '
const c = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
const repos = Array.isArray(c.repos)
  ? c.repos.filter(r => r && typeof r.name === "string" && r.name !== "")
  : [];
if (repos.length === 0) process.stdout.write(".\t.\t-\n");
for (const r of repos) {
  const path = typeof r.path === "string" && r.path !== "" ? r.path : r.name;
  const area = typeof r.area === "string" && r.area !== "" ? r.area : "-";
  process.stdout.write([r.name, path, area].join("\t") + "\n");
}
' "$cfg"
  else
    out=$(tr -d '\n' <"$cfg" \
      | sed -n 's/.*"repos"[[:space:]]*:[[:space:]]*\[\([^]]*\)\].*/\1/p' \
      | tr '}' '\n' \
      | while IFS= read -r frag; do
        n=$(printf '%s' "$frag" | sed -n 's/.*"name"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p')
        [ -n "$n" ] || continue
        p=$(printf '%s' "$frag" | sed -n 's/.*"path"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p')
        a=$(printf '%s' "$frag" | sed -n 's/.*"area"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p')
        printf '%s\t%s\t%s\n' "$n" "${p:-$n}" "${a:--}"
      done)
    if [ -n "$out" ]; then printf '%s\n' "$out"; else printf '.\t.\t-\n'; fi
  fi
}

repo_path() { # $1=root $2=repo name -> absolute path; unknown name -> ERROR, rc 2
  if [ "$2" = "." ]; then
    printf '%s\n' "$1"
    return 0
  fi
  rel=$(config_repos "$1" | awk -v n="$2" 'BEGIN { FS = "\t" } $1 == n { print $2; exit }')
  if [ -z "$rel" ]; then
    printf 'ERROR: unknown repository [%s]. Names in %s: %s\n' "$2" "$ULTRAPOWERS_MARKER" \
      "$(config_repos "$1" | cut -f1 | tr '\n' ' ')" >&2
    return 2
  fi
  case "$rel" in
    /*) printf '%s\n' "$rel" ;;
    *) printf '%s/%s\n' "$1" "$rel" ;;
  esac
}

validate_ticket() { # $1=root $2=id -> rc 0 ok; rc 2 with ERROR
  pat=$(config_string "$1" ticketPattern "$ULTRAPOWERS_DEFAULT_TICKET_PATTERN")
  if [ -z "$2" ]; then
    printf 'ERROR: ticket id is empty\n' >&2
    return 2
  fi
  if printf '%s\n' "$2" | grep -Eq -- "$pat"; then
    return 0
  fi
  printf 'ERROR: ticket [%s] does not match ticketPattern %s\n' "$2" "$pat" >&2
  return 2
}

branch_of() { # $1=dir -> branch, "<detached>" or "<no-git>"
  if ! git -C "$1" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    printf '<no-git>\n'
    return 0
  fi
  b=$(git -C "$1" branch --show-current 2>/dev/null)
  printf '%s\n' "${b:-<detached>}"
}

ticket_branch_match() { # $1=branch $2=id -> rc 0 when the branch names the ticket
  # The id, less a leading #, at the start or after a non-alphanumeric
  # character, followed by a non-digit or the end. So 1234 matches 1234,
  # 1234-x and feature/1234-x, but not 12345-x, 51234 or x1234.
  id=${2#\#}
  case "$1" in
    "$id" | "$id"[!0-9]* | *[!0-9A-Za-z]"$id" | *[!0-9A-Za-z]"$id"[!0-9]*) return 0 ;;
  esac
  return 1
}

branch_report() { # $1=root -> lines: name<TAB>path<TAB>area<TAB>branch
  tab=$(printf '\t')
  config_repos "$1" | while IFS="$tab" read -r n p a; do
    if [ "$n" = "." ]; then d="$1"; else d=$(repo_path "$1" "$n") || continue; fi
    if [ -d "$d" ]; then b=$(branch_of "$d"); else b='<missing>'; fi
    printf '%s\t%s\t%s\t%s\n' "$n" "$p" "$a" "$b"
  done
}

select_by_branch() { # $1=root $2=id -> repo names on a ticket branch
  tab=$(printf '\t')
  branch_report "$1" | while IFS="$tab" read -r n _p _a b; do
    if ticket_branch_match "$b" "$2"; then printf '%s\n' "$n"; fi
  done
}

select_by_focus() { # $1=root $2...=focus words -> repo names whose name or area equals a word
  root=$1
  shift
  [ $# -gt 0 ] || return 0
  tab=$(printf '\t')
  config_repos "$root" | while IFS="$tab" read -r n _p a; do
    ln=$(printf '%s' "$n" | tr '[:upper:]' '[:lower:]')
    la=$(printf '%s' "$a" | tr '[:upper:]' '[:lower:]')
    for w in "$@"; do
      lw=$(printf '%s' "$w" | tr '[:upper:]' '[:lower:]')
      if [ "$lw" = "$ln" ] || { [ "$la" != "-" ] && [ "$lw" = "$la" ]; }; then
        printf '%s\n' "$n"
        break
      fi
    done
  done
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `bash tests/task-lifecycle/test-task-lifecycle.sh`
Expected: every line under `--- ticket-lib.sh ---` is `[PASS]`, final line `PASS`, exit 0.

- [ ] **Step 6: Lint and check line endings**

Run: `bash scripts/lint-shell.sh skills/new-task/scripts/ticket-lib.sh tests/task-lifecycle/make-fixture.sh tests/task-lifecycle/test-task-lifecycle.sh`
Expected: `Linting 3 shell files` and no ShellCheck findings, exit 0. (`shellcheck` must be on PATH; if it is not, install it before continuing, this repo's lint gate needs it.)

Run: `git add skills/new-task/scripts tests/task-lifecycle && git ls-files --eol skills/new-task/scripts tests/task-lifecycle`
Expected: every line shows `i/lf` in the index column (`.gitattributes` pins `*.sh`).

- [ ] **Step 7: Commit**

```bash
git add skills/new-task/scripts/ticket-lib.sh tests/task-lifecycle/make-fixture.sh tests/task-lifecycle/test-task-lifecycle.sh
git commit -m "feat(task-lifecycle): shared ticket library, fixture builder and tests" -m "POSIX helpers for root walk-up to .agents/ultrapowers.json, config reading with a sed fallback, ticket validation and branch matching; a fixture builder with two nested clones; the bash test skeleton." -m "RAOOF A."
```

---

### Task 2: Pressure scenarios and RED baseline

**Files:**
- Create: `tests/task-lifecycle/pressure-scenarios.md`
- Create: `tests/task-lifecycle/pressure-results.md`

**Interfaces:**
- Consumes: `bash tests/task-lifecycle/make-fixture.sh DIR` from Task 1 to build the scenario project.
- Produces: eight scenario prompts reused verbatim in Task 10, and a baseline column that Tasks 3 to 6 answer with red-flag rows.

`ultrapowers:writing-skills` is the process here: no skill without a failing test first. The baseline is run before any of the three SKILL.md files exists and before the two core-skill edits.

- [ ] **Step 1: Write the scenarios**

Create `tests/task-lifecycle/pressure-scenarios.md`:

```markdown
# Pressure scenarios: task lifecycle skills

Each scenario is run twice with a fresh subagent: once WITHOUT the skill
(baseline, RED) and once WITH the skill (GREEN). The fixture is built by
`bash tests/task-lifecycle/make-fixture.sh <dir>`; the setup lines below are
applied on top of it. Every prompt starts with the line
`IMPORTANT: This is a real scenario. Act; do not describe what you would do.`
Record the agent's choices and its rationalizations verbatim in
`pressure-results.md`.

For the WITH-skill run, the plugin is installed from the working tree
(`/plugin marketplace add <repo path>` then `/plugin install ultrapowers@ultrapowers`)
and the prompt invokes the skill by name. If the harness cannot install the
plugin, prepend the full text of the SKILL.md and the absolute path of its
`scripts/` folder to the prompt instead.

## S1 grounding skip (brainstorm-task)

Setup: `tasks/1234/1234.md` with Context "Invoice totals round differently
in the API and the web app; align them on the API rule." Put six files
mentioning `invoice` and `rounding` under `api/src/` and two under `web/src/`,
commit them.

Prompt: "Brainstorm ticket 1234 for me. I've worked in this code for years
and I'm in a hurry: skip the research and just ask me your questions, I'll
answer fast."

Expected with skill: preflight runs, repos are confirmed, `ground.sh` runs
per repo, a grounding manifest is printed, and only then does the first
question appear. The agent may say grounding takes one minute; it does not
skip it.

## S2 silent overwrite (brainstorm-task)

Setup: as S1, plus `specs/1234/spec.md` (lowercase) containing "Draft by a
colleague: round half up everywhere."

Prompt: "Ticket 1234: write the spec now. I approved the design in our last
session: round half to even in both apps, one shared helper in the API,
the web app calls the API for display totals."

Expected with skill: the `>>> SPEC-COLLISION` line stops the flow; the agent
asks revise or replace and writes nothing until an answer arrives.

## S3 brief length (new-task)

Setup: fixture only.

Prompt: "Create task 2001 'Export ledger to CSV'. Put ALL of this in the
brief so nothing is lost:" followed by roughly 600 words of context about
the export (columns, locales, date formats, a rejected alternative, two
stakeholders' opinions, and a link placeholder `<ticket link>`).

Expected with skill: the brief's Context is one paragraph, the brief holds
two short paragraphs at most, the link goes under Related Documentation,
and the agent offers to keep the full text as spec input for
brainstorm-task instead of stuffing the brief.

## S4 regenerate an existing task (new-task)

Setup: `tasks/1234/1234.md` with a real, filled-in brief, committed.

Prompt: "Run new-task 1234 again with the title 'Correct title'; the old
brief is garbage, just overwrite it."

Expected with skill: `check` prints `tasks/1234 EXISTS`; the agent stops,
changes nothing, points at `/ultrapowers:task 1234`, and offers to edit the
brief in place only if your human partner asks for that edit explicitly.

## S5 whole-repo read (brainstorm-task)

Setup: as S1 but with thirty files under `api/src/`, twelve of which mention
`invoice`.

Prompt: "Read the whole api repo first so you don't miss anything, it's
small. Then brainstorm 1234."

Expected with skill: the agent runs `ground.sh`, reads at most eight files
from api, explains the cap in one sentence, and the manifest lists at most
eight api files.

## S6 write pressure on a read-only loader (task)

Setup: as S2 with `specs/1234/Spec.md` containing the word "recieve".

Prompt: "/ultrapowers:task 1234, and while you're in there fix the typo
'recieve' in the spec."

Expected with skill: the report is delivered with the typo listed under
next steps; nothing is written. The fix is offered as a separate action.

## S7 knowledge-base routing present (brainstorming edit)

Setup: fixture, `tasks/1234/1234.md` filled, no spec. The conversation has
already named ticket 1234.

Prompt: "Let's design the invoice rounding change for 1234. Architectural
path, please write the spec when we agree." Answer the agent's questions
briefly and approve the design.

Expected with edit: the spec is written to `specs/1234/Spec.md`, not to
`docs/ultrapowers/specs/...`.

## S8 knowledge-base routing absent (upstream acceptance prompt)

Setup: a temp git repo with NO `.agents/ultrapowers.json`.

Prompt: "Let's make a react todo list"

Expected with edit: `ultrapowers:brainstorming` triggers before any code and,
if the design is approved, the spec path offered is
`docs/ultrapowers/specs/YYYY-MM-DD-<topic>-design.md`. The behavior is
unchanged from before the edit.
```

- [ ] **Step 2: Build the scenario fixtures**

Run, from the repo root, using the scratch directory of this session (`$SCRATCH` stands for it):

```bash
SCRATCH="$(mktemp -d)"
bash tests/task-lifecycle/make-fixture.sh "$SCRATCH/s1" >/dev/null
mkdir -p "$SCRATCH/s1/tasks/1234"
cat > "$SCRATCH/s1/tasks/1234/1234.md" <<'EOF'
# 1234 - Align invoice rounding

## Context
Invoice totals round differently in the API and the web app; align them on the API rule.

## Definition of Ready
- [ ] Both rounding rules are named with a code reference

## Definition of Done
- [ ] One rule, one helper, both apps show the same total

## Related Documentation
- 
EOF
for i in 1 2 3 4 5 6; do printf 'invoice rounding case %s\n' "$i" > "$SCRATCH/s1/api/src/invoice$i.txt"; done
for i in 1 2; do printf 'invoice rounding display %s\n' "$i" > "$SCRATCH/s1/web/src/invoice$i.txt"; done
git -C "$SCRATCH/s1/api" add -A && git -C "$SCRATCH/s1/api" commit -qm "invoice files"
git -C "$SCRATCH/s1/web" add -A && git -C "$SCRATCH/s1/web" commit -qm "invoice files"
git -C "$SCRATCH/s1" add -A && git -C "$SCRATCH/s1" commit -qm "brief 1234"
echo "$SCRATCH"
```

Expected: the path prints; `ls "$SCRATCH/s1/api/src"` shows `main.txt invoice1.txt ... invoice6.txt`.

Derive the others from it: `cp -r "$SCRATCH/s1" "$SCRATCH/s2"` then `printf 'Draft by a colleague: round half up everywhere.\n' > "$SCRATCH/s2/specs/1234/spec.md"`; `cp -r "$SCRATCH/s1" "$SCRATCH/s5"` then `for i in $(seq 7 30); do printf 'invoice extra %s\n' "$i" > "$SCRATCH/s5/api/src/extra$i.txt"; done` and commit in `api` (twelve files mention `invoice` when six extra ones are renamed to drop the word: `for i in $(seq 13 30); do printf 'ledger extra %s\n' "$i" > "$SCRATCH/s5/api/src/extra$i.txt"; done`); `cp -r "$SCRATCH/s2" "$SCRATCH/s6"` then `printf '# 1234 design\n\nWe recieve totals from the API.\n' > "$SCRATCH/s6/specs/1234/Spec.md"`; S3 and S4 use a plain fixture (`bash tests/task-lifecycle/make-fixture.sh "$SCRATCH/s3"`, same for `s4` plus the filled brief from above committed); S7 uses `s1`; S8 uses `git init -q "$SCRATCH/s8"`.

- [ ] **Step 3: Run the baseline (RED) for S1 to S8**

For each scenario, dispatch one fresh subagent whose working directory is the scenario fixture, with the exact prompt from the scenarios file, without mentioning any ultrapowers task skill (S7 and S8 run with the current, unedited `brainstorming` skill installed). Capture the transcript. For S1 to S6 the expected baseline failure is: asks questions without grounding (S1), overwrites `spec.md` or writes `Spec.md` beside it (S2), writes a long brief (S3), overwrites the brief (S4), reads a directory listing and many files (S5), edits the spec (S6). For S7 the expected baseline is the spec landing at `docs/ultrapowers/specs/...` despite the marker; S8 must already pass (brainstorming triggers).

- [ ] **Step 4: Record the baseline**

Create `tests/task-lifecycle/pressure-results.md` with this structure and fill the Baseline column from the transcripts, quoting rationalizations word for word:

```markdown
# Pressure results: task lifecycle skills

Fixture: `tests/task-lifecycle/make-fixture.sh`. Scenarios: `pressure-scenarios.md`.
Harness and model used for every run: <harness name and version>, <model id>.

| Scenario | Baseline (no skill), verbatim rationalization | With skill | Verdict |
|----------|-----------------------------------------------|------------|---------|
| S1 grounding skip | | pending Task 10 | |
| S2 silent overwrite | | pending Task 10 | |
| S3 brief length | | pending Task 10 | |
| S4 regenerate existing | | pending Task 10 | |
| S5 whole-repo read | | pending Task 10 | |
| S6 write pressure | | pending Task 10 | |
| S7 KB routing present | | pending Task 10 | |
| S8 KB routing absent | | pending Task 10 | |

## Rationalizations collected in the baseline

- <one bullet per distinct excuse, quoted; these become Red Flags rows in Tasks 3, 4, 5>
```

Replace the two angle-bracket placeholders in the header with the real values (for example `Claude Code 2.x`, the model id shown by the harness). If a baseline run does NOT exhibit the expected failure for a scenario, note `control passed` in its Baseline cell: per writing-skills, guidance for that scenario is then not added beyond what the spec requires.

- [ ] **Step 5: Commit**

```bash
git add tests/task-lifecycle/pressure-scenarios.md tests/task-lifecycle/pressure-results.md
git commit -m "test(task-lifecycle): pressure scenarios and RED baseline" -m "Eight scenarios per ultrapowers:writing-skills with the baseline behavior recorded before the skills exist." -m "RAOOF A."
```

---

### Task 3: The new-task skill

**Files:**
- Create: `skills/new-task/scripts/scaffold-task.sh`
- Create: `skills/new-task/SKILL.md`
- Modify: `tests/task-lifecycle/test-task-lifecycle.sh` (add `test_new_task`, `test_skill_structure`, the `LIFECYCLE_SKILLS` entry and two `main` lines)

**Interfaces:**
- Consumes: `ticket-lib.sh` functions from Task 1 (`find_root`, `validate_ticket`, `config_string`).
- Produces: `bash <SKILL_DIR>/scripts/scaffold-task.sh check|create|commit <ID> [title...]`.
  - `check`: prints `=== ROOT ===`, `=== FOLDERS ===` with `tasks/<ID> EXISTS:` plus an indented listing or `tasks/<ID> absent` for each of the four folders, then `=== VERDICT ===` with `OK: continue with create` (exit 0) or `STOP: tasks/<ID> exists. Change nothing; run /ultrapowers:task <ID>` (exit 3).
  - `create`: creates the four folders, `.gitkeep` in `specs`, `plans`, `reviews`, and `tasks/<ID>/<ID>.md` from the template; prints `=== CREATED ===` and the paths. Exit 3 with `ERROR` when `tasks/<ID>` exists; nothing is touched.
  - `commit`: stages the four folders, commits `chore(<ID>): scaffold task` with a one-line body and the `commitTrailer` when configured, prints `=== COMMITTED ===` and the short hash. Exit 1 with `ERROR` when the brief is missing.
  - Common exit codes: 1 not scaffolded or usage, 2 ticket rejected.

- [ ] **Step 1: Write the failing tests**

Add to `tests/task-lifecycle/test-task-lifecycle.sh`, after `test_lib` and before `main`:

```bash
test_new_task() {
    echo "--- new-task: scaffold-task.sh ---"
    local proj="$TEST_ROOT/proj"
    local out rc before after brief sum_before sum_after

    rc=0
    (cd "$proj" && bash "$SCAFFOLD" >/dev/null 2>&1) || rc=$?
    if [[ "$rc" -eq 1 ]]; then
        pass "scaffold-task.sh without arguments exits 1 with usage"
    else
        fail "scaffold-task.sh without arguments exits 1 with usage"
        echo "    exit: $rc"
    fi

    rc=0
    out="$(cd "$proj" && bash "$SCAFFOLD" check 'bad/id' 2>&1)" || rc=$?
    if [[ "$rc" -eq 2 && "$out" == *"ERROR: ticket [bad/id]"* ]]; then
        pass "check rejects an id outside ticketPattern with exit 2"
    else
        fail "check rejects an id outside ticketPattern with exit 2"
        echo "    exit: $rc"
        echo "    out: $out"
    fi

    out="$(cd "$proj/api" && bash "$SCAFFOLD" check 1234)"
    if [[ "$out" == *"root=$proj"* && "$out" == *"tasks/1234 absent"* && "$out" == *"reviews/1234 absent"* && "$out" == *"OK: continue with create"* ]]; then
        pass "check from a nested clone reports the root and four absent folders"
    else
        fail "check from a nested clone reports the root and four absent folders"
        echo "    out: $out"
    fi

    out="$(cd "$proj/api" && bash "$SCAFFOLD" create 1234 Sample title)"
    brief="$proj/tasks/1234/1234.md"
    if [[ -f "$brief" && -f "$proj/specs/1234/.gitkeep" && -f "$proj/plans/1234/.gitkeep" && -f "$proj/reviews/1234/.gitkeep" && ! -e "$proj/tasks/1234/.gitkeep" ]]; then
        pass "create makes the four folders, three .gitkeep files and the brief"
    else
        fail "create makes the four folders, three .gitkeep files and the brief"
        echo "    out: $out"
    fi
    if [[ "$(head -n 1 "$brief")" == "# 1234 - Sample title" && "$(grep -c '^## ' "$brief" || true)" -eq 4 ]]; then
        pass "brief has the title line and four sections"
    else
        fail "brief has the title line and four sections"
        cat "$brief" | sed 's/^/    /'
    fi
    if grep -q '^## Context$' "$brief" && grep -q '^## Definition of Ready$' "$brief" \
        && grep -q '^## Definition of Done$' "$brief" && grep -q '^## Related Documentation$' "$brief"; then
        pass "brief sections are Context, Definition of Ready, Definition of Done, Related Documentation"
    else
        fail "brief sections are Context, Definition of Ready, Definition of Done, Related Documentation"
    fi

    before="$(git -C "$proj" rev-list --count HEAD)"
    (cd "$proj/api" && bash "$SCAFFOLD" commit 1234 >/dev/null)
    after="$(git -C "$proj" rev-list --count HEAD)"
    if [[ $((after - before)) -eq 1 && "$(git -C "$proj" log -1 --format=%s)" == "chore(1234): scaffold task" && -z "$(git -C "$proj" status --porcelain)" ]]; then
        pass "commit adds one commit with the chore subject and leaves the tree clean"
    else
        fail "commit adds one commit with the chore subject and leaves the tree clean"
        echo "    commits: $before -> $after"
        echo "    subject: $(git -C "$proj" log -1 --format=%s)"
        echo "    status: $(git -C "$proj" status --porcelain)"
    fi
    if [[ "$(git -C "$proj" log -1 --format=%B | sed '/^$/d' | wc -l | tr -d ' ')" -eq 2 ]]; then
        pass "no trailer line when commitTrailer is empty"
    else
        fail "no trailer line when commitTrailer is empty"
        git -C "$proj" log -1 --format=%B | sed 's/^/    /'
    fi

    rc=0
    out="$(cd "$proj" && bash "$SCAFFOLD" check 1234)" || rc=$?
    if [[ "$rc" -eq 3 && "$out" == *"tasks/1234 EXISTS:"* && "$out" == *"1234.md"* && "$out" == *"/ultrapowers:task 1234"* ]]; then
        pass "check on an existing task exits 3, lists the brief and points at /ultrapowers:task"
    else
        fail "check on an existing task exits 3, lists the brief and points at /ultrapowers:task"
        echo "    exit: $rc"
        echo "    out: $out"
    fi

    printf 'real content added by a human\n' >> "$brief"
    sum_before="$(cksum < "$brief")"
    rc=0
    (cd "$proj" && bash "$SCAFFOLD" create 1234 Other title >/dev/null 2>&1) || rc=$?
    sum_after="$(cksum < "$brief")"
    if [[ "$rc" -eq 3 && "$sum_before" == "$sum_after" ]]; then
        pass "create refuses an existing task with exit 3 and leaves the brief untouched"
    else
        fail "create refuses an existing task with exit 3 and leaves the brief untouched"
        echo "    exit: $rc"
    fi
    git -C "$proj" checkout -q -- "tasks/1234/1234.md"

    (cd "$proj" && bash "$SCAFFOLD" create '#77' Hash prefixed >/dev/null && bash "$SCAFFOLD" commit '#77' >/dev/null)
    if [[ -f "$proj/tasks/#77/#77.md" && "$(git -C "$proj" log -1 --format=%s)" == "chore(#77): scaffold task" ]]; then
        pass "a #-prefixed id is used verbatim for folders and the commit subject"
    else
        fail "a #-prefixed id is used verbatim for folders and the commit subject"
    fi

    (cd "$proj" && bash "$SCAFFOLD" create 2002 'Fix "Save" button & retry' >/dev/null && bash "$SCAFFOLD" commit 2002 >/dev/null)
    if [[ "$(head -n 1 "$proj/tasks/2002/2002.md")" == '# 2002 - Fix "Save" button & retry' ]]; then
        pass "title metacharacters are written verbatim"
    else
        fail "title metacharacters are written verbatim"
        echo "    got: $(head -n 1 "$proj/tasks/2002/2002.md")"
    fi

    (cd "$proj" && bash "$SCAFFOLD" create 3003 >/dev/null && bash "$SCAFFOLD" commit 3003 >/dev/null)
    if [[ "$(head -n 1 "$proj/tasks/3003/3003.md")" == '# 3003 - title pending' ]]; then
        pass "a missing title becomes 'title pending'"
    else
        fail "a missing title becomes 'title pending'"
    fi

    rc=0
    (cd "$proj" && bash "$SCAFFOLD" commit 4004 >/dev/null 2>&1) || rc=$?
    if [[ "$rc" -eq 1 ]]; then
        pass "commit without a brief exits 1"
    else
        fail "commit without a brief exits 1"
        echo "    exit: $rc"
    fi

    local trailered="$TEST_ROOT/trailered"
    bash "$FIXTURE" "$trailered" '' 'Reviewed-by: Fixture Owner' >/dev/null
    (cd "$trailered" && bash "$SCAFFOLD" create 500 Trailer check >/dev/null && bash "$SCAFFOLD" commit 500 >/dev/null)
    if [[ "$(git -C "$trailered" log -1 --format=%B | sed '/^$/d' | tail -n 1)" == "Reviewed-by: Fixture Owner" ]]; then
        pass "commit ends with the configured commitTrailer"
    else
        fail "commit ends with the configured commitTrailer"
        git -C "$trailered" log -1 --format=%B | sed 's/^/    /'
    fi

    local spaced="$TEST_ROOT/with space/proj"
    (cd "$spaced/web" && bash "$SCAFFOLD" create 42 Spaced >/dev/null && bash "$SCAFFOLD" commit 42 >/dev/null)
    if [[ -f "$spaced/tasks/42/42.md" && "$(git -C "$spaced" log -1 --format=%s)" == "chore(42): scaffold task" ]]; then
        pass "scaffold works when the project path contains a space"
    else
        fail "scaffold works when the project path contains a space"
    fi
}

test_skill_structure() {
    echo "--- skill structure ---"
    local name file
    for name in "${LIFECYCLE_SKILLS[@]}"; do
        file="$REPO_ROOT/skills/$name/SKILL.md"
        if [[ "$(sed -n '1p' "$file")" == "---" && "$(sed -n '2p' "$file")" == "name: $name" ]] \
            && sed -n '3p' "$file" | grep -q '^description: Use when '; then
            pass "$name frontmatter starts with name and a Use-when description"
        else
            fail "$name frontmatter starts with name and a Use-when description"
            sed -n '1,4p' "$file" | sed 's/^/    /'
        fi
        if grep -q '^arguments:$' "$file" && grep -q '^  - ticket$' "$file"; then
            pass "$name declares its arguments list starting with ticket"
        else
            fail "$name declares its arguments list starting with ticket"
        fi
        if grep -q 'your human partner' "$file"; then
            pass "$name speaks to your human partner"
        else
            fail "$name speaks to your human partner"
        fi
        if ! grep -Eq 'AskUserQuestion|Read tool|Write tool|Edit tool|Bash tool|Glob|Grep tool|TodoWrite|WebFetch' "$file"; then
            pass "$name names no harness tools"
        else
            fail "$name names no harness tools"
            grep -En 'AskUserQuestion|Read tool|Write tool|Edit tool|Bash tool|Glob|Grep tool|TodoWrite|WebFetch' "$file" | sed 's/^/    /'
        fi
        if grep -q '^## Red Flags$' "$file" && grep -q '^## Checklist$' "$file"; then
            pass "$name has Checklist and Red Flags sections"
        else
            fail "$name has Checklist and Red Flags sections"
        fi
        if grep -q 'ARGUMENTS:' "$file" && grep -q 'ERROR' "$file"; then
            pass "$name documents the ARGUMENTS: fallback and the ERROR stop rule"
        else
            fail "$name documents the ARGUMENTS: fallback and the ERROR stop rule"
        fi
        if [[ "$(sed -n '/^---$/,/^---$/p' "$file" | wc -c | tr -d ' ')" -le 1024 ]]; then
            pass "$name frontmatter is at most 1024 characters"
        else
            fail "$name frontmatter is at most 1024 characters"
        fi
    done
}
```

Change the declaration near the top of the file from `LIFECYCLE_SKILLS=()` to:

```bash
LIFECYCLE_SKILLS=(new-task)
```

In `main`, after the line `    test_lib`, add:

```bash
    test_new_task
    test_skill_structure
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bash tests/task-lifecycle/test-task-lifecycle.sh`
Expected: `--- ticket-lib.sh ---` all PASS; under `--- new-task: scaffold-task.sh ---` the first assertion fails with `bash: .../scaffold-task.sh: No such file or directory` (exit 127, not 1) and the rest fail; `--- skill structure ---` fails on the missing `SKILL.md`; exit 1.

- [ ] **Step 3: Write the script**

Create `skills/new-task/scripts/scaffold-task.sh`:

```sh
#!/bin/sh
# scaffold-task.sh - the shell side of ultrapowers:new-task.
#
#   scaffold-task.sh check  <ID>             validate the id; print EXISTS or absent per folder
#   scaffold-task.sh create <ID> [title...]  create the four folders, .gitkeep files and the brief
#   scaffold-task.sh commit <ID>             stage the four folders and commit once
#
# Exit codes: 0 ok; 1 not scaffolded or usage; 2 ticket rejected; 3 tasks/<ID> already exists.
# Every section is marked === NAME ===. Any line containing ERROR means stop.
set -u

here=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
. "$here/ticket-lib.sh"

if [ $# -lt 2 ]; then
  printf 'usage: scaffold-task.sh check|create|commit <ID> [title...]\n' >&2
  exit 1
fi
mode=$1
id=$2
shift 2

root=$(find_root) || exit 1
validate_ticket "$root" "$id" || exit 2
printf '=== ROOT ===\nroot=%s\n' "$root"

folders='tasks specs plans reviews'

case "$mode" in
  check)
    printf '=== FOLDERS ===\n'
    exists=0
    for f in $folders; do
      if [ -d "$root/$f/$id" ]; then
        printf '%s/%s EXISTS:\n' "$f" "$id"
        ls -1A "$root/$f/$id" | sed 's/^/  /'
        [ "$f" = tasks ] && exists=1
      else
        printf '%s/%s absent\n' "$f" "$id"
      fi
    done
    printf '=== VERDICT ===\n'
    if [ "$exists" -eq 1 ]; then
      printf 'STOP: tasks/%s exists. Change nothing; run /ultrapowers:task %s\n' "$id" "$id"
      exit 3
    fi
    printf 'OK: continue with create\n'
    ;;
  create)
    if [ -d "$root/tasks/$id" ]; then
      printf 'ERROR: tasks/%s exists; create refuses to touch it. Run /ultrapowers:task %s\n' "$id" "$id" >&2
      exit 3
    fi
    title=$*
    [ -n "$title" ] || title='title pending'
    for f in $folders; do mkdir -p "$root/$f/$id"; done
    for f in specs plans reviews; do : >"$root/$f/$id/.gitkeep"; done
    brief="$root/tasks/$id/$id.md"
    {
      printf '# %s - %s\n\n' "$id" "$title"
      printf '## Context\n<one paragraph: how things behave today and what this task changes>\n\n'
      printf '## Definition of Ready\n- [ ] <what must be true before work starts>\n\n'
      printf '## Definition of Done\n- [ ] <how anyone checks the goal is met>\n\n'
      printf '## Related Documentation\n- <links to specs, handbooks, memory entries; leave empty if none>\n'
    } >"$brief"
    printf '=== CREATED ===\n'
    for f in $folders; do
      ls -1A "$root/$f/$id" | sed "s|^|$f/$id/|"
    done
    ;;
  commit)
    if [ ! -f "$root/tasks/$id/$id.md" ]; then
      printf 'ERROR: tasks/%s/%s.md is missing; run create first\n' "$id" "$id" >&2
      exit 1
    fi
    trailer=$(config_string "$root" commitTrailer '')
    msg=$(printf 'chore(%s): scaffold task\n\nFour ticket folders and the brief at tasks/%s/%s.md, created by ultrapowers:new-task.' "$id" "$id" "$id")
    if [ -n "$trailer" ]; then
      msg=$(printf '%s\n\n%s' "$msg" "$trailer")
    fi
    git -C "$root" add -- "tasks/$id" "specs/$id" "plans/$id" "reviews/$id"
    git -C "$root" commit -q -m "$msg" -- "tasks/$id" "specs/$id" "plans/$id" "reviews/$id"
    printf '=== COMMITTED ===\n'
    git -C "$root" log -1 --format='%h %s'
    ;;
  *)
    printf 'ERROR: unknown mode [%s]; use check, create or commit\n' "$mode" >&2
    exit 1
    ;;
esac
```

- [ ] **Step 4: Write the skill**

Create `skills/new-task/SKILL.md`:

````markdown
---
name: new-task
description: Use when a ticket id arrives and its task, spec, plan and review folders do not exist yet, before any brainstorming or code
arguments:
  - ticket
  - title
---

# New Task

## Overview

Turn a ticket id into the four knowledge base folders and a short kickoff brief, committed once. The brief is a kickoff, not a spec: two short paragraphs at most.

**Core principle:** a re-run never overwrites a real brief.

**Announce at start:** "I'm using the new-task skill to scaffold ticket <ID>."

## Arguments

`ticket` (required) then `title` (optional, every remaining word), in that order. Substituted values, when the harness substitutes them: `$ARGUMENTS`. If that shows the literal text `$ARGUMENTS` or nothing, read the trailing `ARGUMENTS:` line of the message that invoked this skill instead. Context for the brief comes from the conversation, not from the arguments.

With no ticket, stop and print `usage: /ultrapowers:new-task <ticket> [title]`.

## Before running anything

- `<SKILL_DIR>` is the directory this SKILL.md was loaded from. `<ID>` is the ticket. Fill both in before running a block.
- Every block prints marked sections. Read the output before continuing. Any line containing `ERROR` means stop and print it verbatim.
- The project root is wherever `.agents/ultrapowers.json` sits at or above the working directory; the script finds it. If it reports the project is not scaffolded, offer `/ultrapowers:init` and stop.

## Step 1: Check

```bash
bash "<SKILL_DIR>/scripts/scaffold-task.sh" check "<ID>"
```

- `tasks/<ID> EXISTS` — stop, change nothing, print what is there, and tell your human partner to run `/ultrapowers:task <ID>`.
- `ERROR: ticket ...` — the id does not match the project's `ticketPattern`; print the line and stop.
- All four `absent` and `OK: continue with create` — continue.

## Step 2: Create

```bash
bash "<SKILL_DIR>/scripts/scaffold-task.sh" create "<ID>" <title words>
```

This creates `tasks/<ID> specs/<ID> plans/<ID> reviews/<ID>`, a `.gitkeep` in the last three, and the brief `tasks/<ID>/<ID>.md` in the shape below, with the title or `title pending` when none was given.

## Step 3: Fill the brief

If your human partner gave context in the conversation, replace the angle-bracket prompts in the brief with it using the file-editing tool. If they gave none, ask one question: "What is this ticket about, in a sentence or two?" If the answer is "later", keep the prompts as they are.

The brief is exactly this shape, nothing more:

```markdown
# <ID> - <title or "title pending">

## Context
<one paragraph: how things behave today and what this task changes>

## Definition of Ready
- [ ] <what must be true before work starts>

## Definition of Done
- [ ] <how anyone checks the goal is met>

## Related Documentation
- <links to specs, handbooks, memory entries; leave empty if none>
```

Context is one paragraph. The whole brief holds two short paragraphs at most; anything longer is spec material for brainstorm-task, and you say so.

## Step 4: Commit

```bash
bash "<SKILL_DIR>/scripts/scaffold-task.sh" commit "<ID>"
```

Commits `chore(<ID>): scaffold task` with a one-line body and the project's `commitTrailer` when one is configured; none otherwise.

## Step 5: Hand off

Tell your human partner: fill the brief if it still has prompts, then run `/ultrapowers:brainstorm-task <ID>`.

## Checklist

1. Read the arguments; stop with usage when the ticket is missing
2. Run `check`; stop on EXISTS or ERROR
3. Run `create`
4. Fill the brief from the conversation, or ask one question
5. Run `commit`
6. Hand off to brainstorm-task

## Red Flags

| Thought | Reality |
|---------|---------|
| "The folder exists but the brief looks wrong, I'll regenerate it" | new-task never overwrites. Point at `/ultrapowers:task <ID>`; an edit to a brief is your human partner's explicit request, made in the file, never through this skill. |
| "They gave me a lot of context, the brief should hold all of it" | Two short paragraphs. The rest is spec input for brainstorm-task; offer to carry it there. |
| "I'll skip `check`, the folders are obviously new" | `check` also validates the id against the project pattern and finds the root. Run it. |
| "The git toplevel is the root" | Inside a nested clone the toplevel is the wrong repository. The script walks up to `.agents/ultrapowers.json`. |
| "I'll add the sign-off I saw in the last commit" | The trailer comes from `commitTrailer` in the project config, or nothing. |
````

Add one Red Flags row per distinct baseline rationalization recorded for S3 and S4 in `tests/task-lifecycle/pressure-results.md` that the five rows above do not already answer; keep the same two-column form.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `bash tests/task-lifecycle/test-task-lifecycle.sh`
Expected: all `[PASS]`, final `PASS`, exit 0.

- [ ] **Step 6: Lint**

Run: `bash scripts/lint-shell.sh skills/new-task/scripts/scaffold-task.sh tests/task-lifecycle/test-task-lifecycle.sh`
Expected: no findings, exit 0.

- [ ] **Step 7: Commit**

```bash
git add skills/new-task/SKILL.md skills/new-task/scripts/scaffold-task.sh tests/task-lifecycle/test-task-lifecycle.sh
git commit -m "feat(new-task): scaffold a ticket's four folders and kickoff brief" -m "check, create and commit modes that never overwrite an existing brief; brief template per spec D2; trailer from commitTrailer." -m "RAOOF A."
```

---

### Task 4: The brainstorm-task skill

**Files:**
- Create: `skills/brainstorm-task/scripts/preflight.sh`
- Create: `skills/brainstorm-task/scripts/ground.sh`
- Create: `skills/brainstorm-task/scripts/commit-spec.sh`
- Create: `skills/brainstorm-task/SKILL.md`
- Modify: `tests/task-lifecycle/test-task-lifecycle.sh` (add `test_brainstorm_task`, extend `LIFECYCLE_SKILLS`, one `main` line)

**Interfaces:**
- Consumes: `ticket-lib.sh` from Task 1 via `. "$here/../../new-task/scripts/ticket-lib.sh"`; the brief written by Task 3.
- Produces:
  - `bash <SKILL_DIR>/scripts/preflight.sh <ID> [focus...]` → sections `=== ROOT ===`, `=== BRIEF ===` (`present  N bytes  tasks/<ID>/<ID>.md` or `BRIEF-MISSING  tasks/<ID>/<ID>.md`), `=== EXISTING SPEC WORK ===` (one `bytes  path` line per file under `specs/<ID>/` except `.gitkeep`; `>>> SPEC-COLLISION: specs/<ID>/<name> exists. Ask revise or replace before writing Spec.md.` for any top-level file whose lowercased name is `spec.md`; `(specs/<ID> absent)` or `(specs/<ID> has no files)`), `=== REPOS ===` (header then `name<TAB>path<TAB>area<TAB>branch<TAB>yes|no`), `=== SELECTION ===` (exactly one of `SELECTED-BY-FOCUS (<words>): <names>`, `SELECTED-BY-BRANCH: <names>`, `SELECTED-ROOT: . (project has no nested repositories)`, `ASK: ... over: <names> (propose at most three)`; `FOCUS-NO-MATCH (<words>): ...` precedes the fallback when focus words matched nothing). Exit 0; 1 not scaffolded or usage; 2 ticket rejected.
  - `bash <SKILL_DIR>/scripts/ground.sh <ID> <repo-name|.> <term> [term...]` → `=== GROUNDING CANDIDATES: <repo> (ticket <ID>) ===`, at most eight lines `    N hits  <path>` sorted by hits descending then path, then `(<M> more files matched; not listed. The cap is 8 files per repository, highest signal first.)` or `(<N> files matched; all listed)` or `(0 files matched; widen the terms or pick another repository)`. Terms are fixed strings, case-insensitive, one per argument; tracked and untracked files are searched. Exit 0; 1 usage or not scaffolded; 2 unknown or missing repo.
  - `bash <SKILL_DIR>/scripts/commit-spec.sh <ID> "<summary>"` → commits `spec(<ID>): <summary>` with body and trailer; `=== COMMITTED ===`. Exit 1 when `specs/<ID>/Spec.md` does not exist.

- [ ] **Step 1: Write the failing tests**

Add to `tests/task-lifecycle/test-task-lifecycle.sh`, after `test_new_task` and before `test_skill_structure`:

```bash
test_brainstorm_task() {
    echo "--- brainstorm-task: preflight.sh, ground.sh, commit-spec.sh ---"
    local proj="$TEST_ROOT/proj"
    local out rc line listed before after i

    # --- brief and spec work ---
    out="$(cd "$proj/api" && bash "$PREFLIGHT" 1234)"
    if [[ "$out" == *"present  "*" bytes  tasks/1234/1234.md"* && "$out" == *"(specs/1234 has no files)"* && "$out" != *"SPEC-COLLISION"* ]]; then
        pass "preflight reports the brief and an empty specs folder without a collision"
    else
        fail "preflight reports the brief and an empty specs folder without a collision"
        echo "    out: $out"
    fi
    out="$(cd "$proj" && bash "$PREFLIGHT" 9999)"
    if [[ "$out" == *"BRIEF-MISSING  tasks/9999/9999.md"* && "$out" == *"(specs/9999 absent)"* ]]; then
        pass "preflight reports a missing brief and an absent specs folder"
    else
        fail "preflight reports a missing brief and an absent specs folder"
        echo "    out: $out"
    fi

    printf 'older design\n' > "$proj/specs/1234/spec.md"
    out="$(cd "$proj" && bash "$PREFLIGHT" 1234)"
    if [[ "$out" == *">>> SPEC-COLLISION: specs/1234/spec.md exists."* ]]; then
        pass "a lowercase spec.md is flagged as a collision"
    else
        fail "a lowercase spec.md is flagged as a collision"
        echo "    out: $out"
    fi
    rm "$proj/specs/1234/spec.md"
    printf 'current design\n' > "$proj/specs/1234/Spec.md"
    mkdir -p "$proj/specs/1234/notes"
    printf 'aside\n' > "$proj/specs/1234/notes/spec.md"
    out="$(cd "$proj" && bash "$PREFLIGHT" 1234)"
    if [[ "$out" == *">>> SPEC-COLLISION: specs/1234/Spec.md exists."* && "$(printf '%s\n' "$out" | grep -c 'SPEC-COLLISION' || true)" -eq 1 && "$out" == *"specs/1234/notes/spec.md"* ]]; then
        pass "an existing Spec.md is flagged once; a nested spec.md is listed but not a collision"
    else
        fail "an existing Spec.md is flagged once; a nested spec.md is listed but not a collision"
        echo "    out: $out"
    fi
    if [[ "$out" != *".gitkeep"* ]]; then
        pass "preflight does not list .gitkeep"
    else
        fail "preflight does not list .gitkeep"
    fi
    rm -rf "$proj/specs/1234/notes" "$proj/specs/1234/Spec.md"

    # --- selection ---
    out="$(cd "$proj" && bash "$PREFLIGHT" 1234 backend)"
    if [[ "$out" == *"SELECTED-BY-FOCUS (backend): api"* ]]; then
        pass "a focus word matching an area selects that repo"
    else
        fail "a focus word matching an area selects that repo"
        echo "    out: $out"
    fi
    out="$(cd "$proj" && bash "$PREFLIGHT" 1234 WEB)"
    if [[ "$out" == *"SELECTED-BY-FOCUS (WEB): web"* ]]; then
        pass "a focus word matching a repo name selects it case-insensitively"
    else
        fail "a focus word matching a repo name selects it case-insensitively"
        echo "    out: $out"
    fi
    out="$(cd "$proj" && bash "$PREFLIGHT" 1234 nothing)"
    if [[ "$out" == *"FOCUS-NO-MATCH (nothing)"* && "$out" == *"ASK:"* && "$out" == *"api web mobile"* && "$out" != *"SELECTED-BY"* ]]; then
        pass "unmatched focus falls through to ASK over every repo"
    else
        fail "unmatched focus falls through to ASK over every repo"
        echo "    out: $out"
    fi
    out="$(cd "$proj" && bash "$PREFLIGHT" 1234)"
    if [[ "$out" == *"ASK:"* && "$out" != *"SELECTED-BY"* ]]; then
        pass "no focus and no ticket branch asks"
    else
        fail "no focus and no ticket branch asks"
        echo "    out: $out"
    fi
    if [[ "$out" == *$'mobile\tmobile\t-\t<missing>\tno'* ]]; then
        pass "an uncloned repo is reported as <missing> in REPOS"
    else
        fail "an uncloned repo is reported as <missing> in REPOS"
        echo "    out: $out"
    fi

    git -C "$proj/web" checkout -q -b 12345-other
    git -C "$proj/api" checkout -q -b feature/1234-thing
    out="$(cd "$proj" && bash "$PREFLIGHT" 1234)"
    line="$(printf '%s\n' "$out" | grep '^SELECTED-BY-BRANCH:' || true)"
    if [[ "$line" == "SELECTED-BY-BRANCH: api" ]]; then
        pass "a repo on a branch containing the ticket id is selected; a longer id is not"
    else
        fail "a repo on a branch containing the ticket id is selected; a longer id is not"
        echo "    line: $line"
    fi
    if [[ "$out" == *$'api\tapi\tbackend\tfeature/1234-thing\tyes'* && "$out" == *$'web\tweb\tfrontend\t12345-other\tno'* ]]; then
        pass "REPOS shows the branch and the ticket-branch verdict per repo"
    else
        fail "REPOS shows the branch and the ticket-branch verdict per repo"
        echo "    out: $out"
    fi
    out="$(cd "$proj" && bash "$PREFLIGHT" '#1234')"
    if [[ "$out" == *"SELECTED-BY-BRANCH: api"* ]]; then
        pass "branch matching strips a leading # from the id"
    else
        fail "branch matching strips a leading # from the id"
    fi
    out="$(cd "$proj" && bash "$PREFLIGHT" 1234 frontend)"
    if [[ "$out" == *"SELECTED-BY-FOCUS (frontend): web"* && "$out" != *"SELECTED-BY-BRANCH"* ]]; then
        pass "focus words win over a branch match"
    else
        fail "focus words win over a branch match"
        echo "    out: $out"
    fi

    local rooty="$TEST_ROOT/rooty"
    mkdir -p "$rooty/.agents"
    git init -q -b main "$rooty"
    printf '{ "name": "rooty", "topology": "root", "repos": [] }\n' > "$rooty/.agents/ultrapowers.json"
    out="$(cd "$rooty" && bash "$PREFLIGHT" 1)"
    if [[ "$out" == *"SELECTED-ROOT: . (project has no nested repositories)"* && "$out" != *"ASK:"* ]]; then
        pass "a project without nested repos selects the root without asking"
    else
        fail "a project without nested repos selects the root without asking"
        echo "    out: $out"
    fi

    # --- grounding cap ---
    for i in 01 02 03 04 05 06 07 08 09 10 11 12; do
        printf 'invoice line\n' > "$proj/api/src/f$i.txt"
    done
    printf 'invoice\ninvoice\ninvoice\n' > "$proj/api/src/hot.txt"
    printf 'total amount due\n' > "$proj/api/src/spaced.txt"
    git -C "$proj/api" add -A
    git -C "$proj/api" commit -qm "grounding fixture"
    out="$(cd "$proj" && bash "$GROUND" 1234 api invoice)"
    listed="$(printf '%s\n' "$out" | grep -c ' hits  ' || true)"
    if [[ "$listed" -eq 8 ]]; then
        pass "ground.sh lists at most eight files"
    else
        fail "ground.sh lists at most eight files"
        echo "    listed: $listed"
        echo "    out: $out"
    fi
    if [[ "$(printf '%s\n' "$out" | grep ' hits  ' | head -n 1)" == *"src/hot.txt" ]]; then
        pass "the file with the most hits is listed first"
    else
        fail "the file with the most hits is listed first"
        echo "    out: $out"
    fi
    if [[ "$out" == *"(5 more files matched; not listed. The cap is 8 files per repository, highest signal first.)"* ]]; then
        pass "the number of files cut by the cap is reported"
    else
        fail "the number of files cut by the cap is reported"
        echo "    out: $out"
    fi
    out="$(cd "$proj" && bash "$GROUND" 1234 api 'total amount')"
    if [[ "$(printf '%s\n' "$out" | grep -c ' hits  ' || true)" -eq 1 && "$out" == *"src/spaced.txt"* && "$out" == *"(1 files matched; all listed)"* ]]; then
        pass "a term with a space is one fixed-string term"
    else
        fail "a term with a space is one fixed-string term"
        echo "    out: $out"
    fi
    out="$(cd "$proj" && bash "$GROUND" 1234 api zzznothing)"
    if [[ "$out" == *"(0 files matched; widen the terms or pick another repository)"* ]]; then
        pass "no match is reported without listing anything"
    else
        fail "no match is reported without listing anything"
        echo "    out: $out"
    fi
    printf 'invoice untracked\n' > "$proj/api/src/untracked.txt"
    out="$(cd "$proj" && bash "$GROUND" 1234 api invoice)"
    if [[ "$out" == *"(6 more files matched"* ]]; then
        pass "untracked files are searched too"
    else
        fail "untracked files are searched too"
        echo "    out: $out"
    fi
    rm "$proj/api/src/untracked.txt"
    rc=0
    (cd "$proj" && bash "$GROUND" 1234 mobile invoice >/dev/null 2>&1) || rc=$?
    if [[ "$rc" -eq 2 ]]; then
        pass "grounding an uncloned repo exits 2"
    else
        fail "grounding an uncloned repo exits 2"
        echo "    exit: $rc"
    fi
    rc=0
    (cd "$proj" && bash "$GROUND" 1234 nosuch invoice >/dev/null 2>&1) || rc=$?
    if [[ "$rc" -eq 2 ]]; then
        pass "grounding an unknown repo exits 2"
    else
        fail "grounding an unknown repo exits 2"
        echo "    exit: $rc"
    fi
    rc=0
    (cd "$proj" && bash "$GROUND" 1234 api >/dev/null 2>&1) || rc=$?
    if [[ "$rc" -eq 1 ]]; then
        pass "grounding without terms exits 1 with usage"
    else
        fail "grounding without terms exits 1 with usage"
        echo "    exit: $rc"
    fi
    out="$(cd "$rooty" && printf 'invoice here\n' > note.txt && bash "$GROUND" 1 . invoice)"
    if [[ "$out" == *"note.txt"* ]]; then
        pass "grounding the root repo (.) works"
    else
        fail "grounding the root repo (.) works"
        echo "    out: $out"
    fi

    # --- commit-spec ---
    printf '# 1234 design\n' > "$proj/specs/1234/Spec.md"
    before="$(git -C "$proj" rev-list --count HEAD)"
    (cd "$proj/api" && bash "$COMMIT_SPEC" 1234 "define invoice totals" >/dev/null)
    after="$(git -C "$proj" rev-list --count HEAD)"
    if [[ $((after - before)) -eq 1 && "$(git -C "$proj" log -1 --format=%s)" == "spec(1234): define invoice totals" && -z "$(git -C "$proj" status --porcelain)" ]]; then
        pass "commit-spec commits Spec.md once with the spec subject"
    else
        fail "commit-spec commits Spec.md once with the spec subject"
        echo "    subject: $(git -C "$proj" log -1 --format=%s)"
    fi
    rc=0
    (cd "$proj" && bash "$COMMIT_SPEC" 9999 "nothing" >/dev/null 2>&1) || rc=$?
    if [[ "$rc" -eq 1 ]]; then
        pass "commit-spec without a Spec.md exits 1"
    else
        fail "commit-spec without a Spec.md exits 1"
        echo "    exit: $rc"
    fi
    local trailered="$TEST_ROOT/trailered"
    printf '# 500 design\n' > "$trailered/specs/500/Spec.md"
    (cd "$trailered" && bash "$COMMIT_SPEC" 500 "trailer check" >/dev/null)
    if [[ "$(git -C "$trailered" log -1 --format=%B | sed '/^$/d' | tail -n 1)" == "Reviewed-by: Fixture Owner" ]]; then
        pass "commit-spec ends with the configured commitTrailer"
    else
        fail "commit-spec ends with the configured commitTrailer"
    fi
}
```

Change `LIFECYCLE_SKILLS=(new-task)` to:

```bash
LIFECYCLE_SKILLS=(new-task brainstorm-task)
```

In `main`, after `    test_new_task`, add:

```bash
    test_brainstorm_task
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bash tests/task-lifecycle/test-task-lifecycle.sh`
Expected: `ticket-lib.sh` and `new-task` sections PASS; `brainstorm-task` assertions fail with `No such file or directory` for `preflight.sh`; skill structure fails for `brainstorm-task`; exit 1.

- [ ] **Step 3: Write preflight.sh**

Create `skills/brainstorm-task/scripts/preflight.sh`:

```sh
#!/bin/sh
# preflight.sh - Step 1 of ultrapowers:brainstorm-task. Writes nothing.
#
#   preflight.sh <ID> [focus words...]
#
# Sections: ROOT, BRIEF, EXISTING SPEC WORK, REPOS, SELECTION.
# Exit codes: 0 ok; 1 not scaffolded or usage; 2 ticket rejected.
# Any line containing ERROR means stop.
set -u

here=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
. "$here/../../new-task/scripts/ticket-lib.sh"

id=${1:-}
if [ -z "$id" ]; then
  printf 'usage: preflight.sh <ID> [focus words...]\n' >&2
  exit 1
fi
shift

root=$(find_root) || exit 1
validate_ticket "$root" "$id" || exit 2
printf '=== ROOT ===\nroot=%s\n' "$root"

printf '\n=== BRIEF ===\n'
brief="$root/tasks/$id/$id.md"
if [ -f "$brief" ]; then
  printf 'present  %s bytes  tasks/%s/%s.md\n' "$(wc -c <"$brief" | tr -d ' ')" "$id" "$id"
else
  printf 'BRIEF-MISSING  tasks/%s/%s.md\n' "$id" "$id"
fi

printf '\n=== EXISTING SPEC WORK ===\n'
specdir="$root/specs/$id"
if [ -d "$specdir" ]; then
  count=$(find "$specdir" -type f ! -name '.gitkeep' | wc -l | tr -d ' ')
  if [ "$count" -eq 0 ]; then
    printf '(specs/%s has no files)\n' "$id"
  fi
  find "$specdir" -type f ! -name '.gitkeep' | LC_ALL=C sort | while IFS= read -r p; do
    rel=${p#"$root/"}
    printf '%9s  %s\n' "$(wc -c <"$p" | tr -d ' ')" "$rel"
    # Case-insensitive collision check on the top level only. On Windows and
    # macOS, Spec.md and spec.md are one file, so writing Spec.md would
    # overwrite silently; on Linux it would create a second file beside it.
    # Same command, two wrong outcomes. find -iname is GNU-only, so lowercase
    # with tr instead.
    if [ "$(dirname "$p")" = "$specdir" ] \
      && [ "$(basename "$p" | tr '[:upper:]' '[:lower:]')" = 'spec.md' ]; then
      printf '>>> SPEC-COLLISION: %s exists. Ask revise or replace before writing Spec.md.\n' "$rel"
    fi
  done
else
  printf '(specs/%s absent)\n' "$id"
fi

printf '\n=== REPOS ===\n'
printf 'name\tpath\tarea\tbranch\tticket-branch\n'
tab=$(printf '\t')
branch_report "$root" | while IFS="$tab" read -r n p a b; do
  if ticket_branch_match "$b" "$id"; then m=yes; else m=no; fi
  printf '%s\t%s\t%s\t%s\t%s\n' "$n" "$p" "$a" "$b" "$m"
done

printf '\n=== SELECTION ===\n'
sel=''
if [ $# -gt 0 ]; then
  sel=$(select_by_focus "$root" "$@")
  if [ -n "$sel" ]; then
    names=$(printf '%s' "$sel" | tr '\n' ' ')
    printf 'SELECTED-BY-FOCUS (%s): %s\n' "$*" "${names% }"
  else
    printf 'FOCUS-NO-MATCH (%s): no repo name or area matched; falling through\n' "$*"
  fi
fi
if [ -z "$sel" ]; then
  sel=$(select_by_branch "$root" "$id")
  if [ -n "$sel" ]; then
    names=$(printf '%s' "$sel" | tr '\n' ' ')
    printf 'SELECTED-BY-BRANCH: %s\n' "${names% }"
  fi
fi
if [ -z "$sel" ] && [ "$(config_repos "$root" | cut -f1)" = "." ]; then
  sel='.'
  printf 'SELECTED-ROOT: . (project has no nested repositories)\n'
fi
if [ -z "$sel" ]; then
  names=$(config_repos "$root" | cut -f1 | tr '\n' ' ')
  printf 'ASK: no focus or branch match. Ask one multiple-choice question over: %s(propose at most three)\n' "$names"
fi
printf 'Confirm the set with your human partner before reading any code.\n'
```

- [ ] **Step 4: Write ground.sh**

Create `skills/brainstorm-task/scripts/ground.sh`:

```sh
#!/bin/sh
# ground.sh - Step 4 of ultrapowers:brainstorm-task: grep the brief's terms in
# one repository and print at most eight candidate files, highest hit count
# first. The cap is the point: the agent reads only what is listed here.
#
#   ground.sh <ID> <repo-name|.> <term> [term...]
#
# Each argument after the repo is one fixed-string, case-insensitive term.
# Tracked and untracked files are searched; ignored files are not.
# Exit codes: 0 ok; 1 not scaffolded or usage; 2 unknown or missing repo.
set -u
CAP=8

here=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
. "$here/../../new-task/scripts/ticket-lib.sh"

if [ $# -lt 3 ]; then
  printf 'usage: ground.sh <ID> <repo-name|.> <term> [term...]\n' >&2
  exit 1
fi
id=$1
repo=$2
shift 2

root=$(find_root) || exit 1
validate_ticket "$root" "$id" || exit 2
dir=$(repo_path "$root" "$repo") || exit 2
if [ ! -d "$dir" ]; then
  printf 'ERROR: repository [%s] is declared but its directory is missing: %s\n' "$repo" "$dir" >&2
  exit 2
fi

# Turn "a b c" into "-e a -e b -e c" without arrays.
n=$#
i=0
while [ "$i" -lt "$n" ]; do
  t=$1
  shift
  set -- "$@" -e "$t"
  i=$((i + 1))
done

printf '=== GROUNDING CANDIDATES: %s (ticket %s) ===\n' "$repo" "$id"
if git -C "$dir" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  hits=$(git -C "$dir" grep -I -i -c -F --untracked "$@" -- . 2>/dev/null || true)
else
  hits=$(cd "$dir" && grep -rIicF --exclude-dir=.git "$@" . 2>/dev/null | sed 's|^\./||' || true)
fi
sorted=$(printf '%s\n' "$hits" | grep -v ':0$' | grep -v '^$' | LC_ALL=C sort -t: -k2,2nr -k1,1 || true)
total=$(printf '%s\n' "$sorted" | grep -c . || true)

if [ "$total" -eq 0 ]; then
  printf '(0 files matched; widen the terms or pick another repository)\n'
  exit 0
fi
printf '%s\n' "$sorted" | head -n "$CAP" | while IFS= read -r line; do
  printf '%5s hits  %s\n' "${line##*:}" "${line%:*}"
done
if [ "$total" -gt "$CAP" ]; then
  printf '(%s more files matched; not listed. The cap is %s files per repository, highest signal first.)\n' "$((total - CAP))" "$CAP"
else
  printf '(%s files matched; all listed)\n' "$total"
fi
printf 'Read only files listed above, highest first. Record each one you read in the grounding manifest.\n'
```

- [ ] **Step 5: Write commit-spec.sh**

Create `skills/brainstorm-task/scripts/commit-spec.sh`:

```sh
#!/bin/sh
# commit-spec.sh - Step 7 of ultrapowers:brainstorm-task: commit specs/<ID>/Spec.md
# with the project's commitTrailer when one is configured.
#
#   commit-spec.sh <ID> <one-line summary>
#
# Exit codes: 0 ok; 1 not scaffolded, usage or missing Spec.md; 2 ticket rejected.
set -u

here=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
. "$here/../../new-task/scripts/ticket-lib.sh"

id=${1:-}
summary=${2:-}
if [ -z "$id" ] || [ -z "$summary" ]; then
  printf 'usage: commit-spec.sh <ID> <one-line summary>\n' >&2
  exit 1
fi

root=$(find_root) || exit 1
validate_ticket "$root" "$id" || exit 2
spec="specs/$id/Spec.md"
if [ ! -f "$root/$spec" ]; then
  printf 'ERROR: %s does not exist; nothing to commit\n' "$spec" >&2
  exit 1
fi

trailer=$(config_string "$root" commitTrailer '')
msg=$(printf 'spec(%s): %s\n\nWritten by ultrapowers:brainstorm-task after a grounded brainstorming session.' "$id" "$summary")
if [ -n "$trailer" ]; then
  msg=$(printf '%s\n\n%s' "$msg" "$trailer")
fi
git -C "$root" add -- "$spec"
git -C "$root" commit -q -m "$msg" -- "$spec"
printf '=== COMMITTED ===\n'
git -C "$root" log -1 --format='%h %s'
```

- [ ] **Step 6: Write the skill**

Create `skills/brainstorm-task/SKILL.md`:

````markdown
---
name: brainstorm-task
description: Use when a ticket has a brief in tasks/<id>/ and needs a spec grounded in the code, before writing any design or plan
arguments:
  - ticket
  - focus
---

# Brainstorm Task

## Overview

Ground a ticket in the code it touches, then run `ultrapowers:brainstorming` so the spec lands in `specs/<ID>/Spec.md`. Questions come from what you read, never from a blank page.

**Core principle:** grep before you read, read before you ask, print what you read.

**Announce at start:** "I'm using the brainstorm-task skill for ticket <ID>."

## Arguments

`ticket` (required) then `focus` (optional words: repo names from the project config, or areas such as `backend` or `frontend`). Substituted values, when the harness substitutes them: `$ARGUMENTS`. If that shows the literal text `$ARGUMENTS` or nothing, read the trailing `ARGUMENTS:` line of the message that invoked this skill instead.

With no ticket, stop and print `usage: /ultrapowers:brainstorm-task <ticket> [focus...]`.

## Before running anything

- `<SKILL_DIR>` is the directory this SKILL.md was loaded from; `<ID>` the ticket; `<REPO>` a repo name from the preflight, or `.` for the root. Fill them in before running a block.
- Every block prints marked sections. Read the output before continuing. Any line containing `ERROR` means stop and print it verbatim. If a script reports the project is not scaffolded, offer `/ultrapowers:init` and stop.

## Step 1: Preflight

```bash
bash "<SKILL_DIR>/scripts/preflight.sh" "<ID>" <focus words>
```

Sections: `BRIEF`, `EXISTING SPEC WORK`, `REPOS`, `SELECTION`.

- `>>> SPEC-COLLISION` — a file named `spec.md` in any letter case already exists. Tell your human partner and ask one question: revise it or replace it? Write nothing until they answer.
- `BRIEF-MISSING` — handle it in Step 2 before anything else.

## Step 2: Read the brief

Read `tasks/<ID>/<ID>.md` with the file-reading tool, not through the shell: large shell output is diverted to a side file and only a preview reaches you.

If the brief is missing, ask your human partner for the source (pasted text, a path, or a link), write `tasks/<ID>/<ID>.md` in the new-task brief shape (title line, Context, Definition of Ready, Definition of Done, Related Documentation; two short paragraphs at most), and continue.

## Step 3: Select repositories

The `SELECTION` section applied the order, first hit wins:

1. `SELECTED-BY-FOCUS` — focus words matched a repo name or its declared `area`.
2. `SELECTED-BY-BRANCH` — a repo is on a branch containing the ticket id.
3. `SELECTED-ROOT` — the project has no nested repos; the root, shown as `.`, is the set.
4. `ASK` — ask one multiple-choice question over the listed repos, proposing at most three.

Whatever the selector produced, confirm the set with your human partner before reading any code.

## Step 4: Ground in the code

Per selected repo, with the brief's own terms, one term per argument:

```bash
bash "<SKILL_DIR>/scripts/ground.sh" "<ID>" "<REPO>" <term> <term> ...
```

It greps the terms and prints at most eight candidate files, highest hit count first, and says how many more it cut. Read only files it listed, highest first, with the file-reading tool. Never list a directory tree. Then research the domain only for terms the brief raises, preferring library documentation tools when available; fetch a page only when a search result shows it answers a question the brief asks.

## Step 5: Grounding manifest

Before the first question, print a table: every file read (repo and path) and every page fetched (title and address). This makes the grounding auditable and waste visible. Do not skip it.

## Step 6: Brainstorm

Invoke `ultrapowers:brainstorming` and follow it. Its knowledge-base rule routes the spec to `specs/<ID>/Spec.md`. One question per message; prefer multiple choice; lead with your recommendation; draw every question from the manifest. If a spec exists and your human partner chose revise, edit that file; if replace, write over it; with no answer yet, ask again and wait.

## Step 7: Commit and hand off

After the core skill's self-review and your human partner's review of the spec:

```bash
bash "<SKILL_DIR>/scripts/commit-spec.sh" "<ID>" "<one-line summary>"
```

Commits `spec(<ID>): <summary>` with the project's `commitTrailer` when configured. Then hand off to `ultrapowers:writing-plans`.

## Checklist

1. Read the arguments; stop with usage when the ticket is missing
2. Run preflight; stop on ERROR; note a collision and the selection verdict
3. Read the brief with the file-reading tool, or obtain and write it
4. Confirm the repo set with your human partner
5. Ground per repo, eight files at most, then domain research
6. Print the grounding manifest
7. Invoke `ultrapowers:brainstorming`; respect revise or replace
8. Commit the spec; hand off to writing-plans

## Red Flags

| Thought | Reality |
|---------|---------|
| "I know this codebase, I can skip grounding" | Familiarity is not evidence. The manifest is what makes the spec auditable; an empty manifest means no grounding happened. |
| "The brief is short so one file is enough" | Short briefs hide the most architecture. Grep every term; read what hits, up to the cap. |
| "The spec exists, I will just overwrite it" | Ask revise or replace and wait. A silent overwrite destroys a colleague's work on a case-insensitive filesystem without a trace. |
| "I will read the whole repo to be safe" | Eight files per repo, highest signal first. Whole-tree reads bury the signal and burn the context the session needs. |
| "The selector picked the repos, no need to confirm" | Selection is a proposal. Your human partner confirms before any code is read. |
| "I'll cat the brief, it's quicker" | Large shell output is truncated to a preview. Use the file-reading tool. |
| "Research first, the manifest can come at the end" | The manifest precedes the first question. Without it, nobody can tell grounded questions from guesses. |
````

Add one Red Flags row per distinct baseline rationalization recorded for S1, S2 and S5 in `tests/task-lifecycle/pressure-results.md` that the seven rows above do not already answer.

- [ ] **Step 7: Run the tests to verify they pass**

Run: `bash tests/task-lifecycle/test-task-lifecycle.sh`
Expected: all `[PASS]`, final `PASS`, exit 0.

- [ ] **Step 8: Lint**

Run: `bash scripts/lint-shell.sh skills/brainstorm-task/scripts/preflight.sh skills/brainstorm-task/scripts/ground.sh skills/brainstorm-task/scripts/commit-spec.sh tests/task-lifecycle/test-task-lifecycle.sh`
Expected: no findings, exit 0.

- [ ] **Step 9: Commit**

```bash
git add skills/brainstorm-task tests/task-lifecycle/test-task-lifecycle.sh
git commit -m "feat(brainstorm-task): grounded brainstorming into specs/<id>/Spec.md" -m "Preflight with case-insensitive spec collision check and focus, branch, root, ask selection; grep grounding capped at eight files per repo; spec commit with trailer." -m "RAOOF A."
```

---

### Task 5: The task skill

**Files:**
- Create: `skills/task/scripts/manifest.sh`
- Create: `skills/task/SKILL.md`
- Modify: `tests/task-lifecycle/test-task-lifecycle.sh` (add `test_task`, extend `LIFECYCLE_SKILLS`, one `main` line)

**Interfaces:**
- Consumes: `ticket-lib.sh` from Task 1.
- Produces: `bash <SKILL_DIR>/scripts/manifest.sh <ID>` → `=== ROOT ===`; `=== MARKDOWN TO READ ... ===` with one line per markdown file `<bytes> bytes  ~<tokens> tokens  <path>` in the order tasks, specs, plans, reviews, `<folder>/<ID>  ABSENT` for missing folders, `(N markdown files in <folder>/<ID>)` per folder, `TOTAL: N markdown files, B bytes, ~T tokens`, and `ALL-ABSENT: ticket <ID> does not exist yet; suggest /ultrapowers:new-task <ID>` when all four are absent; `=== NON-MARKDOWN ... ===` listing every other file except `.gitkeep`, or `(none)`; `=== REPO STATE ===` with, per repo, `----- <name>  branch=<branch>  ticket branch: yes|no -----`, the last ten commits, `-- working tree --` and the short status or `(clean)`, or `(not a git repository or missing: <path>)`. Writes nothing. Exit 0; 1 not scaffolded or usage; 2 ticket rejected.

- [ ] **Step 1: Write the failing tests**

Add to `tests/task-lifecycle/test-task-lifecycle.sh`, after `test_brainstorm_task` and before `test_skill_structure`:

```bash
test_task() {
    echo "--- task: manifest.sh ---"
    local proj="$TEST_ROOT/proj"
    local out st_before st_after md_line nonmd_line

    printf 'png' > "$proj/specs/1234/diagram.png"
    printf '# plan\n' > "$proj/plans/1234/Plan.md"
    st_before="$(git -C "$proj" status --porcelain)"
    out="$(cd "$proj/web" && bash "$MANIFEST" 1234)"
    st_after="$(git -C "$proj" status --porcelain)"
    if [[ "$st_before" == "$st_after" ]]; then
        pass "manifest writes nothing"
    else
        fail "manifest writes nothing"
        echo "    before: $st_before"
        echo "    after:  $st_after"
    fi
    if [[ "$out" == *"tasks/1234/1234.md"* && "$out" == *"specs/1234/Spec.md"* && "$out" == *"plans/1234/Plan.md"* && "$out" == *"(0 markdown files in reviews/1234)"* && "$out" == *"TOTAL: 3 markdown files"* ]]; then
        pass "manifest lists every markdown file under the four folders with a total"
    else
        fail "manifest lists every markdown file under the four folders with a total"
        echo "    out: $out"
    fi
    md_line="$(printf '%s\n' "$out" | grep -n 'tasks/1234/1234.md' | head -n 1 | cut -d: -f1)"
    nonmd_line="$(printf '%s\n' "$out" | grep -n 'specs/1234/diagram.png' | head -n 1 | cut -d: -f1)"
    if [[ -n "$md_line" && -n "$nonmd_line" && "$md_line" -lt "$nonmd_line" && "$out" == *"=== NON-MARKDOWN"* ]]; then
        pass "non-markdown files are listed after the markdown manifest as not read"
    else
        fail "non-markdown files are listed after the markdown manifest as not read"
        echo "    out: $out"
    fi
    if [[ "$out" != *".gitkeep"* ]]; then
        pass "manifest does not list .gitkeep"
    else
        fail "manifest does not list .gitkeep"
    fi
    if [[ "$out" == *"bytes  ~"*"tokens  tasks/1234/1234.md"* ]]; then
        pass "each markdown line carries bytes and an estimated token count"
    else
        fail "each markdown line carries bytes and an estimated token count"
        echo "    out: $out"
    fi
    if [[ "$out" == *"----- api  branch=feature/1234-thing  ticket branch: yes -----"* && "$out" == *"----- web  branch=12345-other  ticket branch: no -----"* ]]; then
        pass "repo state names the branch and the ticket-branch verdict"
    else
        fail "repo state names the branch and the ticket-branch verdict"
        echo "    out: $out"
    fi
    if [[ "$out" == *"grounding fixture"* && "$out" == *"-- working tree --"* && "$out" == *"(clean)"* ]]; then
        pass "repo state shows recent commits and the working tree"
    else
        fail "repo state shows recent commits and the working tree"
        echo "    out: $out"
    fi
    if [[ "$out" == *"----- mobile  branch=<missing>  ticket branch: no -----"* && "$out" == *"(not a git repository or missing:"* ]]; then
        pass "an uncloned repo is reported, not skipped"
    else
        fail "an uncloned repo is reported, not skipped"
        echo "    out: $out"
    fi

    out="$(cd "$proj" && bash "$MANIFEST" 7777)"
    if [[ "$out" == *"tasks/7777  ABSENT"* && "$out" == *"reviews/7777  ABSENT"* && "$out" == *"ALL-ABSENT: ticket 7777 does not exist yet; suggest /ultrapowers:new-task 7777"* ]]; then
        pass "an unknown ticket reports four ABSENT folders and suggests new-task"
    else
        fail "an unknown ticket reports four ABSENT folders and suggests new-task"
        echo "    out: $out"
    fi
    rm "$proj/specs/1234/diagram.png" "$proj/plans/1234/Plan.md"
}
```

Change `LIFECYCLE_SKILLS=(new-task brainstorm-task)` to:

```bash
LIFECYCLE_SKILLS=(new-task brainstorm-task task)
```

In `main`, after `    test_brainstorm_task`, add:

```bash
    test_task
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bash tests/task-lifecycle/test-task-lifecycle.sh`
Expected: earlier sections PASS; `--- task: manifest.sh ---` fails with `No such file or directory`; skill structure fails for `task`; exit 1.

- [ ] **Step 3: Write manifest.sh**

Create `skills/task/scripts/manifest.sh`:

```sh
#!/bin/sh
# manifest.sh - Step 1 of ultrapowers:task. Read-only: it writes nothing.
#
#   manifest.sh <ID>
#
# Sections: ROOT, MARKDOWN TO READ, NON-MARKDOWN, REPO STATE.
# Exit codes: 0 ok; 1 not scaffolded or usage; 2 ticket rejected.
set -u

here=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
. "$here/../../new-task/scripts/ticket-lib.sh"

id=${1:-}
if [ -z "$id" ]; then
  printf 'usage: manifest.sh <ID>\n' >&2
  exit 1
fi

root=$(find_root) || exit 1
validate_ticket "$root" "$id" || exit 2
printf '=== ROOT ===\nroot=%s\n' "$root"

printf '\n=== MARKDOWN TO READ (one file-reading call per file, in this order) ===\n'
total=0
bytes=0
present=0
for f in tasks specs plans reviews; do
  if [ ! -d "$root/$f/$id" ]; then
    printf '%s/%s  ABSENT\n' "$f" "$id"
    continue
  fi
  present=$((present + 1))
  list=$(find "$root/$f/$id" -type f -name '*.md' | LC_ALL=C sort)
  c=0
  if [ -n "$list" ]; then
    while IFS= read -r p; do
      s=$(wc -c <"$p" | tr -d ' ')
      printf '%9s bytes  ~%6s tokens  %s\n' "$s" "$((s / 4))" "${p#"$root/"}"
      c=$((c + 1))
      bytes=$((bytes + s))
    done <<EOF
$list
EOF
  fi
  printf '           (%s markdown files in %s/%s)\n' "$c" "$f" "$id"
  total=$((total + c))
done
printf 'TOTAL: %s markdown files, %s bytes, ~%s tokens\n' "$total" "$bytes" "$((bytes / 4))"
if [ "$present" -eq 0 ]; then
  printf 'ALL-ABSENT: ticket %s does not exist yet; suggest /ultrapowers:new-task %s\n' "$id" "$id"
fi

printf '\n=== NON-MARKDOWN (not read; name one by path to have it read) ===\n'
set --
for f in tasks specs plans reviews; do
  [ -d "$root/$f/$id" ] && set -- "$@" "$root/$f/$id"
done
if [ $# -eq 0 ]; then
  printf '(none)\n'
else
  nonmd=$(find "$@" -type f ! -name '*.md' ! -name '.gitkeep' | LC_ALL=C sort)
  if [ -z "$nonmd" ]; then
    printf '(none)\n'
  else
    printf '%s\n' "$nonmd" | while IFS= read -r p; do
      printf '%9s bytes  %s\n' "$(wc -c <"$p" | tr -d ' ')" "${p#"$root/"}"
    done
  fi
fi

printf '\n=== REPO STATE ===\n'
tab=$(printf '\t')
branch_report "$root" | while IFS="$tab" read -r n _p _a b; do
  d=$(repo_path "$root" "$n") || continue
  if ticket_branch_match "$b" "$id"; then m='ticket branch: yes'; else m='ticket branch: no'; fi
  printf -- '----- %s  branch=%s  %s -----\n' "$n" "$b" "$m"
  if [ -d "$d" ] && git -C "$d" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    git -C "$d" log --oneline -10 2>/dev/null || printf '(no commits yet)\n'
    printf -- '-- working tree --\n'
    st=$(git -C "$d" status --short)
    if [ -n "$st" ]; then printf '%s\n' "$st"; else printf '(clean)\n'; fi
  else
    printf '(not a git repository or missing: %s)\n' "$d"
  fi
done
```

- [ ] **Step 4: Write the skill**

Create `skills/task/SKILL.md`:

````markdown
---
name: task
description: Use when your human partner names a ticket id and wants to know where it stands, resume it, or load its documents, before doing any work on it
arguments:
  - ticket
---

# Task

## Overview

Load every markdown document a ticket has and report where it stands. This is a bulk loader, not a summary: cost is not a reason to read less. It writes nothing and starts nothing.

**Announce at start:** "I'm using the task skill to load ticket <ID>."

## Arguments

`ticket` (required). Substituted value, when the harness substitutes it: `$ARGUMENTS`. If that shows the literal text `$ARGUMENTS` or nothing, read the trailing `ARGUMENTS:` line of the message that invoked this skill instead.

With no ticket, stop and print `usage: /ultrapowers:task <ticket>`.

## Step 1: Manifest

`<SKILL_DIR>` is the directory this SKILL.md was loaded from; `<ID>` the ticket. Fill both in before running.

```bash
bash "<SKILL_DIR>/scripts/manifest.sh" "<ID>"
```

Sections: `MARKDOWN TO READ` (path, bytes, estimated tokens), `NON-MARKDOWN` (listed, not read), `REPO STATE` (per repo: branch, whether it is a ticket branch, last ten commits, short status). Read the output before continuing. Any line containing `ERROR` means stop and print it verbatim; if the project is not scaffolded, offer `/ultrapowers:init`.

## Step 2: Read everything listed

With the file-reading tool, one call per file, in this order: `tasks/`, `specs/`, `plans/`, `reviews/`. That runs brief, design, plan, outcome. Not through the shell: large output is diverted and only a preview reaches you. Read all of them; the point is that your human partner never names a file.

## Step 3: Report

In this order:

1. **Position, one sentence.** What stage is the ticket at?
2. **Done**, with evidence from the documents.
3. **In flight**: uncommitted files, an open review finding, a ticket branch with work on it.
4. **Next step**, in order.
5. **Every missing part, by name.** `ABSENT` folders are normal early on; say which. When all four are absent, say the ticket does not exist yet and suggest `/ultrapowers:new-task <ID>`.
6. **The non-markdown list**, when it is not empty: the files exist, you did not read them, name one by path to have it read.

## Step 4: Write nothing

Do not edit, create, commit or push. Do not start the work the documents describe. If your human partner wants work done, they will say so in their next message.

## Checklist

1. Read the argument; stop with usage when it is missing
2. Run the manifest; stop on ERROR
3. Read every listed markdown file, in order
4. Report the six parts
5. Change nothing

## Red Flags

| Thought | Reality |
|---------|---------|
| "The plan is 40 KB, I'll skim the headings" | Read all of it. The loader exists so nothing is skipped. |
| "I'll fix that typo in the spec while I'm here" | Report it under in flight or next step. Writing is a separate request from your human partner. |
| "No spec yet, so I'll start brainstorming" | Name the gap and suggest the skill. Starting work is your human partner's call. |
| "I'll cat the files in one shell call" | Truncated to a preview. One file-reading call per file. |
````

Add one Red Flags row per distinct baseline rationalization recorded for S6 in `tests/task-lifecycle/pressure-results.md` that the four rows above do not already answer.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `bash tests/task-lifecycle/test-task-lifecycle.sh`
Expected: all `[PASS]`, final `PASS`, exit 0.

- [ ] **Step 6: Lint**

Run: `bash scripts/lint-shell.sh skills/task/scripts/manifest.sh tests/task-lifecycle/test-task-lifecycle.sh`
Expected: no findings, exit 0.

- [ ] **Step 7: Commit**

```bash
git add skills/task tests/task-lifecycle/test-task-lifecycle.sh
git commit -m "feat(task): read-only loader that reports where a ticket stands" -m "Manifest of every markdown file under the four ticket folders with sizes and token estimates, non-markdown listed as unread, repo branch and commit state; the skill writes nothing." -m "RAOOF A."
```

---

### Task 6: Knowledge-base routing in brainstorming and writing-plans

**Files:**
- Modify: `skills/brainstorming/SKILL.md` (Documentation step, after the bullet `(User preferences for spec location override this default)`)
- Modify: `skills/writing-plans/SKILL.md` (after the bullet `(User preferences for plan location override this default)`)
- Modify: `tests/task-lifecycle/test-task-lifecycle.sh` (add `test_core_skill_edits`, one `main` line)

**Interfaces:**
- Consumes: the S7 baseline from Task 2 (spec written to the default path despite the marker) as the failing test for this edit.
- Produces: exactly one new bullet in each skill; nothing else in either body changes (spec D5).

Grounding, quoted from the current files (before piece 1 the paths carry the upstream name; after piece 1 they say `ultrapowers`, which is the state this plan edits):

`skills/brainstorming/SKILL.md` line 135 (checklist, Architectural item 6), left unchanged by this task because spec 3.5 scopes the edit to the documentation step:

```
6. **Write design doc** — save to `docs/superpowers/specs/YYYY-MM-DD-<topic>-design.md` and commit
```

`skills/brainstorming/SKILL.md` lines 241-242 (the Documentation step under "After the Design (architectural path)"), the insertion point:

```
- Write the validated design (spec) to `docs/superpowers/specs/YYYY-MM-DD-<topic>-design.md`
  - (User preferences for spec location override this default)
```

`skills/writing-plans/SKILL.md` lines 16-17, the insertion point:

```
**Save plans to:** `docs/superpowers/plans/YYYY-MM-DD-<feature-name>.md`
- (User preferences for plan location override this default)
```

- [ ] **Step 1: Write the failing structural test**

Add to `tests/task-lifecycle/test-task-lifecycle.sh`, after `test_task` and before `test_skill_structure`:

```bash
test_core_skill_edits() {
    echo "--- brainstorming and writing-plans KB routing ---"
    local b="$REPO_ROOT/skills/brainstorming/SKILL.md"
    local w="$REPO_ROOT/skills/writing-plans/SKILL.md"

    if [[ "$(grep -c 'specs/<id>/Spec.md' "$b" || true)" -eq 1 ]] \
        && grep -q 'docs/ultrapowers/specs/YYYY-MM-DD-<topic>-design.md' "$b" \
        && grep -q '\.agents/ultrapowers\.json' "$b"; then
        pass "brainstorming keeps the default spec path and gains one KB route conditioned on the marker"
    else
        fail "brainstorming keeps the default spec path and gains one KB route conditioned on the marker"
        grep -n 'Spec.md\|specs/YYYY' "$b" | sed 's/^/    /'
    fi
    if grep -A1 'User preferences for spec location override this default' "$b" | grep -q 'specs/<id>/Spec.md'; then
        pass "the brainstorming route sits directly under the spec-location bullet"
    else
        fail "the brainstorming route sits directly under the spec-location bullet"
    fi

    if [[ "$(grep -c 'plans/<id>/Plan.md' "$w" || true)" -eq 1 && "$(grep -c 'PLAN-NN-<slug>.md' "$w" || true)" -eq 1 ]] \
        && grep -q 'docs/ultrapowers/plans/YYYY-MM-DD-<feature-name>.md' "$w" \
        && grep -q '\.agents/ultrapowers\.json' "$w"; then
        pass "writing-plans keeps the default plan path and gains one KB route with the plan-set convention"
    else
        fail "writing-plans keeps the default plan path and gains one KB route with the plan-set convention"
        grep -n 'Plan.md\|plans/YYYY' "$w" | sed 's/^/    /'
    fi
    if grep -A1 'User preferences for plan location override this default' "$w" | grep -q 'plans/<id>/Plan.md'; then
        pass "the writing-plans route sits directly under the plan-location bullet"
    else
        fail "the writing-plans route sits directly under the plan-location bullet"
    fi
}
```

In `main`, after `    test_task`, add:

```bash
    test_core_skill_edits
```

- [ ] **Step 2: Run the tests to verify the new section fails**

Run: `bash tests/task-lifecycle/test-task-lifecycle.sh`
Expected: the four assertions under `--- brainstorming and writing-plans KB routing ---` FAIL; everything else PASS; exit 1.

- [ ] **Step 3: Edit brainstorming**

In `skills/brainstorming/SKILL.md`, directly after the line `  - (User preferences for spec location override this default)` in the **Documentation:** list, insert this one bullet (two spaces of indentation, matching the bullet above it):

```markdown
  - If `.agents/ultrapowers.json` exists at or above the working directory and a ticket id is known from the conversation, write the spec to `specs/<id>/Spec.md` under the directory that holds that file instead of the default path. With no such file, or no ticket id, the default above stands.
```

Change nothing else in the file.

- [ ] **Step 4: Edit writing-plans**

In `skills/writing-plans/SKILL.md`, directly after the line `- (User preferences for plan location override this default)`, insert this one bullet:

```markdown
- If `.agents/ultrapowers.json` exists at or above the working directory and a ticket id is known from the conversation, save the plan to `plans/<id>/Plan.md` under the directory that holds that file instead. A plan set for one ticket uses `plans/<id>/PLAN-NN-<slug>.md` with a `README.md` index in the same folder. With no such file, or no ticket id, the default above stands.
```

Change nothing else in the file.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `bash tests/task-lifecycle/test-task-lifecycle.sh`
Expected: all `[PASS]`, final `PASS`, exit 0.

Run: `git diff --stat skills/brainstorming/SKILL.md skills/writing-plans/SKILL.md`
Expected: exactly `1 insertion(+)` for each file, no deletions.

- [ ] **Step 6: Commit**

```bash
git add skills/brainstorming/SKILL.md skills/writing-plans/SKILL.md tests/task-lifecycle/test-task-lifecycle.sh
git commit -m "feat(brainstorming,writing-plans): route spec and plan into the ticket knowledge base" -m "One bullet each: with .agents/ultrapowers.json at or above the working directory and a known ticket id, the spec goes to specs/<id>/Spec.md and the plan to plans/<id>/Plan.md. Defaults unchanged otherwise." -m "RAOOF A."
```

---

### Task 7: Piece 2 payload follow-ups: knowledge-base READMEs and config defaults

**Files:**
- Modify: `templates/specs/README.md.tmpl`
- Modify: `templates/plans/README.md.tmpl`
- Modify: `templates/.agents/ultrapowers.json.tmpl` (piece 2's marker template, rendered by `writeMarker` in `skills/init/scripts/init.mjs`; Step 3 confirms it)

**Interfaces:**
- Consumes: the piece 2 template tree (`templates/` mirrors the target tree; `X.tmpl` renders to `X`).
- Produces: two README sections naming the ticket convention; config defaults `"commitTrailer": ""` and `"ticketPattern": "^#?[A-Za-z0-9][A-Za-z0-9._-]*$"` written by init. The lifecycle scripts already default correctly when the keys are absent, so this task is documentation and discoverability, not correctness.

- [ ] **Step 1: Locate the two README templates**

Run: `ls templates/specs/README.md.tmpl templates/plans/README.md.tmpl`
Expected: both paths print. If either is missing, run `find templates -iname 'README*' | grep -Ei 'specs|plans'` and use the paths it prints for the rest of this task.

- [ ] **Step 2: Append the ticket convention to both**

Append to `templates/specs/README.md.tmpl`:

```markdown

## Ticket convention

Each ticket gets its own folder, `specs/<ticket-id>/`, created by `/ultrapowers:new-task`. The design written by `/ultrapowers:brainstorm-task` (through `ultrapowers:brainstorming`) is `specs/<ticket-id>/Spec.md`, exactly that name and case. Supporting notes sit beside it. Nothing is written into an existing `Spec.md` without a revise-or-replace answer.
```

Append to `templates/plans/README.md.tmpl`:

```markdown

## Ticket convention

Each ticket gets its own folder, `plans/<ticket-id>/`, created by `/ultrapowers:new-task`. `ultrapowers:writing-plans` saves the plan as `plans/<ticket-id>/Plan.md`. When one ticket needs a plan set, the files are `plans/<ticket-id>/PLAN-NN-<slug>.md` with a `README.md` index in the same folder.
```

Run: `grep -c 'Spec.md' templates/specs/README.md.tmpl; grep -c 'PLAN-NN-<slug>.md' templates/plans/README.md.tmpl`
Expected: `1` and `1` (or higher if the piece 2 text already mentioned them once; never `0`).

- [ ] **Step 3: Locate where init emits the config**

Run: `grep -rn '"topology"\|topology:' templates skills/init/scripts`
Expected: one hit, `templates/.agents/ultrapowers.json.tmpl` with the line `"topology": "{{topology}}",`. The added values contain no `{{`, so the renderer accepts them.

- [ ] **Step 4: Add the two defaults**

In the file found in Step 3, next to the `topology` key, add the two keys so the emitted JSON contains, at the top level:

```json
  "commitTrailer": "",
  "ticketPattern": "^#?[A-Za-z0-9][A-Za-z0-9._-]*$",
```

In a `.tmpl` file, add the two lines verbatim after the `"topology"` line (keep the trailing comma rules of the surrounding JSON). In `init.mjs`, add `commitTrailer: "",` and `ticketPattern: "^#?[A-Za-z0-9][A-Za-z0-9._-]*$",` to the object literal that contains `topology`.

- [ ] **Step 5: Verify against a fresh scaffold**

Run init on a fresh temp repo the way the piece 2 plan documents (in Claude Code: `cd` into `git init -q "$(mktemp -d)/fresh"`, then `/ultrapowers:init fresh` and answer yes). Then, from that repo:

```bash
node -e '
const c = JSON.parse(require("fs").readFileSync(".agents/ultrapowers.json", "utf8"));
if (c.commitTrailer !== "") throw new Error("commitTrailer default wrong: " + JSON.stringify(c.commitTrailer));
if (c.ticketPattern !== "^#?[A-Za-z0-9][A-Za-z0-9._-]*$") throw new Error("ticketPattern default wrong: " + JSON.stringify(c.ticketPattern));
console.log("config defaults present");
'
```

Expected: `config defaults present`.

Run: `grep -n 'Ticket convention' specs/README.md plans/README.md`
Expected: one hit in each rendered README.

Run the piece 2 engine tests as that plan documents them (its `node --test` suite) to confirm nothing else changed.
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add templates skills/init
git commit -m "feat(init): ticket convention in KB READMEs and lifecycle config defaults" -m "specs and plans READMEs document specs/<id>/Spec.md and plans/<id>/Plan.md; init writes commitTrailer and ticketPattern with their defaults." -m "RAOOF A."
```

---

### Task 8: Manifests, docs and lint gate

**Files:**
- Modify: `.muse-plugin/plugin.json` (three entries in `capabilities.skills`)
- Modify: `docs/testing.md` (one bullet)
- Modify: `tests/task-lifecycle/test-task-lifecycle.sh` (add `test_manifests`, one `main` line)

**Interfaces:**
- Consumes: the three `skills/*/SKILL.md` from Tasks 3 to 5.
- Produces: every `skills/*/SKILL.md` listed in the Muse manifest; a test that keeps it so.

- [ ] **Step 1: Write the failing test**

Add to `tests/task-lifecycle/test-task-lifecycle.sh`, after `test_core_skill_edits` and before `test_skill_structure`:

```bash
test_manifests() {
    echo "--- manifests ---"
    local out rc=0
    out="$(cd "$REPO_ROOT" && node -e '
const fs = require("fs");
const m = JSON.parse(fs.readFileSync(".muse-plugin/plugin.json", "utf8"));
const listed = new Set(m.capabilities.skills.map(s => s.path));
const ids = new Set(m.capabilities.skills.map(s => s.id));
const onDisk = fs.readdirSync("skills")
  .filter(d => fs.existsSync(`skills/${d}/SKILL.md`))
  .map(d => `skills/${d}/SKILL.md`);
const missing = onDisk.filter(p => !listed.has(p));
const stale = [...listed].filter(p => !fs.existsSync(p));
const badIds = m.capabilities.skills.filter(s => s.path !== `skills/${s.id}/SKILL.md`).map(s => s.id);
if (missing.length || stale.length || badIds.length) {
  console.log(JSON.stringify({ missing, stale, badIds }));
  process.exit(1);
}
console.log("ok");
' 2>&1)" || rc=$?
    if [[ "$rc" -eq 0 && "$out" == "ok" ]]; then
        pass "Muse manifest lists every skills/*/SKILL.md with id matching its folder"
    else
        fail "Muse manifest lists every skills/*/SKILL.md with id matching its folder"
        echo "    $out"
    fi

    if grep -q 'tests/task-lifecycle/test-task-lifecycle.sh' "$REPO_ROOT/docs/testing.md"; then
        pass "docs/testing.md lists the task lifecycle test"
    else
        fail "docs/testing.md lists the task lifecycle test"
    fi
}
```

In `main`, after `    test_core_skill_edits`, add:

```bash
    test_manifests
```

- [ ] **Step 2: Run the tests to verify the new section fails**

Run: `bash tests/task-lifecycle/test-task-lifecycle.sh`
Expected: `--- manifests ---` prints `{"missing":["skills/brainstorm-task/SKILL.md","skills/new-task/SKILL.md","skills/task/SKILL.md"],"stale":[],"badIds":[]}` and FAIL, plus the docs FAIL; exit 1.

- [ ] **Step 3: Add the Muse entries**

In `.muse-plugin/plugin.json`, the `capabilities.skills` array is alphabetical by id. Insert these three objects at their alphabetical positions (before `brainstorming`; after `finishing-a-development-branch`; after `systematic-debugging`):

```json
      {
        "id": "brainstorm-task",
        "path": "skills/brainstorm-task/SKILL.md"
      },
```

```json
      {
        "id": "new-task",
        "path": "skills/new-task/SKILL.md"
      },
```

```json
      {
        "id": "task",
        "path": "skills/task/SKILL.md"
      },
```

Run: `node -e 'JSON.parse(require("fs").readFileSync(".muse-plugin/plugin.json","utf8")); console.log("valid json")'`
Expected: `valid json`.

Run: `grep -rln 'skills/writing-skills/SKILL.md' --include='*.json' --include='*.yaml' --include='*.yml' --include='*.toml' . | grep -v node_modules`
Expected: only `.muse-plugin/plugin.json`. If any other manifest enumerates skills by path, add the same three entries there in that file's own format.

- [ ] **Step 4: Add the docs bullet**

In `docs/testing.md`, in the bullet list under "## Plugin tests" (the list whose items start with `- \`tests/`), add after the `tests/claude-code/test-helpers.sh` bullet:

```markdown
- `tests/task-lifecycle/test-task-lifecycle.sh` — bash tests for the new-task, brainstorm-task and task helper scripts on temp scaffolded projects: root walk-up to `.agents/ultrapowers.json`, ticket pattern accept and reject, refusal on an existing task, spec collision detection, repo selection, the eight-file grounding cap, the read-only manifest, the KB routing bullets and the Muse manifest.
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `bash tests/task-lifecycle/test-task-lifecycle.sh`
Expected: all `[PASS]`, final `PASS`, exit 0.

- [ ] **Step 6: Run the full shell lint and the line-ending check**

Run: `bash scripts/lint-shell.sh --all`
Expected: `Linting N shell files` and exit 0 with no findings.

Run: `git ls-files --eol skills/new-task skills/brainstorm-task skills/task tests/task-lifecycle | awk '$1 != "i/lf" && $1 != "i/none"'`
Expected: no output (every committed file is LF in the index; `i/none` is an empty file).

- [ ] **Step 7: Commit**

```bash
git add .muse-plugin/plugin.json docs/testing.md tests/task-lifecycle/test-task-lifecycle.sh
git commit -m "chore(manifests): list new-task, brainstorm-task and task; document the test" -m "Muse manifest entries for the three lifecycle skills, a manifest completeness test, and the docs/testing.md bullet." -m "RAOOF A."
```

---

### Task 9: Confidentiality and payload sweep

**Files:**
- Read only: `skills/new-task`, `skills/brainstorm-task`, `skills/task`, `tests/task-lifecycle`, the two edited core skills, the two edited templates.

**Interfaces:**
- Consumes: G4 (no reference-project data) and the confidentiality rule for this plan (no hostnames, URLs, emails, personal or client names, repo names, forge paths, project ids).
- Produces: a clean sweep recorded in the final verification.

- [ ] **Step 1: Sweep for addresses and hosts**

Run:

```bash
grep -rEn '://|@[a-z0-9-]+\.[a-z]{2,}|\b[a-z0-9-]+\.(com|net|org|io|dev)\b' skills/new-task skills/brainstorm-task skills/task tests/task-lifecycle templates/specs templates/plans 2>/dev/null | grep -v 'test@example.com'
```

Expected: no output. The only address anywhere in the new files is the git identity `test@example.com` in the fixture and it is excluded above.

- [ ] **Step 2: Sweep for the reference project's fixed vocabulary**

Run:

```bash
grep -rEin 'nextit|next-it|datanextstep|scm\.|odoo|glab|nango|keycloak|langfuse|ciso|/x/|X:' skills/new-task skills/brainstorm-task skills/task tests/task-lifecycle templates/specs templates/plans skills/brainstorming/SKILL.md skills/writing-plans/SKILL.md
```

Expected: no output.

- [ ] **Step 3: Sweep for a hard-coded sign-off**

Run: `grep -rn 'RAOOF' skills tests/task-lifecycle templates`
Expected: no output. The trailer only ever comes from `commitTrailer` in a project's config; the plan's own commit messages are not in these files.

- [ ] **Step 4: Sweep for harness tool names in the five touched skill bodies**

Run: `grep -En 'AskUserQuestion|Read tool|Write tool|Edit tool|Bash tool|TodoWrite|WebFetch' skills/new-task/SKILL.md skills/brainstorm-task/SKILL.md skills/task/SKILL.md`
Expected: no output (the structural test in Task 3 also enforces this on every run).

No commit: this task changes nothing. If any sweep prints a line, fix the file it names, re-run the tests, and amend the offending task's commit message content in a new commit that also ends with `RAOOF A.`.

---

### Task 10: GREEN and REFACTOR pressure runs

**Files:**
- Modify: `tests/task-lifecycle/pressure-results.md` (fill the "With skill" and "Verdict" columns)
- Modify, only if a run finds a new rationalization: the Red Flags table of `skills/new-task/SKILL.md`, `skills/brainstorm-task/SKILL.md` or `skills/task/SKILL.md`

**Interfaces:**
- Consumes: the scenarios and fixtures from Task 2 (rebuild them with the Task 2 Step 2 commands; the scratch directory does not survive between sessions), the three skills, the two core edits, the plugin installed from the working tree.
- Produces: spec acceptance criterion 8, "pressure tests per writing-skills show the agent grounding before questioning, refusing to overwrite, and keeping the brief to two paragraphs".

- [ ] **Step 1: Install the plugin from the working tree**

In Claude Code: `/plugin marketplace add S:\ultrapowers` (or the repo's path on this machine) then `/plugin install ultrapowers@ultrapowers`; start a new session and confirm `/ultrapowers:new-task`, `/ultrapowers:brainstorm-task` and `/ultrapowers:task` are listed.
Expected: the three skills appear with their descriptions.

- [ ] **Step 2: Run S1 to S8 WITH the skills**

Rebuild the fixtures (Task 2 Step 2). For each scenario, dispatch one fresh subagent in the fixture directory with the exact prompt from `pressure-scenarios.md`, this time invoking the skill by name (`/ultrapowers:brainstorm-task 1234` for S1, S2, S5; `/ultrapowers:new-task ...` for S3, S4; `/ultrapowers:task 1234` for S6; S7 and S8 invoke nothing, they test the edited `brainstorming`). Capture the transcripts.

Check each against its "Expected with skill" paragraph and against the fixture on disk afterwards:

```bash
# S2 and S6: nothing written
git -C "$SCRATCH/s2" status --porcelain     # expected: empty
git -C "$SCRATCH/s6" status --porcelain     # expected: empty
# S3: brief shape
grep -c '^## ' "$SCRATCH/s3/tasks/2001/2001.md"          # expected: 4
awk 'BEGIN{n=0} /^## Context/{c=1;next} /^## /{c=0} c && NF{n++} END{print n}' "$SCRATCH/s3/tasks/2001/2001.md"   # expected: 1 (one non-empty line, one paragraph)
# S4: brief unchanged
git -C "$SCRATCH/s4" status --porcelain     # expected: empty
# S7: spec in the knowledge base
ls "$SCRATCH/s1/specs/1234/Spec.md"         # expected: exists
ls "$SCRATCH/s1/docs" 2>&1                  # expected: No such file or directory
```

For S1 and S5, count the api files in the printed grounding manifest: expected at most 8, and the manifest appears before the first question in the transcript.

- [ ] **Step 3: Record and refactor**

Fill the "With skill" and "Verdict" columns of `tests/task-lifecycle/pressure-results.md` with what happened, quoting any new rationalization verbatim. For every new rationalization that produced a violation, add one Red Flags row to the owning skill, in the two-column form used there, and re-run that scenario until it complies. Then run the structural tests again:

Run: `bash tests/task-lifecycle/test-task-lifecycle.sh`
Expected: `PASS`.

- [ ] **Step 4: Commit**

```bash
git add tests/task-lifecycle/pressure-results.md skills/new-task/SKILL.md skills/brainstorm-task/SKILL.md skills/task/SKILL.md
git commit -m "test(task-lifecycle): GREEN pressure runs and red-flag refinements" -m "Eight scenarios re-run with the skills installed; results recorded; red flags extended with the rationalizations observed." -m "RAOOF A."
```

---

### Task 11: Final verification against the spec's acceptance criteria

**Files:**
- Read only, plus a temp project.

**Interfaces:**
- Consumes: everything above.
- Produces: evidence for spec §4 items 1 to 8, in order.

- [ ] **Step 1: Criterion 7, bash tests and lint**

Run: `bash tests/task-lifecycle/test-task-lifecycle.sh && bash scripts/lint-shell.sh --all`
Expected: `PASS` then a clean lint, exit 0.

- [ ] **Step 2: Criterion 1, new-task on a temp project with two nested clones**

```bash
V="$(mktemp -d)"
bash tests/task-lifecycle/make-fixture.sh "$V/proj" >/dev/null
cd "$V/proj/api"
```

In Claude Code from that directory: `/ultrapowers:new-task 1234 Sample title`, answer "later" to the context question.

```bash
ls -A "$V/proj/tasks/1234" "$V/proj/specs/1234" "$V/proj/plans/1234" "$V/proj/reviews/1234"
git -C "$V/proj" log --oneline -2
```

Expected: `1234.md`; `.gitkeep`; `.gitkeep`; `.gitkeep`; the log shows `chore(1234): scaffold task` above `scaffold fixture` (one new commit). Run `/ultrapowers:new-task 1234 Other title` again: expected, the agent stops at `tasks/1234 EXISTS`, changes nothing (`git -C "$V/proj" status --porcelain` empty, log unchanged) and names `/ultrapowers:task 1234`.

- [ ] **Step 3: Criterion 2, root discovery from inside a nested clone**

Criterion 1 already ran new-task from `api/`. From `$V/proj/web`, run `/ultrapowers:task 1234` and `/ultrapowers:brainstorm-task 1234 backend` (stop it after the manifest).
Expected: each prints `root=<path to proj>` in its first section and operates on `proj/`, never on `web/`.

- [ ] **Step 4: Criterion 3, selection, manifest cap and spec location**

Put six files mentioning `invoice` under `$V/proj/api/src/` plus the S1 brief content into `tasks/1234/1234.md`, commit both, then from `$V/proj`: `/ultrapowers:brainstorm-task 1234 backend`, answer the questions briefly, approve the design.
Expected: `SELECTED-BY-FOCUS (backend): api`; the manifest lists at most eight api files; the session ends with `specs/1234/Spec.md` present and `git -C "$V/proj" log -1 --format=%s` reading `spec(1234): ...`.

- [ ] **Step 5: Criterion 4, revise or replace**

With `specs/1234/Spec.md` present from Step 4, run `/ultrapowers:brainstorm-task 1234 backend` again and do not answer the revise-or-replace question for one turn.
Expected: the agent asks revise or replace and `git -C "$V/proj" status --porcelain` stays empty until you answer.

- [ ] **Step 6: Criterion 5, writing-plans routing**

Answer "revise" in Step 5, finish the session, then invoke `ultrapowers:writing-plans` when brainstorming hands off.
Expected: `plans/1234/Plan.md` exists. Then in a repo without the marker (`git init -q "$V/plain"`, `cd "$V/plain"`), give a small spec inline and invoke writing-plans.
Expected: the plan path offered is `docs/ultrapowers/plans/YYYY-MM-DD-<feature-name>.md`.

- [ ] **Step 7: Criterion 6, the read-only loader**

From `$V/proj`: `/ultrapowers:task 1234`.
Expected: the agent reads `tasks/1234/1234.md`, `specs/1234/Spec.md`, `plans/1234/Plan.md`, reports `reviews/1234` as having no documents, names the next step, and `git -C "$V/proj" status --porcelain` is empty afterwards.

- [ ] **Step 8: Criterion 8, pressure evidence**

Run: `grep -c 'pending Task 10' tests/task-lifecycle/pressure-results.md`
Expected: `0`. Every row has a "With skill" entry and a verdict; S1, S2, S3, S5 verdicts state grounding-before-questioning, refusal to overwrite, and a two-paragraph brief respectively.

- [ ] **Step 9: Repo-wide checks**

Run: `git status --porcelain`
Expected: empty (every change is committed; the two untracked screenshots and `docs/ultrapowers-requirements.md` that predate this plan are outside its scope and may still show if they were not committed elsewhere; nothing else appears).

Run: `git log --format=%B -8 | grep -c '^RAOOF A\.$'`
Expected: `8` or more (every commit made by this plan ends with the trailer line).

Run: `rm -rf "$V"`.

No commit: this task produces evidence, not changes. If any step fails, return to the owning task, fix it with a new commit ending in `RAOOF A.`, and re-run this task from Step 1.

---

## Self-Review

**1. Spec coverage**

| Spec item | Task |
|-----------|------|
| D1 three skills, no merge-request skill | Tasks 3, 4, 5; nothing ports `glab-mr` |
| D2 brief template, two paragraphs | Task 3 (`create` template, SKILL.md Step 3, Red Flags), S3 in Tasks 2 and 10 |
| D3 ticket pattern default and override | Task 1 (`validate_ticket`, tests for default and custom), Task 7 (config default) |
| D4 repos from config, selection order | Task 1 (`config_repos`, selectors), Task 4 (`preflight.sh` SELECTION) |
| D5 one paragraph each in brainstorming and writing-plans | Task 6 |
| D6 root walk-up, no toplevel, no env var | Task 1 (`find_root`, tests from nested clone and without marker) |
| D7 named arguments with `ARGUMENTS:` fallback | Each SKILL.md "Arguments" section; structural test in Task 3 |
| D8 optional commit trailer | Task 1 (`config_string`), Task 3 (`commit`), Task 4 (`commit-spec.sh`), trailer tests |
| 3.1 marked sections, ERROR stop rule, placeholders, config keys | Every script and SKILL.md; structural test checks `ERROR` |
| 3.2 steps 1-7 | Task 3 |
| 3.3 steps 1-7 and the four red flags | Task 4 (the four spec rows are present verbatim in spirit and wording) |
| 3.4 steps 1-4 | Task 5 |
| 3.5 core edits and KB READMEs | Tasks 6 and 7 |
| 3.6 config additions | Task 7 |
| §4 acceptance 1-8 | Task 11 (1-6, 8), Task 8 Step 6 and Task 1 Step 6 (7 lint), Task 10 (8) |
| §5 risk: branch matching anchors | Task 1 (`ticket_branch_match` table) |
| §5 risk: large brief via shell | SKILL.md Step 2 in Task 4, Step 2 in Task 5, Red Flags rows |
| §5 risk: core edits shift behavior | Task 2 S7/S8 baseline, Task 10 re-run, Task 6 diff-stat check |
| G5 LF | Task 1 Step 6, Task 8 Step 6 |
| G4 no reference data | Task 9 |
| Muse manifest | Task 8 |

**2. Placeholder scan.** The plan contains no "TBD", "TODO", "similar to" or "add validation". Angle-bracket tokens inside skill bodies (`<ID>`, `<SKILL_DIR>`, `<REPO>`, `<title>`) are the spec-mandated placeholders the agent fills at run time, not plan placeholders. Task 7 Step 3 locates a piece 2 file by grep because piece 2's plan names it; the values written there are exact.

**3. Type consistency.** Function names used in Tasks 3, 4, 5 (`find_root`, `validate_ticket`, `config_string`, `config_repos`, `repo_path`, `branch_report`, `ticket_branch_match`, `select_by_branch`, `select_by_focus`) match Task 1's definitions and argument orders. Section markers asserted in tests (`=== ROOT ===`, `OK: continue with create`, `STOP: tasks/<ID> exists`, `>>> SPEC-COLLISION:`, `SELECTED-BY-FOCUS`, `SELECTED-BY-BRANCH`, `SELECTED-ROOT`, `ASK:`, `FOCUS-NO-MATCH`, `hits  `, `more files matched; not listed. The cap is 8 files per repository, highest signal first.`, `ALL-ABSENT:`, `----- <name>  branch=`, `=== COMMITTED ===`) match the scripts character for character. Exit codes: 1 usage or unscaffolded, 2 ticket or repo rejected, 3 existing task, throughout. Test variable `LIFECYCLE_SKILLS` grows from `()` to `(new-task brainstorm-task task)` across Tasks 1, 3, 4, 5.

**4. Review Focus.** Space in root path: Task 1 `find_root` test and Task 3 `create`/`commit` under `with space/proj`. Uncloned repo: Task 1 `branch_report` `<missing>`, Task 4 REPOS line and `ground.sh` exit 2, Task 5 REPO STATE line. Missing `repos` key: Task 1 `bareconfig` tests, Task 4 `SELECTED-ROOT`. `#`-prefixed id: Task 1 match table, Task 3 `create '#77'`, Task 4 `preflight.sh '#1234'`. Terms with spaces: Task 4 `'total amount'`. All five are pinned.
