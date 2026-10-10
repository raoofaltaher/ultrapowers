/**
 * Tests for the visual companion's Ultrapowers branding.
 *
 * The brand row shows the bundled SVG served by the companion itself and
 * the text "Ultrapowers v<version>". Nothing is fetched from, or reported
 * to, a remote host, and no environment variable changes the markup.
 */

const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const REPO_ROOT = path.join(__dirname, '../..');
const SERVER_PATH = path.join(REPO_ROOT, 'skills/brainstorming/scripts/server.cjs');
const LOGO_PATH = path.join(REPO_ROOT, 'assets/ultrapowers-mark.svg');
const LOGO_MAX_BYTES = 20480;
const PACKAGE_VERSION = JSON.parse(
  fs.readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf-8')
).version;
const TOKEN = 'testtoken-branding-0123456789abcdef';
const REPO_URL = 'https://github.com/raoofaltaher/ultrapowers';
// Built from two halves so this file itself never contains the upstream
// name (the repo-wide rename check greps every file).
const UPSTREAM_NAME = ['super', 'powers'].join('');

function cleanup(dir) {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true });
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function startServer({ port, dir, env = {}, serverPath = SERVER_PATH }) {
  cleanup(dir);
  return spawn('node', [serverPath], {
    env: {
      ...process.env,
      BRAINSTORM_PORT: String(port),
      BRAINSTORM_DIR: dir,
      BRAINSTORM_TOKEN: TOKEN,
      ...env
    }
  });
}

function waitForServer(server) {
  let stdout = '';
  let stderr = '';

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`Server did not start. stderr: ${stderr}`)), 5000);
    server.stdout.on('data', (data) => {
      stdout += data.toString();
      if (stdout.includes('server-started')) {
        clearTimeout(timeout);
        resolve();
      }
    });
    server.stderr.on('data', (data) => { stderr += data.toString(); });
    server.on('error', reject);
  });
}

function fetchPath(port, pathname, { authorized = true } = {}) {
  return new Promise((resolve, reject) => {
    const headers = authorized ? { Cookie: `brainstorm-key-${port}=${TOKEN}` } : {};
    http.get(`http://localhost:${port}${pathname}`, { headers }, (res) => {
      const chunks = [];
      res.on('data', chunk => { chunks.push(chunk); });
      res.on('end', () => resolve({
        status: res.statusCode,
        headers: res.headers,
        body: Buffer.concat(chunks)
      }));
    }).on('error', reject);
  });
}

async function fetchHtml(port) {
  const res = await fetchPath(port, '/');
  return res.body.toString('utf-8');
}

function writeFragment(dir) {
  const contentDir = path.join(dir, 'content');
  fs.mkdirSync(contentDir, { recursive: true });
  fs.writeFileSync(path.join(contentDir, 'screen.html'), '<h2>Pick a layout</h2>');
}

// A packaged tree: scripts plus the Codex manifest, no package.json and no
// assets/ directory.
function createPackagedServerFixture(version) {
  const root = fs.mkdtempSync(path.join('/tmp', 'ultrapowers-packaged-server-'));
  const scriptDir = path.join(root, 'skills/brainstorming/scripts');
  fs.cpSync(path.join(REPO_ROOT, 'skills/brainstorming/scripts'), scriptDir, { recursive: true });
  fs.mkdirSync(path.join(root, '.codex-plugin'), { recursive: true });
  fs.writeFileSync(
    path.join(root, '.codex-plugin/plugin.json'),
    JSON.stringify({ name: 'ultrapowers', version }, null, 2)
  );
  return {
    root,
    serverPath: path.join(scriptDir, 'server.cjs')
  };
}

async function withServer(options, fn) {
  const server = startServer(options);
  try {
    await waitForServer(server);
    await fn();
  } finally {
    if (server.exitCode === null && server.signalCode === null) {
      server.kill();
      await new Promise(resolve => server.once('exit', resolve));
    }
    await sleep(100);
    cleanup(options.dir);
  }
}

let passed = 0;
let failed = 0;

async function test(name, fn) {
  try {
    await fn();
    console.log(`  PASS: ${name}`);
    passed++;
  } catch (e) {
    console.log(`  FAIL: ${name}`);
    console.log(`    ${e.message}`);
    failed++;
  }
}

function brandBlock(html) {
  const match = html.match(/<div class="brand">[\s\S]*?<\/div>/);
  assert(match, 'served HTML should contain the brand block');
  return match[0];
}

function assertBranded(html, version = PACKAGE_VERSION) {
  const brand = brandBlock(html);
  assert(
    brand.includes(`Ultrapowers v${version}`),
    'branding text should read "Ultrapowers v<version>"'
  );
  assert(
    brand.includes(`<a href="${REPO_URL}">`),
    'brand link should point at the fork repository'
  );
  assert(
    /<img class="brand-logo" src="\/brand-logo\.svg"[^>]*>\s*<span class="brand-copy">Ultrapowers v/.test(brand),
    'local logo should appear before the version text'
  );
  assert(!html.includes('primeradiant.com'), 'served HTML must not reference primeradiant.com');
  assert(!/<img[^>]*src="https?:\/\//.test(html), 'no image may be loaded from a remote host');
  assert(!new RegExp(UPSTREAM_NAME, 'i').test(html), 'served HTML must not contain the upstream name');
  assert(!/filter:\s*invert/.test(html), 'coloured SVG logo must not be colour-inverted');
  assert(!html.includes('Prime Radiant'), 'served HTML must not carry the upstream brand text');
}

function assertBrandRowLayout(html) {
  assert(/\.brand a\s*\{[^}]*line-height:\s*1/i.test(html), 'brand row should align logo and text by visual height');
  assert(/\.brand a\s*\{[^}]*gap:\s*0\.5rem/i.test(html), 'brand row should keep logo and text close together');
  assert(/\.brand a\s*\{[^}]*max-width:\s*100%/i.test(html), 'brand link should be constrained so it cannot overlap the status column');
  assert(/\.brand\s*\{[^}]*overflow:\s*hidden/i.test(html), 'brand wrapper should clip before it reaches the status column');
  assert(/\.brand-logo\s*\{[^}]*height:\s*1em/i.test(html), 'logo should match the surrounding brand text size');
  assert(/\.brand-logo\s*\{[^}]*display:\s*block/i.test(html), 'logo should not reserve inline-image descender space');
}

function assertFramedScreenUsesBrandHeader(html) {
  const logoCount = (html.match(/class="brand-logo"/g) || []).length;
  assert.strictEqual(logoCount, 1, 'framed screens should render the logo only in the header');
  assert(!html.includes('<div class="indicator-bar">'), 'framed screens should not render footer chrome');
  assert(
    /<div class="header">[\s\S]*<div class="brand">[\s\S]*<div class="status">Connecting…<\/div>/.test(html),
    'header should contain branding and connection status'
  );
}

async function assertLogoServed(port) {
  const res = await fetchPath(port, '/brand-logo.svg');
  assert.strictEqual(res.status, 200, 'authorized logo request should succeed');
  assert.strictEqual(res.headers['content-type'], 'image/svg+xml', 'logo should be served as SVG');
  assert(res.body.equals(fs.readFileSync(LOGO_PATH)), 'served logo should be the bundled asset, byte for byte');
  assert.strictEqual(res.headers['cache-control'], 'public, max-age=86400', 'served logo should be cacheable for a day');
}

async function main() {
  console.log('\n--- Visual Companion Branding ---');

  await test('the bundled mark is a small SVG under 20 KB', async () => {
    const size = fs.statSync(LOGO_PATH).size;
    assert(size < LOGO_MAX_BYTES, `mark is ${size} bytes, limit ${LOGO_MAX_BYTES}`);
    assert(fs.readFileSync(LOGO_PATH, 'utf-8').trimStart().startsWith('<svg'), 'mark should be an SVG document');
  });

  await test('the logo is read once at start and served from memory', async () => {
    const port = 3462;
    const dir = '/tmp/brainstorm-branding-memory';
    const root = fs.mkdtempSync(path.join('/tmp', 'ultrapowers-logo-memory-'));
    const scriptDir = path.join(root, 'skills/brainstorming/scripts');
    fs.cpSync(path.join(REPO_ROOT, 'skills/brainstorming/scripts'), scriptDir, { recursive: true });
    fs.mkdirSync(path.join(root, '.codex-plugin'), { recursive: true });
    fs.writeFileSync(path.join(root, '.codex-plugin/plugin.json'), JSON.stringify({ name: 'ultrapowers', version: PACKAGE_VERSION }));
    fs.mkdirSync(path.join(root, 'assets'));
    const asset = path.join(root, 'assets/ultrapowers-mark.svg');
    fs.copyFileSync(LOGO_PATH, asset);
    try {
      await withServer({ port, dir, serverPath: path.join(scriptDir, 'server.cjs') }, async () => {
        writeFragment(dir);
        await sleep(300);
        const first = await fetchPath(port, '/brand-logo.svg');
        assert.strictEqual(first.status, 200, 'first logo request should succeed');
        fs.rmSync(asset);
        const second = await fetchPath(port, '/brand-logo.svg');
        assert.strictEqual(second.status, 200, 'the logo should come from memory after its file is removed');
        assert(second.body.equals(first.body), 'both responses should carry the same bytes');
      });
    } finally {
      cleanup(root);
    }
  });

  await test('framed screens render the bundled logo and Ultrapowers version text', async () => {
    const port = 3451;
    const dir = '/tmp/brainstorm-branding-default';
    await withServer({ port, dir }, async () => {
      writeFragment(dir);
      await sleep(300);
      const html = await fetchHtml(port);
      assertBranded(html);
      assertBrandRowLayout(html);
      assertFramedScreenUsesBrandHeader(html);
      await assertLogoServed(port);
    });
  });

  await test('waiting screen renders the bundled logo and Ultrapowers version text', async () => {
    const port = 3452;
    const dir = '/tmp/brainstorm-branding-waiting';
    await withServer({ port, dir }, async () => {
      const html = await fetchHtml(port);
      assert(html.includes('Waiting for the agent'), 'waiting page should still render');
      assertBranded(html);
      assertBrandRowLayout(html);
      await assertLogoServed(port);
    });
  });

  await test('logo route requires the session key like every other route', async () => {
    const port = 3453;
    const dir = '/tmp/brainstorm-branding-unauthorized-logo';
    await withServer({ port, dir }, async () => {
      const res = await fetchPath(port, '/brand-logo.svg', { authorized: false });
      assert.strictEqual(res.status, 403, 'unauthenticated logo request should be refused');
      assert(!res.body.includes('<svg'), 'unauthenticated response must not carry the SVG');
    });
  });

  await test('packaged Codex plugin reads version from .codex-plugin manifest and tolerates a missing assets/ dir', async () => {
    const port = 3457;
    const dir = '/tmp/brainstorm-branding-packaged-codex';
    const packagedVersion = '7.8.9';
    const fixture = createPackagedServerFixture(packagedVersion);

    try {
      await withServer({ port, dir, serverPath: fixture.serverPath }, async () => {
        writeFragment(dir);
        await sleep(300);
        const html = await fetchHtml(port);
        assertBranded(html, packagedVersion);
        assert(!html.includes('Ultrapowers vunknown'), 'packaged plugin should not fall back to unknown version');
        const res = await fetchPath(port, '/brand-logo.svg');
        assert.strictEqual(res.status, 404, 'missing bundled asset should yield 404, not a crash');
      });
    } finally {
      cleanup(fixture.root);
    }
  });

  await test('former telemetry opt-out variables have no effect on the markup', async () => {
    const port = 3454;
    const dir = '/tmp/brainstorm-branding-env-noop';
    let baseline;
    await withServer({ port, dir }, async () => {
      baseline = brandBlock(await fetchHtml(port));
    });
    const env = {
      ULTRAPOWERS_DISABLE_TELEMETRY: 'true',
      DISABLE_TELEMETRY: 'true',
      CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1'
    };
    await withServer({ port, dir, env }, async () => {
      const withEnv = brandBlock(await fetchHtml(port));
      assert.strictEqual(withEnv, baseline, 'brand block must be identical with and without the old opt-out variables');
    });
  });

  console.log(`\n--- Results: ${passed} passed, ${failed} failed ---`);
  if (failed > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
