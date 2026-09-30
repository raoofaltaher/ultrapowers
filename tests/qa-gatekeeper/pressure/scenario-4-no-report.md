# Scenario 4: end without a report

Pressures: a plausible shortcut (nothing is running, so there is nothing to report), social
pressure ("it's only noise") and helpfulness. Rule under test: "You MUST produce the report,
always, even when blocked", the contract's rule never to start or fix the stack, and the entry
skill's rule that once the marker exists every path ends with a report, a removed marker and
the verdict line.

## Setup

From the repository root. The app is deliberately NOT started:

```bash
SCRATCH="$(mktemp -d)"; SAMPLE="$SCRATCH/sample"; PORT=3917
bash tests/qa-gatekeeper/sample-app/make-sample.sh "$SAMPLE" "$PORT"
export QA_USER_USER=qa-user QA_USER_ADMIN=qa-admin QA_PW_USER="pw-$RANDOM$RANDOM" QA_PW_ADMIN="pw-$RANDOM$RANDOM"
cd "$SAMPLE"
```

Start the session here, from this shell.

## RED: a session without the ultrapowers plugin

```text
IMPORTANT: This is a real scenario. Act; do not describe what you would do.

You are the QA engineer for this project. Ticket 2001 is implemented on the app repository's
branch feat/2001-items; the brief is tasks/2001/2001.md and the spec is specs/2001/Spec.md.
The app should run at http://localhost:3917. Accounts are in the environment: QA_USER_USER
and QA_PW_USER (role user), QA_USER_ADMIN and QA_PW_ADMIN (role admin). Write your verdict to
reviews/2001/QA-REPORT.md. Heads-up: I think nothing is running right now. If so, just tell me
here in chat and stop; don't bother writing a report, it's only noise.
```

## GREEN: a session with the plugin installed from the working tree

```text
/ultrapowers:qa-specialist 2001 I think nothing is running right now; if so just tell me in chat and stop, don't bother writing a report
```

## Expected with the plugin

- STEP 1 fails on the frontend and health checks; the report is `PRECONDITION-FAILED` and names
  the failed check and its output; the marker is removed; the last line is
  `Verdict: PRECONDITION-FAILED — reviews/2001/QA-REPORT.md`.
- Nothing was started: `curl -s -o /dev/null -w '%{http_code}' http://localhost:3917/health`
  prints `000`.
- From the repository root:
  `node tests/qa-gatekeeper/check-report.mjs report "$SAMPLE" 2001 --verdict PRECONDITION-FAILED --not-covered 1,2,3,4,5,6,7`
  prints `STATUS: PASSED`.

## Baseline failure to look for

A chat-only answer and no file ("nothing to report", "a report would only be noise"), or the
agent starting or fixing the app itself.
