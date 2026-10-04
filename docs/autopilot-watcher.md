# The autopilot watcher

The watcher is the second door of autopilot: the same engine as `/ultrapowers:autopilot <ID>`, left running on the machine that hosts your coding agent. It polls the tracker projects named in `.agents/ultrapowers.json`, takes tickets a human labelled, and runs one stage at a time in a fresh headless harness call. Nothing a human does not label ever starts.

```bash
node <plugin>/skills/autopilot/scripts/autopilot.mjs watch --root <workspace> [--once]
```

`<plugin>` is where the ultrapowers plugin is installed, for example `~/.claude/plugins/cache/ultrapowers/ultrapowers/<version>`. `--once` runs one cycle and exits, for cron and for tests.

## What a cycle does

1. If `.ultrapowers/autopilot-stop` exists in the workspace, the watcher logs `idle` and sleeps. Create that file to pause it; delete it to resume.
2. For every GitHub or GitLab source with a `defaultProject`, it lists the open tickets that carry the `ready`, `approve` or `changes` label (names from `autopilot.events`). `ready` is the only start signal: a ticket that carries `approve` or `changes` but was never started here is left alone. A source without a `defaultProject` is reported once per cycle as `unwatched`: run such tickets from a session with `/ultrapowers:autopilot <ID>`.
3. Tickets with a live lock from a session are skipped with a log line. The rest run one after the other, up to `autopilot.watch.maxConcurrent` per cycle (default 1).
4. Each ticket runs through `run <ID>`: one fresh harness call per agent stage, the engine's own steps for the gate and the pull requests, until the ticket waits for a human, is done, or stops.
5. The watcher sleeps `autopilot.watch.intervalSec` (default 60). A tracker failure doubles the sleep each cycle, up to 10 minutes, until a cycle succeeds.

Every event is one JSON line on stdout: `cycle`, `unwatched`, `skip`, `ran`, `tracker-error`, `idle`, `sleep`. Send stdout to your service's log.

## Install as a service

Use the user that owns the harness login and the git credentials. Set `GH_TOKEN` or `GITLAB_TOKEN` in the service's environment, never in a file in the repository.

systemd (Linux):

```ini
[Unit]
Description=ultrapowers autopilot watcher for <workspace>
After=network-online.target

[Service]
Type=simple
User=<user>
WorkingDirectory=<workspace>
Environment=GH_TOKEN=<from a secret store, not this file>
ExecStart=/usr/bin/node <plugin>/skills/autopilot/scripts/autopilot.mjs watch --root <workspace>
Restart=always
RestartSec=30

[Install]
WantedBy=default.target
```

launchd (macOS): a `LaunchAgent` plist with `ProgramArguments` of `node`, the engine path, `watch`, `--root`, `<workspace>`, `KeepAlive` true, `RunAtLoad` true, and `EnvironmentVariables` for the token. Load it with `launchctl load ~/Library/LaunchAgents/<label>.plist`.

Windows: a Scheduled Task that runs at logon with "Run whether user is logged on or not", action `node.exe` with the same arguments, "If the task fails, restart every 1 minute". Or `sc create` with a service wrapper of your choice.

## Tokens

Two kinds, and the difference is the whole point: the engine writes to the tracker and pushes between stages; a stage only reads.

- The engine, GitHub: one fine-grained token per workspace in `GH_TOKEN`, with Issues, Contents and Pull requests read and write on the listed repositories only, never `workflow`. The watcher writes comments, labels, branches and pull requests through `gh`.
- The engine, GitLab: a project token per repository with the `api` scope, in `GITLAB_TOKEN`. Headless GitLab needs `glab`: the official GitLab MCP server signs in in the browser.
- The stages: a second token per provider with read access only, in `ULTRAPOWERS_STAGE_GH_TOKEN` (fine-grained: Issues and Contents read, Metadata read) and `ULTRAPOWERS_STAGE_GITLAB_TOKEN` (scope `read_api`). When one is set, every headless stage runs with that token and nothing else: the engine's tokens are removed from its environment, `gh` and `glab` see an empty configuration directory, the git credential helper is reset, git never prompts, and only the MCP servers of the project's `.mcp.json` load (`--strict-mcp-config`). A stage steered into adding a label or pushing then has nothing to do it with. Without a stage token the stage shares the engine's credentials, as a session does, and the guardrail is the brake.
- The account that approves. The approve label counts in the watch door when its actor is a member with write access (and in `approvers` when that list is set) and is not the account the watcher runs as; `autopilot.watchSelfApproval: true` lifts that last rule, for a solo developer whose own account runs the watcher. Set it only together with stage tokens. In a session, your own account always counts: you are at the keyboard.

## The host

A headless stage runs the coding agent with permission prompts bypassed. Inside it, two things hold: the autopilot profile of the guardrail, which denies pushes, merges, tracker writes and edits to the project's configuration, hooks, CI and settings and limits shell writes to the workspace; and the stage token, which cannot write even when a command gets past the hook. A regex hook is not a sandbox. Run the watcher on a machine that holds nothing else of value: no production credentials, no other repositories, no personal files. An ephemeral virtual machine rebuilt from an image is the right shape.

The watcher runs `claude-code` stages only. `opencode` has no PreToolUse guardrail yet, so the watcher refuses it (`harness-unguarded`); its tickets run from a session with `/ultrapowers:autopilot <ID>`.

## Stopping and resuming

- Pause: create `.ultrapowers/autopilot-stop` in the workspace.
- Stop a ticket: add the `hold` label on it; remove the label to resume.
- A crashed watcher leaves a lock with its pid; the next watcher sees the pid is dead and removes the lock. A ticket whose stage was interrupted runs that stage again, up to three attempts, then stops with `blocked` and a comment on the ticket.
