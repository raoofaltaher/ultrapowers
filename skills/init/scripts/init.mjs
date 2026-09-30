#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

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
const MODES = ['scaffold', 'join', 'upgrade', 'detect'];

export const ALL_HARNESSES = [
  'claude-code', 'codex', 'cursor', 'copilot', 'gemini', 'qwen', 'opencode',
  'factory', 'kimi', 'devin', 'antigravity', 'hermes', 'pi', 'muse',
];
export const KB_FOLDERS = [
  'tasks', 'specs', 'plans', 'reviews', 'evals', 'handbooks',
  'brand-book', 'business', 'playbooks', 'release-notes',
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

export const MCP_GENERATORS = {};

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
  return template.replace(/\{\{([A-Za-z][A-Za-z0-9]*)\}\}/g, (_, key) => {
    if (!Object.prototype.hasOwnProperty.call(vars, key)) {
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

export function applyBlock(existing, body) {
  const trimmedBody = body.replace(/^\n+/, '').replace(/\n+$/, '');
  const block = `${BLOCK_START}\n${trimmedBody}\n${BLOCK_END}\n`;
  if (existing === null || existing === undefined) {
    return { content: block, action: 'created' };
  }
  const eol = existing.includes('\r\n') ? '\r\n' : '\n';
  const text = lf(existing);
  const startIdx = text.indexOf(BLOCK_START);
  const endIdx = text.indexOf(BLOCK_END);
  let next;
  let action;
  if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
    const afterEnd = text.indexOf('\n', endIdx);
    const tail = afterEnd === -1 ? '' : text.slice(afterEnd + 1);
    next = `${text.slice(0, startIdx)}${block}${tail}`;
    action = next === text ? 'unchanged' : 'replaced';
  } else {
    let head = text;
    if (head.length > 0 && !head.endsWith('\n')) head += '\n';
    if (head.length > 0) head += '\n';
    next = `${head}${block}`;
    action = 'appended';
  }
  return { content: eol === '\n' ? next : next.replace(/\n/g, eol), action };
}

function defaultBranchOf(repoDir) {
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
  try {
    return readJson(file);
  } catch (err) {
    throw new InitError('marker-corrupt', `${MARKER_PATH} is not valid JSON: ${err.message}`, { path: file });
  }
}

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
  const canonical = readJson(path.join(TEMPLATES_DIR, '.mcp.json'));
  return {
    wrapper: canonical._ultrapowers?.windowsNpxWrapper ?? [],
    servers: canonical.mcpServers ?? {},
  };
}

export function generateMcpFiles(harnesses, platform) {
  const { wrapper, servers } = loadCanonicalMcp();
  const files = [];
  for (const [target, schema] of Object.entries(MCP_TARGETS)) {
    const generator = MCP_GENERATORS[schema];
    if (!generator) continue;
    if (!harnesses.includes(TARGET_HARNESS[target])) continue;
    const wrap = platform === 'win32' && wrapper.includes(schema);
    files.push({ target, content: generator(servers, { wrap }) });
  }
  return files;
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

export function buildVars(opts, repos, harnesses, written) {
  const version = pluginVersion();
  const topology = repos.length ? 'nested' : 'root';
  return {
    name: opts.name ?? path.basename(opts.root),
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
    missingSecrets: [],
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
    if (target === MARKER_PATH) continue;
    const rendered = render(readTemplate(source), vars, path.relative(TEMPLATES_DIR, source));
    files.push({ target, content: provenance(target, rendered, vars), executable: path.posix.basename(target) === 'pre-commit' });
  }
  if (harnesses.includes(TARGET_HARNESS[OUTPUT_STYLE_TARGET])) {
    files.push({ target: OUTPUT_STYLE_TARGET, content: readTemplate(OUTPUT_STYLE_SOURCE), executable: false });
  } else {
    omitted.push(OUTPUT_STYLE_TARGET);
  }
  for (const { target, content } of generateMcpFiles(harnesses, opts.platform)) {
    files.push({ target, content, executable: false });
  }
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

function writeFile(root, target, content, executable, dryRun) {
  const full = path.join(root, target);
  if (dryRun) return;
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content, 'utf8');
  if (executable) {
    try { fs.chmodSync(full, 0o755); } catch { /* Windows has no mode bits */ }
  }
}

export function applyPlan(root, plan, report, dryRun) {
  for (const file of plan.files) {
    const full = path.join(root, file.target);
    if (fs.existsSync(full)) {
      report.skipped.push(file.target);
      continue;
    }
    writeFile(root, file.target, file.content, file.executable, dryRun);
    report.written.push(file.target);
  }
  for (const block of plan.blocks) {
    const full = path.join(root, block.target);
    const existing = fs.existsSync(full) ? fs.readFileSync(full, 'utf8') : null;
    const { content, action } = applyBlock(existing, block.body);
    if (action !== 'unchanged') {
      writeFile(root, block.target, content, false, dryRun);
      report.written.push(block.target);
    }
    report.blocks.push({ path: block.target, action });
  }
  report.omitted.push(...plan.omitted);
}

export function writeMarker(root, opts, repos, harnesses, written, dryRun, report) {
  const full = path.join(root, MARKER_PATH);
  if (fs.existsSync(full)) {
    report.skipped.push(MARKER_PATH);
    return;
  }
  const source = path.join(TEMPLATES_DIR, '.agents', 'ultrapowers.json.tmpl');
  const vars = buildVars(opts, repos, harnesses, written);
  const content = render(readTemplate(source), vars, '.agents/ultrapowers.json.tmpl');
  JSON.parse(content);
  writeFile(root, MARKER_PATH, content, false, dryRun);
}

export function saveMarker(root, marker, dryRun) {
  if (dryRun) return;
  fs.writeFileSync(path.join(root, MARKER_PATH), `${JSON.stringify(marker, null, 2)}\n`, 'utf8');
}

export function secretNames(root) {
  const file = path.join(root, '.agents', 'mcp-secrets.env.example');
  if (!fs.existsSync(file)) return [];
  return lf(fs.readFileSync(file, 'utf8')).split('\n')
    .map((line) => line.match(/^([A-Z][A-Z0-9_]*)=/))
    .filter(Boolean)
    .map((m) => m[1]);
}

export function missingSecrets(root, env = process.env) {
  return secretNames(root).filter((name) => !env[name]);
}

function scaffoldNextSteps(opts, report, repos) {
  const steps = [
    'Run once per clone: git config core.hooksPath .githooks',
  ];
  const secrets = missingSecrets(opts.root);
  if (secrets.length) {
    steps.push(`Define these variables in your user environment (see .agents/mcp-secrets.env.example): ${secrets.join(', ')}`);
  }
  steps.push('Approve the project MCP servers when your harness prompts for them.');
  if (opts.platform === 'win32') {
    steps.push('After the first git add, run: git update-index --chmod=+x .githooks/pre-commit');
  }
  if (repos.length) {
    steps.push(`Nested clones detected and ignored by the managed .gitignore block: ${repos.map((r) => r.name).join(', ')}`);
  }
  const bestEffort = BEST_EFFORT_TARGETS.filter((t) => report.written.includes(t));
  if (bestEffort.length) {
    steps.push(`Best-effort files, verify against the vendor docs: ${bestEffort.join(', ')}`);
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
  const plan = planPayload(opts, repos, harnesses);
  applyPlan(opts.root, plan, report, opts.dryRun);
  writeMarker(opts.root, opts, repos, harnesses, report.written, opts.dryRun, report);
  report.written.sort();
  report.skipped.sort();
  report.nextSteps = scaffoldNextSteps(opts, report, repos);
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
  };
}

export function runJoin(opts) {
  throw new InitError('not-implemented', `${opts.mode} mode is not implemented yet`);
}

export function runUpgrade(opts) {
  throw new InitError('not-implemented', `${opts.mode} mode is not implemented yet`);
}

export function main(argv) {
  try {
    const opts = parseArgs(argv);
    const runners = { scaffold: runScaffold, detect: runDetect, join: runJoin, upgrade: runUpgrade };
    const report = runners[opts.mode](opts);
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

export function gitConfigGet(root, key) {
  try {
    return execFileSync('git', ['config', '--local', '--get', key], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return '';
  }
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
  process.exitCode = main(process.argv.slice(2));
}
