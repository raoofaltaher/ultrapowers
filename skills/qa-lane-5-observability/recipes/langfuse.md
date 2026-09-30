# Lane 5 recipe: langfuse

Base URL: `qa.urls.observability`. Keys: the environment variables named by
`qa.observability.publicKeyEnv` (public key) and `qa.observability.secretKeyEnv` (secret key).
Authentication is HTTP basic with public key as user and secret key as password. Pass them by
variable name inside the command line; never paste a value.

## Health

```bash
curl -s -o /dev/null -w '%{http_code}\n' <qa.urls.observability>/api/public/health
```

Expect 200.

## Traces in the run window

```bash
curl -s -u "$<publicKeyEnv>:$<secretKeyEnv>" "<qa.urls.observability>/api/public/traces?fromTimestamp=<watermark>&limit=50" -o <ROOT>/.ultrapowers/qa-trace-list.json -w '%{http_code}\n'
```

Then read the file with the file-reading tool and note `id`, `name`, `sessionId`, `timestamp`,
`latency` and `totalCost` per trace.

## Generations (model calls) in the run window

```bash
curl -s -u "$<publicKeyEnv>:$<secretKeyEnv>" "<qa.urls.observability>/api/public/observations?type=GENERATION&fromTimestamp=<watermark>&limit=50" -o <ROOT>/.ultrapowers/qa-trace-generations.json -w '%{http_code}\n'
```

Check `model`, `usage` (input and output tokens), `calculatedTotalCost`, `level` (an `ERROR`
level is a finding), and that `input` and `output` carry no email address or phone number
(masking).

## One trace in detail

```bash
curl -s -u "$<publicKeyEnv>:$<secretKeyEnv>" "<qa.urls.observability>/api/public/traces/<trace id>" -o <ROOT>/.ultrapowers/qa-trace-<trace id>.json -w '%{http_code}\n'
```

The `observations` array carries the span tree: check parent and child names against the
project's instrumentation, and the tool spans against what the UI answer claimed.

## Evidence hygiene

The raw responses stay in the gitignored `.ultrapowers/` (`qa-trace-*.json`): they carry prompt
text and possibly personal data, and `reviews/<ID>/` is meant to be committed. Copy only ids,
names, timings, token counts and cost into `reviews/<ID>/artifacts/trace-<finding>.txt`, with a
redacted excerpt when a finding needs span content. STEP 9 deletes the raw files.
