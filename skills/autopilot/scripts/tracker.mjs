// Tracker write-back and reads for the autopilot engine, through the user's own gh or glab.
// Node built-ins only. Every argument comes from the marker, the state or a parsed number;
// free text (a comment body, a PR body) travels on stdin or as one argv element, never through a shell.

import fs from 'node:fs';
import { execFile } from 'node:child_process';
import { AutopilotError } from './autopilot-lib.mjs';

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
}

// The tracker for a resolved source: { provider: 'github'|'gitlab', host, path, number }.
export function trackerFor(resolution, env = process.env) {
  if (resolution.provider === 'github') return new GitHubTracker(resolution, env);
  if (resolution.provider === 'gitlab') return new GitLabTracker(resolution, env);
  throw new AutopilotError('no-writeback', `${resolution.provider} has no write-back in this version; GitHub and GitLab do`);
}
