// event-fields.mjs: the top-level fields of a tool event, for hooks/qa-guardrail's root scan.
// Reads the event JSON on stdin (a trailing NUL is ignored) and prints the named top-level keys
// (default: cwd, tool_name), one per line, empty when absent or not a string. A key written
// `name[0]` prints the first element of a top-level array when it is a string (Cursor's
// workspace_roots[0]). A key nested under tool_input is never read: a tool argument cannot name
// the run's root. Exit 2 on malformed JSON
// or a non-object event, exit 3 when a value holds a line break or a NUL; the hook then denies.
// Node built-ins only.
import fs from 'node:fs';

const keys = process.argv.length > 2 ? process.argv.slice(2) : ['cwd', 'tool_name'];
let ev;
try {
  ev = JSON.parse(fs.readFileSync(0, 'utf8').replace(/\0+$/, ''));
} catch {
  process.exit(2);
}
if (!ev || typeof ev !== 'object' || Array.isArray(ev)) process.exit(2);
const out = [];
for (const k of keys) {
  const first = /^(.+)\[0\]$/.exec(k);
  const own = (name) => Object.prototype.hasOwnProperty.call(ev, name);
  let v = '';
  if (first) {
    const arr = own(first[1]) ? ev[first[1]] : undefined;
    if (Array.isArray(arr) && typeof arr[0] === 'string') v = arr[0];
  } else if (own(k) && typeof ev[k] === 'string') v = ev[k];
  if (/[\r\n\0]/.test(v)) process.exit(3);
  out.push(v);
}
process.stdout.write(`${out.join('\n')}\n`);
