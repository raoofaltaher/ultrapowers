#!/usr/bin/env bash
# The project pre-commit template runs the spec check on the specs a commit
# stages: every spec it adds, and every spec it changes that already carries a
# decision record. It blocks on findings, passes an old spec that is edited for
# another reason, and warns and continues when the plugin is not reachable.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
TEMPLATE="$REPO_ROOT/templates/.githooks/pre-commit.tmpl"
SPEC_TEMPLATE="$REPO_ROOT/templates/specs/_template/Spec.md.tmpl"
FIXTURE="$REPO_ROOT/tests/brainstorming/fixtures/minimal-valid.md"

FAILURES=0
pass() { echo "  [PASS] $1"; }
fail() { echo "  [FAIL] $1"; FAILURES=$((FAILURES + 1)); }

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

# The project lives at a path with a space in it: every path the hook handles
# must be quoted.
PROJECT="$WORK/with space"
mkdir -p "$PROJECT/.githooks" "$PROJECT/.agents" "$PROJECT/specs/_template" "$WORK/no-home"

g() { git -C "$PROJECT" "$@"; }
g init -q
g config user.email "test@example.invalid"
g config user.name "Test"
g config core.hooksPath .githooks
g config core.autocrlf false
cp "$TEMPLATE" "$PROJECT/.githooks/pre-commit"
chmod +x "$PROJECT/.githooks/pre-commit"
printf '{"version":1}' > "$PROJECT/.agents/ultrapowers.json"
cp "$SPEC_TEMPLATE" "$PROJECT/specs/_template/Spec.md"

# put <path>: the standard input becomes that file of the project.
put() { mkdir -p "$(dirname "$PROJECT/$1")"; cat > "$PROJECT/$1"; }
# stage <path>...: add those files to the index.
stage() { g add -- "$@"; }

# with_question <line> <file>: the file with that line added under "## Intent".
with_question() { awk -v line="$1" '{ print } /^## Intent$/ { print line }' "$2"; }
# A question that only the project's own template will hold.
PROJECT_QUESTION='_Is anything else part of that moment?_'

# The spec bodies: the clean fixture, the fixture with a line of the template
# left under "## Intent", and the fixture with a bare "None" under "## Intent".
clean_spec() { cat "$FIXTURE"; }
question_spec() { with_question '_What does success look like to them?_' "$FIXTURE"; }
bare_none_spec() { awk 'after_intent { print "None"; after_intent = 0; next } { print } /^## Intent$/ { after_intent = 1 }' "$FIXTURE"; }

# A commit attempt; the output and the status stay in $out and $status.
commit_with_plugin() {
  set +e
  out="$(ULTRAPOWERS_ROOT="$REPO_ROOT" git -C "$PROJECT" commit -q -m "$1" 2>&1)"
  status=$?
  set -e
}
# The same with the plugin out of reach: no ULTRAPOWERS_ROOT and an empty HOME.
commit_without_plugin() {
  set +e
  out="$(env -u ULTRAPOWERS_ROOT HOME="$WORK/no-home" git -C "$PROJECT" commit -q -m "$1" 2>&1)"
  status=$?
  set -e
}
# has <text>: the last commit's output holds that text.
has() { case "$out" in *"$1"*) return 0 ;; esac; return 1; }
show() { printf '%s\n' "$out" | sed 's/^/    /'; }

echo "pre-commit spec check"

# 1. The template carries the block.
if grep -q '^# >>> spec check' "$TEMPLATE" && grep -q '^# <<< spec check' "$TEMPLATE"; then
  pass "template has the marked block"
else
  fail "template has the marked block"
fi

# 2. The commit that adds the project's template and the config: the template
# fails its own rules by design and is not checked.
stage .agents/ultrapowers.json specs/_template/Spec.md
commit_with_plugin "scaffold"
if [ "$status" -eq 0 ] && ! has "spec check"; then
  pass "the commit that adds the template and the config is not checked"
else
  fail "the commit that adds the template and the config is not checked"; show
fi

# 2b. A later change to the template is not checked either, although the
# template carries a decision record.
with_question "$PROJECT_QUESTION" "$SPEC_TEMPLATE" > "$PROJECT/specs/_template/Spec.md"
stage specs/_template/Spec.md
commit_with_plugin "extend the template"
if [ "$status" -eq 0 ] && ! has "spec check"; then
  pass "a change to the project's own template is not checked"
else
  fail "a change to the project's own template is not checked"; show
fi

# 2c. The checker reads the project's own template, not the plugin's: a spec
# that keeps the question only the project's template has fails. (The template's
# working copy equals the committed one here, so this case does not say which of
# the two is read; 4b and 4c do that for the spec.)
with_question "$PROJECT_QUESTION" "$FIXTURE" | put specs/GH-6/Spec.md
stage specs/GH-6/Spec.md
commit_with_plugin "a line of the project template"
if [ "$status" -ne 0 ] && has ": question: " && has "$PROJECT_QUESTION"; then
  pass "the checker reads the project's own template, not the plugin's"
else
  fail "the checker reads the project's own template, not the plugin's"; show
fi
g rm -q -f --cached -- specs/GH-6/Spec.md
rm -rf "$PROJECT/specs/GH-6"

# 3. A new spec that still holds a line of the template: blocked, findings printed.
question_spec | put specs/GH-1/Spec.md
stage specs/GH-1/Spec.md
commit_with_plugin "new spec with a template line"
if [ "$status" -ne 0 ] && has ": question: " && has "spec check found problems"; then
  pass "a new spec that fails the check is blocked and the findings are printed"
else
  fail "a new spec that fails the check is blocked and the findings are printed"; show
fi

# 3b. Every staged spec is checked, and one failure refuses the commit: two
# failing specs come first in path order (GH-1 and GH-4) and a clean one last
# (GH-5), so a status taken from the last run alone would let the commit through;
# one name holds a space. GH-1 is written and staged here, so the case does not
# depend on what case 3 left in the index.
question_spec | put specs/GH-1/Spec.md
question_spec | put "specs/GH-4 with space/Spec.md"
clean_spec | put specs/GH-5/Spec.md
stage specs/GH-1/Spec.md "specs/GH-4 with space/Spec.md" specs/GH-5/Spec.md
commit_with_plugin "three specs"
found="$(printf '%s\n' "$out" | grep -c ': question: ' || true)"
if [ "$status" -ne 0 ] && [ "$found" -eq 2 ]; then
  pass "every staged spec is checked and one failure refuses the commit"
else
  fail "every staged spec is checked and one failure refuses the commit ($found findings)"; show
fi
g rm -q -f --cached -- "specs/GH-4 with space/Spec.md" specs/GH-5/Spec.md
rm -rf "$PROJECT/specs/GH-4 with space" "$PROJECT/specs/GH-5"

# 4. The same file, clean: the commit goes through.
clean_spec | put specs/GH-1/Spec.md
stage specs/GH-1/Spec.md
commit_with_plugin "clean spec"
if [ "$status" -eq 0 ]; then
  pass "a new spec that passes the check commits"
else
  fail "a new spec that passes the check commits"; show
fi

# 4b. The hook checks what is being committed, not the working tree: a staged
# spec that fails blocks the commit although the working copy was fixed after
# staging.
question_spec | put specs/GH-8/Spec.md
stage specs/GH-8/Spec.md
clean_spec | put specs/GH-8/Spec.md
commit_with_plugin "staged spec fails, working copy clean"
if [ "$status" -ne 0 ] && has ": question: " && has "spec check found problems"; then
  pass "a staged spec that fails blocks the commit although the working copy is clean"
else
  fail "a staged spec that fails blocks the commit although the working copy is clean"; show
fi

# 4c. The reverse: a staged spec that passes commits although the working copy
# was broken after staging.
clean_spec | put specs/GH-8/Spec.md
stage specs/GH-8/Spec.md
question_spec | put specs/GH-8/Spec.md
commit_with_plugin "staged spec clean, working copy broken"
if [ "$status" -eq 0 ]; then
  pass "a staged spec that passes commits although the working copy is broken"
else
  fail "a staged spec that passes commits although the working copy is broken"; show
fi
clean_spec | put specs/GH-8/Spec.md

# 5. An old spec, committed without the plugin, then edited: it holds no
# decision record, so it is not checked (its content fails every rule).
printf '# old\n' | put specs/GH-2/Spec.md
stage specs/GH-2/Spec.md
commit_without_plugin "old spec"
first_status=$status
first_out="$out"
printf '# old\n\nmore\n' | put specs/GH-2/Spec.md
stage specs/GH-2/Spec.md
commit_with_plugin "edit the old spec"
if [ "$first_status" -eq 0 ] && [ "$status" -eq 0 ]; then
  pass "a changed spec without a decision record is not checked"
else
  fail "a changed spec without a decision record is not checked"
  printf '%s\n' "$first_out" | sed 's/^/    first commit: /'
  printf '%s\n' "$out" | sed 's/^/    edit: /'
fi

# 6. A changed spec that carries a decision record is checked.
bare_none_spec | put specs/GH-1/Spec.md
stage specs/GH-1/Spec.md
commit_with_plugin "bare None"
if [ "$status" -ne 0 ] && has "spec check found problems" && has ": empty: "; then
  pass "a changed spec with a decision record is checked and blocked"
else
  fail "a changed spec with a decision record is checked and blocked"; show
fi
clean_spec | put specs/GH-1/Spec.md
stage specs/GH-1/Spec.md

# 7. Under docs/ultrapowers/specs/ only a -design.md file is a spec.
printf '# notes\n' | put docs/ultrapowers/specs/notes.md
stage docs/ultrapowers/specs/notes.md
commit_with_plugin "notes"
if [ "$status" -eq 0 ]; then
  pass "a new file under docs/ultrapowers/specs/ without the -design.md suffix is not checked"
else
  fail "a new file under docs/ultrapowers/specs/ without the -design.md suffix is not checked"; show
fi
printf '# notes\n' | put docs/ultrapowers/specs/2026-10-12-x-design.md
stage docs/ultrapowers/specs/2026-10-12-x-design.md
commit_with_plugin "design"
if [ "$status" -ne 0 ] && has "spec check found problems"; then
  pass "a new -design.md file under docs/ultrapowers/specs/ is checked and blocked"
else
  fail "a new -design.md file under docs/ultrapowers/specs/ is checked and blocked"; show
fi
g rm -q -f --cached -- docs/ultrapowers/specs/2026-10-12-x-design.md
rm -f "$PROJECT/docs/ultrapowers/specs/2026-10-12-x-design.md"

# 7b. A rename is a modification, not a new file. The old spec of case 5 holds no
# decision record: moved to another folder it is still not checked (it would be
# if the rename counted as an addition, and every move would force a retrofit).
mkdir -p "$PROJECT/specs/GH-2r"
g mv specs/GH-2/Spec.md specs/GH-2r/Spec.md
commit_with_plugin "move the old spec"
if [ "$status" -eq 0 ] && ! has "spec check found problems"; then
  pass "a renamed old spec without a decision record is not checked"
else
  fail "a renamed old spec without a decision record is not checked"; show
fi

# 7c. A spec that carries a record is checked when it is renamed: here it moves
# to another folder and one section is emptied to a bare None in the same commit,
# which git reports as a rename with a change, not as an addition.
clean_spec | put specs/GH-10/Spec.md
stage specs/GH-10/Spec.md
commit_with_plugin "a spec with a record"
mkdir -p "$PROJECT/specs/GH-11"
g mv specs/GH-10/Spec.md specs/GH-11/Spec.md
bare_none_spec | put specs/GH-11/Spec.md
stage specs/GH-11/Spec.md
commit_with_plugin "move the spec and empty a section"
if [ "$status" -ne 0 ] && has "spec check found problems" && has ": empty: "; then
  pass "a renamed spec with a decision record is checked and blocked"
else
  fail "a renamed spec with a decision record is checked and blocked"; show
fi
clean_spec | put specs/GH-11/Spec.md
stage specs/GH-11/Spec.md

# 7d. A path with non-ASCII characters is listed as it is (core.quotePath off),
# so a new spec in such a folder is still checked, not skipped as an unmatched
# quoted name. The folder is spelled with its UTF-8 bytes to keep this file ASCII.
accent="GH-$(printf '\303\251')"
question_spec | put "specs/$accent/Spec.md"
stage "specs/$accent/Spec.md"
commit_with_plugin "a spec in a folder with a non-ASCII name"
if [ "$status" -ne 0 ] && has ": question: " && has "spec check found problems"; then
  pass "a new spec under a non-ASCII folder name is checked and blocked"
else
  fail "a new spec under a non-ASCII folder name is checked and blocked"; show
fi
g rm -q -f --cached -- "specs/$accent/Spec.md"
rm -rf "${PROJECT:?}/specs/$accent"

# 8. Plugin not reachable: warns and continues, the failing spec goes in.
printf '# bad\n' | put specs/GH-3/Spec.md
stage specs/GH-3/Spec.md
commit_without_plugin "no plugin"
if [ "$status" -eq 0 ] && has "spec check skipped (ultrapowers plugin not found"; then
  pass "without a reachable plugin the hook warns and lets the commit through"
else
  fail "without a reachable plugin the hook warns and lets the commit through"; show
fi

if [ "$FAILURES" -gt 0 ]; then echo "STATUS: FAILED ($FAILURES failure(s))"; exit 1; fi
echo "STATUS: PASSED"
