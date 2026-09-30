#!/usr/bin/env bash
# run-suite.sh <repo-dir> <out-dir> <command>
#
# Runs ONE configured suite command (qa.suites[].command) inside <repo-dir>, with every
# `{{out}}` in the command replaced by the absolute <out-dir> and QA_SUITE_OUT exported to the
# same value. Records started-at, stdout.txt, exit-code and finished-at under <out-dir>.
# Writes <out-dir>/.failed (containing the command) when the command exits non-zero AND left
# no *.trx, *.xml or *.json result file: that is a crashed suite, which the judge reports as
# INCOMPLETE. A non-zero exit WITH results is a suite with failing tests, which is a result.
# Exit 0 always; lane 6 starts this in the background and reads the markers later.
set -uo pipefail

usage="usage: run-suite.sh <repo-dir> <out-dir> <command>"
repo="${1:?$usage}"
out="${2:?$usage}"
cmd="${3:?$usage}"

mkdir -p "$out" || exit 1
out_abs="$(cd "$out" && pwd)"

# A re-run reuses this out dir: nothing from the previous run may be read as this run's.
rm -f "$out_abs/.failed" "$out_abs/exit-code" "$out_abs/started-at" "$out_abs/finished-at" "$out_abs/stdout.txt"
for f in "$out_abs"/*.trx "$out_abs"/*.xml "$out_abs"/*.json; do
  if [ -e "$f" ]; then rm -f "$f"; fi
done

# `{{out}}` is replaced by the quoting it sits in, so the path stays one word even when it
# holds a space (a Windows home directory), a quote or an `&`: bare, it becomes the path in
# single quotes; inside single quotes, the path itself; inside double quotes, ${QA_SUITE_OUT}.
q="'"
bs='\'
lit="${out_abs//"$q"/"$q$bs$q$q"}"
res=""
state=""
i=0
n=${#cmd}
while [ "$i" -lt "$n" ]; do
  if [ "${cmd:$i:7}" = "{{out}}" ]; then
    case "$state" in
      "'") res+="$lit" ;;
      '"') res+='${QA_SUITE_OUT}' ;;
      *) res+="'$lit'" ;;
    esac
    i=$((i + 7))
    continue
  fi
  c="${cmd:$i:1}"
  if [ "$state" = "'" ]; then
    if [ "$c" = "'" ]; then state=""; fi
  elif [ "$c" = "$bs" ]; then
    res+="$c${cmd:$((i + 1)):1}"
    i=$((i + 2))
    continue
  elif [ "$state" = '"' ]; then
    if [ "$c" = '"' ]; then state=""; fi
  elif [ "$c" = "'" ] || [ "$c" = '"' ]; then
    state="$c"
  fi
  res+="$c"
  i=$((i + 1))
done
cmd="$res"

date -u +%Y-%m-%dT%H:%M:%SZ > "$out_abs/started-at"
(cd "$repo" && QA_SUITE_OUT="$out_abs" bash -c "$cmd") > "$out_abs/stdout.txt" 2>&1
code=$?
printf '%s\n' "$code" > "$out_abs/exit-code"

has_results=0
for f in "$out_abs"/*.trx "$out_abs"/*.xml "$out_abs"/*.json; do
  if [ -e "$f" ]; then
    has_results=1
  fi
done
if [ "$code" -ne 0 ] && [ "$has_results" -eq 0 ]; then
  printf '%s\n' "$cmd" > "$out_abs/.failed"
fi
date -u +%Y-%m-%dT%H:%M:%SZ > "$out_abs/finished-at"
exit 0
