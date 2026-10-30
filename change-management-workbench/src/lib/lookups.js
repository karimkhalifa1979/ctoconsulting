// Options and names for reference fields, from the initiative working set or the session.
import { personName, sortBy } from '../../shared/util.js';
import { entity } from '../../shared/schema.js';
import { fmtDate } from './format.js';

export const stakeholderOption = (s) => ({ id: s.id, label: personName(s), sub: [s.positionTitle, s.organisation].filter(Boolean).join(' · ') });

export function makeLookups({ records = {}, users = [], initiatives = [], containers = [], model = null } = {}) {
  const R = (t) => records[t] || [];
  const byId = {};
  const index = (t, list) => { byId[t] = Object.fromEntries(list.map((r) => [r.id, r])); };
  for (const [t, list] of Object.entries(records)) index(t, list);
  index('user', users.length ? users : R('user'));
  if (initiatives.length) index('initiative', initiatives);
  if (containers.length) index('container', containers);

  const optionsFor = (ref) => {
    switch (ref) {
      case 'stakeholder': return sortBy(R('stakeholder').filter((s) => !s.mergedInto && s.status !== 'left'), 'familyName', 'givenName').map(stakeholderOption);
      case 'stakeholderGroup': return sortBy(R('stakeholderGroup'), 'name').map((g) => ({ id: g.id, label: g.name, sub: g.kind }));
      case 'user': return sortBy(Object.values(byId.user || {}).filter((u) => u.status !== 'left'), 'name').map((u) => ({ id: u.id, label: u.name, sub: u.email }));
      case 'milestone': return sortBy(R('milestone'), 'date').map((m) => ({ id: m.id, label: m.name, sub: fmtDate(m.date) }));
      case 'impactedGroup': return sortBy(R('impactedGroup'), 'name').map((g) => ({ id: g.id, label: g.name, sub: g.headcount ? `${Number(g.headcount).toLocaleString('en-AU')} people` : '' }));
      case 'initiative': return sortBy(Object.values(byId.initiative || {}), 'name').map((i) => ({ id: i.id, label: i.name }));
      case 'container': return sortBy(Object.values(byId.container || {}), 'name').map((c) => ({ id: c.id, label: c.name, sub: c.kind }));
      case 'changeAgent': return R('changeAgent').map((a) => ({ id: a.id, label: personName(byId.stakeholder?.[a.stakeholderId]) || a.code, sub: a.locations || '' }));
      default: {
        const list = R(ref);
        let title = (r) => r.code;
        try { const e = entity(ref); title = (r) => e.title(r) || r.code; } catch { /* unknown */ }
        return list.map((r) => ({ id: r.id, label: String(title(r) || r.code || r.id).replace(/<[^>]+>/g, ''), sub: r.code || '' }));
      }
    }
  };

  const nameOf = (ref, id) => {
    if (!id) return '';
    if (ref === 'stakeholder') return byId.stakeholder?.[id] ? personName(byId.stakeholder[id]) : '';
    if (ref === 'user') return byId.user?.[id]?.name || (id === 'system' ? 'System' : '');
    const r = byId[ref]?.[id];
    if (!r) return '';
    try { return String(entity(ref).title(r) || r.code || '').replace(/<[^>]+>/g, ''); } catch { return r.name || r.title || r.code || ''; }
  };

  return { byId, optionsFor, nameOf, get: (t, id) => byId[t]?.[id] || null, model };
}
