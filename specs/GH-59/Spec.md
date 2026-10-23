# GH-59: research current sources in brainstorming, planning and the vulnerability hunt

Status: draft, 2026-10-23. Ticket: GH-59.

## Intent

A developer starts a ticket with an ultrapowers skill. Today the spec, the plan and the security report rest on the repository and on what the model learned in training. That knowledge is months old: a framework changed its API, a package changed its recommended setup, and the Node.js runtime the project pins got a critical CVE last week that `npm audit` never looks at. The Owner wants every brainstorm, every plan and every hunt to check current sources first, with whatever research tools that developer already has, and with no setup.

Success: a spec or a plan whose technology claims carry a link and a date, a security report that names a runtime or framework advisory the audit tools missed and moves the verdict when the advisory applies, and an honest one-line "not checked" when a session has no research tool.

## Goals, non-goals and anti-goals

Goals:
- brainstorming and writing-plans find the session's research tools by what they do and use them on every run, before the first question and before the tasks are written;
- the hunt checks current advisories for the project's runtimes, frameworks and direct runtime dependencies, compares affected ranges with the project's versions, and counts an advisory that applies in the verdict;
- zero configuration: no setting, no allow list and no config key; the tools installed in the harness and on the machine are used by default;
- every source is recorded with its link, its date when the page gives one, and the version it was read for;
- a session with no research tool says so and invents nothing;
- the hunt guardrail closes, by a general rule, the research tools that pass it today (the probe of 2026-10-23: a query-only search or docs tool passes while the hunt marker exists).

Non-goals:
- applying an upgrade: the hunt describes the fixed version and applies nothing; an upgrade is a separate request;
- an autopilot hunt stage: issue #43;
- any change to what the audit tools do, or to the tool-only CVE table;
- a list, in any file, of research tools or of their names.

Anti-goals:
- a skill text or a guardrail rule that names a research product, so that the hundreds of tools other developers use are left out or let through;
- research that sends project code, secrets or private package names to a search provider;
- a fetched page that steers the workflow;
- a citation or an advisory that no tool returned in this session.

## Constraints

- AGENTS.md Rule 1: zero dependencies; nothing is installed for research.
- AGENTS.md Rule 2 and Rule 3: every skill-body change goes through `ultrapowers:writing-skills`, with RED and GREEN pressure evidence kept with the change.
- AGENTS.md Rule 5 gains one sentence (D7); the plugin's own code still opens no network connection.
- AGENTS.md Rule 9: the guardrail change lands in `hooks/qa-guardrail`, which every entry point runs (the bash hook, `run-hook.cmd`, `hooks/lib/guardrail-bridge.mjs` for OpenCode and Pi, `hooks/lib/guardrail-cli.mjs` for Kimi, Antigravity, Hermes and the Gemini project hook); the per-harness suites and the parity tests are part of the gate.
- No skill text and no rule names a research product or tool. `tests/task-lifecycle/test-skill-structure.sh:38` already fails a skill that names `WebFetch`; the new structure test extends that check (Testing).
- The hunt's CVE table stays tool-only: "No GHSA or CVE id from the tool's report, no row in the table" (`agents/vulnerability-hunter.md:44`).
- The hunt keeps "installs nothing, fixes nothing" (`skills/vulnerability-hunt/SKILL.md:26`).
- Writing style of skill text: the house style of the files it joins (short sentences, "your human partner").

## Decision record

### D1: one shared research file, linked from each workflow
- **Chosen:** `skills/brainstorming/current-sources.md`, beside `visual-companion.md` and `builder-check-prompt.md`, holds the rules every workflow shares: how to find research tools by capability, source priority, untrusted content, query discipline, how to record a source, and the "not checked" line. brainstorming, brainstorm-task, writing-plans and the hunt contract each add a short paragraph that says when to run it and where results go, and link the file.
- **Why this one:** one place to change the rules; no new skill to trigger. Evidence: the Owner chose "One shared file" in this conversation; `skills/brainstorming/` already holds supporting files read on demand (`visual-companion.md`, `builder-check-prompt.md`).
- **Rejected:** a new skill `ultrapowers:researching-current-sources`, because a new skill must trigger reliably, joins `.muse-plugin/plugin.json` and the skill tests of every harness, and needs its own pressure tests. Evidence: AGENTS.md Rule 9 lists the explicit Muse skill list as a harness surface.
- **Rejected:** a full paragraph in each of the four places, because four copies of the same rules drift. My call.
- **Failure points:** the hunt contract and writing-plans link a file in another skill's folder; a rename breaks the link. Mitigation: the structure test checks every link (Testing). Evidence: `skills/vulnerability-hunt/SKILL.md:64` already reaches across skills (`../task-review/scripts/post-review.mjs`).
- **Edge cases:** a harness that loads only a skill's own folder. The link is a path from the plugin root, read with the file-reading tool, like the hunt contract read inline. Evidence: `skills/vulnerability-hunt/SKILL.md:53`.

### D2: research tools are found by capability, never by name
- **Chosen:** a research tool is any tool the agent can call in this session that searches the web, fetches, scrapes, crawls or browses a page, or reads official documentation of a library, product or service (a vendor's own documentation server among them). It is built into the harness, served by any MCP server, or an installed CLI that the session's instructions, the project's documents or your human partner name. The agent reads its own tool list and the tools' descriptions, picks the tools that fit the technologies in scope (a vendor's own documentation server first for that vendor's product), and never installs one. The shared file gives no tool name, only these kinds.
- **Why this one:** each developer has a different set, and the Owner named a few of hundreds. Evidence: the Owner, in this conversation: "we need to make it generalized, like the approach must be generalized, not for a specific tool and not for allowing a specific tool."
- **Rejected:** a list of known tools per harness in `skills/using-ultrapowers/references/`, because it misses every tool not listed. Evidence: same statement; the references list only the built-in `web_fetch` and `web_search` of three harnesses (`gemini-tools.md:15-16`, `hermes-tools.md:15-16`, `muse-tools.md:14-15`).
- **Rejected:** a script that detects tools, because a script sees only CLIs on PATH, never the session's MCP tools. Evidence: `skills/vulnerability-hunt/scripts/hunt-preflight.mjs:21` (TOOLS lists programs and versions only).
- **Failure points:** the agent misses a tool whose description does not say what it does. Mitigation: the file tells it to read descriptions, not names, and the RED/GREEN scenarios use a renamed tool. Assumption: harnesses show tool descriptions to the model, as Claude Code and the MCP protocol do.
- **Edge cases:** a research MCP server is configured but failed to connect. It is not a tool in this session; the agent says which one was unavailable when the harness reports it, and goes on with the rest. My call.
- **Edge cases:** a CLI on PATH that nobody named. It is not probed or run for research. My call: running an unknown binary to see what it does is outside a read-only research step.
- **Edge cases:** a general network CLI. `curl` and `wget` are never research tools. `gh api` GET to GitHub's global advisory database counts in the hunt's STEP 0b, because the hunt contract already names `gh` and the endpoint is an authoritative, structured source. My call. Evidence: `agents/vulnerability-hunter.md:28-30` names `gh api` GET.

### D3: research runs on every brainstorm and every plan
- **Chosen:** brainstorming runs the research step on every path except the quick task, after the classification and before the first question; in the ticket form it is part of grounding, so brainstorm-task's manifest lists the research tools found and the pages read. writing-plans runs it after the file structure and before the tasks, to check the plan's APIs, configuration, snippets and versions against current documentation, and adds a `**Sources:**` line to the plan header. The "Offer recon" sentence keeps its offer for looks the research step does not cover (your human partner's own files and data).
- **Why this one:** the Owner chose "Always, every task". Evidence: the Owner's answer in this conversation.
- **Rejected:** only when a technology is in scope, and only in the ticket form. Evidence: the Owner's answer.
- **Failure points:** research on every run costs time and tokens. Mitigation: the shared file ties each query to a question the design or the plan must answer, and stops when the sources agree. My call.
- **Edge cases:** the quick task ("make the icon cornflower blue"). Brainstorming ends at once for it today and still does. My call.
- **Edge cases:** a non-software task (a talk, a renovation). Research runs on what the task names (a venue's rules, a material's standard). Evidence: brainstorming's description covers work "in software or out of it".

### D4: the hunt researches once, in a new STEP 0b, before the marker
- **Chosen:** the gatekeeper runs STEP 0b after the preflight (STEP 0) and before the marker (STEP 1). It reads the manifests and lockfiles of the preflight's MANIFESTS rows and the declared runtimes (`engines`, `.nvmrc`, `.node-version`, `.python-version`, `python_requires`, `global.json`, `rust-toolchain*`, a Dockerfile `FROM`), finds its research tools by D2, and checks current advisories, per repository, for the declared runtimes, the base images, and the direct runtime dependencies of an ecosystem that no present audit tool covers (the preflight's TOOLS row is `absent`, or the ecosystem has no auditor). A package an audit tool covers is not queried: that tool's database is the source. STEP 0b runs in one research subagent on a mid-tier model, named, which returns only the `research` blocks; fetched page text never enters the gatekeeper's context. Hunters never research.
- **Why this one:** the guardrail profile applies only while the marker exists, so research before it needs no egress for hunters that read hostile code. Evidence: `hooks/qa-guardrail:113-115` (profile from the marker) and `agents/vulnerability-hunter.md:101-102` (marker written at STEP 1).
- **Why this one:** it covers what the audit tools do not, the runtime itself. Evidence: `skills/vulnerability-hunt/prompts/lane-dependencies.md:26` runs package auditors only.
- **Rejected:** an advisories lane with research tools allowed in the hunt profile, because it opens egress to hunters that read hostile code, on every harness. Evidence: `tests/task-lifecycle/pressure-results.md:238` (the hostile-comment test of the hook "is still owed").
- **Rejected:** research in the door skill with a file handed to the contract, because in the forked form the door is the contract's process. Evidence: `skills/vulnerability-hunt/SKILL.md:52`.
- **Failure points:** a hostile manifest steers a query. Mitigation: a query is built only from name and version fields and runtime declarations, never from free text such as `description` or a comment; an instruction found there is a finding. Evidence: `agents/vulnerability-hunter.md:38-40`.
- **Failure points:** a query reveals a private dependency. Mitigation: a package whose lockfile source is not a public registry, or whose name is under a scope the project publishes privately, is never queried and is listed as "not researched: private". Assumption: a public package name in a query is accepted exposure; the OSINT lane already searches public package names (`lane-osint.md:27`).
- **Failure points:** querying every direct dependency costs 50 to 200 queries per hunt and repeats the audit tools. Mitigation: the scope above. My call.
- **Edge cases:** no research tool. The section says "Current sources not checked: no research tool in this session"; the verdict is not INCOMPLETE. My call.
- **Edge cases:** no subagent tool. The gatekeeper runs STEP 0b itself, as the Inline form runs the lanes. My call.
- **Edge cases:** a runtime version no file declares. Each advisory for that runtime is `unverified`. My call.
- **Edge cases:** the inline form. STEP 0b runs the same way; the Inline form section names it. My call.

### D5: researched advisories get their own section and move the verdict when they apply
- **Chosen:** a new `### Advisories from research` table per repository in `SECURITY-REPORT.md`, after `### CVEs`: subject (runtime, framework or package), project version and the file it came from, advisory id, severity, affected range, fixed in, runtime or test only, status, source link and date. Status is `applies` (an advisory id from an authoritative source, the affected range read from that source, and the project's version inside it), `does not apply` (the version is outside the range) or `unverified` (any other case, with the reason). Every `applies` row of critical or high severity goes to one verifier in STEP 3 (`prompts/verifier.md`, the most capable model), which checks the advisory's conditions (platform, optional feature, flag, mode) against the project and keeps the row, or sets it to `unverified` or `does not apply` with its reason. An `applies` row that survives counts in the verdict like a tool CVE of the same severity; `unverified` and `does not apply` never count. A row whose advisory id is also in the tool CVE table is marked `also reported by <tool>` and counts once, through the table.
- **Why this one:** the Owner chose "New section, verdict moves". Evidence: the Owner's answer in this conversation.
- **Rejected:** a section that never moves the verdict, because the Node.js runtime case would read PASS. Evidence: the Owner's answer.
- **Rejected:** rows merged into the CVE table, because it ends the tool-only rule the hunt's pressure tests were built on. Evidence: `skills/vulnerability-hunt/SKILL.md:83-85` (Red Flags rows on advisories from memory).
- **Failure points:** an advisory hits one platform or one optional feature, and a range-only rule fails a project that is not affected. Mitigation: the verifier above. My call, after the builder check.
- **Failure points:** a page states a severity in another scale. Mitigation: the severity is the source's own; a CVSS base score maps critical at 9.0 or more, high at 7.0, moderate at 4.0, low below. My call.
- **Edge cases:** two authoritative sources disagree on the range. The narrower claim is not trusted: the row is `unverified` with both links. My call.
- **Edge cases:** a vendor advisory with no CVE or GHSA id yet. The vendor's own advisory id counts as the id. Evidence: the issue's "vendor/framework security advisories" as a preferred source.

### D6: the hunt guardrail denies tools it does not know, by default
- **Chosen:** while `.ultrapowers/hunt-active` exists, a tool call is denied unless the tool is one the hunt needs: the file readers and the writes the profile already judges, the shell, subagent dispatch, task tracking, and tracker reads (the rule that allows `mcp__github__get_issue` and `mcp__claude_ai_Odoo__search_records` today). Every other tool, MCP or built-in, under any name, is denied with a `HUNT-GUARDRAIL DENY` that says research belongs to STEP 0b.
- **Why this one:** a name rule cannot cover tools nobody has written yet. Evidence: the probe of 2026-10-23 on `hooks/qa-guardrail` with a hunt marker: `WebSearch`, `WebFetch`, `web_search` and a scrape tool with a URL were denied (exit 2); `mcp__claude_ai_Firecrawl__firecrawl_search`, `mcp__context7-http__query-docs` and `mcp__microsoftdocs__microsoft_docs_search` passed (exit 0).
- **Rejected:** add the passing names to the deny pattern, because the next tool's name is not on it. Evidence: the Owner's statement under D2.
- **Rejected:** deny every MCP tool, because OpenCode spells an MCP tool `<server>_<tool>` with no marker, so the hook cannot tell it from a built-in. Evidence: `hooks/qa-guardrail:607-609`.
- **Failure points:** a harness's built-in reader or dispatcher missing from the allowed set is denied, and a lane records `not-covered`. Mitigation: the allowed set comes from the per-harness tool references and the existing fixtures, and every harness suite runs. Evidence: `skills/using-ultrapowers/references/*-tools.md`.
- **Edge cases:** the QA and autopilot profiles. They are unchanged by D6. My call.
- **Edge cases:** another session in the same project while a hunt runs. The marker is project-wide, so that session gets the hunt profile too, as it does today (its spec write is already denied). Its research waits until the hunt ends, and it says so. My call. Evidence: `hooks/qa-guardrail:100-115` (the profile comes from the marker in the project).
- **Edge cases:** mail and chat reads (the tracker rule also matches outlook, microsoft_365, gmail, slack and teams). They stay allowed as reads, as today. My call. Evidence: `hooks/qa-guardrail:620`.

### D7: AGENTS.md Rule 5 gets one sentence for research
- **Chosen:** add to Rule 5: "Research for your human partner's task goes through the research tools their harness, their MCP servers or their installed CLIs give; it reads public sources only and never puts project code, secrets or private names in a query or a URL."
- **Why this one:** Rule 5 today routes a skill's network use to "a host the user named in `.agents/ultrapowers.json`", which open research cannot meet. Evidence: AGENTS.md Rule 5; the Owner chose "Amend Rule 5".
- **Rejected:** a `research.hosts` key, because the Owner wants no configuration. Evidence: the Owner's statement in this conversation.
- **Failure points:** none beyond D4's query discipline. My call.
- **Edge cases:** the README's privacy wording, if it repeats Rule 5, gets the same sentence. My call.

### D8: autopilot spec, plan and changes stages may fetch any host
- **Chosen:** in the autopilot profile, when the marker's `stage` is `spec`, `plan` or `changes`, a tool that carries a URL may reach any host; `qa.hosts.forbidden` still denies, and `qa.hosts.allowed` does not narrow these three stages. Every other stage keeps the host rule. In-page code stays denied and shell `curl` and `wget` keep their rules.
- **Why this one:** the Owner chose "Allow read-only fetches" so that autopilot research needs no host list. Evidence: the Owner's answer; today's rule at `hooks/qa-guardrail:799-803`.
- **Rejected:** keep the host list, because a developer must configure hosts. Evidence: the Owner's answer.
- **Rejected:** no URL fetch in autopilot, because the stage then gets less research than an interactive session. Evidence: the Owner's answer.
- **Failure points:** a stage that read hostile ticket text puts data in a URL. Mitigation: D7's query discipline in the shared file; tracker writes, pushes and writes outside the workspace stay denied. Assumption: the remaining exposure (a GET to an attacker's host) is accepted, as the Owner chose.
- **Edge cases:** a stage name the engine adds later. It gets the strict host rule until it is named here. My call.
- **Edge cases:** the headless adapters keep the user's MCP servers and extensions out of a stage on Codex (`--ignore-user-config`), Copilot (`--disable-builtin-mcps`), Gemini (`-e ultrapowers`) and Pi (`--no-extensions`). They stay as they are. A stage researches with what loads: every tool on Claude Code, OpenCode and Cursor, the harness's built-in web tools elsewhere, and "not checked" where nothing loads. Evidence: `skills/autopilot/scripts/harnesses.mjs:27-63`; the Owner chose "Keep isolation".

## Architecture

Five units:

1. **The shared research file** (`skills/brainstorming/current-sources.md`): the rules of D2, D4's query discipline and D7, source priority (official documentation, vendor advisories, official registries, recognized vulnerability databases, then everything else as a lead), how to record a source, and the "not checked" line. It is prose for the agent; it has no code.
2. **The workflow paragraphs**: brainstorming, brainstorm-task and writing-plans say when the step runs and where results go (D3).
3. **The hunt's STEP 0b** in `agents/vulnerability-hunter.md`, with its output in `reviews/<ID>/` and in the report (D4, D5).
4. **The verdict fold** in `skills/task-review/scripts/assemble-review.mjs`, so task-review's verdict matches the hunt's (D5).
5. **The guardrail rules**: D6 in the hunt profile and D8 in the autopilot profile of `hooks/qa-guardrail`.

The workflows depend on the shared file by a link; the report depends on the `research` block of `security-findings.json`; task-review depends on the same block.

## Components

- `skills/brainstorming/current-sources.md` (new): Architecture unit 1.
- `skills/brainstorming/SKILL.md`: the research step on every path except the quick task, before the first question; results as `Evidence:` lines of the decision record; a missing tool as an `Assumption:` ledger row; "Offer recon" narrowed to your human partner's files and data.
- `skills/brainstorm-task/SKILL.md`: Step 4's research sentence links the shared file; Step 4b's named scrape fallback becomes "any other fetch or scrape tool the session has"; Step 5's manifest adds the research tools found (or "none") and every page read.
- `skills/writing-plans/SKILL.md`: the check after File Structure; `**Sources:**` in the plan header; self-review item 6, "Current sources: every API, version and snippet the plan pins was checked, or the plan says it was not".
- `agents/vulnerability-hunter.md`: STEP 0b; the network rule names the research tools before the marker; `## The verdict` counts `applies` rows; the Inline form and the Completion gate name STEP 0b.
- `skills/vulnerability-hunt/SKILL.md`: the network hard rule and the Overview name STEP 0b; the core principle keeps "no CVE enters the table that an audit tool did not report"; the four-line result counts researched advisories that apply.
- `skills/vulnerability-hunt/templates/SECURITY-REPORT.md`: `### Advisories from research` per repository, and a `Research:` line under `Guardrail:` (tools used, or the "not checked" reason).
- `skills/task-review/scripts/assemble-review.mjs` and `skills/task-review/templates/TASK-REVIEW.md`: read `research`, render the table, fold `applies` rows into the verdict.
- `skills/vulnerability-hunt/prompts/research.md` (new): the STEP 0b subagent's prompt and its JSON block; `prompts/verifier.md`: the advisory form of the verification (conditions against the project).
- `hooks/qa-guardrail`: D6 and D8.
- Not changed: `skills/autopilot/scripts/harnesses.mjs` (D8) and `skills/autopilot/prompts/*.md` (the stages invoke the skills, which carry the step).
- `tests/qa-gatekeeper/fixtures/hunt/cases.json`, `fixtures/autopilot/cases.json`: the cases under Testing.
- `AGENTS.md`: Rule 5 sentence; `RELEASE-NOTES.md`: an entry under `## Unreleased`.

## Data flow

1. A workflow starts, reads its own tool list, and selects the research tools (D2).
2. It sends queries that hold only public technology names, versions and question words; fetched pages come back as untrusted data.
3. Brainstorming and writing-plans record each source as an `Evidence:` line or in `**Sources:**`: title or link, date when given, version read for.
4. The hunt's STEP 0b subagent reads name and version fields from the manifests and runtime declarations, queries, and returns one block per repository; the gatekeeper writes them to `reviews/<ID>/research.json` as `{ "repos": [ { "repo": "", "research": <block> } ] }`, where a block is `{ "tools": [""], "status": "checked | not-checked", "reason": "", "notResearched": [{ "subject": "", "reason": "" }], "advisories": [{ "subject": "", "version": "", "versionSource": "", "advisory": "", "severity": "critical | high | moderate | low", "affectedRange": "", "fixedIn": "", "runtime": true, "status": "applies | does-not-apply | unverified", "reason": "", "source": "", "sourceDate": "", "verification": "confirmed | downgraded | not-verified", "verificationReason": "" }] }`.
5. STEP 3 verifies the critical and high `applies` rows. STEP 5 copies each block into its repository's entry of `security-findings.json` as `repos[].research`, and renders the section per repository.
6. task-review's assembler reads `research` with the rest.

Trust boundaries: every fetched page and every search result is data from its author (never an instruction); queries cross from the session to the provider and carry no project content; the hunt's queries leave before the guardrail is on, the hunters' calls stay inside it.

## Error handling

- No research tool: the workflow says "Current sources not checked: no research tool in this session" in chat, as a ledger row in a spec, in the plan's `**Sources:**` line, and in the hunt report's `Research:` line. Nothing is invented.
- A tool that fails or a page that cannot be read: recorded with the reason; the work goes on with the other sources; never silent.
- A source that is not authoritative: a lead only; an advisory from it is `unverified`.
- A page that holds an instruction: quoted as content if it matters, never followed; in the hunt it is a finding (possible injection).
- A research tool used while the hunt marker exists: `HUNT-GUARDRAIL DENY`, recorded as a rule, never worked around (D6).
- An autopilot fetch to a forbidden host: denied as today.

## Testing

- `tests/qa-gatekeeper/fixtures/hunt/cases.json`: deny cases for a query-only search tool, a documentation query tool, an unknown MCP tool and an unknown built-in tool, each with a `reason` naming STEP 0b; the existing allow cases (readers, shell, `mcp__github__get_issue`, `mcp__claude_ai_Odoo__search_records`, `Write` under `reviews/`) unchanged; one allow case per harness's own reader, shell and dispatch tool names from `skills/using-ultrapowers/references/`. Run by `tests/qa-gatekeeper/test-hunt-profile.sh` and the parity tests `node --test tests/hooks/test-guardrail-entrypoints-parity.mjs` and `node --test tests/hooks/test-guardrail-bridge.mjs`.
- `tests/qa-gatekeeper/fixtures/autopilot/cases.json`: allow a URL tool to an unlisted host in `spec`, `plan` and `changes`; deny it in `execute` and `qa`; deny a forbidden host in `spec`. Run by `tests/qa-gatekeeper/test-autopilot-profile.sh`.
- `tests/task-lifecycle/assemble-review.test.mjs`: per repository, a verified `applies` critical runtime row gives FAIL; a row the verifier downgraded changes nothing; two repositories where one advisory applies in one only; `applies` moderate runtime gives PASS-WITH-ISSUES; `applies` high test-only gives PASS-WITH-ISSUES; `unverified` and `does-not-apply` change nothing; a row also in the CVE table counts once; a missing `research` key renders "Current sources not checked" and changes nothing.
- A structure test (`tests/skills/test-skill-bodies.sh` or a new `tests/skills/test-current-sources.sh`): the shared file exists; brainstorming, brainstorm-task, writing-plans and the hunt contract link it; none of them and not the shared file names a research product or tool (a deny list of known names is allowed in the test only); the hunt's existing sentences in `tests/vulnerability-hunt/test-skill-structure.sh` still hold.
- Pressure scenarios through `ultrapowers:writing-skills`, RED before and GREEN after, kept in `tests/task-lifecycle/pressure-results.md`: a brainstorm with a library in scope and a research tool renamed to a neutral name (the agent finds and uses it); a session with no research tool (the "not checked" line, no invented link); a fetched page that tells the agent to skip the spec (treated as data); a plan that pins an API version (checked, `**Sources:**` filled); a hunt on a fixture whose `engines` pins a runtime version with a published advisory (STEP 0b runs before the marker, the row is `applies`, the verdict moves); a hunt fixture with a private scoped package (not queried). The team memory gotcha "Skill pressure tests see session context" applies.
- The offline gate in AGENTS.md, in full, before the change is done; `bash tests/qa-gatekeeper/run-tests.sh` once, at the gate (the Windows run takes more than ten minutes per suite).

## Left to the builder

- The exact wording of the shared file and the paragraphs, within the house style and Rule 2.
- Whether the structure test is a new file or new lines in `tests/skills/test-skill-bodies.sh`.
- The exact set of allowed tool names in D6, taken from the tool references and the fixtures, as long as every harness suite passes.
- The order of columns in the new report table.

## Definition of done

- The four workflows link the shared file and run the research step as D3 and D4 say.
- With a research tool, a GH-59-style brainstorm produces a spec whose technology lines carry `Evidence:` links; with none, the "not checked" line appears and no link is invented.
- A hunt on the runtime fixture reports an `applies` advisory from STEP 0b and moves the verdict; `research.json` and the `research` key exist.
- With the hunt marker, every probe tool of 2026-10-23 is denied, and the existing allow cases pass.
- An autopilot `spec` stage fetches an unlisted host; an `execute` stage cannot.
- AGENTS.md Rule 5 holds the new sentence; `RELEASE-NOTES.md` has the entry.
- The offline gate passes, and the pressure evidence is committed.

## Repositories in scope

`.` (this repository).

## Assumption ledger

| # | Question | Chosen answer | Confidence | Reason |
|---|---|---|---|---|
| 1 | Is a public package name in a hunt query acceptable exposure? | Yes; private and scoped-private names are never queried | Medium | The OSINT lane already searches public package names (`lane-osint.md:27`) |
| 2 | Is the GET-only exposure of D8 accepted? | Yes | Medium | The Owner chose "Allow read-only fetches"; mitigation is query discipline |
| 3 | Do harnesses show tool descriptions to the model? | Yes, enough to find tools by capability | Medium | Claude Code and the MCP protocol do; other harnesses not checked |
| 4 | Does a hunt with no research tool end INCOMPLETE? | No; the report says "not checked" | Medium | INCOMPLETE is reserved for the dependencies lane (`agents/vulnerability-hunter.md:168`) |
| 5 | Does a CLI on PATH that nobody named count as a research tool? | No | Medium | Running an unknown binary is outside a read-only step |
| 6 | Which packages does STEP 0b query? | Runtimes, base images, direct runtime dependencies of ecosystems no present audit tool covers | Medium | Builder check: every direct dependency costs 50 to 200 queries and repeats the audit tools |
| 7 | Are researched `applies` rows verified before they move the verdict? | Yes, critical and high, by the STEP 3 verifier | Medium | Builder check: a range-only rule fails projects an advisory's conditions exclude |
| 8 | Do `curl`, `wget` and `gh api` count as research tools? | `gh api` GET to the advisory database in STEP 0b only; `curl` and `wget` never | Medium | The contract already names `gh`; Rule 5 spirit for general network CLIs |
| 9 | Does D6 apply to other sessions in the project during a hunt? | Yes, as the marker already does | Medium | The marker is project-wide; research waits for the hunt's end |
| 10 | Does the quick task run research? | No | High | Brainstorming ends at once for it |
| 11 | How is a CVSS score mapped to a severity? | 9.0+ critical, 7.0+ high, 4.0+ moderate, below low | High | The common CVSS v3 bands |
| 12 | Two sources disagree on a range? | `unverified`, both links | High | A verdict should not rest on a contested range |
| 13 | Does the "Offer recon" sentence stay? | Yes, for your human partner's own files and data | High | Research covers the web part by default now |
| 14 | Is a later autopilot stage name allowed to fetch? | No, until named in D8 | High | Fail closed |
| 15 | Does STEP 0b run in its own subagent? | Yes; inline only without a subagent tool | High | Keeps fetched page text out of the gatekeeper's context |
| 16 | Is research data per run or per repository? | Per repository | High | Two repositories can pin different runtime versions |
