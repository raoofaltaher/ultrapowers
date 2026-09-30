#!/usr/bin/env node
// memory-lint: structural checks for a team-memory store (.agents/memory).
//
// Node standard library only. Owns the D2 entry schema so the skill, the
// pre-commit hook and promotion from personal memory all validate one way.
//
// Usage: node memory-lint.mjs <store-dir> [--budget N]
// Output: one line per finding, "<CODE> <path>: <message>".
// Exit: 0 clean, 1 findings, 2 usage error.

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const CODES = Object.freeze([
  'BUDGET', 'DANGLING', 'ORPHAN', 'STRAY',
  'FM_MISSING', 'FM_KEYS', 'FM_NAME', 'FM_TYPE', 'FM_DATE',
  'WIKILINK', 'NEAR_DUP',
]);

const DIRS = Object.freeze({ gotchas: 'gotcha', decisions: 'decision', subsystems: 'subsystem' });
const TYPES = Object.freeze(Object.values(DIRS));
const TOP_LEVEL_FILES = new Set(['README.md', 'MEMORY.md']);
const TOP_LEVEL_KEYS = 'date,description,metadata,name';
const DEFAULT_BUDGET = 150;
const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/;
const INDEX_LINK_RE = /^- \[[^\]]+\]\(([^)]+)\)/;
const WIKILINK_RE = /\[\[([^\]]+)\]\]/g;

// Minimal YAML subset: top-level "key: value" scalars and one level of
// indented "  key: value" under a key with no value. Values lose one pair of
// surrounding quotes. Returns null without a block; malformed names the first
// line that fits neither shape.
export function parseFrontmatter(text) {
  const match = FRONTMATTER_RE.exec(text);
  if (!match) return null;
  const data = {};
  let parent = null;
  for (const raw of match[1].split(/\r?\n/)) {
    if (raw.trim() === '') continue;
    const nested = /^ {2,}([^\s:][^:]*):\s*(.*)$/.exec(raw);
    if (nested && parent !== null) {
      data[parent][nested[1].trim()] = unquote(nested[2]);
      continue;
    }
    const top = /^([^\s:][^:]*):\s*(.*)$/.exec(raw);
    if (!top) return { data, malformed: raw };
    const key = top[1].trim();
    const value = top[2].trim();
    if (value === '') {
      data[key] = {};
      parent = key;
    } else {
      data[key] = unquote(value);
      parent = null;
    }
  }
  return { data, malformed: null };
}

function unquote(value) {
  const v = value.trim();
  return v.replace(/^(["'])(.*)\1$/, '$2');
}

function isIsoDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function normalizeName(name) {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '').replace(/s$/, '');
}

function readBudget(store) {
  const configPath = resolve(store, '..', 'ultrapowers.json');
  if (!existsSync(configPath)) return DEFAULT_BUDGET;
  try {
    const config = JSON.parse(readFileSync(configPath, 'utf8'));
    const value = config?.memory?.indexBudget;
    return Number.isInteger(value) && value > 0 ? value : DEFAULT_BUDGET;
  } catch {
    return DEFAULT_BUDGET;
  }
}

function splitLines(text) {
  const lines = text.split(/\r?\n/);
  if (lines.length && lines[lines.length - 1] === '') lines.pop();
  return lines;
}

function bodyOf(text) {
  const match = FRONTMATTER_RE.exec(text);
  return match ? text.slice(match[0].length) : text;
}

export function lintStore(storeDir, { budget } = {}) {
  const store = resolve(storeDir);
  const findings = [];
  const add = (code, path, message) => findings.push({ code, path, message });

  const indexPath = join(store, 'MEMORY.md');
  if (!existsSync(indexPath)) {
    add('FM_MISSING', 'MEMORY.md', 'index file is missing');
    return findings;
  }

  const effectiveBudget = budget ?? readBudget(store);
  const indexLines = splitLines(readFileSync(indexPath, 'utf8'));
  if (indexLines.length > effectiveBudget) {
    add('BUDGET', 'MEMORY.md', `${indexLines.length} lines, budget ${effectiveBudget}`);
  }

  const linked = new Set();
  indexLines.forEach((line, i) => {
    const match = INDEX_LINK_RE.exec(line);
    if (!match) return;
    const target = match[1];
    linked.add(target);
    if (!existsSync(join(store, target))) {
      add('DANGLING', `MEMORY.md:${i + 1}`, `link target ${target} does not exist`);
    }
  });

  for (const entry of readdirSync(store, { withFileTypes: true })) {
    if (entry.isFile() && !TOP_LEVEL_FILES.has(entry.name)) {
      add('STRAY', entry.name, 'only README.md and MEMORY.md may live at the store root');
    } else if (entry.isDirectory() && !(entry.name in DIRS)) {
      add('STRAY', `${entry.name}/`, 'unknown folder; allowed: gotchas, decisions, subsystems');
    }
  }

  const entryNames = new Set();
  const entries = [];
  for (const dir of Object.keys(DIRS)) {
    const dirPath = join(store, dir);
    if (!existsSync(dirPath)) continue;
    for (const file of readdirSync(dirPath).filter((f) => f.endsWith('.md')).sort()) {
      entryNames.add(file.slice(0, -3));
      entries.push({ dir, file, rel: `${dir}/${file}`, stem: file.slice(0, -3) });
    }
  }

  const seenNormalized = new Map();
  for (const { dir, rel, stem } of entries) {
    if (!linked.has(rel)) add('ORPHAN', rel, 'entry has no index line');

    const text = readFileSync(join(store, rel), 'utf8');
    const fm = parseFrontmatter(text);
    if (!fm) {
      add('FM_MISSING', rel, 'no frontmatter block');
    } else if (fm.malformed !== null) {
      add('FM_KEYS', rel, `unparsable frontmatter line: ${fm.malformed}`);
    } else {
      const d = fm.data;
      const keys = Object.keys(d).sort().join(',');
      if (keys !== TOP_LEVEL_KEYS) add('FM_KEYS', rel, `keys are [${keys}], expected [${TOP_LEVEL_KEYS}]`);
      const meta = d.metadata;
      const metaKeys = meta && typeof meta === 'object' ? Object.keys(meta).sort().join(',') : '(not a map)';
      if (metaKeys !== 'type') add('FM_KEYS', rel, `metadata keys are [${metaKeys}], expected [type]`);
      if (typeof d.name === 'string' && d.name !== stem) add('FM_NAME', rel, `name "${d.name}" differs from file name "${stem}"`);
      const type = meta && typeof meta === 'object' ? meta.type : undefined;
      if (!TYPES.includes(type)) {
        add('FM_TYPE', rel, `metadata.type "${type}" is not gotcha, decision or subsystem`);
      } else if (type !== DIRS[dir]) {
        add('FM_TYPE', rel, `metadata.type "${type}" does not match folder ${dir}/ (expected ${DIRS[dir]})`);
      }
      if (!isIsoDate(d.date)) add('FM_DATE', rel, `date "${d.date}" is not YYYY-MM-DD`);
    }

    for (const link of bodyOf(text).matchAll(WIKILINK_RE)) {
      if (!entryNames.has(link[1].trim())) add('WIKILINK', rel, `[[${link[1]}]] does not name an entry`);
    }

    const normalized = normalizeName(stem);
    if (seenNormalized.has(normalized)) {
      add('NEAR_DUP', rel, `name differs from ${seenNormalized.get(normalized)} only by punctuation or a trailing s`);
    } else {
      seenNormalized.set(normalized, rel);
    }
  }

  return findings;
}

function main(argv) {
  const args = [...argv];
  let budget;
  const budgetIndex = args.indexOf('--budget');
  if (budgetIndex !== -1) {
    const value = Number(args[budgetIndex + 1]);
    if (!Number.isInteger(value) || value <= 0) {
      process.stderr.write('Usage: node memory-lint.mjs <store-dir> [--budget N]\n');
      return 2;
    }
    budget = value;
    args.splice(budgetIndex, 2);
  }
  const [storeDir] = args;
  if (!storeDir) {
    process.stderr.write('Usage: node memory-lint.mjs <store-dir> [--budget N]\n');
    return 2;
  }
  const findings = lintStore(storeDir, { budget });
  for (const { code, path, message } of findings) process.stdout.write(`${code} ${path}: ${message}\n`);
  return findings.length ? 1 : 0;
}

const invokedDirectly = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (invokedDirectly) process.exit(main(process.argv.slice(2)));
