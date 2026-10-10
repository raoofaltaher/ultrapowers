#!/usr/bin/env node
// qa-shell-writes.mjs: the write gate of hooks/qa-guardrail for shell commands (spec 3.5:
// "writes outside reviews/<id>/ and .ultrapowers/"). Reads NUL-separated fields on stdin,
// `<cwd>\0<root>\0<ticket>\0<command>`, and prints a deny reason, or nothing when the command
// writes only inside the report area. Paths arrive on stdin, never as arguments, so Git Bash's
// argument conversion cannot rewrite them. Node standard library only.
//
// The analysis is a quote-aware tokenizer, not a shell: it follows `cd` and simple literal
// assignments inside the command, looks inside `sh -c '...'` and `docker exec ... sh -c`, and
// fails closed on what it cannot resolve (a target built from an unknown variable or a
// command substitution). A regex hook cannot contain a determined adversary; this closes the
// ordinary spellings of a write.
import { readFileSync } from 'node:fs';
import { inside, realCanonical, rel } from './guard-paths.mjs';

const DEVICES = new Set(['/dev/null', '/dev/stdout', '/dev/stderr', '/dev/tty', 'nul', '/dev/fd/1', '/dev/fd/2']);
const SHELLS = new Set(['sh', 'bash', 'zsh', 'dash', 'ksh']);
const WRAPPERS = new Set(['nohup', 'command', 'exec', 'time', 'sudo', 'nice', 'stdbuf']);
// Options of a wrapper that take a value, so the word after them is not the program.
const WRAPPER_VALUE_OPTS = new Set(['-n', '--adjustment', '-o', '-e', '-i']);
const SUDO_VALUE_OPTS = new Set(['-g', '-p', '-C', '-D', '-h', '-r', '-t', '-T', '-U', '--group', '--prompt', '--host', '--role', '--type', '--other-user']);
const XARGS_VALUE_OPTS = new Set(['-I', '-i', '-n', '-P', '-L', '-d', '-a', '-E', '-s', '--max-args', '--max-procs', '--max-lines', '--delimiter', '--arg-file', '--eof', '--max-chars', '--replace']);
// A psql named anywhere in a command must be one the walk inspected: there is no list of programs
// that "only print" their words, because a printed word can reach a shell (`echo psql ... | sh`),
// and a word with whitespace can be a command for a program that runs it (`watch "psql ..."`).
// The SQL argument of an inspected psql is the one text that is not counted.
// This analyzer matches the shapes a cooperative agent types; it is not a sandbox. A program
// spelled with a glob, copied under another name or run from a script file is beyond a text rule,
// and the read-only database role's grants are the guarantee behind it.
const PSQL_PROGRAMS = new Set(['psql']);
// psql as a token inside a word that holds whitespace (a command string for another program).
const PSQL_TOKEN_RE = /(^|[\s;&|(`'"])(?:[^\s'"`;&|()]*[\\/])?psql(\.exe)?(?=[\s;&|)`'"]|$)/gi;
const psqlTokens = (text) => (String(text).match(PSQL_TOKEN_RE) || []).length;
// Other PostgreSQL client tools: never run during a run; lane 4 reaches the database through
// psql -c as the read-only role only.
const PG_TOOLS = new Set(['pgcli', 'usql', 'dropdb', 'createdb', 'createuser', 'dropuser', 'pg_restore', 'pg_dump', 'pg_dumpall', 'pgbench', 'vacuumdb', 'reindexdb', 'clusterdb', 'pg_ctl', 'pg_basebackup', 'pg_resetwal', 'pg_upgrade', 'pg_rewind']);
// Variables that make psql read a file or a service entry the analyzer cannot see.
const PSQL_ENV = new Set(['PSQLRC', 'PGSERVICE', 'PGSERVICEFILE', 'PGOPTIONS', 'PGPASSFILE', 'PGSYSCONFDIR']);
const progName = (v) => String(v || '').replace(/\\/g, '/').split('/').pop().toLowerCase().replace(/\.exe$/, '');
const GIT_READ_ONLY = new Set(['status', 'diff', 'log', 'show', 'rev-parse', 'ls-files', 'ls-tree', 'rev-list', 'cat-file',
  'blame', 'describe', 'grep', 'shortlog', 'merge-base', 'for-each-ref', 'name-rev', 'show-ref', 'help', 'version', 'whatchanged']);
const GIT_GLOBAL_WITH_ARG = new Set(['-C', '-c', '--git-dir', '--work-tree', '--namespace', '--exec-path']);
const WRITE_PROGRAMS = new Set(['rm', 'unlink', 'mv', 'cp', 'tee', 'sed', 'perl', 'truncate', 'install', 'ln', 'dd', 'shred']);

// ---------- tokenizer ----------
// A word is a list of parts: { t: 'lit', v } | { t: 'var', v: NAME } | { t: 'dyn' }.
function tokenize(src) {
  const toks = [];
  let i = 0;
  let word = null;
  const heredocs = [];
  const lit = (s) => {
    if (!word) word = [];
    const last = word[word.length - 1];
    if (last && last.t === 'lit') last.v += s; else word.push({ t: 'lit', v: s });
  };
  const push = (part) => { if (!word) word = []; word.push(part); };
  const endWord = () => { if (word) { toks.push({ k: 'w', parts: word }); word = null; } };
  const op = (v) => { endWord(); toks.push({ k: 'op', v }); };
  const readVar = (inDouble) => {
    // at src[i] === '$'
    const next = src[i + 1];
    if (next === '(') { // $( ... ) or $(( ... ))
      let depth = 0; let j = i + 1;
      for (; j < src.length; j++) { if (src[j] === '(') depth++; else if (src[j] === ')') { depth--; if (depth === 0) break; } }
      i = j + 1; push({ t: 'dyn' }); return;
    }
    if (next === '{') {
      const j = src.indexOf('}', i + 2);
      const name = j === -1 ? '' : src.slice(i + 2, j);
      i = j === -1 ? src.length : j + 1;
      push(/^[A-Za-z_][A-Za-z0-9_]*$/.test(name) ? { t: 'var', v: name } : { t: 'dyn' });
      return;
    }
    const m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(src.slice(i + 1));
    if (m) { i += 1 + m[0].length; push({ t: 'var', v: m[0] }); return; }
    if (next && /[0-9@*#?$!-]/.test(next)) { i += 2; push({ t: 'dyn' }); return; }
    i += 1; lit('$'); void inDouble;
  };
  while (i < src.length) {
    const c = src[i];
    if (c === '\n') {
      op(';'); i++;
      while (heredocs.length) { // skip each pending here-document body
        const delim = heredocs.shift();
        for (;;) {
          const nl = src.indexOf('\n', i);
          const line = src.slice(i, nl === -1 ? src.length : nl);
          i = nl === -1 ? src.length : nl + 1;
          if (line.replace(/^\t+/, '') === delim || nl === -1) break;
        }
      }
      continue;
    }
    if (c === ' ' || c === '\t' || c === '\r') { endWord(); i++; continue; }
    if (c === '#' && !word) { const nl = src.indexOf('\n', i); i = nl === -1 ? src.length : nl; continue; }
    if (c === '\\') { if (src[i + 1] === '\n') { i += 2; continue; } lit(src[i + 1] || ''); i += 2; continue; }
    if (c === "'") { const j = src.indexOf("'", i + 1); lit(src.slice(i + 1, j === -1 ? src.length : j)); if (!word) word = []; i = j === -1 ? src.length : j + 1; continue; }
    if (c === '"') {
      if (!word) word = [];
      i++;
      while (i < src.length && src[i] !== '"') {
        if (src[i] === '\\' && '"\\$`\n'.includes(src[i + 1] || '')) { lit(src[i + 1]); i += 2; continue; }
        if (src[i] === '$') { readVar(true); continue; }
        if (src[i] === '`') { const j = src.indexOf('`', i + 1); i = j === -1 ? src.length : j + 1; push({ t: 'dyn' }); continue; }
        lit(src[i]); i++;
      }
      i++; continue;
    }
    if (c === '$') { readVar(false); continue; }
    if (c === '`') { const j = src.indexOf('`', i + 1); i = j === -1 ? src.length : j + 1; push({ t: 'dyn' }); continue; }
    // operators; a word made only of digits right before < or > is a file descriptor
    if (c === '>' || c === '<') {
      let fd = null;
      if (word && word.length === 1 && word[0].t === 'lit' && /^[0-9]+$/.test(word[0].v)) { fd = word[0].v; word = null; }
      let v = c; i++;
      if (c === '<' && src[i] === '<') { v = '<<'; i++; if (src[i] === '<') { v = '<<<'; i++; } else if (src[i] === '-') { i++; } }
      else if (c === '>' && (src[i] === '>' || src[i] === '|')) { v += src[i]; i++; }
      else if (c === '<' && src[i] === '>') { v = '<>'; i++; }
      if ((v === '>' || v === '<') && src[i] === '&') { v += '&'; i++; }
      op(v);
      toks[toks.length - 1].fd = fd;
      if (v === '<<') { // remember the delimiter so the body is skipped at the next newline
        let j = i; while (src[j] === ' ' || src[j] === '\t') j++;
        const m = /^(['"]?)([^\s'"<>;&|()]+)\1/.exec(src.slice(j));
        if (m) heredocs.push(m[2]);
      }
      continue;
    }
    if (c === '&') {
      if (src[i + 1] === '>') { i += 2; let v = '&>'; if (src[i] === '>') { v = '&>>'; i++; } op(v); continue; }
      if (src[i + 1] === '&') { op('&&'); i += 2; continue; }
      op('&'); i++; continue;
    }
    if (c === '|') { if (src[i + 1] === '|') { op('||'); i += 2; continue; } if (src[i + 1] === '&') { op('|'); i += 2; continue; } op('|'); i++; continue; }
    if (c === ';' || c === '(' || c === ')') { op(c === ';' ? ';' : c); i++; continue; }
    lit(c); i++;
  }
  endWord();
  return toks;
}

// ---------- paths ----------
function normPath(p) {
  let s = String(p).replace(/\\/g, '/').replace(/\/{2,}/g, '/');
  if (s.length > 1 && s.endsWith('/')) s = s.slice(0, -1);
  const m = /^([A-Za-z]):(.*)$/.exec(s);
  if (m) s = `/${m[1].toLowerCase()}${m[2]}`;
  return s;
}

// Paths no stage may write through a shell, whatever the profile; the autopilot profile adds
// CI, the plugin hooks and the env file (the QA profile never reaches them: its area is reviews/).
// Named targets, not folder names (see the same lists in hooks/qa-guardrail): `src/hooks/` of a
// React app and `appsettings.json` of a .NET app are ordinary files; the ticket's state files are
// the gate's record; the repository's commit hooks run inside the engine's own commit and push.
// The autopilot marker, the kill switch and the engine's lock folder are the envelope's own
// switches, written by the engine outside the stage. The QA marker stays writable: the QA skill
// writes and removes it itself inside the session.
const PROTECTED_RE = /(^|\/)\.ssh\/|authorized_keys|id_rsa|id_ed25519|(^|\/)\.aws\/|mcp-secrets\.env|\.local\.(sh|env|json)$|hooks\/qa-guardrail|\.agents\/ultrapowers\.json|(^|\/)\.claude\/|(^|\/)\.git\/|(^|\/)\.githooks\/|(^|\/)\.[a-z0-9_-]+\/settings(\.local)?\.json$|(^|\/)tasks\/[^/]+\/(autopilot\.json|stage-log\.jsonl)$|(^|\/)\.ultrapowers\/(autopilot-active|autopilot-stop)$|(^|\/)\.ultrapowers\/autopilot(\/|$)|(^|\/)\.ultrapowers$/;
// Key material no stage may read through a shell (the same list as the hook's shell rule). The
// hook tests the typed command; an 8.3 short name (MCP-SE~1.ENV) hides the name from it, so any
// word with an alias-shaped segment is resolved here and its real name is tested.
const KEY_RE = /(^|\/)\.ssh\/|authorized_keys|id_rsa|id_ed25519|\.aws\/credentials|mcp-secrets\.env|secrets\.local|\.local\.sh|(^|\/)\.env($|\.)/;
const SHORT_SEG = /[^\\/]~[0-9]/;
const AUTOPILOT_PROTECTED_RE = /(^|\/)\.github\/|(^|\/)\.gitlab-ci\.yml$|(^|\/)hooks\/(qa-guardrail|session-start|team-memory-[a-z]+|lib\/|hooks(-cursor|-codex)?\.json|run-hook\.cmd)|(^|\/)\.gemini\/hooks\/|(^|\/)\.husky\/|(^|\/)\.pre-commit-config\.ya?ml$|(^|\/)lefthook\.ya?ml$|(^|\/)\.env($|\.)/;
// Git subcommands an autopilot stage may run: the read-only set plus the commands that build the
// ticket branch. Pushing and integrating belong to the engine; nothing discards work; `config` and
// the `-c` global option are refused because an alias resolves to any command at all.
// Only commands that spawn no program and write nothing outside the index, the objects and the
// worktree files the stage owns: no apply/am (patch paths are unseen), no bisect, submodule or
// maintenance (they run hooks and commands), no tag (the engine names refs).
const GIT_AUTOPILOT_ALLOWED = new Set(['add', 'commit', 'mv', 'rm']);

// ---------- psql ----------
// Lane 4 reads the database and never writes it. SQL is judged as an allow-list of statement
// starts, not a deny-list of verbs: a function call, EXPLAIN ANALYZE, PREPARE, CALL, VACUUM, a
// psql meta-command or a variable interpolation all write without a leading write verb.
// The qa.db.roRole grants (SELECT only) are the guarantee; this is the layer in front of them.
const PSQL_DYN = '\0dyn';
const PSQL_VAR = '\0var:';
const PSQL_VALUED = new Set(['c', 'd', 'f', 'h', 'L', 'o', 'p', 'P', 'R', 'T', 'U', 'v', 'F']);
const PSQL_LONG = { command: 'c', dbname: 'd', file: 'f', host: 'h', 'log-file': 'L', output: 'o', port: 'p', pset: 'P', 'record-separator': 'R', 'table-attr': 'T', username: 'U', set: 'v', variable: 'v', 'field-separator': 'F' };
const SQL_START_OK = new Set(['select', 'with', 'show', 'table', 'values', 'explain']);
const SQL_FUNCTIONS = /\b(setval|nextval|set_config|pg_terminate_backend|pg_cancel_backend|pg_reload_conf|pg_rotate_logfile|pg_switch_wal|pg_promote|lo_[a-z_]+|dblink[a-z_]*|pg_advisory_[a-z_]+|pg_(?:read|ls|stat)_[a-z_]*file[a-z_]*|pg_ls_[a-z_]+|pg_file_[a-z_]+|pg_(?:create|drop)_[a-z_]+|pg_replication_[a-z_]+|pg_logical_[a-z_]+|pg_stat_reset[a-z_]*|pg_wal_replay_[a-z_]+|pg_backup_(?:start|stop)|pg_notify|pg_sleep[a-z_]*|pg_import_system_collations|query_to_xml[a-z_]*|table_to_xml[a-z_]*|cursor_to_xml)\b/;

// The SQL with every quoted string, quoted identifier and dollar-quoted body replaced by an empty
// placeholder, so a `;` or a verb inside a literal is not taken for code. null: an unterminated one.
function stripLiterals(sql) {
  let out = '';
  for (let i = 0; i < sql.length;) {
    const c = sql[i];
    if (c === "'" || c === '"') {
      let j = i + 1;
      for (;;) {
        if (j >= sql.length) return null;
        if (sql[j] === c) { if (sql[j + 1] === c) { j += 2; continue; } break; }
        j++;
      }
      // A quoted identifier keeps its name (lowercased, with code characters blanked), so a
      // function written as "setval"(...) is still seen by the function rule.
      out += c === "'" ? "''" : `"${sql.slice(i + 1, j).toLowerCase().replace(/[;:\\$]/g, '_')}"`;
      i = j + 1;
      continue;
    }
    if (c === '$') {
      // PostgreSQL lexes `a$b$` as an identifier, not as a dollar quote, so a `$` that continues an
      // identifier, a bare `$`, or a `$1` parameter is not a quote the stripper can follow: the
      // statement is unverifiable (fail closed) rather than mis-stripped.
      const prev = sql[i - 1] || '';
      if (/[A-Za-z0-9_$]/.test(prev) || prev.charCodeAt(0) > 0x7f) return null;
      const m = /^\$([A-Za-z_][A-Za-z0-9_]*)?\$/.exec(sql.slice(i));
      if (!m) return null;
      const end = sql.indexOf(m[0], i + m[0].length);
      if (end === -1) return null;
      out += "''";
      i = end + m[0].length;
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

function analyzeSql(sql) {
  const text = stripLiterals(sql);
  if (text === null) return 'an unterminated quote, or a dollar sign outside a standalone dollar quote, in the SQL cannot be verified; lane 4 is read-only';
  if (/\\[A-Za-z!]/.test(text)) return 'a psql meta-command (a backslash command) is blocked; it can run a shell, read a file or repeat a statement';
  if (/(^|[^:]):[A-Za-z_]/.test(text)) return 'psql variable interpolation (:name) is blocked; the SQL must be literal and inspectable';
  for (const piece of text.split(';')) {
    const st = piece.trim().toLowerCase();
    if (!st) continue;
    const first = (/^[a-z]+/.exec(st) || [''])[0];
    if (!SQL_START_OK.has(first)) return `psql statement "${first.toUpperCase() || st.slice(0, 12)}" is not a read; lane 4 runs SELECT, WITH, SHOW, TABLE, VALUES and EXPLAIN only`;
    if (first === 'explain' && /\banaly[sz]e\b/.test(st)) return 'EXPLAIN ANALYZE runs the statement it explains; lane 4 is read-only';
    if (/\bselect\b[^;]*\binto\b/.test(st)) return 'SELECT ... INTO <table> creates a table and is blocked; lane 4 is read-only';
    if (/\b(insert\s+into|delete\s+from|merge\s+into)\b|\bupdate\s+(only\s+)?[a-z0-9_."]+\s+(as\s+)?([a-z0-9_"]+\s+)?set\b/.test(st)) return 'a write inside a CTE or subquery is blocked; lane 4 is read-only';
    const fn = SQL_FUNCTIONS.exec(st);
    if (fn) return `${fn[1]}() can change data or the server and is blocked; lane 4 is read-only`;
  }
  return '';
}

// Splits the words after `psql` into its options: the SQL given with -c, the database targets,
// the user, the positional arguments and the files it writes (-o, -L). Short options cluster
// (`-Atc SQL`, `-cSQL`, `-Uapp`), long ones take `=` or the next word.
function parsePsql(args) {
  const out = { sqls: [], targets: [], positionals: [], user: undefined, file: false, outputs: [] };
  const handle = (opt, val) => {
    if (opt === 'c') out.sqls.push(val === undefined ? '' : val);
    else if (opt === 'f') out.file = true;
    else if (opt === 'd') out.targets.push(val);
    else if (opt === 'U') out.user = val;
    else if (opt === 'o' || opt === 'L') { if (val !== undefined) out.outputs.push(val); }
  };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === PSQL_DYN || a.startsWith(PSQL_VAR)) { out.positionals.push(a); continue; }
    if (a === '--') { out.positionals.push(...args.slice(i + 1)); break; }
    if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      const opt = PSQL_LONG[(eq === -1 ? a : a.slice(0, eq)).slice(2)];
      if (opt) handle(opt, eq === -1 ? args[++i] : a.slice(eq + 1));
      continue;
    }
    if (a.length > 1 && a[0] === '-') {
      for (let k = 1; k < a.length; k++) {
        if (!PSQL_VALUED.has(a[k])) continue;
        const attached = a.slice(k + 1);
        handle(a[k], attached === '' ? args[++i] : attached);
        break;
      }
      continue;
    }
    out.positionals.push(a);
  }
  return out;
}

// The files a psql command writes through -o and -L, as words.
export function psqlOutputs(args) { return parsePsql(args).outputs; }

// `args` are the words after `psql`; a word built from a variable or substitution is PSQL_DYN,
// a pure $NAME reference is PSQL_VAR + NAME (`-U "$POSTGRES_USER"` is the recipe's fallback).
// pgUser: the value of a PGUSER= given to the command, when there is one.
export function analyzePsql(args, { roRole = 'qa_agent_ro', pgUser, psqlEnv = false } = {}) {
  const role = roRole || 'qa_agent_ro';
  const { sqls, targets, positionals, user, file } = parsePsql(args);
  if (psqlEnv) return 'psql with PSQLRC, PGSERVICE, PGSERVICEFILE, PGOPTIONS or PGPASSFILE set reads a file the analyzer cannot see; run it with the plain environment';
  if (file) return 'psql from a script file (-f) is blocked; the SQL is not inspectable';
  if (sqls.length === 0) return 'psql without an inline -c statement is blocked; lane 4 runs single inline statements only';
  const superuser = (u) => /^postgres$/i.test(String(u).trim());
  const noSuper = 'psql as the database superuser is blocked; use the configured read-only role (qa.db.roRole)';
  // A connection string names its user itself: it must be the read-only role.
  for (const t of [...targets, positionals[0]]) {
    if (t === undefined) continue;
    if (t === PSQL_DYN) return 'a psql database argument is built from a substitution; it cannot be verified';
    if (t.startsWith(PSQL_VAR)) continue;
    let who = null;
    // libpq lets a later spelling win: a `user=` query parameter over the userinfo, and the last
    // `user=` of a conninfo string over an earlier one.
    if (/^postgres(ql)?:\/\//i.test(t)) {
      try {
        const u = new URL(t);
        const params = u.searchParams.getAll('user');
        who = params.length ? params[params.length - 1] : (decodeURIComponent(u.username) || '');
      } catch { return 'a psql connection URI that cannot be parsed is blocked'; }
    } else if (t.includes('=')) {
      const all = [...t.matchAll(/(?:^|\s)user\s*=\s*('(?:[^'\\]|\\.)*'|\S+)/gi)];
      who = all.length ? all[all.length - 1][1].replace(/^'|'$/g, '') : '';
    } else continue;
    if (superuser(who)) return noSuper;
    if (who !== role) return `a psql connection string must name the read-only role (qa.db.roRole = ${role}), not ${who ? `"${who}"` : 'the default user'}`;
  }
  const named = user !== undefined ? user : positionals[1];
  if (named === PSQL_DYN) return 'the psql user is built from a substitution; it cannot be verified';
  if (named !== undefined && named.startsWith(PSQL_VAR) && named !== `${PSQL_VAR}POSTGRES_USER`) return 'the psql user comes from a variable; use the read-only role by name (qa.db.roRole)';
  if (named !== undefined && superuser(named)) return noSuper;
  if (pgUser !== undefined) {
    if (pgUser === null || pgUser === PSQL_DYN) return 'PGUSER is built from a variable; it cannot be verified';
    if (superuser(pgUser)) return noSuper;
    if (pgUser !== role) return `PGUSER must be the read-only role (qa.db.roRole = ${role}), not "${pgUser}"`;
  }
  for (const sql of sqls) {
    if (sql === PSQL_DYN || sql.startsWith(PSQL_VAR)) return 'the SQL is built from a variable or substitution; it must be literal and inspectable';
    const reason = analyzeSql(sql);
    if (reason) return reason;
  }
  return '';
}

// ---------- analysis ----------
const ENV_DUMP = 'dumping the environment is blocked; check a variable with ${NAME:+set} instead';
// A stage reads no tracker credential and nothing named like a secret out of the environment.
const TRACKER_VARS = /^(GH_TOKEN|GITHUB_TOKEN|GITLAB_TOKEN|GLAB_TOKEN|ODOO_API_KEY|ULTRAPOWERS_STAGE_.*)$/i;
const SECRET_VARS = /TOKEN|KEY|SECRET|PASS|CREDENTIAL|AUTH|COOKIE|SESSION|PRIVATE/i;

export function analyze(command, { cwd, root, ticket, profile = 'qa', ignoreCase = process.platform === 'win32' || process.platform === 'darwin', roleVars = [], roRole = 'qa_agent_ro', flags = null }) {
  const autopilot = profile === 'autopilot';
  // flags.psql counts the psql invocations this walk inspected. The hook compares it with the
  // number of psql words in the command and refuses one it did not see (xargs, find -exec, eval,
  // a brace group, sudo -u, su -c, kubectl exec): fail closed, not a second SQL parser in bash.
  // words: bare psql words seen anywhere; inspected: psql invocations judged. More words than
  // inspections means a psql the walk did not reach, which is refused at the end.
  const psqlCount = { words: 0, inspected: 0 };
  // Every compare below is between real canonical paths (8.3 short names, Git Bash forms and
  // symlinks resolved), exact unless the project's folder ignores case.
  const rootC = realCanonical(root, root);
  const areas = autopilot
    ? [rootC]
    : [realCanonical(ticket ? `${rootC}/reviews/${ticket}` : `${rootC}/reviews`, rootC), realCanonical(`${rootC}/.ultrapowers`, rootC)];
  const areaText = autopilot ? 'the workspace' : `reviews/${ticket || '<id>'}/ and .ultrapowers/`;
  const runKind = autopilot ? 'an autopilot stage' : 'a QA run';
  const vars = new Map();
  // PGUSER handed down to a nested shell (`PGUSER=x sh -c '...'`, `docker exec -e PGUSER=x ... sh -c`),
  // or exported by an earlier command; psqlEnv: one of PSQL_ENV was set the same ways.
  const walkEnv = { pgUser: undefined, psqlEnv: false };
  const walkNested = (src, startDir, container, depth, pgUser, psqlEnv = walkEnv.psqlEnv) => {
    // The string was counted as text by the command that holds it; its own walk counts its words.
    psqlCount.words -= psqlTokens(src);
    const saved = { ...walkEnv };
    walkEnv.pgUser = pgUser;
    walkEnv.psqlEnv = psqlEnv;
    try { walk(src, startDir, container, depth); } finally { Object.assign(walkEnv, saved); }
  };
  let reason = '';
  const deny = (r) => { if (!reason) reason = r; };
  // The path inside the project is what the protected-name patterns judge, so a project that
  // sits under a folder like .claude/worktrees is not protected as a whole; a path outside the
  // project is judged by its full canonical spelling.
  const protectedPath = (real) => {
    const inner = rel(real, rootC, ignoreCase);
    const l = (inner === null ? real : inner).toLowerCase().replace(/\.env\.example/g, '');
    return PROTECTED_RE.test(l) || (autopilot && AUTOPILOT_PROTECTED_RE.test(l));
  };

  const resolveWord = (w) => {
    let s = '';
    for (const p of w.parts) {
      if (p.t === 'lit') s += p.v;
      else if (p.t === 'var' && vars.has(p.v)) s += vars.get(p.v);
      else return null;
    }
    return s;
  };
  const inArea = (real) => areas.some((a) => inside(real, a, ignoreCase));
  const checkTarget = (w, dir, what, container) => {
    const raw = resolveWord(w);
    if (raw === null) return deny(`${what} is built from a variable or command substitution and cannot be verified; write to a literal path under ${areaText}`);
    if (DEVICES.has(raw) || DEVICES.has(raw.toLowerCase()) || /^&?[0-9-]$/.test(raw)) return;
    if (container) return deny(`a write inside a container (${raw}) changes the stack; the stack stays as found`);
    let p = normPath(raw);
    if (p.startsWith('~')) return deny(`${what} (${raw}) is outside the project; writes are limited to ${areaText}`);
    if (!p.startsWith('/')) {
      if (dir === null) return deny(`${what} (${raw}) is relative to a directory the command changed to through a variable; use a literal path`);
      p = `${dir}/${p.replace(/^\.\//, '')}`;
    }
    if (p.split('/').includes('..')) return deny(`${what} (${raw}) has a parent-directory segment and cannot be verified`);
    const real = realCanonical(p, rootC);
    if (protectedPath(real)) return deny(`${what} (${raw}) is a protected path; the config, hooks, CI, settings and key material are never written during ${runKind}`);
    if (!inArea(real)) deny(`${what} (${raw}) is outside ${areaText}; shell writes during ${runKind} are limited to ${autopilot ? 'the workspace' : 'those folders'}`);
  };

  // A word spelled with an 8.3 alias that resolves to key material, whatever reads it (issue #31).
  const checkAlias = (w, dir) => {
    const raw = resolveWord(w);
    if (raw === null || !SHORT_SEG.test(raw)) return;
    let p = normPath(raw);
    if (!p.startsWith('/')) p = `${dir === null ? rootC : dir}/${p.replace(/^\.\//, '')}`;
    const real = realCanonical(p, rootC);
    const inner = rel(real, rootC, ignoreCase);
    const l = (inner === null ? real : inner).toLowerCase().replace(/\.env\.example/g, '');
    if (KEY_RE.test(l)) deny(`key material (${raw}) is never read, searched, uploaded or written during ${runKind}`);
  };

  const walk = (src, startDir, container, depth) => {
    if (depth > 4) return deny('the command nests shells too deeply to be verified');
    let dir = startDir;
    const toks = tokenize(src);
    let cmd = [];
    const flush = () => { if (cmd.length) simple(cmd); cmd = []; };
    // countWords is false when a wrapper's tail is re-run and the outer command counted it already.
    const simple = (items, countWords = true) => {
      for (const t of items) if (t.k === 'w') checkAlias(t, dir);
      // An autopilot stage never reads a credential out, whatever prints it: `echo $GH_TOKEN`,
      // `printf '%s' "$ODOO_API_KEY"`. A presence check stays: `${NAME:+set}`, `[ -n "$NAME" ]`.
      if (autopilot) {
        const first = items.find((t) => t.k === 'w');
        const firstWord = first ? (resolveWord(first) ?? '') : '';
        const isTest = ['[', '[[', 'test'].includes(firstWord);
        if (!isTest) {
          for (const t of items) {
            if (t.k !== 'w') continue;
            const hit = t.parts.find((p) => p.t === 'var' && (TRACKER_VARS.test(p.v) || SECRET_VARS.test(p.v)));
            if (hit) return deny(`$${hit.v} would print or pass on a credential or secret; an autopilot stage never reads one out, check it with \${NAME:+set}`);
          }
        }
      }
      // redirections first; they apply whatever the program is
      const words = [];
      // True when standard output of this command goes to the null device: only then is a
      // variable check (`printenv NAME >/dev/null`) free of its value. A stderr-only redirect
      // (`2>/dev/null`) leaves the value on the terminal.
      let nullOut = false;
      for (let k = 0; k < items.length; k++) {
        const t = items[k];
        if (t.k === 'op') {
          const next = items[k + 1];
          if (['>', '>>', '>|', '&>', '&>>', '<>'].includes(t.v)) {
            if (next && next.k === 'w') {
              const target = resolveWord(next);
              if (target !== null && ['/dev/null', 'nul'].includes(target.toLowerCase()) && (t.v.startsWith('&') || t.fd === null || t.fd === '1')) nullOut = true;
              checkTarget(next, dir, 'redirect target', container);
              k++;
            }
          }
          else if (t.v === '>&') { if (next && next.k === 'w') { const v = resolveWord(next); if (v === null || !/^[0-9-]+$/.test(v)) checkTarget(next, dir, 'redirect target', container); k++; } }
          else if (['<', '<<', '<<<', '<&'].includes(t.v)) { if (next && next.k === 'w') k++; }
          continue;
        }
        words.push(t);
      }
      // leading assignments
      let a = 0;
      const assigns = [];
      while (a < words.length) {
        const first = words[a].parts[0];
        const m = first && first.t === 'lit' ? /^([A-Za-z_][A-Za-z0-9_]*)=/.exec(first.v) : null;
        if (!m) break;
        const rest = { k: 'w', parts: [{ t: 'lit', v: first.v.slice(m[0].length) }, ...words[a].parts.slice(1)] };
        assigns.push([m[1], resolveWord(rest)]);
        a++;
      }
      // The PGUSER given to this command (a leading assignment, an env wrapper or a docker -e):
      // undefined when none, null when built from a variable.
      let pgUser = walkEnv.pgUser;
      let psqlEnv = walkEnv.psqlEnv;
      for (const [n, v] of assigns) { if (n === 'PGUSER') pgUser = v; if (PSQL_ENV.has(n)) psqlEnv = true; }
      // A word for analyzePsql: its value, PSQL_VAR + NAME for a pure $NAME, else PSQL_DYN.
      const psqlWord = (x) => {
        if (x.v !== null) return x.v;
        const only = x.w.parts.length === 1 && x.w.parts[0].t === 'var' ? x.w.parts[0].v : null;
        return only ? `${PSQL_VAR}${only}` : PSQL_DYN;
      };
      const psqlCheck = (words) => {
        psqlCount.inspected += 1;
        // The SQL and connection strings of this psql were counted as text; they are its own.
        for (const x of words) if (x.v !== null && /\s/.test(x.v)) psqlCount.words -= psqlTokens(x.v);
        const reason = analyzePsql(words.map(psqlWord), { roRole, pgUser, psqlEnv });
        if (reason) deny(reason);
      };
      let args = words.slice(a).map((w) => ({ w, v: resolveWord(w) }));
      if (args.length === 0) { for (const [n, v] of assigns) { if (v === null) vars.delete(n); else vars.set(n, v); } return; }
      // A brace group's braces are not a program.
      if (args[0].v === '{') args = args.slice(1);
      if (args.length && args[args.length - 1].v === '}') args = args.slice(0, -1);
      if (args.length === 0 || args[0].v === '}') return;
      const PROGRAM_FROM_VAR = 'the program of a command is built from a variable or substitution and cannot be verified; spell it out';
      if (args[0].v === null) return deny(PROGRAM_FROM_VAR);
      let prog = progName(args[0].v);
      // The tail of a wrapper runs as a command of its own (count: whether its psql words are
      // still to be counted, false when this command counted them already).
      const redispatch = (tail, count) => {
        if (tail.length && tail[0].v !== null && /\{\}|%/.test(tail[0].v)) return deny(`the program (${tail[0].v}) is a placeholder for a found or piped name and cannot be inspected`);
        if (tail.length) simple(tail.map((x) => x.w), count);
      };
      // export NAME=value, declare -x, typeset -x: the variable reaches every later command.
      // (Without a name the same words dump the environment; that rule is further down.)
      if (['export', 'declare', 'typeset'].includes(progName(args[0].v)) && args.slice(1).some((x) => x.v === null || !x.v.startsWith('-'))) {
        for (const x of args.slice(1)) {
          if (x.v === null) { if (x.w.parts.some((p) => p.t === 'lit' && /PGUSER|PSQLRC|PGSERVICE|PGOPTIONS|PGPASSFILE/.test(p.v))) walkEnv.pgUser = null; continue; }
          if (x.v.startsWith('-')) continue;
          const eq = x.v.indexOf('=');
          const name = eq === -1 ? x.v : x.v.slice(0, eq);
          const value = eq === -1 ? (vars.has(name) ? vars.get(name) : undefined) : x.v.slice(eq + 1);
          if (eq !== -1) vars.set(name, value);
          if (name === 'PGUSER') walkEnv.pgUser = value === undefined ? null : value;
          if (PSQL_ENV.has(name)) walkEnv.psqlEnv = true;
        }
        return;
      }
      const skipOptions = (list, withValue) => {
        let k = 0;
        while (k < list.length && list[k].v !== null && list[k].v.startsWith('-')) k += withValue.has(list[k].v) ? 2 : 1;
        return list.slice(k);
      };
      while (WRAPPERS.has(prog) || prog === 'env' || prog === 'timeout' || prog === 'xargs') {
        if (prog === 'xargs') {
          const tail = skipOptions(args.slice(1), XARGS_VALUE_OPTS);
          const ip = tail.length ? progName(tail[0].v) : '';
          if (WRITE_PROGRAMS.has(ip)) deny(`xargs ${ip} writes to paths that cannot be seen before it runs`);
          return redispatch(tail, true);
        }
        if (prog === 'command' && args[1] && ['-v', '-V'].includes(args[1].v)) return;
        args = args.slice(1);
        if (prog === 'env') {
          while (args.length && args[0].v && (/^[A-Za-z_][A-Za-z0-9_]*=/.test(args[0].v) || args[0].v.startsWith('-'))) {
            if (args[0].v.startsWith('PGUSER=')) pgUser = args[0].v.slice('PGUSER='.length);
            if (PSQL_ENV.has(args[0].v.split('=')[0])) psqlEnv = true;
            args = args.slice(1);
          }
        } else if (prog === 'timeout') {
          while (args.length && args[0].v && args[0].v.startsWith('-')) args = args.slice(1);
          args = args.slice(1);
        } else if (prog === 'sudo') {
          // sudo -u <user>: with peer authentication the OS user is the database role.
          let k = 0;
          while (k < args.length && args[k].v !== null && args[k].v.startsWith('-')) {
            const v = args[k].v;
            let who;
            if (v === '-u' || v === '--user') {
              if (!args[k + 1] || args[k + 1].v === null) return deny('sudo -u with a user built from a variable cannot be verified');
              who = args[k + 1].v;
              k += 2;
            } else if (v.startsWith('--user=')) { who = v.slice('--user='.length); k += 1; }
            else if (/^-[a-zA-Z]*u.+$/.test(v) && !v.startsWith('--')) { who = v.slice(v.indexOf('u') + 1); k += 1; }
            else { k += SUDO_VALUE_OPTS.has(v) ? 2 : 1; }
            if (who !== undefined) {
              if (who.startsWith('#')) return deny('sudo -u with a numeric id cannot be verified; name the user');
              if (who === 'postgres') pgUser = 'postgres';
            }
          }
          args = args.slice(k);
        } else {
          args = skipOptions(args, WRAPPER_VALUE_OPTS);
        }
        if (!args.length) { if (prog === 'env' && !nullOut) deny(ENV_DUMP); return; }
        if (args[0].v === null) return deny(PROGRAM_FROM_VAR);
        prog = progName(args[0].v);
      }
      // Every psql word of this command, bare or inside a command string; the end of the walk
      // compares the count with the number inspected.
      if (countWords) {
        for (const t of items) {
          const v = t.k === 'w' ? resolveWord(t) : null;
          if (v === null) continue;
          if (/\s/.test(v)) psqlCount.words += psqlTokens(v);
          else if (PSQL_PROGRAMS.has(progName(v))) psqlCount.words += 1;
        }
      }
      if (PG_TOOLS.has(prog)) return deny(`${prog} is not run during ${runKind}; lane 4 reaches the database through psql -c as the read-only role only`);
      const rest = args.slice(1);
      const plain = rest.filter((x) => !(x.v || '').startsWith('-'));
      if (prog === 'psql') {
        psqlCheck(rest);
        // -o and -L write a file: the same area rule as a redirect.
        for (const target of psqlOutputs(rest.map(psqlWord))) {
          const part = target === PSQL_DYN || target.startsWith(PSQL_VAR) ? { t: 'dyn' } : { t: 'lit', v: target };
          checkTarget({ k: 'w', parts: [part] }, dir, 'psql output file', container);
        }
        return;
      }
      if (prog === 'printenv') {
        const names = rest.filter((x) => x.v === null || !x.v.startsWith('-'));
        if (nullOut) return;
        if (names.length === 0) return deny(ENV_DUMP);
        for (const x of names) {
          if (x.v === null) return deny('printenv names a variable built from a substitution; it cannot be verified');
          if (!autopilot && !roleVars.includes(x.v)) return deny(`printenv ${x.v} reads a variable that is not a configured role variable; during a QA run only the role variables (qa.roles[].userEnv and passwordEnv) are read, and any other is checked with \${NAME:+set}`);
          if (autopilot && (TRACKER_VARS.test(x.v) || SECRET_VARS.test(x.v))) return deny(`printenv ${x.v} would print a credential or secret; an autopilot stage never reads one out, check it with \${NAME:+set}`);
        }
        return;
      }
      // Commands that print the whole environment: set and compgen -e, and export, declare,
      // typeset and readonly when they name nothing to set.
      if (prog === 'set') { if (rest.length === 0 && !nullOut) deny(ENV_DUMP); return; }
      if (prog === 'compgen') { if (rest.some((x) => /^-[a-z]*e/.test(x.v || '')) && !nullOut) deny(ENV_DUMP); return; }
      if (['export', 'declare', 'typeset', 'readonly'].includes(prog) && plain.length === 0 && !nullOut) deny(ENV_DUMP);
      if (prog === 'export' || prog === 'local' || prog === 'declare' || prog === 'typeset' || prog === 'readonly') {
        for (const x of rest) { const m = x.v ? /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/s.exec(x.v) : null; if (m) vars.set(m[1], m[2]); }
        return;
      }
      if (prog === 'cd' || prog === 'pushd') {
        const target = plain[0];
        if (!target) { dir = null; return; }
        if (target.v === null) { dir = null; return; }
        const p = normPath(target.v);
        dir = p.startsWith('/') ? p : (dir === null ? null : `${dir}/${p}`);
        return;
      }
      if (prog === 'popd') { dir = null; return; }
      if (prog === 'su') {
        // su [-] [-s shell] [user] -c cmd, or su user -c cmd, or su -c cmd user: the user is the
        // first word that is neither an option nor an option's value.
        let user;
        let cmdWord;
        for (let k = 0; k < rest.length; k++) {
          const v = rest[k].v;
          if (v === '-c' || v === '--command') { cmdWord = rest[k + 1]; k += 1; continue; }
          if (v === '-s' || v === '--shell' || v === '-g' || v === '-G') { k += 1; continue; }
          if (v === null) return deny('su with a word built from a variable cannot be verified');
          if (v.startsWith('--command=')) { cmdWord = { v: v.slice('--command='.length) }; continue; }
          if (v.startsWith('-')) continue;
          if (user === undefined) user = v;
        }
        if (!cmdWord) return deny('su without -c opens a shell that cannot be inspected');
        if (cmdWord.v === null || cmdWord.v === undefined) return deny('su -c runs a command built from a variable; it cannot be verified');
        walkNested(cmdWord.v, dir, container, depth + 1, (user ?? 'root') === 'postgres' ? 'postgres' : pgUser);
        return;
      }
      if (prog === 'eval') {
        if (rest.some((x) => x.v === null)) return deny('eval runs a command built from a variable; it cannot be verified');
        walkNested(rest.map((x) => x.v).join(' '), dir, container, depth + 1, pgUser);
        return;
      }
      if (prog === 'kubectl') {
        const sub = rest.find((x) => x.v && !x.v.startsWith('-'));
        if (sub && (sub.v === 'exec' || sub.v === 'run')) {
          const di = rest.findIndex((x) => x.v === '--');
          if (di === -1) return deny(`kubectl ${sub.v} without -- cannot be inspected; put -- before the command`);
          return redispatch(rest.slice(di + 1), false);
        }
        return;
      }
      if (SHELLS.has(prog)) {
        // -c may be bundled with other short flags (-lc, -ec, -xc); the next word is the command.
        const ci = rest.findIndex((x) => x.v !== null && /^-[a-zA-Z]*c[a-zA-Z]*$/.test(x.v));
        if (ci !== -1) {
          if (!rest[ci + 1] || rest[ci + 1].v === null) return deny(`${prog} -c runs a command built from a variable; it cannot be verified`);
          walkNested(rest[ci + 1].v, dir, container, depth + 1, pgUser);
          return;
        }
        if (rest.length && rest.every((x) => x.v !== null && ['--version', '--help', '-V', '-v'].includes(x.v))) return;
        // No -c and no script file: the shell reads its commands from stdin (a pipe, -s, or `-`).
        const script = rest.find((x) => x.v === null || !x.v.startsWith('-'));
        if (!script || rest.some((x) => x.v === '-s' || x.v === '-')) return deny(`${prog} reads its commands from stdin, which cannot be inspected; run the command directly or from a script file`);
        if (script.v === null) return deny(`${prog} runs a script named by a variable; it cannot be verified`);
        return;
      }
      if (prog === 'docker' || prog === 'docker-compose') {
        const ei = rest.findIndex((x) => x.v === 'exec' || x.v === 'run');
        if (ei === -1) return;
        const after = rest.slice(ei + 1);
        // -e PGUSER=... / --env PGUSER=... (also attached, -ePGUSER=...) name the database user of
        // what runs in the container; -u/--user postgres runs it as the superuser's OS account;
        // --env-file brings variables the analyzer cannot see; gosu/runuser/su-exec switch users.
        for (let k = 0; k < after.length; k++) {
          const v = after[k].v || '';
          const nv = (v === '-e' || v === '--env') && after[k + 1] ? after[k + 1].v : v.startsWith('--env=') ? v.slice('--env='.length) : /^-e.+/.test(v) ? v.slice(2) : null;
          if (nv !== null && nv !== undefined) {
            if (nv.startsWith('PGUSER=')) pgUser = nv.slice('PGUSER='.length);
            if (PSQL_ENV.has(nv.split('=')[0])) psqlEnv = true;
          }
          const who = (v === '-u' || v === '--user') && after[k + 1] ? after[k + 1].v : v.startsWith('--user=') ? v.slice('--user='.length) : /^-u.+/.test(v) ? v.slice(2) : ['gosu', 'runuser', 'su-exec'].includes(progName(v)) && after[k + 1] ? (after[k + 1].v === '-u' && after[k + 2] ? after[k + 2].v : after[k + 1].v) : null;
          if (who === null && (v === '--env-file' || v.startsWith('--env-file='))) psqlEnv = true;
          if (who !== null && who !== undefined && /^postgres(:|$)/.test(who)) pgUser = 'postgres';
        }
        const ti = after.findIndex((x) => x.v && PG_TOOLS.has(progName(x.v)));
        if (ti !== -1) return deny(`${progName(after[ti].v)} is not run during ${runKind}; lane 4 reaches the database through psql -c as the read-only role only`);
        const pi = after.findIndex((x) => x.v && progName(x.v) === 'psql');
        if (pi !== -1) { psqlCheck(after.slice(pi + 1)); return; }
        // `docker exec|run ... sh -c "..."` (also -lc): the string runs inside the container.
        const si = after.findIndex((x) => x.v && SHELLS.has(progName(x.v)));
        if (si !== -1 && after[si + 1] && after[si + 1].v !== null && /^-[a-zA-Z]*c[a-zA-Z]*$/.test(after[si + 1].v)) {
          if (!after[si + 2] || after[si + 2].v === null) return deny(`docker ${rest[ei].v} runs a shell command built from a variable; it cannot be verified`);
          walkNested(after[si + 2].v, '/', true, depth + 1, pgUser);
        }
        return;
      }
      if (prog === 'git') {
        let k = 0;
        while (k < rest.length) {
          const v = rest[k].v || '';
          if (GIT_GLOBAL_WITH_ARG.has(v)) { k += 2; continue; }
          if (v.startsWith('-')) { k++; continue; }
          break;
        }
        const sub = rest[k] ? rest[k].v : '';
        const subArgs = rest.slice(k + 1).map((x) => x.v || '');
        if (!sub) return;
        if (autopilot) {
          // An allow-list: the stage commits, branches, stashes and fetches; it never pushes,
          // integrates, discards or reconfigures git.
          const globals = rest.slice(0, k).map((x) => x.v || '');
          if (globals.some((g) => g === '-c' || g.startsWith('--config-env') || g === '--exec-path' || g.startsWith('--exec-path='))) {
            return deny('git -c and --exec-path can turn any git command into another; an autopilot stage runs plain git');
          }
          if (GIT_READ_ONLY.has(sub) || GIT_AUTOPILOT_ALLOWED.has(sub)) return;
          if (sub === 'fetch') {
            // Positive form only: `git fetch origin [refspec...]` with a few plain options.
            const options = /^(--prune|-p|--tags|--no-tags|--quiet|-q|--depth=\d+|--all)$/;
            const refspec = /^[A-Za-z0-9][A-Za-z0-9._\/+-]*(:[A-Za-z0-9][A-Za-z0-9._\/+-]*)?$/;
            const positional = subArgs.filter((x) => !options.test(x));
            const ok = positional.length >= 1 && positional[0] === 'origin' && positional.slice(1).every((x) => refspec.test(x) && !x.startsWith('-'));
            if (!ok) return deny('an autopilot stage fetches only `git fetch origin [refspec]`; other remotes, --upload-pack and local paths run programs or read outside origin');
            return;
          }
          if (sub === 'branch') {
            if (subArgs.some((x) => ['-D', '-d', '--delete', '-M', '-m', '--move', '-f', '--force'].includes(x))) return deny('git branch -D, -m and -f change or delete branches; an autopilot stage only creates and lists them');
            return;
          }
          if (sub === 'checkout' || sub === 'switch') {
            if (subArgs.includes('--') || subArgs.some((x) => ['-f', '--force', '--discard-changes', '--detach', '--orphan'].includes(x))) return deny(`git ${sub} with --, -f or --orphan discards or detaches work; an autopilot stage never discards`);
            return;
          }
          if (sub === 'stash') {
            if (subArgs.length === 0 || ['push', 'save', 'list', 'show', 'pop', 'apply'].includes(subArgs[0])) return;
            return deny(`git stash ${subArgs[0]} discards or rewrites work; an autopilot stage never discards`);
          }
          if (sub === 'worktree') {
            if (['add', 'list', 'lock', 'unlock'].includes(subArgs[0])) return;
            return deny(`git worktree ${subArgs[0] || ''} removes or moves a worktree; the engine cleans up after the pull requests`);
          }
          if (sub === 'config') return deny('git config can define an alias or change the remote; the project config stays as it is during an autopilot stage');
          return deny(`git ${sub} is not on the autopilot allow-list; the engine pushes and integrates, nothing discards work, and an alias is not run`);
        }
        if (GIT_READ_ONLY.has(sub)) {
          if (subArgs.some((x) => x === '--output' || x.startsWith('--output='))) deny('git --output writes a file; redirect into reviews/<id>/artifacts/ instead');
          return;
        }
        if (sub === 'branch' && subArgs.every((x) => ['--show-current', '-a', '-r', '--list', '-v', '-vv', '--all', '--remotes'].includes(x))) return;
        if (sub === 'stash' && ['list', 'show'].includes(subArgs[0])) return;
        if (sub === 'remote' && (subArgs.length === 0 || ['-v', 'show', 'get-url'].includes(subArgs[0]))) return;
        if (sub === 'config' && subArgs.some((x) => ['--get', '--list', '-l', '--get-all', '--get-regexp'].includes(x))) return;
        if (sub === 'worktree' && subArgs[0] === 'list') return;
        return deny(`git ${sub} changes a repository; only read-only git commands run during a QA run`);
      }
      if (prog === 'sed' || prog === 'perl' || prog === 'ruby') {
        const inPlace = rest.some((x) => x.v && (x.v === '--in-place' || x.v.startsWith('--in-place=') || /^-[A-Za-z]*i/.test(x.v)));
        if (inPlace && !autopilot) deny(`${prog} -i edits files in place; the code under test is read-only during a QA run`);
        if (inPlace && autopilot) {
          // Every operand but the script is a file the edit writes. The script is the operand that
          // follows -e/--expression/-f/--file, or the first plain operand when none is given.
          const scripts = new Set();
          for (let k = 0; k < rest.length; k++) {
            const v = rest[k].v || '';
            if (['-e', '--expression', '-f', '--file'].includes(v) && rest[k + 1]) scripts.add(rest[k + 1]);
            else if (/^-(e|f)./.test(v) || /^--(expression|file)=/.test(v)) scripts.add(rest[k]);
          }
          // With a script flag every plain operand is a file; without one, the first plain operand
          // is the script and the rest are files.
          const files = scripts.size ? plain.filter((x) => !scripts.has(x)) : plain.slice(1);
          for (const x of files) checkTarget(x.w, dir, `${prog} -i target`, container);
        }
        return;
      }
      if (prog === 'truncate') {
        if (!autopilot) return deny('truncate changes a file; the code under test is read-only during a QA run');
        for (const x of plain) if (x.v && !/^-/.test(x.v) && !/^[0-9]+[kmg]?$/i.test(x.v)) checkTarget(x.w, dir, 'truncate target', container);
        return;
      }
      if (prog === 'find') {
        const ei = rest.findIndex((x) => ['-exec', '-execdir', '-ok', '-okdir'].includes(x.v));
        if (ei !== -1) {
          let end = rest.findIndex((x, i) => i > ei && (x.v === ';' || x.v === '+'));
          if (end === -1) end = rest.length;
          const tail = rest.slice(ei + 1, end);
          const ip = tail.length ? progName(tail[0].v) : '';
          if (WRITE_PROGRAMS.has(ip)) deny(`find ${rest[ei].v} ${ip} writes to paths that cannot be seen before it runs`);
          redispatch(tail, false);
        }
        return;
      }
      if (prog === 'tee') { for (const x of plain) checkTarget(x.w, dir, 'tee target', container); return; }
      if (prog === 'rm' || prog === 'unlink') { for (const x of plain.filter((y) => y.v !== '--')) checkTarget(x.w, dir, `${prog} operand`, container); return; }
      if (prog === 'cp' || prog === 'mv' || prog === 'install' || prog === 'ln') {
        const ops = plain.filter((y) => y.v !== '--');
        const ti = rest.findIndex((x) => x.v === '-t' || x.v === '--target-directory');
        const tEq = rest.find((x) => x.v && x.v.startsWith('--target-directory='));
        let dest;
        if (tEq) dest = { k: 'w', parts: [{ t: 'lit', v: tEq.v.slice('--target-directory='.length) }] };
        else if (ti !== -1 && rest[ti + 1]) dest = rest[ti + 1].w;
        else if (ops.length >= 2) dest = ops[ops.length - 1].w;
        if (dest) checkTarget(dest, dir, `${prog} destination`, container);
        if (prog === 'mv') for (const x of (dest && !tEq && ti === -1 ? ops.slice(0, -1) : ops)) checkTarget(x.w, dir, 'mv source', container);
        return;
      }
      if (prog === 'curl') {
        for (let k = 0; k < rest.length; k++) {
          const v = rest[k].v || '';
          const long = /^--(output|dump-header|cookie-jar|trace|trace-ascii|stderr|libcurl)(=(.*))?$/.exec(v);
          if (long) {
            if (long[2] !== undefined) checkTarget({ k: 'w', parts: [{ t: 'lit', v: long[3] }] }, dir, `curl --${long[1]}`, container);
            else if (rest[k + 1]) { checkTarget(rest[k + 1].w, dir, `curl --${long[1]}`, container); k++; }
            continue;
          }
          if (v === '-O' || v === '--remote-name' || v === '--remote-name-all' || /^-[A-Za-z]*O$/.test(v)) { checkTarget({ k: 'w', parts: [{ t: 'lit', v: 'remote-name' }] }, dir, 'curl -O (writes into the working directory)', container); continue; }
          const short = /^-([A-Za-z]*?)([oDc])(.*)$/.exec(v);
          if (short && !v.startsWith('--')) {
            if (short[3]) checkTarget({ k: 'w', parts: [{ t: 'lit', v: short[3] }] }, dir, `curl -${short[2]}`, container);
            else if (rest[k + 1]) { checkTarget(rest[k + 1].w, dir, `curl -${short[2]}`, container); k++; }
          }
        }
        return;
      }
      if (prog === 'wget') {
        let explicit = false;
        for (let k = 0; k < rest.length; k++) {
          const v = rest[k].v || '';
          const eq = /^--(output-document|directory-prefix|output-file|append-output)=(.*)$/.exec(v);
          if (eq) { explicit = explicit || eq[1] !== 'output-file'; if (eq[2] !== '-') checkTarget({ k: 'w', parts: [{ t: 'lit', v: eq[2] }] }, dir, `wget --${eq[1]}`, container); continue; }
          if (['-O', '-P', '-o', '-a', '--output-document', '--directory-prefix', '--output-file', '--append-output'].includes(v) && rest[k + 1]) {
            if (v === '-O' || v === '-P' || v === '--output-document' || v === '--directory-prefix') explicit = true;
            if (rest[k + 1].v !== '-') checkTarget(rest[k + 1].w, dir, `wget ${v}`, container);
            k++;
          }
          if (v === '--spider') explicit = true;
        }
        if (!explicit) checkTarget({ k: 'w', parts: [{ t: 'lit', v: 'download' }] }, dir, 'wget (writes into the working directory)', container);
      }
    };
    for (const t of toks) {
      if (t.k === 'op' && [';', '&&', '||', '|', '&', '(', ')'].includes(t.v)) flush();
      else cmd.push(t);
    }
    flush();
  };

  try {
    walk(String(command), normPath(cwd), false, 0);
  } catch (error) {
    if (flags) { flags.psql = psqlCount.inspected; flags.psqlWords = psqlCount.words; }
    return `the command could not be analysed for writes (${error.message}); it is refused during ${runKind}`;
  }
  // Fail closed: a psql named in a construct the walk did not inspect is refused, whatever it holds.
  if (psqlCount.words > psqlCount.inspected) deny(`psql appears where the analyzer did not inspect it (${psqlCount.words} named, ${psqlCount.inspected} inspected); lane 4 runs psql directly, with -c`);
  if (flags) { flags.psql = psqlCount.inspected; flags.psqlWords = psqlCount.words; }
  return reason;
}

function main() {
  let input = '';
  try { input = readFileSync(0, 'utf8'); } catch { input = ''; }
  const [cwd = '', root = '', ticket = '', ignoreCaseFlag = '', roleVarsField = '', roRoleField = '', ...cmdParts] = input.split('\0');
  const profile = process.env.ULTRAPOWERS_GUARD_PROFILE === 'autopilot' ? 'autopilot' : 'qa';
  const out = analyze(cmdParts.join('\0'), { cwd, root, ticket, profile, ignoreCase: ignoreCaseFlag === '1', roleVars: roleVarsField.split(',').filter(Boolean), roRole: roRoleField || 'qa_agent_ro' });
  if (out) process.stdout.write(out);
}

if (process.argv[1] && /qa-shell-writes\.mjs$/.test(process.argv[1].replace(/\\/g, '/'))) main();
