import test from 'node:test';
import assert from 'node:assert/strict';
import { startOdooFake, seed } from './fixtures/odoo-fake.mjs';
import { createOdooClient, discoverDb } from '../../skills/autopilot/scripts/odoo.mjs';

const fakes = [];
async function fake(s) {
  const f = await startOdooFake(s);
  fakes.push(f);
  return f;
}
test.after(async () => { for (const f of fakes) await f.close(); });

test('authenticate returns the uid and call sends execute_kw with db, uid and key', async () => {
  const f = await fake(seed({ models: { 'project.task': { read: () => [{ id: 13, name: 'x' }] } } }));
  const c = createOdooClient({ url: f.url, db: 'erp', login: 'bot', apiKey: 'k1' });
  assert.equal(await c.authenticate(), 7);
  await c.call('project.task', 'read', [[13]], { fields: ['name'] });
  assert.deepEqual(f.calls.at(-1), { model: 'project.task', method: 'read', args: [[13]], kwargs: { fields: ['name'] } });
  assert.deepEqual(f.requests.at(-1).params.args.slice(0, 3), ['erp', 7, 'k1']);
});

test('a missing key is no-credentials before any request', () => {
  assert.throws(() => createOdooClient({ url: 'http://x', db: 'erp', login: 'bot', apiKey: undefined }), (e) => e.code === 'no-credentials');
  assert.throws(() => createOdooClient({ url: 'http://x', db: 'erp', login: undefined, apiKey: 'k' }), (e) => e.code === 'no-credentials');
});

test('an Odoo error becomes tracker-failed with Odoo\'s message', async () => {
  const f = await fake(seed({ models: { 'project.task': { read: () => { throw new Error('Access Denied'); } } } }));
  await assert.rejects(
    createOdooClient({ url: f.url, db: 'erp', login: 'bot', apiKey: 'k1' }).call('project.task', 'read', [[1]]),
    (e) => e.code === 'tracker-failed' && /Access Denied/.test(e.message),
  );
});

test('a refused login is tracker-failed', async () => {
  const f = await fake(seed());
  await assert.rejects(createOdooClient({ url: f.url, db: 'erp', login: 'bot', apiKey: 'wrong' }).authenticate(), (e) => e.code === 'tracker-failed' && /refused/.test(e.message));
});

test('a slow server is a timeout', async () => {
  const f = await fake(seed({ delayMs: 200 }));
  await assert.rejects(
    createOdooClient({ url: f.url, db: 'erp', login: 'bot', apiKey: 'k1', env: { ULTRAPOWERS_FETCH_TIMEOUT_MS: '50' } }).authenticate(),
    (e) => e.code === 'timeout',
  );
});

test('discoverDb returns the single database', async () => {
  const f = await fake(seed({ databases: ['erp'] }));
  assert.equal(await discoverDb(f.url), 'erp');
});

test('discoverDb rejects with bad-tickets when the list is disabled or ambiguous', async () => {
  for (const s of [seed({ listDisabled: true }), seed({ databases: ['a', 'b'] })]) {
    const f = await fake(s);
    await assert.rejects(discoverDb(f.url), (e) => e.code === 'bad-tickets' && /db is required/.test(e.message));
  }
});
