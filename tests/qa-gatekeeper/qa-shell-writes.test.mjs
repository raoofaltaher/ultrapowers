import assert from 'node:assert/strict';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import test from 'node:test';

const __dirname = dirname(fileURLToPath(import.meta.url));
const modPath = resolve(__dirname, '../../hooks/lib/qa-shell-writes.mjs');
const { analyze } = await import(pathToFileURL(modPath).href);

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
  for (const cmd of ['git -C repo-a apply fix.patch', 'git commit -am fix', 'git checkout .', 'git stash', 'git clean -d -f', 'git clean --force -d', 'git -C repo-a reset --hard HEAD~1', 'git add -A', 'git branch -D x', 'git fetch origin']) {
    assert.ok(denied(cmd), cmd);
  }
  for (const cmd of ['git -C repo-a diff --stat main...HEAD', 'git status --porcelain', 'git -C repo-a log --oneline -5', 'git branch --show-current', 'git rev-parse --abbrev-ref HEAD', 'git --no-pager -C repo-a show HEAD --stat', 'git -c color.ui=never ls-files', 'git stash list']) {
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
  assert.ok(allowed('export R="/p/reviews/1234"; printf x > "${R}/artifacts/a.txt"'));
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
    "printf '%s' 1234 > /p/.ultrapowers/qa-active",
    'rm /p/.ultrapowers/qa-active /p/.ultrapowers/qa-token.json',
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

test('Windows paths and a root with a space compare as the same place', () => {
  const win = { cwd: '/c/users/msi 18/proj', root: '/c/users/msi 18/proj', ticket: '1234' };
  assert.ok(allowed("printf x > 'C:\\Users\\MSI 18\\proj\\reviews\\1234\\a.txt'", win));
  assert.ok(allowed('printf x > "C:/Users/MSI 18/proj/.ultrapowers/x"', win));
  assert.ok(denied('printf x > "C:/Users/MSI 18/proj/app/server.mjs"', win));
});

test('without a ticket the whole reviews/ folder is the report area', () => {
  assert.ok(allowed('printf x > /p/reviews/5678/a.txt', { cwd: '/p', root: '/p', ticket: '' }));
});
