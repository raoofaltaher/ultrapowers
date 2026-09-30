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
  done < <(find . -path ./.git -prune -o -type d -ipath "*${old}*" -print0 | sort -rz)
fi

suffix=""
[[ "$dry_run" == true ]] && suffix=" (dry run)"
echo "rename-fork: $edited file(s) edited, $moved path(s) moved$suffix"
