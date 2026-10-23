// Demonstration data set: one organisation with three initiatives at different points in the
// 3-Phase Process. Dates are written against an anchor date and shifted by whole weeks to the current
// date, so the data always looks current. Generation is deterministic.
import { ENTITIES, fieldsOf } from '../schema.js';
import { validateRecord } from '../validate.js';
import { ADKAR_IDS, ADKAR_SURVEY_ITEMS, QUESTION_SETS, READINESS_CHECKLISTS, DEFAULT_SETTINGS } from '../refdata.js';
import { aggregate } from '../rules/adkar.js';
import { addDays, diffDays, makeCalendar, defaultHolidays } from '../dates.js';
import { uid, rng, clone, asArray, clamp, uniq } from '../util.js';
import { ORG, GROUPS, PEOPLE, AGENTS, USERS, teamMembers } from './people.js';
import { approvalNotice, cadenceKey, cadenceNotice, measureKey, measureNotice } from '../service/notices.js';

export const DEMO_ANCHOR = '2026-10-22';
const p = (...xs) => xs.map((x) => `<p>${x}</p>`).join('');
const ul = (...xs) => `<ul>${xs.map((x) => `<li>${x}</li>`).join('')}</ul>`;

export async function seedDemo(S, { setPassword, today } = {}) {
  const realToday = today || (await S.today());
  // Whole weeks keep meetings on the same weekdays; the data is between zero and six days old.
  const OFF = Math.floor(diffDays(DEMO_ANCHOR, realToday) / 7) * 7;
  const D = (iso) => (iso ? addDays(iso, OFF) : null);
  const T = (iso, hh = '05:00') => `${D(iso)}T${hh}:00.000Z`;
  const TODAY = D(DEMO_ANCHOR);
  const rand = rng(20261022);
  const cal = makeCalendar(defaultHolidays(2024, 2032));
  const config = await S.getConfig();
  const NOW = T(DEMO_ANCHOR, '01:00');
  const counts = {};

  async function mk(type, data, { by = 'system', at } = {}) {
    const meta = ENTITIES[type];
    const initiativeId = meta.scope === 'initiative' || meta.scope === 'any' ? data.initiativeId ?? null : null;
    const base = {};
    for (const fd of fieldsOf(type, config)) if (fd.default !== undefined) base[fd.key] = clone(fd.default);
    const rec = { ...base, ...data, id: data.id || uid(), type, initiativeId, code: data.code || (await S.makeCode(type, initiativeId)), version: 1, createdAt: at || NOW, createdBy: by, updatedAt: at || NOW, updatedBy: by };
    const errs = validateRecord(type, rec, config, { ctx: { customPlans: [] } });
    if (errs.length) throw new Error(`Demo ${type}: ${errs.map((e) => e.message).join('; ')} — ${JSON.stringify(data).slice(0, 160)}`);
    await S.driver.put(rec);
    counts[type] = (counts[type] || 0) + 1;
    return rec;
  }
  const put = async (rec, patch) => {
    const next = { ...rec, ...patch, version: rec.version + 1 };
    await S.driver.put(next);
    return next;
  };
  // A completed (or, after ten business days, locked) engagement record.
  const logged = (I, owner, { date, time = '10:00', minutes = 45, type, channel, stakeholderIds = [], groupIds = [], attendance = [], purpose, adkar, summary, sentiments = [], outcome = 'met', senderId = null, planItemId = null, extra = {} }) => {
    const locked = cal.businessDaysBetween(D(date), TODAY) >= 10;
    return mk('engagement', {
      initiativeId: I, planItemId, status: locked ? 'locked' : 'completed', unplanned: !planItemId, actualDate: D(date), plannedDate: planItemId ? D(date) : null, startTime: time, durationMinutes: minutes,
      engagementType: type, channel, stakeholderIds, groupIds, attendance, internalParticipantIds: [owner], senderId, purpose, objective: purpose, adkar, summary: p(summary),
      sentiments, outcome, concerns: [], statusHistory: [{ at: T(date, '07:00'), by: owner, from: null, to: 'completed' }, ...(locked ? [{ at: `${cal.addBusinessDays(D(date), 10)}T20:00:00.000Z`, by: 'system', from: 'completed', to: 'locked', reason: 'Locked after 10 business days (RUL-10)' }] : [])],
      lockedAt: locked ? `${cal.addBusinessDays(D(date), 10)}T20:00:00.000Z` : null, ...extra,
    }, { by: owner, at: T(date, '07:00') });
  };
  // Completes the past occurrences of a plan item.
  async function logOccurrences(I, item, { summaries, sentimentFor = () => 'positive', outcome = () => 'met' }) {
    const occ = (await S.driver.list('engagement', { initiativeId: I })).filter((e) => e.planItemId === item.id).sort((a, b) => a.plannedDate.localeCompare(b.plannedDate));
    let i = 0;
    for (const e of occ) {
      if (e.plannedDate >= TODAY) continue;
      const locked = cal.businessDaysBetween(e.plannedDate, TODAY) >= 10;
      const sids = asArray(e.stakeholderIds);
      await put(e, {
        status: locked ? 'locked' : 'completed', actualDate: e.plannedDate, startTime: item.plannedTime || '10:00', durationMinutes: item.durationMinutes, engagementType: item.engagementType, channel: item.channel,
        attendance: sids.map((sid) => ({ stakeholderId: sid, status: 'attended' })), internalParticipantIds: [item.relationshipOwnerId], purpose: item.objective, adkar: item.adkar,
        summary: p(summaries[i++ % summaries.length]), sentiments: sids.map((sid) => ({ subjectId: sid, sentiment: sentimentFor(sid, e) })), outcome: outcome(e), concerns: [],
        statusHistory: [...asArray(e.statusHistory), { at: `${e.plannedDate}T07:00:00.000Z`, by: item.relationshipOwnerId, from: 'planned', to: 'completed' }, ...(locked ? [{ at: `${cal.addBusinessDays(e.plannedDate, 10)}T20:00:00.000Z`, by: 'system', from: 'completed', to: 'locked', reason: 'Locked after 10 business days (RUL-10)' }] : [])],
        lockedAt: locked ? `${cal.addBusinessDays(e.plannedDate, 10)}T20:00:00.000Z` : null,
      });
    }
  }

  // --- Configuration and templates -------------------------------------------------------------------
  await S.driver.setConfig('settings', { organisationName: ORG, timeZone: 'Australia/Sydney' });
  S.invalidateConfig();
  const brand = { organisation: ORG, primary: '#0b1f3a', accent: '#0fa3b1', secondary: '#1d3d69', highlight: '#f2a900', fontHeading: 'Calibri', fontBody: 'Calibri', footer: `${ORG} · Change Management Office`, coverNote: 'Prepared by the Change Management Office' };
  const tplStd = await mk('template', { name: 'Agency standard (documents and presentations)', artefactType: '*', variant: 'full', state: 'published', templateVersion: 2, branding: brand, versions: [{ templateVersion: 1, branding: { ...brand, accent: '#2a78d6' }, publishedAt: T('2026-03-02') }], publishedAt: T('2026-06-01'), notes: 'Default corporate template for every artefact. Version 2 adopted the 2026 colour palette.' });
  await mk('template', { name: 'Steering Committee Pack (executive format)', artefactType: 'steeringPack', variant: 'full', state: 'published', templateVersion: 1, branding: brand, publishedAt: T('2026-05-04'), notes: 'Eight-slide executive format agreed with the Executive Leadership Team.' });
  await mk('template', { name: 'Manager briefing (plain language)', artefactType: 'managerBriefing', variant: 'manager', state: 'published', templateVersion: 1, branding: { ...brand, accent: '#1baf7a' }, publishedAt: T('2026-08-10'), notes: 'Plain-language variant for team leaders, tested with the change agent network.' });
  await mk('template', { name: '2027 brand refresh', artefactType: '*', variant: 'full', state: 'draft', templateVersion: 1, branding: { ...brand, accent: '#e07a2f', primary: '#18324f' }, basedOnId: tplStd.id, notes: 'Draft for the new brand guidelines; test with sample data before publishing.' });

  // --- People and groups ---------------------------------------------------------------------------
  const G = {};
  for (const [key, name, kind, parent, extra = {}] of GROUPS) {
    G[key] = await mk('stakeholderGroup', { name, kind, parentId: parent ? G[parent].id : null, membershipType: extra.membershipType || 'static', rules: extra.rules || null, headcount: extra.headcount ?? null, organisation: extra.organisation || ORG, description: '' });
  }
  const P = {};
  const everyone = [...PEOPLE, ...AGENTS, ...teamMembers(rand)];
  const emailOf = (given, family, org) => `${given}.${family}`.toLowerCase().replace(/[^a-z.]/g, '') + (org && org !== ORG ? `@${org.toLowerCase().replace(/[^a-z]/g, '').slice(0, 18)}.example.org.au` : '@example.gov.au');
  for (const [key, given, family, position, groupKey, , location, extra = {}] of everyone) {
    const org = extra.organisation || ORG;
    P[key] = await mk('stakeholder', {
      givenName: given, familyName: family, preferredName: extra.preferredName || null, positionTitle: position, organisation: org,
      businessUnit: groupKey ? GROUPS.find((g) => g[0] === groupKey)?.[1] : org, location, timeZone: location === 'Brisbane' ? 'Australia/Brisbane' : location === 'Adelaide' ? 'Australia/Adelaide' : 'Australia/Sydney',
      email: emailOf(given, family, org), phone: `02 6${String(1000000 + Math.floor(rand() * 8999999)).slice(0, 7)}`, employmentType: extra.employmentType || 'employee', source: org === ORG ? 'hr' : 'manual', sourceId: org === ORG ? `E${100000 + Math.floor(rand() * 899999)}` : null, status: 'active',
      preferredChannels: key === 'colin' ? ['inPerson'] : ['virtual', 'written'], language: 'English', collectionNoticeId: 'cn-standard', collectionNoticeDate: D('2026-03-16'),
    });
  }
  for (const [key, , , , , managerKey] of everyone) if (managerKey && P[managerKey]) P[key] = await put(P[key], { managerId: P[managerKey].id });
  for (const [key, , , , groupKey] of everyone) {
    if (!groupKey || !G[groupKey] || G[groupKey].membershipType === 'dynamic') continue;
    await mk('membership', { stakeholderId: P[key].id, groupId: G[groupKey].id, from: D('2025-07-01') });
  }
  for (const k of ['andrew', 'margaret', 'kathryn', 'james', 'helen']) await mk('membership', { stakeholderId: P[k].id, groupId: G.exec.id, from: D('2025-07-01') });
  for (const k of ['louise', 'peter', 'meilin', 'jacob', 'tarek']) await mk('membership', { stakeholderId: P[k].id, groupId: G.regional.id, from: D('2025-07-01') });
  const rel = async (a, t, b, strength = 'moderate', notes = '') => mk('relationship', { fromId: P[a].id, relType: t, toId: P[b].id, strength, notes });
  await rel('margaret', 'influences', 'rajesh', 'strong');
  await rel('margaret', 'influences', 'louise', 'strong');
  await rel('margaret', 'influences', 'michael', 'strong');
  await rel('margaret', 'worksCloselyWith', 'kathryn', 'strong');
  await rel('kathryn', 'influences', 'james', 'strong');
  await rel('colin', 'represents', 'peter', 'moderate', 'Union delegate network in the Geelong contact centre');
  await rel('colin', 'influences', 'jacob', 'moderate');
  await rel('colin', 'influences', 'nina', 'weak');
  await rel('ben', 'influences', 'ca1', 'strong', 'Regional manager of two change agents');
  await rel('ben', 'influences', 'ca2', 'strong');
  await rel('ben', 'worksCloselyWith', 'rebecca', 'strong', 'Monthly partner performance meetings');
  await rel('sophie', 'influences', 'ben', 'moderate');
  await rel('sophie', 'influences', 'fatima', 'moderate');
  await rel('ruth', 'influences', 'tim', 'moderate');
  await rel('tim', 'influences', 'jennifer', 'weak', 'Raises systemic complaints with the Ombudsman');
  await rel('louise', 'influences', 'peter', 'strong');
  await rel('louise', 'influences', 'meilin', 'strong');
  await rel('peter', 'influences', 'jacob', 'strong');
  await rel('michael', 'influences', 'caroline', 'strong');
  await rel('caroline', 'influences', 'daniel', 'strong');
  await rel('rajesh', 'influences', 'olivia', 'strong');
  await rel('rajesh', 'influences', 'ahmed', 'strong');
  await rel('kim', 'influences', 'ca3', 'moderate', 'Respected senior planner; informal opinion leader');
  await rel('kim', 'isInfluencedBy', 'ahmed', 'moderate');
  await rel('marcus', 'worksCloselyWith', 'hannah_s', 'strong');
  await rel('james', 'worksCloselyWith', 'marcus', 'moderate');

  // --- Users ---------------------------------------------------------------------------------------
  const INI = { pcmr: uid(), hwm: uid(), fss: uid() };
  const U = {};
  for (const [key, name, roles, stKey, inits, title] of USERS) {
    U[key] = await mk('user', { name, email: stKey ? P[stKey].email : `${name.toLowerCase().replace(/[^a-z]+/g, ".")}@example.gov.au`, roles, stakeholderId: stKey ? P[stKey].id : null, initiativeIds: inits.map((k) => INI[k]), status: 'active', timeZone: 'Australia/Sydney', authProvider: 'sso', notify: { inApp: true, email: true }, demo: true, demoTitle: title });
    if (setPassword) await setPassword(U[key].id, 'Demo-Workbench-2026');
  }

  // --- Portfolio structure --------------------------------------------------------------------------
  const portfolio = await mk('container', { name: 'Enterprise Transformation Portfolio', kind: 'portfolio', owner: 'Kathryn Ellis, Chief Operating Officer', description: 'All transformation programs governed by the Executive Leadership Team.' });
  const pxp = await mk('container', { name: 'Participant Experience Program', kind: 'program', parentId: portfolio.id, owner: 'Margaret Chen' });
  const cmp = await mk('container', { name: 'Corporate Modernisation Program', kind: 'program', parentId: portfolio.id, owner: 'Kathryn Ellis' });
  const pcmrProj = await mk('container', { name: 'Case Management Replacement Project', kind: 'project', parentId: pxp.id, owner: 'Hannah Brooks' });
  const hwmProj = await mk('container', { name: 'Digital Workplace Project', kind: 'project', parentId: cmp.id, owner: 'James Whitfield' });
  const fssProj = await mk('container', { name: 'Finance Shared Services Project', kind: 'project', parentId: cmp.id, owner: 'Helen Murphy' });

  await seedPcmr();
  await seedHwm();
  await seedFss();

  // Tasks and notifications as the workflow and the daily jobs would have raised them (WFL-002, WFL-003).
  const notified = {};
  const measureNotified = {};
  for (const id of Object.values(INI)) {
    const m = await S.model(id);
    for (const a of m.approvals.filter((x) => x.status === 'pending')) {
      for (const ap of a.approvers.filter((x) => !x.decision)) {
        await mk('task', { initiativeId: id, title: `Review and approve: ${a.subjectLabel}`, assigneeId: ap.userId, priority: 'high', status: 'open', recordType: 'approval', recordId: a.id, dueDate: addDays(String(a.requestedAt).slice(0, 10), 7), description: a.note || '' }, { at: a.requestedAt });
        await S.notify([ap.userId], approvalNotice(a, ap.name));
      }
    }
    for (const pr of m.profiles.filter((x) => x.cadence?.overdue)) {
      notified[cadenceKey(pr)] = TODAY;
      await S.notify([pr.relationshipOwnerId, pr.delegateId], cadenceNotice(m.initiative, pr));
    }
    for (const x of m.measures.filter((y) => y.belowThreshold)) {
      measureNotified[measureKey(x)] = TODAY;
      await S.notify([x.ownerId, m.initiative.changeLeadId], measureNotice(m.initiative, x));
    }
  }
  await S.driver.setConfig('jobState', { cadenceNotified: notified, measureNotified, lastDaily: TODAY });

  await S.audit(S.SYSTEM, { action: 'seed', type: 'system', summary: `Demonstration data loaded (${Object.values(counts).reduce((a, b) => a + b, 0)} records)` });
  S.invalidateConfig();
  return { counts, users: U, initiatives: INI };

  // =================================================================================================
  // Initiative 1: Participant Case Management Replacement (high risk, Phase 2)
  // =================================================================================================
  async function seedPcmr() {
    const I = INI.pcmr;
    const by = U.priya.id;
    const M = async (type, data, at) => mk(type, { ...data, initiativeId: I }, { by, at });
    await mk('initiative', {
      id: I, name: 'Participant Case Management Replacement', shortName: 'Case Management', containerId: pcmrProj.id,
      description: 'Replaces the legacy case management system with a modern participant case management platform and introduces a single, end-to-end planning and plan review process for staff and partners.',
      businessOwnerId: P.rajesh.id, primarySponsorId: P.margaret.id, changeLeadId: U.priya.id, projectManagerId: U.hannah.id,
      startDate: D('2026-03-02'), endDate: D('2027-09-30'), deliveryApproach: 'hybrid', status: 'active', classification: 'OFFICIAL',
      businessDrivers: 'The legacy case management system is out of vendor support from mid-2027, cannot support the new planning framework, and forces staff to re-key participant information across four systems.',
      problemOpportunity: 'Planners spend around 30% of their time on duplicate data entry and workarounds. Participants wait an average of 56 days for an approved plan and report inconsistent experiences between offices and partners.',
      whyNow: 'The vendor support deadline, the commencement of the new planning framework on 1 July 2027 and the Agency\'s service charter commitments mean the change cannot be deferred.',
      riskOfNotChanging: 'Unsupported technology risks outages affecting payments to participants; plan approval times will continue to breach the service charter; and the Agency will be unable to implement the new planning framework.',
      reasonForChange: 'Give participants faster, more consistent planning and give staff and partners one place to manage a participant\'s plan from first contact to review.',
      benefits: 'Plan approval in 35 days on average; 40% less re-keying; consistent planning practice across Agency and partner staff; better data for quality assurance.',
      adoptionDefinition: 'Planners, partners and contact centre staff create and update participant records only in the new platform; plans are drafted with the guided planning workflow; no plan is approved outside the platform; and team leaders use the platform dashboards in weekly team huddles.',
      whatIsChanging: 'The case management system, the planning and plan review process, payment claim handling, team leader dashboards and the participant portal view of plans.',
      whatIsNotChanging: 'Eligibility rules, the legislative planning framework, partner contracts, office locations and the participant phone number.',
      exclusions: 'Provider payments system replacement (separate project) and the finance ledger.',
      selectedPlans: ['blueprint', 'sponsor', 'peopleManager', 'communications', 'training', 'resistance', 'changeAgent', 'sponsorCoalition', 'sustainment'],
      planRationale: 'High change risk profile (both assessments above 60): Blueprint plus all Core plans and the Extend plans recommended for high-risk changes (RUL-14), with sustainment planned from the outset because of the two-wave release.',
      aiEnabled: true, coverageAcks: {},
    }, { by, at: T('2026-03-02') });

    // Milestones (INI-006)
    const ms = {};
    const msDefs = [
      ['designSignOff', 'Design sign-off', '2026-07-31', 'achieved'],
      ['uat', 'User acceptance testing (Release 1)', '2026-11-16', 'planned'],
      ['r1', 'Release 1 go-live: planning and assessment', '2027-02-01', 'planned', 'goLive'],
      ['uat2', 'User acceptance testing (Release 2)', '2027-03-22', 'planned', 'uat'],
      ['r2', 'Release 2 go-live: plan reviews and payments', '2027-05-03', 'planned', 'goLive'],
      ['hc', 'Hypercare exit', '2027-06-30', 'planned', 'hypercareExit'],
    ];
    for (const [key, name, date, status, kind] of msDefs) ms[key] = await M('milestone', { name, kind: kind || key, date: D(date), status, source: 'import', externalRef: `msp:${10 + Object.keys(ms).length}`, description: '' });
    await put(ms.r1, { releaseId: null });

    // Objectives and measures (INI-003, INI-004)
    const obj1 = await M('objective', { title: 'Reduce the time participants wait for an approved plan', description: 'Average days from planning meeting to approved plan falls from 56 to 35.', benefits: 'Participants receive supports sooner; fewer complaints and escalations.' });
    const obj2 = await M('objective', { title: 'One consistent planning practice across Agency and partner staff', description: 'All planners use the guided planning workflow.', benefits: 'Consistent decisions and better quality assurance data.' });
    const obj3 = await M('objective', { title: 'Retire the legacy case management system before vendor support ends', description: 'Legacy system read-only by Release 2 and decommissioned after hypercare.', benefits: 'Avoided support costs of $4.2 million a year and reduced outage risk.' });
    const meas = {};
    const mdef = [
      ['plans', 'Plans created in the new platform without rework', 'individual', 'ultimateUtilisation', [obj1, obj2], ['ig1', 'ig4'], 0, 90, 'higher', 60, 'Platform usage report', [['2026-09-30', 35], ['2026-10-16', 48]]],
      ['training', 'Training completion before go-live', 'changeManagement', 'activityDelivery', [obj2], [], 0, 90, 'higher', 50, 'Learning management system', [['2026-08-31', 12], ['2026-09-30', 31], ['2026-10-16', 46]]],
      ['proficiency', 'Proficiency assessment pass rate', 'individual', 'proficiency', [obj2], [], 0, 85, 'higher', 70, 'Sandbox assessment results', [['2026-09-30', 72], ['2026-10-16', 78]]],
      ['days', 'Average days to an approved plan', 'organisational', 'benefit', [obj1], [], 56, 35, 'lower', 60, 'Case management reporting', [['2026-07-31', 55], ['2026-08-31', 54], ['2026-09-30', 54], ['2026-10-16', 53]]],
      ['sat', 'Participant satisfaction with planning', 'organisational', 'benefit', [obj1], ['ig7'], 71, 80, 'higher', 65, 'Participant experience survey', [['2026-06-30', 71], ['2026-09-30', 72]]],
      ['coverage', 'Priority stakeholders engaged within cadence', 'changeManagement', 'engagementCoverage', [obj2], [], 60, 95, 'higher', 80, 'Change Management Workbench', [['2026-08-31', 82], ['2026-09-30', 86], ['2026-10-16', 84]]],
      ['sponsor', 'Sponsor activities completed on time', 'changeManagement', 'activityDelivery', [obj2], [], null, 90, 'higher', 75, 'Sponsor Plan', [['2026-09-30', 88]]],
      ['speed', 'Days from go-live to 80% of planners using the platform', 'individual', 'speedOfAdoption', [obj2], ['ig1'], null, 30, 'lower', 45, 'Platform usage report', []],
    ];
    for (const [key, name, category, subtype, objs, groups, baseline, target, direction, threshold, dataSource, values] of mdef) {
      meas[key] = await M('measure', { name, category, subtype, objectiveIds: objs.map((o) => o.id), groupIds: [], unit: key === 'days' || key === 'speed' ? ' days' : '%', baseline, target, direction, threshold, method: `Measured from ${dataSource.toLowerCase()}.`, dataSource, frequency: 'monthly', ownerId: ['coverage', 'sponsor', 'training'].includes(key) ? U.priya.id : U.hannah.id, sustainmentOwnerId: P.rajesh.id, postCloseoutMonths: ['plans', 'days', 'sat'].includes(key) ? 6 : 0 });
      meas[key]._groups = groups;
      for (const [date, value] of values) await M('measureValue', { measureId: meas[key].id, date: D(date), value, source: key === 'plans' ? 'feed' : 'manual', note: '' });
    }

    await M('decision', { kind: 'decision', title: 'Two-wave release: planning first, then reviews and payments', date: D('2026-05-12'), decisionMaker: 'Project Board', rationale: 'Separating the releases halves the number of staff affected at each go-live and avoids the end-of-financial-year payments peak.' });
    await M('decision', { kind: 'decision', title: 'Partner staff trained by the Agency, not by partner organisations', date: D('2026-06-23'), decisionMaker: 'Margaret Chen, Primary sponsor', rationale: 'Consistency of planning practice is a core objective; partner-led training produced inconsistent results in the 2024 pilot.' });
    await M('decision', { kind: 'decision', title: 'Legacy system read-only from Release 2 go-live', date: D('2026-08-04'), decisionMaker: 'Project Board', rationale: 'Prevents dual running and workarounds after Release 2 (Reinforcement).' });
    await M('decision', { kind: 'assumption', title: 'Partner organisations release staff for six hours of training', date: D('2026-04-20'), decisionMaker: 'Sophie Laurent', rationale: 'Agreed in principle at the partner forum; contract variation to confirm backfill funding.' });
    await M('decision', { kind: 'assumption', title: 'No change to team structures or reporting lines', date: D('2026-04-20'), decisionMaker: 'Rajesh Iyer', rationale: 'Confirmed with People and Culture; any restructure would be a separate consultation.' });
    await M('decision', { kind: 'decision', title: 'Contact centre call scripts updated a week before go-live', date: D('2026-09-29'), decisionMaker: 'Louise Barrett', rationale: 'Avoids confusion during the transition while giving staff time to practise.' });

    // Impacted groups and impacts (IMP)
    const ig = {};
    const igDefs = [
      ['ig1', 'Planners and Local Area Coordinators', 'external', 'Agency planners and partner Local Area Coordinators who develop participant plans', 'lac', 1240, 'All states and territories', 'sophie',
        'Planners must adopt a new guided planning workflow and stop using offline templates. Partner staff are employed by other organisations and have competing priorities.',
        'Less re-keying, a single view of the participant, guided prompts that reduce rework, and faster plan approvals that reduce follow-up calls.',
        'Workload during training, losing flexibility of current templates, partner staff concern about Agency monitoring of their work.',
        [['processes', 5, 'Planning steps recorded in templates and three systems', 'One guided planning workflow in the platform', 'r1'], ['systems', 5, 'Legacy case management and spreadsheets', 'New participant case management platform', 'r1'], ['tools', 4, 'Offline Word planning templates', 'In-platform plan builder', 'r1'], ['jobRoles', 3, 'Planner role varies by office', 'Consistent role responsibilities', 'r1'], ['criticalBehaviours', 4, 'Plans drafted after the meeting', 'Plans drafted during the planning conversation', 'r1'], ['mindsets', 4, 'Templates give flexibility', 'Guided workflow improves quality and consistency', 'r1'], ['performanceReviews', 2, 'Output measured by plans completed', 'Quality and timeliness measured from the platform', 'r2']]],
      ['ig2', 'Participant Contact Centre', 'orgUnit', 'Contact centre staff in Geelong and Brisbane', 'cco', 350, 'Geelong, Brisbane', 'louise',
        'High call volumes leave little time for training; staff must answer participant questions about the new plan format from day one.',
        'One screen for the participant\'s history; fewer transfers to planners; clearer plan information to share with callers.',
        'Average handling time rising during the transition; call scripts changing; questions about monitoring.',
        [['systems', 4, 'Legacy system plus three lookup tools', 'Single participant view in the platform', 'r1'], ['processes', 3, 'Warm transfers to planners for plan questions', 'First-contact resolution using the plan summary', 'r1'], ['tools', 4, 'Call scripts and knowledge base', 'Updated scripts and in-platform knowledge articles', 'r1'], ['criticalBehaviours', 3, 'Transfer complex plan questions', 'Explain the new plan format to callers', 'r1']]],
      ['ig3', 'Claims and Payments Processing', 'orgUnit', 'Claims officers and payments integrity staff', 'cpb', 220, 'Canberra', 'michael',
        'Claims processing moves to the platform in Release 2, during the busiest payments period of the year.',
        'Automatic validation of claims against plans and fewer manual checks.',
        'Payment errors during the changeover; end of financial year workload.',
        [['systems', 5, 'Legacy claims screens', 'Platform claims module', 'r2'], ['processes', 4, 'Manual plan checks before payment', 'Automated validation with exception queues', 'r2'], ['jobRoles', 3, 'Claims officers check every claim', 'Officers manage exceptions', 'r2'], ['reportingStructure', 2, 'Claims teams by state', 'Claims teams by exception type', 'r2']]],
      ['ig4', 'Plan Review Team', 'orgUnit', 'Staff who conduct scheduled and unscheduled plan reviews', 'prt', 180, 'Canberra', 'olivia',
        'Reviews move into the platform in Release 2; reviewers must learn the new workflow and the new plan format at the same time.',
        'Reviews pre-populated from the current plan; less preparation time.',
        'Learning two things at once; backlog of reviews during training.',
        [['processes', 4, 'Manual review preparation', 'Pre-populated review workflow', 'r2'], ['systems', 4, 'Legacy system', 'Platform review module', 'r2'], ['jobRoles', 4, 'Reviewers prepare and conduct reviews', 'Reviewers focus on the review conversation', 'r2'], ['mindsets', 3, 'Reviews are a compliance step', 'Reviews improve participant outcomes', 'r2']]],
      ['ig5', 'Early Childhood Partners', 'external', 'Early childhood partner staff supporting children under nine', 'ecei', 140, 'NSW, VIC, QLD', 'sophie',
        'Partner staff use the platform for early connections only; they have limited time for training.',
        'Simpler referrals and visibility of the child\'s plan.',
        'Additional administrative work for partner staff.',
        [['processes', 3, 'Email referrals', 'Platform referrals', 'r1'], ['systems', 3, 'Partner system and legacy portal', 'Platform partner view', 'r1'], ['tools', 2, 'Referral forms', 'Online referral', 'r1']]],
      ['ig6', 'Provider Registration and Quality', 'orgUnit', 'Staff who register providers and monitor quality', 'prq', 60, 'Canberra', 'neil',
        'Low impact: provider records are read from the platform.',
        'Better information about providers named in plans.',
        'Minimal.',
        [['systems', 2, 'Legacy provider lookup', 'Platform provider view', 'r2'], ['processes', 2, 'Manual provider checks', 'Automated provider matching', 'r2']]],
      ['ig7', 'Participants and Nominees', 'external', 'People with disability, their families and nominees', 'pan', 650000, 'National', null,
        'Participants will see a new plan format and portal; communication must be accessible and timely.',
        'Plans that are easier to understand and faster approval.',
        'Confusion about the new plan format; worry that supports will change.',
        [['processes', 3, 'Plans posted after approval', 'Plans available in the portal with a plain-language summary', 'r1'], ['tools', 3, 'Paper and PDF plans', 'Portal plan view and accessible formats', 'r1'], ['mindsets', 2, 'Plans are hard to understand', 'Plans are clear and easy to use', 'r1']]],
      ['ig8', 'Team Leaders and Managers', 'role', 'People leaders of impacted teams', 'leaders', 150, 'National', 'margaret',
        'Team leaders must coach their teams through two releases while maintaining service levels.',
        'Real-time dashboards for team workload and quality.',
        'Time to coach; holding the team accountable for platform-only work.',
        [['criticalBehaviours', 4, 'Workload managed from spreadsheets', 'Daily huddles using platform dashboards', 'r1'], ['jobRoles', 3, 'Leaders monitor outputs', 'Leaders coach to quality measures', 'r1'], ['performanceReviews', 3, 'Team performance from manual reports', 'Team performance from the platform', 'r2']]],
    ];
    const reviewer = { ig1: 'rebecca', ig2: 'peter', ig3: 'caroline', ig4: 'olivia', ig6: 'neil', ig8: 'rajesh' };
    const agentTargets = { ig1: 6, ig2: 4, ig3: 3, ig4: 2, ig5: 2, ig6: 1, ig7: 0, ig8: 0 };
    for (const [key, name, defType, definition, sg, headcount, locations, leader, challenge, wiifm, concerns, impacts] of igDefs) {
      ig[key] = await M('impactedGroup', { name, definitionType: defType, definition, stakeholderGroupId: G[sg].id, headcount, locations, managerStakeholderId: leader ? P[leader].id : null, agentTarget: agentTargets[key], adoptionChallenge: challenge, wiifm, concerns, confirmationStatus: reviewer[key] ? (key === 'ig4' ? 'changesRequested' : 'confirmed') : 'notReviewed', reviewerId: reviewer[key] ? P[reviewer[key]].id : null, confirmedDate: reviewer[key] && key !== 'ig4' ? D('2026-06-12') : null, reviewComments: key === 'ig4' ? 'Reviewers will also need time to clear the review backlog; please add this to the impact on job roles.' : '' });
      for (const [aspect, degree, cur, fut, msKey] of impacts) {
        await M('impact', { impactedGroupId: ig[key].id, aspect, level: 'group', currentState: cur, futureState: fut, description: `${fut}.`, degree, milestoneId: ms[msKey].id, transitionWeeks: degree >= 4 ? 10 : 6, causes: aspect === 'systems' ? 'Platform build, data migration' : aspect === 'processes' ? 'Redesigned planning and review processes' : 'Business process redesign' });
      }
    }
    await M('impact', { impactedGroupId: ig.ig8.id, aspect: 'jobRoles', level: 'role', subject: 'Team leaders, contact centre', currentState: 'Monitor call statistics', futureState: 'Coach first-contact resolution', description: 'Contact centre team leaders take on coaching for plan explanations.', degree: 4, milestoneId: ms.r1.id, transitionWeeks: 8 });
    for (const [m, keys] of Object.entries({ plans: ['ig1', 'ig4'], sat: ['ig7'], speed: ['ig1'] })) await put(meas[m], { groupIds: keys.map((k) => ig[k].id) });

    // Risk, PCT and sponsor assessments (RSK)
    const ccScores = { cc1: 5, cc2: 5, cc3: 4, cc4: 4, cc5: 5, cc6: 3, cc7: 2, cc8: 4, cc9: 4, cc10: 4 };
    const oaScores = { oa1: 3, oa2: 4, oa3: 4, oa4: 4, oa5: 3, oa6: 4, oa7: 3, oa8: 3, oa9: 3, oa10: 4 };
    await M('assessment', { kind: 'changeCharacteristics', subjectType: 'initiative', subjectId: I, round: 'baseline', method: 'practitioner', date: D('2026-04-10'), assessorId: U.priya.id, scores: wrap(ccScores, { cc1: 'Every planning office and partner organisation', cc8: 'Fixed by the vendor support deadline' }), comment: 'Workshop with the project board and branch managers.', confirmed: true, confirmedBy: U.priya.id, confirmedAt: T('2026-04-10') });
    await M('assessment', { kind: 'orgAttributes', subjectType: 'initiative', subjectId: I, round: 'baseline', method: 'practitioner', date: D('2026-04-10'), assessorId: U.priya.id, scores: wrap(oaScores, { oa2: 'The 2023 portal upgrade was rolled back after go-live', oa3: 'Digital workplace and finance changes in the same period' }), comment: 'Validated with People and Culture and the union consultative committee.', confirmed: true, confirmedBy: U.priya.id, confirmedAt: T('2026-04-10') });
    const pct = [
      ['2026-04-14', 'baseline', { pc1: 4, pc2: 3, pc3: 2, pc4: 5, pc5: 4, pc6: 3, pc7: 3, pc8: 3, pc9: 4, pc10: 3, pc11: 3, pc12: 2, pc13: 2, pc14: 2 }],
      ['2026-07-20', 'adHoc', { pc1: 4, pc2: 4, pc3: 3, pc4: 5, pc5: 4, pc6: 3, pc7: 4, pc8: 4, pc9: 4, pc10: 3, pc11: 4, pc12: 4, pc13: 3, pc14: 3 }],
      ['2026-10-12', 'preGoLive', { pc1: 5, pc2: 4, pc3: 4, pc4: 5, pc5: 5, pc6: 3, pc7: 4, pc8: 4, pc9: 4, pc10: 3, pc11: 4, pc12: 4, pc13: 4, pc14: 3 }],
    ];
    for (const [date, rnd, scores] of pct) await M('assessment', { kind: 'pct', subjectType: 'initiative', subjectId: I, round: rnd, method: 'practitioner', date: D(date), assessorId: U.priya.id, scores: wrap(scores), comment: '', confirmed: true, acceptedFocus: rnd === 'baseline' ? [{ id: 'pct:changeManagement', title: 'Resource and integrate change management', text: 'Confirm change team resourcing, complete the impact assessment and integrate change activities into the project schedule.', at: T('2026-04-15'), by: U.priya.id }] : [] });
    await M('assessment', { kind: 'sponsor', subjectType: 'stakeholder', subjectId: P.margaret.id, round: 'baseline', method: 'practitioner', date: D('2026-04-14'), assessorId: U.priya.id, scores: wrap({ sp1: 5, sp2: 4, sp3: 3, sp4: 3, sp5: 4, sp6: 3, sp7: 4 }), comment: 'Strong commitment; diary availability is the main constraint.', confirmed: true });

    // Strategy (STR)
    const strategy = await M('strategy', {
      summary: p('The Participant Case Management Replacement changes how more than 2,300 Agency and partner staff plan, review and pay for participant supports, and how 650,000 participants see their plans. It is a high-risk change: the scope is national, it changes core systems and processes at the same time, and it lands while two other changes affect the same contact centre staff.', 'The change management approach uses the full Blueprint, Core and Extend plans, with a strong emphasis on people leaders and partner organisations because most impacted staff work outside the Agency\'s direct line management.'),
      sponsorshipGaps: 'Partner organisations have no direct sponsor relationship with the Agency; the Chief Information Officer has limited visibility with business staff; diary availability of the primary sponsor in January.',
      sponsorshipActions: 'The General Manager, Partners in the Community acts as sponsor for partner organisations; the primary sponsor holds quarterly calls with partner CEOs; sponsor messages are pre-recorded for the January period.',
      changeTeam: [
        { role: 'Change management lead', person: 'Priya Raman', allocation: 1, reportsTo: 'Project Director', responsibilities: 'Approach, plans, sponsor coaching, governance reporting' },
        { role: 'Change analyst', person: 'Tom Nguyen', allocation: 1, reportsTo: 'Change management lead', responsibilities: 'Impact assessment, stakeholder engagement, change agent network' },
        { role: 'Communications adviser', person: 'Grace Okafor', allocation: 0.6, reportsTo: 'Director, Internal Communications', responsibilities: 'Communications Plan, key messages, FAQs' },
        { role: 'Training lead', person: 'Liam Walsh', allocation: 0.8, reportsTo: 'Director, Learning and Capability', responsibilities: 'Training needs analysis, training delivery and proficiency' },
        { role: 'Partner engagement lead', person: 'Rebecca Stone', allocation: 0.3, reportsTo: 'General Manager, Partners in the Community', responsibilities: 'Partner readiness and partner change agents' },
      ],
      raci: [
        { deliverable: 'Change Management Strategy', responsible: 'Change management lead', accountable: 'Primary sponsor', consulted: 'Project Director; General Managers', informed: 'Project Board' },
        { deliverable: 'Master Change Management Plan', responsible: 'Change management lead', accountable: 'Primary sponsor', consulted: 'Change team; Project Director', informed: 'Steering Committee' },
        { deliverable: 'Communications Plan', responsible: 'Communications adviser', accountable: 'Change management lead', consulted: 'General Managers', informed: 'Change agents' },
        { deliverable: 'Training Plan', responsible: 'Training lead', accountable: 'Change management lead', consulted: 'Business process owners', informed: 'People leaders' },
        { deliverable: 'Readiness assessment and go/no-go', responsible: 'Change analyst', accountable: 'Project Director', consulted: 'General Managers', informed: 'Steering Committee' },
      ],
      governance: [
        { name: 'Executive Steering Committee', chair: 'Margaret Chen', frequency: 'Monthly', purpose: 'Decisions, risks and readiness' },
        { name: 'Project Board', chair: 'Hannah Brooks', frequency: 'Fortnightly', purpose: 'Delivery and integration' },
        { name: 'Union Consultative Committee', chair: 'Rajesh Iyer', frequency: 'Monthly', purpose: 'Consultation on workplace impacts' },
        { name: 'Partner Forum', chair: 'Sophie Laurent', frequency: 'Monthly', purpose: 'Partner readiness' },
      ],
      approach: 'full',
      integrationApproach: 'Hybrid delivery: predictive releases with agile sprints for build. Change activities are scheduled against the release milestones (design sign-off, UAT, go-live, hypercare) and reviewed at each sprint review for impacts on users.',
      phaseMapping: [
        { projectPhase: 'Design (to design sign-off)', changeActivities: 'Impact assessment, stakeholder analysis, Strategy, sponsor roadmap, change agent recruitment' },
        { projectPhase: 'Build and UAT (Release 1)', changeActivities: 'Blueprints, baseline ADKAR, communications, training needs analysis, manager toolkits' },
        { projectPhase: 'Release 1 deployment and hypercare', changeActivities: 'Training, readiness checks, go-live support, floor walking, ADKAR pulse checks' },
        { projectPhase: 'Release 2', changeActivities: 'Claims and reviews training, resistance management, reinforcement' },
        { projectPhase: 'Close', changeActivities: 'Performance review, sustainment and handover' },
      ],
      anticipatedResistance: 'Planners and partner staff attached to templates (Desire); contact centre staff concerned about handling times; union concerns about workload and monitoring; reviewers facing a backlog.',
      specialTactics: 'Partner-specific sponsor; change agents in every partner region; floor support for six weeks; union consultation on monitoring; staged training close to go-live.',
      assumptions: 'Partner organisations release staff for training; no restructuring; vendor delivers Release 1 by the UAT milestone.',
      budget: [
        { category: 'changeTeam', period: '2026–27', amount: 612000, effortDays: 1150, notes: 'Change lead, analyst, partial communications and training' },
        { category: 'training', period: '2026–27', amount: 480000, effortDays: 600, notes: 'Trainers, sandbox environment, backfill for partner staff' },
        { category: 'communications', period: '2026–27', amount: 85000, effortDays: 120, notes: 'Video, accessible participant materials' },
        { category: 'agents', period: '2026–27', amount: 64000, effortDays: 260, notes: 'Change agent time and recognition' },
        { category: 'events', period: '2026–27', amount: 38000, effortDays: 40, notes: 'Town halls and partner forums' },
        { category: 'contingency', period: '2026–27', amount: 90000, effortDays: 0, notes: '' },
      ],
      status: 'approved', approvedVersion: '1.0', baselineAt: T('2026-06-19'),
    }, T('2026-05-20'));
    await M('approval', { subjectType: 'strategy', subjectId: strategy.id, subjectLabel: 'Change Management Strategy', requestedBy: U.priya.id, requestedAt: T('2026-06-10'), rule: 'all', status: 'approved', approvers: [{ userId: U.margaret.id, name: 'Margaret Chen', decision: 'approve', comment: 'Approved. Please keep partner sponsorship under review.', decidedAt: T('2026-06-18') }, { userId: U.priya.id, name: 'Priya Raman', decision: 'approve', comment: null, decidedAt: T('2026-06-11') }], snapshot: { version: '1.0' }, note: 'For approval at the June Steering Committee.' }, T('2026-06-10'));

    // Sponsor coalition (SPN-002)
    for (const [k, area, cur, des, status, actions] of [
      ['kathryn', 'Corporate services and the enterprise portfolio', 'supportive', 'leading', 'aligned', 'Monthly portfolio alignment; joint message on change load.'],
      ['james', 'Technology delivery and the vendor', 'supportive', 'leading', 'inProgress', 'Primary sponsor to brief the CIO on business readiness before each go-live decision.'],
      ['rajesh', 'Planning and reviews (business owner)', 'supportive', 'leading', 'aligned', 'Co-present at planner town halls; own the planning quality measures.'],
      ['louise', 'Contact centre operations', 'neutral', 'leading', 'atRisk', 'Address handling-time concerns; agree service level relief for training weeks.'],
      ['michael', 'Claims and payments', 'supportive', 'leading', 'aligned', 'Visible sponsorship of the Release 2 claims changes.'],
      ['sophie', 'Partner organisations', 'neutral', 'supportive', 'inProgress', 'Partner CEO calls with the primary sponsor; agree training backfill.'],
    ]) await M('coalitionMember', { stakeholderId: P[k].id, area, currentSupport: cur, desiredSupport: des, alignmentActions: actions, status });

    // ADKAR Blueprints (ADK)
    const bpOrg = await M('blueprint', { name: 'Organisation ADKAR Blueprint', scope: 'organisation', status: 'approved', elements: {
      awareness: { desiredOutcome: 'Everyone affected can explain why the legacy system is being replaced, what changes for them in each release and the risk of staying with the old system.', indicators: 'Pulse check Awareness ≥ 4; fewer than 10% of contact centre enquiries about why the change is happening.', barriers: 'Change fatigue; partners hear about the change second-hand.', rootCauses: 'Three concurrent changes; partner staff outside Agency channels.', measures: 'ADKAR pulse; FAQ themes.' },
      desire: { desiredOutcome: 'Staff and partners choose to use the guided workflow rather than templates.', indicators: 'Desire ≥ 3.5 in every group before go-live; resistance items resolved.', barriers: 'Attachment to templates; concern about monitoring and handling times.', rootCauses: 'Templates give a sense of control; monitoring not explained.', measures: 'ADKAR pulse; resistance register; sentiment.' },
      knowledge: { desiredOutcome: 'Each role knows how to complete its tasks in the platform.', indicators: 'Training completion ≥ 90%; Knowledge ≥ 3.5.', barriers: 'Release staff for training during peak periods.', rootCauses: 'Service levels; partner staffing.', measures: 'Training completion; assessment results.' },
      ability: { desiredOutcome: 'Staff complete real tasks in the platform at the required quality within six weeks of go-live.', indicators: 'Proficiency pass rate ≥ 85%; plans without rework ≥ 90%.', barriers: 'Little time to practise; productivity dip.', rootCauses: 'High workloads.', measures: 'Proficiency evidence; platform usage.' },
      reinforcement: { desiredOutcome: 'The new way of working is measured, recognised and sustained by the business.', indicators: 'Legacy system read-only; usage stays above target for three months.', barriers: 'Workarounds persist.', rootCauses: 'Old templates still available.', measures: 'Usage dashboards; sustainment reviews.' },
    } });
    const bpG = {};
    for (const [k, name, el] of [['ig1', 'Planners and Local Area Coordinators Blueprint', { desire: 'Partner planners see the guided workflow as making planning conversations better, not as monitoring.', knowledge: 'Planners complete a plan end to end in the sandbox before go-live.' }], ['ig2', 'Contact Centre Blueprint', { knowledge: 'Every customer service officer can find and explain a participant\'s plan in the platform.', ability: 'Handling time returns to baseline within six weeks.' }], ['ig3', 'Claims and Payments Blueprint', { ability: 'Claims officers clear exception queues without escalation.', reinforcement: 'Daily exception dashboards reviewed by team leaders.' }]]) {
      bpG[k] = await M('blueprint', { name, scope: 'group', impactedGroupId: ig[k].id, status: k === 'ig3' ? 'draft' : 'approved', elements: Object.fromEntries(ADKAR_IDS.map((e) => [e, { desiredOutcome: el[e] || bpOrg.elements[e].desiredOutcome, indicators: bpOrg.elements[e].indicators, barriers: '', rootCauses: '', measures: bpOrg.elements[e].measures }])) });
    }

    // Key messages, FAQs and toolkit (COM, PMG)
    const km = {};
    const kmDefs = [
      ['why', 'Why we are replacing the case management system', 'The system we use today is more than 15 years old and will no longer be supported by its vendor from mid-2027. Replacing it now protects participant payments and lets us deliver faster, more consistent planning.', ['awareness'], 'businessReasons', 'approved', ['ig1', 'ig2', 'ig3', 'ig4', 'ig5', 'ig6', 'ig8']],
      ['when', 'What changes, and when', 'Release 1 (February 2027) changes how plans are created. Release 2 (May 2027) changes plan reviews and claims. Eligibility rules, phone numbers and office locations are not changing.', ['awareness'], 'howTo', 'approved', ['ig1', 'ig2', 'ig3', 'ig4', 'ig5']],
      ['wiifmPlanners', 'What it means for planners', 'You will create plans in one place, with guided prompts and no re-keying. Plans can be drafted during the planning conversation, so participants leave knowing what happens next.', ['desire'], 'personalImpacts', 'approved', ['ig1']],
      ['wiifmCc', 'What it means for contact centre staff', 'You will see the participant\'s full history and plan on one screen, so you can answer more questions without transferring calls.', ['desire'], 'personalImpacts', 'approved', ['ig2']],
      ['support', 'Training and support are timed for you', 'You will receive role-based training in the three weeks before your go-live, a practice environment, and floor support for six weeks afterwards.', ['knowledge', 'ability'], 'howTo', 'approved', ['ig1', 'ig2', 'ig3', 'ig4']],
      ['monitoring', 'How platform data will and will not be used', 'Platform reports help us improve processes and support teams. They will not be used for individual performance management without the usual performance discussions, as agreed with the union consultative committee.', ['desire'], 'personalImpacts', 'inReview', ['ig1', 'ig2', 'ig8']],
      ['participants', 'For participants: your plan is getting easier to read', 'From February 2027 your plan will have a plain-language summary and be available in the participant portal. Your supports will not change because of the new system.', ['awareness'], 'businessReasons', 'approved', ['ig7']],
      ['leaders', 'For people leaders: your role in the change', 'Your team will look to you first. Explain why the change matters, listen to concerns, help your team make time for training and practice, and recognise people who use the new way of working.', ['awareness', 'desire', 'reinforcement'], 'personalImpacts', 'approved', ['ig8']],
      ['progress', 'Pilot results so far', 'In the Newcastle pilot, plans drafted in the platform needed 40% less rework. Thank you to the planners and partners who tested it.', ['reinforcement'], 'progress', 'draft', ['ig1', 'ig8']],
    ];
    for (const [key, title, text, adkar, focus, status, groups] of kmDefs) km[key] = await M('keyMessage', { title, text, adkar, messageFocus: focus, status, audienceGroupIds: groups.map((g) => ig[g].id), audienceRoles: [], messageVersion: key === 'why' ? 2 : 1, history: key === 'why' ? [{ version: 1, title, text: 'The current system is old and will be replaced.', at: T('2026-04-28'), by: U.grace.id, status: 'approved' }] : [], enterprise: key === 'why' });
    const faqDefs = [
      ['Will my supports change because of the new system?', 'No. Your plan and supports are decided under the same rules. Only the way your plan is presented and managed changes.', 'approved', true, ['ig7', 'ig2']],
      ['Can I keep using my planning template?', 'Templates will be retired at Release 1. The guided workflow includes every section of the current template, and you can draft during the planning meeting.', 'approved', true, ['ig1']],
      ['When will I be trained?', 'Role-based training is scheduled in the three weeks before your go-live. Your team leader will confirm your session.', 'approved', true, ['ig1', 'ig2', 'ig3', 'ig4']],
      ['Will platform data be used to monitor me?', 'Reports are used to improve processes and support teams. This has been discussed with the union consultative committee; see the key message on data use.', 'inReview', false, ['ig1', 'ig2']],
      ['What happens to plans that are half-finished at go-live?', 'Draft plans are migrated into the platform the weekend before go-live. Your team leader will receive a list to check on day one.', 'approved', true, ['ig1']],
      ['Who do I call if the platform is down?', 'The IT Service Desk on 1800 000 000 has a dedicated option for the platform during hypercare.', 'draft', false, ['ig1', 'ig2', 'ig3']],
      ['Do partner staff get the same training as Agency staff?', 'Yes. The Agency delivers the same training to partner staff, and partner organisations are funded for backfill.', 'approved', true, ['ig1', 'ig5']],
    ];
    for (const [question, answer, status, published, groups] of faqDefs) await M('faq', { question, answer, status, published, ownerId: U.grace.id, audienceGroupIds: groups.map((g) => ig[g].id), adkar: ['awareness'] });
    for (const [title, kind, groups, accesses] of [
      ['Team leader talking points: Release 1', 'talkingPoints', ['ig1', 'ig2', 'ig8'], ['daniel', 'jacob', 'nina', 'tarek']],
      ['Team conversation guide: why the change and what it means for us', 'conversationGuide', ['ig1', 'ig2', 'ig3', 'ig4'], ['daniel', 'jacob', 'tarek']],
      ['Impact summary for your team', 'impactSummary', ['ig1', 'ig2', 'ig3', 'ig4', 'ig8'], ['daniel', 'nina']],
      ['Training schedule by team', 'trainingSchedule', ['ig1', 'ig2', 'ig3', 'ig4'], ['jacob', 'wendy']],
      ['Manager FAQs', 'faq', ['ig8'], ['daniel']],
      ['Handling concerns about monitoring', 'conversationGuide', ['ig2', 'ig8'], []],
    ]) await M('toolkitItem', { title, kind, content: p(`${title}. Use this resource in your next team meeting.`, 'Key points: why the change is happening now; what changes for your team in each release; where to get training and support; how to raise concerns.'), audienceGroupIds: groups.map((g) => ig[g].id), itemVersion: kind === 'talkingPoints' ? 3 : 1, status: 'published', accessLog: accesses.map((k, i) => ({ userId: k === 'daniel' ? U.daniel.id : null, stakeholderId: P[k].id, name: `${P[k].givenName} ${P[k].familyName}`, at: T(`2026-10-${String(10 + i).padStart(2, '0')}`) })) });

    // Plan activities (PLN, SPN, PMG, COM, TRN, RES, CAN, SUS)
    const act = {};
    const A = async (key, data) => { act[key] = await M('activity', { kind: 'activity', status: 'notStarted', percentComplete: 0, ...data }); return act[key]; };
    const dd = (iso) => D(iso);
    // Sponsor Plan
    await A('sp1', { title: 'Sponsor launch message: why we are replacing the system', plans: ['sponsor', 'communications'], adkar: ['awareness'], groupIds: [], ownerId: U.priya.id, responsibleRole: 'sponsor', delivererId: P.margaret.id, channel: 'Video and all-staff email', startDate: dd('2026-05-04'), endDate: dd('2026-05-08'), status: 'complete', percentComplete: 100, audience: 'All Agency and partner staff', preparation: 'Talking points and video script', confirmation: { confirmed: true, at: T('2026-05-08'), by: 'Margaret Chen', observations: 'Strong response on the intranet; 2,100 views.' }, blueprintId: bpOrg.id });
    await A('sp2', { title: 'Sponsor visits to Geelong and Brisbane contact centres', plans: ['sponsor'], adkar: ['awareness', 'desire'], groupIds: [ig.ig2.id], ownerId: U.priya.id, responsibleRole: 'sponsor', delivererId: P.margaret.id, channel: 'Site visit', startDate: dd('2026-09-14'), endDate: dd('2026-09-18'), status: 'complete', percentComplete: 100, confirmation: { confirmed: true, at: T('2026-09-18'), by: 'Margaret Chen', observations: 'Staff concerned about handling times during the transition; agreed to service-level relief.' } });
    await A('sp3', { title: 'Partner CEO calls with the primary sponsor', plans: ['sponsor', 'sponsorCoalition'], adkar: ['desire'], groupIds: [ig.ig1.id, ig.ig5.id], ownerId: U.priya.id, responsibleRole: 'sponsor', delivererId: P.margaret.id, channel: 'Virtual meeting', startDate: dd('2026-10-05'), endDate: dd('2026-10-16'), status: 'inProgress', percentComplete: 60, audience: 'Partner organisation CEOs', preparation: 'Partner readiness summary' });
    await A('sp4', { title: 'Sponsor message at the Release 1 town hall', plans: ['sponsor'], adkar: ['awareness', 'desire'], groupIds: [], ownerId: U.priya.id, responsibleRole: 'sponsor', delivererId: P.margaret.id, channel: 'Town hall', milestoneId: ms.r1.id, offsetDays: -10, startDate: cal.addBusinessDays(D('2027-02-01'), -10), endDate: cal.addBusinessDays(D('2027-02-01'), -10) });
    await A('sp5', { title: 'Sponsor recognition of pilot planners', plans: ['sponsor'], adkar: ['reinforcement'], groupIds: [ig.ig1.id], ownerId: U.priya.id, responsibleRole: 'sponsor', delivererId: P.margaret.id, channel: 'Email and intranet story', startDate: dd('2026-10-12'), endDate: dd('2026-10-16'), status: 'notStarted', audience: 'Newcastle pilot team' });
    await A('sp6', { title: 'Sponsor briefing for the Executive Leadership Team on readiness', plans: ['sponsor', 'sponsorCoalition'], adkar: ['awareness'], groupIds: [], ownerId: U.priya.id, responsibleRole: 'sponsor', delivererId: P.margaret.id, channel: 'Executive meeting', startDate: dd('2027-01-12'), endDate: dd('2027-01-12') });
    // Coalition
    await A('co1', { title: 'One-to-one alignment conversation with the General Manager, Contact Centre Operations', plans: ['sponsorCoalition'], adkar: ['desire'], groupIds: [ig.ig2.id], ownerId: U.priya.id, responsibleRole: 'sponsor', delivererId: P.margaret.id, startDate: dd('2026-10-26'), endDate: dd('2026-10-30') });
    await A('co2', { title: 'Coalition message from General Managers at the planner forum', plans: ['sponsorCoalition', 'communications'], adkar: ['awareness', 'desire'], groupIds: [ig.ig1.id, ig.ig4.id], ownerId: U.tom.id, responsibleRole: 'sponsor', delivererId: P.rajesh.id, startDate: dd('2026-11-09'), endDate: dd('2026-11-09') });
    // People Manager Plan
    await A('pm1', { title: 'People leader briefing: your role in the change (CLARC)', plans: ['peopleManager', 'training'], adkar: ['awareness', 'desire'], groupIds: [ig.ig8.id], ownerId: U.tom.id, responsibleRole: 'changeTeam', startDate: dd('2026-08-24'), endDate: dd('2026-08-28'), status: 'complete', percentComplete: 100, blueprintId: bpOrg.id });
    await A('pm2', { title: 'Manager toolkit published (talking points, guides, FAQs)', plans: ['peopleManager'], adkar: ['awareness', 'knowledge'], groupIds: [ig.ig8.id], ownerId: U.grace.id, responsibleRole: 'communications', startDate: dd('2026-09-28'), endDate: dd('2026-10-02'), status: 'complete', percentComplete: 100 });
    await A('pm3', { title: 'Team conversations on why the change and what it means for us', plans: ['peopleManager'], adkar: ['awareness', 'desire'], groupIds: [ig.ig1.id, ig.ig2.id, ig.ig3.id], ownerId: U.tom.id, responsibleRole: 'peopleManager', startDate: dd('2026-10-12'), endDate: dd('2026-11-06'), status: 'inProgress', percentComplete: 45 });
    await A('pm4', { title: 'Team leaders coach first-contact resolution with the plan summary', plans: ['peopleManager'], adkar: ['ability'], groupIds: [ig.ig2.id], ownerId: U.tom.id, responsibleRole: 'peopleManager', startDate: dd('2027-02-01'), endDate: dd('2027-03-12'), milestoneId: ms.r1.id, offsetDays: 0 });
    await A('pm5', { title: 'Team leaders hold one-to-ones to surface concerns', plans: ['peopleManager', 'resistance'], adkar: ['desire'], groupIds: [ig.ig1.id, ig.ig2.id], ownerId: U.tom.id, responsibleRole: 'peopleManager', startDate: dd('2026-11-02'), endDate: dd('2026-11-27') });
    await A('pm6', { title: 'Weekly team huddles using platform dashboards', plans: ['peopleManager', 'sustainment'], adkar: ['reinforcement'], groupIds: [ig.ig1.id, ig.ig2.id, ig.ig8.id], ownerId: U.tom.id, responsibleRole: 'peopleManager', startDate: dd('2027-02-08'), endDate: dd('2027-06-30') });
    await A('pm7', { title: 'Team leader readiness check before Release 1', plans: ['peopleManager'], adkar: ['knowledge', 'ability'], groupIds: [ig.ig8.id], ownerId: U.tom.id, responsibleRole: 'changeTeam', startDate: dd('2027-01-11'), endDate: dd('2027-01-15') });
    // Training Plan
    await A('tr1', { title: 'Role-based training for planners and LACs', plans: ['training'], adkar: ['knowledge'], groupIds: [ig.ig1.id], ownerId: U.liam.id, responsibleRole: 'trainingTeam', startDate: dd('2027-01-11'), endDate: dd('2027-01-29'), blueprintId: bpG.ig1.id });
    await A('tr2', { title: 'Contact centre virtual training', plans: ['training'], adkar: ['knowledge'], groupIds: [ig.ig2.id], ownerId: U.liam.id, responsibleRole: 'trainingTeam', startDate: dd('2027-01-11'), endDate: dd('2027-01-29') });
    await A('tr3', { title: 'Sandbox practice weeks', plans: ['training'], adkar: ['knowledge', 'ability'], groupIds: [ig.ig1.id, ig.ig2.id, ig.ig4.id], ownerId: U.liam.id, responsibleRole: 'trainingTeam', startDate: dd('2026-10-12'), endDate: dd('2026-12-11'), status: 'inProgress', percentComplete: 40 });
    await A('tr4', { title: 'Floor support for six weeks after Release 1', plans: ['training'], adkar: ['ability'], groupIds: [ig.ig1.id, ig.ig2.id], ownerId: U.hannah.id, responsibleRole: 'projectTeam', startDate: dd('2027-02-01'), endDate: dd('2027-03-12') });
    await A('tr5', { title: 'Claims and payments training (Release 2)', plans: ['training'], adkar: ['knowledge'], groupIds: [ig.ig3.id], ownerId: U.liam.id, responsibleRole: 'trainingTeam', startDate: dd('2027-04-12'), endDate: dd('2027-04-30') });
    await A('tr6', { title: 'Plan review workflow training (Release 2)', plans: ['training'], adkar: ['knowledge'], groupIds: [ig.ig4.id], ownerId: U.liam.id, responsibleRole: 'trainingTeam', startDate: dd('2027-04-12'), endDate: dd('2027-04-30') });
    await A('tr7', { title: 'Early childhood partner eLearning', plans: ['training'], adkar: ['knowledge'], groupIds: [ig.ig5.id], ownerId: U.liam.id, responsibleRole: 'trainingTeam', startDate: dd('2026-12-01'), endDate: dd('2027-01-29') });
    await A('tr8', { title: 'Job aids published for Release 1 roles', plans: ['training'], adkar: ['knowledge', 'ability'], groupIds: [ig.ig1.id, ig.ig2.id, ig.ig4.id, ig.ig5.id], ownerId: U.liam.id, responsibleRole: 'trainingTeam', startDate: dd('2027-01-18'), endDate: dd('2027-01-29') });
    // Resistance Management Plan
    await A('rs1', { title: 'Union consultation on platform data use', plans: ['resistance'], adkar: ['desire'], groupIds: [ig.ig1.id, ig.ig2.id], ownerId: U.priya.id, responsibleRole: 'changeTeam', startDate: dd('2026-08-03'), endDate: dd('2026-12-18'), status: 'inProgress', percentComplete: 60 });
    await A('rs2', { title: 'Template retirement focus groups with planners', plans: ['resistance', 'changeAgent'], adkar: ['desire'], groupIds: [ig.ig1.id], ownerId: U.tom.id, responsibleRole: 'changeAgents', startDate: dd('2026-11-02'), endDate: dd('2026-11-13'), interventionId: 'iv-de-4' });
    await A('rs3', { title: 'Service-level relief agreement for contact centre training weeks', plans: ['resistance', 'sponsor'], adkar: ['desire', 'ability'], groupIds: [ig.ig2.id], ownerId: U.priya.id, responsibleRole: 'sponsor', delivererId: P.louise.id, startDate: dd('2026-10-19'), endDate: dd('2026-10-30'), status: 'inProgress', percentComplete: 30 });
    // Change Agent Network Plan
    await A('ca1', { title: 'Recruit and endorse change agents in every region', plans: ['changeAgent'], adkar: ['awareness'], groupIds: [], ownerId: U.tom.id, responsibleRole: 'changeTeam', startDate: dd('2026-06-01'), endDate: dd('2026-07-31'), status: 'complete', percentComplete: 100 });
    await A('ca2', { title: 'Change agents run sandbox demonstrations for their teams', plans: ['changeAgent', 'training'], adkar: ['knowledge'], groupIds: [ig.ig1.id, ig.ig2.id], ownerId: U.tom.id, responsibleRole: 'changeAgents', startDate: dd('2026-11-09'), endDate: dd('2026-12-11') });
    await A('ca3', { title: 'Change agent feedback loop: weekly themes to the change team', plans: ['changeAgent'], adkar: ['awareness', 'desire'], groupIds: [], ownerId: U.tom.id, responsibleRole: 'changeAgents', startDate: dd('2026-08-03'), endDate: dd('2027-06-30'), status: 'inProgress', percentComplete: 35 });
    await A('ca4', { title: 'Peer stories from pilot planners', plans: ['changeAgent', 'communications'], adkar: ['desire'], groupIds: [ig.ig1.id], ownerId: U.grace.id, responsibleRole: 'changeAgents', startDate: dd('2026-11-16'), endDate: dd('2026-11-27'), interventionId: 'iv-de-7' });
    // Sustainment
    await A('su1', { title: 'Retire planning templates from the intranet', plans: ['sustainment'], adkar: ['reinforcement'], groupIds: [ig.ig1.id], ownerId: U.hannah.id, responsibleRole: 'projectTeam', milestoneId: ms.r1.id, offsetDays: 5, startDate: cal.addBusinessDays(D('2027-02-01'), 5), endDate: cal.addBusinessDays(D('2027-02-01'), 5) });
    await A('su2', { title: 'Monthly usage reporting to General Managers', plans: ['sustainment'], adkar: ['reinforcement'], groupIds: [ig.ig1.id, ig.ig2.id, ig.ig3.id, ig.ig4.id], ownerId: U.hannah.id, responsibleRole: 'businessOwner', startDate: dd('2027-03-01'), endDate: dd('2027-09-30') });
    // Group-specific gaps are deliberate: Claims and Payments has no open Ability activity (barrier point
    // coverage warning) and the Plan Review Team has no People Manager Plan activity.
    await A('pl1', { title: 'Claims and payments awareness briefings', plans: ['communications'], adkar: ['awareness'], groupIds: [ig.ig3.id], ownerId: U.grace.id, responsibleRole: 'communications', startDate: dd('2026-09-07'), endDate: dd('2026-09-11'), status: 'complete', percentComplete: 100 });
    await A('pl2', { title: 'Claims process walkthroughs with business process owners', plans: ['training'], adkar: ['knowledge', 'desire'], groupIds: [ig.ig3.id], ownerId: U.liam.id, responsibleRole: 'trainingTeam', startDate: dd('2026-10-05'), endDate: dd('2026-10-16'), status: 'complete', percentComplete: 100 });
    await A('pl3', { title: 'Participant-facing plan guide in accessible formats', plans: ['communications'], adkar: ['awareness', 'knowledge'], groupIds: [ig.ig7.id], ownerId: U.grace.id, responsibleRole: 'communications', startDate: dd('2026-12-01'), endDate: dd('2027-01-22') });
    await A('pl4', { title: 'Provider registration briefing on Release 2 changes', plans: ['communications'], adkar: ['awareness', 'knowledge'], groupIds: [ig.ig6.id], ownerId: U.grace.id, responsibleRole: 'communications', startDate: dd('2027-03-01'), endDate: dd('2027-03-05') });
    await A('pl5', { title: 'Recognise early adopters in team meetings', plans: ['peopleManager'], adkar: ['reinforcement'], groupIds: [ig.ig2.id, ig.ig3.id], ownerId: U.tom.id, responsibleRole: 'peopleManager', startDate: dd('2027-02-15'), endDate: dd('2027-06-30') });
    await A('pl6', { title: 'Plan review demonstrations for reviewers', plans: ['training'], adkar: ['awareness', 'knowledge'], groupIds: [ig.ig4.id], ownerId: U.liam.id, responsibleRole: 'trainingTeam', startDate: dd('2026-11-16'), endDate: dd('2026-11-20') });
    await A('pl7', { title: 'Reviewer focus group on the review backlog', plans: ['resistance'], adkar: ['desire'], groupIds: [ig.ig4.id], ownerId: U.tom.id, responsibleRole: 'changeTeam', startDate: dd('2026-11-23'), endDate: dd('2026-11-27') });
    await A('pl8', { title: 'Early childhood partner readiness checklist', plans: ['changeAgent'], adkar: ['ability', 'reinforcement'], groupIds: [ig.ig5.id], ownerId: U.tom.id, responsibleRole: 'changeAgents', startDate: dd('2027-01-11'), endDate: dd('2027-01-22') });
    await A('pl9', { title: 'Participant advisory council review of the plan summary', plans: ['communications'], adkar: ['desire', 'ability'], groupIds: [ig.ig7.id], ownerId: U.grace.id, responsibleRole: 'communications', startDate: dd('2026-11-02'), endDate: dd('2026-11-06') });
    await A('pl10', { title: 'Participant usage tips in the portal', plans: ['communications', 'sustainment'], adkar: ['reinforcement'], groupIds: [ig.ig7.id], ownerId: U.grace.id, responsibleRole: 'communications', startDate: dd('2027-02-15'), endDate: dd('2027-04-30') });
    await A('pl11', { title: 'Provider registration staff platform walkthrough', plans: ['training'], adkar: ['knowledge', 'ability', 'desire', 'reinforcement'], groupIds: [ig.ig6.id], ownerId: U.liam.id, responsibleRole: 'trainingTeam', startDate: dd('2027-03-08'), endDate: dd('2027-03-12') });
    await A('pl12', { title: 'Team leader dashboards in weekly management meetings', plans: ['peopleManager', 'sustainment'], adkar: ['reinforcement', 'ability'], groupIds: [ig.ig8.id, ig.ig5.id], ownerId: U.tom.id, responsibleRole: 'peopleManager', startDate: dd('2027-02-08'), endDate: dd('2027-06-30') });
    await A('pl13', { title: 'Review team recognition and quality measures', plans: ['sustainment'], adkar: ['reinforcement', 'ability'], groupIds: [ig.ig4.id], ownerId: U.tom.id, responsibleRole: 'businessOwner', startDate: dd('2027-05-17'), endDate: dd('2027-06-30') });
    // A late sponsor commitment shows the overdue sponsor alert (SPN-006).
    act.sp5 = await put(act.sp5, { status: 'inProgress', percentComplete: 20 });

    // Communications (COM-001): communication items are plan activities of kind 'communication'.
    const comm = {};
    const C = async (key, data) => { comm[key] = await M('activity', { kind: 'communication', plans: ['communications'], status: 'notStarted', percentComplete: 0, frequency: 'oneOff', authorId: U.grace.id, approverId: U.priya.id, ...data }); return comm[key]; };
    await C('c1', { title: 'All-staff announcement: case management replacement', objective: 'Build awareness of why the system is being replaced', adkar: ['awareness'], groupIds: [], keyMessageIds: [km.why.id, km.when.id], messageFocus: 'businessReasons', delivererId: P.margaret.id, channel: 'Email', startDate: dd('2026-05-05'), endDate: dd('2026-05-05'), commsStatus: 'sent', status: 'complete', percentComplete: 100, sentAt: T('2026-05-05'), reach: { delivered: 4210, opened: 3120 } });
    await C('c2', { title: 'Intranet feature: meet the change agents', objective: 'Introduce local change agents', adkar: ['awareness', 'desire'], groupIds: [ig.ig1.id, ig.ig2.id], keyMessageIds: [km.support.id], messageFocus: 'howTo', delivererId: P.rajesh.id, channel: 'Intranet', startDate: dd('2026-08-10'), endDate: dd('2026-08-10'), commsStatus: 'sent', status: 'complete', percentComplete: 100, sentAt: T('2026-08-10'), reach: { viewed: 1830 } });
    await C('c3', { title: 'Planner newsletter: what changes in Release 1', objective: 'Explain what changes for planners and when', adkar: ['awareness', 'knowledge'], groupIds: [ig.ig1.id], keyMessageIds: [km.when.id, km.wiifmPlanners.id], messageFocus: 'howTo', delivererId: P.rajesh.id, channel: 'Newsletter', startDate: dd('2026-09-21'), endDate: dd('2026-09-21'), commsStatus: 'sent', status: 'complete', percentComplete: 100, sentAt: T('2026-09-21'), reach: { delivered: 1240, opened: 910 } });
    await C('c4', { title: 'Contact centre huddle notes: the new plan summary', objective: 'Prepare staff to explain the new plan format', adkar: ['knowledge'], groupIds: [ig.ig2.id], keyMessageIds: [km.wiifmCc.id, km.participants.id], messageFocus: 'personalImpacts', delivererId: P.peter.id, channel: 'Team huddle', startDate: dd('2026-10-19'), endDate: dd('2026-10-19'), commsStatus: 'sent', status: 'complete', percentComplete: 100, sentAt: T('2026-10-19') });
    await C('c5', { title: 'Data use and monitoring: what has been agreed', objective: 'Address concerns about monitoring', adkar: ['desire'], groupIds: [ig.ig1.id, ig.ig2.id], keyMessageIds: [km.monitoring.id], messageFocus: 'personalImpacts', delivererId: P.rajesh.id, channel: 'Email', startDate: dd('2026-10-28'), endDate: dd('2026-10-28'), commsStatus: 'inReview' });
    await C('c6', { title: 'Pilot results story', objective: 'Reinforce early success', adkar: ['reinforcement', 'desire'], groupIds: [ig.ig1.id], keyMessageIds: [km.progress.id], messageFocus: 'progress', delivererId: P.margaret.id, channel: 'Intranet', startDate: dd('2026-11-03'), endDate: dd('2026-11-03'), commsStatus: 'draft' });
    await C('c7', { title: 'Training invitations: Release 1', objective: 'Enrol staff in role-based training', adkar: ['knowledge'], groupIds: [ig.ig1.id, ig.ig2.id], keyMessageIds: [km.support.id], messageFocus: 'howTo', delivererId: P.liam_s.id, channel: 'Email', startDate: dd('2026-11-30'), endDate: dd('2026-11-30'), commsStatus: 'approved' });
    await C('c8', { title: 'Participant letter: your plan is getting easier to read', objective: 'Prepare participants for the new plan format', adkar: ['awareness'], groupIds: [ig.ig7.id], keyMessageIds: [km.participants.id], messageFocus: 'businessReasons', delivererId: P.margaret.id, channel: 'Letter and portal', startDate: dd('2027-01-11'), endDate: dd('2027-01-15'), commsStatus: 'draft' });
    await C('c9', { title: 'Go-live countdown: two weeks to go', objective: 'Confirm what happens at go-live and where to get help', adkar: ['awareness', 'knowledge'], groupIds: [ig.ig1.id, ig.ig2.id, ig.ig5.id], keyMessageIds: [km.when.id, km.support.id], messageFocus: 'howTo', delivererId: P.rajesh.id, channel: 'Email', milestoneId: ms.r1.id, offsetDays: -10, startDate: cal.addBusinessDays(D('2027-02-01'), -10), endDate: cal.addBusinessDays(D('2027-02-01'), -10), commsStatus: 'draft' });
    await C('c10', { title: 'People leader update: your role in Release 1', objective: 'Equip leaders before team conversations', adkar: ['awareness', 'desire'], groupIds: [ig.ig8.id], keyMessageIds: [km.leaders.id], messageFocus: 'personalImpacts', delivererId: P.margaret.id, channel: 'Email', startDate: dd('2026-10-26'), endDate: dd('2026-10-26'), commsStatus: 'scheduled' });
    await C('c11', { title: 'Claims and payments: Release 2 preview', objective: 'Introduce the Release 2 changes', adkar: ['awareness'], groupIds: [ig.ig3.id], keyMessageIds: [km.when.id], messageFocus: 'howTo', delivererId: P.michael.id, channel: 'Email', startDate: dd('2027-02-22'), endDate: dd('2027-02-22'), commsStatus: 'draft' });
    await C('c12', { title: 'Contact centre floor briefing schedule', objective: 'Tell staff when floor briefings happen', adkar: ['knowledge'], groupIds: [ig.ig2.id], keyMessageIds: [km.support.id], messageFocus: 'howTo', delivererId: P.louise.id, channel: 'Email', startDate: dd('2026-10-27'), endDate: dd('2026-10-27'), commsStatus: 'approved' });
    await C('c13', { title: 'Contact centre: handling times during the transition', objective: 'Explain the service-level relief for training weeks', adkar: ['desire'], groupIds: [ig.ig2.id], keyMessageIds: [km.wiifmCc.id], messageFocus: 'personalImpacts', delivererId: P.louise.id, channel: 'Email', startDate: dd('2026-10-28'), endDate: dd('2026-10-28'), commsStatus: 'draft' });
    await C('c14', { title: 'Contact centre: sandbox practice reminders', objective: 'Encourage practice', adkar: ['ability'], groupIds: [ig.ig2.id], keyMessageIds: [km.support.id], messageFocus: 'howTo', delivererId: P.peter.id, channel: 'Collaboration channel', startDate: dd('2026-10-29'), endDate: dd('2026-10-29'), commsStatus: 'draft' });
    await C('c15', { title: 'Contact centre: FAQ digest', objective: 'Answer the most common questions', adkar: ['awareness'], groupIds: [ig.ig2.id], keyMessageIds: [], messageFocus: 'howTo', delivererId: P.peter.id, channel: 'Intranet', startDate: dd('2026-10-30'), endDate: dd('2026-10-30'), commsStatus: 'draft' });
    // Approval requests for communications under review (COM-005).
    for (const k of ['c5']) await M('approval', { subjectType: 'communication', subjectId: comm[k].id, subjectLabel: comm[k].title, requestedBy: U.grace.id, requestedAt: T('2026-10-20'), rule: 'all', status: 'pending', approvers: [{ userId: U.priya.id, name: 'Priya Raman', decision: null, comment: null, decidedAt: null }] }, T('2026-10-20'));
    await M('approval', { subjectType: 'keyMessage', subjectId: km.monitoring.id, subjectLabel: km.monitoring.title, requestedBy: U.grace.id, requestedAt: T('2026-10-19'), rule: 'all', status: 'pending', approvers: [{ userId: U.priya.id, name: 'Priya Raman', decision: null, comment: null, decidedAt: null }, { userId: U.margaret.id, name: 'Margaret Chen', decision: 'approve', comment: 'Agree with the wording.', decidedAt: T('2026-10-20') }] }, T('2026-10-19'));
    await M('approval', { subjectType: 'blueprint', subjectId: bpG.ig3.id, subjectLabel: bpG.ig3.name, requestedBy: U.tom.id, requestedAt: T('2026-10-21'), rule: 'any', status: 'pending', approvers: [{ userId: U.margaret.id, name: 'Margaret Chen', decision: null, comment: null, decidedAt: null }, { userId: U.priya.id, name: 'Priya Raman', decision: null, comment: null, decidedAt: null }] }, T('2026-10-21'));

    // Master Change Management Plan approval, baseline and change log (PLN-006, PLN-007, WFL-001).
    const baselineAt = '2026-07-24';
    const allActs = await S.driver.list('activity', { initiativeId: I });
    const shifted = { tr3: ['2026-10-05', '2026-11-27'], pm3: ['2026-10-05', '2026-10-30'], sp3: ['2026-09-21', '2026-10-02'], rs3: ['2026-10-05', '2026-10-16'] };
    const keyOf = Object.fromEntries(Object.entries(act).map(([k, v]) => [v.id, k]));
    const snapshot = allActs.filter((a) => !['c13', 'c14', 'c15'].includes(Object.entries(comm).find(([, v]) => v.id === a.id)?.[0]) && !['pl13'].includes(keyOf[a.id])).map((a) => {
      const sh = shifted[keyOf[a.id]];
      return { id: a.id, code: a.code, title: a.title, plans: a.plans, adkar: a.adkar, groupIds: a.groupIds, ownerId: a.ownerId, startDate: sh ? D(sh[0]) : a.startDate, endDate: sh ? D(sh[1]) : a.endDate, status: a.startDate < D(baselineAt) ? a.status : 'notStarted', percentComplete: a.startDate < D(baselineAt) ? a.percentComplete : 0 };
    });
    await M('planBaseline', { name: 'Baseline 1: approved Master Change Management Plan', date: D(baselineAt), reason: 'Approved by the Executive Steering Committee on 21 July 2026.', activities: snapshot }, T(baselineAt));
    for (const [k, summary, reason, date] of [
      ['tr3', 'Sandbox practice weeks extended by two weeks', 'Vendor delivered the UAT environment two weeks late.', '2026-09-08'],
      ['pm3', 'Team conversations extended to 6 November', 'Contact centre peak period in late October.', '2026-10-06'],
      ['sp3', 'Partner CEO calls moved to October', 'Primary sponsor on leave in late September.', '2026-09-14'],
      ['rs3', 'Service-level relief agreement deferred two weeks', 'Waiting on the October call volume forecast.', '2026-10-09'],
    ]) await M('planChange', { activityId: act[k].id, summary, reason, fields: [{ field: 'endDate', from: D(shifted[k][1]), to: act[k].endDate }] }, T(date));
    await M('planChange', { activityId: act.pl13.id, summary: 'Added: review team recognition and quality measures', reason: 'Gap identified in the September coverage review (Reinforcement for the Plan Review Team).', fields: [] }, T('2026-09-22'));
    await M('approval', { subjectType: 'masterPlan', subjectId: I, subjectLabel: 'Master Change Management Plan', component: 'all', requestedBy: U.priya.id, requestedAt: T('2026-07-14'), rule: 'all', status: 'approved', approvers: [{ userId: U.margaret.id, name: 'Margaret Chen', decision: 'approve', comment: 'Approved at the July Steering Committee.', decidedAt: T('2026-07-21') }, { userId: U.hannah.id, name: 'Hannah Brooks', decision: 'approve', comment: 'Integrated into the project schedule.', decidedAt: T('2026-07-16') }], snapshot: { version: '1.0', baseline: 'Baseline 1' }, note: 'Version 1.0 for approval.' }, T('2026-07-14'));

    // Training (TRN)
    const iv = {};
    for (const [key, title, modality, hours, groups, owner, msKey, offset, forRoles, target] of [
      ['core', 'Platform essentials (eLearning)', 'eLearning', 1.5, ['ig1', 'ig2', 'ig3', 'ig4', 'ig5', 'ig8'], 'liam', 'r1', -25, false, 95],
      ['plan', 'Planning in the new platform', 'instructorLed', 6, ['ig1'], 'liam', 'r1', -15, false, 90],
      ['cc', 'Contact centre calls in the new platform', 'virtual', 3, ['ig2'], 'liam', 'r1', -10, false, 90],
      ['claims', 'Claims and payments processing', 'instructorLed', 6, ['ig3'], 'liam', 'r2', -15, false, 90],
      ['review', 'Plan review workflow', 'instructorLed', 4, ['ig4'], 'liam', 'r2', -15, false, 90],
      ['sandbox', 'Sandbox practice session', 'sandbox', 2, ['ig1', 'ig2', 'ig4'], 'liam', 'r1', -20, false, 80],
      ['leaders', 'Leading your team through the change', 'virtual', 3, ['ig8'], 'tom', 'r1', -40, true, 100],
      ['sponsors', 'Sponsor role briefing', 'instructorLed', 1, [], 'priya', 'designSignOff', -20, true, 100],
    ]) iv[key] = await M('trainingIntervention', { title, modality, durationHours: hours, prerequisites: key === 'plan' || key === 'cc' ? 'Platform essentials (eLearning)' : '', audienceGroupIds: groups.map((g) => ig[g].id), audienceRoles: '', ownerId: U[owner].id, milestoneId: ms[msKey].id, offsetDays: offset, forChangeRoles: forRoles, targetCompletion: target, lmsCourseId: `LMS-${1200 + Object.keys(iv).length}`, description: `${title} for ${groups.length ? groups.map((g) => ig[g].name).join(', ') : 'executives'}.` });
    for (const [g, role, req, cur, need, pri, ivs] of [
      ['ig1', 'Planner', 'Create and update a plan using the guided workflow', 1, 4, 'high', ['core', 'plan', 'sandbox']],
      ['ig1', 'Local Area Coordinator', 'Record pre-planning conversations and referrals', 1, 4, 'high', ['core', 'plan']],
      ['ig2', 'Customer service officer', 'Find and explain a participant\'s plan summary', 2, 4, 'high', ['core', 'cc', 'sandbox']],
      ['ig2', 'Team leader', 'Use queue and quality dashboards', 1, 4, 'medium', ['leaders']],
      ['ig3', 'Claims officer', 'Process claims and clear exception queues', 1, 4, 'high', ['core', 'claims']],
      ['ig4', 'Plan reviewer', 'Run a review from a pre-populated plan', 1, 4, 'high', ['core', 'review', 'sandbox']],
      ['ig5', 'Early childhood coordinator', 'Submit referrals and view a child\'s plan', 2, 3, 'medium', ['core']],
      ['ig8', 'People leader', 'Coach the team through the change (CLARC)', 2, 4, 'high', ['leaders']],
    ]) await M('tna', { impactedGroupId: ig[g].id, role, requirement: req, currentCapability: cur, requiredCapability: need, learningObjectives: `By go-live, ${role.toLowerCase()}s can ${req.charAt(0).toLowerCase()}${req.slice(1)}.`, priority: pri, interventionIds: ivs.map((k) => iv[k].id) });
    // Sessions with enrolments, attendance and completion.
    const members = (gk) => everyone.filter((x) => x[4] === gk).map((x) => P[x[0]].id);
    const ccStaff = [...members('ccg'), ...members('ccb')];
    const planners = [...members('lac'), ...members('pq')];
    const leadersIds = ['daniel', 'jacob', 'nina', 'tarek', 'wendy'].map((k) => P[k].id);
    const enrol = (ids, attendRate, completeRate) => ids.map((sid) => { const attended = rand() < attendRate; return { stakeholderId: sid, attended, completed: attended && rand() < completeRate, score: attended ? 60 + Math.floor(rand() * 40) : null }; });
    await M('trainingSession', { interventionId: iv.leaders.id, date: D('2026-09-02'), startTime: '10:00', durationHours: 3, location: 'Microsoft Teams', link: 'https://teams.example/leaders-1', trainer: 'Tom Nguyen', capacity: 30, enrolments: enrol(leadersIds, 1, 1), status: 'completed', source: 'manual' });
    await M('trainingSession', { interventionId: iv.sponsors.id, date: D('2026-07-08'), startTime: '14:00', durationHours: 1, location: 'National Office, Level 9', trainer: 'Priya Raman', capacity: 10, enrolments: ['margaret', 'kathryn', 'rajesh', 'louise', 'michael', 'sophie'].map((k) => ({ stakeholderId: P[k].id, attended: k !== 'louise', completed: k !== 'louise' })), status: 'completed' });
    await M('trainingSession', { interventionId: iv.core.id, date: D('2026-10-01'), startTime: '09:00', durationHours: 1.5, location: 'eLearning', trainer: 'Learning and Capability', capacity: 500, enrolments: enrol([...ccStaff, ...planners, ...members('cp')], 0.8, 0.85), status: 'completed', source: 'import' });
    await M('trainingSession', { interventionId: iv.sandbox.id, date: D('2026-10-14'), startTime: '13:00', durationHours: 2, location: 'Geelong training room', trainer: 'Leilani Fuimaono', capacity: 16, enrolments: enrol(members('ccg'), 0.9, 0.7), status: 'completed' });
    await M('trainingSession', { interventionId: iv.sandbox.id, date: D('2026-10-20'), startTime: '13:00', durationHours: 2, location: 'Brisbane training room', trainer: 'Bronwyn Kelly', capacity: 16, enrolments: enrol(members('ccb'), 0.6, 0.5), status: 'completed' });
    for (const [date, loc, ivk, ids] of [['2026-11-03', 'Newcastle', 'sandbox', members('lac')], ['2027-01-12', 'Microsoft Teams', 'cc', members('ccg')], ['2027-01-13', 'Microsoft Teams', 'cc', members('ccb')], ['2027-01-18', 'Newcastle', 'plan', members('lac')], ['2027-01-20', 'National Office', 'plan', members('pq')], ['2027-04-19', 'National Office', 'claims', members('cp')], ['2027-04-21', 'National Office', 'review', members('prt')]]) {
      await M('trainingSession', { interventionId: iv[ivk].id, date: D(date), startTime: '09:30', durationHours: iv[ivk].durationHours, location: loc, trainer: 'Learning and Capability', capacity: 20, enrolments: ids.map((sid) => ({ stakeholderId: sid, attended: false, completed: false })), status: 'scheduled' });
    }
    for (const sid of [...members('ccg').slice(0, 6), ...members('cp').slice(0, 4)]) await M('proficiency', { stakeholderId: sid, impactedGroupId: members('ccg').includes(sid) ? ig.ig2.id : ig.ig3.id, interventionId: iv.sandbox.id, evidenceType: 'assessment', result: rand() < 0.75 ? 'proficient' : 'developing', score: 60 + Math.floor(rand() * 40), date: D('2026-10-15'), assessor: 'Sandbox assessment' });
    for (const [kind, desc, groups, from, to] of [['floorSupport', 'Floor walkers in every contact centre and planning office', ['ig1', 'ig2'], '2027-02-01', '2027-03-12'], ['helpDesk', 'Dedicated platform option on the IT Service Desk', ['ig1', 'ig2', 'ig3', 'ig4', 'ig5'], '2027-02-01', '2027-06-30'], ['superUsers', 'Change agents act as super users for their teams', ['ig1', 'ig2'], '2027-01-25', '2027-04-30'], ['knowledgeBase', 'Knowledge articles for the top 30 "how do I" questions', [], '2027-01-25', '2027-09-30']]) await M('supportArrangement', { kind, description: desc, groupIds: groups.map((g) => ig[g].id), from: D(from), to: D(to), ownerId: U.hannah.id });

    // Change agents (CAN)
    const agentMap = { aisha: ['ig2'], ca1: ['ig1'], ca2: ['ig1'], ca3: ['ig1', 'ig4'], ca4: ['ig2'], ca5: ['ig3'], ca6: ['ig3'], ca7: ['ig4'], ca8: ['ig5'], ca9: ['ig6'], ca10: ['ig2'], ca11: ['ig1'] };
    const agent = {};
    for (const [k, groups] of Object.entries(agentMap)) agent[k] = await M('changeAgent', { stakeholderId: P[k].id, groupIds: groups.map((g) => ig[g].id), locations: P[k].location, roleDescription: 'Represents their team, shares updates, runs sandbox demonstrations and reports feedback weekly.', hoursPerWeek: k === 'ca3' ? 4 : 2, managerEndorsed: k !== 'ca11', endorsedDate: k !== 'ca11' ? D('2026-07-20') : null, status: k === 'ca9' ? 'onLeave' : 'active', startDate: D('2026-07-27'), recognition: ['aisha', 'ca3'].includes(k) ? 'Recognised at the September town hall for running extra sandbox sessions.' : '' });

    // Profiles (STK) — analysis of key stakeholders and groups.
    const prof = {};
    const owner = (k) => (['andrew', 'margaret', 'kathryn', 'james', 'helen', 'colin', 'jennifer', 'ben', 'fatima', 'ruth', 'tim', 'marcus', 'sophie', 'louise', 'rajesh', 'michael'].includes(k) ? U.priya.id : U.tom.id);
    const PR = async (k, roles, inf, int, cur, des, groups, extra = {}, at = T('2026-04-20')) => { prof[k] = await M('profile', { subjectType: 'person', stakeholderId: P[k].id, changeRoles: roles, impactedGroupIds: groups.map((g) => ig[g].id), relationshipOwnerId: owner(k), delegateId: owner(k) === U.priya.id ? U.tom.id : null, influence: inf, interest: int, currentEngagement: cur, desiredEngagement: des, ratingHistory: [], ...extra }, at); return prof[k]; };
    await PR('margaret', ['primarySponsor'], 'high', 'high', 'leading', 'leading', [], { interests: 'Faster plan approvals; protecting payments; staff wellbeing during the transition.', concerns: 'Diary time in January; partner organisations\' readiness.', wiifm: 'Delivery of the service charter commitments.' });
    await PR('andrew', ['steeringCommittee'], 'high', 'medium', 'supportive', 'supportive', []);
    await PR('kathryn', ['coalitionMember', 'steeringCommittee'], 'high', 'medium', 'supportive', 'leading', [], { interests: 'Enterprise change load and benefits realisation.' });
    await PR('james', ['coalitionMember'], 'high', 'high', 'supportive', 'leading', [], { interests: 'Vendor delivery and platform stability.', concerns: 'Business readiness for the UAT window.' });
    await PR('helen', ['steeringCommittee'], 'high', 'low', 'neutral', 'supportive', []);
    await PR('rajesh', ['businessOwner', 'coalitionMember'], 'high', 'high', 'supportive', 'leading', ['ig1', 'ig4'], { interests: 'Planning quality and consistency.', concerns: 'Review backlog during Release 2.', wiifm: 'Reliable planning quality data.' });
    await PR('louise', ['coalitionMember', 'peopleManager'], 'high', 'high', 'neutral', 'leading', ['ig2'], { interests: 'Service levels and staff wellbeing.', concerns: 'Handling times rising during the transition; training weeks clashing with peak periods.', wiifm: 'Fewer transfers and better first-contact resolution.' });
    await PR('michael', ['coalitionMember', 'peopleManager'], 'high', 'high', 'supportive', 'leading', ['ig3']);
    await PR('sophie', ['coalitionMember'], 'high', 'high', 'neutral', 'supportive', ['ig1', 'ig5'], { concerns: 'Partner contract variations for training backfill.' });
    await PR('neil', ['businessOwner'], 'medium', 'medium', 'supportive', 'supportive', ['ig6']);
    for (const k of ['olivia', 'ahmed', 'rebecca', 'caroline', 'peter', 'meilin']) await PR(k, ['peopleManager'], 'medium', 'high', k === 'peter' ? 'neutral' : 'supportive', 'leading', k === 'olivia' ? ['ig4'] : k === 'peter' || k === 'meilin' ? ['ig2'] : k === 'caroline' ? ['ig3'] : ['ig1']);
    for (const k of ['daniel', 'jacob', 'nina', 'tarek', 'wendy']) await PR(k, ['peopleManager'], 'low', 'high', k === 'jacob' ? 'neutral' : 'supportive', 'leading', k === 'nina' ? ['ig4'] : k === 'daniel' || k === 'wendy' ? ['ig3'] : ['ig2']);
    await PR('kim', ['sme', 'influencer'], 'medium', 'high', 'supportive', 'leading', ['ig1']);
    await PR('oscar', ['sme'], 'low', 'high', 'supportive', 'supportive', []);
    await PR('ben', ['externalParty', 'influencer'], 'high', 'high', 'neutral', 'supportive', ['ig1'], { interests: 'Partner workload and staff retention.', concerns: 'Training backfill funding; Agency monitoring of partner staff performance.', wiifm: 'Less re-keying for partner planners.', privateNotes: 'Raised the backfill issue with the partner CEO; expect it at the November forum.' });
    await PR('fatima', ['externalParty'], 'medium', 'high', 'supportive', 'supportive', ['ig5'], { cadenceOverrideDays: 90, interests: 'Referral workload for early childhood coordinators.' });
    await PR('colin', ['employeeRep'], 'high', 'high', 'resistant', 'neutral', ['ig1', 'ig2'], { interests: 'Workload, monitoring and consultation obligations.', concerns: 'Use of platform data for performance management; workload during training.', privateNotes: 'Willing to support if the data-use agreement is formalised.' });
    await PR('jennifer', ['regulator'], 'high', 'low', 'neutral', 'supportive', ['ig7'], { cadenceOverrideDays: 90, interests: 'Complaints about plan delays and accessibility.' });
    await PR('marcus', ['vendor'], 'medium', 'medium', 'supportive', 'supportive', []);
    await PR('ruth', ['influencer'], 'medium', 'high', 'neutral', 'supportive', ['ig7']);
    await PR('tim', ['influencer', 'externalParty'], 'medium', 'high', 'resistant', 'neutral', ['ig7'], { concerns: 'Accessibility of the new portal and plan format for participants with cognitive disability.' }, T('2026-09-07'));
    for (const k of Object.keys(agentMap)) await PR(k, ['changeAgent'], 'low', 'high', 'supportive', 'leading', agentMap[k], {}, T('2026-07-27'));
    const sampleEmployees = everyone.filter((x) => x[0].startsWith('tm') && ['cp', 'ccg', 'prt', 'lac'].includes(x[4])).slice(0, 14).map((x) => x[0]);
    for (const k of sampleEmployees) {
      const row = everyone.find((x) => x[0] === k);
      const grp = { cp: 'ig3', ccg: 'ig2', prt: 'ig4', lac: 'ig1' }[row[4]];
      await PR(k, ['impactedEmployee'], 'low', rand() < 0.5 ? 'medium' : 'low', rand() < 0.3 ? 'unaware' : 'neutral', 'supportive', [grp], {}, T('2026-06-15'));
    }
    for (const [sg, igk, inf, int] of [['lac', 'ig1', 'high', 'high'], ['cco', 'ig2', 'medium', 'high'], ['cpb', 'ig3', 'medium', 'high'], ['prt', 'ig4', 'medium', 'high'], ['ecei', 'ig5', 'medium', 'medium'], ['prq', 'ig6', 'low', 'medium'], ['pan', 'ig7', 'high', 'medium'], ['leaders', 'ig8', 'medium', 'high']]) {
      // Partner networks and participants are engaged through agreed forums, so their cadence is set to match.
      const cadenceOverrideDays = { lac: 30, ecei: 90, pan: 90 }[sg] ?? null;
      prof[`g:${sg}`] = await M('profile', { subjectType: 'group', groupId: G[sg].id, changeRoles: sg === 'leaders' ? ['peopleManager'] : sg === 'pan' ? ['externalParty'] : ['impactedEmployee'], impactedGroupIds: [ig[igk].id], relationshipOwnerId: U.tom.id, influence: inf, interest: int, interests: ig[igk].wiifm, concerns: ig[igk].concerns, cadenceOverrideDays, ratingHistory: [] }, T('2026-04-20'));
    }
    // Analysis history (STK-017): movement over time.
    const hist = (k, field, steps) => put(prof[k], { ratingHistory: steps.map(([at, from, to], i) => ({ at: T(at), by: owner(k), field, from, to, i })) }).then((r) => { prof[k] = r; });
    await hist('louise', 'currentEngagement', [['2026-04-20', null, 'supportive'], ['2026-09-18', 'supportive', 'neutral']]);
    await hist('ben', 'currentEngagement', [['2026-04-22', null, 'supportive'], ['2026-08-28', 'supportive', 'neutral']]);
    await hist('colin', 'currentEngagement', [['2026-04-23', null, 'neutral'], ['2026-07-30', 'neutral', 'resistant']]);
    await hist('rajesh', 'currentEngagement', [['2026-04-20', null, 'neutral'], ['2026-06-15', 'neutral', 'supportive']]);

    // ADKAR assessments (ADK): survey-based baseline, pre-go-live rounds, practitioner and individual.
    const survey = async (title, round, groups, opens, closes, status, targetMeans, invited) => {
      const s = await M('survey', { title, kind: 'adkar', round, intro: 'This short check asks how you are finding the change. It takes about two minutes.', questions: [...ADKAR_SURVEY_ITEMS.map((q) => ({ ...q, type: 'adkar' })), { id: 'q-comment', type: 'text', text: 'Is there anything else you would like the change team to know?' }], groupIds: groups.map((g) => ig[g].id), anonymous: true, minSegment: 5, opensAt: D(opens), closesAt: D(closes), status, token: uid().slice(0, 16), collectionNoticeId: 'cn-survey', invited, responseTarget: 60, reminders: status !== 'draft' ? [{ at: T(addDays(opens, 7)), by: U.tom.id, groupIds: groups.map((g) => ig[g].id) }] : [] }, T(opens));
      const comments = ['Need more time to practise before go-live.', 'Worried about handling times in the first weeks.', 'The sandbox sessions were really useful.', 'Not sure why we need to stop using our templates.', 'When will partner staff be trained?', 'Looking forward to one screen instead of four.', 'Please make sure the portal works with screen readers.', 'Our team leader explained the change well.'];
      for (const [g, n, means] of targetMeans) {
        const rs = [];
        for (let i = 0; i < n; i++) {
          const answers = {};
          for (const q of ADKAR_SURVEY_ITEMS) answers[q.id] = clamp(Math.round(means[q.element] + (rand() - 0.5) * 2.2), 1, 5);
          if (rand() < 0.25) answers['q-comment'] = comments[Math.floor(rand() * comments.length)];
          rs.push(answers);
          await M('surveyResponse', { surveyId: s.id, groupId: ig[g].id, stakeholderId: null, answers, submittedAt: T(addDays(opens, 1 + Math.floor(rand() * Math.max(1, diffDays(opens, closes) - 1)))) });
        }
        if (status === 'closed') {
          const ag = aggregate(rs.map((a) => Object.fromEntries(ADKAR_SURVEY_ITEMS.map((q) => [q.element, a[q.id]]))), { threshold: 3, minSegment: 5 });
          await M('assessment', { kind: 'adkar', subjectType: 'group', subjectId: ig[g].id, round, method: 'self', date: D(closes), respondents: ag.n, scores: Object.fromEntries(ADKAR_IDS.map((el) => [el, ag.elements[el].score])), distribution: Object.fromEntries(ADKAR_IDS.map((el) => [el, ag.elements[el].distribution])), surveyId: s.id, confirmed: round === 'baseline', confirmedBy: round === 'baseline' ? U.priya.id : null, confirmedAt: round === 'baseline' ? T(addDays(closes, 2)) : null, comment: ag.suppressed ? 'Suppressed: fewer than 5 respondents (RUL-03). Included only in the organisation-level result.' : '' }, T(closes));
          for (const a of rs.filter((x) => x['q-comment'])) await M('feedback', { date: D(closes), channel: 'survey', groupId: ig[g].id, text: a['q-comment'], themes: /time|practise|handling/.test(a['q-comment']) ? ['timing'] : /portal|screen/.test(a['q-comment']) ? ['system'] : /trained|training|sandbox/.test(a['q-comment']) ? ['training'] : ['communication'], sentiment: /useful|forward|well/.test(a['q-comment']) ? 'positive' : 'negative', adkar: [], surveyId: s.id, status: 'reviewed' });
        }
      }
      return s;
    };
    await survey('Baseline ADKAR pulse check', 'baseline', ['ig1', 'ig2', 'ig3', 'ig4', 'ig5', 'ig8'], '2026-05-11', '2026-05-29', 'closed', [
      ['ig1', 42, { awareness: 3.1, desire: 2.6, knowledge: 1.8, ability: 1.7, reinforcement: 1.6 }],
      ['ig2', 35, { awareness: 3.3, desire: 3.2, knowledge: 2.0, ability: 2.0, reinforcement: 2.1 }],
      ['ig3', 28, { awareness: 2.9, desire: 3.3, knowledge: 2.2, ability: 2.0, reinforcement: 2.0 }],
      ['ig4', 22, { awareness: 2.7, desire: 3.0, knowledge: 1.9, ability: 1.8, reinforcement: 1.8 }],
      ['ig5', 4, { awareness: 3.6, desire: 3.5, knowledge: 2.4, ability: 2.2, reinforcement: 2.0 }],
      ['ig8', 18, { awareness: 3.9, desire: 3.6, knowledge: 2.6, ability: 2.4, reinforcement: 2.5 }],
    ], 2134);
    await survey('Pre-go-live ADKAR pulse check (Release 1)', 'preGoLive', ['ig1', 'ig2', 'ig3'], '2026-09-28', '2026-10-16', 'closed', [
      ['ig1', 38, { awareness: 4.0, desire: 2.9, knowledge: 2.6, ability: 2.2, reinforcement: 2.0 }],
      ['ig2', 31, { awareness: 4.3, desire: 4.0, knowledge: 2.8, ability: 2.5, reinforcement: 2.4 }],
      ['ig3', 24, { awareness: 4.5, desire: 4.4, knowledge: 4.4, ability: 2.8, reinforcement: 2.5 }],
    ], 1810);
    const open = await survey('Contact centre sandbox pulse', 'adHoc', ['ig2'], '2026-10-15', '2026-10-27', 'open', [['ig2', 41, { awareness: 4.4, desire: 4.0, knowledge: 3.2, ability: 2.9, reinforcement: 2.6 }]], 350);
    await put(open, { responseTarget: 60 });
    await M('assessment', { kind: 'adkar', subjectType: 'group', subjectId: ig.ig5.id, round: 'baseline', method: 'practitioner', date: D('2026-06-05'), assessorId: U.tom.id, scores: { awareness: 3.5, desire: 3.5, knowledge: 2.5, ability: 2.0, reinforcement: 2.0 }, comment: 'Practitioner judgement from partner forums, because the survey segment was too small to report.', confirmed: true });
    await M('assessment', { kind: 'adkar', subjectType: 'group', subjectId: ig.ig6.id, round: 'baseline', method: 'practitioner', date: D('2026-06-05'), assessorId: U.tom.id, scores: { awareness: 4.5, desire: 4.2, knowledge: 4.0, ability: 3.8, reinforcement: 3.6 }, comment: 'Low-impact group; on track.', confirmed: true });
    await M('assessment', { kind: 'adkar', subjectType: 'group', subjectId: ig.ig7.id, round: 'baseline', method: 'inferred', date: D('2026-06-26'), assessorId: U.tom.id, scores: { awareness: 2.2, desire: 3.0, knowledge: 2.0, ability: 2.5, reinforcement: 2.0 }, comment: 'Inferred from Participant Advisory Council discussions and contact centre enquiries.', confirmed: true });
    await M('assessment', { kind: 'adkar', subjectType: 'group', subjectId: ig.ig8.id, round: 'preGoLive', method: 'manager', date: D('2026-10-09'), assessorId: U.tom.id, scores: { awareness: 4.4, desire: 4.0, knowledge: 3.0, ability: 2.8, reinforcement: 2.9 }, comment: 'Team leader self-ratings at the leader briefing.', confirmed: false });
    for (const [k, rows] of Object.entries({ louise: [['2026-05-20', 'baseline', [4, 4, 2, 2, 2]], ['2026-10-02', 'preGoLive', [4, 3, 3, 3, 2]]], ben: [['2026-05-22', 'baseline', [4, 3, 2, 2, 2]], ['2026-10-06', 'preGoLive', [4, 2, 3, 2, 2]]], colin: [['2026-07-30', 'adHoc', [4, 2, 2, 2, 1]]], sophie: [['2026-05-25', 'baseline', [4, 4, 3, 3, 3]]], peter: [['2026-10-02', 'preGoLive', [5, 4, 3, 3, 3]]], rajesh: [['2026-05-20', 'baseline', [5, 5, 3, 3, 3]]] })) {
      for (const [date, rnd, s] of rows) await M('assessment', { kind: 'adkar', subjectType: 'stakeholder', subjectId: P[k].id, round: rnd, method: 'practitioner', date: D(date), assessorId: owner(k), scores: Object.fromEntries(ADKAR_IDS.map((el, i) => [el, { score: s[i], comment: '' }])), comment: '', confirmed: true });
    }
    await M('assessment', { kind: 'adkar', subjectType: 'team', subjectId: P.daniel.id, round: 'preGoLive', method: 'manager', date: D('2026-10-08'), assessorId: U.daniel.id, respondents: 9, scores: { awareness: 4.3, desire: 3.8, knowledge: 3.4, ability: 2.6, reinforcement: 2.5 }, comment: 'Team is keen but has had little time to practise in the sandbox.', confirmed: false }, T('2026-10-08'));

    // Readiness (RSK-006)
    const orgCriteria = READINESS_CHECKLISTS.organisational.criteria;
    await M('readinessChecklist', { name: 'Organisational readiness (September)', kind: 'organisational', milestoneId: ms.r1.id, date: D('2026-09-15'), items: orgCriteria.map((c, i) => ({ criterion: c, ownerId: [U.tom.id, U.priya.id, U.tom.id, U.tom.id, U.grace.id, U.priya.id][i], evidence: ['Confirmation records for 6 of 8 groups', 'Launch video and town halls', 'Leader briefing attendance 100%', 'Agents in 7 of 8 groups', 'FAQ library published', 'Resistance register reviewed'][i], status: ['partlyMet', 'met', 'met', 'partlyMet', 'met', 'met'][i], notes: '' })), decision: 'goWithConditions', decisionDate: D('2026-09-16'), decidedBy: 'Project Board', conditions: 'Complete impact confirmation with the Plan Review Team; recruit a change agent for Provider Registration.' });
    const goLive = READINESS_CHECKLISTS.goLive.criteria;
    await M('readinessChecklist', { name: 'Release 1 go-live readiness', kind: 'goLive', milestoneId: ms.r1.id, date: D('2026-10-20'), items: goLive.map((c, i) => ({ criterion: c, ownerId: [U.liam.id, U.liam.id, U.hannah.id, U.grace.id, U.tom.id, U.priya.id, U.liam.id, U.priya.id][i], evidence: ['46% complete (training scheduled for January)', 'Sandbox pass rate 78%', 'Floor support roster drafted', 'Countdown communications drafted', 'Leader briefings complete', 'Scheduled for the January town hall', 'Job aids in development', 'Readiness index below 70 for three groups'][i], status: ['partlyMet', 'partlyMet', 'partlyMet', 'partlyMet', 'met', 'notMet', 'partlyMet', 'notMet'][i], notes: '' })), decision: null });

    // Change risks and issues (RSK-008)
    for (const [kind, title, cause, cons, l, c, status, groups, adkar, owner2] of [
      ['risk', 'Partner organisations cannot release planners for training', 'Backfill funding not yet agreed in partner contracts', 'Planners untrained at go-live; plan quality and timeliness fall', '4', '4', 'treating', ['ig1'], ['knowledge'], 'priya'],
      ['risk', 'Contact centre handling times breach service levels during the transition', 'Learning curve plus peak call period', 'Participant complaints; pressure to revert to workarounds', '4', '3', 'treating', ['ig2'], ['ability'], 'hannah'],
      ['risk', 'Union dispute over the use of platform data', 'No formal agreement on monitoring', 'Industrial action or delayed go-live', '3', '5', 'open', ['ig1', 'ig2'], ['desire'], 'priya'],
      ['issue', 'Plan Review Team has not confirmed its impacts', 'Backlog of reviews limits time for impact workshops', 'Release 2 plans for reviewers may be inaccurate', '5', '3', 'open', ['ig4'], ['awareness'], 'tom'],
      ['risk', 'Participants confused by the new plan format', 'Format changes at Release 1 without enough notice', 'Increase in calls and complaints', '3', '3', 'treating', ['ig7'], ['awareness', 'knowledge'], 'grace'],
      ['risk', 'Change saturation in the contact centre', 'Digital workplace rollout lands in the same quarter', 'Neither change adopted well', '4', '4', 'open', ['ig2'], ['desire', 'ability'], 'priya'],
      ['risk', 'Templates continue to be used after go-live', 'Old templates still available on shared drives', 'Workarounds undermine data quality', '3', '3', 'open', ['ig1'], ['reinforcement'], 'hannah'],
      ['risk', 'Sponsor availability in January', 'Leave and budget estimates period', 'Go-live sponsorship weaker than planned', '3', '2', 'monitoring', [], ['awareness', 'desire'], 'priya'],
      ['risk', 'Vendor slips the UAT milestone', 'Integration defects', 'Training content out of date; compressed training window', '2', '4', 'monitoring', ['ig1', 'ig2'], ['knowledge'], 'hannah'],
      ['risk', 'Accessibility issues in the participant portal', 'Accessibility testing scheduled late', 'Exclusion of participants; complaints to the Ombudsman', '2', '5', 'treating', ['ig7'], ['ability'], 'hannah'],
    ]) await M('risk', { kind, title, cause, consequenceText: cons, likelihood: l, consequence: c, treatment: 'See the Resistance Management Plan and Master Change Management Plan actions.', ownerId: U[owner2].id, status, dueDate: D('2026-12-18'), stakeholderIds: title.startsWith('Union') ? [P.colin.id] : title.startsWith('Partner') ? [P.ben.id, P.sophie.id] : [], groupIds: groups.map((g) => ig[g].id), adkar, projectRiskRef: kind === 'risk' ? `PRJ-R${10 + Math.floor(rand() * 80)}` : null });

    // Resistance (RES)
    for (const [kind, title, sourceType, who, grp, form, desc, root, bp, sev, status, actions] of [
      ['anticipated', 'Attachment to planning templates', 'group', null, 'ig1', 'quietNonCompliance', 'Planners may keep drafting in templates and re-key into the platform.', 'Templates feel faster and more flexible.', 'desire', 'high', 'open', 'Focus groups on the guided workflow; retire templates at go-live; peer stories.'],
      ['anticipated', 'Handling-time pressure in the contact centre', 'group', null, 'ig2', 'workarounds', 'Staff may bypass the platform during busy periods.', 'Service-level targets during the learning curve.', 'ability', 'high', 'open', 'Service-level relief; floor support; coaching.'],
      ['anticipated', 'Reviewer workload', 'group', null, 'ig4', 'delay', 'Reviewers may delay training because of the backlog.', 'Review backlog.', 'desire', 'medium', 'open', 'Backlog plan agreed with the General Manager.'],
      ['anticipated', 'Partner staff concern about monitoring', 'group', null, 'ig1', 'rumours', 'Partner staff may believe the Agency will use the platform to monitor them.', 'Monitoring not explained.', 'desire', 'medium', 'open', 'Data-use key message; partner forum discussion.'],
      ['observed', 'Union concern about platform data use', 'stakeholder', null, 'ig2', 'openOpposition', 'Raised at the July consultative committee: platform reports could be used for individual performance management.', 'No agreed position on data use.', 'desire', 'high', 'escalated', 'Draft data-use statement for consultation; sponsor to attend the November committee.'],
      ['observed', 'Low sandbox attendance in Brisbane', 'group', null, 'ig2', 'lowParticipation', 'Only 60% attended the first Brisbane sandbox session.', 'Rosters not adjusted for training.', 'knowledge', 'medium', 'monitoring', 'Rosters adjusted; second session booked.'],
      ['observed', 'Planners continue to draft offline in the pilot', 'group', null, 'ig1', 'workarounds', 'Pilot planners still draft in Word and paste into the platform.', 'Unfamiliar with drafting during the conversation.', 'ability', 'medium', 'open', 'Coaching by change agents; demonstration of in-meeting drafting.'],
      ['observed', 'Partner regional manager questioning the training backfill', 'stakeholder', 'ben', 'ig1', 'escalation', 'Escalated to the partner CEO that training backfill is unfunded.', 'Contract variation not agreed.', 'desire', 'high', 'open', 'Sponsor call with partner CEO; contract variation by November.'],
      ['observed', 'Rumours that contact centre jobs will be cut', 'group', null, 'ig2', 'rumours', 'Staff believe automation will reduce positions.', 'Unclear messages about efficiency benefits.', 'awareness', 'medium', 'resolved', 'General Manager confirmed no reduction in positions; FAQ published.'],
    ]) await M('resistance', { kind, title, sourceType, stakeholderId: who ? P[who].id : null, groupId: ig[grp].id, form, description: desc, evidence: kind === 'observed' ? 'Engagement records and change agent feedback' : '', rootCause: root, barrierPoint: bp, severity: sev, impactOnAdoption: sev === 'high' ? 'Could delay adoption by several weeks' : 'Limited', preventionActions: kind === 'anticipated' ? actions : '', responseActions: kind === 'observed' ? actions : '', responsibleRole: 'changeTeam', ownerId: U.priya.id, escalationPath: 'Change lead → Primary sponsor → Steering Committee', status, date: D(kind === 'observed' ? '2026-09-10' : '2026-05-15'), resolutionDate: status === 'resolved' ? D('2026-09-30') : null });

    // Engagement plan (STK-020 to STK-027) with occurrences.
    const planItem = async (data) => {
      const item = await M('engagementPlanItem', { status: 'active', durationMinutes: 60, cadence: 'oneOff', timingMode: 'fixed', ...data });
      await S.syncOccurrences(S.SYSTEM, item);
      return item;
    };
    const items = {};
    items.sponsor = await planItem({ objective: 'Fortnightly sponsor one-to-one: progress, risks and sponsor actions', adkar: ['awareness', 'reinforcement'], engagementLevel: 'collaborate', messageFocus: 'progress', engagementType: 'oneToOne', channel: 'virtual', stakeholderIds: [P.margaret.id], groupIds: [], timingMode: 'fixed', plannedDate: D('2026-03-16'), plannedTime: '09:00', cadence: 'fortnightly', until: D('2027-06-28'), durationMinutes: 45, senderId: P.priya_s.id, relationshipOwnerId: U.priya.id, planType: 'sponsor', keyMessageIds: [] });
    items.steer = await planItem({ objective: 'Executive Steering Committee: decisions, readiness and risks', adkar: ['awareness', 'reinforcement'], engagementLevel: 'involve', messageFocus: 'progress', engagementType: 'briefing', channel: 'inPerson', stakeholderIds: [P.andrew.id, P.kathryn.id, P.james.id, P.helen.id, P.margaret.id], groupIds: [], plannedDate: D('2026-04-21'), plannedTime: '14:00', cadence: 'monthly', until: D('2027-06-30'), durationMinutes: 60, senderId: P.margaret.id, relationshipOwnerId: U.priya.id, planType: 'sponsorCoalition' });
    items.union = await planItem({ objective: 'Union consultative committee: consultation on workplace impacts', adkar: ['desire'], engagementLevel: 'consult', messageFocus: 'personalImpacts', engagementType: 'briefing', channel: 'inPerson', stakeholderIds: [P.colin.id, P.rajesh.id], groupIds: [], plannedDate: D('2026-05-28'), plannedTime: '10:00', cadence: 'monthly', until: D('2027-05-31'), durationMinutes: 90, senderId: P.rajesh.id, relationshipOwnerId: U.priya.id, planType: 'resistance', keyMessageIds: [km.monitoring.id] });
    items.partner = await planItem({ objective: 'Partner forum: partner readiness and training backfill', adkar: ['desire', 'knowledge'], engagementLevel: 'involve', messageFocus: 'personalImpacts', engagementType: 'workshop', channel: 'virtual', stakeholderIds: [P.ben.id, P.sophie.id, P.rebecca.id], groupIds: [G.lac.id], plannedDate: D('2026-04-29'), plannedTime: '11:00', cadence: 'monthly', until: D('2027-05-31'), durationMinutes: 90, senderId: P.sophie.id, relationshipOwnerId: U.priya.id, planType: 'sponsorCoalition', keyMessageIds: [km.wiifmPlanners.id] });
    items.ecei = await planItem({ objective: 'Early childhood partner briefing', adkar: ['awareness', 'knowledge'], engagementLevel: 'inform', messageFocus: 'howTo', engagementType: 'briefing', channel: 'virtual', stakeholderIds: [P.fatima.id], groupIds: [G.ecei.id], plannedDate: D('2026-05-14'), plannedTime: '13:00', cadence: 'quarterly', until: D('2027-05-31'), durationMinutes: 60, senderId: P.sophie.id, relationshipOwnerId: U.tom.id, planType: 'communications' });
    items.ombuds = await planItem({ objective: 'Commonwealth Ombudsman briefing on participant impacts', adkar: ['awareness'], engagementLevel: 'inform', messageFocus: 'businessReasons', engagementType: 'briefing', channel: 'inPerson', stakeholderIds: [P.jennifer.id], groupIds: [], plannedDate: D('2026-06-17'), plannedTime: '15:00', cadence: 'quarterly', until: D('2027-06-30'), durationMinutes: 45, senderId: P.margaret.id, relationshipOwnerId: U.priya.id, planType: 'communications' });
    items.pac = await planItem({ objective: 'Participant Advisory Council: review of plan summary and portal', adkar: ['awareness', 'desire'], engagementLevel: 'consult', messageFocus: 'businessReasons', engagementType: 'focusGroup', channel: 'inPerson', stakeholderIds: [P.ruth.id], groupIds: [G.pan.id], timingMode: 'milestone', milestoneId: ms.r1.id, offsetBusinessDays: -15, cadence: 'milestoneTriggered', durationMinutes: 120, senderId: P.margaret.id, relationshipOwnerId: U.grace.id, planType: 'communications' });
    items.agents = await planItem({ objective: 'Change agent huddle: updates, feedback themes and sandbox tips', adkar: ['awareness', 'desire', 'knowledge'], engagementLevel: 'collaborate', messageFocus: 'howTo', engagementType: 'collabPost', channel: 'virtual', stakeholderIds: Object.keys(agentMap).map((k) => P[k].id), groupIds: [], plannedDate: D('2026-08-06'), plannedTime: '08:30', cadence: 'weekly', until: D('2027-03-12'), durationMinutes: 30, senderId: P.tom_s.id, relationshipOwnerId: U.tom.id, planType: 'changeAgent' });
    items.leaders = await planItem({ objective: 'People leader briefing before Release 1', adkar: ['awareness', 'desire', 'knowledge'], engagementLevel: 'involve', messageFocus: 'personalImpacts', engagementType: 'briefing', channel: 'virtual', stakeholderIds: [], groupIds: [G.leaders.id], timingMode: 'milestone', milestoneId: ms.r1.id, offsetBusinessDays: -20, cadence: 'oneOff', durationMinutes: 60, senderId: P.rajesh.id, relationshipOwnerId: U.tom.id, planType: 'peopleManager', keyMessageIds: [km.leaders.id] });
    items.townhall = await planItem({ objective: 'Release 1 town hall: why, what and support available', adkar: ['awareness', 'desire'], engagementLevel: 'inform', messageFocus: 'businessReasons', engagementType: 'townHall', channel: 'virtual', stakeholderIds: [], groupIds: [G.cco.id, G.prb.id, G.lac.id], timingMode: 'milestone', milestoneId: ms.r1.id, offsetBusinessDays: -10, cadence: 'oneOff', durationMinutes: 60, senderId: P.margaret.id, relationshipOwnerId: U.priya.id, planType: 'sponsor', keyMessageIds: [km.why.id, km.when.id, km.support.id] });
    items.cascade = await planItem({ objective: 'Team leader cascade: what Release 1 means for your team', adkar: ['desire', 'knowledge'], engagementLevel: 'consult', messageFocus: 'personalImpacts', engagementType: 'teamConversation', channel: 'inPerson', stakeholderIds: [], groupIds: [G.ccg.id, G.ccb.id, G.cp.id, G.prt.id], timingMode: 'milestone', milestoneId: ms.r1.id, offsetBusinessDays: -8, cadence: 'oneOff', durationMinutes: 30, senderId: P.jacob.id, senderOverridden: false, relationshipOwnerId: U.tom.id, planType: 'peopleManager' });
    items.floor = await planItem({ objective: 'Contact centre floor walk after go-live', adkar: ['ability', 'reinforcement'], engagementLevel: 'involve', messageFocus: 'progress', engagementType: 'siteVisit', channel: 'inPerson', stakeholderIds: [P.louise.id, P.peter.id, P.meilin.id], groupIds: [], timingMode: 'milestone', milestoneId: ms.r1.id, offsetBusinessDays: 2, cadence: 'oneOff', durationMinutes: 120, senderId: P.margaret.id, relationshipOwnerId: U.priya.id, planType: 'sponsor' });
    items.vendor = await planItem({ objective: 'Vendor delivery check-in on training content and UAT', adkar: ['knowledge'], engagementLevel: 'inform', messageFocus: 'howTo', engagementType: 'oneToOne', channel: 'virtual', stakeholderIds: [P.marcus.id], groupIds: [], plannedDate: D('2026-06-03'), plannedTime: '11:30', cadence: 'fortnightly', until: D('2027-02-26'), durationMinutes: 30, senderId: P.hannah_s.id, relationshipOwnerId: U.tom.id, planType: 'training' });
    items.louiseCheck = await planItem({ objective: 'Contact centre readiness check-in with the General Manager', adkar: ['desire', 'ability'], engagementLevel: 'collaborate', messageFocus: 'personalImpacts', engagementType: 'oneToOne', channel: 'virtual', stakeholderIds: [P.louise.id], groupIds: [], plannedDate: D('2026-10-26'), plannedTime: '16:00', cadence: 'weekly', until: D('2026-11-23'), durationMinutes: 30, senderId: P.priya_s.id, relationshipOwnerId: U.priya.id, planType: 'sponsorCoalition', loadAck: 'Agreed with Louise: short check-ins during the service-level negotiation.' });
    items.ccLeaders = await planItem({ objective: 'Contact centre leadership workshop on handling times', adkar: ['desire', 'ability'], engagementLevel: 'involve', messageFocus: 'personalImpacts', engagementType: 'workshop', channel: 'inPerson', stakeholderIds: [P.louise.id, P.peter.id, P.meilin.id, P.jacob.id], groupIds: [], plannedDate: D('2026-10-28'), plannedTime: '10:00', cadence: 'oneOff', durationMinutes: 120, senderId: P.louise.id, relationshipOwnerId: U.priya.id, planType: 'resistance', loadAck: 'Accepted: critical week for service-level agreement.' });
    items.slaReview = await planItem({ objective: 'Service-level relief decision meeting', adkar: ['desire'], engagementLevel: 'collaborate', messageFocus: 'businessReasons', engagementType: 'briefing', channel: 'virtual', stakeholderIds: [P.louise.id, P.margaret.id], groupIds: [], plannedDate: D('2026-10-29'), plannedTime: '15:00', cadence: 'oneOff', durationMinutes: 45, senderId: P.margaret.id, relationshipOwnerId: U.priya.id, planType: 'sponsor', loadAck: 'Accepted.' });
    items.claimsWs = await planItem({ objective: 'Claims leadership workshop: Release 2 design and exception queues', adkar: ['knowledge', 'desire'], engagementLevel: 'involve', messageFocus: 'howTo', engagementType: 'workshop', channel: 'inPerson', stakeholderIds: [P.michael.id, P.caroline.id, P.wendy.id], groupIds: [], plannedDate: D('2026-11-11'), plannedTime: '09:30', cadence: 'oneOff', durationMinutes: 180, senderId: P.michael.id, relationshipOwnerId: U.tom.id, planType: 'peopleManager' });
    items.review = await planItem({ objective: 'Plan review workflow demonstration', adkar: ['awareness', 'knowledge'], engagementLevel: 'inform', messageFocus: 'howTo', engagementType: 'demonstration', channel: 'virtual', stakeholderIds: [P.olivia.id, P.nina.id], groupIds: [G.prt.id], plannedDate: D('2026-11-18'), plannedTime: '13:30', cadence: 'oneOff', durationMinutes: 60, senderId: P.oscar.id, relationshipOwnerId: U.tom.id, planType: 'training' });
    items.cio = await planItem({ objective: 'CIO alignment on business readiness for UAT', adkar: ['awareness', 'reinforcement'], engagementLevel: 'collaborate', messageFocus: 'progress', engagementType: 'oneToOne', channel: 'inPerson', stakeholderIds: [P.james.id], groupIds: [], plannedDate: D('2026-05-06'), plannedTime: '08:00', cadence: 'monthly', until: D('2027-05-31'), durationMinutes: 30, senderId: P.margaret.id, relationshipOwnerId: U.priya.id, planType: 'sponsorCoalition' });
    items.provider = await planItem({ objective: 'Provider registration briefing', adkar: ['awareness'], engagementLevel: 'inform', messageFocus: 'howTo', engagementType: 'briefing', channel: 'virtual', stakeholderIds: [P.neil.id], groupIds: [G.prq.id], plannedDate: D('2026-06-24'), plannedTime: '10:00', cadence: 'quarterly', until: D('2027-03-31'), durationMinutes: 45, senderId: P.neil.id, relationshipOwnerId: U.tom.id, planType: 'communications' });
    items.coalitionGm = await planItem({ objective: 'Coalition check-in with General Managers', adkar: ['desire', 'reinforcement'], engagementLevel: 'collaborate', messageFocus: 'progress', engagementType: 'briefing', channel: 'inPerson', stakeholderIds: [P.rajesh.id, P.michael.id, P.sophie.id], groupIds: [], plannedDate: D('2026-05-19'), plannedTime: '09:00', cadence: 'monthly', until: D('2027-06-30'), durationMinutes: 60, senderId: P.margaret.id, relationshipOwnerId: U.priya.id, planType: 'sponsorCoalition' });

    // Log past occurrences: completed, locked, cancelled, did not proceed or (a few) not yet logged.
    const sentiments = {
      [P.margaret.id]: ['positive', 'veryPositive', 'positive', 'veryPositive'],
      [P.colin.id]: ['neutral', 'negative', 'negative', 'negative'],
      [P.ben.id]: ['positive', 'neutral', 'neutral', 'negative', 'negative'],
      [P.louise.id]: ['positive', 'neutral', 'negative', 'neutral'],
      [P.rajesh.id]: ['positive', 'veryPositive'],
      [P.sophie.id]: ['neutral', 'positive'],
      [P.james.id]: ['positive', 'neutral'],
      [P.ruth.id]: ['neutral', 'positive'],
      [P.jennifer.id]: ['neutral'],
      [P.michael.id]: ['positive'],
      [P.kathryn.id]: ['positive'],
    };
    const seen = {};
    const sentimentFor = (sid) => {
      const seq = sentiments[sid];
      if (!seq) return rand() < 0.7 ? 'positive' : 'neutral';
      const i = (seen[sid] = (seen[sid] ?? -1) + 1);
      return seq[Math.min(i, seq.length - 1)];
    };
    const summaries = {
      sponsor: ['Reviewed progress against the plan and the top risks. Sponsor agreed to the partner CEO calls and the service-level relief proposal.', 'Discussed readiness results; sponsor asked for a summary of barrier points by group for the steering committee.', 'Prepared sponsor messages for the town hall and agreed the recognition plan for pilot planners.'],
      steer: ['Steering committee noted the change risk profile and approved the change budget.', 'Committee reviewed readiness results and asked for weekly reporting on training completion.', 'Decision recorded on the two-wave release; committee asked for change saturation analysis for the contact centre.'],
      union: ['Union raised concerns about platform data being used for individual performance management. Agreed to draft a data-use statement.', 'Discussed workload during training weeks. Union not yet satisfied with the data-use wording.', 'Union reiterated objection to monitoring; asked for the sponsor to attend the next meeting.'],
      partner: ['Partners welcomed the guided workflow demonstration but raised training backfill funding.', 'Backfill funding still unresolved; partners asked for training dates to plan rosters.', 'Partner regional managers frustrated with the delay in the contract variation.'],
      ecei: ['Briefed early childhood partners on the referral changes and training timing.'],
      ombuds: ['Briefed the Ombudsman\'s office on participant impacts and the accessible plan guide.'],
      agents: ['Shared this week\'s updates and sandbox tips. Agents reported questions about templates and handling times.', 'Agents shared feedback themes: training timing, monitoring concerns, enthusiasm for the single screen.', 'Planned sandbox demonstrations for November; agents asked for more practice scenarios.'],
      vendor: ['Confirmed the training content freeze date and the UAT environment for sandbox practice.', 'Vendor reported two integration defects that may affect UAT; agreed contingency for training content.'],
      cio: ['Discussed business readiness for UAT and the vendor\'s defect backlog.'],
      provider: ['Briefed provider registration staff on the Release 2 provider view.'],
      coalitionGm: ['General Managers agreed to co-present at planner forums and share the pilot results.', 'Coalition discussed the contact centre service-level relief and partner backfill.'],
    };
    const keyByItem = Object.fromEntries(Object.entries(items).map(([k, v]) => [v.id, k]));
    const allEng = (await S.driver.list('engagement', { initiativeId: I })).filter((e) => e.planItemId);
    let n = 0;
    for (const e of allEng.sort((a, b) => a.plannedDate.localeCompare(b.plannedDate))) {
      const key = keyByItem[e.planItemId];
      const item = items[key];
      if (e.plannedDate >= TODAY) {
        if (diffDays(TODAY, e.plannedDate) <= 7) await put(e, { status: 'scheduled', statusHistory: [...asArray(e.statusHistory), { at: T(addDays(DEMO_ANCHOR, -3)), by: item.relationshipOwnerId, from: 'planned', to: 'scheduled', reason: null }] });
        continue;
      }
      n++;
      const roll = rand();
      const ageDays = diffDays(e.plannedDate, TODAY);
      if (ageDays <= 9 && (key === 'cio' || key === 'partner' || n % 23 === 0)) continue; // not yet logged → overdue alert
      if (roll < 0.04) { await put(e, { status: 'cancelled', statusHistory: [...asArray(e.statusHistory), { at: `${e.plannedDate}T00:00:00.000Z`, by: item.relationshipOwnerId, from: 'planned', to: 'cancelled', reason: 'Clashed with an urgent executive meeting' }] }); continue; }
      if (roll < 0.07) { await put(e, { status: 'didNotProceed', statusHistory: [...asArray(e.statusHistory), { at: `${e.plannedDate}T00:00:00.000Z`, by: item.relationshipOwnerId, from: 'planned', to: 'scheduled' }, { at: `${e.plannedDate}T06:00:00.000Z`, by: item.relationshipOwnerId, from: 'scheduled', to: 'didNotProceed', reason: 'Stakeholder unavailable on the day' }] }); continue; }
      const direct = asArray(e.stakeholderIds);
      const texts = summaries[key] || ['Engagement held as planned.'];
      const concerns = key === 'union' ? [{ text: 'Platform reports could be used for individual performance management.' }] : key === 'partner' ? [{ text: 'Training backfill for partner staff is not funded.' }] : key === 'agents' && rand() < 0.4 ? [{ text: 'Staff want more time in the sandbox before go-live.' }] : [];
      const attendance = asArray(e.groupIds).length ? [] : direct.map((sid) => ({ stakeholderId: sid, status: rand() < 0.9 ? 'attended' : 'apologies' }));
      const completedAt = `${addDays(e.plannedDate, rand() < 0.8 ? 0 : 2)}T07:00:00.000Z`;
      const locked = cal.businessDaysBetween(e.plannedDate, TODAY) >= 10;
      await put(e, {
        status: locked ? 'locked' : 'completed', actualDate: e.plannedDate, startTime: item.plannedTime || '10:00', durationMinutes: item.durationMinutes, engagementType: item.engagementType, channel: item.channel,
        location: item.channel === 'inPerson' ? 'National Office, Canberra' : null, meetingLink: item.channel === 'virtual' ? 'https://teams.example/meeting' : null,
        attendance, internalParticipantIds: uniq([item.relationshipOwnerId, ...(key === 'agents' ? [U.tom.id] : [])]), purpose: item.objective, adkar: item.adkar, keyMessageIds: item.keyMessageIds || [],
        summary: p(texts[Math.floor(rand() * texts.length)]), questions: key === 'agents' ? 'When will partner staff be trained? Will templates be available after go-live?' : '', concerns, feedback: '',
        sentiments: direct.filter((sid) => !Object.keys(agentMap).some((k) => P[k].id === sid)).map((sid) => ({ subjectId: sid, sentiment: sentimentFor(sid) })),
        outcome: key === 'union' || (key === 'partner' && e.plannedDate > D('2026-08-15')) ? 'partlyMet' : rand() < 0.85 ? 'met' : 'partlyMet', followUpRequired: key === 'union', followUpDate: key === 'union' ? addDays(e.plannedDate, 14) : null,
        statusHistory: [...asArray(e.statusHistory), { at: completedAt, by: item.relationshipOwnerId, from: 'planned', to: 'completed', reason: null }, ...(locked ? [{ at: `${cal.addBusinessDays(e.plannedDate, 10)}T20:00:00.000Z`, by: 'system', from: 'completed', to: 'locked', reason: 'Locked after 10 business days (RUL-10)' }] : [])],
        lockedAt: locked ? `${cal.addBusinessDays(e.plannedDate, 10)}T20:00:00.000Z` : null, createdBy: item.relationshipOwnerId,
      });
    }
    // Unplanned engagements, including a quick capture to be completed (STK-034).
    const unplanned = [
      ['2026-09-03', 'oneToOne', 'inPerson', [P.peter.id], 'Corridor conversation about handling times during training weeks.', 'neutral', 'partlyMet', U.tom.id],
      ['2026-09-24', 'oneToOne', 'phone', [P.ben.id], 'Call about partner rosters for training; agreed to send draft training dates.', 'negative', 'partlyMet', U.priya.id],
      ['2026-10-07', 'oneToOne', 'virtual', [P.louise.id], 'Discussed sponsor site visit outcomes and the service-level relief proposal.', 'negative', 'partlyMet', U.priya.id],
      ['2026-10-13', 'teamConversation', 'inPerson', [P.daniel.id], 'Team conversation on why the change is happening, using the conversation guide. Team keen to practise in the sandbox.', 'positive', 'met', U.daniel.id],
      ['2026-10-15', 'oneToOne', 'virtual', [P.ruth.id], 'Advisory council chair reviewed the draft plan summary and suggested Easy Read wording.', 'positive', 'met', U.grace.id],
      ['2026-10-19', 'oneToOne', 'inPerson', [P.colin.id], 'Informal discussion after the consultative committee; union still opposed to the monitoring wording.', 'negative', 'partlyMet', U.priya.id],
    ];
    for (const [date, type, channel, ids, text, sent, outcome, who] of unplanned) {
      const locked = cal.businessDaysBetween(D(date), TODAY) >= 10;
      await M('engagement', { status: locked ? 'locked' : 'completed', unplanned: true, actualDate: D(date), startTime: '12:30', durationMinutes: 20, engagementType: type, channel, stakeholderIds: ids, groupIds: [], internalParticipantIds: [who], purpose: 'Unplanned conversation', adkar: ['desire'], summary: p(text), sentiments: who === U.daniel.id || who === U.grace.id ? [] : ids.map((sid) => ({ subjectId: sid, sentiment: sent })), outcome, statusHistory: [{ at: T(date, '07:00'), by: who, from: null, to: 'completed' }], lockedAt: locked ? T(addDays(date, 15)) : null, concerns: [], attendance: [] }, T(date, '07:00'));
    }
    await M('engagement', { status: 'completed', unplanned: true, quickCapture: true, actualDate: D('2026-10-21'), engagementType: 'oneToOne', stakeholderIds: [P.jacob.id], groupIds: [], internalParticipantIds: [U.aisha.id], summary: p('Quick chat at the sandbox session: team leader worried about rosters.'), statusHistory: [{ at: T('2026-10-21', '04:00'), by: U.aisha.id, from: null, to: 'completed' }], concerns: [], attendance: [], sentiments: [] }, T('2026-10-21', '04:00'));
    // Sent communications are recorded in recipients' engagement history (COM-008).
    for (const k of ['c1', 'c2', 'c3', 'c4']) {
      const c = comm[k];
      const sgIds = uniq(asArray(c.groupIds).map((g) => Object.values(ig).find((x) => x.id === g)?.stakeholderGroupId).filter(Boolean));
      await M('engagement', { status: 'locked', actualDate: c.startDate, engagementType: c.channel === 'Intranet' ? 'intranet' : c.channel === 'Newsletter' ? 'newsletter' : c.channel === 'Team huddle' ? 'teamConversation' : 'email', channel: c.channel === 'Team huddle' ? 'inPerson' : 'digital', stakeholderIds: [], groupIds: sgIds.length ? sgIds : [G.psd.id, G.pic.id], senderId: c.delivererId, purpose: c.objective, objective: c.title, adkar: c.adkar, keyMessageIds: c.keyMessageIds, summary: p(`Communication sent: ${c.title}.`), outcome: 'met', communicationId: c.id, unplanned: true, internalParticipantIds: [U.grace.id], statusHistory: [{ at: T(c.startDate), by: U.grace.id, from: null, to: 'completed' }], attendance: [], concerns: [], sentiments: [] }, T(c.startDate));
    }

    // Group sessions with attendance (STK-031) and broadcast briefings, which reach every member.
    const leaderIds = ['daniel', 'jacob', 'nina', 'tarek', 'wendy'].map((k) => P[k].id);
    const cpIds = members('cp');
    await logged(I, U.tom.id, { date: '2026-08-26', time: '10:00', minutes: 90, type: 'briefing', channel: 'virtual', groupIds: [G.leaders.id], attendance: leaderIds.map((sid) => ({ stakeholderId: sid, status: sid === P.nina.id ? 'apologies' : 'attended' })), purpose: 'People leader briefing: your role in the change (CLARC)', adkar: ['awareness', 'desire'], summary: 'Briefed team leaders on their roles as communicator, liaison, advocate, resistance manager and coach. Leaders asked for talking points before team conversations.', senderId: P.rajesh.id, extra: { keyMessageIds: [km.leaders.id] } });
    await logged(I, U.grace.id, { date: '2026-09-09', time: '11:00', minutes: 45, type: 'briefing', channel: 'inPerson', groupIds: [G.cpb.id], purpose: 'Claims and payments awareness briefing', adkar: ['awareness'], summary: 'General Manager briefed the branch on why claims processing moves to the platform in Release 2 and what will not change.', senderId: P.michael.id, extra: { keyMessageIds: [km.why.id, km.when.id] } });
    await logged(I, U.grace.id, { date: '2026-09-15', time: '09:00', minutes: 5, type: 'newsletter', channel: 'digital', groupIds: [G.pan.id], purpose: 'Participant newsletter: what is changing about plans in 2027', adkar: ['awareness'], summary: 'Participant newsletter article in plain language and Easy Read, with a link to the accessible plan guide.', senderId: P.margaret.id, extra: { keyMessageIds: [km.participants.id] } });
    await logged(I, U.tom.id, { date: '2026-10-02', time: '14:00', minutes: 60, type: 'workshop', channel: 'virtual', groupIds: [G.leaders.id], attendance: leaderIds.map((sid) => ({ stakeholderId: sid, status: 'attended' })), purpose: 'People leader drop-in: walkthrough of the manager toolkit', adkar: ['awareness', 'knowledge'], summary: 'Walked team leaders through the talking points, conversation guide and impact summary. Leaders want the training schedule by team as soon as possible.' });
    await logged(I, U.liam.id, { date: '2026-10-13', time: '09:30', minutes: 120, type: 'workshop', channel: 'inPerson', groupIds: [G.cp.id], attendance: cpIds.map((sid, i) => ({ stakeholderId: sid, status: i % 5 === 4 ? 'apologies' : 'attended' })), purpose: 'Claims process walkthrough with business process owners', adkar: ['knowledge', 'desire'], summary: 'Walked claims officers through the Release 2 exception queues. Officers were positive about automated validation but worried about the end-of-year workload.', outcome: 'met' });
    await logged(I, U.tom.id, { date: '2026-10-08', time: '13:00', minutes: 60, type: 'demonstration', channel: 'inPerson', stakeholderIds: [P.ahmed.id, P.kim.id, P.oscar.id], attendance: ['ahmed', 'kim', 'oscar'].map((k) => ({ stakeholderId: P[k].id, status: 'attended' })), purpose: 'Planning Quality team: guided workflow demonstration', adkar: ['desire', 'knowledge'], summary: 'Kim demonstrated drafting a plan during the conversation. The team asked for quality checks to be built into the workflow.', sentiments: [{ subjectId: P.ahmed.id, sentiment: 'positive' }, { subjectId: P.kim.id, sentiment: 'veryPositive' }, { subjectId: P.oscar.id, sentiment: 'positive' }] });
    await M('engagement', { status: 'didNotProceed', plannedDate: D('2026-09-30'), plannedTime: '10:00', durationMinutes: 120, engagementType: 'workshop', channel: 'inPerson', stakeholderIds: [P.olivia.id], groupIds: [G.prt.id], internalParticipantIds: [U.tom.id], objective: 'Plan Review Team impact confirmation workshop', purpose: 'Confirm Release 2 impacts with reviewers', adkar: ['awareness'], unplanned: false, statusHistory: [{ at: T('2026-09-16'), by: U.tom.id, from: null, to: 'scheduled' }, { at: T('2026-09-30', '01:00'), by: U.tom.id, from: 'scheduled', to: 'didNotProceed', reason: 'Postponed by the Director because of the review backlog' }], attendance: [], concerns: [], sentiments: [] }, T('2026-09-16'));

    // Tasks from engagements and approvals (STK-032, WFL-002).
    for (const [title, assignee, due, status, pri] of [
      ['Draft the data-use statement for the union consultative committee', 'priya', '2026-10-30', 'inProgress', 'high'],
      ['Send partner organisations the draft training dates', 'tom', '2026-10-09', 'open', 'high'],
      ['Confirm service-level relief with Contact Centre Operations', 'priya', '2026-10-30', 'open', 'urgent'],
      ['Book the second Brisbane sandbox session', 'liam', '2026-10-23', 'open', 'medium'],
      ['Update the plan summary wording to Easy Read style', 'grace', '2026-11-06', 'open', 'medium'],
      ['Recruit a change agent for Provider Registration', 'tom', '2026-10-16', 'open', 'medium'],
      ['Prepare readiness summary for the November steering committee', 'priya', '2026-11-12', 'open', 'high'],
      ['Confirm impacts with the Plan Review Team', 'tom', '2026-10-02', 'inProgress', 'high'],
      ['Publish the manager FAQ update', 'grace', '2026-09-25', 'done', 'low'],
      ['Collect proficiency evidence from the Geelong sandbox', 'liam', '2026-10-21', 'done', 'medium'],
      ['Practise the new claims screens with the team', 'daniel', '2026-11-06', 'open', 'medium'],
    ]) await M('task', { title, assigneeId: U[assignee].id, dueDate: D(due), status, priority: pri, description: '', completedAt: status === 'done' ? T(due) : null });

    // Feedback from channels other than surveys (MEA-002).
    const fbs = [
      ['changeAgent', 'ig1', 'Planners in Newcastle are worried the guided workflow will slow down planning meetings.', ['process', 'timing'], 'negative', ['desire']],
      ['changeAgent', 'ig2', 'Staff love seeing the full participant history on one screen in the sandbox.', ['system'], 'veryPositive', ['desire']],
      ['changeAgent', 'ig2', 'Rosters do not leave time for sandbox practice in Brisbane.', ['timing', 'training'], 'negative', ['ability']],
      ['mailbox', 'ig7', 'Will my plan change when the new system comes in?', ['customer'], 'neutral', ['awareness']],
      ['serviceDesk', 'ig2', 'Sandbox login problems for three staff.', ['system'], 'negative', ['ability']],
      ['changeAgent', 'ig3', 'Claims officers want to see the exception queues before Release 2.', ['process'], 'neutral', ['knowledge']],
      ['changeAgent', 'ig4', 'Reviewers say the backlog makes it hard to attend demonstrations.', ['timing'], 'negative', ['desire']],
      ['engagement', 'ig1', 'Partner staff unsure whether they will be paid for training time.', ['roles', 'training'], 'negative', ['desire']],
      ['changeAgent', 'ig1', 'Kim\'s demonstration of in-meeting drafting convinced several sceptical planners.', ['training'], 'positive', ['desire', 'knowledge']],
      ['mailbox', 'ig7', 'Please make sure the new portal works with screen readers.', ['system', 'customer'], 'neutral', ['ability']],
      ['changeAgent', 'ig2', 'Team leaders are using the huddle notes well.', ['communication', 'leadership'], 'positive', ['awareness']],
      ['changeAgent', 'ig1', 'Rumour that templates will be kept as a backup.', ['communication'], 'neutral', ['reinforcement']],
    ];
    for (const [i, [channel, g, text, themes, sentiment, adkar]] of fbs.entries()) await M('feedback', { date: D(addDays('2026-09-01', i * 4)), channel, groupId: ig[g].id, changeAgentId: channel === 'changeAgent' ? Object.values(agent).find((a) => a.groupIds.includes(ig[g].id))?.id || null : null, text, themes, sentiment, adkar, status: i % 3 === 0 ? 'actioned' : 'reviewed' });

    // Corrective actions (MEA-004)
    for (const [gap, measure, g, adkar, action, owner2, due, status] of [
      ['Training completion is below the 50% threshold for this point in the plan', 'training', null, ['knowledge'], 'Add evening virtual sessions for partner staff and send reminders through team leaders', 'liam', '2026-11-13', 'open'],
      ['Brisbane sandbox attendance 60%', null, 'ig2', ['ability'], 'Adjust rosters and run a second session', 'liam', '2026-10-30', 'inProgress'],
      ['Desire remains below 3 for planners in the pre-go-live pulse', null, 'ig1', ['desire'], 'Run template retirement focus groups and share pilot stories', 'tom', '2026-11-20', 'open'],
    ]) await M('correctiveAction', { gap, measureId: measure ? meas[measure].id : null, groupId: g ? ig[g].id : null, adkar, action, ownerId: U[owner2].id, dueDate: D(due), status, activityIds: [] });

    // Narratives (ART-021), including an AI-drafted section awaiting acceptance (AIA-004).
    await M('narrative', { key: 'executiveSummary', title: 'Executive summary', content: p('The Participant Case Management Replacement is on track for Release 1 on 1 February 2027, with change readiness improving but uneven across groups. Awareness has risen in every surveyed group since the May baseline, and contact centre staff are positive about the single participant view.', 'The main concerns are Desire among planners and partner staff, where attachment to templates and unfunded training backfill are holding back support, and training completion, which is behind the planned trajectory. The union\'s concern about the use of platform data is unresolved and is the highest-rated change risk.', 'The steering committee is asked to support a contract variation for partner training backfill and the contact centre service-level relief for training weeks.'), aiDrafted: false, acceptedBy: U.priya.id, acceptedAt: T('2026-10-20') });
    await M('narrative', { key: 'decisionsRequired', title: 'Decisions and support required', content: ul('Approve the partner training backfill contract variation ($180,000).', 'Endorse service-level relief for contact centre training weeks.', 'Primary sponsor to attend the November union consultative committee.'), aiDrafted: false });
    await M('narrative', { key: 'nextPeriod', title: 'Priorities for the next period', content: ul('Close the training completion gap for partner staff.', 'Resolve the data-use statement with the union.', 'Complete impact confirmation with the Plan Review Team.', 'Run template retirement focus groups.'), aiDrafted: false });
    await M('narrative', { key: 'statusCommentary', title: 'Status commentary for the period', content: p('Readiness work accelerated in October with the pre-go-live pulse, the leader toolkit and sandbox sessions in Geelong and Brisbane. Barrier points have moved from Awareness to Desire (planners) and Knowledge (contact centre), which is expected at this stage.'), aiDrafted: true });
    await M('narrative', { key: 'approachNarrative', title: 'Change management approach', content: p('Because the change risk profile is high, the approach uses the ADKAR Blueprint with all Core plans and the Extend plans for resistance, the change agent network, the sponsor coalition and sustainment. People leaders and partner organisations are central, because most impacted staff are outside the Agency\'s direct line management.'), aiDrafted: false });

    // Scheduled generation (ART-015)
    await M('schedule', { name: 'Weekly steering committee pack', kind: 'artefact', artefactType: 'steeringPack', params: { formats: ['pptx', 'pdf'], variant: 'full' }, frequency: 'weekly', dayOfWeek: '5', time: '15:00', recipients: [U.priya.id, U.margaret.id, U.hannah.id], active: true, nextRunAt: `${addDays(TODAY, (5 - new Date(`${TODAY}T00:00:00Z`).getUTCDay() + 7) % 7 || 7)}T04:00:00.000Z` });
    // Sustainment planned from the outset (SUS-002).
    for (const [mech, desc, ownerK, groups, review] of [['measurement', 'Monthly usage and quality dashboards reviewed by General Managers', 'rajesh', ['ig1', 'ig4'], '2027-07-31'], ['accountability', 'Platform-only planning built into planner performance objectives from 2027–28', 'rajesh', ['ig1'], '2027-08-31'], ['recognition', 'Quarterly recognition of teams with the highest plan quality', 'margaret', ['ig1', 'ig2', 'ig3', 'ig4'], '2027-09-30']]) await M('sustainmentItem', { mechanism: mech, description: desc, ownerId: P[ownerK].id, groupIds: groups.map((g) => ig[g].id), measureIds: [meas.plans.id], frequency: 'monthly', reviewDate: D(review), status: 'planned' });
  }

  // =================================================================================================
  // Initiative 2: Hybrid Workplace and Microsoft 365 Uplift (medium risk, late Phase 1)
  // =================================================================================================
  async function seedHwm() {
    const I = INI.hwm;
    const by = U.priya.id;
    const M = async (type, data, at) => mk(type, { ...data, initiativeId: I }, { by, at });
    await mk('initiative', {
      id: I, name: 'Hybrid Workplace and Microsoft 365 Uplift', shortName: 'Digital Workplace', containerId: hwmProj.id,
      description: 'Moves every office to activity-based hybrid working with Microsoft Teams calling, OneDrive and SharePoint, retiring desk phones and shared drives.',
      businessOwnerId: P.kathryn.id, primarySponsorId: P.james.id, changeLeadId: U.priya.id, projectManagerId: U.hannah.id, startDate: D('2026-08-03'), endDate: D('2027-06-30'), deliveryApproach: 'agile', status: 'active', classification: 'OFFICIAL',
      businessDrivers: 'Desk phone contract ends in June 2027; shared drives are unmanaged; office leases are being renegotiated for hybrid work.', problemOpportunity: 'Staff juggle three collaboration tools and cannot find documents.', whyNow: 'Telephony contract expiry and lease renewals.', riskOfNotChanging: 'Higher costs, information security risk from unmanaged shared drives.',
      reasonForChange: 'Make it easy to work and collaborate from any location.', benefits: 'Reduced telephony costs; better records management; flexible work.', adoptionDefinition: 'Staff store work documents in SharePoint and OneDrive, use Teams for calls and meetings, and book desks through the booking app.', whatIsChanging: 'Telephony, file storage, meeting rooms and desk allocation.', whatIsNotChanging: 'Working hours arrangements and team structures.', exclusions: 'Contact centre telephony platform.',
      selectedPlans: ['blueprint', 'sponsor', 'peopleManager', 'communications', 'training'], planRationale: 'Medium change risk profile: Blueprint plus Core plans (RUL-14).',
    }, { by, at: T('2026-08-03') });
    const pilot = await M('milestone', { name: 'Pilot go-live (ICT Branch)', kind: 'goLive', date: D('2026-12-07'), status: 'planned' });
    const w1 = await M('milestone', { name: 'Wave 1 go-live: National Office', kind: 'goLive', date: D('2027-02-15'), status: 'planned' });
    const w2 = await M('milestone', { name: 'Wave 2 go-live: regional offices and contact centres', kind: 'goLive', date: D('2027-04-12'), status: 'planned' });
    await M('objective', { title: 'Retire desk phones and shared drives by June 2027' });
    await M('measure', { name: 'Documents stored in SharePoint or OneDrive', category: 'individual', subtype: 'usage', baseline: 5, target: 90, unit: '%', direction: 'higher', threshold: 50, dataSource: 'Microsoft 365 usage reports', frequency: 'monthly', ownerId: U.hannah.id });
    const g = {};
    for (const [key, name, sg, hc, impacts] of [
      ['nat', 'National Office staff', 'natoff', 1800, [['tools', 4, w1], ['location', 3, w1], ['systems', 3, w1], ['criticalBehaviours', 3, w1]]],
      ['reg', 'Regional office staff', 'regional', 2400, [['tools', 4, w2], ['systems', 3, w2], ['location', 2, w2]]],
      ['cc', 'Participant Contact Centre', 'cco', 350, [['tools', 3, w2], ['location', 4, w2], ['criticalBehaviours', 3, w2]]],
      ['ea', 'Executive assistants', 'ea', 60, [['tools', 4, w1], ['processes', 4, w1]]],
      ['sd', 'IT Service Desk', 'sd', 40, [['processes', 4, pilot], ['tools', 4, pilot], ['systems', 4, pilot]]],
    ]) {
      g[key] = await M('impactedGroup', { name, definitionType: key === 'reg' || key === 'nat' ? 'location' : 'orgUnit', stakeholderGroupId: G[sg].id, headcount: hc, agentTarget: { nat: 12, reg: 10, cc: 4, ea: 1, sd: 1 }[key], confirmationStatus: 'confirmed', confirmedDate: D('2026-09-30'), wiifm: 'Work from anywhere with the same tools.', concerns: key === 'cc' ? 'Hot-desking in the contact centre; another change at the same time as the case management replacement.' : 'Losing personal desks.' });
      for (const [aspect, degree, msr] of impacts) await M('impact', { impactedGroupId: g[key].id, aspect, level: 'group', degree, milestoneId: msr.id, transitionWeeks: 8, currentState: 'Current arrangements', futureState: 'Hybrid and Microsoft 365 ways of working', description: '' });
    }
    await M('assessment', { kind: 'changeCharacteristics', subjectType: 'initiative', subjectId: I, round: 'baseline', method: 'practitioner', date: D('2026-08-20'), assessorId: U.priya.id, scores: wrap({ cc1: 5, cc2: 5, cc3: 3, cc4: 2, cc5: 4, cc6: 1, cc7: 1, cc8: 3, cc9: 3, cc10: 1 }), confirmed: true });
    await M('assessment', { kind: 'orgAttributes', subjectType: 'initiative', subjectId: I, round: 'baseline', method: 'practitioner', date: D('2026-08-20'), assessorId: U.priya.id, scores: wrap({ oa1: 2, oa2: 3, oa3: 5, oa4: 4, oa5: 2, oa6: 3, oa7: 2, oa8: 2, oa9: 2, oa10: 3 }), confirmed: true });
    await M('assessment', { kind: 'pct', subjectType: 'initiative', subjectId: I, round: 'baseline', method: 'practitioner', date: D('2026-08-25'), assessorId: U.priya.id, scores: wrap({ pc1: 4, pc2: 3, pc3: 3, pc4: 3, pc5: 2, pc6: 3, pc7: 3, pc8: 4, pc9: 4, pc10: 4, pc11: 3, pc12: 4, pc13: 3, pc14: 2 }), confirmed: true });
    await M('strategy', { summary: p('A medium-risk, enterprise-wide change to tools and workplaces delivered in waves. The approach uses the Blueprint and Core plans, with managers leading team agreements about hybrid work.'), sponsorshipGaps: 'The Chief Information Officer is less visible to business staff.', sponsorshipActions: 'Co-sponsorship messages with the Chief Operating Officer.', changeTeam: [{ role: 'Change management lead', person: 'Priya Raman', allocation: 0.3 }, { role: 'Change analyst', person: 'Tom Nguyen', allocation: 0.4 }], approach: 'core', integrationApproach: 'Agile: change activities planned per wave and reviewed at sprint reviews.', status: 'forReview' });
    await M('approval', { subjectType: 'strategy', subjectId: (await S.driver.list('strategy', { initiativeId: I }))[0].id, subjectLabel: 'Change Management Strategy', requestedBy: U.priya.id, requestedAt: T('2026-10-16'), rule: 'all', status: 'pending', approvers: [{ userId: U.priya.id, name: 'Priya Raman', decision: 'approve', comment: null, decidedAt: T('2026-10-16') }] }, T('2026-10-16'));
    await M('blueprint', { name: 'Organisation ADKAR Blueprint', scope: 'organisation', status: 'draft', elements: Object.fromEntries(ADKAR_IDS.map((e) => [e, { desiredOutcome: `${e[0].toUpperCase()}${e.slice(1)} outcome for hybrid work`, indicators: '', barriers: '', rootCauses: '', measures: '' }])) });
    await M('assessment', { kind: 'adkar', subjectType: 'group', subjectId: g.cc.id, round: 'baseline', method: 'practitioner', date: D('2026-09-25'), assessorId: U.tom.id, scores: { awareness: 3.0, desire: 2.4, knowledge: 2.2, ability: 2.5, reinforcement: 2.0 }, confirmed: true, comment: 'Contact centre staff see this as a second change on top of the case management replacement.' });
    for (const [k, roles, inf, int, cur, des] of [['james', ['primarySponsor'], 'high', 'high', 'leading', 'leading'], ['kathryn', ['businessOwner', 'coalitionMember'], 'high', 'high', 'supportive', 'leading'], ['louise', ['peopleManager'], 'high', 'high', 'neutral', 'supportive'], ['colin', ['employeeRep'], 'high', 'medium', 'neutral', 'supportive'], ['vanessa', ['impactedEmployee'], 'low', 'high', 'neutral', 'supportive'], ['sarah_it', ['peopleManager'], 'medium', 'high', 'supportive', 'leading'], ['margaret', ['steeringCommittee'], 'high', 'medium', 'supportive', 'supportive']]) {
      await M('profile', { subjectType: 'person', stakeholderId: P[k].id, changeRoles: roles, impactedGroupIds: k === 'louise' ? [g.cc.id] : k === 'vanessa' ? [g.ea.id] : k === 'sarah_it' ? [g.sd.id] : [], relationshipOwnerId: ['james', 'kathryn', 'margaret'].includes(k) ? U.priya.id : U.tom.id, influence: inf, interest: int, currentEngagement: cur, desiredEngagement: des, ratingHistory: [] }, T('2026-08-10'));
    }
    for (const [date, type, channel, keys, purpose, summary, sentiment, owner] of [
      ['2026-08-12', 'oneToOne', 'inPerson', ['james'], 'Sponsor kick-off: change approach for hybrid work', 'Agreed the sponsor role, the wave approach and a joint message with the Chief Operating Officer.', 'positive', U.priya.id],
      ['2026-08-14', 'oneToOne', 'inPerson', ['kathryn'], 'Business owner briefing on workplace and lease changes', 'Discussed lease timing and the desk booking policy. Kathryn asked for a saturation check against the case management releases.', 'positive', U.priya.id],
      ['2026-09-15', 'briefing', 'inPerson', ['james', 'kathryn', 'margaret'], 'Project board: impact assessment and risk profile', 'Board noted the medium risk profile and the contact centre saturation risk.', 'positive', U.priya.id],
      ['2026-09-29', 'briefing', 'virtual', ['vanessa'], 'Executive assistant network: early adopter invitation', 'Executive assistants volunteered to pilot Teams calling and shared calendars.', 'positive', U.tom.id],
      ['2026-09-29', 'briefing', 'inPerson', ['colin'], 'Union consultation: activity-based working', 'Union asked for consultation on desk ratios and ergonomic assessments for home offices.', 'neutral', U.tom.id],
      ['2026-10-06', 'workshop', 'inPerson', ['sarah_it'], 'Service desk pilot planning workshop', 'Planned the ICT Branch pilot and the service desk knowledge articles.', 'veryPositive', U.tom.id],
      ['2026-10-13', 'briefing', 'inPerson', ['james', 'kathryn', 'margaret'], 'Project board: Strategy for review', 'Board reviewed the draft Change Management Strategy; approval expected in November.', 'positive', U.priya.id],
    ]) await logged(I, owner, { date, type, channel, stakeholderIds: keys.map((k) => P[k].id), attendance: keys.map((k) => ({ stakeholderId: P[k].id, status: 'attended' })), purpose, adkar: ['awareness'], summary, sentiments: keys.map((k) => ({ subjectId: P[k].id, sentiment })) });
    const pi = await M('engagementPlanItem', { objective: 'Contact centre leadership briefing on hybrid work', adkar: ['awareness', 'desire'], engagementLevel: 'consult', engagementType: 'briefing', channel: 'virtual', stakeholderIds: [P.louise.id], groupIds: [], timingMode: 'fixed', plannedDate: D('2026-10-27'), plannedTime: '09:00', cadence: 'oneOff', durationMinutes: 45, senderId: P.james.id, relationshipOwnerId: U.tom.id, planType: 'sponsor', status: 'active' });
    await S.syncOccurrences(S.SYSTEM, pi);
    const pi2 = await M('engagementPlanItem', { objective: 'National Office town hall: hybrid work and Microsoft 365', adkar: ['awareness'], engagementLevel: 'inform', engagementType: 'townHall', channel: 'virtual', stakeholderIds: [], groupIds: [G.natoff.id], timingMode: 'milestone', milestoneId: w1.id, offsetBusinessDays: -15, cadence: 'oneOff', durationMinutes: 60, senderId: P.james.id, relationshipOwnerId: U.priya.id, planType: 'sponsor', status: 'active' });
    await S.syncOccurrences(S.SYSTEM, pi2);
    for (const [title, plans, adkar, gk, start, end] of [
      ['CIO and COO joint video on why hybrid work', ['sponsor', 'communications'], ['awareness'], [], '2026-11-02', '2026-11-06'],
      ['Team agreements on hybrid working', ['peopleManager'], ['desire', 'ability'], ['nat', 'reg'], '2027-01-18', '2027-02-12'],
      ['Teams and OneDrive essentials training', ['training'], ['knowledge'], ['nat', 'reg', 'ea'], '2027-01-25', '2027-03-26'],
      ['Contact centre hot-desking consultation', ['peopleManager'], ['desire'], ['cc'], '2027-02-22', '2027-03-12'],
      ['Service desk pilot readiness', ['training'], ['knowledge', 'ability'], ['sd'], '2026-11-16', '2026-12-04'],
      ['Executive assistant early-adopter sessions', ['training'], ['knowledge', 'ability'], ['ea'], '2026-12-07', '2026-12-18'],
      ['Manager toolkit: leading hybrid team agreements', ['peopleManager'], ['awareness', 'knowledge'], ['nat', 'reg', 'cc'], '2026-12-01', '2026-12-11'],
      ['Service desk super-user recognition', ['peopleManager'], ['desire', 'reinforcement'], ['sd'], '2027-01-11', '2027-01-22'],
      ['Desk booking and Teams usage dashboards for managers', ['peopleManager'], ['reinforcement'], ['nat', 'reg', 'ea'], '2027-03-01', '2027-06-30'],
      ['Contact centre Wave 2 readiness briefing', ['communications'], ['awareness', 'desire'], ['cc'], '2027-03-15', '2027-03-26'],
    ]) await M('activity', { title, kind: 'activity', plans, adkar, groupIds: gk.map((k) => g[k].id), ownerId: U.tom.id, startDate: D(start), endDate: D(end), status: 'notStarted', percentComplete: 0 });
    await M('risk', { kind: 'risk', title: 'Contact centre change saturation in early 2027', cause: 'Case management Release 1 and hybrid Wave 2 within ten weeks', consequenceText: 'Neither change adopted well', likelihood: '4', consequence: '4', status: 'open', ownerId: U.priya.id, groupIds: [g.cc.id], adkar: ['desire'] });
  }

  // =================================================================================================
  // Initiative 3: Finance Shared Services Consolidation (Phase 3: sustain outcomes)
  // =================================================================================================
  async function seedFss() {
    const I = INI.fss;
    const by = U.priya.id;
    const M = async (type, data, at) => mk(type, { ...data, initiativeId: I }, { by, at });
    await mk('initiative', {
      id: I, name: 'Finance Shared Services Consolidation', shortName: 'Finance Shared Services', containerId: fssProj.id,
      description: 'Consolidated accounts payable and financial operations into a shared services team with a new purchase-to-pay workflow.',
      businessOwnerId: P.helen.id, primarySponsorId: P.helen.id, changeLeadId: U.priya.id, projectManagerId: U.hannah.id, startDate: D('2025-09-01'), endDate: D('2026-11-30'), deliveryApproach: 'predictive', status: 'active', classification: 'OFFICIAL',
      businessDrivers: 'Duplicated finance processes across branches.', problemOpportunity: 'Invoices paid late; inconsistent approvals.', whyNow: 'Audit findings in 2025.', riskOfNotChanging: 'Repeat audit findings and late payment penalties.',
      reasonForChange: 'One consistent purchase-to-pay process.', benefits: 'Invoices paid on time; 20% less processing effort.', adoptionDefinition: 'All invoices processed through the shared services workflow; budget holders approve in the workflow.', whatIsChanging: 'Accounts payable processes and approval workflow.', whatIsNotChanging: 'Delegations and budgets.',
      selectedPlans: ['blueprint', 'sponsor', 'peopleManager', 'communications', 'training', 'sustainment'], planRationale: 'Medium risk with a strong focus on sustainment.',
    }, { by, at: T('2025-09-01') });
    const gl = await M('milestone', { name: 'Go-live: shared services workflow', kind: 'goLive', date: D('2026-04-01'), status: 'achieved' });
    await M('milestone', { name: 'Hypercare exit', kind: 'hypercareExit', date: D('2026-06-30'), status: 'achieved' });
    const obj = await M('objective', { title: 'Pay 95% of invoices on time' });
    const m1 = await M('measure', { name: 'Invoices paid within terms', category: 'organisational', subtype: 'benefit', objectiveIds: [obj.id], baseline: 71, target: 95, unit: '%', direction: 'higher', threshold: 85, dataSource: 'Finance system', frequency: 'monthly', ownerId: U.hannah.id, sustainmentOwnerId: P.diane.id, postCloseoutMonths: 6 });
    for (const [d, v] of [['2026-04-30', 78], ['2026-05-31', 86], ['2026-06-30', 91], ['2026-07-31', 93], ['2026-08-31', 94], ['2026-09-30', 95]]) await M('measureValue', { measureId: m1.id, date: D(d), value: v, source: 'feed' });
    const m2 = await M('measure', { name: 'Invoices processed in the shared services workflow', category: 'individual', subtype: 'ultimateUtilisation', baseline: 0, target: 100, unit: '%', direction: 'higher', threshold: 90, dataSource: 'Workflow reports', frequency: 'monthly', ownerId: U.hannah.id, sustainmentOwnerId: P.gareth.id });
    for (const [d, v] of [['2026-04-30', 82], ['2026-05-31', 93], ['2026-06-30', 97], ['2026-08-31', 98], ['2026-09-30', 99]]) await M('measureValue', { measureId: m2.id, date: D(d), value: v, source: 'feed' });
    const g = {};
    for (const [key, name, sg, hc] of [['fo', 'Finance officers', 'fo', 120], ['ap', 'Accounts payable', 'ap', 45], ['bh', 'Budget holders', 'budget', 300]]) {
      g[key] = await M('impactedGroup', { name, definitionType: key === 'bh' ? 'role' : 'orgUnit', stakeholderGroupId: G[sg].id, headcount: hc, confirmationStatus: 'confirmed', confirmedDate: D('2025-11-14') });
      await M('impact', { impactedGroupId: g[key].id, aspect: 'processes', level: 'group', degree: key === 'bh' ? 2 : 4, milestoneId: gl.id, transitionWeeks: 8 });
      await M('impact', { impactedGroupId: g[key].id, aspect: 'systems', level: 'group', degree: key === 'bh' ? 2 : 3, milestoneId: gl.id, transitionWeeks: 8 });
      await M('assessment', { kind: 'adkar', subjectType: 'group', subjectId: g[key].id, round: 'baseline', method: 'practitioner', date: D('2025-12-01'), assessorId: U.priya.id, scores: { awareness: 3.2, desire: 3.0, knowledge: 2.0, ability: 2.0, reinforcement: 2.0 }, confirmed: true });
      await M('assessment', { kind: 'adkar', subjectType: 'group', subjectId: g[key].id, round: 'postGoLive', method: 'practitioner', date: D('2026-05-15'), assessorId: U.priya.id, scores: { awareness: 4.5, desire: 4.1, knowledge: 4.0, ability: 3.6, reinforcement: 3.2 }, confirmed: true });
      await M('assessment', { kind: 'adkar', subjectType: 'group', subjectId: g[key].id, round: 'sustainment', method: 'practitioner', date: D('2026-09-20'), assessorId: U.priya.id, scores: { awareness: 4.7, desire: 4.4, knowledge: 4.3, ability: 4.2, reinforcement: key === 'bh' ? 3.0 : 4.0 }, confirmed: true });
    }
    for (const k of ['helen', 'diane', 'gareth']) await M('profile', { subjectType: 'person', stakeholderId: P[k].id, changeRoles: k === 'helen' ? ['primarySponsor'] : ['businessOwner', 'peopleManager'], impactedGroupIds: k === 'diane' ? [g.ap.id] : k === 'gareth' ? [g.fo.id] : [], relationshipOwnerId: U.priya.id, influence: 'high', interest: 'high', currentEngagement: 'leading', desiredEngagement: 'leading', ratingHistory: [] }, T('2025-09-15'));
    const fssStrategy = await M('strategy', { summary: p('A medium-risk consolidation of accounts payable and financial operations into one shared services team, with a strong emphasis on reinforcement because budget holders use the workflow only occasionally.'), sponsorshipGaps: 'Budget holders report to many different executives, so the Chief Financial Officer cannot hold them accountable directly.', sponsorshipActions: 'Approval timeliness included in SES performance agreements; Executive Leadership Team reminders each quarter.', approach: 'core', changeTeam: [{ role: 'Change management lead', person: 'Priya Raman', allocation: 0.2, responsibilities: 'Approach, plans and sponsor coaching' }, { role: 'Training lead', person: 'Liam Walsh', allocation: 0.3, responsibilities: 'Workflow training and budget holder guides' }], status: 'approved', approvedVersion: '1.0', baselineAt: T('2025-10-31') }, T('2025-10-10'));
    await M('approval', { subjectType: 'strategy', subjectId: fssStrategy.id, subjectLabel: 'Change Management Strategy', requestedBy: U.priya.id, requestedAt: T('2025-10-20'), rule: 'all', status: 'approved', approvers: [{ userId: U.priya.id, name: 'Priya Raman', decision: 'approve', comment: null, decidedAt: T('2025-10-20') }], snapshot: { version: '1.0' } }, T('2025-10-20'));
    await M('assessment', { kind: 'changeCharacteristics', subjectType: 'initiative', subjectId: I, round: 'baseline', method: 'practitioner', date: D('2025-09-26'), assessorId: U.priya.id, scores: wrap({ cc1: 3, cc2: 3, cc3: 4, cc4: 3, cc5: 3, cc6: 2, cc7: 3, cc8: 3, cc9: 2, cc10: 3 }), confirmed: true });
    await M('assessment', { kind: 'orgAttributes', subjectType: 'initiative', subjectId: I, round: 'baseline', method: 'practitioner', date: D('2025-09-26'), assessorId: U.priya.id, scores: wrap({ oa1: 2, oa2: 3, oa3: 3, oa4: 2, oa5: 2, oa6: 3, oa7: 2, oa8: 3, oa9: 2, oa10: 3 }), confirmed: true });
    for (const [date, rnd, sc] of [['2025-10-01', 'baseline', [4, 3, 3, 3, 3, 3, 3, 3, 4, 3, 3, 3, 3, 3]], ['2026-03-16', 'preGoLive', [5, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4]]]) await M('assessment', { kind: 'pct', subjectType: 'initiative', subjectId: I, round: rnd, method: 'practitioner', date: D(date), assessorId: U.priya.id, scores: wrap(Object.fromEntries(sc.map((v, i) => [`pc${i + 1}`, v]))), confirmed: true });
    await M('assessment', { kind: 'sponsor', subjectType: 'stakeholder', subjectId: P.helen.id, round: 'baseline', method: 'practitioner', date: D('2025-10-01'), assessorId: U.priya.id, scores: wrap({ sp1: 5, sp2: 4, sp3: 4, sp4: 3, sp5: 4, sp6: 4, sp7: 3 }), confirmed: true });
    // Plan activities, all delivered except the reinforcement mechanisms still running.
    for (const [title, plans, adkar, gk, start, end, status, deliverer] of [
      ['CFO launch message: why one purchase-to-pay process', ['sponsor', 'communications'], ['awareness'], [], '2025-11-03', '2025-11-07', 'complete', 'helen'],
      ['Branch roadshows on the shared services model', ['communications'], ['awareness', 'desire'], ['fo', 'ap', 'bh'], '2025-11-17', '2025-12-12', 'complete', 'helen'],
      ['Manager briefings on role changes for finance officers', ['peopleManager'], ['awareness', 'desire'], ['fo', 'ap'], '2025-12-01', '2025-12-12', 'complete', 'gareth'],
      ['Workflow training for finance officers and accounts payable', ['training'], ['knowledge'], ['fo', 'ap'], '2026-02-16', '2026-03-20', 'complete', null],
      ['CFO message to budget holders on timely approvals', ['sponsor'], ['desire'], ['bh'], '2026-03-16', '2026-03-20', 'complete', 'helen'],
      ['Budget holder approval videos and quick guides', ['training'], ['knowledge', 'ability'], ['bh'], '2026-03-02', '2026-03-27', 'complete', null],
      ['Hypercare floor support and daily stand-ups', ['training'], ['ability'], ['fo', 'ap'], '2026-04-01', '2026-06-30', 'complete', null],
      ['Team leaders coach exception handling', ['peopleManager'], ['ability', 'reinforcement'], ['fo', 'ap'], '2026-04-06', '2026-06-26', 'complete', 'diane'],
      ['Weekly approval reminders for budget holders (hypercare)', ['sustainment'], ['reinforcement'], ['bh'], '2026-04-06', '2026-06-30', 'complete', 'gareth'],
      ['Recognition of teams with on-time payment', ['sponsor', 'sustainment'], ['reinforcement'], ['fo', 'ap'], '2026-07-01', '2026-07-31', 'complete', 'helen'],
      ['Monthly on-time payment dashboard to the Executive', ['sustainment'], ['reinforcement'], ['fo', 'ap'], '2026-07-01', '2026-12-31', 'inProgress', 'diane'],
    ]) await M('activity', { title, kind: 'activity', plans, adkar, groupIds: gk.map((k) => g[k].id), ownerId: U.priya.id, delivererId: deliverer ? P[deliverer].id : null, responsibleRole: deliverer === 'helen' ? 'sponsor' : deliverer ? 'peopleManager' : 'trainingTeam', startDate: D(start), endDate: D(end), status, percentComplete: status === 'complete' ? 100 : 60 }, T('2025-10-24'));
    const review = await M('engagementPlanItem', { objective: 'Monthly sustainment review with the sponsor and sustainment owners', adkar: ['reinforcement'], engagementLevel: 'collaborate', messageFocus: 'progress', engagementType: 'briefing', channel: 'inPerson', stakeholderIds: [P.helen.id, P.diane.id, P.gareth.id], groupIds: [], timingMode: 'fixed', plannedDate: D('2026-07-15'), plannedTime: '10:00', cadence: 'monthly', until: D('2026-11-30'), durationMinutes: 45, senderId: P.priya_s.id, relationshipOwnerId: U.priya.id, planType: 'sustainment', status: 'active' }, T('2026-06-30'));
    await S.syncOccurrences(S.SYSTEM, review);
    await logOccurrences(I, review, { summaries: ['Reviewed on-time payment results and workflow usage; agreed to keep weekly reminders for budget holders.', 'On-time payments reached target; budget holder approvals still slow in two divisions.', 'Agreed the handover checklist and the remaining items for the escalation path.', 'Reviewed the draft closeout report and sustainment owner acceptance.'], sentimentFor: () => 'positive' });
    await M('approval', { subjectType: 'masterPlan', subjectId: I, subjectLabel: 'Master Change Management Plan', component: 'all', requestedBy: U.priya.id, requestedAt: T('2025-10-24'), rule: 'all', status: 'approved', approvers: [{ userId: U.priya.id, name: 'Priya Raman', decision: 'approve', comment: 'Approved by the Chief Financial Officer at the October steering committee.', decidedAt: T('2025-10-30') }], snapshot: { version: '1.0' } }, T('2025-10-24'));
    // The remaining barrier point (Reinforcement for budget holders) is acknowledged with a rationale (RUL-15).
    const fssIni = await S.driver.get('initiative', I);
    await put(fssIni, { coverageAcks: { [`barrier:${g.bh.id}:reinforcement`]: { by: U.priya.id, at: T('2026-10-01'), reason: 'Handled through the Sustainment Plan: approval timeliness is now in SES performance agreements and owned by the CFO.' } } });
    await M('blueprint', { name: 'Organisation ADKAR Blueprint', scope: 'organisation', status: 'approved', elements: Object.fromEntries(ADKAR_IDS.map((e) => [e, { desiredOutcome: `Finance staff and budget holders achieve ${e}.`, indicators: '', barriers: '', rootCauses: '', measures: '' }])) });
    for (const [mech, desc, ownerK, status] of [['measurement', 'Monthly on-time payment dashboard to the Executive', 'diane', 'active'], ['accountability', 'Budget holder approval timeliness in SES performance agreements', 'helen', 'embedded'], ['ongoingSupport', 'Shared services help line and knowledge base', 'gareth', 'active'], ['recognition', 'Quarterly recognition for teams with no late approvals', 'helen', 'planned']]) await M('sustainmentItem', { mechanism: mech, description: desc, ownerId: P[ownerK].id, groupIds: Object.values(g).map((x) => x.id), measureIds: [m1.id], frequency: 'monthly', reviewDate: D('2026-12-15'), status });
    for (const [item, ownerK, status, date] of [['Accounts payable procedures and process maps', 'diane', 'accepted', '2026-09-15'], ['On-time payment dashboard and data source', 'diane', 'accepted', '2026-09-15'], ['Budget holder training materials', 'gareth', 'accepted', '2026-09-22'], ['Ongoing measurement of workflow usage', 'gareth', 'pending', null], ['Escalation path for late approvals', 'helen', 'pending', null]]) await M('handoverItem', { item, ownerId: P[ownerK].id, status, acceptedBy: status === 'accepted' ? `${P[ownerK].givenName} ${P[ownerK].familyName}` : null, acceptedDate: date ? D(date) : null, transferDate: D('2026-11-30') });
    for (const [title, cat, worked, didNot, rec, phase] of [
      ['Budget holders need reminders, not just training', 'training', 'Short videos for budget holders', 'Classroom training for budget holders had low attendance', 'Use embedded reminders and just-in-time guides for occasional users', 'p2'],
      ['Sponsor visibility in the first month mattered', 'sponsorship', 'CFO messages in week one and week four', 'Sponsor absent from hypercare reviews', 'Schedule sponsor presence in hypercare reviews', 'p2'],
      ['Process maps helped resolve role confusion', 'planning', 'Swim-lane maps validated with staff', 'Maps produced too late for training', 'Produce process maps before training content', 'p1'],
      ['Measure adoption weekly during hypercare', 'measurement', 'Weekly workflow usage reporting', 'Monthly reporting hid early issues', 'Report weekly for the first eight weeks', 'p3'],
      ['Change agents from finance teams were credible', 'stakeholders', 'Peer support from finance officers', 'Agents had no protected time', 'Agree protected time with managers', 'p2'],
      ['Union consultation early avoided disputes', 'resistance', 'Early consultation on role changes', '', 'Consult before design sign-off', 'p1'],
    ]) await M('lesson', { title, category: cat, whatWorked: worked, whatDidNot: didNot, recommendation: rec, phase, tags: 'finance, shared services', date: D('2026-09-25') });
    await M('closeout', { performanceSummary: p('Invoices paid within terms rose from 71% to 95%, meeting the target. Workflow adoption is 99%. Reinforcement is weaker among budget holders, where approvals remain slow.'), measureReviews: [{ measureId: m1.id, actual: 95, commentary: 'Target met in September 2026.', gap: 0 }, { measureId: m2.id, actual: 99, commentary: 'Near-universal adoption.', gap: 1 }], overallRag: 'green', sustainmentStatus: 'Three of four reinforcement mechanisms active.', handoverStatus: 'Three of five handover items accepted.', recommendations: 'Keep weekly approval reminders for budget holders for six months.', status: 'draft' });
    const finTeam = everyone.filter((x) => ['fo', 'ap'].includes(x[4])).map((x) => P[x[0]].id);
    const wf = await M('trainingIntervention', { title: 'Shared services workflow', modality: 'instructorLed', durationHours: 3, audienceGroupIds: [g.fo.id, g.ap.id], ownerId: U.liam.id, milestoneId: gl.id, offsetDays: -15, targetCompletion: 95, lmsCourseId: 'LMS-0915', description: 'Processing invoices and exceptions in the shared services workflow.' });
    for (const [date, ids] of [['2026-03-09', finTeam.slice(0, 6)], ['2026-03-16', finTeam.slice(6)]]) await M('trainingSession', { interventionId: wf.id, date: D(date), startTime: '09:30', durationHours: 3, location: 'National Office, Level 4', trainer: 'Liam Walsh', capacity: 12, enrolments: ids.map((sid, i) => ({ stakeholderId: sid, attended: true, completed: !(date === '2026-03-16' && i === 0), score: 80 + (i % 4) * 5 })), status: 'completed' });
    await M('readinessChecklist', { name: 'Go-live readiness', kind: 'goLive', milestoneId: gl.id, date: D('2026-03-20'), items: READINESS_CHECKLISTS.goLive.criteria.map((c) => ({ criterion: c, status: 'met' })), decision: 'go', decisionDate: D('2026-03-23'), decidedBy: 'Finance Steering Committee' });
  }
}

function wrap(scores, comments = {}) {
  return Object.fromEntries(Object.entries(scores).map(([k, v]) => [k, { score: v, comment: comments[k] || '' }]));
}

// Used by tests and the stand-alone demo to check the seed's integrity quickly.
export const DEMO_SUMMARY = { initiatives: 3, users: USERS.length, questionSets: Object.keys(QUESTION_SETS).length, defaults: Object.keys(DEFAULT_SETTINGS).length };
