#!/usr/bin/env node
// qa-preflight.mjs <ticket> [--cwd <dir>] [--change-set-only]
//
// Read-only preflight for the qa-specialist entry skill. Finds the project root by walking up
// to .agents/ultrapowers.json, validates the `qa` section against spec 3.2 (required keys and
// placeholder detection), decides which lanes are gated off and why, checks credential
// PRESENCE by variable name (never values), locates the ticket's brief, spec, plans and
// review folder, and derives the change set from repos on a branch matching the ticket
// (diffed against their default branch). Prints one JSON report on stdout. With --change-set-only
// it prints just the changeSet array and needs no qa section (the task-review skill uses it).
//
// Exit codes: 0 a report was produced (read `ok`), 2 usage, 3 no project root, 4 invalid ticket.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

export const DEFAULT_TICKET_PATTERN = '^#?[A-Za-z0-9][A-Za-z0-9._-]*$';
const AUTH_TYPES = ['form', 'oidc-password', 'custom'];
const RESULT_FORMATS = ['trx', 'vitest-json', 'junit-xml'];
const CONTENT_TERMS = /\b(generat(?:e|es|ed|ion|ing)|export(?:s|ed|ing)?|render(?:s|ed|ing)?|summar(?:y|ies|ize|ise|izes|ises)|translat(?:e|es|ed|ion|ions)|pdf|docx|csv|spreadsheet|template|email body|prompt|completion|llm|assistant|synthesi[sz]e[sd]?)\b/gi;

export function findRoot(startDir) {
  let dir = resolve(startDir);
  for (;;) {
    if (existsSync(join(dir, '.agents', 'ultrapowers.json'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

// A value is filled when it is a non-blank string. Enum spellings are values too: only the enum
// fields below ask whether a value is the template's placeholder (isPlaceholderEnum).
export function filledString(value) {
  return typeof value === 'string' && value.trim() !== '';
}

// True when the value is exactly the template's spelling of an enum field, "a|b|c" for [a, b, c].
export function isPlaceholderEnum(value, allowed) {
  return typeof value === 'string' && value.trim() === allowed.join('|');
}

export function filledList(value) {
  return Array.isArray(value) && value.some((v) => filledString(v));
}

function cleanList(value) {
  return Array.isArray(value) ? value.filter((v) => filledString(v)).map((v) => v.trim()) : [];
}

function str(value) {
  return filledString(value) ? value.trim() : '';
}

function obj(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

export function ticketBranchRegex(id) {
  const bare = String(id).replace(/^#/, '');
  const escaped = bare.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^0-9A-Za-z])${escaped}([^0-9]|$)`);
}

export function scanContentHint(text) {
  const terms = new Set();
  for (const match of String(text).matchAll(CONTENT_TERMS)) terms.add(match[0].toLowerCase());
  return { active: terms.size > 0, terms: [...terms].sort() };
}

export function validateConfig(qaInput, env) {
  const qa = obj(qaInput);
  const missing = [];
  const preconditions = [];
  const warnings = [];

  const urls = obj(qa.urls);
  const urlsOut = { frontend: str(urls.frontend), backendHealth: str(urls.backendHealth), idp: str(urls.idp), observability: str(urls.observability) };
  if (!urlsOut.frontend) missing.push('qa.urls.frontend');
  if (!urlsOut.backendHealth) missing.push('qa.urls.backendHealth');

  const hosts = obj(qa.hosts);
  const hostsOut = { allowed: cleanList(hosts.allowed), forbidden: cleanList(hosts.forbidden) };
  if (hostsOut.allowed.length === 0) missing.push('qa.hosts.allowed');

  const auth = obj(qa.auth);
  const authOut = { type: isPlaceholderEnum(auth.type, AUTH_TYPES) ? '' : str(auth.type), route: str(auth.route), tokenUrl: str(auth.tokenUrl), clientId: str(auth.clientId), recipe: str(auth.recipe) };
  if (!AUTH_TYPES.includes(authOut.type)) missing.push(`qa.auth.type (one of ${AUTH_TYPES.join(', ')})`);
  if (authOut.type === 'oidc-password' && !authOut.tokenUrl) warnings.push('qa.auth.tokenUrl is empty; lane 3 path B cannot mint tokens and will probe unauthenticated cases only');

  // An entry with every field blank is an untouched template row and stays quiet; a partly filled
  // entry is dropped with a warning, and a required one blocks the run.
  const roles = [];
  (Array.isArray(qa.roles) ? qa.roles : []).map(obj).forEach((raw, i) => {
    const role = { name: str(raw.name), userEnv: str(raw.userEnv), passwordEnv: str(raw.passwordEnv), required: raw.required === true };
    if (raw.required !== undefined && typeof raw.required !== 'boolean') {
      warnings.push(`qa.roles[${i}].required must be a boolean (got ${JSON.stringify(raw.required)}); treated as not required`);
    }
    const absent = ['name', 'userEnv', 'passwordEnv'].filter((key) => !role[key]);
    if (absent.length === 0) roles.push(role);
    else if (absent.length < 3) {
      warnings.push(`qa.roles[${i}] dropped: missing ${absent.join(', ')}`);
      if (raw.required === true) missing.push(`qa.roles[${i}] is required and missing ${absent.join(', ')}`);
    }
  });
  if (roles.length === 0) missing.push('qa.roles (at least one role with name, userEnv, passwordEnv)');
  const rolesOut = roles.map((r) => ({
    ...r,
    credentials: filledString(env[r.userEnv]) && filledString(env[r.passwordEnv]) ? 'present' : 'missing',
  }));
  for (const r of rolesOut) {
    if (r.required && r.credentials === 'missing') preconditions.push(`required role "${r.name}" has no credentials: set ${r.userEnv} and ${r.passwordEnv} in the environment`);
  }
  if (rolesOut.length > 0 && rolesOut.every((r) => r.credentials === 'missing')) preconditions.push('no role has credentials in the environment; the browser cannot log in');

  const languages = [];
  (Array.isArray(qa.languages) ? qa.languages : []).map(obj).forEach((raw, i) => {
    const language = { code: str(raw.code), switch: str(raw.switch) };
    if (language.code) languages.push(language);
    else if (language.switch) warnings.push(`qa.languages[${i}] dropped: missing code`);
  });
  if (languages.length === 0) missing.push('qa.languages (at least one language with code)');

  const containers = obj(qa.containers);
  const containersOut = { watch: cleanList(containers.watch), errorPattern: str(containers.errorPattern) || 'error|exception|fatal|unhandled' };

  const db = obj(qa.db);
  const dbOut = {
    engine: str(db.engine), container: str(db.container), host: str(db.host), database: str(db.database),
    roRole: str(db.roRole), roPasswordEnv: str(db.roPasswordEnv), tenantColumn: str(db.tenantColumn), auditTables: cleanList(db.auditTables),
  };

  const suitesOut = [];
  (Array.isArray(qa.suites) ? qa.suites : []).map(obj).forEach((raw, i) => {
    const suite = {
      repo: str(raw.repo), command: str(raw.command),
      resultFormat: isPlaceholderEnum(raw.resultFormat, RESULT_FORMATS) ? '' : str(raw.resultFormat),
      timeoutSec: Number.isFinite(Number(raw.timeoutSec)) && Number(raw.timeoutSec) > 0 ? Number(raw.timeoutSec) : 1800, path: '',
    };
    const absent = ['repo', 'command', 'resultFormat'].filter((key) => (key === 'resultFormat' ? !RESULT_FORMATS.includes(suite.resultFormat) : !suite[key]));
    if (absent.length === 0) suitesOut.push(suite);
    else if (absent.length < 3) warnings.push(`qa.suites[${i}] dropped: missing ${absent.join(', ')}`);
  });

  const observability = obj(qa.observability);
  const provider = isPlaceholderEnum(observability.provider, ['langfuse', 'none']) ? '' : str(observability.provider);
  const observabilityOut = {
    provider, publicKeyEnv: str(observability.publicKeyEnv), secretKeyEnv: str(observability.secretKeyEnv),
    credentials: filledString(env[str(observability.publicKeyEnv)]) && filledString(env[str(observability.secretKeyEnv)]) ? 'present' : 'missing',
  };

  const brand = obj(qa.brand);
  const brandOut = { logoPaths: cleanList(brand.logoPaths), tokenPaths: cleanList(brand.tokenPaths), compareRoute: str(brand.compareRoute) };
  const regression = cleanList(qa.regression);
  const api = obj(qa.api);
  const apiOut = { errorEnvelopeFields: cleanList(api.errorEnvelopeFields), crossTenantStatus: Number.isInteger(api.crossTenantStatus) ? api.crossTenantStatus : 404 };
  const knownIssuesPath = str(qa.knownIssues);
  if (!knownIssuesPath) missing.push('qa.knownIssues');

  const gates = {
    lane2: containersOut.watch.length > 0 ? { active: true, reason: '' } : { active: false, reason: 'qa.containers.watch is empty' },
    lane4: dbOut.engine && (dbOut.container || dbOut.host) && dbOut.database
      ? { active: true, reason: '' }
      : { active: false, reason: 'qa.db is not configured (engine, container or host, database)' },
    lane5: provider && provider !== 'none' && observabilityOut.publicKeyEnv && observabilityOut.secretKeyEnv
      ? (observabilityOut.credentials === 'present' ? { active: true, reason: '' } : { active: false, reason: `qa.observability keys are named (${observabilityOut.publicKeyEnv}, ${observabilityOut.secretKeyEnv}) but not set in the environment` })
      : { active: false, reason: provider === 'none' ? 'qa.observability.provider is none' : 'qa.observability.provider is not set' },
    lane6: suitesOut.length > 0 ? { active: true, reason: '' } : { active: false, reason: 'qa.suites has no complete entry (repo, command, resultFormat)' },
    lane7: { active: false, reason: 'no generated-content terms in the brief or spec; confirm during the sweep' },
    visualBrand: brandOut.logoPaths.length > 0 || brandOut.tokenPaths.length > 0 ? { active: true, reason: '' } : { active: false, reason: 'qa.brand has no logoPaths or tokenPaths' },
    localization: languages.length > 1 ? { active: true, reason: '' } : { active: false, reason: 'one language configured' },
    regression: regression.length > 0 ? { active: true, reason: '' } : { active: false, reason: 'qa.regression is empty' },
  };

  return {
    missing, preconditions, warnings,
    urls: urlsOut, hosts: hostsOut, auth: authOut, roles: rolesOut, languages, containers: containersOut, db: dbOut,
    suites: suitesOut, observability: observabilityOut, brand: brandOut, regression, api: apiOut,
    knownIssuesPath, gates,
  };
}

function fileInfo(root, rel) {
  const full = join(root, rel);
  if (!existsSync(full)) return { path: rel, exists: false, bytes: 0 };
  return { path: rel, exists: true, bytes: statSync(full).size };
}

function listFiles(root, rel) {
  const full = join(root, rel);
  if (!existsSync(full)) return [];
  return readdirSync(full).filter((f) => statSync(join(full, f)).isFile()).sort();
}

function runGit(dir, args) {
  const run = spawnSync('git', ['-C', dir, ...args], { encoding: 'utf8' });
  return { ok: run.status === 0, out: (run.stdout || '').trim(), err: (run.stderr || '').trim() };
}

function changeSetFor(root, repos, ticket) {
  const regex = ticketBranchRegex(ticket);
  return repos.map((repo) => {
    const entry = { repo: repo.name, path: repo.path, defaultBranch: repo.defaultBranch || 'main', branch: '', onTicketBranch: false, files: [], commits: [], diffStat: '', error: '' };
    const dir = resolve(root, repo.path);
    if (!existsSync(dir)) {
      entry.error = `repo path not found: ${repo.path}`;
      return entry;
    }
    const head = runGit(dir, ['rev-parse', '--abbrev-ref', 'HEAD']);
    if (!head.ok) {
      entry.error = `not a git repository or no commits: ${head.err}`;
      return entry;
    }
    entry.branch = head.out;
    entry.onTicketBranch = regex.test(entry.branch);
    if (!entry.onTicketBranch) return entry;
    let range = `${entry.defaultBranch}...HEAD`;
    let files = runGit(dir, ['diff', '--name-only', range]);
    if (!files.ok) {
      range = `${entry.defaultBranch}..HEAD`;
      files = runGit(dir, ['diff', '--name-only', range]);
    }
    if (!files.ok) {
      entry.error = `cannot diff against ${entry.defaultBranch}: ${files.err}`;
      return entry;
    }
    entry.files = files.out ? files.out.split(/\r?\n/) : [];
    const stat = runGit(dir, ['diff', '--stat', range]);
    entry.diffStat = stat.ok ? stat.out.split(/\r?\n/).slice(0, 40).join('\n') : '';
    const commits = runGit(dir, ['log', '--oneline', `${entry.defaultBranch}..HEAD`]);
    entry.commits = commits.ok && commits.out ? commits.out.split(/\r?\n/).slice(0, 20) : [];
    return entry;
  });
}

// Finds the root, reads the config and validates the ticket id. Shared by the full preflight and
// --change-set-only so the two refuse the same inputs the same way.
function projectFor(cwd, ticket) {
  const root = findRoot(cwd);
  if (!root) {
    return { fail: { ok: false, root: null, ticket, errors: [`ERROR: no .agents/ultrapowers.json at or above ${resolve(cwd)}; run /ultrapowers:init first`], exitCode: 3 } };
  }
  let config;
  try {
    config = JSON.parse(readFileSync(join(root, '.agents', 'ultrapowers.json'), 'utf8').replace(/^﻿/, ''));
  } catch (error) {
    return { fail: { ok: false, root, ticket, errors: [`ERROR: .agents/ultrapowers.json is not valid JSON: ${error.message}`], exitCode: 3 } };
  }
  // The id names the marker content and the reviews/<id>/ folder, so anything that names
  // another path is refused whatever ticketPattern allows (the same rule as ticket-lib.sh).
  if (/^(\.|\.\.|-.*)$/.test(String(ticket)) || /[/\\\s]/.test(String(ticket))) {
    return { fail: { ok: false, root, ticket, errors: [`ERROR: ticket ${JSON.stringify(String(ticket))} is not a plain folder name (no /, backslash, whitespace, leading -, . or ..)`], exitCode: 4 } };
  }
  const pattern = filledString(config.ticketPattern) ? config.ticketPattern : DEFAULT_TICKET_PATTERN;
  if (!new RegExp(pattern).test(String(ticket))) {
    return { fail: { ok: false, root, ticket, errors: [`ERROR: ticket "${ticket}" does not match ticketPattern ${pattern}`], exitCode: 4 } };
  }
  const repos = (Array.isArray(config.repos) ? config.repos : []).map(obj).map((r) => ({ name: str(r.name), path: str(r.path), defaultBranch: str(r.defaultBranch) || 'main' })).filter((r) => r.name && r.path);
  const repoList = repos.length > 0 ? repos : [{ name: basename(root), path: '.', defaultBranch: 'main' }];
  return { root, config, repoList };
}

// The change set alone: one entry per configured repo, each diffed against its own default branch.
export function changeSetOnly({ cwd, ticket }) {
  const project = projectFor(cwd, ticket);
  if (project.fail) return project.fail;
  return { ok: true, changeSet: changeSetFor(project.root, project.repoList, ticket), exitCode: 0 };
}

export function preflight({ cwd, ticket, env }) {
  const project = projectFor(cwd, ticket);
  if (project.fail) return project.fail;
  const { root, config, repoList } = project;
  if (!config.qa || typeof config.qa !== 'object') {
    return { ok: false, root, ticket, errors: [], missing: ['qa'], preconditions: [], warnings: ['the qa section is absent; run /ultrapowers:init in upgrade mode to add the template, then fill it'], exitCode: 0 };
  }
  const validated = validateConfig(config.qa, env);
  for (const suite of validated.suites) {
    const match = repoList.find((r) => r.name === suite.repo);
    suite.path = match ? resolve(root, match.path) : '';
    if (!suite.path) validated.warnings.push(`qa.suites entry "${suite.repo}" names no repo in repos[]; lane 6 skips it`);
  }
  const briefRel = join('tasks', ticket, `${ticket}.md`).split('\\').join('/');
  const specRel = join('specs', ticket, 'Spec.md').split('\\').join('/');
  const planFiles = listFiles(root, join('plans', ticket)).filter((f) => f.toLowerCase().endsWith('.md'));
  const docs = {
    brief: fileInfo(root, briefRel),
    spec: fileInfo(root, specRel),
    plans: planFiles.map((f) => fileInfo(root, `plans/${ticket}/${f}`)),
    reviewDir: `reviews/${ticket}`,
    reviewFiles: listFiles(root, join('reviews', ticket)),
  };
  const docText = [docs.brief, docs.spec].filter((d) => d.exists).map((d) => readFileSync(join(root, d.path), 'utf8')).join('\n');
  const hint = scanContentHint(docText);
  validated.gates.lane7 = hint.active
    ? { active: true, reason: `generated-content terms found: ${hint.terms.join(', ')}` }
    : { active: false, reason: 'no generated-content terms in the brief or spec; confirm during the sweep' };
  const knownIssues = { path: validated.knownIssuesPath, exists: validated.knownIssuesPath ? existsSync(join(root, validated.knownIssuesPath)) : false };
  if (validated.knownIssuesPath && !knownIssues.exists) validated.warnings.push(`known-issues file not found at ${validated.knownIssuesPath}; lanes 2 and 6 judge without a baseline`);
  const runStateRel = `reviews/${ticket}/run-state.json`;
  // Fresh or resume is decided by the PLAN rows alone: a lane or a suite left `pending` or
  // `running` in a finished run must not turn it into a resume.
  const runState = { path: runStateRel, exists: existsSync(join(root, runStateRel)), unfinished: false, error: '' };
  if (runState.exists) {
    try {
      const saved = JSON.parse(readFileSync(join(root, runStateRel), 'utf8').replace(/^﻿/, ''));
      const plan = Array.isArray(saved?.plan) ? saved.plan : [];
      runState.unfinished = plan.length === 0 || plan.some((row) => row && (row.status === 'pending' || row.status === 'running'));
    } catch (error) {
      runState.error = `run-state.json is not valid JSON: ${error.message}`;
    }
  }
  const report = {
    ok: validated.missing.length === 0,
    root, ticket,
    errors: [],
    missing: validated.missing,
    preconditions: validated.preconditions,
    warnings: validated.warnings,
    urls: validated.urls, auth: validated.auth, hosts: validated.hosts, roles: validated.roles, languages: validated.languages,
    containers: validated.containers, db: validated.db, suites: validated.suites, observability: validated.observability,
    brand: validated.brand, regression: validated.regression, api: validated.api,
    knownIssues,
    gates: validated.gates,
    docs,
    runState,
    markerExists: existsSync(join(root, '.ultrapowers', 'qa-active')),
    changeSet: changeSetFor(root, repoList, ticket),
    contentHint: hint,
    exitCode: 0,
  };
  return report;
}

function main(argv) {
  const args = [...argv];
  let cwd = process.cwd();
  const cwdIndex = args.indexOf('--cwd');
  if (cwdIndex !== -1) {
    cwd = args[cwdIndex + 1] || '';
    args.splice(cwdIndex, 2);
  }
  const onlyIndex = args.indexOf('--change-set-only');
  if (onlyIndex !== -1) args.splice(onlyIndex, 1);
  const ticket = args[0];
  if (!ticket || !cwd) {
    process.stderr.write('usage: node qa-preflight.mjs <ticket> [--cwd <dir>] [--change-set-only]\n');
    return 2;
  }
  if (onlyIndex !== -1) {
    const result = changeSetOnly({ cwd, ticket });
    if (!result.ok) {
      process.stderr.write(result.errors.join('\n') + '\n');
      return result.exitCode;
    }
    process.stdout.write(JSON.stringify(result.changeSet, null, 2) + '\n');
    return 0;
  }
  const report = preflight({ cwd, ticket, env: process.env });
  const { exitCode, ...rest } = report;
  process.stdout.write(JSON.stringify(rest, null, 2) + '\n');
  return exitCode;
}

if (process.argv[1] && basename(process.argv[1]) === 'qa-preflight.mjs') {
  process.exit(main(process.argv.slice(2)));
}
