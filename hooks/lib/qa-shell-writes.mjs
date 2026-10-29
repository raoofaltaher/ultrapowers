#!/usr/bin/env node
// qa-shell-writes.mjs: the write gate of hooks/qa-guardrail for shell commands (spec 3.5:
// "writes outside reviews/<id>/ and .ultrapowers/"). Reads NUL-separated fields on stdin,
// `<cwd>\0<root>\0<ticket>\0<command>`, and prints a deny reason, or nothing when the command
// writes only inside the report area. Paths arrive on stdin, never as arguments, so Git Bash's
// argument conversion cannot rewrite them. Node standard library only. The profile is read from
// ULTRAPOWERS_GUARD_PROFILE: `qa` (the default), `autopilot` or `hunt` (the QA rules with the audit
// id as the ticket, the audit tools of the vulnerability hunt allowed in their listed forms, and no
// test suite, worktree or tracker write; see huntCheck).
//
// The analysis is a quote-aware tokenizer, not a shell: it follows `cd` and simple literal
// assignments inside the command, looks inside `sh -c '...'` and `docker exec ... sh -c`, and
// fails closed on what it cannot resolve (a target built from an unknown variable or a
// command substitution). A regex hook cannot contain a determined adversary; this closes the
// ordinary spellings of a write.
import { readFileSync, statSync, lstatSync } from 'node:fs';
import { posix, resolve as resolvePath, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inside, realCanonical, rel, keyGlobReaches } from './guard-paths.mjs';

// The plugin this analyzer runs from (hooks/lib/ is two folders below its root): the only place the hunt
// trusts the plugin's own scripts from when the audited project holds a file of the same name.
const PLUGIN_ROOT = resolvePath(dirname(fileURLToPath(import.meta.url)), '..', '..');

const DEVICES = new Set(['/dev/null', '/dev/stdout', '/dev/stderr', '/dev/tty', 'nul', '/dev/fd/1', '/dev/fd/2']);
const SHELLS = new Set(['sh', 'bash', 'zsh', 'dash', 'ksh', 'ash', 'mksh', 'rbash', 'fish', 'csh', 'tcsh']);
// Launchers that run a command of their own, and are unwrapped like a wrapper (see the loop in simple()). unbuffer is a wrapper below.
const LAUNCHERS = new Set(['task-done', 'watch', 'parallel', 'strace', 'ltrace', 'script', 'chronic', 'faketime', 'proxychains', 'proxychains4', 'torsocks']);
// The options of the launchers that take a value, by program: the short letters, and the long names (given as --name=VALUE or --name VALUE).
const LAUNCHER_OPTS = {
  strace: { short: 'abeEIoOpPsSuUX', long: ['--attach', '--output', '--env', '--trace', '--signal', '--status', '--string-limit', '--summary-sort-by', '--trace-path', '--user', '--inject', '--fault', '--columns', '--syscall-limit', '--detach-on'] },
  ltrace: { short: 'aADeFlnoOpsuwx', long: ['--output', '--library', '--align', '--config'] },
  script: { short: 'cEBIOTmo', long: ['--command', '--echo', '--log-io', '--log-in', '--log-out', '--log-timing', '--logging-format', '--output-limit'] },
  proxychains: { short: 'f', long: [] },
  proxychains4: { short: 'f', long: [] },
  torsocks: { short: 'upaP', long: ['--user', '--pass', '--address', '--port'] },
};
const WRAPPERS = new Set(['nohup', 'command', 'exec', 'time', 'sudo', 'nice', 'stdbuf', 'setsid', 'busybox', 'builtin', 'unbuffer', 'ionice', 'doas', 'flock', 'taskset', 'chrt']);
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
// and the read-only database role's grants are the guarantee behind it. That is the QA and autopilot
// limit (they run the project's own suites and scripts); the hunt is a program allow-list instead
// (huntProgramWhy): a script of the project, a path-named program of the project and any program off the
// list are refused there.
const PSQL_PROGRAMS = new Set(['psql']);
// psql as a token inside a word that holds whitespace (a command string for another program).
const PSQL_TOKEN_RE = /(^|[\s;&|(`'"])(?:[^\s'"`;&|()]*[\\/])?psql(\.exe)?(?=[\s;&|)`'"]|$)/gi;
const psqlTokens = (text) => (String(text).match(PSQL_TOKEN_RE) || []).length;
// Programs that resolve a name or probe a host, refused in every profile (see simple()).
const HOST_PROBE_PROGRAMS = new Set(['nslookup', 'dig', 'host', 'ping', 'ping6', 'traceroute', 'tracert', 'arp']);
const HOST_DATABASES = new Set(['hosts', 'ahosts', 'ahostsv4', 'ahostsv6']);
// Other PostgreSQL client tools: never run during a run; lane 4 reaches the database through
// psql -c as the read-only role only.
const PG_TOOLS = new Set(['pgcli', 'usql', 'dropdb', 'createdb', 'createuser', 'dropuser', 'pg_restore', 'pg_dump', 'pg_dumpall', 'pgbench', 'vacuumdb', 'reindexdb', 'clusterdb', 'pg_ctl', 'pg_basebackup', 'pg_resetwal', 'pg_upgrade', 'pg_rewind']);
// Variables that make psql read a file or a service entry the analyzer cannot see.
const PSQL_ENV = new Set(['PSQLRC', 'PGSERVICE', 'PGSERVICEFILE', 'PGOPTIONS', 'PGPASSFILE', 'PGSYSCONFDIR']);
// Autopilot: programs that run code of their own, by name (python3.12, nodejs, pwsh.exe and /usr/bin/python all contain one).
const AUTOPILOT_ENV_PROGRAMS = /(sh|python|py|node|ruby|perl|php|lua|pwsh|powershell|cmd|irb|ipython|jshell|deno|bun)/;
// The only variables a prefix, an env wrapper or an export may set for a gated program.
const SAFE_ENV_RE = /^(CI|NODE_ENV|DEBUG|LANG|LC_[A-Z_]+|LANGUAGE|TZ|TERM|FORCE_COLOR|NO_COLOR|PAGER|GIT_PAGER|PYTHONDONTWRITEBYTECODE|PYTHONUNBUFFERED|PYTHONIOENCODING|NODE_NO_WARNINGS|npm_config_loglevel|ULTRAPOWERS_[A-Z_]+|QA_[A-Z_]+)$/;
// Names that move a shell's init files, its program lookup or its loaded code, or whose value is executed:
// judged when assigned or exported earlier in the command (a plain assignment of an inherited name still changes it).
const EARLIER_ENV_RE = /^(HOME|ENV|BASH_ENV|ZDOTDIR|XDG_[A-Z_]+|SHELL|PATH|LD_PRELOAD|LD_LIBRARY_PATH|LD_AUDIT|DYLD_[A-Z_]+|SHELLOPTS|PS4|PROMPT_COMMAND|BASH_FUNC_[A-Za-z_]+(%%)?|PERL5OPT|PYTHONSTARTUP|NODE_OPTIONS|RUBYOPT|PYTHONPATH|PYTHONHOME|NODE_PATH|RUBYLIB|PERL5LIB)$/;
const progName = (v) => String(v || '').replace(/\\/g, '/').split('/').pop().toLowerCase().replace(/\.exe$/, '');
const GIT_READ_ONLY = new Set(['status', 'diff', 'log', 'show', 'rev-parse', 'ls-files', 'ls-tree', 'rev-list', 'cat-file',
  'blame', 'describe', 'grep', 'shortlog', 'merge-base', 'for-each-ref', 'name-rev', 'show-ref', 'help', 'version', 'whatchanged']);
const GIT_GLOBAL_WITH_ARG = new Set(['-C', '-c', '--git-dir', '--work-tree', '--namespace', '--exec-path']);
const WRITE_PROGRAMS = new Set(['rm', 'unlink', 'mv', 'cp', 'tee', 'sed', 'perl', 'truncate', 'install', 'ln', 'link', 'dd', 'shred']);

// ---------- tokenizer ----------
// A word is a list of parts: { t: 'lit', v } | { t: 'var', v: NAME } | { t: 'dyn' }.
// toks.subs lists every command substitution, backtick and process substitution the text holds,
// wherever it sits (a word, a quoted string, an arithmetic or ${...} expansion, an unquoted
// here-document body): { kind: 'cmd', src } when its inner text was cut out, { kind: 'proc' } for
// <( ) and >( ), and { kind: 'opaque' } when the inner text cannot be cut out reliably.
const SUB_RE = /\$\(|`/;
// ${!NAME}, and ${!1}, ${!@}, ${!*}, ${!#}, ${!-}, ${!?}, ${!$}, ${!!} too: the value of the parameter is the name of the variable read
// (set -- GH_TOKEN; echo ${!1}).
const INDIRECT_RE = /^!(?:[A-Za-z_]|[0-9]|[@*#?$!-])/;
// The variables an unquoted here-document line reads, as the parts a word would carry (readVar's judgement):
// $NAME and ${NAME} are { t: 'var' }; ${NAME<op>WORD} reads NAME and the $X inside WORD (a :+ or + presence
// check and a #NAME length read none); ${!NAME} is an indirection. A backslash-escaped $ is text.
function heredocExpansions(line) {
  const parts = [];
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '\\') { i++; continue; }
    if (line[i] !== '$') continue;
    if (line[i + 1] === '{') {
      const j = line.indexOf('}', i + 2);
      const name = j === -1 ? line.slice(i + 2) : line.slice(i + 2, j);
      if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) parts.push({ t: 'var', v: name });
      else {
        const m = /^([!#]?)([A-Za-z_][A-Za-z0-9_]*)(.*)$/s.exec(name);
        if (INDIRECT_RE.test(name)) parts.push({ t: 'dyn', indirect: true });
        else {
          const reads = [...name.matchAll(/\$\{?([A-Za-z_][A-Za-z0-9_]*)/g)].map((x) => x[1]);
          if (m && !(m[1] === '#' && m[3] === '') && !/^:?\+/.test(m[3])) reads.unshift(m[2]);
          parts.push({ t: 'dyn', reads });
        }
      }
      continue;
    }
    const m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(line.slice(i + 1));
    if (m) { parts.push({ t: 'var', v: m[0] }); i += m[0].length; }
  }
  return parts;
}
function tokenize(src) {
  const toks = [];
  toks.subs = [];
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
      const inner = src.slice(i + 2, Math.min(j, src.length));
      // $(( ... )) is arithmetic, unless it holds a substitution of its own.
      if (src[i + 2] === '(') { if (SUB_RE.test(inner)) toks.subs.push({ kind: 'opaque' }); }
      else toks.subs.push(j >= src.length ? { kind: 'opaque' } : { kind: 'cmd', src: inner });
      i = j + 1; push({ t: 'dyn' }); return;
    }
    if (next === '{') {
      const j = src.indexOf('}', i + 2);
      const name = j === -1 ? '' : src.slice(i + 2, j);
      // ${X:-$(cmd)}: the `}` found may sit inside the substitution, so its text is not cut out.
      if (SUB_RE.test(j === -1 ? src.slice(i + 2) : name)) toks.subs.push({ kind: 'opaque' });
      i = j === -1 ? src.length : j + 1;
      if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) { push({ t: 'var', v: name }); return; }
      // ${NAME<op>WORD} is built at run time, but the variables it reads are known: NAME and every
      // $X inside WORD. ${NAME:+WORD} and ${NAME+WORD} print WORD, never NAME (the presence check), and
      // ${#NAME} prints a length; ${!NAME} reads a variable whose name is a value: an indirection.
      const reads = [...name.matchAll(/\$\{?([A-Za-z_][A-Za-z0-9_]*)/g)].map((m) => m[1]);
      const m = /^([!#]?)([A-Za-z_][A-Za-z0-9_]*)(.*)$/s.exec(name);
      if (INDIRECT_RE.test(name)) { push({ t: 'dyn', indirect: true }); return; }
      if (m && !(m[1] === '#' && m[3] === '') && !/^:?\+/.test(m[3])) reads.unshift(m[2]);
      // `text` is what stood between the braces: the default or alternate WORD of ${X:-WORD} is part of the value.
      push({ t: 'dyn', reads, text: name });
      return;
    }
    // $'...' (ANSI-C quoting: \x2e\x2e is `..`) and $"..." (a translated string) are expanded by the
    // shell, so their words are never literal text. $"..." is read as a double-quoted string after
    // the dynamic mark, so a substitution inside it is still seen.
    if (!inDouble && next === "'") {
      let j = i + 2;
      while (j < src.length && src[j] !== "'") j += src[j] === '\\' ? 2 : 1;
      i = j + 1; push({ t: 'dyn' }); return;
    }
    if (!inDouble && next === '"') { i += 1; push({ t: 'dyn' }); return; }
    const m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(src.slice(i + 1));
    if (m) { i += 1 + m[0].length; push({ t: 'var', v: m[0] }); return; }
    // $! is the pid of the last background command: a variable, not a substitution.
    if (next === '!') { i += 2; push({ t: 'var', v: '!' }); return; }
    if (next && /[0-9@*#?$!-]/.test(next)) { i += 2; push({ t: 'dyn' }); return; }
    i += 1; lit('$');
  };
  const backtick = () => { // at src[i] === '`'
    const j = src.indexOf('`', i + 1);
    toks.subs.push(j === -1 ? { kind: 'opaque' } : { kind: 'cmd', src: src.slice(i + 1, j) });
    i = j === -1 ? src.length : j + 1;
    push({ t: 'dyn' });
  };
  while (i < src.length) {
    const c = src[i];
    if (c === '\n') {
      op(';'); i++;
      while (heredocs.length) { // skip each pending here-document body
        const { delim, quoted, opTok } = heredocs.shift();
        for (;;) {
          const nl = src.indexOf('\n', i);
          const line = src.slice(i, nl === -1 ? src.length : nl);
          i = nl === -1 ? src.length : nl + 1;
          if (line.replace(/^\t+/, '') === delim || nl === -1) break;
          // An unquoted delimiter: the body is expanded, and a substitution in it runs. The variables it
          // reads are kept on the << token of its command, which judges them like the words of that command.
          if (!quoted) {
            if (SUB_RE.test(line)) toks.subs.push({ kind: 'opaque' });
            for (const part of heredocExpansions(line)) (opTok.parts ||= []).push(part);
          }
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
        if (src[i] === '`') { backtick(); continue; }
        lit(src[i]); i++;
      }
      i++; continue;
    }
    if (c === '$') { readVar(false); continue; }
    if (c === '`') { backtick(); continue; }
    // operators; a word made only of digits right before < or > is a file descriptor
    // <( ... ) and >( ... ) are process substitutions: the walk reads the parenthesis as a subshell.
    if ((c === '>' || c === '<') && src[i + 1] === '(') toks.subs.push({ kind: 'proc' });
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
        // The delimiter word with its quotes and backslashes removed (<<'EOF', <<"EOF", <<\EOF, <<E"O"F
        // all end at a line EOF); any quote or backslash in it leaves the body unexpanded.
        let j = i; while (src[j] === ' ' || src[j] === '\t') j++;
        const m = /^(?:'[^']*'|"[^"]*"|\\.|[^\s<>;&|()'"\\])+/.exec(src.slice(j));
        if (m) heredocs.push({ delim: m[0].replace(/\\(.)/g, '$1').replace(/['"]/g, ''), quoted: /['"\\]/.test(m[0]), opTok: toks[toks.length - 1] });
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
// switches, written by the engine outside the stage. The run records of a QA run or a hunt
// (.ultrapowers/runs/) are refused to every call of a run (MARKER_RE) and to an autopilot stage.
const PROTECTED_RE = /(^|\/)\.ssh(\/|$)|authorized_keys|id_rsa|id_ed25519|id_ecdsa|(^|\/)\.aws(\/|$)|mcp-secrets\.env|\.local\.(sh|env|json)$|hooks\/qa-guardrail|\.agents\/ultrapowers\.json|(^|\/)\.claude\/|(^|\/)\.git\/|(^|\/)\.git$|(^|\/)\.githooks\/|(^|\/)\.[a-z0-9_-]+\/settings(\.local)?\.json$|(^|\/)tasks\/[^/]+\/(autopilot\.json|stage-log\.jsonl|changes-comments\.md)$|(^|\/)\.ultrapowers\/(autopilot-active|autopilot-stop)$|(^|\/)\.ultrapowers\/autopilot(\/|$)|(^|\/)\.ultrapowers$/;
// Key material no stage may read through a shell (the same list as the hook's shell rule). The
// hook tests the typed command; an 8.3 short name (MCP-SE~1.ENV) hides the name from it, so any
// word with an alias-shaped segment is resolved here and its real name is tested.
const KEY_RE = /(^|\/)\.ssh(\/|$)|authorized_keys|id_rsa|id_ed25519|id_ecdsa|\.aws\/credentials|mcp-secrets\.env|secrets\.local|\.local\.sh|(^|\/)\.env($|\.)|\.git-credentials|(^|\/)\.netrc$|(^|\/)\.npmrc$|(^|\/)\.config\/(gh|glab-cli)(\/|$)|(^|\/)\.docker\/config\.json|(^|\/)\.kube(\/|$)|(^|\/)\.gnupg(\/|$)|(^|\/)\.pypirc$|(^|\/)\.cargo\/credentials(\.toml)?$|(^|\/)\.config\/gcloud(\/|$)|(^|\/)\.azure(\/|$)|(^|\/)\.pgpass$|(^|\/)\.vault-token$|(^|\/)\.gem\/credentials$|(^|\/)[A-Za-z0-9_][^/[\]|]*\.(pem|key|pfx|p12)(\.(bak|old|orig))?$/;
const SHORT_SEG = /[^\\/]~[0-9]/;
// A process environment as a file: /proc/<pid>/environ and /proc/<pid>/task/<tid>/environ.
const ENVIRON_RE = /^\/proc\/(.+\/)?environ$/;
// A process folder of /proc as a whole (/proc/self, /proc/thread-self, /proc/<pid>, their task folders): whatever reads
// the folder (grep -r, rg, find) reads the environ file of every process under it.
const PROC_DIR_RE = /^\/proc\/(self|thread-self|[0-9]+)(\/task(\/[0-9]+)?)?\/?$/;
const AUTOPILOT_PROTECTED_RE = /(^|\/)\.github\/|(^|\/)\.gitlab-ci\.yml$|(^|\/)hooks\/(qa-guardrail|session-start|team-memory-[a-z]+|lib\/|hooks(-cursor|-codex)?\.json|run-hook\.cmd)|(^|\/)\.gemini\/hooks\/|(^|\/)\.husky\/|(^|\/)\.pre-commit-config\.ya?ml$|(^|\/)lefthook\.ya?ml$|(^|\/)\.env($|\.)|(^|\/)qa\/known-issues\.md$|^(agents|claude|gemini)\.md$|(^|\/)\.ultrapowers\/(autopilot-active|autopilot-stop)$|(^|\/)\.ultrapowers\/runs(\/|$)|(^|\/)\.mcp\.json$|(^|\/)\.cursor\/(mcp\.json|cli\.json|environment\.json|worktrees\.json|rules\/|hooks\/)|(^|\/)\.devcontainer(\/|\.json$)|(^|\/)\.vscode\/|(^|\/)\.codex\/|(^|\/)\.kimi\/|(^|\/)\.factory\/|(^|\/)\.gemini\/|(^|\/)\.qwen\/|(^|\/)opencode\.jsonc?$|(^|\/)\.hermes\/|(^|\/)\.opencode\/|(^|\/)\.cursor\/hooks\.json$|(^|\/)\.pi\/|(^|\/)\.claude-plugin\/|(^|\/)hooks\.json$/;
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
  // An array slice with integer bounds ([1:3]) is a read: that colon is blanked before the
  // interpolation check. A bound that is a name ([1:n], [i:j]) stays refused: psql would substitute
  // a variable of that name, set through -v or a psqlrc, and the analyzer cannot see it. The check
  // covers psql's three spellings on the stripped text: :name, :'name' (left as :'' by the
  // stripper) and :"name".
  const sliced = text.replace(/\[[^\]]*\]/g, (m) => m.replace(/(\d)\s*:\s*(?=\d)/g, '$1 '));
  if (/(^|[^:]):(['"]|[A-Za-z_])/.test(sliced)) return 'psql variable interpolation (:name, :\'name\' or :"name") is blocked; the SQL must be literal and inspectable (an array slice needs integer bounds, [1:3])';
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
  // Any short-option cluster holding v (-v, -vn=3, -Atv), and the long forms; a digit-named variable
  // from a psqlrc is the one case a literal slice bound could meet, accepted as the residual risk.
  // psql takes any unambiguous prefix of a long option (--se, --var), so a long option that is a
  // prefix of set or variable counts too.
  const definesVariable = (a) => {
    if (a.startsWith('--')) { const name = a.slice(2).split('=')[0]; return name.length >= 2 && ('set'.startsWith(name) || 'variable'.startsWith(name)); }
    return /^-[A-Za-z]*v/.test(a);
  };
  if (args.some(definesVariable)) return 'psql -v, --set and --variable define variables that any :name in the SQL would substitute; lane 4 runs literal SQL only';
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

// The global options before a container CLI's subcommand, fail closed: an option on the flag-only or
// the valued list is skipped (with its argument); any other option could take an argument and shift
// the subcommand, so it is refused. Returns { idx } (the position of the first word) or { reason }.
function walkGlobalOptions(list, spec, who) {
  let g = 0;
  while (g < list.length) {
    const w = list[g].v;
    if (w === null) return { reason: `a ${who} argument built from a variable or substitution cannot be verified; spell it out` };
    if (!w.startsWith('-') || w === '-') break;
    const eq = w.indexOf('=');
    const name = w.startsWith('--') && eq !== -1 ? w.slice(0, eq) : w;
    if (spec.flags.has(name) && eq === -1) { g += 1; continue; }
    if (spec.valued.has(name)) { g += eq === -1 ? 2 : 1; continue; }
    if (!w.startsWith('--') && w.length > 2 && spec.valued.has(w.slice(0, 2))) { g += 1; continue; }
    return { reason: `unrecognised option ${w} before the ${who} subcommand; run the read command without it` };
  }
  return { idx: g };
}

// ---------- inline interpreters ----------
// An interpreter given code on its command line or on stdin is an unbounded execution and egress path
// (python -c, node -e, perl -ne, php -r, a heredoc into python3): the hook's text rule saw only the
// bare first-option spellings. This reads the interpreter's own options (python3.11, -Sc, -pe,
// -Mstrict -e, --eval=, a script on stdin) and returns the reason, or '' for a script file or a module.
const INLINE_WHY = 'inline interpreter code is blocked; it is an unbounded egress and execution bypass';
const STDIN_WHY = 'an interpreter reading its code from stdin (a pipe, a heredoc, -) cannot be inspected; run a script file';
// A script operand that is a device or a process file (/dev/stdin, /dev/fd/0, /proc/self/fd/0): the code is
// whatever the descriptor holds, a heredoc or a pipe, which no rule reads. Judged by spelling: the name says it.
const STDIN_FILE_WHY = 'an interpreter or shell given a device or process file as its script (/dev/stdin, /dev/fd/N, /proc/*/fd/N) reads its code from stdin, which cannot be inspected; run a script file';
function stdinScript(word) { return typeof word === 'string' && /^\/(dev|proc)(\/|$)/i.test(posix.normalize(normPath(word))); }
export function interpreterKind(p) {
  if (/^(python(\d+(\.\d+)*)?w?|py|pypy\d*(\.\d+)*)$/.test(p)) return 'python';
  if (/^(node|nodejs|bun|tsx|ts-node|ts-node-esm|ts-node-script|tsm)$/.test(p)) return 'js';
  if (p === 'deno') return 'deno';
  if (p === 'perl' || p === 'ruby') return 'perlish';
  if (['php', 'lua', 'luajit', 'rscript', 'julia', 'groovy', 'elixir', 'osascript'].includes(p)) return 'evalflag';
  return '';
}
function inlineInterpreterReason(kind, prog, rest, { inPlaceOk = false } = {}) {
  // A word built from a variable ("$SCRIPT") is taken for the script path: it does not start with a dash.
  const words = rest.map((x) => (x.v === null ? '\u0000var' : x.v));
  // Fail closed: a variable or substitution among the leading options, or as the first operand, may be
  // an eval flag or the code itself (python $FLAG x, node "$OPT" x).
  for (const v of words) {
    if (v === '\u0000var') return `${prog} with an option or script built from a variable or substitution cannot be verified; spell it out`;
    if (!v.startsWith('-')) break;
  }
  if (kind === 'python') {
    for (let k = 0; k < words.length; k++) {
      const v = words[k];
      if (!v.startsWith('-')) return stdinScript(v) ? STDIN_FILE_WHY : '';
      if (v === '-') return STDIN_WHY;
      if (v === '--') return stdinScript(words[k + 1]) ? STDIN_FILE_WHY : '';
      if (v.startsWith('--')) { if (v === '--version' || v === '--help') return ''; continue; }
      // Only a group that is exactly -V, -VV or -h asks for the version or the help and runs nothing. On the
      // Windows `py` launcher -V:<tag> selects a runtime and the real command line follows it, so that group
      // is skipped whole (its tag is no flag letters) and the scan goes on.
      if (/^-(V+|h)$/.test(v)) return '';
      if (/^-V:/.test(v)) continue;
      for (let c = 1; c < v.length; c++) {
        const ch = v[c];
        if (ch === 'c') return INLINE_WHY;
        if (ch === 'm') return '';
        if ('WXQ'.includes(ch)) { if (c === v.length - 1) k++; break; }
      }
    }
    return STDIN_WHY;
  }
  if (kind === 'js') {
    const VALUED = new Set(['-r', '--require', '--import', '--loader', '--experimental-loader', '--env-file', '-C', '--conditions', '--input-type', '--title']);
    for (let k = 0; k < words.length; k++) {
      const v = words[k];
      if (!v.startsWith('-')) return stdinScript(v) ? STDIN_FILE_WHY : '';
      if (v === '-') return STDIN_WHY;
      if (v === '--') return stdinScript(words[k + 1]) ? STDIN_FILE_WHY : '';
      if (/^--(eval|print)(=|$)/.test(v) || /^-(pe|ep|e|p)(?![A-Za-z-])/.test(v)) return INLINE_WHY;
      if (['--version', '-v', '--help', '-h', '--test', '--check', '-c', '--run'].includes(v) || v.startsWith('--test-') || v.startsWith('--run=')) return '';
      if (VALUED.has(v)) { k++; continue; }
      // A long option given its value as the next word (--max-old-space-size 4096): a word that is not
      // a path or a file name is that value, not the script, and must not end the option scan.
      if (v.startsWith('--') && !v.includes('=') && words[k + 1] !== undefined && !words[k + 1].startsWith('-') && !/[./\\\u0000]/.test(words[k + 1])) k++;
    }
    return prog === 'bun' ? '' : STDIN_WHY;
  }
  if (kind === 'deno') {
    const sub = words.find((v) => !v.startsWith('-'));
    const target = sub === undefined ? undefined : words.slice(words.indexOf(sub) + 1).find((v) => !v.startsWith('-'));
    if (stdinScript(sub) || stdinScript(target)) return STDIN_FILE_WHY;
    return sub === 'eval' ? INLINE_WHY : sub === 'repl' ? STDIN_WHY : '';
  }
  if (kind === 'perlish') {
    // Short options cluster; M, m, I, d, D, x, F, C, W, r, K, E(ruby) take the rest of the word, i is a suffix.
    const REST_OF_WORD = prog === 'perl' ? 'MmIdDxFCi' : 'rICKTFWxEi';
    const NEXT_WORD = prog === 'perl' ? 'I' : 'rIC';
    let hasScript = false;
    for (let k = 0; k < words.length; k++) {
      const v = words[k];
      if (!v.startsWith('-')) { if (stdinScript(v)) return STDIN_FILE_WHY; hasScript = true; break; }
      if (v === '-') return STDIN_WHY;
      if (v === '--') { if (stdinScript(words[k + 1])) return STDIN_FILE_WHY; hasScript = true; break; }
      if (v.startsWith('--')) { if (v === '--version' || v === '--help') return ''; continue; }
      for (let c = 1; c < v.length; c++) {
        const ch = v[c];
        if (ch === 'e' || (prog === 'perl' && ch === 'E')) return inPlaceOk && words.some((w) => /^-[A-Za-z]*i/.test(w) || w.startsWith('--in-place')) ? '' : INLINE_WHY;
        if (ch === 'v' || ch === 'h' || ch === 'c') return '';
        if (REST_OF_WORD.includes(ch)) { if (c === v.length - 1 && NEXT_WORD.includes(ch)) k++; break; }
      }
    }
    return hasScript ? '' : STDIN_WHY;
  }
  if (kind === 'evalflag') {
    const flags = { php: /^-[a-zA-Z]*[rRBE]$/, lua: /^-[a-zA-Z]*e$/, luajit: /^-[a-zA-Z]*e$/, rscript: /^-e$/, julia: /^-[a-zA-Z]*[eE]$|^--(eval|print)$/, groovy: /^-[a-zA-Z]*e$/, elixir: /^(-e|--eval)$/, osascript: /^-[a-zA-Z]*e$/ }[prog];
    if (words.some((v) => v === '-')) return STDIN_WHY;
    if (stdinScript(words.find((v) => !v.startsWith('-')))) return STDIN_FILE_WHY;
    if (flags && words.some((v) => flags.test(v))) return INLINE_WHY;
    // No script and no informational flag: the program is read from stdin (php < x, lua <<EOF).
    if (words.some((v) => ['-v', '-V', '--version', '-h', '--help', '-?', '-i', '-m', '--info'].includes(v))) return '';
    return words.some((v) => !v.startsWith('-')) ? '' : STDIN_WHY;
  }
  return '';
}

// ---------- the vulnerability hunt ----------
// The hunt profile applies every QA rule and then this list. The hunt reads: it runs the audit tools of
// the project, in the forms below, and nothing else of a package manager. Each package manager is
// allowed ONLY in its audit form plus a read-only listing form, and only where that form is a real
// built-in that no script of the project can shadow: npm and pnpm audit (npm only, with
// --package-lock-only) and ls/list; pip and pip3 list and freeze; cargo audit and tree --locked;
// dotnet list package --vulnerable --no-restore; go nothing; yarn, bun, uv, poetry, pipenv and pdm
// nothing (they run a script of the project for a word they do not know). The other installers
// (HUNT_INSTALLERS: composer, bundle, gem, pipx, corepack, brew, apt, dnf, apk, conda, nuget ...) are
// refused for every subcommand. The listing forms take a fixed option set (nothing that names an
// index, a registry or a file). Every other subcommand, and any program started through a package
// runner (npx, npm exec, uvx, pipx run ...), is refused with HUNT_NO_INSTALL. The installers and
// environments that python can start as a module (HUNT_PY_MODULES) are refused too, and the -m module
// is found the way the interpreter rule walks the options (pyModule). Test commands (and
// `git worktree add`, in the git branch of simple()) are refused with HUNT_NO_SUITE. pip-audit,
// osv-scanner, gh and glab are allowed only in the forms below. A program outside these families is
// left to the QA rules. The hunters run the tools with no variable prefix, so SAFE_ENV_RE (the QA
// variable gate) gets no addition: NPM_CONFIG_AUDIT_LEVEL=high npm audit is refused,
// --audit-level=high is the spelling.
const HUNT_NO_SUITE = 'the hunt reads; it runs no suite and makes no worktree';
const HUNT_NO_INSTALL = 'the hunt installs nothing and runs nothing';
// gh and glab: the groups the hunt may run, by program (a verb list, or '*' for every verb).
const HUNT_TRACKER_READ = {
  gh: { api: '*', search: ['code'], auth: ['status'], help: '*', version: '*' },
  glab: { api: '*', auth: ['status'], help: '*', version: '*' },
};
const HUNT_AUDIT_TOOLS = new Set(['osv-scanner', 'pip-audit', 'cargo-audit']);
// Programs that are a test run whatever their arguments.
const HUNT_TEST_RUNNERS = new Set(['pytest', 'py.test', 'vitest', 'jest', 'mvn', 'gradle', 'gradlew', 'phpunit']);
const HUNT_TEST_MODULES = new Set(['pytest', 'unittest', 'nose', 'nose2', 'tox']);
const NPM_AUDIT_LEVELS = /^(info|low|moderate|high|critical|none)$/;
// Installers outside the families below: refused for every subcommand (and a bare call), the way the package
// managers are. A read-only form for one of them (composer audit, bundler-audit) would be a later allow-form.
const HUNT_INSTALLERS = new Set([
  'composer', 'bundle', 'bundler', 'bundler-audit', 'bundle-audit', 'gem', 'pipx', 'corepack', 'brew', 'apt', 'apt-get', 'choco', 'winget',
  'dnf', 'yum', 'apk', 'pacman', 'zypper', 'snap', 'scoop', 'nix-env', 'conda', 'mamba', 'dpkg', 'rpm', 'nuget', 'pod',
]);
// What python can start as a module that installs software, makes an environment or serves files
// (the first dotted segment of the module name).
const HUNT_PY_MODULES = new Set([
  'pip', 'ensurepip', 'uv', 'pipx', 'pipenv', 'poetry', 'pdm', 'virtualenv', 'venv', 'conda', 'mamba', 'easy_install', 'setuptools', 'build', 'wheel', 'twine', 'http',
]);
const HUNT_PY_MANAGERS = /^(pip[0-9]*(\.[0-9]+)*|uv|poetry|pipenv|pdm)$/;
const INFO_FLAGS = ['--version', '-v', '-V', '--help', '-h'];

// The reason an audit input path (a manifest folder, a lockfile, a requirements file) is not a plain
// literal path, or '': no home, glob, expansion or parent-folder segment. The caller then holds the
// path inside the project (checkProjectDir).
function literalPathWhy(opt, word, what) {
  if (word === undefined || word === null || word === '' || word.startsWith('-')) return `${opt} without a literal ${what}`;
  if (/^~|[*?[\]{}$`]|(^|[\\/])\.\.([\\/]|$)/.test(word)) return `${opt} ${word} (a home, glob, expansion or parent-folder path)`;
  return '';
}
// The { path, form, opt } entries of the valued options in `names` that a huntOptions parse found,
// or { reason } for the first that is not a literal path.
function inputPaths(parsed, names, form, what, refuse) {
  const out = [];
  for (const [name, , v] of parsed.valued) {
    if (!names.includes(name)) continue;
    const why = literalPathWhy(name, v, what);
    if (why) return { reason: refuse(`${form} during the hunt; ${why}`) };
    out.push({ path: v, form, opt: name });
  }
  return { out };
}

// Splits `words` (values, null for one built from a variable) by a spec of the options a command may
// carry: { flags, valued, noPositional }. Returns { bad } (the first thing not on the spec) or
// { positionals (indexes), valued ([option, value index, value]), seen (the flags given) }.
function huntOptions(words, spec) {
  const positionals = [];
  const valued = [];
  const seen = new Set();
  for (let k = 0; k < words.length; k++) {
    const v = words[k];
    if (v === null) return { bad: 'an argument built from a variable or substitution' };
    if (v === '--') return { bad: '--' };
    if (!v.startsWith('-') || v === '-') {
      if (spec.noPositional) return { bad: v };
      positionals.push(k);
      continue;
    }
    const eq = v.startsWith('--') ? v.indexOf('=') : -1;
    const name = eq === -1 ? v : v.slice(0, eq);
    if (spec.flags.has(name) && eq === -1) { seen.add(name); continue; }
    if (spec.valued.has(name)) {
      if (eq !== -1) { valued.push([name, k, v.slice(eq + 1)]); continue; }
      if (words[k + 1] === undefined || words[k + 1] === null) return { bad: `${v} without a value` };
      valued.push([name, k + 1, words[k + 1]]);
      k += 1;
      continue;
    }
    return { bad: v };
  }
  return { positionals, valued, seen };
}

// The hunt's judgement of one simple command: null when the program is not for it to judge, { reason }
// to refuse, { allow: true, outputs, prefixes } to allow it (outputs: the paths, as written, of files it
// writes, which the caller holds to the report area; prefixes: the { path, form } of the project folders
// the command is pointed at, which the caller holds inside the project).
export function huntCheck(prog0, words, { viaRunner = false, interpreter = '' } = {}) {
  const prog = prog0.replace(/\.(cmd|bat|ps1|phar)$/, '');
  const refuse = (reason) => ({ reason });
  const allow = (outputs = [], prefixes = []) => ({ allow: true, outputs, prefixes });
  const before = words.indexOf('--') === -1 ? words : words.slice(0, words.indexOf('--'));
  const infoOnly = (list) => list.length > 0 && list.every((v) => INFO_FLAGS.includes(v));
  const notListed = (what, forms) => refuse(`${what} is not on the hunt's list; ${HUNT_NO_INSTALL} (the forms it runs: ${forms})`);
  if (HUNT_TEST_RUNNERS.has(prog)) return refuse(HUNT_NO_SUITE);
  if ((prog === 'make' || prog === 'gmake') && before.some((v) => v === 'test' || v === 'check')) return refuse(HUNT_NO_SUITE);
  if (HUNT_INSTALLERS.has(prog)) return refuse(`${prog} installs software or runs a script of the project; the hunt installs nothing (${prog} is refused for every subcommand)`);
  // composer is a phar that php runs: `php composer.phar install`.
  if (prog === 'php' && words.some((v) => v !== null && /(^|[\\/])composer(\.phar)?$/i.test(v))) return refuse('composer installs software or runs a script of the project; the hunt installs nothing (composer is refused for every subcommand)');
  if (viaRunner && HUNT_AUDIT_TOOLS.has(prog)) return refuse(`${prog} started through a package runner installs it first; the hunt runs the audit tools that are already installed (${prog} on PATH)`);
  if (viaRunner) return refuse(`${prog} started through a package runner (npx, npm exec, uvx, pipx run ...) is downloaded and run; ${HUNT_NO_INSTALL}`);

  if (interpreter === 'python') {
    const pm = pyModule(words);
    if (pm === null) return null;
    if (pm.unreadable) return refuse('the options of python before its script or module cannot be read during the hunt; write python -m <module> or python <script> with plain flags');
    const mod = pm.mod;
    if (HUNT_TEST_MODULES.has(mod)) return refuse(HUNT_NO_SUITE);
    if (HUNT_PY_MODULES.has(mod.split('.')[0])) return refuse(`python -m ${mod} is not on the hunt's list; ${HUNT_NO_INSTALL} (python -m pip_audit is the form it runs)`);
    if (mod === 'pip_audit') {
      // An interpreter option that takes a value (-W ignore, -X dev) before -m would shift the words after it.
      if (!pm.pure) return refuse('python options before -m pip_audit cannot be verified during the hunt; write python -m pip_audit first');
      return huntPipAudit(words.slice(pm.rest), refuse, allow);
    }
    if (mod.startsWith('pip_audit')) return refuse(`python -m ${mod} is not on the hunt's list; ${HUNT_NO_INSTALL}`);
    return null;
  }

  if (['npm', 'pnpm', 'yarn', 'bun'].includes(prog)) {
    const sub = words[0];
    // yarn and bun run a package.json script for a word they do not know, so a listing word could be
    // a script of the repository: they are refused for every subcommand (a bare `yarn` installs).
    const scriptRunner = prog === 'yarn' || prog === 'bun';
    if (sub === undefined) return scriptRunner ? notListed(prog, 'npm audit --package-lock-only --json, npm ls') : null;
    if (sub === null) return refuse(`the ${prog} subcommand is built from a variable or substitution and cannot be verified; spell it out`);
    const s = sub.toLowerCase();
    // npm takes any unambiguous prefix of a command name (npm aud, npm te) and a few aliases.
    const isNpm = prog === 'npm';
    const is = (name, alias = []) => s === name || alias.includes(s) || (isNpm && s.length >= 2 && name.startsWith(s));
    if (!sub.startsWith('-')) {
      if (is('test', ['tst', 't', 'it', 'cit', 'install-test', 'install-ci-test'])) return refuse(HUNT_NO_SUITE);
      if (is('run-script', ['run', 'rum', 'urn'])) {
        const script = words.slice(1).find((v) => v === null || !v.startsWith('-'));
        if (script === null) return refuse(`the ${prog} script is built from a variable or substitution and cannot be verified; spell it out`);
        if (script !== undefined && /^(pre|post)?tests?([:._-].*)?$/i.test(script)) return refuse(HUNT_NO_SUITE);
      }
    }
    if (scriptRunner) return notListed(`${prog} ${sub}`, 'npm audit --package-lock-only --json, npm ls');
    if (sub.startsWith('-')) {
      if (infoOnly(words)) return allow();
      return refuse(`${prog} options before the subcommand cannot be verified during the hunt; write ${prog} <command> first`);
    }
    if (is('audit')) {
      const name = isNpm ? 'npm audit' : 'pnpm audit';
      // The folder of the manifest: npm takes --prefix, pnpm --dir or -C (pnpm has no --prefix).
      const form = isNpm
        ? 'npm audit --package-lock-only [--json] [--audit-level=<level>] [--prefix <folder inside the project>]'
        : 'pnpm audit [--json] [--audit-level=<level>] [--dir <folder inside the project>]';
      const dirOpts = isNpm ? ['--prefix'] : ['--dir', '-C'];
      const bad = (what) => refuse(`${name} may run only as ${form} during the hunt; ${what} changes a file or reads more than the report (${name} fix is never run)`);
      const rest = words.slice(1);
      let lockOnly = false;
      const prefixes = [];
      for (let k = 0; k < rest.length; k++) {
        const v = rest[k];
        if (v === null) return bad('an argument built from a variable or substitution');
        if (v === '--package-lock-only') { lockOnly = true; continue; }
        if (v === '--json') continue;
        // --omit and --include pick the dependency types to report on (dev, optional, peer; prod for --include).
        if (/^--(omit|include)=(dev|optional|peer|prod)$/.test(v)) continue;
        if ((v === '--omit' || v === '--include') && rest[k + 1] !== undefined && rest[k + 1] !== null && /^(dev|optional|peer|prod)$/.test(rest[k + 1])) { k += 1; continue; }
        if (v === '--audit-level') { if (rest[k + 1] === undefined || rest[k + 1] === null || !NPM_AUDIT_LEVELS.test(rest[k + 1])) return bad('--audit-level without a level'); k += 1; continue; }
        const m = /^--audit-level=(.*)$/.exec(v);
        if (m && NPM_AUDIT_LEVELS.test(m[1])) continue;
        // --prefix (npm), --dir or -C (pnpm) names the folder of the manifest: a literal path, which the
        // caller then holds inside the project.
        const opt = dirOpts.find((o) => v === o || v.startsWith(`${o}=`));
        if (opt) {
          const dirWord = v === opt ? rest[k + 1] : v.slice(opt.length + 1);
          const why = literalPathWhy(opt, dirWord, 'folder');
          if (why) return bad(why);
          prefixes.push({ path: dirWord, form: `${name} may run only as ${form}`, opt });
          if (v === opt) k += 1;
          continue;
        }
        return bad(v === 'fix' ? 'fix' : `"${v}"`);
      }
      if (isNpm && !lockOnly) return refuse('npm audit must run with --package-lock-only during the hunt: without it npm reads the installed tree, which the hunt does not build (npm audit --package-lock-only --json)');
      return allow([], prefixes);
    }
    if (is('list', ['ls'])) return huntLsOptions(words.slice(1), prog, refuse, allow, isNpm);
    return notListed(`${prog} ${sub}`, `${prog} audit${isNpm ? ' --package-lock-only --json' : ''}, ${prog} ls`);
  }

  // pip and pip3 have list and freeze built in. uv, poetry, pipenv and pdm run a script of the project
  // for a word they do not know (pdm: a pyproject script), so they are refused for every subcommand.
  if (HUNT_PY_MANAGERS.test(prog)) {
    const sub = words[0];
    const forms = 'pip list, pip freeze, pip-audit';
    if (!/^pip/.test(prog)) return notListed(sub === undefined || sub === null ? prog : `${prog} ${sub}`, forms);
    if (sub === undefined) return null;
    if (sub === null) return refuse(`the ${prog} subcommand is built from a variable or substitution and cannot be verified; spell it out`);
    if (sub.startsWith('-')) {
      if (infoOnly(words)) return allow();
      return refuse(`${prog} options before the subcommand cannot be verified during the hunt; write ${prog} <command> first`);
    }
    if (sub === 'list' || sub === 'freeze') return huntPipListOptions(prog, sub, words.slice(1), refuse, allow);
    return notListed(`${prog} ${sub}`, forms);
  }

  // date prints the time: the report's own timestamp. Setting the clock (-s, --set, a bare MMDDhhmm operand) is refused.
  if (prog === 'date') {
    for (let k = 0; k < words.length; k++) {
      const v = words[k];
      if (v === null) return refuse('date with an argument built from a variable or substitution cannot be verified during the hunt');
      if (v.startsWith('+') || ['-u', '--utc', '--universal', '-R', '--rfc-email', '-I'].includes(v) || /^-I(date|hours|minutes|seconds|ns)$/.test(v) || /^--(iso-8601|rfc-3339)(=[a-z]+)?$/.test(v)) continue;
      if (['-d', '--date', '-r', '--reference'].includes(v) && words[k + 1] !== undefined && words[k + 1] !== null) { k += 1; continue; }
      if (/^--(date|reference)=/.test(v)) continue;
      return refuse(`date ${v} is not on the hunt's list; date prints the time (+FORMAT, -u, -I, --iso-8601, -d, -r) and never sets it`);
    }
    return allow();
  }

  if (prog === 'go') {
    if (before.includes('test')) return refuse(HUNT_NO_SUITE);
    return words.length ? notListed(`go ${words[0] === null ? '<built>' : words[0]}`, 'none: go can download modules and run code') : null;
  }

  if (prog === 'dotnet') {
    if (before.includes('test') || before.includes('vstest')) return refuse(HUNT_NO_SUITE);
    if (words.length === 0) return null;
    if (infoOnly(words) || words.every((v) => v === '--info' || v === '--list-sdks' || v === '--list-runtimes')) return allow();
    if (before[0] === 'list' && before.includes('package') && before.includes('--vulnerable')) {
      const spec = { flags: new Set(['--vulnerable', '--include-transitive', '--no-restore']), valued: new Set(['--framework', '--format', '--output-version', '--verbosity']) };
      // `list` and `package` are words of the command; the project (or solution) file, which may stand
      // between them, is the one positional.
      const pkg = before.indexOf('package');
      const parsed = huntOptions([...before.slice(1, pkg), ...before.slice(pkg + 1)], spec);
      if (parsed.bad !== undefined || parsed.positionals.length > 1) {
        return refuse(`dotnet list package --vulnerable may run only with --no-restore [--include-transitive] [--framework <x>] [--format <x>] [--output-version <x>] and one project file during the hunt; ${parsed.bad !== undefined ? `"${parsed.bad}"` : 'a second positional'} is not allowed`);
      }
      if (!parsed.seen.has('--no-restore')) return refuse('dotnet list package restores first; the hunt restores nothing (add --no-restore; a project with no obj/project.assets.json is reported as not audited)');
      return allow();
    }
    return notListed(`dotnet ${words[0] === null ? '<built>' : words[0]}`, 'dotnet list package --vulnerable --no-restore');
  }

  if (prog === 'cargo' || prog === 'cargo-audit') {
    // A +toolchain may come first; any other option before the subcommand could take an argument.
    let k = 0;
    while (k < words.length && words[k] !== null && words[k].startsWith('+')) k += 1;
    const sub = words[k];
    if (sub === undefined) return null;
    if (sub === null) return refuse('the cargo subcommand is built from a variable or substitution and cannot be verified; spell it out');
    if (prog === 'cargo' && ['test', 't', 'nextest'].includes(sub)) return refuse(HUNT_NO_SUITE);
    if (prog === 'cargo-audit' && sub !== 'audit') return notListed(`cargo-audit ${sub}`, 'cargo-audit audit --json');
    if (sub.startsWith('-')) {
      if (infoOnly(words.slice(k))) return allow();
      return refuse('cargo options before the subcommand cannot be verified during the hunt; write cargo <command> first');
    }
    const rest = words.slice(k + 1);
    if (sub === 'audit') {
      const spec = { flags: new Set(['--json', '-q', '--quiet', '--no-fetch']), valued: new Set(['--file', '-f']) };
      const parsed = huntOptions(rest, spec);
      if (parsed.bad !== undefined || parsed.positionals.length) {
        const what = parsed.bad !== undefined ? parsed.bad : rest[parsed.positionals[0]];
        return refuse(`cargo audit may run only as cargo audit [--json] [--quiet] [--no-fetch] [--file <Cargo.lock>] during the hunt; "${what}" is not allowed (cargo audit fix changes Cargo.toml)`);
      }
      const files = inputPaths(parsed, ['--file', '-f'], 'cargo audit may run only as cargo audit [--json] [--quiet] [--no-fetch] [--file <Cargo.lock inside the project>]', 'file', refuse);
      return files.reason || allow([], files.out);
    }
    if (sub === 'tree') {
      const spec = {
        flags: new Set(['--locked', '--offline', '-d', '--duplicates', '-q', '--quiet', '--workspace', '--all-features', '--no-default-features', '--no-dev-edges']),
        valued: new Set(['-p', '--package', '-e', '--edges', '-i', '--invert', '--depth', '--prefix', '-f', '--format', '--target', '--features', '-F']),
        noPositional: true,
      };
      const parsed = huntOptions(rest, spec);
      if (parsed.bad !== undefined) return refuse(`cargo tree may run only as cargo tree --locked with listing options during the hunt; "${parsed.bad}" is not allowed`);
      if (!parsed.seen.has('--locked')) return refuse('cargo tree must run with --locked during the hunt: without it cargo may rewrite Cargo.lock');
      return allow();
    }
    return notListed(`cargo ${sub}`, 'cargo audit, cargo tree --locked');
  }

  if (prog === 'pip-audit') return huntPipAudit(words, refuse, allow);

  if (prog === 'osv-scanner') {
    const spec = {
      flags: new Set(['--json', '-r', '--recursive', '--no-ignore']),
      valued: new Set(['-L', '--lockfile', '-f', '--format', '--verbosity', '--output', '--output-file']),
    };
    const parsed = huntOptions(words, spec);
    const denied = new Set(['fix', 'update', 'image', 'guided-remediation', 'help']);
    const bad = parsed.bad !== undefined ? parsed.bad : (parsed.positionals.map((k) => words[k]).find((v) => denied.has(v)));
    if (bad !== undefined) {
      return refuse(`osv-scanner may run only as osv-scanner [scan [source]] [--json] [--format <x>] [--lockfile <file>] [-r] during the hunt; "${bad}" is not allowed (osv-scanner fix rewrites the lockfile)`);
    }
    const files = inputPaths(parsed, ['-L', '--lockfile'], 'osv-scanner may run only as osv-scanner [--json] [--lockfile <file inside the project>]', 'file', refuse);
    return files.reason || allow(parsed.valued.filter(([name]) => name === '--output' || name === '--output-file').map(([, , v]) => v), files.out);
  }
  return null;
}

// Finds the `-m` module of a python command the way the interpreter rule (inlineInterpreterReason) walks
// the options: a short group that holds `m` ends them, and the module is the rest of that group or the
// next word. Returns null when the command runs a script, reads stdin or only asks for the version, and
// { unreadable } for what cannot be read (a long option may take a value as its next word, so one is not
// skipped blindly). `pure`: only value-less flags (-u, -I, -B ...) came before -m, so `rest` (the index of
// the first word after the module) is where the module's own arguments begin.
function pyModule(words) {
  let pure = true;
  for (let k = 0; k < words.length; k++) {
    const v = words[k];
    if (v === null) return { unreadable: true };
    if (!v.startsWith('-') || v === '-' || v === '--') return null;
    if (v.startsWith('--')) {
      if (v === '--version' || v === '--help') return null;
      return { unreadable: true };
    }
    // Exactly -V, -VV or -h: the version or the help, nothing runs. -V:<tag> on the Windows `py` launcher
    // selects a runtime and the command line goes on after it (the same walk as the interpreter rule).
    if (/^-(V+|h)$/.test(v)) return null;
    if (/^-V:/.test(v)) { pure = false; continue; }
    for (let c = 1; c < v.length; c++) {
      const ch = v[c];
      if (ch === 'm') {
        const attached = v.slice(c + 1);
        if (attached) return { mod: attached, rest: k + 1, pure };
        if (words[k + 1] === undefined || words[k + 1] === null) return { unreadable: true };
        return { mod: words[k + 1], rest: k + 2, pure };
      }
      if ('WXQ'.includes(ch)) { pure = false; if (c === v.length - 1) k += 1; break; }
      if (!'bBdEiIOqRsSuvx'.includes(ch)) pure = false;
    }
  }
  return null;
}

// The options a listing form takes, a fixed set: nothing that names an index, a registry or a file.
// npm also takes --package-lock-only (read the lockfile, not node_modules), --long and --parseable, the
// --omit/--include types, package names to look for, and --prefix <folder inside the project>.
const NPM_PACKAGE_NAME = /^(@[a-z0-9][a-z0-9._~-]*\/)?[a-z0-9][a-z0-9._~-]*(@[A-Za-z0-9.^~<>=*|+ -]+)?$/;
function huntLsOptions(args, prog, refuse, allow, isNpm = false) {
  const prefixes = [];
  const form = `${prog} ls may run only with listing options during the hunt`;
  for (let k = 0; k < args.length; k++) {
    const v = args[k];
    if (v === null) return refuse(`${prog} ls with an argument built from a variable or substitution cannot be verified; ${HUNT_NO_INSTALL}`);
    if (v === '--json' || v === '--all' || v === '--prod' || v === '--omit=dev' || /^--depth=[0-9]+$/.test(v)) continue;
    if (v === '--depth' && args[k + 1] !== undefined && args[k + 1] !== null && /^[0-9]+$/.test(args[k + 1])) { k += 1; continue; }
    if (isNpm) {
      if (['--package-lock-only', '--long', '-l', '--parseable', '-p', '-a'].includes(v) || /^--(omit|include)=(dev|optional|peer|prod)$/.test(v)) continue;
      if ((v === '--omit' || v === '--include') && args[k + 1] !== undefined && args[k + 1] !== null && /^(dev|optional|peer|prod)$/.test(args[k + 1])) { k += 1; continue; }
      if (v === '--prefix' || v.startsWith('--prefix=')) {
        const dirWord = v === '--prefix' ? args[k + 1] : v.slice('--prefix='.length);
        const why = literalPathWhy('--prefix', dirWord, 'folder');
        if (why) return refuse(`${form}; ${why}`);
        prefixes.push({ path: dirWord, form, opt: '--prefix' });
        if (v === '--prefix') k += 1;
        continue;
      }
      if (!v.startsWith('-') && NPM_PACKAGE_NAME.test(v) && !/[\\/]/.test(v.replace(/^@[^/]+\//, ''))) continue;
    }
    return refuse(`${prog} ls takes only --json, --depth <n>, --all, --prod and --omit=dev${isNpm ? ', --package-lock-only, --long, --parseable, --omit/--include <type>, --prefix <folder inside the project> and package names' : ''} during the hunt ("${v}" is not allowed); ${HUNT_NO_INSTALL}`);
  }
  return allow([], prefixes);
}

function huntPipListOptions(prog, sub, args, refuse, allow) {
  for (let k = 0; k < args.length; k++) {
    const v = args[k];
    if (v === null) return refuse(`${prog} ${sub} with an argument built from a variable or substitution cannot be verified; ${HUNT_NO_INSTALL}`);
    if (v === '--all') continue;
    if (/^--format=(columns|freeze|json)$/.test(v)) continue;
    if (v === '--format' && /^(columns|freeze|json)$/.test(args[k + 1] || '')) { k += 1; continue; }
    const shown = v === '--format' && args[k + 1] !== undefined ? `--format ${args[k + 1] === null ? '<built from a variable>' : args[k + 1]}` : v;
    return refuse(`${prog} ${sub} takes only --format (columns, freeze or json) and --all during the hunt ("${shown}" is not allowed: an index option or --outdated reaches a host, -r reads a file); ${HUNT_NO_INSTALL}`);
  }
  return allow();
}

function huntPipAudit(words, refuse, allow) {
  const spec = {
    flags: new Set(['--no-deps', '--strict', '--disable-pip', '--desc', '--aliases', '--skip-editable']),
    valued: new Set(['-f', '--format', '-r', '--requirement', '-s', '--vulnerability-service', '--progress-spinner', '--ignore-vuln', '--timeout', '-o', '--output']),
  };
  const parsed = huntOptions(words, spec);
  if (parsed.bad !== undefined || parsed.positionals.length) {
    const what = parsed.bad !== undefined ? parsed.bad : words[parsed.positionals[0]];
    return refuse(`pip-audit may run only as pip-audit [--no-deps] [--strict] [-f <format>] [-r <requirements file>] during the hunt; "${what}" is not allowed (pip-audit --fix changes the requirements)`);
  }
  // pip-audit resolves a requirements file through pip in a temporary environment: it downloads and
  // builds what the file names unless --no-deps makes it audit the pinned versions as written.
  if (parsed.valued.some(([name]) => name === '-r' || name === '--requirement') && !parsed.seen.has('--no-deps')) {
    return refuse('pip-audit resolves requirements by installing them; the hunt installs nothing (add --no-deps and pin the requirements)');
  }
  const files = inputPaths(parsed, ['-r', '--requirement'], 'pip-audit may run only as pip-audit --no-deps [-r <requirements file inside the project>]', 'file', refuse);
  return files.reason || allow(parsed.valued.filter(([name]) => name === '-o' || name === '--output').map(([, , v]) => v), files.out);
}

// ---------- curl and wget under an egress allow-list ----------
// With qa.hosts.allowed set, curl and wget reach only listed hosts. The hook's text check reads the literal
// http(s) URLs of the command; this reads the words the way the program does, so what that check cannot see
// is refused: an option that redirects a listed host (a proxy, a resolve or connect override, a Host header), a
// URL given as an option, and any operand that is not a literal http(s) URL on a listed host. A valued option
// is skipped only when it is known to take a value (the short ones by letter, the long ones by name, or attached
// with =); an option this list does not know stands for a flag, so its value is judged as an operand: refused.
const CURL_SHORT_VALUED = new Set(['A', 'b', 'c', 'C', 'd', 'D', 'e', 'E', 'F', 'H', 'K', 'm', 'o', 'P', 'Q', 'r', 't', 'T', 'u', 'U', 'w', 'X', 'y', 'Y', 'z']);
const CURL_LONG_VALUED = new Set(['--output', '--header', '--data', '--data-raw', '--data-binary', '--data-ascii', '--data-urlencode', '--request', '--user', '--user-agent',
  '--referer', '--cookie', '--cookie-jar', '--write-out', '--max-time', '--connect-timeout', '--retry', '--retry-delay', '--retry-max-time', '--upload-file', '--form', '--form-string',
  '--cacert', '--cert', '--key', '--capath', '--limit-rate', '--range', '--output-dir', '--dump-header', '--trace', '--trace-ascii', '--stderr', '--json', '--max-redirs',
  '--time-cond', '--continue-at', '--oauth2-bearer', '--aws-sigv4', '--proto', '--proto-redir']);
const CURL_REFUSED_LONG = /^--(config|location|location-trusted|connect-to|resolve|url|doh-url|dns-servers|dns-interface|unix-socket|abstract-unix-socket|preproxy|socks[0-9a-z]*|proxy[a-z0-9-]*)$/;
const WGET_SHORT_VALUED = new Set(['O', 'P', 'o', 'a', 'i', 't', 'T', 'w', 'Q', 'l', 'A', 'R', 'D', 'I', 'X', 'B', 'U', 'Y', 'e']);
const WGET_LONG_VALUED = new Set(['--output-document', '--directory-prefix', '--output-file', '--append-output', '--header', '--user-agent', '--timeout', '--tries', '--wait', '--waitretry',
  '--read-timeout', '--connect-timeout', '--dns-timeout', '--limit-rate', '--post-data', '--post-file', '--body-data', '--body-file', '--http-user', '--http-password', '--user', '--password',
  '--referer', '--load-cookies', '--save-cookies', '--ca-certificate', '--certificate', '--private-key', '--level', '--accept', '--reject', '--quota', '--bind-address', '--base', '--method']);
// The host of a literal http(s) URL, lowercase: scheme, userinfo, path and port removed (the hook's host_of_r).
function urlHost(u) {
  try {
    const url = new URL(u);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return url.hostname.toLowerCase().replace(/\.$/, '');
  } catch { return null; }
}
// The reason curl or wget (prog) may not run under the allow-list of hosts, or ''. rest: the words after the program.
function egressWhy(prog, rest, allowedHosts) {
  const curl = prog === 'curl';
  const SHORT = curl ? CURL_SHORT_VALUED : WGET_SHORT_VALUED;
  const LONG = curl ? CURL_LONG_VALUED : WGET_LONG_VALUED;
  const operands = [];
  // The text a word starts with, before its first expansion: enough to see a Host header.
  const lead = (x) => (x.v !== null ? x.v : x.w.parts.reduce((acc, p) => (acc.done || p.t !== 'lit' ? { ...acc, done: true } : { text: acc.text + p.v, done: false }), { text: '', done: false }).text);
  const headerWhy = (x) => {
    if (!x) return '';
    const t = lead(x);
    if (/^\s*host\s*[:;]/i.test(t)) return `${prog} with a Host header can send a request for a listed host to another server; qa.hosts.allowed is set`;
    if (curl && t.startsWith('@')) return `${prog} -H @file reads its headers from a file that cannot be inspected (a Host header there redirects a listed host); qa.hosts.allowed is set`;
    return '';
  };
  const noEscape = `qa.hosts.allowed is set, so ${prog} takes none of the options that point a listed host at another server`;
  let k = 0;
  for (; k < rest.length; k++) {
    const x = rest[k];
    const v = x.v;
    if (v === '--') { k++; break; }
    if (v !== null && v.startsWith('--')) {
      const eq = v.indexOf('=');
      const name = eq === -1 ? v : v.slice(0, eq);
      if (curl && CURL_REFUSED_LONG.test(name)) return `${prog} ${name} can point a listed host at another server; ${noEscape}`;
      if (!curl && (name === '--input-file' || name === '--base' || name === '--config')) return `${prog} ${name} reads targets or settings from a file or a base that cannot be inspected; ${noEscape}`;
      if (!curl && (name === '--execute' || name === '--use-proxy')) return `${prog} ${name} runs a setting (a proxy, a host) that can point a listed host at another server; ${noEscape}`;
      if (name === '--header') {
        const why = headerWhy(eq === -1 ? rest[k + 1] : { v: v.slice(eq + 1), w: null });
        if (why) return why;
      }
      if (LONG.has(name) && eq === -1) k++;
      continue;
    }
    if (v !== null && v.startsWith('-') && v !== '-') {
      for (let c = 1; c < v.length; c++) {
        const ch = v[c];
        if (curl && (ch === 'K' || ch === 'L')) return `curl -${ch} reads a config file or follows a redirect, either of which can leave a listed host; ${noEscape}`;
        if (!curl && (ch === 'i' || ch === 'B')) return `wget -${ch} reads targets from a file or a base that cannot be inspected; ${noEscape}`;
        if (curl && ch === 'x') return `curl -x names a proxy and can point a listed host at another server; ${noEscape}`;
        if (!curl && ch === 'e') return `wget -e runs a setting (a proxy, a host) that can point a listed host at another server; ${noEscape}`;
        if (SHORT.has(ch)) {
          const attached = v.slice(c + 1);
          if (ch === 'H') {
            const why = headerWhy(attached ? { v: attached, w: null } : rest[k + 1]);
            if (why) return why;
          }
          if (!attached) k++;
          break;
        }
      }
      continue;
    }
    operands.push(x);
  }
  for (; k < rest.length; k++) operands.push(rest[k]);
  for (const x of operands) {
    if (x.v === null) return `a ${prog} operand is built from a variable or command substitution and cannot be verified; use a literal http(s) URL on a host in qa.hosts.allowed`;
    if (/^https?:\/\/[^/]*[#@;]/i.test(x.v)) return `${prog} operand "${x.v.slice(0, 60)}" has an @, # or ; before its first path slash, which curl and the URL parser read differently; write the plain host`;
    if (!/^https?:\/\//i.test(x.v) || /[\s\\]/.test(x.v)) return `${prog} operand "${x.v.slice(0, 60)}" is not a literal http(s) URL on a host in qa.hosts.allowed; a bare host, a second target or a URL with a space or backslash is refused`;
    const h = urlHost(x.v);
    if (h === null || !allowedHosts.includes(h)) return `${prog} operand host '${h}' is not in qa.hosts.allowed (or is not a URL the parser reads)`;
  }
  return '';
}

// ---------- the hunt's program list ----------
// The hunt is a program allow-list: besides the audit tools of huntCheck, the git and gh/glab forms of the
// walk below and the node/python scripts named here, it runs only these read verbs and shell builtins. Any
// other program, a script of the project and a program named by a path inside the project are refused
// with HUNT_NOT_LISTED. QA and autopilot keep their deny-list on purpose: they run the project's suites.
const HUNT_PROGRAMS = new Set(['date', 'cat', 'ls', 'head', 'tail', 'wc', 'grep', 'rg', 'find', 'file', 'stat', 'du', 'sort', 'cut', 'tr', 'diff', 'comm',
  'uniq', 'tac', 'nl', 'column', 'paste', 'fold', 'expand', 'which', 'type', 'sha256sum', 'shasum', 'md5sum', 'jq', 'yq', 'basename', 'dirname', 'realpath', 'readlink', 'printf', 'echo', 'true', 'false', 'test', '[', '[[', 'pwd', 'env',
  'git', 'gh', 'glab']);
// The hunt's network is its audit tools and gh/glab api: a program that opens a connection of its own is refused by name.
const HUNT_NET_PROGRAMS = new Set(['curl', 'wget', 'iwr', 'irm', 'invoke-webrequest', 'invoke-restmethod', 'http', 'https', 'httpie', 'xh', 'nc', 'ncat', 'netcat', 'telnet', 'ssh', 'scp', 'sftp', 'rsync', 'socat', 'ftp', 'tftp', 'lftp']);
const HUNT_BUILTINS = new Set(['cd', 'pushd', 'popd', 'set', 'unset', 'local', ':']);
// The scripts of the plugin that a hunt (or a task review) runs by name when the audited project is the plugin itself.
const HUNT_OWN_SCRIPTS_RE = /(^|\/)(skills\/(vulnerability-hunt\/scripts\/hunt-preflight|task-review\/scripts\/assemble-review)|hooks\/lib\/run-records)\.mjs$/;
const HUNT_NOT_LISTED = (prog) => `the hunt reads; ${prog} is not on its list (the read verbs, git read commands, the audit tools and gh/glab api GET)`;
// The reason the hunt refuses this program ('' when it is on the list). args: the words of the command from
// the program on ({ w, v } with v === null for a word built from a variable); dir: the directory the command
// runs in (null when unknown); inArea: whether a real path is in the report area.
function huntProgramWhy(prog, args, interpKind, { dir, rootC, ignoreCase, inArea }) {
  const word = args[0].v;
  const rest = args.slice(1);
  const vals = rest.map((x) => x.v);
  if (/[\\/]/.test(word)) {
    let p = normPath(word);
    if (!p.startsWith('/')) {
      if (dir === null) return `the hunt reads; the program ${word} is relative to a directory the command changed to through a variable; use a plain program name`;
      p = `${dir}/${p.replace(/^\.\//, '')}`;
    }
    if (p.split('/').includes('..')) return `the hunt reads; the program ${word} has a parent-folder segment and cannot be verified`;
    if (rel(realCanonical(p, rootC), rootC, ignoreCase) !== null) return `the hunt reads; ${word} is a program of the project and is not on its list`;
  }
  if (rest.length > 0 && vals.every((v) => v !== null && INFO_FLAGS.includes(v))) return '';
  if (HUNT_BUILTINS.has(prog)) return '';
  if (['sed', 'awk', 'gawk', 'mawk', 'nawk'].includes(prog)) {
    // A text filter only in its safe form: sed with -n, -E, -r, -e and a script made of addresses and the p, d, q, =,
    // s and y commands (no w, W, e, r, R, never -i, -f or -s); awk with an inline program that holds no system(,
    // getline, redirect or pipe, and no -f. A script outside that grammar cannot be told from a write or a command.
    if (vals.some((v) => v === null)) return `the hunt reads; ${prog} is not on its list with an argument built from a variable or substitution`;
    if (prog === 'sed') {
      const scripts = [];
      let k = 0;
      for (; k < vals.length; k++) {
        const v = vals[k];
        if (v === '-e') { if (vals[k + 1] === undefined) return 'the hunt reads; sed is not on its list without a script after -e'; scripts.push(vals[k + 1]); k++; continue; }
        if (/^-[nEr]+$/.test(v)) continue;
        if (v.startsWith('-') && v !== '-') return `the hunt reads; sed is not on its list with ${v} (only -n, -E, -r and -e <script>; never -i, -f or -s)`;
        break;
      }
      if (scripts.length === 0) { if (vals[k] === undefined) return 'the hunt reads; sed is not on its list without a script'; scripts.push(vals[k]); }
      const D = '(?:[^/\\\\\\n]|\\\\.)*';
      const SUBST = new RegExp(`s/${D}/${D}/[gpiImM0-9]*`, 'g');
      const TRANS = new RegExp(`y/${D}/${D}/`, 'g');
      const ADDR = new RegExp(`/${D}/[IM]?`, 'g');
      for (const s of scripts) {
        const rest = s.replace(SUBST, 'S').replace(TRANS, 'Y').replace(ADDR, 'A');
        if (!/^[\s0-9,$!;{}pdq=SYA~+]*$/.test(rest)) return `the hunt reads; sed is not on its list with the script "${s.slice(0, 40)}" (only addresses and the p, d, q, =, s and y commands: no w, e, r or other command)`;
      }
      return '';
    }
    const BAD = /system\s*\(|getline|popen|[|>]/;
    for (let k = 0; k < vals.length; k++) {
      const v = vals[k];
      if (v === '-F') { k++; continue; }
      if (v === '-v') { if (BAD.test(vals[k + 1] || '')) return `the hunt reads; ${prog} is not on its list with a -v value that holds a command, a pipe or a redirect`; k++; continue; }
      if (/^-F./.test(v)) continue;
      if (/^-v./.test(v)) { if (BAD.test(v)) return `the hunt reads; ${prog} is not on its list with a -v value that holds a command, a pipe or a redirect`; continue; }
      if (v.startsWith('-') && v !== '-') return `the hunt reads; ${prog} is not on its list with ${v} (an inline program with -F and -v only, never -f or -i)`;
      if (BAD.test(v)) return `the hunt reads; ${prog} is not on its list with a program that holds system(, getline, a redirect or a pipe`;
      return '';
    }
    return `the hunt reads; ${prog} is not on its list without a program`;
  }
  if (HUNT_PROGRAMS.has(prog)) {
    const text = vals.filter((v) => v !== null);
    if (prog === 'rg' && text.some((v) => /^--(pre|hostname-bin)(=|$)/.test(v))) return 'the hunt reads; rg --pre and --hostname-bin run a program';
    if (prog === 'yq' && text.some((v) => /^-[A-Za-z]*[is]$/.test(v) || /^--(in-?place|split-exp)(=|$)/.test(v))) return 'the hunt reads; yq -i and -s write files';
    if (prog === 'yq' && text.some((v) => /(^|[^A-Za-z0-9_])(str)?env(subst)?\s*\(|(^|[^A-Za-z0-9_])(load|eval)(_str|_xml|_base64|_props|_csv|_json|_yaml)?\s*\(/.test(v))) return 'the hunt reads; a yq expression that reads the environment or loads a file cannot be verified';
    if (prog === 'jq' && text.some((v) => /\$ENV\b|(^|[\s|(;,])env([\s|)\];,]|$)/.test(v))) return 'the hunt reads; a jq expression that reads the environment cannot be verified';
    if (prog === 'file' && text.some((v) => /^-[A-Za-z]*C/.test(v) || v === '--compile')) return 'the hunt reads; file -C writes a compiled magic file';
    return '';
  }
  if (SHELLS.has(prog)) {
    // Only a command string, which the walk reads as a command of its own; a script file or stdin is a program of the project.
    if (vals.some((v) => v !== null && (/^-[a-zA-Z]*c[a-zA-Z]*$/.test(v) || v === '--command' || v.startsWith('--command=')))) return '';
    return HUNT_NOT_LISTED(prog);
  }
  if (['node', 'nodejs'].includes(prog) || interpKind === 'python') {
    // The script is the first word, with no option before it (an option may take a value or load code); it runs
    // only when it lies outside the project, or is one of the plugin's own scripts and not a file of the report area.
    const script = args[1];
    if (!script || script.v === null || script.v.startsWith('-')) return `the hunt reads; ${prog} runs a script given as its first word with no option before it`;
    let p = normPath(script.v);
    if (!p.startsWith('/')) {
      if (dir === null) return `the hunt reads; ${prog} ${script.v} is relative to a directory the command changed to through a variable`;
      p = `${dir}/${p.replace(/^\.\//, '')}`;
    }
    if (p.split('/').includes('..')) return `the hunt reads; ${prog} ${script.v} has a parent-folder segment and cannot be verified`;
    if (stdinScript(p)) return STDIN_FILE_WHY;
    const real = realCanonical(p, rootC);
    // The hunt runs the plugin's own scripts and nothing else: the preflight, the review assembler and the
    // run-record script, each a regular file under the plugin root this analyzer runs from, outside the report
    // area. Any other script, inside the project or outside it (a package manager's entry script, another
    // harness's CLI), is code the hunt does not run; a copy of an own script shipped by the audited code is its code.
    if (HUNT_OWN_SCRIPTS_RE.test(real.replace(/\\/g, '/')) && !inArea(real) && inside(real, realCanonical(PLUGIN_ROOT, PLUGIN_ROOT), ignoreCase)) {
      try { if (statSync(real).isFile()) return ''; } catch { /* missing */ }
      return `the hunt reads; ${prog} ${script.v} is not a regular file (a device, a pipe or a missing file runs code nobody read)`;
    }
    return `the hunt reads; ${prog} ${script.v} is not on its list (${prog} runs only the plugin's own hunt scripts: the preflight, the review assembler and run-records.mjs)`;
  }
  return HUNT_NOT_LISTED(prog);
}

// ---------- words the shell or a program expands ----------
const GLOB_CHARS = /[*?[\]{}]/;
// The names a brace list makes before the program runs ({a,b}, {/dev/null,.env}, {~/.ss,x}h/id_rsa): the innermost
// list first, so a nested one comes out too. At most `max` names (BRACE_MAX); `over` is true when more were made.
const BRACE_MAX = 32;
function braceAlternatives(word, max = BRACE_MAX) {
  let out = [word];
  for (let round = 0; round < 8; round++) {
    const next = [];
    let changed = false;
    for (const s of out) {
      const m = /\{([^{}]*,[^{}]*)\}/.exec(s);
      if (!m) { next.push(s); continue; }
      changed = true;
      for (const alt of m[1].split(',')) next.push(s.slice(0, m.index) + alt + s.slice(m.index + m[0].length));
      if (next.length > max) return { list: next.slice(0, max), over: true };
    }
    out = next;
    if (!changed) break;
  }
  return { list: out, over: false };
}
// The WORD of ${NAME:-WORD}, ${NAME:+WORD}, ${NAME:=WORD} and ${NAME:?WORD} (also without the colon): the text the
// expansion puts into the word when the shell takes the default or the alternate.
const expansionWord = (text) => { const m = /^[A-Za-z_][A-Za-z0-9_]*:?[-=?+]([\s\S]*)$/.exec(String(text)); return m ? m[1] : ''; };
// ${X:-${Y:-.env}}: the tokenizer ends the expansion at its first `}`, so the inner expansion stands in the text with its own
// braces. Each one is replaced by its WORD, innermost first, to a fixed point (at most NESTED_MAX rounds).
const NESTED_MAX = 8;
const NESTED_DEFAULT_RE = /\$\{[A-Za-z_][A-Za-z0-9_]*:?[-=?+]([^${}]*)\}/g;
function resolveNestedDefaults(text) {
  let s = text;
  for (let round = 0; round < NESTED_MAX; round++) {
    const next = s.replace(NESTED_DEFAULT_RE, '$1');
    if (next === s) break;
    s = next;
  }
  return s;
}
// The text of a word that holds an expansion: its literal parts, and with `withDefaults` the WORD of each ${X:-WORD} too
// (a nested default resolved to the text it puts in).
const literalText = (w, withDefaults) => {
  const text = w.parts.map((p) => (p.t === 'lit' ? p.v : p.t === 'dyn' && withDefaults && p.text !== undefined ? expansionWord(p.text) : '')).join('');
  return withDefaults ? resolveNestedDefaults(text) : text;
};
// One glob segment as a regular expression that says whether it MAY match a name (a leading dot is matchable: the
// callers ask about names the shell's own rule would not have reached).
function globSegRe(seg) {
  let out = '';
  for (let i = 0; i < seg.length; i++) {
    const c = seg[i];
    if (c === '*') out += '.*';
    else if (c === '?') out += '.';
    else if (c === '[') {
      const end = seg.indexOf(']', i + 2);
      if (end === -1) { out += '\\['; continue; }
      let body = seg.slice(i + 1, end);
      if (body[0] === '!' || body[0] === '^') body = `^${body.slice(1)}`;
      out += `[${body.replace(/\\/g, '\\\\')}]`;
      i = end;
    } else out += c.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  }
  try { return new RegExp(`^${out}$`, 'i'); } catch { return null; }
}
const globMayMatch = (seg, name) => { const re = globSegRe(seg); return re !== null && re.test(name); };
// True when a glob word can name /proc/<pid>/environ: its literal directory part is under /proc (the folder it is
// applied in is, for a relative word: `dir`, undefined when not known), or its first segment can be `proc` and its
// last `environ` (/pro?/self/environ), or, in a folder the command moved to through a variable (`dir` null), its last
// segment can be `environ`.
function procGlobReaches(text, dir) {
  const s = normPath(text);
  if (s.startsWith('~') || /^[[\]{}]{1,2}$/.test(s)) return false;
  let abs = s;
  if (!s.startsWith('/')) {
    if (dir === undefined) return false;
    if (dir === null) return globMayMatch(s.split('/').pop(), 'environ');
    abs = `${dir}/${s.replace(/^\.\//, '')}`;
  }
  const segs = posix.normalize(abs).split('/').filter(Boolean);
  let lit = 0;
  while (lit < segs.length && !GLOB_CHARS.test(segs[lit])) lit++;
  if (segs[0] === 'proc' && lit >= 1) return true;
  return segs.length >= 3 && globMayMatch(segs[0], 'proc') && globMayMatch(segs[segs.length - 1], 'environ');
}
// A pattern that find (-name, -path), grep (--include) and rg (-g) match with their own rules: there `*` and `?`
// match a leading dot, which the shell's glob does not, so the pattern is judged as written and with a dot allowed
// for the wildcard that opens a segment (`?env` and `*rc` reach `.env` and `.npmrc`). keyGlobReaches knows the names.
// A brace list in the pattern is expanded first (the shell does it before grep sees --include={.en?,x}, and rg's glob reads
// {a,b} itself): each name is judged, and a list of more than PROGRAM_BRACE_MAX names cannot be and is refused.
const PROGRAM_BRACE_MAX = 64;
function programGlobReachesKey(pattern) {
  const s = String(pattern).replace(/\.env\.example/gi, '').replace(/\\/g, '/');
  if (s.startsWith('!')) return false;
  const { list, over } = braceAlternatives(s, PROGRAM_BRACE_MAX);
  if (over) return true;
  return [s, ...list].some((alt) => {
    // A name with no wildcard (--include=.env) is the key file itself; a pattern is matched against the key names.
    if (!/[*?[\]{}]/.test(alt)) return KEY_RE.test(alt.toLowerCase());
    if (keyGlobReaches(alt)) return true;
    const dotted = alt.split('/').map((seg) => (/[^*?]/.test(seg) ? seg.replace(/^\*/, '{.,}*').replace(/^\?/, '[.?]') : seg)).join('/');
    return dotted !== alt && keyGlobReaches(dotted);
  });
}

// ---------- analysis ----------
const ENV_DUMP ='dumping the environment is blocked; check a variable with ${NAME:+set} instead';
const DESTRUCTIVE_WHY = 'recursive or forced delete is blocked';
const SUBST_WHY = 'a command substitution cannot be analysed; spell the command out (run the inner command as its own call)';
const SUBST_DEPTH = 3;
// The run records of the QA and hunt profiles (.ultrapowers/runs/): the guardrail's switches, never a call's to change.
const MARKER_RE = /(^|\/)\.ultrapowers\/runs(\/|$)/;
const MARKER_WHY = 'is a run record; no call of a run writes, moves or removes one: the run ends itself through hooks/lib/run-records.mjs end once its report holds its Verdict line';
// A stage reads no tracker credential and nothing named like a secret out of the environment.
const TRACKER_VARS = /^(GH_TOKEN|GITHUB_TOKEN|GITLAB_TOKEN|GLAB_TOKEN|ODOO_API_KEY|ULTRAPOWERS_STAGE_.*)$/i;
const SECRET_VARS = /TOKEN|KEY|SECRET|PASS|CREDENTIAL|AUTH|COOKIE|SESSION|PRIVATE/i;

export function analyze(command, { cwd, root, ticket, profile = 'qa', ignoreCase = process.platform === 'win32' || process.platform === 'darwin', roleVars: roleVarsIn = [], roRole = 'qa_agent_ro', flags = null, allowedHosts = [] }) {
  const autopilot = profile === 'autopilot';
  // The hunt profile: every QA rule (the report area is reviews/<audit id>/ and .ultrapowers/, the audit
  // id in the ticket field taking the place of a ticket), plus a closed list for the audit tools of the
  // hunt and for what it refuses besides (see huntCheck).
  const hunt = profile === 'hunt';
  // The role variables come from the config of the tree under test (qa.roles): the hunt logs in to
  // nothing and reads none, and a role variable never stands for a tracker credential.
  const roleVars = hunt ? [] : roleVarsIn.filter((n) => !TRACKER_VARS.test(n));
  // A name whose value a run never prints or passes on: the tracker credentials, and in a hunt or a
  // stage every credential-shaped name.
  const credential = (n) => !roleVars.includes(n) && (TRACKER_VARS.test(n) || ((profile === 'autopilot' || hunt) && SECRET_VARS.test(n)));
  // flags.psql counts the psql invocations this walk inspected. The hook compares it with the
  // number of psql words in the command and refuses one it did not see (xargs, find -exec, eval,
  // a brace group, sudo -u, su -c, kubectl exec): fail closed, not a second SQL parser in bash.
  // words: bare psql words seen anywhere; inspected: psql invocations judged. More words than
  // inspections means a psql the walk did not reach, which is refused at the end.
  const psqlCount = { words: 0, inspected: 0 };
  // How many command substitutions deep the walk is (each one is walked as its own command).
  let subDepth = 0;
  // Every compare below is between real canonical paths (8.3 short names, Git Bash forms and
  // symlinks resolved), exact unless the project's folder ignores case.
  const rootC = realCanonical(root, root);
  const areas = autopilot
    ? [rootC]
    : [realCanonical(ticket ? `${rootC}/reviews/${ticket}` : `${rootC}/reviews`, rootC), realCanonical(`${rootC}/.ultrapowers`, rootC)];
  const areaText = autopilot ? 'the workspace' : `reviews/${ticket || '<id>'}/ and .ultrapowers/`;
  // A write-area folder that is itself a link leads wherever it points (realCanonical follows it, so a committed
  // reviews/<id> -> .. would make the whole project the area): no write is judged against such an area.
  let areaLink = '';
  if (!autopilot) {
    for (const folder of ['reviews', ticket ? `reviews/${ticket}` : '', '.ultrapowers']) {
      if (!folder) continue;
      try { if (lstatSync(`${rootC}/${folder}`).isSymbolicLink()) { areaLink = folder; break; } } catch { /* not there (yet) */ }
    }
  }
  const runKind = autopilot ? 'an autopilot stage' : hunt ? 'a vulnerability hunt' : 'a QA run';
  const vars = new Map();
  // Names given to `export`, `declare` or `typeset` earlier in the command: they reach every later program.
  const exportedNames = new Set();
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
  // The QA baseline named by qa.knownIssues (the default qa/known-issues.md is in the pattern): a
  // stage never edits its own baseline.
  let knownReal = '';
  // The stage that is the QA gate (marker stage `qa`, written by the engine) starts its own QA record through
  // run-records.mjs: the one stage that runs it (see the refusal in simple()).
  let qaGateStage = false;
  if (autopilot) {
    try { qaGateStage = JSON.parse(readFileSync(`${rootC}/.ultrapowers/autopilot-active`, 'utf8').replace(/^﻿/, '')).stage === 'qa'; } catch { qaGateStage = false; }
  }
  if (autopilot) {
    try {
      const cfg = JSON.parse(readFileSync(`${rootC}/.agents/ultrapowers.json`, 'utf8').replace(/^﻿/, ''));
      const k = cfg && cfg.qa && typeof cfg.qa.knownIssues === 'string' ? cfg.qa.knownIssues.trim() : '';
      if (k) knownReal = realCanonical(k, rootC);
    } catch { knownReal = ''; }
  }
  const protectedPath = (real) => {
    const inner = rel(real, rootC, ignoreCase);
    const l = (inner === null ? real : inner).toLowerCase().replace(/\.env\.example/g, '');
    if (autopilot && knownReal && (ignoreCase ? real.toLowerCase() === knownReal.toLowerCase() : real === knownReal)) return true;
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
    if (areaLink) return deny(`${what} (${raw}) cannot be judged: ${areaLink} is a symbolic link, so the write area is wherever it leads; your human partner replaces it with a folder`);
    // An autopilot stage: a pattern or a brace list expands to names the text rule never sees (.gi[t]/config).
    if (autopilot && /[*?[{]/.test(raw)) return deny(`${what} (${raw}): a glob or brace target cannot be checked against the protected paths during an autopilot stage; spell the path out`);
    let p = normPath(raw);
    if (p.startsWith('~')) return deny(`${what} (${raw}) is outside the project; writes are limited to ${areaText}`);
    if (!p.startsWith('/')) {
      if (dir === null) return deny(`${what} (${raw}) is relative to a directory the command changed to through a variable; use a literal path`);
      p = `${dir}/${p.replace(/^\.\//, '')}`;
    }
    if (p.split('/').includes('..')) return deny(`${what} (${raw}) has a parent-directory segment and cannot be verified`);
    const real = realCanonical(p, rootC);
    // QA run and hunt: the run records are protected from every write, move and removal (a run ends
    // itself through hooks/lib/run-records.mjs end), and so is what can reach them: a pattern under
    // .ultrapowers/ (rm .ultrapowers/runs/*) and .ultrapowers/ itself as the folder something is
    // extracted into.
    if (!autopilot) {
      const innerL = (rel(real, rootC, ignoreCase) ?? real).toLowerCase();
      if (MARKER_RE.test(innerL) || /(^|\/)\.ultrapowers\/_$/.test(innerL) || (/[*?[{]/.test(raw) && /(^|\/)\.ultrapowers(\/|$)/i.test(p))) {
        return deny(`${what} (${raw}) ${MARKER_WHY}`);
      }
    }
    // A directory named as the target (cp x .husky, mkdir .github) receives its content inside it:
    // the patterns name the contents of a protected folder, so the folder is judged as one.
    if (protectedPath(real) || protectedPath(`${real}/_`)) return deny(`${what} (${raw}) is a protected path; the config, hooks, CI, settings and key material are never written during ${runKind}`);
    if (!inArea(real)) deny(`${what} (${raw}) is outside ${areaText}; shell writes during ${runKind} are limited to ${autopilot ? 'the workspace' : 'those folders'}`);
  };
  // A folder a hunt command is pointed at (npm audit --prefix <dir>): a literal path that resolves inside the
  // project, symlinks and 8.3 names resolved. Anywhere else the tool would read a tree the hunt was not given.
  // The same for an audit input file (cargo audit --file, osv-scanner --lockfile, pip-audit -r).
  const checkProjectDir = (raw, form, dir, opt = '--prefix') => {
    let p = normPath(raw);
    if (!p.startsWith('/')) {
      if (dir === null) return deny(`${form} during the hunt; ${opt} ${raw} is relative to a directory the command changed to through a variable; use a literal path`);
      p = `${dir}/${p.replace(/^\.\//, '')}`;
    }
    if (p.split('/').includes('..')) return deny(`${form} during the hunt; ${opt} ${raw} has a parent-directory segment and cannot be verified`);
    const real = realCanonical(p, rootC);
    if (rel(real, rootC, ignoreCase) === null) deny(`${form} during the hunt; ${opt} ${raw} is outside the project ${rootC}`);
  };

  // Key material named by a word, whatever reads it: the word as the shell resolves it (quotes removed,
  // `.e"n"v` is `.env`), the literal text around an expansion (`$HOME/.git-credentials`), a glob that can expand to
  // a key name (`.en?`, `.e[n]v`), and a word spelled with an 8.3 alias that resolves to key material (issue #31).
  const keyText = (s) => String(s).replace(/\\/g, '/').toLowerCase().replace(/\.env\.example/g, '');
  const checkAlias = (w, dir) => {
    const raw = resolveWord(w);
    const keyWhy = (what) => deny(`key material (${what}) is never read, searched, uploaded or written during ${runKind}`);
    const environWhy = (what) => deny(`reading a process environment (${what}) is blocked during ${runKind}; check a variable with \${NAME:+set} instead`);
    const procDirWhy = (what) => deny(`a process folder (${what}) holds the process environment (/proc/<pid>/environ) and is blocked as a whole during ${runKind}; name the file you need (/proc/self/status)`);
    // The names a word can make: itself, and each name its brace lists expand to ({/dev/null,.env}, {~/.ss,x}h/id_rsa).
    // A list that makes more than BRACE_MAX names of a path-shaped word cannot be checked, so the word is refused.
    const alternatives = (text) => {
      if (/\s/.test(text) || !/\{[^{}]*,[^{}]*\}/.test(text)) return [text];
      const { list, over } = braceAlternatives(text);
      if (over && !/["':=]/.test(text)) deny(`a brace list that makes more than ${BRACE_MAX} names (${text.slice(0, 40)}) cannot be checked against key material; name the files`);
      return [text, ...list];
    };
    // The text rules for one spelling. `partial`: the word holds an expansion, so only its text is judged (and a
    // relative glob has no folder to be judged in).
    const judgeText = (text, partial) => {
      if (!text) return;
      const t = keyText(text);
      if (KEY_RE.test(t)) return keyWhy(text);
      // The same text in its canonical form: `~/.config//gh`, `/proc/self/./environ` and `a/../.ssh` name the
      // file the shell opens, whatever the spelling (and /proc/$$/envi""ron is /proc//environ).
      const flat = posix.normalize(t);
      if (KEY_RE.test(flat)) return keyWhy(text);
      if (ENVIRON_RE.test(flat)) return environWhy(text);
      if (PROC_DIR_RE.test(flat)) return procDirWhy(text);
      // A glob under /proc, or one that can name /proc/<pid>/environ, reads the process environment through a name
      // the text rule never sees (/proc/self/envir?n, cd /proc/self && cat envir*).
      if (GLOB_CHARS.test(t) && procGlobReaches(t, partial ? undefined : dir)) return deny(`a glob (${text}) under /proc can name a process environment (/proc/<pid>/environ), which is blocked during ${runKind}; check a variable with \${NAME:+set} instead`);
      if (partial) return;
      // A bare `environ` after `cd /proc/self` (or after a cd whose target is built from a variable, where the
      // folder is unknown) names the same file: the word is judged under the folder it resolves in.
      if (!text.startsWith('/') && !text.startsWith('-') && !text.startsWith('~') && /^\/proc(\/|$)/.test(dir === null ? '/proc/_' : dir) && ENVIRON_RE.test(posix.normalize(`${dir === null ? '/proc/_' : dir}/${t}`))) return environWhy(text);
      // The same for a process folder named relative to /proc (cd /proc; grep -r . self/).
      if (typeof dir === 'string' && !text.startsWith('/') && !text.startsWith('-') && !text.startsWith('~') && PROC_DIR_RE.test(posix.normalize(`${dir}/${t}`))) return procDirWhy(text);
      if (GLOB_CHARS.test(text) && keyGlobReaches(text.replace(/\.env\.example/gi, ''))) return deny(`a glob (${text}) can expand to key material, which is never read, searched, uploaded or written during ${runKind}; name the file`);
    };
    if (raw === null) {
      // A process folder named by an expansion (/proc/$$, /proc/$PID/): /proc/ and the expansion, nothing else but a slash.
      if (w.parts.length >= 2 && w.parts[0].t === 'lit' && /^\/+proc\/+$/i.test(w.parts[0].v) && w.parts.slice(1).every((p, i, a) => p.t !== 'lit' || (i === a.length - 1 && /^\/+$/.test(p.v)))) return procDirWhy('/proc/<built from an expansion>');
      // The literal text around an expansion, and with the WORD of each ${X:-WORD} put in (${X:-.env} is `.env`
      // when X is unset, ${HOME:+.env} when it is set).
      for (const text of new Set([literalText(w, false), literalText(w, true)])) for (const alt of alternatives(text)) judgeText(alt, true);
      return;
    }
    for (const alt of alternatives(raw)) judgeText(alt, false);
    // A path-shaped word is resolved to its real spelling (a symlink in the project, an 8.3 alias) and the real
    // name is tested too. An option, a URL and a home path are text only (the rules above read them).
    const pathy = !raw.startsWith('-') && !raw.includes('://') && !raw.startsWith('~') && !/[*?[\]{}=\s]/.test(raw) && (/[\\/]/.test(raw) || raw.startsWith('.') || SHORT_SEG.test(raw));
    if (!pathy) return;
    let p = normPath(raw);
    if (!p.startsWith('/')) p = `${dir === null ? rootC : dir}/${p.replace(/^\.\//, '')}`;
    // On Windows an absolute POSIX path outside a drive (/tmp, /proc) needs a cygpath call to resolve; only an
    // 8.3 alias pays for it (the text rules above already read such a path as written).
    if (process.platform === 'win32' && !/^\/[A-Za-z](\/|$)/.test(p) && !SHORT_SEG.test(raw)) return;
    const real = realCanonical(p, rootC);
    const inner = rel(real, rootC, ignoreCase);
    const l = (inner === null ? real : inner).toLowerCase().replace(/\.env\.example/g, '');
    if (KEY_RE.test(l) || KEY_RE.test(real.toLowerCase().replace(/\.env\.example/g, ''))) deny(`key material (${raw}) is never read, searched, uploaded or written during ${runKind}`);
    else if (ENVIRON_RE.test(real.replace(/\\/g, '/'))) deny(`reading a process environment (${raw}) is blocked during ${runKind}; check a variable with \${NAME:+set} instead`);
  };

  // A directory something is extracted into, judged as a file inside it: the protected patterns name
  // the contents of a folder (.husky/, .github/), not the folder itself.
  const inDir = (w) => ({ k: 'w', parts: [...w.parts, { t: 'lit', v: '/_' }] });

  const walk = (src, startDir, container, depth) => {
    if (depth > 4) return deny('the command nests shells too deeply to be verified');
    let dir = startDir;
    const toks = tokenize(src);
    // A command substitution runs a command of its own inside a word. A QA run and a hunt refuse
    // every one: the inner text is cut out by a scan that is not a shell parser, so a substitution
    // it misreads could hide a write. An autopilot stage writes anywhere in the workspace, so its
    // inner commands are walked under the same rules (the code-running and write-capable programs
    // the profile gates are judged there), and what cannot be cut out cleanly is refused.
    // Every profile: the inner text of $( ) and of a backtick is cut out and walked as a command of
    // its own in the same profile, up to SUBST_DEPTH levels deep; the outer command is then judged
    // with the substitution as a word built at run time (null). Refused: what cannot be cut out
    // cleanly (inside a here-document, a ${...} or an arithmetic expansion, or a cut whose quotes do
    // not balance), and in a QA run or a hunt a process substitution <( ) or >( ).
    if (toks.subs.length) {
      for (const s of toks.subs) {
        if (s.kind === 'proc') { if (!autopilot) return deny(`${SUBST_WHY} (a process substitution)`); continue; }
        if (s.kind !== 'cmd') return deny(`${SUBST_WHY} (a substitution inside a here-document, a \${...} or an arithmetic expansion)`);
        // An odd quote count means the scan cut the text at the wrong parenthesis.
        // Read as the shell quotes: inside '...' only ' ends it; elsewhere a backslash escapes.
        let q = '';
        for (let k = 0; k < s.src.length; k++) {
          const ch = s.src[k];
          if (q === "'") { if (ch === "'") q = ''; continue; }
          if (ch === '\\') { k++; continue; }
          if (q === '"') { if (ch === '"') q = ''; continue; }
          if (ch === "'" || ch === '"') q = ch;
        }
        if (q) return deny(`${SUBST_WHY} (its quotes do not balance)`);
        if (subDepth >= SUBST_DEPTH) return deny(`${SUBST_WHY} (substitutions nested more than ${SUBST_DEPTH} deep)`);
        // The substitution runs where the command is at that point; a cd earlier in it makes that unknown.
        const at = toks.some((t) => t.k === 'w' && ['cd', 'pushd', 'popd'].includes(progName(resolveWord(t) || ''))) ? null : startDir;
        const saved = { ...walkEnv };
        subDepth += 1;
        try { walk(s.src, at, container, depth); } finally { subDepth -= 1; Object.assign(walkEnv, saved); }
        if (reason) return;
      }
    }
    let cmd = [];
    const flush = () => { if (cmd.length) simple(cmd); cmd = []; };
    // countWords is false when a wrapper's tail is re-run and the outer command counted it already.
    const simple = (items, countWords = true) => {
      for (const t of items) if (t.k === 'w') checkAlias(t, dir);
      // A stage never reads a credential out, whatever prints it: `echo $GH_TOKEN`, `printf '%s' "$ODOO_API_KEY"`.
      // A presence check stays: `${NAME:+set}`, `[ -n "$NAME" ]`. Autopilot and the hunt refuse every credential-shaped
      // name (SECRET_VARS); a QA run refuses the tracker credentials (TRACKER_VARS) and keeps its role variables and
      // the token a lane mints into its own shell variable (qa-lane-3-api: -H "Authorization: Bearer $TOKEN").
      {
        const first = items.find((t) => t.k === 'w');
        const firstWord = first ? (resolveWord(first) ?? '') : '';
        const isTest = ['[', '[[', 'test'].includes(firstWord);
        if (!isTest) {
          // The unquoted here-document of this command expands its variables as a word does.
          for (const t of items) {
            if (t.k !== 'w' && !(t.k === 'op' && t.parts)) continue;
            if (t.parts.some((p) => p.t === 'dyn' && p.indirect)) return deny(`\${!NAME} reads a variable whose name is only known at run time; ${runKind} never reads one out that way, name the variable`);
            const names = t.parts.flatMap((p) => (p.t === 'var' ? [p.v] : p.t === 'dyn' && p.reads ? p.reads : []));
            const hit = names.find(credential);
            if (hit) return deny(`$${hit} would print or pass on a credential or secret; ${runKind} never reads one out, check it with \${NAME:+set}`);
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
          // A redirect from /dev/tcp/HOST/PORT or /dev/udp/HOST/PORT opens a connection (bash's own), in every
          // profile. The word is judged as the shell resolves it: quotes removed, `//`, `/./` and `..` collapsed
          // (</dev/t""cp/$X/80), the literal text around an expansion kept.
          if (['<', '<<<', '<>'].includes(t.v) && next && next.k === 'w') {
            const lit = next.parts.filter((p) => p.t === 'lit').map((p) => p.v).join('');
            if (/^\/dev\/(tcp|udp)(\/|$)/i.test(posix.normalize(normPath(lit)))) return deny('a /dev/tcp or /dev/udp redirect opens a connection; blocked in every profile');
          }
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
      // The names set or unset for this command by a prefix or an env wrapper (env NAME=x, env -u NAME);
      // a shell or interpreter program judges them (SAFE_ENV_RE) before it runs anything.
      const shellEnvNames = new Set(assigns.map(([m]) => m));
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
      // A compound command's keyword is not a program: `then rm x`, `do rm x`, `else rm x`.
      while (args.length && args[0].v !== null && ['then', 'do', 'else', 'elif', 'if', 'while', 'until', '!'].includes(args[0].v)) args = args.slice(1);
      if (args.length === 0) return;
      // `coproc NAME COMPOUND` takes NAME as the program when the compound is not a brace group, and the
      // forms differ too much to model: refused outright, with whatever it would run in the background.
      if (args[0].v === 'coproc') return deny('a coprocess runs a command in the background that the analyzer does not follow');
      // A reserved word that opens a compound command this walk does not follow (a case, a select loop, a
      // `function` body: the words around the body are not read as its commands): refused.
      if (args[0].v !== null && ['case', 'select', 'function'].includes(args[0].v)) return deny('a compound command the analyzer does not follow');
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
      // A hunt walks readonly too (zsh exports with readonly -x), and judges the NAME of every word, from its
      // leading literal part up to `=`, before a value built from an expansion hides it: only the harmless
      // names pass, however their value is built.
      const declWord = progName(args[0].v);
      // declare -p NAME (typeset -p, local -p) prints the value of NAME, and declare -n R=NAME makes R a
      // name reference that reads NAME under another name: both are reads of the variable they name.
      if (['declare', 'typeset', 'local'].includes(declWord)) {
        const opts = args.slice(1).filter((x) => x.v !== null && /^[-+]/.test(x.v)).map((x) => x.v);
        const named = args.slice(1).filter((x) => x.v === null || !/^[-+]/.test(x.v));
        if (opts.some((v) => /^-[A-Za-z]*p/.test(v))) {
          for (const x of named) {
            if (x.v === null) return deny(`${declWord} -p with a name built from a variable or substitution cannot be verified; ${runKind} never reads a credential out`);
            const n = x.v.split('=')[0];
            if (credential(n)) return deny(`${declWord} -p ${n} would print a credential or secret; ${runKind} never reads one out, check it with \${NAME:+set}`);
          }
        }
        if (opts.some((v) => /^-[A-Za-z]*n/.test(v))) {
          for (const x of named) {
            const target = x.v === null ? null : x.v.includes('=') ? x.v.slice(x.v.indexOf('=') + 1) : '';
            // No target at all (`declare -n r`) is the first half of `r=GH_TOKEN; echo $r`: the later assignment
            // would aim the reference at a credential, so a reference is declared with its literal target.
            if (target === '') return deny(`a name reference (${declWord} -n ${x.v}) with no target cannot be verified during ${runKind}: a later assignment would aim it at a credential; give it its target, ${declWord} -n NAME=TARGET`);
            if (target === null || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(target)) return deny(`a name reference (${declWord} -n) to a variable built at run time cannot be verified during ${runKind}`);
            if (target && credential(target)) return deny(`a name reference (${declWord} -n) to ${target} would read a credential or secret; ${runKind} never reads one out`);
          }
        }
      }
      if (['export', 'declare', 'typeset', ...(hunt ? ['readonly'] : [])].includes(declWord) && args.slice(1).some((x) => x.v === null || !x.v.startsWith('-'))) {
        const how = declWord === 'export' ? 'exported' : declWord === 'readonly' ? 'made readonly' : 'set by declare or typeset';
        for (const x of args.slice(1)) {
          if (hunt && !(x.v !== null && x.v.startsWith('-')) && !(x.w.parts[0] && x.w.parts[0].t === 'lit' && x.w.parts[0].v.startsWith('-'))) {
            let literal = '';
            let named = false;
            for (const part of x.w.parts) {
              if (part.t !== 'lit') break;
              const at = part.v.indexOf('=');
              if (at !== -1) { literal += part.v.slice(0, at); named = true; break; }
              literal += part.v;
            }
            // A name that ends before any expansion (`NAME=$X`, `NAME`) is known; one cut short by an expansion
            // (`$NAME=x`, `GH_$X=x`) is not.
            const known = named || x.w.parts.every((part) => part.t === 'lit');
            if (!known || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(literal)) return deny(`a variable ${how} during ${runKind} (a name built from an expansion) cannot be verified; only the listed harmless variables pass`);
            if (!SAFE_ENV_RE.test(literal)) return deny(`a variable ${how} during ${runKind} (${literal}) can redirect the audit tools (a host, a registry, a config file); only the listed harmless variables pass`);
          }
          if (x.v === null) { if (x.w.parts.some((p) => p.t === 'lit' && /PGUSER|PSQLRC|PGSERVICE|PGOPTIONS|PGPASSFILE/.test(p.v))) walkEnv.pgUser = null; continue; }
          if (x.v.startsWith('-')) continue;
          const eq = x.v.indexOf('=');
          const name = eq === -1 ? x.v : x.v.slice(0, eq);
          exportedNames.add(name);
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
      // Package runners start a program of their own: npx tsx -e, npm exec -- node -e, pnpm dlx, yarn dlx, bun x.
      // Also uvx, pipx run, uv run, uv tool run, poetry run and pipenv run (a Python program started the same way).
      const RUNNER_DIRECT = ['npx', 'bunx', 'pnpx', 'uvx'];
      const runnerSkip = () => {
        if (RUNNER_DIRECT.includes(prog)) return 1;
        if (['npm', 'pnpm', 'yarn', 'bun'].includes(prog) && args[1] && args[1].v !== null && ['exec', 'dlx', 'x'].includes(args[1].v)) return 2;
        if (['pipx', 'uv', 'poetry', 'pipenv', 'pdm'].includes(prog) && args[1] && args[1].v === 'run') return 2;
        if (prog === 'uv' && args[1] && args[1].v === 'tool' && args[2] && args[2].v === 'run') return 3;
        return 0;
      };
      const isRunner = () => runnerSkip() > 0;
      // True once a package runner (npx, npm exec, uvx, pipx run ...) has been skipped to reach the program:
      // the program may then have been downloaded to run, which the hunt does not allow of an audit tool.
      let viaRunner = false;
      while (WRAPPERS.has(prog) || LAUNCHERS.has(prog) || prog === 'env' || prog === 'timeout' || prog === 'xargs' || isRunner()) {
        if (isRunner()) {
          viaRunner = true;
          args = args.slice(runnerSkip());
          // The runner's own -c/--call STRING (a command string) is only a -c BEFORE the program word:
          // after it, -c belongs to the wrapped program and the normal program rules read it.
          // Fail closed: only the options below, then the program. An option on neither list could take
          // an argument and make it the program.
          const RUNNER_SPEC = {
            flags: new Set(['-y', '--yes', '--no', '--no-install', '-q', '--quiet', '--ignore-existing', '--prefer-offline', '--offline', '--no-project', '--isolated', '--frozen', '--locked', '--no-sync', '--no-cache', '--silent', '-h', '--help', '--version', '--no-warnings']),
            valued: new Set(['-p', '--package', '--node-arg', '--cache', '--userconfig', '--registry', '-w', '--workspace', '--with', '--python', '--directory', '--project', '--with-requirements', '--env-file', '--from', '--spec', '--index-url']),
          };
          let r = 0;
          for (;;) {
            const w = args[r];
            if (!w) break;
            if (w.v === null) return deny('a package runner option or program built from a variable or substitution cannot be verified; spell it out');
            if (w.v === '--') { r += 1; break; }
            if (!w.v.startsWith('-')) break;
            if (w.v.startsWith('--call=')) { walkNested(w.v.slice('--call='.length), dir, container, depth + 1, pgUser); return; }
            if (w.v === '-c' || w.v === '--call') {
              if (!args[r + 1] || args[r + 1].v === null) return deny('a package runner -c runs a command built from a variable; it cannot be verified');
              walkNested(args[r + 1].v, dir, container, depth + 1, pgUser);
              return;
            }
            const eq = w.v.indexOf('=');
            const name = w.v.startsWith('--') && eq !== -1 ? w.v.slice(0, eq) : w.v;
            if (RUNNER_SPEC.flags.has(name) && eq === -1) { r += 1; continue; }
            if (RUNNER_SPEC.valued.has(name)) { r += eq === -1 ? 2 : 1; continue; }
            return deny(`unrecognised option ${w.v} before the package runner's program; run the program directly`);
          }
          args = args.slice(r);
          if (!args.length) return;
          if (args[0].v === null) return deny(PROGRAM_FROM_VAR);
          prog = progName(args[0].v);
          continue;
        }
        if (prog === 'xargs') {
          const tail = skipOptions(args.slice(1), XARGS_VALUE_OPTS);
          const ip = tail.length ? progName(tail[0].v) : '';
          if (WRITE_PROGRAMS.has(ip)) deny(`xargs ${ip} writes to paths that cannot be seen before it runs`);
          if (ip === 'kill') deny('xargs kill signals pids that cannot be seen before it runs; kill takes a literal pid');
          return redispatch(tail, true);
        }
        // Launchers that run a command of their own: the plugin's task-done (PLAN TASK BASE -- COMMAND...), watch and GNU
        // parallel. Their tail is judged as a command, so the curl or wget it runs meets the same egress rule as a direct one.
        // (The hunt is a program allow-list and runs none of them: the launcher itself is not on its list.)
        if (hunt && LAUNCHERS.has(prog)) return deny(HUNT_NOT_LISTED(prog));
        if (prog === 'task-done') {
          const di = args.findIndex((x) => x.v === '--');
          if (di === -1) return; // the script refuses a call without -- and runs nothing
          return redispatch(args.slice(di + 1), true);
        }
        if (prog === 'watch') {
          // watch [options] COMMAND: -n SECONDS (--interval) and -q CYCLES (--equexit) take a value, also in a short cluster
          // (-dn 2); the words are run by `sh -c` as one string, or one by one with -x (--exec).
          let k = 1;
          let viaExec = false;
          while (k < args.length && args[k].v !== null && args[k].v.startsWith('-') && args[k].v !== '-') {
            const v = args[k].v;
            if (v === '--') { k++; break; }
            if (v.startsWith('--')) {
              const name = v.split('=')[0];
              if (name === '--exec') viaExec = true;
              if (['--interval', '--equexit'].includes(name) && !v.includes('=')) k++;
            } else {
              for (let c = 1; c < v.length; c++) {
                if (v[c] === 'x') viaExec = true;
                if (v[c] === 'n' || v[c] === 'q') { if (c === v.length - 1) k++; break; }
              }
            }
            k++;
          }
          const tail = args.slice(k);
          if (!tail.length) return;
          if (viaExec) return redispatch(tail, true);
          if (tail.some((x) => x.v === null)) return deny('watch runs a command built from a variable or substitution; it cannot be verified');
          const text = tail.map((x) => x.v).join(' ');
          psqlCount.words += psqlTokens(text);
          walkNested(text, dir, container, depth + 1, pgUser);
          return;
        }
        if (prog === 'parallel') {
          // parallel [options] COMMAND [::: ARGUMENTS...]: the command runs once per argument. Without a command it reads its
          // commands from stdin, which cannot be inspected.
          const PARALLEL_VALUED = new Set(['-j', '--jobs', '-P', '--procs', '-n', '--max-args', '-N', '-L', '--max-lines', '-a', '--arg-file', '-S', '--sshlogin', '--sshloginfile', '--slf', '-d', '--delimiter', '-C', '--colsep', '-I', '--replace', '-E', '--eof', '--results', '--joblog', '--timeout', '--retries', '--delay', '--workdir', '--wd', '--env', '--header', '--rpl']);
          let k = 1;
          while (k < args.length && args[k].v !== null && args[k].v.startsWith('-') && args[k].v !== '-') {
            if (args[k].v === '--') { k++; break; }
            k += PARALLEL_VALUED.has(args[k].v) ? 2 : 1;
          }
          let end = args.findIndex((x, i) => i >= k && x.v !== null && /^::::?\+?$/.test(x.v));
          if (end === -1) end = args.length;
          const tail = args.slice(k, end);
          if (!tail.length) return autopilot ? deny('parallel with no command reads its commands from stdin, which cannot be inspected; spell the command out') : undefined;
          if (tail.length === 1 && tail[0].v !== null && /\s/.test(tail[0].v)) {
            psqlCount.words += psqlTokens(tail[0].v);
            walkNested(tail[0].v, dir, container, depth + 1, pgUser);
            return;
          }
          return redispatch(tail, true);
        }
        // Tracers and wrappers that run the command they are given (strace, ltrace, script, chronic, faketime, proxychains, torsocks). Their
        // own options are skipped by their table, so the value of one is never taken for the program; the files they write (strace -o, the
        // typescript and the logs of script) are writes; the tail is judged as a command, and script -c STRING as `sh -c STRING`.
        if (['strace', 'ltrace', 'script', 'chronic', 'faketime', 'proxychains', 'proxychains4', 'torsocks'].includes(prog)) {
          const spec = LAUNCHER_OPTS[prog] || { short: '', long: [] };
          const literalWord = (text) => ({ k: 'w', parts: [{ t: 'lit', v: text }] });
          const given = []; // [option, word] for each option that came with a value
          let k = 1;
          // faketime's own options are these flags only: its TIME may start with a dash (-15d), so the first other word is the TIME.
          const FAKETIME_FLAGS = ['-m', '-f', '--exclude-monotonic', '-h', '--help', '--version', '--'];
          while (k < args.length && args[k].v !== null && args[k].v.startsWith('-') && args[k].v !== '-' && (prog !== 'faketime' || FAKETIME_FLAGS.includes(args[k].v))) {
            const v = args[k].v;
            k++;
            if (v === '--') break;
            if (v.startsWith('--')) {
              const eq = v.indexOf('=');
              const name = eq === -1 ? v : v.slice(0, eq);
              if (eq !== -1) given.push([name, literalWord(v.slice(eq + 1))]);
              else if (spec.long.includes(name) && args[k]) { given.push([name, args[k].w]); k++; }
              continue;
            }
            for (let c = 1; c < v.length; c++) {
              // script -t[FILE] takes its value attached only.
              if (prog === 'script' && v[c] === 't') { if (v.length > c + 1) given.push(['-t', literalWord(v.slice(c + 1))]); break; }
              if (!spec.short.includes(v[c])) continue;
              const attached = v.slice(c + 1);
              if (attached) given.push([`-${v[c]}`, literalWord(attached)]);
              else if (args[k]) { given.push([`-${v[c]}`, args[k].w]); k++; }
              break;
            }
          }
          const operands = args.slice(k);
          const written = (names) => given.filter(([n]) => names.includes(n));
          if (prog === 'strace' || prog === 'ltrace') for (const [n, w] of written(['-o', '--output'])) checkTarget(w, dir, `${prog} ${n}`, container);
          if (prog === 'script') {
            for (const [n, w] of written(['-I', '--log-in', '-O', '--log-out', '-B', '--log-io', '-T', '--log-timing', '-t', '--timing'])) checkTarget(w, dir, `script ${n}`, container);
            // The typescript is the first operand, or `typescript` in the working directory.
            checkTarget(operands[0] ? operands[0].w : literalWord('typescript'), dir, 'script typescript file', container);
            const cmdOpt = given.find(([n]) => n === '-c' || n === '--command');
            if (cmdOpt) {
              const text = resolveWord(cmdOpt[1]);
              if (text === null) return deny('script -c runs a command built from a variable; it cannot be verified');
              psqlCount.words += psqlTokens(text);
              walkNested(text, dir, container, depth + 1, pgUser);
              return;
            }
            // BSD script takes the command after the file: script [-q] FILE COMMAND...
            if (operands.length > 1) return redispatch(operands.slice(1), true);
            return deny('script with no -c command opens a shell on its terminal, which cannot be inspected; give the command with -c');
          }
          // faketime takes its TIME before the command; torsocks on, off and show print an environment, shell opens a shell.
          let tail = operands;
          if (prog === 'faketime') tail = operands.slice(1);
          if (prog === 'torsocks' && operands[0] && operands[0].v === 'shell') return deny('torsocks shell opens a shell that cannot be inspected; run the command with torsocks COMMAND');
          if (prog === 'torsocks' && operands[0] && ['on', 'off', 'show'].includes(operands[0].v)) return;
          if (!tail.length) return;
          return redispatch(tail, true);
        }
        if (prog === 'command' && args[1] && ['-v', '-V'].includes(args[1].v)) return;
        args = args.slice(1);
        if (prog === 'env') {
          // env takes any NAME=value word as an assignment, whatever the characters of NAME (BASH_FUNC_x%%=...).
          while (args.length && args[0].v && (/^[^=-][^=]*=/.test(args[0].v) || args[0].v.startsWith('-'))) {
            // -S STRING, --split-string[=STRING] or a short cluster holding S (-iS, -vS, -S0): env
            // splits the string into words with its own escapes, comments and $VAR expansion, so the
            // real command sits in one token. Not modelled: refused.
            if (/^(-[A-Za-z0-9]*S|--split-string)/.test(args[0].v)) return deny('env -S hides the command in one token; run the command directly');
            // -u NAME / --unset NAME and -C DIR / --chdir DIR take the next word as their value.
            if (['-u', '--unset'].includes(args[0].v) && args[1] && args[1].v !== null) shellEnvNames.add(args[1].v);
            const unsetAttached = /^--unset=(.+)$/.exec(args[0].v) || /^-u([^-].*)$/.exec(args[0].v);
            if (unsetAttached) shellEnvNames.add(unsetAttached[1]);
            if (['-u', '--unset', '-C', '--chdir'].includes(args[0].v)) { args = args.slice(2); continue; }
            if (args[0].v.startsWith('PGUSER=')) pgUser = args[0].v.slice('PGUSER='.length);
            if (PSQL_ENV.has(args[0].v.split('=')[0])) psqlEnv = true;
            const envAssign = /^([^=-][^=]*)=/.exec(args[0].v);
            if (envAssign) shellEnvNames.add(envAssign[1]);
            args = args.slice(1);
          }
        } else if (prog === 'timeout') {
          // -s SIGNAL / --signal SIGNAL and -k DURATION / --kill-after DURATION take the next word.
          while (args.length && args[0].v && args[0].v.startsWith('-')) args = args.slice(['-s', '-k', '--signal', '--kill-after'].includes(args[0].v) ? 2 : 1);
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
        } else if (prog === 'flock') {
          // flock [options] LOCKFILE COMMAND...  or  flock [options] LOCKFILE -c 'COMMAND'
          args = skipOptions(args, new Set(['-w', '--timeout', '-E', '--conflict-exit-code']));
          const ci = args.findIndex((x) => x.v === '-c' || x.v === '--command');
          if (ci !== -1) {
            if (!args[ci + 1] || args[ci + 1].v === null) return deny('flock -c runs a command built from a variable; it cannot be verified');
            walkNested(args[ci + 1].v, dir, container, depth + 1, pgUser);
            return;
          }
          args = args.slice(1);
        } else if (prog === 'taskset') {
          // taskset MASK COMMAND...  or  taskset -c LIST COMMAND...
          const listed = args.some((x) => x.v === '-c' || x.v === '--cpu-list');
          args = skipOptions(args, new Set(['-c', '--cpu-list']));
          if (!listed) args = args.slice(1);
        } else if (prog === 'chrt') {
          // chrt [options] PRIORITY COMMAND...
          args = skipOptions(args, new Set());
          args = args.slice(1);
        } else if (prog === 'ionice') {
          args = skipOptions(args, new Set(['-c', '--class', '-n', '--classdata', '-p', '--pid', '-P', '--pgid', '-u', '--uid']));
        } else if (prog === 'doas') {
          args = skipOptions(args, new Set(['-u', '-C']));
        } else if (prog === 'time') {
          // GNU time: -f FORMAT (--format) and -o FILE (--output) take a value, attached or the next word; the FILE is written.
          let k = 0;
          while (k < args.length && args[k].v !== null && args[k].v.startsWith('-') && args[k].v !== '-') {
            const v = args[k].v;
            k++;
            if (v === '--') break;
            const long = /^--(format|output)(=([\s\S]*))?$/.exec(v);
            const short = v.startsWith('--') ? null : /^-[A-Za-z]*?([fo])([\s\S]*)$/.exec(v);
            const which = long ? long[1] : short ? (short[1] === 'f' ? 'format' : 'output') : null;
            if (!which) continue;
            const attached = long ? long[3] : short[2];
            if (which === 'output') {
              if (attached) checkTarget({ k: 'w', parts: [{ t: 'lit', v: attached }] }, dir, 'time -o', container);
              else if (args[k]) checkTarget(args[k].w, dir, 'time -o', container);
            }
            if (!attached) k++;
          }
          args = args.slice(k);
        } else if (prog === 'exec') {
          // exec [-cl] [-a NAME] COMMAND: NAME is what the command is started as, never the command.
          let k = 0;
          while (k < args.length && args[k].v !== null && /^-[A-Za-z]+$/.test(args[k].v)) { if (args[k].v.includes('a')) k++; k++; }
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
      // Every profile: the programs that resolve a name or probe a host open a connection of their own (DNS carries
      // data out as the lookup name); a run reaches the network through its listed tools only.
      if (HOST_PROBE_PROGRAMS.has(prog) || (prog === 'getent' && rest.length && (rest[0].v === null || HOST_DATABASES.has(rest[0].v) || rest.some((x) => x.v !== null && HOST_DATABASES.has(x.v))))) {
        return deny(`${prog} resolves or probes a host; a run reaches the network through its listed tools only`);
      }
      // An autopilot stage starts and ends no QA run or hunt: a run record written from inside the stage outranks the
      // stage's own profile for the rest of its session. Any word that is a path to run-records.mjs (a symlink to it
      // too) is refused whatever the interpreter and options in front of it. The one exception is the stage that is
      // the QA gate (qaGateStage): qa-specialist starts its own QA record there, and run-records.mjs start itself
      // refuses every other profile.
      // A QA run and a hunt run it to end themselves (`end`) or to list the records (`list`), never to start
      // another run: a second record applying to the session would change the profile that guards it (a hunt
      // that starts a QA record leaves its program allow-list behind).
      if ((!autopilot || !qaGateStage) && interpreterKind(prog) === 'js') {
        for (let i = 0; i < rest.length; i += 1) {
          const x = rest[i];
          if (x.v === null || x.v.startsWith('-')) continue;
          let p = normPath(x.v);
          if (!p.startsWith('/')) p = `${dir === null ? rootC : dir}/${p.replace(/^\.\//, '')}`;
          if (/(^|\/)hooks\/lib\/run-records\.mjs$/i.test(posix.normalize(p)) || /(^|\/)hooks\/lib\/run-records\.mjs$/i.test(realCanonical(p, rootC).replace(/\\/g, '/'))) {
            if (autopilot) return deny('an autopilot stage starts and ends no QA run or hunt; the engine owns the envelope');
            // The subcommand as run-records.mjs reads it: the first argument after the script, never a later word.
            const sub = rest[i + 1]?.v;
            if (sub !== 'end' && sub !== 'list') return deny(`${runKind} starts no other run: a second run record would change the profile that guards this session; the run only ends itself (run-records.mjs end) or lists the records`);
            break;
          }
        }
      }
      // A program reads its environment before it runs: a variable set for it by a prefix, an env assignment or
      // env -u, or exported earlier in the command, is refused unless it is on the short list of harmless ones.
      // QA run: every program (a read-only run needs no other variable). Autopilot stage: a shell, an
      // interpreter or another program that runs code (name contains sh, python, node, ...), so that
      // `DATABASE_URL=x npm test` still passes there. psql keeps its own PG* rules (analyzePsql).
      if (!autopilot || AUTOPILOT_ENV_PROGRAMS.test(prog)) {
        const judged = (n) => !(prog === 'psql' && (n === 'PGUSER' || /^(PG|PSQL)/.test(n)));
        if ([...shellEnvNames, ...exportedNames].some((n) => judged(n) && !SAFE_ENV_RE.test(n))) return deny('a variable set for a shell or interpreter can make it run code before the command; only the listed harmless variables pass');
        if ([...vars.keys()].some((n) => judged(n) && EARLIER_ENV_RE.test(n))) return deny('a shell init command or rc file runs code the analyzer does not see');
      }
      const plain = rest.filter((x) => !(x.v || '').startsWith('-'));
      const interpKind = interpreterKind(prog);
      if (interpKind) {
        const why = inlineInterpreterReason(interpKind, prog, rest, { inPlaceOk: autopilot });
        if (why) return deny(why);
      }
      // The hunt: the audit tools it may run, in the forms it may run them, and the commands it refuses
      // (a test suite, a worktree). A listed form is allowed here, after the variable gate and the
      // interpreter rules above and the redirect check at the top, which apply to it as to any command.
      if (hunt && HUNT_NET_PROGRAMS.has(prog.replace(/.(cmd|bat|ps1)$/, ''))) return deny(`the hunt's network is its audit tools and gh api; ${prog} is refused`);
      if (hunt) {
        const h = huntCheck(prog, rest.map((x) => x.v), { viaRunner, interpreter: interpKind });
        if (h && h.reason) return deny(h.reason);
        if (h && h.allow) {
          for (const p of h.outputs) checkTarget({ k: 'w', parts: [{ t: 'lit', v: p }] }, dir, `${prog} output file`, container);
          for (const { path: p, form, opt } of h.prefixes || []) checkProjectDir(p, form, dir, opt);
          return;
        }
      }
      // The hunt is a program allow-list (huntProgramWhy). The rules below still run for what is listed (sort -o, find -exec,
      // the git, gh and glab forms) and for what is not, so a specific refusal of theirs is kept; an unlisted program they
      // let through is refused last, with the list message.
      const unlisted = hunt ? huntProgramWhy(prog, args, interpKind, { dir, rootC, ignoreCase, inArea }) : '';
      const afterGate = () => {
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
          if (!autopilot && !roleVars.includes(x.v)) return deny(`printenv ${x.v} reads a variable that is not a configured role variable; during ${runKind} only the role variables (qa.roles[].userEnv and passwordEnv) are read, and any other is checked with \${NAME:+set}`);
          if (autopilot && (TRACKER_VARS.test(x.v) || SECRET_VARS.test(x.v))) return deny(`printenv ${x.v} would print a credential or secret; an autopilot stage never reads one out, check it with \${NAME:+set}`);
        }
        return;
      }
      // Commands that print the whole environment: set and compgen -e, and export, declare,
      // typeset and readonly when they name nothing to set.
      if (prog === 'set') {
        if (rest.length === 0 && !nullOut) deny(ENV_DUMP);
        // set -a (-o allexport) exports every later assignment with no export word to judge, so the variable
        // gate would never see GH_HOST=evil: refused during a hunt, as a group of short options holding `a` too (-euao).
        if (hunt) {
          for (let k = 0; k < rest.length; k++) {
            const v = rest[k].v;
            if (v === null) return deny('set with an option built from a variable or substitution cannot be verified; a variable set for a shell or interpreter can make it run code before the command, and only the listed harmless variables pass');
            if (/^-[A-Za-z]*a[A-Za-z]*$/.test(v) || (/^-[A-Za-z]*o$/.test(v) && rest[k + 1] && rest[k + 1].v === 'allexport')) {
              return deny('set -a (allexport) exports every later assignment, and a variable set for a shell or interpreter can make it run code before the command; only the listed harmless variables pass, so allexport is refused during the hunt');
            }
          }
        }
        return;
      }
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
        // A folder under /proc is a process's own (/proc/self, /proc/<pid>/task): every file the command reads there after the cd
        // is judged by a name no rule sees as the process environment.
        if (dir !== null && /^\/proc\/./i.test(posix.normalize(dir))) return deny(`${prog} into ${posix.normalize(dir)} puts every later name in a folder of /proc, where environ is the process environment; name the file by its full path (/proc/self/status)`);
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
        const text = rest.map((x) => x.v).join(' ');
        walkNested(text, dir, container, depth + 1, pgUser);
        // eval runs in the current shell: a cd inside it moves every later command.
        if (/(^|[\s;&|(])(cd|pushd|popd)(\s|$|[;&|)])/.test(text)) dir = null;
        return;
      }
      // A sourced script runs in the current shell and may change its directory.
      if (prog === 'source' || prog === '.') { dir = null; return; }
      if (prog === 'helm') {
        // Not modelled: its read verbs (template, install --dry-run, lint, show) take --post-renderer BINARY.
        return deny('helm can run a post-renderer; a QA run or a stage has no use for it');
      }
      if (prog === 'kubectl' || prog === 'oc') {
        // The verb is the first word after the global options; those that take a separate argument
        // (--context X, -n NS, --kubeconfig F, --server S, --token T ...) must be skipped, or the
        // argument is taken for the verb.
        const KUBE_SPEC = {
          flags: new Set(['--insecure-skip-tls-verify', '--warnings-as-errors', '--disable-compression', '-h', '--help', '--version']),
          valued: new Set(['--kubeconfig', '--context', '-n', '--namespace', '--server', '-s', '--token', '--cluster', '--user', '--as', '--as-group', '--as-uid', '--certificate-authority', '--client-certificate', '--client-key', '--cache-dir', '--request-timeout', '--tls-server-name', '--username', '--password', '--profile', '--profile-output', '--log-flush-frequency', '-v', '--v', '--vmodule', '--log-file', '--log-dir']),
        };
        const kubeWalk = walkGlobalOptions(rest, KUBE_SPEC, prog);
        if (kubeWalk.reason) return deny(kubeWalk.reason);
        const g = kubeWalk.idx;
        const top = rest[g];
        if (!top) {
          if (rest.every((x) => x.v !== null && ['--version', '-h', '--help', 'version'].includes(x.v)) ) return;
          return deny(`the ${prog} verb cannot be located after its global options; spell the command plainly`);
        }
        if (top.v === null) return deny(`the ${prog} verb is built from a variable or substitution and cannot be verified; spell it out`);
        const verb = top.v;
        if (verb === 'exec' || verb === 'run') {
          const di = rest.findIndex((x) => x.v === '--');
          if (di === -1) return deny(`${prog} ${verb} without -- cannot be inspected; put -- before the command`);
          return redispatch(rest.slice(di + 1), false);
        }
        const next = rest.slice(g + 1).find((x) => x.v === null || !x.v.startsWith('-'));
        if (['config', 'auth', 'rollout'].includes(verb) && next && next.v === null) return deny(`the ${prog} ${verb} verb is built from a variable or substitution and cannot be verified; spell it out`);
        const READ = new Set(['get', 'describe', 'logs', 'top', 'version', 'cluster-info', 'api-resources', 'api-versions', 'explain', 'events', 'diff', 'wait', 'port-forward']);
        if (verb === 'config' ? ['view', 'get-contexts', 'current-context', 'get-clusters', 'get-users'].includes(next ? next.v : '')
          : verb === 'auth' ? ['can-i', 'whoami'].includes(next ? next.v : '')
          : verb === 'rollout' ? ['status', 'history'].includes(next ? next.v : '')
          : READ.has(verb)) return;
        return deny(`${prog} ${verb}${next && ['config', 'auth', 'rollout'].includes(verb) ? ' ' + next.v : ''} changes the cluster; the stack stays as found, only read verbs (get, describe, logs, top ...) run during ${runKind}`);
      }
      if (prog === 'cmd') {
        // cmd.exe is not modelled: its quoting, its separators (& && || |), its redirects (> >> < >nul 2>&1),
        // %VAR% and !VAR! expansion, ^ escapes and the /c quote-stripping rule all differ from the POSIX
        // walk. Every `cmd /c` and `cmd /k` tail is refused, except a small literal list of reads during a
        // QA run: dir, ver, where WORD, and type PATH inside the project, with none of the characters
        // that give cmd any other meaning.
        const CMD_MSG = 'a cmd.exe command line is not analysed; run the read command directly';
        if (autopilot) return deny(CMD_MSG);
        // Only /c, and as the first word: /k leaves a shell open, and an option before /c (/d /s /v:on) changes the parse.
        if (!rest.length || rest[0].v === null || !/^\/c$/i.test(rest[0].v)) return deny(CMD_MSG);
        const tail = rest.slice(1);
        if (!tail.length || tail.some((x) => x.v === null)) return deny(CMD_MSG);
        const text = tail.map((x) => x.v).join(' ').trim();
        // , ; and = are argument delimiters to cmd (`type,a.txt`, `type=x`): cmd splits the words differently.
        if (/["'&|<>%!^(),;=\r\n\0]/.test(text)) return deny(CMD_MSG);
        const words = text.split(/\s+/);
        const verb = words[0].toLowerCase();
        if (verb === 'dir') return;
        if (verb === 'ver' && words.length === 1) return;
        if (verb === 'where' && words.length === 2 && /^[A-Za-z0-9_.-]+$/.test(words[1])) return;
        // type takes one plain relative path (no wildcard, no drive, no leading separator) inside the project.
        if (verb === 'type' && words.length === 2 && !/[*?]/.test(words[1]) && !/^([A-Za-z]:|[\\/])/.test(words[1]) && dir !== null) {
          const p = `${dir}/${normPath(words[1].replace(/\\/g, '/')).replace(/^\.\//, '')}`;
          if (!p.split('/').includes('..')) {
            const real = realCanonical(p, rootC);
            const inner = rel(real, rootC, ignoreCase);
            if (inner !== null && !KEY_RE.test(inner.toLowerCase())) return;
          }
        }
        return deny(CMD_MSG);
      }
      if (prog === 'pwsh' || prog === 'powershell') {
        // PowerShell is not analysed at all: -Command (and any prefix of it: -c, -co, -cwa), -EncodedCommand
        // (-e, -enc, -ec), -File and a script on stdin are all refused. Only a bare -Version / -Help
        // (nothing to run) is a read.
        if (rest.length && rest.every((x) => x.v !== null && /^-(version|help|\?)$/i.test(x.v))) return;
        return deny('a PowerShell command is not analysed; run the read command directly');
      }
      // cmd.exe's own file commands. Flags are /x or /x:value; the destination is the last operand.
      if (['del', 'erase', 'rd'].includes(prog) && rest.some((x) => x.v !== null && /^\/[sfqSFQ]$/.test(x.v))) return deny(DESTRUCTIVE_WHY);
      if (['del', 'erase', 'rd', 'md', 'copy', 'xcopy', 'move', 'ren', 'rename'].includes(prog)) {
        const ops = rest.filter((x) => x.v === null || !(/^\/[a-zA-Z?](:.*)?$/.test(x.v) || x.v.startsWith('-')));
        const list = ['copy', 'xcopy'].includes(prog) ? ops.slice(-1) : ['move', 'ren', 'rename'].includes(prog) ? ops : ops;
        for (const x of list) checkTarget(x.w, dir, `${prog} operand`, container);
        return;
      }
      if (SHELLS.has(prog)) {
        // Init code runs before the command and is never seen here: fish -C / --init-command (also any
        // short cluster holding C, and an abbreviated long name), bash --rcfile / --init-file, and an
        // ENV= or BASH_ENV= file named for this shell. Refused whatever else the command is.
        const INIT_CODE = 'a shell init command or rc file runs code the analyzer does not see';
        const initOpt = (v) => {
          if (/^--(rcfile|init-file)(=|$)/.test(v)) return true;
          if (/^--init-command(=|$)/.test(v)) return true;
          if (prog === 'fish') {
            // fish takes the value attached to the option: -Cecho, -C"echo x", -lCecho (letters up to a C).
            if (/^-[A-Za-z]*C/.test(v)) return true;
            const m = /^--([a-z-]+)(=|$)/.exec(v);
            if (m && m[1].length >= 2 && 'init-command'.startsWith(m[1])) return true;
          }
          return false;
        };
        if (rest.some((x) => x.v !== null && initOpt(x.v))) return deny(INIT_CODE);
        // -c may be bundled with other short flags (-lc, -ec, -xc); the next word is the command.
        // fish takes the long spelling too: --command CMD, --command=CMD.
        const eqi = rest.findIndex((x) => x.v !== null && x.v.startsWith('--command='));
        if (eqi !== -1) { walkNested(rest[eqi].v.slice('--command='.length), dir, container, depth + 1, pgUser); return; }
        const ci = rest.findIndex((x) => x.v !== null && (/^-[a-zA-Z]*c[a-zA-Z]*$/.test(x.v) || x.v === '--command'));
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
        if (stdinScript(script.v)) return deny(STDIN_FILE_WHY);
        return;
      }
      if (prog === 'docker' || prog === 'docker-compose' || prog === 'podman' || prog === 'podman-compose' || prog === 'nerdctl') {
        // Fail closed (docker, podman, nerdctl, compose): walk the global options and accept only those on
        // a small known list (flag-only or valued); an option that is on neither list could take an
        // argument and shift the subcommand, so it is refused. The verb path (a management noun plus
        // its verb, or one verb) must be literal and in the read set; exec and run go on to the
        // inspection of the command they carry, below.
        {
          const composeProg = prog === 'docker-compose' || prog === 'podman-compose';
          const DOCKER_SPEC = { flags: new Set(['--debug', '-D', '--tls', '--tlsverify', '-v', '--version', '-h', '--help']), valued: new Set(['-H', '--host', '-c', '--context', '--config', '-l', '--log-level', '--tlscacert', '--tlscert', '--tlskey']) };
          if (prog === 'nerdctl') for (const o of ['-n', '--namespace', '-a', '--address']) DOCKER_SPEC.valued.add(o);
          const COMPOSE_SPEC = { flags: new Set(['--verbose', '--compatibility', '--dry-run', '--all-resources', '-h', '--help', '--version', '-v', '--debug']), valued: new Set(['-f', '--file', '-p', '--project-name', '--profile', '--env-file', '--project-directory', '--ansi', '--progress', '--parallel']) };
          const walkGlobals = walkGlobalOptions;
          const NOUN_READ = {
            container: ['ls', 'list', 'ps', 'logs', 'inspect', 'top', 'stats', 'port', 'diff', 'exec'], image: ['ls', 'list', 'inspect', 'history'], volume: ['ls', 'list', 'inspect'], network: ['ls', 'list', 'inspect'],
            system: ['info', 'df', 'events'], context: ['ls', 'list', 'inspect', 'show'], node: ['ls', 'inspect', 'ps'], service: ['ls', 'ps', 'inspect', 'logs'], stack: ['ls', 'ps', 'services'], secret: ['ls', 'inspect'], config: ['ls', 'inspect'], manifest: ['inspect'], plugin: ['ls'], builder: [], buildx: ['ls', 'inspect', 'du'],
          };
          const TOP_READ = new Set(['ps', 'images', 'version', 'info', 'logs', 'inspect', 'top', 'stats', 'events', 'port', 'diff', 'history', 'help', 'exec', 'run']);
          const COMPOSE_READ = new Set(['ps', 'logs', 'config', 'version', 'ls', 'top', 'events', 'images', 'port', 'help', 'exec', 'run']);
          const REMOVE = new Set(['rm', 'kill', 'stop', 'prune', 'rmi', 'remove', 'down']);
          const CHANGE = new Set(['restart', 'start', 'pause', 'unpause', 'update', 'up', 'build', 'create']);
          const verbReason = (who, verb) => (REMOVE.has(verb) ? 'container stop, remove, down or prune is never allowed; the stack stays as found'
            : CHANGE.has(verb) ? 'restarting, starting, rebuilding or pausing containers is never allowed; the stack stays as found'
              : `${who} ${verb} is not on the read allow-list (ps, ls, logs, inspect, images, version, info, top, stats, events, port, diff, history, exec, run); the stack stays as found`);
          const gate = (verbList, set, who) => {
            const v0 = verbList[0];
            if (!v0) return '';
            if (v0.v === null) return `the ${who} subcommand is built from a variable or substitution and cannot be verified; spell it out`;
            if (set.has(v0.v)) return '';
            return verbReason(who, v0.v);
          };
          const first = walkGlobals(rest, composeProg ? COMPOSE_SPEC : DOCKER_SPEC, prog);
          if (first.reason) return deny(first.reason);
          const after = rest.slice(first.idx);
          const top = after[0];
          let why = '';
          if (!top) why = '';
          else if (top.v === null) why = `the ${prog} subcommand is built from a variable or substitution and cannot be verified; spell it out`;
          else if (composeProg) why = gate(after, COMPOSE_READ, prog);
          else if (top.v === 'compose') {
            const second = walkGlobals(after.slice(1), COMPOSE_SPEC, `${prog} compose`);
            why = second.reason || gate(after.slice(1 + second.idx), COMPOSE_READ, `${prog} compose`);
          } else if (Object.prototype.hasOwnProperty.call(NOUN_READ, top.v)) {
            const verb = after[1];
            if (verb && verb.v === null) why = `the ${prog} ${top.v} verb is built from a variable or substitution and cannot be verified; spell it out`;
            else if (verb && !NOUN_READ[top.v].includes(verb.v)) why = verbReason(`${prog} ${top.v}`, verb.v);
          } else why = gate(after, TOP_READ, prog);
          if (why) return deny(why);
        }
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
        if (rest[k] && rest[k].v === null) return deny('the git subcommand is built from a variable or substitution and cannot be verified; spell it out');
        // Every profile: a config key given on the command line (core.fsmonitor, core.pager,
        // diff.external, an alias) names a program git runs, so -c and --config-env turn a read into
        // anything; --exec-path picks the programs git runs. -C, --git-dir and --work-tree name a
        // literal folder inside the project.
        for (let g = 0; g < k; g++) {
          const v = rest[g].v;
          if (v === null) return deny('a git global option built from a variable or substitution cannot be verified; spell it out');
          if (v === '-c' || v.startsWith('--config-env') || v === '--exec-path' || v.startsWith('--exec-path=')) {
            return deny(`git -c and --exec-path can turn any git command into another (a config key names a program git runs); ${autopilot ? 'an autopilot stage runs plain git' : `git runs plain during ${runKind}`}`);
          }
          const dirOpt = ['-C', '--git-dir', '--work-tree'].find((o) => v === o || v.startsWith(`${o}=`));
          if (dirOpt) {
            const valWord = v === dirOpt ? rest[g + 1] : { v: v.slice(dirOpt.length + 1) };
            if (!valWord || valWord.v === null) return deny(`git ${dirOpt} with a folder built from a variable or substitution cannot be verified; spell it out`);
            const raw = valWord.v;
            let p = normPath(raw);
            if (p.startsWith('~')) return deny(`git ${dirOpt} ${raw} is outside the project; git reads the project's repositories only`);
            if (!p.startsWith('/')) {
              if (dir === null) return deny(`git ${dirOpt} ${raw} is relative to a directory the command changed to through a variable; use a literal path`);
              p = `${dir}/${p.replace(/^\.\//, '')}`;
            }
            if (p.split('/').includes('..')) return deny(`git ${dirOpt} ${raw} has a parent-directory segment and cannot be verified`);
            if (rel(realCanonical(p, rootC), rootC, ignoreCase) === null) return deny(`git ${dirOpt} ${raw} is outside the project; git reads the project's repositories only`);
          }
        }
        const sub = rest[k] ? rest[k].v : '';
        const subArgs = rest.slice(k + 1).map((x) => x.v || '');
        if (!sub) return;
        // git takes any unambiguous prefix of a long option (--open for --open-files-in-pager).
        const longIs = (x, name, min) => { if (!x.startsWith('--')) return false; const n = x.slice(2).split('=')[0]; return n.length >= min && name.startsWith(n); };
        // grep -O / --open-files-in-pager runs the program it names on the matching files.
        if (sub === 'grep' && subArgs.some((x) => (/^-[A-Za-z]*O/.test(x) && !x.startsWith('--')) || longIs(x, 'open-files-in-pager', 2))) {
          return deny(`git grep -O (--open-files-in-pager) runs the program it names; during ${runKind} git grep prints its matches`);
        }
        // --ext-diff runs the external diff driver a config names, on any command that prints a diff.
        if (subArgs.some((x) => longIs(x, 'ext-diff', 3))) return deny(`git --ext-diff runs an external diff program; during ${runKind} git prints its own diff`);
        if (autopilot) {
          // An allow-list: the stage commits, branches, stashes and fetches; it never pushes,
          // integrates, discards or reconfigures git.
          // --output (log, diff, show, format-patch ...) writes the file it names, in every subcommand.
          const subWords = rest.slice(k + 1);
          for (let o = 0; o < subWords.length; o++) {
            const v = subWords[o].v;
            if (v === null) continue;
            if (v === '--output' && subWords[o + 1]) { checkTarget(subWords[o + 1].w, dir, `git ${sub} --output`, container); o++; }
            else if (v.startsWith('--output=')) checkTarget({ k: 'w', parts: [{ t: 'lit', v: v.slice('--output='.length) }] }, dir, `git ${sub} --output`, container);
          }
          // The path operands of rm and mv are files the stage deletes, moves or overwrites (and rm --cached
          // stages a deletion the commit carries): each is held to the protected paths like any write.
          // A pathspec file names its operands in a file nobody reads here; a pathspec with magic (:(top).github/x,
          // :/.github/x) names a path the protected patterns cannot match as written: both are refused.
          const PATHSPEC_MAGIC_WHY = 'a pathspec with magic (:...) cannot be checked against the protected paths; spell the path';
          if (sub === 'rm' || sub === 'mv' || sub === 'checkout') {
            for (const x of subWords) {
              if (x.v === null) continue;
              if (longIs(x.v, 'pathspec-from-file', 11) || longIs(x.v, 'pathspec-file-nul', 11)) return deny(`git ${sub} ${x.v.split('=')[0]} reads its operands from a file that cannot be checked against the protected paths; spell the paths on the command line`);
            }
          }
          if (sub === 'rm' || sub === 'mv') {
            let pastDash = false;
            for (const x of subWords) {
              if (!pastDash && x.v === '--') { pastDash = true; continue; }
              if (!pastDash && x.v !== null && x.v.startsWith('-')) continue;
              if (x.v !== null && x.v.startsWith(':')) return deny(PATHSPEC_MAGIC_WHY);
              checkTarget(x.w, dir, `git ${sub} operand`, container);
            }
            return;
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
            // -B / -C reset an existing branch to a commit: a stage that moves the base branch onto its own tip
            // would hide its changes from the gate's documents check. It creates branches with -b / -c only.
            if (subArgs.some((x) => x === '-B' || x === '-C' || x === '--force-create' || /^-[a-zA-Z]*[BC][a-zA-Z]*$/.test(x))) return deny(`git ${sub} -B/-C moves an existing branch onto a commit; an autopilot stage creates a branch with -b or -c and moves none`);
            // git checkout <tree-ish> <path>...: every word after the first positional is a path it overwrites
            // from that tree (-b/-B/-c/-C NAME take a value first).
            if (sub === 'checkout') {
              const subWords = rest.slice(k + 1);
              const positional = [];
              for (let o = 0; o < subWords.length; o++) {
                const v = subWords[o].v;
                if (v !== null && ['-b', '-B', '-c', '-C', '--track', '-t'].includes(v)) { if (!['--track', '-t'].includes(v)) o++; continue; }
                if (v !== null && v.startsWith('-')) continue;
                positional.push(subWords[o]);
              }
              for (const x of positional.slice(1)) {
                if (x.v !== null && x.v.startsWith(':')) return deny(PATHSPEC_MAGIC_WHY);
                checkTarget(x.w, dir, 'git checkout path', container);
              }
            }
            return;
          }
          if (sub === 'stash') {
            if (subArgs.length === 0 || ['list', 'show', 'pop', 'apply'].includes(subArgs[0])) return;
            if (subArgs[0] === 'push' || subArgs[0] === 'save') {
              // --all and --include-untracked (-a, -u) carry the ignored and the untracked files out of the tree, the
              // run marker of this very stage among them, and a pathspec names what is stored: the stage sets its
              // work aside with plain `git stash push [-m MESSAGE]`.
              const STASH_WHY = 'git stash push with --all, --include-untracked (-a, -u) or a pathspec stores the ignored files of the tree, the stage\'s own run marker among them; an autopilot stage uses plain git stash push [-m message]';
              const stashWords = rest.slice(k + 2);
              let pastDash = false;
              for (let o = 0; o < stashWords.length; o++) {
                const v = stashWords[o].v;
                if (v === null) return deny('a git stash argument built from a variable or substitution cannot be verified; spell it out');
                if (pastDash) return deny(STASH_WHY);
                if (v === '--') { pastDash = true; continue; }
                if (v.startsWith('--')) {
                  if (longIs(v, 'all', 1) || longIs(v, 'include-untracked', 1) || longIs(v, 'pathspec-from-file', 11) || longIs(v, 'pathspec-file-nul', 11)) return deny(STASH_WHY);
                  if (longIs(v, 'message', 1) && !v.includes('=')) o++;
                  continue;
                }
                if (v.startsWith('-') && v !== '-') {
                  for (let c = 1; c < v.length; c++) {
                    if (v[c] === 'a' || v[c] === 'u') return deny(STASH_WHY);
                    if (v[c] === 'm') { if (c === v.length - 1) o++; break; }
                  }
                  continue;
                }
                // `save` takes its message as a word; `push` takes only pathspecs.
                if (subArgs[0] === 'push') return deny(STASH_WHY);
              }
              return;
            }
            return deny(`git stash ${subArgs[0]} discards or rewrites work; an autopilot stage never discards`);
          }
          if (sub === 'worktree') {
            if (subArgs[0] === 'add') {
              // The new worktree's folder is a write: inside the workspace, nothing protected.
              const subWords = rest.slice(k + 2);
              const where = subWords.find((x, o) => (x.v === null || !x.v.startsWith('-')) && !(o > 0 && subWords[o - 1].v !== null && ['-b', '-B', '--reason'].includes(subWords[o - 1].v)));
              if (where) checkTarget(inDir(where.w), dir, 'git worktree add folder', container);
              return;
            }
            if (['list', 'lock', 'unlock'].includes(subArgs[0])) return;
            return deny(`git worktree ${subArgs[0] || ''} removes or moves a worktree; the engine cleans up after the pull requests`);
          }
          if (sub === 'config') return deny('git config can define an alias or change the remote; the project config stays as it is during an autopilot stage');
          return deny(`git ${sub} is not on the autopilot allow-list; the engine pushes and integrates, nothing discards work, and an alias is not run`);
        }
        if (hunt && sub === 'worktree' && subArgs[0] === 'add') return deny(HUNT_NO_SUITE);
        if (GIT_READ_ONLY.has(sub)) {
          if (subArgs.some((x) => x === '--output' || x.startsWith('--output='))) deny('git --output writes a file; redirect into reviews/<id>/artifacts/ instead');
          return;
        }
        if (sub === 'branch' && subArgs.every((x) => ['--show-current', '-a', '-r', '--list', '-v', '-vv', '--all', '--remotes'].includes(x))) return;
        if (sub === 'stash' && ['list', 'show'].includes(subArgs[0])) return;
        if (sub === 'remote' && (subArgs.length === 0 || ['-v', 'show', 'get-url'].includes(subArgs[0]))) return;
        if (sub === 'config' && subArgs.some((x) => ['--get', '--list', '-l', '--get-all', '--get-regexp'].includes(x))) return;
        if (sub === 'worktree' && subArgs[0] === 'list') return;
        return deny(`git ${sub} changes a repository; only read-only git commands run during ${runKind}`);
      }
      if (['awk', 'gawk', 'mawk', 'nawk'].includes(prog)) {
        // An awk program can run a command (system(), a pipe, getline from a command) or write a file
        // (print > "f"); -i inplace rewrites its operands.
        const AWK_VALUED = new Set(['-F', '-v', '-f', '-i', '-e', '-W', '--field-separator', '--assign', '--file', '--include', '--source']);
        const AWK_PROGRAM_FILE_WHY = 'an awk program file cannot be inspected; give the program inline';
        const AWK_PROGRAM_VAR_WHY = 'an awk program built from a variable or substitution cannot be inspected; give the program inline';
        const texts = [];
        for (let k = 0; k < rest.length; k++) {
          const v = rest[k].v;
          if (v === null) {
            // An option with its value attached to an expansion (-F"$SEP") is skipped; any other word built at run
            // time is the program (or the next word is, after -e) and cannot be read.
            const first = rest[k].w.parts[0];
            if (first && first.t === 'lit' && first.v.startsWith('-')) continue;
            if (texts.length === 0) return deny(AWK_PROGRAM_VAR_WHY);
            break;
          }
          if (v === '-i' || v.startsWith('--inplace') || v === '--include=inplace') return deny('awk -i inplace rewrites files that cannot be seen before it runs; edit through the file tools');
          if (v === '-f' || v === '--file' || v.startsWith('--file=') || /^-f./.test(v)) return deny(AWK_PROGRAM_FILE_WHY);
          if (v === '-e' || v === '--source') { if (rest[k + 1] && rest[k + 1].v !== null) texts.push(rest[k + 1].v); else return deny(AWK_PROGRAM_VAR_WHY); k++; continue; }
          if (AWK_VALUED.has(v)) { k++; continue; }
          if (v.startsWith('-')) continue;
          if (texts.length === 0) texts.push(v);
          break;
        }
        for (const text of texts) {
          if (/\bsystem\s*\(|\|\s*&|\|\s*getline|\bprintf?\b[^;}\n]*\|\s*[^|\s]|\bprintf?\b[^;}\n]*>>?\s*\S|["')]\s*\|\s*getline|\bgetline\b[^;}\n]*<\s*\S/.test(text)) return deny('an awk program with system(), a pipe, getline from a command or an output redirect runs or writes outside the write rules; use a plain pipeline');
          // ENVIRON is the environment as an array: ENVIRON["GH_TOKEN"] prints a credential.
          if (/\bENVIRON\b/.test(text)) return deny(`an awk program that reads ENVIRON prints the environment; ${runKind} checks a variable with \${NAME:+set}`);
        }
        return;
      }
      // envsubst expands every ${NAME} of its input from the environment: a credential prints through it. Every profile.
      if (prog === 'envsubst') return deny(`envsubst prints the environment variables it expands; ${runKind} checks a variable with \${NAME:+set}`);
      // jq and yq read the environment too ($ENV, env, env(), strenv(), envsubst): every profile, as the hunt did. The
      // word `env` is refused as a whole identifier wherever it stands ([env], {a:env}, env.PATH, | envsubst); a field
      // named environment or .envelope, a .env field access and a plain data file name (env.json) are not the builtin.
      if (prog === 'jq' || prog === 'yq') {
        // -f and --from-file take the program from a file, also in a short cluster (-nf): the rules below read inline programs
        // only, and a file can hold env, $ENV or strenv. jq reads any single-dash word that holds an f as -f.
        if (rest.some((x) => x.v !== null && (/^--from-file(=|$)/.test(x.v) || /^-[A-Za-z0-9]*f/.test(x.v)))) return deny(`a ${prog} -f or --from-file program comes from a file the guard does not read, and a program can read the environment (env, $ENV, strenv); give the program inline during ${runKind}`);
        const ENV_TOKEN = /\$ENV\b|(^|[^A-Za-z0-9_$.])(str)?env(subst)?($|[^A-Za-z0-9_])/;
        const DATA_FILE = /^[A-Za-z0-9_@~+/.-]+\.(json|ya?ml|toml|xml|csv|tsv|properties|ini|txt|md|lock)$/i;
        // A double-quoted string literal is data unless it interpolates (\(env) runs code): select(.name=="env") is a read.
        const unquoted = (v) => v.replace(/"(?:[^"\\]|\\.)*"/g, (m) => (m.includes('\\(') ? m : '""'));
        const text = rest.map((x) => x.v).filter((v) => v !== null && !DATA_FILE.test(v)).map(unquoted);
        if (text.some((v) => ENV_TOKEN.test(v))) return deny(`a ${prog} expression that reads the environment (env, $ENV, strenv, envsubst) prints it; ${runKind} checks a variable with \${NAME:+set}`);
      }
      // yq -i (--inplace, kislyuk's --in-place) rewrites its file operands and -s (--split-exp) writes the files its expression names, in any
      // short cluster (-ie, -iP, -i=true, -s.a): a write, judged like sed -i. A QA run and a hunt make none; an
      // autopilot stage holds each file operand to the protected paths, and writes no split files (their names are
      // the value of an expression).
      if (prog === 'yq') {
        let inplace = false;
        let split = false;
        let fromFile = false;
        const positional = [];
        for (let k = 0; k < rest.length; k++) {
          const v = rest[k].v;
          if (v === null) { positional.push(rest[k]); continue; }
          if (v === '--') { positional.push(...rest.slice(k + 1)); break; }
          if (v.startsWith('--')) {
            const name = v.split('=')[0];
            if (name === '--inplace' || name === '--in-place') inplace = true;
            else if (name === '--split-exp') { split = true; if (!v.includes('=')) k++; }
            else if (name === '--from-file') { fromFile = true; if (!v.includes('=')) k++; }
            else if (['--input-format', '--output-format', '--indent', '--expression'].includes(name) && !v.includes('=')) k++;
            continue;
          }
          if (v.startsWith('-') && v !== '-') {
            // i is in-place, s the split expression; p, o, I and f take a value (attached, or the next word).
            for (let c = 1; c < v.length; c++) {
              const ch = v[c];
              if (ch === 'i') inplace = true;
              else if (ch === 's') { split = true; if (c === v.length - 1) k++; break; }
              else if ('poIf'.includes(ch)) { if (ch === 'f') fromFile = true; if (c === v.length - 1) k++; break; }
              else if (ch === '=') break;
            }
            continue;
          }
          positional.push(rest[k]);
        }
        if (inplace || split) {
          if (!autopilot) return deny(`yq ${split ? '-s (--split-exp)' : '-i (--inplace)'} writes files; the code under test is read-only during ${runKind}`);
          if (split) return deny('yq -s (--split-exp) writes files named by its expression, which cannot be checked against the protected paths; during an autopilot stage use yq -i on a named file');
          // yq [e|eval|ea|eval-all] EXPRESSION FILE...: with -f every operand is a file.
          const first = positional[0] && positional[0].v !== null && ['e', 'eval', 'ea', 'eval-all'].includes(positional[0].v) ? 1 : 0;
          for (const x of positional.slice(fromFile ? first : first + 1)) checkTarget(x.w, dir, 'yq -i target', container);
        }
      }
      if (prog === 'sed') {
        // The w and e commands (and the w and e flags of s) write a file or run a command without -i.
        const scripts = [];
        let haveE = false;
        for (let k = 0; k < rest.length; k++) {
          const v = rest[k].v;
          if (v === null) continue;
          if (v === '-e' || v === '--expression') { haveE = true; if (rest[k + 1] && rest[k + 1].v !== null) scripts.push(rest[k + 1].v); k++; continue; }
          if (/^-e./.test(v)) { haveE = true; scripts.push(v.slice(2)); continue; }
          if (v.startsWith('--expression=')) { haveE = true; scripts.push(v.slice('--expression='.length)); continue; }
          if (v === '-f' || v === '--file') { k++; continue; }
        }
        if (!haveE) { const first = plain[0]; if (first && first.v !== null) scripts.push(first.v); }
        for (const s of scripts) {
          if (/(^|[;{}\n])\s*(\d+|\$|\/[^/\n]*\/)?(,\s*(\d+|\$|\/[^/\n]*\/))?\s*!?\s*[weWE](\s|$)/.test(s) || /\bs(.)(?:(?!\1).)*\1(?:(?!\1).)*\1[a-zA-Z0-9]*[we]/.test(s)) return deny(`sed's w and e commands write a file or run a command outside the write rules; ${autopilot ? 'edit through the file tools' : 'redirect into reviews/<id>/artifacts/ instead'}`);
        }
      }
      if (prog === 'sed' || prog === 'perl' || prog === 'ruby') {
        const inPlace = rest.some((x) => x.v && (x.v === '--in-place' || x.v.startsWith('--in-place=') || /^-[A-Za-z]*i/.test(x.v)));
        if (inPlace && !autopilot) deny(`${prog} -i edits files in place; the code under test is read-only during ${runKind}`);
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
        if (!autopilot) return deny(`truncate changes a file; the code under test is read-only during ${runKind}`);
        for (const x of plain) if (x.v && !/^-/.test(x.v) && !/^[0-9]+[kmg]?$/i.test(x.v)) checkTarget(x.w, dir, 'truncate target', container);
        return;
      }
      // grep --include=GLOB (and rg -g, --glob, --iglob) picks the files whose content is searched: a pattern that can
      // name key material reads it, with the dot rule of the program's own glob (see programGlobReachesKey).
      if (['grep', 'egrep', 'fgrep', 'rgrep', 'rg'].includes(prog)) {
        // A recursive search that starts at /proc reads the environ file of every process under it. The first word that is no
        // option is the pattern (unless -e or -f gives it), so the operands are the ones after it.
        const recursive = prog === 'rg' || prog === 'rgrep' || rest.some((x) => x.v !== null && (/^-[A-Za-z]*[rR][A-Za-z]*$/.test(x.v) || /^--(recursive|dereference-recursive|directories=recurse)$/.test(x.v)));
        const hasPattern = rest.some((x) => x.v !== null && (/^-[A-Za-z]*[ef]$/.test(x.v) || /^--(regexp|file)(=|$)/.test(x.v)));
        const operands = rest.filter((x) => x.v === null || !x.v.startsWith('-')).slice(hasPattern ? 0 : 1);
        if (recursive && operands.some((x) => {
          if (x.v === null) return false;
          const p = normPath(x.v);
          const abs = p.startsWith('/') ? p : p.startsWith('~') || dir === null ? '' : `${dir}/${p}`;
          return /^\/proc$/i.test(posix.normalize(abs || '/'));
        })) deny(`a recursive ${prog} that starts at /proc reads the environ file of every process under it, which is blocked during ${runKind}; name the file you need (/proc/self/status)`);
        for (let k = 0; k < rest.length; k++) {
          const v = rest[k].v;
          if (v === null) continue;
          let pat = null;
          const longEq = /^--(include|glob|iglob)=([\s\S]*)$/.exec(v);
          if (longEq) pat = longEq[2];
          else if (['--include', '--glob', '--iglob'].includes(v) || (prog === 'rg' && v === '-g')) pat = rest[k + 1] ? rest[k + 1].v : null;
          else if (prog === 'rg' && /^-g.+/.test(v)) pat = v.slice(2);
          if (pat !== null && programGlobReachesKey(pat)) deny(`a ${prog} file pattern (${pat}) can name key material, which is never read, searched, uploaded or written during ${runKind}; name the file`);
        }
      }
      if (prog === 'find') {
        // -delete removes every match: refused in every profile, like a recursive rm.
        if (rest.some((x) => x.v === '-delete')) return deny(DESTRUCTIVE_WHY);
        // -name, -iname, -path and -ipath patterns match a leading dot with * and ?: a pattern that can name key material
        // lets -exec or -fprint read it (find . -name '?env' -exec cat {} +).
        const NAME_TESTS = ['-name', '-iname', '-path', '-ipath', '-wholename', '-iwholename'];
        const patterns = [];
        for (let k = 0; k < rest.length - 1; k++) if (NAME_TESTS.includes(rest[k].v) && rest[k + 1].v !== null) patterns.push(rest[k + 1].v);
        for (const pat of patterns) if (programGlobReachesKey(pat)) deny(`a find pattern (${pat}) can name key material, which is never read, searched, uploaded or written during ${runKind}; name the file`);
        // The starting points are the words before the first expression word. /proc holds every process environment
        // (/proc/<pid>/environ): a search that starts there, or one that starts at / or at an unknown folder and looks
        // for a name that can be environ, finds and reads them.
        let first = 0;
        while (first < rest.length) {
          const v = rest[first].v;
          if (v === '-D') { first += 2; continue; }
          if (v !== null && (v === '-H' || v === '-L' || v === '-P' || /^-O[0-3]$/.test(v))) { first++; continue; }
          break;
        }
        const starts = [];
        for (let k = first; k < rest.length; k++) {
          const v = rest[k].v;
          if (v !== null && (v.startsWith('-') || v === '(' || v === '!')) break;
          starts.push(v === null ? null : normPath(v));
        }
        const absOf = (p) => (p === null ? null : p.startsWith('/') ? posix.normalize(p) : p.startsWith('~') ? p : dir === null ? null : posix.normalize(`${dir}/${p.replace(/^\.\//, '')}`));
        const mayEnviron = patterns.some((pat) => globMayMatch(normPath(pat).split('/').pop(), 'environ'));
        for (const p of (starts.length ? starts.map(absOf) : [dir])) {
          if (p !== null && /^\/proc(\/|$)/i.test(p)) { deny(`find under /proc (${p}) can read a process environment (/proc/<pid>/environ), which is blocked during ${runKind}`); break; }
          if ((p === null || p === '/') && mayEnviron) { deny(`find for a name that can be environ from ${p === null ? 'a folder that is not known' : '/'} reaches /proc/<pid>/environ, which is blocked during ${runKind}`); break; }
        }
        // -fprint, -fprint0, -fprintf and -fls write the file named by the next word.
        for (let k = 0; k < rest.length - 1; k++) {
          if (['-fprint', '-fprint0', '-fprintf', '-fls'].includes(rest[k].v)) checkTarget(rest[k + 1].w, dir, `find ${rest[k].v}`, container);
        }
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
      // HTTP clients whose options the egress check does not read: an autopilot stage uses curl or wget.
      if (autopilot && ['http', 'https', 'httpie', 'xh', 'xhs', 'aria2c', 'axel', 'lynx', 'links', 'w3m', 'elinks'].includes(prog)) return deny(`${prog} is not run by an autopilot stage; curl and wget reach the hosts in qa.hosts.allowed`);
      // Killing by name reaches the app under test; a targeted `kill <pid>` of the run's own background
      // suite stays allowed (a pid is a positive number written out, not a pgrep or a group).
      if (['pkill', 'killall', 'killall5', 'skill', 'taskkill', 'stop-process'].includes(prog) || (prog === 'fuser' && rest.some((x) => x.v !== null && /^-[a-zA-Z]*k/.test(x.v)))) {
        return deny('killing processes by name is blocked; the stack stays as found');
      }
      // Remote shells and copies, however the program is quoted or wrapped (the hook's text rule reads
      // the bare spelling).
      if (['ssh', 'scp', 'sftp', 'rsync', 'telnet', 'nc', 'ncat', 'netcat', 'socat', 'ftp', 'tftp', 'lftp', 'sshpass', 'mosh', 'rsh', 'rcp', 'ssh-copy-id', 'sshfs'].includes(prog)) {
        return deny('remote shell or copy is blocked');
      }
      if (['chmod', 'chown', 'chgrp', 'icacls', 'takeown', 'setfacl', 'attrib', 'cacls', 'xattr', 'chattr'].includes(prog)) {
        return deny('permission or ownership change is blocked');
      }
      // The forge token is never read out, in any profile: `gh auth token` prints it, and `auth status` prints it with
      // -t or --show-token, also inside a short cluster (-th, -ta) and through a quote split (--show-tok""en), which the
      // hook's text rule cannot read. A word built at run time could be either, so it is refused too.
      if (prog === 'gh' || prog === 'glab') {
        let g = 0;
        while (g < rest.length && rest[g].v !== null && rest[g].v.startsWith('-')) g += ['-R', '--repo', '--hostname'].includes(rest[g].v) ? 2 : 1;
        if (rest[g] && rest[g].v === 'auth') {
          const authWords = rest.slice(g + 1);
          const verb = authWords.find((x) => x.v === null || !x.v.startsWith('-'));
          if (verb && verb.v === null) return deny(`the ${prog} auth verb is built from a variable or substitution and cannot be verified; spell it out`);
          if (verb && verb.v === 'token') return deny(`reading the tracker token is never allowed during ${runKind}`);
          if (verb && verb.v === 'status') {
            for (const x of authWords) {
              if (x.v === null) return deny(`${prog} auth status with an argument built from a variable or substitution cannot be verified (-t and --show-token print the token); spell it out`);
              if (x.v === '--show-token' || x.v.startsWith('--show-token=') || (!x.v.startsWith('--') && /^-[A-Za-z]*t/.test(x.v))) return deny(`reading the tracker token is never allowed during ${runKind}`);
            }
          }
        }
        // config get prints a configuration value: glab config get token (also --host H) and gh config get oauth_token are the token.
        if (rest[g] && rest[g].v === 'config') {
          const cfgWords = rest.slice(g + 1);
          const verbAt = cfgWords.findIndex((x) => x.v === null || !x.v.startsWith('-'));
          if (verbAt !== -1 && cfgWords[verbAt].v === null) return deny(`the ${prog} config verb is built from a variable or substitution and cannot be verified; spell it out`);
          if (verbAt !== -1 && cfgWords[verbAt].v === 'get') {
            for (const x of cfgWords.slice(verbAt + 1)) {
              if (x.v === null) return deny(`${prog} config get with a key built from a variable or substitution cannot be verified (a token key prints the token); spell it out`);
              if (/token|secret|password|credential/i.test(x.v)) return deny(`reading the tracker token is never allowed during ${runKind}`);
            }
          }
        }
      }
      if ((autopilot || hunt) && (prog === 'gh' || prog === 'glab')) {
        const listName = autopilot ? 'autopilot' : 'hunt';
        const trackerWhy = autopilot ? 'the engine writes back between stages' : 'the hunt reports in its own files and never writes to a tracker';
        // The tracker belongs to the engine: a stage runs the read verbs below and nothing else. The
        // hook's text rules read the bare spellings of the write verbs; this reads the words as the
        // CLI does (quoting undone), and an unknown group or verb (alias set, extension install, run
        // rerun, gist create ...) is refused rather than judged by a deny-list.
        const READ = hunt ? HUNT_TRACKER_READ[prog] : prog === 'gh'
          ? { issue: ['view', 'list', 'status'], pr: ['view', 'list', 'status', 'diff', 'checks'], repo: ['view', 'list'], run: ['view', 'list', 'watch'], workflow: ['view', 'list'], release: ['view', 'list'], label: ['list'], gist: ['view', 'list'], project: ['view', 'list', 'field-list', 'item-list'], cache: ['list'], secret: ['list'], variable: ['list', 'get'], ruleset: ['list', 'view', 'check'], config: ['get', 'list'], alias: ['list'], extension: ['list', 'search', 'browse'], auth: ['status'], 'ssh-key': ['list'], 'gpg-key': ['list'], org: ['list'], api: '*', search: '*', status: '*', browse: '*', help: '*', version: '*', completion: '*' }
          : { issue: ['view', 'list'], mr: ['view', 'list', 'diff'], ci: ['status', 'view', 'list', 'trace', 'lint', 'get'], repo: ['view', 'list'], release: ['view', 'list'], label: ['list'], variable: ['list', 'get'], auth: ['status'], api: '*', help: '*', version: '*', completion: '*' };
        // A stage calls the host the CLI is signed in to: another host would carry the call, and anything in its path
        // or query, to a server no host list names (--hostname, GH_HOST, GLAB_HOST, a URL given to api). The hunt refuses
        // --hostname on every call; an autopilot stage only on api (gh auth status --hostname H names the host to ask about).
        const hostnameOpt = rest.some((x) => x.v !== null && /^--hostname(=|$)/.test(x.v));
        if (hunt && hostnameOpt) return deny(`${prog} --hostname names another host for the call; the hunt's api calls are a path on the host ${prog} is signed in to`);
        const hostEnv = [...shellEnvNames, ...exportedNames].find((n) => /^(GH_HOST|GLAB_HOST|GITLAB_HOST|GITLAB_URI|GITLAB_API_HOST|GL_HOST|GITHUB_API_URL)$/i.test(n));
        if (hostEnv) return deny(`${hostEnv} names another host for the ${prog} call; ${listName} api calls are a path on the host ${prog} is signed in to`);
        // GH_REPO and GLAB_REPO name the repository of every call, and with a HOST/ part the host: refused like the host variables.
        const repoEnv = [...shellEnvNames, ...exportedNames].find((n) => /^(GH_REPO|GLAB_REPO)$/i.test(n));
        if (repoEnv) return deny(`${repoEnv} names the repository (and a HOST/ part, the host) for the ${prog} call; ${listName} calls reach the repository ${prog} resolves from the checkout, on the host it is signed in to`);
        // A URL given as an argument (gh issue view URL, --repo URL, -RURL) names its own host: reached only when qa.hosts.allowed lists it
        // (an autopilot stage), never in a hunt, as the URL of a gh api call is refused below.
        for (const x of rest) {
          const m = x.v === null ? null : /^(?:-[A-Za-z]|--[a-z-]+=)?(https?:\/\/.*)$/i.exec(x.v);
          if (!m) continue;
          const urlHostName = urlHost(m[1]);
          if (urlHostName === null || !(autopilot && allowedHosts.includes(urlHostName))) return deny(`${prog} with a URL (${m[1].slice(0, 40)}) names its own host${autopilot ? ', which qa.hosts.allowed does not list' : ''}; ${listName} calls reach the host ${prog} is signed in to (give the number or OWNER/REPO${autopilot ? ', or list the host in qa.hosts.allowed' : ''})`);
        }
        if (prog === 'gh') {
          // gh -R [HOST/]OWNER/REPO: a repository with three parts names the host too. (glab's three parts are a subgroup.)
          for (let k = 0; k < rest.length; k++) {
            const v = rest[k].v;
            if (v === null) continue;
            const val = v === '-R' || v === '--repo' ? (rest[k + 1] ? rest[k + 1].v : null) : v.startsWith('--repo=') ? v.slice('--repo='.length) : /^-R./.test(v) ? v.slice(2) : null;
            if (val && val.split('/').length >= 3) return deny(`gh -R ${val} names another host for the call (HOST/OWNER/REPO); ${listName} calls reach the host gh is signed in to`);
          }
        }
        let g = 0;
        while (g < rest.length && rest[g].v !== null && rest[g].v.startsWith('-')) g += ['-R', '--repo', '--hostname'].includes(rest[g].v) ? 2 : 1;
        const group = rest[g];
        if (!group) return; // only flags: --version, --help
        if (group.v === null) return deny(`the ${prog} command is built from a variable or substitution and cannot be verified; spell it out`);
        if (hostnameOpt && group.v === 'api') return deny(`${prog} api --hostname names another host for the call; ${listName} api calls are a path on the host ${prog} is signed in to`);
        const spec = Object.prototype.hasOwnProperty.call(READ, group.v) ? READ[group.v] : undefined;
        if (spec === undefined) return deny(`${prog} ${group.v} is not on the ${listName} read allow-list; ${trackerWhy}`);
        if (group.v === 'api') {
          // api is a read only without a method and without a body: -X/--method/--request other than
          // GET, -f/-F/--field/--raw-field/--input/-d/--data (any spelling, attached or not), a
          // Content-Type header, graphql (a POST) and a mutation word in any field.
          const apiWords = rest.slice(g + 1);
          for (let k = 0; k < apiWords.length; k++) {
            const v = apiWords[k].v;
            if (v === null) return deny(`${prog} api with an argument built from a variable or substitution cannot be verified; spell it out`);
            if (v.includes('://')) return deny(`${prog} api with a URL (${v.slice(0, 40)}) can reach a host no list sees and carry data in its query; ${listName} api calls are a path on the host ${prog} is signed in to`);
            const m = /^(?:-X|--method|--request)(?:=(.*))?$/i.exec(v) || (/^-X(.+)$/.exec(v) ? [v, /^-X(.+)$/.exec(v)[1]] : null);
            if (m) {
              const methodWord = m[1] !== undefined ? m[1] : (apiWords[k + 1] ? apiWords[k + 1].v : null);
              if (methodWord === null || String(methodWord).toUpperCase() !== 'GET') return deny(`${prog} api with a method other than GET writes to the tracker; ${trackerWhy}`);
              if (m[1] === undefined) k++;
              continue;
            }
            if (/^(-f|-F|--field|--raw-field|--input|-d|--data)([=].*)?$/.test(v) || /^-[fFd].+/.test(v) || /^--(field|raw-field|input|data)=/.test(v)) return deny(`${prog} api with a field, a body or input is a write; ${trackerWhy}`);
            if (/^(-H|--header)$/i.test(v) && apiWords[k + 1] && apiWords[k + 1].v !== null && /content-type/i.test(apiWords[k + 1].v)) return deny(`${prog} api with a Content-Type header carries a body; ${trackerWhy}`);
            if (/^-H.*content-type/i.test(v) || /^--header=.*content-type/i.test(v)) return deny(`${prog} api with a Content-Type header carries a body; ${trackerWhy}`);
            if (/mutation/i.test(v)) return deny(`${prog} api with a mutation is a write; ${trackerWhy}`);
            if (v === 'graphql') return deny(`${prog} api graphql is a POST; run the read through a REST endpoint or a gh read verb`);
          }
          return;
        }
        if (spec === '*') return;
        const verbWord = rest.slice(g + 1).find((x) => x.v === null || !x.v.startsWith('-'));
        if (!verbWord) return;
        if (verbWord.v === null) return deny(`the ${prog} ${group.v} verb is built from a variable or substitution and cannot be verified; spell it out`);
        if (autopilot && ['download', 'clone'].includes(verbWord.v)) return deny(`${prog} ${group.v} ${verbWord.v} writes files into the working tree that no rule can check against the protected paths; an autopilot stage reads the tracker and never downloads or clones`);
        if (!spec.includes(verbWord.v)) return deny(`${prog} ${group.v} ${verbWord.v} is not on the ${listName} read allow-list; ${trackerWhy}`);
        return;
      }
      if (prog === 'kill') {
        // Every target is a pid written out in the command: the analyzer cannot know which pids the
        // stage started, so a variable ($!, $PID), a substitution (kill $(pgrep x), $(cat pid)), a
        // process group (-123, 0) and -1 (every process, however it is spelled) are refused.
        // Shape: kill [-SIGNAL | -s SIG | -n NUM] PID... with every PID a literal positive integer other
        // than 1. The signal option and a negative pid look alike, so none is modelled: after the one
        // signal option every word must be a pid, and `--`, 0, 1, a negative number and a name are refused.
        let signalSeen = false;
        for (let k = 0; k < rest.length; k++) {
          const v = rest[k].v;
          if (v === null) return deny('kill with a target that is not written out (a variable, a substitution, a file) is a kill by name or by a pid nobody can see; kill takes a literal pid');
          if (v === '-l' || v === '-L' || v === '--list' || v === '-t' || v === '--table') return;
          if (!signalSeen && ['-s', '-n', '--signal'].includes(v)) { signalSeen = true; k++; continue; }
          if (!signalSeen && v.startsWith('--signal=')) { signalSeen = true; continue; }
          if (!signalSeen && v !== '-1' && /^-([A-Za-z]+|[0-9]+)$/.test(v)) { signalSeen = true; continue; }
          if (!/^(?!1$)[1-9][0-9]*$/.test(v)) return deny(`kill ${v} is not a literal positive pid; "--", 0, 1, a negative pid or process group (-1, -123) and a name are blocked`);
        }
        return;
      }
      if (prog === 'patch') {
        // The files a diff names are inside the diff; --dry-run (and -C/--check) changes nothing.
        if (rest.some((x) => x.v !== null && ['--dry-run', '-C', '--check'].includes(x.v))) return;
        return deny(`patch writes the files its diff names, which cannot be seen before it runs; during ${runKind} edit files through the file tools`);
      }
      if (prog === 'tar' || prog === 'bsdtar') {
        // Extracting writes under -C DIR (the working directory when none); creating, appending and
        // updating write the archive named by -f. -O / --to-stdout extracts nowhere.
        let extract = false; let create = false; let stdoutOnly = false; let file = null; let into = null;
        const word = (k) => (rest[k + 1] ? rest[k + 1].w : null);
        for (let k = 0; k < rest.length; k++) {
          const v = rest[k].v;
          if (v === null) continue;
          if (v === '--extract' || v === '--get') extract = true;
          else if (v === '--create' || v === '--append' || v === '--update') create = true;
          else if (v === '--to-stdout') stdoutOnly = true;
          else if (v === '--file' || v === '-f') { file = word(k); k++; }
          else if (v.startsWith('--file=')) file = { k: 'w', parts: [{ t: 'lit', v: v.slice('--file='.length) }] };
          else if (v === '--directory' || v === '-C') { into = word(k); k++; }
          else if (v.startsWith('--directory=')) into = { k: 'w', parts: [{ t: 'lit', v: v.slice('--directory='.length) }] };
          else if (!v.startsWith('--') && (v.startsWith('-') || k === 0) && /^-?[A-Za-z]+$/.test(v)) {
            // a cluster: -xzf FILE, -czf FILE, old style xf FILE; f and C take the next words in order
            let skip = 0;
            for (const ch of v.replace(/^-/, '')) {
              if (ch === 'x') extract = true;
              else if (ch === 'c' || ch === 'r' || ch === 'u') create = true;
              else if (ch === 'O') stdoutOnly = true;
              else if (ch === 'f') { file = rest[k + 1 + skip] ? rest[k + 1 + skip].w : null; skip++; }
              else if (ch === 'C') { into = rest[k + 1 + skip] ? rest[k + 1 + skip].w : null; skip++; }
            }
            k += skip;
          }
        }
        if (extract && !stdoutOnly) checkTarget(inDir(into || { k: 'w', parts: [{ t: 'lit', v: '.' }] }), dir, 'tar extraction directory', container);
        if (create && file) checkTarget(file, dir, 'tar archive', container);
        return;
      }
      if (prog === 'unzip') {
        // -l, -p, -t, -v and -z read only; otherwise the files land under -d DIR (the working directory).
        const readOnly = rest.some((x) => x.v !== null && /^-[a-zA-Z]*[lpvtz][a-zA-Z]*$/.test(x.v) && !/^-d/.test(x.v));
        if (!readOnly) {
          const di = rest.findIndex((x) => x.v === '-d');
          const dAttached = rest.find((x) => x.v !== null && /^-d.+/.test(x.v));
          const into = dAttached ? { k: 'w', parts: [{ t: 'lit', v: dAttached.v.slice(2) }] } : (di !== -1 && rest[di + 1] ? rest[di + 1].w : { k: 'w', parts: [{ t: 'lit', v: '.' }] });
          checkTarget(inDir(into), dir, 'unzip destination', container);
        }
        return;
      }
      if (['gzip', 'gunzip', 'bzip2', 'bunzip2', 'xz', 'unxz', 'zstd', 'unzstd'].includes(prog)) {
        // In place: the operand is replaced by its (de)compressed copy unless -c / --stdout, -l or -t.
        const toStdout = rest.some((x) => x.v !== null && (x.v === '--stdout' || x.v === '--to-stdout' || x.v === '--list' || x.v === '--test' || /^-[a-zA-Z]*[clt][a-zA-Z]*$/.test(x.v)));
        if (!toStdout) for (const x of plain) if (x.v === null || !x.v.startsWith('-')) checkTarget(x.w, dir, `${prog} operand`, container);
        return;
      }
      if (prog === 'sort') {
        // -o FILE, -oFILE, a cluster ending in o (-ro FILE), --output FILE and --output=FILE write FILE.
        for (let k = 0; k < rest.length; k++) {
          const v = rest[k].v;
          if (v === null) continue;
          if (v === '--output') { if (rest[k + 1]) { checkTarget(rest[k + 1].w, dir, 'sort --output', container); k++; } continue; }
          if (v.startsWith('--output=')) { checkTarget({ k: 'w', parts: [{ t: 'lit', v: v.slice('--output='.length) }] }, dir, 'sort --output', container); continue; }
          // --compress-program names a program sort runs on its temporary files (any unambiguous prefix of the option
          // counts, --compress=sh): refused in every profile. -T and --temporary-directory name where those files go:
          // a write location, refused in a QA run and a hunt and held to the workspace in an autopilot stage.
          const longName = v.startsWith('--') ? v.split('=')[0] : '';
          if (longName.length >= 4 && '--compress-program'.startsWith(longName)) return deny(`sort ${longName} runs a program on its temporary files; ${runKind} runs none`);
          if (longName.length >= 3 && '--temporary-directory'.startsWith(longName)) {
            if (!autopilot) return deny(`sort --temporary-directory names a folder sort writes its temporary files to; ${runKind} writes to ${areaText} only, through a redirect`);
            if (v.includes('=')) checkTarget({ k: 'w', parts: [{ t: 'lit', v: v.slice(v.indexOf('=') + 1) }] }, dir, 'sort --temporary-directory', container);
            else if (rest[k + 1]) { checkTarget(rest[k + 1].w, dir, 'sort --temporary-directory', container); k++; }
            continue;
          }
          const tm = /^-[bdfghiMnrRsuVzc]*T(.*)$/.exec(v);
          if (tm && !v.startsWith('--')) {
            if (!autopilot) return deny(`sort -T names a folder sort writes its temporary files to; ${runKind} writes to ${areaText} only, through a redirect`);
            if (tm[1]) checkTarget({ k: 'w', parts: [{ t: 'lit', v: tm[1] }] }, dir, 'sort -T', container);
            else if (rest[k + 1]) { checkTarget(rest[k + 1].w, dir, 'sort -T', container); k++; }
            continue;
          }
          const m = /^-[bdfghiMnrRsuVzc]*o(.*)$/.exec(v);
          if (m && !v.startsWith('--')) {
            if (m[1]) checkTarget({ k: 'w', parts: [{ t: 'lit', v: m[1] }] }, dir, 'sort -o', container);
            else if (rest[k + 1]) { checkTarget(rest[k + 1].w, dir, 'sort -o', container); k++; }
          }
        }
        return;
      }
      if (prog === 'shuf') {
        // -o FILE, -oFILE, --output FILE and --output=FILE write FILE, the same as sort -o.
        for (let k = 0; k < rest.length; k++) {
          const v = rest[k].v;
          if (v === null) continue;
          if (v === '--output') { if (rest[k + 1]) { checkTarget(rest[k + 1].w, dir, 'shuf --output', container); k++; } continue; }
          if (v.startsWith('--output=')) { checkTarget({ k: 'w', parts: [{ t: 'lit', v: v.slice('--output='.length) }] }, dir, 'shuf --output', container); continue; }
          const m = /^-[a-z]*o(.*)$/.exec(v);
          if (m && !v.startsWith('--')) {
            if (m[1]) checkTarget({ k: 'w', parts: [{ t: 'lit', v: m[1] }] }, dir, 'shuf -o', container);
            else if (rest[k + 1]) { checkTarget(rest[k + 1].w, dir, 'shuf -o', container); k++; }
          }
        }
        return;
      }
      if (prog === 'uniq') {
        // uniq [OPTION]... [INPUT [OUTPUT]]: the second operand is a file it writes. -f, -s and -w take a value.
        const operands = [];
        for (let k = 0; k < rest.length; k++) {
          const v = rest[k].v;
          if (v !== null && ['-f', '-s', '-w', '--skip-fields', '--skip-chars', '--check-chars', '--group'].includes(v)) { k++; continue; }
          if (v !== null && v.startsWith('-') && v !== '-') continue;
          operands.push(rest[k]);
        }
        if (operands.length >= 2) checkTarget(operands[1].w, dir, 'uniq output file', container);
        return;
      }
      if (prog === 'openssl') {
        // -out, -keyout, -writerand and -save name a file the subcommand writes.
        for (let k = 0; k < rest.length - 1; k++) {
          if (['-out', '-keyout', '-writerand', '-save'].includes(rest[k].v)) { checkTarget(rest[k + 1].w, dir, `openssl ${rest[k].v}`, container); k++; }
        }
        return;
      }
      if (prog === 'sqlite3') {
        // The first operand opens (and may create or change) a database file; ':memory:' and a blank name touch none.
        const db = rest.find((x) => x.v === null || !x.v.startsWith('-'));
        if (db && db.v !== ':memory:' && db.v !== '') checkTarget(db.w, dir, 'sqlite3 database', container);
        return;
      }
      if (prog === 'mkdir' || prog === 'touch') {
        // The operands are the paths made; -m MODE, -d DATE, -t STAMP and -r REFERENCE take a value.
        const valued = prog === 'mkdir' ? new Set(['-m', '--mode']) : new Set(['-d', '--date', '-t', '-r', '--reference', '--time']);
        for (let k = 0; k < rest.length; k++) {
          const v = rest[k].v;
          if (v !== null && valued.has(v)) { k++; continue; }
          if (v !== null && (v === '--' || v.startsWith('-'))) continue;
          checkTarget(rest[k].w, dir, `${prog} operand`, container);
        }
        return;
      }
      if (prog === 'rm' || prog === 'unlink') {
        // A recursive or forced rm (-r, -R, -f in any cluster, --recursive, --force, --dir) is refused in every
        // profile, however the program is quoted: the hook's text rule saw only `rm -rf`.
        const opts = rest.filter((x) => x.v !== null && x.v.startsWith('-') && x.v !== '--' && x.v !== '-').map((x) => x.v);
        if (prog === 'rm' && opts.some((v) => (/^-[A-Za-z]+$/.test(v) && /[rRfd]/.test(v)) || /^--(recursive|force|dir)$/.test(v))) return deny(DESTRUCTIVE_WHY);
        for (const x of plain.filter((y) => y.v !== '--')) checkTarget(x.w, dir, `${prog} operand`, container);
        return;
      }
      if (['rmdir', 'shred', 'wipe', 'srm', 'dd'].includes(prog) || /^mkfs(\.|$)/.test(prog)) return deny(DESTRUCTIVE_WHY);
      // A symbolic link (ln -s, cp -s, mklink) is a path that later commands write through, and one made in the same
      // command is not on disk when they are judged: a QA run and a hunt make none, and an autopilot stage's link
      // target is held to the same rules as a write (inside the workspace, nothing protected).
      const SYMLINK_WHY = `a symlink during ${runKind} cannot be followed by the guardrail: a later path through it is judged by its spelling, not where the link leads; make no link`;
      const linkDirOf = (destWord) => {
        const raw = destWord ? resolveWord(destWord) : null;
        if (raw === null) return dir;
        let p = normPath(raw);
        if (!p.startsWith('/')) { if (dir === null) return null; p = `${dir}/${p.replace(/^\.\//, '')}`; }
        let isDir = /[\\/]$/.test(raw);
        if (!isDir) { try { isDir = statSync(realCanonical(p, rootC)).isDirectory(); } catch { isDir = false; } }
        return isDir ? p : (p.slice(0, p.lastIndexOf('/')) || '/');
      };
      if (prog === 'mklink') {
        if (!autopilot) return deny(SYMLINK_WHY);
        const ops = rest.filter((x) => x.v === null || !/^\/[A-Za-z]$/.test(x.v));
        if (ops[0]) checkTarget(ops[0].w, dir, 'mklink link', container);
        if (ops[1]) checkTarget(ops[1].w, linkDirOf(ops[0] && ops[0].w), 'mklink link target', container);
        return;
      }
      if (prog === 'cp' || prog === 'mv' || prog === 'install' || prog === 'ln' || prog === 'link') {
        const ops = plain.filter((y) => y.v !== '--');
        const ti = rest.findIndex((x) => x.v === '-t' || x.v === '--target-directory');
        const tEq = rest.find((x) => x.v && x.v.startsWith('--target-directory='));
        const symbolic = (prog === 'ln' || prog === 'cp') && rest.some((x) => x.v !== null && (/^-[A-Za-z]*s[A-Za-z]*$/.test(x.v) || x.v === (prog === 'ln' ? '--symbolic' : '--symbolic-link')));
        if (symbolic && !autopilot) return deny(SYMLINK_WHY);
        // A hard link (ln, link SRC DST, cp -l, cp --link[=...]) is a second name for the same file: a later write through the new name edits
        // the source, and the destination is all the checks below read. Every operand, the source too, is held to the write
        // area (a QA run and a hunt: reviews/<id>/ and .ultrapowers/; an autopilot stage: the workspace, nothing protected).
        // cp takes any unambiguous prefix of --link (--lin) and the long options accept =VALUE.
        const hard = prog === 'ln' || prog === 'link' ? !symbolic : prog === 'cp' && rest.some((x) => x.v !== null && (/^-[A-Za-z]*l[A-Za-z]*$/.test(x.v) || (x.v.startsWith('--l') && '--link'.startsWith(x.v.split('=')[0]))));
        if (hard) for (const x of ops) checkTarget(x.w, dir, `${prog} operand (a hard link)`, container);
        let dest;
        if (tEq) dest = { k: 'w', parts: [{ t: 'lit', v: tEq.v.slice('--target-directory='.length) }] };
        else if (ti !== -1 && rest[ti + 1]) dest = rest[ti + 1].w;
        else if (ops.length >= 2) dest = ops[ops.length - 1].w;
        if (symbolic) {
          const targets = dest && ops.length >= 2 && !tEq && ti === -1 ? ops.slice(0, -1) : ops;
          const linkDir = linkDirOf(dest);
          for (const x of targets) checkTarget(x.w, linkDir, `${prog} link target`, container);
        }
        if (dest) checkTarget(dest, dir, `${prog} destination`, container);
        if (prog === 'mv') for (const x of (dest && !tEq && ti === -1 ? ops.slice(0, -1) : ops)) checkTarget(x.w, dir, 'mv source', container);
        return;
      }
      if (prog === 'curl') {
        if (allowedHosts.length || autopilot) { const why = egressWhy('curl', rest, allowedHosts); if (why) deny(autopilot && !allowedHosts.length ? `${why} (an autopilot stage reaches only the hosts in qa.hosts.allowed, and the list is empty)` : why); }
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
        if (allowedHosts.length || autopilot) { const why = egressWhy('wget', rest, allowedHosts); if (why) deny(autopilot && !allowedHosts.length ? `${why} (an autopilot stage reaches only the hosts in qa.hosts.allowed, and the list is empty)` : why); }
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
      afterGate();
      if (unlisted && !reason) deny(unlisted);
    };
    // The tracked directory follows the shell's scoping: a subshell ( ), each side of a pipeline and
    // a backgrounded command run in a child, so a cd inside one of them does not reach the next
    // command. pipeBase is the directory the current pipeline started in, listBase the one the
    // current and-or list started in; a ( or { group saves both and the ) or } restores them (and
    // the ) the directory too: a brace group runs in the current shell).
    let pipeBase = dir;
    let listBase = dir;
    let inPipe = false;
    const frames = [];
    const endPipe = () => { if (inPipe) { dir = pipeBase; inPipe = false; } };
    const open = (paren) => { frames.push({ paren, dir, pipeBase, listBase, inPipe }); pipeBase = dir; listBase = dir; inPipe = false; };
    const close = () => {
      const f = frames.pop();
      if (!f) return;
      endPipe();
      if (f.paren) dir = f.dir;
      ({ pipeBase, listBase, inPipe } = f);
    };
    for (const t of toks) {
      if (t.k === 'op' && [';', '&&', '||', '|', '&', '(', ')'].includes(t.v)) {
        flush();
        if (t.v === '|') { dir = pipeBase; inPipe = true; }
        else if (t.v === '&') { inPipe = false; dir = listBase; pipeBase = dir; }
        else if (t.v === ';') { endPipe(); pipeBase = dir; listBase = dir; }
        else if (t.v === '&&' || t.v === '||') { endPipe(); pipeBase = dir; }
        else if (t.v === '(') open(true);
        else close();
        continue;
      }
      if (t.k === 'w' && cmd.length === 0) {
        const v = resolveWord(t);
        if (v === '{') open(false);
        else if (v === '}') close();
      }
      cmd.push(t);
    }
    flush();
  };

  // The one way a QA run or a hunt ends: the gatekeeper removes its own marker with a call whose
  // entire command is `rm [-f] <marker>` (one literal operand, no other word, no chaining). The
  // other profile's marker, and every other spelling, stay refused by checkTarget.
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

// True when `command` is exactly `rm <path>` or `rm -f <path>`, every word plain literal text, and
// <path> (relative to cwd) is the marker `name` of the project at rootC.
export function ownMarkerRemoval(command, cwd, rootC, name, ignoreCase) {
  const toks = tokenize(command);
  if (toks.subs.length || toks.some((t) => t.k !== 'w')) return false;
  if (!toks.every((t) => t.parts.every((p) => p.t === 'lit'))) return false;
  const words = toks.map((t) => t.parts.map((p) => p.v).join(''));
  if (words[0] !== 'rm') return false;
  const ops = words[1] === '-f' ? words.slice(2) : words.slice(1);
  if (ops.length !== 1 || ops[0].startsWith('-') || /[*?[\]{}~$`]/.test(ops[0])) return false;
  let p = normPath(ops[0]);
  if (!p.startsWith('/')) p = `${cwd}/${p.replace(/^\.\//, '')}`;
  if (p.split('/').includes('..')) return false;
  const want = realCanonical(`${rootC}/.ultrapowers/${name}`, rootC);
  const got = realCanonical(p, rootC);
  return ignoreCase ? got.toLowerCase() === want.toLowerCase() : got === want;
}

function main() {
  let input = '';
  try { input = readFileSync(0, 'utf8'); } catch { input = ''; }
  const [cwd = '', root = '', ticket = '', ignoreCaseFlag = '', roleVarsField = '', roRoleField = '', ...cmdParts] = input.split('\0');
  const profile = ['autopilot', 'hunt'].includes(process.env.ULTRAPOWERS_GUARD_PROFILE) ? process.env.ULTRAPOWERS_GUARD_PROFILE : 'qa';
  const out = analyze(cmdParts.join('\0'), { cwd, root, ticket, profile, ignoreCase: ignoreCaseFlag === '1', roleVars: roleVarsField.split(',').filter(Boolean), roRole: roRoleField || 'qa_agent_ro', allowedHosts: String(process.env.ULTRAPOWERS_GUARD_HOSTS || '').split(',').map((h) => h.trim().toLowerCase()).filter(Boolean) });
  if (out) process.stdout.write(out);
}

if (process.argv[1] && /qa-shell-writes\.mjs$/.test(process.argv[1].replace(/\\/g, '/'))) main();
