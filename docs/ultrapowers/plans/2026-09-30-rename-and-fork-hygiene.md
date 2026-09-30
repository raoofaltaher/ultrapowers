# Rename and Fork Hygiene Implementation Plan

> Naming note: this document describes the rename away from the upstream name. The upstream name is written `<old-name>` (`<Old-name>`, `<OLD-NAME>` for the other cases) so that no file in the repository carries it. Commands that must match it build it at run time as `OLD="$(printf 'super%s' powers)"`.

> **For agentic workers:** REQUIRED SUB-SKILL: Use <old-name>:subagent-driven-development (recommended) or <old-name>:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the upstream <old-name> 6.4.2 copy at `S:\ultrapowers` into ultrapowers 1.0.0: one name everywhere, fork-owner identity in every manifest, upstream-only tooling and telemetry removed, every offline suite green.

**Architecture:** A committed, parameterised rename script (`scripts/rename-fork.sh`) performs the blind three-variant substitution and the `git mv` path moves over `git ls-files`. A curated manual pass then fixes what a blind pass gets wrong: manifest identity and version, the brainstorm companion's remote-logo telemetry, deletions, the README/AGENTS/template rewrites, docs, and the tests that assert on names or on deleted tooling. A final task runs every acceptance criterion from spec section 5.

**Tech Stack:** bash 5.2 (Git Bash on Windows), git 2.52, node 26, npm 11, python 3.14 + pytest 9, jq 1.8. Also required but NOT installed on the authoring machine: `yq` (mikefarah v4, needed by `scripts/bump-version.sh` for the Hermes YAML) and `shellcheck` (needed by `scripts/lint-shell.sh`). Zero runtime dependencies in the plugin itself.

**Spec:** `docs/ultrapowers/specs/2026-09-30-rename-and-fork-hygiene-design.md`

## Global Constraints

Copied from the spec; every task's requirements implicitly include these.

- D1: Rename every occurrence, including upstream history documents. One name in the repo, no dual vocabulary.
- D2 (revised 2026-09-30 by the owner): no file in the repository contains the old name, in any case. Attribution is the `LICENSE` copyright line plus one README fork notice, both without the old name. `CODE_OF_CONDUCT.md` is deleted.
- D3: Version resets to `1.0.0`. The fork notice states the upstream version it was cut from (`6.4.2`).
- D4: Plugin name `ultrapowers`; marketplace name `ultrapowers`; one plugin with source `./`; owner `raoofaltaher`; homepage and repository `https://github.com/raoofaltaher/ultrapowers`.
- D5: Author fields name the fork owner by git name only (`RAOOF A.`); no email in any manifest. Hermes YAML `author: raoofaltaher`.
- D6: `RELEASE-NOTES.md` is kept as an empty (zero-byte) file.
- D7: The visual companion's remote brand image and all telemetry handling are removed; the three telemetry environment variables are deleted, not renamed.
- D8: Codex publishing tooling that targets upstream's marketplace fork is deleted. `.codex-plugin/plugin.json` and `.agents/plugins/marketplace.json` stay.
- D9: The external evals-harness wiring is removed.
- D10: Skill bodies are renamed only where the name appears; their behavior-shaping content is otherwise untouched.
- Spec 4.2: `hooks/session-start` keeps its file name; `.gitattributes` needs no change. Renamed hook and shell files must stay LF.
- Spec 4.2: Excluded from the blind pass: `LICENSE`, the spec, this plan, `.git/`, `.remember/`, and binary assets.
- Spec 4.2: Every `<OLD-NAME>_*` environment variable becomes `ULTRAPOWERS_*` except the three telemetry variables, which are deleted.
- Spec 4.2: Runtime folder `.<old-name>/` becomes `.ultrapowers/`; no migration of existing ledgers.
- Every commit message in this plan ends with the exact final line `RAOOF A.`.
- Work happens on branch `rename-ultrapowers`. The upstream "PRs must target `dev`" rule is removed by spec 4.3 and does not apply here.

## Review Focus

Five input classes the spec implies but no spec bullet tests, most likely to bite first. Each has its pinning test in the owning task.

1. **The owner/name pair.** A blind three-variant pass turns `obra/<old-name>` into `obra/ultrapowers`, a URL that does not exist. Expected behavior: `obra/<old-name>` becomes `raoofaltaher/ultrapowers` in one pass, before the bare-name substitution runs. Pinned in Task 1's `test-rename-fork.sh` ("owner/name pair is rewritten before the bare name").
2. **Empty directories left behind by per-file `git mv`.** Git tracks files, not directories; after moving every file out of `docs/<old-name>/`, the empty directory remains on disk and acceptance criterion 2 (`find -iname '*<old-name>*'` returns nothing) fails. Expected behavior: emptied old-name directories are removed. Pinned in Task 1's test ("emptied old directories are removed").
3. **Binary files touched by `sed`.** `assets/app-icon.png` is tracked; a byte-level substitution corrupts it silently. Expected behavior: binary files are byte-identical after the run. Pinned in Task 1's test ("binary file is byte-identical").
4. **The new logo route bypassing the session key.** Every companion route is gated by `isAuthorized`; a logo route added outside that gate would be the only unauthenticated endpoint. Expected behavior: `GET /brand-logo.svg` without the key returns 403; with the key returns the bundled SVG; when the packaged tree lacks `assets/` it returns 404 and the HTML still renders. Pinned in Task 3's rewritten `branding.test.js`.
5. **Version audit false positives.** `scripts/bump-version.sh --audit` greps the whole repo for the literal `1.0.0`; `tests/brainstorm-server/package.json` and `package-lock.json` are version `1.0.0` themselves, and the spec and history plans mention `1.0.0`. Expected behavior: `--audit` prints "All clear" after the bump. Pinned in Task 2 by extending `.version-bump.json` `audit.exclude` and running `--audit`.

---

## Before you start: environment and honesty notes

Facts verified on the authoring machine (Windows 11, Git Bash, repo at `/s/ultrapowers`, branch `rename-ultrapowers`, git user `RAOOF A.`, remote `https://github.com/raoofaltaher/ultrapowers.git`):

- Present: `node v26.2.0`, `npm 11.16.0`, `python 3.14.5`, `pytest 9.1.1`, `jq 1.8.2`, `git 2.52.0.windows.1`, `bash 5.2.37`.
- **Missing: `yq`, `shellcheck`, `shfmt`.** `scripts/bump-version.sh` calls `require_tool yq` for `.hermes-plugin/plugin.yaml` and exits non-zero without it (all three modes: bump, `--check`, `--audit`). `scripts/lint-shell.sh` calls `require_tool shellcheck` unconditionally. `tests/version-bump/test-bump-version.sh` also needs `yq`. Install before Task 2:
  - Windows: `winget install --id MikeFarah.yq -e` and `winget install --id koalaman.shellcheck -e` (these commands are the vendors' documented winget ids; they were not executed here, so treat them as unverified). Alternatives: `choco install yq shellcheck`, or download the binaries from the projects' GitHub releases and put them on `PATH`.
  - macOS: `brew install yq shellcheck`.
  - Confirm with `yq --version` (must print a `v4.x` mikefarah build, not the Python `yq` wrapper) and `shellcheck --version`.
- `tests/brainstorm-server/node_modules` is absent. `npm test` there needs `npm install` (the `ws` dev dependency). Whether `npm install` works offline was not verified; if it fails, run the branding test directly with `node branding.test.js` (it needs no dependency) and report the rest of that suite as **skipped, not passed**, exactly as spec section 6 requires.
- Counts for expected output: 145 tracked text files contain the old name (excluding the spec); 68 tracked paths contain it (36 under `docs/<old-name>/`, 8 under `skills/using-<old-name>/`, 20 under `skills/diagnosing-<old-name>/`, `tests/diagnosing-<old-name>/test-skill-structure.sh`, `.opencode/plugins/<old-name>.js`, `.pi/extensions/<old-name>.ts`, `assets/<old-name>-small.svg`).
- **Untracked files in the working tree:** `docs/ultrapowers-requirements.md` (16 old-name hits), `Screenshot 2026-09-30 083306.png`, `Screenshot 2026-09-30 083338.png`. The rename script only touches `git ls-files`. The requirements document is a permitted exception under spec D2 (it records the owner's own words), so acceptance criterion 1 lists it as expected. Suggest to your human partner that it be committed as-is; do not rename its text.
- Line numbers quoted below are from the current tree. Task 1 substitutes text within lines and never adds or removes lines, so line numbers stay valid after Task 1 for every file that Task 1 does not move. For moved files the new path is given.
- Acceptance criterion 6 (install into Claude Code, bootstrap says `You have ultrapowers.`, `/ultrapowers:brainstorming` loads) is a manual check in a real Claude Code session. Task 11 gives the steps; it cannot be scripted here.
- Tests in `tests/brainstorm-server/` write under `/tmp/...`; on Windows node resolves `/tmp` to the current drive root (`S:\tmp`). That is pre-existing behavior, not something this plan changes.

**Expected interim red:** Between Task 1 and Task 10 every suite except the ones each task runs may be red. Each task says which suites it runs and expects green. Task 10 and Task 11 bring everything green.

---

### Task 1: Reproducible rename script and the rename itself

**Files:**
- Create: `scripts/rename-fork.sh`
- Create: `tests/rename-fork/test-rename-fork.sh`
- Modify (by running the script): 145 tracked text files; 68 tracked paths moved with `git mv`

**Interfaces:**
- Consumes: `git ls-files`, bash 4.4+ (`${var^}`, `${var^^}`, `mapfile -d ''`), GNU `sed -i`, `grep -I`.
- Produces: `scripts/rename-fork.sh [--dry-run] [-x <tracked-path>]... <old-name> <new-name> <old-owner> <new-owner>`. Exit 0 on success. Prints `edit  <path>` / `move  <path> -> <path>` lines in dry-run mode and a final summary line `rename-fork: N file(s) edited, M path(s) moved`. Later tasks rely on the renamed identifiers it produces: `ULTRAPOWERS_VERSION`, `readUltrapowersVersion`, `UltrapowersPlugin`, `ultrapowersSkillsDir`, `ultrapowersPiExtension`, `ultrapowers:using-ultrapowers bootstrap for pi|hermes`, `You have ultrapowers.`, `.ultrapowers/`, `ULTRAPOWERS_*` env vars, paths `skills/using-ultrapowers/`, `skills/diagnosing-ultrapowers/`, `tests/diagnosing-ultrapowers/`, `docs/ultrapowers/{specs,plans}/`, `.opencode/plugins/ultrapowers.js`, `.pi/extensions/ultrapowers.ts`, `assets/ultrapowers-small.svg`.

The script takes the names as arguments so that neither the script nor its test contains the literal old name (D2 / acceptance criterion 1). The test fixture uses `oldbrand`/`newbrand` and `olduser`/`newuser`.

- [ ] **Step 1: Write the failing test**

Create `tests/rename-fork/test-rename-fork.sh`:

```bash
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
  "git -C '$fixture' status --porcelain | grep -q '^R  docs/oldbrand/specs/a.md -> docs/newbrand/specs/a.md$'"
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bash tests/rename-fork/test-rename-fork.sh`
Expected: exits non-zero at the `cp "$SCRIPT_UNDER_TEST"` line with `cp: cannot stat '.../scripts/rename-fork.sh': No such file or directory` (set -e aborts before any check runs).

- [ ] **Step 3: Write the script**

Create `scripts/rename-fork.sh` (mode 755; `git add --chmod=+x` in the commit step):

```bash
#!/usr/bin/env bash
#
# rename-fork.sh — rename a plugin identity across every tracked text file
# and every tracked path, in three case variants, plus one owner/name pair.
#
# Usage:
#   scripts/rename-fork.sh [--dry-run] [-x <tracked-path>]... <old-name> <new-name> <old-owner> <new-owner>
#
# In order:
#   1. Content pass over every tracked text file not excluded with -x:
#        <old-owner>/<old-name>  ->  <new-owner>/<new-name>
#        <old-name>              ->  <new-name>
#        <Old-name>              ->  <New-name>     (first letter upper-cased)
#        <OLD-NAME>              ->  <NEW-NAME>     (all upper-cased)
#   2. Path pass: every tracked path containing <old-name> in any variant is
#      `git mv`-ed to its renamed path. Parent directories are created, so a
#      move into a directory that already exists merges into it.
#   3. Directories the moves left empty are removed.
#
# Binary files (grep -I) are never edited. Untracked files are never touched.
# Nothing is committed. Needs bash 4.4+ (case modification, mapfile -d).
set -euo pipefail

usage() { sed -n '2,20p' "$0" | sed 's/^# \{0,1\}//'; }
die() { echo "error: $*" >&2; exit 1; }

dry_run=false
excludes=()
positional=()
while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run) dry_run=true ;;
    -x) [[ $# -ge 2 ]] || die "-x needs a path"; excludes+=("$2"); shift ;;
    -h | --help) usage; exit 0 ;;
    -*) die "unknown option: $1" ;;
    *) positional+=("$1") ;;
  esac
  shift
done
[[ ${#positional[@]} -eq 4 ]] || { usage >&2; exit 1; }

old="${positional[0]}"
new="${positional[1]}"
old_owner="${positional[2]}"
new_owner="${positional[3]}"
for v in "$old" "$new" "$old_owner" "$new_owner"; do
  [[ "$v" =~ ^[A-Za-z0-9_.-]+$ ]] || die "argument '$v' must match ^[A-Za-z0-9_.-]+\$"
done
[[ "$old" != "$new" ]] || die "old and new names are identical"

old_cap="${old^}"
new_cap="${new^}"
old_up="${old^^}"
new_up="${new^^}"

git rev-parse --is-inside-work-tree >/dev/null 2>&1 || die "run from inside a git work tree"
cd "$(git rev-parse --show-toplevel)"

is_excluded() {
  local path="$1" ex
  for ex in "${excludes[@]+"${excludes[@]}"}"; do
    [[ "$path" == "$ex" ]] && return 0
  done
  return 1
}

# Arguments are restricted to [A-Za-z0-9_.-], so '.' is the only regex
# metacharacter that can appear; escape it for the sed patterns.
sed_lit() { printf '%s' "$1" | sed 's/[.]/\\&/g'; }

sed_script="s#$(sed_lit "$old_owner/$old")#$new_owner/$new#g
s#$(sed_lit "$old")#$new#g
s#$(sed_lit "$old_cap")#$new_cap#g
s#$(sed_lit "$old_up")#$new_up#g"

mapfile -d '' tracked < <(git ls-files -z)

# 1. Content pass
edited=0
for path in "${tracked[@]}"; do
  [[ -f "$path" ]] || continue
  is_excluded "$path" && continue
  # -I makes grep treat binary files as non-matching, so they are never edited.
  grep -I -q -i -F -- "$old" "$path" 2>/dev/null || continue
  if [[ "$dry_run" == true ]]; then
    echo "edit  $path"
  else
    sed -i -e "$sed_script" -- "$path"
  fi
  edited=$((edited + 1))
done

# 2. Path pass
moved=0
for path in "${tracked[@]}"; do
  is_excluded "$path" && continue
  case "$path" in
    *"$old"* | *"$old_cap"* | *"$old_up"*) ;;
    *) continue ;;
  esac
  target="${path//"$old"/"$new"}"
  target="${target//"$old_cap"/"$new_cap"}"
  target="${target//"$old_up"/"$new_up"}"
  if [[ "$dry_run" == true ]]; then
    echo "move  $path -> $target"
  else
    [[ -e "$target" ]] && die "target already exists: $target"
    mkdir -p "$(dirname "$target")"
    git mv -- "$path" "$target"
  fi
  moved=$((moved + 1))
done

# 3. Remove directories the moves emptied (children before parents).
if [[ "$dry_run" != true ]]; then
  while IFS= read -r -d '' dir; do
    if rmdir "$dir" 2>/dev/null; then
      echo "rmdir $dir"
    fi
  done < <(find . -path ./.git -prune -o -type d -iname "*${old}*" -print0 | sort -rz)
fi

suffix=""
[[ "$dry_run" == true ]] && suffix=" (dry run)"
echo "rename-fork: $edited file(s) edited, $moved path(s) moved$suffix"
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `chmod +x scripts/rename-fork.sh tests/rename-fork/test-rename-fork.sh && bash tests/rename-fork/test-rename-fork.sh`
Expected: 17 `[PASS]` lines and a final `STATUS: PASSED`.

- [ ] **Step 5: Syntax-check the two new shell files (shellcheck may be missing)**

Run: `bash -n scripts/rename-fork.sh && bash -n tests/rename-fork/test-rename-fork.sh && echo SYNTAX_OK`
Expected: `SYNTAX_OK`. If `shellcheck` is installed, also run `shellcheck scripts/rename-fork.sh tests/rename-fork/test-rename-fork.sh` and expect no output.

- [ ] **Step 6: Commit the script and its test**

```bash
git add --chmod=+x scripts/rename-fork.sh tests/rename-fork/test-rename-fork.sh
git commit -m "scripts: add rename-fork.sh, a parameterised tracked-file rename with git mv path moves

Three case variants plus one owner/name pair, over git ls-files only.
Binary files and untracked files are never touched; emptied directories
are removed. Tested against a throwaway repo in tests/rename-fork/.

RAOOF A."
```

- [ ] **Step 7: Dry-run the real rename**

Run:
```bash
bash scripts/rename-fork.sh --dry-run \
  -x LICENSE \
  -x docs/ultrapowers/specs/2026-09-30-rename-and-fork-hygiene-design.md \
  -x docs/ultrapowers/plans/2026-09-30-rename-and-fork-hygiene.md \
  <old-name> ultrapowers obra raoofaltaher | tail -3
```
Expected last line: `rename-fork: 145 file(s) edited, 68 path(s) moved (dry run)`. (145 counts tracked text files containing the old name minus the excluded spec; if this plan has been committed before you run it, the count is unchanged because the plan is excluded by `-x`.) Spot-check two `move` lines exist: `move  docs/<old-name>/specs/2026-08-27-diagnosing-<old-name>-design.md -> docs/ultrapowers/specs/2026-08-27-diagnosing-ultrapowers-design.md` and `move  skills/using-<old-name>/SKILL.md -> skills/using-ultrapowers/SKILL.md`.

- [ ] **Step 8: Run the real rename**

Run the same command without `--dry-run`:
```bash
bash scripts/rename-fork.sh \
  -x LICENSE \
  -x docs/ultrapowers/specs/2026-09-30-rename-and-fork-hygiene-design.md \
  -x docs/ultrapowers/plans/2026-09-30-rename-and-fork-hygiene.md \
  <old-name> ultrapowers obra raoofaltaher
```
Expected output ends with `rmdir ./docs/<old-name>/specs`, `rmdir ./docs/<old-name>/plans`, `rmdir ./docs/<old-name>`, `rmdir ./skills/using-<old-name>/references`, `rmdir ./skills/using-<old-name>`, `rmdir ./skills/diagnosing-<old-name>/templates` (and the other diagnosing subdirs), `rmdir ./skills/diagnosing-<old-name>`, `rmdir ./tests/diagnosing-<old-name>`, then `rename-fork: 145 file(s) edited, 68 path(s) moved`.

- [ ] **Step 9: Verify the blind pass left nothing behind**

Run:
```bash
grep -rIl -i <old-name> . --exclude-dir=.git --exclude-dir=.remember | sort
```
Expected exactly these lines (the two excluded spec/plan files plus the untracked requirements file noted above):
```
./docs/ultrapowers-requirements.md
./docs/ultrapowers/plans/2026-09-30-rename-and-fork-hygiene.md
./docs/ultrapowers/specs/2026-09-30-rename-and-fork-hygiene-design.md
```
(`README.md` does not appear yet: its fork notice is written in Task 5.)

Run: `find . -path ./.git -prune -o -iname '*<old-name>*' -print`
Expected: no output.

Run: `git status --short | grep -c '^R'`
Expected: `68`.

- [ ] **Step 10: Confirm the consumers listed in spec 4.2 read correctly**

Run each and compare with the expected line:

```bash
sed -n '11p;27p' hooks/session-start
```
Expected (the lowercase shell variables `using_<old-name>_content` / `using_<old-name>_escaped` contain the old name, so the script renamed them too):
```
using_ultrapowers_content=$(cat "${PLUGIN_ROOT}/skills/using-ultrapowers/SKILL.md" 2>&1 || echo "Error reading using-ultrapowers skill")
session_context="<EXTREMELY_IMPORTANT>\nYou have ultrapowers.\n\n**Below is the full content of your 'ultrapowers:using-ultrapowers' skill - your introduction to using skills. For all other skills, use the 'Skill' tool:**\n\n${using_ultrapowers_escaped}\n</EXTREMELY_IMPORTANT>"
```

```bash
cat GEMINI.md
```
Expected:
```
@./skills/using-ultrapowers/SKILL.md
@./skills/using-ultrapowers/references/gemini-tools.md
```

```bash
sed -n '7p;12p;16p;68p' .pi/extensions/ultrapowers.ts
```
Expected:
```
const BOOTSTRAP_MARKER = "ultrapowers:using-ultrapowers bootstrap for pi";
const bootstrapSkillPath = resolve(skillsDir, "using-ultrapowers", "SKILL.md");
export default function ultrapowersPiExtension(pi: ExtensionAPI) {
You have ultrapowers.
```

```bash
sed -n '25p;121p;131p;219p;380p' .opencode/plugins/ultrapowers.js
```
Expected:
```
const ultrapowersSkillsDir = path.resolve(__dirname, '../../skills');
  const skillPath = path.join(ultrapowersSkillsDir, 'using-ultrapowers', 'SKILL.md');
You have ultrapowers.
export const UltrapowersPlugin = async ({ client, directory }) => {
  id: 'ultrapowers',
```

```bash
sed -n '5p;11p;31p;56p;63p' .hermes-plugin/__init__.py
```
Expected:
```
BOOTSTRAP_MARKER = "ultrapowers:using-ultrapowers bootstrap for hermes"
    - git-clone install (`hermes plugins install raoofaltaher/ultrapowers`): the plugin
        "`hermes plugins install raoofaltaher/ultrapowers`."
        f"You have ultrapowers.\n\n"
        f'invoke one with `skill_view("ultrapowers:skill-name")` '
```

```bash
sed -n '39p' skills/using-ultrapowers/references/hermes-tools.md
```
Expected: `read_file(path="~/.hermes/plugins/ultrapowers/skills/<skill-name>/SKILL.md")`

```bash
sed -n '46p' skills/subagent-driven-development/scripts/sdd-workspace; sed -n '117p' skills/brainstorming/scripts/start-server.sh; sed -n '4p' .gitignore
```
Expected:
```
base="$root/.ultrapowers/sdd"
  SESSION_DIR="${PROJECT_DIR}/.ultrapowers/brainstorm/${SESSION_ID}"
.ultrapowers/
```

```bash
sed -n '9p;17p' index.js package.json
```
Expected `index.js` line 9: `export { default } from "./.opencode/plugins/ultrapowers.js";` and `package.json` line 17: `      "./.pi/extensions/ultrapowers.ts"`.

- [ ] **Step 11: Run the suites that need only the blind pass to be consistent**

Run: `bash tests/hooks/test-session-start.sh`
Expected: `STATUS: PASSED`.

Run: `node --test tests/pi/test-pi-extension.mjs`
Expected: all tests `ok`, `# fail 0`.

Run: `python -m pytest tests/hermes -q`
Expected: all passed, e.g. `.......... N passed`.

Run: `bash tests/opencode/run-tests.sh`
Expected: `STATUS: PASSED` (four unit tests; integration tests not run).

Run: `bash tests/diagnosing-ultrapowers/test-skill-structure.sh`
Expected: final line `Passed: N  Failed: 0` and exit 0.

Run: `bash tests/claude-code/test-sdd-workspace.sh && bash tests/claude-code/test-executing-plans-scripts.sh && bash tests/claude-code/test-worktree-path-policy.sh`
Expected: each prints `STATUS: PASSED` (or `Passed: N Failed: 0`) and exits 0.

Run: `bash tests/kimi/run-tests.sh && bash tests/devin/test-devin-plugin.sh`
Expected: `Kimi plugin manifest looks good` and `PASS: Devin CLI plugin valid (manifest)`.

Suites known red at this point (fixed later): `tests/codex/test-marketplace-manifest.sh` stays green now but goes red in Task 2 until its Task 2 edit; `tests/brainstorm-server/branding.test.js` fails until Task 3 (it asserts the remote image URL that the script mangled to `.../ultrapowers-visual-brainstorming-logo.png`, which the server still serves as the remote image constant).

- [ ] **Step 12: Commit the rename**

```bash
git add -A
git commit -m "rename: <old-name> -> ultrapowers across every tracked file and path

Applied with scripts/rename-fork.sh (three case variants plus
obra/<old-name> -> raoofaltaher/ultrapowers). LICENSE and the piece 1
spec/plan were excluded. 145 files edited, 68 paths moved; docs/<old-name>
merged into the existing docs/ultrapowers.

RAOOF A."
```

---

### Task 2: Manifest identity, LICENSE, version 1.0.0

**Files:**
- Modify: `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`, `.codex-plugin/plugin.json`, `.agents/plugins/marketplace.json`, `.cursor-plugin/plugin.json`, `.devin-plugin/plugin.json`, `.hermes-plugin/plugin.yaml`, `.kimi-plugin/plugin.json`, `.muse-plugin/plugin.json` (version only), `.muse-plugin/marketplace.json`, `gemini-extension.json` (version only), `package.json` (version only)
- Modify: `LICENSE:3`
- Modify: `.version-bump.json:15-25`
- Modify: `hooks/session-start:38`
- Modify: `.opencode/INSTALL.md:82`, `docs/README.opencode.md:114` (stale `#v6.4.2` pins)
- Test: `tests/codex/test-marketplace-manifest.sh:25-28`, plus `tests/kimi/run-tests.sh`, `tests/devin/test-devin-plugin.sh`, `tests/version-bump/test-bump-version.sh`, `node --test tests/pi/test-pi-extension.mjs`

**Interfaces:**
- Consumes: post-Task 1 manifests (names already `ultrapowers`, marketplace names `ultrapowers-dev`, display names `Ultrapowers Dev`, authors still Jesse Vincent).
- Produces: every manifest at version `1.0.0`, author `{ "name": "RAOOF A." }`, owner `{ "name": "raoofaltaher", "url": "https://github.com/raoofaltaher" }`, marketplace name `ultrapowers`, display name `Ultrapowers`. Task 3's `readUltrapowersVersion()` reads `package.json` version `1.0.0`; Task 5's README states the same install identifiers `ultrapowers@ultrapowers`.

Prerequisite: `yq` (mikefarah v4) and `jq` on `PATH` (see "Before you start"). Write the manifests with `6.4.2` still in place; Step 9 bumps all eleven with the script, as the spec requires.

- [ ] **Step 1: Write `.claude-plugin/plugin.json`**

```json
{
  "name": "ultrapowers",
  "description": "Core skills library for Claude Code: TDD, debugging, collaboration patterns, and proven techniques",
  "version": "6.4.2",
  "author": {
    "name": "RAOOF A."
  },
  "homepage": "https://github.com/raoofaltaher/ultrapowers",
  "repository": "https://github.com/raoofaltaher/ultrapowers",
  "license": "MIT",
  "keywords": [
    "skills",
    "tdd",
    "debugging",
    "collaboration",
    "best-practices",
    "workflows"
  ]
}
```

- [ ] **Step 2: Write `.claude-plugin/marketplace.json`**

```json
{
  "name": "ultrapowers",
  "description": "Marketplace for the Ultrapowers core skills library",
  "owner": {
    "name": "raoofaltaher",
    "url": "https://github.com/raoofaltaher"
  },
  "plugins": [
    {
      "name": "ultrapowers",
      "description": "Core skills library for Claude Code: TDD, debugging, collaboration patterns, and proven techniques",
      "version": "6.4.2",
      "source": "./",
      "author": {
        "name": "RAOOF A."
      }
    }
  ]
}
```

- [ ] **Step 3: Write `.codex-plugin/plugin.json`**

```json
{
  "name": "ultrapowers",
  "version": "6.4.2",
  "description": "An agentic skills framework & software development methodology that works: planning, TDD, debugging, and collaboration workflows.",
  "author": {
    "name": "RAOOF A."
  },
  "homepage": "https://github.com/raoofaltaher/ultrapowers",
  "repository": "https://github.com/raoofaltaher/ultrapowers",
  "license": "MIT",
  "keywords": [
    "brainstorming",
    "subagent-driven-development",
    "skills",
    "planning",
    "tdd",
    "debugging",
    "code-review",
    "workflow"
  ],
  "skills": "./skills/",
  "hooks": {},
  "interface": {
    "displayName": "Ultrapowers",
    "shortDescription": "Planning, TDD, debugging, and delivery workflows for coding agents",
    "longDescription": "Use Ultrapowers to guide agent work through brainstorming, implementation planning, test-driven development, systematic debugging, parallel execution, code review, and finish-the-branch workflows.",
    "developerName": "RAOOF A.",
    "category": "Developer Tools",
    "capabilities": [
      "Interactive",
      "Read",
      "Write"
    ],
    "defaultPrompt": [
      "I've got an idea for something I'd like to build.",
      "Let's add a feature to this project."
    ],
    "websiteURL": "https://github.com/raoofaltaher/ultrapowers",
    "privacyPolicyURL": "https://github.com/raoofaltaher/ultrapowers",
    "termsOfServiceURL": "https://github.com/raoofaltaher/ultrapowers",
    "brandColor": "#F59E0B",
    "composerIcon": "./assets/ultrapowers-small.svg",
    "logo": "./assets/app-icon.png",
    "screenshots": []
  }
}
```

`"hooks": {}` must stay exactly an empty object; `tests/codex/test-marketplace-manifest.sh:69-73` asserts it (it suppresses Codex's `hooks/hooks.json` auto-discovery).

- [ ] **Step 4: Write `.agents/plugins/marketplace.json`**

```json
{
  "name": "ultrapowers",
  "interface": {
    "displayName": "Ultrapowers"
  },
  "plugins": [
    {
      "name": "ultrapowers",
      "source": {
        "source": "url",
        "url": "./"
      },
      "policy": {
        "installation": "AVAILABLE",
        "authentication": "ON_INSTALL"
      },
      "category": "Developer Tools"
    }
  ]
}
```

- [ ] **Step 5: Write `.cursor-plugin/plugin.json` and `.devin-plugin/plugin.json`**

`.cursor-plugin/plugin.json`:
```json
{
  "name": "ultrapowers",
  "displayName": "Ultrapowers",
  "description": "Core skills library: TDD, debugging, collaboration patterns, and proven techniques",
  "version": "6.4.2",
  "author": {
    "name": "RAOOF A."
  },
  "homepage": "https://github.com/raoofaltaher/ultrapowers",
  "repository": "https://github.com/raoofaltaher/ultrapowers",
  "license": "MIT",
  "keywords": [
    "skills",
    "tdd",
    "debugging",
    "collaboration",
    "best-practices",
    "workflows"
  ],
  "skills": "./skills/",
  "hooks": "./hooks/hooks-cursor.json"
}
```

`.devin-plugin/plugin.json`:
```json
{
  "name": "ultrapowers",
  "version": "6.4.2",
  "description": "An agentic skills framework & software development methodology that works: planning, TDD, debugging, and collaboration workflows.",
  "author": {
    "name": "RAOOF A."
  },
  "homepage": "https://github.com/raoofaltaher/ultrapowers",
  "repository": "https://github.com/raoofaltaher/ultrapowers",
  "license": "MIT",
  "keywords": [
    "brainstorming",
    "subagent-driven-development",
    "skills",
    "planning",
    "tdd",
    "debugging",
    "code-review",
    "workflow"
  ]
}
```

- [ ] **Step 6: Write `.hermes-plugin/plugin.yaml` and `.kimi-plugin/plugin.json`**

`.hermes-plugin/plugin.yaml`:
```yaml
name: ultrapowers
version: 6.4.2
description: Ultrapowers skills and workflow bootstrap for Hermes Agent
author: raoofaltaher
provides_hooks:
  - pre_llm_call
```

`.kimi-plugin/plugin.json` (the `skillInstructions` string is one JSON line; it is Task 1's output with the author, homepage and websiteURL fields replaced):
```json
{
  "name": "ultrapowers",
  "version": "6.4.2",
  "description": "An agentic skills framework and software development methodology.",
  "author": {
    "name": "RAOOF A."
  },
  "homepage": "https://github.com/raoofaltaher/ultrapowers",
  "license": "MIT",
  "keywords": [
    "brainstorming",
    "subagent-driven-development",
    "skills",
    "planning",
    "tdd",
    "debugging",
    "code-review",
    "workflow"
  ],
  "skills": "./skills/",
  "sessionStart": {
    "skill": "using-ultrapowers"
  },
  "skillInstructions": "Kimi Code tool mapping for Ultrapowers skills:\n\n- When an Ultrapowers skill says to ask the user, ask clarifying questions, ask one question at a time, present multiple-choice options, use the terminal for a question, or wait for the user's choice, call Kimi Code's `AskUserQuestion` tool. Do not render those choices as plain assistant text unless `AskUserQuestion` is unavailable or the session is in auto permission mode.\n- For `AskUserQuestion`, provide 1 question with 2-4 concrete options when possible. Put the recommended option first and suffix its label with `(Recommended)`.\n- When an Ultrapowers skill refers to `TodoWrite`, use Kimi Code's `TodoList` tool.\n- When an Ultrapowers skill says `Task tool (general-purpose)` or asks you to dispatch an implementer/reviewer subagent, use Kimi Code's `Agent` tool with a Kimi subagent type. Do not pass `general-purpose` as `subagent_type`.\n- For implementation, code review, spec review, quality review, and filled Ultrapowers subagent prompt templates, call `Agent` with `subagent_type: \"coder\"`, paste the fully filled prompt into `prompt`, and provide a short `description`.\n- For read-only codebase exploration that would take several searches, use `Agent` with `subagent_type: \"explore\"`.\n- For read-only planning or architecture design, use `Agent` with `subagent_type: \"plan\"`.\n- Keep dependent Ultrapowers subagent steps sequential. Use multiple `Agent` calls, or `run_in_background: true` only when the work is independent and background agents are available.\n- When an Ultrapowers skill refers to the `Skill` tool, use Kimi Code's native `Skill` tool.\n- Use Kimi Code's `Read`, `Write`, `Edit`, `Bash`, `Grep`, `Glob`, `FetchURL`, `WebSearch`, and MCP tools by their actual exposed names.\n- When a skill asks to search file contents, use `Grep`; when it asks to find files by path or pattern, use `Glob`; when it asks to fetch a URL, use `FetchURL`; when it asks to search the web, use `WebSearch`.",
  "interface": {
    "displayName": "Ultrapowers",
    "shortDescription": "Planning, TDD, debugging, and delivery workflows for coding agents",
    "longDescription": "Use Ultrapowers to guide agent work through brainstorming, implementation planning, test-driven development, systematic debugging, parallel execution, code review, and finish-the-branch workflows.",
    "developerName": "RAOOF A.",
    "capabilities": [
      "Interactive",
      "Read",
      "Write"
    ],
    "websiteURL": "https://github.com/raoofaltaher/ultrapowers"
  }
}
```

(Grammar note: the blind pass produced the article "a" before "Ultrapowers"; a follow-up commit corrected it to "an" everywhere.)

- [ ] **Step 7: Write `.muse-plugin/marketplace.json`; verify `.muse-plugin/plugin.json`, `gemini-extension.json`, `package.json`**

`.muse-plugin/marketplace.json`:
```json
{
  "name": "ultrapowers",
  "description": "Marketplace for the Ultrapowers core skills library",
  "owner": {
    "name": "raoofaltaher",
    "url": "https://github.com/raoofaltaher"
  },
  "plugins": [
    {
      "name": "ultrapowers",
      "description": "Core skills library for Muse: TDD, debugging, collaboration patterns, and proven techniques",
      "version": "6.4.2",
      "source": "./",
      "author": {
        "name": "RAOOF A."
      }
    }
  ]
}
```

`.muse-plugin/plugin.json` needs no manual edit beyond the version bump; Task 1 renamed the two skill entries. Verify:
```bash
sed -n '3,4p;18,19p;58,59p' .muse-plugin/plugin.json
```
Expected:
```
  "name": "ultrapowers",
  "displayName": "Ultrapowers",
        "id": "diagnosing-ultrapowers",
        "path": "skills/diagnosing-ultrapowers/SKILL.md"
        "id": "using-ultrapowers",
        "path": "skills/using-ultrapowers/SKILL.md"
```

Muse completeness check (spec section 6 risk): every `skills/*/SKILL.md` must appear in the Muse list.
```bash
for d in skills/*/; do n="$(basename "$d")"; jq -e --arg n "$n" '.capabilities.skills[] | select(.id == $n and .path == "skills/\($n)/SKILL.md")' .muse-plugin/plugin.json >/dev/null || echo "MISSING in Muse manifest: $n"; done; echo MUSE_CHECK_DONE
```
Expected: only `MUSE_CHECK_DONE`.

`gemini-extension.json` and `package.json` have no author fields; Task 1 renamed them. Verify:
```bash
sed -n '2p' gemini-extension.json; sed -n '2p;4p;6p' package.json
```
Expected:
```
  "name": "ultrapowers",
  "name": "ultrapowers",
  "description": "Ultrapowers skills and runtime bootstrap for coding agents",
  "main": ".opencode/plugins/ultrapowers.js",
```

- [ ] **Step 8: LICENSE, the hook comment, and the stale tag pins**

`LICENSE` lines 1-4 become:
```
MIT License

Copyright (c) 2026 RAOOF A.
Copyright (c) 2025 Jesse Vincent
```
(Insert one line above the existing line 3; everything else unchanged.)

`hooks/session-start:38` currently reads (post-Task 1) `# See: https://github.com/raoofaltaher/ultrapowers/issues/571` — that issue number belongs to upstream, not this repo. Replace the line with:
```
# See upstream issue obra#571 (bash 5.3+ heredoc hang).
```

`.opencode/INSTALL.md:82` and `docs/README.opencode.md:114` currently read:
```
  "plugin": ["ultrapowers@git+https://github.com/raoofaltaher/ultrapowers.git#v6.4.2"]
```
Change both to:
```
  "plugin": ["ultrapowers@git+https://github.com/raoofaltaher/ultrapowers.git#v1.0.0"]
```

- [ ] **Step 9: Update `.version-bump.json` audit excludes, then bump**

Write `.version-bump.json`:
```json
{
  "files": [
    { "path": "package.json", "field": "version" },
    { "path": ".hermes-plugin/plugin.yaml", "field": "version" },
    { "path": ".claude-plugin/plugin.json", "field": "version" },
    { "path": ".cursor-plugin/plugin.json", "field": "version" },
    { "path": ".codex-plugin/plugin.json", "field": "version" },
    { "path": ".devin-plugin/plugin.json", "field": "version" },
    { "path": ".kimi-plugin/plugin.json", "field": "version" },
    { "path": ".muse-plugin/plugin.json", "field": "version" },
    { "path": ".claude-plugin/marketplace.json", "field": "plugins.0.version" },
    { "path": ".muse-plugin/marketplace.json", "field": "plugins.0.version" },
    { "path": "gemini-extension.json", "field": "version" }
  ],
  "audit": {
    "exclude": [
      "RELEASE-NOTES.md",
      "node_modules",
      "docs",
      "tests",
      ".git",
      ".version-bump.json",
      "scripts/bump-version.sh"
    ]
  }
}
```
Why: `docs` holds specs and history plans that mention `1.0.0`; `tests/brainstorm-server/package.json` and its lockfile are version `1.0.0` themselves and `tests/claude-code/test-subagent-driven-development-integration.sh` contains an unrelated `1.0.0`. `CHANGELOG.md` and `evals` are dropped from the list: the first does not exist, the second is removed by D9.

Run: `bash scripts/bump-version.sh 1.0.0`
Expected: eleven lines of the form `  package.json (version)                       6.4.2 -> 1.0.0`, then `Done. Running audit...`, the version table at `1.0.0`, `All declared files are in sync at 1.0.0`, and `No undeclared files contain the version string. All clear.`

Run: `bash scripts/bump-version.sh --check`
Expected: eleven rows all `1.0.0` and `All declared files are in sync at 1.0.0`; exit 0.

Run: `git diff --stat -- .hermes-plugin/plugin.yaml && cat .hermes-plugin/plugin.yaml`
Expected: `version: 1.0.0`; the other five lines unchanged (yq rewrites the file in place; confirm it did not reorder keys or drop `provides_hooks`).

- [ ] **Step 10: Fix the Codex marketplace test (goes red with the new marketplace name)**

`tests/codex/test-marketplace-manifest.sh` lines 25-30 currently read (post-Task 1):
```python
assert_equal(marketplace.get("name"), "ultrapowers-dev", "marketplace name")
assert_equal(
    marketplace.get("interface", {}).get("displayName"),
    "Ultrapowers Dev",
    "marketplace display name",
)
```
Change to:
```python
assert_equal(marketplace.get("name"), "ultrapowers", "marketplace name")
assert_equal(
    marketplace.get("interface", {}).get("displayName"),
    "Ultrapowers",
    "marketplace display name",
)
```
Lines 36-37 (`plugin.get("name") == "ultrapowers"` / `"ultrapowers plugin entry count"`) are already correct.

- [ ] **Step 11: Run the manifest suites**

Run: `bash tests/codex/test-marketplace-manifest.sh`
Expected: `Codex marketplace manifest looks good`.

Run: `bash tests/kimi/run-tests.sh && bash tests/devin/test-devin-plugin.sh`
Expected: `Kimi plugin manifest looks good` and `PASS: Devin CLI plugin valid (manifest)` (Devin compares manifest version to `package.json` version; both `1.0.0`).

Run: `node --test tests/pi/test-pi-extension.mjs`
Expected: `# fail 0`.

Run: `bash tests/version-bump/test-bump-version.sh`
Expected: exit 0 with its pass lines (needs `jq` and `yq`).

Run: `for f in .claude-plugin/plugin.json .claude-plugin/marketplace.json .codex-plugin/plugin.json .agents/plugins/marketplace.json .cursor-plugin/plugin.json .devin-plugin/plugin.json .kimi-plugin/plugin.json .muse-plugin/plugin.json .muse-plugin/marketplace.json gemini-extension.json package.json; do jq -e . "$f" >/dev/null || echo "BAD JSON: $f"; done; grep -l -E '"email"|fsck\.com|Jesse Vincent|obra' .claude-plugin/* .codex-plugin/* .agents/plugins/* .cursor-plugin/* .devin-plugin/* .hermes-plugin/plugin.yaml .kimi-plugin/* .muse-plugin/* gemini-extension.json package.json; echo MANIFEST_SCAN_DONE`
Expected: only `MANIFEST_SCAN_DONE` (valid JSON everywhere; no email, no upstream author or owner in any manifest).

- [ ] **Step 12: Commit**

```bash
git add .claude-plugin .codex-plugin .agents .cursor-plugin .devin-plugin .hermes-plugin/plugin.yaml .kimi-plugin .muse-plugin gemini-extension.json package.json LICENSE .version-bump.json hooks/session-start .opencode/INSTALL.md docs/README.opencode.md tests/codex/test-marketplace-manifest.sh
git commit -m "manifests: ultrapowers identity, fork owner, version 1.0.0

Plugin and marketplace names are ultrapowers, display name Ultrapowers,
author RAOOF A. with no email, owner raoofaltaher, all URLs at
github.com/raoofaltaher/ultrapowers. LICENSE gains the 2026 copyright
line above the upstream one. Version bumped to 1.0.0 across the eleven
registered files with scripts/bump-version.sh; audit excludes docs and
tests, which carry their own 1.0.0 strings.

RAOOF A."
```

---

### Task 3: Remove visual-companion telemetry; serve the bundled logo

**Files:**
- Modify: `skills/brainstorming/scripts/server.cjs:105-112`, `:171`, `:227-232`, `:242-252`, `:434` (route insertion inside `handleRequest`)
- Modify: `skills/brainstorming/scripts/frame-template.html:69-72`
- Rewrite: `tests/brainstorm-server/branding.test.js`

**Interfaces:**
- Consumes: `readUltrapowersVersion()` (Task 1 rename of `read<Old-name>Version`, `server.cjs:208`), `securityHeaders()` (`:366`), `isAuthorized()` (`:341`), `pathnameOf()` (`:355`), `escapeHtmlText()` (`:234`), `assets/ultrapowers-small.svg` (Task 1 move).
- Produces: constants `BRAND_LOGO_PATH = '/brand-logo.svg'` and `BRAND_LOGO_FILE`; route `GET /brand-logo.svg` (authorized: 200 `image/svg+xml`; asset missing: 404); brand markup `<div class="brand"><a href="https://github.com/raoofaltaher/ultrapowers"><img class="brand-logo" src="/brand-logo.svg" alt="Ultrapowers" decoding="async"><span class="brand-copy">Ultrapowers v<version></span></a></div>`. Task 11 criterion 8 greps served HTML for `primeradiant.com`.

- [ ] **Step 1: Write the failing test (full replacement of `tests/brainstorm-server/branding.test.js`)**

```js
/**
 * Tests for the visual companion's Ultrapowers branding.
 *
 * The brand row shows the bundled SVG served by the companion itself and
 * the text "Ultrapowers v<version>". Nothing is fetched from, or reported
 * to, a remote host, and no environment variable changes the markup.
 */

const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const REPO_ROOT = path.join(__dirname, '../..');
const SERVER_PATH = path.join(REPO_ROOT, 'skills/brainstorming/scripts/server.cjs');
const LOGO_PATH = path.join(REPO_ROOT, 'assets/ultrapowers-small.svg');
const PACKAGE_VERSION = JSON.parse(
  fs.readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf-8')
).version;
const TOKEN = 'testtoken-branding-0123456789abcdef';
const REPO_URL = 'https://github.com/raoofaltaher/ultrapowers';
// Built from two halves so this file itself never contains the upstream
// name (the repo-wide rename check greps every file).
const UPSTREAM_NAME = ['super', 'powers'].join('');

function cleanup(dir) {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true });
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function startServer({ port, dir, env = {}, serverPath = SERVER_PATH }) {
  cleanup(dir);
  return spawn('node', [serverPath], {
    env: {
      ...process.env,
      BRAINSTORM_PORT: String(port),
      BRAINSTORM_DIR: dir,
      BRAINSTORM_TOKEN: TOKEN,
      ...env
    }
  });
}

function waitForServer(server) {
  let stdout = '';
  let stderr = '';

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`Server did not start. stderr: ${stderr}`)), 5000);
    server.stdout.on('data', (data) => {
      stdout += data.toString();
      if (stdout.includes('server-started')) {
        clearTimeout(timeout);
        resolve();
      }
    });
    server.stderr.on('data', (data) => { stderr += data.toString(); });
    server.on('error', reject);
  });
}

function fetchPath(port, pathname, { authorized = true } = {}) {
  return new Promise((resolve, reject) => {
    const headers = authorized ? { Cookie: `brainstorm-key-${port}=${TOKEN}` } : {};
    http.get(`http://localhost:${port}${pathname}`, { headers }, (res) => {
      const chunks = [];
      res.on('data', chunk => { chunks.push(chunk); });
      res.on('end', () => resolve({
        status: res.statusCode,
        headers: res.headers,
        body: Buffer.concat(chunks)
      }));
    }).on('error', reject);
  });
}

async function fetchHtml(port) {
  const res = await fetchPath(port, '/');
  return res.body.toString('utf-8');
}

function writeFragment(dir) {
  const contentDir = path.join(dir, 'content');
  fs.mkdirSync(contentDir, { recursive: true });
  fs.writeFileSync(path.join(contentDir, 'screen.html'), '<h2>Pick a layout</h2>');
}

// A packaged tree: scripts plus the Codex manifest, no package.json and no
// assets/ directory.
function createPackagedServerFixture(version) {
  const root = fs.mkdtempSync(path.join('/tmp', 'ultrapowers-packaged-server-'));
  const scriptDir = path.join(root, 'skills/brainstorming/scripts');
  fs.cpSync(path.join(REPO_ROOT, 'skills/brainstorming/scripts'), scriptDir, { recursive: true });
  fs.mkdirSync(path.join(root, '.codex-plugin'), { recursive: true });
  fs.writeFileSync(
    path.join(root, '.codex-plugin/plugin.json'),
    JSON.stringify({ name: 'ultrapowers', version }, null, 2)
  );
  return {
    root,
    serverPath: path.join(scriptDir, 'server.cjs')
  };
}

async function withServer(options, fn) {
  const server = startServer(options);
  try {
    await waitForServer(server);
    await fn();
  } finally {
    if (server.exitCode === null && server.signalCode === null) {
      server.kill();
      await new Promise(resolve => server.once('exit', resolve));
    }
    await sleep(100);
    cleanup(options.dir);
  }
}

let passed = 0;
let failed = 0;

async function test(name, fn) {
  try {
    await fn();
    console.log(`  PASS: ${name}`);
    passed++;
  } catch (e) {
    console.log(`  FAIL: ${name}`);
    console.log(`    ${e.message}`);
    failed++;
  }
}

function brandBlock(html) {
  const match = html.match(/<div class="brand">[\s\S]*?<\/div>/);
  assert(match, 'served HTML should contain the brand block');
  return match[0];
}

function assertBranded(html, version = PACKAGE_VERSION) {
  const brand = brandBlock(html);
  assert(
    brand.includes(`Ultrapowers v${version}`),
    'branding text should read "Ultrapowers v<version>"'
  );
  assert(
    brand.includes(`<a href="${REPO_URL}">`),
    'brand link should point at the fork repository'
  );
  assert(
    /<img class="brand-logo" src="\/brand-logo\.svg"[^>]*>\s*<span class="brand-copy">Ultrapowers v/.test(brand),
    'local logo should appear before the version text'
  );
  assert(!html.includes('primeradiant.com'), 'served HTML must not reference primeradiant.com');
  assert(!/<img[^>]*src="https?:\/\//.test(html), 'no image may be loaded from a remote host');
  assert(!new RegExp(UPSTREAM_NAME, 'i').test(html), 'served HTML must not contain the upstream name');
  assert(!/filter:\s*invert/.test(html), 'coloured SVG logo must not be colour-inverted');
  assert(!html.includes('Prime Radiant'), 'served HTML must not carry the upstream brand text');
}

function assertBrandRowLayout(html) {
  assert(/\.brand a\s*\{[^}]*line-height:\s*1/i.test(html), 'brand row should align logo and text by visual height');
  assert(/\.brand a\s*\{[^}]*gap:\s*0\.5rem/i.test(html), 'brand row should keep logo and text close together');
  assert(/\.brand a\s*\{[^}]*max-width:\s*100%/i.test(html), 'brand link should be constrained so it cannot overlap the status column');
  assert(/\.brand\s*\{[^}]*overflow:\s*hidden/i.test(html), 'brand wrapper should clip before it reaches the status column');
  assert(/\.brand-logo\s*\{[^}]*height:\s*1em/i.test(html), 'logo should match the surrounding brand text size');
  assert(/\.brand-logo\s*\{[^}]*display:\s*block/i.test(html), 'logo should not reserve inline-image descender space');
}

function assertFramedScreenUsesBrandHeader(html) {
  const logoCount = (html.match(/class="brand-logo"/g) || []).length;
  assert.strictEqual(logoCount, 1, 'framed screens should render the logo only in the header');
  assert(!html.includes('<div class="indicator-bar">'), 'framed screens should not render footer chrome');
  assert(
    /<div class="header">[\s\S]*<div class="brand">[\s\S]*<div class="status">Connecting…<\/div>/.test(html),
    'header should contain branding and connection status'
  );
}

async function assertLogoServed(port) {
  const res = await fetchPath(port, '/brand-logo.svg');
  assert.strictEqual(res.status, 200, 'authorized logo request should succeed');
  assert.strictEqual(res.headers['content-type'], 'image/svg+xml', 'logo should be served as SVG');
  assert(res.body.equals(fs.readFileSync(LOGO_PATH)), 'served logo should be the bundled asset, byte for byte');
}

async function main() {
  console.log('\n--- Visual Companion Branding ---');

  await test('framed screens render the bundled logo and Ultrapowers version text', async () => {
    const port = 3451;
    const dir = '/tmp/brainstorm-branding-default';
    await withServer({ port, dir }, async () => {
      writeFragment(dir);
      await sleep(300);
      const html = await fetchHtml(port);
      assertBranded(html);
      assertBrandRowLayout(html);
      assertFramedScreenUsesBrandHeader(html);
      await assertLogoServed(port);
    });
  });

  await test('waiting screen renders the bundled logo and Ultrapowers version text', async () => {
    const port = 3452;
    const dir = '/tmp/brainstorm-branding-waiting';
    await withServer({ port, dir }, async () => {
      const html = await fetchHtml(port);
      assert(html.includes('Waiting for the agent'), 'waiting page should still render');
      assertBranded(html);
      assertBrandRowLayout(html);
      await assertLogoServed(port);
    });
  });

  await test('logo route requires the session key like every other route', async () => {
    const port = 3453;
    const dir = '/tmp/brainstorm-branding-unauthorized-logo';
    await withServer({ port, dir }, async () => {
      const res = await fetchPath(port, '/brand-logo.svg', { authorized: false });
      assert.strictEqual(res.status, 403, 'unauthenticated logo request should be refused');
      assert(!res.body.includes('<svg'), 'unauthenticated response must not carry the SVG');
    });
  });

  await test('packaged Codex plugin reads version from .codex-plugin manifest and tolerates a missing assets/ dir', async () => {
    const port = 3457;
    const dir = '/tmp/brainstorm-branding-packaged-codex';
    const packagedVersion = '7.8.9';
    const fixture = createPackagedServerFixture(packagedVersion);

    try {
      await withServer({ port, dir, serverPath: fixture.serverPath }, async () => {
        writeFragment(dir);
        await sleep(300);
        const html = await fetchHtml(port);
        assertBranded(html, packagedVersion);
        assert(!html.includes('Ultrapowers vunknown'), 'packaged plugin should not fall back to unknown version');
        const res = await fetchPath(port, '/brand-logo.svg');
        assert.strictEqual(res.status, 404, 'missing bundled asset should yield 404, not a crash');
      });
    } finally {
      cleanup(fixture.root);
    }
  });

  await test('former telemetry opt-out variables have no effect on the markup', async () => {
    const port = 3454;
    const dir = '/tmp/brainstorm-branding-env-noop';
    let baseline;
    await withServer({ port, dir }, async () => {
      baseline = brandBlock(await fetchHtml(port));
    });
    const env = {
      ULTRAPOWERS_DISABLE_TELEMETRY: 'true',
      DISABLE_TELEMETRY: 'true',
      CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1'
    };
    await withServer({ port, dir, env }, async () => {
      const withEnv = brandBlock(await fetchHtml(port));
      assert.strictEqual(withEnv, baseline, 'brand block must be identical with and without the old opt-out variables');
    });
  });

  console.log(`\n--- Results: ${passed} passed, ${failed} failed ---`);
  if (failed > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd tests/brainstorm-server && node branding.test.js; cd ../..`
Expected: `FAIL:` for tests 1, 2 and 4 (the server still emits the remote `<img ... src="https://primeradiant.com/...">` and has no `/brand-logo.svg` route, so the authorized logo fetch returns 404) and for test 5 (the old opt-out variables still switch the text to `Prime Radiant Ultrapowers v...`). Test 3 already passes because `isAuthorized` gates every route. Results line: `--- Results: 1 passed, 4 failed ---`, exit code 1.

- [ ] **Step 3: Replace the telemetry constants (`server.cjs:105-112`)**

Old (post-Task 1 text):
```js
const ULTRAPOWERS_VERSION = readUltrapowersVersion();
const ULTRAPOWERS_BRAND_IMAGE_URL = 'https://primeradiant.com/brand/ultrapowers-visual-brainstorming-logo.png';
const TELEMETRY_DISABLE_ENV_VARS = [
  'ULTRAPOWERS_DISABLE_TELEMETRY',
  'DISABLE_TELEMETRY',
  'CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC'
];
const ULTRAPOWERS_TELEMETRY_DISABLED = TELEMETRY_DISABLE_ENV_VARS.some(name => isTruthyEnv(process.env[name]));
```
New:
```js
const ULTRAPOWERS_VERSION = readUltrapowersVersion();
// The brand logo is the bundled SVG, served by this process at BRAND_LOGO_PATH.
// Nothing about the companion is fetched from, or reported to, a remote host.
const BRAND_LOGO_PATH = '/brand-logo.svg';
const BRAND_LOGO_FILE = path.join(__dirname, '../../../assets/ultrapowers-small.svg');
```

- [ ] **Step 4: Drop the colour inversion from the waiting page CSS (`server.cjs:171`, now shifted by -3 lines to 168)**

Old:
```
.brand-logo { display: block; height: 1em; width: auto; max-width: 180px; filter: invert(1); }
```
New:
```
.brand-logo { display: block; height: 1em; width: auto; max-width: 180px; }
```
(The upstream logo was a white PNG that needed inverting on light backgrounds; the bundled SVG is orange and must not be inverted.)

- [ ] **Step 5: Delete `isTruthyEnv` (`server.cjs:227-232`, shifted to 224-229) and rewrite `brandMarkup` (`:242-252`, shifted)**

Delete this whole function and the blank line after it:
```js
function isTruthyEnv(value) {
  if (!value) return false;
  const normalized = String(value).trim().toLowerCase();
  if (!normalized) return false;
  return !['0', 'false', 'no', 'off'].includes(normalized);
}
```

Replace `brandMarkup` in full. Old (post-Task 1 text):
```js
function brandMarkup() {
  const version = escapeHtmlText(ULTRAPOWERS_VERSION);
  const text = ULTRAPOWERS_TELEMETRY_DISABLED
    ? 'Prime Radiant Ultrapowers v' + version
    : 'Ultrapowers v' + version;
  const logo = ULTRAPOWERS_TELEMETRY_DISABLED
    ? ''
    : '<img class="brand-logo" src="' + ULTRAPOWERS_BRAND_IMAGE_URL + '?v=' + encodeURIComponent(ULTRAPOWERS_VERSION) + '" alt="Prime Radiant" referrerpolicy="no-referrer" decoding="async">';

  return '<div class="brand"><a href="https://github.com/raoofaltaher/ultrapowers">' + logo + '<span class="brand-copy">' + text + '</span></a></div>';
}
```
New:
```js
function brandMarkup() {
  const version = escapeHtmlText(ULTRAPOWERS_VERSION);
  const logo = '<img class="brand-logo" src="' + BRAND_LOGO_PATH + '" alt="Ultrapowers" decoding="async">';
  return '<div class="brand"><a href="https://github.com/raoofaltaher/ultrapowers">' + logo +
    '<span class="brand-copy">Ultrapowers v' + version + '</span></a></div>';
}
```

- [ ] **Step 6: Add the logo route inside `handleRequest`**

In `handleRequest`, the `/files/` branch ends with `res.end(fs.readFileSync(filePath));` followed by `  } else {` and the 404 body. Insert a new branch between them so the tail of the function reads:
```js
    res.writeHead(200, securityHeaders({ 'Content-Type': contentType }));
    res.end(fs.readFileSync(filePath));
  } else if (req.method === 'GET' && pathname === BRAND_LOGO_PATH) {
    // Bundled brand logo. Packaged trees may ship without assets/, so a
    // missing file is a 404 rather than a crash. Authorization was already
    // checked at the top of this function, like every other route.
    let svg = null;
    try { svg = fs.readFileSync(BRAND_LOGO_FILE); } catch (e) { /* asset not shipped */ }
    if (!svg) {
      res.writeHead(404, securityHeaders());
      res.end('Not found');
      return;
    }
    res.writeHead(200, securityHeaders({ 'Content-Type': 'image/svg+xml' }));
    res.end(svg);
  } else {
    res.writeHead(404, securityHeaders());
    res.end('Not found');
  }
}
```

- [ ] **Step 7: Drop the inversion rules from `frame-template.html:69-72`**

Old:
```
    .brand-logo { display: block; height: 1em; width: auto; max-width: 180px; flex-shrink: 0; filter: invert(1); }
    @media (prefers-color-scheme: dark) {
      .brand-logo { filter: none; }
    }
```
New:
```
    .brand-logo { display: block; height: 1em; width: auto; max-width: 180px; flex-shrink: 0; }
```

- [ ] **Step 8: Run the test to verify it passes**

Run: `node --check skills/brainstorming/scripts/server.cjs && cd tests/brainstorm-server && node branding.test.js; cd ../..`
Expected: five `PASS:` lines and `--- Results: 5 passed, 0 failed ---`.

Run: `grep -n -i -E 'telemetry|primeradiant|isTruthyEnv|BRAND_IMAGE_URL|invert' skills/brainstorming/scripts/server.cjs skills/brainstorming/scripts/frame-template.html; echo GREP_DONE`
Expected: only `GREP_DONE`.

- [ ] **Step 9: Run the whole brainstorm-server suite if dependencies can be installed**

Run: `cd tests/brainstorm-server && npm install && npm test; cd ../..`
Expected: every test file prints its results with `0 failed`; `npm test` exits 0. If `npm install` cannot reach the registry, record "brainstorm-server suite: branding.test.js passed directly; remaining files skipped (no `ws`)" in the Task 11 report. Do not report the suite as passed.

- [ ] **Step 10: Commit**

```bash
git add skills/brainstorming/scripts/server.cjs skills/brainstorming/scripts/frame-template.html tests/brainstorm-server/branding.test.js
git commit -m "brainstorming: remove visual-companion telemetry, serve the bundled logo

The brand row loaded a PNG from the upstream author's website with the
version in the query string. It now renders assets/ultrapowers-small.svg
from a local /brand-logo.svg route behind the same session key as every
other route, with the text Ultrapowers v<version>. The three telemetry
opt-out variables and the colour-inversion CSS for the old white logo are
gone. branding.test.js asserts the local asset, the text, the 403/404
paths, and the absence of primeradiant.com and the upstream name.

RAOOF A."
```

---

### Task 4: Fork hygiene deletions

**Files:**
- Delete: `.github/FUNDING.yml`, `scripts/sync-to-codex-plugin.sh`, `scripts/package-codex-plugin.sh`, `tests/codex-plugin-sync/test-sync-to-codex-plugin.sh` (whole directory), `tests/codex/test-package-codex-plugin.sh`, `.pre-commit-config.yaml`, `.github/ISSUE_TEMPLATE/config.yml`, `.github/ISSUE_TEMPLATE/diagnosis_report.md`, `.github/ISSUE_TEMPLATE/platform_support.md`, `.github/ISSUE_TEMPLATE/feature_request.md`
- Modify: `.gitignore:10-13` (evals block, D9)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `.github/ISSUE_TEMPLATE/` contains only `bug_report.md` (rewritten in Task 7); `scripts/` contains `bump-version.sh`, `lint-shell.sh`, `rename-fork.sh`; `tests/codex/` contains only `test-marketplace-manifest.sh`. Tasks 7 and 8 remove the last prose references to the deleted files.

- [ ] **Step 1: Delete the files**

```bash
git rm .github/FUNDING.yml \
       scripts/sync-to-codex-plugin.sh scripts/package-codex-plugin.sh \
       tests/codex/test-package-codex-plugin.sh \
       .pre-commit-config.yaml \
       .github/ISSUE_TEMPLATE/config.yml \
       .github/ISSUE_TEMPLATE/diagnosis_report.md \
       .github/ISSUE_TEMPLATE/platform_support.md \
       .github/ISSUE_TEMPLATE/feature_request.md
git rm -r tests/codex-plugin-sync
```
Expected: `rm '...'` lines for ten files; `tests/codex-plugin-sync/` no longer exists.

- [ ] **Step 2: Remove the evals block from `.gitignore`**

Write `.gitignore`:
```
.worktrees/
.private-journal/
.claude/
.ultrapowers/
.DS_Store
node_modules/
inspo
triage/

# Python
__pycache__/
*.pyc
*.pyo
.pytest_cache/
```

- [ ] **Step 3: Verify**

Run: `ls .github .github/ISSUE_TEMPLATE scripts tests/codex; test ! -e tests/codex-plugin-sync && test ! -e .pre-commit-config.yaml && test ! -e .github/FUNDING.yml && echo DELETIONS_OK`
Expected:
```
.github:
ISSUE_TEMPLATE  PULL_REQUEST_TEMPLATE.md

.github/ISSUE_TEMPLATE:
bug_report.md

scripts:
bump-version.sh  lint-shell.sh  rename-fork.sh

tests/codex:
test-marketplace-manifest.sh
DELETIONS_OK
```

Run: `grep -rn -E 'sync-to-codex-plugin|package-codex-plugin|codex-plugin-sync|FUNDING|pre-commit' . --exclude-dir=.git --exclude-dir=.remember --exclude=RELEASE-NOTES.md --exclude-dir=plans --exclude-dir=specs | cut -c1-120`
Expected (these remaining prose references are removed in Task 8):
```
./docs/porting-to-a-new-harness.md:678:| External marketplace fork, synced by script | Codex | `scripts/sync-to-codex-plugin.sh` rsyncs the tracked plugin files into...
./docs/porting-to-a-new-harness.md:745:  `scripts/sync-to-codex-plugin.sh` is the template to clone (note its anchored
./docs/porting-to-a-new-harness.md:748:  EXCLUDES list in `sync-to-codex-plugin.sh`) so your dotdir doesn't leak into
./docs/porting-to-a-new-harness.md:800:| Codex | `.codex-plugin/plugin.json` (declares empty `hooks`) | native skill discovery (no session-start hook) | `references/codex-tools.md` | `tests/codex/`, `tests/codex-plugin-sync/` | fork sync (`scripts/sync-to-codex-plugin.sh`) |
./docs/testing.md:14:- `tests/codex-plugin-sync/` — bash sync verification.
```
(`docs/testing.md:5` says "codex-plugin sync" with a space, so it does not match this pattern; Task 8 rewrites that file anyway.)

- [ ] **Step 4: Commit**

```bash
git add -A .github scripts tests/codex tests/codex-plugin-sync .pre-commit-config.yaml .gitignore
git commit -m "hygiene: delete upstream-only funding, Codex publishing pipeline, evals hooks, issue templates

FUNDING.yml funded the upstream author. sync-to-codex-plugin.sh,
package-codex-plugin.sh and their tests publish through upstream's
marketplace fork and OpenAI-owned metadata this repo does not have.
.pre-commit-config.yaml only linted the external evals/ checkout, whose
.gitignore entry goes too. The issue templates are replaced by one bug
template in the next commits.

RAOOF A."
```

---

### Task 5: README rewrite

**Files:**
- Rewrite: `README.md`

**Interfaces:**
- Consumes: install identifiers from Task 2 (`/plugin marketplace add raoofaltaher/ultrapowers`, `/plugin install ultrapowers@ultrapowers`), the skills list under `skills/` (fifteen skills, two renamed in Task 1).
- Produces: exactly one line containing the old name (the fork notice). Task 11 criterion 1 depends on that line being the only README match.

Honesty note on install commands: the Claude Code, Antigravity, Devin, Factory Droid, Gemini, Copilot CLI, Kimi, OpenCode, Pi, Qwen, Hermes and Muse commands below follow the exact shapes upstream documented for git-URL or marketplace-repo installs, with the repository swapped. None of them was executed against the fork on the authoring machine. Codex, Cursor and Grok have no git-URL install upstream documents (they used vendor marketplaces this fork is not listed in), so the README says so and points at a local clone.

- [ ] **Step 1: Write `README.md`**

````markdown
# Ultrapowers

Ultrapowers is a complete software development methodology for your coding agents, built on a set of composable skills and a session-start bootstrap that makes sure your agent uses them.

Ultrapowers is a fork of <old-name> 6.4.2 by Jesse Vincent, MIT licensed; upstream lives at https://github.com/obra/<old-name>.

## Table of Contents

- [How it works](#how-it-works)
- [Installation](#installation)
  - [Claude Code](#claude-code)
  - [Antigravity](#antigravity)
  - [Codex](#codex)
  - [Cursor](#cursor)
  - [Devin CLI](#devin-cli)
  - [Factory Droid](#factory-droid)
  - [Gemini CLI](#gemini-cli)
  - [GitHub Copilot CLI](#github-copilot-cli)
  - [Grok Build CLI](#grok-build-cli)
  - [Kimi Code](#kimi-code)
  - [OpenCode](#opencode)
  - [Pi](#pi)
  - [Qwen Code](#qwen-code)
  - [Hermes Agent](#hermes-agent)
  - [Muse](#muse)
- [The Basic Workflow](#the-basic-workflow)
- [When Something Goes Wrong](#when-something-goes-wrong)
- [What ultrapowers adds](#what-ultrapowers-adds)
- [What's Inside](#whats-inside)
- [Philosophy](#philosophy)
- [Contributing](#contributing)
- [License](#license)

## How it works

It starts from the moment you fire up your coding agent. As soon as it sees that you're building something, it *doesn't* just jump into trying to write code. Instead, it steps back and asks you what you're really trying to do.

Once it's teased a spec out of the conversation, it shows it to you in chunks short enough to actually read and digest.

After you've signed off on the design, your agent puts together an implementation plan that's clear enough for an enthusiastic junior engineer with poor taste, no judgement, no project context, and an aversion to testing to follow. It emphasizes true red/green TDD, YAGNI (You Aren't Gonna Need It), and DRY.

Next up, once you say "go", it launches a *subagent-driven-development* process, having agents work through each engineering task, inspecting and reviewing their work, and continuing forward. It's not uncommon for your agent to work autonomously for a couple hours at a time without deviating from the plan you put together.

There's a bunch more to it, but that's the core of the system. And because the skills trigger automatically, you don't need to do anything special. Your coding agent just has Ultrapowers.

## Installation

Installation differs by harness. If you use more than one, install Ultrapowers separately for each one. Every install below points at this repository: `https://github.com/raoofaltaher/ultrapowers`.

### Claude Code

This repository is its own plugin marketplace (`.claude-plugin/marketplace.json`).

- Register the marketplace:

  ```bash
  /plugin marketplace add raoofaltaher/ultrapowers
  ```

- Install the plugin from it:

  ```bash
  /plugin install ultrapowers@ultrapowers
  ```

- For a local checkout, register the directory instead: `/plugin marketplace add S:\ultrapowers` (or the path of your clone), then the same `/plugin install ultrapowers@ultrapowers`.

### Antigravity

```bash
agy plugin install https://github.com/raoofaltaher/ultrapowers
```

Antigravity runs the plugin's session-start hook, so Ultrapowers is active from the first message. Reinstall with the same command to update.

### Codex

Ultrapowers is not listed in the Codex plugin marketplace. The Codex manifest is `.codex-plugin/plugin.json` and the marketplace file is `.agents/plugins/marketplace.json`; clone this repository and register the clone as a plugin source in the Codex `/plugins` interface.

### Cursor

Ultrapowers is not listed in the Cursor plugin marketplace. The Cursor manifest is `.cursor-plugin/plugin.json`; install from a local clone through Cursor's plugin settings.

### Devin CLI

- Install:

  ```bash
  devin plugins install raoofaltaher/ultrapowers
  ```

- Update:

  ```bash
  devin plugins update ultrapowers
  ```

### Factory Droid

- Register the marketplace:

  ```bash
  droid plugin marketplace add https://github.com/raoofaltaher/ultrapowers
  ```

- Install the plugin:

  ```bash
  droid plugin install ultrapowers@ultrapowers
  ```

### Gemini CLI

- Install the extension:

  ```bash
  gemini extensions install https://github.com/raoofaltaher/ultrapowers
  ```

- Update later:

  ```bash
  gemini extensions update ultrapowers
  ```

### GitHub Copilot CLI

- Register the marketplace:

  ```bash
  copilot plugin marketplace add raoofaltaher/ultrapowers
  ```

- Install the plugin:

  ```bash
  copilot plugin install ultrapowers@ultrapowers
  ```

### Grok Build CLI

Ultrapowers is not listed in the xAI plugin marketplace. Install from a local clone of this repository following Grok Build's plugin documentation.

### Kimi Code

- Install directly from this repository:

  ```text
  /plugins install https://github.com/raoofaltaher/ultrapowers
  ```

- Detailed docs: [docs/README.kimi.md](docs/README.kimi.md)

### OpenCode

OpenCode uses its own plugin install; install Ultrapowers separately even if you already use it in another harness.

- Tell OpenCode:

  ```
  Fetch and follow instructions from https://raw.githubusercontent.com/raoofaltaher/ultrapowers/refs/heads/main/.opencode/INSTALL.md
  ```

- Detailed docs: [docs/README.opencode.md](docs/README.opencode.md)

### Pi

Install Ultrapowers as a Pi package from this repository:

```bash
pi install git:github.com/raoofaltaher/ultrapowers
```

For local development, run Pi with this checkout loaded as a temporary package:

```bash
pi -e /path/to/ultrapowers
```

The Pi package loads the Ultrapowers skills and a small extension that injects the `using-ultrapowers` bootstrap at session startup and again after compaction. Pi has native skills, so no compatibility `Skill` tool is required. Subagent and task-list tools remain optional Pi companion packages.

### Qwen Code

Qwen Code installs plugins from Claude Code marketplaces directly.

- Install the plugin from this repository, and pick `ultrapowers` when prompted:

  ```bash
  qwen extensions install raoofaltaher/ultrapowers
  ```

- Update later:

  ```bash
  qwen extensions update ultrapowers
  ```

### Hermes Agent

```bash
hermes plugins install raoofaltaher/ultrapowers --enable
```

Restart any active Hermes sessions after installing. Hermes has no post-compaction hook, so a very long session that compacts over its first turn loses the bootstrap; start a fresh session if skills stop triggering.

### Muse

Ultrapowers is a native Muse plugin. The `using-ultrapowers` bootstrap is injected via the native `SessionStart` hook.

- Install from a local checkout:

  ```bash
  muse plugins install ./
  muse plugins approve ultrapowers
  ```

  Or clone and install:

  ```bash
  git clone https://github.com/raoofaltaher/ultrapowers.git
  muse plugins install ./ultrapowers
  muse plugins approve ultrapowers
  ```

- Update later:

  ```bash
  muse plugins update ultrapowers
  ```

Restart any active Muse sessions after installing so the `SessionStart` hook takes effect. To verify any install, start a fresh session and send `Let's make a react todo list`; a working install auto-triggers `brainstorming` before any code is written.

## The Basic Workflow

1. **brainstorming** - Activates before writing code. Refines rough ideas through questions, explores alternatives, presents design in sections for validation. Saves design document.

2. **using-git-worktrees** - Activates after design approval. Creates isolated workspace on new branch, runs project setup, verifies clean test baseline.

3. **writing-plans** - Activates with approved design. Breaks work into bite-sized tasks (2-5 minutes each). Every task has exact file paths, complete code, verification steps.

4. **subagent-driven-development** or **executing-plans** - Activates with plan. Either dispatches a fresh subagent per task with a review after each (most thorough), or implements every task inline in the current session with one fresh review of the whole branch at the end (cheapest).

5. **test-driven-development** - Activates during implementation. Enforces RED-GREEN-REFACTOR: write failing test, watch it fail, write minimal code, watch it pass, commit. Deletes code written before tests.

6. **requesting-code-review** - Activates between tasks. Reviews against plan, reports issues by severity. Critical issues block progress.

7. **finishing-a-development-branch** - Activates when tasks complete. Verifies tests, presents options (merge/PR/keep/discard), cleans up worktree.

**The agent checks for relevant skills before any task.** Mandatory workflows, not suggestions.

## When Something Goes Wrong

Sometimes a session misbehaves: a skill fires when it shouldn't, stays silent when it should, or the agent ignores its plan, repeats work, or burns more tokens than you'd expect. Ask your coding agent to "figure out what went wrong with ultrapowers in this session" and it will invoke the **diagnosing-ultrapowers** skill. To examine an earlier session, name it: "figure out what went wrong with ultrapowers in session `<id>`".

The skill reads the session transcript, reports what happened with line-level evidence, and, if you want, packages a scrubbed bundle for a bug report.

## What ultrapowers adds

Piece 1 (this release line's 1.0.0) is the rename and fork hygiene: one name everywhere, fork-owner identity in every manifest, nothing fetched from or reported to a remote host, no upstream-only publishing tooling. The pieces that make ultrapowers more than a rename each have a spec under `docs/ultrapowers/specs/` and land in later releases:

- Piece 2: scaffold engine and baseline payload
- Piece 3: task lifecycle skills
- Piece 4: team memory
- Piece 5: QA gatekeeper

## What's Inside

### Skills Library

**Testing**
- **test-driven-development** - RED-GREEN-REFACTOR cycle (includes testing anti-patterns reference)

**Debugging**
- **systematic-debugging** - 4-phase root cause process (includes root-cause-tracing, defense-in-depth, condition-based-waiting techniques)
- **verification-before-completion** - Ensure it's actually fixed
- **diagnosing-ultrapowers** - Work out what went wrong in a session, with evidence; export a scrubbed bundle or file an issue

**Collaboration**
- **brainstorming** - Socratic design refinement
- **writing-plans** - Detailed implementation plans
- **executing-plans** - Inline plan execution: one context, one final review
- **dispatching-parallel-agents** - Concurrent subagent workflows
- **requesting-code-review** - Pre-review checklist
- **receiving-code-review** - Responding to feedback
- **using-git-worktrees** - Parallel development branches
- **finishing-a-development-branch** - Merge/PR decision workflow
- **subagent-driven-development** - Fast iteration with two-stage review (spec compliance, then code quality)

**Meta**
- **writing-skills** - Create new skills following best practices (includes testing methodology)
- **using-ultrapowers** - Introduction to the skills system

## Philosophy

- **Test-Driven Development** - Write tests first, always
- **Systematic over ad-hoc** - Process over guessing
- **Complexity reduction** - Simplicity as primary goal
- **Evidence over claims** - Verify before declaring success

## Contributing

Read `AGENTS.md` first: it describes the repository layout, the zero-dependency rule, how to run each test suite, and how skill changes are developed and tested with `ultrapowers:writing-skills`. Skill bodies are behavior-shaping content; change them with evidence, not taste.

## License

MIT License - see LICENSE file for details. Ultrapowers keeps the upstream copyright line alongside its own.
````

- [ ] **Step 2: Verify the single permitted occurrence**

Run: `grep -n -i <old-name> README.md`
Expected exactly one line:
```
5:Ultrapowers is a fork of <old-name> 6.4.2 by Jesse Vincent, MIT licensed; upstream lives at https://github.com/obra/<old-name>.
```

Run: `grep -n -E 'primeradiant|fsck\.com|discord|Commercial|telemetry|TELEMETRY|<old-name>-marketplace|<old-name>-evals|claude\.com/plugins' README.md; echo README_SCAN_DONE`
Expected: only `README_SCAN_DONE`.

Run: `for s in skills/*/; do n="$(basename "$s")"; grep -q -- "- \*\*$n\*\*" README.md || echo "not in README skills list: $n"; done; echo SKILLS_LIST_DONE`
Expected: only `SKILLS_LIST_DONE` (all fifteen skills listed).

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: rewrite README for ultrapowers

Fork notice naming upstream 6.4.2 and its license, per-harness install
commands pointing at raoofaltaher/ultrapowers, the workflow, skills
library and philosophy sections kept and renamed, and a short
placeholder for pieces 2 to 5. Commercial services, community,
official-marketplace, telemetry and upstream updating sections removed.

RAOOF A."
```

---

### Task 6: AGENTS.md rewrite

**Files:**
- Rewrite: `AGENTS.md`

**Interfaces:**
- Consumes: the test commands used in Task 11; `scripts/rename-fork.sh` from Task 1; `scripts/bump-version.sh`, `scripts/lint-shell.sh`.
- Produces: the fork's single agent/contributor guide. Piece 2's spec (D5 there) expects `AGENTS.md` at the root to remain the single instruction file.

- [ ] **Step 1: Write `AGENTS.md`**

````markdown
# Ultrapowers — Guide for Agents and Contributors

This file is the instruction file for any agent working in this repository and the contributor guide for humans. Read it before changing anything.

## What this repository is

Ultrapowers is a skills plugin for coding agents: a `skills/` library, a session-start bootstrap that loads `skills/using-ultrapowers/SKILL.md`, and one thin adapter per harness. It is a fork; upstream attribution lives in `LICENSE` and the README fork notice and nowhere else. The design history that motivated each change is under `docs/ultrapowers/specs/` and `docs/ultrapowers/plans/`.

## Repository layout

| Path | Purpose |
|---|---|
| `skills/<name>/SKILL.md` | One skill per directory. Frontmatter `name` must equal the directory name. Supporting prompts, templates and references live beside it. |
| `skills/using-ultrapowers/` | The bootstrap skill injected at session start on every harness; `references/<harness>-tools.md` holds per-harness tool mappings. |
| `hooks/` | `session-start` (bash) emits the bootstrap as JSON for Claude Code, Cursor, Copilot CLI and Muse; `run-hook.cmd` is the Windows polyglot wrapper; `hooks.json` and `hooks-cursor.json` register it. |
| `.claude-plugin/`, `.codex-plugin/`, `.agents/plugins/`, `.cursor-plugin/`, `.devin-plugin/`, `.hermes-plugin/`, `.kimi-plugin/`, `.muse-plugin/`, `gemini-extension.json`, `GEMINI.md`, `package.json`, `index.js` | Per-harness manifests and entry points. `.opencode/plugins/ultrapowers.js` and `.pi/extensions/ultrapowers.ts` are in-process injectors. |
| `.version-bump.json` | The eleven files whose `version` field `scripts/bump-version.sh` keeps in lockstep, plus the audit exclude list. |
| `scripts/` | `bump-version.sh` (version sync and audit), `lint-shell.sh` (ShellCheck plus `bash -n`), `rename-fork.sh` (the parameterised rename used to create this fork). |
| `tests/` | Offline plugin-infrastructure tests, one directory per subject (see below). `tests/claude-code/` also holds model-driven tests that need a Claude Code login. |
| `docs/` | Harness guides (`README.opencode.md`, `README.kimi.md`), `porting-to-a-new-harness.md`, `testing.md`, `windows/polyglot-hooks.md`, and the specs/plans under `docs/ultrapowers/`. |
| `assets/` | `ultrapowers-small.svg` (brand logo, also served by the brainstorm companion) and `app-icon.png`. |

## Rules

1. **Zero dependencies.** The plugin has no runtime dependency on any third-party package or service. Injectors are plain JavaScript/TypeScript with no imports beyond node built-ins (Pi's `import type` is erased at compile time). Do not add one.
2. **Skill bodies are code.** The prose in `skills/*/SKILL.md` shapes agent behavior and was tuned against real sessions. Do not restructure, reword or "modernise" it without evidence from real sessions that the change is an improvement. Red Flags tables, rationalization lists and the phrase "your human partner" are deliberate.
3. **Skill changes go through `ultrapowers:writing-skills`.** Use that skill to develop and test any new or changed skill. Test with subagents under pressure, not just on the happy path, and keep the before/after evidence with the change.
4. **Names.** The plugin, marketplace and skill namespace are `ultrapowers`; skills are invoked as `ultrapowers:<skill>`. The runtime folder is `.ultrapowers/`; environment variables are `ULTRAPOWERS_*`. Do not introduce a second vocabulary.
5. **No telemetry.** Nothing in this repository fetches from or reports to a remote host at runtime. The brainstorm companion serves its own logo.
6. **Versions.** Change the version only with `scripts/bump-version.sh <x.y.z>`, which needs `jq` and mikefarah `yq`. `scripts/bump-version.sh --audit` must end with "All clear".
7. **Line endings.** Shell scripts, `hooks/session-start` and `*.cmd` are pinned to LF in `.gitattributes`. Keep them that way.
8. **Commits.** Small, one concern each, with a message that says what changed and why.

## Running the tests

All of these run offline. Prerequisites: bash, node 18+, python 3 with pytest, `jq`, `yq` (mikefarah v4), `shellcheck`.

```bash
bash tests/hooks/test-session-start.sh
node --test tests/pi/test-pi-extension.mjs
bash tests/opencode/run-tests.sh            # unit tests; add --integration for a live OpenCode
python -m pytest tests/hermes
bash tests/kimi/run-tests.sh
bash tests/devin/test-devin-plugin.sh
bash tests/codex/test-marketplace-manifest.sh
bash tests/version-bump/test-bump-version.sh
bash tests/shell-lint/test-lint-shell.sh
bash tests/rename-fork/test-rename-fork.sh
bash tests/antigravity/run-tests.sh
bash tests/diagnosing-ultrapowers/test-skill-structure.sh
bash tests/claude-code/test-sdd-workspace.sh
bash tests/claude-code/test-executing-plans-scripts.sh
bash tests/claude-code/test-worktree-path-policy.sh
(cd tests/brainstorm-server && npm install && npm test)
scripts/lint-shell.sh --all
```

Model-driven tests (`tests/claude-code/run-skill-tests.sh`, `tests/explicit-skill-requests/`, the OpenCode `--integration` tests) need a logged-in harness and are not part of the offline gate.

## Adding harness support

Read `docs/porting-to-a-new-harness.md`. A real integration loads the `using-ultrapowers` bootstrap at session start, every session, without per-session opt-in. Acceptance test: in a clean session send `Let's make a react todo list`; the `brainstorming` skill must trigger before any code is written. Register any new manifest that carries a version in `.version-bump.json`, and add the new skill test directory to the list above.

## Pull requests

Fill in `.github/PULL_REQUEST_TEMPLATE.md`: what changed, why (the concrete problem), how it was tested, and on which harness. Say whether an agent produced the change and which one. One concern per PR.
````

- [ ] **Step 2: Verify**

Run: `grep -n -i -E '<old-name>|94%|slop|dev` branch|evals|<old-name>-evals|prime-radiant|Existing PRs' AGENTS.md; echo AGENTS_SCAN_DONE`
Expected: only `AGENTS_SCAN_DONE`.

Run: `grep -c 'ultrapowers:writing-skills' AGENTS.md`
Expected: `1`.

- [ ] **Step 3: Commit**

```bash
git add AGENTS.md
git commit -m "docs: rewrite AGENTS.md as the fork's agent and contributor guide

Keeps the repository layout, the zero-dependency rule, the skill-writing
philosophy with ultrapowers:writing-skills, how to run every offline
suite, and the rule that skill bodies are behavior-shaping content.
Drops the PR-rejection statistics, duplicate-PR search mandate, dev
branch rule, eval-harness section and upstream policing language.

RAOOF A."
```

---

### Task 7: Short PR template and bug template

**Files:**
- Rewrite: `.github/PULL_REQUEST_TEMPLATE.md`
- Rewrite: `.github/ISSUE_TEMPLATE/bug_report.md`
- Modify: `skills/diagnosing-ultrapowers/references/github-issues.md:39-43` (points at the deleted `diagnosis_report.md` template)

**Interfaces:**
- Consumes: Task 4 deletions (only `bug_report.md` remains under `ISSUE_TEMPLATE/`).
- Produces: template file names `bug_report.md` and `PULL_REQUEST_TEMPLATE.md` that `github-issues.md` links to.

- [ ] **Step 1: Write `.github/PULL_REQUEST_TEMPLATE.md`**

```markdown
## What changed

<!-- One to three sentences. -->

## Why

<!-- The concrete problem: what broke, what failed, or what was missing, and where you saw it. -->

## How it was tested

<!-- Commands run and their results. For skill changes: the sessions you ran and what changed before/after. -->

## Harness

| Harness | Version | Model |
|---------|---------|-------|
|         |         |       |

## Authorship

<!-- Written by hand, or produced with an agent? Name the agent and harness if so. -->

- [ ] A human has read the complete diff.
```

- [ ] **Step 2: Write `.github/ISSUE_TEMPLATE/bug_report.md`**

```markdown
---
name: Bug Report
about: Something isn't working as expected
labels: bug
---

## Environment

| Field | Value |
|-------|-------|
| Ultrapowers version | |
| Harness and version | |
| Model | |
| OS and shell | |

## What happened

<!-- Be specific. Include the exact error text if there is one. -->

## Steps to reproduce

1.
2.
3.

## Expected behavior

## Transcript or log

<!-- A session transcript or debug log is the most useful thing you can attach. The diagnosing-ultrapowers skill can build a scrubbed bundle for you. -->
```

- [ ] **Step 3: Repoint `github-issues.md` at the surviving template**

`skills/diagnosing-ultrapowers/references/github-issues.md` lines 39-44 currently read (the inner three-backtick lines are part of the file):
````
Without `gh`, hand over a prefilled link on the `diagnosis_report.md`
template, which applies both labels for any reporter:

```
https://github.com/raoofaltaher/ultrapowers/issues/new?template=diagnosis_report.md&title=<url-encoded title>&body=<url-encoded body>
```
````
Change lines 39-40 and line 43 so the passage reads:
````
Without `gh`, hand over a prefilled link on the `bug_report.md`
template, which applies the bug label for any reporter:

```
https://github.com/raoofaltaher/ultrapowers/issues/new?template=bug_report.md&title=<url-encoded title>&body=<url-encoded body>
```
````
This is the one edit to a skill reference that goes beyond a name substitution; it exists because spec 4.3 deletes the template the link pointed at. It changes a URL, not behavior-shaping prose.

- [ ] **Step 4: Verify**

Run: `grep -rn diagnosis_report . --exclude-dir=.git --exclude-dir=.remember --exclude=RELEASE-NOTES.md --exclude-dir=plans --exclude-dir=specs; echo TEMPLATE_SCAN_DONE`
Expected: only `TEMPLATE_SCAN_DONE`.

Run: `bash tests/diagnosing-ultrapowers/test-skill-structure.sh | tail -1`
Expected: `Passed: N  Failed: 0`.

Run: `wc -l .github/PULL_REQUEST_TEMPLATE.md .github/ISSUE_TEMPLATE/bug_report.md`
Expected: about 24 and 30 lines respectively (short templates, no upstream policing text).

- [ ] **Step 5: Commit**

```bash
git add .github/PULL_REQUEST_TEMPLATE.md .github/ISSUE_TEMPLATE/bug_report.md skills/diagnosing-ultrapowers/references/github-issues.md
git commit -m "github: one short PR template and one short bug template

The diagnosing skill's prefilled-issue link now targets bug_report.md,
since the diagnosis_report template was deleted with the other upstream
issue templates.

RAOOF A."
```

---

### Task 8: docs/testing.md and porting doc edits

**Files:**
- Rewrite: `docs/testing.md`
- Modify: `docs/porting-to-a-new-harness.md:24`, `:677-678`, `:743-749`, `:800`
- Verify only: `docs/windows/polyglot-hooks.md` (no manual change; contains no old name), `docs/README.opencode.md`, `docs/README.kimi.md`, `.opencode/INSTALL.md` (renamed by Task 1, pins fixed in Task 2)

**Interfaces:**
- Consumes: the suite list from Task 6's AGENTS.md (keep the two in agreement).
- Produces: no reference anywhere in `docs/` to `evals/`, `<OLD-NAME>_ROOT`/`ULTRAPOWERS_ROOT` as a contract, `sync-to-codex-plugin.sh`, `tests/codex-plugin-sync/` or `CLAUDE.md` as a repo file.

- [ ] **Step 1: Write `docs/testing.md`**

```markdown
# Testing Ultrapowers

Ultrapowers ships offline plugin-infrastructure tests under `tests/`, one directory per subject. They check that the non-LLM code works: hooks, manifests, injectors, the brainstorm companion server, the SDD scripts and the helper scripts. Skill behavior on real model sessions is judged with the `writing-skills` skill's subagent pressure tests and is not part of this suite.

## Suites and how to run them

| Directory | Subject | Run |
|---|---|---|
| `tests/hooks/` | `hooks/session-start` output shape per harness | `bash tests/hooks/test-session-start.sh` |
| `tests/pi/` | Pi extension registration and bootstrap injection | `node --test tests/pi/test-pi-extension.mjs` |
| `tests/opencode/` | OpenCode plugin loading, bootstrap caching, session classification, V2 skill registration | `bash tests/opencode/run-tests.sh` (unit); `--integration` needs OpenCode installed |
| `tests/hermes/` | Hermes plugin layout resolution and bootstrap | `python -m pytest tests/hermes` |
| `tests/kimi/` | Kimi manifest wiring | `bash tests/kimi/run-tests.sh` |
| `tests/devin/` | Devin manifest | `bash tests/devin/test-devin-plugin.sh` |
| `tests/codex/` | Codex marketplace and manifest | `bash tests/codex/test-marketplace-manifest.sh` |
| `tests/version-bump/` | `scripts/bump-version.sh` against fixtures (needs `jq`, `yq`) | `bash tests/version-bump/test-bump-version.sh` |
| `tests/shell-lint/` | `scripts/lint-shell.sh` against fixtures | `bash tests/shell-lint/test-lint-shell.sh` |
| `tests/rename-fork/` | `scripts/rename-fork.sh` against a throwaway repo | `bash tests/rename-fork/test-rename-fork.sh` |
| `tests/antigravity/` | Antigravity tool mapping reference | `bash tests/antigravity/run-tests.sh` |
| `tests/diagnosing-ultrapowers/` | Structure of the diagnosing skill (frontmatter, referenced files, leak scan, word budget) | `bash tests/diagnosing-ultrapowers/test-skill-structure.sh` |
| `tests/brainstorm-server/` | Companion server: WebSocket protocol, auth, branding, lifecycle | `cd tests/brainstorm-server && npm install && npm test` |
| `tests/claude-code/` | SDD workspace and executing-plans scripts; worktree path policy | `bash tests/claude-code/test-sdd-workspace.sh`, `bash tests/claude-code/test-executing-plans-scripts.sh`, `bash tests/claude-code/test-worktree-path-policy.sh` |

Shell scripts are linted with `scripts/lint-shell.sh --all` (ShellCheck plus `bash -n`/`sh -n`).

## Model-driven tests

`tests/claude-code/run-skill-tests.sh`, `tests/claude-code/test-subagent-driven-development*.sh`, `tests/claude-code/test-worktree-native-preference.sh` and everything under `tests/explicit-skill-requests/` drive a real Claude Code session and need a logged-in CLI. They are slow, cost tokens, and are run on demand, not as a gate.
```

- [ ] **Step 2: Edit `docs/porting-to-a-new-harness.md`**

Line 24, old:
```
- Read `CLAUDE.md` and `.github/PULL_REQUEST_TEMPLATE.md` in full — the
```
New:
```
- Read `AGENTS.md` and `.github/PULL_REQUEST_TEMPLATE.md` in full — the
```

Lines 677-678 (the two table rows), old:
```
| Native plugin marketplace | Claude Code | Register in `.claude-plugin/marketplace.json`; users `/plugin install`. The external `ultrapowers-marketplace` repo is the source of truth users install from — see the release steps in `CLAUDE.md`. |
| External marketplace fork, synced by script | Codex | `scripts/sync-to-codex-plugin.sh` rsyncs the tracked plugin files into a separate fork repo and opens a PR. Read its include/exclude list so you ship the right tree (it deliberately drops repo-internal dirs and other harnesses' dotdirs). |
```
New (one row replaces two):
```
| Native plugin marketplace | Claude Code, Codex | Register in `.claude-plugin/marketplace.json` (Claude Code) or `.agents/plugins/marketplace.json` (Codex); this repository is its own marketplace, so users add the repo and `/plugin install`. |
```

Lines 743-749 (the last bullet of that section), old:
```
- **If no existing channel fits, you're standing up a new one.** None of the four
  rows may match your harness. If it needs a Codex-style external fork sync,
  `scripts/sync-to-codex-plugin.sh` is the template to clone (note its anchored
  include/exclude list and its PR automation). And whenever you add a new
  per-harness directory, add it to the *other* harnesses' sync excludes (e.g. the
  EXCLUDES list in `sync-to-codex-plugin.sh`) so your dotdir doesn't leak into
  their distributions.
```
New:
```
- **If no existing channel fits, you're standing up a new one.** None of the
  rows may match your harness. Document the exact install command in the
  README, and register any new versioned manifest in `.version-bump.json`.
```

Line 800 (Codex row of Appendix A; after the Task 1 rename the row text reads as below), old:
```
| Codex | `.codex-plugin/plugin.json` (declares empty `hooks`) | native skill discovery (no session-start hook) | `references/codex-tools.md` | `tests/codex/`, `tests/codex-plugin-sync/` | fork sync (`scripts/sync-to-codex-plugin.sh`) |
```
New:
```
| Codex | `.codex-plugin/plugin.json` (declares empty `hooks`) | native skill discovery (no session-start hook) | `references/codex-tools.md` | `tests/codex/` | `.agents/plugins/marketplace.json` in this repo |
```

- [ ] **Step 3: Verify**

Run: `grep -n -E 'evals|ULTRAPOWERS_ROOT|<OLD-NAME>_ROOT|sync-to-codex|codex-plugin-sync|CLAUDE\.md|quorum|Quorum|drill|Drill' docs/testing.md docs/porting-to-a-new-harness.md docs/windows/polyglot-hooks.md docs/README.opencode.md docs/README.kimi.md .opencode/INSTALL.md; echo DOCS_SCAN_DONE`
Expected: only `DOCS_SCAN_DONE`. (The harness variables `CLAUDE_PLUGIN_ROOT` and `CURSOR_PLUGIN_ROOT` legitimately remain in the porting and polyglot docs; the pattern above deliberately does not match them. `tests/brainstorm-server/windows-lifecycle.test.sh:12,22` keeps `ULTRAPOWERS_ROOT` as an optional override for that one script; it is a test, not a doc, and the spec's "contract" removal concerns `docs/testing.md`.)

Run: `grep -c 'raoofaltaher/ultrapowers' docs/README.opencode.md docs/README.kimi.md .opencode/INSTALL.md`
Expected: non-zero for each (Task 1 rewrote the URLs; `docs/README.kimi.md` still offers `.../tree/dev` for unreleased installs, which is valid because this repo has a `dev` branch).

- [ ] **Step 4: Commit**

```bash
git add docs/testing.md docs/porting-to-a-new-harness.md
git commit -m "docs: testing guide without the evals harness; porting guide without the Codex sync pipeline

testing.md lists every offline suite with its command and drops the
evals section and the ROOT env contract. porting-to-a-new-harness.md
points at AGENTS.md instead of CLAUDE.md and describes Codex
distribution through this repo's own marketplace file.

RAOOF A."
```

---

### Task 9: Empty RELEASE-NOTES.md

**Files:**
- Modify: `RELEASE-NOTES.md` (102028 bytes of upstream notes, 124 old-name hits after Task 1's rename)

**Interfaces:**
- Produces: a zero-byte tracked file. Task 11 criterion 7 checks it.

- [ ] **Step 1: Truncate**

Run: `: > RELEASE-NOTES.md && wc -c RELEASE-NOTES.md`
Expected: `0 RELEASE-NOTES.md`.

- [ ] **Step 2: Commit**

```bash
git add RELEASE-NOTES.md
git commit -m "release notes: start empty for the ultrapowers release line

The file stays tracked and will hold the first ultrapowers release note.

RAOOF A."
```

---

### Task 10: Test updates, per file

**Files:** every test file named below.

**Interfaces:**
- Consumes: Task 1's renamed identifiers, Task 2's manifest values, Task 3's server behavior, Task 4's deletions.
- Produces: every offline suite green for Task 11.

Most test edits were produced mechanically by Task 1; for those, this task lists the exact old and new lines and a grep that proves the new line is present. Files needing hand edits beyond the blind pass were changed in Task 2 (`tests/codex/test-marketplace-manifest.sh`) and Task 3 (`tests/brainstorm-server/branding.test.js`); they are listed here for completeness with their verification. Run each `grep -c` shown; every count must be at least 1 unless stated otherwise.

- [ ] **Step 1: Name-assertion files from spec 4.5**

`tests/kimi/test-plugin-manifest.sh`
- old 24: `assert_equal(manifest.get("name"), "<old-name>", "plugin name")` → new: `assert_equal(manifest.get("name"), "ultrapowers", "plugin name")`
- old 28: `    "using-<old-name>",` → new: `    "using-ultrapowers",`
- verify: `grep -c '"ultrapowers", "plugin name"' tests/kimi/test-plugin-manifest.sh`

`tests/devin/test-devin-plugin.sh`
- old 2: `# Validate the Devin CLI integration. \`devin plugins install obra/<old-name>\`` → new: `# Validate the Devin CLI integration. \`devin plugins install raoofaltaher/ultrapowers\``
- old 35: `if manifest.get("name") != "<old-name>":` → new: `if manifest.get("name") != "ultrapowers":`
- old 36: `    raise AssertionError(f"plugin name: expected '<old-name>', got {manifest.get('name')!r}")` → new: `    raise AssertionError(f"plugin name: expected 'ultrapowers', got {manifest.get('name')!r}")`
- verify: `grep -c 'raoofaltaher/ultrapowers' tests/devin/test-devin-plugin.sh`

`tests/codex/test-marketplace-manifest.sh` (hand-edited in Task 2 Step 10)
- old 25: `assert_equal(marketplace.get("name"), "<old-name>-dev", "marketplace name")` → new: `assert_equal(marketplace.get("name"), "ultrapowers", "marketplace name")`
- old 28: `    "<Old-name> Dev",` → new: `    "Ultrapowers",`
- old 36: `matching_plugins = [plugin for plugin in plugins if plugin.get("name") == "<old-name>"]` → new: `... == "ultrapowers"]`
- old 37: `assert_equal(len(matching_plugins), 1, "<old-name> plugin entry count")` → new: `... "ultrapowers plugin entry count")`
- verify: `grep -c '"ultrapowers", "marketplace name"' tests/codex/test-marketplace-manifest.sh` and `grep -c 'ultrapowers-dev' tests/codex/test-marketplace-manifest.sh` (must be `0`).

`tests/pi/test-pi-extension.mjs`
- old 11: `const extensionPath = resolve(repoRoot, '.pi/extensions/<old-name>.ts');` → new: `... '.pi/extensions/ultrapowers.ts');`
- old 12: `const piToolsPath = resolve(repoRoot, 'skills/using-<old-name>/references/pi-tools.md');` → new: `... 'skills/using-ultrapowers/references/pi-tools.md');`
- old 48: `  assert.equal(pkg.name, '<old-name>');` → new: `  assert.equal(pkg.name, 'ultrapowers');`
- old 51: `  assert.deepEqual(pkg.pi.extensions, ['./.pi/extensions/<old-name>.ts']);` → new: `... ['./.pi/extensions/ultrapowers.ts']);`
- old 87, 93, 117: `/You have <old-name>/` → new: `/You have ultrapowers/`
- verify: `grep -c 'You have ultrapowers' tests/pi/test-pi-extension.mjs` (expected `3`)

`tests/hermes/test_plugin.py`
- old 16: `BOOTSTRAP_MARKER = "<old-name>:using-<old-name> bootstrap for hermes"` → new: `BOOTSTRAP_MARKER = "ultrapowers:using-ultrapowers bootstrap for hermes"`
- old 52, 127, 134: `assert "using-<old-name>" in mock_ctx._skills` → new: `assert "using-ultrapowers" in mock_ctx._skills`
- old 103, 105, 106, 137: `tmp_path / "<old-name>"` → new: `tmp_path / "ultrapowers"`
- old 109: `for skill in ("using-<old-name>", "brainstorming"):` → new: `for skill in ("using-ultrapowers", "brainstorming"):`
- verify: `grep -c 'using-ultrapowers' tests/hermes/test_plugin.py` (expected `4`)

`tests/hermes/test_bootstrap.py`
- old 11: `BOOTSTRAP_MARKER = "<old-name>:using-<old-name> bootstrap for hermes"` → new: `BOOTSTRAP_MARKER = "ultrapowers:using-ultrapowers bootstrap for hermes"`
- old 53: `os.path.join(skills, "using-<old-name>", "SKILL.md")` → new: `os.path.join(skills, "using-ultrapowers", "SKILL.md")`
- old 64: `def test_contains_using_<old-name>_body(self):` → new: `def test_contains_using_ultrapowers_body(self):`
- old 68: `assert "You have <old-name>" in content` → new: `assert "You have ultrapowers" in content`
- old 79: `m._skills_dir(), "using-<old-name>", "references", "hermes-tools.md"` → new: `... "using-ultrapowers", ...`
- old 90: `assert 'skill_view("<old-name>:brainstorming")' in content` → new: `assert 'skill_view("ultrapowers:brainstorming")' in content`
- verify: `grep -c 'skill_view("ultrapowers:brainstorming")' tests/hermes/test_bootstrap.py`

`tests/opencode/test-skill-registration.mjs`
- old 116: `... part.text.startsWith('<EXTREMELY_IMPORTANT>\nYou have <old-name>.')` → new: `... 'You have ultrapowers.')`
- old 144: `... path.join(os.tmpdir(), '<old-name>-frontmatter-'));` → new: `'ultrapowers-frontmatter-'`
- old 146: `... path.join(fixtureRoot, '.opencode', 'plugins', '<old-name>.js');` → new: `'ultrapowers.js'`
- verify: `grep -c "You have ultrapowers" tests/opencode/test-skill-registration.mjs`

`tests/opencode/test-priority.sh` (integration test; renamed for consistency only)
- old 22-24: `<OLD-NAME>_SKILLS_DIR` → new: `ULTRAPOWERS_SKILLS_DIR` (and every other `<OLD-NAME>_` token, markers `PRIORITY_MARKER_ULTRAPOWERS_VERSION`, `PRIORITY_MARKER_ULTRAPOWERS_ONLY_VERSION`, skill dir `ultrapowers-only-test`)
- verify: `grep -c 'ULTRAPOWERS_SKILLS_DIR' tests/opencode/test-priority.sh` (expected `5`: lines 24, 25, 71, 202, 203) and `grep -c -i <old-name> tests/opencode/test-priority.sh` (expected `0`)

`tests/opencode/setup.sh`
- old 22: `<OLD-NAME>_DIR="$OPENCODE_CONFIG_DIR/<old-name>"` → new: `ULTRAPOWERS_DIR="$OPENCODE_CONFIG_DIR/ultrapowers"`
- old 23: `<OLD-NAME>_SKILLS_DIR="$<OLD-NAME>_DIR/skills"` → new: `ULTRAPOWERS_SKILLS_DIR="$ULTRAPOWERS_DIR/skills"`
- old 24: `<OLD-NAME>_PLUGIN_FILE="$<OLD-NAME>_DIR/.opencode/plugins/<old-name>.js"` → new: `ULTRAPOWERS_PLUGIN_FILE="$ULTRAPOWERS_DIR/.opencode/plugins/ultrapowers.js"`
- old 32: `cp "$REPO_ROOT/.opencode/plugins/<old-name>.js" "$<OLD-NAME>_PLUGIN_FILE"` → new: `cp "$REPO_ROOT/.opencode/plugins/ultrapowers.js" "$ULTRAPOWERS_PLUGIN_FILE"`
- old 36: `ln -sf "$<OLD-NAME>_PLUGIN_FILE" "$OPENCODE_CONFIG_DIR/plugins/<old-name>.js"` → new: `ln -sf "$ULTRAPOWERS_PLUGIN_FILE" "$OPENCODE_CONFIG_DIR/plugins/ultrapowers.js"`
- old 86-88: `export <OLD-NAME>_DIR` / `..._SKILLS_DIR` / `..._PLUGIN_FILE` → new: `export ULTRAPOWERS_DIR` / `export ULTRAPOWERS_SKILLS_DIR` / `export ULTRAPOWERS_PLUGIN_FILE`
- verify: `grep -c 'export ULTRAPOWERS_' tests/opencode/setup.sh` (expected `3`)

`tests/opencode/test-plugin-loading.sh`
- old 16: `plugin_link="$OPENCODE_CONFIG_DIR/plugins/<old-name>.js"` → new: `.../plugins/ultrapowers.js"`
- old 47: `if [ -f "$<OLD-NAME>_SKILLS_DIR/using-<old-name>/SKILL.md" ]; then` → new: `if [ -f "$ULTRAPOWERS_SKILLS_DIR/using-ultrapowers/SKILL.md" ]; then`
- old 56: `if node --check "$<OLD-NAME>_PLUGIN_FILE" 2>/dev/null; then` → new: `if node --check "$ULTRAPOWERS_PLUGIN_FILE" 2>/dev/null; then`
- old 65: `if grep -q 'configDir}/skills/<old-name>/' "$<OLD-NAME>_PLUGIN_FILE"; then` → new: `if grep -q 'configDir}/skills/ultrapowers/' "$ULTRAPOWERS_PLUGIN_FILE"; then` (a negative check; stays valid)
- verify: `grep -c 'ULTRAPOWERS_PLUGIN_FILE' tests/opencode/test-plugin-loading.sh` (expected `2`)

Also in `tests/opencode/`: `test-bootstrap-caching.sh:14,18,20`, `test-bootstrap-caching.mjs:32,93`, `test-session-bootstrap.mjs:8,41`, `test-session-bootstrap.sh:4`, `test-skill-registration.sh:15-16`, `test-tools.sh:4,85,87` were renamed the same way (`ULTRAPOWERS_*`, `UltrapowersPlugin`, `ultrapowers.js`, `using-ultrapowers`, `You have ultrapowers.`).
- verify: `grep -rc -i <old-name> tests/opencode | grep -v ':0$'` (expected: no output)

`tests/brainstorm-server/branding.test.js`: rewritten in Task 3 Step 1.
- verify: `grep -c "'/brand-logo.svg'" tests/brainstorm-server/branding.test.js` and `grep -c -i <old-name> tests/brainstorm-server/branding.test.js` (expected `0`; the file spells the upstream name only as `['super', 'powers'].join('')`).

`tests/brainstorm-server/lifecycle.test.js`
- old 115: `'find "$1/.<old-name>/brainstorm" -mindepth 1 -maxdepth 1 -type d -print | sort | tail -1',` → new: `'find "$1/.ultrapowers/brainstorm" ...'`
- old 119: `... expected at least one session dir under ${projectDir}/.<old-name>/brainstorm` → new: `.../.ultrapowers/brainstorm`
- verify: `grep -c '.ultrapowers/brainstorm' tests/brainstorm-server/lifecycle.test.js` (expected `2`)

`tests/brainstorm-server/start-server.test.sh:77` and `windows-lifecycle.test.sh:12,22`: `.<old-name>/brainstorm` → `.ultrapowers/brainstorm`; `<OLD-NAME>_ROOT` → `ULTRAPOWERS_ROOT`.
- verify: `grep -c 'ULTRAPOWERS_ROOT' tests/brainstorm-server/windows-lifecycle.test.sh` (expected `2`)

`tests/claude-code/test-sdd-workspace.sh`
- old 78: `if [[ "$dir_a" == "$repo/.<old-name>/sdd/plan-a" ]]; then` → new: `if [[ "$dir_a" == "$repo/.ultrapowers/sdd/plan-a" ]]; then`
- old 79/81: `pass|fail "prints <repo-root>/.<old-name>/sdd/<plan-basename>"` → new: `.../.ultrapowers/sdd/...`
- old 93-96: `.<old-name>/sdd/.gitignore` → new: `.ultrapowers/sdd/.gitignore`
- old 104, 114, 209: `if [[ "$status" != *".<old-name>"* ]]; then` → new: `*".ultrapowers"*`
- old 125, 142, 198, 223, 272-314, 344: every `.<old-name>/sdd/` → `.ultrapowers/sdd/`
- verify: `grep -c '\.ultrapowers/sdd' tests/claude-code/test-sdd-workspace.sh` (expected at least `20`; 24 lines by the author's count) and `grep -c -i <old-name> tests/claude-code/test-sdd-workspace.sh` (expected `0`)

`tests/claude-code/test-executing-plans-scripts.sh`
- old 65: `if [[ "$out" == *"brief: $repo/.<old-name>/sdd/plan/task-1-brief.md"* ]]; then` → new: `.../.ultrapowers/sdd/plan/task-1-brief.md"* ]]; then`
- old 77, 89, 104: `$repo/.<old-name>/sdd/plan/...` → new: `$repo/.ultrapowers/sdd/plan/...`
- verify: `grep -c '\.ultrapowers/sdd/plan' tests/claude-code/test-executing-plans-scripts.sh` (expected `4`)

`tests/claude-code/test-subagent-driven-development-integration.sh` (model-driven)
- old 56, 59, 135, 149: `docs/<old-name>/plans/...` → new: `docs/ultrapowers/plans/...`
- old 208: `... "skill":"<old-name>:subagent-driven-development"' ...` → new: `"skill":"ultrapowers:subagent-driven-development"`
- verify: `grep -c 'ultrapowers:subagent-driven-development' tests/claude-code/test-subagent-driven-development-integration.sh`

`tests/diagnosing-ultrapowers/test-skill-structure.sh` (moved from `tests/diagnosing-<old-name>/`)
- old 10: `SKILL_DIR="$REPO_ROOT/skills/diagnosing-<old-name>"` → new: `SKILL_DIR="$REPO_ROOT/skills/diagnosing-ultrapowers"`
- old 26-29: `'^name: diagnosing-<old-name>$'` / `"frontmatter name is diagnosing-<old-name>"` → new: `diagnosing-ultrapowers`
- verify: `grep -c 'diagnosing-ultrapowers' tests/diagnosing-ultrapowers/test-skill-structure.sh` (expected `6`: lines 2, 10, 20, 26, 27, 29) and `test -d tests/diagnosing-<old-name> && echo STILL_THERE || echo OLD_DIR_GONE` (expected `OLD_DIR_GONE`)

`tests/hooks/test-session-start.sh`
- old 210: `mkdir -p "$legacy_home/.config/<old-name>/skills"` → new: `.../.config/ultrapowers/skills"`
- old 215: `"<Old-name> now uses"$'\037'"~/.config/<old-name>/skills"$'\037'"~/.claude/skills"$'\037'"legacy" \` → new: `"Ultrapowers now uses"$'\037'"~/.config/ultrapowers/skills"...` (a must-not-contain assertion; still valid per spec 4.5)
- verify: `grep -c 'Ultrapowers now uses' tests/hooks/test-session-start.sh`

`tests/version-bump/test-bump-version.sh`
- old 44: `make_fixture "$happy_repo" $'name: <old-name>\nversion: 1.2.3'` → new: `$'name: ultrapowers\nversion: 1.2.3'`
- old 62: `make_fixture "$invalid_repo" $'name: <old-name>\nversion: 123'` → new: `$'name: ultrapowers\nversion: 123'`
- verify: `grep -c 'name: ultrapowers' tests/version-bump/test-bump-version.sh` (expected `2`)

- [ ] **Step 2: Other test files touched by the blind pass**

`tests/claude-code/test-worktree-path-policy.sh`
- old 2: `# Regression check: <Old-name> should not route ...` → new: `# Regression check: Ultrapowers should not route ...`
- old 12: `ROTOTILL_SPEC="$REPO_ROOT/docs/<old-name>/specs/2026-04-06-worktree-rototill-design.md"` → new: `.../docs/ultrapowers/specs/...` (file moved in Task 1)
- old 13: `ROTOTILL_PLAN="$REPO_ROOT/docs/<old-name>/plans/2026-04-06-worktree-rototill.md"` → new: `.../docs/ultrapowers/plans/...`
- old 50, 55, 58, 59: `"~/.config/<old-name>/worktrees"` → new: `"~/.config/ultrapowers/worktrees"` (must-not-contain; valid)
- verify: `test -f docs/ultrapowers/specs/2026-04-06-worktree-rototill-design.md && test -f docs/ultrapowers/plans/2026-04-06-worktree-rototill.md && echo ROTOTILL_DOCS_MOVED`

`tests/claude-code/test-helpers.sh:152`: `docs/<old-name>/plans/$plan_name.md` → `docs/ultrapowers/plans/$plan_name.md`.
`tests/claude-code/README.md:3,12`: prose renamed.
`tests/antigravity/test-antigravity-tools.sh:16-17`: `skills/using-<old-name>/...` → `skills/using-ultrapowers/...`.
`tests/shell-lint/test-lint-shell.sh:74,123`: `<OLD-NAME>_SHELL_LINT_TEST_LOG` → `ULTRAPOWERS_SHELL_LINT_TEST_LOG` (used only by the test's own stub tools; consistent on both lines).
`tests/explicit-skill-requests/run-*.sh` and `prompts/*.txt`: `docs/<old-name>/plans/` → `docs/ultrapowers/plans/`; `/tmp/<old-name>-tests/` → `/tmp/ultrapowers-tests/` (model-driven; consistency only).
- verify all: `grep -rIl -i <old-name> tests; echo TESTS_SCAN_DONE` (expected: only `TESTS_SCAN_DONE`)

- [ ] **Step 3: Deleted with their subject (Task 4)**

`tests/codex-plugin-sync/` and `tests/codex/test-package-codex-plugin.sh` no longer exist.
- verify: `test ! -e tests/codex-plugin-sync && test ! -e tests/codex/test-package-codex-plugin.sh && echo DELETED_TESTS_GONE`

- [ ] **Step 4: Run every offline suite**

```bash
bash tests/hooks/test-session-start.sh
node --test tests/pi/test-pi-extension.mjs
bash tests/opencode/run-tests.sh
python -m pytest tests/hermes -q
bash tests/kimi/run-tests.sh
bash tests/devin/test-devin-plugin.sh
bash tests/codex/test-marketplace-manifest.sh
bash tests/version-bump/test-bump-version.sh
bash tests/shell-lint/test-lint-shell.sh
bash tests/rename-fork/test-rename-fork.sh
bash tests/antigravity/run-tests.sh
bash tests/diagnosing-ultrapowers/test-skill-structure.sh
bash tests/claude-code/test-sdd-workspace.sh
bash tests/claude-code/test-executing-plans-scripts.sh
bash tests/claude-code/test-worktree-path-policy.sh
(cd tests/brainstorm-server && node branding.test.js)
```
Expected: every command exits 0 with its own pass banner (`STATUS: PASSED`, `# fail 0`, `N passed`, `... looks good`, `Passed: N  Failed: 0`, `--- Results: 5 passed, 0 failed ---`). `tests/shell-lint/test-lint-shell.sh` stubs `shellcheck` and `shfmt` itself, so it runs without them installed.

- [ ] **Step 5: Commit (only if any test file changed in this task)**

This task is mostly verification; if Steps 1-3 revealed a line the blind pass missed and you edited it, commit that edit:
```bash
git add tests
git commit -m "tests: finish renaming assertions to ultrapowers

RAOOF A."
```
If nothing changed, skip the commit and note "Task 10: verification only, no diff" in the Task 11 report.

---

### Task 11: Acceptance verification (spec section 5)

**Files:** none modified. Report only.

**Interfaces:**
- Consumes: everything above.
- Produces: a pass/fail line per criterion, pasted into the final report to your human partner.

- [ ] **Step 1: Criterion 1 — old name only in the permitted places**

Run: `grep -rIl -i <old-name> . --exclude-dir=.git --exclude-dir=.remember | sort`
Expected:
```
./README.md
./docs/ultrapowers/plans/2026-09-30-rename-and-fork-hygiene.md
./docs/ultrapowers/specs/2026-09-30-rename-and-fork-hygiene-design.md
```
plus `./docs/ultrapowers-requirements.md`, the permitted exception under spec D2. `LICENSE` does not appear because it never contained the old name.

Run: `grep -c -i <old-name> README.md`
Expected: `1`.

- [ ] **Step 2: Criterion 2 — no path carries the old name**

Run: `find . -path ./.git -prune -o -iname '*<old-name>*' -print`
Expected: no output.

- [ ] **Step 3: Criterion 3 — version 1.0.0 everywhere, audit clean**

Run: `bash scripts/bump-version.sh --check`
Expected: eleven rows at `1.0.0` and `All declared files are in sync at 1.0.0`.

Run: `bash scripts/bump-version.sh --audit | tail -1`
Expected: `No undeclared files contain the version string. All clear.`

- [ ] **Step 4: Criterion 4 — every offline suite passes**

Run the sixteen commands from Task 10 Step 4, then:
```bash
(cd tests/brainstorm-server && npm install && npm test)
```
Expected: all exit 0. If `npm install` fails offline, report `tests/brainstorm-server: branding.test.js PASSED directly; ws-protocol/helper/browser-launcher/auth/server/lifecycle/start-server/stop-server SKIPPED (no network for npm install)`. A skipped suite is reported as skipped, never as passed.

- [ ] **Step 5: Criterion 5 — shell lint**

Run: `scripts/lint-shell.sh --all`
Expected: `Linting N shell files` then no findings and exit 0. Requires `shellcheck` on `PATH`; if it is missing the script dies with `error: required tool 'shellcheck' is not on PATH` and the criterion is **not met** until it is installed. As a partial check run `for f in $(git ls-files '*.sh' hooks/session-start skills/subagent-driven-development/scripts/* skills/executing-plans/scripts/*); do bash -n "$f" || echo "SYNTAX FAIL: $f"; done; echo BASH_N_DONE` and expect only `BASH_N_DONE`.

- [ ] **Step 6: Criterion 6 — manual Claude Code check**

In a Claude Code session on this machine:
1. `/plugin marketplace add S:\ultrapowers` — expect the marketplace `ultrapowers` to be added.
2. `/plugin install ultrapowers@ultrapowers` — expect success.
3. Start a new session; the injected bootstrap must begin `You have ultrapowers.` (ask the agent "quote the first line inside EXTREMELY_IMPORTANT in your context").
4. Type `/ultrapowers:brainstorming` — the skill must be listed and load.
Record the four outcomes verbatim in the report. This step cannot be automated here.

- [ ] **Step 7: Criterion 7 — release notes empty, funding file gone**

Run: `test -f RELEASE-NOTES.md && test ! -s RELEASE-NOTES.md && test ! -e .github/FUNDING.yml && echo CRITERION_7_OK`
Expected: `CRITERION_7_OK`.

- [ ] **Step 8: Criterion 8 — served HTML has no primeradiant.com**

Run:
```bash
BRAINSTORM_PORT=3499 BRAINSTORM_DIR=/tmp/brainstorm-accept BRAINSTORM_TOKEN=accept0123456789abcdef0123456789 node skills/brainstorming/scripts/server.cjs > /tmp/brainstorm-accept.log 2>&1 &
SERVER_PID=$!
sleep 1
curl -s -H 'Cookie: brainstorm-key-3499=accept0123456789abcdef0123456789' http://localhost:3499/ > /tmp/brainstorm-accept.html
curl -s -o /dev/null -w '%{http_code} %{content_type}\n' -H 'Cookie: brainstorm-key-3499=accept0123456789abcdef0123456789' http://localhost:3499/brand-logo.svg
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3499/brand-logo.svg
kill $SERVER_PID
grep -c 'primeradiant.com' /tmp/brainstorm-accept.html; grep -o 'Ultrapowers v[0-9.]*' /tmp/brainstorm-accept.html
```
Expected:
```
200 image/svg+xml
403
0
Ultrapowers v1.0.0
```

- [ ] **Step 9: Spec section 6 risk checks**

Muse completeness (every skill registered):
```bash
for d in skills/*/; do n="$(basename "$d")"; jq -e --arg n "$n" '.capabilities.skills[] | select(.id == $n and .path == "skills/\($n)/SKILL.md")' .muse-plugin/plugin.json >/dev/null || echo "MISSING in Muse manifest: $n"; done; echo MUSE_CHECK_DONE
```
Expected: only `MUSE_CHECK_DONE`.

Line endings on renamed shell files:
```bash
git ls-files --eol hooks/session-start hooks/run-hook.cmd scripts/*.sh tests/diagnosing-ultrapowers/test-skill-structure.sh tests/rename-fork/test-rename-fork.sh | awk '$1 !~ /lf/ || $2 !~ /lf/ {print "CRLF?: " $0}'; echo EOL_CHECK_DONE
```
Expected: only `EOL_CHECK_DONE`.

Skill prose untouched beyond names (D10). Find the commit just before Task 1's rename commit and diff `skills/` against it:
```bash
BASE="$(git log --format=%H --grep='^rename: <old-name> -> ultrapowers' -1)~1"
git diff --stat "$BASE" -- skills | tail -1
git diff "$BASE" -- skills/brainstorming/SKILL.md
```
Expected: the stat line names only files that contained the old name plus `server.cjs` and `frame-template.html`; the `brainstorming/SKILL.md` diff shows exactly two changed lines (135 and 241, the `docs/ultrapowers/specs/` path) and nothing else.

- [ ] **Step 10: Report**

Write the criterion-by-criterion results (PASS / FAIL / SKIPPED with reason / MANUAL with observed output) to your human partner. Nothing is committed in this task.

---

## Self-review

**Spec coverage.** Section 4.1 (identity, version, LICENSE): Task 2. Section 4.2 (path moves, substitutions, consumers): Task 1, verified in Step 10 there and in Task 10. Section 4.3 deletions: Task 4; rewrites: README Task 5, AGENTS.md Task 6, templates Task 7, testing/porting docs Task 8, RELEASE-NOTES Task 9, `CODE_OF_CONDUCT.md` untouched (no task edits it). Section 4.4 telemetry: Task 3. Section 4.5 tests: Tasks 2, 3, 10. Section 5 acceptance: Task 11. Section 6 risks: Task 1's test (case variants), Task 2/11 Muse check, Task 11 EOL check, Task 3/11 npm-skipped rule. Section 7 out of scope: nothing here migrates `.<old-name>/` ledgers or touches `.remember/`.

**Gaps found and handled.** (a) The spec does not mention `docs/windows/polyglot-hooks.md` beyond "renamed in place"; it contains no old name, so no task edits it (Task 8 verifies). (b) The spec's LICENSE exception is moot because LICENSE never contained the old name; noted in Global Constraints. (c) The diagnosing skill linked to the deleted `diagnosis_report.md` template; Task 7 repoints it and flags the edit. (d) `hooks/session-start:38` linked an upstream issue number under the fork URL; Task 2 rewrites the comment. (e) `bump-version.sh --audit` would flag `1.0.0` in tests and docs; Task 2 extends the exclude list. (f) `feature_request.md` is not named in the spec's delete list but the spec replaces all templates with one PR and one bug template; Task 4 deletes it.

**Placeholder scan.** No "TBD", "TODO", "similar to Task N", or "add appropriate" phrases. Every code step shows the code; every command shows expected output. The only deferred decision (the untracked requirements file) is explicitly handed to the human partner, not left as a placeholder.

**Type/name consistency.** `BRAND_LOGO_PATH`/`BRAND_LOGO_FILE` (Task 3 Step 3) match the route (Step 6) and the test (`'/brand-logo.svg'`, Step 1). `ULTRAPOWERS_VERSION` and `readUltrapowersVersion` come from Task 1 and are used unchanged in Task 3. Script name `scripts/rename-fork.sh` and test `tests/rename-fork/test-rename-fork.sh` are the same in Tasks 1, 6, 8, 10, 11. Marketplace name `ultrapowers`/display `Ultrapowers` are identical in Task 2 (manifests), Task 2 Step 10 (test), Task 5 (README install commands) and Task 11 Step 6.

**Review Focus coverage.** Items 1-3 are pinned by named checks in Task 1's test; item 4 by the third and fourth tests in Task 3's `branding.test.js`; item 5 by Task 2 Step 9's `--audit` expectation and Task 11 Step 3.
