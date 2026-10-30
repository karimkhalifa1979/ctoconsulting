// Binds the template engine to report data: scope resolution, collection filters and sorting
// (RPT-013), formatting helpers (RPT-012), audience blocking (RPT-021) and validation (RPT-024, RPT-025).
import { loadDocx, analyse, structure, DocxRenderer, applyMappings, applyMetadata, describeLocation, parseToken } from './docx.mjs';
import { GLOBAL_TOKENS, FIN_TOKENS, PROJECT_TOKENS, COLLECTIONS, HELPERS, CHARTS, allowedFor, lookupToken } from '../../../shared/tokens.js';
import { fmtDatePattern, fmtMoney, fmtPct, fmtNum, fmtDateTime, textCase } from '../../../shared/format.js';
import { parseRich } from '../../../shared/markdown.js';
import { TREND_LABEL } from '../../../shared/rag.js';

export const RAG_STYLE = {
  Green: { fill: '2E7D32', color: 'FFFFFF' },
  Amber: { fill: 'F2B200', color: '000000' },
  Red: { fill: 'C62828', color: 'FFFFFF' },
  Low: { fill: '2E7D32', color: 'FFFFFF' },
  Medium: { fill: 'F2B200', color: '000000' },
  High: { fill: 'E8710A', color: '000000' },
  Extreme: { fill: 'C62828', color: 'FFFFFF' },
  Critical: { fill: 'C62828', color: 'FFFFFF' },
};
const RANK = { Green: 0, Amber: 1, Red: 2, Low: 1, Medium: 2, High: 3, Extreme: 4, Critical: 4 };

const COLLECTION_KEYS = new Set(Object.keys(COLLECTIONS));
const itemFields = (name) => new Map((COLLECTIONS[name]?.fields || []).map((f) => [f.key, f]));
const GLOBAL_INDEX = new Map([...GLOBAL_TOKENS, ...FIN_TOKENS].map((t) => [t.path, t]));
const PROJECT_INDEX = new Map(PROJECT_TOKENS.map((t) => [t.path, t]));

// Collection name from a block path, e.g. 'engagement.projects', 'risks', 'changes_since_last.new_risks'.
const collectionName = (path) => (COLLECTION_KEYS.has(path) ? path : null);

// ---------- Scope resolution ----------
function getPath(obj, parts) {
  let v = obj;
  for (const p of parts) {
    if (v === null || v === undefined) return undefined;
    v = v[p];
  }
  return v;
}

export function resolve(scope, path) {
  if (!path) return undefined;
  const parts = path.split('.');
  if (path === 'this') return scope.item;
  if (parts[0] === '@index') return scope.index;
  if (parts[0] === '@number') return (scope.index ?? 0) + 1;
  if (parts[0] === '@first') return scope.index === 0;
  if (parts[0] === '@last') return scope.index === (scope.count ?? 0) - 1;
  for (let s = scope; s; s = s.parent) {
    const base = s.item ?? s.data;
    if (base && typeof base === 'object' && parts[0] in base) return getPath(base, parts);
  }
  return undefined;
}

// ---------- Collection filters (RPT-013) ----------
function inWindow(d, from, to) { return d && d >= from && d <= to; }

function filterItems(name, items, filterSpec, ctx) {
  if (!filterSpec) return items;
  let out = items;
  for (const f of String(filterSpec).split(',').map((x) => x.trim()).filter(Boolean)) {
    const pe = ctx.periodEnd, ps = ctx.periodStart, la = ctx.lookaheadEnd;
    const pred = {
      all: () => true,
      reportable: (x) => x.reportable !== false,
      open: (x) => !x.closed,
      high: (x) => ['High', 'Extreme', 'Critical'].includes(x.rating || x.severity),
      overdue: (x) => Boolean(x.overdue),
      client: (x) => x.owner_org === 'Client' || x.type === 'Client',
      cross_project: (x) => ['Cross-project', 'Cross-engagement'].includes(x.type),
      key: (x) => Boolean(x.key),
      lookahead: (x) => inWindow(x.forecast_date || x.due_date, ps > pe ? pe : (pe), la) && !x.actual_date && !['Accepted', 'Withdrawn'].includes(x.status),
      last_period: (x) => inWindow(x.actual_date || x.forecast_date || x.due_date, ps, pe),
      missed: (x) => x.status === 'Missed',
      achieved: (x) => Boolean(x.actual_date),
      submitted: (x) => x.status === 'Submitted',
      accepted: (x) => x.status === 'Accepted',
      required: (x) => x.status === 'Required',
      made: (x) => x.status === 'Made',
      pending: (x) => ['Submitted', 'Under assessment', 'Awaiting approval'].includes(x.status),
      approved: (x) => ['Approved', 'Implemented', 'Closed'].includes(x.status),
      raised_this_period: (x) => inWindow(x.raised_date, ps, pe),
      approved_this_period: (x) => inWindow(x.decided_at, ps, pe) && ['Approved', 'Implemented'].includes(x.status),
      confirmed: (x) => x.status === 'Confirmed',
      joining: (x) => inWindow(x.start_date, ps, la),
      leaving: (x) => inWindow(x.end_date, ps, la),
      fy: (x) => x.fy === ctx.fy,
      to_date: (x) => x.month <= String(pe).slice(0, 7),
      remaining: (x) => x.month > String(pe).slice(0, 7),
      upcoming: (x) => x.date >= pe,
      changed: (x) => x.direction !== 'Steady',
      active: (x) => ['In delivery', 'Stage boundary', 'Initiation', 'Closing'].includes(x?.project?.state),
      new: (x) => Boolean(x.is_new),
    }[f];
    if (pred) out = out.filter(pred);
  }
  void name;
  return out;
}

function sortItems(items, sortSpec) {
  if (!sortSpec) return items;
  const keys = String(sortSpec).split(',').map((s) => s.trim().split(/\s+/)).filter((k) => k[0]);
  return [...items].sort((a, b) => {
    for (const [field, dir = 'asc'] of keys) {
      const get = (x) => (field.includes('.') ? getPath(x, field.split('.')) : x?.[field]);
      let va = get(a), vb = get(b);
      if (va in RANK || vb in RANK) { va = RANK[va] ?? -1; vb = RANK[vb] ?? -1; }
      if (va === vb) continue;
      if (va === undefined || va === null) return 1;
      if (vb === undefined || vb === null) return -1;
      const c = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb), undefined, { numeric: true });
      return dir.toLowerCase() === 'desc' ? -c : c;
    }
    return 0;
  });
}

export function select(scope, path, hash, ctx) {
  const items = resolve(scope, path);
  if (!Array.isArray(items)) return [];
  const name = collectionName(path) || path.split('.').at(-1);
  let out = filterItems(name, items, hash.filter, ctx);
  out = sortItems(out, hash.sort);
  if (hash.limit) out = out.slice(0, Math.max(0, Number(hash.limit) || 0));
  return out;
}

// Type of a token path in scope (for default formatting).
function typeOf(path, scopeCollections) {
  const t = GLOBAL_INDEX.get(path) || PROJECT_INDEX.get(path);
  if (t) return t.type;
  for (const c of scopeCollections) {
    const f = itemFields(c).get(path);
    if (f) return f.type;
  }
  return null;
}

// ---------- Rendering ----------
export function makeFormatter({ ctx, charts, images }) {
  return async (ast, scope) => {
    const helper = ast.kind === 'helper' ? ast.helper : null;
    const path = ast.path;
    const collections = [];
    for (let s = scope; s; s = s.parent) if (s.collection) collections.push(collectionName(s.collection) || s.collection.split('.').at(-1));
    let type = helper || typeOf(path, collections) || 'text';
    if (!helper && path?.startsWith('chart.')) type = 'chart';
    if (!helper && path === 'client.logo') type = 'image';
    const value = path ? resolve(scope, path) : null;
    const decimals = (d) => (ast.args[0] !== undefined && /^\d+$/.test(ast.args[0]) ? Number(ast.args[0]) : d);
    switch (type) {
      case 'date': return { kind: 'text', text: value ? fmtDatePattern(value, ast.args[0] || 'dd/MM/yyyy') : '' };
      case 'datetime': return { kind: 'text', text: value ? fmtDateTime(value, ctx.tz) : '' };
      case 'currency': return { kind: 'text', text: Number.isFinite(value) ? fmtMoney(value, { decimals: decimals(0) }) : '' };
      case 'percent': return { kind: 'text', text: Number.isFinite(value) ? fmtPct(value, decimals(1)) : '' };
      case 'number': return { kind: 'text', text: Number.isFinite(value) ? fmtNum(value, decimals(Number.isInteger(value) ? 0 : 2)) : '' };
      case 'upper': case 'lower': case 'title': return { kind: 'text', text: textCase(value ?? '', type) };
      case 'yesno': case 'bool': return { kind: 'text', text: value ? 'Yes' : 'No' };
      case 'trend': return { kind: 'text', text: TREND_LABEL[value] || value || '' };
      case 'rag': {
        const label = value || 'Not rated';
        const st = RAG_STYLE[label];
        return { kind: 'rag', label, fill: st?.fill || null, color: st?.color || '000000' };
      }
      case 'rich': return { kind: 'rich', blocks: parseRich(value || '') };
      case 'chart': {
        const name = ast.literal || (path?.startsWith('chart.') ? path.slice(6) : path);
        const widthCm = parseFloat(ast.hash.width) || 16;
        const heightCm = parseFloat(ast.hash.height) || widthCm * 0.45;
        const chartScope = resolve(scope, 'project') ? scope : scope;
        const img = await charts(name, chartScope, { widthCm, heightCm });
        return img ? { kind: 'image', buffer: img.png, widthCm, heightCm, alt: img.alt } : { kind: 'text', text: `[chart ${name} unavailable]` };
      }
      case 'image': {
        const widthCm = parseFloat(ast.hash.width) || 4;
        const img = await images(path, scope, { widthCm });
        return img ? { kind: 'image', buffer: img.buffer, ext: img.ext, widthCm, heightCm: img.heightCm || widthCm * 0.4, alt: img.alt } : { kind: 'text', text: '' };
      }
      default:
        if (value === null || value === undefined) return { kind: 'text', text: '' };
        if (typeof value === 'number') return { kind: 'text', text: fmtNum(value, Number.isInteger(value) ? 0 : 2) };
        if (typeof value === 'boolean') return { kind: 'text', text: value ? 'Yes' : 'No' };
        if (Array.isArray(value)) return { kind: 'text', text: value.join(', ') };
        if (typeof value === 'object') return { kind: 'text', text: '' };
        return { kind: 'text', text: String(value) };
    }
  };
}

// Renders a template buffer against frozen snapshot data and returns a .docx buffer.
export async function renderDocx(buffer, data, { mappings = [], ctx, charts, images, metadata }) {
  const pkg = await loadDocx(buffer);
  applyMappings(pkg.parts, mappings);
  const { tokens, errors } = analyse(pkg.parts);
  const fatal = errors.filter((e) => ['unclosed', 'mismatch', 'stray-close'].includes(e.code));
  if (fatal.length) throw Object.assign(new Error(`Template structure errors: ${fatal.map((e) => e.message).join('; ')}`), { status: 422 });
  for (const part of pkg.parts) structure(part.doc, tokens.filter((t) => t.location.partName === part.name));
  const renderer = new DocxRenderer(pkg, {
    resolve,
    select: (scope, path, hash) => select(scope, path, hash, ctx),
    formatValue: makeFormatter({ ctx, charts, images }),
  });
  const zip = await renderer.render({ data, collection: null });
  if (metadata) await applyMetadata(zip, metadata);
  return { buffer: await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }), warnings: renderer.warnings };
}

// ---------- Validation (RPT-021, RPT-024, RPT-025) ----------
// Checks tokens against the catalogue in their scope and the template's audience and level.
export async function validateDocx(buffer, { audience = 'internal', level = 'engagement', mappings = [], customFields = [], clientShowsEvm = false } = {}) {
  const pkg = await loadDocx(buffer);
  applyMappings(pkg.parts, mappings);
  const { tokens, errors: structural } = analyse(pkg.parts);
  const errors = structural.map((e) => ({ ...e, where: describeLocation(e.location) }));
  const warnings = [];
  const custom = new Map(customFields.map((c) => [`custom.${c.key}`, c]));
  const found = [];
  const stack = [];
  // Stray braces that never form a token.
  for (const part of pkg.parts) {
    for (const p of Array.from(part.doc.getElementsByTagNameNS('http://schemas.openxmlformats.org/wordprocessingml/2006/main', 'p'))) {
      const text = Array.from(p.getElementsByTagNameNS('http://schemas.openxmlformats.org/wordprocessingml/2006/main', 't')).map((t) => t.textContent).join('');
      const stripped = text.replace(/\{\{[\s\S]*?\}\}/g, '');
      if (/\{\{|\}\}/.test(stripped)) errors.push({ code: 'malformed', message: `Unbalanced braces in "${text.slice(0, 60)}"`, location: { part: part.name.includes('header') ? 'Header' : part.name.includes('footer') ? 'Footer' : 'Body' }, where: part.name });
    }
  }
  const checkPath = (path, tok, kindLabel) => {
    if (!path) return null;
    if (['this', '@index', '@number', '@first', '@last'].includes(path)) return { audience: 'client' };
    // Item fields of the enclosing loops, innermost first.
    for (let i = stack.length - 1; i >= 0; i--) {
      const c = stack[i];
      if (!c) continue;
      if (c === 'engagement.projects') {
        const t = PROJECT_INDEX.get(path) || (path.startsWith('fin.') ? GLOBAL_INDEX.get(path) : null);
        if (t) return t;
        if (COLLECTIONS[path] && !['engagement.projects'].includes(path)) return COLLECTIONS[path];
        continue;
      }
      const f = itemFields(c).get(path);
      if (f) return f;
    }
    if (GLOBAL_INDEX.has(path)) return GLOBAL_INDEX.get(path);
    if (custom.has(path)) return { audience: custom.get(path).audience === 'internal' ? 'internal' : 'client', type: custom.get(path).type };
    if (COLLECTIONS[path]) return COLLECTIONS[path];
    if (PROJECT_INDEX.has(path)) {
      if (level === 'engagement' && !stack.includes('engagement.projects')) warnings.push({ message: `${tok.text} is a project token outside {{#each engagement.projects}}; it will show the first project in scope`, where: describeLocation(tok.location) });
      return PROJECT_INDEX.get(path);
    }
    errors.push({ code: 'unknown', message: `Unknown ${kindLabel} "${path}" in ${tok.text}`, token: tok.text, location: tok.location, where: describeLocation(tok.location) });
    return null;
  };
  const audienceCheck = (meta, tok, path) => {
    if (!meta) return;
    if (!allowedFor(audience, meta.audience, { clientShowsEvm })) {
      errors.push({ code: 'internal-only', message: `Internal-only token "${path}" cannot be used in a client-audience template (RPT-021)`, token: tok.text, location: tok.location, where: describeLocation(tok.location) });
    }
  };
  for (const tok of tokens) {
    const ast = tok.ast;
    found.push({ token: tok.text, kind: ast.kind, location: tok.location, where: describeLocation(tok.location) });
    if (ast.kind === 'open') {
      if (!['each', 'if', 'unless'].includes(ast.name)) { errors.push({ code: 'unknown', message: `Unknown block {{#${ast.name}}}`, token: tok.text, location: tok.location, where: describeLocation(tok.location) }); stack.push(null); continue; }
      const meta = checkPath(ast.path, tok, ast.name === 'each' ? 'collection' : 'condition');
      audienceCheck(meta, tok, ast.path);
      if (ast.name === 'each') {
        const name = collectionName(ast.path);
        if (!name) errors.push({ code: 'unknown', message: `"${ast.path}" is not a repeatable collection`, token: tok.text, location: tok.location, where: describeLocation(tok.location) });
        else {
          const c = COLLECTIONS[name];
          for (const f of String(ast.hash.filter || '').split(',').map((x) => x.trim()).filter(Boolean)) if (!c.filters.includes(f)) warnings.push({ message: `Filter "${f}" is not defined for ${name}; available: ${c.filters.join(', ')}`, where: describeLocation(tok.location) });
          if (ast.hash.limit && !/^\d+$/.test(ast.hash.limit)) errors.push({ code: 'malformed', message: `limit must be a whole number in ${tok.text}`, location: tok.location, where: describeLocation(tok.location) });
          if (audience === 'client' && c.raid) warnings.push({ message: `${name}: client audiences receive client-visible items only`, where: describeLocation(tok.location) });
        }
        stack.push(name || ast.path);
      } else stack.push(null);
      continue;
    }
    if (ast.kind === 'close') { stack.pop(); continue; }
    if (ast.kind === 'else' || ast.kind === 'error') continue;
    if (ast.kind === 'helper') {
      if (!HELPERS[ast.helper]) { errors.push({ code: 'unknown', message: `Unknown helper "${ast.helper}" in ${tok.text}`, token: tok.text, location: tok.location, where: describeLocation(tok.location) }); continue; }
      if (ast.helper === 'chart') {
        const name = ast.literal || ast.path?.replace(/^chart\./, '');
        if (!CHARTS.includes(name)) errors.push({ code: 'unknown', message: `Unknown chart "${name}"; available: ${CHARTS.join(', ')}`, token: tok.text, location: tok.location, where: describeLocation(tok.location) });
        continue;
      }
    }
    const meta = checkPath(ast.path, tok, 'token');
    audienceCheck(meta, tok, ast.path);
  }
  const hasMarking = tokens.some((t) => t.location.part !== 'Body' && t.ast.path === 'report.classification');
  if (!hasMarking) warnings.push({ message: 'No {{report.classification}} token in a header or footer: the protective marking is applied to document properties only (RPT-042)' });
  return { tokens: found, errors, warnings, ok: errors.length === 0 };
}

export { parseToken, lookupToken };
