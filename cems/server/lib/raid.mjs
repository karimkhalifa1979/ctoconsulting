// RAID helpers (RAI-008..010, ENG-009): default report-inclusion rules, the combined RAID view,
// ageing and items overdue for review.
import { RAID_TYPES, ENTITIES } from '../../shared/schema.js';
import { todayIn } from '../../shared/dates.js';

export function createRaid(app) {
  const { settings } = app;

  // RAI-009 / BR-15: open High and Extreme risks, high-severity issues, overdue client dependencies,
  // decisions required. An explicit Include or Exclude overrides the rule.
  function reportable(rec) {
    if (rec.include_in_report === 'Include') return true;
    if (rec.include_in_report === 'Exclude') return false;
    const rules = settings.get('raidReportRules');
    const today = todayIn(settings.tz());
    switch (rec.type) {
      case 'risk': return rec.status === 'Open' && (rules.riskLevels.includes(rec.residual_level || rec.inherent_level) || Boolean(rec.escalated));
      case 'issue': return !['Resolved', 'Closed'].includes(rec.status) && rules.issueSeverities.includes(rec.severity);
      case 'dependency': return rules.overdueClientDependencies && rec.dep_type === 'Client' && ['Open', 'At risk'].includes(rec.status) && rec.need_by && rec.need_by < today;
      case 'decision': return rules.decisionsRequired && rec.status === 'Required';
      case 'action': return rec.owner_org === 'Client' && ['Open', 'In progress'].includes(rec.status) && rec.due_date && rec.due_date < today;
      default: return false;
    }
  }

  // RAI-008: one list across all RAID registers, filtered by access and options.
  function combined(ctx, { engagement_id: engagementId, project_id: projectId, types, open, q, owner, overdue, escalated } = {}) {
    const wanted = (types ? String(types).split(',') : RAID_TYPES).filter((t) => RAID_TYPES.includes(t));
    let rows = [];
    for (const t of wanted) {
      const query = { engagement_id: engagementId };
      if (projectId) query.project_id = projectId;
      rows.push(...app.entities.list(ctx, t, query).map((r) => ({ ...r, type: t, type_label: ENTITIES[t].label })));
    }
    if (open === '1' || open === true) rows = rows.filter((r) => !(ENTITIES[r.type].closed || []).includes(r.status));
    if (owner) rows = rows.filter((r) => r.owner_id === owner);
    if (overdue === '1') rows = rows.filter((r) => r.overdue || r.review_overdue);
    if (escalated === '1') rows = rows.filter((r) => r.escalated);
    if (q) {
      const s = String(q).toLowerCase();
      rows = rows.filter((r) => [r.ref, r.title, r.description, r.event].some((v) => v && String(v).toLowerCase().includes(s)));
    }
    return rows.sort((a, b) => String(a.ref).localeCompare(String(b.ref), undefined, { numeric: true }));
  }

  return { reportable, combined };
}
