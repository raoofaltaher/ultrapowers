// Tests for skills/task-review/scripts/post-review.mjs: --post through the autopilot tracker
// clients, with fake tracker objects and fake git operations. Nothing here touches a host.
// Run: node --test tests/task-lifecycle/post-review.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveTicket } from '../../skills/new-task/scripts/ticket-sources.mjs';
import { pushAllowed } from '../../skills/autopilot/scripts/autopilot-lib.mjs';
import { postReview, splitParts, rewriteLinks, rawBase } from '../../skills/task-review/scripts/post-review.mjs';

const MARKER = {
  commitTrailer: 'Reviewed-by: Fixture Owner',
  tickets: {
    sources: [
      { prefix: 'GH', provider: 'github', owner: 'o', defaultProject: 'web' },
      { prefix: 'GL', provider: 'gitlab', namespace: 'acme', host: 'gitlab.example.com', defaultProject: 'web' },
      { prefix: 'OD', provider: 'odoo', url: 'https://erp.example.com', mcpUrl: 'https://erp.example.com/mcp', login: 'bot', db: 'erp', defaultProject: '34' },
    ],
  },
};

// A fake tracker: records every call; `open` maps a branch to an open PR url.
function fakeTracker(name, { open = {}, createdUrl = 'https://example.test/pr/99' } = {}) {
  const calls = [];
  const t = {
    name, calls,
    comment: async (number, body, options) => { calls.push({ op: 'comment', number, body, options }); return `${name}-comment-${calls.length}`; },
    prComment: async (url, body) => { calls.push({ op: 'prComment', url, body }); return `${name}-prcomment-${calls.length}`; },
    findOpenPr: async (branch) => { calls.push({ op: 'findOpenPr', branch }); return open[branch] ?? null; },
    createPr: async (args) => { calls.push({ op: 'createPr', ...args }); return createdUrl; },
    title: async () => 'Discount at checkout',
  };
  return t;
}

// A workspace on disk with the review files; fake deps record git and tracker calls in `log`.
function setup({ id, review = '# Task review\n\nVerdict: FAIL — x.\n', qa = '# QA report\n\nVerdict: PASS — ok.\n', artifacts = {}, entries, docsBranch, forges = {}, trackers = {}, pushFails = {} }) {
  const root = mkdtempSync(join(tmpdir(), 'post-review-'));
  mkdirSync(join(root, 'reviews', id, 'artifacts'), { recursive: true });
  if (review !== null) writeFileSync(join(root, 'reviews', id, 'TASK-REVIEW.md'), review);
  if (qa !== null) writeFileSync(join(root, 'reviews', id, 'QA-REPORT.md'), qa);
  for (const [name, bytes] of Object.entries(artifacts)) writeFileSync(join(root, 'reviews', id, 'artifacts', name), bytes);
  const log = [];
  const deps = {
    currentBranch: () => docsBranch ?? `${id}-work`,
    commitPaths: (dir, paths, message, trailer) => { log.push({ op: 'commit', dir, paths, message, trailer }); return 'abc1234'; },
    push: (dir, branch, options) => {
      log.push({ op: 'push', dir, branch, options });
      if (pushFails[branch]) throw new Error(pushFails[branch]);
      if (!pushAllowed(options.state, options.repoName, branch, options.ticket)) throw new Error(`push of ${branch} in ${options.repoName} is outside the ticket's frozen scope`);
    },
    forgeFor: (dir) => forges[dir] ?? null,
    trackerFor: (resolution) => {
      const key = resolution.provider === 'odoo' ? 'ticket' : `${resolution.host}/${resolution.path}`;
      return trackers[key] ?? trackers.ticket;
    },
    changeSet: () => entries ?? [],
  };
  return { root, log, deps };
}
const ticketOf = (id) => resolveTicket(MARKER, id);

test('rawBase builds the pushed branch URL of each forge and percent-encodes the branch', () => {
  assert.equal(rawBase({ provider: 'github', host: 'github.com', path: 'o/r' }, 'GH-7-x'), 'https://raw.githubusercontent.com/o/r/GH-7-x');
  assert.equal(rawBase({ provider: 'gitlab', host: 'gitlab.example.com', path: 'acme/web' }, 'GL-7-feat/é'), 'https://gitlab.example.com/acme/web/-/raw/GL-7-feat/%C3%A9');
  assert.equal(rawBase(null, 'b'), null);
});

test('rewriteLinks percent-encodes names with spaces and non-ASCII, and leaves other links alone', () => {
  const base = 'https://raw.githubusercontent.com/o/r/GH-7-x';
  const text = ['![a b](artifacts/cart clerk é.png)', '[full](artifacts/api-probes.txt)', '[site](https://example.com/artifacts/x)', '![ext](https://example.com/p.png)'].join('\n');
  const { text: out, files } = rewriteLinks(text, { id: 'GH-7', mode: 'raw', base });
  assert.match(out, /!\[a b\]\(https:\/\/raw\.githubusercontent\.com\/o\/r\/GH-7-x\/reviews\/GH-7\/artifacts\/cart%20clerk%20%C3%A9\.png\)/);
  assert.match(out, /\[full\]\(https:\/\/raw\.githubusercontent\.com\/o\/r\/GH-7-x\/reviews\/GH-7\/artifacts\/api-probes\.txt\)/);
  assert.match(out, /\[site\]\(https:\/\/example\.com\/artifacts\/x\)/);
  assert.match(out, /!\[ext\]\(https:\/\/example\.com\/p\.png\)/);
  assert.deepEqual(files.map((f) => f.name), ['cart clerk é.png', 'api-probes.txt']);
});

test('rewriteLinks encodes parentheses in a name so the markdown link survives', () => {
  const { text } = rewriteLinks('![x](<artifacts/shot (1).png>)', { id: 'GH-7', mode: 'raw', base: 'https://h/o/r' });
  assert.ok(text.endsWith('/artifacts/shot%20%281%29.png)'), text);
});

test('splitParts: every part is under the limit, parts are in order, and no embed is cut', () => {
  const block = (n) => `## Section ${n}\n\n${'word '.repeat(300)}\n\n![shot ${n}](https://h/o/r/artifacts/shot-${n}.png)\n`;
  const text = Array.from({ length: 40 }, (_, n) => block(n)).join('\n');
  const parts = splitParts(text, 10000);
  assert.ok(parts.length > 1);
  for (const p of parts) assert.ok(p.length <= 10000, `part of ${p.length} characters`);
  assert.equal(parts.join('').replace(/\s+/g, '').includes('Section39'), true);
  for (let n = 0; n < 40; n += 1) {
    const holders = parts.filter((p) => p.includes(`![shot ${n}](https://h/o/r/artifacts/shot-${n}.png)`));
    assert.equal(holders.length, 1, `embed ${n} lives in exactly one part`);
  }
  const order = parts.map((p) => Number(/## Section (\d+)/.exec(p)?.[1] ?? -1)).filter((n) => n >= 0);
  assert.deepEqual(order, [...order].sort((a, b) => a - b));
});

test('splitParts closes and reopens a fenced block it has to cut', () => {
  const text = '```\n' + 'line of output\n'.repeat(2000) + '```\n';
  const parts = splitParts(text, 5000);
  assert.ok(parts.length > 1);
  for (const p of parts) {
    assert.ok(p.length <= 5000);
    assert.equal((p.match(/^```/gm) || []).length % 2, 0, 'every part has balanced fences');
  }
});

test('splitParts cuts a single line longer than the limit', () => {
  const parts = splitParts('x'.repeat(25000), 10000);
  assert.ok(parts.length >= 3);
  for (const p of parts) assert.ok(p.length <= 10000);
  assert.equal(parts.join('').length, 25000);
});

test('a local ticket is refused and nothing is posted', async () => {
  const s = setup({ id: '501' });
  try {
    const t = fakeTracker('t');
    await assert.rejects(postReview({ id: '501', root: s.root, marker: MARKER, resolution: resolveTicket(MARKER, '501') }, { ...s.deps, trackerFor: () => t }), (e) => e.code === 'local-ticket');
    assert.equal(t.calls.length, 0);
    assert.equal(s.log.length, 0);
  } finally { rmSync(s.root, { recursive: true, force: true }); }
});

test('a missing TASK-REVIEW.md is refused', async () => {
  const s = setup({ id: 'GH-web-7', review: null });
  try {
    await assert.rejects(postReview({ id: 'GH-web-7', root: s.root, marker: MARKER, resolution: ticketOf('GH-web-7') }, s.deps), (e) => e.code === 'no-review');
    assert.equal(s.log.length, 0);
  } finally { rmSync(s.root, { recursive: true, force: true }); }
});

test('a documents repository that is not on a ticket branch is refused before anything is pushed', async () => {
  const s = setup({ id: 'GH-web-7', docsBranch: 'main' });
  try {
    await assert.rejects(postReview({ id: 'GH-web-7', root: s.root, marker: MARKER, resolution: ticketOf('GH-web-7') }, s.deps), (e) => e.code === 'no-docs-branch');
    assert.equal(s.log.length, 0);
  } finally { rmSync(s.root, { recursive: true, force: true }); }
});

test('GitHub: commits reviews/<ID>, pushes the documents branch, comments review then QA on the issue with raw screenshot links', async () => {
  const id = 'GH-web-7';
  const ticket = fakeTracker('ticket');
  const s = setup({
    id, qa: '# QA report\n\nVerdict: PASS — ok.\n\n![cart as admin](artifacts/cart-admin-en-total.png)\n',
    trackers: { ticket }, entries: [],
  });
  try {
    s.deps.forgeFor = (dir) => (dir === s.root ? { provider: 'github', host: 'github.com', path: 'o/docs' } : null);
    const out = await postReview({ id, root: s.root, marker: MARKER, resolution: ticketOf(id) }, s.deps);
    const commit = s.log.find((l) => l.op === 'commit');
    assert.deepEqual(commit.paths, [`reviews/${id}`]);
    assert.equal(commit.trailer, 'Reviewed-by: Fixture Owner');
    const push = s.log.find((l) => l.op === 'push');
    assert.equal(push.branch, `${id}-work`);
    assert.equal(push.options.repoName, 'docs');
    assert.ok(pushAllowed(push.options.state, 'docs', push.branch, id));
    const comments = ticket.calls.filter((c) => c.op === 'comment');
    assert.equal(comments.length, 2);
    assert.ok(comments.every((c) => c.number === 7));
    assert.match(comments[0].body, /^\*\*TASK-REVIEW\.md\*\*/);
    assert.match(comments[0].body, /Verdict: FAIL/);
    assert.match(comments[1].body, /^\*\*QA-REPORT\.md\*\*/);
    assert.match(comments[1].body, /!\[cart as admin\]\(https:\/\/raw\.githubusercontent\.com\/o\/docs\/GH-web-7-work\/reviews\/GH-web-7\/artifacts\/cart-admin-en-total\.png\)/);
    assert.equal(out.posted.length, 2);
  } finally { rmSync(s.root, { recursive: true, force: true }); }
});

test('GitHub: the comment goes on the ticket number even when it is a pull request or closed, and the PR is found by branch name', async () => {
  const id = 'GH-web-7';
  const ticket = fakeTracker('ticket');
  const apiForge = { provider: 'github', host: 'github.com', path: 'o/api' };
  const prTracker = fakeTracker('api', { open: { [`${id}-work`]: 'https://github.com/o/api/pull/12' } });
  const s = setup({ id, trackers: { ticket, 'github.com/o/api': prTracker }, entries: [{ repo: 'api', path: 'api', defaultBranch: 'main', branch: `${id}-work`, onTicketBranch: true }] });
  try {
    s.deps.forgeFor = (dir) => (dir === s.root ? { provider: 'github', host: 'github.com', path: 'o/docs' } : dir.endsWith('api') ? apiForge : null);
    const out = await postReview({ id, root: s.root, marker: MARKER, resolution: ticketOf(id) }, s.deps);
    const finds = prTracker.calls.filter((c) => c.op === 'findOpenPr');
    assert.deepEqual(finds.map((c) => c.branch), [`${id}-work`]);
    assert.ok(finds.every((c) => c.branch !== '7' && c.branch !== 7), 'never the ticket number');
    const prComments = prTracker.calls.filter((c) => c.op === 'prComment');
    assert.equal(prComments.length, 2);
    assert.ok(prComments.every((c) => c.url === 'https://github.com/o/api/pull/12'));
    assert.equal(prTracker.calls.filter((c) => c.op === 'createPr').length, 0);
    assert.equal(ticket.calls.filter((c) => c.op === 'comment').length, 2);
    assert.ok(out.posted.some((p) => p.to === 'pr' && p.url === 'https://github.com/o/api/pull/12'));
  } finally { rmSync(s.root, { recursive: true, force: true }); }
});

test('with no open PR and no --draft-pr nothing is pushed or opened, and the note says so', async () => {
  const id = 'GH-web-7';
  const ticket = fakeTracker('ticket');
  const prTracker = fakeTracker('api');
  const s = setup({ id, trackers: { ticket, 'github.com/o/api': prTracker }, entries: [{ repo: 'api', path: 'api', defaultBranch: 'main', branch: `${id}-work`, onTicketBranch: true }] });
  try {
    s.deps.forgeFor = (dir) => (dir === s.root ? { provider: 'github', host: 'github.com', path: 'o/docs' } : { provider: 'github', host: 'github.com', path: 'o/api' });
    const out = await postReview({ id, root: s.root, marker: MARKER, resolution: ticketOf(id) }, s.deps);
    assert.equal(prTracker.calls.filter((c) => c.op === 'createPr' || c.op === 'prComment').length, 0);
    assert.equal(s.log.filter((l) => l.op === 'push').length, 1, 'only the documents branch was pushed');
    assert.ok(out.notes.some((n) => /no open pull request/i.test(n) && /--draft-pr/.test(n)));
  } finally { rmSync(s.root, { recursive: true, force: true }); }
});

test('--draft-pr pushes the ticket branch through the guarded push, opens a draft PR on the default branch, then comments on it', async () => {
  const id = 'GH-web-7';
  const ticket = fakeTracker('ticket');
  const prTracker = fakeTracker('api', { createdUrl: 'https://github.com/o/api/pull/40' });
  const s = setup({ id, trackers: { ticket, 'github.com/o/api': prTracker }, entries: [{ repo: 'api', path: 'api', defaultBranch: 'develop', branch: `${id}-work`, onTicketBranch: true }] });
  try {
    s.deps.forgeFor = (dir) => (dir === s.root ? { provider: 'github', host: 'github.com', path: 'o/docs' } : { provider: 'github', host: 'github.com', path: 'o/api' });
    const out = await postReview({ id, root: s.root, marker: MARKER, resolution: ticketOf(id), draftPr: true }, s.deps);
    const pushes = s.log.filter((l) => l.op === 'push');
    const codePush = pushes.find((p) => p.options.repoName === 'api');
    assert.ok(codePush, 'the ticket branch was pushed');
    assert.equal(codePush.branch, `${id}-work`);
    assert.ok(pushAllowed(codePush.options.state, 'api', codePush.branch, id));
    const created = prTracker.calls.find((c) => c.op === 'createPr');
    assert.equal(created.draft, true);
    assert.equal(created.head, `${id}-work`);
    assert.equal(created.base, 'develop');
    const ops = prTracker.calls.map((c) => c.op);
    assert.ok(ops.indexOf('createPr') < ops.indexOf('prComment'), 'the draft is opened before it is commented on');
    assert.ok(prTracker.calls.filter((c) => c.op === 'prComment').every((c) => c.url === 'https://github.com/o/api/pull/40'));
    assert.ok(out.posted.some((p) => p.to === 'pr' && p.url === 'https://github.com/o/api/pull/40' && p.created === true));
    assert.ok(!prTracker.calls.some((c) => /merge/i.test(c.op)), 'never merges');
  } finally { rmSync(s.root, { recursive: true, force: true }); }
});

test('a refused push of a ticket branch is recorded for that repository and the others still get their comments', async () => {
  const id = 'GH-web-7';
  const ticket = fakeTracker('ticket');
  const api = fakeTracker('api');
  const web = fakeTracker('web', { open: { 'feature/odd': 'https://github.com/o/web/pull/3' } });
  const s = setup({
    id, trackers: { ticket, 'github.com/o/api': api, 'github.com/o/web': web },
    entries: [
      { repo: 'api', path: 'api', defaultBranch: 'main', branch: 'feature/odd-name', onTicketBranch: true },
      { repo: 'web', path: 'web', defaultBranch: 'main', branch: 'feature/odd', onTicketBranch: true },
    ],
  });
  try {
    s.deps.forgeFor = (dir) => (dir === s.root ? { provider: 'github', host: 'github.com', path: 'o/docs' } : { provider: 'github', host: 'github.com', path: dir.endsWith('api') ? 'o/api' : 'o/web' });
    const out = await postReview({ id, root: s.root, marker: MARKER, resolution: ticketOf(id), draftPr: true }, s.deps);
    assert.equal(api.calls.filter((c) => c.op === 'createPr').length, 0);
    assert.ok(out.notes.some((n) => /api/.test(n) && /outside the ticket's frozen scope/.test(n)));
    assert.equal(web.calls.filter((c) => c.op === 'prComment').length, 2);
  } finally { rmSync(s.root, { recursive: true, force: true }); }
});

test('a repository that is not on a ticket branch is not touched', async () => {
  const id = 'GH-web-7';
  const ticket = fakeTracker('ticket');
  const other = fakeTracker('other');
  const s = setup({ id, trackers: { ticket, 'github.com/o/other': other }, entries: [{ repo: 'other', path: 'other', defaultBranch: 'main', branch: 'main', onTicketBranch: false }] });
  try {
    s.deps.forgeFor = (dir) => (dir === s.root ? { provider: 'github', host: 'github.com', path: 'o/docs' } : { provider: 'github', host: 'github.com', path: 'o/other' });
    await postReview({ id, root: s.root, marker: MARKER, resolution: ticketOf(id), draftPr: true }, s.deps);
    assert.equal(other.calls.length, 0);
    assert.equal(s.log.filter((l) => l.op === 'push').length, 1, 'only the documents branch');
  } finally { rmSync(s.root, { recursive: true, force: true }); }
});

test('a report over 65,536 characters is posted as numbered parts in order, each under the limit, screenshots with the part that references them', async () => {
  const id = 'GH-web-7';
  const filler = (n) => `## Finding ${n}\n\n${'The cart total returned NaN for every line. '.repeat(40)}\n\n![finding ${n}](artifacts/f${n}.png)\n`;
  const qa = '# QA report\n\nVerdict: PASS-WITH-ISSUES — long.\n\n' + Array.from({ length: 120 }, (_, n) => filler(n)).join('\n');
  assert.ok(qa.length > 140000);
  const ticket = fakeTracker('ticket');
  const s = setup({ id, qa, trackers: { ticket }, entries: [] });
  try {
    s.deps.forgeFor = (dir) => (dir === s.root ? { provider: 'github', host: 'github.com', path: 'o/docs' } : null);
    await postReview({ id, root: s.root, marker: MARKER, resolution: ticketOf(id) }, s.deps);
    const comments = ticket.calls.filter((c) => c.op === 'comment');
    const qaParts = comments.filter((c) => c.body.startsWith('**QA-REPORT.md**'));
    assert.ok(qaParts.length >= 3, `${qaParts.length} QA parts`);
    qaParts.forEach((c, i) => {
      assert.ok(c.body.length < 65536, `part ${i + 1} has ${c.body.length} characters`);
      assert.match(c.body, new RegExp(`^\\*\\*QA-REPORT\\.md\\*\\* \\(part ${i + 1} of ${qaParts.length}\\)`));
    });
    const reviewParts = comments.filter((c) => c.body.startsWith('**TASK-REVIEW.md**'));
    assert.equal(reviewParts.length, 1);
    assert.ok(comments.indexOf(reviewParts[0]) < comments.indexOf(qaParts[0]), 'review before QA');
    for (let n = 0; n < 120; n += 1) {
      const holders = qaParts.filter((c) => c.body.includes(`/artifacts/f${n}.png)`));
      assert.equal(holders.length, 1, `screenshot ${n} is in exactly one part`);
      assert.ok(holders[0].body.includes(`## Finding ${n}`), `screenshot ${n} sits with its finding`);
    }
  } finally { rmSync(s.root, { recursive: true, force: true }); }
});

test('GitLab: raw links use the -/raw form on the ticket host, and parts stay under the argv-safe limit', async () => {
  const id = 'GL-7';
  const ticket = fakeTracker('ticket');
  const qa = '# QA\n\nVerdict: PASS — ok.\n\n![x y](artifacts/x y.png)\n\n' + 'padding line\n\n'.repeat(4000);
  const s = setup({ id, qa, trackers: { ticket }, entries: [] });
  try {
    s.deps.forgeFor = (dir) => (dir === s.root ? { provider: 'gitlab', host: 'gitlab.example.com', path: 'acme/docs' } : null);
    await postReview({ id, root: s.root, marker: MARKER, resolution: ticketOf(id) }, s.deps);
    const comments = ticket.calls.filter((c) => c.op === 'comment');
    assert.ok(comments.length > 2);
    assert.ok(comments.every((c) => c.body.length <= 24000));
    assert.ok(comments.some((c) => c.body.includes('https://gitlab.example.com/acme/docs/-/raw/GL-7-work/reviews/GL-7/artifacts/x%20y.png')));
  } finally { rmSync(s.root, { recursive: true, force: true }); }
});

test('Odoo: screenshots are attached to the chatter message under their own names; the body carries no raw URL', async () => {
  const id = 'OD-13627';
  const ticket = fakeTracker('ticket');
  const qa = '# QA\n\nVerdict: PASS — ok.\n\n![clerk view](artifacts/cart clerk é.png)\n\n![admin](artifacts/cart-admin.png)\n';
  const s = setup({ id, qa, artifacts: { 'cart clerk é.png': Buffer.from('png-one'), 'cart-admin.png': Buffer.from('png-two') }, trackers: { ticket }, entries: [] });
  try {
    await postReview({ id, root: s.root, marker: MARKER, resolution: ticketOf(id) }, s.deps);
    assert.equal(s.log.filter((l) => l.op === 'push').length, 0, 'no forge for the documents: nothing to push');
    const qaComment = ticket.calls.filter((c) => c.op === 'comment').find((c) => c.body.startsWith('**QA-REPORT.md**'));
    assert.deepEqual(qaComment.options.attachments.map((a) => a.name), ['cart clerk é.png', 'cart-admin.png']);
    assert.equal(Buffer.from(qaComment.options.attachments[0].bytes).toString(), 'png-one');
    assert.doesNotMatch(qaComment.body, /https?:\/\//);
    assert.match(qaComment.body, /attached as cart clerk é\.png/);
    assert.equal(qaComment.number, 13627);
    const reviewComment = ticket.calls.filter((c) => c.op === 'comment').find((c) => c.body.startsWith('**TASK-REVIEW.md**'));
    assert.ok(!reviewComment.options || !reviewComment.options.attachments || reviewComment.options.attachments.length === 0);
  } finally { rmSync(s.root, { recursive: true, force: true }); }
});

test('Odoo: a missing screenshot file is named in the body, not attached, and does not stop the post', async () => {
  const id = 'OD-13627';
  const ticket = fakeTracker('ticket');
  const s = setup({ id, qa: '# QA\n\nVerdict: PASS — ok.\n\n![gone](artifacts/gone.png)\n', trackers: { ticket }, entries: [] });
  try {
    await postReview({ id, root: s.root, marker: MARKER, resolution: ticketOf(id) }, s.deps);
    const qaComment = ticket.calls.filter((c) => c.op === 'comment').find((c) => c.body.startsWith('**QA-REPORT.md**'));
    assert.match(qaComment.body, /gone\.png.*not found/);
    assert.ok(!qaComment.options?.attachments?.length);
  } finally { rmSync(s.root, { recursive: true, force: true }); }
});

test('Odoo ticket, code repository on GitLab: the PR comment has no raw link (the documents have no forge) and says where the screenshots are', async () => {
  const id = 'OD-13627';
  const ticket = fakeTracker('ticket');
  const api = fakeTracker('api', { open: { [`${id}-work`]: 'https://gitlab.example.com/acme/api/-/merge_requests/5' } });
  const s = setup({
    id, qa: '# QA\n\nVerdict: PASS — ok.\n\n![a](artifacts/a.png)\n', artifacts: { 'a.png': Buffer.from('x') },
    trackers: { ticket, 'gitlab.example.com/acme/api': api },
    entries: [{ repo: 'api', path: 'api', defaultBranch: 'main', branch: `${id}-work`, onTicketBranch: true }],
  });
  try {
    s.deps.forgeFor = (dir) => (dir.endsWith('api') ? { provider: 'gitlab', host: 'gitlab.example.com', path: 'acme/api' } : null);
    await postReview({ id, root: s.root, marker: MARKER, resolution: ticketOf(id) }, s.deps);
    const note = api.calls.filter((c) => c.op === 'prComment').find((c) => c.body.startsWith('**QA-REPORT.md**'));
    assert.ok(note);
    assert.doesNotMatch(note.body, /https?:\/\/[^\s]*\.png/);
    assert.match(note.body, /attached to the ticket/);
  } finally { rmSync(s.root, { recursive: true, force: true }); }
});

const SCRIPT = fileURLToPath(new URL('../../skills/task-review/scripts/post-review.mjs', import.meta.url));
const cli = (cwd, args) => spawnSync(process.execPath, [SCRIPT, ...args], { cwd, encoding: 'utf8' });

test('the CLI exits 3 without a project, 4 for an id that names a path, 5 for a local ticket, 2 without an id', () => {
  const root = mkdtempSync(join(tmpdir(), 'post-review-cli-'));
  const bare = mkdtempSync(join(tmpdir(), 'post-review-bare-'));
  try {
    mkdirSync(join(root, '.agents'), { recursive: true });
    writeFileSync(join(root, '.agents', 'ultrapowers.json'), JSON.stringify({ name: 'fx' }));
    assert.equal(cli(bare, ['501']).status, 3);
    assert.equal(cli(root, ['../x']).status, 4);
    const local = cli(root, ['501']);
    assert.equal(local.status, 5);
    assert.match(local.stderr, /ERROR: local-ticket/);
    assert.equal(cli(root, []).status, 2);
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(bare, { recursive: true, force: true });
  }
});

test('an artifact link that leaves reviews/<ID>/artifacts/ is never read, attached or linked', async () => {
  const id = 'OD-13627';
  const ticket = fakeTracker('ticket');
  const qa = [
    '# QA', '', 'Verdict: PASS — ok.', '',
    '![up](artifacts/../../../.agents/mcp-secrets.env)',
    '![enc](artifacts/..%2F..%2F..%2F.agents%2Fmcp-secrets.env)',
    '![abs](artifacts//etc/passwd)',
    '![back](artifacts/..\\..\\secret.txt)',
    '![ok](artifacts/cart.png)', '',
  ].join('\n');
  const s = setup({ id, qa, artifacts: { 'cart.png': Buffer.from('png') }, trackers: { ticket }, entries: [] });
  mkdirSync(join(s.root, '.agents'), { recursive: true });
  writeFileSync(join(s.root, '.agents', 'mcp-secrets.env'), 'TOKEN=secret-value');
  try {
    await postReview({ id, root: s.root, marker: MARKER, resolution: ticketOf(id) }, s.deps);
    const qaComment = ticket.calls.filter((c) => c.op === 'comment').find((c) => c.body.startsWith('**QA-REPORT.md**'));
    assert.deepEqual(qaComment.options.attachments.map((a) => a.name), ['cart.png']);
    assert.doesNotMatch(qaComment.body, /secret-value/);
    assert.match(qaComment.body, /not inside reviews\/OD-13627\/artifacts\//);
  } finally { rmSync(s.root, { recursive: true, force: true }); }
});

test('rewriteLinks in raw mode never builds a URL outside the artifacts folder', () => {
  const { text, files } = rewriteLinks('![a](artifacts/../x.png) ![b](artifacts/ok.png)', { id: 'GH-7', mode: 'raw', base: 'https://raw.example/o/r/GH-7-x' });
  assert.deepEqual(files.map((f) => f.name), ['ok.png']);
  assert.doesNotMatch(text, /\.\.\//);
  assert.match(text, /not inside reviews\/GH-7\/artifacts\//);
  assert.match(text, /https:\/\/raw\.example\/o\/r\/GH-7-x\/reviews\/GH-7\/artifacts\/ok\.png/);
});
