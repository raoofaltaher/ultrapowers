// Odoo for the autopilot engine: a JSON-RPC client over Node's built-in fetch, and the Odoo rules
// (HTML both ways, the tracking-value diff, task URLs, colours). Node built-ins only. The only
// host ever called is the `url` of a configured Odoo ticket source (spec D1).
import { AutopilotError } from './autopilot-lib.mjs';

function timeoutMs(env) {
  const value = Number(env?.ULTRAPOWERS_FETCH_TIMEOUT_MS);
  return Number.isFinite(value) && value > 0 ? value : 30000;
}

async function postJson(url, payload, env, what) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs(env));
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch { json = null; }
    return { status: res.status, json, text };
  } catch (err) {
    if (err?.name === 'AbortError') throw new AutopilotError('timeout', `${what} took longer than ${timeoutMs(env)} ms`);
    throw new AutopilotError('tracker-failed', `${what} failed: ${err?.message ?? err}`);
  } finally {
    clearTimeout(timer);
  }
}

// The client for one Odoo source. `authenticate` runs once and is cached; `call` is execute_kw.
export function createOdooClient({ url, db, login, apiKey, env = process.env }) {
  const base = String(url ?? '').replace(/\/+$/, '');
  if (!apiKey) throw new AutopilotError('no-credentials', `ODOO_API_KEY is not set; the engine reaches ${base} with a technical user's API key`);
  if (!login) throw new AutopilotError('no-credentials', `tickets.sources[].login is not set for ${base}; the engine signs in as a technical user`);
  let id = 0;
  let uidPromise = null;

  async function rpc(service, method, args) {
    id += 1;
    const what = `Odoo ${service}.${method}${service === 'object' ? ` ${args[3]}.${args[4]}` : ''}`;
    const { status, json } = await postJson(`${base}/jsonrpc`, { jsonrpc: '2.0', method: 'call', id, params: { service, method, args } }, env, what);
    if (status !== 200 || !json) throw new AutopilotError('tracker-failed', `${what} answered HTTP ${status}`);
    if (json.error) {
      const message = json.error.data?.message ?? json.error.message ?? 'unknown error';
      throw new AutopilotError('tracker-failed', `${what} failed: ${message}`);
    }
    return json.result;
  }

  function authenticate() {
    if (!uidPromise) {
      uidPromise = rpc('common', 'authenticate', [db, login, apiKey, {}]).then((uid) => {
        if (!uid) throw new AutopilotError('tracker-failed', `Odoo at ${base} refused the login ${login} with the key in ODOO_API_KEY`);
        return uid;
      }).catch((err) => {
        uidPromise = null;
        throw err;
      });
    }
    return uidPromise;
  }

  async function call(model, method, args = [], kwargs = {}) {
    const uid = await authenticate();
    return rpc('object', 'execute_kw', [db, uid, apiKey, model, method, args, kwargs]);
  }

  return { authenticate, call, url: base };
}

// The one database of a server whose list is public; anything else asks for tickets.sources[].db.
export async function discoverDb(url, env = process.env) {
  const base = String(url ?? '').replace(/\/+$/, '');
  const { status, json } = await postJson(`${base}/web/database/list`, { jsonrpc: '2.0', method: 'call', params: {} }, env, 'Odoo database list');
  const list = status === 200 && Array.isArray(json?.result) ? json.result : null;
  if (!list) throw new AutopilotError('bad-tickets', `tickets.sources[].db is required: ${base} does not list its databases (HTTP ${status})`);
  if (list.length !== 1) throw new AutopilotError('bad-tickets', `tickets.sources[].db is required: ${base} lists ${list.length} databases`);
  return list[0];
}
