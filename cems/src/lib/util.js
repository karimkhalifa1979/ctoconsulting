// Small helpers shared by pages.
import { ENTITIES } from '../../shared/schema.js';

export const initials = (name = '') => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();

// Where a record lives in the UI (used by search, notifications and links).
export function recordLink(entity, rec) {
  if (!rec) return '#';
  if (entity === 'engagement') return `/engagements/${rec.id}`;
  if (entity === 'project') return `/projects/${rec.id}`;
  if (entity === 'client') return `/clients/${rec.id}`;
  if (entity === 'person') return `/resources/people?open=${rec.id}`;
  const tab = { risk: 'raid', issue: 'raid', assumption: 'raid', dependency: 'raid', decision: 'raid', action: 'raid', change: 'changes', deliverable: 'scope', quality_review: 'scope', milestone: 'plan', work_item: 'plan',
    allocation: 'resources', resource_request: 'resources', expense: 'financials', invoice: 'financials', billing_event: 'financials', document: 'documents', lesson: 'lessons', benefit: 'lessons',
    stakeholder: 'governance', comm_plan: 'governance', meeting: 'governance', distribution_list: 'governance', contract: 'commercial', po: 'commercial', funding: 'commercial' }[entity] || '';
  const params = `?open=${rec.id}&entity=${entity}`;
  if (rec.project_id && !['contract', 'po', 'funding', 'stakeholder', 'comm_plan', 'distribution_list'].includes(entity)) return `/projects/${rec.project_id}/${tab}${params}`;
  if (rec.engagement_id) return `/engagements/${rec.engagement_id}/${tab}${params}`;
  return '#';
}

export const entityLabel = (name) => ENTITIES[name]?.label || name;
export const titleOf = (name, rec) => (rec ? [rec.ref, rec[ENTITIES[name]?.title] ?? rec.name ?? rec.title].filter(Boolean).join(' ') : '');

export function sortBy(rows, key, dir = 1) {
  return [...rows].sort((a, b) => {
    const x = typeof key === 'function' ? key(a) : a[key];
    const y = typeof key === 'function' ? key(b) : b[key];
    if (x === y) return 0;
    if (x === undefined || x === null || x === '') return 1;
    if (y === undefined || y === null || y === '') return -1;
    return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), 'en-AU', { numeric: true })) * dir;
  });
}

export const sum = (xs, f = (x) => x) => xs.reduce((a, x) => a + (Number(f(x)) || 0), 0);
export const unique = (xs) => [...new Set(xs)];
