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

here=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)
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
