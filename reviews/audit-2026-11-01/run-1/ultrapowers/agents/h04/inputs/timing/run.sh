#!/usr/bin/env bash
# Times hooks/qa-guardrail on a hunt fixture project for events of growing size.
set -u
P=/scratch/proj
mkdir -p "$P/.agents" "$P/.ultrapowers/runs"
echo '{}' > "$P/.agents/ultrapowers.json"
printf '{"run":"hunt-x-0000abcd","profile":"hunt","id":"x","session":null,"startedAt":"%s"}' "$(node -e 'console.log(new Date().toISOString())')" > "$P/.ultrapowers/runs/hunt-x-0000abcd.json"
cd "$P"
cat > /scratch/gen.js <<'EOF'
const fs = require('fs');
const [kind, n, out] = [process.argv[2], Number(process.argv[3]), process.argv[4]];
let cmd;
if (kind === 'pad') cmd = 'echo ' + 'a'.repeat(n);
else if (kind === 'semi') cmd = 'echo a;'.repeat(Math.floor(n / 7));
else if (kind === 'sub') cmd = 'echo $(echo a) '.repeat(Math.floor(n / 16));
else if (kind === 'quote') cmd = "echo 'a' \"b\" ".repeat(Math.floor(n / 13));
else cmd = 'cat < /dev/null | '.repeat(Math.floor(n / 19)) + 'cat';
fs.writeFileSync(out, JSON.stringify({ tool_name: 'Bash', tool_input: { command: cmd }, cwd: '/scratch/proj' }));
EOF
for kind in pad semi sub quote pipe; do
  for n in 10000 100000 400000; do
    node /scratch/gen.js "$kind" "$n" /scratch/ev.json
    s=$EPOCHREALTIME
    bash /target/hooks/qa-guardrail < /scratch/ev.json > /scratch/out.txt 2> /scratch/err.txt
    rc=$?
    e=$EPOCHREALTIME
    msg=$(<"/scratch/err.txt")
    echo "kind=$kind n=$n rc=$rc start=$s end=$e reason=${msg:0:140}"
  done
done
