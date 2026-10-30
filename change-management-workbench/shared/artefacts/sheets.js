// Excel extracts of registers (ART-030): the Stakeholder Engagement Report, Communications Plan and
// Training Plan. Workbooks are { meta, sheets: [{ name, columns: [{ header, key, width, type }], rows }] };
// date columns are written as real Excel dates.
import { addDays } from '../dates.js';
import { sortBy } from '../util.js';
import { adkarList, labeller } from './ir.js';
import { QUADRANT_LABELS, helpers } from './sections.js';

const col = (header, key, width = 16, type = 'text') => ({ header, key, width, type });

function engagementReport(s, { params }) {
  const L = labeller(s);
  const from = params.from || addDays(s.today, -30);
  const to = params.to || s.today;
  const es = s.engagements.filter((e) => e.date && e.date >= from && e.date <= to && e.status !== 'cancelled');
  return {
    meta: { title: 'Stakeholder Engagement Report' },
    sheets: [
      { name: 'Engagements', columns: [col('ID', 'code', 10), col('Date', 'date', 12, 'date'), col('Planned date', 'plannedDate', 12, 'date'), col('Status', 'status', 14), col('Engagement', 'objective', 44), col('With', 'audience', 36), col('Type', 'type', 20), col('Channel', 'channel', 16), col('ADKAR', 'adkar', 24), col('Outcome', 'outcome', 16), col('Planned', 'planned', 10), col('Follow up by', 'followUpDate', 12, 'date')],
        rows: sortBy(es, 'date').map((e) => ({ ...e, status: L('engagementStatus', e.status), type: L('engagementType', e.type), channel: L('channel', e.channel), adkar: adkarList(e.adkar), outcome: L('outcomeRating', e.outcome), planned: e.planned ? 'Yes' : 'No' })) },
      { name: 'Coverage', columns: [col('Stakeholder', 'name', 28), col('Position', 'position', 32), col('Quadrant', 'quadrant', 16), col('Required every (days)', 'cadenceDays', 12, 'number'), col('Last engaged', 'lastEngaged', 12, 'date'), col('Next planned', 'nextPlanned', 12, 'date'), col('Within cadence', 'within', 12), col('Relationship owner', 'relationshipOwner', 20)],
        rows: sortBy(s.profiles.filter((p) => p.cadenceDays), 'name').map((p) => ({ ...p, quadrant: QUADRANT_LABELS[p.quadrant] || '', within: p.cadenceOverdue ? 'No' : 'Yes' })) },
    ],
  };
}

function commsPlan(s) {
  const L = labeller(s);
  const x = helpers(s);
  return {
    meta: { title: 'Communications Plan and Calendar' },
    sheets: [{
      name: 'Communications',
      columns: [col('ID', 'code', 10), col('Date', 'start', 12, 'date'), col('Communication', 'title', 44), col('Objective', 'objective', 40), col('Audience', 'audience', 30), col('Key messages', 'keyMessages', 30), col('Sender', 'deliverer', 20), col('Channel', 'channel', 16), col('Message focus', 'focus', 18), col('ADKAR', 'adkar', 22), col('Status', 'status', 14)],
      rows: sortBy(s.activities.filter((a) => a.kind === 'communication' && a.status !== 'cancelled'), (a) => a.start || '9999').map((a) => ({ ...a, audience: a.groups.map(x.groupName).filter(Boolean).join(', ') || a.audience || 'All staff', keyMessages: a.keyMessages.join('; '), focus: L('messageFocus', a.messageFocus), adkar: adkarList(a.adkar), status: L('commsStatus', a.commsStatus) })),
    }],
  };
}

function trainingPlan(s) {
  const L = labeller(s);
  return {
    meta: { title: 'Training Plan and Training Needs Analysis' },
    sheets: [
      { name: 'Needs analysis', columns: [col('Group', 'group', 28), col('Role', 'role', 22), col('Knowledge and skills required', 'requirement', 48), col('Current (1–5)', 'current', 10, 'number'), col('Required (1–5)', 'required', 10, 'number'), col('Gap', 'gap', 8, 'number'), col('Priority', 'priority', 12), col('Learning objectives', 'objectives', 44), col('Interventions', 'interventions', 36)],
        rows: s.tnas.map((t) => ({ ...t, priority: L('priority', t.priority), interventions: t.interventions.join('; ') })) },
      { name: 'Interventions', columns: [col('Intervention', 'title', 36), col('Modality', 'modality', 16), col('Hours', 'durationHours', 8, 'number'), col('Audience', 'audience', 36), col('Timing', 'timing', 30), col('Completion target (%)', 'target', 12, 'number'), col('Change-role training', 'forChangeRoles', 12), col('LMS course', 'lmsCourseId', 14), col('Owner', 'owner', 18)],
        rows: s.interventions.map((iv) => ({ ...iv, modality: L('trainingModality', iv.modality), audience: iv.audience.join(', '), forChangeRoles: iv.forChangeRoles ? 'Yes' : 'No' })) },
      { name: 'Sessions', columns: [col('Date', 'date', 12, 'date'), col('Time', 'time', 8), col('Intervention', 'intervention', 36), col('Location', 'location', 26), col('Trainer', 'trainer', 20), col('Capacity', 'capacity', 10, 'number'), col('Enrolled', 'enrolled', 10, 'number'), col('Attended', 'attended', 10, 'number'), col('Completed', 'completed', 10, 'number'), col('Status', 'status', 12)],
        rows: sortBy(s.sessions, 'date') },
      { name: 'Completion by group', columns: [col('Group', 'name', 32), col('People in scope', 'people', 14, 'number'), col('Fully trained', 'full', 14, 'number'), col('Completion (%)', 'pct', 14, 'number')],
        rows: s.groups.filter((g) => g.training.applicable).map((g) => ({ name: g.name, people: g.training.denominator, full: g.training.completed, pct: g.training.pct })) },
    ],
  };
}

export const SHEETS = { engagementReport, commsPlan, trainingPlan };

export function buildWorkbook(s, artefactType, ctx) {
  const fn = SHEETS[artefactType];
  if (!fn) throw new Error(`No Excel extract for ${artefactType}.`);
  return fn(s, ctx);
}
