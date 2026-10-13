#!/usr/bin/env bash
# Checks every skills/*/SKILL.md for text that the harness rewrites or that leaks
# what it shows: Claude Code substitutes every argument placeholder and every
# positional token ($0 to $9) in a skill body, and an example that echoes a
# variable's value prints the secret it was meant to check.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
FAILURES=0

pass() { echo "  [PASS] $1"; }
fail() {
    echo "  [FAIL] $1"
    FAILURES=$((FAILURES + 1))
}

echo "=== Test: skill bodies ==="

for file in "$REPO_ROOT"/skills/*/SKILL.md; do
    name="$(basename "$(dirname "$file")")"

    # A second placeholder, in a sentence about the unsubstituted case, reads as
    # the argument value itself once the harness substitutes both.
    count="$({ grep -o '\$ARGUMENTS' "$file" || true; } | wc -l | tr -d ' ')"
    if [[ "$count" -le 1 ]]; then
        pass "$name writes the argument placeholder at most once"
    else
        fail "$name writes the argument placeholder at most once (found $count)"
    fi

    if ! grep -q '\$[0-9]' "$file"; then
        pass "$name has no positional token the harness would substitute"
    else
        fail "$name has no positional token the harness would substitute"
        grep -n '\$[0-9]' "$file" | sed 's/^/    /'
    fi

    if ! grep -Eq 'env \| grep|echo[^|;]*\$\{[A-Za-z_][A-Za-z0-9_]*:-[^}]' "$file"; then
        pass "$name has no example that prints a variable's value"
    else
        fail "$name has no example that prints a variable's value"
        grep -En 'env \| grep|echo[^|;]*\$\{[A-Za-z_][A-Za-z0-9_]*:-[^}]' "$file" | sed 's/^/    /'
    fi
done

echo ""
echo "=== Test: the ticket skills read everything on the ticket (spec 2026-10-05 §7) ==="
expect() {
    # $1 file, $2 pattern (grep -E), $3 description
    if grep -Eq "$2" "$REPO_ROOT/$1"; then pass "$3"; else fail "$3 ($1 lacks /$2/)"; fi
}
expect skills/brainstorm-task/SKILL.md '## Links' 'brainstorm-task reads the Links section of source.md'
expect skills/brainstorm-task/SKILL.md 'Firecrawl' 'brainstorm-task falls back to the Firecrawl MCP server'
expect skills/brainstorm-task/SKILL.md 'twenty' 'brainstorm-task caps the links it fetches at twenty'
expect skills/brainstorm-task/SKILL.md 'linked page says to skip' 'brainstorm-task has the Red Flags row for an instructing page'
expect skills/brainstorm-task/SKILL.md 'written as "not fetched" is never fetched, by any tool' 'brainstorm-task never fetches a link source.md marks not fetched'
expect skills/new-task/SKILL.md 'fetch-ticket.mjs" attachments' 'new-task runs the attachments command'
expect skills/new-task/SKILL.md '"via": "rpc"' 'new-task knows the rpc answer'
expect skills/new-task/SKILL.md 'asks me to add the approve' 'new-task has the Red Flags row for a message that asks for the approve tag'
expect skills/autopilot/SKILL.md 'no-credentials' 'autopilot names the no-credentials error'
expect skills/autopilot/SKILL.md 'no-forge' 'autopilot names the no-forge error'
expect skills/autopilot/SKILL.md 'Odoo' 'autopilot names Odoo'
expect skills/autopilot/prompts/scaffold.md 'attachments' 'the scaffold stage downloads the attachments'
expect skills/task/SKILL.md 'task URL' 'task accepts an Odoo task URL'

echo ""
echo "=== Test: the documents name Odoo as an autopilot tracker (spec 2026-10-05 D1, §9) ==="
expect AGENTS.md 'host of a ticket source the user configured' 'AGENTS.md rule 5 allows the engine its calls to a configured ticket source'
expect README.md 'ODOO_API_KEY' 'README lists the Odoo key'
expect README.md 'Ultrapowers Approve' 'README names the Odoo approve tag'
expect docs/autopilot-watcher.md 'ODOO_API_KEY' 'the watcher document lists the Odoo key'
expect docs/autopilot-watcher.md 'Project User' 'the watcher document names the Odoo group that may approve'
# Odoo has one key, ODOO_API_KEY, for the engine and the stages alike; no second variable anywhere.
for f in README.md docs/autopilot-watcher.md skills/init/scripts/init.mjs skills/autopilot/scripts/autopilot.mjs skills/init/autopilot.md skills/init/ticket-sources.md; do
    if grep -q 'ULTRAPOWERS_STAGE_ODOO_API_KEY' "$REPO_ROOT/$f"; then fail "$f names a second Odoo key; ODOO_API_KEY is the only one"; else pass "$f names no second Odoo key"; fi
done

echo ""
echo "=== Test: the vulnerability hunt door states its rules (spec 2026-10-11) ==="
expect skills/vulnerability-hunt/SKILL.md '^agent: vulnerability-hunter$' 'vulnerability-hunt forks into the vulnerability-hunter agent'
expect skills/vulnerability-hunt/SKILL.md 'usage: /ultrapowers:vulnerability-hunt \[ticket\] \[repo\.\.\.\] \[--full-audit\] \[--post\]' 'vulnerability-hunt prints its usage line'
expect skills/vulnerability-hunt/SKILL.md 'Running the hunt contract inline: this harness does not fork' 'vulnerability-hunt announces the inline contract'
expect skills/vulnerability-hunt/SKILL.md '[Tt]here is no network in this review' 'vulnerability-hunt has the Red Flags row for an assumed absent network'
expect skills/vulnerability-hunt/SKILL.md 'CI already runs `npm audit`' 'vulnerability-hunt has the Red Flags row for a scanner elsewhere'
expect skills/vulnerability-hunt/SKILL.md '[Nn]o manifest, so the lane failed' 'vulnerability-hunt has the Red Flags row for a missing manifest'

echo ""
echo "=== Test: executing-plans leaves no background task running at hand-back (issue #40) ==="
expect skills/executing-plans/SKILL.md 'moved to the background' 'executing-plans rules on a call the harness moved to the background'
expect skills/executing-plans/SKILL.md 'waiting on input' 'executing-plans names the interpreter waiting on stdin'
expect skills/executing-plans/SKILL.md 'stop every background task' 'executing-plans stops its background tasks before the final message'
expect skills/executing-plans/SKILL.md 'could not stop' 'executing-plans names in the final message a task it could not stop'
expect skills/executing-plans/SKILL.md '"The call moved to the background' 'executing-plans has the rationalization row for a backgrounded call'
echo "=== Test: executing-plans runs the task's test command once, inside task-done (#39) ==="
# An executor ran a ten-minute suite set twice per task: once itself, to prove
# the completion contract before the ledger line, and once more through
# task-done, which is that run. The contract must not ask for a run that
# task-done makes.
expect skills/executing-plans/SKILL.md 'Do not run the task.s test command yourself before .task-done.' 'executing-plans tells the executor not to run the task command before task-done'
expect skills/executing-plans/SKILL.md 'then task-done to record it' 'executing-plans has the rationalization row for the run-then-record habit'
if grep -Eq 'The final test run for the task passed' "$REPO_ROOT/skills/executing-plans/SKILL.md"; then
    fail 'executing-plans no longer lists a passed final run as a precondition of the ledger line'
else
    pass 'executing-plans no longer lists a passed final run as a precondition of the ledger line'
fi

echo ""
echo "=== Test: the rebuilt brainstorming skill (upstream 7.0.0 port) and what it keeps ==="
B=skills/brainstorming/SKILL.md
expect $B 'skip the questions' 'brainstorming offers to skip the questions in the first message'
expect $B 'One open question|one open question' 'brainstorming asks one open question first'
expect $B 'short menu only when'  'brainstorming offers a menu only when stuck'
expect $B 'about 200-300 words' 'brainstorming plays each part back in 200-300 words'
expect $B 'builder-check-prompt.md' 'brainstorming dispatches the builder check'
expect $B 'How it gets made' 'brainstorming asks which how-it-gets-made choices are theirs'
expect $B 'This holds even when they skip the questions' 'the how-it-gets-made question survives a skipped conversation'
expect $B '## Autopilot form' 'brainstorming keeps the Autopilot form section'
expect $B 'Assumption' 'brainstorming keeps the assumption ledger'
expect $B 'Repositories in scope' 'brainstorming keeps the Repositories in scope section'
expect $B 'Three Paths' 'brainstorming keeps the three paths'
expect $B 'The ratchet is' 'brainstorming keeps the one-way ratchet'
expect $B 'human partner' 'brainstorming keeps the human partner voice'
expect $B 'ultrapowers:brainstorm-task' 'brainstorming names its ticket caller'
expect $B 'writing-plans' 'brainstorming hands off to writing-plans'
expect $B 'visual-companion.md' 'brainstorming points at the visual companion guide'
if grep -Eqi 'token-intensive|token cost' "$REPO_ROOT/$B"; then fail 'brainstorming no longer warns about the companion token cost'; else pass 'brainstorming no longer warns about the companion token cost'; fi
if [[ -f "$REPO_ROOT/skills/brainstorming/builder-check-prompt.md" && ! -e "$REPO_ROOT/skills/brainstorming/spec-document-reviewer-prompt.md" ]]; then pass 'the builder check replaces the spec-document reviewer prompt'; else fail 'the builder check replaces the spec-document reviewer prompt'; fi

echo ""
echo "=== Test: the spec template and the decision record (spec 2026-10-12) ==="
expect $B '[-][-]print-template' 'brainstorming finds the spec template with --print-template'
expect $B 'Failure points' 'brainstorming asks for the failure points of the recommended approach'
expect $B 'Edge cases' 'brainstorming asks for the edge cases of the recommended approach'
expect $B 'Evidence:' 'brainstorming names the evidence tag'
expect $B 'theirs' 'brainstorming sorts uncovered template questions into theirs'
expect $B 'check-doc.mjs' 'brainstorming runs the checker in the self-review'
expect $B 'fill the section so the checker passes' 'brainstorming has the Red Flags row for filling to pass'
expect $B 'The template asks it' 'brainstorming has the Red Flags row for over-asking'
expect $B 'the others are obviously worse' 'brainstorming has the Red Flags row for a single approach'
if grep -q 'only when it helps them decide' "$REPO_ROOT/$B"; then fail 'brainstorming no longer shows the comparison only when it helps'; else pass 'brainstorming no longer shows the comparison only when it helps'; fi
expect skills/brainstorm-task/SKILL.md 'SPEC-CHECK-FAILED' 'brainstorm-task names the failed spec check'
expect skills/autopilot/prompts/spec.md 'spec template' 'the spec stage prompt names the template'
expect skills/init/SKILL.md 'spec check' 'init names the spec check among the reasons for Node'
T=templates/specs/_template/Spec.md.tmpl
expect $T '^## Decision record$' 'the payload template carries the decision record'
if [[ "$(grep -c '^## ' "$REPO_ROOT/$T")" -eq 13 ]]; then pass 'the payload template has thirteen sections'; else fail 'the payload template has thirteen sections'; fi
echo ""
echo "=== Test: the ticket route reaches the review gate (spec 2026-10-13) ==="
U=skills/using-ultrapowers/SKILL.md
expect $U '^## The Ticket Route$' 'using-ultrapowers carries the ticket route'
expect $U 'task-review \(code review, vulnerability hunt, QA gate: one verdict\)' 'the route names task-review as the gate'
expect $U 'checks for the task-review verdict first' 'the route sends a merge or a pull request through the finishing skill'
for f in skills/executing-plans/SKILL.md skills/subagent-driven-development/SKILL.md; do
    expect $f 'Ticket form: .agents/ultrapowers.json and a known ticket id\?' "$f asks for the ticket form in its flowchart"
    expect $f 'use ultrapowers:task-review' "$f hands off to task-review"
    expect $f 'they are not that gate' "$f says the per-task reviews are not the gate"
    expect $f 'Using ultrapowers:task-review for <ID>, then ultrapowers:finishing-a-development-branch' "$f ends its example with task-review then the finish"
    expect $f 'whole-ticket review is a repeat' "$f has the rationalization row for a repeated review"
    if grep -q '^Use ultrapowers:finishing-a-development-branch. In the autopilot form' "$REPO_ROOT/$f"; then fail "$f still opens its Finish paragraph with the finishing skill alone"; else pass "$f no longer opens its Finish paragraph with the finishing skill alone"; fi
done
F=skills/finishing-a-development-branch/SKILL.md
expect $F '^## Step 1b: Verify the Review Gate$' 'finishing has Step 1b'
expect $F 'Verify the review gate' 'finishing names the gate in its core principle'
expect $F 'reviews/<ID>/TASK-REVIEW.md' 'finishing reads the review report'
expect $F 'first twelve characters' 'finishing compares the reviewed head'
expect $F 'The verdict informs the integration decision; it never makes it' 'finishing keeps the decision with the partner'
expect $F 'skip the gate, in so many words' 'finishing skips only on an explicit instruction'
expect $F 'Push and create a draft Pull Request' 'finishing renames option 2 on FAIL or BLOCKED'
expect $F 'gh pr create --draft' 'finishing names the GitHub draft flag'
expect $F 'glab mr create --draft' 'finishing names the GitLab draft flag'
expect $F 'quotes the `Verdict:` line' 'finishing quotes the verdict in the pull request'
expect $F 'whole-ticket gate is done' 'finishing has the rationalization row for per-task reviews'
expect $F 'A hurry is not an instruction to skip' 'finishing has the rationalization row for a hurry'
expect $F 'A report for another head reviewed other code' 'finishing has the rationalization row for a stale report'
expect skills/task-review/SKILL.md '^description: Use when a ticket.s implementation is complete, before its branch is merged or opened as a pull request' 'task-review triggers before the finish'
expect skills/task-review/SKILL.md 'next step on the ticket route' 'task-review names the finishing skill as the next step'
expect skills/task/SKILL.md 'at the review gate' 'task reports the review gate as the next step'
expect README.md 'runs it for you as its last part' 'README says task-review includes the QA gate'
expect README.md 'shows the verdict above its menu' 'README says the finishing skill shows the verdict'
expect RELEASE-NOTES.md 'The ticket route and the review gate' 'the release notes carry the section'
echo ""
if [[ "$FAILURES" -ne 0 ]]; then
    echo "FAILED: $FAILURES assertion(s)."
    exit 1
fi
echo "PASS"
