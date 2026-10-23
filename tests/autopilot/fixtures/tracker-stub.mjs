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
// Stdin is read only for the calls that carry a body on it; any other caller may leave the pipe
// open (fetch-ticket's execFile does), and a blocking read there would hang the stub.
const wantsStdin = args.some((a, i) => (a === '--body-file' || a === '-F' || a === '--input') && args[i + 1] === '-');
let stdin = '';
try {
  if (wantsStdin) stdin = fs.readFileSync(0, 'utf8');
} catch {
  stdin = '';
}
if (process.env.STUB_LOG) fs.appendFileSync(process.env.STUB_LOG, `${JSON.stringify({ args, stdin, gitlabHost: process.env.GITLAB_HOST ?? null })}\n`);

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
// The comments the engine posts through `issue comment` are kept and listed again by the comments
// endpoint, as its own account's (STUB_ME, default engine-bot), all stamped with the time the
// comment-time answer gives: the engine finds its latest packet on the tracker, not in its state.
const POSTED = dir ? path.join(dir, 'posted.json') : null;
const POSTED_AT = '2026-10-04T09:00:00Z';
if (POSTED && args[0] === 'issue' && args[1] === 'comment' && args[2] && stdin) {
  const posted = fs.existsSync(POSTED) ? JSON.parse(fs.readFileSync(POSTED, 'utf8')) : [];
  posted.push({ id: 9000 + posted.length, issue: String(args[2]), user: { login: process.env.STUB_ME ?? 'engine-bot' }, created_at: POSTED_AT, html_url: `https://github.com/o/r/issues/${args[2]}#issuecomment-${9000 + posted.length}`, body: stdin });
  fs.writeFileSync(POSTED, JSON.stringify(posted));
}
const listed = /^repos\/[^/]+\/[^/]+\/issues\/(\d+)\/comments/.exec(args[0] === 'api' ? args[1] ?? '' : '');
if (answer.stderr) process.stderr.write(answer.stderr);
if (listed && POSTED && fs.existsSync(POSTED) && answer.stdout !== undefined && !answer.file) {
  const pages = typeof answer.stdout === 'string' ? JSON.parse(answer.stdout) : answer.stdout;
  const own = JSON.parse(fs.readFileSync(POSTED, 'utf8')).filter((c) => c.issue === listed[1]).map(({ issue, ...c }) => c);
  process.stdout.write(JSON.stringify([...pages, own]));
} else if (answer.file) process.stdout.write(fs.readFileSync(path.join(dir, answer.file), 'utf8'));
else if (answer.stdout !== undefined) process.stdout.write(typeof answer.stdout === 'string' ? answer.stdout : JSON.stringify(answer.stdout));
process.exit(Number(answer.exit ?? 0));
