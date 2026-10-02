// Ticket sources: validate the marker's `tickets` block and resolve a ticket
// id to the provider, project and number it names. No I/O; node built-ins only.
//
// Ids are <PREFIX>-<project>-<number> or <PREFIX>-<number>, read from both
// ends: the prefix is the text before the first "-", the number the text
// after the last "-", the project whatever lies between. An id whose prefix
// matches no source is local, the manual flow.

export class TicketError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

const PROVIDERS = ['github', 'gitlab', 'odoo'];
const TRANSPORTS = ['auto', 'cli', 'mcp'];
const PREFIX = /^[A-Z][A-Z0-9]{0,9}$/;
const HEADER = /^[A-Za-z0-9-]+(: [A-Za-z]+)?$/;
const NUMBER = /^[0-9]+$/;
const REQUIRED = { github: ['owner'], gitlab: ['namespace'], odoo: ['url', 'mcpUrl'] };

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isText(value) {
  return typeof value === 'string' && value.trim() !== '';
}

export function validateTickets(tickets) {
  if (!isObject(tickets)) return ['tickets must be an object'];
  const errors = [];
  if ('transport' in tickets && !TRANSPORTS.includes(tickets.transport)) {
    errors.push(`tickets.transport must be one of ${TRANSPORTS.join(', ')}`);
  }
  if (!Array.isArray(tickets.sources)) {
    errors.push('tickets.sources must be a list');
    return errors;
  }
  const seen = new Set();
  tickets.sources.forEach((source, i) => {
    const at = `tickets.sources[${i}]`;
    if (!isObject(source)) {
      errors.push(`${at} must be an object`);
      return;
    }
    if (typeof source.prefix !== 'string' || !PREFIX.test(source.prefix)) {
      errors.push(`${at}.prefix must match ${PREFIX.source}`);
    } else if (seen.has(source.prefix)) {
      errors.push(`${at}.prefix ${source.prefix} is already used by another source`);
    } else {
      seen.add(source.prefix);
    }
    if (!PROVIDERS.includes(source.provider)) {
      errors.push(`${at}.provider must be one of ${PROVIDERS.join(', ')}`);
      return;
    }
    for (const field of REQUIRED[source.provider]) {
      if (!isText(source[field])) errors.push(`${at}.${field} is required for ${source.provider}`);
    }
    for (const field of ['host', 'defaultProject', 'url', 'mcpUrl']) {
      if (field in source && !isText(source[field])) errors.push(`${at}.${field} must be a non-empty string`);
    }
    for (const field of ['url', 'mcpUrl']) {
      if (isText(source[field]) && !/^https?:\/\/[^/\s]+/.test(source[field])) {
        errors.push(`${at}.${field} must be an http or https URL`);
      }
    }
    if ('transport' in source && !TRANSPORTS.includes(source.transport)) {
      errors.push(`${at}.transport must be one of ${TRANSPORTS.join(', ')}`);
    }
    if ('mcpHeader' in source && (typeof source.mcpHeader !== 'string' || !HEADER.test(source.mcpHeader))) {
      errors.push(`${at}.mcpHeader must be "Name" or "Name: Scheme", for example "Authorization: Bearer"`);
    }
    if ('projects' in source) {
      if (!isObject(source.projects) || !Object.values(source.projects).every(isText)) {
        errors.push(`${at}.projects must map project segments to provider paths`);
      }
    }
  });
  return errors;
}

export function effectiveTransport(tickets, source) {
  if (source.provider === 'odoo') return 'mcp';
  return source.transport ?? tickets.transport ?? 'auto';
}

export function serverId(prefix) {
  return `tickets-${prefix.toLowerCase()}`;
}

function hostOf(source) {
  if (source.provider === 'github') return 'github.com';
  if (source.provider === 'gitlab') return source.host ?? 'gitlab.com';
  return new URL(source.url).host;
}

function providerPath(source, segment) {
  if (source.provider === 'odoo') return segment;
  if (isObject(source.projects) && isText(source.projects[segment])) return source.projects[segment];
  const base = source.provider === 'github' ? source.owner : source.namespace;
  return `${base}/${segment}`;
}

function repoHintFor(marker, segment, path) {
  const names = new Set((Array.isArray(marker.repos) ? marker.repos : [])
    .map((r) => (isObject(r) ? r.name : null))
    .filter(isText));
  if (names.has(segment)) return segment;
  const last = path.split('/').pop();
  return names.has(last) ? last : null;
}

export function resolveTicket(marker, id) {
  const local = { provider: 'local' };
  if (id.startsWith('#') || !id.includes('-')) return local;
  const tickets = marker?.tickets;
  if (tickets === undefined) return local;
  const prefix = id.slice(0, id.indexOf('-'));
  const listed = isObject(tickets) && Array.isArray(tickets.sources) ? tickets.sources.filter(isObject) : [];
  const errors = validateTickets(tickets);
  if (errors.length) {
    // A broken block must not swallow its own ids, nor stop local ones.
    if (listed.some((s) => s.prefix === prefix)) {
      throw new TicketError('bad-tickets', `the tickets block in .agents/ultrapowers.json is invalid: ${errors.join('; ')}`);
    }
    return local;
  }
  const source = listed.find((s) => s.prefix === prefix);
  if (!source) {
    const near = listed.find((s) => s.prefix.toLowerCase() === prefix.toLowerCase());
    return near ? { provider: 'local', nearPrefix: near.prefix } : local;
  }
  const rest = id.slice(prefix.length + 1);
  let segment;
  let numberText;
  if (NUMBER.test(rest)) {
    if (!isText(source.defaultProject)) {
      throw new TicketError('bad-ticket', `${id} needs a project segment or a defaultProject for ${prefix}`);
    }
    segment = source.defaultProject;
    numberText = rest;
  } else {
    const cut = rest.lastIndexOf('-');
    numberText = cut === -1 ? '' : rest.slice(cut + 1);
    segment = cut === -1 ? rest : rest.slice(0, cut);
    if (!NUMBER.test(numberText) || segment === '') {
      throw new TicketError('bad-ticket', `${id} has no ticket number: expected ${prefix}-<project>-<number> or ${prefix}-<number>`);
    }
  }
  if (source.provider === 'odoo' && !NUMBER.test(segment)) {
    throw new TicketError('bad-ticket', `${id}: the Odoo project segment must be the numeric project id`);
  }
  const path = providerPath(source, segment);
  return {
    provider: source.provider,
    prefix,
    host: hostOf(source),
    path,
    number: Number(numberText),
    repoHint: repoHintFor(marker, segment, path),
    transport: effectiveTransport(tickets, source),
    server: serverId(prefix),
  };
}
