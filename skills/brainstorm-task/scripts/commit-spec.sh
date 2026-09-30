#!/bin/sh
# commit-spec.sh - Step 7 of ultrapowers:brainstorm-task: commit specs/<ID>/Spec.md
# with the project's commitTrailer when one is configured.
#
#   commit-spec.sh <ID> <one-line summary>
#
# Exit codes: 0 ok; 1 not scaffolded, usage or missing Spec.md; 2 ticket rejected.
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

trailer=$(config_string "$root" commitTrailer '')
msg=$(printf 'spec(%s): %s\n\nWritten by ultrapowers:brainstorm-task after a grounded brainstorming session.' "$id" "$summary")
if [ -n "$trailer" ]; then
  msg=$(printf '%s\n\n%s' "$msg" "$trailer")
fi
git -C "$root" add -- "$spec"
git -C "$root" commit -q -m "$msg" -- "$spec"
printf '=== COMMITTED ===\n'
git -C "$root" log -1 --format='%h %s'
