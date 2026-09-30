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

here=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)
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
