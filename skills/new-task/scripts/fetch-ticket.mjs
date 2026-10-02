#!/usr/bin/env node
// fetch-ticket: resolve a ticket id, fetch the ticket through gh or glab, and
// keep a quoted copy of it. Node built-ins only. Every command prints one JSON
// object: exit 0 is a result, exit 2 is { "error": { "code", "message" } }.
//
//   fetch-ticket.mjs resolve <ID> [--root <dir>]
//   fetch-ticket.mjs fetch <ID> [--root <dir>]
//
// The plugin opens no connection itself: fetch runs the CLI the user installed
// and signed in, with arguments taken from the config and the parsed number
// only, never from ticket text. When no signed-in CLI is there, fetch answers
// { via: "mcp" } and the agent uses the source's MCP server instead.
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { execFile } from 'node:child_process';
import { resolveTicket, TicketError } from './ticket-sources.mjs';

const MARKER = path.join('.agents', 'ultrapowers.json');
const CLI = {
  github: { name: 'gh', env: 'ULTRAPOWERS_GH', token: 'GH_TOKEN' },
  gitlab: { name: 'glab', env: 'ULTRAPOWERS_GLAB', token: 'GITLAB_TOKEN' },
};
const NOT_FOUND = /not found|could not resolve|404/i;

class FetchError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

function findRoot(start) {
  let dir = path.resolve(start);
  while (true) {
    if (fs.existsSync(path.join(dir, MARKER))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) throw new FetchError('no-marker', `no ${MARKER.replace(/\\/g, '/')} at or above ${start}`);
    dir = parent;
  }
}

function readMarker(root) {
  try {
    return JSON.parse(fs.readFileSync(path.join(root, MARKER), 'utf8'));
  } catch (err) {
    throw new FetchError('bad-tickets', `${MARKER.replace(/\\/g, '/')} is not valid JSON: ${err.message}`);
  }
}

function timeoutMs() {
  const value = Number(process.env.ULTRAPOWERS_FETCH_TIMEOUT_MS);
  return Number.isFinite(value) && value > 0 ? value : 30000;
}

// The user's gh or glab, or the binary ULTRAPOWERS_GH / ULTRAPOWERS_GLAB
// names; a .js, .mjs or .cjs override runs under this node.
function runCli(provider, args) {
  const override = process.env[CLI[provider].env];
  const command = override || CLI[provider].name;
  const [file, argv] = /\.[cm]?js$/i.test(command) ? [process.execPath, [command, ...args]] : [command, args];
  return new Promise((resolve) => {
    execFile(file, argv, { timeout: timeoutMs(), windowsHide: true, maxBuffer: 16 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (!error) return resolve({ ok: true, stdout, stderr });
      if (error.code === 'ENOENT') return resolve({ ok: false, missing: true });
      if (error.killed) return resolve({ ok: false, timedOut: true });
      return resolve({ ok: false, stderr: String(stderr ?? '') });
    });
  });
}

async function cliReady(resolution) {
  const result = await runCli(resolution.provider, ['auth', 'status', '--hostname', resolution.host]);
  return result.ok;
}

function firstLine(text) {
  return String(text).split(/\r?\n/).map((l) => l.trim()).find(Boolean) ?? 'no message';
}

function normalize(provider, raw) {
  const data = JSON.parse(raw);
  if (provider === 'github') {
    return {
      title: data.title ?? '',
      body: data.body ?? '',
      url: data.url ?? '',
      state: String(data.state ?? '').toLowerCase(),
      labels: (data.labels ?? []).map((l) => (typeof l === 'string' ? l : l.name)).filter(Boolean),
      author: data.author?.login ?? null,
      via: 'cli',
    };
  }
  return {
    title: data.title ?? '',
    body: data.description ?? '',
    url: data.web_url ?? '',
    state: String(data.state ?? '').toLowerCase(),
    labels: (data.labels ?? []).map((l) => (typeof l === 'string' ? l : l.name)).filter(Boolean),
    author: data.author?.username ?? null,
    via: 'cli',
  };
}

function viewArgs(resolution) {
  const n = String(resolution.number);
  if (resolution.provider === 'github') {
    return ['issue', 'view', n, '-R', resolution.path, '--json', 'number,title,body,state,labels,author,url'];
  }
  return ['issue', 'view', n, '-R', resolution.path, '-F', 'json'];
}

function mcpAnswer(resolution) {
  const { provider, server, path: p, number } = resolution;
  return { via: 'mcp', provider, server, path: p, number };
}

async function fetchTicket(resolution) {
  if (resolution.provider === 'local') return resolution;
  if (resolution.provider === 'odoo' || resolution.transport === 'mcp') return mcpAnswer(resolution);
  const cli = CLI[resolution.provider];
  if (!(await cliReady(resolution))) {
    if (resolution.transport === 'cli') {
      throw new FetchError('no-cli', `${cli.name} is not installed or not signed in for ${resolution.host}; install ${cli.name} and run "${cli.name} auth login", or set ${cli.token}`);
    }
    return mcpAnswer(resolution);
  }
  const view = await runCli(resolution.provider, viewArgs(resolution));
  if (view.timedOut) throw new FetchError('timeout', `${cli.name} did not answer within ${timeoutMs()} ms`);
  if (view.missing) throw new FetchError('no-cli', `${cli.name} disappeared between the sign-in check and the fetch`);
  if (!view.ok) {
    const message = firstLine(view.stderr);
    throw new FetchError(NOT_FOUND.test(view.stderr) ? 'not-found' : 'cli-failed', `${cli.name}: ${message}`);
  }
  try {
    return normalize(resolution.provider, view.stdout);
  } catch (err) {
    throw new FetchError('cli-failed', `${cli.name} printed output that is not the expected JSON: ${err.message}`);
  }
}

function parseArgs(argv) {
  const [command, id, ...rest] = argv;
  const opts = { command, id, root: null };
  for (let i = 0; i < rest.length; i += 1) {
    const flag = rest[i];
    const value = rest[i + 1];
    if (value === undefined) throw new FetchError('bad-args', `${flag} needs a value`);
    if (flag === '--root') opts.root = value;
    else throw new FetchError('bad-args', `unknown argument ${flag}`);
    i += 1;
  }
  if (!['resolve', 'fetch'].includes(command) || !id) {
    throw new FetchError('bad-args', 'usage: fetch-ticket.mjs resolve|fetch <ID> [--root <dir>]');
  }
  return opts;
}

export async function main(argv) {
  try {
    const opts = parseArgs(argv);
    const root = opts.root ? path.resolve(opts.root) : findRoot(process.cwd());
    if (opts.root && !fs.existsSync(path.join(root, MARKER))) {
      throw new FetchError('no-marker', `no ${MARKER.replace(/\\/g, '/')} in ${root}`);
    }
    const resolution = resolveTicket(readMarker(root), opts.id);
    const result = opts.command === 'resolve' ? resolution : await fetchTicket(resolution);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return 0;
  } catch (err) {
    if (err instanceof FetchError || err instanceof TicketError) {
      process.stdout.write(`${JSON.stringify({ error: { code: err.code, message: err.message } }, null, 2)}\n`);
      return 2;
    }
    process.stderr.write(`${err.stack ?? err}\n`);
    return 1;
  }
}

process.exitCode = await main(process.argv.slice(2));
