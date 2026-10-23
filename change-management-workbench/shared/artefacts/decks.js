// Presentation builders (PowerPoint, and PDF for the decks that are presentations first) with the slide
// structures of Section 8.6, Table 13. Slides are { layout: 'title' | 'section' | 'content', title,
// subtitle, body: [elements], notes }; body elements are bullets, p, kpis, table, chart, callout and cols
// (side-by-side columns of elements).
import { ADKAR, ADKAR_IDS, adkarLabel } from '../refdata.js';
import { addDays, monthKey, periodRange, addMonths } from '../dates.js';
import { asArray, sortBy, uniq, truncate } from '../util.js';
import { table, chart, callout, plain, fmtDate, fmtNum, fmtPct, score, SERIES, STATUS, RAG, adkarFill, adkarInk, impactFill, impactInk } from './ir.js';
import * as X from './sections.js';

const bullets = (items) => ({ t: 'bullets', items: items.filter(Boolean).map(String) });
const para = (text, style) => ({ t: 'p', text: String(text ?? ''), ...(style ? { style } : {}) });
const kpis = (items) => ({ t: 'kpis', items });
const cols = (...c) => ({ t: 'cols', cols: c });
const slide = (title, body, notes) => ({ layout: 'content', title, body: body.filter(Boolean), notes: notes || '' });
const titleSlide = (s, c, subtitle) => ({ layout: 'title', title: c.docControl?.title || '', subtitle: subtitle || s.initiative.name });
const ragTone = (r) => ({ green: 'good', amber: 'warning', red: 'critical' }[r] || '');
const textOf = (html, n = 400) => truncate(plain(html), n);

function adkarHeat(s, limit = 9) {
  const t = s.settings.adkarThreshold;
  return table([{ label: 'Group', w: 3 }, ...ADKAR.map((a) => ({ label: a.label, w: 1, align: 'c' })), { label: 'Barrier point', w: 1.5 }],
    s.groups.slice(0, limit).map((g) => [g.name, ...ADKAR_IDS.map((el) => { const v = g.adkar?.scores?.[el]; return v == null ? { text: '—', align: 'c' } : { text: score(v), fill: adkarFill(v, t), color: adkarInk(v, t), align: 'c' }; }), g.barrierPoint ? (g.barrierPoint === 'none' ? { text: 'None', fill: STATUS.goodSoft, color: STATUS.goodInk } : { text: adkarLabel(g.barrierPoint), fill: STATUS.criticalSoft, color: STATUS.criticalInk, bold: true }) : 'Not assessed']));
}
function readinessChart(s) {
  const gs = s.groups.filter((g) => g.readiness.index != null);
  return gs.length ? chart('bar', { title: 'Readiness index by group', categories: gs.map((g) => g.name), series: [{ name: 'Readiness index', values: gs.map((g) => g.readiness.index) }], max: 100, min: 0, threshold: { value: s.settings.readinessThreshold, label: 'Threshold' } }) : para('No readiness index yet.', 'muted');
}
function riskTable(s, n = 5) {
  return table([{ label: 'Risk or issue', w: 4 }, { label: 'Rating', w: 1 }, { label: 'Owner', w: 1.4 }],
    sortBy(s.risks.filter((r) => r.status !== 'closed'), (r) => ['extreme', 'high', 'medium', 'low'].indexOf(r.rating)).slice(0, n).map((r) => [r.title, r.rating ? { text: X.cap(r.rating), bold: true, color: { extreme: STATUS.criticalInk, high: STATUS.seriousInk, medium: STATUS.warningInk, low: STATUS.goodInk }[r.rating] } : '—', r.owner]));
}
const narrativeBullets = (s, key, fallback) => {
  const n = s.narratives?.[key];
  if (!n) return fallback;
  const lines = plain(n.html).split(/\n+/).map((l) => l.replace(/^•\s*/, '').trim()).filter(Boolean);
  return bullets(lines.slice(0, 7));
};

function steeringPack(s, c) {
  const x = c.x;
  const k = s.kpis;
  const status = k.overallRag ? RAG[k.overallRag].label : 'Not rated';
  const periods = periodRange(addMonths(s.today, -4), addMonths(s.today, 1), 'month');
  const live = s.engagements.filter((e) => e.status !== 'cancelled');
  const next = x.acts((a) => a.status !== 'complete' && a.start && a.start <= addDays(s.today, 28)).slice(0, 7);
  return {
    meta: { title: 'Steering Committee Pack' },
    slides: [
      titleSlide(s, c, `${s.initiative.name} · ${fmtDate(s.today)}`),
      slide('Overall status and key messages', [
        kpis([{ label: 'Overall status', value: status, tone: ragTone(k.overallRag) }, { label: 'Plan progress', value: `${k.activitiesComplete}/${k.activitiesTotal}`, sub: `${k.activitiesOverdue} overdue`, tone: k.activitiesOverdue ? 'warning' : '' }, { label: 'Average readiness', value: k.readinessAvg ?? '—', sub: `${k.barrierGroups} groups with a barrier point` }, { label: 'Engaged within cadence', value: k.engagementCoverage != null ? `${k.engagementCoverage}%` : '—', sub: `${k.outsideCadence} outside cadence` }]),
        narrativeBullets(s, 'statusCommentary', bullets([`Current stage: ${s.stages?.current || '—'} (${s.stages?.currentPhase || ''}).`, `${k.highRisks} high or extreme change risks are open.`, `${k.openResistance} resistance items are open.`])),
      ]),
      slide('Progress against plan', [
        chart('stacked', { title: 'Activities by plan', categories: s.progress.byPlan.map((p) => p.label), series: [{ name: 'Complete', values: s.progress.byPlan.map((p) => p.complete), color: SERIES[2] }, { name: 'In progress', values: s.progress.byPlan.map((p) => p.inProgress), color: SERIES[0] }, { name: 'Not started', values: s.progress.byPlan.map((p) => Math.max(0, p.total - p.complete - p.inProgress)), color: 'B9C0CA' }] }),
        para(`${s.progress.overall.complete} of ${s.progress.overall.total} activities complete; ${s.progress.overall.overdue} overdue.`, 'muted'),
      ]),
      slide('Readiness and ADKAR', [cols([adkarHeat(s)], [readinessChart(s)])]),
      slide('Stakeholder engagement coverage and sentiment', [
        cols([
          chart('column', { title: 'Planned and completed engagements', categories: periods.map((p) => X.shortMonth(p.start)), series: [{ name: 'Planned', values: periods.map((p) => live.filter((e) => e.plannedDate && monthKey(e.plannedDate) === p.key).length), color: SERIES[0] }, { name: 'Completed', values: periods.map((p) => live.filter((e) => e.done && e.actualDate && monthKey(e.actualDate) === p.key).length), color: SERIES[1] }], numberFormat: '0' }),
        ], [
          kpis([{ label: 'Within cadence', value: k.engagementCoverage != null ? `${k.engagementCoverage}%` : '—' }, { label: 'Priority stakeholders', value: k.priorityStakeholders }]),
          s.includeSensitive ? para('Sentiment is summarised in the Stakeholder Engagement Report.', 'muted') : para('Sentiment is sensitive and is reported separately.', 'muted'),
          bullets(sortBy(s.profiles.filter((p) => p.cadenceOverdue && p.isPriority), 'lastEngaged').slice(0, 4).map((p) => `${p.name}: last engaged ${fmtDate(p.lastEngaged) || 'never'}`)),
        ]),
      ]),
      slide('Top risks and resistance', [cols([riskTable(s, 6)], [kpis([{ label: 'Open resistance', value: k.openResistance }, { label: 'High or extreme risks', value: k.highRisks, tone: k.highRisks ? 'critical' : '' }]), bullets(s.resistance.filter((r) => r.kind === 'observed' && ['open', 'escalated'].includes(r.status)).slice(0, 4).map((r) => `${r.title} (${r.group || r.source})`))])]),
      slide('Decisions and support required', [narrativeBullets(s, 'decisionsRequired', para('No decisions are required at this meeting.', 'muted'))]),
      slide('Priorities for the next period', [narrativeBullets(s, 'nextPeriod', bullets(next.map((a) => `${a.title} (${fmtDate(a.start)})`)))]),
    ],
  };
}

function sponsorPack(s, c) {
  const x = c.x;
  const msgs = s.keyMessages.filter((k) => k.status === 'approved' && (k.focus === 'businessReasons' || k.focus === 'progress' || k.roles.includes('sponsor'))).slice(0, 5);
  const todo = x.acts((a) => (a.plans.includes('sponsor') || a.plans.includes('sponsorCoalition')) && a.status !== 'complete').slice(0, 6);
  const faqs = s.faqs.filter((f) => f.status === 'approved').slice(0, 4);
  return {
    meta: { title: 'Sponsor Briefing Pack' },
    slides: [
      titleSlide(s, c, `${s.initiative.primarySponsor ? `For ${s.initiative.primarySponsor} · ` : ''}${s.initiative.name}`),
      slide('Purpose of this briefing', [bullets(['Where the change is up to and how ready people are', 'The messages we need you to deliver', 'What we are asking you to do in the coming weeks', 'Questions you are likely to be asked'])]),
      slide('The case for change in brief', [para(textOf(s.initiative.reasonForChange || s.initiative.businessDrivers || s.initiative.description, 600)), ...(s.initiative.riskOfNotChanging ? [callout('warn', 'If we do not change', textOf(s.initiative.riskOfNotChanging, 300))] : [])]),
      slide('Current readiness and barrier points', [cols([adkarHeat(s, 8)], [readinessChart(s)])]),
      slide('Key messages for you to deliver', msgs.length ? [bullets(msgs.map((k) => `${k.title}: ${truncate(k.text, 180)}`))] : [para('No approved sponsor messages yet.', 'muted')], msgs.map((k) => `${k.title}: ${k.text}`).join('\n')),
      slide('Requested sponsor actions and upcoming events', [table([{ label: 'Action', w: 4 }, { label: 'When', w: 1.6 }, { label: 'Status', w: 1.2 }], todo.map((a) => [a.title, x.when(a), x.statusCell(a)]))]),
      slide('Anticipated questions and suggested responses', faqs.length ? [bullets(faqs.map((f) => `${f.question} ${truncate(f.answer, 160)}`))] : [para('No approved FAQs yet.', 'muted')], faqs.map((f) => `${f.question}\n${f.answer}`).join('\n\n')),
    ],
  };
}

function managerBriefing(s, c) {
  const x = c.x;
  const L = x.L;
  const mgr = s.manager;
  const impacts = sortBy(s.impacts.filter((i) => (i.degree || 0) >= 2), (i) => -(i.degree || 0)).slice(0, 7);
  const dates = [...s.milestones.filter((m) => m.date >= s.today).slice(0, 4).map((m) => [fmtDate(m.date), m.name]), ...s.sessions.filter((se) => se.status === 'scheduled' && se.date >= s.today).slice(0, 4).map((se) => [fmtDate(se.date), `Training: ${se.intervention}`])];
  const talking = s.toolkit.filter((t) => t.status === 'published' && t.kind === 'talkingPoints');
  return {
    meta: { title: 'Manager Briefing Pack' },
    slides: [
      titleSlide(s, c, mgr ? `For ${mgr.name}${mgr.position ? `, ${mgr.position}` : ''}` : s.groups.map((g) => g.name).join(', ')),
      slide('What is changing for your team', [table([{ label: 'What changes', w: 1.4 }, { label: 'Group', w: 1.6 }, { label: 'What it means', w: 4 }, { label: 'Impact', w: 0.8, align: 'c' }], impacts.map((i) => [L('impactAspect', i.aspect), x.groupName(i.groupId), truncate(i.futureState || i.description, 140), { text: String(i.degree ?? '—'), fill: impactFill(i.degree), color: impactInk(i.degree), align: 'c' }]))]),
      slide('Key dates', [table([{ label: 'Date', w: 1.2 }, { label: 'What happens', w: 5 }], dates)]),
      slide('Key messages and talking points', [bullets(s.keyMessages.filter((k) => k.status === 'approved').slice(0, 6).map((k) => `${k.title}: ${truncate(k.text, 150)}`))], talking.map((t) => `${t.title}\n${plain(t.content)}`).join('\n\n')),
      slide('Training your team needs', [table([{ label: 'Training', w: 3 }, { label: 'How', w: 1.4 }, { label: 'Hours', w: 0.8, align: 'r' }, { label: 'When', w: 2.2 }], s.interventions.filter((iv) => !iv.forChangeRoles).slice(0, 7).map((iv) => [iv.title, L('trainingModality', iv.modality), fmtNum(iv.durationHours, 1), iv.timing])), para(s.groups.filter((g) => g.training.applicable).map((g) => `${g.name}: ${fmtPct(g.training.pct)} complete`).join(' · '), 'muted')]),
      slide('How to support your team through the change', [
        narrativeBullets(s, 'managerGuidance', bullets(['Explain why the change is happening and what it means for each person', 'Listen to concerns; share what is in it for them; raise resistance you cannot resolve', 'Release people for training and check they can find job aids', 'Give time to practise and coach on the job in the first weeks', 'Recognise people using the new way of working'])),
        ...s.groups.filter((g) => g.barrierPoint && g.barrierPoint !== 'none').slice(0, 2).map((g) => callout('warn', `${g.name}`, `Barrier point at ${adkarLabel(g.barrierPoint)}: focus your conversations there first.`)),
      ]),
      slide('FAQs and where to get help', [cols([bullets(s.faqs.filter((f) => f.published || f.status === 'approved').slice(0, 5).map((f) => f.question))], [bullets(s.supports.slice(0, 5).map((sp) => `${L('supportType', sp.kind)}: ${truncate(sp.description, 90)}`))])], s.faqs.filter((f) => f.published || f.status === 'approved').slice(0, 8).map((f) => `${f.question}\n${f.answer}`).join('\n\n')),
    ],
  };
}

function changeOnAPage(s, c) {
  const x = c.x;
  const L = x.L;
  const when = s.milestones.filter((m) => ['release', 'goLive', 'wave'].includes(m.kind)).slice(0, 4);
  return {
    meta: { title: 'Change on a Page' },
    slides: [{
      layout: 'content', title: `${s.initiative.name}: change on a page`,
      body: [cols(
        [para('Why', 'strong'), para(textOf(s.initiative.reasonForChange || s.initiative.businessDrivers || s.initiative.description, 320)), para('What is changing', 'strong'), para(textOf(s.initiative.whatIsChanging, 320))],
        [para('Who is affected', 'strong'), bullets(sortBy(s.groups, (g) => -(g.overall || 0)).slice(0, 5).map((g) => `${g.name} (${fmtNum(g.headcount)}${g.high ? ', high impact' : ''})`)), para('When', 'strong'), bullets(when.map((m) => `${m.name}: ${fmtDate(m.date)}`))],
        [para('How people will be supported', 'strong'), bullets([...s.plans.filter((pl) => pl.selected && pl.category === 'core').map((pl) => pl.label), ...uniq(s.supports.map((sp) => L('supportType', sp.kind)))].slice(0, 6)), para('How success will be measured', 'strong'), bullets(s.measures.slice(0, 4).map((m) => `${m.name}: ${fmtNum(m.target, 2)}${m.unit}`))],
      )],
      notes: `Sponsor: ${s.initiative.primarySponsor || 'to be confirmed'}. Change management lead: ${s.initiative.changeLead || ''}.`,
    }],
  };
}

function summaryDeck(title, slides) {
  return (s, c) => ({ meta: { title }, slides: [titleSlide(s, c), ...slides(s, c).filter(Boolean)] });
}

const strategy = summaryDeck('Change Management Strategy (summary)', (s) => [
  slide('The change', [para(textOf(s.strategy?.summary || s.initiative.description, 600)), kpis([{ label: 'Impacted groups', value: s.groups.length }, { label: 'People affected', value: fmtNum(s.kpis.headcount) }, { label: 'Highly impacted groups', value: s.kpis.highImpactGroups }, { label: 'Risk profile', value: s.risk.profile ? X.cap(s.risk.profile) : '—', tone: s.risk.profile === 'high' ? 'critical' : s.risk.profile === 'medium' ? 'warning' : '' }])]),
  slide('Change risk and approach', [cols([kpis([{ label: 'Change characteristics', value: s.risk.ccScore ?? '—' }, { label: 'Organisational attributes', value: s.risk.oaScore ?? '—' }]), para(`Recommended approach: ${s.risk.recommended?.label || '—'}. Selected: ${s.strategy?.approachLabel || '—'}.`)], [bullets(s.plans.filter((p) => p.selected).map((p) => p.label))])]),
  slide('Who is affected', [table([{ label: 'Impacted group', w: 3 }, { label: 'People', w: 1, align: 'r' }, { label: 'Overall impact', w: 1, align: 'c' }], s.groups.slice(0, 10).map((g) => [g.name, fmtNum(g.headcount), { text: String(g.overall ?? '—'), fill: impactFill(g.overall), color: impactInk(g.overall), align: 'c' }]))]),
  slide('Sponsorship and governance', [cols([para(`Primary sponsor: ${s.initiative.primarySponsor || 'to be confirmed'}`, 'strong'), bullets(s.coalition.slice(0, 5).map((m) => `${m.name}: ${m.area}`))], [bullets(asArray(s.strategy?.governance).slice(0, 5).map((g) => `${g.name} (${g.frequency})`))])]),
  s.strategy?.anticipatedResistance ? slide('Anticipated resistance and special tactics', [para(truncate(s.strategy.anticipatedResistance, 500)), ...(s.strategy.specialTactics ? [callout('info', 'Special tactics', truncate(s.strategy.specialTactics, 400))] : [])]) : null,
]);

const masterPlan = summaryDeck('Master Change Management Plan (summary)', (s) => [
  slide('Plan on a page', [kpis([{ label: 'Activities', value: s.kpis.activitiesTotal }, { label: 'Complete', value: s.kpis.activitiesComplete }, { label: 'Overdue', value: s.kpis.activitiesOverdue, tone: s.kpis.activitiesOverdue ? 'warning' : '' }, { label: 'Readiness', value: s.kpis.readinessAvg ?? '—' }]), bullets(s.plans.filter((p) => p.selected).map((p) => `${p.label}: ${s.activities.filter((a) => a.plans.includes(p.id)).length} activities`))]),
  slide('Where groups are on the ADKAR Model', [adkarHeat(s)]),
  slide('Actions by ADKAR element', [table([{ label: 'Element', w: 1.6 }, { label: 'Activities', w: 1, align: 'r' }, { label: 'Complete', w: 1, align: 'r' }, { label: 'Overdue', w: 1, align: 'r' }, { label: 'Groups with this barrier point', w: 3 }], ADKAR.map((el) => { const e = s.progress.byElement.find((y) => y.element === el.id) || {}; return [el.label, String(e.total || 0), String(e.complete || 0), String(e.overdue || 0), s.groups.filter((g) => g.barrierPoint === el.id).map((g) => g.name).join(', ') || '—']; }))]),
  slide('Integrated timeline', [table([{ label: 'Milestone', w: 4 }, { label: 'Date', w: 1.2 }, { label: 'Change activities linked', w: 1.4, align: 'r' }], s.milestones.slice(0, 9).map((m) => [m.name, fmtDate(m.date), String(s.activities.filter((a) => a.milestone === m.name).length)]))]),
  slide('Readiness and risks', [cols([readinessChart(s)], [riskTable(s, 5)])]),
]);

const closeout = summaryDeck('Change Management Closeout (summary)', (s) => [
  slide('Result', [kpis([{ label: 'Overall result', value: s.closeout?.overallRag ? RAG[s.closeout.overallRag].label : 'Not rated', tone: ragTone(s.closeout?.overallRag) }, { label: 'Measures meeting target', value: `${s.measures.filter((m) => m.status === 'onTrack').length}/${s.measures.length}` }, { label: 'Handover accepted', value: `${s.handover.filter((h) => h.status === 'accepted').length}/${s.handover.length}` }]), para(textOf(s.closeout?.performanceSummary, 600))]),
  slide('Performance against success measures', [table([{ label: 'Measure', w: 3.5 }, { label: 'Actual', w: 1, align: 'r' }, { label: 'Target', w: 1, align: 'r' }, { label: 'Result', w: 1.2 }], s.measures.slice(0, 9).map((m) => [m.name, m.latest != null ? `${fmtNum(m.latest, 2)}${m.unit}` : '—', `${fmtNum(m.target, 2)}${m.unit}`, m.status === 'onTrack' ? { text: 'Met', fill: STATUS.goodSoft, color: STATUS.goodInk } : { text: 'Not met', fill: STATUS.warningSoft, color: STATUS.warningInk }]))]),
  slide('Sustainment and handover', [cols([bullets(s.sustainment.slice(0, 6).map((m) => `${X.cap(m.status)}: ${truncate(m.description, 90)}`))], [bullets(s.handover.slice(0, 6).map((h) => `${h.item} (${h.status})`))])]),
  slide('Lessons and recommendations', [bullets(s.lessons.slice(0, 6).map((l) => `${l.title}: ${truncate(l.recommendation, 120)}`)), ...(s.closeout?.recommendations ? [callout('info', 'Recommendations', truncate(s.closeout.recommendations, 400))] : [])]),
]);

const impactAssessment = summaryDeck('Change Impact Assessment (summary)', (s, c) => [
  slide('Who is affected', [kpis([{ label: 'Impacted groups', value: s.groups.length }, { label: 'People', value: fmtNum(s.kpis.headcount) }, { label: 'Highly impacted', value: s.kpis.highImpactGroups }]), table([{ label: 'Group', w: 3 }, { label: 'People', w: 1, align: 'r' }, { label: 'Overall', w: 0.8, align: 'c' }, { label: 'Main impacts', w: 4 }], s.groups.slice(0, 8).map((g) => [g.name, fmtNum(g.headcount), { text: String(g.overall ?? '—'), fill: impactFill(g.overall), color: impactInk(g.overall), align: 'c' }, sortBy(s.impacts.filter((i) => i.groupId === g.id), (i) => -(i.degree || 0)).slice(0, 3).map((i) => c.x.L('impactAspect', i.aspect)).join(', ')]))]),
  slide('Impact heatmap', [X.impactHeatmapTable(s, c.x)]),
  slide('When impacts are felt', [X.impactTimelineTable(s)]),
]);

const blueprint = summaryDeck('ADKAR Blueprint', (s) => {
  const b = s.blueprints[0];
  if (!b) return [slide('ADKAR Blueprint', [para('No Blueprint recorded.', 'muted')])];
  return [slide(b.name, [table([{ label: 'Element', w: 1.2 }, { label: 'Desired outcome', w: 3 }, { label: 'Barriers', w: 2.4 }, { label: 'Measures', w: 2.2 }], ADKAR.map((el) => [{ text: el.label, bold: true }, truncate(b.elements?.[el.id]?.desiredOutcome || '', 160), truncate(b.elements?.[el.id]?.barriers || '', 120), truncate(b.elements?.[el.id]?.measures || '', 110)]))]),
    ...ADKAR.map((el) => slide(`${el.label}`, [para(b.elements?.[el.id]?.desiredOutcome || 'No desired outcome recorded.'), cols([para('Indicators', 'strong'), para(b.elements?.[el.id]?.indicators || '—'), para('Barriers', 'strong'), para(b.elements?.[el.id]?.barriers || '—')], [para('Root causes', 'strong'), para(b.elements?.[el.id]?.rootCauses || '—'), para('Measures', 'strong'), para(b.elements?.[el.id]?.measures || '—')])]))];
});

const adkarReport = summaryDeck('ADKAR Assessment Report', (s) => [
  slide('Results and barrier points', [adkarHeat(s)]),
  ...s.groups.filter((g) => g.adkarHistory.length > 1).slice(0, 4).map((g) => slide(`${g.name}: trend`, [chart('line', { title: 'ADKAR scores over time', categories: g.adkarHistory.map((r) => fmtDate(r.date)), series: ADKAR.map((a, i) => ({ name: a.label, values: g.adkarHistory.map((r) => r.scores?.[a.id] ?? null), color: SERIES[i] })), min: 1, max: 5, threshold: { value: s.settings.adkarThreshold, label: 'Threshold' } })])),
]);

const readinessReport = summaryDeck('Readiness Report', (s, c) => [
  slide('Recommendation', [kpis([{ label: 'Criteria met', value: s.readiness?.score != null ? `${s.readiness.score}%` : '—' }, { label: 'Recommendation', value: s.readiness?.recommendation ? c.x.L('goNoGo', s.readiness.recommendation) : '—', tone: s.readiness?.recommendation === 'go' ? 'good' : s.readiness?.recommendation === 'noGo' ? 'critical' : 'warning' }, { label: 'Average readiness', value: s.kpis.readinessAvg ?? '—' }]), bullets(asArray(s.readiness?.reasons).slice(0, 6))]),
  slide('Readiness by group', [cols([readinessChart(s)], [adkarHeat(s, 8)])]),
  s.readiness ? slide('Readiness criteria', [table([{ label: 'Criterion', w: 4 }, { label: 'Owner', w: 1.4 }, { label: 'Status', w: 1.2 }], s.readiness.items.slice(0, 10).map((i) => [i.criterion, i.owner, i.status ? { text: c.x.L('readinessStatus', i.status), ...({ met: { fill: STATUS.goodSoft, color: STATUS.goodInk }, partlyMet: { fill: STATUS.warningSoft, color: STATUS.warningInk }, notMet: { fill: STATUS.criticalSoft, color: STATUS.criticalInk } }[i.status] || {}) } : '—']))]) : null,
]);

export const DECKS = { steeringPack, sponsorPack, managerBriefing, changeOnAPage, strategy, masterPlan, closeout, impactAssessment, blueprint, adkarReport, readinessReport };
// Presentations whose PDF is the deck itself rather than the document.
export const DECK_FIRST = new Set(['steeringPack', 'changeOnAPage']);

export function buildDeck(s, artefactType, ctx) {
  const fn = DECKS[artefactType];
  if (!fn) throw new Error(`No presentation for ${artefactType}.`);
  return fn(s, { ...ctx, x: X.helpers(s) });
}
