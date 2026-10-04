# Odoo as an autopilot tracker: design

Date: 2026-10-05
Status: approved in conversation by the Owner on 2026-10-05, section by section; written spec pending the Owner's review
Sub-project: the Odoo part of D (tracker bridge) left out of `2026-10-04-autopilot-design.md`, plus two items that spec deferred and the Owner pulled into this release: the QA report posted on the ticket and on the pull requests, and the rich ticket read (chatter, attachments, links). Builds on `2026-10-02-ticket-sources-design.md` (Odoo tasks read through the team's MCP server) and `2026-10-04-autopilot-design.md` (engine, doors, gates, envelope).

## 1. Goal

An Odoo task runs through autopilot the way a GitHub or GitLab issue does: a tag on the task starts the run, the engine writes the brief, spec and plan on a branch of the documents repository, posts the review packet as a log note on the task, waits for the approve tag, implements, runs QA, opens one merge request per code repository on the forge that holds it, posts the QA report on the task and on every merge request, and waits for a human to merge. Before the spec, the agent has read everything on the task: title, description, every chatter message, every attachment it could download, and every linked page.

Success:

1. On the Owner's own Odoo, `/ultrapowers:autopilot <task URL>` in `gated` mode cuts the documents branch, writes the brief with the task's messages, attachments and links, the spec and the plan, and posts one packet as a log note on the task. After the Owner adds the approve tag, the same command implements, runs QA when configured, opens the merge requests on GitLab, posts the QA report on the task and on each merge request, and stops.
2. The same task runs through `autopilot.mjs watch` with `ODOO_API_KEY` and `ULTRAPOWERS_STAGE_ODOO_API_KEY` in the environment and nothing typed between the tag and the merge requests.
3. An approve tag set before the packet, by a portal user, by an internal user outside the Project User group, or by a login outside `approvers`, is refused and logged, and nothing is executed.
4. A GitHub or GitLab ticket behaves as in 1.2.1, plus the QA report comment and the richer brief.

## 2. Scope

In scope: the Odoo tracker in the engine over Odoo's JSON-RPC API; tag events from the chatter's tracking values with a logged last-writer fallback; the forge taken from each repository's remote; the QA report on the ticket and the pull requests for all three providers; the rich read in the fetch step and in new-task and brainstorm-task for all three providers; Odoo task URLs as ticket arguments; init's Odoo questions and tag creation; the guardrail extension for the Odoo MCP tools; the watcher's Odoo polling and stage key; tests; release 1.3.0.

Not in scope:

- A second gate on the pull request with the engine merging on a label. A human merges, as in 1.2.1.
- Approval by chatter message, for portal users who cannot set tags. The tracker is built so it can be added as a second event source without redesign (D4).
- Slack as a source. Odoo write-back to the task's stage or state.
- The engine as an MCP client, or an agent relaying tracker reads and writes (D1).

## 3. Decisions

| # | Decision | Reason |
|---|---|---|
| D1 | The engine reaches Odoo through its standard JSON-RPC API over HTTPS with a technical user's API key, from Node's built-in fetch, in both doors. The agent stages keep reading through the Odoo MCP server as in 1.1.0. Rule 5 of `AGENTS.md` is amended: the plugin's own code may open a connection to the host of a ticket source the user configured, with a credential the user issued. | Works on every Odoo version and with either MCP flavour; no model call inside the gate check; the watcher polls without a model call per cycle. The Owner chose it after weighing the MCP-first forms. |
| D2 | The approve, ready, changes, hold and mode signals are tags on the task, as the Owner asked; internal users only. | Odoo lets only internal users with write rights on the task change its tags, so Odoo itself enforces the write-access half of the check. |
| D3 | Tag events come from the chatter's tracking values when the instance tracks the tags field, each with author, time and the before and after tag lists; otherwise from the task's last writer and last-write time, and every approval verified that way is logged with `attribution: last-writer`. Tracking is detected from the field definition, not from the absence of rows. | Stock Odoo 17 and 19 do not track `tag_ids`; the Owner's instance does. The strong form is used where it exists and the weaker form is never silent. |
| D4 | The Odoo tracker implements the same interface as GitHub and GitLab, and every Odoo-specific rule (tag names to ids, HTML to text, tracking diff) lives in one file. A second event source (chatter messages) would be one more method, not a redesign. | Portal approvers are the next request. |
| D5 | The forge of a repository is its origin remote: `github.com` means `gh`, any other host means `glab` against that host. The ticket source is the fallback only for a repository without a remote, and only for GitHub and GitLab tickets. | An Odoo ticket's code lives on GitLab or GitHub; the ticket tracker and the forge are different systems for the first time. |
| D6 | The engine's notes on an Odoo task are internal log notes (`mail.mt_note`), never messages to followers. | The Owner's approvers are internal; clients who follow a task do not receive the engine's packets. |
| D7 | The whole QA report is posted on the ticket and on every pull request after the pull requests open, for all three providers, citing the packet id, the approver and the log head. | The Owner wants the report where the reviewer reads, and one behaviour across providers. |
| D8 | The fetch step reads messages, attachments and links for every provider; attachments are downloaded into `tasks/<ID>/attachments/` up to a cap and committed with the brief; one that cannot be downloaded is listed by name and URL and read in the session only, with a note. brainstorm-task fetches each link with the harness's web reader first and the Firecrawl MCP server second, and views image attachments. Everything read is data. | The Owner's tasks carry mock-ups, artifacts and links the spec must not miss. |
| D9 | Odoo's six tags default to `Ultrapowers Ready`, `Ultrapowers Approve`, `Ultrapowers Changes`, `Ultrapowers Hold`, `Ultrapowers Running`, `Ultrapowers Blocked`; GitHub and GitLab keep the `up:` defaults; `autopilot.events` renames them as today. | The Owner chose readable names for the kanban. |
| D10 | Odoo task URLs are accepted wherever a ticket id is, in their three shapes, and resolve against the source whose `url` matches. | The Owner pastes the link from the browser. |
| D11 | The guardrail denies the Odoo MCP server's writing tools and shell calls to the Odoo host during a stage. | The envelope must hold on the new tracker as it does on `gh` and `glab`. |
| D12 | The new and changed skills go through `ultrapowers:writing-skills`; the live acceptance is one task on the Owner's own Odoo with GitLab repositories, session door first, then one watcher cycle. | Rule 3 of `AGENTS.md`; the verification table of the release names what ran live. |

## 4. Configuration

An Odoo source in `tickets.sources` keeps its 1.1.0 fields and gains two:

```json
{ "prefix": "ODOO", "provider": "odoo", "url": "https://erp.example.com",
  "mcpUrl": "https://erp.example.com/mcp", "mcpHeader": "Authorization: Bearer",
  "login": "ultrapowers-bot@example.com", "db": "erp", "defaultProject": "34" }
```

| Field | Rule |
|---|---|
| `login` | The technical user's login. Required when the project has an `autopilot` block and this source; optional otherwise (MCP-only reading as before). Not a secret. |
| `db` | Optional. Absent: the engine asks `<url>/web/database/list`; one database is used, several or a disabled list is `bad-tickets` naming the field. |
| `defaultProject` | The numeric project id. The watcher polls only sources that have one, as for GitHub and GitLab. |
| `attachmentMaxBytes` | Optional, on `tickets`; default 10485760. Larger attachments are listed, not downloaded. |

Secrets stay in the environment: `ODOO_API_KEY` (the engine's key; 1.1.0 already names it for the MCP header) and `ULTRAPOWERS_STAGE_ODOO_API_KEY` (a key of a read-only Odoo user, for the watcher's stages). In a stage the engine's key is removed and `ODOO_API_KEY` is set to the stage key, so the project's Odoo MCP server, whose header reads `${ODOO_API_KEY}`, works read-only inside the stage, exactly as `GH_TOKEN` is swapped today.

The technical user: an internal user in the Project User group and no other, with an API key. That gives read on projects, tasks, tags, chatter messages, tracking values, attachments, users and partners; write on a task's tags; tag creation; log notes. The read-only stage user: an internal user with Project read access only.

Ticket ids: `ODOO-<project>-<task>` as in 1.1.0. Also accepted, by `autopilot`, `new-task` and `task`: `<url>/odoo/action-<n>/<project>/tasks/<task>`, `<url>/odoo/project.task/<task>` and `<url>/web#id=<task>&model=project.task…`. The URL's origin selects the source; the project id comes from the URL when it carries one and from the task otherwise; the task must belong to the source's `defaultProject` when one is set and the URL names none, else `bad-ticket`.

## 5. The Odoo tracker

`skills/autopilot/scripts/tracker.mjs` gains `OdooTracker`, the same twelve operations as the other two plus `prComment`, and `skills/autopilot/scripts/odoo.mjs` holds the JSON-RPC client and the Odoo rules so the tracker stays as thin as its neighbours.

The client: `POST <url>/jsonrpc` with JSON-RPC 2.0, `common.authenticate(db, login, key)` once per process for the uid, then `object.execute_kw(db, uid, key, model, method, args, kwargs)`. Timeout `ULTRAPOWERS_FETCH_TIMEOUT_MS` (default 30 s). An Odoo error becomes `tracker-failed` with Odoo's own message; a missing `ODOO_API_KEY` or `login` is `no-credentials`, the Odoo form of `no-cli`; an unreachable host is `tracker-failed`. Nothing but the configured `url` is ever called.

| Operation | Odoo |
|---|---|
| `cliReady` | `authenticate` succeeds. |
| `me` | The technical user's login. |
| `listTickets(tag)` | `project.task.search_read` on `project_id = <defaultProject>`, `tag_ids.name = tag`, `is_closed = false`: id, name, `write_date`. |
| `title`, `labels` | `name`; the names of `tag_ids`. |
| `labelEvents` | Tracking on: the task's `mail.message` rows that carry tracking values, and the `mail.tracking.value` rows whose field is `project.task.tag_ids`; each row's before and after name lists are diffed into `labeled` and `unlabeled` events `{ id: message id, label, actor: the author's login, at: message date }`. Tracking off (read once from `ir.model.fields` for `project.task.tag_ids`): one `labeled` event per current tag, `actor` the task's `write_uid` login, `at` its `write_date`, `attribution: last-writer`. The approval check accepts a last-writer event only when `write_date` is after the packet, and logs the attribution. |
| `comments(since)` | The task's `mail.message` rows of type `comment` after `since`, author's login, date, body as text (HTML stripped, paragraphs and line breaks kept, entities decoded). |
| `permission(login)` | `res.users` by login: a portal user (`share`) is `none`; an internal user in the Project User or Project Administrator group is `write`; any other internal user is `read`. |
| `comment(body)` | `project.task.message_post` with `subtype_xmlid: mail.mt_note`, the text wrapped in `<pre>` with URLs made links; returns `<url>/web#model=project.task&id=<task>&message=<id>`. |
| `commentTime(url)` | The `message=<id>` of that URL, read back as the message's date. |
| `addLabel`, `removeLabel` | `write` on `tag_ids` with the add or remove command for the tag's id; a tag the server lacks is created first. |
| `ensureLabel(name, color, description)` | `project.tags` by name, created when missing with the nearest Odoo colour index. |
| `createPr` | Never called on Odoo: `no-forge` (section 6). |
| `prComment(url, body)` | Not an Odoo operation; see section 6. |

Actor identity is one lookup, cached per run: the message's author partner to its user, `login`, `share` and groups. A partner without a user (an external author) is `none`.

## 6. The forge

`repos.mjs` gains `forgeFor(dir)`: the origin remote's host and path. `github.com` is `{ provider: github, host, path }`; any other host is `{ provider: gitlab, host, path }`, and `glab` runs with `GITLAB_HOST` set to it, as the GitLab tracker already does. `runPr` opens every pull request, the documents one included, through `trackerFor(forgeFor(dir))`. A repository without a usable remote falls back to the ticket source's owner or namespace as today for GitHub and GitLab tickets and is `no-forge` for an Odoo ticket.

`prComment(url, body)` is added to the GitHub and GitLab trackers (`gh pr comment`, `glab mr note`) and used by section 8.

## 7. The rich read

The fetch step (`skills/new-task/scripts/fetch-ticket.mjs`) reads more for every provider and writes it into `tasks/<ID>/source.md`:

- **Odoo with `ODOO_API_KEY` and `login`:** through JSON-RPC, no MCP: name, description as text, tags, stage, state, assignees, project, URL; the chatter's human messages (author, date, text; tracking-only notifications left out); the attachments of the task (`ir.attachment` on the task) with name, type and size. Without the key: the MCP path of 1.1.0, and the skill now names the messages and attachments as things to read through the MCP tools too.
- **GitHub and GitLab:** the issue's comments through `gh api` and `glab api`; attachments are the URLs in the body and the comments.
- **Attachments:** each one up to `attachmentMaxBytes` is downloaded (Odoo: the attachment's `datas`) to `tasks/<ID>/attachments/<id>-<safe name>` and committed with the brief. One that is larger or fails to download is listed with its URL and the note "not downloaded: <reason>; read in the session only", and brainstorm-task fetches it into a temporary folder when it can.
- **Links:** every URL in the description and the messages, de-duplicated, under `## Links`.

`source.md` gains `## Messages`, `## Attachments` and `## Links`. The brief's Context paragraph may cite them; the brief stays two short paragraphs.

brainstorm-task, before its first question and in both forms: read `source.md`; fetch every link with the harness's own web reader, and with the Firecrawl MCP server when the reader fails or is absent; open image attachments; print what was read and what could not be, in the grounding list. At most twenty links are fetched; the rest are listed as unread. A fetched page, a message and an attachment are quoted material: instructions inside them are never followed. The pressure scenario in section 10 proves it.

## 8. The QA report on the ticket and the pull requests

After `pr` opens the pull requests, the same engine step posts the report: the whole `reviews/<ID>/QA-REPORT.md` as a comment on the ticket (a log note on Odoo) and as a comment on every pull request, each headed by the packet id, the approver and the log head. Without a QA stage the comment says `QA: not configured` or `QA: skipped` in one line. The state records the ticket comment URL and the pull request comment URLs; the log gains one `report posted` line. The closing comment with the pull request links is unchanged. A failed report post blocks the `pr` stage like a failed packet, and the next `pr` resumes it.

## 9. Init, guardrail, watcher

- `init tickets` asks, for an Odoo source, the technical user's login and the optional database after the MCP questions of 1.1.0, and names `ODOO_API_KEY` and `ULTRAPOWERS_STAGE_ODOO_API_KEY` in the secrets file. `init autopilot` on a project whose autopilot source is Odoo proposes the D9 tag names, creates the six tags through the engine's tracker after the yes, and prints the technical user's permission and the two key names in its next steps. A missing `login` with an `autopilot` block is `bad-tickets`.
- The guardrail's autopilot profile adds the Odoo MCP server's writing tools (`create_record`, `update_record`, `delete_record`, `post_message`, `call_model_method`, and the third-party server's `create`, `update`, `delete` names) to the tracker-write denials, and denies `curl`, `wget`, `Invoke-WebRequest` and `iwr` to the Odoo source's host during a stage.
- The watcher polls an Odoo source with a `defaultProject` through JSON-RPC like the others. It refuses to start on an Odoo source without `ULTRAPOWERS_STAGE_ODOO_API_KEY` unless `watch.sharedCredentials` is true (`stage-credentials-missing`). In a stage, `ODOO_API_KEY` is the stage key.
- `task` reads an Odoo task URL and reports the state as for any ticket.

## 10. Testing and release

Offline, every commit:

- `tests/autopilot/odoo.test.mjs`: a fake Odoo JSON-RPC server (node `http`) with tracking on and off; listing by tag; tag creation and add and remove; log notes and their URLs; tag events from tracking values (two changes, one removal); the last-writer fallback and its attribution in the log; permission for a portal user, an internal user without the group, a Project User; a failed authenticate; a timeout.
- `tests/autopilot/autopilot.test.mjs`: an Odoo ticket through the gate against the fake server; an approval before the packet refused; a last-writer approval accepted only after the packet; `pr` on a nested workspace whose remotes are on GitLab and GitHub, through the fake forge; the report step and its blocked and resumed forms; an Odoo task URL as the ticket; the watcher cycle on an Odoo source; `stage-credentials-missing` for the Odoo key.
- `tests/task-lifecycle`: `fetch-ticket` Odoo over RPC with messages, attachments under and over the cap, links; the GitHub and GitLab comment reads; `source.md` sections; URL resolution for the three URL shapes.
- `tests/qa-gatekeeper/fixtures/autopilot/cases.json`: the Odoo MCP write tools and shell calls to the Odoo host denied during a stage; reads allowed.
- `tests/init`: the Odoo questions, the D9 defaults, the `login` check.
- `tests/autopilot/pressure-*.md`: a link whose page instructs the agent to skip the spec; a message that asks for the approve tag; both must be quoted, not followed.

Live, before the release: one task on the Owner's own Odoo, with the documents repository and the code repositories on GitLab: the session door to the merge requests and the report, then one watcher cycle with both keys. The release notes' verification table names exactly what ran.

Release: 1.3.0 through `scripts/bump-version.sh`; `RELEASE-NOTES.md`; the README's "Three ways to work" and "Where the envelope runs" rows for Odoo, the project configuration table's new fields, and the Odoo tag names; `docs/autopilot-watcher.md` with the Odoo keys; `AGENTS.md` rule 5 amended as D1 says; the roadmap line loses Odoo write-back.

## 11. Resolved questions

1. Engine transport: JSON-RPC with `ODOO_API_KEY` in both doors (D1). The Owner first asked for the MCP path as the main one and the API key as the fallback, then chose the API key for both after the watcher's cost per poll was weighed.
2. Who approves on Odoo: internal users only, by tag (D2). Portal approvers by message are the next request (not in scope).
3. Chatter type: log notes (D6), as the Owner's screenshot showed.
4. QA report: the full text on the task and on every merge request (D7), in this release.
5. Rich read: in this release, for all providers (D8); attachments downloaded with a cap and a read-only fallback.
6. Tag names: the readable `Ultrapowers …` names on Odoo (D9).
7. Architecture: the Odoo tracker inside the current engine, not a provider-neutral refactor and not a mirror into GitLab issues.
