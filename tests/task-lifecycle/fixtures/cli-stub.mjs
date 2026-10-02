// A fake gh or glab for fetch-ticket tests, run through ULTRAPOWERS_GH or
// ULTRAPOWERS_GLAB. It logs its argv and answers as the STUB_* variables say:
//   STUB_LOG        file that receives one JSON argv line per call
//   STUB_AUTH_EXIT  exit code for `auth status` (default 0)
//   STUB_JSON       stdout for `issue view`
//   STUB_VIEW_EXIT  exit code for `issue view` (default 0), with STUB_STDERR
//   STUB_SLEEP_MS   delay before answering `issue view`
import fs from 'node:fs';

const args = process.argv.slice(2);
if (process.env.STUB_LOG) fs.appendFileSync(process.env.STUB_LOG, `${JSON.stringify(args)}\n`);
// STUB_ENV_LOG receives the GITLAB_HOST each call saw.
if (process.env.STUB_ENV_LOG) fs.appendFileSync(process.env.STUB_ENV_LOG, `${process.env.GITLAB_HOST ?? ''}\n`);

if (args[0] === 'auth') process.exit(Number(process.env.STUB_AUTH_EXIT ?? 0));

if (args[0] === 'issue' && args[1] === 'view') {
  const answer = () => {
    const code = Number(process.env.STUB_VIEW_EXIT ?? 0);
    if (code !== 0) {
      process.stderr.write(`${process.env.STUB_STDERR ?? ''}\n`);
      process.exit(code);
    }
    process.stdout.write(process.env.STUB_JSON ?? '{}');
    process.exit(0);
  };
  const delay = Number(process.env.STUB_SLEEP_MS ?? 0);
  if (delay > 0) setTimeout(answer, delay);
  else answer();
} else {
  process.stderr.write(`cli-stub: unexpected arguments ${JSON.stringify(args)}\n`);
  process.exit(64);
}
