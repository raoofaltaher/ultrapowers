#!/bin/sh
# review-preflight.sh - Step 2 of ultrapowers:task-review. Writes nothing.
#
#   review-preflight.sh <ID> [focus words...]
#
# Sections: ROOT, DOCS, SELECTION, RANGES, STATUS.
#   DOCS       the markdown files ultrapowers:task would read (its manifest's list).
#   SELECTION  the order brainstorm-task uses: SELECTED-BY-FOCUS, SELECTED-BY-TICKET,
#              SELECTED-BY-BRANCH, SELECTED-ROOT, ASK.
#   RANGES     one line per selected repository that is on a ticket branch:
#              name<TAB>base<TAB>branch<TAB>files<TAB>commits, the base being that repository's
#              own defaultBranch, so two repositories may differ. A selected repository that is
#              not on a ticket branch gets a "# NOT-ON-TICKET-BRANCH" line instead.
#   STATUS     READY (a range exists), NO-CODE (no range, but a spec exists), NO-WORK (neither).
# Exit codes: 0 ok; 1 not scaffolded or usage; 2 ticket rejected; 3 the change set could not be read.
# Any line containing ERROR means stop.
set -u

here=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)
skills=$(CDPATH='' cd -- "$here/../.." && pwd)
. "$skills/new-task/scripts/ticket-lib.sh"

id=${1:-}
if [ -z "$id" ]; then
  printf 'usage: review-preflight.sh <ID> [focus words...]\n' >&2
  exit 1
fi
shift

root=$(find_root) || exit 1
validate_ticket "$root" "$id" || exit 2
printf '=== ROOT ===\nroot=%s\n' "$root"

printf '\n=== DOCS ===\n'
(cd "$root" && sh "$skills/task/scripts/manifest.sh" "$id" 2>/dev/null) \
  | awk '/^=== MARKDOWN TO READ/ { on = 1; next } /^=== / { on = 0 } on && /^ *[0-9]+ bytes/ { print }'
printf '(read each file once, with the file-reading tool)\n'

printf '\n=== SELECTION ===\n'
sel=''
if [ $# -gt 0 ]; then
  sel=$(select_by_focus "$root" "$@")
  if [ -n "$sel" ]; then
    printf 'SELECTED-BY-FOCUS (%s): %s\n' "$*" "$(printf '%s' "$sel" | tr '\n' ' ' | sed 's/ $//')"
  else
    printf 'FOCUS-NO-MATCH (%s): no repo name or area matched; falling through.\n' "$*"
  fi
fi
if [ -z "$sel" ]; then
  sel=$(select_by_brief "$root" "$id")
  if [ -n "$sel" ]; then printf 'SELECTED-BY-TICKET: %s (the brief'"'"'s Repository line)\n' "$sel"; fi
fi
if [ -z "$sel" ]; then
  sel=$(select_by_branch "$root" "$id")
  if [ -n "$sel" ]; then
    printf 'SELECTED-BY-BRANCH: %s\n' "$(printf '%s' "$sel" | tr '\n' ' ' | sed 's/ $//')"
  fi
fi
if [ -z "$sel" ] && [ "$(config_repos "$root" | cut -f1)" = "." ]; then
  sel='.'
  printf 'SELECTED-ROOT: . (project has no nested repositories)\n'
fi
if [ -z "$sel" ]; then
  printf 'ASK: no focus, ticket or branch match. Ask one multiple-choice question over: %s(propose at most three)\n' \
    "$(config_repos "$root" | cut -f1 | tr '\n' ' ')"
fi
printf 'Confirm the set with your human partner before reading any code.\n'

printf '\n=== RANGES ===\n'
printf 'name\tbase\tbranch\tfiles\tcommits\n'
ranges=''
if ! have_node; then
  printf 'ERROR: node is required to read the change set\n'
  exit 3
fi
cs=$(cd "$root" && node "$skills/qa-specialist/scripts/qa-preflight.mjs" --change-set-only "$id" 2>&1)
rc=$?
if [ "$rc" -ne 0 ]; then
  printf 'ERROR: the change set could not be read: %s\n' "$cs"
  exit 3
fi
# The root shown as "." in a project with no nested repositories is the entry whose path is ".".
ranges=$(printf '%s' "$cs" | node -e '
const entries = JSON.parse(require("fs").readFileSync(0, "utf8"));
const names = process.argv.slice(1);
const out = [];
for (const n of names) {
  const e = entries.find((x) => (n === "." ? x.path === "." : x.repo === n));
  if (!e) { out.push(`# NOT-ON-TICKET-BRANCH ${n} (no entry in the change set)`); continue; }
  if (e.error) { out.push(`# ERROR ${n}: ${e.error}`); continue; }
  if (!e.onTicketBranch) { out.push(`# NOT-ON-TICKET-BRANCH ${n} (on ${e.branch})`); continue; }
  out.push([e.repo, e.defaultBranch, e.branch, e.files.length, e.commits.length].join("\t"));
}
process.stdout.write(out.join("\n") + (out.length ? "\n" : ""));
' $sel)
[ -z "$ranges" ] || printf '%s\n' "$ranges"

printf '\n=== STATUS ===\n'
has_range=no
case "$ranges" in
  *[!#]*) if printf '%s' "$ranges" | grep -qv '^#'; then has_range=yes; fi ;;
esac
spec_files=0
if [ -d "$root/specs/$id" ]; then
  spec_files=$(find "$root/specs/$id" -type f ! -name '.gitkeep' | wc -l | tr -d ' ')
fi
if [ "$has_range" = yes ]; then
  printf 'STATUS: READY\n'
elif [ "$spec_files" -gt 0 ]; then
  printf 'STATUS: NO-CODE (a spec exists, no repository is on a ticket branch; review the documents only or ask where the work is)\n'
else
  printf 'STATUS: NO-WORK (no ticket branch in any repository and no spec; say so and stop)\n'
fi
