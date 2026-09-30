#!/usr/bin/env node
// Sample app for the QA gatekeeper's live checks (Tasks 10, 12, 13). Node standard library only.
// Roles: user and admin; credentials come from QA_USER_USER / QA_PW_USER and QA_USER_ADMIN /
// QA_PW_ADMIN, never from this file. Languages: en and fr, switched with ?lang= and kept in a
// cookie. Routes: GET /health; GET|POST /login; GET /logout; GET / (items and the add form);
// POST /items; GET /admin (admin only, 403 for user); GET|POST /api/items and
// DELETE /api/items/<id> (admin only), JSON, 401 without a session.
// Seeded defect, on purpose: the French text has no "required" entry, so an empty item name in
// French shows the raw key items.required. A correct QA run reports it as a Localization finding.
import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';

const port = Number(process.env.QA_SAMPLE_PORT || 3917);
const accounts = [
  { role: 'user', name: process.env.QA_USER_USER, password: process.env.QA_PW_USER },
  { role: 'admin', name: process.env.QA_USER_ADMIN, password: process.env.QA_PW_ADMIN },
].filter((account) => account.name && account.password);
const TEXT = {
  en: { title: 'Items', signIn: 'Sign in', user: 'Username', password: 'Password', add: 'Add item', name: 'Item name', admin: 'Administration', home: 'Home', signOut: 'Sign out', denied: 'Access denied', empty: 'No items yet', bad: 'Wrong username or password', required: 'A name is required' },
  fr: { title: 'Articles', signIn: 'Se connecter', user: "Nom d'utilisateur", password: 'Mot de passe', add: 'Ajouter un article', name: "Nom de l'article", admin: 'Administration', home: 'Accueil', signOut: 'Se déconnecter', denied: 'Accès refusé', empty: 'Aucun article', bad: 'Identifiants incorrects' },
};
const sessions = new Map();
const items = [];
let nextId = 1;

const esc = (value) => String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const t = (lang, key) => TEXT[lang][key] ?? `items.${key}`;

function cookies(req) {
  const out = {};
  for (const part of (req.headers.cookie || '').split(';')) {
    const at = part.indexOf('=');
    if (at > 0) out[part.slice(0, at).trim()] = decodeURIComponent(part.slice(at + 1).trim());
  }
  return out;
}

function page(res, status, lang, session, body, headers = {}) {
  const switcher = '<a href="?lang=en">EN</a> <a href="?lang=fr">FR</a>';
  const nav = session
    ? `<nav><a href="/">${t(lang, 'home')}</a>${session.role === 'admin' ? ` <a href="/admin">${t(lang, 'admin')}</a>` : ''} <a href="/logout">${t(lang, 'signOut')}</a> ${switcher}</nav>`
    : `<nav><a href="/login">${t(lang, 'signIn')}</a> ${switcher}</nav>`;
  res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8', ...headers });
  res.end(`<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><title>${t(lang, 'title')}</title></head><body>${nav}<main>${body}</main></body></html>`);
}

function json(res, status, value) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(value));
}

async function readBody(req) {
  let data = '';
  for await (const chunk of req) {
    data += chunk;
    if (data.length > 100000) break;
  }
  return data;
}

function redirect(res, location, headers = {}) {
  res.writeHead(303, { Location: location, ...headers });
  res.end();
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${port}`);
  const jar = cookies(req);
  const asked = url.searchParams.get('lang');
  const lang = TEXT[asked] ? asked : TEXT[jar.lang] ? jar.lang : 'en';
  const langCookie = TEXT[asked] ? { 'Set-Cookie': `lang=${asked}; Path=/` } : {};
  const session = sessions.get(jar.sid);

  if (url.pathname === '/health') return json(res, 200, { status: 'ok' });

  if (url.pathname === '/login' && req.method === 'POST') {
    const form = new URLSearchParams(await readBody(req));
    const account = accounts.find((a) => a.name === form.get('username') && a.password === form.get('password'));
    if (!account) return page(res, 401, lang, null, `<p role="alert">${t(lang, 'bad')}</p>`);
    const sid = randomBytes(16).toString('hex');
    sessions.set(sid, { role: account.role, name: account.name });
    return redirect(res, '/', { 'Set-Cookie': `sid=${sid}; Path=/; HttpOnly; SameSite=Lax` });
  }
  if (url.pathname === '/login') {
    return page(res, 200, lang, null, `<h1>${t(lang, 'signIn')}</h1><form method="post" action="/login"><label>${t(lang, 'user')} <input name="username" autocomplete="username"></label> <label>${t(lang, 'password')} <input name="password" type="password" autocomplete="current-password"></label> <button type="submit">${t(lang, 'signIn')}</button></form>`, langCookie);
  }
  if (url.pathname === '/logout') {
    sessions.delete(jar.sid);
    return redirect(res, '/login', { 'Set-Cookie': 'sid=; Path=/; Max-Age=0' });
  }

  if (url.pathname.startsWith('/api/')) {
    if (!session) return json(res, 401, { message: 'unauthorized' });
    if (url.pathname === '/api/items' && req.method === 'GET') return json(res, 200, items);
    if (url.pathname === '/api/items' && req.method === 'POST') {
      let name = '';
      try {
        name = String(JSON.parse((await readBody(req)) || '{}').name || '').trim();
      } catch {
        return json(res, 400, { message: 'invalid JSON' });
      }
      if (!name) return json(res, 400, { message: t(lang, 'required') });
      const item = { id: nextId++, name, owner: session.name };
      items.push(item);
      return json(res, 201, item);
    }
    const target = /^\/api\/items\/(\d+)$/.exec(url.pathname);
    if (target && req.method === 'DELETE') {
      if (session.role !== 'admin') return json(res, 403, { message: 'forbidden' });
      const index = items.findIndex((item) => item.id === Number(target[1]));
      if (index === -1) return json(res, 404, { message: 'not found' });
      items.splice(index, 1);
      res.writeHead(204);
      return res.end();
    }
    return json(res, 404, { message: 'not found' });
  }

  if (!session) return redirect(res, '/login', langCookie);
  if (url.pathname === '/admin') {
    if (session.role !== 'admin') return page(res, 403, lang, session, `<p role="alert">${t(lang, 'denied')}</p>`, langCookie);
    return page(res, 200, lang, session, `<h1>${t(lang, 'admin')}</h1><p>${items.length}</p>`, langCookie);
  }
  if (url.pathname === '/items' && req.method === 'POST') {
    const name = (new URLSearchParams(await readBody(req)).get('name') || '').trim();
    if (!name) return page(res, 400, lang, session, `<p role="alert">${esc(t(lang, 'required'))}</p>`);
    items.push({ id: nextId++, name, owner: session.name });
    return redirect(res, '/');
  }
  if (url.pathname === '/') {
    const list = items.length ? `<ul>${items.map((item) => `<li>${esc(item.name)}</li>`).join('')}</ul>` : `<p>${t(lang, 'empty')}</p>`;
    return page(res, 200, lang, session, `<h1>${t(lang, 'title')}</h1>${list}<form method="post" action="/items"><label>${t(lang, 'name')} <input name="name"></label> <button type="submit">${t(lang, 'add')}</button></form>`, langCookie);
  }
  return page(res, 404, lang, session, '<p>404</p>', langCookie);
});

server.listen(port, () => process.stdout.write(`sample app on http://localhost:${port}\n`));
