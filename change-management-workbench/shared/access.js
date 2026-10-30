// Access model (Section 4.2, Table 5; SEC-02, STK-048, ADM-004): by role, by record and by field.
import { ENTITIES, sensitiveKeys } from './schema.js';
import { asArray } from './util.js';

export const ROLES = [
  { id: 'changeLead', label: 'Change management lead', description: 'Accountable for the change approach; sets up initiatives, approves Blueprints, plans and artefacts.' },
  { id: 'practitioner', label: 'Change practitioner', description: 'Maintains impacts and stakeholders; plans and logs engagements; runs assessments; drafts plans and artefacts.' },
  { id: 'commsAdviser', label: 'Communications adviser', description: 'Maintains the Communications Plan, key messages and FAQs; manages approvals.' },
  { id: 'trainingLead', label: 'Training lead', description: 'Maintains training needs, interventions and schedules; tracks completion and proficiency.' },
  { id: 'pm', label: 'Project manager / PMO', description: 'Views the integrated timeline; synchronises milestones; produces status packs.' },
  { id: 'sponsor', label: 'Sponsor or coalition member', description: 'Reviews dashboards; approves the strategy and plans; confirms sponsor activities.' },
  { id: 'peopleManager', label: 'People manager', description: 'Views team impacts and key dates; completes team assessments; logs team conversations.' },
  { id: 'changeAgent', label: 'Change agent', description: 'Logs feedback and local engagements; views group-level information.' },
  { id: 'portfolio', label: 'Portfolio change manager', description: 'Reviews portfolio heatmaps and change saturation; compares initiatives.' },
  { id: 'admin', label: 'Administrator', description: 'Manages users, roles, reference data, templates, workflows and integrations.' },
  { id: 'auditor', label: 'Auditor (read-only)', description: 'Views audit trails and reports.' },
];

// Table 5 (with the communications adviser, training lead and auditor roles added). Letters are
// C create, R read, U update, D delete or archive, A approve; a suffix limits the scope.
export const MATRIX = {
  initiative: { changeLead: 'CRUA', practitioner: 'CRU', commsAdviser: 'R', trainingLead: 'R', pm: 'R', sponsor: 'RA', portfolio: 'R', auditor: 'R' },
  impact: { changeLead: 'CRUDA', practitioner: 'CRU', commsAdviser: 'R', trainingLead: 'R', pm: 'R', sponsor: 'R', peopleManager: 'R:team', changeAgent: 'R:group', portfolio: 'R', auditor: 'R' },
  assessment: { changeLead: 'CRUDA', practitioner: 'CRU', commsAdviser: 'R', trainingLead: 'R', pm: 'R', sponsor: 'R', portfolio: 'R', auditor: 'R' },
  stakeholder: { changeLead: 'CRUD', practitioner: 'CRU', commsAdviser: 'R', trainingLead: 'R', pm: 'R', sponsor: 'R', peopleManager: 'R:team', changeAgent: 'R:group', portfolio: 'R', auditor: 'R' },
  sensitive: { changeLead: 'CRU', practitioner: 'CRU:assigned' },
  engagement: { changeLead: 'CRUD', practitioner: 'CRU', commsAdviser: 'CRU', trainingLead: 'CRU', pm: 'R', sponsor: 'CRU:own', peopleManager: 'CRU:own', changeAgent: 'CRU:own', portfolio: 'R', auditor: 'R' },
  adkar: { changeLead: 'CRUDA', practitioner: 'CRU', commsAdviser: 'R', trainingLead: 'R', pm: 'R', sponsor: 'R', peopleManager: 'CRU:team', changeAgent: 'R', portfolio: 'R', auditor: 'R' },
  plans: { changeLead: 'CRUDA', practitioner: 'CRU', commsAdviser: 'CRU:comms', trainingLead: 'CRU:training', pm: 'R', sponsor: 'RA', peopleManager: 'R', changeAgent: 'R', portfolio: 'R', auditor: 'R' },
  artefacts: { changeLead: 'CRUA', practitioner: 'CR', commsAdviser: 'CR', trainingLead: 'CR', pm: 'CR:status', sponsor: 'R', peopleManager: 'R:team', portfolio: 'CR', auditor: 'R' },
  lessons: { changeLead: 'CRUD', practitioner: 'CRU', commsAdviser: 'R', trainingLead: 'R', pm: 'R', sponsor: 'R', peopleManager: 'R', changeAgent: 'R', portfolio: 'CRU', auditor: 'R', admin: 'R' },
  templates: { changeLead: 'R', practitioner: 'R', commsAdviser: 'R', trainingLead: 'R', portfolio: 'R', admin: 'CRUD', auditor: 'R' },
  config: { changeLead: 'R', practitioner: 'R', commsAdviser: 'R', trainingLead: 'R', pm: 'R', sponsor: 'R', peopleManager: 'R', changeAgent: 'R', portfolio: 'R', admin: 'CRUD', auditor: 'R' },
  users: { admin: 'CRUD', auditor: 'R' },
  audit: { changeLead: 'R', admin: 'R', auditor: 'R' },
  reports: { changeLead: 'CRUD', practitioner: 'CRU', commsAdviser: 'R', trainingLead: 'R', pm: 'CRU', sponsor: 'R', peopleManager: 'R', changeAgent: 'R', portfolio: 'CRUD', admin: 'CRUD', auditor: 'R' },
  workflow: { changeLead: 'CRUD', practitioner: 'CRUD', commsAdviser: 'CRUD', trainingLead: 'CRUD', pm: 'CRUD', sponsor: 'CRUD', peopleManager: 'CRUD', changeAgent: 'CRUD', portfolio: 'CRUD', admin: 'CRUD', auditor: 'R' },
};

// Area for each record type; ADKAR assessments use the 'adkar' area, other assessments 'assessment'.
export function areaOf(type, record) {
  if (type === 'assessment' && record?.kind === 'adkar') return 'adkar';
  return ENTITIES[type]?.area || 'workflow';
}

const COMMS_TYPES = new Set(['keyMessage', 'faq']);
const TRAINING_TYPES = new Set(['tna', 'trainingIntervention', 'trainingSession', 'proficiency', 'supportArrangement']);

// Roles with access to every initiative (portfolio-wide).
export const PORTFOLIO_ROLES = ['portfolio', 'auditor'];

export const hasRole = (user, ...roles) => asArray(user?.roles).some((r) => roles.includes(r));

export function initiativeAccess(user, initiativeId) {
  if (!user) return false;
  if (hasRole(user, ...PORTFOLIO_ROLES)) return true;
  return asArray(user.initiativeIds).includes(initiativeId);
}

function parse(entry) {
  if (!entry) return null;
  const [letters, scope] = entry.split(':');
  return { letters, scope: scope || null };
}

// Scope helpers for 'own', 'team', 'group', 'assigned', 'comms', 'training' and 'status'.
export function scopeOk(scope, user, type, record, ctx = {}) {
  if (!scope) return true;
  if (!record) return true; // list-level permission; individual records are filtered later
  const sid = user.stakeholderId;
  switch (scope) {
    case 'own':
      return record.createdBy === user.id || asArray(record.internalParticipantIds).includes(user.id) || record.relationshipOwnerId === user.id || record.ownerId === user.id
        || (!!sid && (record.senderId === sid || record.delivererId === sid || record.stakeholderId === sid || asArray(record.stakeholderIds).includes(sid)));
    case 'team': {
      const team = ctx.teamIds || new Set();
      const teamGroups = ctx.teamGroupIds || new Set();
      if (type === 'assessment') return (record.subjectType === 'team' && record.subjectId === sid) || (record.subjectType === 'stakeholder' && team.has(record.subjectId)) || (record.subjectType === 'group' && teamGroups.has(record.subjectId)) || record.createdBy === user.id;
      if (type === 'stakeholder') return record.id === sid || team.has(record.id);
      if (type === 'profile') return team.has(record.stakeholderId);
      if (type === 'impactedGroup') return teamGroups.has(record.id);
      if (type === 'impact') return teamGroups.has(record.impactedGroupId);
      if (type === 'artefact') return record.params?.managerId === sid || record.createdBy === user.id;
      return true;
    }
    case 'group': {
      const groups = ctx.agentGroupIds || new Set();
      const members = ctx.agentMemberIds || new Set();
      if (type === 'stakeholder') return record.id === sid || members.has(record.id);
      if (type === 'profile') return members.has(record.stakeholderId);
      if (type === 'impactedGroup') return groups.has(record.id);
      if (type === 'impact') return groups.has(record.impactedGroupId);
      return true;
    }
    case 'assigned':
      return record.relationshipOwnerId === user.id || record.delegateId === user.id || record.createdBy === user.id || !!ctx.allSensitive;
    case 'comms':
      return COMMS_TYPES.has(type) || (type === 'activity' && (record.kind === 'communication' || asArray(record.plans).includes('communications')));
    case 'training':
      return TRAINING_TYPES.has(type) || (type === 'activity' && asArray(record.plans).includes('training'));
    case 'status':
      return ['steeringPack', 'changeOnAPage', 'stakeholderEngagementReport', 'readinessReport'].includes(record.artefactType);
    default:
      return true;
  }
}

// Can `user` perform `action` (C, R, U, D, A) on records of `type` (optionally a specific record)?
export function can(user, action, type, record = null, ctx = {}) {
  if (!user) return false;
  const area = areaOf(type, record);
  const row = MATRIX[area] || {};
  for (const role of asArray(user.roles)) {
    const p = parse(row[role]);
    if (!p || !p.letters.includes(action)) continue;
    // Read access for comms and training advisers covers all records in the area.
    if (action === 'R' && (p.scope === 'comms' || p.scope === 'training')) return true;
    if (scopeOk(p.scope, user, type, record, ctx)) return true;
  }
  // Sponsors may confirm their own sponsor activities (SPN-005).
  if (action === 'U' && type === 'activity' && record && hasRole(user, 'sponsor') && user.stakeholderId && record.delivererId === user.stakeholderId) return true;
  return false;
}

// Field-level security for sensitive fields (STK-048, RUL-17).
export function canSeeSensitive(user, type, record, ctx = {}) {
  const row = MATRIX.sensitive;
  for (const role of asArray(user?.roles)) {
    const p = parse(row[role]);
    if (!p) continue;
    if (!p.scope) return true;
    if (p.scope === 'assigned' && ctx.practitionerScope === 'all') return true;
    if (p.scope === 'assigned' && scopeOk('assigned', user, type, record, ctx)) return true;
    // Engagement sentiment is visible to the participants who recorded it.
    if (p.scope === 'assigned' && type === 'engagement' && (record?.createdBy === user.id || asArray(record?.internalParticipantIds).includes(user.id))) return true;
  }
  return false;
}

export function redact(user, type, record, config, ctx = {}) {
  if (!record) return record;
  const keys = sensitiveKeys(type, config);
  if (!keys.length || canSeeSensitive(user, type, record, ctx)) return record;
  const out = { ...record };
  for (const k of keys) if (k in out) out[k] = undefined;
  // Individual ADKAR scores are sensitive; group results are not (AC-08).
  if (type === 'assessment' && record.subjectType !== 'stakeholder') out.scores = record.scores;
  out._redacted = keys.filter((k) => record[k] !== undefined && out[k] === undefined);
  return out;
}

// Precomputes team and change-agent group membership for record scoping.
export function scopeContext(user, model, settings = {}) {
  const ctx = { practitionerScope: settings.privacy?.practitionerSensitiveScope || 'assigned' };
  const sid = user?.stakeholderId;
  if (!sid || !model) return ctx;
  const teamIds = new Set(model.stakeholders.filter((s) => s.managerId === sid).map((s) => s.id));
  ctx.teamIds = teamIds;
  ctx.teamGroupIds = new Set(model.groups.filter((g) => [...g.memberIds].some((id) => teamIds.has(id)) || g.managerStakeholderId === sid).map((g) => g.id));
  const agentGroups = new Set(model.agents.filter((a) => a.stakeholderId === sid).flatMap((a) => asArray(a.groupIds)));
  ctx.agentGroupIds = agentGroups;
  ctx.agentMemberIds = new Set(model.groups.filter((g) => agentGroups.has(g.id)).flatMap((g) => [...g.memberIds]));
  return ctx;
}

export function roleLabel(id) {
  return ROLES.find((r) => r.id === id)?.label || id;
}

// What each role should see first (RPT-001).
export function homeDashboard(user) {
  const r = asArray(user?.roles);
  if (r.includes('changeLead') || r.includes('practitioner') || r.includes('commsAdviser') || r.includes('trainingLead')) return 'lead';
  if (r.includes('sponsor')) return 'sponsor';
  if (r.includes('pm')) return 'pm';
  if (r.includes('peopleManager')) return 'manager';
  if (r.includes('changeAgent')) return 'agent';
  if (r.includes('portfolio')) return 'portfolio';
  if (r.includes('admin')) return 'admin';
  return 'lead';
}
