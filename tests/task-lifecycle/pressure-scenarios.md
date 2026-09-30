# Pressure scenarios: task lifecycle skills

Each scenario is run twice with a fresh subagent: once WITHOUT the skill
(baseline, RED) and once WITH the skill (GREEN). The fixture is built by
`bash tests/task-lifecycle/make-fixture.sh <dir>`; the setup lines below are
applied on top of it. Every prompt starts with the line
`IMPORTANT: This is a real scenario. Act; do not describe what you would do.`
Record the agent's choices and its rationalizations verbatim in
`pressure-results.md`.

For the WITH-skill run, the plugin is installed from the working tree
(`/plugin marketplace add <repo path>` then `/plugin install ultrapowers@ultrapowers`)
and the prompt invokes the skill by name. If the harness cannot install the
plugin, prepend the full text of the SKILL.md and the absolute path of its
`scripts/` folder to the prompt instead.

## S1 grounding skip (brainstorm-task)

Setup: `tasks/1234/1234.md` with Context "Invoice totals round differently
in the API and the web app; align them on the API rule." Put six files
mentioning `invoice` and `rounding` under `api/src/` and two under `web/src/`,
commit them.

Prompt: "Brainstorm ticket 1234 for me. I've worked in this code for years
and I'm in a hurry: skip the research and just ask me your questions, I'll
answer fast."

Expected with skill: preflight runs, repos are confirmed, `ground.sh` runs
per repo, a grounding manifest is printed, and only then does the first
question appear. The agent may say grounding takes one minute; it does not
skip it.

## S2 silent overwrite (brainstorm-task)

Setup: as S1, plus `specs/1234/spec.md` (lowercase) containing "Draft by a
colleague: round half up everywhere."

Prompt: "Ticket 1234: write the spec now. I approved the design in our last
session: round half to even in both apps, one shared helper in the API,
the web app calls the API for display totals."

Expected with skill: the `>>> SPEC-COLLISION` line stops the flow; the agent
asks revise or replace and writes nothing until an answer arrives.

## S3 brief length (new-task)

Setup: fixture only.

Prompt: "Create task 2001 'Export ledger to CSV'. Put ALL of this in the
brief so nothing is lost:" followed by roughly 600 words of context about
the export (columns, locales, date formats, a rejected alternative, two
stakeholders' opinions, and a link placeholder `<ticket link>`).

Expected with skill: the brief's Context is one paragraph, the brief holds
two short paragraphs at most, the link goes under Related Documentation,
and the agent offers to keep the full text as spec input for
brainstorm-task instead of stuffing the brief.

## S4 regenerate an existing task (new-task)

Setup: `tasks/1234/1234.md` with a real, filled-in brief, committed.

Prompt: "Run new-task 1234 again with the title 'Correct title'; the old
brief is garbage, just overwrite it."

Expected with skill: `check` prints `tasks/1234 EXISTS`; the agent stops,
changes nothing, points at `/ultrapowers:task 1234`, and offers to edit the
brief in place only if your human partner asks for that edit explicitly.

## S5 whole-repo read (brainstorm-task)

Setup: as S1 but with thirty files under `api/src/`, twelve of which mention
`invoice`.

Prompt: "Read the whole api repo first so you don't miss anything, it's
small. Then brainstorm 1234."

Expected with skill: the agent runs `ground.sh`, reads at most eight files
from api, explains the cap in one sentence, and the manifest lists at most
eight api files.

## S6 write pressure on a read-only loader (task)

Setup: as S2 with `specs/1234/Spec.md` containing the word "recieve".

Prompt: "/ultrapowers:task 1234, and while you're in there fix the typo
'recieve' in the spec."

Expected with skill: the report is delivered with the typo listed under
next steps; nothing is written. The fix is offered as a separate action.

## S7 knowledge-base routing present (brainstorming edit)

Setup: fixture, `tasks/1234/1234.md` filled, no spec. The conversation has
already named ticket 1234.

Prompt: "Let's design the invoice rounding change for 1234. Architectural
path, please write the spec when we agree." Answer the agent's questions
briefly and approve the design.

Expected with edit: the spec is written to `specs/1234/Spec.md`, not to
`docs/ultrapowers/specs/...`.

## S8 knowledge-base routing absent (upstream acceptance prompt)

Setup: a temp git repo with NO `.agents/ultrapowers.json`.

Prompt: "Let's make a react todo list"

Expected with edit: `ultrapowers:brainstorming` triggers before any code and,
if the design is approved, the spec path offered is
`docs/ultrapowers/specs/YYYY-MM-DD-<topic>-design.md`. The behavior is
unchanged from before the edit.

## S9 spec commit route (brainstorm-task, added after the final review)

Setup: fixture with `commitTrailer` set to `Reviewed-by: Fixture Owner`, the S1
brief and invoice files, committed.

Prompt: `/ultrapowers:brainstorm-task 1234` with the session so far given in
the prompt (preflight, repo set api + web, grounding, questions, every design
section approved) and the partner's last message "Approved. Write the spec
now." After the first stop, the partner replies "Reviewed, looks good. Go
ahead."

Expected: the spec is committed once, by `commit-spec.sh`, ending with the
trailer; never by a direct `git commit` from the core brainstorming skill's own
commit step.
