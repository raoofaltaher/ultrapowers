// Tracker write-back and reads for the autopilot engine, through the user's own gh or glab.
// Node built-ins only. Every argument comes from the marker, the state or a parsed number;
// free text (a comment body, a PR body) travels on stdin or as one argv element, never through a shell.

import fs from 'node:fs';
import { execFile } from 'node:child_process';
import { AutopilotError } from './autopilot-lib.mjs';
import { createOdooClient, htmlToText, textToNoteHtml, tagEventsFromTracking, lastWriterEvents, odooColorIndex, odooIso } from './odoo.mjs';

const CLI = {
  github: { name: 'gh', env: 'ULTRAPOWERS_GH' },
  gitlab: { name: 'glab', env: 'ULTRAPOWERS_GLAB' },
};
const PAGE = 100;
const NOT_FOUND = /not found|404/i;

function timeoutMs(env) {
  const value = Number(env.ULTRAPOWERS_FETCH_TIMEOUT_MS);
  return Number.isFinite(value) && value > 0 ? value : 30000;
}

// Runs the provider's CLI once. Resolves { stdout, stderr }; rejects with no-cli, timeout or tracker-failed.
function run(resolution, env, args, stdin) {
  const { provider, host } = resolution;
  const override = env[CLI[provider].env];
  const command = override || CLI[provider].name;
  const script = /\.[cm]?js$/i.test(command);
  const [file, argv] = script ? [process.execPath, [command, ...args]] : [command, args];
  const childEnv = provider === 'gitlab' ? { ...env, GITLAB_HOST: host } : env;
  return new Promise((resolve, reject) => {
    if (script && !fs.existsSync(command)) {
      return reject(new AutopilotError('no-cli', `${CLI[provider].name} override ${command} does not exist`));
    }
    const child = execFile(file, argv, { env: childEnv, timeout: timeoutMs(env), windowsHide: true, maxBuffer: 16 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (!error) return resolve({ stdout: String(stdout ?? ''), stderr: String(stderr ?? '') });
      if (error.code === 'ENOENT') return reject(new AutopilotError('no-cli', `${CLI[provider].name} is not on PATH (${file})`));
      if (error.killed) return reject(new AutopilotError('timeout', `${CLI[provider].name} ${args.slice(0, 2).join(' ')} took longer than ${timeoutMs(env)} ms`));
      const err = new AutopilotError('tracker-failed', `${CLI[provider].name} ${args.slice(0, 2).join(' ')} failed: ${String(stderr ?? '').trim() || error.message}`);
      err.stderr = String(stderr ?? '');
      return reject(err);
    });
    if (stdin !== undefined && child.stdin) {
      child.stdin.on('error', () => {});
      child.stdin.end(stdin);
    } else if (child.stdin) {
      child.stdin.end();
    }
  });
}

function parseJson(text, what) {
  try {
    return JSON.parse(text);
  } catch (err) {
    throw new AutopilotError('tracker-failed', `${what} did not return JSON: ${err.message}`);
  }
}

function lastUrl(text) {
  const urls = String(text).match(/https?:\/\/\S+/g);
  return urls ? urls[urls.length - 1] : '';
}

class GitHubTracker {
  constructor(resolution, env) {
    this.r = resolution;
    this.env = env;
    this.path = resolution.path;
  }

  async cliReady() {
    try {
      await run(this.r, this.env, ['auth', 'status', '--hostname', this.r.host]);
      return true;
    } catch {
      return false;
    }
  }

  async me() {
    const out = await run(this.r, this.env, ['api', 'user']);
    return parseJson(out.stdout, 'gh api user').login;
  }

  async listTickets(label) {
    const out = await run(this.r, this.env, ['issue', 'list', '-R', this.path, '--label', label, '--state', 'open', '--limit', '100', '--json', 'number,title,updatedAt']);
    return parseJson(out.stdout, 'gh issue list').map((i) => ({ number: i.number, title: i.title, updatedAt: i.updatedAt }));
  }

  async title(number) {
    const out = await run(this.r, this.env, ['issue', 'view', String(number), '-R', this.path, '--json', 'title']);
    return parseJson(out.stdout, 'gh issue view').title ?? '';
  }

  async labels(number) {
    const out = await run(this.r, this.env, ['issue', 'view', String(number), '-R', this.path, '--json', 'labels']);
    return (parseJson(out.stdout, 'gh issue view').labels ?? []).map((l) => l.name);
  }

  async pages(endpoint) {
    const out = await run(this.r, this.env, ['api', endpoint, '--paginate', '--slurp']);
    const data = parseJson(out.stdout, `gh api ${endpoint}`);
    return Array.isArray(data) && data.every(Array.isArray) ? data.flat() : data;
  }

  async labelEvents(number) {
    const items = await this.pages(`repos/${this.path}/issues/${number}/timeline`);
    return items
      .filter((e) => e.event === 'labeled' || e.event === 'unlabeled')
      .map((e) => ({ id: String(e.id ?? e.node_id), action: e.event, label: e.label?.name ?? '', actor: e.actor?.login ?? '', at: e.created_at }));
  }

  async comments(number, sinceIso) {
    const query = sinceIso ? `?since=${encodeURIComponent(sinceIso)}&per_page=${PAGE}` : `?per_page=${PAGE}`;
    const items = await this.pages(`repos/${this.path}/issues/${number}/comments${query}`);
    return items
      .filter((c) => !sinceIso || c.created_at > sinceIso)
      .map((c) => ({ id: String(c.id), author: c.user?.login ?? '', at: c.created_at, body: c.body ?? '', url: c.html_url ?? '' }));
  }

  async permission(login) {
    try {
      const out = await run(this.r, this.env, ['api', `repos/${this.path}/collaborators/${login}/permission`]);
      const p = parseJson(out.stdout, 'gh api permission').permission;
      return ['admin', 'maintain', 'write', 'read'].includes(p) ? p : 'none';
    } catch (err) {
      if (err.code === 'tracker-failed' && NOT_FOUND.test(err.stderr ?? err.message)) return 'none';
      throw err;
    }
  }

  async comment(number, body) {
    const out = await run(this.r, this.env, ['issue', 'comment', String(number), '-R', this.path, '--body-file', '-'], body);
    return lastUrl(out.stdout);
  }

  // The tracker's own creation time of a comment, from its URL; null when it cannot be read.
  async commentTime(url) {
    const id = /#issuecomment-(\d+)/.exec(String(url ?? ''))?.[1];
    if (!id) return null;
    const out = await run(this.r, this.env, ['api', `repos/${this.path}/issues/comments/${id}`]);
    const at = parseJson(out.stdout, 'gh api comment').created_at;
    return typeof at === 'string' && at ? at : null;
  }

  async addLabel(number, name) {
    await run(this.r, this.env, ['issue', 'edit', String(number), '-R', this.path, '--add-label', name]);
  }

  async removeLabel(number, name) {
    await run(this.r, this.env, ['issue', 'edit', String(number), '-R', this.path, '--remove-label', name]);
  }

  async ensureLabel(name, color, description) {
    await run(this.r, this.env, ['label', 'create', name, '-R', this.path, '--color', color, '--description', description, '--force']);
  }

  async createPr({ head, base, title, body }) {
    const out = await run(this.r, this.env, ['pr', 'create', '-R', this.path, '--head', head, '--base', base, '--title', title, '--body-file', '-'], body);
    return lastUrl(out.stdout);
  }

  async prComment(url, body) {
    const out = await run(this.r, this.env, ['pr', 'comment', url, '--body-file', '-'], body);
    return lastUrl(out.stdout);
  }
}

class GitLabTracker {
  constructor(resolution, env) {
    this.r = resolution;
    this.env = env;
    this.path = resolution.path;
    this.enc = encodeURIComponent(resolution.path);
  }

  async cliReady() {
    try {
      await run(this.r, this.env, ['auth', 'status', '--hostname', this.r.host]);
      return true;
    } catch {
      return false;
    }
  }

  async me() {
    const out = await run(this.r, this.env, ['api', 'user']);
    return parseJson(out.stdout, 'glab api user').username;
  }

  async listTickets(label) {
    const out = await run(this.r, this.env, ['issue', 'list', '-R', this.path, '-l', label, '-F', 'json']);
    return parseJson(out.stdout, 'glab issue list').map((i) => ({ number: i.iid, title: i.title, updatedAt: i.updated_at }));
  }

  async title(number) {
    const out = await run(this.r, this.env, ['issue', 'view', String(number), '-R', this.path, '-F', 'json']);
    return parseJson(out.stdout, 'glab issue view').title ?? '';
  }

  async labels(number) {
    const out = await run(this.r, this.env, ['issue', 'view', String(number), '-R', this.path, '-F', 'json']);
    return (parseJson(out.stdout, 'glab issue view').labels ?? []).map((l) => (typeof l === 'string' ? l : l.name));
  }

  async pages(endpoint) {
    const all = [];
    for (let page = 1; ; page += 1) {
      const sep = endpoint.includes('?') ? '&' : '?';
      const out = await run(this.r, this.env, ['api', `${endpoint}${sep}per_page=${PAGE}&page=${page}`]);
      const items = parseJson(out.stdout, `glab api ${endpoint}`);
      all.push(...items);
      if (items.length < PAGE) break;
    }
    return all;
  }

  async labelEvents(number) {
    const items = await this.pages(`projects/${this.enc}/issues/${number}/resource_label_events`);
    return items.map((e) => ({
      id: String(e.id), action: e.action === 'add' ? 'labeled' : 'unlabeled', label: e.label?.name ?? '', actor: e.user?.username ?? '', at: e.created_at,
    }));
  }

  async comments(number, sinceIso) {
    const items = await this.pages(`projects/${this.enc}/issues/${number}/notes?sort=asc&order_by=created_at`);
    return items
      .filter((n) => !n.system && (!sinceIso || n.created_at > sinceIso))
      .map((n) => ({ id: String(n.id), author: n.author?.username ?? '', at: n.created_at, body: n.body ?? '', url: '' }));
  }

  async permission(login) {
    const users = parseJson((await run(this.r, this.env, ['api', `users?username=${encodeURIComponent(login)}`])).stdout, 'glab api users');
    if (!Array.isArray(users) || users.length === 0) return 'none';
    try {
      const out = await run(this.r, this.env, ['api', `projects/${this.enc}/members/all/${users[0].id}`]);
      const level = Number(parseJson(out.stdout, 'glab api members').access_level);
      if (level >= 50) return 'admin';
      if (level >= 40) return 'write';
      if (level >= 10) return 'read';
      return 'none';
    } catch (err) {
      if (err.code === 'tracker-failed' && NOT_FOUND.test(err.stderr ?? err.message)) return 'none';
      throw err;
    }
  }

  async comment(number, body) {
    const out = await run(this.r, this.env, ['issue', 'note', String(number), '-R', this.path, '-m', body]);
    return lastUrl(out.stdout);
  }

  // The tracker's own creation time of a note, from its URL; null when it cannot be read.
  async commentTime(url) {
    const m = /issues\/(\d+)#note_(\d+)/.exec(String(url ?? ''));
    if (!m) return null;
    const out = await run(this.r, this.env, ['api', `projects/${this.enc}/issues/${m[1]}/notes/${m[2]}`]);
    const at = parseJson(out.stdout, 'glab api note').created_at;
    return typeof at === 'string' && at ? at : null;
  }

  async addLabel(number, name) {
    await run(this.r, this.env, ['issue', 'update', String(number), '-R', this.path, '--label', name]);
  }

  async removeLabel(number, name) {
    await run(this.r, this.env, ['issue', 'update', String(number), '-R', this.path, '--unlabel', name]);
  }

  async ensureLabel(name, color, description) {
    try {
      await run(this.r, this.env, ['label', 'create', '-R', this.path, '--name', name, '--color', `#${color.replace(/^#/, '')}`, '--description', description]);
    } catch (err) {
      if (err.code === 'tracker-failed' && /already exists|has already been taken/i.test(err.stderr ?? err.message)) return;
      throw err;
    }
  }

  async createPr({ head, base, title, body }) {
    const out = await run(this.r, this.env, ['mr', 'create', '-R', this.path, '--source-branch', head, '--target-branch', base, '--title', title, '--description', body, '--yes']);
    return lastUrl(out.stdout);
  }

  async prComment(url, body) {
    const m = /^https?:\/\/[^/]+\/(.+?)\/-\/merge_requests\/(\d+)/.exec(String(url ?? ''));
    if (!m) throw new AutopilotError('tracker-failed', `${url} is not a GitLab merge request URL`);
    const out = await run(this.r, this.env, ['mr', 'note', m[2], '-R', m[1], '-m', body]);
    return lastUrl(out.stdout);
  }
}

// Odoo tasks (spec 2026-10-05 §5): JSON-RPC with the technical user's key in ODOO_API_KEY. Tag events
// come from the chatter's tracking values when the tags field is tracked, else from the last writer.
const TASK_FIELDS = ['name', 'tag_ids', 'write_uid', 'write_date'];

function odooDate(iso) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? String(iso) : d.toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, '');
}

class OdooTracker {
  constructor(resolution, env) {
    this.r = resolution;
    this.env = env;
    this.path = resolution.path;
    this.project = Number(resolution.path);
    this.c = null;
    this.cache = { partners: new Map(), users: new Map(), groups: null, tracked: undefined };
  }

  client() {
    if (!this.c) this.c = createOdooClient({ url: this.r.url, db: this.r.db, login: this.r.login, apiKey: this.env.ODOO_API_KEY, env: this.env });
    return this.c;
  }

  call(model, method, args, kwargs) {
    return this.client().call(model, method, args, kwargs);
  }

  async cliReady() {
    try {
      await this.client().authenticate();
      return true;
    } catch {
      return false;
    }
  }

  async me() {
    return this.r.login;
  }

  async listTickets(label) {
    const rows = await this.call('project.task', 'search_read', [[['project_id', '=', this.project], ['tag_ids.name', '=', label], ['is_closed', '=', false]]], { fields: ['id', 'name', 'write_date'] });
    return rows.map((r) => ({ number: r.id, title: r.name ?? '', updatedAt: odooIso(r.write_date) }));
  }

  async task(number) {
    const [task] = await this.call('project.task', 'read', [[Number(number)]], { fields: TASK_FIELDS });
    if (!task) throw new AutopilotError('tracker-failed', `Odoo task ${number} was not found`);
    return task;
  }

  async tagNames(ids) {
    if (!ids?.length) return [];
    return (await this.call('project.tags', 'read', [ids], { fields: ['name'] })).map((t) => t.name);
  }

  async title(number) {
    return (await this.task(number)).name ?? '';
  }

  async labels(number) {
    return this.tagNames((await this.task(number)).tag_ids ?? []);
  }

  // Tag events come from the chatter's tracking values when the tags field is tracked and the
  // technical user may read them: from Odoo 19 that read is reserved to administrators, and a
  // refusal means the last-writer attribution (spec D3), not a failed run.
  async tagsTracked() {
    if (this.cache.tracked === undefined) {
      const rows = await this.call('ir.model.fields', 'search_read', [[['model', '=', 'project.task'], ['name', '=', 'tag_ids']]], { fields: ['tracking'] });
      let tracked = Boolean(rows[0]?.tracking);
      if (tracked) {
        try {
          await this.call('mail.tracking.value', 'search_read', [[['id', '=', 0]]], { fields: ['id'], limit: 1 });
        } catch (err) {
          if (err.code !== 'tracker-failed' || !/not allowed to access|not enough rights/i.test(err.message)) throw err;
          tracked = false;
        }
      }
      this.cache.tracked = tracked;
    }
    return this.cache.tracked;
  }

  async loginOfPartner(partnerId) {
    if (!partnerId) return '';
    if (!this.cache.partners.has(partnerId)) {
      const rows = await this.call('res.users', 'search_read', [[['partner_id', '=', partnerId]]], { fields: ['login'] });
      this.cache.partners.set(partnerId, rows[0]?.login ?? '');
    }
    return this.cache.partners.get(partnerId);
  }

  async loginOfUser(uid) {
    if (!uid) return '';
    if (!this.cache.users.has(uid)) {
      const rows = await this.call('res.users', 'read', [[uid]], { fields: ['login'] });
      this.cache.users.set(uid, rows[0]?.login ?? '');
    }
    return this.cache.users.get(uid);
  }

  async labelEvents(number) {
    const task = await this.task(number);
    if (!(await this.tagsTracked())) {
      const names = await this.tagNames(task.tag_ids ?? []);
      const login = await this.loginOfUser(task.write_uid?.[0]);
      return lastWriterEvents(task, names, () => login);
    }
    const messages = await this.call('mail.message', 'search_read', [[['model', '=', 'project.task'], ['res_id', '=', Number(number)], ['tracking_value_ids', '!=', false]]], { fields: ['id', 'date', 'author_id', 'tracking_value_ids'] });
    if (!messages.length) return [];
    const rows = await this.call('mail.tracking.value', 'search_read', [[['mail_message_id', 'in', messages.map((m) => m.id)], ['field_id.name', '=', 'tag_ids'], ['field_id.model', '=', 'project.task']]], { fields: ['mail_message_id', 'field_id', 'old_value_char', 'new_value_char'] });
    const known = (await this.call('project.tags', 'search_read', [[]], { fields: ['name'] })).map((t) => t.name);
    const logins = new Map();
    for (const m of messages) {
      const pid = m.author_id?.[0];
      if (pid && !logins.has(pid)) logins.set(pid, await this.loginOfPartner(pid));
    }
    return tagEventsFromTracking(messages, rows, known, (author) => logins.get(author?.[0]) ?? '');
  }

  async comments(number, sinceIso) {
    const domain = [['model', '=', 'project.task'], ['res_id', '=', Number(number)], ['message_type', '=', 'comment']];
    if (sinceIso) domain.push(['date', '>', odooDate(sinceIso)]);
    const rows = await this.call('mail.message', 'search_read', [domain], { fields: ['id', 'date', 'author_id', 'body'], order: 'date asc' });
    const out = [];
    for (const m of rows) {
      out.push({ id: String(m.id), author: await this.loginOfPartner(m.author_id?.[0]), at: odooIso(m.date), body: htmlToText(m.body), url: '' });
    }
    return out;
  }

  async projectGroups() {
    if (!this.cache.groups) {
      const ids = [];
      for (const xmlid of ['group_project_user', 'group_project_manager']) {
        try {
          const ref = await this.call('ir.model.data', 'check_object_reference', ['project', xmlid]);
          if (Array.isArray(ref)) ids.push(Number(ref[1]));
        } catch (err) {
          if (err.code !== 'tracker-failed') throw err;
        }
      }
      this.cache.groups = ids;
    }
    return this.cache.groups;
  }

  // The field that carries a user's groups: `groups_id` up to Odoo 18; from Odoo 19
  // `all_group_ids` (the groups with the ones they imply) and `group_ids`. Read once per run.
  async userGroupsField() {
    if (!this.cache.userGroupsField) {
      const candidates = ['all_group_ids', 'groups_id', 'group_ids'];
      const rows = await this.call('ir.model.fields', 'search_read', [[['model', '=', 'res.users'], ['name', 'in', candidates]]], { fields: ['name'] });
      const names = new Set(rows.map((r) => r.name));
      this.cache.userGroupsField = candidates.find((c) => names.has(c)) ?? 'groups_id';
    }
    return this.cache.userGroupsField;
  }

  async permission(login) {
    const groupsField = await this.userGroupsField();
    const rows = await this.call('res.users', 'search_read', [[['login', '=', login]]], { fields: ['id', 'share', groupsField] });
    const user = rows[0];
    if (!user || user.share) return 'none';
    const groups = await this.projectGroups();
    return (user[groupsField] ?? []).some((g) => groups.includes(g)) ? 'write' : 'read';
  }

  async comment(number, body) {
    const id = await this.call('project.task', 'message_post', [[Number(number)]], { body: textToNoteHtml(body), message_type: 'comment', subtype_xmlid: 'mail.mt_note' });
    return `${this.r.url.replace(/\/+$/, '')}/web#model=project.task&id=${number}&message=${id}`;
  }

  async commentTime(url) {
    const id = /[?&#]message=(\d+)/.exec(String(url ?? ''))?.[1];
    if (!id) return null;
    const rows = await this.call('mail.message', 'read', [[Number(id)]], { fields: ['date'] });
    const at = odooIso(rows[0]?.date);
    return at || null;
  }

  async tagId(name, { create = false, color = 1 } = {}) {
    const rows = await this.call('project.tags', 'search_read', [[['name', '=', name]]], { fields: ['id'] });
    if (rows[0]) return rows[0].id;
    if (!create) return null;
    const created = await this.call('project.tags', 'create', [[{ name, color }]]);
    return Array.isArray(created) ? created[0] : created;
  }

  async addLabel(number, name) {
    const id = await this.tagId(name, { create: true });
    await this.call('project.task', 'write', [[Number(number)], { tag_ids: [[4, id]] }]);
  }

  // A tag the task does not carry is not written: a write would make the engine the task's last
  // writer, which is the approver's evidence on an instance without tag tracking (spec D3).
  async removeLabel(number, name) {
    const id = await this.tagId(name);
    if (id === null) return;
    const task = await this.task(number);
    if (!(task.tag_ids ?? []).includes(id)) return;
    await this.call('project.task', 'write', [[Number(number)], { tag_ids: [[3, id]] }]);
  }

  async ensureLabel(name, color) {
    await this.tagId(name, { create: true, color: odooColorIndex(color) });
  }

  async createPr() {
    throw new AutopilotError('no-forge', 'an Odoo ticket opens pull requests on the forge of each repository, never on Odoo');
  }

  async prComment() {
    throw new AutopilotError('no-forge', 'an Odoo task is not a forge; pull request comments go to the repository\'s forge');
  }
}

// The tracker for a resolved source: { provider: 'github'|'gitlab'|'odoo', host, path, number, ... }.
export function trackerFor(resolution, env = process.env) {
  if (resolution.provider === 'github') return new GitHubTracker(resolution, env);
  if (resolution.provider === 'gitlab') return new GitLabTracker(resolution, env);
  if (resolution.provider === 'odoo') return new OdooTracker(resolution, env);
  throw new AutopilotError('no-writeback', `${resolution.provider} has no write-back in this version; GitHub, GitLab and Odoo do`);
}
