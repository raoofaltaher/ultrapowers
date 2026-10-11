# GH-34: screenshots in `task-review --post` comments on a private repository

Path: bounded (a change inside an existing flow). Decision with the Owner on 2026-10-11: blob links on GitHub, uploads on GitLab.

## Problem

`post-review.mjs` embeds the QA report's screenshots through the raw file URL of the pushed documents branch. On a private repository that URL needs a token, so the image does not render in the issue or pull request comment.

## Design

- **GitHub.** A `linkBase(forge, branch)` beside `rawBase` returns `https://github.com/<path>/blob/<branch>`; the raw-mode rewrite builds `<linkBase>/reviews/<ID>/artifacts/<name>?raw=true`. GitHub serves that to a logged-in viewer with access to the repository, public or private. Non-image links (`[text](artifacts/...)`) take the same form without the parameter.
- **GitLab.** The ticket and merge-request comments use a new `upload` mode: for each screenshot the tracker client calls the project uploads API (`glab api projects/:id/uploads -F file=@<file>`) and embeds the markdown GitLab returns (`![name](/uploads/<hash>/<name>)`), which renders in notes on private projects. `GitLabTracker.upload(filePath)` returns that markdown. An upload that fails leaves the `/-/raw/` link in place with the note "(upload failed: <reason>)" so a post never aborts for a picture.
- **Unchanged.** Odoo keeps `attach`; a documents repository without a forge keeps the plain mode; `insideArtifacts` and the real-path check stay in front of every read; the part limits stay.

## Files

- `skills/task-review/scripts/post-review.mjs`: `linkBase`, the `upload` mode in `rewriteLinks` and `commentsFor`, the mode choice per forge.
- `skills/autopilot/scripts/tracker.mjs`: `GitLabTracker.upload(filePath)`; `GitHubTracker.upload` and `OdooTracker.upload` throw `no-upload`.
- `tests/task-lifecycle/post-review.test.mjs`: the GitHub blob form with `?raw=true`, the GitLab upload embeds, the fallback on a failed upload.
- `tests/autopilot/tracker.test.mjs`: the `glab api` call shape against the stub.
- `skills/task-review/SKILL.md` Step 6: one clause ("on GitLab the screenshots are uploaded to the project").
- `RELEASE-NOTES.md`: a line under `## Unreleased` (2.0.1).

## Acceptance

- Unit: every behaviour above has a test that failed before the change.
- Live (the Owner): one `task-review --post` on a private GitHub repository shows the screenshot in the comment; one on a private GitLab project shows the uploaded image.
