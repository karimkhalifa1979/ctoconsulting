// Business case (value case) generator. The document is assembled from live data — benefits map,
// benefits register, cost model, assessments and simulation (VCS-04) — structured by the four "ares"
// (VCS-01), with auto-drafted narrative that people can edit. One model renders to HTML (preview,
// print/PDF) and to a Word .docx.
import { ARES, BTOPP, COST_TYPES, benefitTypeLabel, btoppName, roleName, gateOf, decisionOf, stateOf } from './config.js';
import { financials, sensitivity, annualValue, benefitStart, isFinancial, pathScope, realisation, BENEFIT_STATUS } from './finance.js';
import { riskScore, alignmentScore, accountabilities, riskBand } from './scoring.js';
import { btoppMix, chainOf } from './chain.js';
import { nextGate, fundingApproved, spendToDate, qualityChecks } from './rules.js';
import { histogram } from './simulation.js';
import { cashflowSvg, histogramSvg, fanSvg, tornadoSvg, riskIconSvg, chainSvg, svgSize } from './docCharts.js';
import { money, moneyFull, pct, ratio, months, fmtDate, todayISO, esc, monthIndex, sum } from './util.js';

const lc = (s) => (s ? s.charAt(0).toLowerCase() + s.slice(1) : '');
const sentence = (s) => (s ? s.trim().replace(/[.\s]*$/, '.') : '');
const listify = (arr) => (arr.length <= 1 ? arr.join('') : `${arr.slice(0, -1).join(', ')} and ${arr[arr.length - 1]}`);

export const SECTIONS = [
  ['summary', '1', 'Executive summary'],
  ['background', '2', 'Background: the problem and the opportunity'],
  ['right', '3', 'Are we doing the right things? Strategic alignment and options'],
  ['way', '4', 'Are we doing them the right way? Scope, approach and fit'],
  ['well', '5', 'Are we getting them done well? Delivery, governance and change'],
  ['benefits', '6', 'Are we getting the benefits? Benefits and financial worth'],
  ['risk', '7', 'Risk, uncertainty and simulation'],
  ['accountability', '8', 'Accountabilities and sponsor commitment'],
  ['recommendation', '9', 'Recommendation and decision sought'],
  ['appendix', 'A', 'Appendix: cost lines, valuation and method'],
];

export function businessCaseModel(ws, p, { vc = null, sim = null, generatedAt = new Date().toISOString() } = {}) {
  const person = (id) => ws.people.find((x) => x.id === id);
  const pname = (id) => person(id)?.name || 'To be assigned';
  const ptitle = (id) => (person(id) ? `${person(id).name}, ${person(id).position}` : 'To be assigned');
  const org = ws.settings.orgName || ws.name;
  const cat = ws.categories.find((c) => c.id === p.categoryId);
  const fin = financials(p, ws);
  const sens = sensitivity(p, ws);
  const risk = riskScore(p, ws);
  const align = alignmentScore(p, ws);
  const chain = chainOf(p);
  const scope = pathScope(p);
  const mix = btoppMix(p);
  const accs = accountabilities(p, ws);
  const checks = qualityChecks(p, ws);
  const next = nextGate(p);
  const gateId = vc?.gate || next?.gate || 'G2';
  const gate = gateOf(gateId);
  const benefits = (p.benefits || []).filter((b) => !scope.outBenefits.has(b.id));
  const finBenefits = benefits.filter(isFinancial);
  const nonfin = benefits.filter((b) => !isFinancial(b) && !b.disbenefit);
  const finals = chain.elements.filter((e) => e.kind === 'outcome' && e.final && (!scope.path || scope.path.elementIds.includes(e.id) || !chain.paths.some((x) => x.elementIds.includes(e.id))));
  const assumptions = chain.elements.filter((e) => e.kind === 'assumption');
  const drivers = (p.driverIds || []).map((id) => ws.drivers.find((d) => d.id === id)).filter(Boolean);
  const topDrivers = align.breakdown.filter((b) => b.rating >= 3).sort((a, b) => b.contribution - a.contribution).map((b) => b.driver.name);
  const r = fin.r;
  const a = sim?.analysis;
  const narrative = vc?.narrative || {};
  const gateDate = next?.planned || todayISO();
  const startMi = fin.startMi;
  const gStart = Math.max(0, monthIndex(gateDate) - startMi);
  const twelve = sum(Array.from(fin.costsM.slice(gStart, gStart + 12)));
  const fundingRequested = vc?.fundingRequested ?? Math.round(twelve / 1000) * 1000;
  const costLow = Number(p.costLow) || null; const costHigh = Number(p.costHigh) || null;
  const cashShare = fin.pvBenefits > 0 ? fin.pvCash / fin.pvBenefits : 0;

  // ---- Auto-drafted narrative (editable) -------------------------------------------
  const auto = {
    summary: [
      `${org} proposes the ${p.name} program${p.purpose ? ` to ${lc(sentence(p.purpose)).replace(/\.$/, '')}` : ''}. It is a ${cat?.name.toLowerCase() || ''} investment sponsored by ${ptitle(p.sponsorId)}, who is accountable for realising its benefits.`,
      `Over a ${Math.round(fin.H / 12)}-year evaluation period the program is forecast to cost ${money(fin.totalCosts)} across its full lifecycle${costLow && costHigh ? ` (estimate range ${money(costLow)} to ${money(costHigh)})` : ''} and to deliver ${money(fin.totalBenefits)} in financial benefits, ${pct(cashShare)} of which are cash-releasing in present-value terms. At a ${pct(r, 1)} discount rate the net present value is ${money(fin.npv)} (benefit–cost ratio ${ratio(fin.bcr)}${fin.irr !== null ? `, internal rate of return ${pct(fin.irr, 1)}` : ''}, payback ${months(fin.paybackMonths).toLowerCase()}).${nonfin.length ? ` It also targets ${nonfin.length} non-financial benefit${nonfin.length === 1 ? '' : 's'}, including ${lc(nonfin[0].title)}.` : ''}`,
      a ? `A Monte Carlo simulation of ${a.n.toLocaleString()} possible futures, covering cost and benefit uncertainty, schedule delay and the failure of key assumptions, gives a ${pct(a.probPositive)} chance of a positive NPV. The expected (risk-adjusted) NPV is ${money(a.npv.mean)}, and eight in ten outcomes fall between ${money(a.npv.p10)} and ${money(a.npv.p90)}.` : '',
      `${topDrivers.length ? `The program contributes most strongly to ${listify(topDrivers.map((d) => `“${d}”`))}. ` : ''}The ${gate?.name || gateId} decision sought is to ${gateId === 'G1' ? 'fund program definition' : gateId === 'G2' ? 'commit to the program' : gateId === 'G4' ? 'approve completion' : 'proceed'}, releasing ${money(fundingRequested)} to reach the next gate. Funding beyond that gate is not requested now.`,
    ].filter(Boolean).join('\n\n'),
    background: [p.problem ? sentence(p.problem) : 'Describe the problem or opportunity this program responds to.', p.scope ? `The program’s scope is: ${lc(sentence(p.scope))}` : ''].filter(Boolean).join('\n\n'),
    right: `The program’s final outcomes are ${listify(finals.map((e) => `“${lc(e.title)}”`)) || 'yet to be defined'}. Each is linked to at least one strategic driver${finals.some((e) => !(e.driverIds || []).length) ? ' (with exceptions noted in the readiness checks)' : ''}. The alignment assessment scores the program ${align.score === null ? 'as not yet assessed' : `${Math.round(align.score)} out of 100`}${a ? '' : ''}, based on its contribution to current objectives, ${ws.settings.orgName || 'the organisation'}’s parent and wider context, and the desired future state.`,
    options: chain.paths.length ? `${chain.paths.length} benefits paths were modelled for the same capability. ${scope.path ? `Path “${scope.path.name}” is selected: ${sentence(scope.path.rationale)}` : 'No path has been selected yet.'} Alternative paths remain on record and can be switched later if circumstances change.` : 'A single benefits path is proposed. The “do nothing” option leaves the problem described above unresolved.',
    way: `The program is designed as a blended investment across the whole business system, not a technology project. ${Math.round(mix.oppShareCount * 100)}% of its initiatives and ${Math.round(mix.oppShareCost * 100)}% of its cost sit in organisation, process and people change. ${p.architecture ? sentence(p.architecture) : ''}`,
    well: `Delivery is organised as ${(p.projects || []).length} project${(p.projects || []).length === 1 ? '' : 's'} managed by ${pname(p.managerId)}, each delivering a defined capability against a statement of work. Funding is committed progressively: only the funding needed to reach the next gate is released, and each gate is a point to continue, modify, delay or withdraw.`,
    change: (p.stakeholders || []).length ? `${(p.stakeholders || []).length} stakeholder groups are affected. ${(p.stakeholders || []).filter((s) => s.impact === 'high').map((s) => s.name).join(', ') || 'None'} ${(p.stakeholders || []).filter((s) => s.impact === 'high').length === 1 ? 'experiences' : 'experience'} high impact. Change initiatives are built into the benefits map from the start and costed in the value case; communication follows the four Ps (purpose, picture, plan and part).` : 'Stakeholder and change impact analysis is still to be completed.',
    benefits: `${benefits.length} benefit${benefits.length === 1 ? ' is' : 's are'} registered${finBenefits.length ? `, of which ${finBenefits.length} ${finBenefits.length === 1 ? 'is' : 'are'} financial` : ''}. Every benefit has a named owner, a measure and a baseline${benefits.some((b) => !b.measureId || !b.ownerId) ? ' (gaps are listed in the readiness checks)' : ''}. Benefits are time-phased: they start only after the capabilities they depend on are delivered, include a learning-lag dip where relevant, and rise through plateaus to full value.`,
    financial: `On the most likely estimates the program returns ${money(fin.pvBenefits)} in present-value benefits for ${money(fin.pvCosts)} in present-value costs. Sensitivity analysis shows the NPV ${sens.rows[1].npv > 0 ? 'stays positive' : 'turns negative'} if benefits are 25% lower, and ${sens.rows[4].npv > 0 ? 'stays positive' : 'turns negative'} if benefits arrive six months late.`,
    risk: `The four-quadrant risk assessment gives an overall risk score of ${risk.overall === null ? 'not yet assessed' : Math.round(risk.overall)}${risk.overall !== null ? ` (${riskBand(risk.overall, ws).label.toLowerCase()})` : ''}. ${ARES.map((x) => `${x.short}: ${risk.byAre[x.id].score === null ? '—' : Math.round(risk.byAre[x.id].score)}`).join('; ')}. ${a && sim?.tornado?.rows[0] ? `The simulation identifies ${lc(sim.tornado.rows[0].label.replace(/^(Cost|Benefit|Risk): /, ''))} as the largest driver of uncertainty in value.` : ''} ${assumptions.filter((x) => x.assumption?.status !== 'holding').length ? `${assumptions.filter((x) => x.assumption?.status !== 'holding').length} assumption${assumptions.filter((x) => x.assumption?.status !== 'holding').length === 1 ? ' is' : 's are'} currently at risk and monitored.` : ''}`,
    accountability: `${pname(p.sponsorId)} is the single accountable business sponsor. Outcome and benefit owners have been proposed for every measurable result, and the conditions for accepting accountability (clear mandate, authority, competence, resources, lines of accountability, rights and obligations, measures, and acceptance) have been assessed for each.`,
    recommendation: `It is recommended that the ${ws.settings.terms?.board || 'Investment Decision Board'} approves the ${gate?.name || gateId} decision for ${p.name} and releases ${money(fundingRequested)} to reach the next gate, subject to the conditions below. The sponsor commits to the benefits set out in section 6 and to reporting them through regular benefits reviews.`,
  };
  const narr = (key) => ({ t: 'narr', key, text: narrative[key] ?? auto[key], auto: narrative[key] === undefined, autoText: auto[key] });

  // ---- Sections ------------------------------------------------------------------------
  const figs = [
    { l: 'Lifetime cost', v: money(fin.totalCosts), s: costLow && costHigh ? `range ${money(costLow)}–${money(costHigh)}` : 'most likely' },
    { l: 'Net present value', v: money(fin.npv), s: `at ${pct(r, 1)}` },
    { l: 'Expected NPV (simulated)', v: a ? money(a.npv.mean) : '—', s: a ? `P10 ${money(a.npv.p10)} · P90 ${money(a.npv.p90)}` : 'not simulated' },
    { l: 'Chance NPV > 0', v: a ? pct(a.probPositive) : '—', s: a ? `${a.n.toLocaleString()} iterations` : '' },
    { l: 'Benefit–cost ratio', v: ratio(fin.bcr), s: `ROI ${pct(fin.roi)} (undiscounted)` },
    { l: 'Payback', v: months(fin.paybackMonths), s: fin.irr === null ? 'IRR n/a' : `IRR ${pct(fin.irr, 1)}` },
    { l: 'Alignment', v: align.score === null ? '—' : `${Math.round(align.score)} / 100`, s: `${drivers.length} drivers` },
    { l: 'Overall risk', v: risk.overall === null ? '—' : `${Math.round(risk.overall)} / 100`, s: risk.overall === null ? '' : riskBand(risk.overall, ws).label },
  ];

  const sections = [];
  sections.push({ id: 'summary', blocks: [narr('summary'), { t: 'figs', items: figs }, { t: 'callout', text: `Decision sought: ${gate?.name || gateId} — release ${moneyFull(fundingRequested)} to reach the next gate (${fmtDate(gateDate)}). Lifetime cost range ${money(costLow)}–${money(costHigh)}; funding beyond the next gate is not requested.` }] });

  sections.push({ id: 'background', blocks: [narr('background'), { t: 'kv', rows: [['Program', `${p.code} ${p.name}`], ['Investment category', `${cat?.name || '—'} (${cat?.freedom || '—'} degree of freedom)`], ['Lifecycle state', stateOf(p.state).label], ['Business sponsor', ptitle(p.sponsorId)], ['Program manager', ptitle(p.managerId)], ['Affected business areas', (p.areas || []).map((id) => ws.areas.find((x) => x.id === id)?.name).filter(Boolean).join(', ') || '—'], ['Planned dates', `${fmtDate(p.startDate)} to ${fmtDate(p.endDate)}`]] }, ...(cat && !cat.discretionary && p.light ? [{ t: 'h3', text: `${cat.name} details` }, { t: 'kv', rows: Object.entries(p.light) }] : [])] });

  const rightBlocks = [narr('right'), { t: 'h3', text: 'Contribution to strategic drivers' }, { t: 'table', head: ['Strategic driver', 'Contribution type', 'Weight', 'Rating (0–4)', 'Score contribution'], num: [2, 3, 4], rows: align.breakdown.map((b) => [b.driver.name, { current: 'Current objectives', parent: 'Parent / wider context', future: 'Future state' }[b.type], pct(b.driver.weight), b.rating === null ? '—' : String(b.rating), b.contribution.toFixed(1)]) }];
  if (chain.elements.length) {
    rightBlocks.push({ t: 'h3', text: 'Benefits map' }, { t: 'chart', svg: chainSvg(chain, { highlightPath: scope.path }), caption: `Benefits map (Results Chain notation) — initiatives (rectangles) contribute to intermediate and final outcomes (rounded); assumptions (dashed) condition them.${scope.path ? ` Elements outside the selected path “${scope.path.name}” are faded.` : ''}`, wide: true });
    rightBlocks.push({ t: 'table', head: ['Code', 'Element', 'Type', 'BTOPP', 'Owner'], rows: chain.elements.filter((e) => e.kind !== 'assumption').map((e) => [e.code, e.title, e.kind === 'outcome' ? (e.final ? 'Final outcome' : 'Intermediate outcome') : 'Initiative', (e.btopp || []).join(' '), pname(e.ownerId)]), small: true });
  }
  rightBlocks.push({ t: 'h3', text: 'Options considered' }, narr('options'));
  if (chain.paths.length) rightBlocks.push({ t: 'table', head: ['Benefits path', 'Lifetime cost', 'NPV', 'Status'], num: [1, 2], rows: chain.paths.map((x) => { const f = financials(p, ws, { pathId: x.id }); return [x.name, money(f.totalCosts), money(f.npv), x.selected ? 'Selected' : 'Not selected']; }) });
  sections.push({ id: 'right', blocks: rightBlocks });

  sections.push({ id: 'way', blocks: [narr('way'),
    { t: 'h3', text: 'Business system scope (BTOPP)' },
    { t: 'table', head: ['Element', 'Design question answered', 'Resulting initiatives'], rows: BTOPP.map((b) => [b.name, p.btoppChecklist?.[b.id]?.answer || '—', p.btoppChecklist?.[b.id]?.initiative || '—']), small: true },
    { t: 'table', head: ['BTOPP element', 'Initiatives', 'Share of initiatives', 'Cost', 'Share of cost'], num: [1, 2, 3, 4], rows: BTOPP.map((b) => [b.name, (Math.round((mix.count[b.id] || 0) * 10) / 10).toString(), pct(mix.initiatives ? (mix.count[b.id] || 0) / mix.initiatives : 0), money(mix.cost[b.id] || 0), pct(mix.totalCost ? (mix.cost[b.id] || 0) / mix.totalCost : 0)]) },
    { t: 'h3', text: 'Projects and capabilities' },
    { t: 'table', head: ['Project', 'Statement of work', 'Capabilities', 'BTOPP'], rows: (p.projects || []).map((x) => [x.name, x.sow || '—', (x.capabilities || []).map((c) => c.name).join('; ') || '—', x.btopp]), small: true },
    ...(ws.dependencies.filter((d) => d.from === p.id || d.to === p.id).length ? [{ t: 'h3', text: 'Dependencies with other programs' }, { t: 'table', head: ['Type', 'With', 'Description', 'Resolution'], rows: ws.dependencies.filter((d) => d.from === p.id || d.to === p.id).map((d) => [d.type, ws.programs.find((x) => x.id === (d.from === p.id ? d.to : d.from))?.name || '—', d.description, d.resolution || 'Open']), small: true }] : []),
  ] });

  const gates = (p.gates || []).slice().sort((x, y) => ((x.decision?.date || x.planned) < (y.decision?.date || y.planned) ? -1 : 1));
  sections.push({ id: 'well', blocks: [narr('well'),
    { t: 'h3', text: 'Program plan' },
    { t: 'table', head: ['Project', 'Manager', 'Start', 'Finish', 'Budget', 'Status'], num: [4], rows: (p.projects || []).map((x) => [x.name, pname(x.managerId), fmtDate(x.start), fmtDate(x.forecastEnd || x.end), money(x.budget), x.status]) },
    { t: 'h3', text: 'Stage gates and progressive funding' },
    { t: 'table', head: ['Gate', 'Date', 'Decision', 'Funding released'], num: [3], rows: gates.map((g) => [gateOf(g.gate)?.name || g.gate, fmtDate(g.decision?.date || g.planned), g.decision ? decisionOf(g.decision.option)?.label : 'Planned', g.decision ? money(g.decision.fundingApproved) : '—']) },
    { t: 'p', text: `Funding approved to date: ${money(fundingApproved(p))}; spent to date: ${money(spendToDate(p))}.` },
    { t: 'h3', text: 'Managing the change' }, narr('change'),
    ...((p.stakeholders || []).length ? [{ t: 'table', head: ['Stakeholder group', 'Impact', 'Depth', 'Position now → desired', 'Engagement owner'], rows: p.stakeholders.map((s) => [s.name, s.impact, s.depth || '—', `${s.current} → ${s.desired}`, pname(s.ownerId)]), small: true }] : []),
    ...((p.comms || []).length ? [{ t: 'table', head: ['Audience', 'Purpose', 'Picture', 'Plan', 'Part'], rows: p.comms.map((c) => [p.stakeholders?.find((s) => s.id === c.audience)?.name || c.audience, c.purpose, c.picture, c.plan, c.part]), small: true }] : []),
    { t: 'h3', text: 'Program tolerances' },
    { t: 'kv', rows: [['Cost', `${pct(p.tolerances?.cost ?? 0.1)} over budget`], ['Time', `${p.tolerances?.time ?? 3} months late`], ['Benefits', `${pct(p.tolerances?.benefits ?? 0.1)} below forecast`], ['Risk', `overall score above ${p.tolerances?.risk ?? 65}`]] },
  ] });

  const benRows = benefits.map((b) => [b.title, benefitTypeLabel(b.type), pname(b.ownerId), ws.measures.find((m) => m.id === b.measureId)?.name || '—', isFinancial(b) ? `${money(annualValue(b))} / yr` : `${b.baseline?.value ?? '—'} → ${b.target ?? '—'} ${b.unit || ''}`, fmtDate(benefitStart(p, b))]);
  sections.push({ id: 'benefits', blocks: [narr('benefits'),
    { t: 'h3', text: 'Benefits register' },
    { t: 'table', head: ['Benefit', 'Type', 'Owner', 'Measure', 'Value / target', 'Starts'], rows: benRows, small: true },
    { t: 'h3', text: 'Benefits realisation plan' },
    { t: 'table', head: ['Benefit', 'Mechanism', 'Depends on', 'Profile'], rows: benefits.filter((b) => !b.disbenefit).map((b) => [b.title, b.mechanism || '—', (b.dependsOn || []).map((id) => p.projects.find((x) => x.id === id)?.name).filter(Boolean).join(', ') || '—', `${(b.profile?.plateaus || []).map((x) => `${pct(x.pct)} from month ${x.after}`).join(', ')}${b.profile?.dipPct ? `; ${pct(b.profile.dipPct)} learning dip for ${b.profile.dipMonths} months` : ''}`]), small: true },
    ...(benefits.some((b) => (b.actuals || []).length) ? [{ t: 'h3', text: 'Realisation to date' }, { t: 'table', head: ['Benefit', 'Actual to date', 'Forecast to date', 'Status'], num: [1, 2], rows: benefits.filter((b) => (b.actuals || []).length).map((b) => { const rr = realisation(p, b, ws); return [b.title, isFinancial(b) ? money(rr.actual) : String(rr.actual), isFinancial(b) ? money(rr.forecast) : String(Math.round(rr.forecast * 10) / 10), BENEFIT_STATUS[rr.status].label]; }) }] : []),
    { t: 'h3', text: 'Financial worth' }, narr('financial'),
    { t: 'chart', svg: cashflowSvg(fin.annual), caption: 'Benefits (after attribution), full lifecycle costs and cumulative net cash flow by financial year.' },
    { t: 'table', head: ['Year', 'Cash-releasing', 'Non-cash', 'Costs', 'Net', 'Cumulative'], num: [1, 2, 3, 4, 5], rows: [...fin.annual.map((y) => [y.label, money(y.cash), money(y.noncash), money(y.costs), money(y.net), money(y.cum)]), ['Total', money(sum(fin.annual, (y) => y.cash)), money(sum(fin.annual, (y) => y.noncash)), money(fin.totalCosts), money(fin.totalBenefits - fin.totalCosts), '']], small: true },
    { t: 'kv', rows: [['Net present value', `${moneyFull(fin.npv)} at ${pct(r, 1)}`], ['Present value of benefits', `${moneyFull(fin.pvBenefits)} (cash-releasing ${moneyFull(fin.pvCash)}; non-cash ${moneyFull(fin.pvNonCash)})`], ['Present value of costs', moneyFull(fin.pvCosts)], ['Benefit–cost ratio', ratio(fin.bcr)], ['Return on investment (undiscounted)', pct(fin.roi)], ['Internal rate of return', fin.irr === null ? 'Not applicable (cash flows do not change sign)' : pct(fin.irr, 1)], ['Payback', months(fin.paybackMonths)]] },
    { t: 'h3', text: 'Sensitivity analysis' },
    { t: 'table', head: ['Scenario', 'NPV', 'Change from base', 'BCR'], num: [1, 2, 3], rows: sens.rows.map((x) => [x.label, money(x.npv), money(x.delta), ratio(x.bcr)]) },
  ] });

  const riskBlocks = [narr('risk'), { t: 'chart', svg: riskIconSvg(risk.byAre, (s) => riskBand(s, ws), 140), caption: 'Four-quadrant risk profile: one quadrant per “are” (green < 35, amber 35–65, red > 65).', small: true },
    { t: 'table', head: ['The four “ares”', 'Risk perspective', 'Score'], num: [2], rows: ARES.map((x) => [x.q, x.risk, risk.byAre[x.id].score === null ? '—' : String(Math.round(risk.byAre[x.id].score))]) }];
  if (a) {
    const bins = histogram(sim.run.out.npv, sim.run.out.done, 36);
    riskBlocks.push({ t: 'h3', text: 'Monte Carlo simulation of costs and benefits' },
      { t: 'p', text: `${a.n.toLocaleString()} iterations, ${sim.model.s.dist.toUpperCase()} distributions, seed ${sim.model.s.seed}. Each cost and benefit line varies within its range (benefits ${pct(sim.model.s.benefitLow)} to +${pct(sim.model.s.benefitHigh)} by default; costs ${pct(sim.model.s.costLow)} to +${pct(sim.model.s.costHigh)}), benefit timing varies by ${sim.model.s.delayLow}–${sim.model.s.delayHigh} months, cost overruns and delays are correlated (ρ = ${sim.model.s.correlation}), and ${sim.model.events.length} risk events (including assumptions failing) may occur.` },
      { t: 'figs', items: [{ l: 'Expected NPV', v: money(a.npv.mean), s: `base case ${money(a.base.npv)}` }, { l: 'P10 / P50 / P90', v: `${money(a.npv.p10)} / ${money(a.npv.p50)} / ${money(a.npv.p90)}`, s: '80% of outcomes in range' }, { l: 'Chance NPV > 0', v: pct(a.probPositive), s: `P(BCR > 1) ${pct(a.probBcr1)}` }, { l: 'Median payback', v: a.payback ? months(a.payback.p50) : '—', s: `pays back in ${pct(a.probPayback)} of runs` }] },
      { t: 'chart', svg: histogramSvg(bins, a.n, [{ label: 'P10', value: a.npv.p10, color: '#4a5768' }, { label: 'P50', value: a.npv.p50, strong: true }, { label: 'P90', value: a.npv.p90, color: '#4a5768' }, { label: 'Base', value: a.base.npv, color: '#f2a900', dash: true }]), caption: 'Distribution of net present value across simulated futures.' },
      { t: 'chart', svg: fanSvg(a.fan, a.base.cumQ), caption: 'Cumulative net cash flow over time: median, 50% and 80% ranges, and the single-point base case.' },
      { t: 'chart', svg: tornadoSvg(sim.tornado.rows.slice(0, 10), sim.tornado.base), caption: 'Drivers of value: NPV as each input moves from its downside to its upside, all else at most likely.' });
    if (a.eventImpact.length) riskBlocks.push({ t: 'table', head: ['Risk event', 'Probability', 'Mean NPV if it occurs', 'Impact on NPV'], num: [1, 2, 3], rows: a.eventImpact.map((e) => [e.name, pct(e.prob), money(e.npvIf), money(e.delta)]) });
  }
  riskBlocks.push({ t: 'h3', text: 'Assumptions and monitoring' }, { t: 'table', head: ['Assumption', 'Category', 'Status', 'Monitor', 'Indicator', 'Impact if false'], rows: assumptions.map((x) => [`${x.code} ${x.title}`, x.assumption?.category || '—', ({ holding: 'Holding', 'at-risk': 'At risk', invalid: 'Invalid' })[x.assumption?.status || 'holding'], pname(x.assumption?.monitorId), x.assumption?.indicator || '—', x.assumption?.impact || '—']), small: true });
  const risks = (p.log || []).filter((l) => l.type === 'risk' && l.status !== 'closed');
  if (risks.length) riskBlocks.push({ t: 'h3', text: 'Key delivery risks' }, { t: 'table', head: ['Risk', 'Likelihood', 'Impact', 'Owner', 'Escalation level'], rows: risks.map((l) => [l.title, l.likelihood || '—', l.impact || '—', pname(l.ownerId), l.level || 'program']) });
  if (p.assessment?.risk?.classification) riskBlocks.push({ t: 'p', text: `Risk classification: ${p.assessment.risk.classification === 'inherent' ? 'inherent at this stage — a smaller funding tranche and closer monitoring are proposed' : 'not yet examined — mitigation actions are being added'}.` });
  sections.push({ id: 'risk', blocks: riskBlocks });

  sections.push({ id: 'accountability', blocks: [narr('accountability'), { t: 'table', head: ['Role', 'Accountable for', 'Person', 'Accepted', 'Seven-plus-one conditions'], rows: accs.filter((x) => x.role !== 'delivery-owner').map((x) => [roleName(x.role), x.objectLabel, x.person?.name || '—', x.acceptedAt ? fmtDate(x.acceptedAt) : 'Pending', x.unmet ? `${x.unmet} not met` : x.partly ? `${x.partly} partly met` : Object.keys(x.conditions).length ? 'All met' : 'Not assessed']), small: true },
    { t: 'callout', text: `Sponsor commitment: I, ${pname(p.sponsorId)}, accept accountability for realising the benefits in this business case, for leading the change it requires, and for reporting progress through regular benefits reviews.` }] });

  const blocking = checks.filter((c) => c.severity === 'error');
  sections.push({ id: 'recommendation', blocks: [narr('recommendation'),
    { t: 'kv', rows: [['Gate', gate ? `${gate.name} — ${gate.questions}` : gateId], ['Decision authority', gate?.authority || '—'], ['Funding requested to next gate', moneyFull(fundingRequested)], ['Lifetime cost range', `${money(costLow)} to ${money(costHigh)}`], ['Proposed conditions', vc?.conditions || 'Benefits reviews every quarter from the first plateau; report assumption status monthly.']] },
    ...(gate ? [{ t: 'h3', text: 'Gate criteria' }, { t: 'ul', items: gate.criteria.map(([, text]) => text) }] : []),
    ...(blocking.length ? [{ t: 'callout', tone: 'warn', text: `Open issues to resolve before submission: ${blocking.map((c) => `${c.text} (${c.rule})`).join(' ')}` }] : []),
  ] });

  sections.push({ id: 'appendix', blocks: [
    { t: 'h3', text: 'A.1 Cost lines' },
    { t: 'table', head: ['Cost line', 'Type', 'BTOPP', 'Basis', 'Start', 'Amount', 'Range'], num: [5], rows: (p.costs || []).filter((c) => !scope.outCosts.has(c.id)).map((c) => [c.name, COST_TYPES.find((t) => t.id === c.type)?.label || c.type, btoppName(c.btopp), c.basis === 'annual' ? `per year${c.months ? ` for ${c.months} months` : ''}` : `once over ${c.months || 1} months`, fmtDate(c.start), money(c.amount), c.uncertainty ? `${pct(c.uncertainty.low)} / +${pct(c.uncertainty.high)}` : 'default']), small: true },
    { t: 'h3', text: 'A.2 Benefit valuation' },
    { t: 'table', head: ['Benefit', 'Driving variable', 'Coefficient', 'Annual value', 'Attribution', 'Source and evidence'], rows: finBenefits.map((b) => [b.title, b.valuation?.driverName ? `${b.valuation.driverName}: ${Number(b.valuation.driverValue).toLocaleString('en-AU')}` : '—', b.valuation?.coefficientName ? `${b.valuation.coefficientName}: ${b.valuation.coefficient}` : '—', money(annualValue(b)), pct(b.attribution ?? 1), [b.valuation?.source, b.valuation?.evidence].filter(Boolean).join('. ') || '—']), small: true },
    { t: 'h3', text: 'A.3 Method' },
    { t: 'ul', items: [
      `NPV = Σ net cash flow(t) ÷ (1 + r)^(t/12), monthly periods, end-of-period convention, r = ${pct(r, 1)}. ROI is undiscounted. IRR is calculated on annual net flows.`,
      'Benefit value per period = driving variable × coefficient × profile realisation × attribution share. Profiles start after the capabilities they depend on are delivered.',
      'Risk score per “are” = 100 × Σ w(s − 1) ÷ Σ w(5 − 1); overall risk is the relevance-weighted mean of the four “ares”.',
      'Alignment = 100 × Σ T(t) Σ W(d) × contribution(t, d) ÷ 4, across current, parent and future-state contribution types.',
      'Monte Carlo: correlated sampling (one-factor Gaussian copula) of each line within its range, schedule delay correlated with cost overrun, and Bernoulli risk events; deterministic for a given seed.',
      'Scores support judgement; they do not replace it. Decisions are recorded by accountable people with their rationale.',
    ] },
  ] });

  const meta = {
    org, title: `${p.name} — Business case`, program: p.name, code: p.code, version: vc ? `${vc.version}${vc.status === 'locked' ? '' : ' (draft)'}` : 'Draft', gate: gate?.name || gateId,
    status: vc ? { draft: 'Draft', 'in-review': 'In VMO review', submitted: 'Submitted', locked: 'Approved version (locked)' }[vc.status] || vc.status : 'Draft',
    date: fmtDate(generatedAt.slice(0, 10)), classification: p.classification || 'Internal', sponsor: ptitle(p.sponsorId), manager: ptitle(p.managerId),
    preparedBy: vc?.author ? pname(vc.author) : pname(ws.currentUser), category: cat?.name || '',
    history: (p.valueCases || []).map((v) => [String(v.version), fmtDate(v.createdAt), v.gate, { draft: 'Draft', 'in-review': 'In review', submitted: 'Submitted', locked: 'Locked' }[v.status] || v.status]),
  };
  const key = {
    npv: fin.npv, totalCosts: fin.totalCosts, totalBenefits: fin.totalBenefits, bcr: fin.bcr, irr: fin.irr, payback: fin.paybackMonths,
    expectedNpv: a?.npv.mean ?? null, p10: a?.npv.p10 ?? null, p90: a?.npv.p90 ?? null, probPositive: a?.probPositive ?? null,
    alignment: align.score, risk: risk.overall, costLow, costHigh, fundingRequested, benefits: benefits.length,
  };
  return { meta, sections: sections.map((s) => ({ ...s, number: SECTIONS.find((x) => x[0] === s.id)[1], heading: SECTIONS.find((x) => x[0] === s.id)[2] })), key, auto };
}

// ---- HTML ------------------------------------------------------------------------------------
const paras = (text) => String(text || '').split(/\n\s*\n/).map((t) => `<p>${esc(t.trim())}</p>`).join('');
export function blockHtml(b) {
  switch (b.t) {
    case 'p': return `<p>${esc(b.text)}</p>`;
    case 'narr': return paras(b.text);
    case 'h3': return `<h3>${esc(b.text)}</h3>`;
    case 'ul': return `<ul>${b.items.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>`;
    case 'callout': return `<div class="callout${b.tone === 'warn' ? ' warn' : ''}">${esc(b.text)}</div>`;
    case 'kv': return `<table class="kv"><tbody>${b.rows.map(([k, v]) => `<tr><td>${esc(k)}</td><td>${esc(v)}</td></tr>`).join('')}</tbody></table>`;
    case 'figs': return `<div class="figs">${b.items.map((f) => `<div class="fig"><div class="l">${esc(f.l)}</div><div class="v">${esc(f.v)}</div><div class="s">${esc(f.s || '')}</div></div>`).join('')}</div>`;
    case 'table': return `<table${b.small ? ' style="font-size:11.5px"' : ''}><thead><tr>${b.head.map((h, i) => `<th${(b.num || []).includes(i) ? ' class="n"' : ''}>${esc(h)}</th>`).join('')}</tr></thead><tbody>${b.rows.map((r) => `<tr>${r.map((c, i) => `<td${(b.num || []).includes(i) ? ' class="n"' : ''}>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
    case 'chart': return `<figure${b.small ? ' style="max-width:160px"' : ''}>${b.svg.replace('<svg ', '<svg style="max-width:100%;height:auto" ')}<figcaption>${esc(b.caption || '')}</figcaption></figure>`;
    default: return '';
  }
}

export function businessCaseHtml(model) {
  const m = model.meta;
  const body = model.sections.map((s) => `<h2 id="bc-${s.id}">${esc(s.number)}. ${esc(s.heading)}</h2>${s.blocks.map(blockHtml).join('\n')}`).join('\n');
  return `<!DOCTYPE html><html lang="en-AU"><head><meta charset="utf-8"><title>${esc(m.title)}</title><style>
@page{size:A4;margin:18mm 16mm}
body{font-family:Calibri,'Segoe UI',Arial,sans-serif;color:#1b2533;line-height:1.5;font-size:10.5pt;max-width:820px;margin:24px auto;padding:0 24px}
.classification{text-align:center;font-weight:700;color:#b42318;font-size:9pt;letter-spacing:.08em}
.cover{border-bottom:4px solid #0FA3B1;padding-bottom:14px;margin-bottom:18px}.org{color:#0B1F3A;font-weight:700;letter-spacing:.06em;font-size:9.5pt;text-transform:uppercase}
h1{color:#0B1F3A;font-size:22pt;margin:6px 0 4px}h2{color:#0B1F3A;font-size:14pt;border-bottom:1px solid #d9dee5;padding-bottom:4px;margin-top:26px;page-break-after:avoid}
h3{color:#0F6E78;font-size:11.5pt;margin:14px 0 6px;page-break-after:avoid}
table{border-collapse:collapse;width:100%;margin:6px 0 12px;font-size:9.5pt;page-break-inside:auto}tr{page-break-inside:avoid}th,td{border:1px solid #c9d1db;padding:5px 7px;vertical-align:top;text-align:left}th{background:#0B1F3A;color:#fff}td.n,th.n{text-align:right}
table.kv td:first-child{background:#eef3f8;font-weight:600;width:34%}
.figs{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:10px 0}.fig{border:1px solid #d9dee5;border-top:3px solid #0FA3B1;border-radius:4px;padding:7px 9px}.fig .l{font-size:7.5pt;text-transform:uppercase;letter-spacing:.05em;color:#6b7684;font-weight:700}.fig .v{font-size:13pt;font-weight:700;color:#0B1F3A}.fig .s{font-size:8pt;color:#6b7684}
.callout{border-left:4px solid #0FA3B1;background:#e3f5f7;padding:9px 12px;border-radius:4px;margin:10px 0}.callout.warn{border-color:#fab219;background:#fff8e6}
figure{margin:10px 0;page-break-inside:avoid}figcaption{font-size:8.5pt;color:#6b7684}
.footer{margin-top:28px;font-size:8.5pt;color:#6b7684;border-top:1px solid #d9dee5;padding-top:8px}
</style></head><body>
<div class="classification">${esc(m.classification)}</div>
<div class="cover"><div class="org">${esc(m.org)}</div><h1>${esc(m.title)}</h1><div>${esc(m.code)} · Version ${esc(m.version)} · ${esc(m.status)} · ${esc(m.date)}</div></div>
<table class="kv"><tbody><tr><td>Program</td><td>${esc(m.code)} ${esc(m.program)}</td></tr><tr><td>Investment category</td><td>${esc(m.category)}</td></tr><tr><td>Business sponsor</td><td>${esc(m.sponsor)}</td></tr><tr><td>Program manager</td><td>${esc(m.manager)}</td></tr><tr><td>Gate</td><td>${esc(m.gate)}</td></tr><tr><td>Prepared by</td><td>${esc(m.preparedBy)}</td></tr><tr><td>Classification</td><td>${esc(m.classification)}</td></tr></tbody></table>
${m.history.length ? `<h3>Version history</h3><table><thead><tr><th>Version</th><th>Date</th><th>Gate</th><th>Status</th></tr></thead><tbody>${m.history.map((h) => `<tr>${h.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>` : ''}
${body}
<div class="footer">Generated ${esc(m.date)} by the CTO Consulting Benefits Realisation Platform from live program data. Structured by the four “ares” of the Benefits Realization Approach (Thorp, <em>The Information Paradox</em>, 2007).</div>
<div class="classification">${esc(m.classification)}</div>
</body></html>`;
}

// ---- Word (.docx) ---------------------------------------------------------------------------
export async function businessCaseDocx(model, svgToPng) {
  const d = await import('docx');
  const { Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, WidthType, ShadingType, AlignmentType, ImageRun, Header, Footer, PageNumber, TableOfContents, BorderStyle, LevelFormat, PageBreak } = d;
  const NAVY = '0B1F3A'; const TEAL = '0FA3B1'; const W = 9026;
  const border = { style: BorderStyle.SINGLE, size: 4, color: 'C9D1DB' };
  const borders = { top: border, bottom: border, left: border, right: border };
  const txt = (t, o = {}) => new TextRun({ text: String(t ?? ''), font: 'Calibri', size: o.size || 21, bold: o.bold, color: o.color, italics: o.italics });
  const para = (t, o = {}) => new Paragraph({ children: [txt(t, o)], spacing: { after: 120 }, alignment: o.align });
  const cell = (t, width, o = {}) => new TableCell({ borders, width: { size: width, type: WidthType.DXA }, shading: o.head ? { fill: NAVY, type: ShadingType.CLEAR, color: 'auto' } : o.key ? { fill: 'EEF3F8', type: ShadingType.CLEAR, color: 'auto' } : undefined, margins: { top: 60, bottom: 60, left: 100, right: 100 }, children: [new Paragraph({ alignment: o.num ? AlignmentType.RIGHT : AlignmentType.LEFT, children: [txt(t, { bold: o.head || o.key, color: o.head ? 'FFFFFF' : undefined, size: o.size || (o.small ? 17 : 19) })] })] });
  // Column widths: every column is at least as wide as its longest word (so words never break
  // mid-way), and the remaining width is shared in proportion to how much text each column holds.
  const widthsFor = (head, rows, small) => {
    const cw = small ? 88 : 99; const pad = 220;
    const add = (a) => a.reduce((x, y) => x + y, 0);
    const word = (v) => String(v ?? '').split(/\s+/).reduce((m, w) => Math.max(m, w.length), 0);
    const min = head.map((h, i) => Math.min(2600, pad + cw * Math.max(word(h) * 1.1, ...rows.map((r) => word(r[i])))));
    const want = head.map((h, i) => Math.max(min[i], pad + cw * Math.max(String(h).length, ...rows.map((r) => Math.min(60, String(r[i] ?? '').length)))));
    let ws;
    if (add(min) >= W) ws = min.map((m) => (m / add(min)) * W);
    else if (add(want) <= W) ws = want.map((w) => (w / add(want)) * W);
    else { const k = (W - add(min)) / (add(want) - add(min)); ws = want.map((w, i) => min[i] + (w - min[i]) * k); }
    ws = ws.map(Math.round);
    ws[ws.indexOf(Math.max(...ws))] += W - add(ws);
    return ws;
  };
  const table = (head, rows, { num = [], small } = {}) => {
    const widths = widthsFor(head, rows, small);
    return new Table({ width: { size: W, type: WidthType.DXA }, columnWidths: widths, rows: [new TableRow({ tableHeader: true, children: head.map((h, i) => cell(h, widths[i], { head: true, num: num.includes(i), small })) }), ...rows.map((r) => new TableRow({ children: r.map((c, i) => cell(c, widths[i], { num: num.includes(i), small })) }))] });
  };
  const kv = (rows) => new Table({ width: { size: W, type: WidthType.DXA }, columnWidths: [3000, W - 3000], rows: rows.map(([k, v]) => new TableRow({ children: [cell(k, 3000, { key: true }), cell(v, W - 3000)] })) });
  const image = async (svg, small) => {
    const { w, h } = svgSize(svg);
    const png = await svgToPng(svg, w, h, 2);
    const buf = new Uint8Array(await png.arrayBuffer());
    const maxW = small ? 150 : 600;
    const scale = Math.min(1, maxW / w);
    return new Paragraph({ children: [new ImageRun({ type: 'png', data: buf, transformation: { width: Math.round(w * scale), height: Math.round(h * scale) } })], spacing: { before: 80, after: 40 } });
  };
  const blockToDocx = async (b) => {
    switch (b.t) {
      case 'p': return [para(b.text)];
      case 'narr': return String(b.text || '').split(/\n\s*\n/).map((t) => para(t.trim()));
      case 'h3': return [new Paragraph({ heading: HeadingLevel.HEADING_3, children: [txt(b.text, { bold: true, color: '0F6E78', size: 23 })], spacing: { before: 200, after: 80 } })];
      case 'ul': return b.items.map((i) => new Paragraph({ numbering: { reference: 'bullets', level: 0 }, children: [txt(i)], spacing: { after: 60 } }));
      case 'callout': return [new Paragraph({ children: [txt(b.text, { bold: true, color: NAVY })], shading: { fill: b.tone === 'warn' ? 'FFF8E6' : 'E3F5F7', type: ShadingType.CLEAR, color: 'auto' }, border: { left: { style: BorderStyle.SINGLE, size: 18, color: b.tone === 'warn' ? 'FAB219' : TEAL, space: 8 } }, spacing: { before: 120, after: 160 } })];
      case 'kv': return [kv(b.rows), para('')];
      case 'figs': {
        const rows = [];
        for (let i = 0; i < b.items.length; i += 4) rows.push(b.items.slice(i, i + 4));
        const cw = Math.floor(W / 4);
        return [new Table({ width: { size: cw * 4, type: WidthType.DXA }, columnWidths: [cw, cw, cw, cw], rows: rows.map((r) => new TableRow({ children: [...r, ...Array(4 - r.length).fill(null)].map((f) => new TableCell({ borders, width: { size: cw, type: WidthType.DXA }, shading: { fill: 'F4FBFC', type: ShadingType.CLEAR, color: 'auto' }, margins: { top: 80, bottom: 80, left: 100, right: 100 }, children: f ? [new Paragraph({ children: [txt(f.l.toUpperCase(), { size: 14, bold: true, color: '6B7684' })] }), new Paragraph({ children: [txt(f.v, { size: 26, bold: true, color: NAVY })] }), new Paragraph({ children: [txt(f.s || '', { size: 15, color: '6B7684' })] })] : [new Paragraph('')] })) })) }), para('')];
      }
      case 'table': return [table(b.head, b.rows, { num: b.num, small: b.small }), para('')];
      case 'chart': return [await image(b.svg, b.small), new Paragraph({ children: [txt(b.caption || '', { italics: true, size: 17, color: '6B7684' })], spacing: { after: 160 } })];
      default: return [];
    }
  };
  const m = model.meta;
  const children = [
    new Paragraph({ alignment: AlignmentType.CENTER, children: [txt(m.classification, { bold: true, color: 'B42318', size: 18 })] }),
    new Paragraph({ spacing: { before: 1800 }, children: [txt(m.org.toUpperCase(), { bold: true, color: NAVY, size: 22 })] }),
    new Paragraph({ heading: HeadingLevel.TITLE, children: [txt(m.program, { bold: true, color: NAVY, size: 56 })], spacing: { after: 120 } }),
    new Paragraph({ children: [txt('Business case', { color: '0F6E78', size: 36 })], border: { bottom: { style: BorderStyle.SINGLE, size: 24, color: TEAL, space: 8 } }, spacing: { after: 360 } }),
    kv([['Program', `${m.code} ${m.program}`], ['Investment category', m.category], ['Gate', m.gate], ['Version', `${m.version} — ${m.status}`], ['Date', m.date], ['Business sponsor', m.sponsor], ['Program manager', m.manager], ['Prepared by', m.preparedBy], ['Classification', m.classification]]),
    para(''),
    ...(m.history.length ? [new Paragraph({ children: [txt('Version history', { bold: true, color: NAVY, size: 22 })], spacing: { before: 200, after: 80 } }), table(['Version', 'Date', 'Gate', 'Status'], m.history)] : []),
    new Paragraph({ children: [new PageBreak()] }),
    new Paragraph({ children: [txt('Contents', { bold: true, color: NAVY, size: 30 })], spacing: { after: 120 } }),
    new TableOfContents('Contents', { hyperlink: true, headingStyleRange: '1-2' }),
    new Paragraph({ children: [new PageBreak()] }),
  ];
  for (const s of model.sections) {
    children.push(new Paragraph({ heading: HeadingLevel.HEADING_1, children: [txt(`${s.number}. ${s.heading}`, { bold: true, color: NAVY, size: 30 })], spacing: { before: 320, after: 140 }, border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: 'D9DEE5', space: 4 } } }));
    for (const b of s.blocks) children.push(...(await blockToDocx(b)));
  }
  children.push(new Paragraph({ children: [txt('Generated by the CTO Consulting Benefits Realisation Platform from live program data. Structured by the four “ares” of the Benefits Realization Approach (Thorp, The Information Paradox, 2007).', { italics: true, size: 16, color: '6B7684' })], spacing: { before: 400 } }));

  const doc = new Document({
    creator: 'CTO Consulting — Benefits Realisation Platform', title: m.title, description: `Business case for ${m.program}`,
    features: { updateFields: true },
    styles: { default: { document: { run: { font: 'Calibri', size: 21 } } }, paragraphStyles: [
      { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { size: 30, bold: true, color: NAVY, font: 'Calibri' }, paragraph: { spacing: { before: 320, after: 140 }, outlineLevel: 0 } },
      { id: 'Heading3', name: 'Heading 3', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { size: 23, bold: true, color: '0F6E78', font: 'Calibri' }, paragraph: { spacing: { before: 200, after: 80 }, outlineLevel: 2 } },
    ] },
    numbering: { config: [{ reference: 'bullets', levels: [{ level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 540, hanging: 270 } } } }] }] },
    sections: [{
      properties: { page: { margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } } },
      headers: { default: new Header({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [txt(`${m.org} · ${m.program} business case · ${m.classification}`, { size: 16, color: '6B7684' })] })] }) },
      footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ children: ['Page ', PageNumber.CURRENT, ' of ', PageNumber.TOTAL_PAGES], size: 16, color: '6B7684', font: 'Calibri' })] })] }) },
      children,
    }],
  });
  return Packer.toBlob(doc);
}

// Key figures for version comparison (VCS-02).
export const KEY_FIGURES = [
  ['totalCosts', 'Lifetime cost', 'money'], ['npv', 'NPV', 'money'], ['expectedNpv', 'Expected NPV (simulated)', 'money'], ['p10', 'NPV P10', 'money'], ['p90', 'NPV P90', 'money'],
  ['probPositive', 'Chance NPV > 0', 'pct'], ['bcr', 'Benefit–cost ratio', 'ratio'], ['irr', 'IRR', 'pct'], ['payback', 'Payback (months)', 'num'], ['alignment', 'Alignment', 'num'], ['risk', 'Overall risk', 'num'], ['fundingRequested', 'Funding requested', 'money'],
];
