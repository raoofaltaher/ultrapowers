#!/bin/sh
# preflight.sh - Step 1 of ultrapowers:brainstorm-task. Writes nothing.
#
#   preflight.sh <ID> [focus words...]
#
# Sections: ROOT, BRIEF, EXISTING SPEC WORK, REPOS, SELECTION.
# Exit codes: 0 ok; 1 not scaffolded or usage; 2 ticket rejected.
# Any line containing ERROR means stop.
set -u

here=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)
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
    printf 'FOCUS-NO-MATCH (%s): no repo name or area matched; falling through. To focus by area, add "area": "<word>" to repo entries in %s (init does not set it).\n' "$*" "$ULTRAPOWERS_MARKER"
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
