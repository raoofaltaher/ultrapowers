// The files init writes into a project must not widen what an agent can read or run:
// the git read-any-file options, the toolchain pre-approvals, the secret-read denies of every harness
// that has a deny surface, the gitignored env files, the pinned secret scanner image, the isolated
// browser server, and the git that init itself starts.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../..');
const ENGINE = path.join(repoRoot, 'skills', 'init', 'scripts', 'init.mjs');
const engine = await import(pathToFileURL(ENGINE).href);
const { TOOLCHAIN_ALLOW, detectToolchains, filterToolchainAllow, QWEN_PERMISSIONS, OPENCODE_PERMISSION } = engine;

const gitHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ultrapowers-secret-githome-'));
const ENV = {
  GIT_CONFIG_GLOBAL: path.join(gitHome, 'gitconfig'),
  GIT_CONFIG_NOSYSTEM: '1',
  CONTEXT7_API_KEY: 'set-for-test',
  FIRECRAWL_API_KEY: '',
  BRAVE_API_KEY: '',
};
fs.writeFileSync(ENV.GIT_CONFIG_GLOBAL, '');

const read = (...parts) => fs.readFileSync(path.join(repoRoot, ...parts), 'utf8');
const readJson = (...parts) => JSON.parse(read(...parts));
const claudeTemplate = () => readJson('templates', '.claude', 'settings.json.tmpl');
const readDenies = (deny) => deny.filter((rule) => rule.startsWith('Read('));

function git(cwd, ...args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', env: { ...process.env, ...ENV }, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function project(files = [], { realGit = false } = {}) {
  const root = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ultrapowers-secret-')), 'proj');
  fs.mkdirSync(root, { recursive: true });
  if (realGit) git(root, 'init', '-q');
  else fs.mkdirSync(path.join(root, '.git'));
  for (const name of files) fs.writeFileSync(path.join(root, name), '');
  return root;
}

function scaffold(root, extra = [], env = {}, cwd = repoRoot, mode = 'scaffold') {
  const stdout = execFileSync(process.execPath, [ENGINE, mode, '--root', root, '--name', 'Sec', '--date', '2026-10-23', '--platform', 'linux', ...extra], {
    cwd, encoding: 'utf8', env: { ...process.env, ...ENV, ...env }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  return JSON.parse(stdout);
}

const settingsOf = (root) => JSON.parse(fs.readFileSync(path.join(root, '.claude', 'settings.json'), 'utf8'));
const toolchainEntries = (allow) => allow.filter((e) => Object.values(TOOLCHAIN_ALLOW).flat().includes(e));

// ---- 1. git read-any-file options -------------------------------------------------------------

// The options of a git read command that read a file the project never named, or write one.
const GIT_READ_ANY_FILE = {
  log: ['Bash(git log *--ou*)'],
  diff: ['Bash(git diff *--ou*)', 'Bash(git diff *--no-index*)', 'Bash(git diff */dev/null*)'],
  show: ['Bash(git show *--ou*)', 'Bash(git show *:.env*)', 'Bash(git show *:*.env*)', 'Bash(git show *:*.dev.vars*)'],
  blame: ['Bash(git blame *--contents*)', 'Bash(git blame *-S*)', 'Bash(git blame *--ignore-revs-file*)'],
};
// Subcommands with no option that takes a file path to read or write, so no deny is needed for them.
const GIT_NO_FILE_OPTION = new Set(['status', 'branch', 'rev-parse']);

test('every git subcommand the Claude settings pre-approve has its read-any-file options denied', () => {
  const { allow, deny } = claudeTemplate().permissions;
  const subcommands = [...new Set(allow.map((rule) => /^Bash\(git ([a-z-]+)/.exec(rule)?.[1]).filter(Boolean))];
  assert.ok(subcommands.includes('diff') && subcommands.includes('log') && subcommands.includes('show'));
  for (const sub of subcommands) {
    if (GIT_NO_FILE_OPTION.has(sub)) continue;
    assert.ok(GIT_READ_ANY_FILE[sub], `git ${sub} is pre-approved: list its read-any-file options in GIT_READ_ANY_FILE, or leave it out of allow`);
    for (const rule of GIT_READ_ANY_FILE[sub]) assert.ok(deny.includes(rule), `deny has ${rule}`);
  }
});

// git diff with two paths outside the work tree (or outside any repository) is a no-index diff
// without a flag: `git diff ~/.aws/credentials README.md` prints the file, and `--stat -p` prints
// it too. A `git diff:*` prefix pre-approval lets that form through, so only the forms that cannot
// carry it are pre-approved; any other form asks first (Medium 16 of the 2026-10-23 hunt).
test('git diff is pre-approved only in forms that cannot read an outside path, never as a prefix', () => {
  const { allow, deny } = claudeTemplate().permissions;
  const diffs = allow.filter((rule) => rule.startsWith('Bash(git diff'));
  assert.equal(diffs.includes('Bash(git diff:*)'), false, 'git diff:* would pre-approve the flagless outside-path form');
  assert.deepEqual([...diffs].sort(), [
    'Bash(git diff --cached:*)', 'Bash(git diff --name-only:*)', 'Bash(git diff --stat)', 'Bash(git diff HEAD:*)', 'Bash(git diff)',
  ].sort());
  // --stat is exact: `git diff --stat -p a b` on two outside paths prints both files, so no suffix is approved
  assert.equal(diffs.some((rule) => /--stat.*:\*\)$/.test(rule)), false, 'no prefix approval after --stat');
  for (const rule of GIT_READ_ANY_FILE.diff) assert.ok(deny.includes(rule), `deny has ${rule}`);
});

// `git show HEAD:web/.env` is pre-approved by `git show:*`, and the deny `*:.env*` needs the name right after
// the colon: the `rev:path` forms that name an env or .dev.vars file at any depth are denied too, and
// CLAUDE.md says so.
test('git show denies the rev:path forms that name an env or dev.vars file at any depth, and CLAUDE.md says so', () => {
  const { allow, deny } = claudeTemplate().permissions;
  assert.ok(allow.includes('Bash(git show:*)'));
  for (const rule of ['Bash(git show *:.env*)', 'Bash(git show *:*.env*)', 'Bash(git show *:*.dev.vars*)']) assert.ok(deny.includes(rule), `deny has ${rule}`);
  assert.match(read('templates', 'CLAUDE.md.tmpl'), /`rev:path` forms of `git show` that name an `\.env` or `\.dev\.vars` file at any depth/);
});

test('git blame is not pre-approved, so its options ask first', () => {
  const { allow, deny } = claudeTemplate().permissions;
  assert.equal(allow.some((rule) => rule.startsWith('Bash(git blame')), false);
  for (const rule of GIT_READ_ANY_FILE.blame) assert.ok(deny.includes(rule), `deny has ${rule}`);
});

// ---- 2. toolchain pre-approvals ----------------------------------------------------------------

test('the settings template lists every toolchain entry the engine can drop, and no other build or test command', () => {
  const allow = claudeTemplate().permissions.allow;
  for (const entries of Object.values(TOOLCHAIN_ALLOW)) for (const entry of entries) assert.ok(allow.includes(entry), `template has ${entry}`);
  const commands = allow.filter((rule) => rule.startsWith('Bash(') && !rule.startsWith('Bash(git ') && !rule.startsWith('Bash(docker '));
  assert.deepEqual(commands.sort(), Object.values(TOOLCHAIN_ALLOW).flat().sort(), 'a pre-approved command outside TOOLCHAIN_ALLOW would reach every project');
});

test('a project with only package.json gets the npm entries and no other toolchain entry', () => {
  const root = project(['package.json']);
  scaffold(root);
  const allow = settingsOf(root).permissions.allow;
  assert.deepEqual(toolchainEntries(allow).sort(), [...TOOLCHAIN_ALLOW.npm].sort());
  for (const needle of ['cargo', 'go ', 'dotnet', 'pytest']) assert.equal(allow.some((rule) => rule.includes(needle)), false, `no ${needle} entry`);
});

test('an empty project gets no toolchain entry', () => {
  const root = project();
  scaffold(root);
  assert.deepEqual(toolchainEntries(settingsOf(root).permissions.allow), []);
});

test('each toolchain is detected from its own marker files at the project root, and only those', () => {
  const cases = [
    [['package.json'], ['npm']],
    [['App.sln'], ['dotnet']], [['src.csproj'], ['dotnet']], [['lib.fsproj'], ['dotnet']],
    [['pyproject.toml'], ['python']], [['setup.py'], ['python']], [['setup.cfg'], ['python']],
    [['requirements.txt'], ['python']], [['requirements-dev.txt'], ['python']], [['pytest.ini'], ['python']], [['tox.ini'], ['python']],
    [['Cargo.toml'], ['cargo']], [['go.mod'], ['go']],
    [['package.json', 'go.mod'], ['npm', 'go']],
    [['README.md', 'notes.txt', 'package.json.bak', 'Cargo.lock'], []],
  ];
  for (const [files, expected] of cases) assert.deepEqual(detectToolchains(project(files)).sort(), [...expected].sort(), files.join(','));
  const nested = project();
  fs.mkdirSync(path.join(nested, 'svc'));
  fs.writeFileSync(path.join(nested, 'svc', 'package.json'), '');
  fs.mkdirSync(path.join(nested, 'package.json.d'));
  assert.deepEqual(detectToolchains(nested), [], 'a nested folder is not the project root');
  assert.deepEqual(detectToolchains(path.join(nested, 'missing')), [], 'an unreadable root detects nothing');
});

test('a project with every toolchain gets every entry, in the template order', () => {
  const root = project(['package.json', 'App.sln', 'pyproject.toml', 'Cargo.toml', 'go.mod']);
  scaffold(root);
  const allow = settingsOf(root).permissions.allow;
  assert.deepEqual(allow, claudeTemplate().permissions.allow);
});

test('filterToolchainAllow removes whole lines and leaves valid JSON', () => {
  const template = read('templates', '.claude', 'settings.json.tmpl');
  for (const found of [[], ['npm'], ['go', 'cargo'], Object.keys(TOOLCHAIN_ALLOW)]) {
    const out = filterToolchainAllow(template, found);
    const parsed = JSON.parse(out);
    assert.deepEqual(toolchainEntries(parsed.permissions.allow).sort(), found.flatMap((id) => TOOLCHAIN_ALLOW[id]).sort());
    assert.equal(out.split('\n').length, template.split('\n').length - (Object.values(TOOLCHAIN_ALLOW).flat().length - found.flatMap((id) => TOOLCHAIN_ALLOW[id]).length));
  }
});

test('an existing .claude/settings.json is never rewritten by scaffold', () => {
  const root = project(['package.json']);
  fs.mkdirSync(path.join(root, '.claude'));
  const mine = '{ "permissions": { "allow": ["Bash(make:*)"] } }\n';
  fs.writeFileSync(path.join(root, '.claude', 'settings.json'), mine);
  const report = scaffold(root);
  assert.ok(report.skipped.includes('.claude/settings.json'));
  assert.equal(fs.readFileSync(path.join(root, '.claude', 'settings.json'), 'utf8'), mine);
});

test('upgrade proposes the settings for the toolchains of the project, next to the file it never overwrites', () => {
  const changes = readJson('templates', 'CHANGES.json');
  assert.ok(engine.compareVersions(changes['.claude/settings.json'], '2.1.0') > 0, 'CHANGES.json offers the new settings to a project scaffolded by 2.1.0');
  const root = project(['Cargo.toml'], { realGit: true });
  scaffold(root);
  const markerFile = path.join(root, '.agents', 'ultrapowers.json');
  const marker = JSON.parse(fs.readFileSync(markerFile, 'utf8'));
  marker.pluginVersion = '2.1.0';
  fs.writeFileSync(markerFile, JSON.stringify(marker, null, 2));
  const mine = '{ "permissions": { "allow": ["Bash(make:*)"] } }\n';
  fs.writeFileSync(path.join(root, '.claude', 'settings.json'), mine);
  execFileSync(process.execPath, [ENGINE, 'upgrade', '--root', root, '--apply', '.claude/settings.json'], { encoding: 'utf8', env: { ...process.env, ...ENV }, stdio: ['ignore', 'pipe', 'pipe'] });
  assert.equal(fs.readFileSync(path.join(root, '.claude', 'settings.json'), 'utf8'), mine);
  const proposal = JSON.parse(fs.readFileSync(path.join(root, '.claude', 'settings.json.ultrapowers-new'), 'utf8'));
  assert.deepEqual(toolchainEntries(proposal.permissions.allow).sort(), [...TOOLCHAIN_ALLOW.cargo].sort());
});

// ---- 3. the same secret-read denies in every harness config ------------------------------------

const NEW_READ_DENIES = [
  'Read(**/.dev.vars)', 'Read(**/.dev.vars.*)', 'Read(**/.env.secrets)',
  // the deployment-environment spellings the enumerated list missed (Low 18 of the 2026-10-23 hunt)
  'Read(**/.env.prod)', 'Read(**/.env.dev)', 'Read(**/.env.preview)', 'Read(**/.env.prd)', 'Read(**/.env.stage)', 'Read(**/.env.uat)',
];

test('the Claude template denies the dev.vars and env.secrets files and keeps .env.example readable', () => {
  const deny = claudeTemplate().permissions.deny;
  for (const rule of NEW_READ_DENIES) assert.ok(deny.includes(rule), `deny has ${rule}`);
  assert.equal(deny.some((rule) => /\.env\.\*\)$/.test(rule)), false, 'no .env.* glob, which would deny .env.example');
  assert.equal(deny.some((rule) => rule.includes('.env.example')), false);
});

test('parity: every Read deny of the Claude template is in the Cursor CLI template and in the Qwen Code settings', () => {
  const claude = readDenies(claudeTemplate().permissions.deny);
  assert.ok(claude.length >= 20, 'the Claude template has its Read denies');
  const cursor = readJson('templates', '.cursor', 'cli.json.tmpl').permissions.deny;
  const qwen = QWEN_PERMISSIONS.deny;
  const lacksCursor = claude.filter((rule) => !cursor.includes(rule));
  const lacksQwen = claude.filter((rule) => !qwen.includes(rule));
  assert.deepEqual(lacksCursor, [], 'the Cursor CLI template lacks these Claude Read denies');
  assert.deepEqual(lacksQwen, [], 'the Qwen Code settings lack these Claude Read denies');
  assert.deepEqual(cursor.filter((rule) => !claude.includes(rule)), [], 'the Cursor template has no deny the Claude template lacks');
});

test('.cursorignore names the same env files as the Claude denies, plus dev.vars', () => {
  const lines = read('templates', '.cursorignore.tmpl').split('\n').filter((l) => l && !l.startsWith('#'));
  const envNames = claudeTemplate().permissions.deny.map((rule) => /^Read\(\*\*\/((?:\.agents\/mcp-secrets|)\.env[^)]*|\.dev\.vars[^)]*)\)$/.exec(rule)?.[1]).filter(Boolean);
  assert.ok(envNames.length >= 16, 'the Claude template has its env denies');
  for (const name of envNames) {
    assert.ok(lines.includes(name), `.cursorignore has ${name}`);
  }
  assert.equal(lines.includes('.env.*'), false, 'example env files stay readable');
});

test('OpenCode denies the dev.vars files, and the example exception still follows the broad env deny', () => {
  const read_ = OPENCODE_PERMISSION.read;
  assert.equal(read_['*.dev.vars'], 'deny');
  assert.equal(read_['*.dev.vars.*'], 'deny');
  const keys = Object.keys(read_);
  assert.ok(keys.indexOf('*.env.example') > keys.indexOf('*.env.*'));
});

test('the scaffold writes the new denies into every deny surface it has', () => {
  const root = project();
  scaffold(root);
  const qwen = JSON.parse(fs.readFileSync(path.join(root, '.qwen', 'settings.json'), 'utf8')).permissions.deny;
  const cursor = JSON.parse(fs.readFileSync(path.join(root, '.cursor', 'cli.json'), 'utf8')).permissions.deny;
  for (const rule of NEW_READ_DENIES) {
    assert.ok(settingsOf(root).permissions.deny.includes(rule), `claude ${rule}`);
    assert.ok(qwen.includes(rule), `qwen ${rule}`);
    assert.ok(cursor.includes(rule), `cursor ${rule}`);
  }
  assert.equal(JSON.parse(fs.readFileSync(path.join(root, 'opencode.json'), 'utf8')).permission.read['*.dev.vars'], 'deny');
});

// ---- 4. env files gitignored by the scaffold ---------------------------------------------------

function ignored(root, ...paths) {
  const out = execFileSync('git', ['check-ignore', '--no-index', ...paths], { cwd: root, encoding: 'utf8', env: { ...process.env, ...ENV }, stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  return out.split('\n').filter(Boolean);
}
function ignoredOrNone(root, ...paths) {
  try { return ignored(root, ...paths); } catch (err) { if (err.status === 1) return []; throw err; }
}

test('the managed .gitignore block ignores env and dev.vars files and keeps .env.example tracked', () => {
  const root = project([], { realGit: true });
  scaffold(root);
  const lines = fs.readFileSync(path.join(root, '.gitignore'), 'utf8').split('\n');
  for (const line of ['.env', '.env.*', '!.env.example', '.dev.vars', '.dev.vars.*']) assert.ok(lines.includes(line), `block has ${line}`);
  assert.ok(lines.indexOf('!.env.example') > lines.indexOf('.env.*'), 'the negation follows the glob it overrides');
  assert.deepEqual(
    ignoredOrNone(root, '.env', '.env.local', '.env.production', '.env.development', '.env.secrets', '.dev.vars', '.dev.vars.local', 'web/.env', 'web/.dev.vars'),
    ['.env', '.env.local', '.env.production', '.env.development', '.env.secrets', '.dev.vars', '.dev.vars.local', 'web/.env', 'web/.dev.vars'],
  );
  assert.deepEqual(ignoredOrNone(root, '.env.example', 'web/.env.example'), [], '.env.example is not ignored');
  for (const line of ['!.env.sample', '!.env.template', '!.env.dist']) assert.ok(lines.includes(line), `block has ${line}`);
  assert.deepEqual(ignoredOrNone(root, '.env.sample', '.env.template', '.env.dist', 'web/.env.sample'), [], 'the committed example names are not ignored');
  assert.deepEqual(ignoredOrNone(root, '.env.local'), ['.env.local'], '.env.local stays ignored');
});

test('an existing .gitignore keeps its lines and gains the block, and the negation still works', () => {
  const root = project([], { realGit: true });
  fs.writeFileSync(path.join(root, '.gitignore'), 'node_modules/\ndist/\n.env\n');
  scaffold(root);
  const text = fs.readFileSync(path.join(root, '.gitignore'), 'utf8');
  assert.ok(text.startsWith('node_modules/\ndist/\n.env\n'), 'the existing lines are untouched');
  assert.equal(text.split('\n').filter((l) => l === '# >>> ultrapowers').length, 1);
  assert.deepEqual(ignoredOrNone(root, '.env.example'), []);
  assert.deepEqual(ignoredOrNone(root, '.env.local', 'node_modules/x'), ['.env.local', 'node_modules/x']);
  // A second run replaces the block in place and changes nothing.
  const before = text;
  scaffold(root);
  assert.equal(fs.readFileSync(path.join(root, '.gitignore'), 'utf8'), before);
});

// ---- 5. gitleaks image pinned by digest --------------------------------------------------------

test('both pre-commit hooks pin the gitleaks image by tag and digest and run it without a network', () => {
  const hooks = [read('templates', '.githooks', 'pre-commit.tmpl'), read('.githooks', 'pre-commit')];
  const digests = hooks.map((text) => {
    const match = /zricethezav\/gitleaks:v8\.30\.1@(sha256:[0-9a-f]{64})/.exec(text);
    assert.ok(match, 'image is tag@digest');
    assert.match(text, /docker run --rm --network none /);
    assert.doesNotMatch(text, /gitleaks:latest/);
    assert.match(text, /update[\s#]+tag and digest together/);
    assert.equal(text.includes('\r'), false, 'LF endings');
    return match[1];
  });
  assert.equal(digests[0], digests[1], 'the template and the repository hook name the same digest');
});

// ---- 6. Playwright MCP server isolated ---------------------------------------------------------

test('the Playwright MCP server starts isolated, in the template and in every generated config', () => {
  const server = readJson('templates', '.mcp.json').mcpServers.playwright;
  assert.deepEqual(server.args, ['-y', '@playwright/mcp@0.0.83', '--isolated']);
  const root = project();
  scaffold(root);
  const generated = JSON.parse(fs.readFileSync(path.join(root, '.mcp.json'), 'utf8')).mcpServers.playwright;
  assert.ok(generated.args.includes('--isolated'));
  const cursor = JSON.parse(fs.readFileSync(path.join(root, '.cursor', 'mcp.json'), 'utf8')).mcpServers.playwright;
  assert.ok(cursor.args.includes('--isolated'));
});

// ---- 6b. the generated MCP launcher starts nothing from the project --------------------------

// The launcher runs `node -e` in the project's folder, in the user's own environment. On Windows it
// starts cmd.exe, and cmd.exe then looks up `npx`: by bare name both are searched in the current
// directory first, so a committed cmd.exe or npx.cmd would run with the server's secrets (Low 19 of
// the 2026-10-23 hunt). cmd comes from %ComSpec% and the child's environment stops the search.
test('the MCP launcher starts cmd from %ComSpec% and stops the working-directory search on Windows', () => {
  const { NPX_LAUNCHER } = engine;
  assert.match(NPX_LAUNCHER, /process\.env\.ComSpec/, 'cmd is the absolute %ComSpec%');
  assert.doesNotMatch(NPX_LAUNCHER, /\[\s*'cmd'/, 'cmd is never started by bare name');
  assert.match(NPX_LAUNCHER, /env:\{\.\.\.process\.env,NoDefaultCurrentDirectoryInExePath:'1'\}/, 'the child does not search the working directory');
  assert.match(NPX_LAUNCHER, /'\/d','\/c','npx'/, 'npx still resolves inside the launcher environment');
});

// ---- 7. init starts the git that is outside the project ----------------------------------------

test('init.mjs starts no tool by bare name', () => {
  const source = read('skills', 'init', 'scripts', 'init.mjs');
  assert.doesNotMatch(source, /execFileSync\(\s*'git'/);
  assert.doesNotMatch(source, /(?:execFileSync|spawnSync|spawn|execSync|exec)\(\s*['"`]/, 'every child is started from a resolved absolute path');
  assert.match(source, /resolveTool\('git'/);
  assert.match(source, /childEnv\(\)/);
});

test('a git.exe or git planted in the project, and a relative PATH entry, are never run by init', () => {
  const root = project([], { realGit: true });
  // The planted tool is a copy of node whose script `config` (the first argument init passes it) leaves a marker.
  const planted = path.join(root, process.platform === 'win32' ? 'git.exe' : 'git');
  fs.copyFileSync(process.execPath, planted);
  fs.chmodSync(planted, 0o755);
  fs.writeFileSync(path.join(root, 'config'), "require('fs').writeFileSync('planted-git-ran', 'x');\n");
  fs.writeFileSync(path.join(root, 'rev-parse'), "require('fs').writeFileSync('planted-git-ran', 'x');\n");
  const env = { PATH: `.${path.delimiter}${process.env.PATH}` };
  scaffold(root);
  const report = scaffold(root, [], env, root, 'join');
  assert.equal(fs.existsSync(path.join(root, 'planted-git-ran')), false, 'the planted git did not run');
  assert.equal(report.hooksPath, 'set', 'the real git set core.hooksPath');
  // Read the file, not `git config` by bare name: with cwd = root, Node on Windows would start the planted git.exe.
  assert.match(fs.readFileSync(path.join(root, '.git', 'config'), 'utf8'), /^\s*hooksPath\s*=\s*\.githooks\s*$/m);
});

test('with no git on PATH, init reports the hooks path as failed instead of throwing', () => {
  const root = project([], { realGit: true });
  const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'ultrapowers-nogit-'));
  scaffold(root);
  const report = scaffold(root, [], { PATH: empty, Path: empty }, repoRoot, 'join');
  assert.equal(report.hooksPath, 'failed');
});
