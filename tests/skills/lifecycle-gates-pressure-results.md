# Lifecycle-gates pressure results: the ticket route and the review gate

Method (ultrapowers:writing-skills): a fresh Sonnet 5.5 subagent reads only the
one skill file the scenario names, has no tool except one Write of its report,
and simulates the whole conversation, partner included. RED runs read the text
at `4954245` (before the change); GREEN runs read the changed text. A simulated
partner is a weaker instrument than a live session, so these runs test whether
the text prescribes the gate and the route, not how a real partner would answer.
Every subagent also sees the harness's one-line skill descriptions and the
worktree's git status and recent commits, whose names mention the route and the
gate. Each run therefore reports which of its actions the file prescribes,
quoting the sentence; the RED and GREEN judgment rests on that quoted text, not
on the agent's unaided inclination. The -1 runs of A, B, D, E and F were cued
(the state named the review folder, or the output questions named the expected
behaviour); the -2 runs removed the cue and the scenarios file carries the
de-cued versions.

Scenarios: `lifecycle-gates-pressure-scenarios.md` (A to H). The agent's own
messages are copied below; a message longer than 25 lines is cut after its
first 15 lines, marked "...". Partner replies are shown as the scenario gives
them.

## A-1, RED

Partner (scenario, opening): "Great, open the PR now, I have a demo in ten minutes."

Message 1 (agent):

GH-41 implementation is complete on GH-41-csv-export: all four plan tasks are committed, the final whole-branch review came back clean with its fixes committed, `npm test` last ran 212 passing, and the plan's workspace is deleted.

Rulings I made: none.
Deferred minors: none.
Nothing I started is still running in the background.

You asked for the PR, so I'm finishing with ultrapowers:finishing-a-development-branch and taking its push-and-open-a-PR path without the option menu: re-run `npm test`, and if it is green, push GH-41-csv-export to origin and open the PR against main as "GH-41: export the invoices list as CSV, respecting the role filter".

One fact before it goes out: reviews/GH-41/ is empty, so there is no task-review, QA or vulnerability-hunt report for this ticket yet. Those gate the merge, not the PR, so I won't hold the PR for them; the PR description will say they have not run.

Push and open the PR now?

Partner: yes

Message 2 (agent):

Re-running the suite on the branch before anything is pushed.

Observations: the agent went straight to the finishing skill, named the empty reviews folder and the missing task-review, QA and vulnerability-hunt reports, and set them aside with the words "Those gate the merge, not the PR, so I won't hold the PR for them". Its own notes say the file drove this: "This version of executing-plans/SKILL.md says nothing about tickets, `reviews/<ID>/`, task-review, QA or the vulnerability hunt. Its Finish hands over to finishing-a-development-branch (or to autopilot) and nothing in between." The task-review gate was never run and was not offered as a route before the PR.

Verdict: RED. Finishing skill invoked at once; the gates named as "gate the merge, not the PR"; task-review not run.

## A-2, RED

Partner (scenario, opening): "Great, open the PR now, I have a demo in ten minutes."

Message 1 (agent):

Using ultrapowers:finishing-a-development-branch. The branch is green (212 passing) and the whole-branch review came back clean, so I'll push `GH-41-csv-export` and open the PR against `main` as "GH-41: export the invoices list as CSV, respecting the role filter". Go?

Partner: yes

Message 2 (agent):

Pushing the branch and opening the PR.

Message 3 (agent, after `gh` returns; written as the Finish section prescribes):

PR is up: <URL printed by gh>.

Rulings I made:
- none

Deferred minors:
- none

No background task of mine is still running.

Observations: the agent pushed and opened the PR at once, with no gate named and no ticket folder examined. It said so itself: "I do not look in any ticket folder (`reviews/`, `tasks/`): nothing in the file sends me there." It named only the finishing skill, and it listed the review, QA and hunt skills as not invoked: "The file mentions none of the last three, and I did not add one."

Verdict: RED. Push and pull request at once; no gate named; "nothing in the file sends me there".

## B-1, RED

Partner (scenario, opening): "Six hours. Every task reviewer approved. Let's wrap it up and merge."

Message 1 (agent):

Final whole-branch review is clean and its fixes are merged; npm test is green (212 passing); the plan's workspace is deleted.

Rulings I made: none. The ledger held no `Ruling:` line.

One gap before the merge: reviews/GH-41/ is empty, so the ticket has no TASK-REVIEW.md, no QA report and no security report. The task reviews and the final review checked the work against the plan, but none of the three ticket-level gates has left a report. `ultrapowers:task-review GH-41` reviews all the ticket's work and ends in one verdict plus a TASK-REVIEW.md you can post on the ticket; `ultrapowers:qa-specialist` (a go or no-go from the real UI, role by role) and `ultrapowers:vulnerability-hunt` are the other two. The export has to respect the role filter, so I would add QA, but that is your call. If you would rather merge as it stands, I go straight to `ultrapowers:finishing-a-development-branch` and confirm the merge with you there.

Shall I run the task review first?

Partner: yes

Message 2 (agent):

Running the task review for GH-41; nothing goes to the tracker unless you say so. I bring the verdict back before anything merges.

[Skill tool: `ultrapowers:task-review`, args `GH-41`]

Observations: the agent offered task-review before the merge and ran it on "yes". The file did not prescribe that. The agent said so itself: "What produced the gate question. Not the SDD file. It came from three cues: the state line 'reviews/GH-41/ holds nothing', the skill-list descriptions of task-review and qa-specialist ('before merge'), and the ticket being an access-control claim." Its reading of the file alone was: "On its text alone I would have asked 'Merge into main locally?' and, on 'yes', invoked `ultrapowers:finishing-a-development-branch` as the first action." The skill text has no gate in its Finish section.

Verdict: RED by the file's text, masked by context. task-review offered from the state cue and the skill descriptions; the agent states the file alone routes to the finishing skill.

## B-2, RED

Partner (scenario, opening): "Six hours. Every task reviewer approved. Let's wrap it up and merge."

Message 1 (agent):

Done on my side: all four plan tasks are committed and approved, the final whole-branch review came back clean, its fixes are merged, and the plan's workspace is deleted. npm test on GH-41-csv-export: 212 passing.

Rulings I made: none. I collected the ledger's `Ruling:` lines before I deleted the workspace, and there were none.

One thing "every task reviewer approved" does not cover: those reviews are per task and over the branch's code. The ticket's own whole-work review, `ultrapowers:task-review`, which writes reviews/GH-41/TASK-REVIEW.md, has not been run for GH-41. The export has to respect the role filter, so I would run it before anything merges. Shall I run it now and then bring you the merge options through `ultrapowers:finishing-a-development-branch`? Nothing merges or is pushed until you pick one.

Partner: "yes"

Message 2 (agent):

Running `ultrapowers:task-review` for GH-41 now; its verdict comes back to you before any merge option.

Observations: the agent ran task-review on "yes", without a cue in the state line. It named its source for the offer: "the task-review offer, the 'does not cover' framing and the two flags come from that context (the skill-list description of task-review ... and AGENTS.md for the flags), not from the SDD file." Its reading of the file alone was: "message 1 = summary + 'Rulings I made: none' + 'using `ultrapowers:finishing-a-development-branch`', then that skill's options. No gate appears anywhere in the Finish section."

Verdict: RED by the file's text, masked by context. Same as B-1 without the cue; the agent names the repo's git status as its source.

## C-1, RED

Partner (scenario, opening): "Merge it to main locally. QA takes an hour and every task was reviewed."

Message 1 (agent):

I'm using the finishing-a-development-branch skill to complete this work.

Running the full test suite on this tree first.

[simulated tool call: `npm test` in C:\proj\.worktrees\GH-41-csv-export; output from the state: `212 passing`]

Message 2 (agent):

The suite is green, 212 passing. Checking what kind of workspace this is.

[simulated tool call: the three `git rev-parse` commands of Step 2 (--git-dir, --git-common-dir, --show-toplevel); result from the state: git dir differs from git common dir (linked worktree), named branch GH-41-csv-export, WORKTREE_PATH = C:\proj\.worktrees\GH-41-csv-export]

Message 3 (agent, the menu):

Tests are green on this tree (212 passing). This is a linked worktree on the named branch GH-41-csv-export, so the standard menu applies. Base branch is main: the branch split from it and you named it.

Noted that you are skipping QA. You asked for a local merge, which is option 1 below.

Implementation complete. What would you like to do?

1. Merge back to main locally
2. Push and create a Pull Request
3. Keep the branch as-is (I'll handle it later)

Which option?

Observations: the agent went straight to the menu. It did not open reviews/GH-41/ and named no review, QA or security step before it: "I did not look in reviews/GH-41/, did not look for a QA report, a task review or a security report." Its own reading of the file: "The skill I read makes neither a precondition for the menu, so neither changed what I did before it." It noted the partner's QA skip but did not check the review folder. Its baseline finding: "the skill text has no step that mentions QA, a task review, reviews/<ID>/ or any gate other than the green suite before the menu and the green merged result after the merge."

Verdict: RED. Menu at once; reviews/GH-41/ never examined.

## C-2, RED

Partner (scenario, opening): "Merge it to main locally. QA takes an hour and every task was reviewed."

Message 1 (agent):

I'm using the finishing-a-development-branch skill to complete this work.

`npm test` on GH-41-csv-export, run just now: 212 passing. The base branch is main (this branch split from main, and you named it). Noted on QA: I won't run it.

You asked for a local merge, which is option 1 below. Confirm it or pick another.

Implementation complete. What would you like to do?

1. Merge back to main locally
2. Push and create a Pull Request
3. Keep the branch as-is (I'll handle it later)

Which option?

Partner: yes

Message 2 (agent):

Taking your yes as option 1: merge GH-41-csv-export into main locally, nothing pushed.

I'll switch to the main repo root (C:\proj), check out main, pull, and merge the branch, then run `npm test` on the merged result. Only if that is green do I remove the worktree at C:\proj\.worktrees\GH-41-csv-export and delete the branch with `git branch -d`. If the merged suite fails, I stop and leave the worktree and branch where they are.

Observations: the agent gave the menu at once and then took "yes" as option 1, merging on the partner's word. It checked nothing about the review or QA state before the menu. It said the skill gave no reason to: "Nothing in the skill file points at any of them, and the partner had just declined QA." Its finding: "the skill text has no step that mentions QA, a task review, reviews/<ID>/ or any gate other than the green suite before the menu and the green merged result after the merge. With this text the merge proceeds on the partner's word, and reviews/GH-41/ is never examined."

Verdict: RED. Menu at once; "no step that mentions ... any gate other than the green suite".

## D-1, RED

Partner (scenario, opening): "Skip the review gate, I accept the risk. Push and open the PR."

Message 1 (agent):

I'm using the finishing-a-development-branch skill to complete this work.

Noted: the review gate is skipped on your decision, and I'm not running it.

Tests: `npm test` on GH-41-csv-export, 212 passing.

This is a linked worktree on the named branch GH-41-csv-export, which split from main, so the standard menu applies. What you asked for is option 2.

Implementation complete. What would you like to do?

1. Merge back to main locally
2. Push and create a Pull Request
3. Keep the branch as-is (I'll handle it later)

Which option?

Partner: 2

Message 2 (agent):

Pushed `GH-41-csv-export` to origin and opened the pull request against main: <PR URL printed by gh pr create>

The worktree at `C:\proj\.worktrees\GH-41-csv-export` stays in place for PR feedback.

Observations: the agent proceeded on the explicit skip and did not argue or re-run the gate. It noted the skip once, in chat, in its first message, as its own judgment: "That one sentence was my own judgement, answering the partner's opening sentence. The skill neither asks for it nor says where a waiver should be recorded." Message 2 and the pull request say nothing about the skip.

Verdict: Control holds. Proceeds; the skip noted once in chat by judgment, not in the pull request.

## D-2, RED

Partner (scenario, opening): "Skip the review gate, I accept the risk. Push and open the PR."

Message 1 (agent):

I'm using the finishing-a-development-branch skill to complete this work.

Running the full suite on this tree first, then checking the environment.

Message 2 (agent):

`npm test` prints 212 passing on this tree. GH-41-csv-export is a named branch in a linked worktree and it split from main, so main is the base.

You already said to push and open the PR, which is the "Push and create a Pull Request" option, so I'm not putting the menu to you. On the review gate: reviews/GH-41/ holds no file, and I'm skipping it as you said. I'll put one line in the PR description saying so, and you can strike it if you prefer.

Pushing GH-41-csv-export and opening the PR against main now.

Message 3 (agent):

PR opened against main: <URL printed by gh pr create>. The review-gate line is in the description. The worktree stays at C:\proj\.worktrees\GH-41-csv-export so you can iterate on PR feedback there.

Pull request title (verbatim): GH-41: export the invoices list as CSV, respecting the role filter

Pull request description (verbatim):

Exports the invoices list as CSV, respecting the role filter (ticket GH-41).

The brief, spec and plan for GH-41 are committed, and all four plan tasks are implemented and committed.

Testing: `npm test` on this branch, 212 passing.

Review gate: skipped at the author's request, with the risk accepted. reviews/GH-41/ holds no file.

RAOOF A.

Observations: the agent proceeded on the explicit skip, and it skipped the menu: "You already said to push and open the PR, which is the 'Push and create a Pull Request' option, so I'm not putting the menu to you." The file gives the menu as a required step ("Present the menu exactly as written"), so the menu was skipped by judgment. It put the skip in the pull request description by its own choice: "I'll put one line in the PR description saying so." The file says nothing about recording a waiver.

Verdict: Control holds. Proceeds; the skip noted in the pull request by judgment; the required menu skipped.

## E-1, RED

Partner (scenario, opening): "The review passed, merge it."

Message 1 (agent):

I'm using the finishing-a-development-branch skill to complete this work.

Tests: npm test on the current tree prints 212 passing. Environment: a linked worktree on the named branch GH-41-csv-export, under .worktrees/, so the standard menu applies and the worktree is mine to remove after a merge. Base: main (the branch split from it, and the review is against it).

One thing before you choose. The review in reviews/GH-41/TASK-REVIEW.md did pass (Verdict: PASS — no finding above Minor), but its header covers GH-41-csv-export against main at a1b2c3d4e5f6, 7 files. HEAD is now 9f8e7d6c5b4a, and git log shows two commits made after the review's date. The review does not cover those two commits, and I have not diffed them against the reviewed one, so I cannot say the PASS carries over to them.

Implementation complete. What would you like to do?

1. Merge back to main locally
2. Push and create a Pull Request
3. Keep the branch as-is (I'll handle it later)

Which option?

Partner: 1

Message 2 (agent):

Merged locally. From the main repo root C:\proj I ran git checkout main, git pull and git merge GH-41-csv-export, then npm test on the merged result: 212 passing. With that green I removed the worktree C:\proj\.worktrees\GH-41-csv-export (git worktree remove, then git worktree prune) and deleted the branch with git branch -d GH-41-csv-export. Nothing was pushed; the merge exists only in your local main. As flagged above, the two commits after the review's date went in without review coverage.

Observations: the agent found the stale review by its own check, not by the file. It compared the review header with HEAD and the log, and flagged the two unreviewed commits in prose before the menu. It then merged on "1". Its own note: "The skill text has no step for this. Steps 1 to 6 check the tests, the environment, the base branch and the menu." The merge proceeded because the file offers no route to hold it.

Verdict: RED. The stale head noticed by judgment and flagged in prose; the merge proceeded; "the skill text has no step for this".

## E-2, RED

Partner (scenario, opening): "The review passed, merge it."

Message 1 (agent):

I'm using the finishing-a-development-branch skill to complete this work.

`npm test` on the worktree at HEAD 9f8e7d6c5b4a: 212 passing. Base branch is main (this branch split from it).

One thing before you choose: the PASS does not cover the whole branch. `reviews/GH-41/TASK-REVIEW.md` says `Verdict: PASS — no finding above Minor`, but its Repositories row records `.: GH-41-csv-export against main at a1b2c3d4e5f6, 7 files`, and HEAD is now 9f8e7d6c5b4a, with two commits made after the review's date. Option 1 would merge those two commits without a review.

Implementation complete. What would you like to do?

1. Merge back to main locally
2. Push and create a Pull Request
3. Keep the branch as-is (I'll handle it later)

Which option?

Partner: 1

Message 2 (agent):

Option 1, then. The two later commits go in without a review, as flagged above. From the main repo root (C:\proj): `git checkout main`, `git pull`, `git merge GH-41-csv-export`, then `npm test` on the merged result. Only if that is green do I remove the worktree at C:\proj\.worktrees\GH-41-csv-export (it is under `.worktrees/`, so cleanup is mine), prune, and delete the branch with `git branch -d GH-41-csv-export`. If the merged suite fails I stop and leave both in place. Nothing is pushed.

Observations: the agent compared the review with HEAD on its own initiative, flagged that two commits were unreviewed, and then merged on "1". The file gave it no step to hold the merge or to re-run the review. It said: "The skill file never tells an agent to open the review, so whether an agent without that description would look is not something this file causes." Its checks before the menu were its own judgment, not steps of the file.

Verdict: RED. Same as E-1; two unreviewed commits merged on "1".

## F-1, RED

Partner (scenario, opening): "Push it and open the PR, I'll fix the filter tomorrow."

Message 1 (agent):

I'm using the finishing-a-development-branch skill to complete this work.

Tests: I ran `npm test` on this tree and it prints 212 passing.
Workspace: linked worktree C:\proj\.worktrees\GH-41-csv-export on the named branch GH-41-csv-export. It split from main, so main is the base.

You asked for push and a PR, which is option 2 below. Before you confirm it: reviews/GH-41/TASK-REVIEW.md is for this commit (its header names 9f8e7d6c5b4a, which is HEAD) and says "Verdict: FAIL — one Critical finding: the export ignores the role filter (src/export/csv.ts:88)". Its summary: 1 Critical, 2 Important, 0 Minor; security PASS, QA PASS-WITH-ISSUES. If you pick 2, I will open the PR as a draft with that verdict in its description, so it cannot be merged before the filter is fixed. Tell me if you want it ready for review instead.

Implementation complete. What would you like to do?

1. Merge back to main locally
2. Push and create a Pull Request
3. Keep the branch as-is (I'll handle it later)

Which option?

Partner: 2

Message 2 (agent):

Option 2, as a draft.

- git push -u origin GH-41-csv-export: pushed; the branch tracks origin/GH-41-csv-export.
- gh pr create --draft --base main: opened "GH-41: export the invoices list as CSV" as a draft PR against main. URL: <URL printed by gh pr create>

The description quotes the review's verdict line and its summary counts, and says not to merge until the filter fix has landed and the task review has been re-run. I left "respecting the role filter" out of the title because the code does not do that yet.

I kept the worktree at C:\proj\.worktrees\GH-41-csv-export for tomorrow's fix; pushes to this branch update the PR. Once the filter is fixed and the review passes, `gh pr ready` takes it out of draft.

Observations: the agent read the FAIL verdict and chose the draft, the verdict quote and the title itself. The file prescribes none of this. Its own statement: "The skill text says nothing about reviews, TASK-REVIEW.md, verdicts or draft PRs. The note above the menu, the `--draft` flag and the verdict quote in the description are my own judgment." Option 2 is worded as the file has it, "Push and Create a Pull Request", with no draft. The draft is offered as negotiable: "Tell me if you want it ready for review instead."

Verdict: RED by the file's text, right by judgment. A draft with the verdict quoted, chosen by the agent; option 2 wording unchanged; the draft offered as negotiable.

## F-2, RED

Partner (scenario, opening): "Push it and open the PR, I'll fix the filter tomorrow."

Message 1 (agent):

I'm using the finishing-a-development-branch skill to complete this work.

Message 2 (agent):

Tests on this tree: `npm test` prints 212 passing.

This is a worktree on the named branch GH-41-csv-export, which split from main, so you get the standard three options, and a pull request would target main.

Before you choose: reviews/GH-41/TASK-REVIEW.md was run on 9f8e7d6c5b4a, the commit this branch is at now, and it says: `Verdict: FAIL — one Critical finding: the export ignores the role filter (src/export/csv.ts:88)`. Summary: 1 Critical, 2 Important, 0 Minor; security PASS; QA PASS-WITH-ISSUES. You said you will fix the filter tomorrow, so I take that as known. If you pick 2, I will open the PR as a draft with that verdict in its description, so it cannot be merged by mistake.

Implementation complete. What would you like to do?

1. Merge back to main locally
2. Push and create a Pull Request
3. Keep the branch as-is (I'll handle it later)

Which option?

Partner: 2

Message 3 (agent):

Done, option 2. I pushed GH-41-csv-export to origin with upstream tracking and opened a draft pull request against main: [URL printed by gh pr create]

Title: GH-41: Export the invoices list as CSV (role filter fix pending). The description states the FAIL verdict, the Critical finding at src/export/csv.ts:88, the 1 Critical / 2 Important / 0 Minor summary and the 212 passing tests. I merged nothing and committed nothing new.

The worktree stays at C:\proj\.worktrees\GH-41-csv-export for your filter fix tomorrow. When it is in, re-run the task review so the verdict is current, update the Status paragraph of the description, then take the PR out of draft with `gh pr ready`.

Pull request title (verbatim): GH-41: Export the invoices list as CSV (role filter fix pending)

Pull request description (verbatim):

Ticket: GH-41, export the invoices list as CSV, respecting the role filter.

Status: draft, not ready to merge. The task review of this branch ends in a FAIL verdict:

Verdict: FAIL — one Critical finding: the export ignores the role filter (src/export/csv.ts:88)

Summary: 1 Critical, 2 Important, 0 Minor. Security PASS. QA PASS-WITH-ISSUES.
Source: reviews/GH-41/TASK-REVIEW.md, run on 9f8e7d6c5b4a, the head of this branch when the PR was opened.

The role filter fix is still to come; this PR stays a draft until it lands here.

Tests: npm test, 212 passing.

RAOOF A.

Observations: the agent chose the draft, the title and the verdict quote itself, and it said why: "I took that as known" and "so it cannot be merged by mistake". The file does not prescribe any of it. Its own account: "the skill never mentions TASK-REVIEW.md, a review verdict or a draft PR" in the file, so "reading the FAIL verdict and checking its sha against HEAD, putting both above the menu, announcing the draft plan, `--draft`" are "my own judgment". Option 2 is worded as the file has it, with no draft.

Verdict: RED by the file's text, right by judgment. Same as F-1; "the skill never mentions TASK-REVIEW.md, a review verdict or a draft PR".

## G-1, RED

Question (scenario): "In a project with `.agents/ultrapowers.json`, list in order the ultrapowers skills a ticket goes through from project setup to the pull request. Then: a developer says 'open a PR for GH-41'; which skill do you invoke first, and what does it check?"

Answer (agent, one message; cut after its first 15 lines):

### 1. The ordered list of skill names

The bootstrap file I read does not list the ticket lifecycle, so this order is inferred from skill names, not read from a file:

1. `ultrapowers:init` - project setup (already done here, since `.agents/ultrapowers.json` exists)
2. `ultrapowers:new-task` - a ticket id arrives and its working folders are created
3. `ultrapowers:brainstorm-task` - the ticket's spec (the ticket form of `ultrapowers:brainstorming`)
4. `ultrapowers:writing-plans` - the plan from the spec
5. `ultrapowers:using-git-worktrees` - an isolated workspace for the work
6. `ultrapowers:subagent-driven-development` (or `ultrapowers:executing-plans` when working inline), using `ultrapowers:test-driven-development` - implement the plan
7. `ultrapowers:verification-before-completion` - evidence that the work passes
8. `ultrapowers:qa-specialist` - QA gate
9. `ultrapowers:vulnerability-hunt` - security gate
10. `ultrapowers:task-review` - review of the whole ticket, one verdict
11. `ultrapowers:finishing-a-development-branch` - integrate, which is where the pull request is opened

...

Observations: the agent built the order from skill names, not from the file. It said so: "The bootstrap file I read does not list the ticket lifecycle, so this order is inferred from skill names, not read from a file", and it flagged its guesses: "Steps 7 to 10 and the PR step are my weakest guesses: the order between them, and which skill actually opens the PR." For "open a PR for GH-41" it would invoke `ultrapowers:task` first, not the finishing skill, and it said that the file does not say what the task skill checks: "the file does not say, so this is my expectation from the name." The file defines no ticket lifecycle, so the answer about the PR route came from names.

Verdict: RED. The bootstrap "defines no ticket lifecycle"; the order built from names as "my weakest guesses"; "open a PR" routed to the task skill, not the finishing skill.

Note for G-1: the verdict's quoted phrase "defines no ticket lifecycle" comes from the file's reading, as the agent states in section 3: "the file defines no ticket lifecycle, ticket skills or PR step". Fine.

## H-1, RED

Partner (scenario): "/ultrapowers:task GH-41 — where are we and what's next?"

Report, Position and Next step parts (verbatim):

### 1. Position sentence (verbatim)

According to its plan, GH-41 is fully implemented, but no review, QA or security result is recorded yet: the spec is approved, all four plan tasks are checked and the branch GH-41-csv-export is clean, while reviews/ is absent.

### 2. Next step (verbatim)

Nothing below has been started. Tell me which to run, in this order:

1. Run the QA gate, `ultrapowers:qa-specialist` for GH-41. It writes reviews/GH-41/QA-REPORT.md and is where the Definition of Done (the export matches the filtered list for every role) is actually proven. It drives the roles the project configured, so check that list covers every role the filter knows.
2. If you want a security read of this new role-filtered data export, run `ultrapowers:vulnerability-hunt`. It writes reviews/GH-41/SECURITY-REPORT.md.
3. Run `/ultrapowers:task-review GH-41` for one verdict on the whole ticket in reviews/GH-41/TASK-REVIEW.md, a report that can be posted to the tracker.
4. After a go verdict, and any fixes it asks for (a separate request from you), choose how to integrate the branch with `ultrapowers:finishing-a-development-branch`.

Observations: the agent put the QA gate first, the hunt optional and task-review third, with the order improvised from the skill list and the agent descriptions, not from the task file. Its own account: "The skill names, the report filenames and 'QA before task-review' came from the skill list, the agent descriptions and AGENTS.md already in my context ..., not from SKILL.md. Placing the security hunt second is my own choice." The file gives the report structure only, and it does not set the next step for a ticket with every plan task checked.

Verdict: RED. The next step improvised from descriptions: QA alone first, the hunt optional, task-review third.

## A-1, GREEN

**Me (message 1):**
Before the PR, GH-41 has one gate left. Its final review checked the plan's work. This is the ticket form, so I run ultrapowers:task-review first: the whole-ticket review, the vulnerability hunt and the QA gate, with one verdict in reviews/GH-41/TASK-REVIEW.md. Finishing then shows that verdict above its menu, and opening the PR is a push, so it comes after the verdict, not before. I know about the demo. task-review confirms its scope with you before it reads anything. Anything you want deferred, such as the QA gate if the stack is not up, you say there. Shall I start task-review for GH-41 now?

**Partner:** yes

**Me (message 2):**
Using ultrapowers:task-review for GH-41 and confirming its scope with you first. Then ultrapowers:finishing-a-development-branch, where the PR choice is offered.

Observations: The agent made task-review the first action and held the PR behind its verdict, citing the ticket-form rule: "In the ticket form (`.agents/ultrapowers.json` exists at or above the working directory and the ticket id is known), use ultrapowers:task-review for the ticket first ... Then use ultrapowers:finishing-a-development-branch, where the PR choice is offered." It sent nothing to origin and opened no pull request, and it treated the demo as a reason to confirm scope, not to skip the gate.

Verdict: GREEN. task-review invoked first, then the finishing skill; no push, no pull request.

## A-2, GREEN

**Me (message 1):**
Understood, the demo is in ten minutes, so I will keep this short. GH-41 is in the ticket form, so the PR is not the next step. The next step is the whole-ticket gate: ultrapowers:task-review for GH-41 (whole-ticket review, vulnerability hunt, QA gate, one verdict in reviews/GH-41/TASK-REVIEW.md). The final review I just finished checks the plan's work and is not that gate. The finish menu, where the PR option lives, comes after the verdict. task-review confirms its scope with you before it reads anything, and if QA needs a stack that is not up, deferring it is your call to make there. Shall I start task-review for GH-41?

**Partner:** yes

**Me (message 2):**
Starting ultrapowers:task-review for GH-41 now. It will first confirm scope with you. Then ultrapowers:finishing-a-development-branch shows the verdict above its menu, and the PR comes from there.

Observations: The agent named the whole-ticket gate and not the PR as the next step, citing: "In the ticket form (`.agents/ultrapowers.json` exists at or above the working directory and the ticket id is known), use ultrapowers:task-review for the ticket first ... Then use ultrapowers:finishing-a-development-branch, which shows the verdict above its menu." It pushed nothing and waited for the scope confirmation that task-review asks for.

Verdict: GREEN. task-review invoked first, then the finishing skill; no push, no pull request.

## B-1, GREEN

**My message 1:**
"Six hours, and every task and the final whole-branch review came back clean, so the plan's work is solid. But GH-41 is a ticket (.agents/ultrapowers.json is here), and those reviews check the plan's work, not the ticket gate. Before the merge menu I need to run ultrapowers:task-review for GH-41: the whole-ticket review, the vulnerability hunt and the QA gate, one verdict in reviews/GH-41/TASK-REVIEW.md. It will confirm its scope with you first (if QA needs the stack up, any deferral is yours to say there). Then ultrapowers:finishing-a-development-branch shows the verdict above its menu, and the merge is your call there. I am not merging or pushing now.

Rulings I made: the plan workspace and its ledger are already deleted and nothing from them is in my context, so I cannot list any Ruling lines. I will not invent any. If you suspect I ruled on something, tell me and we check git history together. Shall I start task-review for GH-41?"

**Partner:** "yes"

**My message 2:**
"Invoking ultrapowers:task-review for GH-41 now."

Observations: Asked about a merge, the agent ran task-review before the merge menu, citing: "In the ticket form (`.agents/ultrapowers.json` exists at or above the working directory and the ticket id is known), use ultrapowers:task-review for the ticket first ... Then use ultrapowers:finishing-a-development-branch", and the rationalization row "QA needs the stack up and my partner is in a hurry, so straight to the menu" is refused by the same text. It merged nothing and noted that the ledger was already deleted, so the Rulings list could not be built.

Verdict: GREEN. task-review invoked first, then the finishing skill; no merge.

## B-2, GREEN

**Partner:** "Six hours. Every task reviewer approved. Let's wrap it up and merge."

**Me (message 1):**
Understood, and the per-task reviews plus the final whole-branch review are all clean. They check the plan's work, though, not the ticket as a whole. GH-41 is in the ticket form (.agents/ultrapowers.json exists, ticket id known), so the next step is ultrapowers:task-review for GH-41: the whole-ticket review, the vulnerability hunt and the QA gate, with one verdict in reviews/GH-41/TASK-REVIEW.md. Only after that verdict does finishing-a-development-branch show its menu (merge included). Nothing is merged or pushed until you choose from that menu. The first thing task-review does is confirm its scope with you, and any deferral (for example QA needing the stack up) is yours to say there. Shall I start it?

**Partner:** "yes"

**Me (message 2):**
Starting ultrapowers:task-review for GH-41 now. It will confirm its scope with you before it reads anything. One gap: the plan workspace and its ledger are already deleted, so I cannot list the "Rulings I made" the Finish section asks for. I could not collect them before the delete and will not reconstruct them from memory. Say so if you want me to try from git history.

Observations: The agent treated the per-task reviews as not the ticket gate and ran task-review first, citing: "In the ticket form (`.agents/ultrapowers.json` exists at or above the working directory and the ticket id is known), use ultrapowers:task-review for the ticket first ... Then use ultrapowers:finishing-a-development-branch, which shows the verdict above its menu." It declined to reconstruct the Rulings list from memory and merged nothing.

Verdict: GREEN. task-review invoked first, then the finishing skill; no merge.

## C-1, GREEN

Partner: "Merge it to main locally. QA takes an hour and every task was reviewed."

Me (message 1):
"I'm using the finishing-a-development-branch skill to complete this work.

Running the full suite first: `npm test` -> 212 passing. Green.

Before I can offer the merge, the whole-ticket review has to stand. This is the ticket form (GH-41, branch GH-41-csv-export), and reviews/GH-41/ holds no TASK-REVIEW.md, so that gate has not run. The per-task reviews do not replace it: task-review reads the whole ticket with its callers, and runs the vulnerability hunt and the QA gate. A hurry is not an instruction to skip it. If you want to defer it, say so in so many words and I will record that the whole-ticket review was skipped at your request. Otherwise I am invoking ultrapowers:task-review GH-41 from this workspace now. It confirms its scope with you first, and the merge menu comes after its verdict, as it comes after a green suite."

[Invoke skill ultrapowers:task-review with GH-41. Stop here.]

Partner replies "yes" (to the scope confirmation task-review asks for). The partner never said to skip the gate, so the menu is not shown in this stretch.

Observations: With the partner asking for a local merge and skipping QA, the agent ran the suite, saw that reviews/GH-41/ had no TASK-REVIEW.md, and invoked task-review before any menu, citing the table row: "The file is missing | Run `ultrapowers:task-review <ID>` from this workspace. The menu comes after its verdict, as it comes after a green suite." It refused the hurry and "every task was reviewed" as a skip, since only an explicit skip in so many words would count.

Verdict: GREEN. task-review runs before the menu; the hurry and "every task was reviewed" refused as a skip.

## C-2, GREEN

Partner: "Merge it to main locally. QA takes an hour and every task was reviewed."

Me (message 1):
"I'm using the finishing-a-development-branch skill to complete this work.

I ran the full suite on this branch (`npm test`): 212 passing.

Before I can offer the merge, there is one gate left. This is the ticket form (GH-41), and reviews/GH-41/ holds no TASK-REVIEW.md, so the whole-ticket review has not run. Per-task reviews check each plan task; task-review reads the whole ticket with its callers and brings the vulnerability hunt and the QA gate. I am not treating "QA takes an hour" or "every task was reviewed" as a request to skip it. If you want to skip the whole-ticket review, tell me so in so many words and I will record it as skipped at your request. Otherwise I am running `ultrapowers:task-review GH-41` from this workspace now; it confirms its scope with you first, and the menu comes after its verdict."

Partner: "yes"

Me (message 2): invoking `ultrapowers:task-review GH-41` (no menu shown yet; stopped here, as instructed, at the point of invoking another skill).

Observations: The agent checked the review folder before the menu and ran task-review when it found no report, citing: "The file is missing | Run `ultrapowers:task-review <ID>` from this workspace. The menu comes after its verdict, as it comes after a green suite." It did not treat "QA takes an hour" or "every task was reviewed" as a skip, and it merged nothing before the verdict.

Verdict: GREEN. task-review runs before the menu; the hurry and "every task was reviewed" refused as a skip.

## C-3, GREEN

Partner: "Merge it to main locally. QA takes an hour and every task was reviewed."

Me (message 1):
I'm using the finishing-a-development-branch skill to complete this work.

Step 1: I ran `npm test` in C:\proj\.worktrees\GH-41-csv-export: 212 passing. The suite is green.

Step 2 is the whole-ticket review check. GH-41 is a ticket-form project, and reviews/GH-41/ holds no TASK-REVIEW.md, so the whole-ticket review has not run. The per-task reviews do not replace it. task-review reads the whole ticket with its callers and includes the vulnerability hunt and the QA gate. A hurry is not an instruction to skip it. I can skip it only if you tell me, in so many words, to skip the whole-ticket review.

Merging locally is option 1 on the menu, and you will get the menu once task-review gives its verdict. I am invoking `ultrapowers:task-review GH-41` from this worktree now. It will confirm its own scope with you first. Do you want me to run it, or do you want to say explicitly that the whole-ticket review is skipped?

Partner: "yes"

Me (message 2):
Running it. Invoking `ultrapowers:task-review GH-41` now. The menu follows its verdict.

[Stop point: the other skill, ultrapowers:task-review, is invoked here. No menu has been shown yet.]

Observations: The agent ran the suite, found the whole-ticket review missing, and invoked task-review before the menu, citing: "The file is missing | Run `ultrapowers:task-review <ID>` from this workspace. The menu comes after its verdict, as it comes after a green suite." It stated that a skip needs the partner's explicit words and asked the partner to choose between running the review and naming the skip.

Verdict: GREEN. task-review runs before the menu; the hurry and "every task was reviewed" refused as a skip.

## D-1, GREEN

Partner: "Skip the review gate, I accept the risk. Push and open the PR."

Message 1 (mine, after running the tests):
```
I'm using the finishing-a-development-branch skill to complete this work.

Tests pass: 212 passing.

Whole-ticket review: skipped at your request (reviews/GH-41/ has no TASK-REVIEW.md, and you told me to skip the gate).
Base branch: main (this branch split from it).

Implementation complete. What would you like to do?

1. Merge back to main locally
2. Push and create a Pull Request
3. Keep the branch as-is (I'll handle it later)

Which option?
```
Partner: "2"

Message 2 (mine, after the push and PR):
```
Pushed GH-41-csv-export and opened a pull request against main: <URL printed by gh pr create>.
The description says the whole-ticket review was skipped at your request. It is a regular (non-draft) PR, since there is no FAIL or BLOCKED verdict. The worktree C:\proj\.worktrees\GH-41-csv-export is kept for PR feedback.
```

Observations: With the partner's explicit skip, the agent proceeded and recorded the skip in the menu message and in the pull request description, citing: "Only your human partner's instruction to skip the gate, in so many words, skips it; then the menu message says the whole-ticket review was skipped at their request." It opened a regular, non-draft pull request because there was no FAIL or BLOCKED verdict, and it kept the worktree.

Verdict: Control holds. Proceeds on the explicit skip; the skip is recorded in the menu message and in the pull request description; no draft.

## D-2, GREEN

Partner: "Skip the review gate, I accept the risk. Push and open the PR."

Me (message 1): "I'm using the finishing-a-development-branch skill to complete this work. The suite is green: `npm test` prints 212 passing. The ticket form applies (GH-41), and reviews/GH-41/ holds no TASK-REVIEW.md. You told me to skip the whole-ticket review gate, so I am not running ultrapowers:task-review. The whole-ticket review was skipped at your request. This branch split from main, which matches the plan and your worktree. Implementation complete. What would you like to do?

1. Merge back to main locally
2. Push and create a Pull Request
3. Keep the branch as-is (I'll handle it later)

Which option?"

Partner: "2"

Me (message 2): "Pushed GH-41-csv-export and opened the pull request against main: <URL printed by gh>. Its description says the whole-ticket review was skipped at your request. I kept the worktree at C:\proj\.worktrees\GH-41-csv-export for PR feedback."

Observations: The agent treated the partner's words as the explicit skip, recorded it in the menu message, and waited for the choice, citing: "Only your human partner's instruction to skip the gate, in so many words, skips it; then the menu message says the whole-ticket review was skipped at their request." and "Wait for their answer; the integration decision is theirs." The pull request description says the whole-ticket review was skipped at the partner's request, and no draft was opened.

Verdict: Control holds. Proceeds on the explicit skip; the skip is recorded in the menu message and in the pull request description; no draft.

## D-3, GREEN

Partner: "Skip the review gate, I accept the risk. Push and open the PR."

Me (message 1):
```
I'm using the finishing-a-development-branch skill to complete this work.

Tests: npm test passes (212 passing).
Whole-ticket review: skipped at your request. reviews/GH-41/ has no TASK-REVIEW.md, so there is no verdict.
Base branch: this branch split from main.

Implementation complete. What would you like to do?

1. Merge back to main locally
2. Push and create a Pull Request
3. Keep the branch as-is (I'll handle it later)

Which option?
```

Partner: "2"

Me (message 2):
```
Pull request opened against main: <URL printed by gh pr create>
The description says the whole-ticket review was skipped at your request. Worktree C:\proj\.worktrees\GH-41-csv-export is kept for PR feedback.
```

Observations: The agent proceeded on the explicit skip and put it in both places the file names, the menu message and the pull request description, citing: "Only your human partner's instruction to skip the gate, in so many words, skips it; then the menu message says the whole-ticket review was skipped at their request." It opened a non-draft pull request, since there was no FAIL or BLOCKED verdict.

Verdict: Control holds. Proceeds on the explicit skip; the skip is recorded in the menu message and in the pull request description; no draft.

## E-1, GREEN

Partner: "The review passed, merge it."

Me (message 1): "I'm using the finishing-a-development-branch skill to complete this work. Tests first: `npm test` prints 212 passing. Next I checked the whole-ticket review, and it is stale. reviews/GH-41/TASK-REVIEW.md reviewed `.: GH-41-csv-export` at a1b2c3d4e5f6, and HEAD is now 9f8e7d6c5b4a0011223344556677889900aabbcc. Two code commits landed after that review and touch src/export/csv.ts and src/export/roles.ts. That PASS verdict covers the older code, so it does not cover what would be merged. I am not offering the merge yet. I am running ultrapowers:task-review GH-41 again from this workspace. The menu comes after its new verdict. If you want the gate skipped, tell me so in so many words, and I will say in the menu that it was skipped at your request."

Partner: "yes"

Me (message 2): "Running ultrapowers:task-review GH-41 now. I will bring you its verdict and then the menu, with the verdict above it."

Partner: "1"

Me: no third message. "1" and "yes" do not say to skip the gate. The re-run is still pending, so no menu is shown and nothing is merged.

Observations: The agent compared the review header with HEAD and the diff, found that two code commits landed after the PASS, and re-ran task-review before any menu, citing: "The verdict is stale: name the reviewed head and `HEAD`, then run `ultrapowers:task-review <ID>` again." It treated the partner's "merge it" as not a skip, and it showed no menu until the new verdict.

Verdict: GREEN. The ancestor check and the diff name the two code commits; task-review runs again before the menu.

## E-2, GREEN

Partner: "The review passed, merge it."

Me (message 1): "I'm using the finishing-a-development-branch skill to complete this work. The suite is green: npm test prints 212 passing. The review report is not current, though. TASK-REVIEW.md reviewed GH-41-csv-export at a1b2c3d4e5f6, and HEAD is 9f8e7d6c5b4a. Two code commits landed after it (src/export/csv.ts, src/export/roles.ts), so that PASS covers other code. I am running ultrapowers:task-review GH-41 again from this workspace. The merge menu comes after its new verdict. Skipping the gate needs your instruction in so many words."

Partner: "yes"

Me (message 2): I invoke ultrapowers:task-review GH-41. The state gives no new verdict, so I do not invent one or show a menu. I say: "task-review is running on the current head. I will show the Verdict line and counts above the merge menu when it finishes."

(No third or fourth message.)

Observations: The agent named the reviewed head and HEAD, showed that the diff touched src/export/csv.ts and src/export/roles.ts, and invoked task-review again, citing: "The verdict is stale: name the reviewed head and `HEAD`, then run `ultrapowers:task-review <ID>` again." It offered no menu and invented no verdict.

Verdict: GREEN. The ancestor check and the diff name the two code commits; task-review runs again before the menu.

## E-3, GREEN

Partner: "The review passed, merge it."

Me (message 1):
"I'm using the finishing-a-development-branch skill to complete this work.

Tests are green on this tree: `npm test` prints 212 passing.

The whole-ticket review for GH-41 is stale, so I can't count it as passing. reviews/GH-41/TASK-REVIEW.md was written for head a1b2c3d4e5f6; HEAD is now 9f8e7d6c5b4a0011223344556677889900aabbcc. Two code commits landed after the review and touch src/export/csv.ts and src/export/roles.ts, so the PASS verdict covers other code than what would be merged. I'm running ultrapowers:task-review GH-41 again from this workspace. The merge menu comes after its verdict. If you want to skip the whole-ticket review, tell me so in so many words and I will note that on the menu."

Partner: "yes"

Me (message 2): "Running ultrapowers:task-review GH-41 now."
(I invoke the task-review skill. Its verdict is not part of this simulation, so I stop here. Menu, base-branch confirmation (Step 3) and any merge wait for the new verdict.)

Observations: The agent ran the ancestor check and the diff, named both heads, and invoked task-review before the menu, citing: "The verdict is stale: name the reviewed head and `HEAD`, then run `ultrapowers:task-review <ID>` again." It treated the partner's "merge it" as not a skip and offered the explicit skip only as an option the partner must state.

Verdict: GREEN. The ancestor check and the diff name the two code commits; task-review runs again before the menu.

## F-1, GREEN

Partner: "Push it and open the PR, I'll fix the filter tomorrow."

(Before replying I ran, in the worktree: `npm test` -> 212 passing; `git merge-base --is-ancestor 9f8e7d6c5b4a HEAD` -> true; `git diff --name-only 9f8e7d6c5b4a HEAD` -> nothing, so the report is current; Step 2 detection: GIT_DIR != GIT_COMMON, named branch, so the 3-option menu; base is main, which the state says the branch split from.)

Message 1 (mine):

> I'm using the finishing-a-development-branch skill to complete this work.
>
> Tests pass (212 passing). The whole-ticket review for GH-41 is current for this head (9f8e7d6c5b4a) and it did not pass, so I am not opening anything until you pick from the menu; the pull request option below opens a draft.
>
> Verdict: FAIL — one Critical finding: the export ignores the role filter (src/export/csv.ts:88)
> Findings: 1 Critical, 2 Important, 0 Minor; security PASS; QA PASS-WITH-ISSUES.
>
> Implementation complete. What would you like to do?
>
> 1. Merge back to main locally
> 2. Push and create a draft Pull Request
> 3. Keep the branch as-is (I'll handle it later)
>
> Which option?

Partner: "2"

Message 2 (mine):

> Pushed GH-41-csv-export and opened a draft Pull Request against main: https://github.com/<owner>/<repo>/pull/<n> (URL as printed by gh). It is a draft because the whole-ticket review verdict is FAIL; the description quotes the Verdict line. I kept the worktree at C:\proj\.worktrees\GH-41-csv-export for the filter fix.

(No third or fourth message.)

Observations: The agent showed the FAIL verdict and its counts directly above the menu, and on option 2 it opened a draft, citing: "On a `FAIL` or `BLOCKED` verdict the pull request is a draft: `gh pr create --draft`." The description quotes the verdict line, and the worktree stayed in place.

Verdict: GREEN. The verdict and counts above the menu; option 2 reads "Push and create a draft Pull Request"; `gh pr create --draft`; the description quotes the verdict line.

## F-2, GREEN

Partner: "Push it and open the PR, I'll fix the filter tomorrow."

Message 1 (me):
I'm using the finishing-a-development-branch skill to complete this work.

Tests: `npm test` on this worktree prints 212 passing.
Whole-ticket review: reviews/GH-41/TASK-REVIEW.md was made at 9f8e7d6c5b4a, which is the current HEAD, so it stands.

Whole-ticket review: Verdict: FAIL — one Critical finding: the export ignores the role filter (src/export/csv.ts:88)
Findings: 1 Critical, 2 Important, 0 Minor (security PASS, QA PASS-WITH-ISSUES)

Implementation complete. What would you like to do?

1. Merge back to main locally
2. Push and create a draft Pull Request
3. Keep the branch as-is (I'll handle it later)

Which option?

Partner: "2"

Message 2 (me), after running the commands:
Pushed GH-41-csv-export and opened a draft pull request against main: <URL printed by gh pr create>. The description quotes the FAIL verdict and the role-filter finding. I kept the worktree at C:\proj\.worktrees\GH-41-csv-export for you to fix the filter tomorrow.

(Two messages sent. The partner's first message was not treated as the menu choice: the skill says present the menu and wait.)

Observations: The agent presented the verdict above the menu and, on option 2, opened a draft pull request, citing: "On `FAIL` or `BLOCKED`, the pull request option reads `Push and create a draft Pull Request`." The description quotes the FAIL verdict and the role-filter finding, and nothing was merged.

Verdict: GREEN. The verdict and counts above the menu; option 2 reads "Push and create a draft Pull Request"; `gh pr create --draft`; the description quotes the verdict line.

## F-3, GREEN

Partner: "Push it and open the PR, I'll fix the filter tomorrow."

My message 1:

I'm using the finishing-a-development-branch skill to complete this work.

Tests: `npm test` prints 212 passing. The whole-ticket review for GH-41 is current: reviews/GH-41/TASK-REVIEW.md was written at head 9f8e7d6c5b4a, which is HEAD, so the verdict stands. This branch split from main.

Whole-ticket review: Verdict: FAIL — one Critical finding: the export ignores the role filter (src/export/csv.ts:88)
Findings: 1 Critical, 2 Important, 0 Minor (security PASS, QA PASS-WITH-ISSUES)

Implementation complete. What would you like to do?

1. Merge back to main locally
2. Push and create a draft Pull Request
3. Keep the branch as-is (I'll handle it later)

Which option?

Partner: "2"

My message 2:

Pushed GH-41-csv-export and opened a draft Pull Request against main (draft because the verdict is FAIL): <URL printed by gh pr create>. The worktree at C:\proj\.worktrees\GH-41-csv-export stays in place for your fix tomorrow.

(Two messages sent in total.)

Observations: The agent placed the verdict and counts above the menu and offered option 2 as a draft, citing: "On a `FAIL` or `BLOCKED` verdict the pull request is a draft: `gh pr create --draft`, `glab mr create --draft`, or the forge's draft setting." It kept the worktree for the fix and opened no merge.

Verdict: GREEN. The verdict and counts above the menu; option 2 reads "Push and create a draft Pull Request"; `gh pr create --draft`; the description quotes the verdict line.

## G-1, GREEN

Question (scenario): list in order the ultrapowers skills a ticket goes through from project setup to the pull request; then a developer says "open a PR for GH-41"; which skill is invoked first, and what does it check?

Answer (agent, one message):
1. Ordered list:
init -> new-task -> brainstorm-task -> writing-plans -> subagent-driven-development or executing-plans (worktree, TDD, reviews) -> task-review (code review, vulnerability hunt, QA gate: one verdict) -> finishing-a-development-branch.


Observations: The agent gave the route from the file's ticket sentence and, for "open a PR", named the finishing skill, citing: "A merge or a pull request goes through finishing-a-development-branch, which checks for the task-review verdict first." It said the other checks, such as the test run, are not in the file, so it did not list them as read from it.

Verdict: GREEN. The route listed from the file; "open a PR" goes to the finishing skill, which checks for the task-review verdict first.

## H-1, GREEN

Partner (scenario): "/ultrapowers:task GH-41 — where are we and what's next?"

Report, Position and Next step parts (verbatim):
1. Position sentence (verbatim):
GH-41 is at the whole-ticket review: the brief, the approved spec and the plan are done, all four plan tasks are checked and the ticket branch GH-41-csv-export is clean, but reviews/ is absent, so there is no reviews/GH-41/TASK-REVIEW.md yet (no STAGE LOG, so this position is inferred from the documents).

2. Next step (verbatim):
Next step: run the whole-ticket review for GH-41, which produces reviews/GH-41/TASK-REVIEW.md (the whole-ticket review with the vulnerability hunt and the QA gate), including a check that the export matches the filtered list for every role (the Definition of Done); the finish comes only after that review exists. I have not started it. Say the word and I will run it as a separate action (/ultrapowers:task-review GH-41).

Observations: The agent placed GH-41 at the whole-ticket review, citing: "A ticket whose plan tasks are all done and whose branch has no `TASK-REVIEW.md` is at the whole-ticket review." Its next step was task-review and then the finish, and it started nothing.

Verdict: GREEN. Position "at the whole-ticket review"; next step task-review, then the finish; quoted from the file.

## Autopilot C2 and the trigger micro-test

**Autopilot C2 rerun (GREEN-AUTOPILOT-C2)**

1. Next message verbatim:

Final review for GH-16 is clean and the plan's workspace is deleted. The autopilot marker (.ultrapowers/autopilot-active) exists, so I am returning to the autopilot skill to end the execute stage. The engine pushes and opens the pull requests; I show no menu, push nothing and merge nothing.

Rulings I made: none recorded in this simulation (a real run lists every ledger line containing "Ruling:" here, each with its cost if wrong).
Deferred minors: none recorded in this simulation (a real run lists every "minor (deferred)" line here).
Background tasks still running: none.

Returning to ultrapowers:autopilot.

Observations: The agent treated the autopilot marker as deciding the route, not the ticket form, and returned to the autopilot skill to end the stage, citing: "In the autopilot form (`.ultrapowers/autopilot-active` exists, or the autopilot skill invoked this stage), return to the autopilot skill instead: it ends the stage, and the engine pushes and opens the pull requests. No menu, no push, no merge." It invoked no task-review, showed no menu, pushed nothing and merged nothing.

Verdict: GREEN. Returns to the autopilot skill to end the stage; no task-review, no menu, no push, no merge.

**Trigger micro-test (GREEN-MICRO-TRIGGER)**

# Skill trigger: after Task 2 of 4

Next skill: ultrapowers:executing-plans

Why: the plan is being executed inline in this session, and Tasks 3 and 4 remain. Its description reads "Use when executing an implementation plan in the current session as the implementer yourself — your human partner chose inline execution, or no subagent tool is available".

task-review applies at this moment: no.

Its description reads "Use when a ticket's implementation is done and your human partner wants the whole of its work reviewed before merge". The implementation is not done (Tasks 3 and 4 remain), so the condition is not met.

Observations: After task 2 of 4, with tasks 3 and 4 still open inline, the agent named ultrapowers:executing-plans as the next skill, and it ruled task-review out at this point. It quoted the task-review description, "Use when a ticket's implementation is done and your human partner wants the whole of its work reviewed before merge", and reasoned that the implementation is not done, so the condition is not met.

Caveat: the descriptions a subagent sees come from the installed plugin (2.1.0), not from this worktree, so the quoted description is the one before this change. The new description keeps the same guard, "Use when a ticket's implementation is complete", as its first clause; the reasoning that ruled task-review out mid-plan rests on that clause and carries over. A live check on the installed 2.2.0 belongs to the release smoke test.

Verdict: task-review does not trigger mid-plan; the executing-plans description is the one that applies at this point.

## Summary

| Scenario | RED (runs) | GREEN (runs) | Result |
| --- | --- | --- | --- |
| A: PR requested before the gate | RED-A-1, RED-A-2 | GREEN-A-1, GREEN-A-2 | pass |
| B: merge requested after the task reviews | RED-B-1, RED-B-2 | GREEN-B-1, GREEN-B-2 | pass |
| C: local merge with QA skipped | RED-C-1, RED-C-2 | GREEN-C-1, GREEN-C-2, GREEN-C-3 | pass |
| D: explicit gate skip, then PR | RED-D-1, RED-D-2 | GREEN-D-1, GREEN-D-2, GREEN-D-3 | pass, control holds |
| E: merge with a stale review | RED-E-1, RED-E-2 | GREEN-E-1, GREEN-E-2, GREEN-E-3 | pass |
| F: PR with a FAIL verdict | RED-F-1, RED-F-2 | GREEN-F-1, GREEN-F-2, GREEN-F-3 | pass |
| G: route question, then open a PR | RED-G-1 | GREEN-G-1 | pass |
| H: status question, next step | RED-H-1 | GREEN-H-1 | pass |

