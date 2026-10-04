# Executive brief: Autopilot: multi-repository tickets and the documents repository
Mode: decide | Date: 2026-10-04
Invited: cto (engine, state and branch model across repositories), coo (one control protocol across trackers, the reviewer's seat), ciso (approval binding across repositories, Odoo credentials)
Consulted: none (every Consult target, cto, coo and ciso, was already invited)
Not consulted: cmo (no skill in play; positioning was settled in the morning meeting)
Previous minutes: `2026-10-04-autopilot-trigger-and-resume-command-watcher-or-ci.md`

The Owner's challenge: a ticket from Odoo, or later Slack, usually spans three to ten repositories. The usual setup is a workspace with a documents repository, where init runs and the knowledge base and AI configuration live, plus code repositories as nested clones. The brief, spec and plan belong to the documents repository on a feature branch there, and the base branch for the ticket's documents is defined there. The review conversation happens in the tracker, not in one code repository. PRs or MRs open in every repository in scope at the end.

## Summary
Three yes-with-conditions. The documents repository is the home of the ticket's state, stage log, review packet and audit log; the single-repository case becomes the degenerate case of the multi-repository one. One feature branch, same name, per repository in scope; each code repository keeps its own base branch from `repos[]`; `autopilot.baseBranch` applies to the documents repository only. The human protocol is four tracker-neutral events, start, approve, changes and hold, mapped per provider. Approval binds to one documents-repository SHA whose packet lists every in-scope code tip; any new commit anywhere voids it. All three defer Odoo write-back: the CISO refuses an Odoo API key in the engine this release because it is a user-wide credential; the CTO and COO ship GitHub, then GitLab, then Odoo multi-repo, with the array schema present from day one.

## Positions
### Chief Technology Officer
Yes with conditions. The spec's "Repositories in scope" section is binding at the gate; the plan may narrow it, never widen it. State carries `docs` and a `repos[]` array with branch, base, tip, PR URL and status. The packet commit holds a manifest of every code tip; the human approves one SHA; the engine verifies N tips at stage start. Odoo write-back over JSON-RPC from the engine, opt-in per source, second release. First release: root and nested with one code repository, GitHub and GitLab.

### Chief Operating Officer
Yes with conditions. Four events mapped per provider: GitHub and GitLab labels; Odoo a tag per event plus a chatter message beginning with the event word, never a kanban stage. One packet per ticket, under 25 lines, one line per repository. Stage log entries per stage and repository, plus a ticket-level line. Partial approval by a scope list, `approve: backend, frontend`; the engine holds the rest with a reason and the plan is re-cut. Ship GitHub single repository, then GitLab, then Odoo multi-repo.

### Chief Information Security Officer
Yes to one documents SHA plus every in-scope tip in the gate message as the approval binding. No to the engine holding `ODOO_API_KEY` this release. Verification per provider: GitHub collaborator permission write or higher; GitLab access level 40 or higher; Odoo a dedicated approver group, later. At approval the engine freezes the plan's repository list into state; a pre-push hook and the guardrail deny any push outside `<ID>-*` branches in listed repositories and the run halts and reposts the gate. One fine-grained token per watcher enumerating the workspace repositories. Audit log in the documents repository only; every code PR cites the docs SHA and audit hash.

## Agreement
- The documents repository is the home of state, stage log, packet and audit log; root topology is the degenerate case (cto, coo, ciso).
- One branch name per ticket in every repository in scope; base per repository from `repos[].defaultBranch`; `autopilot.baseBranch` is the documents base only (cto, ciso).
- Scope is a hint in the brief, binding in the spec, narrowable by the plan, frozen at approval; unknown repository names are refused (cto, ciso, coo).
- Approval binds to the documents SHA and the listed code tips together; any drift voids it and reposts the gate (cto, ciso).
- Four tracker-neutral events mapped per provider; one packet per ticket with one line per repository (coo, cto).
- Odoo write-back is not in the first release; the schema carries the repository array and the provider adapter from day one (cto, coo, ciso).

## Disagreement
- First-release topology: the CTO ships root and nested-with-one-code-repository; the COO ships GitHub single repository first; the Owner's own projects are nested with many repositories. The array schema from day one is the bridge.
- Odoo transport, later: the CTO accepts JSON-RPC from the engine with the key from the environment; the CISO requires a dedicated technical user in a custom group and notes that plain `fetch` from the engine strains rule 5 and needs the Owner's explicit amendment.
- Partial approval: the COO wants `approve: <repos>`; the CTO and CISO freeze the spec's list and reopen the gate on any change. Both can hold: a scope list is a change request that narrows the spec, re-cuts the plan and reposts the packet.

## Risks
- A repository added after approval that is pushed silently; mitigated by the frozen list, the pre-push hook and the guardrail (ciso).
- The QA preflight still finds branches by regex on the id; it must read state before nested-with-many ships (cto).
- One Odoo key reaches every model its user can; a leak is a tenant compromise (ciso).
- Three provider rituals for one reviewer; mitigated by the neutral events (coo).
- Packet growth with ten repositories; one line per repository, links out (coo).

## Recommended decision
Adopt the documents repository as the ticket's home, the per-repository branch array, the four neutral events with per-provider mapping, and approval bound to the documents SHA plus listed code tips. First release: GitHub write-back through `gh`, root and nested topologies with the array schema and the frozen scope from day one; GitLab write-back through `glab` next; Odoo write-back after a technical user and an explicit rule 5 reading from the Owner. Supported by cto, coo and ciso.

## Open questions
- Does the first release support nested-with-many code repositories on GitHub, since the schema allows it, or only one code repository as the CTO proposes?
- Does the Owner amend rule 5 to allow the engine's own HTTPS call to a host named in the marker, for Odoo write-back later?
- Is a partial approval a change request (reopens the gate) or an approval with scope (proceeds on the listed repositories)?

## Next steps
| Action | Owner officer | When |
|---|---|---|
| Owner answers the open questions | Owner | Now |
| State schema with `docs` and `repos[]`, scope rules, manifest in the packet commit | cto | In the spec |
| Event mapping table per provider, packet template with one line per repository | coo | In the spec |
| Frozen-scope push rule, approval verification per provider, token guidance | ciso | In the spec |

## Full responses

### Chief Technology Officer
**Position: yes, with conditions.** The documents repository is the one place every ticket already has: the marker, the knowledge base, the config. Making it the home of state, stage log and review packet turns the single-repository case into a degenerate case of the multi-repository one, instead of two code paths. One feature branch per repository in scope, approval bound to the documents-repository commit, one PR/MR per code repository at the end.

**Conditions.**

1. **Scope.** The brief records a hint only (the clone the ticket id names, or none). The spec's "Repositories in scope" section is binding at the spec gate; the plan may narrow it, never widen it. A repository added later reopens the gate. The engine validates every name against `repos[]` in the marker and refuses unknown ones.

2. **State.** `state.json` carries `docs: {branch, base, tip}` and `repos: [{name, branch, base, tip, prUrl, status}]`. Same branch name everywhere; base is each repository's `defaultBranch` from the marker, overridable per repository. `autopilot.baseBranch` applies to the documents repository only.

3. **Approval.** The packet commit in the documents repository includes `tasks/<ID>/manifest.json` with every code tip. The human approves one SHA, the documents tip; the engine verifies N tips at stage start, and any drift voids the approval. Agent stages never hold tracker or push credentials.

4. **Odoo.** Write-back from the engine over JSON-RPC with `ODOO_API_KEY` from the environment, host from the marker, opt-in per source. Never via an agent stage with the MCP tool. Defer it to the second release; the first reads Odoo through the MCP inside brainstorm.

5. **First release.** Root and nested-with-one-code-repo, GitHub and GitLab, with the array schema from day one. Nested-with-many ships with Odoo write-back, after the QA preflight stops guessing branches by regex and reads `state.json`.

Confidence: medium
Consult: ciso, coo

### Chief Operating Officer
**Position: Yes, with conditions.** One control protocol of four tracker-neutral events (start, approve, changes, hold), mapped per provider, is the only shape that lets one senior reviewer clear several tickets in a sitting across GitHub, GitLab and Odoo without learning three rituals. Mapping is cheap; retraining reviewers is not.

**Conditions**

1. **First-release mapping.** GitHub and GitLab: labels `up:ready`, `up:approve`, `up:changes`, `up:hold`, reason in a comment or note. Odoo: a tag per event plus a chatter message that begins with the event word; stages stay the project's own, never the engine's trigger, because kanban columns are shared and reordered freely. Authorisation lives in `.agents/ultrapowers.json`: a reviewer list per source; the engine ignores events from anyone else. Odoo is reached by JSON-RPC over HTTPS, no MCP.
2. **Where the reviewer looks.** One packet per ticket, posted once to the tracker, under 25 lines, one line per repository in scope: repo, branch, PR/MR link or "not yet", test status. One link to the documents-repo feature branch for brief, spec and plan. The reviewer never opens five repositories to approve.
3. **Stage log.** One entry per (stage, repo): timestamp, ticket, repo, stage, branch, commit, result, link; plus a ticket-level entry when every repo in scope reaches the stage. The documents repo is a repo like the others.
4. **Partial approve.** `approve` with a scope list in the comment or chatter message, for example `approve: backend, frontend`. The engine records the scope, moves the unlisted repo to `hold` with the reason, and appends a scope amendment to the spec on the docs branch; the plan is re-cut before execution. Approve without a list means every repo in the spec.
5. **Ship order.** GitHub single repo first; GitLab second, which proves the neutral layer; Odoo multi-repo third. The packet and stage-log schemas carry the repo list from release one, so nothing is rewritten.

KPIs: reviewer minutes per ticket, re-review rate, packet-to-approve latency.

Confidence: high
Consult: cto, ciso

### Chief Information Security Officer
**Position.** Yes to binding approval to one documents-repository SHA, with the approved plan as the only manifest of where the engine may push. No to the engine holding `ODOO_API_KEY` in this release: an Odoo key is a user-wide credential, not a repository-scoped one, and a leak is a tenant compromise. Ship GitHub and GitLab; Odoo write-back follows once it has its own technical user.

**Strongest reason.** One SHA makes the approval verifiable across three to ten repositories; a key that can act on every Odoo model its user reaches cannot be made as narrow as a fine-grained token.

**Conditions.**
1. Approval binds to a packet, not the docs SHA alone: the docs SHA plus each in-scope code branch tip, listed in the gate message. Any new commit anywhere voids it and reposts the gate.
2. Verification: GitHub, collaborator permission `write` or higher on the documents repository plus the allow-list. GitLab, `members/all` access level 40 or higher plus the allow-list. Odoo, the approving `mail.message` author or `write_uid` is a user in a dedicated approver group, timestamp after the gate, message quoting the SHA. The engine's own account never counts.
3. Envelope: at approval the engine copies the plan's repository list into state and freezes it; a pre-push hook and the PreToolUse guardrail deny any push outside `<ID>-*` branches in listed repositories, the run halts and reposts the gate. Never skip silently.
4. Token: one fine-grained token per watcher, enumerating the workspace repositories, Contents and Pull requests only, no organisation-wide scope. GitLab: project tokens per repository.
5. Odoo later: a technical user in a custom group limited to task read and chatter post, key present only in the deterministic step, host named in `.agents/ultrapowers.json`. Plain `fetch` strains Rule 5; the Owner must amend it explicitly.
6. Audit log in the documents repository only, `reviews/<ID>/autopilot.jsonl`; every code PR cites the docs SHA and audit hash.

Confidence: high
Consult: cto

## Decision
2026-10-04, the Owner's answers, recorded verbatim:

- First release: "GitHub and GitLab, root and nested-with-many. GitHub and GitLab write-back through gh and glab. Root topology and nested with any number of code repositories. [...] Two adapters in first release." Odoo write-back stays deferred, as the officers recommended.
- Partial approval: "Change request (Recommended)". The engine narrows the spec's scope, re-cuts the plan, reposts the packet, and waits for a full approval of the new packet.
- The rule 5 amendment for the engine's own HTTPS call is not decided; it is not needed while write-back goes through `gh` and `glab`.
