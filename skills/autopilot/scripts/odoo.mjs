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
      redirect: 'manual',
    });
    if (res.status >= 300 && res.status < 400) {
      throw new AutopilotError('tracker-failed', `${what} answered a redirect to ${res.headers.get('location') ?? 'another address'}; the engine does not follow redirects, so the key stays with the configured host`);
    }
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
const LOOPBACK = /^(localhost|127\.\d+\.\d+\.\d+|\[::1\])$/i;

export function createOdooClient({ url, db, login, apiKey, env = process.env }) {
  const base = String(url ?? '').replace(/\/+$/, '');
  let parsed;
  try {
    parsed = new URL(base);
  } catch {
    throw new AutopilotError('bad-tickets', `tickets.sources[].url ${base} is not a URL`);
  }
  if (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && LOOPBACK.test(parsed.hostname))) {
    throw new AutopilotError('bad-tickets', `tickets.sources[].url must use https (${base}); the API key travels in every call`);
  }
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

// Odoo datetimes are "YYYY-MM-DD HH:MM:SS" in UTC; an ISO string passes through; false is ''.
export function odooIso(value) {
  if (typeof value !== 'string' || !value) return '';
  const m = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2})(?:\.\d+)?$/.exec(value);
  return m ? `${m[1]}T${m[2]}Z` : value;
}

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

function decodeEntities(text) {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, code) => {
    if (code[0] === '#') {
      const n = code[1] === 'x' || code[1] === 'X' ? Number.parseInt(code.slice(2), 16) : Number.parseInt(code.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : m;
    }
    return ENTITIES[code.toLowerCase()] ?? m;
  });
}

// HTML from a description or a chatter message as plain text: block tags become line breaks,
// scripts, styles, every other tag and every data: URI are dropped, entities decoded.
export function htmlToText(html) {
  let s = String(html ?? '');
  s = s.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '');
  s = s.replace(/data:[a-z0-9.+/-]+;base64,[A-Za-z0-9+/=]+/gi, '');
  s = s.replace(/<br\s*\/?>/gi, '\n');
  s = s.replace(/<\/(p|div|li|tr|h[1-6]|blockquote|pre|section|article)\s*>/gi, '\n');
  s = s.replace(/<(p|div|li|tr|h[1-6]|blockquote|pre|section|article|ul|ol|table)\b[^>]*>/gi, '\n');
  s = s.replace(/<[^>]+>/g, '');
  s = decodeEntities(s);
  s = s.replace(/\r\n?/g, '\n').split('\n').map((l) => l.replace(/[ \t]+$/g, '').replace(/^[ \t]+/g, '')).join('\n');
  return s.replace(/\n{2,}/g, '\n').replace(/^\n+|\n+$/g, '');
}

function escapeHtml(text) {
  return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Pre-formatted text (the packet, whose columns are aligned) as a log note: escaped, line
// breaks kept, URLs clickable.
export function textToNoteHtml(text) {
  return `<pre style="white-space:pre-wrap">${linkUrls(escapeHtml(text))}</pre>`;
}

function linkUrls(escaped) {
  return escaped.replace(/https?:\/\/[^\s<"']+/g, (url) => `<a href="${url}">${url}</a>`);
}

// Inline markdown on an escaped line: links, bare URLs, code, bold, italics. A markdown link's
// address is set aside first so the bare-URL pass does not link it twice.
function inlineMarkdown(escaped) {
  const links = [];
  let s = escaped.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (m, text, url) => {
    links.push(`<a href="${url}">${text}</a>`);
    return `\u0000${links.length - 1}\u0000`;
  });
  s = linkUrls(s);
  s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/(^|[\s(])\*([^*\s][^*]*?)\*(?=[\s).,;:!?]|$)/g, '$1<em>$2</em>');
  return s.replace(/\u0000(\d+)\u0000/g, (m, i) => links[Number(i)]);
}

// A markdown document (a QA report, a closing comment) as a log note: headings, pipe tables,
// lists, fenced code and paragraphs, every text escaped. Odoo's chatter shows HTML; markdown
// posted as text appears raw.
export function markdownToNoteHtml(markdown) {
  const lines = String(markdown ?? '').replace(/\r\n?/g, '\n').split('\n');
  const out = [];
  let paragraph = [];
  let list = null;
  const flushParagraph = () => {
    if (paragraph.length) out.push(`<p>${paragraph.map((l) => inlineMarkdown(escapeHtml(l))).join('<br>')}</p>`);
    paragraph = [];
  };
  const flushList = () => {
    if (list) out.push(`<${list.tag}>${list.items.map((i) => `<li>${inlineMarkdown(escapeHtml(i))}</li>`).join('')}</${list.tag}>`);
    list = null;
  };
  const isTableLine = (l) => /^\s*\|.*\|\s*$/.test(l);
  const isSeparator = (l) => /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/.test(l);
  const cells = (l) => l.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => inlineMarkdown(escapeHtml(c.trim())));
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^```/.test(line)) {
      flushParagraph(); flushList();
      const code = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i])) code.push(lines[i++]);
      out.push(`<pre>${escapeHtml(code.join('\n'))}</pre>`);
      continue;
    }
    if (isTableLine(line) && i + 1 < lines.length && isSeparator(lines[i + 1])) {
      flushParagraph(); flushList();
      const head = cells(line);
      const rows = [];
      i += 2;
      while (i < lines.length && isTableLine(lines[i])) rows.push(cells(lines[i++]));
      i--;
      out.push(`<table class="table table-sm"><thead><tr>${head.map((c) => `<th>${c}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table>`);
      continue;
    }
    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      flushParagraph(); flushList();
      const level = Math.min(heading[1].length + 1, 6);
      out.push(`<h${level}>${inlineMarkdown(escapeHtml(heading[2].trim()))}</h${level}>`);
      continue;
    }
    const bullet = /^\s*[-*]\s+(.*)$/.exec(line);
    const numbered = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    if (bullet || numbered) {
      flushParagraph();
      const tag = bullet ? 'ul' : 'ol';
      if (!list || list.tag !== tag) { flushList(); list = { tag, items: [] }; }
      list.items.push((bullet ?? numbered)[1]);
      continue;
    }
    if (!line.trim()) { flushParagraph(); flushList(); continue; }
    flushList();
    paragraph.push(line);
  }
  flushParagraph(); flushList();
  return out.join('');
}

// An Odoo task URL in its three shapes; null for anything else.
export function parseOdooTaskUrl(url) {
  let u;
  try {
    u = new URL(String(url));
  } catch {
    return null;
  }
  if (!/^https?:$/.test(u.protocol)) return null;
  const origin = u.origin;
  let m = /^\/odoo\/action-\d+\/(\d+)\/tasks\/(\d+)\/?$/.exec(u.pathname);
  if (m) return { origin, project: Number(m[1]), task: Number(m[2]) };
  m = /^\/odoo\/project\.task\/(\d+)\/?$/.exec(u.pathname);
  if (m) return { origin, project: null, task: Number(m[1]) };
  if (/^\/web\/?$/.test(u.pathname) && u.hash) {
    const params = new URLSearchParams(u.hash.replace(/^#/, ''));
    if (params.get('model') === 'project.task' && /^\d+$/.test(params.get('id') ?? '')) return { origin, project: null, task: Number(params.get('id')) };
  }
  return null;
}

// Odoo joins many2many display names with ", " in a tracking value. The split is accepted only
// when every piece is a known tag; a tag whose own name holds ", " makes the row ambiguous.
export function splitTagNames(value, knownTags) {
  if (typeof value !== 'string' || value.trim() === '') return [];
  const names = value.split(', ').map((n) => n.trim()).filter(Boolean);
  const known = new Set(knownTags ?? []);
  return names.every((n) => known.has(n)) ? names : null;
}

// Label events from the chatter's tracking values on the tags field, oldest first.
export function tagEventsFromTracking(messages, rows, knownTags, loginOf) {
  const byId = new Map((messages ?? []).map((m) => [Number(m.id), m]));
  const events = [];
  for (const row of rows ?? []) {
    const messageId = Array.isArray(row.mail_message_id) ? Number(row.mail_message_id[0]) : Number(row.mail_message_id);
    const message = byId.get(messageId);
    if (!message) continue;
    const before = splitTagNames(row.old_value_char, knownTags);
    const after = splitTagNames(row.new_value_char, knownTags);
    if (before === null || after === null) continue;
    const at = odooIso(message.date);
    const actor = loginOf(message.author_id) ?? '';
    for (const label of after.filter((n) => !before.includes(n))) events.push({ id: String(message.id), action: 'labeled', label, actor, at });
    for (const label of before.filter((n) => !after.includes(n))) events.push({ id: String(message.id), action: 'unlabeled', label, actor, at });
  }
  return events.sort((a, b) => a.at.localeCompare(b.at));
}

// Without tag tracking, every current tag is attributed to the task's last writer (spec D3).
export function lastWriterEvents(task, tagNames, loginOf) {
  const at = odooIso(task?.write_date);
  const actor = loginOf(task?.write_uid) ?? '';
  return (tagNames ?? []).map((label) => ({ id: `write:${at}`, action: 'labeled', label, actor, at, attribution: 'last-writer' }));
}

// Odoo's eleven tag colours, as the nearest to a label's hex colour.
const ODOO_PALETTE = [
  [1, 0xf0, 0x6a, 0x50], [2, 0xf4, 0xa4, 0x60], [3, 0xf7, 0xcd, 0x1f], [4, 0x6c, 0xc1, 0xed], [5, 0x81, 0x4a, 0x4a],
  [6, 0xeb, 0x7e, 0x7f], [7, 0x2c, 0x8a, 0xa8], [8, 0x47, 0x5c, 0xa8], [9, 0xd6, 0x14, 0x5f], [10, 0x30, 0xc3, 0x81], [11, 0x9a, 0x50, 0xa6],
];

export function odooColorIndex(hex) {
  const clean = String(hex ?? '').replace(/^#/, '');
  if (!/^[0-9a-f]{6}$/i.test(clean)) return 1;
  const [r, g, b] = [0, 2, 4].map((i) => Number.parseInt(clean.slice(i, i + 2), 16));
  let best = 1;
  let bestDistance = Infinity;
  for (const [index, pr, pg, pb] of ODOO_PALETTE) {
    const d = (r - pr) ** 2 + (g - pg) ** 2 + (b - pb) ** 2;
    if (d < bestDistance) {
      bestDistance = d;
      best = index;
    }
  }
  return best;
}
