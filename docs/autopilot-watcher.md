# The autopilot watcher

The watcher is the second door of autopilot: the same engine as `/ultrapowers:autopilot <ID>`, left running on the machine that hosts your coding agent. It polls the tracker projects named in `.agents/ultrapowers.json`, takes tickets a human labelled, and runs one stage at a time in a fresh headless harness call. Nothing a human does not label ever starts.

```bash
node <plugin>/skills/autopilot/scripts/autopilot.mjs watch --root <workspace> [--once]
```

`<plugin>` is where the ultrapowers plugin is installed, for example `~/.claude/plugins/cache/ultrapowers/ultrapowers/<version>`. `--once` runs one cycle and exits, for cron and for tests.

## What a cycle does

1. If `.ultrapowers/autopilot-stop` exists in the workspace, the watcher logs `idle` and sleeps. Create that file to pause it; delete it to resume.
2. For every GitHub or GitLab source with a `defaultProject`, it lists the open tickets that carry the `ready`, `approve` or `changes` label (names from `autopilot.events`). A source without a `defaultProject` is reported once per cycle as `unwatched`: run such tickets from a session with `/ultrapowers:autopilot <ID>`.
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

- GitHub: one fine-grained token per workspace, with Issues, Contents and Pull requests read and write on the listed repositories only, never `workflow`. The watcher writes comments, labels, branches and pull requests through `gh`; the agent stage holds no means to push or write to the tracker, the guardrail denies it.
- GitLab: a project token per repository with the `api` scope; `glab` reads `GITLAB_TOKEN`.
- Headless GitLab needs `glab`: the official GitLab MCP server signs in in the browser.

## The host

A headless stage runs the coding agent with permission prompts bypassed. Inside it, the autopilot profile of the guardrail is the only brake: it denies pushes, merges, tracker writes and edits to the project's configuration, hooks, CI and settings, and limits shell writes to the workspace. A regex hook is not a sandbox. Run the watcher on a machine that holds nothing else of value: no production credentials, no other repositories, no personal files. An ephemeral virtual machine rebuilt from an image is the right shape.

## Stopping and resuming

- Pause: create `.ultrapowers/autopilot-stop` in the workspace.
- Stop a ticket: add the `hold` label on it; remove the label to resume.
- A crashed watcher leaves a lock with its pid; the next watcher sees the pid is dead and removes the lock. A ticket whose stage was interrupted runs that stage again, up to three attempts, then stops with `blocked` and a comment on the ticket.
