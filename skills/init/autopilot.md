# Autopilot

Read from the init skill's Autopilot section. Autopilot lets `/ultrapowers:autopilot <ID>` run a ticket from a GitHub or GitLab source through the workflow, with the human gates on the tracker. It needs a configured ticket source; offer Ticket sources first when `ticketsConfigured` is false.

## Questions

One question per message; use multiple choice where the harness has it.

1. Mode: `off` (default; every skill behaves as today), `gated` (stops at the review packet and at the pull requests) or `full` (stops at the pull requests only).
2. Base branch of the documents repository, this workspace root, for ticket branches: default the remote HEAD. Code repositories keep their own `defaultBranch` from `repos`.
3. Approvers: tracker logins allowed to approve a packet. Empty means any member with write access.
4. Execution: `subagent` (default; a fresh subagent per task) or `inline`.
5. Harness for the watcher's headless stages: `claude-code` (default), `codex`, `copilot`, `cursor`, `gemini`, `qwen`, `opencode`, `pi`, `droid`, `kimi`, `hermes` or `antigravity`. `devin` runs tickets from a session only.
6. Only when a watcher will run: may the watcher take an approval from the account it runs as? Default no (`watchSelfApproval` false). Yes is for a solo developer whose own account runs the watcher, together with the read-only stage tokens the next steps name.
7. Label names, only when the team already uses labels with these names: defaults `up:ready`, `up:approve`, `up:changes`, `up:hold`, `up:running`, `up:blocked`.

## The answers file

Write the answers as one JSON object to a file outside the project (your temp or scratch directory), leaving out every field your human partner did not give:

```json
{ "mode": "gated", "baseBranch": "dev", "approvers": ["alice"], "execution": "subagent",
  "harness": "claude-code", "events": { "approve": "up:approve" } }
```

`{ "mode": "off" }` removes the block.

## Writing it

In scaffold mode the file goes to the scaffold dry run as `--autopilot <file>`. In a scaffolded project:

1. Dry run: `node "<SKILL_DIR>/scripts/init.mjs" autopilot --root "<ROOT>" --answers "<file>" --dry-run`
2. Show `marker.after` and each `labels` entry: `would-create` names the repository that gets the label; `skipped` means the source has no `defaultProject`, so the labels are created by hand per repository. Ask: "Write these changes? (yes / no)". Only an explicit yes continues.
3. Run the same command without `--dry-run`. It writes the marker and creates the labels through `gh` or `glab`; a `failed` label does not stop the write. Relay `nextSteps` verbatim: the token scopes, and the command that starts a ticket.

## Red Flags

| Thought | Reality |
|---------|---------|
| "They want full automation, so mode full" | Ask. `gated` is the default for a first run; `full` skips the packet gate. |
| "No source is configured, I'll add one inline" | Autopilot needs a source. Run Ticket sources first, with its own dry run and yes. |
| "The labels failed, I'll retry with a broader token" | Report the failed labels in `nextSteps`. Tokens are your human partner's to change. |
