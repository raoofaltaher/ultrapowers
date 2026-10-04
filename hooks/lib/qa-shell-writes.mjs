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

const DEVICES = new Set(['/dev/null', '/dev/stdout', '/dev/stderr', '/dev/tty', 'nul', '/dev/fd/1', '/dev/fd/2']);
const SHELLS = new Set(['sh', 'bash', 'zsh', 'dash', 'ksh']);
const WRAPPERS = new Set(['nohup', 'command', 'exec', 'time', 'sudo', 'nice', 'stdbuf']);
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
      if (word && word.length === 1 && word[0].t === 'lit' && /^[0-9]+$/.test(word[0].v)) word = null;
      let v = c; i++;
      if (c === '<' && src[i] === '<') { v = '<<'; i++; if (src[i] === '<') { v = '<<<'; i++; } else if (src[i] === '-') { i++; } }
      else if (c === '>' && (src[i] === '>' || src[i] === '|')) { v += src[i]; i++; }
      else if (c === '<' && src[i] === '>') { v = '<>'; i++; }
      if ((v === '>' || v === '<') && src[i] === '&') { v += '&'; i++; }
      op(v);
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
const PROTECTED_RE = /(^|\/)\.ssh\/|authorized_keys|id_rsa|id_ed25519|(^|\/)\.aws\/|mcp-secrets\.env|\.local\.|hooks\/qa-guardrail|\.agents\/ultrapowers\.json|(^|\/)\.claude\/|(^|\/)\.git\/|(^|\/)\.githooks\/|settings(\.local)?\.json$/;
const AUTOPILOT_PROTECTED_RE = /(^|\/)\.github\/|(^|\/)\.gitlab-ci\.yml$|(^|\/)hooks\/|(^|\/)\.env($|\.)/;
// Git subcommands an autopilot stage never runs: pushing and integrating belong to the engine,
// and nothing discards work.
const GIT_AUTOPILOT_DENIED = new Set(['push', 'merge', 'rebase', 'cherry-pick', 'reset', 'clean', 'restore', 'filter-branch', 'filter-repo', 'gc', 'prune', 'reflog', 'update-ref', 'symbolic-ref', 'remote']);

// ---------- analysis ----------
export function analyze(command, { cwd, root, ticket, profile = 'qa' }) {
  const autopilot = profile === 'autopilot';
  const rootN = normPath(root).toLowerCase();
  const areas = autopilot
    ? [rootN]
    : [ticket ? `${rootN}/reviews/${String(ticket).toLowerCase()}` : `${rootN}/reviews`, `${rootN}/.ultrapowers`];
  const areaText = autopilot ? 'the workspace' : `reviews/${ticket || '<id>'}/ and .ultrapowers/`;
  const runKind = autopilot ? 'an autopilot stage' : 'a QA run';
  const vars = new Map();
  let reason = '';
  const deny = (r) => { if (!reason) reason = r; };
  const protectedPath = (p) => {
    const l = p.toLowerCase().replace(/\.env\.example/g, '');
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
  const inArea = (abs) => areas.some((a) => abs === a || abs.startsWith(`${a}/`));
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
    if (protectedPath(p)) return deny(`${what} (${raw}) is a protected path; the config, hooks, CI, settings and key material are never written during ${runKind}`);
    if (!inArea(p.toLowerCase())) deny(`${what} (${raw}) is outside ${areaText}; shell writes during ${runKind} are limited to ${autopilot ? 'the workspace' : 'those folders'}`);
  };

  const walk = (src, startDir, container, depth) => {
    if (depth > 4) return deny('the command nests shells too deeply to be verified');
    let dir = startDir;
    const toks = tokenize(src);
    let cmd = [];
    const flush = () => { if (cmd.length) simple(cmd); cmd = []; };
    const simple = (items) => {
      // redirections first; they apply whatever the program is
      const words = [];
      for (let k = 0; k < items.length; k++) {
        const t = items[k];
        if (t.k === 'op') {
          const next = items[k + 1];
          if (['>', '>>', '>|', '&>', '&>>', '<>'].includes(t.v)) { if (next && next.k === 'w') { checkTarget(next, dir, 'redirect target', container); k++; } }
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
      let args = words.slice(a).map((w) => ({ w, v: resolveWord(w) }));
      if (args.length === 0) { for (const [n, v] of assigns) { if (v === null) vars.delete(n); else vars.set(n, v); } return; }
      let prog = (args[0].v || '').replace(/\\/g, '/').split('/').pop().toLowerCase().replace(/\.exe$/, '');
      while (WRAPPERS.has(prog) || prog === 'env' || prog === 'timeout' || prog === 'xargs') {
        if (prog === 'xargs') {
          const inner = args.slice(1).find((x) => x.v && !x.v.startsWith('-'));
          const ip = inner ? inner.v.split('/').pop().toLowerCase() : '';
          if (WRITE_PROGRAMS.has(ip)) deny(`xargs ${ip} writes to paths that cannot be seen before it runs`);
          return;
        }
        args = args.slice(1);
        if (prog === 'env') while (args.length && args[0].v && (/^[A-Za-z_][A-Za-z0-9_]*=/.test(args[0].v) || args[0].v.startsWith('-'))) args = args.slice(1);
        if (prog === 'timeout') { while (args.length && args[0].v && args[0].v.startsWith('-')) args = args.slice(1); args = args.slice(1); }
        if (!args.length) return;
        prog = (args[0].v || '').replace(/\\/g, '/').split('/').pop().toLowerCase().replace(/\.exe$/, '');
      }
      const rest = args.slice(1);
      const plain = rest.filter((x) => !(x.v || '').startsWith('-'));
      if (prog === 'export' || prog === 'local' || prog === 'declare' || prog === 'readonly') {
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
      if (SHELLS.has(prog)) {
        const ci = rest.findIndex((x) => x.v === '-c');
        if (ci !== -1 && rest[ci + 1]) {
          if (rest[ci + 1].v === null) return deny(`${prog} -c runs a command built from a variable; it cannot be verified`);
          walk(rest[ci + 1].v, dir, container, depth + 1);
        }
        return;
      }
      if (prog === 'docker') {
        const sub = plain[0] ? plain[0].v : '';
        if (sub === 'exec') {
          const si = rest.findIndex((x) => x.v && SHELLS.has(x.v.split('/').pop()));
          if (si !== -1 && rest[si + 1] && rest[si + 1].v === '-c' && rest[si + 2]) {
            if (rest[si + 2].v === null) return deny('docker exec runs a shell command built from a variable; it cannot be verified');
            walk(rest[si + 2].v, '/', true, depth + 1);
          }
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
          // The stage commits, branches, stashes and fetches; it never pushes, integrates or discards.
          if (GIT_AUTOPILOT_DENIED.has(sub)) return deny(`git ${sub} is never run by an autopilot stage; the engine pushes and integrates, and nothing discards work`);
          if (sub === 'checkout' && subArgs.includes('--')) return deny('git checkout -- discards work; an autopilot stage never discards');
          if (sub === 'stash' && subArgs[0] === 'drop') return deny('git stash drop discards work; an autopilot stage never discards');
          if (sub === 'branch' && subArgs.some((x) => x === '-D' || x === '--delete' || x === '-d')) return deny('git branch -D deletes a branch; an autopilot stage never discards');
          if (sub === 'worktree' && ['remove', 'prune'].includes(subArgs[0])) return deny('git worktree remove discards a worktree; the engine cleans up after the pull requests');
          return;
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
        if (inPlace && autopilot) for (const x of plain) if (x.v && /[/.]/.test(x.v) && !/^s[/|#,]/.test(x.v)) checkTarget(x.w, dir, `${prog} -i target`, container);
        return;
      }
      if (prog === 'truncate') {
        if (!autopilot) return deny('truncate changes a file; the code under test is read-only during a QA run');
        for (const x of plain) if (x.v && !/^-/.test(x.v) && !/^[0-9]+[kmg]?$/i.test(x.v)) checkTarget(x.w, dir, 'truncate target', container);
        return;
      }
      if (prog === 'find') {
        const ei = rest.findIndex((x) => ['-exec', '-execdir', '-ok', '-okdir'].includes(x.v));
        if (ei !== -1) { const ip = (rest[ei + 1] && rest[ei + 1].v || '').split('/').pop().toLowerCase(); if (WRITE_PROGRAMS.has(ip)) deny(`find ${rest[ei].v} ${ip} writes to paths that cannot be seen before it runs`); }
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
    return `the command could not be analysed for writes (${error.message}); it is refused during a QA run`;
  }
  return reason;
}

function main() {
  let input = '';
  try { input = readFileSync(0, 'utf8'); } catch { input = ''; }
  const [cwd = '', root = '', ticket = '', ...cmdParts] = input.split('\0');
  const profile = process.env.ULTRAPOWERS_GUARD_PROFILE === 'autopilot' ? 'autopilot' : 'qa';
  const out = analyze(cmdParts.join('\0'), { cwd, root, ticket, profile });
  if (out) process.stdout.write(out);
}

if (process.argv[1] && /qa-shell-writes\.mjs$/.test(process.argv[1].replace(/\\/g, '/'))) main();
