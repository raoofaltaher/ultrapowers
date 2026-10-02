# Ticket sources

Read from the init skill's Ticket sources section. Ticket sources let `/ultrapowers:new-task <PREFIX>-<project>-<number>` fill the brief from the ticket.

## Questions

One question per message; use multiple choice where the harness has it.

1. Providers: any of GitHub, GitLab, Odoo; or none, which keeps local tickets only.
2. Per provider: its prefix (default `GH`, `GL`, `ODOO`); where its tickets live (GitHub owner; GitLab host, default `gitlab.com`, and group path; Odoo URL); a default project, optional.
3. Only when `repos` is not empty: any clone whose provider path is not `<owner or group>/<clone name>`, for `projects`.
4. Transport: `auto` (default: the CLI when installed and signed in, else the MCP server), `cli` or `mcp`.
5. Odoo only, always: the team's MCP server URL. Propose `https://<Odoo host>/mcp` from its URL and let your human partner confirm or replace it. Then how it signs in: a token header (`Authorization: Bearer`, the default, or a header that carries the key alone, such as `X-Api-Key`) or browser sign-in.

## The sources file

Write the answers as one JSON object to a file outside the project (your temp or scratch directory):

```json
{ "transport": "auto", "sources": [
  { "prefix": "GL", "provider": "gitlab", "host": "gitlab.com", "namespace": "acme/platform", "defaultProject": "tracker" },
  { "prefix": "GH", "provider": "github", "owner": "acme" },
  { "prefix": "ODOO", "provider": "odoo", "url": "https://erp.example.com", "mcpUrl": "https://erp.example.com/mcp", "mcpHeader": "Authorization: Bearer" } ] }
```

Leave out every field your human partner did not give; `mcpHeader` only for a token header. `{ "sources": [] }` removes configured sources.

## Writing it

In scaffold mode the file goes to the scaffold dry run as `--sources <file>`. In a scaffolded project:

1. Dry run: `node "<SKILL_DIR>/scripts/init.mjs" tickets --root "<ROOT>" --sources "<file>" --dry-run`
2. Show `marker.after`, each `mcp` entry (`created`, or `proposal`: the file stays as it is and the new version lands beside it as `<path>.ultrapowers-new`) and `secrets` (variable names only). Ask: "Write these changes? (yes / no)". Only an explicit yes continues.
3. Run the same command without `--dry-run`. Relay `nextSteps` verbatim; for each proposal, merge with your human partner as in upgrade step 5.

GitLab's MCP server signs in in the browser; a headless run needs `glab` with `GITLAB_TOKEN`.

## Red Flags

| Thought | Reality |
|---------|---------|
| "A proposal is in the way, I'll merge or delete it to continue" | `proposal-exists` means stop. Merge it with your human partner first, then run again. |
| "The Odoo server is surely at /mcp" | Propose it, then ask. The team names its own server and how it signs in. |
| "They named the provider, so the rest can be my guesses" | Every field comes from an answer. Leave out what was not given; the engine names anything missing as `bad-tickets`. |
