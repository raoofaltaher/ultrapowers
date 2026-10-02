# Executive brief: Ultrapowers next: autonomy and team acceleration ideas
Mode: brainstorm | Date: 2026-10-02
Invited: cto (architecture and tooling of an autonomous mode), coo (ticket lifecycle, process and checkpoints), ciso (unattended agents on runners), cmo (market and competitive intelligence, positioning)
Consulted: none (every Consult target, cto, coo and ciso, was already invited)
Not consulted: cso, asked by cmo for commercial packaging to agencies and regulated teams; the Owner raised no commercial decision for this open-source project

## Summary
All four officers back a step towards autonomy, and all four move the human gates rather than remove them: spec and plan approval become asynchronous reviews on the PR/MR or the ticket. The recommended shape is a gated autopilot: a zero-dependency conductor that runs one stage per headless agent call from a per-ticket state file, inside a guardrail envelope grown from the QA guardrail, triggered by a human label. The COO argues autonomy should be chosen per ticket (lanes), not per project. The CMO warns that ticket-to-PR is the most crowded market lane; the open space is the vendor-neutral team process layer.

## Positions
### Chief Technology Officer
A file-driven state machine: `node conduct.mjs <ID>` moves a ticket through `tasks/<ID>/state.json`, one fresh headless call per stage through a per-harness adapter table, committing after each stage so runs resume. The autonomous brainstorm writes an assumption ledger the human answers in one review. Init renders a label-triggered CI bridge. Ship gated mode first.

### Chief Operating Officer
Autonomy per ticket, not per project: new-task proposes a fast, standard or deep lane in the Definition of Ready, with forced-upgrade triggers (auth, migrations, size). Approvals move to the tracker so one senior clears a batch. A per-ticket stage log gives hand-offs and lifecycle KPIs for free; build it first.

### Chief Information Security Officer
Safe enough to ship inside an autonomy envelope: grow the marker-gated qa-guardrail into a run-wide profile (writes in the worktree, push only to `auto/<ticket>`, never merge, no edits to hooks, config or CI). Only a human label triggers a run; ticket and memory text are untrusted data; approvals bind to a content hash. Short-lived branch-scoped tokens and a local hash-chained evidence ledger.

### Chief Marketing Officer
Do not lead with "autonomous": ticket-to-PR is crowded (Copilot cloud agent, Codex cloud, GitLab Duo, Rovo Dev, Augment). Lead with the vendor-neutral, zero-telemetry team process layer: gates, one trail per ticket, team memory in git, across 15 harnesses. An evidence pack on every PR and a public demo repo prove it. The Odoo trigger is open space.

## Agreement
- Human gates stay at spec and plan, but move out of the live chat into asynchronous review (all four).
- A human action, a label or an approval, starts and resumes runs; ticket text alone never does (cto, ciso).
- The per-ticket trail (state, stage log, approvals, QA verdict) is the backbone: it powers resume, hand-offs, KPIs and the evidence pack (cto, coo, ciso, cmo).
- Start gated, widen later (cto, ciso, coo).

## Disagreement
- Granularity: the Owner's seed and the CTO put the switch in `.agents/ultrapowers.json` per project (`gated` or `full`); the COO says per project is too coarse and wants per-ticket lanes, with the config holding only the default lane and upgrade triggers.
- Framing: the Owner leads with acceleration and autonomy; the CMO says lead with the team process layer and present autonomy as "runs between your gates".
- Rule 5: the CTO wants a written exception allowing the user's own git remote and harness; this needs the Owner's reading of whether a conductor calling the user's agent CLI and git is "reporting to a remote host" at all.
- Build order: the COO wants the stage log first; the CTO wants the conductor first. The stage log is a natural part of the conductor's state file, so the two may merge.

## Risks
- Headless flags of a dozen agent CLIs drift; each adapter needs a contract test and proof that the bootstrap loads headless (cto).
- Prompt injection through ticket text or team memory next to CI secrets (ciso, cto).
- Regex command matching is not a sandbox; unattended runs need an ephemeral, network-restricted runner (ciso).
- An assumption ledger changes tuned skill prose; without writing-skills pressure tests, spec quality drops unnoticed (cto).
- The approval queue becomes the new bottleneck (coo).
- A risky ticket mislabelled fast (coo).
- Competing head-on in the crowded ticket-to-PR lane (cmo).

## Recommended decision
Take a gated autopilot into a written spec as the first sub-project: conductor plus per-ticket state and stage log, assumption-ledger spec and plan reviewed on a draft PR/MR with hash-bound approvals, inside an autonomy envelope grown from qa-guardrail, started by a human label. Supported by cto, ciso and coo (with lanes as the follow-up); framed per cmo as "autonomous between your gates". Lanes, the tracker bridge (GitHub first, then GitLab, then Odoo) and the evidence pack follow as separate sub-projects.

## Open questions
- Per-project switch, per-ticket lanes, or both?
- Where does a headless run wait for approval: PR/MR comment, tracker comment, or a local command?
- Does the assumption ledger replace one-question-at-a-time only in headless runs, or everywhere?
- How should rule 5 read for a conductor that calls the user's own agent CLI and git remote?
- Uninvited perspective: cso, because the cmo's evidence-pack option targets agencies and regulated teams as buyers; relevant only if the Owner wants a commercial angle.

## Next steps
| Action | Owner officer | When |
|---|---|---|
| Owner narrows the options (interactive questions) | Owner | Now |
| Spec the first sub-project through brainstorming | cto | After the Owner's choice |
| Autonomy envelope requirements for that spec | ciso | With the spec |
| Stage-log fields and lane triggers | coo | With the spec |
| Positioning line for the README | cmo | After the spec is approved |

## Full responses

### Chief Technology Officer
Build autonomous mode as a file-driven state machine, not one giant prompt. A zero-dependency Node conductor moves a ticket through tasks/<ID>/ one stage at a time. Each stage is a fresh headless call to whichever agent CLI the project uses. The human gates stay, but they move out of live chat into asynchronous review on the PR/MR.

**Option 1: Conductor.** `"autopilot": "gated" | "full"` in .agents/ultrapowers.json. `node conduct.mjs <ID>` reads tasks/<ID>/state.json and runs one stage per call through a per-harness adapter table (claude -p, codex exec, gemini -p, copilot -p, opencode run). After each stage it commits, so a crashed run resumes from the last commit. Each stage sees only its input files, so long runs stay focused. It uses child_process and git only.
Risk: twelve CLIs change their headless flags without notice. Each adapter needs a contract test, and we must prove the bootstrap loads in headless mode on each harness.

**Option 2: Gates become files the human reviews.** The autonomous brainstorm writes Spec.md with an "assumption ledger": every question it would have asked, the default it picked, and its confidence. The conductor opens a draft PR there. The experienced human answers everything in one review, and `/approve` resumes the run to the plan, which gets the same treatment. Low-confidence assumptions block; high-confidence ones proceed. Flywheel: every human correction becomes an evals/ case and a team-memory lesson. That is exactly the before/after evidence rule 3 demands.
Risk: this changes tuned skill prose (one question at a time). It must go through writing-skills with pressure tests, or spec quality drops without anyone noticing.

**Option 3: Ticket bridge rendered by init.** init writes a GitHub Actions workflow and a GitLab CI job. For Odoo, an automated action creates the issue or calls the pipeline trigger. The run starts when a maintainer applies a label, not when an issue is created. The plugin stays dependency-free; the CI belongs to the user.
Risk: issue text comes from outsiders and runs next to CI secrets. That is the 2026 "Comment and Control" CVE class. The agent stage gets a read-only token and no secrets; a separate step pushes and opens the PR.

Conditions: rule 5 (no telemetry) needs a written exception that allows only the user's configured git remote and harness. Ship Option 1 in gated mode first.

Confidence: medium
Consult: ciso, coo

### Chief Operating Officer
**Position (COO):** I back the autonomous seed, but autonomy should be set per ticket, not per project. One switch in `.agents/ultrapowers.json` is too coarse. It gives a typo fix and a schema migration the same gates. Base speed on risk tier, keep one experienced human gate where it pays, and move that gate off the developer's live session.

**Option 1: Lanes set in the brief.** `new-task` proposes a lane in the Definition of Ready, with a reason:
- **fast** (bug or chore with a testable DoD): no brainstorm, the plan is generated, and the human gate is at the PR.
- **standard**: spec and plan reviewed together as one design packet, so one sitting replaces two.
- **deep**: today's full flow.

The config file holds only the default lane and the triggers that force a ticket up a lane, such as auth, migrations, or more than N files changed.
*Risk:* a risky ticket gets labelled fast. The forced-upgrade triggers and the reviewer's right to raise a lane are the mitigation.

**Option 2: Approvals move to the tracker.** The headless run posts the design packet to the PR/MR or the ticket and parks. The reviewer approves with a label or comment, and the run picks up again. One senior can then clear a queue of 5 to 10 agent runs in batches instead of sitting in each session. This is what makes cloud VMs worth it.
*Risk:* the approval queue becomes the new bottleneck. Track gate wait time against an internal target and add reviewers when it slips.

**Option 3: A stage log per ticket, giving free KPIs and hand-offs between people.** Each skill adds one line to `tasks/<ID>/`: stage, time, and whether a human or an agent did it. `/ultrapowers:task` reads the log instantly. Any developer or agent can pick up any ticket, so work is not tied to a person. The lifecycle KPIs come out of the log with no extra work: cycle time per stage, gate wait, rework loops from review findings, QA first-pass yield. Syncing to tracker labels comes later.
*Risk:* every tracker (GitHub, GitLab, Odoo) adds its own integration to maintain. Ship the log as files only first, then add one tracker at a time.

Order: 3, then 1, then 2. The log gives the baseline that shows whether lanes and async gates actually save time.

Confidence: medium
Consult: cto, ciso

### Chief Information Security Officer
Position: autonomy is safe enough to ship if ticket text and team memory are treated as untrusted input, the run can only exit through a PR on its own branch, and every action leaves an audit record that reviewers can check. The repo already has the right base: `hooks/qa-guardrail` is a deterministic, marker-gated PreToolUse policy that fails closed when it cannot inspect a call. Grow that into an "autonomy envelope" rather than building something new.

**Option 1: Autonomy envelope.** A `.ultrapowers/auto-active` marker turns on a run-wide profile copied from qa-guardrail. Writes stay inside the worktree. The only push allowed is to `auto/<ticket>`. Edits to hooks, `.agents/ultrapowers.json`, harness settings and CI workflow files are denied. The egress allow-list, key-material denial and the read-only database rules carry over. The default rule flips from "never push" to "push your own branch only, never merge".
Risk: matching shell commands with regex blocks known patterns but is not a sandbox. It has to run on an ephemeral, network-restricted runner.

**Option 2: Provenance gates against prompt injection.** Only a human-applied label or an allow-listed author can trigger a run, never ticket text alone. Ticket bodies and memory entries reach the agent fenced as quoted data. Spec and plan approval becomes an approval artifact tied to the content hash. Execution refuses to start if the plan changed after approval. New team-memory entries go into the PR diff for review and never straight to main. The memory lint gains a check for imperative or instruction-like content.
Risk: an injection that already shaped the spec can get a rubber-stamp approval. Mitigate by showing the reviewer the ticket-to-spec diff.

**Option 3: Least-privilege secrets plus a signed evidence pack (enterprise differentiator).** The runner gets a short-lived, branch-scoped token from the CI provider (OIDC), able to open a PR but not merge. The runner, not the agent, fills in `${VAR}` placeholders. Every tool call and every guardrail decision goes into a hash-chained ledger under `reviews/<id>/`, which ships with the PR and gives auditors change-management evidence. It stays local, so the no-telemetry rule holds.
Risk: the ledger can capture log or database content and needs redaction. Hash-chaining shows tampering but cannot stop it.

QA lane condition: cross-tenant probes and database lanes run only against non-production environments when unattended.

Confidence: high
Consult: cto

### Chief Marketing Officer
Don't lead with "autonomous". Ticket-to-PR is the most crowded lane in this market. Lead with the team process layer: the playbook any agent runs, with humans approving the spec and the plan, and a QA verdict before merge. That is the open space, and only ultrapowers combines all of it.

What the market looks like (4 searches):
- **Crowded: ticket-to-PR.** Copilot cloud agent (works from Issues; Jira and Linear only open PRs directly), Codex cloud, GitLab Duo issue-to-MR, Atlassian Rovo Dev and Augment Cosmos (commercial, with shared org memory) all do it.
- **Crowded: specs.** Spec Kit, Kiro, BMAD, OpenSpec and Tessl all generate specs. Reviewers already complain about long markdown and too much process for small changes (Fowler; spec-compare).
- **Crowded: single-developer method.** The upstream methodology is very large (spec-compare lists it at about 214K stars).
- **Open space:** a vendor-neutral, zero-telemetry, in-repo process that runs on 15 harnesses. It joins three things nobody else joins: approval gates, one trail per ticket, and team memory in git. The Odoo trigger is also open; no competitor serves it.

**Option 1: autonomous between gates.** A ticket starts the work on whatever runner the team already has (Copilot, Codex, Duo, Claude Code Actions). Ultrapowers stops twice for a spec and a plan approval, given as a PR or MR comment. Then it runs to the QA verdict.
Risk: we depend on how each vendor runner supports hooks and skills, so behaviour will differ between harnesses.

**Option 2: an evidence pack on every PR.** Attach the trail to the PR: brief, spec, plan, reviews, QA verdict and memory diff. Sell it to agencies and regulated teams as "auditable AI delivery". Use Odoo as the wedge into ERP and agency shops.
Risk: this is a narrow first market, and we would need to prove the trail is useful in a real audit.

**Option 3: proof before reach.** Build a public demo repo where real tickets run through to merged PRs. Get listed on spec-compare. Track installs, then first ticket run, then a second developer joining (stars are the wrong KPI).
Risk: we cannot lead with the upstream lineage in our own copy, because the repo bans the upstream name. The team story has to carry the message alone.

Confidence: medium
Consult: cto, cso

## Decision
2026-10-02, the Owner's answers to the narrowing questions, recorded verbatim:

- First build: "1. Gated autopilot + 4. Tracker bridge + 3.Stage log + evidence pack". Added by the Owner: "In this case, where is the ticket coming from? Or where is the task is being read from? So, I think it's a very uh, important that we also took care of this step. [...] we need to have also configurationable at the ultra.json file [...] and also at the ultrapowers:init [...] we need also to support all ticket uh, providers or task uh, providers [...] for example, GitLab MCP [...] a GitHub MCP, uh, also oddo MCP possibly also Slack, MCP [...] and of course uh, local meaning like [...] a person themselves use a uh, a new task a command and create a task a file manually we need to follow the same manual flow but now only the difference is that uh, a new task command comes from one of these sources [...] I prefer actually like GitHub, uh, GitHub CLI, GitLab CLI, uh, and whenever CLI is available, better than MCP. The problem is, I'm not sure if that is possible for like a VM setup or a cloud setup [...] we can start with the MCPs option for all of these providers [...] the user can configure that [...] at the ultra power init [...] Do you want to be fully autom autonomous or um, do you want to be manual uh, or like uh, autopilot or what type of uh, what what is the ticket provider? Which MCP and uh, like and also uh, to authenticate [...] And all of that is configurationable [...] in the ultra powers.json file."
- Granularity: "Both (Recommended)".
- Approval: "1 + 2 as (optional)": PR/MR review, with the ticket tracker comment as an option.
- Assumption ledger: "Headless runs only (Recommended)".

(Elisions marked [...] remove repetition only; the full answer is in the session transcript.)
