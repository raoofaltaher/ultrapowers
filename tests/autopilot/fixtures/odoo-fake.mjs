// A fake Odoo for the tests: the JSON-RPC surface the engine uses (`common.authenticate`,
// `object.execute_kw`) and `/web/database/list`, on a node http server. `seed.models[model][method]`
// answers each call; every call, request body and write is recorded for the assertions.
import http from 'node:http';

export function seed(overrides = {}) {
  const s = {
    uid: 7, login: 'bot', apiKey: 'k1', databases: ['erp'], listDisabled: false, delayMs: 0,
    models: {}, writes: [], ...overrides,
  };
  return s;
}

function rpcError(message) {
  return { code: 200, message: 'Odoo Server Error', data: { name: 'odoo.exceptions.AccessError', message } };
}

function readBody(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (c) => { data += c; });
    req.on('end', () => resolve(data));
  });
}

export async function startOdooFake(s = seed()) {
  const calls = [];
  const requests = [];
  const server = http.createServer(async (req, res) => {
    const raw = await readBody(req);
    let body = {};
    try { body = raw ? JSON.parse(raw) : {}; } catch { body = {}; }
    const answer = (payload) => {
      const send = () => { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ jsonrpc: '2.0', id: body.id ?? null, ...payload })); };
      if (s.delayMs) setTimeout(send, s.delayMs); else send();
    };
    const url = new URL(req.url, 'http://x');
    if (url.pathname === '/web/database/list') {
      if (s.listDisabled) { res.writeHead(403); res.end('{"error":"disabled"}'); return; }
      return answer({ result: s.databases });
    }
    if (url.pathname !== '/jsonrpc') { res.writeHead(404); res.end(); return; }
    requests.push(body);
    const { service, method, args = [] } = body.params ?? {};
    if (service === 'common' && method === 'authenticate') {
      const [, login, key] = args;
      return answer({ result: login === s.login && key === s.apiKey ? s.uid : false });
    }
    if (service === 'object' && method === 'execute_kw') {
      const [, uid, key, model, m, margs = [], kwargs = {}] = args;
      if (uid !== s.uid || key !== s.apiKey) return answer({ error: rpcError('Access Denied') });
      calls.push({ model, method: m, args: margs, kwargs });
      const fn = s.models[model]?.[m];
      if (!fn) return answer({ error: rpcError(`the fake has no ${model}.${m}`) });
      try {
        return answer({ result: await fn(margs, kwargs, s) });
      } catch (err) {
        return answer({ error: rpcError(err?.message ?? String(err)) });
      }
    }
    return answer({ error: rpcError(`unknown call ${service}.${method}`) });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  return {
    url: `http://127.0.0.1:${port}`,
    calls,
    requests,
    seed: s,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}
