# Executive brief: Autopilot trigger and resume: command, watcher or CI
Mode: brainstorm | Date: 2026-10-04
Invited: cto (architecture of a watcher and its headless adapters), coo (the resume process and the approval queue), ciso (an unattended process holding a token), cmo (positioning of VM-first automation against vendor-hosted agents)
Consulted: none (every Consult target, cto, coo and ciso, was already invited)
Not consulted: none

## Summary
All four officers accept the Owner's "both": one command for the developer at a keyboard and a local watcher for the harness on a VM. All four want them to be the same engine with no state of its own in either door: a per-ticket state and stage log in `tasks/<ID>/`, one stage per fresh headless harness call, the GitHub issue as the only surface a human touches. The CMO and CTO ship the command first and the watcher next; the Owner's belief that the VM audience is the larger one is noted, not contested. The CISO's conditions are firm: approval is a verified fact (API permission plus an allow-list, bound to the commit the agent posted), the agent stage holds no token that can satisfy its own gate, and all write-back runs in a deterministic step after the agent exits.

## Positions
### Chief Technology Officer
One engine, three doors. `autopilot.mjs` reads `tasks/<ID>/state.json`, runs exactly one stage per fresh headless call, commits, exits. The command, the watcher and CI are thin callers. The watcher is a 200-line poller over `gh` with etag caching. Build the command first, the watcher second, CI last.

### Chief Operating Officer
One state machine, two doors, both appending to `tasks/<ID>/stage-log.jsonl`. State travels as labels (`up:ready`, `up:approve`, `up:changes`, `up:hold`), reasons as comments, the lane as a label with a config default. A fixed review packet under 25 lines. Write the label protocol and the packet template as one SOP before code.

### Chief Information Security Officer
A watcher is safe only when approval is verified, not parsed: collaborator permission from the API and an allow-list in config; the approval postdates the gate comment and the branch tip still equals the posted SHA when the stage starts. The agent stage runs without a GitHub token; the watcher holds one fine-grained token for one repository. A guardrail envelope (`.ultrapowers/auto-active`) with push only to the ticket branch, never merge, and a hash-chained audit log under `reviews/<id>/`.

### Chief Marketing Officer
Lead with the command; it proves the skills carry the workflow. The watcher is the same engine left running. One name, two forms: `/ultrapowers:autopilot <ticket>` and `/ultrapowers:autopilot watch`. "Your VM, your agent, your token" is a strong second line for agencies and regulated teams, not the headline. A proof pack: one public issue through to a PR with the QA report attached.

## Agreement
- One engine; the command, the watcher and a later CI job are callers without state of their own (cto, coo, ciso, cmo).
- Per-ticket state and an append-only stage log in `tasks/<ID>/`, read by `task` before folder inference (cto, coo).
- One fresh headless call per stage; resume means re-reading files, never replaying chat (cto, ciso).
- Approval binds to the commit the agent posted; any new commit on the branch voids it and reposts the gate (ciso, coo).
- The command ships first, the watcher in the following release (cto, cmo).
- A human action, a label or a comment by a permitted account, starts and resumes runs; ticket text never does (cto, ciso, coo).

## Disagreement
- Approval token: the COO wants labels (permissioned, filterable, bulk-applied); the CISO wants a comment quoting the SHA. Both can hold: the label is the trigger, and the watcher verifies the label event's actor and time against the packet SHA.
- Branch name: the CTO and COO write `auto/<ID>`; the CISO and the Owner write `GH-<n>-<slug>`.
- Where the log lives: the CTO's `state.json` and the COO's `stage-log.jsonl` in `tasks/<ID>/`; the CISO's hash-chained audit in `reviews/<ID>/autopilot.jsonl`. The second is a security record and may stay separate.
- Ship order against the Owner's audience: the CMO and CTO ship the watcher second; the Owner expects most full-automation users on a VM.

## Risks
- Headless loading of the bootstrap and plugin is proven only for Claude Code and OpenCode; each adapter needs a contract test (cto).
- A process with bypassed permissions on a VM is the attack surface; the hook is the only brake and regex is not a sandbox; the VM must be ephemeral and non-production (ciso, cto).
- One compromised approver account approves anything; two approvers for auth or migration lanes (ciso).
- A leaked watcher token pushes to any ticket branch (ciso).
- Label sprawl; init must create the set and names live in config (coo).
- The review packet swells into the spec; cap it and link out (coo).
- Two writers on one ticket: the watcher must lock and skip a ticket with a live interactive run (coo).
- "autopilot" is Microsoft vocabulary; it stays a mode name, never the product (cmo).
- A demo repository must be maintained against every harness change (cmo).

## Recommended decision
Spec one engine with two doors: `/ultrapowers:autopilot <ticket>` runs or resumes one stage inside a session; `autopilot.mjs watch` is the same engine as a zero-dependency poller over `gh` for a VM. Per-ticket state and stage log in `tasks/<ID>/`, one fresh headless call per stage, labels as the human's controls with CISO verification (permission, allow-list, SHA binding), write-back after the agent exits, a guardrail envelope grown from qa-guardrail, and a hash-chained audit log. Supported by cto, coo and ciso; the cmo supports it with the command leading the release and the watcher following.

## Open questions
- Does the watcher ship in the same release as the command, or the next one?
- Labels, comment keywords, or both as the human's approval control?
- Branch name: `GH-16-<slug>` (the Owner) or `auto/GH-16`?
- Does the agent stage run with no GitHub token at all, which means `gh` is unavailable inside the stage and the watcher does every fetch and write-back?
- Which lanes exist in the first version, and does a per-ticket label pick the lane?

## Next steps
| Action | Owner officer | When |
|---|---|---|
| Owner answers the open questions | Owner | Now |
| Spec the engine, state file and stage log | cto | After the Owner's answers |
| Label protocol and review packet template | coo | With the spec |
| Envelope rules, approval verification and audit fields | ciso | With the spec |
| README line and proof-pack plan | cmo | After the spec is approved |

## Full responses

### Chief Technology Officer
**Position.** One engine, three doors. A zero-dependency `autopilot.mjs` reads `tasks/<ID>/state.json`, runs exactly one stage per fresh headless harness call, commits, exits. The command, the watcher and a later CI job are thin callers of that engine; none keeps state of its own. Build the command first, the watcher second, CI last.

**Option 1: The command is the engine.** `/ultrapowers:autopilot GH-16` reads `state.json` (stage, content hashes of brief/spec/plan, approval comment id, branch `auto/GH-16`, attempt count) and runs the next stage. Interactive sessions run it inline; headless callers spawn `claude -p "<stage prompt>" --plugin-dir <dir> --permission-mode bypassPermissions --max-turns N --output-format json` or `opencode run --format json`, chosen from a per-harness adapter table in `.agents/ultrapowers.json`. One fresh call per stage, never `--continue`: resume means re-reading files, not replaying chat. Crash handling: a `stage.lock` holding the pid; on restart, an unfinished stage discards uncommitted worktree changes and reruns. Risk: headless loading of the bootstrap and plugin is proven only for Claude Code and OpenCode; every adapter needs a contract test.

**Option 2: The watcher is a 200-line poller over `gh`.** `autopilot.mjs watch` loops over configured sources: `gh issue list --label ultrapowers:auto --json number,updatedAt`, then `gh api .../issues/{n}/comments` with `If-None-Match` from a cached etag (304s are free of rate limit). Interval 60 seconds with backoff; `gh` reads `GH_TOKEN`, so the plugin handles no token and rule 5 holds. A new label or an approval comment matching the stored hash invokes Option 1 once, serially. Runs under systemd or launchd; `.ultrapowers/autopilot-active` arms the guardrail envelope. Risk: a bypassPermissions process on a VM is the attack surface; trigger only on label plus author allow-list, never ticket text.

**Option 3: CI on label.** init renders a workflow that calls the same command. Risk: secrets next to outsider text; defer until the envelope exists.

Confidence: medium
Consult: ciso, coo

### Chief Operating Officer
**Position.** One state machine, two doors. Command and watcher both append to `tasks/<ID>/stage-log.jsonl`; the GitHub issue is the only surface a human touches. State travels as labels, reasons as comments, the lane as a label with a config default. Write the label protocol and the packet template as one SOP before code; a senior will live in it daily.

**Option 1: Labels for state, comments for reasons.** `up:ready` starts, `up:approve` clears the current gate, `up:changes` sends it back, `up:hold` stops. Labels, not keywords or reactions: they are permissioned (triage role), filterable with `gh issue list`, and bulk-applied from the list view, so one senior clears eight tickets in a sitting; keywords misfire on typos, reactions cannot be restricted or queried. The watcher consumes the label (removes it, logs who applied it and the packet hash in force), so a stale approval never applies to a revised plan. A change request is a comment plus `up:changes`; the agent revises and re-posts.
Risk: label sprawl; init must create the set, names live in config.

**Option 2: A fixed review packet, under 25 lines.** Title, lane, gate, links to brief, spec, plan on `auto/<ID>` at a SHA, a "changed since last packet" diff link, the five lowest-confidence assumptions, the exact next action. Lane: `up:lane:fast|standard|deep` on the issue, else `autopilot.defaultLane` from config; forced-upgrade triggers (auth, migrations, size) still raise it, and the packet says why.
Risk: the packet swells into the spec; cap it, link out.

**Option 3: The stage log as hand-off contract.** Per line: time, stage, event (started, packet-posted, approved, changes, held, failed, resumed), actor, trigger, artifact hash, comment URL, branch and SHA. `task` reads it first, folder inference second. Stops: approval hash older than the artifact (re-post), spec or plan changed after approval (gate reopens), QA FAIL (packet with report link), watcher error (`up:blocked`). Told: ticket author and approver, already on the issue. Gate wait, stage cycle time, rework loops and QA first-pass yield fall out.
Risk: two writers on one ticket; the watcher locks under `.ultrapowers/runs/` and skips a ticket with a live interactive run.

Confidence: high
Consult: ciso, cto

### Chief Information Security Officer
**Position.** A watcher is safe only when approval is a verified fact, not a parsed comment: the approver's right comes from the API, the approval binds to a commit SHA the agent itself posted, and the headless agent holds no credential that can satisfy its own gate. All write-back (comment, label, push, PR) happens in a deterministic watcher step after the agent exits.

**Option 1: Verified, bound approval.** Approver must pass both checks: `GET /repos/{o}/{r}/collaborators/{login}/permission` returns `write`, `maintain` or `admin`, and the login is in `autopilot.approvers` in `.agents/ultrapowers.json`. The watcher's own account never counts. The agent's gate comment carries the branch tip SHA; an approval is valid only if it postdates that comment, quotes that SHA (`approve <sha>`), and the branch tip still equals it when the next stage starts. Any new commit or force-push voids it and reposts the gate. Every other comment is fenced data.
Risk: one compromised approver account approves anything; require two approvers for auth or migration lanes.

**Option 2: Token separation.** Agent stage: no `GH_TOKEN` at all, working from a clone the watcher prepared. Watcher: one fine-grained token, one repo, Issues RW, Contents RW, Pull requests RW, Metadata; never `workflow`. The watcher refuses pushes outside `GH-<n>-*`; branch protection denies merge. Agent and watcher run as separate OS users.
Risk: a leaked watcher token still pushes to any ticket branch; rotate it and keep the VM free of other credentials.

**Option 3: Envelope and blast radius.** `.ultrapowers/auto-active` enables a qa-guardrail profile: push only to the current `GH-<n>-<slug>`, never merge, deny edits to `hooks/`, `.agents/`, `.github/`, CI and settings, deny `gh` write subcommands; key-material, egress and database rules carry over. Watcher: one repo, `maxConcurrent` 1, per-stage timeout, kill switch `.ultrapowers/autopilot-stop` checked each poll. Audit `reviews/<id>/autopilot.jsonl`: issue, event id, approver, permission result, approved SHA, SHA at stage start, harness command and version, exit code, guardrail denials, commits produced; hash-chained.
Risk: with `bypassPermissions` the hook is the only brake and regex is not a sandbox; the VM must be ephemeral and non-production.

Confidence: high
Consult: cto

### Chief Marketing Officer
**Position (CMO).** Lead with the command. It is the proof that the skills carry the workflow; the watcher is the same engine left running. Name the pair "autopilot", in two forms, and position the whole thing as "the same workflow, where your agent already runs". "Your VM, your agent, your token" is a strong second line, not the headline: it lands with agencies and regulated teams, who are told by vendor-hosted agents where their code goes; it is weak for solo developers, who hear "set up a VM". For them the message is "no second subscription, no second runner". I disagree with shipping the watcher first; nobody can trust a daemon before they have seen one run.

**Option 1: One name, two forms.** `/ultrapowers:autopilot <ticket>` runs a ticket to the PR; `/ultrapowers:autopilot watch` is the local watcher. Config in `.agents/ultrapowers.json` under `autopilot`, runtime state in `.ultrapowers/autopilot/`, variables `ULTRAPOWERS_AUTOPILOT_*`. The README line: "Automate the repeatable, keep the gates; run it where your agent already runs."
Risk: "autopilot" is already Microsoft vocabulary; it must stay a mode name, never the product.

**Option 2: Command first, watcher in the following minor.** Release N ships the command and the issue-comment gate; release N+1 ships `watch` with an install note for a VM service. Each gets its own announcement, so the proof arrives twice.
Risk: the audience the Owner believes is largest waits one release; some will script the command themselves.

**Option 3: Proof pack.** A public demo repository where one real issue goes through: the gate comment with brief, spec and plan links; the approval label; the PR with the QA report attached. One recorded run, under five minutes, cut at the gates. The PR itself is the convincing artifact; agencies forward a PR, not a video.
Risk: a demo repository must be maintained against every harness change, or it becomes evidence against us.

Confidence: medium
Consult: cto (whether the watcher is truly the same engine as the command), ciso (the "your token" claim must survive review before it goes in the README)

## Decision
2026-10-04, the Owner's answers, recorded verbatim or in substance:

- Trigger and resume: both doors. "Option one was good. A human use one command [...] and also I like [...] a local watcher that keep track and waiting [...] think about people who want to use [...] the full automation mode [...] most of this type of people have using a VM for the harness. So [...] having a node processor that is a watcher [...] is the best approach for them. [...] I think we can have both options", both configurable through init.
- Gate place: "Issue comment, PR later": the review packet goes to the tracker; the pull request opens after implementation and QA.
- Approach: "One spec, command first": one spec for the engine and both doors; the plan builds the command, runs one issue end to end, then adds the watcher; the release cut is the Owner's call later.
- Branch name: `<ID>-<slug>`, the Owner's form, kept because it matches the existing ticket branch matcher.
- Approval control: labels on GitHub and GitLab, with the CISO's verification. See the second brief of this date for the multi-repository decisions.
