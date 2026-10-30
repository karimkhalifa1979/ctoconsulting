// Business rules and sample acceptance criteria from Section 14 of the specification.
import test from 'node:test';
import assert from 'node:assert/strict';
import { barrierPoint, aggregate, groupResults } from '../shared/rules/adkar.js';
import { quadrant, engagementGap, requiredCadence, cadenceStatus, resistanceEscalation, findDuplicates, priorityScore } from '../shared/rules/stakeholders.js';
import { completionGaps, canTransition, transitionRequirements, expandOccurrences, lockDue, loadWarnings, proposeSender, blackoutFor } from '../shared/rules/engagements.js';
import { overallImpact } from '../shared/rules/impact.js';
import { riskProfile, setScore, riskRating, recommendedApproach } from '../shared/rules/risk.js';
import { makeCalendar, defaultHolidays, australianNationalHolidays } from '../shared/dates.js';
import { buildModel } from '../shared/model.js';
import { QUESTION_SETS } from '../shared/refdata.js';

test('AC-01 / RUL-01: individual barrier point is the first element at or below the threshold', () => {
  assert.equal(barrierPoint({ awareness: 4, desire: 3, knowledge: 2, ability: 2, reinforcement: 1 }, 3), 'desire');
  assert.equal(barrierPoint({ awareness: 5, desire: 4, knowledge: 4, ability: 5, reinforcement: 4 }, 3), 'none');
  assert.equal(barrierPoint({ awareness: 2, desire: 1 }, 3), 'awareness');
});

test('RUL-02: group barrier point uses the mean or the proportion of low scorers', () => {
  const r = aggregate([
    { awareness: 5, desire: 5, knowledge: 4, ability: 4, reinforcement: 4 },
    { awareness: 5, desire: 4, knowledge: 4, ability: 4, reinforcement: 4 },
    { awareness: 4, desire: 2, knowledge: 4, ability: 4, reinforcement: 4 },
    { awareness: 4, desire: 3, knowledge: 4, ability: 4, reinforcement: 4 },
    { awareness: 4, desire: 4, knowledge: 4, ability: 4, reinforcement: 4 },
  ], { threshold: 3, proportion: 0.3, minSegment: 5 });
  // Desire mean is 3.6 (above 3) but 40% scored 3 or less, so Desire is the group barrier point.
  assert.equal(r.elements.desire.score, 3.6);
  assert.equal(r.barrierPoint, 'desire');
  assert.equal(r.suppressed, false);
});

test('AC-02 / RUL-03: results for fewer respondents than the minimum segment are suppressed', () => {
  const four = Array.from({ length: 4 }, () => ({ awareness: 4, desire: 4, knowledge: 4, ability: 4, reinforcement: 4 }));
  assert.equal(aggregate(four, { minSegment: 5 }).suppressed, true);
  const res = groupResults('g1', { assessments: [{ id: 'a', kind: 'adkar', subjectType: 'group', subjectId: 'g1', method: 'self', respondents: 4, date: '2026-10-01', round: 'baseline', scores: { awareness: 4, desire: 4, knowledge: 4, ability: 4, reinforcement: 4 } }], settings: { adkar: { minSegment: 5 } } });
  assert.equal(res[0].suppressed, true);
});

test('AC-03 / RUL-06: a manage-closely stakeholder last engaged 15 days ago is overdue', () => {
  const q = quadrant('high', 'high');
  assert.equal(q, 'manageClosely');
  const cadence = requiredCadence(q, { cadenceDays: { manageClosely: 14, keepSatisfied: 30, keepInformed: 30, monitor: 90 } });
  assert.equal(cadence, 14);
  assert.equal(cadenceStatus('2026-10-07', cadence, '2026-10-22').overdue, true);
  assert.equal(cadenceStatus('2026-10-08', cadence, '2026-10-22').overdue, false);
});

test('AC-04 / STK-023: milestone-relative engagement moves with the milestone (business days)', () => {
  const holidays = defaultHolidays(2026, 2028);
  const cal = makeCalendar(holidays);
  assert.equal(cal.addBusinessDays('2027-03-01', -10), '2027-02-15');
  const item = { timingMode: 'milestone', milestoneId: 'm1', offsetBusinessDays: -10, cadence: 'oneOff' };
  assert.equal(expandOccurrences(item, { milestones: [{ id: 'm1', date: '2027-03-01' }], holidays })[0].date, '2027-02-15');
  assert.equal(expandOccurrences(item, { milestones: [{ id: 'm1', date: '2027-03-15' }], holidays })[0].date, '2027-03-01');
});

test('AC-05 / RUL-08: completion requires date, type, participants, summary and outcome', () => {
  const full = { actualDate: '2026-10-20', engagementType: 'workshop', stakeholderIds: ['s1'], summary: '<p>Discussed timing</p>', outcome: 'met' };
  assert.deepEqual(completionGaps(full), []);
  assert.deepEqual(completionGaps({ ...full, summary: '' }), ['Discussion summary']);
  assert.deepEqual(completionGaps({ ...full, outcome: null }), ['Outcome rating']);
  assert.equal(canTransition('scheduled', 'completed'), true);
  assert.equal(canTransition('cancelled', 'completed'), false);
  assert.equal(transitionRequirements('cancelled').reason, true);
  assert.equal(transitionRequirements('rescheduled').newDate, true);
});

test('AC-06 / STK-046: duplicate stakeholders are detected by email', () => {
  const existing = [{ id: 's1', givenName: 'Jane', familyName: 'Citizen', email: 'jane.citizen@example.gov.au', organisation: 'Agency' }];
  const dup = findDuplicates({ givenName: 'J', familyName: 'Citizen', email: 'Jane.Citizen@example.gov.au' }, existing);
  assert.equal(dup.length, 1);
  assert.equal(dup[0].reason, 'Same email address');
});

test('RUL-04: power/interest quadrants', () => {
  assert.equal(quadrant('high', 'medium'), 'keepSatisfied');
  assert.equal(quadrant('low', 'high'), 'keepInformed');
  assert.equal(quadrant('medium', 'medium'), 'keepInformed');
  assert.equal(quadrant('medium', 'low'), 'monitor');
});

test('RUL-05: engagement gap and priority flag', () => {
  assert.deepEqual(engagementGap('neutral', 'leading'), { gap: 2, priority: true });
  assert.deepEqual(engagementGap('supportive', 'leading'), { gap: 1, priority: false });
  assert.equal(engagementGap('resistant', 'neutral').priority, true);
});

test('RUL-07: load and blackout warnings', () => {
  const existing = [1, 2, 3].map((d) => ({ id: `e${d}`, status: 'scheduled', plannedDate: `2027-02-0${d}`, stakeholderIds: ['s1'] }));
  const w = loadWarnings({ occurrences: [{ date: '2027-02-04' }], audienceIds: ['s1'] }, { existing, settings: { load: { stakeholderMaxPer7Days: 3 } } });
  assert.equal(w.filter((x) => x.kind === 'stakeholderLoad').length, 1);
  assert.equal(blackoutFor('2027-06-30', [{ name: 'EOFY', start: '06-20', end: '07-10', annual: true }])?.name, 'EOFY');
  assert.equal(blackoutFor('2027-01-02', [{ name: 'Xmas', start: '12-22', end: '01-05', annual: true }])?.name, 'Xmas');
});

test('RUL-10: completed engagements lock after ten business days', () => {
  const e = { status: 'completed', actualDate: '2026-10-01', statusHistory: [{ to: 'completed', at: '2026-10-01T05:00:00Z' }] };
  assert.equal(lockDue(e, '2026-10-14', { lockBusinessDays: 10, holidays: [] }), false);
  assert.equal(lockDue(e, '2026-10-15', { lockBusinessDays: 10, holidays: [] }), true);
});

test('RUL-11: preferred sender', () => {
  const ctx = { initiative: { primarySponsorId: 'sp' }, stakeholders: [{ id: 's1', managerId: 'm1' }] };
  assert.equal(proposeSender({ messageFocus: 'businessReasons' }, ctx).senderId, 'sp');
  assert.equal(proposeSender({ messageFocus: 'personalImpacts', stakeholderIds: ['s1'] }, ctx).senderId, 'm1');
});

test('RUL-12: resistance escalation for high-influence stakeholders', () => {
  assert.ok(resistanceEscalation({ influence: 'high', currentEngagement: 'resistant' }));
  assert.ok(resistanceEscalation({ influence: 'high', sentiments: [{ sentiment: 'negative' }, { sentiment: 'veryNegative' }] }));
  assert.equal(resistanceEscalation({ influence: 'medium', currentEngagement: 'resistant' }), null);
});

test('RUL-13 and RUL-14: risk profile and planning approach', () => {
  assert.equal(riskProfile(30, 35), 'low');
  assert.equal(riskProfile(60, 75), 'high');
  assert.equal(riskProfile(30, 70), 'medium');
  const all5 = Object.fromEntries(QUESTION_SETS.changeCharacteristics.items.map((q) => [q.id, 5]));
  assert.equal(setScore({ kind: 'changeCharacteristics', scores: all5 }), 100);
  assert.equal(recommendedApproach('high').id, 'full');
  assert.equal(riskRating(5, 5), 'extreme');
});

test('RUL-20: impact roll-up uses the highest aspect score; 4 or more is high impact', () => {
  const r = overallImpact([{ aspect: 'systems', degree: 5 }, { aspect: 'processes', degree: 3 }, { aspect: 'jobRoles', degree: 2, level: 'role', subject: 'Team leader' }]);
  assert.equal(r.overall, 5);
  assert.equal(r.high, true);
  assert.equal(r.degrees.jobRoles, 2);
  assert.equal(overallImpact([{ aspect: 'systems', degree: 3 }]).high, false);
});

test('STK-015: priority score is between 0 and 100', () => {
  const s = priorityScore({ influence: 'high', impact: 5, gap: 4, barrier: 'awareness', roles: ['primarySponsor'] });
  assert.equal(s, 100);
  assert.ok(priorityScore({ influence: 'low', impact: 1, gap: 0, roles: ['vendor'] }) < 30);
});

test('Australian national holidays include Easter and observed days', () => {
  const h = australianNationalHolidays(2027).map((x) => x.date);
  assert.ok(h.includes('2027-03-26')); // Good Friday 2027
  assert.ok(h.includes('2027-03-29')); // Easter Monday 2027
  assert.ok(h.includes('2027-12-27')); // Christmas Day observed (25th is a Saturday)
});

test('AC-11 / PLN-005: an unaddressed barrier point produces a coverage warning naming the group and element', () => {
  const data = {
    initiative: { id: 'i1', name: 'Test' },
    records: {
      impactedGroup: [{ id: 'g1', name: 'Claims officers', headcount: 100 }],
      impact: [{ id: 'x', impactedGroupId: 'g1', aspect: 'systems', degree: 3 }],
      assessment: [{ id: 'a1', kind: 'adkar', subjectType: 'group', subjectId: 'g1', method: 'practitioner', round: 'baseline', date: '2026-10-01', scores: { awareness: 4, desire: 4, knowledge: 2, ability: 2, reinforcement: 2 } }],
      activity: [{ id: 'act1', title: 'Briefing', plans: ['communications'], adkar: ['awareness'], groupIds: ['g1'], status: 'notStarted' }],
    },
  };
  const m = buildModel(data, { today: '2026-10-22' });
  assert.equal(m.groups[0].barrierPoint, 'knowledge');
  const w = m.coverage.find((x) => x.kind === 'barrierUnaddressed');
  assert.ok(w, 'expected a barrier coverage warning');
  assert.match(w.message, /Claims officers/);
  assert.match(w.message, /Knowledge/);
});
