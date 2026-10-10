#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { effectiveTransport, serverId as ticketServerId, validateTickets, resolveTicket } from '../../new-task/scripts/ticket-sources.mjs';
import { validateAutopilot, odooApproverErrors, DEFAULTS as AUTOPILOT_DEFAULTS, ODOO_EVENTS, loadSecretsFile } from '../../autopilot/scripts/autopilot-lib.mjs';
import { trackerFor } from '../../autopilot/scripts/tracker.mjs';
import { forgeFor } from '../../autopilot/scripts/repos.mjs';
import { transportOnThisMachine } from '../../new-task/scripts/fetch-ticket.mjs';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
export const PLUGIN_ROOT = path.resolve(SCRIPT_DIR, '..', '..', '..');
const TEMPLATES_DIR = process.env.ULTRAPOWERS_TEMPLATES_DIR
  ? path.resolve(process.env.ULTRAPOWERS_TEMPLATES_DIR)
  : path.join(PLUGIN_ROOT, 'templates');
const OUTPUT_STYLE_SOURCE = path.join(PLUGIN_ROOT, 'output-styles', 'ste-explanatory.md');
const OUTPUT_STYLE_TARGET = '.claude/output-styles/ste-explanatory.md';
export const MARKER_PATH = '.agents/ultrapowers.json';
export const BLOCK_START = '# >>> ultrapowers';
export const BLOCK_END = '# <<< ultrapowers';
const SPECIAL_DIRS = new Set(['_blocks', '_nested']);
const NON_TEMPLATE_FILES = new Set(['.mcp.json', 'CHANGES.json']);
const MODES = ['scaffold', 'join', 'upgrade', 'detect', 'tickets', 'autopilot', 'check'];
const SECRETS_EXAMPLE = '.agents/mcp-secrets.env.example';

export const ALL_HARNESSES = [
  'claude-code', 'codex', 'cursor', 'copilot', 'gemini', 'qwen', 'opencode',
  'factory', 'kimi', 'devin', 'antigravity', 'hermes', 'pi', 'muse',
];
export const KB_FOLDERS = [
  'tasks', 'specs', 'plans', 'reviews', 'evals', 'handbooks',
  'brandbook', 'business', 'playbooks', 'release-notes',
];
export const BEST_EFFORT_TARGETS = ['.factory/mcp.json', '.kimi/mcp.json'];

export const TARGET_HARNESS = {
  'CLAUDE.md': 'claude-code',
  '.mcp.json': 'claude-code',
  '.claude/settings.json': 'claude-code',
  [OUTPUT_STYLE_TARGET]: 'claude-code',
  '.codex/config.toml': 'codex',
  '.cursor/mcp.json': 'cursor',
  '.github/copilot-instructions.md': 'copilot',
  '.vscode/settings.json': 'copilot',
  '.vscode/mcp.json': 'copilot',
  'GEMINI.md': 'gemini',
  '.gemini/settings.json': 'gemini',
  '.gemini/hooks/ultrapowers-guardrail.mjs': 'gemini',
  '.qwen/settings.json': 'qwen',
  'opencode.json': 'opencode',
  '.factory/mcp.json': 'factory',
  '.kimi/mcp.json': 'kimi',
};

export const MCP_TARGETS = {
  '.mcp.json': 'claude',
  '.codex/config.toml': 'codex',
  '.cursor/mcp.json': 'cursor',
  '.gemini/settings.json': 'gemini',
  '.qwen/settings.json': 'qwen',
  'opencode.json': 'opencode',
  '.factory/mcp.json': 'factory',
  '.kimi/mcp.json': 'kimi',
  '.vscode/mcp.json': 'vscode',
};

export const CODEX_DEFAULTS = { approval_policy: 'on-request', sandbox_mode: 'workspace-write' };
export const CONTEXT_FILES = { gemini: ['GEMINI.md', 'AGENTS.md'], qwen: ['QWEN.md', 'AGENTS.md'] };
const SECRET_REF = /\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g;
const HAS_SECRET_REF = /\$\{[A-Za-z_][A-Za-z0-9_]*\}/;
const WHOLE_SECRET_REF = /^\$\{([A-Za-z_][A-Za-z0-9_]*)\}$/;

function hasKeys(map) {
  return Boolean(map) && Object.keys(map).length > 0;
}

function toJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function mapSecrets(map, format) {
  const out = {};
  for (const [key, value] of Object.entries(map)) {
    out[key] = String(value).replace(SECRET_REF, (_, name) => format(name));
  }
  return out;
}

// npx is npx.cmd on Windows, which a harness that spawns without a shell cannot
// start (ENOENT); node is a real executable everywhere. So every npx server
// starts as `node -e NPX_LAUNCHER -- <npx args>`, and the launcher runs npx the
// way the machine it lands on needs. One committed file then works on Windows,
// macOS and Linux alike.
export const NPX_LAUNCHER = "const[c,...a]=process.platform==='win32'?['cmd','/d','/c','npx',...process.argv.slice(1)]:['npx',...process.argv.slice(1)];const p=require('child_process').spawn(c,a,{stdio:'inherit'});for(const s of['SIGINT','SIGTERM'])process.on(s,()=>p.kill(s));p.on('exit',(code)=>process.exit(code??1))";

function launch(server) {
  const args = [...(server.args ?? [])];
  if (server.command === 'npx') return { command: 'node', args: ['-e', NPX_LAUNCHER, '--', ...args] };
  return { command: server.command, args };
}

export function validateServers(servers) {
  for (const [id, server] of Object.entries(servers)) {
    const isStdio = server.type === 'stdio' && typeof server.command === 'string' && (server.args ?? []).every((a) => typeof a === 'string');
    const isHttp = server.type === 'http' && typeof server.url === 'string';
    if (!isStdio && !isHttp) {
      throw new InitError('mcp-schema', `templates/.mcp.json server ${id} must be { type: "stdio", command, args } or { type: "http", url }`, { server: id });
    }
  }
}

function jsonServers(servers, secret, { stdioType = true, httpKey = null } = {}) {
  const out = {};
  for (const [id, server] of Object.entries(servers)) {
    if (server.type === 'http') {
      const entry = httpKey ? { [httpKey]: server.url } : { type: 'http', url: server.url };
      if (hasKeys(server.headers)) entry.headers = mapSecrets(server.headers, secret);
      out[id] = entry;
      continue;
    }
    const entry = { ...(stdioType ? { type: 'stdio' } : {}), ...launch(server) };
    if (hasKeys(server.env)) entry.env = mapSecrets(server.env, secret);
    out[id] = entry;
  }
  return out;
}

const dollarRef = (name) => `\${${name}}`;
const cursorRef = (name) => `\${env:${name}}`;
const opencodeRef = (name) => `{env:${name}}`;
const vscodeInputId = (name) => name.toLowerCase().replace(/_/g, '-');

function standardJson(servers) {
  return toJson({ mcpServers: jsonServers(servers, dollarRef) });
}

// Gemini CLI reads an extension's hooks from the same hooks/hooks.json Claude Code uses, under
// another event name; so the guardrail reaches Gemini through a project BeforeTool hook instead,
// pointing at the launcher init writes beside this file. Qwen Code reads PreToolUse from the
// extension itself and needs nothing here.
const GEMINI_GUARDRAIL_HOOK = {
  BeforeTool: [{
    matcher: '.*',
    hooks: [{ name: 'ultrapowers-guardrail', type: 'command', command: 'node "$GEMINI_PROJECT_DIR/.gemini/hooks/ultrapowers-guardrail.mjs"', timeout: 30000 }],
  }],
};

function geminiFamilyJson(schema) {
  return (servers) => toJson({
    context: { fileName: CONTEXT_FILES[schema] },
    mcpServers: jsonServers(servers, dollarRef, { stdioType: false, httpKey: 'httpUrl' }),
    ...(schema === 'gemini' ? { hooks: GEMINI_GUARDRAIL_HOOK } : {}),
  });
}

function opencodeJson(servers) {
  const mcp = {};
  for (const [id, server] of Object.entries(servers)) {
    if (server.type === 'http') {
      const entry = { type: 'remote', url: server.url, enabled: true };
      if (hasKeys(server.headers)) entry.headers = mapSecrets(server.headers, opencodeRef);
      mcp[id] = entry;
      continue;
    }
    const { command, args } = launch(server);
    const entry = { type: 'local', command: [command, ...args], enabled: true };
    if (hasKeys(server.env)) entry.environment = mapSecrets(server.env, opencodeRef);
    mcp[id] = entry;
  }
  return toJson({ $schema: 'https://opencode.ai/config.json', mcp });
}

function vscodeJson(servers) {
  const inputs = new Map();
  const inputRef = (serverId) => (name) => {
    if (!inputs.has(name)) {
      inputs.set(name, { type: 'promptString', id: vscodeInputId(name), description: `${name} for the ${serverId} MCP server`, password: true });
    }
    return `\${input:${vscodeInputId(name)}}`;
  };
  const out = {};
  for (const [id, server] of Object.entries(servers)) {
    if (server.type === 'http') {
      const entry = { type: 'http', url: server.url };
      if (hasKeys(server.headers)) entry.headers = mapSecrets(server.headers, inputRef(id));
      out[id] = entry;
      continue;
    }
    const entry = { type: 'stdio', ...launch(server) };
    if (hasKeys(server.env)) entry.env = mapSecrets(server.env, inputRef(id));
    out[id] = entry;
  }
  const sortedInputs = [...inputs.values()].sort((a, b) => a.id.localeCompare(b.id));
  return toJson({ inputs: sortedInputs, servers: out });
}

const tomlKey = (key) => (/^[A-Za-z0-9_-]+$/.test(key) ? key : JSON.stringify(key));
const tomlString = (value) => JSON.stringify(String(value));
const tomlArray = (values) => `[${values.map(tomlString).join(', ')}]`;

function codexEnv(id, env) {
  const names = [];
  const literal = {};
  for (const [key, value] of Object.entries(env ?? {})) {
    const whole = WHOLE_SECRET_REF.exec(String(value));
    if (whole && whole[1] === key) {
      names.push(key);
    } else if (!HAS_SECRET_REF.test(String(value))) {
      literal[key] = String(value);
    } else {
      throw new InitError('mcp-schema', `server ${id}: Codex passes secrets by variable name only, so env ${key} must be "\${${key}}"`, { server: id });
    }
  }
  return { names, literal };
}

function codexHeaders(id, headers) {
  const byVariable = {};
  const literal = {};
  let bearer = null;
  for (const [header, value] of Object.entries(headers ?? {})) {
    const text = String(value);
    const whole = WHOLE_SECRET_REF.exec(text);
    const token = /^Bearer \$\{([A-Za-z_][A-Za-z0-9_]*)\}$/.exec(text);
    if (whole) {
      byVariable[header] = whole[1];
    } else if (token && header.toLowerCase() === 'authorization') {
      bearer = token[1];
    } else if (!HAS_SECRET_REF.test(text)) {
      literal[header] = text;
    } else {
      throw new InitError('mcp-schema', `server ${id}: Codex cannot embed a secret inside header ${header}`, { server: id });
    }
  }
  return { byVariable, literal, bearer };
}

function codexToml(servers) {
  const lines = [
    `approval_policy = ${tomlString(CODEX_DEFAULTS.approval_policy)}`,
    `sandbox_mode = ${tomlString(CODEX_DEFAULTS.sandbox_mode)}`,
  ];
  for (const [id, server] of Object.entries(servers)) {
    const table = `mcp_servers.${tomlKey(id)}`;
    const subTables = [];
    lines.push('', `[${table}]`);
    if (server.type === 'http') {
      lines.push(`url = ${tomlString(server.url)}`);
      const { byVariable, literal, bearer } = codexHeaders(id, server.headers);
      if (bearer) lines.push(`bearer_token_env_var = ${tomlString(bearer)}`);
      if (hasKeys(byVariable)) subTables.push(['env_http_headers', byVariable]);
      if (hasKeys(literal)) subTables.push(['http_headers', literal]);
    } else {
      const { command, args } = launch(server);
      lines.push(`command = ${tomlString(command)}`, `args = ${tomlArray(args)}`);
      const { names, literal } = codexEnv(id, server.env);
      if (names.length) lines.push(`env_vars = ${tomlArray(names)}`);
      if (hasKeys(literal)) subTables.push(['env', literal]);
    }
    for (const [name, map] of subTables) {
      lines.push('', `[${table}.${name}]`);
      for (const [key, value] of Object.entries(map)) lines.push(`${tomlKey(key)} = ${tomlString(value)}`);
    }
  }
  return `${lines.join('\n')}\n`;
}

export const MCP_GENERATORS = {
  claude: standardJson,
  codex: codexToml,
  cursor: (servers) => toJson({ mcpServers: jsonServers(servers, cursorRef, { httpKey: 'url' }) }),
  gemini: geminiFamilyJson('gemini'),
  qwen: geminiFamilyJson('qwen'),
  opencode: opencodeJson,
  factory: standardJson,
  kimi: standardJson,
  vscode: vscodeJson,
};

export class InitError extends Error {
  constructor(code, message, extra = {}) {
    super(message);
    this.code = code;
    this.extra = extra;
  }
}

export function parseArgs(argv) {
  const opts = {
    mode: argv[0],
    root: process.cwd(),
    name: null,
    harnesses: null,
    nestedPointers: false,
    recordRepos: false,
    apply: null,
    dryRun: false,
    date: new Date().toISOString().slice(0, 10),
    platform: process.platform,
    sources: null,
    tickets: null,
    answers: null,
    autopilotFile: null,
    autopilot: null,
  };
  if (!MODES.includes(opts.mode)) {
    throw new InitError('bad-args', `mode must be one of ${MODES.join(', ')}`);
  }
  for (let i = 1; i < argv.length; i += 1) {
    const arg = argv[i];
    const value = () => {
      i += 1;
      if (i >= argv.length) throw new InitError('bad-args', `${arg} needs a value`);
      return argv[i];
    };
    switch (arg) {
      case '--root': opts.root = path.resolve(value()); break;
      case '--name': opts.name = value(); break;
      case '--harnesses': opts.harnesses = value().split(',').map((s) => s.trim()).filter(Boolean); break;
      case '--nested-pointers': opts.nestedPointers = true; break;
      case '--record-repos': opts.recordRepos = true; break;
      case '--apply': opts.apply = value().split(',').map((s) => s.trim()).filter((s) => s && s !== 'none'); break;
      case '--dry-run': opts.dryRun = true; break;
      case '--date': opts.date = value(); break;
      case '--platform': opts.platform = value(); break;
      case '--sources': opts.sources = path.resolve(value()); break;
      case '--answers': opts.answers = path.resolve(value()); break;
      case '--autopilot': opts.autopilotFile = path.resolve(value()); break;
      default: throw new InitError('bad-args', `unknown argument ${arg}`);
    }
  }
  if (opts.harnesses) {
    const unknown = opts.harnesses.filter((h) => !ALL_HARNESSES.includes(h));
    if (unknown.length) throw new InitError('bad-args', `unknown harness: ${unknown.join(', ')}`);
  }
  return opts;
}

export function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

export function pluginVersion() {
  return readJson(path.join(PLUGIN_ROOT, '.claude-plugin', 'plugin.json')).version;
}

export function compareVersions(a, b) {
  const pa = String(a).split('.').map((n) => parseInt(n, 10) || 0);
  const pb = String(b).split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i += 1) {
    const x = pa[i] ?? 0;
    const y = pb[i] ?? 0;
    if (x < y) return -1;
    if (x > y) return 1;
  }
  return 0;
}

export function render(template, vars, sourceName) {
  // Any {{...}} is a placeholder, so a misspelt key fails instead of shipping braces.
  return template.replace(/\{\{\s*([^{}]*?)\s*\}\}/g, (_, key) => {
    if (!/^[A-Za-z][A-Za-z0-9]*$/.test(key) || !Object.prototype.hasOwnProperty.call(vars, key)) {
      throw new InitError('unknown-placeholder', `template ${sourceName} uses unknown placeholder {{${key}}}`, { template: sourceName, key });
    }
    return vars[key];
  });
}

function lf(text) {
  return text.replace(/\r\n/g, '\n');
}

function provenance(target, content, vars) {
  const line = `generated by ultrapowers init ${vars.pluginVersion} on ${vars.date}; edit freely, init never overwrites this file`;
  const base = path.posix.basename(target);
  if (target.endsWith('.md')) {
    if (content.startsWith('@') || content.startsWith('---')) return content;
    return `<!-- ${line} -->\n${content}`;
  }
  if (target.endsWith('.toml') || base.endsWith('.example')) return `# ${line}\n${content}`;
  if (base === 'pre-commit' && content.startsWith('#!')) {
    const nl = content.indexOf('\n');
    return `${content.slice(0, nl + 1)}# ${line}\n${content.slice(nl + 1)}`;
  }
  if (target.startsWith('.vscode/')) return `// ${line}\n${content}`;
  return content;
}

export function applyBlock(existing, body, target = 'the file') {
  const trimmedBody = body.replace(/^\n+/, '').replace(/\n+$/, '');
  const blockWith = (eol) => [BLOCK_START, ...trimmedBody.split('\n'), BLOCK_END].map((line) => `${line}${eol}`).join('');
  if (existing === null || existing === undefined) {
    return { content: blockWith('\n'), action: 'created' };
  }
  const eol = existing.includes('\r\n') ? '\r\n' : '\n';
  const block = blockWith(eol);
  // Each line keeps its own ending, so bytes outside the block never change.
  const lines = existing.match(/[^\n]*\n|[^\n]+$/g) ?? [];
  const at = (marker) => lines.flatMap((line, i) => (line.replace(/\r?\n$/, '').trimEnd() === marker ? [i] : []));
  const starts = at(BLOCK_START);
  const ends = at(BLOCK_END);
  let next;
  let action;
  if (starts.length === 1 && ends.length === 1 && starts[0] < ends[0]) {
    next = `${lines.slice(0, starts[0]).join('')}${block}${lines.slice(ends[0] + 1).join('')}`;
    action = next === existing ? 'unchanged' : 'replaced';
  } else if (starts.length === 0 && ends.length === 0) {
    let head = existing;
    if (head.length > 0 && !head.endsWith('\n')) head += eol;
    if (head.length > 0) head += eol;
    next = `${head}${block}`;
    action = 'appended';
  } else {
    // A lone or doubled marker would make the next replace swallow the lines between them.
    throw new InitError('block-corrupt', `${target} has ${starts.length} "${BLOCK_START}" and ${ends.length} "${BLOCK_END}" lines; keep exactly one pair around the managed lines, or remove both, then run init again`, { path: target });
  }
  return { content: next, action };
}

// The keys the plugin depends on in a settings file that already exists, compared with what init
// would render. Strict JSON only: a file with comments or a trailing comma is reported unreadable,
// never complete.
const GUARDRAIL_LAUNCHER = 'ultrapowers-guardrail.mjs';

export function missingContent(target, existingText, renderedText) {
  if (target !== '.claude/settings.json' && target !== '.gemini/settings.json') return { missing: [] };
  let existing;
  try {
    existing = JSON.parse(lf(existingText).replace(/^﻿/, ''));
  } catch (err) {
    return { missing: [], unreadable: err.message };
  }
  if (!existing || typeof existing !== 'object' || Array.isArray(existing)) {
    return { missing: [], unreadable: 'the file does not hold a JSON object' };
  }
  const missing = [];
  if (target === '.claude/settings.json') {
    const rendered = JSON.parse(renderedText);
    if (existing.outputStyle !== rendered.outputStyle) missing.push('outputStyle');
    const have = Array.isArray(existing.permissions?.allow) ? existing.permissions.allow : [];
    for (const entry of rendered.permissions?.allow ?? []) {
      if (/^Skill\(ultrapowers:/.test(entry) && !have.includes(entry)) missing.push(entry);
    }
  } else {
    const entries = Array.isArray(existing.hooks?.BeforeTool) ? existing.hooks.BeforeTool : [];
    const names = (entry) => (Array.isArray(entry?.hooks) ? entry.hooks : []).some((h) => typeof h?.command === 'string' && h.command.includes(GUARDRAIL_LAUNCHER));
    if (!entries.some(names)) missing.push('hooks.BeforeTool');
  }
  return { missing };
}

// The remote's default branch (origin/HEAD) when the clone knows it, else the branch checked out.
function defaultBranchOf(repoDir) {
  try {
    const remoteHead = execFileSync('git', ['--git-dir', path.join(repoDir, '.git'), 'symbolic-ref', '--quiet', '--short', 'refs/remotes/origin/HEAD'], {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    if (remoteHead.startsWith('origin/')) return remoteHead.slice('origin/'.length);
  } catch {
    // No origin/HEAD: fall back to HEAD below.
  }
  try {
    const head = fs.readFileSync(path.join(repoDir, '.git', 'HEAD'), 'utf8').trim();
    const match = head.match(/^ref: refs\/heads\/(.+)$/);
    if (match) return match[1];
  } catch {
    return 'main';
  }
  return 'main';
}

export function detectRepos(root) {
  const repos = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith('.') || entry.name === 'node_modules') continue;
    if (!fs.existsSync(path.join(root, entry.name, '.git'))) continue;
    repos.push({ name: entry.name, path: entry.name, defaultBranch: defaultBranchOf(path.join(root, entry.name)) });
  }
  return repos.sort((a, b) => a.name.localeCompare(b.name));
}

export function readMarker(root) {
  const file = path.join(root, MARKER_PATH);
  if (!fs.existsSync(file)) return null;
  let marker;
  try {
    marker = readJson(file);
  } catch (err) {
    throw new InitError('marker-corrupt', `${MARKER_PATH} is not valid JSON: ${err.message}`, { path: file });
  }
  // The marker is project content. Its version is echoed to agents, so only a
  // plain dotted number is accepted; anything else is treated as corrupt.
  if (marker && typeof marker === 'object' && 'pluginVersion' in marker && !PLAIN_VERSION.test(String(marker.pluginVersion))) {
    throw new InitError('marker-corrupt', `${MARKER_PATH} has a pluginVersion that is not a plain version number`, { path: file });
  }
  for (const key of ['repos', 'harnesses']) {
    if (marker && typeof marker === 'object' && key in marker && !Array.isArray(marker[key])) {
      throw new InitError('marker-corrupt', `${MARKER_PATH} has a ${key} value that is not a list`, { path: file });
    }
  }
  return marker;
}

export const PLAIN_VERSION = /^[0-9]+([.][0-9]+){0,3}$/;

export function findMarkerAbove(dir) {
  let current = path.resolve(dir);
  while (true) {
    const parent = path.dirname(current);
    if (parent === current) return null;
    if (fs.existsSync(path.join(parent, MARKER_PATH))) return parent;
    current = parent;
  }
}

export function loadCanonicalMcp() {
  let canonical;
  try {
    canonical = readJson(path.join(TEMPLATES_DIR, '.mcp.json'));
  } catch (err) {
    throw new InitError('mcp-schema', `templates/.mcp.json is missing or not valid JSON: ${err.message}`);
  }
  return { servers: canonical.mcpServers ?? {} };
}

// One http server per ticket source, in the canonical .mcp.json shape
// (spec docs/ultrapowers/specs/2026-10-02-ticket-sources-design.md, section 8).
// A source whose transport is cli gets none; Odoo always gets one.
export function ticketServers(tickets) {
  const servers = {};
  for (const source of tickets?.sources ?? []) {
    if (effectiveTransport(tickets, source) === 'cli') continue;
    // A source that names the server the team already runs needs none of its own.
    if (typeof source.server === 'string' && source.server !== '') continue;
    const id = ticketServerId(source.prefix);
    if (source.provider === 'github') {
      servers[id] = {
        type: 'http',
        url: 'https://api.githubcopilot.com/mcp/',
        headers: { Authorization: 'Bearer ${GH_TOKEN}', 'X-MCP-Readonly': 'true' },
      };
    } else if (source.provider === 'gitlab') {
      servers[id] = { type: 'http', url: `https://${source.host ?? 'gitlab.com'}/api/v4/mcp` };
    } else if (source.provider === 'odoo') {
      servers[id] = { type: 'http', url: source.mcpUrl };
      if (source.mcpHeader) {
        const [name, scheme] = source.mcpHeader.split(': ');
        servers[id].headers = { [name]: scheme ? `${scheme} \${ODOO_API_KEY}` : '${ODOO_API_KEY}' };
      }
    }
  }
  return servers;
}

const TICKET_SECRETS = [
  ['GH_TOKEN', (s) => s.provider === 'github', (s) => `tickets ${s.prefix}: gh CLI and the GitHub MCP server`],
  ['GITLAB_TOKEN', (s) => s.provider === 'gitlab', (s) => `tickets ${s.prefix}: glab CLI (the GitLab MCP server signs in in the browser)`],
  ['ODOO_API_KEY', (s) => s.provider === 'odoo', (s) => `tickets ${s.prefix}: the autopilot engine and its stages (a technical user's key) and the Odoo MCP server`],
];

// The .agents/mcp-secrets.env.example lines the ticket sources need, one per variable.
export function ticketSecretLines(tickets) {
  const sources = tickets?.sources ?? [];
  const lines = [];
  for (const [name, needs, note] of TICKET_SECRETS) {
    const first = sources.find(needs);
    if (first) lines.push(`${`${name}=`.padEnd(17)}# ${note(first)}`);
  }
  return lines;
}

// `extra` servers follow the canonical ones; `canonical: false` renders the
// extra servers alone (a harness file that does not exist yet).
export function generateMcpFiles(harnesses, { extra = {}, canonical = true } = {}) {
  const servers = { ...(canonical ? loadCanonicalMcp().servers : {}), ...extra };
  validateServers(servers);
  const files = [];
  for (const [target, schema] of Object.entries(MCP_TARGETS)) {
    const generator = MCP_GENERATORS[schema];
    if (!generator) continue;
    if (!harnesses.includes(TARGET_HARNESS[target])) continue;
    files.push({ target, content: generator(servers) });
  }
  return files;
}

const MCP_CONTAINER = { opencode: 'mcp', vscode: 'servers' };

const normalUrl = (url) => (typeof url === 'string' ? url.trim().replace(/\/+$/, '').toLowerCase() : null);
const entryUrl = (entry) => normalUrl(entry?.url ?? entry?.httpUrl ?? entry?.serverUrl);

// [[ticket id, existing server id]] for each added id whose URL an existing server already uses.
function sameUrls(added, wantedUrlOf, existingUrls) {
  const out = [];
  for (const id of added) {
    const url = wantedUrlOf(id);
    if (!url) continue;
    const other = Object.keys(existingUrls).find((existingId) => existingId !== id && existingUrls[existingId] === url);
    if (other) out.push([id, other]);
  }
  return out;
}

function tomlTableUrls(text) {
  const urls = {};
  let current = null;
  for (const line of text.split('\n')) {
    const head = /^\[([^\]]+)\]/.exec(line);
    if (head) {
      const table = /^mcp_servers\.(?:"([^"]+)"|([A-Za-z0-9_-]+))$/.exec(head[1]);
      current = table ? (table[1] ?? table[2]) : null;
      continue;
    }
    const url = current ? /^url\s*=\s*"([^"]*)"/.exec(line.trim()) : null;
    if (url) urls[current] = normalUrl(url[1]);
  }
  return urls;
}

function tomlTableIds(text) {
  const ids = [];
  for (const m of text.matchAll(/^\[mcp_servers\.(?:"([^"]+)"|([A-Za-z0-9_-]+))\][ \t]*$/gm)) ids.push(m[1] ?? m[2]);
  return ids;
}

// The ticket servers an existing harness MCP file lacks, added to a copy of that file: the other
// entries, and a leading provenance line of .vscode/mcp.json, stay as they are. `aloneText` is the
// generator's rendering of the ticket servers alone. JSON targets are parsed strictly; the Codex
// TOML file gets the missing tables appended as text (no TOML parser, rule 1).
export function mergeMcpFile(target, existingText, aloneText) {
  const schema = MCP_TARGETS[target];
  const existingLf = lf(existingText).replace(/^﻿/, '');
  if (schema === 'codex') {
    const have = new Set(tomlTableIds(existingLf));
    const tables = new Map();
    let current = null;
    for (const line of aloneText.split('\n')) {
      const head = /^\[mcp_servers\.(?:"([^"]+)"|([A-Za-z0-9_-]+))(?:\.[^\]]+)?\]/.exec(line);
      if (head) {
        current = head[1] ?? head[2];
        if (!tables.has(current)) tables.set(current, []);
      }
      if (current) tables.get(current).push(line);
    }
    const added = [...tables.keys()].filter((id) => !have.has(id));
    if (!added.length) return { content: existingText, added: [], sameUrl: [] };
    const sameUrl = sameUrls(added, (id) => tomlTableUrls(tables.get(id).join('\n'))[id], tomlTableUrls(existingLf));
    let content = existingLf;
    if (content.length > 0 && !content.endsWith('\n')) content += '\n';
    for (const id of added) content += `\n${tables.get(id).join('\n').replace(/\n+$/, '')}\n`;
    return { content, added, sameUrl };
  }
  let header = '';
  let body = existingLf;
  if (schema === 'vscode') {
    const m = /^[ \t]*\/\/[^\n]*\n/.exec(existingLf);
    if (m) {
      header = m[0];
      body = existingLf.slice(header.length);
    }
  }
  let existing;
  try {
    existing = JSON.parse(body);
  } catch (err) {
    return { unreadable: err.message };
  }
  if (!existing || typeof existing !== 'object' || Array.isArray(existing)) return { unreadable: 'the file does not hold a JSON object' };
  const alone = JSON.parse(aloneText);
  const key = MCP_CONTAINER[schema] ?? 'mcpServers';
  const wanted = alone[key] ?? {};
  const container = existing[key] && typeof existing[key] === 'object' && !Array.isArray(existing[key]) ? existing[key] : {};
  const added = Object.keys(wanted).filter((id) => !(id in container));
  if (!added.length) return { content: existingText, added: [], sameUrl: [] };
  const existingUrls = Object.fromEntries(Object.entries(container).map(([id, entry]) => [id, entryUrl(entry)]));
  const sameUrl = sameUrls(added, (id) => entryUrl(wanted[id]), existingUrls);
  for (const id of added) container[id] = wanted[id];
  existing[key] = container;
  if (schema === 'vscode' && Array.isArray(alone.inputs)) {
    const inputs = Array.isArray(existing.inputs) ? existing.inputs : [];
    for (const input of alone.inputs) {
      if (!inputs.some((i) => i && i.id === input.id)) inputs.push(input);
    }
    existing.inputs = inputs;
  }
  return { content: `${header}${toJson(existing)}`, added, sameUrl };
}

export function listTemplates() {
  const out = [];
  const walk = (dir, rel) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (entry.isDirectory()) {
        if (rel === '' && SPECIAL_DIRS.has(entry.name)) continue;
        walk(path.join(dir, entry.name), rel ? `${rel}/${entry.name}` : entry.name);
        continue;
      }
      if (rel === '' && NON_TEMPLATE_FILES.has(entry.name)) continue;
      const target = `${rel ? `${rel}/` : ''}${entry.name.replace(/\.tmpl$/, '')}`;
      out.push({ target, source: path.join(dir, entry.name) });
    }
  };
  walk(TEMPLATES_DIR, '');
  return out;
}

// The name lands in Markdown, JSON strings and TOML basic strings unescaped.
const UNSAFE_NAME = /["\\\u0000-\u001f\u007f]/;

export function checkName(name) {
  if (!name.trim() || UNSAFE_NAME.test(name)) {
    throw new InitError('bad-name', `project name ${JSON.stringify(name)} must not be blank or contain a double quote, a backslash or a control character; pass --name`, { name });
  }
  return name;
}

export function buildVars(opts, repos, harnesses, written) {
  const version = pluginVersion();
  const topology = repos.length ? 'nested' : 'root';
  return {
    name: checkName(opts.name ?? path.basename(opts.root)),
    pluginVersion: version,
    date: opts.date,
    topology,
    repos: repos.length ? repos.map((r) => r.name).join(', ') : 'none',
    repoIgnoreLines: repos.map((r) => `/${r.path}/`).join('\n'),
    repoGuideLines: repos.length
      ? repos.map((r) => `- \`${r.path}/\` (default branch \`${r.defaultBranch}\`): nested clone, gitignored`).join('\n')
      : 'No nested clones detected at scaffold time.',
    harnesses: harnesses.join(', '),
    reposJson: JSON.stringify(repos),
    harnessesJson: JSON.stringify(harnesses),
    kbJson: JSON.stringify(KB_FOLDERS),
    writtenJson: JSON.stringify([...written].sort()),
  };
}

function readTemplate(source) {
  return lf(fs.readFileSync(source, 'utf8'));
}

function emptyReport(mode, opts) {
  return {
    mode,
    root: opts.root,
    dryRun: opts.dryRun,
    written: [],
    skipped: [],
    omitted: [],
    blocks: [],
    repos: [],
    newRepos: [],
    changed: [],
    missingSecrets: { required: [], optional: [] },
    incomplete: [],
    warnings: [],
    hooksPath: 'skipped',
    nextSteps: [],
  };
}

export function planPayload(opts, repos, harnesses) {
  const vars = buildVars(opts, repos, harnesses, []);
  const files = [];
  const omitted = [];
  for (const { target, source } of listTemplates()) {
    const owner = TARGET_HARNESS[target];
    if (owner && !harnesses.includes(owner)) {
      omitted.push(target);
      continue;
    }
    if (target === MARKER_PATH) {
      renderMarker(vars);
      continue;
    }
    const rendered = render(readTemplate(source), vars, path.relative(TEMPLATES_DIR, source));
    files.push({ target, content: provenance(target, rendered, vars), executable: path.posix.basename(target) === 'pre-commit' });
  }
  if (harnesses.includes(TARGET_HARNESS[OUTPUT_STYLE_TARGET])) {
    files.push({ target: OUTPUT_STYLE_TARGET, content: readTemplate(OUTPUT_STYLE_SOURCE), executable: false });
  } else {
    omitted.push(OUTPUT_STYLE_TARGET);
  }
  for (const { target, content } of generateMcpFiles(harnesses, { extra: ticketServers(opts.tickets) })) {
    files.push({ target, content: provenance(target, content, vars), executable: false });
  }
  const secretLines = ticketSecretLines(opts.tickets);
  const secrets = files.find((f) => f.target === SECRETS_EXAMPLE);
  if (secrets && secretLines.length) secrets.content = applyBlock(secrets.content, secretLines.join('\n'), SECRETS_EXAMPLE).content;
  for (const [target, owner] of Object.entries(TARGET_HARNESS)) {
    if (MCP_TARGETS[target] && !harnesses.includes(owner) && !omitted.includes(target)) omitted.push(target);
  }
  if (opts.nestedPointers) {
    const pointerSource = path.join(TEMPLATES_DIR, '_nested', 'AGENTS.md.tmpl');
    const pointerTemplate = readTemplate(pointerSource);
    for (const repo of repos) {
      const rendered = render(pointerTemplate, { ...vars, repo: repo.name }, '_nested/AGENTS.md.tmpl');
      files.push({ target: `${repo.path}/AGENTS.md`, content: provenance('AGENTS.md', rendered, vars), executable: false });
    }
  }
  const blocks = [
    { target: '.gitignore', body: render(readTemplate(path.join(TEMPLATES_DIR, '_blocks', 'gitignore.tmpl')), vars, '_blocks/gitignore.tmpl') },
    { target: '.gitattributes', body: render(readTemplate(path.join(TEMPLATES_DIR, '_blocks', 'gitattributes.tmpl')), vars, '_blocks/gitattributes.tmpl') },
  ];
  return { files, blocks, omitted: omitted.sort(), vars };
}

// A symlink or junction inside the project (a hostile .claude -> ~/.claude, say)
// must not carry a write outside it. Checks the nearest part of the path that exists.
export function guardTarget(root, target) {
  const realRoot = fs.realpathSync(root);
  let probe = path.join(root, target);
  while (true) {
    try {
      fs.lstatSync(probe);
      break;
    } catch {
      probe = path.dirname(probe);
    }
  }
  let rel = null;
  try {
    rel = path.relative(realRoot, fs.realpathSync(probe));
  } catch {
    // A dangling link has no real path: treat it as outside.
  }
  if (rel === null || rel === '..' || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel)) {
    throw new InitError('outside-root', `${target} resolves outside ${root} through a symlink or junction; nothing was written`, { path: target });
  }
}

// flag 'wx' creates only: it fails rather than replace a file that appeared since the check.
function writeFile(root, target, content, executable, dryRun, flag = 'w') {
  guardTarget(root, target);
  const full = path.join(root, target);
  if (dryRun) return;
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content, { encoding: 'utf8', flag });
  if (executable) {
    try { fs.chmodSync(full, 0o755); } catch { /* Windows has no mode bits */ }
  }
}

// An existing settings file that lacks what the plugin needs: init never overwrites it, so the
// report names the missing keys for a hand merge.
export function incompleteFiles(root, plan) {
  const out = [];
  for (const file of plan.files) {
    const full = path.join(root, file.target);
    if (!fs.existsSync(full)) continue;
    const { missing, unreadable } = missingContent(file.target, fs.readFileSync(full, 'utf8'), file.content);
    if (unreadable !== undefined) out.push({ path: file.target, missing, unreadable });
    else if (missing.length) out.push({ path: file.target, missing });
  }
  return out;
}

function incompleteSteps(report) {
  return report.incomplete.map((i) => (i.unreadable !== undefined
    ? `${i.path} is not strict JSON (${i.unreadable}), so init cannot tell what it lacks; compare it with the template by hand (init never overwrites)`
    : `${i.path} lacks: ${i.missing.join(', ')}; merge them by hand (init never overwrites)`));
}

export function applyPlan(root, plan, report, dryRun) {
  // Merge the blocks and check every target first, so a failure comes before any write.
  const blocks = plan.blocks.map((block) => planBlock(root, block.target, block.body));
  const creates = plan.files.filter((file) => !fs.existsSync(path.join(root, file.target)));
  for (const target of [...creates.map((f) => f.target), ...blocks.map((b) => b.target), MARKER_PATH]) {
    guardTarget(root, target);
  }
  for (const file of plan.files) {
    if (!creates.includes(file)) {
      report.skipped.push(file.target);
      continue;
    }
    writeFile(root, file.target, file.content, file.executable, dryRun, 'wx');
    report.written.push(file.target);
  }
  for (const block of blocks) {
    writeBlock(root, block, report, dryRun);
  }
  report.omitted.push(...plan.omitted);
  report.incomplete = incompleteFiles(root, { files: plan.files.filter((f) => !creates.includes(f)) });
}

export function writeMarker(root, opts, repos, harnesses, written, dryRun, report) {
  const full = path.join(root, MARKER_PATH);
  if (fs.existsSync(full)) {
    report.skipped.push(MARKER_PATH);
    return;
  }
  writeFile(root, MARKER_PATH, withBlock(withTickets(renderMarker(buildVars(opts, repos, harnesses, written)), opts.tickets), 'autopilot', opts.autopilot), false, dryRun, 'wx');
  report.written.push(MARKER_PATH);
}

// planPayload calls this before any write, so a broken marker template fails
// the run while the project is still untouched.
function renderMarker(vars) {
  const sourceName = '.agents/ultrapowers.json.tmpl';
  const content = render(readTemplate(path.join(TEMPLATES_DIR, sourceName)), vars, sourceName);
  try {
    JSON.parse(content);
  } catch (err) {
    throw new InitError('bad-template', `template ${sourceName} does not render to valid JSON: ${err.message}`, { template: sourceName });
  }
  return content;
}

// A new marker keeps its template layout: the tickets key goes in before the
// closing brace, indented like the other top-level keys.
function withTickets(content, tickets) {
  if (!tickets) return content;
  const member = JSON.stringify(tickets, null, 2).replace(/\n/g, '\n  ');
  const next = content.replace(/\n\}\s*$/, `,\n  "tickets": ${member}\n}\n`);
  JSON.parse(next);
  return next;
}

// Any other top-level block goes in the same way, after the tickets key.
function withBlock(content, key, block) {
  if (!block) return content;
  const member = JSON.stringify(block, null, 2).replace(/\n/g, '\n  ');
  const next = content.replace(/\n\}\s*$/, `,\n  "${key}": ${member}\n}\n`);
  JSON.parse(next);
  return next;
}

// The --answers file holds the autopilot block. { "mode": "off" } means no block.
export function loadAutopilot(file) {
  let block;
  try {
    block = readJson(file);
  } catch (err) {
    throw new InitError('bad-args', `--answers ${file} is not readable JSON: ${err.message}`);
  }
  const errors = validateAutopilot(block);
  if (errors.length) throw new InitError('bad-autopilot', errors.join('; '), { errors });
  if (block.mode === 'off') return null;
  return block;
}

// An Odoo source that autopilot runs needs human approvers (the engine enforces the same rule).
function requireOdooApprovers(tickets, block) {
  const errors = odooApproverErrors(tickets, block);
  if (errors.length) throw new InitError('bad-tickets', errors.join('; '), { errors });
}

// The --sources file holds the tickets object. No sources means local only.
export function loadTickets(file) {
  let tickets;
  try {
    tickets = readJson(file);
  } catch (err) {
    throw new InitError('bad-args', `--sources ${file} is not readable JSON: ${err.message}`);
  }
  if (tickets && typeof tickets === 'object' && Array.isArray(tickets.sources) && tickets.sources.length === 0) return null;
  const errors = validateTickets(tickets);
  if (errors.length) throw new InitError('bad-tickets', errors.join('; '), { errors });
  return tickets;
}

function ticketNextSteps(tickets) {
  const providers = new Set((tickets?.sources ?? []).map((s) => s.provider));
  const steps = [];
  if (providers.has('github')) steps.push('GitHub: use a fine-grained token with Issues read and Metadata read, in GH_TOKEN.');
  if (providers.has('gitlab')) {
    steps.push('GitLab: use a token with the read_api scope, in GITLAB_TOKEN.');
    steps.push('Headless GitLab needs glab with GITLAB_TOKEN; the GitLab MCP server signs in in the browser');
  }
  if ((tickets?.sources ?? []).some((s) => s.provider === 'odoo' && s.mcpHeader)) {
    steps.push('Odoo: use the API key of a user who can only read projects and tasks, in ODOO_API_KEY.');
  }
  if (Object.keys(ticketServers(tickets)).length) steps.push('Approve the ticket MCP servers when your harness prompts for them.');
  return steps;
}

export function saveMarker(root, marker, dryRun) {
  writeFile(root, MARKER_PATH, `${JSON.stringify(marker, null, 2)}\n`, false, dryRun);
}

export function secretNames(root) {
  const file = path.join(root, '.agents', 'mcp-secrets.env.example');
  if (!fs.existsSync(file)) return [];
  return lf(fs.readFileSync(file, 'utf8')).split('\n')
    .map((line) => line.match(/^([A-Z][A-Z0-9_]*)=/))
    .filter(Boolean)
    .map((m) => m[1]);
}

// Variables the project's configuration makes optional: the user and password of a QA role that is
// not required, and the GitLab token or Odoo key of a source that is only read through a browser
// sign-in and that autopilot does not run.
function optionalSecrets(marker) {
  const optional = new Set();
  if (!marker || typeof marker !== 'object') return optional;
  const roles = Array.isArray(marker.qa?.roles) ? marker.qa.roles : [];
  for (const role of roles) {
    if (!role || role.required === true) continue;
    for (const name of [role.userEnv, role.passwordEnv]) if (typeof name === 'string' && name) optional.add(name);
  }
  const tickets = marker.tickets && validateTickets(marker.tickets).length === 0 ? marker.tickets : null;
  const autopilotOn = Boolean(marker.autopilot?.mode) && marker.autopilot.mode !== 'off';
  const notRun = (tickets?.sources ?? []).filter((s) => !(autopilotOn && s.autopilot !== false));
  const all = tickets?.sources ?? [];
  const browserOnly = (s) => (s.provider === 'gitlab' ? effectiveTransport(tickets, s) === 'mcp' : s.provider === 'odoo' && !s.mcpHeader && !s.login);
  for (const [name, provider] of [['GITLAB_TOKEN', 'gitlab'], ['ODOO_API_KEY', 'odoo']]) {
    const mine = all.filter((s) => s.provider === provider);
    if (mine.length && mine.every((s) => browserOnly(s) && notRun.includes(s))) optional.add(name);
  }
  return optional;
}

// The variables of .agents/mcp-secrets.env.example that are not defined, split into the ones the
// project needs and the ones only an optional QA role or sign-in uses.
export function missingSecrets(root, env = process.env, marker = null) {
  const optional = optionalSecrets(marker);
  const missing = secretNames(root).filter((name) => !env[name]);
  return { required: missing.filter((n) => !optional.has(n)), optional: missing.filter((n) => optional.has(n)) };
}

function secretSteps(secrets) {
  const steps = [];
  if (secrets.required.length) {
    steps.push(`Define these variables in your user environment (see .agents/mcp-secrets.env.example): ${secrets.required.join(', ')}`);
  }
  if (secrets.optional.length) {
    steps.push(`Optional, only for the QA roles or sign-ins you use: ${secrets.optional.join(', ')}`);
  }
  return steps;
}

function scaffoldNextSteps(opts, report, repos) {
  const steps = [
    'Run once per clone: git config core.hooksPath .githooks',
  ];
  steps.push(...secretSteps(missingSecrets(opts.root, process.env, { tickets: opts.tickets, autopilot: opts.autopilot })));
  steps.push('Approve the project MCP servers when your harness prompts for them.');
  if (opts.platform === 'win32') {
    steps.push('After the first git add, run: git update-index --chmod=+x .githooks/pre-commit');
  }
  if (repos.length) {
    steps.push(`Nested clones detected and ignored by the managed .gitignore block: ${repos.map((r) => r.name).join(', ')}`);
  }
  // Claude Code skips AGENTS.md whenever CLAUDE.md exists, so a kept file needs the import.
  for (const [file, harness] of [['CLAUDE.md', 'Claude Code'], ['GEMINI.md', 'Gemini CLI']]) {
    if (!report.skipped.includes(file)) continue;
    if (/^@(\.\/)?AGENTS\.md\s*$/m.test(fs.readFileSync(path.join(opts.root, file), 'utf8'))) continue;
    steps.push(`Your existing ${file} does not import AGENTS.md. Add @AGENTS.md as its first line, or ${harness} never reads the shared instructions.`);
  }
  const bestEffort = BEST_EFFORT_TARGETS.filter((t) => report.written.includes(t));
  if (bestEffort.length) {
    steps.push(`Best-effort files, verify against the vendor docs: ${bestEffort.join(', ')}`);
  }
  steps.push(...incompleteSteps(report));
  if (report.nearFolders?.length) {
    steps.push(`Folders near a knowledge-base name already exist: ${report.nearFolders.map((n) => `${n.existing} (near ${n.kb}/)`).join(', ')}. Decide with your human partner which one the project uses; init wrote the standard names beside them.`);
  }
  steps.push('Review the written files, then commit the scaffold.');
  return steps;
}

export function runScaffold(opts) {
  const report = emptyReport('scaffold', opts);
  if (!fs.existsSync(opts.root) || !fs.statSync(opts.root).isDirectory()) {
    throw new InitError('bad-root', `${opts.root} is not a directory`);
  }
  const existingMarker = readMarker(opts.root);
  if (!existingMarker) {
    const workspaceRoot = findMarkerAbove(opts.root);
    if (workspaceRoot) {
      throw new InitError('nested-clone', `${opts.root} sits inside the ultrapowers workspace ${workspaceRoot}; run init from that root`, { workspaceRoot });
    }
  }
  const harnesses = existingMarker?.harnesses ?? opts.harnesses ?? [...ALL_HARNESSES];
  if (!opts.name && existingMarker?.name) opts.name = existingMarker.name;
  const repos = detectRepos(opts.root);
  report.repos = repos;
  report.nearFolders = nearFolders(opts.root);
  if (opts.sources) opts.tickets = loadTickets(opts.sources);
  if (opts.autopilotFile) opts.autopilot = loadAutopilot(opts.autopilotFile);
  if (opts.tickets && opts.autopilot) requireOdooApprovers(opts.tickets, opts.autopilot);
  const plan = planPayload(opts, repos, harnesses);
  applyPlan(opts.root, plan, report, opts.dryRun);
  writeMarker(opts.root, opts, repos, harnesses, report.written, opts.dryRun, report);
  report.written.sort();
  report.skipped.sort();
  report.nextSteps = [...scaffoldNextSteps(opts, report, repos), ...ticketNextSteps(opts.tickets)];
  return report;
}

export function runDetect(opts) {
  const version = pluginVersion();
  let marker = null;
  let markerState = 'absent';
  let markerError = null;
  try {
    marker = readMarker(opts.root);
    if (marker) markerState = 'present';
  } catch (err) {
    if (!(err instanceof InitError && err.code === 'marker-corrupt')) throw err;
    markerState = 'corrupt';
    markerError = err.message;
  }
  let suggestedMode = 'scaffold';
  if (markerState === 'corrupt') suggestedMode = 'repair';
  else if (marker) suggestedMode = compareVersions(marker.pluginVersion ?? '0.0.0', version) < 0 ? 'upgrade' : 'join';
  return {
    mode: 'detect',
    root: opts.root,
    rootName: path.basename(opts.root),
    markerPresent: markerState !== 'absent',
    marker: markerState === 'corrupt' ? 'corrupt' : marker,
    markerError,
    pluginVersion: version,
    suggestedMode,
    repos: fs.existsSync(opts.root) ? detectRepos(opts.root) : [],
    workspaceRoot: findMarkerAbove(opts.root),
    nodeVersion: process.version,
    ticketsConfigured: Boolean(marker && typeof marker === 'object' && marker.tickets),
    autopilotConfigured: Boolean(marker && typeof marker === 'object' && marker.autopilot && marker.autopilot.mode && marker.autopilot.mode !== 'off'),
  };
}

export const PROPOSAL_SUFFIX = '.ultrapowers-new';
export const HOOKS_PATH = '.githooks';

function requireMarker(opts) {
  if (!fs.existsSync(opts.root) || !fs.statSync(opts.root).isDirectory()) {
    throw new InitError('bad-root', `${opts.root} is not a directory`);
  }
  const marker = readMarker(opts.root);
  if (marker && typeof marker === 'object' && !Array.isArray(marker)) return marker;
  if (marker !== null) {
    throw new InitError('marker-corrupt', `${MARKER_PATH} does not hold a JSON object`, { path: path.join(opts.root, MARKER_PATH) });
  }
  const workspaceRoot = findMarkerAbove(opts.root);
  if (workspaceRoot) {
    throw new InitError('nested-clone', `${opts.root} sits inside the ultrapowers workspace ${workspaceRoot}; run init from that root`, { workspaceRoot });
  }
  throw new InitError('no-marker', `${opts.root} has no ${MARKER_PATH}; run scaffold first`);
}

function markerHarnesses(marker) {
  return Array.isArray(marker.harnesses) ? marker.harnesses : [...ALL_HARNESSES];
}

// A valid tickets block rides along, so upgrade proposals keep the ticket servers.
function markerOpts(opts, marker) {
  const tickets = marker.tickets && validateTickets(marker.tickets).length === 0 ? marker.tickets : null;
  return { ...opts, name: opts.name ?? marker.name ?? path.basename(opts.root), nestedPointers: false, tickets };
}

function planBlock(root, target, body) {
  const full = path.join(root, target);
  const existing = fs.existsSync(full) ? fs.readFileSync(full, 'utf8') : null;
  return { target, ...applyBlock(existing, body, target) };
}

function writeBlock(root, { target, content, action }, report, dryRun) {
  if (action !== 'unchanged') {
    writeFile(root, target, content, false, dryRun);
    report.written.push(target);
  }
  report.blocks.push({ path: target, action });
}

export function applyBlockFile(root, target, body, report, dryRun) {
  writeBlock(root, planBlock(root, target, body), report, dryRun);
}

function reconcileRepos(opts, marker, report) {
  const onDisk = detectRepos(opts.root);
  const recorded = Array.isArray(marker.repos) ? marker.repos : [];
  report.repos = onDisk;
  report.newRepos = onDisk.filter((repo) => !recorded.some((known) => known.path === repo.path));
  if (!opts.recordRepos || report.newRepos.length === 0) return false;
  marker.repos = [...recorded, ...report.newRepos].sort((a, b) => a.path.localeCompare(b.path));
  marker.topology = 'nested';
  return true;
}

function gitignoreBody(opts, marker) {
  const vars = buildVars(markerOpts(opts, marker), marker.repos ?? [], markerHarnesses(marker), []);
  return render(readTemplate(path.join(TEMPLATES_DIR, '_blocks', 'gitignore.tmpl')), vars, '_blocks/gitignore.tmpl');
}

function ensureHooksPath(opts) {
  if (!fs.existsSync(path.join(opts.root, '.git'))) return 'no-git';
  const current = gitConfigGet(opts.root, 'core.hooksPath');
  if (current === HOOKS_PATH) return 'already-set';
  if (current) return `kept:${current}`;
  // Setting core.hooksPath would silently stop these (an LFS pre-push, say).
  const live = liveHooks(opts.root);
  if (live.length) return `existing-hooks:${live.join(',')}`;
  if (opts.dryRun) return 'would-set';
  try {
    gitConfigSet(opts.root, 'core.hooksPath', HOOKS_PATH);
    return 'set';
  } catch {
    return 'failed';
  }
}

function localNextSteps(report) {
  const steps = [];
  const hooks = {
    set: `core.hooksPath now points at ${HOOKS_PATH} for this clone.`,
    'would-set': `Join will set core.hooksPath to ${HOOKS_PATH} for this clone.`,
    'already-set': `core.hooksPath already points at ${HOOKS_PATH}.`,
    failed: `Setting core.hooksPath failed; run by hand: git config core.hooksPath ${HOOKS_PATH}`,
    'no-git': `This directory is not a git clone; after cloning, run: git config core.hooksPath ${HOOKS_PATH}`,
  };
  if (report.hooksPath.startsWith('kept:')) {
    steps.push(`core.hooksPath is ${report.hooksPath.slice(5)}; left unchanged. The secret scan in ${HOOKS_PATH}/pre-commit runs only from ${HOOKS_PATH}.`);
  } else if (report.hooksPath.startsWith('existing-hooks:')) {
    steps.push(`core.hooksPath left unset: setting it would stop these hooks in .git/hooks: ${report.hooksPath.slice(15).split(',').join(', ')}. The secret scan in ${HOOKS_PATH}/pre-commit runs only from ${HOOKS_PATH}.`);
  } else if (hooks[report.hooksPath]) {
    steps.push(hooks[report.hooksPath]);
  }
  steps.push(...secretSteps(report.missingSecrets));
  steps.push(...incompleteSteps(report));
  steps.push('Approve the project MCP servers when your harness prompts for them.');
  return steps;
}

function repoNextSteps(report, recorded, how = 'run') {
  if (!report.newRepos.length) return [];
  const names = report.newRepos.map((r) => r.name).join(', ');
  if (recorded) return [`Recorded ${names} in ${MARKER_PATH} and the managed .gitignore block; commit both files.`];
  if (how === 'upgrade') {
    return [`New nested clones not recorded in ${MARKER_PATH}: ${names}. Run upgrade with --apply <target,target> or --apply none, together with --record-repos, to record them and add them to the managed .gitignore block.`];
  }
  return [`New nested clones not recorded in ${MARKER_PATH}: ${names}. Run again with --record-repos to record them and add them to the managed .gitignore block.`];
}

export function runJoin(opts) {
  const report = emptyReport('join', opts);
  const marker = requireMarker(opts);
  report.hooksPath = ensureHooksPath(opts);
  report.missingSecrets = missingSecrets(opts.root, process.env, marker);
  report.incomplete = incompleteFiles(opts.root, planPayload(markerOpts(opts, marker), marker.repos ?? [], markerHarnesses(marker)));
  const recorded = reconcileRepos(opts, marker, report);
  if (recorded) {
    for (const target of ['.gitignore', MARKER_PATH]) guardTarget(opts.root, target);
    applyBlockFile(opts.root, '.gitignore', gitignoreBody(opts, marker), report, opts.dryRun);
    saveMarker(opts.root, marker, opts.dryRun);
    report.written.push(MARKER_PATH);
  }
  report.written.sort();
  report.nextSteps = [...localNextSteps(report), ...repoNextSteps(report, recorded)];
  return report;
}

function changedTargets(opts, plan, from) {
  const changes = readJson(path.join(TEMPLATES_DIR, 'CHANGES.json'));
  const targets = [...plan.files.map((f) => f.target), ...plan.blocks.map((b) => b.target)];
  return targets
    .filter((target) => typeof changes[target] === 'string' && compareVersions(changes[target], from) > 0)
    .sort()
    .map((target) => ({ path: target, version: changes[target], exists: fs.existsSync(path.join(opts.root, target)) }));
}

function upgradeNextSteps(report, from, version, applied) {
  if (!applied) {
    if (!report.changed.length) {
      return [`No template changed since ${from}. Run upgrade with --apply none to record version ${version} in ${MARKER_PATH}.`, ...incompleteSteps(report)];
    }
    return [
      'Choose the targets to apply, then run upgrade with --apply <target,target> or --apply none.',
      `An existing file is never overwritten: its new version is written next to it as <target>${PROPOSAL_SUFFIX}.`,
      ...incompleteSteps(report),
    ];
  }
  const steps = report.written
    .filter((p) => p.endsWith(PROPOSAL_SUFFIX))
    .map((p) => `Compare ${p} with ${p.slice(0, -PROPOSAL_SUFFIX.length)}, merge what you want by hand, then delete ${p}.`);
  steps.push(...incompleteSteps(report));
  steps.push(`${MARKER_PATH} records version ${version}.`);
  steps.push('Review the changes, then commit them.');
  return steps;
}

// The knowledge-base folder was brand-book/ before 1.4.0. Init never moves it; the rename is the
// project's own git mv, and every reader accepts both names until 2.0.
function legacyFolderSteps(root) {
  const legacy = fs.existsSync(path.join(root, 'brand-book')) && !fs.existsSync(path.join(root, 'brandbook'));
  return legacy ? ['The knowledge-base folder is brandbook/ from 1.4.0. Rename yours when you are ready: git mv brand-book brandbook, and do not apply brandbook/README.md first, or the folder will already exist (init never moves it; both names are read until 2.0).'] : [];
}

export function runUpgrade(opts) {
  const report = { ...emptyReport('upgrade', opts), preview: opts.apply === null };
  const marker = requireMarker(opts);
  if (opts.apply === null && opts.recordRepos) {
    throw new InitError('bad-args', '--record-repos writes the marker and .gitignore, so upgrade takes it only together with --apply (use --apply none to record nothing else)');
  }
  const version = pluginVersion();
  const from = typeof marker.pluginVersion === 'string' ? marker.pluginVersion : '0.0.0';
  const recorded = reconcileRepos(opts, marker, report);
  const plan = planPayload(markerOpts(opts, marker), marker.repos ?? [], markerHarnesses(marker));
  report.changed = changedTargets(opts, plan, from);
  report.incomplete = incompleteFiles(opts.root, plan);
  // Everything is checked before the first write, so an error leaves the project untouched.
  if (opts.apply !== null) {
    const changedPaths = new Set(report.changed.map((c) => c.path));
    const unknown = opts.apply.filter((t) => !changedPaths.has(t));
    if (unknown.length) {
      throw new InitError('bad-args', `--apply names targets that did not change since ${from}: ${unknown.join(', ')}`, { unknown });
    }
  }
  const touched = new Set([...(opts.apply ?? []), ...(recorded ? ['.gitignore'] : [])]);
  for (const block of plan.blocks) {
    if (touched.has(block.target)) planBlock(opts.root, block.target, block.body);
  }
  for (const target of touched) {
    const isFile = plan.files.some((f) => f.target === target);
    guardTarget(opts.root, isFile && fs.existsSync(path.join(opts.root, target)) ? `${target}${PROPOSAL_SUFFIX}` : target);
  }
  if (opts.apply !== null || recorded) guardTarget(opts.root, MARKER_PATH);
  // A proposal left from an earlier upgrade may hold a half-done merge.
  const pending = plan.files
    .filter((f) => touched.has(f.target) && fs.existsSync(path.join(opts.root, f.target)))
    .map((f) => `${f.target}${PROPOSAL_SUFFIX}`)
    .filter((p) => fs.existsSync(path.join(opts.root, p)));
  if (pending.length) {
    throw new InitError('proposal-exists', `earlier proposals are still there: ${pending.join(', ')}; merge or delete them, then run upgrade again`, { paths: pending });
  }
  let markerChanged = recorded;
  if (recorded && !(opts.apply ?? []).includes('.gitignore')) {
    applyBlockFile(opts.root, '.gitignore', gitignoreBody(opts, marker), report, opts.dryRun);
  }
  if (opts.apply !== null) {
    const created = [];
    for (const target of new Set(opts.apply)) {
      const block = plan.blocks.find((b) => b.target === target);
      if (block) {
        applyBlockFile(opts.root, target, block.body, report, opts.dryRun);
        continue;
      }
      const file = plan.files.find((f) => f.target === target);
      if (!fs.existsSync(path.join(opts.root, target))) {
        writeFile(opts.root, target, file.content, file.executable, opts.dryRun, 'wx');
        report.written.push(target);
        created.push(target);
        continue;
      }
      writeFile(opts.root, `${target}${PROPOSAL_SUFFIX}`, file.content, false, opts.dryRun, 'wx');
      report.written.push(`${target}${PROPOSAL_SUFFIX}`);
    }
    if (compareVersions(from, version) < 0) marker.pluginVersion = version;
    marker.written = [...new Set([...(Array.isArray(marker.written) ? marker.written : []), ...created])].sort();
    markerChanged = true;
  }
  if (markerChanged) {
    saveMarker(opts.root, marker, opts.dryRun);
    report.written.push(MARKER_PATH);
  }
  report.written.sort();
  report.skipped.sort();
  report.nextSteps = [...upgradeNextSteps(report, from, version, opts.apply !== null), ...legacyFolderSteps(opts.root), ...repoNextSteps(report, recorded, opts.apply === null ? 'upgrade' : 'run')];
  return report;
}

// The `projects` map a source needs for the clones whose provider path is not
// `<owner or namespace>/<clone name>`, read from each clone's origin remote (parsed as the
// autopilot engine does). A proposal only: the developer confirms it before it goes in the file.
export function proposeProjects(root, repos, source, warnings = []) {
  const proposed = {};
  if (!['github', 'gitlab'].includes(source.provider)) return proposed;
  const base = source.provider === 'github' ? source.owner : source.namespace;
  for (const repo of repos) {
    if (source.projects && typeof source.projects[repo.name] === 'string') continue;
    const forge = forgeFor(path.join(root, repo.path), { provider: source.provider, host: source.host });
    if (!forge) {
      const warning = `${repo.name} has no origin remote, so its provider path cannot be proposed; add "projects" for it by hand when it is not ${base}/${repo.name}`;
      if (!warnings.includes(warning)) warnings.push(warning);
      continue;
    }
    if (forge.provider !== source.provider) continue;
    if (forge.path !== `${base}/${repo.name}`) proposed[repo.name] = forge.path;
  }
  return proposed;
}

// Configure ticket sources in a scaffolded project. Only the marker's tickets
// key changes; an existing harness MCP file gets a proposal beside it, a
// missing one is created with the ticket servers alone, and the secret names
// go in a managed block of .agents/mcp-secrets.env.example.
export async function runTickets(opts) {
  const report = { ...emptyReport('tickets', opts), marker: null, mcp: [], secrets: [] };
  const marker = requireMarker(opts);
  if (!opts.sources) throw new InitError('bad-args', 'tickets needs --sources <file>');
  const tickets = loadTickets(opts.sources);
  report.marker = { before: marker.tickets ?? null, after: tickets };
  loadSecretsFile(opts.root, process.env);
  report.transportOnThisMachine = {};
  for (const source of tickets?.sources ?? []) {
    report.transportOnThisMachine[source.prefix] = await transportOnThisMachine({
      provider: source.provider,
      host: source.provider === 'github' ? 'github.com' : (source.host ?? 'gitlab.com'),
      transport: effectiveTransport(tickets, source),
      login: source.login ?? null,
    });
  }
  const clones = detectRepos(opts.root);
  report.proposedProjects = Object.fromEntries((tickets?.sources ?? [])
    .filter((source) => ['github', 'gitlab'].includes(source.provider))
    .map((source) => [source.prefix, proposeProjects(opts.root, clones, source, report.warnings)]));
  const harnesses = markerHarnesses(marker);
  const servers = ticketServers(tickets);
  const vars = buildVars(markerOpts(opts, marker), marker.repos ?? [], harnesses, []);
  const writes = [];
  if (Object.keys(servers).length) {
    for (const { target, content } of generateMcpFiles(harnesses, { extra: servers, canonical: false })) {
      const full = path.join(opts.root, target);
      if (!fs.existsSync(full)) {
        writes.push({ target, content: provenance(target, content, vars) });
        report.mcp.push({ path: target, action: 'created', added: Object.keys(servers) });
        continue;
      }
      const merged = mergeMcpFile(target, fs.readFileSync(full, 'utf8'), content);
      if (merged.unreadable !== undefined) {
        report.mcp.push({ path: target, action: 'unreadable', added: [], message: merged.unreadable });
        continue;
      }
      for (const [id, other] of merged.sameUrl ?? []) {
        const warning = `${id} has the same URL as ${other}; set "server": "${other}" to reuse it`;
        if (!report.warnings.includes(warning)) report.warnings.push(warning);
      }
      if (!merged.added.length) {
        report.mcp.push({ path: target, action: 'unchanged', added: [] });
        continue;
      }
      const proposal = `${target}${PROPOSAL_SUFFIX}`;
      if (fs.existsSync(path.join(opts.root, proposal))) {
        throw new InitError('proposal-exists', `an earlier proposal is still there: ${proposal}; merge or delete it, then run init tickets again`, { paths: [proposal] });
      }
      writes.push({ target: proposal, content: merged.content });
      report.mcp.push({ path: target, action: 'proposal', added: merged.added });
    }
  }
  const secretLines = ticketSecretLines(tickets);
  const block = secretLines.length ? planBlock(opts.root, SECRETS_EXAMPLE, secretLines.join('\n')) : null;
  report.secrets = secretLines.map((line) => line.split('=')[0]);
  // Every target is checked before the first write, so an error leaves the project untouched.
  for (const target of [...writes.map((w) => w.target), ...(block ? [SECRETS_EXAMPLE] : []), MARKER_PATH]) {
    guardTarget(opts.root, target);
  }
  for (const { target, content } of writes) {
    writeFile(opts.root, target, content, false, opts.dryRun, 'wx');
    report.written.push(target);
  }
  if (block) writeBlock(opts.root, block, report, opts.dryRun);
  if (tickets) marker.tickets = tickets;
  else delete marker.tickets;
  saveMarker(opts.root, marker, opts.dryRun);
  report.written.push(MARKER_PATH);
  report.written.sort();
  const proposals = report.mcp.filter((m) => m.action === 'proposal').map((m) => m.path);
  const unreadable = report.mcp.filter((m) => m.action === 'unreadable');
  const ids = Object.keys(servers).join(', ');
  report.nextSteps = [
    ...ticketNextSteps(tickets),
    ...proposals.map((p) => `Merge ${p}${PROPOSAL_SUFFIX} into ${p} (git diff --no-index ${p} ${p}${PROPOSAL_SUFFIX}), then delete the proposal.`),
    ...unreadable.map((m) => `${m.path} is not strict JSON (${m.message}), so no proposal was written; add ${ids} by hand.`),
  ];
  return report;
}

const nearKey = (name) => name.toLowerCase().replace(/[-_]/g, '');

// Folders whose names are near a knowledge-base folder without being it (`brand-book` for
// `brandbook`, `Specs` for `specs`), and knowledge-base folders nested under docs/.
export function nearFolders(root) {
  const out = [];
  const dirs = (dir) => (fs.existsSync(dir) ? fs.readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name) : []);
  for (const kb of KB_FOLDERS) {
    for (const name of dirs(root)) {
      if (!name.startsWith('.') && name !== kb && nearKey(name) === nearKey(kb)) out.push({ kb, existing: name });
    }
    for (const name of dirs(path.join(root, 'docs'))) {
      if (nearKey(name) === nearKey(kb)) out.push({ kb, existing: `docs/${name}` });
    }
  }
  return out;
}

function findProposals(root, dir = root, depth = 0, out = []) {
  if (depth > 4) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === '.git' || entry.name === 'node_modules') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!fs.existsSync(path.join(full, '.git'))) findProposals(root, full, depth + 1, out);
    } else if (entry.name.endsWith(PROPOSAL_SUFFIX)) {
      out.push(path.relative(root, full).split(path.sep).join('/'));
    }
  }
  return out.sort();
}

// Audit a scaffold without writing anything: the settings files and hooks the plugin needs, the
// ticket servers in each harness file, proposals still waiting, undefined variables, near-named
// folders. Every finding is { kind, path, detail }.
export function runCheck(opts) {
  const report = { ...emptyReport('check', opts), findings: [], next: null, ticketsConfigured: false, autopilotMode: 'off' };
  if (!fs.existsSync(opts.root) || !fs.statSync(opts.root).isDirectory()) {
    throw new InitError('bad-root', `${opts.root} is not a directory`);
  }
  const add = (kind, file, detail) => {
    if (!report.findings.some((f) => f.kind === kind && f.path === file)) report.findings.push({ kind, path: file, detail });
  };
  let marker = null;
  try {
    marker = readMarker(opts.root);
  } catch (err) {
    if (!(err instanceof InitError && err.code === 'marker-corrupt')) throw err;
    add('marker-corrupt', MARKER_PATH, err.message);
    report.next = 'repair';
  }
  if (marker === null && report.next === null) {
    const workspaceRoot = findMarkerAbove(opts.root);
    if (workspaceRoot) add('nested-clone', workspaceRoot, `${opts.root} sits inside the ultrapowers workspace; run init from that root`);
    else report.next = 'scaffold';
  }
  if (marker && typeof marker === 'object' && !Array.isArray(marker)) {
    const version = pluginVersion();
    const from = typeof marker.pluginVersion === 'string' ? marker.pluginVersion : '0.0.0';
    report.next = compareVersions(from, version) < 0 ? 'upgrade' : 'join';
    if (report.next === 'upgrade') add('upgrade-available', MARKER_PATH, `the scaffold is from ${from} and the plugin is ${version}`);
    const harnesses = markerHarnesses(marker);
    const plan = planPayload(markerOpts(opts, marker), marker.repos ?? [], harnesses);
    for (const item of incompleteFiles(opts.root, plan)) {
      if (item.unreadable !== undefined) {
        add('unreadable', item.path, `not strict JSON (${item.unreadable}); compare it with the template by hand`);
        continue;
      }
      const rest = item.missing.filter((m) => m !== 'hooks.BeforeTool');
      if (rest.length !== item.missing.length) {
        add('hook-missing', item.path, 'no BeforeTool hook names ultrapowers-guardrail.mjs, so the guardrail does not run on Gemini CLI; add the hook of the template by hand');
      }
      if (rest.length) add('settings-incomplete', item.path, `lacks: ${rest.join(', ')}; merge them by hand`);
    }
    const launcher = '.gemini/hooks/ultrapowers-guardrail.mjs';
    if (harnesses.includes('gemini') && !fs.existsSync(path.join(opts.root, launcher))) {
      add('missing-file', launcher, 'the guardrail launcher is missing; upgrade lists it, or copy it from the plugin templates');
    }
    const tickets = marker.tickets && validateTickets(marker.tickets).length === 0 ? marker.tickets : null;
    report.ticketsConfigured = Boolean(marker.tickets);
    if (marker.autopilot && typeof marker.autopilot.mode === 'string') report.autopilotMode = marker.autopilot.mode;
    const servers = ticketServers(tickets);
    if (Object.keys(servers).length) {
      for (const { target, content } of generateMcpFiles(harnesses, { extra: servers, canonical: false })) {
        const full = path.join(opts.root, target);
        if (!fs.existsSync(full)) {
          add('server-missing', target, `the file does not exist; it lacks ${Object.keys(servers).join(', ')}`);
          continue;
        }
        const merged = mergeMcpFile(target, fs.readFileSync(full, 'utf8'), content);
        if (merged.unreadable !== undefined) add('unreadable', target, `not strict JSON (${merged.unreadable}); add ${Object.keys(servers).join(', ')} by hand`);
        else if (merged.added.length) add('server-missing', target, `lacks ${merged.added.join(', ')}; run init tickets for a proposal`);
      }
    }
    const secrets = missingSecrets(opts.root, process.env, marker);
    if (secrets.required.length) add('secrets', SECRETS_EXAMPLE, `not defined: ${secrets.required.join(', ')}`);
    if (secrets.optional.length) add('secrets-optional', SECRETS_EXAMPLE, `not defined, optional: ${secrets.optional.join(', ')}`);
  }
  for (const proposal of findProposals(opts.root)) add('stale-proposal', proposal, `merge it into ${proposal.slice(0, -PROPOSAL_SUFFIX.length)} with your human partner, then delete it`);
  for (const near of nearFolders(opts.root)) {
    const legacy = near.existing === 'brand-book' && near.kb === 'brandbook';
    add('near-folder', near.existing, legacy
      ? 'the knowledge-base folder is brandbook/ from 1.4.0; rename it with: git mv brand-book brandbook (both names are read until 2.0)'
      : `near the knowledge-base folder ${near.kb}/; decide with your human partner which one the project uses`);
  }
  report.nextSteps = [
    ...report.findings.map((f) => `${f.kind}: ${f.path}: ${f.detail}`),
    ...(report.next ? [`init mode for this project: ${report.next}`] : []),
  ];
  return report;
}

const LABEL_STYLE = {
  ready: ['0e8a16', 'autopilot: take this ticket'],
  approve: ['1d76db', 'autopilot: the packet is approved'],
  changes: ['fbca04', 'autopilot: revise; the reason is in a comment'],
  hold: ['d93f0b', 'autopilot: stop here'],
  running: ['5319e7', 'autopilot: a stage is running'],
  blocked: ['b60205', 'autopilot: stopped; the reason is in a comment'],
};

// Configure autopilot in a scaffolded project: the marker's autopilot key, and the six
// labels on every GitHub or GitLab source that names a default project.
export async function runAutopilot(opts) {
  const report = { ...emptyReport('autopilot', opts), marker: null, labels: [] };
  const marker = requireMarker(opts);
  if (!opts.answers) throw new InitError('bad-args', 'autopilot needs --answers <file>');
  const block = loadAutopilot(opts.answers);
  report.marker = { before: marker.autopilot ?? null, after: block };
  const sources = (marker.tickets?.sources ?? []).filter((s) => s && ['github', 'gitlab', 'odoo'].includes(s.provider));
  if (block && sources.length === 0) {
    throw new InitError('no-source', 'autopilot needs a GitHub, GitLab or Odoo ticket source; run init tickets first');
  }
  if (block) {
    const noLogin = (marker.tickets?.sources ?? []).findIndex((s) => s && s.provider === 'odoo' && s.autopilot !== false && !(typeof s.login === 'string' && s.login.trim()));
    if (noLogin >= 0) {
      throw new InitError('bad-tickets', `tickets.sources[${noLogin}].login is required for autopilot: the engine signs in to Odoo as a technical user; run init tickets and name it, or set "autopilot": false on that source when autopilot must not run its tickets`);
    }
    requireOdooApprovers(marker.tickets, block);
    // An Odoo-only project gets the readable tag names (spec 2026-10-05 D9) unless the answers chose.
    const watched = sources.filter((s) => s.defaultProject && s.autopilot !== false);
    if (!block.events && watched.length && watched.every((s) => s.provider === 'odoo')) block.events = { ...ODOO_EVENTS };
    loadSecretsFile(opts.root, process.env);
  }
  const events = { ...AUTOPILOT_DEFAULTS.events, ...(block?.events ?? {}) };
  const failed = [];
  if (block) {
    for (const source of sources.filter((s) => s.autopilot !== false)) {
      let resolution = null;
      try {
        resolution = source.defaultProject ? resolveTicket(marker, `${source.prefix}-1`) : null;
      } catch {
        resolution = null;
      }
      for (const [event, name] of Object.entries(events)) {
        if (!resolution || resolution.provider === 'local') {
          report.labels.push({ source: source.prefix, path: null, name, action: 'skipped', message: `${source.prefix} has no defaultProject; create the label in each repository by hand` });
          continue;
        }
        const entry = { source: source.prefix, path: resolution.path, name, action: 'would-create' };
        if (!opts.dryRun) {
          try {
            const [color, description] = LABEL_STYLE[event] ?? ['ededed', 'autopilot'];
            await trackerFor(resolution, process.env).ensureLabel(name, color, description);
            entry.action = 'created';
          } catch (err) {
            entry.action = 'failed';
            entry.message = err.message;
            failed.push(`${resolution.path}: ${name}`);
          }
        }
        report.labels.push(entry);
      }
    }
  }
  guardTarget(opts.root, MARKER_PATH);
  if (block) marker.autopilot = block;
  else delete marker.autopilot;
  saveMarker(opts.root, marker, opts.dryRun);
  report.written.push(MARKER_PATH);
  report.nextSteps = block ? [
    'GitHub: a watcher or a session that writes back needs a fine-grained token with Issues, Contents and Pull requests read and write on the listed repositories, never workflow, in GH_TOKEN.',
    'GitLab: a project token with the api scope per repository, in GITLAB_TOKEN.',
    ...(sources.some((s) => s.provider === 'odoo') ? ['Odoo: the engine and its stages sign in as a technical user, an internal user in the Project User group and nothing more, with its API key in ODOO_API_KEY, the one Odoo key; it may live in .agents/mcp-secrets.env, which is gitignored.'] : []),
    'A watcher: give its stages a read-only token of their own in ULTRAPOWERS_STAGE_GH_TOKEN (Issues, Contents and Metadata read) or ULTRAPOWERS_STAGE_GITLAB_TOKEN (read_api); the stage then holds nothing that can write. See docs/autopilot-watcher.md.',
    'The guardrail is a plugin hook on every harness but Devin; Codex asks you to trust the plugin hooks once (/hooks), Hermes needs the plugin in plugins.enabled, and Gemini CLI uses the BeforeTool hook this scaffold wrote to .gemini/settings.json. The harness table in README.md names each.',
    `Start a ticket with /ultrapowers:autopilot <ID>; mode ${block.mode} stops at ${block.mode === 'full' ? 'the pull requests' : 'the review packet and the pull requests'}.`,
    ...(failed.length ? [`Create these labels by hand, the engine could not: ${failed.join(', ')}`] : []),
  ] : ['autopilot is off; every skill behaves as before.'];
  return report;
}

export async function main(argv) {
  try {
    const opts = parseArgs(argv);
    const runners = { scaffold: runScaffold, detect: runDetect, join: runJoin, upgrade: runUpgrade, tickets: runTickets, autopilot: runAutopilot, check: runCheck };
    const report = await runners[opts.mode](opts);
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return 0;
  } catch (err) {
    if (err instanceof InitError) {
      process.stdout.write(`${JSON.stringify({ error: { code: err.code, message: err.message, ...err.extra } }, null, 2)}\n`);
      return 2;
    }
    process.stderr.write(`${err.stack ?? err}\n`);
    return 1;
  }
}

// The effective value from any scope: a global core.hooksPath disables .git/hooks too.
export function gitConfigGet(root, key) {
  try {
    return execFileSync('git', ['config', '--get', key], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return '';
  }
}

function liveHooks(root) {
  let dir;
  try {
    dir = path.resolve(root, execFileSync('git', ['rev-parse', '--git-path', 'hooks'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim());
  } catch {
    return [];
  }
  if (!fs.existsSync(dir)) return [];
  // Git runs only executable hooks; Windows has no mode bits, so every file counts there.
  const runs = (entry) => process.platform === 'win32' || (fs.statSync(path.join(dir, entry.name)).mode & 0o111) !== 0;
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && !entry.name.endsWith('.sample') && runs(entry))
    .map((entry) => entry.name)
    .sort();
}

export function gitConfigSet(root, key, value) {
  execFileSync('git', ['config', '--local', key, value], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
}

function invokedDirectly() {
  if (!process.argv[1]) return false;
  try {
    return fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (invokedDirectly()) {
  process.exitCode = await main(process.argv.slice(2));
}
