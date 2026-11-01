#!/usr/bin/env bash
# Fixture: a project in /scratch with a QA run, a hunt run (separate projects) and an autopilot marker.
set -u
HOOK=/target/hooks/qa-guardrail
now="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
mk() { # $1 dir, $2 kind
  local d="$1"
  mkdir -p "$d/.agents" "$d/.ultrapowers" "$d/.claude" "$d/reviews/T1" "$d/hooks" "$d/.github"
  echo '{"name":"x","pluginVersion":"1.0.0","qa":{"hosts":{"allowed":[],"forbidden":[]}}}' > "$d/.agents/ultrapowers.json"
  echo '{}' > "$d/.claude/settings.json"
  echo '#!/bin/sh' > "$d/hooks/qa-guardrail"
  case "$2" in
    qa) mkdir -p "$d/.ultrapowers/runs"; printf '{"run":"qa-T1-0000abcd","profile":"qa","id":"T1","session":null,"startedAt":"%s"}\n' "$now" > "$d/.ultrapowers/runs/qa-T1-0000abcd.json" ;;
    hunt) mkdir -p "$d/.ultrapowers/runs"; printf '{"run":"hunt-T1-0000abcd","profile":"hunt","id":"T1","session":null,"startedAt":"%s"}\n' "$now" > "$d/.ultrapowers/runs/hunt-T1-0000abcd.json" ;;
    ap) printf '{"ticket":"T1","branch":"T1-x","scope":["."]}' > "$d/.ultrapowers/autopilot-active"; mkdir -p "$d/.ultrapowers/autopilot"
        printf '{"mcpServers":{"filesystem":{},"gmail":{},"slack":{},"github":{}}}' > "$d/.ultrapowers/autopilot/mcp.json" ;;
  esac
}
mk /scratch/qa qa; mk /scratch/hunt hunt; mk /scratch/ap ap
run() { # $1 label, $2 dir, $3 event
  local out rc
  out="$(cd "$2" && printf '%s' "$3" | bash "$HOOK" 2>&1 >/dev/null)"; rc=$?
  printf '%-44s exit=%s %s\n' "$1" "$rc" "$(printf '%s' "$out" | head -c 150)"
}
FS='mcp__filesystem__move_file'
run "qa move protected src -> reviews"   /scratch/qa   '{"tool_name":"'$FS'","tool_input":{"source":".agents/ultrapowers.json","destination":"reviews/T1/m.json"}}'
run "qa move run record -> reviews"      /scratch/qa   '{"tool_name":"'$FS'","tool_input":{"source":".ultrapowers/runs/qa-T1-0000abcd.json","destination":"reviews/T1/r.json"}}'
run "qa move guardrail src -> reviews"   /scratch/qa   '{"tool_name":"'$FS'","tool_input":{"source":"hooks/qa-guardrail","destination":"reviews/T1/g"}}'
run "qa control: dest protected"         /scratch/qa   '{"tool_name":"'$FS'","tool_input":{"source":"reviews/T1/a","destination":".agents/ultrapowers.json"}}'
run "hunt move run record (default deny)" /scratch/hunt '{"tool_name":"'$FS'","tool_input":{"source":".ultrapowers/runs/hunt-T1-0000abcd.json","destination":"reviews/T1/r.json"}}'
run "ap move marker -> workspace"        /scratch/ap   '{"tool_name":"'$FS'","tool_input":{"source":".ultrapowers/autopilot-active","destination":"moved.txt"}}'
run "ap move ci src -> workspace"        /scratch/ap   '{"tool_name":"'$FS'","tool_input":{"source":".github","destination":"gh-old"}}'
run "ap control: dest marker"            /scratch/ap   '{"tool_name":"'$FS'","tool_input":{"source":"a","destination":".ultrapowers/autopilot-active"}}'
# Mail and chat MCP tools
for p in hunt qa ap; do
  for t in mcp__claude_ai_Gmail__trash_thread mcp__claude_ai_Gmail__mark_thread_spam mcp__claude_ai_Gmail__untrash_message mcp__claude_ai_Slack__slack_schedule_message mcp__claude_ai_github__request_copilot_review mcp__github__resolve_review_thread mcp__claude_ai_Gmail__create_draft mcp__claude_ai_Gmail__label_message; do
    srv="$t"
    ev='{"tool_name":"'$t'","tool_input":{"id":"1"}}'
    [ "$p" = ap ] && { sv="${t#mcp__}"; sv="${sv%%__*}"; sv="$(printf '%s' "$sv" | tr 'A-Z-' 'a-z_')"; printf '{"mcpServers":{"%s":{}}}' "$sv" > /scratch/ap/.ultrapowers/autopilot/mcp.json; }
    run "$p $t" /scratch/$p "$ev"
  done
done
# Decoy higher-priority key beside the real lower-priority one
run "qa TargetFile protected + path decoy" /scratch/qa '{"tool_name":"write_to_file","tool_input":{"TargetFile":"/scratch/qa/.claude/settings.json","path":"reviews/T1/x","CodeContent":"x"}}'
run "qa TargetFile protected alone"        /scratch/qa '{"tool_name":"write_to_file","tool_input":{"TargetFile":"/scratch/qa/.claude/settings.json","CodeContent":"x"}}'
run "qa target_file outside + file_path decoy" /scratch/qa '{"tool_name":"edit_file","tool_input":{"target_file":"/etc/passwd","file_path":"reviews/T1/x","instructions":"x"}}'
# tilde
run "ap Write ~/.bashrc"                   /scratch/ap '{"tool_name":"Write","tool_input":{"file_path":"~/.bashrc","content":"x"}}'
run "ap Write ~/.claude/settings.json"     /scratch/ap '{"tool_name":"Write","tool_input":{"file_path":"~/.claude/settings.json","content":"x"}}'
run "qa Write ~/x"                         /scratch/qa '{"tool_name":"Write","tool_input":{"file_path":"~/x","content":"x"}}'
