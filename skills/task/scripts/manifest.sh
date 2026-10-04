#!/bin/sh
# manifest.sh - Step 1 of ultrapowers:task. Read-only: it writes nothing.
#
#   manifest.sh <ID>
#
# Sections: ROOT, MARKDOWN TO READ, STAGE LOG, NON-MARKDOWN, REPO STATE.
# Exit codes: 0 ok; 1 not scaffolded or usage; 2 ticket rejected.
set -u

here=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)
. "$here/../../new-task/scripts/ticket-lib.sh"

id=${1:-}
if [ -z "$id" ]; then
  printf 'usage: manifest.sh <ID>\n' >&2
  exit 1
fi

root=$(find_root) || exit 1
validate_ticket "$root" "$id" || exit 2
printf '=== ROOT ===\nroot=%s\n' "$root"

printf '\n=== MARKDOWN TO READ (one file-reading call per file, in this order) ===\n'
total=0
bytes=0
present=0
for f in tasks specs plans reviews; do
  if [ ! -d "$root/$f/$id" ]; then
    printf '%s/%s  ABSENT\n' "$f" "$id"
    continue
  fi
  present=$((present + 1))
  list=$(find "$root/$f/$id" -type f -name '*.md' | LC_ALL=C sort)
  c=0
  if [ -n "$list" ]; then
    while IFS= read -r p; do
      s=$(wc -c <"$p" | tr -d ' ')
      printf '%9s bytes  ~%6s tokens  %s\n' "$s" "$((s / 4))" "${p#"$root/"}"
      c=$((c + 1))
      bytes=$((bytes + s))
    done <<EOF
$list
EOF
  fi
  printf '           (%s markdown files in %s/%s)\n' "$c" "$f" "$id"
  total=$((total + c))
done
printf 'TOTAL: %s markdown files, %s bytes, ~%s tokens\n' "$total" "$bytes" "$((bytes / 4))"
if [ "$present" -eq 0 ]; then
  printf 'ALL-ABSENT: ticket %s does not exist yet; suggest /ultrapowers:new-task %s\n' "$id" "$id"
fi

# The autopilot engine's record, when the ticket ran under it: the stage and its status
# from tasks/<ID>/autopilot.json, the hash-chain check, and the last ten log lines.
printf '\n=== STAGE LOG (autopilot; the position when present) ===\n'
state_file="$root/tasks/$id/autopilot.json"
log_file="$root/tasks/$id/stage-log.jsonl"
if [ ! -f "$state_file" ] && [ ! -f "$log_file" ]; then
  printf '(none)\n'
elif have_node; then
  node --input-type=module -e '
import { pathToFileURL } from "node:url";
const [, lib, root, id] = process.argv;
const m = await import(pathToFileURL(lib).href);
const s = m.readState(root, id);
const chain = m.verifyChain(root, id);
const chainText = chain.ok ? "ok" : `broken@${chain.at}`;
console.log(`stage=${s?.stage ?? "?"}  status=${s?.stageStatus ?? "?"}  mode=${s?.mode ?? "?"}  chain=${chainText}  attempt=${s?.attempt ?? "?"}`);
if (s?.packet?.commentUrl) console.log(`packet=${s.packet.commentUrl}`);
if (s?.approval?.actor) console.log(`approved-by=${s.approval.actor} at ${s.approval.at}`);
if (s?.qa?.verdict) console.log(`qa=${s.qa.verdict}`);
if (s?.pr?.docs) console.log(`pr=${s.pr.docs}`);
const lines = m.readLog(root, id).slice(-10);
for (const l of lines) console.log(`${l.at}  ${l.stage}  ${l.event}  ${l.actor}  ${l.repo ?? ""}`);
' "$here/../../autopilot/scripts/autopilot-lib.mjs" "$root" "$id" 2>/dev/null || printf 'ERROR: the autopilot state or log of %s could not be read\n' "$id"
else
  stage=$(sed -n 's/.*"stage": *"\([a-z]*\)".*/\1/p' "$state_file" 2>/dev/null | head -1)
  status=$(sed -n 's/.*"stageStatus": *"\([a-z]*\)".*/\1/p' "$state_file" 2>/dev/null | head -1)
  mode=$(sed -n 's/.*"mode": *"\([a-z]*\)".*/\1/p' "$state_file" 2>/dev/null | head -1)
  printf 'stage=%s  status=%s  mode=%s  chain=unchecked (node is not available)\n' "${stage:-?}" "${status:-?}" "${mode:-?}"
  [ -f "$log_file" ] && tail -n 10 "$log_file"
fi

printf '\n=== NON-MARKDOWN (not read; name one by path to have it read) ===\n'
set --
for f in tasks specs plans reviews; do
  [ -d "$root/$f/$id" ] && set -- "$@" "$root/$f/$id"
done
if [ $# -eq 0 ]; then
  printf '(none)\n'
else
  nonmd=$(find "$@" -type f ! -name '*.md' ! -name '.gitkeep' | LC_ALL=C sort)
  if [ -z "$nonmd" ]; then
    printf '(none)\n'
  else
    printf '%s\n' "$nonmd" | while IFS= read -r p; do
      printf '%9s bytes  %s\n' "$(wc -c <"$p" | tr -d ' ')" "${p#"$root/"}"
    done
  fi
fi

printf '\n=== REPO STATE ===\n'
# The ticket's own documents live in the root repository, which is not one of
# the declared repos, so report their commits and working-tree state first.
printf -- '----- knowledge base (tasks, specs, plans, reviews for %s)  branch=%s -----\n' "$id" "$(branch_of "$root")"
if git -C "$root" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  set -- "tasks/$id" "specs/$id" "plans/$id" "reviews/$id"
  kblog=$(git -C "$root" log --oneline -10 -- "$@" 2>/dev/null || true)
  if [ -n "$kblog" ]; then printf '%s\n' "$kblog"; else printf '(no commits touch these folders yet)\n'; fi
  printf -- '-- working tree --\n'
  st=$(git -C "$root" status --short --untracked-files=all -- "$@")
  if [ -n "$st" ]; then printf '%s\n' "$st"; else printf '(clean)\n'; fi
else
  printf '(the knowledge base is not in a git repository)\n'
fi
tab=$(printf '\t')
branch_report "$root" | while IFS="$tab" read -r n _p _a b; do
  d=$(repo_path "$root" "$n") || continue
  if ticket_branch_match "$b" "$id"; then m='ticket branch: yes'; else m='ticket branch: no'; fi
  printf -- '----- %s  branch=%s  %s -----\n' "$n" "$b" "$m"
  if [ -d "$d" ] && git -C "$d" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    git -C "$d" log --oneline -10 2>/dev/null || printf '(no commits yet)\n'
    printf -- '-- working tree --\n'
    st=$(git -C "$d" status --short)
    if [ -n "$st" ]; then printf '%s\n' "$st"; else printf '(clean)\n'; fi
  else
    printf '(not a git repository or missing: %s)\n' "$d"
  fi
done
