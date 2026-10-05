// A fake Odoo for the tests: the JSON-RPC surface the engine uses (`common.authenticate`,
// `object.execute_kw`) and `/web/database/list`, on a node http server. `seed.models[model][method]`
// answers each call; every call, request body and write is recorded for the assertions.
import http from 'node:http';
import fs from 'node:fs';

export function seed(overrides = {}) {
  const s = {
    uid: 7, login: 'bot', apiKey: 'k1', databases: ['erp'], listDisabled: false, delayMs: 0,
    models: {}, writes: [], ...overrides,
  };
  return s;
}

// A small Odoo domain matcher for the fake's search_read: =, !=, in, >, >=, <, and dotted paths
// such as tag_ids.name through the seed's related records.
function matches(record, domain, s) {
  return (domain ?? []).every(([field, op, value]) => {
    const actual = valueOf(record, field, s);
    const list = Array.isArray(actual) ? actual : [actual];
    switch (op) {
      case '=': return list.some((a) => a === value) || (value === false && (actual === false || actual == null || (Array.isArray(actual) && actual.length === 0)));
      case '!=': return value === false ? (Array.isArray(actual) ? actual.length > 0 : Boolean(actual)) : !list.some((a) => a === value);
      case 'in': return list.some((a) => value.includes(a));
      case '>': return actual > value;
      case '>=': return actual >= value;
      case '<': return actual < value;
      default: throw new Error(`the fake does not know the operator ${op}`);
    }
  });
}

function valueOf(record, field, s) {
  const [head, ...rest] = field.split('.');
  let v = record[head];
  if (Array.isArray(v) && v.length === 2 && typeof v[1] === 'string' && typeof v[0] === 'number' && rest.length) v = [v[0]];
  if (!rest.length) return Array.isArray(v) && v.length === 2 && typeof v[1] === 'string' ? v[0] : v;
  const related = s.relations?.[`${s.currentModel}.${head}`];
  if (!related) throw new Error(`the fake has no relation for ${s.currentModel}.${head}`);
  const ids = Array.isArray(v) ? v : [v];
  return ids.map((id) => related.find((r) => r.id === id)).filter(Boolean).map((r) => valueOf(r, rest.join('.'), { ...s, currentModel: related.model })).flat();
}

function pick(record, fields) {
  if (!fields || fields.length === 0) return { ...record };
  return Object.fromEntries(['id', ...fields].map((f) => [f, record[f] ?? false]));
}

function searchRead(table, model) {
  return (args, kwargs, s) => {
    const domain = args[0] ?? kwargs.domain ?? [];
    const fields = kwargs.fields ?? args[1] ?? [];
    let rows = table(s).filter((r) => matches(r, domain, { ...s, currentModel: model }));
    if (kwargs.order && /desc/i.test(kwargs.order)) rows = rows.reverse();
    if (kwargs.limit) rows = rows.slice(0, kwargs.limit);
    return rows.map((r) => pick(r, fields));
  };
}

function read(table) {
  return (args, kwargs, s) => {
    const ids = args[0];
    const fields = args[1] ?? kwargs.fields ?? [];
    return table(s).filter((r) => ids.includes(r.id)).map((r) => pick(r, fields));
  };
}

function base64Of(size) {
  return Buffer.alloc(size, 7).toString('base64');
}

// A seed with one project, two tasks, tags, users, chatter and attachments: what the tracker,
// the fetch step and the engine tests need. `tagTracking: false` turns tag tracking off.
export function odooSeedWithTask(overrides = {}) {
  const s = seed({ tagTracking: true, groupsField: 'groups_id', ...overrides });
  s.groups = { 'project.group_project_user': 100, 'project.group_project_manager': 101 };
  // The field that carries a user's groups: `groups_id` up to Odoo 18, `all_group_ids` (with
  // the implied groups) and `group_ids` from Odoo 19. A read of any other field is refused, as
  // the real server refuses it.
  const g = s.groupsField;
  s.users = [
    { id: 7, login: 'bot', partner_id: [17, 'Bot'], share: false, [g]: [100] },
    { id: 9, login: 'val', partner_id: [19, 'Val'], share: false, [g]: [100] },
    { id: 10, login: 'guest', partner_id: [20, 'Guest'], share: true, [g]: [] },
    { id: 11, login: 'intern', partner_id: [21, 'Intern'], share: false, [g]: [] },
  ];
  s.tags = [{ id: 1, name: 'AI', color: 5 }, { id: 2, name: 'Backend', color: 6 }, { id: 3, name: 'Ultrapowers Ready', color: 10 }, { id: 4, name: 'Ultrapowers Approve', color: 4 }];
  s.tasks = [
    {
      id: 13627, name: 'Integration', project_id: [34, 'Platform'], tag_ids: [1, 2, 3], write_uid: [9, 'Val'], write_date: '2026-10-05 08:00:00',
      create_date: '2026-09-29 10:00:00', is_closed: false, stage_id: [5, 'In Progress'], state: '01_in_progress', user_ids: [9],
      description: '<p>Upgrade the integration.</p><p>Mock-up: <a href="https://design.example.com/mockup/1">https://design.example.com/mockup/1</a></p>',
    },
    { id: 13628, name: 'Closed one', project_id: [34, 'Platform'], tag_ids: [3], write_uid: [9, 'Val'], write_date: '2026-10-01 08:00:00', create_date: '2026-09-01 10:00:00', is_closed: true, stage_id: [6, 'Done'], state: '1_done', user_ids: [], description: '' },
  ];
  s.messages = [
    { id: 50, model: 'project.task', res_id: 13627, message_type: 'comment', date: '2026-10-02 18:39:00', dateIso: '2026-10-02T18:39:00Z', author_id: [19, 'Val'], body: '<p>will have kick off today, got access from clients</p>', tracking_value_ids: [] },
    { id: 51, model: 'project.task', res_id: 13627, message_type: 'notification', date: '2026-10-02 19:50:00', dateIso: '2026-10-02T19:50:00Z', author_id: [19, 'Val'], body: '', tracking_value_ids: [1] },
  ];
  s.tracking = [{ id: 1, mail_message_id: [51, 'm'], field_id: [301, 'Tags'], old_value_char: 'AI, Backend', new_value_char: 'AI, Backend, Ultrapowers Approve' }];
  s.fields = [
    { id: 301, model: 'project.task', name: 'tag_ids', tracking: s.tagTracking ? 100 : false },
    { id: 302, model: 'res.users', name: g, tracking: false },
  ];
  s.attachments = [
    { id: 5, name: 'mockup.png', mimetype: 'image/png', file_size: 800, type: 'binary', url: false, res_model: 'project.task', res_id: 13627, datas: base64Of(800) },
    { id: 6, name: 'big.pdf', mimetype: 'application/pdf', file_size: 2 * 1024 * 1024, type: 'binary', url: false, res_model: 'project.task', res_id: 13627, datas: base64Of(16) },
    // An attachment kept outside Odoo (a cloud storage module): no bytes in datas, a URL instead.
    { id: 7, name: 'backlog.md', mimetype: 'text/markdown', file_size: 0, type: 'cloud_storage', url: 'https://files.example.com/13627/backlog.md', res_model: 'project.task', res_id: 13627, datas: '' },
  ];
  s.relations = {
    'project.task.tag_ids': Object.assign(s.tags, { model: 'project.tags' }),
    'mail.tracking.value.field_id': Object.assign(s.fields, { model: 'ir.model.fields' }),
  };
  s.tagId = (name) => s.tags.find((t) => t.name === name)?.id ?? null;
  s.nextId = 1000;
  s.tagTask = (taskId, name, { by = 'val', at = '2026-10-05 09:00:00', tracked = s.tagTracking } = {}) => {
    const task = s.tasks.find((t) => t.id === taskId);
    let tag = s.tags.find((t) => t.name === name);
    if (!tag) { tag = { id: s.nextId++, name, color: 1 }; s.tags.push(tag); }
    const user = s.users.find((u) => u.login === by);
    const before = task.tag_ids.map((id) => s.tags.find((t) => t.id === id).name).join(', ');
    if (!task.tag_ids.includes(tag.id)) task.tag_ids.push(tag.id);
    task.write_uid = [user.id, by];
    task.write_date = at;
    if (tracked) {
      const mid = s.nextId++;
      s.messages.push({ id: mid, model: 'project.task', res_id: taskId, message_type: 'notification', date: at, dateIso: at.replace(' ', 'T') + 'Z', author_id: user.partner_id, body: '', tracking_value_ids: [s.nextId] });
      s.tracking.push({ id: s.nextId++, mail_message_id: [mid, 'm'], field_id: [301, 'Tags'], old_value_char: before, new_value_char: task.tag_ids.map((id) => s.tags.find((t) => t.id === id).name).join(', ') });
    }
  };
  s.models = {
    'project.task': {
      search_read: searchRead((x) => x.tasks, 'project.task'),
      read: read((x) => x.tasks),
      write: (args, kwargs, x) => {
        const [ids, vals] = args;
        for (const task of x.tasks.filter((t) => ids.includes(t.id))) {
          for (const cmd of vals.tag_ids ?? []) {
            if (cmd[0] === 4 && !task.tag_ids.includes(cmd[1])) task.tag_ids.push(cmd[1]);
            if (cmd[0] === 3) task.tag_ids = task.tag_ids.filter((id) => id !== cmd[1]);
            if (cmd[0] === 6) task.tag_ids = [...cmd[2]];
          }
          task.write_uid = [x.uid, 'Bot'];
          task.write_date = x.now ?? '2026-10-05 09:30:00';
        }
        x.writes.push({ model: 'project.task', method: 'write', ids, vals });
        return true;
      },
      message_post: (args, kwargs, x) => {
        // Odoo 17 and later take body_is_html; `bodyIsHtmlUnsupported: true` plays an older server.
        if (x.bodyIsHtmlUnsupported && 'body_is_html' in kwargs) throw new Error("message_post() got an unexpected keyword argument 'body_is_html'");
        const id = x.nextId++;
        const dateIso = x.nowIso ?? new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
        x.messages.push({ id, model: 'project.task', res_id: args[0][0], message_type: kwargs.message_type ?? 'comment', date: dateIso.replace('T', ' ').replace('Z', ''), dateIso, author_id: [17, 'Bot'], body: kwargs.body ?? '', tracking_value_ids: [] });
        x.writes.push({ model: 'project.task', method: 'message_post', ids: args[0], kwargs });
        return id;
      },
    },
    'project.tags': {
      search_read: searchRead((x) => x.tags, 'project.tags'),
      read: read((x) => x.tags),
      create: (args, kwargs, x) => {
        const vals = Array.isArray(args[0]) ? args[0][0] : args[0];
        const tag = { id: x.nextId++, name: vals.name, color: vals.color ?? 1 };
        x.tags.push(tag);
        x.writes.push({ model: 'project.tags', method: 'create', vals });
        return Array.isArray(args[0]) ? [tag.id] : tag.id;
      },
    },
    'mail.message': {
      // On Odoo 19 the tracking values of a message are readable by administrators only;
      // `trackingReadable: false` plays that server.
      search_read: (args, kwargs, x) => {
        if (x.trackingReadable === false && (kwargs.fields ?? args[1] ?? []).includes('tracking_value_ids')) throw new Error('You do not have enough rights to access the field "tracking_value_ids" on Message (mail.message). Please contact your system administrator.');
        return searchRead((y) => y.messages, 'mail.message')(args, kwargs, x);
      },
      read: read((x) => x.messages),
    },
    'mail.tracking.value': {
      search_read: (args, kwargs, x) => {
        if (x.trackingReadable === false) throw new Error("You are not allowed to access 'Mail Tracking Value' (mail.tracking.value) records.");
        return searchRead((y) => y.tracking, 'mail.tracking.value')(args, kwargs, x);
      },
    },
    'ir.model.fields': { search_read: searchRead((x) => x.fields, 'ir.model.fields') },
    'res.users': {
      search_read: (args, kwargs, x) => {
        // Like the real server, a field no user record carries is an error, not `false`.
        const known = new Set(x.users.flatMap((u) => Object.keys(u)));
        for (const f of kwargs.fields ?? args[1] ?? []) {
          if (!known.has(f)) throw new Error(`Invalid field '${f}' on 'res.users'`);
        }
        return searchRead((y) => y.users, 'res.users')(args, kwargs, x);
      },
      read: read((x) => x.users),
    },
    'ir.model.data': {
      check_object_reference: (args, kwargs, x) => {
        const key = `${args[0]}.${args[1]}`;
        if (!(key in x.groups)) throw new Error(`External ID not found: ${key}`);
        return ['res.groups', x.groups[key]];
      },
    },
    'ir.attachment': {
      search_read: searchRead((x) => x.attachments, 'ir.attachment'),
      read: read((x) => x.attachments),
    },
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

// Plain-data setup for a seed built in another process: initial tags per task, then tag changes.
export function applySetup(s, setup = {}) {
  for (const [taskId, tagIds] of Object.entries(setup.initialTags ?? {})) {
    const task = s.tasks.find((t) => t.id === Number(taskId));
    if (task) task.tag_ids = [...tagIds];
  }
  for (const change of setup.tagTasks ?? []) s.tagTask(change.taskId, change.name, change);
  if (typeof setup.taskDescription === 'string') s.tasks[0].description = setup.taskDescription;
  return s;
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
    // The test's control surface when the fake runs as its own process (the engine tests spawn
    // the engine synchronously, which would starve a server in the test process).
    if (url.pathname === '/__fake/state') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ writes: s.writes, messages: s.messages, tasks: s.tasks, tags: s.tags, calls }));
      return;
    }
    if (url.pathname === '/__fake/tagTask') {
      s.tagTask(body.taskId, body.name, body);
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end('{"ok":true}');
      return;
    }
    if (url.pathname === '/web/database/list') {
      if (s.listDisabled) { res.writeHead(403); res.end('{"error":"disabled"}'); return; }
      return answer({ result: s.databases });
    }
    if (url.pathname !== '/jsonrpc') { res.writeHead(404); res.end(); return; }
    if (s.redirectTo) { res.writeHead(307, { location: s.redirectTo }); res.end(); return; }
    requests.push(body);
    const { service, method, args = [] } = body.params ?? {};
    const keyOk = (key) => key === s.apiKey || (s.extraKeys ?? []).includes(key);
    if (service === 'common' && method === 'authenticate') {
      const [, login, key] = args;
      return answer({ result: login === s.login && keyOk(key) ? s.uid : false });
    }
    if (service === 'object' && method === 'execute_kw') {
      const [, uid, key, model, m, margs = [], kwargs = {}] = args;
      if (uid !== s.uid || !keyOk(key)) return answer({ error: rpcError('Access Denied') });
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

// `node odoo-fake.mjs serve --seed '<json>'`: a seeded fake in its own process. The JSON holds the
// seed overrides plus `setup` (see applySetup). Prints one line, {"url":...}, when it listens.
if (process.argv[1] && /odoo-fake\.mjs$/.test(process.argv[1].replace(/\\/g, '/')) && process.argv[2] === 'serve') {
  const at = process.argv.indexOf('--seed');
  const file = process.argv.indexOf('--seed-file');
  const spec = file > -1 ? JSON.parse(fs.readFileSync(process.argv[file + 1], 'utf8')) : at > -1 ? JSON.parse(process.argv[at + 1]) : {};
  const { setup, ...overrides } = spec;
  const s = applySetup(odooSeedWithTask(overrides), setup);
  const fake = await startOdooFake(s);
  process.stdout.write(`${JSON.stringify({ url: fake.url })}\n`);
}
