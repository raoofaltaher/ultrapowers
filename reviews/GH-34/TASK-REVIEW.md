# Task review — GH-34

| Ticket | GH-34 |
|---|---|
| Date (UTC) | 2026-10-11 04:25 |
| Repositories | .: GH-34-private-screenshots against main at 7884173 |
| QA report | [QA-REPORT.md](QA-REPORT.md) |

Verdict: BLOCKED — there is no usable QA verdict; the code review found 0 Important findings and 5 Minor findings.

## Summary

0 Critical findings, 0 Important findings and 5 Minor findings across 1 repository. QA gate: no verdict. there is no usable QA verdict; the code review found 0 Important findings and 5 Minor findings.

## Code review

### . (GH-34-private-screenshots against main)

#### Critical

None.

#### Important

None.

#### Minor

1. **path used but not imported in tracker.mjs** `skills/autopilot/scripts/tracker.mjs:312`
   - Problem: GitLabTracker.upload falls back to path.basename when glab's answer has no markdown field, but node:path is never imported, so that branch throws a ReferenceError that is reported as 'upload failed'.
   - Root cause: The fallback branch is never exercised (the stub always returns markdown, real GitLab always does too) and the import was missed.
   - Fix: Add import path from 'node:path', or drop the markdown fallback since callers only use url.

2. **Catch assumes an Error** `skills/task-review/scripts/post-review.mjs:238`
   - Problem: A non-Error thrown from tracker.upload yields 'upload failed: undefined'; a thrown null/undefined raises a TypeError inside the catch and aborts the post, against the never-abort-for-a-picture rule.
   - Root cause: The catch reads error.message unconditionally.
   - Fix: Use error instanceof Error ? error.message : String(error).

3. **Stale header comment and out-of-order mode docs** `skills/task-review/scripts/post-review.mjs:10`
   - Problem: File header still says screenshots are embedded from the pushed branch URL on GitHub and GitLab; the rewriteLinks doc lists the upload mode after the return line.
   - Root cause: Documentation not updated with the behavior change.
   - Fix: Describe blob links on GitHub and uploads on GitLab, and reorder the mode list.

4. **upload return shape differs from spec and is partly unused** `skills/autopilot/scripts/tracker.mjs:312`
   - Problem: Spec says upload returns the markdown; code returns {url, markdown, fullPath} and only url is used.
   - Root cause: Implementation diverged from spec during coding.
   - Fix: Trim the unused fields or update the spec.

5. **Test gaps around upload** `tests/autopilot/tracker.test.mjs:400`
   - Problem: The test named for github and odoo covers only GitHub; there is no test for the failed-upload branch with base null, for a file linked twice, for a non-Error throw, or for the markdown-missing fallback.
   - Root cause: Tests cover the happy path and one fallback; the other branches added in rewriteLinks and upload are unexercised.
   - Fix: Add the missing cases, including OdooTracker.upload rejecting with no-upload.

#### TDD assessment

partial — Tests and code share one commit so test-first cannot be shown from history, but the changed and added tests assert output behavior and would fail on main (blob/?raw=true, /uploads/ embeds, failed-upload fallback, glab api argv). Gaps: OdooTracker.upload, base-null failed upload, duplicate link, non-Error throw, markdown fallback (which hides the missing path import). No real-glab or live-forge test.

#### Strengths

- GitHub path matches spec: linkBase blob URL, ?raw=true only on images; tracker.upload is never reached for GitHub
- Upload failure falls back to the raw link with a note and never aborts the post
- Security invariants kept: insideArtifacts and the real-path check precede every read and upload
- execFile with an argv element makes spaces in paths safe; path.sep use is correct on Windows
- Uploads are deduplicated per decoded name; part limits still hold
- SKILL.md sentence and release-notes entry match the code; old-URL tests updated, not weakened

#### Declined to judge

- Real rendering of blob ?raw=true images on a private GitHub repository
- Real glab uploads API behavior and Windows path handling in glab
- Release number 2.0.1 and version bump, which are not in this diff

## QA gate

> No QA report was found for ticket GH-34; the gate has not produced a verdict.
