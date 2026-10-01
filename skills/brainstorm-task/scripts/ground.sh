#!/bin/sh
# ground.sh - Step 4 of ultrapowers:brainstorm-task: grep the brief's terms in
# one repository and print every candidate file, ranked: those matching the
# most distinct terms first, then the most matching lines, then by path. There
# is no cap: the agent reads every file the design depends on, strongest match
# first, and follows what those files lead to. Grounding the root (.) skips the
# knowledge-base folders: the brief contains every term by construction, and
# other tickets' documents are not code.
#
#   ground.sh <ID> <repo-name|.> <term> [term...]
#
# Each argument after the repo is one fixed-string, case-insensitive term.
# Tracked and untracked files are searched; ignored files are not.
# Exit codes: 0 ok; 1 not scaffolded or usage; 2 unknown or missing repo.
set -u

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

if git -C "$dir" rev-parse --is-inside-work-tree >/dev/null 2>&1; then is_git=yes; else is_git=no; fi

search() { # $1=-c|-l, then -e term ...; prints path:count or path, one per line
  mode=$1
  shift
  if [ "$is_git" = yes ]; then
    git -C "$dir" grep -I -i "$mode" -F --untracked "$@" -- . 2>/dev/null || true
  else
    (cd "$dir" && grep -rIiF "$mode" --exclude-dir=.git "$@" . 2>/dev/null | sed 's|^\./||') || true
  fi
}

kb_filter() { # drop the knowledge-base folders when grounding the root
  if [ "$repo" = "." ]; then
    grep -v -e '^tasks/' -e '^specs/' -e '^plans/' -e '^reviews/' -e '^\.agents/' || true
  else
    cat
  fi
}

# Distinct terms per file: one listing per term, counted with uniq -c.
lists=''
for t in "$@"; do
  l=$(search -l -e "$t")
  if [ -n "$l" ]; then
    lists=$(printf '%s\n%s' "$lists" "$l")
  fi
done
distinct=$(printf '%s\n' "$lists" | sed '/^$/d' | kb_filter | LC_ALL=C sort | uniq -c)

# Turn "a b c" into "-e a -e b -e c" without arrays.
n=$#
i=0
while [ "$i" -lt "$n" ]; do
  t=$1
  shift
  set -- "$@" -e "$t"
  i=$((i + 1))
done
hits=$(search -c "$@" | kb_filter)

tab=$(printf '\t')
ranked=$({
  printf '%s\n' "$distinct" | sed '/^$/d; s/^/D /'
  printf '%s\n' "$hits" | sed '/^$/d; s/^/H /'
} | awk '
  /^D / { s = substr($0, 3); match(s, /^ *[0-9]+ /); d[substr(s, RLENGTH + 1)] = substr(s, 1, RLENGTH) + 0; next }
  /^H / { s = substr($0, 3); c = s; sub(/.*:/, "", c); p = s; sub(/:[^:]*$/, "", p)
          if (c + 0 > 0) print (d[p] + 0) "\t" (c + 0) "\t" p }
' | LC_ALL=C sort -t "$tab" -k1,1nr -k2,2nr -k3,3)
total=$(printf '%s\n' "$ranked" | grep -c . || true)

printf '=== GROUNDING CANDIDATES: %s (ticket %s) ===\n' "$repo" "$id"
if [ "$total" -eq 0 ]; then
  printf '(0 files matched; widen the terms or pick another repository)\n'
  exit 0
fi
printf '%s\n' "$ranked" | while IFS="$tab" read -r nt nl p; do
  printf '%3s terms %5s hits  %s\n' "$nt" "$nl" "$p"
done
printf '(%s files matched; all listed)\n' "$total"
printf 'Read every file the design depends on, highest first, and what those files lead to. Record each one you read in the grounding manifest.\n'
