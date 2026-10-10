#!/usr/bin/env bash
# run-suite.sh <repo-dir> <out-dir> <command>
#
# Runs ONE configured suite command (qa.suites[].command) inside <repo-dir>, with every
# `{{out}}` in the command replaced by the absolute <out-dir> and QA_SUITE_OUT exported to the
# same value. Records started-at, stdout.txt, exit-code and finished-at under <out-dir>.
# Writes <out-dir>/.failed (containing the command) when the command exits non-zero AND left
# no *.trx, *.xml or *.json result file: that is a crashed suite, which the judge reports as
# INCOMPLETE. A non-zero exit WITH results is a suite with failing tests, which is a result.
# The command runs as the leader of its own process group (setsid, else set -m), and <out-dir>/pid
# holds that leader's pid, so every process the suite started can be ended as one.
#   run-suite.sh --stop <out-dir> [reason]   ends that group (TERM, then KILL after 5 s; on Windows
#     taskkill /T /F of the process tree), writes stopped-at ("<time> <reason>") first, and exits 0.
#     A suite that already has finished-at is left untouched. Exit 0 when nothing is alive too.
# QA_SUITE_TIMEOUT_SEC (set by the contract from suites[].timeoutSec) stops the suite itself with
#   the reason "timeout".
# Exit 0 always; lane 6 starts this in the background and reads the markers later.
set -uo pipefail

# stop_suite <out-dir> <reason>: see the header. Writes stopped-at before killing, so the runner
# that is waiting on the child reads it as "stopped" and writes no finished-at.
stop_suite() {
  local dir="$1" reason="$2" pid wpid
  [ -d "$dir" ] || return 0
  [ -f "$dir/finished-at" ] && return 0
  printf '%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$reason" > "$dir/stopped-at"
  pid=""
  if [ -f "$dir/pid" ]; then pid="$(cat "$dir/pid" 2>/dev/null)"; fi
  case "$pid" in ''|*[!0-9]*) return 0 ;; esac
  case "$(uname -s)" in
    MINGW*|MSYS*|CYGWIN*)
      wpid="$(cat "/proc/$pid/winpid" 2>/dev/null)"
      if [ -n "$wpid" ]; then MSYS2_ARG_CONV_EXCL='*' taskkill /T /F /PID "$wpid" >/dev/null 2>&1; fi
      kill -KILL -- "-$pid" 2>/dev/null
      ;;
    *)
      kill -TERM -- "-$pid" 2>/dev/null
      for _ in 1 2 3 4 5; do
        kill -0 -- "-$pid" 2>/dev/null || break
        sleep 1
      done
      kill -KILL -- "-$pid" 2>/dev/null
      ;;
  esac
  return 0
}

if [ "${1:-}" = "--stop" ]; then
  stop_dir="${2:?usage: run-suite.sh --stop <out-dir> [reason]}"
  stop_suite "$stop_dir" "${3:-stop}"
  exit 0
fi

usage="usage: run-suite.sh <repo-dir> <out-dir> <command>"
repo="${1:?$usage}"
out="${2:?$usage}"
cmd="${3:?$usage}"

mkdir -p "$out" || exit 1
out_abs="$(cd "$out" && pwd)"

# A re-run reuses this out dir: nothing from the previous run may be read as this run's.
rm -f "$out_abs/.failed" "$out_abs/exit-code" "$out_abs/started-at" "$out_abs/finished-at" "$out_abs/stdout.txt" "$out_abs/pid" "$out_abs/stopped-at"
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

# The command leads its own process group, so stop_suite can end it with everything it started.
# With setsid the subshell execs into setsid, which keeps the pid; without it, set -m makes the
# background subshell a group leader.
if command -v setsid >/dev/null 2>&1; then
  (cd "$repo" && QA_SUITE_OUT="$out_abs" exec setsid bash -c "$cmd") > "$out_abs/stdout.txt" 2>&1 &
else
  set -m
  (cd "$repo" && QA_SUITE_OUT="$out_abs" exec bash -c "$cmd") > "$out_abs/stdout.txt" 2>&1 &
  set +m
fi
child=$!
printf '%s\n' "$child" > "$out_abs/pid"

trap 'stop_suite "$out_abs" term' TERM INT

watchdog=""
if [ "${QA_SUITE_TIMEOUT_SEC:-0}" -gt 0 ] 2>/dev/null; then
  (sleep "$QA_SUITE_TIMEOUT_SEC"; stop_suite "$out_abs" timeout) >/dev/null 2>&1 &
  watchdog=$!
fi

# wait returns early when a trapped signal arrives; keep waiting until the command is gone.
wait "$child" 2>/dev/null
code=$?
while kill -0 "$child" 2>/dev/null; do
  wait "$child" 2>/dev/null
  code=$?
done
if [ -n "$watchdog" ]; then kill "$watchdog" 2>/dev/null; fi
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
if [ ! -f "$out_abs/stopped-at" ]; then
  date -u +%Y-%m-%dT%H:%M:%SZ > "$out_abs/finished-at"
fi
exit 0
