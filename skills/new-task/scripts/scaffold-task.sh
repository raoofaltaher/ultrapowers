#!/bin/sh
# scaffold-task.sh - the shell side of ultrapowers:new-task.
#
#   scaffold-task.sh check  <ID>             validate the id; print EXISTS or absent per folder
#   scaffold-task.sh create <ID> [title...]  create the four folders, .gitkeep files and the brief
#   scaffold-task.sh create <ID> --title-file <path>
#   scaffold-task.sh create <ID> --title-from-json <ticket JSON file>
#                                            the title of a remote ticket: the first line of the file
#                                            (trimmed, control characters removed) or the JSON's "title".
#                                            A remote title is never passed as shell words.
#   scaffold-task.sh commit <ID>             stage the four folders and commit once
#                                            (=== COMMITTED === or === NOTHING-TO-COMMIT ===)
#
# Exit codes: 0 ok; 1 not scaffolded, usage or a failed commit; 2 ticket rejected;
# 3 tasks/<ID> already exists.
# Every section is marked === NAME ===. Any line containing ERROR means stop.
set -u

here=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)
. "$here/ticket-lib.sh"

if [ $# -lt 2 ]; then
  printf 'usage: scaffold-task.sh check|create|commit <ID> [title... | --title-file <path> | --title-from-json <file>]\n' >&2
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
    case "${1:-}" in
      --title-file)
        if [ $# -ne 2 ] || [ ! -f "$2" ] || [ ! -r "$2" ]; then
          printf 'ERROR: --title-file needs one readable file\n' >&2
          exit 1
        fi
        title=$(head -n 1 <"$2" | tr -d '\000-\037\177' | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')
        ;;
      --title-from-json)
        if [ $# -ne 2 ] || [ ! -f "$2" ] || [ ! -r "$2" ]; then
          printf 'ERROR: --title-from-json needs one readable ticket JSON file\n' >&2
          exit 1
        fi
        if ! have_node; then
          printf 'ERROR: --title-from-json needs node; use --title-file\n' >&2
          exit 1
        fi
        title=$(node -e '
let t;
try {
  t = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8").replace(/^﻿/, "")).title;
} catch (e) {
  process.stderr.write("ERROR: " + process.argv[1] + " is not a ticket JSON file\n");
  process.exit(1);
}
t = typeof t === "string" ? t.split(/\r\n|\r|\n/)[0] : "";
process.stdout.write(t.replace(/[\u0000-\u001f\u007f-\u009f]/g, "").trim());
' "$2") || exit 1
        ;;
      *)
        title=$*
        ;;
    esac
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
    trailer=$(config_string "$root" commitTrailer '') || exit 1
    msg=$(printf 'chore(%s): scaffold task\n\nFour ticket folders and the brief at tasks/%s/%s.md, created by ultrapowers:new-task.' "$id" "$id" "$id")
    if [ -n "$trailer" ]; then
      msg=$(printf '%s\n\n%s' "$msg" "$trailer")
    fi
    set -- "tasks/$id" "specs/$id" "plans/$id" "reviews/$id"
    if ! git -C "$root" add -- "$@"; then
      printf 'ERROR: git add failed; nothing was committed\n' >&2
      exit 1
    fi
    if git -C "$root" diff --cached --quiet -- "$@"; then
      printf '=== NOTHING-TO-COMMIT ===\n'
      printf 'NOTHING-TO-COMMIT: the four %s folders have no changes. Last commit:\n' "$id"
      git -C "$root" log -1 --format='%h %s'
      exit 0
    fi
    if ! git -C "$root" commit -q -m "$msg" -- "$@"; then
      printf 'ERROR: git commit failed (see the message above); the files stay staged and nothing was committed\n' >&2
      exit 1
    fi
    printf '=== COMMITTED ===\n'
    git -C "$root" log -1 --format='%h %s'
    ;;
  *)
    printf 'ERROR: unknown mode [%s]; use check, create or commit\n' "$mode" >&2
    exit 1
    ;;
esac
