# Executive brief: v1.2.0 "Autopilot" release notes and README review
Mode: review (explicit) | Date: 2026-10-04
Invited: cmo (positioning, the release note as a marketplace piece, brand claims), cto (technical accuracy and completeness of the notes and the README against the code)
Consulted: ciso (asked by cto and cmo: the credential model and the security claims), cso (asked by cmo: the proof pack and the buyer's view) | none
Not consulted: coo (named by cso only, in the consult round) | none

No org-profile.yaml found; using matrix values. The executive-team plugin was installed but not loaded in this session, so the Chief of Staff ran the protocol by hand: the officers read their agent files and the protocol, answered in the officer format, and one consult round followed.

## Summary
The story is true and the engine is sound, but the documents said more than the code and the evidence. The CTO found two holes that a stage could use to pass its own gate (deleting the run marker; a mode or start label from any account) and two checks that failed open (the watcher's self check when the engine account cannot be read; watchSelfApproval without stage tokens). The CISO called four of these blockers and ruled that a watcher must not start without read-only stage tokens unless the project says so in writing. All four officers agree on the wording: the guardrail is a hook, not a sandbox; the agent is denied push, merge and tracker writes during a stage; the engine does those steps between stages after checking the approval on the tracker; only the session door on Claude Code with GitHub was verified live. The CMO and the CSO want buyer language first, a verification table, beta marks on the watcher and full mode, and a public code-changing run with a QA verdict before the headline claims go out.

## Positions
### Chief Marketing Officer
Headline "Autopilot: hand the agent a ticket, approve its plan on the ticket, review its pull request." Lead with five claims (one command or label from brief to pull request; one approved packet checked on the tracker; the agent cannot push, merge or approve; a hash-chained record per ticket; runs on your machine with your tokens). Fix three contradictions (the "claude-code or opencode" bullet, spec §2, the watcher diagram), add Grok Build to the harness table, mark the watcher beta, and drop or qualify the QA, every-harness and Slack claims until there is evidence. The README should name autopilot in its intro.

### Chief Technology Officer
The engine is well built; the documents overclaim. Blockers: the run marker is an allowed shell write; a mode label switches a ticket to full with no actor check; `me()` fails open; `watchSelfApproval` without stage tokens is allowed; MCP isolation is Claude Code only; SSH keys survive the token scrub; Claude Code itself lets a crashed hook through; GitLab "write" means Maintainer. Verified live: the session door on Claude Code with GitHub, root workspace, gated, inline, no QA stage. Never run: the watcher on any harness, GitLab, nested, full mode, stage tokens, the changes loop, the QA stage. Ship with a verification table and a per-host test stage before a watcher is turned on.

### Chief Information Security Officer (consulted)
Blockers: the marker (also turn the profile on from the stage's environment and have `end` halt when the marker is missing), the label actor check, failing closed on `me()`, and the watcher refusing to start without stage tokens unless `autopilot.watch.sharedCredentials` is set. Can ship with wording: SSH and MCP exposure (unset the ssh agent for stages), the hash chain ("hash-chained log", never "audit record"). Permitted claims: "During a stage, a guardrail hook denies the agent push, merge and tracker writes. The engine pushes and opens pull requests between stages, and a human merges. The hook matches patterns; it is not a sandbox." "With stage tokens, the engine's tokens are removed from the stage's environment. On Claude Code, only the project's MCP servers load." "Runs on your machine with tokens you issue; the plugin's own code sends nothing anywhere."

### Chief Sales Officer (consulted)
A buyer asks "what was verified, and on what?" and "who can approve, and what leaves our network?" The draft answers the second, not the first, and says nothing about cost or time per ticket. Proof pack in order: the verification table (missing), the public issue-16 record (exists; proves the gate, not quality: QA skipped, no code changed, inline), one gated ticket that changes code with the QA verdict on the pull request (to produce), a watcher run on a VM (to produce), a security one-pager, a two-week pilot kit. Frame the three ways as a ladder with the same artifacts at every step; do not lead enterprise copy with full mode. Recommend `approvers` for teams.

## Agreement
- The four blockers are fixed before the release ships, each with tests (cto, ciso; the Owner's agents fixed them in commit "the executive review's blockers").
- The release note states what was verified live, offline and from vendor documentation (cto, cso, cmo).
- The watcher and full mode are marked beta until a live run of each is public (cmo, cto, cso).
- The credential and envelope claims use the CISO's wording; "nothing is reported back" becomes "the plugin's own code sends nothing anywhere" (ciso, cso, cmo).
- Buyer language first, engineering detail last (cmo, cso).

## Disagreement
- The CMO's headline and five claims against the CSO's hold: the CSO wants the headline held until a code-changing gated ticket with a QA verdict is public; the CMO wants it now with the watcher marked beta. The CISO rejects the claim "the agent cannot push, merge or approve" as absolute.
- Stage tokens by default: the CISO wants the watcher to refuse without them (opt-out in writing); the CTO lists it as a fix; the earlier meeting's condition said the stage runs without a token at all. The engine still needs a token to read the ticket, so read-only stage tokens are the form.

## Risks
- A regex hook is not a sandbox: a build script a stage runs can execute anything the hook never sees; credentials and the host are the real boundary (ciso, cto).
- Claude Code, Gemini CLI, Qwen Code, Droid and Kimi Code let a crashed or timed-out hook through (cto).
- Antigravity's plugin hook path and crash behaviour are not verified (cto).
- Only one harness was verified live; the thirteen-harness claim rests on offline tests and vendor documentation (cto, cso).
- The public run proves the approval gate, not development quality (cso).

## Recommended decision
Ship v1.2.0 with the four blockers fixed and tested, the documents corrected to the CISO's wording, a verification table in the release notes, the watcher and full mode marked beta, and the headline stated as an outcome ("hand the agent a ticket, approve its plan on the ticket, review its pull request") with the claims stated as tested (cmo, cto, ciso, cso). Produce the code-changing gated run with a QA verdict and the watcher run next, and link them from the notes when they exist.

## Open questions
- Whether `approvers` should be recommended or required for teams (cso raised it; coo not consulted).
- Cost and time per ticket: nothing measured yet (cso).
- Uninvited perspective: coo, because the ready-to-pull-request process and its SLA are COO skills at level 3 and the CSO named the COO in the consult round, which does not run twice.

## Next steps
| Action | Owner officer | When |
|---|---|---|
| Fix the four blockers with tests (done in this branch) | cto | before the release |
| Rewrite the v1.2.0 notes: buyer language, verification table, permitted wording, beta marks | cmo | before the release |
| README: autopilot in the intro and How it works, Grok Build row, crash and GitLab notes, sharedCredentials | cto | before the release |
| Watcher document: same-user and SSH limits, the minimum before turning it on | ciso | before the release |
| One public gated ticket that changes code, with the QA verdict on the pull request | cto | next |
| One public watcher run from label to pull request | cto | next |
| Security one-pager and pilot kit | cso | next release |

## Full responses

### Chief Marketing Officer
**Strengths.** The story is true and backed by evidence. One engine runs the workflow the plugin already had, and the human gates sit on the ticket. A live run took GitHub issue 16 to PR 20 (`tests/autopilot/acceptance-2026-10.md`), and pressure scenarios A1 to A8 back the gate claims. The line "A regex hook is not a sandbox" and the disposable-host advice will earn trust from a security reviewer.

**Weaknesses.** The first 80 lines of the README never mention autopilot. The draft reads as an engineering changelog ("doors", "envelope", D13, D14 first). It contradicts itself: bullet one says "claude-code or opencode", yet the release ships an adapter for every harness; spec §2 still rules out the other adapters; the watcher diagram says claude-code. README step 10 says beta; the release notes do not.

**Claims the material does not support:** "PR with the QA report" (the live run skipped QA); the fully automated watcher and GitLab with several repositories ("Not run in this round"); "every harness with the guardrail" (Devin refused, Muse no headless CLI, Grok Build missing, four harnesses let a crashed hook through, adapters checked against installed CLIs only); "Slack later" (no roadmap line); "without compromising quality" (every gate still runs; nothing measured).

**Headline:** "Autopilot: hand the agent a ticket, approve its plan on the ticket, review its pull request." **Structure:** who it is for; three ways to run it (manual, one command, the watcher marked beta); how you stay in control; which harnesses, with exceptions; how to upgrade; the engineering detail last; what is not in this release. **Claims to lead with:** one command or one label carries a ticket from brief to pull request; you approve one spec-and-plan packet, checked on the tracker and tied to its commits; the agent cannot push, merge or approve, the engine does those steps between stages; each ticket keeps one hash-chained record; it runs on your machine with your tokens. **README:** add autopilot to the intro and How it works. **Proof:** one public ticket the watcher takes from `up:ready` to a pull request with the QA verdict attached.

Ship with a headline about the outcome and the five claims above. Mark the watcher beta, and drop or qualify the claims about QA, every harness and Slack until there is evidence for them.
Conditions: fix the three contradictions and add Grok Build to the table before publishing. Promote the watcher once a run from label to pull request, QA included, is recorded publicly.
Confidence: high
Consult: cto, ciso, cso

### Chief Technology Officer
**Strengths.** The engine is well built. The agent is never the one that pushes or writes to the tracker. Approval is checked against the tracker's own timeline (actor, permission, after the packet, commits unchanged) and again before `execute` and before `pr`. The pre-push check limits pushes to the approved scope. In-process hooks block the call if the guardrail cannot run.

**Weaknesses.** The envelope can be switched off from inside a stage (`rm .ultrapowers/autopilot-active`). "Every harness, enveloped" rests on one live run. Claude Code itself lets a crashed or timed-out hook through, and `hooks.json` set no timeout. A label switches a gated ticket to full with no check on who added it; `up:ready` is not checked either. "Holds no credential that could write" is wrong over SSH; "only project MCP servers" is true for Claude Code only. The release was not cut from a clean tree.

**Changes:** protect the run markers and have `end` block a stage whose marker disappeared; a test stage per host before the watcher takes a ticket; check the account that added a mode label; refuse `watchSelfApproval` without stage tokens; a verification table in the notes.

**First paragraph:** the agent never pushes, merges or writes to the tracker; the engine does that between stages after checking the approval on the tracker. The guardrail is a hook, not a sandbox; a stage holds no write credentials only when read-only stage tokens are set and remotes use HTTPS. Verified live: the session door on Claude Code with GitHub; the watcher and the other harnesses are covered by offline tests and vendor documentation; Devin is refused.

Ship the session door on Claude Code with GitHub as described. Do not ship the "every harness, watcher-ready" claim until the marker hole is fixed and a test stage per harness is recorded.
Reasoning: the engine is sound; the gaps are a bypass that takes one command, documentation that says more than the code, and evidence from one harness only. Conditions: the five changes above and the corrected documents. Security sits at level 1 in my skills table, so the CISO should rule on the credential model.
Confidence: high
Consult: ciso, cmo

Full findings (A1 to A18, B, C) are kept in the Chief of Staff's working notes of this meeting; the items that changed code are in the commit "fix(autopilot): the executive review's blockers", and the items that changed documents are in the release notes, the README and `docs/autopilot-watcher.md` of the same branch.

### Chief Information Security Officer (consulted)
**Strengths.** The engine checks each approval against the tracker timeline and again before execute and before the PR. It checks push scope itself, and the watcher refuses harnesses that do not run the guardrail.

**The six findings:** deleting the marker, BLOCKER (reproduced; protect `.ultrapowers/*-active`, turn the profile on from `ULTRAPOWERS_AUTOPILOT_INSIDE=1`, have `end` halt when the marker is missing). SSH keys and MCP servers: can ship with the wording below; the stage runs as the same OS user as the watcher, so it can read the watcher's environment and gh's stored login; unset `SSH_AUTH_SOCK` for stages. Labels: BLOCKER for the watcher; `up:mode:full` and `up:ready` pass the same actor check as `up:approve`, or are ignored. `me()` failing open: BLOCKER; fail closed, and refuse `watchSelfApproval: true` without a stage token. Stage tokens: BLOCKER in the watch door only; the watcher refuses to start without a stage token unless `autopilot.watch.sharedCredentials: true`; sessions may keep sharing credentials. Hash chain: can ship as a "hash-chained log", never an "audit record".

**Permitted wording.** "During a stage, a guardrail hook denies the agent push, merge and tracker writes. The engine pushes and opens pull requests between stages, and a human merges. The hook matches patterns; it is not a sandbox." "With stage tokens, the engine's tokens are removed from the stage's environment. On Claude Code, only the project's MCP servers load." "Runs on your machine with tokens you issue; the plugin's own code sends nothing anywhere."

**Minimum before the watcher:** an ephemeral VM with no other credentials or SSH keys; HTTPS remotes; branch protection with required review on every base branch; an engine token scoped to the listed repositories; a read-only stage token; `approvers` set to humans; `watchSelfApproval` false.

Ship v1.2.0 only after four fixes: the marker, the label actor check, failing closed, and the watcher refusing to start without stage tokens. Each is small.
Reasoning: the guardrail can be bypassed by deleting its own marker, and a build script can run commands the hook never sees, so credentials are the real control. Conditions: the four fixes ship with tests; `docs/autopilot-watcher.md` states the same-user and SSH limits; the release notes use only the wording above.
Confidence: high
Consult: cto, cmo

### Chief Sales Officer (consulted)
**(1)** An engineering manager asks "what was verified, and on what?"; procurement asks "who can approve, and what leaves our network?" The draft answers procurement, not the engineering manager, and says nothing about cost or time per ticket. By default the engine's own account can approve, which reads as weak separation of duties.

**(2) Proof pack:** a verification table per door and per harness (missing); the public issue-16 record (exists; proves the gate, not quality); one gated ticket that changes code with the QA verdict on the PR (to produce); a watcher run on a VM (to produce; until then the watcher stays beta); a security one-pager; a two-week pilot kit with the engagement as the paid option.

**(3) Framing:** a ladder with the same artifacts at every step: manual in chat, gated from a session, gated by the watcher, full only after a track record. Separate who starts the run from how many gates it has. Do not lead enterprise copy with full.

**(4) Claims that would cost credibility:** "the envelope on every harness" (one verified live); "the agent cannot push, merge or approve" (a hook; Kimi lets a crashed hook through; the watcher bypasses prompts); "every step still passes the QA verdict" (the live run skipped QA); "nothing reported back" (the model provider sees the work).

Ship v1.2.0 with the verification table, buyer-language notes and the governance claims stated as tested. Hold the five-claim headline until the code-changing gated ticket with a QA verdict is public.
Condition: the current public run proves the approval gate, not development quality. Recommend `approvers` for teams, and keep the watcher and full mode beta until their own live record exists.
Confidence: high
Consult: cto, cmo, coo

## Decision
Pending Owner decision
