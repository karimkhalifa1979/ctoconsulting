// Demonstration engagement for a fictional regional water utility, populated across every
// tab so the tool can be explored end to end. All names and figures are illustrative.
import { blankEngagement, uid, DIMENSIONS } from '../lib/model.js';
import { AI_QUESTIONS, GUARDRAILS, ETHICS_PRINCIPLES } from './aiReadiness.js';
import { isoDate } from '../lib/format.js';

// Deterministic pseudo-random numbers so the demo is identical every time.
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}
const day = (offset) => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + offset);
  return isoDate(d);
};
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

const DIM_BASE = { D01: 2.7, D02: 2.2, D03: 2.4, D04: 1.9, D05: 1.8, D06: 2.3, D07: 2.0, D08: 2.4, D09: 2.6, D10: 2.2, D11: 1.9, D12: 1.6, D13: 2.2, D14: 2.9, D15: 2.8, D16: 2.5, D17: 2.0 };
const DIM_TARGET = { D01: 4, D02: 4, D03: 3, D04: 4, D05: 3, D06: 3, D07: 4, D08: 3, D09: 3, D10: 4, D11: 4, D12: 4, D13: 3, D14: 3, D15: 4, D16: 3, D17: 4 };

const OBSERVATIONS = {
  D01: ['2030 strategy is well articulated but objectives are not prioritised and trade-offs are implicit.', 'Business unit plans reference the strategy but do not trace objectives to budgets or the project portfolio.'],
  D02: ['No agreed customer segmentation beyond residential / non-residential; vulnerable customers are not identified consistently.', 'Complaints data is captured in two systems and not analysed for root causes.', 'Digital self-service is limited to bill payment; 71% of contacts are by phone.'],
  D03: ['The service catalogue is incomplete for trade waste and recycled water services.'],
  D04: ['Work order processes differ across the three depots with no end-to-end owner.', 'High-volume billing exceptions are handled manually (approx. 4,000 per month).', 'Hand-offs between Asset Management, Network Operations and Capital Delivery average six per maintenance job.'],
  D05: ['A capability map was drafted in 2023 but is not used for investment decisions.', 'Asset investment planning and data analytics capabilities are critical and immature.'],
  D06: ['Average span of control is 8.1 overall; operational units sit below the 11–15 benchmark for operational work.', 'Network Operations has seven management layers, exceeding the agreed maximum of six.', 'Finance, HR and procurement roles are duplicated in every division (about 46 FTE).'],
  D07: ['Seven executive-level committees with overlapping terms of reference.', 'Delegations of authority have not been updated since the 2021 restructure.', 'Maintenance prioritisation decisions have no single decider between Asset Management and Network Operations.'],
  D08: ['No strategic workforce plan; 31% of the operational workforce is eligible to retire within 10 years.', 'Critical roles (treatment operators, SCADA engineers) lack succession cover.'],
  D09: ['Strong safety culture and pride in service; collaboration across divisions is weak.', 'Engagement survey shows low confidence in leadership communication of change (41% favourable).'],
  D10: ['KPIs are predominantly regulatory and financial; customer and efficiency measures are limited.', 'Monthly reporting takes eight working days to compile manually from spreadsheets.'],
  D11: ['Customer information and billing system is 19 years old and out of vendor support in 2027.', 'Integration is point to point (140+ interfaces) with no integration platform.', 'Staff are using consumer generative AI tools without an approved enterprise alternative.'],
  D12: ['Asset register completeness is estimated at 72%; condition data is unreliable for pipes under 150mm.', 'No data owners have been appointed; three versions of the customer count are reported.', 'Data is not ready for predictive maintenance or AI use cases.'],
  D13: ['Managed IT services contract (single source) has no tested exit plan.', 'Civil maintenance panel performance is not measured against service levels.'],
  D14: ['Head office utilisation averages 48% since hybrid work was introduced.', 'Southern depot lease expires within 12 months with no decision on renewal.'],
  D15: ['Risk framework is sound; operational risk registers are updated inconsistently.', 'Essential Eight maturity is level 1 for most strategies against a target of level 2.', 'Critical operations have not been mapped with impact tolerances.'],
  D16: ['Costs are reported by cost centre only; cost-to-serve by customer segment is unknown.', 'Budgeting is incremental and business cases do not include benefits baselines.'],
  D17: ['43 concurrent projects compete for the same subject-matter experts.', 'Benefits are not tracked after project close; no change management method is applied consistently.'],
};

export function createDemo() {
  const r = rng(20261014);
  const e = blankEngagement({ client: 'Tallowood Water Services' });
  e.kind = 'demo';
  e.details = {
    client: 'Tallowood Water Services',
    industry: 'Water utility (state-owned corporation) — demonstration data',
    name: 'Operating Model Review 2026',
    sponsor: 'Managing Director',
    lead: 'CTO Consulting engagement lead',
    team: 'Engagement lead; senior business analyst; organisation design specialist; enterprise architect; AI and data advisor',
    startDate: day(-63), endDate: day(42), version: '0.8', status: 'Recommendations',
  };
  e.objectives = [
    'Assess the maturity of the current operating model across all 17 dimensions and identify the root causes of rising cost-to-serve.',
    'Design a target operating model that delivers the 2030 strategy: digital customer service, network resilience and affordable prices.',
    'Quantify the costs, benefits, risks and change impacts of moving to the target operating model.',
    'Assess readiness to adopt AI safely and at scale, and identify priority AI use cases.',
    'Provide a sequenced, funded implementation roadmap with change management requirements.',
  ];
  e.scope = {
    units: 'All divisions: Customer & Community, Network Operations, Treatment & Production, Asset Management, Capital Delivery, Corporate Services, Technology & Digital, Strategy & Regulation',
    locations: 'Head office and contact centre (Tallowood), Northern, Southern and Western depots, Riverside and Hilltop treatment plants',
    dimensions: 'All 17 dimensions',
    outOfScope: 'Board composition and remuneration; prioritisation of the capital works program; enterprise agreement negotiations',
    constraints: 'Regulated price path to 2030 caps operating expenditure growth at CPI; enterprise agreement renegotiation due in 2027; commitment to no forced redundancies.',
  };
  e.hypotheses = [
    'Duplicated corporate support roles across divisions add 8–12% to overhead cost.',
    'Unclear decision rights between Asset Management and Network Operations slow maintenance planning and increase reactive work.',
    'Legacy customer and billing systems are the main constraint on digital self-service.',
    'Asset data quality limits predictive maintenance and the adoption of AI.',
    'Change capacity is saturated: too many concurrent projects dilute delivery and benefits.',
  ];
  e.principles = [
    { id: 'DP01', principle: 'Customer first', rationale: 'Customers fund the business through regulated prices and expect easy, reliable service.', implications: 'Design journeys end to end from the customer perspective; measure experience, not just activity.', status: 'Agreed' },
    { id: 'DP02', principle: 'Standardise unless differentiating', rationale: 'Variation across depots and divisions adds cost, risk and complexity without adding customer value.', implications: 'Common processes and systems across units; local variation requires a documented case.', status: 'Agreed' },
    { id: 'DP03', principle: 'Digital by default', rationale: 'Customers and staff expect digital channels; manual processing is costly and error-prone.', implications: 'Self-service first, assisted channels for complex and vulnerable customers; automate rules-based work.', status: 'Agreed' },
    { id: 'DP04', principle: 'Single point of accountability', rationale: 'Shared accountability slows decisions and obscures ownership of outcomes.', implications: 'One decider per key decision; end-to-end owners for value streams and assets.', status: 'Agreed' },
    { id: 'DP05', principle: 'Data is an asset', rationale: 'Asset, customer and operational decisions depend on trusted data.', implications: 'Named data owners; data captured once at source; data quality measured.', status: 'Agreed' },
    { id: 'DP06', principle: 'Lean spans and layers', rationale: 'Narrow spans and deep hierarchies slow decisions and add cost.', implications: 'Spans within benchmark for the nature of work; no more than five layers below the Managing Director.', status: 'Agreed' },
    { id: 'DP07', principle: 'Safety and resilience are non-negotiable', rationale: 'Public health and worker safety are licence-to-operate obligations.', implications: 'Design choices must maintain or improve safety, drinking water quality and resilience.', status: 'Proposed' },
  ];

  // Stakeholders and interviews
  const sh = [
    ['Managing Director', 'Executive', 'CEO & Executive Leadership', 'High', 'High', 'D01; D06; D07', -55, 'Completed', 'Wants a simpler organisation that can deliver the 2030 strategy within the price path.'],
    ['Board Chair', 'Board', 'Board / Chair', 'High', 'Medium', 'D01; D07; D15', -50, 'Completed', 'Concerned about delivery track record of major programs and cyber exposure.'],
    ['Chief Financial Officer', 'Corporate Services', 'CFO & Finance', 'High', 'High', 'D16; D07; D10', -48, 'Completed', 'Cost-to-serve is unknown; budget process is incremental and slow.'],
    ['GM Customer & Community', 'Customer & Community', 'Business Unit & Operations Leaders', 'High', 'High', 'D02; D04; D11', -47, 'Completed', 'Billing system limits digital channels; complaints handled in two systems.'],
    ['GM Network Operations', 'Network Operations', 'Business Unit & Operations Leaders', 'High', 'High', 'D04; D06; D07', -45, 'Completed', 'Maintenance priorities change weekly; unclear who decides between asset and operations.'],
    ['GM Asset Management', 'Asset Management', 'Business Unit & Operations Leaders', 'High', 'High', 'D05; D12; D07', -44, 'Completed', 'Asset data is incomplete; predictive maintenance pilot stalled on data quality.'],
    ['Chief Information Officer', 'Technology & Digital', 'CIO, Technology & Data', 'High', 'High', 'D11; D12; D13', -42, 'Completed', 'Legacy estate and 140+ interfaces; no approved enterprise AI tools yet.'],
    ['Chief People Officer', 'Corporate Services', 'CHRO & People', 'Medium', 'High', 'D08; D09; D06', -41, 'Completed', 'Ageing workforce and critical role succession risk; engagement survey trends down.'],
    ['Chief Risk Officer', 'Strategy & Regulation', 'CRO, Risk, Compliance & Audit', 'Medium', 'High', 'D15; D07', -40, 'Completed', 'Critical operations not yet mapped with tolerances; Essential Eight uplift underway.'],
    ['Procurement Manager', 'Corporate Services', 'Procurement & Supplier Management', 'Medium', 'Medium', 'D13; D16', -35, 'Completed', 'Supplier performance not measured consistently; managed IT contract expires next year.'],
    ['Depot Manager (North)', 'Network Operations', 'Team Leaders & Frontline Staff', 'Low', 'High', 'D04; D08; D09', -33, 'Completed', 'Crews re-enter data in three systems; paper job sheets still used.'],
    ['Contact Centre Team Leader', 'Customer & Community', 'Team Leaders & Frontline Staff', 'Low', 'High', 'D02; D04', -30, 'Completed', 'Average handle time rising; knowledge articles out of date.'],
    ['GM Capital Delivery', 'Capital Delivery', 'Business Unit & Operations Leaders', 'Medium', 'Medium', 'D17; D05', 3, 'Scheduled', ''],
    ['Head of Strategy & Regulation', 'Strategy & Regulation', 'CEO & Executive Leadership', 'Medium', 'High', 'D01; D10', 5, 'Scheduled', ''],
    ['Customer Advisory Panel', 'External', 'Customers & External Partners', 'Low', 'Medium', 'D02', 9, 'Scheduled', ''],
    ['GM Treatment & Production', 'Treatment & Production', 'Business Unit & Operations Leaders', 'Medium', 'Medium', 'D04; D08; D15', '', 'Not scheduled', ''],
  ];
  e.stakeholders = sh.map((s, i) => ({
    id: `S${String(i + 1).padStart(2, '0')}`, name: s[0], role: s[0], unit: s[1], group: s[2], influence: s[3], interest: s[4], dims: s[5],
    date: s[6] === '' ? '' : day(s[6]), interviewer: i % 3 === 0 ? 'Engagement lead' : i % 3 === 1 ? 'Senior business analyst' : 'Organisation design specialist', status: s[7], notes: s[8],
  }));
  const noteFor = {
    'CEO & Executive Leadership': 'Strategy is clear at the top but not translated into divisional plans; the operating model has grown organically.',
    'Business Unit & Operations Leaders': 'Hand-offs between asset planning, operations and capital delivery are the main source of delay and rework.',
    'CFO & Finance': 'Cost reporting stops at cost centre level; no activity-based view of cost-to-serve.',
    'CIO, Technology & Data': 'Technology debt and data quality are the binding constraints on digital and AI ambitions.',
  };
  e.interviews = e.interviews.map((g) => (noteFor[g.group] && g.n <= 2 ? { ...g, notes: noteFor[g.group] } : g));

  // Document requests
  e.documents = e.documents.map((d, i) => {
    const x = r();
    const status = x < 0.62 ? 'Received' : x < 0.76 ? 'Partially received' : x < 0.86 ? 'Requested' : x < 0.93 ? 'Not available' : 'Not requested';
    const requested = status === 'Not requested' ? '' : day(-58 + (i % 12));
    return {
      ...d, requestedFrom: d.owner, requested, due: requested ? day(-44 + (i % 12)) : '',
      received: status === 'Received' || status === 'Partially received' ? day(-40 + (i % 20)) : '', status,
      notes: status === 'Not available' ? 'Does not exist; noted as a finding.' : '',
    };
  });

  // Maturity assessment
  const obsIdx = {};
  e.questions = e.questions.map((q) => {
    const base = DIM_BASE[q.dim];
    let cur = clamp(Math.round(base + (r() - 0.5) * 1.8), 1, 5);
    let current = cur;
    if (q.id === 'D03.08' || q.id === 'D14.08') current = 'N/A';
    const tgt = clamp(DIM_TARGET[q.dim] + (q.importance >= 3 ? 1 : 0) - (r() < 0.2 ? 1 : 0), 2, 5);
    const importance = r() < 0.3 ? 3 : r() < 0.15 ? 1 : 2;
    const obsList = OBSERVATIONS[q.dim] || [];
    obsIdx[q.dim] = obsIdx[q.dim] || 0;
    const observations = obsIdx[q.dim] < obsList.length && r() < 0.6 ? obsList[obsIdx[q.dim]++] : '';
    return {
      ...q, importance, current, target: current === 'N/A' ? '' : Math.max(tgt, cur),
      confidence: r() < 0.55 ? 'High' : r() < 0.8 ? 'Medium' : 'Low',
      evidence: q.evidenceToRequest ? `Reviewed: ${q.evidenceToRequest.split(';')[0].trim()}; interviews` : 'Interviews',
      observations,
    };
  });
  // Make sure every observation lands somewhere.
  for (const d of DIMENSIONS) {
    const list = OBSERVATIONS[d.code] || [];
    const qs = e.questions.filter((q) => q.dim === d.code && q.current !== 'N/A');
    list.forEach((o, k) => {
      if (!e.questions.some((q) => q.observations === o)) {
        const target = qs[(k * 3) % qs.length];
        target.observations = target.observations ? `${target.observations} ${o}` : o;
      }
    });
  }

  // Capabilities
  const critical = ['C06', 'C09', 'C12', 'C13', 'C14', 'C22', 'C24', 'C25', 'C29', 'C34', 'C40', 'C42', 'C44', 'C45', 'C46', 'C47', 'C48', 'C55', 'C56'];
  const owners = { Strategic: 'Managing Director', Core: 'GM Customer & Community', Enabling: 'Chief Financial Officer' };
  e.capabilities = e.capabilities.map((c) => {
    const imp = critical.includes(c.id) ? 'High' : r() < 0.5 ? 'Medium' : 'Low';
    const cur = clamp(Math.round(2.2 + (r() - 0.55) * 2.2), 1, 5);
    const tgt = clamp(imp === 'High' ? 4 : 3, cur, 5);
    const diff = c.tier === 'Core' ? (r() < 0.5 ? 'Differentiating' : 'Competitive parity') : c.tier === 'Strategic' ? 'Competitive parity' : 'Commodity';
    const sourcing = c.tier === 'Enabling' ? (r() < 0.3 ? 'Outsourced' : 'In-house') : 'In-house';
    return {
      ...c, importance: imp, differentiation: diff, current: cur, target: tgt, owner: owners[c.tier], sourcing,
      targetSourcing: c.tier === 'Enabling' && ['C30', 'C31', 'C32', 'C35', 'C39', 'C51'].includes(c.id) ? 'Shared service' : sourcing,
      changeType: tgt - cur >= 2 ? 'Uplift' : tgt > cur ? 'Uplift' : 'Maintain',
      horizon: tgt - cur >= 2 ? '3–12 months' : '12–24 months',
      notes: c.id === 'C55' ? 'Asset data incomplete; investment planning relies on age rather than condition.' : c.id === 'C45' ? 'No enterprise AI capability; shadow AI use observed.' : '',
    };
  });
  e.capabilities.find((c) => c.id === 'C45').current = 1;
  e.capabilities.find((c) => c.id === 'C46').current = 1;

  // Processes
  const autos = ['Manual', 'Partially automated', 'Highly automated'];
  e.processes = e.processes.map((p, i) => {
    const documented = r() < 0.45 ? 'Yes' : r() < 0.6 ? 'Partial' : 'No';
    const automation = autos[r() < 0.45 ? 0 : r() < 0.8 ? 1 : 2];
    const vol = [2400, 18000, 5200, 900, 38000, 1200, 650, 7400][i % 8];
    const fte = +(vol / 1000 * (1.5 + r() * 3)).toFixed(1);
    return {
      ...p, owner: i % 4 === 0 ? 'GM Customer & Community' : i % 4 === 1 ? 'GM Network Operations' : i % 4 === 2 ? 'Chief Financial Officer' : 'GM Asset Management',
      units: i % 3 === 0 ? 'Customer & Community; Network Operations' : 'Corporate Services', documented, standardised: documented === 'Yes' ? 'Partial' : 'No',
      automation, volume: vol, cycleTime: +(2 + r() * 18).toFixed(1), fte, handoffs: Math.round(2 + r() * 6),
      painPoints: i % 5 === 0 ? 'Re-keying between systems; manual exception handling' : i % 7 === 0 ? 'Unclear ownership across divisions' : '',
      maturity: clamp(Math.round(2 + (r() - 0.5) * 2), 1, 5), opportunity: i % 4 === 0 ? 'Standardise and automate exception handling' : '',
      priority: i % 4 === 0 ? 'High' : i % 3 === 0 ? 'Medium' : 'Low',
      targetAutomation: automation === 'Manual' ? 'Partially automated' : 'Highly automated',
      targetCycleTime: '', targetFte: +(fte * 0.8).toFixed(1),
    };
  });

  // Organisation structure (current and target)
  const units = [
    ['Customer & Community', 'GM Customer & Community', 'Standardised / operational', 168, 14, 6, 22, 19, 6, 18900000, 9, 'Retain', 152, 10, 4, 22, 13, 5, 16700000],
    ['Network Operations', 'GM Network Operations', 'Standardised / operational', 312, 10, 18, 45, 41, 7, 34200000, 14, 'Resize', 298, 8, 10, 45, 27, 5, 32100000],
    ['Treatment & Production', 'GM Treatment & Production', 'Mixed / professional', 142, 4, 6, 8, 17, 6, 15800000, 5, 'Retain', 140, 4, 4, 8, 15, 5, 15500000],
    ['Asset Management', 'GM Asset Management', 'Specialist / complex', 96, 8, 14, 0, 16, 6, 12600000, 6, 'Resize', 102, 6, 6, 0, 16, 5, 13100000],
    ['Capital Delivery', 'GM Capital Delivery', 'Mixed / professional', 74, 12, 28, 0, 13, 5, 10400000, 4, 'Retain', 78, 10, 18, 0, 11, 5, 10200000],
    ['Corporate Services', 'Chief Financial Officer', 'Mixed / professional', 118, 9, 11, 4, 22, 6, 13100000, 7, 'Resize', 84, 6, 4, 4, 11, 4, 9400000],
    ['Technology & Digital', 'Chief Information Officer', 'Specialist / complex', 64, 6, 31, 24, 12, 5, 9800000, 8, 'Resize', 72, 4, 14, 24, 12, 4, 10300000],
    ['Strategy & Regulation', 'Head of Strategy & Regulation', 'Specialist / complex', 26, 3, 2, 0, 6, 4, 4100000, 1, 'Retain', 26, 2, 1, 0, 5, 4, 4000000],
    ['Shared Services Centre', 'Head of Shared Services', 'Highly routine / transactional', '', '', '', '', '', '', '', '', 'New', 38, 2, 0, 0, 3, 4, 3300000],
    ['Data & AI Centre of Excellence', 'Chief Data & AI Officer', 'Specialist / complex', '', '', '', '', '', '', '', '', 'New', 12, 2, 3, 0, 2, 4, 2100000],
  ];
  e.orgUnits = units.map((u, i) => ({
    id: `O${String(i + 1).padStart(2, '0')}`, name: u[0], head: u[1], nature: u[2], perm: u[3], fixed: u[4], contractor: u[5], outsourced: u[6], managers: u[7], layers: u[8], cost: u[9], vacancies: u[10],
    notes: i === 1 ? 'Three depots run different work management practices; seven layers from MD to crew member.' : i === 5 ? 'Transactional finance, HR and procurement roles duplicated in divisions.' : '',
    tAction: u[11], tPerm: u[12], tFixed: u[13], tContractor: u[14], tOutsourced: u[15], tManagers: u[16], tLayers: u[17], tCost: u[18],
    tNotes: u[11] === 'New' ? 'New unit in the target operating model.' : i === 5 ? 'Transactional services move to the Shared Services Centre.' : '',
  }));

  // Decision rights (RAPID): current as observed, target as designed
  const roles = e.rapidRoles; // Board, ARC, CEO, ExCo, IC, CFO, COO, CIO, CHRO, CRO, BU Head
  const rp = (codes) => Object.fromEntries(codes.split('').slice(0, roles.length).map((c, i) => [roles[i], c === '-' ? '' : c]).filter(([, c]) => c));
  const decisionsCurrent = {
    DEC01: ['D-RA-II-I-I', 'D-RI-II-I-I'], DEC02: ['DIRAIRIIII-', 'D-RIIRIIII-'],
  };
  e.decisions = e.decisions.map((d, i) => {
    const pattern = decisionsCurrent[d.id];
    const current = pattern ? rp(pattern[0]) : rp(['--DAIRIIII-', '---DIR-I--P', '--AIDRI-I-R', '---DAIRI--P', '----DRI-I-R', '-----IDI--R'][i % 6]);
    if (i % 5 === 2) { const k = Object.keys(current).find((x) => current[x] === 'D'); if (k) current[k] = 'A'; } // no decider
    if (i % 7 === 3) current[roles[10]] = 'D'; // multiple deciders
    const target = pattern ? rp(pattern[1]) : rp(['--DRI-I-I--', '---DIR-I--P', '---IDR--I-R', '---DIRI---P', '----DRI-I-R', '-----IDI--R'][i % 6]);
    return { ...d, current, target, documented: i % 3 === 0 ? 'No' : 'Yes', days: [14, 28, 45, 21, 60, 10, 35][i % 7], targetDays: [7, 14, 21, 10, 30, 5, 14][i % 7], notes: i % 5 === 2 ? 'Sign-off sought from several executives; no clear decider.' : '' };
  });

  // Applications
  const apps = [
    ['Customer Information & Billing', 'Customer accounts, metering, billing and payments', 'Revenue & receivables management; Customer relationship management', 'GM Customer & Community', 'Applications Manager', 'Vendor billing suite (v8.1, customised)', 'On-premises', 180, 'Critical', 1450000, 420, 'Extended support', 4, 1, 'Confidential', 38, 'Contact history duplicated in CRM', 'Heavy customisation; vendor support ends 2027.', 'Replace', 1100000],
    ['Customer Relationship Management', 'Case and contact management for the contact centre', 'Customer relationship management; Complaints & feedback management', 'GM Customer & Community', 'Applications Manager', 'SaaS CRM', 'SaaS', 140, 'High', 380000, 900, 'Supported', 3, 4, 'Confidential', 9, 'Overlaps billing contact history', '', 'Invest', 420000],
    ['Enterprise Asset Management', 'Asset register, work orders and maintenance planning', 'Asset management; Scheduling & resource allocation', 'GM Asset Management', 'Solutions Architect', 'Vendor EAM suite (v7.6)', 'Private cloud', 420, 'Critical', 920000, 610, 'Supported', 4, 3, 'Internal', 24, '', 'Mobility module not deployed; crews use paper job sheets.', 'Invest', 980000],
    ['Geographic Information System', 'Network spatial data', 'Asset management', 'GM Asset Management', 'GIS Lead', 'Vendor GIS (v10.8)', 'On-premises', 260, 'High', 310000, 380, 'Supported', 4, 3, 'Internal', 12, '', '', 'Migrate', 290000],
    ['SCADA / Telemetry', 'Real-time control of treatment and network assets', 'Service fulfilment', 'GM Treatment & Production', 'OT Manager', 'Vendor SCADA (v6)', 'On-premises', 60, 'Critical', 540000, 1400, 'Supported', 4, 3, 'Restricted', 18, '', 'OT network segmentation incomplete.', 'Retain', 540000],
    ['Laboratory Information Management', 'Water quality sampling and results', 'Quality management', 'GM Treatment & Production', 'Lab Manager', 'Vendor LIMS (v5.2)', 'On-premises', 35, 'High', 120000, 200, 'End of life', 3, 1, 'Internal', 4, '', 'Unsupported; manual export to regulator.', 'Replace', 110000],
    ['Finance ERP', 'General ledger, accounts payable, purchasing', 'Financial accounting & reporting; Payables & payments', 'Chief Financial Officer', 'ERP Lead', 'Vendor ERP (v12)', 'Private cloud', 210, 'Critical', 690000, 1100, 'Supported', 3, 3, 'Confidential', 21, 'Overlaps procurement tool', '', 'Retain', 690000],
    ['HR & Payroll', 'Employee records, payroll, leave', 'Payroll & HR administration', 'Chief People Officer', 'HRIS Lead', 'Vendor HRIS (v9)', 'On-premises', 1100, 'High', 410000, 150, 'Extended support', 3, 2, 'Confidential', 11, '', 'Payroll exceptions handled manually.', 'Replace', 380000],
    ['Procurement & Contracts', 'Sourcing and contract register', 'Sourcing & procurement; Contract management', 'Procurement Manager', 'ERP Lead', 'Bolt-on tool', 'SaaS', 60, 'Medium', 95000, 520, 'Supported', 2, 3, 'Internal', 3, 'Duplicates ERP purchasing', '', 'Consolidate', 0],
    ['Document & Records Management', 'Records and document management', 'Records & information management', 'Head of Strategy & Regulation', 'Records Manager', 'Vendor EDRMS (v8)', 'On-premises', 900, 'Medium', 160000, 700, 'Supported', 3, 2, 'Confidential', 6, 'Shared drives used in parallel', '', 'Migrate', 140000],
    ['Field Mobility App', 'Paper-based job sheets supplemented by a pilot app', 'Service fulfilment', 'GM Network Operations', 'Applications Manager', 'In-house app (pilot)', 'Public cloud (IaaS / PaaS)', 40, 'Medium', 60000, '', 'Unknown', 2, 2, 'Internal', 2, 'Duplicates EAM mobility', 'Pilot not scaled.', 'Retire', 0],
    ['Reporting & BI', 'Management and regulatory reporting', 'Analytics & reporting', 'Chief Financial Officer', 'BI Lead', 'Desktop BI + spreadsheets', 'Hybrid', 120, 'High', 140000, 800, 'Supported', 2, 2, 'Confidential', 14, 'Multiple versions of KPIs', 'Monthly pack takes eight days.', 'Replace', 260000],
    ['Customer Portal', 'Online bill payment and account view', 'Channel management', 'GM Customer & Community', 'Digital Lead', 'Custom web portal', 'Public cloud (IaaS / PaaS)', 25000, 'High', 210000, 540, 'Supported', 3, 2, 'Confidential', 5, '', 'Limited self-service transactions.', 'Replace', 180000],
    ['Hydraulic Modelling', 'Network modelling', 'Asset management', 'GM Asset Management', 'Modelling Lead', 'Vendor modelling tool', 'On-premises', 12, 'Medium', 85000, 300, 'Supported', 4, 4, 'Internal', 2, '', '', 'Retain', 85000],
    ['Legacy Complaints Database', 'Complaints register (Access database)', 'Complaints & feedback management', 'GM Customer & Community', 'Applications Manager', 'In-house database', 'On-premises', 20, 'Low', 15000, '', 'End of life', 2, 1, 'Confidential', 1, 'Duplicates CRM cases', 'To be retired.', 'Retire', 0],
    ['Fleet Management', 'Vehicle bookings and telematics', 'Asset management', 'GM Network Operations', 'Fleet Manager', 'SaaS fleet tool', 'SaaS', 300, 'Medium', 70000, 480, 'Supported', 3, 4, 'Internal', 2, '', '', 'Retain', 70000],
  ];
  e.applications = apps.map((a, i) => ({
    id: `A${String(i + 1).padStart(3, '0')}`, name: a[0], description: a[1], capabilities: a[2], businessOwner: a[3], technicalOwner: a[4], vendor: a[5], hosting: a[6],
    users: a[7], criticality: a[8], cost: a[9], supportEnd: a[10] === '' ? '' : day(a[10]), supportStatus: a[11], businessFit: a[12], technicalFit: a[13], classification: a[14],
    interfaces: a[15], overlap: a[16], notes: a[17], disposition: a[18], targetCost: a[19],
  }));

  // Suppliers
  const sups = [
    ['Managed IT services provider', 'Service desk, end-user support and infrastructure operations', 'IT service management; Infrastructure & cloud operations', 'Strategic', 3200000, -1100, 250, 'Yes', 'Yes', 'Partial', 3, 'ISO/IEC 27001 certified', 'Chief Information Officer', 'No tested exit plan; knowledge concentrated in the provider.', 'Renegotiate', 2900000],
    ['Civil maintenance panel (4 contractors)', 'Mains repairs, reinstatement and minor works', 'Service fulfilment', 'Strategic', 8600000, -900, 540, 'Yes', 'No', 'Yes', 3, 'Assessed by client', 'GM Network Operations', 'Performance not measured against service levels.', 'Renegotiate', 8100000],
    ['Treatment chemicals supplier', 'Chlorine, alum and fluoride supply', 'Service fulfilment', 'Bottleneck', 2100000, -400, 700, 'Yes', 'Yes', 'No', 4, 'Not assessed', 'GM Treatment & Production', 'Single source; supply disruption risk.', 'Retain', 2150000],
    ['Contact centre overflow provider', 'After-hours and peak call handling', 'Customer support', 'Leverage', 780000, -300, 120, 'No', 'No', 'Yes', 3, 'SOC 2 Type II report', 'GM Customer & Community', 'Contract decision due within the warning period.', 'Consolidate', 420000],
    ['Meter reading contractor', 'Quarterly manual meter reads', 'Revenue & receivables management', 'Leverage', 1650000, -700, 900, 'No', 'No', 'Yes', 3, 'Assessed by client', 'GM Customer & Community', 'Digital metering business case under development.', 'Retain', 1500000],
    ['Laboratory testing services', 'External water quality testing', 'Quality management', 'Strategic', 640000, -500, 380, 'Yes', 'Yes', 'Partial', 4, 'Assessed by client', 'GM Treatment & Production', 'NATA accredited.', 'Retain', 640000],
    ['Billing system vendor', 'Licences and application support', 'Revenue & receivables management', 'Bottleneck', 950000, -2000, 420, 'Yes', 'Yes', 'No', 2, 'Not assessed', 'Chief Information Officer', 'End of support 2027.', 'Exit', 0],
    ['Public cloud provider', 'Cloud hosting and platform services', 'Infrastructure & cloud operations', 'Strategic', 720000, -600, 1200, 'Yes', 'No', 'Partial', 4, 'ISO/IEC 27001 certified', 'Chief Information Officer', '', 'Retain', 1150000],
    ['Fleet leasing', 'Operational vehicle leases', 'Asset management', 'Leverage', 1900000, -800, 610, 'No', 'No', 'Yes', 4, 'Not assessed', 'GM Network Operations', '', 'Retain', 1800000],
    ['Electricity retailer', 'Energy for pumping and treatment', 'Service fulfilment', 'Leverage', 4300000, -300, 400, 'No', 'No', 'Yes', 3, 'Not assessed', 'Chief Financial Officer', 'Renewable PPA under evaluation.', 'Renegotiate', 3900000],
    ['Recruitment agency panel', 'Temporary and permanent recruitment', 'Talent acquisition', 'Non-critical', 520000, -200, 160, 'No', 'No', 'Yes', 3, 'Not assessed', 'Chief People Officer', '', 'Consolidate', 380000],
    ['Security services', 'Site security and monitoring', 'Property & facilities management', 'Non-critical', 410000, -600, 800, 'No', 'No', 'Yes', 4, 'Not assessed', 'Chief Financial Officer', '', 'Retain', 380000],
    ['Engineering consultancy panel', 'Design and investigation services', 'Program & project delivery', 'Leverage', 3400000, -500, 950, 'No', 'No', 'Yes', 3, 'Assessed by client', 'GM Capital Delivery', 'High use of consultants for business-as-usual design work.', 'Renegotiate', 2800000],
    ['Mail house and print', 'Bill printing and mailing', 'Revenue & receivables management', 'Non-critical', 380000, -900, 90, 'No', 'Yes', 'No', 3, 'Not assessed', 'GM Customer & Community', 'Volume will fall with e-billing.', 'Consolidate', 190000],
  ];
  e.suppliers = sups.map((s, i) => ({
    id: `SUP${String(i + 1).padStart(3, '0')}`, name: s[0], services: s[1], supports: s[2], segment: s[3], spend: s[4], start: day(s[5]), end: day(s[6]),
    material: s[7], singleSource: s[8], exitPlan: s[9], performance: s[10], assurance: s[11], owner: s[12], notes: s[13], targetAction: s[14], targetSpend: s[15],
  }));

  // Locations
  const locs = [
    ['Tallowood Head Office', 'Tallowood, NSW', 'Head office', 'Executive, corporate services, asset management, technology', 420, 380, 0.48, 'Leased', 1300, 4200000, 'Yes', 'Northern depot; work from home', 'Utilisation below 50% since hybrid work.', 'Consolidate', 400, 3100000],
    ['Tallowood Contact Centre', 'Tallowood, NSW', 'Contact centre', 'Customer contact and billing', 110, 120, 0.71, 'Leased', 700, 950000, 'Yes', 'Work from home; overflow provider', '', 'Relocate', 95, 0],
    ['Northern Depot', 'Casterton, NSW', 'Operations site', 'Network operations and fleet', 160, 60, 0.82, 'Owned', '', 620000, 'Yes', 'Western depot', '', 'Retain', 165, 620000],
    ['Southern Depot', 'Millbrook, NSW', 'Operations site', 'Network operations', 120, 40, 0.77, 'Leased', 300, 540000, 'Yes', 'Northern depot', 'Lease expires within 12 months.', 'Retain', 125, 560000],
    ['Western Depot', 'Ridgeway, NSW', 'Operations site', 'Network operations and stores', 95, 35, 0.69, 'Owned', '', 410000, 'No', 'Northern depot', '', 'Retain', 95, 410000],
    ['Riverside Treatment Plant', 'Tallowood, NSW', 'Operations site', 'Water treatment and laboratory', 85, 30, 0.9, 'Owned', '', 780000, 'Yes', 'Hilltop plant', '', 'Retain', 85, 780000],
    ['Hilltop Treatment Plant', 'Casterton, NSW', 'Operations site', 'Water and wastewater treatment', 70, 25, 0.88, 'Owned', '', 690000, 'Yes', 'Riverside plant', '', 'Retain', 70, 690000],
    ['Co-located Data Centre', 'Sydney, NSW', 'Data centre', 'Primary data centre (co-location)', 0, 0, '', 'Shared / co-located', 520, 460000, 'Yes', 'Public cloud', 'Workloads migrating to cloud.', 'Exit', 0, 0],
  ];
  e.locations = locs.map((l, i) => ({
    id: `L${String(i + 1).padStart(2, '0')}`, name: l[0], city: l[1], type: l[2], functions: l[3], fte: l[4], capacity: l[5], utilisation: l[6], tenure: l[7],
    leaseExpiry: l[8] === '' ? '' : day(l[8]), cost: l[9], critical: l[10], bcp: l[11], notes: l[12], targetAction: l[13], targetFte: l[14], targetCost: l[15],
  }));

  // Cost baseline and target cost model (AUD, latest full financial year)
  const cb = [
    ['Customer & Community', 18900000, 1300000, 2600000, 1100000, 3900000, 900000, 210, 1200000],
    ['Network Operations', 34200000, 2900000, 1900000, 1600000, 12800000, 6100000, 385, 1800000],
    ['Treatment & Production', 15800000, 700000, 1200000, 1500000, 3200000, 5600000, 160, 900000],
    ['Asset Management', 12600000, 2400000, 1400000, 600000, 900000, 700000, 118, 1400000],
    ['Capital Delivery', 10400000, 4600000, 500000, 400000, 3400000, 500000, 114, 3100000],
    ['Corporate Services', 13100000, 1500000, 1100000, 4700000, 1300000, 1600000, 142, 700000],
    ['Technology & Digital', 9800000, 5200000, 9400000, 500000, 4200000, 300000, 125, 4600000],
    ['Strategy & Regulation', 4100000, 400000, 200000, 200000, 300000, 500000, 31, 200000],
  ];
  e.costs = cb.map((c, i) => ({ id: `CB${String(i + 1).padStart(2, '0')}`, unit: c[0], employee: c[1], contractor: c[2], technology: c[3], property: c[4], outsourced: c[5], other: c[6], fte: c[7], change: c[8], notes: '' }));
  const tcb = [
    ['Customer & Community', 16700000, 600000, 3100000, 800000, 3300000, 700000, 188],
    ['Network Operations', 32100000, 1400000, 2400000, 1500000, 12100000, 5800000, 361],
    ['Treatment & Production', 15500000, 500000, 1300000, 1500000, 3200000, 5400000, 156],
    ['Asset Management', 13100000, 900000, 1700000, 500000, 800000, 700000, 114],
    ['Capital Delivery', 10200000, 3000000, 500000, 400000, 2800000, 500000, 106],
    ['Corporate Services', 9400000, 700000, 1000000, 3300000, 1100000, 1200000, 94],
    ['Technology & Digital', 10300000, 2900000, 10200000, 300000, 3900000, 300000, 114],
    ['Strategy & Regulation', 4000000, 200000, 200000, 200000, 300000, 500000, 29],
    ['Shared Services Centre', 3300000, 0, 400000, 300000, 0, 200000, 40],
    ['Data & AI Centre of Excellence', 2100000, 500000, 900000, 100000, 0, 100000, 17],
  ];
  e.targetCosts = tcb.map((c, i) => ({ id: `TC${String(i + 1).padStart(2, '0')}`, unit: c[0], employee: c[1], contractor: c[2], technology: c[3], property: c[4], outsourced: c[5], other: c[6], fte: c[7], notes: '' }));

  // Findings
  const F = [
    ['D07', 'Delegations of authority', 'Investment decisions below $250k are escalated to the Executive Committee, adding four to six weeks to minor change.', 'Executive Committee minutes (last 12 months); six interviews', 'Delegations not updated since the 2021 restructure', 'Slower delivery of minor change; executive time spent on low-value decisions', 'High', 'D07.03; D07.05', 'Yes', 'Chief Financial Officer', 'Validated'],
    ['D07', 'Decision rights', 'No single decider for maintenance prioritisation between Asset Management and Network Operations.', 'Decision rights workshop; RAPID mapping', 'Accountabilities split in the 2021 restructure without a decision rights model', 'Reactive maintenance at 58% of work orders; repeated re-planning', 'Critical', 'D07.04', 'Yes', 'Managing Director', 'Validated'],
    ['D06', 'Spans of control', 'Average span of control is 8.1, and operational units sit below the 11–15 benchmark for operational work; 41 managers in Network Operations.', 'HR extract; org charts', 'Organic growth of team leader roles; roles created to reward tenure', 'Higher management cost (est. $3.1m) and slower decisions', 'High', 'D06.02; D06.03', 'Yes', 'Chief People Officer', 'Validated'],
    ['D06', 'Duplication & shadow functions', 'About 46 FTE of finance, HR and procurement work is performed in divisions, duplicating Corporate Services.', 'Activity survey; HR extract', 'Low trust in central service levels', 'Duplicated cost; inconsistent practices and data', 'High', 'D06.07', 'Yes', 'Chief Financial Officer', 'Validated'],
    ['D11', 'Application portfolio', 'The customer information and billing system is 19 years old, heavily customised and exits vendor support in 2027.', 'Application portfolio review; vendor notices', 'Deferred investment decisions', 'Limits digital self-service; rising support cost and operational risk', 'Critical', 'D11.03; D11.04', 'Yes', 'Chief Information Officer', 'Validated'],
    ['D11', 'Integration', 'More than 140 point-to-point interfaces with no integration platform.', 'Architecture repository; interviews', 'Tactical integration on each project', 'High change cost and fragility; slows new capability', 'Medium', 'D11.06', 'Yes', 'Chief Information Officer', 'Open'],
    ['D12', 'Data quality', 'Asset register completeness is about 72%; condition data for small mains is unreliable.', 'Data profiling; asset management plans', 'No data ownership; data captured on paper in the field', 'Investment decisions based on age not condition; predictive maintenance pilot stalled', 'High', 'D12.03; D12.09', 'Yes', 'GM Asset Management', 'Validated'],
    ['D12', 'Data governance', 'No data owners or stewards appointed; three different customer counts are reported.', 'Board and regulatory reports', 'No data governance framework', 'Reporting errors and rework; low trust in data', 'High', 'D12.02', 'Yes', 'Chief Information Officer', 'Validated'],
    ['D02', 'Channel strategy', '71% of customer contacts are by phone; digital self-service is limited to bill payment.', 'Channel volumes; contact centre reports', 'Legacy billing platform; no channel strategy', 'High cost-to-serve; customer effort', 'High', 'D02.04; D02.05', 'Yes', 'GM Customer & Community', 'Validated'],
    ['D02', 'Voice of customer', 'Complaints are recorded in two systems and not analysed for root causes.', 'Complaints registers', 'Legacy database retained after CRM rollout', 'Repeat complaints; missed improvement opportunities', 'Medium', 'D02.06', 'Pending', 'GM Customer & Community', 'Open'],
    ['D04', 'Standardisation', 'Work order processes differ across the three depots; no end-to-end process owner.', 'Process walkthroughs at three depots', 'Depots evolved independently', 'Variable productivity and data quality', 'Medium', 'D04.03; D04.05', 'Yes', 'GM Network Operations', 'Validated'],
    ['D04', 'Automation', 'About 4,000 billing exceptions a month are handled manually.', 'Billing exception reports', 'Legacy platform rules; no automation capability', 'Around 9 FTE of manual effort; errors', 'Medium', 'D04.07', 'Yes', 'GM Customer & Community', 'Validated'],
    ['D08', 'Critical roles & succession', 'No succession cover for treatment operators and SCADA engineers; 31% of operational staff can retire within 10 years.', 'Workforce data; interviews', 'No strategic workforce plan', 'Operational continuity and compliance risk', 'High', 'D08.01; D08.05', 'Yes', 'Chief People Officer', 'Validated'],
    ['D10', 'Management reporting', 'Monthly management pack takes eight working days to compile manually.', 'Reporting process walkthrough', 'No reporting platform; spreadsheets', 'Late, error-prone information for decisions', 'Medium', 'D10.04; D10.08', 'Yes', 'Chief Financial Officer', 'Open'],
    ['D13', 'Concentration & dependency', 'The managed IT services provider is single source with no tested exit plan.', 'Contract review', 'Exit planning not required in the original contract', 'Resilience and negotiation risk at renewal', 'High', 'D13.05', 'Yes', 'Chief Information Officer', 'Validated'],
    ['D14', 'Space utilisation', 'Head office utilisation averages 48% since hybrid work was introduced.', 'Badge data; space audit', 'Footprint not reviewed after hybrid work', 'About $1.1m a year of under-used space', 'Low', 'D14.03', 'Yes', 'Chief Financial Officer', 'Validated'],
    ['D15', 'Cyber security', 'Essential Eight maturity is level 1 for six of eight strategies against a target of level 2.', 'Cyber maturity assessment', 'Under-investment; legacy platforms', 'Elevated cyber risk to customer data and operational technology', 'Critical', 'D15.07', 'Yes', 'Chief Information Officer', 'Validated'],
    ['D15', 'Business continuity & resilience', 'Critical operations have not been mapped with impact tolerances.', 'BCM documentation', 'Resilience program focuses on IT recovery only', 'Unknown ability to withstand severe disruption', 'Medium', 'D15.08', 'Pending', 'Chief Risk Officer', 'Open'],
    ['D16', 'Cost-to-serve', 'Costs are reported by cost centre only; cost-to-serve by customer segment and service is unknown.', 'Finance reports', 'No activity-based costing', 'Cannot target efficiency or inform pricing', 'Medium', 'D16.02', 'Yes', 'Chief Financial Officer', 'Validated'],
    ['D17', 'Change capacity', '43 concurrent projects compete for the same subject-matter experts; delivery performance is poor.', 'Portfolio register; PMO reports', 'No portfolio prioritisation against capacity', 'Delays, cost overruns and change fatigue', 'High', 'D17.01; D17.04', 'Yes', 'Managing Director', 'Validated'],
    ['D17', 'Benefits realisation', 'Benefits are not tracked after project close.', 'Post-implementation reviews', 'No benefits framework or owners', 'Investment value not demonstrated', 'Medium', 'D17.06', 'Yes', 'Chief Financial Officer', 'Validated'],
    ['D11', 'Digital, automation & AI', 'Staff are using consumer generative AI tools with customer information; no AI policy or approved tools.', 'Staff survey; proxy logs', 'No AI governance or enterprise tooling', 'Privacy and data leakage risk; missed productivity benefits', 'High', 'D11.09; D12.09', 'Yes', 'Chief Information Officer', 'Validated'],
  ];
  e.findings = F.map((f, i) => ({
    id: `F${String(i + 1).padStart(3, '0')}`, date: day(-40 + i), dim: f[0], sub: f[1], finding: f[2], evidence: f[3], rootCause: f[4], impact: f[5], severity: f[6],
    questions: f[7], validated: f[8], owner: f[9], recs: '', status: f[10],
  }));

  // Recommendations
  const R = [
    ['D07', 'Refresh delegations of authority to align with the structure and risk appetite, devolving investment decisions below $250k to divisional heads.', 'F001', 'Faster minor change; executive time refocused on strategy', 4, 4, '0–3 months', 40000, 'Chief Financial Officer', 'Risk appetite refresh', 'Weaker control if delegations are not system-enforced', 'Endorsed'],
    ['D07', 'Implement a RAPID decision rights model for the 20 key decisions, with a single decider for maintenance prioritisation.', 'F002', 'Faster, clearer decisions; less reactive maintenance', 5, 4, '0–3 months', 60000, 'Managing Director', 'Executive agreement', 'Resistance from divisions losing decision rights', 'Endorsed'],
    ['D06', 'Restructure to lean spans and layers (maximum five layers below the MD; spans within benchmark).', 'F003', 'Management cost savings of about $3m a year; faster decisions', 4, 2, '3–12 months', 450000, 'Chief People Officer', 'Consultation under the enterprise agreement', 'Industrial relations; loss of experienced staff', 'Proposed'],
    ['D06', 'Establish a Shared Services Centre for transactional finance, HR and procurement.', 'F004', 'Removes duplicated effort (about 46 FTE); consistent data', 5, 2, '3–12 months', 1900000, 'Chief Financial Officer', 'ERP and HRIS readiness; service catalogue', 'Service disruption during transition', 'Proposed'],
    ['D11', 'Replace the customer information and billing system with a SaaS platform integrated with CRM and the customer portal.', 'F005; F009', 'Digital self-service; retire legacy risk; lower support cost', 5, 1, '12–24 months', 14500000, 'Chief Information Officer', 'Data migration; integration platform', 'Complex migration; delivery overrun', 'Proposed'],
    ['D11', 'Implement an integration platform and API standards; retire point-to-point interfaces progressively.', 'F006', 'Lower change cost; reuse', 4, 3, '3–12 months', 1200000, 'Chief Information Officer', 'Architecture governance', 'Skills gap', 'Proposed'],
    ['D12', 'Establish data governance: data owners and stewards, critical data elements and quality measures.', 'F007; F008', 'Trusted data for decisions, regulation and AI', 5, 4, '0–3 months', 180000, 'Chief Information Officer', 'Executive sponsorship', 'Seen as bureaucratic without quick wins', 'Endorsed'],
    ['D12', 'Remediate asset data and deploy field mobility so data is captured once at source.', 'F007', 'Condition-based investment; predictive maintenance', 5, 3, '3–12 months', 2600000, 'GM Asset Management', 'EAM mobility module', 'Field adoption', 'Proposed'],
    ['D02', 'Define a channel strategy and expand digital self-service for the top ten contact reasons.', 'F009', 'Contact volumes down 25%; better customer experience', 4, 3, '3–12 months', 850000, 'GM Customer & Community', 'Billing platform capability', 'Digital exclusion of vulnerable customers', 'Proposed'],
    ['D02', 'Retire the legacy complaints database and implement root-cause analysis in CRM.', 'F010', 'Fewer repeat complaints', 3, 5, '0–3 months', 60000, 'GM Customer & Community', '', 'Minimal', 'Endorsed'],
    ['D04', 'Appoint end-to-end process owners and standardise work management across depots.', 'F011', 'Productivity and data quality improvements', 4, 3, '3–12 months', 320000, 'GM Network Operations', 'Decision rights model', 'Depot resistance', 'Proposed'],
    ['D04', 'Automate billing exception handling with intelligent automation.', 'F012', 'Releases about 7 FTE; fewer errors', 3, 4, '3–12 months', 280000, 'GM Customer & Community', 'Automation platform', 'Rework if billing platform is replaced', 'Proposed'],
    ['D08', 'Develop a strategic workforce plan with succession for critical operational roles.', 'F013', 'Operational continuity', 4, 4, '0–3 months', 120000, 'Chief People Officer', '', 'Data availability', 'Endorsed'],
    ['D10', 'Implement a balanced KPI framework and automated reporting platform.', 'F014', 'Monthly pack in two days; better decisions', 4, 3, '3–12 months', 540000, 'Chief Financial Officer', 'Data governance', 'Adoption by managers', 'Proposed'],
    ['D13', 'Develop and test an exit plan for the managed IT services contract ahead of renegotiation.', 'F015', 'Resilience; negotiation leverage', 4, 4, '0–3 months', 90000, 'Chief Information Officer', '', 'Provider cooperation', 'Endorsed'],
    ['D14', 'Consolidate head office space and relocate the contact centre into head office.', 'F016', 'Property savings of about $1.1m a year', 3, 3, '12–24 months', 1400000, 'Chief Financial Officer', 'Hybrid work policy', 'Staff concerns', 'Proposed'],
    ['D15', 'Uplift Essential Eight to maturity level 2 and map critical operations with impact tolerances.', 'F017; F018', 'Reduced cyber and resilience risk', 5, 3, '3–12 months', 1600000, 'Chief Information Officer', 'Funding', 'Competing priorities', 'In progress'],
    ['D17', 'Establish strategic portfolio management with capacity-based prioritisation and a benefits framework.', 'F020; F021', 'Fewer, better-delivered projects; benefits realised', 5, 3, '0–3 months', 350000, 'Managing Director', 'Executive commitment to stop projects', 'Pressure to keep pet projects', 'Endorsed'],
    ['D11', 'Approve an AI policy, provide an enterprise generative AI assistant and launch AI literacy training.', 'F022', 'Productivity; reduced shadow AI risk', 4, 4, '0–3 months', 420000, 'Chief Information Officer', 'Data classification; privacy impact assessment', 'Data leakage if controls are weak', 'Endorsed'],
  ];
  e.recommendations = R.map((x, i) => ({
    id: `R${String(i + 1).padStart(3, '0')}`, dim: x[0], recommendation: x[1], findings: x[2], benefits: x[3], value: x[4], ease: x[5], horizon: x[6], cost: x[7],
    owner: x[8], dependencies: x[9], risks: x[10], status: x[11],
  }));
  e.findings = e.findings.map((f) => ({ ...f, recs: e.recommendations.filter((rr) => rr.findings.includes(f.id)).map((rr) => rr.id).join('; ') }));

  // AI readiness
  const pillarBase = { STR: 2.2, VAL: 1.7, DAT: 1.5, TEC: 2.0, PPL: 1.8, GOV: 1.4, SEC: 2.1, OPM: 1.5 };
  for (const q of AI_QUESTIONS) {
    const cur = clamp(Math.round(pillarBase[q.pillar] + (r() - 0.5) * 1.6), 1, 5);
    e.ai.responses[q.id] = { current: cur, target: clamp(cur + (r() < 0.6 ? 2 : 1), 3, 4), evidence: r() < 0.5 ? 'Interviews; document review' : '', notes: '' };
  }
  e.ai.context = {
    aiStrategy: 'No AI strategy. Digital strategy (2024) mentions AI as a future opportunity.',
    accountableOfficial: 'Not yet appointed (recommended: Chief Information Officer as interim accountable executive).',
    aiInventoryCount: '7 known (including vendor-embedded AI in CRM and EAM)',
    genAiPolicy: 'Draft acceptable-use guidance only',
    notes: 'Proxy logs show regular use of consumer generative AI tools by around 180 staff.',
  };
  const UC = [
    ['Contact centre agent assist', 'Customer & Community', 'Real-time knowledge retrieval and call summarisation for contact centre agents.', 'Generative AI assistant / copilot', 4, 4, 'Limited', 'Partially ready', 620000, 240000, 'Assessing'],
    ['Predictive maintenance for pumps', 'Asset Management', 'Predict pump failures from telemetry and maintenance history.', 'Predictive analytics / machine learning', 5, 2, 'Limited', 'Not ready', 1400000, 650000, 'Idea'],
    ['Burst and leak detection', 'Network Operations', 'Detect leaks from pressure and flow anomalies.', 'Predictive analytics / machine learning', 5, 3, 'Minimal', 'Partially ready', 1100000, 480000, 'Pilot'],
    ['Billing exception triage', 'Customer & Community', 'Classify and resolve routine billing exceptions automatically.', 'Intelligent automation (RPA + AI)', 3, 4, 'Limited', 'Ready', 520000, 200000, 'Assessing'],
    ['Enterprise AI assistant', 'All divisions', 'Secure generative AI assistant for drafting, summarising and search.', 'Generative AI assistant / copilot', 4, 5, 'Limited', 'Partially ready', 900000, 380000, 'Pilot'],
    ['Hardship and vulnerability identification', 'Customer & Community', 'Identify customers likely to need hardship support.', 'Predictive analytics / machine learning', 4, 2, 'High', 'Not ready', 300000, 180000, 'Idea'],
    ['Water quality anomaly alerts', 'Treatment & Production', 'Early warning of water quality deviations from sensor data.', 'Predictive analytics / machine learning', 4, 3, 'High', 'Partially ready', 250000, 220000, 'Idea'],
    ['Contract and tender analysis', 'Corporate Services', 'Summarise contracts and compare tender responses.', 'Natural language processing', 3, 4, 'Limited', 'Ready', 180000, 60000, 'Idea'],
    ['Pipe condition from CCTV', 'Asset Management', 'Automated defect coding from sewer CCTV footage.', 'Computer vision', 4, 3, 'Minimal', 'Partially ready', 460000, 210000, 'Assessing'],
    ['Automated recruitment shortlisting', 'Corporate Services', 'Rank job applicants automatically.', 'Recommendation / optimisation', 2, 3, 'High', 'Partially ready', 90000, 70000, 'Idea'],
  ];
  e.ai.useCases = UC.map((u, i) => ({
    id: `UC${String(i + 1).padStart(2, '0')}`, name: u[0], area: u[1], description: u[2], aiType: u[3], value: u[4], feasibility: u[5], riskTier: u[6], dataReadiness: u[7],
    benefit: u[8], cost: u[9], status: u[10], owner: i % 2 ? 'GM Asset Management' : 'Chief Information Officer', notes: u[6] === 'High' ? 'Requires AI impact assessment and human review of every decision.' : '',
  }));
  const gStatus = ['In progress', 'Not started', 'Planned', 'Not started', 'Planned', 'Not started', 'Not started', 'Not started', 'Not started', 'Planned'];
  GUARDRAILS.forEach((g, i) => { e.ai.guardrails[g.id] = { status: gStatus[i], owner: i < 3 ? 'Chief Information Officer' : 'Chief Risk Officer', evidence: i === 0 ? 'Draft AI policy; interim accountable executive proposed' : '', notes: '' }; });
  ETHICS_PRINCIPLES.forEach((p, i) => { e.ai.ethics[p.id] = { status: i % 3 === 0 ? 'Partially addressed' : 'Not addressed', notes: '' }; });

  // Target operating model
  e.tom.vision = 'A customer-focused, digitally enabled water utility that delivers safe, reliable services at the lowest sustainable cost — organised around end-to-end value streams, supported by shared services and trusted data, and able to adopt AI safely.';
  e.tom.archetype = 'Hub-and-spoke (federated)';
  e.tom.archetypeRationale = 'Divisions retain accountability for service delivery (spokes) while common standards, platforms, data, shared services and centres of excellence sit in the hub. This balances local responsiveness in depots and plants with the consistency and scale the price path requires.';
  const canvas = {
    value: ['Residential and business customers served through phone-first channels; limited segmentation; service standards set by regulation.', 'Segmented propositions (including vulnerable customers), digital-first self-service for routine needs and proactive communication on outages.', 'Phone-first → digital-first with assisted support; reactive → proactive service'],
    processes: ['Processes owned within divisions; hand-offs between asset planning, operations and capital delivery; high manual effort.', 'Four end-to-end value streams (Customer, Asset lifecycle, Water supply, Capital delivery) with end-to-end owners and standard, automated processes.', 'Functional fragments → owned value streams; manual → automated'],
    organisation: ['Divisional structure, seven layers, average span 7.1, duplicated corporate roles.', 'Federated model: divisions aligned to value streams, Shared Services Centre and Data & AI CoE; maximum five layers; spans within benchmark.', 'Deep, duplicated structure → lean, federated structure'],
    locations: ['Under-used head office, separate contact centre, three depots, co-located data centre.', 'Consolidated hybrid head office including the contact centre; depots retained; data centre exited to cloud.', 'Historical footprint → consolidated hybrid footprint'],
    information: ['Ageing billing platform, 140+ point-to-point interfaces, poor asset data, no AI governance.', 'SaaS customer platform, integration layer, governed data platform with owners, enterprise AI assistant and AI use-case pipeline.', 'Legacy and fragmented → modern, integrated and data-driven'],
    suppliers: ['Single-source managed IT services without exit plan; supplier performance not measured.', 'Segmented supplier portfolio with performance management and tested exit plans for material providers.', 'Transactional → strategically managed suppliers'],
    management: ['Seven overlapping committees, outdated delegations, incremental budgeting, 43 concurrent projects.', 'Streamlined governance with RAPID decision rights, balanced KPIs, value-based portfolio management and benefits tracking.', 'Escalation and incremental budgeting → devolved decisions and value-based portfolio'],
  };
  for (const [k, v] of Object.entries(canvas)) e.tom.canvas[k] = { current: v[0], target: v[1], shifts: v[2] };
  for (const d of DIMENSIONS) {
    const obs = OBSERVATIONS[d.code] || [];
    e.tom.dimensions[d.code] = {
      currentSummary: obs.join(' '),
      targetDescription: '', shifts: '', principles: '', enablers: '', recs: e.recommendations.filter((x) => x.dim === d.code).map((x) => x.id).join('; '), targetOverride: '',
    };
  }
  const TS = {
    D01: ['Prioritised objectives with measures and explicit trade-offs, cascaded into divisional plans, budgets and the portfolio.', 'Broad aspirations → prioritised, measurable objectives', 'DP01; DP04', 'Strategy refresh; planning cycle redesign'],
    D02: ['Segmented customer propositions, digital-first channels for routine needs and closed-loop voice of customer.', 'Phone-first → digital-first; complaints in silos → root-cause insight', 'DP01; DP03', 'Billing platform replacement; CRM uplift'],
    D04: ['End-to-end value stream owners, standard work management across depots and automated billing exceptions.', 'Local variation → standard, automated processes', 'DP02; DP03; DP04', 'Field mobility; automation platform'],
    D06: ['Federated hub-and-spoke structure, maximum five layers, spans within benchmark, Shared Services Centre and Data & AI CoE.', 'Seven layers and duplicated roles → lean, federated structure', 'DP02; DP06', 'Consultation process; role redesign'],
    D07: ['Streamlined committee structure, refreshed delegations and a RAPID model with one decider per key decision.', 'Escalation and ambiguity → devolved, clear decisions', 'DP04', 'Risk appetite refresh; system-enforced delegations'],
    D11: ['SaaS customer platform, integration layer, cloud-first hosting and an enterprise AI assistant under AI governance.', 'Legacy, point-to-point estate → modern, integrated platforms', 'DP02; DP03', 'Integration platform; cloud landing zone; AI policy'],
    D12: ['Data owners and stewards for every domain, measured quality for critical data and AI-ready data foundations.', 'Unowned data → governed, trusted data', 'DP05', 'Data governance framework; data platform'],
    D15: ['Essential Eight maturity level 2 and critical operations mapped with tested impact tolerances.', 'IT recovery focus → tested operational resilience', 'DP07', 'Cyber uplift funding'],
    D17: ['Capacity-based portfolio prioritisation, standard change management and benefits tracked beyond project close.', '43 competing projects → a prioritised, benefits-led portfolio', 'DP04', 'Portfolio office; benefits framework'],
  };
  for (const [k, v] of Object.entries(TS)) Object.assign(e.tom.dimensions[k], { targetDescription: v[0], shifts: v[1], principles: v[2], enablers: v[3] });
  e.tom.options = [
    { id: 'OPT1', name: 'A. Optimise the current divisional model', description: 'Retain the divisional structure; refresh delegations, fix spans and layers within divisions and replace the billing system.', oneOff: 18500000, runCost: 142800000, fte: 1128, duration: 18, risk: 'Low', scores: { K1: 2, K2: 3, K3: 2, K4: 3, K5: 4, K6: 3, K7: 2 }, notes: 'Lowest disruption but leaves duplication and weak end-to-end ownership.' },
    { id: 'OPT2', name: 'B. Federated hub-and-spoke with shared services', description: 'Divisions aligned to value streams; Shared Services Centre and Data & AI CoE in the hub; RAPID decision rights; lean spans and layers.', oneOff: 27900000, runCost: 138600000, fte: 1095, duration: 30, risk: 'Medium', scores: { K1: 5, K2: 4, K3: 4, K4: 4, K5: 3, K6: 3, K7: 4 }, notes: 'Best balance of benefits and deliverability; recommended.' },
    { id: 'OPT3', name: 'C. Fully centralised functional model', description: 'Centralise all support and planning functions; divisions become pure delivery units.', oneOff: 34200000, runCost: 136900000, fte: 1072, duration: 36, risk: 'High', scores: { K1: 4, K2: 3, K3: 5, K4: 3, K5: 1, K6: 2, K7: 3 }, notes: 'Highest savings but highest delivery and people risk; weak local responsiveness.' },
  ];
  e.tom.preferredOption = 'OPT2';

  // Business case: initiatives, costs and benefits (5 financial years)
  const I = [
    ['I01', 'Corporate Shared Services Centre', 'Organisation design', 'D06; D16', 'R004', 'Consolidate transactional finance, HR and procurement into a Shared Services Centre.', 'Chief Financial Officer', 60, 540, 'Approved', 'Green'],
    ['I02', 'Customer platform & digital self-service', 'Technology', 'D02; D11', 'R005; R009', 'Replace billing with a SaaS customer platform integrated with CRM and an expanded customer portal.', 'Chief Information Officer', 120, 900, 'Proposed', 'Amber'],
    ['I03', 'Asset data & field mobility', 'Technology', 'D05; D12; D04', 'R008; R011', 'Remediate asset data, deploy EAM mobility and standardise work management across depots.', 'GM Asset Management', 30, 570, 'Approved', 'Green'],
    ['I04', 'Data governance & platform', 'Solution component', 'D12; D10', 'R007; R014', 'Data owners and stewards, data platform and automated KPI reporting.', 'Chief Information Officer', 0, 480, 'In delivery', 'Green'],
    ['I05', 'AI productivity program', 'AI use case', 'D11; D12; D17', 'R019', 'AI policy, enterprise AI assistant, contact centre agent assist and billing exception automation.', 'Chief Information Officer', 30, 600, 'Approved', 'Amber'],
    ['I06', 'Governance & decision rights reset', 'Business change', 'D07', 'R001; R002', 'Refresh delegations, streamline committees and implement RAPID decision rights.', 'Managing Director', 0, 150, 'In delivery', 'Green'],
    ['I07', 'Spans & layers restructure', 'Organisation design', 'D06; D08', 'R003; R013', 'Delayer to a maximum of five layers and widen spans to benchmark, with workforce planning.', 'Chief People Officer', 90, 450, 'Proposed', 'Amber'],
    ['I08', 'Workplace consolidation', 'Business change', 'D14', 'R016', 'Consolidate head office, relocate the contact centre and exit the co-located data centre.', 'Chief Financial Officer', 360, 900, 'Proposed', 'Green'],
    ['I09', 'Portfolio & change office', 'Business change', 'D17', 'R018', 'Strategic portfolio management, change management method and benefits framework.', 'Managing Director', 0, 360, 'In delivery', 'Green'],
  ];
  e.initiatives = I.map((x) => ({ id: x[0], name: x[1], type: x[2], dims: x[3], recs: x[4], description: x[5], owner: x[6], start: day(x[7]), end: day(x[8]), status: x[9], rag: x[10] }));
  let cl = 0, bl = 0;
  const cost = (initiativeId, description, category, costType, nature, planned, actual = []) => ({ id: `CL${String(++cl).padStart(3, '0')}`, initiativeId, description, category, costType, nature, planned, actual });
  const ben = (initiativeId, description, type, klass, kpi, baseline, target, unit, owner, confidence, status, planned, actual = []) => ({ id: `BL${String(++bl).padStart(3, '0')}`, initiativeId, description, type, class: klass, kpi, baseline, target, unit, owner, confidence, status, planned, actual });
  e.costLines = [
    cost('I01', 'Design and transition team', 'Opex', 'Contractors & consultants', 'One-off', [900000, 500000, 0, 0, 0], [640000]),
    cost('I01', 'Redundancy and redeployment costs', 'Opex', 'Redundancy & transition', 'One-off', [0, 1000000, 0, 0, 0]),
    cost('I01', 'Service management tooling', 'Opex', 'Software & licences', 'Recurring', [60000, 120000, 120000, 120000, 120000], [40000]),
    cost('I02', 'SaaS customer platform implementation', 'Capex', 'Contractors & consultants', 'One-off', [2500000, 6500000, 3000000, 0, 0]),
    cost('I02', 'Data migration and testing', 'Capex', 'Internal labour', 'One-off', [400000, 1200000, 600000, 0, 0]),
    cost('I02', 'SaaS subscription', 'Opex', 'Software & licences', 'Recurring', [0, 450000, 900000, 900000, 900000]),
    cost('I02', 'Change and training', 'Opex', 'Training & change', 'One-off', [0, 250000, 350000, 0, 0]),
    cost('I03', 'Asset data remediation', 'Opex', 'Contractors & consultants', 'One-off', [700000, 600000, 0, 0, 0], [420000]),
    cost('I03', 'EAM mobility module and devices', 'Capex', 'Hardware & infrastructure', 'One-off', [900000, 400000, 0, 0, 0], [610000]),
    cost('I03', 'Mobility licences and support', 'Opex', 'Software & licences', 'Recurring', [80000, 160000, 160000, 160000, 160000], [50000]),
    cost('I04', 'Data platform build', 'Capex', 'Cloud & hosting', 'One-off', [650000, 250000, 0, 0, 0], [520000]),
    cost('I04', 'Data platform run cost', 'Opex', 'Cloud & hosting', 'Recurring', [120000, 240000, 260000, 260000, 260000], [90000]),
    cost('I04', 'Data stewards (2 FTE)', 'Opex', 'Internal labour', 'Recurring', [150000, 300000, 300000, 300000, 300000], [110000]),
    cost('I05', 'AI policy, governance and impact assessments', 'Opex', 'Contractors & consultants', 'One-off', [180000, 60000, 0, 0, 0], [150000]),
    cost('I05', 'Enterprise AI assistant licences', 'Opex', 'Software & licences', 'Recurring', [220000, 380000, 420000, 450000, 450000], [90000]),
    cost('I05', 'Agent assist and automation build', 'Capex', 'Contractors & consultants', 'One-off', [350000, 300000, 0, 0, 0]),
    cost('I05', 'AI literacy training', 'Opex', 'Training & change', 'One-off', [120000, 80000, 0, 0, 0], [60000]),
    cost('I06', 'Decision rights design and delegations refresh', 'Opex', 'Contractors & consultants', 'One-off', [100000, 0, 0, 0, 0], [85000]),
    cost('I07', 'Organisation design and consultation', 'Opex', 'Contractors & consultants', 'One-off', [300000, 150000, 0, 0, 0]),
    cost('I07', 'Voluntary separation program', 'Opex', 'Redundancy & transition', 'One-off', [0, 1800000, 0, 0, 0]),
    cost('I08', 'Fit-out and relocation', 'Capex', 'Property & facilities', 'One-off', [0, 1100000, 300000, 0, 0]),
    cost('I08', 'Data centre exit and cloud migration', 'Capex', 'Cloud & hosting', 'One-off', [0, 600000, 200000, 0, 0]),
    cost('I09', 'Portfolio office (3 FTE) and tooling', 'Opex', 'Internal labour', 'Recurring', [260000, 420000, 420000, 420000, 420000], [190000]),
  ];
  e.benefitLines = [
    ben('I01', 'Removal of duplicated transactional roles', 'Cost reduction', 'Cashable', 'Corporate services cost', 13100000, 9400000, '$ per year', 'Chief Financial Officer', 85, 'On track', [0, 1400000, 3100000, 3400000, 3400000], [0]),
    ben('I01', 'Faster month-end close', 'Productivity (time released)', 'Non-cashable', 'Days to close', 12, 5, 'days', 'Chief Financial Officer', 70, 'Not started', [0, 80000, 160000, 160000, 160000]),
    ben('I02', 'Reduced contact centre volumes through self-service', 'Cost reduction', 'Cashable', 'Calls per year', 410000, 300000, 'calls', 'GM Customer & Community', 70, 'Not started', [0, 0, 900000, 1500000, 1600000]),
    ben('I02', 'Legacy billing licences and support retired', 'Cost reduction', 'Cashable', 'Billing platform run cost', 1450000, 0, '$ per year', 'Chief Information Officer', 90, 'Not started', [0, 0, 700000, 1450000, 1450000]),
    ben('I02', 'Avoided extended support and remediation of legacy billing', 'Cost avoidance', 'Cashable', 'Avoided cost', '', '', '$', 'Chief Information Officer', 80, 'Not started', [0, 600000, 900000, 900000, 900000]),
    ben('I02', 'Customer satisfaction (digital channels)', 'Customer experience', 'Non-financial', 'Customer satisfaction score', 68, 80, 'CSAT', 'GM Customer & Community', 60, 'Not started', [0, 0, 0, 0, 0]),
    ben('I03', 'Reduced reactive maintenance', 'Cost reduction', 'Cashable', 'Reactive share of work orders', 58, 40, '%', 'GM Network Operations', 65, 'On track', [0, 900000, 1800000, 2200000, 2200000], [120000]),
    ben('I03', 'Crew time released from paperwork', 'Productivity (time released)', 'Non-cashable', 'Hours per crew per week', 5, 1.5, 'hours', 'GM Network Operations', 75, 'On track', [150000, 450000, 600000, 600000, 600000], [90000]),
    ben('I03', 'Deferred capital from condition-based renewals', 'Cost avoidance', 'Cashable', 'Deferred capex', '', '', '$', 'GM Asset Management', 60, 'Not started', [0, 500000, 1500000, 2000000, 2000000]),
    ben('I04', 'Automated management reporting', 'Productivity (time released)', 'Non-cashable', 'Days to produce monthly pack', 8, 2, 'days', 'Chief Financial Officer', 85, 'On track', [60000, 180000, 180000, 180000, 180000], [45000]),
    ben('I04', 'Single trusted customer count', 'Compliance', 'Non-financial', 'Regulatory reporting errors', 6, 0, 'errors per year', 'Chief Information Officer', 80, 'On track', [0, 0, 0, 0, 0]),
    ben('I05', 'Contact centre handle time reduced by agent assist', 'Productivity (time released)', 'Non-cashable', 'Average handle time', 420, 340, 'seconds', 'GM Customer & Community', 60, 'Not started', [0, 380000, 520000, 520000, 520000]),
    ben('I05', 'Billing exceptions automated', 'Cost reduction', 'Cashable', 'Manual exceptions per month', 4000, 1200, 'exceptions', 'GM Customer & Community', 70, 'Not started', [0, 420000, 560000, 560000, 560000]),
    ben('I05', 'Staff productivity from enterprise AI assistant', 'Productivity (time released)', 'Non-cashable', 'Hours saved per user per week', 0, 2, 'hours', 'Chief Information Officer', 50, 'Not started', [150000, 600000, 900000, 1000000, 1000000], [40000]),
    ben('I05', 'Reduced shadow AI and data leakage risk', 'Risk reduction', 'Non-financial', 'Staff using unapproved AI tools', 180, 10, 'staff', 'Chief Risk Officer', 70, 'On track', [0, 0, 0, 0, 0]),
    ben('I06', 'Executive time released from low-value decisions', 'Productivity (time released)', 'Non-cashable', 'ExCo agenda items per month', 64, 30, 'items', 'Managing Director', 80, 'On track', [80000, 160000, 160000, 160000, 160000], [60000]),
    ben('I07', 'Management cost reduction from delayering', 'Cost reduction', 'Cashable', 'People managers', 146, 115, 'managers', 'Chief People Officer', 75, 'Not started', [0, 1200000, 3000000, 3100000, 3100000]),
    ben('I08', 'Property cost savings', 'Cost reduction', 'Cashable', 'Annual property cost', 9150000, 7700000, '$ per year', 'Chief Financial Officer', 85, 'Not started', [0, 300000, 1100000, 1450000, 1450000]),
    ben('I09', 'Improved delivery performance', 'Cost avoidance', 'Cashable', 'Projects delivered within tolerance', 45, 75, '%', 'Managing Director', 55, 'On track', [100000, 600000, 900000, 900000, 900000], [50000]),
  ];

  // Transition risks
  const RK = [
    ['Industrial relations dispute during restructure consultation', 'People & culture', 'Transition', 'D06', 'Enterprise agreement consultation obligations', 'Delays and reputational damage', 4, 4, 2, 3, 'Early union engagement; transparent consultation; no forced redundancies commitment', 'Chief People Officer', 'Mitigating', 'I07'],
    ['Customer platform delivery overruns time and budget', 'Delivery / transition', 'Transition', 'D11', 'Complex data migration and customisation', 'Cost overrun; delayed benefits; extended legacy support', 4, 5, 3, 4, 'Configure not customise; independent assurance; staged migration; contingency', 'Chief Information Officer', 'Open', 'I02'],
    ['Loss of key knowledge during delayering', 'People & culture', 'Transition', 'D08', 'Experienced managers leave', 'Operational and safety incidents', 3, 4, 2, 3, 'Knowledge capture; succession plans; retention arrangements for critical roles', 'Chief People Officer', 'Open', 'I07'],
    ['Service disruption during shared services transition', 'Operational', 'Transition', 'D06', 'Process and system changes', 'Late payments; payroll errors', 3, 4, 2, 2, 'Parallel run; hypercare; service catalogue and SLAs agreed before cutover', 'Chief Financial Officer', 'Open', 'I01'],
    ['Change saturation in operational teams', 'People & culture', 'Transition', 'D17', 'Concurrent restructure, systems and process change', 'Low adoption; benefits not realised', 4, 3, 3, 2, 'Portfolio sequencing against change capacity; change heat map; stop low-value projects', 'Managing Director', 'Mitigating', 'I09'],
    ['AI assistant exposes confidential information', 'Data & privacy', 'Target state', 'D12', 'Weak access controls and data classification', 'Privacy breach; regulatory action', 3, 5, 1, 4, 'AI policy; data classification; tenant-restricted AI; DLP; privacy impact assessment', 'Chief Information Officer', 'Mitigating', 'I05'],
    ['Benefits overstated or not tracked', 'Benefits realisation', 'Target state', 'D17', 'No baselines or owners', 'Business case not delivered', 3, 4, 2, 2, 'Benefits framework; baselines; owners; quarterly tracking', 'Chief Financial Officer', 'Open', 'I09'],
    ['Asset data remediation takes longer than planned', 'Data & privacy', 'Transition', 'D12', 'Scale of data gaps', 'Predictive maintenance delayed', 4, 3, 3, 2, 'Prioritise critical assets; capture data through field mobility', 'GM Asset Management', 'Open', 'I03'],
    ['Cyber incident during system transition', 'Cyber security', 'Transition', 'D15', 'Temporary integrations and elevated access', 'Service outage; data breach', 3, 5, 2, 4, 'Security by design; Essential Eight uplift; penetration testing before go-live', 'Chief Information Officer', 'Open', 'I02'],
    ['Digital channels exclude vulnerable customers', 'Reputation', 'Target state', 'D02', 'Digital-first design', 'Complaints; regulatory scrutiny', 2, 4, 1, 3, 'Assisted channels retained; accessibility (WCAG 2.2) and inclusion testing', 'GM Customer & Community', 'Open', 'I02'],
    ['Shared services does not meet business expectations', 'Operational', 'Target state', 'D06', 'Low trust in central services', 'Shadow roles re-emerge in divisions', 3, 3, 2, 2, 'Service catalogue, SLAs and customer forums; governance of shadow roles', 'Chief Financial Officer', 'Open', 'I01'],
    ['Managed IT provider disputes exit arrangements', 'Supplier', 'Transition', 'D13', 'No contractual exit plan', 'Transition delays; higher cost', 3, 4, 2, 3, 'Negotiate exit plan into renewal; knowledge transfer obligations', 'Chief Information Officer', 'Open', ''],
  ];
  e.risks = RK.map((x, i) => ({
    id: `RK${String(i + 1).padStart(2, '0')}`, title: x[0], category: x[1], stage: x[2], dim: x[3], cause: x[4], consequence: x[5], likelihood: x[6], impact: x[7],
    residualLikelihood: x[8], residualImpact: x[9], mitigation: x[10], owner: x[11], status: x[12], initiative: x[13],
  }));

  // Implementation requirements
  const RQ = [
    ['D06', 'Organisation & roles', 'Detailed design of the Shared Services Centre: service catalogue, roles, SLAs and location', 'I01', 'Must have', '0–3 months', 'Chief Financial Officer', 'In progress'],
    ['D06', 'People & skills', 'Consultation plan and change proposal under the enterprise agreement', 'I07', 'Must have', '0–3 months', 'Chief People Officer', 'Not started'],
    ['D06', 'Organisation & roles', 'Role descriptions and capability profiles for new and changed roles (about 180 roles)', 'I07', 'Must have', '3–12 months', 'Chief People Officer', 'Not started'],
    ['D07', 'Governance & decision rights', 'Updated delegations of authority configured in the ERP workflow', 'I06', 'Must have', '0–3 months', 'Chief Financial Officer', 'In progress'],
    ['D07', 'Governance & decision rights', 'RAPID decision rights agreed by the executive for the 21 key decisions', 'I06', 'Must have', '0–3 months', 'Managing Director', 'In progress'],
    ['D11', 'Technology & applications', 'Integration platform and API standards before customer platform build', 'I02', 'Must have', '3–12 months', 'Chief Information Officer', 'Not started'],
    ['D11', 'Technology & applications', 'Cloud landing zone with security controls for SaaS and data platform', 'I04', 'Must have', '0–3 months', 'Chief Information Officer', 'In progress'],
    ['D12', 'Data & information', 'Data owners and stewards appointed for customer, asset, finance and people domains', 'I04', 'Must have', '0–3 months', 'Chief Information Officer', 'In progress'],
    ['D12', 'Data & information', 'Customer data cleansing and migration strategy', 'I02', 'Must have', '3–12 months', 'GM Customer & Community', 'Not started'],
    ['D12', 'Data & information', 'Asset condition data standard and field capture rules', 'I03', 'Must have', '0–3 months', 'GM Asset Management', 'In progress'],
    ['D04', 'Process', 'Standard work management process across three depots', 'I03', 'Must have', '3–12 months', 'GM Network Operations', 'Not started'],
    ['D04', 'Process', 'Redesigned customer journeys for the top ten contact reasons', 'I02', 'Should have', '3–12 months', 'GM Customer & Community', 'Not started'],
    ['D08', 'People & skills', 'AI literacy training for all staff; specialist training for the Data & AI CoE', 'I05', 'Must have', '0–3 months', 'Chief People Officer', 'Not started'],
    ['D08', 'People & skills', 'Strategic workforce plan and succession for critical operational roles', 'I07', 'Should have', '0–3 months', 'Chief People Officer', 'In progress'],
    ['D15', 'Policy & compliance', 'AI policy, acceptable-use standard and AI impact assessment process', 'I05', 'Must have', '0–3 months', 'Chief Risk Officer', 'In progress'],
    ['D15', 'Policy & compliance', 'Privacy impact assessments for customer platform and AI assistant', 'I05', 'Must have', '0–3 months', 'Chief Risk Officer', 'Not started'],
    ['D14', 'Facilities & locations', 'Head office fit-out design for consolidated hybrid workplace and contact centre', 'I08', 'Should have', '12–24 months', 'Chief Financial Officer', 'Not started'],
    ['D13', 'Suppliers & partners', 'Tested exit plan for the managed IT services contract', '', 'Must have', '0–3 months', 'Chief Information Officer', 'Not started'],
    ['D13', 'Suppliers & partners', 'Implementation partner for the customer platform (open tender)', 'I02', 'Must have', '3–12 months', 'Procurement Manager', 'Not started'],
    ['D16', 'Funding & finance', 'Board approval of the TOM business case and funding envelope', '', 'Must have', '0–3 months', 'Chief Financial Officer', 'Not started'],
    ['D16', 'Funding & finance', 'Benefits baselines and owners for every initiative', 'I09', 'Must have', '0–3 months', 'Chief Financial Officer', 'In progress'],
    ['D17', 'Governance & decision rights', 'Transformation governance: steering committee, design authority and portfolio office', 'I09', 'Must have', '0–3 months', 'Managing Director', 'In progress'],
    ['D10', 'Data & information', 'Balanced KPI framework and automated executive dashboard', 'I04', 'Should have', '3–12 months', 'Chief Financial Officer', 'Not started'],
    ['D02', 'Process', 'Vulnerable customer identification and support process', 'I02', 'Should have', '3–12 months', 'GM Customer & Community', 'Not started'],
  ];
  e.requirements = RQ.map((x, i) => ({ id: `IR${String(i + 1).padStart(3, '0')}`, dim: x[0], category: x[1], requirement: x[2], initiative: x[3], priority: x[4], horizon: x[5], owner: x[6], status: x[7], notes: '' }));

  // Change impact assessment (0 none – 3 high) and ADKAR readiness (1–5)
  const CI = [
    ['Contact centre and billing staff', 130, [3, 3, 2, 3, 1, 3, 2, 2], [4, 3, 2, 2, 2]],
    ['Field crews and depot staff', 420, [3, 3, 1, 2, 1, 0, 2, 2], [3, 2, 2, 2, 2]],
    ['Treatment plant operators', 140, [1, 1, 0, 1, 0, 0, 1, 1], [3, 3, 3, 3, 3]],
    ['Asset planners and engineers', 110, [2, 3, 2, 2, 1, 0, 2, 2], [4, 4, 3, 2, 2]],
    ['Corporate services staff', 140, [3, 2, 3, 2, 3, 2, 2, 2], [3, 2, 2, 2, 2]],
    ['Technology & Digital staff', 125, [2, 3, 2, 3, 2, 0, 2, 2], [4, 3, 3, 2, 2]],
    ['People leaders (team leaders and managers)', 146, [2, 2, 3, 2, 3, 1, 3, 3], [3, 2, 2, 2, 1]],
    ['Executive leadership team', 9, [1, 1, 2, 1, 2, 0, 3, 2], [4, 4, 3, 3, 2]],
    ['Capital delivery teams', 114, [2, 1, 1, 1, 1, 0, 1, 1], [3, 3, 3, 3, 3]],
    ['Customers', 62000, [2, 3, 0, 1, 0, 0, 0, 0], [2, 3, 2, 3, 3]],
  ];
  const areas = ['process', 'systems', 'roles', 'skills', 'structure', 'location', 'culture', 'measures'];
  e.changeImpacts = CI.map((x, i) => ({
    id: `CI${String(i + 1).padStart(2, '0')}`, group: x[0], headcount: x[1],
    ...Object.fromEntries(areas.map((a, k) => [a, x[2][k]])),
    awareness: x[3][0], desire: x[3][1], knowledge: x[3][2], ability: x[3][3], reinforcement: x[3][4],
    notes: i === 6 ? 'People leaders are both highly impacted and critical change agents; prioritise their readiness.' : '',
  }));
  const CA = [
    ['Managing Director case-for-change roadshow at every site', 'Sponsorship', 'All staff', '0–3 months', 'Managing Director', 'Complete'],
    ['Leader briefing packs and FAQs for each wave', 'Communication', 'People leaders', '0–3 months', 'Change lead', 'In progress'],
    ['Change champion network (one per team)', 'Engagement', 'All staff', '0–3 months', 'Change lead', 'In progress'],
    ['Union and staff consultation forums', 'Engagement', 'Affected staff', '0–3 months', 'Chief People Officer', 'Planned'],
    ['Leading through change program for people leaders', 'Coaching', 'People leaders', '3–12 months', 'Chief People Officer', 'Planned'],
    ['Customer platform role-based training and sandbox', 'Training', 'Contact centre and billing staff', '12–24 months', 'Change lead', 'Planned'],
    ['Field mobility training, super-users and floor-walkers', 'Training', 'Field crews and depot staff', '3–12 months', 'GM Network Operations', 'Planned'],
    ['AI literacy and safe-use training', 'Training', 'All staff', '0–3 months', 'Chief People Officer', 'Planned'],
    ['Shared services service catalogue launch and customer forum', 'Communication', 'All managers', '3–12 months', 'Chief Financial Officer', 'Planned'],
    ['Resistance management plans for high-impact groups', 'Resistance management', 'Corporate services; people leaders', '3–12 months', 'Change lead', 'Planned'],
    ['Adoption dashboards and recognition of early adopters', 'Reinforcement', 'All staff', '3–12 months', 'Change lead', 'Planned'],
    ['Customer communications on new digital services', 'Communication', 'Customers', '12–24 months', 'GM Customer & Community', 'Planned'],
  ];
  e.changeActivities = CA.map((x, i) => ({ id: `CA${String(i + 1).padStart(2, '0')}`, activity: x[0], type: x[1], audience: x[2], timing: x[3], owner: x[4], status: x[5] }));

  e.settings = { ...e.settings, startYear: new Date().getMonth() >= 6 ? new Date().getFullYear() : new Date().getFullYear() - 1 };
  e.id = uid();
  return e;
}
