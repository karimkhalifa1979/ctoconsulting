// Ad hoc reports (RPT-004): a saved definition chooses a reporting dataset, the columns to show, filters,
// an optional grouping with a count, sum, average, minimum or maximum, and a sort order. The same function
// runs a report in the browser and for scheduled distribution (RPT-006), so both give the same figures.
import { round, sortBy } from './util.js';

export const FILTER_OPS = [
  { id: 'eq', label: 'is' },
  { id: 'ne', label: 'is not' },
  { id: 'contains', label: 'contains' },
  { id: 'gt', label: 'is more than' },
  { id: 'gte', label: 'is at least' },
  { id: 'lt', label: 'is less than' },
  { id: 'lte', label: 'is at most' },
  { id: 'empty', label: 'is empty' },
  { id: 'notEmpty', label: 'is not empty' },
];
export const MEASURES = [
  { id: 'count', label: 'Count of rows' },
  { id: 'sum', label: 'Sum' },
  { id: 'avg', label: 'Average' },
  { id: 'min', label: 'Minimum' },
  { id: 'max', label: 'Maximum' },
];

const LABELS = {
  pct: 'PCT score', adkar: 'ADKAR elements', rag: 'Status (RAG)', riskProfile: 'Risk profile', readinessIndex: 'Readiness index', completionPct: 'Completion (%)',
  targetPct: 'Target (%)', engagementCoverage: 'Engagement coverage (%)', highImpactGroups: 'High-impact groups', headcount: 'Headcount', nextGoLive: 'Next go-live',
  durationMinutes: 'Duration (minutes)', hoursPerWeek: 'Hours a week', changeAgentTarget: 'Change agent target', trainingCompletionPct: 'Training completion (%)',
  awareness: 'Awareness', desire: 'Desire', knowledge: 'Knowledge', ability: 'Ability', reinforcement: 'Reinforcement', overallImpact: 'Overall impact',
};
export const fieldLabel = (key) => LABELS[key] || key.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase()).replace(/\b([A-Z])([a-z])/g, (m, a, b, i) => (i ? a.toLowerCase() + b : m));

// The fields of a dataset and their type, from its rows.
export function datasetFields(rows) {
  const keys = [];
  for (const r of rows.slice(0, 500)) for (const k of Object.keys(r)) if (!keys.includes(k)) keys.push(k);
  return keys.filter((k) => !/Id$/.test(k) || k === 'id').filter((k) => k !== 'id').map((key) => {
    const vals = rows.map((r) => r[key]).filter((v) => v != null && v !== '');
    const type = !vals.length ? 'text' : vals.every((v) => typeof v === 'number') ? 'number' : vals.every((v) => typeof v === 'boolean') ? 'bool' : vals.every((v) => /^\d{4}-\d{2}-\d{2}/.test(String(v))) ? 'date' : 'text';
    return { key, label: fieldLabel(key), type };
  });
}

const isEmptyValue = (v) => v == null || v === '' || (Array.isArray(v) && !v.length);
function matches(row, f, types) {
  const v = row[f.field];
  const t = types[f.field] || 'text';
  if (f.op === 'empty') return isEmptyValue(v);
  if (f.op === 'notEmpty') return !isEmptyValue(v);
  const want = f.value ?? '';
  if (t === 'bool') {
    const b = /^(true|yes|1)$/i.test(String(want));
    return f.op === 'ne' ? !!v !== b : !!v === b;
  }
  if (t === 'number' && ['gt', 'gte', 'lt', 'lte', 'eq', 'ne'].includes(f.op)) {
    const a = Number(v);
    const b = Number(want);
    if (v == null || v === '' || Number.isNaN(a) || Number.isNaN(b)) return f.op === 'ne';
    return { gt: a > b, gte: a >= b, lt: a < b, lte: a <= b, eq: a === b, ne: a !== b }[f.op];
  }
  const a = String(v ?? '').toLowerCase();
  const b = String(want).toLowerCase();
  switch (f.op) {
    case 'eq': return a === b;
    case 'ne': return a !== b;
    case 'contains': return a.includes(b);
    case 'gt': return a > b;
    case 'gte': return a >= b;
    case 'lt': return a !== '' && a < b;
    case 'lte': return a !== '' && a <= b;
    default: return true;
  }
}

export function applyFilters(rows, filters = [], fields = datasetFields(rows)) {
  const types = Object.fromEntries(fields.map((f) => [f.key, f.type]));
  const active = filters.filter((f) => f?.field && f.op && (['empty', 'notEmpty'].includes(f.op) || String(f.value ?? '') !== ''));
  return active.length ? rows.filter((r) => active.every((f) => matches(r, f, types))) : rows;
}

function aggregate(values, fn) {
  const nums = values.map(Number).filter((n) => !Number.isNaN(n));
  if (fn === 'count') return values.length;
  if (!nums.length) return null;
  if (fn === 'sum') return round(nums.reduce((a, b) => a + b, 0), 2);
  if (fn === 'avg') return round(nums.reduce((a, b) => a + b, 0) / nums.length, 2);
  if (fn === 'min') return Math.min(...nums);
  if (fn === 'max') return Math.max(...nums);
  return null;
}

// Runs a definition over a dataset's rows. Grouped reports return one row per group with its value and the
// rows behind it (for drill-down, RPT-003); others return the filtered, sorted rows.
export function runReport(rows, def = {}) {
  const fields = datasetFields(rows);
  const filtered = applyFilters(rows, def.filters, fields);
  const columns = (def.columns?.length ? def.columns : fields.slice(0, 8).map((f) => f.key)).filter((k) => fields.some((f) => f.key === k));
  if (def.groupBy && fields.some((f) => f.key === def.groupBy)) {
    const fn = def.measure?.fn || 'count';
    const by = new Map();
    for (const r of filtered) {
      const raw = r[def.groupBy];
      const key = isEmptyValue(raw) ? '(blank)' : typeof raw === 'boolean' ? (raw ? 'Yes' : 'No') : String(raw);
      if (!by.has(key)) by.set(key, []);
      by.get(key).push(r);
    }
    let groups = [...by.entries()].map(([key, list]) => ({ key, label: key, count: list.length, value: aggregate(fn === 'count' ? list : list.map((r) => r[def.measure?.field]).filter((v) => v != null && v !== ''), fn), rows: list }));
    groups = def.sort?.field === 'group' ? sortBy(groups, def.sort.dir === 'desc' ? '-key' : 'key') : sortBy(groups, (g) => (def.sort?.dir === 'asc' ? g.value ?? 0 : -(g.value ?? 0)), 'key');
    return { kind: 'grouped', fields, columns, total: filtered.length, groups, measure: { fn, field: def.measure?.field || null } };
  }
  let out = filtered;
  if (def.sort?.field && fields.some((f) => f.key === def.sort.field)) {
    const t = fields.find((f) => f.key === def.sort.field).type;
    out = sortBy(filtered, (r) => {
      const v = r[def.sort.field];
      if (v == null || v === '') return t === 'number' ? Number.NEGATIVE_INFINITY : '';
      return t === 'number' ? Number(v) : String(v).toLowerCase();
    });
    if (def.sort.dir === 'desc') out = [...out].reverse();
  }
  return { kind: 'rows', fields, columns, total: out.length, rows: def.limit ? out.slice(0, def.limit) : out };
}

// A one-paragraph summary of a result, used in scheduled report notifications.
export function summariseReport(result, name = 'Report') {
  if (result.kind === 'grouped') {
    const top = result.groups.slice(0, 5).map((g) => `${g.label}: ${g.value ?? '—'}`).join('; ');
    return `${name}: ${result.total} rows in ${result.groups.length} groups. ${top}${result.groups.length > 5 ? '; …' : ''}`;
  }
  return `${name}: ${result.total} rows.`;
}
