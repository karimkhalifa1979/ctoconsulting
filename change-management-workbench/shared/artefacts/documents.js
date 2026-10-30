// Document builders (Word, PDF and HTML) for the standard artefact catalogue (Section 8.2). Each returns
// { meta, sections }, where sections are { id, title, blocks }. Audience variants (ART-009) trim content:
// sponsor and manager variants are shorter; the external variant leaves out named stakeholders.
import { ADKAR, ADKAR_IDS, adkarLabel } from '../refdata.js';
import { addDays, addMonths, periodRange, monthKey } from '../dates.js';
import { asArray, sortBy, sum, round, uniq, truncate } from '../util.js';
import { h, p, bullets, table, kv, missing, chart, callout, placeholder, rich, plain, fmtDate, fmtNum, fmtPct, adkarName, adkarList, score, SERIES, STATUS, RAG, adkarFill, adkarInk, impactFill, impactInk } from './ir.js';
import * as X from './sections.js';

const cap = X.cap;
const numbered = (sections) => sections.filter(Boolean).map((sec, i) => ({ ...sec, title: `${i + 1} ${sec.title}` }));
const section = (id, title, blocks) => ({ id, title, blocks: blocks.filter(Boolean) });
const meta = (title, extra = {}) => ({ title, toc: true, ...extra });

// --- Phase deliverables ------------------------------------------------------------------------------

function strategy(s, c) {
  const { x } = c;
  const st = s.strategy;
  const r = s.risk;
  const sections = [
    X.documentControl(s, { docControl: c.docControl, history: asArray(s.approvals.strategy).filter((a) => a.status !== 'pending').map((a) => ({ at: a.requestedAt, status: a.status, approvers: a.approvers, comment: a.approvers.map((y) => y.comment).filter(Boolean).join('; ') })) }),
    X.executiveSummary(s, x),
    section('summary', 'Summary of the change', [...(st?.summary ? rich(st.summary) : [p(plain(s.initiative.description))]), kv([['Primary sponsor', s.initiative.primarySponsor || missing('primary sponsor')], ['Business owner', s.initiative.businessOwner], ['Change management lead', s.initiative.changeLead], ['Project manager', s.initiative.projectManager], ['Delivery approach', x.L('deliveryApproach', s.initiative.deliveryApproach)], ['Timeframe', s.initiative.startDate ? `${fmtDate(s.initiative.startDate)} to ${fmtDate(s.initiative.endDate)}` : '']])]),
    X.caseForChange(s),
    X.definitionOfSuccess(s, x),
    section('riskAssessment', 'Change risk assessment', riskAssessmentBlocks(s)),
    section('approach', 'Change management approach', [
      kv([['Risk profile', r.profile ? cap(r.profile) : 'Not assessed'], ['Recommended approach (RUL-14)', r.recommended ? `${r.recommended.label}: ${r.recommended.description}` : 'Assess change risk first'], ['Selected approach', st?.approachLabel || 'Not yet selected'], ['Rationale for overriding the recommendation', st?.overrideRationale]]),
      ...(c.x.narrative('approachNarrative') ? rich(c.x.narrative('approachNarrative').html, { aiDrafted: c.x.narrative('approachNarrative').aiDrafted }) : []),
      table([{ label: 'Plan', w: 2.2 }, { label: 'Category', w: 1 }, { label: 'Purpose', w: 5 }, { label: 'Selected', w: 1 }], s.plans.map((pl) => [pl.label, cap(pl.category), pl.purpose, pl.selected ? 'Yes' : 'No']), { caption: 'Plans in the Master Change Management Plan' }),
      ...(s.initiative.planRationale ? [p(s.initiative.planRationale)] : []),
    ]),
    X.changeImpactSummary(s, x),
    section('stakeholdersSponsorship', 'Stakeholders and sponsorship model', [
      X.powerInterestTable(s),
      ...X.sponsorshipGovernance(s, x).blocks,
    ]),
    section('integration', 'Integration with the project approach', [
      ...(st?.integrationApproach ? [p(st.integrationApproach)] : [placeholder('how change activities integrate with the project approach')]),
      table([{ label: 'Project phase, release or iteration', w: 2.5 }, { label: 'Change activities', w: 5 }], asArray(st?.phaseMapping).map((m) => [m.projectPhase, m.changeActivities]), { caption: 'Change activities by project phase', empty: 'No phase mapping recorded.' }),
    ]),
    section('resistance', 'Anticipated resistance and special tactics', [
      ...(st?.anticipatedResistance ? [h(2, 'Anticipated resistance'), p(st.anticipatedResistance)] : []),
      ...(st?.specialTactics ? [h(2, 'Special tactics'), p(st.specialTactics)] : []),
      ...(!st?.anticipatedResistance && !st?.specialTactics ? [placeholder('anticipated resistance and special tactics')] : []),
    ]),
    section('assumptions', 'Assumptions, resources and budget', [...(st?.assumptions ? [p(st.assumptions)] : []), ...X.resourcesSection(s).blocks]),
  ];
  return { meta: meta('Change Management Strategy', { subtitle: 'Phase 1 deliverable: Prepare Approach' }), sections: numbered(sections) };
}
const PCT = { success: 'Success', leadership: 'Leadership / sponsorship', projectManagement: 'Project management', changeManagement: 'Change management' };

function riskAssessmentBlocks(s) {
  const r = s.risk;
  const item = (it) => [it.text, it.score == null ? '—' : { text: String(it.score), align: 'c', ...(it.score >= 4 ? { fill: STATUS.criticalSoft, color: STATUS.criticalInk, bold: true } : {}) }];
  return [
    p(`The change characteristics score ${r.ccScore ?? 'has not been assessed'}${r.ccScore != null ? '/100' : ''} and the organisational attributes score ${r.oaScore ?? 'have not been assessed'}${r.oaScore != null ? '/100' : ''}. Higher scores mean greater risk. The resulting change risk profile is ${r.profile || 'not yet known'}.`),
    table([{ label: 'Change characteristic', w: 5 }, { label: 'Score (1–5)', w: 1, align: 'c' }], r.ccItems.map(item), { caption: `Change characteristics${r.ccDate ? ` (assessed ${fmtDate(r.ccDate)})` : ''}`, small: true, empty: 'Not yet assessed.' }),
    table([{ label: 'Organisational attribute', w: 5 }, { label: 'Score (1–5)', w: 1, align: 'c' }], r.oaItems.map(item), { caption: `Organisational attributes${r.oaDate ? ` (assessed ${fmtDate(r.oaDate)})` : ''}`, small: true, empty: 'Not yet assessed.' }),
    ...(r.pct ? [table([{ label: 'PCT aspect', w: 3 }, { label: 'Score (0–100)', w: 1, align: 'c' }], Object.entries(r.pct.aspects).map(([k, v]) => [PCT[k] || k, { text: v == null ? '—' : String(v), align: 'c' }]), { caption: `Initiative health (PCT) assessed ${fmtDate(r.pct.date)}` })] : []),
  ];
}

function masterPlan(s, c) {
  const { x, params } = c;
  const v = params.variant || 'full';
  const history = asArray(s.approvals.masterPlan).filter((a) => a.status !== 'pending').map((a) => ({ at: a.requestedAt, status: a.status, approvers: a.approvers, comment: a.approvers.map((y) => y.comment).filter(Boolean).join('; ') }));
  const all = {
    documentControl: X.documentControl(s, { docControl: c.docControl, history }),
    executiveSummary: X.executiveSummary(s, x),
    purposeScope: X.purposeAndScope(s),
    caseForChange: X.caseForChange(s),
    success: X.definitionOfSuccess(s, x),
    impact: X.changeImpactSummary(s, x),
    stakeholders: v === 'external' ? { ...X.stakeholderAnalysis(s, x), blocks: [p(`${s.profiles.length} stakeholders and stakeholder groups are profiled; ${s.kpis.priorityStakeholders} are priority stakeholders.`), X.engagementSchedule(s, x)] } : X.stakeholderAnalysis(s, x),
    sponsorship: X.sponsorshipGovernance(s, x),
    adkarApproach: X.adkarApproach(s, x),
    blueprints: x.selected('blueprint') || s.blueprints.length ? X.blueprintsSection(s) : null,
    corePlans: X.corePlans(s, x),
    extendPlans: X.extendPlans(s, x),
    timeline: X.integratedTimeline(s, x),
    readiness: X.readinessSection(s, x),
    measurement: X.measurementSection(s, x),
    risks: X.risksSection(s),
    resources: X.resourcesSection(s),
    appendices: v === 'external' ? null : X.appendices(s, x),
  };
  const order = {
    full: Object.keys(all),
    sponsor: ['documentControl', 'executiveSummary', 'caseForChange', 'success', 'impact', 'sponsorship', 'readiness', 'risks'],
    manager: ['documentControl', 'executiveSummary', 'impact', 'corePlans', 'timeline', 'readiness'],
    external: Object.keys(all).filter((k) => !['appendices', 'resources'].includes(k)),
  }[v] || Object.keys(all);
  return { meta: meta('Master Change Management Plan', { subtitle: 'Phase 2 deliverable: Manage Change' }), sections: numbered(order.map((k) => all[k])) };
}

function closeout(s, c) {
  const { x } = c;
  const co = s.closeout;
  const n = x.narrative('closeoutSummary');
  const delivered = s.activities.filter((a) => a.status === 'complete').length;
  const live = s.activities.filter((a) => a.status !== 'cancelled').length;
  const history = asArray(s.approvals.closeout).filter((a) => a.status !== 'pending').map((a) => ({ at: a.requestedAt, status: a.status, approvers: a.approvers }));
  const review = (cat) => {
    const xs = s.measures.filter((m) => m.category === cat);
    if (!xs.length) return null;
    return table([{ label: 'Measure', w: 3 }, { label: 'Baseline', w: 1, align: 'r' }, { label: 'Actual', w: 1, align: 'r' }, { label: 'Target', w: 1, align: 'r' }, { label: 'Result', w: 1.2 }, { label: 'Commentary', w: 3.5 }],
      xs.map((m) => { const rv = asArray(co?.measureReviews).find((y) => y.measure === m.name); const met = m.status === 'onTrack'; return [m.name, m.baseline != null ? `${fmtNum(m.baseline, 2)}${m.unit}` : '—', m.latest != null ? `${fmtNum(m.latest, 2)}${m.unit}` : '—', `${fmtNum(m.target, 2)}${m.unit}`, met ? { text: 'Target met', fill: STATUS.goodSoft, color: STATUS.goodInk } : { text: 'Not met', fill: STATUS.warningSoft, color: STATUS.warningInk }, [rv?.commentary, rv?.gapAnalysis && `Gap: ${rv.gapAnalysis}`].filter(Boolean).join(' ')]; }),
      { caption: x.L('measureCategory', cat), small: true });
  };
  const sections = [
    X.documentControl(s, { docControl: c.docControl, history }),
    section('summary', 'Closeout summary', [
      ...(n ? rich(n.html, { aiDrafted: n.aiDrafted }) : co?.performanceSummary ? rich(co.performanceSummary) : [placeholder('performance summary')]),
      kv([['Overall result', co?.overallRag ? RAG[co.overallRag]?.label : 'Not rated'], ['Change activities delivered', `${delivered} of ${live}`], ['Measures meeting target', `${s.measures.filter((m) => m.status === 'onTrack').length} of ${s.measures.length}`], ['Closeout status', co ? cap(co.status) : 'Not started']]),
    ]),
    section('performance', 'Review of performance', [p('Organisational, individual and change management performance against the definition of success (SUS-001).'), ...['organisational', 'individual', 'changeManagement'].map(review)]),
    section('sustainment', 'Sustainment status', [...(co?.sustainmentStatus ? [p(co.sustainmentStatus)] : []), X.sustainmentTable(s, x)]),
    section('handover', 'Transfer of ownership', [...(co?.handoverStatus ? [p(co.handoverStatus)] : []), handoverTable(s)]),
    section('lessons', 'Lessons learned', lessonsBlocks(s, x)),
    section('recommendations', 'Recommendations', co?.recommendations ? [p(co.recommendations)] : [placeholder('recommendations')]),
  ];
  return { meta: meta('Change Management Closeout', { subtitle: 'Phase 3 deliverable: Sustain Outcomes' }), sections: numbered(sections) };
}
function handoverTable(s) {
  return table([{ label: 'Handover item', w: 3 }, { label: 'Sustainment owner', w: 1.8 }, { label: 'Group or measure', w: 2 }, { label: 'Status', w: 1 }, { label: 'Accepted', w: 1.6 }, { label: 'Transfer', w: 1.1 }],
    s.handover.map((ho) => [ho.item, ho.owner, ho.group || ho.measure, ho.status === 'accepted' ? { text: 'Accepted', fill: STATUS.goodSoft, color: STATUS.goodInk } : cap(ho.status), ho.acceptedBy ? `${ho.acceptedBy}, ${fmtDate(ho.acceptedDate)}` : '', fmtDate(ho.transferDate)]),
    { caption: 'Handover checklist', small: true, empty: 'No handover items recorded.' });
}
function lessonsBlocks(s, x) {
  if (!s.lessons.length) return [p('No lessons recorded.')];
  const cats = uniq(s.lessons.map((l) => l.category));
  return cats.flatMap((cat) => [h(2, x.L('lessonCategory', cat)), table([{ label: 'Lesson', w: 2 }, { label: 'What worked', w: 2.5 }, { label: 'What did not', w: 2.5 }, { label: 'Recommendation', w: 2.5 }], s.lessons.filter((l) => l.category === cat).map((l) => [{ text: l.title, bold: true }, l.whatWorked, l.whatDidNot, l.recommendation]), { small: true })]);
}

// --- Plans and registers ------------------------------------------------------------------------------

function blueprint(s, c) {
  const { x } = c;
  const b = s.blueprints[0];
  if (!b) return { meta: meta('ADKAR Blueprint', { toc: false }), sections: [X.documentControl(s, { docControl: c.docControl, title: 'Document control' }), section('blueprint', 'ADKAR Blueprint', [placeholder('an ADKAR Blueprint for the organisation or an impacted group')])] };
  const g = s.groups.find((y) => y.id === b.groupId);
  const t = s.settings.adkarThreshold;
  const sections = [
    X.documentControl(s, { docControl: c.docControl, title: 'Document control' }),
    section('blueprint', b.name, [p(`Scope: ${b.group || 'the organisation'}. Status: ${b.status === 'approved' ? 'approved' : 'draft'}.`), X.blueprintTable(b)]),
    ...(g ? [section('context', `Where ${g.name} is now`, [
      kv([['Headcount', fmtNum(g.headcount)], ['Overall impact', g.overall != null ? `${g.overall} of 5` : '—'], ['Barrier point', adkarName(g.barrierPoint) || 'Not assessed'], ['Readiness index', g.readiness.index ?? '—'], ['Adoption challenge', g.adoptionChallenge], ["What's in it for them", g.wiifm]]),
      table(ADKAR.map((a) => ({ label: a.label, w: 1, align: 'c' })), [ADKAR_IDS.map((el) => { const v = g.adkar?.scores?.[el]; return v == null ? '—' : { text: score(v), fill: adkarFill(v, t), color: adkarInk(v, t), align: 'c' }; })], { caption: `Latest ADKAR result${g.adkar?.date ? ` (${fmtDate(g.adkar.date)})` : ''}` }),
    ])] : []),
    section('actions', 'Actions by element', ADKAR.flatMap((el) => {
      const list = x.acts((a) => a.adkar.includes(el.id) && (!b.groupId || !a.groups.length || a.groups.includes(b.groupId)));
      return [h(2, el.label), X.activityTable(s, x, list, { small: true })];
    })),
  ];
  return { meta: meta('ADKAR Blueprint', { subtitle: b.name }), sections: numbered(sections) };
}

function impactAssessment(s, c) {
  const { x } = c;
  const L = x.L;
  const sections = [
    X.documentControl(s, { docControl: c.docControl, title: 'Document control' }),
    section('summary', 'Summary', [p(`${s.groups.length} impacted groups (${fmtNum(s.kpis.headcount)} people) are affected; ${s.kpis.highImpactGroups} are highly impacted.`), X.impactHeatmapTable(s, x), X.impactTimelineTable(s)]),
    section('groups', 'Impacted groups', s.groups.flatMap((g) => [
      h(2, g.name),
      kv([['Definition', g.definition], ['Headcount', fmtNum(g.headcount)], ['Locations', g.locations], ['Accountable people leader', g.manager], ['Overall impact', g.overall != null ? `${g.overall} of 5${g.high ? ' (high)' : ''}` : 'Not assessed'], ['Confirmation', L('confirmationStatus', g.confirmationStatus)]]),
      table([{ label: 'Aspect', w: 1.6 }, { label: 'Current state', w: 2.6 }, { label: 'Future state', w: 2.6 }, { label: 'Degree', w: 0.8, align: 'c' }, { label: 'When', w: 1.6 }],
        sortBy(s.impacts.filter((i) => i.groupId === g.id), (i) => -(i.degree || 0)).map((i) => [`${L('impactAspect', i.aspect)}${i.subject ? ` (${i.subject})` : ''}`, i.currentState, i.futureState || i.description, i.degree == null ? '—' : { text: String(i.degree), fill: impactFill(i.degree), color: impactInk(i.degree), align: 'c', bold: i.degree >= 4 }, i.milestone || fmtDate(i.feltFrom)]),
        { caption: `Impacts on ${g.name}`, small: true, empty: 'No impacts assessed yet.' }),
      ...(g.adoptionChallenge ? [p(`Adoption challenge: ${g.adoptionChallenge}`)] : []),
      ...(g.wiifm ? [p(`What's in it for them: ${g.wiifm}`)] : []),
      ...(g.concerns ? [p(`Likely concerns: ${g.concerns}`)] : []),
    ])),
  ];
  return { meta: meta('Change Impact Assessment'), sections: numbered(sections) };
}

function stakeholderPlan(s, c) {
  const { x } = c;
  const roles = uniq(s.profiles.flatMap((pr) => pr.roles));
  const owners = uniq(s.profiles.map((pr) => pr.relationshipOwner).filter(Boolean));
  const sections = [
    X.documentControl(s, { docControl: c.docControl, title: 'Document control' }),
    section('register', 'Register summary', [
      p(`${s.profiles.filter((pr) => pr.person).length} individuals and ${s.profiles.filter((pr) => !pr.person).length} stakeholder groups are profiled; ${s.kpis.priorityStakeholders} are priority stakeholders.`),
      table([{ label: 'Change role', w: 3 }, { label: 'Stakeholders', w: 1, align: 'r' }], roles.map((r) => [x.L('changeRole', r), String(s.profiles.filter((pr) => pr.roles.includes(r)).length)]), { caption: 'Stakeholders by change role' }),
      table([{ label: 'Relationship owner', w: 3 }, { label: 'Stakeholders', w: 1, align: 'r' }, { label: 'Outside cadence', w: 1, align: 'r' }], owners.map((o) => [o, String(s.profiles.filter((pr) => pr.relationshipOwner === o).length), String(s.profiles.filter((pr) => pr.relationshipOwner === o && pr.cadenceOverdue).length)]), { caption: 'Relationship owners' }),
    ]),
    section('analysis', 'Analysis maps', [X.powerInterestTable(s), h(2, 'Engagement gap'), ...X.engagementGap(s, x), h(2, 'Priority stakeholders'), X.priorityStakeholders(s, x)]),
    section('approach', 'Engagement approach', [X.engagementApproachTable(s)]),
    section('schedule', 'Engagement schedule', [X.engagementSchedule(s, { ...x, limit: 200 })]),
    section('extract', 'Stakeholder register extract', [p('Non-sensitive fields only.', 'small'), X.registerExtract(s, x)]),
  ];
  return { meta: meta('Stakeholder Analysis and Engagement Plan'), sections: numbered(sections) };
}

function engagementReport(s, c) {
  const { x, params } = c;
  const from = params.from || addDays(s.today, -30);
  const to = params.to || s.today;
  const es = s.engagements.filter((e) => e.date && e.date >= from && e.date <= to && e.status !== 'cancelled');
  const months = periodRange(from, to, 'month');
  const n = x.narrative('statusCommentary');
  const done = es.filter((e) => e.done);
  const planned = es.filter((e) => e.plannedDate && e.plannedDate >= from && e.plannedDate <= to);
  const sentiments = s.includeSensitive ? done.flatMap((e) => asArray(e.sentiments)) : [];
  const followUps = es.filter((e) => e.followUpRequired && e.status !== 'cancelled');
  const sections = [
    X.documentControl(s, { docControl: c.docControl, title: 'Document control' }),
    section('summary', 'Summary for the period', [
      p(`Reporting period: ${fmtDate(from)} to ${fmtDate(to)}.`),
      ...(n ? rich(n.html, { aiDrafted: n.aiDrafted }) : []),
      kv([['Engagements completed', String(done.length)], ['Planned in the period', `${planned.length} (${planned.filter((e) => e.done).length} completed)`], ['Unplanned engagements', String(done.filter((e) => !e.planned).length)], ['Engaged within cadence', s.kpis.engagementCoverage != null ? `${s.kpis.engagementCoverage}% (${s.kpis.outsideCadence} outside cadence)` : '—']]),
      chart('column', { title: 'Planned and completed engagements by month', categories: months.map((m) => X.shortMonth(m.start)), series: [{ name: 'Planned', values: months.map((m) => planned.filter((e) => monthKey(e.plannedDate) === m.key).length), color: SERIES[0] }, { name: 'Completed', values: months.map((m) => done.filter((e) => monthKey(e.actualDate) === m.key).length), color: SERIES[1] }], numberFormat: '0' }),
    ]),
    section('coverage', 'Engagement coverage', [
      table([{ label: 'Stakeholder', w: 2.4 }, { label: 'Quadrant', w: 1.5 }, { label: 'Required every', w: 1.2, align: 'r' }, { label: 'Last engaged', w: 1.3 }, { label: 'Next planned', w: 1.3 }],
        sortBy(s.profiles.filter((pr) => pr.cadenceOverdue), 'lastEngaged').map((pr) => [pr.name, X.QUADRANT_LABELS[pr.quadrant] || '—', `${pr.cadenceDays} days`, fmtDate(pr.lastEngaged) || 'Never', fmtDate(pr.nextPlanned) || { text: 'None planned', color: STATUS.criticalInk }]),
        { caption: 'Stakeholders outside their engagement cadence', empty: 'Every stakeholder with a required cadence has been engaged within it.' }),
    ]),
    section('engagements', 'Engagements in the period', [
      table([{ label: 'Date', w: 1.1 }, { label: 'Engagement', w: 3 }, { label: 'With', w: 2.6 }, { label: 'Type', w: 1.4 }, { label: 'ADKAR', w: 1.3 }, { label: 'Outcome', w: 1.2 }],
        sortBy(done, 'date').map((e) => [fmtDate(e.date), e.objective, e.audience, x.L('engagementType', e.type), adkarList(e.adkar), x.L('outcomeRating', e.outcome)]), { small: true, empty: 'No engagements were completed in the period.' }),
    ]),
    section('sentiment', 'Sentiment and concerns', [
      ...(s.includeSensitive
        ? [table([{ label: 'Sentiment', w: 2 }, { label: 'Observations', w: 1, align: 'r' }], Object.entries(countOf(sentiments.map((y) => y.sentiment))).map(([k, nn]) => [x.L('sentiment', k), String(nn)]), { caption: 'Observed sentiment', empty: 'No sentiment recorded.' })]
        : [callout('info', 'Sentiment not shown', 'Observed sentiment is sensitive and is excluded from this artefact (RUL-17).')]),
      table([{ label: 'Theme', w: 3 }, { label: 'Feedback items', w: 1, align: 'r' }], s.feedbackThemes.map((t) => [x.L('feedbackTheme', t.theme), String(t.total)]), { caption: 'Feedback themes in the period', empty: 'No feedback recorded in the period.' }),
      ...(uniq(done.flatMap((e) => e.concerns)).length ? [h(2, 'Concerns raised'), bullets(uniq(done.flatMap((e) => e.concerns)).slice(0, 15))] : []),
    ]),
    section('actions', 'Follow-up actions', [table([{ label: 'Engagement', w: 3 }, { label: 'Follow up by', w: 1.2 }, { label: 'With', w: 2.6 }], followUps.map((e) => [e.objective, fmtDate(e.followUpDate), e.audience]), { empty: 'No follow-up actions outstanding.' })]),
  ];
  return { meta: meta('Stakeholder Engagement Report', { subtitle: `${fmtDate(from)} to ${fmtDate(to)}` }), sections: numbered(sections) };
}
const countOf = (xs) => xs.reduce((a, k) => ({ ...a, [k]: (a[k] || 0) + 1 }), {});

function engagementBrief(s, c) {
  const { x } = c;
  const d = s.stakeholder;
  if (!d) return { meta: meta('Stakeholder Engagement Brief', { toc: false }), sections: [section('brief', 'Stakeholder Engagement Brief', [placeholder('choose a stakeholder')])] };
  const L = x.L;
  const sections = [
    section('who', d.name, [
      kv([['Position', [d.position, d.organisation].filter(Boolean).join(', ')], ['Business unit', d.businessUnit], ['Location', d.location], ['Reports to', d.manager], ['Change roles', d.roles.map((r) => L('changeRole', r)).join(', ')], ['Relationship owner', d.relationshipOwner],
        ['Influence and interest', d.influence ? `${L('influence', d.influence)} influence, ${L('interest', d.interest)} interest (${X.QUADRANT_LABELS[d.quadrant] || '—'})` : ''], ['Preferred channels', d.preferredChannels.map((ch) => L('channel', ch)).join(', ')],
        ['Engagement cadence', d.cadenceDays ? `Every ${d.cadenceDays} days; last engaged ${fmtDate(d.lastEngaged) || 'never'}${d.cadenceOverdue ? ' (overdue)' : ''}` : ''],
        ...(s.includeSensitive ? [['Current and desired engagement', d.current ? `${L('engagementLevel', d.current)} → ${L('engagementLevel', d.desired)}` : ''], ['Latest sentiment', L('sentiment', d.latestSentiment)], ['Engagement adjustments', d.engagementAdjustments], ['Escalation', d.escalation]] : []),
      ]),
    ]),
    section('impacts', 'How the change affects them', d.groups.length ? d.groups.flatMap((g) => [h(2, `${g.name}${g.overall != null ? ` (overall impact ${g.overall})` : ''}`), g.impacts.length ? bullets(g.impacts.map((i) => `${L('impactAspect', i.aspect)} (${i.degree}): ${i.description}`)) : p('No high impacts recorded.'), ...(g.barrierPoint && g.barrierPoint !== 'none' ? [p(`Group barrier point: ${adkarLabel(g.barrierPoint)}.`)] : [])]) : [p('Not a member of an impacted group.')]),
    section('history', 'Recent engagement', [table([{ label: 'Date', w: 1.1 }, { label: 'Engagement', w: 3 }, { label: 'Summary', w: 4 }], d.history.map((e) => [fmtDate(e.date), `${e.objective}${e.viaGroup ? ' (group)' : ''}`, e.summary]), { empty: 'No engagements recorded.' }), ...(d.concerns.length ? [h(2, 'Concerns raised'), bullets(d.concerns)] : [])]),
    section('next', 'Coming up and key messages', [table([{ label: 'Date', w: 1.1 }, { label: 'Engagement', w: 4 }], d.upcoming.map((e) => [fmtDate(e.date), e.objective]), { empty: 'Nothing planned.' }), ...(d.keyMessages.length ? [h(2, 'Approved key messages'), bullets(d.keyMessages.map((k) => `${k.title}: ${k.text}`))] : [])]),
    ...(s.includeSensitive && d.openResistance?.length ? [section('resistance', 'Open resistance', [bullets(d.openResistance.map((r) => `${r.title} (${r.status}). ${r.response}`))])] : []),
  ];
  return { meta: meta('Stakeholder Engagement Brief', { subtitle: d.name, toc: false, compact: true }), sections };
}

function sponsorPack(s, c) {
  const { x } = c;
  const msgs = s.keyMessages.filter((k) => k.status === 'approved' && (k.focus === 'businessReasons' || k.focus === 'progress' || k.roles.includes('sponsor')));
  const upcoming = x.acts((a) => (a.plans.includes('sponsor') || a.plans.includes('sponsorCoalition')) && a.status !== 'complete');
  const dec = x.narrative('decisionsRequired');
  const sections = [
    X.documentControl(s, { docControl: c.docControl, title: 'Document control' }),
    section('purpose', 'Purpose of this briefing', [p(`To brief ${s.initiative.primarySponsor || 'the primary sponsor'} on the status of ${s.initiative.name}, the messages to deliver, and the sponsor actions requested over the coming weeks.`)]),
    section('case', 'The case for change in brief', [p(truncate(plain(s.initiative.reasonForChange || s.initiative.businessDrivers || s.initiative.description), 900) || '[To be completed: case for change]'), ...(s.initiative.riskOfNotChanging ? [p(`If we do not change: ${truncate(plain(s.initiative.riskOfNotChanging), 500)}`)] : [])]),
    section('readiness', 'Readiness and barrier points', [X.adkarResultsTable(s, { caption: 'Where each impacted group is on the ADKAR Model' }), X.readinessByGroupChart(s)]),
    section('messages', 'Key messages for you to deliver', msgs.length ? msgs.map((k) => p(`${k.title}: ${k.text}`)) : [placeholder('approved sponsor key messages')]),
    section('actions', 'Requested sponsor actions and upcoming events', [X.activityTable(s, x, upcoming, { deliverer: true, caption: 'Sponsor activities still to do' }), ...(dec ? [h(2, 'Decisions and support required'), ...rich(dec.html, { aiDrafted: dec.aiDrafted })] : [])]),
    section('questions', 'Anticipated questions and suggested responses', s.faqs.filter((f) => f.status === 'approved').slice(0, 10).flatMap((f) => [p(f.question, 'strong'), p(f.answer)])),
    section('plan', 'Sponsor Plan', X.sponsorPlan(s, x)),
  ];
  return { meta: meta('Sponsor Plan and Sponsor Briefing Pack', { subtitle: s.initiative.primarySponsor || '' }), sections: numbered(sections) };
}

function managerBriefing(s, c) {
  const { x } = c;
  const L = x.L;
  const mgr = s.manager;
  const team = mgr ? `${mgr.name}'s team` : 'your team';
  const groupNames = s.groups.map((g) => g.name).join(', ');
  const dates = s.milestones.filter((m) => m.date >= s.today).slice(0, 6);
  const ivs = s.interventions;
  const guidance = x.narrative('managerGuidance');
  const sections = [
    section('changing', 'What is changing for your team', [
      p(`${mgr ? `Prepared for ${mgr.name}${mgr.position ? `, ${mgr.position}` : ''}.` : ''} Your team is part of ${groupNames || 'the impacted groups'}.`),
      ...s.groups.flatMap((g) => [h(2, g.name), table([{ label: 'What changes', w: 1.6 }, { label: 'From', w: 2.6 }, { label: 'To', w: 2.6 }, { label: 'Degree', w: 0.8, align: 'c' }], sortBy(s.impacts.filter((i) => i.groupId === g.id && (i.degree || 0) >= 2), (i) => -(i.degree || 0)).map((i) => [L('impactAspect', i.aspect), i.currentState, i.futureState || i.description, String(i.degree ?? '—')]), { small: true, empty: 'No significant impacts recorded.' }), ...(g.wiifm ? [p(`What's in it for them: ${g.wiifm}`)] : [])]),
    ]),
    section('dates', 'Key dates', [table([{ label: 'Date', w: 1.2 }, { label: 'What happens', w: 5 }], [...dates.map((m) => [fmtDate(m.date), m.name]), ...s.sessions.filter((se) => se.status === 'scheduled' && se.date >= s.today).slice(0, 6).map((se) => [fmtDate(se.date), `Training: ${se.intervention} (${se.location})`])].sort((a, b) => a[0].split('/').reverse().join('').localeCompare(b[0].split('/').reverse().join(''))), { empty: 'No dates scheduled yet.' })]),
    section('messages', 'Key messages and talking points', [
      ...s.keyMessages.filter((k) => k.status === 'approved').slice(0, 8).map((k) => p(`${k.title}: ${k.text}`)),
      ...s.toolkit.filter((t) => t.status === 'published' && t.kind === 'talkingPoints').flatMap((t) => [h(2, t.title), ...rich(t.content)]),
    ]),
    section('training', 'Training your team needs', [table([{ label: 'Training', w: 3 }, { label: 'How', w: 1.4 }, { label: 'Hours', w: 0.8, align: 'r' }, { label: 'When', w: 2.4 }], ivs.filter((iv) => !iv.forChangeRoles).map((iv) => [iv.title, L('trainingModality', iv.modality), fmtNum(iv.durationHours, 1), iv.timing]), { empty: 'No training required.' }), ...s.groups.filter((g) => g.training.applicable).map((g) => p(`${g.name}: ${fmtPct(g.training.pct)} of required training completed so far.`))]),
    section('support', `How to support ${team} through the change`, [
      ...(guidance ? rich(guidance.html, { aiDrafted: guidance.aiDrafted }) : [bullets(['Explain why the change is happening and what it means for each person (Awareness).', 'Listen to concerns and share what is in it for them; raise resistance you cannot resolve (Desire).', 'Release people for training and check they can find job aids (Knowledge).', 'Give time to practise and coach on the job in the first weeks (Ability).', 'Recognise people using the new way of working and stop the old way being used (Reinforcement).'])]),
      ...s.groups.filter((g) => g.barrierPoint && g.barrierPoint !== 'none').map((g) => callout('warn', `${g.name}: barrier point at ${adkarLabel(g.barrierPoint)}`, `Focus your conversations on ${adkarLabel(g.barrierPoint)} first.`)),
      ...s.toolkit.filter((t) => t.status === 'published' && t.kind === 'conversationGuide').flatMap((t) => [h(2, t.title), ...rich(t.content)]),
    ]),
    section('faqs', 'FAQs and where to get help', [...s.faqs.filter((f) => f.published || f.status === 'approved').slice(0, 12).flatMap((f) => [p(f.question, 'strong'), p(f.answer)]), ...s.supports.map((sp) => p(`${L('supportType', sp.kind)}: ${sp.description}${sp.from ? ` (${fmtDate(sp.from)} to ${fmtDate(sp.to)})` : ''}`))]),
  ];
  return { meta: meta('Manager Briefing Pack', { subtitle: mgr ? mgr.name : groupNames, toc: false }), sections: numbered(sections) };
}

function commsPlan(s, c) {
  const { x } = c;
  const comms = s.activities.filter((a) => a.kind === 'communication' && a.status !== 'cancelled');
  const months = uniq(comms.map((a) => monthKey(a.start)).filter(Boolean)).sort();
  const exceptions = comms.filter((a) => a.senderOverridden);
  const sections = [
    X.documentControl(s, { docControl: c.docControl, title: 'Document control' }),
    section('approach', 'Approach', [p(`${comms.length} communications are planned. Business reasons for the change are delivered by the primary sponsor (${s.initiative.primarySponsor || 'to be confirmed'}); personal and role impacts are delivered by each person's direct people manager (RUL-11).`), kv([['Sent', String(comms.filter((a) => a.commsStatus === 'sent').length)], ['Approved or scheduled', String(comms.filter((a) => ['approved', 'scheduled'].includes(a.commsStatus)).length)], ['Awaiting approval', String(comms.filter((a) => a.commsStatus === 'inReview').length)], ['Draft', String(comms.filter((a) => a.commsStatus === 'draft').length)]])]),
    section('plan', 'Communications Plan', [X.commsTable(s, x, comms)]),
    section('calendar', 'Calendar', months.map((mk) => [h(2, X.shortMonth(`${mk}-01`)), table([{ label: 'Date', w: 1.1 }, { label: 'Communication', w: 4 }, { label: 'Sender', w: 1.8 }, { label: 'Channel', w: 1.4 }], sortBy(comms.filter((a) => monthKey(a.start) === mk), 'start').map((a) => [fmtDate(a.start), a.title, a.deliverer, a.channel]), { small: true })]).flat()),
    ...(exceptions.length ? [section('senders', 'Preferred sender exceptions', [table([{ label: 'Communication', w: 4 }, { label: 'Sender', w: 2 }], exceptions.map((a) => [a.title, a.deliverer]), { note: 'These communications are sent by someone other than the preferred sender; the reason is recorded on each item.' })])] : []),
  ];
  return { meta: meta('Communications Plan and Calendar'), sections: numbered(sections) };
}

function keyMessages(s, c) {
  const { x } = c;
  const byAudience = {};
  for (const k of s.keyMessages.filter((y) => y.status === 'approved' || c.params.includeDrafts)) for (const a of k.audience.length ? k.audience : ['All audiences']) (byAudience[a] ||= []).push(k);
  const sections = [
    X.documentControl(s, { docControl: c.docControl, title: 'Document control' }),
    section('messages', 'Key messages', Object.keys(byAudience).length ? Object.entries(byAudience).flatMap(([a, ks]) => [h(2, a), table([{ label: 'Message', w: 2 }, { label: 'Text', w: 5 }, { label: 'ADKAR', w: 1.4 }, { label: 'Version', w: 0.8, align: 'c' }], ks.map((k) => [{ text: k.title, bold: true }, k.text, adkarList(k.adkar), `v${k.version}`]), { small: true })]) : [placeholder('approved key messages')]),
    section('faqs', 'Frequently asked questions', s.faqs.filter((f) => f.status === 'approved' || f.published).flatMap((f) => [p(f.question, 'strong'), p(f.answer || '[Answer to be approved]')])),
  ];
  if (!s.faqs.some((f) => f.status === 'approved' || f.published)) sections[2].blocks.push(p('No approved FAQs yet.'));
  return { meta: meta('Key Messages and FAQs'), sections: numbered(sections) };
}

function trainingPlan(s, c) {
  const { x } = c;
  const sections = [
    X.documentControl(s, { docControl: c.docControl, title: 'Document control' }),
    section('tna', 'Training needs analysis', [table([{ label: 'Group', w: 1.8 }, { label: 'Role', w: 1.4 }, { label: 'Knowledge and skills required', w: 3 }, { label: 'Current', w: 0.8, align: 'c' }, { label: 'Required', w: 0.8, align: 'c' }, { label: 'Gap', w: 0.6, align: 'c' }, { label: 'Priority', w: 0.9 }],
      s.tnas.map((t) => [t.group, t.role, t.requirement, String(t.current ?? '—'), String(t.required ?? '—'), t.gap == null ? '—' : { text: String(t.gap), align: 'c', ...(t.gap >= 2 ? { fill: STATUS.seriousSoft, color: STATUS.seriousInk, bold: true } : {}) }, x.L('priority', t.priority)]), { small: true, empty: 'No training needs recorded.' })]),
    section('interventions', 'Training interventions', [X.trainingTables(s, x)[0], ...(s.interventions.some((iv) => iv.forChangeRoles) ? [] : [callout('warn', 'Change-role training', 'The plan does not yet include training for sponsors and people managers on their roles in the change (TRN-006).')])]),
    section('schedule', 'Schedule', [table([{ label: 'Date', w: 1.1 }, { label: 'Intervention', w: 3 }, { label: 'Location', w: 2 }, { label: 'Trainer', w: 1.6 }, { label: 'Enrolled', w: 0.9, align: 'r' }, { label: 'Completed', w: 0.9, align: 'r' }, { label: 'Status', w: 1 }],
      sortBy(s.sessions, 'date').map((se) => [fmtDate(se.date), se.intervention, se.location, se.trainer, `${se.enrolled}${se.capacity ? `/${se.capacity}` : ''}`, String(se.completed), cap(se.status)]), { small: true, empty: 'No sessions scheduled.' })]),
    section('targets', 'Completion and proficiency', [
      chart('bar', { title: 'Training completion by impacted group', categories: s.groups.filter((g) => g.training.applicable).map((g) => g.name), series: [{ name: 'Completion (%)', values: s.groups.filter((g) => g.training.applicable).map((g) => g.training.pct ?? 0) }], max: 100, min: 0, unit: '%', height: 60 + 30 * s.groups.filter((g) => g.training.applicable).length }),
      X.trainingTables(s, x)[1],
      table([{ label: 'Group', w: 3 }, { label: 'Evidence records', w: 1, align: 'r' }, { label: 'Proficient', w: 1, align: 'r' }], s.proficiency.map((pr) => [pr.group, String(pr.records), `${pr.proficient} (${fmtPct((pr.proficient / pr.records) * 100)})`]), { caption: 'Proficiency evidence', empty: 'No proficiency evidence recorded yet.' }),
    ]),
    section('support', 'Post-training support', [table([{ label: 'Support', w: 1.6 }, { label: 'Description', w: 4 }, { label: 'Groups', w: 2 }, { label: 'From', w: 1 }, { label: 'To', w: 1 }], s.supports.map((sp) => [x.L('supportType', sp.kind), sp.description, sp.groups.join(', ') || 'All', fmtDate(sp.from), fmtDate(sp.to)]), { empty: 'No support arrangements recorded.' })]),
  ];
  return { meta: meta('Training Plan and Training Needs Analysis'), sections: numbered(sections) };
}

function resistancePlan(s, c) {
  const { x } = c;
  const L = x.L;
  const observed = s.resistance.filter((r) => r.kind === 'observed');
  const sections = [
    X.documentControl(s, { docControl: c.docControl, title: 'Document control' }),
    section('anticipated', 'Anticipated resistance and prevention', [...(s.strategy?.anticipatedResistance ? [p(s.strategy.anticipatedResistance)] : []), X.resistancePlanTable(s, x)]),
    section('observed', 'Observed resistance', [
      table([{ label: 'Resistance', w: 2.6 }, { label: 'Source', w: 1.6 }, { label: 'Barrier point', w: 1.1 }, { label: 'Severity', w: 0.9 }, { label: 'Response', w: 3 }, { label: 'Owner', w: 1.2 }, { label: 'Status', w: 1 }],
        observed.map((r) => [r.title, r.source, adkarName(r.barrierPoint), L('severity', r.severity), r.response, r.owner, L('resistanceStatus', r.status)]), { small: true, empty: 'No resistance observed.' }),
      ...(s.hiddenIndividualResistance ? [p(`${s.hiddenIndividualResistance} item(s) about named individuals are sensitive and are not shown (RES-006).`, 'small')] : []),
    ]),
    section('roles', 'Roles and escalation', [bullets(['People managers identify and manage resistance in their teams, with coaching from the change team.', 'The change team analyses root causes and the barrier point behind resistance, and plans responses.', 'The primary sponsor addresses resistance from senior leaders and high-influence stakeholders.', 'High-influence stakeholders who are resistant, or show negative sentiment in two consecutive engagements, are escalated to the relationship owner and change management lead (RUL-12).'])]),
  ];
  return { meta: meta('Resistance Management Plan'), sections: numbered(sections) };
}

function canPlan(s, c) {
  const { x } = c;
  const sections = [
    X.documentControl(s, { docControl: c.docControl, title: 'Document control' }),
    section('network', 'Network structure and coverage', [p(`${s.agents.filter((a) => a.status === 'active').length} active change agents. Target: one agent per ${s.settings.agentHeadcountRatio} people in each impacted group unless the group sets its own target.`), ...X.agentTables(s, x).slice(0, 2)]),
    section('role', 'The change agent role', [uniq(s.agents.map((a) => a.role).filter(Boolean)).length ? bullets(uniq(s.agents.map((a) => a.role).filter(Boolean))) : p('Change agents share information with their teams, surface questions and concerns, support colleagues through the transition and report feedback to the change team.')]),
    section('activities', 'Network activities', [X.agentTables(s, x)[2]]),
    section('feedback', 'What agents are hearing', [table([{ label: 'Theme', w: 3 }, { label: 'Feedback items', w: 1, align: 'r' }], s.feedbackThemes.map((t) => [x.L('feedbackTheme', t.theme), String(t.total)]), { empty: 'No feedback recorded.' })]),
  ];
  return { meta: meta('Change Agent Network Plan'), sections: numbered(sections) };
}

function coalitionPlanDoc(s, c) {
  const { x } = c;
  return { meta: meta('Sponsor Coalition Plan'), sections: numbered([X.documentControl(s, { docControl: c.docControl, title: 'Document control' }), section('coalition', 'Coalition members and alignment actions', X.coalitionPlan(s, x)), section('gaps', 'Sponsorship gaps', [kv([['Sponsorship gaps', s.strategy?.sponsorshipGaps], ['Actions', s.strategy?.sponsorshipActions]])])]) };
}

function riskReport(s, c) {
  const { x } = c;
  const r = s.risk;
  const trend = r.pctTrend.filter((t) => t.date);
  const sections = [
    X.documentControl(s, { docControl: c.docControl, title: 'Document control' }),
    section('profile', 'Change risk profile', [kv([['Risk profile', r.profile ? cap(r.profile) : 'Not assessed'], ['Change characteristics', r.ccScore != null ? `${r.ccScore}/100` : '—'], ['Organisational attributes', r.oaScore != null ? `${r.oaScore}/100` : '—'], ['Recommended approach', r.recommended?.label], ['Selected approach', s.strategy?.approachLabel]]), ...riskAssessmentBlocks(s).slice(1, 3)]),
    section('pct', 'Initiative health over time (PCT)', trend.length ? [
      chart('line', { title: 'PCT health by aspect', categories: trend.map((t) => fmtDate(t.date)), series: Object.keys(PCT).map((k, i) => ({ name: PCT[k], values: trend.map((t) => t.aspects?.[k] ?? null), color: SERIES[i] })), max: 100, min: 0 }),
      table([{ label: 'Date', w: 1.2 }, ...Object.values(PCT).map((l) => ({ label: l, w: 1.4, align: 'c' })), { label: 'Overall', w: 1, align: 'c' }], trend.map((t) => [fmtDate(t.date), ...Object.keys(PCT).map((k) => String(t.aspects?.[k] ?? '—')), String(t.overall ?? '—')]), { small: true }),
    ] : [p('No PCT assessment has been completed.')]),
    section('focus', 'Focus areas', r.focus.length ? [table([{ label: 'Focus area', w: 2 }, { label: 'Suggested action', w: 5 }, { label: 'Evidence', w: 2 }], r.focus.map((f) => [f.title, f.text, f.evidence]))] : [p('No focus areas are suggested by the latest assessments.')]),
    section('risks', 'Change risks and issues', [X.risksTable(s, { limit: 50, caption: 'Open change risks and issues' })]),
  ];
  return { meta: meta('Change Risk and PCT Assessment Report'), sections: numbered(sections) };
}

function adkarReport(s, c) {
  const { x } = c;
  const t = s.settings.adkarThreshold;
  const sections = [
    X.documentControl(s, { docControl: c.docControl, title: 'Document control' }),
    section('results', 'Results and barrier points', [X.adkarResultsTable(s), ...s.groups.filter((g) => g.barrierPoint && g.barrierPoint !== 'none').map((g) => p(`${g.name}: barrier point at ${adkarLabel(g.barrierPoint)}${g.barrierChanged ? ' (changed since the previous result)' : ''}.`))]),
    section('trends', 'Trends by group', s.groups.filter((g) => g.adkarHistory.length > 1).flatMap((g) => [h(2, g.name), chart('line', { title: `${g.name}: ADKAR scores over time`, categories: g.adkarHistory.map((r) => fmtDate(r.date)), series: ADKAR.map((a, i) => ({ name: a.label, values: g.adkarHistory.map((r) => r.scores?.[a.id] ?? null), color: SERIES[i] })), min: 1, max: 5, threshold: { value: t, label: 'Threshold' }, height: 230 })])
      .concat(s.groups.some((g) => g.adkarHistory.length > 1) ? [] : [p('Trends appear once a group has been assessed more than once.')])),
    section('surveys', 'Self-assessment campaigns', [table([{ label: 'Campaign', w: 3 }, { label: 'Status', w: 1 }, { label: 'Responses', w: 1, align: 'r' }, { label: 'Response rate', w: 1.2, align: 'r' }, { label: 'Groups', w: 3 }], s.surveys.filter((y) => y.kind === 'adkar').map((y) => [y.title, cap(y.status), String(y.responses), y.responseRate != null ? `${y.responseRate}% (target ${y.responseTarget}%)` : '—', y.groups.join(', ')]), { empty: 'No campaigns.' })]),
    ...(s.includeSensitive && s.individualAdkar.length ? [section('individuals', 'Individual assessments', [callout('warn', 'Sensitive', 'Individual ADKAR scores are sensitive personal information. Handle in accordance with the classification marking.'), table([{ label: 'Person', w: 2.4 }, { label: 'Date', w: 1.1 }, ...ADKAR.map((a) => ({ label: a.label, w: 1, align: 'c' }))], s.individualAdkar.map((r) => [r.name, fmtDate(r.date), ...ADKAR_IDS.map((el) => score(r.scores[el]))]), { small: true })])] : []),
  ];
  return { meta: meta('ADKAR Assessment Report'), sections: numbered(sections) };
}

function readinessReport(s, c) {
  const { x } = c;
  const sections = [
    X.documentControl(s, { docControl: c.docControl, title: 'Document control' }),
    section('recommendation', 'Recommendation', [...(x.narrative('readinessCommentary') ? rich(x.narrative('readinessCommentary').html, { aiDrafted: x.narrative('readinessCommentary').aiDrafted }) : []), ...X.readinessCriteria(s, x)]),
    section('groups', 'Readiness by impacted group', [X.readinessByGroupChart(s), X.readinessTrendChart(s), table([{ label: 'Group', w: 3 }, { label: 'Index', w: 0.8, align: 'c' }, { label: 'Status', w: 1.1 }, { label: 'Barrier point', w: 1.4 }, { label: 'ADKAR average', w: 1.1, align: 'c' }, { label: 'Training', w: 1, align: 'r' }],
      s.groups.map((g) => [g.name, String(g.readiness.index ?? '—'), g.rag ? { text: RAG[g.rag].label, fill: RAG[g.rag].fill, color: RAG[g.rag].color } : 'No data', adkarName(g.barrierPoint) || 'Not assessed', score(g.adkarMean), fmtPct(g.training.pct)]), { small: true })]),
    section('adkar', 'ADKAR status', [X.adkarResultsTable(s)]),
    section('training', 'Training completion', X.trainingTables(s, x).slice(1)),
    section('measures', 'Adoption measures', [table([{ label: 'Measure', w: 3 }, { label: 'Latest', w: 1, align: 'r' }, { label: 'Target', w: 1, align: 'r' }, { label: 'Status', w: 1.2 }], s.measures.map((m) => [m.name, m.latest != null ? `${fmtNum(m.latest, 2)}${m.unit}` : '—', `${fmtNum(m.target, 2)}${m.unit}`, { onTrack: 'On track', atRisk: 'At risk', offTrack: 'Off track', noData: 'No data' }[m.status]]), { small: true })]),
  ];
  return { meta: meta('Readiness Report'), sections: numbered(sections) };
}

function changeOnAPage(s, c) {
  const { x } = c;
  const L = x.L;
  return {
    meta: meta('Change on a Page', { toc: false, compact: true }),
    sections: [section('page', s.initiative.name, [
      kv([
        ['Why', truncate(plain(s.initiative.reasonForChange || s.initiative.businessDrivers || s.initiative.description), 450)],
        ['What is changing', truncate(plain(s.initiative.whatIsChanging), 450)],
        ['Who is affected', `${s.groups.length} groups, ${fmtNum(s.kpis.headcount)} people: ${s.groups.map((g) => `${g.name}${g.high ? ' (high impact)' : ''}`).join('; ')}`],
        ['When', s.milestones.filter((m) => ['release', 'goLive', 'wave'].includes(m.kind)).map((m) => `${m.name}: ${fmtDate(m.date)}`).join('; ')],
        ['How people will be supported', [s.plans.filter((pl) => pl.selected).map((pl) => pl.label).join(', '), s.supports.map((sp) => L('supportType', sp.kind)).join(', ')].filter(Boolean).join('. ')],
        ['How success will be measured', s.measures.slice(0, 5).map((m) => `${m.name} (target ${fmtNum(m.target, 2)}${m.unit})`).join('; ')],
        ['Sponsor', s.initiative.primarySponsor],
      ]),
    ])],
  };
}

function steeringPackDoc(s, c) {
  const { x } = c;
  const sections = [
    X.documentControl(s, { docControl: c.docControl, title: 'Document control' }),
    section('status', 'Overall status and key messages', [kv([['Overall status', s.kpis.overallRag ? RAG[s.kpis.overallRag].label : 'Not rated'], ['Plan progress', `${s.kpis.activitiesComplete} of ${s.kpis.activitiesTotal} activities complete, ${s.kpis.activitiesOverdue} overdue`], ['Readiness', s.kpis.readinessAvg != null ? `Average index ${s.kpis.readinessAvg}; ${s.kpis.barrierGroups} groups with a barrier point` : 'Not yet measured'], ['Engagement', s.kpis.engagementCoverage != null ? `${s.kpis.engagementCoverage}% within cadence` : '—']]), ...(x.narrative('statusCommentary') ? rich(x.narrative('statusCommentary').html) : [])]),
    section('progress', 'Progress against plan', [table([{ label: 'Plan', w: 3 }, { label: 'Activities', w: 1, align: 'r' }, { label: 'Complete', w: 1, align: 'r' }, { label: 'Overdue', w: 1, align: 'r' }, { label: 'Average progress', w: 1.3, align: 'r' }], s.progress.byPlan.map((y) => [y.label, String(y.total), String(y.complete), String(y.overdue), fmtPct(y.pct)]))]),
    section('readiness', 'Readiness and ADKAR', [X.adkarResultsTable(s)]),
    section('risks', 'Top risks and resistance', [X.risksTable(s, { limit: 6 })]),
    section('decisions', 'Decisions and support required', x.narrative('decisionsRequired') ? rich(x.narrative('decisionsRequired').html) : [p('No decisions required.')]),
    section('next', 'Priorities for the next period', x.narrative('nextPeriod') ? rich(x.narrative('nextPeriod').html) : [bullets(x.acts((a) => a.status !== 'complete' && a.start && a.start <= addDays(s.today, 28)).slice(0, 8).map((a) => `${a.title} (${fmtDate(a.start)})`))]),
  ];
  return { meta: meta('Steering Committee Pack'), sections: numbered(sections) };
}

function sustainmentPlan(s, c) {
  const { x } = c;
  const covered = new Set(s.sustainment.map((m) => m.mechanism));
  const missing = Object.entries(s.lists.sustainmentMechanism || {}).filter(([k]) => !covered.has(k)).map(([, l]) => l);
  const sections = [
    X.documentControl(s, { docControl: c.docControl, title: 'Document control' }),
    section('mechanisms', 'Reinforcement mechanisms', [X.sustainmentTable(s, x), ...(missing.length ? [p(`Mechanisms not yet in the plan: ${missing.join(', ').toLowerCase()}.`, 'small')] : [])]),
    section('owners', 'Sustainment owners', [table([{ label: 'Group', w: 3 }, { label: 'Sustainment owner', w: 2 }], s.groups.map((g) => [g.name, g.sustainmentOwner || { text: 'Not nominated', color: STATUS.warningInk }])), table([{ label: 'Measure', w: 3 }, { label: 'Sustainment owner', w: 2 }, { label: 'Tracked after closeout', w: 1.4 }], s.measures.map((m) => [m.name, m.sustainmentOwner || { text: 'Not nominated', color: STATUS.warningInk }, m.postCloseoutMonths ? `${m.postCloseoutMonths} months` : 'No']))]),
  ];
  return { meta: meta('Sustainment Plan'), sections: numbered(sections) };
}

function handoverChecklist(s, c) {
  return { meta: meta('Handover Checklist', { toc: false }), sections: numbered([X.documentControl(s, { docControl: c.docControl, title: 'Document control' }), section('checklist', 'Handover checklist', [p(`${s.handover.filter((ho) => ho.status === 'accepted').length} of ${s.handover.length} items accepted.`), handoverTable(s)])]) };
}

function lessonsReport(s, c) {
  return { meta: meta('Lessons Learned Report'), sections: numbered([X.documentControl(s, { docControl: c.docControl, title: 'Document control' }), section('lessons', 'Lessons by category', lessonsBlocks(s, c.x))]) };
}

export const DOCUMENTS = {
  strategy, masterPlan, blueprint, impactAssessment, stakeholderPlan, engagementReport, engagementBrief, sponsorPack, managerBriefing, commsPlan, keyMessages, trainingPlan,
  resistancePlan, canPlan, coalitionPlan: coalitionPlanDoc, riskReport, adkarReport, readinessReport, steeringPack: steeringPackDoc, changeOnAPage, sustainmentPlan, handoverChecklist, lessonsReport, closeout,
};

export function buildDocument(s, artefactType, ctx) {
  const fn = DOCUMENTS[artefactType];
  if (!fn) throw new Error(`No document builder for ${artefactType}.`);
  const x = X.helpers(s);
  return fn(s, { ...ctx, x });
}

