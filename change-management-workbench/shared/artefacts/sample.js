// Fictional sample data for testing templates before they are published (ART-026). It is run through the
// same model and snapshot code as real initiatives, so a test document shows every section populated.
import { buildModel } from '../model.js';
import { buildSnapshot } from './snapshot.js';
import { addDays } from '../dates.js';

const TODAY = '2026-03-02';
let seq = 0;
const id = (p) => `${p}-${++seq}`;

export function sampleData() {
  seq = 0;
  const d = (n) => addDays(TODAY, n);
  const users = [{ id: 'u-lead', name: 'Alex Morgan', roles: ['changeLead'] }, { id: 'u-prac', name: 'Sam Lee', roles: ['practitioner'] }];
  const people = [
    ['s-sponsor', 'Jordan', 'Reid', 'Deputy Secretary, Service Delivery'], ['s-owner', 'Casey', 'Ward', 'General Manager, Operations'], ['s-m1', 'Robin', 'Tan', 'Team Leader, Processing'],
    ['s-m2', 'Taylor', 'Nguyen', 'Team Leader, Customer Contact'], ['s-a1', 'Jamie', 'Fox', 'Processing Officer'], ['s-a2', 'Riley', 'Chen', 'Customer Service Officer'],
  ].map(([sid, g, f, pos]) => ({ id: sid, givenName: g, familyName: f, positionTitle: pos, organisation: 'Sample Department', status: 'active', managerId: ['s-a1'].includes(sid) ? 's-m1' : ['s-a2'].includes(sid) ? 's-m2' : null }));
  const groups = [
    { id: 'g-proc', name: 'Processing teams', headcount: 120, definition: 'Staff who assess and process applications', confirmationStatus: 'confirmed', managerStakeholderId: 's-m1', wiifm: 'Less re-keying and fewer errors' },
    { id: 'g-cc', name: 'Customer contact centre', headcount: 80, definition: 'Staff who answer customer enquiries', confirmationStatus: 'confirmed', managerStakeholderId: 's-m2', wiifm: 'One view of each customer' },
    { id: 'g-cust', name: 'Customers', headcount: 40000, definition: 'People who apply online', agentTarget: 0 },
  ].map((g) => ({ ...g, initiativeId: 'i-sample' }));
  const imp = (gid, aspect, degree, from, to, desc) => ({ id: id('imp'), initiativeId: 'i-sample', impactedGroupId: gid, aspect, degree, level: 'group', currentState: from, futureState: to, description: desc, milestoneId: 'm-golive' });
  const act = (title, plans, adkar, start, days, status, extra = {}) => ({ id: id('act'), initiativeId: 'i-sample', title, plans, adkar, startDate: d(start), endDate: d(start + days), status, percentComplete: status === 'complete' ? 100 : status === 'inProgress' ? 50 : 0, ownerId: 'u-prac', ...extra });
  const profile = (sid, roles, influence, interest, cur, des) => ({ id: id('pro'), initiativeId: 'i-sample', subjectType: 'person', stakeholderId: sid, changeRoles: roles, influence, interest, currentEngagement: cur, desiredEngagement: des, relationshipOwnerId: 'u-lead', createdAt: `${d(-60)}T00:00:00.000Z` });
  return {
    initiative: {
      id: 'i-sample', code: 'INI-001', name: 'Sample Online Applications Initiative', shortName: 'Online Applications', status: 'active', startDate: d(-90), endDate: d(240), primarySponsorId: 's-sponsor', businessOwnerId: 's-owner', changeLeadId: 'u-lead',
      description: '<p>Replaces paper and email applications with a single online application and processing workflow.</p>', reasonForChange: '<p>Applications take too long and errors are common because details are re-keyed into three systems.</p>',
      whyNow: '<p>The paper forms supplier contract ends next year.</p>', riskOfNotChanging: '<p>Processing times continue to grow and customer complaints rise.</p>', whatIsChanging: '<p>One online form and one processing workflow.</p>', whatIsNotChanging: '<p>Eligibility rules.</p>',
      adoptionDefinition: '<p>Every application is lodged and processed online, with no re-keying.</p>', selectedPlans: ['blueprint', 'sponsor', 'peopleManager', 'communications', 'training', 'resistance'],
    },
    records: {
      user: users,
      stakeholder: people,
      impactedGroup: groups,
      milestone: [{ id: 'm-design', initiativeId: 'i-sample', name: 'Design sign-off', kind: 'designSignOff', date: d(-30), status: 'achieved' }, { id: 'm-golive', initiativeId: 'i-sample', name: 'Go-live', kind: 'goLive', date: d(60), status: 'planned' }, { id: 'm-hyper', initiativeId: 'i-sample', name: 'Hypercare exit', kind: 'hypercareExit', date: d(120), status: 'planned' }],
      objective: [{ id: id('obj'), initiativeId: 'i-sample', title: 'Halve processing time', description: 'From 20 to 10 business days', benefits: 'Faster decisions for customers' }],
      measure: [
        { id: 'me-1', initiativeId: 'i-sample', name: 'Applications lodged online', category: 'individual', subtype: 'ultimateUtilisation', unit: '%', baseline: 0, target: 95, direction: 'higher', threshold: 60, ownerId: 'u-prac', frequency: 'monthly', dataSource: 'Application system' },
        { id: 'me-2', initiativeId: 'i-sample', name: 'Average processing time (days)', category: 'organisational', subtype: 'benefit', unit: ' days', baseline: 20, target: 10, direction: 'lower', ownerId: 'u-lead', frequency: 'monthly' },
      ],
      measureValue: [{ id: id('mv'), initiativeId: 'i-sample', measureId: 'me-1', date: d(-30), value: 10 }, { id: id('mv'), initiativeId: 'i-sample', measureId: 'me-1', date: d(-1), value: 35 }, { id: id('mv'), initiativeId: 'i-sample', measureId: 'me-2', date: d(-1), value: 18 }],
      impact: [imp('g-proc', 'processes', 5, 'Paper and email', 'Online workflow', 'All processing moves online'), imp('g-proc', 'systems', 4, 'Three systems', 'One system', 'New processing system'), imp('g-cc', 'tools', 3, 'Separate screens', 'Single customer view', 'New customer view'), imp('g-cust', 'processes', 2, 'Paper forms', 'Online form', 'Apply online')],
      profile: [profile('s-sponsor', ['primarySponsor'], 'high', 'high', 'supportive', 'leading'), profile('s-owner', ['businessOwner'], 'high', 'high', 'neutral', 'supportive'), profile('s-m1', ['peopleManager'], 'medium', 'high', 'supportive', 'supportive'), profile('s-m2', ['peopleManager'], 'medium', 'high', 'neutral', 'supportive')],
      assessment: [
        { id: id('as'), initiativeId: 'i-sample', kind: 'adkar', subjectType: 'group', subjectId: 'g-proc', round: 'baseline', method: 'practitioner', date: d(-20), scores: { awareness: 4, desire: 2.5, knowledge: 2, ability: 1.5, reinforcement: 1 }, confirmed: true },
        { id: id('as'), initiativeId: 'i-sample', kind: 'adkar', subjectType: 'group', subjectId: 'g-cc', round: 'baseline', method: 'practitioner', date: d(-20), scores: { awareness: 4.5, desire: 4, knowledge: 3, ability: 2.5, reinforcement: 2 }, confirmed: true },
        { id: id('as'), initiativeId: 'i-sample', kind: 'changeCharacteristics', subjectType: 'initiative', date: d(-80), scores: { cc1: 3, cc2: 3, cc3: 3, cc4: 4, cc5: 4, cc6: 3, cc7: 2, cc8: 3, cc9: 3, cc10: 3 } },
        { id: id('as'), initiativeId: 'i-sample', kind: 'orgAttributes', subjectType: 'initiative', date: d(-80), scores: { oa1: 3, oa2: 3, oa3: 4, oa4: 3, oa5: 2, oa6: 3, oa7: 3, oa8: 2, oa9: 3, oa10: 3 } },
      ],
      blueprint: [{ id: id('bp'), initiativeId: 'i-sample', name: 'Organisation ADKAR Blueprint', scope: 'organisation', status: 'approved', elements: { awareness: { desiredOutcome: 'Everyone understands why applications are moving online.', indicators: 'Awareness of 4 or more', barriers: 'Change fatigue', rootCauses: 'Several changes at once', measures: 'ADKAR pulse' }, desire: { desiredOutcome: 'Staff choose to use the new workflow.', indicators: 'Desire of 3.5 or more', barriers: 'Fear of new system', rootCauses: 'Past system failures', measures: 'Resistance register' }, knowledge: { desiredOutcome: 'Staff know how to process online.', measures: 'Training completion' }, ability: { desiredOutcome: 'Staff process online without help.', measures: 'Proficiency checks' }, reinforcement: { desiredOutcome: 'Online processing is the only way.', measures: 'Usage reports' } } }],
      activity: [
        act('Sponsor announcement of the change', ['sponsor', 'communications'], ['awareness'], -40, 1, 'complete', { kind: 'communication', commsStatus: 'sent', delivererId: 's-sponsor', channel: 'Email', groupIds: ['g-proc', 'g-cc'] }),
        act('Manager briefing on the new workflow', ['peopleManager'], ['awareness', 'desire'], -10, 5, 'complete', { groupIds: ['g-proc', 'g-cc'] }),
        act('Team conversations about what changes', ['peopleManager'], ['desire'], 0, 14, 'inProgress', { groupIds: ['g-proc'] }),
        act('Online workflow training', ['training'], ['knowledge'], 20, 20, 'notStarted', { groupIds: ['g-proc', 'g-cc'] }),
        act('Practice environment sessions', ['training'], ['ability'], 35, 15, 'notStarted', { groupIds: ['g-proc'] }),
        act('Go-live countdown message', ['communications'], ['awareness'], 50, 1, 'notStarted', { kind: 'communication', commsStatus: 'draft', delivererId: 's-owner', channel: 'Intranet' }),
        act('Recognise teams processing fully online', ['sponsor'], ['reinforcement'], 90, 30, 'notStarted', { delivererId: 's-sponsor' }),
      ],
      keyMessage: [{ id: id('km'), initiativeId: 'i-sample', title: 'Why we are moving online', text: 'Online applications remove re-keying so decisions are faster and more accurate.', status: 'approved', messageFocus: 'businessReasons', adkar: ['awareness'], messageVersion: 1 }],
      faq: [{ id: id('faq'), initiativeId: 'i-sample', question: 'Will paper forms still be accepted?', answer: 'Yes, for three months after go-live, then they will be scanned on arrival.', status: 'approved', published: true }],
      trainingIntervention: [{ id: 'tr-1', initiativeId: 'i-sample', title: 'Online workflow essentials', modality: 'virtual', durationHours: 2, audienceGroupIds: ['g-proc', 'g-cc'], ownerId: 'u-prac', milestoneId: 'm-golive', offsetDays: -10, targetCompletion: 95 }, { id: 'tr-2', initiativeId: 'i-sample', title: 'Leading your team through the change', modality: 'virtual', durationHours: 1, forChangeRoles: true, targetCompletion: 100 }],
      trainingSession: [{ id: id('ses'), initiativeId: 'i-sample', interventionId: 'tr-2', date: d(-15), location: 'Online', trainer: 'Sam Lee', capacity: 20, status: 'completed', enrolments: [{ stakeholderId: 's-m1', attended: true, completed: true }, { stakeholderId: 's-m2', attended: true, completed: true }] }],
      risk: [{ id: id('rk'), initiativeId: 'i-sample', kind: 'risk', title: 'Training clashes with peak processing', likelihood: 4, consequence: 4, status: 'open', ownerId: 'u-lead', treatment: 'Schedule training outside the end-of-month peak' }],
      resistance: [{ id: id('rs'), initiativeId: 'i-sample', kind: 'anticipated', title: 'Preference for paper files', sourceType: 'group', groupId: 'g-proc', form: 'workarounds', rootCause: 'Familiarity with paper', barrierPoint: 'desire', severity: 'medium', preventionActions: 'Show the time saved with real cases', responsibleRole: 'peopleManager', status: 'monitoring' }],
      strategy: [{ id: id('str'), initiativeId: 'i-sample', status: 'approved', approvedVersion: '1.0', approach: 'core', summary: '<p>A medium-risk change for two internal groups and the public.</p>', governance: [{ name: 'Project board', chair: 'Jordan Reid', frequency: 'Monthly', purpose: 'Decisions and escalations' }], changeTeam: [{ role: 'Change lead', person: 'Alex Morgan', allocation: 1, responsibilities: 'Change approach and plans' }] }],
      narrative: [{ id: id('nar'), initiativeId: 'i-sample', key: 'executiveSummary', title: 'Executive summary', content: '<p>The change is on track for go-live. Desire is the barrier point for processing teams; team conversations are under way.</p>' }],
      coalitionMember: [{ id: id('co'), initiativeId: 'i-sample', stakeholderId: 's-owner', area: 'Operations', currentSupport: 'neutral', desiredSupport: 'supportive', alignmentActions: 'Monthly one-to-one with the sponsor', status: 'inProgress' }],
    },
  };
}

export function sampleSnapshot(params = {}) {
  const model = buildModel(sampleData(), { config: { settings: { organisationName: 'Sample Department' } }, today: TODAY });
  return buildSnapshot(model, { artefactType: params.artefactType || 'strategy', ...params }, { takenAt: `${TODAY}T00:00:00.000Z` });
}
