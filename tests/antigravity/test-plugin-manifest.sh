#!/usr/bin/env bash
# Validate the native Antigravity manifest (.antigravity-plugin/plugin.json) that
# `agy plugin install <git-url>` reads, so agy no longer falls back to importing
# gemini-extension.json. Also checks the description agy relies on to bootstrap
# using-ultrapowers and the root layout. CI-safe; when `agy` is on PATH, also
# runs `agy plugin validate`.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

echo "test-plugin-manifest: checking Antigravity plugin"

node - "$REPO_ROOT" <<'JS'
const fs = require("fs");
const path = require("path");
const root = process.argv[2];
const fail = (m) => { console.error("FAIL: " + m); process.exit(1); };
const read = (...p) => fs.readFileSync(path.join(root, ...p), "utf8");
const exists = (...p) => fs.existsSync(path.join(root, ...p));

if (!exists(".antigravity-plugin", "plugin.json")) fail("manifest missing at .antigravity-plugin/plugin.json");
const manifest = JSON.parse(read(".antigravity-plugin", "plugin.json"));

for (const f of ["name", "description", "displayName", "logo", "suggestedPrompts", "version", "author"]) {
  if (!manifest[f] || (Array.isArray(manifest[f]) && !manifest[f].length)) fail("manifest field '" + f + "' is missing or empty");
}
if (manifest.name !== "ultrapowers") fail("name must be 'ultrapowers', got '" + manifest.name + "'");
if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(manifest.name)) fail("name is not kebab-case");
if (manifest.description.length > 160) fail("description is longer than 160 characters; Marketplace cards fit at most 160");

const prompts = manifest.suggestedPrompts;
if (!Array.isArray(prompts) || prompts.length < 1 || prompts.length > 3) fail("suggestedPrompts must be a list of 1-3 prompts");
if (!prompts.every((p) => typeof p === "string" && p.trim())) fail("suggestedPrompts entries must be non-empty strings");

const claude = JSON.parse(read(".claude-plugin", "plugin.json"));
if (manifest.version !== claude.version) fail("version " + manifest.version + " != .claude-plugin version " + claude.version);
if (JSON.stringify(manifest.author) !== JSON.stringify(claude.author)) fail("author does not match .claude-plugin/plugin.json");

// Logo: our own square PNG.
if (!exists(manifest.logo)) fail("logo '" + manifest.logo + "' does not exist");
const buf = fs.readFileSync(path.join(root, manifest.logo));
if (!buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) fail("logo is not a PNG");
const w = buf.readUInt32BE(16), h = buf.readUInt32BE(20);
if (w !== h || w < 128) fail("logo must be square and at least 128x128, got " + w + "x" + h);

// Version bumps.
const vb = JSON.parse(read(".version-bump.json"));
if (!vb.files.some((e) => e.path === ".antigravity-plugin/plugin.json" && e.field === "version")) fail(".version-bump.json does not register .antigravity-plugin/plugin.json");

// Bootstrap: agy lists each skill's description; that of using-ultrapowers gets it loaded.
const fm = read("skills", "using-ultrapowers", "SKILL.md").match(/^---\r?\n([\s\S]*?)\r?\n---/);
const d = fm && fm[1].match(/^description:(.*)$/m);
if (!d || !d[1].includes("Use when starting any conversation")) fail("using-ultrapowers description no longer says 'Use when starting any conversation'; Antigravity relies on it to bootstrap");

// Layout: a root plugin.json would be read instead of the manifest, and Cursor
// loads any rules/*.md a plugin ships. The root hooks.json is allowed: it is the
// agy-format guardrail (test-antigravity-hooks.sh).
for (const stray of ["plugin.json", "rules"]) if (exists(stray)) fail("root " + stray + " must not exist");
JS

if command -v agy >/dev/null 2>&1; then
  output="$(agy plugin validate "$REPO_ROOT" 2>&1)" \
    || { echo "$output" >&2; echo "FAIL: agy plugin validate failed" >&2; exit 1; }
  # agy 1.3.1 printed "[ok]"; agy 1.3.3 prints "Validation passed" (and "[ok]" only for a plugin folder).
  grep -qE '\[ok\]|Validation passed' <<<"$output" \
    || { echo "$output" >&2; echo "FAIL: agy plugin validate did not report [ok] or Validation passed" >&2; exit 1; }
else
  echo "SKIP: agy not on PATH; not running agy plugin validate"
fi

echo "PASS: Antigravity plugin manifest and layout valid"
