// Ticket sources: the marker's tickets block and ticket id resolution
// (spec docs/ultrapowers/specs/2026-10-02-ticket-sources-design.md, sections 4 and 5).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  TicketError, validateTickets, effectiveTransport, serverId, resolveTicket,
} from '../../skills/new-task/scripts/ticket-sources.mjs';

function specExample() {
  return {
    transport: 'auto',
    sources: [
      {
        prefix: 'GL', provider: 'gitlab', host: 'gitlab.com',
        namespace: 'acme/platform',
        projects: { 'auth-service': 'acme/identity/auth-service' },
        defaultProject: 'tracker',
      },
      { prefix: 'GH', provider: 'github', owner: 'acme', defaultProject: 'web' },
      {
        prefix: 'ODOO', provider: 'odoo', url: 'https://erp.example.com',
        mcpUrl: 'https://erp.example.com/mcp', defaultProject: '12',
      },
    ],
  };
}

function marker(tickets = specExample()) {
  return {
    name: 'fixture',
    repos: [
      { name: 'auth-service', path: 'auth-service', defaultBranch: 'main' },
      { name: 'billing-api', path: 'billing-api', defaultBranch: 'main' },
      { name: 'web', path: 'web', defaultBranch: 'develop' },
    ],
    tickets,
  };
}

const cases = [
  ['GL-billing-api-42', { provider: 'gitlab', path: 'acme/platform/billing-api', number: 42, repoHint: 'billing-api', server: 'tickets-gl', transport: 'auto' }],
  ['GL-auth-service-9', { provider: 'gitlab', path: 'acme/identity/auth-service', number: 9, repoHint: 'auth-service' }],
  ['GL-118', { provider: 'gitlab', path: 'acme/platform/tracker', number: 118, repoHint: null }],
  ['GH-web-7', { provider: 'github', path: 'acme/web', number: 7, repoHint: 'web', host: 'github.com' }],
  ['ODOO-12-1203', { provider: 'odoo', path: '12', number: 1203, repoHint: null, transport: 'mcp', host: 'erp.example.com' }],
  ['PROJ-88', { provider: 'local' }],
  ['#42', { provider: 'local' }],
  ['gl-42', { provider: 'local', nearPrefix: 'GL' }],
];

for (const [id, want] of cases) {
  test(`resolveTicket ${id}`, () => {
    const got = resolveTicket(marker(), id);
    for (const [key, value] of Object.entries(want)) {
      assert.deepEqual(got[key], value, `${id}: ${key}`);
    }
    if (want.provider === 'local') {
      assert.deepEqual(Object.keys(got).sort(), Object.keys(want).sort(), `${id}: local carries nothing else`);
    }
  });
}

// Odoo as an autopilot tracker (spec 2026-10-05 §4): login, db, attachmentMaxBytes, task URLs.
const ODOO_SOURCE = { prefix: 'ODOO', provider: 'odoo', url: 'https://erp.example.com', mcpUrl: 'https://erp.example.com/mcp', login: 'bot', db: 'erp', defaultProject: '12' };
const MARKER_ODOO = marker({ sources: [ODOO_SOURCE] });
const MARKER_ODOO_NO_DEFAULT = marker({ sources: [{ ...ODOO_SOURCE, defaultProject: undefined }] });

test('an odoo source carries login, db and attachmentMaxBytes through validation', () => {
  assert.deepEqual(validateTickets({ attachmentMaxBytes: 1024, sources: [ODOO_SOURCE] }), []);
  assert.match(validateTickets({ attachmentMaxBytes: -1, sources: [] })[0], /attachmentMaxBytes/);
  assert.match(validateTickets({ sources: [{ ...ODOO_SOURCE, login: 3 }] })[0], /login/);
  assert.match(validateTickets({ sources: [{ ...ODOO_SOURCE, db: '' }] })[0], /\.db/);
});

test('resolveTicket on an odoo id carries url, db, login and the canonical id', () => {
  const r = resolveTicket(MARKER_ODOO, 'ODOO-34-13627');
  assert.equal(r.url, 'https://erp.example.com');
  assert.equal(r.db, 'erp');
  assert.equal(r.login, 'bot');
  assert.equal(r.id, 'ODOO-34-13627');
  assert.equal(resolveTicket(marker(), 'GH-web-7').id, 'GH-web-7');
  assert.equal(resolveTicket(marker(), 'ODOO-12-1203').db, null);
});

test('an Odoo task URL resolves against the source whose url matches', () => {
  const r = resolveTicket(MARKER_ODOO, 'https://erp.example.com/odoo/action-577/34/tasks/13627');
  assert.equal(r.provider, 'odoo');
  assert.equal(r.path, '34');
  assert.equal(r.number, 13627);
  assert.equal(r.id, 'ODOO-34-13627');
  const d = resolveTicket(MARKER_ODOO, 'https://erp.example.com/odoo/project.task/13627');
  assert.equal(d.path, '12');
  assert.equal(d.id, 'ODOO-12-13627');
  assert.equal(resolveTicket(MARKER_ODOO, 'https://erp.example.com/web#model=project.task&id=13627').id, 'ODOO-12-13627');
});

test('a task URL on an unknown host is a local ticket', () => {
  assert.deepEqual(resolveTicket(MARKER_ODOO, 'https://other.example.com/odoo/project.task/1'), { provider: 'local' });
  assert.deepEqual(resolveTicket(MARKER_ODOO, 'https://erp.example.com/odoo/action-577/34'), { provider: 'local' });
});

test('a task URL without a project on a source without defaultProject is bad-ticket', () => {
  assert.throws(() => resolveTicket(MARKER_ODOO_NO_DEFAULT, 'https://erp.example.com/odoo/project.task/13627'), (e) => e instanceof TicketError && e.code === 'bad-ticket' && /defaultProject/.test(e.message));
});

test('GitLab host defaults to gitlab.com and the prefix is kept', () => {
  const t = specExample();
  delete t.sources[0].host;
  const got = resolveTicket(marker(t), 'GL-42');
  assert.equal(got.host, 'gitlab.com');
  assert.equal(got.prefix, 'GL');
});

test('an id with a known prefix and no ticket number is refused', () => {
  assert.throws(() => resolveTicket(marker(), 'GL-billing-api'),
    (err) => err instanceof TicketError && err.code === 'bad-ticket' && /ticket number/.test(err.message));
});

test('an id with no project segment and no defaultProject is refused', () => {
  const t = specExample();
  delete t.sources[1].defaultProject;
  assert.throws(() => resolveTicket(marker(t), 'GH-7'),
    (err) => err instanceof TicketError && err.code === 'bad-ticket'
      && err.message === 'GH-7 needs a project segment or a defaultProject for GH');
});

test('an Odoo project segment must be a number', () => {
  assert.throws(() => resolveTicket(marker(), 'ODOO-sales-1203'),
    (err) => err instanceof TicketError && err.code === 'bad-ticket');
});

test('a marker without a tickets block resolves every id as local', () => {
  assert.deepEqual(resolveTicket({ repos: [] }, 'GL-42'), { provider: 'local' });
});

test('the spec example is a valid tickets block', () => {
  assert.deepEqual(validateTickets(specExample()), []);
});

const invalid = [
  ['duplicate prefix', (t) => { t.sources[1].prefix = 'GL'; }, 'tickets.sources[1].prefix'],
  ['lowercase prefix', (t) => { t.sources[0].prefix = 'gl'; }, 'tickets.sources[0].prefix'],
  ['slack provider', (t) => { t.sources[0].provider = 'slack'; }, 'tickets.sources[0].provider'],
  ['github without owner', (t) => { delete t.sources[1].owner; }, 'tickets.sources[1].owner'],
  ['gitlab without namespace', (t) => { delete t.sources[0].namespace; }, 'tickets.sources[0].namespace'],
  ['odoo without url', (t) => { delete t.sources[2].url; }, 'tickets.sources[2].url'],
  ['odoo without mcpUrl', (t) => { delete t.sources[2].mcpUrl; }, 'tickets.sources[2].mcpUrl'],
  ['transport ssh', (t) => { t.transport = 'ssh'; }, 'tickets.transport'],
  ['source transport ssh', (t) => { t.sources[0].transport = 'ssh'; }, 'tickets.sources[0].transport'],
  ['bad mcpHeader', (t) => { t.sources[2].mcpHeader = 'Authorization: Bearer token'; }, 'tickets.sources[2].mcpHeader'],
  // Codex passes a header secret only whole or as a Bearer token (final review).
  ['mcpHeader scheme other than Bearer', (t) => { t.sources[2].mcpHeader = 'Authorization: Token'; }, 'tickets.sources[2].mcpHeader'],
];

for (const [label, mutate, field] of invalid) {
  test(`validateTickets rejects ${label}`, () => {
    const t = specExample();
    mutate(t);
    const errors = validateTickets(t);
    assert.ok(errors.some((e) => e.startsWith(field)), `expected a message starting with ${field}, got ${JSON.stringify(errors)}`);
  });
}

test('validateTickets accepts both mcpHeader forms', () => {
  for (const header of ['Authorization: Bearer', 'X-Api-Key']) {
    const t = specExample();
    t.sources[2].mcpHeader = header;
    assert.deepEqual(validateTickets(t), [], header);
  }
});

test('validateTickets rejects a block that is not an object with a sources list', () => {
  assert.ok(validateTickets('gitlab').length > 0);
  assert.ok(validateTickets({ sources: 'GL' }).some((e) => e.startsWith('tickets.sources')));
});

test('an invalid block keeps local ids working and refuses its own prefixes', () => {
  const t = specExample();
  delete t.sources[0].namespace;
  assert.deepEqual(resolveTicket(marker(t), 'PROJ-88'), { provider: 'local' });
  assert.throws(() => resolveTicket(marker(t), 'GL-42'),
    (err) => err instanceof TicketError && err.code === 'bad-tickets' && /tickets\.sources\[0\]\.namespace/.test(err.message));
});

test('effectiveTransport: the source overrides the block; Odoo is always mcp', () => {
  const t = specExample();
  t.sources[0].transport = 'cli';
  assert.equal(effectiveTransport(t, t.sources[0]), 'cli');
  assert.equal(effectiveTransport(t, t.sources[1]), 'auto');
  t.transport = 'cli';
  assert.equal(effectiveTransport(t, t.sources[2]), 'mcp');
  assert.equal(effectiveTransport({ sources: [] }, { provider: 'github' }), 'auto');
});

test('serverId lowercases the prefix', () => {
  assert.equal(serverId('GL'), 'tickets-gl');
  assert.equal(serverId('ODOO'), 'tickets-odoo');
});
