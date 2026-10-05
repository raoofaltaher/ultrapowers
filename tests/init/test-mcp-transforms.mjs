import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseToml } from './toml-mini.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../..');
const ENGINE = path.join(repoRoot, 'skills', 'init', 'scripts', 'init.mjs');
const {
  MCP_GENERATORS, MCP_TARGETS, ALL_HARNESSES, InitError, NPX_LAUNCHER, generateMcpFiles,
  ticketServers, ticketSecretLines,
} = await import(pathToFileURL(ENGINE).href);

const canonical = JSON.parse(fs.readFileSync(path.join(repoRoot, 'templates', '.mcp.json'), 'utf8'));
const CANONICAL_IDS = Object.keys(canonical.mcpServers).sort();
const SCHEMA_OF = MCP_TARGETS;
const TARGET_OF = Object.fromEntries(Object.entries(MCP_TARGETS).map(([target, schema]) => [schema, target]));

function parseGenerated(target, content) {
  if (target.endsWith('.toml')) return parseToml(content);
  const text = target.startsWith('.vscode/') ? content.replace(/^\s*\/\/.*$/gm, '') : content;
  return JSON.parse(text);
}

function serversOf(target, parsed) {
  if (target === '.codex/config.toml') return parsed.mcp_servers;
  if (target === 'opencode.json') return parsed.mcp;
  if (target === '.vscode/mcp.json') return parsed.servers;
  return parsed.mcpServers;
}

function generated(platform) {
  const out = {};
  for (const { target, content } of generateMcpFiles(ALL_HARNESSES, platform)) {
    out[SCHEMA_OF[target]] = { target, content, parsed: parseGenerated(target, content) };
  }
  return out;
}

function tmpRepo() {
  const root = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ultrapowers-mcp-')), 'proj');
  fs.mkdirSync(path.join(root, '.git'), { recursive: true });
  return root;
}

function run(args, { env = {}, expectExit = 0 } = {}) {
  let stdout;
  let status = 0;
  try {
    stdout = execFileSync(process.execPath, [ENGINE, ...args], { encoding: 'utf8', env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (err) {
    status = err.status;
    stdout = err.stdout;
  }
  assert.equal(status, expectExit, `exit code for ${args.join(' ')}: ${stdout}`);
  return JSON.parse(stdout);
}

const SYNTHETIC = {
  docs: { type: 'http', url: 'https://mcp.deepwiki.com/mcp', headers: { Authorization: 'Bearer ${DOCS_TOKEN}', 'X-Team': '${TEAM_ID}' } },
  tool: { type: 'stdio', command: 'node', args: ['server.js'], env: { TOOL_KEY: '${TOOL_KEY}', MODE: 'strict' } },
};

test('every MCP target has a pure generator', () => {
  for (const schema of Object.values(MCP_TARGETS)) {
    assert.equal(typeof MCP_GENERATORS[schema], 'function', `generator for ${schema}`);
    const input = structuredClone(canonical.mcpServers);
    const first = MCP_GENERATORS[schema](input);
    const second = MCP_GENERATORS[schema](input);
    assert.equal(first, second, `${schema} is deterministic`);
    assert.deepEqual(input, canonical.mcpServers, `${schema} does not mutate its input`);
  }
});

test('every generated file parses in its format and lists exactly the canonical server ids', () => {
  for (const platform of ['linux', 'win32']) {
    const files = generated(platform);
    assert.deepEqual(Object.keys(files).sort(), Object.values(MCP_TARGETS).sort());
    for (const [schema, { target, content, parsed }] of Object.entries(files)) {
      assert.deepEqual(Object.keys(serversOf(target, parsed)).sort(), CANONICAL_IDS, `${schema} on ${platform}`);
      assert.equal(content.includes('_ultrapowers'), false, `${target} leaks the _ultrapowers key`);
      assert.ok(content.endsWith('\n'), `${target} ends with a newline`);
    }
  }
});

test('secret references use the syntax of each schema', () => {
  const files = generated('linux');
  for (const schema of ['claude', 'factory', 'kimi', 'gemini', 'qwen']) {
    const servers = serversOf(files[schema].target, files[schema].parsed);
    assert.equal(servers.context7.env.CONTEXT7_API_KEY, '${CONTEXT7_API_KEY}', schema);
  }
  assert.equal(files.cursor.parsed.mcpServers.context7.env.CONTEXT7_API_KEY, '${env:CONTEXT7_API_KEY}');
  assert.equal(files.opencode.parsed.mcp.context7.environment.CONTEXT7_API_KEY, '{env:CONTEXT7_API_KEY}');
  const codex = files.codex.parsed.mcp_servers;
  assert.deepEqual(codex.context7.env_vars, ['CONTEXT7_API_KEY']);
  assert.equal(codex.context7.env, undefined, 'codex never writes a secret value');
  assert.equal(files.vscode.parsed.servers.context7.env.CONTEXT7_API_KEY, '${input:context7-api-key}');
  assert.deepEqual(files.vscode.parsed.inputs.map((i) => i.id), ['brave-api-key', 'context7-api-key', 'firecrawl-api-key']);
  for (const input of files.vscode.parsed.inputs) {
    assert.equal(input.type, 'promptString');
    assert.equal(input.password, true);
  }
  const allowed = {
    claude: /^\$\{[A-Z0-9_]+\}$/, factory: /^\$\{[A-Z0-9_]+\}$/, kimi: /^\$\{[A-Z0-9_]+\}$/,
    gemini: /^\$\{[A-Z0-9_]+\}$/, qwen: /^\$\{[A-Z0-9_]+\}$/, cursor: /^\$\{env:[A-Z0-9_]+\}$/,
    opencode: /^\{env:[A-Z0-9_]+\}$/, vscode: /^\$\{input:[a-z0-9-]+\}$/, codex: /^$/,
  };
  for (const [schema, { content }] of Object.entries(files)) {
    for (const ref of content.match(/\$\{[^}]*\}|\{env:[^}]*\}/g) ?? []) {
      assert.match(ref, allowed[schema], `${schema} contains a foreign reference ${ref}`);
    }
  }
});

test('stdio and http servers take the shape of each schema', () => {
  const files = generated('linux');
  const npx = { command: 'node', args: ['-e', NPX_LAUNCHER, '--', '-y', '@playwright/mcp@latest'] };
  const url = 'https://mcp.deepwiki.com/mcp';
  for (const schema of ['claude', 'factory', 'kimi']) {
    const servers = files[schema].parsed.mcpServers;
    assert.deepEqual(servers.playwright, { type: 'stdio', ...npx }, schema);
    assert.deepEqual(servers.deepwiki, { type: 'http', url }, schema);
  }
  assert.deepEqual(files.cursor.parsed.mcpServers.playwright, { type: 'stdio', ...npx });
  assert.deepEqual(files.cursor.parsed.mcpServers.deepwiki, { url });
  for (const schema of ['gemini', 'qwen']) {
    assert.deepEqual(files[schema].parsed.mcpServers.playwright, npx, schema);
    assert.deepEqual(files[schema].parsed.mcpServers.deepwiki, { httpUrl: url }, schema);
  }
  assert.deepEqual(files.opencode.parsed.mcp.playwright, { type: 'local', command: ['node', ...npx.args], enabled: true });
  assert.deepEqual(files.opencode.parsed.mcp.deepwiki, { type: 'remote', url, enabled: true });
  assert.equal(files.opencode.parsed.$schema, 'https://opencode.ai/config.json');
  assert.deepEqual(files.codex.parsed.mcp_servers.playwright, npx);
  assert.deepEqual(files.codex.parsed.mcp_servers.deepwiki, { url });
  assert.deepEqual(files.vscode.parsed.servers.playwright, { type: 'stdio', ...npx });
  assert.deepEqual(files.vscode.parsed.servers.deepwiki, { type: 'http', url });
});

test('generated MCP files are the same whichever platform runs scaffold', () => {
  const linux = generated('linux');
  const win = generated('win32');
  for (const schema of Object.values(MCP_TARGETS)) {
    assert.equal(win[schema].content, linux[schema].content, `${schema} is portable`);
    assert.equal(win[schema].content.includes('"cmd"'), false, `${schema} has no Windows-only wrapper`);
  }
});

test('the npx launcher starts npx on this platform without a shell', () => {
  const result = spawnSync('node', ['-e', NPX_LAUNCHER, '--', '--version'], { encoding: 'utf8' });
  assert.equal(result.error, undefined, String(result.error));
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout.trim(), /^\d+\.\d+\.\d+$/);
});

test('gemini and qwen settings list AGENTS.md as a context file', () => {
  const files = generated('linux');
  assert.deepEqual(files.gemini.parsed.context.fileName, ['GEMINI.md', 'AGENTS.md']);
  assert.deepEqual(files.qwen.parsed.context.fileName, ['QWEN.md', 'AGENTS.md']);
});

test('the codex config carries the approval and sandbox defaults', () => {
  const { parsed } = generated('linux').codex;
  assert.equal(parsed.approval_policy, 'on-request');
  assert.equal(parsed.sandbox_mode, 'workspace-write');
});

test('headers, literal values and embedded references map per schema', () => {
  const claude = JSON.parse(MCP_GENERATORS.claude(SYNTHETIC)).mcpServers;
  assert.deepEqual(claude.docs.headers, { Authorization: 'Bearer ${DOCS_TOKEN}', 'X-Team': '${TEAM_ID}' });
  assert.deepEqual(claude.tool, { type: 'stdio', command: 'node', args: ['server.js'], env: { TOOL_KEY: '${TOOL_KEY}', MODE: 'strict' } }, 'only npx goes through the launcher');
  const cursor = JSON.parse(MCP_GENERATORS.cursor(SYNTHETIC)).mcpServers;
  assert.equal(cursor.docs.headers.Authorization, 'Bearer ${env:DOCS_TOKEN}');
  const opencode = JSON.parse(MCP_GENERATORS.opencode(SYNTHETIC)).mcp;
  assert.equal(opencode.docs.headers.Authorization, 'Bearer {env:DOCS_TOKEN}');
  assert.deepEqual(opencode.tool.environment, { TOOL_KEY: '{env:TOOL_KEY}', MODE: 'strict' });
  const vscode = JSON.parse(MCP_GENERATORS.vscode(SYNTHETIC));
  assert.equal(vscode.servers.docs.headers.Authorization, 'Bearer ${input:docs-token}');
  assert.deepEqual(vscode.inputs.map((i) => i.id), ['docs-token', 'team-id', 'tool-key']);
  const codex = parseToml(MCP_GENERATORS.codex(SYNTHETIC)).mcp_servers;
  assert.equal(codex.docs.bearer_token_env_var, 'DOCS_TOKEN');
  assert.deepEqual(codex.docs.env_http_headers, { 'X-Team': 'TEAM_ID' });
  assert.deepEqual(codex.tool.env_vars, ['TOOL_KEY']);
  assert.deepEqual(codex.tool.env, { MODE: 'strict' });
  assert.equal(codex.tool.command, 'node');
});

// Ticket sources (spec docs/ultrapowers/specs/2026-10-02-ticket-sources-design.md, section 8).
function ticketsExample() {
  return {
    transport: 'auto',
    sources: [
      { prefix: 'GL', provider: 'gitlab', host: 'gitlab.com', namespace: 'acme/platform', defaultProject: 'tracker' },
      { prefix: 'GH', provider: 'github', owner: 'acme' },
      { prefix: 'ODOO', provider: 'odoo', url: 'https://erp.example.com', mcpUrl: 'https://erp.example.com/mcp' },
    ],
  };
}

test('ticketServers renders one http server per source', () => {
  assert.deepEqual(ticketServers(ticketsExample()), {
    'tickets-gl': { type: 'http', url: 'https://gitlab.com/api/v4/mcp' },
    'tickets-gh': {
      type: 'http', url: 'https://api.githubcopilot.com/mcp/',
      headers: { Authorization: 'Bearer ${GH_TOKEN}', 'X-MCP-Readonly': 'true' },
    },
    'tickets-odoo': { type: 'http', url: 'https://erp.example.com/mcp' },
  });
});

test('an Odoo token header takes the form mcpHeader names', () => {
  const t = ticketsExample();
  t.sources[2].mcpHeader = 'Authorization: Bearer';
  assert.deepEqual(ticketServers(t)['tickets-odoo'].headers, { Authorization: 'Bearer ${ODOO_API_KEY}' });
  t.sources[2].mcpHeader = 'X-Api-Key';
  assert.deepEqual(ticketServers(t)['tickets-odoo'].headers, { 'X-Api-Key': '${ODOO_API_KEY}' });
});

test('a cli-only source gets no MCP server; a self-hosted GitLab uses its host', () => {
  const t = ticketsExample();
  t.sources[0].transport = 'cli';
  assert.equal('tickets-gl' in ticketServers(t), false);
  t.sources[0].transport = 'mcp';
  t.sources[0].host = 'git.example.com';
  assert.equal(ticketServers(t)['tickets-gl'].url, 'https://git.example.com/api/v4/mcp');
});

test('ticketSecretLines names each token variable once', () => {
  const names = (t) => ticketSecretLines(t).map((l) => l.split('=')[0]);
  // An Odoo source always names ODOO_API_KEY: the autopilot engine signs in with it whatever
  // the MCP server's sign-in is, and it is the one Odoo key.
  assert.deepEqual(names(ticketsExample()), ['GH_TOKEN', 'GITLAB_TOKEN', 'ODOO_API_KEY']);
  const t = ticketsExample();
  t.sources[2].mcpHeader = 'Authorization: Bearer';
  t.sources.push({ prefix: 'GH2', provider: 'github', owner: 'other' });
  assert.deepEqual(names(t), ['GH_TOKEN', 'GITLAB_TOKEN', 'ODOO_API_KEY']);
  assert.match(ticketSecretLines(ticketsExample())[0], /^GH_TOKEN= +# tickets GH: gh CLI and the GitHub MCP server$/);
});

test('ticket servers render in each harness format, after the canonical ones', () => {
  const files = Object.fromEntries(
    generateMcpFiles(['claude-code', 'codex', 'cursor'], { extra: ticketServers(ticketsExample()) })
      .map(({ target, content }) => [target, parseGenerated(target, content)]),
  );
  const claude = files['.mcp.json'].mcpServers;
  assert.deepEqual(Object.keys(claude), [...Object.keys(canonical.mcpServers), 'tickets-gl', 'tickets-gh', 'tickets-odoo']);
  assert.equal(files['.cursor/mcp.json'].mcpServers['tickets-gh'].headers.Authorization, 'Bearer ${env:GH_TOKEN}');
  const codex = files['.codex/config.toml'].mcp_servers['tickets-gh'];
  assert.equal(codex.bearer_token_env_var, 'GH_TOKEN');
  assert.deepEqual(codex.http_headers, { 'X-MCP-Readonly': 'true' });
});

test('generateMcpFiles can render the ticket servers alone', () => {
  const [only] = generateMcpFiles(['claude-code'], { extra: ticketServers(ticketsExample()), canonical: false });
  assert.deepEqual(Object.keys(JSON.parse(only.content).mcpServers), ['tickets-gl', 'tickets-gh', 'tickets-odoo']);
});

test('codex refuses a secret it cannot pass by variable name', () => {
  const renamed = { x: { type: 'stdio', command: 'npx', args: [], env: { API_KEY: '${OTHER_NAME}' } } };
  assert.throws(
    () => MCP_GENERATORS.codex(renamed),
    (err) => err instanceof InitError && err.code === 'mcp-schema' && /server x/.test(err.message),
  );
});

test('an unknown server shape in .mcp.json aborts before anything is written', () => {
  const root = tmpRepo();
  const templates = fs.mkdtempSync(path.join(os.tmpdir(), 'ultrapowers-templates-'));
  fs.cpSync(path.join(repoRoot, 'templates'), templates, { recursive: true });
  fs.writeFileSync(path.join(templates, '.mcp.json'), JSON.stringify({ mcpServers: { bad: { type: 'sse', url: 'https://mcp.deepwiki.com/sse' } } }));
  const report = run(['scaffold', '--root', root, '--name', 'Demo', '--platform', 'linux'], { env: { ULTRAPOWERS_TEMPLATES_DIR: templates }, expectExit: 2 });
  assert.equal(report.error.code, 'mcp-schema');
  assert.equal(report.error.server, 'bad');
  assert.deepEqual(fs.readdirSync(root), ['.git']);
});

test('scaffold writes every MCP file, with a provenance line where the format allows one', () => {
  const root = tmpRepo();
  const report = run(['scaffold', '--root', root, '--name', 'Demo', '--date', '2026-09-30', '--platform', 'linux']);
  for (const target of Object.keys(MCP_TARGETS)) {
    assert.ok(report.written.includes(target), `${target} written`);
    const content = fs.readFileSync(path.join(root, target), 'utf8');
    const parsed = parseGenerated(target, content);
    assert.deepEqual(Object.keys(serversOf(target, parsed)).sort(), CANONICAL_IDS, target);
  }
  assert.match(fs.readFileSync(path.join(root, '.codex', 'config.toml'), 'utf8').split('\n')[0], /^# generated by ultrapowers init .* on 2026-09-30/);
  assert.match(fs.readFileSync(path.join(root, '.vscode', 'mcp.json'), 'utf8').split('\n')[0], /^\/\/ generated by ultrapowers init/);
  for (const target of ['.mcp.json', '.cursor/mcp.json', '.gemini/settings.json', '.qwen/settings.json', 'opencode.json', '.factory/mcp.json', '.kimi/mcp.json']) {
    assert.equal(fs.readFileSync(path.join(root, target), 'utf8')[0], '{', `${target} is plain JSON`);
  }
});

test('the harness selection limits the MCP files that scaffold writes', () => {
  const root = tmpRepo();
  const report = run(['scaffold', '--root', root, '--name', 'Demo', '--harnesses', 'codex', '--platform', 'linux']);
  const mcpWritten = report.written.filter((p) => MCP_TARGETS[p]);
  assert.deepEqual(mcpWritten, ['.codex/config.toml']);
  assert.ok(report.omitted.includes('.mcp.json'));
  assert.ok(report.omitted.includes('.vscode/mcp.json'));
});

test('toml-mini parses what the codex generator emits and rejects malformed input', () => {
  const parsed = parseToml('# c\na = "x # not a comment"\n[t."q k".u]\nlist = ["a", \'b\',]\nflag = true # trailing\n');
  assert.deepEqual(parsed, { a: 'x # not a comment', t: { 'q k': { u: { list: ['a', 'b'], flag: true } } } });
  assert.throws(() => parseToml('a = "open\n'), /unterminated string/);
  assert.throws(() => parseToml('a = "1"\na = "2"\n'), /duplicate key a/);
  assert.throws(() => parseToml('a = { b = "c" }\n'), /unsupported value/);
});
