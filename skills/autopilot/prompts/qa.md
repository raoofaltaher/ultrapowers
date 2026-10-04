# Stage: qa

The project configures the QA gatekeeper (`qa` in `.agents/ultrapowers.json`), or the engine would have gone to `pr`. Invoke `/ultrapowers:qa-specialist <ID>` and let it run to its verdict line, `Verdict: <value> — reviews/<ID>/QA-REPORT.md`. It writes its own run marker, so the QA profile of the guardrail applies while it runs; it never commits.

When it ends, commit the report on the documents branch: `git add reviews/<ID>` then `git commit -m "qa(<ID>): <verdict>"`.

End: `{"ok":true,"verdict":"<PASS|PASS-WITH-ISSUES|FAIL|INCOMPLETE|PRECONDITION-FAILED>","report":"reviews/<ID>/QA-REPORT.md"}`. A FAIL or PRECONDITION-FAILED verdict is still `ok:true`: the stage finished; the engine stops the run on the verdict, and no pull request opens. An INCOMPLETE verdict is also `ok:true`; `next` continues to `pr` and the pull request body carries the verdict for the reviewer.
