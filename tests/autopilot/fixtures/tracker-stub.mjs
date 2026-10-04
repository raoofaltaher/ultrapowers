// A fake gh or glab for the autopilot tests, run through ULTRAPOWERS_GH or ULTRAPOWERS_GLAB.
//   STUB_LOG   file that receives one JSON line per call: { args, stdin }
//   STUB_DIR   folder holding map.json: { "<argv prefix joined by spaces>": { stdout?, file?, exit?, stderr? } }
//              the longest key that is a prefix of the joined argv answers; `file` names a JSON
//              fixture in STUB_DIR whose text is the stdout
//   STUB_EXIT  exit code for every call when set (overrides the map)
// An argv with no matching key exits 64, so a test notices an unexpected call.
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
let stdin = '';
try {
  if (!process.stdin.isTTY) stdin = fs.readFileSync(0, 'utf8');
} catch {
  stdin = '';
}
if (process.env.STUB_LOG) fs.appendFileSync(process.env.STUB_LOG, `${JSON.stringify({ args, stdin })}\n`);

if (process.env.STUB_EXIT !== undefined) process.exit(Number(process.env.STUB_EXIT));
// STUB_SLEEP_MS delays every answer, for timeout tests.
const sleep = Number(process.env.STUB_SLEEP_MS ?? 0);
if (sleep > 0) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, sleep);

const joined = args.join(' ');
let map = {};
const dir = process.env.STUB_DIR;
if (dir && fs.existsSync(path.join(dir, 'map.json'))) map = JSON.parse(fs.readFileSync(path.join(dir, 'map.json'), 'utf8'));
const key = Object.keys(map).filter((k) => joined.startsWith(k)).sort((a, b) => b.length - a.length)[0];
if (key === undefined) {
  process.stderr.write(`tracker-stub: unexpected arguments ${JSON.stringify(args)}\n`);
  process.exit(64);
}
const answer = map[key];
if (answer.stderr) process.stderr.write(answer.stderr);
if (answer.file) process.stdout.write(fs.readFileSync(path.join(dir, answer.file), 'utf8'));
else if (answer.stdout !== undefined) process.stdout.write(typeof answer.stdout === 'string' ? answer.stdout : JSON.stringify(answer.stdout));
process.exit(Number(answer.exit ?? 0));
