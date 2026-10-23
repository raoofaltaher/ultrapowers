import assert from 'node:assert/strict';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

const __dirname = dirname(fileURLToPath(import.meta.url));
const modPath = resolve(__dirname, '../../hooks/lib/qa-shell-writes.mjs');
const { analyze } = await import(pathToFileURL(modPath).href);
const { rootIgnoresCase } = await import(pathToFileURL(resolve(__dirname, '../../hooks/lib/guard-paths.mjs')).href);

const ctx = { cwd: '/p', root: '/p', ticket: '1234' };
const denied = (cmd, c = ctx) => analyze(cmd, c) !== '';
const allowed = (cmd, c = ctx) => analyze(cmd, c) === '';

test('shell writes outside reviews/<id>/ and .ultrapowers/ are denied', () => {
  for (const cmd of [
    'printf x > /p/repo-a/src/app.js',
    'echo x >> repo-a/src/app.js',
    "cat > /p/repo-a/x <<'EOF'\nhello\nEOF",
    'echo x | tee repo-a/x',
    'echo x | tee -a /p/reviews/1234/ok.txt repo-a/x',
    'cp /tmp/a repo-a/src/app.js',
    'install -m 644 a /p/repo-a/b',
    'ln -s /p/reviews/1234/a /p/repo-a/a',
    'curl -s -o repo-a/x.html http://localhost/',
    'curl -sSo repo-a/x http://localhost/',
    'curl --output=/p/repo-a/x http://localhost/',
    'wget -O /p/repo-a/x http://localhost/',
    'rm repo-a/src/app.js',
    'rm -- /p/repo-a/a',
    'mv repo-a/src/app.js /p/.ultrapowers/app.js',
    'printf x > /p/reviews/9999/QA-REPORT.md',
    'printf x > /p/reviews/1234/../../repo-a/a',
    'printf x > ~/notes.txt',
  ]) {
    assert.ok(denied(cmd), cmd);
  }
});

test('in-place editors and truncate are denied', () => {
  for (const cmd of ["sed -i 's/a/b/' repo-a/src/app.js", "sed -Ei 's/a/b/' x", "perl -pi -e 's/a/b/' x", 'truncate -s 0 repo-a/x', "find . -name '*.js' -exec sed -i s/a/b/ {} \\;", 'ls | xargs rm']) {
    assert.ok(denied(cmd), cmd);
  }
});

test('only read-only git subcommands run', () => {
  for (const cmd of ['git -C repo-a apply fix.patch', 'git commit -am fix', 'git checkout .', 'git stash', 'git clean -d -f', 'git clean --force -d', 'git -C repo-a reset --hard HEAD~1', 'git add -A', 'git branch -D x', 'git fetch origin', 'git -c color.ui=never ls-files', 'git -c core.fsmonitor=x status', 'git grep -Ox y', 'git diff --ext-diff', 'git -C /elsewhere log']) {
    assert.ok(denied(cmd), cmd);
  }
  for (const cmd of ['git -C repo-a diff --stat main...HEAD', 'git status --porcelain', 'git -C repo-a log --oneline -5', 'git branch --show-current', 'git rev-parse --abbrev-ref HEAD', 'git --no-pager -C repo-a show HEAD --stat', 'git stash list']) {
    assert.ok(allowed(cmd), cmd);
  }
});

test('targets built from unknown variables or substitutions are denied', () => {
  assert.ok(denied('printf x > "$X/a"'));
  assert.ok(denied('printf x > $(pwd)/a'));
  assert.ok(denied('cd "$SOMEWHERE" && printf x > a'));
});

test('cd and simple assignments inside the command are followed', () => {
  assert.ok(denied('cd repo-a && printf x > a'));
  assert.ok(denied('R=/p/repo-a; printf x > "$R/a"'));
  assert.ok(allowed('R=/p/reviews/1234; printf x > "$R/artifacts/a.txt"'));
  // The variable gate: an export of a name off the safe list is refused in a QA run, so the export
  // spelling is followed through a safe-list name (QA_*) and the original name is asserted denied.
  assert.ok(allowed('export QA_R="/p/reviews/1234"; printf x > "${QA_R}/artifacts/a.txt"'));
  assert.ok(denied('export QA_R="/p/repo-a"; printf x > "${QA_R}/a.txt"'));
  assert.match(analyze('export R="/p/reviews/1234"; printf x > "${R}/artifacts/a.txt"', ctx), /variable set for a shell or interpreter/);
  assert.ok(allowed('cd /p/reviews/1234 && printf x > artifacts/a.txt'));
});

test('commands inside sh -c and docker exec are checked', () => {
  assert.ok(denied('sh -c "printf x > /p/repo-a/a"'));
  assert.ok(denied("bash -c 'echo x >> repo-a/a'"));
  assert.ok(denied('docker exec db sh -c "echo x > /etc/x"'));
  assert.ok(allowed('docker exec -e PGPASSWORD="$QA_DB_RO_PASSWORD" db psql -U qa_agent_ro -c "SELECT 1"'));
  assert.ok(allowed("docker exec db sh -c 'psql -c \"SELECT 1\" 2>/dev/null'"));
});

test('the lanes\' own commands still pass', () => {
  for (const cmd of [
    'docker logs backend-container --since 2026-01-01T00:00:00Z > /p/reviews/1234/artifacts/log-backend.txt 2>&1',
    "curl -s -o /dev/null -w '%{http_code}\\n' http://localhost:3000/health",
    'node judge.mjs out k.md | tee /p/reviews/1234/artifacts/suites-app.txt',
    'curl -s -c /p/.ultrapowers/qa-cookies-user.txt -b /p/.ultrapowers/qa-cookies-user.txt http://localhost/login',
    'curl -s -o /p/.ultrapowers/qa-api-items.json http://localhost/api/items',
    'cp /p/.playwright-mcp/shot.png /p/reviews/1234/artifacts/shot.png',
    'mv /p/reviews/1234/run-state.json /p/.ultrapowers/run-state-1234.previous.json',
    'mv /p/reviews/1234/artifacts /p/.ultrapowers/artifacts-1234-20260101T000000Z',
    "mkdir -p /p/reviews/1234/artifacts/suites/app && nohup bash run-suite.sh /p/app /p/reviews/1234/artifacts/suites/app 'node s.mjs {{out}}/j.xml' > /dev/null 2>&1 & echo $!",
    'rm /p/.ultrapowers/qa-token.json',
    'ls -la 2>/dev/null',
    'echo done &> /dev/null',
    "curl -s -X POST --data '{\"name\":\"<script>alert(1)</script>\"}' -H 'Content-Type: application/json' http://localhost/api/items",
    "grep -E 'a>b' /p/repo-a/src/app.js",
    'wget -q -O - http://localhost/',
    'date -u +%Y-%m-%dT%H:%M:%SZ',
  ]) {
    assert.equal(analyze(cmd, ctx), '', cmd);
  }
});

// A Windows-shaped scenario: the Git Bash root and the C:\ spelling resolve to one real place only
// on a Windows host, which is where such paths occur (the Windows CI job runs this suite).
test('Windows paths and a root with a space compare as the same place', { skip: process.platform !== 'win32' }, () => {
  const win = { cwd: '/c/users/msi 18/proj', root: '/c/users/msi 18/proj', ticket: '1234' };
  assert.ok(allowed("printf x > 'C:\\Users\\MSI 18\\proj\\reviews\\1234\\a.txt'", win));
  assert.ok(allowed('printf x > "C:/Users/MSI 18/proj/.ultrapowers/x"', win));
  assert.ok(denied('printf x > "C:/Users/MSI 18/proj/app/server.mjs"', win));
});

test('without a ticket the whole reviews/ folder is the report area', () => {
  assert.ok(allowed('printf x > /p/reviews/5678/a.txt', { cwd: '/p', root: '/p', ticket: '' }));
});

// ---- real paths: 8.3 short names, mixed spellings, case (issues 9, 13, 31) ----
const win32 = process.platform === 'win32';
const fwd = (p) => p.replace(/\\/g, '/');
const shortOf = (p) => fwd(execSync(`for %I in ("${p}") do @echo %~sI`, { shell: 'cmd.exe', encoding: 'utf8' }).trim());
function project(t, folder = 'Long Project Name', { caseSensitive = false } = {}) {
  const tmp = mkdtempSync(join(tmpdir(), 'qsw-'));
  t.after(() => rmSync(tmp, { recursive: true, force: true }));
  const root = join(tmp, folder);
  if (caseSensitive && win32) {
    // A Windows folder can be made case-sensitive; subfolders created after inherit it.
    mkdirSync(root, { recursive: true });
    try { execSync(`fsutil file setCaseSensitiveInfo "${root}" enable`, { shell: 'cmd.exe', stdio: 'pipe' }); } catch { /* checked by the caller */ }
  }
  for (const d of ['.agents', '.claude', '.ultrapowers', 'reviews/T-1/artifacts', 'src']) mkdirSync(join(root, d), { recursive: true });
  writeFileSync(join(root, '.agents', 'ultrapowers.json'), '{}');
  writeFileSync(join(root, '.claude', 'settings.json'), '{}');
  return root;
}

test('a write through an 8.3 short name of a protected file is denied', { skip: !win32 }, (t) => {
  const root = project(t);
  const shortFile = shortOf(join(root, '.agents', 'ultrapowers.json'));
  if (shortFile.toLowerCase() === fwd(join(root, '.agents', 'ultrapowers.json')).toLowerCase()) return t.skip('no 8.3 short names on this volume');
  const c = { cwd: fwd(root), root: fwd(root), ticket: 'T-1', profile: 'autopilot', ignoreCase: true };
  assert.match(analyze(`echo x > ${shortFile}`, c), /protected path/);
  const shortSettings = shortOf(join(root, '.claude', 'settings.json'));
  assert.match(analyze(`echo x > ${shortSettings}`, c), /protected path/);
});

test('a write into reviews/<id>/ spelled short while the root is long, and the reverse, is allowed', { skip: !win32 }, (t) => {
  const root = project(t);
  const shortRoot = shortOf(root);
  if (shortRoot.toLowerCase() === fwd(root).toLowerCase()) return t.skip('no 8.3 short names on this volume');
  const long = { cwd: fwd(root), root: fwd(root), ticket: 'T-1', ignoreCase: true };
  assert.equal(analyze(`echo x > "${shortRoot}/reviews/T-1/artifacts/a.txt"`, long), '');
  const short = { cwd: shortRoot, root: shortRoot, ticket: 'T-1', ignoreCase: true };
  assert.equal(analyze(`echo x > "${fwd(root)}/reviews/T-1/artifacts/a.txt"`, short), '');
});

test('a write to /tmp-style and native spellings of one folder compare as the same place', { skip: !win32 }, (t) => {
  const root = project(t);
  const gitBashRoot = `/${fwd(root)[0].toLowerCase()}${fwd(root).slice(2)}`;
  const c = { cwd: gitBashRoot, root: gitBashRoot, ticket: 'T-1', ignoreCase: true };
  assert.equal(analyze(`echo x > "${fwd(root)}/reviews/T-1/a.txt"`, c), '');
});

test('on a case-sensitive root, Reviews/T-1/x is outside the area', (t) => {
  const root = project(t, 'Case Project', { caseSensitive: true });
  if (rootIgnoresCase(root)) return t.skip('this volume ignores case and cannot be made case-sensitive here');
  const c = { cwd: fwd(root), root: fwd(root), ticket: 'T-1', ignoreCase: false };
  assert.match(analyze('echo x > Reviews/T-1/x', c), /limited to/);
  assert.equal(analyze('echo x > reviews/T-1/x', c), '');
});

test('on a case-insensitive root, reviews/t-1/x is inside the area', (t) => {
  const root = project(t);
  const c = { cwd: fwd(root), root: fwd(root), ticket: 'T-1', ignoreCase: true };
  assert.equal(analyze('echo x > reviews/t-1/x', c), '');
});

test('a root whose own path holds a hidden tool folder does not make the whole project protected', (t) => {
  const tmp = mkdtempSync(join(tmpdir(), 'qsw-'));
  t.after(() => rmSync(tmp, { recursive: true, force: true }));
  const root = join(tmp, '.claude', 'worktrees', 'w1');
  mkdirSync(join(root, 'src'), { recursive: true });
  const c = { cwd: fwd(root), root: fwd(root), ticket: 'T-1', profile: 'autopilot', ignoreCase: true };
  assert.equal(analyze('echo x > src/app.js', c), '');
  assert.match(analyze('echo x > .claude/settings.json', c), /protected path/);
});

// ---- environment reads (issue 8) ----
const roles = ['QA_USER', 'QA_PW_USER'];
const qaEnv = { ...ctx, roleVars: roles };
const apEnv = { cwd: '/p', root: '/p', ticket: 'GH-16', profile: 'autopilot', roleVars: [] };

test('during a QA run printenv reads only the configured role variables', () => {
  assert.equal(analyze('printenv QA_PW_USER', qaEnv), '');
  assert.equal(analyze('printenv QA_USER', qaEnv), '');
  assert.equal(analyze('printenv GITHUB_TOKEN >/dev/null', qaEnv), '');
  assert.equal(analyze('printenv GITHUB_TOKEN &>/dev/null && echo set', qaEnv), '');
  assert.match(analyze('printenv GITHUB_TOKEN', qaEnv), /role variables/);
  assert.match(analyze('printenv QA_USER GITHUB_TOKEN', qaEnv), /role variables/);
  assert.match(analyze('printenv GITHUB_TOKEN 2>/dev/null', qaEnv), /role variables/, 'a stderr-only redirect still prints the value');
  assert.match(analyze('printenv GITHUB_TOKEN | cat', qaEnv), /role variables/);
  assert.match(analyze('sh -c "printenv GITHUB_TOKEN"', qaEnv), /role variables/);
  assert.match(analyze('printenv "$NAME"', qaEnv), /cannot be verified/);
});

test('every spelling of an environment dump is denied in both profiles', () => {
  for (const env of [qaEnv, apEnv]) {
    for (const cmd of ['printenv', 'printenv -0', 'env', 'env -0', 'env -i', 'export -p', 'export', 'set', 'declare -x', 'declare -p', 'compgen -e', 'env | sort', 'sh -c "export -p"', 'nohup env']) {
      assert.match(analyze(cmd, env), /environment/, `${env.profile || 'qa'}: ${cmd}`);
    }
    // A safe-list variable before a program, and an export or declare with no program after it, pass.
    for (const cmd of ['env CI=1 node app.js', 'CI=1 NODE_ENV=test node app.js', 'export FOO=1', 'export CI=1', 'set -e', 'declare -x FOO=1', 'echo ${GITHUB_TOKEN:+set}']) {
      assert.equal(analyze(cmd, env), '', `${env.profile || 'qa'}: ${cmd}`);
    }
  }
});

test('the variable gate: QA refuses a non-safe variable before any program, a stage only before a shell or interpreter', () => {
  const gate = /variable set for a shell or interpreter/;
  for (const cmd of ['env FOO=1 node app.js', 'FOO=1 node app.js', 'export FOO=1; node app.js', 'env -u FOO node app.js']) {
    assert.match(analyze(cmd, qaEnv), gate, `qa: ${cmd}`);
    assert.match(analyze(cmd, apEnv), gate, `autopilot: ${cmd}`);
  }
  for (const cmd of ['env FOO=1 ls', 'FOO=1 ls', 'export FOO=1; ls', 'env -u FOO ls']) {
    assert.match(analyze(cmd, qaEnv), gate, `qa: ${cmd}`);
    assert.equal(analyze(cmd, apEnv), '', `autopilot: ${cmd}`);
  }
  for (const cmd of ['env -u CI ls', 'LANG=C ls', 'LC_ALL=C ls', 'ULTRAPOWERS_X=1 ls', 'QA_X=1 ls']) {
    assert.equal(analyze(cmd, qaEnv), '', `qa: ${cmd}`);
  }
});

test('during an autopilot stage printenv refuses tracker credentials and secret-like names', () => {
  for (const name of ['GH_TOKEN', 'GITHUB_TOKEN', 'GITLAB_TOKEN', 'GLAB_TOKEN', 'ODOO_API_KEY', 'ULTRAPOWERS_STAGE_PROMPT', 'MY_API_SECRET', 'db_password', 'SESSION_ID']) {
    assert.match(analyze(`printenv ${name}`, apEnv), /credential|secret/, name);
  }
  assert.equal(analyze('printenv NODE_ENV', apEnv), '');
  assert.equal(analyze('printenv GH_TOKEN >/dev/null', apEnv), '');
});

// ---- SQL during a run is an allow-list of reads (issue 3) ----
const viaDocker = (sql, extra = '-U qa_agent_ro -d appdb') => `docker exec db psql ${extra} -c "${sql}"`;

test('psql statements that are not reads are denied, whatever they start with', () => {
  for (const sql of [
    'CALL archive()', 'VACUUM', 'REINDEX TABLE t', 'REFRESH MATERIALIZED VIEW v', 'LOCK TABLE t',
    "SELECT setval('s', 1)", 'SELECT nextval(1)', 'SELECT pg_terminate_backend(1)', "SELECT lo_unlink(1)", "SELECT dblink_exec('c', 'DELETE FROM t')",
    'EXPLAIN ANALYZE DELETE FROM t', 'EXPLAIN (ANALYZE) DELETE FROM t', 'PREPARE p AS DELETE FROM t', 'EXECUTE p',
    'SELECT 1; DELETE FROM t', 'SET default_transaction_read_only = off', 'BEGIN', 'COPY t TO PROGRAM \'id\'',
    'WITH g AS (DELETE FROM t RETURNING id) SELECT 1', 'SELECT * INTO backup FROM t',
    'SELECT 1 \\gexec', '\\! touch x', '\\ir x.sql', 'SELECT :x',
  ]) {
    assert.ok(denied(viaDocker(sql)), sql);
  }
});

test('psql reads pass, including a literal that holds a semicolon or a verb', () => {
  for (const sql of [
    "SELECT * FROM t WHERE note = 'x; delete'", "SELECT id FROM logs WHERE msg = 'user signed into portal'", 'SELECT count(*) FROM users',
    'EXPLAIN SELECT 1', 'SHOW server_version', 'TABLE users', 'VALUES (1), (2)', 'WITH x AS (SELECT 1) SELECT * FROM x', 'SELECT a::int FROM t',
    'SELECT * FROM t FOR UPDATE', 'SELECT 1;',
  ]) {
    assert.ok(allowed(viaDocker(sql)), sql);
  }
  assert.ok(allowed('psql -Atc "SELECT 1" -U qa_agent_ro'));
  assert.ok(allowed('psql -Uroot -hlocalhost -c "SELECT 1"'));
  assert.ok(allowed('docker exec db sh -c \'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT count(*) FROM users"\''));
});

test('psql names its user: no superuser in any spelling, and a URI or PGUSER must be the read-only role', () => {
  for (const cmd of [
    'psql -U postgres -c "SELECT 1"', 'psql -Upostgres -c "SELECT 1"', 'psql --username=postgres -c "SELECT 1"', 'psql --username POSTGRES -c "SELECT 1"', "psql -U 'postgres' -c \"SELECT 1\"",
    'psql postgres://postgres:pw@h/db -c "SELECT 1"', 'psql postgresql://other:pw@h/db -c "SELECT 1"', 'psql postgres://h/db -c "SELECT 1"', 'psql "host=h user=postgres" -c "SELECT 1"', 'psql -d "host=h dbname=x user=app" -c "SELECT 1"',
    'PGUSER=postgres psql -c "SELECT 1"', 'PGUSER=app psql -c "SELECT 1"', 'env PGUSER=postgres psql -c "SELECT 1"', 'docker exec -e PGUSER=postgres db psql -c "SELECT 1"', 'docker exec -e PGUSER=postgres db sh -c \'psql -c "SELECT 1"\'',
    'docker compose exec db psql -U postgres -c "SELECT 1"', 'psql appdb postgres -c "SELECT 1"', 'psql -U "$SOMEONE" -c "SELECT 1"',
  ]) {
    assert.ok(denied(cmd), cmd);
  }
  for (const cmd of ['psql postgres://qa_agent_ro:pw@h/db -c "SELECT 1"', 'psql "host=h user=qa_agent_ro" -c "SELECT 1"', 'PGUSER=qa_agent_ro psql -c "SELECT 1"', 'docker exec -e PGUSER=qa_agent_ro db psql -c "SELECT 1"']) {
    assert.ok(allowed(cmd), cmd);
  }
  assert.ok(allowed('psql postgres://reader:pw@h/db -c "SELECT 1"', { ...ctx, roRole: 'reader' }));
  assert.ok(denied('psql postgres://qa_agent_ro:pw@h/db -c "SELECT 1"', { ...ctx, roRole: 'reader' }));
});

test('psql takes its SQL only from -c, and only the psql word counts', () => {
  for (const cmd of [
    "sh -c 'psql -U qa_agent_ro -d app < /tmp/x.sql'", 'psql -U qa_agent_ro -d app < /tmp/x.sql', 'psql -f x.sql', 'psql --file=x.sql', 'psql -U qa_agent_ro -c "$SQL"', 'echo "DELETE FROM t" | psql -U qa_agent_ro',
    'psql -U qa_agent_ro -c "SELECT 1" -o repo-a/out.txt',
  ]) {
    assert.ok(denied(cmd), cmd);
  }
  assert.ok(allowed('psql -U qa_agent_ro -c "SELECT 1" -o /p/reviews/1234/artifacts/out.txt'));
  // an `sh -c` elsewhere in the line does not satisfy the -c requirement of a psql with no statement
  assert.ok(denied('sh -c "echo hi" && psql -U qa_agent_ro'));
});

test('a shell read of key material through its 8.3 short name is denied on both profiles', { skip: !win32 }, (t) => {
  const root = project(t);
  writeFileSync(join(root, '.agents', 'mcp-secrets.env'), '');
  const longFile = join(root, '.agents', 'mcp-secrets.env');
  const shortFile = shortOf(longFile);
  if (shortFile.toLowerCase() === fwd(longFile).toLowerCase()) return t.skip('no 8.3 short names on this volume');
  const shortConfig = shortOf(join(root, '.agents', 'ultrapowers.json'));
  for (const profile of ['qa', 'autopilot']) {
    const c = { cwd: fwd(root), root: fwd(root), ticket: 'T-1', profile, ignoreCase: true };
    assert.match(analyze(`cat ${shortFile}`, c), /key material/, `${profile}: cat`);
    assert.match(analyze(`grep -i token ${shortFile}`, c), /key material/, `${profile}: grep`);
    assert.match(analyze(`head -c 100 < ${shortFile}`, c), /key material/, `${profile}: stdin redirect`);
    assert.match(analyze(`sh -c "cat ${shortFile}"`, c), /key material/, `${profile}: nested shell`);
    assert.equal(analyze(`cat ${shortConfig}`, c), '', `${profile}: the config is not key material`);
  }
});

test('analyze counts the psql invocations it inspected, so the hook can refuse one it did not see', () => {
  const c = { cwd: '/p', root: '/p', ticket: '1234', profile: 'qa', ignoreCase: false, roRole: 'qa_agent_ro' };
  const count = (cmd) => { const flags = {}; analyze(cmd, { ...c, flags }); return flags.psql; };
  assert.equal(count('psql -U qa_agent_ro -c "select 1"'), 1);
  assert.equal(count('docker exec db sh -c "psql -U qa_agent_ro -c \'select 1\'"'), 1);
  assert.equal(count("docker exec db-container psql -U app -c 'SELECT count(*) FROM users'"), 1);
  assert.equal(count('docker compose exec -T db psql -U qa_agent_ro -c "select 1"'), 1);
  assert.equal(count('psql -U qa_agent_ro -c "select 1" | psql -U qa_agent_ro -c "select 2"'), 2);
  assert.equal(count('ls'), 0);
  // Constructs the analyzer walks into: the psql inside is inspected and judged.
  for (const cmd of [
    'xargs psql -U postgres -c "drop table t"',
    'echo db | xargs -I{} psql -U postgres -d {} -c "drop table t"',
    'find . -name x -exec psql -U postgres -c "drop table t" \\;',
    "eval 'psql -U postgres -c \"drop table t\"'",
    '{ psql -U postgres -c "drop table t"; }',
    'sudo -u postgres psql -c "drop table t"',
    'su postgres -c "psql -c \'drop table t\'"',
    'kubectl exec db -- psql -U postgres -c "drop table t"',
    'nice -n 5 psql -U postgres -c "drop table t"',
    "P=psql; xargs $P -U postgres -c 'drop table t'",
    "xargs ps''ql -U postgres -c 'drop table t'",
  ]) {
    assert.equal(count(cmd), 1, cmd);
    assert.match(analyze(cmd, c), /superuser|not a read/, cmd);
  }
  // The same constructs with a read-only psql pass.
  for (const cmd of [
    'xargs -n1 psql -U qa_agent_ro -c "select 1"',
    'find . -name x -exec psql -U qa_agent_ro -c "select 1" \\;',
    "eval 'psql -U qa_agent_ro -c \"select 1\"'",
    '{ psql -U qa_agent_ro -c "select 1"; }',
    'sudo -u app psql -U qa_agent_ro -c "select 1"',
    'kubectl exec db -- psql -U qa_agent_ro -c "select 1"',
    'nice -n 5 psql -U qa_agent_ro -c "select 1"',
    'find . -name x -exec cat {} \\;',
    'xargs -n1 echo',
  ]) assert.equal(analyze(cmd, c), '', cmd);
  // A shell fed by stdin or a bundled -c flag is walked or refused, never passed.
  assert.match(analyze('echo "psql -U postgres -c \'drop table t\'" | sh', c), /reads its commands from stdin|did not inspect/);
  assert.match(analyze('sh -lc "psql -U postgres -c \'drop table t\'"', c), /superuser/);
  assert.match(analyze('bash -ec "psql -U postgres -c \'drop table t\'"', c), /superuser/);
  assert.match(analyze('bash -s', c), /reads its commands from stdin/);
  assert.match(analyze('cat run.sh | bash -', c), /reads its commands from stdin/);
  assert.equal(analyze('bash scripts/run-tests.sh', c), '', 'a script file stays allowed');
  // A placeholder program (the found file itself) cannot be inspected.
  assert.match(analyze('find . -type f -exec {} \\;', c), /placeholder/);
  assert.match(analyze('ls | xargs -I{} {}', c), /placeholder/);
  // Any bare psql word that was not inspected is refused, even in a lookup (fail closed, no exemption);
  // a word with whitespace is text (an SQL statement, a sentence), not a program.
  assert.match(analyze('which psql', c), /did not inspect/);
  assert.match(analyze("echo 'psql' > reviews/1234/x.txt", c), /did not inspect/);
  assert.equal(analyze("psql -U qa_agent_ro -c \"select * from pg_stat_activity where application_name='psql'\"", c), '');
  assert.equal(analyze('psql -U qa_agent_ro -c "select 1 from psql"', c), '', 'a table named psql inside an inspected statement');
  // A psql inside a command string for another program is a psql the walk did not inspect.
  assert.match(analyze('watch "psql -U postgres -c \'drop table t\'"', c), /did not inspect/);
  assert.match(analyze('parallel "psql -U postgres -c \'drop table t\'" ::: 1', c), /did not inspect/);
  assert.match(analyze('echo "checked via psql" > reviews/1234/x.txt', c), /did not inspect/);
  assert.match(analyze('docker run --rm db sh -c "psql -U postgres -c \'drop table t\'"', c), /superuser/);
  assert.match(analyze('docker run --rm db sh -lc "psql -U postgres -c \'drop table t\'"', c), /superuser/);
  assert.equal(analyze('docker compose run --rm db sh -c "psql -U qa_agent_ro -c \'select 1\'"', c), '');
  assert.equal(analyze('bash --version', c), '');
  // The reviewer's findings: identity spellings, psql's own environment, other client tools, SQL holes.
  for (const cmd of [
    'export PGUSER=postgres; psql -c "select 1"',
    'PGUSER=postgres; export PGUSER; psql -c "select 1"',
    'docker exec -u postgres db psql -c "select 1"',
    'docker exec --user=postgres db psql -c "select 1"',
    'docker exec db gosu postgres psql -c "select 1"',
    'docker exec -ePGUSER=postgres db psql -c "select 1"',
    'sudo -upostgres psql -c "select 1"',
    'su -c "psql -c \'select 1\'" postgres',
    'su -s /bin/sh postgres -c "psql -c \'select 1\'"',
    'psql "postgresql://qa_agent_ro@h/db?user=postgres" -c "select 1"',
    'psql "user=qa_agent_ro user=postgres" -c "select 1"',
  ]) assert.match(analyze(cmd, c), /superuser|not the read-only role|must be the read-only role|must name the read-only role/, cmd);
  for (const cmd of [
    'PSQLRC=reviews/1234/rc psql -U qa_agent_ro -c "select 1"',
    'export PGSERVICE=su; psql -U qa_agent_ro -c "select 1"',
    'PGSERVICEFILE=reviews/1234/svc PGSERVICE=su psql -U qa_agent_ro -c "select 1"',
    'docker exec --env-file x.env db psql -U qa_agent_ro -c "select 1"',
  ]) assert.match(analyze(cmd, c), /cannot see|cannot be inspected|reads a file/, cmd);
  for (const cmd of ['dropdb -U postgres db', 'createdb x', 'pg_restore -U postgres -d db x', 'docker exec db dropdb -U postgres app', 'pgcli -U qa_agent_ro', 'usql postgres://x@h/db -c "select 1"']) {
    assert.match(analyze(cmd, c), /is not run during/, cmd);
  }
  for (const sql of [
    'with a as (select 1) update t x set c=1',
    'with a as (update t x set c=1 returning 1) select * from a',
    'select "setval"(\'s\',1)',
    'select pg_catalog."set_config"(\'a\',\'b\',false)',
    'select "lo_import"(\'/etc/passwd\')',
    'select pg_stat_reset()',
    'select pg_wal_replay_pause()',
    'select pg_backup_start(\'x\')',
    'select pg_notify(\'c\',\'p\')',
    'select pg_ls_waldir()',
  ]) assert.notEqual(analyze(`psql -U qa_agent_ro -c "${sql}"`, c), '', sql);
  assert.equal(analyze('psql -U qa_agent_ro -c "select \'setval\' as label"', c), '', 'a function name inside a string literal is text');
  // What it cannot inspect is refused: a program from a variable, pgcli, su without -c, kubectl exec without --.
  assert.match(analyze('$P -U postgres -c "drop table t"', c), /built from a variable/);
  assert.match(analyze('xargs $P -U postgres -c "drop table t"', c), /built from a variable/);
  assert.match(analyze('pgcli -U postgres -c "drop table t"', c), /is not run during/);
  assert.match(analyze('su postgres', c), /su without -c/);
  assert.match(analyze('kubectl exec db psql -U postgres -c "drop table t"', c), /kubectl exec without --/);
  assert.match(analyze("eval \"$CMD\"", c), /built from a variable/);
});

test('an autopilot stage never prints a credential through a variable; a presence check passes', () => {
  for (const cmd of ['echo $GH_TOKEN', 'echo "$ODOO_API_KEY"', "printf '%s' \"$GITHUB_TOKEN\"", 'curl -H "Authorization: Bearer $GL_TOKEN" http://localhost:3000/', 'node app.js --token=$MY_API_SECRET']) {
    assert.match(analyze(cmd, apEnv), /credential or secret/, cmd);
  }
  for (const cmd of ['echo ${GH_TOKEN:+set}', '[ -n "$GH_TOKEN" ] && echo set', 'test -z "$ODOO_API_KEY"', 'echo $HOME', 'echo "$PATH"']) {
    assert.equal(analyze(cmd, apEnv), '', cmd);
  }
  // A QA run and a hunt refuse the tracker credentials too; a QA run keeps its role variables and the token a lane mints into its own variable.
  assert.match(analyze('echo $GH_TOKEN', qaEnv), /credential or secret/, 'a QA run never reads a tracker credential out');
  assert.equal(analyze('curl -s -H "Authorization: Bearer $TOKEN" http://localhost:3000/', { ...qaEnv, roleVars: ['QA_USER'] }), '', 'the lane-3 token variable stays');
  assert.equal(analyze('echo $QA_USER', { ...qaEnv, roleVars: ['QA_USER'] }), '', 'a role variable stays');
  assert.match(analyze('echo $MY_API_SECRET', { ...qaEnv, profile: 'hunt', ticket: 'audit-1' }), /credential or secret/, 'the hunt refuses every credential-shaped name');
});

test('a path-qualified or quoted psql inside a command string is counted', () => {
  const c = { cwd: '/p', root: '/p', ticket: '1234', profile: 'qa', ignoreCase: false, roRole: 'qa_agent_ro' };
  for (const cmd of ['watch "/usr/bin/psql -U postgres -c \'drop table t\'"', "watch \"'psql' -U postgres -c 'drop table t'\"", 'watch "C:\\\\pg\\\\bin\\\\psql.exe -U postgres -c \'drop table t\'"']) {
    assert.match(analyze(cmd, c), /did not inspect/, cmd);
  }
  assert.equal(analyze('sh -c "/usr/bin/psql -U qa_agent_ro -c \'select 1\'"', c), '');
});

test('a dollar sign is only a standalone dollar quote; anywhere else the SQL cannot be verified', () => {
  const c = { cwd: '/p', root: '/p', ticket: '1234', profile: 'qa', ignoreCase: false, roRole: 'qa_agent_ro' };
  // The shell strings are single-quoted: in double quotes `$$` is the shell's PID, a substitution.
  assert.equal(analyze("psql -U qa_agent_ro -c 'select $$a; drop table t$$'", c), '', 'a dollar-quoted literal is text');
  assert.equal(analyze("psql -U qa_agent_ro -c 'select $q$it is$q$'", c), '', 'a tagged dollar quote is text');
  for (const sql of ['select a$b$; drop table t; $ from t', 'select x$$ from t; delete from t; select $$', 'select $1', 'select 1 -- $', 'select é$b$; drop table t; $ from t']) {
    assert.match(analyze(`psql -U qa_agent_ro -c '${sql}'`, c), /cannot be verified/, sql);
  }
});

test('an array slice is a read; psql interpolation is refused in its three spellings (GH-35)', () => {
  const c = { cwd: '/p', root: '/p', ticket: '1234', profile: 'qa', ignoreCase: false, roRole: 'qa_agent_ro' };
  for (const sql of ['select arr[2:3] from t', 'select a[1 : 10] from t', 'select 1::int', "select a[1:2]::text from t"]) {
    assert.equal(analyze(`psql -U qa_agent_ro -c '${sql}'`, c), '', sql);
  }
  for (const sql of ['select :name', "select :'name'", 'select :"name"', 'select a[:n] from t', 'select a[1:n] from t', 'select m[i:j] from t', 'select 1 ] where [ x :v ]', 'select a[b[1:2]:n] from t', 'select a[1:2] from t; select :v', 'select * from t where id = :id']) {
    assert.match(analyze(`psql -U qa_agent_ro -c '${sql}'`, c), /interpolation/, sql);
  }
  for (const cmd of ['psql -U qa_agent_ro -v n=3 -c "select 1"', 'psql -U qa_agent_ro --set=n=3 -c "select 1"', 'psql -U qa_agent_ro --variable n=3 -c "select 1"', 'psql -U qa_agent_ro -vn=3 -c "select 1"', 'psql -U qa_agent_ro -Atv n=3 -c "select 1"', 'psql -U qa_agent_ro --se n=3 -c "select 1"', 'psql -U qa_agent_ro --var=n=3 -c "select 1"']) {
    assert.match(analyze(cmd, c), /define variables/, cmd);
  }
});

test('the run records are protected; no call of a run writes, moves or removes one (audit-2026-10-23 M5)', () => {
  const rec = '.ultrapowers/runs/qa-1234-0a1b2c3d.json';
  for (const cmd of [`printf '%s' '{}' > /p/${rec}`, `rm /p/${rec} /p/.ultrapowers/qa-token.json`, `rm /p/${rec}; ls`, 'rm /p/.ultrapowers/runs/hunt-audit-1-0a1b2c3d.json', `mv /p/${rec} /p/reviews/1234/x`, 'rm /p/.ultrapowers/runs/*', 'rm /p/.ultrapowers/runs', 'rm /p/.ultrapowers/*/*.json']) {
    assert.match(analyze(cmd, ctx), /is a run record; no call of a run writes, moves or removes one/, cmd);
  }
  assert.match(analyze(`rm -f /p/${rec}`, ctx), /recursive or forced delete|is a run record/);
  assert.match(analyze(`rm /p/${rec}`, ctx), /is a run record.*run-records\.mjs end once its report holds its Verdict line/);
  assert.match(analyze('rm .ultrapowers/runs/hunt-audit-1-0a1b2c3d.json', { ...ctx, profile: 'hunt' }), /is a run record/);
  assert.match(analyze(`rm ${rec}`, { ...ctx, profile: 'hunt' }), /is a run record/);
  // A run's own report-area and run-state files stay writable: only .ultrapowers/runs/ is a record.
  assert.equal(analyze('rm /p/.ultrapowers/qa-token.json', ctx), '');
});

test('with an egress allow-list curl and wget take only literal URLs on listed hosts and no redirecting option', () => {
  const c = { ...ctx, allowedHosts: ['localhost', '127.0.0.1'] };
  for (const cmd of ['curl http://localhost/ evil.example/x', 'curl --connect-to localhost:80:evil.example:80 http://localhost/', 'curl --resolve localhost:80:192.0.2.5 http://localhost/',
    'curl -x evil.example:8080 http://localhost/', 'curl -sx evil.example:8080 http://localhost/', 'curl --proxy=evil.example:8080 http://localhost/', 'curl --socks5-hostname evil.example http://localhost/',
    'curl -H "Host: evil.example" http://localhost/', 'curl --url evil.example/x http://localhost/', 'curl http://localhost\@evil.example/', 'curl "http://localhost/ evil.example"',
    'wget -e http_proxy=evil.example:8080 -q -O - http://localhost/', 'wget -q -O - http://localhost/ evil.example/x']) {
    assert.notEqual(analyze(cmd, c), '', cmd);
  }
  for (const cmd of ['curl -s http://localhost/health', 'curl -sS -H "Accept: json" --max-time 5 -w "%{http_code}" http://127.0.0.1:3000/a http://localhost/b', 'curl -s --header="Accept: x" http://localhost/', 'wget -q -O - http://localhost/']) {
    assert.equal(analyze(cmd, c), '', cmd);
  }
  // No list, no operand rule (an empty qa.hosts.allowed is open egress in a QA run).
  assert.equal(analyze('curl -s evil.example/x', ctx), '');
});

test('the hunt is a program allow-list', () => {
  const h = { ...ctx, ticket: 'audit-1', profile: 'hunt' };
  for (const cmd of ['node reviews/audit-1/x.mjs', 'python /p/reviews/audit-1/x.py', 'bash repo-a/run.sh', './repo-a/run', 'make build', 'awk -f p.awk in', 'sqlite3 db', 'curl http://localhost/', 'eval ls', 'node --require x /tmp/y.js']) {
    assert.notEqual(analyze(cmd, h), '', cmd);
  }
  // A script outside the project runs only when it is a regular file (audit-2026-10-23 H1).
  const outside = mkdtempSync(join(tmpdir(), 'hunt-script-'));
  writeFileSync(join(outside, 'x.mjs'), '');
  const outsideScript = join(outside, 'x.mjs').replace(/\\/g, '/');
  assert.notEqual(analyze('node /elsewhere/plugin/missing.mjs', h), '');
  for (const cmd of ['cat repo-a/src/app.ts', 'git log --oneline', 'sh -c "ls repo-a"', `node ${outsideScript}`, 'node /p/skills/vulnerability-hunt/scripts/hunt-preflight.mjs audit-1', 'jq . reviews/audit-1/security-findings.json']) {
    assert.equal(analyze(cmd, h), '', cmd);
  }
  assert.match(analyze('make build', h), /the hunt reads; make is not on its list/);
  assert.match(analyze('curl http://localhost/', h), /the hunt's network is its audit tools and gh api; curl is refused/);
});

test('key material is judged on the resolved words and on globs that can expand to a key name', () => {
  for (const profile of ['qa', 'hunt', 'autopilot']) {
    const c = { ...ctx, ticket: profile === 'hunt' ? 'audit-1' : '1234', profile };
    for (const cmd of ['cat .e"n"v', "cat '.e'nv", 'cat .en?', 'cat .e[n]v', 'cat .e*', 'cat repo-a/.en*', 'cat ~/.ssh/id_r?a', 'cat ~/.git-credentials', 'cat $HOME/.git-credentials', 'cat ~/.config/gh/hosts.yml',
      'cat ~/.config/glab-cli/config.yml', 'cat ~/.npmrc', 'cat ~/.netrc', 'cat ~/.docker/config.json', 'ls ~/.kube', 'ls ~/.gnupg']) {
      assert.match(analyze(cmd, c), /key material|expand to key material/, `${profile}: ${cmd}`);
    }
    for (const cmd of ['cat .env.example', 'cat repo-a/*.ts', 'ls repo-a/*', 'echo "a b"', '[ -f x ]', '{ ls; }']) {
      assert.doesNotMatch(analyze(cmd, c), /key material/, `${profile}: ${cmd}`);
    }
  }
});
