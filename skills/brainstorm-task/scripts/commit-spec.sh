#!/bin/sh
# commit-spec.sh - Step 7 of ultrapowers:brainstorm-task: commit specs/<ID>/Spec.md
# with the project's commitTrailer when one is configured.
#
#   commit-spec.sh <ID> <one-line summary>
#
# Prints === COMMITTED === or, when Spec.md is unchanged, === NOTHING-TO-COMMIT ===.
# Before it stages anything it runs the spec check, brainstorming/scripts/check-doc.mjs:
# a spec that fails prints === SPEC-CHECK-FAILED === with the findings; without node the
# check is skipped, === SPEC-CHECK-SKIPPED === is printed and the spec is committed.
# Exit codes: 0 ok; 1 not scaffolded, usage, missing Spec.md, a spec that fails the
# spec check, a spec check that cannot run, or a failed commit; 2 ticket rejected.
set -u

here=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)
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

check="$here/../../brainstorming/scripts/check-doc.mjs"
if have_node; then
  if [ ! -f "$check" ]; then
    printf 'ERROR: the spec check could not run: %s is missing. Nothing was staged.\n' "$check" >&2
    exit 1
  fi
  check_status=0
  check_out=$(node "$check" "$root/$spec" 2>&1) || check_status=$?
  if [ "$check_status" -eq 1 ]; then
    # Findings are fixed and the script run again, so this line carries no ERROR prefix:
    # brainstorm-task reads ERROR as "stop".
    printf '=== SPEC-CHECK-FAILED ===\n%s\n' "$check_out"
    printf '%s fails the spec check (listed above); fix the lines and run again. Nothing was staged.\n' "$spec" >&2
    exit 1
  elif [ "$check_status" -ne 0 ]; then
    printf 'ERROR: the spec check could not run (exit %s): %s\n' "$check_status" "$check_out" >&2
    exit 1
  fi
else
  printf '=== SPEC-CHECK-SKIPPED ===\nnode not available; %s was not checked\n' "$spec"
fi

trailer=$(config_string "$root" commitTrailer '') || exit 1
msg=$(printf 'spec(%s): %s\n\nWritten by ultrapowers:brainstorm-task after a grounded brainstorming session.' "$id" "$summary")
if [ -n "$trailer" ]; then
  msg=$(printf '%s\n\n%s' "$msg" "$trailer")
fi
if ! git -C "$root" add -- "$spec"; then
  printf 'ERROR: git add failed; nothing was committed\n' >&2
  exit 1
fi
if git -C "$root" diff --cached --quiet -- "$spec"; then
  printf '=== NOTHING-TO-COMMIT ===\n'
  printf 'NOTHING-TO-COMMIT: %s has no changes since its last commit:\n' "$spec"
  git -C "$root" log -1 --format='%h %s' -- "$spec"
  exit 0
fi
if ! git -C "$root" commit -q -m "$msg" -- "$spec"; then
  printf 'ERROR: git commit failed (see the message above); %s stays staged and nothing was committed\n' "$spec" >&2
  exit 1
fi
printf '=== COMMITTED ===\n'
git -C "$root" log -1 --format='%h %s'
