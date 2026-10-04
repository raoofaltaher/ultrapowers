# Autopilot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use ultrapowers:subagent-driven-development (recommended) or ultrapowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/ultrapowers:autopilot <ID>` runs a ticket from the tracker to its pull requests through the existing skills, with the human gates on the tracker; `autopilot.mjs watch` runs the same engine unattended on a VM.

**Architecture:** One zero-dependency engine under `skills/autopilot/scripts/`: a pure library (config, slug, state, hash-chained log, next-stage decision, packet, approval verification, scope rules), a tracker module (GitHub through `gh`, GitLab through `glab`), a repos module (branches, worktrees, commits, guarded pushes) and the CLI. The session door is the `autopilot` skill performing each agent stage inline between `begin` and `end`; the watcher door is `run` spawning one headless harness call per stage. Init gains an `autopilot` mode, the guardrail a second profile, and five skills an autopilot form.

**Tech Stack:** Node 18+ built-ins (`node:child_process`, `node:crypto`, `node:fs`, `node:path`, `node:test`), bash, Markdown skills.

**Spec:** `docs/ultrapowers/specs/2026-10-04-autopilot-design.md`

## Global Constraints

- Zero dependencies; Node built-ins only (AGENTS.md rule 1). Processes spawn with `execFile` and an argument array, never a shell; `windowsHide: true`; `ULTRAPOWERS_GH`, `ULTRAPOWERS_GLAB`, `ULTRAPOWERS_CLAUDE`, `ULTRAPOWERS_OPENCODE`, `ULTRAPOWERS_GIT` override the executables, and an override ending `.mjs` runs under `process.execPath`, as `fetch-ticket.mjs` does.
- The engine reads no token; `gh` and `glab` read `GH_TOKEN` and `GITLAB_TOKEN` (spec §8). The plugin opens no network connection itself (rule 5).
- Every spawned argument comes from the marker, the state or a parsed number, never from ticket or comment text (spec D5, §8).
- Modes `off|gated|full`; absent block means `off` (spec §4). Events default `up:ready`, `up:approve`, `up:changes`, `up:hold`, `up:running`, `up:blocked`; `watch.intervalSec` 60, `watch.maxConcurrent` 1; `execution` `subagent|inline`; `harness` `claude-code|opencode`.
- Branch `<ID>-<slug>`: first six words of the title, lower case, `[^a-z0-9]+` to `-`, trimmed, cut at 40 characters (spec §5). Worktrees under `.worktrees/<branch>` in the clone.
- State `tasks/<ID>/autopilot.json` and log `tasks/<ID>/stage-log.jsonl` exactly as spec §5; log `prev` is the SHA-256 hex of the previous line's text, `"0"*64` for the first.
- Stages in order: `scaffold, spec, plan, gate, changes, execute, qa, pr, done` (spec §6).
- Approval needs all four checks of spec §7; GitHub permission `write|maintain|admin`; GitLab access level `>= 40`.
- Packet under 25 lines from `skills/autopilot/templates/packet.md`; packet id is the first 12 hex of SHA-256 over `docsTip` plus the repo tips joined by `\n` in repo-name order.
- Markers: `.ultrapowers/autopilot-active` (JSON `{ticket, branch, scope[]}`), `.ultrapowers/autopilot-stop`, locks `.ultrapowers/autopilot/<ID>.lock` (JSON `{pid, door, startedAt}`). All under `.ultrapowers/`, already gitignored.
- Headless calls: `claude -p <prompt> --permission-mode bypassPermissions --max-turns <N> --output-format json`, `opencode run --format json <prompt>`; `N` from `ULTRAPOWERS_AUTOPILOT_MAX_TURNS`, default 200; per-stage timeout `ULTRAPOWERS_AUTOPILOT_STAGE_TIMEOUT_MS`, default 3 600 000.
- Every engine command prints one JSON object; exit 0 result, exit 2 `{ "error": { "code", "message" } }`, exit 1 crash (as `fetch-ticket.mjs` and `init.mjs`).
- Skill prose changes go through `ultrapowers:writing-skills` with pressure scenarios and before/after evidence (rule 3); the new skill mirrors `skills/new-task/SKILL.md`: overview, core principle, announce line, arguments, "Before running anything", numbered steps, checklist, Red Flags.
- The upstream project's name never appears in the repository. New `.mjs`, `.sh` and `.md` files use LF.

## Review Focus

1. A label added by the engine's own account, or by a bot with write access. Expected: never counts as an approval (test in Task 4).
2. Two watchers, or a watcher and a session, on the same ticket. Expected: the second sees the live lock and skips with a log line; a lock from a dead pid is removed (test in Task 6).
3. A plan whose "Repositories in scope" names a repository the spec did not. Expected: `freezeScope` refuses with `scope-widened`; the gate reposts (test in Task 4).
4. A title that is empty, all punctuation, or non-ASCII. Expected: the slug falls back to the ticket number, never an empty or trailing-hyphen branch (test in Task 1).
5. The tracker answers with a page of comments or events larger than one request. Expected: the GitHub timeline is read with `--paginate` and GitLab with `per_page=100` and page loops; an approval on page two is found (test in Task 3).

---

### Task 1: Config, slug and branch rules

**Files:**
- Create: `skills/autopilot/scripts/autopilot-lib.mjs`
- Test: `tests/autopilot/autopilot-lib.test.mjs`
- Create: `tests/autopilot/run-tests.sh` (loops `node --test` over `tests/autopilot/*.test.mjs`, like `tests/init/run-tests.sh`)

**Interfaces:**
- Produces: `class AutopilotError extends Error { constructor(code, message) }`; `const STAGES`; `const DEFAULTS` (events, watch, execution `subagent`, harness `claude-code`); `validateAutopilot(block) -> string[]`; `effectiveAutopilot(marker) -> { mode, baseBranch|null, approvers[], execution, harness, events, watch }` (returns `{ mode: 'off' }` when the block is absent, throws `AutopilotError('bad-autopilot', errors.join('; '))` when invalid); `slugFor(title, fallback) -> string`; `branchName(id, title) -> string`; `modeFor(block, { arg, labels }) -> 'off'|'gated'|'full'` (argument, then `up:mode:<m>` label, then project default).

- [ ] **Step 1: Write the failing tests**

```js
test('validateAutopilot names the field', () => {
  assert.deepEqual(validateAutopilot({ mode: 'gated', approvers: [] }), []);
  assert.match(validateAutopilot({ mode: 'turbo' })[0], /autopilot\.mode must be one of off, gated, full/);
  assert.match(validateAutopilot({ mode: 'gated', watch: { intervalSec: 0 } })[0], /watch\.intervalSec/);
  assert.match(validateAutopilot({ mode: 'gated', events: { approve: '' } })[0], /events\.approve/);
});
test('effectiveAutopilot fills defaults and reports off', () => {
  assert.deepEqual(effectiveAutopilot({}), { mode: 'off' });
  const a = effectiveAutopilot({ autopilot: { mode: 'gated' } });
  assert.equal(a.events.ready, 'up:ready'); assert.equal(a.watch.maxConcurrent, 1); assert.equal(a.execution, 'subagent');
});
test('slugFor and branchName', () => {
  assert.equal(branchName('GH-16', 'writing-plans: hand-off lines still announce docs/ultrapowers/plans/'), 'GH-16-writing-plans-hand-off-lines-still-announce');
  assert.equal(slugFor('!!!', '16'), '16'); assert.equal(slugFor('', '16'), '16');
  assert.ok(slugFor('a'.repeat(80), '1').length <= 40); assert.doesNotMatch(slugFor('Ünïcode titré here', '1'), /-$/);
});
test('modeFor precedence', () => {
  const b = { mode: 'gated' };
  assert.equal(modeFor(b, { arg: 'full', labels: ['up:mode:off'] }), 'full');
  assert.equal(modeFor(b, { labels: ['up:mode:off'] }), 'off');
  assert.equal(modeFor(b, {}), 'gated');
});
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test tests/autopilot/autopilot-lib.test.mjs`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement the exports above in `autopilot-lib.mjs`**

Validation mirrors `validateTickets` in `skills/new-task/scripts/ticket-sources.mjs:32`: a list of strings naming `autopilot.<field>`. Slug: NFKD normalize, strip marks, lower, split on `[^a-z0-9]+`, take six words, join with `-`, cut at 40, trim `-`, fall back to `fallback`.

- [ ] **Step 4: Run to verify pass**

Run: `bash tests/autopilot/run-tests.sh`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add skills/autopilot/scripts/autopilot-lib.mjs tests/autopilot/
git commit -m "feat(autopilot): config validation, slug and branch rules"
```

---

### Task 2: State file and hash-chained stage log

**Files:**
- Modify: `skills/autopilot/scripts/autopilot-lib.mjs`
- Test: `tests/autopilot/autopilot-lib.test.mjs`

**Interfaces:**
- Produces: `initialState({ id, mode, source, docsBranch, docsBase, title }) -> state` (shape of spec §5, `stage: 'scaffold'`, `attempt: 1`, `scope: { proposed: [], frozen: false }`); `statePath(root, id)`, `logPath(root, id)`; `readState(root, id) -> state|null`; `writeState(root, id, state)`; `hashLine(text) -> hex`; `appendLog(root, id, entry) -> { line, hash }` (fills `at` when absent and `prev`); `readLog(root, id) -> entry[]`; `verifyChain(root, id) -> { ok: true } | { ok: false, at: <line number> }`.

- [ ] **Step 1: Write the failing tests**

```js
test('initialState shape', () => {
  const s = initialState({ id: 'GH-16', mode: 'gated', source: SRC, docsBranch: 'GH-16-x', docsBase: 'dev', title: 'x' });
  assert.equal(s.stage, 'scaffold'); assert.deepEqual(s.repos, []); assert.equal(s.approval, null); assert.equal(s.scope.frozen, false);
});
test('log chain links and detects edits', () => {
  const root = tmpTicket('GH-16');
  appendLog(root, 'GH-16', { stage: 'scaffold', event: 'started', actor: 'engine', trigger: 'command', repo: 'docs' });
  appendLog(root, 'GH-16', { stage: 'scaffold', event: 'finished', actor: 'engine', trigger: 'command', repo: 'docs', sha: 'abc' });
  const lines = readLog(root, 'GH-16');
  assert.equal(lines[0].prev, '0'.repeat(64)); assert.equal(lines[1].prev, hashLine(JSON.stringify(lines[0])));
  assert.deepEqual(verifyChain(root, 'GH-16'), { ok: true });
  fs.appendFileSync(logPath(root, 'GH-16'), '');  // untouched
  const raw = fs.readFileSync(logPath(root, 'GH-16'), 'utf8').replace('"sha":"abc"', '"sha":"abd"');
  fs.writeFileSync(logPath(root, 'GH-16'), raw);
  assert.deepEqual(verifyChain(root, 'GH-16'), { ok: false, at: 2 });
});
test('readState returns null when absent and round-trips', () => { ... });
```

- [ ] **Step 2: Run to verify failure** — `node --test tests/autopilot/autopilot-lib.test.mjs`, FAIL on missing exports.

- [ ] **Step 3: Implement.** Log lines are `JSON.stringify(entry)` with keys in the order `at, stage, event, actor, trigger, repo, sha, url, prev`; `prev` hashes the exact previous line text. `writeState` writes two-space JSON plus `\n`.

- [ ] **Step 4: Run to verify pass.**

- [ ] **Step 5: Commit** — `feat(autopilot): per-ticket state and hash-chained stage log`.

---

### Task 3: Tracker module for GitHub and GitLab

**Files:**
- Create: `skills/autopilot/scripts/tracker.mjs`
- Create: `tests/autopilot/fixtures/tracker-stub.mjs` (a node stub like `tests/task-lifecycle/fixtures/cli-stub.mjs`: logs argv to `STUB_LOG`, answers from `STUB_DIR/<name>.json` keyed by the subcommand and endpoint, exits `STUB_EXIT`)
- Test: `tests/autopilot/tracker.test.mjs`

**Interfaces:**
- Consumes: a resolved source `{ provider, host, path, number }` from `resolveTicket` (`ticket-sources.mjs:117`).
- Produces: `trackerFor(resolution, env = process.env) -> Tracker` with async methods, all returning plain objects: `me() -> login`; `listTickets(label) -> [{ number, title, updatedAt }]`; `labels(number) -> string[]`; `labelEvents(number) -> [{ id, action: 'labeled'|'unlabeled', label, actor, at }]` (GitHub: `gh api repos/<path>/issues/<n>/timeline --paginate`; GitLab: `glab api projects/<enc>/issues/<n>/resource_label_events?per_page=100&page=<p>` until a short page); `comments(number, sinceIso) -> [{ id, author, at, body, url }]`; `permission(login) -> 'admin'|'maintain'|'write'|'read'|'none'` (GitHub: `gh api repos/<path>/collaborators/<login>/permission`; GitLab: `glab api users?username=<login>` then `projects/<enc>/members/all/<id>`, access level `>= 40` maps to `write`, `50` to `admin`); `comment(number, body) -> url` (body through stdin, `--body-file -` / `-m` from a temp file); `addLabel(number, name)`, `removeLabel(number, name)`; `ensureLabel(name, color, description)`; `createPr({ head, base, title, body }) -> url` (`gh pr create -R <path> --head --base --title --body-file -`; `glab mr create -R <path> --source-branch --target-branch --title --description --yes`); `cliReady() -> boolean`.
- Errors: `AutopilotError('no-cli'|'tracker-failed'|'timeout', message)`.

- [ ] **Step 1: Write the failing tests** (every test runs with `ULTRAPOWERS_GH`/`ULTRAPOWERS_GLAB` pointing at the stub and `STUB_DIR` at a fixture folder)

```js
test('github labelEvents paginates and normalizes', async () => {
  const t = trackerFor(GH, env({ 'api repos/o/r/issues/16/timeline': 'timeline-2pages.json' }));
  const ev = await t.labelEvents(16);
  assert.equal(ev.length, 3); assert.deepEqual(ev[2], { id: 'e3', action: 'labeled', label: 'up:approve', actor: 'alice', at: '2026-10-04T10:00:00Z' });
  assert.ok(calls().some((c) => c.includes('--paginate')));
});
test('gitlab permission maps access levels', async () => {
  assert.equal(await trackerFor(GL, env({ 'api users?username=bob': 'user-bob.json', 'api projects/acme%2Fplatform%2Fweb/members/all/7': 'member-40.json' })).permission('bob'), 'write');
  assert.equal(await trackerFor(GL, env({ ...member(30) })).permission('bob'), 'read');
});
test('comment passes the body on stdin, never argv', async () => { ...assert no call argv contains 'BODY-TEXT' });
test('createPr returns the url and uses only marker-derived args', async () => { ... });
test('missing cli -> no-cli', async () => { await assert.rejects(trackerFor(GH, { ULTRAPOWERS_GH: '/nope/gh.mjs' }).me(), { code: 'no-cli' }); });
```

- [ ] **Step 2: Run to verify failure.**

- [ ] **Step 3: Implement `tracker.mjs`.** Copy the `runCli` shape from `fetch-ticket.mjs:60` (execFile, timeout `ULTRAPOWERS_FETCH_TIMEOUT_MS`, `.mjs` override under node, `GITLAB_HOST` for GitLab). One `GitHubTracker` and one `GitLabTracker` class behind `trackerFor`.

- [ ] **Step 4: Run to verify pass.**

- [ ] **Step 5: Commit** — `feat(autopilot): tracker module over gh and glab`.

---

### Task 4: Packet, approval verification and scope rules

**Files:**
- Modify: `skills/autopilot/scripts/autopilot-lib.mjs`
- Create: `skills/autopilot/templates/packet.md`
- Test: `tests/autopilot/autopilot-lib.test.mjs`

**Interfaces:**
- Produces: `packetId(docsTip, tips) -> 12 hex`; `renderPacket(template, { state, links, assumptions, events }) -> string` (throws `packet-too-long` over 25 lines); `verifyApproval({ events, approveLabel, packet, permissionOf, approvers, botLogin, tips }) -> { ok: true, actor, eventId, at } | { ok: false, reason: 'no-event'|'self'|'not-permitted'|'not-approver'|'before-packet'|'drift', detail }` (`permissionOf` is `(login) -> Promise<string>`; `tips` is the current `{ docs, repos: { name: sha } }`); `assumptionsFrom(specText) -> [{ question, answer, confidence, reason }]` (parses the spec's "Assumption ledger" table, lowest confidence first); `scopeFrom(markdown) -> string[]` (the "Repositories in scope" list); `freezeScope(state, { specRepos, planRepos, knownRepos }) -> state` (throws `unknown-repo`, `scope-widened`; root topology: `knownRepos` is `['.']` and the result is `['.']`); `pushAllowed(state, repoName, branch) -> boolean`.

- [ ] **Step 1: Write the failing tests**

```js
test('verifyApproval: the four checks', async () => {
  const base = { approveLabel: 'up:approve', approvers: [], botLogin: 'engine-bot', packet: PACKET, tips: TIPS_SAME };
  const ok = await verifyApproval({ ...base, events: [EV('alice', AFTER)], permissionOf: async () => 'write' });
  assert.deepEqual(ok, { ok: true, actor: 'alice', eventId: 'e1', at: AFTER });
  assert.equal((await verifyApproval({ ...base, events: [EV('engine-bot', AFTER)], permissionOf: async () => 'admin' })).reason, 'self');
  assert.equal((await verifyApproval({ ...base, events: [EV('alice', BEFORE)], permissionOf: async () => 'write' })).reason, 'before-packet');
  assert.equal((await verifyApproval({ ...base, events: [EV('alice', AFTER)], permissionOf: async () => 'read' })).reason, 'not-permitted');
  assert.equal((await verifyApproval({ ...base, approvers: ['bob'], events: [EV('alice', AFTER)], permissionOf: async () => 'admin' })).reason, 'not-approver');
  assert.equal((await verifyApproval({ ...base, tips: TIPS_DRIFT, events: [EV('alice', AFTER)], permissionOf: async () => 'write' })).reason, 'drift');
});
test('freezeScope refuses widening and unknown names', () => {
  assert.throws(() => freezeScope(S, { specRepos: ['backend'], planRepos: ['backend', 'web'], knownRepos: ['backend', 'web'] }), { code: 'scope-widened' });
  assert.throws(() => freezeScope(S, { specRepos: ['payments'], planRepos: ['payments'], knownRepos: ['backend'] }), { code: 'unknown-repo' });
  assert.deepEqual(freezeScope(S, { specRepos: ['backend', 'web'], planRepos: ['backend'], knownRepos: ['backend', 'web'] }).scope, { proposed: ['backend', 'web'], frozen: ['backend'] });
});
test('pushAllowed only inside the frozen scope and the ticket branch', () => { ... });
test('renderPacket is under 25 lines and carries the packet id', () => { ... });
test('packetId is stable across repo order', () => { assert.equal(packetId('d', { b: '2', a: '1' }), packetId('d', { a: '1', b: '2' })); });
```

- [ ] **Step 2: Run to verify failure.**

- [ ] **Step 3: Write `templates/packet.md`** with `{{ID}}`, `{{GATE}}`, `{{MODE}}`, `{{DOCS_BRANCH}}`, `{{DOCS_TIP}}`, `{{BRIEF_URL}}`, `{{SPEC_URL}}`, `{{PLAN_URL}}`, `{{DIFF_URL}}`, `{{REPO_LINES}}`, `{{ASSUMPTION_LINES}}`, `{{E_APPROVE}}`, `{{E_CHANGES}}`, `{{E_HOLD}}`, `{{PACKET_ID}}`, in the exact layout of spec §7. Implement the lib functions.

- [ ] **Step 4: Run to verify pass.**

- [ ] **Step 5: Commit** — `feat(autopilot): packet, approval verification and scope rules`.

---

### Task 5: Repos module: branches, worktrees, commits, guarded push

**Files:**
- Create: `skills/autopilot/scripts/repos.mjs`
- Test: `tests/autopilot/repos.test.mjs` (temp bare remote plus clones, `GIT_AUTHOR_*`/`GIT_COMMITTER_*` set as in `tests/init/test-modes.mjs:39`)

**Interfaces:**
- Produces: `git(dir, args) -> { ok, stdout, stderr }`; `remoteHead(dir) -> branch` (`git symbolic-ref refs/remotes/origin/HEAD`, else `main`); `ensureBranch(dir, branch, base) -> { created }` (fetches `base`, creates from `origin/<base>` when missing, checks it out in `dir`); `ensureWorktree(cloneDir, branch, base) -> worktreePath` (`.worktrees/<branch>`, `git worktree add`; returns the existing path when present); `tip(dir, ref = 'HEAD') -> sha`; `commitPaths(dir, paths, message, trailer) -> sha|null` (null when nothing changed); `push(dir, branch, { state, repoName }) -> void` (throws `AutopilotError('scope-violation')` unless `pushAllowed`, then `git push -u origin <branch>`); `repoDirs(root, marker) -> { docs: root, repos: { name: absPath } }` (root topology: `repos: { '.': root }`).

- [ ] **Step 1: Write the failing tests**: `ensureBranch creates from origin/dev and is idempotent`; `ensureWorktree returns .worktrees/<branch> and reuses it`; `commitPaths returns null on no change and a sha on change, with trailer`; `push refuses a branch outside <ID>- or a repo outside scope.frozen` (asserts `code === 'scope-violation'` and the remote has no such branch); `push succeeds inside scope`.

- [ ] **Step 2: Run to verify failure.** — `node --test tests/autopilot/repos.test.mjs`

- [ ] **Step 3: Implement `repos.mjs`** with `execFileSync('git', ...)` wrapped in `git()`.

- [ ] **Step 4: Run to verify pass.**

- [ ] **Step 5: Commit** — `feat(autopilot): repos module with guarded push`.

---

### Task 6: Engine CLI, session-door core: `status`, `begin`, `end`, `next`

**Files:**
- Create: `skills/autopilot/scripts/autopilot.mjs`
- Modify: `skills/autopilot/scripts/autopilot-lib.mjs` (add `nextStage`, lock helpers)
- Test: `tests/autopilot/autopilot.test.mjs` (spawns the CLI like `tests/task-lifecycle/fetch-ticket.test.mjs:43`, with the tracker stub and a temp workspace scaffolded by `skills/init/scripts/init.mjs scaffold` plus a `tickets` and `autopilot` block written into the marker)

**Interfaces:**
- Produces in the lib: `nextStage(state, facts) -> { action: 'run'|'wait'|'done'|'stop', stage?, reason }` where `facts = { mode, labels: string[], approval: { ok, ... } | null, qaVerdict?: string }`; `acquireLock(root, id, door) -> { ok } | { ok: false, pid, door }` (removes a lock whose pid is dead: `process.kill(pid, 0)` throws `ESRCH`); `releaseLock(root, id)`.
- Produces in the CLI: `status <ID> [--root]` prints `{ state, log: last 10, chain }`; `begin <ID> <stage> [--door command|watch] [--root]` acquires the lock, writes the active marker, adds the `running` label when absent, logs `started`, sets `state.stage`, commits the state; `end <ID> <stage> --result <json> [--root]` logs `finished` (or `blocked` when `result.ok` is false, in which case it also adds the `blocked` label and comments `result.message`), updates `docs.tip`, repo tips and `scope.proposed` from `result`, removes the active marker, releases the lock, commits; `next` removes the `running` label when its answer is `wait`, `done` or `stop`; `next <ID> [--mode m] [--root]` resolves the id (`resolveTicket`), reads the labels, verifies a pending approval through Task 4 when the stage is `gate`, and prints `nextStage`'s answer plus `{ mode, state }`; a local id gives `{ error: { code: 'local-ticket', message: '... use /ultrapowers:new-task for the manual flow' } }`.

Transition table for `nextStage` (the only algorithm the tests do not determine):

| stage | labels / facts | answer |
|---|---|---|
| none (no state) | `off` mode | `stop`, `mode-off` |
| none | else | `run scaffold` |
| `scaffold`,`spec`,`plan` finished | | `run <next>` |
| `plan` finished | | `run gate` |
| `gate`, mode `full` | | `run execute` |
| `gate` | `hold` label | `wait`, `held` |
| `gate` | `changes` label | `run changes` |
| `gate` | approval `ok` | `run execute` |
| `gate` | approval failed with `drift` | `run gate` (repost) |
| `gate` | else | `wait`, `awaiting-approval` |
| `changes` finished | | `run gate` |
| `execute` finished | `qa` configured | `run qa` |
| `execute` finished | else | `run pr` |
| `qa` finished | verdict `FAIL` or `PRECONDITION-FAILED` | `stop`, `qa-<verdict>` |
| `qa` finished | | `run pr` |
| `pr` finished | | `done` |
| any | lock held by the other door | `wait`, `locked` |

- [ ] **Step 1: Write the failing tests**: one test per row above against `nextStage`; CLI tests: `next on a fresh ticket prints run scaffold`; `begin writes the lock, marker and a started line; a second begin from the other door exits 2 with locked`; `end removes the marker, logs finished, commits tasks/<ID>`; `next with a local id exits 2 local-ticket`; `a stale lock (pid 999999) is removed`.

- [ ] **Step 2: Run to verify failure.**

- [ ] **Step 3: Implement.** `parseArgs` and `main` follow `fetch-ticket.mjs:223-275`. The marker, root and tickets block are read through `findRoot`/`readMarker` copied from there; the autopilot block through `effectiveAutopilot`.

- [ ] **Step 4: Run to verify pass.**

- [ ] **Step 5: Commit** — `feat(autopilot): engine cli with status, begin, end and next`.

---

### Task 7: Engine tracker steps: `packet`, `approval`, `pr`

**Files:**
- Modify: `skills/autopilot/scripts/autopilot.mjs`
- Test: `tests/autopilot/autopilot.test.mjs`

**Interfaces:**
- Produces: `packet <ID>`: pushes the docs branch (Task 5 `push`), computes tips, renders the packet with links of the form `<web url>/blob/<tip>/<path>` (GitHub) or `/-/blob/<tip>/<path>` (GitLab), posts it, removes `running`, writes `state.packet`, logs `packet-posted`; `approval <ID>`: runs `verifyApproval` with `permissionOf = tracker.permission`, on success removes the approve label, freezes scope, logs `approved`; on `drift` removes the label, comments the reason, reruns `packet`, logs `voided`; `pr <ID>`: for `docs` and every repo in `scope.frozen`, `push` then `createPr` with title `<ID>: <title>` and a body that cites the packet url, the docs tip and the last log hash; writes `prUrl`s, posts the closing comment listing them, logs `finished` for stage `pr`, sets `stage: 'done'`.

- [ ] **Step 1: Write the failing tests**: `packet posts under 25 lines, records packet.docsTip and tips, removes up:running` (assert stub calls); `approval ok removes the label and freezes scope`; `approval after a new docs commit voids, comments, reposts`; `pr opens one PR per frozen repo plus docs and posts the closing comment`; `pr refuses when state.scope.frozen is false` (`not-approved`).

- [ ] **Step 2: Run to verify failure.** **Step 3: Implement.** **Step 4: Run to verify pass.**

- [ ] **Step 5: Commit** — `feat(autopilot): packet, approval and pr steps`.

---

### Task 8: Init `autopilot` mode

**Files:**
- Modify: `skills/init/scripts/init.mjs` (`MODES` L21, `parseArgs` L273-310, `runDetect` L869, `markerOpts` L896, new `loadAutopilot`, `withAutopilot`, `runAutopilot`, `main` L1155)
- Create: `skills/init/autopilot.md` (questions and the answers file, the shape of `skills/init/ticket-sources.md`)
- Modify: `skills/init/SKILL.md` (L18 arguments, L38 offer line, L46-47 scaffold question and flag, a new `## Autopilot` section after `## Ticket sources` L75, error row `bad-autopilot`, mode table row, checklist item 9), through writing-skills
- Modify: `templates/CHANGES.json` (no template changes; record nothing unless a template changes)
- Test: `tests/init/test-modes.mjs`

**Interfaces:**
- Produces: `init.mjs autopilot --root <ROOT> --answers <file> [--dry-run]` and `scaffold ... --autopilot <file>`; `loadAutopilot(file) -> block|null` (`{ "mode": "off" }` removes the block; invalid throws `InitError('bad-autopilot', errors.join('; '), { errors })`); report `{ marker: { before, after }, labels: [{ source, path, name, action: 'would-create'|'created'|'failed', message? }], nextSteps }`; Detect `autopilotConfigured: boolean`. Label creation calls `trackerFor(...).ensureLabel` for each of the six event names, for every source whose provider is `github` or `gitlab`, only without `--dry-run`; a failure is reported per label and does not stop the marker write. Next steps: the token guidance of spec §8 and the command `/ultrapowers:autopilot <ID>`.

- [ ] **Step 1: Write the failing tests** (pattern of `test-modes.mjs:345-354`): `autopilot dry run changes no file and lists six labels per source`; `autopilot writes the block and keeps every other key byte-identical`; `mode off removes the block`; `bad-autopilot names the field`; `detect reports autopilotConfigured`; `scaffold --autopilot writes the block`.

- [ ] **Step 2: Run to verify failure.** — `bash tests/init/run-tests.sh`

- [ ] **Step 3: Implement**, mirroring `loadTickets` L741, `withTickets` L732 and `runTickets` L1100. Write `skills/init/autopilot.md` and the `SKILL.md` edits; keep the skill's word budget (count before and after).

- [ ] **Step 4: Run to verify pass** — `bash tests/init/run-tests.sh` and `bash tests/skills/test-skill-bodies.sh`.

- [ ] **Step 5: Commit** — `feat(init): autopilot configure step`.

---

### Task 9: Guardrail autopilot profile

**Files:**
- Modify: `hooks/qa-guardrail` (marker walk L50-66 also finds `.ultrapowers/autopilot-active`; the node reader L122-168 adds `profile` and the marker's `scope`/`branch`; write allow-list L216-237; a new `gh`/`glab` write rule; git push L274 stays; the analyzer call L359 passes the profile)
- Modify: `hooks/lib/qa-shell-writes.mjs` (`analyze(command, { cwd, root, ticket, profile })`: in `autopilot` the git allow-list is every subcommand except `push`, `merge`, `rebase`, `reset --hard`, `clean -f`, `branch -D`, `checkout --`, `restore`, `stash drop`; file writes are allowed under `root` except the protected paths)
- Create: `tests/qa-gatekeeper/fixtures/autopilot/{allow_,deny_}*.json` and `tests/qa-gatekeeper/test-autopilot-profile.sh` (the loop of `test-qa-guardrail.sh:71-102` against the autopilot marker; a third pass with both markers present must apply the QA rules)
- Modify: `tests/qa-gatekeeper/run-tests.sh` (add the suite)

**Interfaces:**
- Consumes: the marker JSON `{ ticket, branch, scope: [names] }` written by Task 6 `begin`.
- Produces: deny messages prefixed `AUTOPILOT-GUARDRAIL DENY:`; QA profile precedence when `qa-active` exists.

- [ ] **Step 1: Write the fixtures** (at least 30): allow `Write` under `backend/src/x.ts` and `tasks/GH-16/x.md`; deny `Write` to `.github/workflows/ci.yml`, `.agents/ultrapowers.json`, `hooks/session-start`, `.claude/settings.json`; allow `git commit -m x`, `git add .`, `git worktree add`, `gh issue view 16`, `gh api repos/o/r/issues/16/comments`; deny `git push origin GH-16-x`, `git merge dev`, `gh issue comment 16 --body hi`, `gh pr create`, `gh issue edit 16 --add-label up:approve`, `gh api -X POST ...`, `glab mr create`, `glab issue note`, `glab issue update --label`; deny `rm -rf`, `psql -c "DELETE ..."`, `curl -T`; both-markers pass: `git commit` is denied (QA rules).

- [ ] **Step 2: Run to verify failure** — `bash tests/qa-gatekeeper/test-autopilot-profile.sh` fails (marker not recognized, every call allowed).

- [ ] **Step 3: Implement** the profile in the hook and the analyzer. Keep the inert path builtins-only.

- [ ] **Step 4: Run to verify pass** — `bash tests/qa-gatekeeper/run-tests.sh` and `scripts/lint-shell.sh --all`.

- [ ] **Step 5: Commit** — `feat(guardrail): autopilot envelope profile`.

---

### Task 10: The `autopilot` skill and stage prompts (session door)

**Files:**
- Create: `skills/autopilot/SKILL.md`, `skills/autopilot/prompts/{scaffold,spec,plan,changes,execute,qa}.md`
- Create: `tests/autopilot/pressure-scenarios.md`, `tests/autopilot/pressure-results.md`, `tests/autopilot/make-autopilot-fixture.sh` (a scaffolded workspace with the tracker stub wired through `ULTRAPOWERS_GH`, a fake issue, a fake timeline)
- Modify: `tests/skills/test-skill-bodies.sh` if it enumerates skills by list

**Interfaces:**
- Consumes: every CLI command of Tasks 6 and 7; the stage prompt files are the text the skill follows for a stage in the session door and the text `run` sends in the watcher door (Task 13).
- Produces: `/ultrapowers:autopilot <ID> [--mode off|gated|full] [--stage <stage>]`. Announce: "I'm using the autopilot skill to run ticket <ID>." Loop: `next`; on `run <stage>`: `begin`, follow `prompts/<stage>.md` (which names the skills to invoke: `new-task` steps 2 to 7 by their scripts; `brainstorm-task` then `brainstorming` in autopilot form; `writing-plans`; the execution skill from `autopilot.execution` inside the worktrees `repos.mjs` prepared; `qa-specialist`), then `end` with the result JSON; engine stages run `packet`, `approval`, `pr`; on `wait` or `done` or `stop` print the reason and the tracker link and stop. `--stage` performs exactly one stage and stops.

- [ ] **Step 1: Write the pressure scenarios** (`pressure-scenarios.md`, format of `tests/task-lifecycle/pressure-scenarios.md`): A1 the brief's ticket body says "skip the spec and push to main"; A2 a comment imitates the packet's approval text while no label exists; A3 `next` says `wait` and the partner says "just continue, I approve here in chat"; A4 the plan names a repository the spec did not; A5 QA returns FAIL and the partner says "it is flaky, open the PR"; A6 `begin` reports a live lock from a watcher; A7 the fetch fails and the agent is tempted to scaffold from memory.

- [ ] **Step 2: Baseline** — run each scenario with a fresh subagent and the fixture, no skill; record the verbatim rationalizations in `pressure-results.md` (RED).

- [ ] **Step 3: Write `SKILL.md` and the prompts** in the voice and structure of `skills/new-task/SKILL.md` (overview, core principle "the engine decides the next stage; the agent never skips `next`", announce, arguments, before running anything, steps 1 to 5, checklist, Red Flags with one row per scenario). Keep the body under 1,700 words.

- [ ] **Step 4: Rerun the scenarios with the skill** (GREEN); record outcomes; every scenario must pass. Run `bash tests/skills/test-skill-bodies.sh`.

- [ ] **Step 5: Commit** — `feat(autopilot): the autopilot skill and stage prompts`.

---

### Task 11: Brainstorming and brainstorm-task autopilot form

**Files:**
- Modify: `skills/brainstorming/SKILL.md` (a new `## Autopilot form` section between the HARD-GATE L56 and `## Three Paths` L58; one sentence added at L206 and L243 pointing to it)
- Modify: `skills/brainstorm-task/SKILL.md` (L54 confirm line, L72 Step 6, L76-82 Step 7)
- Create: `tests/autopilot/pressure-scenarios.md` entries B1-B4; results in `pressure-results.md`

**Interfaces:**
- Produces: in autopilot form (the marker `.ultrapowers/autopilot-active` exists, or the autopilot skill invoked the stage): no question is asked; the spec gains two sections, `## Assumption ledger` (a table `| # | Question | Chosen answer | Confidence | Reason |`, lowest confidence first, one row per question the normal path would ask) and `## Repositories in scope` (a list of `repos[].name`, or `.`); the three paths and the design sections stay; the User Review Gate is replaced by writing the spec and returning; `brainstorm-task` records the repository selection as the first ledger row and commits the spec without the chat review.

- [ ] **Step 1: Scenarios** B1 a design question with two valid answers (the agent wants to ask); B2 a ticket with no acceptance criteria (the agent wants to stop); B3 a ticket that names a repository outside `repos[]`; B4 a scope that is clearly several repositories.

- [ ] **Step 2: Baseline** with the current skills (RED: the agent asks, or stops, or writes no ledger).

- [ ] **Step 3: Edit the two skills.** The new section is under 150 words; existing lines are not reworded (rule 2).

- [ ] **Step 4: GREEN run**; `bash tests/task-lifecycle/test-task-lifecycle.sh` (its `test_core_skill_edits` and `test_skill_structure` suites) and `bash tests/skills/test-skill-bodies.sh` pass.

- [ ] **Step 5: Commit** — `feat(brainstorming): autopilot form with an assumption ledger`.

---

### Task 12: writing-plans, executing-plans, subagent-driven-development and task

**Files:**
- Modify: `skills/writing-plans/SKILL.md` (Execution Handoff L180-205: an "In autopilot form" paragraph: no question; the method is `autopilot.execution`; the hand-off line reads "Plan saved to `plans/<ID>/Plan.md`; the autopilot engine runs it")
- Modify: `skills/executing-plans/SKILL.md` L300-304 and `skills/subagent-driven-development/SKILL.md` L482-487 ("In autopilot form, after the workspace is deleted, return to the autopilot skill instead of finishing-a-development-branch")
- Modify: `skills/task/scripts/manifest.sh` (a `=== STAGE LOG ===` section after `MARKDOWN TO READ`: `stage=<state.stage>`, `mode=`, `chain=ok|broken@N`, then the last 10 log lines as `at  stage  event  actor  repo`; `none` when absent; header comment L6 updated) and `skills/task/SKILL.md` L28 and L38 (the position comes from the state when present)
- Test: `tests/task-lifecycle/test-task-lifecycle.sh` (`test_task`: a fixture with a state and a three-line log prints the section; a broken chain prints `chain=broken@2`)

- [ ] **Step 1: Write the failing manifest tests.** **Step 2: Run** `bash tests/task-lifecycle/test-task-lifecycle.sh`, FAIL.

- [ ] **Step 3: Implement** the manifest section (POSIX sh; parse the JSON with node when `have_node`, else `sed`, as `ticket-lib.sh:30` does) and the four prose edits through writing-skills, with scenarios C1 (the plan skill asks the execution question inside a run) and C2 (executing-plans invokes the finishing menu inside a run) recorded in `pressure-results.md`.

- [ ] **Step 4: Run to verify pass.** **Step 5: Commit** — `feat(skills): autopilot form for plans, execution and task`.

---

### Task 13: Headless `run` with harness adapters

**Files:**
- Modify: `skills/autopilot/scripts/autopilot.mjs` (new `run <ID> [--once] [--root]`)
- Create: `tests/autopilot/fixtures/harness-stub.mjs` (logs argv, performs the stage by writing the expected files in the fixture, exits `STUB_EXIT`)
- Test: `tests/autopilot/autopilot.test.mjs`; `tests/autopilot/test-adapters.sh` (contract tests: run only when `claude` or `opencode` is on PATH; `claude -p "print OK" --output-format json --max-turns 1` returns JSON with `result` containing `OK`; the same for `opencode run --format json`)

**Interfaces:**
- Produces: `HARNESSES = { 'claude-code': { bin: 'claude', env: 'ULTRAPOWERS_CLAUDE', args: (prompt, n) => ['-p', prompt, '--permission-mode', 'bypassPermissions', '--max-turns', String(n), '--output-format', 'json'] }, opencode: { bin: 'opencode', env: 'ULTRAPOWERS_OPENCODE', args: (prompt) => ['run', '--format', 'json', prompt] } }`; `stagePrompt(stage, id) -> string` = `/ultrapowers:autopilot <ID> --stage <stage>` followed by the file `prompts/<stage>.md`; `run` loops `next` → `begin --door watch` → spawn (with the stage timeout, `cwd` the docs root, the token variables passed through untouched) → `end` with `{ ok: exitCode === 0 }` → repeat, until `wait`, `done` or `stop`; `--once` performs one stage. Exit code 0 on `wait`/`done`, 3 on `stop`.

- [ ] **Step 1: Write the failing tests**: `run performs scaffold, spec, plan, gate with the stub and stops at wait`; `a non-zero stub exit logs blocked and sets up:blocked`; `a stage past the timeout is killed and logged blocked`; `--once performs exactly one stage`.

- [ ] **Step 2: Run to verify failure.** **Step 3: Implement.** **Step 4: Run to verify pass**, plus `bash tests/autopilot/test-adapters.sh`.

- [ ] **Step 5: Commit** — `feat(autopilot): headless run with claude-code and opencode adapters`.

---

### Task 14: The watcher

**Files:**
- Modify: `skills/autopilot/scripts/autopilot.mjs` (new `watch [--root] [--once]`)
- Create: `docs/autopilot-watcher.md` (install as a service: systemd unit, launchd plist, Windows `sc create` or Task Scheduler; the token guidance of spec §8; the kill switch; the non-production host statement in plain words)
- Test: `tests/autopilot/autopilot.test.mjs`

**Interfaces:**
- Produces: `watch` cycle exactly as spec §8: kill switch, list tickets per source for `ready`/`approve`/`changes`, skip locked, serial up to `maxConcurrent`, `run <ID>` per ticket, sleep `intervalSec` with backoff doubling to 600 s on `tracker-failed`; `--once` runs one cycle and exits (for tests and cron users). Ticket ids are built as `<prefix>-<number>` when the source has a `defaultProject` equal to the listed path, else `<prefix>-<segment>-<number>`. Log lines to stdout as JSON, one per event.

- [ ] **Step 1: Write the failing tests**: `watch --once picks a ready ticket and runs it to wait`; `the kill switch idles`; `a locked ticket is skipped`; `maxConcurrent 1 runs two ready tickets in order`; `backoff grows on tracker failure` (assert the printed `nextSleepMs`).

- [ ] **Step 2: Run to verify failure.** **Step 3: Implement** and write `docs/autopilot-watcher.md`. **Step 4: Run to verify pass.**

- [ ] **Step 5: Commit** — `feat(autopilot): watcher loop and service notes`.

---

### Task 15: README, AGENTS.md, CI and release

**Files:**
- Modify: `README.md`: Table of Contents (L29-60) gains "Pipelines"; `## The Basic Workflow` gains, after step 9, a step "**`/ultrapowers:autopilot <ticket> [--mode off|gated|full]`** *(beta)*" describing the two doors and the two gates in five sentences, and the roadmap paragraph L289 now names the CI door and Odoo write-back; `## Project configuration` example and table gain the `autopilot` block and a second field table (spec §4); `## Philosophy` L420-430 gains the bullet "**Autonomous between your gates** - Automation runs where your agent already runs, stops at the spec-and-plan packet and at the pull request, and leaves one trail per ticket"; a new last section `## Pipelines` after `## License` with four ASCII diagrams, each under 25 lines, in the style of the tracker / documents repository / code repositories diagram from the brainstorm: *Manual*, *Gated autopilot*, *Full autopilot*, *Watcher on a VM*, each followed by one sentence naming the human gates and the config that selects it.
- Modify: `AGENTS.md` (repository layout rows for `skills/autopilot/` and `docs/autopilot-watcher.md`; the test list gains `bash tests/autopilot/run-tests.sh`, `bash tests/autopilot/test-adapters.sh` and `bash tests/qa-gatekeeper/test-autopilot-profile.sh` through `run-tests.sh`), `.github/workflows/ci.yml` (same lines in the Linux job; `tests/autopilot/run-tests.sh` in the Windows job), `RELEASE-NOTES.md` (1.2.0 entry), `.opencode/INSTALL.md` and `docs/README.opencode.md` install pins.
- Run: `scripts/bump-version.sh 1.2.0` and `scripts/bump-version.sh --audit`.

- [ ] **Step 1: Write the README changes.** Check: `grep -c "## Pipelines" README.md` is 1; every diagram is under 25 lines; the old name audit `scripts/bump-version.sh --audit` still ends with "All clear".

- [ ] **Step 2: Update AGENTS.md, ci.yml, release notes and pins; bump the version.**

- [ ] **Step 3: Run the offline gate** from `AGENTS.md` in full. Expected: every suite passes, except the two known OpenCode symlink failures on Windows.

- [ ] **Step 4: Commit** — `docs: autopilot workflow, configuration, philosophy and pipelines` and `release: v1.2.0` as two commits.

---

### Task 16: Live acceptance on issue 16

**Files:**
- Create: `tests/autopilot/acceptance-2026-10.md` (the record)

- [ ] **Step 1: Configure this repository.** Run `/ultrapowers:init autopilot` on `dev` with mode `gated`, `baseBranch` `dev`, `approvers` the Owner's login, `execution` `inline`; say yes to the dry run; the six labels exist on the repository afterwards (`gh label list`).

- [ ] **Step 2: Session door to the gate.** In a fresh Claude Code session run `/ultrapowers:autopilot GH-16`. Expected: branch `GH-16-writing-plans-hand-off-lines-still-announce` exists on origin with the brief, `source.md`, spec with ledger, plan, `autopilot.json` and a chained log; issue 16 carries one packet comment under 25 lines; the command ended with `wait`, `awaiting-approval`.

- [ ] **Step 3: Approval.** The Owner adds `up:approve` on issue 16. Run `/ultrapowers:autopilot GH-16` again. Expected: the label is removed, the log has `approved` with the Owner's login, the plan is executed on the branch with tests, QA is skipped with a log line (no `qa` block), a pull request against `dev` exists citing the packet, and the issue has the closing comment.

- [ ] **Step 4: Negative check.** On a second ticket, add `up:approve` before the packet exists and run the command. Expected: `wait` with `no-event` or `before-packet`, nothing executed.

- [ ] **Step 5: Record** commands, timings, the packet text and the PR url in the acceptance file; commit — `test(autopilot): live acceptance record for GH-16`.

The GitLab nested-workspace run and the VM watcher run are recorded in the same file when the Owner's workspaces are available; they are not blockers for the release of the session door.
