const ESCAPES = { '"': '"', '\\': '\\', n: '\n', t: '\t', r: '\r', b: '\b', f: '\f' };

function fail(where, message) {
  throw new SyntaxError(`${where}: ${message}`);
}

function skipSpace(line, i) {
  while (i < line.length && (line[i] === ' ' || line[i] === '\t')) i += 1;
  return i;
}

function readQuoted(line, start, where) {
  const quote = line[start];
  let i = start + 1;
  let out = '';
  while (i < line.length) {
    const ch = line[i];
    if (ch === quote) return [out, i + 1];
    if (quote === '"' && ch === '\\') {
      const esc = line[i + 1];
      if (Object.prototype.hasOwnProperty.call(ESCAPES, esc)) {
        out += ESCAPES[esc];
        i += 2;
        continue;
      }
      if (esc === 'u' || esc === 'U') {
        const size = esc === 'u' ? 4 : 8;
        const hex = line.slice(i + 2, i + 2 + size);
        if (hex.length !== size || !/^[0-9A-Fa-f]+$/.test(hex)) fail(where, 'bad unicode escape');
        out += String.fromCodePoint(parseInt(hex, 16));
        i += 2 + size;
        continue;
      }
      fail(where, `bad escape \\${esc ?? ''}`);
    }
    out += ch;
    i += 1;
  }
  return fail(where, 'unterminated string');
}

function readKey(line, i, where) {
  if (line[i] === '"' || line[i] === "'") return readQuoted(line, i, where);
  const match = /^[A-Za-z0-9_-]+/.exec(line.slice(i));
  if (!match) fail(where, 'expected a key');
  return [match[0], i + match[0].length];
}

function readValue(line, i, where) {
  const ch = line[i];
  if (ch === '"' || ch === "'") return readQuoted(line, i, where);
  if (ch === '[') {
    const items = [];
    let j = skipSpace(line, i + 1);
    while (line[j] !== ']') {
      if (j >= line.length) fail(where, 'unterminated array');
      const [item, next] = readValue(line, j, where);
      items.push(item);
      j = skipSpace(line, next);
      if (line[j] === ',') j = skipSpace(line, j + 1);
      else if (line[j] !== ']') fail(where, 'expected , or ] in array');
    }
    return [items, j + 1];
  }
  const rest = line.slice(i);
  const literal = /^(true|false|[+-]?[0-9]+)(?=\s|#|,|\]|$)/.exec(rest);
  if (!literal) fail(where, `unsupported value ${rest.slice(0, 20)}`);
  const text = literal[1];
  const value = text === 'true' ? true : text === 'false' ? false : Number(text);
  return [value, i + text.length];
}

function expectEnd(line, i, where) {
  const j = skipSpace(line, i);
  if (j < line.length && line[j] !== '#') fail(where, `unexpected text ${line.slice(j, j + 20)}`);
}

export function parseToml(text) {
  const root = {};
  let table = root;
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  lines.forEach((line, index) => {
    const where = `line ${index + 1}`;
    let i = skipSpace(line, 0);
    if (i >= line.length || line[i] === '#') return;
    if (line[i] === '[') {
      if (line[i + 1] === '[') fail(where, 'arrays of tables are not supported');
      const keys = [];
      i = skipSpace(line, i + 1);
      while (true) {
        const [key, next] = readKey(line, i, where);
        keys.push(key);
        i = skipSpace(line, next);
        if (line[i] === '.') { i = skipSpace(line, i + 1); continue; }
        if (line[i] === ']') break;
        fail(where, 'expected . or ] in table header');
      }
      expectEnd(line, i + 1, where);
      table = root;
      for (const key of keys) {
        if (!Object.prototype.hasOwnProperty.call(table, key)) table[key] = {};
        if (typeof table[key] !== 'object' || Array.isArray(table[key])) fail(where, `${key} is not a table`);
        table = table[key];
      }
      return;
    }
    const [key, afterKey] = readKey(line, i, where);
    i = skipSpace(line, afterKey);
    if (line[i] !== '=') fail(where, 'expected =');
    const [value, afterValue] = readValue(line, skipSpace(line, i + 1), where);
    expectEnd(line, afterValue, where);
    if (Object.prototype.hasOwnProperty.call(table, key)) fail(where, `duplicate key ${key}`);
    table[key] = value;
  });
  return root;
}
