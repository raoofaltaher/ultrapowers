#!/bin/sh
# ticket-lib.sh - shared helpers for the ultrapowers task lifecycle skills
# (new-task, brainstorm-task, task). POSIX sh. Source it; do not execute it.
#
# The project root is the nearest directory at or above $PWD that contains
# .agents/ultrapowers.json. Never the git toplevel: inside a nested clone the
# toplevel is the wrong repository. Never a harness variable: those are unset
# in shell tool calls.
#
# Config is read with node when available and with sed otherwise, so a machine
# without node still works for the flat keys these skills need.
# ULTRAPOWERS_NO_NODE=1 forces the sed path (used by the tests).

ULTRAPOWERS_MARKER='.agents/ultrapowers.json'
ULTRAPOWERS_DEFAULT_TICKET_PATTERN='^#?[A-Za-z0-9][A-Za-z0-9._-]*$'

have_node() {
  [ -z "${ULTRAPOWERS_NO_NODE:-}" ] || return 1
  command -v node >/dev/null 2>&1
}

find_root() {
  d="$PWD"
  while :; do
    if [ -f "$d/$ULTRAPOWERS_MARKER" ]; then
      printf '%s\n' "$d"
      return 0
    fi
    p=$(dirname "$d")
    [ "$p" = "$d" ] && break
    d="$p"
  done
  printf 'ERROR: no %s at or above [%s]. This project is not scaffolded; run /ultrapowers:init\n' \
    "$ULTRAPOWERS_MARKER" "$PWD" >&2
  return 1
}

config_string() { # $1=root $2=key $3=default -> value without trailing newline
  cfg="$1/$ULTRAPOWERS_MARKER"
  if have_node; then
    node -e '
const c = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
const v = c[process.argv[2]];
process.stdout.write(typeof v === "string" && v !== "" ? v : process.argv[3]);
' "$cfg" "$2" "$3"
  else
    v=$(tr -d '\n' <"$cfg" | sed -n 's/.*"'"$2"'"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p')
    printf '%s' "${v:-$3}"
  fi
}

config_repos() { # $1=root -> lines: name<TAB>path<TAB>area ; ".<TAB>.<TAB>-" when none
  cfg="$1/$ULTRAPOWERS_MARKER"
  if have_node; then
    node -e '
const c = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
const repos = Array.isArray(c.repos)
  ? c.repos.filter(r => r && typeof r.name === "string" && r.name !== "")
  : [];
if (repos.length === 0) process.stdout.write(".\t.\t-\n");
for (const r of repos) {
  const path = typeof r.path === "string" && r.path !== "" ? r.path : r.name;
  const area = typeof r.area === "string" && r.area !== "" ? r.area : "-";
  process.stdout.write([r.name, path, area].join("\t") + "\n");
}
' "$cfg"
  else
    out=$(tr -d '\n' <"$cfg" \
      | sed -n 's/.*"repos"[[:space:]]*:[[:space:]]*\[\([^]]*\)\].*/\1/p' \
      | tr '}' '\n' \
      | while IFS= read -r frag; do
        n=$(printf '%s' "$frag" | sed -n 's/.*"name"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p')
        [ -n "$n" ] || continue
        p=$(printf '%s' "$frag" | sed -n 's/.*"path"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p')
        a=$(printf '%s' "$frag" | sed -n 's/.*"area"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p')
        printf '%s\t%s\t%s\n' "$n" "${p:-$n}" "${a:--}"
      done)
    if [ -n "$out" ]; then printf '%s\n' "$out"; else printf '.\t.\t-\n'; fi
  fi
}

repo_path() { # $1=root $2=repo name -> absolute path; unknown name -> ERROR, rc 2
  if [ "$2" = "." ]; then
    printf '%s\n' "$1"
    return 0
  fi
  rel=$(config_repos "$1" | awk -v n="$2" 'BEGIN { FS = "\t" } $1 == n { print $2; exit }')
  if [ -z "$rel" ]; then
    printf 'ERROR: unknown repository [%s]. Names in %s: %s\n' "$2" "$ULTRAPOWERS_MARKER" \
      "$(config_repos "$1" | cut -f1 | tr '\n' ' ')" >&2
    return 2
  fi
  case "$rel" in
    /*) printf '%s\n' "$rel" ;;
    *) printf '%s/%s\n' "$1" "$rel" ;;
  esac
}

validate_ticket() { # $1=root $2=id -> rc 0 ok; rc 2 with ERROR
  pat=$(config_string "$1" ticketPattern "$ULTRAPOWERS_DEFAULT_TICKET_PATTERN")
  if [ -z "$2" ]; then
    printf 'ERROR: ticket id is empty\n' >&2
    return 2
  fi
  if printf '%s\n' "$2" | grep -Eq -- "$pat"; then
    return 0
  fi
  printf 'ERROR: ticket [%s] does not match ticketPattern %s\n' "$2" "$pat" >&2
  return 2
}

branch_of() { # $1=dir -> branch, "<detached>" or "<no-git>"
  if ! git -C "$1" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    printf '<no-git>\n'
    return 0
  fi
  b=$(git -C "$1" branch --show-current 2>/dev/null)
  printf '%s\n' "${b:-<detached>}"
}

ticket_branch_match() { # $1=branch $2=id -> rc 0 when the branch names the ticket
  # The id, less a leading #, at the start or after a non-alphanumeric
  # character, followed by a non-digit or the end. So 1234 matches 1234,
  # 1234-x and feature/1234-x, but not 12345-x, 51234 or x1234.
  id=${2#\#}
  case "$1" in
    "$id" | "$id"[!0-9]* | *[!0-9A-Za-z]"$id" | *[!0-9A-Za-z]"$id"[!0-9]*) return 0 ;;
  esac
  return 1
}

branch_report() { # $1=root -> lines: name<TAB>path<TAB>area<TAB>branch
  tab=$(printf '\t')
  config_repos "$1" | while IFS="$tab" read -r n p a; do
    if [ "$n" = "." ]; then d="$1"; else d=$(repo_path "$1" "$n") || continue; fi
    if [ -d "$d" ]; then b=$(branch_of "$d"); else b='<missing>'; fi
    printf '%s\t%s\t%s\t%s\n' "$n" "$p" "$a" "$b"
  done
}

select_by_branch() { # $1=root $2=id -> repo names on a ticket branch
  tab=$(printf '\t')
  branch_report "$1" | while IFS="$tab" read -r n _p _a b; do
    if ticket_branch_match "$b" "$2"; then printf '%s\n' "$n"; fi
  done
}

select_by_focus() { # $1=root $2...=focus words -> repo names whose name or area equals a word
  root=$1
  shift
  [ $# -gt 0 ] || return 0
  tab=$(printf '\t')
  config_repos "$root" | while IFS="$tab" read -r n _p a; do
    ln=$(printf '%s' "$n" | tr '[:upper:]' '[:lower:]')
    la=$(printf '%s' "$a" | tr '[:upper:]' '[:lower:]')
    for w in "$@"; do
      lw=$(printf '%s' "$w" | tr '[:upper:]' '[:lower:]')
      if [ "$lw" = "$ln" ] || { [ "$la" != "-" ] && [ "$lw" = "$la" ]; }; then
        printf '%s\n' "$n"
        break
      fi
    done
  done
}
