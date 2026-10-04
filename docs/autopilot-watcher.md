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
- The stages: a second token per provider with read access only, in `ULTRAPOWERS_STAGE_GH_TOKEN` (fine-grained: Issues and Contents read, Metadata read) and `ULTRAPOWERS_STAGE_GITLAB_TOKEN` (scope `read_api`). The watcher refuses to start without one (`stage-credentials-missing`) unless the project sets `autopilot.watch.sharedCredentials: true`, which says in writing that its stages run with the engine's own credentials. With a stage token, every headless stage runs with that token: the engine's tokens, the ssh agent and the git ssh command are removed from its environment, `gh` and `glab` see an empty configuration directory, the git credential helper is reset, and git never prompts. A stage steered into adding a label or pushing then has no credential to do it with. On Claude Code only the MCP servers of the project's `.mcp.json` load (`--strict-mcp-config`); the other harnesses load what their own project configuration names.
- What the stage token does not cover. The stage runs as the same operating-system user as the watcher, so it can read that user's files, the watcher process's environment on Linux, and any key the user holds. Keep the service user bare: no ssh keys, no cloud credentials, no stored logins beyond the two tokens, HTTPS remotes only. The hook matches patterns; a build script a stage runs can execute anything the hook never sees. The credentials and the host are the boundary.
- The account that approves. The approve label counts in the watch door when its actor is a member with write access (on GitLab, Maintainer or above; and in `approvers` when that list is set) and is not the account the watcher runs as. `autopilot.watchSelfApproval: true` lifts that last rule, for a solo developer whose own account runs the watcher, and counts only when a stage token is set. When the engine's own account cannot be read from the tracker, the check fails closed. In a session, your own account always counts: you are at the keyboard.
- The labels that start and steer a run. `up:ready` starts a ticket, and `up:mode:<mode>` changes its mode, only when a member with write access (and an approver, when the list is set) added the label last; any other label is ignored and logged as a skip.

## Before you turn it on

The minimum for a professional team, in the order the executive review set it:

1. An ephemeral virtual machine rebuilt from an image, with a dedicated service user that holds no other credentials and no ssh keys.
2. HTTPS remotes for every repository in `repos`.
3. Branch protection with a required review on every base branch, so a pull request the engine opens is merged by a person.
4. An engine token scoped to the listed repositories only (`GH_TOKEN` or `GITLAB_TOKEN`), and a read-only stage token (`ULTRAPOWERS_STAGE_GH_TOKEN` or `ULTRAPOWERS_STAGE_GITLAB_TOKEN`).
5. The engine on its own tracker account, `approvers` set to the humans who may approve, `watchSelfApproval` left false.
6. One test stage per host before the first real ticket: label a throwaway issue `up:ready`, let the stage run, and read the stage log and the guardrail denials in the harness transcript; a stage that can push has no envelope on that host.
7. `maxConcurrent` at 1, and the kill switch (`.ultrapowers/autopilot-stop`) and `up:hold` known to everyone who can label a ticket.

What has run live so far is the session door on Claude Code with GitHub, one repository, gated mode, inline execution, without a QA stage (`tests/autopilot/acceptance-2026-10.md`). The watcher, GitLab, nested workspaces, full mode, stage tokens, the changes loop and the QA stage are covered by the offline suites and by each vendor's documentation, not yet by a public run.

## The host

A headless stage runs the coding agent with permission prompts bypassed. Inside it, two things hold: the autopilot profile of the guardrail, which denies pushes, merges, tracker writes and edits to the project's configuration, hooks, CI, settings, the run marker and the ticket's state files, and limits shell writes to the workspace; and the stage token, which cannot write even when a command gets past the hook. The envelope stays on for the whole stage: the marker is a protected path, a stage that ends without it is blocked for review, and a watcher stage keeps the profile on through its environment even if the file is gone. A regex hook is not a sandbox. Run the watcher on a machine that holds nothing else of value: no production credentials, no other repositories, no personal files. An ephemeral virtual machine rebuilt from an image is the right shape.

## The harnesses

`autopilot.harness` names the headless CLI the watcher spawns for each stage; `skills/autopilot/scripts/harnesses.mjs` holds the exact command lines, and `tests/autopilot/test-adapters.sh` checks them against the CLIs installed on a machine. Every harness but Devin runs the stage inside the guardrail, so the watcher accepts all of them and refuses `devin` (`harness-unguarded`), whose plugin hooks are documented as fail-open.

| `harness` | CLI | What the stage loads |
|---|---|---|
| `claude-code` | `claude -p` | only the project's `.mcp.json` servers (`--strict-mcp-config`) |
| `codex` | `codex exec` | `--ignore-user-config`: the project's `.codex/config.toml` only; `--dangerously-bypass-hook-trust` runs the plugin's guardrail hook without the interactive trust step |
| `copilot` | `copilot -p` | `--disable-builtin-mcps` |
| `cursor` | `agent -p` | the project's MCP configuration |
| `gemini` | `gemini -p` | `-e ultrapowers`: this extension only; the guardrail comes from the project's `.gemini/settings.json` hook that init wrote |
| `qwen` | `qwen -p` | `-e ultrapowers` |
| `opencode` | `opencode run` | the project's `opencode.json`; never `--pure` |
| `pi` | `pi -p` | `--no-extensions -e <this plugin's extension>` |
| `droid` | `droid exec` | the project's `.factory/` configuration |
| `kimi` | `kimi -p` | the project's `.kimi-code/mcp.json` |
| `hermes` | `hermes chat --oneshot` | the user's enabled plugins and MCP servers; `--accept-hooks` answers the hook consent |
| `antigravity` | `agy -p` | the project's configuration |

Two of them need a one-time step on the machine: Codex asks you to trust the plugin's hooks once (`/hooks` in an interactive session) before a session-door run, and Hermes loads the plugin only when `ultrapowers` is in `plugins.enabled`. Gemini CLI, Qwen Code, Droid and Kimi Code let a hook that crashes or times out through; the deny path is exit 2 everywhere and is what the tests exercise.

## Stopping and resuming

- Pause: create `.ultrapowers/autopilot-stop` in the workspace.
- Stop a ticket: add the `hold` label on it; remove the label to resume.
- A crashed watcher leaves a lock with its pid; the next watcher sees the pid is dead and removes the lock. A ticket whose stage was interrupted runs that stage again, up to three attempts, then stops with `blocked` and a comment on the ticket.
